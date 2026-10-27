package org.servidor.personal.clienteservidor.identidad.presentacion;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.identidad.aplicacion.AuthService;
import org.servidor.personal.clienteservidor.identidad.dominio.Sesion;
import org.servidor.personal.clienteservidor.identidad.presentacion.dto.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthApi {
    private final AuthService authService;
    @PostMapping("/registro") @ResponseStatus(HttpStatus.CREATED) public void registrar(@Valid @RequestBody RegistroRequest request) { authService.registrar(request.nombreUsuario(), request.contrasena()); }
    @PostMapping("/login") public LoginResponse login(@Valid @RequestBody LoginRequest request) { return new LoginResponse(authService.login(request.nombreUsuario(), request.contrasena())); }
    @PatchMapping("/contrasena") @ResponseStatus(HttpStatus.NO_CONTENT) public void cambiarContrasena(@Valid @RequestBody CambioContrasenaRequest request) { authService.cambiarContrasena(request.nombreUsuario(), request.contrasenaActual(), request.contrasenaNueva()); }
    @GetMapping("/sesiones") public List<SesionResponse> listarSesiones(@RequestParam String nombreUsuario) { return authService.listarSesionesActivas(nombreUsuario).stream().map(s -> new SesionResponse(s.getIdSesion(), s.getExpiraEn())).toList(); }
    @DeleteMapping("/sesiones/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void revocarSesion(@RequestParam String nombreUsuario, @PathVariable Long id) { authService.revocarSesion(nombreUsuario, id); }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT) public void logout(@RequestHeader(value = "Authorization", required = false) String authorization) { authService.logout(extraerToken(authorization)); }
    private String extraerToken(String authorization) { return authorization != null && authorization.startsWith("Bearer ") ? authorization.substring(7) : null; }
    @PostMapping("/refresh") @ResponseStatus(HttpStatus.NO_CONTENT) public void refresh(@RequestHeader(value = "Authorization", required = false) String authorization) { authService.refresh(extraerToken(authorization)); }
}
