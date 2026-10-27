package org.servidor.personal.clienteservidor.transferencias.infraestructura;

import org.servidor.personal.clienteservidor.transferencias.dominio.TareaCopia;
import org.springframework.data.jpa.repository.JpaRepository;


public interface TareaCopiaRepository extends JpaRepository<TareaCopia, Long> {
}
