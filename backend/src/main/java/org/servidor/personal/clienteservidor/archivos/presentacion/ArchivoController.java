package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.constraints.NotBlank;
import org.servidor.personal.clienteservidor.archivos.aplicacion.ArchivoService;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/archivos")
public class ArchivoController {

    private final ArchivoService archivoService;

    public ArchivoController(ArchivoService archivoService) {
        this.archivoService = archivoService;
    }

    @GetMapping
    public Page<ArchivoResponse> listar(@RequestParam String nombreUsuario,
                                        @RequestParam(required = false) UUID carpetaId,
                                        @RequestParam(required = false) String nombre,
                                        @RequestParam(defaultValue = "0") int pagina,
                                        @RequestParam(defaultValue = "50") int tamano) {
        Page<Archivo> page = archivoService.listar(nombreUsuario, carpetaId, nombre, pagina, tamano);
        return page.map(a -> new ArchivoResponse(a.getId(), a.getNombreVisible(), a.getTamano(), a.getTipoMime()));
    }

    @PatchMapping("/{id}")
    public void renombrar(@RequestParam String nombreUsuario, @PathVariable UUID id, @RequestBody RenombrarRequest request) {
        archivoService.renombrar(nombreUsuario, id, request.nombre());
    }

    public record RenombrarRequest(@NotBlank String nombre) {}
    public record ArchivoResponse(UUID id, String nombreVisible, Long tamano, String tipoMime) {}
}
