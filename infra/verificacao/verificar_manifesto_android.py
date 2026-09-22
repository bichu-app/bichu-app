#!/usr/bin/env python3
"""Portao de boa-formacao do XML que o build do aplicativo consome.

POR QUE ESTE ARQUIVO EXISTE

Duas vezes em dois dias a MESMA classe derrubou o build do Android, e nas duas
a esteira e a suite local disseram que estava tudo verde:

  86499cb (21/09/2026)  `--` no comentario do icone de notificacao
  c0cd002 (22/09/2026)  `--` no comentario do `uses-feature` de localizacao

A especificacao do XML (W3C REC-xml, secao 2.5) proibe a sequencia `--` dentro
de um comentario. O mesclador de manifesto do Gradle recusa o arquivo antes de
compilar qualquer coisa:

  Execution failed for task ':app:processReleaseMainManifest'.
  > ManifestMerger2$MergeFailureException: Error parsing AndroidManifest.xml

Nada acusava porque nada olhava. `flutter analyze` e `flutter test` rodam na
maquina virtual do Dart e nunca tocam no Gradle; `make verificar` nao inclui
`apk` (o Makefile diz por que, e esta certo); e a integracao de 22/09 se
declarou verde sem nunca ter compilado um APK.

Este portao custa milissegundos, nao precisa de Gradle, de JDK nem do SDK do
Android, e reprova no commit que traz o defeito, com arquivo, linha, coluna e o
`--` apontado.

O QUE ELE **NAO** COBRE, e a lista e curta de proposito

Boa-formacao e a porta de entrada do mesclador, nao o mesclador. Este portao
aprova arquivo bem formado que o build ainda assim recusa. Fica DE FORA daqui:

  - conflito de merge entre o manifesto do aplicativo e o das bibliotecas
    (`firebase_messaging`, `permission_handler`): quem traz esses manifestos e
    a resolucao de dependencia do Gradle, que este portao nao faz;
  - placeholder nao substituido (`${applicationName}`) e `package`/`minSdk`/
    `targetSdk`, que o AGP injeta a partir de `build.gradle.kts`;
  - regra de esquema do Android: atributo inexistente, valor invalido,
    `android:exported` faltando em componente com `intent-filter`;
  - qualquer coisa que dependa do piso da cadeia de ferramentas (compileSdk,
    AGP, NDK), que e o que `make apk` e o job `apk` existem para pegar.

O mesclador de verdade FOI medido rodando fora do Gradle (8 jars, ~7,6 MB, JVM
em ~0,2 s) e a conclusao esta em `docs/07-devops.md` e no cabecalho do alvo
`fechar-integracao` do Makefile: ele exige que PACKAGE, MIN_SDK_VERSION,
TARGET_SDK_VERSION e o placeholder `applicationName` sejam entregues a mao, o
que e uma SEGUNDA COPIA do `build.gradle.kts` que diverge em silencio; nao
enxerga os manifestos das bibliotecas, entao passaria uma falsa sensacao de ter
validado o merge; e, para o defeito de 21 e 22/09, a mensagem dele e pior que a
de um analisador comum ("Error parsing", sem linha e sem coluna). Por isso o
portao rapido fica na boa-formacao, e a validacao de verdade continua onde ela
ja esta: no `apk`.

Uso:
  python3 infra/verificacao/verificar_manifesto_android.py --raiz .
  python3 infra/verificacao/verificar_manifesto_android.py --autoteste
  python3 infra/verificacao/verificar_manifesto_android.py arquivo.xml [...]

Saida: 0 aprovado, 1 reprovado.
"""

from __future__ import annotations

import argparse
import sys
import xml.parsers.expat
from pathlib import Path

AQUI = Path(__file__).resolve().parent
ISCAS = AQUI / "iscas" / "manifesto-android"

# Onde o build do aplicativo le XML. `res/**/*.xml` entra porque o aapt2 morre
# com o MESMO `--` e ninguem olha para esses arquivos; o `.plist` do iOS entra
# porque ele tambem e XML e o build do iOS tambem nao tem suite que o compile.
ALVOS = (
    ("app/android", ("*.xml",)),
    ("app/ios", ("*.plist",)),
)

# Sem estes, o portao esta olhando para o lugar errado e precisa DIZER isso em
# vez de aprovar o vazio. Caminhos relativos a raiz do repositorio.
OBRIGATORIOS = (
    "app/android/app/src/main/AndroidManifest.xml",
    "app/android/app/src/debug/AndroidManifest.xml",
    "app/android/app/src/profile/AndroidManifest.xml",
    "app/ios/Runner/Info.plist",
)


def _posicao(texto: str, indice: int) -> tuple[int, int]:
    """Converte deslocamento em (linha, coluna), ambos base 1."""
    linha = texto.count("\n", 0, indice) + 1
    inicio = texto.rfind("\n", 0, indice) + 1
    return linha, indice - inicio + 1


def _tracos_duplos_em_comentario(texto: str) -> list[tuple[int, int]]:
    """Posicoes de `--` ilegal dentro de comentario, na ordem em que aparecem.

    Isto e DIAGNOSTICO, nao veredito: quem reprova e o expat. A varredura existe
    porque a mensagem do expat para esta familia e "not well-formed (invalid
    token)", que aponta o lugar certo e nao diz o que esta errado -- e o que
    esta errado e contraintuitivo o bastante para ja ter voltado duas vezes.
    """
    achados: list[tuple[int, int]] = []
    i = 0
    while True:
        abre = texto.find("<!--", i)
        if abre < 0:
            return achados
        corpo_inicio = abre + 4
        fecha = texto.find("-->", corpo_inicio)
        corpo_fim = fecha if fecha >= 0 else len(texto)
        j = corpo_inicio
        while True:
            t = texto.find("--", j, corpo_fim)
            if t < 0:
                break
            achados.append(_posicao(texto, t))
            j = t + 2
        if fecha < 0:
            return achados
        i = fecha + 3


def conferir(caminho: Path) -> tuple[bool, str]:
    """Um arquivo. Devolve (aprovado, mensagem). Nao levanta."""
    try:
        bruto = caminho.read_bytes()
    except OSError as erro:
        return False, f"REPROVA: {caminho}: nao deu para ler ({erro})"

    if not bruto.strip():
        return False, (
            f"REPROVA: {caminho}: arquivo vazio. XML vazio nao tem elemento raiz,"
            " e arquivo esvaziado por engano passa despercebido justamente por"
            " nao ter conteudo para alguem estranhar"
        )

    analisador = xml.parsers.expat.ParserCreate()
    try:
        analisador.Parse(bruto, True)
    except xml.parsers.expat.ExpatError as erro:
        linha, coluna = erro.lineno, erro.offset + 1
        motivo = xml.parsers.expat.ErrorString(erro.code)
        partes = [f"REPROVA: {caminho}:{linha}:{coluna}: {motivo}"]

        texto = bruto.decode("utf-8", errors="replace")
        linhas = texto.splitlines()
        if 1 <= linha <= len(linhas):
            partes.append(f"  {linhas[linha - 1]}")
            partes.append("  " + " " * (coluna - 1) + "^")

        duplos = _tracos_duplos_em_comentario(texto)
        if duplos:
            l, c = duplos[0]
            partes.append(
                f"  A sequencia `--` aparece DENTRO de um comentario XML, em"
                f" {caminho}:{l}:{c}"
                + (f" (e em mais {len(duplos) - 1})" if len(duplos) > 1 else "")
                + "."
            )
            partes.append(
                "  O XML proibe `--` no corpo de um comentario (W3C REC-xml 2.5)."
                " O mesclador de manifesto do Gradle recusa o arquivo inteiro e o"
                " build morre antes de compilar qualquer coisa."
            )
            partes.append(
                "  Saida: use travessao de verdade (—), virgula, ponto ou"
                " parenteses. Nao e questao de estilo: a linha e ilegal."
            )
            partes.append(
                "  Esta classe ja voltou duas vezes: 86499cb (21/09) e c0cd002"
                " (22/09)."
            )
        return False, "\n".join(partes)

    return True, f"APROVA: {caminho}"


def reunir(raiz: Path) -> tuple[list[Path], list[str]]:
    """Os arquivos a conferir, e os obrigatorios que nao apareceram."""
    achados: set[Path] = set()
    for sub, padroes in ALVOS:
        base = raiz / sub
        if not base.is_dir():
            continue
        for padrao in padroes:
            for caminho in base.rglob(padrao):
                # `build/` e saida do Gradle: conferir o que ele gerou nao diz
                # nada sobre a fonte, e num checkout limpo nem existe.
                if "build" in caminho.relative_to(base).parts:
                    continue
                if caminho.is_file():
                    achados.add(caminho)

    faltando = [rel for rel in OBRIGATORIOS if not (raiz / rel).is_file()]
    return sorted(achados), faltando


def rodada(raiz: Path) -> int:
    arquivos, faltando = reunir(raiz)

    # Portao que nao consegue conferir precisa reprovar, nunca aprovar. Sem esta
    # recusa, um `--raiz` errado, um checkout parcial ou uma pasta renomeada
    # deixariam o passo VERDE sem ter olhado para nada.
    if faltando:
        print(
            "REPROVA: nao achei arquivo que tem de existir, a partir de"
            f" {raiz}:",
            file=sys.stderr,
        )
        for rel in faltando:
            print(f"  {rel}", file=sys.stderr)
        print(
            "  Ou a raiz esta errada, ou o arquivo mudou de lugar. Aprovar aqui"
            " seria dizer que o manifesto esta bem formado sem ter aberto o"
            " manifesto.",
            file=sys.stderr,
        )
        return 1

    reprovados = 0
    for caminho in arquivos:
        ok, mensagem = conferir(caminho)
        if ok:
            print(mensagem)
        else:
            print(mensagem, file=sys.stderr)
            reprovados += 1

    if reprovados:
        print(f"\n{reprovados} arquivo(s) reprovado(s).", file=sys.stderr)
        return 1

    print(f"\nboa-formacao: {len(arquivos)} arquivo(s) do build do aplicativo, todos OK.")
    return 0


def autoteste() -> int:
    """As iscas versionadas. Sem elas a regra vale pela confianca do dia em que
    foi escrita, que e exatamente a familia de defeito que ela existe para pegar.
    """
    if not ISCAS.is_dir():
        print(f"REPROVA: nao achei as iscas em {ISCAS}", file=sys.stderr)
        return 1

    reprovar = sorted(ISCAS.glob("deve-reprovar-*"))
    aprovar = sorted(ISCAS.glob("deve-aprovar-*"))

    # Autoteste sem isca passa em silencio e da a impressao de portao provado.
    if len(reprovar) < 2 or not aprovar:
        print(
            f"REPROVA: {ISCAS} tem {len(reprovar)} isca(s) de reprovacao e"
            f" {len(aprovar)} de aprovacao. O autoteste precisa das duas familias:"
            " so reprovacao aprova um portao que reprova tudo, e so aprovacao"
            " aprova um portao cego.",
            file=sys.stderr,
        )
        return 1

    falhou = 0

    for caminho in reprovar:
        ok, _ = conferir(caminho)
        if ok:
            print(
                f"REPROVA: a isca '{caminho.name}' PASSOU. O portao parou de"
                " enxergar esta familia.",
                file=sys.stderr,
            )
            falhou = 1
        else:
            print(f"isca reprovada como deveria: {caminho.name}")

    for caminho in aprovar:
        ok, mensagem = conferir(caminho)
        if ok:
            print(f"isca aprovada como deveria: {caminho.name}")
        else:
            # Sem este lado, um portao que reprovasse TUDO passaria no autoteste
            # inteiro e derrubaria a esteira para sempre. Portao que reprova quem
            # esta certo e desligado na primeira semana.
            print(
                f"REPROVA: a isca '{caminho.name}' foi REPROVADA, e ela e um"
                " manifesto bem formado. Um portao que reprova quem esta certo"
                " e desligado na primeira semana.\n" + mensagem,
                file=sys.stderr,
            )
            falhou = 1

    if falhou:
        return 1
    print(
        f"\nautoteste: o portao enxerga nos dois sentidos"
        f" ({len(reprovar)} reprovam, {len(aprovar)} aprova(m))."
    )
    return 0


def principal(argv: list[str]) -> int:
    p = argparse.ArgumentParser(
        description="Boa-formacao do XML que o build do aplicativo consome."
    )
    p.add_argument("arquivos", nargs="*", type=Path, help="confere so estes")
    p.add_argument("--raiz", type=Path, default=Path("."), help="raiz do repositorio")
    p.add_argument("--autoteste", action="store_true", help="so as iscas versionadas")
    args = p.parse_args(argv)

    if args.autoteste:
        return autoteste()

    if args.arquivos:
        falhou = 0
        for caminho in args.arquivos:
            ok, mensagem = conferir(caminho)
            print(mensagem, file=sys.stdout if ok else sys.stderr)
            falhou |= 0 if ok else 1
        return falhou

    return rodada(args.raiz.resolve())


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
