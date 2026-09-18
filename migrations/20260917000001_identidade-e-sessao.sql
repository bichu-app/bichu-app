-- BICHUS-19, BICHUS-17, BICHUS-15 — identidade, credencial local e sessao.
--
-- O ponto irreversivel do projeto esta nesta migracao (ADR-0002): `users.id` e
-- a unica chave que o resto do sistema referencia. E-mail, telefone, login,
-- `sub` de provedor externo e valor impresso em QR nao sao chave estrangeira em
-- lugar nenhum, e e por isso que trocar o e-mail nao toca em nenhuma outra
-- tabela.
--
-- O UUIDv7 e gerado pela APLICACAO (shared/ports/id-generator), nao pelo banco:
-- o Postgres 16 nao tem `uuidv7()` nativo e uma funcao SQL propria criaria uma
-- segunda fonte de identificador. Nao existe DEFAULT em `id` de proposito.

-- Up Migration

-- A EXTENSAO GEOESPACIAL E CRIADA AQUI, pela migracao, e nunca pelo script de
-- initdb da imagem do banco (ADR-0006, criterio 2 da BICHUS-13). Nenhuma
-- coluna `geography` existe ainda: o PostGIS e pre-requisito do BANCO, nao
-- desta ou daquela tabela, e por isso abre a primeira migracao.
--
-- O que esta linha compra: hoje o PostGIS so esta la porque a imagem
-- `postgis/postgis:16-3.4` o instala sozinha. Nesse arranjo, trocar a imagem
-- base ou apontar para um Postgres gerenciado tira a extensao sem que nada
-- acuse, e a falta aparece na primeira consulta de raio, ja com o produto no
-- ar. Com o CREATE aqui, o mesmo destino falha no JOB DE MIGRACAO, que roda
-- antes da api subir: onde a extensao nao esta instalada no servidor, o
-- Postgres nao acha o arquivo de controle e interrompe a migracao com o nome
-- do que falta. Falha ruidosa na subida no lugar de defeito silencioso em
-- producao.
--
-- `IF NOT EXISTS` por dois motivos: o banco de desenvolvimento ja recebeu a
-- extensao da imagem, e em servico gerenciado quem executa `CREATE EXTENSION`
-- pode ser um papel diferente do papel da aplicacao (ADR-0013 R1), caso em que
-- a extensao ja vem criada e esta linha e um no-op.
--
-- Sobre editar uma migracao ja aplicada, que em geral e proibido: aqui vale
-- porque a instrucao nao cria objeto nenhum que as migracoes 2 a 6
-- referenciem, e e idempotente. Banco ja migrado e banco novo terminam no
-- mesmo estado. Isso NAO abre precedente para as proximas: qualquer mudanca
-- que crie, altere ou apague objeto vai em migracao nova.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                       uuid        PRIMARY KEY,
  email                    citext      NOT NULL,
  email_verified_at        timestamptz,
  display_name             text,
  phone_e164               text        CONSTRAINT users_phone_e164_formato
                                       CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+55[0-9]{10,11}$'),
  phone_verified_at        timestamptz,
  reference_postal_code    text,
  reference_neighborhood   text,
  reference_city           text,
  reference_state          char(2),
  accepted_terms_version   text,
  accepted_terms_at        timestamptz,
  status                   text        NOT NULL DEFAULT 'active'
                                       CHECK (status IN ('active', 'suspended', 'deletion_requested')),
  deletion_requested_at    timestamptz,

  -- SEC-006. Atualizada para now() em logout total, troca de senha,
  -- redefinicao, "Nao fui eu" e exclusao de conta. A autorizacao compara o
  -- `iat` do token com esta coluna e recusa com 401 o token anterior, o que faz
  -- a revogacao valer em menos de um segundo em vez dos ate 15 minutos do JWT.
  -- NOT NULL porque comparacao com NULL nao recusa nada: uma linha sem valor
  -- desligaria a protecao em silencio.
  sessions_invalid_before  timestamptz NOT NULL DEFAULT now(),

  pending_email            citext,
  email_deliverable        boolean     NOT NULL DEFAULT true,

  -- Vinte pets e regra de PESSOA FISICA, e a primeira entidade que nao for
  -- pessoa fisica estoura no dia em que entra (docs/03-arquitetura.md 4.1).
  pet_limit                smallint    NOT NULL DEFAULT 20 CHECK (pet_limit > 0),
  account_kind             text        NOT NULL DEFAULT 'person'
                                       CHECK (account_kind IN ('person', 'organization')),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);

-- Unicidade do e-mail vale apenas entre contas vivas: conta excluida libera o
-- endereco. `citext` ja compara sem diferenciar caixa; o indice e sobre a
-- coluna e nao sobre `lower(email)` para que o planejador o use na busca por
-- igualdade que o login faz.
CREATE UNIQUE INDEX users_email_unico_ativo
  ON users (email)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.sessions_invalid_before IS
  'SEC-006: todo token com iat anterior a este instante e recusado com 401.';

CREATE TABLE user_identities (
  id                          uuid        PRIMARY KEY,
  user_id                     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider                    text        NOT NULL
                                          CHECK (provider IN ('local', 'google', 'apple', 'keycloak')),
  provider_subject            text        NOT NULL,
  email_at_provider           citext,
  email_verified_at_provider  timestamptz,
  linked_at                   timestamptz NOT NULL DEFAULT now(),
  last_login_at               timestamptz,

  -- E esta restricao que faz a chegada de um provedor externo ser um INSERT e
  -- nao um ALTER TABLE (ADR-0002, criterio 5 de BICHUS-19).
  CONSTRAINT user_identities_provider_subject_unico UNIQUE (provider, provider_subject),
  -- Uma conta tem no maximo um vinculo por provedor. Sem isto, duas senhas
  -- locais para o mesmo usuario seriam um estado representavel.
  CONSTRAINT user_identities_um_por_provedor UNIQUE (user_id, provider)
);

CREATE INDEX user_identities_user_id ON user_identities (user_id);

-- O segredo mora separado do vinculo para que `user_identities` possa ser lida
-- sem trazer hash junto (ADR-0002).
CREATE TABLE local_credentials (
  identity_id          uuid        PRIMARY KEY REFERENCES user_identities (id) ON DELETE CASCADE,

  -- Formato PHC completo: algoritmo, iteracoes e salt vao JUNTO do hash, nunca
  -- em configuracao global (BICHUS-17, criterio 2). E o que permite subir o
  -- custo sem reset em massa e o que o Keycloak importa nativamente.
  password_phc         text        NOT NULL
                                   CONSTRAINT local_credentials_phc_pbkdf2_sha512
                                   CHECK (password_phc LIKE '$pbkdf2-sha512$%'),
  password_updated_at  timestamptz NOT NULL DEFAULT now(),
  must_change          boolean     NOT NULL DEFAULT false
);

COMMENT ON CONSTRAINT local_credentials_phc_pbkdf2_sha512 ON local_credentials IS
  'BICHUS-17 criterio 3: bcrypt nao entra nesta base. O Keycloak nao o importa sem provider de terceiro.';

CREATE TABLE user_roles (
  user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role     text NOT NULL CHECK (role IN ('tutor', 'moderator', 'admin')),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE verification_tokens (
  id               uuid        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose          text        NOT NULL
                               CHECK (purpose IN ('email_verify', 'password_reset', 'email_change')),
  -- SHA-256 de 256 bits de CSPRNG (SEC-005). O valor em claro nunca e gravado;
  -- entropia alta dispensa sal.
  token_hash       bytea       NOT NULL UNIQUE,
  sent_to          citext      NOT NULL,
  expires_at       timestamptz NOT NULL,
  consumed_at      timestamptz,
  attempts         integer     NOT NULL DEFAULT 0,
  created_ip_hmac  bytea,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_tokens_pendentes
  ON verification_tokens (user_id, purpose)
  WHERE consumed_at IS NULL;

CREATE TABLE refresh_tokens (
  id                   uuid        PRIMARY KEY,
  user_id              uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  family_id            uuid        NOT NULL,
  -- SHA-256 do token opaco de 256 bits. O valor em claro so existe na resposta
  -- e no Keychain/Keystore do aparelho (ADR-0002).
  token_hash           bytea       NOT NULL UNIQUE,
  issued_at            timestamptz NOT NULL DEFAULT now(),
  -- Janela de INATIVIDADE: a rotacao a renova (30 dias, ou 180 com "continuar
  -- conectado").
  expires_at           timestamptz NOT NULL,
  -- Teto ABSOLUTO desde a autenticacao com senha, 180 dias, constante ao longo
  -- da familia inteira (docs/04-seguranca.md 7.5). Sem ele a rotacao transforma
  -- roubo de token em acesso permanente, porque cada uso empurra `expires_at`.
  absolute_expires_at  timestamptz NOT NULL,
  -- "Continuar conectado" e escolha feita UMA vez, na autenticacao com senha, e
  -- carregada pela familia inteira. Gravada e nao deduzida na renovacao: sem a
  -- coluna, o cliente poderia promover a propria sessao de 30 para 180 dias
  -- pedindo a renovacao de outro jeito, e a escolha do usuario deixaria de ser
  -- dele.
  stay_signed_in       boolean     NOT NULL DEFAULT false,
  rotated_to_id        uuid        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  revoked_at           timestamptz,
  revoked_reason       text        CHECK (revoked_reason IN (
                                     'rotation', 'reuse_detected', 'logout',
                                     'password_changed', 'account_deleted')),
  device_id            uuid,
  user_agent           text,
  ip_hmac              bytea,
  CONSTRAINT refresh_tokens_motivo_exige_revogacao
    CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

-- A revogacao por reuso varre a familia inteira; e a consulta mais quente do
-- caminho de renovacao.
CREATE INDEX refresh_tokens_familia ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_user_id ON refresh_tokens (user_id);

-- Down Migration

DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS verification_tokens;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS local_credentials;
DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS users;
-- Nem `citext` nem `postgis` sao removidas: extensao e estado do banco, nao
-- desta migracao, e outras migracoes dependem das duas. No caso do PostGIS a
-- remocao tambem seria destrutiva no futuro, porque `DROP EXTENSION` em
-- CASCADE leva junto toda coluna `geography`; sem CASCADE ele recusa, que e o
-- comportamento correto e mais uma razao para nao tentar.
