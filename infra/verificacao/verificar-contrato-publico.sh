#!/usr/bin/env sh
# BICHUS-55 - roda o portao de contrato publico, iscas primeiro.
#
# O portao mora em `src/tools/portao-contrato-publico.ts`, que nao e deste
# diretorio. Este arquivo existe para que a esteira e o `make` chamem a MESMA
# sequencia: duas copias da sequencia terminariam divergindo, e a que diverge
# para o lado frouxo e a que ninguem percebe.
#
# Ordem, e ela importa: iscas antes do contrato. Um portao que aprova um
# documento vazando `lat`, `phone` ou UUID interno em rota publica nao tem o que
# dizer sobre o contrato de verdade, e o verde dele seria pior que nao ter
# portao nenhum.
#
# Uso: sh infra/verificacao/verificar-contrato-publico.sh [caminho-da-spec]
# Espera `dist/tools/portao-contrato-publico.js` ja construido (`npm run build`).
set -eu

SPEC="${1:-api/openapi.yaml}"
PORTAO="dist/tools/portao-contrato-publico.js"
ISCAS="infra/verificacao/iscas"

if [ ! -f "$PORTAO" ]; then
  echo "REPROVA: $PORTAO nao existe. Rode \`npm run build\` antes." >&2
  exit 1
fi

achou_isca=0
for isca in "$ISCAS"/deve-reprovar-*.yaml; do
  [ -f "$isca" ] || continue
  achou_isca=1

  if saida=$(node "$PORTAO" "$isca" 2>&1); then
    echo "$saida"
    echo "REPROVA: a isca $isca PASSOU. O portao de contrato publico parou de enxergar esta familia de defeito" >&2
    exit 1
  fi

  # Codigo de saida nao basta, e o motivo e concreto: enquanto a assercao de
  # cabecalhos do criterio 5 estiver sem alvo (o ADR-0017 tirou as paginas HTML
  # deste servico), o portao reprova QUALQUER documento. Uma conferencia que so
  # perguntasse "reprovou?" ficaria verde com o portao cego para vazamento de
  # campo, que e a unica coisa que ele existe para ver. Por isso cada isca
  # declara, no `.esperado` ao lado, o que precisa aparecer na saida.
  esperado="${isca%.yaml}.esperado"
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
  echo "REPROVA: nenhuma isca em $ISCAS/deve-reprovar-*.yaml. Portao sem prova negativa vale pela confianca do dia em que foi escrito" >&2
  exit 1
fi

echo
node "$PORTAO" "$SPEC"
