# ADR-0027: O backoffice é do squad: SPA em `admin.bichu.app`, sessão opaca em cookie na mesma origem da API administrativa, conta dedicada e trilha em toda escrita

**Status:** aceito. As decisões do cliente de 23/09 estão fechadas; as
decisões técnicas foram reconciliadas com a seção 22 de `docs/04-seguranca.md`
(ARGOS, mesma data), e as divergências que restaram estão no item 15.
**Data:** 2026-09-23
**Supera:** a credencial de serviço (`adminAuth`, `X-Service-Credential`) do
ADR-0026, seções 2.2 e 2.3; a BICHUS-189 (catálogo em arquivo versionado)
**Emenda:** ADR-0023 (emenda 1), ADR-0016 (emenda 2), ADR-0010 (emenda 1),
ADR-0003 (nota), e o item 5 do ADR-0025 (em `feat/secao-rede`, seção 12)
**Depende de:** ADR-0002, ADR-0007, ADR-0017, ADR-0020, ADR-0021, ADR-0024

**Sobre o número.** Em 23/09 havia dois ADR-0024 (identidade interna, na
`development` local; site web, em `docs/adr-site-web`) e o 0025 é da `Rede`
(`feat/secao-rede`). O 0026 é o da credencial do backoffice
(`feat/BICHUS-189-escrita-do-backoffice`, renumerado de 0025). Este fica com o
0027, o primeiro livre. Se o ADR do site for renumerado depois, ele precisa
saltar este.

## Contexto

Em 21/09 o cliente fechou a BICHUS-189 dizendo que o backoffice era de outro
time. Em 22/09 pediu um painel de outra esteira, e o ADR-0023 desenhou a
fronteira para esse time. Na manhã de 23/09 o ADR-0026 escolheu a credencial
para um painel que ainda era de terceiros, servidor a servidor. **Em 23/09 o
cliente decidiu que o squad constrói o backoffice**, e respondeu, por escrito:

| Tema | Decisão do cliente, 23/09 |
|---|---|
| Escopo da v1 | autenticação, **`Loja`** e **`Rede`**. `Perto`, moderação e operação ficam fora |
| `Loja` | **tabela alimentada pelo painel**. A 14.1/D.5 fecha em (a); a BICHUS-189 é superada |
| Stack e lugar | container próprio, **React + TypeScript**, em **`admin.bichu.app`**, mesma VM, imagem separada atrás do Caddy, consumindo **`/v1/admin/...`** |
| Escrita | por API, nunca direto no banco (D.1). O backend continua sem servir HTML (ADR-0017) |
| Acesso | **só login próprio + papel. Sem MFA e sem Cloudflare Access, risco aceito por escrito** |
| Papéis | **só `admin` entra no backoffice v1**. `moderator` não entra |
| E-mail do administrador | **qualquer e-mail**. Restringir a domínio corporativo foi recusado |
| Ponto do encontro da `Rede` | **o app mostra ao tutor o ponto no mapa**, em resposta autenticada |
| BICHUS-251 (`feat/secao-rede`) | **emendada antes do merge**: sem check-in e galeria na tela, com coordenada |
| Prioridade | em paralelo à cunha, sem tocar no que a demonstração de 30/09 usa |

O estado medido em 23/09, na `development` local (`4ae9671`):

- **Não existe rota `/v1/admin/...`** em `src/`. Mesmo assim,
  `https://hml.bichu.app/v1/admin/ping` responde `404 application/problem+json`
  da **aplicação** (medido por ARGOS e conferido pelo coordenador): o
  `handle /v1/*` do Caddyfile repassa tudo, e **a primeira rota administrativa
  sairia publicada em `hml` e no apex** sem nenhuma linha nova na borda.
- `user_roles` existe; todo cadastro grava `tutor`
  (`kysely-identity-repository.ts:300`), e nada lê `admin`.
- `audit.events` existe com `bichu_audit_writer` sem `UPDATE` nem `DELETE`. A
  porta `AuditLog.record` abre a **própria** transação e engole a falha por
  `onFailure`: serve ao app, e não serve à escrita administrativa (item 8).
- `store_partners`/`store_items` existem (`20260922000009`), com identidade
  interna separada da pública (ADR-0024). `network_events` existe só em
  `feat/secao-rede`, sem coordenada e com `slug` como chave primária no commit
  `0272619` (o worktree dela está migrando para `id` + `slug`).
- O token do produto foi desenhado para o app (ADR-0002): JWT RS256 de 15
  minutos em `Authorization: Bearer`, refresh no Keychain/Keystore. **Nenhuma
  das duas peças tem lugar seguro no navegador sem decisão**, e é a decisão
  central deste documento.

## Decisão

### 1. Topologia: um container estático, uma origem, e a borda separa os caminhos por host

**O painel é uma SPA React + TypeScript, construída por Vite, servida pelo
container `admin-web`**, que só entrega arquivo: servidor estático não-root
(`nginxinc/nginx-unprivileged` ou `caddy` em `file_server`, fixado por digest),
teto de **32 MB**. Sem Node em execução: o painel não tem prévia de link, não é
indexável e não precisa funcionar sem JavaScript, que foram os motivos do site
para renderizar no servidor. A e2-small tem 2 GB e os tetos do `compose.yaml`
já passam de 1,8 GB.

O fonte mora em `admin/`, ao lado de `app/` e `web/`. Os tipos são **gerados
de `api/openapi.yaml`** por `openapi-typescript`, o mesmo gerador da API e do
site, em `admin/src/api/generated/`, conferidos na esteira como
`npm run verify:types`. O painel valida formulário por conveniência; a
autoridade é do servidor.

**Na borda, um bloco novo para `admin.bichu.app`** (D33):

| Caminho em `admin.bichu.app` | Destino |
|---|---|
| `/v1/admin/*` | `api:3000` com `handle`, **sem reescrita** (ADR-0016). Antes de repassar, remove todo `X-Internal-*` de entrada e define `X-Internal-Surface: admin` |
| qualquer outro `/v1/*` | **404 da borda** |
| `/entrar` | `admin-web`, documento de login isolado (item 5) |
| todo o resto | `admin-web`; `index.html` com `Cache-Control: no-store`, `/assets/*` com hash em `public, max-age=31536000, immutable` |

Nos **outros** hosts (apex, `tag.`, `hml.`, o que vier), `/v1/admin/*` responde
**404 da borda**, antes do `handle /v1/*`. **O serviço revalida:** a guarda
administrativa responde 404 a toda requisição em `/v1/admin/*` sem
`X-Internal-Surface: admin`, e isso cobre a rota esquecida no Caddyfile e o
acesso direto à porta do container. Borda fechando é conveniência; recusa no
serviço é proteção (ADR-0016 item 5).

`/v1/admin/*` responde JSON, `application/problem+json` e, no login e na
reautenticação, `Set-Cookie`. O ADR-0017 fica intacto. `admin.bichu.app`
precisa de registro A para a VM (`35.247.247.16`); ele não existe.

**Orçamento do painel**, medido na esteira e quebrando o build: JavaScript
inicial **≤ 200 KB comprimidos** sem o mapa; o pedaço do mapa, carregado sob
demanda só na tela de evento, **≤ 150 KB comprimidos**; LCP ≤ 2,5 s, INP ≤
200 ms, CLS ≤ 0,1. Build de produção sem `.map` nem `sourceMappingURL` (D48).

### 2. Sessão no navegador: opaca, no servidor, em cookie `__Host-`, na mesma origem

```
Set-Cookie: __Host-bichu_adm=<256 bits de CSPRNG, base64url>; Path=/; Secure; HttpOnly; SameSite=Strict
```

Sem `Domain`, sem `Expires`, sem `Max-Age` (D35): o cookie morre com o
navegador, e os prazos reais são do servidor.

- `__Host-` obriga `Secure` e `Path=/` e **proíbe `Domain`** (RFC 6265bis): o
  cookie fica preso a `admin.bichu.app`, e nenhum subdomínio irmão consegue
  plantá-lo nem sobrescrevê-lo.
- O banco guarda só o **SHA-256** do valor (tabela `admin_sessions`, apêndice
  A.1). Entropia de 256 bits dispensa sal.
- **Inatividade: 30 minutos. Teto absoluto: 12 horas** desde a senha, que o uso
  não empurra (D38). `last_seen_at` renova no máximo uma vez por minuto, para
  não ser uma escrita por clique.
- **Identificador novo no login e na reautenticação**; o anterior deixa de
  valer (fixação de sessão, D38).
- **Cada requisição confere, no servidor:** o hash existe; não foi revogado;
  está dentro dos dois prazos; `created_at >= users.sessions_invalid_before`; a
  conta está `active` e não excluída; **`user_roles` ainda tem `admin`**. O
  papel nunca vai em claim (D37). Retirar o papel vale na próxima requisição,
  e não daqui a 15 minutos.

**`Authorization: Bearer` em `/v1/admin/*` responde 401, inclusive com JWT
válido de conta `admin`; o cookie é ignorado fora de `/v1/admin/*`** (D36).

#### Por que cookie, contra as ameaças que decidem

| | Cookie `HttpOnly` opaco, mesma origem (escolhido) | Bearer em memória + refresh em cookie | Bearer + refresh em `localStorage` |
|---|---|---|---|
| **XSS no painel** | o script **não lê** a credencial; age só de dentro da aba aberta, e a sessão cai no servidor | o script lê o token de acesso e o **leva embora**: 15 minutos de uso de qualquer máquina | o script leva o refresh: **acesso de longo prazo** |
| **CSRF** | exige defesa (item 3) | o token é imune; **o refresh em cookie volta a exigir a mesma defesa** | imune |
| **Recarregar a página** | a sessão continua | o token some; a renovação pelo cookie é obrigatória a cada F5 | continua |
| **Revogação** | imediata: linha no banco, lida a cada requisição | até o `exp`, ou consulta ao banco em toda requisição, e então sobra só a complexidade | idem |
| **Peças** | uma credencial, um mecanismo | duas credenciais, dois mecanismos | uma |

O XSS decide contra o Bearer: nenhuma defesa de CSRF salva um painel com XSS,
mas o cookie `HttpOnly` limita o estrago à aba aberta, e o token em memória o
exporta. O argumento a favor do Bearer (imunidade a CSRF) reaparece inteiro no
refresh assim que a sessão precisa sobreviver a um F5. É o padrão do rascunho
*OAuth 2.0 for Browser-Based Applications* do IETF (o navegador só carrega
cookie de sessão, nunca token) e do *OWASP Session Management Cheat Sheet*.

**O ADR-0002 recusou cookie opaco** porque o **app publicado** aprenderia um
mecanismo que o Keycloak não fala. O painel não é publicado em loja:
recarregar é o deploy. Quando o Keycloak entrar (ADR-0003), o painel vira
cliente OIDC confidencial que troca o código pela sessão **no servidor** e
continua entregando o mesmo cookie: é o padrão BFF que o IETF recomenda para
navegador. O mecanismo deste item sobrevive ao Keycloak; o Bearer em memória
seria jogado fora.

A alternativa que ARGOS aceita, o mesmo JWT RS256 com `aud: bichu-admin` dentro
do cookie, foi descartada pelo motivo que ele mesmo dá: traz expiração de 15
minutos e renovação para um lugar onde a sessão de servidor faz o mesmo com
menos peças, e revogação imediata exige ler o banco de qualquer jeito.

**Desenvolvimento local:** Vite em `http://localhost:5173` com *proxy* de
`/v1/admin` para a API, mesma origem. Chromium e Firefox aceitam `__Host-` com
`Secure` em `localhost`. **Não há variável para desligar `Secure`**: interruptor
de segurança que existe para desenvolvimento é interruptor que um dia sobe
ligado.

### 3. CSRF: `SameSite=Strict` não basta, porque o ataque vem de um vizinho

`SameSite` separa **sites**, e site é o domínio registrável: `bichu.app`,
`hml.bichu.app`, o site institucional e `admin.bichu.app` são o mesmo site. Um
XSS no site institucional (outro container, na mesma VM) faz uma requisição
que o navegador trata como mesmo site, e o cookie `Strict` vai junto (T6). Por
isso, em todo método que não seja `GET`/`HEAD` em `/v1/admin/*` (D39):

1. **`Origin` exatamente igual a `ADMIN_ORIGIN`** (`https://admin.bichu.app`).
   Ausente também recusa.
2. **`X-CSRF-Token` igual ao token sincronizador** da sessão, comparado em
   tempo constante. Ele sai no corpo do login, da reautenticação e de
   `GET /v1/admin/session`, **nunca em cookie**, e troca junto com o
   identificador da sessão. No contrato, é o esquema `adminCsrf`.
3. **Nenhum CORS** (item 4): o cabeçalho customizado obriga preflight, e o
   preflight de qualquer outra origem falha.

Qualquer falha: `403 forbidden`. **`GET` não muda estado** em `/v1/admin/*`, e
isso é regra de contrato: nenhuma operação `GET` administrativa declara
`x-audit`, **com uma exceção deliberada**: a leitura da fila de pedidos
(`listAdminNetworkJoinRequests`), que é leitura de pessoa e grava na trilha
por D55 (item 17). A exceção não muda estado de negócio; ela só registra.

### 4. CORS: nenhum, e é por isso que o painel e a API administrativa dividem a origem

**A resposta à pergunta "qual CORS para `admin.bichu.app`" é não precisar de
um** (D34). O SPA chama `/v1/admin/*` por caminho relativo, e nenhuma resposta
de `/v1/admin/*` traz `Access-Control-Allow-*`. Isso elimina a lista de origens
(o erro clássico é refletir `Origin` com `Allow-Credentials: true`), mantém o
cookie longe do host do app, e fecha o item 3.3. A política do host do app não
muda.

**O único CORS que o painel exige é do armazenamento de objeto**, porque o
envio de imagem vai direto do navegador ao bucket (ADR-0007, item 10): o bucket
de envio aceita `POST`/`PUT` com origem `https://admin.bichu.app`, só no
prefixo do catálogo, sem credenciais.

### 5. Login, conta dedicada e o que responde ao "um token, dois poderes"

**A conta administrativa é dedicada** (D42). Conta com papel `admin` ou
`moderator` é recusada em `POST /v1/auth/login` e `POST /v1/auth/refresh` com
**o mesmo 401** de credencial inválida, e conceder o papel revoga as sessões
móveis da conta. Quem é administrador e tutor usa duas contas.

É a resposta ao motivo 1 do ADR-0026 contra "conta de pessoa com papel": o
problema era **um token, dois poderes**. Aqui são duas credenciais (cookie só
em `/v1/admin`, Bearer só fora dele) **e** duas contas, e a conta
administrativa não abre o app. A porta do tutor, mais frouxa por decisão
(ADR-0020), deixa de servir de oráculo da senha do administrador (T2).

**Login administrativo** (`POST /v1/admin/auth/login`), na ordem:

1. **reCAPTCHA v3 obrigatório** (D41), com limiar **0,5**. Ausente ou abaixo:
   `403 captcha-rejected`, e alerta. Recusar é aceitável aqui, ao contrário do
   login do tutor (ADR-0020): são poucas pessoas conhecidas e sem emergência.
   O script do Google **não entra na origem da sessão**: o login é um documento
   próprio, `/entrar`, com CSP própria que admite o reCAPTCHA; depois do login
   ele navega com recarga completa para `/`, cuja CSP é `script-src 'self'`.
   Como o cookie é `HttpOnly`, o script de terceiro nunca o alcança.
2. **Teto antes de derivar o hash** (D44), e o contrato o declara em
   `x-rate-limit`: 5 falhas por e-mail em 15 minutos e 10 em 24 horas (a
   segunda bloqueia até redefinição por e-mail ou desbloqueio operacional), 20
   falhas por IP em 1 hora, sempre `429` com `Retry-After`. Acima de 50 falhas
   no total em 10 minutos, alerta de plantão (métrica, não balde).
3. **Mesmo corpo e mesmo tempo** para conta inexistente, senha errada, e senha
   certa sem papel `admin` (hash de descarte da 7.1 de `04-seguranca.md`). O
   login não conta a ninguém quem é administrador (T3).
4. **Senha de conta administrativa** (D43): mínimo de **15 caracteres**,
   conferida contra base de senhas vazadas na definição e em todo login. Senha
   correta que está na base: `403 password-reset-required`, com o caminho de
   redefinição. A definição acontece pela redefinição por e-mail (a conta
   dedicada não entra no app), e é `POST /v1/auth/password-reset/confirm` que
   recusa com `422 weak-password` abaixo de 15 para conta com papel.
5. **Aviso por e-mail a cada sessão administrativa aberta** (D46), com o link
   "não fui eu" que já existe (`POST /v1/public/session-alerts/{alertToken}/disavow`).
   Ele empurra `sessions_invalid_before`, que o item 2 lê a cada requisição:
   o invasor cai do painel em menos de um segundo. ARGOS pede o aviso para
   dispositivo ou rede nova; aqui é **toda** sessão, porque reconhecer
   dispositivo exigiria um cookie persistente de dispositivo, que é mais um
   artefato com cara de credencial, e com até cinco contas e sessões de 12
   horas o volume é de poucos e-mails por dia. Toda redefinição de senha de
   conta administrativa avisa **todos** os administradores.

**Reautenticação** (D40): `POST /v1/admin/auth/reauth` confere a senha e devolve
um token de **5 minutos, uso único, escopo por operação**, apresentado em
`X-Admin-Reauth-Token`; rotaciona o identificador da sessão e o `csrf_token`.
É o mesmo desenho de `POST /v1/auth/reauth`, com escopos próprios e cabeçalho
próprio, porque o token do app é preso ao `jti` do JWT móvel, que aqui não
existe. Escopos da v1, e o motivo de cada um:

| Escopo | Operação | Por quê |
|---|---|---|
| `network_event_relocation` | mudar data, horário ou local de evento **publicado** | é o ataque de T11: reunir cães num lugar e horário escolhidos por quem tomou a conta |
| `network_event_cancellation` | cancelar evento publicado | desfaz um encontro que pessoas planejaram |
| `network_event_removal` | remover evento (estado terminal) | não tem volta |
| `store_item_retirement` | retirar da vitrine item publicado | é o "excluir publicado" de D40 para a `Loja`: nada é apagado, mas um roteiro com a senha roubada esvaziaria a vitrine |

Não há operação em lote na v1; a que vier exige reautenticação. O item em
rascunho (nunca publicado) não tem o que retirar.

**Por que não reaproveitar `X-Reauth-Token`.** O token do app é preso ao `jti`
do JWT móvel (`reauth` em `components/securitySchemes`), e a conta
administrativa não tem JWT móvel (D42). Um cabeçalho com o mesmo nome e duas
amarrações diferentes seria um token que vale num lugar e não no outro sem que
o nome diga. Por isso `adminReauth` / `X-Admin-Reauth-Token` e a extensão
`x-admin-reauth-scope`, com a mesma semântica (5 minutos, uso único, escopo),
presos à sessão administrativa.

**Redefinição de senha da conta administrativa: o fluxo que já existe.**
`POST /v1/auth/password-reset` e `POST /v1/auth/password-reset/confirm`, com a
página `/redefinir-senha` do site. D42 recusa a conta administrativa no
**login** e na **renovação** do app, e não na redefinição: redefinir não abre
sessão, só troca o segredo. Um segundo fluxo seria uma segunda porta para o
mesmo segredo, com os mesmos riscos e metade do teste. Para conta com papel
`admin`, a confirmação (1) recusa senha abaixo de 15 caracteres ou presente na
base de vazadas com `422 weak-password`; (2) empurra `sessions_invalid_before`,
o que derruba toda sessão administrativa da conta; e (3) avisa **todos** os
administradores (D46). O e-mail de redefinição é o ponto sem mitigação do item
9.

**Sair**: `POST /v1/admin/auth/logout` revoga a sessão;
`POST /v1/admin/auth/logout-all` empurra `sessions_invalid_before` e derruba
todas as sessões da conta, que por ser dedicada não tem sessão móvel a perder.

### 6. XSS: o que o painel impõe, porque é dele que o item 2 depende

O cookie limita o XSS à aba; não o evita. **Os cabeçalhos de `admin.bichu.app`
são os de D48, aplicados na borda** (e não no container, para não se perderem
na troca dele), com os dois marcadores resolvidos assim:

- `<HOST_DE_TILES>` = **`tile.openstreetmap.org`**, por nome exato;
- `<HOST_DE_UPLOAD>` = o host de `UploadIntent.url` de cada ambiente (o
  endpoint do armazenamento de objeto), por nome exato, vindo de configuração.

**Nenhuma imagem externa entra pelo painel.** O item da `Loja` escrito pelo
painel só tem imagem **nossa**, enviada pelo caminho do ADR-0007; a coluna
`store_items.image_url` (URL do parceiro) continua existindo para a massa, e a
API administrativa não a aceita na escrita. Isso mantém `img-src` sem curinga e
tira do app um pixel de rastreamento de terceiro na vitrine.

No código: `react/no-danger` como erro de lint, com isca na esteira; nenhum
script de terceiro fora de `/entrar`; `npm ci` com *lockfile* (P2 estendido);
URL de entrada só `https:`, sem `userinfo`, sem IP literal, até 2048
caracteres (D47); texto é texto puro, e app e site o renderizam como texto.

**O mapa (D.4):** Leaflet empacotado no bundle, tiles do OSM carregados como
imagem. A política de uso do OSM admite volume baixo com atribuição visível,
que é o caso. **Não há caixa de busca de endereço**: buscar endereço é
geocodificação, e o ADR-0006 a proíbe. O operador navega e toca.

### 7. Portão de papel: papel mínimo por operação, guarda no prefixo

**Só `admin` abre sessão administrativa na v1** (decisão do cliente). Toda
operação de `/v1/admin/*`, exceto o login, declara no contrato
**`x-admin-roles: [admin]`**, o nome que D37 sugere. A lista fechada já tem
`moderator` para quando a moderação entrar; ela entra como valor novo numa
operação, não como mecanismo novo.

**Onde a verificação mora:** a guarda é registrada **no prefixo `/v1/admin`**,
em `registrarRota`, e não rota a rota: rota administrativa fora dela não sobe.
A rota declara `adminRoles` no `defineRoute`, e o teste
`rotas-registradas-contra-o-contrato` passa a comparar o valor com o contrato,
como já compara o teto. **Não há verificação de papel dentro de caso de uso.**

**403, e não o 404 do ADR-0026.** O ADR-0026 respondia 404 para não confirmar
a existência de uma entrada a quem tivesse um segredo compartilhado entre dois
times. Aqui cada credencial é de uma pessoa, e a guarda decide **antes de
qualquer leitura do recurso**, então o 403 não diz nada sobre o recurso. O
predicado de papel no `WHERE` do ADR-0026 (2.4) continua sendo o desenho da
escrita do diretório quando ela entrar no painel; para `Loja` e `Rede`, que são
recursos globais sem dono, não há o que ele acrescente.

Regras que a esteira passa a cobrar no contrato, cada uma um portão a escrever
com a isca que precisa reprovar (P16 de `04-seguranca.md`):

1. toda operação sob `/admin/`, exceto `openAdminSession`, declara `security`
   com `adminSession` e declara `x-admin-roles`;
2. toda operação sob `/admin/` de método não seguro declara `adminCsrf` e
   `x-audit`;
3. nenhuma operação fora de `/admin/` declara `adminSession`, `adminCsrf` ou
   `adminReauth`;
4. a matriz de P16 é gerada do contrato e reprova com zero operações.

**Conceder e retirar papel não é operação do SPA** (D51): é o comando
`src/bin/conceder-papel.ts`, que grava na trilha com `actor_kind = 'system'` e
o operador em `metadata`, e que revoga as sessões móveis da conta ao conceder.
Um papel que se concede por tela é a primeira coisa que um invasor com a senha
de um administrador usaria.

### 8. Trilha: toda escrita administrativa grava na mesma transação, ou não acontece

Toda operação administrativa que muda estado grava em `audit.events` **na mesma
transação** da mudança, com `SET LOCAL ROLE bichu_audit_writer`. **Falha da
trilha desfaz a escrita** (D49). Isso **supera** a regra do ADR-0026 seção 4
("falha da trilha não derruba o pedido"), que vale para o app e não para
escrita administrativa: escrita de conteúdo público sem autor gravado é o
estado que a trilha existe para impedir.

**Consequência de código:** `AuditLog` ganha uma forma transacional
(`recordIn(trx, evento)`, ou uma unidade de trabalho que a rota administrativa
recebe), porque `record` abre transação própria. A forma com `onFailure`
continua para o app.

| Campo | O que vai |
|---|---|
| `actor_kind` / `actor_user_id` | `user` e o UUID interno do administrador; no login recusado de e-mail desconhecido, `anonymous` |
| `action` | o valor de `x-audit.action`, no padrão `admin.<recurso>.<verbo>` (D49), entrando na união fechada `AuditAction` |
| `resource_kind` / `resource_id` | o tipo e o **`id` interno**, nunca o `slug`. O `slug` muda (ADR-0005), e a trilha precisa achar o mesmo objeto depois da troca; é divergência declarada com o ADR-0026 seção 4, que gravava o `slug` |
| `before` / `after` | os campos que mudaram. Catálogo e evento não são dado pessoal, então o valor vai inteiro, **exceto a coordenada do evento**: a porta proíbe coordenada bruta na trilha, e ali vai só `{"point_changed": true}` |
| `metadata` | `{"surface": "admin", "session": <8 primeiros bytes hex do hash da sessão>}` |

Também gravam: login com sucesso e com falha, recusa pelo reCAPTCHA, logout,
reautenticação, e **toda recusa da guarda com conta identificada** (um tutor
batendo em `/v1/admin` é o sinal mais útil desta superfície, e gera alerta).
Leitura administrativa não grava na v1, porque `Loja` e `Rede` não têm dado
pessoal, **exceto a fila de pedidos**, que grava
`admin.network_join_request.listed` com os filtros e a quantidade devolvida,
nunca os nomes (D55).
Retenção de 24 meses; **não há tela de trilha na v1**.

### 9. Sem MFA: risco aceito pelo cliente

**Risco aceito pelo cliente, por escrito, em 23/09/2026. Consequência nomeada:
senha de administrador vazada é acesso administrativo.** Quem tiver o e-mail e
a senha de uma conta `admin`, de qualquer lugar, publica e retira produto da
`Loja`, cria e muda evento da `Rede` (inclusive o ponto no mapa que o app
mostra), e envia imagem que aparece para toda a base, com a marca Bichu, até
alguém perceber. `admin.bichu.app` aparece no log de Certificate Transparency
no dia em que o certificado for emitido.

**A recuperação de senha fica sem mitigação.** O cliente recusou restringir o
papel a e-mail de domínio corporativo (a Q1 de `04-seguranca.md` 22.8). A
senha se redefine pela caixa de e-mail do administrador, que pode ser qualquer
provedor e não tem segundo fator garantido: **quem tomar a caixa de e-mail
toma o painel**, sem passar pelo reCAPTCHA nem pelo teto do login (T14). O
aviso a todos os administradores a cada redefinição (item 5) é detecção, não
prevenção.

Este ADR **não** trata MFA como bloqueante. O que cabe dentro da escolha, e
está decidido: conta dedicada; reCAPTCHA e teto no login; senha de 15 com
recusa de vazada; aviso a cada sessão com "não fui eu"; sessão de 30 minutos e
12 horas; revogação na próxima requisição; reautenticação para mover e cancelar
encontro; teto de dano por conta (item 11); aviso a todos os administradores a
cada encontro criado, movido ou cancelado; trilha de toda escrita. O registro
formal é o RA-01 de `04-seguranca.md` 22.7, e os gatilhos de revisão são os
dele.

### 10. Imagem: a intenção de envio do ADR-0007, com propósito amarrado

`POST /v1/admin/media/catalog-image-intents` segue o ADR-0007: o backend nunca
recebe os bytes, devolve a política assinada de 10 minutos, e o navegador envia
direto ao bucket privado. JPEG, PNG e WebP; **SVG recusado sempre**. O envio
declara `purpose` (`store_item` | `network_event`) e fica gravado em
`upload_intents` com `kind = 'catalog_image'`.

A confirmação é a própria escrita do item ou do evento, na lista `images`
(itens 16 e 17). Ela **só aceita** envio de `kind = 'catalog_image'`, com o
mesmo `purpose`, criado por conta `admin`: foto de pet, de achador ou de outro
propósito é recusada com `400` (T9). Ela enfileira o processamento (bytes
reais, EXIF/XMP/IPTC removidos, reescrita, teto de pixels, derivadas) e a
derivada vai ao bucket **público**, com chave de 128 bits aleatórios. **A
derivada nunca é servida antes de pronta**: enquanto processa, a leitura
pública mostra a imagem anterior ou nenhuma. Nenhuma operação aceita URL para o
servidor buscar (SSRF).

D50 pede que só mídia **já processada** possa ser anexada. Aqui ela é anexada
em processamento e só servida pronta; a diferença é o painel não precisar de
uma operação de consulta de estado antes de salvar. O que D50 protege (T9 e
conteúdo não processado em público) fica protegido pelos dois cortes acima.

### 11. Tetos de dano por conta

Declarados por operação em `x-rate-limit`, com `note` nomeando o balde
compartilhado, e a implementação chaveia por `(conta, balde)`, não por
operação (D52):

- `admin_write`: **120 escritas em 10 minutos**, somadas todas as escritas
  administrativas de catálogo e de evento;
- `admin_publication`: **30 publicações por hora**, somadas a publicação de
  item e a criação de evento (que é publicação);
- estouro: `429` com `Retry-After`, e alerta.

**Limite na borda (D45): aceito para o host administrativo**, e o ADR-0016
ganha a emenda 2. A recusa do item 4 dele valia para a API do app, onde os
tetos por dimensão certa moram no serviço. Para o login administrativo o
argumento de ARGOS decide: ele é a única parede que sobrou depois da recusa de
MFA e de Access, e o repositório já teve, até 21/09, teto declarado e nenhum
aplicado. Imagem própria do Caddy com o plugin de taxa, construída na esteira
em estágio múltiplo e fixada por digest, **só com as duas regras de D45**
(10/min por IP no login, 600/min por IP em `/v1/admin/*`). Os números entram em
`x-edge-limits` **no mesmo commit** do Caddyfile e da extensão do verificador
de borda: o verificador de hoje ignora chave que não conhece, e um número
declarado sem imposição é pior que nenhum. Na migração para borda gerenciada, o
equivalente é uma regra de taxa do balanceador (Cloud Armor), e o número no
contrato continua sendo a fonte.

### 12. Emenda da BICHUS-251 (`feat/secao-rede`), para o backend executar

Esta seção é o despacho. A migração `20260923000001_secao-rede-eventos-e-presenca.sql`
**não foi mesclada nem aplicada em banco compartilhado**, então ela é **editada
no lugar**, e não corrigida por migração nova. Confirme antes que nenhum
ambiente a aplicou; se algum aplicou, a mesma emenda vira migração nova.

**12.1 A chave.** `slug` deixa de ser chave primária (ADR-0024):

```sql
id    uuid PRIMARY KEY,
slug  text NOT NULL CONSTRAINT network_events_slug_formato
      CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
...
CREATE UNIQUE INDEX network_events_slug_unico ON network_events (slug);
```

Toda chave estrangeira aponta para `id`. O `slug` continua sendo a única chave
que sai em resposta e o parâmetro de caminho. O worktree da branch já está
fazendo isto; esta seção confirma a forma.

**12.2 O lugar ganha ponto.** Os três rótulos continuam obrigatórios; o ponto é
opcional (D.4: tolerância, não caminho):

```sql
geo         geography(Point, 4326),
geo_source  text CONSTRAINT network_events_origem_do_ponto
            CHECK (geo_source IS NULL OR geo_source = 'map_pin'),
CONSTRAINT network_events_ponto_anda_com_origem CHECK ((geo IS NULL) = (geo_source IS NULL)),
...
CREATE INDEX network_events_por_ponto ON network_events USING GIST (geo)
  WHERE publication_status IN ('published', 'cancelled') AND geo IS NOT NULL;
```

`geography` e não `geometry`, pelo motivo de `lost_cases` e `professionals`.
`map_pin` é a única origem que o ADR-0006 admite e que um operador consegue
produzir.

**12.3 `active` sai; entram publicação, origem e autor.** As colunas exatas
estão no apêndice A.4. `active boolean` é substituída por `publication_status`,
e os índices `network_events_agenda` e `network_events_por_cidade` passam a
`WHERE publication_status IN ('published', 'cancelled')`. `created_by_user_id`
leva no `COMMENT ON COLUMN` a marca que `portao-colunas-que-nao-saem.ts` lê.
`network_event_images` **não** entra nesta migração: ela aponta para
`catalog_images`, que nasce na migração do backoffice, e é criada lá (A.4.2).

**12.4 Check-in e galeria saem desta migração e do contrato.** O cliente os
tirou da tela. `network_event_checkins`, `network_event_photos`,
`checkInNetworkEvent`, `checkin_count`, `photo_count`, `NetworkEventPhoto` e
`NetworkCheckIn` saem. Criar as duas tabelas depois é `CREATE TABLE`, aditivo e
sem risco; deixá-las agora é esquema sem fluxo e campo de contrato sempre zero.
**As decisões 1 a 3 do ADR-0025 continuam normativas** para quando voltarem
(check-in sem `pet_id`, presença como número, foto sem autor na saída). A isca
`rede-nao-liga-dois-pets` sai com a operação que ela vigia, e volta com ela.

**12.5 O ponto sai só em resposta autenticada, numa operação própria.** O
cliente decidiu que o app mostra o ponto ao tutor. `listNetworkEvents` é
pública e `getNetworkEvent` tem autenticação opcional, então **nenhuma das duas
pode carregar o ponto**: o portão de contrato público trata autenticação
opcional como pública, e o ADR-0021 proíbe a resposta que muda conforme o
chamador. O ponto sai em:

```yaml
/network/events/{eventSlug}/location:
  get:
    operationId: getNetworkEventLocation
    security:
      - bearerAuth: []          # sem alternativa vazia
    responses:
      '200': { point: { lat, lon } | null }   # NetworkEventLocation
      '401': Unauthorized
      '404': o mesmo corpo de getNetworkEvent para evento nao visivel
```

O evento é visível para esta operação sob a mesma regra de `getNetworkEvent`
(`publication_status IN ('published', 'cancelled')`), com a autorização na
cláusula `WHERE`. O `x-rate-limit` é por conta.

**Linha para o mobile:** escolha (a), por operação separada. O ponto do
encontro sai só em `GET /v1/network/events/{eventSlug}/location`, com
`bearerAuth` obrigatório; `getNetworkEvent` continua sem ponto e com
autenticação opcional, então a retirada do token da chamada de detalhe em
`feat/secao-rede-emenda-app` (`9b8caa2`) **fica como está**, e o app acrescenta
a chamada de `location`, com token, na tela do encontro. Sem conta, a tela
mostra os rótulos e não mostra mapa. O P5 de `04-seguranca.md` não precisa de
emenda: nenhuma operação com alternativa `{}` carrega `lat`/`lon`.

**12.6 Cancelado.** `NetworkEventStatus` ganha `cancelled`, que prevalece sobre
o estado temporal. **O cancelado continua visível até o fim previsto**
(decisão do cliente, 23/09), com o selo por extenso.

**12.7 O texto do ADR-0025.** O item 5 ("o evento não tem coordenada", "não há
mapa, em zoom nenhum") fica **superado** por este ADR e pela emenda 1 do
ADR-0010, e a branch registra isso no ADR-0025 antes do merge. Os itens 1 a 4 e
6 continuam.

**12.8 A massa.** `publication_status = 'published'`, `published_at`
preenchido, `origin = 'admin'`, e
pelo menos um evento com ponto e um sem, para a tela mostrar os dois casos.

**12.9 O evento não tem rascunho**, como a designer propôs: criar é publicar
(`publication_status = 'published'` na criação). O modelo concorda, com uma
consequência que precisa estar dita: criar evento dispara o aviso a todos os
administradores e conta no teto de publicações, e corrigir o lugar ou o
horário de um evento recém-criado já é mudança de evento publicado, com
reautenticação. Título, resumo e capa se editam livremente. Salvar pela metade
fica no formulário do painel, não no banco.

**12.10 Encontro privado na leitura pública.** `NetworkEventSummary` e
`NetworkEvent` passam a ser `oneOf` de duas formas, discriminadas por
`visibility`: a pública, que é a de hoje mais os campos do item 17; e
`NetworkEventPrivateTeaser`, com **exatamente** `slug`, `title`,
`local_date`, `visibility: private` e `status`, e `additionalProperties:
false`. **`local_date`** é a data local (`AAAA-MM-DD`) calculada no fuso do
encontro, no lugar de `starts_at`, `ends_at` e `time_zone`: o cliente disse
título e data, a tela não mostra o horário, e o nome do fuso
(`America/Porto_Velho`) entregaria o estado. **Sem capa**: a foto de um
encontro costuma ser a foto do lugar (22.10.4). **O `slug` do privado é gerado
pelo servidor**, aleatório, e não é editável: ele sai no teaser para todo
mundo, e um `slug` digitado pelo administrador poderia dizer o lugar. Público
que vira privado ganha `slug` novo, e o antigo passa a 404 sem
redirecionamento. A diferença vem da propriedade do **evento**,
igual para qualquer chamador, então não é ramo privilegiado (ADR-0021).
Encontro privado **não entra em filtro por nada que é oculto nele** (`city`,
`admission`, `size`): aparecer no recorte entregaria o valor.

**Divergência com a designer, resolvida pela decisão do cliente:** a §24.13.5
de `06-design-system.md` mostra a **capa** no privado não aprovado. O cliente
decidiu **só título e data**, então a capa fica do lado oculto e o app usa o
banner da marca (§24.12.2) nesse estado.

**12.11 As operações novas do app**, todas `bearerAuth` sem alternativa vazia:

| Operação | Caminho | O que faz |
|---|---|---|
| `requestToJoinNetworkEvent` | `POST /network/events/{eventSlug}/join-request` | cria o pedido da conta, sempre 200 com o estado que o app vê; encontro público ou inexistente responde 404; sem corpo. Idempotência abaixo |
| `getMyNetworkEventJoinRequest` | `GET /network/events/{eventSlug}/join-request` | o estado do pedido **da própria conta**, no vocabulário do app; sem pedido, 404 |
| `withdrawNetworkEventJoinRequest` | `DELETE /network/events/{eventSlug}/join-request` | desiste enquanto o app vê `requested`; aprovado ou encontro encerrado, 400 |
| `getNetworkEventPrivateDetails` | `GET /network/events/{eventSlug}/private-details` | o conteúdo oculto do privado. 404 se o encontro não é privado, não existe, ou a conta não tem pedido `approved`, com o mesmo corpo nos três casos |

**O app nunca vê `declined`** (decisão do cliente, 23/09). O estado que as
três operações e "meus pedidos" devolvem é `JoinRequestAppState`, com os
valores `requested`, `approved`, `withdrawn` e `expired`. O nome do estado de
espera é **`requested`**, e não `pending`, de propósito: `pending` é a decisão
guardada no banco e no painel, e `requested` é o que o tutor sabe, que é só
que pediu. Dois nomes para duas coisas diferentes impedem que alguém
"corrija" o app para mostrar a decisão. **A regra deve ser mantida como
está:** o recusado aparece para o tutor como `requested` até o encontro
passar, e depois como `expired`, igual a um pendente que ninguém decidiu.

| O banco tem | O app vê |
|---|---|
| `pending` ou `declined`, sem desistência, encontro a vir ou acontecendo | **`requested`** ("aguardando a equipe") |
| `approved` | `approved` |
| desistência (`withdrawn_at`) | `withdrawn` |
| `pending` ou `declined`, sem desistência, encontro encerrado | `expired` ("o encontro passou") |

A recusa não gera push; a aprovação gera. **Idempotência, com a recusa
invisível:** pedir de novo nunca cria linha nova (`UNIQUE (event_id, user_id)`)
e sempre devolve 200 com o estado do app. Sobre pedido recusado, devolve
`requested` e **não** o recoloca na fila. Sobre pedido desistido, limpa
`withdrawn_at`: se a decisão guardada era `pending`, ele volta à fila; se era
`declined`, continua recusado e invisível. Desistir de um recusado responde 200
e grava `withdrawn_at`, sem mudar a decisão. Assim, nenhuma sequência de
pedir, desistir e pedir de novo lava uma recusa, e nenhuma resposta difere
entre recusado e pendente.

**Retenção (D54), e como ela convive com a recusa invisível.** Desistência de
pedido **ainda não decidido** apaga a linha na hora: não há decisão a guardar,
e pedir de novo cria um pedido novo, pendente, sem lavar nada. Desistência de
pedido **recusado** grava `withdrawn_at` e mantém a linha, porque apagá-la
faria o próximo pedido nascer pendente e lavaria a recusa; ela sai com os
decididos. Aprovado e recusado são apagados **30 dias depois do fim do
encontro** (ou do cancelamento), pelo worker de expurgo. A trilha guarda a
decisão pelo `ref` e pelo administrador, sem o nome de quem pediu. A push de
aprovação leva **só o título** do encontro; a recusa não gera push.

`getNetworkEventLocation` (12.5) passa a ter a mesma regra: encontro privado só
devolve o ponto para conta aprovada; os outros recebem 404. Tetos por conta. O
caminho é singular (`join-request`) porque cada conta tem no máximo um pedido
por encontro: não há identificador de pedido na superfície do app.

**12.12 O portão que prova que o corpo não traz o que é oculto (P19).** No
espírito de P5, e com as duas metades que P5 tem:

1. **No contrato**, por lista permitida e não por lista proibida:
   `NetworkEventPrivateTeaser` tem que declarar exatamente as sete
   propriedades de 12.10 e `additionalProperties: false`, e toda operação da
   `Rede` alcançável sem aprovação que devolve encontro tem que usar o
   `oneOf` com ele. Propriedade nova no teaser reprova, e campo que a designer
   acrescentar amanhã fica fora dele sem ninguém lembrar. Reprova também se não
   encontrar o schema, ou se não encontrar nenhuma operação que o use.
2. **Na execução**, teste de integração com isca: a massa cria um encontro
   privado com **todo** campo oculto preenchido por sentinela (`ISCA-LUGAR`,
   `ISCA-BAIRRO`, `ISCA-RESUMO`, `ISCA-NOTA`, `ISCA-ALT`, um
   valor em centavos que não existe em outra linha, um ponto em coordenada
   que não existe em outra linha, imagens com chave própria, e todos os portes
   e itens de estrutura marcados) e chama lista, detalhe, `location`,
   `private-details`, o estado do pedido e "meus pedidos" como anônimo, como
   tutor sem pedido, com pedido pendente, **recusado**, desistido e recusado
   depois de desistido. **As operações testadas são todas as que tocam
   encontro ou pedido**: `listNetworkEvents`, `getNetworkEvent`,
   `listNearbyNetworkEvents`, `getNetworkEventLocation`,
   `getNetworkEventPrivateDetails`, `requestToJoinNetworkEvent`,
   `getMyNetworkEventJoinRequest`, `withdrawNetworkEventJoinRequest` e
   `listMyNetworkEventJoinRequests`, **incluindo as respostas de erro**
   (`400`, `404`) de cada uma. O teste
   varre **o corpo bruto da resposta como texto**, não os campos, e reprova se
   qualquer sentinela aparecer. **Controle positivo obrigatório:** a mesma
   varredura sobre `private-details` do tutor aprovado precisa achar todas as
   sentinelas; se não achar, o teste reprova, porque um teste que não enxerga a
   sentinela aprovaria qualquer coisa. Zero encontros privados na massa também
   reprova.
3. **A recusa não se distingue do pendente.** Para o mesmo encontro, as
   respostas do estado do pedido e de "meus pedidos" para a conta pendente e
   para a conta recusada têm que ser **idênticas byte a byte** depois de
   normalizar os carimbos de data do próprio pedido; o mesmo para a resposta
   de pedir de novo. Qualquer campo, cabeçalho de cache ou tamanho de corpo que
   difira reprova.
4. **Presença, e não só conteúdo** (22.10.4). A sentinela prova que o valor
   oculto não sai no corpo; ela não prova que o privado não aparece num recorte
   que só casa por causa do valor oculto. Para cada busca e filtro que toca
   campo oculto (`q` por lugar e bairro, `city`, `admission`, `size`,
   `max_km` e o que vier), a massa cria **dois privados iguais em tudo menos no
   atributo oculto**, e o teste exige que **nenhum recorte os separe**: os dois
   ausentes, ou os dois presentes, com o mesmo `total`. Um recorte que separa os
   dois entrega o atributo.
5. **O `slug` do privado não carrega o lugar.** O teste cria o privado com
   sentinela no lugar e reprova se o `slug` a contiver, e reprova se a criação
   aceitar `slug` enviado para privado.

`private-details` e `location` respondem com `Cache-Control: private,
no-store`. **Risco residual, sem portão possível:** o administrador pode
escrever o lugar no título do privado; o formulário avisa que ali o título é
público.

**12.13 Tabelas.** A emenda da migração ganha as colunas do apêndice A.4.1, as
listas `network_event_bring_items`, `network_event_sizes` e
`network_event_amenities`, e a tabela `network_event_join_requests` (A.6). A
galeria (`network_event_images`, A.4.2) vai na migração do backoffice. **Não
há limite de vagas** (decisão do cliente): nenhuma coluna de capacidade.

**12.14 Busca, filtros e sub-menus na agenda.** `listNetworkEvents` (pública)
passa a aceitar, e devolve em `applied_filters` e `effective_sort` o recorte e
a ordem que **de fato** valeram, no desenho de `listStoreItems`. **Um
vocabulário só, alinhado com o que `feat/secao-rede` já tem e com a §24.14.3
da designer:** o parâmetro de período é o **`when` que já existe** (não há
`period`), que ganha valores; a ordem é o `sort` que já existe (`proximos`,
`recentes`); o valor é `admission`, o mesmo nome do campo na resposta (a
designer escreveu `price`, e o app usa `admission`); o porte é `size`, com os
valores de `PetSize`.

| Parâmetro | Valores | Regra |
|---|---|---|
| `q` | 2 a 80 caracteres | título, nome do lugar e bairro, no servidor. **Encontro privado casa só pelo título**: casar pelo bairro entregaria onde ele é |
| `when` | os de hoje (`upcoming`, `past`, `all`) e os novos `today`, `weekend`, `next_30_days` | calculado no servidor, **no fuso de cada encontro** (`time_zone`): `today` é a data local de hoje naquele fuso; `weekend` é o sábado e o domingo correntes ou os próximos; `next_30_days` é início entre agora e agora + 30 dias. A designer escreveu `next30`; o valor é `next_30_days` |
| `admission` | `free`, `paid` | **exclui encontro privado**: a condição de acesso dele é oculta, e aparecer no recorte "pago" a entregaria |
| `size` | `P`, `M`, `G`, `GG` | encontros que aceitam aquele porte. **Exclui encontro privado**, pelo mesmo motivo |
| `visibility` | `public`, `private` | a visibilidade é visível, então filtra os dois |
| `city` | como hoje | exclui encontro privado (12.10) |
| `sort` | `proximos`, `recentes` | os que já existem. A pública não ordena por distância |

**`q` não vira dimensão de teto, e a política não muda.** A dimensão
`[ip, q]` contaria repetição do mesmo termo, e o custo real de busca vem de
termos diferentes, que o balde por IP já conta. A operação passa a declarar
`x-effects: [expensive_query]` e mantém o teto `[ip]` que já tem. Dimensão
nova de teto é decisão de política com quem responde por segurança, e não há
motivo para abri-la aqui.

**Ordem por distância é outra operação**, `GET /network/events/nearby`
(`listNearbyNetworkEvents`), com `bearerAuth` sem alternativa vazia, pelo
mesmo motivo de `/location`: a ordem que depende da região de referência de
quem chama é uma resposta que muda conforme o chamador, que o ADR-0021 proíbe
na pública, e ordenar por distância com autenticação opcional passaria no
portão como pública. Ela usa a região de referência do tutor, como `Perto`;
sem região, responde a mesma lista em ordem de data e diz isso em
`effective_sort`, que é o desenho de P.5. Devolve `distance_m` arredondada a
100 m só para encontro **público com ponto**; encontro sem ponto vem no fim
com distância nula (P.3); **encontro privado não entra**, porque a posição
dele numa lista por distância já é localização. Aceita os mesmos filtros da
pública e **`max_km`** (`2`, `5`, `10`), que exclui encontro sem ponto (a nota
da §24.14.3). **A posição do tutor não vai na requisição**: a operação usa a
região de referência já gravada (`user_reference_locations`, quantizada em
100 m), e não latitude e longitude em parâmetro de consulta. Isso responde a
preocupação da §24.14.6: nenhuma coordenada sai do aparelho a cada busca, e
nada de localização entra em URL, log de borda ou histórico. **Por isso a D58
de `04-seguranca.md` (posição na requisição) não entra** (decisão do cliente,
23/09): não há parâmetro de posição em operação nenhuma. Se um dia houver, a
D58 e o P20 passam a valer antes. **O privado, aprovado ou não, fica fora** de
`listNearbyNetworkEvents`.

**"Meus pedidos" é leitura separada**, `GET /network/join-requests`
(`listMyNetworkEventJoinRequests`), `bearerAuth`, paginada: os encontros
privados em que **a própria conta** pediu para participar, cada um com o
teaser de 12.10 e o `JoinRequestAppState`. Não é filtro da pública, e não
devolve conteúdo oculto nem para aprovado: o conteúdo continua em
`private-details`. Aceita `q` (só título), `state` (`requested`, `approved`,
`withdrawn`, `expired`; **não há `declined`**, e o grupo "Recusado" da
§24.14.3 sai do app) e `sort=proximos`. **Não aceita `admission` nem `size`**:
filtrar por valor oculto entregaria o valor. Distância também não, porque
todos ali são privados.

### 13. Como a regra "lugar público, nunca residência" é garantida

A coordenada do evento sai para qualquer tutor autenticado, e o motivo de o
ADR-0010 proibir coordenada é que ela localiza pessoa ou pet. **Um encontro
numa praça não localiza ninguém; um "encontro" marcado na casa de alguém,
sim.** Nenhum `CHECK` sabe a diferença entre uma praça e uma casa, e dizer o
contrário seria mentir. A garantia é humana e rastreável:

1. **Na v1 só o administrador cria evento** (`origin = 'admin'`); não existe
   operação pela qual outra conta grave ponto.
2. O formulário do painel diz que o local é logradouro público e nunca
   residência (D52).
3. **Criar, mover e cancelar evento avisa todos os administradores** por e-mail,
   com o que mudou (D52); mover e cancelar exigem reautenticação.
4. Toda escrita fica na trilha, com a sessão.
5. **Quando a comunidade criar evento**, o ponto de evento `origin =
   'community'` só é projetado depois de revisão humana: o evento nasce
   `pending_review`, e `pending_review` não é visível (restrição do apêndice
   A.4). A moderação que faz essa revisão é pré-requisito da criação pela
   comunidade, e não o contrário.

Esta é a emenda 1 do ADR-0010, com escopo fechado: **ponto de evento
publicado, em resposta autenticada**. Coordenada de pessoa, de pet, de caso e
de achado continua proibida em qualquer superfície, e mapa com pino continua
proibido na superfície pública sem conta.

### 14. `Loja`: tabela alimentada pelo painel

A BICHUS-189 está superada. As tabelas de `20260922000009` servem sem mudança
de forma, só com acréscimos (apêndice A.2):

- O painel cria e edita parceiro e item. **O item tem rascunho**, como a
  designer propôs: nasce com `active = false` e `published_at` nulo (o padrão
  `true` da coluna é da massa). O estado que a resposta mostra é derivado:
  `draft` (nunca publicado), `published` (`active`), `retired` (publicado antes,
  retirado agora). Publicar e retirar são operações próprias, com teto próprio;
  retirar exige reautenticação. `published_at` grava a **primeira** publicação
  e não é reescrito (a regra do ADR-0026 seção 3). Nada é apagado.
- O preço continua como decidido: centavos, `price_checked_at` como a data em
  que uma pessoa leu o número, data futura recusada, vencimento de 30 dias no
  servidor (`DIAS_DE_VALIDADE_DO_PRECO`). O preço entra como objeto único
  (`amount`, `currency`, `checked_at`) ou `null`, então "preço sem data" nem
  cabe no corpo. **A resposta administrativa mostra o preço vencido**, com
  `price_status = vencido` e `valid_until`: quem renova precisa ver o número
  antigo. A omissão é regra da projeção pública, e continua lá.
- O destino do item termina no host do parceiro; violação é `400` com
  `code: host_mismatch`, antes do banco. Trocar o host de um parceiro que tem
  itens que deixariam de casar é recusado com `code: host_mismatch_items`.
- `store_catalog_versions` perde a finalidade; nenhuma escrita administrativa a
  toca. **Dívida:** sai quando a massa deixar de usá-la.
- `store_items.image_url` guarda URL, o que a regra 3.6 de `07-devops.md`
  proíbe (o banco guarda chave, nunca URL). O painel não a escreve (item 6).
  **Dívida:** sai quando a massa passar a gravar imagem em
  `store_item_images`, pelo mesmo caminho que tirou `cover_image_url` do
  encontro (A.4.2).
- A pergunta 14.3 (quem reconfere o preço) muda de meio, não de dono: continua
  na mesa do cliente.

### 15. O que foi reconciliado com ARGOS, e o que diverge

Adotado sem mudança: D33 a D39, D41 a D44, D46 a D49, D51, D52, o nome do
cookie, os 12 horas, os caminhos `/v1/admin/auth/*` e `/v1/admin/session`, o
nome `x-admin-roles`. **D45 aceito** (item 11). Divergências, cada uma com o
motivo no item citado:

| Ponto | ARGOS | Aqui | Item |
|---|---|---|---|
| Aviso de login | dispositivo ou rede nova | toda sessão | 5 |
| Mídia anexada | só já processada | anexada em processamento, servida só pronta | 10 |

### 16. O produto da `Loja` ganha espécie, tags e várias imagens (pedido do cliente, 23/09)

**Espécie: os três valores que o produto já usa, e múltipla escolha.** O item
declara `species`, um conjunto de um a três valores de `Species` (`dog`,
`cat`, `other`), guardado em `store_item_species` com chave estrangeira para
`ref_species (code)`. São os mesmos valores do cadastro de pet, e é isso que
decide: o app filtra a vitrine pela espécie dos pets do tutor sem traduzir uma
lista na outra, e uma espécie nova entra nos dois lugares ao mesmo tempo, pelo
caminho de lista fechada. Uma lista mais granular só na `Loja` (ave, peixe,
roedor) teria valores que nenhum pet cadastrado tem, e seria uma segunda
taxonomia da mesma coisa, que é o que diverge. `other` é "outros pets",
genérico de propósito, porque é o que `pets.species` guarda. **Não vai
pergunta ao cliente:** se ele quiser espécies mais finas, a pergunta é para o
cadastro de pet primeiro, e a `Loja` acompanha. Espécie é obrigatória na
criação; produto que serve a todas declara as três.

**Tags: vocabulário curado, e o item só referencia.** Texto livre no item
foi recusado por dois motivos. Primeiro, é conteúdo publicado sem revisão
nenhuma, digitado no meio de outro formulário. Segundo, texto livre não
filtra: `Ração`, `racao` e `ração ` viram três filtros. O desenho:

- a tag nasce **uma vez**, por operação própria (`createAdminStoreTag`), com
  trilha própria (`admin.store_tag.created`);
- o rótulo tem **2 a 24 caracteres**, só letras, dígitos, espaço e hífen
  (conferido no servidor: nada de URL, e-mail ou símbolo); o servidor apara as
  pontas e junta espaços;
- o `slug` é derivado do rótulo: NFKD, sem marca diacrítica, minúsculo, espaço
  vira hífen. **Unicidade é pelo `slug`**, então duas grafias do mesmo rótulo
  são a mesma tag, e a segunda é recusada com `409 slug-taken`;
- **até 5 tags por item**; **até 40 tags ativas** no vocabulário, porque um
  filtro com duzentas opções não filtra;
- não há exclusão: desativar tira a tag do app (do item e do filtro) e a
  mantém ligada, para voltar sem refazer.

**A escolha, explícita para o app: lista curada, portanto filtro de lista
fechada.** O componente de listagem do app já filtra por lista fechada e não
tem filtro digitável; com vocabulário curado, a tag entra como mais um grupo
fechado, ao lado de categoria e espécie, **sem mudar o componente, nem `Perto`
nem `Loja`**. As opções do grupo vêm de `GET /v1/store/tags` (`listStoreTags`,
pública), que devolve só as tags ativas com pelo menos um item publicado.
Busca livre por tag foi recusada também por isso: exigiria um tipo novo de
grupo no componente, para um ganho que o vocabulário curado já entrega.

O que contém o risco de conteúdo é a soma: o vocabulário é pequeno, cada
entrada passa por uma operação auditada que só um `admin` alcança, o conjunto
de caracteres não comporta link, e todo administrador vê a lista inteira na
tela do vocabulário. **O app filtra por uma tag de cada vez** (`tag=<slug>`),
combinada com categoria e espécie; tag inativa ou inexistente devolve a lista
vazia, e não 400, para o link antigo continuar abrindo.

**Várias imagens: tabela ordenada, a primeira é a principal.**
`store_item_images` liga o item a até **8** imagens de `catalog_images`, com
`position` de 0 a 7. **A principal é a de `position` 0**, e não há
sinalizador de principal: dois lugares para dizer qual é a principal divergem
na primeira troca. **Cada imagem tem texto alternativo obrigatório**, de 2 a
150 caracteres (`store_item_images.alt_text`), porque o app as mostra e o
leitor de tela precisa dizer o que são. **Obrigatório em toda posição, e não
só na 0**: assim a obrigação acompanha a imagem que vira principal numa
reordenação sem regra à parte, e nenhuma troca de ordem deixa a principal sem
texto. A leitura pública devolve `alt_text` em cada imagem do detalhe e
`image_alt_text` junto da principal na lista; o mesmo modelo serve ao encontro
(item 17). O painel manda `images`, uma lista de `{upload_id, alt_text}` na
ordem em que o app mostra, e **a lista substitui a anterior inteira**: reordenar é mandar a ordem
nova, remover é omitir, `[]` tira todas. Uma escrita, uma transação, uma linha
de trilha; operações separadas de acrescentar, remover e mover seriam três
caminhos para o mesmo estado, cada um com a sua corrida.

Isso **substitui** o `store_items.image_id` do apêndice A.2, que não chegou a
ser migrado. `store_items.image_url` (URL externa, só da massa) continua;
item com imagem externa não tem linha em `store_item_images`, e a regra é do
caso de uso, porque um `CHECK` não conta linhas de outra tabela.

**O que a leitura pública devolve.** A lista (`listStoreItems`) continua
trazendo **só a principal**, no `image_url` que já existe, para não pesar a
vitrine. O detalhe é **operação nova**, `GET /v1/store/items/{itemSlug}`
(`getStoreItem`), pública pelas mesmas razões da lista, com **todas as imagens
prontas** em ordem. Imagem em processamento ou recusada nunca sai. Rascunho,
retirado, inexistente e parceiro inativo respondem o mesmo 404 (ADR-0021). O
preço vencido sai sem valor, como na lista.

**Operações que mudam no painel:** `createAdminStoreItem` e
`updateAdminStoreItem` (`species`, `tag_slugs`, `images` no lugar de
`image_upload_id`); `AdminStoreItem` (`species`, `tags`, `images` no lugar de
`image`); `listAdminStoreItems` (filtros `species` e `tag`). Novas:
`listAdminStoreTags`, `createAdminStoreTag`, `updateAdminStoreTag`; e, na
leitura pública, `listStoreTags`.

**Nota de impacto para o app** (outra sessão): (1) `StoreItemSummary` ganha
`species` e `tags`, **opcionais até a implementação**, e o app trata ausência
como "não informado", nunca como "serve a todas"; (2) `listStoreItems` ganha
os filtros `species` e `tag`, declarados antes do código, e **o app só
oferece esses filtros depois de o backend os implementar**; (3) o cartão da
lista não muda (`image_url` continua sendo a principal); (4) a tela de detalhe
passa a chamar `getStoreItem` para a galeria; (5) o grupo de filtro de tags
é **lista fechada** alimentada por `listStoreTags`, sem componente novo. Nada do que a demonstração de
30/09 usa muda de forma: tudo é acréscimo.

### 17. O encontro ganha campos próprios, e pode ser privado (decisões do cliente, 23/09)

**Campos próprios, e nenhum deles é texto em observações.** Tipos e
obrigatoriedade estão no apêndice A.4.1; o resumo:

| Campo | Forma | Obrigatório |
|---|---|---|
| `visibility` | `public` \| `private` | sim, padrão `public` |
| `admission.kind` | `free` \| `paid` | sim, padrão `free` |
| `admission.price` | centavos + `BRL` + `unit` (`per_dog`, `per_person`, `per_pair`), informativo | só quando `paid`, e então sim |
| `images` | até 8, `{upload_id, alt_text}`, posição 0 é a capa, texto alternativo de 2 a 150 **obrigatório em cada uma** | não (sem imagem, o app usa o banner da marca) |
| `accepted_sizes` | conjunto de `PetSize` (`P`, `M`, `G`, `GG`) | sim, padrão os quatro |
| `dog_age` | `any`, `from_4_months`, `from_1_year`, `up_to_1_year` | sim, padrão `any` |
| `vaccination_required` | booleano | sim, padrão `true` |
| `fenced_off_leash_area` | booleano: o local tem área cercada para cães soltos | sim, padrão `false` |
| `amenities` | conjunto de `level_ground_or_ramp`, `accessible_restroom`, `public_restroom_nearby`, `shade`, `benches`, `dog_water_fountain`, `parking_nearby` | não |
| `bring_items` | lista fechada, até 8 valores | não |
| `notes` | texto, 2 a 500, sem contato nem pagamento (D59) | não, e só complemento |

**Pago é só o valor, informativo** (decisão do cliente, 23/09). O Bichu não
cobra, não tem provedor de pagamento e **não guarda forma de pagar**: nem
instrução, nem link. O valor é o que o organizador informa, sem vencimento
(não é preço de referência de terceiro, como o da `Loja`), com **unidade de
lista fechada** (`per_dog`, `per_person`, `per_pair`, obrigatória quando
pago), para o app escrever sempre "R$ 15 por cão" no mesmo formato e ninguém
escrever "grátis!!!" num campo de valor. A unidade não reintroduz forma de
pagar: ela diz a que o valor se refere, e só. **Não há limite de vagas.** Condição de acesso
(visibilidade, gratuito ou pago, valor) só muda por operação própria,
`changeAdminNetworkEventAccess`, com reautenticação no escopo
`network_event_access_change` e aviso a todos os administradores: trocar o
valor muda o que as pessoas esperam pagar na porta, e tornar público um
privado entrega o lugar. Na criação ela entra livre, porque criar já avisa
todos.

**Os campos da designer** (§24.12.4 de `06-design-system.md`) entram um por
coluna ou lista, com os valores dela: portes com os valores de `PetSize` e
`ref_sizes` (os do cadastro de pet, mesma razão da espécie no item 16), idade
em lista fechada de escolha única, vacinação e cães soltos em booleano com os
padrões dela, estrutura do local em lista fechada múltipla. **A galeria da
equipe usa o modelo do produto** (item 16): até 8 imagens, posição 0 é a capa,
texto alternativo obrigatório em cada uma, o que cumpre "texto alternativo da
capa obrigatório quando há capa" sem uma regra à parte. A designer propôs até
4 fotos além da capa; o painel já desenhou 8 com capa, e 8 é o teto.

**"O que levar" é só lista fechada** (`water`, `water_bowl`, `leash`,
`poop_bags`, `treats`, `towel`, `vaccination_card`, `toy`), que o app mostra
com ícone e texto próprio. Os itens livres que este documento chegou a prever
(`bring_other`) **saíram** (revisão de UX, 23/09): texto livre do
administrador iria direto para a página pública, e a exceção cabe nas
observações, que já passam pelo detector de D59.

**Cães soltos é atributo do lugar, não permissão.** O campo é
`fenced_off_leash_area` ("o local tem área cercada para cães soltos"), e não
`off_leash_allowed`. O Bichu não autoriza ninguém a soltar cão: quem regula
guia em espaço público é a regra do lugar e do município. O que o
administrador sabe, e o tutor precisa saber, é se existe a área cercada.

**Campo novo que vier depois** entra do mesmo jeito: **cada um é
coluna ou lista própria, por migração aditiva**, e campo opcional novo em
corpo de requisição é mudança compatível dentro de `/v1`. **Não há saco
`jsonb` de "detalhes"**: ele seria o texto em observações com outro nome, sem
validação, sem lista fechada e sem portão. O que precisa ficar oculto no
encontro privado entra, por padrão, no lado oculto: fora do teaser de 12.10, e o portão de 12.12 o cobra sem ninguém lembrar.

**Encontro privado.** Para quem não foi aprovado, a agenda e o detalhe trazem
**só título e data**. Lugar (inclusive bairro e cidade), ponto, resumo,
imagens (a capa inclusive), valor, portes, idade, regras, estrutura, "o que
levar" e observações **não saem no corpo**. Não
é o app que esconde: o servidor não manda (12.10 a 12.12).

- **O pedido é da conta, nunca do pet** (ADR-0010 item 7): a tabela
  `network_event_join_requests` não tem `pet_id`, não tem texto livre e não tem
  lista em lugar nenhum do app. O tutor vê só o estado do **próprio** pedido;
  ninguém vê quem mais pediu ou foi aprovado, nem como contagem.
- **A fila existe só no painel**, com aprovar e recusar, cada decisão na
  trilha. **Aprovar gera push; recusar não avisa ninguém**, e para o tutor o
  pedido continua "aguardando" até o encontro passar (12.11).
- **O conteúdo aprovado sai em operação separada** (ADR-0021, como
  `/location`), com a autorização na cláusula `WHERE`. A mesma operação,
  chamada por quem não foi aprovado, responde 404, e não um corpo menor.
- A recusa é final e invisível. Pedir de novo é idempotente e não lava a
  recusa (12.11).

**O que a fila leva ao painel, e como o risco está coberto.** A fila mostra
**só** o nome de exibição (e, quando ele é nulo, o texto fixo `Sem nome de
exibição`, nunca o e-mail), o mês em que a conta foi criada e **se o e-mail foi
confirmado**, como booleano, além da data do pedido. Nada de e-mail, telefone,
pets, identificador estável ou histórico, e **nenhum filtro por solicitante**.
É leitura de dado de pessoa no backoffice, e o risco não é o nome sozinho: é
o nome junto de um lugar e de uma hora. **O cliente estendeu o RA-01 à fila em
23/09, com D53 a D57** (`04-seguranca.md` 22.10.1):

- **D53**, projeção mínima fechada, com `additionalProperties: false`;
- **D54**, retenção curta (12.11);
- **D55**, toda leitura da fila grava na trilha, com filtros e quantidade;
- **D56**, teto de **300 linhas devolvidas por hora por conta**, páginas de
  até 50, com alerta. O vocabulário de `counts` ganha `rows_returned` para
  isso, porque o que se mede é quanto dado de pessoa sai, e não quantas vezes
  se pediu;
- **D57**, a tela de "pedir para participar" diz, antes do toque, que a equipe
  verá o nome de exibição e o mês de criação da conta.

**Observações e itens livres (D59, D60).** `notes` tem **até 500 caracteres**,
o número da designer e o mesmo em que o detector é medido (um número só no
contrato, no banco e no protótipo). Em `notes`, telefone,
e-mail, URL, endereço, CEP e chave PIX são **recusados** com `400`, pelo
detector do canal mediado, e caractere de controle bidirecional é recusado em
todo texto administrativo. Sem campo de "como pagar", as observações seriam o
lugar natural da chave PIX trocada por uma conta tomada; o detector tira o
valor desse golpe. **Mudar as observações avisa todos os administradores**,
com o antes e o depois, sem reautenticação.

**Mensagem do tutor ao administrador: v2, só a fronteira.** Quando vier, ela é
conversa mediada, e não canal novo: `conversations` ganha a âncora
`network_event_id` (a mudança aditiva que a seção 4.11 de `03-arquitetura.md`
já previu), a redação de telefone, e-mail e endereço de `messaging` vale igual,
a caixa do painel lê as conversas dessa âncora, e o push ao tutor é o que já
existe. Nada do modelo desta v1 impede isso, e nada dele precisa ser desfeito.

### 18. Matriz de rastreabilidade: uma fonte só para as quatro pontas

**Regra do cliente, 23/09: tudo segue `api/openapi.yaml`.** Backend, app,
backoffice e site usam os mesmos campos, os mesmos valores e as mesmas
funcionalidades. Para isso ser verificável, e não só declarado, a ligação entre
cada tela e o contrato vive em **`api/rastreabilidade-backoffice-rede.yaml`**,
rastreado no git, ao lado do contrato: cada tela e estado dos protótipos
(`docs/prototipos/backoffice.html` e `rede-encontro.html`), a operação que ela
chama (`operationId`), e cada campo, filtro, valor de lista fechada e tipo de
problema que ela mostra ou envia, numa notação que uma máquina resolve.

A matriz tem três listas além das telas: as **correspondências código →
rótulo** (os rótulos ficam no cliente, e a correspondência tem que ser 1 para
1; a de `category` foi conferida contra `app/lib/api/modelos_loja.dart` e é),
o que a **tela usa e o contrato não tem** (`tela_sem_contrato`, cada item com
quem muda), e o que o **contrato tem e nenhuma tela usa** (`contrato_sem_tela`).

**O que a primeira leitura achou, e o que já foi resolvido no contrato:**
`slug` passou a opcional (derivado do título) no item e no encontro público,
porque nenhum formulário o pede; `time_zone` passou a opcional com padrão
`America/Sao_Paulo`; o envio de imagem de catálogo passou a 5 MiB, com a
dimensão mínima conferida pelo worker; o nome de exibição nulo na fila passou
a `null`, com o rótulo no painel; e o painel pode **reverter uma recusa**
(recusado → aprovado), mas não uma aprovação. **O que a tela muda:** tirar o
e-mail do administrador da navegação (o login é alcançável sem conta, e o
portão reprova `email` ali), tirar "Excluir produto" (retirar é o gesto),
pedir senha ao despublicar, pedir UF no encontro, não obrigar fim nem ponto
no mapa, não obrigar imagem no produto, e tirar os itens livres de "o que
levar" do app. **O que o contrato tem sem tela**, e é lacuna de produto:
cancelar encontro (o cliente decidiu que o cancelado aparece até o fim
previsto, e nenhuma tela cancela), cadastro de parceiro, vocabulário de tags,
sair de todas as sessões e desistir do pedido no app. **Uma questão aberta**
(APP-2): a distância no cartão da agenda em ordem por data; a proposta é
`listNearbyNetworkEvents` aceitar `sort=proximos`.

**O portão proposto** (a implementar por quem monta a esteira, com a isca que
precisa reprovar): lê a matriz e o contrato e reprova quando um `operationId`
de situação `contrato` não existe; quando uma referência de campo, parâmetro,
cabeçalho, problema ou valor de lista fechada não resolve, seguindo `$ref`,
`allOf`, `oneOf` e itens de lista; quando uma lacuna marcada `resolucao:
contrato` já resolve e continua listada; quando uma operação de `/admin/` ou
da `Rede` não aparece nem em `telas` nem em `contrato_sem_tela`; e quando a
matriz tem zero telas. Operação `pendente` (ainda em outra branch) exige
`onde`, e passa a ser resolvida quando a branch mesclar. A isca: uma cópia da
matriz com um `operationId` renomeado e um `req:` que não existe, que precisa
reprovar pelos dois motivos. Medido nesta rodada com um resolvedor
descartável: todas as referências de situação `contrato` resolvem.

### 19. Fronteira da v1

Fora, sem desenho aqui: `Perto` no painel (o contrato de escrita do ADR-0023 e
o do ADR-0026 continuam referência; levá-lo ao painel reabre o RA-01);
moderação; o papel `moderator` no painel; operação (usuários, tags, casos);
conceder papel por tela; tela de trilha; criação de evento pela comunidade;
check-in; galeria.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| **Cookie `HttpOnly` opaco, mesma origem, conta dedicada** | XSS não exporta a credencial; revogação imediata; nenhum CORS; sobrevive ao Keycloak como BFF | exige CSRF; uma leitura de banco por requisição | **é a escolha** |
| Credencial de serviço (`adminAuth`) + Bearer do operador (ADR-0026) | separa sistema e pessoa quando o painel é de terceiros e tem servidor | num SPA sem servidor, o segredo iria no bundle, e segredo no bundle não é segredo; o Bearer volta ao navegador | a premissa do ADR-0026 (painel de outro time, servidor a servidor) caiu |
| JWT RS256 com `aud: bichu-admin` dentro do cookie | reaproveita o emissor | 15 minutos e renovação; revogação imediata lê o banco de qualquer jeito | mais peças para o mesmo resultado |
| Bearer em memória + refresh em cookie | imune a CSRF no token | XSS leva o token; o CSRF volta no refresh; F5 depende do refresh | resolve o CSRF num endpoint e o recria no outro |
| Bearer + refresh em `localStorage` | nenhum CSRF | XSS leva credencial de longo prazo | transforma XSS em acesso permanente |
| O mesmo JWT do app em `/v1/admin`, com papel | zero trabalho de sessão | um token, dois poderes; `04-seguranca.md` o declara inaceitável | ADR-0026 motivo 1 e D36 |
| Painel em `admin.` chamando a API por CORS com credenciais | separa hosts | lista de origens; cookie viajando para o host do app | troca uma rota na borda por uma política de CORS |
| SSR (Astro/Next) para o painel | um padrão com o site | Node em execução sem nenhum dos motivos do site | memória gasta à toa |
| Especificação administrativa separada | cumpre a letra da seção 1 (a) de `04-seguranca.md` | dois geradores, dois lints, dois `oasdiff` | a intenção já é cumprida pelo ADR-0018 (Swagger fechada em produção) |

## Consequências

**Fica mais fácil:** o painel implementa contra um contrato com exemplos antes
de a API existir; papel, trilha e CSRF moram num lugar cada; retirar o acesso
de alguém vale na próxima requisição; o Keycloak, quando vier, troca o login e
não a sessão.

**Fica mais difícil:** a borda passa a ter um bloco, uma regra de 404 por host,
um cabeçalho interno e uma imagem própria do Caddy; o serviço ganha um segundo
tipo de sessão; administrador que também é tutor mantém duas contas; e cada
operação administrativa nova declara papel, trilha e, se mover gente, a
reautenticação.

**Passa a ser irreversível na prática:** o nome `__Host-bichu_adm` e o host
`admin.bichu.app`; e, a partir da primeira escrita administrativa, a trilha
passa a ser a única memória do catálogo.

**Dívida aceita, com gatilho:** MFA (RA-01 e seus gatilhos);
`store_catalog_versions` (quando a massa deixar de usá-la); tiles do OSM direto
do navegador do operador (mais de uma dezena de operadores, ou mapa público no
app); leitura administrativa sem trilha (entrada de `Perto` ou moderação).

---

## Apêndice A: esboço do modelo de dados

Normativo em nomes, tipos e restrições; comentários e divisão em arquivos são
de quem implementa. Lista fechada nova ou alargada é **três arquivos no mesmo
commit** (ADR-0023 seção 3): a migração, a entrada por extenso em
`tests/integration/conjunto-exato-dos-checks.test.ts` e o `enum` do contrato.

**Ordem:** a emenda da seção 12 vai na migração da `Rede` (editada no lugar);
o resto numa migração nova do backoffice, posterior a ela.

### A.1 `admin_sessions` (nova)

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `uuid` | PK, UUIDv7 |
| `user_id` | `uuid` | `NOT NULL REFERENCES users (id) ON DELETE CASCADE` |
| `token_hash` | `bytea` | `NOT NULL UNIQUE`, SHA-256 do valor do cookie |
| `csrf_token_hash` | `bytea` | `NOT NULL`, SHA-256 do `csrf_token` |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()`; o instante da senha, herdado na rotação |
| `last_seen_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `idle_expires_at` | `timestamptz` | `NOT NULL` |
| `absolute_expires_at` | `timestamptz` | `NOT NULL` |
| `revoked_at` | `timestamptz` | nulo |
| `revoked_reason` | `text` | `CHECK (revoked_reason IN ('logout', 'rotated', 'role_removed', 'account_invalidated', 'disavowed'))` |
| `user_agent` | `text` | nulo, `CHECK (char_length(user_agent) <= 512)` |
| `ip_hmac` | `bytea` | nulo |

- `CHECK (idle_expires_at <= absolute_expires_at)`;
  `CHECK (absolute_expires_at <= created_at + interval '12 hours')`;
  `CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))`.
- Índice `admin_sessions_vivas ON admin_sessions (user_id) WHERE revoked_at IS NULL`.
- **Tabela própria, e não `refresh_tokens` com sinalizador**: vida útil, CSRF e
  escopo são outros, e dividir a tabela deixaria um refresh do app a um valor
  de coluna de virar sessão administrativa.
- Rotação: a linha antiga ganha `revoked_reason = 'rotated'` e a nova herda
  `created_at` e `absolute_expires_at` (o teto não renasce na reautenticação).
- Expiração não é revogação; linhas vencidas há mais de 30 dias são expurgadas
  por rotina.

### A.2 `store_partners` e `store_items` (acréscimos a `20260922000009`)

Nas duas:

| Coluna | Tipo | Restrição |
|---|---|---|
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `version` | `integer` | `NOT NULL DEFAULT 1 CHECK (version > 0)`, incrementada a cada escrita; é o `ETag` |

Só em `store_items`: `published_at timestamptz`,
nulo, a primeira publicação, com `CHECK (NOT active OR published_at IS NOT NULL)`.
A massa grava `published_at` junto com `active = true`. Nenhuma coluna de autor:
quem criou e quem mudou está em `audit.events`, o único lugar onde isso é
imutável.

### A.2.1 Espécie, tags e imagens do item (item 16)

`store_item_species`: `item_id uuid NOT NULL REFERENCES store_items (id) ON
DELETE CASCADE`, `species text NOT NULL REFERENCES ref_species (code)`,
`PRIMARY KEY (item_id, species)`. Chave estrangeira para `code` de dado de
referência é a forma que o portão da BICHUS-19 admite. Pelo menos uma espécie
é regra do caso de uso (criação e publicação).

`store_tags`: `id uuid` PK; `slug text NOT NULL` com o formato de `Slug` e
`CREATE UNIQUE INDEX store_tags_slug_unico ON store_tags (slug)`; `label text
NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 24)`; `active boolean
NOT NULL DEFAULT true`; `created_at`, `updated_at`, `version` como em A.2. O
`slug` é a chave de normalização (sem acento, minúsculo): é o índice único
dele que recusa a segunda grafia. O teto de 40 ativas é do caso de uso.

`store_item_tags`: `item_id uuid NOT NULL REFERENCES store_items (id) ON DELETE
CASCADE`, `tag_id uuid NOT NULL REFERENCES store_tags (id)`, `PRIMARY KEY
(item_id, tag_id)`. Chave estrangeira para `id`, nunca para `slug` (ADR-0024).
O teto de 5 por item é do caso de uso, na mesma transação da escrita.

`store_item_images`: `item_id uuid NOT NULL REFERENCES store_items (id) ON
DELETE CASCADE`, `image_id uuid NOT NULL UNIQUE REFERENCES catalog_images
(id)`, `position smallint NOT NULL CHECK (position BETWEEN 0 AND 7)`,
`alt_text text NOT NULL CHECK (char_length(btrim(alt_text)) BETWEEN 2 AND
150)`, `PRIMARY KEY (item_id, image_id)`, e `CONSTRAINT store_item_images_ordem_unica
UNIQUE (item_id, position) DEFERRABLE INITIALLY DEFERRED`, para que reordenar
seja um conjunto de `UPDATE` na mesma transação sem colidir no meio. A imagem
principal é `position = 0`. `catalog_images.purpose` precisa ser `store_item`
(caso de uso). O teto de 8 é o próprio `CHECK` de `position` somado à
unicidade.

### A.3 `catalog_images` (nova) e `upload_intents` (alteração)

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `uuid` | PK |
| `upload_intent_id` | `uuid` | `NOT NULL UNIQUE REFERENCES upload_intents (id)` |
| `purpose` | `text` | `NOT NULL CHECK (purpose IN ('store_item', 'network_event'))` |
| `status` | `text` | `NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'rejected'))` |
| `public_key` | `text` | nulo; chave da derivada pública, 128 bits aleatórios |
| `rejection_reason` | `text` | nulo |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

`CHECK (status <> 'ready' OR public_key IS NOT NULL)` e
`CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`, a forma de
`pet_photos`.

`upload_intents`: `kind` ganha `catalog_image`; coluna nova `purpose text` com
`CHECK (purpose IS NULL OR purpose IN ('store_item', 'network_event'))`;
`CHECK ((kind = 'catalog_image') = (purpose IS NOT NULL))`;
`CHECK (kind <> 'catalog_image' OR pet_id IS NULL)`.

### A.4 `network_events` (emenda da seção 12, mais o que o backoffice acrescenta)

Na migração da `Rede`, além de 12.1 e 12.2:

| Coluna | Tipo | Restrição |
|---|---|---|
| `origin` | `text` | `NOT NULL DEFAULT 'admin' CHECK (origin IN ('admin', 'community'))` |
| `created_by_user_id` | `uuid` | nulo, `REFERENCES users (id) ON DELETE SET NULL`; **nunca projetado**, com a marca do portão |
| `publication_status` | `text` | `NOT NULL CHECK (publication_status IN ('pending_review', 'published', 'cancelled', 'removed'))`, sem padrão: quem cria diz |
| `published_at` | `timestamptz` | nulo |
| `cancelled_at` | `timestamptz` | nulo |
| `cancellation_note` | `text` | nulo, `CHECK (cancellation_note IS NULL OR char_length(btrim(cancellation_note)) BETWEEN 2 AND 280)` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `version` | `integer` | `NOT NULL DEFAULT 1 CHECK (version > 0)` |

- `active` sai: duas colunas para "isto aparece?" divergem na primeira escrita
  que atualizar só uma.
- `CHECK (publication_status <> 'cancelled' OR cancelled_at IS NOT NULL)`.
- `CHECK (publication_status NOT IN ('published', 'cancelled') OR published_at IS NOT NULL)`.
- Não há `draft` (12.9): o evento de administrador nasce `published`, e o da
  comunidade nascerá `pending_review`. Um rascunho no futuro é valor novo na
  lista, aditivo.
- `CHECK (origin = 'community' OR publication_status <> 'pending_review')`.

### A.4.1 Campos do encontro (item 17)

Na mesma emenda da migração da `Rede`:

| Coluna | Tipo | Restrição |
|---|---|---|
| `visibility` | `text` | `NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private'))` |
| `admission_kind` | `text` | `NOT NULL DEFAULT 'free' CHECK (admission_kind IN ('free', 'paid'))` |
| `admission_amount` | `integer` | nulo, `CHECK (admission_amount IS NULL OR admission_amount BETWEEN 1 AND 100000000)`, centavos |
| `admission_currency` | `text` | nulo, `CHECK (admission_currency IS NULL OR admission_currency = 'BRL')` |
| `admission_unit` | `text` | nulo, `CHECK (admission_unit IS NULL OR admission_unit IN ('per_dog', 'per_person', 'per_pair'))` |
| `dog_age` | `text` | `NOT NULL DEFAULT 'any' CHECK (dog_age IN ('any', 'from_4_months', 'from_1_year', 'up_to_1_year'))` |
| `vaccination_required` | `boolean` | `NOT NULL DEFAULT true` |
| `fenced_off_leash_area` | `boolean` | `NOT NULL DEFAULT false`: o lugar tem área cercada para cães soltos |
| `notes` | `text` | nulo, `CHECK (notes IS NULL OR char_length(btrim(notes)) BETWEEN 2 AND 500)`; o detector de D59 é do caso de uso |

- `CHECK ((admission_kind = 'free') = (admission_amount IS NULL))`,
  `CHECK ((admission_amount IS NULL) = (admission_currency IS NULL))`,
  `CHECK ((admission_amount IS NULL) = (admission_unit IS NULL))`. Não há
  coluna de forma de pagar nem de capacidade.
- `network_event_bring_items`: `event_id uuid NOT NULL REFERENCES
  network_events (id) ON DELETE CASCADE`, `item text NOT NULL CHECK (item IN
  ('water', 'water_bowl', 'leash', 'poop_bags', 'treats', 'towel',
  'vaccination_card', 'toy'))`, `PRIMARY KEY (event_id, item)`.
- `network_event_sizes`: `event_id uuid NOT NULL REFERENCES network_events (id)
  ON DELETE CASCADE`, `size text NOT NULL REFERENCES ref_sizes (code)`,
  `PRIMARY KEY (event_id, size)`. Pelo menos um é regra do caso de uso; a
  criação sem o campo grava os quatro.
- `network_event_amenities`: `event_id` como acima, `amenity text NOT NULL
  CHECK (amenity IN ('level_ground_or_ramp', 'accessible_restroom',
  'public_restroom_nearby', 'shade', 'benches', 'dog_water_fountain',
  'parking_nearby'))`, `PRIMARY KEY (event_id, amenity)`.

### A.4.2 `network_event_images` (na migração do backoffice)

A mesma forma de `store_item_images` (A.2.1): `event_id uuid NOT NULL
REFERENCES network_events (id) ON DELETE CASCADE`, `image_id uuid NOT NULL
UNIQUE REFERENCES catalog_images (id)`, `position smallint NOT NULL CHECK
(position BETWEEN 0 AND 7)`, `alt_text text NOT NULL CHECK
(char_length(btrim(alt_text)) BETWEEN 2 AND 150)`, `PRIMARY KEY (event_id,
image_id)`, `UNIQUE (event_id, position) DEFERRABLE INITIALLY DEFERRED`. A capa
é `position = 0`. `catalog_images.purpose` precisa ser `network_event`.
**`network_events.cover_image_url` sai** (decisão da coordenação, 23/09): o
banco guarda chave de objeto, nunca URL (regra 3.6 de `07-devops.md`, cobrada
pelo portão de portabilidade), e a capa já é a posição 0 desta tabela. A massa
passa a gravar a capa como linha aqui. O `cover_image_id` que este apêndice
previa antes também sai: a galeria substitui os dois. **A mesma regra alcança
`store_items.image_url`**, que já está na `development` (`20260922000009`) e
guarda URL de parceiro; ele continua só como dado da massa, e a remoção fica
registrada como dívida do item 14.

Regras que o `CHECK` não expressa, no caso de uso, com `400 validation-failed`:
criar exige que o fim (ou o início, sem fim) não tenha passado
(`code: event_in_past`); `PATCH` de evento publicado não muda data, horário,
fuso nem lugar (`code: use_relocation`); cancelar só a partir de `published`;
`removed` é terminal.

### A.6 `network_event_join_requests` (nova, item 17)

| Coluna | Tipo | Restrição |
|---|---|---|
| `id` | `uuid` | PK |
| `ref` | `text` | `NOT NULL UNIQUE`, 128 bits aleatórios em base64url: o identificador que o painel usa no caminho, porque UUIDv7 carrega o instante |
| `event_id` | `uuid` | `NOT NULL REFERENCES network_events (id) ON DELETE CASCADE` |
| `user_id` | `uuid` | `NOT NULL REFERENCES users (id) ON DELETE CASCADE` |
| `status` | `text` | `NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined'))`: a decisão, e só ela |
| `requested_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `decided_at` | `timestamptz` | nulo |
| `withdrawn_at` | `timestamptz` | nulo; só existe em pedido **recusado** do qual o tutor desistiu (pedido pendente desistido é apagado na hora, D54), para que desistir e pedir de novo não lave a recusa (12.11) |
| `decided_by_user_id` | `uuid` | nulo, `REFERENCES users (id) ON DELETE SET NULL`; nunca projetado |

- `UNIQUE (event_id, user_id)`: um pedido por conta por encontro.
- `CHECK ((status IN ('approved', 'declined')) = (decided_at IS NOT NULL))`.
- `CHECK (status <> 'approved' OR withdrawn_at IS NULL)`: aprovado não desiste.
- Índice `network_event_join_requests_fila ON (requested_at) WHERE status = 'pending' AND withdrawn_at IS NULL`.
- O estado que o app vê (`JoinRequestAppState`) é derivado na leitura, e
  `declined` nunca é projetado para o app.
- `CHECK (withdrawn_at IS NULL OR status = 'declined')`.
- **Retenção (D54):** o worker de expurgo apaga aprovado e recusado 30 dias
  depois de `ends_at` (ou `starts_at`, sem fim) ou de `cancelled_at`; o índice
  de apoio é sobre `event_id`, juntando com `network_events`.
- **Sem `pet_id` e sem texto livre**, de propósito (ADR-0010 item 7; a
  conversa é v2). Nenhuma operação do app lê esta tabela além da linha da
  própria conta, e a leitura que libera conteúdo é um `EXISTS` sobre ela na
  cláusula `WHERE`.

### A.5 `audit.events`

Sem mudança de esquema. As ações novas entram na união `AuditAction`:
`admin.session.opened`, `admin.session.denied`, `admin.session.closed`,
`admin.session.all_closed`, `admin.session.reauthenticated`,
`admin.guard.denied`, `admin.store_partner.created`,
`admin.store_partner.updated`, `admin.store_item.created`,
`admin.store_item.updated`, `admin.store_item.published`,
`admin.store_item.retired`, `admin.store_tag.created`,
`admin.store_tag.updated`, `admin.network_event.created`,
`admin.network_event.access_changed`, `admin.network_join_request.listed`,
`admin.network_join_request.approved`,
`admin.network_join_request.declined`,
`admin.network_event.updated`, `admin.network_event.relocated`, `admin.network_event.cancelled`,
`admin.network_event.removed`, `admin.catalog_image.intent_created`.

---

## Apêndice B: premissas

- `admin.bichu.app` ainda não resolve; o registro no DNS é de infraestrutura.
- Navegador de mesa atual (Chromium, Firefox, Safari das duas últimas versões),
  todos com `Origin` em `fetch` não-`GET`, `SameSite` e `__Host-`.
- Até cinco contas administrativas, o que sustenta a leitura de banco por
  requisição, o aviso a cada sessão e os tiles do OSM.
- A migração `20260923000001` não foi aplicada em nenhum banco compartilhado.

## Perguntas ao cliente

As três perguntas desta seção foram respondidas pelo cliente em 23/09 e estão
fechadas: o encontro cancelado continua visível até o fim previsto (12.6); a
recusa é invisível ao tutor, e pedir de novo é idempotente sem lavar a recusa
(12.11); os administradores não recebem e-mail a cada pedido, e a fila fica no
painel com a contagem de pendentes. Nenhuma pergunta aberta.

---
DÉDALO, Arquiteto de Software
