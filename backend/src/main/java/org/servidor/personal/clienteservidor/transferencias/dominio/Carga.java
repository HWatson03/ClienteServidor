package org.servidor.personal.clienteservidor.transferencias.dominio;

import org.servidor.personal.clienteservidor.archivos.dominio.Carpeta;
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
@Table(name = "cargas", indexes = {
        @Index(name = "idx_carga_usuario", columnList = "id_usuario"),
        @Index(name = "idx_carga_expiracion", columnList = "expira_en")
})
public class Carga extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_carga")
    private Long idCarga;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario usuario;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_carpeta_destino", nullable = false)
    private Carpeta carpetaDestino;

    @Column(name = "nombre_archivo", nullable = false, length = 255)
    private String nombreArchivo;

    @Column(name = "tamano_esperado", nullable = false)
    private Long tamanoEsperado;

    @Column(name = "offset_confirmado", nullable = false)
    private Long offsetConfirmado = 0L;

    @Column(name = "clave_temporal", nullable = false, length = 255)
    private String claveTemporal;

    @Column(name = "estado_carga", nullable = false, length = 20)
    private String estado = "INICIADA";

    @Column(name = "expira_en", nullable = false)
    private LocalDateTime expiraEn;









}
