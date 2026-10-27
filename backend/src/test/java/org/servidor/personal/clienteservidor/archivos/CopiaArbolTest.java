package org.servidor.personal.clienteservidor.archivos;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CopiaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CopiaArbolTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CarpetaRepository carpetaRepository;

    @Autowired
    private CopiaService copiaService;

    @Test
    void copiaReservaCuota() {
        authService.registrar("userCopia", "clave123");
        Carpeta raiz = carpetaRepository.findAll().stream()
                .filter(c -> c.getPropietario() != null && c.getPropietario().getNombreUsuario() != null
                        && c.getPropietario().getNombreUsuario().equalsIgnoreCase("userCopia") && c.isEsRaiz())
                .findFirst().orElseThrow();
        assertNotNull(raiz);
    }
}
