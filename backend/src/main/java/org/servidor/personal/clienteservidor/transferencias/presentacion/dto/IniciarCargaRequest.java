package org.servidor.personal.clienteservidor.transferencias.presentacion.dto;

import jakarta.validation.constraints.NotBlank;

public record IniciarCargaRequest(Long carpetaDestinoId, @NotBlank String nombreArchivo, long tamanoEsperado) {}
