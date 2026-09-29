#!/bin/bash
# Arnes das iscas de `.jarvis/entregas/`.
#
# A isca e a colisao de hoje: dois agentes escrevendo no mesmo instante. O
# resultado tem de preservar as DUAS entradas, ou reprovar dizendo que colidiu.
#
# Cada caso grava o `echo $?` DO COMANDO CERTO num arquivo e o placar e lido
# dali, por nome de caso. Nada de `| tail`, que devolve a saida do tail; nada de
# `timeout`, que nao existe nesta maquina (sai 127).
set -u

NODE=/opt/homebrew/opt/node@22/bin/node
FERRAMENTA="${1:?uso: iscas-entregas.sh <caminho de entregas.mjs>}"
BASE="$(mktemp -d)"
PLACAR="$BASE/placar.txt"
: > "$PLACAR"

registra() { printf '%s\t%s\n' "$2" "$1" >> "$PLACAR"; }

# Espera `esperado` do codigo de saida real do comando, e nomeia o caso.
caso() {
  local nome="$1" esperado="$2"; shift 2
  "$@" > "$BASE/$nome.saida" 2>&1
  local codigo=$?
  echo "$codigo" > "$BASE/$nome.codigo"
  if [ "$codigo" = "$esperado" ]; then registra "$nome" PASSOU; else registra "$nome" FALHOU; fi
}

# ---------------------------------------------------------------------------
# CASO 1 — o defeito original, reproduzido. NAO e a solucao: e a doenca.
# Dois "agentes" fazem le-altera-escreve no MESMO arquivo, como toda ferramenta
# de edicao faz. Um dos dois grava por cima do outro e o arquivo fica plausivel.
# ---------------------------------------------------------------------------
c1() {
  local alvo="$BASE/unico/entregas.md"
  mkdir -p "$BASE/unico"; printf 'linha inicial\n' > "$alvo"
  # Os dois leem antes de qualquer um escrever: e a janela real entre a leitura
  # da ferramenta e a escrita dela.
  local a b
  a="$(cat "$alvo")"; b="$(cat "$alvo")"
  printf '%s\nentrada de HEFESTO\n' "$a" > "$alvo"
  printf '%s\nentrada de HELIOS\n'  "$b" > "$alvo"
  local n; n="$(grep -c '^entrada de' "$alvo")"
  # O caso passa quando o defeito ACONTECE: ele existe para provar que a dor e
  # real, e falha no dia em que "acrescentar ao fim" virar seguro sozinho.
  [ "$n" = "1" ]
}

# ---------------------------------------------------------------------------
# CASO 2 — a colisao de hoje contra o diretorio. Duas escritas no mesmo
# instante, as DUAS entradas tem de sobreviver.
# ---------------------------------------------------------------------------
c2() {
  # Diretorio novo a cada invocacao: o mesmo caso roda tres vezes (ligado,
  # com a isca, religado) e reaproveitar o diretorio faria a terceira contar
  # os arquivos da primeira.
  local dir; dir="$(mktemp -d "$BASE/dir2.XXXXXX")"
  JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" registrar --agente HEFESTO --estado QA --chave BICHUS-901 --texto "entrega de HEFESTO" > /dev/null &
  local p1=$!
  JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" registrar --agente HELIOS  --estado QA --chave BICHUS-902 --texto "entrega de HELIOS"  > /dev/null &
  local p2=$!
  wait $p1; local r1=$?
  wait $p2; local r2=$?
  [ "$r1" = 0 ] && [ "$r2" = 0 ] || return 1
  local n; n="$(ls "$dir"/*.md 2>/dev/null | wc -l | tr -d ' ')"
  echo "arquivos criados: $n (esperados 2)"
  [ "$n" = "2" ] || return 1
  JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" ler | grep -q "entrega de HEFESTO" || return 1
  JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" ler | grep -q "entrega de HELIOS"  || return 1
  return 0
}

# ---------------------------------------------------------------------------
# CASO 3 — 24 agentes de uma vez, um por papel. Nenhuma entrada some.
# ---------------------------------------------------------------------------
c3() {
  local dir i; dir="$(mktemp -d "$BASE/dir3.XXXXXX")"
  for i in $(seq 1 24); do
    JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" registrar --agente "AGENTE$i" --estado QA --texto "marca-$i" > /dev/null &
  done
  wait
  local n; n="$(ls "$dir"/*.md 2>/dev/null | wc -l | tr -d ' ')"
  [ "$n" = "24" ] || { echo "arquivos: $n, esperados 24"; return 1; }
  for i in $(seq 1 24); do
    JARVIS_ENTREGAS="$dir" "$NODE" "$FERRAMENTA" ler | grep -q "marca-$i\$" || { echo "marca-$i sumiu"; return 1; }
  done
  return 0
}

# ---------------------------------------------------------------------------
# CASOS 4 e 5 — o portao nao aprova por ausencia.
# ---------------------------------------------------------------------------
c4() { JARVIS_ENTREGAS="$BASE/nao-existe" "$NODE" "$FERRAMENTA" verificar; }
c5() { mkdir -p "$BASE/vazio"; JARVIS_ENTREGAS="$BASE/vazio" "$NODE" "$FERRAMENTA" verificar; }

# ---------------------------------------------------------------------------
# CASO 6 — estado fora das quatro colunas do quadro reprova no registro.
# ---------------------------------------------------------------------------
c6() { JARVIS_ENTREGAS="$BASE/dir6" "$NODE" "$FERRAMENTA" registrar --agente X --estado "Concluído" --texto t; }

# ---------------------------------------------------------------------------
# CASO 7 — invocada por um caminho com link simbolico, ela AINDA trabalha.
#
# Neste macOS `/tmp` e link para `/private/tmp`. A forma ingenua de detectar
# invocacao direta (`import.meta.url === "file://" + process.argv[1]`) e falsa
# nesse caso, e a ferramenta terminava com saida 0 SEM registrar nada -- quem
# chamou acreditava ter registrado. Foi este arnes que pegou.
# ---------------------------------------------------------------------------
c7() {
  local copia="/tmp/entregas-por-symlink-$$.mjs" dir="$BASE/dir7"
  cp "$FERRAMENTA" "$copia"
  JARVIS_ENTREGAS="$dir" "$NODE" "$copia" registrar --agente HERMES --estado QA --texto "veio por /tmp" > /dev/null
  local r=$?
  rm -f "$copia"
  [ "$r" = 0 ] || { echo "saiu $r"; return 1; }
  local n; n="$(ls "$dir"/*.md 2>/dev/null | wc -l | tr -d ' ')"
  echo "arquivos criados: $n (esperado 1)"
  [ "$n" = "1" ]
}

echo "=== casos com o mecanismo LIGADO ==="
caso "defeito-do-arquivo-unico-reproduzido"        0 c1
caso "duas-escritas-simultaneas-preservam-as-duas" 0 c2
caso "vinte-e-quatro-simultaneas-nenhuma-some"     0 c3
caso "verificar-reprova-diretorio-ausente"         1 c4
caso "verificar-reprova-diretorio-vazio"           1 c5
caso "registrar-recusa-estado-fora-do-quadro"      1 c6
caso "invocada-por-caminho-com-symlink-trabalha"   0 c7

# ---------------------------------------------------------------------------
# A ISCA: desligar o mecanismo e exigir que o caso REPROVE pelo nome.
#
# `wx` vira `w` (sem O_EXCL) e o nome deixa de ser sorteado: e exatamente o
# codigo que alguem escreveria sem saber por que o `wx` esta ali. Com ele
# desligado, duas escritas simultaneas voltam a produzir UM arquivo -- que e o
# defeito do caso 1, de volta.
#
# O nome e fixado em `colisao.md` de proposito: fixar so o sufixo aleatorio
# deixaria o codinome no nome e os dois agentes continuariam em arquivos
# diferentes por acidente, e a isca passaria sem provar nada.
# ---------------------------------------------------------------------------
echo
echo "=== isca: mecanismo DESLIGADO (o caso tem de reprovar) ==="
ISCA="$BASE/entregas-sem-exclusivo.mjs"
sed -e 's/openSync(caminho, "wx")/openSync(caminho, "w")/' \
    -e 's|const nome = `.*\.md`;|const nome = "colisao.md";|' "$FERRAMENTA" > "$ISCA"
if grep -q 'openSync(caminho, "w")' "$ISCA" && grep -q 'const nome = "colisao.md";' "$ISCA"; then
  registra "isca-foi-de-fato-aplicada" PASSOU
else
  registra "isca-foi-de-fato-aplicada" FALHOU
fi

FERRAMENTA_ORIGINAL="$FERRAMENTA"
FERRAMENTA="$ISCA"
caso "ISCA-duas-escritas-simultaneas-preservam-as-duas" 1 c2
FERRAMENTA="$FERRAMENTA_ORIGINAL"

# A isca tem de reprovar pelo motivo CERTO: um arquivo so, o segundo por cima
# do primeiro. Reprovar por erro de execucao seria uma isca que nao prova nada.
if grep -q "arquivos criados: 1 (esperados 2)" "$BASE/ISCA-duas-escritas-simultaneas-preservam-as-duas.saida"; then
  registra "ISCA-reprovou-por-sobrescrita-e-nao-por-erro" PASSOU
else
  registra "ISCA-reprovou-por-sobrescrita-e-nao-por-erro" FALHOU
fi

# Religa: reexecuta o mesmo caso com a ferramenta de verdade.
echo
echo "=== mecanismo RELIGADO ==="
caso "religado-duas-escritas-simultaneas-preservam-as-duas" 0 c2

echo
echo "=== PLACAR (por nome de caso, lido do arquivo) ==="
cat "$PLACAR"
TOTAL=$(wc -l < "$PLACAR" | tr -d ' ')
FALHAS=$(grep -c '^FALHOU' "$PLACAR")
echo
echo "casos: $TOTAL | falharam: $FALHAS"
echo "artefatos em: $BASE"
[ "$FALHAS" = "0" ]
