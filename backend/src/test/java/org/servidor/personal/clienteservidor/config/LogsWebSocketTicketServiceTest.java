package org.servidor.personal.clienteservidor.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LogsWebSocketTicketServiceTest {
    @Test
    void ticketSoloPuedeConsumirseUnaVez() {
        var servicio = new LogsWebSocketTicketService();
        String ticket = servicio.emitir();

        assertTrue(servicio.consumir(ticket));
        assertFalse(servicio.consumir(ticket));
        assertFalse(servicio.consumir("ticket-invalido"));
        assertFalse(servicio.consumir(null));
    }

    @Test
    void cadaTicketEsImpredecibleYUnico() {
        var servicio = new LogsWebSocketTicketService();

        assertNotEquals(servicio.emitir(), servicio.emitir());
    }
}
