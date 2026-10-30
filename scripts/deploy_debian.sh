#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
MOBILE_DIR="$ROOT_DIR/app_movil"
DEPLOY_DIR="${DEPLOY_DIR:-$HOME/.clienteservidor}"
WEB_DIR="$DEPLOY_DIR/web"
LOG_DIR="$DEPLOY_DIR/logs"
RUN_DIR="$DEPLOY_DIR/run"

PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
BIND_ADDRESS="${BIND_ADDRESS:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-8080}"
API_PORT="${API_PORT:-7777}"
API_BASE_URL="${API_BASE_URL:-http://${PUBLIC_HOST}:${API_PORT}}"
WEB_ORIGIN="${WEB_ORIGIN:-http://${PUBLIC_HOST}:${WEB_PORT}}"
CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-${WEB_ORIGIN},http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}}"
FLUTTER_BIN="${FLUTTER_BIN:-flutter}"
JAVA_BIN="${JAVA_BIN:-java}"

BACKEND_PID="$RUN_DIR/backend.pid"
WEB_PID="$RUN_DIR/web.pid"
BACKEND_LOG="$LOG_DIR/backend.log"
WEB_LOG="$LOG_DIR/web.log"
JAR_FILE="$DEPLOY_DIR/ClienteServidor.jar"

uso() {
  cat <<EOF
Uso: $(basename "$0") [deploy|start|stop|restart|status]

  deploy   Compila el backend y Flutter Web, instala artefactos y reinicia ambos.
  start    Inicia los artefactos ya compilados.
  stop     Detiene los dos procesos iniciados por este script.
  restart  Reinicia los artefactos ya compilados.
  status   Muestra el estado y las URL configuradas.

Variables configurables:
  PUBLIC_HOST       Host que usarán los navegadores (default: localhost).
  API_BASE_URL      URL del backend visible desde el navegador.
  WEB_PORT          Puerto de Flutter Web (default: 8080).
  API_PORT          Puerto de Spring (default: 7777).
  BIND_ADDRESS      Interfaz de escucha (default: 127.0.0.1).
  WEB_ORIGIN        Origen público de la web para CORS.
  CORS_ALLOWED_ORIGINS Orígenes permitidos, separados por coma.
  DEPLOY_DIR        Directorio para artefactos, PID y logs.

Ejemplo para un servidor accesible en 192.168.1.50:
  PUBLIC_HOST=192.168.1.50 BIND_ADDRESS=0.0.0.0 \\
  WEB_ORIGIN=http://192.168.1.50:8080 \\
  ./scripts/deploy_debian.sh deploy
EOF
}

comprobar_requisitos() {
  local comando
  for comando in "$JAVA_BIN" python3; do
    if ! command -v "$comando" >/dev/null 2>&1; then
      echo "Falta el requisito: $comando" >&2
      exit 1
    fi
  done
  if ! "$JAVA_BIN" -version 2>&1 | head -n 1 | grep -Eq '21([.\" ])'; then
    echo "Se requiere Java 21. Verifica JAVA_BIN o instala OpenJDK 21." >&2
    exit 1
  fi
  if ! command -v "$FLUTTER_BIN" >/dev/null 2>&1; then
    echo "No se encontró Flutter. Añádelo al PATH o define FLUTTER_BIN." >&2
    exit 1
  fi
  if [[ ! -x "$BACKEND_DIR/mvnw" ]]; then
    echo "No se encontró el Maven Wrapper ejecutable en $BACKEND_DIR/mvnw" >&2
    exit 1
  fi
  if [[ ! -f "$BACKEND_DIR/.env" ]]; then
    echo "Falta $BACKEND_DIR/.env. Configura DB_URL, DB_USERNAME, DB_PASSWORD y almacenamiento." >&2
    echo "Usa backend/.env.example como plantilla; el script no modifica ese archivo." >&2
    exit 1
  fi
}

pid_activo() {
  local archivo="$1"
  [[ -f "$archivo" ]] && kill -0 "$(<"$archivo")" 2>/dev/null
}

detener_pid() {
  local archivo="$1"
  local nombre="$2"
  if pid_activo "$archivo"; then
    local pid
    pid="$(<"$archivo")"
    kill "$pid" 2>/dev/null || true
    for _ in {1..30}; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
    echo "$nombre detenido."
  fi
  rm -f -- "$archivo"
}

detener() {
  mkdir -p "$RUN_DIR"
  detener_pid "$WEB_PID" "Frontend web"
  detener_pid "$BACKEND_PID" "Backend Spring"
}

construir() {
  comprobar_requisitos
  mkdir -p "$DEPLOY_DIR" "$WEB_DIR" "$LOG_DIR" "$RUN_DIR"

  echo "Compilando Spring Boot (sin ejecutar pruebas)..."
  (
    cd "$BACKEND_DIR"
    ./mvnw -DskipTests package
  )
  local artifact
  artifact="$(find "$BACKEND_DIR/target" -maxdepth 1 -type f -name '*.jar' ! -name '*.original' -print -quit)"
  if [[ -z "$artifact" ]]; then
    echo "Maven terminó sin producir un JAR ejecutable." >&2
    exit 1
  fi
  install -m 0644 "$artifact" "$JAR_FILE"

  echo "Compilando Flutter Web con API_BASE_URL=$API_BASE_URL ..."
  (
    cd "$MOBILE_DIR"
    "$FLUTTER_BIN" build web --release --dart-define="API_BASE_URL=$API_BASE_URL"
  )
  if [[ ! -f "$MOBILE_DIR/build/web/index.html" ]]; then
    echo "Flutter terminó sin producir build/web/index.html." >&2
    exit 1
  fi
  rm -rf -- "$WEB_DIR"/*
  cp -a "$MOBILE_DIR/build/web/." "$WEB_DIR/"
}

iniciar() {
  mkdir -p "$LOG_DIR" "$RUN_DIR"
  if [[ ! -f "$JAR_FILE" || ! -f "$WEB_DIR/index.html" ]]; then
    echo "No encuentro los artefactos desplegados. Ejecuta: $0 deploy" >&2
    exit 1
  fi

  if pid_activo "$BACKEND_PID"; then
    echo "Backend Spring ya está activo (PID $(<"$BACKEND_PID"))."
  else
    rm -f -- "$BACKEND_PID"
    (
      cd "$BACKEND_DIR"
      nohup "$JAVA_BIN" -jar "$JAR_FILE" \
        --server.port="$API_PORT" \
        --server.address="$BIND_ADDRESS" \
        --app.cors.allowed-origins="$CORS_ALLOWED_ORIGINS" \
        >"$BACKEND_LOG" 2>&1 &
      echo "$!" > "$BACKEND_PID"
    )
    echo "Backend iniciado (PID $(<"$BACKEND_PID"))."
  fi

  if pid_activo "$WEB_PID"; then
    echo "Frontend web ya está activo (PID $(<"$WEB_PID"))."
  else
    rm -f -- "$WEB_PID"
    nohup python3 -m http.server "$WEB_PORT" \
      --bind "$BIND_ADDRESS" --directory "$WEB_DIR" \
      >"$WEB_LOG" 2>&1 &
    echo "$!" > "$WEB_PID"
    echo "Frontend web iniciado (PID $(<"$WEB_PID"))."
  fi

  echo "Web:     http://${PUBLIC_HOST}:${WEB_PORT}"
  echo "API:     ${API_BASE_URL}"
  echo "Logs:    $LOG_DIR"
  echo "CORS:    $CORS_ALLOWED_ORIGINS"
  echo "Aviso: esta ejecución sirve HTTP. Para acceso por Internet, pon HTTPS delante con un proxy inverso."
}

estado() {
  if pid_activo "$BACKEND_PID"; then
    echo "Backend Spring activo (PID $(<"$BACKEND_PID"))."
  else
    echo "Backend Spring detenido."
  fi
  if pid_activo "$WEB_PID"; then
    echo "Frontend web activo (PID $(<"$WEB_PID"))."
  else
    echo "Frontend web detenido."
  fi
  echo "Web: ${WEB_ORIGIN}"
  echo "API: ${API_BASE_URL}"
}

accion="${1:-deploy}"
case "$accion" in
  deploy)
    construir
    detener
    iniciar
    ;;
  start)
    iniciar
    ;;
  stop)
    detener
    ;;
  restart)
    detener
    iniciar
    ;;
  status)
    estado
    ;;
  -h|--help|help)
    uso
    ;;
  *)
    uso >&2
    exit 2
    ;;
esac
