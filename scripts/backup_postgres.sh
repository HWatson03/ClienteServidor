#!/bin/bash
BACKUP_DIR=${BACKUP_DIR:-/backup/postgres}
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
export PGPASSWORD=${DB_PASSWORD:-12345678}
pg_dump -h ${DB_HOST:-localhost} -p ${DB_PORT:-5432} -U ${DB_USERNAME:-appu} ${DB_NAME:-bd_servidor_local} > $BACKUP_DIR/bd_servidor_local_$DATE.sql
