package org.servidor.personal.clienteservidor.identidad.dominio;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "solicitudes_usuario")
public class SolicitudUsuario {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_solicitud")
    private Long idSolicitud;
    @Column(nullable = false, length = 100) private String nombres;
    @Column(name = "apellido_paterno", nullable = false, length = 100) private String apellidoPaterno;
    @Column(name = "apellido_materno", nullable = false, length = 100) private String apellidoMaterno;
    @Column(nullable = false, length = 30) private String ci;
    @Column(nullable = false, length = 180) private String correo;
    @Column(nullable = false, length = 40) private String telefono;
    @Column(name = "nombre_usuario", nullable = false, length = 50) private String nombreUsuario;
    @Column(name = "contrasena_hash", nullable = false, length = 255) private String contrasenaHash;
    @Column(nullable = false, length = 20) private String estado = "PENDIENTE";
    @Column(name = "fecha_solicitud", nullable = false) private LocalDateTime fechaSolicitud = LocalDateTime.now();
    @Column(name = "revisada_en") private LocalDateTime revisadaEn;
    @Column(name = "revisada_por", length = 100) private String revisadaPor;
}
