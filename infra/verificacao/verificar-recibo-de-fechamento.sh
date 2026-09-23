#!/usr/bin/env sh
# O que torna a lista de fechamento OBRIGATORIA, e nao documentacao.
#
# POR QUE ESTE ARQUIVO EXISTE
#
# Em 22/09/2026 uma integracao se declarou verde sem nunca ter compilado um
# APK. O `ci.yml` tinha o job `apk` e ele estava certo onde estava; o que
# faltou foi a integracao LOCAL ter rodado alguma coisa equivalente, e aquela
# branch nao passou por PR nenhum, entao a esteira nunca disparou.
#
# `make fechar-integracao` resolve o "o que rodar". Este script resolve o "quem
# e obrigado", que e a metade que costuma faltar: alvo que ninguem precisa
# rodar e documentacao com sintaxe de Makefile.
#
# COMO
#
# `make fechar-integracao` carimba `fechamento.local.txt` com o commit em que
# passou e com o estado da arvore. O gancho `pre-push` chama este script antes
# de deixar uma branch `integra/*` sair da maquina; sem recibo daquele commit
# exato, ele recusa.
#
# O QUE ELE NAO ALCANCA, e a lista importa mais que a promessa:
#
#   - `--no-verify` passa por cima, de proposito e pelo mesmo motivo do guarda
#     da `main` no mesmo gancho: ele existe para impedir o ENGANO, que e o caso
#     comum, nao a decisao deliberada;
#   - branch de integracao que nunca e empurrada nao passa por aqui. Se alguem
#     integra e mescla so na maquina, este script nao ve nada. Nesse caminho o
#     unico controle e quem integra ler o README e rodar o alvo;
#   - o recibo diz que a lista rodou verde NAQUELE commit. Ele nao diz que a
#     lista era a lista certa: isso e o `verificar` e o `apk` que dizem.
#
# Uso:
#   sh infra/verificacao/verificar-recibo-de-fechamento.sh <ref-remota> <sha> [raiz]
#   sh infra/verificacao/verificar-recibo-de-fechamento.sh --autoteste
#
# Saida: 0 pode empurrar, 1 recusado.
set -eu

RECIBO="fechamento.local.txt"

# A familia de branch que fecha integracao. Uma so, e escrita num lugar so.
E_DE_INTEGRACAO() {
  case "$1" in
  refs/heads/integra/* | integra/*) return 0 ;;
  *) return 1 ;;
  esac
}

conferir() {
  ref="$1"
  sha="$2"
  raiz="$3"

  if ! E_DE_INTEGRACAO "$ref"; then
    return 0
  fi

  # Apagar branch remota manda um sha de zeros. Nao ha o que fechar.
  case "$sha" in
  0000000000000000000000000000000000000000 | "") return 0 ;;
  esac

  arquivo="$raiz/$RECIBO"

  if [ ! -f "$arquivo" ]; then
    echo "pre-push: '$ref' e branch de integracao e nao ha recibo de fechamento." >&2
    echo "" >&2
    echo "  Rode:  make fechar-integracao" >&2
    echo "  Ele roda \`verificar\`, a suite Flutter e COMPILA UM APK de verdade." >&2
    echo "  Em 22/09/2026 uma integracao se declarou verde sem nunca ter" >&2
    echo "  compilado um, e o defeito chegou ao cliente." >&2
    echo "  Regra escrita em README.md, secao 'Fechamento de integracao'." >&2
    return 1
  fi

  carimbado=$(sed -n 's/^commit=//p' "$arquivo" | head -1)
  arvore=$(sed -n 's/^arvore=//p' "$arquivo" | head -1)

  if [ "$carimbado" != "$sha" ]; then
    echo "pre-push: o recibo de fechamento e de OUTRO commit." >&2
    echo "" >&2
    echo "  empurrando: $sha" >&2
    echo "  recibo de:  ${carimbado:-<vazio>}" >&2
    echo "" >&2
    echo "  Recibo velho aprova codigo que ninguem provou. Rode de novo:" >&2
    echo "    make fechar-integracao" >&2
    return 1
  fi

  if [ "$arvore" != "limpa" ]; then
    echo "pre-push: o recibo existe e e deste commit, mas a arvore estava SUJA" >&2
    echo "  quando a lista de fechamento rodou (arvore=${arvore:-<vazio>})." >&2
    echo "  O que foi provado nao e o que esta sendo empurrado. Commite e rode" >&2
    echo "  \`make fechar-integracao\` de novo." >&2
    return 1
  fi

  echo "pre-push: recibo de fechamento verde para $sha"
  return 0
}

# ---------------------------------------------------------------------------
# Autoteste. Sem ele a regra acima vale pela confianca do dia em que foi
# escrita -- que e exatamente a familia de defeito que ela existe para pegar.
# ---------------------------------------------------------------------------
autoteste() {
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  falhou=0
  sha_a=1111111111111111111111111111111111111111
  sha_b=2222222222222222222222222222222222222222

  esperar_recusa() {
    motivo="$1"
    shift
    if conferir "$@" >/dev/null 2>&1; then
      echo "REPROVA: a isca '$motivo' PASSOU. O portao de fechamento parou de enxergar esta familia" >&2
      falhou=1
    else
      echo "isca recusada como deveria: $motivo"
    fi
  }

  esperar_permissao() {
    motivo="$1"
    shift
    if conferir "$@" >/dev/null 2>&1; then
      echo "isca permitida como deveria: $motivo"
    else
      echo "REPROVA: a isca '$motivo' foi RECUSADA. Um portao que recusa push legitimo e desligado na primeira semana" >&2
      falhou=1
    fi
  }

  # --- precisam ser RECUSADAS -------------------------------------------
  mkdir -p "$tmp/sem-recibo"
  esperar_recusa "integra/* sem recibo nenhum" \
    "refs/heads/integra/22-09" "$sha_a" "$tmp/sem-recibo"

  mkdir -p "$tmp/recibo-velho"
  printf 'commit=%s\narvore=limpa\nem=2026-09-22T00:00:00Z\n' "$sha_b" \
    > "$tmp/recibo-velho/$RECIBO"
  esperar_recusa "recibo de outro commit" \
    "refs/heads/integra/22-09" "$sha_a" "$tmp/recibo-velho"

  mkdir -p "$tmp/recibo-sujo"
  printf 'commit=%s\narvore=suja\nem=2026-09-22T00:00:00Z\n' "$sha_a" \
    > "$tmp/recibo-sujo/$RECIBO"
  esperar_recusa "recibo deste commit, mas arvore suja quando fechou" \
    "refs/heads/integra/22-09" "$sha_a" "$tmp/recibo-sujo"

  mkdir -p "$tmp/recibo-vazio"
  : > "$tmp/recibo-vazio/$RECIBO"
  esperar_recusa "recibo vazio" \
    "refs/heads/integra/22-09" "$sha_a" "$tmp/recibo-vazio"

  # --- precisam ser PERMITIDAS ------------------------------------------
  # Sem estas tres, um portao que recusasse TUDO passaria no autoteste inteiro
  # e travaria todo push do repositorio, com as quatro linhas acima dizendo que
  # estava tudo certo.
  mkdir -p "$tmp/recibo-bom"
  printf 'commit=%s\narvore=limpa\nem=2026-09-22T00:00:00Z\n' "$sha_a" \
    > "$tmp/recibo-bom/$RECIBO"
  esperar_permissao "recibo verde deste commit" \
    "refs/heads/integra/22-09" "$sha_a" "$tmp/recibo-bom"

  esperar_permissao "branch de feature, que nao fecha integracao nenhuma" \
    "refs/heads/feat/BICHUS-1-alguma-coisa" "$sha_a" "$tmp/sem-recibo"

  esperar_permissao "apagando a branch de integracao (sha de zeros)" \
    "refs/heads/integra/22-09" "0000000000000000000000000000000000000000" "$tmp/sem-recibo"

  [ "$falhou" -eq 0 ] || exit 1
  echo ""
  echo "autoteste: o portao de fechamento enxerga nos dois sentidos (4 recusam, 3 permitem)"
}

if [ "${1:-}" = "--autoteste" ]; then
  autoteste
  exit 0
fi

if [ "$#" -lt 2 ]; then
  echo "uso: $0 <ref-remota> <sha> [raiz]" >&2
  echo "     $0 --autoteste" >&2
  exit 1
fi

conferir "$1" "$2" "${3:-$(git rev-parse --show-toplevel)}"
