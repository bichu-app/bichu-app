#!/usr/bin/env bash
# Constroi UMA imagem uma vez e a publica no Artifact Registry, ou reaproveita
# a que ja existe para a mesma ARVORE de codigo. Roda no runner do GitHub.
#
#   construir-imagem.sh <nome> <contexto> [alvo]
#   ex.: construir-imagem.sh bichu-app . prod
#        construir-imagem.sh bichu-migrador . migrador
#        construir-imagem.sh bichu-web web
#        construir-imagem.sh bichu-admin-web admin   # exige VITE_CAPTCHA_SITE_KEY
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
#
# POR QUE A ARVORE NAO BASTA COMO CHAVE. Ha contexto cujo conteudo depende de
# algo que NAO esta na arvore: o `admin/` assa a chave de SITE do reCAPTCHA no
# pacote, e ela vem do ambiente do build (`.env` do host), nao do git. Com a
# arvore sozinha como chave, uma imagem construida sem a chave ficava gravada
# sob a tag daquela arvore e TODA construcao futura da mesma arvore devolvia a
# quebrada, com o portao aprovando -- cache envenenado, nao azar; a mesma
# regressao voltou tres vezes ao backoffice por isto. Por isso:
#
#   1. o contexto DECLARA o que exige (`exigidas`); ausente ou vazia reprova,
#      porque "nao conseguir conferir nao e aprovacao";
#   2. a variavel passa por NOME (`--build-arg VAR`), lida do ambiente: o valor
#      nunca entra em argv, em log nem em historico. O nome da variavel de
#      ambiente tem de ser EXATAMENTE o do ARG -- `--build-arg VAR` com o valor
#      numa variavel de outro nome le um ambiente que nao existe, o build sai 0
#      e a imagem nasce sem a chave;
#   3. a IMPRESSAO DIGITAL da exigencia entra na tag da arvore (`-k<12 do
#      sha256>`): chave diferente, tag diferente. O hash na tag e seguro; o
#      valor, nao;
#   4. o portao final mede o ARTEFATO e nao a invocacao: depois de construir OU
#      de reaproveitar, o valor que passamos tem de estar DENTRO da imagem.
#      Este portao pede um ACHADO, nao uma ausencia -- por isso nao precisa de
#      controle positivo: zero e reprova, nunca "nada a medir".
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
repo="$REGISTRO/$nome"

# O que cada contexto exige do ambiente do build. Contexto fora desta tabela
# nao exige nada e segue como antes -- `.` (prod/migrador) e `web` nao tem
# captcha e nao podem passar a exigir variavel nova.
ctx="${contexto#./}"; ctx="${ctx%/}"
exigidas=()
case "$ctx" in
  admin) exigidas=(VITE_CAPTCHA_SITE_KEY) ;;
esac

sha256_hex() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }

build_args=(--build-arg "BUILD_COMMIT=$commit")
sufixo_chave=""
for var in ${exigidas[@]+"${exigidas[@]}"}; do
  eval "valor=\${$var:-}"
  if [[ -z "$valor" ]]; then
    echo "::error::o contexto '$ctx' exige a variavel de ambiente $var, e ela esta AUSENTE ou VAZIA neste build (vazio nao e valor). Ela mora no \`.env\` do host -- declarada em \`.env.example\` e no passo do \`admin/\` em \`infra/roteiro-provisionamento.md\`; exporte-a antes de chamar este script (\`set -a; . .env; set +a\`) ou injete-a no ambiente do job. Sem ela o build do painel sairia 0 e o login recusaria com 'captcha indisponivel': construir e o que reprova aqui, nao o login do operador." >&2
    exit 1
  fi
  build_args+=(--build-arg "$var")
  sufixo_chave+="-k$(printf '%s' "$valor" | sha256_hex | cut -c1-12)"
done
tag_arvore="arvore-$arvore${alvo:+-$alvo}$sufixo_chave"

saida() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi; printf '%s=%s\n' "$1" "$2"; }

# Portao do ARTEFATO. Roda dentro do conteiner, com o valor entregue por
# AMBIENTE (-e NOME, sem valor em argv) e nunca interpolado na linha. Nao supoe
# prefixo: a imagem guarda em /srv/admin/assets/ e o servidor expoe em
# /assets/, entao procura em toda a raiz (menos os pseudo-sistemas) em vez de
# acreditar num caminho.
conferir_artefato() {
  local imagem="$1" var achados rc
  for var in ${exigidas[@]+"${exigidas[@]}"}; do
    set +e
    achados="$(docker run --rm -e "VAR_ALVO=$var" -e "$var" --entrypoint sh "$imagem" -c '
      set -u
      eval "esperado=\"\$$VAR_ALVO\""
      [ -n "$esperado" ] || { echo "a variavel nao chegou ao conteiner" >&2; exit 3; }
      achou=""
      for raiz in /*; do
        case "$raiz" in /proc|/sys|/dev) continue ;; esac
        if [ -d "$raiz" ]; then
          r="$(grep -rlF "$esperado" "$raiz" 2>/dev/null | head -3)"
          if [ -n "$r" ]; then achou="$achou $r"; fi
        fi
      done
      [ -n "$achou" ] || exit 4
      printf "%s" "$achou"
    ' 2>&1)"
    rc=$?
    set -e
    if [[ $rc -eq 4 ]]; then
      echo "::error::o valor de $var NAO esta na imagem $imagem. A imagem nasceu (ou foi reaproveitada) sem a exigencia do contexto '$ctx': build-arg perdido, nome de variavel diferente do ARG, ou tag de arvore apontando para imagem construida sem a chave. Reprovando em vez de publicar/promover." >&2
      exit 1
    elif [[ $rc -ne 0 ]]; then
      echo "::error::nao consegui conferir $var dentro de $imagem (saida $rc). Nao conseguir conferir nao e aprovacao:" >&2
      printf '%s\n' "$achados" >&2
      exit 1
    fi
    echo "portao do artefato: $var confirmada dentro de $imagem em$achados"
  done
}

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
  conferir_artefato "$ref"
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
else
  docker build ${alvo:+--target "$alvo"} "${build_args[@]}" \
    -t "$repo:$tag_arvore" -t "$repo:commit-$commit${alvo:+-$alvo}$sufixo_chave" "$contexto"
  # Antes do push: uma imagem reprovada aqui NAO pode ficar gravada sob a tag
  # da arvore, que e exatamente o envenenamento que este portao existe para
  # impedir. O conteudo e o mesmo que o push publica.
  conferir_artefato "$repo:$tag_arvore"
  docker push -q "$repo:$tag_arvore" >/dev/null
  docker push -q "$repo:commit-$commit${alvo:+-$alvo}$sufixo_chave" >/dev/null
  ref="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$repo:$tag_arvore" | grep "^$repo@" | head -1)"
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
fi

[[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "::error::nao obtive o digest de $repo:$tag_arvore (veio '$ref')" >&2; exit 1; }
[[ "$gravado" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::$ref nao tem commit gravado em /etc/bichu/commit (veio '$gravado')" >&2; exit 1; }
saida ref "$ref"
saida commit "$gravado"
