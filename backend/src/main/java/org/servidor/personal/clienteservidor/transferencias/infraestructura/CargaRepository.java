package org.servidor.personal.clienteservidor.transferencias.infraestructura;

import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface CargaRepository extends JpaRepository<Carga, UUID> {
}
