package org.servidor.personal.clienteservidor.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

/** Lectura acotada del log activo del sistema para la vista administrativa. */
@Service
public class LogsSistemaService {
    private static final int MAX_BYTES = 2_000_000;
    private static final int MAX_LINEAS = 1_000;
    private final Path archivo;

    public LogsSistemaService(@Value("${app.logs.dir:logs}") String directorio) {
        this.archivo = Path.of(directorio).toAbsolutePath().normalize().resolve("lestrade.log");
    }

    public LogsResponse ultimasLineas(int cantidad) {
        int limite = Math.clamp(cantidad, 1, MAX_LINEAS);
        try {
            if (!Files.isRegularFile(archivo)) {
                return new LogsResponse("lestrade.log", false, 0, null, List.of());
            }

            long bytes = Files.size(archivo);
            long offset = Math.max(0, bytes - MAX_BYTES);
            byte[] contenido;
            try (RandomAccessFile log = new RandomAccessFile(archivo.toFile(), "r")) {
                log.seek(offset);
                contenido = new byte[(int) (bytes - offset)];
                log.readFully(contenido);
            }

            String texto = new String(contenido, StandardCharsets.UTF_8);
            if (offset > 0) {
                int inicioLinea = texto.indexOf('\n');
                texto = inicioLinea >= 0 ? texto.substring(inicioLinea + 1) : "";
            }
            List<String> lineas = Arrays.stream(texto.split("\\R"))
                    .filter(linea -> !linea.isBlank())
                    .toList();
            int inicio = Math.max(0, lineas.size() - limite);
            return new LogsResponse("lestrade.log", true, bytes,
                    Files.getLastModifiedTime(archivo).toInstant(), lineas.subList(inicio, lineas.size()));
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo leer el log del sistema", e);
        }
    }

    public record LogsResponse(String archivo, boolean disponible, long bytes, Instant modificadoEn,
                               List<String> lineas) {}
}
