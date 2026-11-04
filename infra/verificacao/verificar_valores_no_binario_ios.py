#!/usr/bin/env python3
"""Portao do VALOR das `--dart-define` DENTRO do binario Dart do iOS.

POR QUE ESTE ARQUIVO EXISTE
===========================

Ate 26/10/2026 a conferencia de valor existia so para o APK
(`verificar_versao_no_apk.py`). O lado iOS nao tinha nenhuma: o `app/README.md`
registrava, com o motivo, que o caminho documentado era
`flutter build ios --debug --no-codesign`, que ele **nao passava
`--dart-define` nenhuma**, e que um portao para um alvo dormente seria portao
sem consumidor.

O alvo deixou de ser dormente: o cliente constroi o iOS PELO XCODE, e o Xcode
le as `--dart-define` de `app/ios/Flutter/Generated.xcconfig`, que o `flutter`
reescreve a cada build de linha de comando. MEDIDO em 26/10/2026 na arvore do
cliente: aquele arquivo estava congelado em 18/10 19:35 com **15** chaves em
`DART_DEFINES`, sem `APP_VERSION` e sem `BUILD_COMMIT`. Consequencia medida no
codigo, e nao suposta: `AppConfig._ouNulo('')` devolve nulo,
`PortaoDeVersao._perguntar` cai no `if (versao == null ...) return;` e o
bloqueio por versao minima do iOS do cliente estava DESLIGADO -- e
`CarimboDoBuild.textoDe` escrevia `commit nao declarado` no rodape.

O QUE ELE MEDE, E POR QUE ASSIM
===============================

As mesmas regras do portao do APK, porque as cicatrizes sao as mesmas:

- Mede **o valor**, nunca o nome da chave. `String.fromEnvironment` e dobrado
  em constante pelo compilador e o nome da chave e descartado: procurar
  `APP_VERSION` no binario da zero mesmo quando o define entrou.
- Exige **controle positivo**: uma cadeia que se SABE presente. Sem ele o
  portao nao distingue "o valor nao entrou" de "a minha busca nao funciona", e
  a segunda hipotese aprova binario vazio.
- Exige **controle negativo**: um endereco de producao inventado, que NAO pode
  existir no binario. Controle negativo presente significa que a busca casa
  qualquer coisa, e ai o resultado positivo tambem nao vale nada.
- Reprova **bandeira que virou valor** (`--dart-define=CHAVE=` dentro do
  binario), que e a marca do amontoado por variavel de shell medido em
  19/10/2026 saindo `exit 0`.
- Cobra os valores de `--dart-define-from-file=config/mapa.json`, que foi
  exatamente o define perdido em silencio naquele dia.
- Reprova **endereco de maquina LOCAL** dentro do binario (`--proibido`), e
  essa conferencia NAO sai da mesma variavel que o build usou. Ver abaixo.

A ARMADILHA DO `localhost`, E POR QUE ELA PRECISAVA DE DUAS TRAVAS
==================================================================

MEDIDO em 03/11/2026 no banco de dados do `make` deste repositorio:

    make -pn | grep '^API_BASE_URL'                -> http://localhost:3200
    API_BASE_URL=... make -pn | grep '^API_BASE_URL' -> http://localhost:3200
    make -pn API_BASE_URL=... | grep '^API_BASE_URL' -> o valor passado

Ou seja: o `Makefile` atribui com `:=`, entao **o ambiente nao sobrepoe** e so
a LINHA DE COMANDO vence. Quem roda o alvo sem `API_BASE_URL=` na linha de
comando compila apontado para a propria maquina.

E o portao antigo nao pegava isso, por construcao: ele montava a cadeia de
CONTROLE POSITIVO a partir de `$API_BASE_URL`, a MESMA variavel que o build
usara. Com `localhost:3200` no ambiente, o controle positivo que ele montava
era `localhost:3200`, ele achava `localhost:3200` no binario e **APROVAVA** um
binario apontado para a maquina local. Controle que sai do valor medido nao e
controle: e autoaprovacao.

As duas travas, e as duas precisam existir:

1. O controle positivo passou a sair do valor **ESPERADO**, declarado a parte
   (`API_BASE_URL_ESPERADO` em `verificar-ios.sh`), e nunca do valor que o
   build usou.
2. `--proibido`, que mede o BINARIO e nao depende de variavel nenhuma. E a
   unica das duas que funciona no modo `--conferir <binario que o Xcode
   produziu>`, onde nao ha variavel de build para comparar com nada.

POR QUE A FORMA DE URL, E NUNCA A PALAVRA PELADA
================================================

MEDIDO em 03/11/2026 no `App.framework/App` de um build CORRETO (apontado para
`hml.bichu.app`, commit `fb8e5c2d`, 11.956.432 bytes): a palavra `localhost`
aparece **1x**, e a vizinhanca dela no arquivo e `_isNewline`,
`BackdropFilter`, `get:isEven`, `findLockByLogicalKey` -- e a tabela de
simbolos do proprio runtime do Dart, e nao a URL do produto. Ja
`http://localhost` aparece **0x** nesse mesmo binario.

Proibir a palavra pelada reprovaria todo binario correto do projeto. Por isso
o que se proibe e a **forma de URL** (`http://localhost`, `https://127.0.0.1`,
...), e existe uma isca que guarda exatamente este falso positivo.

POR QUE `bytes.count`, E NUNCA `strings`
========================================

MEDIDO em 26/10/2026: `strings -a` **quebra a cadeia no byte acentuado** --
"Conexoes" com `~` sai como `Conex` + `es`, dois pedacos, e um teste que
procurasse a palavra inteira reprovaria um binario correto. Por isso este
portao le os BYTES do arquivo e conta ocorrencias com `bytes.count`, sem
passar por `strings` e sem `grep`.

E por isso ele procura cada alvo em UTF-8 **e** em Latin-1, separadamente: o
mesmo texto com acento tem bytes diferentes nas duas, e decidir a codificacao
por adivinhacao e a forma de reprovar um binario que esta certo. Para alvo
ASCII as duas dao o mesmo numero, o que e inofensivo; para alvo acentuado uma
das duas acha.

LIMITE HONESTO, E ELE E GRANDE
==============================

1. Em build de **release** (e de profile) o Dart viaja em AOT dentro de
   `App.framework/App`, e e la que os valores estao. Em build de **debug** o
   Dart viaja como kernel em `App.framework/flutter_assets/kernel_blob.bin`, e
   `App.framework/App` e um esqueleto: medir o valor ali daria zero por
   CONSTRUCAO, e nao por define perdido. Por isso o portao aceita
   `--binario` apontando para qualquer dos dois e diz qual leu.
2. Este portao prova que as `--dart-define` do COMANDO chegaram ao binario que
   o COMANDO produziu. Ele **nao** prova nada sobre o build que o Xcode do
   cliente faz: o elo entre os dois e o `Generated.xcconfig`, e conferir que o
   Xcode o le exigiria abrir o Xcode. Quem precisa dessa prova tem de medir o
   binario que o Xcode produziu, apontando `--binario` para ele.
3. Ele precisa de macOS com Xcode. Nao precisa de aparelho, de conta Apple,
   nem de certificado -- o build e `--no-codesign`. Mas a esteira do projeto
   roda em Linux, entao este portao e LOCAL, na mesma posicao de `make apk`.

Uso:
  python3 infra/verificacao/verificar_valores_no_binario_ios.py \
      --binario build/ios/iphoneos/Runner.app/Frameworks/App.framework/App \
      --versao <versao> --commit <sha> --controle <cadeia> \
      --controle-negativo <endereco que nao pode existir> \
      --mapa app/config/mapa.json --chave APP_VERSION ... \
      --proibido http://localhost --proibido https://localhost
  python3 infra/verificacao/verificar_valores_no_binario_ios.py --autoteste

Saida: 0 aprovado, 1 reprovado.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile

# As duas codificacoes, medidas separadamente. Ver o cabecalho: decidir por
# adivinhacao e a forma de reprovar um binario correto.
CODIFICACOES = ("utf-8", "latin-1")


class Reprova(Exception):
    """Reprovacao com motivo legivel. Quem chama imprime e sai 1."""


def _bytes_do_binario(caminho: str) -> bytes:
    """Le o binario inteiro. **Reprova quando nao acha ou quando esta vazio.**

    Portao que nao encontra o que conferir fica verde por vazio, e e assim que
    esta classe de defeito passa despercebida. Em 26/10/2026 uma comparacao
    nesta arvore deu "identico" sobre dois arquivos VAZIOS, com o controle
    mentindo junto -- por isso o tamanho e conferido antes de qualquer conta.
    """
    if not os.path.isfile(caminho):
        raise Reprova(
            f"nao existe arquivo em {caminho}. Sem o binario nao ha o que "
            "medir, e portao que nao consegue medir precisa reprovar, nunca "
            "aprovar. Se o caminho termina em `App.framework/App`, confira se "
            "o build de iOS realmente saiu"
        )
    with open(caminho, "rb") as f:
        corpo = f.read()
    if not corpo:
        raise Reprova(
            f"{caminho} tem ZERO bytes. Toda busca dentro dele daria zero, e "
            "uma comparacao entre dois arquivos vazios da 'identico' -- "
            "medicao sobre arquivo vazio nao e medicao"
        )
    return corpo


def _quantas(corpo: bytes, alvo: str) -> dict[str, int]:
    """Quantas vezes `alvo` aparece, por codificacao. Nunca via `strings`."""
    contagens = {}
    for cod in CODIFICACOES:
        try:
            contagens[cod] = corpo.count(alvo.encode(cod))
        except UnicodeEncodeError:
            # Alvo que nao se representa nesta codificacao: 0 e a resposta
            # honesta, e a outra codificacao e que decide.
            contagens[cod] = 0
    return contagens


def _total(contagens: dict[str, int]) -> int:
    return max(contagens.values())


def _laudo_das_contagens(contagens: dict[str, int]) -> str:
    return ", ".join(f"{cod} {n}x" for cod, n in contagens.items())


def _valores_do_mapa(caminho: str) -> dict[str, str]:
    """Os valores de `--dart-define-from-file`, lidos do MESMO arquivo que o build passa."""
    if not os.path.isfile(caminho):
        raise Reprova(
            f"nao existe {caminho}, que e o arquivo de "
            "`--dart-define-from-file` do comando de build. Sem ele o portao "
            "nao sabe quais valores cobrar"
        )
    with open(caminho, encoding="utf-8") as f:
        dados = json.load(f)
    valores = {k: v for k, v in dados.items() if isinstance(v, str) and v}
    if not valores:
        raise Reprova(
            f"{caminho} nao tem nenhum valor de texto. O portao cobraria zero "
            "coisas e ficaria verde por vazio"
        )
    return valores


def conferir(
    binario: str,
    versao: str,
    commit: str,
    controle: str,
    controle_negativo: str,
    mapa: str,
    proibidos: tuple[str, ...],
    chaves: tuple[str, ...] = (),
) -> list[str]:
    """Mede os valores DENTRO do binario. Devolve o laudo, ou levanta [Reprova]."""
    for nome, valor in (
        ("a versao esperada", versao),
        ("o commit esperado", commit),
        ("a string de controle", controle),
        ("o controle negativo", controle_negativo),
    ):
        if not valor or not valor.strip():
            raise Reprova(
                f"{nome} chegou vazio. O portao procuraria a cadeia vazia, que "
                "esta em qualquer binario, e aprovaria sempre -- que e "
                "exatamente o portao cego que ele existe para nao ser"
            )

    proibidos = tuple(dict.fromkeys(p for p in proibidos if p and p.strip()))
    if not proibidos:
        raise Reprova(
            "a lista de enderecos PROIBIDOS chegou vazia. Sem ela este portao "
            "nao reprova binario apontado para `localhost`, e foi exatamente "
            "assim que a armadilha de 03/11/2026 passou: portao que confere "
            "zero coisas fica verde por vazio"
        )

    corpo = _bytes_do_binario(binario)
    do_mapa = _valores_do_mapa(mapa)
    chaves = tuple(dict.fromkeys(tuple(chaves) + tuple(sorted(do_mapa))))
    if not chaves:
        raise Reprova(
            "nenhuma chave de `--dart-define` chegou ao portao. Ele conferiria "
            "zero bandeiras engolidas e ficaria verde por vazio"
        )

    laudo = [f"  binario: {binario} ({len(corpo)} bytes)"]

    # ------------------------------------------------------------------
    # OS DOIS CONTROLES PRIMEIRO, e nesta ordem. Nenhuma conclusao sobre os
    # valores vale antes de os dois passarem.
    # ------------------------------------------------------------------
    # ------------------------------------------------------------------
    # A ORDEM DOS TRES BLOCOS ABAIXO NAO E ARBITRARIA, e mudou em 03/11/2026.
    #
    # Antes era POSITIVO -> NEGATIVO -> valores, pela regra de que nenhuma
    # conclusao vale antes dos dois controles. A regra continua valendo, mas
    # ela vale para achado de AUSENCIA: "o valor nao esta la" so quer dizer
    # algo quando se sabe que a busca acha o que esta.
    #
    # Achado de PRESENCA nao precisa do controle positivo: encontrar bytes que
    # ESTAO no arquivo se valida sozinho, e o unico jeito de ele mentir e a
    # busca casar o que nao esta -- que e exatamente o que o controle NEGATIVO
    # mede. Por isso o negativo vem primeiro, e a conferencia de endereco
    # proibido (presenca) vem antes do controle positivo.
    #
    # ISSO TROCA O DIAGNOSTICO NO CASO QUE IMPORTA. Um binario compilado para
    # `localhost` nao tem o host esperado dentro: na ordem antiga ele reprovava
    # por "controle POSITIVO ausente", que diz "a medicao nao vale" e manda
    # procurar defeito na medicao. Na ordem nova ele reprova por "endereco de
    # maquina LOCAL", que diz o que realmente aconteceu e como consertar.
    # ------------------------------------------------------------------
    c_neg = _quantas(corpo, controle_negativo)
    if _total(c_neg) != 0:
        raise Reprova(
            f"o CONTROLE NEGATIVO {controle_negativo!r} ESTA no binario "
            f"({_laudo_das_contagens(c_neg)}). Ele foi inventado para nao "
            "existir. Se ele aparece, a busca casa coisa que nao esta la e "
            "TODO resultado positivo deste portao e falso -- inclusive os de "
            "baixo. Nao conserte o portao abaixando o controle: descubra por "
            "que a busca casou"
        )
    laudo.append(
        f"  controle NEGATIVO {controle_negativo!r}: ausente "
        f"({_laudo_das_contagens(c_neg)}) -- como tem de ser"
    )

    # ------------------------------------------------------------------
    # O ENDERECO DE MAQUINA LOCAL. A armadilha de 03/11/2026.
    #
    # Vem DEPOIS dos dois controles porque nenhum veredito vale antes deles, e
    # ANTES dos valores porque e o veredito sobre o DESTINO do binario: um
    # binario apontado para a propria maquina com a versao e o commit certos
    # dentro continua sendo um binario que nao fala com servidor nenhum.
    #
    # Esta e a unica conferencia deste portao que nao depende de variavel
    # alguma do build -- e por isso a unica que funciona em `--conferir` sobre
    # um binario que o XCODE produziu.
    # ------------------------------------------------------------------
    for proibido in proibidos:
        c_proibido = _quantas(corpo, proibido)
        if _total(c_proibido) != 0:
            raise Reprova(
                f"o binario contem {_laudo_das_contagens(c_proibido)} da cadeia "
                f"{proibido!r}, que e endereco de maquina LOCAL. ISTO NAO E 'a "
                "medicao falhou': o controle NEGATIVO passou, entao a busca nao "
                "casa o que nao esta -- este endereco esta MESMO dentro do "
                "binario. (Achado de PRESENCA nao precisa do controle positivo: "
                "ver a nota de ordem acima.) Um app apontado para `localhost` no aparelho do "
                "cliente nao fala com servidor nenhum, e o aparelho nao tem como "
                "dizer isso -- a tela so nao carrega.\n"
                "  A CAUSA, MEDIDA EM 03/11/2026: o `Makefile` atribui "
                "`API_BASE_URL := http://localhost:<porta>` com `:=`, entao o "
                "AMBIENTE NAO SOBREPOE e so a LINHA DE COMANDO vence. Rodar o "
                "alvo sem `API_BASE_URL=` na linha de comando compila apontado "
                "para a propria maquina.\n"
                "  Conserto: `make ios API_BASE_URL=https://hml.bichu.app`.\n"
                "  NAO conserte tirando este endereco de `--proibido`: a "
                "conferencia do valor NAO pega este caso, porque o controle "
                "positivo dela sairia da MESMA variavel que o build usou"
            )
    laudo.append(
        "  enderecos PROIBIDOS (%d): ausentes -- como tem de ser"
        % len(proibidos)
    )

    c_pos = _quantas(corpo, controle)
    if _total(c_pos) == 0:
        raise Reprova(
            f"o CONTROLE POSITIVO {controle!r} nao esta no binario "
            f"({_laudo_das_contagens(c_pos)}). Isto NAO e 'o valor faltou': e "
            "'a medicao nao vale'. Ou este binario nao e o build deste "
            "repositorio, ou `--dart-define=API_BASE_URL` tambem se perdeu -- "
            "e nos dois casos o resultado sobre os outros valores nao prova "
            "nada. Se o caminho aponta para um build de DEBUG, o Dart esta em "
            "`flutter_assets/kernel_blob.bin` e nao neste arquivo"
        )
    laudo.append(f"  controle POSITIVO {controle!r}: {_laudo_das_contagens(c_pos)}")

    # ------------------------------------------------------------------
    # OS VALORES.
    # ------------------------------------------------------------------
    c_versao = _quantas(corpo, versao)
    if _total(c_versao) == 0:
        raise Reprova(
            f"a VERSAO {versao!r} nao esta no binario, e os dois controles "
            "passaram -- entao a busca funciona e o valor REALMENTE nao "
            "entrou. O build saiu sem `--dart-define=APP_VERSION`, e o "
            "bloqueio por versao minima deste binario esta DESLIGADO: "
            "`PortaoDeVersao._perguntar` cai no `if (versao == null ...) "
            "return;` e nunca chama `GET /v1/app/version-status`. Nao procure "
            "o NOME `APP_VERSION` aqui: ele nao esta nem quando o define e "
            "passado, porque `String.fromEnvironment` e dobrado em constante"
        )
    laudo.append(f"  APP_VERSION={versao!r}: {_laudo_das_contagens(c_versao)}")

    c_commit = _quantas(corpo, commit)
    if _total(c_commit) == 0:
        raise Reprova(
            f"o COMMIT {commit!r} nao esta no binario, e os dois controles "
            "passaram. O build saiu sem `--dart-define=BUILD_COMMIT`, e "
            "`CarimboDoBuild` vai escrever "
            f"{'commit nao declarado'!r} no rodape -- "
            "ninguem com o aparelho na mao consegue dizer qual commit esta "
            "instalado, que e a BICHUS-210 de volta"
        )
    laudo.append(f"  BUILD_COMMIT={commit!r}: {_laudo_das_contagens(c_commit)}")

    # ------------------------------------------------------------------
    # BANDEIRA QUE VIROU VALOR: a outra metade da cicatriz da variavel de
    # shell. Medida em 19/10/2026 PASSANDO pelas conferencias de valor,
    # porque a versao e o controle estavam la como pedacos do amontoado.
    # ------------------------------------------------------------------
    for chave in chaves:
        marca = f"--dart-define={chave}="
        engolidas = _quantas(corpo, marca)
        if _total(engolidas) != 0:
            raise Reprova(
                f"o binario contem {_laudo_das_contagens(engolidas)} da cadeia "
                f"'{marca}' DENTRO do Dart compilado. Isso nao e um valor: e "
                "uma BANDEIRA que virou valor, porque o comando entregou "
                "varios defines como UM argumento -- o caso de "
                '`flutter build ios "$DEFINES"`, com a variavel entre aspas, '
                "MEDIDO em 19/10/2026 saindo `exit 0`. Escreva as bandeiras "
                "LITERAIS no comando"
            )

    # ------------------------------------------------------------------
    # OS VALORES DE `--dart-define-from-file`. A cicatriz de 19/10/2026.
    # ------------------------------------------------------------------
    for chave, valor in sorted(do_mapa.items()):
        c = _quantas(corpo, valor)
        if _total(c) == 0:
            raise Reprova(
                f"o valor de {chave}, que vem de "
                f"`--dart-define-from-file={mapa}`, nao esta no binario, e os "
                "dois controles passaram. SAO DUAS CAUSAS POSSIVEIS, com "
                "consertos OPOSTOS:\n"
                "  (1) O DEFINE SE PERDEU NO CAMINHO -- medido em 19/10/2026, "
                "defines por VARIAVEL DE SHELL e o `--dart-define-from-file` "
                "desaparecendo calado, build `exit 0`. Conserto: bandeiras "
                "LITERAIS no comando.\n"
                f"  (2) NINGUEM LE {chave} NO DART. Define que o codigo nao le "
                "nao e compilado para dentro do binario, e esta conferencia "
                "nao tem como passar POR CONSTRUCAO.\n"
                f"  PARA SABER QUAL: `git grep -n {chave} -- app/lib`. Sem "
                "ocorrencia, e (2); com leitor, e (1)"
            )
        laudo.append(f"  {chave} (de {mapa}): {_laudo_das_contagens(c)}")

    return laudo


# ---------------------------------------------------------------------------
# AUTOTESTE. Sem ele a conferencia acima valeria pela confianca do dia em que
# foi escrita, e ficaria verde para sempre no dia em que cegasse.
#
# As iscas sao GERADAS aqui, e nao versionadas: sao binarios de brinquedo, e um
# arquivo de isca versionado e um arquivo que alguem "arruma" sem saber que
# arrumar e justamente o que nao se pode fazer com ele.
# ---------------------------------------------------------------------------
VERSAO_ISCA = "1.2.3"
COMMIT_ISCA = "0123456789abcdef0123456789abcdef01234567"
CONTROLE_ISCA = "hml.exemplo.invalido"
NEGATIVO_ISCA = "api-de-producao-que-nao-existe.invalido"
MAPA_ISCA = {"MAP_TILES_URL": "https://telas.exemplo.invalido/{z}.png",
             "MAP_USER_AGENT": "bichu-isca/Conexões-acentuadas"}
PROIBIDOS_ISCA = ("http://localhost", "https://localhost",
                  "http://127.0.0.1", "https://127.0.0.1")


def _escrever(caminho: str, conteudo: bytes) -> str:
    with open(caminho, "wb") as f:
        f.write(conteudo)
    return caminho


def _corpo_bom(cod: str = "utf-8") -> bytes:
    partes = [b"\xcf\xfa\xed\xfe lixo de cabecalho "]
    for texto in (
        VERSAO_ISCA,
        COMMIT_ISCA,
        CONTROLE_ISCA,
        MAPA_ISCA["MAP_TILES_URL"],
        MAPA_ISCA["MAP_USER_AGENT"],
    ):
        partes.append(texto.encode(cod) + b"\x00")
    return b"".join(partes)


def _esperar(nome: str, deve_reprovar: bool, **kwargs) -> bool:
    try:
        conferir(**kwargs)
    except Reprova as erro:
        if deve_reprovar:
            print(f"  isca OK (reprovou como devia): {nome}")
            print(f"    motivo: {str(erro).splitlines()[0]}")
            return True
        print(f"  ISCA FALHOU: {nome} devia APROVAR e reprovou: {erro}")
        return False
    if deve_reprovar:
        print(f"  ISCA FALHOU: {nome} devia REPROVAR e passou. "
              "Se a isca passa, a verificacao parou de verificar")
        return False
    print(f"  isca OK (aprovou como devia): {nome}")
    return True


def autoteste() -> int:
    print("autoteste do portao de valor do binario de iOS")
    with tempfile.TemporaryDirectory(prefix="isca-ios-") as tmp:
        mapa = os.path.join(tmp, "mapa.json")
        with open(mapa, "w", encoding="utf-8") as f:
            json.dump(MAPA_ISCA, f)

        base = dict(
            versao=VERSAO_ISCA,
            commit=COMMIT_ISCA,
            controle=CONTROLE_ISCA,
            controle_negativo=NEGATIVO_ISCA,
            mapa=mapa,
            proibidos=PROIBIDOS_ISCA,
            chaves=("APP_VERSION", "API_BASE_URL", "BUILD_COMMIT"),
        )

        bom = _escrever(os.path.join(tmp, "bom"), _corpo_bom())
        # O MESMO corpo em Latin-1: o alvo acentuado de MAP_USER_AGENT so e
        # achado por uma das duas codificacoes, e o portao precisa aprovar os
        # dois arquivos. Esta e a isca da armadilha do `strings`.
        bom_latin = _escrever(os.path.join(tmp, "bom-latin1"), _corpo_bom("latin-1"))

        vazio = _escrever(os.path.join(tmp, "vazio"), b"")
        sem_versao = _escrever(
            os.path.join(tmp, "sem-versao"),
            _corpo_bom().replace(VERSAO_ISCA.encode(), b"9.9.9"),
        )
        sem_commit = _escrever(
            os.path.join(tmp, "sem-commit"),
            _corpo_bom().replace(COMMIT_ISCA.encode(), b"outro-commit"),
        )
        sem_controle = _escrever(
            os.path.join(tmp, "sem-controle"),
            _corpo_bom().replace(CONTROLE_ISCA.encode(), b"outro-host"),
        )
        com_negativo = _escrever(
            os.path.join(tmp, "com-negativo"),
            _corpo_bom() + NEGATIVO_ISCA.encode() + b"\x00",
        )
        amontoado = _escrever(
            os.path.join(tmp, "amontoado"),
            _corpo_bom() + b"--dart-define=API_BASE_URL=https://x\x00",
        )
        sem_mapa = _escrever(
            os.path.join(tmp, "sem-mapa"),
            _corpo_bom().replace(MAPA_ISCA["MAP_TILES_URL"].encode(), b"nada"),
        )
        # A armadilha de 03/11/2026: build que saiu apontado para a propria
        # maquina. O corpo e o CORRETO mais a URL local, porque e exatamente
        # isso que acontece -- versao e commit certos, destino errado.
        com_endereco_local = _escrever(
            os.path.join(tmp, "com-endereco-local"),
            _corpo_bom() + b"http://localhost:3200\x00",
        )
        # O FALSO POSITIVO QUE ESTA ISCA GUARDA. MEDIDO em 03/11/2026 no
        # `App.framework/App` de um build correto: a palavra `localhost`
        # aparece 1x, na tabela de simbolos do runtime do Dart (vizinha de
        # `BackdropFilter` e `get:isEven`), e `http://localhost` aparece 0x.
        # Um portao que proibisse a palavra pelada reprovaria TODO binario
        # correto do projeto. Este arquivo tem de APROVAR.
        com_simbolo_localhost = _escrever(
            os.path.join(tmp, "com-simbolo-localhost"),
            _corpo_bom() + b"BackdropFilter\x00localhost\x00get:isEven\x00",
        )

        casos = [
            ("binario correto (UTF-8)", False, {"binario": bom}),
            ("binario correto (Latin-1, alvo acentuado)", False, {"binario": bom_latin}),
            ("binario de ZERO bytes", True, {"binario": vazio}),
            ("binario que nao existe", True, {"binario": os.path.join(tmp, "nao-existe")}),
            ("sem APP_VERSION dentro", True, {"binario": sem_versao}),
            ("sem BUILD_COMMIT dentro", True, {"binario": sem_commit}),
            ("controle POSITIVO ausente", True, {"binario": sem_controle}),
            ("controle NEGATIVO presente", True, {"binario": com_negativo}),
            ("bandeira que virou valor (amontoado)", True, {"binario": amontoado}),
            ("valor de --dart-define-from-file ausente", True, {"binario": sem_mapa}),
            ("versao esperada vazia", True, {"binario": bom, "versao": ""}),
            ("commit esperado vazio", True, {"binario": bom, "commit": ""}),
            ("controle positivo vazio", True, {"binario": bom, "controle": ""}),
            ("controle negativo vazio", True, {"binario": bom, "controle_negativo": ""}),
            ("endereco de maquina LOCAL dentro (http://localhost)", True,
             {"binario": com_endereco_local}),
            ("palavra `localhost` solta, simbolo do runtime (falso positivo)", False,
             {"binario": com_simbolo_localhost}),
            ("lista de enderecos proibidos vazia", True,
             {"binario": bom, "proibidos": ()}),
        ]

        todas = True
        for nome, deve_reprovar, extra in casos:
            kwargs = dict(base)
            kwargs.update(extra)
            todas = _esperar(nome, deve_reprovar, **kwargs) and todas

    if not todas:
        print("REPROVA: pelo menos uma isca nao se comportou como devia")
        return 1
    print(f"APROVA: as {len(casos)} iscas do portao se comportaram como deviam")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--binario")
    p.add_argument("--versao")
    p.add_argument("--commit")
    p.add_argument("--controle")
    p.add_argument("--controle-negativo", dest="controle_negativo")
    p.add_argument("--mapa")
    p.add_argument("--chave", action="append", default=[])
    p.add_argument("--proibido", action="append", default=[])
    p.add_argument("--autoteste", action="store_true")
    a = p.parse_args(argv)

    if a.autoteste:
        return autoteste()

    faltando = [
        n
        for n, v in (
            ("--binario", a.binario),
            ("--versao", a.versao),
            ("--commit", a.commit),
            ("--controle", a.controle),
            ("--controle-negativo", a.controle_negativo),
            ("--mapa", a.mapa),
            ("--proibido", a.proibido),
        )
        if not v
    ]
    if faltando:
        print(
            "REPROVA: faltou " + ", ".join(faltando) + ". Portao chamado pela "
            "metade nao mede nada, e sair 0 aqui seria portao decorativo",
            file=sys.stderr,
        )
        return 1

    try:
        laudo = conferir(
            binario=a.binario,
            versao=a.versao,
            commit=a.commit,
            controle=a.controle,
            controle_negativo=a.controle_negativo,
            mapa=a.mapa,
            proibidos=tuple(a.proibido),
            chaves=tuple(a.chave),
        )
    except Reprova as erro:
        print(f"REPROVA: {erro}", file=sys.stderr)
        return 1

    print("APROVA: os valores das `--dart-define` estao DENTRO do binario de iOS")
    for linha in laudo:
        print(linha)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
