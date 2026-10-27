package org.servidor.personal.clienteservidor.identidad.presentacion.dto;

import jakarta.validation.constraints.NotBlank;

public record CambioContrasenaRequest(@NotBlank String nombreUsuario, @NotBlank String contrasenaActual, @NotBlank String contrasenaNueva) {}
