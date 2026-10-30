-- AS FOTOS DO ESTABELECIMENTO NA INDICACAO (pedido do cliente, 29 e 30/10/2026):
-- *"nas indicacoes de estabelecimento e eventos so esta sendo possivel enviar
-- uma imagem no app, devemos deixar enviar ate 4 imagens"* e, no dia seguinte,
-- *"na pagina de indicacao de profissional/estabelecimento, so tem o campo para
-- subir a foto do logotipo da empresa, mas nao as fotos do estabelecimento que
-- fica no topo da pagina"*.
--
-- ## O QUE ESTA MIGRACAO COBRE, E O QUE NAO PRECISOU DELA
--
-- O pedido tem DUAS pontas e so UMA e migracao:
--
--  - **a indicacao** nao tinha onde guardar foto de estabelecimento. A
--    `20261029000004` criou `directory_suggestions.logo_image_id`, SINGULAR e de
--    proposito ("a logo e UMA porque e a marca"), e nao ha coluna de foto. Sem
--    tabela, o campo seria aceito e descartado em silencio -- o mesmo desfecho
--    que a `20261029000003` descreve para `entity_kind`. **E esta migracao.**
--  - **o encontro da comunidade** ja tem onde: `network_event_images`
--    (`20260928000004`) guarda ate OITO imagens por encontro, com
--    `CHECK (position BETWEEN 0 AND 7)` e a capa em `position = 0`, e o painel ja
--    escreve as oito. O aplicativo escrevia UMA, por limite de contrato e de
--    tela, e nao de banco. **Aquela ponta nao tem migracao nenhuma**, e conferir
--    isso antes de escrever SQL foi o que impediu uma tabela inutil: medido em
--    `migrations/20260928000004_imagens-do-encontro.sql`, linha 22.
--
-- ## O PROPOSITO NOVO E `directory_suggestion_photo`, E ELE NAO E `directory_photo`
--
-- Decimo proposito da esteira de imagem de catalogo (ADR-0007, ADR-0027 item
-- 10), e **nao uma esteira nova**: teto de bytes, formato de saida, higiene de
-- EXIF, escada de qualidade, derivadas por layout e varredura de vencidos ja
-- moram la. A foto da indicacao reusa `DERIVADAS_DA_FOTO_DO_LOCAL` -- a MESMA
-- constante da foto do painel, e nao uma copia dos numeros --, porque a
-- geometria e a mesma: a faixa 16:9 do topo da ficha.
--
-- **MAS O PROPOSITO E SEPARADO DE `directory_photo`, E ESSA SEPARACAO E A
-- FRONTEIRA INTEIRA DESTE ARQUIVO** -- a mesma razao, palavra por palavra, que a
-- `20261029000004` escreveu para o logotipo:
--
--   - `diretorio-administrativo.ts` (`imagemDoEnvio`) exige
--     `purpose = 'directory_photo'` para aceitar um `upload_id` em
--     `professionals.photo_image_id`. `professionals` E a superficie publica:
--     `DirectoryEntrySummary` e `DirectoryEntryDetail` saem dela. Um envio
--     autorizado para indicacao **nao casa esse proposito** e e recusado com
--     `400 upload_not_usable` -- entao nao existe caminho, nem por descuido nem
--     por `upload_id` adivinhado, que leve a foto de uma indicacao pendente para
--     o `Perto`;
--   - a escrita da indicacao exige o proposito inverso. Envio do PAINEL
--     (`directory_photo`, autor em `admin_account_id`) nao entra na fila.
--
-- O autor do envio e `user_id` e nunca `admin_account_id`, como no logotipo da
-- indicacao e na capa do encontro da comunidade (ADR-0025 emenda 3):
-- `catalog_upload_intents_um_autor` continua impondo exatamente um autor, e e
-- `user_id` que permite a confirmacao conferir a conta na clausula `WHERE`.
--
-- ## A TABELA, E POR QUE E TABELA E NAO QUATRO COLUNAS
--
-- `directory_suggestion_images`, com a **MESMA forma de `professional_images`**
-- (`20261029000001`) e de `network_event_images`, que e o padrao de galeria
-- deste projeto: `position` com `CHECK`, unicidade de ordem DIFERIDA,
-- `image_id` com `UNIQUE` global.
--
-- Quatro colunas (`photo_1_image_id` ... `photo_4_image_id`) foram consideradas e
-- recusadas: reordenar viraria `UPDATE` de quatro colunas, "remover a segunda"
-- viraria compactacao a mao, e o teto de quatro ficaria cravado no DDL --
-- enquanto numa tabela ele e um `CHECK` de uma linha. As duas galerias irmas ja
-- escreveram esse argumento.
--
-- **O `CHECK` e `BETWEEN 0 AND 3`, e nao `0 AND 7`.** O teto e QUATRO porque e o
-- que o cliente pediu, e a assimetria com as galerias do painel (oito) e
-- deliberada: alinhar os numeros exigiria um pedido, e nao houve. Subir de
-- quatro para oito depois e trocar um `CHECK`, sem reescrever linha.
--
-- **`position = 0` E A CAPA**, como nas duas irmas, e **nao existe coluna de
-- capa**: duas formas de dizer qual e a capa e o defeito, e nao o recurso.
--
-- **NAO HA `alt_text` nesta tabela**, e e a primeira galeria deste projeto a
-- nascer sem ele. Nao e esquecimento e nao e economia: o cliente mandou remover
-- a descricao de foto do APLICATIVO em 26/10/2026 (*"remova todos os campos de
-- descricao de foto do aplicativo, nao iremos implementar solucoes para quem usa
-- leitor de tela por enquanto"*), e **estas imagens so entram pelo aplicativo**
-- -- nao ha painel que as escreva. Uma coluna que nenhuma escrita preenche e
-- promessa de dado que nao existe. As irmas tem a coluna porque o PAINEL as
-- escreve e lá o campo ainda pode vir.
--
-- **O CUSTO, dito:** quem revisa a fila ve as fotos sem texto alternativo
-- escrito por quem enviou. O cliente foi informado desse custo em 21/10/2026,
-- por duas vezes, e repetiu o pedido em 26/10 alcancando o app.
--
-- `ON DELETE` do `suggestion_id` e **`CASCADE`**, e aqui a escolha DIVERGE de
-- `directory_suggestions.logo_image_id` (que e `NO ACTION`), com motivo: aquela
-- e uma coluna NA indicacao, e apagar a indicacao com logo e o caso que
-- `NO ACTION` faz recusar. Esta e uma tabela FILHA -- a linha nao tem vida
-- propria sem a indicacao, e `NO ACTION` aqui tornaria qualquer remocao de
-- indicacao um erro de chave estrangeira em vez de uma decisao. **Isto nao
-- apaga imagem:** `catalog_images` e a derivada no balde ficam de pe, e e so o
-- vinculo que sai. A indicacao, de todo modo, nao se apaga na pratica: ela e
-- decidida, e o estado fica.
--
-- `image_id` com `UNIQUE` global pela mesma razao de `professional_images.
-- image_id` e de `directory_suggestions_logotipo_unico`: a mesma imagem de
-- catalogo nao serve a duas indicacoes. E isso que faz a recusa
-- `400 upload_not_usable` do caso de uso ter rede embaixo, em vez de virar `500`
-- do banco numa colisao. `REFERENCES catalog_images (id)` sem `ON DELETE`: o
-- padrao `NO ACTION` recusa apagar a imagem com o vinculo de pe, que e o
-- desfecho certo.
--
-- ## A FUNCAO DE REGISTRO NAO MUDA, E ISSO E DE PROPOSITO
--
-- `directory_suggestions_registrar` existe por UM motivo so:
-- `suggested_by_user_id` e coluna proibida para o SQL da aplicacao
-- (`portao-colunas-que-nao-saem`), e o nome dela fica dentro da funcao. As
-- quatro migracoes anteriores a trocaram de onze para quatorze argumentos porque
-- cada campo novo era **coluna de `directory_suggestions`**.
--
-- **Aqui nao e.** As fotos moram em OUTRA tabela, que nao tem coluna proibida
-- nenhuma, entao o repositorio as insere com SQL comum depois de a funcao
-- devolver `created_at` -- na mesma transacao. Levar as fotos para dentro da
-- funcao exigiria um argumento `uuid[]`, um `unnest` com `ordinality` e um
-- quinto `DROP`/`CREATE` de assinatura, para nao ganhar fronteira nenhuma.
-- **Nao mexer na funcao e o trabalho feito, e nao trabalho evitado.**
--
-- ## ADITIVO: NENHUMA LINHA E REESCRITA
--
-- A tabela nasce vazia e a coluna de ninguem muda. Indicacao sem foto de
-- estabelecimento e o estado normal -- o APK publicado nao tem o campo, e
-- exigi-lo no contrato seria `request-property-became-required` e derrubaria o
-- aplicativo que esta no aparelho agora.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao da as fotos a nenhuma superficie publica.** Quem passa a le-las e a
--   FILA DO PAINEL (`AdminDirectorySuggestion.photo_urls`), que exige sessao de
--   painel, e o que sai e a URL da derivada e **nunca o identificador**
--   (ADR-0010 item 6, que proibe UUID do banco em resposta, sem excecao).
-- - **Nao carrega as fotos para `professionals` na aprovacao.** A aprovacao
--   continua exatamente como esta. Levar a imagem para a entrada e escrita em
--   superficie publica a partir de dado de usuario, e isso e decisao de quem
--   revisa -- feita no painel, com o envio DELE (`directory_photo`). Nao ha
--   migracao de dado aqui e nao ha gatilho.
-- - **Nao toca `network_event_images`.** Ver o cabecalho: o encontro ja cabia.
-- - **Nao toca `sanitize_status`** (`20261001000006`): e o estado da OUTRA
--   esteira, a da foto de pet e de achado. Tocar nele seria criar o segundo
--   caminho de imagem que esta migracao existe para nao criar.
-- - **Nao mexe em `catalog_images` nem em `catalog_upload_intents`** alem do
--   valor novo nos dois `CHECK` de proposito.
--
-- **Os dois `CHECK` de proposito sao REESCRITOS, e os DEZ valores ficam listados
-- um a um nas duas tabelas** -- a primeira versao de uma migracao de vitrine
-- deste projeto APAGOU tres valores ao reescrever, e e por isso que
-- `tests/integration/conjunto-exato-dos-checks.test.ts` fixa o conjunto exato nas
-- duas.
--
-- ## SOBRE O `down`, E O QUE ELE PARA
--
-- Duas coisas podem parar a descida, e as duas param de proposito:
--
--  1. **a tabela com linha dentro.** Apagar `directory_suggestion_images` perde o
--     vinculo das fotos das indicacoes gravadas depois da subida, e nao ha onde
--     recolher: `catalog_images` guarda a imagem e nao guarda a qual indicacao
--     ela pertence. A descida **recusa** quando ha linha, nomeando quantas
--     imagens, quantas indicacoes e quantas delas ainda estao PENDENTES --
--     aquelas sao as que alguem ainda vai revisar. Mesmo desfecho da
--     `20261029000001` e da `20261029000004`;
--  2. **a volta dos nove propositos.** Imagem de catalogo ja gravada com
--     `purpose = 'directory_suggestion_photo'` nao cabe na restricao antiga, e
--     `ADD CONSTRAINT` recusa com 23514. E o desfecho certo pela mesma razao:
--     `DELETE` em `catalog_images` apagaria o ponteiro da derivada que esta no
--     balde.
--
-- `RAISE EXCEPTION`, e nunca `RAISE NOTICE`: `node-pg-migrate` **DESCARTA**
-- `NOTICE` e `WARNING`, entao um aviso aqui nao chegaria a ninguem e a descida
-- concluiria apagando tudo.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. O PROPOSITO NOVO nas duas tabelas da esteira
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo', 'directory_suggestion_photo',
                     'user_photo', 'user_showcase', 'user_publication'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo', 'directory_suggestion_photo',
                     'user_photo', 'user_showcase', 'user_publication'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `directory_suggestion_photo` entrou em 30/10/2026 (pedido do cliente: so tem o campo para subir a foto do logotipo da empresa, mas nao as fotos do estabelecimento que fica no topo da pagina) e e SEPARADO de `directory_photo` pela MESMA razao que separou `directory_suggestion_logo` de `directory_logo`: aquele e confirmado em professionals.photo_image_id, que SAI em superficie publica, e este so e confirmado em directory_suggestion_images, que so a fila do painel le -- e lá sai a URL da derivada, nunca o identificador. Um proposito para os dois abriria as duas direcoes e deixaria a foto de uma indicacao NAO APROVADA chegar ao Perto. Ele reusa DERIVADAS_DA_FOTO_DO_LOCAL (a MESMA constante, nao uma copia) porque a geometria e a mesma faixa 16:9, e a minima e 600 x 600. O autor dele e `user_id` e nunca `admin_account_id`, como no logotipo da indicacao e na capa do encontro da comunidade. `directory_suggestion_logo` entrou em 29/10/2026 e e a marca, UMA, quadrada, com minima de 256. `directory_logo`, `directory_photo` e `directory_gallery` tem autor em `admin_account_id`: quem sobe e o administrador no painel.';

-- ---------------------------------------------------------------------------
-- 2. A TABELA DAS FOTOS DA INDICACAO
-- ---------------------------------------------------------------------------
--
-- Mesma forma de `professional_images` (`20261029000001`) e de
-- `network_event_images` (`20260928000004`), SEM `alt_text` -- ver o cabecalho.

CREATE TABLE directory_suggestion_images (
  suggestion_id uuid     NOT NULL REFERENCES directory_suggestions (id) ON DELETE CASCADE,
  image_id      uuid     NOT NULL UNIQUE REFERENCES catalog_images (id),
  position      smallint NOT NULL
                CONSTRAINT directory_suggestion_images_posicao
                CHECK (position BETWEEN 0 AND 3),

  PRIMARY KEY (suggestion_id, image_id),

  CONSTRAINT directory_suggestion_images_ordem_unica
    UNIQUE (suggestion_id, position) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE directory_suggestion_images IS
  'As fotos do ESTABELECIMENTO que quem indicou enviou (pedido do cliente de 29 e 30/10/2026: devemos deixar enviar ate 4 imagens; so tem o campo do logotipo, mas nao as fotos do estabelecimento que fica no topo da pagina). MESMA forma de professional_images e de network_event_images, que e o padrao de galeria do projeto: position com CHECK, ordem unica DIFERIDA, image_id UNIQUE global. Imagem de catalogo com purpose directory_suggestion_photo, conferido pelo CASO DE USO -- um CHECK nao alcanca coluna de outra tabela. NAO substitui directory_suggestions.logo_image_id: a logo e UMA porque e a marca (um quadrado ao lado do nome) e NAO conta entre as quatro; estas sao a faixa 16:9 do topo. SEM alt_text, e e a primeira galeria do projeto a nascer assim: o cliente mandou remover a descricao de foto do APLICATIVO em 26/10/2026 e estas imagens so entram pelo aplicativo -- nao ha painel que as escreva, e coluna que nenhuma escrita preenche e promessa de dado que nao existe. Quem LE e a fila do painel (AdminDirectorySuggestion.photo_urls), e o que sai e a URL da derivada e nunca o identificador (ADR-0010 item 6). A APROVACAO NAO COPIA estas imagens para professionals: carregar imagem de usuario para superficie publica e decisao de quem revisa, feita no painel com o envio dele (directory_photo).';

COMMENT ON COLUMN directory_suggestion_images.suggestion_id IS
  'A indicacao a que a foto pertence. ON DELETE CASCADE, e aqui a escolha DIVERGE de directory_suggestions.logo_image_id (NO ACTION) com motivo: aquela e coluna NA indicacao, e esta e tabela FILHA -- a linha nao tem vida propria sem a indicacao, e NO ACTION tornaria qualquer remocao de indicacao um erro de chave estrangeira em vez de uma decisao. Isto NAO apaga imagem: catalog_images e a derivada no balde ficam de pe, e so o vinculo sai.';
COMMENT ON COLUMN directory_suggestion_images.image_id IS
  'catalog_images.id, com purpose = directory_suggestion_photo. UNIQUE GLOBAL: a mesma imagem de catalogo nao serve a duas indicacoes, e e isso que faz a recusa 400 upload_not_usable do caso de uso ter rede embaixo em vez de virar 500 do banco. Sem ON DELETE: o padrao NO ACTION recusa apagar a imagem com o vinculo de pe, igual a professional_images.image_id. **Este UUID nunca sai em resposta** (ADR-0010 item 6): quem le recebe a URL da derivada.';
COMMENT ON COLUMN directory_suggestion_images.position IS
  '0 e a CAPA, como em professional_images e network_event_images, e nao existe coluna de capa -- duas formas de dizer qual e a capa e o defeito. Ate 3: o teto de QUATRO imagens e este CHECK somado a directory_suggestion_images_ordem_unica. E 0..3 e nao 0..7 porque quatro e o que o cliente pediu; a assimetria com as oito das galerias do painel e deliberada, e subir depois e trocar este CHECK sem reescrever linha.';
COMMENT ON CONSTRAINT directory_suggestion_images_ordem_unica ON directory_suggestion_images IS
  'Duas fotos da mesma indicacao nao ocupam a mesma posicao. DIFERIDA (DEFERRABLE INITIALLY DEFERRED) pela mesma razao das duas irmas: reordenar dentro de uma transacao passa por estados intermediarios em que duas linhas colidem, e a conferencia no fim da transacao e a que corresponde a intencao. Nao menciona literal de texto, entao NAO esta no registro de conjunto-exato-dos-checks.test.ts (que cobra CHECK, e nao UNIQUE).';
COMMENT ON CONSTRAINT directory_suggestion_images_posicao ON directory_suggestion_images IS
  'O teto de quatro imagens por indicacao. Nao menciona literal de texto: NAO entra no registro de conjunto-exato-dos-checks.test.ts.';

-- Down Migration

-- ---------------------------------------------------------------------------
-- 1. A DESCIDA PARA COM ERRO quando ha foto gravada
-- ---------------------------------------------------------------------------
--
-- Ver o cabecalho: nao ha onde recolher o vinculo -- `catalog_images` guarda a
-- imagem e nao guarda a qual indicacao ela pertence --, e o contrario seria
-- perda silenciosa de arquivo que uma pessoa subiu. `RAISE EXCEPTION` e nao
-- `NOTICE`, porque `node-pg-migrate` descarta `NOTICE`.
DO $$
DECLARE
  imagens    bigint;
  indicacoes bigint;
  pendentes  bigint;
BEGIN
  SELECT count(*),
         count(DISTINCT i.suggestion_id),
         count(DISTINCT i.suggestion_id) FILTER (WHERE s.review_status = 'pending')
    INTO imagens, indicacoes, pendentes
    FROM directory_suggestion_images i
    JOIN directory_suggestions s ON s.id = i.suggestion_id;

  IF imagens > 0 THEN
    RAISE EXCEPTION
      'a descida apagaria o vinculo de % foto(s) de estabelecimento em % indicacao(oes), % ainda PENDENTE(S) de revisao, e nao ha onde recolhe-lo: catalog_images guarda a imagem e nao guarda a qual indicacao ela pertence. Decida o que fazer com as fotos ANTES de descer (mesmo desfecho da 20261029000001 e da 20261029000004)',
      imagens, indicacoes, pendentes;
  END IF;
END $$;

DROP TABLE directory_suggestion_images;

-- ---------------------------------------------------------------------------
-- 2. Os dois `CHECK` voltam aos NOVE propositos
-- ---------------------------------------------------------------------------
--
-- Isto pode falhar de proposito: imagem de catalogo ja gravada com
-- `purpose = 'directory_suggestion_photo'` -- por exemplo a de um envio
-- confirmado cuja indicacao foi apagada -- nao cabe na restricao antiga, e
-- `ADD CONSTRAINT` recusa com 23514. E o desfecho certo: `DELETE` em
-- `catalog_images` apagaria o ponteiro da derivada que esta no balde.

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo',
                     'user_photo', 'user_showcase', 'user_publication'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo',
                     'user_photo', 'user_showcase', 'user_publication'));
