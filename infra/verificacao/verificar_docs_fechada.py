#!/usr/bin/env python3
"""Verificacao externa e agendada: a Swagger UI esta fechada (ADR-0018, 2.1).

Roda de FORA, sem acesso privilegiado, porque o ponto de vista que importa e o
de quem esta na internet. Mesmo molde de `verificar_associacao.py`, e pelo mesmo
motivo: a quebra que este monitor existe para pegar nao vem de commit. Ela vem
de uma variavel de ambiente trocada numa implantacao, num dia em que ninguem
mexeu no codigo. Amarrar isto a um deploy seria procurar a falha no unico lugar
onde ela nao nasce.

O que ele afirma, e reprova em qualquer uma (ADR-0018, item 2.1):

  1. em PRODUCAO, `/v1/docs` e `/v1/openapi.yaml` respondem 404 sem credencial
     nenhuma. Nao 401, nao 403: o caminho nao existe la;
  2. em HOMOLOGACAO, os dois respondem 401 sem credencial. 200 aqui e
     reprovacao: significa que a exigencia caiu;
  3. em HOMOLOGACAO, COM a credencial, respondem 200 -- porque uma protecao que
     tambem barra quem deveria entrar seria descoberta pelo outro time, no pior
     momento, e nao por nos.

**Quando nao conseguir verificar, reprova**, com o motivo. Falha de rede, de
DNS, de TLS ou de leitura de configuracao sao reprovacao, nunca "esta tudo bem":
a assimetria e deliberada, porque confianca falsa e pior que ausencia de
verificacao -- ninguem procura o que acredita ja ter.

E o caso que ela PRECISA reprovar vai junto no repositorio: o autoteste roda
`infra/verificacao/iscas/docs-fechada-casos-que-precisam-reprovar.yml` a cada
execucao, antes de tocar a rede. Se um caso daquele arquivo passar, este script
falha com "o monitor parou de enxergar" e nem chega a consultar os ambientes.

Uso: python3 verificar_docs_fechada.py [caminho/para/docs-fechada.yml]
Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import base64
import datetime as _dt
import http.client
import os
import re
import sys
import urllib.parse
from pathlib import Path

TEMPO_LIMITE = 20
CAMINHOS = ["/v1/docs", "/v1/openapi.yaml"]


class Reprovacao(Exception):
    """Falha de assercao ou impossibilidade de verificar. Os dois reprovam."""


# ---------------------------------------------------------------------------
# As assercoes, separadas da rede de proposito
# ---------------------------------------------------------------------------
# Elas recebem numero e devolvem texto, sem tocar em socket. E isso que torna o
# autoteste possivel: prova negativa que depende de um ambiente de pe so roda
# quando o ambiente esta de pe, e por isso nao roda.

def avaliar_sem_credencial(ambiente: str, caminho: str, status: int) -> list[str]:
    if ambiente == "prod":
        if status == 404:
            return []
        if status in (401, 403):
            return [
                f"prod {caminho}: respondeu {status}. Em producao o caminho precisa NAO EXISTIR "
                "(404). Um 401 confirma a quem esta procurando que a UI esta ali, atras de uma "
                "senha -- que e metade do mapa que o ADR-0018 recusou a dar"
            ]
        if status == 200:
            return [
                f"prod {caminho}: respondeu 200 SEM credencial. A Swagger UI esta publicada em "
                "producao, com a superficie inteira do produto: reautenticacao, transferencia de "
                "pet e revogacao de tag, com exemplos"
            ]
        return [f"prod {caminho}: esperado 404, veio {status}"]

    if ambiente == "preprod":
        if status == 401:
            return []
        if status == 200:
            return [
                f"preprod {caminho}: respondeu 200 SEM credencial. A exigencia de credencial "
                "caiu, e ela e a unica protecao que a UI tem"
            ]
        return [
            f"preprod {caminho}: esperado 401 sem credencial, veio {status}. Um 404 aqui tambem "
            "reprova: a UI precisa EXISTIR em homologacao, senao o outro time nao tem como ler o "
            "contrato e vai pedir uma copia do YAML -- que envelhece na primeira mudanca"
        ]

    return [f"ambiente desconhecido: {ambiente!r}"]


def avaliar_com_credencial(ambiente: str, caminho: str, status: int) -> list[str]:
    if ambiente != "preprod":
        return []
    if status == 200:
        return []
    return [
        f"preprod {caminho}: com a credencial correta respondeu {status}, esperado 200. Protecao "
        "que tambem barra quem deveria entrar e descoberta pelo outro time, no pior momento"
    ]


# ---------------------------------------------------------------------------
# Autoteste: os casos guardados no repositorio
# ---------------------------------------------------------------------------

ISCA = "infra/verificacao/iscas/docs-fechada-casos-que-precisam-reprovar.yml"


def casos_da_isca(caminho: Path) -> list[dict]:
    if not caminho.is_file():
        raise Reprovacao(
            f"{caminho}: os casos que este monitor precisa reprovar nao estao no repositorio. "
            "Sem eles ele passa a valer pela confianca do dia em que foi escrito"
        )
    casos: list[dict] = []
    atual: dict | None = None
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip() or linha.strip() == "casos:":
            continue
        if m := re.fullmatch(r"\s*-\s*(\w+):\s*(.+)", linha):
            atual = {m.group(1): m.group(2).strip().strip('"')}
            casos.append(atual)
        elif m := re.fullmatch(r"\s+(\w+):\s*(.+)", linha):
            if atual is None:
                raise Reprovacao(f"{caminho}:{n}: campo indentado sem caso: {bruta!r}")
            atual[m.group(1)] = m.group(2).strip().strip('"')
        else:
            raise Reprovacao(f"{caminho}:{n}: linha fora do formato esperado: {bruta!r}")
    if not casos:
        raise Reprovacao(f"{caminho}: nenhum caso declarado. Autoteste sem caso reprova")
    return casos


def autoteste(raiz: Path) -> list[str]:
    falhas: list[str] = []
    casos = casos_da_isca(raiz / ISCA)
    for caso in casos:
        for obrigatorio in ("ambiente", "credencial", "status", "porque"):
            if obrigatorio not in caso:
                falhas.append(f"{ISCA}: caso {caso} sem `{obrigatorio}`")
                break
        else:
            avaliar = avaliar_sem_credencial if caso["credencial"] == "nao" else avaliar_com_credencial
            resultado = avaliar(caso["ambiente"], "/v1/docs", int(caso["status"]))
            if not resultado:
                falhas.append(
                    f"{ISCA}: O CASO PASSOU -- ambiente={caso['ambiente']} "
                    f"credencial={caso['credencial']} status={caso['status']}. "
                    f"Ele existe porque {caso['porque']}. O monitor parou de enxergar"
                )
    return falhas


# ---------------------------------------------------------------------------
# Rede
# ---------------------------------------------------------------------------

def buscar(url: str, credencial: tuple[str, str] | None) -> int:
    partes = urllib.parse.urlsplit(url)
    if partes.scheme != "https":
        raise Reprovacao(f"{url}: a verificacao externa so vale sobre HTTPS")
    cabecalhos = {"User-Agent": "bichu-verificacao-docs/1"}
    if credencial:
        cru = f"{credencial[0]}:{credencial[1]}".encode()
        cabecalhos["Authorization"] = "Basic " + base64.b64encode(cru).decode()
    conexao = http.client.HTTPSConnection(partes.hostname, partes.port or 443, timeout=TEMPO_LIMITE)
    try:
        conexao.request("GET", partes.path or "/", headers=cabecalhos)
        resposta = conexao.getresponse()
        resposta.read(1024)
        return resposta.status
    except Reprovacao:
        raise
    except Exception as e:
        raise Reprovacao(f"GET {url} falhou: {e}") from e
    finally:
        conexao.close()


def carregar_config(caminho: Path) -> dict:
    """Parser estrito do subconjunto de YAML que este arquivo usa."""
    if not caminho.is_file():
        raise Reprovacao(f"configuracao nao encontrada: {caminho}")
    cfg: dict = {"ambientes": []}
    atual: dict | None = None
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip():
            continue
        if linha.strip() == "ambientes:":
            atual = None
            continue
        if m := re.fullmatch(r"\s*-\s*(\w+):\s*(.*)", linha):
            atual = {m.group(1): m.group(2).strip().strip('"')}
            cfg["ambientes"].append(atual)
        elif m := re.fullmatch(r"\s+(\w+):\s*(.*)", linha):
            if atual is None:
                raise Reprovacao(f"{caminho}:{n}: campo indentado sem ambiente: {bruta!r}")
            atual[m.group(1)] = m.group(2).strip().strip('"')
        elif m := re.fullmatch(r"(\w+):\s*(.*)", linha):
            cfg[m.group(1)] = m.group(2).strip().strip('"')
            atual = None
        else:
            raise Reprovacao(f"{caminho}:{n}: linha fora do formato esperado: {bruta!r}")
    if not cfg["ambientes"]:
        raise Reprovacao(f"{caminho}: nenhum ambiente declarado. Verificacao sem alvo reprova")
    for amb in cfg["ambientes"]:
        for obrigatorio in ("nome", "base_url", "esperado_a_partir_de"):
            if obrigatorio not in amb:
                raise Reprovacao(f"{caminho}: ambiente {amb} sem `{obrigatorio}`")
    return cfg


def verificar_ambiente(amb: dict, hoje: _dt.date) -> tuple[list[str], list[str]]:
    falhas: list[str] = []
    avisos: list[str] = []
    nome = amb["nome"]
    base = amb["base_url"].rstrip("/")
    vence = _dt.date.fromisoformat(amb["esperado_a_partir_de"])

    if not base or "a-definir" in base:
        mensagem = (
            f"{nome}: `base_url` ainda nao aponta para um dominio real ({base or '(vazio)'}). "
            "O monitor nao tem o que consultar"
        )
        if hoje >= vence:
            falhas.append(mensagem + f", e a data {vence} ja passou: isto reprova")
        else:
            avisos.append(mensagem + f"; obrigatorio a partir de {vence}")
        return avisos, falhas

    for caminho in CAMINHOS:
        status = buscar(base + caminho, None)
        falhas.extend(avaliar_sem_credencial(nome, caminho, status))

    if nome == "preprod":
        usuario = os.environ.get("DOCS_USER", "")
        senha = os.environ.get("DOCS_PASSWORD", "")
        if not usuario or not senha:
            mensagem = (
                "preprod: `DOCS_USER`/`DOCS_PASSWORD` nao estao no ambiente deste job, entao a "
                "assercao 3 do ADR-0018 (com credencial responde 200) NAO RODOU. Uma protecao "
                "que tambem barra quem deveria entrar passaria despercebida"
            )
            if hoje >= vence:
                falhas.append(mensagem + f", e a data {vence} ja passou: isto reprova")
            else:
                avisos.append(mensagem + f"; obrigatorio a partir de {vence}")
        else:
            for caminho in CAMINHOS:
                status = buscar(base + caminho, (usuario, senha))
                falhas.extend(avaliar_com_credencial(nome, caminho, status))

    return avisos, falhas


def main(argv: list[str]) -> int:
    padrao = Path(__file__).resolve().parent / "docs-fechada.yml"
    caminho = Path(argv[1]) if len(argv) > 1 else padrao
    raiz = Path(argv[2]).resolve() if len(argv) > 2 else Path(__file__).resolve().parents[2]
    hoje = _dt.date.today()

    print(f"verificacao da Swagger UI fechada - {hoje.isoformat()} - {caminho}")

    try:
        falhas_autoteste = autoteste(raiz)
    except Reprovacao as e:
        falhas_autoteste = [str(e)]
    print(f"  [{'ok' if not falhas_autoteste else 'REPROVA'}] autoteste dos casos guardados")
    if falhas_autoteste:
        print()
        print("O MONITOR ESTA CEGO:")
        for f in falhas_autoteste:
            print(f"  - {f}")
        print()
        print("Os ambientes NAO foram consultados: com o monitor cego, um verde nao diz nada.")
        return 1

    try:
        cfg = carregar_config(caminho)
    except Reprovacao as e:
        print(f"REPROVA: {e}")
        return 1

    falhas: list[str] = []
    avisos: list[str] = []
    for amb in cfg["ambientes"]:
        try:
            novos_avisos, novas_falhas = verificar_ambiente(amb, hoje)
        except Reprovacao as e:
            novos_avisos, novas_falhas = [], [f"{amb['nome']}: nao foi possivel verificar: {e}"]
        print(f"  [{'ok' if not novas_falhas else 'REPROVA'}] {amb['nome']} ({amb.get('base_url') or 'sem url'})")
        avisos.extend(novos_avisos)
        falhas.extend(novas_falhas)

    print()
    for aviso in avisos:
        print(f"  [aviso] {aviso}")
    if falhas:
        print()
        print(f"REPROVADO com {len(falhas)} achado(s):")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("APROVADO")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
