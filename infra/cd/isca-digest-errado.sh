#!/usr/bin/env bash
# A ISCA OBRIGATORIA DO CD: um deploy com o digest errado PRECISA reprovar, e
# nomeando a divergencia. Roda o caminho real de `implantar.sh` (pull por
# digest de um registro de verdade, leitura do commit gravado na imagem) contra
# um registro local descartavel, sem nuvem.
#
#   bash infra/cd/isca-digest-errado.sh
#
# Duas imagens minimas, uma "do commit A" e outra "do commit B". O plano pede o
# commit A e recebe o digest da imagem B. Tem de sair diferente de zero com
# "DIGEST ERRADO" e os dois commits na mensagem. O controle (digest de A para o
# commit A) tem de passar: portao que reprova tudo nao verifica nada.
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
REGISTRO_IMG="registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373"
BASE="caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17"
PORTA="${PORTA_ISCA:-5599}"
NOME="isca-registro-$$"
A=aaaaaaa1111111111111111111111111111111aa
B=bbbbbbb2222222222222222222222222222222bb
tmp="$(mktemp -d)"

limpar() { docker rm -f "$NOME" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap limpar EXIT

docker run -d --name "$NOME" -p "127.0.0.1:$PORTA:5000" "$REGISTRO_IMG" >/dev/null
inicio=$SECONDS
until curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/v2/"; do
  (( SECONDS - inicio < 30 )) || { echo "REPROVADO: o registro local da isca nao subiu"; exit 1; }
  sleep 1
done

digest_de() { # commit -> ref por digest de uma imagem que grava esse commit
  printf 'FROM %s\nRUN mkdir -p /etc/bichu && printf %%s %s > /etc/bichu/commit\n' "$BASE" "$1" > "$tmp/Dockerfile"
  docker build -q -t "127.0.0.1:$PORTA/isca:$1" "$tmp" >/dev/null
  docker push -q "127.0.0.1:$PORTA/isca:$1" >/dev/null
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "127.0.0.1:$PORTA/isca:$1" | grep "^127.0.0.1:$PORTA/isca@" | head -1
}
REF_A="$(digest_de "$A")"; REF_B="$(digest_de "$B")"
docker image rm -f "$REF_A" "$REF_B" "127.0.0.1:$PORTA/isca:$A" "127.0.0.1:$PORTA/isca:$B" >/dev/null 2>&1 || true

echo "== isca: o plano pede o commit A e recebe o digest de B"
if saida="$(ACAO=conferir-imagem COMMIT="$A" REF="$REF_B" bash "$aqui/implantar.sh" 2>&1)"; then
  echo "$saida"; echo "REPROVADO: o deploy com o digest errado PASSOU. O CD parou de enxergar"; exit 1
fi
echo "$saida" | sed -n '/REPROVADO/,$p'
[[ "$saida" == *"DIGEST ERRADO"*"$B"*"$A"* ]] || { echo "REPROVADO: reprovou, mas sem nomear os dois commits"; exit 1; }

echo "== controle: o plano pede A e recebe o digest de A"
ACAO=conferir-imagem COMMIT="$A" REF="$REF_A" bash "$aqui/implantar.sh"

echo; echo "ISCA APROVADA: digest errado reprova nomeando a divergencia, e o certo passa"
