-- O ENCONTRO DO PAINEL NASCE RASCUNHO (pedido do cliente, 15/11/2026)
--
-- Literal: *"preciso que novos eventos cadastrados sejam sempre salvos como
-- Rascunho, para depois eu aprovar manualmente depois"*.
--
-- O escopo foi fechado por ele na mesma conversa: o rascunho vale **so para os
-- encontros que ele cria no PAINEL**. O encontro criado por tutor no app
-- continua publicando direto, como ele decidiu em 17/10/2026 -- essa decisao
-- FICA DE PE, e esta migracao nao a toca.
--
-- ===========================================================================
-- POR QUE ISTO E UM ESTADO NOVO, E NAO UMA COLUNA DE "RASCUNHO"
-- ===========================================================================
--
-- `publication_status` nasceu em `20260928000001` respondendo SOZINHA a
-- pergunta "isto aparece?", e o comentario de la diz por que: *"`active
-- boolean` saiu: duas colunas para 'isto aparece?' divergem na primeira escrita
-- que atualizar so uma"*. Um `is_draft boolean` ao lado dela seria exatamente a
-- coluna que aquele comentario recusou. Entao o rascunho e VALOR na lista
-- fechada, e o ADR-0027 A.4 ja tinha previsto a forma: *"Um rascunho no futuro
-- e valor novo na lista, aditivo."*
--
-- ===========================================================================
-- O ESPELHO INVERTIDO DO `network_events_revisao_so_da_comunidade`
-- ===========================================================================
--
-- A `20260928000001` tinha um `CHECK network_events_revisao_so_da_comunidade`
-- amarrando `pending_review` a `origin = 'community'`, e a `20261001000005`
-- derrubou os dois quando o cliente desfez a fila de moderacao. O estado novo
-- pede a MESMA amarra, na direcao OPOSTA: `draft` so existe para
-- `origin = 'admin'`. Dai o nome, e dai a forma -- a mesma forma logica
-- (`origem OR estado <>`), para que quem ler as duas migracoes em sequencia veja
-- que e a mesma ideia virada do avesso.
--
-- A consequencia que importa: `draft` nao e um estado possivel para o encontro
-- da comunidade, em origem NENHUMA, e o banco recusa antes de qualquer caso de
-- uso. A decisao de 17/10/2026 fica garantida por invariante de banco, e nao
-- por disciplina de quem escreve codigo.
--
-- ===========================================================================
-- `published_at` NULO: O `CHECK` QUE JA EXISTIA JA CABE
-- ===========================================================================
--
-- `network_events_visivel_foi_publicado` e
--
--     CHECK (publication_status NOT IN ('published', 'cancelled')
--            OR published_at IS NOT NULL)
--
-- e `draft` NAO esta na lista dos dois. O rascunho com `published_at` nulo
-- satisfaz essa restricao sem reescrita nenhuma, e reescreve-la trocaria de
-- graca a definicao que `tests/integration/conjunto-exato-dos-checks.test.ts`
-- fixa. Por isso ela NAO e tocada aqui, e a ausencia e deliberada.
--
-- Ao publicar, `published_at` recebe o instante da publicacao -- e e a mesma
-- restricao acima que torna isso obrigatorio: sem `published_at`, o banco
-- recusa a passagem para `published`.
--
-- ===========================================================================
-- O TETO POR CONTA NAO MUDA, E ISTO FOI MEDIDO
-- ===========================================================================
--
-- `network_events_ativos_do_autor` (`20261001000005`, parte 2) conta encontro
-- publicado que ainda nao terminou, e a clausula dela e
--
--     WHERE created_by_user_id = p_autor
--       AND origin = 'community'
--       AND publication_status = 'published'
--
-- O rascunho e `origin = 'admin'` e `publication_status = 'draft'`: ele esta
-- fora dessa conta por DOIS filtros independentes, e nenhum dos dois precisou
-- mudar. O teto que de fato se move -- o balde `admin_publication` de 30 por
-- hora (D52) -- nao mora no banco: ele e `x-rate-limit` no contrato, e sai da
-- criacao para a publicacao junto com o aviso aos administradores.
--
-- ===========================================================================
-- NENHUMA LINHA EXISTENTE MUDA DE ESTADO
-- ===========================================================================
--
-- **Nao ha `UPDATE` nesta migracao, e a ausencia e a prova.** Acrescentar valor
-- a uma lista fechada so pode AFROUXAR o que ela aceita: toda linha que
-- satisfazia `IN ('published', 'cancelled', 'removed')` satisfaz
-- `IN ('draft', 'published', 'cancelled', 'removed')`, porque o conjunto antigo
-- e subconjunto do novo. Encontro que esta no ar continua `published`.
--
-- O `CHECK` novo tambem nao pode falhar por dado: ele so fala de `draft`, e
-- nenhuma linha pode estar em `draft` antes de este arquivo rodar -- o valor nao
-- existia. Por isso os dois entram VALIDADOS, e nao `NOT VALID`.
--
-- SOBRE O `down`: o rascunho nao cabe no esquema antigo, e por isso a descida o
-- APAGA, pelo mesmo raciocinio da `20261017000002` com o rascunho da `Loja` --
-- sao rascunhos, nunca estiveram no app, e `network_event_sizes`,
-- `network_event_amenities`, `network_event_bring_items` e
-- `network_event_images` saem por `ON DELETE CASCADE`. Apagar e mais honesto que
-- promover: publicar na descida poria no app um encontro que uma pessoa
-- deliberadamente deixou fora dele.

-- Up Migration

ALTER TABLE network_events
  DROP CONSTRAINT network_events_publicacao_conhecida,
  ADD CONSTRAINT network_events_publicacao_conhecida
    CHECK (publication_status IN ('draft', 'published', 'cancelled', 'removed')),
  ADD CONSTRAINT network_events_rascunho_so_do_painel
    CHECK (origin = 'admin' OR publication_status <> 'draft');

COMMENT ON CONSTRAINT network_events_rascunho_so_do_painel ON network_events IS
  'O espelho invertido do network_events_revisao_so_da_comunidade que a 20261001000005 apagou: `draft` so existe para origin = admin (decisao do cliente de 15/11/2026). O encontro da comunidade publica direto (ADR-0025 emenda 3) e nao tem rascunho em origem nenhuma.';

COMMENT ON COLUMN network_events.publication_status IS
  'Se o encontro aparece. Visivel e `published` ou `cancelled` (o cancelado sai com `status` `cancelled` ate o fim previsto e, depois dele, segue a regra do encerrado; decisao do cliente de 23/09). `removed` e terminal. `draft` existe SO PARA O PAINEL (decisao do cliente de 15/11/2026): o encontro criado no painel nasce `draft`, com `published_at` nulo, e so aparece no app depois de publishAdminNetworkEvent; o network_events_rascunho_so_do_painel impoe. A COMUNIDADE CONTINUA PUBLICANDO DIRETO, e nasce `published` (ADR-0025 emenda 3, 17/10/2026): nao ha revisao e nao ha rascunho para ela.';

-- O rascunho e o que a pessoa vai reencontrar na lista do painel para aprovar,
-- entao ele e um recorte que se consulta por si. Parcial porque so o rascunho
-- interessa: o indice fica do tamanho da fila de aprovacao, e nao do tamanho da
-- tabela.
CREATE INDEX network_events_rascunhos_do_painel
  ON network_events (created_at DESC)
  WHERE publication_status = 'draft';

COMMENT ON INDEX network_events_rascunhos_do_painel IS
  'A fila de aprovacao do painel (decisao do cliente de 15/11/2026): os rascunhos, do mais recente. Parcial de proposito -- so o rascunho entra.';

-- Down Migration

DROP INDEX network_events_rascunhos_do_painel;

-- O rascunho nao cabe no esquema antigo. Ver o cabecalho: apagar e mais honesto
-- que promover.
DELETE FROM network_events WHERE publication_status = 'draft';

COMMENT ON COLUMN network_events.publication_status IS
  'Se o encontro aparece. Visivel e `published` ou `cancelled` (o cancelado sai com `status` `cancelled` ate o fim previsto e, depois dele, segue a regra do encerrado; decisao do cliente de 23/09). `removed` e terminal. Nasce `published` tanto pelo painel quanto pela comunidade: nao ha rascunho (ADR-0027 12.9) e nao ha revisao (ADR-0025 emenda 3, 17/10/2026).';

ALTER TABLE network_events
  DROP CONSTRAINT network_events_rascunho_so_do_painel,
  DROP CONSTRAINT network_events_publicacao_conhecida,
  ADD CONSTRAINT network_events_publicacao_conhecida
    CHECK (publication_status IN ('published', 'cancelled', 'removed'));
