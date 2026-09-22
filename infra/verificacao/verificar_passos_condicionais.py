#!/usr/bin/env python3
"""Nenhum passo de workflow pode ser pulado por uma premissa que o proprio job mediu.

=========================================================================
O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
=========================================================================

Ate a BICHUS-219 todos os passos do job `codigo` carregavam

    if: steps.existe.outputs.tem == 'sim'

e o passo `existe` so fazia `[ -f package.json ]`. Sem esse arquivo, lint,
typecheck, conferencia de tipos gerados e `npm test` eram TODOS pulados, e o
job reportava **success**.

O `portao` recusa `skipped`, mas so no nivel de JOB:

    skipped) echo "::error::um job foi pulado. Portao que nao roda nao aprova"

Passo pulado dentro de job que reporta sucesso nao passa por ali. Era o mesmo
defeito do `if: secrets.SONAR_TOKEN != ''` que o job `sonar` recusa por escrito,
com a diferenca de estar um nivel abaixo, onde ninguem olhava.

=========================================================================
A REGRA, E POR QUE ELA E UMA LISTA DO QUE PODE
=========================================================================

Condicao de passo e legitima quando fala do EVENTO ou do RESULTADO:

    if: github.event_name == 'pull_request'     o passo so faz sentido em PR
    if: failure()                               diagnostico depois da queda
    if: always()                                derrubar a pilha
    if: success()                               publicar o artefato

Condicao de passo e ilegitima quando fala de uma PREMISSA que o proprio job
descobriu em execucao: `steps.<id>.outputs.*`, `env.*` escrito via `$GITHUB_ENV`,
`hashFiles(...)`. Nesses casos o passo essencial some sem que nada fique
vermelho, e o job anuncia que verificou o que nem chegou a olhar.

A lista aqui e de **permitidos**, nao de proibidos, e isso e deliberado: forma
que este portao nao reconhece REPROVA. Um portao com lista de proibidos aprova
tudo que ele nao previu -- e o que ele nao previu e exatamente a forma nova que
alguem vai escrever amanha.

Condicao de JOB fica de fora: `portao` recusa `skipped` no nivel de job, e e la
que esse caso pertence. Este arquivo cuida do nivel abaixo.

=========================================================================
A PROVA NEGATIVA RODA JUNTO, SEMPRE
=========================================================================

As iscas de `iscas/passos-condicionais/` rodam ANTES dos workflows de verdade, e
cada uma isola UMA regra. Isca que reprova por dois motivos deixa o autoteste
verde no dia em que a regra que ela existia para testar for desligada -- medido
neste repositorio, nao suposto.

E a emptiness: workflow nenhum, passo nenhum, ou leitura que nao achou nada
REPROVA. Um portao que nao achou o que conferir e indistinguivel de um portao
que conferiu e aprovou.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
WORKFLOWS = RAIZ / ".github" / "workflows"
ISCAS = Path(__file__).resolve().parent / "iscas" / "passos-condicionais"

# Funcoes de estado do proprio job. Elas nao pulam trabalho essencial: elas
# ACRESCENTAM passo conforme o job ja terminou de um jeito ou de outro.
FUNCOES_DE_RESULTADO = {"success", "failure", "always", "cancelled"}

# Funcoes puras de texto. Elas nao trazem estado nenhum -- o estado vem dos
# argumentos, que sao conferidos como qualquer outro token. `hashFiles` NAO esta
# aqui de proposito: ela le o disco em tempo de execucao, que e exatamente a
# premissa-descoberta-pelo-job que este portao existe para recusar.
FUNCOES_PURAS = {"contains", "startswith", "endswith", "format", "join", "tojson", "fromjson"}

# Contextos que falam do evento e do ambiente da execucao, nunca do que o job
# mediu sobre si mesmo.
CONTEXTOS_PERMITIDOS = {"github", "runner", "matrix", "strategy", "inputs"}

# Os que o portao reconhece e RECUSA. Separados dos desconhecidos de proposito:
# sao motivos diferentes, e cada isca precisa reprovar pelo seu. Uma isca que
# reprova pelo motivo do vizinho aprova a regra quebrada.
CONTEXTOS_DO_PROPRIO_JOB = {"steps", "env", "needs", "job", "jobs", "vars", "secrets"}

LITERAIS = {"true", "false", "null"}

TOKEN = re.compile(r"([A-Za-z_][A-Za-z0-9_.\-]*)\s*(\()?")
ABRE_STEPS = re.compile(r"^(\s*)steps:\s*$")
ABRE_IF = re.compile(r"^(\s*)(?:-\s+)?if:\s*(.*)$")
ITEM_DE_LISTA = re.compile(r"^\s*-\s+\S")


def sem_comentario(linha: str) -> str:
    """Tira o comentario `#` respeitando aspas. `'a # b'` nao e comentario."""
    fora = True
    aspa = ""
    for i, c in enumerate(linha):
        if fora and c in "'\"":
            fora, aspa = False, c
        elif not fora and c == aspa:
            fora = True
        elif fora and c == "#" and (i == 0 or linha[i - 1] in " \t"):
            return linha[:i]
    return linha


def indentacao(linha: str) -> int:
    return len(linha) - len(linha.lstrip(" "))


class Passo:
    """Um `if:` em nivel de passo, com o suficiente para nomear onde ele esta."""

    def __init__(self, arquivo: str, linha: int, expressao: str) -> None:
        self.arquivo = arquivo
        self.linha = linha
        self.expressao = expressao


def ler_workflow(texto: str, nome: str) -> tuple[list[Passo], int, int]:
    """Devolve (`if:` de passo, quantidade de passos, quantidade de `if:` de job).

    A distincao entre passo e job e por INDENTACAO: tudo que esta mais fundo que
    a linha `steps:` pertence a um passo; o resto, nao. Sem isso o `if: always()`
    do job `portao` seria lido como passo, e a conferencia acusaria onde nao ha.
    """
    passos_com_if: list[Passo] = []
    quantos_passos = 0
    ifs_de_job = 0

    linhas = texto.splitlines()
    indent_steps: int | None = None
    i = 0
    while i < len(linhas):
        bruta = linhas[i]
        limpa = sem_comentario(bruta).rstrip()
        i += 1
        if not limpa.strip():
            continue

        if indent_steps is not None and indentacao(limpa) <= indent_steps:
            indent_steps = None

        if (m := ABRE_STEPS.match(limpa)) is not None:
            indent_steps = len(m.group(1))
            continue

        if ITEM_DE_LISTA.match(limpa) and indent_steps is not None:
            quantos_passos += 1

        if (m := ABRE_IF.match(limpa)) is None:
            continue

        expressao = m.group(2).strip()
        # Escalar de bloco (`|`, `>`, `>-`, `|-`): a expressao esta nas linhas
        # seguintes, mais indentadas. Sem este ramo o portao leria `>-` como
        # expressao vazia e aprovaria a condicao inteira sem ter olhado para ela.
        if expressao in {"|", ">", "|-", ">-", "|+", ">+"}:
            # A indentacao que vale e a da CHAVE, nao a da linha: em `- if: >-`
            # a chave comeca depois do tracinho, e medir a linha fazia o `run:`
            # seguinte ser engolido para dentro da expressao. A isca de bloco
            # passou a reprovar por QUATRO motivos, tres deles vindos do texto
            # engolido -- e isca que reprova por varios motivos deixa o autoteste
            # verde quando a regra que ela testava e desligada.
            alvo = limpa.index("if:")
            juntas: list[str] = []
            while i < len(linhas):
                seguinte = sem_comentario(linhas[i]).rstrip()
                if seguinte.strip() and indentacao(seguinte) <= alvo:
                    break
                juntas.append(seguinte.strip())
                i += 1
            expressao = " ".join(p for p in juntas if p)

        if indent_steps is None:
            ifs_de_job += 1
            continue
        passos_com_if.append(Passo(nome, i, expressao))

    return passos_com_if, quantos_passos, ifs_de_job


def sem_texto(expressao: str) -> str:
    """Tira literais de texto e a casca `${{ }}`, que nao carregam identificador."""
    sem = re.sub(r"'[^']*'", "''", expressao)
    sem = re.sub(r'"[^"]*"', '""', sem)
    return sem.replace("${{", " ").replace("}}", " ")


def julgar(expressao: str) -> list[str]:
    """Os motivos pelos quais esta condicao de passo e inaceitavel. Vazio e aprovacao."""
    corpo = sem_texto(expressao)
    if not corpo.strip():
        return [
            "condicao vazia. Ou ela nao foi lida, ou ela nao decide nada; "
            "nos dois casos nao da para afirmar que o passo roda"
        ]

    motivos: list[str] = []
    for casado in TOKEN.finditer(corpo):
        token = casado.group(1)
        chamada = casado.group(2) is not None
        baixo = token.lower()

        if chamada:
            if baixo == "hashfiles":
                motivos.append(
                    "`hashFiles(...)` le o disco em tempo de execucao: e premissa que o "
                    "proprio job descobre, e passo pulado por ela some sem nada ficar vermelho"
                )
                continue
            if baixo in FUNCOES_DE_RESULTADO or baixo in FUNCOES_PURAS:
                continue
            motivos.append(
                f"funcao `{token}()`, que este portao nao reconhece. Forma nao reconhecida "
                "REPROVA: lista de permitidos existe para nao aprovar o que ninguem previu"
            )
            continue

        if "." in token:
            raiz = token.split(".", 1)[0].lower()
            if raiz in CONTEXTOS_PERMITIDOS:
                continue
            if raiz in CONTEXTOS_DO_PROPRIO_JOB:
                motivos.append(
                    f"`{token}` depende de `{raiz}`, que e estado do proprio job e nao do "
                    "evento. Passo essencial pulado por isso deixa o job reportar sucesso "
                    "sem ter verificado"
                )
                continue
            motivos.append(
                f"contexto `{raiz}` (em `{token}`), que este portao nao reconhece. "
                "Forma nao reconhecida REPROVA"
            )
            continue

        if baixo in LITERAIS or baixo in FUNCOES_DE_RESULTADO or baixo in FUNCOES_PURAS:
            continue
        motivos.append(
            f"identificador `{token}` solto, que este portao nao reconhece. "
            "Forma nao reconhecida REPROVA"
        )

    return motivos


def conferir(arquivos: list[Path]) -> tuple[int, list[str]]:
    """Confere a lista de workflows. Devolve (passos vistos, queixas)."""
    queixas: list[str] = []
    total_de_passos = 0
    total_de_ifs_de_job = 0

    for caminho in sorted(arquivos):
        passos, quantos, ifs_de_job = ler_workflow(
            caminho.read_text(encoding="utf-8"), caminho.name
        )
        total_de_passos += quantos
        total_de_ifs_de_job += ifs_de_job
        for passo in passos:
            for motivo in julgar(passo.expressao):
                queixas.append(
                    f"{passo.arquivo}:{passo.linha}: `if: {passo.expressao}` -- {motivo}"
                )

    if total_de_ifs_de_job:
        print(f"  ({total_de_ifs_de_job} condicao(oes) em nivel de JOB, que sao do `portao`)")
    return total_de_passos, queixas


# =========================================================================
# AS ISCAS. Uma regra por arquivo, e nenhuma cadeia: numa cadeia o ultimo ramo
# recolhe o que os outros deixam cair, e a isca passa a reprovar por dois
# motivos ao mesmo tempo -- que e como desligar a regra testada deixa o
# autoteste verde. Medido neste repositorio.
# =========================================================================
# O quarto campo e o MOTIVO esperado, e ele nao e zelo: a isca da BICHUS-164
# ficou verde casando com a mencao ao proprio mecanismo dentro de um comentario,
# e duas iscas daqui reprovavam parcialmente pelo motivo do vizinho ate serem
# medidas. O autoteste exige que TODO motivo levantado contenha este fragmento
# -- um motivo a mais, de outra regra, reprova o autoteste.
CASOS: list[tuple[str, bool, str, str]] = [
    # (arquivo, precisa aprovar, o que o caso isola, fragmento do motivo certo)
    ("deve-aprovar-evento-e-resultado.yml", True, "as quatro formas legitimas de condicao de passo", ""),
    ("deve-aprovar-condicao-de-job.yml", True, "`needs.*` em nivel de JOB nao e assunto deste portao", ""),
    ("deve-reprovar-steps-outputs.yml", False, "o defeito de 22/09, identico: `steps.<id>.outputs.*`",
     "depende de `steps`"),
    ("deve-reprovar-env.yml", False, "`env.*`, que o passo anterior escreve via $GITHUB_ENV",
     "depende de `env`"),
    ("deve-reprovar-hashfiles.yml", False, "`hashFiles(...)`, premissa lida do disco em execucao",
     "`hashFiles(...)` le o disco"),
    ("deve-reprovar-forma-desconhecida.yml", False, "contexto que o portao nao reconhece",
     "contexto `contexto_novo`"),
    ("deve-reprovar-bloco-multilinha.yml", False, "a mesma premissa escrita em escalar de bloco `>-`",
     "depende de `steps`"),
]

# Este nao passa por `julgar`: ele prova que descoberta vazia REPROVA.
ISCA_SEM_PASSO = "deve-reprovar-sem-passo-nenhum.yml"


def autoteste() -> int:
    falhas = 0
    print(f"autoteste do portao de passos condicionais ({len(CASOS) + 1} casos)")

    for arquivo, precisa_aprovar, descricao, fragmento in CASOS:
        caminho = ISCAS / arquivo
        if not caminho.is_file():
            print(f"  [ FALTA  ] {arquivo}: isca ausente")
            falhas += 1
            continue
        passos = ler_workflow(caminho.read_text(encoding="utf-8"), arquivo)[0]
        queixas: list[str] = []
        for passo in passos:
            queixas.extend(julgar(passo.expressao))

        if not passos and not precisa_aprovar:
            print(f"  [ FALHOU  ] {descricao}: a isca nao tem passo com `if:` para julgar")
            falhas += 1
            continue
        if not precisa_aprovar and not passos:
            continue

        aprovou = not queixas
        if aprovou != precisa_aprovar:
            falhas += 1
            esperado = "aprovar" if precisa_aprovar else "REPROVAR"
            print(f"  [ FALHOU  ] {descricao}: precisava {esperado}")
            for q in queixas:
                print(f"               {q}")
            continue

        # Reprovou: pelo motivo certo, e SO por ele.
        if not precisa_aprovar:
            erradas = [q for q in queixas if fragmento not in q]
            if erradas:
                falhas += 1
                print(f"  [ FALHOU  ] {descricao}: reprovou pelo motivo ERRADO")
                print(f"               esperado: ...{fragmento}...")
                for q in erradas:
                    print(f"               veio:     {q}")
                continue
        print(f"  [    ok   ] {descricao}")

    caminho = ISCAS / ISCA_SEM_PASSO
    if not caminho.is_file():
        print(f"  [ FALTA  ] {ISCA_SEM_PASSO}: isca ausente")
        falhas += 1
    else:
        vistos, _ = conferir([caminho])
        if vistos == 0:
            print("  [    ok   ] descoberta vazia REPROVA: workflow sem passo nenhum")
        else:
            falhas += 1
            print(
                f"  [ FALHOU  ] descoberta vazia: a isca sem passo devolveu {vistos} passo(s). "
                "A contagem que sustenta a emptiness esta contando outra coisa"
            )

    if falhas:
        print(
            f"\nREPROVADO: {falhas} caso(s) de autoteste. O portao de passos condicionais "
            "deixou de enxergar o que ele existe para enxergar, e o verde dele parou de "
            "significar alguma coisa"
        )
        return 1
    print(f"\nautoteste APROVADO: {sum(1 for c in CASOS if not c[1]) + 1} caso(s) reprovam, "
          f"cada um pelo motivo que ele isola, e {sum(1 for c in CASOS if c[1])} aprovam")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--autoteste", action="store_true", help="so as iscas")
    args = parser.parse_args(argv[1:])

    if autoteste() != 0:
        return 1
    if args.autoteste:
        return 0

    if not WORKFLOWS.is_dir():
        print(f"\nREPROVADO: {WORKFLOWS} nao existe. Sem workflow nao ha o que conferir, "
              "e aprovar aqui seria aprovar sem ter olhado")
        return 1
    arquivos = sorted(p for p in WORKFLOWS.glob("*.yml"))
    if not arquivos:
        print(f"\nREPROVADO: nenhum *.yml em {WORKFLOWS}. Ou a esteira sumiu, ou esta leitura "
              "ficou cega; nos dois casos este portao nao conferiu nada")
        return 1

    print(f"\nworkflows conferidos: {', '.join(p.name for p in arquivos)}")
    total_de_passos, queixas = conferir(arquivos)

    if total_de_passos == 0:
        print(f"\nREPROVADO: li {len(arquivos)} workflow(s) e nao achei passo NENHUM. "
              "A forma do arquivo mudou e esta leitura ficou cega")
        return 1

    print(f"passos lidos: {total_de_passos}")
    if queixas:
        print(f"\nREPROVADO: {len(queixas)} passo(s) condicionados a premissa do proprio job.")
        for q in queixas:
            print(f"  - {q}")
        print(
            "\nPasso pulado dentro de job que reporta sucesso nao e pego pelo `portao`: ele "
            "recusa `skipped` so no nivel de job. Se a premissa precisa valer, afirme-a num "
            "passo que REPROVA quando ela nao vale, em vez de condicionar os outros a ela."
        )
        return 1

    print(f"\nAPROVADO: nenhum dos {total_de_passos} passos e pulado por premissa que o "
          "proprio job mediu")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
