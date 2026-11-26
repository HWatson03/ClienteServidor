package org.servidor.personal.clienteservidor.identidad.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.dominio.Persona;
import org.servidor.personal.clienteservidor.identidad.dominio.SolicitudUsuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SesionRepository;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.infraestructura.PersonaRepository;
import org.servidor.personal.clienteservidor.identidad.infraestructura.SolicitudUsuarioRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UsuarioRepository usuarioRepository;
    private final SesionRepository sesionRepository;
    private final PasswordEncoder passwordEncoder;
    private final SecureRandom random = new SecureRandom();
    private final CarpetaRepository carpetaRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final ArchivoRepository archivoRepository;
    private final PersonaRepository personaRepository;
    private final SolicitudUsuarioRepository solicitudUsuarioRepository;
    private final TokenService tokenService;



    @Transactional
    public void registrar(String nombreUsuario, String contrasena) {
        crearUsuario(nombreUsuario, contrasena, "CLIENTE");
    }

    @Transactional
    public void crearCliente(String nombreUsuario, String contrasena) {
        crearUsuario(nombreUsuario, contrasena, "CLIENTE");
    }

    @Transactional
    public Usuario crearCliente(Persona datos, String nombreUsuario, String contrasena) {
        validarPersona(datos);
        validarNombreUsuarioDisponible(nombreUsuario);
        validarPersonaDisponible(datos.getCi(), datos.getCorreo());
        datos.setNombres(datos.getNombres().trim());
        datos.setApellidoPaterno(datos.getApellidoPaterno().trim());
        datos.setApellidoMaterno(datos.getApellidoMaterno().trim());
        datos.setCi(datos.getCi().trim());
        datos.setCorreo(datos.getCorreo().trim().toLowerCase());
        datos.setTelefono(datos.getTelefono().trim());
        String hash = passwordEncoder.encode(validarContrasena(contrasena));
        Persona persona = personaRepository.save(datos);
        return crearCuenta(persona, nombreUsuario, hash);
    }

    @Transactional
    public SolicitudUsuario solicitarAcceso(Persona datos, String nombreUsuario, String contrasena) {
        validarPersona(datos);
        validarNombreUsuarioDisponible(nombreUsuario);
        if (solicitudUsuarioRepository.existsByNombreUsuarioIgnoreCaseAndEstado(nombreUsuario.trim(), "PENDIENTE"))
            throw new IllegalArgumentException("Ya existe una solicitud pendiente con ese usuario");
        validarPersonaDisponible(datos.getCi(), datos.getCorreo());
        if (solicitudUsuarioRepository.existsByCiIgnoreCaseAndEstado(datos.getCi().trim(), "PENDIENTE")
                || solicitudUsuarioRepository.existsByCorreoIgnoreCaseAndEstado(datos.getCorreo().trim(), "PENDIENTE"))
            throw new IllegalArgumentException("Ya existe una solicitud pendiente con esos datos personales");
        SolicitudUsuario solicitud = new SolicitudUsuario();
        copiarPersona(datos, solicitud);
        solicitud.setNombreUsuario(nombreUsuario.trim());
        solicitud.setContrasenaHash(passwordEncoder.encode(validarContrasena(contrasena)));
        solicitud.setEstado("PENDIENTE");
        return solicitudUsuarioRepository.save(solicitud);
    }

    @Transactional(readOnly = true)
    public List<SolicitudUsuario> solicitudesPendientes() {
        return solicitudUsuarioRepository.findByEstadoOrderByFechaSolicitudDesc("PENDIENTE");
    }

    @Transactional
    public Usuario aprobarSolicitud(Long id, String admin) {
        SolicitudUsuario solicitud = solicitudUsuarioRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitud no encontrada"));
        if (!"PENDIENTE".equals(solicitud.getEstado())) throw new IllegalArgumentException("La solicitud ya fue revisada");
        validarNombreUsuarioDisponible(solicitud.getNombreUsuario());
        validarPersonaDisponible(solicitud.getCi(), solicitud.getCorreo());
        Persona persona = new Persona();
        persona.setNombres(solicitud.getNombres());
        persona.setApellidoPaterno(solicitud.getApellidoPaterno());
        persona.setApellidoMaterno(solicitud.getApellidoMaterno());
        persona.setCi(solicitud.getCi());
        persona.setCorreo(solicitud.getCorreo());
        persona.setTelefono(solicitud.getTelefono());
        persona = personaRepository.save(persona);
        Usuario usuario = crearCuenta(persona, solicitud.getNombreUsuario(), solicitud.getContrasenaHash());
        solicitud.setEstado("APROBADA");
        solicitud.setRevisadaEn(LocalDateTime.now());
        solicitud.setRevisadaPor(admin);
        solicitudUsuarioRepository.save(solicitud);
        return usuario;
    }

    @Transactional
    public void rechazarSolicitud(Long id, String admin) {
        SolicitudUsuario solicitud = solicitudUsuarioRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Solicitud no encontrada"));
        if (!"PENDIENTE".equals(solicitud.getEstado())) throw new IllegalArgumentException("La solicitud ya fue revisada");
        solicitud.setEstado("RECHAZADA");
        solicitud.setRevisadaEn(LocalDateTime.now());
        solicitud.setRevisadaPor(admin);
        solicitudUsuarioRepository.save(solicitud);
    }

    private Usuario crearCuenta(Persona persona, String nombreUsuario, String hash) {
        Usuario usuario = new Usuario();
        usuario.setNombreUsuario(nombreUsuario.trim());
        usuario.setContrasenaHash(hash);
        usuario.setCuotaMaxBytes(1_000_000_000L);
        usuario.setEstado("ACTIVO");
        usuario.setRol("CLIENTE");
        usuario.setPersona(persona);
        usuarioRepository.save(usuario);
        Carpeta raiz = new Carpeta();
        raiz.setPropietario(usuario); raiz.setNombre("Raíz"); raiz.setEsRaiz(true);
        raiz.setEnPapelera(false); raiz.setEstado("ACTIVO");
        carpetaRepository.save(raiz);
        CuotaUsuario cuota = new CuotaUsuario();
        cuota.setUsuario(usuario); cuota.setBytesOcupados(0L); cuota.setBytesReservados(0L); cuota.setEstado("ACTIVO");
        cuotaUsuarioRepository.save(cuota);
        return usuario;
    }

    private void validarPersona(Persona p) {
        if (p == null || vacio(p.getNombres()) || vacio(p.getApellidoPaterno()) || vacio(p.getApellidoMaterno())
                || vacio(p.getCi()) || vacio(p.getCorreo()) || vacio(p.getTelefono()))
            throw new IllegalArgumentException("Completa todos los datos personales");
        if (!p.getCorreo().trim().matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            throw new IllegalArgumentException("El correo no es válido");
    }
    private boolean vacio(String s) { return s == null || s.isBlank(); }
    private String validarContrasena(String s) {
        if (s == null || s.length() < 8) throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres");
        return s;
    }
    private void validarNombreUsuarioDisponible(String s) {
        if (s == null || s.isBlank() || s.trim().length() > 50) throw new IllegalArgumentException("Nombre de usuario inválido");
        if (usuarioRepository.existsByNombreUsuarioIgnoreCase(s.trim())) throw new IllegalArgumentException("Nombre de usuario ya existe");
    }
    private void validarPersonaDisponible(String ci, String correo) {
        if (personaRepository.existsByCiIgnoreCase(ci.trim())) throw new IllegalArgumentException("Ya existe una persona con ese CI");
        if (personaRepository.existsByCorreoIgnoreCase(correo.trim())) throw new IllegalArgumentException("Ya existe una persona con ese correo");
    }
    private void copiarPersona(Persona origen, SolicitudUsuario destino) {
        destino.setNombres(origen.getNombres().trim()); destino.setApellidoPaterno(origen.getApellidoPaterno().trim());
        destino.setApellidoMaterno(origen.getApellidoMaterno().trim()); destino.setCi(origen.getCi().trim());
        destino.setCorreo(origen.getCorreo().trim().toLowerCase()); destino.setTelefono(origen.getTelefono().trim());
    }

    private void crearUsuario(String nombreUsuario, String contrasena, String rol) {
        if (nombreUsuario == null || nombreUsuario.isBlank() || contrasena == null || contrasena.isBlank()) {
            throw new IllegalArgumentException("Datos de registro inválidos");
        }
        String normalizado = nombreUsuario.trim();
        if (usuarioRepository.existsByNombreUsuarioIgnoreCase(normalizado)) {
            throw new IllegalArgumentException("Nombre de usuario ya existe");
        }
        Usuario usuario = new Usuario();
        usuario.setNombreUsuario(normalizado);
        usuario.setContrasenaHash(passwordEncoder.encode(contrasena));
        usuario.setCuotaMaxBytes(1000000000L);
        usuario.setEstado("ACTIVO");
        usuario.setRol(rol);
        usuarioRepository.save(usuario);

        Carpeta raiz = new Carpeta();
        raiz.setPropietario(usuario);
        raiz.setPadre(null);
        raiz.setNombre("Raíz");
        raiz.setEsRaiz(true);
        raiz.setEnPapelera(false);
        raiz.setEstado("ACTIVO");
        carpetaRepository.save(raiz);

        CuotaUsuario cuota = new CuotaUsuario();
        cuota.setUsuario(usuario);
        cuota.setBytesOcupados(0L);
        cuota.setBytesReservados(0L);
        cuota.setEstado("ACTIVO");
        cuotaUsuarioRepository.save(cuota);
    }

    @Transactional
    public String login(String nombreUsuario, String contrasena) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Credenciales inválidas"));
        if (!passwordEncoder.matches(contrasena, usuario.getContrasenaHash())) {
            throw new IllegalArgumentException("Credenciales inválidas");
        }
        if (!"ACTIVO".equalsIgnoreCase(usuario.getEstado())) {
            throw new IllegalArgumentException("Cuenta deshabilitada");
        }
        String token = generarToken();
        String tokenHash = hash(token);
        Sesion sesion = new Sesion();
        sesion.setUsuario(usuario);
        sesion.setTokenHash(tokenHash);
        sesion.setExpiraEn(LocalDateTime.now().plusDays(7));
        sesion.setRevocada(false);
        sesion.setEstado("ACTIVO");
        sesionRepository.save(sesion);
        return token;
    }

    @Transactional(readOnly = true)
    public List<Usuario> listarUsuarios() {
        return usuarioRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    @Transactional(readOnly = true)
    public String usuarioDeToken(String token) {
        return tokenService.validarToken(token).map(Usuario::getNombreUsuario).orElse(null);
    }

    @Transactional(readOnly = true)
    public Usuario obtenerUsuarioPorId(Long id) {
        return usuarioRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    @Transactional(readOnly = true)
    public List<CuotaUsuario> resumenClientes() {
        return cuotaUsuarioRepository.findResumenesClientes();
    }

    @Transactional
    public Usuario actualizarCliente(Long idUsuario, String nombreUsuario, String contrasena) {
        Usuario usuario = usuarioRepository.findById(idUsuario)
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        if (!"CLIENTE".equals(usuario.getRol())) {
            throw new SecurityException("Solo se pueden editar cuentas cliente");
        }
        boolean cambioCredencial = false;
        if (nombreUsuario != null && !nombreUsuario.isBlank()) {
            String normalizado = nombreUsuario.trim();
            if (normalizado.length() > 50) {
                throw new IllegalArgumentException("El nombre de usuario no puede superar 50 caracteres");
            }
            if (!normalizado.equalsIgnoreCase(usuario.getNombreUsuario())) {
                if (usuarioRepository.existsByNombreUsuarioIgnoreCase(normalizado)) {
                    throw new IllegalArgumentException("Nombre de usuario ya existe");
                }
                usuario.setNombreUsuario(normalizado);
                cambioCredencial = true;
            }
        }
        if (contrasena != null && !contrasena.isBlank()) {
            if (contrasena.length() < 8) {
                throw new IllegalArgumentException("La contraseña debe tener al menos 8 caracteres");
            }
            usuario.setContrasenaHash(passwordEncoder.encode(contrasena));
            cambioCredencial = true;
        }
        if (!cambioCredencial) {
            throw new IllegalArgumentException("Indica un nombre de usuario nuevo o una contraseña nueva");
        }
        usuarioRepository.save(usuario);
        sesionRepository.revocarTodas(usuario);
        return usuario;
    }

    @Transactional
    public Usuario administrarCliente(Long id, Boolean bloqueado, Long cuotaMaxBytes) {
        Usuario usuario = obtenerCliente(id);
        if (bloqueado != null) {
            usuario.setEstado(bloqueado ? "BLOQUEADO" : "ACTIVO");
            if (bloqueado) sesionRepository.revocarTodas(usuario);
        }
        if (cuotaMaxBytes != null) {
            if (cuotaMaxBytes < 0) throw new IllegalArgumentException("La cuota no puede ser negativa");
            var cuota = cuotaUsuarioRepository.findByUsuario(usuario)
                    .orElseThrow(() -> new IllegalStateException("Cuota no encontrada"));
            if (cuotaMaxBytes < cuota.getBytesOcupados() + cuota.getBytesReservados()) {
                throw new IllegalArgumentException("La cuota no puede ser menor al espacio ocupado y reservado");
            }
            usuario.setCuotaMaxBytes(cuotaMaxBytes);
        }
        return usuarioRepository.save(usuario);
    }

    @Transactional(readOnly = true)
    public Usuario obtenerCliente(Long id) {
        Usuario usuario = obtenerUsuarioPorId(id);
        if (!"CLIENTE".equals(usuario.getRol())) throw new SecurityException("Solo se permite administrar clientes");
        return usuario;
    }

    @Transactional(readOnly = true)
    public List<Sesion> sesionesCliente(Long id) {
        obtenerCliente(id);
        return sesionRepository.findActivasPorUsuarioId(id, LocalDateTime.now());
    }

    @Transactional(readOnly = true)
    public List<Archivo> archivosEnCarpeta(Long idUsuario, Long idCarpeta) {
        Usuario usuario = obtenerCliente(idUsuario);
        Carpeta carpeta = idCarpeta == null
                ? carpetaRepository.findByPropietarioAndEsRaizTrue(usuario).orElseThrow()
                : carpetaRepository.findByIdCarpetaAndPropietario(idCarpeta, usuario)
                    .orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
        return archivoRepository.findByPropietarioAndCarpetaAndEnPapeleraFalseOrderByNombreVisibleAsc(usuario, carpeta);
    }

    @Transactional(readOnly = true)
    public List<Carpeta> subcarpetas(Long idUsuario, Long idCarpeta) {
        Usuario usuario = obtenerCliente(idUsuario);
        Carpeta carpeta = idCarpeta == null
                ? carpetaRepository.findByPropietarioAndEsRaizTrue(usuario).orElseThrow()
                : carpetaRepository.findByIdCarpetaAndPropietario(idCarpeta, usuario)
                    .orElseThrow(() -> new IllegalArgumentException("Carpeta no encontrada"));
        return carpetaRepository.findByPropietarioAndPadreAndEnPapeleraFalseOrderByNombreAsc(usuario, carpeta);
    }

    @Transactional
    public void cambiarContrasena(String nombreUsuario, String contrasenaActual, String contrasenaNueva) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        if (!passwordEncoder.matches(contrasenaActual, usuario.getContrasenaHash())) {
            throw new IllegalArgumentException("Contraseña actual incorrecta");
        }
        usuario.setContrasenaHash(passwordEncoder.encode(contrasenaNueva));
        usuarioRepository.save(usuario);
        sesionRepository.revocarTodas(usuario);
    }

    @Transactional(readOnly = true)
    public List<Sesion> listarSesionesActivas(String nombreUsuario) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        return sesionRepository.findByUsuarioAndRevocadaFalseAndExpiraEnAfter(usuario, LocalDateTime.now());
    }

    @Transactional
    public void revocarSesion(String nombreUsuario, Long sesionId) {
        Usuario usuario = usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        Sesion sesion = sesionRepository.findById(sesionId).orElseThrow(() -> new IllegalArgumentException("Sesión no encontrada"));
        if (!sesion.getUsuario().getIdUsuario().equals(usuario.getIdUsuario())) {
            throw new SecurityException("Recurso no accesible");
        }
        sesion.setRevocada(true);
        sesionRepository.save(sesion);
    }

    @Transactional
    public void logout(String token) {
        if (token == null || token.isBlank()) {
            return;
        }
        String tokenHash = hash(token);
        sesionRepository.findByTokenHash(tokenHash).ifPresent(sesion -> {
            sesion.setRevocada(true);
            sesionRepository.save(sesion);
        });
    }

    @Transactional
    public void refresh(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Token inválido");
        }
        String tokenHash = hash(token);
        Sesion sesion = sesionRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException("Sesión inválida"));
        if (sesion.isRevocada() || sesion.getExpiraEn().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Sesión inválida o expirada");
        }
        sesion.setExpiraEn(LocalDateTime.now().plusDays(7));
        sesionRepository.save(sesion);
    }

    private String generarToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(token.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Error al procesar token", e);
        }
    }
}
