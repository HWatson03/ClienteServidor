package org.servidor.personal.clienteservidor.transferencias.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CopiaService;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.servidor.personal.clienteservidor.transferencias.dominio.TareaCopia;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.CopiaRequest;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.TareaCopiaResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/copias")
@RequiredArgsConstructor
public class CopiaApi {
    private final CopiaService copiaService;
    private final AutenticacionUtil autenticacionUtil;
    @PostMapping public TareaCopiaResponse copiar(@Valid @RequestBody CopiaRequest request) { TareaCopia tarea = copiaService.copiarArchivo(autenticacionUtil.nombreUsuarioAutenticado(), request.archivoId(), request.carpetaDestinoId()); return new TareaCopiaResponse(tarea.getIdTareaCopia(), tarea.getBytesCopiados(), tarea.getTotalBytes(), tarea.getEstado()); }
    @GetMapping("/{id}") public TareaCopiaResponse consultar(@PathVariable Long id) { TareaCopia tarea = copiaService.consultar(autenticacionUtil.nombreUsuarioAutenticado(), id); return new TareaCopiaResponse(tarea.getIdTareaCopia(), tarea.getBytesCopiados(), tarea.getTotalBytes(), tarea.getEstado()); }
}
