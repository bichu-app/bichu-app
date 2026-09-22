#!/usr/bin/env python3
"""Deriva os SVG da marca a partir dos PNG de referencia do cliente.

    python3 design/marca/vetor/derivar-vetor-do-png.py

AUTORIZACAO. Derivar vetor de raster e REDESENHAR a marca, nao converter. A
secao 20.8 do design system nomeia o que isso garante e o que nao garante, e a
producao so comecou porque o cliente autorizou em 21/09/2026, com estas
palavras: "derivar o vetor a partir do png". Sem essa frase este arquivo nao
deveria existir.

O QUE ELE PRODUZ, em `design/marca/vetor/`:

    simbolo.svg                 o simbolo isolado (cara hibrida de cao e gato)
    logotipo-horizontal.svg     simbolo + "Bichu" + descritor "a rede dos pets"
    lockup-sem-descritor.svg    simbolo + "Bichu", que e o que cabe na barra
    icone-pilar-comunidade.svg  os quatro icones de apoio da folha, um por
    icone-pilar-bairro.svg      arquivo
    icone-pilar-proximidade.svg
    icone-pilar-encontros.svg

A VARIANTE REDUZIDA (abaixo de 48px) NAO SAI DAQUI. Ela e desenho novo, nao
recorte nem simplificacao automatica: a regua de reducao da secao 3.10 mede o
simbolo REPROVANDO abaixo de 48px porque bigode, piscada e brilho fecham. Um
tracador que "simplificasse" isso estaria inventando marca, e a secao 21.3 ja
declara que essa variante e desenho novo e decisao do dono da marca. Pedir ao
script o que ele nao pode garantir e como um portao fica verde sem olhar.

COMO A COR CHEGA AQUI. Os rasters sao RENDER: o vermelho da marca aparece em
#6D2435 no logotipo e em #A22345 na fileira de icones, nenhum dos dois igual ao
valor declarado. Por isso a classificacao de tinta e por vizinho mais proximo
entre as tintas MEDIDAS de cada arquivo, e a cor de SAIDA vem de
`design/tokens.json` -- a mesma fonte que o app e os geradores de icone leem.
Trocar a semente e rodar este script de novo basta para o vetor acompanhar.

COMO A CURVA E PRODUZIDA. Marching squares com interpolacao subpixel no canal
de alfa (nivel 0,5), Douglas-Peucker para tirar no redundante, deteccao de
canto por angulo e conversao Catmull-Rom para Bezier cubica nos trechos
suaves. O resultado acompanha a silhueta do raster, com a suavizacao de borda
dele embutida: e por isso que a secao 20.8 promete fidelidade acima de 48px e
nao promete que as curvas sejam as que o autor da marca desenhou.

Requer Pillow, numpy e scikit-image. Nada disso entra no app: roda na maquina
de quem desenha.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from skimage import measure

RAIZ = Path(__file__).resolve().parents[3]
REF = RAIZ / "design/marca/referencia"
OUT = Path(__file__).resolve().parent
TOKENS = RAIZ / "design/tokens.json"


def token(*caminho: str) -> str:
    no = json.loads(TOKENS.read_text(encoding="utf-8"))
    for seg in caminho:
        no = no[seg]
    valor = no["$value"]
    if not (isinstance(valor, str) and valor.startswith("#") and len(valor) == 7):
        raise SystemExit(f"REPROVA: {'.'.join(caminho)} nao e hexadecimal: {valor!r}")
    return valor.upper()


TINTA = token("raspberry", "700")      # Carmim desde 21/09/2026
MANTEIGA = token("butter", "400")
VERDE = token("sage", "300")

# Tintas MEDIDAS nos rasters, que sao render e nao batem com os valores
# declarados. Servem so para classificar cada pixel; nenhuma delas e escrita
# no SVG.
MEDIDAS = {
    "tinta": (0x6D, 0x24, 0x35),
    "manteiga": (0xE8, 0xB0, 0x3C),
    "verde": (0x93, 0xC7, 0xA6),
}
SAIDA = {"tinta": TINTA, "manteiga": MANTEIGA, "verde": VERDE}

# Angulo, em graus, a partir do qual um vertice do poligono simplificado e
# tratado como CANTO e nao recebe suavizacao. Abaixo disso a curva passa
# suave. 40 graus mantem as pontas da orelha e as terminacoes do bigode, e nao
# quebra o arredondado do focinho.
ANGULO_DE_CANTO = 40.0


def classificar(arr: np.ndarray) -> dict[str, np.ndarray]:
    """Separa os pixels opacos por tinta, pelo vizinho mais proximo em RGB."""
    rgb = arr[..., :3].astype(np.float64)
    alfa = arr[..., 3].astype(np.float64) / 255.0
    nomes = list(MEDIDAS)
    dist = np.stack(
        [np.linalg.norm(rgb - np.array(MEDIDAS[n], dtype=np.float64), axis=-1)
         for n in nomes],
        axis=-1,
    )
    vencedor = dist.argmin(axis=-1)
    saida: dict[str, np.ndarray] = {}
    for i, nome in enumerate(nomes):
        mascara = alfa * (vencedor == i)
        if (mascara > 0.5).sum() > 40:      # ruido de borda nao vira camada
            saida[nome] = mascara
    return saida


def contornos(mascara: np.ndarray, tolerancia: float) -> list[np.ndarray]:
    """Marching squares no nivel 0,5, com moldura de zeros.

    A moldura existe porque contorno que encosta na borda da imagem volta
    aberto, e caminho aberto vira preenchimento errado no SVG.
    """
    m = np.pad(mascara, 1, mode="constant", constant_values=0.0)
    fora = []
    for c in measure.find_contours(m, 0.5):
        if len(c) < 8:
            continue
        p = measure.approximate_polygon(c, tolerance=tolerancia)
        if len(p) < 4:
            continue
        # (linha, coluna) -> (x, y), descontando a moldura
        fora.append(np.column_stack([p[:, 1] - 1.0, p[:, 0] - 1.0]))
    return fora


def e_canto(anterior: np.ndarray, atual: np.ndarray, proximo: np.ndarray) -> bool:
    a = anterior - atual
    b = proximo - atual
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na < 1e-9 or nb < 1e-9:
        return True
    cos = float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))
    return math.degrees(math.acos(cos)) < 180.0 - ANGULO_DE_CANTO


def caminho(pontos: np.ndarray) -> str:
    """Fecha o poligono em Bezier cubica, preservando os cantos."""
    p = pontos[:-1] if np.allclose(pontos[0], pontos[-1]) else pontos
    n = len(p)
    if n < 3:
        return ""
    canto = [e_canto(p[(i - 1) % n], p[i], p[(i + 1) % n]) for i in range(n)]

    def tangente(i: int) -> np.ndarray:
        if canto[i]:
            return np.zeros(2)
        return (p[(i + 1) % n] - p[(i - 1) % n]) / 6.0

    d = [f"M{p[0][0]:.2f} {p[0][1]:.2f}"]
    for i in range(n):
        j = (i + 1) % n
        c1 = p[i] + tangente(i)
        c2 = p[j] - tangente(j)
        d.append(
            f"C{c1[0]:.2f} {c1[1]:.2f} {c2[0]:.2f} {c2[1]:.2f} "
            f"{p[j][0]:.2f} {p[j][1]:.2f}"
        )
    d.append("Z")
    return "".join(d)


def svg(
    destino: Path,
    camadas: dict[str, list[np.ndarray]],
    caixa: tuple[float, float, float, float],
    titulo: str,
    nota: str,
) -> None:
    x0, y0, x1, y1 = caixa
    largura, altura = x1 - x0, y1 - y0
    linhas = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {largura:.2f} {altura:.2f}" '
        f'width="{largura:.0f}" height="{altura:.0f}" '
        f'role="img" aria-label="{titulo}">',
        f"  <title>{titulo}</title>",
        f"  <desc>{nota}</desc>",
    ]
    for nome, cs in camadas.items():
        d = "".join(caminho(c - np.array([x0, y0])) for c in cs)
        if not d:
            continue
        linhas.append(
            f'  <g id="{nome}" fill="{SAIDA[nome]}" fill-rule="evenodd">'
        )
        linhas.append(f'    <path d="{d}"/>')
        linhas.append("  </g>")
    linhas.append("</svg>")
    destino.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    print(f"  {destino.name:32s} {largura:7.1f} x {altura:6.1f}  "
          f"{sum(len(c) for cs in camadas.values() for c in cs):5d} nos")


def caixa_das(camadas: dict[str, list[np.ndarray]]) -> tuple[float, float, float, float]:
    todos = np.vstack([c for cs in camadas.values() for c in cs])
    return (todos[:, 0].min(), todos[:, 1].min(),
            todos[:, 0].max(), todos[:, 1].max())


def recortar(camadas, x0=None, x1=None):
    """Mantem so os contornos cujo centro cai na faixa horizontal pedida."""
    fora = {}
    for nome, cs in camadas.items():
        mantidos = [
            c for c in cs
            if (x0 is None or c[:, 0].mean() >= x0)
            and (x1 is None or c[:, 0].mean() <= x1)
        ]
        if mantidos:
            fora[nome] = mantidos
    return fora


def ler(nome: str, tolerancia: float) -> dict[str, list[np.ndarray]]:
    arr = np.asarray(Image.open(REF / nome).convert("RGBA"))
    return {k: contornos(v, tolerancia) for k, v in classificar(arr).items()}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"tinta de saida: {TINTA} (design/tokens.json, raspberry.700)")

    # ------------------------------------------------------------------
    # 1. Simbolo isolado, do icone do app (1254x1254, o raster mais limpo)
    # ------------------------------------------------------------------
    # O 03 tem o simbolo em Marfim sobre quadrado Framboesa, entao a
    # classificacao por tinta nao serve: aqui a separacao e a mesma
    # desmistura de gerar-arte-do-app.py, reaproveitada pelo alfa que ela
    # produz.
    simbolo = _simbolo_do_icone()
    caixa = caixa_das(simbolo)
    svg(OUT / "simbolo.svg", simbolo, caixa,
        "Bichu, simbolo",
        "Derivado de design/marca/referencia/03-icone-do-app.png em 21/09/2026, "
        "com autorizacao do cliente. As curvas NAO sao as do autor da marca. "
        "Piso de uso: 48px (secao 3.10 do design system).")

    # ------------------------------------------------------------------
    # 2. Logotipo horizontal, e o lockup sem o descritor
    # ------------------------------------------------------------------
    logo = ler("02-logo-horizontal.png", tolerancia=0.9)
    caixa = caixa_das(logo)
    svg(OUT / "logotipo-horizontal.svg", logo, caixa,
        "Bichu, logotipo horizontal",
        "Derivado de design/marca/referencia/02-logo-horizontal.png em "
        "21/09/2026. O lettering de 'Bichu' e APROXIMACAO: o raster nao diz "
        "qual e a fonte nem se ela foi modificada (secao 20.8).")

    sem_descritor = _sem_descritor(logo)
    svg(OUT / "lockup-sem-descritor.svg", sem_descritor, caixa_das(sem_descritor),
        "Bichu, lockup sem descritor",
        "A variante que a barra de topo de 64px exige (secao 21.2): o lockup "
        "completo em 2,40:1 precisa de 67px de altura em 160px de largura e "
        "nao cabe. Esta variante nao existia como arquivo; ela sai daqui.")

    # ------------------------------------------------------------------
    # 3. Os quatro icones de pilar
    # ------------------------------------------------------------------
    pilares = ler("10-icones-pilares.png", tolerancia=0.7)
    faixas = [
        ("comunidade", 92, 542, "Comunidade de verdade"),
        ("bairro", 698, 1048, "Bairros mais seguros"),
        ("proximidade", 1229, 1565, "Pets mais proximos de casa"),
        ("encontros", 1758, 2030, "Pequenas acoes, grandes encontros"),
    ]
    for chave, x0, x1, rotulo in faixas:
        recorte = recortar(pilares, x0 - 5, x1 + 5)
        svg(OUT / f"icone-pilar-{chave}.svg", recorte, caixa_das(recorte),
            f"Bichu, icone de pilar: {rotulo}",
            "Derivado de design/marca/referencia/10-icones-pilares.png em "
            "21/09/2026. O terceiro icone (proximidade) e o grafismo de tres "
            "petalas em Manteiga, que e para onde a patinha aposentada foi; "
            "ele NAO volta a ser simbolo, favicon nem icone do app.")

    print("\nO QUE NAO SAI DAQUI: a variante reduzida do simbolo para menos de "
          "48px. Ela e desenho novo, e desenho novo de marca alheia e decisao "
          "do dono da marca (secao 21.3).")
    return 0


def _simbolo_do_icone() -> dict[str, list[np.ndarray]]:
    """Separa o simbolo do quadrado por desmistura linear.

    Mesmo metodo de design/marca/app/gerar-arte-do-app.py, que o cliente ja
    aprovou como leitura do raster. Repetido aqui e nao importado porque
    aquele arquivo e a entrada dos geradores de icone e nao deve ganhar
    dependencia de scikit-image.
    """
    arr = np.asarray(Image.open(REF / "03-icone-do-app.png").convert("RGBA")).astype(np.float64)
    rgb, alfa_fonte = arr[..., :3], arr[..., 3]
    fundo = np.array([154.0, 40.0, 71.0])
    marfim = np.array([252.0, 246.0, 232.0])
    manteiga = np.array([250.0, 200.0, 79.0])
    d = rgb - fundo

    def desmistura(tinta):
        v = tinta - fundo
        a = np.clip((d @ v) / (v @ v), 0, 1)
        return a, np.linalg.norm(d - a[..., None] * v, axis=-1)

    a_marfim, r_marfim = desmistura(marfim)
    a_manteiga, r_manteiga = desmistura(manteiga)
    e_manteiga = r_manteiga < r_marfim
    alfa = np.where(e_manteiga, a_manteiga, a_marfim)
    alfa[alfa_fonte <= 200] = 0.0

    nucleo = alfa > 0.55
    vizinhanca = nucleo.copy()
    for dy in range(-3, 4):
        for dx in range(-3, 4):
            vizinhanca |= np.roll(np.roll(nucleo, dy, axis=0), dx, axis=1)
    alfa[~vizinhanca] = 0.0
    alfa[alfa < 0.03] = 0.0

    return {
        "tinta": contornos(alfa * ~e_manteiga, tolerancia=0.9),
        "manteiga": contornos(alfa * e_manteiga, tolerancia=0.7),
    }


def _faixas(ocupada: np.ndarray) -> list[tuple[int, int]]:
    """Trechos contiguos de True, como pares [inicio, fim)."""
    faixas: list[tuple[int, int]] = []
    inicio = None
    for i, v in enumerate(ocupada):
        if v and inicio is None:
            inicio = i
        if not v and inicio is not None:
            faixas.append((inicio, i))
            inicio = None
    if inicio is not None:
        faixas.append((inicio, len(ocupada)))
    return faixas


def _sem_descritor(logo: dict[str, list[np.ndarray]]) -> dict[str, list[np.ndarray]]:
    """Tira o descritor 'a rede dos pets' do lockup completo.

    As duas linhas de corte sao MEDIDAS no raster, nao estimadas, e cada etapa
    recusa em vez de adivinhar. Valores conferidos em 21/09/2026 sobre
    02-logo-horizontal.png (1942 x 809):

      - o simbolo termina em x=873 e o primeiro elemento a direita (o brilho
        em Manteiga) comeca em x=881: sete colunas vazias, e e a UNICA lacuna
        de coluna antes da palavra;
      - a direita dessa lacuna, 'Bichu' ocupa y 315-623 e o descritor y
        637-748, com treze linhas vazias entre os dois.

    A tentativa anterior cortava pelo maior intervalo entre inicios de
    contorno e caiu no meio do descritor -- o lockup saiu com "a rede dos pet".
    Contorno solto nao diz onde um bloco comeca; perfil de ocupacao diz.
    """
    tinta = logo["tinta"]
    alfa = np.asarray(Image.open(REF / "02-logo-horizontal.png").convert("RGBA"))[..., 3]
    mascara = alfa > 128
    largura = mascara.shape[1]

    vazias = ~mascara.any(axis=0)
    lacunas = [
        (a, b) for a, b in _faixas(vazias)
        if b - a >= 3 and a > 0.2 * largura and b < 0.9 * largura
    ]
    if not lacunas:
        raise SystemExit(
            "REPROVA: nao achei coluna vazia separando o simbolo da palavra em "
            "02-logo-horizontal.png. Sem essa separacao o corte do descritor "
            "seria palpite, e meia letra de marca e pior que nenhum arquivo."
        )
    limite_simbolo = sum(lacunas[0]) / 2.0

    ocupada = mascara[:, int(limite_simbolo):].any(axis=1)
    blocos = _faixas(ocupada)
    if len(blocos) < 2:
        raise SystemExit(
            f"REPROVA: a direita de x={limite_simbolo:.0f} ha {len(blocos)} "
            "bloco(s) de conteudo, e o lockup completo tem pelo menos dois "
            "('Bichu' e o descritor)."
        )
    topo_do_descritor, fim_do_descritor = blocos[-1]
    fim_da_palavra = blocos[-2][1]
    altura = blocos[-1][1] - blocos[0][0]
    proporcao = (fim_do_descritor - topo_do_descritor) / altura
    if not 0.08 <= proporcao <= 0.30:
        raise SystemExit(
            f"REPROVA: o ultimo bloco a direita mede {proporcao:.0%} da altura "
            "do conjunto, fora dos 8% a 30% que um descritor ocupa. O que foi "
            "encontrado nao e o descritor."
        )
    corte = (fim_da_palavra + topo_do_descritor) / 2.0
    print(f"  lockup: simbolo ate x={limite_simbolo:.0f}; "
          f"descritor em y {topo_do_descritor}-{fim_do_descritor} "
          f"({proporcao:.0%} da altura); corte em y {corte:.0f}")

    def fica(c: np.ndarray) -> bool:
        return c[:, 0].min() < limite_simbolo or c[:, 1].min() < corte

    fora = {"tinta": [c for c in tinta if fica(c)]}
    if "manteiga" in logo:
        fora["manteiga"] = [c for c in logo["manteiga"] if fica(c)]

    removidos = len(tinta) - len(fora["tinta"])
    if removidos == 0:
        raise SystemExit(
            "REPROVA: o corte nao removeu contorno nenhum. O lockup 'sem "
            "descritor' seria identico ao completo, e um arquivo que promete "
            "uma variante e entrega outra e pior que a falta dele."
        )
    return fora


if __name__ == "__main__":
    raise SystemExit(main())
