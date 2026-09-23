# Imagem do SITE (institucional e paginas publicas). Separada da imagem da API
# por decisao do cliente de 23/09/2026: roda hoje na mesma VM, atras da mesma
# borda, e a separacao existe para que mudar o site de maquina seja mover UMA
# imagem, sem desmontar a pilha da API.
#
# Contexto de build: `web/`, e nada acima dele. A imagem nao enxerga `.env`,
# `src/` nem segredo nenhum da API, e isso e garantido pelo contexto, nao por
# disciplina.
#
#   docker build --build-arg BUILD_COMMIT=$(git rev-parse HEAD) -t bichu-web:local web
#   (ou `docker compose build web`, que e o caminho que a esteira usa)

# --------------------------------------------------------------------------
# ESTAGIO build
# --------------------------------------------------------------------------
# Hoje `web/` tem so um placeholder tecnico em `public/`, que existe para
# provar o encanamento. Quando o site entrar (com `package.json`), o mesmo
# estagio passa a rodar `npm ci` e `npm run build` sem ninguem mexer aqui.
#
# A saida esperada e `dist/`, que e o padrao do Astro. Se o gerador for outro,
# ajuste `SAIDA` -- e o unico lugar.
#
# Mesma imagem base (e mesmo digest) do Dockerfile da API: uma versao de Node
# so no repositorio, atualizada num lugar so.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /web
ARG SAIDA=dist
COPY . .
# Build que nao produz a pagina inicial REPROVA no fim deste passo. Sem isto, um
# `dist/` vazio vira uma imagem que sobe, passa numa sonda de processo e
# responde 404 para todo mundo.
RUN set -eu; \
    if [ -f package.json ]; then \
      if [ ! -f package-lock.json ]; then \
        echo "ERRO: web/package.json sem package-lock.json. Build sem lockfile nao e reproduzivel." >&2; \
        exit 1; \
      fi; \
      npm ci --no-audit --no-fund; \
      npm run build; \
    else \
      echo "web/ sem package.json: publicando web/public como esta (placeholder tecnico)"; \
      rm -rf "$SAIDA"; mkdir -p "$SAIDA"; cp -R public/. "$SAIDA"/; \
    fi; \
    mv "$SAIDA" /saida; \
    if [ ! -f /saida/index.html ]; then \
      echo "ERRO: o build do site nao produziu index.html em $SAIDA/." >&2; \
      exit 1; \
    fi

# --------------------------------------------------------------------------
# O COMMIT, com a mesma regra da imagem da API (BICHUS-210)
# --------------------------------------------------------------------------
# Sem commit real o build reprova. `infra/verificacao/verificar_commit_de_build.py`
# exige que todo servico do compose que constroi receba `BUILD_COMMIT`, e este
# e um deles.
FROM build AS commit
ARG BUILD_COMMIT
RUN set -eu; \
    if ! printf '%s' "${BUILD_COMMIT:-}" | grep -Eq '^[0-9a-f]{7,40}$'; then \
      echo "ERRO: BUILD_COMMIT nao foi injetado neste build (veio '${BUILD_COMMIT:-}')." >&2; \
      echo "  Via compose: BUILD_COMMIT=\$(git rev-parse HEAD) docker compose build web" >&2; \
      exit 1; \
    fi; \
    printf '%s' "$BUILD_COMMIT" > /commit

# --------------------------------------------------------------------------
# ESTAGIO final: so o servidor estatico e os arquivos
# --------------------------------------------------------------------------
# O MESMO `caddy:2.8-alpine`, pelo mesmo digest, que a borda usa. Uma imagem de
# servidor a menos para acompanhar, e o comportamento de cabecalho e compressao
# e o mesmo dos dois lados.
#
# Sem Node, sem npm, sem fonte: a imagem final nao tem ferramenta de build.
FROM caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17
ARG BUILD_COMMIT
LABEL org.opencontainers.image.title="bichu-web" \
      org.opencontainers.image.revision="${BUILD_COMMIT}"

# O binario do Caddy nesta imagem carrega a capacidade `cap_net_bind_service`
# como atributo de arquivo, para ouvir na 80 sem ser root. Aqui ele ouve na
# 8080 e nao precisa dela -- e com o atributo presente, o compose nao consegue
# derrubar todas as capacidades (`cap_drop: ALL`): o nucleo recusa executar um
# binario que pede capacidade fora do conjunto permitido. Remover o atributo e
# o que deixa o container rodar sem capacidade nenhuma.
RUN apk add --no-cache --virtual .setcap libcap \
    && setcap -r /usr/bin/caddy \
    && apk del .setcap

COPY --from=commit /commit /etc/bichu/commit
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=root:root /saida /srv/site

# Usuario sem privilegio. Os arquivos sao do root e so leitura para ele: o
# processo que serve o site nao consegue altera-lo.
#
# O Caddy grava estado em XDG_DATA_HOME e XDG_CONFIG_HOME mesmo sem TLS e sem
# admin; os dois apontam para /tmp, que o compose monta como tmpfs porque a raiz
# do container e somente leitura.
ENV XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config
USER 65532:65532
EXPOSE 8080

# A sonda pede a PAGINA INICIAL, e nao um caminho de saude: prova que o
# processo ouve e que o conteudo esta na imagem. Um `/healthz` responderia 200
# com `/srv/site` vazio.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
