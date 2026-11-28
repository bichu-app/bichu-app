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
    python3 verificar_borda_local.py [http://localhost:3000] [raiz]
    (sem argumento, usa PUBLIC_BASE_URL do ambiente)
    python3 verificar_borda_local.py --autoteste   # so as iscas, sem pilha

As ISCAS RODAM SEMPRE, antes de julgar qualquer coisa, e e por isso que elas
existem num portao que precisa da borda de pe: um filtro que deixou de enxergar
aprova tudo em silencio, e foi o que aconteceu aqui entre 28/10 e 23/11/2026.
Ver o comentario de `ARQUIVO_DE_DECLARACAO`, mais abaixo.

Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import http.client
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path
from typing import Callable, NamedTuple

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

# O INVARIANTE (ADR-0017, atualizado pelo ADR-0028): fora de `/v1`, de
# `/.well-known` e das rotas legitimas do site, a borda NAO alcanca o back-end.
#
# Ate o ADR-0028 o probe era `/t/ABC123` esperando 404 da borda. O ADR-0028
# tornou `/t/*` uma ROTA DO SITE (servida por `web`, nao mais fechada), entao
# esse caminho deixou de provar o invariante -- ele agora e legitimo. Sao dois
# probes no lugar de um:
#
#  - CAMINHO_FORA_DE_TUDO: nao e `/v1`, nem `/.well-known`, nem rota do site.
#    Na pilha de dev (BORDA_RESTO_DA_APP=site) ele cai no catch-all, que e o
#    SITE -- e a prova de "nao vazou para o back-end" e a resposta vir DO SITE:
#    404 em `text/html` (a pagina 404 do site). Uma resposta do back-end
#    (problem+json, json, ou o `text/plain` do `respond` da borda) reprova aqui,
#    que e exatamente o vazamento de catch-all que este probe existe para pegar.
#    Nos hosts hospedados de API (BORDA_RESTO_DA_APP=fechado) esse mesmo
#    catch-all responde 404 da propria borda, e isso e coberto por
#    `verificar-hosts-do-site.mjs`; aqui a pilha serve o site.
#  - CAMINHO_DE_SITE: `/t/{code}`, rota legitima do site (ADR-0028), que TEM de
#    ser servida pelo site (text/html), e nao pelo back-end.
CAMINHO_FORA_DE_TUDO = "/nao-e-rota-de-ninguem-borda-nao-vaza-backend"
CAMINHO_DE_SITE = "/t/CODIGO-INEXISTENTE-DE-TESTE"

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


# ---------------------------------------------------------------------------
# QUAL DIGITAL CADA DESTINO ACEITA. Ver
# `infra/verificacao/digitais-de-associacao-por-destino.txt`, que explica o
# desenho inteiro e por que ele e copia deliberada de
# `infra/cd/chaves-de-site-por-destino.txt` (04/11/2026).
#
# O DEFEITO QUE ISTO CONSERTA, medido em 23/11/2026. Ate aqui o julgamento das
# duas listas era `if valores: continue` -- ele reclamava SO de lista vazia. E
# `infra/caddy/well-known/assetlinks.json` nao esta vazio desde 28/10: carrega a
# digital da chave de DEBUG da maquina de quem compila, que casa so com APK
# compilado naquela maquina. Medido com `apple-app-site-association` como
# controle positivo, o caso `assetlinks.json` NAO PRODUZIA ACHADO EM DATA
# NENHUMA -- a dispensa `apk-assinado` nunca era consultada, porque o `continue`
# vinha antes. Portao verde com a chave errada, e um link desses nao abre o app
# de ninguem em producao.
#
# SAO TRES ESTADOS NO LUGAR DE DOIS (decisao do cliente em 23/11/2026, verbatim:
# "Sim, e passa a exigir a digital certa"):
#   - lista VAZIA                -> `LISTA_VAZIA` (o que ele ja fazia)
#   - lista com digital DECLARADA para o destino -> passa
#   - lista com digital que nao casa com nenhuma -> `DIGITAL_NAO_DECLARADA`,
#     tratada como a vazia
#
# Assim nao e preciso conhecer a chave de debug -- que e da maquina de quem
# compila e nao pode ser declarada em arquivo rastreado. Basta que ela NAO seja
# uma digital declarada.
#
# A CONSEQUENCIA E PROGRAMADA, E ESTA ESCRITA PARA NAO VIRAR SURPRESA: a partir
# daqui a dispensa `apk-assinado` passa a ser CONSULTADA de verdade no caso do
# `assetlinks.json`. Enquanto ela valer sai `[aviso]`; no dia seguinte ao
# `vence_em` dela o portao REPROVA, e com ele `make verificar`,
# `make fechar-integracao` e o job da esteira. Isso e o comportamento desejado,
# escolhido pelo cliente em 23/11/2026: "quando a dispensa vencer, ele reprova
# alto em vez de calar".
#
# A DATA NAO ESTA REPETIDA AQUI, e isso e a mesma regra do `dispensa_vencida()`
# logo acima: dois prazos para o mesmo insumo terminam divergindo, com o mais
# frouxo vencendo. A data que vale e a de `.github/quality-gates.yml`, e so ela.
# Medido nesta branch em 23/11/2026: `apk-assinado` e `ios` estao com
# `vence_em: 2026-11-30`, logo o vermelho comeca em 01/12/2026. O cliente disse
# em 23/11/2026 que a dispensa vai para 31/12/2026 -- quando essa redatacao
# entrar em `quality-gates.yml` (PR #183, que e dono daquele arquivo), o vermelho
# passa sozinho para 01/01/2027, sem tocar nesta linha. Quem vier conferir o
# vermelho: leia o `vence_em`, nao este comentario.
ARQUIVO_DE_DECLARACAO = Path("infra") / "verificacao" / "digitais-de-associacao-por-destino.txt"

# Declaracao que diz "nenhuma digital e aceitavel aqui ainda". E a mais ESTRITA
# que cabe, nao uma espera: qualquer valor servido cai em
# `DIGITAL_NAO_DECLARADA`. Nao e `AINDA-NAO-EXISTE` que afrouxa nada -- o que
# afrouxaria era a linha SUMIR, e linha que falta reprova duro
# (`EXIGENCIA_NAO_DECLARADA`).
TOKEN_INEXISTENTE = "AINDA-NAO-EXISTE"

FORMA_DA_IMPRESSAO = re.compile(r"[0-9a-f]{12}")


def impressao(valor: str) -> str:
    """Os 12 primeiros digitos hex do sha256 do valor JA NORMALIZADO.

    SO A IMPRESSAO, NUNCA O VALOR, e aqui o motivo e um a mais que no arquivo do
    reCAPTCHA: a digital SHA-256 do certificado e publica por desenho (vai
    servida no proprio `assetlinks.json`). O que se evita e o atalho -- se a
    declaracao trouxesse a digital literal, o jeito mais curto de calar o portao
    seria copiar a linha de la para dentro do JSON, e o arquivo ficaria com a
    cara de configurado que `infra/caddy/well-known/LEIA-ME.md` manda evitar,
    agora com portao verde por cima.
    """
    return hashlib.sha256(valor.encode("utf-8")).hexdigest()[:12]


def normalizar_digital(valor: str) -> str:
    """Digital de certificado: MAIUSCULA, sem os dois-pontos e sem espaco."""
    return re.sub(r"[\s:]", "", valor).upper()


def normalizar_appid(valor: str) -> str:
    """`appID` da Apple: so as pontas. O Team ID e MAIUSCULO e o bundle e
    minusculo, entao dobrar caixa aqui inventaria casamento que o iOS nao faz."""
    return valor.strip()


def appids_dos_detalhes(detalhes: list) -> list[str]:
    """Os `appID` de `applinks.details`, nas duas formas que o padrao aceita."""
    saida: list[str] = []
    for item in detalhes:
        if not isinstance(item, dict):
            raise ValueError(f"entrada de `applinks.details` nao e objeto: {item!r}")
        if isinstance(item.get("appIDs"), list):
            saida.extend(str(x) for x in item["appIDs"])
        elif "appID" in item:
            saida.append(str(item["appID"]))
        else:
            raise ValueError(
                f"entrada de `applinks.details` sem `appID` nem `appIDs`: campos {sorted(item)}"
            )
    return saida


def interpretar_declaracoes(
    texto: str, origem: str = "<declaracao>"
) -> tuple[dict[str, str], dict[tuple[str, str], list[str]]]:
    """A FUNCAO PURA DA LEITURA. Devolve (hostname -> destino, (destino,
    exigencia) -> impressoes aceitaveis). Reprova com MOTIVO NOMEADO.

    E ela, e nao uma copia simplificada, que as iscas exercitam: isca que bate
    numa copia prova a copia.

    Linha de declaracao e linha cujo PRIMEIRO campo e `HOST` ou `DIGITAL`. O
    resto do arquivo e prosa de proposito -- sem o marcador, qualquer paragrafo
    de quatro palavras seria lido como declaracao.
    """
    hosts: dict[str, str] = {}
    exigencias: dict[tuple[str, str], list[str]] = {}
    for bruta in texto.splitlines():
        campos = bruta.split()
        if not campos:
            continue
        if campos[0] == "HOST":
            if len(campos) != 3:
                raise Reprovacao(
                    f"DECLARACAO_MAL_FORMADA: em {origem}, linha `HOST` com {len(campos) - 1} "
                    f"campo(s): {bruta.strip()!r}. A forma e `HOST <hostname> <destino>`"
                )
            _, host, destino = campos
            if host in hosts:
                raise Reprovacao(
                    f"DECLARACAO_AMBIGUA: {origem} declara o host {host!r} duas vezes "
                    f"({hosts[host]!r} e {destino!r}). Declaracao ambigua nao e declaracao: "
                    "deixe uma linha"
                )
            hosts[host] = destino
        elif campos[0] == "DIGITAL":
            if len(campos) < 5:
                raise Reprovacao(
                    f"DECLARACAO_MAL_FORMADA: em {origem}, linha `DIGITAL` com "
                    f"{len(campos) - 1} campo(s): {bruta.strip()!r}. A forma e `DIGITAL "
                    "<destino> <exigencia> <impressao|" + TOKEN_INEXISTENTE + "> <de-onde-sai>`, "
                    "e o ultimo campo e obrigatorio: declaracao sem procedencia nao se confere"
                )
            _, destino, exigencia, bruto = campos[:4]
            par = (destino, exigencia)
            if par in exigencias:
                raise Reprovacao(
                    f"DECLARACAO_AMBIGUA: {origem} declara {exigencia!r} para {destino!r} duas "
                    "vezes. Declaracao ambigua nao e declaracao: deixe uma linha (varias "
                    "impressoes aceitaveis vao numa linha so, separadas por virgula)"
                )
            if bruto == TOKEN_INEXISTENTE:
                exigencias[par] = []
                continue
            partes = [p for p in bruto.split(",") if p]
            if not partes or any(not FORMA_DA_IMPRESSAO.fullmatch(p) for p in partes):
                raise Reprovacao(
                    f"DECLARACAO_MAL_FORMADA: a impressao declarada para {exigencia!r} em "
                    f"{destino!r} e {bruto!r}, e a forma e 12 digitos hexadecimais minusculos "
                    f"(os 12 primeiros do sha256), varias separadas por virgula, ou o literal "
                    f"`{TOKEN_INEXISTENTE}`. Impressao que nao tem forma de impressao nao "
                    "compara com nada"
                )
            exigencias[par] = partes

    # CONTROLE POSITIVO DA LEITURA. Arquivo legivel e sem nenhuma declaracao
    # daria zero casamentos para QUALQUER destino, e zero casamentos sem
    # controle vira "nao declarado" quando a verdade e "nao li nada".
    if not hosts or not exigencias:
        raise Reprovacao(
            f"TABELA_SEM_DECLARACAO: {origem} tem {len(hosts)} linha(s) `HOST` e "
            f"{len(exigencias)} linha(s) `DIGITAL`, e precisa de pelo menos uma de cada. "
            "Declaracao vazia reprovaria tudo por um motivo que nao e o do destino, e aprovar "
            "seria pior"
        )
    return hosts, exigencias


def ler_declaracoes(raiz: Path) -> tuple[dict[str, str], dict[tuple[str, str], list[str]]]:
    caminho = raiz / ARQUIVO_DE_DECLARACAO
    try:
        texto = caminho.read_text(encoding="utf-8")
    except OSError as e:
        raise Reprovacao(
            f"TABELA_ILEGIVEL: nao consegui ler a declaracao em {caminho}: {e}. Nao conseguir "
            "perguntar nao e resposta -- sem ela nao ha ancora para comparar, e comparar o "
            "arquivo com ele mesmo era o defeito que esta declaracao existe para fechar"
        ) from e
    return interpretar_declaracoes(texto, str(caminho))


def destino_do_endereco(base: str, hosts: dict[str, str]) -> str:
    """ENDERECO -> DESTINO, pelo HOSTNAME e so por ele.

    O portao recebe `<url> <raiz>` e nunca nome de ambiente: as tres chamadas
    que existem passam `http://localhost:$(PORTA)` (Makefile:540),
    `http://localhost:3000` (ci.yml:1195) e uma URL dinamica
    (dois-destinos.yml:104, padrao `https://hml.bichu.app`). Porta e esquema
    ficam de fora porque a mesma pilha local atende em portas diferentes.

    ENDERECO DESCONHECIDO REPROVA, e e o ponto: o portao nao sabe qual destino
    aquele endereco e, e chutar seria julgar pela regra do destino errado.
    """
    host = (urllib.parse.urlsplit(base).hostname or "").lower()
    if not host:
        raise Reprovacao(
            f"DESTINO_NAO_DECLARADO: nao consegui extrair hostname de {base!r}, entao nao ha "
            "destino e nao ha o que comparar"
        )
    if host not in hosts:
        raise Reprovacao(
            f"DESTINO_NAO_DECLARADO: o hostname {host!r} nao tem linha `HOST` em "
            f"{ARQUIVO_DE_DECLARACAO}. Declarados: {', '.join(sorted(hosts))}. Endereco sem "
            "destino nao se julga: declare-o la, com o destino, em uma linha -- nao e para "
            "este portao adivinhar a partir do nome"
        )
    return hosts[host]


class Caso(NamedTuple):
    caminho: str
    portao: str
    exigencia: str
    insumo: str
    extrair: Callable[[object], list]
    comparaveis: Callable[[list], list[str]]
    normalizar: Callable[[str], str]


CASOS = [
    Caso(
        caminho="/.well-known/assetlinks.json",
        portao="apk-assinado",
        exigencia="digital-do-apk",
        insumo="a impressao digital da chave de assinatura do APK",
        # Por INDICE, e nao por varredura: `infra/caddy/well-known/LEIA-ME.md`
        # explica que a digital fica num objeto so com DUAS relacoes
        # (`handle_all_urls` e `get_login_creds`) justamente porque esta leitura
        # e por indice -- dois objetos fariam este portao conferir um e ignorar
        # o outro.
        extrair=lambda d: d[0]["target"]["sha256_cert_fingerprints"] if d else [],
        comparaveis=lambda v: [str(x) for x in v],
        normalizar=normalizar_digital,
    ),
    Caso(
        caminho="/.well-known/apple-app-site-association",
        portao="ios",
        exigencia="appid-da-apple",
        insumo="o `appID` da Apple, que depende do Team ID",
        extrair=lambda d: d["applinks"]["details"],
        comparaveis=appids_dos_detalhes,
        normalizar=normalizar_appid,
    ),
]


def julgar_valores(
    caso: Caso,
    destino: str,
    valores: list[str],
    exigencias: dict[tuple[str, str], list[str]],
) -> tuple[str, str]:
    """A FUNCAO PURA DO JULGAMENTO. Devolve (estado, detalhe).

    `estado` e `ok`, `LISTA_VAZIA` ou `DIGITAL_NAO_DECLARADA` -- os dois ultimos
    sao os que a dispensa governa. Reprova duro, com motivo nomeado, quando o
    problema e da NOSSA declaracao e nao do insumo do cliente: a dispensa cobre
    chave que falta ao cliente, nao linha que falta a nos.
    """
    par = (destino, caso.exigencia)
    if par not in exigencias:
        pares = ", ".join(f"{d}/{e}" for d, e in sorted(exigencias))
        raise Reprovacao(
            f"EXIGENCIA_NAO_DECLARADA: o destino {destino!r} existe em {ARQUIVO_DE_DECLARACAO} e "
            f"nao declara {caso.exigencia!r}. {caso.caminho} EXIGE essa digital, e exigencia sem "
            f"linha para o destino reprova. Declarados: {pares}"
        )
    declaradas = exigencias[par]
    if not valores:
        return "LISTA_VAZIA", ""
    medidas = [(v, impressao(caso.normalizar(v))) for v in valores]
    if any(m in declaradas for _, m in medidas):
        return "ok", ""
    esperado = ", ".join(declaradas) if declaradas else f"`{TOKEN_INEXISTENTE}` (nenhuma)"
    return "DIGITAL_NAO_DECLARADA", (
        f"a lista tem {len(valores)} valor(es), de impressao "
        f"{', '.join(m for _, m in medidas)}, e o destino {destino!r} declara {esperado}"
    )


def desfecho(estado: str, vencida: bool) -> str:
    """ESTADO + DISPENSA -> `aviso` ou `falha`. Pura, para a isca poder provar
    que o vermelho de depois do prazo e programado e nao acidente."""
    if estado == "ok":
        return "nada"
    return "falha" if vencida else "aviso"


def verificar_conteudo_pendente(base: str, raiz: Path, hoje: _dt.date) -> tuple[list[str], list[str]]:
    """As duas listas que dependem de insumo do cliente.

    Lista vazia e recusa honesta: o sistema operacional nao encontra
    correspondencia e nao abre o app, que e o que de fato acontece. Preencher com
    um valor de exemplo seria pior que o 404: 200 com JSON valido deixa qualquer
    conferencia superficial verde, e a falha so aparece no aparelho do usuario,
    depois de a plaquinha impressa.

    E lista NAO VAZIA com o valor errado e o mesmo mal pela outra porta, que e o
    que esta funcao passou a enxergar em 23/11/2026: a digital tem de CASAR com a
    declarada para o destino, e nao apenas existir.

    Enquanto a dispensa correspondente esta valendo, os dois estados sao AVISO.
    Vencida a dispensa, viram reprovacao.
    """
    avisos: list[str] = []
    falhas: list[str] = []

    # A DECLARACAO E O DESTINO VEM PRIMEIRO, e os dois reprovam duro: sem ancora
    # nao ha julgamento, e julgar sem ancora era o defeito.
    hosts, exigencias = ler_declaracoes(raiz)
    destino = destino_do_endereco(base, hosts)
    print(f"  destino de {base}: {destino} (por {ARQUIVO_DE_DECLARACAO})")

    for caso in CASOS:
        try:
            _status, _cab, corpo = buscar(base, caso.caminho)
            valores = caso.comparaveis(caso.extrair(json.loads(corpo)))
        except Exception as e:
            falhas.append(f"{caso.caminho}: nao foi possivel ler o conteudo para conferir: {e}")
            continue
        try:
            estado, detalhe = julgar_valores(caso, destino, valores, exigencias)
        except Reprovacao as e:
            falhas.append(f"{caso.caminho}: {e}")
            continue
        if estado == "ok":
            continue
        if estado == "LISTA_VAZIA":
            mensagem = (
                f"{caso.caminho}: servido com 200 e JSON valido, e a lista esta VAZIA. "
                f"Falta {caso.insumo}. O deep link NAO abre o app neste estado"
            )
        else:
            mensagem = (
                f"{caso.caminho}: servido com 200 e JSON valido, e a lista NAO esta vazia -- e "
                f"nenhum valor dela e declarado para este destino ({detalhe}). Falta "
                f"{caso.insumo}. O arquivo PARECE configurado e o deep link NAO abre o app de "
                "quem nao tem exatamente esta chave: foi para este desfecho que "
                "`infra/caddy/well-known/LEIA-ME.md` avisou que valor de espera e pior que "
                "arquivo vazio"
            )
        if desfecho(estado, dispensa_vencida(raiz, caso.portao, hoje)) == "falha":
            falhas.append(
                mensagem + f". A dispensa `{caso.portao}` ja venceu: ou o insumo chegou e o "
                "valor entra no arquivo (e a impressao dele, em "
                f"{ARQUIVO_DE_DECLARACAO}), ou nao chegou e isso precisa ser dito em voz alta"
            )
        else:
            avisos.append(mensagem + f" (dispensa `{caso.portao}` ainda valendo)")
    return avisos, falhas


# ---------------------------------------------------------------------------
# AS ISCAS, NOS DOIS SENTIDOS, E RODAM ANTES DE JULGAR.
#
# O motivo esta escrito em meio portao deste repositorio e acabou de se provar
# aqui: um filtro que deixou de enxergar aprova tudo em silencio. O `if valores:
# continue` que estas iscas substituem viveu de 28/10 a 23/11/2026 aprovando o
# `assetlinks.json` com a chave errada, e nenhuma suite ficou vermelha.
#
# SETE DELAS PRECISAM PASSAR, e isso nao e zelo: portao que so reprova e portao
# que alguem desliga na primeira semana, e desligamento nao volta atras. O par
# que mais importa e o de numeros 4 e 9 -- a MESMA digital, declarada para
# `local` e nao para `hml`: aprova no destino dela e reprova no outro, e a unica
# diferenca entre as duas e o destino. Sem esse par, consertar o portao e
# afrouxa-lo seriam indistinguiveis.
#
# Os valores sao INVENTADOS e as impressoes deles saem calculadas na hora: nao
# ha chave de verdade no autoteste, ele nao le rede, nao sobe container e nao
# depende da declaracao de producao. A unica excecao e a isca 20, que e o
# controle positivo da declaracao REAL deste repositorio -- ela prova que o
# arquivo rastreado ainda e legivel e ainda cobre os enderecos das tres
# chamadas, que e a parte que uma edicao de prosa pode quebrar sem ninguem ver.
# ---------------------------------------------------------------------------

def _digital(bytes_em_hex: str) -> str:
    """Formata 32 bytes em hex como digital de certificado (`AA:BB:...`)."""
    return ":".join(bytes_em_hex[i:i + 2] for i in range(0, 64, 2)).upper()


_RELEASE_FALSA = _digital("a1" * 32)
_DEBUG_FALSA = _digital("b2" * 32)
_APPID_DECLARADO = "AAAA111111.app.bichu"
# O valor REAL do quase-acidente de 28/10/2026, registrado em
# `infra/caddy/well-known/LEIA-ME.md`: um Team ID que nao existe ficou servido
# por algumas horas, lido de um `project.pbxproj` nao comitado. A isca usa
# exatamente ele, porque isca com valor inventado nao prova que ESTE desfecho
# seria pego.
_APPID_FALSO = "B7N53534HS.app.bichu"

_DECL_BOA = f"""Prosa que nao e declaracao, com muito mais de quatro palavras,
para provar que o marcador no primeiro campo e a regra inteira.
HOST localhost       local
HOST 127.0.0.1       local
HOST hml.bichu.app   hml
DIGITAL local digital-do-apk  {impressao(normalizar_digital(_RELEASE_FALSA))} play-console
DIGITAL local appid-da-apple  {impressao(normalizar_appid(_APPID_DECLARADO))} team-id
DIGITAL hml   digital-do-apk  {TOKEN_INEXISTENTE} play-console
DIGITAL hml   appid-da-apple  {TOKEN_INEXISTENTE} team-id
"""

RAIZ_DO_REPOSITORIO = Path(__file__).resolve().parent.parent.parent


def autoteste() -> int:
    falhas = 0
    passaram = 0
    reprovaram = 0

    def motivo(n: int, descricao: str, fragmento: str, funcao) -> None:
        """A isca tem de reprovar, e PELO MOTIVO DELA.

        O fragmento esperado nao e enfeite: reprovar pelo motivo do vizinho e o
        defeito que deixa autoteste verde sobre portao cego.
        """
        nonlocal falhas, reprovaram
        try:
            funcao()
        except Reprovacao as e:
            if fragmento in str(e):
                print(f"  [reprova] {n:2d}. {descricao} -> {fragmento}")
                reprovaram += 1
                return
            print(f"  [ FALHOU ] {n:2d}. {descricao}: reprovou por OUTRO motivo: {e}")
            falhas += 1
            return
        except Exception as e:  # noqa: BLE001 - qualquer outro erro e falha da isca
            print(f"  [ FALHOU ] {n:2d}. {descricao}: levantou {type(e).__name__}: {e}")
            falhas += 1
            return
        print(f"  [ FALHOU ] {n:2d}. {descricao}: NAO reprovou, esperado {fragmento}")
        falhas += 1

    def igual(n: int, descricao: str, esperado, funcao, *, e_aprovacao: bool) -> None:
        nonlocal falhas, passaram, reprovaram
        try:
            obtido = funcao()
        except Exception as e:  # noqa: BLE001
            print(f"  [ FALHOU ] {n:2d}. {descricao}: levantou {type(e).__name__}: {e}")
            falhas += 1
            return
        if obtido == esperado:
            print(f"  [{'  passa ' if e_aprovacao else 'reprova'}] {n:2d}. {descricao} -> {esperado!r}")
            if e_aprovacao:
                passaram += 1
            else:
                reprovaram += 1
            return
        print(f"  [ FALHOU ] {n:2d}. {descricao}: obtido {obtido!r}, esperado {esperado!r}")
        falhas += 1

    def erro(n: int, descricao: str, fragmento: str, funcao) -> None:
        """Como `motivo`, para leitura que explode com excecao que NAO e
        `Reprovacao` -- a de forma de arquivo, que o chamador converte em
        reprovacao dura."""
        nonlocal falhas, reprovaram
        try:
            funcao()
        except Exception as e:  # noqa: BLE001
            if fragmento in str(e):
                print(f"  [reprova] {n:2d}. {descricao} -> {type(e).__name__}")
                reprovaram += 1
                return
            print(f"  [ FALHOU ] {n:2d}. {descricao}: explodiu por outro motivo: {e}")
            falhas += 1
            return
        print(f"  [ FALHOU ] {n:2d}. {descricao}: NAO explodiu, esperado {fragmento!r}")
        falhas += 1

    hosts, exig = interpretar_declaracoes(_DECL_BOA, "<isca>")
    assetlinks, apple = CASOS

    def estado(caso, destino, valores):
        return julgar_valores(caso, destino, valores, exig)[0]

    print("autoteste do portao da borda local: as iscas da digital por destino (22 casos)")

    # OS TRES ESTADOS DO CONTEUDO ------------------------------------------
    igual(1, "lista VAZIA no assetlinks e acusada",
          "LISTA_VAZIA", lambda: estado(assetlinks, "local", []), e_aprovacao=False)
    igual(2, "lista VAZIA no apple-app-site-association e acusada",
          "LISTA_VAZIA", lambda: estado(apple, "local", []), e_aprovacao=False)
    igual(3, "digital NAO declarada (simula a de debug da maquina) e acusada",
          "DIGITAL_NAO_DECLARADA", lambda: estado(assetlinks, "local", [_DEBUG_FALSA]),
          e_aprovacao=False)
    igual(4, "digital DECLARADA para o destino PASSA",
          "ok", lambda: estado(assetlinks, "local", [_RELEASE_FALSA]), e_aprovacao=True)
    # A regra que destrava o desenvolvimento local no dia da chave: o
    # `assetlinks.json` aceita VARIAS digitais, e o LEIA-ME manda acrescentar a
    # de release sem remover a de debug. Qualquer servida casando qualquer
    # declarada APROVA -- entao `local` fica verde sem nunca declarar a de debug.
    igual(5, "lista com a de debug MAIS a declarada PASSA",
          "ok", lambda: estado(assetlinks, "local", [_DEBUG_FALSA, _RELEASE_FALSA]),
          e_aprovacao=True)
    igual(6, "appID nao declarado (o B7N53534HS de 28/10) e acusado",
          "DIGITAL_NAO_DECLARADA", lambda: estado(apple, "local", [_APPID_FALSO]),
          e_aprovacao=False)
    igual(7, "appID DECLARADO PASSA",
          "ok", lambda: estado(apple, "local", [_APPID_DECLARADO]), e_aprovacao=True)
    igual(8, "a mesma digital sem dois-pontos e em minuscula PASSA (normalizacao)",
          "ok", lambda: estado(assetlinks, "local", [_RELEASE_FALSA.replace(":", "").lower()]),
          e_aprovacao=True)
    # O PAR DO PORTAO: so o destino muda.
    igual(9, "a MESMA digital, no destino que nao a declara, e acusada",
          "DIGITAL_NAO_DECLARADA", lambda: estado(assetlinks, "hml", [_RELEASE_FALSA]),
          e_aprovacao=False)

    # ENDERECO -> DESTINO ---------------------------------------------------
    igual(10, "endereco declarado resolve para o destino dele",
          "local", lambda: destino_do_endereco("http://localhost:3000", hosts), e_aprovacao=True)
    motivo(11, "endereco NAO declarado reprova", "DESTINO_NAO_DECLARADO",
           lambda: destino_do_endereco("https://bichu.app", hosts))
    motivo(12, "endereco sem hostname reprova", "DESTINO_NAO_DECLARADO",
           lambda: destino_do_endereco("isto-nao-e-url", hosts))

    # LINHA QUE FALTA NAO E LINHA QUE APROVA --------------------------------
    motivo(13, "exigencia sem linha para o destino reprova", "EXIGENCIA_NAO_DECLARADA",
           lambda: julgar_valores(
               assetlinks, "prod", [_RELEASE_FALSA],
               interpretar_declaracoes(
                   "HOST x.exemplo prod\nDIGITAL prod appid-da-apple "
                   f"{TOKEN_INEXISTENTE} team-id\n", "<isca>")[1]))
    motivo(14, "duas linhas DIGITAL para o mesmo par reprovam", "DECLARACAO_AMBIGUA",
           lambda: interpretar_declaracoes(
               "HOST a.exemplo hml\n"
               f"DIGITAL hml digital-do-apk {TOKEN_INEXISTENTE} play-console\n"
               "DIGITAL hml digital-do-apk a1b2c3d4e5f6 play-console\n", "<isca>"))
    motivo(15, "duas linhas HOST para o mesmo host reprovam", "DECLARACAO_AMBIGUA",
           lambda: interpretar_declaracoes(
               "HOST a.exemplo hml\nHOST a.exemplo prod\n"
               f"DIGITAL hml digital-do-apk {TOKEN_INEXISTENTE} play-console\n", "<isca>"))
    motivo(16, "declaracao com prosa e nenhuma linha de marcador reprova",
           "TABELA_SEM_DECLARACAO",
           lambda: interpretar_declaracoes(
               "Este arquivo so tem prosa, e prosa nenhuma e declaracao aqui.\n", "<isca>"))
    motivo(17, "impressao fora da forma reprova", "DECLARACAO_MAL_FORMADA",
           lambda: interpretar_declaracoes(
               "HOST a.exemplo hml\nDIGITAL hml digital-do-apk ZZZZZZZZZZZZ play-console\n",
               "<isca>"))
    motivo(18, "linha DIGITAL sem a procedencia reprova", "DECLARACAO_MAL_FORMADA",
           lambda: interpretar_declaracoes(
               "HOST a.exemplo hml\nDIGITAL hml digital-do-apk a1b2c3d4e5f6\n", "<isca>"))
    motivo(19, "declaracao ausente reprova", "TABELA_ILEGIVEL",
           lambda: ler_declaracoes(Path("/nao-existe-esta-raiz-de-isca")))
    # `applinks.details` com entrada ilegivel tem de EXPLODIR, e nao devolver
    # lista vazia: lista vazia aqui seria lido como "falta o insumo" (aviso),
    # quando a verdade e "a forma do arquivo mudou e esta leitura ficou cega".
    erro(20, "entrada de `applinks.details` sem appID explode em vez de virar lista vazia",
         "sem `appID` nem `appIDs`", lambda: appids_dos_detalhes([{"paths": ["*"]}]))

    # A ESCALADA E PROGRAMADA ----------------------------------------------
    igual(21, "dispensa valendo -> aviso; vencida -> falha; ok -> nada",
          ("aviso", "falha", "aviso", "falha", "nada"),
          lambda: (
              desfecho("LISTA_VAZIA", False), desfecho("LISTA_VAZIA", True),
              desfecho("DIGITAL_NAO_DECLARADA", False), desfecho("DIGITAL_NAO_DECLARADA", True),
              desfecho("ok", True)),
          e_aprovacao=True)

    # CONTROLE POSITIVO DA DECLARACAO REAL ---------------------------------
    def declaracao_real() -> tuple:
        h, e = ler_declaracoes(RAIZ_DO_REPOSITORIO)
        return (
            destino_do_endereco("http://localhost:3000", h),
            destino_do_endereco("https://hml.bichu.app", h),
            all(("local", x) in e and ("hml", x) in e
                for x in ("digital-do-apk", "appid-da-apple")),
        )

    igual(22, "a declaracao RASTREADA deste repositorio cobre os enderecos das tres chamadas",
          ("local", "hml", True), declaracao_real, e_aprovacao=True)

    if falhas:
        print(f"\nREPROVADO: {falhas} caso(s) de autoteste. O portao da digital por destino "
              "NAO esta medindo o que diz medir, e o veredito dele nao vale nada ate isto fechar")
        return 1
    print(f"\nautoteste APROVADO: {reprovaram} caso(s) reprovam pelo motivo deles e "
          f"{passaram} PASSAM")
    return 0


def main(argv: list[str]) -> int:
    if autoteste() != 0:
        return 1
    if "--autoteste" in argv[1:]:
        return 0
    print()

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

    # Fora de `/v1` (e de `/.well-known` e `/webhooks`) a borda nao alcanca o
    # back-end. Na pilha de dev o catch-all e o site, entao a prova de que nao
    # vazou para o back-end e a resposta vir DO SITE: 404 em `text/html`. Uma
    # resposta do back-end (problem+json, json, ou o `text/plain` do `respond`
    # da borda) reprova -- e o vazamento que este probe existe para pegar.
    try:
        status, cab, _corpo = buscar(base, CAMINHO_FORA_DE_TUDO)
        tipo = cab.get("content-type", "")
        problemas = []
        if status != 404:
            problemas.append(f"esperado 404, veio {status}")
        if "text/html" not in tipo:
            problemas.append(
                f"content-type {tipo!r} nao e a pagina 404 do site (text/html): a resposta "
                "parece vir do back-end, e fora de `/v1` a borda nao pode alcanca-lo"
            )
        resultado = [] if not problemas else [f"{CAMINHO_FORA_DE_TUDO}: " + "; ".join(problemas)]
    except Reprovacao as e:
        resultado = [f"{CAMINHO_FORA_DE_TUDO}: nao foi possivel verificar: {e}"]
    print(f"  [{'ok' if not resultado else 'REPROVA'}] fora de `/v1` a borda cai no site, nao no back-end")
    falhas.extend(resultado)

    # ADR-0028: `/t/{code}` e rota do site e tem de ser SERVIDA por ele.
    # Complementa `verificar-hosts-do-site.mjs`, que confere o outro lado (nos
    # hosts de API, `/t/*` e caminho fechado).
    try:
        status, cab, _corpo = buscar(base, CAMINHO_DE_SITE)
        tipo = cab.get("content-type", "")
        resultado = [] if "text/html" in tipo else [
            f"{CAMINHO_DE_SITE}: content-type {tipo!r}; `/t/{{code}}` e rota do site (ADR-0028) "
            "e deve ser servida pelo site (text/html), nao pelo back-end (veio status "
            f"{status})"
        ]
    except Reprovacao as e:
        resultado = [f"{CAMINHO_DE_SITE}: nao foi possivel verificar: {e}"]
    print(f"  [{'ok' if not resultado else 'REPROVA'}] `/t/{{code}}` servida pelo site")
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
