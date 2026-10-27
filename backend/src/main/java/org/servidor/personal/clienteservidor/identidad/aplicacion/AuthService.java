package org.servidor.personal.clienteservidor.identidad.aplicacion;

import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;

@Service
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final SesionRepository sesionRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();

    public AuthService(UsuarioRepository usuarioRepository, SesionRepository sesionRepository, PasswordEncoder passwordEncoder) {
        this.usuarioRepository = usuarioRepository;
        this.sesionRepository = sesionRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public void registrar(String nombreUsuario, String contrasena) {
        if (nombreUsuario == null || nombreUsuario.isBlank() || contrasena == null || contrasena.isBlank()) {
            throw new IllegalArgumentException("Datos de registro inválidos");
        }
        String normalizado = nombreUsuario.trim();
        if (usuarioRepository.existsByNombreUsuarioIgnoreCase(normalizado)) {
            throw new IllegalArgumentException("Nombre de usuario ya existe");
        }
        Usuario usuario = new Usuario();
        usuario.setNombreUsuario(normalizado);
        usuario.setContrasenaHash(passwordEncoder.encode(contrasena));
        usuario.setCuotaMaxBytes(1000000000L);
        usuario.setEstado("ACTIVO");
        usuarioRepository.save(usuario);
    }

    @Transactional
    public String login(String nombreUsuario, String contrasena) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Credenciales inválidas"));
        if (!passwordEncoder.matches(contrasena, usuario.getContrasenaHash())) {
            throw new IllegalArgumentException("Credenciales inválidas");
        }
        LocalDateTime ahora = LocalDateTime.now();
        synchronized (("login:" + usuario.getId()).intern()) {
            long activas = sesionRepository.countActivas(usuario, ahora);
            if (activas >= 3) {
                throw new IllegalArgumentException("Máximo de 3 sesiones activas alcanzado");
            }
            String token = generarToken();
            String tokenHash = hash(token);
            Sesion sesion = new Sesion();
            sesion.setUsuario(usuario);
            sesion.setTokenHash(tokenHash);
            sesion.setExpiraEn(ahora.plusDays(7));
            sesion.setRevocada(false);
            sesion.setEstado("ACTIVO");
            sesionRepository.save(sesion);
            return token;
        }
    }

    @Transactional
    public void cambiarContrasena(String nombreUsuario, String contrasenaActual, String contrasenaNueva) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        if (!passwordEncoder.matches(contrasenaActual, usuario.getContrasenaHash())) {
            throw new IllegalArgumentException("Contraseña actual incorrecta");
        }
        usuario.setContrasenaHash(passwordEncoder.encode(contrasenaNueva));
        usuarioRepository.save(usuario);
        sesionRepository.revocarTodas(usuario);
    }

    private String generarToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Error al procesar token", e);
        }
    }
}
