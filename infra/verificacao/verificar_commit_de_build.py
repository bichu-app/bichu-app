#!/usr/bin/env python3
"""O `make` precisa EXPORTAR BUILD_COMMIT, e ele precisa CHEGAR ao build. BICHUS-210/211/216.

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

=========================================================================
O QUE MUDOU EM 22/09, E POR QUE (BICHUS-216)
=========================================================================
A terceira conferencia -- a que le `build.args.BUILD_COMMIT` da configuracao
renderizada -- vinha embrulhada em `except Exception`, comentado como "sem
docker esta parte simplesmente nao roda". Ela nao engolia so a ausencia de
docker: engolia a `Reprovacao` que a propria renderizacao levanta quando o
compose nao consegue interpolar. Medido pelo QA com docker instalado e
funcionando: faltava o `.env`, e o portao imprimia `[ -- ]` e saia APROVADO com
os tres servicos fixados em `BUILD_COMMIT: ultimo`.

E isso nao era hipotese, era o caso normal: o passo vive no job `rapidos`, cujo
unico passo anterior e o `checkout`. O `.env` so nasce no job `integracao`.
**Toda** execucao da esteira caia no ramo cego. O portao rodava exatamente onde
ele nao enxergava.

Tres mudancas, e a terceira e a que resolve:

  1. A renderizacao **nao e mais engolida**. `Reprovacao` vira reprovacao, com o
     stderr do compose na mensagem. Portao que nao consegue conferir precisa
     reprovar dizendo que ficou cego, nunca aprovar por omissao -- e ha
     precedente no repositorio: `verificar_boot_do_alvo_prod.py` (BICHUS-213)
     reprova alto quando nao consegue ler a lista do codigo.
  2. O ramo "a BICHUS-210 ainda nao entrou" ENVELHECEU e virou reprovacao. Ela
     entrou. Zero servico declarando o argumento passou a ser defeito, e nao
     estado intermediario.
  3. A renderizacao deixou de depender do `.env` da maquina.

=========================================================================
ONDE O PASSO DEVE RODAR, E POR QUE ELE CONTINUA EM `rapidos`
=========================================================================
A issue oferece duas saidas, e as duas foram medidas antes de escolher.

**Mover para `integracao`, onde ha `.env`.** Reprovado. O job `integracao`
depende de `codigo` e `contrato`, e e nele que a imagem e CONSTRUIDA. Um portao
que so acusa depois de construir chega tarde: ele gasta tres jobs para dizer
algo que era sabido no `checkout`, e o que ele existe para pegar -- o `export`
apagado num rebase -- e barato de pegar cedo.

**`cp .env.example .env` no `rapidos`.** Reprovado, e por medicao, nao por
gosto: o `.env.example` nasce com quatro chaves VAZIAS que o compose exige com
`:?` (`POSTGRES_PASSWORD`, `OBJECT_STORAGE_ACCESS_KEY_ID`,
`OBJECT_STORAGE_SECRET_ACCESS_KEY`, `OBJECT_STORAGE_KMS_KEY`). Copiar o exemplo
e renderizar sai com:

    error while interpolating services.objeto_init.environment.SEGREDO:
    required variable OBJECT_STORAGE_SECRET_ACCESS_KEY is missing a value

Para passar dali seria preciso repetir no `rapidos` as ~40 linhas de `sed` que o
job `integracao` tem -- uma segunda copia de uma receita fragil, que deriva da
primeira no dia em que alguem acrescentar uma variavel.

**O que este arquivo faz, e e a terceira saida.** A pergunta da terceira
conferencia -- *todo servico que constroi recebe `BUILD_COMMIT`, com forma de
commit e igual em todos?* -- nao tem nada a ver com segredo. A UNICA variavel
que carrega a resposta e o proprio `BUILD_COMMIT`, e ele vem do AMBIENTE que o
make exportou. Todo o resto e ruido que o compose exige so para renderizar.

Entao a renderizacao acontece contra um `.env` **descartavel**, derivado do
`.env.example` com um valor de enchimento em toda chave vazia, num diretorio
temporario apontado por `--project-directory`. Duas consequencias:

  - o passo volta a enxergar no `rapidos`, antes do build e sem segredo nenhum;
  - a resposta passa a ser a MESMA na maquina de quem tem `.env` e no runner que
    nao tem. Hoje ela depende do `.env` de cada um, em silencio.

A lista de variaveis a encher sai do PROPRIO `.env.example`, nunca escrita aqui:
copiar a lista criaria a segunda verdade que a variavel nova faria divergir.

**E ha um perigo nesse desenho, com guarda e caso proprios:** se um dia o
`.env.example` passar a declarar `BUILD_COMMIT`, o arquivo descartavel
forneceria o valor que este portao existe para medir, e a conferencia inteira
viraria tautologia. Por isso `BUILD_COMMIT` e retirado do arquivo descartavel E
a presenca dele no `.env.example` e reprovacao, com caso no autoteste.

Se a renderizacao parar de funcionar por qualquer outro motivo -- docker fora do
PATH, um `env_file:` novo apontando para um caminho que o diretorio temporario
nao tem --, o portao REPROVA nomeando o stderr. Ficar cego e o resultado que ele
tem de gritar.

=========================================================================
AS CONFERENCIAS
=========================================================================
  1. `BUILD_COMMIT` esta no ambiente e tem forma de commit. Esta e a que carrega
     o peso: apague o `export` do Makefile e ela reprova.
  2. O padrao que o Makefile usa para recusar (`FORMA_DE_COMMIT`) e o mesmo que
     este arquivo usa. Duas copias da mesma regra derivam em silencio.
  3. O `.env.example` nao declara `BUILD_COMMIT` (ver o perigo, acima).
  4. Na configuracao renderizada: existe servico que constroi; TODO servico que
     constroi declara `build.args.BUILD_COMMIT`; o valor tem forma de commit; e
     e o MESMO em todos. Um `make up` estampa UM commit.

`--autoteste` roda cada regra contra um caso guardado e exige que ele reprove
**por aquela regra e so por ela**. Nao basta reprovar: uma isca que reprova por
dois motivos ao mesmo tempo continua verde depois que a regra que ela testava
for desligada, e passa a aprovar a regra quebrada. Por isso o juizo devolve
`(regra, mensagem)` e o autoteste compara CONJUNTOS de regras.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import verificar_portas  # noqa: E402 - o sys.path precisa vir antes

FORMA_DE_COMMIT = re.compile(r"^[0-9a-f]{7,40}$")
# O mesmo texto que o Makefile guarda em FORMA_DE_COMMIT, com o `$$` do make
# desfeito para um `$` de expressao regular.
FORMA_ESPERADA_NO_MAKEFILE = "^[0-9a-f]{7,40}$"

ISCAS = Path(__file__).resolve().parent / "iscas"
ENCHIMENTO = "descartavel-so-para-renderizar"

# A variavel que este portao MEDE. Ela nunca pode sair do arquivo descartavel:
# se saisse, a renderizacao responderia o que o proprio portao escreveu.
VARIAVEL_MEDIDA = "BUILD_COMMIT"

CHAVE_DE_ENV = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")

# Uma falta e um par `(regra, mensagem)`. A regra e o que o autoteste compara;
# a mensagem e o que a pessoa le.
Falta = tuple[str, str]


# ---------------------------------------------------------------------------
# 1. o ambiente
# ---------------------------------------------------------------------------
def conferir_ambiente(valor: str | None) -> list[Falta]:
    if valor is None:
        return [(
            "ambiente",
            "BUILD_COMMIT nao esta no ambiente. Ou a linha `export BUILD_COMMIT` sumiu do "
            "Makefile, ou este portao foi chamado sem o make na frente -- rode "
            "`make verificar-commit-de-build`",
        )]
    if not FORMA_DE_COMMIT.match(valor):
        return [(
            "ambiente",
            f"BUILD_COMMIT={valor!r} nao tem forma de commit. O build do Docker vai reprovar "
            "com a mensagem dele, que e mais longe da causa do que esta",
        )]
    return []


# ---------------------------------------------------------------------------
# 2. uma regra, uma copia
# ---------------------------------------------------------------------------
def conferir_makefile(texto: str | None) -> list[Falta]:
    if texto is None:
        return [(
            "makefile",
            "o Makefile nao existe a partir desta raiz. Sem ele a pre-checagem do `make up` "
            "nao tem criterio e o desenvolvedor volta a receber a mensagem do Docker",
        )]
    for linha in texto.splitlines():
        if linha.startswith("FORMA_DE_COMMIT"):
            _, _, valor = linha.partition(":=")
            declarada = valor.strip().replace("$$", "$")
            if declarada != FORMA_ESPERADA_NO_MAKEFILE:
                return [(
                    "makefile",
                    f"o Makefile recusa por {declarada!r} e este portao por "
                    f"{FORMA_ESPERADA_NO_MAKEFILE!r}. Duas copias da mesma regra, ja divergindo",
                )]
            return []
    return [(
        "makefile",
        "o Makefile nao declara FORMA_DE_COMMIT. Sem ela a pre-checagem do `make up` nao "
        "tem criterio e o desenvolvedor volta a receber a mensagem do Docker",
    )]


# ---------------------------------------------------------------------------
# 3. o `.env.example` nao pode fornecer o que este portao mede
# ---------------------------------------------------------------------------
def conferir_exemplo(texto: str) -> list[Falta]:
    for linha in texto.splitlines():
        achado = CHAVE_DE_ENV.match(linha)
        if achado is not None and achado.group(1) == VARIAVEL_MEDIDA:
            return [(
                "exemplo",
                f"o `.env.example` passou a declarar {VARIAVEL_MEDIDA}. Este portao renderiza "
                "o compose contra um arquivo derivado dele, entao a partir daqui a "
                "renderizacao responderia com o valor do EXEMPLO e nao com o que o make "
                f"exportou -- a conferencia viraria tautologia. Tire {VARIAVEL_MEDIDA} do "
                "exemplo: quem o poe no ambiente e o Makefile",
            )]
    return []


# ---------------------------------------------------------------------------
# 4. a configuracao renderizada
# ---------------------------------------------------------------------------
def args_de_build(config: dict) -> dict[str, str | None]:
    """`build.args.BUILD_COMMIT` por servico que constroi. Ausente vira None."""
    achados: dict[str, str | None] = {}
    for nome, servico in (config.get("services") or {}).items():
        build = servico.get("build")
        if not isinstance(build, dict):
            continue
        args = build.get("args") or {}
        valor = args.get(VARIAVEL_MEDIDA)
        achados[nome] = None if valor is None else str(valor)
    return achados


def conferir_args(config: dict) -> list[Falta]:
    """Cada regra e INTEIRA e independente -- nada de cadeia `if/elif/else`.

    Numa cadeia o `else` recolhe o que os ramos deixam cair, e ai nenhuma isca
    consegue exibir um ramo sozinho: desligar o ramo que ela testava deixa o
    autoteste verde porque outro ramo assumiu.
    """
    faltas: list[Falta] = []
    achados = args_de_build(config)

    # Cegueira: configuracao sem servico que constroi. `0 de 0 corretos` seria
    # aprovacao por vacuidade, que e a forma exata do defeito desta issue.
    if not achados:
        faltas.append((
            "sem-servico-que-constroi",
            "a configuracao renderizada nao tem NENHUM servico com `build`. Ou o compose "
            "mudou de forma, ou o perfil renderizado esta errado. Zero servicos nao e "
            "'tudo certo': e o portao sem o que conferir, e ele reprova nesse caso",
        ))
        return faltas

    # UMA regra: todo servico que constroi declara o argumento. Ela cobre tanto
    # "nenhum declara" (o `[ -- ]` que envelheceu depois que a BICHUS-210
    # entrou) quanto "um deles perdeu a linha num rebase". Sao o mesmo defeito
    # em graus diferentes, e separa-los faria a isca de um depender do outro.
    sem_argumento = sorted(n for n, v in achados.items() if v is None)
    if sem_argumento:
        faltas.append((
            "cobertura",
            f"{len(sem_argumento)} de {len(achados)} servico(s) que constroem NAO declaram "
            f"`build.args.{VARIAVEL_MEDIDA}`: {', '.join(sem_argumento)}. Desde a BICHUS-210 "
            "o Dockerfile reprova o build sem ele, entao esse alvo nao constroi -- e se um "
            "dia construir, sai uma imagem sem o commit gravado e a sonda volta a responder "
            "`commit: null`",
        ))

    declarados = {n: v for n, v in achados.items() if v is not None}

    # Regra da FORMA, isolada da regra da igualdade. Um unico valor invalido em
    # tres servicos tambem os faria divergir, e a isca reprovaria pelos dois
    # motivos: por isso a isca desta regra poe o MESMO valor invalido em todos.
    fora_de_forma = sorted(n for n, v in declarados.items() if not FORMA_DE_COMMIT.match(v))
    if fora_de_forma:
        detalhes = ", ".join(f"{n}={declarados[n]!r}" for n in fora_de_forma)
        faltas.append((
            "forma",
            f"servico(s) recebendo {VARIAVEL_MEDIDA} sem forma de commit ({detalhes}). O "
            "Dockerfile vai reprovar esse build, e a mensagem dele chega no meio da "
            "construcao, longe da causa",
        ))

    # Regra da IGUALDADE, isolada. A isca desta poe valores todos VALIDOS e
    # diferentes, para que a regra da forma nao dispare junto.
    if len(set(declarados.values())) > 1:
        faltas.append((
            "divergentes",
            "os servicos que constroem recebem commits DIFERENTES na mesma subida ("
            + ", ".join(f"{k}={v}" for k, v in sorted(declarados.items()))
            + "). Uma subida estampa um commit so; `api` e `worker` apontam para o MESMO "
            "`image:`, entao argumentos diferentes produzem duas imagens com um nome so",
        ))

    return faltas


# ---------------------------------------------------------------------------
# A renderizacao, sem depender do `.env` da maquina
# ---------------------------------------------------------------------------
def ambiente_descartavel(texto_do_exemplo: str) -> str:
    """O `.env.example` com enchimento em toda chave vazia, e SEM a variavel medida.

    A lista de chaves sai do proprio exemplo. Escreve-la aqui criaria a segunda
    verdade que a variavel nova faria divergir -- e a divergencia apareceria
    como "o portao ficou cego", tarde e sem causa aparente.
    """
    linhas: list[str] = []
    for linha in texto_do_exemplo.splitlines():
        achado = CHAVE_DE_ENV.match(linha)
        if achado is None:
            linhas.append(linha)
            continue
        chave, valor = achado.group(1), achado.group(2)
        if chave == VARIAVEL_MEDIDA:
            continue
        linhas.append(f"{chave}={ENCHIMENTO}" if valor == "" else linha)
    return "\n".join(linhas) + "\n"


def renderizar_isolado(raiz: Path, perfil: str = "dev") -> dict:
    """A configuracao renderizada pelo compose, contra um `.env` descartavel.

    Levanta `verificar_portas.Reprovacao` quando nao consegue. Quem chama NAO
    engole: e exatamente o `except Exception` engolindo a recusa que abriu a
    BICHUS-216.
    """
    exemplo = raiz / ".env.example"
    if not exemplo.is_file():
        raise verificar_portas.Reprovacao(
            f"{exemplo} nao existe. E dele que sai o ambiente descartavel da renderizacao, "
            "e sem renderizar nao ha o que conferir do lado do compose"
        )
    with tempfile.TemporaryDirectory(prefix="bichu-commit-de-build-") as temporario:
        projeto = Path(temporario)
        # O nome tem de ser `.env`: os servicos declaram `env_file: [.env]`, e
        # esse caminho e resolvido contra o diretorio do projeto. `--env-file`
        # sozinho nao resolve -- medido: o compose continua exigindo o arquivo.
        (projeto / ".env").write_text(
            ambiente_descartavel(exemplo.read_text(encoding="utf-8")), encoding="utf-8"
        )
        return verificar_portas.renderizar(
            raiz,
            perfil,
            extras=["-f", str(raiz / "compose.yaml"), "--project-directory", str(projeto)],
        )


# ---------------------------------------------------------------------------
# Autoteste
# ---------------------------------------------------------------------------
# Um caso por regra, e o autoteste compara CONJUNTOS: reprovar nao basta, tem de
# reprovar por AQUELA regra e so por ela. Foi medido nesta sessao, por outro
# agente, que iscas reprovando por dois motivos ao mesmo tempo continuam verdes
# depois de a regra que elas testavam ser desligada -- e ai a isca passa a
# aprovar a regra quebrada, que e pior que nao ter isca.
CASOS_DE_AMBIENTE: list[tuple[str, str | None, set[str]]] = [
    ("o make exportou um commit de verdade", "11df2a4217e5321b9dc2bfdd2d0b5e53bdcd5d0f", set()),
    ("BUILD_COMMIT nao esta no ambiente (o `export` sumiu)", None, {"ambiente"}),
    ("BUILD_COMMIT sem forma de commit", "ultimo", {"ambiente"}),
    ("BUILD_COMMIT vazio, que e o que `BUILD_COMMIT= make up` produz", "", {"ambiente"}),
]

CASOS_DE_MAKEFILE: list[tuple[str, str | None, set[str]]] = [
    ("o Makefile declara a mesma forma", "FORMA_DE_COMMIT := ^[0-9a-f]{7,40}$$\n", set()),
    ("o Makefile nao existe", None, {"makefile"}),
    ("o Makefile nao declara FORMA_DE_COMMIT", "BUILD_COMMIT := x\n", {"makefile"}),
    ("as duas copias da forma ja divergiram", "FORMA_DE_COMMIT := ^[0-9a-f]{40}$$\n", {"makefile"}),
]

CASOS_DE_EXEMPLO: list[tuple[str, str, set[str]]] = [
    ("o exemplo nao declara a variavel medida", "PORT=3000\nTAG_CODE_KEY=\n", set()),
    (
        "o exemplo passou a declarar BUILD_COMMIT e a conferencia viraria tautologia",
        "PORT=3000\nBUILD_COMMIT=deadbee\n",
        {"exemplo"},
    ),
    ("declarado e vazio conta igual: o enchimento o preencheria", "BUILD_COMMIT=\n", {"exemplo"}),
]


# As regras que `conferir_args` sabe levantar. O autoteste exige uma isca para
# cada uma: regra sem isca e regra que ninguem vai perceber quando parar de
# funcionar, que e o estado em que a terceira conferencia passou a noite.
REGRAS_DE_ARGS = {"sem-servico-que-constroi", "cobertura", "forma", "divergentes"}


def _casos_de_args() -> list[tuple[Path, set[str]]]:
    """As iscas de configuracao renderizada, com a regra que cada uma precisa tocar.

    O nome do arquivo carrega a regra: `commit-de-build-<regra>[-<detalhe>].json`.
    Assim uma isca nova nao precisa ser registrada em duas listas, que e como as
    duas deixam de concordar.
    """
    casos: list[tuple[Path, set[str]]] = []
    for caminho in sorted(ISCAS.glob("commit-de-build-*.json")):
        resto = caminho.stem[len("commit-de-build-") :]
        if resto == "deve-passar":
            casos.append((caminho, set()))
            continue
        regra = next(
            (r for r in REGRAS_DE_ARGS if resto == r or resto.startswith(f"{r}-")),
            None,
        )
        if regra is None:
            raise SystemExit(
                f"REPROVA: a isca {caminho.name} nao nomeia nenhuma regra conhecida "
                f"({', '.join(sorted(REGRAS_DE_ARGS))}). Isca que nao diz o que testa nao "
                "pode ser conferida pelo motivo certo"
            )
        casos.append((caminho, {regra}))
    return casos


def _conferir_caso(descricao: str, esperadas: set[str], faltas: list[Falta]) -> bool:
    obtidas = {regra for regra, _ in faltas}
    ok = obtidas == esperadas
    marca = "ok  " if ok else "ERRO"
    alvo = ", ".join(sorted(esperadas)) if esperadas else "nada"
    print(f"  [{marca}] {descricao}")
    print(f"         devia levantar: {alvo}    levantou: {', '.join(sorted(obtidas)) or 'nada'}")
    if not ok:
        for _, mensagem in faltas:
            print(f"         -> {mensagem}")
    return ok


def autoteste(raiz: Path) -> int:
    casos_de_args = _casos_de_args()
    if not casos_de_args:
        print(f"REPROVA: nenhuma isca `commit-de-build-*.json` em {ISCAS}. Portao sem prova "
              "negativa guardada vale por confianca no dia em que foi escrito, nao por "
              "verificacao")
        return 1

    cobertas = {regra for _, esperadas in casos_de_args for regra in esperadas}
    total = len(CASOS_DE_AMBIENTE) + len(CASOS_DE_MAKEFILE) + len(CASOS_DE_EXEMPLO) + len(casos_de_args)
    print(f"autoteste do portao do commit de build - {total} casos")
    erradas = 0

    print("\n  o ambiente")
    for descricao, valor, esperadas in CASOS_DE_AMBIENTE:
        if not _conferir_caso(descricao, esperadas, conferir_ambiente(valor)):
            erradas += 1

    print("\n  a forma declarada no Makefile")
    for descricao, texto, esperadas in CASOS_DE_MAKEFILE:
        if not _conferir_caso(descricao, esperadas, conferir_makefile(texto)):
            erradas += 1

    print("\n  o `.env.example` nao pode fornecer o que o portao mede")
    for descricao, texto, esperadas in CASOS_DE_EXEMPLO:
        if not _conferir_caso(descricao, esperadas, conferir_exemplo(texto)):
            erradas += 1

    print("\n  os argumentos de build, na configuracao renderizada")
    for caminho, esperadas in casos_de_args:
        try:
            faltas = conferir_args(json.loads(caminho.read_text(encoding="utf-8")))
        except Exception as e:  # noqa: BLE001 - o portao quebrado tem que APARECER
            # Traceback some no log e ninguem liga a falha a ESTA isca. O erro
            # vira o motivo do caso, com o nome do arquivo na linha.
            faltas = [("estourou", f"{type(e).__name__}: {e}")]
        if not _conferir_caso(caminho.name, esperadas, faltas):
            erradas += 1

    faltando = REGRAS_DE_ARGS - cobertas
    if faltando:
        print(f"\n  [ERRO] regra(s) sem isca: {', '.join(sorted(faltando))}. Regra sem prova "
              "negativa guardada e regra que ninguem percebe quando para de funcionar")
        erradas += 1

    # A ARVORE DE VERDADE, e nao so as iscas. As iscas provam que o juizo
    # enxerga; este caso prova que o `.env.example` desta arvore continua
    # servindo para renderizar. Sem ele, o dia em que o exemplo ganhasse uma
    # chave que o compose exige de outra forma chegaria como um portao cego na
    # esteira, e nao como um autoteste vermelho na maquina de quem mexeu.
    print("\n  o `.env.example` desta arvore")
    if not _conferir_caso(
        ".env.example nao declara a variavel medida",
        set(),
        conferir_exemplo((raiz / ".env.example").read_text(encoding="utf-8")),
    ):
        erradas += 1

    if erradas:
        print(f"\nREPROVADO: {erradas} caso(s) nao se comportaram como deviam. O portao do "
              "commit de build deixou de enxergar o que ele existe para enxergar")
        return 1
    print("\nAPROVADO: cada caso levantou a regra dele, e so ela")
    return 0


# ---------------------------------------------------------------------------
def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raiz", default=".", help="raiz do repositorio (padrao: .)")
    p.add_argument("--perfil", default="dev", help="perfil do compose a renderizar (padrao: dev)")
    p.add_argument("--config", help="le uma configuracao ja renderizada, em vez de chamar o docker")
    p.add_argument("--autoteste", action="store_true", help="roda os casos e exige a regra certa")
    a = p.parse_args(argv[1:])
    raiz = Path(a.raiz).resolve()

    if a.autoteste:
        return autoteste(raiz)

    faltas: list[Falta] = []

    valor = os.environ.get("BUILD_COMMIT")
    do_ambiente = conferir_ambiente(valor)
    faltas += do_ambiente
    if not do_ambiente:
        print(f"  [ok  ] o make exportou BUILD_COMMIT={valor}")

    caminho = raiz / "Makefile"
    do_makefile = conferir_makefile(caminho.read_text(encoding="utf-8") if caminho.is_file() else None)
    faltas += do_makefile
    if not do_makefile:
        print(f"  [ok  ] Makefile e portao usam a mesma forma: {FORMA_ESPERADA_NO_MAKEFILE}")

    exemplo = raiz / ".env.example"
    do_exemplo = conferir_exemplo(exemplo.read_text(encoding="utf-8")) if exemplo.is_file() else []
    faltas += do_exemplo
    if not do_exemplo:
        print(f"  [ok  ] o `.env.example` nao declara {VARIAVEL_MEDIDA}")

    # AQUI ESTAVA O DEFEITO. `except Exception` devolvia None e o portao aprovava
    # por omissao. Agora a recusa e recusa, com o stderr do compose na mensagem.
    try:
        config = (
            json.loads(Path(a.config).read_text(encoding="utf-8"))
            if a.config
            else renderizar_isolado(raiz, a.perfil)
        )
    except verificar_portas.Reprovacao as e:
        faltas.append((
            "cego",
            "nao consegui renderizar a configuracao do compose, entao os argumentos de build "
            "NAO foram conferidos. Portao que nao consegue conferir reprova dizendo que ficou "
            f"cego, nunca aprova por omissao. O compose disse:\n      {e}",
        ))
    else:
        dos_args = conferir_args(config)
        faltas += dos_args
        if not dos_args:
            achados = args_de_build(config)
            unico = next(iter(set(achados.values())))
            print(f"  [ok  ] {len(achados)} servico(s) constroem com o mesmo commit {unico}")

    if faltas:
        print("\nREPROVADO:")
        for _, mensagem in faltas:
            print(f"  - {mensagem}")
        return 1
    print("\nAPROVADO: o make exporta BUILD_COMMIT e ele chega a todo servico que constroi")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
