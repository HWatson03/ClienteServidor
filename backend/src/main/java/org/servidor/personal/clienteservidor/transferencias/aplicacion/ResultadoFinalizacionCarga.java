package org.servidor.personal.clienteservidor.transferencias.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;

public record ResultadoFinalizacionCarga(Archivo archivo, boolean duplicado) {
}
