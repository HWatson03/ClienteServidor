package org.servidor.personal.clienteservidor.transferencias.infraestructura;

import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.springframework.data.jpa.repository.JpaRepository;


public interface CargaRepository extends JpaRepository<Carga, Long> {
}
