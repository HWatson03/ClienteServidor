package org.servidor.personal.clienteservidor.transferencias.presentacion.dto;

import org.servidor.personal.clienteservidor.archivos.presentacion.dto.ArchivoResponse;

public record FinalizarCargaResponse(ArchivoResponse archivo, boolean duplicado) {
}
