#!/usr/bin/env bash
# AS ISCAS OBRIGATORIAS DO CD. Rodam o caminho REAL de `implantar.sh` (pull por
# digest de um registro de verdade, leitura dos carimbos dentro da imagem)
# contra um registro local descartavel, sem nuvem e sem tocar em VM nenhuma.
#
#   bash infra/cd/isca-digest-errado.sh
#
# O QUE ELAS COBREM, e por que cada uma existe:
#
#   1. ARVORE ERRADA reprova, nomeando as duas arvores. E o portao.
#   2. REAPROVEITAMENTO LEGITIMO PASSA: imagem carimbada com OUTRO COMMIT e a
#      MESMA ARVORE. Esta e a isca do defeito medido em 02/11/2026: o
#      `construir-imagem.sh` chaveia pela arvore e carimba o commit de quem
#      construiu, e o `implantar.sh` exigia igualdade de COMMIT -- entao toda
#      imagem reaproveitada reprovava na implantacao. Sem esta isca, consertar
#      o portao e afrouxa-lo sao indistinguiveis.
#   3. IMAGEM SEM CARIMBO DE ARVORE reprova (build local nunca se implanta).
#   4. PLANO SEM ARVORE reprova: ausencia nao e aprovacao.
#   5. PLATAFORMA ERRADA reprova, medida no BLOB DE CONFIGURACAO -- e o controle
#      positivo (amd64) passa. E a isca do segundo defeito de 02/11: sem
#      `--platform` o build publicava arm64 em silencio, e o portao do commit
#      aprovava porque le o conteiner sob emulacao.
#
# Portao que reprova tudo nao verifica nada: toda reprovacao aqui tem controle
# positivo do lado.
set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
REGISTRO_IMG="registry@sha256:a3d8aaa63ed8681a604f1dea0aa03f100d5895b6a58ace528858a7b332415373"
BASE="caddy:2.8-alpine@sha256:af32e97399febea808609119bb21544d0265c58a02836576e32a2d082c262c17"
PORTA="${PORTA_ISCA:-5599}"
NOME="isca-registro-$$"
# Dois commits diferentes, duas arvores diferentes.
COMMIT_A=aaaaaaa1111111111111111111111111111111aa
COMMIT_B=bbbbbbb2222222222222222222222222222222bb
ARV_A=1111111111111111111111111111111111111111
ARV_B=2222222222222222222222222222222222222222
tmp="${TMPDIR:-/tmp}/isca-cd-$$"; mkdir -p "$tmp"

# AS DUAS PLATAFORMAS, E POR QUE A ISCA PRECISA DAS DUAS ASSIM.
# `docker build --platform X` produz um INDICE com so a plataforma X, e
# `docker pull` sem `--platform` escolhe a do HOST -- entao uma imagem da OUTRA
# arquitetura nem chega a ser puxada nesta maquina, e o portao do blob de
# configuracao nunca seria exercido. A isca por isso constroi SEMPRE para a
# plataforma do host (para o pull funcionar) e varia o que o PLANO pede.
#
# E isso nao e um atalho: e exatamente o defeito B. Na maquina de quem
# desenvolve (arm64) o build publicava arm64 enquanto o plano e o host querem
# amd64. A isca reproduz essa divergencia, sem precisar de um host amd64.
arq_host="$(docker version --format '{{.Server.Arch}}')"
PLAT_LOCAL="linux/$arq_host"
if [[ "$arq_host" == amd64 ]]; then PLAT_FALSA=linux/arm64; else PLAT_FALSA=linux/amd64; fi
echo "host: $PLAT_LOCAL   |   o plano 'errado' da isca pedira: $PLAT_FALSA"

falhou=0
reprova() { printf '  REPROVADO: %s\n' "$*"; falhou=1; }
aprova()  { printf '  [ok] %s\n' "$*"; }

limpar() { docker rm -f "$NOME" >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap limpar EXIT

docker run -d --name "$NOME" -p "127.0.0.1:$PORTA:5000" "$REGISTRO_IMG" >/dev/null
inicio=$SECONDS
until curl -fsS -o /dev/null "http://127.0.0.1:$PORTA/v2/"; do
  (( SECONDS - inicio < 30 )) || { echo "REPROVADO: o registro local da isca nao subiu"; exit 1; }
  sleep 1
done

# publica <rotulo> <commit> <arvore|-> <plataforma> -> imprime a ref por digest
publica() {
  local rotulo="$1" commit="$2" arvore="$3" plataforma="$4"
  local d="$tmp/$rotulo"
  mkdir -p "$d"
  {
    printf 'FROM %s\n' "$BASE"
    printf 'RUN mkdir -p /etc/bichu && printf %%s %s > /etc/bichu/commit\n' "$commit"
    # `-` = imagem SEM carimbo de arvore, que e como nasce todo build local
    [[ "$arvore" == - ]] || printf 'RUN printf %%s %s > /etc/bichu/arvore\n' "$arvore"
  } > "$d/Dockerfile"
  docker build -q --platform "$plataforma" -t "127.0.0.1:$PORTA/isca:$rotulo" "$d" >/dev/null
  docker push -q "127.0.0.1:$PORTA/isca:$rotulo" >/dev/null
  # MATERIALIZADO: `inspect | grep | head -1` punha o grep diante de um
  # consumidor que sai cedo, e sob `pipefail` o EPIPE virava falha do pipeline.
  local digests
  digests="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "127.0.0.1:$PORTA/isca:$rotulo")"
  grep "^127.0.0.1:$PORTA/isca@" <<<"$digests" | sed -n '1p'
}

# conferir <ref> <arvore-do-plano> [plataforma] -> saida do implantar.sh, e o rc
conferir() {
  local ref="$1" arvore="$2" plat="${3:-$PLAT_LOCAL}"
  set +e
  saida="$(ACAO=conferir-imagem REF="$ref" ARVORE="$arvore" PLATAFORMA="$plat" \
    bash "$aqui/implantar.sh" 2>&1)"
  rc=$?
  set -e
}

echo "== publicando as imagens da isca no registro local"
REF_A="$(publica a "$COMMIT_A" "$ARV_A" "$PLAT_LOCAL")"   # arvore A, commit A
REF_B="$(publica b "$COMMIT_B" "$ARV_B" "$PLAT_LOCAL")"   # arvore B, commit B
REF_R="$(publica r "$COMMIT_B" "$ARV_A" "$PLAT_LOCAL")"   # arvore A, commit B  <- reaproveitada
REF_S="$(publica s "$COMMIT_A" -        "$PLAT_LOCAL")"   # SEM carimbo de arvore
REF_M="$REF_A"                                            # a mesma imagem, com o plano pedindo a OUTRA plataforma
# Tira as imagens do cache local: o pull do implantar.sh tem de ir ao registro.
docker image rm -f "$REF_A" "$REF_B" "$REF_R" "$REF_S" \
  "127.0.0.1:$PORTA/isca:a" "127.0.0.1:$PORTA/isca:b" "127.0.0.1:$PORTA/isca:r" \
  "127.0.0.1:$PORTA/isca:s" >/dev/null 2>&1 || true

echo
echo "== 1. ARVORE ERRADA: o plano pede a arvore A e recebe a imagem da arvore B"
conferir "$REF_B" "$ARV_A"
if (( rc == 0 )); then reprova "passou. O CD parou de enxergar"
elif [[ "$saida" != *"ARVORE ERRADA"* ]]; then reprova "reprovou, mas nao por arvore: $saida"
elif [[ "$saida" != *"$ARV_B"* || "$saida" != *"$ARV_A"* ]]; then reprova "reprovou sem nomear as duas arvores"
else aprova "reprovou nomeando as duas arvores"; fi

echo
echo "== 2. CONTROLE / defeito A: imagem REAPROVEITADA (commit B, arvore A) com plano da arvore A"
conferir "$REF_R" "$ARV_A"
if (( rc != 0 )); then reprova "o reaproveitamento legitimo REPROVOU -- e o defeito de 02/11 de volta: $saida"
else aprova "passou (e o commit gravado, $COMMIT_B, nao bloqueia mais)"; fi

echo
echo "== 3. IMAGEM SEM CARIMBO DE ARVORE (como nasce todo build local)"
conferir "$REF_S" "$ARV_A"
if (( rc == 0 )); then reprova "imagem sem carimbo de arvore PASSOU"
elif [[ "$saida" != *"arvore carimbada"* ]]; then reprova "reprovou por outro motivo: $saida"
else aprova "reprovou dizendo que a imagem nao carimba arvore"; fi

echo
echo "== 4. PLANO SEM ARVORE (ausencia nao e aprovacao)"
conferir "$REF_A" ""
if (( rc == 0 )); then reprova "plano sem arvore PASSOU"
elif [[ "$saida" != *"o plano nao traz a arvore"* ]]; then reprova "reprovou por outro motivo: $saida"
else aprova "reprovou dizendo que o plano nao traz arvore"; fi

echo
echo "== 5. PLATAFORMA ERRADA: imagem $PLAT_LOCAL com o plano/host pedindo $PLAT_FALSA"
conferir "$REF_M" "$ARV_A" "$PLAT_FALSA"
if (( rc == 0 )); then reprova "imagem de outra arquitetura PASSOU. O portao da plataforma esta cego"
elif [[ "$saida" != *"PLATAFORMA ERRADA"* ]]; then reprova "reprovou por outro motivo: $saida"
elif [[ "$saida" != *"$arq_host"* ]]; then reprova "reprovou sem dizer a arquitetura que achou"
elif [[ "$saida" != *"BLOB DE CONFIGURACAO"* ]]; then reprova "reprovou sem dizer que mediu no blob de configuracao"
else aprova "reprovou nomeando $arq_host, medido no BLOB DE CONFIGURACAO"; fi

echo
echo "== 6. CONTROLE: a MESMA imagem, com o plano pedindo $PLAT_LOCAL, passa"
conferir "$REF_M" "$ARV_A" "$PLAT_LOCAL"
if (( rc != 0 )); then reprova "o controle positivo da plataforma reprovou: $saida"
else aprova "passou -- o portao mede a plataforma, e nao reprova por reflexo"; fi

echo
(( falhou == 0 )) || { echo "ISCAS REPROVADAS: o CD nao esta medindo o que deveria"; exit 1; }
echo "ISCAS APROVADAS: arvore errada, imagem sem carimbo, plano sem arvore e plataforma"
echo "errada reprovam nomeando o motivo; reaproveitamento legitimo e a plataforma certa passam."
