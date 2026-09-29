#!/bin/sh
# Gera um certificado TLS autoassinado (fora do volume de dados, então é
# refeito a cada start) e sobe o Postgres pelo entrypoint oficial com TLS
# ligado e o pg_hba.conf desta pasta.
set -eu

TLS_DIR=/var/lib/postgresql/tls
mkdir -p "$TLS_DIR"
openssl req -new -x509 -days 3650 -nodes -newkey rsa:2048 \
  -subj "/CN=wordbee-postgres" \
  -keyout "$TLS_DIR/server.key" -out "$TLS_DIR/server.crt" >/dev/null 2>&1
chown -R postgres:postgres "$TLS_DIR"
chmod 600 "$TLS_DIR/server.key"

if [ "${1:-}" = "postgres" ]; then
  shift
  set -- postgres \
    -c listen_addresses='*' \
    -c ssl=on \
    -c ssl_cert_file="$TLS_DIR/server.crt" \
    -c ssl_key_file="$TLS_DIR/server.key" \
    -c ssl_min_protocol_version=TLSv1.2 \
    -c hba_file=/etc/postgresql/pg_hba.conf \
    -c password_encryption=scram-sha-256 \
    -c max_connections=100 \
    -c tcp_keepalives_idle=60 \
    -c tcp_keepalives_interval=10 \
    -c tcp_keepalives_count=6 \
    "$@"
fi

exec docker-entrypoint.sh "$@"
