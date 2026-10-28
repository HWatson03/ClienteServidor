package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CarpetaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.CarpetaResponse;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.CrearCarpetaRequest;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.RenombrarRequest;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/carpetas")
@RequiredArgsConstructor
public class CarpetaApi {
    private final CarpetaService carpetaService;
    private final AutenticacionUtil autenticacionUtil;
    @GetMapping public List<CarpetaResponse> listar(@RequestParam(required = false) Long padreId) { List<Carpeta> carpetas = carpetaService.listarCarpetas(autenticacionUtil.nombreUsuarioAutenticado(), padreId); return carpetas.stream().map(c -> new CarpetaResponse(c.getIdCarpeta(), c.getNombre(), c.getPadre() != null ? c.getPadre().getIdCarpeta() : null)).toList(); }
    @PostMapping public void crear(@Valid @RequestBody CrearCarpetaRequest request) { carpetaService.crearCarpeta(autenticacionUtil.nombreUsuarioAutenticado(), request.carpetaPadreId(), request.nombre()); }
    @PatchMapping("/{id}") public void renombrar(@PathVariable Long id, @Valid @RequestBody RenombrarRequest request) { carpetaService.renombrarCarpeta(autenticacionUtil.nombreUsuarioAutenticado(), id, request.nombre()); }
}
