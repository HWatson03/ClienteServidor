-- Algunas instalaciones recibieron la columna al desplegar una versión
-- preliminar que ya la incluía en V1. Mantener esta migración idempotente
-- permite arrancar tanto en bases nuevas como en esas bases existentes.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'CLIENTE';
UPDATE usuarios SET rol = 'CLIENTE' WHERE rol IS NULL OR BTRIM(rol) = '';
