#!/usr/bin/env bash
# Restaura um backup do banco Postgres do Wordbee Clone.
# Uso: ./scripts/restore.sh caminho/para/arquivo.dump
# Lê DATABASE_URL do .env na raiz do projeto — OU, se DATABASE_URL já
# estiver exportada no ambiente (ex.: para restaurar num banco que não é o
# do .env local, como na migração Railway -> VPS), usa essa em vez de ler
# o arquivo:
#   DATABASE_URL="postgresql://...vps.../db" ./scripts/restore.sh backups/migration/wordbee_TIMESTAMP.dump
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

if [ -z "${DATABASE_URL:-}" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "Erro: $ENV_FILE não encontrado. Exporte DATABASE_URL ou crie o .env." >&2
    exit 1
  fi
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d '=' -f2- | tr -d '"')"
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Erro: DATABASE_URL não definida (nem exportada, nem em $ENV_FILE)." >&2
  exit 1
fi

echo "Isso vai APAGAR e recriar os dados do banco apontado por DATABASE_URL."
echo "Lembrete: se este backup veio de outro ambiente (ex.: migração Railway -> VPS),"
echo "o ENCRYPTION_KEY do ambiente de DESTINO precisa ser EXATAMENTE igual ao do ambiente"
echo "de ORIGEM — senão api_keys.chave_encrypted e wp_sites.app_password_encrypted ficam"
echo "ilegíveis (nenhum erro visível na hora do restore, só ao tentar usá-los depois)."
read -r -p "Digite 'restaurar' para confirmar: " CONFIRM
if [ "$CONFIRM" != "restaurar" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Restaurando $BACKUP_FILE ..."
pg_restore --dbname="$DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$BACKUP_FILE"

echo "Restauração concluída."
