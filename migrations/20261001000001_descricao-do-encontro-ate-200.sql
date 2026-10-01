-- A descricao do encontro da `Rede` passa de 180 para 200 caracteres (pedido
-- do cliente de 01/10/2026, ajustes do encontro, item 1).
--
-- A "Descricao" do painel e a coluna `network_events.summary`. Ela nasceu com
-- o mesmo teto de `store_items.summary` (180), porque os dois cartoes viviam na
-- mesma listagem; a Loja continua em 180 e so o encontro muda.
--
-- O QUE ESTA MIGRACAO FAZ COM DADO EXISTENTE: nada. O `CHECK` e ALARGADO, nao
-- apertado: toda linha que existe passou pelo teto antigo de 180, e portanto
-- cabe em 200. Nenhuma linha e lida para ser reescrita, nenhuma e truncada. O
-- `ADD CONSTRAINT` confere as linhas existentes contra o teto novo, e isso
-- nao recusa nenhuma pela mesma razao. O teto e aplicado na escrita
-- (`TETO_DA_DESCRICAO` em `rede-administrativa.ts` e `maxLength: 200` no
-- contrato).
--
-- O que NAO esta aqui, e por que:
-- - `venue_name`: `place_name` JA e o nome do lugar ("Nome do local" no
--   painel), e o produto nao guarda endereco (ADR-0010 item 2, ADR-0027 item
--   13, `AdminNetworkEventPlaceInput`). Separar nome de endereco e criar o
--   endereco, e isso e decisao, nao coluna.
-- - preco/vagas por humano e pet, link de convite e Instagram: esperam o
--   cliente.

-- Up Migration

ALTER TABLE network_events
  DROP CONSTRAINT network_events_resumo_tem_tamanho,
  ADD CONSTRAINT network_events_resumo_tem_tamanho
    CHECK (char_length(btrim(summary)) BETWEEN 2 AND 200);

COMMENT ON COLUMN network_events.summary IS
  'A descricao do encontro ("Descricao" no painel), de 2 a 200 caracteres. Era 180, o numero de `store_items.summary`; alargado em 01/10/2026 a pedido do cliente.';

-- Down Migration

-- `NOT VALID` de proposito: voltar a 180 nao pode recusar a descricao de 181 a
-- 200 que ja tenha sido gravada. O teto antigo volta a valer para escrita nova.
ALTER TABLE network_events
  DROP CONSTRAINT network_events_resumo_tem_tamanho,
  ADD CONSTRAINT network_events_resumo_tem_tamanho
    CHECK (char_length(btrim(summary)) BETWEEN 2 AND 180) NOT VALID;

COMMENT ON COLUMN network_events.summary IS NULL;
