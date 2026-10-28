package org.servidor.personal.clienteservidor.identidad.aplicacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class TokenService {
    private final SesionRepository sesionRepository;

    public Optional<Usuario> validarToken(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        String tokenHash = hash(token);
        Optional<Sesion> sesionOpt = sesionRepository.findByTokenHash(tokenHash);
        if (sesionOpt.isEmpty()) {
            return Optional.empty();
        }
        Sesion sesion = sesionOpt.get();
        if (sesion.isRevocada() || sesion.getExpiraEn().isBefore(LocalDateTime.now())) {
            return Optional.empty();
        }
        return Optional.of(sesion.getUsuario());
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
