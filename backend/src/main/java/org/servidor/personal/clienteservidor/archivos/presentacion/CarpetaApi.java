package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CarpetaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.*;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/carpetas")
@RequiredArgsConstructor
public class CarpetaApi {
    private final CarpetaService carpetaService;
    @GetMapping public List<CarpetaResponse> listar(@RequestParam String nombreUsuario, @RequestParam(required = false) Long carpetaId) { return carpetaService.listarCarpetas(nombreUsuario, carpetaId).stream().map(CarpetaApi::response).toList(); }
    @PostMapping public CarpetaResponse crear(@RequestParam String nombreUsuario, @Valid @RequestBody CrearCarpetaRequest request) { return response(carpetaService.crearCarpeta(nombreUsuario, request.carpetaPadreId(), request.nombre())); }
    private static CarpetaResponse response(Carpeta carpeta) { return new CarpetaResponse(carpeta.getIdCarpeta(), carpeta.getNombre(), carpeta.getPadre() == null ? null : carpeta.getPadre().getIdCarpeta()); }
}
