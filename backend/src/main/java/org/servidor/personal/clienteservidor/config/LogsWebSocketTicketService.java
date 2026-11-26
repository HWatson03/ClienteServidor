package org.servidor.personal.clienteservidor.config;

import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;

/** Tickets de un solo uso para autenticar el handshake WebSocket del navegador. */
@Service
public class LogsWebSocketTicketService {
    private static final long DURACION_SEGUNDOS = 30;
    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, Instant> tickets = new ConcurrentHashMap<>();

    public String emitir() {
        Instant ahora = Instant.now();
        tickets.entrySet().removeIf(entrada -> entrada.getValue().isBefore(ahora));
        byte[] aleatorio = new byte[32];
        random.nextBytes(aleatorio);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(aleatorio);
        tickets.put(ticket, ahora.plusSeconds(DURACION_SEGUNDOS));
        return ticket;
    }

    public boolean consumir(String ticket) {
        if (ticket == null) return false;
        Instant expiracion = tickets.remove(ticket);
        return expiracion != null && expiracion.isAfter(Instant.now());
    }
}
