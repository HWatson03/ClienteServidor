package org.servidor.personal.clienteservidor.archivos.presentacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CuotaService;
import org.servidor.personal.clienteservidor.archivos.aplicacion.dto.ResumenCuota;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/almacenamiento")
@RequiredArgsConstructor
public class AlmacenamientoApi {
    private final CuotaService cuotaService;
    @GetMapping("/resumen") public ResumenCuota cuota(@RequestParam String nombreUsuario) { return cuotaService.resumen(nombreUsuario); }
}
