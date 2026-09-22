#!/usr/bin/env python3
"""Nenhum passo da esteira pode tratar "nao consegui perguntar" como resposta.

=========================================================================
O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
=========================================================================
Run 35750052587 da `main`, 22/09/2026. O passo do veredito do SonarCloud saiu
com HTTP 403 -- o veredito NUNCA FOI OBTIDO -- e o passo seguinte, que lia
`steps.veredito.outcome`, imprimiu "o portao de qualidade REPROVOU" e deixou a
dispensa datada engolir a reprovacao. O job ficou VERDE.

O `ci.yml` tinha um ramo escrito exatamente contra isso ("nao foi possivel obter
o veredito... Verificacao que nao consegue verificar reprova, nunca aprova"), e
ele era INALCANCAVEL: `steps.<id>.outcome` so assume `success`, `failure`,
`skipped` e `cancelled`, entao "o Sonar nao respondeu" e "o Sonar disse nao"
colapsam no mesmo `failure`.

O conserto daquele job esta em `buscar_veredito_do_sonar.py` (busca) e
`verificar_veredito_do_sonar.py` (juizo). ESTE arquivo cuida da CLASSE: ele
impede que a mesma forma volte por qualquer passo de qualquer workflow.

=========================================================================
A REGRA E UMA LISTA DO QUE PODE
=========================================================================
Um passo pode ficar verde sem ter obtido a resposta por exatamente tres
caminhos, e os dois primeiros sao FECHADOS POR CONSTRUCAO -- nao e uma lista que
eu escolhi, e o conjunto inteiro de mecanismos que o GitHub Actions oferece para
ler o destino de um passo sem ler o que ele respondeu:

  1. `continue-on-error: true`. O passo reporta `success` ao job aconteca o que
     acontecer, e o seu destino real vira um enum de quatro valores.
     Permitidos: `false`. So.

  2. `steps.<id>.outcome` e `steps.<id>.conclusion`. Sao os UNICOS contextos de
     estado por passo que a plataforma define, e os dois carregam aquele mesmo
     enum -- em que ignorancia e reprovacao tem o mesmo nome. Permitidos:
     nenhum. Quem precisa do desfecho de uma consulta le o CORPO e o CODIGO
     HTTP que o passo de busca gravou, nao o destino do passo.

  3. `needs.<job>.result` em nivel de passo. E o mesmo enum, um andar acima.
     Permitido em UMA forma reconhecida: dentro de um `case` com ramo padrao
     `*)` que sai com codigo diferente de zero -- a consolidacao do job
     `portao`, que ja recusa `skipped` nominalmente. Qualquer outra forma
     reprova.

O quarto caminho e o shell declarando sucesso por conta propria. Aqui a lista de
permitidos e a do LADO DIREITO de cada `||`:

  - `atribuicao` (`nome=valor`): escolhe um padrao, nao declara o passo verde;
  - `acrescimo` (`echo ... >> arquivo`): completa um arquivo, idem;
  - `falha` (`exit N` com N != 0, `false`, `{ ...; exit N; }`): REPROVA, que e
    o ponto;
  - `condicao`: o `||` de dentro de um cabecalho `if`/`elif`/`while`/`until`
    nao e um caminho de falha, e um OU logico -- `if [ a ] || [ b ]; then`. A
    forma de sucesso continua proibida ali: `if consulta || true; then` torna a
    condicao sempre verdadeira, que e o mesmo defeito com outra roupa;
  - `sucesso` (`true`, `:`, `exit 0`, `{ ...; exit 0; }`) e `set +e`: proibidos,
    EXCETO em passo `if: always()` ou `if: failure()`. A excecao e uma FORMA, e
    nao um nome de passo: um passo que so roda depois de o job ja ter terminado
    de um jeito ou de outro nao e o veredito de nada. Derrubar a pilha e
    imprimir log entram por aqui; um `git show ... || exit 0` no meio de um
    portao, nao;
  - qualquer outra coisa: forma desconhecida REPROVA.

Enumerar as formas ruins envelhece mal -- o que ninguem previu e exatamente a
forma que alguem vai escrever amanha. Os precedentes deste repositorio sao
`verificar_passos_condicionais.py`, que recusa contexto que nao reconhece, e o
portao de registro de rota, que parou de enumerar nomes e passou a perguntar ao
compilador.

=========================================================================
ONDE ELE NAO ALCANCA, DITO EM VOZ ALTA
=========================================================================
Ele le `.github/workflows/*.yml`, e so. Um `|| true` escrito dentro de um script
de `infra/verificacao/` nao passa por aqui. A fronteira e deliberada: aqueles
arquivos tem autoteste proprio com isca guardada, que e a prova que um portao
textual nao da. O que esta classe tem de particular e justamente morar no
workflow, onde nao havia nada olhando.

As iscas de `iscas/consulta-externa/` rodam ANTES dos workflows de verdade, e
cada uma isola UMA regra. Isca que reprova por dois motivos ao mesmo tempo
continua verde no dia em que a regra que ela testava for desligada -- medido
neste repositorio, nao suposto.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
WORKFLOWS = RAIZ / ".github" / "workflows"
ISCAS = Path(__file__).resolve().parent / "iscas" / "consulta-externa"

ABRE_STEPS = re.compile(r"^(\s*)steps:\s*$")
ITEM = re.compile(r"^(\s*)-\s+(\S.*)$")
CHAVE = re.compile(r"^(\s*)([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$")
BLOCO = {"|", ">", "|-", ">-", "|+", ">+"}

ESTADO_DE_PASSO = re.compile(r"\bsteps\.[A-Za-z0-9_-]+\.(outcome|conclusion)\b")
RESULTADO_DE_JOB = re.compile(r"\bneeds\.[A-Za-z0-9_-]+\.result\b")
SET_MAIS_E = re.compile(r"(^|[\s;&|])set\s+\+e\b")

# `if:` que diz respeito ao fim do job, e nao ao veredito de uma consulta.
CONDICOES_DE_ENCERRAMENTO = ("always()", "failure()")


def sem_comentario(linha: str) -> str:
    """Tira o comentario `#` respeitando aspas.

    Ele existe para uma razao concreta: os comentarios do `ci.yml` CITAM
    `steps.veredito.outcome` varias vezes ao explicar o defeito. Um portao que
    lesse o arquivo cru reprovaria a propria explicacao -- e, pior, uma isca
    escrita assim ficaria verde casando com a mencao ao mecanismo dentro de um
    comentario, que foi como uma isca nasceu furada neste repositorio.
    """
    fora, aspa = True, ""
    for i, c in enumerate(linha):
        if fora and c in "'\"":
            fora, aspa = False, c
        elif not fora and c == aspa:
            fora = True
        elif fora and c == "#" and (i == 0 or linha[i - 1] in " \t"):
            return linha[:i]
    return linha


def mascarar(texto: str) -> str:
    """Troca o conteudo entre aspas por `_`, preservando o comprimento.

    Assim as posicoes achadas no texto mascarado valem no texto original, e um
    `||` dentro de uma mensagem nao e lido como operador.
    """
    saida = list(texto)
    fora, aspa = True, ""
    for i, c in enumerate(texto):
        if fora and c in "'\"":
            fora, aspa = False, c
        elif not fora and c == aspa:
            fora = True
        elif not fora:
            saida[i] = "_"
    return "".join(saida)


class Passo:
    def __init__(self, arquivo: str, linha: int) -> None:
        self.arquivo = arquivo
        self.linha = linha
        self.nome = "(sem nome)"
        self.condicao = ""
        self.continue_on_error = ""
        self.run = ""

    def onde(self) -> str:
        return f"{self.arquivo}:{self.linha}: passo `{self.nome}`"

    def e_encerramento(self) -> bool:
        return any(c in self.condicao for c in CONDICOES_DE_ENCERRAMENTO)


def ler_passos(texto: str, nome_do_arquivo: str) -> list[Passo]:
    """Os passos de todos os jobs, com `if:`, `continue-on-error:` e `run:`.

    A separacao entre passo e job e por INDENTACAO, como em
    `verificar_passos_condicionais.py`: tudo mais fundo que a linha `steps:`
    pertence a um passo.
    """
    linhas = texto.splitlines()
    passos: list[Passo] = []
    indent_steps: int | None = None
    indent_item: int | None = None
    atual: Passo | None = None
    chave_pendente: str | None = None
    indent_chave = 0
    i = 0

    while i < len(linhas):
        bruta = linhas[i]
        limpa = sem_comentario(bruta).rstrip()
        numero = i + 1
        i += 1

        if not limpa.strip():
            continue
        recuo = len(limpa) - len(limpa.lstrip(" "))

        # Corpo de escalar de bloco: tudo mais fundo que a chave que o abriu.
        if chave_pendente is not None and recuo > indent_chave:
            if atual is not None and chave_pendente == "run":
                atual.run += limpa.strip() + "\n"
            if atual is not None and chave_pendente == "if":
                atual.condicao += " " + limpa.strip()
            continue
        chave_pendente = None

        if indent_steps is not None and recuo <= indent_steps:
            indent_steps, indent_item, atual = None, None, None

        if (m := ABRE_STEPS.match(limpa)) is not None:
            indent_steps = len(m.group(1))
            indent_item = None
            atual = None
            continue

        if indent_steps is None:
            continue

        if (m := ITEM.match(limpa)) is not None and recuo > indent_steps:
            if indent_item is None:
                indent_item = recuo
            if recuo == indent_item:
                atual = Passo(nome_do_arquivo, numero)
                passos.append(atual)
                resto = m.group(2)
                indent_chave = recuo + 2
                if (k := CHAVE.match(" " * indent_chave + resto)) is not None:
                    chave_pendente = _guardar(atual, k.group(2), k.group(3).strip())
                continue

        if atual is not None and (k := CHAVE.match(limpa)) is not None:
            if recuo == indent_chave:
                chave_pendente = _guardar(atual, k.group(2), k.group(3).strip())

    return passos


def _guardar(passo: Passo, chave: str, valor: str) -> str | None:
    """Guarda a chave no passo. Devolve o nome da chave quando ela abre bloco."""
    if chave == "name":
        passo.nome = valor.strip("\"'") or passo.nome
    elif chave == "if":
        passo.condicao = "" if valor in BLOCO else valor
        return "if" if valor in BLOCO else None
    elif chave == "continue-on-error":
        passo.continue_on_error = valor.strip("\"'")
    elif chave == "run":
        passo.run = "" if valor in BLOCO else valor + "\n"
        return "run" if valor in BLOCO else None
    return None


# -------------------------------------------------------------------------
# O lado direito de cada `||`
# -------------------------------------------------------------------------
ATRIBUICAO = re.compile(r"^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_]*=")
ACRESCIMO = re.compile(r"^\s*(echo|printf|cat|tee)\b.*>>")
SAIDA = re.compile(r"\bexit\s+([0-9]+)\b")
SUCESSO_NU = re.compile(r"^\s*(true|:)\s*$")
FALHA_NUA = re.compile(r"^\s*false\s*$")


CABECALHO_DE_CONDICAO = re.compile(r"^\s*(!\s*)?(if|elif|while|until)\s")


def lados_direitos(corpo: str) -> list[tuple[str, bool]]:
    """(texto a direita de cada `||`, esta dentro de cabecalho de condicao?).

    Quando o lado direito abre `{`, ele segue pelas linhas seguintes ate o `}`
    correspondente: `|| { echo ...; exit 0; }` quebrado em duas linhas e
    exatamente a forma do defeito que este portao precisa pegar.
    """
    mascarado = mascarar(corpo)
    achados: list[tuple[str, bool]] = []
    for m in re.finditer(r"\|\|", mascarado):
        inicio = m.end()
        comeco_da_linha = mascarado.rfind("\n", 0, m.start()) + 1
        condicao = CABECALHO_DE_CONDICAO.match(mascarado[comeco_da_linha : m.start()]) is not None
        fim = mascarado.find("\n", inicio)
        trecho = corpo[inicio : fim if fim >= 0 else len(corpo)]
        if trecho.count("{") > trecho.count("}"):
            resto = mascarado[inicio:]
            abertas = 0
            for j, c in enumerate(resto):
                if c == "{":
                    abertas += 1
                elif c == "}":
                    abertas -= 1
                    if abertas == 0:
                        trecho = corpo[inicio : inicio + j + 1]
                        break
        trecho = trecho.strip()
        if condicao:
            # `if consulta || true; then` -- o `; then` fecha o cabecalho e nao
            # faz parte do lado direito. Sem tirar, `true; then` nao casaria com
            # a forma de sucesso e o defeito escaparia pela pontuacao.
            trecho = re.sub(r";\s*(then|do)\s*$", "", trecho).strip()
        achados.append((trecho, condicao))
    return achados


def classificar(direito: str, dentro_de_condicao: bool) -> str:
    """A forma do lado direito, pela lista de permitidos.

    A forma de SUCESSO e conferida antes da condicao de proposito: dentro de um
    `if` ela nao deixa de ser o defeito, ela so muda de disfarce.
    """
    if SUCESSO_NU.match(direito):
        return "sucesso"
    if (m := SAIDA.search(direito)) is not None:
        return "sucesso" if m.group(1) == "0" else "falha"
    if dentro_de_condicao:
        return "condicao"
    if FALHA_NUA.match(direito):
        return "falha"
    if ATRIBUICAO.match(direito):
        return "atribuicao"
    if ACRESCIMO.match(direito):
        return "acrescimo"
    return "desconhecida"


# -------------------------------------------------------------------------
# As regras. Cada uma e independente das outras e nomeia o seu proprio motivo.
# -------------------------------------------------------------------------
def julgar(passo: Passo) -> list[tuple[str, str]]:
    """(nome da regra, motivo) para este passo. Vazio e aprovacao."""
    queixas: list[tuple[str, str]] = []

    if passo.continue_on_error.lower() not in ("", "false"):
        queixas.append((
            "continue-on-error",
            f"`continue-on-error: {passo.continue_on_error}`. O passo reporta sucesso ao job "
            "aconteca o que acontecer, e o destino real dele vira um enum de quatro valores em "
            "que 'nao consegui perguntar' e 'perguntei e a resposta e nao' tem o mesmo nome. "
            "Permitido: `false`",
        ))

    for campo, texto in (("run", passo.run), ("if", passo.condicao)):
        if (m := ESTADO_DE_PASSO.search(texto)) is not None:
            queixas.append((
                "estado-de-passo",
                f"le `{m.group(0)}` no `{campo}:`. Esse valor nao distingue o servico que nao "
                "respondeu do servico que respondeu 'nao': os dois sao `failure`. Foi assim que "
                "um HTTP 403 do SonarCloud virou uma reprovacao dispensavel no run 35750052587. "
                "Quem decide precisa ler o CORPO e o CODIGO HTTP que a busca gravou",
            ))

    if (m := RESULTADO_DE_JOB.search(passo.run)) is not None:
        corpo = passo.run
        padrao = ""
        if (p := corpo.find("*)")) >= 0:
            fim = corpo.find(";;", p)
            padrao = corpo[p : fim if fim >= 0 else len(corpo)]
        reconhecida = "case" in corpo and (s := SAIDA.search(padrao)) is not None and s.group(1) != "0"
        if not reconhecida:
            queixas.append((
                "resultado-de-job",
                f"le `{m.group(0)}` fora da unica forma reconhecida. Resultado de job e o mesmo "
                "enum de quatro valores: ele so pode ser lido num `case` com ramo padrao `*)` que "
                "sai com codigo diferente de zero, para que o valor que ninguem previu REPROVE em "
                "vez de escorrer para o ramo do sucesso",
            ))

    if not passo.e_encerramento():
        if (m := SET_MAIS_E.search(passo.run)) is not None:
            queixas.append((
                "sucesso-no-caminho-de-falha",
                "`set +e` desliga a propagacao de codigo de saida do corpo inteiro. A partir dali "
                "o passo fica verde com qualquer comando tendo falhado",
            ))
        for direito, dentro_de_condicao in lados_direitos(passo.run):
            forma = classificar(direito, dentro_de_condicao)
            se_encerramento = "; so em passo `if: always()` ou `if: failure()`, que roda depois de "
            if forma == "sucesso":
                queixas.append((
                    "sucesso-no-caminho-de-falha",
                    f"`|| {direito}` declara SUCESSO no caminho de falha. Nao ha como distinguir "
                    "o comando que nao conseguiu perguntar daquele que perguntou e nao gostou da "
                    "resposta: os dois seguem em frente" + se_encerramento
                    + "o job ja ter terminado, isto nao e o veredito de nada",
                ))
            elif forma == "desconhecida":
                queixas.append((
                    "fallback-desconhecido",
                    f"`|| {direito}` -- forma que este portao nao reconhece. Lista de permitidos "
                    "existe para nao aprovar o que ninguem previu: as formas aceitas sao "
                    "atribuicao de padrao, acrescimo a arquivo e reprovacao com `exit` diferente "
                    "de zero",
                ))

    return queixas


def conferir(arquivos: list[Path]) -> tuple[int, list[str]]:
    queixas: list[str] = []
    total = 0
    for caminho in sorted(arquivos):
        passos = ler_passos(caminho.read_text(encoding="utf-8"), caminho.name)
        total += len(passos)
        for passo in passos:
            for _regra, motivo in julgar(passo):
                queixas.append(f"{passo.onde()} -- {motivo}")
    return total, queixas


# =========================================================================
# AS ISCAS. Uma regra por arquivo, e o autoteste compara CONJUNTOS de regras.
# =========================================================================
CASOS: list[tuple[str, set[str], str]] = [
    (
        "deve-aprovar-forma-inteira.yml",
        set(),
        "busca e juizo separados, teardown sob `if: always()`, padrao por atribuicao, "
        "`||` de OU logico num `if`, e consolidacao de `needs` com ramo `*)` que reprova",
    ),
    (
        "deve-aprovar-mencao-em-comentario.yml",
        set(),
        "`steps.x.outcome` CITADO num comentario nao e uso: portao que casa com a propria "
        "explicacao ja nasceu furado neste repositorio",
    ),
    (
        "deve-reprovar-continue-on-error.yml",
        {"continue-on-error"},
        "`continue-on-error: true`, sozinho",
    ),
    (
        "deve-reprovar-estado-de-passo.yml",
        {"estado-de-passo"},
        "O DEFEITO DE HOJE: o veredito tomado de `steps.<id>.outcome`",
    ),
    (
        "deve-reprovar-resultado-de-job.yml",
        {"resultado-de-job"},
        "`needs.<job>.result` sem o ramo padrao que reprova",
    ),
    (
        "deve-reprovar-sucesso-no-caminho-de-falha.yml",
        {"sucesso-no-caminho-de-falha"},
        "`|| { echo ...; exit 0; }` depois de uma consulta, em duas linhas",
    ),
    (
        "deve-reprovar-sucesso-em-condicao.yml",
        {"sucesso-no-caminho-de-falha"},
        "`if consulta || true; then`: a forma de sucesso escondida num cabecalho de condicao",
    ),
    (
        "deve-reprovar-set-mais-e.yml",
        {"sucesso-no-caminho-de-falha"},
        "`set +e`, que desliga a propagacao no corpo inteiro",
    ),
    (
        "deve-reprovar-fallback-desconhecido.yml",
        {"fallback-desconhecido"},
        "lado direito de `||` numa forma que o portao nao reconhece",
    ),
]

ISCA_SEM_PASSO = "deve-reprovar-sem-passo-nenhum.yml"


def autoteste() -> int:
    falhas = 0
    print(f"autoteste do portao de consulta externa ({len(CASOS) + 1} casos)")

    for arquivo, esperadas, descricao in CASOS:
        caminho = ISCAS / arquivo
        if not caminho.is_file():
            print(f"  [ FALTA   ] {arquivo}: isca ausente")
            falhas += 1
            continue
        passos = ler_passos(caminho.read_text(encoding="utf-8"), arquivo)
        if not passos:
            print(f"  [ FALHOU  ] {descricao}: a isca nao tem passo NENHUM para julgar")
            falhas += 1
            continue
        regras = {regra for passo in passos for regra, _m in julgar(passo)}
        if regras != esperadas:
            falhas += 1
            print(f"  [ FALHOU  ] {descricao}")
            print(f"               esperado: {sorted(esperadas) or '(nenhuma regra)'}")
            print(f"               veio:     {sorted(regras) or '(nenhuma regra)'}")
            for passo in passos:
                for _r, motivo in julgar(passo):
                    print(f"               {passo.onde()} -- {motivo[:110]}")
            continue
        print(f"  [    ok    ] {descricao}")

    caminho = ISCAS / ISCA_SEM_PASSO
    if not caminho.is_file():
        print(f"  [ FALTA   ] {ISCA_SEM_PASSO}: isca ausente")
        falhas += 1
    else:
        vistos, _ = conferir([caminho])
        if vistos == 0:
            print("  [    ok    ] descoberta vazia REPROVA: workflow sem passo nenhum")
        else:
            falhas += 1
            print(f"  [ FALHOU  ] a isca sem passo devolveu {vistos} passo(s): a contagem que "
                  "sustenta a emptiness esta contando outra coisa")

    if falhas:
        print(
            f"\nREPROVADO: {falhas} caso(s) de autoteste. O portao de consulta externa deixou de "
            "enxergar o que ele existe para enxergar, e o verde dele parou de significar alguma coisa"
        )
        return 1
    print(f"\nautoteste APROVADO: {sum(1 for c in CASOS if c[1]) + 1} caso(s) reprovam, cada um "
          f"pelo conjunto de regras que ele isola, e {sum(1 for c in CASOS if not c[1])} aprovam")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--autoteste", action="store_true", help="so as iscas")
    a = p.parse_args(argv[1:])

    if autoteste() != 0:
        return 1
    if a.autoteste:
        return 0

    if not WORKFLOWS.is_dir():
        print(f"\nREPROVADO: {WORKFLOWS} nao existe. Sem workflow nao ha o que conferir, e "
              "aprovar aqui seria aprovar sem ter olhado")
        return 1
    arquivos = sorted(WORKFLOWS.glob("*.yml"))
    if not arquivos:
        print(f"\nREPROVADO: nenhum *.yml em {WORKFLOWS}. Ou a esteira sumiu, ou esta leitura "
              "ficou cega")
        return 1

    print(f"\nworkflows conferidos: {', '.join(x.name for x in arquivos)}")
    total, queixas = conferir(arquivos)
    if total == 0:
        print(f"\nREPROVADO: li {len(arquivos)} workflow(s) e nao achei passo NENHUM. A forma do "
              "arquivo mudou e esta leitura ficou cega")
        return 1

    print(f"passos lidos: {total}")
    if queixas:
        print(f"\nREPROVADO: {len(queixas)} passo(s) podem ficar verdes sem a resposta.")
        for q in queixas:
            print(f"  - {q}")
        print(
            "\nSepare o passo que BUSCA do passo que JULGA: a busca grava o que aconteceu "
            "(obteve ou nao, o codigo HTTP, o erro) e o juizo decide sobre isso, com vocabulario "
            "fechado. `buscar_veredito_do_sonar.py` e `verificar_veredito_do_sonar.py` sao o "
            "exemplo no proprio repositorio."
        )
        return 1

    print(f"\nAPROVADO: nenhum dos {total} passos transforma 'nao consegui perguntar' em resposta")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
