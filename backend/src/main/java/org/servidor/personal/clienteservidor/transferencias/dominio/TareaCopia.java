package org.servidor.personal.clienteservidor.transferencias.dominio;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import org.servidor.personal.clienteservidor.archivos.dominio.Archivo;
import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "tareas_copia", indexes = {
        @Index(name = "idx_tarea_copia_propietario", columnList = "id_usuario")
})
public class TareaCopia extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_tarea_copia")
    private Long idTareaCopia;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario propietario;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_archivo_origen")
    private Archivo archivoOrigen;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "id_carpeta_origen")
    private Carpeta carpetaOrigen;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_carpeta_destino", nullable = false)
    private Carpeta carpetaDestino;

    @Column(name = "total_bytes", nullable = false)
    private Long totalBytes = 0L;

    @Column(name = "bytes_copiados", nullable = false)
    private Long bytesCopiados = 0L;

    @Column(name = "estado_tarea", nullable = false, length = 20)
    private String estado = "EN_PROCESO";

    @Column(name = "error", length = 500)
    private String error;

}
