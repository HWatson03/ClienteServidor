package org.servidor.personal.clienteservidor.identidad.aplicacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CarpetaRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@RequiredArgsConstructor
public class BootstrapUsuarioService implements ApplicationRunner {

    private final UsuarioRepository usuarioRepository;
    private final PasswordEncoder passwordEncoder;
    private final CarpetaRepository carpetaRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;

    @Value("${app.bootstrap.usuario:}")
    private String bootstrapUsuario;

    @Value("${app.bootstrap.contrasena:}")
    private String bootstrapContrasena;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (usuarioRepository.count() > 0) {
            return;
        }
        String usuario = bootstrapUsuario;
        String contrasena = bootstrapContrasena;
        if (usuario == null || usuario.isBlank() || contrasena == null || contrasena.isBlank()) {
            return;
        }
        Usuario u = new Usuario();
        u.setNombreUsuario(usuario.trim());
        u.setContrasenaHash(passwordEncoder.encode(contrasena));
        u.setCuotaMaxBytes(1000000000L);
        u.setEstado("ACTIVO");
        usuarioRepository.save(u);

        Carpeta raiz = new Carpeta();
        raiz.setPropietario(u);
        raiz.setPadre(null);
        raiz.setNombre("Raíz");
        raiz.setEsRaiz(true);
        raiz.setEnPapelera(false);
        raiz.setEstado("ACTIVO");
        carpetaRepository.save(raiz);

        CuotaUsuario cuota = new CuotaUsuario();
        cuota.setUsuario(u);
        cuota.setBytesOcupados(0L);
        cuota.setBytesReservados(0L);
        cuota.setEstado("ACTIVO");
        cuotaUsuarioRepository.save(cuota);
    }
}
