# ADR-0017: O serviço Node não renderiza HTML, e quem serve o domínio da tag

**Status:** aceito
**Data:** 2026-09-17
**Depende de:** ADR-0016 (a borda que torna a separação roteável)
**Revisa:** ADR-0005 ("uma página, duas portas"), ADR-0004 (o que o QR codifica)

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
