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
-- - A.3: `catalog_upload_intents`, a intencao de envio do painel, com
--   `admin_account_id` e sem tocar `upload_intents`, que e do app (item 20.2).
-- - A.2.1 (item 16, pedido do cliente de 23/09): especie em
--   `store_item_species`, vocabulario curado em `store_tags` ligado por
--   `store_item_tags`, e ate 8 imagens por item em `store_item_images`, com
--   texto alternativo obrigatorio e a principal em `position = 0`.
--
-- O QUE ELA NAO FAZ, E A AUSENCIA E DELIBERADA:
--
-- - **Nao cria `store_items.image_id`.** A versao anterior do apendice A.2 a
--   previa, e o item 16 a substituiu por `store_item_images` antes de ela ser
--   migrada. `store_items.image_path` (caminho externo da massa) continua, e item
--   com ela nao tem linha em `store_item_images` (regra do caso de uso: um
--   `CHECK` nao conta linhas de outra tabela).
-- - **Os tetos de 5 tags por item e de 40 tags ativas sao do caso de uso**, na
--   mesma transacao da escrita. O de 8 imagens e do banco: `position` de 0 a 7
--   com unicidade por item.
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
-- SOBRE O `down`: devolve o esquema da vitrine anterior a esta migracao.
-- `upload_intents` nunca foi tocada, entao nao ha o que devolver nela.

-- Up Migration

-- ---------------------------------------------------------------------------
-- A imagem de catalogo (A.3)
-- ---------------------------------------------------------------------------

-- A intencao de envio do painel e tabela propria (ADR-0027 item 20.2, A.3), e
-- nao uma variante de `upload_intents`: aquela e do app e aponta para `users`,
-- e o painel tem cadastro proprio. Foto de pet, de achador ou de aviso nem
-- existe aqui, entao a chave estrangeira de `catalog_images` recusa o envio
-- errado antes do caso de uso (T9 fechado por esquema).
CREATE TABLE catalog_upload_intents (
  id                uuid        PRIMARY KEY,
  -- Sem ON DELETE: conta do painel nao se apaga, desativa (item 20.1).
  admin_account_id  uuid        NOT NULL REFERENCES admin_accounts (id),
  -- O proposito fica gravado no envio, e a escrita que confirma exige o mesmo
  -- (T9): a capa de um encontro nao vira imagem de produto.
  purpose           text        NOT NULL
                    CONSTRAINT catalog_upload_intents_proposito
                    CHECK (purpose IN ('store_item', 'network_event')),
  -- A chave do objeto no armazenamento PRIVADO. Nunca uma URL.
  object_key        text        NOT NULL,
  -- O que o painel DECLAROU; quem valida e o worker, pelos bytes reais.
  declared_type     text        NOT NULL,
  max_bytes         integer     NOT NULL
                    CONSTRAINT catalog_upload_intents_teto_positivo
                    CHECK (max_bytes > 0),
  expires_at        timestamptz NOT NULL,
  confirmed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX catalog_upload_intents_object_key_unico ON catalog_upload_intents (object_key);
-- O varredor de envios vencidos procura os nao confirmados pelo prazo.
CREATE INDEX catalog_upload_intents_pendentes
  ON catalog_upload_intents (expires_at) WHERE confirmed_at IS NULL;

COMMENT ON TABLE catalog_upload_intents IS
  'Intencao de envio de imagem de catalogo (Loja e Rede) pelo painel, ADR-0027 A.3. Separada de upload_intents, que e do app: nenhuma FK para users.';

CREATE TABLE catalog_images (
  id                uuid        PRIMARY KEY,
  -- Anulavel, com SET NULL: o varredor pode apagar a intencao de envio depois
  -- de confirmada sem levar a imagem que ja esta num produto ou num encontro.
  -- A imagem fica; o que some e a ligacao com o envio (decisao da
  -- coordenacao, 28/09).
  upload_intent_id  uuid        UNIQUE REFERENCES catalog_upload_intents (id) ON DELETE SET NULL,
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
COMMENT ON COLUMN catalog_images.upload_intent_id IS
  'O envio que originou a imagem. Nulo depois que a conta que enviou foi apagada: a imagem continua no produto ou no encontro, e o painel passa a ve-la sem `upload_id`.';
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
  'A PRIMEIRA publicacao, nunca reescrita (ADR-0026 secao 3). `draft` = nulo; `published` = active; `retired` = nao active e nao nulo. Nas linhas publicadas antes da 20260928000003 e o instante dessa migracao, e nao a publicacao real, que ninguem registrou.';
COMMENT ON COLUMN store_items.active IS
  'Esta na vitrine agora. O padrao `true` e da massa; o item escrito pelo painel nasce `false` (rascunho).';

-- ---------------------------------------------------------------------------
-- Especie, tags e imagens do item (A.2.1, item 16)
-- ---------------------------------------------------------------------------

-- Os valores de `ref_species`, os mesmos do cadastro de pet: o app filtra a
-- vitrine pela especie dos pets do tutor sem traduzir uma lista na outra. A
-- chave estrangeira para `code` de dado de referencia e a forma que o portao
-- da BICHUS-19 admite.
CREATE TABLE store_item_species (
  item_id  uuid NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  species  text NOT NULL REFERENCES ref_species (code),
  PRIMARY KEY (item_id, species)
);

CREATE INDEX store_item_species_por_especie ON store_item_species (species, item_id);

COMMENT ON TABLE store_item_species IS
  'A que especies o item serve (1 a 3, regra do caso de uso na criacao e na publicacao). Valores de ref_species.';

-- O vocabulario curado. O `slug` e a chave de normalizacao (sem acento,
-- minusculo): e o indice unico dele que recusa a segunda grafia do mesmo
-- rotulo. Formato COPIADO de `store_items.slug`.
CREATE TABLE store_tags (
  id          uuid        PRIMARY KEY,
  slug        text        NOT NULL
              CONSTRAINT store_tags_slug_formato
              CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  label       text        NOT NULL
              CONSTRAINT store_tags_rotulo_tem_tamanho
              CHECK (char_length(btrim(label)) BETWEEN 2 AND 24),
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  version     integer     NOT NULL DEFAULT 1
              CONSTRAINT store_tags_versao_positiva CHECK (version > 0)
);

CREATE UNIQUE INDEX store_tags_slug_unico ON store_tags (slug);

COMMENT ON COLUMN store_tags.id IS
  'Identidade interna. NUNCA sai em resposta: a tag sai pelo `slug`.';
COMMENT ON COLUMN store_tags.slug IS
  'Derivado do rotulo: NFKD, sem marca diacritica, minusculo, espaco vira hifen. Unico, entao duas grafias do mesmo rotulo sao a mesma tag.';

-- Chave estrangeira para `id`, nunca para `slug` (ADR-0024): renomear a tag
-- troca o `slug`, e a ligacao nao pode depender dele.
CREATE TABLE store_item_tags (
  item_id  uuid NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  tag_id   uuid NOT NULL REFERENCES store_tags (id),
  PRIMARY KEY (item_id, tag_id)
);

CREATE INDEX store_item_tags_por_tag ON store_item_tags (tag_id, item_id);

-- Ate 8 imagens por item, ordenadas. A principal e `position = 0`, e nao ha
-- sinalizador de principal: dois lugares para dizer qual e a principal divergem
-- na primeira troca. A unicidade de `(item_id, position)` e DIFERIDA para que
-- reordenar seja um conjunto de UPDATE na mesma transacao sem colidir no meio.
CREATE TABLE store_item_images (
  item_id   uuid     NOT NULL REFERENCES store_items (id) ON DELETE CASCADE,
  image_id  uuid     NOT NULL UNIQUE REFERENCES catalog_images (id),
  position  smallint NOT NULL
            CONSTRAINT store_item_images_posicao
            CHECK (position BETWEEN 0 AND 7),
  alt_text  text     NOT NULL
            CONSTRAINT store_item_images_texto_alternativo_tem_tamanho
            CHECK (char_length(btrim(alt_text)) BETWEEN 2 AND 150),
  PRIMARY KEY (item_id, image_id),
  CONSTRAINT store_item_images_ordem_unica
    UNIQUE (item_id, position) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON COLUMN store_item_images.alt_text IS
  'Texto alternativo, obrigatorio em TODA posicao: a obrigacao acompanha a imagem que vira principal numa reordenacao.';
COMMENT ON COLUMN store_item_images.position IS
  '0 e a principal (a da lista da Loja). Ate 7: o teto de 8 imagens e este CHECK somado a unicidade por item.';

-- Down Migration

DROP TABLE IF EXISTS store_item_images;
DROP TABLE IF EXISTS store_item_tags;
DROP TABLE IF EXISTS store_tags;
DROP TABLE IF EXISTS store_item_species;

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

DROP TABLE IF EXISTS catalog_upload_intents;
