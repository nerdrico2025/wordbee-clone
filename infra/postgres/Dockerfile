# Postgres de produção, rodando como serviço "App" no EasyPanel (mesmo VPS
# do worker). Substitui o Neon — ver DECISIONS.md "Postgres sai do Neon
# para o VPS" (2026-09-28).
#
# O web continua na Vercel (IP de saída dinâmico), então a porta precisa
# ficar exposta na internet. Por isso esta imagem, em vez do template
# nativo de Postgres do EasyPanel:
#   - TLS obrigatório para qualquer conexão de rede (pg_hba só tem
#     `hostssl` para endereços externos — conexão sem TLS é recusada);
#   - autenticação só por scram-sha-256.
# O certificado é autoassinado e regenerado a cada start (ver
# entrypoint-tls.sh) — os clientes usam `sslaccept=accept_invalid_certs`.
#
# Build a partir da RAIZ do repositório:
#   docker build -f infra/postgres/Dockerfile -t wordbee-postgres .
FROM postgres:17-alpine

RUN apk add --no-cache openssl

COPY infra/postgres/pg_hba.conf /etc/postgresql/pg_hba.conf
COPY infra/postgres/entrypoint-tls.sh /usr/local/bin/entrypoint-tls.sh
RUN chmod 644 /etc/postgresql/pg_hba.conf && chmod 755 /usr/local/bin/entrypoint-tls.sh

ENTRYPOINT ["/usr/local/bin/entrypoint-tls.sh"]
CMD ["postgres"]
