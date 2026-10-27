package org.servidor.personal.clienteservidor.archivos.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "archivos", indexes = {
        @Index(name = "idx_archivo_propietario", columnList = "propietario_id"),
        @Index(name = "idx_archivo_carpeta", columnList = "carpeta_id")
})
public class Archivo extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "propietario_id", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "carpeta_id", nullable = false)
    private Carpeta carpeta;

    @Column(name = "nombre_visible", nullable = false, length = 255)
    private String nombreVisible;

    @Column(name = "clave_disco", nullable = false, length = 255, unique = true)
    private String claveDisco;

    @Column(name = "tamano", nullable = false)
    private Long tamano;

    @Column(name = "tipo_mime", length = 128)
    private String tipoMime;

    @Column(name = "en_papelera", nullable = false)
    private boolean enPapelera = false;

    @Column(name = "grupo_eliminacion", length = 64)
    private String grupoEliminacion;

    @Column(name = "eliminado_en")
    private LocalDateTime eliminadoEn;

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

    public Carpeta getCarpeta() {
        return carpeta;
    }

    public void setCarpeta(Carpeta carpeta) {
        this.carpeta = carpeta;
    }

    public String getNombreVisible() {
        return nombreVisible;
    }

    public void setNombreVisible(String nombreVisible) {
        this.nombreVisible = nombreVisible;
    }

    public String getClaveDisco() {
        return claveDisco;
    }

    public void setClaveDisco(String claveDisco) {
        this.claveDisco = claveDisco;
    }

    public Long getTamano() {
        return tamano;
    }

    public void setTamano(Long tamano) {
        this.tamano = tamano;
    }

    public String getTipoMime() {
        return tipoMime;
    }

    public void setTipoMime(String tipoMime) {
        this.tipoMime = tipoMime;
    }

    public boolean isEnPapelera() {
        return enPapelera;
    }

    public void setEnPapelera(boolean enPapelera) {
        this.enPapelera = enPapelera;
    }

    public String getGrupoEliminacion() {
        return grupoEliminacion;
    }

    public void setGrupoEliminacion(String grupoEliminacion) {
        this.grupoEliminacion = grupoEliminacion;
    }

    public LocalDateTime getEliminadoEn() {
        return eliminadoEn;
    }

    public void setEliminadoEn(LocalDateTime eliminadoEn) {
        this.eliminadoEn = eliminadoEn;
    }
}
