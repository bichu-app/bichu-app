-- A secao `Rede`: os encontros da comunidade.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a `Rede` e uma das cinco abas do
-- aplicativo e nao tinha NADA -- nem tabela, nem rota, nem tela, nem uma linha
-- de especificacao. A aba abria num `EstadoVazio` dizendo "Rede esta em
-- construcao", e continuaria dizendo isso enquanto nao houvesse onde guardar um
-- encontro.
--
-- As decisoes que deram forma a este arquivo sao o **ADR-0025** (a Rede nao tem
-- lista de presenca) e a **secao 12 do ADR-0027**, que emendou esta migracao
-- antes do merge. Leia os dois antes de mexer aqui.
--
-- ====================================================================
-- ESTA MIGRACAO FOI EDITADA NO LUGAR, E NAO CORRIGIDA POR OUTRA
-- ====================================================================
--
-- A primeira versao (BICHUS-251) criava tambem a presenca e a galeria, fazia
-- `slug` ser a chave primaria e guardava o encontro sem ponto nenhum. Em
-- 23/09/2026 o cliente decidiu, antes do merge:
--
-- 1. **sem check-in e sem galeria nesta versao.** As duas tabelas sairam daqui.
--    Cria-las depois e `CREATE TABLE`, aditivo e sem risco; deixa-las agora
--    seria esquema sem fluxo e campo de contrato sempre zero. As decisoes 1 a 3
--    do ADR-0025 continuam normativas para quando voltarem: presenca sem
--    `pet_id`, presenca como numero e nunca como lista, foto sem autor na
--    saida. O desenho anterior esta na branch `guarda/rede-checkin-galeria`;
-- 2. **o encontro ganha ponto no mapa**, que o aplicativo mostra so a quem
--    esta logado (ADR-0027 12.5 e a emenda 1 do ADR-0010).
--
-- A edicao no lugar vale porque a migracao **nao foi mesclada em `development`
-- nem aplicada em banco compartilhado** (conferido em 23/09 com
-- `git branch -a --contains`: so as branches da propria secao a tem). Quem a
-- aplicou num banco local de desenvolvimento precisa de `make reset`.
--
-- ====================================================================
-- A IDENTIDADE INTERNA E SEPARADA DA PUBLICA (ADR-0024, ADR-0027 12.1)
-- ====================================================================
--
-- `id uuid` e a chave primaria e `slug` e unico ao lado, como em `pets`,
-- `professionals` e na vitrine da `Loja` desde 69c6a27. O ADR-0010 item 6
-- proibe UUID na SAIDA publica, nao no esquema, e o engano que a primeira
-- versao temia (projetar o `id` por descuido) ja tem portao proprio:
-- `src/tools/portao-contrato-publico.ts` reprova `format: uuid` em operacao
-- alcancavel sem conta. Toda chave estrangeira futura aponta para `id`, porque
-- chave estrangeira sobre `slug` e o que o criterio 2 da BICHUS-19 proibe.
--
-- ====================================================================
-- O PONTO, E QUEM PODE VE-LO
-- ====================================================================
--
-- `geo` e opcional: os tres rotulos (`place_name`, `neighborhood`,
-- `city`/`state`) continuam obrigatorios e o ponto e tolerancia, nao caminho.
-- A unica origem admitida e `map_pin` -- a que o ADR-0006 admite e que um
-- operador consegue produzir tocando o mapa do painel. Nao ha geocodificacao.
--
-- **O ponto nunca sai em resposta alcancavel sem conta.** A agenda e o detalhe
-- continuam sem coordenada; o ponto sai so em
-- `GET /v1/network/events/{eventSlug}/location`, com `bearerAuth` obrigatorio.
-- A emenda 1 do ADR-0010 tem escopo fechado: ponto de EVENTO publicado, em
-- resposta AUTENTICADA. Coordenada de pessoa, de pet, de caso e de achado
-- continua proibida em qualquer superficie.
--
-- "Lugar publico, nunca residencia" (ADR-0027 secao 13) NAO E UM CHECK, e dizer
-- o contrario seria mentir: nenhuma restricao sabe a diferenca entre uma praca
-- e uma casa. O que o banco garante e o que cabe a ele:
--   - so `origin = 'community'` pode estar em `pending_review`, e
--     `pending_review` nunca e visivel -- o encontro criado pela comunidade,
--     quando existir, so projeta ponto depois de revisao humana;
--   - quem criou fica guardado para a trilha, e nunca sai.
-- O resto e processo: so o administrador cria evento na v1, o formulario diz
-- que o local e logradouro publico, e criar, mover e cancelar avisam todos os
-- administradores.
--
-- ====================================================================
-- A DATA, QUE E A ARMADILHA DESTA SECAO
-- ====================================================================
--
-- `starts_at` e `timestamptz` -- instante absoluto -- **e ao lado dele mora
-- `time_zone`**, com o nome IANA da zona. Os dois, e nao um.
--
-- `timestamptz` sozinho responde QUANDO o evento acontece e nao responde QUE
-- HORAS O CARTAZ DA PRACA DIZIA. Um aparelho configurado em UTC renderizaria um
-- encontro das 9h como 12h, sem nada acusar, e o Brasil tem mais de uma zona.
-- A hora de um evento e hora de parede, e parede tem lugar.
--
-- O PASSADO E ROTULADO PELO SERVIDOR, e nao por esta tabela: `status`
-- (`upcoming` / `happening` / `ended`, e `cancelled`, que prevalece) e
-- calculado na projecao, pela mesma razao pela qual o vencimento do preco da
-- `Loja` e calculado la.
--
-- ====================================================================
-- QUEM ESCREVE
-- ====================================================================
--
-- Esta migracao nao cria rota de escrita. A escrita nasce no backoffice
-- (`/v1/admin/network/*`, ADR-0027), numa migracao posterior a esta, que
-- acrescenta `cover_image_id` -- ele aponta para `catalog_images`, que ainda
-- nao existe aqui.

-- Up Migration

CREATE TABLE network_events (
  -- A IDENTIDADE INTERNA. Alvo de toda chave estrangeira desta secao, e nunca
  -- projetada.
  id              uuid        PRIMARY KEY,

  -- O ENDERECO PUBLICO. Mesmo formato de `pets.slug`, `professionals.slug` e
  -- `store_items.slug`: quatro formatos de endereco publico no mesmo produto
  -- seriam quatro regras para alguem decorar.
  slug            text        NOT NULL
                  CONSTRAINT network_events_slug_formato
                  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  title           text        NOT NULL
                  CONSTRAINT network_events_titulo_tem_tamanho
                  CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),

  -- Uma linha, e o teto e o que faz dela uma linha. Mesmo numero da
  -- `store_items.summary`: os dois cartoes vivem na mesma listagem.
  summary         text        NOT NULL
                  CONSTRAINT network_events_resumo_tem_tamanho
                  CHECK (char_length(btrim(summary)) BETWEEN 2 AND 180),

  -- ---------------------------------------------------------------------
  -- O LUGAR: TRES ROTULOS OBRIGATORIOS E UM PONTO OPCIONAL
  -- ---------------------------------------------------------------------
  --
  -- O nome do lugar publico, COMO AS PESSOAS O CHAMAM: `Praca Benedito
  -- Calixto`, `Parque da Aclimacao`. Nao e logradouro, numero nem CEP.
  place_name      text        NOT NULL
                  CONSTRAINT network_events_lugar_tem_tamanho
                  CHECK (char_length(btrim(place_name)) BETWEEN 2 AND 80),

  neighborhood    text        NOT NULL
                  CONSTRAINT network_events_bairro_tem_tamanho
                  CHECK (char_length(btrim(neighborhood)) BETWEEN 2 AND 60),

  city            text        NOT NULL
                  CONSTRAINT network_events_cidade_tem_tamanho
                  CHECK (char_length(btrim(city)) BETWEEN 2 AND 60),

  state           text        NOT NULL
                  CONSTRAINT network_events_uf_tem_duas_letras
                  CHECK (state ~ '^[A-Z]{2}$'),

  -- `geography` e nao `geometry`, pelo motivo de `lost_cases` e
  -- `professionals`: a distancia sobre a esfera e em metros e nao se deforma
  -- com a latitude. Opcional (ADR-0027 12.2).
  geo             geography(Point, 4326),

  -- A origem do ponto. `map_pin` e a unica: e a que o ADR-0006 admite e a unica
  -- que um operador consegue produzir. Geocodificacao continua proibida.
  geo_source      text
                  CONSTRAINT network_events_origem_do_ponto
                  CHECK (geo_source IS NULL OR geo_source = 'map_pin'),

  -- ---------------------------------------------------------------------
  -- A DATA, E O FUSO QUE ANDA COM ELA
  -- ---------------------------------------------------------------------
  starts_at       timestamptz NOT NULL,

  ends_at         timestamptz
                  CONSTRAINT network_events_fim_depois_do_comeco
                  CHECK (ends_at IS NULL OR ends_at > starts_at),

  -- O formato e conferido aqui; que a zona EXISTA de verdade e conferido pelo
  -- gatilho la embaixo, porque isso exige consultar o catalogo.
  time_zone       text        NOT NULL DEFAULT 'America/Sao_Paulo'
                  CONSTRAINT network_events_fuso_tem_forma_iana
                  CHECK (time_zone ~ '^[A-Za-z]+/[A-Za-z_]+$'),

  cover_image_url text
                  CONSTRAINT network_events_capa_e_https
                  CHECK (cover_image_url IS NULL OR cover_image_url ~ '^https://'),

  -- ---------------------------------------------------------------------
  -- PUBLICACAO, ORIGEM E AUTOR (ADR-0027 12.3 e apendice A.4)
  -- ---------------------------------------------------------------------
  --
  -- `active boolean` saiu: duas colunas para "isto aparece?" divergem na
  -- primeira escrita que atualizar so uma. `publication_status` responde
  -- sozinha, e sem padrao: quem cria diz. Nao ha `draft` (ADR-0027 12.9):
  -- criar e publicar.
  origin              text        NOT NULL DEFAULT 'admin'
                      CONSTRAINT network_events_origem_conhecida
                      CHECK (origin IN ('admin', 'community')),

  created_by_user_id  uuid        REFERENCES users (id) ON DELETE SET NULL,

  publication_status  text        NOT NULL
                      CONSTRAINT network_events_publicacao_conhecida
                      CHECK (publication_status IN ('pending_review', 'published', 'cancelled', 'removed')),

  published_at        timestamptz,
  cancelled_at        timestamptz,

  cancellation_note   text
                      CONSTRAINT network_events_nota_de_cancelamento_tem_tamanho
                      CHECK (cancellation_note IS NULL OR char_length(btrim(cancellation_note)) BETWEEN 2 AND 280),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  version             integer     NOT NULL DEFAULT 1
                      CONSTRAINT network_events_versao_positiva
                      CHECK (version > 0),

  -- Ponto e origem andam juntos: ponto sem origem e coordenada que ninguem sabe
  -- de onde veio, e origem sem ponto e rotulo mentindo.
  CONSTRAINT network_events_ponto_anda_com_origem
    CHECK ((geo IS NULL) = (geo_source IS NULL)),

  CONSTRAINT network_events_cancelado_tem_instante
    CHECK (publication_status <> 'cancelled' OR cancelled_at IS NOT NULL),

  CONSTRAINT network_events_visivel_foi_publicado
    CHECK (publication_status NOT IN ('published', 'cancelled') OR published_at IS NOT NULL),

  -- So o encontro da COMUNIDADE espera revisao. E esta linha que faz da regra
  -- "o ponto de evento da comunidade so aparece depois de revisao humana"
  -- (ADR-0027 13.5) um estado do banco: `pending_review` nunca e visivel, e so
  -- `community` pode estar nele.
  CONSTRAINT network_events_revisao_so_da_comunidade
    CHECK (origin = 'community' OR publication_status <> 'pending_review')
);

-- Unicidade global, com o nome que `pets_slug_unico`,
-- `professionals_slug_unico` e `store_partners_slug_unico` ja usam.
CREATE UNIQUE INDEX network_events_slug_unico ON network_events (slug);

COMMENT ON TABLE network_events IS
  'Os encontros da secao `Rede`. O lugar sao tres rotulos obrigatorios e um ponto opcional (`geo`, origem `map_pin`). O ponto so sai em resposta autenticada (`getNetworkEventLocation`, emenda 1 do ADR-0010); agenda e detalhe publicos nao carregam coordenada.';
COMMENT ON COLUMN network_events.id IS
  'A identidade interna do encontro. Nao sai em resposta: o ADR-0010 item 6 proibe UUID em saida publica, e o portao de contrato publico reprova quem tentar. Alvo de toda chave estrangeira da secao.';
COMMENT ON COLUMN network_events.slug IS
  'O endereco publico do encontro. Unico, e e a unica chave do encontro que sai em resposta.';
COMMENT ON COLUMN network_events.place_name IS
  'O nome do lugar publico, como as pessoas o chamam. NAO e logradouro, numero nem CEP. Logradouro publico, nunca residencia (ADR-0027 secao 13): regra de processo, garantida por quem cria, e nao por restricao.';
COMMENT ON COLUMN network_events.geo IS
  'O ponto do encontro, marcado no mapa pelo administrador. Opcional. So sai em `getNetworkEventLocation`, com `bearerAuth` obrigatorio; nunca em operacao alcancavel sem conta.';
COMMENT ON COLUMN network_events.time_zone IS
  'O nome IANA da zona do evento. Anda junto de `starts_at` porque `timestamptz` sozinho diz o instante e nao diz a hora de parede: um aparelho em UTC renderizaria um encontro das 9h como 12h, sem nada acusar.';
COMMENT ON COLUMN network_events.publication_status IS
  'Se o encontro aparece. Visivel e `published` ou `cancelled` (o cancelado sai com `status` `cancelled` ate o fim previsto e, depois dele, segue a regra do encerrado; decisao do cliente de 23/09). `pending_review` e so da comunidade e nunca e visivel; `removed` e terminal.';
-- A MARCA `NUNCA sai do servidor` NAO E PROSA: ela e lida por
-- `src/tools/portao-colunas-que-nao-saem.ts`, que varre o contrato e `src/`
-- atras do NOME desta coluna e reprova quem a projetar. E o mesmo mecanismo que
-- ja guarda a coluna homonima de `professionals`, pela mesma razao: quem criou
-- e dado de trilha, nao de vitrine.
COMMENT ON COLUMN network_events.created_by_user_id IS
  'QUEM CRIOU O ENCONTRO. NUNCA sai do servidor, em nenhuma resposta, nem a administrativa (ADR-0027 apendice A.4). Existe para a trilha e para resposta a abuso.';

-- A zona precisa EXISTIR, e nao apenas ter a forma de uma. `America/Sao_Pualo`
-- passa no CHECK de formato e renderiza errado para sempre.
--
-- Gatilho e nao CHECK pela mesma razao da `store_items_recusa_data_futura`:
-- consultar `pg_timezone_names` nao e imutavel, e o Postgres recusa funcao
-- volatil em restricao.
CREATE FUNCTION network_events_recusa_fuso_inexistente() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.time_zone) THEN
    RAISE EXCEPTION
      'time_zone inexistente (%): a zona precisa existir no catalogo, e nao apenas ter a forma de uma -- um nome com erro de digitacao renderiza a hora errada para sempre, sem nada acusar',
      NEW.time_zone
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER network_events_fuso_existe
  BEFORE INSERT OR UPDATE ON network_events
  FOR EACH ROW EXECUTE FUNCTION network_events_recusa_fuso_inexistente();

-- Os indices das consultas que as rotas fazem: a agenda visivel por data, a
-- agenda visivel de uma cidade e o ponto do encontro visivel. Parciais no
-- conjunto VISIVEL, que e o mesmo predicado da clausula `WHERE` das leituras.
CREATE INDEX network_events_agenda
  ON network_events (starts_at, id)
  WHERE publication_status IN ('published', 'cancelled');

CREATE INDEX network_events_por_cidade
  ON network_events (city, starts_at, id)
  WHERE publication_status IN ('published', 'cancelled');

CREATE INDEX network_events_por_ponto
  ON network_events USING GIST (geo)
  WHERE publication_status IN ('published', 'cancelled') AND geo IS NOT NULL;

-- Down Migration

DROP INDEX network_events_por_ponto;
DROP INDEX network_events_por_cidade;
DROP INDEX network_events_agenda;
DROP TRIGGER network_events_fuso_existe ON network_events;
DROP FUNCTION network_events_recusa_fuso_inexistente();
DROP INDEX network_events_slug_unico;
DROP TABLE network_events;
