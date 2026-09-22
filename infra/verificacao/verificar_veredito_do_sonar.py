#!/usr/bin/env python3
"""Julga o envelope do SonarCloud. "Nao obtive" e "obtive e e negativo" sao DESFECHOS DIFERENTES.

docs/07-devops.md secao 8.4.

=========================================================================
O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
=========================================================================
Medido no run 35750052587 da `main`, em 22/09/2026: o passo do veredito saiu
com **HTTP 403**. O veredito NUNCA FOI OBTIDO. Mesmo assim o workflow imprimiu
"o portao de qualidade do SonarCloud REPROVOU", a dispensa datada
`sonarcloud-veredito` engoliu essa reprovacao, e o job ficou VERDE.

O `ci.yml` ja tinha um ramo escrito exatamente contra isso:

    *) echo "::error::nao foi possivel obter o veredito do SonarCloud (passo em
       '$estado'). Verificacao que nao consegue verificar reprova, nunca aprova"

Esse ramo era INALCANCAVEL. `steps.<id>.outcome` so assume `success`, `failure`,
`skipped` e `cancelled`; com `continue-on-error: true` e sem `if:`, o passo so
podia sair `success` ou `failure`. "Nao consegui falar com o Sonar" e "o portao
reprovou de verdade" colapsavam no mesmo `failure`, e a dispensa -- escrita para
o segundo caso -- cobria os dois. Uma indisponibilidade do SonarCloud lia-se
como vermelho dispensado, e a esteira passava.

O ramo existia, estava escrito, estava certo, e nunca executou. E a mesma
familia que este projeto vem catalogando: mecanismo que promete o que nao
entrega.

=========================================================================
AS TRES COISAS QUE PRECISAM SER VERDADE
=========================================================================
1. NAO OBTER o veredito reprova, e essa reprovacao NAO E DISPENSAVEL. Dispensa
   e para risco conhecido e aceito; ignorancia nao e risco conhecido.
2. O MOTIVO aparece na saida, com o codigo HTTP ou o erro de transporte: quem
   le precisa distinguir "o Sonar disse nao" de "o Sonar nao disse nada".
3. A dispensa `sonarcloud-veredito` continua valendo, e SO, para o primeiro
   caso -- o veredito negativo de verdade, que e o que ela foi escrita para
   cobrir (74% de linha contra o piso de 80% na primeira analise).

=========================================================================
COMO ELE DISTINGUE
=========================================================================
Nao pelo codigo de saida do passo anterior, que e o que nao funciona. Pelo
ENVELOPE que `buscar_veredito_do_sonar.py` grava: um objeto JSON com `obtido`
(booleano), `status_http`, `motivo` e `veredito`.

O campo `veredito` e julgado contra um VOCABULARIO FECHADO -- `OK`, `ERROR`,
`WARN`, `NONE`, que e o que a API de `project_status` do SonarQube/SonarCloud
declara. Palavra fora dele REPROVA e NAO e dispensavel: lista de permitidos que
recusa forma desconhecida envelhece melhor que enumerar as ruins, e uma palavra
nova significa que este juizo deixou de entender o que o servidor responde.

NAO HA CADEIA `if/elif/else` AQUI, E ISSO E DELIBERADO. Cada regra e um
predicado independente e total sobre o envelope; numa cadeia o `else` recolhe o
que os ramos deixam cair, e a isca passa a reprovar pelo motivo do vizinho --
medido neste repositorio, duas vezes. O autoteste compara CONJUNTOS DE REGRAS,
e nao "reprovou / nao reprovou": isca que reprova por dois motivos ao mesmo
tempo continua verde depois de a regra que ela testava ser desligada.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

RAIZ_PADRAO = Path(__file__).resolve().parents[2]
QUALITY_GATES = Path(".github/quality-gates.yml")
DISPENSA = "sonarcloud-veredito"
ISCAS = Path(__file__).resolve().parent / "iscas"

# O vocabulario de `projectStatus.status` da API do SonarQube/SonarCloud.
VOCABULARIO = {"OK", "ERROR", "WARN", "NONE"}
# Dos quatro, os que significam "o portao olhou e reprovou". `NONE` NAO esta
# aqui: ele significa que nao ha portao calculado para esta analise, que e
# ausencia de veredito e nao veredito negativo.
NEGATIVOS = {"ERROR", "WARN"}

# A UNICA regra dispensavel. A lista e explicita e curta de proposito: quem
# acrescentar um nome aqui esta dizendo, por escrito, que aquele desfecho e
# risco conhecido e aceito.
DISPENSAVEIS = {"veredito-negativo"}


def _envelope(e) -> bool:
    return isinstance(e, dict)


def _obteve(e) -> bool:
    return _envelope(e) and e.get("obtido") is True


def _palavra(e) -> str:
    return str(e.get("veredito")) if _envelope(e) else ""


# Cada regra e um predicado TOTAL e INDEPENDENTE sobre o envelope: ele responde
# para qualquer entrada e nao depende de nenhum outro ter sido avaliado antes.
REGRAS: list[tuple[str, object, str]] = [
    (
        "envelope-ilegivel",
        lambda e: not _envelope(e),
        "o envelope do passo de busca nao existe, nao e JSON, ou nao e um objeto. "
        "Sem ele nao da para afirmar NADA sobre o portao de qualidade deste commit, "
        "e aprovar sem saber e exatamente o defeito que este arquivo existe para impedir",
    ),
    (
        "envelope-fora-de-forma",
        lambda e: _envelope(e) and not isinstance(e.get("obtido"), bool),
        "o envelope nao traz `obtido` como booleano. A forma que o passo de busca grava "
        "mudou e este juizo ficou cego: ele nao sabe nem se houve resposta",
    ),
    (
        "nao-obtive",
        lambda e: _envelope(e) and e.get("obtido") is False,
        "o veredito NAO FOI OBTIDO. Isto nao e o portao de qualidade reprovando: e a "
        "ausencia de qualquer veredito, e verificacao que nao consegue verificar reprova, "
        "nunca aprova. A dispensa `sonarcloud-veredito` NAO cobre este caso",
    ),
    (
        "veredito-fora-do-vocabulario",
        lambda e: _obteve(e) and _palavra(e) not in VOCABULARIO,
        "o servidor respondeu uma palavra que este juizo nao reconhece. Forma desconhecida "
        "REPROVA e nao e dispensavel: significa que o vocabulario da API mudou e o que este "
        "arquivo entende deixou de corresponder ao que o SonarCloud responde",
    ),
    (
        "sem-portao-calculado",
        lambda e: _obteve(e) and _palavra(e) == "NONE",
        "o SonarCloud respondeu `NONE`: nao ha portao de qualidade calculado para esta "
        "analise. E ausencia de veredito, e nao veredito negativo -- a dispensa nao cobre",
    ),
    (
        "veredito-negativo",
        lambda e: _obteve(e) and _palavra(e) in NEGATIVOS,
        "o portao de qualidade do SonarCloud REPROVOU. Este e o unico desfecho que a "
        "dispensa datada `sonarcloud-veredito` cobre",
    ),
]

TEXTO_DA_REGRA = {nome: texto for nome, _p, texto in REGRAS}


def julgar(envelope) -> list[str]:
    """Os nomes das regras que este envelope dispara. Vazio e aprovacao."""
    return [nome for nome, predicado, _t in REGRAS if predicado(envelope)]


def dispensavel(regras: list[str]) -> bool:
    """A dispensa so salva quando TUDO que reprovou e dispensavel.

    Conjunto vazio nao entra aqui: sem reprovacao nao ha o que dispensar.
    """
    return bool(regras) and set(regras) <= DISPENSAVEIS


def ler_dispensa(raiz: Path) -> bool:
    """Ha dispensa datada para `sonarcloud-veredito`?

    Ler o arquivo e obrigatorio. Nao conseguir le-lo e REPROVACAO, e nao
    "entao nao ha dispensa": o mesmo precedente de `verificar_boot_do_alvo_prod.py`,
    que reprova alto quando a lista do codigo fica ilegivel em vez de aprovar por
    omissao. Aqui a omissao seria pior ainda -- ela mudaria o modo do portao sem
    ninguem decidir.
    """
    arquivo = raiz / QUALITY_GATES
    if not arquivo.is_file():
        raise SystemExit(
            f"REPROVA: {QUALITY_GATES} nao existe a partir de {raiz}. E ele quem diz se o "
            "veredito do SonarCloud esta dispensado; sem ele este juizo nao sabe em que modo "
            "esta e nao vai adivinhar"
        )
    padrao = re.compile(rf"^[ \t]*-[ \t]*portao:[ \t]*{re.escape(DISPENSA)}[ \t]*$", re.M)
    return padrao.search(arquivo.read_text(encoding="utf-8")) is not None


def relatar(envelope, regras: list[str], tem_dispensa: bool) -> int:
    print("veredito do portao de qualidade do SonarCloud")
    if _envelope(envelope):
        print(f"  obtido:      {envelope.get('obtido')}")
        print(f"  status HTTP: {envelope.get('status_http', '(sem resposta HTTP)')}")
        if envelope.get("veredito") is not None:
            print(f"  veredito:    {envelope.get('veredito')}")
        if envelope.get("motivo"):
            print(f"  motivo:      {envelope['motivo']}")
        condicoes = envelope.get("condicoes") or []
        if condicoes:
            print(f"  as {len(condicoes)} condicoes do portao, com o valor real de cada uma:")
            for c in condicoes:
                if not isinstance(c, dict):
                    print(f"    [?]  {c}")
                    continue
                marca = "ok " if c.get("estado") == "OK" else "ERRO"
                print(f"    [{marca}] {c.get('metrica')}: {c.get('valor')} "
                      f"{c.get('comparador')} {c.get('piso')}")
        periodo = envelope.get("periodo_de_codigo_novo") or {}
        if periodo:
            print(f"  codigo novo: {periodo}")
        if envelope.get("painel"):
            print(f"  painel:      {envelope['painel']}")
    print(f"  dispensa `{DISPENSA}`: {'presente' if tem_dispensa else 'ausente'}")

    if not regras:
        print("\nAPROVADO: o portao de qualidade do SonarCloud esta verde.")
        return 0

    for nome in regras:
        print(f"\nREPROVA [{nome}]: {TEXTO_DA_REGRA[nome]}")

    if tem_dispensa and dispensavel(regras):
        print(
            f"\n::warning::o portao de qualidade do SonarCloud REPROVOU e nao esta bloqueando, "
            f"por dispensa datada (`{DISPENSA}`) em {QUALITY_GATES}. Isto nao e um job verde: "
            "e uma reprovacao registrada com prazo"
        )
        return 0

    if tem_dispensa:
        nao_cobertas = sorted(set(regras) - DISPENSAVEIS)
        print(
            f"\n::error::a dispensa `{DISPENSA}` existe e NAO cobre este desfecho "
            f"({', '.join(nao_cobertas)}). Ela foi escrita para o veredito negativo de verdade "
            "-- os 74% de linha contra o piso de 80% na primeira analise -- e nao para a "
            "ausencia de veredito. Dispensa e para risco conhecido e aceito, nao para ignorancia"
        )
        return 1

    print(
        f"\n::error::o portao de qualidade do SonarCloud nao aprovou e nao ha dispensa "
        f"`{DISPENSA}` em {QUALITY_GATES}"
    )
    return 1


# =========================================================================
# AS ISCAS
# =========================================================================
# Cada caso isola UMA regra e declara o CONJUNTO EXATO que ele precisa disparar.
# Comparar conjuntos, e nao "reprovou / nao reprovou", e o que impede a
# armadilha medida duas vezes neste repositorio: isca que reprova por dois
# motivos ao mesmo tempo continua verde quando a regra que ela existia para
# testar e desligada, e passa a aprovar a regra quebrada.
#
# A coluna `dispensavel` e a parte que o defeito de hoje viola: o 403 reprova E
# a dispensa nao salva. Um autoteste que so olhasse "reprovou?" ficaria verde
# com o defeito inteiro de pe, porque hoje ele TAMBEM reprova -- e e dispensado.
CASOS: list[tuple[str, set[str], bool, str]] = [
    # (arquivo, regras esperadas, dispensavel, o que o caso isola)
    (
        "veredito-sonar-deve-aprovar.json",
        set(),
        False,
        "o portao verde: nenhuma regra dispara",
    ),
    (
        "veredito-sonar-403.json",
        {"nao-obtive"},
        False,
        "O DEFEITO DE HOJE: HTTP 403, veredito nunca obtido -- reprova e a dispensa NAO salva",
    ),
    (
        "veredito-sonar-transporte.json",
        {"nao-obtive"},
        False,
        "o transporte caiu antes de qualquer HTTP -- reprova e a dispensa NAO salva",
    ),
    (
        "veredito-sonar-negativo.json",
        {"veredito-negativo"},
        True,
        "o veredito negativo DE VERDADE: reprova, e a dispensa salva, como hoje",
    ),
    (
        "veredito-sonar-aviso.json",
        {"veredito-negativo"},
        True,
        "`WARN` e veredito negativo do mesmo portao, e dispensavel pela mesma entrada",
    ),
    (
        "veredito-sonar-sem-portao.json",
        {"sem-portao-calculado"},
        False,
        "`NONE`: 200 com resposta valida e SEM portao calculado -- ausencia, nao reprovacao",
    ),
    (
        "veredito-sonar-palavra-nova.json",
        {"veredito-fora-do-vocabulario"},
        False,
        "palavra fora do vocabulario fechado: forma desconhecida REPROVA",
    ),
    (
        "veredito-sonar-sem-campo-obtido.json",
        {"envelope-fora-de-forma"},
        False,
        "o envelope sem `obtido` booleano: o juizo nao sabe nem se houve resposta",
    ),
    (
        "veredito-sonar-nao-e-objeto.json",
        {"envelope-ilegivel"},
        False,
        "o envelope que nao e um objeto JSON",
    ),
]

# Este nao tem arquivo: ele prova que a AUSENCIA do envelope reprova.
ISCA_SEM_ENVELOPE = "veredito-sonar-que-nao-existe.json"


def carregar(caminho: Path):
    """O envelope, ou `None` quando nao da para le-lo. `None` e julgado como regra."""
    if not caminho.is_file():
        return None
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except Exception:
        return None


def autoteste(raiz: Path) -> int:
    falhas = 0
    print(f"autoteste do juizo do veredito do SonarCloud ({len(CASOS) + 2} casos)")

    for arquivo, esperadas, deve_dispensar, descricao in CASOS:
        caminho = ISCAS / arquivo
        if not caminho.is_file():
            print(f"  [ FALTA   ] {arquivo}: isca ausente")
            falhas += 1
            continue
        try:
            envelope = json.loads(caminho.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [ FALTA   ] {arquivo}: isca ilegivel ({e})")
            falhas += 1
            continue

        regras = set(julgar(envelope))
        if regras != esperadas:
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}")
            print(f"               esperado: {sorted(esperadas) or '(nenhuma regra)'}")
            print(f"               veio:     {sorted(regras) or '(nenhuma regra)'}")
            continue
        visto = dispensavel(sorted(regras))
        if visto != deve_dispensar:
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}")
            print(
                f"               a dispensa {'precisava' if deve_dispensar else 'NAO podia'} "
                f"cobrir este desfecho, e ela {'nao cobriu' if deve_dispensar else 'cobriu'}"
            )
            continue
        print(f"  [    ok    ] {descricao}")

    # A ausencia do envelope, pelo caminho real de leitura.
    ausente = ISCAS / ISCA_SEM_ENVELOPE
    if ausente.exists():
        falhas += 1
        print(f"  [ FALHOU  ] {ISCA_SEM_ENVELOPE} existe: este caso precisa do arquivo AUSENTE")
    else:
        regras = set(julgar(carregar(ausente)))
        if regras == {"envelope-ilegivel"} and not dispensavel(sorted(regras)):
            print("  [    ok    ] o envelope AUSENTE reprova, e a dispensa nao salva")
        else:
            falhas += 1
            print(f"  [ FALHOU  ] o envelope ausente devolveu {sorted(regras)}")

    # O proprio juizo ficando cego: sem `quality-gates.yml` ele NAO decide.
    cego = raiz / "infra" / "verificacao" / "um-diretorio-que-nao-existe"
    try:
        ler_dispensa(cego)
    except SystemExit:
        print("  [    ok    ] sem `quality-gates.yml` o juizo REPROVA em vez de supor o modo")
    else:
        falhas += 1
        print(
            "  [ FALHOU  ] sem `quality-gates.yml` o juizo respondeu assim mesmo. "
            "Ele passou a adivinhar em que modo esta"
        )

    if falhas:
        print(
            f"\nREPROVADO: {falhas} caso(s) de autoteste. O juizo do veredito do SonarCloud "
            "deixou de distinguir o que ele existe para distinguir, e o verde dele parou de "
            "significar alguma coisa"
        )
        return 1
    reprovam = sum(1 for c in CASOS if c[1])
    indispensaveis = sum(1 for c in CASOS if c[1] and not c[2])
    print(
        f"\nautoteste APROVADO: {reprovam} caso(s) reprovam, cada um pelo conjunto de regras "
        f"que ele isola; {indispensaveis} deles NAO sao cobertos pela dispensa"
    )
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--envelope", help="o arquivo que o passo de busca gravou")
    p.add_argument("--raiz", default=str(RAIZ_PADRAO), help="raiz do repositorio")
    p.add_argument("--autoteste", action="store_true", help="roda as iscas e sai")
    a = p.parse_args(argv[1:])

    raiz = Path(a.raiz)

    # As iscas SEMPRE, antes do envelope de verdade: um juizo que deixou de
    # enxergar aprova em silencio, e e para nao aprovar em silencio que ele
    # existe.
    if autoteste(raiz) != 0:
        return 1
    if a.autoteste:
        return 0

    if not a.envelope:
        p.error("fora do autoteste, --envelope e obrigatorio")

    tem_dispensa = ler_dispensa(raiz)
    print()
    return relatar(carregar(Path(a.envelope)), julgar(carregar(Path(a.envelope))), tem_dispensa)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
