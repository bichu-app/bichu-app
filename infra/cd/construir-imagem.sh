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
#      controle positivo: zero e reprova, nunca "nada a medir". ELE NAO BASTA
#      SOZINHO, e o paragrafo seguinte (04/11/2026) diz por que: ele prova que a
#      chave que passamos chegou, nao que era a chave CERTA.
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
# O PORTAO DO ARTEFATO CONFERIA QUE *ALGUMA* CHAVE CHEGOU, NAO *QUAL* (04/11/2026).
# O item 4 acima diz "o valor que passamos tem de estar DENTRO da imagem", e era
# literalmente isso: `conferir_artefato` tirava o esperado da MESMA variavel de
# ambiente que o build acabara de usar. Controle positivo que sai do valor medido
# compara o valor com ele mesmo, e aprova QUALQUER valor -- a familia que o #161
# fechou no `API_BASE_URL` do APK, aqui por outra porta.
#
# O QUE ISSO CUSTAVA, medido na subida de homologacao de 04/11/2026:
#
#   - o `.env` DESTE repositorio nao tem `VITE_CAPTCHA_SITE_KEY` nenhuma, e a
#     `CAPTCHA_SITE_KEY` dele tem impressao `-ke7e002d715e9`, que e a chave de
#     display name `bichu-app` -- a de PRODUCAO;
#   - a API de homologacao de pe valida contra `-k7f62b3562293`, que e a chave
#     `bichu-app-hml`, e e ela que o pacote servido em `admin-hml.bichu.app`
#     carrega; as seis tags de `bichu-admin-web` no registro sao todas essa;
#   - o servidor manda `siteKey` dentro da avaliacao
#     (`src/modules/admin-access/adapters/external/recaptcha-enterprise.ts`),
#     entao painel com a chave do outro ambiente tem o token recusado na origem:
#     o captcha do painel PARA.
#
# Quem seguisse o roteiro ao pe da letra (`set -a; . .env; set +a`) publicaria o
# painel de homologacao com a chave de producao, e o portao aprovaria. Nao foi ao
# ar porque alguem notou -- e notar nao e portao.
#
# O CONSERTO: O ANCORA SAI DO AMBIENTE E VAI PARA UMA DECLARACAO RASTREADA.
# `infra/cd/chaves-de-site-por-destino.txt` declara, por DESTINO, a impressao
# digital que aquele destino deve assar. O portao compara o valor do ambiente com
# a DECLARACAO antes de construir (`veredito_da_chave`), e so depois cobra que
# ele esteja na imagem (`conferir_artefato`). A cadeia fecha nos tres pontos:
# declarado == ambiente == assado, e nenhum deles e o controle positivo do outro.
#
# SO IMPRESSAO DIGITAL, NUNCA O VALOR: a declaracao guarda 12 digitos hex do
# sha256, que ja sao publicos nas tags (`-k<12>`). A chave secreta nao entra
# neste repositorio em forma nenhuma.
#
# AUSENCIA TEM DESFECHO PROPRIO E NOMEADO, nunca `exit 0` com aviso: destino nao
# passado (`DESTINO_AUSENTE`), destino sem linha (`DESTINO_NAO_DECLARADO`),
# exigencia sem linha para o destino (`EXIGENCIA_NAO_DECLARADA`), duas linhas
# para o mesmo par (`DECLARACAO_AMBIGUA`), impressao fora da forma
# (`DECLARACAO_MAL_FORMADA`), tabela ilegivel ou sem nenhuma declaracao
# (`TABELA_ILEGIVEL`/`TABELA_SEM_DECLARACAO`). A esteira ja teve "base nao
# existe" e "arquivo nao existe na base" colapsados no mesmo `exit 0` no portao
# de contrato; aqui cada um sai com o nome dele.
#
#   ACAO=autoteste bash infra/cd/construir-imagem.sh   # as iscas, sem docker e
#                                                      # sem registro
set -euo pipefail

sha256_hex() { if command -v sha256sum >/dev/null 2>&1; then sha256sum; else shasum -a 256; fi | cut -d' ' -f1; }
impressao_de() { printf '%s' "$1" | sha256_hex | cut -c1-12; }

TABELA_DE_CHAVES="${TABELA_DE_CHAVES:-$(dirname "$0")/chaves-de-site-por-destino.txt}"

# ---------------------------------------------------------------------------
# A FUNCAO PURA DA DECISAO. Sem docker, sem rede, sem git: so a tabela, o
# destino, o nome da variavel e o valor. Imprime nada e sai 0 quando aprova;
# imprime `MOTIVO: <frase>` e sai 1 quando reprova.
#
# UMA funcao, e nao uma por desfecho, porque e ela que o autoteste exercita: se
# as iscas batessem numa copia simplificada, elas provariam a copia. O MOTIVO sai
# em maiuscula no comeco da linha para o autoteste poder afirmar QUAL desfecho
# aconteceu -- reprovar pelo motivo errado e o defeito que a isca
# `com-mapa-de-fonte` do `verificar-backoffice.sh` pegou em 28/09.
#
# A linha de declaracao e a que tem `CHAVE` como PRIMEIRO campo. O resto do
# arquivo e prosa de proposito, e sem o marcador qualquer paragrafo de quatro
# palavras seria lido como declaracao.
# ---------------------------------------------------------------------------
veredito_da_chave() { # tabela, destino, variavel, valor
  local tabela="$1" destino="$2" variavel="$3" valor="$4" linhas n declarada

  [[ -n "$destino" ]] || { echo "DESTINO_AUSENTE: o contexto exige $variavel e nenhum DESTINO foi passado. Sem destino nao ha declaracao para comparar, e nao ter o que comparar nao e aprovacao. Passe DESTINO=<hml|prod>."; return 1; }
  [[ -f "$tabela" && -r "$tabela" ]] || { echo "TABELA_ILEGIVEL: nao consegui ler a declaracao em '$tabela'. Nao conseguir perguntar nao e resposta."; return 1; }

  # CONTROLE POSITIVO DA LEITURA. Tabela legivel mas sem nenhuma linha de
  # declaracao daria zero casamentos para QUALQUER destino, e zero casamentos
  # sem controle vira "nao declarado" quando a verdade e "nao li nada".
  n="$(awk '$1 == "CHAVE"' "$tabela" | grep -c . || true)"
  [[ "$n" -gt 0 ]] || { echo "TABELA_SEM_DECLARACAO: '$tabela' nao tem nenhuma linha comecando por \`CHAVE\`. Tabela sem declaracao nenhuma reprova tudo por outro motivo que nao o do destino, e aprovar seria pior."; return 1; }

  # O destino tem de aparecer em ALGUMA declaracao. Separado da busca do par
  # para que "destino que ninguem declarou" e "destino declarado sem ESTA
  # exigencia" sejam dois desfechos, e nao um.
  if [[ -z "$(awk -v d="$destino" '$1 == "CHAVE" && $2 == d' "$tabela")" ]]; then
    echo "DESTINO_NAO_DECLARADO: o destino '$destino' nao tem nenhuma linha em '$tabela'. Destinos declarados: $(awk '$1 == "CHAVE" { print $2 }' "$tabela" | sort -u | tr '\n' ' ')."
    return 1
  fi

  linhas="$(awk -v d="$destino" -v v="$variavel" '$1 == "CHAVE" && $2 == d && $3 == v { print $4 }' "$tabela")"
  n="$(printf '%s' "$linhas" | grep -c . || true)"
  if [[ "$n" -eq 0 ]]; then
    echo "EXIGENCIA_NAO_DECLARADA: o destino '$destino' existe em '$tabela', mas nao declara $variavel. O contexto EXIGE essa variavel, e exigencia sem declaracao para o destino reprova -- declare a impressao digital dela na tabela."
    return 1
  fi
  if [[ "$n" -gt 1 ]]; then
    echo "DECLARACAO_AMBIGUA: '$tabela' declara $variavel para '$destino' $n vezes ($(printf '%s' "$linhas" | tr '\n' ' ')). Declaracao ambigua nao e declaracao: deixe uma linha."
    return 1
  fi

  declarada="$linhas"
  if [[ ! "$declarada" =~ ^[0-9a-f]{12}$ ]]; then
    echo "DECLARACAO_MAL_FORMADA: a impressao declarada para $variavel em '$destino' e '$declarada', e a forma e 12 digitos hexadecimais minusculos (os 12 primeiros do sha256). Impressao que nao tem forma de impressao nao compara com nada."
    return 1
  fi

  # SO AQUI O VALOR ENTRA, e ele entra como MEDIDO, nunca como esperado. Esta
  # ordem e o conserto inteiro: o esperado ja estava decidido pela tabela antes
  # de este script olhar o ambiente.
  [[ -n "$valor" ]] || { echo "VALOR_AUSENTE: $variavel esta ausente ou vazia no ambiente deste build (vazio nao e valor), e o destino '$destino' declara a impressao $declarada."; return 1; }

  local medida; medida="$(impressao_de "$valor")"
  if [[ "$medida" != "$declarada" ]]; then
    echo "IMPRESSAO_DIVERGENTE: $variavel do ambiente tem impressao $medida, e o destino '$destino' declara $declarada. E chave de OUTRO ambiente: assada na imagem, o painel de '$destino' colhe token que a API daquele ambiente nao valida (o servidor manda \`siteKey\` na avaliacao), e o captcha do painel para. Nao corrija a tabela para calar o portao -- pegue a chave do destino no provedor, pelo nome, como o passo 7.2 de \`infra/roteiro-provisionamento.md\` manda."
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# AS ISCAS, NOS DOIS SENTIDOS. A chave declarada APROVA e a chave do outro
# ambiente REPROVA -- as duas provadas aqui, porque portao que so reprova e
# portao que ninguem deixa ligado, e portao que so aprova nao e portao.
#
# As iscas usam valores INVENTADOS e as impressoes deles, calculadas na hora:
# nenhuma chave de verdade entra no autoteste, e ele roda sem rede, sem docker e
# sem a tabela de producao. O par "declarada aprova / do outro ambiente reprova"
# e montado com DOIS valores distintos cujas impressoes vao para dois destinos
# distintos da tabela de mentira -- e ai a troca de destino e a unica diferenca.
# ---------------------------------------------------------------------------
autoteste() {
  local erros=0 m tmp
  # GLOBAL, e nao `local`, por causa do `trap`: o trap roda no EXIT do script,
  # quando a funcao ja voltou e um `local` nao existe mais -- sob `set -u` isso
  # vira "tmp: unbound variable" e um `exit 1` DEPOIS do veredito impresso, que
  # e a pior forma de errar (o autoteste dizia APROVADO e saia 1).
  TMP_DO_AUTOTESTE="$(mktemp -d "${TMPDIR:-/tmp}/autoteste-chave-de-site.XXXXXX")"
  trap 'rm -rf "${TMP_DO_AUTOTESTE:-}"' EXIT
  tmp="$TMP_DO_AUTOTESTE"

  # DE PROPOSITO SEM A FORMA DE UMA CHAVE DE VERDADE (sem o prefixo `6L`, sem
  # 40 caracteres): o portao compara IMPRESSOES, entao a forma do valor nao
  # importa para a medicao -- e valor com cara de chave numa isca e o que faz
  # varredura de segredo reprovar um PR que nao tem segredo nenhum.
  local chave_hml='isca-de-homologacao-nao-e-chave'
  local chave_prod='isca-de-producao-nao-e-chave'
  local imp_hml imp_prod
  imp_hml="$(impressao_de "$chave_hml")"; imp_prod="$(impressao_de "$chave_prod")"

  # CONTROLE DO PROPRIO AUTOTESTE: duas iscas com a MESMA impressao nao provariam
  # divergencia nenhuma, e o caso "do outro ambiente reprova" passaria vazio.
  if [[ "$imp_hml" == "$imp_prod" ]]; then
    echo "REPROVA: as duas iscas tem a MESMA impressao ($imp_hml). O autoteste nao prova divergencia e vale nada" >&2
    return 1
  fi

  cat > "$tmp/tabela.txt" <<'PROSA'
Prosa antes da tabela, de proposito: ela tem quatro palavras por linha e nao
pode ser lida como declaracao. hml VITE_CAPTCHA_SITE_KEY aaaaaaaaaaaa mentira
PROSA
  printf 'CHAVE hml  VITE_CAPTCHA_SITE_KEY %s isca-hml\n'  "$imp_hml"  >> "$tmp/tabela.txt"
  printf 'CHAVE prod VITE_CAPTCHA_SITE_KEY %s isca-prod\n' "$imp_prod" >> "$tmp/tabela.txt"

  # O CODIGO DE SAIDA E A MENSAGEM SAO CONFERIDOS JUNTOS. So a mensagem nao
  # bastaria: uma funcao que imprimisse o motivo e saisse 0 passaria em todas as
  # iscas negativas e aprovaria tudo na vida real.
  isca() { # motivo-esperado, descricao, destino, variavel, valor, [tabela]
    local esperado="$1" desc="$2" destino="$3" variavel="$4" valor="$5" tabela="${6:-$tmp/tabela.txt}" rc=0
    m="$(veredito_da_chave "$tabela" "$destino" "$variavel" "$valor")" || rc=$?
    if [[ "$esperado" == APROVA ]]; then
      if [[ "$rc" -eq 0 && -z "$m" ]]; then
        printf '  [ok] %s\n' "$desc"
      else
        printf '  [REPROVA] %s -- devia APROVAR e saiu %s: %s\n' "$desc" "$rc" "${m:-<sem mensagem>}" >&2; erros=$((erros+1))
      fi
      return
    fi
    if [[ "$rc" -ne 0 && "$m" == "$esperado"* ]]; then
      printf '  [ok] %s -> %s\n' "$desc" "$esperado"
    elif [[ "$rc" -eq 0 ]]; then
      printf '  [REPROVA] %s -- esperava %s e APROVOU\n' "$desc" "$esperado" >&2; erros=$((erros+1))
    else
      printf '  [REPROVA] %s -- esperava %s e saiu: %s\n' "$desc" "$esperado" "$m" >&2; erros=$((erros+1))
    fi
  }

  echo "--- iscas da declaracao da chave de site ---"

  # OS DOIS SENTIDOS, que e o que o portao existe para fazer.
  isca APROVA "a chave DECLARADA para hml aprova em hml" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml"
  isca IMPRESSAO_DIVERGENTE "a chave de PRODUCAO reprova quando o destino e hml (o defeito de 04/11/2026)" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_prod"
  # E a simetria: nao e "prod e errada", e "a do outro ambiente e errada".
  isca APROVA "controle da simetria: a chave declarada para prod aprova em prod" \
    prod VITE_CAPTCHA_SITE_KEY "$chave_prod"
  isca IMPRESSAO_DIVERGENTE "a chave de HOMOLOGACAO reprova quando o destino e prod" \
    prod VITE_CAPTCHA_SITE_KEY "$chave_hml"

  # AUSENCIA, CADA UMA COM O NOME DELA. Sem estas, os quatro casos de "nao sei"
  # colapsariam num desfecho so -- ou, pior, num aviso e `exit 0`.
  isca DESTINO_AUSENTE "destino vazio reprova com desfecho proprio" \
    "" VITE_CAPTCHA_SITE_KEY "$chave_hml"
  isca DESTINO_NAO_DECLARADO "destino que a tabela nao conhece reprova com desfecho proprio" \
    qa VITE_CAPTCHA_SITE_KEY "$chave_hml"
  isca EXIGENCIA_NAO_DECLARADA "destino conhecido SEM a exigencia declarada reprova com desfecho proprio" \
    hml VITE_OUTRA_COISA "$chave_hml"
  isca VALOR_AUSENTE "valor vazio reprova com desfecho proprio, e nao como divergencia" \
    hml VITE_CAPTCHA_SITE_KEY ""
  isca TABELA_ILEGIVEL "tabela inexistente reprova como 'nao consegui perguntar'" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/nao-existe.txt"

  : > "$tmp/vazia.txt"
  isca TABELA_SEM_DECLARACAO "tabela legivel e VAZIA reprova com desfecho proprio, nao como destino ausente" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/vazia.txt"

  # Tabela que e SO prosa: legivel, com conteudo, e nenhuma linha `CHAVE`. E o
  # caso que separa "nao li nada" de "li e nao achei".
  printf 'hml VITE_CAPTCHA_SITE_KEY %s sem-o-marcador\n' "$imp_hml" > "$tmp/so-prosa.txt"
  isca TABELA_SEM_DECLARACAO "linha sem o marcador \`CHAVE\` nao conta como declaracao" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/so-prosa.txt"

  printf 'CHAVE hml VITE_CAPTCHA_SITE_KEY %s a\nCHAVE hml VITE_CAPTCHA_SITE_KEY %s b\n' \
    "$imp_hml" "$imp_hml" > "$tmp/duplicada.txt"
  isca DECLARACAO_AMBIGUA "duas linhas para o mesmo par reprovam mesmo sendo IGUAIS" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/duplicada.txt"

  printf 'CHAVE hml VITE_CAPTCHA_SITE_KEY NAO-E-IMPRESSAO x\n' > "$tmp/mal-formada.txt"
  isca DECLARACAO_MAL_FORMADA "impressao fora da forma reprova antes de comparar" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/mal-formada.txt"

  # A impressao TRUNCADA nao vale como igual: 12 digitos e a forma, e prefixo de
  # 11 nao e impressao de nada. Mesmo espirito do caso do #161 em que a arvore
  # com prefixo de 7 nao conta como igual.
  printf 'CHAVE hml VITE_CAPTCHA_SITE_KEY %s truncada\n' "${imp_hml:0:11}" > "$tmp/truncada.txt"
  isca DECLARACAO_MAL_FORMADA "impressao truncada em 11 digitos nao conta como igual" \
    hml VITE_CAPTCHA_SITE_KEY "$chave_hml" "$tmp/truncada.txt"

  # --- A TABELA DE VERDADE, conferida pela forma e nao pelo valor ----------
  # Ela nao entra nos casos acima de proposito: o autoteste nao deve depender de
  # qual chave esta declarada hoje. O que ele cobra e que o arquivo que o portao
  # vai ler EXISTA e seja legivel pela mesma regra -- sem isto, uma tabela
  # renomeada deixaria o portao reprovando tudo e ninguem saberia por que.
  echo "--- a tabela de verdade ---"
  if [[ -f "$TABELA_DE_CHAVES" ]]; then
    local reais; reais="$(awk '$1 == "CHAVE" { print $2 "/" $3 "/" $4 }' "$TABELA_DE_CHAVES" | sort)"
    if [[ -z "$reais" ]]; then
      printf '  [REPROVA] %s existe mas nao tem nenhuma linha de declaracao (primeiro campo CHAVE)\n' "$TABELA_DE_CHAVES" >&2; erros=$((erros+1))
    else
      printf '  [ok] %s declara: %s\n' "$TABELA_DE_CHAVES" "$(tr '\n' ' ' <<<"$reais")"
      local mal; mal="$(awk '$1 == "CHAVE" && $4 !~ /^[0-9a-f]{12}$/ { print $2 "/" $3 "/" $4 }' "$TABELA_DE_CHAVES")"
      [[ -z "$mal" ]] || { printf '  [REPROVA] impressao fora da forma na tabela de verdade: %s\n' "$(tr '\n' ' ' <<<"$mal")" >&2; erros=$((erros+1)); }
      local dup; dup="$(awk '$1 == "CHAVE" { print $2, $3 }' "$TABELA_DE_CHAVES" | sort | uniq -d)"
      [[ -z "$dup" ]] || { printf '  [REPROVA] par destino/variavel declarado duas vezes na tabela de verdade: %s\n' "$(tr '\n' ' ' <<<"$dup")" >&2; erros=$((erros+1)); }
    fi
  else
    printf '  [REPROVA] a tabela que o portao le NAO existe em %s\n' "$TABELA_DE_CHAVES" >&2; erros=$((erros+1))
  fi

  (( erros == 0 )) || { printf '\nO PORTAO ESTA CEGO: %s isca(s) com resultado errado\n' "$erros" >&2; return 1; }
  printf '\nAUTOTESTE DA CHAVE DE SITE APROVADO\n'
  return 0
}

if [[ "${ACAO:-}" == autoteste ]]; then autoteste; exit $?; fi

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
#
# `DESTINO` so e cobrado quando esta lista NAO esta vazia, e por isso as outras
# quatro imagens continuam sendo construidas sem ele: elas nao assam nada que
# dependa de ambiente, entao exigir destino delas seria cerimonia, e cerimonia e
# o que faz operador decorar um valor qualquer para o portao calar.
ctx="${contexto#./}"; ctx="${ctx%/}"
exigidas=()
case "$ctx" in
  admin) exigidas=(VITE_CAPTCHA_SITE_KEY) ;;
esac

build_args=(--build-arg "BUILD_COMMIT=$commit" --build-arg "BUILD_TREE=$arvore")
sufixo_chave=""
for var in ${exigidas[@]+"${exigidas[@]}"}; do
  eval "valor=\${$var:-}"
  # A DECLARACAO VEM ANTES DO VALOR, e e ela que decide. `veredito_da_chave` ja
  # cobre "ausente ou vazia" (`VALOR_AUSENTE`), entao nao ha um `if` separado
  # para isso aqui: dois lugares decidindo a mesma coisa e um lugar que fica
  # atras do outro. A mensagem de como conseguir a chave desceu para o desfecho,
  # que e onde quem le o erro esta olhando.
  if ! motivo="$(veredito_da_chave "$TABELA_DE_CHAVES" "${DESTINO:-}" "$var" "$valor")"; then
    echo "::error::o contexto '$ctx' nao pode ser construido para o destino '${DESTINO:-<nenhum>}': $motivo" >&2
    echo "  A chave de SITE do destino sai do PROVEDOR, pelo nome, e nunca do \`.env\` deste repositorio (medido em 04/11/2026: o \`.env\` local nao tem \`VITE_CAPTCHA_SITE_KEY\` e a \`CAPTCHA_SITE_KEY\` dele e a de PRODUCAO). O comando esta no passo 7.2 de \`infra/roteiro-provisionamento.md\`; a declaracao por destino, em \`infra/cd/chaves-de-site-por-destino.txt\`." >&2
    exit 1
  fi
  build_args+=(--build-arg "$var")
  sufixo_chave+="-k$(impressao_de "$valor")"
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
