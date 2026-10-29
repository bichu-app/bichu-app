-- A GALERIA DO PARCEIRO NO DIRETORIO DE `Perto` (decisao do cliente de
-- 29/10/2026, verbatim: *"implemente a tabela de galeria entao"*).
--
-- O pedido que a motivou, dele, em 28/10: *"no backoffice para cadastrar um
-- parceiro, so esta permitindo subir uma foto, deve ser padrao igual na pagina
-- de eventos"*.
--
-- ## ELA E IRMA DA GALERIA DO ENCONTRO, E ISSO E LITERAL
--
-- "Padrao igual na pagina de eventos" tem um modelo pronto neste repositorio:
-- `network_event_images` (`20260928000004`), que por sua vez copiou
-- `store_item_images` (`20260928000003`). Esta tabela e a MESMA forma, campo
-- por campo e restricao por restricao:
--
--   - ate 8 imagens, pelo `CHECK` de `position` (0 a 7) somado a unicidade de
--     posicao por entrada -- o teto e do BANCO e nao do caso de uso;
--   - `position = 0` e a capa da galeria;
--   - `image_id` com `UNIQUE` global, para a mesma imagem de catalogo nao
--     aparecer em duas entradas;
--   - unicidade de ordem DIFERIDA, para reordenar ser um conjunto de escritas
--     na mesma transacao sem colidir no meio;
--   - `alt_text` OPCIONAL, com `CHECK` de tamanho que continua valendo quando
--     o texto vem.
--
-- `alt_text` nasce anulavel, e isso NAO e afrouxamento novo: e o estado em que
-- a `Loja` esta desde 17/10/2026 (`20261017000002`) e a `Rede` desde 21/10
-- (`20261020000013`), as duas por pedido do cliente (*"pode remover a descricao
-- da imagem"*, dito duas vezes). Nascer `NOT NULL` aqui criaria, em 29/10, a
-- obrigacao que as outras duas galerias perderam -- e o painel usa UM
-- componente de galeria para as tres (`admin/src/componentes/Galeria.tsx`), que
-- hoje nao exige descricao em nenhuma.
--
-- O `CHECK` de tamanho (2 a 150) FICA, e pela mesma leitura que a
-- `20261020000013` escreveu: em Postgres um `CHECK` cujo resultado e NULL conta
-- como SATISFEITO, entao `char_length(btrim(alt_text)) BETWEEN 2 AND 150`
-- recusa `"a"` e aceita a ausencia sem uma linha de reescrita.
--
-- ## A LOGO CONTINUA SINGULAR, E A GALERIA E TABELA A PARTE
--
-- `professionals.logo_image_id` e `professionals.photo_image_id`
-- (`20261018000008`) tem indice UNICO cada um e **nao sao tocados aqui**. A
-- razao e de produto e nao de compatibilidade:
--
--   - **a logo e UMA.** Ela e a marca, desenhada ao lado do nome, num quadrado
--     (`DERIVADAS_DA_LOGO`: 512 e 176, as duas quadradas). "Oito logos" nao e
--     um estado que signifique algo, e a listagem le so a logo.
--   - **a foto do local tambem continua UMA**, e esta ausencia e a divergencia
--     declarada em relacao ao encontro: no encontro NAO existe coluna de capa,
--     a capa e a `position = 0` da galeria. Aqui `photo_image_id` continua
--     existindo porque ele JA existe -- no contrato (`AdminDirectoryEntry
--     .photo`, `AdminDirectoryEntryInput.photo_upload_id`) e em dado aplicado
--     em homologacao. Tira-lo seria `response-property-removed` somado a uma
--     migracao de dado que nenhuma decisao pediu.
--
-- Dito em voz alta, porque e o preco: a partir desta migracao a entrada tem
-- DOIS lugares para foto do lugar -- a `photo` singular e a galeria. O dia em
-- que o cliente decidir que a capa da entrada e a `position = 0`, a migracao
-- que fizer isso move `photo_image_id` para a galeria e aposenta a coluna.
--
-- ## O PROPOSITO NOVO: `directory_gallery`
--
-- Oitavo proposito da esteira de imagem de catalogo (ADR-0007, ADR-0027 item
-- 10), e nao uma esteira nova: teto de bytes, formato de saida, higiene de
-- EXIF, escada de qualidade e varredura de vencidos ja moram la, e uma copia
-- deles seria cinco regras concordando por enquanto.
--
-- **Separado de `directory_photo`, e nao o mesmo**, pelo mesmo critério que
-- separou `user_showcase` de `user_photo` na `20261018000040`: aquele e a foto
-- UNICA do lugar (duas derivadas, `banner` e `card`) e este sao as ate oito da
-- galeria, que precisam TAMBEM da miniatura de 480 x 360 que a faixa da galeria
-- desenha. Um proposito so para os dois obrigaria a derivada a adivinhar qual
-- tela vai desenhar a imagem.
--
-- O autor do envio continua sendo `admin_account_id`: quem sobe e o
-- administrador no painel, e `catalog_upload_intents_um_autor` segue impondo
-- exatamente um autor.
--
-- **Os dois `CHECK` de proposito sao REESCRITOS, e os oito valores ficam
-- listados um a um nas duas tabelas** -- a primeira versao de uma migracao de
-- vitrine deste projeto APAGOU tres valores ao reescrever, e e por isso que
-- `tests/integration/conjunto-exato-dos-checks.test.ts` fixa o conjunto exato
-- nas duas.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ, E CADA AUSENCIA E DELIBERADA
--
-- - **Nao toca `professionals`.** Nenhuma coluna entra, nenhum indice sai.
-- - **Nao mexe em `network_event_images` nem em `store_item_images`.** As duas
--   galerias irmas ficam exatamente como estao.
-- - **Nao cria coluna de autor.** Quem criou e quem mudou esta em
--   `audit.events`, o unico lugar onde isso e imutavel (ADR-0027 A.2).
-- - **Nao da galeria a nenhuma superficie publica.** `professionals.logo` e
--   `photo` nunca sairam em `DirectoryEntrySummary`, e esta galeria nasce no
--   mesmo regime: ela existe no painel. Expor imagem de estabelecimento em
--   `Perto` depende de decisao do cliente (ADR-0010), e a listagem do
--   aplicativo esta MEDIDA como o lugar onde ela nao cabe -- vinte faixas 16:9
--   custariam 65,6 MiB de imagem decodificada.
--
-- ## SOBRE O `down`, e ele PARA COM ERRO de proposito
--
-- Descer esta migracao apaga a galeria inteira: nao ha coluna para onde
-- recolher oito imagens, e `catalog_images` guarda a imagem mas nao a ORDEM nem
-- a entrada a que ela pertence. Entao a descida **recusa** quando a galeria tem
-- linha, nomeando quantas sao e quantas estao em entrada PUBLICADA.
--
-- E o mesmo desfecho da `20261028000001` de ontem, e pela mesma razao escrita
-- lá: o contrario seria `DELETE` silencioso de dado real. Quem precisa descer
-- com galeria gravada decide primeiro o que fazer com ELA, e isso e decisao de
-- produto e nao de migracao.
--
-- A recusa vale para rascunho tambem, e nao so para publicado. Foto de entrada
-- em rascunho e trabalho de quem cadastrou, e a descida nao sabe distinguir "o
-- operador vai voltar nisso amanha" de "ninguem quer isto". O numero de
-- publicadas vai na mensagem porque e ele que diz o TAMANHO do estrago: aquelas
-- estao no ar.
--
-- `RAISE EXCEPTION`, e nunca `RAISE NOTICE`: `node-pg-migrate` DESCARTA
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
                     'user_photo', 'user_showcase', 'user_publication'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'user_photo', 'user_showcase', 'user_publication'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `directory_gallery` entrou em 29/10/2026 (decisao do cliente: implemente a tabela de galeria entao) e e SEPARADO de `directory_photo` pelo mesmo critério que separou `user_showcase` de `user_photo`: aquele e a foto UNICA do lugar e este sao as ate oito da galeria, que pedem tambem a miniatura de 480 x 360. `user_showcase` e a vitrine do usuario e `user_publication` e a foto de UMA publicacao do Mural; os dois tem autor em `user_id` e nunca em `admin_account_id`. `directory_gallery`, como `directory_logo` e `directory_photo`, tem autor em `admin_account_id`: quem sobe e o administrador no painel.';

-- ---------------------------------------------------------------------------
-- 2. A GALERIA
-- ---------------------------------------------------------------------------

CREATE TABLE professional_images (
  professional_id uuid     NOT NULL REFERENCES professionals (id) ON DELETE CASCADE,
  image_id        uuid     NOT NULL UNIQUE REFERENCES catalog_images (id),
  position        smallint NOT NULL
                  CONSTRAINT professional_images_posicao
                  CHECK (position BETWEEN 0 AND 7),
  -- Anulavel desde o nascimento. Ver o cabecalho: a `Loja` e a `Rede` perderam
  -- a obrigacao por pedido do cliente, e nascer `NOT NULL` aqui criaria em
  -- 29/10 a obrigacao que as outras duas galerias nao tem.
  alt_text        text
                  CONSTRAINT professional_images_texto_alternativo_tem_tamanho
                  CHECK (char_length(btrim(alt_text)) BETWEEN 2 AND 150),
  PRIMARY KEY (professional_id, image_id),
  -- Diferida para que reordenar seja um conjunto de escritas na mesma
  -- transacao sem colidir no meio. Copiada de `network_event_images_ordem_unica`.
  CONSTRAINT professional_images_ordem_unica
    UNIQUE (professional_id, position) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE professional_images IS
  'A galeria de fotos de uma entrada do diretorio de Perto (decisao do cliente de 29/10/2026: implemente a tabela de galeria entao). MESMA forma de network_event_images (20260928000004), que e o padrao da pagina de eventos que ele pediu: ate 8 imagens, a capa e position = 0, unicidade de ordem diferida. Imagem de catalogo com purpose directory_gallery, conferido pelo caso de uso -- um CHECK nao alcanca coluna de outra tabela. NAO substitui professionals.logo_image_id nem photo_image_id: a logo e UMA porque e a marca, e a photo singular continua existindo porque ja existe no contrato e em dado de homologacao.';
COMMENT ON COLUMN professional_images.professional_id IS
  'Aponta para professionals.id, a identidade interna, e nunca para o slug -- chave estrangeira sobre endereco publico e o que o criterio 2 da BICHUS-19 proibe (ADR-0024). ON DELETE CASCADE por simetria com as galerias irmas; nenhuma entrada do diretorio se apaga na pratica, porque retirar e status = removed.';
COMMENT ON COLUMN professional_images.image_id IS
  'catalog_images.id. UNIQUE GLOBAL: a mesma imagem de catalogo nao aparece em duas entradas, e e isso que faz a recusa 400 upload_not_usable do caso de uso ter rede embaixo em vez de virar 500 do banco.';
COMMENT ON COLUMN professional_images.position IS
  '0 e a capa da galeria. Ate 7: o teto de 8 imagens e este CHECK somado a professional_images_ordem_unica.';
COMMENT ON COLUMN professional_images.alt_text IS
  'Texto alternativo da imagem, OPCIONAL desde o nascimento desta tabela (29/10/2026). Nao e afrouxamento desta migracao: a Loja perdeu a obrigacao em 17/10/2026 (20261017000002) e a Rede em 21/10 (20261020000013), as duas por pedido do cliente -- "pode remover a descricao da imagem", dito duas vezes --, e o painel usa UM componente de galeria para as tres. O CHECK de tamanho (2 a 150) vale quando o texto vem: em Postgres um CHECK que resulta NULL conta como SATISFEITO, entao ele recusa "a" e aceita a ausencia sem reescrita -- a mesma leitura das duas migracoes citadas. Nulo faz quem desenha cair no nome da entrada.';

-- Down Migration

-- A DESCIDA PARA COM ERRO quando a galeria tem linha. Ver o cabecalho: nao ha
-- onde recolher oito imagens, e o contrario seria DELETE silencioso de dado
-- real. `RAISE EXCEPTION` e nao `NOTICE`, porque `node-pg-migrate` descarta
-- `NOTICE`.
DO $$
DECLARE
  total      bigint;
  publicadas bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE p.status = 'published')
    INTO total, publicadas
    FROM professional_images i
    JOIN professionals p ON p.id = i.professional_id;

  IF total > 0 THEN
    RAISE EXCEPTION
      'a descida apagaria % foto(s) de galeria de parceiro, % em entrada PUBLICADA, e nao ha coluna para onde recolhe-las: catalog_images guarda a imagem e nao guarda a ordem nem a entrada. Decida o que fazer com a galeria ANTES de descer (ADR-0027; mesmo desfecho da 20261028000001)',
      total, publicadas;
  END IF;
END $$;

DROP TABLE IF EXISTS professional_images;

-- Os dois `CHECK` voltam aos SETE propositos. Isto tambem pode falhar de
-- proposito: imagem de catalogo ja gravada com `purpose = 'directory_gallery'`
-- -- por exemplo a de um envio confirmado cuja linha de galeria foi removida
-- pelo painel -- nao cabe na restricao antiga, e `ADD CONSTRAINT` recusa com
-- 23514. E o desfecho certo pela mesma razao do bloco acima: `DELETE` em
-- `catalog_images` apagaria o ponteiro da derivada que esta no balde.
ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase', 'user_publication'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase', 'user_publication'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `user_showcase` e a vitrine do usuario e `user_publication` e a foto de UMA publicacao do Mural; os dois tem autor em `user_id` e nunca em `admin_account_id`.';
