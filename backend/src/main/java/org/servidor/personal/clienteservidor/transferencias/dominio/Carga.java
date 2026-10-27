package org.servidor.personal.clienteservidor.transferencias.dominio;

import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "cargas", indexes = {
        @Index(name = "idx_carga_usuario", columnList = "usuario_id"),
        @Index(name = "idx_carga_expiracion", columnList = "expira_en")
})
public class Carga extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "carpeta_destino_id", nullable = false)
    private Carpeta carpetaDestino;

    @Column(name = "nombre_archivo", nullable = false, length = 255)
    private String nombreArchivo;

    @Column(name = "tamano_esperado", nullable = false)
    private Long tamanoEsperado;

    @Column(name = "offset_confirmado", nullable = false)
    private Long offsetConfirmado = 0L;

    @Column(name = "clave_temporal", nullable = false, length = 255)
    private String claveTemporal;

    @Column(name = "estado", nullable = false, length = 20)
    private String estado = "INICIADA";

    @Column(name = "expira_en", nullable = false)
    private LocalDateTime expiraEn;

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

    public Carpeta getCarpetaDestino() {
        return carpetaDestino;
    }

    public void setCarpetaDestino(Carpeta carpetaDestino) {
        this.carpetaDestino = carpetaDestino;
    }

    public String getNombreArchivo() {
        return nombreArchivo;
    }

    public void setNombreArchivo(String nombreArchivo) {
        this.nombreArchivo = nombreArchivo;
    }

    public Long getTamanoEsperado() {
        return tamanoEsperado;
    }

    public void setTamanoEsperado(Long tamanoEsperado) {
        this.tamanoEsperado = tamanoEsperado;
    }

    public Long getOffsetConfirmado() {
        return offsetConfirmado;
    }

    public void setOffsetConfirmado(Long offsetConfirmado) {
        this.offsetConfirmado = offsetConfirmado;
    }

    public String getClaveTemporal() {
        return claveTemporal;
    }

    public void setClaveTemporal(String claveTemporal) {
        this.claveTemporal = claveTemporal;
    }

    public String getEstado() {
        return estado;
    }

    public void setEstado(String estado) {
        this.estado = estado;
    }

    public LocalDateTime getExpiraEn() {
        return expiraEn;
    }

    public void setExpiraEn(LocalDateTime expiraEn) {
        this.expiraEn = expiraEn;
    }
}
