package org.servidor.personal.clienteservidor.archivos.presentacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CuotaService;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/almacenamiento")
@RequiredArgsConstructor
public class AlmacenamientoApi {
    private final CuotaService cuotaService;
    private final AutenticacionUtil autenticacionUtil;
    @GetMapping("/resumen") public Map<String, Long> resumen() { 
        var r = cuotaService.resumen(autenticacionUtil.nombreUsuarioAutenticado());
        Map<String, Long> m = new HashMap<>();
        m.put("limite", r.limite());
        m.put("ocupados", r.ocupados());
        m.put("reservados", r.reservados());
        m.put("disponibles", r.disponibles());
        return m;
    }
}
