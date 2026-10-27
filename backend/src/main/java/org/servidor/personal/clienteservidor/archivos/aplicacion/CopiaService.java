package org.servidor.personal.clienteservidor.archivos.aplicacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.servidor.personal.clienteservidor.transferencias.dominio.TareaCopia;
import org.servidor.personal.clienteservidor.transferencias.infraestructura.TareaCopiaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CopiaService {

    private final TareaCopiaRepository tareaCopiaRepository;
    private final ArchivoRepository archivoRepository;
    private final CarpetaRepository carpetaRepository;
    private final UsuarioRepository usuarioRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final AlmacenamientoService almacenamientoService;

    @Transactional
    public TareaCopia copiarArchivo(String nombreUsuario, Long archivoId, Long carpetaDestinoId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Archivo origen = archivoRepository.findById(archivoId).orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
        if (!origen.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        Carpeta destino = obtenerCarpetaPropia(usuario, carpetaDestinoId);

        synchronized (("cuota:" + usuario.getIdUsuario()).intern()) {
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario).orElseThrow();
            if (cuota.getBytesOcupados() + cuota.getBytesReservados() + origen.getTamano() > usuario.getCuotaMaxBytes()) {
                throw new IllegalArgumentException("Cuota insuficiente");
            }
            cuota.setBytesReservados(cuota.getBytesReservados() + origen.getTamano());
            cuotaUsuarioRepository.save(cuota);
        }

        TareaCopia tarea = new TareaCopia();
        tarea.setPropietario(usuario);
        tarea.setArchivoOrigen(origen);
        tarea.setCarpetaDestino(destino);
        tarea.setTotalBytes(origen.getTamano());
        tarea.setBytesCopiados(0L);
        tarea.setEstado("EN_PROCESO");
        tareaCopiaRepository.save(tarea);

        try {
            String claveFinal = UUID.randomUUID().toString();
            java.nio.file.Files.copy(almacenamientoService.obtenerTemporal(origen.getClaveDisco()), almacenamientoService.obtenerTemporal(claveFinal));
        } catch (Exception e) {
            tarea.setEstado("FALLIDO");
            tarea.setError(e.getMessage());
            tareaCopiaRepository.save(tarea);
            throw new IllegalStateException("Error al copiar archivo", e);
        }

        Archivo copia = new Archivo();
        copia.setPropietario(usuario);
        copia.setCarpeta(destino);
        copia.setNombreVisible(origen.getNombreVisible());
        copia.setClaveDisco(UUID.randomUUID().toString());
        copia.setTamano(origen.getTamano());
        copia.setTipoMime(origen.getTipoMime());
        copia.setEnPapelera(false);
        copia.setEstado("ACTIVO");
        archivoRepository.save(copia);

        synchronized (("cuota:" + usuario.getIdUsuario()).intern()) {
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario).orElseThrow();
            cuota.setBytesReservados(cuota.getBytesReservados() - origen.getTamano());
            cuota.setBytesOcupados(cuota.getBytesOcupados() + origen.getTamano());
            cuotaUsuarioRepository.save(cuota);
        }

        tarea.setBytesCopiados(origen.getTamano());
        tarea.setEstado("COMPLETADO");
        tareaCopiaRepository.save(tarea);
        return tarea;
    }

    @Transactional(readOnly = true)
    public TareaCopia consultar(String nombreUsuario, Long tareaId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        TareaCopia tarea = tareaCopiaRepository.findById(tareaId).orElseThrow(() -> new IllegalArgumentException("Tarea no encontrada"));
        if (!tarea.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        return tarea;
    }

    private Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    private Carpeta obtenerCarpetaPropia(Usuario usuario, Long carpetaId) {
        Carpeta carpeta = carpetaRepository.findById(carpetaId).orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
        if (!carpeta.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        return carpeta;
    }
}
