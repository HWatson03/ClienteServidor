package org.servidor.personal.clienteservidor.identidad;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RegistroTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Test
    void registrarUsuarioUnico() {
        authService.registrar("usuario1", "clave123");
        assertTrue(usuarioRepository.existsByNombreUsuarioIgnoreCase("usuario1"));
        assertThrows(IllegalArgumentException.class, () -> authService.registrar("usuario1", "otra"));
    }
}
