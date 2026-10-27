package org.servidor.personal.clienteservidor.archivos.dominio;

import org.servidor.personal.clienteservidor.compartido.auditoria.Auditoria;
import org.servidor.personal.clienteservidor.identidad.dominio.Usuario;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "cuota_usuario")
public class CuotaUsuario extends Auditoria {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id_cuota_usuario")
    private Long idCuotaUsuario;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "id_usuario", nullable = false, unique = true)
    private Usuario usuario;

    @Column(name = "bytes_ocupados", nullable = false)
    private Long bytesOcupados = 0L;

    @Column(name = "bytes_reservados", nullable = false)
    private Long bytesReservados = 0L;




}
