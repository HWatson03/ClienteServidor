package org.servidor.personal.clienteservidor.archivos.aplicacion;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PapeleraService {

    private final ArchivoRepository archivoRepository;
    private final CarpetaRepository carpetaRepository;
    private final UsuarioRepository usuarioRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final AlmacenamientoService almacenamientoService;

    @Transactional
    public void enviarArchivoAPapelera(String nombreUsuario, Long archivoId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Archivo archivo = archivoRepository.findById(archivoId).orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
        if (!archivo.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
        String grupo = UUID.randomUUID().toString();
        archivo.setEnPapelera(true);
        archivo.setGrupoEliminacion(grupo);
        archivo.setEliminadoEn(LocalDateTime.now());
        archivoRepository.save(archivo);
    }

    @Transactional
    public String restaurar(String nombreUsuario, String tipo, Long id) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        if ("archivo".equals(tipo)) {
            Archivo archivo = archivoRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
            if (!archivo.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
            if (!archivo.isEnPapelera()) throw new IllegalArgumentException("El archivo no está en la papelera");
            if (archivo.getCarpeta() != null && archivo.getCarpeta().isEnPapelera()) {
                throw new IllegalArgumentException("Primero restaura la carpeta que contiene este archivo");
            }
            archivo.setNombreVisible(resolverNombreArchivo(usuario, archivo));
            archivo.setEnPapelera(false);
            archivo.setGrupoEliminacion(null);
            archivo.setEliminadoEn(null);
            archivoRepository.save(archivo);
            return archivo.getNombreVisible();
        } else if ("carpeta".equals(tipo)) {
            Carpeta carpeta = carpetaRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
            if (!carpeta.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
            if (!carpeta.isEnPapelera()) throw new IllegalArgumentException("La carpeta no está en la papelera");
            if (carpeta.getPadre() != null && carpeta.getPadre().isEnPapelera()) {
                throw new IllegalArgumentException("Primero restaura la carpeta superior");
            }
            carpeta.setNombre(resolverNombreCarpeta(usuario, carpeta));
            carpeta.setEnPapelera(false);
            carpeta.setGrupoEliminacion(null);
            carpeta.setEliminadoEn(null);
            carpetaRepository.save(carpeta);
            return carpeta.getNombre();
        } else {
            throw new IllegalArgumentException("Tipo de elemento no válido");
        }
    }

    private String resolverNombreArchivo(Usuario usuario, Archivo archivo) {
        String nombre = archivo.getNombreVisible().trim();
        if (!archivoRepository.existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(
                usuario, archivo.getCarpeta(), nombre)) return nombre;
        int contador = 1;
        while (archivoRepository.existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(
                usuario, archivo.getCarpeta(), "(" + contador + ") " + nombre)) {
            contador++;
        }
        return "(" + contador + ") " + nombre;
    }

    private String resolverNombreCarpeta(Usuario usuario, Carpeta carpeta) {
        String nombre = carpeta.getNombre().trim();
        if (!carpetaRepository.existsByPropietarioAndPadreAndNombreIgnoreCaseAndEnPapeleraFalse(
                usuario, carpeta.getPadre(), nombre)) return nombre;
        int contador = 1;
        while (carpetaRepository.existsByPropietarioAndPadreAndNombreIgnoreCaseAndEnPapeleraFalse(
                usuario, carpeta.getPadre(), "(" + contador + ") " + nombre)) {
            contador++;
        }
        return "(" + contador + ") " + nombre;
    }

    @Transactional
    public void eliminarDefinitivamente(String nombreUsuario, String tipo, Long id) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        if ("archivo".equals(tipo)) {
            Archivo archivo = archivoRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
            if (!archivo.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
            if (!archivo.isEnPapelera()) throw new IllegalArgumentException("El archivo no está en la papelera");
            boolean eliminado = almacenamientoService.eliminarPorClave(archivo.getClaveDisco());
            if (!eliminado) {
                throw new IllegalStateException("No se pudo eliminar el archivo del disco: " + archivo.getClaveDisco());
            }
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario).orElseThrow();
            cuota.setBytesOcupados(Math.max(0, cuota.getBytesOcupados() - archivo.getTamano()));
            cuotaUsuarioRepository.save(cuota);
            archivoRepository.delete(archivo);
        } else if ("carpeta".equals(tipo)) {
            Carpeta carpeta = carpetaRepository.findById(id).orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
            if (!carpeta.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) throw new SecurityException("Recurso no accesible");
            if (!carpeta.isEnPapelera()) throw new IllegalArgumentException("La carpeta no está en la papelera");
            if (Boolean.TRUE.equals(carpeta.isEsRaiz())) throw new IllegalArgumentException("No se puede eliminar la carpeta raíz");
            // Recursively delete all files and subfolders
            long bytesLiberados = eliminarCarpetaRecursiva(carpeta, usuario);
            CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario).orElseThrow();
            cuota.setBytesOcupados(Math.max(0, cuota.getBytesOcupados() - bytesLiberados));
            cuotaUsuarioRepository.save(cuota);
            carpetaRepository.delete(carpeta);
        }
    }

    private long eliminarCarpetaRecursiva(Carpeta carpeta, Usuario usuario) {
        long bytes = 0;
        // Delete files in this folder
        List<Archivo> archivos = archivoRepository.findByCarpeta(carpeta);
        for (Archivo a : archivos) {
            bytes += a.getTamano() != null ? a.getTamano() : 0;
            boolean eliminado = almacenamientoService.eliminarPorClave(a.getClaveDisco());
            if (!eliminado) {
                throw new IllegalStateException("No se pudo eliminar el archivo del disco: " + a.getClaveDisco());
            }
            archivoRepository.delete(a);
        }
        // Recurse into subfolders
        List<Carpeta> subcarpetas = carpetaRepository.findByPadre(carpeta);
        for (Carpeta sub : subcarpetas) {
            bytes += eliminarCarpetaRecursiva(sub, usuario);
            carpetaRepository.delete(sub);
        }
        return bytes;
    }

    private Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }
}
