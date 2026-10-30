# Operación del servidor

## Requisitos
- PostgreSQL 18 en puerto 5432
- Java 21
- Carpeta de almacenamiento fuera del repositorio
- Puerto 8080 accesible

## Configuración
El backend carga automáticamente `backend/.env` al arrancar. Copia `backend/.env.example` a `backend/.env` y ajusta los valores. El archivo `.env` está excluido de Git. También puedes indicar otro archivo con `APP_ENV_FILE`.

Las variables ya definidas en el entorno del sistema tienen prioridad sobre las del archivo `.env`:
- DB_URL, DB_USERNAME, DB_PASSWORD
- BOOTSTRAP_USUARIO, BOOTSTRAP_CONTRASENA
- STORAGE_ROOT, STORAGE_TEMP
- CORS_ALLOWED_ORIGINS (orígenes separados por coma)
- CUOTA_MAX_BYTES (default 1000000000)
- SERVER_PORT (default 8080)

## Compilar el APK

Copia `app_movil/.env.example` como `app_movil/.env` y configura `API_BASE_URL` con la URL HTTPS o IP accesible desde el teléfono. El valor se incorpora al APK como `--dart-define`; no pongas contraseñas ni otros secretos en este archivo.

Desde cualquier directorio del repositorio, compila con:
```bash
./app_movil/scripts/build_apk.sh
```

Para web, configura `API_BASE_URL` mediante el `--dart-define` correspondiente al compilar su build. Si web y backend tienen orígenes distintos, incluye el origen web en `CORS_ALLOWED_ORIGINS` del backend.

## Arranque
```bash
cd backend
./mvnw -o compile exec:java
```

## Despliegue Debian de Flutter Web y Spring Boot

El script `scripts/deploy_debian.sh` compila el JAR y Flutter Web, y ejecuta ambos servicios en segundo plano. Requiere Java 21, Flutter, Python 3 y PostgreSQL disponible. Configura primero `backend/.env` con las credenciales de PostgreSQL y las rutas de almacenamiento; el script no modifica ese archivo.

En la portátil, usando los puertos habituales de este proyecto (web 8080 y API 7777):
```bash
./scripts/deploy_debian.sh deploy
```

Para un servidor de la red, usa el host que abrirán los navegadores y permite conexiones de red:
```bash
PUBLIC_HOST=192.168.1.50 BIND_ADDRESS=0.0.0.0 \
WEB_ORIGIN=http://192.168.1.50:8080 \
./scripts/deploy_debian.sh deploy
```

También se pueden cambiar `WEB_PORT`, `API_PORT`, `API_BASE_URL`, `WEB_ORIGIN`, `CORS_ALLOWED_ORIGINS`, `DEPLOY_DIR`, `JAVA_BIN` y `FLUTTER_BIN`. Los artefactos, PID y logs se guardan por defecto en `~/.clienteservidor`. El script admite `start`, `stop`, `restart` y `status`; `deploy` vuelve a compilar y reinicia ambos procesos.

La configuración predeterminada escucha solo en `127.0.0.1`. `BIND_ADDRESS=0.0.0.0` permite acceso por la red local, pero el servidor integrado de Python sirve HTTP sin TLS; para acceso por Internet debe colocarse HTTPS mediante un proxy inverso y configurar `API_BASE_URL`, `WEB_ORIGIN` y CORS con los orígenes HTTPS reales.

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

## Bootstrap del primer usuario

Para crear el primer usuario en una base vacía, define las variables de entorno antes de arrancar:
```
BOOTSTRAP_USUARIO=admin
BOOTSTRAP_CONTRASENA=claveSegura123
```
O en application.properties:
```
app.bootstrap.usuario=admin
app.bootstrap.contrasena=claveSegura123
```
Solo se crea si no existen usuarios. Después del primer arranque, quita estas variables.
Alternativamente, inserta el usuario directamente en la base de datos.
