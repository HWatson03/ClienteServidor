package org.servidor.personal.clienteservidor.transferencias.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.transferencias.aplicacion.CargaService;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.*;
import org.springframework.web.bind.annotation.*;

import java.io.InputStream;

@RestController
@RequestMapping("/api/cargas")
@RequiredArgsConstructor
public class CargaApi {
    private final CargaService cargaService;
    @PostMapping public CargaResponse iniciar(@RequestParam String nombreUsuario, @Valid @RequestBody IniciarCargaRequest request) { Carga c = cargaService.iniciar(nombreUsuario, request.carpetaDestinoId(), request.nombreArchivo(), request.tamanoEsperado()); return response(c); }
    @GetMapping("/{id}") public CargaResponse consultar(@RequestParam String nombreUsuario, @PathVariable Long id) { return response(cargaService.consultar(nombreUsuario, id)); }
    @PatchMapping("/{id}/contenido") public void subirFragmento(@RequestParam String nombreUsuario, @PathVariable Long id, @RequestParam long offset, InputStream input) { cargaService.subirFragmento(nombreUsuario, id, offset, input); }
    @PostMapping("/{id}/finalizar") public void finalizar(@RequestParam String nombreUsuario, @PathVariable Long id) { cargaService.finalizar(nombreUsuario, id); }
    private static CargaResponse response(Carga c) { return new CargaResponse(c.getIdCarga(), c.getOffsetConfirmado(), c.getEstado()); }
}
