#!/usr/bin/env python3
"""Verificacao externa dos arquivos de associacao de deep link.

Roda de fora, sem acesso privilegiado, porque o ponto de vista que importa e o
do sistema operacional do usuario. Ver docs/07-devops.md, secao 16.12.

Regra que governa este arquivo inteiro: **quando nao consegue verificar,
reprova**. Falha de rede, de DNS, de TLS ou de leitura de configuracao sao
reprovacao com motivo, nunca "esta tudo bem".

Uso:
    python3 verificar_associacao.py [caminho/para/associacao.yml]

Saida: 0 se tudo passou, 1 se qualquer assercao falhou ou nao pode ser feita.
Somente biblioteca padrao: roda em runner limpo sem instalar nada.
"""

from __future__ import annotations

import datetime as _dt
import http.client
import json
import re
import socket
import ssl
import subprocess
import sys
import urllib.parse
from pathlib import Path

# Cabecalhos que denunciam intermediario entre o cliente e a nossa origem.
CABECALHOS_DE_PROXY = ("cf-ray", "cf-cache-status", "cf-apo-via", "x-cache", "via")
SERVIDORES_DE_PROXY = ("cloudflare", "squarespace")

TEMPO_LIMITE = 20


class Reprovacao(Exception):
    """Falha de assercao ou impossibilidade de verificar. Os dois reprovam."""


# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------

def carregar_config(caminho: Path) -> dict:
    """Parser estrito do subconjunto de YAML que este arquivo usa.

    Deliberadamente nao usa biblioteca de YAML: o runner nao precisa instalar
    nada, e qualquer coisa fora do formato esperado reprova em vez de ser
    interpretada de um jeito criativo.
    """
    if not caminho.is_file():
        raise Reprovacao(f"configuracao nao encontrada: {caminho}")

    cfg: dict = {"alvos": []}
    alvo_atual: dict | None = None

    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip():
            continue

        if m := re.fullmatch(r"(\w+):\s*(.*)", linha):
            chave, valor = m.group(1), m.group(2).strip().strip('"').strip("'")
            if chave == "alvos":
                alvo_atual = None
                continue
            cfg[chave] = valor
            alvo_atual = None
        elif m := re.fullmatch(r"\s*-\s*(\w+):\s*(.+)", linha):
            alvo_atual = {m.group(1): m.group(2).strip().strip('"').strip("'")}
            cfg["alvos"].append(alvo_atual)
        elif m := re.fullmatch(r"\s+(\w+):\s*(.+)", linha):
            if alvo_atual is None:
                raise Reprovacao(f"{caminho}:{n}: campo indentado sem alvo: {bruta!r}")
            alvo_atual[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        else:
            raise Reprovacao(f"{caminho}:{n}: linha fora do formato esperado: {bruta!r}")

    if not cfg.get("dominio"):
        raise Reprovacao(f"{caminho}: falta `dominio`")
    if not cfg["alvos"]:
        raise Reprovacao(f"{caminho}: nenhum alvo declarado. Verificacao sem alvo reprova")
    for alvo in cfg["alvos"]:
        for obrigatorio in ("url", "esperado_a_partir_de", "content_type"):
            if obrigatorio not in alvo:
                raise Reprovacao(f"{caminho}: alvo {alvo} sem `{obrigatorio}`")
    return cfg


# ---------------------------------------------------------------------------
# Coleta
# ---------------------------------------------------------------------------

def resolver(nome: str) -> list[str]:
    try:
        infos = socket.getaddrinfo(nome, 443, socket.AF_INET, socket.SOCK_STREAM)
    except OSError as e:
        raise Reprovacao(f"nao foi possivel resolver {nome}: {e}") from e
    ips = sorted({i[4][0] for i in infos})
    if not ips:
        raise Reprovacao(f"{nome} nao resolveu para nenhum endereco IPv4")
    return ips


def emissor_do_certificado(host: str) -> str:
    """Emissor do certificado apresentado. Proxy apresenta o dele, nao o nosso."""
    contexto = ssl.create_default_context()
    try:
        with socket.create_connection((host, 443), timeout=TEMPO_LIMITE) as cru:
            with contexto.wrap_socket(cru, server_hostname=host) as tls:
                cert = tls.getpeercert() or {}
    except Exception as e:
        raise Reprovacao(f"handshake TLS com {host} falhou: {e}") from e
    for campo in cert.get("issuer", ()):
        for chave, valor in campo:
            if chave == "organizationName":
                return valor
    return "desconhecido"


def buscar(url: str) -> tuple[int, dict, bytes]:
    """GET sem seguir redirecionamento. Qualquer 3xx e devolvido como tal."""
    partes = urllib.parse.urlsplit(url)
    if partes.scheme != "https":
        raise Reprovacao(f"{url}: only HTTPS. `.app` tem HSTS pre-carregado")
    caminho = partes.path or "/"
    conexao = http.client.HTTPSConnection(partes.hostname, 443, timeout=TEMPO_LIMITE)
    try:
        conexao.request("GET", caminho, headers={"User-Agent": "bichu-verificacao/1"})
        resposta = conexao.getresponse()
        corpo = resposta.read(64 * 1024)
        cabecalhos = {k.lower(): v for k, v in resposta.getheaders()}
        return resposta.status, cabecalhos, corpo
    except Reprovacao:
        raise
    except Exception as e:
        raise Reprovacao(f"GET {url} falhou: {e}") from e
    finally:
        conexao.close()


# ---------------------------------------------------------------------------
# Assercoes
# ---------------------------------------------------------------------------

def sem_intermediario(cabecalhos: dict) -> list[str]:
    achados = []
    for nome in CABECALHOS_DE_PROXY:
        if nome in cabecalhos:
            achados.append(f"cabecalho de intermediario `{nome}: {cabecalhos[nome]}`")
    servidor = cabecalhos.get("server", "").lower()
    for conhecido in SERVIDORES_DE_PROXY:
        if conhecido in servidor:
            achados.append(f"`server: {cabecalhos.get('server')}` nao e a nossa origem")
    return achados


def verificar_alvo(alvo: dict, hoje: _dt.date, ip_esperado: str) -> list[str]:
    url = alvo["url"]
    try:
        vence = _dt.date.fromisoformat(alvo["esperado_a_partir_de"])
    except ValueError as e:
        return [f"{url}: `esperado_a_partir_de` invalido: {e}"]

    ja_esperado = hoje >= vence
    falhas: list[str] = []
    status, cabecalhos, corpo = buscar(url)

    if not ja_esperado:
        # Ainda nao publicamos. O alvo pode nao existir; o que ele NAO pode e
        # responder 200 com outra coisa, porque isso significa que tem alguem
        # ocupando o endereco -- e uma verificacao ingenua daria verde.
        if status == 200:
            tipo = cabecalhos.get("content-type", "(ausente)")
            if not tipo.startswith("application/json"):
                falhas.append(
                    f"{url}: responde 200 com `{tipo}` antes de {vence}. "
                    "Ha outra coisa servindo este caminho; uma verificacao que "
                    "so olhasse o status estaria verde sem verificar nada"
                )
            falhas.extend(f"{url}: {a}" for a in sem_intermediario(cabecalhos))
        return falhas

    # A partir daqui o arquivo precisa existir e estar integro.
    if 300 <= status < 400:
        destino = cabecalhos.get("location", "(sem Location)")
        falhas.append(
            f"{url}: {status} redireciona para {destino}. Redirecionamento "
            "invalida a associacao nas duas plataformas"
        )
        return falhas
    if status != 200:
        falhas.append(f"{url}: esperado 200, veio {status}")
        return falhas

    tipo = cabecalhos.get("content-type", "(ausente)")
    if not tipo.startswith(alvo["content_type"]):
        falhas.append(f"{url}: `Content-Type: {tipo}`, esperado `{alvo['content_type']}`")

    falhas.extend(f"{url}: {a}" for a in sem_intermediario(cabecalhos))

    try:
        json.loads(corpo)
    except Exception as e:
        falhas.append(f"{url}: corpo nao e JSON valido: {e}")

    host = urllib.parse.urlsplit(url).hostname or ""
    if ip_esperado:
        ips = resolver(host)
        if ip_esperado not in ips:
            falhas.append(
                f"{host}: resolve para {', '.join(ips)}, esperado {ip_esperado}. "
                "Se aparecer anycast de CDN aqui, o proxy foi ligado por engano"
            )
    else:
        falhas.append(
            f"{host}: `ip_esperado` vazio na configuracao. A assercao mais direta "
            "contra proxy ligado por engano esta desligada, e isso reprova a "
            "partir de `esperado_a_partir_de`: preencher quando a VM existir"
        )
    return falhas


def verificar_bucket_privado(url: str) -> list[str]:
    status, _cab, _corpo = buscar(url)
    if status == 200:
        return [
            f"{url}: respondeu 200. A origem de midia esta servindo caminho do "
            "bucket privado. Isto nao e erro de configuracao, e vazamento"
        ]
    return []


# ---------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    padrao = Path(__file__).resolve().parent / "associacao.yml"
    caminho = Path(argv[1]) if len(argv) > 1 else padrao
    hoje = _dt.date.today()

    print(f"verificacao de associacao - {hoje.isoformat()} - {caminho}")
    try:
        cfg = carregar_config(caminho)
    except Reprovacao as e:
        print(f"REPROVA: {e}")
        return 1

    falhas: list[str] = []
    for alvo in cfg["alvos"]:
        try:
            resultado = verificar_alvo(alvo, hoje, cfg.get("ip_esperado", ""))
        except Reprovacao as e:
            resultado = [f"{alvo['url']}: nao foi possivel verificar: {e}"]
        estado = "ok" if not resultado else "REPROVA"
        print(f"  [{estado}] {alvo['url']}")
        falhas.extend(resultado)

    if url_privado := cfg.get("bucket_privado_url", ""):
        try:
            resultado = verificar_bucket_privado(url_privado)
        except Reprovacao as e:
            resultado = [f"{url_privado}: nao foi possivel verificar: {e}"]
        print(f"  [{'ok' if not resultado else 'REPROVA'}] bucket privado 404")
        falhas.extend(resultado)
    else:
        print("  [aviso] `bucket_privado_url` vazio: assercao negativa desligada")

    host = cfg["dominio"]
    try:
        print(f"  [info] {host} resolve para {', '.join(resolver(host))}")
        print(f"  [info] certificado emitido por {emissor_do_certificado(host)}")
    except Reprovacao as e:
        falhas.append(str(e))

    print()
    if falhas:
        print(f"REPROVADO com {len(falhas)} achado(s):")
        for f in falhas:
            print(f"  - {f}")
        return 1
    print("APROVADO")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
