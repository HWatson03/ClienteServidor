package org.servidor.personal.clienteservidor.identidad.presentacion;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

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

    @PatchMapping("/contrasena")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cambiarContrasena(@Valid @RequestBody CambioContrasenaRequest request) {
        authService.cambiarContrasena(request.nombreUsuario(), request.contrasenaActual(), request.contrasenaNueva());
    }

    public record RegistroRequest(@NotBlank String nombreUsuario, @NotBlank String contrasena) {}
    public record LoginRequest(@NotBlank String nombreUsuario, @NotBlank String contrasena) {}
    public record LoginResponse(String token) {}
    public record CambioContrasenaRequest(@NotBlank String nombreUsuario, @NotBlank String contrasenaActual, @NotBlank String contrasenaNueva) {}
}
