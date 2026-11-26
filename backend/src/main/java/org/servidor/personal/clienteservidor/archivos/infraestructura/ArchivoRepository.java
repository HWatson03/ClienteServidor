package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface ArchivoRepository extends JpaRepository<Archivo, Long> {
    Page<Archivo> findByPropietarioAndCarpetaAndEnPapeleraFalse(Usuario propietario, Carpeta carpeta, Pageable pageable);

    Page<Archivo> findByPropietarioAndEnPapeleraFalse(Usuario propietario, Pageable pageable);
    
    @Query("SELECT a FROM Archivo a WHERE a.propietario = :propietario AND a.enPapelera = false AND LOWER(a.nombreVisible) LIKE LOWER(CONCAT('%', :nombre, '%'))")
    Page<Archivo> buscarPorNombre(@Param("propietario") Usuario propietario, @Param("nombre") String nombre, Pageable pageable);
    
    Optional<Archivo> findByIdArchivoAndPropietario(Long id, Usuario propietario);
    Optional<Archivo> findByIdArchivoAndPropietarioAndEnPapeleraFalse(Long id, Usuario propietario);

    @Query("SELECT COUNT(a) FROM Archivo a WHERE a.propietario = :usuario AND a.enPapelera = false")
    long contarActivosPorUsuario(@Param("usuario") Usuario usuario);

    List<Archivo> findByPropietarioAndCarpetaAndEnPapeleraFalseOrderByNombreVisibleAsc(Usuario usuario, Carpeta carpeta);

    @Query("SELECT a FROM Archivo a WHERE a.propietario.rol = 'CLIENTE' ORDER BY a.fechaCreacion DESC")
    List<Archivo> recientesClientes(Pageable pageable);
    Optional<Archivo> findByPropietarioAndNombreVisibleAndTamano(Usuario propietario, String nombreVisible, Long tamano);
    Optional<Archivo> findByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndTamanoAndEnPapeleraFalse(
            Usuario propietario, Carpeta carpeta, String nombreVisible, Long tamano);
    List<Archivo> findByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(
            Usuario propietario, Carpeta carpeta, String nombreVisible);
    List<Archivo> findByCarpeta(Carpeta carpeta);
    List<Archivo> findByPropietarioAndEnPapeleraTrue(Usuario propietario);
    boolean existsByPropietarioAndCarpetaAndNombreVisibleIgnoreCaseAndEnPapeleraFalse(Usuario propietario, Carpeta carpeta, String nombreVisible);
}
