#!/usr/bin/env python3
"""Portao de portabilidade: amarracao em provedor e em hostname.

docs/07-devops.md secoes 3.6 e 3.9.

Tres familias de achado:
  - provedor: dominio de nuvem, regiao, nome de bucket, SDK em camada errada
  - hostname: literal de host, IP privado
  - migracao: esquema SEGUIDO DE HOST num `migrations/*.sql`

Todas medem o codigo SEM COMENTARIO: comentario nao e compilado, nao vai ao
navegador e nao decide host em tempo de execucao. Ver o bloco "COMENTARIO NAO E
CODIGO", que conta por que isso mudou em 20/10/2026 e o que custou.

E um autoteste que e a parte que importa: as duas iscas em
`tests/portabilidade/` PRECISAM ser reprovadas -- e nao por qualquer regra, mas
por CADA UMA das regras da familia que a isca cobre, em par com a linha de isca
que prova aquela regra. Cada linha de isca declara, num comentario `// isca:
<motivo>`, qual regra ela existe para acordar; o autoteste confere os dois
sentidos desse par e falha nomeando o motivo da regra que parou de enxergar,
porque um portao que ninguem viu reprovar vale pela confianca do dia em que foi
escrito.

A DISPENSA tem testemunha pelo mesmo motivo, e e novidade de 20/10/2026: as
iscas trazem linhas anotadas dizendo o que NAO deve mais reprovar, e o
autoteste cobra os dois lados de cada uma -- que a linha contenha de verdade o
defeito (senao a testemunha e vazia) e que ela deixe de acusar depois de medida
(senao a dispensa nao vale nada). Ver MARCA_DE_DISPENSA.

Uso: python3 verificar_portabilidade.py [raiz]
Saida: 0 aprovado, 1 reprovado. So biblioteca padrao.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

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

# ---------------------------------------------------------------------------
# COMENTARIO NAO E CODIGO.
#
# Em 20/10/2026 este portao reprovava a `development` e, com ela, os 8 PRs
# abertos: `portoes rapidos` e o PRIMEIRO job da esteira, e quando ele reprova
# todo o resto fica `skipped` -- a esteira parava de avaliar mudanca nenhuma,
# em PR nenhum. Eram 5 achados, e QUATRO deles eram PROSA: comentario de
# documentacao dizendo o que foi MEDIDO contra a homologacao (`// ... a
# derivada da grade sai em `https://img-hml.bichu.app/people/thumb/...``) e
# comentario de migracao explicando o que um `CHECK` valida. O quinto era o
# proprio `CHECK`, cujo literal `https://` e a REGRA DE VALIDACAO e nao tem
# host nenhum -- tratado em REGRAS_DE_MIGRACAO, abaixo.
#
# Nenhum dos quatro amarra coisa alguma. Comentario nao e compilado, nao vai ao
# navegador e nao decide host em tempo de execucao -- que e PALAVRA POR PALAVRA
# o argumento com que SUFIXOS_DE_TESTE ja tira o teste da varredura ("o que nao
# roda nao amarra o que roda a host nenhum"). O portao estava medindo TEXTO
# CRU e confundindo a explicacao do defeito com o defeito. Ha precedente
# MEDIDO neste repositorio: `app/test/dispositivo/permissoes_de_loja_test.dart`
# tira os comentarios ANTES de medir, porque o manifesto explica em prosa as
# permissoes que ele NAO pede, e o texto cru acusava a propria explicacao.
#
# O QUE NAO MUDOU: host literal em CODIGO continua reprovando. A isca de
# codigo em `tests/portabilidade/deve-reprovar-hostname.ts` esta la para
# provar, e o autoteste a cobra.
#
# O PRECO: a dispensa de comentario passa a ser a segunda coisa neste portao
# que faz um achado DEIXAR de sair (a primeira e HOSTS_DE_TERCEIRO), e vale a
# mesma regra que esta escrita la -- o que aprova em silencio precisa de
# testemunha. As iscas ganharam linhas de dispensa anotadas, e o autoteste
# cobra os DOIS lados de cada uma: o texto CRU da linha tem de reprovar (senao
# a testemunha e vazia e sobreviveria a uma dispensa quebrada) e a linha
# MEDIDA nao pode reprovar (senao a dispensa nao vale nada). Ver
# MARCA_DE_DISPENSA e autoteste().
# ---------------------------------------------------------------------------

# Por extensao: marcas de comentario de linha, o par de bloco (ou None) e os
# delimitadores de texto literal. `.json` e `.html` tem entrada propria em vez
# de ficar fora da tabela: ficar fora significa "nao sei ler este formato", e
# para JSON a resposta certa e "nao ha comentario para tirar".
SINTAXE_DE_COMENTARIO: dict[str, tuple[tuple[str, ...], tuple[str, str] | None, str]] = {
    ".ts": (("//",), ("/*", "*/"), "\"'`"),
    ".tsx": (("//",), ("/*", "*/"), "\"'`"),
    ".js": (("//",), ("/*", "*/"), "\"'`"),
    ".mjs": (("//",), ("/*", "*/"), "\"'`"),
    ".dart": (("//",), ("/*", "*/"), "\"'`"),
    # Em SQL `"` delimita IDENTIFICADOR, e nao texto -- mas para achar onde o
    # comentario comeca os dois se comportam igual, e tratar so `'` evita
    # decidir se `"a"` abriu ou fechou alguma coisa.
    ".sql": (("--",), ("/*", "*/"), "'"),
    ".yaml": (("#",), None, "\"'"),
    ".yml": (("#",), None, "\"'"),
    ".html": ((), ("<!--", "-->"), ""),
    ".json": ((), None, "\"'"),
}


def _abre_comentario(linha: str, i: int, marca: str) -> bool:
    """A marca em `i` abre comentario de verdade?

    Duas recusas, e cada uma paga um caso concreto:

      - `//` PRECEDIDO DE `:` nunca abre comentario, porque e o `//` de um
        ESQUEMA de URL. E cinto e suspensorio sobre o rastreio de texto
        literal de `sem_comentario`: mesmo que o rastreio erre o estado em
        algum arquivo, o `//` de `https://` nao vira comentario e o achado nao
        desaparece calado. Sem isto, `https://img.bichu.app` viraria
        `https:` e o portao aprovaria a amarracao que ele existe para pegar.
      - `#` em YAML so abre comentario no comeco da linha ou depois de espaco,
        que e a regra da propria linguagem (`a#b` e o texto `a#b`).
    """
    if not linha.startswith(marca, i):
        return False
    if marca == "//" and i > 0 and linha[i - 1] == ":":
        return False
    if marca == "#" and i > 0 and not linha[i - 1].isspace():
        return False
    return True


def sem_comentario(linhas: list[str], sufixo: str) -> list[str]:
    """As mesmas linhas, na mesma ordem e na mesma quantidade, sem comentario.

    MANTEM A NUMERACAO de proposito: o achado continua apontando a linha certa
    do arquivo, e quem abrir o arquivo ve o que o portao viu.

    Anda caractere a caractere porque tirar comentario com `split("//")` e o
    jeito classico de criar um falso NEGATIVO exatamente aqui: `//` e parte de
    `https://`, e cortar na primeira ocorrencia apagaria o host.

    O estado de texto literal ATRAVESSA a linha, e nao reinicia a cada uma.
    Template literal de TypeScript ocupa varias linhas, e uma linha dentro dele
    pode comecar com `https://x.bichu.app` SEM nenhum `:` antes do `//` --
    reiniciando o estado, esse host sairia da varredura.

    SE O RASTREIO SE PERDER, o efeito e PARAR de tirar comentario, isto e,
    voltar a acusar. Erra para o lado que aparece em vermelho, e nao para o
    lado que aprova em silencio: um literal que ficou aberto para sempre deixa
    o resto do arquivo inteiro sendo medido cru.
    """
    sintaxe = SINTAXE_DE_COMENTARIO.get(sufixo)
    if sintaxe is None:
        return list(linhas)
    marcas, bloco, delimitadores = sintaxe
    abre, fecha = bloco if bloco is not None else ("", "")
    saida: list[str] = []
    em_bloco = False
    aberto = ""  # o delimitador de texto literal em curso, ou "" fora dele
    for linha in linhas:
        pedacos: list[str] = []
        i, n = 0, len(linha)
        while i < n:
            if em_bloco:
                fim = linha.find(fecha, i)
                if fim < 0:
                    break
                em_bloco = False
                i = fim + len(fecha)
                continue
            c = linha[i]
            if aberto:
                pedacos.append(c)
                if c == "\\" and i + 1 < n:
                    pedacos.append(linha[i + 1])
                    i += 2
                    continue
                if c == aberto:
                    aberto = ""
                i += 1
                continue
            if c in delimitadores:
                aberto = c
                pedacos.append(c)
                i += 1
                continue
            if abre and linha.startswith(abre, i):
                em_bloco = True
                i += len(abre)
                continue
            if any(_abre_comentario(linha, i, marca) for marca in marcas):
                break
            pedacos.append(c)
            i += 1
        saida.append("".join(pedacos))
    return saida


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

# ---------------------------------------------------------------------------
# A REGRA DA MIGRACAO PEDE HOST, E NAO ESQUEMA.
#
# Ela protege o ponto irreversivel: o banco guarda codigo e chave, nunca URL,
# porque persistir URL transforma a troca de dominio em migracao de dados sobre
# plastico ja impresso.
#
# Ate 20/10/2026 ela media `"http://" in linha or "https://" in linha` -- texto
# cru, sem host. Consequencia MEDIDA no mesmo dia, em
# `migrations/20261019000007_versao-minima-do-app.sql:161`:
#
#     CHECK (store_url ~ '^https://[^[:space:]]+$' AND length(store_url) <= 300)
#
# Aquele `https://` NAO E UM ENDERECO. E a FORMA de uma URL, escrita como
# regra de validacao: ele existe justamente para o banco RECUSAR um endereco
# mal digitado. Nao tem host, nao tem dominio, nao ha nada para empurrar para
# configuracao -- e o portao mandava empurrar. Portao que cobra o conserto de
# quem ja esta certo e ruido, e ruido e o caminho para um portao desligado.
#
# Entao a regra passa a pedir ESQUEMA SEGUIDO DE HOST. Isso nao afrouxa nada,
# e os dois lados estao medidos na isca:
#   - `DEFAULT 'https://img.bichu.app/padrao/capa.jpeg'` continua reprovando;
#   - `CHECK (loja_url ~ '^https://bichu\.app/')` TAMBEM reprova, porque ali o
#     dominio esta escrito e isso e amarracao de verdade, dentro de um `CHECK`;
#   - `CHECK (loja_url ~ '^https://[^[:space:]]+$')` nao reprova, porque depois
#     de `//` vem `[`, que nao comeca host nenhum.
#
# Em lista, e nao solta no meio de `medir()`, por um motivo so: o autoteste
# pergunta "que regras produzem o motivo X?", e uma regra escrita a mao no meio
# da funcao nao tem como ser respondida -- ficaria sem testemunha.
MOTIVO_URL_EM_MIGRACAO = "URL absoluta em migracao"

REGRAS_DE_MIGRACAO = [
    (re.compile(r"https?://[A-Za-z0-9]"), MOTIVO_URL_EM_MIGRACAO),
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
# troca". O argumento segue de pe; o exemplo, nao. O leitor citado
# (`app/lib/telas/rede/local_do_encontro.dart`) saiu em 19/10/2026 com a pagina
# de detalhe do evento (`be057793`, pedido do cliente), e o arquivo de
# configuracao ficou sem ninguem para ler. Em 20/10/2026 as duas chaves sairam,
# porque configuracao de tela que nao existe nao e portabilidade: e um portao
# cobrando, dentro do binario, o valor de um define que o Dart nao compila.
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
MARCA_DE_ISCA = re.compile(r"(?://|--)\s*isca:\s*(.+?)\s*$")

# A anotacao da DISPENSA, e o que cada tipo promete:
#
#   `dispensa-de-comentario` + motivo: a linha e PROSA. O texto CRU dela tem de
#       reprovar com aquele motivo e a linha MEDIDA nao pode. Os dois lados
#       importam: sem o primeiro a testemunha e vazia (uma linha que nunca
#       conteve o defeito passaria mesmo com a dispensa quebrada), e sem o
#       segundo a dispensa nao existe.
#   `dispensa-de-forma` + motivo: a linha e CODIGO e nao reprova nem crua,
#       porque o `https://` dela e a FORMA de uma URL e nao um endereco -- o
#       `CHECK` do Postgres. Esta nao tem como cobrar o lado "cru reprova", e
#       por isso ela nao vale sozinha: ela so prova algo em par com uma linha
#       de `isca` do MESMO motivo no MESMO arquivo, que o autoteste cobra.
#
# A marca aceita `//` e `--` porque as iscas sao duas linguagens: a regra de
# URL em migracao so vale para `migrations/*.sql` e a isca dela e SQL.
#
# Por que esta explicacao escreve `dispensa-de-comentario` SEM os dois-pontos:
# com eles, este proprio comentario entraria como anotacao de um motivo que
# nunca existiu. E o mesmo tropeco que `motivo_anotado` documenta, e ele custa
# uma falha de autoteste que parece defeito do portao.
MARCA_DE_DISPENSA = re.compile(r"(?://|--)\s*dispensa-de-(comentario|forma):\s*(.+?)\s*$")

REGRA_SDK = re.compile(r"""^\s*import\s+.*from\s+['"](@aws-sdk/|@google-cloud/|@azure/)""", re.M)
CAMADAS_PURAS = ("/domain/", "/application/", "/ports/")


def motivo_anotado(linha: str) -> str | None:
    """O motivo que ESTA linha declara acordar, ou None se ela nao declara um.

    A anotacao so vale depois de codigo. Linha que comeca com `//` (ou com
    `--`, desde que a isca da migracao e SQL) e prosa, e prosa nao anota nada
    -- o cabecalho de cada isca explica a convencao e para isso precisa CITAR a
    forma dela, e sem esta condicao a propria explicacao entrava como anotacao
    de um motivo que nunca existiu.

    A anotacao de DISPENSA e o contrario: ela vive numa linha que E prosa, e
    por isso tem leitor proprio (`dispensa_anotada`) sem esta recusa.
    """
    despido = linha.lstrip()
    if despido.startswith("//") or despido.startswith("--"):
        return None
    marca = MARCA_DE_ISCA.search(linha)
    return marca.group(1) if marca is not None else None


def dispensa_anotada(linha: str) -> tuple[str, str] | None:
    """`(tipo, motivo)` da dispensa que ESTA linha declara, ou None.

    Sem a recusa de `motivo_anotado`: a linha de `dispensa-de-comentario` E um
    comentario inteiro -- e exatamente por isso que ela existe.
    """
    marca = MARCA_DE_DISPENSA.search(linha)
    return (marca.group(1), marca.group(2)) if marca is not None else None


def regras_com_motivo(motivo: str) -> list[re.Pattern[str]]:
    """Os padroes que produzem `motivo`, em qualquer das tres familias.

    Existe para o autoteste poder perguntar "este motivo ainda e producivel?"
    sem recopiar regex nenhum: regra recopiada no teste e a regra testando a si
    mesma, e e por isso que REGRAS_DE_MIGRACAO e uma lista.
    """
    return [
        regex
        for familia in (REGRAS_PROVEDOR, REGRAS_HOSTNAME, REGRAS_DE_MIGRACAO)
        for regex, m in familia
        if m == motivo
    ]


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


def medir(caminho: Path, rel: str) -> list[tuple[int, str, str]]:
    """Os achados como dado: `(linha, motivo, texto original da linha)`.

    Linha `0` e achado do ARQUIVO, e nao de uma linha dele.

    Devolve dado, e nao a frase do relatorio, porque o autoteste precisa
    perguntar "esta linha produziu ESTE motivo?" -- e com a frase pronta ele
    teria de reparsear o proprio relatorio para saber, o que torna a cobranca
    refem do formato da mensagem.

    TODAS as tres familias medem o codigo SEM COMENTARIO (ver sem_comentario, e
    o bloco "COMENTARIO NAO E CODIGO" que explica por que), e o achado cita a
    linha ORIGINAL, que e a que a pessoa vai abrir no editor.
    """
    try:
        texto = caminho.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        return [(0, f"nao foi possivel ler: {e}", "")]

    achados: list[tuple[int, str, str]] = []
    linhas = texto.splitlines()
    medidas = sem_comentario(linhas, caminho.suffix)

    familias = [REGRAS_PROVEDOR, REGRAS_HOSTNAME]
    # A regra da migracao protege o ponto irreversivel: o banco guarda codigo e
    # chave, nunca URL. Persistir URL transforma a troca de dominio em migracao
    # de dados sobre plastico ja impresso.
    if rel.startswith("migrations/") and caminho.suffix == ".sql":
        familias.append(REGRAS_DE_MIGRACAO)

    for regras in familias:
        for regex, motivo in regras:
            for n, linha in enumerate(medidas, 1):
                casadas = list(regex.finditer(linha))
                if not casadas:
                    continue
                # So a regra generica aceita terceiro declarado, e so quando
                # TODAS as URLs da linha sao de terceiro: uma linha que mistura
                # o ViaCEP com um host nosso continua acusando, porque o que
                # importa e o host que sobrou, nao o que foi explicado.
                if motivo == MOTIVO_URL_ABSOLUTA and all(
                    host_de_terceiro(linha, m.start()) for m in casadas
                ):
                    continue
                achados.append((n, motivo, linhas[n - 1]))

    # Tambem sem comentario, e pelo mesmo motivo: `// import ... from
    # "@aws-sdk/client-s3"` numa camada pura e uma linha comentada, nao um
    # import. Ela nao entra no grafo de modulos e nao traz SDK nenhum.
    if any(c in f"/{rel}" for c in CAMADAS_PURAS) and REGRA_SDK.search("\n".join(medidas)):
        achados.append(
            (0, "SDK de provedor importado em camada pura (domain/application/ports)", "")
        )

    return achados


def achados_em(caminho: Path, rel: str) -> list[str]:
    """As linhas do relatorio. O formato nao mudou: so a origem do dado mudou."""
    return [
        f"{rel}: {motivo}" if n == 0 else f"{rel}:{n}: {motivo} -> {linha.strip()[:90]}"
        for n, motivo, linha in medir(caminho, rel)
    ]


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


# A isca da regra de migracao. Mora em `tests/portabilidade/` como as outras, e
# NAO em `migrations/`: la o migrador a aplicaria. O autoteste a mede com um
# `rel` de migracao, de proposito, porque a regra so vale para
# `migrations/*.sql` -- e ate 20/10/2026 ela nao tinha testemunha nenhuma.
ISCA_DE_MIGRACAO = "tests/portabilidade/deve-reprovar-migracao.sql"
REL_MEDIDO_DA_ISCA_DE_MIGRACAO = "migrations/__isca-de-portabilidade__.sql"


def _falhas_da_dispensa(
    rel: str, dispensas: list[tuple[int, str, str, str, str]], familia: str
) -> list[str]:
    """Cobra cada linha de dispensa. Ver a direcao C em autoteste()."""
    falhas: list[str] = []
    for n, tipo, motivo, crua, medida in dispensas:
        regras = regras_com_motivo(motivo)
        if not regras:
            falhas.append(
                f'{rel}:{n}: a dispensa espera o motivo "{motivo}", que NAO '
                f"EXISTE MAIS em regra nenhuma ({familia} e as outras duas "
                "familias). Dispensa de um achado que ninguem mais produz nao "
                "dispensa nada, e passa a esconder que a regra foi apagada"
            )
            continue
        if tipo == "comentario":
            if not any(regex.search(crua) for regex in regras):
                falhas.append(
                    f'{rel}:{n}: a linha de dispensa NAO CONTEM o defeito de '
                    f'"{motivo}" nem no texto cru. Ela e uma TESTEMUNHA VAZIA: '
                    "passaria no lado de baixo mesmo com a dispensa de "
                    f"comentario quebrada -> {crua.strip()[:90]}"
                )
            if any(regex.search(medida) for regex in regras):
                falhas.append(
                    f'{rel}:{n}: a dispensa de comentario PAROU DE VALER: a '
                    f'linha medida ainda reprova por "{motivo}". O portao voltou '
                    "a cobrar prosa, que foi o que travou a esteira inteira em "
                    f"20/10/2026 -> {medida.strip()[:90]}"
                )
        elif any(regex.search(medida) for regex in regras):
            falhas.append(
                f'{rel}:{n}: a dispensa de forma PAROU DE VALER: a linha medida '
                f'reprova por "{motivo}". `https://` sem host e a FORMA de uma '
                "URL, nao um endereco, e cobrar conserto de quem ja esta certo e "
                f"o caminho para um portao desligado -> {medida.strip()[:90]}"
            )
    return falhas


def autoteste_da_migracao(raiz: Path) -> list[str]:
    """A isca de `migrations/*.sql`, medida pelo caminho de verdade (`medir`).

    Usa `medir` e nao regex recopiado aqui, porque regra recopiada no teste e a
    regra testando a si mesma. Cobra tres coisas:
      - cada linha de `isca` reprova com o motivo dela (a regra ainda enxerga);
      - nenhuma linha de dispensa reprova (a dispensa vale);
      - a de `dispensa-de-comentario` reprovaria CRUA (a testemunha nao e vazia).
    """
    falhas: list[str] = []
    caminho = raiz / ISCA_DE_MIGRACAO
    if not caminho.is_file():
        return [
            f"{ISCA_DE_MIGRACAO}: isca ausente. A regra "
            f'"{MOTIVO_URL_EM_MIGRACAO}" e as duas dispensas dela ficam sem '
            "testemunha, e o portao passa a valer pela confianca do dia em que "
            "foi escrito"
        ]
    try:
        linhas = caminho.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError as e:
        return [f"{ISCA_DE_MIGRACAO}: nao foi possivel ler a isca: {e}"]

    medidas = sem_comentario(linhas, caminho.suffix)
    motivos_por_linha: dict[int, set[str]] = {}
    for n, motivo, _ in medir(caminho, REL_MEDIDO_DA_ISCA_DE_MIGRACAO):
        motivos_por_linha.setdefault(n, set()).add(motivo)

    anotadas = 0
    dispensas: list[tuple[int, str, str, str, str]] = []
    for n, (crua, medida) in enumerate(zip(linhas, medidas), 1):
        esperado = motivo_anotado(crua)
        if esperado is not None:
            anotadas += 1
            if esperado not in motivos_por_linha.get(n, set()):
                falhas.append(
                    f'{ISCA_DE_MIGRACAO}:{n}: a isca espera "{esperado}" e a '
                    f"varredura nao deu esse achado nesta linha (deu "
                    f"{sorted(motivos_por_linha.get(n, set())) or 'nada'}). A "
                    "regra foi apagada, renomeada ou apertada demais para o "
                    f"proprio caso dela -> {crua.strip()[:90]}"
                )
        marca = dispensa_anotada(crua)
        if marca is not None:
            dispensas.append((n, marca[0], marca[1], crua, medida))
            if marca[1] in motivos_por_linha.get(n, set()):
                falhas.append(
                    f'{ISCA_DE_MIGRACAO}:{n}: a linha de dispensa REPROVOU por '
                    f'"{marca[1]}" na varredura de verdade. A dispensa de '
                    f"{marca[0]} nao esta valendo -> {crua.strip()[:90]}"
                )

    if not anotadas:
        falhas.append(
            f"{ISCA_DE_MIGRACAO}: nenhuma linha anotada com `isca`. Sem ela as "
            "dispensas abaixo nao provam nada: um portao que nao acusa NADA "
            "passa nelas todas"
        )
    if not dispensas:
        falhas.append(
            f"{ISCA_DE_MIGRACAO}: nenhuma linha de dispensa. As duas que "
            "travaram a esteira em 20/10/2026 -- prosa em comentario `--` e "
            "`https://` sem host num `CHECK` -- voltam a nao ter testemunha"
        )
    falhas.extend(_falhas_da_dispensa(ISCA_DE_MIGRACAO, dispensas, "REGRAS_DE_MIGRACAO"))
    return falhas


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
    """
    falhas: list[str] = []
    iscas = (
        ("tests/portabilidade/deve-reprovar-provedor.ts", REGRAS_PROVEDOR, "REGRAS_PROVEDOR"),
        ("tests/portabilidade/deve-reprovar-hostname.ts", REGRAS_HOSTNAME, "REGRAS_HOSTNAME"),
    )
    for rel, regras, familia in iscas:
        caminho = raiz / rel
        if not caminho.is_file():
            falhas.append(
                f"{rel}: isca ausente. Sem ela o portao passa a valer por "
                "confianca, e ninguem sabe se ele ainda enxerga"
            )
            continue
        try:
            linhas = caminho.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError as e:
            falhas.append(f"{rel}: nao foi possivel ler a isca: {e}")
            continue

        # A isca e lida DUAS VEZES: crua, de onde sai a anotacao (ela mora num
        # comentario), e MEDIDA, que e o texto contra o qual a regra e cobrada.
        #
        # Cobrar a regra contra o texto CRU seria o autoteste deixando de
        # testemunhar a varredura no dia em que elas discordassem -- e e
        # exatamente nisso que elas agora podem discordar.
        medidas = sem_comentario(linhas, caminho.suffix)

        anotadas: list[tuple[int, str, str]] = []  # (numero, motivo esperado, linha MEDIDA)
        dispensas: list[tuple[int, str, str, str, str]] = []  # (n, tipo, motivo, crua, medida)
        for n, (crua, medida) in enumerate(zip(linhas, medidas), 1):
            esperado = motivo_anotado(crua)
            if esperado is not None:
                anotadas.append((n, esperado, medida))
            marca = dispensa_anotada(crua)
            if marca is not None:
                dispensas.append((n, marca[0], marca[1], crua, medida))

        if not anotadas:
            falhas.append(
                f"{rel}: nenhuma linha anotada com `// isca: <motivo>`. Sem as "
                "anotacoes o autoteste nao tem testemunha independente da lista "
                f"de regras, e uma regra apagada de {familia} passaria em branco"
            )

        # Direcao A: regra -> isca.
        for regex, motivo in regras:
            if not any(regex.search(linha) for _, esperado, linha in anotadas if esperado == motivo):
                falhas.append(
                    f'{rel}: NENHUMA LINHA ANOTADA DISPARA a regra "{motivo}" '
                    f"de {familia} (padrao: {regex.pattern}). Ou a linha de isca "
                    "que a provava saiu do arquivo, ou perdeu a anotacao, ou a "
                    "regra ficou estreita demais para o proprio caso dela"
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

        # Direcao C: a DISPENSA DE COMENTARIO, nos dois lados.
        #
        # Esta e a testemunha da unica coisa que a mudanca de 20/10/2026 fez um
        # achado DEIXAR de sair. Os dois lados sao obrigatorios, e cada um pega
        # um defeito diferente:
        #   - o texto CRU tem de reprovar. Sem isto a testemunha e VAZIA: uma
        #     linha de prosa sem host nenhum passaria no segundo lado para
        #     sempre, inclusive no dia em que a dispensa parasse de funcionar.
        #   - a linha MEDIDA nao pode reprovar. Sem isto a dispensa nao vale
        #     nada, e o portao volta a cobrar prosa.
        falhas.extend(_falhas_da_dispensa(rel, dispensas, familia))

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

    falhas.extend(autoteste_da_migracao(raiz))

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
