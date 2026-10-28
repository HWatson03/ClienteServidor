package org.servidor.personal.clienteservidor.transferencias.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.servidor.personal.clienteservidor.transferencias.infraestructura.CargaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CargaService {

    private final CargaRepository cargaRepository;
    private final UsuarioRepository usuarioRepository;
    private final CarpetaRepository carpetaRepository;
    private final ArchivoRepository archivoRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final AlmacenamientoService almacenamientoService;

    @Transactional
    public Carga iniciar(String nombreUsuario, Long carpetaDestinoId, String nombreArchivo, long tamanoEsperado) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carpeta destino = obtenerCarpetaPropia(usuario, carpetaDestinoId);
        if (tamanoEsperado < 0) throw new IllegalArgumentException("Tamaño inválido");
        
        synchronized (("cuota:" + usuario.getIdUsuario()).intern()) {
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario)
                    .orElseThrow(() -> new IllegalStateException("Cuota no encontrada"));
            if (cuota.getBytesOcupados() + cuota.getBytesReservados() + tamanoEsperado > usuario.getCuotaMaxBytes()) {
                throw new IllegalArgumentException("Cuota insuficiente");
            }
            cuota.setBytesReservados(cuota.getBytesReservados() + tamanoEsperado);
            cuotaUsuarioRepository.save(cuota);
        }
        
        Carga carga = new Carga();
        carga.setUsuario(usuario);
        carga.setCarpetaDestino(destino);
        carga.setNombreArchivo(nombreArchivo);
        carga.setTamanoEsperado(tamanoEsperado);
        carga.setOffsetConfirmado(0L);
        carga.setClaveTemporal(UUID.randomUUID().toString());
        carga.setEstado("INICIADA");
        carga.setExpiraEn(LocalDateTime.now().plusDays(7));
        carga.setEstado("ACTIVO");
        return cargaRepository.save(carga);
    }

    @Transactional(readOnly = true)
    public Carga consultar(String nombreUsuario, Long cargaId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carga carga = cargaRepository.findById(cargaId).orElseThrow(() -> new IllegalArgumentException("Carga no encontrada"));
        if (!carga.getUsuario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        return carga;
    }

    @Transactional
    public void subirFragmento(String nombreUsuario, Long cargaId, long offset, InputStream input) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carga carga = cargaRepository.findById(cargaId).orElseThrow(() -> new IllegalArgumentException("Carga no encontrada"));
        if (!carga.getUsuario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        if ("FINALIZADA".equals(carga.getEstado())) return;
        if ("EXPIRADA".equals(carga.getEstado())) throw new IllegalStateException("Carga expirada");
        if (offset != carga.getOffsetConfirmado()) throw new IllegalArgumentException("Offset incompatible");
        if (offset > carga.getTamanoEsperado()) throw new IllegalArgumentException("Offset inválido");
        try {
            almacenamientoService.guardarTemporal(carga.getClaveTemporal(), input, offset, carga.getTamanoEsperado());
            long tamanoActual = Files.exists(almacenamientoService.obtenerTemporal(carga.getClaveTemporal())) 
                    ? Files.size(almacenamientoService.obtenerTemporal(carga.getClaveTemporal())) : 0;
            carga.setOffsetConfirmado(tamanoActual);
            cargaRepository.save(carga);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalStateException("Error al guardar fragmento", e);
        }
    }

    @Transactional
    public Archivo finalizar(String nombreUsuario, Long cargaId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carga carga = cargaRepository.findById(cargaId).orElseThrow(() -> new IllegalArgumentException("Carga no encontrada"));
        if (!carga.getUsuario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        if ("EXPIRADA".equals(carga.getEstado())) throw new IllegalStateException("Carga expirada");
        if ("FINALIZADA".equals(carga.getEstado())) {
            return archivoRepository.findByPropietarioAndNombreVisibleAndTamano(usuario, carga.getNombreArchivo(), carga.getTamanoEsperado())
                    .orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
        }
        if (carga.getOffsetConfirmado() != carga.getTamanoEsperado()) {
            throw new IllegalArgumentException("Carga incompleta");
        }
        try {
            String claveFinal = UUID.randomUUID().toString();
            almacenamientoService.moverAFinal(carga.getClaveTemporal(), claveFinal);
            Archivo archivo = new Archivo();
            archivo.setPropietario(usuario);
            archivo.setCarpeta(carga.getCarpetaDestino());
            archivo.setNombreVisible(carga.getNombreArchivo());
            archivo.setClaveDisco(claveFinal);
            archivo.setTamano(carga.getTamanoEsperado());
            archivo.setEnPapelera(false);
            archivo.setEstado("ACTIVO");
            archivoRepository.save(archivo);
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario).orElseThrow();
            cuota.setBytesReservados(cuota.getBytesReservados() - carga.getTamanoEsperado());
            cuota.setBytesOcupados(cuota.getBytesOcupados() + carga.getTamanoEsperado());
            cuotaUsuarioRepository.save(cuota);
            carga.setEstado("FINALIZADA");
            cargaRepository.save(carga);
            return archivo;
        } catch (Exception e) {
            throw new IllegalStateException("Error al finalizar carga", e);
        }
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
