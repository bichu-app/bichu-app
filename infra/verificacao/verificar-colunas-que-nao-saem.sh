#!/usr/bin/env sh
# BICHUS-188 - roda o portao de saida, iscas primeiro.
#
# O portao mora em `src/tools/portao-colunas-que-nao-saem.ts`, que nao e deste
# diretorio. Este arquivo existe para que a esteira e o `make` chamem a MESMA
# sequencia: duas copias da sequencia terminariam divergindo, e a que diverge
# para o lado frouxo e a que ninguem percebe. Mesma forma de
# `verificar-contrato-publico.sh`, de proposito.
#
# POR QUE AS ISCAS SAO INDISPENSAVEIS AQUI, mais do que nos outros portoes:
# hoje `professionals` e `entity_verifications` nasceram sem rota, entao o
# contrato tem ZERO ocorrencia das colunas marcadas e a varredura sobre o
# material real nao tem o que achar. "Nao achei nada" e "conferi e esta limpo"
# sairiam com a mesma cor. As iscas sao o que separa as duas frases.
#
# As tres familias, e cada uma ja passou despercebida em algum projeto:
#   1. a coluna aparece numa resposta declarada no contrato
#   2. a coluna aparece em codigo que monta resposta
#   3. alguem apaga a marca do COMMENT ON COLUMN, e o portao fica sem lista --
#      o modo de falhar mais perigoso, porque ele aprova tudo em silencio
#
# Uso: sh infra/verificacao/verificar-colunas-que-nao-saem.sh [raiz]
# Espera `dist/tools/portao-colunas-que-nao-saem.js` ja construido (`npm run build`).
set -eu

RAIZ="${1:-.}"
PORTAO="dist/tools/portao-colunas-que-nao-saem.js"
ISCAS="infra/verificacao/iscas/colunas-que-nao-saem"

if [ ! -f "$PORTAO" ]; then
  echo "REPROVA: $PORTAO nao existe. Rode \`npm run build\` antes." >&2
  exit 1
fi

achou_isca=0
for isca in "$ISCAS"/deve-reprovar-*; do
  [ -d "$isca" ] || continue
  achou_isca=1

  # `set -e` mataria o script no exit 1 da isca, que e o resultado DESEJADO.
  # O `if` protege, e a ausencia dele foi um defeito real de esteira neste
  # projeto.
  if saida=$(node "$PORTAO" "$isca" 2>&1); then
    echo "$saida"
    echo "REPROVA: a isca $isca PASSOU. O portao de saida parou de enxergar esta familia de defeito" >&2
    exit 1
  fi

  # Codigo de saida nao basta. O portao reprova por varios motivos (spec
  # ilegivel, src/ vazio, migrations/ ausente), e uma conferencia que so
  # perguntasse "reprovou?" ficaria verde com ele cego para o vazamento. Cada
  # isca declara no `.esperado` ao lado o que precisa aparecer na saida.
  esperado="$isca/.esperado"
  if [ ! -f "$esperado" ]; then
    echo "REPROVA: $isca nao tem arquivo .esperado. Isca sem expectativa escrita vale por confianca" >&2
    exit 1
  fi

  while IFS= read -r trecho; do
    case "$trecho" in ''|'#'*) continue ;; esac
    if ! printf '%s' "$saida" | grep -qF -- "$trecho"; then
      echo "$saida"
      echo "REPROVA: a isca $isca reprovou, mas a saida nao menciona '$trecho'. O portao pode estar reprovando por outro motivo, e nao por este defeito" >&2
      exit 1
    fi
  done < "$esperado"

  echo "isca reprovada como deveria, e pelos motivos certos: $isca"
done

if [ "$achou_isca" -eq 0 ]; then
  echo "REPROVA: nenhuma isca em $ISCAS/deve-reprovar-*. Portao sem prova negativa vale pela confianca do dia em que foi escrito" >&2
  exit 1
fi

echo
node "$PORTAO" "$RAIZ"
