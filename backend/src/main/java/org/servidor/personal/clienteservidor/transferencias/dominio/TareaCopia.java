package org.servidor.personal.clienteservidor.transferencias.dominio;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "tareas_copia", indexes = {
        @Index(name = "idx_tarea_copia_propietario", columnList = "propietario_id")
})
public class TareaCopia extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_tarea_copia")
    private Long idTareaCopia;

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

}
