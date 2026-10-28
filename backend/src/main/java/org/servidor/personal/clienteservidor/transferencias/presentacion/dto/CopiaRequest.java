package org.servidor.personal.clienteservidor.transferencias.presentacion.dto;

import jakarta.validation.constraints.NotNull;

public record CopiaRequest(@NotNull Long archivoId, @NotNull Long carpetaDestinoId) {
}
