package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CuotaUsuarioRepository extends JpaRepository<CuotaUsuario, UUID> {
    Optional<CuotaUsuario> findByUsuario(Usuario usuario);
}
