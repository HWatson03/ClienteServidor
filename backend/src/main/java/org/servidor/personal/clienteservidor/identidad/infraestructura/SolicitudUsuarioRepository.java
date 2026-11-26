package org.servidor.personal.clienteservidor.identidad.infraestructura;

import org.servidor.personal.clienteservidor.identidad.dominio.SolicitudUsuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SolicitudUsuarioRepository extends JpaRepository<SolicitudUsuario, Long> {
    List<SolicitudUsuario> findByEstadoOrderByFechaSolicitudDesc(String estado);
    boolean existsByNombreUsuarioIgnoreCaseAndEstado(String nombreUsuario, String estado);
    boolean existsByCiIgnoreCaseAndEstado(String ci, String estado);
    boolean existsByCorreoIgnoreCaseAndEstado(String correo, String estado);
}
