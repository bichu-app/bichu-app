#!/usr/bin/env python3
"""Portao de portabilidade: amarracao em provedor e em hostname.

docs/07-devops.md secoes 3.6 e 3.9.

Tres familias de achado:
  - provedor: dominio de nuvem, regiao, nome de bucket, SDK em camada errada
  - hostname: literal de host, IP privado
  - migracao: URL absoluta persistida ou embutida em `migrations/*.sql`

Amarracao se mede no CODIGO. `hostname` e `migracao` leem a linha com o
comentario apagado, porque comentario nao amarra nada: ele EXPLICA. `provedor`
le o arquivo inteiro de proposito -- ela confina uma dependencia, e nao empurra
um endereco para configuracao. O porque de cada uma esta na nota acima de
`Dialeto`.

E um autoteste que e a parte que importa, em tres camadas:
  - as iscas POSITIVAS em `tests/portabilidade/deve-reprovar-*` PRECISAM ser
    reprovadas -- e nao por qualquer regra, mas por CADA UMA das regras da
    familia que a isca cobre, em par com a linha que prova aquela regra. Cada
    linha declara, num comentario `isca:` seguido do motivo, qual regra ela
    existe para acordar, e o autoteste confere os dois sentidos desse par;
  - as iscas NEGATIVAS em `tests/portabilidade/nao-deve-reprovar-*` PRECISAM
    passar, com o host escrito nelas: elas provam que prosa nao acusa sem
    deixar o portao se calar de graca;
  - `CASOS_DO_APAGADOR` confere, dialeto por dialeto, que o apagador de
    comentario nao come CODIGO -- a falha silenciosa desta peca.

Um portao que ninguem viu reprovar vale pela confianca do dia em que foi
escrito; um portao que ninguem viu APROVAR vive vermelho e e contornado.

Uso: python3 verificar_portabilidade.py [raiz]
Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

# O portao varre CODIGO. Configuracao (compose, Makefile, .env.example, infra,
# workflows) e contrato (api/openapi.yaml) tem URL por natureza e ficam de fora:
# e justamente para la que o hostname deve ser empurrado. Varrer configuracao
# faria o portao acusar o proprio remedio.
#
# O SITE E VARRIDO EM `web/src/`, e nao em `web/` inteiro. O back-end varre
# `src/` e deixa de fora a configuracao e o `dist/`. Os TESTES do back-end
# tambem ficam de fora, mas por NOME e nao por geografia -- ver
# SUFIXOS_DE_TESTE, e o paragrafo la explica por que a geografia nao servia. O site e um subprojeto fechado (ADR-0028) que nao
# tem essa separacao geografica: os testes (`web/tests/`), a configuracao
# (`web/*.config.*`, `web/astro.config.mjs`), os scripts de build e medicao
# (`web/scripts/`), o servidor minimo de bootstrap (`web/servidor.mjs`) e a
# saida de build (`web/dist/`) moram todos sob `web/`. Todos sao URL por
# natureza -- host de mock local, base canonica afirmada em teste, namespace de
# esquema -- e cairiam na mesma categoria que a configuracao do back-end, que ja
# fica de fora. Varrer so `web/src/` poe o CODIGO da aplicacao do site na mesma
# regra do `src/` do back-end, sem varrer o que no back-end tambem nao e varrido.
# `admin/src/` desde 23/09: a SPA do backoffice chama `/v1/admin/*` por caminho
# RELATIVO (mesma origem, D34 da seguranca), entao host literal no codigo que
# vai ao navegador e defeito duas vezes -- amarra o build a um ambiente e abre
# caminho para CORS. So `src/` da SPA, e nao `admin/` inteiro: o
# `vite.config.ts` pode legitimamente apontar o proxy de desenvolvimento para
# `http://localhost:3000`, e `package-lock.json` e `node_modules/` sao URL de
# registro, nao amarracao.
RAIZES_VARRIDAS = ("src/", "migrations/", "app/lib/", "web/src/", "admin/src/")

# Dentro do codigo, o adaptador externo e onde falar com provedor e legitimo.
ISENTOS = (
    "src/*/adapters/external/",
    "node_modules/",
    "dist/",
    "build/",
)

EXTENSOES = {".ts", ".tsx", ".js", ".mjs", ".dart", ".sql", ".yaml", ".yml", ".json", ".html"}

# Comentario nao amarra nada: ele EXPLICA.
#
# O portao existe para impedir que host, regiao ou bucket entrem no CODIGO, e
# tinha passado a acusar a PROSA que explica a forma de uma URL derivada. Medido
# em 20/10/2026 na development: 7 achados, nenhum deles amarracao -- tres
# comentarios de documentacao em Dart (`//` e `///`), um bloco `/** */` em
# TypeScript que registra contra qual ambiente uma rota foi medida, dois
# comentarios `--` numa migracao e um literal de regex. Com isso TODO PR nascia
# vermelho: `portoes rapidos` reprovava, o agregador reprovava, e os outros dez
# jobs ficavam `skipping`. Portao que esta sempre vermelho nao e lido -- e
# contornado, e ai ele nao protege mais nada.
#
# Entao a familia `hostname` e a regra de migracao passam a ler so o CODIGO. A
# familia `provedor` continua lendo o arquivo inteiro, comentario incluido, e de
# PROPOSITO: ela nao manda empurrar o endereco para uma variavel, ela CONFINA
# uma dependencia no adaptador, e o endereco do FCM escrito num comentario de
# `domain/` e exatamente o rastro que a regra do FCM existe para ver -- esta
# dito com estas palavras no comentario dela, em REGRAS_PROVEDOR.
#
# Apagar comentario exige um varredor que conheca STRING, porque o `//` de
# `https://` vive dentro de uma e um corte ingenuo decapitaria justamente as
# URLs que o portao precisa ver. O portao ficaria cego sem ninguem notar, que e
# o contrario do defeito consertado aqui e muito pior que ele. As iscas
# negativas em `tests/portabilidade/` cobram os dois lados: host em comentario
# nao acusa, e o MESMO host na linha crua acusa.


class Dialeto(NamedTuple):
    """Como uma linguagem escreve comentario e string."""

    linha: tuple[str, ...] = ()
    bloco: tuple[tuple[str, str], ...] = ()
    aspas: tuple[str, ...] = ()
    escape_barra: bool = False
    aspas_dobradas: bool = False  # aspa repetida fecha e reabre, como no SQL
    triplas: bool = False  # aspa tripla do Dart
    multilinha: tuple[str, ...] = ()  # delimitador que atravessa quebra de linha
    linha_exige_espaco: bool = False  # `#` do YAML so comenta depois de espaco


# String multilinha so onde a linguagem de fato tem uma: literal de template do
# JS e aspa tripla do Dart. No SQL ela NAO esta declarada de proposito -- uma
# aspa sem par (um apostrofo dentro de corpo `$$`) engoliria o resto do ARQUIVO
# e cegaria o portao dali para baixo. Limitar o estrago a uma linha e o lado
# seguro do erro.
_JS = Dialeto(
    linha=("//",),
    bloco=(("/*", "*/"),),
    aspas=('"', "'", "`"),
    escape_barra=True,
    multilinha=("`",),
)
_DART = Dialeto(
    linha=("//",),
    bloco=(("/*", "*/"),),
    aspas=('"', "'"),
    escape_barra=True,
    triplas=True,
)
_SQL = Dialeto(linha=("--",), bloco=(("/*", "*/"),), aspas=("'", '"'), aspas_dobradas=True)
_YAML = Dialeto(linha=("#",), aspas=('"', "'"), escape_barra=True, linha_exige_espaco=True)
_HTML = Dialeto(bloco=(("<!--", "-->"),))
_JSON = Dialeto(aspas=('"',), escape_barra=True)  # JSON nao tem comentario

DIALETOS = {
    ".ts": _JS,
    ".tsx": _JS,
    ".js": _JS,
    ".mjs": _JS,
    ".dart": _DART,
    ".sql": _SQL,
    ".yaml": _YAML,
    ".yml": _YAML,
    ".html": _HTML,
    ".json": _JSON,
}


def _fim_da_string(texto: str, i: int, delim: str, d: Dialeto) -> int:
    """Indice do primeiro caractere DEPOIS da string que abre em `i`."""
    n = len(texto)
    j = i + len(delim)
    aceita_quebra = len(delim) == 3 or delim in d.multilinha
    while j < n:
        if d.escape_barra and texto[j] == "\\":
            j += 2
            continue
        if texto.startswith(delim, j):
            if d.aspas_dobradas and texto.startswith(delim, j + len(delim)):
                j += 2 * len(delim)
                continue
            return j + len(delim)
        if texto[j] == "\n" and not aceita_quebra:
            return j  # string sem fechar: nao engole o resto do arquivo
        j += 1
    return n


def linhas_de_codigo(texto: str, sufixo: str) -> list[str]:
    """As mesmas linhas do arquivo, com o CONTEUDO dos comentarios apagado.

    Mesma contagem de linhas que `texto.splitlines()`, e de proposito: o portao
    reporta numero de linha, e um apagador que encurtasse o arquivo apontaria
    para a linha errada. Comentario vira espaco; a quebra de linha fica.

    String e reconhecida ANTES de comentario, porque `//` mora dentro de
    `https://`. Sem isso o apagador cortaria a URL no meio e o portao pararia de
    ver amarracao de verdade -- em silencio, do lado que aprova.
    """
    d = DIALETOS.get(sufixo)
    if d is None:
        return texto.splitlines()
    chars = list(texto)
    n = len(texto)
    i = 0
    while i < n:
        delim = None
        if d.triplas:
            delim = next((a * 3 for a in d.aspas if texto.startswith(a * 3, i)), None)
        if delim is None:
            delim = next((a for a in d.aspas if texto.startswith(a, i)), None)
        if delim is not None:
            i = _fim_da_string(texto, i, delim, d)
            continue
        marcador = next((m for m in d.linha if texto.startswith(m, i)), None)
        if marcador is not None and not (
            d.linha_exige_espaco and i > 0 and texto[i - 1] not in " \t\n"
        ):
            while i < n and texto[i] != "\n":
                chars[i] = " "
                i += 1
            continue
        abre = next((b for b in d.bloco if texto.startswith(b[0], i)), None)
        if abre is not None:
            fim = texto.find(abre[1], i + len(abre[0]))
            fim = n if fim < 0 else fim + len(abre[1])
            for j in range(i, fim):
                if texto[j] != "\n":
                    chars[j] = " "
            i = fim
            continue
        i += 1
    return "".join(chars).splitlines()


# O apagador de comentario e a peca nova deste portao, e ele falha nos DOIS
# sentidos. Deixar comentario de pe devolve o falso positivo de 20/10/2026: faz
# barulho, e quem le descobre. Comer CODIGO e o outro, e e o grave: o portao
# para de ver amarracao de verdade e nada fica vermelho. As iscas em arquivo
# cobram o primeiro sentido; esta tabela cobra o segundo, por dialeto, porque o
# `//` de `https://` mora dentro de uma string e e exatamente ali que um
# apagador ingenuo corta.
#
# Cada caso e (sufixo, texto, o que tem de SOBRAR, o que tem de DESAPARECER). O
# que sobra esta sempre dentro de uma string; o que desaparece, sempre dentro de
# um comentario.
_SOBREVIVE = "https://hml.bichu.app"
_DESAPARECE = "nao-conta.bichu.app"
CASOS_DO_APAGADOR = (
    (".ts", 'const a = "https://hml.bichu.app"; // https://nao-conta.bichu.app'),
    (".ts", "const a = `https://hml.bichu.app/${k}`; /* https://nao-conta.bichu.app */"),
    (".dart", "const a = 'https://hml.bichu.app'; /// https://nao-conta.bichu.app"),
    (".dart", "const a = '''https://hml.bichu.app'''; // https://nao-conta.bichu.app"),
    (".sql", "INSERT INTO t VALUES ('https://hml.bichu.app'); -- https://nao-conta.bichu.app"),
    # Aspa repetida dentro de string de SQL: se ela fechasse a string, o resto da
    # linha viraria codigo e o `--` seguinte apagaria o que nao e comentario.
    (".sql", "INSERT INTO t VALUES ('do''c https://hml.bichu.app'); -- https://nao-conta.bichu.app"),
    (".yaml", 'url: "https://hml.bichu.app" # https://nao-conta.bichu.app'),
    # `#` sem espaco antes e fragmento de URL, nao comentario.
    (".yaml", "url: https://hml.bichu.app#frag # https://nao-conta.bichu.app"),
    (".html", '<a href="https://hml.bichu.app">x</a> <!-- https://nao-conta.bichu.app -->'),
)


def autoteste_do_apagador() -> list[str]:
    """O apagador de comentario, nos dois sentidos, dialeto por dialeto."""
    falhas: list[str] = []
    for sufixo, texto in CASOS_DO_APAGADOR:
        codigo = "\n".join(linhas_de_codigo(texto, sufixo))
        if _SOBREVIVE not in codigo:
            falhas.append(
                f"apagador de comentario ({sufixo}): COMEU CODIGO -- "
                f"`{_SOBREVIVE}` estava dentro de uma string e desapareceu de "
                f"`{texto}`. Este e o defeito silencioso: o portao para de ver "
                "amarracao de verdade e nada fica vermelho"
            )
        if _DESAPARECE in codigo:
            falhas.append(
                f"apagador de comentario ({sufixo}): DEIXOU COMENTARIO DE PE -- "
                f"`{_DESAPARECE}` estava dentro de um comentario e sobrou de "
                f"`{texto}`. O portao volta a acusar prosa, e todo PR volta a "
                "nascer vermelho"
            )
    muitas = "a\n// b\nc\n"
    if len(linhas_de_codigo(muitas, ".ts")) != len(muitas.splitlines()):
        falhas.append(
            "apagador de comentario: mudou a CONTAGEM de linhas. O portao reporta "
            "numero de linha, e desalinhado ele acusa a linha errada -- o achado "
            "passa a apontar para um lugar onde nao ha nada"
        )
    return falhas

REGRAS_PROVEDOR = [
    (re.compile(r"\b[\w.-]*\.amazonaws\.com\b"), "dominio de provedor (AWS)"),
    (re.compile(r"\bstorage\.googleapis\.com\b"), "dominio de provedor (GCS)"),
    # O ADR-0022 trouxe o PRIMEIRO servico gerenciado para o caminho de runtime.
    # A excecao vale para o adaptador e para mais nada: sem esta regra, o nome do
    # gerenciador podia aparecer em `config/` e o portao so reclamaria por ser um
    # `.com` qualquer, que e a familia errada de achado e a mensagem errada para
    # quem le. Ver a isca em tests/portabilidade/deve-reprovar-provedor.ts.
    (re.compile(r"\bsecretmanager\.googleapis\.com\b"), "dominio de provedor (Secret Manager)"),
    # O FCM e o transporte do push (ADR-0008) e ele estava sem regra propria.
    # Duas consequencias, e nenhuma das duas e "o portao pegava do mesmo jeito":
    #   - escrito COM esquema, `https://fcm.googleapis.com/...` caia na regra
    #     generica de hostname, que e a familia errada de achado e a mensagem
    #     errada para quem le -- ela manda empurrar o host para configuracao, e
    #     o que este caso pede e o contrario: confinar o PROVEDOR no adaptador,
    #     porque o endereco do FCM nao e configuravel, e o transporte;
    #   - escrito SEM esquema (`fcm.googleapis.com`, num comentario, num
    #     `.env` de exemplo copiado para dentro de `src/`, numa constante
    #     montada por concatenacao) nao casava com nada. Ninguem via.
    # A excecao vale para `src/*/adapters/external/`, como a do Secret Manager:
    # e la que `fcm-http-v1.ts` mora, e e o unico arquivo do sistema que pode
    # saber que o FCM existe.
    (re.compile(r"\bfcm\.googleapis\.com\b"), "dominio de provedor (FCM)"),
    (re.compile(r"\b[\w.-]*\.blob\.core\.windows\.net\b"), "dominio de provedor (Azure)"),
    (re.compile(r"\b[\w.-]*\.r2\.cloudflarestorage\.com\b"), "dominio de provedor (R2)"),
    (re.compile(r"[\"'](?:us|eu|ap|sa)-(?:east|west|north|south|central|northeast|southeast)-\d[\"']"),
     "literal de regiao"),
    (re.compile(r"[\"']southamerica-(?:east|west)\d[\"']"), "literal de regiao"),
    (re.compile(r"[\"']bichu-media-(?:private|public)[\"']"), "nome de bucket em codigo"),
]

# O motivo da regra generica e constante porque a lista de terceiros abaixo se
# refere a ELE: escrito duas vezes a mao, um dos dois envelhece sozinho e a
# dispensa passa a nao casar com regra nenhuma -- em silencio, do lado que
# aprova.
MOTIVO_URL_ABSOLUTA = "host literal em URL absoluta"

REGRAS_HOSTNAME = [
    (re.compile(r"\bhttps?://localhost\b"), "literal `localhost`"),
    (re.compile(r"\bhttps?://127\.0\.0\.1\b"), "literal 127.0.0.1"),
    (re.compile(r"\bhttps?://0\.0\.0\.0\b"), "literal 0.0.0.0"),
    (re.compile(r"\bhttps?://(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)\d"), "literal de IP privado"),
    (re.compile(r"\bhttps?://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|com\.br|app|net|org|dev|io)\b"),
     MOTIVO_URL_ABSOLUTA),
]

# Servico de TERCEIRO que o produto CONSULTA, e que nao e infraestrutura nossa.
#
# Este portao existe contra amarracao na NOSSA nuvem e no NOSSO dominio: o
# ADR-0012 adiou a escolha de provedor e o cliente decidiu que o hostname e
# variavel e comeca em `localhost`. O endereco de um servico que nao e nosso nao
# e nenhuma das duas coisas. Ele nao muda quando trocamos de nuvem, nao muda
# quando o dominio sai de `localhost`, e nao e valor de ambiente: e a IDENTIDADE
# do servico que o cliente escolheu.
#
# A regra generica de URL absoluta manda "empurre o host para configuracao", e
# para este caso essa e a mensagem errada. A regra do FCM, acima, ja tinha dito
# isso de um endereco de terceiro com estas palavras: "o que este caso pede e o
# contrario". No back-end o terceiro e confinado em `src/*/adapters/external/`,
# isento por geografia -- e e exatamente por isso que `fcm-http-v1.ts` nao
# acusa e `app/lib/api/busca_de_cep.dart` acusava: o app Flutter nao tem essa
# camada, e o que falta nele e geografia, nao conserto.
#
# E dar essa geografia ao app nao era de graca: o unico ponto de uso da busca de
# CEP mora em `app/lib/telas/`, cujo hash de arvore esta travado no portao de
# portas de aparelho (`app/test/dispositivo/porta_nao_contornada_test.dart`).
# Mover o arquivo trocaria o import de uma tela e pediria destravar AQUELE
# portao -- com chave de issue e justificativa sobre porta de aparelho -- para
# consertar ESTE. Um portao nao se paga com o saldo de outro.
#
# "Virar configuracao" tambem nao compraria portabilidade aqui: em app Flutter
# `--dart-define` e resolvido no BUILD, entao repontar o servico pede recompilar
# e publicar na loja exatamente como pede trocar a constante. O que se compraria
# de verdade era uma entrada obrigatoria a mais no build e um caminho novo de
# falha calada -- o campo de CEP parando de se preencher porque alguem esqueceu
# o arquivo de configuracao.
#
# O CONTRAEXEMPLO QUE ESTE PARAGRAFO CITAVA NAO EXISTE MAIS, e a historia dele
# vale como aviso. Era o `MAP_TILES_URL` do mapa, em `app/config/mapa.json`,
# "por um motivo que NAO vale aqui: servidor de tiles se auto-hospeda e se
# troca, e o bloco do mapa cai num estado visivel quando a chave falta". O
# argumento segue de pe; o exemplo, nao. O leitor citado
# (`app/lib/telas/rede/local_do_encontro.dart`) saiu em 19/10/2026 com a pagina
# de detalhe do evento (`be057793`, pedido do cliente), e o arquivo de
# configuracao ficou sem ninguem para ler -- fazendo `verificar-apk.sh` cobrar,
# dentro do binario, o valor de um define que o Dart nao compila. Em 20/10/2026
# as duas chaves sairam.
#
# A lista e de HOST EXATO, com o servico nomeado, e vale SO para
# MOTIVO_URL_ABSOLUTA: dominio de provedor, `localhost`, loopback, bind e IP
# privado continuam acusando mesmo que o host esteja aqui. Dominio NOSSO nunca
# entra -- o autoteste recusa, porque host proprio nesta lista dispensaria
# justamente o achado que o portao existe para dar.
HOSTS_DE_TERCEIRO = {
    # Busca de CEP do pedido da plaquinha, pedida pelo cliente em 17/10/2026
    # ("pode implementar o via cep"), com a BrasilAPI so como reserva e nunca
    # consultada antes dela. Medido no dia: as duas sem chave e sem cadastro.
    # Ver `app/lib/api/busca_de_cep.dart`, que e o unico arquivo do app que
    # sabe que estes dois servicos existem.
    "viacep.com.br": "ViaCEP (busca de CEP, principal)",
    "brasilapi.com.br": "BrasilAPI (busca de CEP, reserva)",
}

# Os dominios do produto. Servem para o autoteste recusar host nosso entre os
# terceiros; nao sao regra de varredura.
NOSSOS_DOMINIOS = ("bichu.app", "bichu.com.br")


# O host inteiro, lido a partir de onde a regra casou. Nao casa `:` nem `/`,
# entao porta e caminho ficam fora.
_HOST_NA_POSICAO = re.compile(r"https?://([A-Za-z0-9.-]+)")


def host_de_terceiro(linha: str, inicio: int) -> bool:
    """O host que comeca em `inicio` e de um terceiro DECLARADO?

    LE O HOST DA LINHA, e nao o texto que a regra generica casou -- e a
    diferenca nao e estilo. A regra generica termina no TLD que ela conhece, e
    `br` nao esta na lista dela: em `https://viacep.com.br/ws` ela casa
    `https://viacep.com`, que e PREFIXO do host de verdade. Comparar esse
    prefixo com a lista erraria duas vezes, e a segunda e a perigosa: nao
    acharia `viacep.com.br`, que esta declarado, e acharia `viacep.com`, que e
    o dominio de OUTRA PESSOA, caso alguem o declarasse algum dia.

    Compara o host INTEIRO pelo mesmo motivo, do outro lado: casar por pedaco
    deixaria passar `viacep.com.br.exemplo.com`, que nao e o ViaCEP e e o jeito
    classico de escrever um host hostil parecido com um conhecido.
    """
    m = _HOST_NA_POSICAO.match(linha, inicio)
    if m is None:
        return False
    return m.group(1).rstrip(".").lower() in HOSTS_DE_TERCEIRO


# O par entre regra e linha de isca. Cada linha das iscas em
# `tests/portabilidade/` traz `// isca: <motivo>` dizendo QUAL regra ela existe
# para acordar, e o autoteste confere o par nos dois sentidos (ver autoteste()).
# O motivo e copiado literalmente do `motivo` da regra; se ele contivesse um
# literal que as proprias regras casam, a linha passaria a se auto-satisfazer
# pelo comentario -- nenhum motivo de hoje contem um, e nao deve passar a conter.
# URL absoluta em migracao e o caso que protege o ponto irreversivel: o banco
# guarda codigo e chave, nunca URL. Persistir URL transforma a troca de dominio
# em migracao de dados sobre plastico ja impresso. A regra vive numa familia
# propria porque so vale para `migrations/*.sql` -- e porque, como toda regra
# deste portao, ela precisa de isca.
#
# Ela era `"http://" in linha or "https://" in linha` sobre qualquer `.sql` de
# `migrations/`, sem excecao nenhuma, e por isso acusava duas coisas que nao
# amarram nada:
#   - o comentario `--` que EXPLICA o que a coluna aceita -- resolvido por
#     `linhas_de_codigo`, que apaga comentario antes de medir;
#   - o ESQUEMA dentro de um literal de regex, como
#     `CHECK (store_url ~ '^https://[^[:space:]]+$')`, que e justamente a
#     validacao que impede GUARDAR URL malformada. O portao estava acusando a
#     propria defesa, e nao ha host nenhum ali.
#
# Agora a regra exige HOST depois do esquema, que e o que "URL absoluta"
# significa. Isso nao a afrouxa para o caso que importa: `'https://img.bichu.app'`
# persistido continua reprovando, e o host escrito DENTRO de um regex
# (`~ '^https://img\.bichu\.app/'`) tambem, porque ancorar o esquema num host
# amarra o esquema aquele host do mesmo jeito -- a barra invertida do regex
# entra no padrao de proposito, senao a forma escapada escaparia da regra. Ver
# as duas iscas: `deve-reprovar-migracao.sql` e
# `nao-deve-reprovar-comentario.sql`.
REGRAS_MIGRACAO = [
    (
        re.compile(
            r"https?://(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9][a-z0-9._\\-]*\.[a-z]{2,})",
            re.I,
        ),
        "URL absoluta em migracao",
    ),
]

# `--` alem de `//` porque a isca da regra de migracao e um `.sql`.
MARCA_DE_ISCA = re.compile(r"(?://|--)\s*isca:\s*(.+?)\s*$")

# As marcas das iscas NEGATIVAS, que declaram o que NAO pode reprovar. Elas
# vivem em linha inteira de comentario -- e esse e o ponto delas --, entao nao
# passam por `motivo_anotado`, que exige codigo. Sao duas porque sao duas
# afirmacoes diferentes:
#   - `nao-isca`: o defeito esta na linha, e o que o salva e ser comentario. O
#     autoteste cobra que a linha CRUA case a regra e a linha de codigo nao.
#   - `nao-isca-sem-host`: nao ha host ali, em comentario nenhum -- e o caso do
#     literal de regex. O autoteste cobra que a regra nao case de jeito nenhum.
MARCA_DE_NAO_ISCA = re.compile(r"(?://|--)\s*nao-isca:\s*(.+?)\s*$")
MARCA_DE_NAO_ISCA_SEM_HOST = re.compile(r"(?://|--)\s*nao-isca-sem-host:\s*(.+?)\s*$")

REGRA_SDK = re.compile(r"""^\s*import\s+.*from\s+['"](@aws-sdk/|@google-cloud/|@azure/)""", re.M)
CAMADAS_PURAS = ("/domain/", "/application/", "/ports/")


def motivo_anotado(linha: str, codigo: str) -> str | None:
    """O motivo que ESTA linha declara acordar, ou None se ela nao declara um.

    A anotacao so vale depois de CODIGO. Linha inteira de comentario e prosa, e
    prosa nao anota nada -- o cabecalho de cada isca explica a convencao e para
    isso precisa CITAR a forma dela, e sem esta condicao a propria explicacao
    entrava como anotacao de um motivo que nunca existiu.

    A condicao era "a linha comeca com `//`"; agora e "a linha nao tem codigo",
    que diz a mesma coisa com a mesma severidade, vale para o `--` do SQL e nao
    se engana com bloco `/* */` nem com `///` indentado.
    """
    if not codigo.strip():
        return None
    marca = MARCA_DE_ISCA.search(linha)
    return marca.group(1) if marca is not None else None


def motivo_negado(linha: str) -> tuple[str, bool] | None:
    """O motivo que esta linha declara NAO poder reprovar, e se ha host nela.

    Retorna `(motivo, tem_host)`: `tem_host` e True para `nao-isca` (o defeito
    esta escrito na linha e o que o salva e ser comentario) e False para
    `nao-isca-sem-host` (nao ha host ali de forma nenhuma).
    """
    marca = MARCA_DE_NAO_ISCA.search(linha)
    if marca is not None:
        return marca.group(1), True
    marca = MARCA_DE_NAO_ISCA_SEM_HOST.search(linha)
    if marca is not None:
        return marca.group(1), False
    return None


# Lockfile e gerado pelo gerenciador de pacotes e carrega, por natureza, a URL
# do registro de onde cada pacote veio. Ele nao e codigo nosso e nao decide host
# nenhum em tempo de execucao. Isento pelo NOME exato, e nao por extensao: um
# `.json` qualquer numa raiz varrida continua varrido. (O `web/package-lock.json`
# fica fora da raiz `web/src/` desde que a varredura do site foi estreitada para
# ela, mas a isencao segue como defesa: um lockfile numa raiz varrida nao acusa.)
ARQUIVOS_GERADOS = ("package-lock.json",)

# Teste nao e o sistema rodando, e este portao sempre quis deixar teste de fora.
# Ele diz isso de `web/` com todas as letras no cabecalho acima ("base canonica
# afirmada em teste", "host de mock local"), e dizia do back-end tambem -- mas
# por GEOGRAFIA, afirmando que os testes "vivem em `tests/`, fora das raizes".
#
# ISSO NUNCA FOI VERDADE. Medido em 18/10/2026: 186 arquivos `*.test.ts` DENTRO
# de `src/` contra 41 em `tests/`, porque a convencao do repositorio e teste
# colado ao codigo que ele testa, e `tests/` guarda so os de integracao. O
# portao varria os 186 havia meses sem ninguem notar, por um motivo que nao
# tranquiliza: nenhum deles tinha URL ainda. O primeiro que teve -- a sugestao
# do diretorio, 17/10, com hosts ficticios de clinica inventada -- virou oito
# achados de uma vez, e o achado nao era defeito nenhum: era o portao cobrando
# de um arquivo de teste a regra que ele proprio nao queria cobrar dali.
#
# A exclusao passa a ser pelo NOME, que e o MESMO criterio que o build usa:
# `tsconfig.build.json` exclui `**/*.test.ts` da compilacao de producao. Um
# arquivo com este nome nao esta no sistema que roda, e o que nao roda nao
# amarra o que roda a host nenhum. Na SPA do backoffice o efeito e o mesmo por
# outro caminho: modulo de teste nao e alcancavel a partir do entry, e o
# empacotador nao o emite no pacote que vai ao navegador.
#
# A isencao vale porque os dois -- portao e build -- dizem a mesma coisa, e nao
# porque `.test.` se parece com teste. Se o padrao do build mudar, este muda
# junto, ou a justificativa cai.
#
# DITO EM VOZ ALTA: a isencao e do ARQUIVO INTEIRO, e nao so da regra generica
# de hostname. Dominio de provedor e SDK em camada pura tambem deixam de ser
# cobrados num `*.test.ts`. Nao e descuido e nao e novo: e exatamente o que a
# geografia `tests/` ja dava aos 41 testes de integracao, e o argumento e o
# mesmo -- o arquivo nao entra na compilacao de producao. O que muda e que
# agora os 186 colados ao codigo recebem o mesmo tratamento que os 41, em vez
# de depender de em que pasta alguem salvou o arquivo.
#
# Medido em 18/10/2026: a troca muda o veredito de 10 linhas, em tres arquivos,
# todas massa de teste -- hosts de clinica, de ingresso e de golpe inventados
# para o caso. Eram 8 em dois arquivos quando este paragrafo nasceu, algumas
# horas antes, e viraram 10 com a Rede entrando na development: o numero cresce
# a cada teste novo que escreva uma URL. Esta datado por isso, em vez de virar
# promessa -- a conta que envelhece calada e o defeito que este portao acabou
# de pagar.
#
# As iscas de `tests/portabilidade/` NAO sao afetadas: nao tem este sufixo, nao
# moram em raiz varrida, e o autoteste as le por caminho proprio.
SUFIXOS_DE_TESTE = (".test.ts", ".test.tsx")


def isento(rel: str) -> bool:
    nome = rel.rsplit("/", 1)[-1]
    if nome in ARQUIVOS_GERADOS:
        return True
    if nome.endswith(SUFIXOS_DE_TESTE):
        return True
    for padrao in ISENTOS:
        if padrao.endswith("/") and "*" not in padrao and rel.startswith(padrao):
            return True
        if "*" in padrao:
            prefixo, sufixo = padrao.split("*", 1)
            if rel.startswith(prefixo) and sufixo.strip("/") in rel:
                return True
    return False


def achados_de_regras(
    rel: str, medidas: list[str], cruas: list[str], regras: list[tuple[re.Pattern[str], str]]
) -> list[str]:
    """Casa `regras` contra `medidas`, mas MOSTRA a linha crua no achado.

    A linha medida pode ter o comentario apagado (ver `linhas_de_codigo`); quem
    le o achado quer ver o arquivo como ele esta escrito.
    """
    achados: list[str] = []
    for regex, motivo in regras:
        for n, linha in enumerate(medidas, 1):
            casadas = list(regex.finditer(linha))
            if not casadas:
                continue
            # So a regra generica aceita terceiro declarado, e so quando TODAS
            # as URLs da linha sao de terceiro: uma linha que mistura o ViaCEP
            # com um host nosso continua acusando, porque o que importa e o
            # host que sobrou, nao o que foi explicado.
            if motivo == MOTIVO_URL_ABSOLUTA and all(
                host_de_terceiro(linha, m.start()) for m in casadas
            ):
                continue
            achados.append(f"{rel}:{n}: {motivo} -> {cruas[n - 1].strip()[:90]}")
    return achados


def achados_em(caminho: Path, rel: str, como_migracao: bool | None = None) -> list[str]:
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [f"{rel}: nao foi possivel ler: {e}"]

    achados: list[str] = []
    linhas = texto.splitlines()
    codigo = linhas_de_codigo(texto, caminho.suffix)

    # `provedor` le o arquivo INTEIRO, comentario incluido; `hostname` e a regra
    # de migracao leem so o codigo. A diferenca nao e descuido: sao duas
    # perguntas diferentes, e o porque de cada uma esta na nota acima de
    # `Dialeto`.
    achados.extend(achados_de_regras(rel, linhas, linhas, REGRAS_PROVEDOR))
    achados.extend(achados_de_regras(rel, codigo, linhas, REGRAS_HOSTNAME))

    # `como_migracao` existe para o autoteste poder cobrar a regra de migracao
    # de uma isca que nao mora em `migrations/`. Na varredura quem decide e o
    # caminho, como sempre.
    if como_migracao is None:
        como_migracao = rel.startswith("migrations/") and caminho.suffix == ".sql"
    if como_migracao:
        achados.extend(achados_de_regras(rel, codigo, linhas, REGRAS_MIGRACAO))

    if any(c in f"/{rel}" for c in CAMADAS_PURAS) and REGRA_SDK.search(texto):
        achados.append(f"{rel}: SDK de provedor importado em camada pura (domain/application/ports)")

    return achados


def varrer(raiz: Path, apenas: str | None = None) -> list[str]:
    achados: list[str] = []
    for caminho in sorted(raiz.rglob("*")):
        if not caminho.is_file() or caminho.suffix not in EXTENSOES:
            continue
        rel = caminho.relative_to(raiz).as_posix()
        if apenas is None and not any(rel.startswith(r) for r in RAIZES_VARRIDAS):
            continue
        if apenas is None and isento(rel):
            continue
        if apenas is not None and not rel.startswith(apenas):
            continue
        if apenas is None and rel.startswith("tests/portabilidade/"):
            continue  # as iscas sao avaliadas no autoteste, nao na varredura
        achados.extend(achados_em(caminho, rel))
    return achados


def autoteste(raiz: Path) -> list[str]:
    """Cada regra em par com a linha de isca que a prova, nos DOIS sentidos.

    A primeira versao deste autoteste exigia apenas UM achado por isca, e era
    cega por construcao: apagada uma regra qualquer, as outras regras da mesma
    familia continuavam casando com as OUTRAS linhas da mesma isca, o autoteste
    seguia verde, e o portao parava de enxergar aquele defeito sem nada ficar
    vermelho.

    Exigir "cada regra dispara em algum lugar da isca" nao basta, e o motivo e
    exato: uma regra APAGADA nao esta mais na lista para ser cobrada. A lista de
    regras nao pode ser a unica testemunha de si mesma. Entao a isca declara o
    que espera, e a conferencia vai nos dois sentidos:

      A) regra -> isca: cada regra tem de casar com alguma linha anotada com o
         MOTIVO dela. Pega a linha de isca removida e a regra apertada demais.
      B) isca -> regra: cada linha anotada tem de ser casada por alguma regra
         com o motivo anotado. Pega a regra APAGADA, renomeada ou afrouxada --
         a anotacao sobrevive a regra e cobra por ela.

    A falha cita o motivo, e na direcao A tambem o padrao: dois motivos podem
    ser iguais (as duas regras de `literal de regiao`) e o motivo sozinho nao
    diria qual das duas cegou.

    As iscas de `hostname` e de migracao sao medidas na linha SEM COMENTARIO,
    pela mesma razao que a varredura: se o defeito da isca migrasse para um
    comentario, a regra continuaria "provada" por prosa e a varredura nao a
    exercitaria mais. Medir no codigo e o que faz a isca positiva dizer "host em
    CODIGO reprova" -- a outra metade, "host em comentario nao reprova", e
    cobrada pelas iscas NEGATIVAS, logo abaixo.
    """
    falhas: list[str] = autoteste_do_apagador()
    # O quarto campo diz se a isca e medida na linha sem comentario. `provedor`
    # e False de proposito: aquela familia varre o arquivo inteiro.
    iscas = (
        ("tests/portabilidade/deve-reprovar-provedor.ts", REGRAS_PROVEDOR, "REGRAS_PROVEDOR", False),
        ("tests/portabilidade/deve-reprovar-hostname.ts", REGRAS_HOSTNAME, "REGRAS_HOSTNAME", True),
        ("tests/portabilidade/deve-reprovar-migracao.sql", REGRAS_MIGRACAO, "REGRAS_MIGRACAO", True),
    )
    for rel, regras, familia, so_codigo in iscas:
        caminho = raiz / rel
        if not caminho.is_file():
            falhas.append(
                f"{rel}: isca ausente. Sem ela o portao passa a valer por "
                "confianca, e ninguem sabe se ele ainda enxerga"
            )
            continue
        try:
            texto = caminho.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            falhas.append(f"{rel}: nao foi possivel ler a isca: {e}")
            continue
        linhas = texto.splitlines()
        codigo = linhas_de_codigo(texto, caminho.suffix)
        medidas = codigo if so_codigo else linhas

        anotadas: list[tuple[int, str, str]] = []  # (numero, motivo esperado, linha medida)
        for n, (linha, cod) in enumerate(zip(linhas, codigo), 1):
            esperado = motivo_anotado(linha, cod)
            if esperado is not None:
                anotadas.append((n, esperado, medidas[n - 1]))

        if not anotadas:
            falhas.append(
                f"{rel}: nenhuma linha anotada com `isca: <motivo>` depois de "
                "codigo. Sem as anotacoes o autoteste nao tem testemunha "
                "independente da lista de regras, e uma regra apagada de "
                f"{familia} passaria em branco"
            )

        # Direcao A: regra -> isca.
        for regex, motivo in regras:
            if not any(regex.search(linha) for _, esperado, linha in anotadas if esperado == motivo):
                falhas.append(
                    f'{rel}: NENHUMA LINHA ANOTADA DISPARA a regra "{motivo}" '
                    f"de {familia} (padrao: {regex.pattern}). Ou a linha de isca "
                    "que a provava saiu do arquivo, ou perdeu a anotacao, ou o "
                    "defeito virou comentario, ou a regra ficou estreita demais "
                    "para o proprio caso dela"
                )

        # Direcao B: isca -> regra. A que pega a regra apagada.
        motivos = {motivo for _, motivo in regras}
        for n, esperado, linha in anotadas:
            if esperado not in motivos:
                falhas.append(
                    f'{rel}:{n}: a isca espera o motivo "{esperado}", que NAO '
                    f"EXISTE MAIS em {familia}. A regra foi apagada ou "
                    "renomeada, e o portao parou de enxergar este defeito"
                )
                continue
            if not any(regex.search(linha) for regex, motivo in regras if motivo == esperado):
                falhas.append(
                    f'{rel}:{n}: a regra "{esperado}" de {familia} NAO CASA MAIS '
                    "com a linha que existe para acorda-la. Ela foi afrouxada, ou "
                    f"a linha deixou de conter o defeito -> {linha.strip()[:90]}"
                )

    # As iscas NEGATIVAS. O defeito que elas existem para impedir e o inverso do
    # habitual -- nao "o portao parou de ver", e "o portao passou a ver onde nao
    # ha nada --, e ele custou o mesmo: medido em 20/10/2026, a familia hostname
    # e a regra de migracao acusavam prosa em sete linhas da development, e com
    # isso TODO PR nascia vermelho. Portao sempre vermelho nao e lido.
    #
    # Cada linha marcada declara a regra que NAO pode disparar ali, e em qual
    # dos dois sentidos (ver `motivo_negado`). A conferencia tem quatro partes, e
    # nenhuma sozinha basta:
    #   1. o motivo declarado tem de EXISTIR na familia -- senao a declaracao
    #      envelheceu sozinha e nao cobra mais nada;
    #   2. a linha marcada `nao-isca` tem de casar a regra na linha CRUA. Sem
    #      isso um arquivo vazio, ou com o host apagado, passaria: a isca
    #      provaria o silencio do portao com silencio proprio. E e esta parte que
    #      diz, do mesmo texto, "em codigo isto acusa";
    #   3. nenhuma linha marcada pode casar a regra na linha de CODIGO -- o que
    #      pega a regra voltando a acusar comentario;
    #   4. o arquivo inteiro nao pode dar achado nenhum, pela varredura de
    #      verdade. Pega o afrouxamento que entrasse por outra regra da familia.
    negativas = (
        ("tests/portabilidade/nao-deve-reprovar-comentario.ts", REGRAS_HOSTNAME, "REGRAS_HOSTNAME", False),
        ("tests/portabilidade/nao-deve-reprovar-comentario.dart", REGRAS_HOSTNAME, "REGRAS_HOSTNAME", False),
        ("tests/portabilidade/nao-deve-reprovar-comentario.sql", REGRAS_MIGRACAO, "REGRAS_MIGRACAO", True),
    )
    for rel, regras, familia, como_migracao in negativas:
        caminho = raiz / rel
        if not caminho.is_file():
            falhas.append(
                f"{rel}: isca negativa ausente. Sem ela nada prova que host em "
                "comentario deixou de acusar, e o falso positivo volta calado -- "
                "com todo PR nascendo vermelho outra vez"
            )
            continue
        try:
            texto = caminho.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            falhas.append(f"{rel}: nao foi possivel ler a isca negativa: {e}")
            continue
        linhas = texto.splitlines()
        codigo = linhas_de_codigo(texto, caminho.suffix)
        motivos = {motivo for _, motivo in regras}

        marcadas: list[tuple[int, str, bool]] = []  # (numero, motivo negado, tem host)
        for n, linha in enumerate(linhas, 1):
            negado = motivo_negado(linha)
            if negado is not None:
                marcadas.append((n, negado[0], negado[1]))

        if not any(tem_host for _, _, tem_host in marcadas):
            falhas.append(
                f"{rel}: nenhuma linha marcada com `nao-isca: <motivo>`. Uma isca "
                "negativa sem linha com defeito nao prova nada: ela aprovaria o "
                f"portao por estar vazia, e a regra de {familia} ficaria sem a "
                "metade que diz onde ela NAO pode disparar"
            )

        for n, negado, tem_host in marcadas:
            if negado not in motivos:
                falhas.append(
                    f'{rel}:{n}: a isca negativa cita o motivo "{negado}", que '
                    f"NAO EXISTE em {familia}. A declaracao envelheceu sozinha e "
                    "nao cobra mais nada"
                )
                continue
            casa = [regex for regex, motivo in regras if motivo == negado]
            if tem_host and not any(regex.search(linhas[n - 1]) for regex in casa):
                falhas.append(
                    f'{rel}:{n}: a linha CRUA nao contem o defeito que a regra '
                    f'"{negado}" pega. Esta isca negativa existe para provar que o '
                    "host esta escrito ali e so nao acusa por ser comentario; sem o "
                    f"host ela nao prova nada -> {linhas[n - 1].strip()[:90]}"
                )
            if any(regex.search(codigo[n - 1]) for regex in casa):
                falhas.append(
                    f'{rel}:{n}: a regra "{negado}" de {familia} VOLTOU A ACUSAR '
                    "uma linha que existe para NAO ser acusada. O portao esta "
                    f"cobrando prosa outra vez -> {linhas[n - 1].strip()[:90]}"
                )

        acusados = achados_em(caminho, rel, como_migracao=como_migracao)
        if acusados:
            falhas.append(
                f"{rel}: o portao deu {len(acusados)} achado(s) numa isca que "
                "existe para NAO ser acusada -- host em comentario, ou esquema "
                "dentro de literal de regex, voltou a reprovar: "
                + "; ".join(acusados[:3])
            )

    # HOSTS_DE_TERCEIRO e a unica coisa neste portao que faz um achado DEIXAR de
    # sair, entao ela e conferida aqui junto com as iscas, e pelo mesmo motivo:
    # o que aprova em silencio precisa de testemunha.
    generica = next(
        (regex for regex, motivo in REGRAS_HOSTNAME if motivo == MOTIVO_URL_ABSOLUTA),
        None,
    )
    if generica is None:
        falhas.append(
            f'nenhuma regra de REGRAS_HOSTNAME tem o motivo "{MOTIVO_URL_ABSOLUTA}", '
            "e HOSTS_DE_TERCEIRO so dispensa esse. A regra generica foi apagada ou "
            "renomeada, e a lista de terceiros passou a dispensar nada -- ou, pior, "
            "a existir sem que ninguem saiba o que ela solta"
        )
    for host, servico in sorted(HOSTS_DE_TERCEIRO.items()):
        if any(host == nosso or host.endswith(f".{nosso}") for nosso in NOSSOS_DOMINIOS):
            falhas.append(
                f'HOSTS_DE_TERCEIRO: "{host}" ({servico}) e dominio NOSSO. A lista '
                "existe para servico que nao e nosso; host proprio nela dispensa "
                "exatamente o achado que o portao existe para dar"
            )
        for regex, motivo in REGRAS_PROVEDOR:
            if regex.search(f"https://{host}"):
                falhas.append(
                    f'HOSTS_DE_TERCEIRO: "{host}" ({servico}) e casado pela regra '
                    f'"{motivo}" de REGRAS_PROVEDOR. A lista so dispensa '
                    f'"{MOTIVO_URL_ABSOLUTA}", entao esta entrada nao solta o que '
                    "quem a escreveu achou que soltava: ou o host nao e de "
                    "terceiro, ou a regra de provedor esta larga demais"
                )
        alvo = f"https://{host}/"
        if generica is not None and not (
            generica.search(alvo)
            and any(
                host_de_terceiro(alvo, m.start()) for m in generica.finditer(alvo)
            )
        ):
            falhas.append(
                f'HOSTS_DE_TERCEIRO: "{host}" ({servico}) nao e casado pela regra '
                f'"{MOTIVO_URL_ABSOLUTA}", entao esta entrada nao dispensa achado '
                "nenhum. Host errado, com erro de digitacao ou ja sem uso -- e, do "
                "jeito que esta, uma permissao que ninguem conferiu porque nunca agiu"
            )

    return falhas


def main(argv: list[str]) -> int:
    raiz = Path(argv[1] if len(argv) > 1 else ".").resolve()
    print(f"portao de portabilidade - {raiz}")

    falhas_autoteste = autoteste(raiz)
    print(f"  [{'ok' if not falhas_autoteste else 'REPROVA'}] autoteste das iscas")

    achados = varrer(raiz)
    print(f"  [{'ok' if not achados else 'REPROVA'}] varredura do codigo ({len(achados)} achado(s))")

    print()
    if falhas_autoteste:
        print("O PORTAO ESTA CEGO:")
        for f in falhas_autoteste:
            print(f"  - {f}")
    if achados:
        print("Amarracao encontrada:")
        for a in achados:
            print(f"  - {a}")
    if falhas_autoteste or achados:
        return 1
    print("APROVADO")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
