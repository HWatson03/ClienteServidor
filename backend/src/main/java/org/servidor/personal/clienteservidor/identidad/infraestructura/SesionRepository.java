package org.servidor.personal.clienteservidor.identidad.infraestructura;

import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SesionRepository extends JpaRepository<Sesion, UUID> {
    Optional<Sesion> findByTokenHash(String tokenHash);

    @Query("SELECT COUNT(s) FROM Sesion s WHERE s.usuario = :usuario AND s.revocada = false AND s.expiraEn > :ahora")
    long countActivas(@Param("usuario") Usuario usuario, @Param("ahora") LocalDateTime ahora);

    List<Sesion> findByUsuarioAndRevocadaFalseAndExpiraEnAfter(Usuario usuario, LocalDateTime ahora);

    @Modifying
    @Query("UPDATE Sesion s SET s.revocada = true WHERE s.usuario = :usuario AND s.revocada = false")
    int revocarTodas(@Param("usuario") Usuario usuario);
}
