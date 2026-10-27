package org.servidor.personal.clienteservidor.archivos.presentacion.dto;

import jakarta.validation.constraints.NotBlank;

public record RenombrarRequest(@NotBlank String nombre) {}
