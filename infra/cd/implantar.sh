#!/usr/bin/env bash
# Implantacao de UM servico no host, por digest. Roda NA VM, chamado pelo
# workflow `cd.yml` (via `gcloud compute ssh --tunnel-through-iap`), e tambem
# a mao, pelo mesmo comando. Nao constroi nada: a imagem veio pronta do
# Artifact Registry, e o que roda e exatamente o digest que o plano pede.
#
#   ACAO=implantar SERVICO=api COMMIT=<sha> REF_APP=<reg>/bichu-app@sha256:.. \
#     ARVORE_APP=<arvore> REF_MIGRADOR=<reg>/bichu-migrador@sha256:.. \
#     ARVORE_MIGRADOR=<arvore> RELEASE=<tar> bash implantar.sh
#   ACAO=implantar SERVICO=web|admin|borda|midia COMMIT=<sha> REF=<reg>/..@sha256:.. \
#     ARVORE=<arvore> RELEASE=<tar> bash implantar.sh
#   ACAO=reverter  SERVICO=<servico> [DESCER_MIGRACOES=sim] bash implantar.sh
#   ACAO=autoteste bash implantar.sh          (as iscas das funcoes puras, sem docker)
#   ACAO=conferir-imagem REF=<ref> ARVORE=<arvore> bash implantar.sh
#   ACAO=conferir-plano SERVICO=<servico> COMMIT=.. REF=.. ARVORE=.. RELEASE=..
#                                             (ENSAIO: imprime o plano, nao aplica nada)
#
# `ARVORE` e a saida `arvore=` do `infra/cd/construir-imagem.sh`, e desde
# 02/11/2026 ela e o INVARIANTE do deploy -- nao o commit. O porque esta escrito
# em `divergencia_de_arvore`, mais abaixo.
#
# `BICHU_DIR` aponta o diretorio da pilha e NAO tem adivinhacao: o default
# `$HOME/bichu` e conferido, e diretorio sem `compose.yaml`+`.env` reprova
# nomeando os candidatos que existem no host.
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

# ONDE A PILHA MORA, E POR QUE ISTO RECUSA EM VEZ DE ADIVINHAR (02/11/2026).
# O default era `$HOME/bichu` e ele aponta para onde a pilha NAO esta: o login
# por `gcloud compute ssh` e `oi_bichu_app`, entao `$HOME/bichu` resolve para
# `/home/oi_bichu_app/bichu`, e a pilha mora em `/home/leandropanegassi/bichu`.
# Um default errado nao falha claro: ele falha no primeiro `dc` com "no
# configuration file provided", ou -- pior -- acha um diretorio pela metade e
# implanta num lugar que ninguem esta olhando.
#
# Entao o default fica, porque ele e o caso certo em qualquer host onde a pilha
# esteja no `~` de quem entra; mas ele e CONFERIDO. Diretorio sem a pilha
# reprova nomeando o que faltou e o que existe por perto, e a saida e uma linha:
# `export BICHU_DIR=/home/<dono>/bichu`. Adivinhar entre candidatos seria
# escolher por conta propria o lugar onde se implanta.
DIR="${BICHU_DIR:-$HOME/bichu}"
CD="$DIR/.cd"
OVERRIDE="$DIR/compose.override.yaml"   # o compose le este arquivo SOZINHO: comando manual tambem usa o digest
ESTADO="$CD/estado"                      # servico_do_compose=ref, um por linha
HISTORICO="$CD/historico"                # data|servico|implantar/reverter|commit|ref1|ref2|hash_da_config
ESPERA_S="${ESPERA_S:-240}"
# Onde a saida do `docker pull` e guardada para a mensagem poder nomear a causa.
# `TMPDIR` e nao `/tmp`: a limpeza do macOS apaga `/private/tmp` em dias.
CD_PULL_LOG="${TMPDIR:-/tmp}/bichu-cd-pull.$$"

falha() { printf '\nREPROVADO: %s\n' "$*" >&2; exit 1; }
passo() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------------------
# Funcoes puras (sem docker): o que o autoteste exerce
# ---------------------------------------------------------------------------

# Referencia de imagem so vale por digest. Tag e movel; `latest` e defeito.
ref_por_digest() {
  [[ "$1" =~ @sha256:[0-9a-f]{64}$ ]]
}

# O INVARIANTE DO DEPLOY E A ARVORE, E NAO O COMMIT (02/11/2026).
#
# A contradicao que isto conserta. O `construir-imagem.sh` chaveia a imagem pela
# ARVORE -- de proposito, e esta escrito la por que: `development` e `main`
# chegam ao mesmo codigo por commits diferentes, e a promocao para producao e
# reaproveitar o digest que homologacao ja testou, nunca reconstruir. Mas a
# imagem carimba o commit de QUEM A CONSTRUIU, e esta funcao exigia que esse
# carimbo fosse IGUAL ao commit do plano. As duas regras juntas diziam: toda
# imagem reaproveitada reprova na implantacao. Medido no `bichu-edge` em 02/11:
# o carimbo reprovava contra `fb8e5c2d` e aprovava contra `46d0587c`. Nao
# bloqueou naquele dia so porque a borda nao precisava subir.
#
# POR QUE A ARVORE, E NAO O COMMIT. A pergunta que o deploy precisa responder e
# "o binario que vai rodar e o que eu quis subir?". O que determina o binario e
# a arvore de codigo; o commit e um rotulo colado em cima dela, e dois commits
# com a mesma arvore produzem o MESMO binario -- recusar um deles e recusar por
# um motivo que nao existe. Entao a conferencia passou a comparar a arvore
# carimbada na imagem com a arvore do plano.
#
# E ISTO NAO AFROUXA NADA, mede outra coisa:
#   - imagem de OUTRA arvore reprova, nomeando as duas arvores;
#   - imagem SEM o carimbo de arvore reprova (build local, ou imagem anterior a
#     02/11): "nao sei de que arvore ela saiu" nunca e aprovacao;
#   - plano SEM arvore reprova: ausencia nao e aprovacao;
#   - e a arvore, diferente do commit, nao tem prefixo que "conta como igual":
#     a comparacao e de igualdade exata dos 40 digitos.
# O commit continua sendo lido e IMPRESSO -- ele vai para o historico e e o que
# a sonda de `/v1/health` reporta. O que ele deixou de fazer e autorizar.

# Mensagem de divergencia entre a arvore carimbada na imagem e a do plano.
# Vazia quando batem.
divergencia_de_arvore() {
  local ref="$1" gravada="$2" pedida="$3"
  [[ "$gravada" =~ ^[0-9a-f]{40}$ ]] || { printf 'a imagem %s nao tem arvore carimbada em /etc/bichu/arvore (veio "%s"). Imagem construida fora de `infra/cd/construir-imagem.sh` -- um `make up` local, ou imagem anterior ao carimbo de 02/11/2026 -- nao diz de que arvore saiu, e o CD nao implanta o que nao sabe identificar. Reconstrua com `infra/cd/construir-imagem.sh`' "$ref" "$gravada"; return; }
  [[ "$pedida" =~ ^[0-9a-f]{40}$ ]] || { printf 'o plano nao traz a arvore do servico (veio "%s"). Ela sai do `construir-imagem.sh` como `arvore=`, e entra aqui em ARVORE (ou ARVORE_APP/ARVORE_MIGRADOR). Sem ela nao ha o que conferir, e nao conseguir conferir nao e aprovacao' "$pedida"; return; }
  [[ "$gravada" == "$pedida" ]] && return
  printf 'ARVORE ERRADA: a imagem %s foi construida da arvore %s, e o plano implanta a arvore %s. Reaproveitar imagem de arvore IGUAL e legitimo (e o que promove o digest de homologacao para producao); esta e de arvore diferente, logo e outro binario' "$ref" "$gravada" "$pedida"
}

# O commit continua conferido -- mas so quanto a FORMA, e so para o historico e
# para a sonda. Mensagem vazia quando esta bem formado.
defeito_no_commit() {
  local ref="$1" gravado="$2"
  [[ "$gravado" =~ ^[0-9a-f]{7,40}$ ]] || { printf 'a imagem %s nao tem commit gravado com forma de commit (veio "%s")' "$ref" "$gravado"; return; }
}

# Migracoes aplicadas no banco que a imagem de migracao NAO conhece. Entrada:
# duas listas, uma por linha. Saida: as que sobram, uma por linha.
migracoes_desconhecidas() {
  local aplicadas="$1" da_imagem="$2"
  comm -23 <(printf '%s\n' "$aplicadas" | sed '/^$/d' | sort -u) \
           <(printf '%s\n' "$da_imagem" | sed '/^$/d' | sort -u)
}

# A PILHA ESTA AQUI? Recusa com o motivo, e nunca segue num diretorio pela
# metade. `compose.yaml` e `.env` sao os dois arquivos sem os quais nada deste
# script faz sentido: o primeiro define os servicos, o segundo e a configuracao
# do operador (ADR-0022), que o CD nao cria.
conferir_dir() {
  local faltam=() c candidatos=()
  [[ -d "$DIR" ]] || faltam+=("o diretorio nao existe")
  [[ -f "$DIR/compose.yaml" ]] || faltam+=("falta compose.yaml")
  [[ -f "$DIR/.env" ]] || faltam+=("falta .env")
  (( ${#faltam[@]} == 0 )) && return
  # O que EXISTE por perto. Isto so informa: a escolha e de quem roda.
  for c in "$HOME"/bichu /home/*/bichu /opt/bichu /srv/bichu; do
    [[ -f "$c/compose.yaml" && -f "$c/.env" ]] && candidatos+=("$c")
  done
  {
    local lista=""
    for c in "${faltam[@]}"; do lista+="${lista:+, }$c"; done
    printf 'REPROVADO: %s nao tem a pilha do bichu (%s).\n\n' "$DIR" "$lista"
    if [[ -n "${BICHU_DIR:-}" ]]; then
      printf '  BICHU_DIR veio do ambiente: %s\n' "$BICHU_DIR"
    else
      printf '  BICHU_DIR nao foi definido, e o default e $HOME/bichu = %s\n' "$HOME/bichu"
      printf '  O login do `gcloud compute ssh` e `oi_bichu_app`, e a pilha NAO mora no `~` dele:\n'
      printf '  em 02/11/2026 ela estava em /home/leandropanegassi/bichu.\n'
    fi
    printf '\n'
    if (( ${#candidatos[@]} )); then
      printf '  Diretorios com compose.yaml E .env neste host:\n'
      printf '    %s\n' "${candidatos[@]}"
      printf '\n  Rode de novo apontando o certo, por exemplo:\n    BICHU_DIR=%s ACAO=%s SERVICO=%s ... bash implantar.sh\n' \
        "${candidatos[0]}" "${ACAO:-implantar}" "${SERVICO:-<servico>}"
    else
      printf '  Nao achei nenhum diretorio com compose.yaml E .env nos lugares conhecidos\n'
      printf '  (%s, /home/*/bichu, /opt/bichu, /srv/bichu). Ou a pilha esta em outro\n' "$HOME/bichu"
      printf '  caminho, e ele vai em BICHU_DIR, ou ela nao foi provisionada neste host.\n'
    fi
    printf '\n  Nao vou adivinhar: implantar no diretorio errado nao da erro, da um deploy\n'
    printf '  que ninguem esta olhando.\n'
  } >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Docker e compose
# ---------------------------------------------------------------------------

dc() { docker compose --project-directory "$DIR" "$@"; }

commit_gravado() { docker run --rm --entrypoint cat "$1" /etc/bichu/commit 2>/dev/null || true; }
arvore_gravada() { docker run --rm --entrypoint cat "$1" /etc/bichu/arvore 2>/dev/null || true; }

# Puxa por digest e confere que a imagem veio da ARVORE do plano. E a primeira
# metade da isca obrigatoria: imagem de outra arvore reprova AQUI, nomeando as
# duas arvores, antes de qualquer container ser tocado.
conferir_imagem() {
  local ref="$1" pedida="$2"
  ref_por_digest "$ref" || falha "referencia sem digest: '$ref'. O CD so implanta imagem por digest"
  # Artifact Registry: o docker pede a credencial ao gcloud, que a tira da
  # conta de servico da VM (servidor de metadados). Nada de token gravado:
  # `configure-docker` so escreve o NOME do ajudante em ~/.docker/config.json.
  local host="${ref%%/*}"
  if [[ "$host" == *-docker.pkg.dev ]]; then
    gcloud auth configure-docker "$host" --quiet >/dev/null 2>&1 || falha "nao consegui configurar a leitura de $host na VM"
  fi
  # A TERCEIRA CAUSA ESTAVA FALTANDO NA MENSAGEM. Quando o que esta no registro
  # e um INDICE que nao tem a arquitetura deste host, o daemon responde "no
  # matching manifest for <plataforma>" -- e a mensagem antiga culpava o
  # registro ou a credencial, que e procurar no lugar errado. Medido em 02/11 ao
  # construir as iscas.
  docker pull -q "$ref" >"$CD_PULL_LOG" 2>&1 || {
    local pq; pq="$(cat "$CD_PULL_LOG" 2>/dev/null || true)"
    if [[ "$pq" == *"no matching manifest"* || "$pq" == *"no match for platform"* ]]; then
      falha "nao consegui puxar $ref: o que esta publicado sob este digest NAO TEM A ARQUITETURA deste host. E o defeito de plataforma (o build publicou a arquitetura errada), e nao o registro nem a credencial. Resposta do daemon: $pq"
    fi
    falha "nao consegui puxar $ref (digest inexistente no registro, ou a VM sem leitura no Artifact Registry). Resposta do daemon: $pq"
  }
  # A PLATAFORMA PRIMEIRO, e a ordem importa. Todo o resto desta funcao le os
  # carimbos com `docker run`, e rodar imagem de arquitetura errada falha com
  # `exec format error`: o carimbo voltaria VAZIO e a mensagem seria "sem
  # carimbo de arvore" -- defeito de plataforma acusado como defeito de
  # carimbo. Mensagem que mente faz procurar no lugar errado, e e a mesma
  # familia do pipeline que dizia "o compose nao declara admin-web".
  local plat; plat="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$ref")" \
    || falha "nao consegui ler o blob de configuracao de $ref. Nao conseguir conferir nao e aprovacao"
  [[ -n "$plat" && "$plat" == */* ]] \
    || falha "o blob de configuracao de $ref nao declara os/arquitetura (veio '$plat')"
  [[ "$plat" == "${PLATAFORMA:-linux/amd64}" ]] \
    || falha "PLATAFORMA ERRADA: $ref e '$plat' no BLOB DE CONFIGURACAO, e este host e '${PLATAFORMA:-linux/amd64}'. Medido no blob de configuracao de proposito, e nao no \`platform\` do indice: o indice e metadado do registro e passa batido sob emulacao. Imagem assim nao sobe -- o container morre com \`exec format error\`, longe daqui"
  local gravada; gravada="$(arvore_gravada "$ref")"
  if [[ "$pedida" == - ]]; then
    # REVERSAO COM REGISTRO ANTIGO. `-` nao e "pode passar": e "a identidade
    # desta imagem vem do DIGEST que este proprio script gravou no historico
    # quando a implantou e a conferiu", que e identidade mais forte que a
    # arvore, nao mais fraca. Vale SO na reversao, e so para registro anterior
    # ao carimbo de arvore (02/11/2026): bloquear a volta seria trocar um risco
    # por outro maior, porque reversao nunca traz codigo novo.
    printf '  [av] %s: a arvore nao foi comparada -- o registro do historico e anterior ao carimbo de 02/11/2026. A identidade aqui e o digest gravado por este script.\n' "$ref"
  else
    local msg; msg="$(divergencia_de_arvore "$ref" "$gravada" "$pedida")"
    [[ -z "$msg" ]] || falha "$msg"
  fi
  local gravado; gravado="$(commit_gravado "$ref")"
  local defeito; defeito="$(defeito_no_commit "$ref" "$gravado")"
  [[ -z "$defeito" ]] || falha "$defeito"
  printf '  [ok] %s: arvore %s, plataforma %s, commit %s\n' "$ref" "${gravada:-<sem carimbo>}" "$plat" "$gravado"
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

# MATERIALIZADO POR PRECAUCAO, e o registro honesto da medicao de 02/11: esta
# forma NAO reproduziu o defeito. Com produtor EXTERNO (`grep`) e `|| true`
# dentro do grupo, 20 rodadas sobre um produtor de 9,9 MB deram 0 nao-zero: o
# `grep` morre de SIGPIPE, mas a subshell do grupo sobrevive e executa o
# `|| true`. Com produtor BUILTIN do bash a mesma forma sai 141 -- o sinal
# atinge a propria subshell -- e e por isso que `printf ... | grep -q` reprova
# (20/20) e isto nao.
#
# Fica materializado de todo jeito porque a seguranca dela depende de uma
# sutileza entre builtin e binario externo, e `estado_de` nao e detalhe:
# `implantar_borda` compara o resultado dela para decidir se RECRIA a borda, e
# recriar a borda derruba todos os hosts e zera o contador de taxa.
estado_de() {
  local linhas
  linhas="$(grep "^$1=" "$ESTADO" 2>/dev/null || true)"
  [[ -n "$linhas" ]] || return 0
  cut -d= -f2- <<<"$(sed -n '1p' <<<"$linhas")"
}

# data|servico|acao|commit|ref1|ref2|hash_config|arvore1|arvore2
# As duas ARVORES entraram no FIM em 02/11/2026, de proposito: `cut -d'|' -f7`
# e o `read` de sete campos que existiam continuam lendo o mesmo, e registro
# antigo (sete campos) le arvore vazia -- que a reversao trata nomeando o
# motivo, em vez de comparar com vazio e aprovar.
registrar() { printf '%s|%s|%s|%s|%s|%s|%s|%s|%s\n' "$(date -u +%FT%TZ)" "$@" >> "$HISTORICO"; }

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
  # Materializado por uniformidade, com a medicao registrada: esta forma
  # (`sed | tail -2 | head -1`) NAO reproduziu o defeito -- 0 nao-zero em 20
  # rodadas, porque `tail -2` escreve as duas linhas numa escrita so e termina
  # antes de o `head` fechar o cano. Diferente de `cmd | grep -q`, que reprovou
  # 20/20. Fica assim para a forma nao reaparecer por copia.
  local duas; duas="$(sed '/^$/d' <<<"$pilha" | tail -2)"
  sed -n '1p' <<<"$duas"
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
  : "${COMMIT:?}" "${REF_APP:?}" "${REF_MIGRADOR:?}" "${RELEASE:?}" "${ARVORE_APP:?a arvore da imagem da app, saida \`arvore=\` do construir-imagem.sh}" "${ARVORE_MIGRADOR:?a arvore da imagem do migrador}"
  passo "imagens do commit $COMMIT (arvores $ARVORE_APP / $ARVORE_MIGRADOR)"
  conferir_imagem "$REF_APP" "$ARVORE_APP"
  conferir_imagem "$REF_MIGRADOR" "$ARVORE_MIGRADOR"
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
  registrar api implantar "$COMMIT" "$REF_APP" "$REF_MIGRADOR" "-" "$ARVORE_APP" "$ARVORE_MIGRADOR"
  conferir_midia_acompanha "$REF_APP"
  printf '\nIMPLANTADO: api e worker no commit %s\n' "$COMMIT"
}

# O `midia` RODA A MESMA IMAGEM da api, e por isso ele nao pode ficar atras dela
# em silencio -- foi assim que ele passou seis dias em d5c382dc (27/10) enquanto
# api e worker andavam.
#
# A regra e assimetrica de proposito, e a assimetria tem motivo:
#   - `midia` JA gerenciado pelo CD e com digest diferente do da api: REPROVA.
#     Duas metades da mesma imagem em commits diferentes nao e estado que alguem
#     tenha escolhido, e o deploy da api e o momento em que isto da para pegar.
#   - `midia` AINDA NAO gerenciado pelo CD (sem linha no estado): AVISA, alto, e
#     nao bloqueia. Em 02/11 esse e o estado de fato, e converter uma condicao
#     preexistente em deploy de api bloqueado seria decidir pelo operador uma
#     coisa que ele nao pediu. O aviso diz o comando exato.
conferir_midia_acompanha() {
  local ref_app="$1" atual; atual="$(estado_de midia)"
  if [[ -z "$atual" ]]; then
    printf '\n  [AVISO] o `midia` NAO esta sob o CD: nao ha linha para ele em %s.\n' "$ESTADO"
    printf '          Ele roda a MESMA imagem da api (`bichu-app`), entao agora ele esta\n'
    printf '          ATRAS dela. Em 02/11/2026 ele rodava `bichu-app:local` carimbado em\n'
    printf '          d5c382dc, de 27/10. Para traze-lo para este digest, com supervisao:\n'
    printf '            ACAO=implantar SERVICO=midia COMMIT=%s REF=%s ARVORE=%s RELEASE=<tar> bash implantar.sh\n' \
      "$COMMIT" "$ref_app" "$ARVORE_APP"
    return
  fi
  [[ "$atual" == "$ref_app" ]] && { printf '  [ok] o midia acompanha a api (%s)\n' "$ref_app"; return; }
  falha "o \`midia\` esta sob o CD no digest $atual, e a api acabou de ir para $ref_app. E a MESMA imagem (\`bichu-app\`) em dois digests: metade do backend num commit e metade em outro nao e estado que alguem escolheu. Implante o midia no mesmo digest (ACAO=implantar SERVICO=midia COMMIT=$COMMIT REF=$ref_app ARVORE=$ARVORE_APP RELEASE=<tar>) ou reverta a api"
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
  local alvo_commit alvo_app alvo_mig alvo_arv_app alvo_arv_mig
  IFS='|' read -r _ _ _ alvo_commit alvo_app alvo_mig _ alvo_arv_app alvo_arv_mig <<<"$linha"
  passo "reverter a api para o commit $alvo_commit"
  conferir_imagem "$alvo_app" "${alvo_arv_app:--}"
  conferir_imagem "$alvo_mig" "${alvo_arv_mig:--}"
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
  registrar api reverter "$alvo_commit" "$alvo_app" "$alvo_mig" "-" "${alvo_arv_app:-}" "${alvo_arv_mig:-}"
  printf '\nREVERTIDO: api e worker no commit %s\n' "$alvo_commit"
  printf 'COMMIT_NO_AR=%s\n' "$alvo_commit"
}

# ---------------------------------------------------------------------------
# web, admin, borda: uma imagem, um servico
# ---------------------------------------------------------------------------

# O `midia` ENTROU EM 02/11/2026, e o motivo e medido. O leitor da midia publica
# usa a MESMA imagem da api (`bichu-app`, outro comando), mas nao tinha nome
# aqui -- entao nenhum caminho do CD o alcancava. Resultado medido na VM:
# `bichu-midia-1` rodando `bichu-app:local`, carimbado em d5c382dc, de 27/10,
# seis dias atras, enquanto api e worker seguiam adiante. A borda depende dele
# (`depends_on: midia`), e o leitor da midia publica e o que serve `img-*`.
#
# O `compose.yaml` NAO precisou mudar: o `midia` ja declara `image:` e
# `healthcheck:` como api e worker, e o `compose.override.yaml` que este script
# gera e que fixa o digest e o `pull_policy: never`. O que faltava era so o nome.
servico_do_compose() {
  case "$1" in
    web) echo web ;;
    admin) echo admin-web ;;
    borda) echo edge ;;
    midia) echo midia ;;
    *) falha "servico desconhecido: $1" ;;
  esac
}

# A lista de servicos do compose, MATERIALIZADA. Nunca `dc config --services |
# grep -q`: o `grep -q` sai no primeiro casamento, o `compose` leva EPIPE e sob
# `pipefail` o pipeline devolve erro -- e a mensagem que saia era "o compose.yaml
# do commit X nao declara o servico admin-web" com o servico declarado na linha
# 880 do arquivo. Reproduzido em 02/11: reprovou, e o comando identico passou em
# seguida. Falha fechada, logo segura; mas mensagem que mente faz procurar o
# defeito no lugar errado.
declara_servico() { # servico -> 0 se o compose do host declara
  local lista
  lista="$(dc config --services)" || falha "nao consegui ler a lista de servicos do compose em $DIR"
  [[ -n "$lista" ]] || falha "a lista de servicos do compose veio VAZIA; lista vazia nao e 'nao declara'"
  grep -qx "$1" <<<"$lista"
}

subir_um() { # servico ref
  local svc; svc="$(servico_do_compose "$1")"
  definir_estado "$svc" "$2"; gravar_override
  dc up -d --no-build --no-deps "$svc"
  esperar_saudavel "$svc"
  conferir_container "$svc" "$2"
}

implantar_um() {
  : "${COMMIT:?}" "${REF:?}" "${RELEASE:?}" "${ARVORE:?a arvore da imagem, saida \`arvore=\` do construir-imagem.sh}"
  local svc; svc="$(servico_do_compose "$SERVICO")"
  passo "$SERVICO no commit $COMMIT (arvore $ARVORE)"
  conferir_imagem "$REF" "$ARVORE"
  extrair_release "$RELEASE" "$COMMIT"
  declara_servico "$svc" || falha "o compose.yaml do commit $COMMIT nao declara o servico $svc"
  subir_um "$SERVICO" "$REF"
  registrar "$SERVICO" implantar "$COMMIT" "$REF" "-" "-" "$ARVORE" "-"
  printf '\nIMPLANTADO: %s no commit %s\n' "$SERVICO" "$COMMIT"
}

# A BORDA tem tres cuidados que um CD generico erra:
#   1. o Caddyfile e MONTADO, nao vai na imagem: a configuracao viaja na
#      release e o que se compara e imagem + hash da configuracao;
#   2. recriar a borda derruba todos os hosts e zera o contador de taxa (em
#      memoria). Entao ela so e recriada quando imagem OU configuracao mudam;
#   3. o site precisa estar saudavel ANTES (ADR-0028: senao o apex da 502).
implantar_borda() {
  : "${COMMIT:?}" "${REF:?}" "${RELEASE:?}" "${HOST_SONDA:?}" "${ARVORE:?a arvore da imagem da borda}"
  passo "borda no commit $COMMIT (arvore $ARVORE)"
  conferir_imagem "$REF" "$ARVORE"
  [[ -f "$RELEASE" ]] || falha "o arquivo da release $RELEASE nao existe"
  local destino="$CD/releases/$COMMIT"
  mkdir -p "$destino"; tar -xf "$RELEASE" -C "$destino"
  local novo atual; novo="$(hash_da_borda "$destino")"
  atual="$( { grep '|borda|' "$HISTORICO" 2>/dev/null || true; } | tail -1 | cut -d'|' -f7)"
  if [[ "$(estado_de edge)" == "$REF" && "$atual" == "$novo" ]]; then
    printf '\nSEM MUDANCA: imagem e configuracao da borda iguais as de pe (hash %s). Borda NAO recriada.\n' "$novo"
    return
  fi
  if declara_servico web; then esperar_saudavel web; fi
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
  registrar borda "${TIPO_BORDA:-implantar}" "$COMMIT" "$REF" "-" "$novo" "$ARVORE" "-"
  printf '\nIMPLANTADO: borda no commit %s\n' "$COMMIT"
}

reverter_um() {
  local linha; linha="$(anterior_de "$SERVICO")"
  local alvo_commit alvo_ref alvo_arvore
  IFS='|' read -r _ _ _ alvo_commit alvo_ref _ _ alvo_arvore _ <<<"$linha"
  passo "reverter $SERVICO para o commit $alvo_commit"
  if [[ "$SERVICO" == borda ]]; then
    local release="$CD/releases/$alvo_commit.tar"
    [[ -f "$release" ]] || falha "a release $alvo_commit nao esta mais no host ($release)"
    COMMIT="$alvo_commit" REF="$alvo_ref" RELEASE="$release" ARVORE="${alvo_arvore:--}" TIPO_BORDA=reverter implantar_borda
  else
    conferir_imagem "$alvo_ref" "${alvo_arvore:--}"
    subir_um "$SERVICO" "$alvo_ref"
    registrar "$SERVICO" reverter "$alvo_commit" "$alvo_ref" "-" "-" "${alvo_arvore:-}" "-"
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

  # --- O INVARIANTE DO DEPLOY: A ARVORE (02/11/2026) ---------------------
  m="$(divergencia_de_arvore "$R" "$B" "$A")"
  verdade "imagem de outra arvore reprova nomeando as duas arvores" '[[ "$m" == *"ARVORE ERRADA"*"$B"*"$A"* ]]'
  m="$(divergencia_de_arvore "$R" "" "$A")"
  verdade "imagem SEM carimbo de arvore reprova (build local nao se implanta)" '[[ -n "$m" ]]'
  m="$(divergencia_de_arvore "$R" "$A" "")"
  verdade "plano sem arvore reprova (ausencia nao e aprovacao)" '[[ -n "$m" ]]'
  m="$(divergencia_de_arvore "$R" "$A" "${A:0:7}")"
  verdade "arvore do plano com forma errada (prefixo) reprova: arvore nao tem prefixo que conta como igual" '[[ -n "$m" ]]'
  m="$(divergencia_de_arvore "$R" "$A" "$A")"
  verdade "CONTROLE: a MESMA arvore passa -- e isto e o reaproveitamento legitimo de imagem" '[[ -z "$m" ]]'
  # O que o defeito A era: commit DIFERENTE com a MESMA arvore. Antes de 02/11
  # isto reprovava; e exatamente o deploy de imagem reaproveitada.
  m="$(divergencia_de_arvore "$R" "$A" "$A")"
  verdade "CONTROLE do defeito A: imagem reaproveitada (outro commit, mesma arvore) PASSA" '[[ -z "$m" ]]'

  m="$(defeito_no_commit "$R" "$A")"
  verdade "controle: commit bem formado nao acusa defeito" '[[ -z "$m" ]]'
  m="$(defeito_no_commit "$R" "nao-e-commit")"
  verdade "commit mal formado na imagem reprova" '[[ -n "$m" ]]'
  m=""
  verdade "referencia por tag (sem digest) reprova" '! ref_por_digest "reg/bichu-app:latest"'
  verdade "controle: referencia por digest passa" 'ref_por_digest "$R"'

  # --- O `midia` TEM NOME NO CD (defeito F, 02/11/2026) ------------------
  m="$(servico_do_compose midia)"
  verdade "o servico midia resolve para o servico midia do compose" '[[ "$m" == midia ]]'
  m="$(servico_do_compose admin)"
  verdade "controle: admin continua resolvendo para admin-web" '[[ "$m" == admin-web ]]'
  m="$( (servico_do_compose inexistente) 2>&1 || true )"
  verdade "controle negativo: servico desconhecido reprova" '[[ "$m" == *"servico desconhecido"* ]]'
  m="$(migracoes_desconhecidas $'a\nb\nc' $'a\nb')"
  verdade "migracao aplicada que o destino nao conhece e nomeada (reversao bloqueada)" '[[ "$m" == c ]]'
  m="$(migracoes_desconhecidas $'a\nb' $'a\nb\nc')"
  verdade "controle: destino que conhece todas as aplicadas nao bloqueia" '[[ -z "$m" ]]'

  local H
  H=$'t|api|implantar|X|a|b|-\nt|api|implantar|Y|a|b|-\nt|api|implantar|Z|a|b|-\nt|api|reverter|Y|a|b|-'
  m="$(pilha_do_texto api "$H" | tail -1 | cut -d'|' -f4)"
  verdade "depois de reverter Z, o topo da pilha e Y" '[[ "$m" == Y ]]'
  m="$(pilha_do_texto api "$H" | tail -2)"; m="$(sed -n '1p' <<<"$m" | cut -d'|' -f4)"
  verdade "a proxima reversao leva a X, e nao de volta a Z" '[[ "$m" == X ]]'

  (( erros == 0 )) || { printf '\nO PORTAO ESTA CEGO: %s isca(s) com resultado errado\n' "$erros"; exit 1; }
  printf '\nAUTOTESTE APROVADO\n'
}

# ---------------------------------------------------------------------------
# ENSAIO: o plano, impresso, sem tocar em nada
# ---------------------------------------------------------------------------
# `ACAO=conferir-imagem` ja existia e mede UMA imagem -- mas ela PUXA do
# registro e precisa de docker. Este modo e o complemento que faltava: ele nao
# puxa, nao sobe, nao grava arquivo nenhum e nao precisa de docker. Ele responde
# "o que exatamente este comando faria", que e a pergunta de quem vai aplicar
# uma mudanca com supervisao.
#
#   ACAO=conferir-plano SERVICO=midia COMMIT=<sha> REF=<ref> ARVORE=<arvore> \
#     RELEASE=<tar> BICHU_DIR=<dir> bash implantar.sh
conferir_plano() {
  : "${SERVICO:?}"
  local svc; svc="$(servico_do_compose "$SERVICO")"
  printf '\n== PLANO (ENSAIO -- nada sera aplicado)\n'
  printf '  acao .............. implantar\n'
  printf '  servico (pedido) .. %s\n' "$SERVICO"
  printf '  servico no compose. %s\n' "$svc"
  printf '  diretorio da pilha. %s%s\n' "$DIR" "${BICHU_DIR:+  (de BICHU_DIR)}"
  printf '  commit ............ %s\n' "${COMMIT:-<AUSENTE: reprovaria>}"
  printf '  arvore ............ %s\n' "${ARVORE:-<AUSENTE: reprovaria>}"
  printf '  digest ............ %s\n' "${REF:-<AUSENTE: reprovaria>}"
  printf '  release ........... %s\n' "${RELEASE:-<AUSENTE: reprovaria>}"
  printf '\n  CONFERENCIAS PURAS (as que nao precisam de docker nem de rede):\n'
  local ok=1
  if [[ -n "${REF:-}" ]] && ref_por_digest "${REF:-}"; then
    printf '    [ok]     a referencia e por digest\n'
  else
    printf '    [REPROVA] a referencia nao e por digest\n'; ok=0
  fi
  if [[ "${ARVORE:-}" =~ ^[0-9a-f]{40}$ ]]; then
    printf '    [ok]     a arvore do plano tem forma de arvore\n'
  else
    printf '    [REPROVA] a arvore do plano nao tem forma de arvore (40 hex)\n'; ok=0
  fi
  if [[ "${COMMIT:-}" =~ ^[0-9a-f]{7,40}$ ]]; then
    printf '    [ok]     o commit do plano tem forma de commit\n'
  else
    printf '    [REPROVA] o commit do plano nao tem forma de commit\n'; ok=0
  fi
  printf '\n  O QUE SERIA ESCRITO em %s (a linha do %s, as outras ficam como estao):\n' "$OVERRIDE" "$svc"
  printf '    %s:\n      image: %s\n      pull_policy: never\n' "$svc" "${REF:-<AUSENTE>}"
  printf '\n  O QUE SERIA FEITO, na ordem:\n'
  printf '    1. docker pull por digest, e conferir ARVORE, plataforma e forma do commit\n'
  printf '    2. extrair o compose.yaml da release %s\n' "${RELEASE:-<AUSENTE>}"
  printf '    3. conferir que o compose.yaml da release declara `%s`\n' "$svc"
  printf '    4. gravar o override e `dc up -d --no-build --no-deps %s`\n' "$svc"
  printf '    5. esperar `healthy` (ESPERA_S=%s) e conferir que o container roda ESSE digest\n' "$ESPERA_S"
  printf '    6. gravar a linha no historico\n'
  printf '\n  O QUE NAO SERIA TOCADO: nenhum outro servico (`--no-deps`), nenhuma imagem\n'
  printf '  construida (`--no-build`), o `.env` do host, o volume `caddy_dados`.\n'
  (( ok )) || { printf '\nENSAIO REPROVADO: o plano esta incompleto acima.\n'; exit 1; }
  printf '\nENSAIO APROVADO: o plano esta completo e bem formado. NADA foi aplicado.\n'
}

main() {
  case "${ACAO:-}" in
    autoteste) autoteste; return ;;
    # ARVORE sem `:?` de proposito: ausente ou vazia reprova em
    # `divergencia_de_arvore`, que diz ONDE achar o valor. A mensagem do `:?` do
    # bash diria so o nome da variavel.
    conferir-imagem) : "${REF:?}"; conferir_imagem "$REF" "${ARVORE:-}"; return ;;
    conferir-plano) conferir_plano; return ;;
  esac
  conferir_dir
  mkdir -p "$CD/releases"
  case "${ACAO:-}:${SERVICO:-}" in
    implantar:api) implantar_api ;;
    implantar:borda) implantar_borda ;;
    implantar:web|implantar:admin|implantar:midia) implantar_um ;;
    reverter:api) reverter_api ;;
    reverter:web|reverter:admin|reverter:borda|reverter:midia) reverter_um ;;
    *) falha "ACAO/SERVICO invalidos: '${ACAO:-}' '${SERVICO:-}'" ;;
  esac
}

main "$@"
