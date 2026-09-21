# ADR-0016: Camada de gateway em `/v1` na borda, sem reescrita de caminho

**Status:** aceito
**Emenda 1, 21/09/2026:** a secao 4 recusou teto na borda apoiada na premissa
de que o servico aplicava `x-rate-limit`. **Ele nao aplica.** A conclusao (aplicar
no servico) fica; a premissa foi corrigida e a aplicacao passa a ser estrutural.
Ver a emenda no fim do documento.
**Data:** 2026-09-17
**Revisa:** ADR-0001 (a seção "Borda" e a menção a `media` como primeira
fronteira extraível)

## Contexto

O cliente decidiu, por escrito: *"precisamos implementar uma camada de gateway
/v1 e não deixar a aplicação chamar o endpoint final direto"*, e antes disso
*"mantenha a porta aberta para micro-serviço"*.

Parte disso já existe e vale registrar antes de decidir, para não construir o que
está construído. O container `api` **não publica porta nenhuma**; quem publica
3000 e 3001 no host é o Caddy, e `api:3000` só existe dentro da rede do compose.
O app já não alcança o serviço final direto.

O que não existe é a parte que interessa. O Caddy é um `handle { reverse_proxy
api:3000 }` **catch-all**: ele não conhece `/v1` e não conhece caminho nenhum.
O `/v1` é montado **dentro do Fastify** (`PREFIXO_DA_API`, `src/bin/api.ts`).
Quer dizer: o prefixo pertence ao monólito, e a borda é um encanamento cego.

A consequência é a que o cliente nomeou. Quando `media` for extraído — e o
ADR-0001 nomeia `media` como a primeira fronteira extraível — **não existe
costura de roteamento por caminho** onde apoiar a extração. Ela teria que ser
inventada com o app já publicado em loja, e aí cada caminho que muda custa uma
versão aprovada pela Apple e pelo Google mais meses convivendo com as duas
formas.

Registro uma distinção de nome, uma vez, porque ela muda o que este ADR
constrói e não muda a decisão: o que foi pedido é um **gateway** (borda genérica
que roteia e protege), não um **BFF** (camada por cliente que agrega chamadas e
devolve a tela pronta). ADR-0001 recusou o segundo, e essa recusa continua de pé
— não há segundo cliente e a API é modelada por caso de uso. Este ADR constrói o
primeiro, inteiro.

### A objeção que precisa ser respondida antes, não depois

Gateway costuma dar errado quando **duplica política**. Os tetos de chamada deste
produto vivem no contrato — **120 entradas de `x-rate-limit`, medidas em
`api/openapi.yaml` hoje** — e são aplicados na aplicação. Se a borda também
aplicar teto por operação, passam a existir duas fontes, e elas divergem em
silêncio: ninguém recebe erro quando o número da borda e o número do contrato se
afastam, só um comportamento que nenhum dos dois documentos descreve.

Vale para caminho pelo mesmo motivo, e este é o ponto menos óbvio. Gateway que
**reescreve** caminho faz com que o caminho declarado no contrato deixe de ser o
caminho que o serviço recebe. A partir daí, para saber o que uma operação
responde é preciso ler dois arquivos, e o segundo não é revisado como contrato.

## Decisão

### 1. A borda passa a conhecer `/v1`, e **não reescreve caminho**

O Caddy deixa de ser catch-all e ganha uma tabela de roteamento por prefixo. A
regra que vale sobre todo o resto deste ADR:

> **O caminho que o app envia é o caminho que o serviço recebe é o caminho que o
> contrato declara.** A borda escolhe *para onde* a requisição vai. Ela nunca
> altera o que ela é.

Por isso `/v1` continua montado no Fastify (`PREFIXO_DA_API`) **e também**
aparece na borda. Isso não é política duplicada: é a mesma constante usada por
dois componentes que precisam concordar, e concordância verificável é diferente
de política duplicada. A verificação está no item 6.

A alternativa era a borda absorver o prefixo (`handle_path /v1/*`, que o remove
antes de repassar) e o serviço servir na raiz. Foi descartada por dois motivos.
O primeiro é o de cima: com reescrita, o contrato deixa de descrever o que o
serviço vê. O segundo é operacional: com reescrita, reproduzir uma requisição
contra o serviço direto, sem a borda, exige saber de cor o que a borda tira —
e é exatamente isso que alguém precisa fazer às três da manhã para separar
defeito de serviço de defeito de borda.

### 2. Roteamento por prefixo, com a extração já escrita

```
/v1/media/*   ->  api:3000   # bloco próprio desde HOJE, com um upstream só
/v1/*         ->  api:3000
/.well-known/*->  ver ADR-0017
```

O bloco `/v1/media/*` existe desde hoje apontando para o mesmo lugar que o
catch-all. Ele não faz nada. **É esse o ponto:** extrair `media` passa a ser
trocar `api:3000` por `media:3000` numa linha do Caddyfile, e mais nada. Sem
versão nova do app, sem mudança no contrato, sem caminho novo.

Costura que só é escrita no dia da extração é costura inventada sob pressão, com
o app publicado. Escrita hoje, com um upstream só, ela custa três linhas e é
exercitada por todo o tráfego de mídia desde a primeira requisição — o que
significa que ela está certa quando for necessária, em vez de ser testada pela
primeira vez no dia em que importa.

### 3. Os caminhos de mídia mudam agora, enquanto custam quase nada

O item 2 só entrega o que promete se `media` for roteável por prefixo, e hoje
não é. As cinco operações de mídia moram sob três prefixos diferentes:

```
POST   /v1/pets/{petId}/photo-upload-intent
POST   /v1/found-reports/{foundReportId}/photo-upload-intent
POST   /v1/finder/found-report/photo-upload-intent
POST   /v1/pets/{petId}/photos
DELETE /v1/pets/{petId}/photos/{photoId}
```

**O corte não é "os endpoints de foto". É o trabalho de mídia.** Das cinco, três
são mídia pura: emitir credencial de upload assinada, e nada além disso. As
outras duas são trabalho de `pets` — confirmar que a foto ficou pronta, escolher
a principal, apagar da lista do pet — e só referenciam mídia.

Então movem-se três, e só três:

| De | Para |
|---|---|
| `POST /v1/pets/{petId}/photo-upload-intent` | `POST /v1/media/pet-photo-intents` |
| `POST /v1/found-reports/{foundReportId}/photo-upload-intent` | `POST /v1/media/found-report-photo-intents` |
| `POST /v1/finder/found-report/photo-upload-intent` | `POST /v1/media/finder-photo-intents` |

O id do alvo (`pet_id`, `found_report_id`) sai do caminho e entra no corpo. O
achador continua sem id nenhum, porque o `finderToken` já endereça (SEC-001).
Cada uma mantém o `security` que já tinha — são três esquemas diferentes
(`bearerAuth` nas duas primeiras, `finderToken` na terceira), e é por isso que
elas **não** viram uma operação só com um campo `target`: unificar significaria
uma operação com três esquemas de credencial, e a regra deste projeto é que a
credencial exigida seja legível operação a operação.

`POST /v1/pets/{petId}/photos` e `DELETE /v1/pets/{petId}/photos/{photoId}`
**ficam onde estão**. Elas são a lista de fotos de um pet, e essa lista é do
domínio `pets`.

**O limite honesto desta decisão, que precisa estar escrito:** extrair `media`
amanhã não leva essas duas junto. O monólito continua dono delas e passa a falar
com o serviço de mídia por porta. Quem ler "media é a primeira fronteira
extraível" e imaginar que todo o assunto foto sai, vai se surpreender — então
está dito aqui.

**A janela.** O app ainda não está publicado, por decisão do cliente de tirar a
publicação do caminho crítico. Mudar caminho hoje custa três chamadas no cliente
Flutter. Depois de publicado custa uma versão aprovada nas duas lojas e meses
servindo as duas formas. A decisão é hoje porque hoje é quando ela é barata, não
porque `media` vai ser extraído em breve — ele provavelmente não vai, dentro
deste prazo.

### 4. O teto por operação continua no contrato. A borda faz proteção grossa

Concordo com a separação proposta, e o motivo é o de sempre: **a fonte do número
tem que ser uma só, e ela tem que ser a que já é revisada como contrato.**

| | Onde | O quê |
|---|---|---|
| **Borda** | `infra/caddy/Caddyfile` | TLS, roteamento, tamanho máximo de corpo e de cabeçalho, tempos limite, CORS, higiene de cabeçalho, correlação |
| **Serviço** | `api/openapi.yaml` + aplicação | **todo** `x-rate-limit`: dimensão, `counts`, `window`, `when`, `applies_to` e, principalmente, `on_exceed` |

O argumento decisivo não é "para não duplicar". É que **a borda não consegue
aplicar o que este contrato declara**, e um gateway que aplica metade de uma
política é pior que um que não aplica nada, porque parece que aplica.

As dimensões deste produto são de domínio: `[ip, code]` por causa do CGNAT,
`[code, finder_identity]`, `[account]`, `[token_family]`, `[report_target]`.
A borda não sabe o que é um `code`, uma `finder_identity` ou uma família de
token. E `on_exceed` — que é o campo que separa orçamento de requisição de
orçamento de efeito — pede coisas que só o domínio faz: `group_notification`
anexa a uma conversa existente, `hold_for_review` grava sem notificar,
`raise_queue_priority` mexe numa fila de moderação. Caddy não tem como fazer
nenhuma delas. Sobra `deny_429`, que é o único valor que a borda saberia aplicar
— e aplicar só esse inverteria o invariante nº 1 do contrato: **nenhum aviso ao
tutor é descartado por limite**. Um `429` na borda, no único toque que o produto
existe para receber, é o pior defeito possível deste sistema, e ele entraria
justamente por uma camada que foi posta ali para proteger.

**Não há teto de requisições por IP na borda, e a ausência é decisão.** O Caddy,
sem plugin, não tem limitador de taxa. Plugin significa imagem própria na borda,
que é onde a substituibilidade conquistada pelo ADR-0001 começa a ser gasta — e
o ganho seria nenhum, porque os tetos por IP já existem em `x-rate-limit` e são
aplicados no serviço, que é o único lugar que sabe o que é um `code` e o que é
uma `finder_identity`. Está escrito no Caddyfile, no lugar onde alguém procuraria
e não acharia: quem for procurar proteção de taxa na borda precisa saber que ela
não está lá de propósito, em vez de concluir que foi esquecida.

**A ressalva que eu acrescento, e ela é a parte que costuma faltar:** os números
grossos da borda (tamanho de corpo, de cabeçalho, tempos limite) também são
números, e número que só existe num arquivo de configuração é número sem dono.
Eles passam a ser declarados no contrato, na raiz, em `x-edge-limits`, e o
Caddyfile é conferido contra eles na esteira. Sem essa conferência, a separação
"borda grossa, contrato fino" vira a mesma divergência silenciosa por outro
caminho — só que num arquivo que ninguém revisa como contrato.

Requisito, para quem monta a esteira: um teste que leia `x-edge-limits` de
`api/openapi.yaml` (hoje: 12 MiB de corpo, 16 KiB de cabeçalho, 30 s de leitura
e de escrita) e os números do `Caddyfile` e **reprove quando diferirem**,
junto com um caso que ele precisa reprovar, guardado no repositório. Verificação
que não consegue verificar precisa reprovar, nunca aprovar: se o teste não achar
o bloco em um dos dois arquivos, ele falha com o motivo, em vez de passar.

### 5. A borda **não valida token**, e isso é decisão, não omissão

O cânone diz que o gateway valida o token na entrada e o serviço revalida. Aqui
eu divirjo, com motivo.

Este produto tem cinco esquemas de credencial: `bearerAuth` (JWT RS256),
`tagCode`, `finderToken`, `reauth` e `webhookSignature`. Das 87 operações, **26
são `security: []`** e outras 8 aceitam credencial que não é token de conta. Uma
borda que validasse só o `bearerAuth` cobriria menos da metade da superfície, e o
efeito prático de uma verificação parcial é pior do que o de nenhuma: quem lê
"o gateway valida" assume o resto.

Some-se que validar RS256 na borda exige que ela busque e cacheie JWKS, com
rotação de chave, e o Caddy não faz isso sem plugin. Plugin na borda significa
imagem própria, e imagem própria na borda é onde a substituibilidade que o
ADR-0001 conquistou começa a ser gasta.

E o serviço valida tudo, sempre, por decisão já tomada no ADR-0001 (defesa em
profundidade). A validação na borda seria, hoje, exclusivamente uma economia de
CPU do serviço.

**O que a borda faz em matéria de identidade:** nada, exceto uma coisa —
**remover da requisição de entrada todo cabeçalho que o sistema trataria como
interno.** Hoje não existe nenhum. Escrever a regra hoje custa uma linha e
impede o vazamento clássico: no dia em que alguém introduzir um `X-Bichu-User`
preenchido pela borda, um cliente que enviar esse cabeçalho de fora não será
acreditado. Regra escrita depois desse dia chega depois do incidente.

**Gatilho para validar na borda:** quando o custo de tráfego com token inválido
chegando ao serviço for medido e incomodar, ou quando existir um segundo
upstream. Nos dois casos o serviço continua revalidando; a borda só passa a
rejeitar o lixo mais cedo.

### 6. Como a concordância entre borda e serviço é verificada

O `/v1` existe em três lugares: no `servers` do contrato, no `PREFIXO_DA_API` do
Fastify e na tabela de roteamento do Caddy. Três cópias de uma constante é o
começo de uma divergência, então elas são conferidas em vez de confiadas:

- **na subida do serviço**, `carregarContrato` já derruba a aplicação quando uma
  operação não declara `security`; o mesmo ponto passa a conferir que o prefixo
  montado é o do `servers` do contrato, e a derrubar com a mensagem se não for;
- **na esteira**, o teste do item 4 confere o Caddyfile contra o contrato.

### 7. O que **não** muda

O container `api` continua sem publicar porta. Era verdade antes e continua
sendo, e é ela que sustenta literalmente o pedido do cliente: não existe caminho
do app até o serviço final que não passe pela borda.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Manter o catch-all e inventar o roteamento no dia da extração | zero trabalho hoje | a costura nasce com o app publicado; o primeiro caminho novo custa duas aprovações de loja | é exatamente o custo que o cliente pediu para evitar |
| Borda absorve `/v1` (`handle_path`) e o serviço serve na raiz | uma cópia só do prefixo | o caminho do contrato deixa de ser o que o serviço recebe; reproduzir uma chamada sem a borda exige saber o que ela remove | troca uma duplicação verificável por uma divergência invisível |
| Rotear `media` por lista explícita de caminhos na borda | não mexe no contrato | a lista precisa ser mantida à mão e envelhece a cada endpoint novo; quando ela erra, o erro é uma rota indo para o upstream errado, em silêncio | o modo de falha é silencioso, e a alternativa custa três chamadas no app |
| Assumir que `media` fica no monólito e nomear outra fronteira | honesto e barato | nenhuma outra fronteira é mais extraível: `lostfound` e `messaging` são o núcleo, `identity` é dependência de todo o resto | fecharia, na prática, a porta que o cliente pediu para manter aberta |
| Produto de gateway gerenciado do GCP (API Gateway, Apigee) | políticas prontas, cota, autenticação | amarração ao provedor numa camada que o ADR-0001 conquistou como substituível; e nenhuma delas resolve `on_exceed` de domínio | custo de amarração sem resolver o problema que temos |
| Borda aplica também `x-rate-limit` | teto antes de custar CPU do serviço | duas fontes que divergem sem sinal; e a borda só sabe `deny_429`, que viola o invariante de nunca descartar aviso | o único valor aplicável é o único proibido no fluxo crítico |

## Consequências

**Fica mais fácil:** extrair `media` (uma linha de configuração da borda);
introduzir `/v2` no futuro (um bloco novo apontando para outro upstream, com o
`/v1` continuando servido para o app antigo que está instalado); e separar
defeito de borda de defeito de serviço, porque a borda não altera a requisição.

**Fica mais difícil:** mover uma operação de prefixo depois que o app for
publicado — o que é a razão de mover as três de mídia agora. E passa a existir
um arquivo de configuração (o Caddyfile) que é parte do contrato operacional e
precisa ser revisado como tal, com a esteira conferindo.

**Passa a ser irreversível dentro do MVP:** os três caminhos de mídia, depois de
o app ir para a loja. Antes disso, não.

**Dívida aceita, com gatilho:** a borda não valida token (item 5) nem aplica teto
de taxa (item 4), e o limite de chamadas do MVP continua rodando em processo,
numa tarefa só — quando passar de
uma tarefa, o contador sai para armazenamento compartilhado, como já registrado
em `docs/03-arquitetura.md`. Nenhum dos dois é resolvido pela borda, e o gateway
não deve ser vendido internamente como se resolvesse.

---

# Emenda 1 (ACEITA) — 21/09/2026: a premissa da seção 4 era falsa

**Status:** aceita. Corrige um erro deste documento, escrito por mim.

## O fato

**Nenhuma rota aplica `x-rate-limit`.** A porta `RateLimitStore`
(`src/shared/ports/rate-limit-store.ts`) existe; as três implementações
(`criarContadorEmMemoria`, `criarContadorEmPostgres`, `criarContadorDesligado`)
existem; `defineRoute` obriga toda rota a declarar `rateLimit` sob pena de **erro
de compilação**; o contrato declara os tetos em 80 operações. E **nada chama
`hit()`** fora de teste. `src/shared/http/server.ts` não menciona limite de
chamada em lugar nenhum: o contador nunca é construído, nunca é injetado, nunca é
consultado.

Conferido em 21/09 por busca direta em `src/`, com controle positivo para não
repetir o engano de `--include` desta máquina.

**O portão não pega, e é por desenho.**
`infra/verificacao/verificar-limite-de-chamada.mjs` lê `api/openapi.yaml` e prova
que o teto está **declarado** e que o vocabulário é reconhecido. Ele nunca abre
`src/`. Passa com "80 operacoes, 0 achados" enquanto a aplicação não aplica nada.

## Por que isto é erro deste ADR, e não só da implementação

A seção 4 recusou teto na borda, e a recusa foi fundamentada assim:

> "o ganho seria nenhum, porque os tetos por IP já existem em `x-rate-limit` e
> são aplicados no serviço"

**Essa oração subordinada é a premissa inteira da decisão, e ela é falsa.** O
`infra/caddy/Caddyfile` repete a afirmação em duas linhas (16 e 170) e, com isso,
a borda declina explicitamente de proteger apoiada numa proteção que não existe.
O resultado é que **não há aplicação em lugar nenhum**, e cada um dos dois lados
tem escrito que o outro cuida disso.

É a família de defeito que este projeto já nomeou: **verde produzido por não
verificar.** O agravante aqui é que o comentário de infraestrutura afirma o
oposto do que o código faz, então quem lê para conferir encontra a garantia
escrita e para de procurar.

## A decisão

**1. A aplicação continua no serviço.** A seção 4 estava certa na conclusão e
errada na premissa. Os motivos, agora sem apoiar-se em algo inexistente:

- **A borda não consegue expressar a política.** As dimensões declaradas incluem
  `code`, `account`, `token_family`, `email`, `finder_identity` e o recorte
  `applies_to: invalid_attempts`. O Caddy enxerga IP e caminho. Ele não sabe
  contar por conta nem por família de token, e **não tem como saber se uma
  tentativa foi inválida** — isso é juízo do serviço, depois de normalizar e
  consultar. A maior parte da política é inexprimível na borda por construção,
  não por configuração.
- **O argumento do toque continua valendo e é de produto.** Achadores do mesmo
  animal compartilham IP com frequência (mesma rede, e o CGNAT das operadoras
  brasileiras agrupa muita gente atrás de poucos endereços). Teto por IP na borda
  derrubaria o segundo achador, que é justamente o toque que o produto existe
  para receber.

**2. A aplicação passa a ser estrutural, não lembrada.** O defeito não é que
alguém esqueceu de chamar `hit()`: é que **era possível esquecer**. `defineRoute`
já torna a *omissão da declaração* um erro de compilação; o registro da rota
passa a **aplicar** o que foi declarado, de modo que uma rota registrada sem os
seus tetos deixe de ser exprimível. Portão que persegue esquecimento é inferior a
desenho em que não há o que esquecer.

**3. A subida recusa o limitador desligado fora de desenvolvimento.**
`criarContadorDesligado` existe e é legítimo em teste. Com
`RATE_LIMIT_DRIVER=disabled` em qualquer ambiente que não seja `dev`, a aplicação
**não sobe**, com o motivo na mensagem. É o mesmo padrão da conferência de
tamanho de chave da cifra: falha ruidosa onde o silêncio é caro.

**4. A borda ganha um teto volumétrico grosso, e ele não substitui nada.** Um
teto por IP **muito acima** do uso legítimo, dimensionado para proteger
disponibilidade da origem e nunca para tocar um achador real. Ele existe porque a
seção 4 deixou a origem sem nenhuma proteção volumétrica ao delegar tudo ao
serviço, e porque defesa em profundidade não admite um único ponto. **O número
tem de ser justificado contra o pico legítimo medido**, e enquanto não houver
medição ele fica alto de propósito.

**5. O portão passa a provar vigência, com isca.** Prova por declaração é o que
falhou. O portão novo exerce o serviço em execução: ultrapassa o teto de uma rota
real e exige o 429. E, pelo padrão desta casa, **a prova negativa mora no
repositório**: o mesmo caso rodado com o limitador desligado **precisa
reprovar**. Um teste de limite que passa com o limitador desligado não testa
limite nenhum — e é exatamente o estado de hoje, em que o 429 só existe dentro do
teste.

O portão de declaração continua existindo. Ele responde outra pergunta e
continua útil; o que ele não pode é seguir sendo lido como prova de vigência.

## Consequências

**A superfície mais exposta não é a plaquinha.** Ordem de gravidade, hoje:

1. **`POST /webhooks/postmark`.** Internet aberta, sem `basic_auth` na borda (e a
   ausência é decisão registrada), autenticado só pelo segredo, com conferência
   de assinatura **em tempo constante**, que é deliberadamente cara. O teto de 20
   inválidas por hora é descrito no próprio arquivo como a única defesa contra
   transformar a rota num moedor de CPU. **Ele não é aplicado, e a borda também
   não protege.** É a única rota do produto hoje sem nenhum freio em nenhuma
   camada.
2. **Identidade.** `token_family` 10/min na renovação (que é o freio de reuso de
   token de renovação), `email` 3/h na recuperação de senha, `ip` 20/h no
   cadastro — este último parte do que sustenta o argumento do SEC-003 e do
   ADR-0020.
3. **Resolução da plaquinha.** O que se perde aqui é disponibilidade e o
   `notify_owner` de 100/24h por código, que é o sinal de suspeita de clonagem.
   **O tamanho do código não depende disto**: ver ADR-0004, seção 14.

**Dívida quitada e dívida que continua:** a "dívida aceita, com gatilho" da
seção 6 registrava que o limite roda em processo e precisa trocar de driver antes
da segunda instância. Essa continua. O que esta emenda acrescenta é que, antes
dela, **existe o problema anterior de o limite não rodar**.
