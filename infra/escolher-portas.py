#!/usr/bin/env python3
"""Escolhe, fixa e confere o par de portas DESTA maquina (BICHUS-211).

O problema: `make up` sem argumento usava 3000 e 3001, e numa maquina
compartilhada essas duas sao as mais disputadas que existem. A subida morria em
`Bind for 0.0.0.0:3000 failed: port is already allocated`, que e mensagem do
Docker e nao nossa -- ela diz que a porta esta ocupada e NAO diz qual usar.

A saida escolhida foi a (b) da issue: um arquivo de sobreposicao por maquina,
`portas.local.mk`, fora do git. Ele e gerado uma vez, com o primeiro par livre,
e a partir dai o endereco **nao muda mais entre execucoes** -- e isso e o ponto.
Procurar porta livre a cada subida (saida (c)) faria o endereco variar, e o
teste com segundo aparelho fisico da secao 3.10 depende de o endereco do QR
continuar valendo entre uma subida e a seguinte. Mudar o padrao versionado
(saida (a)) so empurraria a colisao para a proxima maquina.

O arquivo e do desenvolvedor: editar o numero la dentro e a forma suportada de
fixar outra porta. `make portas` reescolhe do zero.

Este script NAO garante o acordo entre porta publicada e URL base. Quem garante
isso e `verificar_portas.py`, que le a configuracao renderizada pelo proprio
compose. Aqui so se escolhe o numero; la se prova que o numero chegou nos dois
lugares.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import socket
import subprocess
import sys
from pathlib import Path

# Pares candidatos, na ordem de preferencia. O 3000/3001 vem primeiro de
# proposito: em maquina sem conflito nada muda, e o endereco que o README, a
# esteira e os comentarios citam continua sendo o verdadeiro.
CANDIDATOS: list[tuple[int, int]] = [
    (3000, 3001),
    (3200, 3201),
    (3300, 3301),
    (3400, 3401),
    (3500, 3501),
]

NOME_PADRAO = "portas.local.mk"


def porta_livre(porta: int) -> bool:
    """Tenta amarrar a porta em 0.0.0.0, sem SO_REUSEADDR.

    Sem `SO_REUSEADDR` o bind falha tambem quando outro processo segura a porta
    so no loopback, que e exatamente como o Docker publica por padrao
    (`BIND_HOST=127.0.0.1`). Com a opcao ligada, os dois binds conviveriam e a
    sonda responderia "livre" para uma porta ocupada -- sonda que erra para o
    lado do otimismo e pior que sonda nenhuma.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("0.0.0.0", porta))
        except OSError:
            return False
    return True


def par_livre(par: tuple[int, int]) -> bool:
    return all(porta_livre(p) for p in par)


def portas_da_nossa_borda() -> set[int]:
    """Portas do hospedeiro que a borda DESTA pilha ja publica.

    Sem isto a escolha se sabota: com a pilha de pe na 3200, a sonda ve a 3200
    ocupada -- por nos mesmos --, escolhe outro par, e a subida seguinte muda o
    endereco. Endereco que muda entre execucoes e exatamente a saida (c) que
    esta issue descartou, porque quebra o teste com segundo aparelho fisico da
    secao 3.10: o QR ja impresso no papel continua apontando para o anterior.

    Devolve conjunto vazio quando o docker nao responde. Isso so torna a escolha
    mais conservadora (a porta conta como ocupada), nunca mais permissiva.
    """
    try:
        r = subprocess.run(
            ["docker", "compose", "ps", "--format", "json", "edge"],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return set()
    if r.returncode != 0:
        return set()
    achadas: set[int] = set()
    # A saida e uma linha por servico (JSON Lines) nas versoes atuais, e um
    # array nas antigas. As duas formas sao aceitas de proposito: este script
    # roda na maquina de quem desenvolve, e la a versao do compose e a que for.
    linhas = [l for l in r.stdout.splitlines() if l.strip()]
    registros: list[dict] = []
    for linha in linhas:
        try:
            dado = json.loads(linha)
        except json.JSONDecodeError:
            continue
        registros.extend(dado if isinstance(dado, list) else [dado])
    for reg in registros:
        for pub in reg.get("Publishers") or []:
            porta = pub.get("PublishedPort")
            if isinstance(porta, int) and porta > 0:
                achadas.add(porta)
    return achadas


def escolher(sem_mecanismo: bool = False,
             candidatos: list[tuple[int, int]] | None = None,
             nossas: set[int] | None = None) -> tuple[int, int] | None:
    """Primeiro par candidato com as duas portas livres.

    `sem_mecanismo` desliga a sonda e devolve sempre o primeiro candidato. E o
    comportamento de antes desta issue, e existe para que a isca de
    `verificar_escolha_de_portas.py` tenha o que reprovar: prova negativa que
    vive numa frase evapora.

    `candidatos` troca a lista de producao por outra. So o verificador usa, e
    com portas altas que ele mesmo ocupa -- exercitar a escolha amarrando a 3000
    de uma maquina de trabalho mexeria em quem esta usando a 3000.
    """
    lista = candidatos if candidatos is not None else CANDIDATOS
    if sem_mecanismo:
        return lista[0]
    minhas = nossas or set()
    for par in lista:
        if all(p in minhas or porta_livre(p) for p in par):
            return par
    return None


def _sem_par_livre() -> int:
    print("REPROVA: nenhum par candidato esta livre nesta maquina.")
    print(f"  candidatos sondados: {', '.join(f'{a}/{b}' for a, b in CANDIDATOS)}")
    print("  Libere um par, ou escolha o seu com `make up PORTA=<n> PORTA_MIDIA=<n+1>`")
    print("  e grave a escolha em portas.local.mk para nao precisar repetir.")
    return 1


def escrever(destino: Path) -> int:
    par = escolher(nossas=portas_da_nossa_borda())
    if par is None:
        return _sem_par_livre()
    app, midia = par
    hoje = _dt.date.today().isoformat()
    destino.write_text(
        f"""# Portas desta maquina. GERADO em {hoje} por `make portas` (BICHUS-211).
#
# NAO E VERSIONADO, e de proposito: o par livre de uma maquina nao e o par
# livre da proxima. Editar os dois numeros aqui e a forma suportada de fixar
# outra porta -- eles valem para toda subida, e o par fica o MESMO entre
# execucoes.
#
# NAO edite as URLs do `.env` para trocar de porta. O Makefile deriva
# PUBLIC_BASE_URL, TAG_BASE_URL, WEB_BASE_URL, API_BASE_URL e
# MEDIA_PUBLIC_BASE_URL destes dois numeros, juntas. Mexer so no `.env` faz o
# servico subir, a sonda passar e todo link de tag e de e-mail apontar para uma
# porta que nao responde -- e `make verificar-portas` reprova exatamente isso.
#
# Reescolher do zero: `make portas`.
PORTA ?= {app}
PORTA_MIDIA ?= {midia}
""",
        encoding="utf-8",
    )
    print(f"portas desta maquina: {app} (aplicacao) e {midia} (midia) -> {destino}")
    if (app, midia) != CANDIDATOS[0]:
        a0, m0 = CANDIDATOS[0]
        print(f"  {a0}/{m0} estao ocupadas por outro processo nesta maquina.")
    return 0


def _edge_desta_pilha_publica(porta: int) -> bool:
    """A porta esta ocupada pela NOSSA borda, ja de pe?

    `make up` sobre uma pilha que ja subiu e o caso normal, e nele a porta esta
    ocupada por nos mesmos. Recusar ali seria transformar um comando idempotente
    em erro.
    """
    try:
        saida = subprocess.run(
            ["docker", "compose", "port", "edge", str(porta)],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return saida.returncode == 0 and saida.stdout.strip() != ""


def conferir(app: int, midia: int) -> int:
    """Troca a mensagem do Docker pela nossa quando a porta ja e de outro.

    Isto NAO e um portao e nao aprova nada: quando ele deixa passar, o Docker
    ainda tenta amarrar e falha do jeito dele. Ele so existe porque
    `port is already allocated` nao diz qual porta usar, e esta issue nasceu de
    uma manha perdida nessa mensagem. O portao do invariante e
    `verificar_portas.py`.
    """
    ocupadas = [p for p in (app, midia) if not porta_livre(p)]
    if not ocupadas:
        return 0
    nossas = [p for p in ocupadas if _edge_desta_pilha_publica(p)]
    if len(nossas) == len(ocupadas):
        return 0

    alternativa = next((par for par in CANDIDATOS if par_livre(par)), None)
    alheias = ", ".join(str(p) for p in ocupadas if p not in nossas)
    print(f"porta ocupada por outro processo: {alheias}")
    print(f"  esta pilha esta configurada para {app} (aplicacao) e {midia} (midia).")
    if alternativa is None:
        print("  nenhum par candidato esta livre. Libere uma porta ou escolha uma a mao:")
        print("    make up PORTA=<n> PORTA_MIDIA=<n+1>")
    else:
        a, m = alternativa
        print(f"  livre agora: {a} e {m}. Para fixar este par nesta maquina:")
        print(f"    make portas   # reescolhe e grava em {NOME_PADRAO}")
        print(f"  Para usar so nesta subida, sem fixar:  make up PORTA={a} PORTA_MIDIA={m}")
    print("  Nao troque a porta editando as URLs do .env: o Makefile deriva as cinco")
    print("  URLs base de PORTA e PORTA_MIDIA, e mexer so no .env gera link que nao responde.")
    return 1


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--escrever", metavar="ARQUIVO", help=f"grava o par escolhido (ex.: {NOME_PADRAO})")
    g.add_argument("--imprimir", action="store_true", help="imprime `app midia` e sai")
    g.add_argument("--conferir", nargs=2, type=int, metavar=("APP", "MIDIA"),
                   help="confere se o par esta livre e, se nao, diz qual usar")
    p.add_argument("--sem-mecanismo", action="store_true",
                   help="desliga a sonda e devolve sempre o primeiro candidato (isca)")
    a = p.parse_args(argv[1:])

    if a.escrever:
        return escrever(Path(a.escrever))
    if a.imprimir:
        par = escolher(sem_mecanismo=a.sem_mecanismo)
        if par is None:
            return _sem_par_livre()
        print(f"{par[0]} {par[1]}")
        return 0
    return conferir(a.conferir[0], a.conferir[1])


if __name__ == "__main__":
    sys.exit(main(sys.argv))
