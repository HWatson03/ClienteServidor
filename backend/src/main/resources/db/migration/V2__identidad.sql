CREATE TABLE usuarios (
    id UUID PRIMARY KEY,
    nombre_usuario VARCHAR(50) NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    cuota_max_bytes BIGINT NOT NULL DEFAULT 1000000000,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL
);

CREATE UNIQUE INDEX uk_usuario_nombre ON usuarios (LOWER(nombre_usuario));

CREATE TABLE sesiones (
    id UUID PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    token_hash VARCHAR(255) NOT NULL,
    expira_en TIMESTAMP NOT NULL,
    revocada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL
);

CREATE UNIQUE INDEX uk_sesion_token_hash ON sesiones (token_hash);
CREATE INDEX idx_sesion_usuario ON sesiones (usuario_id);
CREATE INDEX idx_sesion_expiracion ON sesiones (expira_en);
