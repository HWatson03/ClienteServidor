package org.servidor.personal.clienteservidor.transferencias.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.ArchivoResponse;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.servidor.personal.clienteservidor.transferencias.aplicacion.CargaService;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.CargaResponse;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.FinalizarCargaResponse;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.IniciarCargaRequest;
import org.servidor.personal.clienteservidor.transferencias.presentacion.dto.PrevalidacionCargaResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@RestController
@RequestMapping("/api/cargas")
@RequiredArgsConstructor
public class CargaApi {
    private final CargaService cargaService;
    private final AutenticacionUtil autenticacionUtil;
    @PostMapping("/prevalidar") public PrevalidacionCargaResponse prevalidar(@Valid @RequestBody IniciarCargaRequest request) { long disponible = cargaService.validarEspacio(autenticacionUtil.nombreUsuarioAutenticado(), request.carpetaDestinoId(), request.tamanoEsperado()); return new PrevalidacionCargaResponse(request.tamanoEsperado(), disponible); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public CargaResponse iniciar(@Valid @RequestBody IniciarCargaRequest request) { Carga carga = cargaService.iniciar(autenticacionUtil.nombreUsuarioAutenticado(), request.carpetaDestinoId(), request.nombreArchivo(), request.tamanoEsperado()); return respuesta(carga); }
    @GetMapping("/{id}") public CargaResponse consultar(@PathVariable Long id) { return respuesta(cargaService.consultar(autenticacionUtil.nombreUsuarioAutenticado(), id)); }
    @PutMapping("/{id}/fragmento") public CargaResponse subirFragmento(@PathVariable Long id, @RequestParam long offset, @RequestParam("file") MultipartFile file) throws IOException { return respuesta(cargaService.subirFragmento(autenticacionUtil.nombreUsuarioAutenticado(), id, offset, file.getInputStream())); }
    @PostMapping("/{id}/finalizar") public FinalizarCargaResponse finalizar(@PathVariable Long id) { var resultado = cargaService.finalizar(autenticacionUtil.nombreUsuarioAutenticado(), id); Archivo archivo = resultado.archivo(); return new FinalizarCargaResponse(new ArchivoResponse(archivo.getIdArchivo(), archivo.getNombreVisible(), archivo.getTamano(), archivo.getTipoMime()), resultado.duplicado()); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void cancelar(@PathVariable Long id) { cargaService.cancelar(autenticacionUtil.nombreUsuarioAutenticado(), id); }

    private CargaResponse respuesta(Carga carga) { return new CargaResponse(carga.getIdCarga(), carga.getOffsetConfirmado(), carga.getEstado(), carga.getTamanoEsperado()); }
}
