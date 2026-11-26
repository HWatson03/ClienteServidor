package org.servidor.personal.clienteservidor.archivos.aplicacion;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ActividadArchivosService {
    private final JdbcTemplate jdbcTemplate;

    @Transactional
    public void registrar(String nombreUsuario, String accion, String recurso, long bytes) {
        jdbcTemplate.update("""
                INSERT INTO actividad_archivos (id_usuario, accion, nombre_recurso, bytes)
                SELECT id_usuario, ?, ?, ? FROM usuarios WHERE LOWER(nombre_usuario) = LOWER(?)
                """, accion, recurso, Math.max(0, bytes), nombreUsuario);
    }

    @Transactional(readOnly = true)
    public List<Actividad> recientes() {
        return jdbcTemplate.query("""
                SELECT u.nombre_usuario, a.accion, a.nombre_recurso, a.bytes, a.ocurrida_en
                FROM actividad_archivos a JOIN usuarios u ON u.id_usuario = a.id_usuario
                WHERE u.rol = 'CLIENTE' ORDER BY a.ocurrida_en DESC LIMIT 100
                """, (rs, row) -> new Actividad(rs.getString("nombre_usuario"), rs.getString("accion"),
                rs.getString("nombre_recurso"), rs.getLong("bytes"),
                rs.getTimestamp("ocurrida_en").toLocalDateTime()));
    }

    public record Actividad(String nombreUsuario, String accion, String recurso, long bytes, LocalDateTime ocurridaEn) {}
}
