#!/usr/bin/env python3
"""Julga a morte do alvo `prod` na esteira: ela precisa ser A MORTE CERTA.

docs/07-devops.md secao 5, e ADR-0022.

=========================================================================
POR QUE ESTE ARQUIVO EXISTE
=========================================================================
O passo `o alvo de producao tambem constroi e sobe` prometia duas coisas:
que a imagem `prod` CONSTROI, e que o processo FICA DE PE. A segunda deixou
de ser verdade em 22/09/2026, quando a ADR-0022 entrou na `development`: em
`NODE_ENV=production` o boot busca os segredos no gerenciador, e num runner
do GitHub nao ha metadata server nem projeto -- `SECRET_STORE_PROJECT` vale
`projeto-de-ci-descartavel`, que nao existe e nunca existiu.

Esse obstaculo e de AMBIENTE e nao tem conserto dentro da esteira. O que tem
conserto e a promessa: o passo passa a provar o que ele consegue provar.

  1. a imagem `prod` constroi (o `docker compose build` do passo);
  2. o processo EXECUTA de verdade -- carrega o codigo, chega a sequencia de
     subida -- e morre EXATAMENTE no gerenciador de segredos, nomeando a
     fonte, o projeto configurado e a lista inteira de segredos.

O que ele deixou de provar esta dito em voz alta no resumo de CADA execucao,
e nao so aqui: **que o alvo `prod` atende requisicao**. Essa prova nao cabe
num runner sem gerenciador e passa a ser verificacao de implantacao.
(A secao 5 de `docs/07-devops.md` ainda descreve a promessa antiga. O arquivo
vive fora do repositorio desde 17/09/2026 e nao pode ser corrigido por este
commit; esta pendencia esta registrada na BICHUS-213.)
Desligar o passo em silencio, ou deixa-lo verde por `|| true`, produziria de
novo o estado que criou esta surpresa: verde por um motivo que ninguem olhou.

=========================================================================
POR QUE ELE JULGA UM LOG EM VEZ DE SUBIR O CONTAINER
=========================================================================
Porque um portao que aprova QUALQUER morte nao prova nada, e para provar que
ele nao aprova qualquer morte e preciso mostra-lo REPROVANDO. Com o docker
por dentro, cada isca custaria uma subida e ninguem as rodaria na esteira.
Separado assim, o passo do job faz o que so o docker faz (construir, subir,
esperar o fim) e este arquivo faz o juizo -- e o juizo roda contra as iscas
de `iscas/boot-prod-*` em `--autoteste`, no primeiro estagio da esteira, sem
docker e em milissegundos.

=========================================================================
QUAL LISTA DE SEGREDOS ELE COBRA
=========================================================================
A do CODIGO: ele le `SEGREDOS_DE_RUNTIME` de `src/shared/config/segredos.ts`.
Copiar a lista para ca criaria a segunda verdade que a propria ADR-0022
recusou -- e no dia em que alguem acrescentasse um segredo, o portao
continuaria cobrando a lista velha e aprovando uma morte parcial.

Nao conseguir ler a lista e REPROVACAO, nunca aprovacao por omissao: um
portao que perdeu o que conferir precisa gritar, nao encolher os ombros.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ_PADRAO = Path(__file__).resolve().parents[2]
FONTE_DOS_SEGREDOS = Path("src/shared/config/segredos.ts")
ISCAS = Path(__file__).resolve().parent / "iscas"

# A fonte que `gcp-secret-manager.ts` declara. O passo precisa morrer NELA:
# morrer no adaptador de variavel de ambiente significaria que o processo nao
# se reconheceu como ambiente hospedado, e ai o alvo `prod` estaria construido
# errado -- que e um defeito de verdade, escondido atras de uma morte parecida.
FONTE_ESPERADA = "gerenciador de segredos"

# O quadro que a excecao precisa carregar. Sem ele, a mensagem pode ter sido
# impressa por qualquer `console.error` que a imite.
QUADRO_ESPERADO = "resolverSegredos"

# A mensagem e montada em `resolverSegredos` como
# `... segredo(s) de runtime em ${provider.fonte}. A aplicação NÃO sobe ...`,
# e e o proprio `fonte` do adaptador do gerenciador que carrega o projeto.
# Por isso sao duas leituras: a fonte primeiro, o projeto DENTRO dela.
CABECALHO = re.compile(
    r"Não foi possível ler (?P<quantos>\d+) segredo\(s\) de runtime em "
    r"(?P<fonte>.+?)\. A aplicação"
)
PROJETO_NA_FONTE = re.compile(r"\(projeto (?P<projeto>[^,)]+)")
ITEM = re.compile(r"^\s+- (?P<nome>[A-Z][A-Z0-9_]*):", re.M)


def ler_segredos_de_runtime(raiz: Path) -> list[str]:
    """Os nomes declarados em `SEGREDOS_DE_RUNTIME`, na ordem do codigo."""
    arquivo = raiz / FONTE_DOS_SEGREDOS
    if not arquivo.is_file():
        raise SystemExit(
            f"REPROVA: {FONTE_DOS_SEGREDOS} nao encontrado a partir de {raiz}. "
            "Sem a lista do codigo nao da para saber quantos segredos a morte "
            "certa precisa nomear, e aprovar sem saber seria o portao cego que "
            "este arquivo existe para nao ser"
        )
    texto = arquivo.read_text(encoding="utf-8")

    abertura = "SEGREDOS_DE_RUNTIME"
    inicio = texto.find(abertura)
    if inicio < 0:
        raise SystemExit(
            f"REPROVA: `{abertura}` nao existe em {FONTE_DOS_SEGREDOS}. Ou a "
            "constante mudou de nome, ou a lista mudou de casa: este portao "
            "precisa ser reapontado antes de voltar a valer"
        )
    colchete = texto.find("[", inicio)
    fim = texto.find("];", colchete)
    if colchete < 0 or fim < 0:
        raise SystemExit(
            f"REPROVA: nao consegui delimitar o literal de `{abertura}` em "
            f"{FONTE_DOS_SEGREDOS}"
        )
    corpo = texto[colchete : fim + 1]

    # Comentario de BLOCO primeiro, e so depois o de linha. A ordem inversa
    # produz o defeito de `app-config.ts:531`, em que um `/*` dentro de um
    # comentario de linha abriu um bloco e engoliu onze linhas em silencio.
    corpo = re.sub(r"/\*.*?\*/", " ", corpo, flags=re.S)
    corpo = re.sub(r"//[^\n]*", " ", corpo)

    nomes = re.findall(r"'([A-Z][A-Z0-9_]*)'", corpo)
    if not nomes:
        raise SystemExit(
            f"REPROVA: `{abertura}` foi encontrada e esta VAZIA para este "
            "leitor. Uma lista vazia aprovaria qualquer morte, inclusive a "
            "morte em que nenhum segredo foi cobrado"
        )
    return nomes


def morreu_com_erro(saida: str) -> bool:
    """O processo terminou, e terminou mal. Qualquer outra coisa reprova."""
    try:
        return int(saida) != 0
    except ValueError:
        return False


def explicar_saida(saida: str) -> str:
    if saida == "nenhuma":
        return (
            "o processo do alvo `prod` NAO terminou dentro do prazo. Ele "
            "deveria morrer na leitura dos segredos, em segundos. Continuar "
            "vivo significa que a sequencia de subida mudou -- pode ser que "
            "ele esteja de pe, e ai esta verificacao esta desatualizada e o "
            "passo precisa voltar a cobrar a sonda"
        )
    if saida == "0":
        return (
            "o alvo `prod` SUBIU, ou engoliu a propria recusa (saida 0). Num "
            "runner sem gerenciador de segredos as duas coisas sao defeito: ou "
            "`NODE_ENV` nao chegou como `production`, ou alguem deu ao processo "
            "um provedor que producao nao usa, ou a excecao foi capturada e o "
            "processo seguiu sem os segredos. Verde aqui seria confianca falsa"
        )
    return (
        f"codigo de saida ininteligivel: {saida!r} (esperado um inteiro, ou "
        "`nenhuma` quando o processo nao terminou no prazo)"
    )


def julgar(log: str, saida: str, projeto: str, esperados: list[str]) -> list[str]:
    """Devolve a lista de motivos de reprovacao. Vazia significa aprovado."""
    problemas: list[str] = []

    # UMA regra, e nao uma cadeia `if/elif/else`: numa cadeia o `else` recolhe
    # o que os ramos deixam cair, entao desligar um ramo nao muda o veredito e
    # nenhuma isca consegue mostrar aquele ramo reprovando. Aqui a regra e
    # "o processo terminou, e terminou com codigo diferente de zero", inteira.
    if not morreu_com_erro(saida):
        problemas.append(explicar_saida(saida))

    cabecalho = CABECALHO.search(log)
    if not cabecalho:
        problemas.append(
            "o log NAO traz a recusa do gerenciador de segredos. O alvo `prod` "
            "morreu por OUTRO motivo, e um passo que aprova qualquer morte nao "
            "prova nada. Leia o log inteiro do container: a causa real esta "
            "nele, e nao e a que este portao esperava"
        )
        return problemas

    fonte = cabecalho.group("fonte")
    if FONTE_ESPERADA not in fonte:
        problemas.append(
            f"a morte veio da fonte {fonte!r}, e nao de {FONTE_ESPERADA!r}. Em "
            "`NODE_ENV=production` o provedor tem de ser o gerenciador "
            "(ADR-0022); cair no adaptador de variavel de ambiente significa "
            "que a imagem `prod` nao se reconhece como ambiente hospedado, e "
            "essa morte se parece com a certa sem ser"
        )

    # Duas regras independentes, e nao um `if/elif`: a fonte que nao nomeia
    # projeto e a fonte que nomeia o projeto errado sao defeitos diferentes, e
    # amarrar uma na outra faria a isca de uma delas depender do estado da
    # outra.
    achado = PROJETO_NA_FONTE.search(fonte)
    visto = achado.group("projeto").strip() if achado else None

    if visto is None:
        problemas.append(
            f"a fonte {fonte!r} nao nomeia projeto nenhum. Sem o projeto no "
            "texto nao da para afirmar que `SECRET_STORE_PROJECT` chegou ao "
            "processo, e e justamente ele que esta errado hoje"
        )

    if visto is not None and visto != projeto:
        problemas.append(
            f"o boot procurou os segredos no projeto {visto!r}, e o ambiente "
            f"do passo declara {projeto!r}. Ou `SECRET_STORE_PROJECT` nao "
            "chegou ao processo, ou existe um projeto escrito em codigo -- que "
            "e a proibicao da secao 11.1 e o que o portao de portabilidade "
            "reprova"
        )

    # A lista cobrada e UMA regra so, e nao tres. Quantidade, nome que falta e
    # nome que sobra nunca aparecem sozinhos num log de verdade -- tres `if`
    # separados dariam a impressao de tres portoes independentes, e nenhuma
    # isca conseguiria mostrar um deles reprovando sem os outros. Uma regra,
    # varios detalhes, uma isca que a desliga inteira.
    quantos = int(cabecalho.group("quantos"))
    nomeados = ITEM.findall(log)
    faltando = [n for n in esperados if n not in nomeados]
    sobrando = [n for n in nomeados if n not in esperados]

    if quantos != len(esperados) or faltando or sobrando:
        detalhes = []
        if quantos != len(esperados):
            detalhes.append(
                f"o boot reclamou de {quantos} e o codigo declara {len(esperados)}"
            )
        if faltando:
            detalhes.append("nao foram cobrados: " + ", ".join(faltando))
        if sobrando:
            detalhes.append("foram cobrados e nao estao na lista: " + ", ".join(sobrando))
        problemas.append(
            "a lista de segredos cobrada na subida NAO e a de "
            "`SEGREDOS_DE_RUNTIME` (" + "; ".join(detalhes) + "). Morte parcial "
            "nao serve: ela significa que parte dos segredos foi resolvida por "
            "outro caminho, e esse outro caminho e justamente o que producao "
            "nao tem. Lista maior significa que algo alem da lista esta sendo "
            "cobrado na subida"
        )

    if QUADRO_ESPERADO not in log:
        problemas.append(
            f"o log nao traz o quadro `{QUADRO_ESPERADO}` na pilha. Sem ele, a "
            "mensagem certa pode ter saido de qualquer lugar que a imite, e o "
            "que se prova e o texto, nao o caminho"
        )

    return problemas


def relatar(titulo: str, problemas: list[str]) -> int:
    if problemas:
        print(f"REPROVADO: {titulo}")
        for p in problemas:
            print(f"  - {p}")
        return 1
    print(f"APROVADO: {titulo}")
    return 0


# ---------------------------------------------------------------------------
# Autoteste
# ---------------------------------------------------------------------------
# Cada caso guarda o log em `iscas/` e diz o que precisa acontecer. Prova
# negativa que vive numa frase evapora: "testei nos dois sentidos" nao acusa
# quando a regra deixa de funcionar. Estes casos acusam, na esteira, em
# `rapidos`.
#
# CADA CASO ISOLA UMA REGRA, e isso nao e preciosismo: a primeira versao deste
# arquivo tinha uma isca que reprovava por DOIS motivos ao mesmo tempo. Desligar
# a regra que ela existia para testar deixava o autoteste VERDE, porque o outro
# motivo continuava reprovando -- a isca aprovava a regra quebrada. Medido, nao
# suposto. Por isso ha um caso por regra, mais um composto realista no fim.
CASOS: list[tuple[str, str, str, bool]] = [
    # (arquivo de log, codigo de saida, o que o caso e, precisa aprovar)
    ("boot-prod-deve-aprovar.log", "1", "a morte certa, capturada da execucao 35721851040", True),
    # A SAIDA, isolada: o MESMO log que aprova, com o codigo de saida errado.
    # Os dois casos de baixo sao os realistas; estes dois sao os que provam que
    # a regra da saida existe. Sem eles, desligar a conferencia de saida
    # deixava o autoteste VERDE -- porque os logs realistas tambem nao trazem
    # a recusa, e quem reprovava era a outra regra.
    ("boot-prod-deve-aprovar.log", "0", "a recusa certa, e mesmo assim saiu com 0", False),
    ("boot-prod-deve-aprovar.log", "nenhuma", "a recusa certa, e o processo nao terminou", False),
    ("boot-prod-subiu.log", "0", "o alvo `prod` ficou de pe", False),
    ("boot-prod-nao-morreu.log", "nenhuma", "o processo nao terminou no prazo", False),
    # ausencia da recusa
    ("boot-prod-outro-motivo.log", "1", "morreu antes, em variavel de ambiente obrigatoria", False),
    # a fonte, isolada: projeto certo, provedor errado
    ("boot-prod-provedor-falso.log", "1", "um provedor de segredos que producao nao usa", False),
    # o projeto, isolado
    ("boot-prod-fonte-sem-projeto.log", "1", "o gerenciador sem projeto nenhum no texto", False),
    ("boot-prod-projeto-divergente.log", "1", "buscou num projeto que o passo nao declarou", False),
    # a lista
    ("boot-prod-morte-parcial.log", "1", "so tres dos oito segredos foram cobrados", False),
    ("boot-prod-lista-trocada.log", "1", "oito segredos, um deles fora de `SEGREDOS_DE_RUNTIME`", False),
    # a pilha
    ("boot-prod-sem-pilha.log", "1", "a mensagem certa sem o quadro de `resolverSegredos`", False),
    # composto, e o mais realista dos oito: o alvo `prod` que nao se reconhece
    # como ambiente hospedado cai no adaptador de ambiente, que nem projeto tem.
    ("boot-prod-fonte-de-ambiente.log", "1", "morreu no adaptador de ambiente (fonte e projeto)", False),
]

PROJETO_DAS_ISCAS = "projeto-de-ci-descartavel"


def autoteste(esperados: list[str]) -> int:
    falhas = 0
    print(f"autoteste do juizo da morte do alvo prod ({len(CASOS)} casos)")
    for arquivo, saida, descricao, precisa_aprovar in CASOS:
        caminho = ISCAS / arquivo
        if not caminho.is_file():
            print(f"  [ FALTA  ] {arquivo}: isca ausente")
            falhas += 1
            continue
        problemas = julgar(
            caminho.read_text(encoding="utf-8"), saida, PROJETO_DAS_ISCAS, esperados
        )
        aprovou = not problemas
        if aprovou == precisa_aprovar:
            print(f"  [    ok   ] {descricao}")
        else:
            falhas += 1
            esperado = "aprovar" if precisa_aprovar else "REPROVAR"
            print(f"  [ FALHOU  ] {descricao}: precisava {esperado} e nao {esperado.lower()}u")
            for p in problemas:
                print(f"               {p}")
    if falhas:
        print(
            f"\nREPROVADO: {falhas} caso(s). O juizo da morte do alvo `prod` "
            "deixou de enxergar o que ele existe para enxergar"
        )
        return 1
    reprovam = sum(1 for c in CASOS if not c[3])
    print(f"\nAPROVADO: o juizo aprova a morte certa e reprova as outras {reprovam}")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--log", help="arquivo com a saida do container")
    p.add_argument("--saida", help="codigo de saida do processo, ou `nenhuma`")
    p.add_argument("--projeto", help="o SECRET_STORE_PROJECT que o passo declarou")
    p.add_argument("--raiz", default=str(RAIZ_PADRAO), help="raiz do repositorio")
    p.add_argument("--autoteste", action="store_true", help="roda as iscas e sai")
    a = p.parse_args(argv[1:])

    esperados = ler_segredos_de_runtime(Path(a.raiz))
    print(f"`SEGREDOS_DE_RUNTIME` declara {len(esperados)}: {', '.join(esperados)}")

    if a.autoteste:
        return autoteste(esperados)

    if not (a.log and a.saida and a.projeto):
        p.error("fora do autoteste, --log, --saida e --projeto sao obrigatorios")

    arquivo = Path(a.log)
    if not arquivo.is_file():
        print(f"REPROVADO: {a.log} nao existe. Sem o log do container nao ha o que julgar")
        return 1

    return relatar(
        "o alvo `prod` constroi e morre no gerenciador de segredos, como deve "
        "num runner sem gerenciador",
        julgar(arquivo.read_text(encoding="utf-8"), a.saida, a.projeto, esperados),
    )


if __name__ == "__main__":
    sys.exit(main(sys.argv))
