#!/usr/bin/env bash
# O backoffice (`admin/`) constroi, sobe restrito e e servido pela borda como a
# seguranca pediu. UM script para o laptop (`make verificar-backoffice`) e para a
# esteira (job `admin`): duas copias da mesma receita divergem, e a que diverge
# para menos aprova o que nao conferiu.
#
# O que roda, na ordem do mais barato para o mais caro:
#
#   1. autoteste da sonda (sem docker): as iscas do juizo reprovam;
#   2. a imagem real, pelo MESMO caminho do host (`docker compose build admin-web`);
#   3. tres iscas de build que PRECISAM reprovar, cada uma pelo motivo dela:
#      sem BUILD_COMMIT, sem package.json, e com mapa de codigo-fonte (D48);
#   4. uma pilha ISOLADA (projeto proprio, nenhuma porta publicada) com
#      `admin-web`, `edge` e um eco no lugar da `api`;
#   5. as restricoes do container conferidas no runtime, e nao no YAML;
#   6. a sonda pela borda de pe (`verificar-backoffice-na-borda.mjs --eco`).
#
# A pilha isolada e derrubada no fim, com volume, e SO ela: o projeto tem nome
# proprio, entao a pilha de quem esta desenvolvendo (`bichu`) nao e tocada.
#
# Saida: 0 aprovado, 1 reprovado. Sem `admin/package.json`, reprova: o
# backoffice nao tem placeholder, e nao haver o que verificar nao e aprovar.

set -euo pipefail

raiz=$(git rev-parse --show-toplevel)
cd "$raiz"

NODE_IMAGEM='node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5'
projeto="${PROJETO_DA_SONDA:-bichu-sonda-backoffice}"
# Tag PROPRIA, e nao `local`: `bichu-edge:local` e `bichu-admin-web:local` sao
# as imagens da pilha `bichu` de quem esta desenvolvendo, e o compose sobe a
# imagem que achar com a tag, sem reconstruir. Construir aqui com `local`
# trocaria, em silencio, o que a proxima `make up` da arvore principal sobe.
# Medido em 23/09 com `bichu-app:local`, antes desta linha existir.
export IMAGE_TAG="${IMAGE_TAG_DA_SONDA:-sonda-backoffice}"
commit="${BUILD_COMMIT:-$(git rev-parse HEAD)}"
trabalho=$(mktemp -d)
falhas=0
reprova() { echo "::error::$1"; echo "REPROVA: $1" >&2; falhas=1; }

# O compose exige quatro chaves com `:?` que nem o backoffice nem a borda usam.
# Valores descartaveis, fora do repositorio: o `admin-web` nao le `.env`, e o passo
# 5 prova isso.
printf '%s\n' POSTGRES_PASSWORD=x OBJECT_STORAGE_ACCESS_KEY_ID=x \
  OBJECT_STORAGE_SECRET_ACCESS_KEY=x OBJECT_STORAGE_KMS_KEY=x \
  "BUILD_COMMIT=$commit" > "$trabalho/sonda.env"
# As URLs da borda FIXAS aqui, na frente do compose, e nao no `sonda.env`: pelo
# `make`, o Makefile EXPORTA `PUBLIC_BASE_URL` com a porta desta maquina
# (`portas.local.mk`, 3300 quando a 3000 esta ocupada pela pilha principal), e
# variavel de ambiente vence o `--env-file` na interpolacao. A borda passava a
# escutar na 3300, a sonda batia em `edge:3000` e reprovava com ECONNREFUSED
# (28/09). A pilha da sonda nao publica porta: a 3000 e so dentro da rede dela.
dc() {
  PUBLIC_BASE_URL=http://localhost:3000 MEDIA_PUBLIC_BASE_URL=http://localhost:3001 \
  docker compose -p "$projeto" --env-file "$trabalho/sonda.env" \
    -f compose.yaml -f infra/verificacao/compose.sonda-do-backoffice.yaml "$@"
}
limpar() { dc down -v --remove-orphans >/dev/null 2>&1 || true; rm -rf "$trabalho"; }
trap limpar EXIT

echo "== 1. autoteste da sonda"
node infra/verificacao/verificar-backoffice-na-borda.mjs --autoteste

echo "== 2. a imagem real, pelo compose"
if [ ! -f admin/package.json ]; then
  reprova "admin/package.json nao existe. O backoffice nao tem placeholder: sem o app nao ha imagem nem o que verificar"
  exit 1
fi
# A borda tambem: desde a emenda 2 do ADR-0016 ela e imagem propria, com o
# plugin de taxa, e a sonda do passo 6 prova o teto do login nela.
dc build --quiet admin-web edge
docker run --rm "bichu-edge:$IMAGE_TAG" caddy list-modules --skip-standard > "$trabalho/modulos.txt" 2>&1
nao_padrao=$(grep -E '^[a-z]+\.' "$trabalho/modulos.txt" | sort | tr '\n' ' ')
[ "$nao_padrao" = "http.handlers.rate_limit " ] || reprova "a borda tem modulos nao-padrao diferentes de exatamente \`http.handlers.rate_limit\`: '$nao_padrao'. Modulo novo na borda e superficie nova, e entra por decisao"
echo "modulos nao-padrao da borda: $nao_padrao"
tamanho=$(docker image inspect "bichu-admin-web:$IMAGE_TAG" --format '{{.Size}}')
echo "imagem bichu-admin-web:$IMAGE_TAG: $((tamanho / 1024 / 1024)) MiB ($tamanho bytes)"

echo "== 3. as iscas de build reprovam, cada uma pelo motivo dela"
isca_de_build() { # nome, contexto, frase esperada, [BUILD_COMMIT]
  local nome=$1 contexto=$2 frase=$3 arg=()
  [ -n "${4:-}" ] && arg=(--build-arg "BUILD_COMMIT=$4")
  if docker build --progress=plain ${arg[@]+"${arg[@]}"} "$contexto" >"$trabalho/$nome.log" 2>&1; then
    reprova "isca '$nome': o build PASSOU. A conferencia de admin/Dockerfile parou de valer"
  elif ! grep -q "$frase" "$trabalho/$nome.log"; then
    reprova "isca '$nome': o build reprovou, mas nao pelo motivo esperado ('$frase'). Fim do log:"
    tail -15 "$trabalho/$nome.log" >&2
  else
    echo "  isca '$nome' reprovada pelo motivo certo"
  fi
}
isca_de_build sem-commit admin 'BUILD_COMMIT nao foi injetado'
mkdir -p "$trabalho/sem-manifesto" "$trabalho/com-mapa"
cp admin/Dockerfile admin/Caddyfile "$trabalho/sem-manifesto/"
isca_de_build sem-manifesto "$trabalho/sem-manifesto" 'admin/ sem package.json' "$commit"
cp admin/Dockerfile admin/Caddyfile infra/verificacao/iscas/admin-com-mapa-de-fonte/package*.json "$trabalho/com-mapa/"
# A frase e o CAMINHO do mapa que o passo imprime, e nao a mensagem: o log
# `--progress=plain` repete o texto do RUN, mensagem incluida, e a isca passava
# por qualquer falha anterior do mesmo passo (conferido em 28/09 com o script
# `build:imagem` ausente na isca: reprovou por "Missing script" e foi contada
# como reprovada pelo motivo certo).
isca_de_build com-mapa-de-fonte "$trabalho/com-mapa" 'dist/assets/a.js.map' "$commit"

echo "== 4. pilha isolada: admin, borda e o eco no lugar da api"
dc up -d --no-deps --wait admin-web api edge

echo "== 5. restricoes do container, no runtime"
c=$(dc ps -q admin-web)
[ "$(docker inspect "$c" --format '{{.Config.User}}')" = "65532:65532" ] || reprova "o admin-web nao roda como usuario sem privilegio"
[ "$(docker inspect "$c" --format '{{.HostConfig.ReadonlyRootfs}}')" = "true" ] || reprova "a raiz do container do admin-web-web nao e somente leitura"
[ "$(docker inspect "$c" --format '{{.HostConfig.CapDrop}}')" = "[ALL]" ] || reprova "o admin-web nao derrubou todas as capacidades"
[ "$(docker inspect "$c" --format '{{.HostConfig.Memory}}')" != "0" ] || reprova "o limite de memoria do admin-web-web nao esta valendo"
[ -z "$(docker inspect "$c" --format '{{range $p, $b := .NetworkSettings.Ports}}{{if $b}}{{$p}} {{end}}{{end}}')" ] || reprova "o admin-web publica porta no hospedeiro; so a borda pode alcanca-lo"
# Nenhuma chave do `.env.example` no ambiente do admin. Lista tirada do arquivo,
# para variavel nova na API entrar na conferencia sem ninguem lembrar daqui.
chaves=$(sed -n 's/^\([A-Z_][A-Z0-9_]*\)=.*/\1/p' .env.example)
[ -n "$chaves" ] || reprova "nao consegui ler as chaves do .env.example; sem lista a conferencia de segredo fica cega"
ambiente=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1)
for k in $chaves; do
  if printf '%s\n' "$ambiente" | grep -qx "$k"; then reprova "o admin-web recebeu \`$k\` do ambiente da API"; fi
done
echo "  ambiente do admin-web: $(printf '%s\n' "$ambiente" | tr '\n' ' ')"
echo "  limite: $(docker inspect "$c" --format '{{.HostConfig.Memory}}') bytes"

echo "== 6. a sonda pela borda"
docker run --rm --network "${projeto}_default" -v "$raiz/infra/verificacao:/v:ro" "$NODE_IMAGEM" \
  node /v/verificar-backoffice-na-borda.mjs \
  --admin http://edge:80 --admin-host admin.localhost \
  --app http://edge:3000 --app-host localhost:3000 --eco || falhas=1

echo "  memoria do admin-web depois da sonda: $(docker stats --no-stream --format '{{.MemUsage}}' "$c")"
if [ "$falhas" -ne 0 ]; then echo "REPROVADO"; exit 1; fi
echo "APROVADO"
