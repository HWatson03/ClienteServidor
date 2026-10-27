package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.ArchivoService;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.*;
import org.springframework.data.domain.Page;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/archivos")
@RequiredArgsConstructor
public class ArchivoApi {
    private final ArchivoService archivoService;
    @GetMapping public Page<ArchivoResponse> listar(@RequestParam String nombreUsuario, @RequestParam(required = false) Long carpetaId, @RequestParam(required = false) String nombre, @RequestParam(defaultValue = "0") int pagina, @RequestParam(defaultValue = "50") int tamano) { Page<Archivo> page = archivoService.listar(nombreUsuario, carpetaId, nombre, pagina, tamano); return page.map(a -> new ArchivoResponse(a.getIdArchivo(), a.getNombreVisible(), a.getTamano(), a.getTipoMime())); }
    @PatchMapping("/{id}") public void renombrar(@RequestParam String nombreUsuario, @PathVariable Long id, @Valid @RequestBody RenombrarRequest request) { archivoService.renombrar(nombreUsuario, id, request.nombre()); }
}
