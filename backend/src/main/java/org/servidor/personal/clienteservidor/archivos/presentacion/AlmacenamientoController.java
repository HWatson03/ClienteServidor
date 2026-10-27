package org.servidor.personal.clienteservidor.archivos.presentacion;

import org.servidor.personal.clienteservidor.archivos.aplicacion.CuotaService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/almacenamiento")
public class AlmacenamientoController {

    private final CuotaService cuotaService;

    public AlmacenamientoController(CuotaService cuotaService) {
        this.cuotaService = cuotaService;
    }

    @GetMapping("/resumen")
    public CuotaService.ResumenCuota resumen(@RequestParam String nombreUsuario) {
        return cuotaService.resumen(nombreUsuario);
    }
}
