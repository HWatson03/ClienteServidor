package org.servidor.personal.clienteservidor.archivos.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.aplicacion.ArchivoService;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.ArchivoResponse;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.PaginaResponse;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.RenombrarRequest;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.springframework.data.domain.Page;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/archivos")
@RequiredArgsConstructor
public class ArchivoApi {
    private final ArchivoService archivoService;
    private final AlmacenamientoService almacenamientoService;
    private final AutenticacionUtil autenticacionUtil;
    @GetMapping public PaginaResponse<ArchivoResponse> listar(@RequestParam(required = false) Long carpetaId, @RequestParam(required = false) String nombre, @RequestParam(defaultValue = "0") int pagina, @RequestParam(defaultValue = "50") int tamano) { Page<ArchivoResponse> page = archivoService.listar(autenticacionUtil.nombreUsuarioAutenticado(), carpetaId, nombre, pagina, tamano).map(a -> new ArchivoResponse(a.getIdArchivo(), a.getNombreVisible(), a.getTamano(), a.getTipoMime())); return new PaginaResponse<>(page.getContent(), page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast()); }
    @PatchMapping("/{id}") public void renombrar(@PathVariable Long id, @Valid @RequestBody RenombrarRequest request) { archivoService.renombrar(autenticacionUtil.nombreUsuarioAutenticado(), id, request.nombre()); }

    @GetMapping("/{id}/descargar")
    public ResponseEntity<Resource> descargar(@PathVariable Long id) {
        Archivo archivo = archivoService.obtenerParaDescarga(autenticacionUtil.nombreUsuarioAutenticado(), id);
        Path ruta = almacenamientoService.obtenerArchivoFinal(archivo.getClaveDisco());
        if (!Files.isRegularFile(ruta) || !Files.isReadable(ruta)) {
            return ResponseEntity.notFound().build();
        }
        String mime = archivo.getTipoMime() == null || archivo.getTipoMime().isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE : archivo.getTipoMime();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(mime))
                .contentLength(archivo.getTamano())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(archivo.getNombreVisible(), StandardCharsets.UTF_8).build().toString())
                .body(new FileSystemResource(ruta));
    }
}
