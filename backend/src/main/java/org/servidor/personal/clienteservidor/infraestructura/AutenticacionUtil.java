package org.servidor.personal.clienteservidor.infraestructura;

import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class AutenticacionUtil {
    private final UsuarioRepository usuarioRepository;

    public Usuario usuarioAutenticado() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            throw new SecurityException("No autenticado");
        }
        String nombre = auth.getName();
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombre)
                .orElseThrow(() -> new SecurityException("Usuario no encontrado"));
    }

    public String nombreUsuarioAutenticado() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
            throw new SecurityException("No autenticado");
        }
        return auth.getName();
    }
}
