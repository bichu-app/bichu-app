#!/usr/bin/env bash
# Constroi UMA imagem uma vez e a publica no Artifact Registry, ou reaproveita
# a que ja existe para a mesma ARVORE de codigo. Roda no runner do GitHub.
#
#   construir-imagem.sh <nome> <contexto> [alvo]
#   ex.: construir-imagem.sh bichu-app . prod
#        construir-imagem.sh bichu-migrador . migrador
#        construir-imagem.sh bichu-web web
#
# Saida (em $GITHUB_OUTPUT, ou na tela): ref=<registro>/<nome>@sha256:... e
# commit=<commit gravado na imagem>.
#
# POR QUE A CHAVE E A ARVORE E NAO O COMMIT. `development` e `main` chegam ao
# mesmo codigo por commits diferentes (o merge cria um commit novo com a mesma
# arvore). Chaveando pela arvore, a `main` encontra a imagem que a
# `development` ja construiu e testou em homologacao, e PROMOVE aquele digest
# para producao em vez de reconstruir -- que e a regra: a mesma imagem nos
# ambientes, promovida por digest, nunca reconstruida por ambiente. O commit
# gravado na imagem continua sendo o de quem a construiu, e e ele que a sonda
# confere.
set -euo pipefail

nome="${1:?nome da imagem}"; contexto="${2:?contexto}"; alvo="${3:-}"
: "${REGISTRO:?defina REGISTRO, ex.: southamerica-east1-docker.pkg.dev/<projeto>/bichu}"

[[ -d "$contexto" && -f "$contexto/Dockerfile" ]] || {
  echo "::error::o contexto '$contexto' nao tem Dockerfile nesta arvore. A imagem $nome nao existe aqui, e o deploy dela reprova em vez de pular." >&2
  exit 1
}

# Contexto na raiz: a arvore inteira. Contexto num subdiretorio (web/, admin/,
# infra/caddy): so a arvore dele, porque a imagem nao enxerga o resto.
if [[ "$contexto" == . ]]; then arvore="$(git rev-parse 'HEAD^{tree}')"; else arvore="$(git rev-parse "HEAD:${contexto#./}")"; fi
commit="$(git rev-parse HEAD)"
tag_arvore="arvore-$arvore${alvo:+-$alvo}"
repo="$REGISTRO/$nome"

saida() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi; printf '%s=%s\n' "$1" "$2"; }

# "Nao existe" e resposta; "nao consegui perguntar" NAO e. So o NOT_FOUND vira
# construcao nova; qualquer outro erro do registro reprova.
if digest="$(gcloud artifacts docker images describe "$repo:$tag_arvore" --format='value(image_summary.digest)' 2>"${TMPDIR:-/tmp}/describe.err")"; then
  :
elif grep -q -e NOT_FOUND -e 'not found' "${TMPDIR:-/tmp}/describe.err"; then
  digest=""
else
  echo "::error::nao consegui consultar $repo:$tag_arvore no registro:" >&2; cat "${TMPDIR:-/tmp}/describe.err" >&2; exit 1
fi
if [[ -n "$digest" ]]; then
  ref="$repo@$digest"
  echo "reaproveitada: $repo:$tag_arvore ja existe ($digest), nada a construir"
  docker pull -q "$ref" >/dev/null
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
else
  docker build ${alvo:+--target "$alvo"} --build-arg "BUILD_COMMIT=$commit" \
    -t "$repo:$tag_arvore" -t "$repo:commit-$commit${alvo:+-$alvo}" "$contexto"
  docker push -q "$repo:$tag_arvore" >/dev/null
  docker push -q "$repo:commit-$commit${alvo:+-$alvo}" >/dev/null
  ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$repo:$tag_arvore" | grep "^$repo@" | head -1)"
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
fi

[[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "::error::nao obtive o digest de $repo:$tag_arvore (veio '$ref')" >&2; exit 1; }
[[ "$gravado" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::$ref nao tem commit gravado em /etc/bichu/commit (veio '$gravado')" >&2; exit 1; }
saida ref "$ref"
saida commit "$gravado"
