-- A FOTO DE CAPA DO PET (pedido do cliente, 06/11/2026)
--
-- Literal: *"gostei muito da forma como ele apresenta o perfil do pet, com a
-- foto de capa, como fazemos na pagina de eventos e profissionais"*.
--
-- ===========================================================================
-- O PROPOSITO NOVO E `pet_cover`, E ELE NAO ENTRA EM `pet_photos`
-- ===========================================================================
--
-- Decimo-primeiro proposito da esteira de imagem de catalogo (ADR-0007,
-- ADR-0027 item 10), e **nao uma esteira nova**: teto de bytes, formato de
-- saida, higiene de EXIF, escada de qualidade, derivadas por layout e varredura
-- de vencidos ja moram la. A decisao do cliente de 03/11/2026 e o que escolhe
-- este caminho: *"sempre que estivermos falando de upload de imagem, isso deve
-- ser tratado no mesmo lugar, e as correcoes devem ser realizadas em todos os
-- lugares por ser o mesmo codigo"*.
--
-- **E a capa NAO cabia em `pet_photos` nem por acidente**, e isto foi medido, na
-- `20260918000002` (linha 87):
--
--     CONSTRAINT pet_photos_pronta_tem_derivadas
--       CHECK (status <> 'ready' OR (thumb_key IS NOT NULL AND card_key IS NOT NULL))
--
-- `pet_photos` so chega a `ready` com `thumb_key` **e** `card_key`, e as duas
-- sao RETRATO: 176 x 194 e 1024 x 1126, as duas na proporcao 1 : 1,1
-- (`DERIVADAS_DA_FOTO_DE_PET`). Uma faixa 16:9 nao gera miniatura de retrato.
-- Acrescentar um `banner_key` ali deixaria a linha da capa presa em
-- `processing` para sempre ou obrigaria a afrouxar o CHECK -- e afrouxar aquele
-- CHECK e exatamente o que impede derivada sem original de existir.
--
-- ===========================================================================
-- AS DUAS IMAGENS CONTINUAM SENDO DUAS, E ESTA E A FRONTEIRA DO ARQUIVO
-- ===========================================================================
--
-- O RETRATO (`pet_photos.card_key`, 1024 x 1126) e a identidade do animal, e
-- ele alimenta CINCO leituras fora da ficha do app -- medido por quem seleciona
-- `pet_photos.card_key` nesta arvore:
--
--   - `kysely-leitura-publica-do-caso.ts`  (a pagina publica do caso)
--   - `kysely-registro-de-disparos.ts`     (o cartaz IMPRESSO, `LostCasePoster.photo_url`)
--   - `kysely-found-report-repository.ts`  (a tela de quem achou o pet)
--   - `kysely-perfil-publico.ts`           (o perfil publico do pet)
--   - `kysely-tag-repository.ts`           (a pagina da plaquinha, `t/{code}`)
--
-- A CAPA e o ambiente dele, e **so a ficha do app a desenha**. Se a capa 16:9
-- ocupasse o lugar do retrato, o cartaz de pet perdido passaria a sair deitado.
-- Por isso esta migracao acrescenta UMA coluna nova e **nao encosta em
-- `pet_photos`**.
--
-- ===========================================================================
-- POR QUE COLUNA EM `pets`, E NAO TABELA
-- ===========================================================================
--
-- A capa e UMA. Nao ha ordem, nao ha posicao, nao ha galeria: `pets.cover_image_id`
-- e singular pela mesma razao que `directory_suggestions.logo_image_id` e
-- singular (`20261029000004`) -- *"a logo e UMA porque e a marca"*. Tabela filha
-- com `position` daria duas formas de dizer qual e a capa, e duas formas de
-- dizer a mesma coisa e o defeito.
--
-- **Sem `ON DELETE`**: o padrao `NO ACTION` recusa apagar a imagem de catalogo
-- com o vinculo de pe, igual a `professionals.photo_image_id` e a
-- `directory_suggestion_images.image_id`. A exclusao do PET nao e barrada por
-- isto -- `pets` e exclusao LOGICA (`deleted_at`), e nao `DELETE`.
--
-- **ANULAVEL e sem DEFAULT**: pet sem capa e o estado normal, e no dia em que
-- isto subir sera o de 100% dos pets, porque a coluna nasce agora. Exigi-la no
-- contrato seria `request-property-became-required` e derrubaria o APK
-- publicado.
--
-- **Este UUID nunca sai em resposta** (ADR-0010 item 6): quem le recebe a URL
-- da derivada, em `Pet.cover_image_url`.
--
-- ===========================================================================
-- O AUTOR DO ENVIO E `user_id`, NUNCA `admin_account_id`
-- ===========================================================================
--
-- Como no logotipo da indicacao e na capa do encontro criado pela conta
-- (ADR-0025 emenda 3): `catalog_upload_intents_um_autor` continua impondo
-- exatamente um autor, e e `user_id` que permite a confirmacao conferir a conta
-- na clausula `WHERE`. **O painel nao ganha tela nenhuma**: a capa e do tutor.
--
-- E `pet_cover` e SEPARADO de `network_event` e de `directory_photo` pela mesma
-- razao que separou `directory_suggestion_photo` de `directory_photo`: um
-- `upload_id` autorizado para a capa de um pet **nao casa** o proposito que
-- `capaDoEnvio` do encontro exige, e vice-versa. Nao existe caminho, nem por
-- descuido nem por `upload_id` adivinhado, que leve a capa de um pet para a
-- agenda da comunidade.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. OS DOIS `CHECK` DE PROPOSITO PASSAM A ONZE
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo', 'directory_suggestion_photo',
                     'user_photo', 'user_showcase', 'user_publication',
                     'pet_cover'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'directory_gallery',
                     'directory_suggestion_logo', 'directory_suggestion_photo',
                     'user_photo', 'user_showcase', 'user_publication',
                     'pet_cover'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `pet_cover` entrou em 06/11/2026 (pedido do cliente: gostei muito da forma como ele apresenta o perfil do pet, com a foto de capa, como fazemos na pagina de eventos e profissionais) e e a FOTO DE CAPA 16:9 da ficha do pet, confirmada em pets.cover_image_id. Ele e SEPARADO de network_event e de directory_photo pela MESMA razao que separou directory_suggestion_photo de directory_photo: o envio autorizado para a capa de um pet nao casa o proposito que a confirmacao do encontro exige, e vice-versa -- entao nao existe caminho que leve a capa de um pet para a agenda da comunidade. Ele NAO entra em pet_photos: o CHECK pet_photos_pronta_tem_derivadas exige thumb_key e card_key, que sao as duas derivadas de RETRATO (1 : 1,1), e uma faixa 16:9 nao gera miniatura de retrato. Ele tem derivadas PROPRIAS (DERIVADAS_DA_CAPA_DO_PET, nao uma copia de numeros de outro proposito) e piso de LARGURA 1280, com a altura DERIVADA da proporcao -- 1280 x 720, decisao do cliente de 02/11/2026. O autor dele e `user_id` e nunca `admin_account_id`, como no logotipo da indicacao e na capa do encontro da comunidade. `directory_suggestion_photo` entrou em 30/10/2026 e `directory_suggestion_logo` em 29/10/2026, os dois com autor de usuario. `directory_logo`, `directory_photo` e `directory_gallery` tem autor em `admin_account_id`: quem sobe e o administrador no painel.';

COMMENT ON COLUMN catalog_images.purpose IS
  'O proposito da imagem, copiado do envio que a originou. `pet_cover` (06/11/2026) e a foto de capa 16:9 da ficha do pet: derivadas `banner` 1280 x 720 (que vai para banner_key e e o que a ficha desenha) e `card` 1024 x 576 (public_key), as duas cortadas em 16:9. SEM `thumb`: nenhuma lista de pets mostra a capa -- o cartao da lista desenha o RETRATO, que vem de pet_photos.thumb_key e nao daqui --, e derivada que ninguem baixa e byte pago sem leitor.';

-- ---------------------------------------------------------------------------
-- 2. A COLUNA DA CAPA NO PET
-- ---------------------------------------------------------------------------

ALTER TABLE pets
  ADD COLUMN cover_image_id uuid REFERENCES catalog_images (id);

COMMENT ON COLUMN pets.cover_image_id IS
  'A FOTO DE CAPA do pet (pedido do cliente de 06/11/2026). catalog_images.id com purpose = pet_cover, conferido pelo CASO DE USO -- um CHECK nao alcanca coluna de outra tabela. ANULAVEL e sem DEFAULT: pet sem capa e o estado NORMAL e sera o de todos os pets no dia em que isto subir, porque a coluna nasce agora; a ficha mostra o banner da marca com o convite de envio, que e o que o encontro da comunidade sem capa ja faz. Exigi-la no contrato seria request-property-became-required e derrubaria o APK publicado. SINGULAR, e nao tabela com position: a capa e UMA, pela mesma razao de directory_suggestions.logo_image_id -- duas formas de dizer qual e a capa e o defeito. Sem ON DELETE: o padrao NO ACTION recusa apagar a imagem com o vinculo de pe, igual a professional_images.image_id; a exclusao do pet nao esbarra nisso porque pets e exclusao LOGICA (deleted_at). SEM UNIQUE, e a assimetria com directory_suggestions.logo_image_id e deliberada: ali o UNIQUE global existe para a mesma imagem nao servir a duas indicacoes, e aqui a conferencia de dono do caso de uso ja recusa upload_id de outra conta -- um UNIQUE aqui transformaria a reconfirmacao idempotente do MESMO upload_id em 500 do banco. **Este UUID nunca sai em resposta** (ADR-0010 item 6): quem le recebe a URL da derivada, em Pet.cover_image_url, montada sobre a base de MIDIA a partir de catalog_images.banner_key. NAO substitui pet_photos.card_key: aquela e o RETRATO, a identidade do animal, e alimenta cinco leituras fora da ficha (a pagina publica do caso, o cartaz IMPRESSO de pet perdido, a tela de quem achou, o perfil publico do pet e a pagina da plaquinha). Se a capa 16:9 ocupasse o lugar do retrato, o cartaz de pet perdido passaria a sair deitado. Sao duas imagens com dois papeis: o retrato e o animal, a capa e o ambiente dele.';

-- O ponteiro inverso da varredura: quais pets apontam para uma imagem.
-- PARCIAL, porque no dia em que isto sobe 100% das linhas tem NULL aqui, e
-- indice que indexa o nulo de todas as linhas e tamanho sem leitor.
CREATE INDEX pets_cover_image ON pets (cover_image_id)
  WHERE cover_image_id IS NOT NULL;

-- Down Migration

-- ---------------------------------------------------------------------------
-- 1. A COLUNA SAI, E ISTO APAGA O VINCULO DE QUEM JA ENVIOU
-- ---------------------------------------------------------------------------
--
-- Ao contrario da `20261030000002`, aqui a descida NAO para com erro, e a razao
-- e que a perda e recuperavel: `catalog_images` e a derivada no balde ficam de
-- pe, e `catalog_images.upload_intent_id` continua dizendo QUEM enviou. O que
-- se perde e a qual PET a capa pertencia -- e isso cabe num aviso, nao num
-- impedimento, porque a capa e cosmetica e nao ha nada que o tutor perca sem
-- poder reenviar em dois toques.
--
-- `RAISE WARNING` e nao `NOTICE` nao serviria: **`node-pg-migrate` descarta os
-- dois**. Por isso a contagem vai para `audit.events`, que e o unico lugar onde
-- ela chega a alguem.

DO $$
DECLARE
  capas bigint;
BEGIN
  SELECT count(*) INTO capas FROM pets WHERE cover_image_id IS NOT NULL;

  IF capas > 0 THEN
    INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, metadata)
    VALUES (
      gen_random_uuid(),
      'system',
      'capa_do_pet_desvinculada_pela_descida',
      'pet',
      NULL,
      jsonb_build_object(
        'capas_desvinculadas', capas,
        'nota', 'a descida de 20261106000001 apagou o vinculo entre o pet e a imagem de capa; catalog_images e a derivada no balde ficam de pe, e catalog_images.upload_intent_id continua dizendo quem enviou'
      )
    );
  END IF;
END $$;

DROP INDEX pets_cover_image;

ALTER TABLE pets
  DROP COLUMN cover_image_id;

-- ---------------------------------------------------------------------------
-- 2. OS DOIS `CHECK` VOLTAM AOS DEZ PROPOSITOS
-- ---------------------------------------------------------------------------
--
-- Isto pode falhar de proposito: imagem de catalogo ja gravada com
-- `purpose = 'pet_cover'` nao cabe na restricao antiga, e `ADD CONSTRAINT`
-- recusa com 23514. E o desfecho certo: `DELETE` em `catalog_images` apagaria o
-- ponteiro da derivada que esta no balde.

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
