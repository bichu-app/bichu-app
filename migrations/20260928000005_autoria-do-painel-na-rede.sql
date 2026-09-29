-- Autor e decisor do painel na `Rede` (ADR-0027 item 20.2, apendices A.4 e
-- A.6; fatia 7 do item 20.7).
--
-- POR QUE ESTA MIGRACAO EXISTE, E NAO UMA EDICAO DA 20260928000001: as duas
-- colunas apontam para `admin_accounts`, que nasce na 20260928000002, depois
-- da migracao da `Rede`. Uma chave estrangeira nao pode nascer antes da
-- tabela que ela referencia.
--
-- O QUE ELA FAZ:
--
-- - `network_events.created_by_admin_id`: quem criou o encontro do painel.
--   Leva a marca que `portao-colunas-que-nao-saem.ts` le, a mesma de
--   `created_by_user_id`: quem criou e dado de trilha, nao de vitrine.
-- - Dois `CHECK` que amarram cada autor a sua origem: autor de `users` so em
--   encontro `community`, autor de `admin_accounts` so em encontro `admin`.
--   A massa grava encontro `admin` com os dois nulos, e isso continua valendo.
-- - `network_event_join_requests.decided_by_admin_id`: quem decidiu o pedido e
--   conta do painel, nunca de `users` (a 20260928000001 ja nao cria
--   `decided_by_user_id`).
--
-- Sem `ON DELETE`: conta do painel nao se apaga, desativa (item 20.1).

-- Up Migration

ALTER TABLE network_events
  ADD COLUMN created_by_admin_id uuid REFERENCES admin_accounts (id),
  ADD CONSTRAINT network_events_autor_da_comunidade
    CHECK (created_by_user_id IS NULL OR origin = 'community'),
  ADD CONSTRAINT network_events_autor_do_painel
    CHECK (created_by_admin_id IS NULL OR origin = 'admin');

COMMENT ON COLUMN network_events.created_by_admin_id IS
  'QUEM CRIOU O ENCONTRO DO PAINEL (admin_accounts). NUNCA sai do servidor, em nenhuma resposta, nem a administrativa (ADR-0027 A.4, item 20.2). Existe para a trilha e para resposta a abuso.';

ALTER TABLE network_event_join_requests
  ADD COLUMN decided_by_admin_id uuid REFERENCES admin_accounts (id);

COMMENT ON COLUMN network_event_join_requests.decided_by_admin_id IS
  'Quem decidiu o pedido, conta do painel (ADR-0027 A.6, item 20.2). Nunca projetado.';

-- Down Migration

ALTER TABLE network_event_join_requests
  DROP COLUMN decided_by_admin_id;

ALTER TABLE network_events
  DROP CONSTRAINT network_events_autor_do_painel,
  DROP CONSTRAINT network_events_autor_da_comunidade,
  DROP COLUMN created_by_admin_id;
