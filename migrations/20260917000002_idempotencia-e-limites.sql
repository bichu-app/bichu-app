-- BICHUS-31 — idempotencia e contador de limite de chamadas.
--
-- `idempotency_keys` sustenta o reenvio da fila offline: a mesma chave dentro
-- de 24 h devolve a resposta original em vez de executar de novo, e e isso que
-- impede o tutor de receber o mesmo aviso varias vezes.
--
-- `rate_limit_counters` existe para que os limites por codigo de tag e por
-- conta valem tambem quando a borda e contornada (ADR-0001), e para que o QA
-- zere contadores entre cenarios sem que a aplicacao ganhe endpoint de teste.

-- Up Migration

CREATE TABLE idempotency_keys (
  -- A chave e escolhida pelo cliente. A leitura SEMPRE casa `key`,
  -- `user_or_token_ref` e `endpoint` juntos: uma chave achada com dono ou rota
  -- diferente e conflito, nunca resposta reaproveitada. Devolver o corpo
  -- gravado so pela igualdade da chave entregaria a resposta de um usuario a
  -- outro que adivinhou o UUID.
  key                uuid        PRIMARY KEY,
  user_or_token_ref  text        NOT NULL,
  endpoint           text        NOT NULL,
  -- SHA-256 do corpo canonico. Mesma chave com corpo diferente e recusada:
  -- chave reaproveitada para outra coisa e erro, nao atalho (criterio 12).
  request_hash       bytea       NOT NULL,
  response_status    integer     NOT NULL CHECK (response_status BETWEEN 100 AND 599),
  response_body      jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Validade de 24 h gravada na linha, e nao deduzida de `created_at` no
  -- codigo: o expurgo e a leitura precisam concordar sem repetir a constante.
  expires_at         timestamptz NOT NULL
);

CREATE INDEX idempotency_keys_expiracao ON idempotency_keys (expires_at);

CREATE TABLE rate_limit_counters (
  bucket_key    text        NOT NULL,
  window_start  timestamptz NOT NULL,
  count         integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

CREATE INDEX rate_limit_counters_janela ON rate_limit_counters (window_start);

-- Down Migration

DROP TABLE IF EXISTS rate_limit_counters;
DROP TABLE IF EXISTS idempotency_keys;
