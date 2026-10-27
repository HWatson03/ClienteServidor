package org.servidor.personal.clienteservidor.identidad.presentacion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    public void registrar(@Valid @RequestBody RegistroRequest request) {
        authService.registrar(request.nombreUsuario(), request.contrasena());
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        String token = authService.login(request.nombreUsuario(), request.contrasena());
        return new LoginResponse(token);
    }

    @PostMapping("/refresh")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void refresh(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String token = extraerToken(authorization);
        authService.refresh(token);
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "Authorization", required = false) String authorization) {
        String token = extraerToken(authorization);
        authService.logout(token);
    }

    @GetMapping("/sesiones")
    public List<SesionResponse> listarSesiones(@RequestParam String nombreUsuario) {
        return authService.listarSesionesActivas(nombreUsuario).stream()
                .map(s -> new SesionResponse(s.getId(), s.getExpiraEn()))
                .toList();
    }

    @DeleteMapping("/sesiones/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revocarSesion(@RequestParam String nombreUsuario, @PathVariable UUID id) {
        authService.revocarSesion(nombreUsuario, id);
    }

    @PatchMapping("/contrasena")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cambiarContrasena(@Valid @RequestBody CambioContrasenaRequest request) {
        authService.cambiarContrasena(request.nombreUsuario(), request.contrasenaActual(), request.contrasenaNueva());
    }

    private String extraerToken(String authorization) {
        if (authorization != null && authorization.startsWith("Bearer ")) {
            return authorization.substring(7);
        }
        return null;
    }

    public record RegistroRequest(@NotBlank String nombreUsuario, @NotBlank String contrasena) {}
    public record LoginRequest(@NotBlank String nombreUsuario, @NotBlank String contrasena) {}
    public record LoginResponse(String token) {}
    public record CambioContrasenaRequest(@NotBlank String nombreUsuario, @NotBlank String contrasenaActual, @NotBlank String contrasenaNueva) {}
    public record SesionResponse(UUID id, java.time.LocalDateTime expiraEn) {}
}
