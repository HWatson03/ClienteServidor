package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.constraints.NotBlank;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CarpetaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/carpetas")
public class CarpetaController {

    private final CarpetaService carpetaService;

    public CarpetaController(CarpetaService carpetaService) {
        this.carpetaService = carpetaService;
    }

    @GetMapping
    public List<CarpetaResponse> listar(@RequestParam String nombreUsuario, @RequestParam(required = false) UUID carpetaId) {
        return carpetaService.listarCarpetas(nombreUsuario, carpetaId).stream()
                .map(c -> new CarpetaResponse(c.getId(), c.getNombre(), c.getPadre() == null ? null : c.getPadre().getId()))
                .toList();
    }

    @PostMapping
    public CarpetaResponse crear(@RequestParam String nombreUsuario, @RequestBody CrearCarpetaRequest request) {
        Carpeta carpeta = carpetaService.crearCarpeta(nombreUsuario, request.carpetaPadreId(), request.nombre());
        return new CarpetaResponse(carpeta.getId(), carpeta.getNombre(), carpeta.getPadre() == null ? null : carpeta.getPadre().getId());
    }

    public record CrearCarpetaRequest(UUID carpetaPadreId, @NotBlank String nombre) {}
    public record CarpetaResponse(UUID id, String nombre, UUID padreId) {}
}
