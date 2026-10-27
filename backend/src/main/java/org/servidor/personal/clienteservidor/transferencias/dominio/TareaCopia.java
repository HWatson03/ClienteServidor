package org.servidor.personal.clienteservidor.transferencias.dominio;

import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "tareas_copia", indexes = {
        @Index(name = "idx_tarea_copia_propietario", columnList = "propietario_id")
})
public class TareaCopia extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "propietario_id", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "archivo_origen_id")
    private Archivo archivoOrigen;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carpeta_origen_id")
    private Carpeta carpetaOrigen;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "carpeta_destino_id", nullable = false)
    private Carpeta carpetaDestino;

    @Column(name = "total_bytes", nullable = false)
    private Long totalBytes = 0L;

    @Column(name = "bytes_copiados", nullable = false)
    private Long bytesCopiados = 0L;

    @Column(name = "estado", nullable = false, length = 20)
    private String estado = "EN_PROCESO";

    @Column(name = "error", length = 500)
    private String error;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public Usuario getPropietario() {
        return propietario;
    }

    public void setPropietario(Usuario propietario) {
        this.propietario = propietario;
    }

    public Archivo getArchivoOrigen() {
        return archivoOrigen;
    }

    public void setArchivoOrigen(Archivo archivoOrigen) {
        this.archivoOrigen = archivoOrigen;
    }

    public Carpeta getCarpetaOrigen() {
        return carpetaOrigen;
    }

    public void setCarpetaOrigen(Carpeta carpetaOrigen) {
        this.carpetaOrigen = carpetaOrigen;
    }

    public Carpeta getCarpetaDestino() {
        return carpetaDestino;
    }

    public void setCarpetaDestino(Carpeta carpetaDestino) {
        this.carpetaDestino = carpetaDestino;
    }

    public Long getTotalBytes() {
        return totalBytes;
    }

    public void setTotalBytes(Long totalBytes) {
        this.totalBytes = totalBytes;
    }

    public Long getBytesCopiados() {
        return bytesCopiados;
    }

    public void setBytesCopiados(Long bytesCopiados) {
        this.bytesCopiados = bytesCopiados;
    }

    public String getEstado() {
        return estado;
    }

    public void setEstado(String estado) {
        this.estado = estado;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
