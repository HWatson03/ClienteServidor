package org.servidor.personal.clienteservidor.identidad.presentacion.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@NotBlank String nombreUsuario, @NotBlank String contrasena) {}
