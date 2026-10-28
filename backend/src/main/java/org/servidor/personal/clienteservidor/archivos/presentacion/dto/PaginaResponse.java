package org.servidor.personal.clienteservidor.archivos.presentacion.dto;

import java.util.List;

public record PaginaResponse<T>(
        List<T> content,
        int number,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {}
