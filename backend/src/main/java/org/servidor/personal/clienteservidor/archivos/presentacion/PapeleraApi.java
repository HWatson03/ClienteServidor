package org.servidor.personal.clienteservidor.archivos.presentacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.PapeleraService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/papelera")
@RequiredArgsConstructor
public class PapeleraApi {
    private final PapeleraService papeleraService;
    @DeleteMapping("/archivos/{id}") public void enviarAPapelera(@RequestParam String nombreUsuario, @PathVariable Long id) { papeleraService.enviarArchivoAPapelera(nombreUsuario, id); }
    @PostMapping("/{tipo}/{id}/restaurar") public void restaurar(@RequestParam String nombreUsuario, @PathVariable String tipo, @PathVariable Long id) { papeleraService.restaurar(nombreUsuario, tipo, id); }
    @DeleteMapping("/{tipo}/{id}") public void eliminarDefinitivamente(@RequestParam String nombreUsuario, @PathVariable String tipo, @PathVariable Long id) { papeleraService.eliminarDefinitivamente(nombreUsuario, tipo, id); }
}
