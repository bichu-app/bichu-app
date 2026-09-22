#!/bin/bash
set -u
ROTULO="$1"; ALVO="$2"; DE="$3"; PARA="$4"
TESTE="${5:-dist/_tests/src/modules/lostfound/adapters/persistence/autorizacao-do-decisor-na-clausula-where.test.js}"
python3 - "$ALVO" "$DE" "$PARA" <<'PY'
import sys
p,de,para=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p,encoding='utf-8').read()
n=s.count(de)
assert n==1, f"ABORTADO: esperava 1 ocorrencia de {de!r}, achei {n}"
open(p,'w',encoding='utf-8').write(s.replace(de,para))
PY
[ $? -ne 0 ] && { echo "$ROTULO :: PATCH FALHOU"; exit 9; }
if [ -z "$(git diff --stat -- "$ALVO")" ]; then echo "$ROTULO :: ARQUIVO NAO MUDOU -- prova invalida"; git checkout -- "$ALVO"; exit 9; fi
rm -rf dist/_tests && npx tsc -p tsconfig.json --outDir dist/_tests >/dev/null 2>&1
node --test "$TESTE" > /tmp/prova.out 2>&1
echo "$ROTULO :: fail=$(grep -oE 'fail [0-9]+' /tmp/prova.out | tail -1 | awk '{print $2}') pass=$(grep -oE 'pass [0-9]+' /tmp/prova.out | tail -1 | awk '{print $2}')"
grep -E "^  ✖" /tmp/prova.out | head -4
git checkout -- "$ALVO"
