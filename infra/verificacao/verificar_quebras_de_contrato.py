#!/usr/bin/env python3
"""Le a saida JSON do `oasdiff breaking` e decide contra as dispensas datadas.

Existe porque as duas saidas preguicosas sao piores que o problema:

- `continue-on-error: true` no passo do oasdiff desliga o portao inteiro, e
  desligamento nao volta atras;
- uma entrada em `.github/quality-gates.yml` que nenhum passo le e a dispensa
  INERTE que ja aconteceu neste repositorio uma vez (o veredito do SonarCloud,
  em 18/09): o log anunciava que a dispensa valia, e ela nao valia.

A dispensa aqui e por MUDANCA, e nao por portao. Uma entrada dispensa
exatamente um par `id da regra` + `operationId`; qualquer outra quebra reprova
o passo, inclusive outra quebra na mesma operacao. Portao que aceita "tudo que
vier desta rota" nao e portao com excecao, e portao desligado com data.

O VENCIMENTO nao e conferido aqui, e isso e deliberado: quem confere e
`verificar_dispensas.py`, no job `rapidos`, do qual o job `contrato` depende.
Dispensa vencida derruba `rapidos` e este passo nem chega a executar. Conferir
nos dois lugares criaria duas definicoes de "vencida" para divergirem.

Uso:
    verificar_quebras_de_contrato.py <quebras.json> [quality-gates.yml]
    verificar_quebras_de_contrato.py --autoteste
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# `level` do oasdiff: 3 e ERR, que e o que `--fail-on ERR` reprova.
NIVEL_DE_ERRO = 3
PREFIXO_DA_DISPENSA = "oasdiff-"


def chave(quebra: dict) -> str:
    """`id da regra` + `operationId`, que e o que uma dispensa nomeia."""
    return f"{quebra.get('id', '?')} {quebra.get('operationId', '?')}"


def dispensas_de_mudanca(caminho: Path) -> set[str]:
    """As mudancas dispensadas, lidas das entradas `oasdiff-*`.

    Entrada de portao `oasdiff-*` SEM campo `mudanca` e erro de fiacao, e nao
    dispensa vazia: ela dispensaria nada e pareceria dispensar algo.
    """
    if not caminho.is_file():
        raise SystemExit(f"REPROVA: {caminho} nao encontrado: nao da para saber o que esta dispensado")
    atual: dict[str, str] = {}
    entradas: list[dict[str, str]] = []
    for bruta in caminho.read_text(encoding="utf-8").splitlines():
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip() or linha.strip() == "dispensas:":
            continue
        if m := re.fullmatch(r"\s*-\s*(\w+):\s*(.+)", linha):
            atual = {m.group(1): m.group(2).strip().strip('"')}
            entradas.append(atual)
        elif m := re.fullmatch(r"\s+(\w+):\s*(.+)", linha):
            atual[m.group(1)] = m.group(2).strip().strip('"')

    dispensadas: set[str] = set()
    for entrada in entradas:
        portao = entrada.get("portao", "")
        if not portao.startswith(PREFIXO_DA_DISPENSA):
            continue
        mudanca = entrada.get("mudanca")
        if not mudanca:
            raise SystemExit(
                f"REPROVA: a dispensa `{portao}` nao diz QUAL mudanca ela dispensa. "
                "Acrescente `mudanca: <id-da-regra> <operationId>`: dispensa sem alvo "
                "dispensa tudo, e e assim que um portao morre sem ninguem decidir isso."
            )
        dispensadas.add(mudanca)
    return dispensadas


def avaliar(quebras: list[dict], dispensadas: set[str]) -> tuple[int, list[str]]:
    """Devolve (codigo de saida, linhas a imprimir)."""
    erros = [q for q in quebras if q.get("level", 0) >= NIVEL_DE_ERRO]
    if not erros:
        return 0, ["APROVADO: nenhuma quebra de contrato contra a base"]

    linhas: list[str] = []
    nao_dispensadas = []
    for quebra in erros:
        k = chave(quebra)
        texto = quebra.get("text", "")
        if k in dispensadas:
            linhas.append(
                f"::warning::quebra de contrato ACEITA por dispensa datada em "
                f".github/quality-gates.yml: {k} -- {texto}. Isto nao e um portao verde: "
                f"e uma quebra registrada com prazo."
            )
        else:
            nao_dispensadas.append(k)
            linhas.append(f"::error::quebra de contrato SEM dispensa: {k} -- {texto}")

    if nao_dispensadas:
        linhas.append(
            f"REPROVADO: {len(nao_dispensadas)} quebra(s) sem dispensa. "
            "Ou a mudanca e compativel e precisa ser reescrita, ou ela e incompativel "
            "de proposito e precisa de uma entrada datada com motivo e responsavel."
        )
        return 1, linhas

    linhas.append(f"APROVADO com {len(erros)} quebra(s) dispensada(s), todas nomeadas acima")
    return 0, linhas


def autoteste() -> int:
    """As iscas. Um filtro que nao filtra aprova tudo e ninguem desconfia."""
    casos = [
        (
            "sem quebra nenhuma aprova",
            [],
            set(),
            0,
        ),
        (
            "quebra sem dispensa REPROVA",
            [{"id": "request-body-added-required", "operationId": "logout", "level": 3}],
            set(),
            1,
        ),
        (
            "quebra com a dispensa exata passa",
            [{"id": "request-body-added-required", "operationId": "logout", "level": 3}],
            {"request-body-added-required logout"},
            0,
        ),
        (
            "dispensa de OUTRA operacao nao serve",
            [{"id": "request-body-added-required", "operationId": "login", "level": 3}],
            {"request-body-added-required logout"},
            1,
        ),
        (
            "dispensa de OUTRA regra na mesma operacao nao serve",
            [{"id": "response-property-removed", "operationId": "logout", "level": 3}],
            {"request-body-added-required logout"},
            1,
        ),
        (
            "quebra dispensada junto com uma nao dispensada REPROVA",
            [
                {"id": "request-body-added-required", "operationId": "logout", "level": 3},
                {"id": "api-removed-without-deprecation", "operationId": "login", "level": 3},
            ],
            {"request-body-added-required logout"},
            1,
        ),
        (
            "aviso (nivel abaixo de ERR) nao reprova",
            [{"id": "request-body-became-optional", "operationId": "login", "level": 2}],
            set(),
            0,
        ),
    ]
    falhas = 0
    for nome, quebras, dispensadas, esperado in casos:
        codigo, _ = avaliar(quebras, dispensadas)
        marca = "ok" if codigo == esperado else "FALHOU"
        if codigo != esperado:
            falhas += 1
        print(f"  [{marca:>6}] {nome} (esperava {esperado}, veio {codigo})")
    if falhas:
        print(f"\nREPROVA: o autoteste do filtro falhou em {falhas} caso(s). "
              "Um filtro que nao filtra aprova tudo em silencio.")
        return 1
    print("\nautoteste: o filtro de dispensas reprova o que deve reprovar")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) > 1 and argv[1] == "--autoteste":
        return autoteste()
    if len(argv) < 2:
        print(__doc__)
        return 2

    quebras_bruto = Path(argv[1]).read_text(encoding="utf-8").strip()
    quebras = json.loads(quebras_bruto) if quebras_bruto else []
    if not isinstance(quebras, list):
        print(f"REPROVA: {argv[1]} nao contem a lista JSON do `oasdiff breaking`")
        return 1

    gates = Path(argv[2]) if len(argv) > 2 else Path(".github/quality-gates.yml")
    codigo, linhas = avaliar(quebras, dispensas_de_mudanca(gates))
    for linha in linhas:
        print(linha)
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv))
