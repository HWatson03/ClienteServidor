CREATE TABLE tareas_copia (
    id UUID PRIMARY KEY,
    propietario_id UUID NOT NULL REFERENCES usuarios(id),
    archivo_origen_id UUID REFERENCES archivos(id),
    carpeta_origen_id UUID REFERENCES carpetas(id),
    carpeta_destino_id UUID NOT NULL REFERENCES carpetas(id),
    total_bytes BIGINT NOT NULL DEFAULT 0,
    bytes_copiados BIGINT NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL,
    error VARCHAR(500),
    fecha_creacion TIMESTAMP NOT NULL,
    creado_por VARCHAR(100) NOT NULL,
    fecha_ultima_modificacion TIMESTAMP NOT NULL,
    modificado_por VARCHAR(100) NOT NULL,
    estado_auditoria VARCHAR(20) NOT NULL
);

CREATE INDEX idx_tarea_copia_propietario ON tareas_copia (propietario_id);
