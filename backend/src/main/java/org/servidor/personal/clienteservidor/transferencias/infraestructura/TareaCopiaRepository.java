package org.servidor.personal.clienteservidor.transferencias.infraestructura;

import org.servidor.personal.clienteservidor.transferencias.dominio.TareaCopia;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TareaCopiaRepository extends JpaRepository<TareaCopia, UUID> {
}
