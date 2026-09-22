#!/usr/bin/env python3
"""A borda responde, PELA PORTA PUBLICADA, o que o contrato promete.

`verificar_borda.py` le arquivo e compara texto. Este aqui bate na borda de
verdade, de fora do container, e e o unico que pega a familia de defeito que
nenhuma leitura de arquivo pega: a regra escrita e nao valendo. Foi o que houve
em 17/09 com `/.well-known/`: o Caddyfile tinha os dois blocos de associacao,
com o comentario explicando por que redirecionamento ali invalida o deep link, e
`/srv/well-known` NAO ESTAVA MONTADO. O `file_server` respondia 404 com
`Content-Type: application/json` -- um 404 que parece um arquivo.

Sonda batida de dentro do container nao pega isso: por dentro o servico servia
`/.well-known/jwks.json` com 200 o tempo todo.

Regra do arquivo: **quando nao consegue verificar, reprova**. Conexao recusada,
tempo esgotado, JSON ilegivel -- reprovacao com o motivo, nunca "esta tudo bem".

Uso:
    python3 verificar_borda_local.py [http://localhost:3000]
    (sem argumento, usa PUBLIC_BASE_URL do ambiente)

Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import datetime as _dt
import http.client
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

TEMPO_LIMITE = 15


class Reprovacao(Exception):
    """Falha de assercao ou impossibilidade de verificar. Os dois reprovam."""


def buscar(base: str, caminho: str) -> tuple[int, dict, bytes]:
    """GET sem seguir redirecionamento. Qualquer 3xx e devolvido como tal.

    Nao seguir e o ponto: o Android e a Apple tambem nao seguem. Um cliente que
    seguisse redirecionamento veria 200 e diria que esta tudo bem, enquanto o
    aparelho do usuario recusaria a associacao.
    """
    partes = urllib.parse.urlsplit(base)
    Conexao = http.client.HTTPSConnection if partes.scheme == "https" else http.client.HTTPConnection
    porta = partes.port or (443 if partes.scheme == "https" else 80)
    conexao = Conexao(partes.hostname, porta, timeout=TEMPO_LIMITE)
    try:
        conexao.request("GET", caminho, headers={"User-Agent": "bichu-verificacao-borda/1"})
        resposta = conexao.getresponse()
        corpo = resposta.read(256 * 1024)
        return resposta.status, {k.lower(): v for k, v in resposta.getheaders()}, corpo
    except Exception as e:
        raise Reprovacao(f"GET {base}{caminho} falhou: {e}") from e
    finally:
        conexao.close()


# ---------------------------------------------------------------------------
# O que a borda precisa responder
# ---------------------------------------------------------------------------

# Os quatro caminhos que o padrao fixa na RAIZ do host, fora de `/v1`. Sao
# exatamente os que o `handle /v1/*` nao alcanca, e por isso os que somem sem
# ninguem perceber.
ARQUIVOS_DE_PLATAFORMA = [
    "/.well-known/assetlinks.json",
    "/.well-known/apple-app-site-association",
    "/.well-known/jwks.json",
    "/.well-known/openid-configuration",
]

# ADR-0018: a Swagger UI e fechada por credencial NA BORDA. Aqui, no ambiente
# local, ela precisa responder 401 sem credencial. O 404 de producao e a outra
# metade, e essa so a verificacao externa e agendada consegue afirmar.
CAMINHOS_DA_DOCUMENTACAO = ["/v1/docs", "/v1/openapi.yaml"]

# ADR-0017: o que nao e `/v1` nem `/.well-known` NAO chega ao back-end. O
# catch-all que existia entregava qualquer caminho ao servico, e uma rota
# removida do contrato continuava respondendo enquanto o codigo dela existisse.
CAMINHO_QUE_NAO_EXISTE = "/t/ABC123"

# O webhook de entrega do provedor de e-mail (BICHUS-13, criterios 7 e 9).
#
# POR QUE ELE MERECE UMA SONDA PROPRIA, e por que ela e POST e espera 401:
#
# Este caminho teve o defeito em DUAS metades ao mesmo tempo -- nao havia
# handler em `src/` e nao havia rota na borda --, e cada metade sozinha produz
# o mesmo sintoma visto de fora: 404. Uma sonda GET nao distingue as duas, e
# nem distingue nenhuma delas de "esta tudo certo", porque a aplicacao tambem
# responde 404 para GET num caminho que so aceita POST.
#
# O 401 e o unico status que prova as duas metades de uma vez: para responder
# "assinatura ausente ou invalida" a requisicao precisou ATRAVESSAR a borda E
# chegar num handler que confere segredo. 404 aqui significa que alguma das
# duas metades esta faltando, e o relatorio diz qual procurar primeiro.
#
# 204 seria o pior de todos: a aplicacao ACEITOU um evento de entrega sem
# assinatura nenhuma. Nesse estado qualquer um na internet forja uma devolucao
# definitiva e desliga o e-mail de um tutor.
CAMINHO_DO_WEBHOOK = "/webhooks/postmark"


def postar(base: str, caminho: str, corpo: bytes) -> tuple[int, dict, bytes]:
    """POST sem seguir redirecionamento, para sondar rota de ENTRADA.

    Deliberadamente SEM cabecalho de assinatura: o que se quer provar e que a
    requisicao chega a um handler que exige credencial, e nao que ela e aceita.
    Mandar uma assinatura valida aqui exigiria o segredo de producao dentro de
    um script de verificacao, que e o contrario do que se quer.
    """
    partes = urllib.parse.urlsplit(base)
    Conexao = http.client.HTTPSConnection if partes.scheme == "https" else http.client.HTTPConnection
    porta = partes.port or (443 if partes.scheme == "https" else 80)
    conexao = Conexao(partes.hostname, porta, timeout=TEMPO_LIMITE)
    try:
        conexao.request("POST", caminho, body=corpo, headers={
            "User-Agent": "bichu-verificacao-borda/1",
            "Content-Type": "application/json",
            "Content-Length": str(len(corpo)),
        })
        resposta = conexao.getresponse()
        return resposta.status, {k.lower(): v for k, v in resposta.getheaders()}, resposta.read(64 * 1024)
    except Exception as e:
        raise Reprovacao(f"POST {base}{caminho} falhou: {e}") from e
    finally:
        conexao.close()


def verificar_webhook_de_entrega(base: str) -> list[str]:
    """O webhook do provedor de e-mail atravessa a borda e exige assinatura."""
    corpo = b'{"RecordType":"Bounce","MessageID":"sonda-da-verificacao"}'
    status, _cabecalhos, _corpo = postar(base, CAMINHO_DO_WEBHOOK, corpo)

    if status == 401:
        return []

    if status == 404:
        return [
            f"{CAMINHO_DO_WEBHOOK}: 404. O caminho NAO chega a aplicacao, e o provedor de e-mail "
            "trata 404 como falha de entrega e REENVIA -- o sintoma nao e um caminho mudo, e um "
            "laco de reentrega contra a borda enquanto a lista de supressao nunca chega ate nos. "
            "Duas causas possiveis, nesta ordem: (1) falta `handle /webhooks/postmark` em "
            "infra/caddy/Caddyfile, e ai `verificar_borda.py` tambem reprova; (2) a borda roteia e "
            "a rota nao esta registrada na aplicacao -- confira se `registrarRotaDoWebhookDeEntrega` "
            "e chamada na composicao de src/bin/api.ts"
        ]

    if status in (200, 202, 204):
        return [
            f"{CAMINHO_DO_WEBHOOK}: {status} SEM assinatura nenhuma. A aplicacao aceitou um evento "
            "de entrega de um chamador anonimo: neste estado qualquer um na internet forja uma "
            "devolucao definitiva para o e-mail de um tutor e desliga o aviso de pet encontrado "
            "dele, sem que nada acuse. O contrato exige 401 (esquema `webhookSignature`)"
        ]

    return [
        f"{CAMINHO_DO_WEBHOOK}: esperado 401 sem assinatura, veio {status}. O contrato declara "
        "401 para assinatura ausente ou invalida, e o provedor decide reenviar pelo status"
    ]


def verificar_arquivo_de_plataforma(base: str, caminho: str) -> list[str]:
    falhas: list[str] = []
    status, cabecalhos, corpo = buscar(base, caminho)

    if 300 <= status < 400:
        destino = cabecalhos.get("location", "(sem Location)")
        return [
            f"{caminho}: {status} redireciona para {destino}. O Android e a Apple exigem 200 "
            "direto: redirecionamento invalida a associacao nas duas plataformas SEM produzir "
            "erro em lugar nenhum"
        ]
    if status != 200:
        return [
            f"{caminho}: esperado 200, veio {status}. Quem consulta este caminho e o sistema "
            "operacional ou uma biblioteca de validacao de token, e nenhum dos dois reporta o "
            "erro a ninguem: o sintoma aparece como 'o deep link nao abre o app'"
        ]

    tipo = cabecalhos.get("content-type", "(ausente)")
    if not tipo.startswith("application/json"):
        falhas.append(f"{caminho}: `Content-Type: {tipo}`, esperado `application/json`")

    try:
        documento = json.loads(corpo)
    except Exception as e:
        return falhas + [f"{caminho}: corpo nao e JSON valido: {e}"]

    if caminho.endswith("jwks.json"):
        chaves = documento.get("keys") if isinstance(documento, dict) else None
        if not chaves:
            falhas.append(
                f"{caminho}: 200 com `keys` vazio. Um JWKS sem chave nao valida token nenhum, e "
                "ele responde 200 do mesmo jeito: a conferencia de status sozinha aprovaria isto"
            )
    if caminho.endswith("openid-configuration"):
        if not isinstance(documento, dict) or "jwks_uri" not in documento:
            falhas.append(f"{caminho}: 200 sem `jwks_uri`. A descoberta nao leva a lugar nenhum")

    return falhas


def dispensa_vencida(raiz: Path, portao: str, hoje: _dt.date) -> bool:
    """A dispensa datada de `.github/quality-gates.yml` ja venceu?

    O prazo do insumo que falta ja tem dono e data ali. Repetir a data aqui
    criaria um segundo prazo, e dois prazos para o mesmo insumo terminam
    divergindo -- com o mais frouxo vencendo, porque e o que nao reclama.
    """
    caminho = raiz / ".github" / "quality-gates.yml"
    if not caminho.is_file():
        raise Reprovacao(f"{caminho} nao encontrado: nao da para saber o que esta dispensado")
    atual: dict[str, str] = {}
    for bruta in caminho.read_text(encoding="utf-8").splitlines():
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip() or linha.strip() == "dispensas:":
            continue
        if m := re.fullmatch(r"\s*-\s*(\w+):\s*(.+)", linha):
            if atual.get("portao") == portao:
                break
            atual = {m.group(1): m.group(2).strip().strip('"')}
        elif m := re.fullmatch(r"\s+(\w+):\s*(.+)", linha):
            atual[m.group(1)] = m.group(2).strip().strip('"')
        if atual.get("portao") == portao and "vence_em" in atual:
            return _dt.date.fromisoformat(atual["vence_em"]) < hoje
    raise Reprovacao(
        f"nao achei a dispensa `{portao}` em .github/quality-gates.yml. Ou ela saiu porque o "
        "insumo chegou -- e ai o valor precisa estar preenchido -- ou alguem a apagou sem isso"
    )


def verificar_conteudo_pendente(base: str, raiz: Path, hoje: _dt.date) -> tuple[list[str], list[str]]:
    """As duas listas que dependem de insumo do cliente.

    Lista vazia e recusa honesta: o sistema operacional nao encontra
    correspondencia e nao abre o app, que e o que de fato acontece. Preencher com
    um valor de exemplo seria pior que o 404: 200 com JSON valido deixa qualquer
    conferencia superficial verde, e a falha so aparece no aparelho do usuario,
    depois de a plaquinha impressa.

    Enquanto a dispensa correspondente esta valendo, isto e AVISO. Vencida a
    dispensa, vira reprovacao.
    """
    avisos: list[str] = []
    falhas: list[str] = []

    casos = [
        ("/.well-known/assetlinks.json", "apk-assinado",
         lambda d: d[0]["target"]["sha256_cert_fingerprints"] if d else [],
         "a impressao digital da chave de assinatura do APK"),
        ("/.well-known/apple-app-site-association", "ios",
         lambda d: d["applinks"]["details"],
         "o `appID` da Apple, que depende do Team ID"),
    ]
    for caminho, portao, extrair, insumo in casos:
        try:
            _status, _cab, corpo = buscar(base, caminho)
            valores = extrair(json.loads(corpo))
        except Exception as e:
            falhas.append(f"{caminho}: nao foi possivel ler o conteudo para conferir: {e}")
            continue
        if valores:
            continue
        mensagem = (
            f"{caminho}: servido com 200 e JSON valido, e a lista esta VAZIA. Falta {insumo}. "
            "O deep link NAO abre o app neste estado"
        )
        if dispensa_vencida(raiz, portao, hoje):
            falhas.append(
                mensagem + f". A dispensa `{portao}` ja venceu: ou o insumo chegou e o valor "
                "entra no arquivo, ou nao chegou e isso precisa ser dito em voz alta"
            )
        else:
            avisos.append(mensagem + f" (dispensa `{portao}` ainda valendo)")
    return avisos, falhas


def main(argv: list[str]) -> int:
    base = (argv[1] if len(argv) > 1 else os.environ.get("PUBLIC_BASE_URL") or "http://localhost:3000").rstrip("/")
    raiz = Path(argv[2] if len(argv) > 2 else ".").resolve()
    hoje = _dt.date.today()

    print(f"borda local - {base} - {hoje.isoformat()}")
    falhas: list[str] = []
    avisos: list[str] = []

    for caminho in ARQUIVOS_DE_PLATAFORMA:
        try:
            resultado = verificar_arquivo_de_plataforma(base, caminho)
        except Reprovacao as e:
            resultado = [f"{caminho}: nao foi possivel verificar: {e}"]
        print(f"  [{'ok' if not resultado else 'REPROVA'}] {caminho}")
        falhas.extend(resultado)

    try:
        status, _cab, _corpo = buscar(base, "/v1/health")
        resultado = [] if status == 200 else [f"/v1/health: esperado 200, veio {status}"]
    except Reprovacao as e:
        resultado = [f"/v1/health: nao foi possivel verificar: {e}"]
    print(f"  [{'ok' if not resultado else 'REPROVA'}] /v1/health")
    falhas.extend(resultado)

    for caminho in CAMINHOS_DA_DOCUMENTACAO:
        try:
            status, _cab, _corpo = buscar(base, caminho)
            if status == 200:
                resultado = [
                    f"{caminho}: respondeu 200 SEM credencial. A Swagger UI publica o mapa da "
                    "superficie inteira do produto, inclusive reautenticacao, transferencia de "
                    "pet e revogacao de tag (ADR-0018)"
                ]
            elif status == 401:
                resultado = []
            else:
                resultado = [f"{caminho}: esperado 401 sem credencial, veio {status}"]
        except Reprovacao as e:
            resultado = [f"{caminho}: nao foi possivel verificar: {e}"]
        print(f"  [{'ok' if not resultado else 'REPROVA'}] {caminho} fechado por credencial")
        falhas.extend(resultado)

    try:
        resultado = verificar_webhook_de_entrega(base)
    except Reprovacao as e:
        resultado = [f"{CAMINHO_DO_WEBHOOK}: nao foi possivel verificar: {e}"]
    print(f"  [{'ok' if not resultado else 'REPROVA'}] {CAMINHO_DO_WEBHOOK} chega a aplicacao e exige assinatura")
    falhas.extend(resultado)

    try:
        status, _cab, _corpo = buscar(base, CAMINHO_QUE_NAO_EXISTE)
        resultado = [] if status == 404 else [
            f"{CAMINHO_QUE_NAO_EXISTE}: esperado 404, veio {status}. O que nao e `/v1` nem "
            "`/.well-known` nao pode chegar ao back-end (ADR-0017): com o catch-all aberto, "
            "rota removida do contrato continua respondendo enquanto o codigo dela existir"
        ]
    except Reprovacao as e:
        resultado = [f"{CAMINHO_QUE_NAO_EXISTE}: nao foi possivel verificar: {e}"]
    print(f"  [{'ok' if not resultado else 'REPROVA'}] borda fechada fora de `/v1`")
    falhas.extend(resultado)

    try:
        novos_avisos, novas_falhas = verificar_conteudo_pendente(base, raiz, hoje)
        avisos.extend(novos_avisos)
        falhas.extend(novas_falhas)
    except Reprovacao as e:
        falhas.append(str(e))

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
