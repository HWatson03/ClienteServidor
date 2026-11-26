package org.servidor.personal.clienteservidor.config;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LogsSistemaServiceTest {
    @TempDir
    Path directorio;

    @Test
    void agrupaStacktraceDentroDelEventoYExponeNivelOrigenYUsuario() throws Exception {
        Files.writeString(directorio.resolve("lestrade.log"), """
                2026-11-26 11:17:03 [ERROR] o.s.p.c.GlobalExceptionHandler [admin] - Falló la operación
                java.lang.IllegalStateException: ejemplo
                \tat ejemplo.Servicio.crear(Servicio.java:10)
                2026-11-26 11:17:04 [INFO ] o.s.p.c.AuthService [admin] - Usuario creado
                """);
        var servicio = new LogsSistemaService(directorio.toString());

        var resultado = servicio.ultimasLineas(300);

        assertEquals(2, resultado.entradas().size());
        var error = resultado.entradas().getFirst();
        assertEquals("ERROR", error.nivel());
        assertEquals("admin", error.usuario());
        assertEquals("Falló la operación", error.mensaje());
        assertTrue(error.detalle().contains("IllegalStateException"));
        assertEquals("Usuario creado", resultado.entradas().getLast().mensaje());
    }
}
