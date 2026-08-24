#!/usr/bin/env bash
# Restaura um backup do banco Postgres do Wordbee Clone.
# Uso: ./scripts/restore.sh caminho/para/arquivo.dump
# Lê DATABASE_URL do .env na raiz do projeto.
#
# ATENÇÃO: isso SOBRESCREVE os dados atuais do banco de destino.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$ROOT_DIR/.env"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Uso: $0 caminho/para/arquivo.dump" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Erro: arquivo de backup não encontrado: $BACKUP_FILE" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Erro: $ENV_FILE não encontrado." >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"')"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: DATABASE_URL não definida em $ENV_FILE." >&2
  exit 1
fi

echo "Isso vai APAGAR e recriar os dados do banco apontado por DATABASE_URL."
read -r -p "Digite 'restaurar' para confirmar: " CONFIRM
if [ "$CONFIRM" != "restaurar" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Restaurando $BACKUP_FILE ..."
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$BACKUP_FILE"

echo "Restauração concluída."
