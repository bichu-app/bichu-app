#!/usr/bin/env python3
"""Portao de portabilidade: amarracao em provedor e em hostname.

docs/07-devops.md secoes 3.6 e 3.9.

Duas familias de achado:
  - provedor: dominio de nuvem, regiao, nome de bucket, SDK em camada errada
  - hostname: literal de host, IP privado, URL absoluta em migracao

E um autoteste que e a parte que importa: as duas iscas em
`tests/portabilidade/` PRECISAM ser reprovadas -- e nao por qualquer regra, mas
por CADA UMA das regras da familia que a isca cobre, em par com a linha de isca
que prova aquela regra. Cada linha de isca declara, num comentario `// isca:
<motivo>`, qual regra ela existe para acordar; o autoteste confere os dois
sentidos desse par e falha nomeando o motivo da regra que parou de enxergar,
porque um portao que ninguem viu reprovar vale pela confianca do dia em que foi
escrito.

Uso: python3 verificar_portabilidade.py [raiz]
Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# O portao varre CODIGO. Configuracao (compose, Makefile, .env.example, infra,
# workflows) e contrato (api/openapi.yaml) tem URL por natureza e ficam de fora:
# e justamente para la que o hostname deve ser empurrado. Varrer configuracao
# faria o portao acusar o proprio remedio.
# `admin/src/` desde 23/09: a SPA do backoffice chama `/v1/admin/*` por caminho
# RELATIVO (mesma origem, D34 da seguranca), entao host literal no codigo que
# vai ao navegador e defeito duas vezes -- amarra o build a um ambiente e abre
# caminho para CORS. So `src/` da SPA, e nao `admin/` inteiro: o
# `vite.config.ts` pode legitimamente apontar o proxy de desenvolvimento para
# `http://localhost:3000`, e `package-lock.json` e `node_modules/` sao URL de
# registro, nao amarracao.
RAIZES_VARRIDAS = ("src/", "migrations/", "app/lib/", "web/", "admin/src/")

# Dentro do codigo, o adaptador externo e onde falar com provedor e legitimo.
ISENTOS = (
    "src/*/adapters/external/",
    "node_modules/",
    "dist/",
    "build/",
)

EXTENSOES = {".ts", ".tsx", ".js", ".mjs", ".dart", ".sql", ".yaml", ".yml", ".json", ".html"}

REGRAS_PROVEDOR = [
    (re.compile(r"\b[\w.-]*\.amazonaws\.com\b"), "dominio de provedor (AWS)"),
    (re.compile(r"\bstorage\.googleapis\.com\b"), "dominio de provedor (GCS)"),
    # O ADR-0022 trouxe o PRIMEIRO servico gerenciado para o caminho de runtime.
    # A excecao vale para o adaptador e para mais nada: sem esta regra, o nome do
    # gerenciador podia aparecer em `config/` e o portao so reclamaria por ser um
    # `.com` qualquer, que e a familia errada de achado e a mensagem errada para
    # quem le. Ver a isca em tests/portabilidade/deve-reprovar-provedor.ts.
    (re.compile(r"\bsecretmanager\.googleapis\.com\b"), "dominio de provedor (Secret Manager)"),
    # O FCM e o transporte do push (ADR-0008) e ele estava sem regra propria.
    # Duas consequencias, e nenhuma das duas e "o portao pegava do mesmo jeito":
    #   - escrito COM esquema, `https://fcm.googleapis.com/...` caia na regra
    #     generica de hostname, que e a familia errada de achado e a mensagem
    #     errada para quem le -- ela manda empurrar o host para configuracao, e
    #     o que este caso pede e o contrario: confinar o PROVEDOR no adaptador,
    #     porque o endereco do FCM nao e configuravel, e o transporte;
    #   - escrito SEM esquema (`fcm.googleapis.com`, num comentario, num
    #     `.env` de exemplo copiado para dentro de `src/`, numa constante
    #     montada por concatenacao) nao casava com nada. Ninguem via.
    # A excecao vale para `src/*/adapters/external/`, como a do Secret Manager:
    # e la que `fcm-http-v1.ts` mora, e e o unico arquivo do sistema que pode
    # saber que o FCM existe.
    (re.compile(r"\bfcm\.googleapis\.com\b"), "dominio de provedor (FCM)"),
    (re.compile(r"\b[\w.-]*\.blob\.core\.windows\.net\b"), "dominio de provedor (Azure)"),
    (re.compile(r"\b[\w.-]*\.r2\.cloudflarestorage\.com\b"), "dominio de provedor (R2)"),
    (re.compile(r"[\"'](?:us|eu|ap|sa)-(?:east|west|north|south|central|northeast|southeast)-\d[\"']"),
     "literal de regiao"),
    (re.compile(r"[\"']southamerica-(?:east|west)\d[\"']"), "literal de regiao"),
    (re.compile(r"[\"']bichu-media-(?:private|public)[\"']"), "nome de bucket em codigo"),
]

REGRAS_HOSTNAME = [
    (re.compile(r"\bhttps?://localhost\b"), "literal `localhost`"),
    (re.compile(r"\bhttps?://127\.0\.0\.1\b"), "literal 127.0.0.1"),
    (re.compile(r"\bhttps?://0\.0\.0\.0\b"), "literal 0.0.0.0"),
    (re.compile(r"\bhttps?://(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d"), "literal de IP privado"),
    (re.compile(r"\bhttps?://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|com\.br|app|net|org|dev|io)\b"),
     "host literal em URL absoluta"),
]

# O par entre regra e linha de isca. Cada linha das iscas em
# `tests/portabilidade/` traz `// isca: <motivo>` dizendo QUAL regra ela existe
# para acordar, e o autoteste confere o par nos dois sentidos (ver autoteste()).
# O motivo e copiado literalmente do `motivo` da regra; se ele contivesse um
# literal que as proprias regras casam, a linha passaria a se auto-satisfazer
# pelo comentario -- nenhum motivo de hoje contem um, e nao deve passar a conter.
MARCA_DE_ISCA = re.compile(r"//\s*isca:\s*(.+?)\s*$")

REGRA_SDK = re.compile(r"""^\s*import\s+.*from\s+['"](@aws-sdk/|@google-cloud/|@azure/)""", re.M)
CAMADAS_PURAS = ("/domain/", "/application/", "/ports/")


def motivo_anotado(linha: str) -> str | None:
    """O motivo que ESTA linha declara acordar, ou None se ela nao declara um.

    A anotacao so vale depois de codigo. Linha que comeca com `//` e prosa, e
    prosa nao anota nada -- o cabecalho de cada isca explica a convencao e para
    isso precisa CITAR a forma dela, e sem esta condicao a propria explicacao
    entrava como anotacao de um motivo que nunca existiu.
    """
    if linha.lstrip().startswith("//"):
        return None
    marca = MARCA_DE_ISCA.search(linha)
    return marca.group(1) if marca is not None else None


def isento(rel: str) -> bool:
    for padrao in ISENTOS:
        if padrao.endswith("/") and "*" not in padrao and rel.startswith(padrao):
            return True
        if "*" in padrao:
            prefixo, sufixo = padrao.split("*", 1)
            if rel.startswith(prefixo) and sufixo.strip("/") in rel:
                return True
    return False


def achados_em(caminho: Path, rel: str) -> list[str]:
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [f"{rel}: nao foi possivel ler: {e}"]

    achados: list[str] = []
    linhas = texto.splitlines()

    for regras in (REGRAS_PROVEDOR, REGRAS_HOSTNAME):
        for regex, motivo in regras:
            for n, linha in enumerate(linhas, 1):
                if regex.search(linha):
                    achados.append(f"{rel}:{n}: {motivo} -> {linha.strip()[:90]}")

    # URL absoluta em migracao e o caso que protege o ponto irreversivel: o
    # banco guarda codigo e chave, nunca URL. Persistir URL transforma a troca
    # de dominio em migracao de dados sobre plastico ja impresso.
    if rel.startswith("migrations/") and caminho.suffix == ".sql":
        for n, linha in enumerate(linhas, 1):
            if "http://" in linha or "https://" in linha:
                achados.append(f"{rel}:{n}: URL absoluta em migracao -> {linha.strip()[:90]}")

    if any(c in f"/{rel}" for c in CAMADAS_PURAS) and REGRA_SDK.search(texto):
        achados.append(f"{rel}: SDK de provedor importado em camada pura (domain/application/ports)")

    return achados


def varrer(raiz: Path, apenas: str | None = None) -> list[str]:
    achados: list[str] = []
    for caminho in sorted(raiz.rglob("*")):
        if not caminho.is_file() or caminho.suffix not in EXTENSOES:
            continue
        rel = caminho.relative_to(raiz).as_posix()
        if apenas is None and not any(rel.startswith(r) for r in RAIZES_VARRIDAS):
            continue
        if apenas is None and isento(rel):
            continue
        if apenas is not None and not rel.startswith(apenas):
            continue
        if apenas is None and rel.startswith("tests/portabilidade/"):
            continue  # as iscas sao avaliadas no autoteste, nao na varredura
        achados.extend(achados_em(caminho, rel))
    return achados


def autoteste(raiz: Path) -> list[str]:
    """Cada regra em par com a linha de isca que a prova, nos DOIS sentidos.

    A primeira versao deste autoteste exigia apenas UM achado por isca, e era
    cega por construcao: apagada uma regra qualquer, as outras regras da mesma
    familia continuavam casando com as OUTRAS linhas da mesma isca, o autoteste
    seguia verde, e o portao parava de enxergar aquele defeito sem nada ficar
    vermelho.

    Exigir "cada regra dispara em algum lugar da isca" nao basta, e o motivo e
    exato: uma regra APAGADA nao esta mais na lista para ser cobrada. A lista de
    regras nao pode ser a unica testemunha de si mesma. Entao a isca declara o
    que espera, e a conferencia vai nos dois sentidos:

      A) regra -> isca: cada regra tem de casar com alguma linha anotada com o
         MOTIVO dela. Pega a linha de isca removida e a regra apertada demais.
      B) isca -> regra: cada linha anotada tem de ser casada por alguma regra
         com o motivo anotado. Pega a regra APAGADA, renomeada ou afrouxada --
         a anotacao sobrevive a regra e cobra por ela.

    A falha cita o motivo, e na direcao A tambem o padrao: dois motivos podem
    ser iguais (as duas regras de `literal de regiao`) e o motivo sozinho nao
    diria qual das duas cegou.
    """
    falhas: list[str] = []
    iscas = (
        ("tests/portabilidade/deve-reprovar-provedor.ts", REGRAS_PROVEDOR, "REGRAS_PROVEDOR"),
        ("tests/portabilidade/deve-reprovar-hostname.ts", REGRAS_HOSTNAME, "REGRAS_HOSTNAME"),
    )
    for rel, regras, familia in iscas:
        caminho = raiz / rel
        if not caminho.is_file():
            falhas.append(
                f"{rel}: isca ausente. Sem ela o portao passa a valer por "
                "confianca, e ninguem sabe se ele ainda enxerga"
            )
            continue
        try:
            linhas = caminho.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError as e:
            falhas.append(f"{rel}: nao foi possivel ler a isca: {e}")
            continue

        anotadas: list[tuple[int, str, str]] = []  # (numero, motivo esperado, linha)
        for n, linha in enumerate(linhas, 1):
            esperado = motivo_anotado(linha)
            if esperado is not None:
                anotadas.append((n, esperado, linha))

        if not anotadas:
            falhas.append(
                f"{rel}: nenhuma linha anotada com `// isca: <motivo>`. Sem as "
                "anotacoes o autoteste nao tem testemunha independente da lista "
                f"de regras, e uma regra apagada de {familia} passaria em branco"
            )

        # Direcao A: regra -> isca.
        for regex, motivo in regras:
            if not any(regex.search(linha) for _, esperado, linha in anotadas if esperado == motivo):
                falhas.append(
                    f'{rel}: NENHUMA LINHA ANOTADA DISPARA a regra "{motivo}" '
                    f"de {familia} (padrao: {regex.pattern}). Ou a linha de isca "
                    "que a provava saiu do arquivo, ou perdeu a anotacao, ou a "
                    "regra ficou estreita demais para o proprio caso dela"
                )

        # Direcao B: isca -> regra. A que pega a regra apagada.
        motivos = {motivo for _, motivo in regras}
        for n, esperado, linha in anotadas:
            if esperado not in motivos:
                falhas.append(
                    f'{rel}:{n}: a isca espera o motivo "{esperado}", que NAO '
                    f"EXISTE MAIS em {familia}. A regra foi apagada ou "
                    "renomeada, e o portao parou de enxergar este defeito"
                )
                continue
            if not any(regex.search(linha) for regex, motivo in regras if motivo == esperado):
                falhas.append(
                    f'{rel}:{n}: a regra "{esperado}" de {familia} NAO CASA MAIS '
                    "com a linha que existe para acorda-la. Ela foi afrouxada, ou "
                    f"a linha deixou de conter o defeito -> {linha.strip()[:90]}"
                )

    return falhas


def main(argv: list[str]) -> int:
    raiz = Path(argv[1] if len(argv) > 1 else ".").resolve()
    print(f"portao de portabilidade - {raiz}")

    falhas_autoteste = autoteste(raiz)
    print(f"  [{'ok' if not falhas_autoteste else 'REPROVA'}] autoteste das iscas")

    achados = varrer(raiz)
    print(f"  [{'ok' if not achados else 'REPROVA'}] varredura do codigo ({len(achados)} achado(s))")

    print()
    if falhas_autoteste:
        print("O PORTAO ESTA CEGO:")
        for f in falhas_autoteste:
            print(f"  - {f}")
    if achados:
        print("Amarracao encontrada:")
        for a in achados:
            print(f"  - {a}")
    if falhas_autoteste or achados:
        return 1
    print("APROVADO")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
