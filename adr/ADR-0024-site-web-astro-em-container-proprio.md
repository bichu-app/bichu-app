# ADR-0024: O site web é um container Astro próprio, renderizado no servidor onde o link é compartilhado, e a borda separa os hosts

**Status:** aceito. Três perguntas ao cliente no fim; nenhuma bloqueia o início
**Data:** 2026-09-23
**Depende de:** ADR-0016 (o gateway `/v1`), ADR-0017 com a emenda 3 (o site é nosso)
**Revisa:** ADR-0017 emenda 1, item 4 (um arquivo de associação por host, ver item 6 abaixo)

## Contexto

Em 23/09 o cliente decidiu, e as decisões estão registradas na emenda 3 do
ADR-0017:

1. o squad constrói o site web do Bichu: o institucional **e** as oito rotas
   públicas que o ADR-0017 tirou do back-end;
2. o site roda na mesma VM (`bichu-hml`, `bichu-app-508914`,
   `southamerica-east1-a`), em **imagem Docker separada** da API, para que
   migrar depois seja trocar onde a imagem roda e não reescrever nada;
3. o site vai ao ar direto em `bichu.app`;
4. o designer desenha no Figma antes; o front web implementa só o que estiver
   desenhado e aprovado.

O ADR-0017 continua valendo: **o serviço Node da API não serve HTML.** O site é
outro serviço, atrás do mesmo Caddy.

O estado medido de fora em 23/09, sem alterar nada:

| host | DNS | resposta hoje |
|---|---|---|
| `bichu.app` | `35.247.247.16` (a VM) | bloco da API: `/v1/health` 200, `/` 404 `text/plain`, os dois arquivos de associação 200 |
| `tag.bichu.app` | a VM | **o mesmo bloco da API**: `/v1/health` 200, `/t/x` 404 |
| `hml.bichu.app` | a VM | bloco da API; é o `API_BASE_URL` do app que o cliente usa no aparelho |
| `www.bichu.app` | **não resolve** | — |
| `api.bichu.app` | **não resolve** | — (o `servers` do contrato já declara `https://api.{dominio}/v1`) |

`bichu.app` e `tag.bichu.app` estão hoje em `HOSTS_EXTRA_APP`, como aliases do
bloco da API. Os três nomes atendem **a mesma API e o mesmo banco**: não existe
separação entre homologação e produção nesta máquina.

Os requisitos que pesam na escolha, e de onde cada um vem:

- **o botão de avisar funciona sem JavaScript** (`docs/03-arquitetura.md`,
  orçamento da rota pública; `docs/04-seguranca.md`, D31: "teste do toque único
  sem JavaScript");
- **o link do caso é compartilhado no WhatsApp** (BICHUS-76: "o Bichu alimenta o
  WhatsApp do bairro com um material bom"). O gerador de prévia do WhatsApp, do
  Telegram e do iMessage **não executa JavaScript**: ele lê as `og:` do HTML que
  vier na primeira resposta, e só elas;
- rotas com parâmetro: `/t/{code}`, `/c/{finderToken}`, `/cartaz/{shareToken}`,
  `/p/{shareToken}`, `/@{slug}`, `/transferencia/{cancelToken}`;
- os arquivos de `/.well-known/` em cada host que carrega link nosso (emenda 1);
- orçamento: HTML com CSS crítico ≤ 30 KB e JavaScript inicial ≤ 30 KB
  comprimidos, LCP ≤ 2,0 s, CLS ≤ 0,1, INP ≤ 200 ms, zero fonte web bloqueando;
- CSP fechada na rota pública e nenhum script de terceiro em página que carrega
  token (`docs/04-seguranca.md` 4.6 item 7, SEC-005);
- `design/tokens.json` como fonte única, com derivado conferido na esteira;
- a e2-small tem 2 GB e a soma dos tetos do `compose.yaml` já é 1792 MB.

## Decisão

### 1. Stack: TypeScript e Astro, com saída estática por padrão e renderização no servidor por rota

**Astro 7** (7.3.4, publicado em 22/09/2026, licença MIT, exige Node ≥ 22.12,
que é a mesma linha 22 da API) com o adaptador **`@astrojs/node`** (11.1.6).
Toda página é **pré-renderizada no build** (`output: 'static'`), e as rotas
públicas com parâmetro declaram `export const prerender = false` e são
renderizadas **no servidor, a cada requisição**.

A recomendação que recebi era Astro em saída **só estática**, com ilhas de
TypeScript chamando a API pelo navegador e as rotas com parâmetro servidas por
fallback. Fico com o Astro e **derrubo a saída só estática**, por três motivos,
em ordem de peso:

1. **Prévia de link.** Com fallback estático, `/p/abc` e `/p/xyz` recebem o
   mesmo HTML, com as mesmas `og:`. O link do caso que a tutora cola no grupo
   do bairro aparece como "Bichu" em vez de "Perdido: Thor, caramelo, Vila
   Mariana" com a foto dele. O cartão da prévia é o que as pessoas veem no
   WhatsApp; é a razão de ser da BICHUS-76, e nenhuma ilha resolve isso, porque
   quem monta a prévia não roda a ilha.
2. **O botão sem JavaScript.** No estático, o aviso do achador só pode sair por
   `fetch` do navegador para a API, que recebe JSON. Um `<form method="post">`
   não tem para onde ir. O requisito D31 fica impossível de cumprir, e ele é
   de segurança e de produto ao mesmo tempo.
3. **A primeira tela do estranho.** Estático com ilha são três idas e voltas em
   rede móvel antes de aparecer o nome do pet: HTML, script, chamada à API. No
   servidor é uma: o HTML já sai com o pet, e a chamada à API acontece dentro
   da VM, a milissegundos.

**O custo, medido e não estimado:** a renderização no servidor exige um
processo Node no container. Medi um servidor Astro 7.3.4 com `@astrojs/node` em
`node:22-bookworm-slim`, limitado a 128 MB, heap em 32 MB: **31,6 MiB parado,
47,0 MiB depois de 1000 renderizações** com uma chamada HTTP de saída em cada.
O teto do serviço fica em **96 MB** com `--max-old-space-size=48`. Um servidor
estático de prateleira ocuparia uns 10 MB; a diferença, cerca de 85 MB, é o
preço dos três motivos acima. Ver *Consequências* sobre o orçamento da máquina.

**Por que Astro e não outro:** o institucional é conteúdo, e o Astro entrega
HTML sem nenhum JavaScript por padrão, o que já nasce dentro do teto de 30 KB. O
mesmo projeto faz o conteúdo estático e as oito rotas dinâmicas, então não há
dois fronts para manter. Next.js e SvelteKit também fariam as duas coisas; os
dois carregam um runtime de cliente em toda página e custam mais memória no
servidor, e nenhum dos dois tem algo que as oito rotas precisem e o Astro não
tenha. Um Fastify com templates, que o squad já conhece, resolveria as oito
rotas e deixaria o institucional sem ferramenta de conteúdo, de mapa do site e
de otimização de imagem. Tabela em *Alternativas*.

### 2. O que cada rota é

| Rota | Renderização | `og:` | Indexação | Cache-Control | Operações do contrato |
|---|---|---|---|---|---|
| `/` e institucional (`/sobre`, `/termos`, `/privacidade` etc.) | pré-renderizada | institucional | sim | `public, max-age=0, must-revalidate` | nenhuma |
| `/t/{code}` | servidor | **genérica** (BICHUS-119) | `noindex` | `no-store` | `resolveTagCode`, `createFoundReportFromTag`; com JS, `createFinderPhotoUploadIntent` e `enrichFinderFoundReport` |
| `/c/{finderToken}` | servidor | genérica | `noindex` | `no-store` | `getFinderConversation`, `postFinderMessage`, `blockFinderConversation`, `reportFinderConversation` |
| `/cartaz/{shareToken}` | servidor | genérica (BICHUS-119) | `noindex` | `public, max-age=60` | `getLostCasePoster` |
| `/p/{shareToken}` | servidor | **do caso**: nome, foto derivada pública, bairro | `noindex` (pergunta 1) | `public, max-age=60` | `getPublicLostCase` |
| `/@{slug}` | servidor | **do pet**, só com o perfil público ligado | `noindex` (pergunta 1) | `public, max-age=60` | `getPublicPetBySlug` |
| `/verificar-email` | servidor | genérica | `noindex` | `no-store` | `POST` do formulário: `confirmEmailVerification` |
| `/redefinir-senha` | servidor | genérica | `noindex` | `no-store` | `GET`: `checkPasswordResetToken`; `POST` do formulário: `confirmPasswordReset` |
| `/transferencia/{cancelToken}` | servidor | genérica | `noindex` | `no-store` | `getTransferByCancelToken`, `cancelTransferByToken` |
| página de 404 e de erro | pré-renderizada | genérica | `noindex` | `public, max-age=0, must-revalidate` | nenhuma |
| `/_astro/*` (artefato de build, nome com hash) | arquivo | — | — | `public, max-age=31536000, immutable` | — |

Os nomes da coluna da direita são `operationId` de `api/openapi.yaml`. A
situação de cada um (contrato e código) está na emenda 3 do ADR-0017.

**`GET` nunca executa.** As páginas que recebem token por e-mail
(`/verificar-email`, `/redefinir-senha`, `/transferencia/`) respondem ao `GET`
com a página e um botão; a ação acontece no `POST` do formulário (SEC-005).
`checkPasswordResetToken` é leitura, e é chamada no `GET` para que o 410 apareça
**antes** de a pessoa digitar a senha nova.

**Tradução de resposta em tela é por `type`, nunca por texto nem só por
status.** O 410 com `next_action` do contrato vira a página do desfecho; o
`problem+json` desconhecido vira a página de erro genérica com o
`correlation_id` visível. Mesma regra do app.

### 3. O que o servidor web pode e não pode fazer

O processo Node do site é um **cliente do contrato que renderiza HTML.** Ele
não é BFF (não agrega nem tem contrato próprio) e não é um segundo back-end.

**Pode:**

- chamar as operações de `api/openapi.yaml`, e só elas, em
  `API_INTERNAL_URL` (`http://api:3000` dentro da rede do compose), com tipos
  **gerados do contrato** por `openapi-typescript`, o mesmo gerador que a API
  usa, em `web/src/api/generated/`;
- repassar à API o que identifica a pessoa do outro lado, e nada além:
  `X-Forwarded-For` com o endereço que a borda entregou, `x-correlation-id`, e
  o token que veio na URL (`finderToken`, `cancelToken`, token do e-mail) no
  lugar que o contrato manda;
- gerar a `Idempotency-Key` quando renderiza o formulário (campo oculto) e
  repassá-la no `POST`. Quem deduplica é a API, que já exige a chave em
  `createFoundReportFromTag`; o servidor web não guarda estado nenhum;
- traduzir `application/x-www-form-urlencoded` do formulário no corpo JSON da
  operação, campo a campo, sem decidir nada.

**Não pode:** acessar banco, fila ou bucket; guardar sessão, cookie ou segredo
(não há segredo de runtime neste serviço, e o ADR-0022 não ganha entrada);
decidir 200, 404 ou 410 por conta própria; montar regra de exibição de dado
pessoal. O que a API não devolve, a página não mostra. Se a página precisa de
um campo que a operação não traz, o caminho é mudar o contrato.

**Tempo limite de 2 s** em cada chamada da renderização. Estourou ou a API caiu:
página de erro com **503** e botão de tentar de novo, nunca página em branco e
nunca 200 com conteúdo vazio.

**A confiança no `X-Forwarded-For` é o ponto frágil, e está escrito:** a API
sobe com `trustProxy: true` (`src/shared/http/server.ts:156`), ou seja,
acredita no cabeçalho vindo de qualquer um que a alcance. Hoje só alcançam
`api:3000` a borda e, a partir deste ADR, o site. Os tetos por `ip` do contrato
passam a depender de o site repassar o endereço certo. Restringir o
`trustProxy` à sub-rede do compose é trabalho de segurança e de back-end, e
está em *Consequências*.

### 4. Navegador e API: mesma origem, e por isso sem CORS

As poucas ilhas que falam com a API pelo navegador chamam **`/v1` relativo, na
própria origem da página.** A borda roteia `/v1/*` dos hosts do site para a API,
com o mesmo bloco de gateway do ADR-0016 e **sem reescrever caminho**.

Consequência direta: **a API continua sem cabeçalho CORS**, e o bloqueio padrão
do navegador para leitura entre origens continua valendo. CORS aberto sem
necessidade é superfície a mais, e o dia em que alguém o afrouxa para "fazer
funcionar" é o dia em que ele deixa de proteger.

**Quais ilhas existem, e só estas na primeira versão:** o envio de foto de quem
achou (pede a intenção a `/v1/media/finder-photo-intents` e sobe o arquivo direto
para o armazenamento pela URL assinada) e a atualização da conversa em `/c/`.
**Tudo que tem requisito de funcionar sem JavaScript passa pelo formulário e
pelo servidor web**, inclusive quando há JavaScript: o script pode enviar o
mesmo formulário sem recarregar a página, mas para a mesma ação do servidor web,
nunca direto para a API. Uma ação, um caminho. Dois caminhos para o mesmo aviso
divergem, e o que diverge é justamente o que só roda sem script, que ninguém
testa na mão.

**Nenhum reCAPTCHA nas páginas com token.** O contrato já prevê a ausência de
`X-Captcha-Token`: `challenge` degenera em `deny_429` com `Retry-After` só
quando o teto estoura, e nunca bloqueia o aviso em código válido (D9, D31).
Carregar o script do provedor quebraria a CSP fechada e o SEC-005.

**Regra escrita para o dia da migração, e desligada hoje:** se o site sair
para um lugar onde a borda não consiga rotear `/v1` por caminho, o CORS entra
**na borda do host da API** (ADR-0016: CORS é da borda), com lista fechada de
origens (`https://bichu.app`, `https://tag.bichu.app`), sem credenciais, métodos
e cabeçalhos exatos das operações usadas pelas ilhas e `Access-Control-Max-Age:
7200`. Nunca `*`, nunca eco do `Origin`.

### 5. Roteamento de hosts

**`hml.bichu.app` não muda em nada.** Mesmo bloco, mesmos caminhos, mesmo 404 no
resto. O cliente testa no aparelho por ele, e o `API_BASE_URL` do app que está
no aparelho dele aponta para lá.

| Host | Caminho | Destino | Por quê |
|---|---|---|---|
| `bichu.app` | `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association` | borda, estático de `infra/caddy/well-known/` | emenda 1; 200 direto, `application/json`, zero redirecionamento |
| `bichu.app` | `/v1/docs`, `/v1/docs/*`, `/v1/openapi.yaml` | **404 na borda** | a documentação existe só no host da API, atrás de credencial (ADR-0018). Sem esta linha, o `/v1/*` de baixo a publicaria **sem** o `basic_auth` |
| `bichu.app` | `/v1/*` | `api:3000` | o `/v1` de mesma origem das ilhas; mesmo bloco de gateway (`request_body`, `-X-Internal-*`, `x-edge-limits`), importado e não copiado |
| `bichu.app` | todo o resto | `web:4321` | institucional e as rotas públicas |
| `www.bichu.app` | tudo | **308** para `https://bichu.app{uri}` | nenhum link nosso usa `www`, então ele não precisa de arquivo de associação. DNS a criar |
| `tag.bichu.app` | os dois arquivos de `/.well-known/` | borda, estático, mesmo arquivo | é o host impresso na plaquinha (emenda 1) |
| `tag.bichu.app` | `/t/*`, `/_astro/*` | `web:4321` | a página da tag e os artefatos dela, na mesma origem |
| `tag.bichu.app` | `/v1/docs*`, `/v1/openapi.yaml` | 404 na borda | idem `bichu.app` |
| `tag.bichu.app` | `/v1/*` | `api:3000` | as ilhas da página da tag |
| `tag.bichu.app` | `/` | **308** para `https://bichu.app/` | quem digita o host impresso cai no site |
| `tag.bichu.app` | todo o resto | **404 na borda** | o host irreversível tem a menor superfície possível |
| `api.bichu.app` | igual ao bloco de `hml.bichu.app` | `api:3000` | host de produção da API, o mesmo que o `servers` do contrato já declara. Entra em `HOSTS_EXTRA_APP` ao lado de `hml`. DNS a criar. O app de loja compila com `API_BASE_URL=https://api.bichu.app` |
| `hml.bichu.app` | **inalterado** | `api:3000` | ambiente do cliente |
| `img.bichu.app`, `img-hml.bichu.app` | inalterado | `objeto:9000` | ADR-0007, ADR-0014 |

`bichu.app` e `tag.bichu.app` **saem** de `HOSTS_EXTRA_APP` e ganham blocos
próprios. `api.bichu.app` **entra.** `PUBLIC_BASE_URL` continua `hml` por
enquanto (é de lá que sai o `type` do `problem+json`), e trocá-lo é outra
decisão, que não é desta.

`/t/{code}` é servida pelo site em qualquer host que chegue a ele, inclusive o
apex. O host canônico é o de `TAG_BASE_URL`; a rota responder também no apex
não custa nada e protege contra um valor de `TAG_BASE_URL` diferente do
decidido.

**Em desenvolvimento os quatro papéis dividem um host** (`localhost:3000`), então
o bloco local é a união: arquivos de associação no estático, rotas da API
(`/v1/*`, `/.well-known/jwks.json`, `/.well-known/openid-configuration`,
`/webhooks/postmark`) para `api:3000`, e o resto para `web:4321`. O catch-all
local deixa de ser 404 e passa a ser o site; nos hosts da API hospedados
(`hml`, `api`) ele continua 404.

**Ordem da troca, que não pode ser invertida:** o container `web` sobe e
responde saudável **antes** de a borda recarregar com o apex apontando para ele;
na ordem contrária o apex passa de 404 para 502. Para `www` e `api`, que ainda não
resolvem, vale a regra já escrita no Caddyfile: configuração primeiro, DNS
depois, porque o certificado sai por HTTP-01 e `.app` está no pré-carregamento
de HSTS.

**Conferência depois da troca, de fora:** `hml.bichu.app/v1/health` 200 e
`hml.bichu.app/t/x` 404 (nada mudou ali); `bichu.app/` 200 `text/html`;
`bichu.app/v1/health` 200; `bichu.app/v1/docs` 404 sem pedir credencial;
`tag.bichu.app/t/<código inexistente>` respondendo pela página do site; os
quatro alvos de `infra/verificacao/associacao.yml` em 200.

### 6. Arquivos de associação: servidos pela borda, uma fonte, o mesmo arquivo em todo host

Os dois arquivos continuam sendo servidos **pela borda**, a partir de
`infra/caddy/well-known/`, em `tag.bichu.app`, `bichu.app` e `hml.bichu.app`. Eles
**não** entram na imagem do site. O conteúdo deles é do app (identificador e
impressão digital da chave), não do site, e duas cópias em dois lugares
divergem.

**Refino da emenda 1, item 4:** ela previa um `apple-app-site-association` por
host, cada um com os caminhos daquele host. Passa a ser **um arquivo só, com a
união dos caminhos** (`/t/*`, `/c/*`, `/cartaz/*`, `/p/*`, `/@*`,
`/verificar-email`, `/redefinir-senha`, `/transferencia/*`), servido igual nos
dois hosts. Caminho declarado que o host nunca serve não abre nada, porque
nenhum link nosso o usa, e um arquivo em vez de dois elimina a divergência entre
eles. A emenda 1 já dizia "conteúdo idêntico" na regra; o item 4 é que se
afastava dela.

**Na migração:** o host que sair da VM leva a obrigação de servir os dois
arquivos byte a byte iguais, com os três requisitos do ADR-0017 item 3.
`infra/verificacao/associacao.yml` confere isso de fora e reprova na ausência,
então a migração não depende de alguém lembrar.

### 7. Cabeçalhos e CSP: todos emitidos pelo container do site, nenhum pela borda

Tudo que o site precisa de cabeçalho sai **do próprio container**, para que a
imagem leve a política junto quando mudar de lugar. A borda não acrescenta
cabeçalho de página.

- **CSP** pela configuração nativa do Astro 7 (`security.csp`), que calcula o
  hash de todo script e estilo embutido no build. **Nunca `'unsafe-inline'`.**
  Nas rotas do servidor ela sai como cabeçalho; nas pré-renderizadas, como
  `<meta>`. Base, derivada de `docs/04-seguranca.md` 4.6 item 7:
  `default-src 'none'; script-src 'self' <hashes>; style-src 'self' <hashes>;
  img-src 'self' https://img.bichu.app; connect-src 'self'; form-action 'self';
  frame-ancestors 'none'; base-uri 'none'`. Onde houver envio de foto, o
  `connect-src` ganha a origem da URL assinada de upload, lida de configuração
  e nunca `*`.
- `frame-ancestors` não vale em `<meta>`, então o servidor do site roda o
  adaptador em modo `middleware`, dentro de um servidor Node mínimo nosso, que
  acrescenta a **toda** resposta, inclusive às pré-renderizadas:
  `Content-Security-Policy: frame-ancestors 'none'`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer` e, nas rotas com token,
  `X-Robots-Tag: noindex`. O mesmo servidor responde `GET /healthz`.
- `Referrer-Policy: no-referrer` é obrigatório onde o token viaja na query
  (`/verificar-email?token=`, `/redefinir-senha?token=`): sem ele, o token
  sairia no `Referer` de qualquer requisição da página.
- Nenhum script, fonte ou pixel de terceiro em página com token. Pilha de fonte
  do sistema em todas as páginas.

### 8. Tokens de design para CSS, com portão na esteira

`design/tokens.json` continua a fonte única. Um gerador em
`web/scripts/gerar-tokens-css.mjs` escreve `web/src/styles/tokens.g.css`
(propriedades CSS customizadas, nomes derivados do caminho do token), e o
arquivo gerado **é versionado**.

O portão tem a mesma forma dos dois que já existem (tipos do contrato e Dart dos
tokens), e as duas lições deles valem aqui:

- **na esteira:** regenerar e `git diff --exit-code -- web/src/styles/tokens.g.css`,
  reprovando com a instrução de como regenerar;
- **gêmeo local** (`make verificar-tokens-web`): a pergunta é "gerar de novo muda
  algum arquivo?", e não o `git diff`, que reprova o estado correto de quem
  acabou de regerar e ainda não commitou (ver
  `infra/verificacao/verificar-tokens-gerados.mjs`);
- **isca no repositório:** um token alterado sem regerar **precisa reprovar**
  nomeando o arquivo, e a esteira exige essa reprovação. O cuidado registrado no
  portão do Dart vale igual: a isca tem que mexer num token que chega ao
  derivado, senão ela aprova e não prova nada;
- **nenhuma cor escrita à mão em `web/src/`** fora do gerado: um varredor
  reprova literal de cor em `.astro`, `.css` e `.ts`, com lista fechada de
  exceções e motivo em cada uma.

A descrição de `design/tokens.json` cita um destino `server/public/tokens.g.css`,
que nunca existiu e agora não vai existir. Quem mantém o arquivo precisa trocar
a menção pelo caminho acima.

### 9. Forma do projeto e da imagem

```
web/
  astro.config.mjs        saída estática, adaptador node em modo middleware, security.csp
  package.json            dependências próprias, lockfile próprio, engines node 22
  Dockerfile              multi-stage, próprio
  .dockerignore
  servidor.mjs            o servidor mínimo do item 7
  scripts/gerar-tokens-css.mjs
  src/api/generated/      tipos do contrato, gerados e versionados, com portão igual ao da API
  src/styles/tokens.g.css gerado, versionado
  src/pages/              uma página por rota do item 2
  tests/
```

- **Contexto de build é `web/`, e só ele.** Os dois derivados (tipos e tokens)
  são versionados, então a imagem não precisa de `api/` nem de `design/` para
  ser construída. A imagem é autossuficiente, que é o que o cliente pediu para
  migrar depois. O `.dockerignore` da raiz passa a excluir `web/`, para que a
  imagem da API não carregue o site.
- **Imagem:** estágio de build em `node:22-bookworm-slim` fixado por digest (o
  mesmo da API), estágio final com o mesmo base, só `dist/` e dependências de
  produção, usuário não-root, sem ferramenta de build, `HEALTHCHECK` em
  `/healthz`. Serviço `web` no compose, porta 4321 **sem publicar no host**
  (como a API: só a borda alcança), `mem_limit: 96m`,
  `NODE_OPTIONS=--max-old-space-size=48`.
- **Configuração de runtime:** `API_INTERNAL_URL`, `MEDIA_PUBLIC_BASE_URL` (para
  `img-src` e para a `og:image`), `SITE_BASE_URL` (para as URLs canônicas e as
  `og:url`) e a origem de upload do item 7. Nenhum segredo.
- **Artefato de build servido pelo próprio container, sem bucket e sem CDN**,
  divergindo do padrão da casa de pôr estático em armazenamento de objeto. Motivo:
  uma VM, nenhum CDN contratado (ADR-0014 deixou cache de borda só na mídia),
  artefatos com hash e cache imutável, e volume de MVP. **Gatilho para mover:**
  o site sair da VM, ou o egresso do site aparecer na conta. Mídia de usuário
  continua fora desta origem, em `img.bichu.app`.
- **Instrumentação:** log estruturado em stdout com `x-correlation-id` recebido
  da borda e repassado à API, em todo ambiente. A exportação segue a da API
  quando ela for decidida. Nenhum SDK de monitoramento no navegador em página
  com token (item 7 e orçamento de 30 KB).

### 10. O que a esteira passa a exigir do site

Requisitos para quem monta o pipeline; o desenho do job não é meu.

1. `astro check` e lint do TypeScript de `web/`.
2. Tipos do contrato regenerados e comparados, como `verify:types` da API.
3. O portão dos tokens do item 8, com a isca.
4. **Orçamento que quebra o build:** HTML com CSS embutido ≤ 30 KB e JavaScript
   inicial ≤ 30 KB, comprimidos, **por rota** do item 2. As rotas do servidor são
   medidas renderizando contra um mock gerado de `api/openapi.yaml` com os
   `examples` do contrato. Rota sem medição reprova, não passa: um orçamento que
   não encontra a página para medir precisa acusar isso.
5. LCP, CLS e INP (ou TBT como aproximação de laboratório) em 4G simulado e
   aparelho intermediário, nas rotas `/t/{code}` e `/p/{shareToken}`.
6. **Asserção de cabeçalho por rota** (P10 de `docs/04-seguranca.md`): CSP sem
   `unsafe-inline`, `frame-ancestors 'none'`, `noindex` e `no-store` onde o item 2
   manda, `og:` genérica em `/t/`, `/c/` e `/cartaz/`.
7. **O toque único sem JavaScript** (D31): o aviso pela tag concluído com o
   script desligado no navegador de teste.
8. A imagem construída e o container subindo saudável, no mesmo padrão do job
   que já sobe a API.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Astro só estático, ilhas chamando a API pelo navegador, rotas com parâmetro por fallback (a recomendação recebida) | servidor estático de ~10 MB; hospedável em bucket; nenhum processo Node | prévia do WhatsApp igual para todo caso; aviso sem JavaScript impossível; três idas e voltas antes do nome do pet; CORS e URL da API por ambiente no navegador | perde os dois requisitos que motivam o site, e o que se economiza são ~85 MB |
| Estático, com as `og:` por caso servidas por algum processo só para robôs de prévia | preserva o estático para gente | detecção por user-agent é frágil; é o processo Node do mesmo jeito, só que escondido e sem teste; ainda sem aviso sem script | paga o custo da renderização no servidor sem levar os benefícios |
| Next.js | ecossistema grande | runtime React em toda página, estourando o teto de 30 KB de JavaScript por padrão; mais memória no servidor | o Astro faz o mesmo com zero JavaScript de partida |
| SvelteKit | leve, faz os dois modos | runtime de cliente por padrão; sem ganho sobre o Astro para este conjunto de páginas | nada que as oito rotas precisem e o Astro não tenha |
| Fastify com templates, num serviço separado | stack que o squad já conhece; processo mínimo | institucional sem ferramenta de conteúdo, mapa do site e imagem; reinventa o que o Astro dá pronto | resolve metade do pedido |
| O site dentro da imagem da API | um container a menos | contraria a decisão do cliente (imagem separada) e o ADR-0017 (a API não serve HTML) | fechado por decisão |
| API em `api.bichu.app` e o navegador chamando por CORS | hosts totalmente separados | preflight a mais em cada escrita em rede móvel; URL da API diferente por ambiente embutida no navegador; CORS aberto a manter | a mesma origem entrega a separação que importa (a imagem) sem o custo; o CORS fica escrito para o dia em que for necessário |
| Arquivos de associação na imagem do site | a imagem migra com eles | duas fontes do mesmo arquivo (site e borda de `hml`/local), que divergem | o portão externo garante a migração sem a segunda cópia |

## Consequências

**Fica mais fácil:** migrar o site é mover uma imagem autossuficiente e trocar um
registro de DNS, com a política de cabeçalho dentro dela. O link do caso chega ao
WhatsApp com a cara do caso. O aviso pela tag funciona em qualquer aparelho que
abra uma página.

**Fica mais difícil:** existe um terceiro processo Node na máquina, com a sua
própria dependência para manter atualizada e a sua própria linha de log. Um
defeito em "abri o link e não apareceu nada" agora pode estar na borda, no site
ou na API; o `x-correlation-id` atravessando os três é o que torna isso
investigável.

**Orçamento da máquina:** a soma dos tetos vai de 1792 para **1888 MB**, e a folga
para o sistema cai de ~256 para ~160 MB na e2-small. Cabe, com swap configurado
(ADR-0013). O gatilho do ADR-0013 continua sendo o que decide a troca para
e2-medium: memória sustentada acima de 70%. Mudar de máquina é custo, e custo é
do cliente (pergunta 2).

**Irreversível:** nada neste ADR. O host impresso continua sendo o único item
irreversível do produto, e ele não muda aqui.

**Dívida aceita, com gatilho:**

1. `trustProxy: true` na API. O site passa a ser o segundo componente em quem a
   API acredita para saber o endereço de quem chama. **Gatilho:** antes do
   primeiro usuário real, restringir a confiança à sub-rede do compose e provar
   com um caso que envia `X-Forwarded-For` forjado de fora e precisa ser
   ignorado.
2. Artefato de build servido pelo container, sem CDN (item 9).
3. Homologação e produção são a mesma API e o mesmo banco (pergunta 3).

**O que muda em outros documentos, e não é deste PR:**

- `docs/03-arquitetura.md`, orçamento de desempenho do servidor: a linha de
  `GET /t/{code}` HTML (TTFB p95 ≤ 400 ms) volta a ser nossa, medida no site;
- `src/web/` (README e `templates/`) sai quando `web/` nascer. As três regras
  do README (botão sem JavaScript, sem fonte de terceiro, conteúdo crítico
  embutido) passam para o README de `web/`;
- `servers` de `api/openapi.yaml` ganha o domínio real (`api.bichu.app`, e
  `hml.bichu.app` para homologação, que hoje aparece como `api.hml.{dominio}` e
  não resolve).

## Perguntas ao cliente

**1. As páginas do caso perdido (`/p/`) e do perfil público do pet (`/@nome`)
aparecem no Google?**
(a) Não: `noindex` nas duas; o link compartilhado continua com a prévia do pet no
WhatsApp. (b) Sim, as duas. (c) Só o perfil do pet.
**Recomendo (a).** A página do caso mostra o bairro de uma casa onde um animal
sumiu, e o caso é encerrado depois; buscador guarda cópia por meses, e tirar do
índice depois é pedido, não comando. A prévia no WhatsApp, que é o que a
BICHUS-76 pede, não depende de indexação.

**2. O site ocupa ~96 MB da máquina de 2 GB. Troca de máquina agora?**
(a) Não: fica na e2-small e troca quando a memória passar de 70% sustentado,
como o ADR-0013 já prevê. (b) Sim: e2-medium antes de o site ir ao ar, pelo
dobro do preço da máquina.
**Recomendo (a).** Medido, o site usa ~47 MB sob carga, e o teto de 96 MB é folga.

**3. `bichu.app` e `hml.bichu.app` usam o mesmo banco. Os pets e casos de teste
que você cria no aparelho vão aparecer nas páginas públicas de `bichu.app`.**
(a) Aceitar até o primeiro usuário real, com todas as páginas públicas em
`noindex` até lá. (b) Separar produção de homologação antes de o site ir ao ar:
segunda pilha, mais memória ou segunda máquina.
**Recomendo (a).** O gatilho do ADR-0013 (primeiro cadastro que não seja de
teste) já obriga a separação no momento em que ela passa a importar.
