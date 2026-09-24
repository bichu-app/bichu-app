-- A escrita administrativa da `Loja` e a imagem de catalogo (ADR-0027, itens 10
-- e 14, apendice A.2 e A.3; BICHUS-266 e BICHUS-267).
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a `20260922000009` criou a vitrine
-- para ser lida, e o painel precisa escreve-la sem sobrescrever o trabalho de
-- outro administrador, com rascunho, e com imagem que so pode ser nossa.
--
-- O QUE ELA FAZ, UM ITEM POR APENDICE:
--
-- - A.2: `created_at`, `updated_at` e `version` nas duas tabelas da vitrine.
--   `version` e o `ETag`: o `UPDATE` que grava e o que confere, com
--   `WHERE version = <o que a pessoa leu>` (ADR-0021 aplicado a concorrencia).
-- - A.2: `store_items.published_at`, a PRIMEIRA publicacao.
-- - A.3: `catalog_images`, na forma de `pet_photos`.
-- - A.3: `upload_intents` aceita `catalog_image`, com `purpose` obrigatorio
--   nele e proibido nos demais.
--
-- O QUE ELA NAO FAZ, E A AUSENCIA E DELIBERADA:
--
-- - **Nao cria `store_items.image_id`** (A.2). Em 23/09 o cliente pediu varias
--   imagens por produto, e a arquitetura vai trocar a coluna unica por uma
--   tabela de imagens do produto. Criar a coluna agora seria criar o que a
--   emenda vai apagar. `catalog_images` e o envio ficam, porque os dois servem
--   aos dois desenhos e a capa do encontro da `Rede` tambem depende deles.
-- - **Nenhuma coluna de autor.** Quem criou e quem mudou esta em
--   `audit.events`, o unico lugar onde isso e imutavel (A.2).
-- - **Nao toca `network_events`.** A tabela nasce na migracao da `Rede`
--   (`feat/secao-rede`), que ainda nao esta nesta base; `cover_image_id` e
--   acrescentado quando as duas se encontrarem, pelo dono da `Rede`.
-- - **Nao cria `admin_sessions`** (A.1). A sessao e de outra fatia do
--   backoffice, e uma tabela nao depende da outra.
--
-- SOBRE O PREENCHIMENTO DE `published_at` NAS LINHAS QUE JA EXISTEM
--
-- `CHECK (NOT active OR published_at IS NOT NULL)` precisa valer para a massa
-- que ja esta aplicada em homologacao, e ali nenhuma linha sabe quando foi
-- publicada (nem a retirada, que precisa da data para nao virar rascunho): a vitrine era carregada por script. O instante desta migracao e o
-- unico valor que se pode afirmar ("estava publicada, no mais tardar, agora"),
-- e o `COMMENT ON COLUMN` diz isso. A alternativa, deixar a migracao falhar ate
-- alguem decidir, travaria homologacao por uma data de dado de exemplo.
--
-- SOBRE O `down`: devolve o esquema da `20260922000009`. Intencao de envio de
-- catalogo e apagada antes de a lista de `kind` voltar a ser a antiga, porque o
-- `CHECK` antigo a recusaria.

-- Up Migration

-- ---------------------------------------------------------------------------
-- A imagem de catalogo (A.3)
-- ---------------------------------------------------------------------------

ALTER TABLE upload_intents
  DROP CONSTRAINT upload_intents_kind_check;

ALTER TABLE upload_intents
  ADD CONSTRAINT upload_intents_kind_check
    CHECK (kind IN ('pet_photo', 'found_report_photo', 'finder_photo', 'catalog_image')),

  -- O proposito fica gravado no envio, e a escrita que confirma exige o mesmo
  -- (T9): a capa de um encontro nao vira imagem de produto, e foto de pet nao
  -- vira nenhuma das duas.
  ADD COLUMN purpose text,
  ADD CONSTRAINT upload_intents_proposito_de_catalogo
    CHECK (purpose IS NULL OR purpose IN ('store_item', 'network_event')),
  ADD CONSTRAINT upload_intents_proposito_so_no_catalogo
    CHECK ((kind = 'catalog_image') = (purpose IS NOT NULL)),

  -- Imagem de catalogo nao pertence a pet. Sem isto, uma intencao de catalogo
  -- com `pet_id` apareceria na ficha do animal pelo caminho de `pet_photos`.
  ADD CONSTRAINT upload_intents_catalogo_sem_pet
    CHECK (kind <> 'catalog_image' OR pet_id IS NULL);

COMMENT ON COLUMN upload_intents.purpose IS
  'So em `kind = catalog_image`: `store_item` ou `network_event`. A escrita que confirma o envio exige o mesmo proposito (ADR-0027 item 10, T9).';

CREATE TABLE catalog_images (
  id                uuid        PRIMARY KEY,
  upload_intent_id  uuid        NOT NULL UNIQUE REFERENCES upload_intents (id),
  purpose           text        NOT NULL
                    CONSTRAINT catalog_images_proposito
                    CHECK (purpose IN ('store_item', 'network_event')),
  status            text        NOT NULL DEFAULT 'processing'
                    CONSTRAINT catalog_images_estado
                    CHECK (status IN ('processing', 'ready', 'rejected')),
  -- A chave da derivada publica, com 128 bits aleatorios no nome. Nula ate o
  -- processamento terminar: e isso que impede servir a imagem antes de pronta.
  public_key        text,
  rejection_reason  text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT catalog_images_pronta_tem_chave
    CHECK (status <> 'ready' OR public_key IS NOT NULL),
  CONSTRAINT catalog_images_recusada_tem_motivo
    CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)
);

COMMENT ON TABLE catalog_images IS
  'Imagem de item da Loja ou de encontro da Rede, enviada pelo painel pelo caminho do ADR-0007. Nunca URL externa.';
COMMENT ON COLUMN catalog_images.id IS
  'Identidade interna. NUNCA sai em resposta: o painel ve `source`, `status` e a URL da derivada.';
COMMENT ON COLUMN catalog_images.public_key IS
  'Chave da derivada no bucket PUBLICO, com 128 bits aleatorios. Nula enquanto processa: a leitura publica so a serve com `status = ready`.';

-- ---------------------------------------------------------------------------
-- A vitrine ganha versao, datas e rascunho (A.2)
-- ---------------------------------------------------------------------------

ALTER TABLE store_partners
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN version    integer     NOT NULL DEFAULT 1
             CONSTRAINT store_partners_versao_positiva CHECK (version > 0);

ALTER TABLE store_items
  ADD COLUMN created_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_at   timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN version      integer     NOT NULL DEFAULT 1
             CONSTRAINT store_items_versao_positiva CHECK (version > 0),
  ADD COLUMN published_at timestamptz;

-- Ver o cabecalho: o instante desta migracao e o unico valor verdadeiro que se
-- pode gravar para a massa ja publicada. TODA linha, e nao so a ativa: tudo que
-- existe antes desta migracao foi carregado na vitrine, e a inativa e a
-- retirada (criterio 22 da BICHUS-185), nao o rascunho. Sem a data, ela
-- apareceria no painel como `draft`, um estado que ela nunca teve.
UPDATE store_items SET published_at = now();

ALTER TABLE store_items
  ADD CONSTRAINT store_items_publicado_tem_data
    CHECK (NOT active OR published_at IS NOT NULL);

COMMENT ON COLUMN store_partners.version IS
  'Incrementada a cada escrita. E o `ETag` do painel; o UPDATE confere a versao lida na propria clausula WHERE.';
COMMENT ON COLUMN store_items.version IS
  'Incrementada a cada escrita. E o `ETag` do painel; o UPDATE confere a versao lida na propria clausula WHERE.';
COMMENT ON COLUMN store_items.published_at IS
  'A PRIMEIRA publicacao, nunca reescrita (ADR-0026 secao 3). `draft` = nulo; `published` = active; `retired` = nao active e nao nulo. Nas linhas publicadas antes da 20260923000007 e o instante dessa migracao, e nao a publicacao real, que ninguem registrou.';
COMMENT ON COLUMN store_items.active IS
  'Esta na vitrine agora. O padrao `true` e da massa; o item escrito pelo painel nasce `false` (rascunho).';

-- Down Migration

ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS store_items_publicado_tem_data,
  DROP COLUMN IF EXISTS published_at,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at;

ALTER TABLE store_partners
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at;

DROP TABLE IF EXISTS catalog_images;

DELETE FROM upload_intents WHERE kind = 'catalog_image';

ALTER TABLE upload_intents
  DROP CONSTRAINT IF EXISTS upload_intents_catalogo_sem_pet,
  DROP CONSTRAINT IF EXISTS upload_intents_proposito_so_no_catalogo,
  DROP CONSTRAINT IF EXISTS upload_intents_proposito_de_catalogo,
  DROP COLUMN IF EXISTS purpose,
  DROP CONSTRAINT IF EXISTS upload_intents_kind_check;

ALTER TABLE upload_intents
  ADD CONSTRAINT upload_intents_kind_check
    CHECK (kind IN ('pet_photo', 'found_report_photo', 'finder_photo'));
