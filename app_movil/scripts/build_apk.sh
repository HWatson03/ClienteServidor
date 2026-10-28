#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="$app_dir/.env"

if [[ ! -f "$env_file" ]]; then
  echo "No existe $env_file. Copia .env.example a .env y configura API_BASE_URL." >&2
  exit 1
fi

api_base_url="$(python3 - "$env_file" <<'PY'
from pathlib import Path
import sys

for raw_line in Path(sys.argv[1]).read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith('#'):
        continue
    if line.startswith('export '):
        line = line[7:].strip()
    key, separator, value = line.partition('=')
    if separator and key.strip() == 'API_BASE_URL':
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        print(value)
        break
PY
)"

if [[ -z "$api_base_url" ]]; then
  echo "API_BASE_URL no está definido en $env_file." >&2
  exit 1
fi

cd "$app_dir"
exec flutter build apk --dart-define="API_BASE_URL=$api_base_url" "$@"
