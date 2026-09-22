#!/usr/bin/env python3
"""O `make` precisa EXPORTAR BUILD_COMMIT com forma de commit. BICHUS-210/211.

A BICHUS-210 fez o Dockerfile reprovar o build quando `BUILD_COMMIT` falta ou
nao tem forma de commit, e o `compose.yaml` repassa `${BUILD_COMMIT:-}` como
argumento de build com padrao vazio. Ou seja: o valor tem que vir do AMBIENTE, e
quem o poe la e o `Makefile`. Uma linha apagada por engano num rebase devolve
`make up` ao erro -- e o erro chega la no meio do build do Docker, longe da
causa.

Este portao roda DE DENTRO de uma receita do make e le `BUILD_COMMIT` do proprio
ambiente. E por isso que ele so existe como `make verificar-commit-de-build`:
chamado direto pelo python, sem o make na frente, ele nao teria o que conferir --
e nesse caso ele reprova dizendo isso, em vez de aprovar por nao achar nada.

Ele confere tres coisas, nesta ordem de importancia:

  1. `BUILD_COMMIT` esta no ambiente e tem forma de commit. Esta e a que carrega
     o peso: apague o `export` do Makefile e ela reprova.
  2. O padrao que o Makefile usa para recusar (`FORMA_DE_COMMIT`) e o mesmo que
     este arquivo usa. Duas copias da mesma regra derivam em silencio.
  3. Se a configuracao renderizada ja declarar `build.args.BUILD_COMMIT` -- o
     que passa a ser verdade quando a BICHUS-210 entrar --, o valor chega a
     TODOS os servicos que constroem, com forma de commit e IGUAL em todos. Um
     `make up` estampa UM commit; alvos da mesma subida com commits diferentes e
     o defeito que a expansao recursiva do `?=` abriria.

A terceira e ADITIVA e esta dita em voz alta: no branch onde a 210 ainda nao
entrou nao ha `build.args` para conferir, e o portao NAO aprova por causa dela.
Quem aprova ou reprova e a primeira, que vale nos dois lados do merge.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

FORMA_DE_COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
# O mesmo texto que o Makefile guarda em FORMA_DE_COMMIT, com o `$$` do make
# desfeito para um `$` de expressao regular.
FORMA_ESPERADA_NO_MAKEFILE = "^[0-9a-f]{7,40}$"


def _forma_declarada_no_makefile(raiz: Path) -> tuple[bool, str]:
    caminho = raiz / "Makefile"
    if not caminho.is_file():
        return False, f"{caminho} nao existe"
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        if linha.startswith("FORMA_DE_COMMIT"):
            _, _, valor = linha.partition(":=")
            return True, valor.strip().replace("$$", "$")
    return False, "o Makefile nao declara FORMA_DE_COMMIT"


def _args_de_build(raiz: Path) -> dict[str, str | None] | None:
    """`build.args.BUILD_COMMIT` por servico que constroi, ou None sem docker."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import verificar_portas  # reaproveita a renderizacao, que e a mesma
        config = verificar_portas.renderizar(raiz, "dev")
    except Exception:  # noqa: BLE001 - sem docker esta parte simplesmente nao roda
        return None
    achados: dict[str, str | None] = {}
    for nome, servico in (config.get("services") or {}).items():
        build = servico.get("build")
        if not isinstance(build, dict):
            continue
        args = build.get("args") or {}
        if "BUILD_COMMIT" not in args:
            continue
        achados[nome] = args.get("BUILD_COMMIT")
    return achados


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raiz", default=".", help="raiz do repositorio (padrao: .)")
    a = p.parse_args(argv[1:])
    raiz = Path(a.raiz).resolve()
    faltas: list[str] = []

    # 1. a que carrega o peso
    valor = os.environ.get("BUILD_COMMIT")
    if valor is None:
        faltas.append(
            "BUILD_COMMIT nao esta no ambiente. Ou a linha `export BUILD_COMMIT` sumiu do "
            "Makefile, ou este portao foi chamado sem o make na frente -- rode "
            "`make verificar-commit-de-build`"
        )
    elif not FORMA_DE_COMMIT.match(valor):
        faltas.append(
            f"BUILD_COMMIT={valor!r} nao tem forma de commit. O build do Docker vai reprovar "
            "com a mensagem dele, que e mais longe da causa do que esta"
        )
    else:
        print(f"  [ok  ] o make exportou BUILD_COMMIT={valor}")

    # 2. uma regra, uma copia
    achou, declarada = _forma_declarada_no_makefile(raiz)
    if not achou:
        faltas.append(
            f"{declarada}. Sem ela a pre-checagem do `make up` nao tem criterio e o "
            "desenvolvedor volta a receber a mensagem do Docker"
        )
    elif declarada != FORMA_ESPERADA_NO_MAKEFILE:
        faltas.append(
            f"o Makefile recusa por {declarada!r} e este portao por "
            f"{FORMA_ESPERADA_NO_MAKEFILE!r}. Duas copias da mesma regra, ja divergindo"
        )
    else:
        print(f"  [ok  ] Makefile e portao usam a mesma forma: {declarada}")

    # 3. aditiva: so tem o que conferir depois que a BICHUS-210 entrar
    args = _args_de_build(raiz)
    if args is None:
        print("  [ -- ] nao deu para renderizar a configuracao (sem docker?); "
              "a conferencia dos argumentos de build ficou de fora desta execucao")
    elif not args:
        print("  [ -- ] nenhum servico declara `build.args.BUILD_COMMIT` nesta arvore "
              "(a BICHUS-210 ainda nao entrou); nada a conferir do lado do compose")
    else:
        distintos = set(args.values())
        for servico, v in sorted(args.items()):
            if not v or not FORMA_DE_COMMIT.match(str(v)):
                faltas.append(
                    f"o servico `{servico}` recebe BUILD_COMMIT={v!r} como argumento de build, "
                    "e o Dockerfile vai reprovar esse build"
                )
        if len(distintos) > 1:
            faltas.append(
                "os servicos que constroem recebem commits DIFERENTES na mesma subida "
                f"({', '.join(f'{k}={v}' for k, v in sorted(args.items()))}). "
                "Uma subida estampa um commit so"
            )
        if not faltas:
            print(f"  [ok  ] {len(args)} servico(s) constroem com o mesmo commit "
                  f"{next(iter(distintos))}")

    if faltas:
        print("\nREPROVADO:")
        for f in faltas:
            print(f"  - {f}")
        return 1
    print("\nAPROVADO: o make exporta BUILD_COMMIT e o build tem de onde tirar o commit")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
