#!/usr/bin/env bash
# Backup do banco Postgres do Wordbee Clone.
# Uso: ./scripts/backup.sh [diretorio-de-destino]
# Lê DATABASE_URL do .env na raiz do projeto — OU, se DATABASE_URL já
# estiver exportada no ambiente (ex.: para fazer backup de um banco que não
# é o do .env local, como na migração Railway -> VPS), usa essa em vez de
# ler o arquivo:
#   DATABASE_URL="postgresql://...railway.../db" ./scripts/backup.sh backups/migration

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"
DEST_DIR="${1:-$ROOT_DIR/backups}"

if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "Erro: $ENV_FILE não encontrado. Copie .env.example para .env e preencha, ou exporte DATABASE_URL antes de rodar o backup." >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: DATABASE_URL não definida (nem exportada, nem em $ENV_FILE)." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$DEST_DIR/wordbee_${TIMESTAMP}.dump"

echo "Gerando backup em $BACKUP_FILE ..."
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"

echo "Backup concluído: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
echo "Para restaurar: ./scripts/restore.sh \"$BACKUP_FILE\""
