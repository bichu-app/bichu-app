#!/usr/bin/env python3
"""Porta publicada e URL base precisam concordar. BICHUS-211.

O `compose.yaml` documenta este acordo num comentario desde 17/09:

    `make up PORTA=3100` troca porta e URL base juntas -- trocar so uma faz o
    app gerar link para uma porta que nao responde.

Comentario nao reprova nada. Quem troca so o `.env` para sair do
`port is already allocated` ganha um servico que SOBE, uma sonda que PASSA, e
todo link de tag e de e-mail apontando para uma porta muda. Isso e pior do que
nao subir, porque nao falha na hora: falha no telefone de quem leu o QR, e o
que o QR guarda nao se corrige depois (ADR-0004).

Este portao le a configuracao RENDERIZADA pelo proprio compose
(`docker compose config`), e nao o `compose.yaml` cru. E deliberado: o que
importa nao e o texto do arquivo, e o resultado da interpolacao do `.env`, do
ambiente exportado pelo Makefile e dos padroes `${VAR:-...}` -- e isso so o
compose sabe fazer. Conferir o YAML cru seria o atalho que parece equivalente e
nao e: ele passaria com o `.env` errado, que e justamente o caso desta issue.

O que se exige, por grupo de URL:

  aplicacao  PUBLIC_BASE_URL, TAG_BASE_URL, WEB_BASE_URL, API_BASE_URL (api)
             e PUBLIC_BASE_URL (edge)
  midia      MEDIA_PUBLIC_BASE_URL (api e edge) e MINIO_SERVER_URL (objeto)

  1. Dentro de cada grupo, MESMO host e MESMA porta em todas as variaveis.
  2. Os dois grupos usam o MESMO host (o `HOST=` do Makefile move tudo junto).
  3. A porta de cada grupo e publicada pela borda.
  4. Publicada e interna sao o MESMO numero (o Caddy escuta na porta que esta
     na URL; `3100:3000` publicaria endereco que o servidor nao atende). A
     unica isenta e a de TLS, que mapeia `PORTA_TLS:443` de proposito.
  5. Toda porta publicada e reivindicada por um dos grupos. Porta publicada que
     nenhuma URL cita e superficie aberta que ninguem declarou.
  6. Se o host nao e local, a borda publica em 0.0.0.0. Preso no loopback, o
     endereco existe, responde do laptop e NAO responde do segundo aparelho --
     que e o unico motivo de `HOST=` existir (secao 3.10).

`--autoteste` roda o verificador contra as iscas guardadas em `iscas/` e exige
que cada uma reprove pelo motivo dela. Sem isso, este arquivo valeria por
confianca no dia em que foi escrito.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

PADRAO_DE_ESQUEMA = {"http": 80, "https": 443}
LOCAIS = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}

GRUPOS: dict[str, list[tuple[str, str]]] = {
    "aplicacao": [
        ("api", "PUBLIC_BASE_URL"),
        ("api", "TAG_BASE_URL"),
        ("api", "WEB_BASE_URL"),
        ("api", "API_BASE_URL"),
        ("edge", "PUBLIC_BASE_URL"),
    ],
    "midia": [
        ("api", "MEDIA_PUBLIC_BASE_URL"),
        ("edge", "MEDIA_PUBLIC_BASE_URL"),
        ("objeto", "MINIO_SERVER_URL"),
    ],
}


class Reprovacao(Exception):
    pass


def _porta_da_url(url: str) -> tuple[str, int]:
    partes = urlsplit(url)
    if partes.scheme not in PADRAO_DE_ESQUEMA:
        raise Reprovacao(f"esquema {partes.scheme!r} nao suportado em {url!r}")
    if not partes.hostname:
        raise Reprovacao(f"URL sem host: {url!r}")
    return partes.hostname, partes.port or PADRAO_DE_ESQUEMA[partes.scheme]


def _publicadas(config: dict) -> list[dict]:
    borda = config.get("services", {}).get("edge")
    if borda is None:
        raise Reprovacao("o servico `edge` nao existe na configuracao renderizada")
    portas = borda.get("ports") or []
    if not portas:
        raise Reprovacao("o servico `edge` nao publica nenhuma porta")
    normalizadas = []
    for p in portas:
        normalizadas.append({
            "alvo": int(p["target"]),
            "publicada": int(p["published"]),
            "host_ip": p.get("host_ip") or "0.0.0.0",
        })
    return normalizadas


def _coletar(config: dict) -> dict[str, list[tuple[str, str, str, int]]]:
    servicos = config.get("services", {})
    coletado: dict[str, list[tuple[str, str, str, int]]] = {}
    for grupo, variaveis in GRUPOS.items():
        achadas = []
        for servico, nome in variaveis:
            s = servicos.get(servico)
            if s is None:
                continue
            valor = (s.get("environment") or {}).get(nome)
            if valor is None:
                continue
            host, porta = _porta_da_url(valor)
            achadas.append((servico, nome, host, porta))
        if not achadas:
            raise Reprovacao(
                f"nenhuma variavel do grupo `{grupo}` foi encontrada na configuracao. "
                "Uma verificacao que nao consegue verificar reprova, nunca aprova"
            )
        coletado[grupo] = achadas
    return coletado


def conferir(config: dict) -> list[str]:
    """Devolve a lista de motivos de reprovacao. Lista vazia e aprovacao."""
    faltas: list[str] = []
    publicadas = _publicadas(config)
    coletado = _coletar(config)

    # 1. dentro do grupo, host e porta identicos em todas as variaveis
    resumo: dict[str, tuple[str, int]] = {}
    for grupo, achadas in coletado.items():
        distintos = {(h, p) for _, _, h, p in achadas}
        if len(distintos) > 1:
            detalhe = "; ".join(f"{sv}.{nm}={h}:{pt}" for sv, nm, h, pt in achadas)
            faltas.append(f"grupo `{grupo}`: as URLs base discordam entre si -> {detalhe}")
            continue
        resumo[grupo] = next(iter(distintos))

    if len(resumo) < len(coletado):
        return faltas

    # 2. os dois grupos no mesmo host
    hosts = {h for h, _ in resumo.values()}
    if len(hosts) > 1:
        faltas.append(
            "aplicacao e midia estao em hosts diferentes "
            f"({', '.join(sorted(hosts))}); `HOST=` move os dois juntos"
        )

    # Indexado pela porta PUBLICADA, que e a que aparece na URL base. Indexar
    # pela interna faria o mapeamento cruzado cair na regra 3 e ser reportado
    # como "a borda nao publica", que aponta para o lugar errado.
    por_publicada = {p["publicada"]: p for p in publicadas}
    reivindicadas: set[int] = set()

    for grupo, (host, porta) in resumo.items():
        # 3. a porta do grupo e publicada pela borda
        p = por_publicada.get(porta)
        if p is None:
            publicadas_txt = ", ".join(f"{q['publicada']}:{q['alvo']}" for q in publicadas)
            faltas.append(
                f"grupo `{grupo}`: a URL base aponta para a porta {porta} e a borda nao a "
                f"publica (publicadas: {publicadas_txt}). "
                "Link gerado para porta que nao responde e o defeito que este portao existe para pegar"
            )
            continue
        reivindicadas.add(porta)
        # 4. publicada e interna sao o mesmo numero, fora a de TLS
        if p["alvo"] != 443 and p["publicada"] != p["alvo"]:
            faltas.append(
                f"grupo `{grupo}`: mapeamento cruzado {p['publicada']}:{p['alvo']}. "
                "O Caddy escuta na porta que esta na URL base, entao publicada e interna "
                "precisam ser o mesmo numero"
            )
        # 6. host nao local exige 0.0.0.0
        if host not in LOCAIS and p["host_ip"] not in ("0.0.0.0", "::"):
            faltas.append(
                f"grupo `{grupo}`: a URL base usa o host {host} e a porta {porta} esta "
                f"publicada so em {p['host_ip']}. Do laptop responde, do segundo aparelho nao"
            )

    # 5. porta publicada que nenhuma URL reivindica
    for p in publicadas:
        if p["alvo"] == 443:
            continue
        if p["publicada"] not in reivindicadas:
            faltas.append(
                f"a borda publica {p['publicada']}:{p['alvo']} e nenhuma URL base a cita. "
                "Ou falta a variavel, ou a porta sobra"
            )

    return faltas


def renderizar(raiz: Path, perfil: str) -> dict:
    cmd = ["docker", "compose", "--profile", perfil, "config", "--format", "json"]
    try:
        r = subprocess.run(cmd, cwd=raiz, capture_output=True, text=True, timeout=180, check=False)
    except FileNotFoundError:
        raise Reprovacao(
            "`docker` nao esta no PATH. Este portao le a configuracao renderizada pelo "
            "compose, e sem ele nao ha o que conferir -- verificacao que nao consegue "
            "verificar reprova, nunca aprova"
        ) from None
    if r.returncode != 0:
        raise Reprovacao(
            "`" + " ".join(cmd) + "` falhou:\n" + (r.stderr.strip() or "(sem stderr)")
        )
    return json.loads(r.stdout)


def _relatar(origem: str, faltas: list[str]) -> int:
    if faltas:
        print(f"REPROVADO: {origem}")
        for f in faltas:
            print(f"  - {f}")
        print()
        print("  Nao conserte editando as URLs do `.env`: e assim que nasce o link que")
        print("  nao responde. Troque a porta em `portas.local.mk` (ou `make portas`),")
        print("  que o Makefile deriva as cinco URLs base dos mesmos dois numeros.")
        return 1
    print(f"APROVADO: {origem}")
    return 0


def _resumo_aprovado(config: dict) -> str:
    resumo = []
    for grupo, achadas in _coletar(config).items():
        _, _, host, porta = achadas[0]
        resumo.append(f"{grupo}={host}:{porta}")
    return "porta publicada e URL base de acordo (" + ", ".join(resumo) + ")"


def autoteste(raiz: Path) -> int:
    """Cada isca precisa reprovar; a de controle precisa passar."""
    pasta = raiz / "infra" / "verificacao" / "iscas"
    iscas = sorted(pasta.glob("portas-*.json"))
    if not iscas:
        print(f"REPROVA: nenhuma isca `portas-*.json` em {pasta}. "
              "Portao sem prova negativa guardada vale por confianca, nao por verificacao")
        return 1
    erradas = 0
    print(f"autoteste do portao de portas - {len(iscas)} iscas em {pasta}")
    for isca in iscas:
        deve_passar = isca.name == "portas-deve-passar.json"
        try:
            faltas = conferir(json.loads(isca.read_text(encoding="utf-8")))
        except Reprovacao as e:
            faltas = [str(e)]
        except Exception as e:  # noqa: BLE001 - o portao quebrado tem que APARECER
            # Portao que estoura no meio da isca nao pode derrubar o autoteste
            # com um traceback: o traceback some no log e ninguem liga a falha a
            # ESTA isca. O erro vira o motivo da isca, com o nome dela na linha.
            faltas = [f"o portao estourou ao conferir esta isca: {type(e).__name__}: {e}"]
        reprovou = bool(faltas)
        ok = (not reprovou) if deve_passar else reprovou
        esperado = "APROVAR" if deve_passar else "REPROVAR"
        print(f"  [{'ok  ' if ok else 'ERRO'}] {isca.name:<46} devia {esperado}")
        if reprovou:
            print(f"           motivo: {faltas[0]}")
        if not ok:
            erradas += 1
    if erradas:
        print(f"\nREPROVADO: {erradas} isca(s) nao se comportaram como deviam. "
              "O portao parou de enxergar o que ele existe para enxergar")
        return 1
    print("\nAPROVADO: as iscas reprovaram e a de controle passou")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--raiz", default=".", help="raiz do repositorio (padrao: .)")
    p.add_argument("--perfil", default="dev", help="perfil do compose a renderizar (padrao: dev)")
    p.add_argument("--config", help="le uma configuracao ja renderizada, em vez de chamar o docker")
    p.add_argument("--autoteste", action="store_true", help="roda as iscas e exige que reprovem")
    a = p.parse_args(argv[1:])
    raiz = Path(a.raiz).resolve()

    if a.autoteste:
        return autoteste(raiz)

    try:
        if a.config:
            origem = a.config
            config = json.loads(Path(a.config).read_text(encoding="utf-8"))
        else:
            origem = f"docker compose --profile {a.perfil} config, em {raiz}"
            config = renderizar(raiz, a.perfil)
        faltas = conferir(config)
    except Reprovacao as e:
        print(f"REPROVADO: {e}")
        return 1
    codigo = _relatar(origem, faltas)
    if codigo == 0:
        print("  " + _resumo_aprovado(config))
    return codigo


if __name__ == "__main__":
    sys.exit(main(sys.argv))
