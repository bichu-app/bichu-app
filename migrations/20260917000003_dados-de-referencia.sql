-- BICHUS-90 — especie, raca, porte e cor como lista fechada e versionada.
--
-- Existe porque o cruzamento por atributos nao pode depender de texto livre:
-- raca digitada a mao produz falso negativo justamente no caso que importa, que
-- e o cruzamento entre um caso de perdido e um achado avulso descritos por duas
-- pessoas diferentes (docs/03-arquitetura.md 4.9).
--
-- Criterio 5 da historia: quando uma versao nova entra, os registros ja
-- cadastrados NAO sao reescritos. Por isso codigo retirado e marcado como
-- inativo, nunca apagado: apagar quebraria a chave estrangeira dos pets ja
-- gravados e reescreveria o passado. A coluna que grava a versao usada em cada
-- pet pertence a tabela `pets`, e nao a esta migracao.

-- Up Migration

CREATE TABLE ref_data_versions (
  version       text        PRIMARY KEY,
  published_at  timestamptz NOT NULL DEFAULT now(),
  is_current    boolean     NOT NULL DEFAULT false
);

-- Uma versao corrente e so uma. O indice parcial torna "duas correntes" um
-- estado que o banco recusa, em vez de uma regra que alguem precisa lembrar.
CREATE UNIQUE INDEX ref_data_versions_uma_corrente
  ON ref_data_versions ((is_current))
  WHERE is_current;

CREATE TABLE ref_species (
  code        text     PRIMARY KEY CHECK (code IN ('dog', 'cat', 'other')),
  label       text     NOT NULL,
  sort_order  smallint NOT NULL,
  active      boolean  NOT NULL DEFAULT true
);

CREATE TABLE ref_sizes (
  code         text     PRIMARY KEY CHECK (code IN ('P', 'M', 'G', 'GG')),
  label        text     NOT NULL,
  weight_hint  text     NOT NULL,
  sort_order   smallint NOT NULL,
  active       boolean  NOT NULL DEFAULT true
);

CREATE TABLE ref_colors (
  code        text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,29}$'),
  label       text     NOT NULL,
  sort_order  smallint NOT NULL,
  active      boolean  NOT NULL DEFAULT true
);

CREATE TABLE ref_breeds (
  code         text     PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label        text     NOT NULL,
  species_code text     NOT NULL REFERENCES ref_species (code),
  sort_order   smallint NOT NULL,
  active       boolean  NOT NULL DEFAULT true
);

CREATE INDEX ref_breeds_por_especie ON ref_breeds (species_code) WHERE active;

INSERT INTO ref_data_versions (version, is_current) VALUES ('2026-09-17.1', true);

INSERT INTO ref_species (code, label, sort_order) VALUES
  ('dog',   'Cachorro', 1),
  ('cat',   'Gato',     2),
  ('other', 'Outro',    3);

-- O rotulo carrega a faixa de peso porque "porte M" nao quer dizer a mesma
-- coisa para duas pessoas, e o cruzamento depende de as duas escolherem igual.
INSERT INTO ref_sizes (code, label, weight_hint, sort_order) VALUES
  ('P',  'Pequeno',       'até 10 kg',   1),
  ('M',  'Médio',         '10 a 25 kg',  2),
  ('G',  'Grande',        '25 a 45 kg',  3),
  ('GG', 'Muito grande',  'acima de 45 kg', 4);

-- Cor e SEMPRE rotulada em texto (criterio 4): sob sol, e para quem nao
-- distingue cores, amostra sem rotulo e adivinhacao.
INSERT INTO ref_colors (code, label, sort_order) VALUES
  ('preto',     'Preto',            1),
  ('branco',    'Branco',           2),
  ('caramelo',  'Caramelo',         3),
  ('marrom',    'Marrom',           4),
  ('cinza',     'Cinza',            5),
  ('dourado',   'Dourado',          6),
  ('bege',      'Bege',             7),
  ('creme',     'Creme',            8),
  ('laranja',   'Laranja',          9),
  ('tricolor',  'Tricolor',        10),
  ('malhado',   'Malhado',         11),
  ('rajado',    'Rajado (tigrado)', 12),
  ('mesclado',  'Mesclado',        13);

INSERT INTO ref_breeds (code, label, species_code, sort_order) VALUES
  -- `srd` vem primeiro de proposito nas duas especies: e a resposta mais comum
  -- no Brasil, e lista que esconde o caso majoritario empurra para texto livre.
  ('srd_dog',            'SRD (sem raça definida)', 'dog',  1),
  ('shih_tzu',           'Shih Tzu',                'dog',  2),
  ('poodle',             'Poodle',                  'dog',  3),
  ('pinscher',           'Pinscher',                'dog',  4),
  ('yorkshire',          'Yorkshire Terrier',       'dog',  5),
  ('labrador',           'Labrador Retriever',      'dog',  6),
  ('golden_retriever',   'Golden Retriever',        'dog',  7),
  ('pastor_alemao',      'Pastor Alemão',           'dog',  8),
  ('bulldog_frances',    'Bulldog Francês',         'dog',  9),
  ('rottweiler',         'Rottweiler',              'dog', 10),
  ('dachshund',          'Dachshund (salsicha)',    'dog', 11),
  ('border_collie',      'Border Collie',           'dog', 12),
  ('beagle',             'Beagle',                  'dog', 13),
  ('pug',                'Pug',                     'dog', 14),
  ('maltes',             'Maltês',                  'dog', 15),
  ('spitz_alemao',       'Spitz Alemão (lulu)',     'dog', 16),
  ('chihuahua',          'Chihuahua',               'dog', 17),
  ('cocker_spaniel',     'Cocker Spaniel',          'dog', 18),
  ('boxer',              'Boxer',                   'dog', 19),
  ('husky_siberiano',    'Husky Siberiano',         'dog', 20),
  ('srd_cat',            'SRD (sem raça definida)', 'cat',  1),
  ('siames',             'Siamês',                  'cat',  2),
  ('persa',              'Persa',                   'cat',  3),
  ('maine_coon',         'Maine Coon',              'cat',  4),
  ('angora',             'Angorá',                  'cat',  5),
  ('sphynx',             'Sphynx',                  'cat',  6),
  ('bengal',             'Bengal',                  'cat',  7),
  ('ragdoll',            'Ragdoll',                 'cat',  8),
  ('british_shorthair',  'British Shorthair',       'cat',  9);

-- Down Migration

DROP TABLE IF EXISTS ref_breeds;
DROP TABLE IF EXISTS ref_colors;
DROP TABLE IF EXISTS ref_sizes;
DROP TABLE IF EXISTS ref_species;
DROP TABLE IF EXISTS ref_data_versions;
