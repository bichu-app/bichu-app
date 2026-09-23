# Imagem do SITE (institucional e paginas publicas), ADR-0024. Separada da
# imagem da API por decisao do cliente de 23/09/2026: roda hoje na mesma VM,
# atras da mesma borda, e a separacao existe para que mudar o site de maquina
# seja mover UMA imagem, sem desmontar a pilha da API.
#
# Contexto de build: `web/`, e nada acima dele. A imagem nao enxerga `.env`,
# `src/`, `api/` nem `design/`: os derivados de que o site precisa (tipos do
# contrato, tokens) sao versionados dentro de `web/` (ADR-0024, item 9).
#
#   docker compose build web          (o caminho da esteira e do host)
#   docker build --build-arg BUILD_COMMIT=$(git rev-parse HEAD) -t bichu-web:local web

# Mesma base, pelo mesmo digest, da imagem da API: uma linha de Node so no
# repositorio. O Astro 7 exige Node >= 22.12, e esta e a 22.
ARG NODE_IMAGE=node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

# --------------------------------------------------------------------------
# build: dependencias completas, `astro build`
# --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /web
# Lockfile primeiro, para a camada de dependencias so refazer quando ele muda.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
 && test -f dist/client/index.html \
 || { echo "ERRO: o build do site nao produziu dist/client/index.html" >&2; exit 1; }

# --------------------------------------------------------------------------
# deps: so as de producao. O ponto de entrada do servidor do Astro importa o
# pacote `astro` em tempo de execucao, entao ele fica; o que e so de build
# (verificador de tipos, lint) vai em devDependencies e nao chega aqui.
# --------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# --------------------------------------------------------------------------
# O COMMIT, com a mesma regra da imagem da API (BICHUS-210)
# --------------------------------------------------------------------------
# `infra/verificacao/verificar_commit_de_build.py` exige que todo servico do
# compose que constroi receba `BUILD_COMMIT`, e sem commit real o build
# reprova aqui, com o motivo.
FROM ${NODE_IMAGE} AS commit
ARG BUILD_COMMIT
RUN set -eu; \
    if ! printf '%s' "${BUILD_COMMIT:-}" | grep -Eq '^[0-9a-f]{7,40}$'; then \
      echo "ERRO: BUILD_COMMIT nao foi injetado neste build (veio '${BUILD_COMMIT:-}')." >&2; \
      echo "  Via compose: BUILD_COMMIT=\$(git rev-parse HEAD) docker compose build web" >&2; \
      exit 1; \
    fi; \
    printf '%s' "$BUILD_COMMIT" > /commit

# --------------------------------------------------------------------------
# final: `dist/`, dependencias de producao e o servidor minimo
# --------------------------------------------------------------------------
FROM ${NODE_IMAGE}
ARG BUILD_COMMIT
LABEL org.opencontainers.image.title="bichu-web" \
      org.opencontainers.image.revision="${BUILD_COMMIT}"
ENV NODE_ENV=production \
    PORT=4321 \
    HOST=0.0.0.0
WORKDIR /web
COPY --from=commit /commit /etc/bichu/commit
# Tudo do root e so leitura para o processo: quem serve o site nao consegue
# altera-lo, e a raiz do container tambem e somente leitura no compose.
COPY --from=deps /web/node_modules ./node_modules
COPY --from=build /web/dist ./dist
COPY package.json servidor.mjs ./
USER node
EXPOSE 4321

# `/healthz` e respondido pelo servidor minimo (ADR-0024, item 7). O Node da
# imagem slim nao tem curl nem wget, e a sonda usa o proprio runtime -- o
# mesmo padrao da sonda da API.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4321/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "servidor.mjs"]
