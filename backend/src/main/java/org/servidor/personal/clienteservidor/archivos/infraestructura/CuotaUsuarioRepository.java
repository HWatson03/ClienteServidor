package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface CuotaUsuarioRepository extends JpaRepository<CuotaUsuario, Long> {
    Optional<CuotaUsuario> findByUsuario(Usuario usuario);
}
