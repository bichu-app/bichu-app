-- A HIGIENE DA FOTO DO ACHADO, e as derivadas por tamanho de tela.
--
-- Duas partes, e a primeira e a que importa.
--
-- PARTE 1 -- O EXIF DA FOTO DO ACHADO (vazamento de coordenada de GPS)
--
-- A foto de pet passa pelo worker: tipo conferido nos BYTES e derivada
-- reescrita do zero, sem copiar metadado nenhum. A foto do achado
-- (`/media/found-report-photo-intents`) e a de quem avisou sem conta
-- (`/v1/media/finder-photo-intents`) nao passavam por nada: o tipo era aceito
-- pela declaracao do cliente, nao havia derivada, e **o EXIF ficava no
-- arquivo**.
--
-- Foto de celular carrega coordenada de GPS no EXIF. Num produto de pet
-- perdido isso entrega onde a pessoa que achou o animal estava -- e ela
-- costuma ter achado o animal perto de onde mora. Hoje nao vaza por acidente
-- (nada envia a foto, e `photo_url` sai nulo na resposta), mas vaza no dia em
-- que a conversa mediada servir a foto, que e o que o criterio 9 da BICHUS-35
-- promete que vai acontecer.
--
-- As quatro colunas novas guardam o estado da higiene. Sem tabela nova: o
-- vinculo foto-aviso ja existe e e 1:1 (`found_reports.photo_upload_id`), e
-- uma tabela espelhando `pet_photos` seria o desenho "certo" com uma migracao
-- grande para guardar quatro campos.
--
-- `sanitize_status` entra com DEFAULT 'pendente' e NOT NULL, e isso vale para
-- as linhas que ja existem: toda intencao de foto de achado ja gravada passa a
-- estar pendente de higiene, que e a verdade. A varredura do worker as recolhe.
--
-- `pet_photo` TAMBEM recebe a coluna, porque a coluna e da tabela, mas nada a
-- le para a foto de pet: aquele caminho tem `pet_photos.status` e derivada
-- publica. O indice parcial abaixo exclui `pet_photo` de proposito -- ele e o
-- que a varredura usa, e varrer foto de pet aqui a higienizaria duas vezes.
--
-- PARTE 2 -- AS DERIVADAS POR TAMANHO DE TELA
--
-- `catalog_images` tinha UMA chave publica, de 1024 px, para tudo. Medido na
-- tela: a galeria do encontro desenha 144 dp e baixava 1024 px (cinco vezes o
-- dado que ela pinta) e a capa do detalhe e de borda a borda, 360 a 430 dp, e
-- borrava de leve com 1024. Entao a imagem do encontro passa a ter tres:
-- `thumb` 480 (galeria), `public_key`/`card` 1024 (cartao da agenda) e
-- `banner` 1280 (capa do detalhe).
--
-- As duas colunas sao ANULAVEIS e ficam nulas na imagem de produto da Loja:
-- aquela tela nao foi medida, e cortar imagem de produto numa proporcao
-- suposta e como se decepa o rotulo de uma embalagem. Quem le cai em
-- `public_key`, que e o que ele faz hoje.
--
-- NENHUMA DAS COLUNAS NOVAS SAI EM RESPOSTA CRUA. `sanitized_key` e
-- `thumb_key`/`banner_key` sao chaves de objeto, e a URL e montada na leitura a
-- partir do dominio de midia (§11.1 proibicao 9): gravar URL absoluta
-- amarraria cada linha ao provedor do dia em que ela foi escrita.

-- Up Migration

ALTER TABLE upload_intents
  ADD COLUMN sanitize_status text NOT NULL DEFAULT 'pendente',
  ADD COLUMN sanitized_key text,
  ADD COLUMN sanitize_rejection_reason text,
  ADD COLUMN sanitized_at timestamptz;

-- Os quatro estados, e o CHECK em vez de enum pelo mesmo motivo das outras
-- colunas de estado deste banco: acrescentar valor a um enum do Postgres e uma
-- migracao que nao roda dentro de transacao em toda versao suportada.
--
-- `ausente` e o objeto que nunca chegou: a intencao foi assinada, a pessoa
-- desistiu no meio do envio, e nao ha bytes. E desfecho FINAL e nao falha --
-- sem ele a varredura reenfileiraria para sempre a mesma intencao vazia.
ALTER TABLE upload_intents
  ADD CONSTRAINT upload_intents_status_da_higiene
    CHECK (sanitize_status IN ('pendente', 'pronta', 'recusada', 'ausente'));

-- A chave da derivada SO existe quando a higiene terminou bem, e o motivo SO
-- existe quando ela recusou. Os dois sentidos, porque um estado com os campos
-- do outro e uma linha que nenhum codigo sabe ler.
ALTER TABLE upload_intents
  ADD CONSTRAINT upload_intents_higiene_coerente
    CHECK (
      (sanitize_status = 'pronta' AND sanitized_key IS NOT NULL
         AND sanitize_rejection_reason IS NULL)
      OR (sanitize_status = 'recusada' AND sanitized_key IS NULL
         AND sanitize_rejection_reason IS NOT NULL)
      OR (sanitize_status IN ('pendente', 'ausente') AND sanitized_key IS NULL
         AND sanitize_rejection_reason IS NULL)
    );

-- O INDICE DA VARREDURA. Parcial duas vezes: so os dois `kind` do achado e so
-- `pendente`. E isso que faz a consulta da varredura custar o tamanho da fila
-- de higiene e nao o da tabela de intencoes -- que cresce com todo envio de
-- foto de pet e e limpa por outro varredor.
CREATE INDEX upload_intents_higiene_pendente
  ON upload_intents (created_at)
  WHERE sanitize_status = 'pendente'
    AND kind IN ('found_report_photo', 'finder_photo');

COMMENT ON COLUMN upload_intents.sanitize_status IS
  'Estado da higiene da foto do achado: pendente, pronta, recusada ou ausente. Lido so para kind in (found_report_photo, finder_photo) -- a foto de pet tem pet_photos.status.';
COMMENT ON COLUMN upload_intents.sanitized_key IS
  'Chave da derivada higienizada no bucket PRIVADO (found-reports/{dono}/sanitized/{128 bits}.{ext}), sem EXIF. Nunca uma URL. O original continua guardado, inteiro.';
COMMENT ON COLUMN upload_intents.sanitize_rejection_reason IS
  'O texto do motivo da recusa, para a tela de quem enviou. Nao e codigo de erro.';
COMMENT ON COLUMN upload_intents.sanitized_at IS
  'Quando a higiene terminou, em qualquer um dos tres desfechos finais.';

ALTER TABLE catalog_images
  ADD COLUMN thumb_key text,
  ADD COLUMN banner_key text;

COMMENT ON COLUMN catalog_images.thumb_key IS
  'Derivada de 480 px (4:3) para a galeria do encontro, que desenha 144 dp. Nula na imagem de produto: a vitrine da Loja nao foi medida.';
COMMENT ON COLUMN catalog_images.banner_key IS
  'Derivada de 1280 px (16:9) para a capa de borda a borda do detalhe do encontro, 360 a 430 dp. Nula na imagem de produto.';

COMMENT ON COLUMN catalog_images.public_key IS
  'Derivada de 1024 px (16:9 no encontro) para o cartao da agenda e a vitrine. E a derivada que sempre existe: quem nao tem thumb_key ou banner_key cai nela.';

-- Down Migration

ALTER TABLE catalog_images
  DROP COLUMN banner_key,
  DROP COLUMN thumb_key;

DROP INDEX upload_intents_higiene_pendente;

ALTER TABLE upload_intents
  DROP CONSTRAINT upload_intents_higiene_coerente,
  DROP CONSTRAINT upload_intents_status_da_higiene,
  DROP COLUMN sanitized_at,
  DROP COLUMN sanitize_rejection_reason,
  DROP COLUMN sanitized_key,
  DROP COLUMN sanitize_status;
