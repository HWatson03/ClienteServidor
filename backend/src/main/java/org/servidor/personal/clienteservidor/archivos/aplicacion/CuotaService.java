package org.servidor.personal.clienteservidor.archivos.aplicacion;

import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;
import org.servidor.personal.clienteservidor.identidad.infraestructura.UsuarioRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CuotaService {

    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final UsuarioRepository usuarioRepository;

    public CuotaService(CuotaUsuarioRepository cuotaUsuarioRepository, UsuarioRepository usuarioRepository) {
        this.cuotaUsuarioRepository = cuotaUsuarioRepository;
        this.usuarioRepository = usuarioRepository;
    }

    @Transactional
    public void reservar(String nombreUsuario, long bytes) {
        if (bytes <= 0) {
            return;
        }
        Usuario usuario = obtenerUsuario(nombreUsuario);
        CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario)
                .orElseThrow(() -> new IllegalStateException("Cuota no encontrada"));
        long nuevoReservado = cuota.getBytesReservados() + bytes;
        long usadoTotal = cuota.getBytesOcupados() + nuevoReservado;
        if (usadoTotal > usuario.getCuotaMaxBytes()) {
            throw new IllegalArgumentException("Cuota insuficiente");
        }
        cuota.setBytesReservados(nuevoReservado);
        cuotaUsuarioRepository.save(cuota);
    }

    @Transactional(readOnly = true)
    public ResumenCuota resumen(String nombreUsuario) {
        Usuario usuario = obtenerUsuario(nombreUsuario);
        CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(usuario)
                .orElseThrow(() -> new IllegalStateException("Cuota no encontrada"));
        long ocupados = cuota.getBytesOcupados();
        long reservados = cuota.getBytesReservados();
        long limite = usuario.getCuotaMaxBytes();
        long disponibles = limite - ocupados - reservados;
        return new ResumenCuota(limite, ocupados, reservados, disponibles);
    }

    private Usuario obtenerUsuario(String nombreUsuario) {
        return usuarioRepository.findByNombreUsuarioIgnoreCase(nombreUsuario.trim())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
    }

    public record ResumenCuota(long limite, long ocupados, long reservados, long disponibles) {}
}
