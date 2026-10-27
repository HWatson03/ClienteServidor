package org.servidor.personal.clienteservidor.archivos;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.archivos.aplicacion.PapeleraService;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class RestauracionTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private PapeleraService papeleraService;

    @Test
    void padreEnPapeleraImpideRestauracion() {
        authService.registrar("userRest", "clave123");
        assertThrows(Exception.class, () -> papeleraService.restaurar("userRest", "archivo", 999L));
    }
}
