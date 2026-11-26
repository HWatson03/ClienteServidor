package org.servidor.personal.clienteservidor.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Sirve las aplicaciones Vue empaquetadas en el mismo JAR que Spring Boot. */
@Controller
public class VueController {

    @GetMapping({"/", "/auth/**", "/usuarios", "/cliente", "/profile", "/logs"})
    public String administracion() {
        return "forward:/vue/index.html";
    }

    @GetMapping({"/fexcoin-vivo", "/fexcoin-vivo/**"})
    public String feriaPublica() {
        return "forward:/vue/feria.html";
    }

    @GetMapping({"/evaluar", "/evaluar/**"})
    public String evaluacionJurado() {
        return "forward:/vue/jurado.html";
    }

}
