#!/usr/bin/env bash
set -euo pipefail

SERVICE="cliente-servidor"
JAR="target/ClienteServidor-0.0.1-SNAPSHOT.jar"

cd "$(dirname "$0")"

echo "Descargando los últimos cambios..."
git pull --ff-only

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: se requiere pnpm para compilar el frontend Vue incluido en el JAR."
  exit 1
fi

echo "Instalando dependencias del frontend..."
(cd ../web-app && pnpm install --frozen-lockfile)

echo "Compilando Vue y empaquetando backend + frontend en un solo JAR..."
./mvnw clean package

if [[ ! -f "$JAR" ]]; then
  echo "Error: no se encontró $JAR"
  exit 1
fi

echo "Reiniciando $SERVICE..."
sudo systemctl restart "$SERVICE"

echo "Estado del servicio:"
sudo systemctl --no-pager --full status "$SERVICE"
