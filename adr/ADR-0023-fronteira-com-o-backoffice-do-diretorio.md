# ADR-0023: A fronteira entre o Bichu e o backoffice de outra esteira

**Status:** proposto — três itens dependem de decisão do cliente
**Data:** 2026-09-22

## Contexto

O cliente vai construir um backoffice **em outra esteira de desenvolvimento,
com outro time**, para alimentar as seções `Loja`, `Rede` e `Perto`. O nosso
lado é o da leitura. Esta é a primeira vez que este produto tem duas equipes
escrevendo no mesmo domínio, e a decisão que precisa ser tomada agora não é
sobre colunas: é sobre **onde passa a linha**.

O estado medido em 22/09, e ele muda o tamanho do trabalho:

| Seção | Tabelas no banco | Linhas de `src/` que as usam | Sub-destinos construídos |
|---|---|---|---|
| `Perto` | `professionals`, `entity_verifications`, desde `20260921000002` | **zero** | 1 de 8 (a porta das ONGs, que leva a uma casca) |
| `Rede` | **nenhuma** | — | 0 de 4 |
| `Loja` | **nenhuma** | — | 0 de 6 |

`professionals` e `entity_verifications` existem, com cinco e três listas
fechadas declaradas por extenso em
`tests/integration/conjunto-exato-dos-checks.test.ts`, e **nenhuma rota, nenhum
repositório e nenhuma interface de Kysely** as alcança. A migração andou e o
código não. Não é defeito: o ADR-0011 mandou nascerem vazias e sem fluxo. É o
ponto de partida.

O risco concreto deste momento: se o time do backoffice começar a alimentar um
painel contra um esquema que ainda vamos mexer, os dois lados quebram, e quem
paga é o time deles, que não tem como saber o que mudou.

## Decisão

Três decisões de fronteira, na ordem em que uma depende da anterior.

### 1. O backoffice escreve por **API**, nunca direto no banco

**Decisão: o backoffice não recebe credencial de Postgres.** Ele escreve por um
conjunto de operações `/v1/admin/...` servidas por este backend, autenticadas
com `bearerAuth` e um papel em `user_roles`.

O motivo não é preferência de arquitetura. É que **todo portão que este produto
tem mora do nosso lado da conexão**, e uma escrita direta passa por baixo de
todos eles. Quatro casos, cada um verificável hoje:

1. **`professionals.verification_level` é derivado.** A migração diz, em
   comentário de coluna, que ele nunca é escrito à mão por rota de escrita de
   perfil: ele sai da verificação aprovada mais forte em `entity_verifications`.
   Um `CHECK` não enxerga outra tabela, então o banco aceita
   `verification_level = 'document_verified'` numa entidade sem nenhuma
   verificação aprovada. Com conexão direta, esse campo vai ser escrito à mão no
   primeiro dia, porque é uma coluna, e colunas se escrevem. E aí o selo passa a
   afirmar, para quem lê o app, algo que ninguém provou.
2. **`entity_verifications.entity_id` não tem chave estrangeira, de propósito.**
   A tabela é polimórfica (ADR-0011, revisão de 17/09) e o Postgres não expressa
   FK condicional ao valor de outra coluna. A migração escreve isso e nomeia a
   consequência: *a integridade fica na aplicação*. Um escritor que não passa
   pela aplicação não tem integridade nenhuma — ele aponta uma verificação para
   um UUID que não existe e nada acusa.
3. **A redação de dado sensível acontece na escrita, não na leitura.** É a regra
   de `pets.care_notes`, e a migração explica por quê: dado sensível gravado em
   claro já vazou para todo backup e todo log de replicação. O que valer para
   `professionals.about` precisa rodar no mesmo lugar. Escrita direta pula.
4. **A trilha de auditoria é esquema próprio, com papel de banco sem `UPDATE`
   nem `DELETE`** (ADR-0010). Aprovar um CRMV é exatamente a decisão que precisa
   ficar auditável, com quem decidiu e quando. `INSERT` direto não deixa rastro
   em `audit.events`.

**Se o cliente decidir pelo acesso direto assim mesmo**, o mínimo que torna isso
sobrevivível, e que é trabalho nosso:

- papel de banco separado, com `INSERT`/`UPDATE` apenas nessas tabelas e nenhum
  `SELECT` em `users`, `pets` ou `audit`;
- `verification_level` deixa de ser coluna escrita e passa a ser mantida por
  gatilho sobre `entity_verifications`, para que a mão de ninguém a alcance;
- uma `VIEW` estável por tabela, e o contrato passa a ser a `VIEW`, não a
  tabela. É o que permite renomear coluna sem quebrar o painel deles.

Registro a recomendação e o custo: o acesso direto economiza o trabalho de
escrever as operações de escrita, e gasta as quatro proteções acima mais o
versionamento do item 3. **Não recomendo.**

### 2. Dado ruim é recusado na escrita, e **publicar é um ato separado de criar**

A pergunta real é "endereço sem cidade, telefone inválido, profissional sem
verificação: recusa na escrita, ou entra e a leitura filtra?". A resposta em uma
linha só está errada, porque os três casos não são a mesma coisa.

**Decisão, em três camadas:**

1. **Regra de campo: recusa na escrita**, com `400 validation-failed`. Tudo que
   o banco já fecha por `CHECK` é recusado antes de chegar ao banco, com a
   mensagem dizendo qual campo: UF com dois caracteres, CNPJ com catorze
   dígitos, telefone em E.164, `display_name` entre 2 e 120, `about` até 2000.
   Deixar o `CHECK` responder pela aplicação devolve `23514` ao painel deles, que
   é um erro de banco vazando como se fosse resposta de API.
2. **Regra de completude: o rascunho é permitido, a publicação não.**
   `professionals.status` já nasce `'draft'` e tem `'published'`. Um registro
   incompleto **pode existir** como rascunho — é assim que alguém salva o que
   digitou até aqui. O que a API recusa é a **transição para `published`** sem o
   conjunto completo: `city` e `state` preenchidos, pelo menos um canal de
   contato, e, se a entrada quiser aparecer ordenada por distância, `geo`.
   Isso responde "endereço sem cidade" sem obrigar o painel deles a ter formulário
   tudo-ou-nada.
3. **A leitura não filtra qualidade. Ela filtra `status = 'published'`, e só.**
   Um filtro de qualidade do lado da leitura é uma segunda definição de
   "completo", invisível, que vai divergir da primeira — e no dia em que
   divergir ninguém vai saber qual das duas está certa. Os índices parciais da
   migração já assumem essa regra: os três são `WHERE status = 'published'`.

**"Profissional sem verificação" não é dado ruim.** `verification_level = 'none'`
é estado legítimo e publicável. Recusar a publicação de quem não tem CRMV
esvaziaria o diretório de dog walker, sitter, tosador e adestrador, atividades
que **não têm conselho nem registro obrigatório** (ADR-0011). O que a interface
faz é dizer o que foi verificado, nunca exibir selo genérico.

### 3. Versionamento: o contrato é `api/openapi.yaml`, e a quebra é barrada na esteira

**Decisão:** a fonte da verdade para o time deles é a especificação OpenAPI 3.1
versionada em `api/openapi.yaml`, publicada conforme o ADR-0018. Não é um
documento paralelo, não é uma mensagem, e não é a migração.

Como eles descobrem que algo mudou, sem depender de alguém lembrar de avisar:

- **A esteira já compara.** O job de contrato roda `oasdiff breaking` entre a
  especificação da branch e a do ref base, e `oasdiff changelog` no resumo da
  execução (`.github/workflows/ci.yml`). Uma mudança incompatível **não passa**
  do nosso lado. Isso deixa de ser detalhe nosso e vira a garantia deles.
- **Dentro de `/v1`, só acréscimo.** Campo novo, valor novo em lista fechada,
  operação nova. Remoção de campo, mudança de tipo e estreitamento de lista
  fechada exigem `/v2`.
- **Acrescentar valor a uma lista fechada é sempre três arquivos no mesmo
  commit**: a migração, a entrada por extenso em
  `tests/integration/conjunto-exato-dos-checks.test.ts`, e o `enum` da
  especificação. O teste afirma o conjunto **exato** nos dois sentidos — valor
  que sai reprova, e valor que entra sem alguém declarar reprova também. O time
  deles precisa saber disso porque é o que garante que um valor novo é sempre
  deliberado, nunca acidental.
- **Janela de descontinuação: 30 dias** entre anunciar e remover, e o campo
  descontinuado sai da especificação com `deprecated: true` nesse intervalo.
  Trinta dias é o mesmo número que o produto já usa para a validade da
  localização (ADR-0006) e para o preço de referência; um número diferente aqui
  seria um número a mais para alguém decorar.
- **Um contato nomeado de cada lado.** Esteira verde não avisa ninguém; ela
  apenas impede o pior. Quem responde pelo contrato do nosso lado e quem recebe
  o aviso do lado deles é pendência de processo, não de código, e está registrada
  como tal.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Backoffice escreve direto no Postgres | zero trabalho nosso de escrita; o outro time anda sozinho | pula os quatro portões do item 1; `verification_level` vira decorativo; sem trilha de auditoria; renomear coluna quebra o painel sem aviso | o custo cai inteiro sobre o time deles, que não tem como enxergá-lo |
| Direto no banco, mas só em `VIEW`s | desacopla o nome da coluna | resolve só o versionamento, e nenhum dos outros três problemas; e `INSERT` em `VIEW` exige `INSTEAD OF`, que é lógica de aplicação escrita em PL/pgSQL, sem teste e sem dono | troca um monólito distribuído por um pior |
| Fila ou arquivo de importação entre os dois lados | desacopla no tempo | acrescenta uma superfície sem contrato e adia o erro para quando ninguém está olhando; e a escrita do diretório não tem volume que justifique | acoplamento temporal não é o problema aqui |
| Nada muda: o catálogo continua versionado no repositório (BICHUS-189) | decisão já fechada, custo zero | é a resposta certa **se não houver backoffice**. Com backoffice, um catálogo em arquivo obriga o time deles a abrir PR neste repositório para publicar um produto | o pedido do cliente contradiz a decisão fechada, e isso precisa ser dito, não contornado |
| Recusar tudo que não estiver completo, já na criação | invariante simples | o painel deles perde o rascunho, e formulário tudo-ou-nada em cadastro longo é como o operador desiste no meio | a completude pertence à publicação, não à existência |

## Consequências

**Fica mais fácil:** o time deles trabalha contra um documento com exemplos, um
simulador gerado da própria especificação, e uma esteira que reprova a quebra
antes de ela chegar. E a integridade do diretório continua tendo um dono só.

**Fica mais difícil:** existem operações de escrita a construir deste lado, e
elas não existiam no plano. Elas são o preço das quatro proteções, e o preço é
menor do que parece porque a leitura precisa do mesmo módulo e do mesmo
repositório.

**Passa a ser irreversível:** a partir da primeira linha em `professionals`, o
`down` da migração `20260921000002` deixa de ser reversão e vira perda — de
perfil aceito por uma pessoa e de evidência de verificação. A própria migração
diz isso. **Ligar o diretório é o evento que torna essa migração definitiva**, e
quem for descê-la com dado dentro precisa exportar antes.

**Uma armadilha medida hoje, que vai atingir quem implementar primeiro:**
`src/tools/portao-colunas-que-nao-saem.ts` lê as colunas marcadas direto do
`COMMENT ON COLUMN` das migrações e varre **todo** `.ts` e `.mjs` de `src/`
procurando o nome literal, dispensando apenas dois arquivos (ele mesmo e o teste
dele). Hoje a única coluna marcada é `professionals.created_by_user_id`, e o
portão está verde porque `src/shared/db/schema.ts` não tem interface para a
tabela. **No instante em que alguém escrever `ProfessionalsTable` com todas as
colunas, o build reprova.** A saída certa é omitir essa coluna da interface — a
aplicação nunca a lê nem a escreve, que é o ponto do ADR-0011 seção 4 — e **não**
acrescentar `schema.ts` à lista de dispensados, que desligaria o portão para
todas as colunas futuras. Pela mesma razão, `claimed_by_user_id` deveria ganhar
a marca numa migração, e não ganhou.

**Risco alto, registrado:** `Loja` e `Rede` não têm tabela nenhuma. Enquanto as
três decisões acima valem para `Perto` desde já, para as outras duas elas valem
para um esquema que ainda não foi desenhado. Alimentar `Loja` por backoffice
reabre a BICHUS-189, que foi fechada como catálogo versionado no repositório, e
essa reabertura é do cliente, não minha.

---
DÉDALO — Arquiteto de Software
