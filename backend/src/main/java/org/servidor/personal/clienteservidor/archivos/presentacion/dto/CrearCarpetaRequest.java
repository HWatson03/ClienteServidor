package org.servidor.personal.clienteservidor.archivos.presentacion.dto;

import jakarta.validation.constraints.NotBlank;

public record CrearCarpetaRequest(Long carpetaPadreId, @NotBlank String nombre) {}
