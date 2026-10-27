package org.servidor.personal.clienteservidor.archivos.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "cuota_usuario")
public class CuotaUsuario extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false, unique = true)
    private Usuario usuario;

    @Column(name = "bytes_ocupados", nullable = false)
    private Long bytesOcupados = 0L;

    @Column(name = "bytes_reservados", nullable = false)
    private Long bytesReservados = 0L;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Usuario getUsuario() {
        return usuario;
    }

    public void setUsuario(Usuario usuario) {
        this.usuario = usuario;
    }

    public Long getBytesOcupados() {
        return bytesOcupados;
    }

    public void setBytesOcupados(Long bytesOcupados) {
        this.bytesOcupados = bytesOcupados;
    }

    public Long getBytesReservados() {
        return bytesReservados;
    }

    public void setBytesReservados(Long bytesReservados) {
        this.bytesReservados = bytesReservados;
    }
}
