-- BICHUS-48: a janela de reautenticacao com senha.
--
-- `POST /v1/auth/reauth` e a unica operacao do sistema que confere a senha de
-- alguem que JA esta autenticado. Ela abre uma janela de 5 minutos para UMA
-- finalidade, e as seis operacoes destrutivas do contrato exigem essa janela no
-- cabecalho `X-Reauth-Token`. Sem esta tabela o cabecalho nao tem o que
-- verificar, e a rota respondia 401 para todo mundo -- que e o motivo de
-- `Desativar a tag` nao ter entrado na BICHUS-60.

-- Up Migration
--
-- O marcador acima e o que a BICHUS-125 pagou vinte horas de producao para
-- aprender: sem ele o `node-pg-migrate` manda o arquivo INTEIRO como subida, a
-- descida roda logo depois da subida, e a migracao fica registrada como
-- aplicada tendo desfeito a si mesma. `infra/verificacao/verificar-marcador-de-migracao.mjs`
-- passou a reprovar a falta.

CREATE TABLE reauth_tokens (
  id               uuid        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- O `jti` do token de ACESSO que pediu a janela. E o vinculo com a sessao
  -- que o esquema de seguranca `reauth` do contrato declara: um token de
  -- reautenticacao copiado para outro aparelho nao vale la, porque la o `jti`
  -- e outro. `text` e nao `uuid` de proposito -- quem produz o valor e
  -- `ClaimsDoAcesso.jti`, que o contrato do assinador tipa como `string`, e uma
  -- coluna mais estreita que o dominio e a invariante que quebra na primeira
  -- linha que nao a cumpre.
  access_jti       text        NOT NULL,

  -- A finalidade unica. Apresentar a janela numa operacao de outro escopo
  -- responde 401, e nao 403: a janela para AQUELA finalidade nao foi aberta.
  -- Sem escopo, quem reautentica para revogar uma plaquinha emite sem saber uma
  -- autorizacao para excluir a conta.
  scope            text        NOT NULL,

  -- SHA-256 de 256 bits de CSPRNG, como em `verification_tokens` e
  -- `refresh_tokens` (SEC-005). O valor em claro existe na resposta de
  -- `POST /auth/reauth` e em lugar nenhum mais: nao vai para log (ha `redact`
  -- de `x-reauth-token` em `src/shared/http/server.ts`), nao vai para a trilha
  -- e nao e gravado aqui.
  token_hash       bytea       NOT NULL UNIQUE,

  -- Pelo relogio da APLICACAO, e nao `DEFAULT now()`. Este campo e comparado
  -- com `users.sessions_invalid_before`, que tambem e gravado pela aplicacao, e
  -- e essa comparacao que faz troca de senha, logout-all e exclusao de conta
  -- matarem a janela aberta antes deles sem precisar varrer tabela nenhuma.
  issued_at        timestamptz NOT NULL,

  -- `issued_at` + 300 s. Usar a janela nao a prorroga: a coluna e escrita uma
  -- vez e nunca mexida.
  expires_at       timestamptz NOT NULL,

  -- Uso unico, como o esquema `reauth` do contrato declara. A operacao que
  -- apresenta a janela a consome, e a segunda apresentacao do mesmo valor
  -- responde 401 -- inclusive quando ela chega dentro dos 5 minutos.
  consumed_at      timestamptz,

  created_ip_hmac  bytea,

  CONSTRAINT reauth_tokens_escopo
    CHECK (scope IN ('account_deletion', 'email_change', 'data_export',
                     'pet_transfer', 'tag_revocation', 'session_revocation')),

  -- Janela de duracao positiva. Uma linha com `expires_at <= issued_at` nasceria
  -- morta e viraria um 401 que ninguem explica.
  CONSTRAINT reauth_tokens_janela_positiva CHECK (expires_at > issued_at)
);

-- O consumo e a expiracao sao lidos pelo hash, que ja e unico. Este indice
-- serve a outra consulta: a varredura por conta, que a limpeza periodica e a
-- investigacao de uma tomada de conta usam.
CREATE INDEX reauth_tokens_user_id ON reauth_tokens (user_id);

COMMENT ON TABLE reauth_tokens IS
  'Janela de 5 minutos aberta por POST /v1/auth/reauth. Uso unico, presa a uma finalidade e ao jti do token de acesso que a pediu (BICHUS-48).';

COMMENT ON COLUMN reauth_tokens.scope IS
  'A finalidade unica da janela. Os seis valores sao os de x-reauth-scope no contrato; o conjunto exato esta afirmado em tests/integration/conjunto-exato-dos-checks.test.ts.';

-- Down Migration

DROP TABLE IF EXISTS reauth_tokens;
