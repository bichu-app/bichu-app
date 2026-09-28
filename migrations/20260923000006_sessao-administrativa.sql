-- ADR-0027: a sessao do backoffice em `admin.bichu.app`.
--
-- Duas tabelas. A primeira e o apendice A.1 do ADR, nome a nome e restricao a
-- restricao. A segunda e a janela de reautenticacao administrativa (D40), que o
-- ADR descreve no item 5 e o apendice A nao desenha; ela esta aqui na forma de
-- `reauth_tokens`, presa a SESSAO administrativa e nao ao `jti` do JWT movel, e
-- a lacuna esta registrada na entrega da BICHUS-259.

-- Up Migration
--
-- O marcador acima e obrigatorio (BICHUS-125): sem ele o `node-pg-migrate`
-- manda o arquivo inteiro como subida e a descida roda logo em seguida.

CREATE TABLE admin_sessions (
  id                   uuid        PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

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
                                   CHECK (revoked_reason IN ('logout', 'rotated', 'role_removed',
                                                             'account_invalidated', 'disavowed')),
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

CREATE INDEX admin_sessions_vivas ON admin_sessions (user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE admin_sessions IS
  'Sessao do backoffice (ADR-0027 item 2, apendice A.1). Tabela propria, e nao refresh_tokens com sinalizador: um refresh do app nao pode estar a um valor de coluna de virar sessao administrativa.';
COMMENT ON COLUMN admin_sessions.revoked_reason IS
  'Os cinco motivos do apendice A.1 do ADR-0027. O conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

CREATE TABLE admin_reauth_tokens (
  id           uuid        PRIMARY KEY,
  -- Presa a sessao que a pediu. A reautenticacao rotaciona a sessao, entao a
  -- janela nasce presa a sessao NOVA; uma rotacao seguinte a mata junto.
  session_id   uuid        NOT NULL REFERENCES admin_sessions (id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope        text        NOT NULL,
  token_hash   bytea       NOT NULL UNIQUE,
  issued_at    timestamptz NOT NULL,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,

  CONSTRAINT admin_reauth_tokens_escopo
    CHECK (scope IN ('store_item_retirement', 'network_event_relocation',
                     'network_event_cancellation', 'network_event_removal')),
  CONSTRAINT admin_reauth_tokens_janela_positiva CHECK (expires_at > issued_at)
);

CREATE INDEX admin_reauth_tokens_session_id ON admin_reauth_tokens (session_id);

COMMENT ON TABLE admin_reauth_tokens IS
  'Janela de 5 minutos de POST /v1/admin/auth/reauth (D40): uso unico, um escopo, presa a sessao administrativa. Nao e reauth_tokens, que e presa ao jti do JWT movel.';
COMMENT ON COLUMN admin_reauth_tokens.scope IS
  'Os quatro valores de AdminReauthScope no contrato. O conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

-- Down Migration

DROP TABLE IF EXISTS admin_reauth_tokens;
DROP TABLE IF EXISTS admin_sessions;
