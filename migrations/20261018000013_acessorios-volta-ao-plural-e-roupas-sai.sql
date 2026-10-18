-- "Acessorios" volta a ser o rotulo de `accessory`, e as ROUPAS saem para uma
-- categoria propria.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE: O ERRO FOI NOSSO
-- ====================================================================
--
-- Em 17/10/2026 o cliente pediu, por extenso: "na categoria do produto, voce
-- deve deixar no plural o acessorios e brinquedos". O pedido FOI CUMPRIDO no
-- mesmo dia, pelo commit `8e88cd0d` ("feat(loja): \"Brinquedos\" e
-- \"Acessorios\" no plural -- rotulo, nunca o codigo"), que trocou
-- `accessory: 'Acessorio'` por `'Acessorios'` e `toy: 'Brinquedo'` por
-- `'Brinquedos'`.
--
-- HORAS DEPOIS, no mesmo dia, o lote de dois niveis (`20261017000003`)
-- reassentou o rotulo na semente de `store_categories` e gravou
-- `('accessory', 'Roupas e acessorios', 10)`. O rotulo mudou de LUGAR -- saiu
-- do codigo do aplicativo e passou a ser dado -- e mudou de TEXTO na mudanca.
-- **Isso ESTREITOU a decisao do cliente sem desfaze-la explicitamente**, e
-- como o aplicativo le `category_label` do servidor, o que ele ve hoje e
-- "Roupas e acessorios" onde pediu "Acessorios". Nao foi decisao, foi
-- atropelo, e esta migracao o desfaz.
--
-- Confirmado por ele em 18/10 ("sim nos dois, pode despachar"), com os dois
-- passos na mesa: o rotulo volta, e as roupas saem para categoria propria.
--
-- ====================================================================
-- POR QUE AS ROUPAS SAEM, E POR QUE `bandanas` FICA
-- ====================================================================
--
-- A categoria `accessory` tem SETE subcategorias e SEIS delas sao roupa:
-- moletons e blusas, vestidos, roupas de verao, capas de chuva, colete
-- salva-vidas e fantasias. A setima e `bandanas`.
--
-- Chamar esse conjunto de "Acessorios" seria rotulo que nao descreve o
-- conteudo -- a objecao foi levantada antes de mexer, e a resposta do cliente
-- foi tirar as roupas, nao desistir do rotulo. `bandanas` FICA em "Acessorios"
-- porque bandana e acessorio, e nao roupa: nao veste o animal.
--
-- `clothing` e o codigo novo, e ele segue a convencao dos 14 existentes --
-- substantivo em INGLES, minusculo, singular: `food`, `treats`, `feeding`,
-- `health`, `potty`, `hygiene`, `beauty`, `toy`, `bed`, `accessory`, `collar`,
-- `transport`, `training`, `fencing`. `roupas` seria a primeira categoria com
-- codigo em portugues, e `clothes` seria plural onde os outros 14 sao
-- singulares. Casa com `store_categories_codigo_formato`.
--
-- ====================================================================
-- "ACESSORIOS PARA ALIMENTACAO" CONVIVE, INTACTA
-- ====================================================================
--
-- `feeding` ('Acessorios para alimentacao') continua categoria de PRIMEIRO
-- NIVEL e nao e tocada aqui. Recomendado e endossado em 18/10. Tres razoes:
-- suas cinco subcategorias (comedouros, bebedouros, alimentadores
-- automaticos, porta-racoes, mamadeiras) sao uma intencao de compra coerente;
-- vira-la subcategoria de "Acessorios" achataria cinco folhas em uma,
-- justamente onde o segundo nivel se paga; e e a forma petlove/cobasi que o
-- cliente escolheu por extenso. Com `accessory` chamando-se "Acessorios", os
-- dois nomes passam a se ler como geral e especifico -- como "Brinquedos" e
-- "Mordedores" --, e nao como duplicata.
--
-- ====================================================================
-- MOVER SUBCATEGORIA **NAO** RECLASSIFICA O PRODUTO NA FOLHA.
-- MEDIDO EM BANCO, E A MEDICAO MUDOU A FORMA DESTA MIGRACAO
-- ====================================================================
--
-- `store_items` guarda O PAR `(category, subcategory)`, e nao so a folha. A
-- pergunta -- mover a subcategoria apaga o vinculo do produto? -- foi medida
-- em banco de descarte, com um produto plantado em `('accessory','vestidos')`:
--
--   UPDATE store_subcategories SET category_code='clothing'
--     WHERE category_code='accessory' AND code='vestidos';
--
--   ERROR: update or delete on table "store_subcategories" violates foreign
--   key constraint "store_items_subcategoria_e_da_categoria" on table
--   "store_items"
--   DETAIL: Key (category_code, code)=(accessory, vestidos) is still
--   referenced from table "store_items".
--
-- **O vinculo NAO e apagado: o banco RECUSA a mudanca.** A chave estrangeira
-- composta protege o produto. (Antes dela, `store_subcategory_species` recusa
-- pelo mesmo motivo.) Entao a resposta tem duas metades, e as duas importam:
--
-- - a FOLHA do produto sobrevive, sim -- `subcategory` nao e tocada;
-- - mas `store_items.category` TEM de ser reescrita no mesmo passo, senao a
--   mudanca nao acontece de forma alguma. Nao e automatico, e nao e de graca.
--
-- Por isso a sequencia abaixo e em LOCKSTEP, e nao um `UPDATE` da chave: a
-- folha nasce no pai novo, o produto acompanha, e so depois a folha antiga sai
-- do vocabulario. Medido no mesmo banco de descarte: o produto termina com
-- `pai = clothing` e `folha = vestidos` -- de categoria trocada, de
-- subcategoria intacta.
--
-- ====================================================================
-- NADA E APAGADO, E O MECANISMO JA ESTAVA ESCRITO
-- ====================================================================
--
-- A folha antiga fica INATIVA, nunca apagada -- e isso nao e invencao desta
-- migracao. `store_categories.active` ja diz, em `COMMENT`: "Categoria
-- retirada do vocabulario fica inativa, nunca apagada: apagar arrastaria os
-- itens pela chave estrangeira." A leitura de `GET /v1/store/taxonomy` filtra
-- `active = true`, entao a folha desativada sai da resposta sem sair do banco,
-- e o movimento e reversivel por `UPDATE`.
--
-- Zero `DELETE` no caminho de subida. Nenhuma categoria e nenhuma
-- subcategoria deixam de existir.
--
-- ====================================================================
-- A CONTAGEM DOS AFETADOS NAO FICA MUDA
-- ====================================================================
--
-- `RAISE NOTICE` de migracao nao chega a ninguem: o `node-pg-migrate` o
-- descarta. Entao quantos produtos o movimento reclassificou de PAI vai para
-- `audit.events`, que e onde a trilha mora. Se a contagem for zero -- o
-- esperado, porque `store_items.subcategory` nasceu NULA em toda linha
-- existente na `20261017000003` e o unico produto de hml e anterior a ela --
-- a linha registra zero, que e a prova de que nada foi reclassificado.

-- Up Migration

-- 1. O ROTULO VOLTA. Um UPDATE, zero produto tocado: `code` nao muda, entao
--    nenhum filtro `?category=accessory` do APK publicado deixa de responder.
UPDATE store_categories SET label = 'Acessórios' WHERE code = 'accessory';

-- 2. "Roupas" entra ao LADO de "Acessorios", e nao no fim da lista. Abre o
--    lugar 11 empurrando os quatro seguintes; `sort_order` nao e unico e nao
--    e dado de produto -- e ordem de tela.
UPDATE store_categories SET sort_order = sort_order + 1 WHERE sort_order >= 11;

INSERT INTO store_categories (code, label, sort_order) VALUES
  ('clothing', 'Roupas', 11);

-- 3. As SEIS folhas de roupa nascem sob o pai novo, com o MESMO codigo e o
--    MESMO rotulo: o codigo da folha e o que o produto guarda, e trocar isso
--    seria justamente a reclassificacao que nao se faz. `sort_order`
--    renumerado de 1 a 6 porque `colete_salva_vidas` era 5 e `fantasias` 6
--    numa lista que tinha 7.
INSERT INTO store_subcategories (category_code, code, label, sort_order) VALUES
  ('clothing', 'moletons_e_blusas',  'Moletons e blusas',  1),
  ('clothing', 'vestidos',           'Vestidos',           2),
  ('clothing', 'roupas_de_verao',    'Roupas de verão',    3),
  ('clothing', 'capas_de_chuva',     'Capas de chuva',     4),
  ('clothing', 'colete_salva_vidas', 'Colete salva-vidas', 5),
  ('clothing', 'fantasias',          'Fantasias',          6);

-- 4. A especie acompanha a folha. Copiada da linha antiga em vez de escrita a
--    mao: se a arvore de gato tiver sido levantada para alguma destas folhas
--    depois de 17/10, a copia a traz e o literal 'dog' a perderia.
INSERT INTO store_subcategory_species (category_code, code, species_code)
SELECT 'clothing', s.code, s.species_code
  FROM store_subcategory_species s
 WHERE s.category_code = 'accessory'
   AND s.code IN ('moletons_e_blusas', 'vestidos', 'roupas_de_verao',
                  'capas_de_chuva', 'colete_salva_vidas', 'fantasias');

-- 5. O PRODUTO ACOMPANHA, e e ESTE passo que a medicao acima tornou
--    obrigatorio. So o PAI muda; `subcategory` nao aparece no SET.
UPDATE store_items SET category = 'clothing'
 WHERE category = 'accessory'
   AND subcategory IN ('moletons_e_blusas', 'vestidos', 'roupas_de_verao',
                       'capas_de_chuva', 'colete_salva_vidas', 'fantasias');

-- 6. A contagem vai para a trilha, porque NOTICE nao chega a ninguem.
INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, metadata)
SELECT gen_random_uuid(),
       'system',
       'subcategoria_de_roupa_mudou_de_categoria',
       'store_item',
       NULL,
       jsonb_build_object(
         'produtos_com_pai_reescrito', (SELECT count(*) FROM store_items
                                         WHERE category = 'clothing'),
         'folha_preservada', true,
         'de', 'accessory',
         'para', 'clothing',
         'motivo', 'cliente 18/10: rotulo de accessory volta a "Acessorios" e as roupas saem para categoria propria',
         'migracao', '20261018000013_acessorios-volta-ao-plural-e-roupas-sai');

-- 7. A folha antiga sai do VOCABULARIO, nunca do banco. Depois do passo 5
--    nenhum produto a referencia; a linha fica como registro reversivel.
UPDATE store_subcategories SET active = false
 WHERE category_code = 'accessory'
   AND code IN ('moletons_e_blusas', 'vestidos', 'roupas_de_verao',
                'capas_de_chuva', 'colete_salva_vidas', 'fantasias');

COMMENT ON COLUMN store_categories.label IS
  'O texto que a tela mostra. **E dado**, e e por isso que renomear "Alimentacao" para "Racoes" foi um UPDATE e nao um APK. O aplicativo publicado antes de 17/10 carrega os rotulos em codigo e continuara mostrando os antigos. Em 18/10/2026 `accessory` voltou a "Acessorios", no plural: a 20261017000003 havia gravado "Roupas e acessorios" horas depois de o commit 8e88cd0d cumprir o pedido de plural do cliente, estreitando a decisao dele sem desfaze-la -- e as seis folhas de roupa saíram para `clothing`.';

-- Down Migration

-- A ordem e a inversa exata da subida.
UPDATE store_subcategories SET active = true
 WHERE category_code = 'accessory'
   AND code IN ('moletons_e_blusas', 'vestidos', 'roupas_de_verao',
                'capas_de_chuva', 'colete_salva_vidas', 'fantasias');

-- O produto volta ao pai antigo, com a folha intacta pelo mesmo motivo.
UPDATE store_items SET category = 'accessory'
 WHERE category = 'clothing'
   AND subcategory IN ('moletons_e_blusas', 'vestidos', 'roupas_de_verao',
                       'capas_de_chuva', 'colete_salva_vidas', 'fantasias');

-- Aqui o DELETE e legitimo: desfaz o que ESTA migracao inseriu, e nao dado do
-- cliente. Sem ele a descida deixaria a categoria `clothing` orfa no
-- vocabulario, e `make migrar-baixo` existe para provar que a volta e limpa.
DELETE FROM store_subcategory_species WHERE category_code = 'clothing';
DELETE FROM store_subcategories WHERE category_code = 'clothing';
DELETE FROM store_categories WHERE code = 'clothing';

UPDATE store_categories SET sort_order = sort_order - 1 WHERE sort_order >= 12;

UPDATE store_categories SET label = 'Roupas e acessórios' WHERE code = 'accessory';
