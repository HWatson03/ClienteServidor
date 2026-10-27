package org.servidor.personal.clienteservidor.archivos.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
public class ArchivoService {

    private final ArchivoRepository archivoRepository;
    private final CarpetaRepository carpetaRepository;
    private final UsuarioRepository usuarioRepository;

    public ArchivoService(ArchivoRepository archivoRepository, CarpetaRepository carpetaRepository, UsuarioRepository usuarioRepository) {
        this.archivoRepository = archivoRepository;
        this.carpetaRepository = carpetaRepository;
        this.usuarioRepository = usuarioRepository;
    }

    @Transactional(readOnly = true)
    public Page<Archivo> listar(String nombreUsuario, UUID carpetaId, String nombre, int pagina, int tamano) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        if (nombre != null && !nombre.isBlank()) {
            return archivoRepository.buscarPorNombre(usuario, nombre.trim(), PageRequest.of(pagina, Math.min(tamano, 200)));
        }
        Carpeta padre = carpetaId == null ? obtenerRaiz(usuario) : obtenerCarpetaPropia(usuario, carpetaId);
        return archivoRepository.findByPropietarioAndCarpetaAndEnPapeleraFalse(usuario, padre, PageRequest.of(pagina, Math.min(tamano, 200)));
    }

    @Transactional
    public void renombrar(String nombreUsuario, UUID archivoId, String nuevoNombre) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Archivo archivo = obtenerArchivoPropio(usuario, archivoId);
        String nombreFinal = resolverNombreUnico(usuario, archivo.getCarpeta(), nuevoNombre);
        archivo.setNombreVisible(nombreFinal);
        archivoRepository.save(archivo);
    }

    private String resolverNombreUnico(Usuario usuario, Carpeta carpeta, String nombreBase) {
        String nombre = nombreBase.trim();
        if (!archivoRepository.existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(usuario, carpeta, nombre)) {
            return nombre;
        }
        int contador = 1;
        while (true) {
            String candidato = "(" + contador + ") " + nombre;
            if (!archivoRepository.existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(usuario, carpeta, candidato)) {
                return candidato;
            }
            contador++;
        }
    }

    private Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    private Carpeta obtenerRaiz(Usuario usuario) {
        return carpetaRepository.findByPropietarioAndEsRaizTrue(usuario)
                .orElseThrow(() -> new IllegalStateException("Raíz no encontrada"));
    }

    private Carpeta obtenerCarpetaPropia(Usuario usuario, UUID carpetaId) {
        Carpeta carpeta = carpetaRepository.findById(carpetaId).orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
        if (!carpeta.getPropietario().getId().equals(usuario.getId())) {
            throw new SecurityException("Recurso no accesible");
        }
        return carpeta;
    }

    private Archivo obtenerArchivoPropio(Usuario usuario, UUID archivoId) {
        Archivo archivo = archivoRepository.findById(archivoId).orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
        if (!archivo.getPropietario().getId().equals(usuario.getId())) {
            throw new SecurityException("Recurso no accesible");
        }
        return archivo;
    }
}
