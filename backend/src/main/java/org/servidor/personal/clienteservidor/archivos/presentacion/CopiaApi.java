package org.servidor.personal.clienteservidor.archivos.presentacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CopiaService;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.CopiaRequest;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.CopiaResponse;
import org.servidor.personal.clienteservidor.transferencias.dominio.TareaCopia;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/copias")
@RequiredArgsConstructor
public class CopiaApi {

    private final CopiaService copiaService;

    @PostMapping
    public CopiaResponse crear(@RequestParam String nombreUsuario, @RequestBody CopiaRequest request) {
        TareaCopia tarea = copiaService.copiarArchivo(nombreUsuario, request.origenId(), request.destinoId());
        return response(tarea);
    }

    @GetMapping("/{id}")
    public CopiaResponse consultar(@RequestParam String nombreUsuario, @PathVariable Long id) {
        TareaCopia tarea = copiaService.consultar(nombreUsuario, id);
        return response(tarea);
    }

    private static CopiaResponse response(TareaCopia tarea) {
        return new CopiaResponse(tarea.getIdTareaCopia(), tarea.getEstado(), tarea.getBytesCopiados(), tarea.getTotalBytes());
    }
}
