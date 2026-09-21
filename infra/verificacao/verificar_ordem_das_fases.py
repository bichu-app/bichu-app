#!/usr/bin/env python3
"""Criterio 14 da BICHUS-154: a ordem das fases, conferida no HISTORICO.

> nao existe NENHUM commit em que o codigo tenha 16 caracteres e o resumo ainda
> seja SHA-256 sem chave

Este e o unico criterio daquela historia que **nao se prova olhando o resultado
final**. O estado final correto e alcancavel por dois caminhos, e um deles passa
por um commit em que codigos de 75 bits ficam guardados sob SHA-256 sem sal
(ADR-0004, Emenda 1, secao 12.1). Um vazamento dentro dessa janela nao e
reparavel por entrega nenhuma depois, porque os codigos vazados continuam
corretos para sempre. E nao se conserta: o unico reparo seria reescrever
historico.

## Por que isto NAO esta na esteira como portao permanente

Porque ele so tem o que verificar enquanto a mudanca esta sendo entregue. Depois
que ela entra, todo commit novo tem 16 caracteres e HMAC, e o portao passaria
para sempre sem nunca poder reprovar -- que e exatamente o "verde que nao
verifica nada" que este projeto ja pagou caro para aprender a nao ter. Ele e
ferramenta de REVISAO, e roda com o intervalo na mao:

    python3 infra/verificacao/verificar_ordem_das_fases.py <base>..<ponta>

O autoteste abaixo roda SEMPRE, antes de qualquer conferencia, e ele e o que
impede esta ferramenta de virar uma frase: ele monta um repositorio temporario
com a ordem ERRADA e exige que a conferencia reprove. Se ela nao reprovar, o
script morre sem nem olhar o intervalo pedido.
"""
from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ARQUIVO_DO_CODIGO = "src/modules/tags/domain/tag-code.ts"
ARQUIVO_DO_RESUMO = "src/shared/crypto/digest.ts"

TAMANHO = re.compile(r"^export const TAMANHO_DO_CODIGO\s*=\s*(\d+)", re.M)
CORPO_DO_RESUMO = re.compile(
    r"export function hashDoCodigoDaTag\b.*?\n}", re.S
)


def _git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True, text=True, check=True,
    ).stdout


def _conteudo(repo: Path, commit: str, caminho: str) -> str | None:
    try:
        return _git(repo, "show", f"{commit}:{caminho}")
    except subprocess.CalledProcessError:
        return None


def _estado(repo: Path, commit: str) -> tuple[int | None, str]:
    """(tamanho do codigo, funcao de resumo) naquele commit."""
    codigo = _conteudo(repo, commit, ARQUIVO_DO_CODIGO)
    tamanho = None
    if codigo is not None:
        achado = TAMANHO.search(codigo)
        if achado is not None:
            tamanho = int(achado.group(1))

    resumo = _conteudo(repo, commit, ARQUIVO_DO_RESUMO)
    funcao = "ausente"
    if resumo is not None:
        corpo = CORPO_DO_RESUMO.search(resumo)
        if corpo is not None:
            texto = corpo.group(0)
            if "createHmac" in texto:
                funcao = "HMAC"
            elif "createHash" in texto:
                funcao = "SHA-256"
            else:
                funcao = "desconhecida"
    return tamanho, funcao


def conferir(repo: Path, intervalo: str, falar: bool = True) -> list[str]:
    """Devolve a lista de commits reprovados. Vazia significa aprovado."""
    commits = _git(repo, "rev-list", "--reverse", intervalo).split()
    if not commits:
        raise SystemExit(
            f"intervalo `{intervalo}` nao tem commit nenhum. Conferencia que nao "
            "consegue conferir REPROVA, em vez de dizer que esta tudo bem."
        )

    reprovados: list[str] = []
    for commit in commits:
        tamanho, funcao = _estado(repo, commit)
        curto = _git(repo, "rev-parse", "--short", commit).strip()
        ruim = tamanho == 16 and funcao == "SHA-256"
        if ruim:
            reprovados.append(curto)
        if falar:
            veredito = (
                "*** REPROVADO: 75 bits sob SHA-256 sem chave ***" if ruim
                else f"ok ({tamanho} caracteres sob {funcao})"
            )
            print(f"  {curto}  {veredito}")
    return reprovados


def autoteste() -> None:
    """Monta a ordem ERRADA num repositorio descartavel e exige a reprovacao."""
    with tempfile.TemporaryDirectory() as bruto:
        repo = Path(bruto)
        _git(repo, "init", "-q", "-b", "principal")
        _git(repo, "config", "user.email", "autoteste@invalid")
        _git(repo, "config", "user.name", "autoteste")

        codigo = repo / ARQUIVO_DO_CODIGO
        resumo = repo / ARQUIVO_DO_RESUMO
        codigo.parent.mkdir(parents=True, exist_ok=True)
        resumo.parent.mkdir(parents=True, exist_ok=True)

        def gravar(tamanho: int, funcao: str) -> None:
            codigo.write_text(f"export const TAMANHO_DO_CODIGO = {tamanho};\n")
            resumo.write_text(
                "export function hashDoCodigoDaTag(codigo: TagCodeCanonical): Buffer {\n"
                f"  return {funcao}('sha256').update(codigo, 'utf8').digest();\n"
                "}\n"
            )
            _git(repo, "add", "-A")
            _git(repo, "commit", "-q", "-m", f"{tamanho} sob {funcao}")

        gravar(26, "createHash")   # o estado de hoje
        base = _git(repo, "rev-parse", "HEAD").strip()
        gravar(16, "createHash")   # A JANELA: e este commit que precisa reprovar
        gravar(16, "createHmac")   # o estado final, que sozinho parece correto

        reprovados = conferir(repo, f"{base}..HEAD", falar=False)
        if not reprovados:
            raise SystemExit(
                "AUTOTESTE FALHOU: a conferencia aprovou um historico que passa "
                "por 16 caracteres sob SHA-256 sem chave. Enquanto for assim, "
                "esta ferramenta nao prova nada e nao deve ser usada como prova."
            )

        # E a contraprova: a ordem CERTA precisa passar, senao o portao so sabe
        # dizer nao e reprovaria qualquer entrega.
        _git(repo, "checkout", "-q", base)
        _git(repo, "checkout", "-q", "-b", "ordem-certa")
        gravar(26, "createHmac")   # Fase 1
        gravar(16, "createHmac")   # Fase 2
        if conferir(repo, f"{base}..HEAD", falar=False):
            raise SystemExit(
                "AUTOTESTE FALHOU: a conferencia reprovou a ordem CORRETA."
            )
    print("  [ok] autoteste: a ordem errada reprova, a ordem certa passa")


def main() -> int:
    intervalo = sys.argv[1] if len(sys.argv) > 1 else "origin/main..HEAD"
    print("ordem das fases (BICHUS-154, criterio 14)")
    autoteste()
    print(f"  intervalo conferido: {intervalo}")
    reprovados = conferir(Path.cwd(), intervalo)
    if reprovados:
        print()
        print("REPROVADO. Commits com 75 bits sob SHA-256 sem chave: "
              + ", ".join(reprovados))
        print("Isto NAO se conserta com um commit novo: os codigos que vazassem "
              "naquela janela continuariam corretos para sempre. O unico reparo "
              "e reescrever o historico antes de ele sair da maquina.")
        return 1
    print()
    print("APROVADO: nenhum commit combina 16 caracteres com SHA-256 sem chave.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
