#!/usr/bin/env bash
set -euo pipefail

SERVICE="cliente-servidor"
JAR="target/ClienteServidor-0.0.1-SNAPSHOT.jar"

cd "$(dirname "$0")"

echo "Descargando los últimos cambios..."
git pull --ff-only

echo "Compilando el proyecto..."
./mvnw clean package

if [[ ! -f "$JAR" ]]; then
  echo "Error: no se encontró $JAR"
  exit 1
fi

echo "Reiniciando $SERVICE..."
sudo systemctl restart "$SERVICE"

echo "Estado del servicio:"
sudo systemctl --no-pager --full status "$SERVICE"
