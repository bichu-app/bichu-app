#!/usr/bin/env python3
"""Gera os quatro arquivos que `app/pubspec.yaml` exige nesta pasta.

    python3 design/marca/app/gerar-arte-do-app.py          # os quatro do pubspec
    python3 design/marca/app/gerar-arte-do-app.py --simbolo-primary DESTINO.png
    python3 design/marca/app/gerar-arte-do-app.py --ilustracao DESTINO.png

Os dois modos extras nao escrevem nesta pasta de proposito: ela e a entrada do
`flutter_launcher_icons` e do `flutter_native_splash`, e sao exatamente quatro
arquivos. O simbolo em `primary` e a ilustracao recortada sao insumo de TELA
(estado vazio do paragrafo 11.10 e home de visitante), e onde eles moram dentro
do app e decisao de quem implementa, nao desta pasta.

Os quatro PNG desta pasta sao DERIVADOS, nao arte original: saem de
`design/marca/referencia/03-icone-do-app.png`, que e insumo do cliente e nao se
edita. Sem este script ninguem consegue regerar os quatro, e a proxima pessoa
que precisar de um tamanho novo vai redesenhar a marca a mao -- que e
exatamente o que `design/marca/README.md` (pendencia 3) existe para impedir
enquanto nao houver vetor.

COMO O SIMBOLO E SEPARADO DO QUADRADO. O raster tem o simbolo em Marfim sobre
um quadrado Framboesa. A separacao e desmistura linear: cada pixel e lido como
`p = a*F + (1-a)*B`, com `B` o fundo medido e dois candidatos de tinta `F`
(Marfim e Manteiga); ganha o candidato de menor residuo, e `a` vira o alfa.
O corte do ruido e por VIZINHANCA e nao por limiar: a distribuicao de alfa e
bimodal (876 mil pixels em ~0, 126 mil em ~1) com ~7,8 mil espalhados pelo meio
que nao fazem parte de traco nenhum. Limiar simples comeria a suavizacao de
borda junto; a vizinhanca mantem o alfa original so onde ha nucleo solido por
perto.

AS TINTAS DE SAIDA SAO OS LITERAIS DECLARADOS, e nao os medidos no raster. O
render entrega Framboesa em #9A2847, Marfim em #FCF6E8 e Manteiga em #FAC84F --
alguns pontos fora dos valores da folha, porque e PNG e nao vetor. Os hexes
declarados sao literais do cliente e nao se ajustam (design/marca/README.md
secao 2); alem disso o fundo do splash ja esta escrito a mao como #922C4A nos
arquivos nativos, e um icone em #9A2847 ao lado dele apareceria como duas
Framboesas diferentes no mesmo aparelho.

Requer Pillow e numpy. Nenhum dos dois entra no app: isto roda na maquina de
quem desenha, como o `dart run flutter_launcher_icons` que consome a saida.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[3]
SRC = RAIZ / "design/marca/referencia/03-icone-do-app.png"
OUT = RAIZ / "design/marca/app"

# Literais declarados. Framboesa e Manteiga tambem sao `raspberry/700` e
# `butter/400` em design/tokens.json; o Marfim nao tem token porque saiu do app
# em 17/09/2026 (secao 6.8 do design system) e ficou so no material de marca --
# e o icone de loja e material de marca.
FRAMBOESA = (0x92, 0x2C, 0x4A)
MARFIM = (0xFF, 0xF7, 0xE8)
MANTEIGA = (0xE7, 0xB9, 0x3E)

# Medidos no raster de referencia, e so servem para a desmistura.
FUNDO_MEDIDO = np.array([154.0, 40.0, 71.0])
MARFIM_MEDIDO = np.array([252.0, 246.0, 232.0])
MANTEIGA_MEDIDO = np.array([250.0, 200.0, 79.0])

# O simbolo ocupa 86,1% da largura do quadrado na arte de referencia. Nao e
# numero meu: e a proporcao do desenho que o cliente aprovou (secao 3.10 do
# design system declara o 03-icone-do-app.png em vigor).
PROPORCAO_NO_QUADRADO = 0.861
# O centro do simbolo fica 1,0% acima do centro do quadrado na arte. E
# centragem optica do desenho, e fica.
DESLOCAMENTO_OPTICO_Y = -0.010


def extrair_simbolo() -> tuple[Image.Image, np.ndarray]:
    """Devolve o simbolo recortado (Marfim + Manteiga sobre transparente) e a
    mascara booleana dos pixels que sao Manteiga."""
    arr = np.asarray(Image.open(SRC).convert("RGBA")).astype(np.float64)
    rgb, alfa_fonte = arr[..., :3], arr[..., 3]
    d = rgb - FUNDO_MEDIDO

    def desmistura(tinta: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        v = tinta - FUNDO_MEDIDO
        a = np.clip((d @ v) / (v @ v), 0, 1)
        return a, np.linalg.norm(d - a[..., None] * v, axis=-1)

    a_marfim, r_marfim = desmistura(MARFIM_MEDIDO)
    a_manteiga, r_manteiga = desmistura(MANTEIGA_MEDIDO)
    e_manteiga = r_manteiga < r_marfim
    alfa = np.where(e_manteiga, a_manteiga, a_marfim)
    alfa[alfa_fonte <= 200] = 0.0          # fora do quadrado: sombra e transparencia

    nucleo = alfa > 0.55
    vizinhanca = nucleo.copy()
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            vizinhanca |= np.roll(np.roll(nucleo, dy, axis=0), dx, axis=1)
    alfa[~vizinhanca] = 0.0
    alfa[alfa < 0.03] = 0.0

    return alfa, e_manteiga


def pintar(alfa: np.ndarray, e_manteiga: np.ndarray, traco: tuple[int, int, int]) -> Image.Image:
    """Pinta a mascara. A lingua e os dois tracos de brilho continuam Manteiga
    em qualquer versao colorida (secao 3.9 do design system)."""
    h, w = alfa.shape
    saida = np.zeros((h, w, 4), dtype=np.uint8)
    for canal in range(3):
        saida[..., canal] = np.where(e_manteiga, MANTEIGA[canal], traco[canal])
    saida[..., 3] = np.round(alfa * 255).astype(np.uint8)
    im = Image.fromarray(saida, "RGBA")
    return im.crop(im.getbbox())


def por_largura(simbolo: Image.Image, px: int) -> Image.Image:
    w, h = simbolo.size
    return simbolo.resize((px, max(1, round(px * h / w))), Image.LANCZOS)


def tela(lado: int, fundo: tuple[int, int, int] | None = None) -> Image.Image:
    return Image.new("RGBA", (lado, lado), (fundo + (255,)) if fundo else (0, 0, 0, 0))


def centrar(base: Image.Image, arte: Image.Image, dy: float = 0.0) -> Image.Image:
    lado = base.size[0]
    aw, ah = arte.size
    base.alpha_composite(arte, ((lado - aw) // 2, round((lado - ah) / 2 + dy * lado)))
    return base


def raio_circunscrito_relativo(simbolo: Image.Image) -> float:
    """Raio maximo dos pixels opacos a partir do centro da caixa, em larguras.

    O simbolo e largo e baixo (razao ~1.5), entao os cantos da caixa estao
    vazios: dimensionar pela diagonal desperdicaria 17% do circulo do splash.
    """
    a = np.asarray(simbolo)[..., 3]
    ys, xs = np.nonzero(a > 10)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    return float(np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2).max() / simbolo.size[0])


def recortar_ilustracao(destino: Path) -> None:
    """Recorta `08-ilustracao-tres-pessoas.png` na propria arte.

    O PNG de referencia tem 1536x1024 com margem transparente em volta e um
    halo suave de alfa baixo. `getbbox()` do Pillow enxerga o halo e devolve
    uma caixa maior que o desenho; o corte util e no alfa >= 200, que da
    1393 x 694 (razao 2.0072). Essa razao e a da faixa da home de visitante:
    faixa mais alta que isso recorta as pessoas das pontas.
    """
    fonte = RAIZ / "design/marca/referencia/08-ilustracao-tres-pessoas.png"
    im = Image.open(fonte).convert("RGBA")
    a = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(a >= 200)
    caixa = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    recorte = im.crop(caixa)
    recorte.save(destino, optimize=True)
    w, h = recorte.size
    print(f"ilustracao recortada em {caixa} -> {w}x{h} (razao {w / h:.4f}) -> {destino}")


def main() -> int:
    if "--ilustracao" in sys.argv:
        recortar_ilustracao(Path(sys.argv[sys.argv.index("--ilustracao") + 1]))
        return 0

    alfa, e_manteiga = extrair_simbolo()

    if "--simbolo-primary" in sys.argv:
        destino = Path(sys.argv[sys.argv.index("--simbolo-primary") + 1])
        simbolo = pintar(alfa, e_manteiga, FRAMBOESA)
        por_largura(simbolo, 512).save(destino, optimize=True)
        print(f"simbolo em primary -> {destino}")
        return 0

    simbolo = pintar(alfa, e_manteiga, MARFIM)
    sw, sh = simbolo.size
    print(f"simbolo recortado: {sw}x{sh} (razao {sw / sh:.4f})")
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. iOS: 1024x1024 SEM canal alfa. A App Store recusa alfa, e o iOS aplica
    # a propria mascara -- por isso a Framboesa sangra ate a borda e a arte nao
    # traz canto arredondado embutido, que viraria halo dentro da mascara.
    ios = centrar(tela(1024, FRAMBOESA),
                  por_largura(simbolo, round(1024 * PROPORCAO_NO_QUADRADO)),
                  DESLOCAMENTO_OPTICO_Y)
    ios.convert("RGB").save(OUT / "icone-ios-1024.png", optimize=True)

    # 2. Android, camada de fundo: Framboesa chapada nos 108 dp inteiros. Ela
    # cobre o deslocamento de parallax da tela inicial e qualquer mascara de
    # fabricante.
    tela(1024, FRAMBOESA).convert("RGB").save(
        OUT / "icone-android-background.png", optimize=True)

    # 3. Android, camada de frente. O gerador escreve `<inset android:inset="16%">`,
    # que deixa 68% dos 108 dp visiveis (~73,4 dp). Para o simbolo reproduzir os
    # mesmos 86,1% dos 72 dp garantidos: 1024 * (0,861 * 72 / 73,44) = 864 px.
    frente = centrar(tela(1024), por_largura(simbolo, 864), DESLOCAMENTO_OPTICO_Y)
    frente.save(OUT / "icone-android-foreground.png", optimize=True)
    diametro_dp = 2 * raio_circunscrito_relativo(frente) * 73.44
    print(f"android: diametro circunscrito {diametro_dp:.1f} dp (zona segura 66 dp)")

    # 4. Splash 1152x1152. O Android 12 recorta num circulo de 768 px.
    raio = raio_circunscrito_relativo(simbolo)
    largura = int(768 / (2 * raio)) - 4          # 4 px de folga
    centrar(tela(1152), por_largura(simbolo, largura)).save(
        OUT / "splash-simbolo.png", optimize=True)
    print(f"splash: simbolo com {largura} px de largura, "
          f"diametro circunscrito {largura * 2 * raio:.1f} px (limite 768)")

    for nome in sorted(p.name for p in OUT.glob("*.png")):
        im = Image.open(OUT / nome)
        print(f"  {nome:34s} {im.size[0]}x{im.size[1]}  modo={im.mode}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
