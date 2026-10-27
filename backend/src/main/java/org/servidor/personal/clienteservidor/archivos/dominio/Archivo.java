package org.servidor.personal.clienteservidor.archivos.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "archivos", indexes = {
        @Index(name = "idx_archivo_propietario", columnList = "id_usuario"),
        @Index(name = "idx_archivo_carpeta", columnList = "id_carpeta")
})
public class Archivo extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_archivo")
    private Long idArchivo;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_carpeta", nullable = false)
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










}
