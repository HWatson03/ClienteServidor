package org.servidor.personal.clienteservidor.archivos.presentacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.PapeleraService;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/papelera")
@RequiredArgsConstructor
public class PapeleraApi {
    private final PapeleraService papeleraService;
    private final UsuarioRepository usuarioRepository;
    private final ArchivoRepository archivoRepository;
    private final CarpetaRepository carpetaRepository;

    @GetMapping
    public List<Map<String, Object>> listar(@RequestParam String nombreUsuario) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        List<Map<String, Object>> resultado = new ArrayList<>();
        for (Archivo a : archivoRepository.findAll()) {
            if (a.getPropietario() != null && usuario.getIdUsuario().equals(a.getPropietario().getIdUsuario()) && a.isEnPapelera()) {
                resultado.add(Map.of(
                        "tipo", "ARCHIVO",
                        "idArchivo", a.getIdArchivo(),
                        "nombreVisible", a.getNombreVisible() != null ? a.getNombreVisible() : "",
                        "tamano", a.getTamano() != null ? a.getTamano() : 0
                ));
            }
        }
        for (Carpeta c : carpetaRepository.findAll()) {
            if (c.getPropietario() != null && usuario.getIdUsuario().equals(c.getPropietario().getIdUsuario()) && c.isEnPapelera()) {
                resultado.add(Map.of(
                        "tipo", "CARPETA",
                        "idCarpeta", c.getIdCarpeta(),
                        "nombre", c.getNombre() != null ? c.getNombre() : ""
                ));
            }
        }
        return resultado;
    }

    @DeleteMapping("/archivos/{id}") public void enviarAPapelera(@RequestParam String nombreUsuario, @PathVariable Long id) { papeleraService.enviarArchivoAPapelera(nombreUsuario, id); }
    @PostMapping("/{tipo}/{id}/restaurar") public void restaurar(@RequestParam String nombreUsuario, @PathVariable String tipo, @PathVariable Long id) { papeleraService.restaurar(nombreUsuario, tipo, id); }
    @DeleteMapping("/{tipo}/{id}") public void eliminarDefinitivamente(@RequestParam String nombreUsuario, @PathVariable String tipo, @PathVariable Long id) { papeleraService.eliminarDefinitivamente(nombreUsuario, tipo, id); }
}
