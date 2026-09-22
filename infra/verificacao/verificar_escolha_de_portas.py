#!/usr/bin/env python3
"""`make up` sem argumento nao pode morrer no bind havendo par livre. BICHUS-211.

A segunda isca da issue, e a barata. A primeira (`verificar_portas.py`) protege
o invariante entre porta publicada e URL base; esta protege o comportamento de
`make up` **sem argumento** numa maquina onde o par padrao ja e de outro
projeto -- que e a maquina de quem desenvolve este produto, medido em 22/09:

    :3000 -> talent-search-backend   :3001 -> leega-content-backend

O criterio e um so: o par que a escolha devolve precisa estar LIVRE. Se ela
devolver um par ocupado existindo par livre, `make up` morre em
`Bind for 0.0.0.0:3000 failed: port is already allocated` e a issue voltou.

A prova de que este verificador verifica esta no cenario `sem mecanismo`: com a
sonda desligada a escolha volta a ser o padrao fixo de antes da issue, e o
criterio precisa REPROVAR. Verificacao cuja falha ninguem consegue reexecutar
vale por confianca no dia em que foi escrita.

Nao usa docker e nao sobe nada. As portas do cenario sao altas e ocupadas pelo
proprio processo, por um socket que morre com ele: exercitar a escolha amarrando
a 3000 de uma maquina de trabalho atrapalharia quem esta usando a 3000.
"""
from __future__ import annotations

import argparse
import importlib.util
import socket
import sys
from contextlib import ExitStack
from pathlib import Path

# Faixa efemera alta, fora do alcance de qualquer servico deste projeto.
OCUPADO = (45000, 45001)
LIVRE = (45100, 45101)


def _carregar_escolha(raiz: Path):
    # O nome do arquivo tem hifen e nao e importavel; e sem isto o import deixa
    # um `infra/__pycache__` para tras na arvore de trabalho de quem so rodou
    # um portao.
    sys.dont_write_bytecode = True
    caminho = raiz / "infra" / "escolher-portas.py"
    if not caminho.is_file():
        print(f"REPROVA: {caminho} nao existe. Sem o mecanismo nao ha o que verificar")
        raise SystemExit(1)
    spec = importlib.util.spec_from_file_location("escolher_portas", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def _ocupar(pilha: ExitStack, portas: tuple[int, int]) -> None:
    for porta in portas:
        s = pilha.enter_context(socket.socket(socket.AF_INET, socket.SOCK_STREAM))
        s.bind(("0.0.0.0", porta))
        s.listen(1)


def _criterio(escolha, par) -> tuple[bool, str]:
    if par is None:
        return False, "a escolha nao devolveu par nenhum"
    if not escolha.par_livre(par):
        return False, f"a escolha devolveu {par[0]}/{par[1]}, e {par[0]}/{par[1]} esta ocupada"
    return True, f"a escolha devolveu {par[0]}/{par[1]}, livre"


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raiz", default=".", help="raiz do repositorio (padrao: .)")
    a = p.parse_args(argv[1:])
    raiz = Path(a.raiz).resolve()
    escolha = _carregar_escolha(raiz)

    candidatos = [OCUPADO, LIVRE]
    falhas: list[str] = []
    print("escolha de portas - cenario: o primeiro candidato esta ocupado e existe par livre")

    try:
        with ExitStack() as pilha:
            _ocupar(pilha, OCUPADO)
            if escolha.par_livre(OCUPADO):
                print(f"REPROVA: nao consegui ocupar {OCUPADO[0]}/{OCUPADO[1]} de verdade. "
                      "Sem a precondicao o cenario nao prova nada, entao ele reprova")
                return 1
            if not escolha.par_livre(LIVRE):
                print(f"REPROVA: {LIVRE[0]}/{LIVRE[1]} ja estao em uso nesta maquina. "
                      "O cenario precisa de um par livre para ter o que escolher")
                return 1

            com = escolha.escolher(candidatos=candidatos)
            ok_com, motivo_com = _criterio(escolha, com)
            print(f"  [{'ok  ' if ok_com else 'ERRO'}] com o mecanismo   devia APROVAR   -> {motivo_com}")
            if not ok_com:
                falhas.append("com o mecanismo ligado a escolha entregou par ocupado: "
                              "`make up` sem argumento morre no bind")

            sem = escolha.escolher(candidatos=candidatos, sem_mecanismo=True)
            ok_sem, motivo_sem = _criterio(escolha, sem)
            print(f"  [{'ok  ' if not ok_sem else 'ERRO'}] sem o mecanismo  devia REPROVAR  -> {motivo_sem}")
            if ok_sem:
                falhas.append("com o mecanismo DESLIGADO o criterio aprovou. "
                              "Este verificador parou de enxergar o defeito que existe para pegar")

        # Cenario real: a lista de producao, nesta maquina, agora.
        real = escolha.escolher()
        ok_real, motivo_real = _criterio(escolha, real)
        print("nesta maquina, com a lista de producao "
              f"({', '.join(f'{x}/{y}' for x, y in escolha.CANDIDATOS)}):")
        print(f"  [{'ok  ' if ok_real else 'ERRO'}] {motivo_real}")
        if not ok_real:
            falhas.append("nenhum par candidato esta livre nesta maquina. "
                          "Libere uma porta ou acrescente um par a CANDIDATOS")
    except OSError as e:
        print(f"REPROVA: nao foi possivel montar o cenario ({e}). "
              "Verificacao que nao consegue verificar reprova, nunca aprova")
        return 1

    if falhas:
        print()
        print("REPROVADO:")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("\nAPROVADO: havendo par livre, `make up` sem argumento nao cai no bind")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
