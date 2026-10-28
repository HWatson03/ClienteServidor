package org.servidor.personal.clienteservidor.transferencias.presentacion.dto;

public record CargaResponse(Long idCarga, long offsetConfirmado, String estado, long tamanoEsperado) {}
