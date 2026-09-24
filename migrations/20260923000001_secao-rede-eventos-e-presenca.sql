-- A secao `Rede`: os encontros da comunidade, a presenca e a galeria.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a `Rede` e uma das cinco abas do
-- aplicativo e nao tinha NADA -- nem tabela, nem rota, nem tela, nem uma linha
-- de especificacao. A aba abria num `EstadoVazio` dizendo "Rede esta em
-- construcao", e continuaria dizendo isso enquanto nao houvesse onde guardar um
-- encontro.
--
-- A decisao que deu forma a este arquivo e o **ADR-0025**. Leia-o antes de
-- mexer aqui: as tres ausencias abaixo sao o conteudo dele, e desfazer qualquer
-- uma reabre a inferencia que ele existe para fechar.
--
-- ====================================================================
-- AS TRES AUSENCIAS, E CADA UMA E UMA DECISAO E NAO UM ESQUECIMENTO
-- ====================================================================
--
-- 1. **`network_event_checkins` NAO TEM `pet_id`.**
--
--    O ADR-0010 item 7 proibe a superficie publica de deixar inferir que dois
--    pets sao do mesmo tutor. Uma lista de presenca por PET faz essa inferencia
--    de graca: quem confirma presenca com o Thor e com a Nina publica, para
--    quem abrir a lista, que os dois moram na mesma casa -- e o endereco do
--    evento e uma praca do bairro dela.
--
--    Num produto cujo fluxo mais critico e pet perdido, essa e exatamente a
--    informacao que interessa a quem quer levar um animal.
--
--    Nao ha coluna de pet e nao ha tabela de ligacao. A regra deixa de ser algo
--    que quem projeta precisa lembrar e passa a ser um dado que NAO EXISTE:
--    nenhum `join`, nenhum `select *` e nenhum engano de implementacao pode
--    publicar o que nao foi gravado.
--
--    O preco esta escrito no ADR-0025 e e real: o produto perde "levei o Thor".
--
-- 2. **`network_events` NAO TEM COORDENADA.**
--
--    Sem `geo`, sem latitude, sem longitude, sem CEP. O ADR-0006 proibe
--    geocodificacao no MVP e e explicito sobre a origem de coordenada: so
--    `device_gps` e `map_pin`. Quem cadastra uma praca nao tem nenhuma das duas
--    -- nao esta la, e nao ha toque no mapa fora do cadastro de tutor.
--
--    O lugar e TRES ROTULOS DE TEXTO: `place_name`, `neighborhood` e
--    `city`/`state`. Isso fica NO TETO que o ADR-0010 declara para superficie
--    publica ("bairro e cidade") e nao o ultrapassa. E o nome de uma praca nao
--    e endereco de residencia de ninguem.
--
--    Consequencia que precisa estar dita: **nao ha ordenacao por distancia**, e
--    ela nao aparece desabilitada. Sem coordenada nao ha distancia, e oferecer
--    uma ordem que nunca podera ser cumprida e pior que nao oferece-la.
--
-- 3. **A IDENTIDADE INTERNA E SEPARADA DA PUBLICA** (ADR-0024, o da Loja).
--
--    A primeira versao desta migracao fez `slug` ser a chave primaria das duas
--    tabelas, com o argumento de que um `id uuid` seria "uma coluna que nunca
--    pode ser projetada, esperando alguem projeta-la por engano". **O
--    argumento e bom e a conclusao nao segue dele**, e quem mostrou isso foi a
--    `Loja`, que cometeu e corrigiu o mesmo erro em 69c6a27:
--
--    a) o ADR-0010 item 6 proibe UUID na **SAIDA PUBLICA**, nao no esquema.
--       `pets` e `professionals` -- as outras tabelas do produto com endereco
--       publico -- tem `id uuid` primaria e `slug` unico ao lado;
--    b) o engano que o argumento teme **ja tem portao proprio**:
--       `src/tools/portao-contrato-publico.ts` reprova qualquer campo
--       `format: uuid` em operacao alcancavel sem conta, e as duas leituras
--       desta secao sao alcancaveis sem conta. Medo coberto por mecanismo nao
--       justifica torcer o esquema.
--
--    E o que a chave primaria em `slug` custava era concreto: as chaves
--    estrangeiras precisavam apontar para ela, e **chave estrangeira sobre
--    `slug` e o que o criterio 2 da BICHUS-19 proibe** -- por dois motivos, e o
--    segundo e o que decide: `slug` e valor que o usuario troca **e** valor que
--    sai impresso. Uma coluna que e ao mesmo tempo endereco publico e chave que
--    liga as tabelas entrega a juncao junto com o endereco.
--
--    `network_event_checkins` nao tem `slug` proprio: ela e ligada por
--    `event_id` e a chave e `(event_id, user_id)`. `user_id` continua sendo a
--    unica coluna que identifica alguem aqui, e continua NUNCA sendo projetada
--    -- a unica leitura do contrato sobre ela e `count(*)`.
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
-- (`upcoming` / `happening` / `ended`) e calculado na projecao, pela mesma razao
-- pela qual o vencimento do preco da `Loja` e calculado la. Se a regra morasse
-- no aplicativo, um aparelho com relogio errado ou com build antiga chamaria de
-- "proximo" um evento de tres semanas atras, e nao haveria como corrigir isso
-- sem passar pela loja de aplicativos.
--
-- ====================================================================
-- QUEM ESCREVE, HOJE E DEPOIS
-- ====================================================================
--
-- Esta migracao **nao cria rota de escrita de evento**, pela mesma razao da
-- 20260922000009: a decisao 9.6 de `api/contrato-de-escrita-do-diretorio.md`
-- (catalogo versionado no repositorio ou backoffice de outra esteira) esta
-- pendente do cliente, e o esquema e o MESMO nos dois caminhos. Quando a
-- escrita existir, ela nasce em `/v1/admin/...` como manda o ADR-0023, e nada
-- daqui e jogado fora.
--
-- O que a comunidade faz nesta fatia e **check-in**, e so ele. O ADR-0025
-- secao 4 explica a escolha em uma linha: check-in NAO PRODUZ CONTEUDO. Nao tem
-- texto, nao tem imagem, nao tem nada para moderar -- e moderacao, denuncia e
-- remocao nao existem em lugar nenhum deste repositorio.
--
-- `network_event_photos` nasce **exibida e nao enviada**: a massa a preenche
-- para o cartao poder ser visto com e sem foto. O envio pela comunidade e fase
-- seguinte, junto da moderacao que ele exige.

-- Up Migration

-- ---------------------------------------------------------------------------
-- O encontro
-- ---------------------------------------------------------------------------

CREATE TABLE network_events (
  -- A IDENTIDADE INTERNA. Alvo das chaves estrangeiras desta secao, e **nunca
  -- projetada**. Ver a ausencia 3 no cabecalho.
  id              uuid        PRIMARY KEY,

  -- O ENDERECO PUBLICO. Formato COPIADO de `pets.slug`, de `professionals.slug`
  -- e de `store_items.slug`. Quatro formatos diferentes de endereco publico no
  -- mesmo produto seriam quatro regras para alguem decorar.
  --
  -- `NOT NULL` e nao anulavel como em `professionals`: la a entrada nasce sem
  -- endereco e ganha um ao ser publicada; aqui o encontro so existe depois de
  -- curado, e encontro sem endereco publico nao teria como aparecer.
  slug            text        NOT NULL
                  CONSTRAINT network_events_slug_formato
                  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  title           text        NOT NULL
                  CONSTRAINT network_events_titulo_tem_tamanho
                  CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),

  -- Uma linha, e o teto e o que faz dela uma linha. Mesmo numero da
  -- `store_items.summary`, e a igualdade e deliberada: os dois cartoes vivem na
  -- mesma listagem, com a mesma largura.
  summary         text        NOT NULL
                  CONSTRAINT network_events_resumo_tem_tamanho
                  CHECK (char_length(btrim(summary)) BETWEEN 2 AND 180),

  -- ---------------------------------------------------------------------
  -- O LUGAR, EM TRES ROTULOS. Nenhuma coordenada -- ver a ausencia 2 acima.
  -- ---------------------------------------------------------------------
  --
  -- O nome do lugar publico, COMO AS PESSOAS O CHAMAM: `Praca Benedito
  -- Calixto`, `Parque da Aclimacao`. Nao e logradouro, nao e numero e nao e
  -- CEP -- os tres sao endereco, e o ADR-0010 item 2 os proibe em superficie
  -- publica.
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

  -- ---------------------------------------------------------------------
  -- A DATA, E O FUSO QUE ANDA COM ELA
  -- ---------------------------------------------------------------------
  starts_at       timestamptz NOT NULL,

  -- Opcional: nem todo encontro declara fim. Quando existe, e depois do
  -- comeco, e o CHECK dispensa a discussao -- os dois sao colunas da mesma
  -- linha, entao a comparacao e imutavel e cabe numa restricao.
  ends_at         timestamptz
                  CONSTRAINT network_events_fim_depois_do_comeco
                  CHECK (ends_at IS NULL OR ends_at > starts_at),

  -- O nome IANA da zona. Ver "A DATA" no cabecalho: sem ele o instante esta
  -- certo e a hora de parede esta errada, em silencio.
  --
  -- O formato e conferido aqui; que a zona EXISTA de verdade e conferido pelo
  -- gatilho la embaixo, porque isso exige consultar o catalogo e um CHECK nao
  -- enxerga outra relacao.
  time_zone       text        NOT NULL DEFAULT 'America/Sao_Paulo'
                  CONSTRAINT network_events_fuso_tem_forma_iana
                  CHECK (time_zone ~ '^[A-Za-z]+/[A-Za-z_]+$'),

  -- A imagem de capa. Opcional, e a ausencia e estado normal e nao lacuna: o
  -- cartao sabe se desenhar sem ela, e a massa tem os dois casos de proposito.
  cover_image_url text
                  CONSTRAINT network_events_capa_e_https
                  CHECK (cover_image_url IS NULL OR cover_image_url ~ '^https://'),

  -- Evento retirado fica na tabela e nunca entra na leitura, como em
  -- `store_items`. Apagar perderia os check-ins junto.
  active          boolean     NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Unicidade global, com o nome que `pets_slug_unico`, `professionals_slug_unico`
-- e `store_partners_slug_unico` ja usam. Sem `WHERE`, porque aqui e `NOT NULL`.
CREATE UNIQUE INDEX network_events_slug_unico ON network_events (slug);

COMMENT ON COLUMN network_events.id IS
  'A identidade interna do encontro. NUNCA sai em resposta: o ADR-0010 item 6 proibe UUID em saida publica, e o portao de contrato publico reprova quem tentar. Existe para que as chaves estrangeiras da secao apontem para um valor que nao e endereco publico.';

COMMENT ON TABLE network_events IS
  'Os encontros da secao `Rede`. Sem coordenada, por decisao: ADR-0006 proibe geocodificacao e o lugar e rotulo (place_name + neighborhood + city/state), no teto de precisao que o ADR-0010 permite em superficie publica.';
COMMENT ON COLUMN network_events.slug IS
  'O endereco publico do encontro. Unico, e e a unica chave do encontro que sai em resposta. Mesmo formato de `pets.slug`, `professionals.slug` e `store_items.slug`.';
COMMENT ON COLUMN network_events.place_name IS
  'O nome do lugar publico, como as pessoas o chamam. NAO e logradouro, numero nem CEP: os tres sao endereco, e o ADR-0010 item 2 os proibe em superficie publica.';
COMMENT ON COLUMN network_events.time_zone IS
  'O nome IANA da zona do evento. Anda junto de `starts_at` porque `timestamptz` sozinho diz o instante e nao diz a hora de parede: um aparelho em UTC renderizaria um encontro das 9h como 12h, sem nada acusar.';

-- A zona precisa EXISTIR, e nao apenas ter a forma de uma. `America/Sao_Pualo`
-- passa no CHECK de formato e renderiza errado para sempre.
--
-- Gatilho e nao CHECK pela mesma razao da `store_items_recusa_data_futura`:
-- consultar `pg_timezone_names` nao e imutavel, e o Postgres recusa funcao
-- volatil em restricao -- um CHECK com ela nem chega a ser criado.
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

-- Os indices das duas consultas que a rota faz: a agenda ativa por data, e a
-- agenda ativa de uma cidade. Parciais em `active` pela mesma razao dos indices
-- da vitrine: evento retirado nunca entra na leitura.
--
-- `starts_at` na frente porque a ordenacao da secao e SEMPRE por data: `when`
-- decide o sentido (crescente para o que vem, decrescente para o que passou) e
-- o Postgres percorre o mesmo indice nos dois sentidos.
CREATE INDEX network_events_agenda
  ON network_events (starts_at, id)
  WHERE active;

CREATE INDEX network_events_por_cidade
  ON network_events (city, starts_at, id)
  WHERE active;

-- ---------------------------------------------------------------------------
-- A presenca. DA PESSOA, e nunca do pet -- ver a ausencia 1 no cabecalho.
-- ---------------------------------------------------------------------------

CREATE TABLE network_event_checkins (
  -- Aponta para a identidade INTERNA do encontro, nunca para o endereco publico
  -- dele. E o que separa "qual encontro" de "como o encontro e enderecado", e e
  -- o que o criterio 2 da BICHUS-19 cobra.
  event_id      uuid        NOT NULL REFERENCES network_events (id) ON DELETE CASCADE,

  -- A unica coluna que identifica alguem nesta secao inteira, e ela NUNCA e
  -- projetada. O contrato le esta tabela por `count(*)` e por mais nada.
  user_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  checked_in_at timestamptz NOT NULL DEFAULT now(),

  -- A chave composta e a idempotencia: o segundo check-in da mesma pessoa no
  -- mesmo evento deixa de ser algo que a aplicacao precisa conferir e passa a
  -- ser um estado que o banco recusa. Mesma forma de
  -- `store_catalog_versions_uma_corrente`: a regra mora onde ela nao pode ser
  -- contornada por caminho que ninguem previu.
  PRIMARY KEY (event_id, user_id)
);

COMMENT ON TABLE network_event_checkins IS
  'Quem confirmou presenca. NAO HA `pet_id`, e a ausencia e a decisao do ADR-0025: check-in por pet publicaria que dois animais sao do mesmo tutor, que e o item 7 do ADR-0010. Nenhuma operacao do contrato le esta tabela linha a linha -- a unica leitura e count(*).';
-- ESTA COLUNA NAO LEVA A MARCA `NUNCA sai do servidor`, E A AUSENCIA E
-- DELIBERADA -- nao e esquecimento e nao e descuido.
--
-- O portao de `src/tools/portao-colunas-que-nao-saem.ts` busca pelo NOME da
-- coluna marcada, no contrato inteiro e em `src/` inteiro. `user_id` e um dos
-- nomes mais comuns do produto: marca-lo aqui faria o portao acusar dezenas de
-- usos legitimos em outros modulos e, pior, faria alguem desligar o portao para
-- voltar a trabalhar. Portao que acusa demais morre igual a portao que nao
-- acusa -- e o que morre junto e a protecao de `submitted_by_user_id`, que
-- depende do mesmo mecanismo.
--
-- O que guarda esta coluna, entao, esta escrito e e verificavel:
--   1. o contrato nao tem campo para ela (`NetworkEventSummary` e `NetworkEvent`
--      trazem `checkin_count`, um inteiro, e nenhum campo com pessoas);
--   2. `tests/integration/rede-nao-liga-dois-pets.test.ts` varre o CORPO INTEIRO
--      serializado das respostas publicas da secao atras de qualquer UUID, e nao
--      campo a campo -- e por campo A MAIS que uma resposta se afasta do
--      documento sem alarme;
--   3. a unica leitura desta tabela na camada de persistencia e `count(*)`.
COMMENT ON COLUMN network_event_checkins.user_id IS
  'NUNCA PROJETADO. A resposta publica de um evento traz `checkin_count`, um inteiro, e nenhum campo com pessoas -- nem nome, nem primeiro nome, nem apelido, nem slug, nem avatar. Nao leva a marca do portao de colunas porque `user_id` e nome comum demais para ser buscado por nome; quem guarda esta coluna e a isca `rede-nao-liga-dois-pets`, que varre o corpo inteiro das respostas.';

-- ---------------------------------------------------------------------------
-- A galeria. A foto e do EVENTO, e nao de quem a enviou.
-- ---------------------------------------------------------------------------

CREATE TABLE network_event_photos (
  -- Mesma decisao de `network_events.id`, e pelo mesmo motivo.
  --
  -- Hoje nada aponta para esta tabela, entao uma chave primaria em `slug` aqui
  -- nao faria o portao da BICHUS-19 reprovar. Ela passaria por SORTE, e a sorte
  -- acaba na primeira coisa que apontar para uma foto -- uma denuncia, uma fila
  -- de moderacao, um registro de remocao, que e exatamente a fase seguinte
  -- desta secao. Duas convencoes dentro da MESMA migracao e a convencao que
  -- diverge.
  id                   uuid        PRIMARY KEY,

  slug                 text        NOT NULL
                       CONSTRAINT network_event_photos_slug_formato
                       CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),

  event_id             uuid        NOT NULL REFERENCES network_events (id) ON DELETE CASCADE,

  image_url            text        NOT NULL
                       CONSTRAINT network_event_photos_imagem_e_https
                       CHECK (image_url ~ '^https://'),

  -- Opcional, e curta. Legenda sem teto vira post, e post e conteudo com
  -- moderacao -- que e a fase seguinte, nao esta.
  caption              text
                       CONSTRAINT network_event_photos_legenda_tem_tamanho
                       CHECK (caption IS NULL OR char_length(btrim(caption)) BETWEEN 2 AND 140),

  -- Guardado para remocao, auditoria e resposta a abuso. **NUNCA PROJETADO.**
  --
  -- Atribuir foto a pessoa reconstruiria a lista de presenca por outro caminho:
  -- dez fotos assinadas sao dez nomes presentes, com a vantagem, para quem
  -- procura, de virem com imagem do lugar.
  --
  -- `NULL` porque a foto desta fatia e curada e nao tem remetente, e
  -- `ON DELETE SET NULL` porque a conta de quem enviou pode ser excluida sem
  -- que a foto do evento tenha de sumir junto.
  submitted_by_user_id uuid        REFERENCES users (id) ON DELETE SET NULL,

  published_at         timestamptz NOT NULL DEFAULT now(),
  sort_order           smallint    NOT NULL DEFAULT 0
);

COMMENT ON TABLE network_event_photos IS
  'A galeria de um encontro. A foto pertence ao EVENTO: a resposta publica tem imagem e legenda, e mais nada. Nesta fatia ela e EXIBIDA e nao ENVIADA -- o envio pela comunidade depende de moderacao, que nao existe no repositorio, e do armazenamento de objeto na pilha de integracao.';
-- A MARCA `NUNCA sai do servidor` NAO E PROSA: ela e lida por
-- `src/tools/portao-colunas-que-nao-saem.ts`, que varre o contrato e `src/`
-- atras do NOME desta coluna e reprova quem a projetar. E o mesmo mecanismo que
-- guarda `professionals.created_by_user_id` desde a emenda 1 do ADR-0011, e
-- pela mesma razao: quem enviou a foto e um VINCULO ENTRE DUAS PESSOAS (esta
-- pessoa esteve neste lugar), e vinculo entre pessoas nao atravessa a borda --
-- nem como campo, nem como contagem, nem como existencia.
--
-- Com a marca, a decisao 3 do ADR-0025 deixa de valer pela disciplina de quem
-- escreve a projecao e passa a ter portao. Sem ela, valeria ate o dia em que
-- alguem acrescentasse o campo "enviada por" achando que estava sendo gentil.
COMMENT ON COLUMN network_event_photos.submitted_by_user_id IS
  'QUEM ENVIOU. Vinculo entre duas pessoas -- esta pessoa esteve neste lugar: NUNCA sai do servidor, em nenhuma resposta, nem como contagem nem como existencia (ADR-0025 secao 3). Guardado por `src/tools/portao-colunas-que-nao-saem.ts`. Existe para remocao, auditoria e resposta a abuso.';

CREATE UNIQUE INDEX network_event_photos_slug_unico ON network_event_photos (slug);

CREATE INDEX network_event_photos_da_galeria
  ON network_event_photos (event_id, sort_order, id);

-- Down Migration

DROP INDEX network_event_photos_da_galeria;
DROP INDEX network_event_photos_slug_unico;
DROP TABLE network_event_photos;
DROP TABLE network_event_checkins;
DROP INDEX network_events_por_cidade;
DROP INDEX network_events_agenda;
DROP INDEX network_events_slug_unico;
DROP TRIGGER network_events_fuso_existe ON network_events;
DROP FUNCTION network_events_recusa_fuso_inexistente();
DROP TABLE network_events;
