-- A LOGO e a FOTO do profissional recomendado, e a FOTO DO PROPRIO USUARIO
-- (pedido do cliente de 18/10/2026, nas palavras dele: *"coloque um campo no
-- backoffice para subir uma imagem do logo e foto dos profissionais
-- recomendados"* e *"coloque um campo para o usuario cadastrar sua propria foto
-- e um selo na foto dele, se ele estiver validado"*).
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a entrada do diretorio nao tinha
-- campo de imagem nenhum e `users` nao tinha foto, e as duas coisas pedidas sao
-- imagem, que neste produto tem UMA esteira so (ADR-0007, ADR-0027 A.3).
--
-- O QUE ELA FAZ
--
-- 1. Acrescenta TRES propositos a esteira que ja existe
--    (`catalog_upload_intents` e `catalog_images`): `directory_logo`,
--    `directory_photo` e `user_photo`. **Nenhuma tabela nova de imagem**, porque
--    uma segunda esteira e o que faz derivada, higiene de EXIF, teto de bytes e
--    varredura de vencidos passarem a ter duas versoes que concordam por
--    enquanto.
-- 2. Liga as imagens aos donos: `professionals.logo_image_id`,
--    `professionals.photo_image_id` e `users.photo_image_id`. As TRES sao
--    ANULAVEIS, e a ausencia e o estado normal: profissional sem logo e usuario
--    sem foto continuam funcionando exatamente como antes desta migracao.
--
-- POR QUE DOIS CAMPOS NO PROFISSIONAL, E NAO UM
--
-- Porque sao dois propositos, e o cliente pediu os dois por nome. A LOGO e a
-- marca da entidade: quadrada, pequena, desenhada para caber ao lado do nome na
-- lista do `Perto`, e com frequencia um PNG com fundo transparente. A FOTO e a
-- fachada ou o ambiente: larga, olhada grande no detalhe da entrada, e e foto de
-- camera. Um campo so obrigaria a tela a esticar uma logo quadrada na faixa do
-- detalhe (ou a encolher a fachada num quadrado de 96 dp), e a geometria da
-- derivada e por proposito desde `derivadas.ts`. Dois propositos, duas
-- geometrias, dois campos.
--
-- POR QUE A FOTO DO USUARIO ENTRA NA MESMA ESTEIRA DO CATALOGO
--
-- Porque `catalog_upload_intents` JA ACEITA autor de `users`
-- (`user_id`, migracao `20261001000005`, ADR-0025 emenda 3: a capa do encontro
-- da comunidade e enviada por uma conta do app pelo caminho do painel). A foto
-- do usuario e o segundo caso desse mesmo desenho. A alternativa seria
-- `upload_intents` + `pet_photos`, e `pet_photos.pet_id` e NOT NULL: a foto de
-- uma pessoa nao tem pet, e afrouxar aquele NOT NULL mexeria na tabela do fluxo
-- mais critico do produto para guardar outra coisa.
--
-- O QUE ESTA MIGRACAO NAO FAZ, E CADA AUSENCIA E DELIBERADA
--
-- - **Nao cria coluna de selo de validado.** O selo e `users.email_verified_at`,
--   que ja existe e e o MESMO conceito que o resto do produto usa (`Me.
--   email_verified`). Uma coluna `photo_verified` seria um segundo lugar para
--   dizer a mesma coisa, e os dois divergiriam na primeira troca de e-mail.
-- - **Nao cria visibilidade da foto do usuario para terceiros.** Nenhuma coluna
--   de "aparecer para outros", nenhum interruptor. A foto sai em
--   `GET /v1/me` e em nenhuma outra resposta; quem ve e o dono. O ADR-0025 item
--   2 proibe avatar na superficie da `Rede` por nome, e o contrato diz por
--   extenso que `Conversation.participants` nunca traz foto de perfil: expor a
--   outros contraria decisao registrada e e decisao do cliente, nao desta
--   migracao.
-- - **Nao toca `verification_level` do profissional.** O selo do profissional ja
--   existe, e derivado, e nao e assunto de imagem.
--
-- SOBRE A VARREDURA DE ENVIOS VENCIDOS, QUE JA APAGOU FOTO UMA VEZ
--
-- `varrer-envios-vencidos.ts` apaga intencao NAO CONFIRMADA e vencida. Os tres
-- propositos desta migracao TEM operacao de confirmacao -- a escrita da entrada
-- do diretorio (`createAdminDirectoryEntry`/`updateAdminDirectoryEntry`) e a do
-- perfil (`PATCH /v1/me`) confirmam o envio na MESMA transacao da escrita --,
-- entao `confirmed_at` deixa de ser nulo no instante em que a imagem passa a
-- existir e a linha sai da lista da varredura. Foi exatamente o que faltava a
-- foto do achado, que nao tem confirmacao no contrato de proposito. Quem
-- acrescentar aqui um proposito SEM confirmacao esta reabrindo aquele defeito, e
-- `varrer-envios-vencidos.proposito-novo.test.ts` existe para dizer isso.
--
-- SOBRE O `down`: devolve os CHECK anteriores e derruba as tres colunas. Ele
-- PERDE a ligacao entre entrada/conta e imagem se houver linha preenchida -- a
-- imagem fica em `catalog_images` e no balde, o ponteiro some. Quem descer isto
-- com dado dentro precisa exportar antes, e a decisao nao e de quem roda o
-- comando.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. Os tres propositos novos na esteira de imagem
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no ENVIO: a escrita que confirma exige o mesmo (T9), entao a capa de um encontro nao vira logo de profissional e a foto de uma pessoa nao vira imagem de produto. `user_photo` e o segundo envio de autor `users` depois da capa da comunidade (ADR-0025 emenda 3).';

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo'));

-- ---------------------------------------------------------------------------
-- 2. A logo e a foto da entrada do diretorio
-- ---------------------------------------------------------------------------

-- ON DELETE SET NULL, e nao RESTRICT: `catalog_images` nao e apagada no caminho
-- normal, e se um dia for, a entrada do diretorio nao pode deixar de existir por
-- causa de uma imagem. O inverso -- travar a limpeza de uma imagem porque uma
-- entrada aponta para ela -- transformaria higiene de balde em incidente.
ALTER TABLE professionals
  ADD COLUMN logo_image_id  uuid REFERENCES catalog_images (id) ON DELETE SET NULL,
  ADD COLUMN photo_image_id uuid REFERENCES catalog_images (id) ON DELETE SET NULL;

-- Uma imagem pertence a UMA entrada. Sem isto, confirmar o mesmo `upload_id` em
-- duas entradas poria a mesma logo em duas marcas, e a segunda escrita
-- "roubaria" a imagem da primeira sem nada acusar.
CREATE UNIQUE INDEX professionals_logo_unica  ON professionals (logo_image_id)  WHERE logo_image_id  IS NOT NULL;
CREATE UNIQUE INDEX professionals_foto_unica  ON professionals (photo_image_id) WHERE photo_image_id IS NOT NULL;

COMMENT ON COLUMN professionals.logo_image_id IS
  'A LOGO da entidade (purpose directory_logo), quadrada e pequena: ela aparece ao lado do nome na lista do Perto. Nula e o estado normal -- a entrada existe sem logo e publica sem logo. O id NUNCA sai em resposta (ADR-0010 item 6): o painel e o app recebem a URL da derivada.';
COMMENT ON COLUMN professionals.photo_image_id IS
  'A FOTO do lugar (purpose directory_photo): fachada ou ambiente, olhada grande no detalhe da entrada. Proposito e geometria diferentes da logo, e por isso coluna diferente. Nula e o estado normal. O id NUNCA sai em resposta.';

-- ---------------------------------------------------------------------------
-- 3. A foto do proprio usuario
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN photo_image_id uuid REFERENCES catalog_images (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX users_foto_unica ON users (photo_image_id) WHERE photo_image_id IS NOT NULL;

COMMENT ON COLUMN users.photo_image_id IS
  'A foto que a PROPRIA pessoa cadastrou (purpose user_photo), pedido do cliente de 18/10/2026. Visivel SO PARA O DONO: ela sai em GET /v1/me e em nenhuma outra resposta. Nao ha coluna de visibilidade para terceiros, e a ausencia e a decisao: o ADR-0025 item 2 proibe avatar na Rede por nome e o contrato proibe foto de perfil em Conversation.participants, entao mostrar a outros e decisao do cliente e nao de implementacao. O selo de validado NAO esta aqui: ele e users.email_verified_at.';

-- Down Migration

DROP INDEX IF EXISTS users_foto_unica;

ALTER TABLE users
  DROP COLUMN IF EXISTS photo_image_id;

DROP INDEX IF EXISTS professionals_foto_unica;
DROP INDEX IF EXISTS professionals_logo_unica;

ALTER TABLE professionals
  DROP COLUMN IF EXISTS photo_image_id,
  DROP COLUMN IF EXISTS logo_image_id;

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event'));

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS NULL;
