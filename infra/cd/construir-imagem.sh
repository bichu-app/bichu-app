#!/usr/bin/env bash
# Constroi UMA imagem uma vez e a publica no Artifact Registry, ou reaproveita
# a que ja existe para a mesma ARVORE de codigo. Roda no runner do GitHub.
#
#   construir-imagem.sh <nome> <contexto> [alvo]
#   ex.: construir-imagem.sh bichu-app . prod
#        construir-imagem.sh bichu-migrador . migrador
#        construir-imagem.sh bichu-web web
#        construir-imagem.sh bichu-admin-web admin   # exige VITE_CAPTCHA_SITE_KEY
#
# Saida (em $GITHUB_OUTPUT, ou na tela):
#   ref=<registro>/<nome>@sha256:...   o digest, que e o que se implanta
#   commit=<commit gravado na imagem>  informativo (sonda de /v1/health, historico)
#   arvore=<arvore do contexto>        O QUE O PLANO LEVA AO `implantar.sh`
#   plataforma=<os/arch>               conferido no blob de configuracao
#
# POR QUE A CHAVE E A ARVORE E NAO O COMMIT. `development` e `main` chegam ao
# mesmo codigo por commits diferentes (o merge cria um commit novo com a mesma
# arvore). Chaveando pela arvore, a `main` encontra a imagem que a
# `development` ja construiu e testou em homologacao, e PROMOVE aquele digest
# para producao em vez de reconstruir -- que e a regra: a mesma imagem nos
# ambientes, promovida por digest, nunca reconstruida por ambiente. O commit
# gravado na imagem continua sendo o de quem a construiu.
#
# E POR QUE A IMAGEM CARIMBA A ARVORE, E NAO SO O COMMIT (02/11/2026). O commit
# gravado e o de QUEM CONSTRUIU, que numa imagem reaproveitada nao e o commit
# de quem implanta. O `implantar.sh` exigia igualdade de COMMIT, e as duas
# regras juntas significavam que TODA imagem reaproveitada reprovava na
# implantacao -- a contradicao foi medida no `bichu-edge` em 02/11: o carimbo
# reprovava contra `fb8e5c2d` e aprovava contra `46d0587c`, e nao bloqueou
# naquele dia so porque a borda nao precisou subir.
#
# A contradicao se resolve escolhendo o invariante certo, e ele e a ARVORE: e a
# arvore que determina o binario, o commit e um rotulo colado em cima dela. Por
# isso a imagem passou a carimbar `/etc/bichu/arvore` ao lado de
# `/etc/bichu/commit`, e o `implantar.sh` confere a ARVORE contra a do plano.
# Reaproveitar imagem de arvore igual passa; imagem de outra arvore reprova.
# O commit continua gravado, e continua sendo o que a sonda de `/v1/health`
# reporta -- ele responde "de que commit saiu isto", que e pergunta legitima;
# o que ele nao serve e para autorizar o deploy.
#
# POR QUE A ARVORE NAO BASTA COMO CHAVE. Ha contexto cujo conteudo depende de
# algo que NAO esta na arvore: o `admin/` assa a chave de SITE do reCAPTCHA no
# pacote, e ela vem do ambiente do build (`.env` do host), nao do git. Com a
# arvore sozinha como chave, uma imagem construida sem a chave ficava gravada
# sob a tag daquela arvore e TODA construcao futura da mesma arvore devolvia a
# quebrada, com o portao aprovando -- cache envenenado, nao azar; a mesma
# regressao voltou tres vezes ao backoffice por isto. Por isso:
#
#   1. o contexto DECLARA o que exige (`exigidas`); ausente ou vazia reprova,
#      porque "nao conseguir conferir nao e aprovacao";
#   2. a variavel passa por NOME (`--build-arg VAR`), lida do ambiente: o valor
#      nunca entra em argv, em log nem em historico. O nome da variavel de
#      ambiente tem de ser EXATAMENTE o do ARG -- `--build-arg VAR` com o valor
#      numa variavel de outro nome le um ambiente que nao existe, o build sai 0
#      e a imagem nasce sem a chave;
#   3. a IMPRESSAO DIGITAL da exigencia entra na tag da arvore (`-k<12 do
#      sha256>`): chave diferente, tag diferente. O hash na tag e seguro; o
#      valor, nao;
#   4. o portao final mede o ARTEFATO e nao a invocacao: depois de construir OU
#      de reaproveitar, o valor que passamos tem de estar DENTRO da imagem.
#      Este portao pede um ACHADO, nao uma ausencia -- por isso nao precisa de
#      controle positivo: zero e reprova, nunca "nada a medir".
#
# A PLATAFORMA E EXPLICITA, E ELA ENTRA NA TAG (02/11/2026). Este script nao
# tinha `--platform`, e a tag de arvore nao codificava arquitetura. Numa maquina
# arm64 -- que e a de quem desenvolve -- sem `DOCKER_DEFAULT_PLATFORM=linux/amd64`
# no ambiente ele publicava arm64 em silencio, e o portao do artefato APROVAVA,
# porque le o commit rodando o conteiner sob emulacao (o `docker run` do Desktop
# emula amd64/arm64 sem reclamar, e `cat /etc/bichu/commit` responde igual nas
# duas). E, por causa do chaveamento pela arvore, uma imagem arm64 publicada uma
# vez ficaria gravada sob a tag daquela arvore e seria REAPROVEITADA
# indefinidamente -- o mesmo envenenamento de cache da chave do captcha, por
# outra porta. Por isso:
#
#   a. a plataforma e PASSADA (`--platform`), nunca herdada do ambiente: variavel
#      de ambiente ausente e o estado normal, e "esqueci de exportar" nao pode
#      ser a diferenca entre amd64 e arm64;
#   b. a arquitetura entra na TAG da arvore (`-linux-amd64`): imagem da
#      arquitetura errada nao tem como ser reaproveitada como se fosse a certa,
#      porque ela nem mora na mesma tag;
#   c. o portao mede a plataforma no BLOB DE CONFIGURACAO da imagem
#      (`docker image inspect` -> `.Os`/`.Architecture`), e NAO no `platform` do
#      indice. O indice e metadado do registro e pode descrever o que quiser; o
#      blob de configuracao e o que o runtime le para escolher o executavel, e e
#      o unico que nao se engana sob emulacao.
set -euo pipefail

nome="${1:?nome da imagem}"; contexto="${2:?contexto}"; alvo="${3:-}"
: "${REGISTRO:?defina REGISTRO, ex.: southamerica-east1-docker.pkg.dev/<projeto>/bichu}"

# A plataforma do artefato. O destino hospedado e uma e2-small linux/amd64
# (ADR-0029); `PLATAFORMA` existe para o dia em que houver outro destino, e nao
# para ser esquecida. Nunca se le `DOCKER_DEFAULT_PLATFORM`: o ponto do conserto
# de 02/11 e justamente nao depender de o ambiente estar posto.
PLATAFORMA="${PLATAFORMA:-linux/amd64}"
[[ "$PLATAFORMA" =~ ^[a-z0-9]+/[a-z0-9]+(/v[0-9]+)?$ ]] || {
  echo "::error::PLATAFORMA='$PLATAFORMA' nao tem a forma <os>/<arch>[/variante], ex.: linux/amd64" >&2
  exit 1
}
plat_os="${PLATAFORMA%%/*}"; plat_resto="${PLATAFORMA#*/}"; plat_arch="${plat_resto%%/*}"

[[ -d "$contexto" && -f "$contexto/Dockerfile" ]] || {
  echo "::error::o contexto '$contexto' nao tem Dockerfile nesta arvore. A imagem $nome nao existe aqui, e o deploy dela reprova em vez de pular." >&2
  exit 1
}

# Contexto na raiz: a arvore inteira. Contexto num subdiretorio (web/, admin/,
# infra/caddy): so a arvore dele, porque a imagem nao enxerga o resto.
if [[ "$contexto" == . ]]; then arvore="$(git rev-parse 'HEAD^{tree}')"; else arvore="$(git rev-parse "HEAD:${contexto#./}")"; fi
commit="$(git rev-parse HEAD)"
repo="$REGISTRO/$nome"

# O que cada contexto exige do ambiente do build. Contexto fora desta tabela
# nao exige nada e segue como antes -- `.` (prod/migrador) e `web` nao tem
# captcha e nao podem passar a exigir variavel nova.
ctx="${contexto#./}"; ctx="${ctx%/}"
exigidas=()
case "$ctx" in
  admin) exigidas=(VITE_CAPTCHA_SITE_KEY) ;;
esac

sha256_hex() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }

build_args=(--build-arg "BUILD_COMMIT=$commit" --build-arg "BUILD_TREE=$arvore")
sufixo_chave=""
for var in ${exigidas[@]+"${exigidas[@]}"}; do
  eval "valor=\${$var:-}"
  if [[ -z "$valor" ]]; then
    echo "::error::o contexto '$ctx' exige a variavel de ambiente $var, e ela esta AUSENTE ou VAZIA neste build (vazio nao e valor). Ela mora no \`.env\` do host -- declarada em \`.env.example\` e no passo do \`admin/\` em \`infra/roteiro-provisionamento.md\`; exporte-a antes de chamar este script (\`set -a; . .env; set +a\`) ou injete-a no ambiente do job. Sem ela o build do painel sairia 0 e o login recusaria com 'captcha indisponivel': construir e o que reprova aqui, nao o login do operador." >&2
    exit 1
  fi
  build_args+=(--build-arg "$var")
  sufixo_chave+="-k$(printf '%s' "$valor" | sha256_hex | cut -c1-12)"
done
# A ARQUITETURA ENTRA NA TAG. Sem ela, a tag de arvore e a mesma para amd64 e
# arm64, e a primeira publicada ganha a chave para sempre.
tag_arvore="arvore-$arvore${alvo:+-$alvo}-$plat_os-$plat_arch$sufixo_chave"

saida() { if [[ -n "${GITHUB_OUTPUT:-}" ]]; then printf '%s=%s\n' "$1" "$2" >> "$GITHUB_OUTPUT"; fi; printf '%s=%s\n' "$1" "$2"; }

# Portao do ARTEFATO. Roda dentro do conteiner, com o valor entregue por
# AMBIENTE (-e NOME, sem valor em argv) e nunca interpolado na linha. Nao supoe
# prefixo: a imagem guarda em /srv/admin/assets/ e o servidor expoe em
# /assets/, entao procura em toda a raiz (menos os pseudo-sistemas) em vez de
# acreditar num caminho.
conferir_artefato() {
  local imagem="$1" var achados rc
  for var in ${exigidas[@]+"${exigidas[@]}"}; do
    set +e
    achados="$(docker run --rm -e "VAR_ALVO=$var" -e "$var" --entrypoint sh "$imagem" -c '
      set -u
      eval "esperado=\"\$$VAR_ALVO\""
      [ -n "$esperado" ] || { echo "a variavel nao chegou ao conteiner" >&2; exit 3; }
      # `grep -rlF ... | head -3` NAO precisa materializar: este trecho roda no
      # `sh` DO CONTEINER, que tem `set -u` e nao `pipefail` (medido em 02/11:
      # `set -o` da imagem lista `pipefail off`, e o pipeline sai 0). Fora daqui,
      # em bash com pipefail, a mesma forma sai 141.
      achou=""
      for raiz in /*; do
        case "$raiz" in /proc|/sys|/dev) continue ;; esac
        if [ -d "$raiz" ]; then
          r="$(grep -rlF "$esperado" "$raiz" 2>/dev/null | head -3)"
          if [ -n "$r" ]; then achou="$achou $r"; fi
        fi
      done
      [ -n "$achou" ] || exit 4
      printf "%s" "$achou"
    ' 2>&1)"
    rc=$?
    set -e
    if [[ $rc -eq 4 ]]; then
      echo "::error::o valor de $var NAO esta na imagem $imagem. A imagem nasceu (ou foi reaproveitada) sem a exigencia do contexto '$ctx': build-arg perdido, nome de variavel diferente do ARG, ou tag de arvore apontando para imagem construida sem a chave. Reprovando em vez de publicar/promover." >&2
      exit 1
    elif [[ $rc -ne 0 ]]; then
      echo "::error::nao consegui conferir $var dentro de $imagem (saida $rc). Nao conseguir conferir nao e aprovacao:" >&2
      printf '%s\n' "$achados" >&2
      exit 1
    fi
    echo "portao do artefato: $var confirmada dentro de $imagem em$achados"
  done
}

# Portao da PLATAFORMA, medido no BLOB DE CONFIGURACAO. `docker image inspect`
# devolve `.Os`/`.Architecture` do config da imagem -- o que o runtime le para
# escolher o executavel. O `platform` do indice do registro NAO serve aqui: ele
# e metadado, descreve o que quiser, e e exatamente o que passa batido sob
# emulacao. Este portao pede um ACHADO (dois campos com valor), entao zero e
# reprova e nunca "nada a medir".
conferir_plataforma() {
  local imagem="$1" lido
  lido="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$imagem")" \
    || { echo "::error::nao consegui ler o blob de configuracao de $imagem. Nao conseguir conferir nao e aprovacao." >&2; exit 1; }
  [[ -n "$lido" && "$lido" == */* ]] \
    || { echo "::error::o blob de configuracao de $imagem nao declara os/arquitetura (veio '$lido')" >&2; exit 1; }
  if [[ "$lido" != "$plat_os/$plat_arch" ]]; then
    echo "::error::PLATAFORMA ERRADA: a imagem $imagem e '$lido' no blob de configuracao, e este build e de '$plat_os/$plat_arch'. Nao e erro de rede nem de memoria: na maquina de quem desenvolve (arm64) o \`docker build\` sem \`--platform\` constroi arm64, e o portao do commit aprova porque le o conteiner sob emulacao. Reprovando antes do push: uma imagem de arquitetura errada gravada sob a tag da arvore seria reaproveitada indefinidamente." >&2
    exit 1
  fi
  echo "portao da plataforma: $imagem e $lido no blob de configuracao"
}

# Portao da ARVORE. A imagem tem de carimbar a arvore de que ela saiu, e esse
# carimbo e o que o `implantar.sh` confere contra o plano. Imagem construida
# fora deste script (um `make up` local, por exemplo) nasce com o carimbo VAZIO:
# ela nao reprova no build, mas reprova na implantacao -- e e a resposta certa,
# porque ninguem sabe de que arvore ela saiu.
conferir_arvore() {
  local imagem="$1" lido
  lido="$(docker run --rm --entrypoint cat "$imagem" /etc/bichu/arvore 2>/dev/null || true)"
  [[ "$lido" == "$arvore" ]] || {
    echo "::error::ARVORE ERRADA: a imagem $imagem carimba a arvore '${lido:-<vazio>}' e este build e da arvore '$arvore'. Vazio significa imagem construida fora de \`infra/cd/construir-imagem.sh\` (ou anterior ao carimbo de 02/11): o CD nao implanta imagem cuja arvore ninguem sabe." >&2
    exit 1
  }
  echo "portao da arvore: $imagem carimba a arvore $lido"
}

# "Nao existe" e resposta; "nao consegui perguntar" NAO e. So o NOT_FOUND vira
# construcao nova; qualquer outro erro do registro reprova.
if digest="$(gcloud artifacts docker images describe "$repo:$tag_arvore" --format='value(image_summary.digest)' 2>"${TMPDIR:-/tmp}/describe.err")"; then
  :
elif grep -q -e NOT_FOUND -e 'not found' "${TMPDIR:-/tmp}/describe.err"; then
  digest=""
else
  echo "::error::nao consegui consultar $repo:$tag_arvore no registro:" >&2; cat "${TMPDIR:-/tmp}/describe.err" >&2; exit 1
fi
if [[ -n "$digest" ]]; then
  ref="$repo@$digest"
  echo "reaproveitada: $repo:$tag_arvore ja existe ($digest), nada a construir"
  # `--platform` tambem no pull: se o que esta no registro for um INDICE, o
  # docker escolheria a arquitetura do host sem avisar.
  docker pull -q --platform "$PLATAFORMA" "$ref" >/dev/null
  conferir_artefato "$ref"
  conferir_plataforma "$ref"
  conferir_arvore "$ref"
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
else
  docker build --platform "$PLATAFORMA" ${alvo:+--target "$alvo"} "${build_args[@]}" \
    -t "$repo:$tag_arvore" -t "$repo:commit-$commit${alvo:+-$alvo}-$plat_os-$plat_arch$sufixo_chave" "$contexto"
  # Antes do push: uma imagem reprovada aqui NAO pode ficar gravada sob a tag
  # da arvore, que e exatamente o envenenamento que este portao existe para
  # impedir. O conteudo e o mesmo que o push publica.
  conferir_artefato "$repo:$tag_arvore"
  conferir_plataforma "$repo:$tag_arvore"
  conferir_arvore "$repo:$tag_arvore"
  docker push -q "$repo:$tag_arvore" >/dev/null
  docker push -q "$repo:commit-$commit${alvo:+-$alvo}-$plat_os-$plat_arch$sufixo_chave" >/dev/null
  # MATERIALIZADO ANTES: `inspect | grep | head -1` punha o `grep` diante de um
  # consumidor que sai no primeiro casamento, e sob `pipefail` o EPIPE do grep
  # virava falha do pipeline -- a mesma familia de defeito do passo que dizia
  # "o compose nao declara o servico admin-web" com o servico declarado.
  repo_digests="$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$repo:$tag_arvore")"
  ref="$(grep "^$repo@" <<<"$repo_digests" | sed -n '1p')"
  gravado="$(docker run --rm --entrypoint cat "$ref" /etc/bichu/commit)"
fi

[[ "$ref" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "::error::nao obtive o digest de $repo:$tag_arvore (veio '$ref')" >&2; exit 1; }
[[ "$gravado" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::$ref nao tem commit gravado em /etc/bichu/commit (veio '$gravado')" >&2; exit 1; }
saida ref "$ref"
saida commit "$gravado"
# A ARVORE sai junto do digest, e e ela que o plano leva ao `implantar.sh`
# (`ARVORE=`/`ARVORE_APP=`/`ARVORE_MIGRADOR=`). O commit sai para a sonda de
# `/v1/health` e para o historico, nao para autorizar o deploy.
saida arvore "$arvore"
saida plataforma "$plat_os/$plat_arch"
