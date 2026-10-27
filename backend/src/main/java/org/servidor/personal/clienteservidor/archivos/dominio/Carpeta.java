package org.servidor.personal.clienteservidor.archivos.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "carpetas", indexes = {
        @Index(name = "idx_carpeta_propietario", columnList = "propietario_id"),
        @Index(name = "idx_carpeta_padre", columnList = "padre_id")
})
public class Carpeta extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "propietario_id", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "padre_id")
    private Carpeta padre;

    @Column(name = "nombre", nullable = false, length = 255)
    private String nombre;

    @Column(name = "es_raiz", nullable = false)
    private boolean esRaiz = false;

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

    public Carpeta getPadre() {
        return padre;
    }

    public void setPadre(Carpeta padre) {
        this.padre = padre;
    }

    public String getNombre() {
        return nombre;
    }

    public void setNombre(String nombre) {
        this.nombre = nombre;
    }

    public boolean isEsRaiz() {
        return esRaiz;
    }

    public void setEsRaiz(boolean esRaiz) {
        this.esRaiz = esRaiz;
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
