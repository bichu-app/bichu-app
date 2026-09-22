-- BICHUS-125: `logout_all` entra na lista de motivos de revogacao.
--
-- A emenda 1 do ADR-0002 separa dois verbos que ate agora tinham um motivo so:
-- "Sair" revoga a familia daquele aparelho, e "Sair de todos os aparelhos"
-- revoga todas as familias da conta. Gravar os dois como `logout` apagaria da
-- trilha exatamente a distincao que a emenda existe para fixar -- e quem for
-- investigar uma tomada de conta precisa saber se a pessoa encerrou UM aparelho
-- ou pediu para derrubar a conta inteira.
--
-- `password_changed` cobre a troca e a redefinicao de senha, e `account_deleted`
-- cobre a exclusao. O quarto gatilho do SEC-006 e este.

ALTER TABLE refresh_tokens
  DROP CONSTRAINT refresh_tokens_revoked_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout', 'logout_all',
    'password_changed', 'account_deleted'));

COMMENT ON COLUMN refresh_tokens.revoked_reason IS
  'Por que a linha morreu. `logout` e um aparelho; `logout_all` e a conta inteira (ADR-0002 emenda 1). Sem os dois, a trilha nao distingue os dois verbos.';

-- Down Migration

-- A volta so e possivel se nenhuma linha ja carregar o motivo novo: a restricao
-- antiga o recusaria. Falhar alto aqui e o comportamento certo -- uma reversao
-- que apagasse o motivo em silencio perderia o registro de uma revogacao real.
ALTER TABLE refresh_tokens
  DROP CONSTRAINT refresh_tokens_revoked_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout',
    'password_changed', 'account_deleted'));
