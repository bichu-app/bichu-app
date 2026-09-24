# ADR-0030: Achado sem conta pela web, o mínimo de pontos, e o que o evento criado pela comunidade exige

**Status:** aceito. Três perguntas ao cliente no fim; nenhuma bloqueia o
contrato
**Data:** 2026-09-23
**Depende de:** ADR-0004 (tag revogada), ADR-0010 (o que não sai em
superfície pública), ADR-0016 (tetos no contrato), ADR-0028 (o site, a CSP das
páginas com token)
**Revisa:** o briefing de produto ("achado avulso exige conta") e a visão de
produto 8.6 (registrar achado avulso era D2). **Pede emenda:** a ADR da Rede,
`ADR-0025-a-rede-nao-tem-lista-de-presenca.md`, que está na branch local
`feat/secao-rede`, não publicada e de outra frente (seção 6). Esta ADR não a
edita.

**Numeração:** conferida em 23/09 contra todas as branches locais e remotas,
os worktrees e os PRs abertos. 0024 a 0029 estão em uso; 0030 é o próximo livre.

## Contexto

Três decisões de produto do cliente, em 23/09:

1. **Achado pela web sem conta.** "Registrar que achei um pet" (saída do 404,
   do 410 e do 429 de `/t/`) e "Vi este pet" (em `/p/`) não exigem conta. O
   tutor recebe a notificação e a conversa mediada.
2. **Pontos.** Quem ajuda ganha pontos ao interagir, **só com conta**. Quem
   entra ou cria conta depois do aviso ganha os pontos daquele aviso.
3. **Eventos da Rede criados pela equipe e pela comunidade desde o
   lançamento.**

O que o contrato dizia até aqui:

- `POST /v1/found-reports` (`createStrayFoundReport`) exige `bearerAuth`, com
  a frase "**Exige conta** (regra fechada no briefing)". "Vi este pet" era o
  mesmo formulário com `share_token`, e `can_report_sighting` só era
  verdadeiro "para qualquer outra conta";
- o aviso pela tag (`createFoundReportFromTag`) já é sem conta, com
  `finder_token` de 256 bits guardado só como SHA-256
  (`found_reports.finder_token_hash`), a identidade derivada do achador
  (`finder_identity_hash`) para os tetos, e a conversa em `/c/{finderToken}`;
- a migração `20260922000003` impõe por CHECK que "toda linha tem exatamente a
  autorização do caminho por onde ela entrou": achado avulso com
  `reporter_user_id`, aviso pela tag com token;
- a visão de produto (8.5) decidiu em 17/09 que o ponto é do tutor, que o ponto
  de reencontro cai **na confirmação do tutor** e não na declaração de quem
  achou, que a pontuação é privada, e que **o backoffice precisa estar de pé
  antes de qualquer ponto ir ao ar**.

## Decisão

### 1. Achado sem conta: uma operação nova, e não a de conta afrouxada

**`POST /v1/public/found-reports` (`createPublicFoundReport`),
`security: []`.** `createStrayFoundReport` continua existindo, com conta, sem
mudança de comportamento. As duas gravam na mesma tabela e alimentam o mesmo
cruzamento.

Por que operação nova: a regra desta casa é que a credencial exigida seja
legível operação a operação (ADR-0016). Pôr `security: [bearerAuth, {}]` na
operação de conta faria a mesma operação devolver duas formas de resposta
(`FoundReport` com conta, token sem conta) e autorizar por dois caminhos, e a
tabela já separa as duas autorizações por CHECK.

**Duas formas de corpo, e só duas** (`PublicFoundReportInput`, `oneOf`):

| | "Vi este pet" (`PublicSightingInput`) | Achado avulso (`PublicStrayReportInput`) |
|---|---|---|
| Obrigatório | `share_token` | espécie, porte, `found_at`, e `location` ou `area` |
| Vínculo | nasce ligado ao caso | entra no cruzamento por atributos |
| Tutor | **notificado na hora** | avisado quando houver candidato |
| Conversa | **abre na hora**, como na tag | abre quando o tutor **confirmar** o candidato |
| Resposta | `link: linked_to_case` | `link: awaiting_match` |

A forma avulsa proíbe `share_token` (`not: required`), para que um corpo nunca
case com as duas.

**Tag revogada não vincula.** O botão da saída do 410 de `/t/` cria achado
**avulso**, sem ligação com o pet daquela tag. Vincular devolveria a quem tem a
plaquinha revogada o caminho que a revogação existe para fechar (ADR-0004). A
saída do 404 e a do 429 também criam achado avulso, porque nas duas não há pet
conhecido.

**O token do achador é o do fluxo da tag:** 256 bits, só o SHA-256 em
`finder_token_hash`, com validade em `finder_token_expires_at`, e
`finder_identity_hash` derivado do endereço e do agente. O 201 devolve
`finder_token` e `conversation_url`, e **nenhum identificador interno**
(SEC-001). O CHECK da migração passa a aceitar a terceira combinação: achado
avulso com token e sem `reporter_user_id`. A regra continua sendo "exatamente a
autorização do caminho por onde entrou"; o que muda é que o avulso passa a ter
dois caminhos.

### 2. O invariante nº 1 contra spam

**"Nenhum aviso ao tutor é descartado por limite" vale aqui inteiro.** A
operação não tem `deny_429` e não tem `challenge`, porque `challenge` degenera em
`deny_429` quando o token do desafio não chega. O excesso age sobre o
**disparo**, nunca sobre a gravação:

| Dimensão | Teto | Ao estourar | O que protege |
|---|---|---|---|
| `[pet, finder_identity]` | 1 / 6 h | `group_notification` | a mesma pessoa tocando o telefone do tutor duas vezes: o segundo aviso anexa à conversa existente |
| `[pet]`, identidades distintas | 30 / 24 h | `notify_once_and_review` | o tutor recebe resumo em vez de trinta toques; o número é o mesmo de `pet_lost` na tag |
| `[finder_identity]` | 5 / 24 h | `accept_and_defer_dispatch` | a mesma pessoa registrando o sexto achado do dia: grava, retém o disparo e revisa |
| `[ip]` | 20 / 1 h | `accept_and_defer_dispatch` | robô num endereço; alto por causa do CGNAT, e mesmo acima dele nada é recusado |
| `[ip_24]` | 200 / 1 h | `log_and_alert` | varredura distribuída |

As duas primeiras só existem com `share_token`, porque sem ele não há pet no
pedido. O resolvedor de dimensão devolve "não se aplica" nesse caso, e a subida
não pode tratar isso como erro de configuração.

**reCAPTCHA Enterprise decide o disparo, nunca a entrada.** A chave já existe.
Score abaixo de 0,3 retém o disparo e abre revisão; de 0,3 a 0,5 dispara e entra
na fila de revisão; ausência do token (rede que bloqueia o provedor, aparelho
sem serviços do Google, extensão de privacidade) é gravada como sinal e **não
bloqueia**. É a regra de degradação que o contrato já escreve para
`X-Captcha-Token`, aplicada sem a parte que recusaria.

**Onde o script do provedor carrega.** Não em `/t/` nem em `/c/`: a CSP dessas
páginas proíbe script de terceiro (ADR-0028 item 7, SEC-005, D31). Os dois
botões levam a uma **página própria de formulário** do site
(`/achei` e `/p/{shareToken}/vi`), sem token de achador na URL, e só ela
carrega o reCAPTCHA. A página da tag continua com a CSP fechada e o aviso pela
tag continua sem desafio nenhum.

**O que o spam consegue, e o que não consegue.** Consegue gravar linhas e
ocupar a fila de revisão, e o `log_and_alert` avisa o plantão quando isso
começa. **Não consegue** calar um achador real, porque nada é recusado. Também
não consegue inundar o telefone do tutor, porque a partir do segundo aviso da
mesma identidade a notificação agrupa, e a partir do trigésimo aviso distinto
vira resumo. O tutor continua tendo "bloquear" e "denunciar" na conversa.

### 3. Foto

Depois do 201, pelo `finder_token`, pelos caminhos que o aviso pela tag já usa:
`createFinderPhotoUploadIntent` (`POST /v1/media/finder-photo-intents`) e
`enrichFinderFoundReport` (`PATCH /v1/finder/found-report`). Teto de 3 fotos por
aviso (SEC-009, dimensão `found_report`). O worker remove EXIF, XMP e IPTC, como
em toda foto. A foto não entra no corpo da criação: o caminho principal é um
toque, e foto é o "contar mais" de depois.

**As duas operações de foto do achador estão no contrato e não estão em
`src/`** (conferido na emenda 3 do ADR-0017, que está no PR #3). Sem elas, o achado sem conta sai
sem foto.

### 4. A conversa `/c/{finderToken}`

- **"Vi este pet":** a conversa nasce na criação, exatamente como no aviso pela
  tag. `conversation_url` é `/c/{finderToken}`.
- **Achado avulso:** a conversa do achador existe desde a criação e responde
  `awaiting_owner: true`. A página mostra o estado de espera, sem caixa de
  mensagem. Quando um tutor confirma o candidato (`decideLostCaseCandidate`), o
  outro lado entra, `awaiting_owner` vira falso e o achador é avisado pelo
  contato opcional que deixou (`finder_contact`), se deixou.

`awaiting_owner` é **campo novo, e não valor novo de `status`**. Um valor novo
no enum de resposta é quebra de contrato para quem trata os três valores de
hoje (o `oasdiff` da esteira acusa `response-property-enum-value-added`); campo
opcional novo não quebra ninguém. Conferido com `tufin/oasdiff:v1.32.1`, a
versão da esteira: "No breaking changes".

### 5. Pontos: o mínimo do MVP

A visão de produto põe "pontos, níveis e selos" na fase 2, com um motor de nove
eventos. O cliente trouxe **pontos** para o MVP. O MVP leva o que o pedido exige
e mais nada:

**Dois eventos de domínio, os dois disparados pelo TUTOR:**

| Evento | Quando | Quem ganha |
|---|---|---|
| `help_acknowledged` | o tutor **confirma** o candidato de um achado (`decideLostCaseCandidate` com `confirmed`) | quem registrou aquele achado |
| `reunion_credited` | o tutor encerra o caso com `reunited` e marca, em `helped_by`, até 5 conversas de quem ajudou (`closeLostCase`) | quem avisou em cada conversa marcada |

"Ganhar pontos ao interagir" é lido aqui como **ter a interação reconhecida
pelo tutor.** Pontuar a criação do aviso pagaria exatamente o spam da seção 2:
cada linha gravada viraria ponto. É a mesma regra que a visão de produto já
escreveu para o reencontro ("cai na confirmação do tutor, não na declaração de
quem achou"), estendida ao aviso.

**O livro de pontos é só de acréscimo.** Uma linha por crédito, com o evento, o
aviso de origem e o caso; estorno é lançamento negativo (`kind: reversal`), e o
original nunca é apagado nem editado. O saldo é a soma. **Unicidade no banco:**
um crédito por (evento, aviso). Confirmar duas vezes, ou encerrar, reabrir e
encerrar de novo, não credita duas vezes.

**O aviso anônimo e a conta criada depois.** O crédito é registrado **contra o
aviso**, mesmo sem conta. Quando o achador cria conta ou entra, apresenta o
`finder_token` em `POST /v1/me/found-report-claims` (`claimFoundReport`), e o
aviso ganha `reporter_user_id`. Os créditos que o aviso já tinha, e os que vier
a ter, passam a essa conta.

- **O caminho do token até o app não cria exposição nova:** o token já está na
  URL da conversa (`/c/{finderToken}`), que é caminho de deep link (emenda 1 do
  ADR-0017). A página da conversa oferece "Criar conta e ficar com os pontos";
  o app, aberto por aquele link, reclama o aviso depois do login;
- **uma conta por aviso, para sempre.** A mesma conta reclamando de novo recebe
  200; outra conta recebe 409 `found-report-already-claimed`;
- **token inexistente, expirado ou de outro aviso respondem o mesmo 404**, para
  a rota não servir de oráculo;
- **pontuar é D2** (visão de produto 8.6). Conta com e-mail não confirmado
  reclama o aviso, e os pontos ficam pendentes até a confirmação
  (`not_creditable_reason: email_unverified`);
- **fora do MVP, de propósito:** vincular automaticamente pelo e-mail deixado em
  `finder_contact`. O e-mail do aviso não é verificado, e o vínculo automático
  daria a quem digitou o e-mail de outra pessoa o poder de decidir de quem é o
  aviso.

**Proteção contra fraude, em camadas, e a primeira é a que mais pesa:**

1. **O ponto não vale nada no MVP.** É privado (decisão de 17/09), não tem
   ranking, não troca por nada, e qualquer benefício com valor econômico exige
   D4 (visão de produto 8.6, decisão 4). Fraude que não rende nada é rara, e as
   camadas abaixo cuidam do resto.
2. **Autoaviso:** quem é dono do pet no momento do evento não recebe crédito
   por aquele pet, nem avisando sem conta e reclamando depois. O vínculo
   acontece e diz `not_creditable_reason: own_pet`. Recusar o vínculo esconderia
   do tutor a própria ação; creditar pagaria o autoaviso.
3. **Par tutor e ajudante:** no máximo **um** `reunion_credited` por par (quem
   ajudou, tutor) a cada 30 dias, e um `help_acknowledged` por (ajudante, caso).
   É o que segura dois amigos abrindo casos um para o outro.
4. **O crédito fica pendente pelos 7 dias em que o encerramento é
   reversível.** Reabrir o caso estorna o `reunion_credited` dele. Só depois
   dos 7 dias o crédito entra no saldo.
5. **Teto diário por conta**, e caso aberto há menos de 1 hora não gera
   `reunion_credited`. O teto de 3 casos abertos por conta (BICHUS-21) já limita
   quantos casos falsos alguém consegue ter ao mesmo tempo.
6. **Estorno manual** com trilha de auditoria. Enquanto o backoffice não
   existir, é um procedimento de operação com registro; quando existir, é uma
   ação dele. Pergunta 2.

**Fica para a fase 2, sem nada no MVP:** níveis, selos, os outros sete eventos
do motor, convite pontuável, ranking, qualquer exibição pública de ponto, e o
distintivo de nível.

### 6. O evento da Rede criado pela comunidade

A ADR da Rede (`feat/secao-rede`, ADR-0025 daquela branch) decidiu, na seção 4,
que **só a equipe cria evento na fatia mínima**, porque não existia moderação.
A decisão do cliente de 23/09 ("equipe e comunidade desde o lançamento")
contradiz essa seção. **Aquela ADR precisa de emenda**, escrita por quem a
mantém, e a emenda precisa trazer estes requisitos. Eles não são opcionais
porque o motivo da ADR da Rede continua de pé: publicar texto e lugar escritos
por alguém, sem ninguém entre a escrita e a publicação, é problema de lei e não
de produto (emenda 1 do ADR-0011).

**O que continua valendo sem mudança:** check-in é da pessoa e nunca do pet;
presença é número, nunca lista; a foto da galeria não tem autor na saída;
evento sem coordenada, só nome do lugar, bairro e cidade.

**O que a criação pela comunidade exige, e precisa existir no lançamento:**

1. **Quem cria:** conta D2. Pela escada, publicar conteúdo é D3, que exige
   telefone verificado, e não há provedor de SMS contratado; a queda para D2 é a
   mesma regra que a visão de produto já aplicou a avaliar profissional.
2. **Teto:** poucos eventos por conta por semana, e conta com menos de 7 dias
   com o **primeiro evento retido para revisão** (`hold_for_review`). O número é
   do contrato quando a operação for escrita.
3. **Denúncia:** operação de denúncia de evento e de foto de evento, aberta a
   qualquer conta, com deduplicação por alvo (o mesmo padrão de
   `report_target` do contrato, SEC-013). Denúncia é sempre aceita, nunca 429.
4. **Moderação:** fila de revisão de conteúdo publicado, com prazo de resposta
   declarado. Não existe hoje (a ADR da Rede mede isso). Ela é do backoffice
   (ADR-0027, em outra branch), e **o evento da comunidade não pode ir ao ar
   antes dela**, pela mesma regra que a visão de produto aplicou aos pontos.
5. **Remoção:** tirar do ar é remoção lógica, com motivo, autor da remoção e
   data na trilha de auditoria; quem criou é avisado; a foto removida sai do
   bucket público.
6. **O cruzamento com o item 7 do ADR-0010** ("outros pets do mesmo tutor, e
   qualquer coisa que permita agrupá-los"), que é o ponto que mais morde:
   - **o criador do evento não aparece na superfície pública**, pelo mesmo
     motivo que o autor da foto não aparece (seção 3 da ADR da Rede). Um nome
     de criador ao lado de "Encontro dos vira-latas, toda terça, Praça X" diz
     onde uma pessoa está toda semana, e a lista de eventos de um mesmo
     criador desenha a rotina dela. O criador fica gravado para moderação e
     nunca é projetado;
   - **o texto do evento passa pela mesma redação de contato das mensagens**
     (telefone, e-mail, endereço). Nome de pet junto de nome de pessoa no mesmo
     texto não se barra por regra automática sem falso positivo; ele entra como
     critério de remoção escrito da moderação do item 4;
   - **evento não se liga a pet** em nenhuma coluna, pela mesma razão do
     check-in.

### 7. Contrato: o que muda em `api/openapi.yaml` nesta branch

| Mudança | Onde | Quebra? |
|---|---|---|
| `POST /public/found-reports` (`createPublicFoundReport`), com `PublicFoundReportInput`, `PublicSightingInput`, `PublicStrayReportInput` e `PublicFoundReportCreated` | nova | não |
| `POST /me/found-report-claims` (`claimFoundReport`), com `FoundReportClaimInput` e `FoundReportClaimResult` | nova | não |
| `GET /me/points` (`getMyPoints`), com `PointsSummary` e `PointEntry` | nova | não |
| `FinderConversation.awaiting_owner` | campo opcional novo | não |
| `LostCaseClosure.helped_by` | campo opcional novo | não |
| `found-report-already-claimed` (409) | `x-problem-types` | não |
| descrições de `createStrayFoundReport` e `decideLostCaseCandidate` | texto | não |

**O que foi rodado nesta branch, com as versões da esteira:** Spectral 6.15.0
(zero erros; os 24 avisos são os que já existiam), o lint de limite de chamada
(aprovado), `npm run generate:types` (tipos e tipos de problema regenerados e
versionados), `npm run build`, o portão de contrato público (aprovado:
nenhuma resposta sem conta declara campo privado), `tufin/oasdiff:v1.32.1`
contra `origin/development` (sem quebra), `npm run typecheck` e a suíte
unitária (1562 de 1562). A suíte pediu um veredito para a operação idempotente
nova (`id-do-caminho-entra-na-chave.test.ts`), e ela entrou como "sem handler",
igual a `postFinderMessage`.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| `createStrayFoundReport` com `security: [bearerAuth, {}]` | uma operação só | duas formas de resposta e dois caminhos de autorização na mesma operação | a credencial deixa de ser legível por operação |
| `challenge` ou `deny_429` no achado sem conta | corta robô cedo | cala o achador real atrás de CGNAT, ou sem os serviços do Google | invariante nº 1 |
| reCAPTCHA na página da tag | um formulário a menos | script de terceiro em página com token; D31 proíbe desafio entre o achador e o aviso | a página própria resolve sem mexer na tag |
| Pontuar a criação do aviso | incentivo imediato | cada linha de spam vira ponto | o reconhecimento do tutor é o filtro |
| `awaiting_owner` como valor de `status` | mais natural | quebra de contrato pelo `oasdiff` | campo novo diz o mesmo sem quebrar |
| Vincular aviso anônimo por e-mail do `finder_contact` | sem passo extra | e-mail não verificado decide de quem é o aviso | reclamação explícita pelo token |

## Consequências

**Fica mais fácil:** quem acha um animal sem plaquinha, ou vê um perdido na
página do caso, avisa sem criar conta, que é a condição para o aviso existir.

**Fica mais difícil:** a fila de revisão passa a receber o achado sem conta
retido, e ela ainda não tem backoffice. Os pontos acrescentam um livro que
precisa de estorno e auditoria.

**Irreversível:** nada.

**Dívida aceita, com gatilho:** pontos sem estorno pelo backoffice até ele
existir (pergunta 2); o achado avulso sem conta sem foto até as duas operações
de foto do achador estarem em `src/`.

## Tarefas de backend que saem daqui

1. **Migração:** o CHECK de `found_reports` aceita achado avulso com token e sem
   `reporter_user_id`; tabela do livro de pontos, só de acréscimo, com unicidade
   por (evento, aviso) e estorno por lançamento negativo.
2. **`createPublicFoundReport`:** handler, as duas formas de corpo, emissão de
   `finder_token` como no aviso pela tag, conversa aberta na hora no "vi este
   pet", `awaiting_owner` no avulso, recusa de vínculo para tag revogada.
3. **Resolvedores de dimensão** que devolvem "não se aplica" para `pet` quando
   não há `share_token`, sem derrubar a subida.
4. **reCAPTCHA Enterprise no servidor** para esta operação: score, faixas e
   ausência como sinal, decidindo o disparo e não a entrada.
5. **`accept_and_defer_dispatch`** aplicado de verdade: grava, retém a
   notificação, abre item de revisão. Conferir se a porta `RateLimitStore`
   já expressa isso; o ADR-0016, emenda 1, registra que `when` e `counts`
   distintos ainda não são aplicados.
6. **`claimFoundReport`:** vínculo, idempotência pela mesma conta, 409 para
   outra, 404 único, crédito pendente sem e-mail confirmado, `own_pet`.
7. **`getMyPoints`.**
8. **Créditos:** `help_acknowledged` em `decideLostCaseCandidate`;
   `reunion_credited` em `closeLostCase` com `helped_by`, validando que cada
   conversa é do caso; pendência de 7 dias; estorno ao reabrir; tetos por par,
   por dia e por idade do caso.
9. **As operações do achador que o contrato já tem e o código não:**
   `getFinderConversation` (com `awaiting_owner`), `postFinderMessage`,
   `blockFinderConversation`, `reportFinderConversation`,
   `createFinderPhotoUploadIntent`, `enrichFinderFoundReport`.
10. **Aviso ao achador sem conta** quando o tutor confirma o candidato, pelo
    contato opcional.
11. **Testes:** a isca do invariante nº 1 (acima de todo teto, o aviso é gravado
    e nenhuma resposta é 429); autoaviso não credita; reabrir estorna; outra
    conta reclamando recebe 409.

E fora do backend: a emenda da ADR da Rede (seção 6), a fila de moderação no
backoffice, as duas páginas de formulário do site (`/achei` e
`/p/{shareToken}/vi`) com Figma aprovado, e a tela do app que reclama o aviso
depois do login.

## Perguntas ao cliente

**1. Quantos pontos vale cada coisa?**
(a) Aviso reconhecido pelo tutor, 10; reencontro creditado, 50. (b) Outros
números, que você diz. **Recomendo (a)** como ponto de partida: o ponto não
troca por nada no MVP, e o número pode mudar depois sem estorno, porque o livro
guarda o evento e não só o valor.

**2. Os pontos aparecem para a pessoa desde o lançamento, ou só quando o
backoffice estiver de pé?**
(a) Desde o lançamento, com estorno feito à mão pela equipe, com registro, até
o backoffice existir. (b) Os pontos são creditados desde o lançamento, mas o
saldo só aparece quando o backoffice estiver de pé; ninguém perde nada, só vê
depois. **Recomendo (b)**: cumpre as duas decisões suas, a de 23/09 (quem
ajuda ganha pontos) e a de 17/09 (nenhum ponto no ar sem moderação).

**3. O evento criado pela comunidade vai ao ar na hora, ou passa pela equipe
antes?**
(a) O primeiro evento de cada conta passa pela equipe; os seguintes vão ao ar
na hora e ficam sujeitos a denúncia. (b) Todo evento passa pela equipe. (c)
Todos vão ao ar na hora, só com denúncia. **Recomendo (a)**: segura o caso mais
comum de abuso (conta nova criada para publicar) sem pôr a equipe no caminho de
quem já provou que usa bem.
