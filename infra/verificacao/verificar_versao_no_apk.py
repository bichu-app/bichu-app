#!/usr/bin/env python3
"""Portao do VALOR das `--dart-define` DENTRO do APK.

POR QUE ESTE ARQUIVO EXISTE
===========================

Em 19/10/2026 o cliente pediu *"um metodo que force a atualizacao do app quando
realizarmos um novo deployment em producao"*. O mecanismo foi construido e
provado: tabela `app_version_policy`, rota `GET /v1/app/version-status`,
veredito de tres valores, tela de bloqueio que nao fecha, e falha de rede
LIBERANDO o uso.

So que o app nao mandava a propria versao. `--dart-define=APP_VERSION` nao
entrava em comando de build nenhum: `verificar-apk.sh` passava `API_BASE_URL`,
`ENVIRONMENT`, `TERMS_VERSION`, `TERMS_URL` e `PRIVACY_URL`, e nada mais. Sem a
versao, `PortaoDeVersao._perguntar` cai no `if (versao == null ...) return;` e o
mecanismo fica **inerte em silencio** -- lado seguro, mas desligado. Interruptor
de emergencia que nao esta ligado em nada e pior que nao ter interruptor,
porque alguem vai contar com ele.

MEDIDO em 19/10/2026, com o script como estava: `sh verificar-apk.sh` saiu
`exit 0`, imprimiu "APROVA", e `1.0.0` aparecia **zero** vezes nos tres
`libapp.so` do pacote. O portao de APK que existia confere zip, manifesto, dex
e `libapp.so` -- nada disso olha para DENTRO do Dart compilado.

POR QUE O PORTAO MEDE O VALOR, E NUNCA O NOME DA CHAVE
======================================================

O instinto e procurar `APP_VERSION` no binario. Isso nao prova nada, por duas
razoes opostas, e as duas foram MEDIDAS no `libapp.so` de release de
19/10/2026:

- `API_BASE_URL` aparece **2** vezes mesmo quando o valor esta certo, porque
  `app_config.dart` usa a constante da chave numa mensagem de erro de runtime
  (`'Passe --dart-define=$variavel=<url> ...'`). Presenca da chave nao diz nada
  sobre o valor.
- `APP_VERSION` aparece **0** vezes, mesmo quando o define E passado: ela so
  aparece como argumento de `String.fromEnvironment`, que o compilador dobra em
  constante, e o nome e descartado. Ausencia da chave tambem nao diz nada.

Entao o portao procura **o valor**, byte a byte, com `bytes.count` -- e nao com
`grep` nem com `iconv -t UTF-16LE | grep -c`, que devolve numeros absurdos por
casamento espurio e NAO serve de prova.

A STRING DE CONTROLE, E POR QUE ELA E OBRIGATORIA
=================================================

Sem uma string que se SABE presente, o portao nao distingue "o valor nao entrou
no binario" de "a minha busca nao funciona" -- e a segunda hipotese aprova um
binario vazio ou reprova um binario correto, as duas em silencio. O controle e
o valor de `API_BASE_URL` (`hml.bichu.app`), MEDIDO presente (1 vez) no mesmo
`libapp.so` em que `1.0.0` estava ausente. Controle ausente e REPROVA com outra
mensagem, de proposito: o diagnostico e diferente.

O PARAMETRO DO MAPA, E A CICATRIZ QUE ELE FECHA
===============================================

Em 19/10/2026, gerando APK e iOS, os seis `--dart-define` foram passados por uma
VARIAVEL DE SHELL e o `--dart-define-from-file=config/mapa.json` se perdeu em
SILENCIO: build `exit 0`, `hml.bichu.app` presente, parametro do mapa AUSENTE.
Refeito com os parametros literais, apareceu. Por isso o portao tambem cobra o
valor do arquivo de from-file dentro do binario: a familia nao e "esqueci o
APP_VERSION", e "um define se perdeu e o build nao reclamou".

`--mapa` E OPCIONAL, e em 20/10/2026 deixou de ser passado. O mapa da Rede saiu
em 19/10 (`be057793`, pedido do cliente: evento sem pagina de detalhe) e levou
com ele o unico leitor de `MAP_TILES_URL` e `MAP_USER_AGENT`. `app/config/mapa.json`
ficou, e o comando continuou passando o arquivo -- entao este portao passou a
cobrar o valor de uma chave que NINGUEM LE, o que nao tem como passar: define
que o Dart nao le nao e compilado para dentro do binario. Quem decide se ha
arquivo de from-file e o COMANDO DE BUILD, e `verificar-apk.sh` deriva `--mapa`
do texto dele. Sem a bandeira, este braco nao roda e o LAUDO DIZ ISSO.

A mensagem de reprova deste braco tambem foi corrigida no dia: ela culpava a
variavel de shell, que e so UMA das duas causas, e nao era a do caso medido.

O MANIFESTO, E O QUE ELE FECHA
==============================

O valor de `APP_VERSION` tem de ser o MESMO que o `versionName` do pacote --
duas origens divergem no dia em que alguem passar `--build-name` diferente. O
`AndroidManifest.xml` de dentro do APK e XML BINARIO, e a reserva de strings
dele e UTF-16LE: `1.0.0` aparece 1 vez em `utf-16-le` e 0 vezes em `utf-8`
(medido). O portao cobra a versao na reserva de strings do manifesto, o que
prova que o Gradle estampou a MESMA cadeia que foi para o Dart.

LIMITE HONESTO: o portao confere a presenca da cadeia na reserva de strings, e
nao a amarracao do atributo `android:versionName` a ela. Parsear o chunk de
atributos do XML binario pediria um analisador completo de AXML; a presenca na
reserva ja reprova o caso que interessa (Gradle estampou OUTRA versao, entao a
nossa nao esta la).

Uso:
  python3 infra/verificacao/verificar_versao_no_apk.py --apk <apk> \
      --versao <versao> --controle <cadeia> [--mapa <arquivo de from-file>]
  python3 infra/verificacao/verificar_versao_no_apk.py --autoteste

Saida: 0 aprovado, 1 reprovado.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

# O Dart compilado em AOT viaja em `lib/<abi>/libapp.so`. O build de release
# produz tres ABIs (arm64-v8a, armeabi-v7a, x86_64 -- medido em 19/10/2026), e o
# portao cobra o valor em TODAS: aprovar porque uma delas tem o valor deixaria
# passar um pacote que bloqueia num aparelho e nao noutro.
PADRAO_DO_LIBAPP = "libapp.so"
MANIFESTO = "AndroidManifest.xml"


class Reprova(Exception):
    """Reprovacao com motivo legivel. Quem chama imprime e sai 1."""


def _bytes_do_zip(apk: str) -> tuple[dict[str, bytes], bytes]:
    """Devolve `{caminho: conteudo}` dos `libapp.so` e o manifesto bruto.

    **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
    verde por vazio, e e assim que esta classe de defeito passa despercebida.
    """
    if not os.path.isfile(apk):
        raise Reprova(
            f"nao existe arquivo em {apk}. Sem o pacote nao ha o que medir, e "
            "portao que nao consegue medir precisa reprovar, nunca aprovar"
        )
    try:
        with zipfile.ZipFile(apk) as z:
            nomes = z.namelist()
            libapps = {
                n: z.read(n)
                for n in nomes
                if n.startswith("lib/") and n.endswith("/" + PADRAO_DO_LIBAPP)
            }
            manifesto = z.read(MANIFESTO) if MANIFESTO in nomes else b""
    except zipfile.BadZipFile as erro:
        raise Reprova(
            f"{apk} nao abre como zip ({erro}). APK e um zip; o que esta ali "
            "nao e um APK"
        ) from erro
    if not libapps:
        raise Reprova(
            f"{apk} nao contem nenhum lib/<abi>/{PADRAO_DO_LIBAPP}. O codigo "
            "Dart compilado nao entrou no pacote, e e nele que os valores de "
            "`--dart-define` moram"
        )
    if not manifesto:
        raise Reprova(
            f"{apk} nao contem {MANIFESTO}. Sem ele nao ha como conferir que o "
            "`versionName` estampado pelo Gradle e o mesmo que foi para o Dart"
        )
    return libapps, manifesto


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
    apk: str,
    versao: str,
    controle: str,
    mapa: str | None,
    chaves: tuple[str, ...] = (),
) -> list[str]:
    """Mede os valores DENTRO do pacote. Devolve as linhas do laudo, ou levanta [Reprova]."""
    if not versao:
        raise Reprova(
            "a versao esperada chegou vazia. O portao procuraria a cadeia "
            "vazia, que esta em qualquer binario, e aprovaria sempre -- que e "
            "exatamente o portao cego que ele existe para nao ser"
        )
    if not controle:
        raise Reprova(
            "a string de controle chegou vazia. Sem controle o portao nao "
            "distingue 'o valor nao entrou' de 'a minha busca nao funciona'"
        )

    libapps, manifesto = _bytes_do_zip(apk)
    # `mapa` vazio = o comando de build NAO passa `--dart-define-from-file`.
    # Nao e o mesmo que "o arquivo falta" (isso continua REPROVANDO, logo
    # abaixo): e "nao existe arquivo de from-file neste build". Ver o bloco
    # "O MAPA SAIU" em verificar-apk.sh, que explica por que ele saiu.
    do_mapa = _valores_do_mapa(mapa) if mapa else {}
    # As chaves do arquivo de `--dart-define-from-file` entram sempre: elas sao
    # defines como as outras, e o amontoado as engole igual.
    chaves = tuple(dict.fromkeys(tuple(chaves) + tuple(sorted(do_mapa))))
    if not chaves:
        raise Reprova(
            "nenhuma chave de `--dart-define` chegou ao portao. Ele conferiria "
            "zero bandeiras engolidas e ficaria verde por vazio"
        )
    laudo: list[str] = []
    if not do_mapa:
        # DITO EM VOZ ALTA, e no laudo e nao num comentario: portao que deixa
        # de medir uma coisa tem de dizer que deixou, senao a proxima pessoa le
        # "APROVA" e supoe que tudo foi medido. O numero de chaves cobradas
        # tambem vai no laudo, pelo mesmo motivo.
        laudo.append(
            "  (o braco de `--dart-define-from-file` NAO rodou: o comando de "
            "build nao passa a bandeira, entao nao ha arquivo de valores para "
            f"cobrar. As {len(chaves)} chaves de `--dart-define` continuam "
            "cobradas como bandeira engolida.)"
        )

    alvo_versao = versao.encode("utf-8")
    alvo_controle = controle.encode("utf-8")

    for nome in sorted(libapps):
        corpo = libapps[nome]

        # O CONTROLE PRIMEIRO. Se ele falta, nao se pode concluir nada sobre a
        # versao: ou o binario nao e o que se pensa, ou a busca nao funciona.
        quantas_controle = corpo.count(alvo_controle)
        if quantas_controle == 0:
            raise Reprova(
                f"a STRING DE CONTROLE {controle!r} nao esta em {nome} "
                f"({len(corpo)} bytes). Isto NAO e 'a versao faltou': e 'a "
                "medicao nao vale'. Ou o pacote nao e o build deste "
                "repositorio, ou `--dart-define=API_BASE_URL` tambem se perdeu "
                "-- e nos dois casos o resultado sobre a versao nao prova nada"
            )

        quantas_versao = corpo.count(alvo_versao)
        if quantas_versao == 0:
            raise Reprova(
                f"a VERSAO {versao!r} nao esta em {nome} ({len(corpo)} bytes), "
                f"e a string de controle {controle!r} esta ({quantas_controle}x) "
                "-- entao a busca funciona e o valor REALMENTE nao entrou. O "
                "build saiu sem `--dart-define=APP_VERSION`, e o bloqueio por "
                "versao minima deste APK esta DESLIGADO: `PortaoDeVersao` nao "
                "chama `GET /v1/app/version-status` e nunca bloqueia nada. "
                "Nao procure o NOME `APP_VERSION` no binario: ele nao esta la "
                "nem quando o define e passado, porque "
                "`String.fromEnvironment` e dobrado em constante"
            )
        laudo.append(
            f"  {nome}: versao {versao!r} {quantas_versao}x, "
            f"controle {controle!r} {quantas_controle}x"
        )

        # NENHUM VALOR DE DEFINE PODE CONTER OUTRA BANDEIRA `--dart-define=`.
        #
        # Esta e a OUTRA metade da cicatriz da variavel de shell, e ela foi
        # MEDIDA em 19/10/2026 passando por este portao sem ser vista.
        # Expandindo a variavel ENTRE ASPAS
        # (`flutter build apk "$DEFINES" ...`), o shell entrega UM argumento so,
        # e o Flutter o aceita: a chave fica `APP_VERSION` e o valor fica o
        # amontoado inteiro --
        # `1.0.0 --dart-define=API_BASE_URL=https://hml.bichu.app --dart-define=ENVIRONMENT=hml`
        # --, que foi lido no `libapp.so` desta forma exata. O build saiu 0.
        #
        # As conferencias de cima APROVAVAM esse pacote, porque `1.0.0` e
        # `hml.bichu.app` estao la -- como PEDACOS do amontoado. E o app nasce
        # sem `API_BASE_URL` e nem abre.
        #
        # Medido nos dois binarios: `--dart-define=API_BASE_URL=` aparece 0
        # vezes no build correto e 1 vez no amontoado. A ocorrencia legitima de
        # `--dart-define` (a mensagem `'Passe --dart-define=$variavel=<url>'` de
        # `app_config.dart`) nao tem o nome da chave colado, porque ele e
        # interpolado em runtime: 1 vez nos dois, e nao atrapalha.
        for chave in chaves:
            marca = f"--dart-define={chave}=".encode("utf-8")
            engolidas = corpo.count(marca)
            if engolidas:
                raise Reprova(
                    f"{nome} contem {engolidas}x a cadeia "
                    f"'--dart-define={chave}=' DENTRO do Dart compilado. Isso "
                    "nao e um valor: e uma BANDEIRA que virou valor, porque o "
                    "comando entregou varios defines como UM argumento -- o "
                    "caso de `flutter build apk \"$DEFINES\"`, com a variavel "
                    "entre aspas, MEDIDO em 19/10/2026 saindo `exit 0`. O "
                    f"define de {chave} nao chegou; chegou um amontoado em que "
                    "ele e texto. Escreva as bandeiras LITERAIS no comando"
                )

        # Os valores de `--dart-define-from-file`. Esta e a cicatriz de
        # 19/10/2026: define perdido em silencio, build `exit 0`.
        for chave, valor in sorted(do_mapa.items()):
            quantas = corpo.count(valor.encode("utf-8"))
            if quantas == 0:
                raise Reprova(
                    f"o valor de {chave} ({valor!r}), que vem de "
                    f"`--dart-define-from-file={mapa}`, nao esta em {nome}, e a "
                    f"string de controle {controle!r} esta ({quantas_controle}x). "
                    "SAO DUAS CAUSAS POSSIVEIS, e elas pedem consertos "
                    "opostos:\n"
                    "  (1) o define SE PERDEU no caminho. Medido em 19/10/2026: "
                    "os defines foram passados por VARIAVEL DE SHELL e o "
                    "`--dart-define-from-file` desapareceu calado, com o build "
                    "saindo 0. Conserto: escreva os parametros LITERAIS no "
                    "comando.\n"
                    f"  (2) NINGUEM LE {chave} no Dart. Define que o codigo nao "
                    "le nao e compilado para dentro do binario, entao esta "
                    "conferencia nao tem como passar -- nao por um build mal "
                    "feito, mas por construcao. Medido em 20/10/2026 com "
                    "`MAP_TILES_URL`: o unico leitor "
                    "(`app/lib/telas/rede/local_do_encontro.dart`) saiu em "
                    "`be057793`, quando o cliente pediu o evento sem pagina de "
                    "detalhe, e o arquivo de valores ficou. Conserto: ou entra "
                    "o consumidor da chave, ou a chave sai do arquivo -- NAO se "
                    "inventa um leitor so para o portao ficar verde, que e o "
                    "inverso do que ele existe para fazer.\n"
                    f"  Para saber qual: procure `String.fromEnvironment` com "
                    f"{chave} em `app/lib/`. Sem nenhuma ocorrencia, e (2)"
                )
            laudo.append(f"  {nome}: {chave} {quantas}x")

    # O MANIFESTO. XML binario, reserva de strings em UTF-16LE.
    quantas_manifesto = manifesto.count(versao.encode("utf-16-le"))
    if quantas_manifesto == 0:
        raise Reprova(
            f"a versao {versao!r} nao esta na reserva de strings de "
            f"{MANIFESTO} ({len(manifesto)} bytes, UTF-16LE). O Dart recebeu "
            f"{versao!r} e o Gradle estampou OUTRO `versionName` -- que e "
            "precisamente a divergencia de duas origens que este portao existe "
            "para impedir. Olhe o `--build-name` do comando de build e o "
            "`version:` de app/pubspec.yaml"
        )
    laudo.append(
        f"  {MANIFESTO}: versao {versao!r} {quantas_manifesto}x em UTF-16LE"
    )
    return laudo


# ---------------------------------------------------------------------------
# AUTOTESTE. Sem ele a conferencia acima valeria pela confianca do dia em que
# foi escrita, e ficaria verde para sempre no dia em que cegasse.
#
# As iscas sao GERADAS aqui, e nao versionadas: sao pacotes de brinquedo, e a
# geracao e deterministica. Elas NAO sao APK de verdade -- nao precisam ser: o
# que esta conferencia le e `lib/<abi>/libapp.so` e `AndroidManifest.xml`, e os
# dois sao bytes quaisquer dentro de um zip.
# ---------------------------------------------------------------------------

_VERSAO = "9.9.9"
_CONTROLE = "hml.bichu.app"
_MAPA = {"MAP_TILES_URL": "https://exemplo/{z}.png", "MAP_USER_AGENT": "Isca/9.9"}
_CHAVES = ("APP_VERSION", "API_BASE_URL", "ENVIRONMENT")

# O amontoado, copiado da FORMA exata que foi medida no `libapp.so` de
# 19/10/2026 com `flutter build apk "$DEFINES"`: a versao, e colado nela o resto
# das bandeiras como texto.
_AMONTOADO = (
    f"{_VERSAO} --dart-define=API_BASE_URL=https://{_CONTROLE}"
    " --dart-define=ENVIRONMENT=hml"
)


def _montar_apk(
    destino: str,
    *,
    versao_no_dart: str | None,
    controle: bool,
    do_mapa: bool,
    versao_no_manifesto: str | None,
    abis: tuple[str, ...] = ("arm64-v8a",),
    sem_libapp: bool = False,
    sem_manifesto: bool = False,
) -> str:
    with zipfile.ZipFile(destino, "w") as z:
        if not sem_libapp:
            for abi in abis:
                corpo = b"\x7fELF" + os.urandom(64)
                if controle:
                    corpo += b"\x00" + _CONTROLE.encode()
                if versao_no_dart:
                    corpo += b"\x00" + versao_no_dart.encode()
                if do_mapa:
                    for v in _MAPA.values():
                        corpo += b"\x00" + v.encode()
                z.writestr(f"lib/{abi}/libapp.so", corpo)
        if not sem_manifesto:
            corpo = b"\x03\x00\x08\x00"
            if versao_no_manifesto:
                corpo += versao_no_manifesto.encode("utf-16-le")
            corpo += "versionName".encode("utf-16-le")
            z.writestr(MANIFESTO, corpo)
        z.writestr("classes.dex", b"dex\n035\x00")
    return destino


def autoteste() -> int:
    falhou = False
    tmp = tempfile.mkdtemp(prefix="bichu-isca-versao-")
    mapa = os.path.join(tmp, "mapa.json")
    with open(mapa, "w", encoding="utf-8") as f:
        json.dump(_MAPA, f)

    def esperar_reprova(motivo: str, apk: str, versao: str = _VERSAO) -> None:
        nonlocal falhou
        try:
            conferir(apk, versao, _CONTROLE, mapa, _CHAVES)
        except Reprova as erro:
            print(f"isca reprovada como deveria: {motivo}")
            print(f"    motivo dado: {str(erro)[:120]}...")
            return
        print(
            f"REPROVA: a isca '{motivo}' PASSOU. A conferencia do valor da "
            "versao parou de enxergar esta familia",
            file=sys.stderr,
        )
        falhou = True

    # --- iscas que PRECISAM ser reprovadas ---------------------------------
    esperar_reprova("pacote inexistente", os.path.join(tmp, "nao-existe.apk"))

    naozip = os.path.join(tmp, "naozip.apk")
    with open(naozip, "wb") as f:
        f.write(b"nao sou um zip" * 100)
    esperar_reprova("arquivo que nao e zip", naozip)

    esperar_reprova(
        "zip SEM lib/<abi>/libapp.so",
        _montar_apk(
            os.path.join(tmp, "sem-libapp.apk"),
            versao_no_dart=_VERSAO,
            controle=True,
            do_mapa=True,
            versao_no_manifesto=_VERSAO,
            sem_libapp=True,
        ),
    )

    esperar_reprova(
        "zip SEM AndroidManifest.xml",
        _montar_apk(
            os.path.join(tmp, "sem-manifesto.apk"),
            versao_no_dart=_VERSAO,
            controle=True,
            do_mapa=True,
            versao_no_manifesto=_VERSAO,
            sem_manifesto=True,
        ),
    )

    # A ISCA CENTRAL: o build de 19/10/2026 como estava. Tudo no lugar, menos o
    # VALOR da versao dentro do Dart.
    esperar_reprova(
        "APP_VERSION AUSENTE no Dart (o defeito medido em 19/10/2026)",
        _montar_apk(
            os.path.join(tmp, "sem-versao.apk"),
            versao_no_dart=None,
            controle=True,
            do_mapa=True,
            versao_no_manifesto=_VERSAO,
        ),
    )

    # Versao presente, mas OUTRA. `--build-name` divergente do define, ou
    # pubspec mexido sem refazer o build.
    esperar_reprova(
        "APP_VERSION com valor DIVERGENTE do esperado",
        _montar_apk(
            os.path.join(tmp, "versao-outra.apk"),
            versao_no_dart="1.2.3",
            controle=True,
            do_mapa=True,
            versao_no_manifesto=_VERSAO,
        ),
    )

    # A cicatriz do define perdido por variavel de shell.
    esperar_reprova(
        "define de `--dart-define-from-file` PERDIDO (a cicatriz da variavel de shell)",
        _montar_apk(
            os.path.join(tmp, "sem-mapa.apk"),
            versao_no_dart=_VERSAO,
            controle=True,
            do_mapa=False,
            versao_no_manifesto=_VERSAO,
        ),
    )

    # O AMONTOADO: `flutter build apk "$DEFINES"`, com a variavel ENTRE ASPAS.
    #
    # Esta isca existe porque o caso PASSOU por este portao em 19/10/2026, com
    # um APK de verdade: a versao e o controle estavam la, como PEDACOS do
    # amontoado, e as conferencias de valor aprovaram. O que o denuncia e a
    # BANDEIRA dentro do binario.
    amontoado = os.path.join(tmp, "amontoado.apk")
    with zipfile.ZipFile(amontoado, "w") as z:
        corpo = b"\x7fELF" + b"\x00" + _AMONTOADO.encode()
        for v in _MAPA.values():
            corpo += b"\x00" + v.encode()
        z.writestr("lib/arm64-v8a/libapp.so", corpo)
        z.writestr(MANIFESTO, _VERSAO.encode("utf-16-le"))
    esperar_reprova(
        'bandeira ENGOLIDA por valor de define (`flutter build apk "$DEFINES"`)',
        amontoado,
    )

    # Divergencia entre Dart e Gradle.
    esperar_reprova(
        "versao no Dart e OUTRA no manifesto (duas origens divergindo)",
        _montar_apk(
            os.path.join(tmp, "manifesto-outro.apk"),
            versao_no_dart=_VERSAO,
            controle=True,
            do_mapa=True,
            versao_no_manifesto="1.2.3",
        ),
    )

    # O CONTROLE AUSENTE tem de reprovar com OUTRO diagnostico, e nao com
    # "a versao faltou": medicao que nao vale nao e defeito de versao.
    sem_controle = _montar_apk(
        os.path.join(tmp, "sem-controle.apk"),
        versao_no_dart=_VERSAO,
        controle=False,
        do_mapa=True,
        versao_no_manifesto=_VERSAO,
    )
    try:
        conferir(sem_controle, _VERSAO, _CONTROLE, mapa, _CHAVES)
        print(
            "REPROVA: a isca 'string de controle ausente' PASSOU. Sem controle "
            "a medicao nao vale e o portao tem de dizer isso",
            file=sys.stderr,
        )
        falhou = True
    except Reprova as erro:
        if "CONTROLE" not in str(erro):
            print(
                "REPROVA: a isca 'string de controle ausente' reprovou com o "
                f"diagnostico ERRADO: {erro}",
                file=sys.stderr,
            )
            falhou = True
        else:
            print("isca reprovada como deveria, e pelo motivo certo: controle ausente")

    # Versao esperada VAZIA: a cadeia vazia esta em qualquer binario, e um
    # portao que a procurasse aprovaria sempre.
    completo = _montar_apk(
        os.path.join(tmp, "completo.apk"),
        versao_no_dart=_VERSAO,
        controle=True,
        do_mapa=True,
        versao_no_manifesto=_VERSAO,
        abis=("arm64-v8a", "armeabi-v7a", "x86_64"),
    )
    esperar_reprova("versao esperada VAZIA (aprovaria sempre)", completo, versao="")

    # UMA ABI com a versao e as outras SEM: o pacote bloquearia num aparelho e
    # nao noutro.
    uma_abi_sem = os.path.join(tmp, "uma-abi-sem.apk")
    with zipfile.ZipFile(uma_abi_sem, "w") as z:
        bom = b"\x7fELF" + _CONTROLE.encode() + _VERSAO.encode()
        for v in _MAPA.values():
            bom += b"\x00" + v.encode()
        z.writestr("lib/arm64-v8a/libapp.so", bom)
        ruim = b"\x7fELF" + _CONTROLE.encode()
        for v in _MAPA.values():
            ruim += b"\x00" + v.encode()
        z.writestr("lib/armeabi-v7a/libapp.so", ruim)
        z.writestr(MANIFESTO, _VERSAO.encode("utf-16-le"))
    esperar_reprova("so UMA das ABIs tem a versao", uma_abi_sem)

    # --- isca que PRECISA ser aprovada -------------------------------------
    # Sem esta, uma conferencia que reprovasse tudo passaria no autoteste
    # inteiro e derrubaria a esteira para sempre, com as linhas acima dizendo
    # que estava tudo certo.
    try:
        laudo = conferir(completo, _VERSAO, _CONTROLE, mapa, _CHAVES)
        if len(laudo) < 3:
            print(
                f"REPROVA: o pacote completo passou com laudo de {len(laudo)} "
                "linha(s). Conferencia que aprova sem medir e o mesmo portao cego",
                file=sys.stderr,
            )
            falhou = True
        else:
            print("isca aprovada como deveria: pacote completo nas tres ABIs")
    except Reprova as erro:
        print(
            "REPROVA: a isca do pacote completo foi REPROVADA "
            f"({erro}). A conferencia reprova tudo, e um portao assim nao diz "
            "nada sobre o APK de verdade",
            file=sys.stderr,
        )
        falhou = True

    # --- as iscas do braco OPCIONAL de `--dart-define-from-file` -----------
    #
    # Desde 20/10/2026 o comando de build pode nao passar a bandeira, e o
    # `--mapa` acompanha (ver verificar-apk.sh). Sao TRES coisas para cobrar, e
    # as tres podem quebrar de formas diferentes.

    # (1) SEM `--mapa`, um APK sem as chaves do mapa tem de PASSAR. Este e o
    #     caso de hoje: foi ele que travou a esteira enquanto o portao cobrava
    #     uma chave que ninguem le.
    sem_as_chaves = _montar_apk(
        os.path.join(tmp, "sem-chaves-de-mapa.apk"),
        versao_no_dart=_VERSAO,
        controle=True,
        do_mapa=False,
        versao_no_manifesto=_VERSAO,
    )
    try:
        laudo = conferir(sem_as_chaves, _VERSAO, _CONTROLE, None, _CHAVES)
    except Reprova as erro:
        print(
            "REPROVA: sem `--mapa`, a conferencia REPROVOU um APK correto "
            f"({erro}). O braco do from-file nao esta mesmo opcional, e a "
            "esteira continua travada pelo motivo de 20/10/2026",
            file=sys.stderr,
        )
        falhou = True
    else:
        # (2) e o laudo tem de DIZER que aquele braco nao rodou. Portao que
        #     deixa de medir em silencio e pior do que portao que falta: quem
        #     le "APROVA" supoe que tudo foi medido.
        if not any("NAO rodou" in linha for linha in laudo):
            print(
                "REPROVA: sem `--mapa` a conferencia aprovou e o laudo NAO diz "
                "que o braco de `--dart-define-from-file` deixou de rodar. "
                f"Laudo: {laudo}",
                file=sys.stderr,
            )
            falhou = True
        else:
            print(
                "isca aprovada como deveria, e dizendo o que nao mediu: sem "
                "`--mapa`, APK sem as chaves do from-file passa"
            )

    # (3) `--mapa` APONTANDO PARA ARQUIVO QUE NAO EXISTE continua reprovando.
    #     "Opcional" e "silenciosamente ignorado" sao coisas diferentes, e a
    #     segunda transformaria um erro de digitacao no caminho em aprovacao.
    try:
        conferir(completo, _VERSAO, _CONTROLE, os.path.join(tmp, "nao-existe.json"), _CHAVES)
    except Reprova as erro:
        if "nao existe" not in str(erro):
            print(
                "REPROVA: a isca '`--mapa` para arquivo ausente' reprovou com o "
                f"diagnostico ERRADO: {erro}",
                file=sys.stderr,
            )
            falhou = True
        else:
            print(
                "isca reprovada como deveria: `--mapa` apontando para arquivo "
                "que nao existe (opcional nao e ignorado)"
            )
    else:
        print(
            "REPROVA: a isca '`--mapa` para arquivo ausente' PASSOU. Um erro de "
            "digitacao no caminho passaria a aprovar em silencio",
            file=sys.stderr,
        )
        falhou = True

    shutil.rmtree(tmp, ignore_errors=True)
    if falhou:
        return 1
    print("autoteste: a conferencia do valor da versao enxerga nos dois sentidos")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(add_help=True, description=__doc__)
    p.add_argument("--autoteste", action="store_true")
    p.add_argument("--apk")
    p.add_argument("--versao")
    p.add_argument("--controle")
    p.add_argument("--mapa")
    p.add_argument(
        "--chave",
        action="append",
        default=[],
        help="nome de uma chave de `--dart-define` que o comando de build passa; "
        "repetivel. O portao cobra que nenhuma delas apareca como BANDEIRA "
        "dentro do binario, que e a marca do amontoado por variavel de shell.",
    )
    args = p.parse_args(argv)

    if args.autoteste:
        return autoteste()

    # `--mapa` NAO esta na lista: o comando de build pode nao passar
    # `--dart-define-from-file`, e quem decide isso e o comando, nao este
    # portao. Quando ele vem, o arquivo tem de existir e ter valores, e as duas
    # reprovas continuam em `_valores_do_mapa`. Quando nao vem, o laudo diz que
    # aquele braco nao rodou.
    faltando = [
        nome
        for nome in ("apk", "versao", "controle")
        if not getattr(args, nome)
    ]
    if faltando:
        print(
            "REPROVA: faltou " + ", ".join("--" + n for n in faltando) + ". "
            "Portao chamado pela metade conferiria menos do que anuncia",
            file=sys.stderr,
        )
        return 1

    try:
        laudo = conferir(
            args.apk, args.versao, args.controle, args.mapa, tuple(args.chave)
        )
    except Reprova as erro:
        print(f"REPROVA: {erro}", file=sys.stderr)
        return 1
    print(
        f"APROVA: {args.apk} carrega a versao {args.versao!r} DENTRO do Dart "
        "compilado e no manifesto"
    )
    for linha in laudo:
        print(linha)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
