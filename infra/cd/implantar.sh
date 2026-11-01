#!/usr/bin/env bash
# Implantacao de UM servico no host, por digest. Roda NA VM, chamado pelo
# workflow `cd.yml` (via `gcloud compute ssh --tunnel-through-iap`), e tambem
# a mao, pelo mesmo comando. Nao constroi nada: a imagem veio pronta do
# Artifact Registry, e o que roda e exatamente o digest que o plano pede.
#
#   ACAO=implantar SERVICO=api COMMIT=<sha> REF_APP=<reg>/bichu-app@sha256:.. \
#     REF_MIGRADOR=<reg>/bichu-migrador@sha256:.. RELEASE=<tar> bash implantar.sh
#   ACAO=implantar SERVICO=web|admin|borda COMMIT=<sha> REF=<reg>/..@sha256:.. RELEASE=<tar> bash implantar.sh
#   ACAO=reverter  SERVICO=<servico> [DESCER_MIGRACOES=sim] bash implantar.sh
#   ACAO=autoteste bash implantar.sh          (as iscas das funcoes puras, sem docker)
#   ACAO=conferir-imagem COMMIT=<sha> REF=<ref> bash implantar.sh
#
# REGRAS QUE NAO SE NEGOCIAM AQUI:
#   - `set -euo pipefail`, e todo portao reprova por AUSENCIA: container que
#     nao aparece, lista vazia, arquivo que falta -- tudo e falha com o motivo.
#   - Sem `timeout` (nao existe na maquina de quem desenvolve e sai 127): as
#     esperas sao lacos com `SECONDS`.
#   - Nenhum segredo passa por este script. Ele nao le nem escreve `.env`, nao
#     cria conta, nao gera senha. A configuracao do host e do operador (ADR-0022).
#   - O volume `caddy_dados` nunca e recriado: certificado novo a cada deploy
#     gasta o limite do emissor.
set -euo pipefail

DIR="${BICHU_DIR:-$HOME/bichu}"
CD="$DIR/.cd"
OVERRIDE="$DIR/compose.override.yaml"   # o compose le este arquivo SOZINHO: comando manual tambem usa o digest
ESTADO="$CD/estado"                      # servico_do_compose=ref, um por linha
HISTORICO="$CD/historico"                # data|servico|implantar/reverter|commit|ref1|ref2|hash_da_config
ESPERA_S="${ESPERA_S:-240}"

falha() { printf '\nREPROVADO: %s\n' "$*" >&2; exit 1; }
passo() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Funcoes puras (sem docker): o que o autoteste exerce
# ---------------------------------------------------------------------------

# Referencia de imagem so vale por digest. Tag e movel; `latest` e defeito.
ref_por_digest() {
  [[ "$1" =~ @sha256:[0-9a-f]{64}$ ]]
}

# Mensagem de divergencia entre o commit gravado na imagem e o do plano. Vazia
# quando batem (prefixo de 7+ conta como igual, como na sonda de /v1/health).
divergencia_de_commit() {
  local ref="$1" gravado="$2" pedido="$3"
  [[ "$gravado" =~ ^[0-9a-f]{7,40}$ ]] || { printf 'a imagem %s nao tem commit gravado com forma de commit (veio "%s")' "$ref" "$gravado"; return; }
  [[ "$pedido" =~ ^[0-9a-f]{7,40}$ ]] || { printf 'o plano nao traz commit com forma de commit (veio "%s")' "$pedido"; return; }
  local curto="$gravado" longo="$pedido"
  if (( ${#pedido} < ${#gravado} )); then curto="$pedido"; longo="$gravado"; fi
  [[ "$longo" == "$curto"* ]] && return
  printf 'DIGEST ERRADO: a imagem %s foi construida do commit %s, e o plano implanta o commit %s' "$ref" "$gravado" "$pedido"
}

# Migracoes aplicadas no banco que a imagem de migracao NAO conhece. Entrada:
# duas listas, uma por linha. Saida: as que sobram, uma por linha.
migracoes_desconhecidas() {
  local aplicadas="$1" da_imagem="$2"
  comm -23 <(printf '%s\n' "$aplicadas" | sed '/^$/d' | sort -u) \
           <(printf '%s\n' "$da_imagem" | sed '/^$/d' | sort -u)
}

# ---------------------------------------------------------------------------
# Docker e compose
# ---------------------------------------------------------------------------

dc() { docker compose --project-directory "$DIR" "$@"; }

commit_gravado() { docker run --rm --entrypoint cat "$1" /etc/bichu/commit 2>/dev/null || true; }

# Puxa por digest e confere que a imagem veio do commit do plano. E a primeira
# metade da isca obrigatoria: digest errado reprova AQUI, nomeando os dois
# commits, antes de qualquer container ser tocado.
conferir_imagem() {
  local ref="$1" pedido="$2"
  ref_por_digest "$ref" || falha "referencia sem digest: '$ref'. O CD so implanta imagem por digest"
  # Artifact Registry: o docker pede a credencial ao gcloud, que a tira da
  # conta de servico da VM (servidor de metadados). Nada de token gravado:
  # `configure-docker` so escreve o NOME do ajudante em ~/.docker/config.json.
  local host="${ref%%/*}"
  if [[ "$host" == *-docker.pkg.dev ]]; then
    gcloud auth configure-docker "$host" --quiet >/dev/null 2>&1 || falha "nao consegui configurar a leitura de $host na VM"
  fi
  docker pull -q "$ref" >/dev/null || falha "nao consegui puxar $ref (digest inexistente no registro, ou a VM sem leitura no Artifact Registry)"
  local gravado; gravado="$(commit_gravado "$ref")"
  local msg; msg="$(divergencia_de_commit "$ref" "$gravado" "$pedido")"
  [[ -z "$msg" ]] || falha "$msg"
  printf '  [ok] %s veio do commit %s\n' "$ref" "$gravado"
}

id_da_imagem() { docker image inspect --format '{{.Id}}' "$1"; }

# A segunda metade: o container que ficou DE PE roda a imagem do plano.
conferir_container() {
  local svc="$1" ref="$2"
  local cid; cid="$(dc ps -q "$svc")"
  [[ -n "$cid" ]] || falha "o servico $svc nao tem container de pe depois da implantacao"
  local roda; roda="$(docker inspect --format '{{.Image}}' "$cid")"
  local pedida; pedida="$(id_da_imagem "$ref")"
  [[ "$roda" == "$pedida" ]] || falha "o container de $svc roda a imagem $roda, e o plano pede $ref ($pedida)"
  printf '  [ok] %s roda %s\n' "$svc" "$ref"
}

esperar_saudavel() {
  local svc="$1" inicio=$SECONDS estado cid
  while :; do
    cid="$(dc ps -q "$svc")"
    [[ -n "$cid" ]] || falha "o servico $svc sumiu enquanto eu esperava ele ficar saudavel"
    estado="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sem-sonda{{end}}' "$cid")"
    case "$estado" in
      healthy) printf '  [ok] %s saudavel\n' "$svc"; return ;;
      sem-sonda) falha "o servico $svc nao declara healthcheck; sem sonda, 'subiu' nao quer dizer nada" ;;
      unhealthy) dc logs --tail 40 "$svc" >&2 || true; falha "o servico $svc ficou unhealthy" ;;
    esac
    (( SECONDS - inicio < ESPERA_S )) || { dc logs --tail 40 "$svc" >&2 || true; falha "o servico $svc nao ficou saudavel em ${ESPERA_S}s (estado: $estado)"; }
    sleep 3
  done
}

# Estado -> compose.override.yaml. So servicos com linha no estado entram.
gravar_override() {
  local tmp="$OVERRIDE.novo"
  {
    printf '# GERADO por infra/cd/implantar.sh. Nao edite: o proximo deploy sobrescreve.\n'
    printf '# O compose le este arquivo sozinho, entao comando manual tambem roda o digest implantado.\n'
    printf 'services:\n'
    local svc ref
    while IFS='=' read -r svc ref; do
      [[ -n "$svc" ]] || continue
      printf '  %s:\n    image: %s\n    pull_policy: never\n' "$svc" "$ref"
    done < "$ESTADO"
  } > "$tmp"
  mv "$tmp" "$OVERRIDE"
}

definir_estado() { # servico_do_compose ref
  touch "$ESTADO"
  { grep -v "^$1=" "$ESTADO" || true; printf '%s=%s\n' "$1" "$2"; } > "$ESTADO.novo"
  mv "$ESTADO.novo" "$ESTADO"
}

estado_de() { { grep "^$1=" "$ESTADO" 2>/dev/null || true; } | head -1 | cut -d= -f2-; }

registrar() { printf '%s|%s|%s|%s|%s|%s|%s\n' "$(date -u +%FT%TZ)" "$@" >> "$HISTORICO"; }

# A PILHA de implantacoes de um servico, reconstruida do historico: cada
# `implantar` empilha, cada `reverter` desempilha. Reverter duas vezes volta
# duas implantacoes (Z -> Y -> X), e nao alterna entre as duas ultimas.
pilha_de() { # servico -> linhas da pilha, da base para o topo
  pilha_do_texto "$1" "$(cat "$HISTORICO" 2>/dev/null || true)"
}
pilha_do_texto() { # servico historico
  awk -F'|' -v s="$1" '$2==s && $3=="implantar" {p[++n]=$0} $2==s && $3=="reverter" {if (n>0) n--} END {for (i=1;i<=n;i++) print p[i]}' <<<"$2"
}

# A implantacao para onde a reversao leva: a de baixo do topo da pilha.
anterior_de() {
  local pilha n; pilha="$(pilha_de "$1")"
  n="$(sed '/^$/d' <<<"$pilha" | wc -l | tr -d ' ')"
  (( n >= 2 )) || falha "a pilha de implantacoes de $1 tem $n item(ns); nao ha anterior para onde voltar"
  sed '/^$/d' <<<"$pilha" | tail -2 | head -1
}

extrair_release() { # tar commit -> copia compose.yaml (e infra/caddy, se pedido)
  local tar="$1" commit="$2" com_borda="${3:-nao}"
  [[ -f "$tar" ]] || falha "o arquivo da release $tar nao existe"
  local destino="$CD/releases/$commit"
  mkdir -p "$destino"
  tar -xf "$tar" -C "$destino"
  # A release fica guardada: e dela que a reversao da borda tira a configuracao.
  [[ "$tar" -ef "$CD/releases/$commit.tar" ]] || cp "$tar" "$CD/releases/$commit.tar"
  [[ -f "$destino/compose.yaml" ]] || falha "a release $commit nao traz compose.yaml"
  cp "$destino/compose.yaml" "$DIR/compose.yaml"
  if [[ "$com_borda" == sim ]]; then
    [[ -f "$destino/infra/caddy/Caddyfile" ]] || falha "a release $commit nao traz infra/caddy/Caddyfile"
    mkdir -p "$DIR/infra/caddy/well-known"
    # `cp` sobre arquivo existente preserva o inode: o edge monta o Caddyfile
    # como ARQUIVO, e `mv` o deixaria olhando para o inode antigo.
    cp "$destino/infra/caddy/Caddyfile" "$DIR/infra/caddy/Caddyfile"
    cp -R "$destino/infra/caddy/well-known/." "$DIR/infra/caddy/well-known/"
  fi
}

hash_da_borda() { # diretorio-raiz com infra/caddy
  ( cd "$1" && find infra/caddy/Caddyfile infra/caddy/well-known -type f | LC_ALL=C sort | xargs sha256sum | sha256sum | cut -d' ' -f1 )
}

migracoes_da_imagem() { docker run --rm --entrypoint sh "$1" -c 'ls /app/migrations' | sed -n 's/\.sql$//p'; }

migracoes_aplicadas() {
  # shellcheck disable=SC2016  # as variaveis sao do container do banco, e expandem la dentro
  dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select name from pgmigrations order by run_on, id"'
}

# ---------------------------------------------------------------------------
# api: migrador + api + worker
# ---------------------------------------------------------------------------
# ORDEM (ADR-0029, secao 2): o worker PARA antes de migrar. Com o worker de pe,
# a migracao soma 256 MB a pilha inteira e passa da maquina; e o worker parado
# nao perde nada, porque o trabalho esta na tabela `jobs`.
#
# SE A MIGRACAO FALHAR: a api nunca trocou de imagem (ela so troca depois), o
# override volta ao anterior, o worker e religado na imagem anterior e o job
# reprova com a saida do migrador. O node-pg-migrate roda cada arquivo numa
# transacao: o que falhou nao fica pela metade.
implantar_api() {
  : "${COMMIT:?}" "${REF_APP:?}" "${REF_MIGRADOR:?}" "${RELEASE:?}"
  passo "imagens do commit $COMMIT"
  conferir_imagem "$REF_APP" "$COMMIT"
  conferir_imagem "$REF_MIGRADOR" "$COMMIT"
  extrair_release "$RELEASE" "$COMMIT"
  cp "$ESTADO" "$ESTADO.antes" 2>/dev/null || : > "$ESTADO.antes"

  passo "migracao (worker parado antes)"
  dc stop worker
  definir_estado migracao "$REF_MIGRADOR"; gravar_override
  if ! dc run --rm --no-deps -T migracao up; then
    cp "$ESTADO.antes" "$ESTADO"; gravar_override
    dc up -d --no-build --no-deps worker || true
    falha "a migracao do commit $COMMIT falhou. A api continua na imagem anterior e o worker foi religado nela"
  fi
  local aplicadas conhecidas faltam sobram
  aplicadas="$(migracoes_aplicadas)"; conhecidas="$(migracoes_da_imagem "$REF_MIGRADOR")"
  [[ -n "$conhecidas" ]] || falha "nao consegui listar as migracoes de $REF_MIGRADOR: lista vazia nao e 'nada a migrar'"
  faltam="$(migracoes_desconhecidas "$conhecidas" "$aplicadas")"
  sobram="$(migracoes_desconhecidas "$aplicadas" "$conhecidas")"
  [[ -z "$faltam" ]] || falha "migracoes da imagem que NAO estao aplicadas depois do 'up': $(tr '\n' ' ' <<<"$faltam")"
  [[ -z "$sobram" ]] || falha "o banco tem migracoes que esta imagem nao conhece: $(tr '\n' ' ' <<<"$sobram"). Implantar codigo mais velho que o esquema e uma reversao; use ACAO=reverter"
  printf '  [ok] %s migracoes aplicadas, iguais as da imagem\n' "$(wc -l <<<"$conhecidas" | tr -d ' ')"

  passo "api e worker"
  definir_estado api "$REF_APP"; definir_estado worker "$REF_APP"; gravar_override
  dc up -d --no-build --no-deps api worker
  esperar_saudavel api; esperar_saudavel worker
  conferir_container api "$REF_APP"; conferir_container worker "$REF_APP"
  registrar api implantar "$COMMIT" "$REF_APP" "$REF_MIGRADOR" "-"
  printf '\nIMPLANTADO: api e worker no commit %s\n' "$COMMIT"
}

# REVERTER A API, e a regra da migracao (a volta e onde a simetria quebra):
#
#   - sem migracao nova entre as duas implantacoes: a volta e troca de imagem
#     e mais nada;
#   - COM migracao aplicada que a imagem de destino nao conhece: a volta e
#     BLOQUEADA, nomeando as migracoes. Nao se presume que o codigo velho
#     tolera o esquema novo: nenhum portao prova isso;
#   - `DESCER_MIGRACOES=sim` e a saida explicita: roda a DESCIDA dessas
#     migracoes com o migrador ATUAL (o de destino nem tem os arquivos), antes
#     de trocar a imagem. Descida apaga o que a subida criou, dado incluido; por
#     isso ela nunca e o padrao, e em producao passa pela aprovacao do
#     `environment`. O portao do marcador garante que toda migracao tem
#     `-- Down Migration` separado da subida.
reverter_api() {
  local linha; linha="$(anterior_de api)"
  local alvo_commit alvo_app alvo_mig
  IFS='|' read -r _ _ _ alvo_commit alvo_app alvo_mig _ <<<"$linha"
  passo "reverter a api para o commit $alvo_commit"
  conferir_imagem "$alvo_app" "$alvo_commit"
  conferir_imagem "$alvo_mig" "$alvo_commit"
  local aplicadas conhecidas sobram n
  aplicadas="$(migracoes_aplicadas)"; conhecidas="$(migracoes_da_imagem "$alvo_mig")"
  [[ -n "$conhecidas" ]] || falha "nao consegui listar as migracoes de $alvo_mig"
  sobram="$(migracoes_desconhecidas "$aplicadas" "$conhecidas")"
  if [[ -n "$sobram" ]]; then
    [[ "${DESCER_MIGRACOES:-nao}" == sim ]] || falha "REVERSAO BLOQUEADA: o banco tem migracoes que o commit $alvo_commit nao conhece: $(tr '\n' ' ' <<<"$sobram"). Voltar a imagem com o esquema novo e presumir compatibilidade que ninguem provou. Corrija para frente, ou repita com DESCER_MIGRACOES=sim para rodar a descida delas (apaga o que elas criaram)"
    n="$(wc -l <<<"$sobram" | tr -d ' ')"
    # A descida desfaz as N ULTIMAS aplicadas. Se as que sobram nao forem
    # exatamente as N ultimas, descer desfaria outra coisa: recusa.
    local ultimas; ultimas="$(tail -n "$n" <<<"$aplicadas" | sort)"
    [[ "$ultimas" == "$(sort <<<"$sobram")" ]] || falha "as migracoes a descer ($(tr '\n' ' ' <<<"$sobram")) nao sao as $n ultimas aplicadas; descer $n desfaria outra coisa"
    passo "descida de $n migracao(oes) com o migrador atual"
    dc stop worker
    dc run --rm --no-deps -T migracao down "$n" || { dc up -d --no-build --no-deps worker || true; falha "a descida falhou; nada foi trocado"; }
    aplicadas="$(migracoes_aplicadas)"
    [[ -z "$(migracoes_desconhecidas "$aplicadas" "$conhecidas")" ]] || falha "depois da descida o banco ainda tem migracoes que o destino nao conhece"
  fi
  dc stop worker
  definir_estado migracao "$alvo_mig"; definir_estado api "$alvo_app"; definir_estado worker "$alvo_app"; gravar_override
  dc up -d --no-build --no-deps api worker
  esperar_saudavel api; esperar_saudavel worker
  conferir_container api "$alvo_app"; conferir_container worker "$alvo_app"
  registrar api reverter "$alvo_commit" "$alvo_app" "$alvo_mig" "-"
  printf '\nREVERTIDO: api e worker no commit %s\n' "$alvo_commit"
  printf 'COMMIT_NO_AR=%s\n' "$alvo_commit"
}

# ---------------------------------------------------------------------------
# web, admin, borda: uma imagem, um servico
# ---------------------------------------------------------------------------

servico_do_compose() {
  case "$1" in web) echo web ;; admin) echo admin-web ;; borda) echo edge ;; *) falha "servico desconhecido: $1" ;; esac
}

subir_um() { # servico ref
  local svc; svc="$(servico_do_compose "$1")"
  definir_estado "$svc" "$2"; gravar_override
  dc up -d --no-build --no-deps "$svc"
  esperar_saudavel "$svc"
  conferir_container "$svc" "$2"
}

implantar_um() {
  : "${COMMIT:?}" "${REF:?}" "${RELEASE:?}"
  local svc; svc="$(servico_do_compose "$SERVICO")"
  passo "$SERVICO no commit $COMMIT"
  conferir_imagem "$REF" "$COMMIT"
  extrair_release "$RELEASE" "$COMMIT"
  dc config --services | grep -qx "$svc" || falha "o compose.yaml do commit $COMMIT nao declara o servico $svc"
  subir_um "$SERVICO" "$REF"
  registrar "$SERVICO" implantar "$COMMIT" "$REF" "-" "-"
  printf '\nIMPLANTADO: %s no commit %s\n' "$SERVICO" "$COMMIT"
}

# A BORDA tem tres cuidados que um CD generico erra:
#   1. o Caddyfile e MONTADO, nao vai na imagem: a configuracao viaja na
#      release e o que se compara e imagem + hash da configuracao;
#   2. recriar a borda derruba todos os hosts e zera o contador de taxa (em
#      memoria). Entao ela so e recriada quando imagem OU configuracao mudam;
#   3. o site precisa estar saudavel ANTES (ADR-0028: senao o apex da 502).
implantar_borda() {
  : "${COMMIT:?}" "${REF:?}" "${RELEASE:?}" "${HOST_SONDA:?}"
  passo "borda no commit $COMMIT"
  conferir_imagem "$REF" "$COMMIT"
  [[ -f "$RELEASE" ]] || falha "o arquivo da release $RELEASE nao existe"
  local destino="$CD/releases/$COMMIT"
  mkdir -p "$destino"; tar -xf "$RELEASE" -C "$destino"
  local novo atual; novo="$(hash_da_borda "$destino")"
  atual="$( { grep '|borda|' "$HISTORICO" 2>/dev/null || true; } | tail -1 | cut -d'|' -f7)"
  if [[ "$(estado_de edge)" == "$REF" && "$atual" == "$novo" ]]; then
    printf '\nSEM MUDANCA: imagem e configuracao da borda iguais as de pe (hash %s). Borda NAO recriada.\n' "$novo"
    return
  fi
  if dc config --services | grep -qx web; then esperar_saudavel web; fi
  extrair_release "$RELEASE" "$COMMIT" sim
  definir_estado edge "$REF"; gravar_override
  dc run --rm --no-deps -T --entrypoint caddy edge validate --config /etc/caddy/Caddyfile --adapter caddyfile \
    || falha "a configuracao da borda do commit $COMMIT nao valida; a borda de pe NAO foi tocada"
  dc up -d --no-build --no-deps --force-recreate edge
  local inicio=$SECONDS
  until curl -fsS -o /dev/null --max-time 5 --resolve "$HOST_SONDA:443:127.0.0.1" "https://$HOST_SONDA/v1/health"; do
    (( SECONDS - inicio < ESPERA_S )) || { dc logs --tail 40 edge >&2 || true; falha "a borda nova nao respondeu https://$HOST_SONDA/v1/health em ${ESPERA_S}s"; }
    sleep 3
  done
  conferir_container edge "$REF"
  local carregado; carregado="$(docker exec "$(dc ps -q edge)" sha256sum /etc/caddy/Caddyfile | cut -d' ' -f1)"
  [[ "$carregado" == "$(sha256sum "$destino/infra/caddy/Caddyfile" | cut -d' ' -f1)" ]] \
    || falha "a borda de pe carregou um Caddyfile ($carregado) diferente do da release $COMMIT"
  printf '  [ok] Caddyfile carregado = o da release (%s)\n' "$carregado"
  registrar borda "${TIPO_BORDA:-implantar}" "$COMMIT" "$REF" "-" "$novo"
  printf '\nIMPLANTADO: borda no commit %s\n' "$COMMIT"
}

reverter_um() {
  local linha; linha="$(anterior_de "$SERVICO")"
  local alvo_commit alvo_ref
  IFS='|' read -r _ _ _ alvo_commit alvo_ref _ _ <<<"$linha"
  passo "reverter $SERVICO para o commit $alvo_commit"
  if [[ "$SERVICO" == borda ]]; then
    local release="$CD/releases/$alvo_commit.tar"
    [[ -f "$release" ]] || falha "a release $alvo_commit nao esta mais no host ($release)"
    COMMIT="$alvo_commit" REF="$alvo_ref" RELEASE="$release" TIPO_BORDA=reverter implantar_borda
  else
    conferir_imagem "$alvo_ref" "$alvo_commit"
    subir_um "$SERVICO" "$alvo_ref"
    registrar "$SERVICO" reverter "$alvo_commit" "$alvo_ref" "-" "-"
  fi
  printf '\nREVERTIDO: %s no commit %s\nCOMMIT_NO_AR=%s\n' "$SERVICO" "$alvo_commit" "$alvo_commit"
}

# ---------------------------------------------------------------------------
# Autoteste: iscas das funcoes puras. Rodam na esteira, antes de qualquer
# deploy; resultado errado e "o portao parou de enxergar".
# ---------------------------------------------------------------------------
# shellcheck disable=SC2016  # as expressoes sao avaliadas por `verdade`, com eval, de proposito
autoteste() {
  local erros=0 m
  isca() { printf '  [%s] %s\n' "$1" "$2"; [[ "$1" == ok ]] || erros=$((erros+1)); }
  local A=262cf1f8a1b2c3d4e5f60718293a4b5c6d7e8f90 B=b528bc8fedcba9876543210fedcba9876543210f
  local R
  R="reg/bichu-app@sha256:$(printf 'a%.0s' {1..64})"

  # verdade <descricao> <expressao>: a expressao PRECISA ser verdadeira.
  verdade() { if eval "$2"; then isca ok "$1"; else isca REPROVA "$1 (m='$m')"; fi; }

  m="$(divergencia_de_commit "$R" "$B" "$A")"
  verdade "digest de outro commit reprova nomeando os dois commits" '[[ "$m" == *"DIGEST ERRADO"*"$B"*"$A"* ]]'
  m="$(divergencia_de_commit "$R" "" "$A")"
  verdade "imagem sem commit gravado reprova" '[[ -n "$m" ]]'
  m="$(divergencia_de_commit "$R" "$A" "")"
  verdade "plano sem commit reprova (ausencia nao e aprovacao)" '[[ -n "$m" ]]'
  m="$(divergencia_de_commit "$R" "$A" "${A:0:7}")"
  verdade "controle: o mesmo commit (curto) passa" '[[ -z "$m" ]]'
  m=""
  verdade "referencia por tag (sem digest) reprova" '! ref_por_digest "reg/bichu-app:latest"'
  verdade "controle: referencia por digest passa" 'ref_por_digest "$R"'
  m="$(migracoes_desconhecidas $'a\nb\nc' $'a\nb')"
  verdade "migracao aplicada que o destino nao conhece e nomeada (reversao bloqueada)" '[[ "$m" == c ]]'
  m="$(migracoes_desconhecidas $'a\nb' $'a\nb\nc')"
  verdade "controle: destino que conhece todas as aplicadas nao bloqueia" '[[ -z "$m" ]]'

  local H
  H=$'t|api|implantar|X|a|b|-\nt|api|implantar|Y|a|b|-\nt|api|implantar|Z|a|b|-\nt|api|reverter|Y|a|b|-'
  m="$(pilha_do_texto api "$H" | tail -1 | cut -d'|' -f4)"
  verdade "depois de reverter Z, o topo da pilha e Y" '[[ "$m" == Y ]]'
  m="$(pilha_do_texto api "$H" | tail -2 | head -1 | cut -d'|' -f4)"
  verdade "a proxima reversao leva a X, e nao de volta a Z" '[[ "$m" == X ]]'

  (( erros == 0 )) || { printf '\nO PORTAO ESTA CEGO: %s isca(s) com resultado errado\n' "$erros"; exit 1; }
  printf '\nAUTOTESTE APROVADO\n'
}

main() {
  case "${ACAO:-}" in
    autoteste) autoteste; return ;;
    conferir-imagem) : "${REF:?}" "${COMMIT:?}"; conferir_imagem "$REF" "$COMMIT"; return ;;
  esac
  [[ -d "$DIR" ]] || falha "o diretorio do projeto $DIR nao existe"
  [[ -f "$DIR/.env" ]] || falha "$DIR/.env nao existe: a configuracao do host e do operador, e o CD nao a cria"
  mkdir -p "$CD/releases"
  case "${ACAO:-}:${SERVICO:-}" in
    implantar:api) implantar_api ;;
    implantar:borda) implantar_borda ;;
    implantar:web|implantar:admin) implantar_um ;;
    reverter:api) reverter_api ;;
    reverter:web|reverter:admin|reverter:borda) reverter_um ;;
    *) falha "ACAO/SERVICO invalidos: '${ACAO:-}' '${SERVICO:-}'" ;;
  esac
}

main "$@"
