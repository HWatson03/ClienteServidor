package org.servidor.personal.clienteservidor.archivos.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CarpetaService {

    private final CarpetaRepository carpetaRepository;
    private final UsuarioRepository usuarioRepository;



    @Transactional(readOnly = true)
    public Carpeta obtenerRaiz(String nombreUsuario) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        return carpetaRepository.findByPropietarioAndEsRaizTrue(usuario)
                .orElseThrow(() -> new IllegalStateException("Raíz no encontrada"));
    }

    @Transactional(readOnly = true)
    public List<Carpeta> listarCarpetas(String nombreUsuario, Long carpetaId) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carpeta padre = carpetaId == null ? obtenerRaiz(nombreUsuario) : obtenerCarpetaPropia(usuario, carpetaId);
        return carpetaRepository.findByPropietarioAndPadreAndEnPapeleraFalse(usuario, padre);
    }

    @Transactional
    public Carpeta crearCarpeta(String nombreUsuario, Long carpetaPadreId, String nombre) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        Carpeta padre = carpetaPadreId == null ? obtenerRaiz(nombreUsuario) : obtenerCarpetaPropia(usuario, carpetaPadreId);
        String nombreFinal = resolverNombreUnico(usuario, padre, nombre);
        Carpeta carpeta = new Carpeta();
        carpeta.setPropietario(usuario);
        carpeta.setPadre(padre);
        carpeta.setNombre(nombreFinal);
        carpeta.setEsRaiz(false);
        carpeta.setEnPapelera(false);
        carpeta.setEstado("ACTIVO");
        return carpetaRepository.save(carpeta);
    }

    private String resolverNombreUnico(Usuario usuario, Carpeta padre, String nombreBase) {
        String nombre = nombreBase.trim();
        if (!carpetaRepository.existsByPropietarioAndPadreAndNombreIgnoreCaseAndEnPapeleraFalse(usuario, padre, nombre)) {
            return nombre;
        }
        int contador = 1;
        while (true) {
            String candidato = "(" + contador + ") " + nombre;
            if (!carpetaRepository.existsByPropietarioAndPadreAndNombreIgnoreCaseAndEnPapeleraFalse(usuario, padre, candidato)) {
                return candidato;
            }
            contador++;
        }
    }

    private Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    private Carpeta obtenerCarpetaPropia(Usuario usuario, Long carpetaId) {
        Carpeta carpeta = carpetaRepository.findById(carpetaId).orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
        if (!carpeta.getPropietario().getIdUsuario().equals(usuario.getIdUsuario())) {
            throw new SecurityException("Recurso no accesible");
        }
        return carpeta;
    }
}
