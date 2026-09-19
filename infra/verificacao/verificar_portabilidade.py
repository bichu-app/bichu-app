#!/usr/bin/env python3
"""Portao de portabilidade: amarracao em provedor e em hostname.

docs/07-devops.md secoes 3.6 e 3.9.

Duas familias de achado:
  - provedor: dominio de nuvem, regiao, nome de bucket, SDK em camada errada
  - hostname: literal de host, IP privado, URL absoluta em migracao

E um autoteste que e a parte que importa: as duas iscas em
`tests/portabilidade/` PRECISAM ser reprovadas. Se elas passarem, este script
falha com "o portao parou de enxergar", porque um portao que ninguem viu
reprovar vale pela confianca do dia em que foi escrito.

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
RAIZES_VARRIDAS = ("src/", "migrations/", "app/lib/", "web/")

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

REGRA_SDK = re.compile(r"""^\s*import\s+.*from\s+['"](@aws-sdk/|@google-cloud/|@azure/)""", re.M)
CAMADAS_PURAS = ("/domain/", "/application/", "/ports/")


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
    """As iscas PRECISAM reprovar. E a prova negativa do portao."""
    falhas: list[str] = []
    iscas = {
        "tests/portabilidade/deve-reprovar-provedor.ts": REGRAS_PROVEDOR,
        "tests/portabilidade/deve-reprovar-hostname.ts": REGRAS_HOSTNAME,
    }
    for rel in iscas:
        caminho = raiz / rel
        if not caminho.is_file():
            falhas.append(
                f"{rel}: isca ausente. Sem ela o portao passa a valer por "
                "confianca, e ninguem sabe se ele ainda enxerga"
            )
            continue
        if not achados_em(caminho, rel):
            falhas.append(
                f"{rel}: A ISCA PASSOU. O portao de portabilidade parou de "
                "enxergar esta familia de defeito"
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
