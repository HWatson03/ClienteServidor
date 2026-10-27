package org.servidor.personal.clienteservidor.identidad.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "usuarios", uniqueConstraints = @UniqueConstraint(name = "uk_usuario_nombre", columnNames = "nombre_usuario"))
public class Usuario extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "nombre_usuario", nullable = false, length = 50)
    private String nombreUsuario;

    @Column(name = "contrasena_hash", nullable = false, length = 255)
    private String contrasenaHash;

    @Column(name = "cuota_max_bytes", nullable = false)
    private Long cuotaMaxBytes = 1000000000L;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getNombreUsuario() {
        return nombreUsuario;
    }

    public void setNombreUsuario(String nombreUsuario) {
        this.nombreUsuario = nombreUsuario;
    }

    public String getContrasenaHash() {
        return contrasenaHash;
    }

    public void setContrasenaHash(String contrasenaHash) {
        this.contrasenaHash = contrasenaHash;
    }

    public Long getCuotaMaxBytes() {
        return cuotaMaxBytes;
    }

    public void setCuotaMaxBytes(Long cuotaMaxBytes) {
        this.cuotaMaxBytes = cuotaMaxBytes;
    }
}
