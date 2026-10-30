-- A DUVIDA ATENDIDA -- MUDANCA DE ESTADO, E NUNCA `DELETE`.
--
-- Decisao do cliente, 30/10/2026. Na conversa de 29/10 ele escolheu que a
-- duvida *"grava no banco e vai para o backoffice"*; perguntado se a fila
-- precisava de estado, ele respondeu que **sim: quer marcar a duvida como
-- atendida**, com a contagem do que falta no menu do painel.
--
-- ====================================================================
-- DUAS COLUNAS, E ELAS ANDAM JUNTAS
-- ====================================================================
--
-- `attended_at` e **coluna de DATA e nao booleano**, como `dismissed_at` em
-- `notification_items`, `deleted_at` em `users` e `revoked_at` em `pet_tags`:
-- "quando" responde perguntas que "se" nao responde, e nenhuma delas custa uma
-- coluna a mais. Nula = na fila.
--
-- `attended_by_admin_id` e **quem marcou**, e existe porque a decisao do
-- cliente pede transicao AUDITAVEL. A trilha (`audit.events`) ja grava a acao,
-- mas ela nao e lida pelo painel: a coluna e o que a TELA mostra, e e o que
-- responde "quem atendeu isto?" sem abrir a trilha.
--
-- As duas sao um estado so, e o `CHECK` abaixo o diz: nao existe duvida
-- atendida sem quem a atendeu, nem autor de atendimento sem instante. Sem ele,
-- um `UPDATE` que esquecesse uma das colunas deixaria a linha num estado que
-- nenhuma tela sabe desenhar.
--
-- ====================================================================
-- `NO ACTION` NA CONTA DO PAINEL, e a razao ja esta escrita nesta casa
-- ====================================================================
--
-- Mesma acao de `network_events.created_by_admin_id` e de
-- `network_event_join_requests.decided_by_admin_id`, com o motivo que
-- `CHAVES_ESTRANGEIRAS` registra para as duas: *"conta do painel nao se apaga,
-- desativa; a trava (`NO ACTION`) e o que faz um expurgo operacional parar em
-- vez de apagar a autoria"*.
--
-- `CASCADE` apagaria a duvida do tutor porque um operador saiu, e `SET NULL`
-- apagaria a autoria deixando o atendimento orfao -- os dois perdem o que esta
-- coluna existe para guardar.
--
-- ====================================================================
-- NAO EXISTE DESFAZER, E ISSO E DECISAO E NAO ESQUECIMENTO
-- ====================================================================
--
-- A rota que acompanha esta migracao **so marca**, e nao desmarca. O cliente
-- pediu marcar como atendida; desmarcar e outra decisao, e ela tem peso
-- proprio -- "atendida" e afirmacao de uma pessoa sobre o trabalho dela, e
-- apaga-la sem registro e o tipo de reescrita de historia que "nao apague
-- nada" existe para impedir.
--
-- Se ele pedir, o caminho JA ESTA ABERTO e e barato: outra operacao
-- administrativa, com a sua propria acao de trilha, zerando as duas colunas --
-- e, se ele quiser a memoria das idas e vindas, uma tabela de transicoes. O
-- que esta migracao nao faz e escolher isso por ele.
--
-- **Nada aqui apaga linha.** Nao ha `DELETE`, nao ha expurgo por prazo e nao
-- ha `ON DELETE CASCADE` novo.

-- Up Migration

ALTER TABLE help_requests
  -- Nula = na fila. O painel recorta por `attended_at IS NULL`.
  ADD COLUMN attended_at timestamptz,
  -- Quem marcou. `NO ACTION` por omissao, de proposito: ver o cabecalho.
  ADD COLUMN attended_by_admin_id uuid REFERENCES admin_accounts (id),
  -- As duas sao um estado so.
  ADD CONSTRAINT help_requests_atendida_tem_autor
    CHECK ((attended_at IS NULL) = (attended_by_admin_id IS NULL));

-- A FILA DO QUE FALTA, que e a leitura que o painel abre por padrao e a que o
-- numerinho do menu conta. Parcial: o indice so carrega as linhas abertas, que
-- sao as unicas que as duas consultas olham, e ele nao cresce com o arquivo.
CREATE INDEX help_requests_na_fila
  ON help_requests (created_at DESC)
  WHERE attended_at IS NULL;

COMMENT ON COLUMN help_requests.attended_at IS
  'Quando alguem do painel marcou a duvida como atendida. NULA = na fila. Coluna de DATA e nao booleano, como dismissed_at em notification_items: "quando" responde o que "se" nao responde. Decisao do cliente de 30/10/2026. MUDANCA DE ESTADO E NUNCA DELETE: a linha atendida continua na tabela, e so sai da aba aberta. Anda junto com attended_by_admin_id, e o CHECK help_requests_atendida_tem_autor cobra as duas.';

COMMENT ON COLUMN help_requests.attended_by_admin_id IS
  'Quem marcou como atendida, em admin_accounts e NUNCA em users: a conta do painel nao e conta do app (ADR-0027 item 20.2). Sem ON DELETE, logo NO ACTION, pelo mesmo motivo de network_events.created_by_admin_id: conta do painel nao se apaga, desativa, e a trava e o que faz um expurgo operacional parar em vez de apagar a autoria. A trilha em audit.events grava a acao; esta coluna e o que a TELA mostra, porque o painel nao le a trilha.';

-- Down Migration

DROP INDEX help_requests_na_fila;

ALTER TABLE help_requests
  DROP CONSTRAINT help_requests_atendida_tem_autor,
  DROP COLUMN attended_by_admin_id,
  DROP COLUMN attended_at;
