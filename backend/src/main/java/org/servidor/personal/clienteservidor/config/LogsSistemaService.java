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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Lectura acotada del log activo del sistema para la vista administrativa. */
@Service
public class LogsSistemaService {
    private static final int MAX_BYTES = 2_000_000;
    private static final int MAX_LINEAS = 1_000;
    private static final Pattern CABECERA = Pattern.compile(
            "^(\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}) \\[(TRACE|DEBUG|INFO|WARN|ERROR)\\s*] ([^ ]+) \\[([^]]+)] - (.*)$");
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
            List<LogEntry> entradas = agrupar(lineas);
            int inicio = Math.max(0, entradas.size() - limite);
            return new LogsResponse("lestrade.log", true, bytes,
                    Files.getLastModifiedTime(archivo).toInstant(), entradas.subList(inicio, entradas.size()));
        } catch (IOException e) {
            throw new UncheckedIOException("No se pudo leer el log del sistema", e);
        }
    }

    private List<LogEntry> agrupar(List<String> lineas) {
        List<LogEntry> entradas = new ArrayList<>();
        String fecha = "";
        String nivel = "DETALLE";
        String origen = "";
        String usuario = "";
        StringBuilder mensaje = new StringBuilder();
        StringBuilder detalle = new StringBuilder();

        for (String linea : lineas) {
            Matcher matcher = CABECERA.matcher(linea);
            if (matcher.matches()) {
                if (mensaje.length() > 0) entradas.add(new LogEntry(fecha, nivel, origen, usuario,
                        mensaje.toString(), detalle.toString()));
                fecha = matcher.group(1);
                nivel = matcher.group(2).trim();
                origen = matcher.group(3);
                usuario = "sistema".equals(matcher.group(4)) ? "" : matcher.group(4);
                mensaje = new StringBuilder(matcher.group(5));
                detalle = new StringBuilder();
            } else if (mensaje.length() == 0) {
                mensaje.append(linea);
            } else {
                if (detalle.length() > 0) detalle.append('\n');
                detalle.append(linea);
            }
        }
        if (mensaje.length() > 0) entradas.add(new LogEntry(fecha, nivel, origen, usuario,
                mensaje.toString(), detalle.toString()));
        return entradas;
    }

    public record LogEntry(String fecha, String nivel, String origen, String usuario,
                           String mensaje, String detalle) {}

    public record LogsResponse(String archivo, boolean disponible, long bytes, Instant modificadoEn,
                               List<LogEntry> entradas) {}
}
