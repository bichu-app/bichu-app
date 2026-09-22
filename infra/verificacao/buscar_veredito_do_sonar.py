#!/usr/bin/env python3
"""Busca o veredito do portao de qualidade do SonarCloud. NAO julga nada.

docs/07-devops.md secao 8.4.

=========================================================================
POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NAO DECIDE
=========================================================================
Ate 22/09/2026 o veredito vinha da acao `SonarSource/sonarqube-quality-gate-
action@v1.2.1`, marcada `continue-on-error: true`, e quem decidia lia
`steps.veredito.outcome`.

Medido no run 35750052587 da `main`: a acao saiu com **HTTP 403** -- o veredito
nunca foi obtido -- e o passo seguinte imprimiu "o portao de qualidade do
SonarCloud REPROVOU" e deixou a dispensa `sonarcloud-veredito` engolir a
reprovacao. O job ficou VERDE com uma indisponibilidade do SonarCloud.

A causa e de forma, e nao de texto: `steps.<id>.outcome` so assume `success`,
`failure`, `skipped` e `cancelled`. "Nao consegui falar com o Sonar" e "o portao
reprovou de verdade" colapsam no MESMO `failure`. O ramo que o workflow tinha
escrito para o primeiro caso -- "nao foi possivel obter o veredito... Verificacao
que nao consegue verificar reprova, nunca aprova" -- era INALCANCAVEL. Estava
escrito, estava certo, e nunca executou.

A correcao separa BUSCAR de JULGAR:

  - este arquivo consulta o servico e grava um ENVELOPE com o que aconteceu:
    obteve ou nao, o codigo HTTP, o erro de transporte, o veredito textual;
  - `verificar_veredito_do_sonar.py` le o envelope e decide, com vocabulario
    fechado: palavra que ele nao reconhece REPROVA, e so o veredito negativo
    de verdade e dispensavel.

ESTE PASSO NAO PODE REPROVAR A ESTEIRA POR SI, E ISSO E DELIBERADO. Se ele
saisse com 1 no 403, o job cairia com uma mensagem generica e o juizo -- que e
quem sabe dizer "o Sonar nao disse nada" com o codigo HTTP na frase -- nunca
rodaria. Ele sai com 0 sempre que CONSEGUIU GRAVAR o envelope, e so com 1 quando
nem isso foi possivel; nesse caso o passo cai e o job cai junto, que e o
desfecho correto.

Nao ha `continue-on-error` em lugar nenhum desta esteira depois desta mudanca, e
`verificar_consulta_externa.py`, no job `rapidos`, impede que ele volte.
"""
from __future__ import annotations

import argparse
import http.server
import json
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RELATORIO_PADRAO = Path(".scannerwork/report-task.txt")
TEMPO_DE_CADA_PEDIDO = 30
PRAZO_DA_ANALISE = 300
INTERVALO = 5

# O vocabulario do campo `task.status` da API de fila do SonarCloud. Terminou
# em SUCCESS e ha veredito para buscar; terminou nas outras duas e NAO ha --
# que e um "nao obtive", e nao um "obtive e e negativo".
TAREFA_TERMINOU = {"SUCCESS", "FAILED", "CANCELED"}


def pedir(url: str, token: str) -> tuple[int | None, bytes, str | None]:
    """(codigo HTTP, corpo, erro de transporte).

    4xx e 5xx voltam como CODIGO, e nao como excecao: o codigo e justamente a
    informacao que faltava no defeito de hoje. So falha de transporte -- DNS,
    conexao recusada, TLS, prazo esgotado -- volta em `erro`.
    """
    pedido = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "User-Agent": "bichu-verificacao-sonar/1",
        },
    )
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_DE_CADA_PEDIDO) as resposta:
            return resposta.status, resposta.read(1 << 20), None
    except urllib.error.HTTPError as e:
        return e.code, e.read(1 << 20), None
    except Exception as e:  # transporte
        return None, b"", f"{type(e).__name__}: {e}"


def nao_obtive(motivo: str, **extra) -> dict:
    envelope = {"obtido": False, "motivo": motivo}
    envelope.update(extra)
    return envelope


def ler_relatorio(caminho: Path) -> dict:
    """As chaves que o scanner publica em `.scannerwork/report-task.txt`."""
    if not caminho.is_file():
        return {}
    dados: dict = {}
    for linha in caminho.read_text(encoding="utf-8").splitlines():
        if "=" in linha:
            chave, valor = linha.split("=", 1)
            dados[chave.strip()] = valor.strip()
    return dados


def corpo_como_json(corpo: bytes) -> tuple[dict | None, str]:
    trecho = corpo[:400].decode("utf-8", "replace").replace("\n", " ")
    try:
        dados = json.loads(corpo.decode("utf-8"))
    except Exception as e:
        return None, f"a resposta nao e JSON ({e}): {trecho}"
    if not isinstance(dados, dict):
        return None, f"a resposta e JSON mas nao e um objeto: {trecho}"
    return dados, trecho


def buscar(relatorio: Path, token: str, prazo: int) -> dict:
    dados = ler_relatorio(relatorio)
    if not dados:
        return nao_obtive(
            f"{relatorio} nao existe ou esta vazio. O scanner nao publicou a analise, "
            "entao nao ha veredito para buscar -- e nao ha como afirmar nada sobre a "
            "qualidade deste commit"
        )

    url_da_tarefa = dados.get("ceTaskUrl")
    servidor = (dados.get("serverUrl") or "").rstrip("/")
    painel = dados.get("dashboardUrl", "")
    if not url_da_tarefa or not servidor:
        return nao_obtive(
            f"{relatorio} nao traz `ceTaskUrl` e/ou `serverUrl`. A forma do relatorio do "
            f"scanner mudou e esta leitura ficou cega. Chaves lidas: {sorted(dados)}",
            painel=painel,
        )

    # 1. A analise na fila do servidor. Enquanto ela nao terminar nao existe
    #    `analysisId`, e sem ele nao ha o que perguntar.
    limite = time.monotonic() + prazo
    while True:
        codigo, corpo, erro = pedir(url_da_tarefa, token)
        if erro is not None:
            return nao_obtive(
                f"a consulta a fila de analise falhou no transporte: {erro}", painel=painel
            )
        if codigo != 200:
            trecho = corpo[:400].decode("utf-8", "replace").replace("\n", " ")
            return nao_obtive(
                f"a fila de analise respondeu HTTP {codigo} em {url_da_tarefa}: {trecho}",
                status_http=codigo,
                painel=painel,
            )
        dados_da_tarefa, trecho = corpo_como_json(corpo)
        if dados_da_tarefa is None:
            return nao_obtive(f"a fila de analise: {trecho}", status_http=codigo, painel=painel)

        tarefa = dados_da_tarefa.get("task")
        if not isinstance(tarefa, dict) or "status" not in tarefa:
            return nao_obtive(
                f"a fila de analise respondeu 200 sem `task.status`: {trecho}",
                status_http=codigo,
                painel=painel,
            )
        estado = str(tarefa["status"]).upper()
        if estado in TAREFA_TERMINOU:
            break
        if time.monotonic() >= limite:
            return nao_obtive(
                f"a analise ainda estava em `{estado}` depois de {prazo}s. Sem analise "
                "terminada nao existe veredito, e esperar mais nao e decidir",
                status_http=codigo,
                painel=painel,
            )
        time.sleep(INTERVALO)

    if estado != "SUCCESS":
        return nao_obtive(
            f"a analise terminou em `{estado}` no servidor. Ela NAO produziu veredito: "
            "isto e o SonarCloud nao tendo respondido, e nao o portao tendo reprovado",
            status_http=200,
            painel=painel,
        )

    id_da_analise = tarefa.get("analysisId")
    if not id_da_analise:
        return nao_obtive(
            "a analise terminou em SUCCESS e o servidor nao devolveu `analysisId`. "
            "Sem ele nao da para perguntar pelo veredito DESTA analise",
            status_http=200,
            painel=painel,
        )

    # 2. O veredito propriamente dito. Aqui e onde o 403 de hoje aparecia, e
    #    onde ele passa a aparecer NOMEADO.
    url = f"{servidor}/api/qualitygates/project_status?" + urllib.parse.urlencode(
        {"analysisId": id_da_analise}
    )
    codigo, corpo, erro = pedir(url, token)
    if erro is not None:
        return nao_obtive(
            f"a consulta ao portao de qualidade falhou no transporte: {erro}", painel=painel
        )
    if codigo != 200:
        trecho = corpo[:400].decode("utf-8", "replace").replace("\n", " ")
        return nao_obtive(
            f"o portao de qualidade respondeu HTTP {codigo}. Um {codigo} nao e um "
            f"veredito: e a ausencia dele. Resposta: {trecho}",
            status_http=codigo,
            painel=painel,
        )
    dados_do_portao, trecho = corpo_como_json(corpo)
    if dados_do_portao is None:
        return nao_obtive(f"o portao de qualidade: {trecho}", status_http=codigo, painel=painel)

    estado_do_portao = dados_do_portao.get("projectStatus")
    if not isinstance(estado_do_portao, dict) or "status" not in estado_do_portao:
        return nao_obtive(
            f"o portao de qualidade respondeu 200 sem `projectStatus.status`: {trecho}",
            status_http=codigo,
            painel=painel,
        )

    # TODAS as condicoes, e nao so as que reprovaram. "Reprovou porque a
    # cobertura e 74%" ja foi dito neste projeto sobre um portao que tem seis
    # condicoes, e pode estar simplesmente errado: quem le precisa ver a lista
    # inteira, com o valor real de cada uma, e enxergar qual delas esta em
    # ERROR. Guardar so as ruins obriga a ir ao painel para saber o resto, e ao
    # painel ninguem vai.
    condicoes = [
        {
            "metrica": c.get("metricKey"),
            "valor": c.get("actualValue"),
            "comparador": c.get("comparator"),
            "piso": c.get("errorThreshold"),
            "estado": c.get("status"),
        }
        for c in estado_do_portao.get("conditions", [])
        if isinstance(c, dict)
    ]
    # O periodo de codigo novo vem na mesma resposta, e sem ele a lista acima
    # nao se interpreta: `new_coverage` e uma fracao sobre um recorte, e saber
    # QUAL recorte e a diferenca entre "o projeto esta mal coberto" e "a linha
    # de base ainda nao existe".
    periodo = estado_do_portao.get("period") or estado_do_portao.get("newCodePeriod") or {}
    return {
        "obtido": True,
        "status_http": codigo,
        "veredito": str(estado_do_portao["status"]),
        "condicoes": condicoes,
        "periodo_de_codigo_novo": periodo if isinstance(periodo, dict) else {},
        "painel": painel,
    }


# =========================================================================
# O AUTOTESTE DA BUSCA
# =========================================================================
# Esta metade nao julga nada, mas ela TRADUZ: de codigo HTTP e corpo para
# `obtido`, `status_http`, `motivo` e `veredito`. Se a traducao cegar -- um 403
# virando `obtido: true`, por exemplo -- o juizo do passo seguinte aprova com
# toda a razao, porque o envelope mentiu para ele. O juizo tem as iscas dele; a
# traducao precisa das suas.
#
# Um SonarCloud de mentira sobe em 127.0.0.1 e responde cada caso. Nao ha rede
# envolvida, leva milissegundos, e por isso este autoteste roda no job
# `rapidos`, e nao aqui no job `sonar` -- que so comeca depois do `npm ci`.
#
# Cada caso isola UMA traducao e declara o que o envelope precisa carregar.
#
# A ULTIMA COLUNA NAO E ZELO, E FOI MEDIDA. A primeira versao destes casos so
# conferia `obtido`, `status_http` e `veredito` -- e passava com a leitura do
# codigo HTTP DESLIGADA. Sem ela, o 403 escorre para a conferencia seguinte, nao
# acha `projectStatus.status` no corpo de erro, e produz um envelope com
# exatamente os mesmos tres campos. O autoteste ficava verde com a regra que ele
# existia para testar apagada, porque outro caminho recolhia o caso. Agora cada
# caso exige o FRAGMENTO do motivo que so o seu caminho escreve.
CASOS_DA_BUSCA: list[tuple[str, bool, int | None, str | None, str, str]] = [
    # (modo do servidor, obtido, status_http, veredito, fragmento do motivo, o que o caso isola)
    ("verde", True, 200, "OK", "", "200 com `OK`: o veredito chega inteiro"),
    ("vermelho", True, 200, "ERROR", "", "200 com `ERROR`: o veredito NEGATIVO chega como veredito"),
    ("sem-portao", True, 200, "NONE", "", "200 com `NONE`: a palavra chega crua, quem julga e o juizo"),
    ("403", False, 403, None, "Um 403 nao e um veredito",
     "O DEFEITO DE HOJE: 403 e ausencia de veredito, nunca `OK`"),
    ("500", False, 500, None, "Um 500 nao e um veredito",
     "500 do servidor: ausencia de veredito"),
    ("analise-falhou", False, 200, None, "terminou em `FAILED`",
     "200 com a analise em FAILED: nao ha veredito para buscar"),
    ("corpo-estranho", False, 200, None, "sem `projectStatus.status`",
     "200 sem `projectStatus.status`: a forma mudou e a leitura cegou"),
    ("sem-relatorio", False, None, None, "nao existe ou esta vazio",
     "o scanner nao publicou `report-task.txt`"),
]


def _servidor_de_mentira(modo: str):
    class Alca(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def responder(self, codigo: int, corpo: bytes) -> None:
            self.send_response(codigo)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(corpo)

        def do_GET(self):  # noqa: N802 (nome exigido pela biblioteca)
            if self.path.startswith("/api/ce/task"):
                tarefa = (
                    {"task": {"status": "FAILED"}}
                    if modo == "analise-falhou"
                    else {"task": {"status": "SUCCESS", "analysisId": "AX-da-isca"}}
                )
                return self.responder(200, json.dumps(tarefa).encode())
            if self.path.startswith("/api/qualitygates/project_status"):
                if modo in ("403", "500"):
                    return self.responder(int(modo), b'{"errors":[{"msg":"da isca"}]}')
                if modo == "corpo-estranho":
                    return self.responder(200, b'{"algo":"outro"}')
                palavra = {"verde": "OK", "vermelho": "ERROR", "sem-portao": "NONE"}[modo]
                return self.responder(
                    200, json.dumps({"projectStatus": {"status": palavra, "conditions": []}}).encode()
                )
            return self.responder(404, b"{}")

    servidor = http.server.HTTPServer(("127.0.0.1", 0), Alca)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    return servidor


def autoteste() -> int:
    falhas = 0
    print(f"autoteste da busca do veredito do SonarCloud ({len(CASOS_DA_BUSCA)} casos)")
    for modo, obtido, status, veredito, fragmento, descricao in CASOS_DA_BUSCA:
        servidor = _servidor_de_mentira("verde" if modo == "sem-relatorio" else modo)
        base = f"http://127.0.0.1:{servidor.server_port}"
        pasta = Path(tempfile.mkdtemp(prefix="isca-sonar-"))
        relatorio = pasta / "report-task.txt"
        if modo != "sem-relatorio":
            relatorio.write_text(
                f"projectKey=isca\nserverUrl={base}\nceTaskId=AX\n"
                f"ceTaskUrl={base}/api/ce/task?id=AX\ndashboardUrl={base}/dashboard\n",
                encoding="utf-8",
            )
        try:
            envelope = buscar(relatorio, "token-da-isca", prazo=2)
        finally:
            servidor.shutdown()
            servidor.server_close()

        visto = (envelope.get("obtido"), envelope.get("status_http"), envelope.get("veredito"))
        if visto != (obtido, status, veredito):
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}")
            print(f"               esperado: obtido={obtido} http={status} veredito={veredito}")
            print(f"               veio:     obtido={visto[0]} http={visto[1]} veredito={visto[2]}")
            print(f"               motivo:   {envelope.get('motivo')}")
            continue
        motivo = str(envelope.get("motivo") or "").strip()
        if not obtido and not motivo:
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}: `obtido: false` SEM motivo. Quem le o resumo "
                  "precisa distinguir 'o Sonar disse nao' de 'o Sonar nao disse nada'")
            continue
        if fragmento and fragmento not in motivo:
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}: os campos batem e o motivo e de OUTRO caminho")
            print(f"               esperado conter: {fragmento}")
            print(f"               veio:            {motivo[:140]}")
            continue
        print(f"  [    ok    ] {descricao}")

    if falhas:
        print(
            f"\nREPROVADO: {falhas} caso(s). A traducao de HTTP para envelope cegou, e um "
            "envelope que mente faz o juizo do passo seguinte aprovar com toda a razao"
        )
        return 1
    naos = sum(1 for c in CASOS_DA_BUSCA if not c[1])
    print(f"\nautoteste APROVADO: {naos} caso(s) viram `obtido: false` com motivo, e nenhum "
          "deles vira veredito")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--relatorio", default=str(RELATORIO_PADRAO))
    p.add_argument("--token", default="", help="SONAR_TOKEN")
    p.add_argument("--prazo", type=int, default=PRAZO_DA_ANALISE)
    p.add_argument("--envelope", help="onde gravar o envelope JSON")
    p.add_argument("--autoteste", action="store_true", help="roda as iscas e sai")
    a = p.parse_args(argv[1:])

    if a.autoteste:
        return autoteste()
    if not a.envelope:
        p.error("fora do autoteste, --envelope e obrigatorio")

    if a.token.strip():
        envelope = buscar(Path(a.relatorio), a.token.strip(), a.prazo)
    else:
        # O passo `o token existe?` ja reprova por isto. Aqui o envelope diz o
        # mesmo, para o caso de alguem reordenar os passos: ausencia de
        # credencial e "nao consegui perguntar", nunca "perguntei e esta bom".
        envelope = nao_obtive("SONAR_TOKEN vazio: nao ha como consultar o SonarCloud")

    destino = Path(a.envelope)
    try:
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(json.dumps(envelope, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as e:
        # Unico caminho de saida diferente de zero: sem envelope nao ha o que
        # julgar, e o passo precisa derrubar o job em vez de seguir em frente.
        print(f"::error::nao consegui gravar o envelope em {destino}: {e}")
        return 1

    print(json.dumps(envelope, ensure_ascii=False, indent=2))
    print(f"envelope gravado em {destino}. Quem decide e o passo seguinte.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
