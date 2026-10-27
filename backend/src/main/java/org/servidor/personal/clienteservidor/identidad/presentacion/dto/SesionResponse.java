package org.servidor.personal.clienteservidor.identidad.presentacion.dto;

import java.time.LocalDateTime;

public record SesionResponse(Long idSesion, LocalDateTime expiraEn) {}
