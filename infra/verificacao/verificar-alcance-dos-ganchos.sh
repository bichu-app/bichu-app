#!/usr/bin/env bash
# Prova ate onde os ganchos de git alcancam, com `core.hooksPath` relativo e
# absoluto.
#
# Por que este arquivo existe: o time acreditava estar protegido contra push
# direto na principal em todos os worktrees, e nao estava. `core.hooksPath`
# relativo e resolvido a partir da raiz de CADA worktree, entao o gancho so
# valia onde a branch ja continha o arquivo. Worktree em branch antiga ficava
# sem protecao nenhuma, sem nenhum sinal. A promessa num lugar e a verificacao
# olhando outro e a familia de defeito mais cara que existe, e desta vez estava
# no mecanismo que protege os outros.
#
# Os casos, e o que cada um guarda:
#   CASO 1  relativo  + worktree em branch sem o arquivo -> NAO protegido
#           (o defeito que motivou a mudanca; se um dia passar, a mudanca virou
#            desnecessaria e alguem precisa saber)
#   CASO 2  absoluto  + o mesmo worktree                 -> protegido   (o ganho)
#   CASO 3  absoluto  + `pre-push` do checkout principal -> recusa a principal
#   CASO 4  absoluto  + `pre-push` do worktree antigo    -> recusa a principal
#   CASO 5  absoluto  + `pre-push` em branch comum       -> PASSA
#   CASO 6  `make setup` real                            -> grava caminho absoluto
#   CASO 7  `make setup` sem `.githooks` na principal    -> REPROVA alto
#
# CASO 3 e CASO 5 sao os que nao podem regredir: `pre-push` ja existia, e
# consertar um gancho quebrando outro seria troca ruim.
set -uo pipefail

raiz=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
falhas=0
ok ()   { printf '  ok      %s\n' "$1"; }
falha() { printf '  REPROVA %s\n' "$1" >&2; falhas=$((falhas + 1)); }

for f in .githooks/pre-push .githooks/reference-transaction Makefile; do
	if [ ! -e "$raiz/$f" ]; then
		echo "REPROVA: nao achei '$raiz/$f'. Sem ele este script nao tem o que" >&2
		echo "  conferir, e ficar verde assim seria pior que nao existir." >&2
		exit 1
	fi
done

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Monta: `main` COM os ganchos, `antiga` SEM, um worktree em `antiga`, e um
# remoto de mentira para exercitar o `pre-push`. Imprime a raiz do repo.
forjar () {
	local r="$tmp/$1"
	git init -q -b main "$r"
	git -C "$r" config user.name isca
	git -C "$r" config user.email isca@exemplo.invalido
	echo base > "$r/f.txt"
	git -C "$r" add -A && git -C "$r" commit -qm base
	# `antiga` sai daqui, ANTES de os ganchos existirem
	git -C "$r" branch antiga
	mkdir -p "$r/.githooks"
	cp "$raiz/.githooks/pre-push" "$r/.githooks/"
	cp "$raiz/.githooks/reference-transaction" "$r/.githooks/"
	chmod +x "$r"/.githooks/*
	git -C "$r" add -A && git -C "$r" commit -qm "ganchos"
	git -C "$r" worktree add -q "$r-wt-antiga" antiga
	git init -q --bare "$r-origem"
	git -C "$r" remote add origem "$r-origem"
	# Remoto proprio para o CASO 4. Se ele dividisse o remoto com o CASO 3,
	# um CASO 3 que passasse deixaria a principal ja criada la, e o CASO 4
	# passaria a falhar por fast-forward em vez de pelo gancho: acusaria
	# defeito certo pelo motivo errado, que e como uma suite comeca a mentir.
	git init -q --bare "$r-origem4"
	git -C "$r" remote add origem4 "$r-origem4"
	git -C "$r-wt-antiga" remote add origem4 "$r-origem4" 2>/dev/null || true
	echo "$r"
}

relativo () { git -C "$1" config core.hooksPath .githooks; }
absoluto () { git -C "$1" config core.hooksPath "$1/.githooks"; }
sujar ()    { echo "$RANDOM-$(date +%s%N)" > "$1/f.txt"; }
pilha ()    { git -C "$1" stash list | wc -l | tr -d ' '; }

echo "alcance dos ganchos: conferindo relativo contra absoluto"
echo "  git $(git --version | awk '{print $3}')"

r=$(forjar caso); wta="$r-wt-antiga"

# ------------------------------------------------------------------ CASO 1
relativo "$r"
sujar "$wta"
if git -C "$wta" stash push -q -m teste 2>/dev/null; then
	ok "CASO 1: relativo, worktree em branch sem o arquivo NAO e protegido"
	git -C "$wta" stash clear
else
	falha "CASO 1: com caminho relativo o worktree antigo JA estava protegido.
          Se isso e verdade, a troca para absoluto perdeu o motivo e este
          arquivo inteiro precisa ser revisto."
fi

# ------------------------------------------------------------------ CASO 2
absoluto "$r"
sujar "$wta"
if git -C "$wta" stash push -q -m teste 2>"$tmp/e2"; then
	falha "CASO 2: com caminho absoluto o worktree antigo continuou sem
          protecao. E este o ganho que justificou a mudanca."
	git -C "$wta" stash clear
elif [ "$(pilha "$r")" != "0" ]; then
	falha "CASO 2: recusou mas deixou $(pilha "$r") entradas na pilha."
else
	ok "CASO 2: absoluto, o mesmo worktree passa a ser protegido"
fi

# ------------------------------------------------------------------ CASO 3
# `pre-push` ja existia. Consertar um gancho quebrando outro seria troca ruim.
if git -C "$r" push -q origem main 2>"$tmp/e3"; then
	falha "CASO 3: push direto na principal PASSOU a partir do checkout
          principal. O \`pre-push\` regrediu."
elif ! grep -q "push direto" "$tmp/e3"; then
	falha "CASO 3: recusou, mas nao foi o \`pre-push\` que falou.
          Mensagem: $(cat "$tmp/e3")"
else
	ok "CASO 3: absoluto, \`pre-push\` segue recusando a principal"
fi

# ------------------------------------------------------------------ CASO 4
if git -C "$wta" push -q origem4 HEAD:refs/heads/main 2>"$tmp/e4"; then
	falha "CASO 4: worktree em branch antiga conseguiu push na principal.
          E exatamente o furo que a mudanca existe para fechar."
elif ! grep -q "push direto" "$tmp/e4"; then
	falha "CASO 4: recusou por outro motivo. Mensagem: $(cat "$tmp/e4")"
else
	ok "CASO 4: absoluto, \`pre-push\` alcanca worktree em branch antiga"
fi

# ------------------------------------------------------------------ CASO 5
if git -C "$r" push -q origem antiga 2>"$tmp/e5"; then
	ok "CASO 5: absoluto, push em branch comum passa (nao reprova todo mundo)"
else
	falha "CASO 5: o \`pre-push\` passou a recusar branch que nao e a
          protegida. Portao que reprova todo mundo e desligado.
          Mensagem: $(cat "$tmp/e5")"
fi

# ------------------------------------------------------------------ CASO 6
# Roda o Makefile DE VERDADE, nao uma copia da receita: copia que diverge do
# original passa a conferir outra coisa sem ninguem perceber.
m=$(forjar makefile)
cp "$raiz/Makefile" "$m/Makefile"
: > "$m/.env"
if make -C "$m" setup > "$tmp/s6" 2>&1; then
	valor=$(git -C "$m" config core.hooksPath)
	# `pwd -P` dos dois lados: no macOS /var e link para /private/var, e o
	# git devolve o caminho ja resolvido. Comparar texto cru acusaria uma
	# diferenca que nao existe.
	esperado=$(cd "$m/.githooks" && pwd -P)
	obtido=$([ -d "$valor" ] && cd "$valor" && pwd -P)
	case "$valor" in
	/*) [ "$obtido" = "$esperado" ] \
			&& ok "CASO 6: \`make setup\` grava caminho absoluto do principal" \
			|| falha "CASO 6: absoluto, mas aponta para '$obtido' em vez de
          '$esperado'." ;;
	*)  falha "CASO 6: \`make setup\` gravou '$valor', que e relativo." ;;
	esac
else
	falha "CASO 6: \`make setup\` falhou. Saida: $(cat "$tmp/s6")"
fi

# ------------------------------------------------------------------ CASO 7
# Verificacao que nao consegue verificar precisa reprovar, nunca aprovar.
n=$(forjar sem-ganchos)
cp "$raiz/Makefile" "$n/Makefile"
: > "$n/.env"
git -C "$n" rm -rq .githooks
git -C "$n" commit -qm "principal sem ganchos"
if make -C "$n" setup > "$tmp/s7" 2>&1; then
	falha "CASO 7: \`make setup\` aceitou um principal SEM .githooks e
          configurou um caminho que nao existe. Ninguem fica protegido e
          ninguem fica sabendo. Saida: $(cat "$tmp/s7")"
elif ! grep -q "nao achei" "$tmp/s7"; then
	falha "CASO 7: falhou sem dizer o porque. Saida: $(cat "$tmp/s7")"
else
	ok "CASO 7: \`make setup\` reprova alto quando o principal nao tem ganchos"
fi

echo
if [ "$falhas" -eq 0 ]; then
	echo "alcance dos ganchos: os 7 casos conferem"
	exit 0
fi
echo "alcance dos ganchos: $falhas caso(s) reprovaram" >&2
exit 1
