package org.servidor.personal.clienteservidor.archivos.infraestructura;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

@Service
@RequiredArgsConstructor
public class AlmacenamientoService {

    private final AlmacenamientoProperties properties;

    private Path root() { return Paths.get(properties.getRoot()); }
    private Path temp() { return Paths.get(properties.getTemp()); }

    @jakarta.annotation.PostConstruct
    void crearDirectorios() {
        Path root = root();
        Path temp = temp();
        try {
            Files.createDirectories(root);
            Files.createDirectories(temp);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo crear directorios de almacenamiento", e);
        }
    }

    public Path guardarTemporal(String clave, InputStream input, long offset, long tamanoEsperado) throws IOException {
        Path temp = temp();
        Path archivo = temp.resolve(clave);
        Files.createDirectories(archivo.getParent());
        // Validate that offset matches current file size
        long tamanoActual = Files.exists(archivo) ? Files.size(archivo) : 0;
        if (tamanoActual != offset) {
            throw new IllegalArgumentException("Offset incompatible");
        }
        // Read input with limit to avoid memory exhaustion
        int maxFragmentSize = 1024 * 1024; // 1MB max per fragment
        byte[] data = input.readNBytes(maxFragmentSize + 1);
        if (data.length == 0) {
            return archivo;
        }
        if (data.length > maxFragmentSize) {
            throw new IllegalArgumentException("Fragmento demasiado grande");
        }
        long nuevo = offset + data.length;
        if (nuevo > tamanoEsperado) {
            throw new IllegalArgumentException("Excede tamaño esperado");
        }
        try (OutputStream out = Files.newOutputStream(archivo, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND)) {
            out.write(data);
        }
        return archivo;
    }

    public Path obtenerTemporal(String clave) {
        return temp().resolve(clave);
    }

    public void moverAFinal(String claveTemporal, String claveFinal) throws IOException {
        Path origen = temp().resolve(claveTemporal);
        Path destino = root().resolve(claveFinal);
        Files.createDirectories(destino.getParent());
        Files.move(origen, destino);
    }

    public void eliminar(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
        }
    }
}
