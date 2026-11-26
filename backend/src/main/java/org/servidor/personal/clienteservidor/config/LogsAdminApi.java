package org.servidor.personal.clienteservidor.config;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/admin/logs")
@RequiredArgsConstructor
public class LogsAdminApi {
    private final LogsSistemaService logsSistemaService;
    private final LogsWebSocketTicketService ticketService;

    @GetMapping
    public LogsSistemaService.LogsResponse consultar(
            @RequestParam(defaultValue = "500") int limite) {
        return logsSistemaService.ultimasLineas(limite);
    }

    @org.springframework.web.bind.annotation.PostMapping("/ws-ticket")
    public java.util.Map<String, String> emitirTicketWebSocket() {
        return java.util.Map.of("ticket", ticketService.emitir());
    }
}
