# Imagem do BACKOFFICE (SPA React + TypeScript em `admin/`). Separada da imagem
# da API e da do site por decisao do cliente de 23/09/2026: roda hoje na mesma
# VM, atras da mesma borda, em `admin.bichu.app`, e a separacao existe para que
# mudar o backoffice de lugar seja mover UMA imagem e trocar um upstream na
# borda, sem desmontar a pilha da API.
#
# Mesmo desenho da imagem do site (`web/Dockerfile`), de proposito: duas
# imagens estaticas com dois desenhos diferentes sao dois jeitos de errar.
#
# Contexto de build: `admin/`, e nada acima dele. A imagem nao enxerga `.env`,
# `src/` nem segredo nenhum da API, e isso e garantido pelo contexto, nao por
# disciplina.
#
#   docker build --build-arg BUILD_COMMIT=$(git rev-parse HEAD) -t bichu-admin-web:local admin
#   (ou `docker compose build admin-web`, que e o caminho que a esteira usa)
#
# O backend NAO serve este HTML (ADR-0017): quem serve e o Caddy DESTA imagem,
# e a borda so escolhe qual host chega aqui.

# --------------------------------------------------------------------------
# ESTAGIO build
# --------------------------------------------------------------------------
# O combinado com quem escreve o app: `npm ci && npm run build` produz um site
# estatico em `dist/`. Se o gerador mudar de pasta, ajuste `SAIDA` -- e o unico
# lugar.
#
# Diferente do site, aqui NAO ha placeholder: sem `package.json` o build
# REPROVA. O site nasceu com uma pagina tecnica para provar o encanamento antes
# do conteudo; o backoffice nao tem o que servir sem o app, e uma imagem que
# sobe vazia passaria na sonda de processo e responderia 404 a quem administra.
#
# Mesma imagem base (e mesmo digest) do Dockerfile da API: uma versao de Node
# so no repositorio, atualizada num lugar so (`make pin-digests`).
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS build
WORKDIR /admin
ARG SAIDA=dist
# A chave de SITE do reCAPTCHA Enterprise (D41), que o documento `/entrar` usa
# para colher o token. Ela e PUBLICA por natureza (vai no HTML de qualquer
# pagina que usa o reCAPTCHA) e entra no pacote pelo Vite, que le `VITE_*` do
# ambiente do `npm run build`: ARG basta, porque todo ARG do estagio e variavel
# de ambiente no RUN. Sem ela, o build passa e o login recusa com "captcha
# indisponivel" (a API tambem recusa sem token: nao ha modo que aprove sem
# avaliar). Nunca a chave de API do projeto: essa e segredo e fica so na API.
ARG VITE_CAPTCHA_SITE_KEY=
# Manifesto primeiro, fonte depois: mexer num componente nao invalida a camada
# do `npm ci`, que e a mais cara do build.
#
# O `Caddyfile` vai junto so para o glob nunca casar com zero arquivos: sem ele,
# um `admin/` sem manifesto morreria no COPY com "not found", que nao diz o que
# falta. Com ele, quem reprova e o passo abaixo, com a frase certa.
COPY package*.json Caddyfile ./
RUN set -eu; \
    if [ ! -f package.json ]; then \
      echo "ERRO: admin/ sem package.json. O backoffice nao tem placeholder: sem o app nao ha imagem." >&2; \
      exit 1; \
    fi; \
    if [ ! -f package-lock.json ]; then \
      echo "ERRO: admin/package.json sem package-lock.json. Build sem lockfile nao e reproduzivel." >&2; \
      exit 1; \
    fi; \
    npm ci --no-audit --no-fund
COPY . .
# Build que nao produz a pagina inicial REPROVA no fim deste passo. Sem isto, um
# `dist/` vazio vira uma imagem que sobe, passa numa sonda de processo e
# responde 404 para todo mundo.
#
# E build de producao SEM MAPA DE CODIGO-FONTE (docs/04-seguranca.md, D48): o
# `.map` entrega o fonte original, comentario incluido, a quem abrir o
# DevTools no host administrativo. Conferido AQUI, no unico caminho que produz a
# imagem, e nao so na esteira: a configuracao do Vite e de quem escreve o app, e
# um `sourcemap: true` esquecido nao pode chegar ao ar por nenhum caminho.
#
# `build:imagem`, e nao `build`: a unica diferenca e que o `tsc -b` aqui
# confere so o app e a configuracao do Vite, e nao `tsconfig.test.json`. O
# contexto de build e `admin/`, e ha teste do painel que le o dominio do
# servidor em `../src/` de proposito (observacoes, D59): no contexto da imagem
# esse caminho nao existe, e o build morria em TS2307. O teste continua
# conferido no `npm run build` e na suite do painel, fora da imagem.
RUN set -eu; \
    npm run build:imagem; \
    if [ ! -f "$SAIDA/index.html" ]; then \
      echo "ERRO: o build do backoffice nao produziu index.html em $SAIDA/." >&2; \
      exit 1; \
    fi; \
    mapas=$(find "$SAIDA" -type f -name '*.map' | head -5); \
    referencias=$(grep -rl 'sourceMappingURL' "$SAIDA" | head -5 || true); \
    if [ -n "$mapas$referencias" ]; then \
      echo "ERRO: o build do backoffice gerou mapa de codigo-fonte (D48). Desligue \`build.sourcemap\` no Vite." >&2; \
      printf '  %s\n' $mapas $referencias >&2; \
      exit 1; \
    fi; \
    mv "$SAIDA" /saida

# PRE-COMPRESSAO NO BUILD, e o motivo e memoria, nao so CPU. Sem ela o Caddy
# comprime o pacote JavaScript A CADA requisicao, e o compressor aloca: medido
# em 23/09 com 30 mil requisicoes, o container chegou a 91 MiB de pico com o
# teto aberto, contra 14 MiB em repouso. Com `.br` e `.gz` prontos ao lado de
# cada arquivo, o `file_server { precompressed }` do `admin/Caddyfile` so copia
# bytes. Node da propria imagem de build (zlib tem brotli): nenhuma ferramenta
# a mais. Abaixo de 1 KiB nao compensa o arquivo extra.
RUN node -e ' \
  const fs = require("fs"), z = require("zlib"), p = require("path"); \
  const texto = /\.(js|mjs|css|html|svg|json|txt|webmanifest|xml)$/; \
  let n = 0; \
  (function varrer(d) { \
    for (const nome of fs.readdirSync(d)) { \
      const c = p.join(d, nome), s = fs.statSync(c); \
      if (s.isDirectory()) { varrer(c); continue; } \
      if (!texto.test(nome) || s.size < 1024) continue; \
      const b = fs.readFileSync(c); \
      fs.writeFileSync(c + ".gz", z.gzipSync(b, { level: 9 })); \
      fs.writeFileSync(c + ".br", z.brotliCompressSync(b, { params: { [z.constants.BROTLI_PARAM_QUALITY]: 11 } })); \
      n++; \
    } \
  })("/saida"); \
  console.log("pre-comprimidos: " + n + " arquivo(s)"); \
'

# --------------------------------------------------------------------------
# O COMMIT, com a mesma regra da imagem da API (BICHUS-210)
# --------------------------------------------------------------------------
# Sem commit real o build reprova. `infra/verificacao/verificar_commit_de_build.py`
# exige que todo servico do compose que constroi receba `BUILD_COMMIT`, e este
# e um deles. Estagio a partir do `node` puro, e nao do `build`: o ARG muda a
# cada commit, e herdar do `build` nao muda nada no cache, mas deixa claro que
# a conferencia nao depende do app.
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS commit
ARG BUILD_COMMIT
RUN set -eu; \
    if ! printf '%s' "${BUILD_COMMIT:-}" | grep -Eq '^[0-9a-f]{7,40}$'; then \
      echo "ERRO: BUILD_COMMIT nao foi injetado neste build (veio '${BUILD_COMMIT:-}')." >&2; \
      echo "  Via compose: BUILD_COMMIT=\$(git rev-parse HEAD) docker compose build admin-web" >&2; \
      exit 1; \
    fi; \
    printf '%s' "$BUILD_COMMIT" > /commit

# --------------------------------------------------------------------------
# ESTAGIO final: so o servidor estatico e os arquivos
# --------------------------------------------------------------------------
# O MESMO `caddy:2.8-alpine`, pelo mesmo digest, que a borda usa. Uma imagem de
# servidor a menos para acompanhar.
#
# Sem Node, sem npm, sem fonte: a imagem final nao tem ferramenta de build.
FROM caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17
ARG BUILD_COMMIT
LABEL org.opencontainers.image.title="bichu-admin-web" \
      org.opencontainers.image.revision="${BUILD_COMMIT}"

# O binario do Caddy nesta imagem carrega `cap_net_bind_service` como atributo
# de arquivo, para ouvir na 80 sem ser root. Aqui ele ouve na 8080 e nao
# precisa dela -- e com o atributo presente o compose nao consegue derrubar
# todas as capacidades (`cap_drop: ALL`): o nucleo recusa executar um binario
# que pede capacidade fora do conjunto permitido.
RUN apk add --no-cache --virtual .setcap libcap \
    && setcap -r /usr/bin/caddy \
    && apk del .setcap

COPY --from=commit /commit /etc/bichu/commit
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=root:root /saida /srv/admin

# Usuario sem privilegio. Os arquivos sao do root e so leitura para ele.
# XDG_* em /tmp porque o Caddy grava estado mesmo sem TLS e sem admin, e a raiz
# do container e somente leitura (tmpfs em /tmp pelo compose).
ENV XDG_DATA_HOME=/tmp/caddy-data \
    XDG_CONFIG_HOME=/tmp/caddy-config
USER 65532:65532
EXPOSE 8080

# A sonda pede a PAGINA INICIAL, e nao um caminho de saude: prova que o
# processo ouve e que o conteudo esta na imagem.
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
