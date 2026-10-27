package org.servidor.personal.clienteservidor.archivos;

import org.junit.jupiter.api.Test;
import org.servidor.personal.clienteservidor.archivos.aplicacion.CarpetaService;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;


import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CarpetasTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private CarpetaService carpetaService;

    @Autowired
    private CarpetaRepository carpetaRepository;

    @Test
    void crearCarpetaYConflictoConPrefijo() {
        authService.registrar("userC", "clave123");
        Carpeta raiz = carpetaRepository.findAll().stream()
                .filter(c -> c.getPropietario().getNombreUsuario().equals("userC") && c.isEsRaiz())
                .findFirst().orElseThrow();
        
        Carpeta carpeta1 = carpetaService.crearCarpeta("userC", raiz.getIdCarpeta(), "Documentos");
        Carpeta carpeta2 = carpetaService.crearCarpeta("userC", raiz.getIdCarpeta(), "Documentos");
        
        assertEquals("Documentos", carpeta1.getNombre());
        assertEquals("(1) Documentos", carpeta2.getNombre());
    }
}
