-- BICHUS-87 — a foto vai direto ao armazenamento, sem bloquear o cadastro.
--
-- Tres tabelas, e a razao de serem tres esta no ADR-0007:
--
-- `upload_intents` existe porque **o backend nunca recebe os bytes**. Ele assina
-- uma autorizacao, o cliente envia direto ao armazenamento, e so depois
-- confirma. Entre assinar e confirmar existe um intervalo em que o objeto pode
-- ter chegado, chegado pela metade, ou nunca chegar -- e e esse intervalo que a
-- tabela representa. Envio que ninguem confirma e varrido pela expiracao.
--
-- `pet_photos` so nasce na CONFIRMACAO, e nasce `processing`. Ela nao serve a
-- rota publica antes de o worker validar os bytes reais e gerar as derivadas
-- sem EXIF: foto de celular carrega GPS, ou seja, a casa do tutor.
--
-- `jobs` existe porque o processamento e disparado pela confirmacao do cliente,
-- e **nao** por notificacao do armazenamento. Notificacao de bucket existe em
-- todo provedor com nome, formato e garantia diferentes; amarra-la ao caminho
-- critico compraria um acoplamento inteiro em troca de nada, e fecharia a porta
-- que o ADR-0012 mantem aberta.
--
-- O que NAO tem coluna aqui: URL. Nenhuma. O banco guarda chave de objeto; a URL
-- e montada na leitura a partir de `MEDIA_PUBLIC_BASE_URL` ou assinada na hora
-- (§11.1 proibicao 9). Gravar URL absoluta amarraria cada linha ao provedor e ao
-- dominio do dia em que ela foi escrita.

-- Up Migration

CREATE TABLE upload_intents (
  id                uuid        PRIMARY KEY,
  user_id           uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- A quem a foto pertencera. Anulavel porque o achador sem conta tambem envia
  -- foto, e nesse caso nao ha pet: o vinculo e com o aviso.
  pet_id            uuid        REFERENCES pets (id) ON DELETE CASCADE,

  kind              text        NOT NULL
                                CHECK (kind IN ('pet_photo', 'found_report_photo', 'finder_photo')),

  -- A chave do objeto no armazenamento PRIVADO. Nunca uma URL.
  object_key        text        NOT NULL,

  -- O que o cliente DECLAROU. Guardado para diagnostico e nunca como verdade:
  -- quem valida e o worker, lendo os numeros magicos dos bytes reais.
  declared_type     text        NOT NULL,
  max_bytes         integer     NOT NULL CHECK (max_bytes > 0),

  expires_at        timestamptz NOT NULL,
  confirmed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX upload_intents_object_key_unico ON upload_intents (object_key);

-- Sustenta a varredura dos envios que ninguem confirmou.
CREATE INDEX upload_intents_vencidos ON upload_intents (expires_at)
  WHERE confirmed_at IS NULL;

CREATE TABLE pet_photos (
  id                uuid        PRIMARY KEY,
  pet_id            uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  upload_intent_id  uuid        NOT NULL REFERENCES upload_intents (id) ON DELETE RESTRICT,

  -- `processing` -> `ready` ou `rejected`. NUNCA volta.
  -- `rejected` e o que acontece quando os bytes reais nao sao imagem aceita, e o
  -- tipo declarado no envio nunca e a fonte da verdade.
  status            text        NOT NULL DEFAULT 'processing'
                                CHECK (status IN ('processing', 'ready', 'rejected')),
  rejection_reason  text,

  -- O ORIGINAL, no bucket privado. So o dono, e so por URL assinada curta.
  original_key      text        NOT NULL,

  -- As derivadas, no bucket PUBLICO, com 128 bits aleatorios na chave: publica,
  -- nao adivinhavel, e por isso com cache longo e sem assinatura. Nulas ate o
  -- worker gerar. `card` e a UNICA coisa que a rota publica mostra.
  thumb_key         text,
  card_key          text,

  is_primary        boolean     NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT now(),
  processed_at      timestamptz,
  deleted_at        timestamptz,

  -- Derivada sem original e um estado que nao existe, e sem esta restricao ele
  -- apareceria por uma atualizacao parcial que ninguem revisou.
  CONSTRAINT pet_photos_pronta_tem_derivadas
    CHECK (status <> 'ready' OR (thumb_key IS NOT NULL AND card_key IS NOT NULL)),

  CONSTRAINT pet_photos_recusada_tem_motivo
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);

-- UMA principal por pet, imposta pelo banco. "Duas fotos principais" e um estado
-- que a aplicacao consertaria com um `UPDATE` extra que alguem esqueceria.
CREATE UNIQUE INDEX pet_photos_uma_principal ON pet_photos (pet_id)
  WHERE is_primary AND deleted_at IS NULL;

CREATE INDEX pet_photos_do_pet ON pet_photos (pet_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- A fila. Deliberadamente simples: `SELECT ... FOR UPDATE SKIP LOCKED` no
-- Postgres atende a ordem de grandeza deste produto por muito tempo, e uma fila
-- dedicada seria mais um servico para operar, monitorar e migrar de nuvem.
CREATE TABLE jobs (
  id            uuid        PRIMARY KEY,
  kind          text        NOT NULL,
  payload       jsonb       NOT NULL,

  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts      integer     NOT NULL DEFAULT 0,
  -- O teto vive na LINHA, e nao numa constante do worker: trabalho de e-mail e
  -- trabalho de imagem nao merecem o mesmo numero de tentativas, e descobrir
  -- isso depois nao pode exigir migracao.
  max_attempts  integer     NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  last_error    text,

  -- Quando o trabalho pode ser pego. Adiar uma tentativa e mexer nesta coluna.
  run_after     timestamptz NOT NULL DEFAULT now(),
  locked_at     timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);

-- O indice que o `SKIP LOCKED` percorre. Parcial de proposito: trabalho
-- terminado e a maior parte da tabela depois da primeira semana, e ele nao
-- precisa estar no caminho de quem procura o proximo.
CREATE INDEX jobs_proximo ON jobs (run_after)
  WHERE status IN ('pending', 'running');

COMMENT ON COLUMN upload_intents.declared_type IS
  'O que o cliente disse. NUNCA a fonte da verdade: quem decide e o numero magico dos bytes.';
COMMENT ON COLUMN pet_photos.card_key IS
  'Derivada de ate 1024 px, sem EXIF. A UNICA coisa que a rota publica mostra.';

-- Down Migration

DROP TABLE jobs;
DROP TABLE pet_photos;
DROP TABLE upload_intents;
