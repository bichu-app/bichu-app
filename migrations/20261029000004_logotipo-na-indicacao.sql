-- O LOGOTIPO NA INDICACAO (pedido do cliente, 29/10/2026): *"nao tem o campo do
-- logotipo para o usuario subir e indicar o estabelecimento"*.
--
-- ## POR QUE ISTO E UMA MIGRACAO, E NAO UM CAMPO DE TEXTO
--
-- O pedido diz "campo", mas o que falta nao e campo: e uma **operacao de
-- intencao de envio**. O backend nunca recebe os bytes (ADR-0007), entao a
-- forma inteira ja existe no produto -- `createNetworkEventCoverUploadIntent`
-- assina a politica, o aplicativo faz o `POST`/`PUT` no armazenamento, e a
-- escrita CONFIRMA o `upload_id`. O que nao existia era (a) um proposito para
-- este envio e (b) uma coluna na fila para o ponteiro da imagem.
--
-- `directory_suggestions` **nao tinha coluna de imagem**. Sem ela, o campo
-- seria aceito e descartado em silencio -- exatamente o desfecho que a
-- `20261029000003` descreve para `entity_kind`, e exatamente por isso que a
-- frente do formulario parou.
--
-- ## O PROPOSITO NOVO E `directory_suggestion_logo`, E ELE NAO E `directory_logo`
--
-- Nono proposito da esteira de imagem de catalogo (ADR-0007, ADR-0027 item 10),
-- e **nao uma esteira nova**: teto de bytes, formato de saida, higiene de EXIF,
-- escada de qualidade, derivadas por layout e varredura de vencidos ja moram
-- la. O logotipo da indicacao reusa `DERIVADAS_DA_LOGO` -- a MESMA constante da
-- logo do painel, e nao uma copia dos numeros --, porque a geometria e a mesma:
-- um quadrado ao lado do nome.
--
-- **MAS O PROPOSITO E SEPARADO DE `directory_logo`, E ESSA SEPARACAO E A
-- FRONTEIRA INTEIRA DESTE ARQUIVO.**
--
-- A indicacao vem de USUARIO, nao da equipe. A imagem de uma indicacao que
-- ninguem aprovou **nao pode aparecer em superficie publica** -- e a razao de a
-- fila existir. O que garante isso nao e prosa: e o T9, o proposito que amarra
-- o envio ao destino.
--
--   - `diretorio-administrativo.ts` (`imagemDoEnvio`) exige
--     `purpose = 'directory_logo'` para aceitar um `upload_id` em
--     `professionals.logo_image_id`. `professionals` E a superficie publica:
--     `DirectoryEntrySummary` e `DirectoryEntry` saem dela. Um envio autorizado
--     para indicacao **nao casa esse proposito** e e recusado com
--     `400 upload_not_usable` -- entao nao existe caminho, nem por descuido nem
--     por `upload_id` adivinhado, que leve a imagem de uma indicacao pendente
--     para o `Perto`;
--   - a escrita da indicacao exige o proposito inverso. Envio do PAINEL
--     (`directory_logo`, autor em `admin_account_id`) nao entra na fila.
--
-- **Se o proposito fosse UM, as duas direcoes estariam abertas** e a unica
-- defesa seria lembrar de conferir. O proposito separado e a conferencia que
-- nao depende de ninguem lembrar, e ela ja esta escrita e ja tem teste.
--
-- O autor do envio e `user_id`, como na capa do encontro da comunidade
-- (ADR-0025 emenda 3): `catalog_upload_intents_um_autor` continua impondo
-- exatamente um autor, e e `user_id` que permite a confirmacao conferir a conta
-- na clausula `WHERE`. Sem autor de `users`, confirmar o logotipo de outra
-- pessoa seria so adivinhar o `upload_id`.
--
-- ## A HIGIENE E A QUE JA EXISTE, E NAO UMA SEGUNDA
--
-- `catalog_images.status` ('processing' -> 'ready'/'rejected') e o estado desta
-- esteira, e `processarImagemDeCatalogo` **reescreve a derivada do zero, sem
-- EXIF, XMP nem IPTC**, recusa SVG e poliglota pelos numeros magicos e so marca
-- `ready` depois de a derivada estar no balde. `sanitize_status` da
-- `20261001000006` e o estado da OUTRA esteira (`upload_intents`, a foto de pet
-- e de achado): nao se toca nele aqui, e tocar seria justamente criar o segundo
-- caminho que esta migracao existe para nao criar.
--
-- ## A COLUNA: `logo_image_id`, SINGULAR E COM UNICIDADE GLOBAL
--
-- **Singular e nao galeria**, e isto nao e economia: a logo e UMA porque e a
-- marca. "Oito logotipos" nao e estado que signifique algo, e a galeria do
-- parceiro (`professional_images`, `20261029000001`) ja escreveu esse argumento.
--
-- `UNIQUE` global pela mesma razao de `professional_images.image_id`: a mesma
-- imagem de catalogo nao serve a duas indicacoes. E isso que faz a recusa
-- `400 upload_not_usable` do caso de uso ter rede embaixo, em vez de virar
-- `500` do banco numa colisao.
--
-- `ON DELETE` nao e declarado -- o padrao e `NO ACTION`, igual a
-- `professionals.logo_image_id`: apagar a imagem com a indicacao de pe recusa,
-- o que e o desfecho certo. A indicacao nao se apaga na pratica (ela e decidida,
-- e o estado fica).
--
-- ## A FUNCAO DE REGISTRO VAI DE TREZE PARA QUATORZE ARGUMENTOS
--
-- `directory_suggestions_registrar` existe porque `suggested_by_user_id` e
-- coluna proibida para o SQL da aplicacao: o nome dela fica dentro da funcao. A
-- `20261017000015` fez a troca de onze para doze e a `20261029000003` de doze
-- para treze, as duas escrevendo o mesmo motivo de forma: **DROP e CREATE, e
-- nunca `CREATE OR REPLACE`** -- no Postgres assinatura diferente e OUTRA
-- funcao, e deixar a de treze de pe a deixaria gravando indicacao sem logotipo
-- para sempre, pronta para alguem chamar.
--
-- `p_logo_image_id` entra **no fim**, e aqui a posicao e diferente da escolha da
-- `20261029000003`: `p_entity_kind` entrou depois de `p_kind` porque e o OUTRO
-- EIXO do mesmo par e se le junto com ele. O logotipo nao faz par com nada --
-- nao e "o outro lado" de nenhuma coluna existente --, e o lugar natural dele e
-- depois do recado, que e o ultimo campo que a pessoa preenche na tela.
--
-- ## ADITIVO E OPCIONAL: NENHUMA LINHA E REESCRITA
--
-- A coluna nasce anulavel e sem `DEFAULT`. **Nao ha `NOT NULL` possivel aqui**:
-- indicacao sem logotipo e o estado normal -- o APK publicado nao tem o campo, e
-- quem indica a clinica do bairro muitas vezes nao tem o arquivo da logo dela.
-- Exigi-la no contrato seria `request-property-became-required` e derrubaria o
-- aplicativo que esta no aparelho agora.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao da o logotipo a nenhuma superficie publica.** Nao existe operacao de
--   leitura de `directory_suggestions` fora de `listMyDirectorySuggestions` (a
--   propria conta) e da fila do painel, e nenhuma das duas ganhou coluna aqui.
-- - **Nao carrega o logotipo para `professionals` na aprovacao.** A aprovacao
--   continua exatamente como esta. Levar a imagem para a entrada e escrita em
--   superficie publica a partir de dado de usuario, e isso e decisao de quem
--   revisa -- feita no painel, com o envio DELE (`directory_logo`), que e o
--   caminho que ja existe. Nao ha migracao de dado aqui e nao ha gatilho.
-- - **Nao toca `catalog_images` nem `catalog_upload_intents`** alem do valor
--   novo nos dois `CHECK` de proposito.
-- - **Nao mexe em `sanitize_status`.** Ver acima: outra esteira.
--
-- **Os dois `CHECK` de proposito sao REESCRITOS, e os NOVE valores ficam
-- listados um a um nas duas tabelas** -- a primeira versao de uma migracao de
-- vitrine deste projeto APAGOU tres valores ao reescrever, e e por isso que
-- `tests/integration/conjunto-exato-dos-checks.test.ts` fixa o conjunto exato
-- nas duas.
--
-- ## SOBRE O `down`, E O QUE ELE PARA
--
-- Duas coisas podem parar a descida, e as duas param de proposito:
--
--  1. **a coluna com linha preenchida.** Apagar `logo_image_id` perde o
--     ponteiro do logotipo das indicacoes gravadas depois da subida, e nao ha
--     onde recolher: `catalog_images` guarda a imagem e nao guarda a qual
--     indicacao ela pertence. A descida **recusa** quando ha linha, nomeando
--     quantas sao e quantas ainda estao PENDENTES -- aquelas sao as que alguem
--     ainda vai revisar;
--  2. **a volta dos oito propositos.** Imagem de catalogo ja gravada com
--     `purpose = 'directory_suggestion_logo'` nao cabe na restricao antiga, e
--     `ADD CONSTRAINT` recusa com 23514. E o desfecho certo pela mesma razao:
--     `DELETE` em `catalog_images` apagaria o ponteiro da derivada que esta no
--     balde.
--
-- Isto e diferente da `20261029000003`, cuja descida NAO para -- o que ela perde
-- vale `professional` em quase toda linha pelo `DEFAULT`, e a entrada aprovada
-- ja copiou o valor. Aqui nao ha `DEFAULT` que reponha nem copia em lugar
-- nenhum: o que se perde e um arquivo que uma pessoa subiu.
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

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `directory_suggestion_logo` entrou em 29/10/2026 (pedido do cliente: nao tem o campo do logotipo para o usuario subir e indicar o estabelecimento) e e SEPARADO de `directory_logo` -- essa separacao E a fronteira da fila, e nao arrumacao: `directory_logo` e confirmado em professionals.logo_image_id, que SAI em superficie publica, e `directory_suggestion_logo` so e confirmado em directory_suggestions.logo_image_id, que nao sai em lugar nenhum. Um proposito para os dois abriria as duas direcoes e deixaria a imagem de uma indicacao NAO APROVADA chegar ao Perto. O autor dele e `user_id` e nunca `admin_account_id`, como na capa do encontro da comunidade -- e e o autor que permite a confirmacao conferir a conta no WHERE. `directory_gallery` entrou em 29/10/2026 e e SEPARADO de `directory_photo` pelo mesmo critério que separou `user_showcase` de `user_photo`: aquele e a foto UNICA do lugar e este sao as ate oito da galeria, que pedem tambem a miniatura de 480 x 360. `user_showcase` e a vitrine do usuario e `user_publication` e a foto de UMA publicacao do Mural; os dois tem autor em `user_id`. `directory_logo`, `directory_photo` e `directory_gallery` tem autor em `admin_account_id`: quem sobe e o administrador no painel.';

-- ---------------------------------------------------------------------------
-- 2. A COLUNA NA FILA
-- ---------------------------------------------------------------------------

ALTER TABLE directory_suggestions
  ADD COLUMN logo_image_id uuid
             CONSTRAINT directory_suggestions_logotipo_unico UNIQUE
             REFERENCES catalog_images (id);

COMMENT ON COLUMN directory_suggestions.logo_image_id IS
  'O logotipo que QUEM INDICOU enviou (pedido do cliente de 29/10/2026). catalog_images.id, com purpose = directory_suggestion_logo -- conferido pelo caso de uso, porque um CHECK nao alcanca coluna de outra tabela. ANULAVEL e sem DEFAULT: indicacao sem logotipo e o estado normal, e exigi-la no contrato seria request-property-became-required e derrubaria o APK publicado. UNIQUE pela mesma razao de professional_images.image_id: a mesma imagem nao serve a duas indicacoes, e e isso que faz a recusa 400 upload_not_usable ter rede embaixo em vez de virar 500. **Este UUID nunca sai em resposta** (ADR-0010 item 6): quem le recebe a URL da derivada, e hoje ninguem le -- nao existe operacao de leitura desta tabela que projete a imagem. A APROVACAO NAO COPIA este valor para professionals.logo_image_id: carregar imagem de usuario para superficie publica e decisao de quem revisa, feita no painel com o envio dele (directory_logo). O proposito separado e o que impede o contrario de acontecer por descuido.';

COMMENT ON CONSTRAINT directory_suggestions_logotipo_unico ON directory_suggestions IS
  'A mesma imagem de catalogo nao pertence a duas indicacoes. Nao menciona literal de texto, entao NAO esta no registro de conjunto-exato-dos-checks.test.ts (que cobra CHECK, e nao UNIQUE).';

-- ---------------------------------------------------------------------------
-- 3. A FUNCAO DE REGISTRO, de treze para quatorze argumentos
-- ---------------------------------------------------------------------------
--
-- `DROP` e `CREATE`, e nunca `CREATE OR REPLACE`: no Postgres assinatura
-- diferente e outra funcao, e deixar a de treze de pe a deixaria gravando
-- indicacao sem logotipo para sempre. Mesmo arranjo da `20261017000015` e da
-- `20261029000003`.

DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION directory_suggestions_registrar(
  p_id            uuid,
  p_ref           text,
  p_autor         uuid,
  p_display_name  text,
  p_kind          text,
  p_entity_kind   text,
  p_city          text,
  p_state         text,
  p_neighborhood  text,
  p_postal_code   text,
  p_contact_kind  text,
  p_contact_value text,
  p_note          text,
  p_logo_image_id uuid
) RETURNS timestamptz AS $$
  INSERT INTO directory_suggestions (
    id, ref, suggested_by_user_id, display_name, kind, entity_kind,
    city, state, neighborhood, postal_code, contact_kind, contact_value, note,
    logo_image_id
  ) VALUES (
    p_id, p_ref, p_autor, p_display_name, p_kind, coalesce(p_entity_kind, 'professional'),
    p_city, p_state, p_neighborhood, p_postal_code, p_contact_kind, p_contact_value, p_note,
    p_logo_image_id
  )
  RETURNING created_at;
$$ LANGUAGE sql;

COMMENT ON FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, uuid) IS
  'Grava a indicacao da comunidade. Existe porque suggested_by_user_id e coluna proibida para o SQL da aplicacao (portao-colunas-que-nao-saem): o nome dela fica aqui dentro e o repositorio chama a funcao pelo nome. QUATORZE argumentos desde 29/10/2026, com p_logo_image_id NO FIM -- diferente de p_entity_kind, que entrou depois de p_kind porque e o outro eixo do mesmo par; o logotipo nao faz par com coluna nenhuma, e o lugar dele e depois do recado, que e o ultimo campo da tela. Sem coalesce em p_logo_image_id: nulo e o valor certo, e nao um padrao a repor -- indicacao sem logotipo e o estado normal. A de TREZE foi DERRUBADA e nao substituida com CREATE OR REPLACE: assinatura diferente e outra funcao, e as duas de pe deixariam a antiga gravando indicacao sem logotipo para sempre.';

-- Down Migration

-- ---------------------------------------------------------------------------
-- 1. A DESCIDA PARA COM ERRO quando ha logotipo gravado
-- ---------------------------------------------------------------------------
--
-- Ver o cabecalho: nao ha onde recolher o ponteiro -- `catalog_images` guarda a
-- imagem e nao guarda a qual indicacao ela pertence --, e o contrario seria
-- `DELETE` silencioso de arquivo que uma pessoa subiu. `RAISE EXCEPTION` e nao
-- `NOTICE`, porque `node-pg-migrate` descarta `NOTICE`.
DO $$
DECLARE
  total     bigint;
  pendentes bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE review_status = 'pending')
    INTO total, pendentes
    FROM directory_suggestions
   WHERE logo_image_id IS NOT NULL;

  IF total > 0 THEN
    RAISE EXCEPTION
      'a descida apagaria o ponteiro do logotipo de % indicacao(oes), % ainda PENDENTE(S) de revisao, e nao ha coluna para onde recolhe-lo: catalog_images guarda a imagem e nao guarda a qual indicacao ela pertence. Decida o que fazer com os logotipos ANTES de descer (mesmo desfecho da 20261029000001)',
      total, pendentes;
  END IF;
END $$;

-- A funcao volta a treze argumentos.
DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, uuid);

CREATE FUNCTION directory_suggestions_registrar(
  p_id            uuid,
  p_ref           text,
  p_autor         uuid,
  p_display_name  text,
  p_kind          text,
  p_entity_kind   text,
  p_city          text,
  p_state         text,
  p_neighborhood  text,
  p_postal_code   text,
  p_contact_kind  text,
  p_contact_value text,
  p_note          text
) RETURNS timestamptz AS $$
  INSERT INTO directory_suggestions (
    id, ref, suggested_by_user_id, display_name, kind, entity_kind,
    city, state, neighborhood, postal_code, contact_kind, contact_value, note
  ) VALUES (
    p_id, p_ref, p_autor, p_display_name, p_kind, coalesce(p_entity_kind, 'professional'),
    p_city, p_state, p_neighborhood, p_postal_code, p_contact_kind, p_contact_value, p_note
  )
  RETURNING created_at;
$$ LANGUAGE sql;

COMMENT ON FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text) IS
  'Grava a indicacao da comunidade. Existe porque suggested_by_user_id e coluna proibida para o SQL da aplicacao: o nome dela fica aqui dentro e o repositorio chama a funcao pelo nome. TREZE argumentos desde 29/10/2026, com p_entity_kind depois de p_kind. A de DOZE foi DERRUBADA e nao substituida com CREATE OR REPLACE: assinatura diferente e outra funcao.';

ALTER TABLE directory_suggestions
  DROP COLUMN logo_image_id;

-- ---------------------------------------------------------------------------
-- 2. Os dois `CHECK` voltam aos OITO propositos
-- ---------------------------------------------------------------------------
--
-- Isto pode falhar de proposito: imagem de catalogo ja gravada com
-- `purpose = 'directory_suggestion_logo'` -- por exemplo a de um envio
-- confirmado cuja indicacao foi apagada -- nao cabe na restricao antiga, e
-- `ADD CONSTRAINT` recusa com 23514. E o desfecho certo: `DELETE` em
-- `catalog_images` apagaria o ponteiro da derivada que esta no balde.

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
