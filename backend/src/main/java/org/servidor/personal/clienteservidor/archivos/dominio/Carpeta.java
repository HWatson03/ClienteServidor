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
@Table(name = "carpetas", indexes = {
        @Index(name = "idx_carpeta_propietario", columnList = "id_usuario"),
        @Index(name = "idx_carpeta_padre", columnList = "id_carpeta_padre")
})
public class Carpeta extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_carpeta")
    private Long idCarpeta;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_carpeta_padre")
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








}
