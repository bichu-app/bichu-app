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
#   sh infra/verificacao/verificar-apk.sh --imprimir-versao-dos-termos
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
#
# A EXCECAO E `API_BASE_URL`, E ELA TEM DUAS VARIAVEIS DESDE 03/11/2026.
#
# A ARMADILHA, medida no banco de dados do `make` naquele dia:
#
#   make -pn | grep '^API_BASE_URL'                  -> http://localhost:<porta>
#   API_BASE_URL=... make -pn | grep '^API_BASE_URL'  -> http://localhost:<porta>
#   make -pn API_BASE_URL=... | grep '^API_BASE_URL'  -> o valor passado
#
# A PORTA NAO E FIXA, E ISSO REFORCA O CONSERTO. Ela vem de `portas.local.mk`,
# gerado por `infra/escolher-portas.py`, e muda por maquina E por worktree --
# MEDIDO em 03/11/2026, na mesma maquina e no mesmo dia: `3200` num worktree e
# `3400` noutro. Um controle positivo tirado dessa variavel nao e so
# autoaprovacao: ele concorda com um valor que nem e estavel entre duas copias
# do mesmo repositorio.
#
# O `Makefile` atribui com `:=`, entao o AMBIENTE NAO SOBREPOE e so a LINHA DE
# COMANDO vence. Quem compilava sem `API_BASE_URL=` ali gerava um APK apontado
# para a propria maquina -- e ESTE PORTAO O APROVAVA, porque montava a cadeia
# de CONTROLE POSITIVO a partir de `$API_BASE_URL`, a MESMA variavel que o
# build usara: o controle virava `localhost:<porta>`, era achado no `libapp.so` e
# tudo passava. Controle que sai do valor medido nao e controle: e
# autoaprovacao. Houve APK entregue assim.
#
# `API_BASE_URL_ESPERADO` e o destino que se ESPERA no binario, e e dele que
# sai o controle positivo. `API_BASE_URL` e o que o build vai usar.
#
# Para compilar DELIBERADAMENTE para outro destino, declare os DOIS:
#
#   API_BASE_URL_ESPERADO=https://outro.exemplo \
#   API_BASE_URL=https://outro.exemplo \
#     sh infra/verificacao/verificar-apk.sh
#
# Duas declaracoes para um desvio e de proposito: o desvio fica escrito, e nao
# herdado em silencio de quem exportou uma variavel tres comandos atras.
API_BASE_URL_ESPERADO="${API_BASE_URL_ESPERADO:-https://hml.bichu.app}"
API_BASE_URL="${API_BASE_URL:-$API_BASE_URL_ESPERADO}"

# O CONTROLE NEGATIVO. Um endereco INVENTADO, que nao pode existir em binario
# nenhum deste repositorio, e que o conferidor passou a EXIGIR em 03/11/2026.
#
# Ele nao existia neste portao, e a falta era real: sem ele a hipotese "a minha
# busca casa qualquer coisa" nunca foi medida aqui -- e e ela que invalidaria
# todo achado de PRESENCA, inclusive o de endereco proibido que entrou agora.
# Nao e um endereco de producao de verdade justamente para que ninguem o
# "conserte" apontando para um host real.
CONTROLE_NEGATIVO="${CONTROLE_NEGATIVO:-api-de-producao-que-nunca-existiu.bichu.invalido}"
ENVIRONMENT="${ENVIRONMENT:-hml}"
# A VERSAO DOS TERMOS NAO E ESCRITA AQUI, E ISSO NAO E ARRUMACAO.
#
# CICATRIZ MEDIDA EM 01/11/2026. Esta linha era
# `TERMS_VERSION="${TERMS_VERSION:-2026-09-17}"` -- um literal. O site publicava
# outro: `'Versão 0.3 de 23/09/2026'`, em `web/src/conteudo/legal.ts`. **17/09
# contra 23/09**, dois literais em dois arquivos, mantidos iguais por
# coincidencia e ja divergidos.
#
# Isto NAO e cosmetico. Este valor vai em `accepted_terms_version` no cadastro
# (`app/lib/api/auth_api.dart` -> `POST /v1/auth/register` -> coluna
# `users.accepted_terms_version`, migracao `20260917000001`), ou seja: o
# consentimento gravado no banco apontava para uma versao que NUNCA esteve no
# ar. `2026-09-17` e a data em que os ADR-0001..0013 foram escritos, e nao a de
# nenhum texto legal publicado.
#
# E nao era so no texto deste script. MEDIDO no APK de homologacao
# `bichu-hml-d03d1a6c-31-10.apk`: `2026-09-17` aparece 1x em cada um dos tres
# `lib/<abi>/libapp.so`, com a string de controle `hml.bichu.app` presente. O
# binario distribuido carregava o valor errado.
#
# POR QUE A FONTE E O SITE: o aplicativo nao carrega copia do texto legal -- ele
# manda o usuario ler no site, pelas `TERMS_URL` e `PRIVACY_URL` logo abaixo.
# Quem publica o texto aceito e o site, entao a versao e identidade do que o
# site publica, e este build e um CONSUMIDOR dela.
#
# A sobrescrita por ambiente continua existindo (um alvo diferente pode precisar
# dela), e por isso ela NAO e silenciosa: `conferir_versao_dos_termos` abaixo
# roda antes do build e reprova quando o valor resolvido aqui nao e o que o site
# publica -- nomeando os dois.
FONTE_DA_VERSAO_LEGAL="web/src/conteudo/versao-legal.json"
PORTAO_DA_VERSAO_LEGAL="infra/verificacao/verificar-versao-dos-termos.mjs"
if [ -n "${TERMS_VERSION:-}" ]; then
  # Veio do ambiente. Fica, e o portao decide se podia.
  :
else
  [ -f "$FONTE_DA_VERSAO_LEGAL" ] || {
    echo "REPROVA: nao existe $FONTE_DA_VERSAO_LEGAL, que e a FONTE UNICA da versao dos termos. Sem ela este script voltaria a inventar um literal, que e o defeito medido em 01/11/2026" >&2
    exit 1
  }
  # `python3` e nao `grep`/`sed`: o arquivo e JSON, e ja ha dependencia dura de
  # python3 aqui (`verificar_versao_no_apk.py`). Reconhecer JSON por expressao
  # regular e como o portao volta a aprovar lixo.
  TERMS_VERSION=$(python3 -c 'import json, sys; d = json.load(open(sys.argv[1], encoding="utf-8")); v = d.get("publicadaEm"); sys.stdout.write(v if isinstance(v, str) else "")' "$FONTE_DA_VERSAO_LEGAL") || {
    echo "REPROVA: nao consegui ler \`publicadaEm\` de $FONTE_DA_VERSAO_LEGAL. Enquanto esse valor nao sai de um lugar so, o aceite grava uma versao e o site publica outra" >&2
    exit 1
  }
  # `$(...)` ESCONDE o estado de saida quando usado dentro de `${VAR:-...}`, e
  # por isso a leitura esta num `if` e nao numa expansao: valor vazio aqui
  # viraria `accepted_terms_version` vazio, e o portao do binario procuraria a
  # cadeia vazia -- que esta em qualquer binario, e aprovaria sempre.
  [ -n "$TERMS_VERSION" ] || {
    echo "REPROVA: \`publicadaEm\` de $FONTE_DA_VERSAO_LEGAL veio VAZIO. O aceite seria gravado sem versao, e a conferencia do valor no binario aprovaria qualquer pacote" >&2
    exit 1
  }
fi
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
# O NUMERO DO BUILD (`versionCode`), E A REGRESSAO MEDIDA EM 04/11/2026.
#
# O QUE ACONTECEU, medido com `aapt2 dump badging` nos quatro APKs entregues:
#
#   bichu-hml-46d0587c.apk              28/10 14:54   versionCode=1
#   bichu-hml-arm64-675c516c.apk        28/10 21:14   versionCode=2001
#   bichu-hml-arm64-0399da80.apk        29/10 08:02   versionCode=2001
#   bichu-hml-72372d32-app-release.apk  04/11 06:07   versionCode=1
#
# Os `2001` sairam de alguem passando o numero A MAO em 28/10. O `pubspec`
# declarava `1.0.0+1`, entao TODO build que nao recebeu numero saiu com
# `versionCode=1` -- e o APK de 04/11 e um deles. O cliente tem o de 29/10
# (2001) instalado: o Android RECUSA o de 04/11 com
# `INSTALL_FAILED_VERSION_DOWNGRADE`, e a unica saida passaria a ser
# desinstalar, perdendo a sessao e os dados locais dele.
#
# E ESTE PORTAO APROVOU AQUELE ARTEFATO. Ele conferia endereco, versao do Dart
# e literalidade -- tres coisas que estavam CERTAS -- e nao conferia a unica que
# decide se o pacote INSTALA por cima.
#
# POR QUE O NUMERO NAO PODIA SER PEDIDO: ate 04/11 o comando de build deste
# script nao passava `--build-number` e este arquivo nao lia `BUILD_NUMBER`
# nenhum. Pedir um numero maior exigia EDITAR o comando literal do portao --
# que e exatamente a forma de mexer que o portao de literalidade existe para
# tornar visivel. Entao ninguem pedia, e o numero era o do `pubspec`.
#
# SAO DUAS VARIAVEIS, pela MESMA razao que `API_BASE_URL` tem duas desde
# 03/11/2026 (PR #161, commit 9f8cb3b3fadb): `BUILD_NUMBER_ESPERADO` e o numero
# que se ESPERA dentro do pacote, e e com ele que o valor lido pelo `aapt2` e
# comparado; `BUILD_NUMBER` e o que o build vai usar. Tirar a expectativa da
# MESMA variavel que o build consumiu e comparar o valor com ele mesmo, e isso
# aprova qualquer coisa -- foi literalmente o defeito do `API_BASE_URL`.
#
# O PADRAO SAI DO `pubspec`, e so ele: e a mesma fonte do `versionName`, e e o
# que o Gradle estampa quando ninguem pede nada (`flutter.versionCode`, em
# app/android/app/build.gradle.kts:37).
#
# Para pedir um numero DELIBERADAMENTE:
#
#   BUILD_NUMBER_ESPERADO=2002 BUILD_NUMBER=2002 \
#     sh infra/verificacao/verificar-apk.sh
#
# Por `make`, que e o caminho do dia a dia:
#
#   make apk API_BASE_URL=https://hml.bichu.app BUILD_NUMBER=2002
#
# Na LINHA DE COMANDO, e nao no ambiente: o `Makefile` atribui com `:=`, e o
# ambiente NAO sobrepoe -- o alvo `apk` recusa valor que chegue por ambiente,
# em vez de ignora-lo em silencio.
# ---------------------------------------------------------------------------
# `version: 1.0.0+2002` -> `2002`. O que vem ANTES do `+` e o `versionName`, e
# quem le aquele pedaco e o `BUILD_NAME` logo acima.
BUILD_NUMBER_ESPERADO="${BUILD_NUMBER_ESPERADO:-$(sed -n 's/^version:[[:space:]]*[^+[:space:]]\{1,\}+\([0-9]\{1,\}\)[[:space:]]*$/\1/p' "$PUBSPEC" | head -1)}"
BUILD_NUMBER="${BUILD_NUMBER:-$BUILD_NUMBER_ESPERADO}"

for par in "BUILD_NUMBER_ESPERADO=$BUILD_NUMBER_ESPERADO" "BUILD_NUMBER=$BUILD_NUMBER"; do
  nome=${par%%=*}
  valor=${par#*=}
  if [ -z "$valor" ]; then
    echo "REPROVA: \`$nome\` ficou VAZIO. Nao achei \`version: <nome>+<numero>\` em $PUBSPEC e ninguem declarou o numero. Seguir daqui compilaria com o \`versionCode\` que o Gradle inventar, e foi um desses que o cliente nao consegue instalar" >&2
    exit 1
  fi
  case "$valor" in
    *[!0-9]*)
      echo "REPROVA: \`$nome=$valor\` nao e um inteiro. O \`versionCode\` do Android e inteiro, e valor nao numerico aqui viraria build com numero que ninguem pediu" >&2
      exit 1
      ;;
  esac
  if [ "$valor" -le 0 ]; then
    echo "REPROVA: \`$nome=$valor\` nao e positivo. \`versionCode\` comeca em 1" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# O QUE E "O ULTIMO APK ENTREGUE", E POR QUE ELE MORA NUM REGISTRO VERSIONADO.
#
# A regra nova e: o `versionCode` do artefato novo tem de ser MAIOR que o do
# ultimo APK entregue. Para cobra-la, o portao precisa saber qual e aquele
# numero -- e ele nao pode sair do `pubspec`, por tudo que esta escrito acima.
#
# A FONTE E UM REGISTRO VERSIONADO cujo numero so entra MEDIDO de dentro de um
# APK, por `--registrar-entrega <apk>`. Duas razoes:
#
#   1. a pasta de entregas (`workspace/artefatos-app*`) NAO esta no git, nao
#      existe na esteira e nem no worktree de quem compila -- uma fonte que nao
#      existe nos lugares onde o portao roda e uma fonte que nao reprova nada;
#   2. numero DIGITADO a mao e a origem do 2001. O subcomando mede com
#      `aapt2 dump badging` e escreve o que mediu, com o nome do arquivo que
#      mediu ao lado.
#
# E O DIRETORIO DE ENTREGAS AINDA CONTA, quando declarado: `ENTREGUES_EM=<dir>`
# faz o portao MEDIR todo `*.apk` de la e levar o MAIOR para a linha de base.
# Assim a realidade do disco nao fica abaixo do registro, e um registro
# atrasado e ANUNCIADO em vez de silenciosamente obedecido.
#
# AUSENCIA NAO E APROVACAO, e os desfechos sao SEPARADOS de proposito -- cada
# um com uma etiqueta propria entre colchetes, e o autoteste cobra as
# etiquetas. Esse colapso ja aconteceu nesta esteira no portao de contrato, em
# que "a base nao existe" e "o arquivo nao existe na base" davam o mesmo
# `exit 0`:
#
#   [registro-ausente]       o registro nao esta no disco            -> REPROVA
#   [registro-ilegivel]      esta la e nao da um inteiro             -> REPROVA
#   [sem-diretorio]          ninguem declarou ENTREGUES_EM           -> segue, DITO
#   [diretorio-inexistente]  declarou e o diretorio nao existe       -> REPROVA
#   [diretorio-vazio]        declarou, existe e nao tem APK          -> segue, DITO
#   [registro-atrasado]      ha APK no disco acima do registro       -> segue, DITO
# ---------------------------------------------------------------------------
REGISTRO_DA_ENTREGA="${REGISTRO_DA_ENTREGA:-infra/verificacao/versioncode-entregue.json}"
ENTREGUES_EM="${ENTREGUES_EM:-}"
# Preenchidas por `resolver_linha_de_base`. Comecam VAZIAS, e nao em zero: zero
# seria uma linha de base que aprova qualquer coisa, e a diferenca entre "nao
# resolvi" e "resolvi e deu zero" e precisamente o que nao pode se perder.
BASE_VERSIONCODE=""
BASE_DE=""

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

  # O controle sai de `$API_BASE_URL_ESPERADO` sem o esquema -- do valor
  # ESPERADO, e NUNCA do valor que o build usou. Essa troca de uma variavel
  # pela outra e metade do conserto da armadilha descrita no alto do arquivo:
  # tirada do valor medido, a cadeia de controle concorda com qualquer coisa,
  # `localhost` incluido.
  #
  # A outra metade sao os `--proibido` abaixo, escritos LITERAIS pela cicatriz
  # de 19/10/2026: lista de bandeiras guardada em variavel de shell e expandida
  # sem aspas e justamente a forma de perder argumento em silencio.
  controle=$(printf '%s' "$API_BASE_URL_ESPERADO" | sed 's|^https\{0,1\}://||')
  if [ -z "$controle" ]; then
    echo "REPROVA: a string de controle ficou vazia a partir de API_BASE_URL_ESPERADO='$API_BASE_URL_ESPERADO'. Sem controle a medicao do valor nao vale nada" >&2
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
    --valor-dos-termos "$TERMS_VERSION" \
    --chave APP_VERSION \
    --chave API_BASE_URL \
    --chave ENVIRONMENT \
    --chave TERMS_VERSION \
    --chave TERMS_URL \
    --chave PRIVACY_URL \
    --chave BUILD_COMMIT \
    --controle-negativo "$CONTROLE_NEGATIVO" \
    --proibido 'http://localhost' \
    --proibido 'https://localhost' \
    --proibido 'http://127.0.0.1' \
    --proibido 'https://127.0.0.1' \
    --proibido 'http://0.0.0.0'
}

# ---------------------------------------------------------------------------
# O DESTINO DO BUILD. Reprova quando o valor que o build VAI usar divergir do
# ESPERADO declarado.
#
# So no caminho de build, e nunca em `--conferir`: ali o pacote foi produzido
# por outro comando, e comparar o `API_BASE_URL` DESTE processo com qualquer
# coisa nao diria nada sobre aquele arquivo. Quem cobra o `--conferir` e o
# `--proibido`, que mede o binario.
# ---------------------------------------------------------------------------
conferir_destino_do_build() {
  if [ "$API_BASE_URL" = "$API_BASE_URL_ESPERADO" ]; then
    echo "APROVA: o build vai apontar para '$API_BASE_URL', que e o destino ESPERADO declarado"
    return 0
  fi
  echo "REPROVA: o build ia apontar para API_BASE_URL='$API_BASE_URL', e o destino ESPERADO declarado e API_BASE_URL_ESPERADO='$API_BASE_URL_ESPERADO'." >&2
  echo "  Se isto veio de \`make\` sem \`API_BASE_URL=\` na LINHA DE COMANDO, o valor e o \`http://localhost:<porta>\` do proprio Makefile: ele atribui com \`:=\`, e o ambiente NAO sobrepoe. Rode \`make apk API_BASE_URL=https://hml.bichu.app\`." >&2
  echo "  Se o desvio for DELIBERADO, declare os dois: \`API_BASE_URL_ESPERADO=<destino> API_BASE_URL=<destino>\`. Duas declaracoes para um desvio e de proposito -- o desvio fica escrito." >&2
  return 1
}

# ---------------------------------------------------------------------------
# O `aapt2`: QUEM LE O `versionCode` DE DENTRO DO PACOTE.
#
# `versionCode` vive no `AndroidManifest.xml` BINARIO dentro do APK, e e o
# unico numero que o Android compara na hora de instalar por cima. Numero
# passado em `--build-number` NAO aparece no `pubspec`: quem olhasse o `pubspec`
# em 28/10 leria `+1` e concluiria que o APK daquele dia tinha 1 -- ele tinha
# 2001. Por isso a medida sai do BINARIO, sempre.
#
# O `aapt2` nao esta no PATH por padrao: ele mora no SDK do Android. A busca
# cobre o PATH, as duas variaveis do SDK, o `sdk.dir` que o PROPRIO build do
# projeto le (`app/android/local.properties`) e os dois caminhos padrao de
# macOS e de Linux. Na esteira ele vem de `build-tools;37.0.0`, instalado pelo
# job `apk`. Nao achar e REPROVA, e nunca "pula a conferencia".
# ---------------------------------------------------------------------------
AAPT2_ACHADO=""
achar_aapt2() {
  if [ -n "$AAPT2_ACHADO" ]; then
    printf '%s' "$AAPT2_ACHADO"
    return 0
  fi
  if command -v aapt2 >/dev/null 2>&1; then
    AAPT2_ACHADO=$(command -v aapt2)
    printf '%s' "$AAPT2_ACHADO"
    return 0
  fi
  sdk_do_projeto=$(sed -n 's/^sdk\.dir=//p' app/android/local.properties 2>/dev/null | head -1 || true)
  for raiz in "${ANDROID_SDK_ROOT:-}" "${ANDROID_HOME:-}" "$sdk_do_projeto" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$raiz" ] || continue
    # A MAIOR versao de build-tools, e nao a primeira que a expansao devolver:
    # `sort -V` ordena por numero, e `37.0.0` vem depois de `36.1.0` (ordem
    # alfabetica tambem acertaria aqui, e erraria no dia em que houver `9.x`).
    candidato=$(ls -1 "$raiz"/build-tools/*/aapt2 2>/dev/null | sort -V | tail -1 || true)
    if [ -n "$candidato" ] && [ -x "$candidato" ]; then
      AAPT2_ACHADO="$candidato"
      printf '%s' "$AAPT2_ACHADO"
      return 0
    fi
  done
  return 1
}

# Imprime o `versionCode` do pacote, ou REPROVA dizendo QUAL dos tres jeitos de
# nao conseguir medir aconteceu.
medir_versioncode() {
  arquivo="$1"

  aapt=$(achar_aapt2) || {
    echo "REPROVA [aapt2-ausente]: nao achei \`aapt2\` (PATH, ANDROID_SDK_ROOT, ANDROID_HOME, o \`sdk.dir\` de app/android/local.properties, ~/Library/Android/sdk, ~/Android/Sdk). E ele que le o \`versionCode\` DENTRO do pacote; sem ele este portao nao sabe se o APK instala por cima do que o cliente ja tem, e portao que nao consegue medir nao pode aprovar" >&2
    return 1
  }
  if [ ! -f "$arquivo" ]; then
    echo "REPROVA [apk-ausente]: nao existe $arquivo, e nao ha versionCode para medir" >&2
    return 1
  fi

  # SEM CANO, para que o estado de saida seja o do `aapt2`: `cmd | head` devolve
  # o `$?` do `head`. MEDIDO nesta maquina em 04/11/2026 --
  # `aapt2 dump badging <zip qualquer> | head -1` sai 0 imprimindo `error:`.
  saida=$("$aapt" dump badging "$arquivo" 2>&1) || {
    echo "REPROVA [badging-falhou]: \`aapt2 dump badging $arquivo\` falhou -- o arquivo nao e um APK legivel. O que o aapt2 disse:" >&2
    printf '%s\n' "$saida" | sed 's/^/    /' >&2
    return 1
  }

  numero=$(printf '%s\n' "$saida" | sed -n "s/^package:.*versionCode='\([0-9]\{1,\}\)'.*/\1/p" | head -1)
  if [ -z "$numero" ]; then
    echo "REPROVA [sem-versioncode]: $arquivo nao declara \`versionCode\` no manifesto -- o aapt2 imprimiu \`versionCode=''\` ou nao imprimiu a linha \`package:\`. Pacote sem versionCode nao tem como ser comparado com o que esta no aparelho" >&2
    return 1
  fi
  printf '%s' "$numero"
}

# Le o inteiro do registro versionado. `python3` e nao `grep`: o arquivo e JSON,
# e reconhecer JSON por expressao regular e como o portao volta a aprovar lixo.
ler_registro_da_entrega() {
  python3 - "$REGISTRO_DA_ENTREGA" <<'PYREGISTRO'
import json
import sys

caminho = sys.argv[1]
try:
    dados = json.load(open(caminho, encoding='utf-8'))
except Exception as erro:
    print("  %s nao e JSON valido: %s" % (caminho, erro), file=sys.stderr)
    sys.exit(1)
if not isinstance(dados, dict):
    print("  %s nao tem um objeto no topo" % caminho, file=sys.stderr)
    sys.exit(1)
valor = dados.get('versionCode')
if isinstance(valor, bool) or not isinstance(valor, int) or valor < 0:
    print("  `versionCode` de %s esta ausente ou nao e um inteiro >= 0 (li %r)"
          % (caminho, valor), file=sys.stderr)
    sys.exit(1)
sys.stdout.write(str(valor))
PYREGISTRO
}

# ---------------------------------------------------------------------------
# A LINHA DE BASE. Preenche `BASE_VERSIONCODE` e `BASE_DE`, ou REPROVA.
#
# Cada desfecho tem etiqueta propria, e o autoteste cobra a etiqueta -- e ela,
# e nao a boa intencao, que impede "nao achei a base" de virar "aprovado".
# ---------------------------------------------------------------------------
resolver_linha_de_base() {
  BASE_VERSIONCODE=""
  BASE_DE=""

  command -v python3 >/dev/null 2>&1 || {
    echo "REPROVA: \`python3\` nao existe nesta maquina, e e ele que le o registro da ultima entrega" >&2
    return 1
  }
  if [ ! -f "$REGISTRO_DA_ENTREGA" ]; then
    echo "REPROVA [registro-ausente]: nao existe $REGISTRO_DA_ENTREGA, que e o registro do \`versionCode\` do ULTIMO APK ENTREGUE." >&2
    echo "  Isto NAO e o mesmo que \"nao houve entrega anterior\", e nao pode virar aprovacao: sem a base, um APK que regride instala-se como se estivesse tudo bem -- e foi assim que o artefato de 04/11/2026 (versionCode=1) passou por este portao com 2001 no aparelho do cliente." >&2
    echo "  Se o APK que voce esta compilando e DE FATO o primeiro, crie o registro com o numero que o antecede, MEDIDO de um APK:" >&2
    echo "      sh infra/verificacao/verificar-apk.sh --registrar-entrega <apk ja entregue>" >&2
    return 1
  fi
  valor_do_registro=$(ler_registro_da_entrega) || {
    echo "REPROVA [registro-ilegivel]: $REGISTRO_DA_ENTREGA existe e nao da um inteiro (motivo acima). Registro que nao se le e pior que registro ausente, porque parece presente" >&2
    return 1
  }
  BASE_VERSIONCODE="$valor_do_registro"
  BASE_DE="o registro $REGISTRO_DA_ENTREGA"
  echo "linha de base: versionCode=$BASE_VERSIONCODE, de $BASE_DE"

  # O REFORCO PELO DISCO. Opcional, e quando declarado ele MEDE.
  if [ -z "$ENTREGUES_EM" ]; then
    echo "  [sem-diretorio] ninguem declarou \`ENTREGUES_EM=<dir>\`, entao a base vem SO do registro. Para medir tambem os APKs ja entregues no disco: ENTREGUES_EM=../artefatos-app"
    return 0
  fi
  if [ ! -d "$ENTREGUES_EM" ]; then
    echo "REPROVA [diretorio-inexistente]: \`ENTREGUES_EM=$ENTREGUES_EM\` foi DECLARADO e nao e um diretorio. Declaracao que nao resolve em nada e pedido de medicao que nao aconteceu, e aqui ela reprova em vez de ser ignorada" >&2
    return 1
  fi

  achados=0
  maior="$BASE_VERSIONCODE"
  maior_de="$BASE_DE"
  for apk_entregue in "$ENTREGUES_EM"/*.apk; do
    [ -f "$apk_entregue" ] || continue
    achados=$((achados + 1))
    numero_entregue=$(medir_versioncode "$apk_entregue") || return 1
    echo "  medido no disco: $apk_entregue -> versionCode=$numero_entregue"
    if [ "$numero_entregue" -gt "$maior" ]; then
      maior="$numero_entregue"
      maior_de="o APK $apk_entregue, medido com aapt2"
    fi
  done

  if [ "$achados" -eq 0 ]; then
    echo "  [diretorio-vazio] \`ENTREGUES_EM=$ENTREGUES_EM\` existe e nao tem nenhum \`*.apk\`. A base continua sendo a do registro ($BASE_VERSIONCODE), e isto esta DITO em vez de passar como se o disco concordasse"
    return 0
  fi
  if [ "$maior" -gt "$BASE_VERSIONCODE" ]; then
    echo "  [registro-atrasado] o disco tem versionCode=$maior, acima do registro ($BASE_VERSIONCODE). A base passa a ser $maior -- e o registro precisa ser atualizado com \`--registrar-entrega\`, porque e ele que a esteira le"
    BASE_VERSIONCODE="$maior"
    BASE_DE="$maior_de"
  else
    echo "  o disco ($achados APK) nao passa do registro: base segue $BASE_VERSIONCODE"
  fi
  return 0
}

# ---------------------------------------------------------------------------
# O NUMERO PEDIDO, ANTES DE GASTAR UM BUILD.
#
# Duas conferencias de TEXTO, na ordem em que custam menos: o numero que o build
# vai usar tem de ser o DECLARADO como esperado, e o declarado tem de passar da
# linha de base. Descobrir a segunda depois do build custa o build inteiro --
# 40 minutos na esteira, e um artefato que ninguem pode instalar.
# ---------------------------------------------------------------------------
conferir_numero_do_build() {
  if [ "$BUILD_NUMBER" = "$BUILD_NUMBER_ESPERADO" ]; then
    echo "APROVA: o build vai pedir versionCode=$BUILD_NUMBER, que e o numero ESPERADO declarado"
    return 0
  fi
  echo "REPROVA [numero-divergente]: o build ia pedir BUILD_NUMBER=$BUILD_NUMBER, e o ESPERADO declarado e BUILD_NUMBER_ESPERADO=$BUILD_NUMBER_ESPERADO." >&2
  echo "  A expectativa e o que este portao vai COBRAR dentro do pacote, e ela nao pode sair da mesma variavel que o build usou -- tirada de la, a conferencia compara o valor com ele mesmo e aprova qualquer coisa (foi o defeito do \`API_BASE_URL\`, fechado no PR #161)." >&2
  echo "  Se o desvio for DELIBERADO, declare os dois: \`BUILD_NUMBER_ESPERADO=<n> BUILD_NUMBER=<n>\`. Duas declaracoes para um desvio e de proposito -- o desvio fica escrito." >&2
  return 1
}

conferir_numero_pedido_contra_a_base() {
  if [ -z "$BASE_VERSIONCODE" ]; then
    echo "REPROVA: \`resolver_linha_de_base\` nao foi chamada antes desta conferencia. Comparar com uma base vazia e o jeito de aprovar tudo" >&2
    return 1
  fi
  if [ "$BUILD_NUMBER_ESPERADO" -gt "$BASE_VERSIONCODE" ]; then
    echo "APROVA: o numero pedido ($BUILD_NUMBER_ESPERADO) passa da linha de base ($BASE_VERSIONCODE)"
    return 0
  fi
  echo "REPROVA [regressao-pedida]: o build ia pedir versionCode=$BUILD_NUMBER_ESPERADO, e o ultimo APK entregue tem $BASE_VERSIONCODE ($BASE_DE)." >&2
  echo "  O Android recusa instalar por cima com \`INSTALL_FAILED_VERSION_DOWNGRADE\`, e a unica saida do cliente passaria a ser DESINSTALAR o aplicativo -- perdendo a sessao e os dados locais dele. Numero IGUAL tambem reprova aqui: dois artefatos diferentes com o mesmo numero nao se distinguem no aparelho." >&2
  echo "  Peca um numero maior: \`make apk API_BASE_URL=<destino> BUILD_NUMBER=$((BASE_VERSIONCODE + 1))\`" >&2
  echo "  Se o numero padrao vem do \`pubspec\` e ele ficou para tras, suba o \`+N\` de $PUBSPEC -- o \`1.0.0\` do produto NAO muda nisso, quem muda e o numero depois do \`+\`." >&2
  return 1
}

# ---------------------------------------------------------------------------
# A CONFERENCIA DO `versionCode` DENTRO DO PACOTE. Duas perguntas, e as duas
# sobre o BINARIO:
#
#   1. o numero que entrou e o que foi PEDIDO? (bandeira perdida em silencio --
#      a familia do `--dart-define-from-file` de 19/10/2026);
#   2. ele passa do ultimo entregue? (a regressao de 04/11/2026).
# ---------------------------------------------------------------------------
conferir_versioncode_no_apk() {
  alvo="$1"

  medido=$(medir_versioncode "$alvo") || return 1

  if [ "$medido" != "$BUILD_NUMBER_ESPERADO" ]; then
    echo "REPROVA [valor-divergente]: $alvo tem versionCode=$medido DENTRO do pacote, e o numero esperado e $BUILD_NUMBER_ESPERADO." >&2
    echo "  Ou o \`--build-number\` se perdeu no caminho -- e bandeira que se perde em silencio ja aconteceu aqui em 19/10/2026 --, ou este pacote nao e o desta execucao." >&2
    return 1
  fi
  echo "APROVA: $alvo tem versionCode=$medido dentro do pacote, igual ao pedido (medido com aapt2 dump badging, nao deduzido do comando)"

  if [ -z "$BASE_VERSIONCODE" ]; then
    echo "REPROVA: \`resolver_linha_de_base\` nao foi chamada antes desta conferencia. Comparar com uma base vazia e o jeito de aprovar tudo" >&2
    return 1
  fi
  if [ "$medido" -gt "$BASE_VERSIONCODE" ]; then
    echo "APROVA: versionCode=$medido passa do ultimo APK entregue ($BASE_VERSIONCODE, de $BASE_DE), entao ele instala por cima do que esta no aparelho"
    return 0
  fi
  echo "REPROVA [regressao-de-versioncode]: $alvo tem versionCode=$medido, e o ultimo APK entregue tem $BASE_VERSIONCODE ($BASE_DE)." >&2
  echo "  Instalar este pacote por cima falha com \`INSTALL_FAILED_VERSION_DOWNGRADE\`, e sair dessa exige DESINSTALAR o aplicativo do aparelho do cliente -- com a sessao e os dados locais dele. Numero IGUAL tambem reprova: dois artefatos diferentes com o mesmo numero nao se distinguem no aparelho." >&2
  return 1
}

# ---------------------------------------------------------------------------
# AS ISCAS SAO APKs DE VERDADE, montados com `aapt2 link`.
#
# Um numero de brinquedo comparado num `if` provaria a aritmetica e nada mais.
# O que precisa ser provado e a LEITURA: `aapt2 link` monta, de um manifesto de
# texto, um pacote com `AndroidManifest.xml` BINARIO -- 700 bytes --, e e dele
# que `aapt2 dump badging` tira o `versionCode`, exatamente como fara no APK de
# release. Se a extracao cegar, a isca cega com ela e o autoteste acusa.
#
# Precisa do `android.jar` da plataforma, que na esteira vem de
# `platforms;android-37.0` (job `apk`) e aqui vem do SDK local.
# ---------------------------------------------------------------------------
achar_android_jar() {
  aapt=$(achar_aapt2) || return 1
  raiz_derivada=${aapt%/build-tools/*}
  sdk_do_projeto=$(sed -n 's/^sdk\.dir=//p' app/android/local.properties 2>/dev/null | head -1 || true)
  for raiz in "$raiz_derivada" "${ANDROID_SDK_ROOT:-}" "${ANDROID_HOME:-}" "$sdk_do_projeto" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    [ -n "$raiz" ] || continue
    jar=$(ls -1 "$raiz"/platforms/*/android.jar 2>/dev/null | sort -V | tail -1 || true)
    if [ -n "$jar" ] && [ -f "$jar" ]; then
      printf '%s' "$jar"
      return 0
    fi
  done
  return 1
}

# `montar_isca_de_apk <destino> <versionCode>`; com o numero VAZIO monta um
# pacote sem `versionCode` nenhum, que e um desfecho proprio.
montar_isca_de_apk() {
  destino="$1"
  numero="$2"
  aapt=$(achar_aapt2) || return 1
  jar=$(achar_android_jar) || return 1
  manifesto="$destino.AndroidManifest.xml"
  if [ -n "$numero" ]; then
    atributos="android:versionCode=\"$numero\" android:versionName=\"1.0.0\""
  else
    atributos=""
  fi
  # Heredoc SEM aspas no marcador, de proposito: `$atributos` tem de expandir.
  cat > "$manifesto" <<XMLDAISCA
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.bichu.isca" $atributos>
    <application android:label="isca"/>
</manifest>
XMLDAISCA
  "$aapt" link --manifest "$manifesto" -I "$jar" -o "$destino" >/dev/null 2>&1 || return 1
  [ -f "$destino" ] || return 1
  return 0
}

# ---------------------------------------------------------------------------
# A VERSAO DOS TERMOS, ANTES DE GASTAR UM BUILD.
#
# A conferencia do valor no binario (acima) pega a CONSEQUENCIA: ela abre o
# pacote e cobra que `$TERMS_VERSION` esteja lá dentro. Mas ela compara o
# binario com o que ESTE script resolveu -- e se o que este script resolveu nao
# e o que o site publica, ela aprova um APK que grava aceite de uma versao que
# nunca esteve no ar. Foi exatamente esse o estado medido em 01/11/2026: o
# portao do binario aprovava `2026-09-17` com folga, porque ele era o valor
# esperado; errado era o valor esperado.
#
# Entao a igualdade com o site e conferida AQUI, no texto, antes do build:
# reprovar na leitura custa milissegundos, e descobrir a mesma coisa depois
# custa o build inteiro. O portao recebe o valor JA RESOLVIDO (com a
# sobrescrita por ambiente aplicada), e nao vai busca-lo de novo: o que
# interessa e o valor que ESTA execucao vai estampar no pacote.
# ---------------------------------------------------------------------------
conferir_versao_dos_termos() {
  [ -f "$PORTAO_DA_VERSAO_LEGAL" ] || {
    echo "REPROVA: nao existe $PORTAO_DA_VERSAO_LEGAL. Sem ele nada compara a versao que o aceite grava com a versao que o site publica, e as duas ja divergiram uma vez (17/09 contra 23/09, medido em 01/11/2026)" >&2
    return 1
  }
  command -v node >/dev/null 2>&1 || {
    echo "REPROVA: \`node\` nao existe nesta maquina, e o portao da versao dos termos e um modulo Node. Pular a conferencia por falta de ferramenta e aprovar por vazio" >&2
    return 1
  }
  node "$PORTAO_DA_VERSAO_LEGAL" --versao-do-app "$TERMS_VERSION"
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
  achou_numero=0
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
        --build-number=*) achou_numero=1 ;;
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
    echo "REPROVA: so achei $vistos argumento(s) no comando de build de $arquivo. O comando passa dez; este portao parou de enxergar e nao pode aprovar" >&2
    return 1
  fi
  if [ "$achou_versao" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--dart-define=APP_VERSION=\`. Sem ela o app nao manda a propria versao, \`PortaoDeVersao\` nao pergunta nada, e o bloqueio por versao minima fica desligado em silencio -- com o build saindo 0" >&2
    return 1
  fi
  if [ "$achou_numero" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--build-number=\`. Sem ela o \`versionCode\` do pacote e o do \`pubspec\`, qualquer numero pedido na linha de comando se perde em silencio, e o artefato pode sair ABAIXO do que o cliente tem instalado -- foi o que aconteceu em 04/11/2026, com o build saindo 0" >&2
    return 1
  fi

  echo "APROVA: os $vistos argumentos do comando de build sao literais, e \`--dart-define=APP_VERSION\` e \`--build-number\` estao entre eles"
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

  # --- as iscas do NUMERO DO BUILD (versionCode) -------------------------
  #
  # Elas sao APKs DE VERDADE, e nao numeros inventados num `if`: `aapt2 link`
  # monta um pacote de 700 bytes com `AndroidManifest.xml` BINARIO a partir de
  # um manifesto de texto, e e dele que `aapt2 dump badging` le o
  # `versionCode`. Assim a isca exercita a MESMA leitura que o APK de release
  # vai receber -- se a extracao cegar, estas iscas cegam com ela.
  echo "--- iscas da conferencia do versionCode (a regressao de 04/11/2026) ---"

  esperar_etiqueta_de_versioncode() {
    motivo="$1"
    caminho="$2"
    etiqueta="$3"
    if saida_da_isca=$(conferir_versioncode_no_apk "$caminho" 2>&1); then
      echo "REPROVA: a isca '$motivo' PASSOU. A conferencia do versionCode parou de enxergar esta familia, e e ela que decide se o pacote INSTALA" >&2
      falhou=1
    else
      case "$saida_da_isca" in
        *"$etiqueta"*)
          echo "isca reprovada como deveria, com a etiqueta $etiqueta: $motivo"
          ;;
        *)
          echo "REPROVA: a isca '$motivo' reprovou, mas NAO com a etiqueta $etiqueta -- os desfechos colapsaram num so, que e o defeito que a esteira ja teve no portao de contrato. O que saiu:" >&2
          printf '%s\n' "$saida_da_isca" | sed 's/^/    /' >&2
          falhou=1
          ;;
      esac
    fi
  }

  if caminho_do_jar=$(achar_android_jar); then
    echo "  (iscas montadas com aapt2 link, contra $caminho_do_jar)"

    base_salva="$BASE_VERSIONCODE"
    de_salvo="$BASE_DE"
    esperado_salvo="$BUILD_NUMBER_ESPERADO"
    # O 2001 nao e numero redondo escolhido a esmo: e o que o cliente tem no
    # aparelho desde 29/10/2026, medido com aapt2 em
    # `bichu-hml-arm64-0399da80.apk`.
    BASE_VERSIONCODE=2001
    BASE_DE="a isca da base (o 2001 que estava no aparelho do cliente em 04/11/2026)"

    # A ISCA QUE PRECISA APROVAR. Sem ela, uma conferencia que reprovasse tudo
    # passaria no resto deste bloco e derrubaria a esteira para sempre.
    BUILD_NUMBER_ESPERADO=2002
    if montar_isca_de_apk "$tmp/vc-2002.apk" 2002; then
      if conferir_versioncode_no_apk "$tmp/vc-2002.apk" >/dev/null 2>&1; then
        echo "isca aprovada como deveria: versionCode 2002, acima da base 2001"
      else
        echo "REPROVA: a isca do versionCode MAIOR foi REPROVADA. A conferencia reprova tudo, e portao assim nao diz nada sobre o APK de verdade" >&2
        falhou=1
      fi
    else
      echo "REPROVA: nao consegui montar a isca de APK com aapt2 link. Sem as iscas esta conferencia vale pela confianca do dia em que foi escrita" >&2
      falhou=1
    fi

    # IGUAL reprova: dois artefatos diferentes com o mesmo numero nao se
    # distinguem no aparelho.
    BUILD_NUMBER_ESPERADO=2001
    montar_isca_de_apk "$tmp/vc-2001.apk" 2001 || falhou=1
    esperar_etiqueta_de_versioncode "versionCode IGUAL ao ultimo entregue (2001)" \
      "$tmp/vc-2001.apk" "[regressao-de-versioncode]"

    # O DEFEITO LITERAL DE 04/11/2026: pacote com 1, aparelho com 2001.
    BUILD_NUMBER_ESPERADO=1
    montar_isca_de_apk "$tmp/vc-1.apk" 1 || falhou=1
    esperar_etiqueta_de_versioncode "versionCode 1 com 2001 no aparelho (o APK de 04/11/2026)" \
      "$tmp/vc-1.apk" "[regressao-de-versioncode]"

    # A BANDEIRA PERDIDA: o pacote tem 2002 e pediram 2003. E a familia do
    # `--dart-define-from-file` de 19/10/2026, agora no `--build-number`.
    BUILD_NUMBER_ESPERADO=2003
    esperar_etiqueta_de_versioncode "numero pedido (2003) que NAO entrou no pacote (2002)" \
      "$tmp/vc-2002.apk" "[valor-divergente]"

    # SEM versionCode nenhum: o aapt2 imprime `versionCode=''`, e cadeia vazia
    # nao pode ser comparada com numero.
    BUILD_NUMBER_ESPERADO=2002
    montar_isca_de_apk "$tmp/vc-sem-numero.apk" "" || falhou=1
    esperar_etiqueta_de_versioncode "APK sem versionCode no manifesto" \
      "$tmp/vc-sem-numero.apk" "[sem-versioncode]"

    # NAO E APK: o `aapt2` morre, e o estado de saida tem de chegar. Esta isca
    # tambem e o controle de que a medicao nao casa qualquer coisa.
    esperar_etiqueta_de_versioncode "2 MB que nao sao um APK" \
      "$tmp/lixo.apk" "[badging-falhou]"

    BUILD_NUMBER_ESPERADO=2002
    esperar_etiqueta_de_versioncode "arquivo inexistente" \
      "$tmp/nao-existe-mesmo.apk" "[apk-ausente]"

    BASE_VERSIONCODE="$base_salva"
    BASE_DE="$de_salvo"
    BUILD_NUMBER_ESPERADO="$esperado_salvo"
  else
    echo "REPROVA: nao achei o \`android.jar\` do SDK (platforms/*/android.jar), e sem ele nao da para MONTAR as iscas de APK que provam a conferencia do versionCode nos dois sentidos. Na esteira ele vem de \`platforms;android-37.0\`, instalado pelo job \`apk\`; aqui, instale a plataforma do SDK. Portao que nao consegue se autotestar nao pode aprovar" >&2
    falhou=1
  fi

  # --- as iscas da LINHA DE BASE: os seis desfechos, separados -----------
  #
  # AUSENCIA NAO PODE VIRAR APROVACAO EM SILENCIO, e o jeito de garantir isso
  # nao e a boa intencao: e cobrar a ETIQUETA de cada desfecho. Foi o colapso
  # entre "a base nao existe" e "o arquivo nao existe na base" que deixou um
  # `exit 0` passar no portao de contrato desta mesma esteira.
  echo "--- iscas da linha de base do versionCode (os desfechos separados) ---"

  registro_salvo="$REGISTRO_DA_ENTREGA"
  entregues_salvo="$ENTREGUES_EM"

  # ARQUIVO, E NAO `$(...)`: `resolver_linha_de_base` PREENCHE
  # `BASE_VERSIONCODE`, e command substitution roda em SUBCASCA -- a variavel
  # voltaria vazia e a isca mediria a base errada (ou nenhuma). E a mesma
  # cicatriz que o `while` deste arquivo ja registra duas vezes.
  esperar_base_reprova() {
    motivo="$1"
    etiqueta="$2"
    if resolver_linha_de_base > "$tmp/saida-da-base.txt" 2>&1; then
      saida_da_base=$(cat "$tmp/saida-da-base.txt")
      echo "REPROVA: a isca de linha de base '$motivo' PASSOU. Falta de base virou aprovacao, que e exatamente o desfecho proibido" >&2
      falhou=1
    else
      saida_da_base=$(cat "$tmp/saida-da-base.txt")
      case "$saida_da_base" in
        *"$etiqueta"*) echo "isca reprovada como deveria, com a etiqueta $etiqueta: $motivo" ;;
        *)
          echo "REPROVA: a isca de base '$motivo' reprovou sem a etiqueta $etiqueta -- desfechos colapsados. O que saiu:" >&2
          printf '%s\n' "$saida_da_base" | sed 's/^/    /' >&2
          falhou=1
          ;;
      esac
    fi
  }

  esperar_base_aprova() {
    motivo="$1"
    etiqueta="$2"
    valor_esperado="$3"
    if resolver_linha_de_base > "$tmp/saida-da-base.txt" 2>&1; then
      saida_da_base=$(cat "$tmp/saida-da-base.txt")
      case "$saida_da_base" in
        *"$etiqueta"*)
          if [ "$BASE_VERSIONCODE" = "$valor_esperado" ]; then
            echo "isca aprovada como deveria, com a etiqueta $etiqueta e base $BASE_VERSIONCODE: $motivo"
          else
            echo "REPROVA: a isca de base '$motivo' aprovou com a etiqueta certa e a base ficou $BASE_VERSIONCODE em vez de $valor_esperado" >&2
            falhou=1
          fi
          ;;
        *)
          echo "REPROVA: a isca de base '$motivo' aprovou e NAO disse $etiqueta. Desfecho que nao se anuncia e desfecho silencioso. O que saiu:" >&2
          printf '%s\n' "$saida_da_base" | sed 's/^/    /' >&2
          falhou=1
          ;;
      esac
    else
      echo "REPROVA: a isca de base '$motivo' foi REPROVADA, e ela precisa passar" >&2
      sed 's/^/    /' "$tmp/saida-da-base.txt" >&2
      falhou=1
    fi
  }

  REGISTRO_DA_ENTREGA="$tmp/registro-que-nao-existe.json"
  ENTREGUES_EM=""
  esperar_base_reprova "registro da entrega AUSENTE" "[registro-ausente]"

  printf 'isto nao e json\n' > "$tmp/registro-invalido.json"
  REGISTRO_DA_ENTREGA="$tmp/registro-invalido.json"
  esperar_base_reprova "registro que nao e JSON" "[registro-ilegivel]"

  printf '{"apk": "sem o numero"}\n' > "$tmp/registro-sem-numero.json"
  REGISTRO_DA_ENTREGA="$tmp/registro-sem-numero.json"
  esperar_base_reprova "registro JSON SEM \`versionCode\`" "[registro-ilegivel]"

  printf '{"versionCode": "2001"}\n' > "$tmp/registro-com-texto.json"
  REGISTRO_DA_ENTREGA="$tmp/registro-com-texto.json"
  esperar_base_reprova "registro com \`versionCode\` em TEXTO" "[registro-ilegivel]"

  printf '{"versionCode": 2001}\n' > "$tmp/registro-bom.json"
  REGISTRO_DA_ENTREGA="$tmp/registro-bom.json"
  ENTREGUES_EM=""
  esperar_base_aprova "registro bom e nenhum diretorio declarado" "[sem-diretorio]" 2001

  ENTREGUES_EM="$tmp/diretorio-que-nao-existe"
  esperar_base_reprova "ENTREGUES_EM declarado e inexistente" "[diretorio-inexistente]"

  mkdir -p "$tmp/entregues-vazio"
  ENTREGUES_EM="$tmp/entregues-vazio"
  esperar_base_aprova "diretorio declarado, existente e SEM APK" "[diretorio-vazio]" 2001

  if [ -f "$tmp/vc-2002.apk" ]; then
    mkdir -p "$tmp/entregues-com-apk"
    cp "$tmp/vc-2002.apk" "$tmp/entregues-com-apk/entregue.apk"
    ENTREGUES_EM="$tmp/entregues-com-apk"
    esperar_base_aprova "disco com APK ACIMA do registro" "[registro-atrasado]" 2002
  fi

  # O CONTROLE POSITIVO DO ARQUIVO DE VERDADE: o registro que esta no
  # repositorio tem de se ler. Sem este caso, o arquivo poderia estar quebrado
  # e as iscas acima -- todas com arquivos de brinquedo -- diriam que esta tudo
  # bem, com a esteira reprovando so na hora do build.
  REGISTRO_DA_ENTREGA="$registro_salvo"
  ENTREGUES_EM=""
  if resolver_linha_de_base > "$tmp/saida-da-base.txt" 2>&1; then
    echo "isca aprovada como deveria: o registro versionado do repositorio ($registro_salvo) le em $BASE_VERSIONCODE"
  else
    echo "REPROVA: o registro versionado do repositorio nao se le. Sem ele a esteira reprova todo build do APK, e a causa nao e o build" >&2
    sed 's/^/    /' "$tmp/saida-da-base.txt" >&2
    falhou=1
  fi
  ENTREGUES_EM="$entregues_salvo"

  [ "$falhou" -eq 0 ] || exit 1
  echo "autoteste: a conferencia do APK, a do valor da versao, a de literalidade, a do versionCode e a da linha de base enxergam nos dois sentidos"
}

# ---------------------------------------------------------------------------

# `--imprimir-versao-dos-termos`: imprime o valor que o comando de build vai
# passar em `--dart-define=TERMS_VERSION`, com a sobrescrita por ambiente ja
# aplicada. Existe para que `verificar-versao-dos-termos.mjs` OBSERVE a
# resolucao de verdade em vez de reconhecer esta linha por expressao regular --
# um portao que le o texto do script aprova no dia em que o texto mudar de forma
# sem mudar de efeito, e reprova no dia inverso.
if [ "${1:-}" = "--imprimir-versao-dos-termos" ]; then
  printf '%s\n' "$TERMS_VERSION"
  exit 0
fi

# `--medir-versioncode <apk>`: imprime o `versionCode` que esta DENTRO do
# pacote, sem veredito nenhum. Existe para medir um artefato ja entregue sem
# pedir ao portao que o julgue contra a arvore de hoje -- e e o que
# `--registrar-entrega` usa.
if [ "${1:-}" = "--medir-versioncode" ]; then
  alvo_para_medir="${2:-}"
  if [ -z "$alvo_para_medir" ]; then
    echo "REPROVA: \`--medir-versioncode\` sem caminho de APK. Sem alvo nao ha o que medir" >&2
    exit 1
  fi
  medido_agora=$(medir_versioncode "$alvo_para_medir") || exit 1
  printf '%s\n' "$medido_agora"
  exit 0
fi

# `--registrar-entrega <apk>`: anota no registro versionado o `versionCode` do
# APK que foi ENTREGUE ao cliente -- MEDIDO de dentro dele, nunca digitado.
#
# Rode isto DEPOIS de mandar um APK para o aparelho do cliente. E este numero
# que a conferencia de regressao cobra, e ele desatualizado e a unica forma de
# o portao aprovar um pacote que nao instala.
if [ "${1:-}" = "--registrar-entrega" ]; then
  apk_entregue="${2:-}"
  if [ -z "$apk_entregue" ]; then
    echo "REPROVA: \`--registrar-entrega\` sem caminho de APK. O numero do registro sai MEDIDO de um pacote, e nunca digitado -- foi numero digitado a mao que produziu o 2001 de 28/10/2026" >&2
    exit 1
  fi
  numero_entregue=$(medir_versioncode "$apk_entregue") || exit 1
  python3 - "$REGISTRO_DA_ENTREGA" "$numero_entregue" "$apk_entregue" <<'PYGRAVAREGISTRO'
import json
import os
import sys
import subprocess

caminho, numero, apk = sys.argv[1], int(sys.argv[2]), sys.argv[3]
anterior = {}
if os.path.exists(caminho):
    try:
        anterior = json.load(open(caminho, encoding='utf-8'))
    except Exception:
        anterior = {}
if isinstance(anterior.get('versionCode'), int) and anterior['versionCode'] > numero:
    print("REPROVA: o registro ja esta em %d, e o APK oferecido tem %d. Registrar isto "
          "ABAIXARIA a linha de base, que e o unico jeito de este portao voltar a aprovar "
          "um pacote que nao instala. Se o numero menor e o certo, apague o registro e "
          "explique no commit."
          % (anterior['versionCode'], numero), file=sys.stderr)
    sys.exit(1)
try:
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True).stdout.strip()
except Exception:
    commit = ''
dados = {
    "versionCode": numero,
    "apk": os.path.basename(apk),
    # O commit de QUEM REGISTRA, e nao o que produziu o APK: este processo nao
    # tem como saber o segundo. Quem diz o do pacote e o `BUILD_COMMIT` medido
    # dentro dele por `verificar_versao_no_apk.py`.
    "commitDoRegistro": commit,
    # UTC, e nao a hora local: portao de data local ja discordou da esteira por 3 horas
    "medidoEm": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).strftime('%Y-%m-%d'),
    "comoFoiMedido": "aapt2 dump badging (infra/verificacao/verificar-apk.sh --registrar-entrega)",
    "porque": (
        "Este numero e a linha de base da conferencia de regressao de versionCode. "
        "Ele sai MEDIDO de dentro do APK entregue, e nunca do pubspec: numero passado "
        "em --build-number nao aparece no pubspec, e foi por isso que a regressao de "
        "04/11/2026 (pacote com 1, aparelho do cliente com 2001) ficou invisivel."
    ),
}
with open(caminho, 'w', encoding='utf-8') as saida:
    json.dump(dados, saida, ensure_ascii=True, indent=2)
    saida.write('\n')
print("registrado em %s: versionCode=%d, medido em %s" % (caminho, numero, os.path.basename(apk)))
PYGRAVAREGISTRO
  exit $?
fi

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
  # `conferir_versao_dos_termos` NAO entra aqui, e isso e escolha e nao
  # esquecimento: `--conferir` responde "o que ESTE pacote carrega dentro", e
  # um pacote antigo carrega legitimamente a versao de termos do dia em que foi
  # compilado. Cobrar a arvore de hoje contra um binario de outra semana
  # reprovaria por divergencia de DATA, e nao de defeito. A igualdade com o site
  # e cobrada onde ela decide algo: no caminho de build, antes de compilar.
  #
  # O valor dos termos continua sendo MEDIDO dentro do pacote tambem aqui, por
  # `conferir_versao_no_binario`, contra o `$TERMS_VERSION` que este script
  # resolveu -- entao apontar `--conferir` para um APK antigo reprova de
  # proposito, e e assim que se ve o que o artefato ja distribuido carrega.
  conferir_literalidade "$0"
  conferir_apk "$alvo_dado"
  conferir_versao_no_binario "$alvo_dado"
  # O `versionCode` TAMBEM aqui, e com a linha de base resolvida: e esta a
  # pergunta "este artefato instala por cima do que o cliente tem?". Apontar
  # para um APK antigo reprova de proposito -- e e assim que se ve o que o
  # artefato ja distribuido carrega.
  resolver_linha_de_base
  conferir_versioncode_no_apk "$alvo_dado"
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

# O DESTINO ANTES DO BUILD: compilar um APK de 75 MB para o endereco errado e
# so depois reprovar seria o portao certo na hora errada.
conferir_destino_do_build

# O NUMERO DO BUILD ANTES DO BUILD, e pela mesma razao do destino: descobrir
# depois que o pacote nao instala custa o build inteiro -- 40 minutos na
# esteira -- e devolve um artefato que o aparelho do cliente recusa.
conferir_numero_do_build
resolver_linha_de_base
conferir_numero_pedido_contra_a_base

conferir_versao_dos_termos

echo "compilando o APK de release de $ENVIRONMENT, versao $BUILD_NAME (de $PUBSPEC), versionCode $BUILD_NUMBER..."

# O `cd app` e o mesmo do comando do cliente. `rm` antes para que um APK de uma
# execucao anterior nao seja confundido com o desta: o portao conferiria um
# arquivo velho e aprovaria um build que nao produziu nada.
rm -f "$APK"

(
  # INICIO DO COMANDO DE BUILD (o portao de literalidade le entre os marcos; nao
  # mova nem renomeie estes comentarios sem ler `conferir_literalidade`)
  cd app && flutter build apk --release \
    --build-name="$BUILD_NAME" \
    --build-number="$BUILD_NUMBER" \
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

# A ULTIMA PALAVRA DE TODAS E A DO `versionCode` MEDIDO DENTRO DO PACOTE: e o
# unico numero que decide se o APK instala por cima do que esta no aparelho do
# cliente. Em 04/11/2026 este script terminava na linha de cima, com `exit 0`, e
# o artefato saia com `versionCode=1` contra 2001 instalado.
conferir_versioncode_no_apk "$APK"
