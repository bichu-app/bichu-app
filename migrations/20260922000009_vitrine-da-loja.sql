-- A secao `Loja`: a vitrine curada que leva a loja do parceiro.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a `Loja` e uma das cinco abas do
-- aplicativo e **nao tem uma tabela**. Nem tabela, nem rota, nem massa. A aba
-- abre num `EstadoVazio` que diz "Loja esta em construcao", e ela continuaria
-- dizendo isso enquanto nao houvesse onde guardar um produto.
--
-- O QUE A LOJA E, E O QUE ELA NAO E (BICHUS-185, recorte de 21/09):
--
-- Ela e uma **vitrine de saida**: uma lista de produtos escolhidos a mao, cada
-- um com um link que abre o site do parceiro. A compra acontece la. Nao ha
-- carrinho, nao ha pedido, nao ha pagamento, nao ha estoque e nao ha estado de
-- compra -- e o criterio 5 da BICHUS-185 cobra que nao exista nenhum dos cinco
-- "nem na tela nem no contrato". Por isso **nao ha coluna de estoque, de frete,
-- de cupom nem de quantidade** aqui embaixo, e a ausencia e a decisao.
--
-- ====================================================================
-- A FORMA E COPIADA DA `20260917000003_dados-de-referencia.sql` (BICHUS-90)
-- ====================================================================
--
-- A BICHUS-189 escolheu, por extenso, reaproveitar a forma do dado de
-- referencia versionado: uma tabela de versoes com `is_current`, um indice
-- parcial que torna "duas versoes correntes" um estado que o banco RECUSA, e
-- item retirado marcado inativo em vez de apagado. As tres travas estao aqui,
-- com os mesmos nomes de coluna, porque uma segunda convencao para o mesmo
-- problema e a convencao que diverge.
--
-- ====================================================================
-- A DECISAO QUE ESTA MIGRACAO **NAO** TOMA, E ELA E DO CLIENTE
-- ====================================================================
--
-- A `BICHUS-189` se chama "entrada de dados versionada no repositorio, **ja que
-- nao havera backoffice**". O cliente pediu, em 22/09, um backoffice de outra
-- esteira para alimentar exatamente estas tabelas. As duas coisas nao convivem,
-- e a secao 9.6 do `api/contrato-de-escrita-do-diretorio.md` registra isso como
-- decisao pendente **do cliente**.
--
-- Esta migracao foi desenhada para ser **a mesma nos dois caminhos**, que e o
-- que a secao B.5 da BICHUS-185 ja previa: "no dia em que o backoffice do outro
-- time existir, ele passa a escrever nas mesmas tabelas". O que ela faz:
--
-- - cria o esquema, que e identico nos dois casos;
-- - **nao** cria rota de escrita, porque o criterio 20 da BICHUS-185 proibe
--   operacao de escrita de catalogo no contrato publico enquanto 9.6 nao for
--   respondida. Se a resposta for "backoffice", a escrita nasce em
--   `/v1/admin/...` como manda o ADR-0023, e nada daqui e jogado fora.
--
-- ====================================================================
-- O PRECO: CENTAVOS, E COM DATA DE CONSULTA HUMANA
-- ====================================================================
--
-- `price_amount` e **inteiro em centavos**. Binario flutuante para dinheiro e
-- defeito que aparece tarde: `0.1 + 0.2` nao e `0.3` em IEEE 754, e o erro
-- aparece na soma de uma lista, meses depois, sem ninguem ter mexido em nada.
-- E a mesma razao pela qual `match_candidates.score` e `numeric` e nao
-- `double` na `20260922000003`.
--
-- `price_checked_at` e **date e nao timestamptz**, de proposito: e a data em que
-- uma PESSOA abriu a pagina do parceiro e leu aquele numero. Hora nao existe
-- nesse ato, e uma coluna com hora convidaria `now()` a preenche-la.
--
-- A regra que a Emenda 1 da BICHUS-185 nomeia como a mais esquecida: o preco
-- **vence**, e quem aplica o vencimento e o **servidor**, omitindo o valor.
-- Se a regra morasse no aplicativo, um aparelho com build antigo mostraria
-- preco vencido para sempre e nao haveria como parar isso sem passar pela loja
-- de aplicativos. O banco guarda a data; quem decide o que sai e a projecao.

-- Up Migration

-- ---------------------------------------------------------------------------
-- A versao corrente da vitrine
-- ---------------------------------------------------------------------------

CREATE TABLE store_catalog_versions (
  version       text        PRIMARY KEY,
  published_at  timestamptz NOT NULL DEFAULT now(),
  is_current    boolean     NOT NULL DEFAULT false
);

-- Copiado de `ref_data_versions_uma_corrente`, inclusive na forma. Duas versoes
-- correntes deixam de ser uma regra que alguem precisa lembrar e passam a ser
-- um estado que o banco recusa.
CREATE UNIQUE INDEX store_catalog_versions_uma_corrente
  ON store_catalog_versions ((is_current))
  WHERE is_current;

COMMENT ON TABLE store_catalog_versions IS
  'A versao corrente da vitrine da Loja. Mesma forma de `ref_data_versions` (BICHUS-90).';

-- ---------------------------------------------------------------------------
-- O parceiro
-- ---------------------------------------------------------------------------

CREATE TABLE store_partners (
  -- `slug` e a CHAVE PRIMARIA, e nao um UUID com slug ao lado.
  --
  -- O ADR-0010 item 6 proibe UUID interno em saida publica, e esta tabela so
  -- existe para sair em saida publica. Um `id uuid` aqui seria uma coluna que
  -- nunca pode ser projetada, esperando alguem projeta-la por engano -- foi
  -- exatamente o que obrigou a `20260922000008` a acrescentar `slug` a
  -- `professionals` depois. Aqui o problema nao chega a existir.
  --
  -- Formato COPIADO de `pets.slug` (20260917000006) e de `professionals.slug`
  -- (20260922000008). Tres formatos diferentes de endereco publico no mesmo
  -- produto seriam tres regras para alguem decorar.
  slug        text     PRIMARY KEY
              CONSTRAINT store_partners_slug_formato
              CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  name        text     NOT NULL
              CONSTRAINT store_partners_nome_tem_tamanho
              CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),

  -- O dominio do parceiro, para a tela poder nomear o destino ANTES da saida
  -- ("Abrir na Cobasi") e para a conferencia de que o link de saida de um item
  -- aponta para o parceiro que o item declara.
  --
  -- So o host: sem esquema, sem caminho e sem consulta. Guardar a URL inteira
  -- aqui convidaria um parametro a viajar junto, e parametro em link de saida e
  -- onde dado pessoal vaza (consequencia 3 da BICHUS-185).
  host        text     NOT NULL
              CONSTRAINT store_partners_host_e_so_host
              CHECK (host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),

  active      boolean  NOT NULL DEFAULT true,
  sort_order  smallint NOT NULL DEFAULT 0
);

COMMENT ON COLUMN store_partners.slug IS
  'O endereco publico do parceiro, e a chave primaria. Nao ha UUID nesta tabela: ela so existe para sair em resposta publica, e o ADR-0010 item 6 proibe UUID interno la.';
COMMENT ON COLUMN store_partners.host IS
  'Apenas o host do parceiro, sem esquema nem caminho nem consulta. A URL de saida de um item precisa terminar neste host, e a conferencia mora na aplicacao.';

-- ---------------------------------------------------------------------------
-- O item da vitrine
-- ---------------------------------------------------------------------------

CREATE TABLE store_items (
  -- Mesma decisao de `store_partners.slug`, pelo mesmo motivo.
  slug           text     PRIMARY KEY
                 CONSTRAINT store_items_slug_formato
                 CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  partner_slug   text     NOT NULL REFERENCES store_partners (slug),

  title          text     NOT NULL
                 CONSTRAINT store_items_titulo_tem_tamanho
                 CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),

  -- Uma linha, e o limite e o que faz dela uma linha. O criterio 1 da
  -- BICHUS-185 pede "uma linha de descricao", e um campo sem teto vira
  -- paragrafo no primeiro cadastro.
  summary        text     NOT NULL
                 CONSTRAINT store_items_resumo_tem_tamanho
                 CHECK (char_length(btrim(summary)) BETWEEN 2 AND 180),

  -- A categoria, que e o filtro que a rota aceita. Lista fechada por CHECK e
  -- nao por `enum` nativo, pela mesma razao da `20260921000002`: acrescentar
  -- valor a um `enum` nativo exige alterar o tipo com o produto no ar.
  --
  -- **Acrescentar valor aqui e sempre tres arquivos no mesmo commit** (ADR-0023
  -- secao 3): a migracao, a entrada por extenso em
  -- `tests/integration/conjunto-exato-dos-checks.test.ts` e o `enum` do
  -- contrato.
  category       text     NOT NULL
                 CONSTRAINT store_items_categoria
                 CHECK (category IN ('food', 'toy', 'hygiene', 'accessory', 'health', 'bed')),

  -- A imagem. Opcional, e a ausencia e estado normal e nao lacuna: o cartao
  -- sabe se desenhar sem ela. `text` e nao `uuid` porque a imagem da vitrine e
  -- uma URL publica do parceiro ou nossa, e nao um objeto do nosso
  -- armazenamento de fotos de pet.
  image_url      text
                 CONSTRAINT store_items_imagem_e_https
                 CHECK (image_url IS NULL OR image_url ~ '^https://'),

  -- O destino. Sempre https, e sempre no host do parceiro -- a segunda metade
  -- e conferida na aplicacao, porque um CHECK nao enxerga a outra tabela.
  target_url     text     NOT NULL
                 CONSTRAINT store_items_destino_e_https
                 CHECK (target_url ~ '^https://'),

  -- ---------------------------------------------------------------------
  -- Preco: os tres campos andam juntos, e o banco exige os tres ou nenhum
  -- ---------------------------------------------------------------------
  --
  -- Criterio 13 da BICHUS-185: item com preco e SEM data e recusado na
  -- entrada; item SEM preco nenhum passa. As duas metades sao a mesma
  -- restricao, e ela mora no banco porque "preco sem data" nao pode existir
  -- nem por caminho que ninguem previu.
  price_amount   integer
                 CONSTRAINT store_items_preco_e_positivo
                 CHECK (price_amount IS NULL OR price_amount > 0),

  price_currency text
                 CONSTRAINT store_items_moeda
                 CHECK (price_currency IS NULL OR price_currency = 'BRL'),

  price_checked_at date,

  CONSTRAINT store_items_preco_anda_completo
    CHECK (
      (price_amount IS NULL AND price_currency IS NULL AND price_checked_at IS NULL)
      OR
      (price_amount IS NOT NULL AND price_currency IS NOT NULL AND price_checked_at IS NOT NULL)
    ),

  active         boolean  NOT NULL DEFAULT true,
  sort_order     smallint NOT NULL DEFAULT 0
);

COMMENT ON COLUMN store_items.price_amount IS
  'Preco de referencia em CENTAVOS, inteiro. Nunca ponto flutuante: binario flutuante para dinheiro erra na soma e o erro aparece meses depois. Opcional -- item sem preco e estado normal.';
COMMENT ON COLUMN store_items.price_checked_at IS
  'A data em que uma PESSOA abriu a pagina do parceiro e leu aquele numero. Nao e a data do commit, nem a do deploy, nem now(). Derivar de carimbo automatico faz o numero envelhecer e a data ficar sempre nova, que e a mentira que a Emenda 1 da BICHUS-185 existe para impedir.';
COMMENT ON COLUMN store_items.target_url IS
  'O destino no site do parceiro. Nenhum identificador de pessoa entra aqui, em codificacao nenhuma (consequencia 3 da BICHUS-185).';

-- Data futura e recusada (criterio 14). Nao e CHECK porque `CURRENT_DATE` nao e
-- imutavel e o Postgres recusa funcao volatil em restricao: um CHECK com ela
-- nem chega a ser criado. O gatilho confere na escrita, que e quando a pergunta
-- faz sentido -- uma linha correta hoje nao vira incorreta amanha pelo tempo
-- passar, e um CHECK reavaliado num `VACUUM FULL` faria exatamente isso.
CREATE FUNCTION store_items_recusa_data_futura() RETURNS trigger AS $$
BEGIN
  IF NEW.price_checked_at IS NOT NULL AND NEW.price_checked_at > CURRENT_DATE THEN
    RAISE EXCEPTION
      'price_checked_at no futuro (%): a data e a da consulta humana ao preco, e ninguem consultou amanha',
      NEW.price_checked_at
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER store_items_data_de_consulta_nao_e_futura
  BEFORE INSERT OR UPDATE ON store_items
  FOR EACH ROW EXECUTE FUNCTION store_items_recusa_data_futura();

-- O indice da consulta que a rota faz: vitrine ativa, na ordem da vitrine.
-- Parcial em `active` pela mesma razao dos tres indices da `20260921000002`:
-- item retirado fica na tabela e nunca entra na leitura.
CREATE INDEX store_items_vitrine
  ON store_items (sort_order, slug)
  WHERE active;

CREATE INDEX store_items_por_categoria
  ON store_items (category, sort_order, slug)
  WHERE active;

-- Down Migration

DROP INDEX store_items_por_categoria;
DROP INDEX store_items_vitrine;
DROP TRIGGER store_items_data_de_consulta_nao_e_futura ON store_items;
DROP FUNCTION store_items_recusa_data_futura();
DROP TABLE store_items;
DROP TABLE store_partners;
DROP INDEX store_catalog_versions_uma_corrente;
DROP TABLE store_catalog_versions;
