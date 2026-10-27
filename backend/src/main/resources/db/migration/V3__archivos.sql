CREATE TABLE carpetas (
    id UUID PRIMARY KEY,
    propietario_id UUID NOT NULL REFERENCES usuarios(id),
    padre_id UUID REFERENCES carpetas(id),
    nombre VARCHAR(255) NOT NULL,
    es_raiz BOOLEAN NOT NULL DEFAULT FALSE,
    en_papelera BOOLEAN NOT NULL DEFAULT FALSE,
    grupo_eliminacion VARCHAR(64),
    eliminado_en TIMESTAMP,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL
);

CREATE INDEX idx_carpeta_propietario ON carpetas (propietario_id);
CREATE INDEX idx_carpeta_padre ON carpetas (padre_id);

CREATE TABLE archivos (
    id UUID PRIMARY KEY,
    propietario_id UUID NOT NULL REFERENCES usuarios(id),
    carpeta_id UUID NOT NULL REFERENCES carpetas(id),
    nombre_visible VARCHAR(255) NOT NULL,
    clave_disco VARCHAR(255) NOT NULL,
    tamano BIGINT NOT NULL,
    tipo_mime VARCHAR(128),
    en_papelera BOOLEAN NOT NULL DEFAULT FALSE,
    grupo_eliminacion VARCHAR(64),
    eliminado_en TIMESTAMP,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL
);

CREATE UNIQUE INDEX uk_archivo_clave_disco ON archivos (clave_disco);
CREATE INDEX idx_archivo_propietario ON archivos (propietario_id);
CREATE INDEX idx_archivo_carpeta ON archivos (carpeta_id);

CREATE TABLE cuota_usuario (
    id UUID PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    bytes_ocupados BIGINT NOT NULL DEFAULT 0,
    bytes_reservados BIGINT NOT NULL DEFAULT 0,
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    CONSTRAINT uk_cuota_usuario UNIQUE (usuario_id)
);
