package org.servidor.personal.clienteservidor.identidad.infraestructura;

import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;

import java.util.Optional;
import java.util.List;

public interface UsuarioRepository extends JpaRepository<Usuario, Long> {
    @Override
    @EntityGraph(attributePaths = "persona")
    List<Usuario> findAll();

    @Override
    @EntityGraph(attributePaths = "persona")
    Optional<Usuario> findById(Long id);

    @EntityGraph(attributePaths = "persona")
    Optional<Usuario> findByNombreUsuarioIgnoreCase(String nombreUsuario);
    boolean existsByNombreUsuarioIgnoreCase(String nombreUsuario);
    @EntityGraph(attributePaths = "persona")
    List<Usuario> findByRolOrderByNombreUsuarioAsc(String rol);
}
