#!/usr/bin/env python3
"""Deriva a variante reduzida do simbolo A PARTIR DO VETOR, nao do PNG.

Entrada:  design/marca/vetor/simbolo.svg  e  design/tokens.json
Saida:    design/marca/vetor/simbolo-reduzido.svg
          design/marca/vetor/selo-reduzido.svg

O QUE ELE FAZ, e por que isto nao e "simplificacao automatica".

A secao 3.10 de docs/06-design-system.md ja tinha ESCRITO qual e a variante
reduzida: "o mesmo desenho sem bigodes, sem o piscar e sem o brilho, guardando
as duas orelhas e o contorno da cabeca". O que faltava era o vetor, porque
apagar bigode de um PNG e repintar, e repintar a marca do cliente e redesenha-la.
Com as curvas na mao, apagar um subcaminho inteiro e uma operacao exata: o que
sobra e o desenho do autor, sem nada acrescentado.

O script NAO adivinha quais subcaminhos sao os bigodes. Ele carrega a impressao
digital de cada um dos doze subcaminhos de `simbolo.svg` (nome e caixa
delimitadora arredondada ao inteiro) e **recusa** se o arquivo de entrada nao
bater exatamente. Simbolo novo exige revisao humana desta tabela, que e o
comportamento certo: um traçador que "reconhecesse bigode" estaria inventando
marca no dia em que errasse.

Rode da raiz do repositorio:

    python3 design/marca/vetor/derivar-variante-reduzida.py

So biblioteca padrao. Nada aqui entra no app.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

NUM = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")

# ---------------------------------------------------------------------------
# A impressao digital de `simbolo.svg`.
#
# `manter=True` e o que sobrevive na variante reduzida. Os tres bigodes, a
# piscada e os dois brilhos saem; o resto fica intacto, curva por curva.
# ---------------------------------------------------------------------------
PECAS: list[tuple[str, str, tuple[int, int, int, int], bool]] = [
    # (grupo, nome, caixa (x0, y0, x1, y1) arredondada, manter)
    ("tinta", "orelha-direita-e-topo-da-cabeca", (370, -1, 735, 336), True),
    ("tinta", "orelha-esquerda-caida", (0, 134, 342, 398), True),
    ("tinta", "olho-que-pisca", (493, 291, 600, 360), False),
    ("tinta", "olho-aberto", (264, 320, 336, 424), True),
    ("tinta", "bigode-superior", (655, 349, 799, 398), False),
    ("tinta", "focinho-boca-e-lingua", (331, 384, 552, 568), True),
    ("tinta", "contorno-da-cabeca-queixo", (135, 407, 373, 597), True),
    ("tinta", "bigode-do-meio", (655, 414, 797, 485), False),
    ("tinta", "bigode-inferior", (639, 462, 729, 543), False),
    ("tinta", "narina", (421, 473, 471, 536), True),
    ("manteiga", "brilho-longo", (748, 105, 847, 234), False),
    ("manteiga", "brilho-curto", (783, 228, 905, 300), False),
]

FOLGA = 0.06  # respiro em volta da tinta, em fracao do lado do quadrado
RAIO_DO_SELO = 0.22  # raio do canto do selo, em fracao do lado


def raiz_do_repositorio() -> Path:
    aqui = Path(__file__).resolve()
    for pai in aqui.parents:
        if (pai / "design" / "tokens.json").exists() and (pai / "app").is_dir():
            return pai
    sys.exit(
        "RECUSADO: nao achei a raiz do repositorio (design/tokens.json + app/) "
        f"subindo a partir de {aqui}."
    )


def token(raiz: Path, caminho: str) -> str:
    """Le um primitivo de `design/tokens.json`. Nenhum hex de marca mora aqui."""
    dados = json.loads((raiz / "design" / "tokens.json").read_text())
    no = dados
    for parte in caminho.split("."):
        if not isinstance(no, dict) or parte not in no:
            sys.exit(f"RECUSADO: token {caminho} nao existe em design/tokens.json.")
        no = no[parte]
    valor = no.get("$value") if isinstance(no, dict) else None
    if not isinstance(valor, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", valor):
        sys.exit(f"RECUSADO: token {caminho} vale {valor!r}, que nao e hex de 6 digitos.")
    return valor.upper()


def subcaminhos(d: str) -> list[str]:
    return [p.strip() for p in re.split(r"(?=M)", d) if p.strip()]


def caixa(sub: str) -> tuple[float, float, float, float]:
    """Caixa dos PONTOS DE CONTROLE. Serve de impressao digital, nao de medida
    de tinta: dois arquivos iguais dao a mesma caixa, e e so isso que se pede
    dela."""
    n = [float(x) for x in NUM.findall(sub)]
    xs, ys = n[0::2], n[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def ler_simbolo(caminho: Path) -> dict[str, list[str]]:
    svg = caminho.read_text()
    if re.search(r"<(text|tspan)\b", svg):
        sys.exit(f"RECUSADO: {caminho} tem fonte viva. O vetor da marca e curva.")
    grupos: dict[str, list[str]] = {}
    for m in re.finditer(r'<g id="([^"]+)"[^>]*>(.*?)</g>', svg, re.S):
        d = re.search(r'd="([^"]*)"', m.group(2))
        if not d:
            sys.exit(f"RECUSADO: grupo {m.group(1)} de {caminho} nao tem path.")
        grupos[m.group(1)] = subcaminhos(d.group(1))
    return grupos


def conferir(grupos: dict[str, list[str]]) -> list[tuple[str, str, str, bool]]:
    """Casa o arquivo com PECAS. Devolve (grupo, nome, d, manter)."""
    esperado: dict[str, int] = {}
    for grupo, _, _, _ in PECAS:
        esperado[grupo] = esperado.get(grupo, 0) + 1
    if {g: len(v) for g, v in grupos.items()} != esperado:
        sys.exit(
            "RECUSADO: simbolo.svg mudou de forma. Esperava "
            f"{esperado} subcaminhos e achei {{{', '.join(f'{g!r}: {len(v)}' for g, v in grupos.items())}}}. "
            "A tabela PECAS deste script precisa de revisao humana antes de "
            "qualquer variante sair daqui."
        )
    saida: list[tuple[str, str, str, bool]] = []
    indice: dict[str, int] = {}
    for grupo, nome, cx, manter in PECAS:
        i = indice.get(grupo, 0)
        indice[grupo] = i + 1
        d = grupos[grupo][i]
        achado = tuple(round(v) for v in caixa(d))
        if achado != cx:
            sys.exit(
                f"RECUSADO: o subcaminho {i} de '{grupo}' deveria ser "
                f"'{nome}' com caixa {cx} e tem {achado}. O simbolo mudou, ou "
                "a ordem dos subcaminhos mudou. Revise PECAS a mao."
            )
        saida.append((grupo, nome, d, manter))
    return saida


def moldura_quadrada(ds: list[str]) -> tuple[float, float, float]:
    cx = [caixa(d) for d in ds]
    x0 = min(c[0] for c in cx)
    y0 = min(c[1] for c in cx)
    x1 = max(c[2] for c in cx)
    y1 = max(c[3] for c in cx)
    w, h = x1 - x0, y1 - y0
    lado = max(w, h) * (1 + FOLGA)
    return x0 - (lado - w) / 2, y0 - (lado - h) / 2, lado


def cabecalho(titulo: str, desc: str, vb: tuple[float, float, float], lado_px: int) -> str:
    x, y, l = vb
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:.2f} {y:.2f} {l:.2f} {l:.2f}" '
        f'width="{lado_px}" height="{lado_px}" role="img" aria-label="{titulo}">\n'
        f"  <title>{titulo}</title>\n"
        f"  <desc>{desc}</desc>\n"
    )


def main() -> None:
    raiz = raiz_do_repositorio()
    vetor = raiz / "design" / "marca" / "vetor"
    carmim = token(raiz, "raspberry.700")
    claro = token(raiz, "neutral.25")

    pecas = conferir(ler_simbolo(vetor / "simbolo.svg"))
    fica = [p for p in pecas if p[3]]
    sai = [p for p in pecas if not p[3]]
    ds_tinta = [d for g, _, d, k in fica if g == "tinta" and k]
    if any(g != "tinta" for g, _, _, _ in fica):
        sys.exit("RECUSADO: a variante reduzida nao tem camada Manteiga, e alguma sobrou.")

    vb = moldura_quadrada(ds_tinta)
    saiu = ", ".join(n for _, n, _, _ in sai)

    desc = (
        "Variante reduzida, derivada de design/marca/vetor/simbolo.svg em "
        "21/09/2026 pela secao 3.10 do design system: fora "
        f"{saiu}. Nenhuma curva foi acrescentada ou movida. Piso de uso medido: "
        "24 px. Abaixo disso use selo-reduzido.svg."
    )
    corpo = cabecalho("Bichu, simbolo reduzido", desc, vb, 48)
    corpo += f'  <g id="tinta" fill="{carmim}" fill-rule="evenodd">\n'
    corpo += '    <path d="' + "".join(ds_tinta) + '"/>\n'
    corpo += "  </g>\n</svg>\n"
    (vetor / "simbolo-reduzido.svg").write_text(corpo)

    # ---- selo: o mesmo desenho vazado em claro sobre o quadrado da marca.
    # Nao e desenho novo: e a construcao do proprio icone do app do cliente
    # (referencia/03-icone-do-app.png) levada ao tamanho de favicon.
    x, y, l = vb
    folga_selo = 0.30  # o desenho ocupa 70% do lado do selo
    ls = l / (1 - folga_selo)
    xs = x - (ls - l) / 2
    ys = y - (ls - l) / 2
    r = ls * RAIO_DO_SELO
    desc_selo = (
        "Selo reduzido: simbolo-reduzido.svg vazado em neutral.25 sobre o "
        "quadrado raspberry.700 de cantos arredondados, que e a construcao do "
        "icone do app da folha do cliente (referencia/03-icone-do-app.png). "
        "Destino: favicon de 16 e 32 px. A 16 px quem carrega a marca e o "
        "quadrado, nao o desenho -- ver o README desta pasta."
    )
    selo = cabecalho("Bichu, selo reduzido", desc_selo, (xs, ys, ls), 16)
    selo += (
        f'  <rect x="{xs:.2f}" y="{ys:.2f}" width="{ls:.2f}" height="{ls:.2f}" '
        f'rx="{r:.2f}" ry="{r:.2f}" fill="{carmim}"/>\n'
    )
    # A camada se chama `vazado`, nao `tinta`: aqui o desenho e o BURACO
    # claro no quadrado da marca, e nao a tinta sobre o fundo. Nome errado aqui
    # faria o portao de cor cobrar raspberry.700 de um vazio em neutral.25.
    selo += f'  <g id="vazado" fill="{claro}" fill-rule="evenodd">\n'
    selo += '    <path d="' + "".join(ds_tinta) + '"/>\n'
    selo += "  </g>\n</svg>\n"
    (vetor / "selo-reduzido.svg").write_text(selo)

    print(f"simbolo-reduzido.svg  viewBox={vb[0]:.2f} {vb[1]:.2f} {vb[2]:.2f} {vb[2]:.2f}")
    print(f"selo-reduzido.svg     viewBox={xs:.2f} {ys:.2f} {ls:.2f} {ls:.2f}")
    print(f"fora: {saiu}")


if __name__ == "__main__":
    main()
