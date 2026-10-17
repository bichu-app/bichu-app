-- A categoria do produto da Loja passa a ter DOIS NIVEIS, e os dois sao DADO.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: o cliente pesquisou petz,
-- cobasi e petlove, levou as 12 categorias comuns aos tres e decidiu, por
-- extenso, "dois niveis, com subcategorias como a petlove". A vitrine tinha um
-- nivel so, com SEIS valores, numa lista fechada escrita em tres arquivos.
--
-- ====================================================================
-- TABELA, E NAO `CHECK` MAIOR: A ESCOLHA, E A RAZAO DELA
-- ====================================================================
--
-- A `20260922000023` poe a categoria num `CHECK (category IN (...))`, e o
-- ADR-0023 secao 3 cobra que acrescentar valor seja tres arquivos no mesmo
-- commit: a migracao, a entrada em `conjunto-exato-dos-checks.test.ts` e o
-- `enum` do contrato. Com SEIS valores isso e barato e a trava vale a pena.
--
-- Com 14 categorias e 83 subcategorias ela deixa de valer, e nao por volume:
--
-- 1. **A subcategoria pertence a uma categoria.** Um `CHECK` sabe dizer que
--    `bifinhos` e um valor valido; nao sabe dizer que ele pertence a
--    `treats` e nao a `food`. A relacao entre os dois niveis nao cabe num
--    conjunto de literais -- ela cabe numa CHAVE ESTRANGEIRA COMPOSTA, e e
--    isso que esta migracao usa.
-- 2. **A arvore varia por especie.** A petlove tem `arranhador` e `areia` para
--    gato e nao para cachorro. Um `enum` nao tem onde guardar "esta
--    subcategoria vale para estas especies"; uma tabela de ligacao tem.
-- 3. **Cada ajuste futuro seria mudanca de contrato das QUATRO aplicacoes.**
--    Com `enum` no `openapi.yaml`, acrescentar "Areia e granulado" obrigaria
--    migracao + contrato + tipos gerados do backend, do painel e do site, e um
--    APK novo. Com tabela, e uma linha de semente.
--
-- A forma e COPIADA de `ref_breeds` (`20260917000003`), que ja e exatamente
-- este problema resolvido: `ref_breeds.code` e texto com formato, aponta para
-- `ref_species (code)` por chave estrangeira, e o contrato publica `breed_code`
-- como **string**, nao como `enum` -- a lista fechada mora na tabela e sai por
-- `GET /v1/public/reference-data`. Uma segunda convencao para o mesmo problema
-- e a convencao que diverge.
--
-- A lista continua FECHADA: quem fecha deixou de ser o `CHECK` e passou a ser a
-- chave estrangeira de `store_items.category`, que o banco nao deixa violar, e
-- a conferencia de `active` na escrita administrativa.
--
-- ====================================================================
-- O APLICATIVO PUBLICADO: OS SEIS VALORES ANTIGOS CONTINUAM VALENDO
-- ====================================================================
--
-- O cliente tem APK instalado, e o produto ja pagou por esta licao uma vez: a
-- unidade de preco teve de virar `per_pet` de forma ADITIVA, porque trocar
-- `per_dog` quebraria o binario no bolso dele.
--
-- Entao **nenhum codigo de categoria e trocado nem renomeado aqui**. Os seis
-- (`food`, `toy`, `hygiene`, `accessory`, `health`, `bed`) entram em
-- `store_categories` como os codigos canonicos das seis categorias novas
-- equivalentes, e as outras OITO nascem com codigo novo. Nenhuma linha de
-- `store_items` e reescrita, nenhum filtro `?category=food` do APK publicado
-- deixa de responder, e nenhuma resposta troca o codigo de um item existente.
--
-- O que MUDA para o APK publicado e o ROTULO, e so ele: `food` deixa de se
-- chamar "Alimentacao" e passa a se chamar "Racoes", porque agora existe
-- `treats` ("Petiscos e ossos") ao lado. O APK publicado carrega os rotulos
-- em codigo (`CategoriaDaLoja` em `modelos_loja.dart`), entao ele continuara
-- escrevendo "Alimentacao" ate a proxima versao. **Isto esta relatado ao
-- cliente**, nao escondido: e divergencia de rotulo num filtro, e nao item
-- que desaparece nem tela que estoura.
--
-- O MAPA DOS SEIS, por extenso. Tres deles ESTREITAM o sentido, e os tres
-- estao na pauta do cliente:
--
--   food      -> Racoes                        (ESTREITA: petisco sai para `treats`)
--   toy       -> Brinquedos                    (igual)
--   hygiene   -> Higiene e limpeza             (igual)
--   health    -> Medicamentos                  (ESTREITA: "Saude" era mais largo)
--   bed       -> Camas e casinhas              (igual)
--   accessory -> Roupas e acessorios           (ESTREITA e e AMBIGUO: podia ser
--                                               `collar` ou `feeding`)
--
-- Nenhum item existente e remapeado por esta migracao, justamente porque o
-- sentido estreitou em tres casos: reclassificar produto cadastrado e decisao
-- de curadoria, e nao de migracao.
--
-- ====================================================================
-- A SUBCATEGORIA E OPCIONAL, E A COLUNA NASCE NULA
-- ====================================================================
--
-- `store_items.subcategory` e anulavel e nasce nula em toda linha existente.
-- Produto sem subcategoria continua valido, e tem de continuar: exigi-la
-- invalidaria todo cadastro anterior de uma vez.
--
-- A chave estrangeira e COMPOSTA, `(category, subcategory)` contra
-- `store_subcategories (category_code, code)`, e o `MATCH SIMPLE` do Postgres
-- (o padrao) e a razao de ela funcionar com a coluna opcional: com qualquer
-- coluna da chave nula, a restricao NAO e cobrada. Subcategoria nula passa;
-- subcategoria preenchida tem de existir DENTRO da categoria do item. "A
-- subcategoria pertence a categoria escolhida" deixa de ser conferencia da
-- aplicacao e passa a ser estado que o banco RECUSA.
--
-- ====================================================================
-- A ARVORE AQUI E A DE CACHORRO, E SO ELA
-- ====================================================================
--
-- As 83 subcategorias sao as que o cliente leu na pagina de CACHORRO da
-- petlove. As arvores de gato (areia, banheiro, arranhador), passaro, peixe e
-- "outros" **nao foram levantadas e nao estao aqui**. Inventa-las seria por no
-- banco um vocabulario que ninguem conferiu, com a aparencia de ter sido
-- conferido.
--
-- `store_subcategory_species` e onde a variacao por especie mora. Cada uma das
-- 83 linhas ganha `dog`, porque `dog` e o que foi levantado. Quando a arvore de
-- gato vier, ela entra como linha de semente -- e as subcategorias que as duas
-- especies compartilham (racao seca, shampoo) ganham a segunda linha, sem
-- duplicar a subcategoria.
--
-- **O painel ainda nao filtra por especie**, e a ausencia e deliberada: o
-- recorte pedido e "subcategoria filtrada pela categoria escolhida". A tabela
-- existe para a arvore de gato ter onde chegar sem outra migracao de forma.

-- Up Migration

CREATE TABLE store_categories (
  code        text     PRIMARY KEY
              CONSTRAINT store_categories_codigo_formato
              CHECK (code ~ '^[a-z][a-z0-9_]{1,29}$'),
  label       text     NOT NULL
              CONSTRAINT store_categories_rotulo_tem_tamanho
              CHECK (char_length(btrim(label)) BETWEEN 2 AND 40),
  sort_order  smallint NOT NULL,
  active      boolean  NOT NULL DEFAULT true
);

COMMENT ON TABLE store_categories IS
  'O primeiro nivel da categoria do produto (decisao do cliente de 17/10: "dois niveis, com subcategorias como a petlove"). Forma copiada de `ref_breeds`/`ref_species`: a lista e fechada pela chave estrangeira de `store_items.category`, nao por `CHECK`.';
COMMENT ON COLUMN store_categories.code IS
  'O codigo que sai em resposta e entra em `?category=`. Os seis valores do `CHECK` que esta migracao removeu (`food`, `toy`, `hygiene`, `accessory`, `health`, `bed`) continuam aqui, com os MESMOS codigos: o APK publicado filtra por eles e le os itens por eles.';
COMMENT ON COLUMN store_categories.label IS
  'O texto que a tela mostra. **E dado**, e e por isso que renomear "Alimentacao" para "Racoes" foi um UPDATE e nao um APK. O aplicativo publicado antes de 17/10 carrega os rotulos em codigo e continuara mostrando os antigos.';
COMMENT ON COLUMN store_categories.active IS
  'Categoria retirada do vocabulario fica inativa, nunca apagada: apagar arrastaria os itens pela chave estrangeira. A escrita administrativa recusa categoria inativa; a leitura publica continua mostrando o item que ja a usa.';

CREATE INDEX store_categories_ordem ON store_categories (sort_order, code) WHERE active;

CREATE TABLE store_subcategories (
  category_code text     NOT NULL REFERENCES store_categories (code),
  code          text     NOT NULL
                CONSTRAINT store_subcategories_codigo_formato
                CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label         text     NOT NULL
                CONSTRAINT store_subcategories_rotulo_tem_tamanho
                CHECK (char_length(btrim(label)) BETWEEN 2 AND 40),
  sort_order    smallint NOT NULL,
  active        boolean  NOT NULL DEFAULT true,
  PRIMARY KEY (category_code, code)
);

COMMENT ON TABLE store_subcategories IS
  'O segundo nivel. A chave primaria e COMPOSTA de proposito: e ela que `store_items (category, subcategory)` referencia, e e isso que faz "a subcategoria pertence a categoria escolhida" ser invariante de banco, e nao `if` de aplicacao.';
COMMENT ON COLUMN store_subcategories.code IS
  'Unico DENTRO da categoria, nao globalmente: `banheiros` de `potty` e `banheiros` de uma arvore futura de gato seriam a mesma subcategoria da mesma categoria, e o par e que identifica.';

CREATE INDEX store_subcategories_da_categoria
  ON store_subcategories (category_code, sort_order, code) WHERE active;

CREATE TABLE store_subcategory_species (
  category_code text NOT NULL,
  code          text NOT NULL,
  species_code  text NOT NULL REFERENCES ref_species (code),
  PRIMARY KEY (category_code, code, species_code),
  FOREIGN KEY (category_code, code) REFERENCES store_subcategories (category_code, code) ON DELETE CASCADE
);

COMMENT ON TABLE store_subcategory_species IS
  'Para que especies cada subcategoria foi LEVANTADA. A arvore de 17/10 e a de CACHORRO da petlove, entao toda linha aqui e `dog`. Gato, passaro, peixe e outros ficaram de fora e precisam ser levantados -- esta tabela e onde eles entram, sem migracao de forma.';
COMMENT ON COLUMN store_subcategory_species.species_code IS
  'Valor de `ref_species`. Subcategoria SEM nenhuma linha aqui vale para todas as especies; com linha, vale para as listadas. Nenhuma consulta de leitura publica depende disto ainda: o filtro pedido em 17/10 e por categoria.';

CREATE INDEX store_subcategory_species_por_especie
  ON store_subcategory_species (species_code, category_code, code);

-- ------------------------------------------------------------------
-- As 14 categorias. A ORDEM e a da arvore da petlove, como o cliente a leu.
-- ------------------------------------------------------------------
INSERT INTO store_categories (code, label, sort_order) VALUES
  ('food',      'Rações',                        1),
  ('treats',    'Petiscos e ossos',              2),
  ('feeding',   'Acessórios para alimentação',   3),
  ('health',    'Medicamentos',                  4),
  ('potty',     'Tapetes higiênicos e banheiros',5),
  ('hygiene',   'Higiene e limpeza',             6),
  ('beauty',    'Beleza',                        7),
  ('toy',       'Brinquedos',                    8),
  ('bed',       'Camas e casinhas',              9),
  ('accessory', 'Roupas e acessórios',          10),
  ('collar',    'Coleiras, guias e peitorais',  11),
  ('transport', 'Transporte',                   12),
  ('training',  'Adestramento e comportamento', 13),
  ('fencing',   'Cercados, portões e escadas',  14);

-- ------------------------------------------------------------------
-- As 83 subcategorias da arvore de CACHORRO. Nenhuma outra especie.
-- ------------------------------------------------------------------
INSERT INTO store_subcategories (category_code, code, label, sort_order) VALUES
  ('food', 'racao_seca',                    'Ração seca',                       1),
  ('food', 'racao_natural',                 'Ração natural',                    2),
  ('food', 'racao_umida',                   'Ração úmida',                      3),
  ('food', 'racao_medicamentosa',           'Ração medicamentosa',              4),
  ('food', 'alimentacao_natural_fresca',    'Alimentação natural fresca',       5),
  ('food', 'alimentacao_natural_congelada', 'Alimentação natural congelada',    6),

  ('treats', 'cuidado_oral',        'Cuidado oral',        1),
  ('treats', 'petisco_natural',     'Petisco natural',     2),
  ('treats', 'bifinhos',            'Bifinhos',            3),
  ('treats', 'biscoitos_e_snacks',  'Biscoitos e snacks',  4),
  ('treats', 'ossos_e_mordedores',  'Ossos e mordedores',  5),
  ('treats', 'molhos',              'Molhos',              6),
  ('treats', 'petisco_cremoso',     'Petisco cremoso',     7),
  ('treats', 'grama_digestiva',     'Grama digestiva',     8),

  ('feeding', 'comedouros',                'Comedouros',                1),
  ('feeding', 'bebedouros',                'Bebedouros',                2),
  ('feeding', 'alimentadores_automaticos', 'Alimentadores automáticos', 3),
  ('feeding', 'porta_racoes',              'Porta-rações',              4),
  ('feeding', 'mamadeiras',                'Mamadeiras',                5),

  ('health', 'antipulgas_e_carrapatos',  'Antipulgas e carrapatos',  1),
  ('health', 'vermifugos',               'Vermífugos',               2),
  ('health', 'vitaminas_e_suplementos',  'Vitaminas e suplementos',  3),
  ('health', 'probioticos',              'Probióticos',              4),
  ('health', 'anti_inflamatorios',       'Anti-inflamatórios',       5),
  ('health', 'antibioticos',             'Antibióticos',             6),
  ('health', 'tratamentos_para_pele',    'Tratamentos para pele',    7),
  ('health', 'tratamentos_para_orelhas', 'Tratamentos para orelhas', 8),
  ('health', 'tratamentos_para_olhos',   'Tratamentos para olhos',   9),
  ('health', 'tratamento_dentario',      'Tratamento dentário',     10),
  ('health', 'colar_elizabetano',        'Colar elizabetano',       11),
  ('health', 'analgesico',               'Analgésico',              12),
  ('health', 'antisseptico',             'Antisséptico',            13),

  ('potty', 'tapetes_higienicos', 'Tapetes higiênicos', 1),
  ('potty', 'banheiros',          'Banheiros',          2),
  ('potty', 'fraldas',            'Fraldas',            3),
  ('potty', 'granulado',          'Granulado',          4),

  ('hygiene', 'higiene_dental',                   'Higiene dental',                   1),
  ('hygiene', 'eliminador_de_odores',             'Eliminador de odores',             2),
  ('hygiene', 'lencos_umedecidos',                'Lenços umedecidos',                3),
  ('hygiene', 'coletor_de_fezes',                 'Coletor de fezes',                 4),
  ('hygiene', 'escovas_tesouras_e_rasqueadeiras', 'Escovas, tesouras e rasqueadeiras',5),
  ('hygiene', 'cortadores_de_unha',               'Cortadores de unha',               6),
  ('hygiene', 'limpa_patas',                      'Limpa-patas',                      7),
  ('hygiene', 'maquina_de_tosa',                  'Máquina de tosa',                  8),

  ('beauty', 'shampoos',             'Shampoos',             1),
  ('beauty', 'condicionadores',      'Condicionadores',      2),
  ('beauty', 'hidratantes',          'Hidratantes',          3),
  ('beauty', 'perfumes_e_colonias',  'Perfumes e colônias',  4),
  ('beauty', 'banho_a_seco',         'Banho a seco',         5),
  ('beauty', 'desembaracante',       'Desembaraçante',       6),
  ('beauty', 'sabonetes',            'Sabonetes',            7),
  ('beauty', 'protetor_solar',       'Protetor solar',       8),

  ('toy', 'mordedores',             'Mordedores',             1),
  ('toy', 'bolinhas',               'Bolinhas',               2),
  ('toy', 'cordas',                 'Cordas',                 3),
  ('toy', 'pelucia',                'Pelúcia',                4),
  ('toy', 'brinquedos_interativos', 'Brinquedos interativos',  5),
  ('toy', 'frisbees',               'Frisbees',               6),

  ('bed', 'caminhas',                 'Caminhas',                 1),
  ('bed', 'almofadas_e_colchonetes',  'Almofadas e colchonetes',  2),
  ('bed', 'casinhas',                 'Casinhas',                 3),
  ('bed', 'mantas_e_cobertores',      'Mantas e cobertores',      4),

  ('accessory', 'moletons_e_blusas',   'Moletons e blusas',   1),
  ('accessory', 'vestidos',            'Vestidos',            2),
  ('accessory', 'roupas_de_verao',     'Roupas de verão',     3),
  ('accessory', 'capas_de_chuva',      'Capas de chuva',      4),
  ('accessory', 'colete_salva_vidas',  'Colete salva-vidas',  5),
  ('accessory', 'fantasias',           'Fantasias',           6),
  ('accessory', 'bandanas',            'Bandanas',            7),

  ('collar', 'peitorais',           'Peitorais',           1),
  ('collar', 'coleiras',            'Coleiras',            2),
  ('collar', 'guias',               'Guias',               3),
  ('collar', 'focinheiras',         'Focinheiras',         4),
  ('collar', 'tag_de_identificacao','Tag de identificação',5),

  ('transport', 'caixas_de_transporte',  'Caixas de transporte',  1),
  ('transport', 'bolsas_de_transporte',  'Bolsas de transporte',  2),
  ('transport', 'acessorios_para_carro', 'Acessórios para carro', 3),

  ('training', 'acessorios_para_treinamento',     'Acessórios para treinamento',     1),
  ('training', 'cuidados_especiais_e_mobilidade', 'Cuidados especiais e mobilidade', 2),
  ('training', 'equipamentos_de_exercicio',       'Equipamentos de exercício',       3),

  ('fencing', 'cercados_e_canis',  'Cercados e canis',  1),
  ('fencing', 'portoes_e_grades',  'Portões e grades',  2),
  ('fencing', 'escadas',           'Escadas',           3);

-- Toda subcategoria de 17/10 foi levantada para CACHORRO, e so para ele.
INSERT INTO store_subcategory_species (category_code, code, species_code)
SELECT category_code, code, 'dog' FROM store_subcategories;

-- ------------------------------------------------------------------
-- `store_items`: a categoria vira chave estrangeira, e a subcategoria nasce.
-- ------------------------------------------------------------------
--
-- A ORDEM importa. A chave estrangeira entra ANTES de o `CHECK` sair, para nao
-- haver instante nenhum em que a coluna aceite valor fora da lista -- e para
-- que um item com categoria que nao esteja em `store_categories` reprove a
-- migracao aqui, em voz alta, em vez de virar linha orfa em silencio.
ALTER TABLE store_items
  ADD CONSTRAINT store_items_categoria_existe
  FOREIGN KEY (category) REFERENCES store_categories (code);

ALTER TABLE store_items
  DROP CONSTRAINT store_items_categoria;

ALTER TABLE store_items
  ADD COLUMN subcategory text
             CONSTRAINT store_items_subcategoria_formato
             CHECK (subcategory IS NULL OR subcategory ~ '^[a-z][a-z0-9_]{1,39}$');

ALTER TABLE store_items
  ADD CONSTRAINT store_items_subcategoria_e_da_categoria
  FOREIGN KEY (category, subcategory) REFERENCES store_subcategories (category_code, code);

COMMENT ON COLUMN store_items.category IS
  'O primeiro nivel, por chave estrangeira para `store_categories (code)`. Era um `CHECK` de seis literais ate 17/10/2026; os seis codigos continuam validos e nenhuma linha foi reescrita. Acrescentar categoria passou a ser linha de semente, e nao mudanca de contrato das quatro aplicacoes.';
COMMENT ON COLUMN store_items.subcategory IS
  'O segundo nivel, OPCIONAL. Nulo e estado normal: produto sem subcategoria continua valido, e exigi-la invalidaria todo cadastro anterior. A chave estrangeira COMPOSTA com `category` e `MATCH SIMPLE`: com esta coluna nula a restricao nao e cobrada, e preenchida ela obriga o par a existir em `store_subcategories`.';

CREATE INDEX store_items_por_subcategoria
  ON store_items (category, subcategory, sort_order, slug)
  WHERE active AND subcategory IS NOT NULL;

-- Down Migration

-- Reverter com item subcategorizado APAGARIA a classificacao de segundo nivel
-- que alguem fez a mao, e a descida nao tem como recuperar o que a coluna
-- levar. Mesma forma da `20261017000001`: a descida reprova em voz alta em vez
-- de descartar trabalho em silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM store_items WHERE subcategory IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha item com subcategoria preenchida: reverter apagaria a classificacao de segundo nivel. Limpe `store_items.subcategory` antes.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM store_items
    WHERE category NOT IN ('food', 'toy', 'hygiene', 'accessory', 'health', 'bed')
  ) THEN
    RAISE EXCEPTION
      'ha item numa das oito categorias novas: reverter poria o `CHECK` de seis valores de volta e ele recusaria estas linhas. Mova esses itens para uma das seis categorias antigas antes.';
  END IF;
END
$$;

DROP INDEX store_items_por_subcategoria;

ALTER TABLE store_items
  DROP CONSTRAINT store_items_subcategoria_e_da_categoria;

ALTER TABLE store_items
  DROP CONSTRAINT store_items_subcategoria_formato,
  DROP COLUMN subcategory;

ALTER TABLE store_items
  ADD CONSTRAINT store_items_categoria
  CHECK (category IN ('food', 'toy', 'hygiene', 'accessory', 'health', 'bed'));

ALTER TABLE store_items
  DROP CONSTRAINT store_items_categoria_existe;

COMMENT ON COLUMN store_items.category IS NULL;

DROP INDEX store_subcategory_species_por_especie;
DROP TABLE store_subcategory_species;
DROP INDEX store_subcategories_da_categoria;
DROP TABLE store_subcategories;
DROP INDEX store_categories_ordem;
DROP TABLE store_categories;
