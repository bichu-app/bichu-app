-- Tres pedidos do cliente de 17/10/2026, na mesma migracao porque tocam as
-- duas tabelas da galeria do produto e nao faz sentido duas migracoes
-- concorrendo pelo mesmo carimbo.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: o rascunho da `Loja` prometia
-- guardar trabalho incompleto e nao cabia no esquema, e o texto alternativo da
-- imagem era cobrado por uma coluna `NOT NULL` que o cliente pediu para
-- afrouxar.
--
-- O QUE ELA FAZ, UM ITEM POR PEDIDO:
--
-- - **Texto alternativo opcional** (`store_item_images.alt_text`): sai o
--   `NOT NULL`. O `CHECK` de tamanho FICA COMO ESTA, e isso e deliberado: em
--   Postgres um `CHECK` cujo resultado e NULL conta como satisfeito, entao
--   `char_length(btrim(alt_text)) BETWEEN 2 AND 150` continua recusando
--   `"a"` e aceitando a ausencia, sem reescrita. Reescrever o `CHECK` mudaria
--   a definicao que `tests/integration/conjunto-exato-dos-checks.test.ts`
--   fixa, de graca.
--
--   So a `Loja`. `network_event_images.alt_text` continua `NOT NULL`: o
--   pedido do cliente foi sobre a foto do produto, e afrouxar a `Rede` de
--   carona deixaria a capa do encontro sem nome acessivel sem ninguem ter
--   pedido.
--
-- - **Rascunho incompleto** (`store_items`): saem os `NOT NULL` de
--   `partner_id`, `summary`, `category` e `target_path`. `title` e `slug`
--   FICAM `NOT NULL`: eles sao o minimo para o registro existir e para a
--   pessoa reencontra-lo na lista. Pelo mesmo motivo do item acima, os tres
--   `CHECK` de formato e tamanho dessas colunas nao sao tocados -- eles ja
--   aceitam NULL.
--
-- - **A regua da publicacao, no banco** (`store_items_publicado_esta_completo`):
--   `active` so vale com as quatro colunas preenchidas. A validacao campo por
--   campo e do caso de uso, que e quem sabe dizer "falta a categoria"; este
--   `CHECK` e a rede embaixo dela, para que nenhum caminho que ninguem previu
--   ponha produto incompleto na vitrine do app. Ele nao menciona literal de
--   texto, e por isso NAO entra no registro de
--   `conjunto-exato-dos-checks.test.ts` (ver o cabecalho daquele arquivo).
--
-- O QUE ELA NAO FAZ, E A AUSENCIA E DELIBERADA:
--
-- - **Nao apaga coluna nem campo nenhum.** Os quatro campos e o texto
--   alternativo continuam existindo, gravaveis e projetados; o que mudou e
--   QUANDO sao cobrados.
-- - **Nao mexe em `active` nem em `published_at`.** O rascunho continua sendo
--   `active = false` com `published_at` nulo (`20260928000003`), e
--   `store_items_publicado_tem_data` continua valendo ao lado do `CHECK` novo.
-- - **Nao toca a leitura publica.** `GET /v1/store/items` filtra `i.active`, e
--   o rascunho nunca teve como aparecer ali; nada aqui muda isso.
--
-- SOBRE DADO QUE JA EXISTE
--
-- Afrouxar `NOT NULL` nao pode falhar por dado: toda linha que existe hoje tem
-- as quatro colunas preenchidas, justamente porque eram `NOT NULL`. O `CHECK`
-- novo tambem nao pode falhar pelo mesmo motivo -- `active = true` com coluna
-- nula nao e um estado que o esquema anterior admitia --, e por isso ele entra
-- VALIDADO, e nao `NOT VALID`.
--
-- SOBRE O `down`: devolve os `NOT NULL`. As linhas que o rascunho novo criou
-- com coluna nula nao cabem no esquema antigo, e por isso o `down` as APAGA --
-- sao rascunhos, nunca estiveram no app, e `store_item_species`,
-- `store_item_tags` e `store_item_images` saem por `ON DELETE CASCADE`. O
-- texto alternativo ausente e preenchido com o titulo do item, que e a mesma
-- reserva que o app usa.

-- Up Migration

ALTER TABLE store_item_images
  ALTER COLUMN alt_text DROP NOT NULL;

COMMENT ON COLUMN store_item_images.alt_text IS
  'Texto alternativo, OPCIONAL desde 17/10/2026 (pedido do cliente): quando vem, de 2 a 150 caracteres; quando e nulo, quem desenha cai no titulo do item. Em network_event_images ele continua obrigatorio.';

ALTER TABLE store_items
  ALTER COLUMN partner_id  DROP NOT NULL,
  ALTER COLUMN summary     DROP NOT NULL,
  ALTER COLUMN category    DROP NOT NULL,
  ALTER COLUMN target_path DROP NOT NULL;

ALTER TABLE store_items
  ADD CONSTRAINT store_items_publicado_esta_completo
    CHECK (
      NOT active
      OR (
        partner_id  IS NOT NULL
        AND summary     IS NOT NULL
        AND category    IS NOT NULL
        AND target_path IS NOT NULL
      )
    );

COMMENT ON CONSTRAINT store_items_publicado_esta_completo ON store_items IS
  'A segunda regua: o rascunho pode estar incompleto, o publicado nao. A mensagem campo por campo e do caso de uso (publishAdminStoreItem); este CHECK e a rede embaixo dela.';

COMMENT ON COLUMN store_items.partner_id IS
  'Aponta para store_partners.id, nunca para o slug. Anulavel desde 17/10/2026 para o rascunho caber; exigido na publicacao.';
COMMENT ON COLUMN store_items.summary IS
  'A "Descricao" do painel, de 2 a 180 caracteres, hoje numa area de texto de varias linhas (a quebra de linha conta no teto). Anulavel desde 17/10/2026 para o rascunho caber; exigida na publicacao.';
COMMENT ON COLUMN store_items.category IS
  'A categoria da vitrine. Anulavel desde 17/10/2026 para o rascunho caber; exigida na publicacao.';
COMMENT ON COLUMN store_items.target_path IS
  'O CAMINHO do destino no site do parceiro, nunca a URL. Anulavel desde 17/10/2026 para o rascunho caber; exigido na publicacao.';

-- Down Migration

ALTER TABLE store_items
  DROP CONSTRAINT IF EXISTS store_items_publicado_esta_completo;

COMMENT ON COLUMN store_items.partner_id IS NULL;
COMMENT ON COLUMN store_items.summary IS NULL;
COMMENT ON COLUMN store_items.category IS NULL;
COMMENT ON COLUMN store_items.target_path IS NULL;

-- Rascunho incompleto nao cabe no esquema antigo. Ver o cabecalho.
DELETE FROM store_items
 WHERE partner_id IS NULL
    OR summary IS NULL
    OR category IS NULL
    OR target_path IS NULL;

ALTER TABLE store_items
  ALTER COLUMN partner_id  SET NOT NULL,
  ALTER COLUMN summary     SET NOT NULL,
  ALTER COLUMN category    SET NOT NULL,
  ALTER COLUMN target_path SET NOT NULL;

UPDATE store_item_images ii
   SET alt_text = i.title
  FROM store_items i
 WHERE i.id = ii.item_id
   AND ii.alt_text IS NULL;

ALTER TABLE store_item_images
  ALTER COLUMN alt_text SET NOT NULL;

COMMENT ON COLUMN store_item_images.alt_text IS
  'Texto alternativo, obrigatorio em TODA posicao: a obrigacao acompanha a imagem que vira principal numa reordenacao.';
