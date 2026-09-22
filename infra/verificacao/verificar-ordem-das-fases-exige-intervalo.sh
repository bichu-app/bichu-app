#!/usr/bin/env bash
# A prova negativa de que `verificar_ordem_das_fases.py` RECUSA rodar sem saber
# o que conferir.
#
# Por que este arquivo existe: aquela ferramenta tinha o default
# `origin/main..HEAD`. Nada a invocava, entao o defeito estava dormindo. No dia
# em que alguem a ligasse na esteira sem passar intervalo, ela conferiria a
# branch errada -- a integracao daqui e em `development` -- e imprimiria
# APROVADO sobre um intervalo que ninguem pediu. Medido em 22/09/2026:
# `origin/main..HEAD` = 156 commits, `development..HEAD` = 0.
#
# "Testei e recusou" nao e evidencia: nao se reexecuta e nao acusa no dia em que
# a recusa parar de funcionar. Por isso cada caso mora numa isca, com o que a
# saida precisa dizer escrito ao lado.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PORTAO="$RAIZ/infra/verificacao/verificar_ordem_das_fases.py"
ISCAS="$RAIZ/infra/verificacao/iscas/ordem-das-fases"

[ -f "$PORTAO" ] || { echo "REPROVA: nao achei $PORTAO" >&2; exit 1; }
[ -d "$ISCAS" ] || { echo "REPROVA: nao achei $ISCAS" >&2; exit 1; }

caso() {
  local nome="$1"; shift
  local esperado="$ISCAS/$nome.esperado"

  if [ ! -f "$esperado" ]; then
    echo "REPROVA: $nome nao tem .esperado. Isca sem expectativa escrita vale por confianca" >&2
    exit 1
  fi

  set +e
  saida="$(python3 "$PORTAO" "$@" 2>&1)"
  codigo=$?
  set -e

  if [ "$codigo" -eq 0 ]; then
    echo "$saida"
    echo "REPROVA: '$nome' APROVOU (saida 0). Era exatamente este o defeito: a ferramenta respondendo sobre um intervalo que ninguem pediu" >&2
    exit 1
  fi

  # Codigo de saida nao basta: ela morre por varios motivos (autoteste falhou,
  # intervalo vazio, git ausente), e perguntar so "reprovou?" ficaria verde com
  # ela cega para ESTE defeito. Cada isca declara o que a saida precisa dizer.
  while IFS= read -r trecho; do
    case "$trecho" in ''|'#'*) continue ;; esac
    if ! printf '%s' "$saida" | grep -qF -- "$trecho"; then
      echo "$saida"
      echo "REPROVA: '$nome' recusou, mas a saida nao menciona '$trecho'. Pode estar recusando por outro motivo, e nao por este defeito" >&2
      exit 1
    fi
  done < "$esperado"

  echo "recusou como deveria, e pelo motivo certo: $nome (saida $codigo)"
}

caso deve-reprovar-sem-intervalo
caso deve-reprovar-ref-sozinho HEAD
caso deve-reprovar-dois-argumentos development HEAD

echo
echo "[ok] a ferramenta recusa rodar sem saber o que conferir, nos 3 casos."
