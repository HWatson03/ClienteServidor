package org.servidor.personal.clienteservidor.transferencias.presentacion.dto;

public record TareaCopiaResponse(Long idTarea, Long bytesCopiados, Long totalBytes, String estado) {
}
