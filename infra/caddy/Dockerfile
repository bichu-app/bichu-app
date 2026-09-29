# Imagem da BORDA. Ate 23/09 a borda era o `caddy:2.8-alpine` de prateleira; a
# emenda 2 do ADR-0016 (ADR-0027 item 11, D45 da seguranca) trouxe um teto de
# taxa na borda SO para o host administrativo, e o Caddy nao tem limitador de
# taxa sem plugin. Plugin significa binario proprio, e binario proprio e esta
# imagem.
#
# Contexto de build: `infra/caddy/`. O Caddyfile continua MONTADO pelo compose
# (e nao copiado aqui): trocar uma regra de borda segue sendo recriar o
# container, sem reconstruir imagem.
#
#   docker build --build-arg BUILD_COMMIT=$(git rev-parse HEAD) -t bichu-edge:local infra/caddy
#   (ou `docker compose build edge`, que e o caminho que a esteira usa)
#
# O QUE ESTA IMAGEM TEM A MAIS QUE A DE PRATELEIRA: um modulo, e so ele.
#   `http.handlers.rate_limit` (github.com/mholt/caddy-ratelimit)
# A esteira confere isso no binario (`caddy list-modules`), e a lista de modulos
# nao-padrao precisa ser exatamente esta: modulo novo aqui e superficie nova na
# borda, e entra por decisao, nao por conveniencia.

# --------------------------------------------------------------------------
# ESTAGIO construcao: o binario com o plugin
# --------------------------------------------------------------------------
# O construtor oficial do Caddy (`xcaddy`), pelo digest. As DUAS versoes que
# decidem o binario estao fixadas aqui e em mais lugar nenhum:
#
#   CADDY_VERSAO     a MESMA do `caddy:2.8-alpine` do estagio final (v2.8.4,
#                    conferida com `caddy version` na imagem de prateleira).
#                    Versao diferente entre construtor e base troca o
#                    comportamento da borda sem ninguem pedir;
#   RATELIMIT_COMMIT o commit do plugin, e nao `@latest`: o repositorio nao
#                    publica versao, e o commit seguinte a este (6cc6d95,
#                    14/05/2026) passou a exigir Caddy v2.10. Este e o ultimo
#                    que declara `caddy/v2 v2.8.0` no go.mod.
FROM caddy:2.8-builder-alpine@sha256:4ac56838081008c467ae701ebf425c53db62f91e5fa723151904b9ee75d09346 AS construcao
ARG CADDY_VERSAO=v2.8.4
ARG RATELIMIT_COMMIT=b8d8c9a9d99ee352d675cbbe416ec2b489fc8cab
RUN xcaddy build "$CADDY_VERSAO" --with "github.com/mholt/caddy-ratelimit@$RATELIMIT_COMMIT"

# --------------------------------------------------------------------------
# O COMMIT, com a mesma regra das outras imagens (BICHUS-210)
# --------------------------------------------------------------------------
# `verificar_commit_de_build.py` exige `BUILD_COMMIT` em todo servico do compose
# que constroi, e a borda passou a ser um deles.
FROM caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17 AS commit
ARG BUILD_COMMIT
RUN set -eu; \
    if ! printf '%s' "${BUILD_COMMIT:-}" | grep -Eq '^[0-9a-f]{7,40}$'; then \
      echo "ERRO: BUILD_COMMIT nao foi injetado neste build (veio '${BUILD_COMMIT:-}')." >&2; \
      echo "  Via compose: BUILD_COMMIT=\$(git rev-parse HEAD) docker compose build edge" >&2; \
      exit 1; \
    fi; \
    printf '%s' "$BUILD_COMMIT" > /commit

# --------------------------------------------------------------------------
# ESTAGIO final: a MESMA base de antes, com o binario trocado
# --------------------------------------------------------------------------
# `caddy:2.8-alpine` pelo mesmo digest de antes: usuario, diretorios, `/data` e
# `/config` e o comportamento da imagem oficial ficam como estavam. Muda so o
# executavel. Sem Go e sem xcaddy na imagem final.
#
# Roda como root, COMO ANTES: a borda escuta 80 e 443 no hospedado. Tirar o
# root daqui e mudanca propria, com medicao propria, e nao carona desta.
FROM caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17
ARG BUILD_COMMIT
LABEL org.opencontainers.image.title="bichu-edge" \
      org.opencontainers.image.revision="${BUILD_COMMIT}"
COPY --from=construcao /usr/bin/caddy /usr/bin/caddy
COPY --from=commit /commit /etc/bichu/commit
# A imagem de prateleira DECLARA `cap_net_bind_service` no binario dela; o
# binario novo nasce sem. Como a borda roda como root, isso nao muda nada hoje,
# e fica escrito para quem for tirar o root: vai precisar do `setcap` de volta.
