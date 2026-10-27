package org.servidor.personal.clienteservidor.archivos.presentacion.dto;

public record CopiaResponse(Long id, String estado, Long bytesCopiados, Long totalBytes) {
}
