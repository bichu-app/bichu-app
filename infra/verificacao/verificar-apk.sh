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
# Uso:
#   sh infra/verificacao/verificar-apk.sh              # compila e confere
#   sh infra/verificacao/verificar-apk.sh --autoteste  # so as iscas, sem compilar
#
# Saida: 0 aprovado, 1 reprovado. Rode da RAIZ do repositorio.
set -eu

APK="app/build/app/outputs/flutter-apk/app-release.apk"

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
# O endereco dos tiles do mapa e o User-Agent que a politica do OpenStreetMap
# pede moram em app/config/mapa.json, fora do codigo (portao de portabilidade).

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

  [ "$falhou" -eq 0 ] || exit 1
  echo "autoteste: a conferencia do APK enxerga nos dois sentidos"
}

# ---------------------------------------------------------------------------

if [ "${1:-}" = "--autoteste" ]; then
  autoteste
  exit 0
fi

command -v unzip >/dev/null 2>&1 || {
  echo "REPROVA: \`unzip\` nao existe nesta maquina. Sem ele o portao compilaria e nao conferiria o que saiu" >&2
  exit 1
}

echo "compilando o APK de release com as dart-define de $ENVIRONMENT..."

# O `cd app` e o mesmo do comando do cliente. `rm` antes para que um APK de uma
# execucao anterior nao seja confundido com o desta: o portao conferiria um
# arquivo velho e aprovaria um build que nao produziu nada.
rm -f "$APK"

(
  cd app && flutter build apk --release \
    --dart-define=API_BASE_URL="$API_BASE_URL" \
    --dart-define=ENVIRONMENT="$ENVIRONMENT" \
    --dart-define=TERMS_VERSION="$TERMS_VERSION" \
    --dart-define=TERMS_URL="$TERMS_URL" \
    --dart-define=PRIVACY_URL="$PRIVACY_URL" \
    --dart-define-from-file=config/mapa.json
) || {
  echo "REPROVA: \`flutter build apk --release\` falhou. Leia o erro acima: se ele fala de compileSdk, de AAR metadata ou de versao de AGP, alguma dependencia subiu o piso da cadeia de ferramentas e o projeto ficou para tras" >&2
  exit 1
}

conferir_apk "$APK"
