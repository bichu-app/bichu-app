> **Status:** rascunho, superado em parte (ver o aviso abaixo)
> **Atualizado:** 2026-09-23

> **Aviso, 23/09/2026.** Este documento foi escrito para um backoffice de
> **outro time**. Em 23/09 o cliente decidiu que o squad constrói o painel
> (ADR-0027). O que segue continua valendo como descrição de `Perto`, que
> ficou **fora** da v1 do painel. Para `Loja` e `Rede` ele está superado: as
> seções 7 e 9.6 foram resolvidas (a `Loja` é tabela do painel; a `Rede` tem
> tabela na BICHUS-251), e o contrato das duas é o de `/v1/admin/...` em
> `api/openapi.yaml`. A autenticação descrita na seção 8 (`bearerAuth` e papel)
> também está superada: `/v1/admin/*` aceita só a sessão administrativa em
> cookie (ADR-0027 item 2).

# Contrato de escrita do diretório — Bichu

**Para quem é este documento:** a equipe que vai construir o backoffice, em
outra esteira de desenvolvimento. Não assumimos nenhum conhecimento do
repositório do Bichu. Tudo que você precisa saber para alimentar as seções
`Perto`, `Rede` e `Loja` do aplicativo está aqui ou está apontado daqui.

**O que este documento decide:** o que já existe no banco e o que não existe,
quais colunas você vai escrever, quais valores cada lista fechada aceita, quem
é dono de qual campo, o que acontece com dado incompleto, e como você fica
sabendo quando algo muda.

**O que este documento não decide:** três itens estão marcados **A DECIDIR** e
dependem de resposta do cliente. Eles estão listados no fim, na seção 9. Nada
que esteja marcado assim deve ser implementado do lado de vocês ainda.

---

## 1. O produto em cinco linhas, para situar

O Bichu é um aplicativo (Flutter) com um backend próprio (TypeScript) sobre
PostgreSQL 16 com a extensão PostGIS. O aplicativo tem cinco seções na barra
inferior: `Pets`, `Rede`, `Perto`, `Loja` e `Perfil`.

- **`Perto`** é o diretório de quem presta serviço para animais: veterinário,
  banho e tosa, passeador, hospedagem, adestrador, clínica e (a decidir) ONG.
- **`Rede`** é a agenda de eventos e encontros da comunidade.
- **`Loja`** é o catálogo de produtos.

O aplicativo **só lê**. Quem escreve é vocês.

---

## 2. Onde cada seção está hoje, medido em 22/09/2026

Esta tabela muda o tamanho do trabalho de vocês, então ela vem antes de tudo.

| Seção | Tem tabela no banco? | Tem rota de leitura? | Telas construídas |
|---|---|---|---|
| **`Perto`** | **Sim**: `professionals` e `entity_verifications` | Não, nenhuma | 1 de 8 sub-destinos, e é uma casca |
| **`Rede`** | **Não**, nenhuma | Não | 0 de 4 |
| **`Loja`** | **Não**, nenhuma | Não | 0 de 6 |

**Consequência prática, e é a mais importante deste documento:**

- Para **`Perto`**, o esquema existe, está migrado, tem as listas fechadas
  travadas por teste automatizado, e vocês podem começar a desenhar o painel
  contra ele **hoje**. As seções 3 a 6 são esse contrato.
- Para **`Rede`** e **`Loja`**, **não há nada**. Nenhuma tabela, nenhuma coluna,
  nenhuma lista de valores. Qualquer campo que vocês desenharem para essas duas
  seções é desenho de vocês contra um esquema que ainda não foi escrito. **Não
  construam o painel dessas duas seções contra suposição.** A seção 7 diz o que
  falta e em que ordem.

---

## 3. `Perto`: o que o banco já responde, e o que não tem onde caber

Duas tabelas existem, criadas em 21/09/2026 pela migração
`20260921000002_profissionais-e-verificacoes-de-entidade.sql`. Elas estão
**vazias** e **nenhuma linha do backend as usa ainda**. Isso é de propósito: a
decisão de arquitetura que as criou (ADR-0011) mandou o esquema nascer antes do
fluxo, para que ligar o diretório não exigisse migrar banco com produto no ar.

### 3.1 O que `professionals` responde hoje

Tomando uma **clínica veterinária** como caso concreto, porque é o registro mais
exigente:

| O painel vai querer cadastrar | Tem coluna? | Qual |
|---|---|---|
| Nome da clínica | sim | `display_name` |
| Tipo de atividade | sim | `kind`, com `clinic` na lista |
| Descrição / apresentação | sim | `about`, até 2000 caracteres |
| Cidade | sim | `city` |
| Estado (UF) | sim | `state` |
| Bairro | sim | `neighborhood` |
| Coordenada, para ordenar por distância | sim | `geo`, ponto geográfico |
| Telefone comercial | sim | `phone_e164` |
| CNPJ | sim | `cnpj` |
| CRMV do responsável técnico | sim | `crmv_number` + `crmv_uf` |
| Se está publicado ou em rascunho | sim | `status` |
| Nível de verificação | sim, **mas derivado** | `verification_level` — ver 5.3 |

### 3.2 O que a clínica tem e **não tem onde caber** hoje

Esta lista é o trabalho de esquema que ainda não foi feito. Nenhum destes campos
existe:

1. **Horário de funcionamento.** Não há coluna, nem estruturada nem em texto
   livre. "Aberto agora" e "abre às 8h" são impossíveis hoje. Para um diretório
   de clínica, esta é a ausência mais sentida.
2. **Endereço de rua e número.** Existe cidade, bairro e UF, e só. Um diretório
   que não diz a rua é um diretório até onde não dá para dirigir. **Isto é uma
   decisão pendente, não um esquecimento** — a regra de privacidade do produto
   (ADR-0010) proíbe endereço e CEP em superfície pública, e a emenda do ADR-0011
   abriu exceção para cidade e bairro de profissional, **mas não para a rua**.
   Está na seção 9 como decisão 9.2.
3. **Foto, logotipo ou galeria.** Não há coluna. O produto tem um mecanismo de
   upload com URL assinada, mas ele é hoje específico de foto de pet.
4. **Site, e-mail, WhatsApp e redes sociais.** Nenhum. Só telefone.
5. **Serviços oferecidos e faixa de preço.** Nenhum.
6. **Avaliações da comunidade.** As tabelas `professional_reviews` e
   `professional_review_replies` **foram deliberadamente não criadas**: o modelo
   de avaliação mudou em 21/09 e criar uma tabela cuja regra acabou de mudar é o
   oposto de evitar migração futura. É migração futura **conhecida**.
7. **Convites.** A tabela `professional_invitations` também não existe, pelo
   mesmo motivo: o fluxo de convite não está desenhado.
8. **ONG.** Ver 3.3, porque este é o buraco que mais atrapalha vocês.
9. **Pets para adoção.** Ver 3.4.

### 3.3 O buraco da ONG, e ele é grande

O mapa de navegação do aplicativo prevê **ONGs como um filtro do diretório**.
Contra o esquema de hoje isso **não funciona**, e o motivo é direto:

- `professionals.kind` aceita seis valores: `vet`, `groomer`, `walker`,
  `sitter`, `trainer`, `clinic`. **Não há `ngo` nem equivalente.**
- A palavra `organization` aparece no esquema em dois lugares, e nenhum dos dois
  é uma linha de diretório: em `entity_verifications.entity_kind`, que é o
  registro de *verificação*, e em `users.account_kind`, que é o tipo da *conta*.

Ou seja: **uma ONG não tem onde ser uma linha no diretório hoje.** É decisão
9.1, e é a que mais trava o painel de vocês.

### 3.4 Adoção

Não existe. Nem tabela, nem coluna, nem sinalizador. O aplicativo tem uma tela
`/adocoes` que é uma casca vazia, alcançável por duas portas. Animais são
guardados na tabela `pets`, que tem dono obrigatório (uma conta de usuário) e um
teto padrão de 20 animais por conta — teto pensado para pessoa física, que uma
ONG estoura no dia em que entra. Não há nada que marque um animal como
disponível para adoção.

**Não desenhem tela de adoção no backoffice ainda.** É decisão 9.3.

---

## 4. As listas fechadas: os valores que o painel escreve

Este é o vocabulário. São oito listas, cinco em `professionals` e três em
`entity_verifications`, e elas estão escritas **por extenso e à mão** em
`tests/integration/conjunto-exato-dos-checks.test.ts`, um teste que compara o
que está escrito ali com o que o banco de verdade aceita.

Esse teste é a garantia de vocês, e vale a pena entender por quê. Ele reprova
nos **dois** sentidos: um valor que sai da lista reprova, e um valor que entra
sem alguém declarar também reprova. Não existe, neste produto, valor novo que
apareça sem que alguém tenha escrito o conjunto inteiro de novo. **Uma lista
fechada aqui não muda em silêncio.**

As listas são impostas por restrição `CHECK` do PostgreSQL, e não por tipo
`enum` nativo. Isso é decisão: acrescentar valor a um `enum` nativo exige
alterar o tipo com o produto no ar. Para vocês a diferença é invisível; ela
existe para que a lista possa crescer sem parada.

### 4.1 `professionals.kind` — a atividade

| Valor | O que é |
|---|---|
| `vet` | veterinário, pessoa |
| `groomer` | banho e tosa |
| `walker` | passeador |
| `sitter` | hospedagem e cuidado |
| `trainer` | adestrador |
| `clinic` | clínica ou estabelecimento (o caso do CNPJ) |

**Obrigatório.** Sem valor padrão. Não há `ngo` (ver 3.3).

### 4.2 `professionals.status` — visibilidade

| Valor | O que é |
|---|---|
| `draft` | rascunho. **Padrão.** Existe no banco, não aparece no aplicativo |
| `published` | publicado. **Único valor que o aplicativo lê** |
| `hidden` | retirado temporariamente, pela entidade ou por moderação |
| `removed` | retirado em definitivo |

**Obrigatório**, padrão `draft`. É a chave de todo o resto: os três índices da
tabela são parciais sobre `status = 'published'`, e toda leitura filtra por ele.

### 4.3 `professionals.source` — como a linha nasceu

| Valor | O que é |
|---|---|
| `self` | a própria entidade se cadastrou |
| `invited` | um tutor convidou e **a entidade aceitou** |
| `import` | semente por parceria ou importação |

**Obrigatório.** Sem valor padrão.

**Não existe `community`, e a ausência é uma decisão do cliente de 21/09/2026,
não um esquecimento.** A regra que vale é: *nenhum perfil nasce sem o aceite de
quem ele descreve*. A comunidade convida e avalia; nunca cria. Se o painel de
vocês tiver um botão "cadastrar profissional", o registro nasce `self` (a
entidade está do outro lado do balcão) ou `import` (parceria formalizada), e
**nunca** como um terceiro cadastrando alguém que não sabe disso.

### 4.4 `professionals.claim_status` — quem responde pelo perfil

| Valor | O que é |
|---|---|
| `unclaimed` | sem titular. **Só é permitido quando `source = 'import'`** |
| `claim_pending` | alguém pediu a titularidade e ainda não foi decidido |
| `claimed` | tem titular. **Padrão** |
| `disputed` | duas pessoas reivindicam o mesmo perfil |

**Obrigatório**, padrão `claimed`.

O banco impõe: `source = 'import' OR claim_status <> 'unclaimed'`. Em bom
português, **um registro `self` ou `invited` não pode existir sem titular**.

### 4.5 `professionals.verification_level` — o que foi provado

| Valor | O que é |
|---|---|
| `none` | nada foi verificado. **Padrão**, e é estado legítimo e publicável |
| `contact_verified` | o telefone foi confirmado por retorno de ligação ou código |
| `document_verified` | CRMV ou CNPJ conferido |

**Obrigatório**, padrão `none`. **Vocês não escrevem este campo** — ver 5.3.

Regra de interface que afeta o texto do painel: o produto **nunca** exibe
"verificado" sem dizer *o que* foi verificado. Selo genérico transfere ao Bichu
uma responsabilidade que ele não tem como sustentar.

### 4.6 `entity_verifications.entity_kind` — que tipo de entidade

| Valor | O que é |
|---|---|
| `professional` | uma linha de `professionals` |
| `organization` | uma organização |

**Obrigatório.** Note que `organization` existe **aqui** e não existe como tipo
de linha no diretório (3.3).

### 4.7 `entity_verifications.evidence_kind` — a prova apresentada

| Valor | O que é | Força |
|---|---|---|
| `crmv` | registro no conselho, com número e UF | a mais forte |
| `cnpj` | CNPJ conferido contra a razão social | forte |
| `phone_callback` | telefone confirmado por ligação ou código | a única disponível para passeador, hospedagem, tosa e adestramento, que **não têm conselho nem registro obrigatório** |
| `document` | outro documento | avaliação humana |

**Obrigatório.**

### 4.8 `entity_verifications.decision` — o resultado da análise

| Valor | O que é |
|---|---|
| `pending` | na fila. **Padrão** |
| `approved` | aprovada |
| `rejected` | recusada |

**Obrigatório**, padrão `pending`. A análise é **humana desde o início**, por
decisão de produto. O painel de vocês é onde ela acontece.

---

## 5. Tabela por tabela, coluna por coluna

Tipos são do PostgreSQL. "Obrigatório" significa `NOT NULL` no banco.

### 5.1 `professionals`

| Coluna | Tipo | Obrigatório | Regra | O que significa |
|---|---|---|---|---|
| `id` | `uuid` | sim, chave primária | UUIDv7 | identificador interno. **Nunca sai em resposta do aplicativo** (ver 6.2) |
| `kind` | `text` | sim | lista 4.1 | a atividade |
| `display_name` | `text` | sim | 2 a 120 caracteres | o nome que aparece na tela |
| `about` | `text` | não | até 2000 caracteres | apresentação livre |
| `city` | `text` | não | 2 a 80 caracteres | cidade onde atende |
| `state` | `text` | não | exatamente 2 caracteres | UF |
| `neighborhood` | `text` | não | até 80 caracteres | bairro onde atende |
| `geo` | `geography(Point,4326)` | não | — | coordenada. **Ver 6.1, é o ponto mais delicado deste contrato** |
| `source` | `text` | sim | lista 4.3 | como a linha nasceu |
| `created_by_user_id` | `uuid` | não | referência a uma conta | **quem convidou**. Ver 5.2 |
| `claim_status` | `text` | sim, padrão `claimed` | lista 4.4 | titularidade |
| `claimed_by_user_id` | `uuid` | não | referência a uma conta | quem é o titular. **Nunca sai em resposta** |
| `claimed_at` | `timestamptz` | não | — | quando a titularidade foi marcada |
| `claim_snapshot_at` | `timestamptz` | não | — | **não use.** Ver 5.2 |
| `verification_level` | `text` | sim, padrão `none` | lista 4.5 | **derivado, não escrito.** Ver 5.3 |
| `crmv_number` | `text` | não | 3 a 20 caracteres | número do registro no conselho |
| `crmv_uf` | `text` | não | exatamente 2 caracteres | UF do registro |
| `cnpj` | `text` | não | **exatamente 14 dígitos, só números** | sem ponto, barra ou traço |
| `phone_e164` | `text` | não | `+` seguido de 8 a 15 dígitos | telefone **comercial**, publicado de propósito |
| `status` | `text` | sim, padrão `draft` | lista 4.2 | visibilidade |
| `created_at` | `timestamptz` | sim, padrão agora | — | |
| `updated_at` | `timestamptz` | sim, padrão agora | — | |

**Duas regras que o banco impõe entre colunas**, e que vão devolver erro ao
painel de vocês se forem violadas:

1. `source = 'import'` **ou** `claim_status` diferente de `unclaimed`.
2. Ou `claim_status = 'unclaimed'` com `claimed_at` e `claimed_by_user_id`
   vazios, ou `claim_status` diferente de `unclaimed` com `claimed_at`
   preenchido.

**Uma armadilha de formato:** a regra de telefone aqui (`+` e 8 a 15 dígitos,
internacional) é **diferente** da regra de telefone de conta de usuário em outra
tabela, que aceita só Brasil. Se vocês reaproveitarem uma máscara, reaproveitem
a errada e o banco recusa. A daqui é a internacional.

### 5.2 As três colunas que vocês **não** escrevem e que **nunca** saem

- **`created_by_user_id`** — "quem convidou". É um **vínculo entre duas
  pessoas**, e a regra de privacidade do produto proíbe expor vínculo em
  superfície pública, inclusive na forma de contagem e inclusive na forma da
  existência. O campo existe porque a trilha de auditoria precisa dele. **Ele
  não entra em nenhuma resposta, e isso é verificado por um portão automatizado
  na nossa esteira** (`src/tools/portao-colunas-que-nao-saem.ts`): se alguém
  escrever esse nome numa resposta, o build reprova. Não há como o painel de
  vocês precisar dele.
- **`claimed_by_user_id`** — mesma natureza, mesma regra.
- **`claim_snapshot_at`** — sem uso no caminho normal. Ela existia para um
  modelo de negócio que mudou. Foi mantida porque `source = 'import'` continua
  previsto. **Deixem vazia.**

### 5.3 `verification_level` é derivado, e isto é a regra que mais costuma ser quebrada

`professionals.verification_level` **sai da verificação aprovada mais forte
daquela entidade em `entity_verifications`**. Ele nunca é digitado.

Traduzindo para o painel de vocês: quando um operador aprova uma verificação, o
que ele faz é gravar `decision = 'approved'` numa linha de
`entity_verifications`. **O `verification_level` do perfil se atualiza a partir
disso.** Não deve haver, em lugar nenhum do backoffice, um campo onde alguém
escolha o nível diretamente.

O motivo: se o perfil pudesse declarar o próprio nível, a verificação seria
decorativa, e o selo passaria a afirmar para o usuário final algo que ninguém
provou. O banco **não** consegue impedir isso sozinho — uma restrição `CHECK`
não enxerga outra tabela. Quem impede é a aplicação. É um dos quatro motivos
pelos quais recomendamos que o backoffice escreva por API e não direto no banco
(seção 8).

### 5.4 `entity_verifications`

| Coluna | Tipo | Obrigatório | Regra | O que significa |
|---|---|---|---|---|
| `id` | `uuid` | sim, chave primária | UUIDv7 | |
| `entity_kind` | `text` | sim | lista 4.6 | que tipo de entidade está sendo verificada |
| `entity_id` | `uuid` | sim | **sem chave estrangeira, de propósito** | qual entidade. Ver abaixo |
| `claimant_user_id` | `uuid` | sim | referência a uma conta | quem pediu a verificação |
| `evidence_kind` | `text` | sim | lista 4.7 | a prova apresentada |
| `evidence_ref` | `text` | não | 1 a 200 caracteres | **referência ao documento, nunca o documento.** Ver abaixo |
| `submitted_at` | `timestamptz` | sim, padrão agora | — | quando entrou na fila |
| `decision` | `text` | sim, padrão `pending` | lista 4.8 | o resultado |
| `reviewed_by_user_id` | `uuid` | não | referência a uma conta | quem analisou |
| `reviewed_at` | `timestamptz` | não | — | quando foi analisada |
| `rejection_reason` | `text` | não | até 500 caracteres | por que foi recusada |
| `created_at` | `timestamptz` | sim, padrão agora | — | |

**Duas regras entre colunas:**

1. Ou `decision = 'pending'` com `reviewed_at` vazio, ou `decision` diferente de
   `pending` com `reviewed_at` preenchido. Não existe decidida sem quando.
2. `rejection_reason` só pode ter valor quando `decision = 'rejected'`.

**`entity_id` não tem chave estrangeira, e isso é decisão.** A tabela é
polimórfica: ela verifica tanto um profissional quanto uma organização, e o
PostgreSQL não expressa chave estrangeira condicional ao valor de outra coluna.
**A consequência para vocês é direta: o banco vai aceitar um `entity_id` que não
existe, e ninguém vai reclamar.** Quem garante que ele existe é a aplicação. Se
o backoffice escrever direto no banco, essa garantia deixa de existir. É o
segundo dos quatro motivos da seção 8.

**`evidence_ref` guarda um ponteiro, não o documento.** CRMV, CNPJ e documento
de identidade são dado sensível de terceiro. O arquivo vive em armazenamento
privado, alcançado por URL assinada com expiração. Esta coluna guarda a
referência a ele. O teto de 200 caracteres é a tradução verificável dessa frase:
uma referência cabe, um documento colado não. **O mecanismo de upload para o
backoffice ainda não existe** e está na seção 9.

---

## 6. Duas coisas que o painel de vocês precisa fazer e que não são óbvias

### 6.1 A coordenada tem que vir de vocês, porque não há geocodificação

`Perto` é "perto". Ordenar por distância exige coordenada. E o produto tem uma
decisão firmada (ADR-0006): **não há geocodificação no MVP**. Não existe serviço
contratado que transforme "Rua tal, 123, Pinheiros" em latitude e longitude, e
não vai existir nesta fase. Cidade, bairro e CEP são **rótulo de exibição e
filtro de texto**, nunca fonte de coordenada.

Isso significa, sem rodeio: **se a entrada do diretório não vier com coordenada,
ela nunca aparece ordenada por distância.** Ela aparece só na busca por cidade e
bairro digitados.

**Requisito do painel de vocês, e ele é de interface, não de campo:** a tela de
cadastro precisa de um **mapa com toque para marcar o ponto**. O aplicativo já
faz exatamente isso no cadastro do tutor, pelo mesmo motivo, e o mecanismo tem
nome no produto: `map_pin`. Um par de campos numéricos "latitude" e "longitude"
não serve — ninguém sabe a própria coordenada de cabeça, e o operador vai deixar
em branco ou inventar.

O que a leitura faz com isso: a consulta é `ST_DWithin` sobre um índice GiST,
que já existe na tabela. A resposta do aplicativo devolve **distância
arredondada**, nunca a coordenada em si — a regra de privacidade do produto
proíbe devolver ponto em superfície pública, e devolver um ponto por entrada
permite montar o mapa que a regra existe para impedir.

**Alternativa, se o toque no mapa for caro para vocês:** o painel aceita entrada
sem coordenada, a entrada é publicável, e ela simplesmente não participa da
ordenação por distância. Mas então `Perto` deixa de ser "perto" para uma parte
do catálogo, e essa parte vai ser a maior, porque o caminho mais fácil sempre é
o mais usado. Está na seção 9 como decisão 9.4.

### 6.2 Identificadores internos nunca saem, então o diretório precisa de um endereço público

O produto proíbe, sem exceção, que qualquer UUID do banco apareça em resposta
que um estranho possa ver. O motivo é que o formato usado (UUIDv7) é ordenável e
carrega o instante de criação: publicar um por entrada entrega a base inteira
como telemetria de crescimento.

Consequência para vocês: **`professionals.id` não pode ser o endereço da página
do profissional.** O diretório precisa de um identificador público próprio.

**Recomendação:** um `slug` — texto curto, minúsculas, números e hífen, de 3 a
30 caracteres, único — que o painel gera a partir do nome e da cidade e permite
editar. O produto já tem esse tipo, com esse formato exato, e já tem a resposta
de conflito para quando dois quiserem o mesmo (`409`). A página vira
`/v1/directory/entries/{slug}`.

Isso é um **campo novo** em `professionals`, que hoje não existe. Está na seção
9 como parte da decisão 9.5.

---

## 7. `Rede` e `Loja`: o que falta, e o que vocês não devem construir ainda

### 7.1 `Rede` — eventos

Nada existe. Nenhuma tabela, nenhuma rota, nenhuma tela além de um estado vazio
que diz "Rede está em construção". A documentação de experiência do produto
registra, com essas palavras, que **eventos não tem uma linha de especificação
de ninguém**: não há tela, ordem de leitura, estados nem microcópia.

Além disso, a seção acabou de mudar de conteúdo: o feed da comunidade estava
planejado para `Rede` e foi adiado, então `Rede` fica com eventos e só.

**Não desenhem o cadastro de eventos ainda.** Falta, antes de qualquer coluna,
decidir o que é um evento neste produto: quem pode criar, se tem inscrição, se
tem limite de vagas, se tem endereço (e aí a mesma pergunta da coordenada volta),
e o que acontece quando é cancelado.

### 7.2 `Loja` — catálogo

Nada existe no banco. E há uma contradição que precisa ser resolvida antes de
qualquer trabalho de vocês:

**O catálogo da `Loja` foi decidido, nesta semana, como um arquivo versionado no
repositório do Bichu**, não como uma tabela. O pedido de alimentar `Loja` por
backoffice **reabre essa decisão**. As duas não convivem: ou o produto é
publicado por commit neste repositório, ou ele é uma tabela alimentada pelo
painel de vocês. Está na seção 9 como decisão 9.6.

O que já está decidido sobre `Loja` e que vale em qualquer um dos dois caminhos:

- **O preço é "preço de referência", com data de consulta, e ele vence.** O
  vencimento é aplicado **no servidor**, nunca no cliente. Vencido, o servidor
  **omite o valor** e a linha vira "preço não confirmado, veja na loja do
  parceiro". O prazo proposto é 30 dias. Traduzindo para coluna: além de preço,
  o catálogo precisa guardar **quando aquele preço foi consultado**.
- Há uma ressalva jurídica sobre o rótulo de preço de referência (art. 37 do
  Código de Defesa do Consumidor) que reduz, e não zera, o risco. O texto exato
  é de quem assina os termos, não de quem implementa.
- Carrinho, pedido e provedor de pagamento **não têm especificação nenhuma** e
  nenhuma decisão de provedor foi tomada.

---

## 8. Quem é dono de quê: o backoffice escreve por API, não direto no banco

Esta é a decisão de fronteira mais cara de reverter, e a recomendação é firme.

**Recomendação: o backoffice não recebe credencial de PostgreSQL.** Ele escreve
por operações HTTP servidas pelo backend do Bichu, sob `/v1/admin/...`,
autenticadas com token e um papel administrativo.

O motivo não é gosto de arquitetura. É que **todo mecanismo de proteção deste
produto mora do lado do backend**, e uma conexão direta com o banco passa por
baixo de todos eles. Quatro casos concretos, todos verificáveis no repositório
hoje:

1. **`verification_level` é derivado e o banco não consegue impor isso.** Uma
   restrição `CHECK` não enxerga outra tabela, então o PostgreSQL aceita, sem
   reclamar, um perfil marcado como `document_verified` sem nenhuma verificação
   aprovada. Com conexão direta esse campo vai ser escrito à mão, porque é uma
   coluna e colunas se escrevem. E aí o selo mente para o usuário final.
2. **`entity_verifications.entity_id` não tem chave estrangeira** (5.4). A
   integridade vive na aplicação. Sem aplicação no caminho, não vive em lugar
   nenhum.
3. **A limpeza de dado sensível acontece na escrita, não na leitura.** O produto
   já faz isso em outro campo, e a migração explica por quê: dado sensível
   gravado em claro já vazou para todo backup e todo registro de replicação. O
   que valer para o texto livre do profissional precisa rodar no mesmo lugar.
4. **A trilha de auditoria é um esquema separado, com papel de banco sem
   permissão de alterar nem apagar.** Aprovar um CRMV é exatamente a decisão que
   precisa ficar auditável, com quem decidiu e quando. Um `INSERT` direto não
   deixa rastro.

**Se o cliente decidir pelo acesso direto mesmo assim**, o mínimo que torna isso
sobrevivível, e que é trabalho do lado do Bichu:

- papel de banco separado, com permissão de escrita **só** nessas duas tabelas e
  nenhuma leitura de contas, animais ou auditoria;
- `verification_level` deixa de ser coluna escrita e passa a ser mantida por
  gatilho, para que a mão de ninguém a alcance;
- uma `VIEW` estável por tabela, e **o contrato passa a ser a `VIEW`**, não a
  tabela — é o que permite renomear uma coluna sem quebrar o painel de vocês.

### 8.1 O que acontece com dado ruim

Três camadas, e a distinção entre a segunda e a terceira é o que evita
formulário tudo-ou-nada:

1. **Regra de campo: recusa na escrita**, com `400` e o nome do campo. Tudo que
   a seção 5 lista como regra: UF com dois caracteres, CNPJ com catorze dígitos
   só, telefone em formato internacional, nome entre 2 e 120. Se isso não for
   recusado antes, o PostgreSQL devolve um código de erro de restrição, que é
   erro de banco vazando como se fosse resposta de API.
2. **Regra de completude: o rascunho é permitido, a publicação não.** Uma
   entrada incompleta **pode existir** como `status = 'draft'` — é assim que um
   operador salva o que digitou até aqui. O que é recusado é a **passagem para
   `published`** sem o conjunto completo: `city` e `state` preenchidos, ao menos
   um canal de contato, e `geo` se a entrada quiser aparecer ordenada por
   distância. É esta camada que responde "endereço sem cidade": entra como
   rascunho, não publica.
3. **A leitura não filtra qualidade.** Ela filtra `status = 'published'`, e só.
   Um filtro de qualidade do lado da leitura seria uma segunda definição de
   "completo", invisível, que vai divergir da primeira — e no dia em que
   divergir ninguém vai saber qual das duas está certa.

**"Profissional sem verificação" não é dado ruim.** `verification_level = 'none'`
é estado legítimo e publicável, e precisa ser: passeador, hospedagem, tosa e
adestramento **não têm conselho nem registro obrigatório**, e recusar a
publicação de quem não tem CRMV esvaziaria metade do diretório.

### 8.2 Como vocês ficam sabendo quando algo muda

- **A fonte da verdade é a especificação OpenAPI 3.1 em `api/openapi.yaml`.**
  Não é este documento, não é uma mensagem, não é a migração. Este documento
  explica; a especificação obriga.
- **A esteira do Bichu já compara.** A cada alteração, ela roda um comparador de
  contrato entre a especificação da branch e a da base, e **uma mudança
  incompatível não passa**. Ela também publica o registro de alterações no
  resumo da execução. Isso deixa de ser detalhe nosso e passa a ser garantia de
  vocês.
- **Dentro de `/v1`, só acréscimo.** Campo novo, valor novo em lista fechada,
  operação nova. Remover campo, mudar tipo ou estreitar lista fechada exige
  `/v2`.
- **Valor novo numa lista fechada é sempre três arquivos no mesmo commit**: a
  migração, a declaração por extenso no teste de conjunto exato, e o `enum` da
  especificação. É por isso que um valor novo aqui é sempre deliberado.
- **Janela de descontinuação: 30 dias** entre anunciar e remover, com o campo
  marcado `deprecated: true` nesse intervalo.
- **Um contato nomeado de cada lado.** Esteira verde não avisa ninguém; ela
  apenas impede o pior.

---

## 9. O que ainda não está decidido, e que vocês não devem implementar

| # | Decisão pendente | O que ela trava |
|---|---|---|
| 9.1 | **ONG entra como valor novo em `professionals.kind`, ou como tabela própria?** | todo o cadastro de ONG e, atrás dele, a adoção |
| 9.2 | **Endereço de rua e número entra no diretório?** | o cadastro de clínica, e a própria utilidade de `Perto` |
| 9.3 | **Adoção: qual o modelo de dados?** | qualquer tela de adoção no painel |
| 9.4 | **O painel marca a coordenada no mapa, ou o diretório aceita entrada sem coordenada?** | a ordenação por distância |
| 9.5 | **Qual é o identificador público de uma entrada do diretório?** | o endereço da página do profissional |
| 9.6 | **`Loja` é catálogo em arquivo no repositório ou tabela alimentada pelo painel?** | tudo de `Loja` |

Falta ainda, e são trabalho e não decisão: horário de funcionamento, foto e
logotipo, site e redes sociais, serviços e faixa de preço, avaliações,
convites, e o mecanismo de envio de documento de verificação a partir do painel.

---

## 10. Por onde começar

A recomendação de ordem, para que vocês não fiquem bloqueados:

1. **Fila de verificação.** É a parte de `Perto` que está 100% pronta do lado do
   banco, não depende de nenhuma das seis decisões da seção 9, e é trabalho
   humano recorrente que alguém vai ter que fazer de qualquer jeito. A tela é:
   listar `entity_verifications` com `decision = 'pending'` por ordem de
   `submitted_at`, abrir a evidência, e gravar `approved` ou `rejected` com
   motivo. O índice que essa consulta precisa já existe.
2. **Cadastro e publicação de profissional e clínica**, com os campos da seção
   5.1 e as três camadas de validação da 8.1, deixando ONG e endereço de rua de
   fora até 9.1 e 9.2 serem respondidas.
3. **Nada de `Rede` e `Loja`** até a seção 7 deixar de ser "não existe".

---

## Onde ler o original

Tudo neste documento sai destas quatro fontes, e onde houver divergência **elas
mandam**:

| Assunto | Arquivo |
|---|---|
| As duas tabelas, coluna a coluna, com o motivo de cada decisão | `migrations/20260921000002_profissionais-e-verificacoes-de-entidade.sql` |
| As oito listas fechadas, por extenso, conferidas contra o banco | `tests/integration/conjunto-exato-dos-checks.test.ts` |
| Por que o diretório é assim, e o que foi descartado | `adr/ADR-0011-perfil-de-profissional-criado-pela-comunidade.md` |
| A fronteira entre os dois times | `adr/ADR-0023-fronteira-com-o-backoffice-do-diretorio.md` |

E, para as regras que atravessam tudo: `adr/ADR-0006` (sem geocodificação),
`adr/ADR-0010` (privacidade, e o que nunca sai), `adr/ADR-0016` (limite de
chamadas) e `adr/ADR-0021` (404 e nunca 403).

---
DÉDALO — Arquiteto de Software
