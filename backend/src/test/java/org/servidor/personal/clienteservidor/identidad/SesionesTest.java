package org.servidor.personal.clienteservidor.identidad;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SesionesTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private SesionRepository sesionRepository;

    @Test
    void permiteSesionesIlimitadas() {
        authService.registrar("usuario2", "clave123");
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase("usuario2").orElseThrow();

        authService.login("usuario2", "clave123");
        authService.login("usuario2", "clave123");
        authService.login("usuario2", "clave123");
        authService.login("usuario2", "clave123");
        authService.login("usuario2", "clave123");

        assertEquals(5, sesionRepository.countActivas(usuario, LocalDateTime.now()));
    }
}
