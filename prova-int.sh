#!/bin/bash
set -u
ROTULO="$1"; ALVO="$2"; DE="$3"; PARA="$4"
python3 - "$ALVO" "$DE" "$PARA" <<'PY'
import sys
p,de,para=sys.argv[1],sys.argv[2],sys.argv[3]
s=open(p,encoding='utf-8').read()
n=s.count(de)
assert n==1, f"ABORTADO: esperava 1 ocorrencia, achei {n}"
open(p,'w',encoding='utf-8').write(s.replace(de,para))
PY
[ $? -ne 0 ] && { echo "$ROTULO :: PATCH FALHOU"; exit 9; }
if [ -z "$(git diff --stat -- "$ALVO")" ]; then echo "$ROTULO :: ARQUIVO NAO MUDOU"; git checkout -- "$ALVO"; exit 9; fi
npm run test:integration > /tmp/provaint.out 2>&1
echo "$ROTULO :: $(grep -E '^placar' /tmp/provaint.out)"
grep -E "^  ✖|^    ✖" /tmp/provaint.out | sort -u | head -5
git checkout -- "$ALVO"
