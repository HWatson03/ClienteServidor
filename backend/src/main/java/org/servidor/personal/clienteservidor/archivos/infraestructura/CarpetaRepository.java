package org.servidor.personal.clienteservidor.archivos.infraestructura;

import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CarpetaRepository extends JpaRepository<Carpeta, UUID> {
    Optional<Carpeta> findByPropietarioAndEsRaizTrue(Usuario propietario);
    List<Carpeta> findByPropietarioAndPadreAndEnPapeleraFalse(Usuario propietario, Carpeta padre);
    Optional<Carpeta> findByIdAndPropietario(UUID id, Usuario propietario);
    boolean existsByPropietarioAndPadreAndNombreIgnoreCaseAndEnPapeleraFalse(Usuario propietario, Carpeta padre, String nombre);
}
