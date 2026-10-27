package org.servidor.personal.clienteservidor.archivos;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CarpetaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class PropiedadArchivosTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CarpetaService carpetaService;

    @Autowired
    private CarpetaRepository carpetaRepository;

    @Test
    void noPermiteAccesoRecursoAjeno() {
        authService.registrar("userA", "clave123");
        authService.registrar("userB", "clave123");
        
        Carpeta raizB = carpetaRepository.findAll().stream()
                .filter(c -> c.getPropietario() != null && c.getPropietario().getNombreUsuario() != null && 
                        c.getPropietario().getNombreUsuario().equalsIgnoreCase("userB") && c.isEsRaiz())
                .findFirst().orElseThrow();
        
        assertThrows(SecurityException.class, () -> carpetaService.crearCarpeta("userA", raizB.getId(), "test"));
    }
}
