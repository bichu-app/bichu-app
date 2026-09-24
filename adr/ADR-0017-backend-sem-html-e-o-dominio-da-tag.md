# ADR-0017: O serviço Node não renderiza HTML, e quem serve o domínio da tag

**Status:** aceito, com emendas 1 e 3; emenda 2 superada pela 3 em 23/09/2026
**Data:** 2026-09-17
**Depende de:** ADR-0016 (a borda que torna a separação roteável)
**Revisa:** ADR-0005 ("uma página, duas portas"), ADR-0004 (o que o QR codifica)

**Emenda 1, ACEITA em 21/09/2026:** cai o invariante do item 2 que exigia o
**mesmo host** em `TAG_BASE_URL` e `WEB_BASE_URL`. Os dois passam a ser hosts
distintos do mesmo domínio (`tag.bichu.app` e `bichu.app`, decisão do cliente de
19/09), e a regra dos arquivos de associação de deep link deixa de ser derivada
daquele invariante: **cada host que aparece num link nosso que precisa abrir o
app serve a sua própria cópia de `/.well-known/`**. A emenda está no fim deste
documento e **substitui**, onde conflitar, o que o item 2 diz sobre igualdade de
host e o que o item 3 diz sobre "o host, que é `TAG_BASE_URL` = `WEB_BASE_URL`".
Todo o resto (zero `text/html`, as três variáveis, os três requisitos do arquivo
de associação, o gatilho datado do item 4 e a borda fechada do item 5) continua
valendo sem alteração.

**Emenda 2, SUPERADA pela emenda 3 em 23/09/2026 (era proposta em 22/09):** nada é revogado. A
emenda registra que as oito rotas deste quadro respondem **404 em produção**
(medido de fora em 21/09) e que o gatilho datado do item 4 cobre **uma** delas.
Ela estende esse gatilho a `/verificar-email` e `/redefinir-senha`, cujos links
o back-end **já emite** por e-mail, e deixa para o cliente a escolha de onde as
páginas moram. Está no fim deste documento.

**Emenda 3, ACEITA em 23/09/2026 (decisão do cliente):** o "outro time web"
passa a ser **este squad**. O site (institucional e as oito rotas públicas) é
construído aqui, roda na mesma VM da API do seu ambiente (ADR-0029), em **imagem separada**, e vai ao ar em
`bichu.app`. O serviço Node da API **continua sem servir HTML**: o item 1 fica
de pé sem exceção, e a exceção de back-end prevista no item 4 e estendida pela
emenda 2 **deixa de existir**. A emenda 2 fica como registro do diagnóstico, e a
decisão dela é substituída. Stack, forma do site e roteamento de hosts estão no
ADR-0028. A emenda está no fim deste documento.

## Contexto

O cliente decidiu, por escrito: *"vamos subir essa parte da aplicação junto com
o site institucional em um subdomínio ou endereço específico, se essa parte da
experiência é uma aplicação web, não tem nada a ver com essa fase do produto,
deve ser tocado por outro time web"*.

Ele já havia fixado que o site institucional é outro projeto e outro servidor, e
que o front do produto é o app Flutter. Agora estendeu a regra: **este serviço
Node é só back-end, e não renderiza HTML.**

O que sai daqui são 8 caminhos, 12 operações e 21 respostas `text/html`:

```
GET      /t/{code}                     200 404 410   a página que o estranho abre ao ler a tag
GET      /c/{finderToken}              200 410       a conversa de quem avisou sem ter conta
GET      /cartaz/{shareToken}          200 410       o cartaz do pet perdido
GET      /p/{shareToken}               200 410       a página pública do caso
GET      /@{slug}                      200 404       o perfil público do pet
GET/POST /verificar-email              200 410       confirmação de e-mail
GET/POST /redefinir-senha              200 410 422   redefinição de senha
GET/POST /transferencia/{cancelToken}  200 410       cancelamento de transferência de pet
```

## Decisão

### 1. Zero `text/html`. A lógica fica; a renderização vai embora

As 8 rotas **não somem** — o que muda é quem as consome. Resolver o token,
decidir entre 200, 404 e 410, não expor telefone nem endereço, mediar o contato:
tudo isso continua no back-end, onde sempre esteve, porque é regra de negócio e
regra de negócio vive no servidor. O que sai é o template.

A maior parte do contrato JSON que substitui os 21 `text/html` **já existe**,
porque a página sempre foi uma casca sobre a mesma operação:

| Página que sai | Operação JSON que o front web passa a chamar |
|---|---|
| `GET /t/{code}` | `GET /v1/tags/{code}` e `POST /v1/tags/{code}/found-reports` |
| `GET /c/{finderToken}` | `GET /v1/finder/conversation` |
| `GET /p/{shareToken}` | `GET /v1/public/lost-cases/{shareToken}` |
| `GET /@{slug}` | `GET /v1/public/pets/{slug}` |
| `GET/POST /verificar-email` | `POST /v1/auth/email-verification/confirm` |
| `POST /redefinir-senha` | `POST /v1/auth/password-reset/confirm` |

Faltavam quatro, e elas entram no contrato nesta rodada:

- `GET /v1/public/lost-cases/{shareToken}/poster` — os dados do cartaz. O cartaz
  não é a página do caso: ele é feito para ser impresso e colado em poste, então
  traz o que cabe numa folha vista de longe e traz o link curto que vira o QR.
- `GET /v1/public/transfers/{cancelToken}` e
  `POST /v1/public/transfers/{cancelToken}/cancel` — cancelar a transferência
  **sem conta**, pelo token que chegou por e-mail. O cancelamento que já existe
  (`POST /v1/pets/transfers/{transferId}/cancel`) exige conta e id, e não serve
  para quem clicou no link do e-mail.
- `GET /v1/public/password-reset/{token}` — dizer se o link ainda vale **antes**
  de a pessoa digitar a senha nova. Sem isso, a tela só descobre que o link
  venceu depois que a pessoa escolheu e confirmou uma senha, que é o pior
  momento possível para dar essa notícia.

**O 410 com `next_action` atravessa igual.** Ele já é `application/problem+json`
conforme a RFC 9457, e `next_action` já é campo do `Problem`. O front web decide
pelo `type`, nunca pelo texto — a mesma regra que vale para o app. A tag revogada
continua respondendo 410 com `next_action`, nunca 404 (ADR-0004), e agora quem
traduz isso em tela é o outro time. Ou seja: **o comportamento que o contrato já
declara é o que a página precisa**, e nada de novo foi inventado para ela.

### 2. `PUBLIC_BASE_URL` se parte em três, e este é o item crítico

Hoje **uma** variável carrega cinco coisas ao mesmo tempo: o que o QR codifica, o
cartaz, o link do caso, os links dos e-mails e o destino do deep link. Enquanto
tudo morava no mesmo serviço, isso era economia. No momento em que as páginas
mudam de host, a mesma variável muda as cinco — e duas delas **não podem mudar**:
o domínio já impresso na plaquinha e o destino do deep link.

| Variável | O que é | Reversível? |
|---|---|---|
| `TAG_BASE_URL` | o que o QR da plaquinha codifica (`{TAG_BASE_URL}/t/{code}`) | **não, depois de impressa** |
| `WEB_BASE_URL` | onde as páginas públicas vivem: cartaz, caso, perfil, conversa do achador, verificação de e-mail, redefinição de senha, cancelamento de transferência. É a base dos links dos e-mails | sim |
| `API_BASE_URL` | este serviço | sim |

**Invariante, e ele é verificado na subida, não confiado:** o host de
`TAG_BASE_URL` e o host de `WEB_BASE_URL` são **o mesmo**. Se diferirem, o link
da plaquinha aponta para um lugar onde a página não está, e o deep link deixa de
abrir o app. A aplicação recusa subir com os dois divergentes, com o motivo na
mensagem — porque essa é uma condição que, não falhando alto, falha em silêncio
e só aparece com o adesivo já colado na coleira de alguém.

Separar as três hoje não muda comportamento nenhum: elas apontam para o mesmo
lugar até a decisão de domínio ser tomada. O que elas passam a fazer é **registrar
qual das cinco coisas é a irreversível**, que é a informação que some quando tudo
é uma variável só.

### 3. Quem serve os arquivos de associação: o outro time. E isso é dependência externa

`/.well-known/assetlinks.json` (Android) e `/.well-known/apple-app-site-association`
(Apple) precisam ser servidos **no host que é o destino do deep link**, que é o
host da plaquinha, que é `TAG_BASE_URL` = `WEB_BASE_URL`. Como as páginas saem
deste serviço, o host é do outro time, e **os arquivos vão junto**.

Não há escolha técnica aqui, e é por isso que a decisão precisa estar escrita
como dependência e não como detalhe: o sistema operacional busca o arquivo no
domínio que o link usa. Servi-lo daqui exigiria que este serviço continuasse
publicado naquele host, que é justamente o que a decisão do cliente desfaz.

**Os requisitos que o outro time recebe, e os três são inegociáveis:**

1. HTTPS, **200 direto**, `Content-Type: application/json`;
2. **nenhum redirecionamento**, nem de `http` para `https`, nem de apex para
   `www`, nem barra final. Quem busca é o sistema operacional, não o navegador;
3. o conteúdo é gerado a partir do **identificador do app e da impressão digital
   da chave de assinatura do APK** — quer dizer, o arquivo é nosso e a hospedagem
   é deles.

**Por que isso é grave o suficiente para virar item de ADR:** um redirecionamento
ali invalida o deep link **no Android e no iOS sem produzir erro em lugar
nenhum**. Não há log, não há 4xx, não há aviso. O comportamento observável é o
link abrir o navegador em vez do app, que é indistinguível de "o usuário não
tinha o app instalado". Foi por isso que o bloco do Caddyfile que serve esses
dois arquivos já trazia o aviso escrito; ele agora se aplica a um servidor que
não é nosso.

**Consequência de prazo:** domínio, conta Apple e impressão digital da chave têm
prazo único de 22/09 (limite absoluto 25/09) **porque os três juntos entregam o
deep link**. A escolha do subdomínio deixa de ser cosmética: ela decide o que vai
impresso na plaquinha física. Ela não pode ser adiada para depois da decisão de
domínio — ela **é** a decisão de domínio.

### 4. O risco datado, e o gatilho que o transforma em decisão

A plaquinha QR está no primeiro lançamento por decisão do cliente, e
`{TAG_BASE_URL}/t/{code}` é o que o estranho abre. Com a página em outro time, se
ela não existir até **21/10/2026** (fim do desenvolvimento), a plaquinha vira um
adesivo com link morto — e o produto inteiro passa a depender de um entregável
que não está neste repositório, não está nesta esteira e não é revisado por este
squad.

Isso não é motivo para contestar a decisão. É motivo para ela ter um gatilho, em
vez de uma esperança:

> **Se até 07/10/2026 não houver a página `/t/{code}` do outro time acessível em
> ambiente de homologação, no host de `TAG_BASE_URL`, respondendo 200, 404 e 410
> corretamente, este serviço volta a servir uma página mínima de `/t/{code}` como
> exceção temporária**, com as outras sete permanecendo fora. A exceção é uma só,
> é a que o produto não sobrevive sem, e ela é registrada como dívida com data de
> remoção.

Duas semanas antes do fim é o prazo em que ainda dá para escrever uma página de
um formulário e um botão. Uma semana antes, não dá. A data existe para que a
decisão de acionar a exceção seja tomada por alguém olhando um ambiente, e não
descoberta no dia 21.

### 5. A borda deixa de rotear os caminhos que saíram

No Caddyfile, o bloco `handle /t/*` e o catch-all que hoje mandam tudo para
`api:3000` deixam de fazer sentido para os caminhos que saíram. A origem da
aplicação passa a servir **apenas `/v1/*`**, e qualquer outro caminho responde
404 na borda, em vez de chegar ao serviço.

Isso é mais que arrumação. Um catch-all que entrega tudo ao back-end é o que faz
uma rota removida do contrato continuar respondendo enquanto o código dela
existir, sem que ninguém perceba. Com a borda fechada, o que não é `/v1` não
chega — e a remoção é verificável de fora.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Manter as páginas aqui | zero trabalho; a plaquinha não depende de ninguém | contraria a decisão do cliente | a decisão do cliente tem precedência, e o argumento dele é bom: é uma aplicação web e não é desta fase |
| Manter só `/t/{code}` aqui e mandar as outras sete | preserva o fluxo crítico | mantém `PUBLIC_BASE_URL` apontando para este serviço, e com ele os arquivos de associação — quer dizer, não resolve o acoplamento nenhum | fica com o custo dos dois desenhos e o benefício de nenhum |
| Servir os arquivos de associação daqui, num host próprio | controle nosso sobre o arquivo | o sistema operacional busca no host do link; um host diferente simplesmente não é consultado | não funciona, não é preferência |
| Redirecionar `/.well-known/*` do host deles para cá | o arquivo continua nosso | redirecionamento invalida o deep link nas duas plataformas, em silêncio | é o modo de falha mais caro do projeto |

## Consequências

**Fica mais fácil:** este serviço deixa de ter duas naturezas (API e servidor de
páginas) e passa a ter uma; o contrato fica com um tipo de resposta só; e a
superfície pública em HTML sai da nossa esteira, da nossa revisão de
acessibilidade e do nosso orçamento de front-end.

**Fica mais difícil:** o fluxo mais crítico do produto passa a atravessar uma
fronteira de time. Um defeito em "li a tag e não aconteceu nada" agora tem dois
donos possíveis, e descobrir qual exige olhar dois sistemas.

**Passa a ser irreversível:** o domínio impresso na plaquinha, no instante em que
a primeira leva for impressa. Tudo o mais neste ADR é reversível por configuração.

**Dívida aceita, com gatilho:** a exceção do item 4.

**O que fica em aberto e não é meu:** o contrato de entrega entre este squad e o
time web (quem hospeda, quando, com qual ambiente de homologação); e a decisão de
subdomínio, que é a decisão de domínio do item 3 e tem prazo de 22/09.


---

# Emenda 1 (ACEITA) — 21/09/2026: onde vivem os arquivos de associação

**Provocação:** *"o que precisa decidir do caddy com o dns?"* (cliente, 21/09).
A BICHUS-146 estava parada em parte por este ADR, e a pergunta é legítima: eu
deixei uma contradição escrita e não a fechei.

## 1. Qual era a contradição, com o texto na mão

O item 2 declara um invariante e manda a aplicação impor:

> "**Invariante, e ele é verificado na subida, não confiado:** o host de
> `TAG_BASE_URL` e o host de `WEB_BASE_URL` são **o mesmo**. (...) A aplicação
> recusa subir com os dois divergentes."

O item 3 não decide nada sozinho: ele **deriva** do invariante acima onde os
arquivos de associação ficam.

> "`/.well-known/assetlinks.json` (Android) e `/.well-known/apple-app-site-association`
> (Apple) precisam ser servidos **no host que é o destino do deep link**, que é o
> host da plaquinha, que é `TAG_BASE_URL` = `WEB_BASE_URL`."

Enquanto os dois valores fossem o mesmo, a frase era exata. Em **19/09 o cliente
decidiu valores diferentes**: `TAG_BASE_URL=https://tag.bichu.app` e
`WEB_BASE_URL=https://bichu.app`. A partir dali, `TAG_BASE_URL` = `WEB_BASE_URL`
virou uma igualdade entre dois valores desiguais, e a frase do item 3 passou a
apontar para dois lugares ao mesmo tempo. **A contradição não está entre duas
frases do ADR: está entre o ADR inteiro e uma decisão posterior que ninguém
trouxe de volta para cá.** O ADR ficou dizendo, em 21/09, que os arquivos vivem
num host que é simultaneamente `tag.bichu.app` e `bichu.app`.

Ela já tinha produzido três consequências no repositório, todas escritas por
quem esbarrou nelas e nenhuma com autoridade para fechar a questão:

1. `src/shared/config/app-config.ts` **afrouxou a guarda por conta própria**, de
   mesmo host para mesmo domínio registrável, com o motivo no comentário: *"o
   cliente decidiu em 19/09 valores que divergem (...) e implementar a invariante
   ao pé da letra seria entregar uma aplicação que não sobe com a configuração
   que ela acabou de receber"*. O código estava certo e o documento, errado —
   que é o pior arranjo possível, porque a decisão escrita deixa de descrever o
   sistema que roda.
2. `infra/verificacao/associacao.yml` mira **só** `tag.bichu.app` e registra que
   a cópia do apex *"ninguém decidiu ainda"*.
3. Os critérios 3 e 4 da BICHUS-146 exigem os arquivos **no apex**. Um portão
   cobrando um host e um ticket cobrando outro.

## 2. A decisão, e por que ela não é uma escolha entre os dois

O sistema operacional busca o arquivo de associação **no host da URL que ele foi
chamado para abrir**, e em nenhum outro. No Android, o `android:host` do
`intent-filter` determina de onde sai o `assetlinks.json`; no iOS, cada entrada
`applinks:<host>` do entitlement determina de onde sai o
`apple-app-site-association`. Não existe arquivo que fale por um host vizinho, e
não existe redirecionamento que empreste um host ao outro.

Isso torna a pergunta "apex **ou** `tag`?" malformulada. A resposta é uma
consequência, não uma preferência:

> **Todo host que aparece num link que nós emitimos e que precisa abrir o app
> serve a sua própria cópia dos dois arquivos, com conteúdo idêntico.**

Hoje são dois hosts, porque são duas famílias de link e elas já estavam
separadas no item 2:

| Host | Links que ele carrega | Precisa dos dois arquivos |
|---|---|---|
| `tag.bichu.app` (`TAG_BASE_URL`) | `/t/{code}` — o que vai prensado na plaquinha | **sim**, e é o que não se corrige depois |
| `bichu.app` (`WEB_BASE_URL`) | cartaz, página do caso, `/@{slug}`, conversa do achador, verificação de e-mail, redefinição de senha, cancelamento de transferência | **sim** |

**O que cai é o invariante do item 2, e não a decisão do cliente.** O invariante
foi escrito em 17/09, quando os dois valores eram um só, e ele codificou a
*consequência* (os arquivos num lugar só) como se fosse uma *restrição sobre os
hosts*. Mantê-lo hoje custaria uma de duas coisas, e as duas são piores:

- imprimir `bichu.app` na plaquinha, que joga a única decisão irreversível do
  produto (ADR-0004) sobre o nome que o item 3 entrega ao outro time, e sobre o
  mesmo nome que carrega MX do Workspace, DKIM e um DMARC em `p=reject`. No dia
  em que o time web hospedar o apex noutro lugar, toda plaquinha já impressa
  segue um host que não é mais nosso;
- ou mover os links de e-mail e as páginas para `tag.bichu.app`, o que torna o
  nome mentiroso e recola as cinco coisas que o item 2 acabou de separar.

`tag.bichu.app` na plaquinha mantém a propriedade que interessa: **o nome é
irreversível, o destino não.** Um registro de DNS repõe a plaquinha em qualquer
origem, inclusive na do time web, sem tocar no plástico.

## 3. O que a subida continua impondo, e por que não é o invariante antigo

A guarda de `app-config.ts` fica como está — **mesmo domínio registrável**, não
mesmo host — e passa a ser a regra escrita, não um desvio documentado. Ela
protege o erro que custa caro e é fácil de cometer com copiar e colar: a
plaquinha apontando para um domínio de terceiro, que não se corrige depois de
impressa. Igualdade de host ela não pode mais exigir, porque a configuração
correta hoje a violaria.

O que o invariante protegia e a subida **deixa de conseguir provar** é a
presença dos arquivos de associação. Isso não é confiança: é
`infra/verificacao/associacao.yml`, que verifica de fora, e que passa a ter
**quatro alvos** em vez de dois — os dois de `tag.bichu.app` e os dois de
`bichu.app`. O alvo do apex deixa de ser "ninguém decidiu ainda" e vira
requisito decidido aqui.

## 4. O que isto obriga na BICHUS-38 e na BICHUS-39

As duas declaram **dois hosts**, não um:

- Android (`BICHUS-39`): um `intent-filter` com `autoVerify="true"` por host,
  `tag.bichu.app` e `bichu.app`, e o `assetlinks.json` de cada um com a mesma
  impressão digital SHA-256 da chave de release.
- iOS (`BICHUS-38`): `applinks:tag.bichu.app` e `applinks:bichu.app` no
  entitlement, e o `apple-app-site-association` de cada host com os `paths`
  daquele host — `/t/*` em `tag`, e cartaz, caso, perfil e as telas de e-mail e
  senha no apex.

**Declarar os dois agora é barato e omitir um é caro:** host novo no entitlement
e no manifesto só entra em aparelho com **nova versão publicada na loja**. Um
link de e-mail que não abre o app porque o apex ficou de fora não se conserta
por configuração de servidor. Em 21/09 nem o manifesto nem o entitlement
declaram host nenhum — conferido —, então a decisão ainda não custou nada.

**Continua valendo sem exceção**, dos dois lados: 200 direto, `application/json`,
zero redirecionamento, sem proxy na frente, e **nenhuma impressão digital de
exemplo**. Lista vazia é recusa honesta; valor inventado é pior que ausência,
porque o Android guarda o resultado negativo da verificação e exige reinstalar o
app em cada aparelho para destravar.

## 5. O que esta emenda NÃO decide, de propósito

**Nada sobre imprimir plaquinha.** O que libera impressão continua sendo o
ADR-0004 mais três coisas que não são deste documento: `tag.bichu.app`
resolvendo, os dois arquivos respondendo 200 naquele host com impressão digital
real (BICHUS-136), e o corte de 26 para 16 caracteres na ordem obrigatória
(HMAC primeiro). Até lá, **nenhuma tag é impressa**, e esta emenda não muda isso.

**Nada sobre quem hospeda o apex.** O item 3 entrega o host das páginas ao time
web e isso continua valendo. Enquanto o time web não existir, o apex é servido
pela nossa borda, que responde 404 em tudo que não é `/v1` (item 5) e 200 nos
dois arquivos de associação. Quando o apex mudar de origem, os dois arquivos vão
junto, com os mesmos três requisitos — é o item 3 aplicado a um segundo host, não
uma decisão nova.

## 6. E o corte de DNS da BICHUS-146 dependia disto?

**Não, e eu deveria ter dito isso antes.** A BICHUS-146 cria `bichu.app` e
`img.bichu.app` apontando para a VM. `tag.bichu.app` não está no escopo dela e
não é criado por ela. Um registro A é reversível numa chamada; o que esta emenda
decide só vira irreversível quando alguém **imprime** plástico ou **publica** uma
versão na loja, e o corte de DNS não faz nem uma coisa nem outra.

O efeito da emenda sobre a 146 é o oposto de bloquear: os critérios 3 e 4 dela
cobram os arquivos **no apex**, o que era exatamente a parte que o ADR não
sustentava. Agora sustenta. O que travou a 146 de fato foram três coisas
medidas, nenhuma delas documental: a VM `bichu-hml` desligada, a ausência de
credencial de escrita no DNS, e a borda ainda não conhecer o apex. As três estão
fechadas ou nomeadas na própria issue.


---

# Emenda 2 (SUPERADA pela emenda 3 em 23/09; o diagnóstico continua valendo) — 22/09/2026: o gatilho do item 4 cobre uma das oito páginas, e duas já estão sangrando

**Provocação:** uma apuração de 21/09 constatou que o repositório não tem projeto
web nenhum (`adr/ api/ app/ coverage/ cypress/ design/ dist/ docs/ infra/
migrations/ node_modules/ src/ test/ tests/` — nenhum deles serve HTML), e
perguntou se a superfície existe em algum lugar que ninguém viu.

**Esta emenda não reabre a decisão do cliente e não decide onde as páginas
moram.** Ela registra uma medição e nomeia um buraco que este documento deixou
aberto sem dizer que estava aberto. A escolha que fecha o buraco está em
`.jarvis/DECISOES-PARA-22-09.md`, seção 14, e é do cliente.

## 1. A superfície web não existe em lugar nenhum — verificado, não suposto

Quatro verificações, nesta ordem:

| o que | como | resultado |
|---|---|---|
| outro projeto no repositório | `find` por diretório de front web | só `src/web/`, que tem um README e um `.gitkeep` |
| submódulo | `.gitmodules`, `git submodule status` | **não existe** |
| serviço na composição | `compose.yaml` | `db`, `objeto`, `objeto_init`, `migracao`, `api`, `worker`, `mail`, `edge`. **Nenhum serve página** |
| rota na borda | `infra/caddy/Caddyfile` | as únicas origens são `api:3000` e `objeto:9000`. O item 5 desta ADR está implementado: `handle { respond "nao encontrado" 404 }`, linha 227 |

E o comportamento observável em produção, medido de fora, sem alterar nada:

```
https://bichu.app/t/TESTE-...        404  text/plain  "nao encontrado"
https://bichu.app/c/abc              404
https://bichu.app/cartaz/x           404
https://bichu.app/p/x                404
https://bichu.app/@teste             404
https://bichu.app/verificar-email    404
https://bichu.app/redefinir-senha    404
https://hml.bichu.app/t/x            404

https://bichu.app/v1/health                       200  application/json
https://bichu.app/.well-known/assetlinks.json     200  application/json
```

As **oito** rotas do quadro da seção *Contexto* respondem 404 de borda. O serviço
está correto e a borda está correta: o 404 é o item 5 fazendo o que foi mandado
fazer. O que não existe é o outro lado.

`tag.bichu.app` **não resolve no DNS** (conferido em 21/09), o que quer dizer que
o host que vai prensado na plaquinha ainda não existe em nenhuma forma.

## 2. O buraco: o item 4 protege `/t/{code}` e mais nada

O item 4 escreveu um gatilho datado, e ele é bom. Mas ele é explícito em cobrir
**uma** página: *"este serviço volta a servir uma página mínima de `/t/{code}`
como exceção temporária, com as outras sete permanecendo fora"*.

Quando isso foi escrito, em 17/09, as outras sete eram todas páginas de produto,
e deixar as sete de fora era a escolha certa: nenhuma delas tinha um mecanismo do
back-end já em produção dependendo dela. **Isso deixou de ser verdade.** O
back-end já emite, hoje, quatro endereços que caem nesses 404:

| o que o back-end emite | arquivo e linha | para onde aponta |
|---|---|---|
| link do e-mail de verificação de conta | `src/modules/identity/application/auth-service.ts:103` | `{WEB_BASE_URL}/verificar-email?token=…` |
| link do e-mail de recuperação de senha | `src/modules/identity/application/auth-service.ts:111` | `{WEB_BASE_URL}/redefinir-senha?token=…` |
| `conversation_url`, campo do contrato na resposta 201 do aviso | `src/modules/tags/application/tag-service.ts:309` | `{WEB_BASE_URL}/c/{finderToken}` |
| `poster_url`, campo do contrato na resposta do caso | `src/modules/lostfound/adapters/http/lost-case-routes.ts:151` | `{WEB_BASE_URL}/cartaz/{shareToken}` |

Os dois primeiros são os que apertam, e por uma razão com data: a **BICHUS-147**
está em QA agora, e ela é o conserto de *"o cadastro não dispara o e-mail de
verificação"*. No dia em que ela for a produção, o produto passa a mandar, para
pessoa de verdade, um e-mail cujo botão leva a 404. O defeito troca de forma —
de "o e-mail não sai" para "o e-mail sai e não funciona" — e a segunda forma é
pior, porque parece que funcionou.

**Nomeando o buraco sem rodeio:** este documento tirou as páginas do back-end e
deu um anteparo a uma delas. As duas páginas que fecham um mecanismo de
segurança já implantado (confirmação de e-mail e redefinição de senha) ficaram
sem anteparo nenhum, e ninguém decidiu que elas ficariam — elas caíram no "outras
sete" de uma frase escrita quando o quadro era outro.

## 3. O que esta emenda decide, e o que ela deixa para o cliente

**Decide** (é a parte que é minha, porque o gatilho do item 4 é meu):

> O gatilho do item 4 passa a cobrir **três** caminhos, não um: `/t/{code}`,
> `/verificar-email` e `/redefinir-senha`. Os outros cinco (`/c/`, `/cartaz/`,
> `/p/`, `/@slug`, `/transferencia/`) continuam fora, como o item 4 escreveu.
>
> E a data do gatilho, para as duas páginas de e-mail, deixa de ser 07/10 e passa
> a ser **o dia em que a BICHUS-147 for para produção**. Não é prazo de
> calendário: é precondição. Enquanto não houver onde o link do e-mail aterrissar,
> ligar o envio de e-mail de verificação entrega ao usuário um caminho sem saída.

A razão de a data mudar só para essas duas: o gatilho do item 4 foi calibrado por
"quanto tempo ainda dá para escrever uma página" (duas semanas antes do fim).
Para `/t/{code}` isso continua valendo, porque ela só precisa existir quando a
plaquinha existir. Para as páginas de e-mail o relógio é outro, e ele não é o
calendário: é o deploy de outra história.

**Não decide**, de propósito, e está em `.jarvis/DECISOES-PARA-22-09.md` seção 14
como pergunta fechada ao cliente:

- se as três páginas voltam para o back-end como dívida com data de remoção
  (a opção que eu recomendo), ou se elas nascem num projeto web nosso, ou se
  esperamos o time web;
- quem é o time web, quando ele começa e em qual ambiente de homologação. O
  documento original já tinha deixado isso em aberto, na seção *Consequências*:
  *"O que fica em aberto e não é meu: o contrato de entrega entre este squad e o
  time web"*. Continua em aberto quatro dias depois, e agora com consequência
  medida.

## 4. Uma correção de registro, pequena e que evita um mal-entendido

`src/web/README.md` é do primeiro commit (`5ece108`, Onda 0) e descreve, no
presente, as páginas HTML servidas por este back-end e o orçamento de peso delas.
Ele contradiz esta ADR inteira e sobreviveu à decisão de 17/09 por esquecimento,
não por decisão. Ele é **documentação morta**, e quem o ler primeiro vai concluir
que o back-end serve HTML.

Não o apaguei: se o cliente escolher a opção (c) da seção 14, ele volta a ser o
documento correto, e as três regras que ele registra (botão sem JavaScript, sem
fonte de terceiro, conteúdo crítico embutido) continuam sendo as regras certas.
Fica aqui a anotação de que, em 22/09, ele descreve um serviço que não existe.

## 5. O mesmo mal-entendido está no Jira, e vale mais que uma nota

O critério 1 da **BICHUS-59** diz, literalmente, *"o backend serve HTML
renderizado no servidor com 200"*. Ela nunca foi relida depois desta ADR. Quem
pegar essa história hoje vai implementar exatamente o que este documento proíbe,
e vai passar em revisão contra o critério escrito.

É a mesma família do achado de 21/09 ("critério que passa porque está escrito"):
o critério não está errado, ele está **velho**, e ninguém carregou a decisão de
17/09 até ele. Não alterei a história — ela não é minha, e o texto certo depende
da escolha entre (a)–(d).

## 6. O que virou trabalho

A data de **07/10** do item 4 não estava em calendário nenhum e não tinha
responsável, o que a deixava a caminho de ser descoberta em 21/10 — o desfecho
que ela foi escrita para evitar. Virou a **BICHUS-197**, em `Tarefas pendentes`,
com os critérios de medição e a regra de que verificação que não consegue
verificar reprova.


---

# Emenda 3 (ACEITA) — 23/09/2026: o time web é este squad

**Provocação:** a pergunta 2 de `.jarvis/DECISOES-PARA-23-09.md` ("o time web tem
nome e data?") e a seção 14 de `.jarvis/DECISOES-PARA-22-09.md`, que a emenda 2
deixou para o cliente.

## 1. O que o cliente decidiu, por escrito, e não se reabre

1. O squad constrói o **site web do Bichu**: o institucional **mais** as oito
   rotas públicas do quadro da seção *Contexto*. Isso **reverte** a decisão de
   22/09, que deixava as páginas com um time web externo.
2. O site roda na **mesma VM** de hoje (`bichu-hml`, projeto `bichu-app-508914`,
   `southamerica-east1-a`), em **imagem Docker separada** da API, para que migrar
   depois seja fácil.
3. O site vai ao ar **direto em `bichu.app`**.
4. O designer desenha no Figma antes; o front web implementa só o que estiver
   desenhado e aprovado.

## 2. O que muda neste ADR, item por item

| Item | Antes | Depois |
|---|---|---|
| 1. Zero `text/html` | vale | **vale, sem exceção**. O site é outro serviço, com imagem própria (ADR-0028). Nenhuma linha de HTML volta para `src/` |
| 2. As três variáveis | `TAG_BASE_URL=https://tag.bichu.app`, `WEB_BASE_URL=https://bichu.app` (emenda 1) | **inalterado**. Os links que a API emite já apontam para onde o site vai responder |
| 3. Arquivos de associação | "a hospedagem é deles" | a hospedagem é **nossa**, pela borda, a partir de `infra/caddy/well-known/`, o mesmo arquivo em `tag.bichu.app`, `bichu.app` e `hml.bichu.app` (ADR-0028 item 6). Os três requisitos continuam inegociáveis |
| 4. Gatilho de 07/10 e exceção de back-end | se o outro time não entregar `/t/{code}`, a API volta a servir uma página mínima | **a exceção de back-end deixa de existir.** O gatilho vira **prazo com dono**: seção 3 abaixo |
| 5. Borda fechada | tudo que não é `/v1` responde 404 | continua assim nos hosts da API (`hml.bichu.app`, `api.bichu.app`). Nos hosts do site, o que não é `/v1` nem arquivo de associação vai para o container do site (ADR-0028 item 5) |
| *Consequências*, "o que fica em aberto e não é meu" | contrato de entrega com o time web; subdomínio | **fechado.** Não há fronteira de time; a entrega passa pela nossa esteira e pela nossa revisão |

A exceção do item 4 existia porque a página estava fora do nosso alcance, e ela
seria uma página de back-end escrita às pressas **pelo mesmo squad** que agora
escreve a página de verdade. Com o site sendo nosso, a página mínima mais
barata é a própria `/t/{code}` do site, e manter o plano B seria escrever a
mesma tela duas vezes, uma delas no lugar que este ADR proíbe.

## 3. O destino da emenda 2 e do gatilho datado

**A emenda 2 sai de "proposta" para "superada pela emenda 3".** O que ela
mediu continua valendo como registro: as oito rotas respondiam 404 em 21/09, e
a API já emite quatro endereços que caem nelas (verificação de e-mail,
redefinição de senha, `conversation_url` e `poster_url`). O que ela **decidia**
(estender a exceção de back-end a três páginas) é substituído pelo seguinte.

**O gatilho passa a ter dono: o front web deste squad.** São dois prazos, com
naturezas diferentes, e os dois continuam sendo condições e não esperanças:

1. **`/verificar-email` e `/redefinir-senha` antes da BICHUS-147 em produção.**
   Precondição, não data: a 147 **não vai a produção** enquanto as duas páginas
   não responderem em `bichu.app` com o `GET` que não executa e o `POST` que
   confirma. Sem isso, o e-mail passa a sair e o botão dele leva a 404. São as
   primeiras da fila do site, porque o back-end delas está pronto (seção 5).
2. **`/t/{code}` em 07/10/2026**, em `tag.bichu.app`, respondendo 200, 404 e 410
   corretamente, em ambiente acessível de fora. A **BICHUS-197** continua sendo
   a conferência, agora do nosso container, com a mesma regra: verificação que
   não consegue verificar reprova. **Se 07/10 chegar sem a página, não há plano
   B de back-end:** o que o gatilho garante é que o cliente saiba em 07/10, e não
   em 21/10, e que a fila do site seja reordenada para pôr `/t/` na frente de
   tudo.

**As duas perguntas ao cliente sobre o time web se fecham** com a decisão 1:
`DECISOES-PARA-22-09.md` seção 14 (opção "projeto web nosso") e
`DECISOES-PARA-23-09.md` pergunta 2.

**A pergunta 1 de `DECISOES-PARA-23-09.md` (a plaquinha) muda de natureza, e
tem um erro de host.** A data em que o endereço impresso passa a funcionar
deixa de depender de terceiro: é o prazo 2 acima. E o texto da pergunta diz que
o QR leva `bichu.app/t/<código>`; o que o QR codifica é `{TAG_BASE_URL}/t/{código}`
(`src/shared/config/app-config.ts`), e o valor decidido em 19/09 é
`https://tag.bichu.app`. O valor efetivo na VM só se confere dentro dela
(`docker compose exec -T api printenv TAG_BASE_URL`), e precisa ser conferido
antes de qualquer resposta a essa pergunta. O site serve `/t/` também no apex
(ADR-0028 item 5), então as duas formas abrem; a que vai para o plástico é a
de `TAG_BASE_URL`.

**Os itens 4 e 5 da emenda 2 viram trabalho do site:** as três regras de
`src/web/README.md` passam para o README de `web/`, e `src/web/` sai quando
`web/` nascer. O critério 1 da **BICHUS-59** ("o backend serve HTML renderizado
no servidor") precisa ser reescrito para "o site serve", e o mesmo vale para o
critério da BICHUS-76 que diz "servida em HTML pelo backend".

## 4. As 13 issues que esperavam o time web

Elas saem da coluna "esperando o time web" (`.jarvis/FILA-FINAL-22-09.md`, D.1)
e entram na fila do front web do squad. **Nenhuma fica livre só por isso**: a
decisão 4 do cliente põe o Figma aprovado antes de qualquer linha, e várias
dependem de operação que o contrato declara e o código não tem (seção 5).

| Chave | O que é | O que ainda bloqueia |
|---|---|---|
| BICHUS-120 | páginas de confirmar e-mail e redefinir senha | **só o Figma**. Back-end pronto. Primeira da fila (seção 3, prazo 1) |
| BICHUS-59 | página pública do QR, `/t/{code}` | Figma; critério 1 reescrito. Back-end pronto (`resolveTagCode`, `createFoundReportFromTag`). Prazo de 07/10 |
| BICHUS-71 | avisar o tutor sem login, em um toque | Figma. Back-end pronto. Anda junto com a 59 |
| BICHUS-70 | aviso enviado, com as três ofertas opcionais | Figma. Back-end pronto |
| BICHUS-47 | código não encontrado ou tag desativada | Figma. Back-end pronto (404 e 410 com `next_action`) |
| BICHUS-119 | cabeçalhos de segurança e `og:` em `/t/`, `/c/`, `/cartaz/` | nada além do próprio site: é o item 7 do ADR-0028 e a asserção de cabeçalho da esteira |
| BICHUS-72 | contar mais: foto do lugar, recado, contato | Figma **e back-end**: `createFinderPhotoUploadIntent` e `enrichFinderFoundReport` não estão implementadas |
| BICHUS-41 | conversa por token na web, `/c/{token}` | Figma **e back-end**: as quatro operações de `/v1/finder/conversation*` não estão implementadas |
| BICHUS-76 | cartaz automático e link compartilhável | Figma **e back-end**: `getPublicLostCase` e `getLostCasePoster` não estão implementadas |
| BICHUS-45 | rota `/@slug` com perfil público desligado | Figma **e back-end**: `getPublicPetBySlug` não está implementada |
| BICHUS-30 | termos acessíveis sem conta | Figma e **o texto dos termos**, que é do cliente. É página pré-renderizada do institucional |
| BICHUS-174 | perfil fatia C: página do tutor | Figma **e o ADR da exceção ao contato mediado**, que não existe. Continua bloqueada por ele |
| BICHUS-197 | gatilho de 07/10 | muda de objeto (seção 3): passa a conferir o nosso container. Mantém a data |

**Lacuna de backlog:** a página `/transferencia/{cancelToken}` não tem história.
O back-end dela está pronto (seção 5) e o link já sai por e-mail na transferência
de pet (BICHUS-66). O **institucional** também não tem história nenhuma.

## 5. O contrato que as páginas consomem: o que existe e o que falta

Conferido em `origin/development` (`38371aa`), lendo `api/openapi.yaml` e a
declaração de rota em `src/` (`defineRoute`/`registrarRota`), não o nome do
arquivo.

**As quatro operações que o item 1 disse que "entram no contrato nesta rodada":**

| Operação | No contrato | No código |
|---|---|---|
| `GET /v1/public/lost-cases/{shareToken}/poster` (`getLostCasePoster`) | sim | **não** |
| `GET /v1/public/transfers/{cancelToken}` (`getTransferByCancelToken`) | sim | sim, `src/modules/transfers/adapters/http/transfer-routes.ts` |
| `POST /v1/public/transfers/{cancelToken}/cancel` (`cancelTransferByToken`) | sim | sim, mesmo arquivo, com idempotência |
| `GET /v1/public/password-reset/{token}` (`checkPasswordResetToken`) | sim | sim, `src/modules/identity/adapters/http/routes.ts` |

**As operações do quadro do item 1, que as páginas também consomem:**

| Operação | No contrato | No código | Página |
|---|---|---|---|
| `GET /v1/tags/{code}` (`resolveTagCode`) | sim | sim | `/t/` |
| `POST /v1/tags/{code}/found-reports` (`createFoundReportFromTag`) | sim | sim | `/t/` |
| `POST /v1/auth/email-verification/confirm` | sim | sim | `/verificar-email` |
| `POST /v1/auth/password-reset/confirm` | sim | sim | `/redefinir-senha` |
| `GET /v1/finder/conversation` (`getFinderConversation`) | sim | **não** | `/c/` |
| `POST /v1/finder/conversation/messages` (`postFinderMessage`) | sim | **não** | `/c/` |
| `POST /v1/finder/conversation/block` (`blockFinderConversation`) | sim | **não** | `/c/` |
| `POST /v1/finder/conversation/report` (`reportFinderConversation`) | sim | **não** | `/c/` |
| `GET /v1/public/lost-cases/{shareToken}` (`getPublicLostCase`) | sim | **não** | `/p/` |
| `GET /v1/public/pets/{slug}` (`getPublicPetBySlug`) | sim | **não** | `/@` |
| `POST /v1/media/finder-photo-intents` (`createFinderPhotoUploadIntent`) | sim | **não** | `/t/`, foto do achador |
| `PATCH /v1/finder/found-report` (`enrichFinderFoundReport`) | sim | **não** | `/t/`, contar mais |

**Falta, e é trabalho de back-end, não deste ADR:** nove operações, todas já no
contrato. Nenhuma operação que as páginas precisam está fora do contrato. Por
ordem de qual página destravam primeiro: `getLostCasePoster` e
`getPublicLostCase` (cartaz e caso, BICHUS-76); as quatro de
`/v1/finder/conversation*` (BICHUS-41); `createFinderPhotoUploadIntent` e
`enrichFinderFoundReport` (BICHUS-72); `getPublicPetBySlug` (BICHUS-45).

Uma conferência a mais que vale fazer junto: a API **já emite** `conversation_url`
(resposta do aviso) e `poster_url` (resposta do caso) apontando para páginas
cujas operações de leitura não existem. Os dois links vão continuar em 404 **no
site** até essas operações existirem, mesmo com o site no ar.

## 6. O que esta emenda NÃO decide

Nada sobre impressão de plaquinha (ADR-0004 e emenda 1 item 5 continuam valendo
sem alteração). Nada sobre o conteúdo das páginas, que é do Figma aprovado. A
stack, a forma da imagem, o roteamento de hosts e a CSP estão no ADR-0028.
