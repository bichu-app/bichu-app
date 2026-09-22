# syntax=docker/dockerfile:1.7
# ===========================================================================
# Imagem do Bichu. UMA imagem, dois pontos de entrada (ADR-0001):
#
#   node dist/bin/api.js      -> processo HTTP
#   node dist/bin/worker.js   -> processo de trabalho, vida longa
#
# Nao sao dois servicos: e o mesmo codigo, o que mantem uma implantacao so e
# um contrato so. Quem for tentado a separar precisa separar tambem o contrato.
#
# Alvos:
#   dev       codigo, testes e ferramenta de build dentro da imagem. E o alvo
#             do compose local, e e ele que `make test` e `make seed` usam.
#   prod      so o que roda: 4 dependencias de runtime, `dist/` e o contrato.
#             Sem tsc, sem eslint, sem `src/`, sem `tests/`.
#   migrador  o unico alvo que carrega `node-pg-migrate`. Ver o bloco MIGRACAO.
#
# `compose.yaml` escolhe entre `dev` e `prod` por BUILD_TARGET; `migracao` fixa
# `migrador` porque a migracao nao muda de forma entre ambientes.
#
# ---------------------------------------------------------------------------
# BASE: bookworm-slim (glibc) e NAO alpine (musl). LEIA ANTES DE TROCAR.
# ---------------------------------------------------------------------------
# Hoje as quatro dependencias de runtime (fastify, kysely, pg, yaml) sao
# JavaScript puro e as duas bases servem igual -- alpine economizaria ~80 MB.
#
# O que decide e o que vem depois: o worker vai processar imagem, e `sharp`
# (hoje so um nome na lista de proibidos do dominio, nao instalado) publica
# binario pre-compilado por libc. Em musl e preciso instalar as variantes
# `--os=linux --libc=musl` explicitamente, e quando elas faltam o npm compila
# do zero -- o que exige toolchain C, vips e python na imagem, justamente o
# que a imagem final nao pode ter. Em glibc o binario baixa e roda.
#
# Quando `sharp` entrar, o que muda AQUI e uma linha de dependencia e nada
# mais. Em alpine mudaria a base, o estagio de build e o tamanho final.
# ---------------------------------------------------------------------------
# Digest fixado: `latest` em qualquer ambiente e defeito, e tag movel
# transforma "funciona aqui" em coincidencia. Reresolver com `make pin-digests`.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS base
# Node 22 LTS: `package.json` fixa engines >=22 <23.
WORKDIR /app
RUN chown node:node /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
# A aplicacao escuta em $PORT e nao termina TLS (docs/07-devops.md 3.3).
ENV PORT=3000
# Dentro do container o processo precisa ouvir em todas as interfaces, senao a
# borda nao alcanca e a sonda -- que bate em 127.0.0.1 de DENTRO -- fica verde
# com o servico inalcancavel de fora. O que limita a exposicao real e o
# mapeamento de porta do compose, nao este valor.
ENV BIND_HOST=0.0.0.0

# --------------------------------------------------------------------------
# Dependencias. Dois estagios porque a arvore de producao e outra arvore, e
# `npm prune` depois do build deixa restos.
# --------------------------------------------------------------------------
FROM base AS deps-full
COPY package.json package-lock.json ./
# `npm ci` e nao `npm install`: instala o que o lockfile diz, ou falha.
RUN npm ci

FROM base AS deps-prod
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --------------------------------------------------------------------------
# Compilacao. `tsc -p tsconfig.build.json`: src/ -> dist/, sem *.test.ts e sem
# tests/. O artefato sai daqui uma vez e os tres alvos abaixo copiam o MESMO
# dist -- compilar por alvo produziria binarios diferentes com o mesmo nome.
# --------------------------------------------------------------------------
FROM deps-full AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && test -f dist/bin/api.js && test -f dist/bin/worker.js

# --------------------------------------------------------------------------
# O COMMIT. LEIA ANTES DE AFROUXAR.
# --------------------------------------------------------------------------
# `build.artifact` e EVIDENCIA: a aplicacao calcula o resumo lendo `dist/`, o
# contrato e o `package.json` do disco de DENTRO do container, na subida. Por
# isso ele sempre funcionou -- ninguem precisa lembrar de nada.
#
# O commit e a outra metade, e ele NAO se calcula do disco: `.git` esta no
# `.dockerignore` (historico nao entra em imagem) e a imagem final nao tem git.
# Ele so pode ser DECLARADO por quem constroi. Ate 22/09 o `compose.yaml`
# declarava por variavel de RUNTIME com padrao vazio -- e `optionalEnv` mapeia
# `''` para ausente, entao o padrao vazio virava `commit: null` na sonda, sem
# nenhum ruido. O caminho de injecao existia pela metade: o leitor conferia a
# FORMA do valor e nada nunca fornecia valor.
#
# O que mudou: o commit entra por ARGUMENTO DE BUILD e fica gravado na imagem.
# Ele passa a VIAJAR com o artefato -- quem promove a imagem entre ambientes
# promove o commit junto, e homologacao e producao respondem o mesmo valor sem
# ninguem declarar nada na VM.
#
# E o build REPROVA quando ele falta. Binario que nao sabe de onde veio nao deve
# ser produzido: com `commit` nulo, um servico rodando codigo ANTIGO responde
# `status: ok` igual a um rodando o novo, e "subiu" e "achamos que subiu" ficam
# indistinguiveis. Mesma regra que o codigo ja aplica a variavel de ambiente
# ausente (`requireEnv`): falha ruidosa, com o nome na mensagem.
#
# Este estagio existe separado para a conferencia ficar em UM lugar. Os tres
# alvos finais copiam `/etc/bichu/commit` dele, e e essa copia que o poe no
# grafo do build: sem ela o BuildKit pularia o estagio e a conferencia seria
# decorativa. O arquivo tambem e evidencia conferivel de fora, sem subir nada:
#   docker run --rm --entrypoint cat bichu-app:local /etc/bichu/commit
#
# O ARG fica no FIM de cada alvo, depois de todo COPY, de proposito: ele muda a
# cada commit, e mais acima invalidaria `npm ci` e a compilacao em toda troca de
# HEAD.
FROM base AS commit
ARG BUILD_COMMIT
RUN set -eu; \
    if ! printf '%s' "${BUILD_COMMIT:-}" | grep -Eq '^[0-9a-f]{7,40}$'; then \
      echo "ERRO: BUILD_COMMIT nao foi injetado neste build (veio '${BUILD_COMMIT:-}')." >&2; \
      echo "  Esperado: de 7 a 40 digitos hexadecimais minusculos, o commit REAL de que esta" >&2; \
      echo "  imagem esta sendo construida. Nao invente um valor e nao use rotulo movel: um" >&2; \
      echo "  SHA falso engana pior que o nulo de antes, porque a sonda passa a AFIRMAR em" >&2; \
      echo "  vez de calar, e a esteira compara o valor reportado com o commit construido." >&2; \
      echo "  Via compose: BUILD_COMMIT=\$(git rev-parse HEAD) docker compose build" >&2; \
      echo "  Direto:      docker build --build-arg BUILD_COMMIT=\$(git rev-parse HEAD) ." >&2; \
      exit 1; \
    fi; \
    mkdir -p /etc/bichu; \
    printf '%s' "$BUILD_COMMIT" > /etc/bichu/commit

# --------------------------------------------------------------------------
# ALVO dev
# --------------------------------------------------------------------------
# Carrega o codigo e a suite porque `make test` e `make test-int` rodam DENTRO
# deste container (`compose run --rm api npm test`). Tirar `src/` e `tests/`
# daqui faria o teste rodar em outro lugar que nao a imagem que sobe.
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps-full --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json tsconfig.json tsconfig.build.json eslint.config.mjs ./
COPY --chown=node:node src ./src
COPY --chown=node:node tests ./tests
COPY --chown=node:node api ./api
COPY --chown=node:node migrations ./migrations
COPY --from=build --chown=node:node /app/dist ./dist
# Ver o bloco "O COMMIT" acima. O COPY e o que poe o estagio `commit` -- e a
# conferencia que ele carrega -- no grafo deste build.
COPY --from=commit /etc/bichu/commit /etc/bichu/commit
ARG BUILD_COMMIT
ENV BUILD_COMMIT=${BUILD_COMMIT}
USER node
EXPOSE 3000
# O processo trata SIGTERM sozinho (bin/api.ts e bin/worker.ts), entao ele pode
# ser o PID 1 sem supervisor: `tini` aqui so esconderia quem drena o que.
CMD ["node", "dist/bin/api.js"]

# --------------------------------------------------------------------------
# ALVO prod
# --------------------------------------------------------------------------
# Sem ferramenta de build, sem fonte, sem suite. `api/openapi.yaml` ENTRA:
# `carregarContrato` le a especificacao na SUBIDA (src/bin/api.ts), e sem o
# arquivo o processo morre no boot em vez de servir rota sem verificacao.
FROM base AS prod
ENV NODE_ENV=production
COPY --from=deps-prod --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node api ./api
COPY --from=build --chown=node:node /app/dist ./dist
# Ver o bloco "O COMMIT" acima.
COPY --from=commit /etc/bichu/commit /etc/bichu/commit
ARG BUILD_COMMIT
ENV BUILD_COMMIT=${BUILD_COMMIT}
USER node
EXPOSE 3000
CMD ["node", "dist/bin/api.js"]

# --------------------------------------------------------------------------
# ALVO migrador
# --------------------------------------------------------------------------
# MIGRACAO: por que um alvo separado, e nao um passo do boot da api.
#
# 1. Migrar no boot da api transforma N replicas em N migradores concorrendo.
#    O lock consultivo do node-pg-migrate resolve a corrida, mas o custo e que
#    uma migracao ruim derruba TODAS as replicas ao mesmo tempo, sem ninguem
#    para servir enquanto se investiga.
# 2. `node-pg-migrate` e devDependency. Entra-la no alvo `prod` significaria
#    carregar tsc e eslint no runtime; deixar a migracao sem ferramenta
#    significaria migrar de fora, a mao, que e o passo manual escondido que
#    este documento existe para nao ter.
#
# O alvo `migrador` resolve os dois: e um JOB, roda ate o fim, sai, e a api so
# comeca depois dele (`service_completed_successfully` no compose). Mesma
# arvore de dependencia do lockfile, nenhuma instalacao a mais.
#
# Em ambiente hospedado este mesmo alvo e um job de implantacao, executado uma
# vez antes de promover a imagem da aplicacao.
FROM base AS migrador
ENV NODE_ENV=production
COPY --from=deps-full --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --chown=node:node migrations ./migrations
# O migrador nao responde sonda, mas e artefato como os outros dois: se ele
# puder ser produzido sem saber de onde veio, existe um caminho de build sem a
# conferencia, e caminho sem portao e por onde o portao deixa de valer.
COPY --from=commit /etc/bichu/commit /etc/bichu/commit
ARG BUILD_COMMIT
ENV BUILD_COMMIT=${BUILD_COMMIT}
USER node
# Caminho explicito do arquivo em vez de `npx`: `npx` resolve na rede quando
# nao acha local, e uma imagem que busca ferramenta na rede em tempo de
# execucao nao e reproduzivel.
ENTRYPOINT ["node", "node_modules/node-pg-migrate/bin/node-pg-migrate.js"]
CMD ["up"]
