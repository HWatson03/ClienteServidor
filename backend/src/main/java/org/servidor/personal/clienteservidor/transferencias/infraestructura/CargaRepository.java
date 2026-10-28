package org.servidor.personal.clienteservidor.transferencias.infraestructura;

import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;

public interface CargaRepository extends JpaRepository<Carga, Long> {
    @Query("SELECT c FROM Carga c WHERE c.estado NOT IN ('FINALIZADA', 'EXPIRADA') AND c.expiraEn < :ahora")
    List<Carga> findExpiradas(@Param("ahora") LocalDateTime ahora);
}
