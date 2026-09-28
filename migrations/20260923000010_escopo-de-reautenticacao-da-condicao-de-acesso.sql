-- PROVISORIA (BICHUS-292): dobra na 20260923000006 quando a sessao
-- administrativa for redesenhada na feat/backoffice-acesso, e este arquivo
-- sai (decisao da coordenacao, 28/09).
--
-- `AdminReauthScope` no contrato tem cinco valores, e o CHECK de
-- `admin_reauth_tokens` so aceitava quatro. Sem `network_event_access_change`
-- a janela de reautenticacao de `changeAdminNetworkEventAccess` nunca seria
-- gravada, e a operacao ficaria inalcancavel.

-- Up Migration

ALTER TABLE admin_reauth_tokens
  DROP CONSTRAINT admin_reauth_tokens_escopo;

ALTER TABLE admin_reauth_tokens
  ADD CONSTRAINT admin_reauth_tokens_escopo
    CHECK (scope IN ('store_item_retirement', 'network_event_relocation',
                     'network_event_cancellation', 'network_event_removal',
                     'network_event_access_change'));

-- Down Migration

DELETE FROM admin_reauth_tokens WHERE scope = 'network_event_access_change';

ALTER TABLE admin_reauth_tokens
  DROP CONSTRAINT admin_reauth_tokens_escopo;

ALTER TABLE admin_reauth_tokens
  ADD CONSTRAINT admin_reauth_tokens_escopo
    CHECK (scope IN ('store_item_retirement', 'network_event_relocation',
                     'network_event_cancellation', 'network_event_removal'));
