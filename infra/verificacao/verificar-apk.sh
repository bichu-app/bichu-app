#!/usr/bin/env sh
# Portao de compilacao do APK: a esteira passa a COMPILAR o aplicativo.
#
# POR QUE ESTE ARQUIVO EXISTE
#
# Ate 22/09/2026 a esteira rodava `flutter analyze` e `flutter test` (job `app`)
# e nada mais. Nenhum dos dois compila para Android: os dois rodam na maquina
# virtual do Dart, contra o SDK do Flutter, e passam sem tocar no Gradle, no AGP
# nem no SDK do Android. Existe uma familia inteira de defeito que nenhum dos
# dois alcanca -- a dependencia que sobe o PISO da cadeia de ferramentas.
#
# Foi o que aconteceu: a BICHUS-161 trouxe `permission_handler: ^13.0.2`, e
# `permission_handler_android` exige compilar contra a API 37. O projeto
# compilava contra a 36, e o AGP 9.1.0 nao aceita a 37. A esteira ficou VERDE, a
# suite inteira passou, e o defeito so apareceu para quem compilou -- ou seja,
# para o cliente, na hora de gerar o APK para validar no aparelho. Que e o unico
# caminho para verificar camera, splash e acessibilidade de formulario: nenhum
# simulador prova essas tres.
#
# O portao fecha a CLASSE, e nao o caso: qualquer dependencia futura que suba o
# piso do compileSdk, do AGP, do Gradle, do Kotlin ou do NDK reprova aqui, no
# commit que a trouxe, e nao semanas depois no aparelho do cliente.
#
# A CONFERENCIA DEPOIS DO BUILD, E POR QUE ELA NAO E DECORATIVA
#
# `flutter build apk` terminar com 0 nao prova que saiu um APK. Um alvo
# mal-configurado, uma etapa de empacotamento pulada ou um `--split-per-abi` mal
# entendido deixam o comando feliz e o disco sem arquivo nenhum no lugar
# esperado. Entao o portao abre o arquivo: tem que ser um zip, com manifesto,
# com `classes.dex` e com `lib/<abi>/libapp.so` -- este ultimo e o que prova que
# o Dart compilado em AOT entrou no pacote, e nao so o involucro Android.
#
# A CONFERENCIA DO VALOR DAS `--dart-define` (19/10/2026)
#
# `unzip -l` provar que `libapp.so` esta no pacote nao prova que a CONFIGURACAO
# do build entrou nele. Em 19/10/2026 isto foi MEDIDO: o script saiu `exit 0`
# com "APROVA" impresso, e a versao do app aparecia ZERO vezes nos tres
# `libapp.so` -- porque `--dart-define=APP_VERSION` nao estava no comando. O
# bloqueio por versao minima inteiro (tabela, rota, veredito, tela que nao
# fecha) ficava INERTE em silencio, porque `PortaoDeVersao` nao pergunta nada
# quando nao sabe a propria versao. Interruptor de emergencia que nao esta
# ligado em nada e pior que nao ter interruptor.
#
# Quem mede o valor e `verificar_versao_no_apk.py`, chamado no fim: ele abre
# `lib/<abi>/libapp.so` e conta os BYTES do valor, com string de controle, e
# cobra a mesma cadeia na reserva de strings do `AndroidManifest.xml`. O
# cabecalho daquele arquivo tem as medicoes e o porque de nao procurar o NOME
# da chave.
#
# Uso:
#   sh infra/verificacao/verificar-apk.sh              # compila e confere
#   sh infra/verificacao/verificar-apk.sh --autoteste  # so as iscas, sem compilar
#   sh infra/verificacao/verificar-apk.sh --conferir <apk>  # confere um APK ja pronto
#
# Saida: 0 aprovado, 1 reprovado. Rode da RAIZ do repositorio.
set -eu

APK="app/build/app/outputs/flutter-apk/app-release.apk"
PUBSPEC="app/pubspec.yaml"
MAPA="app/config/mapa.json"
CONFERIDOR_DE_VERSAO="infra/verificacao/verificar_versao_no_apk.py"

# O piso de tamanho existe para acusar arquivo truncado ou marcador vazio. Um
# APK de release do Flutter tem dezenas de megabytes (56 MB em 22/09/2026); 1 MB
# e folgado de proposito, para o portao nao virar alarme de crescimento normal.
PISO_BYTES=1048576

# As dart-define abaixo sao EXATAMENTE as que o cliente usa para gerar o APK de
# homologacao. Elas moram aqui, num lugar so, porque duas copias do comando --
# uma no workflow, outra no bolso de quem compila -- terminam divergindo, e a
# que diverge e a que ninguem percebe. Nenhuma delas e segredo: todas ja estao
# em documento versionado. Dao para sobrescrever pelo ambiente quando um alvo
# diferente precisar ser compilado.
API_BASE_URL="${API_BASE_URL:-https://hml.bichu.app}"
ENVIRONMENT="${ENVIRONMENT:-hml}"
TERMS_VERSION="${TERMS_VERSION:-2026-09-17}"
TERMS_URL="${TERMS_URL:-https://bichu.app/termos}"
PRIVACY_URL="${PRIVACY_URL:-https://bichu.app/privacidade}"
# O COMMIT QUE GEROU O BINARIO (26/10/2026). A chave e a MESMA que o
# `Dockerfile`, o `Makefile` e o `compose.yaml` ja exigem desde a BICHUS-210
# para estampar o commit nos containers: um segundo nome (`GIT_SHA`,
# `BUILD_SHA`) daria dois conceitos de "qual build e este" no mesmo produto.
#
# POR QUE ENTROU: medido em 26/10/2026, `GIT_SHA`, `GIT_COMMIT`, `BUILD_SHA` e
# `COMMIT_SHA` davam ZERO ocorrencias em `app/lib` e `APP_VERSION` era `1.0.0`
# em TODO build -- dois APKs de dias diferentes se apresentavam com o mesmo
# nome, e o cliente relatou duas vezes que trabalho pronto "nao chegou" sem
# haver como conferir qual commit estava no aparelho dele. Quem le o valor no
# Dart e `AppConfig.commitDoBuild`, e quem o PINTA e `CarimboDoBuild`, no pe
# da aba `Perfil`.
#
# `git rev-parse HEAD` e nao `--short`: o valor longo e o que nao colide, e o
# recorte de dez digitos para a tela e feito no Dart. Vazio quando nao houver
# git -- e `AppConfig` trata vazio como AUSENTE, e o carimbo DIZ na tela que o
# build nao declarou, em vez de ficar em branco.
BUILD_COMMIT="${BUILD_COMMIT:-$(git rev-parse HEAD 2>/dev/null || true)}"
# O endereco dos tiles do mapa e o User-Agent que a politica do OpenStreetMap
# pede moram em app/config/mapa.json, fora do codigo (portao de portabilidade).

# ---------------------------------------------------------------------------
# A VERSAO DO APP SAI DE `app/pubspec.yaml`, E DE MAIS NENHUM LUGAR.
#
# POR QUE DESTA FONTE, e nao de um literal digitado aqui ou num workflow.
#
# MEDIDO em 19/10/2026 neste repositorio: `--build-name` nao aparece em comando
# de build NENHUM -- nem neste script, nem no `.github/workflows/ci.yml`, nem no
# Makefile, nem nos dois README. O unico lugar onde ele e MENCIONADO e o
# comentario de `app/pubspec.yaml`. Entao o `versionName` que o Gradle estampa
# hoje vem de `flutter.versionName` (`app/android/app/build.gradle.kts:38`), que
# o Flutter preenche com o `version:` do pubspec. A fonte do `versionName` real,
# medida e nao suposta, e `app/pubspec.yaml`.
#
# Um literal escrito aqui seria uma SEGUNDA origem, e duas origens divergem no
# dia em que alguem mexer numa e nao na outra -- e o preco dessa divergencia e
# especifico: o servidor passa a decidir sobre uma versao que nao e a que esta
# no aparelho, e ou bloqueia quem esta em dia ou libera quem nao esta.
#
# `BUILD_NAME` e UMA variavel, e ela alimenta `--build-name` E
# `--dart-define=APP_VERSION` no MESMO comando. Por construcao os dois nao
# podem divergir por este caminho. E `--build-name` passa a ser EXPLICITO de
# proposito: sem ele, o define aqui e o `versionName` la seriam dois valores que
# por acaso coincidem, e nao um valor em dois lugares.
#
# Dava para sobrescrever pelo ambiente, como as cinco acima, quando um alvo
# diferente precisar ser compilado -- e o `--dart-define` acompanha, porque sai
# da mesma variavel.
# ---------------------------------------------------------------------------
if [ ! -f "$PUBSPEC" ]; then
  echo "REPROVA: nao existe $PUBSPEC. Rode da RAIZ do repositorio: sem o pubspec nao ha de onde tirar a versao, e um build sem versao desliga o bloqueio por versao minima em silencio" >&2
  exit 1
fi

# `version: 1.0.0+1` -> `1.0.0`. O que vem depois do `+` e o `versionCode`, e
# nao faz parte do `versionName`.
BUILD_NAME="${BUILD_NAME:-$(sed -n 's/^version:[[:space:]]*\([^+[:space:]][^+[:space:]]*\).*$/\1/p' "$PUBSPEC" | head -1)}"
if [ -z "$BUILD_NAME" ]; then
  echo "REPROVA: nao consegui ler \`version:\` de $PUBSPEC. Seguir daqui compilaria com \`--dart-define=APP_VERSION=\` vazio, e \`AppConfig\` trata vazio como AUSENTE -- o bloqueio por versao minima sairia desligado e o build ficaria verde" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# A conferencia. Fica numa funcao so para que o autoteste exercite EXATAMENTE a
# mesma, e nao uma reescrita parecida dela.
# ---------------------------------------------------------------------------
conferir_apk() {
  alvo="$1"

  if [ ! -f "$alvo" ]; then
    echo "REPROVA: o build terminou sem erro e nao existe arquivo em $alvo" >&2
    return 1
  fi

  # `wc -c` porque `stat` tem sintaxe diferente em BSD e em GNU, e a esteira roda
  # em Linux enquanto o desenvolvimento roda em macOS.
  bytes=$(wc -c < "$alvo" | tr -d ' ')
  if [ "$bytes" -lt "$PISO_BYTES" ]; then
    echo "REPROVA: $alvo tem $bytes bytes, abaixo do piso de $PISO_BYTES. APK truncado ou marcador vazio" >&2
    return 1
  fi

  listagem=$(unzip -l "$alvo" 2>/dev/null) || {
    echo "REPROVA: $alvo nao abre como zip. APK e um zip; o que esta ali nao e um APK" >&2
    return 1
  }

  for exigido in "AndroidManifest.xml" "classes.dex"; do
    if ! printf '%s\n' "$listagem" | grep -q "$exigido"; then
      echo "REPROVA: $alvo nao contem $exigido. O pacote nao e um APK Android completo" >&2
      return 1
    fi
  done

  # A parte que prova que o aplicativo entrou, e nao so o involucro: o Dart
  # compilado em AOT viaja em lib/<abi>/libapp.so.
  if ! printf '%s\n' "$listagem" | grep -qE "lib/[^/]+/libapp\.so"; then
    echo "REPROVA: $alvo nao contem lib/<abi>/libapp.so. O codigo Dart compilado nao entrou no pacote" >&2
    return 1
  fi

  echo "APROVA: $alvo, $bytes bytes, com manifesto, dex e libapp.so"
  return 0
}

# ---------------------------------------------------------------------------
# A CONFERENCIA DO VALOR. Fica numa funcao so pelo mesmo motivo da de cima: o
# `--conferir` e o fim do build chamam EXATAMENTE a mesma, e nao duas
# reescritas parecidas dela.
#
# A string de controle e o valor de `API_BASE_URL`. Sem ela o portao nao
# distingue "o valor nao entrou" de "a minha busca nao funciona", e a segunda
# hipotese aprova binario vazio ou reprova binario correto, as duas caladas.
# ---------------------------------------------------------------------------
conferir_versao_no_binario() {
  alvo="$1"

  command -v python3 >/dev/null 2>&1 || {
    echo "REPROVA: \`python3\` nao existe nesta maquina, e e ele que mede o valor DENTRO do binario. Portao que nao consegue conferir precisa reprovar, nunca aprovar" >&2
    return 1
  }
  [ -f "$CONFERIDOR_DE_VERSAO" ] || {
    echo "REPROVA: nao existe $CONFERIDOR_DE_VERSAO. Sem ele este script voltaria a aprovar um APK sem a versao dentro, que e o defeito medido em 19/10/2026" >&2
    return 1
  }

  # O controle sai de `$API_BASE_URL` sem o esquema, porque e a parte que
  # aparece no binario como cadeia inteira; o esquema tambem aparece, mas
  # cortar nele deixaria o controle curto demais para ser controle.
  controle=$(printf '%s' "$API_BASE_URL" | sed 's|^https\{0,1\}://||')
  if [ -z "$controle" ]; then
    echo "REPROVA: a string de controle ficou vazia a partir de API_BASE_URL='$API_BASE_URL'. Sem controle a medicao do valor nao vale nada" >&2
    return 1
  fi

  # As `--chave` sao os NOMES das seis bandeiras que o comando de build passa.
  # O portao cobra que nenhuma delas apareca DENTRO do binario como bandeira:
  # bandeira que virou valor e a marca do amontoado por variavel de shell
  # (`flutter build apk "$DEFINES"`), que foi medido em 19/10/2026 PASSANDO
  # pelas conferencias de valor, porque a versao e o controle estavam la como
  # pedacos do amontoado. As chaves de `config/mapa.json` o proprio conferidor
  # acrescenta, lendo o arquivo.
  python3 "$CONFERIDOR_DE_VERSAO" \
    --apk "$alvo" \
    --versao "$BUILD_NAME" \
    --controle "$controle" \
    --mapa "$MAPA" \
    --chave APP_VERSION \
    --chave API_BASE_URL \
    --chave ENVIRONMENT \
    --chave TERMS_VERSION \
    --chave TERMS_URL \
    --chave PRIVACY_URL \
    --chave BUILD_COMMIT
}

# ---------------------------------------------------------------------------
# O PORTAO DE LITERALIDADE DO COMANDO DE BUILD.
#
# CICATRIZ MEDIDA EM 19/10/2026: gerando APK e iOS, os seis `--dart-define`
# foram passados por uma VARIAVEL DE SHELL e o
# `--dart-define-from-file=config/mapa.json` se perdeu em SILENCIO -- build
# `exit 0`, `hml.bichu.app` presente, parametro do mapa AUSENTE. Refeito com os
# parametros LITERAIS, apareceu.
#
# A conferencia de valor acima PEGA a consequencia (ela cobra os valores de
# `config/mapa.json` dentro do binario). Este portao pega a CAUSA, no texto do
# comando, antes de gastar um build inteiro: nas linhas do comando de build,
# todo argumento tem de comecar com `--`. Uma variavel solta (`$DEFINES`) nao
# comeca com `--`, entao nao da para escrever o comando daquele jeito e passar
# por aqui.
#
# O que ele NAO proibe, de proposito: `--dart-define=CHAVE="$VALOR"`. Ali a
# variavel e o VALOR, a bandeira esta escrita, e a contagem de argumentos nao
# depende de divisao de palavras. E esse e o mecanismo de sobrescrita por
# ambiente que as seis variaveis acima documentam.
# ---------------------------------------------------------------------------
#
# OS MARCOS SAO ANCORADOS EM `^[[:space:]]*#`, e isso nao e enfeite: a primeira
# versao guardava o texto do marco numa variavel, e a LINHA DA ATRIBUICAO
# tambem casava com o marco -- o bloco comecava na propria definicao e o portao
# reprovava a si mesmo, com a mensagem errada. Foi a isca "o comando deste
# arquivo tem de passar" que pegou. Com a ancora, a linha `MARCO_INICIO=...`
# nao casa, porque ela nao comeca com `#`.
MARCO_INICIO='^[[:space:]]*# INICIO DO COMANDO DE BUILD'
MARCO_FIM='^[[:space:]]*# FIM DO COMANDO DE BUILD'

# O TEXTO dos marcos, para o autoteste MONTAR as iscas em vez de carregar os
# marcos escritos dentro de si.
#
# Isso tambem foi a isca "o comando deste arquivo tem de passar" que pegou: as
# iscas nasceram como documentos literais, com os marcos escritos neles, e os
# marcos de UMA DELAS vinham ANTES do comando de verdade neste arquivo -- entao
# `conferir_literalidade "$0"` conferia a isca do `$DEFINES`, achava o
# `$DEFINES` que ela carrega de proposito, e reprovava o script por um defeito
# que ele nao tem. Montadas assim, as unicas linhas de marco deste arquivo sao
# as do comando de verdade.
TEXTO_INICIO="# INICIO DO COMANDO DE BUILD"
TEXTO_FIM="# FIM DO COMANDO DE BUILD"

# Monta um arquivo com um comando de build de brinquedo entre os marcos. Cada
# argumento vira uma linha de continuacao.
montar_isca_de_comando() {
  destino="$1"
  shift
  {
    printf '(\n'
    printf '  %s\n' "$TEXTO_INICIO"
    printf '  cd app && flutter build apk --release \\\n'
    for argumento in "$@"; do
      printf '    %s \\\n' "$argumento"
    done
    printf '  %s\n' "$TEXTO_FIM"
    printf ')\n'
  } > "$destino"
  echo "$destino"
}

conferir_literalidade() {
  arquivo="$1"

  # `awk` e nao `sed -n '/A/,/B/p'`: o `sed` RECOMECA a faixa depois de `B` e
  # devolve TODOS os blocos marcados do arquivo. Este proprio script tem blocos
  # marcados dentro das iscas do autoteste, entao o `sed` juntava o comando de
  # verdade com a isca que carrega `$DEFINES` de proposito, e o portao reprovava
  # a si mesmo. Aqui so o PRIMEIRO par de marcos conta, e os dois tem de
  # existir -- marco de abertura sem o de fechamento leria o resto do arquivo.
  bloco=$(awk -v ini="$MARCO_INICIO" -v fim="$MARCO_FIM" '
    !vistoini && $0 ~ ini { dentro = 1; vistoini = 1; next }
    dentro && $0 ~ fim { dentro = 0; fechou = 1; next }
    dentro { print }
    END { if (!vistoini || !fechou) exit 3 }
  ' "$arquivo") || {
    echo "REPROVA: nao achei o par de marcos do comando de build em $arquivo (ou falta o de abertura, ou falta o de fechamento). Portao que nao encontra o que conferir fica verde por vazio" >&2
    return 1
  }

  # TODAS as linhas do bloco, e nao so as que terminam em `\`.
  #
  # A primeira versao disto pegava apenas as continuacoes de linha, e deixava o
  # ULTIMO argumento do comando -- hoje `--dart-define-from-file`, justamente o
  # que se perdeu na cicatriz -- fora da conferencia. Portao que nao olha a
  # linha onde o defeito aconteceu e o proprio defeito que ele diz pegar.
  #
  # Tira comentario, linha vazia, a barra de continuacao, o espaco das pontas e
  # a linha do proprio `flutter build apk`.
  lista=$(mktemp)
  printf '%s\n' "$bloco" \
    | sed 's/[[:space:]]*\\[[:space:]]*$//' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | sed '/^#/d; /^$/d; /^)$/d; /flutter build apk/d' \
    > "$lista"

  if [ ! -s "$lista" ]; then
    echo "REPROVA: o bloco do comando de build em $arquivo nao tem argumento nenhum. Ou o comando mudou de forma, ou este portao parou de enxergar -- e nos dois casos ele nao pode aprovar" >&2
    rm -f "$lista"
    return 1
  fi

  # Arquivo, e nao cano: em `sh` o `while` do lado direito de um cano roda em
  # subcasca, e `vistos` voltaria zerado -- um portao que contasse zero e
  # aprovasse. Erro barato de escrever e caro de perceber.
  vistos=0
  achou_versao=0
  problema=""
  # `set -f` porque a divisao de palavras abaixo e de proposito, e a expansao
  # de `*` nao e: um argumento com `*` viraria lista de arquivos do diretorio.
  set -f
  while IFS= read -r linha; do
    # PALAVRA por palavra, e nao linha por linha: `--foo=1 $DEFINES` na MESMA
    # linha comeca com `--` e passaria por uma conferencia de linha.
    for arg in $linha; do
      [ -n "$arg" ] || continue
      vistos=$((vistos + 1))
      case "$arg" in
        --dart-define=APP_VERSION=*) achou_versao=1 ;;
      esac
      case "$arg" in
        --*) ;;
        *)
          problema="$arg"
          break
          ;;
      esac
    done
    [ -z "$problema" ] || break
  done < "$lista"
  set +f
  rm -f "$lista"

  if [ -n "$problema" ]; then
    echo "REPROVA: o comando de build em $arquivo tem o argumento '$problema', que nao comeca com '--'. Define passado por VARIAVEL DE SHELL foi medido em 19/10/2026 perdendo o \`--dart-define-from-file\` em silencio, com o build saindo 0. Escreva as bandeiras LITERAIS" >&2
    return 1
  fi
  if [ "$vistos" -lt 2 ]; then
    echo "REPROVA: so achei $vistos argumento(s) no comando de build de $arquivo. O comando passa oito; este portao parou de enxergar e nao pode aprovar" >&2
    return 1
  fi
  if [ "$achou_versao" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--dart-define=APP_VERSION=\`. Sem ela o app nao manda a propria versao, \`PortaoDeVersao\` nao pergunta nada, e o bloqueio por versao minima fica desligado em silencio -- com o build saindo 0" >&2
    return 1
  fi

  echo "APROVA: os $vistos argumentos do comando de build sao literais, e \`--dart-define=APP_VERSION\` esta entre eles"
  return 0
}

# ---------------------------------------------------------------------------
# Autoteste. Sem ele a conferencia acima valeria pela confianca do dia em que
# foi escrita, e ficaria verde para sempre no dia em que cegasse.
#
# As iscas sao GERADAS aqui, e nao versionadas em `iscas/`, por uma razao so:
# sao binarios de megabytes, e o repositorio nao deve engordar para guardar
# lixo que se reproduz em duas linhas de shell. A geracao e deterministica.
# ---------------------------------------------------------------------------
autoteste() {
  command -v unzip >/dev/null 2>&1 || {
    echo "REPROVA: \`unzip\` nao existe nesta maquina. A conferencia do pacote nao teria como rodar, e portao que nao consegue conferir precisa reprovar, nunca aprovar" >&2
    exit 1
  }
  command -v zip >/dev/null 2>&1 || {
    echo "REPROVA: \`zip\` nao existe nesta maquina e o autoteste precisa dele para montar as iscas" >&2
    exit 1
  }

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  falhou=0

  # --- iscas que PRECISAM ser reprovadas ---------------------------------
  esperar_reprova() {
    motivo="$1"
    caminho="$2"
    if conferir_apk "$caminho" >/dev/null 2>&1; then
      echo "REPROVA: a isca '$motivo' PASSOU. A conferencia do APK parou de enxergar esta familia" >&2
      falhou=1
    else
      echo "isca reprovada como deveria: $motivo"
    fi
  }

  esperar_reprova "arquivo inexistente" "$tmp/nao-existe.apk"

  : > "$tmp/vazio.apk"
  esperar_reprova "arquivo vazio" "$tmp/vazio.apk"

  # Grande o bastante para passar do piso, e nao e zip.
  dd if=/dev/zero of="$tmp/lixo.apk" bs=1024 count=2048 status=none
  esperar_reprova "2 MB que nao sao um zip" "$tmp/lixo.apk"

  # Zip legitimo, grande o bastante, sem nada de Android dentro.
  mkdir -p "$tmp/sem-manifesto"
  dd if=/dev/zero of="$tmp/sem-manifesto/enchimento.bin" bs=1024 count=2048 status=none
  (cd "$tmp/sem-manifesto" && zip -q -0 -r "$tmp/sem-manifesto.apk" .)
  esperar_reprova "zip sem AndroidManifest.xml" "$tmp/sem-manifesto.apk"

  # Zip com manifesto e dex, mas SEM o Dart compilado. E o caso mais parecido
  # com o defeito real que ainda nao aconteceu: empacotar o involucro Android e
  # perder o aplicativo.
  mkdir -p "$tmp/sem-libapp/lib/arm64-v8a"
  echo "isca" > "$tmp/sem-libapp/AndroidManifest.xml"
  echo "isca" > "$tmp/sem-libapp/classes.dex"
  echo "isca" > "$tmp/sem-libapp/lib/arm64-v8a/libflutter.so"
  dd if=/dev/zero of="$tmp/sem-libapp/enchimento.bin" bs=1024 count=2048 status=none
  (cd "$tmp/sem-libapp" && zip -q -0 -r "$tmp/sem-libapp.apk" .)
  esperar_reprova "APK sem lib/<abi>/libapp.so" "$tmp/sem-libapp.apk"

  # --- isca que PRECISA ser aprovada -------------------------------------
  # Sem esta, uma conferencia que reprovasse tudo passaria no autoteste inteiro
  # e derrubaria a esteira para sempre, com as cinco linhas acima dizendo que
  # estava tudo certo.
  mkdir -p "$tmp/completo/lib/arm64-v8a"
  echo "isca" > "$tmp/completo/AndroidManifest.xml"
  echo "isca" > "$tmp/completo/classes.dex"
  echo "isca" > "$tmp/completo/lib/arm64-v8a/libapp.so"
  dd if=/dev/zero of="$tmp/completo/enchimento.bin" bs=1024 count=2048 status=none
  (cd "$tmp/completo" && zip -q -0 -r "$tmp/completo.apk" .)
  if conferir_apk "$tmp/completo.apk" >/dev/null 2>&1; then
    echo "isca aprovada como deveria: pacote completo"
  else
    echo "REPROVA: a isca do pacote completo foi REPROVADA. A conferencia reprova tudo, e um portao assim nao diz nada sobre o APK de verdade" >&2
    falhou=1
  fi

  # --- as iscas da CONFERENCIA DO VALOR ----------------------------------
  # Elas nao moram aqui: moram em `verificar_versao_no_apk.py --autoteste`,
  # junto da conferencia que exercitam, e sao onze -- entre elas a central
  # (APP_VERSION ausente no Dart), a da versao divergente, a do define de
  # `--dart-define-from-file` perdido, a da divergencia com o manifesto, a do
  # controle ausente (que tem de reprovar com OUTRO diagnostico) e a de uma so
  # ABI com o valor. Mais o pacote completo, que tem de PASSAR.
  #
  # Chamadas daqui, e nao soltas num alvo proprio: ate 28/09 o alvo das iscas
  # do APK existia fora dos agregadores, e o fechamento rodava o conferidor SEM
  # as iscas que impedem ele de aprovar lixo.
  echo "--- iscas da conferencia do valor da versao ---"
  if python3 "$CONFERIDOR_DE_VERSAO" --autoteste; then
    :
  else
    echo "REPROVA: as iscas de $CONFERIDOR_DE_VERSAO nao passaram. A conferencia do valor da versao nao enxerga nos dois sentidos, e sem ela este script volta a aprovar APK sem versao dentro" >&2
    falhou=1
  fi

  # --- as iscas do PORTAO DE LITERALIDADE --------------------------------
  echo "--- iscas do portao de literalidade do comando de build ---"

  # O comando DE VERDADE, deste proprio arquivo, tem de passar. Sem este caso
  # um portao que reprovasse tudo passaria no resto do autoteste.
  if conferir_literalidade "$0"; then
    echo "isca aprovada como deveria: o comando de build deste arquivo e literal"
  else
    echo "REPROVA: o comando de build DESTE arquivo nao passa no portao de literalidade" >&2
    falhou=1
  fi

  esperar_reprova_literal() {
    motivo="$1"
    caminho="$2"
    if conferir_literalidade "$caminho" >/dev/null 2>&1; then
      echo "REPROVA: a isca de literalidade '$motivo' PASSOU. O portao parou de enxergar esta familia" >&2
      falhou=1
    else
      echo "isca reprovada como deveria: $motivo"
    fi
  }

  # A CICATRIZ, escrita como ela foi escrita no dia: os defines numa variavel.
  # O `$DEFINES` vai em aspas SIMPLES, entao e texto, e nao expansao.
  montar_isca_de_comando "$tmp/por-variavel.sh" \
    '$DEFINES' \
    '--dart-define-from-file=config/mapa.json' >/dev/null
  esperar_reprova_literal "defines passados por VARIAVEL DE SHELL" "$tmp/por-variavel.sh"

  # A variavel na MESMA linha de uma bandeira: a linha comeca com `--` e
  # passaria por uma conferencia de linha em vez de palavra.
  montar_isca_de_comando "$tmp/variavel-na-mesma-linha.sh" \
    '--dart-define=APP_VERSION="$BUILD_NAME" $DEFINES' \
    '--dart-define-from-file=config/mapa.json' >/dev/null
  esperar_reprova_literal "variavel solta na MESMA linha de uma bandeira" "$tmp/variavel-na-mesma-linha.sh"

  # A variavel na ULTIMA linha, que e a que nao tem barra de continuacao: a
  # primeira versao deste portao lia so as continuacoes e deixava esta de fora.
  {
    printf '(\n  %s\n' "$TEXTO_INICIO"
    printf '  cd app && flutter build apk --release \\\n'
    printf '    --dart-define=APP_VERSION="$BUILD_NAME" \\\n'
    printf '    $DEFINES\n'
    printf '  %s\n)\n' "$TEXTO_FIM"
  } > "$tmp/variavel-na-ultima-linha.sh"
  esperar_reprova_literal "variavel solta na ULTIMA linha, sem barra de continuacao" "$tmp/variavel-na-ultima-linha.sh"

  montar_isca_de_comando "$tmp/sem-app-version.sh" \
    '--build-name="$BUILD_NAME"' \
    '--dart-define=API_BASE_URL="$API_BASE_URL"' \
    '--dart-define-from-file=config/mapa.json' >/dev/null
  esperar_reprova_literal "comando SEM --dart-define=APP_VERSION (o defeito de 19/10/2026)" "$tmp/sem-app-version.sh"

  printf '(\n  cd app && flutter build apk --release --dart-define=APP_VERSION=1.0.0\n)\n' \
    > "$tmp/sem-marcos.sh"
  esperar_reprova_literal "arquivo SEM os marcos do comando de build" "$tmp/sem-marcos.sh"

  printf '  %s\n  %s\n' "$TEXTO_INICIO" "$TEXTO_FIM" > "$tmp/bloco-vazio.sh"
  esperar_reprova_literal "bloco de comando VAZIO (verde por vazio)" "$tmp/bloco-vazio.sh"

  # Marco de abertura SEM o de fechamento: a faixa leria o resto do arquivo.
  printf '  %s\n  cd app && flutter build apk --release \\\n    --dart-define=APP_VERSION=1.0.0 \\\n' \
    "$TEXTO_INICIO" > "$tmp/sem-fechamento.sh"
  esperar_reprova_literal "marco de abertura SEM o de fechamento" "$tmp/sem-fechamento.sh"

  montar_isca_de_comando "$tmp/um-argumento.sh" \
    '--dart-define=APP_VERSION="$BUILD_NAME"' >/dev/null
  esperar_reprova_literal "comando com um argumento so (o portao parou de enxergar)" "$tmp/um-argumento.sh"

  [ "$falhou" -eq 0 ] || exit 1
  echo "autoteste: a conferencia do APK, a do valor da versao e a de literalidade enxergam nos dois sentidos"
}

# ---------------------------------------------------------------------------

if [ "${1:-}" = "--autoteste" ]; then
  autoteste
  exit 0
fi

# `--conferir <apk>`: confere um pacote JA PRONTO, sem compilar. Existe para a
# ISCA de verdade do portao de versao -- compilar sem a versao de proposito,
# apontar isto para o APK que saiu e ver a reprovacao pelo nome -- e para quem
# recebe o artefato da esteira e quer saber o que ele carrega dentro.
if [ "${1:-}" = "--conferir" ]; then
  alvo_dado="${2:-}"
  if [ -z "$alvo_dado" ]; then
    echo "REPROVA: \`--conferir\` sem caminho de APK. Sem alvo nao ha o que medir" >&2
    exit 1
  fi
  conferir_literalidade "$0"
  conferir_apk "$alvo_dado"
  conferir_versao_no_binario "$alvo_dado"
  exit 0
fi

command -v unzip >/dev/null 2>&1 || {
  echo "REPROVA: \`unzip\` nao existe nesta maquina. Sem ele o portao compilaria e nao conferiria o que saiu" >&2
  exit 1
}

# A LITERALIDADE ANTES DO BUILD, e a ordem importa pelo mesmo motivo das iscas
# antes do build no workflow: reprovar na leitura do comando custa milissegundos,
# e descobrir a mesma coisa depois custa o build inteiro.
conferir_literalidade "$0"

echo "compilando o APK de release de $ENVIRONMENT, versao $BUILD_NAME (de $PUBSPEC)..."

# O `cd app` e o mesmo do comando do cliente. `rm` antes para que um APK de uma
# execucao anterior nao seja confundido com o desta: o portao conferiria um
# arquivo velho e aprovaria um build que nao produziu nada.
rm -f "$APK"

(
  # INICIO DO COMANDO DE BUILD (o portao de literalidade le entre os marcos; nao
  # mova nem renomeie estes comentarios sem ler `conferir_literalidade`)
  cd app && flutter build apk --release \
    --build-name="$BUILD_NAME" \
    --dart-define=APP_VERSION="$BUILD_NAME" \
    --dart-define=API_BASE_URL="$API_BASE_URL" \
    --dart-define=ENVIRONMENT="$ENVIRONMENT" \
    --dart-define=TERMS_VERSION="$TERMS_VERSION" \
    --dart-define=TERMS_URL="$TERMS_URL" \
    --dart-define=PRIVACY_URL="$PRIVACY_URL" \
    --dart-define=BUILD_COMMIT="$BUILD_COMMIT" \
    --dart-define-from-file=config/mapa.json
  # FIM DO COMANDO DE BUILD
) || {
  echo "REPROVA: \`flutter build apk --release\` falhou. Leia o erro acima: se ele fala de compileSdk, de AAR metadata ou de versao de AGP, alguma dependencia subiu o piso da cadeia de ferramentas e o projeto ficou para tras" >&2
  exit 1
}

conferir_apk "$APK"

# A ULTIMA PALAVRA E A DO VALOR, e nao a do envelope. `conferir_apk` acima
# aprova o pacote; esta linha e a que diz se a CONFIGURACAO do build entrou
# nele. Em 19/10/2026 o script terminava na linha de cima, com `exit 0`, e o
# APK saia sem a versao -- com o mecanismo de bloqueio desligado em silencio.
conferir_versao_no_binario "$APK"
