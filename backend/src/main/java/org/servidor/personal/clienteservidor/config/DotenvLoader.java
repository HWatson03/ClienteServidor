package org.servidor.personal.clienteservidor.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Loads a local dotenv file before Spring resolves application properties. */
public final class DotenvLoader {

    private DotenvLoader() {}

    public static void load() {
        Path envFile = locateEnvFile();
        if (envFile == null) return;

        try {
            List<String> lines = Files.readAllLines(envFile);
            for (String line : lines) {
                loadLine(line);
            }
        } catch (IOException e) {
            throw new IllegalStateException("No se pudo leer el archivo de entorno: " + envFile, e);
        }
    }

    private static Path locateEnvFile() {
        String configuredPath = System.getenv("APP_ENV_FILE");
        if (configuredPath != null && !configuredPath.isBlank()) {
            Path configured = Path.of(configuredPath).toAbsolutePath().normalize();
            return Files.isRegularFile(configured) ? configured : null;
        }

        Path directory = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        while (directory != null) {
            Path local = directory.resolve(".env");
            if (Files.isRegularFile(local)) return local;
            Path backend = directory.resolve("backend/.env");
            if (Files.isRegularFile(backend)) return backend;
            directory = directory.getParent();
        }
        return null;
    }

    private static void loadLine(String rawLine) {
        String line = rawLine.trim();
        if (line.isEmpty() || line.startsWith("#")) return;
        if (line.startsWith("export ")) line = line.substring(7).trim();

        int separator = line.indexOf('=');
        if (separator <= 0) return;
        String key = line.substring(0, separator).trim();
        if (!key.matches("[A-Za-z_][A-Za-z0-9_]*")) return;
        if (System.getenv().containsKey(key) || System.getProperty(key) != null) return;

        String value = line.substring(separator + 1).trim();
        value = removeInlineComment(value);
        value = unquote(value.trim());
        System.setProperty(key, value);
    }

    private static String removeInlineComment(String value) {
        boolean singleQuoted = false;
        boolean doubleQuoted = false;
        for (int i = 0; i < value.length(); i++) {
            char current = value.charAt(i);
            if (current == '\'' && !doubleQuoted) singleQuoted = !singleQuoted;
            else if (current == '"' && !singleQuoted) doubleQuoted = !doubleQuoted;
            else if (current == '#' && !singleQuoted && !doubleQuoted && (i == 0 || Character.isWhitespace(value.charAt(i - 1)))) {
                return value.substring(0, i).trim();
            }
        }
        return value;
    }

    private static String unquote(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' || first == '\'') && first == last) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }
}
