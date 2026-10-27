package org.servidor.personal.clienteservidor.transferencias.presentacion;

import jakarta.validation.constraints.NotBlank;
import org.servidor.personal.clienteservidor.transferencias.aplicacion.CargaService;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;
import java.util.UUID;

@RestController
@RequestMapping("/api/cargas")
public class CargaController {

    private final CargaService cargaService;

    public CargaController(CargaService cargaService) {
        this.cargaService = cargaService;
    }

    @PostMapping
    public CargaResponse iniciar(@RequestParam String nombreUsuario, @RequestBody IniciarCargaRequest request) {
        Carga carga = cargaService.iniciar(nombreUsuario, request.carpetaDestinoId(), request.nombreArchivo(), request.tamanoEsperado());
        return new CargaResponse(carga.getId(), carga.getOffsetConfirmado(), carga.getEstado());
    }

    @GetMapping("/{id}")
    public CargaResponse consultar(@RequestParam String nombreUsuario, @PathVariable UUID id) {
        Carga carga = cargaService.consultar(nombreUsuario, id);
        return new CargaResponse(carga.getId(), carga.getOffsetConfirmado(), carga.getEstado());
    }

    @PatchMapping("/{id}/contenido")
    public void subirFragmento(@RequestParam String nombreUsuario, @PathVariable UUID id, @RequestParam long offset, InputStream input) {
        cargaService.subirFragmento(nombreUsuario, id, offset, input);
    }

    @PostMapping("/{id}/finalizar")
    public void finalizar(@RequestParam String nombreUsuario, @PathVariable UUID id) {
        cargaService.finalizar(nombreUsuario, id);
    }

    public record IniciarCargaRequest(UUID carpetaDestinoId, @NotBlank String nombreArchivo, long tamanoEsperado) {}
    public record CargaResponse(UUID id, long offsetConfirmado, String estado) {}
}
