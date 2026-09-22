#!/usr/bin/env bash
# Prova, nos dois sentidos, o gancho `.githooks/reference-transaction`.
#
# Por que este arquivo existe: "testei e acusou certo" e afirmacao, nao
# evidencia. Ninguem consegue reexecutar uma frase, e ela nao avisa no dia em
# que a regra deixar de funcionar. Entao a isca mora no repositorio e a esteira
# exige a reprovacao dela.
#
# Os dois lados, e o segundo pesa mais que o primeiro:
#   CASO 1  um worktree so          -> `git stash push` PASSA
#   CASO 2  dois worktrees          -> `git stash push` REPROVA          (isca)
#   CASO 3  mesma isca, sem gancho  -> PASSA  (prova que a causa e o gancho)
#   CASO 4  dois worktrees          -> `pop` e `drop` PASSAM
#   CASO 5  dois worktrees          -> `clear` PASSA
#   CASO 6  saida de emergencia     -> PASSA
#
# Portao que reprova todo mundo e desligado na primeira semana, e ai nao ha
# protecao nenhuma. Por isso CASO 1 e CASO 4 sao obrigatorios: eles guardam o
# lado permissivo da regra, que e o que mantem o gancho vivo.
#
# Roda em repositorios descartaveis criados em `mktemp -d`. Nao encosta no
# repositorio de quem chama, e nunca usa `git stash` fora deles.
set -uo pipefail

# Este script copia o gancho para repositorios descartaveis, entao confere a
# regra sem depender de como o repositorio de quem chama esta configurado.
GANCHO_REL="${GANCHO_DE_STASH:-.githooks/reference-transaction}"
raiz=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
gancho="$raiz/$GANCHO_REL"

falhas=0
ok ()   { printf '  ok      %s\n' "$1"; }
falha() { printf '  REPROVA %s\n' "$1" >&2; falhas=$((falhas + 1)); }

# Verificacao que nao consegue verificar precisa reprovar, nunca aprovar.
if [ ! -x "$gancho" ]; then
	echo "REPROVA: nao achei o gancho executavel em '$gancho'." >&2
	echo "  Sem ele este script nao tem o que conferir, e ficar verde assim" >&2
	echo "  seria pior que nao existir." >&2
	exit 1
fi
if ! command -v git > /dev/null 2>&1; then
	echo "REPROVA: 'git' nao esta no PATH. Nada a conferir." >&2
	exit 1
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Cria um repositorio descartavel com o gancho ligado. $1 = nome.
# Imprime o caminho do repositorio.
forjar () {
	local nome="$1" r="$tmp/$1"
	mkdir -p "$r/ganchos"
	cp "$gancho" "$r/ganchos/reference-transaction"
	chmod +x "$r/ganchos/reference-transaction"
	git init -q -b main "$r"
	git -C "$r" config user.name  "isca"
	git -C "$r" config user.email "isca@exemplo.invalido"
	git -C "$r" config core.hooksPath "$r/ganchos"
	echo base > "$r/f.txt"
	git -C "$r" add f.txt
	git -C "$r" commit -qm base
	echo "$r"
}

sujar () { echo "$RANDOM-$(date +%s%N)" > "$1/f.txt"; }
pilha ()  { git -C "$1" stash list | wc -l | tr -d ' '; }

echo "portao de stash: conferindo os dois lados"
echo "  git $(git --version | awk '{print $3}')"

# ---------------------------------------------------------------- CASO 1
# O lado que NAO pode reprovar. Este e o mais importante do arquivo.
r=$(forjar um-worktree)
sujar "$r"
if git -C "$r" stash push -q -m medicao 2>"$tmp/e1"; then
	[ "$(pilha "$r")" = "1" ] \
		&& ok "CASO 1: um worktree so, \`stash push\` passa e empilha" \
		|| falha "CASO 1: comando passou mas a pilha ficou com $(pilha "$r") entradas"
else
	falha "CASO 1: um worktree so e o gancho REPROVOU. Portao que atrapalha
          quem esta seguro vira portao desligado. Mensagem: $(cat "$tmp/e1")"
fi

# ---------------------------------------------------------------- CASO 2
# A isca: o caso que o gancho PRECISA reprovar.
r=$(forjar dois-worktrees)
git -C "$r" worktree add -q "$r/../dois-worktrees-wt2" -b outra HEAD
sujar "$r"
if git -C "$r" stash push -q -m medicao 2>"$tmp/e2"; then
	falha "CASO 2 (isca): dois worktrees e o \`stash push\` PASSOU. O gancho
          nao esta pegando o caso que ele existe para pegar."
elif [ "$(pilha "$r")" != "0" ]; then
	falha "CASO 2 (isca): recusou mas deixou $(pilha "$r") entradas na pilha."
elif ! grep -q "worktrees" "$tmp/e2"; then
	falha "CASO 2 (isca): recusou sem dizer o porque. Mensagem: $(cat "$tmp/e2")"
else
	ok "CASO 2 (isca): dois worktrees, \`stash push\` reprova e explica"
fi

# ---------------------------------------------------------------- CASO 3
# Desliga o gancho no MESMO cenario. Se continuar reprovando, quem reprova nao
# e o gancho, e o CASO 2 estaria verde por acidente.
if git -C "$r" -c core.hooksPath=/dev/null stash push -q -m sem-gancho 2>"$tmp/e3"; then
	ok "CASO 3: sem o gancho a mesma isca passa (a causa e o gancho)"
	git -C "$r" -c core.hooksPath=/dev/null stash drop -q
else
	falha "CASO 3: com o gancho DESLIGADO a isca continuou reprovando. O que
          reprova no CASO 2 nao e o gancho. Mensagem: $(cat "$tmp/e3")"
fi

# ---------------------------------------------------------------- CASO 4
# Recuperacao precisa funcionar. E justamente com varios worktrees que alguem
# tem um stash preso para tirar.
r=$(forjar recuperacao)
git -C "$r" worktree add -q "$r/../recuperacao-wt2" -b outra HEAD
sujar "$r"; BICHU_STASH_LIBERADO=1 git -C "$r" stash push -q -m preso1
sujar "$r"; BICHU_STASH_LIBERADO=1 git -C "$r" stash push -q -m preso2
if [ "$(pilha "$r")" != "2" ]; then
	falha "CASO 4: nao consegui montar a pilha de 2 para testar a recuperacao"
else
	erros=""
	git -C "$r" stash pop -q  2>>"$tmp/e4" || erros="pop "
	git -C "$r" checkout -q -- f.txt
	git -C "$r" stash drop -q 2>>"$tmp/e4" || erros="$erros drop"
	if [ -n "$erros" ]; then
		falha "CASO 4: o gancho bloqueou a recuperacao ($erros). Quem tem
          stash preso fica preso. Mensagem: $(cat "$tmp/e4")"
	elif [ "$(pilha "$r")" != "0" ]; then
		falha "CASO 4: recuperacao rodou mas sobraram $(pilha "$r") entradas"
	else
		ok "CASO 4: dois worktrees, \`pop\` e \`drop\` passam e esvaziam"
	fi
fi

# ---------------------------------------------------------------- CASO 5
r=$(forjar limpeza)
git -C "$r" worktree add -q "$r/../limpeza-wt2" -b outra HEAD
sujar "$r"; BICHU_STASH_LIBERADO=1 git -C "$r" stash push -q -m preso
# Sem esta guarda, um gancho que impede ate o preparo deixaria o caso verde
# por vazio: `clear` numa pilha vazia nao gera transacao e passa sempre.
if [ "$(pilha "$r")" != "1" ]; then
	falha "CASO 5: nao consegui empilhar nada para depois limpar, entao este
          caso nao teria o que conferir."
elif git -C "$r" stash clear 2>"$tmp/e5" && [ "$(pilha "$r")" = "0" ]; then
	ok "CASO 5: dois worktrees, \`stash clear\` passa e esvazia"
else
	falha "CASO 5: o gancho bloqueou \`stash clear\`. Mensagem: $(cat "$tmp/e5")"
fi

# ---------------------------------------------------------------- CASO 6
r=$(forjar saida-de-emergencia)
git -C "$r" worktree add -q "$r/../saida-de-emergencia-wt2" -b outra HEAD
sujar "$r"
if BICHU_STASH_LIBERADO=1 git -C "$r" stash push -q -m deliberado 2>"$tmp/e6" \
	&& [ "$(pilha "$r")" = "1" ]; then
	ok "CASO 6: BICHU_STASH_LIBERADO=1 passa por cima, como documentado"
else
	falha "CASO 6: a saida de emergencia documentada nao funciona.
          Mensagem: $(cat "$tmp/e6")"
fi

echo
if [ "$falhas" -eq 0 ]; then
	echo "portao de stash: os 6 casos conferem"
	exit 0
fi
echo "portao de stash: $falhas caso(s) reprovaram" >&2
exit 1
