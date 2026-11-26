package org.servidor.personal.clienteservidor.identidad.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.presentacion.dto.*;
import org.servidor.personal.clienteservidor.infraestructura.AutenticacionUtil;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.List;
import java.util.Map;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Persona;
import org.servidor.personal.clienteservidor.identidad.dominio.SolicitudUsuario;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.aplicacion.HistorialAlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.aplicacion.ActividadArchivosService;
import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.ArchivoResponse;
import org.servidor.personal.clienteservidor.archivos.presentacion.dto.PaginaResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthApi {
    private final AuthService authService;
    private final AutenticacionUtil autenticacionUtil;
    private final ArchivoRepository archivoRepository;
    private final CarpetaRepository carpetaRepository;
    private final org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository sesionRepository;
    private final HistorialAlmacenamientoService historialAlmacenamientoService;
    private final ActividadArchivosService actividadArchivosService;
    private final AlmacenamientoService almacenamientoService;
    @PostMapping("/registro") @ResponseStatus(HttpStatus.GONE) public void registrar(@Valid @RequestBody RegistroRequest request) { throw new IllegalArgumentException("El registro público está deshabilitado"); }
    @PostMapping("/solicitudes") @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> solicitarAcceso(@Valid @RequestBody SolicitudRequest request) {
        authService.solicitarAcceso(persona(request), request.nombreUsuario(), request.contrasena());
        return Map.of("mensaje", "Solicitud recibida. Un administrador revisará tus datos.");
    }
    @PostMapping("/login") public LoginResponse login(@Valid @RequestBody LoginRequest request) { return new LoginResponse(authService.login(request.nombreUsuario(), request.contrasena())); }
    @PatchMapping("/contrasena") @ResponseStatus(HttpStatus.NO_CONTENT) public void cambiarContrasena(@Valid @RequestBody CambioContrasenaRequest request) { authService.cambiarContrasena(autenticacionUtil.nombreUsuarioAutenticado(), request.contrasenaActual(), request.contrasenaNueva()); }
    @GetMapping("/sesiones") public List<SesionResponse> listarSesiones() { return authService.listarSesionesActivas(autenticacionUtil.nombreUsuarioAutenticado()).stream().map(s -> new SesionResponse(s.getIdSesion(), s.getExpiraEn())).toList(); }
    @DeleteMapping("/sesiones/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void revocarSesion(@PathVariable Long id) { authService.revocarSesion(autenticacionUtil.nombreUsuarioAutenticado(), id); }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(@RequestHeader(value = "Authorization", required = false) String authorization) { authService.logout(extraerToken(authorization)); }
    private String extraerToken(String authorization) { return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null; }
    @PostMapping("/refresh") @ResponseStatus(HttpStatus.NO_CONTENT) public void refresh(@RequestHeader(value = "Authorization", required = false) String authorization) { authService.refresh(extraerToken(authorization)); }
    @GetMapping("/me") public UsuarioActualResponse yo() {
        Usuario usuario = authService.obtenerUsuario(autenticacionUtil.nombreUsuarioAutenticado());
        return new UsuarioActualResponse(usuario.getIdUsuario(), usuario.getNombreUsuario(), usuario.getRol());
    }
    @GetMapping("/admin/usuarios") public List<UsuarioResponse> listarUsuarios() {
        return authService.listarUsuarios().stream()
                .map(this::usuarioResponse)
                .toList();
    }
    @PostMapping("/admin/usuarios") @ResponseStatus(HttpStatus.CREATED)
    public UsuarioResponse crearCliente(@Valid @RequestBody CrearClienteRequest request) {
        Usuario u = authService.crearCliente(persona(request), request.nombreUsuario(), request.contrasena());
        return usuarioResponse(u);
    }
    @GetMapping("/admin/solicitudes")
    public List<SolicitudResponse> solicitudesPendientes() {
        return authService.solicitudesPendientes().stream().map(this::solicitudResponse).toList();
    }
    @PostMapping("/admin/solicitudes/{id}/aprobar")
    public UsuarioResponse aprobarSolicitud(@PathVariable Long id) {
        return usuarioResponse(authService.aprobarSolicitud(id, autenticacionUtil.nombreUsuarioAutenticado()));
    }
    @PostMapping("/admin/solicitudes/{id}/rechazar") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void rechazarSolicitud(@PathVariable Long id) {
        authService.rechazarSolicitud(id, autenticacionUtil.nombreUsuarioAutenticado());
    }
    private Persona persona(CrearClienteRequest r) {
        Persona p = new Persona(); p.setNombres(r.nombres()); p.setApellidoPaterno(r.apellidoPaterno());
        p.setApellidoMaterno(r.apellidoMaterno()); p.setCi(r.ci()); p.setCorreo(r.correo()); p.setTelefono(r.telefono());
        return p;
    }
    private Persona persona(SolicitudRequest r) {
        Persona p = new Persona(); p.setNombres(r.nombres()); p.setApellidoPaterno(r.apellidoPaterno());
        p.setApellidoMaterno(r.apellidoMaterno()); p.setCi(r.ci()); p.setCorreo(r.correo()); p.setTelefono(r.telefono());
        return p;
    }
    private UsuarioResponse usuarioResponse(Usuario u) {
        Persona p = u.getPersona();
        return new UsuarioResponse(u.getIdUsuario(), u.getNombreUsuario(), u.getRol(), u.getEstado(), u.getCuotaMaxBytes(),
                p == null ? null : p.getNombres(), p == null ? null : p.getApellidoPaterno(),
                p == null ? null : p.getApellidoMaterno(), p == null ? null : p.getCi(),
                p == null ? null : p.getCorreo(), p == null ? null : p.getTelefono());
    }
    private SolicitudResponse solicitudResponse(SolicitudUsuario s) {
        return new SolicitudResponse(s.getIdSolicitud(), s.getNombres(), s.getApellidoPaterno(), s.getApellidoMaterno(),
                s.getCi(), s.getCorreo(), s.getTelefono(), s.getNombreUsuario(), s.getFechaSolicitud());
    }
    @PatchMapping("/admin/usuarios/{id}")
    public UsuarioResponse actualizarCliente(@PathVariable Long id, @RequestBody ActualizarClienteRequest request) {
        Usuario u = authService.actualizarCliente(id, request.nombreUsuario(), request.contrasena());
        return usuarioResponse(u);
    }
    @PatchMapping("/admin/usuarios/{id}/administracion")
    public UsuarioResponse administrarCliente(@PathVariable Long id, @RequestBody AdministrarClienteRequest request) {
        Usuario u = authService.administrarCliente(id, request.bloqueado(), request.cuotaMaxBytes());
        return usuarioResponse(u);
    }
    @GetMapping("/admin/usuarios/{id}/sesiones")
    public List<SesionResponse> sesionesCliente(@PathVariable Long id) {
        return authService.sesionesCliente(id).stream().map(s -> new SesionResponse(s.getIdSesion(), s.getExpiraEn())).toList();
    }
    @GetMapping("/admin/usuarios/{id}/carpetas")
    public CarpetasClienteResponse explorarCliente(@PathVariable Long id, @RequestParam(required = false) Long carpetaId) {
        return new CarpetasClienteResponse(
                authService.subcarpetas(id, carpetaId).stream().map(c -> new CarpetaAdminResponse(c.getIdCarpeta(), c.getNombre())).toList(),
                authService.archivosEnCarpeta(id, carpetaId).stream().map(a -> new ArchivoResponse(a.getIdArchivo(), a.getNombreVisible(), a.getTamano(), a.getTipoMime())).toList());
    }
    @GetMapping("/admin/usuarios/{id}/papelera")
    public List<Map<String, Object>> papeleraCliente(@PathVariable Long id) {
        Usuario usuario = authService.obtenerCliente(id);
        List<Map<String, Object>> items = new java.util.ArrayList<>();
        archivoRepository.findByPropietarioAndEnPapeleraTrue(usuario).forEach(a -> items.add(Map.of(
                "tipo", "ARCHIVO", "id", a.getIdArchivo(), "nombre", a.getNombreVisible(), "tamano", a.getTamano())));
        carpetaRepository.findByPropietarioAndEnPapeleraTrue(usuario).forEach(c -> items.add(Map.of(
                "tipo", "CARPETA", "id", c.getIdCarpeta(), "nombre", c.getNombre(), "tamano", 0)));
        return items;
    }
    @GetMapping("/admin/sesiones")
    public List<SesionAdminResponse> sesionesActivas() {
        return authService.listarUsuarios().stream().filter(u -> "CLIENTE".equals(u.getRol()))
                .flatMap(u -> sesionRepository.findByUsuarioAndRevocadaFalseAndExpiraEnAfter(u, LocalDateTime.now()).stream()
                        .map(s -> new SesionAdminResponse(s.getIdSesion(), u.getNombreUsuario(), s.getFechaCreacion(), s.getExpiraEn())))
                .toList();
    }
    @GetMapping("/admin/actividad")
    public List<ActividadArchivosService.Actividad> actividadReciente() {
        return actividadArchivosService.recientes();
    }
    @GetMapping("/admin/almacenamiento") public List<AlmacenamientoUsuarioResponse> resumenAlmacenamiento() {
        return authService.resumenClientes().stream().map(c -> {
            Usuario u = c.getUsuario();
            return new AlmacenamientoUsuarioResponse(u.getIdUsuario(), u.getNombreUsuario(), u.getEstado(),
                    u.getCuotaMaxBytes(), c.getBytesOcupados(), c.getBytesReservados(),
                    Math.max(0L, u.getCuotaMaxBytes() - c.getBytesOcupados() - c.getBytesReservados()),
                    archivoRepository.contarActivosPorUsuario(u), u.getPersona() == null ? null : u.getPersona().getNombres(),
                    u.getPersona() == null ? null : u.getPersona().getApellidoPaterno(),
                    u.getPersona() == null ? null : u.getPersona().getApellidoMaterno(),
                    u.getPersona() == null ? null : u.getPersona().getCi());
        }).toList();
    }
    @GetMapping("/admin/almacenamiento/servidor") public EspacioServidorResponse espacioServidor() {
        var espacio = almacenamientoService.espacioDisco();
        return new EspacioServidorResponse(espacio.total(), espacio.disponible(),
                Math.max(0L, espacio.total() - espacio.disponible()));
    }
    @GetMapping("/admin/almacenamiento/historial")
    public List<HistorialAlmacenamientoService.Snapshot> historialAlmacenamiento() {
        return historialAlmacenamientoService.listar();
    }
    @GetMapping("/admin/usuarios/{id}/archivos") public PaginaResponse<ArchivoResponse> listarArchivosCliente(
            @PathVariable Long id, @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "50") int tamano) {
        Usuario u = authService.obtenerUsuarioPorId(id);
        Page<Archivo> page = archivoRepository.findByPropietarioAndEnPapeleraFalse(u,
                PageRequest.of(Math.max(0, pagina), Math.min(Math.max(1, tamano), 200)));
        return new PaginaResponse<>(page.map(a -> new ArchivoResponse(a.getIdArchivo(), a.getNombreVisible(), a.getTamano(), a.getTipoMime())).getContent(),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages(), page.isFirst(), page.isLast());
    }
    @GetMapping("/admin/usuarios/{usuarioId}/archivos/{archivoId}/descargar")
    public ResponseEntity<Resource> descargarArchivoCliente(@PathVariable Long usuarioId, @PathVariable Long archivoId) {
        Usuario u = authService.obtenerUsuarioPorId(usuarioId);
        Archivo archivo = archivoRepository.findByIdArchivoAndPropietarioAndEnPapeleraFalse(archivoId, u)
                .orElseThrow(() -> new IllegalArgumentException("Archivo no encontrado"));
        Path ruta = almacenamientoService.obtenerArchivoFinal(archivo.getClaveDisco());
        if (!Files.isRegularFile(ruta) || !Files.isReadable(ruta)) return ResponseEntity.notFound().build();
        String mime = archivo.getTipoMime() == null || archivo.getTipoMime().isBlank()
                ? MediaType.APPLICATION_OCTET_STREAM_VALUE : archivo.getTipoMime();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime)).contentLength(archivo.getTamano())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(archivo.getNombreVisible(), StandardCharsets.UTF_8).build().toString())
                .body(new FileSystemResource(ruta));
    }
    public record UsuarioActualResponse(Long idUsuario, String nombreUsuario, String rol) {}
    public record UsuarioResponse(Long idUsuario, String nombreUsuario, String rol, String estado, Long cuotaMaxBytes,
            String nombres, String apellidoPaterno, String apellidoMaterno, String ci, String correo, String telefono) {}
    public record CrearClienteRequest(String nombres, String apellidoPaterno, String apellidoMaterno, String ci, String correo, String telefono, String nombreUsuario, String contrasena) {}
    public record SolicitudRequest(String nombres, String apellidoPaterno, String apellidoMaterno, String ci, String correo, String telefono, String nombreUsuario, String contrasena) {}
    public record SolicitudResponse(Long idSolicitud, String nombres, String apellidoPaterno, String apellidoMaterno, String ci, String correo, String telefono, String nombreUsuario, LocalDateTime fechaSolicitud) {}
    public record ActualizarClienteRequest(String nombreUsuario, String contrasena) {}
    public record AdministrarClienteRequest(Boolean bloqueado, Long cuotaMaxBytes) {}
    public record CarpetaAdminResponse(Long idCarpeta, String nombre) {}
    public record CarpetasClienteResponse(List<CarpetaAdminResponse> carpetas, List<ArchivoResponse> archivos) {}
    public record SesionAdminResponse(Long idSesion, String nombreUsuario, LocalDateTime creadaEn, LocalDateTime expiraEn) {}
    public record AlmacenamientoUsuarioResponse(Long idUsuario, String nombreUsuario, String estado,
            Long limite, Long ocupados, Long reservados, Long disponibles, long cantidadArchivos,
            String nombres, String apellidoPaterno, String apellidoMaterno, String ci) {}
    public record EspacioServidorResponse(long total, long disponible, long usado) {}
}
