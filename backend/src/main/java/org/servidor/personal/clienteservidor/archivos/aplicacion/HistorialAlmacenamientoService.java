package org.servidor.personal.clienteservidor.archivos.aplicacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class HistorialAlmacenamientoService {
    private final JdbcTemplate jdbcTemplate;
    private final AlmacenamientoService almacenamientoService;

    @EventListener(ApplicationReadyEvent.class)
    public void capturarPrimeraMuestra() {
        Integer cantidad = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM historial_almacenamiento", Integer.class);
        if (cantidad != null && cantidad == 0) capturarDiario();
    }

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void capturarDiario() {
        var disco = almacenamientoService.espacioDisco();
        jdbcTemplate.update("""
                INSERT INTO historial_almacenamiento
                (capturado_en, bytes_total_servidor, bytes_disponibles_servidor, bytes_ocupados_clientes, cantidad_clientes)
                SELECT CURRENT_TIMESTAMP, ?, ?, COALESCE(SUM(c.bytes_ocupados), 0), COUNT(c.id_cuota_usuario)
                FROM cuota_usuario c JOIN usuarios u ON u.id_usuario = c.id_usuario AND u.rol = 'CLIENTE'
                """, disco.total(), disco.disponible());
    }

    @Transactional(readOnly = true)
    public List<Snapshot> listar() {
        return jdbcTemplate.query("""
                SELECT capturado_en, bytes_total_servidor, bytes_disponibles_servidor,
                       bytes_ocupados_clientes, cantidad_clientes
                FROM historial_almacenamiento ORDER BY capturado_en DESC LIMIT 60
                """, (rs, row) -> new Snapshot(rs.getTimestamp("capturado_en").toLocalDateTime(),
                rs.getLong("bytes_total_servidor"), rs.getLong("bytes_disponibles_servidor"),
                rs.getLong("bytes_ocupados_clientes"), rs.getLong("cantidad_clientes")));
    }

    public record Snapshot(LocalDateTime capturadoEn, long bytesTotalServidor,
            long bytesDisponiblesServidor, long bytesOcupadosClientes, long cantidadClientes) {}
}
