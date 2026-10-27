package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

@Service
public class AlmacenamientoService {

    private final Path root;
    private final Path temp;

    public AlmacenamientoService(@Value("${app.storage.root}") String rootDir, @Value("${app.storage.temp}") String tempDir) {
        this.root = Paths.get(rootDir);
        this.temp = Paths.get(tempDir);
        try {
            Files.createDirectories(this.root);
            Files.createDirectories(this.temp);
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo crear directorios de almacenamiento", e);
        }
    }

    public Path guardarTemporal(String clave, InputStream input, long offset, long length) throws IOException {
        Path archivo = temp.resolve(clave);
        Files.createDirectories(archivo.getParent());
        try (OutputStream out = Files.newOutputStream(archivo, StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            if (offset > 0) {
                out.write(Files.readAllBytes(archivo).toString().getBytes(), 0, 0);
            }
            input.transferTo(out);
        }
        return archivo;
    }

    public Path obtenerTemporal(String clave) {
        return temp.resolve(clave);
    }

    public void moverAFinal(String claveTemporal, String claveFinal) throws IOException {
        Path origen = temp.resolve(claveTemporal);
        Path destino = root.resolve(claveFinal);
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
