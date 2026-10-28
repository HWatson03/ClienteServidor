package org.servidor.personal.clienteservidor.transferencias.aplicacion;

import lombok.RequiredArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.CuotaUsuario;
import org.servidor.personal.clienteservidor.archivos.infraestructura.AlmacenamientoService;
import org.servidor.personal.clienteservidor.archivos.infraestructura.ArchivoRepository;
import org.servidor.personal.clienteservidor.archivos.infraestructura.CuotaUsuarioRepository;
import org.servidor.personal.clienteservidor.transferencias.dominio.Carga;
import org.servidor.personal.clienteservidor.transferencias.infraestructura.CargaRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class LimpiadorCargasService {

    private final CargaRepository cargaRepository;
    private final CuotaUsuarioRepository cuotaUsuarioRepository;
    private final AlmacenamientoService almacenamientoService;

    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void limpiarCargasExpiradas() {
        List<Carga> expiradas = cargaRepository.findAll().stream()
                .filter(c -> !"FINALIZADA".equals(c.getEstado()) && c.getExpiraEn().isBefore(LocalDateTime.now()))
                .toList();
        for (Carga carga : expiradas) {
            // Liberar cuota reservada
            try {
                CuotaUsuario cuota = cuotaUsuarioRepository.findByUsuario(carga.getUsuario()).orElseThrow();
                cuota.setBytesReservados(Math.max(0, cuota.getBytesReservados() - carga.getTamanoEsperado()));
                cuotaUsuarioRepository.save(cuota);
            } catch (Exception ignored) {
            }
            // Eliminar temporal
            Path temp = almacenamientoService.obtenerTemporal(carga.getClaveTemporal());
            almacenamientoService.eliminar(temp);
            // Marcar como expirada
            carga.setEstado("EXPIRADA");
            cargaRepository.save(carga);
        }
    }
}
