package org.servidor.personal.clienteservidor.archivos;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CuotaService;
import org.servidor.personal.clienteservidor.archivos.aplicacion.dto.ResumenCuota;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CuotaTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CuotaService cuotaService;

    @Test
    void reservaCuota() {
        authService.registrar("userD", "clave123");
        cuotaService.reservar("userD", 500000000L);
        ResumenCuota resumen = cuotaService.resumen("userD");
        assertEquals(500000000L, resumen.reservados());
        assertThrows(IllegalArgumentException.class, () -> cuotaService.reservar("userD", 600000000L));
    }
}
