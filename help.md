# Preparar Debian y desplegar ClienteServidor

Esta guía empieza desde un Debian recién instalado y configura PostgreSQL, Java 21, Flutter Web, el backend Spring y la aplicación web. El despliegue usa los puertos **8080 para la web** y **7777 para la API**.

> Necesitarás una conexión a Internet durante la preparación: `apt`, Git, Maven Wrapper y Flutter descargarán paquetes y dependencias. El script de despliegue no instala paquetes del sistema.

## 1. Conecta Debian a Internet

Conecta un cable Ethernet al router o configura el Wi-Fi desde el escritorio de Debian. Después abre una terminal y comprueba que Debian obtuvo una IP y una ruta:

```bash
cat /etc/os-release
ip -br address
ip route
getent hosts deb.debian.org
```

`getent` debe mostrar una dirección para `deb.debian.org`. Si no la muestra, resuelve primero la conexión o el DNS; todavía no continúes con `apt`.

Actualiza el índice de paquetes e instala las herramientas base:

```bash
sudo apt update
sudo apt install -y ca-certificates curl git gpg wget unzip xz-utils zip \
  libglu1-mesa python3 rsync openssh-server
```

## 2. Instala Java 21

Comprueba la versión de Debian:

```bash
cat /etc/os-release | grep -E 'PRETTY_NAME|VERSION_CODENAME'
```

En Debian 13 (Trixie), instala el JDK desde Debian:

```bash
sudo apt install -y openjdk-21-jdk
java -version
javac -version
```

Ambos comandos deben mostrar la versión 21. El backend necesita Java 21 para compilar y ejecutarse.

Si `openjdk-21-jdk` no está disponible en tu versión de Debian, instala Eclipse Temurin 21 desde el repositorio oficial de Adoptium:

```bash
sudo apt install -y apt-transport-https
sudo install -d -m 0755 /etc/apt/keyrings
wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public \
  | gpg --dearmor \
  | sudo tee /etc/apt/keyrings/adoptium.gpg >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
  | sudo tee /etc/apt/sources.list.d/adoptium.list
sudo apt update
sudo apt install -y temurin-21-jdk
java -version
javac -version
```

## 3. Instala PostgreSQL 18

El proyecto está documentado para PostgreSQL 18. Añade el repositorio oficial de PostgreSQL e instala servidor y cliente:

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
sudo systemctl enable --now postgresql
sudo systemctl status postgresql --no-pager
```

Crea el usuario y la base. La orden `\\password` solicita la contraseña sin ponerla en el historial de comandos:

```bash
sudo -u postgres psql
```

En la consola de PostgreSQL escribe:

```sql
CREATE ROLE appu LOGIN;
\password appu
CREATE DATABASE bd_servidor_local OWNER appu;
\q
```

Guarda la contraseña que definiste para `appu`; la configurarás en `backend/.env`.

## 4. Instala Flutter para compilar la web

Instala el canal estable de Flutter en el directorio de tu usuario:

```bash
mkdir -p "$HOME/develop"
git clone --depth 1 --branch stable https://github.com/flutter/flutter.git \
  "$HOME/develop/flutter"
echo 'export PATH="$HOME/develop/flutter/bin:$PATH"' >> "$HOME/.profile"
export PATH="$HOME/develop/flutter/bin:$PATH"
flutter precache --web
flutter --version
dart --version
flutter doctor -v
```

El build de Web no requiere Android Studio ni Chrome en el servidor. Flutter y sus dependencias se descargarán desde Internet la primera vez que ejecutes el build.

## 5. Copia el proyecto al servidor

El repositorio de origen es `https://github.com/HWatson03/ClienteServidor.git`. Si ya subiste tus cambios a GitHub, puedes clonarlo así:

```bash
git clone https://github.com/HWatson03/ClienteServidor.git "$HOME/ClienteServidor"
```

Si tus últimos cambios todavía están solo en tu portátil, transfiere el árbol actual por SSH para incluirlos. En el servidor, habilita SSH:

```bash
sudo systemctl enable --now ssh
hostname -I
```

Desde una terminal de tu portátil, situado en la raíz del proyecto, reemplaza `USUARIO` e `IP_DEL_SERVIDOR` y ejecuta:

```bash
rsync -av \
  --exclude='.git/' \
  --exclude='.idea/' \
  --exclude='**/.env' \
  --exclude='backend/target/' \
  --exclude='app_movil/build/' \
  --exclude='app_movil/.dart_tool/' \
  ./ USUARIO@IP_DEL_SERVIDOR:ClienteServidor/
```

Este comando evita transferir credenciales locales y artefactos compilados. No utiliza `--delete`, así que no borra otros archivos del servidor.

Conéctate al servidor y entra al proyecto:

```bash
ssh USUARIO@IP_DEL_SERVIDOR
cd "$HOME/ClienteServidor"
```

### Maven Wrapper

No hace falta instalar Maven globalmente: el repositorio incluye `backend/mvnw` y fija Maven **3.10.0**. Con Java 21 e Internet disponibles, el wrapper descarga esa distribución y las dependencias desde Maven Central en el primer build. Compruébalo:

```bash
cd backend
./mvnw -version
cd ..
```

La salida debe indicar Maven 3.10.0 y Java 21. El script de despliegue invoca `./mvnw -DskipTests package` desde `backend/`.

## 6. Configura el almacenamiento y las credenciales

Crea directorios de almacenamiento fuera del repositorio y asígnalos al usuario Linux que ejecutará el despliegue:

```bash
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" \
  /srv/clienteservidor/archivos /srv/clienteservidor/temporales
```

Crea el archivo local de configuración:

```bash
cp backend/.env.example backend/.env
nano backend/.env
chmod 600 backend/.env
```

Completa al menos estos valores. Sustituye las contraseñas por las que definiste; no copies estas palabras de ejemplo literalmente:

```dotenv
DB_URL=jdbc:postgresql://localhost:5432/bd_servidor_local
DB_USERNAME=appu
DB_PASSWORD=CONTRASENA_DE_POSTGRES
BOOTSTRAP_USUARIO=admin
BOOTSTRAP_CONTRASENA=CONTRASENA_INICIAL_LARGA
STORAGE_ROOT=/srv/clienteservidor/archivos
STORAGE_TEMP=/srv/clienteservidor/temporales
SERVER_PORT=7777
CORS_ALLOWED_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
```

`BOOTSTRAP_USUARIO` y `BOOTSTRAP_CONTRASENA` crean el primer usuario solo cuando la base no tiene usuarios. Después del primer arranque, elimina esos dos valores del `.env` y conserva el archivo con permisos `600`.

## 7. Compila y arranca el backend y la web

### Solo en la misma portátil

Desde la raíz del repositorio:

```bash
./scripts/deploy_debian.sh deploy
```

La web queda en `http://localhost:8080` y el backend en `http://localhost:7777`.

### En el servidor para acceder desde otros equipos de la red local

Obtén la IP LAN con `hostname -I`. Usa esa IP en lugar de `192.168.1.50` en este ejemplo:

```bash
PUBLIC_HOST=192.168.1.50 \
BIND_ADDRESS=0.0.0.0 \
WEB_ORIGIN=http://192.168.1.50:8080 \
API_PORT=7777 \
./scripts/deploy_debian.sh deploy
```

Desde otro equipo de la misma red, abre `http://192.168.1.50:8080`. La API debe poder alcanzarse desde ese navegador en el puerto `7777`. Si usas firewall, permite TCP 8080 y 7777 solo en la red que necesites.

El script compila Spring Boot y Flutter Web, guarda sus artefactos y logs en `~/.clienteservidor`, y arranca ambos servicios en segundo plano. Para operaciones posteriores:

```bash
./scripts/deploy_debian.sh status
./scripts/deploy_debian.sh stop
./scripts/deploy_debian.sh start
./scripts/deploy_debian.sh restart
tail -f "$HOME/.clienteservidor/logs/backend.log"
tail -f "$HOME/.clienteservidor/logs/web.log"
```

El arranque en segundo plano del script no instala servicios de `systemd`; después de reiniciar Debian, ejecuta `./scripts/deploy_debian.sh start`.

## 8. Comprobaciones rápidas

```bash
java -version
flutter --version
sudo systemctl is-active postgresql
curl -I http://localhost:8080
curl -i http://localhost:7777/api/auth/login
```

La última petición usa `GET` contra una ruta de login que acepta `POST`, así que una respuesta `405 Method Not Allowed` confirma que Spring respondió. También puedes revisar `~/.clienteservidor/logs/backend.log` si el backend no inicia.

## 9. Acceso desde Internet

El script sirve HTTP sin cifrado. No expongas los puertos HTTP del ejemplo directamente a Internet para enviar contraseñas o tokens. Para acceso externo configura un dominio o túnel HTTPS con proxy inverso; después compila la web con `API_BASE_URL=https://TU_DOMINIO` y configura `WEB_ORIGIN`/`CORS_ALLOWED_ORIGINS` con el origen HTTPS. No reutilices los valores de CORS de la LAN en una publicación pública.

## Enlaces oficiales

- [Instalación manual de Flutter](https://docs.flutter.dev/install/manual)
- [Paquete OpenJDK 21 en Debian](https://packages.debian.org/en/openjdk-21-jdk)
- [Instalación de Eclipse Temurin en Debian](https://adoptium.net/installation/linux/)
- [Instalación oficial de PostgreSQL en Debian](https://www.postgresql.org/download/linux/debian/)
