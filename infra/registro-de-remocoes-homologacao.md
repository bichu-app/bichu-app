> **Status:** aprovado
> **Atualizado:** 2026-09-22

# Registro de remoções irreversíveis em homologação

Este arquivo existe porque `pet_tags` não tem volta. O código da plaquinha é
guardado cifrado para reimpressão e o `DELETE` leva o cifrado junto: apagada a
linha, o código não é recuperável de lugar nenhum. Um registro que diga **o que**
foi apagado e **quando** é a única coisa que sobra depois.

**Nenhum código de plaquinha entra aqui.** Nem o código, nem `code_hash`, nem
`code_ciphertext`, nem `code_suffix`. O código é credencial: quem o tem abre a
página do pet. As colunas abaixo são identificadores internos e carimbos de
tempo, que não abrem nada.

Este registro vale para `homolog` (`bichu-hml`). Produção não aparece aqui e
não deve aparecer: remoção em produção não é operação de roteiro.

---

## 2026-09-22 — as duas tags de teste da massa inicial

**Autorização:** explícita do cliente, para **duas linhas de teste**, nesta data.

**O que foi medido antes de apagar**, e foi o que sustentou a decisão de seguir:

| Medida | Valor |
|---|---|
| Linhas em `pet_tags` | 2, ambas `active`; nenhuma `revoked` |
| Pets distintos | 2 (o banco inteiro tinha 2 pets e 1 usuário) |
| Conta dona | a mesma para as duas, e única conta do banco |
| Idade na hora da remoção | menos de 12 h; criadas com 11 min de diferença |
| `scan_count` / `last_scanned_at` | 0 e nulo nas duas |
| Linhas em `tag_scans` | 0 |
| `label` | vazio nas duas |

Duas tags criadas no mesmo dia, para dois pets de mesmo nome, da conta única de
um banco com um usuário, nunca lidas por ninguém. É massa de teste, e bate com
o que foi autorizado. Se qualquer uma dessas medidas tivesse vindo diferente —
uma terceira linha, uma leitura registrada, uma segunda conta — a remoção não
teria acontecido.

**O que foi apagado**, em uma transação, pelos ids, com `status = 'active'` no
`WHERE` (`DELETE 2`, `COMMIT`):

| `pet_tags.id` | `pet_id` | `status` | `created_at` (UTC) | apagada em (UTC) |
|---|---|---|---|---|
| `01a0c914-e762-7dff-9d46-ce7352643756` | `01a0c914-e71f-7414-ac65-da9232876aca` | `active` | 2026-09-22 12:26:25.511101+00 | 2026-09-23 00:24:27.010406+00 |
| `01a0c91f-77ec-7ec2-851c-c9a338598e56` | `01a0c91f-77ad-7706-9d4c-2f794ff4dc81` | `active` | 2026-09-22 12:37:57.868448+00 | 2026-09-23 00:24:27.010406+00 |

Os pets e a conta **não** foram tocados: a remoção foi só das plaquinhas.

**Por que foi preciso apagar.** `20260921000001_indice-cego-do-codigo-da-tag.sql`
troca o `code_hash` de SHA-256 sem sal por HMAC-SHA-256 com
`TAG_CODE_INDEX_KEY`, e recalcular o hash de uma tag exige decifrar
`code_ciphertext` com a `TAG_CODE_KEY` **daquele ambiente**. A migração tem
`RAISE EXCEPTION` quando encontra linha `active`, e está certa em ter: aplicar
sem recalcular deixaria toda tag existente apontando para um hash que ninguém
mais procura, e o sintoma seria 404 na página do achador, sem erro em lugar
nenhum. Em homologação, apagar a massa de teste é mais barato que recalcular.

**Estado depois:** `select count(*) from pet_tags` devolve 0, e a migração
`20260921000001` deixa de ter o que barrar.

---

## 2026-10-19 — as 30 plaquinhas do lote `massa-hml-2026-10-19`

**Status: PENDENTE.** As 30 plaquinhas **existem** em homologação desde
2026-10-19; a remoção delas ainda **não aconteceu** e só acontece quando o
cliente pedir a remoção da massa. Esta entrada é escrita ANTES, e não depois,
porque `pet_tags` não tem volta: o que está escrito aqui é o que vai sobrar
quando as linhas saírem, e escrevê-lo depois é escrevê-lo de memória.

**Autorização para criar:** o pedido do cliente de 19/10/2026 — *"cadastre uma
massa de 30 registros em cada aba […] mas deixe sinalizado, pois depois irei
pedir pra você deletar esses testes"*. A autorização para **apagar** é a dele,
quando vier, e não esta linha.

**Por que a massa precisou de plaquinha, e não é zelo.**
`conversations.found_report_id` é `NOT NULL` e `UNIQUE`, e não existe
`POST /conversations` — o próprio serviço registra que a abertura por aviso
*"é o único caminho de criação de conversa no sistema"*. Então 30 conversas
exigem 30 avisos de achado distintos. Dos dois caminhos de aviso:

| caminho | abre conversa | teto | serve? |
|---|---|---|---|
| `POST /v1/tags/{code}/found-reports` | **na hora** | nenhum `deny_429` | sim |
| `POST /v1/found-reports` (avulso) | só depois de o tutor confirmar uma correspondência | **10 por conta em 24 h, `deny_429`** | não, para 30 |

O avulso não cabe: um achador não consegue 30 avisos em 24 h. E o avulso exige
caso de perdido aberto, que exige foto `ready` no pet — e esta massa não sobe
imagem (ver o cabeçalho de `infra/massa-de-homologacao/criar.mjs`).

**O que foi medido na criação:**

| Medida | Valor |
|---|---|
| Linhas em `pet_tags` antes do lote | 4 (as dele) |
| Linhas criadas pelo lote | 30, todas `active` |
| Pets distintos | 6, todos da conta `@massateste01` do lote |
| Conta dona | `massateste01@exemplo-de-teste.invalid`, do próprio lote |
| `scan_count` na criação | 1 em cada (o aviso que abriu a conversa) |
| Linhas em `tag_scans` do lote | geradas pelo próprio aviso; apagadas por `tag_id` |
| `label` | nulo em todas |

**Os identificadores não ficam aqui, e isso é deliberado.** Eles vivem em
`infra/massa-de-homologacao/MANIFESTO-massa-hml-2026-10-19.json`, campo
`pet_tags`, com `id` e `pet_id` e **mais nada** — nem `code`, nem `code_hash`,
nem `code_ciphertext`, nem `code_suffix`, pela regra do topo deste arquivo. Duas
cópias da mesma lista divergiriam; o manifesto é a que a remoção lê.

**A ordem importa, e foi medida no catálogo e não lida da migração:**
`found_reports.tag_id` em homologação é **`ON DELETE RESTRICT`** (a migração
original escreveu `SET NULL`). O aviso de achado sai ANTES da plaquinha, ou o
`DELETE` reprova. `infra/massa-de-homologacao/remover.mjs` já apaga nessa
ordem, e a prova em Postgres descartável exercita exatamente isso.

**Quando a remoção acontecer**, quem a executar acrescenta aqui: a data, a
contagem por tabela que `remover.mjs` imprime, e o `id` da linha
`massa_de_teste.lote_removido` em `audit.events`.

---

## 2026-10-19 (acréscimo) — as 99 imagens e os 30 casos de perdido do mesmo lote

**Status: PENDENTE**, como a entrada acima. O acréscimo entrou em homologação em
2026-10-19 e sai junto com o resto do lote `massa-hml-2026-10-19`.

Esta entrada existe porque o acréscimo trouxe a **primeira coisa da massa que
não é linha de banco**: 99 objetos em dois baldes de armazenamento.

### Por que o manifesto não bastava, e por que não há prazo que resolva

O manifesto alcança linha. Os bytes vivem fora dele (ADR-0007), e **nada neste
repositório os varre** — medido em três lugares independentes:

1. `varrer-envios-vencidos.ts` varre **intenção não confirmada** (10 min de
   validade). Foto confirmada deixa aquela lista no instante em que vira
   `pet_photos`, então nunca é candidata. O cabeçalho do arquivo registra ainda
   a decisão do cliente de 17/10: *"Nenhum apagamento automático toca
   informação de perdido ou achado"*.
2. `apagar-objetos-da-conta.ts` — a única função do repositório que apaga objeto
   — está **desligada desde 17/10**, por decisão escrita do cliente
   (*"Mantenha a foto e não delete os dados do usuário, apenas desabilite na
   plataforma"*). O cabeçalho começa com "NINGUÉM CHAMA ESTA FUNÇÃO PARA APAGAR
   NADA".
3. O mesmo cabeçalho diz, sobre objeto sem ponteiro: *"Permanente, e não existe
   varredura de órfãos em lugar nenhum deste repositório"*.

Então a resposta à pergunta "o expurgo do projeto cuida disso, e em quanto
tempo?" é: **não cuida, e não há prazo.** Se a remoção apagasse só as linhas, os
99 objetos ficariam no balde para sempre, sem ponteiro — a chave só vive na
linha que teria saído.

Por isso `remover.mjs` ganhou uma fase 0 que apaga os objetos **antes** das
linhas, na ordem que `varrer-envios-vencidos.ts` prescreve (*"Objeto primeiro,
linha depois. Sempre."*), e o manifesto passou a guardar o par
`(classe, chave)` de cada um.

### O que foi medido na criação

| Medida | Valor |
|---|---|
| Fotos de pet criadas | 33, todas `ready` |
| Bytes das imagens | **438.424** no total — 385.996 nas 30 primeiras e 52.428 nas 3 extras (8.401 a 17.588 por imagem; média 13.286) |
| Objetos no armazenamento | **99** — 33 originais no balde privado, 66 derivadas (`thumb` + `card`) no público |
| Casos de perdido abertos | 30, todos `status = 'open'` e `share_to_public_list` |
| Casos com coordenada | 20 com ponto + cidade; 10 só com cidade |
| Cidades | 10 cidades em 6 estados; São Paulo com 9 |
| `pet_tags` adicionadas | 0 — as 30 da entrada acima continuam sendo as únicas |

As imagens foram **geradas pelo próprio programa** (`svgDaFoto` em
`massa.mjs`), 600 × 600 JPEG, sem texto — o container da aplicação não tem
fontconfig, então o número de cada uma entra como barras. Nenhuma foi baixada
de terceiro.

### A prova da remoção das imagens, contra o balde de verdade

`infra/massa-de-homologacao/prova-da-remocao-de-imagem.mjs`, executado em
homologação em 2026-10-19. Ela cria um **lote de sonda** próprio
(`prova-de-imagem-846551`: uma conta, um pet, uma foto, um caso), remove **só
ele** pelo manifesto, e mede o balde antes e depois:

| Medida | Antes | Depois |
|---|---|---|
| Objetos da sonda no balde | 3 de 3 | **0** |
| Objetos de fora no balde | 111 de 111 | **111 de 111** |
| `pet_photos` | 38 | 37 |
| `lost_cases` | 32 | 31 |
| `users` | 50 | 49 |

Os 111 de fora são os 99 da massa mais os 12 do cliente (4 fotos × 3 objetos).
A massa que o cliente está olhando entrou nessa prova **do lado do que não pode
ser tocado**, e não foi.

### O que continua alcançável depois de apagar, e precisa ser dito

As derivadas públicas são servidas com `cache-control: public,
max-age=31536000, immutable` — medido, não suposto — e o **ADR-0014 decidiu que
não existe operação de invalidação**. Quem tiver a URL exata e uma cópia em
cache continua vendo a imagem por até 12 meses depois do apagamento. Para massa
de teste isso não tem consequência; está escrito porque *"apagamos
completamente"* seria falso, e alguém vai copiar esta frase daqui.

### Quando a remoção acontecer

Quem a executar acrescenta aqui: a data, o `objetos_apagados` que
`remover.mjs` imprime (deve ser 99), a contagem por tabela, e o `id` da linha
`massa_de_teste.lote_removido` em `audit.events` cujo `resource_id` é
`massa-hml-2026-10-19`.

> **Atenção ao ler a trilha:** há uma linha `massa_de_teste.lote_removido` de
> 2026-10-20 00:48 com esse mesmo `resource_id`. Ela **não** é a remoção da
> massa: é o desfazimento de uma primeira execução que parou no meio, antes de o
> lote definitivo subir às 00:49. A linha `massa_de_teste.lote_criado` é
> posterior a ela, e a ordem por `occurred_at` conta a história.
