package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface ArchivoRepository extends JpaRepository<Archivo, UUID> {
    Page<Archivo> findByPropietarioAndCarpetaAndEnPapeleraFalse(Usuario propietario, Carpeta carpeta, Pageable pageable);
    
    @Query("SELECT a FROM Archivo a WHERE a.propietario = :propietario AND a.enPapelera = false AND LOWER(a.nombreVisible) LIKE LOWER(CONCAT('%', :nombre, '%'))")
    Page<Archivo> buscarPorNombre(@Param("propietario") Usuario propietario, @Param("nombre") String nombre, Pageable pageable);
    
    Optional<Archivo> findByIdAndPropietario(UUID id, Usuario propietario);
    boolean existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(Usuario propietario, Carpeta carpeta, String nombreVisible);
}
