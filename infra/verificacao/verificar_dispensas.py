#!/usr/bin/env python3
"""Le .github/quality-gates.yml e reprova dispensa vencida.

docs/07-devops.md secao 5.3. Dispensa que nao expira vira permanente, e portao
permanentemente dispensado e portao que nao existe -- com a agravante de
aparecer na lista como se existisse.
"""
from __future__ import annotations
import datetime as _dt, re, sys
from pathlib import Path

def main(argv: list[str]) -> int:
    caminho = Path(argv[1]) if len(argv) > 1 else Path(".github/quality-gates.yml")
    if not caminho.is_file():
        print(f"REPROVA: {caminho} nao encontrado. Sem ele nao da para saber o que esta dispensado")
        return 1
    hoje = _dt.date.today()
    atual: dict = {}
    dispensas: list[dict] = []
    for n, bruta in enumerate(caminho.read_text(encoding="utf-8").splitlines(), 1):
        linha = bruta.split("#", 1)[0].rstrip()
        if not linha.strip() or linha.strip() == "dispensas:":
            continue
        if m := re.fullmatch(r"\s*-\s*(\w+):\s*(.+)", linha):
            atual = {m.group(1): m.group(2).strip().strip('"')}
            dispensas.append(atual)
        elif m := re.fullmatch(r"\s+(\w+):\s*(.+)", linha):
            if not atual:
                print(f"REPROVA: {caminho}:{n}: campo sem dispensa: {bruta!r}")
                return 1
            atual[m.group(1)] = m.group(2).strip().strip('"')
        else:
            print(f"REPROVA: {caminho}:{n}: fora do formato: {bruta!r}")
            return 1

    vencidas = []
    print(f"dispensas de portao - {hoje.isoformat()}")
    for d in dispensas:
        for obrig in ("portao", "motivo", "responsavel", "vence_em"):
            if obrig not in d:
                print(f"REPROVA: dispensa {d} sem `{obrig}`")
                return 1
        try:
            vence = _dt.date.fromisoformat(d["vence_em"])
        except ValueError as e:
            print(f"REPROVA: dispensa de `{d['portao']}` com data invalida: {e}")
            return 1
        restam = (vence - hoje).days
        estado = "VENCIDA" if restam < 0 else f"{restam}d"
        print(f"  [{estado:>8}] {d['portao']:<14} {d['responsavel']:<8} {d['motivo'][:60]}")
        if restam < 0:
            vencidas.append(d)

    if vencidas:
        print()
        print(f"REPROVADO: {len(vencidas)} dispensa(s) vencida(s).")
        for d in vencidas:
            print(f"  - `{d['portao']}` venceu em {d['vence_em']}, responsavel {d['responsavel']}.")
            print("    Ou o insumo chegou e a dispensa sai, ou nao chegou e isso precisa ser dito.")
        return 1
    print("\nAPROVADO: nenhuma dispensa vencida")
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv))
