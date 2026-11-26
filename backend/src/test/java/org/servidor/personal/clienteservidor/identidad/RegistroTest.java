package org.servidor.personal.clienteservidor.identidad;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.dominio.Persona;
import org.servidor.personal.clienteservidor.identidad.infraestructura.PersonaRepository;
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

    @Autowired
    private PersonaRepository personaRepository;

    @Test
    void registrarUsuarioUnico() {
        authService.registrar("usuario1", "clave123");
        assertTrue(usuarioRepository.existsByNombreUsuarioIgnoreCase("usuario1"));
        assertThrows(IllegalArgumentException.class, () -> authService.registrar("usuario1", "otra"));
    }

    @Test
    void crearClienteGuardaYRelacionaLaPersonaAntesDePersistirLaCuenta() {
        Persona persona = new Persona();
        persona.setNombres("Ana");
        persona.setApellidoPaterno("Pérez");
        persona.setApellidoMaterno("López");
        persona.setCi("CI-100");
        persona.setCorreo("ana@example.com");
        persona.setTelefono("70000000");

        var usuario = authService.crearCliente(persona, "ana", "clave-segura-123");
        usuarioRepository.flush();

        assertNotNull(usuario.getPersona().getIdPersona());
        assertTrue(personaRepository.existsById(usuario.getPersona().getIdPersona()));
        assertEquals("CI-100", usuario.getPersona().getCi());
    }
}
