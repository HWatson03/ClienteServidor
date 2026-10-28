package org.servidor.personal.clienteservidor.transferencias.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.ArchivoResponse;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.servidor.personal.clienteservidor.transferencias.aplicacion.CargaService;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.CargaResponse;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.IniciarCargaRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/cargas")
@RequiredArgsConstructor
public class CargaApi {
    private final CargaService cargaService;
    private final AutenticacionUtil autenticacionUtil;
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public CargaResponse iniciar(@Valid @RequestBody IniciarCargaRequest request) { Carga carga = cargaService.iniciar(autenticacionUtil.nombreUsuarioAutenticado(), request.carpetaDestinoId(), request.nombreArchivo(), request.tamanoEsperado()); return new CargaResponse(carga.getIdCarga(), carga.getOffsetConfirmado(), carga.getEstado()); }
    @GetMapping("/{id}") public CargaResponse consultar(@PathVariable Long id) { Carga carga = cargaService.consultar(autenticacionUtil.nombreUsuarioAutenticado(), id); return new CargaResponse(carga.getIdCarga(), carga.getOffsetConfirmado(), carga.getEstado()); }
    @PutMapping("/{id}/fragmento") public void subirFragmento(@PathVariable Long id, @RequestParam long offset, @RequestParam("file") MultipartFile file) throws IOException { cargaService.subirFragmento(autenticacionUtil.nombreUsuarioAutenticado(), id, offset, file.getInputStream()); }
    @PostMapping("/{id}/finalizar") public ArchivoResponse finalizar(@PathVariable Long id) { Archivo archivo = cargaService.finalizar(autenticacionUtil.nombreUsuarioAutenticado(), id); return new ArchivoResponse(archivo.getIdArchivo(), archivo.getNombreVisible(), archivo.getTamano(), archivo.getTipoMime()); }
}
