-- BICHUS-56 — trilha de auditoria em esquema separado, com papel de banco
-- proprio.
--
-- Trilha no mesmo lugar e com o mesmo acesso do log da aplicacao nao serve para
-- o que auditoria existe. Por isso tres coisas, e nenhuma das tres sozinha
-- basta:
--
--   1. esquema `audit`, separado do dominio;
--   2. papel `bichu_audit_writer` com INSERT e SELECT e SEM UPDATE nem DELETE,
--      que e o papel que a aplicacao assume (`SET LOCAL ROLE`) antes de gravar;
--   3. papel `bichu_audit_purger`, separado, que so o expurgo de 24 meses usa.
--
-- O papel e IDENTIDADE DE INFRAESTRUTURA, nao esquema versionado: a criacao
-- consulta o catalogo antes de criar (e nao trata excecao de objeto duplicado,
-- que nunca seria alcancada num ambiente onde o migrador nao tem CREATEROLE), e
-- o `down` revoga o que concedeu sem apagar identidade que ele nao criou.

-- Up Migration

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE audit.events (
  id             uuid        PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor_kind     text        NOT NULL CHECK (actor_kind IN ('user', 'anonymous', 'system')),
  -- Ator e SEMPRE o UUID interno, nunca o e-mail (criterio 3). Nao ha chave
  -- estrangeira para `users`: a trilha precisa sobreviver a exclusao da conta
  -- que ela documenta, e FK com CASCADE apagaria exatamente a evidencia do
  -- pedido de exclusao.
  actor_user_id  uuid,
  -- HMAC com chave secreta, nao SHA-256 simples (SEC-010): o espaco IPv4 tem
  -- 4 bilhoes de valores e hash sem chave se reverte por forca bruta em
  -- minutos, o que faria a trilha guardar IP em claro achando que anonimizou.
  actor_ip_hmac  bytea,
  correlation_id uuid,
  action         text        NOT NULL,
  resource_kind  text        NOT NULL,
  resource_id    text,
  before         jsonb,
  after          jsonb,
  metadata       jsonb,
  CONSTRAINT audit_events_ator_coerente
    CHECK ((actor_kind = 'user') = (actor_user_id IS NOT NULL))
);

-- O expurgo varre por data; a investigacao de incidente parte do ator, da
-- correlacao ou do recurso.
CREATE INDEX audit_events_occurred_at   ON audit.events (occurred_at);
CREATE INDEX audit_events_ator          ON audit.events (actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;
CREATE INDEX audit_events_correlacao    ON audit.events (correlation_id)
  WHERE correlation_id IS NOT NULL;
CREATE INDEX audit_events_recurso       ON audit.events (resource_kind, resource_id);

COMMENT ON TABLE audit.events IS
  'Trilha imutavel. Retencao de 24 meses. Consulta restrita: ver docs/04-seguranca.md 9.';

-- Papeis. Consulta ao catalogo ANTES de criar: `CREATE ROLE` protegido por
-- EXCEPTION WHEN duplicate_object parece idempotente e nao e, porque o banco
-- checa privilegio antes de existencia e num ambiente sem CREATEROLE o erro
-- levantado e outro.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'bichu_audit_writer') THEN
    CREATE ROLE bichu_audit_writer NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'bichu_audit_purger') THEN
    CREATE ROLE bichu_audit_purger NOLOGIN;
  END IF;
END
$$;

-- Ninguem tem nada por padrao. `PUBLIC` inclui todo papel de login do banco.
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
REVOKE ALL ON audit.events FROM PUBLIC;

GRANT USAGE ON SCHEMA audit TO bichu_audit_writer, bichu_audit_purger;

-- O papel da aplicacao: grava e le, e so. A ausencia de UPDATE e DELETE aqui e
-- o criterio 8 da historia, e ela vale porque a aplicacao assume este papel com
-- `SET LOCAL ROLE` antes de escrever — um papel de login que seja dono da
-- tabela contorna qualquer GRANT, e dono e o migrador, nao a aplicacao.
GRANT INSERT, SELECT ON audit.events TO bichu_audit_writer;

-- O expurgo de 24 meses e a UNICA operacao autorizada a remover linha, e ela
-- vive num papel separado justamente para que o caminho normal da aplicacao nao
-- carregue essa permissao.
GRANT SELECT, DELETE ON audit.events TO bichu_audit_purger;

-- A aplicacao precisa poder assumir os dois papeis. `CURRENT_USER` aqui e o
-- papel que roda a migracao, que e o mesmo com que a aplicacao se conecta no
-- ambiente local; em ambiente onde forem diferentes, a concessao e feita pela
-- provisao de infraestrutura e nao por esta migracao.
GRANT bichu_audit_writer, bichu_audit_purger TO CURRENT_USER;

-- Down Migration

-- Revoga o que concedeu. NAO apaga os papeis: identidade de infraestrutura nao
-- e propriedade desta migracao, e apagar um papel que outro ambiente usa e um
-- estrago que o `down` nao tem como desfazer.
REVOKE ALL ON audit.events FROM bichu_audit_writer, bichu_audit_purger;
REVOKE ALL ON SCHEMA audit FROM bichu_audit_writer, bichu_audit_purger;

DROP TABLE IF EXISTS audit.events;
DROP SCHEMA IF EXISTS audit;
