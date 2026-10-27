package org.servidor.personal.clienteservidor.identidad.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "sesiones", indexes = {
        @Index(name = "idx_sesion_usuario", columnList = "id_usuario"),
        @Index(name = "idx_sesion_expiracion", columnList = "expira_en")
})
public class Sesion extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_sesion")
    private Long idSesion;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false)
    private Usuario usuario;

    @Column(name = "token_hash", nullable = false, length = 255, unique = true)
    private String tokenHash;

    @Column(name = "expira_en", nullable = false)
    private LocalDateTime expiraEn;

    @Column(name = "revocada", nullable = false)
    private boolean revocada = false;





}
