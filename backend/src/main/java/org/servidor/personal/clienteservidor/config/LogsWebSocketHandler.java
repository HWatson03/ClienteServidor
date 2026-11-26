package org.servidor.personal.clienteservidor.config;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

import java.io.IOException;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LogsWebSocketHandler extends TextWebSocketHandler {
    private final LogsSistemaService logs;
    private final ObjectMapper objectMapper;
    private final Set<WebSocketSession> sesiones = ConcurrentHashMap.newKeySet();
    private volatile String ultimaVersion = "";

    public LogsWebSocketHandler(LogsSistemaService logs, ObjectMapper objectMapper) {
        this.logs = logs;
        this.objectMapper = objectMapper;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        var decorada = new ConcurrentWebSocketSessionDecorator(session, 5000, 512 * 1024);
        sesiones.add(decorada);
        enviar(decorada);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sesiones.removeIf(s -> s.getId().equals(session.getId()));
    }

    @Scheduled(fixedDelay = 1000)
    public void transmitirCambios() {
        if (sesiones.isEmpty()) return;
        try {
            var respuesta = logs.ultimasLineas(300);
            String version = respuesta.bytes() + ":" + respuesta.modificadoEn();
            if (version.equals(ultimaVersion)) return;
            ultimaVersion = version;
            String json = objectMapper.writeValueAsString(respuesta);
            for (WebSocketSession session : sesiones) {
                try {
                    if (session.isOpen()) session.sendMessage(new TextMessage(json));
                    else sesiones.remove(session);
                } catch (IOException e) {
                    sesiones.remove(session);
                    try { session.close(CloseStatus.SERVER_ERROR); } catch (IOException ignored) { }
                }
            }
        } catch (JacksonException e) {
            throw new IllegalStateException("No se pudo serializar el estado de logs", e);
        }
    }

    private void enviar(WebSocketSession session) throws IOException {
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(logs.ultimasLineas(300))));
    }
}
