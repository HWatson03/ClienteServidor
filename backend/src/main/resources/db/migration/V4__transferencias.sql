CREATE TABLE cargas (
    id UUID PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    carpeta_destino_id UUID NOT NULL REFERENCES carpetas(id),
    nombre_archivo VARCHAR(255) NOT NULL,
    tamano_esperado BIGINT NOT NULL,
    offset_confirmado BIGINT NOT NULL DEFAULT 0,
    clave_temporal VARCHAR(255) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    expira_en TIMESTAMP NOT NULL,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado_auditoria VARCHAR(20) NOT NULL
);

CREATE INDEX idx_carga_usuario ON cargas (usuario_id);
CREATE INDEX idx_carga_expiracion ON cargas (expira_en);
