package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.List;
import org.springframework.data.jpa.repository.Query;

public interface CuotaUsuarioRepository extends JpaRepository<CuotaUsuario, Long> {
    Optional<CuotaUsuario> findByUsuario(Usuario usuario);

    @Query("SELECT c FROM CuotaUsuario c JOIN FETCH c.usuario u LEFT JOIN FETCH u.persona WHERE u.rol = 'CLIENTE' ORDER BY u.nombreUsuario")
    List<CuotaUsuario> findResumenesClientes();
}
