#!/bin/sh
# ---------------------------------------------------------------------------
# COMPILA O iOS COM AS `--dart-define` COMPLETAS E CONFERE O VALOR DENTRO DO
# BINARIO.  Irmao de `verificar-apk.sh`, e deliberadamente na mesma forma.
#
# POR QUE ESTE ARQUIVO EXISTE
# ===========================
#
# O cliente constroi o iOS PELO XCODE. O Xcode nao le este script: ele le
# `app/ios/Flutter/Generated.xcconfig`, e quem ESCREVE aquele arquivo e o
# `flutter` quando roda um build de iOS pela linha de comando. Ou seja: as
# `--dart-define` que o Xcode do cliente usa sao as do ULTIMO build de linha de
# comando feito naquela pasta.
#
# MEDIDO em 26/10/2026 no checkout do cliente: `Generated.xcconfig` estava
# datado de 18/10 19:35, com 15 chaves em `DART_DEFINES` -- sem `APP_VERSION` e
# sem `BUILD_COMMIT`. Oito dias congelado. As consequencias, lidas no codigo e
# nao supostas:
#
#   - sem `APP_VERSION`, `AppConfig` entrega `versaoDoApp` nulo,
#     `PortaoDeVersao._perguntar` cai no `if (versao == null ...) return;` e o
#     bloqueio por versao minima fica DESLIGADO, em silencio, do lado seguro;
#   - sem `BUILD_COMMIT`, `CarimboDoBuild` escreve `commit nao declarado` no
#     rodape, e ninguem com o aparelho na mao consegue dizer qual build esta
#     instalado (a BICHUS-210 de volta).
#
# E O ARQUIVO VOLTA A ENVELHECER. Nada o atualiza sozinho: no proximo commit o
# `BUILD_COMMIT` de dentro dele passa a apontar para um commit que nao e mais o
# da arvore. Por isso ele le o SHA do `HEAD` NA HORA, e nao de um literal.
#
# RODE ISTO ANTES DE ABRIR O XCODE, da RAIZ do repositorio:
#
#     make ios API_BASE_URL=https://hml.bichu.app
#
# O `API_BASE_URL=` NA LINHA DE COMANDO nao e enfeite, e o alvo `ios` RECUSA
# sem ele. A razao esta na secao seguinte.
#
# A ARMADILHA DO `localhost`
# ==========================
#
# MEDIDO em 03/11/2026 no banco de dados do `make` deste repositorio:
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
# O `Makefile` atribui com `:=`, entao **o ambiente nao sobrepoe** e so a
# LINHA DE COMANDO vence. Quem roda o alvo sem `API_BASE_URL=` ali compila um
# binario apontado para a propria maquina -- que no aparelho do cliente nao
# fala com servidor nenhum, e nao tem como dizer isso: a tela so nao carrega.
#
# E ATE 03/11/2026 ESTE PORTAO APROVAVA ESSE BINARIO, por construcao: ele
# montava a cadeia de CONTROLE POSITIVO a partir de `$API_BASE_URL`, a MESMA
# variavel que o build usara. Com `localhost:<porta>` no ambiente, o controle
# positivo que ele montava era `localhost:<porta>`, ele achava `localhost:<porta>`
# no binario e aprovava. Controle que sai do valor medido nao e controle: e
# autoaprovacao.
#
# As duas travas que fecharam isso, e as duas precisam existir:
#
#   1. O controle positivo sai de `API_BASE_URL_ESPERADO`, declarado A PARTE,
#      e o build REPROVA quando o valor que ele vai usar divergir do esperado.
#   2. O `--proibido` do conferidor mede o BINARIO e nao depende de variavel
#      nenhuma -- a unica das duas que funciona em `--conferir <binario que o
#      Xcode produziu>`, onde nao existe variavel de build para comparar.
#
# PROIBICOES QUE ESTE SCRIPT RESPEITA, de proposito
# =================================================
#
# `--no-codesign`: nao toca certificado, perfil de provisionamento nem conta
# Apple. Nao instala em aparelho e nao roda `flutter build ipa`. Nao comita
# nada: `Generated.xcconfig` e `flutter_export_environment.sh` sao ignorados
# pelo `app/ios/.gitignore`, e `app/build/` pelo `app/.gitignore`, entao rodar
# isto NAO altera o `git status`.
#
# LIMITE HONESTO, e ele e grande: isto prova que os defines do COMANDO chegaram
# ao binario que o COMANDO produziu, e que o `Generated.xcconfig` da pasta
# passou a declarar as 17 chaves. Nao prova que o Xcode le o arquivo novo --
# para saber isso e preciso medir o binario que o XCODE produziu, apontando
# `--conferir <caminho>` para ele.
#
# Este portao e LOCAL: precisa de macOS com Xcode. Nao precisa de aparelho nem
# de conta Apple. A esteira roda em Linux, entao ele fica na mesma posicao de
# `make apk` -- rodado por quem tem o Mac, e nao pela CI.
# ---------------------------------------------------------------------------
set -u

PUBSPEC="app/pubspec.yaml"
MAPA="app/config/mapa.json"
CONFERIDOR="infra/verificacao/verificar_valores_no_binario_ios.py"
MODO="${MODO:-release}"
BINARIO="app/build/ios/iphoneos/Runner.app/Frameworks/App.framework/App"

# ---------------------------------------------------------------------------
# OS VALORES. Os MESMOS de `verificar-apk.sh`, e sobrescreviveis pelo ambiente
# pela mesma razao: quando um alvo diferente precisar ser compilado, o define
# acompanha porque sai da mesma variavel. Duas listas de valores divergiriam no
# dia em que alguem mexesse numa so, e ai o iOS e o Android apontariam para
# lugares diferentes sem ninguem notar.
#
# A EXCECAO E `API_BASE_URL`, e ela tem DUAS variaveis de proposito.
#
# `API_BASE_URL_ESPERADO` e o destino que se ESPERA no binario, e e dele que
# sai a cadeia de controle positivo. `API_BASE_URL` e o que o build vai usar.
# Separar as duas e o conserto da armadilha descrita no cabecalho: enquanto o
# controle saia da mesma variavel do build, ele concordava com qualquer valor
# -- inclusive `localhost`.
#
# Para compilar DELIBERADAMENTE para outro destino, declare os DOIS:
#
#   API_BASE_URL_ESPERADO=https://outro.exemplo \
#   API_BASE_URL=https://outro.exemplo \
#     sh infra/verificacao/verificar-ios.sh
#
# Duas declaracoes para um desvio e de proposito: o desvio fica escrito, e nao
# herdado em silencio de quem exportou uma variavel tres comandos atras.
# ---------------------------------------------------------------------------
API_BASE_URL_ESPERADO="${API_BASE_URL_ESPERADO:-https://hml.bichu.app}"
API_BASE_URL="${API_BASE_URL:-$API_BASE_URL_ESPERADO}"
ENVIRONMENT="${ENVIRONMENT:-hml}"
TERMS_VERSION="${TERMS_VERSION:-2026-09-17}"
TERMS_URL="${TERMS_URL:-https://bichu.app/termos}"
PRIVACY_URL="${PRIVACY_URL:-https://bichu.app/privacidade}"

# ---------------------------------------------------------------------------
# O CONTROLE NEGATIVO. Um endereco INVENTADO, que nao pode existir em binario
# nenhum deste repositorio. Ele e obrigatorio: sem ele, um portao cujo
# mecanismo de busca casasse qualquer coisa aprovaria tudo, e o controle
# positivo mentiria junto. Nao e um endereco de producao de verdade justamente
# para que ninguem o "conserte" apontando para um host real.
# ---------------------------------------------------------------------------
CONTROLE_NEGATIVO="${CONTROLE_NEGATIVO:-api-de-producao-que-nunca-existiu.bichu.invalido}"

if [ ! -f "$PUBSPEC" ]; then
  echo "REPROVA: nao existe $PUBSPEC. Rode da RAIZ do repositorio: sem o pubspec nao ha de onde tirar a versao, e um build sem versao desliga o bloqueio por versao minima em silencio" >&2
  exit 1
fi

# `version: 1.0.0+1` -> `1.0.0`. O que vem depois do `+` e o `versionCode`.
BUILD_NAME="${BUILD_NAME:-$(sed -n 's/^version:[[:space:]]*\([^+[:space:]][^+[:space:]]*\).*$/\1/p' "$PUBSPEC" | head -1)}"
if [ -z "$BUILD_NAME" ]; then
  echo "REPROVA: nao consegui ler \`version:\` de $PUBSPEC. Seguir daqui compilaria com \`--dart-define=APP_VERSION=\` vazio, e \`AppConfig\` trata vazio como AUSENTE -- o bloqueio por versao minima sairia desligado e o build ficaria verde" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# O NUMERO DO BUILD (`CFBundleVersion` no iOS, `versionCode` no Android).
#
# POR QUE ELE ENTROU AQUI, no mesmo dia em que entrou no irmao: Android e iOS
# TEM DE SAIR NA MESMA VERSAO -- ja saiu iOS 189 commits atras do Android neste
# repositorio -- e o numero e parte da versao. Se o `--build-number` existisse
# so de um lado, as duas plataformas voltariam a divergir pelo lado de fora.
#
# A regressao que gerou isto foi MEDIDA no Android em 04/11/2026: APKs de 28 e
# 29/10 entregues com `versionCode=2001` (numero passado A MAO, por fora dos
# portoes) e o artefato de 04/11, compilado sem numero, com `1`. Leia o
# cabecalho de `verificar-apk.sh` para a tabela inteira.
#
# SAO DUAS VARIAVEIS, pela MESMA razao que `API_BASE_URL` tem duas desde
# 03/11/2026 (PR #161): `BUILD_NUMBER_ESPERADO` e o numero que se ESPERA dentro
# do que o build produziu, e e com ele que o valor LIDO do `Info.plist` do
# `Runner.app` e comparado; `BUILD_NUMBER` e o que o build vai usar. Tirar a
# expectativa da MESMA variavel que o build consumiu e comparar o valor com ele
# mesmo, e isso aprova qualquer coisa.
#
#   make ios API_BASE_URL=https://hml.bichu.app BUILD_NUMBER=2002
#
# O PADRAO sai do `+N` de `app/pubspec.yaml`, a mesma fonte do `versionName`.
#
# O QUE ESTE PORTAO NAO FAZ: a conferencia de REGRESSAO (o numero novo tem de
# passar do ultimo ENTREGUE) mora em `verificar-apk.sh`, porque e o APK que o
# cliente instala por cima hoje -- o iOS esta dormente por decisao de 23/09
# (a conta Apple nao anda), e nao ha ultimo entregue de iOS para comparar.
# Quando houver, a linha de base e o registro, e o lugar e aqui.
# ---------------------------------------------------------------------------
BUILD_NUMBER_ESPERADO="${BUILD_NUMBER_ESPERADO:-$(sed -n 's/^version:[[:space:]]*[^+[:space:]]\{1,\}+\([0-9]\{1,\}\)[[:space:]]*$/\1/p' "$PUBSPEC" | head -1)}"
BUILD_NUMBER="${BUILD_NUMBER:-$BUILD_NUMBER_ESPERADO}"
for par in "BUILD_NUMBER_ESPERADO=$BUILD_NUMBER_ESPERADO" "BUILD_NUMBER=$BUILD_NUMBER"; do
  nome=${par%%=*}
  valor=${par#*=}
  if [ -z "$valor" ]; then
    echo "REPROVA: \`$nome\` ficou VAZIO. Nao achei \`version: <nome>+<numero>\` em $PUBSPEC e ninguem declarou o numero. Build sem numero sai com o que a ferramenta inventar, e e assim que as duas plataformas divergem" >&2
    exit 1
  fi
  case "$valor" in
    *[!0-9]*)
      echo "REPROVA: \`$nome=$valor\` nao e um inteiro. O numero do build e inteiro nas duas plataformas" >&2
      exit 1
      ;;
  esac
  if [ "$valor" -le 0 ]; then
    echo "REPROVA: \`$nome=$valor\` nao e positivo. O numero do build comeca em 1" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# O COMMIT SAI DO `HEAD` NA HORA, e nunca de um literal.
#
# E A RAZAO E O DEFEITO QUE ESTE SCRIPT CONSERTA: um SHA cravado aqui estaria
# certo no dia em que fosse escrito e errado no dia seguinte, que e exatamente
# o que aconteceu com o `Generated.xcconfig` congelado em 18/10. Carimbo que
# aponta para o commit errado e pior que carimbo ausente, porque o ausente se
# anuncia (`commit nao declarado`) e o errado nao.
# ---------------------------------------------------------------------------
BUILD_COMMIT="${BUILD_COMMIT:-$(git rev-parse HEAD 2>/dev/null || true)}"
if [ -z "$BUILD_COMMIT" ]; then
  echo "REPROVA: nao consegui ler o SHA do \`HEAD\`. Sem ele o build sairia com \`--dart-define=BUILD_COMMIT=\` vazio, e o carimbo diria \`commit nao declarado\` -- com o build saindo 0" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# A CONFERENCIA. Numa funcao so para que o `--conferir` e o fim do build
# chamem EXATAMENTE a mesma, e nao duas reescritas parecidas dela.
#
# A string de CONTROLE POSITIVO sai de `$API_BASE_URL_ESPERADO` sem o esquema
# -- do valor ESPERADO, e NUNCA do valor que o build usou. Essa troca de uma
# variavel pela outra e metade do conserto da armadilha do cabecalho: tirada
# do valor medido, a cadeia de controle concorda com qualquer coisa.
#
# A outra metade sao os `--proibido`, escritos LITERAIS no comando abaixo pela
# cicatriz de 19/10/2026: lista de bandeiras guardada em variavel de shell e
# expandida sem aspas e justamente a forma de perder argumento em silencio.
# ---------------------------------------------------------------------------
conferir_valores() {
  alvo="$1"

  command -v python3 >/dev/null 2>&1 || {
    echo "REPROVA: \`python3\` nao existe nesta maquina, e e ele que mede o valor DENTRO do binario. Portao que nao consegue conferir precisa reprovar, nunca aprovar" >&2
    return 1
  }
  [ -f "$CONFERIDOR" ] || {
    echo "REPROVA: nao existe $CONFERIDOR. Sem ele este script compilaria e nao conferiria o que saiu, que e portao decorativo" >&2
    return 1
  }

  controle=$(printf '%s' "$API_BASE_URL_ESPERADO" | sed 's|^https\{0,1\}://||')
  if [ -z "$controle" ]; then
    echo "REPROVA: a string de controle ficou vazia a partir de API_BASE_URL_ESPERADO='$API_BASE_URL_ESPERADO'. Sem controle a medicao do valor nao vale nada" >&2
    return 1
  fi

  python3 "$CONFERIDOR" \
    --binario "$alvo" \
    --versao "$BUILD_NAME" \
    --commit "$BUILD_COMMIT" \
    --controle "$controle" \
    --controle-negativo "$CONTROLE_NEGATIVO" \
    --mapa "$MAPA" \
    --chave APP_VERSION \
    --chave API_BASE_URL \
    --chave ENVIRONMENT \
    --chave TERMS_VERSION \
    --chave TERMS_URL \
    --chave PRIVACY_URL \
    --chave BUILD_COMMIT \
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
# So no caminho de build, e nunca em `--conferir`: ali o binario foi produzido
# por outro comando (o do Xcode), e comparar o `API_BASE_URL` DESTE processo
# com qualquer coisa nao diria nada sobre aquele arquivo. Quem cobra o
# `--conferir` e o `--proibido`, que mede o binario.
# ---------------------------------------------------------------------------
conferir_destino_do_build() {
  if [ "$API_BASE_URL" = "$API_BASE_URL_ESPERADO" ]; then
    echo "APROVA: o build vai apontar para '$API_BASE_URL', que e o destino ESPERADO declarado"
    return 0
  fi
  echo "REPROVA: o build ia apontar para API_BASE_URL='$API_BASE_URL', e o destino ESPERADO declarado e API_BASE_URL_ESPERADO='$API_BASE_URL_ESPERADO'." >&2
  echo "  Se isto veio de \`make\` sem \`API_BASE_URL=\` na LINHA DE COMANDO, o valor e o \`http://localhost:<porta>\` do proprio Makefile: ele atribui com \`:=\`, e o ambiente NAO sobrepoe. Rode \`make ios API_BASE_URL=https://hml.bichu.app\`." >&2
  echo "  Se o desvio for DELIBERADO, declare os dois: \`API_BASE_URL_ESPERADO=<destino> API_BASE_URL=<destino>\`. Duas declaracoes para um desvio e de proposito -- o desvio fica escrito." >&2
  return 1
}

# ---------------------------------------------------------------------------
# O NUMERO PEDIDO, ANTES DE GASTAR UM BUILD (conferencia de TEXTO).
# ---------------------------------------------------------------------------
conferir_numero_do_build() {
  if [ "$BUILD_NUMBER" = "$BUILD_NUMBER_ESPERADO" ]; then
    echo "APROVA: o build vai pedir numero $BUILD_NUMBER, que e o ESPERADO declarado"
    return 0
  fi
  echo "REPROVA [numero-divergente]: o build ia pedir BUILD_NUMBER=$BUILD_NUMBER, e o ESPERADO declarado e BUILD_NUMBER_ESPERADO=$BUILD_NUMBER_ESPERADO." >&2
  echo "  A expectativa e o que este portao vai COBRAR dentro do que o build produziu, e ela nao pode sair da mesma variavel que o build usou -- tirada de la, a conferencia compara o valor com ele mesmo (o defeito do \`API_BASE_URL\`, fechado no PR #161)." >&2
  echo "  Se o desvio for DELIBERADO, declare os dois: \`BUILD_NUMBER_ESPERADO=<n> BUILD_NUMBER=<n>\`." >&2
  return 1
}

# ---------------------------------------------------------------------------
# O NUMERO DENTRO DO QUE O BUILD PRODUZIU.
#
# Onde ele mora no iOS: `CFBundleVersion`, no `Info.plist` do `Runner.app`. O
# `project.pbxproj` declara `CURRENT_PROJECT_VERSION = $(FLUTTER_BUILD_NUMBER)`,
# e quem escreve `FLUTTER_BUILD_NUMBER` e o `flutter` quando roda um build de
# linha de comando -- no `Generated.xcconfig`, o MESMO arquivo que o Xcode do
# cliente le. Entao sao dois lugares, e os dois sao medidos:
#
#   1. o `Info.plist` do app que ESTE comando produziu (o binario);
#   2. o `Generated.xcconfig`, que e o que o build DO XCODE vai usar depois.
#
# Medir so (1) deixaria o Xcode do cliente sair com outro numero -- e foi
# exatamente essa familia (xcconfig congelado de 18/10) que criou este arquivo.
#
# `plutil` e nao `grep`: o `Info.plist` do app compilado e BINARIO, e procurar
# texto nele e como o portao volta a aprovar lixo. `python3` com `plistlib`
# serve de reserva, porque ele e dependencia dura deste portao de todo jeito.
# ---------------------------------------------------------------------------
PLIST_DO_APP="app/build/ios/iphoneos/Runner.app/Info.plist"

medir_numero_no_plist() {
  arquivo="$1"
  if [ ! -f "$arquivo" ]; then
    echo "REPROVA [plist-ausente]: nao existe $arquivo depois do build. Sem o Info.plist nao ha numero de build para medir, e e ele que o aparelho compara" >&2
    return 1
  fi
  lido=""
  if command -v plutil >/dev/null 2>&1; then
    lido=$(plutil -extract CFBundleVersion raw -o - "$arquivo" 2>/dev/null || true)
  fi
  if [ -z "$lido" ]; then
    lido=$(python3 - "$arquivo" <<'PYPLIST' || true
import plistlib
import sys

try:
    with open(sys.argv[1], 'rb') as entrada:
        dados = plistlib.load(entrada)
except Exception:
    sys.exit(1)
valor = dados.get('CFBundleVersion')
if isinstance(valor, str) and valor:
    sys.stdout.write(valor)
PYPLIST
)
  fi
  if [ -z "$lido" ]; then
    echo "REPROVA [sem-cfbundleversion]: $arquivo nao da um \`CFBundleVersion\`. Pacote sem numero de build nao se distingue de outro no aparelho, e o aparelho recusa instalar por cima de um numero maior" >&2
    return 1
  fi
  printf '%s' "$lido"
}

conferir_numero_no_binario() {
  medido=$(medir_numero_no_plist "$PLIST_DO_APP") || return 1
  if [ "$medido" != "$BUILD_NUMBER_ESPERADO" ]; then
    echo "REPROVA [valor-divergente]: $PLIST_DO_APP traz CFBundleVersion='$medido', e o numero esperado e $BUILD_NUMBER_ESPERADO." >&2
    echo "  Ou o \`--build-number\` se perdeu no caminho -- bandeira que se perde em silencio ja aconteceu aqui em 19/10/2026 --, ou este app nao e o desta execucao." >&2
    return 1
  fi
  echo "APROVA: $PLIST_DO_APP traz CFBundleVersion='$medido', igual ao pedido (lido do plist do app, nao deduzido do comando)"

  xcconfig="app/ios/Flutter/Generated.xcconfig"
  if [ ! -f "$xcconfig" ]; then
    echo "REPROVA [xcconfig-ausente]: nao existe $xcconfig, e e dele que o build DO XCODE tira o numero" >&2
    return 1
  fi
  no_xcconfig=$(sed -n 's/^FLUTTER_BUILD_NUMBER=//p' "$xcconfig" | head -1)
  if [ -z "$no_xcconfig" ]; then
    echo "REPROVA [xcconfig-sem-numero]: $xcconfig nao declara \`FLUTTER_BUILD_NUMBER\`. O Xcode do cliente le ESTE arquivo: sem a chave, o app que ELE constroi sai com o numero que o projeto tiver, e as duas plataformas divergem sem nada acusar" >&2
    return 1
  fi
  if [ "$no_xcconfig" != "$BUILD_NUMBER_ESPERADO" ]; then
    echo "REPROVA [xcconfig-divergente]: $xcconfig declara FLUTTER_BUILD_NUMBER=$no_xcconfig, e o esperado e $BUILD_NUMBER_ESPERADO. O build do Xcode sairia com o numero errado -- que e a familia do arquivo congelado de 18/10/2026" >&2
    return 1
  fi
  echo "APROVA: $xcconfig declara FLUTTER_BUILD_NUMBER=$no_xcconfig, entao o build do XCODE sai no mesmo numero"
  return 0
}

# ---------------------------------------------------------------------------
# AS CHAVES QUE O `Generated.xcconfig` PASSOU A DECLARAR.
#
# Esta e a conferencia do ELO com o Xcode, e a unica parte deste script que
# fala do que o Xcode vai ler. `DART_DEFINES` e uma lista de `CHAVE=VALOR` em
# base64, separados por virgula; o portao decodifica e imprime **so as
# chaves**, nunca os valores -- valor de define vai para log, e log vai para
# transcript.
#
# Cobra as 7 do produto. As 8 que o proprio Flutter injeta
# (`FLUTTER_VERSION`, `FLUTTER_CHANNEL`, ...) nao sao cobradas: quem as escreve
# e a ferramenta, e exigi-las seria o portao medindo a ferramenta em vez do
# comando.
# ---------------------------------------------------------------------------
conferir_chaves_do_xcconfig() {
  xcconfig="app/ios/Flutter/Generated.xcconfig"
  [ -f "$xcconfig" ] || {
    echo "REPROVA: nao existe $xcconfig depois do build. E ELE que o Xcode le; sem ele o build do cliente nao recebe define nenhum" >&2
    return 1
  }
  python3 - "$xcconfig" <<'PYCHAVES'
import base64, re, sys
caminho = sys.argv[1]
texto = open(caminho, encoding='utf-8', errors='replace').read()
m = re.search(r'^DART_DEFINES=(.*)$', texto, re.M)
if not m:
    print("REPROVA: %s nao tem linha `DART_DEFINES=`. O Xcode nao recebe define nenhum" % caminho, file=sys.stderr)
    sys.exit(1)
chaves = []
for item in [x for x in m.group(1).strip().split(',') if x]:
    try:
        bruto = base64.b64decode(item + '=' * (-len(item) % 4)).decode('utf-8', 'replace')
    except Exception:
        print("REPROVA: item de DART_DEFINES que nao decodifica em base64", file=sys.stderr)
        sys.exit(1)
    chaves.append(bruto.split('=', 1)[0])
exigidas = ['API_BASE_URL', 'APP_VERSION', 'BUILD_COMMIT', 'ENVIRONMENT',
            'PRIVACY_URL', 'TERMS_URL', 'TERMS_VERSION']
faltando = [k for k in exigidas if k not in chaves]
if faltando:
    print("REPROVA: %s declara %d chaves e NAO declara %s. O Xcode le este arquivo: "
          "sem APP_VERSION o bloqueio por versao minima fica desligado, e sem "
          "BUILD_COMMIT o carimbo diz `commit nao declarado`"
          % (caminho, len(chaves), ', '.join(faltando)), file=sys.stderr)
    sys.exit(1)
print("APROVA: %s declara %d chaves em DART_DEFINES, as 7 do produto entre elas" % (caminho, len(chaves)))
print("  chaves (SO os nomes, nunca os valores):")
for k in sorted(chaves):
    print("    %s" % k)
PYCHAVES
}

# ---------------------------------------------------------------------------
# O PORTAO DE LITERALIDADE DO COMANDO DE BUILD.
#
# CICATRIZ MEDIDA EM 19/10/2026: gerando APK e iOS, os defines foram passados
# por uma VARIAVEL DE SHELL e o `--dart-define-from-file=config/mapa.json` se
# perdeu em SILENCIO -- build `exit 0`, e o valor do mapa ausente do binario.
# Este portao le o TEXTO do proprio comando, entre os marcos, e reprova
# argumento que nao comeca com `--`.
#
# O que ele NAO proibe, de proposito: `--dart-define=CHAVE="$VALOR"`. Ali a
# BANDEIRA e literal e so o valor vem de variavel, que e o arranjo correto.
# ---------------------------------------------------------------------------
# OS MARCOS SAO ANCORADOS EM `^[[:space:]]*#`, e isso nao e enfeite -- e a
# MESMA cicatriz que `verificar-apk.sh` ja registra nas linhas 257-262, e eu
# cai nela de novo em 26/10/2026, duas vezes:
#
#   1. com o literal inteiro dentro do `sed`/`awk` do portao, a propria linha do
#      portao casava o marco, e ele reprovava o `|` do seu proprio comando;
#   2. guardando o texto do marco numa variavel sem ancora, a LINHA DA
#      ATRIBUICAO casava, o bloco comecava e terminava nas duas linhas de
#      atribuicao, e o portao reprovava "nao tem argumento nenhum".
#
# Com a ancora, `MARCO_INICIO=...` nao casa, porque ela nao comeca com `#`.
MARCO_INICIO='^[[:space:]]*# INICIO DO COMANDO DE BUILD'
MARCO_FIM='^[[:space:]]*# FIM DO COMANDO DE BUILD'

conferir_literalidade() {
  arquivo="$1"

  # `awk` e nao `sed -n '/A/,/B/p'`, pela razao de `verificar-apk.sh`: o `sed`
  # recomeca a faixa depois do marco de fim e devolve TODOS os blocos marcados
  # do arquivo. Aqui so o PRIMEIRO par conta, e os dois tem de existir --
  # marco de abertura sem o de fechamento leria o resto do arquivo.
  bloco=$(awk -v ini="$MARCO_INICIO" -v fim="$MARCO_FIM" '
    !vistoini && $0 ~ ini { dentro = 1; vistoini = 1; next }
    dentro && $0 ~ fim { dentro = 0; fechou = 1; next }
    dentro { print }
    END { if (!vistoini || !fechou) exit 3 }
  ' "$arquivo") || {
    echo "REPROVA: nao achei o par de marcos do comando de build em $arquivo (ou falta o de abertura, ou falta o de fechamento). Portao que nao encontra o que conferir fica verde por vazio" >&2
    return 1
  }

  # TODAS as linhas do bloco, e nao so as que terminam em `\`: deixar a ultima
  # de fora tiraria justamente o `--dart-define-from-file` da conferencia, que
  # e o argumento que se perdeu na cicatriz de 19/10/2026.
  #
  # Tira a barra de continuacao, o espaco das pontas, comentario, linha vazia,
  # o `)` e a linha do proprio `flutter build ios`.
  lista=$(mktemp)
  printf '%s\n' "$bloco" \
    | sed 's/[[:space:]]*\\[[:space:]]*$//' \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
    | sed '/^#/d; /^$/d; /^)$/d; /flutter build ios/d' \
    > "$lista"

  if [ ! -s "$lista" ]; then
    echo "REPROVA: o bloco do comando de build em $arquivo nao tem argumento nenhum. Ou o comando mudou de forma, ou este portao parou de enxergar -- e nos dois casos ele nao pode aprovar" >&2
    rm -f "$lista"
    return 1
  fi

  # Arquivo, e nao cano: em `sh` o `while` do lado direito de um cano roda em
  # subcasca, e `vistos` voltaria zerado -- um portao que contasse zero e
  # aprovasse.
  vistos=0
  achou_versao=0
  achou_commit=0
  achou_mapa=0
  achou_numero=0
  problema=""
  # `set -f` porque a expansao de `*` nao e de proposito aqui.
  set -f
  while IFS= read -r arg; do
    [ -n "$arg" ] || continue
    vistos=$((vistos + 1))
    case "$arg" in
      --dart-define=APP_VERSION=*) achou_versao=1 ;;
      --dart-define=BUILD_COMMIT=*) achou_commit=1 ;;
      --dart-define-from-file=*) achou_mapa=1 ;;
      --build-number=*) achou_numero=1 ;;
    esac
    case "$arg" in
      --*) ;;
      *) [ -n "$problema" ] || problema="$arg" ;;
    esac
  done < "$lista"
  set +f
  rm -f "$lista"

  if [ -n "$problema" ]; then
    echo "REPROVA: o comando de build em $arquivo tem o argumento '$problema', que nao comeca com '--'. Define passado por VARIAVEL DE SHELL foi medido em 19/10/2026 perdendo o \`--dart-define-from-file\` em silencio, com o build saindo 0. Escreva as bandeiras LITERAIS" >&2
    return 1
  fi
  if [ "$vistos" -eq 0 ]; then
    echo "REPROVA: li o comando de build em $arquivo e nao vi argumento nenhum. Portao que confere zero argumentos fica verde por vazio" >&2
    return 1
  fi
  if [ "$achou_versao" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--dart-define=APP_VERSION=\`. Sem ela \`PortaoDeVersao\` nao pergunta nada e o bloqueio por versao minima fica desligado em silencio -- com o build saindo 0" >&2
    return 1
  fi
  if [ "$achou_commit" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--dart-define=BUILD_COMMIT=\`. Sem ela o carimbo diz \`commit nao declarado\` e ninguem sabe qual build esta no aparelho" >&2
    return 1
  fi
  if [ "$achou_mapa" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--dart-define-from-file\`. Foi exatamente esse argumento que se perdeu em silencio em 19/10/2026" >&2
    return 1
  fi
  if [ "$achou_numero" -ne 1 ]; then
    echo "REPROVA: o comando de build em $arquivo nao passa \`--build-number=\`. Sem ela o numero do build e o do \`pubspec\`, qualquer numero pedido na linha de comando se perde em silencio, e as duas plataformas saem em versoes diferentes -- com o build saindo 0" >&2
    return 1
  fi
  echo "APROVA: os $vistos argumentos do comando de build sao literais, e APP_VERSION, BUILD_COMMIT, o arquivo de mapa e --build-number estao entre eles"
}

# ---------------------------------------------------------------------------
# MODOS
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--autoteste" ]; then
  # As iscas do conferidor de valor. Nao compila nada e nao precisa de Xcode.
  # SEM `conferir_destino_do_build` AQUI, de proposito: o autoteste mede se as
  # ISCAS reprovam, e isso nao tem relacao com o destino deste build. Chamar a
  # conferencia de destino aqui acoplaria `make verificar-ios-autoteste` ao
  # `API_BASE_URL` do Makefile, e o alvo das iscas reprovaria por um motivo que
  # nao e o dele -- portao reprovando fora do seu assunto e portao que se
  # desliga na primeira vez que incomoda.
  conferir_literalidade "$0" || exit 1

  # AS ISCAS DO NUMERO DO BUILD. Nao compilam nada e nao precisam de Xcode: o
  # `Info.plist` e um plist, e `plistlib` escreve um de brinquedo nas duas
  # formas (XML e BINARIO) em milissegundos. Sem elas, a leitura do numero
  # valeria pela confianca do dia em que foi escrita.
  falhou_numero=0
  tmp_do_numero=$(mktemp -d)
  trap 'rm -rf "$tmp_do_numero"' EXIT

  esperar_numero() {
    motivo="$1"
    caminho="$2"
    desfecho="$3"
    etiqueta="$4"
    if saida_do_numero=$(medir_numero_no_plist "$caminho" 2>&1); then
      if [ "$desfecho" = "aprova" ]; then
        if [ "$saida_do_numero" = "$etiqueta" ]; then
          echo "isca aprovada como deveria: $motivo (leu $saida_do_numero)"
        else
          echo "REPROVA: a isca '$motivo' leu '$saida_do_numero' e o certo era '$etiqueta'" >&2
          falhou_numero=1
        fi
      else
        echo "REPROVA: a isca '$motivo' PASSOU. A leitura do numero do build parou de enxergar esta familia" >&2
        falhou_numero=1
      fi
    else
      if [ "$desfecho" = "reprova" ]; then
        case "$saida_do_numero" in
          *"$etiqueta"*) echo "isca reprovada como deveria, com a etiqueta $etiqueta: $motivo" ;;
          *)
            echo "REPROVA: a isca '$motivo' reprovou sem a etiqueta $etiqueta -- desfechos colapsados. O que saiu:" >&2
            printf '%s\n' "$saida_do_numero" | sed 's/^/    /' >&2
            falhou_numero=1
            ;;
        esac
      else
        echo "REPROVA: a isca '$motivo' foi REPROVADA, e ela precisa passar" >&2
        printf '%s\n' "$saida_do_numero" | sed 's/^/    /' >&2
        falhou_numero=1
      fi
    fi
  }

  python3 - "$tmp_do_numero" <<'PYISCASPLIST'
import plistlib
import os
import sys

pasta = sys.argv[1]
# BINARIO, que e a forma do `Info.plist` do app compilado -- e a forma em que
# `grep` nao acha nada.
with open(os.path.join(pasta, 'com-numero.plist'), 'wb') as saida:
    plistlib.dump({'CFBundleVersion': '2002', 'CFBundleShortVersionString': '1.0.0'},
                  saida, fmt=plistlib.FMT_BINARY)
with open(os.path.join(pasta, 'numero-errado.plist'), 'wb') as saida:
    plistlib.dump({'CFBundleVersion': '1', 'CFBundleShortVersionString': '1.0.0'},
                  saida, fmt=plistlib.FMT_BINARY)
with open(os.path.join(pasta, 'sem-numero.plist'), 'wb') as saida:
    plistlib.dump({'CFBundleShortVersionString': '1.0.0'}, saida, fmt=plistlib.FMT_BINARY)
with open(os.path.join(pasta, 'nao-e-plist.plist'), 'w', encoding='utf-8') as saida:
    saida.write('isto nao e um plist\n')
PYISCASPLIST

  esperar_numero "plist BINARIO com CFBundleVersion=2002" "$tmp_do_numero/com-numero.plist" aprova 2002
  esperar_numero "plist SEM CFBundleVersion" "$tmp_do_numero/sem-numero.plist" reprova "[sem-cfbundleversion]"
  esperar_numero "arquivo que nao e plist" "$tmp_do_numero/nao-e-plist.plist" reprova "[sem-cfbundleversion]"
  esperar_numero "plist inexistente" "$tmp_do_numero/nao-existe.plist" reprova "[plist-ausente]"

  # A isca do NUMERO ERRADO exercita a comparacao, e nao a leitura: um plist com
  # `1` onde se esperava 2002 e o defeito de 04/11/2026 em forma de arquivo.
  esperado_salvo="$BUILD_NUMBER_ESPERADO"
  plist_salvo="$PLIST_DO_APP"
  BUILD_NUMBER_ESPERADO=2002
  PLIST_DO_APP="$tmp_do_numero/numero-errado.plist"
  if conferir_numero_no_binario >/dev/null 2>&1; then
    echo "REPROVA: a isca do numero ERRADO no plist (1 onde se esperava 2002) PASSOU" >&2
    falhou_numero=1
  else
    echo "isca reprovada como deveria: CFBundleVersion=1 onde se esperava 2002 (o defeito de 04/11/2026)"
  fi
  BUILD_NUMBER_ESPERADO="$esperado_salvo"
  PLIST_DO_APP="$plist_salvo"

  # A conferencia de TEXTO do numero pedido, nos dois sentidos.
  numero_salvo="$BUILD_NUMBER"
  BUILD_NUMBER="$BUILD_NUMBER_ESPERADO"
  if conferir_numero_do_build >/dev/null 2>&1; then
    echo "isca aprovada como deveria: numero pedido igual ao esperado"
  else
    echo "REPROVA: a isca do numero pedido IGUAL ao esperado foi reprovada" >&2
    falhou_numero=1
  fi
  BUILD_NUMBER=$((BUILD_NUMBER_ESPERADO + 1))
  if conferir_numero_do_build >/dev/null 2>&1; then
    echo "REPROVA: a isca do numero pedido DIFERENTE do esperado passou -- o controle positivo sairia do valor que o build usou" >&2
    falhou_numero=1
  else
    echo "isca reprovada como deveria: numero pedido diferente do esperado (uma declaracao so para um desvio)"
  fi
  BUILD_NUMBER="$numero_salvo"

  [ "$falhou_numero" -eq 0 ] || exit 1

  python3 "$CONFERIDOR" --autoteste
  exit $?
fi

if [ "${1:-}" = "--conferir" ]; then
  # Confere um binario JA construido -- inclusive um que o XCODE produziu, que
  # e a unica forma de provar o elo que este script nao prova sozinho.
  alvo="${2:-$BINARIO}"
  conferir_valores "$alvo"
  exit $?
fi

command -v flutter >/dev/null 2>&1 || {
  echo "REPROVA: \`flutter\` nao existe nesta maquina" >&2
  exit 1
}
command -v xcodebuild >/dev/null 2>&1 || {
  echo "REPROVA: \`xcodebuild\` nao existe nesta maquina. Este portao e LOCAL e precisa de macOS com Xcode; na esteira (Linux) ele nao roda, e fingir que rodou seria portao decorativo" >&2
  exit 1
}

# A LITERALIDADE ANTES DO BUILD: reprovar na leitura do comando custa
# milissegundos, e descobrir a mesma coisa depois custa o build inteiro.
conferir_literalidade "$0" || exit 1

# O DESTINO ANTES DO BUILD, pela mesma razao: compilar meia hora para o
# endereco errado e depois reprovar seria o portao certo na hora errada.
conferir_destino_do_build || exit 1

# O NUMERO ANTES DO BUILD, pela mesma razao do destino.
conferir_numero_do_build || exit 1

echo "compilando o iOS de $MODO de $ENVIRONMENT, versao $BUILD_NAME+$BUILD_NUMBER (de $PUBSPEC), commit $BUILD_COMMIT (de HEAD)..."
echo "  (--no-codesign: nao toca certificado, perfil nem conta Apple)"

(
  # INICIO DO COMANDO DE BUILD (o portao de literalidade le entre os marcos; nao
  # mova nem renomeie estes comentarios sem ler `conferir_literalidade`)
  cd app && flutter build ios --"$MODO" --no-codesign \
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
  echo "REPROVA: \`flutter build ios --$MODO --no-codesign\` falhou. Leia o erro acima" >&2
  exit 1
}

# O ELO COM O XCODE: as chaves que o arquivo que ELE le passou a declarar.
conferir_chaves_do_xcconfig || exit 1

# A ULTIMA PALAVRA E A DO VALOR, e nao a do envelope.
conferir_valores "$BINARIO" || exit 1

# E O NUMERO DO BUILD, nos DOIS lugares: no `Info.plist` que este comando
# produziu e no `Generated.xcconfig` que o Xcode do cliente vai ler.
conferir_numero_no_binario || exit 1

echo
echo "LEMBRETE: isto NAO prova que o Xcode le o arquivo novo. Depois de"
echo "construir pelo Xcode, meca o binario que ELE produziu:"
echo "  sh infra/verificacao/verificar-ios.sh --conferir <caminho do App.framework/App>"
