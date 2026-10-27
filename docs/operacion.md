# Operación del servidor

## Requisitos
- PostgreSQL 18 en puerto 5432
- Java 21
- Carpeta de almacenamiento fuera del repositorio
- Puerto 8080 accesible

## Configuración
Variables de entorno:
- DB_URL, DB_USERNAME, DB_PASSWORD
- STORAGE_ROOT, STORAGE_TEMP
- CUOTA_MAX_BYTES (default 1000000000)

## Arranque
```bash
cd backend
./mvnw -o compile exec:java
```

## Respaldos PostgreSQL (semanal)
Crear directorio separado de almacenamiento:
```bash
mkdir -p /backup/postgres
```

Script de respaldo:
```bash
pg_dump -h localhost -p 5432 -U appu bd_servidor_local > /backup/postgres/bd_servidor_local_$(date +%Y%m%d).sql
```

Programar con cron semanal. Los archivos subidos NO se respaldan.
Restaurar en base aislada para verificar. Restaurar PostgreSQL no recupera archivos físicos perdidos.

## Publicación HTTPS
Evaluar según red:
- IP pública / CGNAT
- Acceso a router
- Necesidad de túnel (Cloudflare Tunnel, Tailscale, ngrok) o reverse proxy
- Usar herramientas open source
- Sin dominio contratado inicialmente

## Logs
Rotación configurable con logback.
