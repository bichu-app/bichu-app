#!/usr/bin/env python3
"""Portao de concordancia entre a borda e o contrato.

Os tres testes que o ADR-0016 e o ADR-0018 exigiram de quem monta a esteira, e
que nao existiam. Enquanto nao existiram, a separacao "borda grossa, contrato
fino" valeu pela confianca do dia em que foi escrita.

  1. `x-edge-limits` de `api/openapi.yaml` contra os numeros do `Caddyfile`
     (ADR-0016, item 4). Reprova na divergencia.
  2. O prefixo montado no Fastify (`PREFIXO_DA_API`, `src/bin/api.ts`) contra o
     caminho dos `servers` do contrato (ADR-0016, item 6). Os dois precisam
     concordar em `/v1`.
  3. Todo caminho que o contrato declara FORA de `/v1` precisa ter rota na
     borda. Este e o teste que o dia 17/09 pediu: `/.well-known/jwks.json` e
     `/.well-known/openid-configuration` estavam no contrato, o servico os
     servia, a borda nao os roteava, e o catch-all respondia 404. Nada acusou,
     porque nada estava olhando.
  4. A superficie administrativa so existe no host administrativo
     (docs/04-seguranca.md, D33 e D34; prova P15, metade estatica). Todo bloco
     que repassa `/v1/*` a API responde 404 DA BORDA para `/v1/admin*`; o bloco
     do backoffice apaga `X-Internal-*` de entrada ANTES de por
     `X-Internal-Surface: admin`; e nenhuma linha do arquivo emite CORS.
  5. O teto de taxa da borda (ADR-0016 emenda 2): as duas zonas do bloco
     administrativo contra `x-edge-limits`, numero a numero; zona sem numero no
     contrato e numero sem zona reprovam; `rate_limit` em qualquer outro bloco
     reprova; e CHAVE DESCONHECIDA em `x-edge-limits` reprova -- ate 23/09 este
     portao ignorava chave que nao conhecia, e numero declarado sem imposicao e
     o que a secao 4 do ADR-0016 chama de pior que nenhum.

Regra que governa o arquivo inteiro: **quando nao consegue verificar, reprova**.
Bloco ausente, numero ilegivel, zero caminho encontrado -- tudo reprovacao com o
motivo, nunca "esta tudo bem".

E o autoteste, que e a parte que importa: as iscas de `infra/verificacao/iscas/`
PRECISAM ser reprovadas. Se elas passarem, este script falha com "o portao parou
de enxergar".

Uso: python3 verificar_borda.py [raiz]
Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 1. x-edge-limits contra o Caddyfile
# ---------------------------------------------------------------------------

# O que o contrato declara -> como o Caddy escreve o mesmo numero.
# `bytes` normaliza KiB/MiB para byte, e `segundos` normaliza `30s`.
CAMPOS_DE_LIMITE = {
    "max_request_body_bytes": ("max_size", "bytes"),
    "max_request_header_bytes": ("max_header_size", "bytes"),
    "read_timeout_seconds": ("read_body", "segundos"),
    "write_timeout_seconds": ("write", "segundos"),
}

MULTIPLICADOR = {"": 1, "b": 1, "kb": 1000, "kib": 1024, "mb": 1000**2, "mib": 1024**2,
                 "gb": 1000**3, "gib": 1024**3}


class Reprovacao(Exception):
    """Falha de assercao ou impossibilidade de verificar. Os dois reprovam."""


def bytes_de(bruto: str, onde: str) -> int:
    m = re.fullmatch(r"(\d+)\s*([A-Za-z]*)", bruto.strip())
    if not m:
        raise Reprovacao(f"{onde}: nao entendi o tamanho {bruto!r}")
    unidade = m.group(2).lower()
    if unidade not in MULTIPLICADOR:
        raise Reprovacao(f"{onde}: unidade desconhecida em {bruto!r}")
    return int(m.group(1)) * MULTIPLICADOR[unidade]


def segundos_de(bruto: str, onde: str) -> int:
    m = re.fullmatch(r"(\d+)\s*(s|sec|segundos?)?", bruto.strip())
    if not m:
        raise Reprovacao(f"{onde}: nao entendi o tempo {bruto!r}")
    return int(m.group(1))


def limites_do_contrato(texto: str) -> dict[str, int]:
    """Le o bloco `x-edge-limits` da RAIZ do contrato.

    Parser estreito de proposito: so o que este bloco usa, que e
    `chave: inteiro  # comentario`. Qualquer coisa fora disso reprova em vez de
    ser interpretada de um jeito criativo.
    """
    m = re.search(r"^x-edge-limits:\s*$", texto, re.M)
    if not m:
        raise Reprovacao(
            "o contrato nao tem o bloco `x-edge-limits` na raiz. Sem ele nao ha contra o que "
            "conferir o Caddyfile, e a conferencia reprova em vez de passar"
        )
    corpo = []
    for linha in texto[m.end():].splitlines()[1:]:
        if linha.strip() and not linha.startswith((" ", "\t")):
            break  # proxima chave de primeiro nivel
        corpo.append(linha)

    achados: dict[str, int] = {}
    for linha in corpo:
        limpa = linha.split("#", 1)[0].strip()
        if not limpa:
            continue
        if m2 := re.fullmatch(r"(\w+):\s*(\d+)", limpa):
            achados[m2.group(1)] = int(m2.group(2))

    faltando = [c for c in CAMPOS_DE_LIMITE if c not in achados]
    if faltando:
        raise Reprovacao(
            "`x-edge-limits` nao declara " + ", ".join(f"`{c}`" for c in faltando)
            + ". Numero que falta no contrato e numero sem dono"
        )
    return achados


def limites_do_caddyfile(texto: str) -> dict[str, int]:
    """Le os quatro numeros grossos do Caddyfile, cada um pelo seu nome."""
    achados: dict[str, int] = {}
    for campo, (palavra, tipo) in CAMPOS_DE_LIMITE.items():
        m = re.search(rf"^\s*{re.escape(palavra)}\s+(\S+)\s*$", texto, re.M)
        if not m:
            raise Reprovacao(
                f"o Caddyfile nao declara `{palavra}` (espelho de `{campo}`). Verificacao que "
                "nao acha o bloco em um dos dois arquivos reprova com o motivo, em vez de passar"
            )
        onde = f"Caddyfile:{palavra}"
        achados[campo] = bytes_de(m.group(1), onde) if tipo == "bytes" else segundos_de(m.group(1), onde)
    return achados


def comparar_limites(contrato: dict[str, int], caddy: dict[str, int]) -> list[str]:
    falhas = []
    for campo, (palavra, _tipo) in CAMPOS_DE_LIMITE.items():
        if contrato[campo] != caddy[campo]:
            falhas.append(
                f"`x-edge-limits.{campo}` = {contrato[campo]} e o Caddyfile (`{palavra}`) = "
                f"{caddy[campo]}. Numero novo na borda sem numero correspondente no contrato e "
                "divergencia silenciosa: ninguem revisa o Caddyfile como contrato"
            )
    return falhas


# ---------------------------------------------------------------------------
# 2. Prefixo do Fastify contra os `servers` do contrato
# ---------------------------------------------------------------------------

def prefixo_do_fastify(texto: str) -> str:
    m = re.search(r"""PREFIXO_DA_API\s*=\s*['"]([^'"]+)['"]""", texto)
    if not m:
        raise Reprovacao(
            "nao achei `PREFIXO_DA_API` em src/bin/api.ts. O prefixo existe em tres lugares "
            "(contrato, Fastify, Caddy) e este ponto e o unico que diz qual deles o servico "
            "monta de fato"
        )
    return m.group(1)


def prefixos_do_contrato(texto: str) -> list[str]:
    """Caminho dos `servers` da RAIZ.

    Os `servers` que vivem DENTRO de um `paths` (os arquivos de `.well-known`,
    que tem host proprio) ficam de fora: eles sao a excecao declarada, e
    justamente por isso nao carregam o prefixo de versao.
    """
    m = re.search(r"^servers:\s*$", texto, re.M)
    if not m:
        raise Reprovacao("o contrato nao tem `servers:` na raiz")
    prefixos: list[str] = []
    for linha in texto[m.end():].splitlines()[1:]:
        if linha.strip() and not linha.startswith((" ", "\t")):
            break
        if m2 := re.search(r"""^\s*-?\s*url:\s*['"]?([^'"#\s]+)""", linha):
            url = m2.group(1)
            caminho = re.sub(r"^[a-z]+://[^/]+", "", url)
            prefixos.append(caminho or "/")
    if not prefixos:
        raise Reprovacao(
            "`servers:` existe e nao tem nenhuma `url`. Sem alvo, a conferencia de prefixo "
            "terminaria verde sem ter olhado para nada"
        )
    return prefixos


def comparar_prefixo(prefixo: str, prefixos_servers: list[str]) -> list[str]:
    falhas = []
    for caminho in prefixos_servers:
        if caminho.rstrip("/") != prefixo.rstrip("/"):
            falhas.append(
                f"o Fastify monta `{prefixo}` e o contrato declara `servers` em `{caminho}`. "
                "O caminho que o app envia precisa ser o que o servico recebe e o que o "
                "contrato declara (ADR-0016, itens 1 e 6)"
            )
    return falhas


# ---------------------------------------------------------------------------
# 3. Caminho do contrato fora de /v1 precisa ter rota na borda
# ---------------------------------------------------------------------------

def caminhos_fora_do_prefixo(texto: str) -> list[str]:
    """Chaves de `paths:` que NAO entram sob o prefixo de versao.

    Sao os caminhos servidos na RAIZ do host. Eles nao chegam pelo
    `handle /v1/*`, entao ou tem bloco proprio na borda ou caem no catch-all --
    que responde 404 sem uma linha de erro em lugar nenhum.

    COMO SE RECONHECE UM DELES, e por que nao e pelo nome do caminho. Quase toda
    chave de `paths:` neste contrato comeca com `/` sem `/v1` (`/auth/login`,
    `/pets`, `/health`): o prefixo mora no `servers:` da RAIZ e nao se repete em
    cada caminho. O que distingue os que ficam FORA e declararem um `servers:`
    PROPRIO, que sobrescreve o da raiz e os tira do prefixo de versao.

    Ate 19/09 esta funcao terminava em `[r for r in encontrados if
    r.startswith("/.well-known/")]`, e essa linha era o proprio defeito que o
    arquivo existe para pegar. Ela nasceu junto com o caso de 17/09, quando os
    unicos caminhos na raiz eram os quatro de `.well-known`, e virou uma regra
    escrita sobre os exemplos da epoca em vez de sobre o criterio. Quando
    `/webhooks/postmark` entrou no contrato -- tambem com `servers:` proprio,
    tambem fora de `/v1` --, ele foi COLETADO e descartado em silencio pelo
    filtro. O portao imprimia "rota na borda para os 4 caminho(s)" e APROVAVA,
    com o webhook sem rota nenhuma na borda. Um portao que conhece os quatro
    nomes de 17/09 nao verifica a regra: ele verifica a lembranca dela.
    """
    m = re.search(r"^paths:\s*$", texto, re.M)
    if not m:
        raise Reprovacao("o contrato nao tem `paths:` na raiz")
    encontrados: list[str] = []
    rota_atual: str | None = None
    total = 0
    for linha in texto[m.end():].splitlines()[1:]:
        if linha.strip() and not linha.startswith((" ", "\t")):
            break
        if m2 := re.fullmatch(r"  (/\S*):\s*", linha.split("#", 1)[0].rstrip() + " "):
            total += 1
            rota_atual = m2.group(1)
        elif rota_atual is not None and re.fullmatch(r"    servers:\s*", linha.rstrip()):
            encontrados.append(rota_atual)
    if total == 0:
        raise Reprovacao(
            "nao encontrei nenhuma rota em `paths:`. Filtro que nao filtra termina verde e "
            "ninguem desconfia: a ausencia de alvo reprova"
        )
    if not encontrados:
        raise Reprovacao(
            "nenhum caminho de `paths:` declara `servers:` proprio. Ou o contrato deixou de "
            "servir qualquer coisa na raiz do host -- e ai esta conferencia precisa sair junto "
            "--, ou o formato mudou e o parser parou de enxergar. Nos dois casos a conferencia "
            "nao tem o que provar, e passar verde aqui e o defeito de 17/09 de volta"
        )
    return encontrados


def comparar_roteamento(rotas: list[str], caddyfile: str) -> list[str]:
    falhas = []
    for rota in rotas:
        if not re.search(rf"^\s*handle\s+{re.escape(rota)}\s*\{{", caddyfile, re.M):
            falhas.append(
                f"o contrato declara `{rota}` e a borda nao tem `handle {rota}`. Ele cai no "
                "catch-all e responde 404 -- e quem consulta esse caminho e o sistema "
                "operacional ou uma biblioteca de validacao de token, que nao reporta o erro "
                "a ninguem. Foi assim que o deep link e o JWKS ficaram fora do ar em 17/09"
            )
    return falhas


# ---------------------------------------------------------------------------
# 4. A superficie administrativa so existe no host administrativo (D33, D34)
# ---------------------------------------------------------------------------
#
# Por que por LEITURA do arquivo, e nao so pela sonda da pilha de pe: a sonda
# (`verificar-backoffice-na-borda.mjs`) prova o comportamento de UMA
# configuracao renderizada, com os hosts daquele ambiente. Um bloco de site
# novo -- o apex saindo para o bloco do site, um `api.` que alguem acrescente --
# so e coberto por ela se alguem lembrar de sondar o host novo. Aqui a regra vale
# para TODO bloco que repassa `/v1/*` a API, inclusive os que ainda nao existem.
#
# O parser e estreito de proposito, e se apoia na forma deste arquivo: chave de
# abertura no FIM da linha, chave de fechamento SOZINHA na linha. `{$VAR}` e
# `{placeholder}` no meio da linha nao contam. Arquivo que fuja disso reprova
# por nao fechar as chaves, em vez de ser lido errado.

MARCA_DO_BLOCO_ADMIN = "ADMIN_HOSTS"


def _linhas_sem_comentario(texto: str) -> list[str]:
    saida = []
    for linha in texto.splitlines():
        # `#` inicia comentario no inicio da linha ou depois de espaco. Nenhum
        # valor deste arquivo tem `#` entre aspas; se passar a ter, o bloco
        # deixa de fechar e a conferencia reprova, que e o lado certo.
        saida.append(re.split(r"(?:^|\s)#", linha, maxsplit=1)[0].rstrip())
    return saida


def blocos(linhas: list[str]) -> list[tuple[str, list[str]]]:
    """Blocos no primeiro nivel de `linhas`: (cabecalho, corpo sem as chaves)."""
    achados: list[tuple[str, list[str]]] = []
    profundidade = 0
    cabecalho = ""
    corpo: list[str] = []
    for linha in linhas:
        limpa = linha.strip()
        if not limpa:
            continue
        abre = limpa.endswith("{")
        fecha = limpa == "}"
        if profundidade == 0:
            if abre:
                cabecalho = limpa[:-1].strip()
                corpo = []
                profundidade = 1
            continue
        if fecha:
            profundidade -= 1
            if profundidade == 0:
                achados.append((cabecalho, corpo))
                continue
        elif abre:
            profundidade += 1
        corpo.append(linha)
    if profundidade != 0:
        raise Reprovacao(
            "as chaves do Caddyfile nao fecham na leitura deste portao (chave de abertura no fim "
            "da linha, fechamento sozinho na linha). Sem blocos confiaveis nao ha como conferir a "
            "separacao por host, e a conferencia reprova em vez de adivinhar"
        )
    return achados


def _expandir_imports(linhas: list[str]) -> list[str]:
    """Troca `import <trecho>` pelo corpo do trecho, no nivel em que aparece.

    Sem isto, uma regra escrita num trecho importado -- o `handle /v1/*` que
    passe a morar num `(gateway_v1)` compartilhado entre blocos, por exemplo --
    sumiria desta leitura, e a conferencia reprovaria por nao achar o que existe
    ou, pior, aprovaria por nao achar o que falta. Argumentos do `import` nao sao
    substituidos: as regras aqui nao dependem deles.
    """
    trechos = {c[1:-1].strip(): corpo for c, corpo in blocos(linhas)
               if c.startswith("(") and c.endswith(")")}

    def expandir(corpo: list[str], pilha: tuple[str, ...]) -> list[str]:
        saida: list[str] = []
        for linha in corpo:
            m = re.match(r"\s*import\s+(\S+)", linha)
            if m and m.group(1) in trechos:
                nome = m.group(1)
                if nome in pilha:
                    raise Reprovacao(f"o trecho `({nome})` importa a si mesmo")
                saida.extend(expandir(trechos[nome], pilha + (nome,)))
            else:
                saida.append(linha)
        return saida

    saida: list[str] = []
    for c, corpo in blocos(linhas):
        saida.append(f"{c} {{")
        saida.extend(expandir(corpo, ()) if not c.startswith(("(", "&(")) else corpo)
        saida.append("}")
    return saida


def conferir_superficie_admin(caddyfile: str) -> list[str]:
    linhas = _expandir_imports(_linhas_sem_comentario(caddyfile))
    falhas: list[str] = []

    # D34: CORS em lugar nenhum. A SPA e `/v1/admin/*` estao na mesma origem;
    # um `Access-Control-Allow-*` em qualquer bloco e uma porta cruzada que
    # ninguem decidiu abrir.
    for n, linha in enumerate(linhas, 1):
        if re.search(r"Access-Control-Allow-", linha):
            falhas.append(
                f"Caddyfile:{n} emite `Access-Control-Allow-*`. O backoffice e a API "
                "administrativa estao na MESMA origem (D34): CORS aqui abre a API a outra origem "
                "sem decisao"
            )

    todos = blocos(linhas)
    sites = [(c, corpo) for c, corpo in todos if c and not c.startswith(("(", "&("))]
    admin = [(c, corpo) for c, corpo in sites if MARCA_DO_BLOCO_ADMIN in c]
    if len(admin) != 1:
        raise Reprovacao(
            f"esperado exatamente 1 bloco de site com `{MARCA_DO_BLOCO_ADMIN}` no endereco, "
            f"achei {len(admin)}. Sem o bloco administrativo nao ha o que conferir, e com dois a "
            "conferencia nao sabe qual vale"
        )

    def handles(corpo: list[str]) -> dict[str, list[str]]:
        return {c.split(None, 1)[1] if " " in c else "": b
                for c, b in blocos(corpo) if c == "handle" or c.startswith("handle ")}

    aplicacoes = []
    for cabecalho, corpo in sites:
        if MARCA_DO_BLOCO_ADMIN in cabecalho:
            continue
        hs = handles(corpo)
        if any("reverse_proxy api:" in l for l in hs.get("/v1/*", [])):
            aplicacoes.append((cabecalho, hs))
    if not aplicacoes:
        raise Reprovacao(
            "nenhum bloco de site repassa `handle /v1/*` a `api:`. Ou a forma do arquivo mudou e "
            "o parser parou de enxergar, ou a API saiu da borda; nos dois casos a regra D33 nao "
            "tem onde ser conferida, e passar verde aqui seria nao olhar"
        )
    for cabecalho, hs in aplicacoes:
        bloqueio = hs.get("/v1/admin*")
        if bloqueio is None:
            falhas.append(
                f"o bloco `{cabecalho}` repassa `/v1/*` a API e NAO tem `handle /v1/admin*` com "
                "404 da borda. A superficie administrativa fica publicada neste host (D33) -- o "
                "estado medido em `hml.bichu.app` em 23/09"
            )
        elif any("reverse_proxy" in l for l in bloqueio) or not any(
            re.search(r"\brespond\b.*\b404\b", l) for l in bloqueio
        ):
            falhas.append(
                f"no bloco `{cabecalho}`, `handle /v1/admin*` existe mas nao responde 404 da borda "
                "sem repassar. Ele precisa ser `respond ... 404`, e so isso"
            )

    _, corpo_admin = admin[0]
    rota = handles(corpo_admin).get("/v1/admin/*")
    if rota is None:
        falhas.append(
            "o bloco administrativo nao tem `handle /v1/admin/*`: a SPA ficaria sem API na mesma "
            "origem, e a tentacao seguinte e CORS (D34)"
        )
    else:
        texto = [l.strip() for l in rota]
        limpa = next((i for i, l in enumerate(texto) if l == "request_header -X-Internal-*"), None)
        marca = next((i for i, l in enumerate(texto)
                      if re.fullmatch(r"request_header\s+X-Internal-Surface\s+admin", l)), None)
        if marca is None:
            falhas.append(
                "o `handle /v1/admin/*` do bloco administrativo nao poe "
                "`request_header X-Internal-Surface admin`. A guarda da aplicacao recusa sem ele, "
                "entao o backoffice inteiro responderia 404"
            )
        if limpa is None or (marca is not None and limpa > marca):
            falhas.append(
                "o `handle /v1/admin/*` do bloco administrativo nao apaga `X-Internal-*` ANTES de "
                "por `X-Internal-Surface`. Sem a limpeza primeiro, o valor mandado pelo cliente "
                "sobrevive e a marca da borda deixa de provar de onde a requisicao veio (D33)"
            )
        if not any(l.startswith("reverse_proxy api:") for l in texto):
            falhas.append("o `handle /v1/admin/*` do bloco administrativo nao repassa a `api:`")
    return falhas


# ---------------------------------------------------------------------------
# 5. Teto de taxa na borda, so no host administrativo (ADR-0016 emenda 2)
# ---------------------------------------------------------------------------

# Chave de `x-edge-limits` -> (zona do `rate_limit`, metodo exigido, caminho).
LIMITES_DE_TAXA = {
    "admin_login_requests_per_minute_per_ip": ("admin_login", "POST", "/v1/admin/auth/login"),
    "admin_requests_per_minute_per_ip": ("admin_api", None, "/v1/admin/*"),
}


def _janela_em_segundos(bruto: str, onde: str) -> int:
    m = re.fullmatch(r"(\d+)(s|m|h)", bruto.strip())
    if not m:
        raise Reprovacao(f"{onde}: nao entendi a janela {bruto!r}")
    return int(m.group(1)) * {"s": 1, "m": 60, "h": 3600}[m.group(2)]


def conferir_taxa_na_borda(contrato: dict[str, int], caddyfile: str) -> list[str]:
    falhas: list[str] = []

    conhecidas = set(CAMPOS_DE_LIMITE) | set(LIMITES_DE_TAXA)
    for chave in sorted(set(contrato) - conhecidas):
        falhas.append(
            f"`x-edge-limits.{chave}` nao e conferido por este portao. Numero no contrato que "
            "ninguem compara com a borda e numero declarado sem imposicao (ADR-0016 emenda 2): "
            "ensine a conferencia ou tire a chave"
        )
    for chave in LIMITES_DE_TAXA:
        if chave not in contrato:
            falhas.append(
                f"`x-edge-limits` nao declara `{chave}`, e a borda aplica essa zona. Teto que so "
                "existe no Caddyfile e teto sem dono"
            )

    linhas = _expandir_imports(_linhas_sem_comentario(caddyfile))
    sites = [(c, corpo) for c, corpo in blocos(linhas) if c and not c.startswith(("(", "&("))]
    for cabecalho, corpo in sites:
        if MARCA_DO_BLOCO_ADMIN not in cabecalho and any(
            re.match(r"\s*rate_limit\b", l) for l in corpo
        ):
            falhas.append(
                f"o bloco `{cabecalho}` tem `rate_limit`. Teto de taxa na borda e SO do host "
                "administrativo (ADR-0016 emenda 2); nos hosts do app ele mora no servico, com "
                "a dimensao certa (item 4)"
            )
    admin = [corpo for c, corpo in sites if MARCA_DO_BLOCO_ADMIN in c]
    if len(admin) != 1:
        raise Reprovacao(
            f"esperado 1 bloco com `{MARCA_DO_BLOCO_ADMIN}` para conferir o teto de taxa, achei "
            f"{len(admin)}"
        )
    taxa = [b for c, b in blocos(admin[0]) if c == "rate_limit"]
    if len(taxa) != 1:
        raise Reprovacao(
            "o bloco administrativo nao tem exatamente um `rate_limit`. Sem ele a emenda 2 do "
            "ADR-0016 esta escrita e nao aplicada, que e o estado que este portao existe para "
            "impedir"
        )
    zonas = {c.split(None, 1)[1]: b for c, b in blocos(taxa[0]) if c.startswith("zone ")}
    esperadas = {z for z, _m, _p in LIMITES_DE_TAXA.values()}
    for sobrando in sorted(set(zonas) - esperadas):
        falhas.append(
            f"a zona `{sobrando}` do `rate_limit` nao tem numero em `x-edge-limits`. Teto na borda "
            "sem numero no contrato e divergencia silenciosa"
        )
    for chave, (zona, metodo, caminho) in LIMITES_DE_TAXA.items():
        corpo = zonas.get(zona)
        if corpo is None:
            falhas.append(f"`x-edge-limits.{chave}` existe e o `rate_limit` nao tem a zona `{zona}`")
            continue
        texto = [l.strip() for l in corpo]
        eventos = next((l.split()[1] for l in texto if l.startswith("events ")), None)
        janela = next((l.split()[1] for l in texto if l.startswith("window ")), None)
        if eventos is None or janela is None or not eventos.isdigit():
            falhas.append(f"a zona `{zona}` nao declara `events` e `window` legiveis")
            continue
        segundos = _janela_em_segundos(janela, f"Caddyfile:zona {zona}")
        if (int(eventos) * 60) % segundos != 0:
            falhas.append(f"a zona `{zona}` ({eventos} em {janela}) nao vira um numero inteiro por minuto")
            continue
        por_minuto = int(eventos) * 60 // segundos
        if chave in contrato and contrato[chave] != por_minuto:
            falhas.append(
                f"`x-edge-limits.{chave}` = {contrato[chave]} por minuto e a zona `{zona}` do "
                f"Caddyfile aplica {por_minuto} por minuto ({eventos} em {janela})"
            )
        if "key {remote_host}" not in texto:
            falhas.append(
                f"a zona `{zona}` nao chaveia por `{{remote_host}}`. O contrato diz POR IP; outra "
                "chave e outro teto"
            )
        if f"path {caminho}" not in texto:
            falhas.append(f"a zona `{zona}` nao casa `path {caminho}`, que e o caminho do contrato")
        if metodo and f"method {metodo}" not in texto:
            falhas.append(f"a zona `{zona}` nao casa `method {metodo}`")
    return falhas


# ---------------------------------------------------------------------------
# Autoteste
# ---------------------------------------------------------------------------

def autoteste(raiz: Path) -> list[str]:
    """As iscas PRECISAM reprovar. E a prova negativa do portao."""
    falhas: list[str] = []
    iscas = raiz / "infra" / "verificacao" / "iscas"

    def caddy(nome: str) -> str | None:
        arq = iscas / nome
        if not arq.is_file():
            falhas.append(
                f"infra/verificacao/iscas/{nome}: isca ausente. Sem ela o portao passa a valer "
                "por confianca, e ninguem sabe se ele ainda enxerga"
            )
            return None
        return arq.read_text(encoding="utf-8")

    contrato = (raiz / "api" / "openapi.yaml").read_text(encoding="utf-8")
    limites_certos = limites_do_contrato(contrato)

    # (a) numero divergente entre contrato e borda
    if texto := caddy("caddyfile-com-limite-divergente"):
        try:
            if not comparar_limites(limites_certos, limites_do_caddyfile(texto)):
                falhas.append(
                    "caddyfile-com-limite-divergente: A ISCA PASSOU. O portao parou de enxergar "
                    "divergencia de numero entre `x-edge-limits` e o Caddyfile"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-com-limite-divergente: reprovou pelo motivo errado: {e}")

    # (b) bloco de limite ausente: nao conseguir verificar precisa reprovar
    if texto := caddy("caddyfile-sem-bloco-de-limite"):
        try:
            limites_do_caddyfile(texto)
            falhas.append(
                "caddyfile-sem-bloco-de-limite: A ISCA PASSOU. O portao aceitou um Caddyfile sem "
                "os numeros, o que e passar verde por nao ter o que checar"
            )
        except Reprovacao:
            pass

    # (c) caminho de `.well-known` do contrato sem rota na borda
    if texto := caddy("caddyfile-sem-rota-well-known"):
        rotas = caminhos_fora_do_prefixo(contrato)
        if not rotas:
            falhas.append(
                "o contrato nao declara nenhum caminho fora de `/v1`, entao a isca de roteamento "
                "nao tem o que provar. Se os `.well-known` sairam do contrato, esta isca precisa "
                "sair junto -- e ate la o portao nao esta verificando nada"
            )
        elif not comparar_roteamento(rotas, texto):
            falhas.append(
                "caddyfile-sem-rota-well-known: A ISCA PASSOU. O portao parou de enxergar "
                "caminho do contrato sem rota na borda, que e o defeito de 17/09"
            )

    # (c2) borda com os quatro `.well-known` e SEM o webhook.
    #
    # A isca (c) acima nao bastava, e a insuficiencia dela e o defeito de 19/09:
    # um Caddyfile sem nenhuma rota de raiz reprova por causa dos quatro
    # caminhos antigos, entao ele passaria igual com o filtro cego
    # `startswith("/.well-known/")` de volta no lugar. Esta isca tem os quatro e
    # nao tem o quinto: ela so reprova se o portao enxergar `/webhooks/postmark`
    # especificamente.
    if texto := caddy("caddyfile-sem-rota-webhook"):
        rotas = caminhos_fora_do_prefixo(contrato)
        if not any(r.startswith("/webhooks/") for r in rotas):
            falhas.append(
                "o contrato nao declara nenhum caminho em `/webhooks/` fora de `/v1`, entao esta "
                "isca nao tem o que provar. Ou o webhook saiu do contrato -- e ai a isca sai "
                "junto --, ou `caminhos_fora_do_prefixo` voltou a filtrar por nome de caminho"
            )
        elif not comparar_roteamento(rotas, texto):
            falhas.append(
                "caddyfile-sem-rota-webhook: A ISCA PASSOU. O portao enxerga os quatro "
                "`.well-known` e NAO enxerga `/webhooks/postmark`, que e exatamente o estado "
                "em que ele aprovou a borda em 19/09 com o webhook sem rota nenhuma"
            )

    # (d) prefixo divergente entre Fastify e contrato
    if texto := caddy("api-com-prefixo-divergente.ts.isca"):
        try:
            if not comparar_prefixo(prefixo_do_fastify(texto), prefixos_do_contrato(contrato)):
                falhas.append(
                    "api-com-prefixo-divergente.ts.isca: A ISCA PASSOU. O portao parou de "
                    "enxergar divergencia entre o prefixo do Fastify e o `servers` do contrato"
                )
        except Reprovacao as e:
            falhas.append(f"api-com-prefixo-divergente.ts.isca: reprovou pelo motivo errado: {e}")

    # (e) D33: bloco da aplicacao SEM o 404 de `/v1/admin*`. E o estado de
    # `hml.bichu.app` medido em 23/09, e o que esta isca existe para pegar.
    if texto := caddy("caddyfile-app-sem-bloqueio-admin"):
        try:
            if not any("/v1/admin*" in f for f in conferir_superficie_admin(texto)):
                falhas.append(
                    "caddyfile-app-sem-bloqueio-admin: A ISCA PASSOU. O portao parou de enxergar "
                    "bloco que repassa `/v1/*` sem responder 404 para `/v1/admin*` (D33)"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-app-sem-bloqueio-admin: reprovou pelo motivo errado: {e}")

    # (f) D33: bloco administrativo que poe a marca SEM apagar o forjado antes.
    if texto := caddy("caddyfile-admin-sem-limpar-interno"):
        try:
            if not any("ANTES" in f for f in conferir_superficie_admin(texto)):
                falhas.append(
                    "caddyfile-admin-sem-limpar-interno: A ISCA PASSOU. O portao aceitou um "
                    "`X-Internal-Surface` posto sem apagar `X-Internal-*` antes (D33)"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-admin-sem-limpar-interno: reprovou pelo motivo errado: {e}")

    # (g) D34: CORS em qualquer lugar do arquivo.
    if texto := caddy("caddyfile-com-cors"):
        try:
            if not any("Access-Control-Allow-" in f for f in conferir_superficie_admin(texto)):
                falhas.append(
                    "caddyfile-com-cors: A ISCA PASSOU. O portao parou de enxergar CORS na borda "
                    "(D34)"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-com-cors: reprovou pelo motivo errado: {e}")

    # (i) teto de taxa divergente entre `x-edge-limits` e a zona do Caddyfile.
    if texto := caddy("caddyfile-taxa-divergente"):
        try:
            if not any("admin_login" in f and "por minuto" in f
                       for f in conferir_taxa_na_borda(limites_certos, texto)):
                falhas.append(
                    "caddyfile-taxa-divergente: A ISCA PASSOU. O portao parou de enxergar teto de "
                    "taxa da borda diferente do contrato"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-taxa-divergente: reprovou pelo motivo errado: {e}")

    # (j) teto de taxa num host do app: a emenda 2 vale so para o administrativo.
    if texto := caddy("caddyfile-taxa-no-host-do-app"):
        try:
            if not any("SO do host administrativo" in f
                       for f in conferir_taxa_na_borda(limites_certos, texto)):
                falhas.append(
                    "caddyfile-taxa-no-host-do-app: A ISCA PASSOU. O portao aceitou `rate_limit` "
                    "num host do app"
                )
        except Reprovacao as e:
            falhas.append(f"caddyfile-taxa-no-host-do-app: reprovou pelo motivo errado: {e}")

    # (k) chave desconhecida em `x-edge-limits`: o buraco que a emenda 2 nomeou.
    if texto := caddy("contrato-com-limite-desconhecido.yaml"):
        try:
            desconhecido = limites_do_contrato(texto)
            real = (raiz / "infra" / "caddy" / "Caddyfile").read_text(encoding="utf-8")
            if not any("nao e conferido por este portao" in f
                       for f in conferir_taxa_na_borda(desconhecido, real)):
                falhas.append(
                    "contrato-com-limite-desconhecido.yaml: A ISCA PASSOU. Uma chave de "
                    "`x-edge-limits` sem conferencia voltou a passar calada"
                )
        except Reprovacao as e:
            falhas.append(f"contrato-com-limite-desconhecido.yaml: reprovou pelo motivo errado: {e}")

    # (h) sem bloco administrativo: nao ha o que conferir, e isso reprova.
    if texto := caddy("caddyfile-sem-bloco-admin"):
        try:
            conferir_superficie_admin(texto)
            falhas.append(
                "caddyfile-sem-bloco-admin: A ISCA PASSOU. O portao aprovou um Caddyfile sem bloco "
                "administrativo, o que e passar verde por nao ter o que checar"
            )
        except Reprovacao:
            pass

    return falhas


# ---------------------------------------------------------------------------

def main(argv: list[str]) -> int:
    raiz = Path(argv[1] if len(argv) > 1 else ".").resolve()
    print(f"portao de concordancia borda/contrato - {raiz}")

    arquivos = {
        "contrato": raiz / "api" / "openapi.yaml",
        "caddyfile": raiz / "infra" / "caddy" / "Caddyfile",
        "api": raiz / "src" / "bin" / "api.ts",
    }
    for rotulo, caminho in arquivos.items():
        if not caminho.is_file():
            print(f"REPROVA: {rotulo} nao encontrado em {caminho}")
            return 1
    contrato = arquivos["contrato"].read_text(encoding="utf-8")
    caddyfile = arquivos["caddyfile"].read_text(encoding="utf-8")
    api = arquivos["api"].read_text(encoding="utf-8")

    falhas: list[str] = []

    try:
        falhas_autoteste = autoteste(raiz)
    except Reprovacao as e:
        falhas_autoteste = [f"o autoteste nao pode rodar: {e}"]
    print(f"  [{'ok' if not falhas_autoteste else 'REPROVA'}] autoteste das iscas")

    try:
        do_contrato = limites_do_contrato(contrato)
        do_caddy = limites_do_caddyfile(caddyfile)
        achados = comparar_limites(do_contrato, do_caddy)
        print(f"  [{'ok' if not achados else 'REPROVA'}] x-edge-limits contra o Caddyfile "
              f"({', '.join(f'{k}={v}' for k, v in do_contrato.items())})")
        falhas.extend(achados)
    except Reprovacao as e:
        print("  [REPROVA] x-edge-limits contra o Caddyfile")
        falhas.append(str(e))

    try:
        prefixo = prefixo_do_fastify(api)
        servers = prefixos_do_contrato(contrato)
        achados = comparar_prefixo(prefixo, servers)
        print(f"  [{'ok' if not achados else 'REPROVA'}] prefixo do Fastify (`{prefixo}`) contra "
              f"`servers` ({', '.join(servers)})")
        falhas.extend(achados)
    except Reprovacao as e:
        print("  [REPROVA] prefixo do Fastify contra `servers`")
        falhas.append(str(e))

    try:
        rotas = caminhos_fora_do_prefixo(contrato)
        achados = comparar_roteamento(rotas, caddyfile)
        print(f"  [{'ok' if not achados else 'REPROVA'}] rota na borda para os {len(rotas)} "
              f"caminho(s) do contrato fora de `/v1`")
        for rota in rotas:
            print(f"      {rota}")
        falhas.extend(achados)
    except Reprovacao as e:
        print("  [REPROVA] rota na borda para caminho fora de `/v1`")
        falhas.append(str(e))

    try:
        achados = conferir_taxa_na_borda(limites_do_contrato(contrato), caddyfile)
        print(f"  [{'ok' if not achados else 'REPROVA'}] teto de taxa da borda so no host "
              "administrativo, igual a `x-edge-limits`, sem chave desconhecida (ADR-0016 emenda 2)")
        falhas.extend(achados)
    except Reprovacao as e:
        print("  [REPROVA] teto de taxa da borda (ADR-0016 emenda 2)")
        falhas.append(str(e))

    try:
        achados = conferir_superficie_admin(caddyfile)
        print(f"  [{'ok' if not achados else 'REPROVA'}] `/v1/admin*` so no host administrativo, "
              "com `X-Internal-*` limpo antes da marca, e sem CORS (D33, D34)")
        falhas.extend(achados)
    except Reprovacao as e:
        print("  [REPROVA] `/v1/admin*` so no host administrativo (D33, D34)")
        falhas.append(str(e))

    print()
    if falhas_autoteste:
        print("O PORTAO ESTA CEGO:")
        for f in falhas_autoteste:
            print(f"  - {f}")
    if falhas:
        print("Divergencia entre a borda e o contrato:")
        for f in falhas:
            print(f"  - {f}")
    if falhas_autoteste or falhas:
        return 1
    print("APROVADO")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
