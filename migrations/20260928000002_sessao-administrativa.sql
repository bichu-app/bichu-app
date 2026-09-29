-- ADR-0027 item 20: o backoffice tem contas PROPRIAS, separadas das do app
-- (decisao do cliente de 28/09). Reescrita no lugar: a forma de 23/09 punha o
-- administrador em `users` com papel em `user_roles`, e esta migracao nunca
-- chegou a `development`.
--
-- O que ela faz, em ordem:
--
--   1. estreita `user_roles` a `tutor`, e ABORTA se houver linha com outro
--      papel (bloco comentado abaixo);
--   2. cria `admin_accounts`, o cadastro do painel (item 20.1);
--   3. cria `admin_sessions` e `admin_reauth_tokens` presas a ela, nunca a
--      `users` (apendice A.1);
--   4. cria `admin_session_alerts`, o "nao fui eu" do painel (D62);
--   5. ensina `audit.events` a registrar o ator administrativo, com coluna
--      propria (apendice A.5).
--
-- **Nenhuma tabela `admin_*` tem chave estrangeira para `users`.** A separacao
-- e do esquema, e nao de uma recusa escrita em cada porta: o login do app nao
-- acha a conta do painel, e o do painel nao acha a do app (D42, P21). O teste
-- de catalogo de P21 reprova se alguem acrescentar uma.

-- Up Migration
--
-- O marcador acima e obrigatorio (BICHUS-125): sem ele o `node-pg-migrate`
-- manda o arquivo inteiro como subida e a descida roda logo em seguida.

-- ---------------------------------------------------------------------------
-- 1. `user_roles` passa a aceitar so `tutor`.
-- ---------------------------------------------------------------------------
--
-- POR QUE ABORTAR, E NAO APAGAR. Uma linha `admin` ou `moderator` aqui e uma
-- conta do app a quem alguem deu poder de painel pela forma antiga. Apaga-la em
-- silencio tiraria esse poder sem ninguem saber, e o `CHECK` novo, sozinho,
-- falharia com uma mensagem generica de violacao que nao diz qual linha nem o
-- que fazer. Nenhum banco compartilhado tem essa linha (o `conceder-papel` que
-- a criaria nunca foi mesclado), entao o aborto e o caminho que so dispara
-- onde ha algo para uma pessoa decidir.
--
-- A mensagem nomeia ate vinte linhas (`user_id` e papel) e diz o remedio. O
-- `SQLSTATE` e `23514` (violacao de CHECK), o mesmo que o `ALTER` levantaria,
-- para quem trata erro por codigo nao ver outra coisa.
DO $$
DECLARE
  total   integer;
  amostra text;
BEGIN
  SELECT count(*),
         string_agg(format('user_id=%s papel=%s', user_id, role), '; ' ORDER BY user_id, role)
           FILTER (WHERE rn <= 20)
    INTO total, amostra
    FROM (SELECT user_id, role, row_number() OVER (ORDER BY user_id, role) AS rn
            FROM user_roles
           WHERE role <> 'tutor') AS fora;

  IF total > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format(
        'migracao 20260928000002 abortada: user_roles tem %s linha(s) com papel diferente de tutor: %s',
        total, amostra),
      DETAIL  = 'Desde o ADR-0027 item 20 o painel tem cadastro proprio (admin_accounts) e user_roles aceita so tutor. '
             || 'Nada foi alterado: a migracao inteira foi desfeita.',
      HINT    = 'Para cada linha listada: (1) se a pessoa precisa do painel, crie a conta dela com '
             || '`conta-admin criar` depois desta migracao; (2) apague a linha com '
             || '`DELETE FROM user_roles WHERE user_id = ''<id>'' AND role = ''<papel>''`; '
             || '(3) rode a migracao de novo.';
  END IF;
END
$$;

-- `= ANY (ARRAY[...])` e nao `IN ('tutor')`, e a diferenca e de catalogo: o
-- Postgres reescreve `IN` de um valor so como `role = 'tutor'::text`, que deixa
-- de ter a forma de lista fechada, e `conjunto-exato-dos-checks.test.ts` a
-- procuraria no registro errado. Com `ANY` o catalogo guarda a lista como
-- lista, de um elemento, e o conjunto continua afirmado como conjunto.
ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check CHECK (role = ANY (ARRAY['tutor']));

-- ---------------------------------------------------------------------------
-- 2. `admin_accounts` (item 20.1)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_accounts (
  id                       uuid        PRIMARY KEY,
  -- Unico SO aqui dentro, e sobre todas as linhas, desativadas inclusive: a
  -- mesma pessoa pode ter conta no app e no painel com o mesmo e-mail, e cada
  -- porta so enxerga a sua. Conta desativada nao libera o endereco, porque a
  -- linha fica para a trilha e para as colunas de autoria que apontam para ela.
  email                    citext      NOT NULL
                                       CONSTRAINT admin_accounts_email_tamanho
                                       CHECK (char_length(email) <= 254),
  -- E o `AdminSession.display_name`, que o contrato declara obrigatorio. Nunca
  -- vazio e nunca o e-mail (D51).
  display_name             text        NOT NULL
                                       CONSTRAINT admin_accounts_nome_tamanho
                                       CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 60),
  -- `moderator` entra como valor novo quando a moderacao existir. `ANY` e nao
  -- `IN`, pelo motivo escrito em `user_roles_role_check` acima.
  role                     text        NOT NULL DEFAULT 'admin'
                                       CONSTRAINT admin_accounts_role_check
                                       CHECK (role = ANY (ARRAY['admin'])),
  -- O mesmo hash do app (PBKDF2-SHA512 em PHC), pelas mesmas funcoes. O
  -- valor so e escrito pelo comando `conta-admin`, com a senha digitada no
  -- terminal (D61), e pelo rehash transparente do login (D19).
  password_phc             text        NOT NULL
                                       CONSTRAINT admin_accounts_phc_pbkdf2_sha512
                                       CHECK (password_phc LIKE '$pbkdf2-sha512$%'),
  password_updated_at      timestamptz NOT NULL,
  status                   text        NOT NULL DEFAULT 'active'
                                       CONSTRAINT admin_accounts_status_check
                                       CHECK (status IN ('active', 'disabled')),
  disabled_at              timestamptz,
  -- `failed_logins`: dez falhas em 24 horas (D44). `disavowed`: o dono clicou
  -- "nao fui eu" (D62). Os dois so caem com `conta-admin redefinir-senha`.
  blocked_reason           text        CONSTRAINT admin_accounts_blocked_reason_check
                                       CHECK (blocked_reason IN ('failed_logins', 'disavowed')),
  blocked_at               timestamptz,
  -- A mesma barreira de `users.sessions_invalid_before`: sessao criada antes
  -- dela nao vale, e a guarda a le a cada requisicao.
  sessions_invalid_before  timestamptz NOT NULL DEFAULT now(),
  last_login_at            timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_accounts_desativada_tem_quando
    CHECK ((status = 'disabled') = (disabled_at IS NOT NULL)),
  CONSTRAINT admin_accounts_bloqueio_e_completo
    CHECK ((blocked_reason IS NULL) = (blocked_at IS NULL))
);

CREATE UNIQUE INDEX admin_accounts_email_unico ON admin_accounts (email);

COMMENT ON TABLE admin_accounts IS
  'Cadastro do painel (ADR-0027 item 20). Sem FK para users e sem ser referenciada por nada do app: uma porta nao acha a conta da outra. Conta nao se apaga, desativa.';
COMMENT ON COLUMN admin_accounts.role IS
  'Lista fechada, afirmada em tests/integration/conjunto-exato-dos-checks.test.ts. Capacidade e conjunto, nao ordem.';
COMMENT ON COLUMN admin_accounts.blocked_reason IS
  'Os dois motivos de bloqueio. O conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

-- ---------------------------------------------------------------------------
-- 3. `admin_sessions` e `admin_reauth_tokens` (apendice A.1)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_sessions (
  id                   uuid        PRIMARY KEY,
  admin_account_id     uuid        NOT NULL REFERENCES admin_accounts (id) ON DELETE CASCADE,

  -- SHA-256 do valor do cookie `__Host-bichu_adm` (256 bits de CSPRNG). O
  -- valor em claro existe no `Set-Cookie` e em lugar nenhum mais. Entropia de
  -- 256 bits dispensa sal.
  token_hash           bytea       NOT NULL UNIQUE,

  -- SHA-256 do token sincronizador anti-CSRF (D39). O valor em claro sai no
  -- corpo do login, da reautenticacao e de `GET /v1/admin/session`, e troca
  -- junto com o identificador da sessao.
  csrf_token_hash      bytea       NOT NULL,

  -- O instante da senha. A rotacao HERDA este valor: o teto de 12 horas conta
  -- da senha, e a reautenticacao nao o faz renascer.
  created_at           timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  idle_expires_at      timestamptz NOT NULL,
  absolute_expires_at  timestamptz NOT NULL,

  revoked_at           timestamptz,
  revoked_reason       text        CONSTRAINT admin_sessions_revoked_reason_check
                                   CHECK (revoked_reason IN ('logout', 'rotated', 'account_disabled',
                                                             'account_invalidated', 'disavowed',
                                                             'password_reset')),
  user_agent           text        CONSTRAINT admin_sessions_user_agent_check
                                   CHECK (char_length(user_agent) <= 512),
  ip_hmac              bytea,

  CONSTRAINT admin_sessions_inatividade_dentro_do_teto
    CHECK (idle_expires_at <= absolute_expires_at),
  CONSTRAINT admin_sessions_teto_de_doze_horas
    CHECK (absolute_expires_at <= created_at + interval '12 hours'),
  CONSTRAINT admin_sessions_revogacao_e_completa
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE INDEX admin_sessions_vivas ON admin_sessions (admin_account_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE admin_sessions IS
  'Sessao do backoffice (ADR-0027 item 2, apendice A.1). Tabela propria, e nao refresh_tokens com sinalizador: um refresh do app nao pode estar a um valor de coluna de virar sessao administrativa.';
COMMENT ON COLUMN admin_sessions.revoked_reason IS
  'Os seis motivos do apendice A.1 do ADR-0027. O conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

CREATE TABLE admin_reauth_tokens (
  id                uuid        PRIMARY KEY,
  -- Presa a sessao que a pediu. A reautenticacao rotaciona a sessao, entao a
  -- janela nasce presa a sessao NOVA; uma rotacao seguinte a mata junto.
  session_id        uuid        NOT NULL REFERENCES admin_sessions (id) ON DELETE CASCADE,
  admin_account_id  uuid        NOT NULL REFERENCES admin_accounts (id) ON DELETE CASCADE,
  scope             text        NOT NULL,
  token_hash        bytea       NOT NULL UNIQUE,
  issued_at         timestamptz NOT NULL,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,

  -- Os CINCO escopos do item 5. `network_event_access_change` entra aqui, e
  -- nao numa migracao da `Rede`: a lista fechada mora num lugar so.
  CONSTRAINT admin_reauth_tokens_escopo
    CHECK (scope IN ('store_item_retirement', 'network_event_relocation',
                     'network_event_cancellation', 'network_event_removal',
                     'network_event_access_change')),
  CONSTRAINT admin_reauth_tokens_janela_positiva CHECK (expires_at > issued_at)
);

CREATE INDEX admin_reauth_tokens_session_id ON admin_reauth_tokens (session_id);

COMMENT ON TABLE admin_reauth_tokens IS
  'Janela de 5 minutos de POST /v1/admin/auth/reauth (D40): uso unico, um escopo, presa a sessao administrativa. Nao e reauth_tokens, que e presa ao jti do JWT movel.';
COMMENT ON COLUMN admin_reauth_tokens.scope IS
  'Os cinco valores de AdminReauthScope no contrato. O conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

-- ---------------------------------------------------------------------------
-- 4. `admin_session_alerts`: o "nao fui eu" do painel (D62)
-- ---------------------------------------------------------------------------
CREATE TABLE admin_session_alerts (
  id                uuid        PRIMARY KEY,
  admin_account_id  uuid        NOT NULL REFERENCES admin_accounts (id) ON DELETE CASCADE,
  -- A sessao cuja abertura o aviso anunciou. `SET NULL` porque o expurgo de
  -- sessoes vencidas nao pode apagar o remedio de quem ainda nao leu o e-mail.
  session_id        uuid        REFERENCES admin_sessions (id) ON DELETE SET NULL,
  -- SHA-256 do token de 256 bits que vai no FRAGMENTO do link. O valor em
  -- claro existe no e-mail e em lugar nenhum mais.
  token_hash        bytea       NOT NULL UNIQUE,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_session_alerts_conta ON admin_session_alerts (admin_account_id);

COMMENT ON TABLE admin_session_alerts IS
  'Link "nao fui eu" do aviso de sessao administrativa aberta (D62): uso unico, 7 dias, consumido depois da revogacao.';

-- ---------------------------------------------------------------------------
-- 5. `audit.events` aprende o ator administrativo (apendice A.5)
-- ---------------------------------------------------------------------------
--
-- Coluna propria, e nao o UUID do administrador em `actor_user_id`: a trilha
-- teria UUIDs de duas tabelas na mesma coluna, e a investigacao que junta
-- `actor_user_id` com `users` acharia nada ou, pior, outra pessoa.
--
-- LINHAS HISTORICAS: nenhuma e reescrita. `actor_kind` fica como estava
-- (`user`, `anonymous` ou `system`) e `actor_admin_id` nasce nulo, que e
-- exatamente o que o CHECK novo exige de quem nao e `admin`. `ADD COLUMN` sem
-- `DEFAULT` nao reescreve a tabela.
--
-- Sem chave estrangeira, pelo mesmo motivo de `actor_user_id`: a trilha
-- sobrevive a conta que ela documenta. O `GRANT INSERT, SELECT` de
-- `bichu_audit_writer` e da tabela e cobre a coluna nova.
--
-- O nome `events_actor_kind_check` e mantido de proposito: e a chave com que
-- `conjunto-exato-dos-checks.test.ts` afirma a lista fechada.
ALTER TABLE audit.events DROP CONSTRAINT events_actor_kind_check;
ALTER TABLE audit.events ADD CONSTRAINT events_actor_kind_check
  CHECK (actor_kind IN ('user', 'anonymous', 'system', 'admin'));

ALTER TABLE audit.events ADD COLUMN actor_admin_id uuid;

ALTER TABLE audit.events ADD CONSTRAINT audit_events_ator_admin_coerente
  CHECK ((actor_kind = 'admin') = (actor_admin_id IS NOT NULL));

CREATE INDEX audit_events_ator_admin ON audit.events (actor_admin_id, occurred_at DESC)
  WHERE actor_admin_id IS NOT NULL;

COMMENT ON COLUMN audit.events.actor_admin_id IS
  'admin_accounts.id de quem agiu no painel. Sem FK: a trilha sobrevive a conta. Nulo em toda linha que nao seja actor_kind = admin, inclusive as anteriores a 20260928000002.';

-- Down Migration

-- A descida NAO apaga trilha. Se ja existe evento com ator administrativo, o
-- CHECK antigo nao cabe, e a descida para aqui dizendo por que: apagar a
-- evidencia para conseguir descer seria o pior desfecho possivel.
DO $$
DECLARE
  total integer;
BEGIN
  SELECT count(*) INTO total FROM audit.events WHERE actor_kind = 'admin';
  IF total > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('descida de 20260928000002 recusada: audit.events tem %s evento(s) com actor_kind = admin', total),
      HINT    = 'A trilha e imutavel e nao se apaga para desfazer esquema. Mantenha a migracao aplicada.';
  END IF;
END
$$;

DROP INDEX IF EXISTS audit.audit_events_ator_admin;
ALTER TABLE audit.events DROP CONSTRAINT IF EXISTS audit_events_ator_admin_coerente;
ALTER TABLE audit.events DROP COLUMN IF EXISTS actor_admin_id;
ALTER TABLE audit.events DROP CONSTRAINT events_actor_kind_check;
ALTER TABLE audit.events ADD CONSTRAINT events_actor_kind_check
  CHECK (actor_kind IN ('user', 'anonymous', 'system'));

DROP TABLE IF EXISTS admin_session_alerts;
DROP TABLE IF EXISTS admin_reauth_tokens;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_accounts;

ALTER TABLE user_roles DROP CONSTRAINT user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('tutor', 'moderator', 'admin'));
