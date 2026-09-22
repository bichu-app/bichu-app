#!/bin/bash
#
# MEDE A COR QUE A LAUNCH SCREEN NATIVA DO iOS EXIBE, quadro a quadro.
#
# Por que este arquivo existe. A cor do splash do iOS ja foi diagnosticada
# errado duas vezes, e as duas por defeito de MEDICAO, nao de raciocinio:
#
#   1. O iOS guarda um snapshot da launch screen por app, em
#      Library/SplashBoard/Snapshots/<bundle>. `simctl uninstall` seguido de
#      `simctl install` NAO limpa esse cache: duas medicoes de builds
#      diferentes devolveram contagem de pixel identica. Por isso este script
#      CRIA um aparelho do zero por medicao e o destroi no fim. Nunca reusa.
#
#   2. Os quadros da transicao entre a launch screen e a superficie Flutter
#      medem valores intermediarios do crossfade. Um deles mede `#9F0A3A`, que
#      parece `#9E0B3A` com erro de arredondamento e nao e: e mistura. Por isso
#      este script marca cada quadro como ESTAVEL (byte a byte igual ao
#      vizinho) ou INSTAVEL, e diz em qual quadro cada numero foi medido.
#
# Verificacao que nao consegue verificar REPROVA: sem runtime, sem aparelho,
# sem app ou sem nenhum quadro estavel, o script sai diferente de zero com o
# motivo. Ausencia de medicao nunca vira aprovacao silenciosa.
#
# LIMITE CONHECIDO, e ele importa para ler a saida. A launch screen tem DUAS
# fases: primeiro o snapshot que o SpringBoard exibe, depois o render vivo no
# processo do app. O snapshot dura varios quadros e aparece como ESTAVEL. O
# render vivo dura pouco e quase nunca produz dois quadros iguais nesta
# cadencia de captura, entao ele sai marcado 'instavel' mesmo sendo a fase
# certa. Marcar assim e proposital: com uma faixa so, 'instavel' e
# indistinguivel de crossfade. Para separar as duas fases com certeza, use a
# sonda de 4 faixas (tool/sonda_splash_ios.storyboard): cada fase tem um par de
# valores proprio e exato, e crossfade cai fora dos dois pares.
#
# Uso:
#   tool/medir_splash_ios.sh <caminho/Runner.app> <bundle-id> [faixas] [tipo]
#
#   faixas  quantas faixas horizontais medir (padrao 1; use 4 com a
#           sonda de tool/sonda_splash_ios.storyboard)
#   tipo    identificador de SimDeviceType (padrao iPhone-18-Pro)
#
# Exemplo, com a launch screen de producao:
#   flutter build ios --simulator --debug
#   tool/medir_splash_ios.sh build/ios/iphonesimulator/Runner.app app.bichu
#
set -euo pipefail

APP="${1:-}"
BUNDLE="${2:-}"
FAIXAS="${3:-1}"
TIPO="${4:-com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro}"

reprova() { echo "REPROVA: $*" >&2; exit 1; }

[ -n "$APP" ] && [ -n "$BUNDLE" ] || reprova "uso: $0 <Runner.app> <bundle-id> [faixas] [tipo]"
[ -d "$APP" ] || reprova "nao achei o app em '$APP'. Rode antes: flutter build ios --simulator --debug"

RUNTIME=$(xcrun simctl list runtimes --json 2>/dev/null \
  | /usr/bin/python3 -c 'import json,sys; r=[x["identifier"] for x in json.load(sys.stdin)["runtimes"] if x.get("isAvailable") and "iOS" in x["identifier"]]; print(r[-1] if r else "")')
[ -n "$RUNTIME" ] || reprova "nenhum runtime de iOS disponivel no simctl. Sem aparelho nao ha medicao."

TMP=$(mktemp -d)
LEITOR="$TMP/faixas"
trap 'rm -rf "$TMP"; [ -n "${UD:-}" ] && xcrun simctl delete "$UD" >/dev/null 2>&1 || true' EXIT

# Leitor de pixel. Desenha num contexto sRGB EXPLICITO: a captura do simctl ja
# vem marcada como sRGB IEC61966-2.1, entao a conversao e identidade e o numero
# impresso e o numero do framebuffer, sem chute sobre perfil.
cat > "$TMP/faixas.swift" <<'SWIFT'
import Foundation
import CoreGraphics
import ImageIO
let a = CommandLine.arguments
guard a.count >= 3, let n = Int(a[2]),
      let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil),
      let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { exit(2) }
let w = img.width, h = img.height
var buf = [UInt8](repeating: 0, count: w * h * 4)
guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
      let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8,
                          bytesPerRow: w * 4, space: cs,
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { exit(3) }
ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
var linha = ""
for f in 0..<n {
    let yc = Int((Double(f) + 0.5) / Double(n) * Double(h))
    var hist = [UInt32: Int]()
    for dy in -4...4 {
        let y = min(max(yc + dy, 0), h - 1)
        for x in stride(from: Int(Double(w) * 0.3), to: Int(Double(w) * 0.7), by: 1) {
            let o = y * w * 4 + x * 4
            hist[UInt32(buf[o]) << 16 | UInt32(buf[o + 1]) << 8 | UInt32(buf[o + 2]), default: 0] += 1
        }
    }
    let total = hist.values.reduce(0, +)
    if let (v, c) = hist.max(by: { $0.value < $1.value }) {
        linha += String(format: "#%06X:%.2f%% ", v, 100.0 * Double(c) / Double(total))
    }
}
print(linha)
SWIFT
xcrun swiftc -O "$TMP/faixas.swift" -o "$LEITOR" 2>/dev/null \
  || reprova "nao consegui compilar o leitor de pixel (swiftc). Sem leitor nao ha medicao."

NOME="medir-splash-$$"
UD=$(xcrun simctl create "$NOME" "$TIPO" "$RUNTIME") \
  || reprova "nao consegui criar o aparelho '$TIPO' no runtime '$RUNTIME'."
echo "aparelho CRIADO DO ZERO para esta medicao: $UD"
echo "runtime: $RUNTIME    tipo: $TIPO    faixas: $FAIXAS"

xcrun simctl boot "$UD" >/dev/null
xcrun simctl bootstatus "$UD" -b >/dev/null
xcrun simctl install "$UD" "$APP"
xcrun simctl launch "$UD" "$BUNDLE" >/dev/null \
  || reprova "o app '$BUNDLE' nao subiu. Sem app nao ha launch screen para medir."

QUADROS=16
for i in $(seq -w 1 $QUADROS); do
  xcrun simctl io "$UD" screenshot --type=png "$TMP/q$i.png" >/dev/null 2>&1 || true
done

CAPTURADOS=$(ls "$TMP"/q*.png 2>/dev/null | wc -l | tr -d ' ')
[ "$CAPTURADOS" -ge 3 ] || reprova "so $CAPTURADOS capturas sairam. Medicao com menos de 3 quadros nao distingue snapshot de transicao."

# Um quadro so vale como medida da launch screen se for byte a byte igual a um
# vizinho. Quadro unico no meio de dois diferentes e crossfade, e crossfade
# mede mistura, nao cor.
echo
printf "%-8s %-8s %s\n" "quadro" "estado" "cor dominante por faixa"
ANTERIOR=""; ESTAVEIS=0
LISTA=$(ls "$TMP"/q*.png)
for f in $LISTA; do
  H=$(md5 -q "$f")
  echo "$H $(basename "$f") $("$LEITOR" "$f" "$FAIXAS")"
done > "$TMP/tabela"

/usr/bin/python3 - "$TMP/tabela" <<'PY'
import sys
linhas = [l.split(None, 2) for l in open(sys.argv[1]).read().splitlines() if l.strip()]
estaveis = 0
for i, (h, nome, cores) in enumerate(linhas):
    viz = []
    if i > 0: viz.append(linhas[i-1][0])
    if i < len(linhas)-1: viz.append(linhas[i+1][0])
    estavel = h in viz
    if estavel: estaveis += 1
    print("%-8s %-8s %s" % (nome.replace('.png',''), "ESTAVEL" if estavel else "instavel", cores))
print()
if estaveis == 0:
    print("REPROVA: nenhum quadro ficou byte a byte igual ao vizinho. Todos os", file=sys.stderr)
    print("numeros acima sao de quadros de transicao, e quadro de transicao mede", file=sys.stderr)
    print("crossfade, nao a cor da launch screen. Medicao invalida.", file=sys.stderr)
    sys.exit(1)
print("%d quadros ESTAVEIS. So esses valem como medida; os 'instavel' sao" % estaveis)
print("candidatos a crossfade e nao devem ser citados como a cor da tela.")
PY
