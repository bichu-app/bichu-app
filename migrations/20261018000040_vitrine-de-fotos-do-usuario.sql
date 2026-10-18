-- A VITRINE DE FOTOS DO USUARIO, VISIVEL SO AO DONO (pedido do cliente de
-- 18/10/2026: *"criar o conceito de conexao entre pessoas e pagina do perfil do
-- usuario com vitrine de fotos, parecido com instagram"*).
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: hoje a pessoa tem UMA foto
-- (`users.photo_image_id`, da frente das imagens), e uma vitrine e uma GALERIA
-- ORDENADA -- que neste produto tem um molde ja escrito duas vezes,
-- `store_item_images` e `network_event_images`, identicos entre si.
--
-- O QUE ELA FAZ, E O QUE ELA DELIBERADAMENTE NAO FAZ
--
-- 1. Acrescenta UM proposito a esteira de imagem que ja existe
--    (`catalog_upload_intents` e `catalog_images`): `user_showcase`. **Nenhuma
--    tabela de imagem nova, nenhuma segunda esteira.** Intencao de envio,
--    confirmacao, derivadas, higiene de EXIF e varredura de vencidos continuam
--    tendo UMA versao so -- duas versoes de cada uma concordam por enquanto, e
--    foi assim que o teto de bytes chegou a existir em tres lugares com tres
--    numeros.
-- 2. Cria `user_showcase_images`, a ligacao ordenada entre a conta e as
--    imagens, no MOLDE EXATO de `store_item_images` (20260928000003) e
--    `network_event_images` (20260928000004). As duas sao identicas entre si e
--    sao o padrao de galeria da casa; inventar uma terceira forma para a mesma
--    coisa e o que faz reordenacao, teto e capa passarem a ter tres respostas.
--
-- **NAO cria coluna nenhuma em `users`.** A foto unica da pessoa e
-- `users.photo_image_id`, da migracao `20261018000008`, que desceu em
-- `development` em 18/10. A vitrine e o PASSO SEGUINTE daquela foto e nao a
-- repete: duplicar a coluna faria duas verdades sobre qual e a foto da pessoa.
--
-- **NAO cria proposito que ja exista.** `user_photo` e da `20261018000008`;
-- este e `user_showcase`, e os dois nao se sobrepoem -- um e a foto UNICA do
-- perfil, o outro sao as ate nove da vitrine, com geometria propria (a grade
-- pede 320 px) e tabela de ordem propria. Os dois `CHECK` de `purpose` sao
-- escritos aqui com as SEIS, pelo motivo que o bloco 1 explica.
--
-- O TETO E 9, E A CAPA E `position = 0`
--
-- Nove, como as duas galerias da casa sao oito: o teto e este `CHECK` somado a
-- unicidade por conta, e nao um numero no codigo. **Pedir uma, aceitar nove,
-- nunca cobrar as nove**: a vitrine com uma foto e estado valido e completo, e
-- da terceira em diante o ganho medido e perto de zero. Nenhuma restricao exige
-- a segunda.
--
-- A capa e `position = 0`, pelo mesmo desenho de `network_event_images`:
-- reordenar troca a capa, e nao ha coluna `is_cover` para divergir da ordem.
-- Por isso tambem nao ha prefixo de armazenamento por papel -- a capa e a
-- terceira foto moram no mesmo lugar, e reordenar nao move objeto.
--
-- POR QUE `alt_text` E ANULAVEL AQUI, E E A UNICA DIFERENCA DO MOLDE
--
-- Nas duas galerias da casa `alt_text` e NOT NULL porque quem escreve e um
-- administrador descrevendo conteudo que terceiros vao ver. Aqui nao ha
-- terceiro: a vitrine e visivel SO AO DONO, e o unico leitor possivel do texto
-- alternativo e quem tirou a foto e sabe o que ela mostra. Exigi-lo obrigaria a
-- tela a pedir um texto por foto -- e legenda esta FORA desta frente por
-- decisao de produto. Anulavel, entao, e o leitor de tela cai no rotulo da
-- grade; o dia em que a vitrine ganhar leitor terceiro, a obrigacao volta junto
-- com a decisao que a autorizar, e nao antes.
--
-- VISIBILIDADE: SO O DONO, E ISSO NAO E CONFIGURAVEL
--
-- Nenhuma coluna de "aparecer para outros", nenhum interruptor, nenhum nivel.
-- A vitrine sai em `GET /me/showcase` e em NENHUMA outra resposta. Isso nao e
-- escolha desta migracao: o ADR-0025 item 2 proibe avatar de pessoa na
-- superficie da `Rede` por nome, e o contrato afirma em DOIS lugares que
-- `Conversation.participants` nunca traz foto de perfil. Expor a terceiros
-- contraria decisao registrada, e seria decisao do cliente.
--
-- Fora de proposito, e cada ausencia e deliberada: legenda, curtida, contador
-- e **marcar pessoa** -- este ultimo e dado biometrico, e a recomendacao
-- registrada e recusar para sempre.
--
-- OS PETS NAO ENTRAM AQUI. Foto de pet mora em `pet_photos`, com o ciclo de
-- vida do cadastro do animal. O perfil REFERENCIA o pet e abre a pagina dele;
-- copiar a foto do pet para a vitrine criaria duas fotos do mesmo animal que
-- divergem na primeira troca.
--
-- SOBRE A VARREDURA DE ENVIOS VENCIDOS, QUE JA APAGOU FOTO UMA VEZ
--
-- `varrer-envios-vencidos.ts` apaga intencao NAO CONFIRMADA e vencida. O
-- proposito `user_showcase` TEM operacao de confirmacao, e ela grava
-- `confirmed_at` na MESMA TRANSACAO que insere a linha de
-- `user_showcase_images` (`confirmarEnvioDeCatalogo`, chamado dentro da
-- transacao da escrita da vitrine). Entao `confirmed_at` deixa de ser nulo no
-- instante em que a foto passa a existir, e a linha sai da lista da varredura
-- no mesmo instante. Foi exatamente o que faltava a foto do ACHADO, que nao tem
-- confirmacao no contrato de proposito e por isso vencia e era apagada -- dez
-- minutos, e sempre. `varrer-envios-vencidos.vitrine.test.ts` existe para dizer
-- isso, e tem o CONTRAPESO: intencao de vitrine NAO confirmada e vencida **e**
-- apagada, senao o teste passaria para uma varredura que nao limpa nada.
--
-- SOBRE O `down`: derruba a tabela e devolve os `CHECK` anteriores. Ele PERDE a
-- ligacao entre a conta e as imagens da vitrine se houver linha preenchida --
-- as imagens ficam em `catalog_images` e no balde, o ponteiro some. Quem descer
-- isto com dado dentro precisa exportar antes, e a decisao nao e de quem roda o
-- comando.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. O proposito novo na esteira de imagem que JA EXISTE
-- ---------------------------------------------------------------------------

-- A LISTA E A UNIAO DAS SEIS, E NAO A DE ONTEM MAIS A MINHA.
--
-- **Este bloco quase entrou errado, e o defeito foi MEDIDO em BEGIN/ROLLBACK
-- antes de comitar.** `DROP CONSTRAINT` + `ADD CONSTRAINT` **reescreve** a
-- lista inteira: escrever aqui so `store_item`, `network_event` e
-- `user_showcase` nao ACRESCENTA um proposito -- ela APAGA os tres que a
-- migracao `20261018000008` acrescentou (`directory_logo`, `directory_photo`
-- e `user_photo`), porque esta migracao roda DEPOIS dela. O efeito seria
-- silencioso na subida e brutal depois: a foto do profissional e a foto do
-- perfil passariam a ser recusadas pelo banco no proximo envio.
--
-- E por isso que a lista e escrita por extenso, com as SEIS, e nao derivada:
-- `ADD CONSTRAINT` nao sabe o que havia antes, e quem escreve precisa saber.
-- Quem acrescentar a setima repete esta conta -- e roda em BEGIN/ROLLBACK,
-- porque foi so isso que pegou esta.
ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `user_showcase` e a vitrine do usuario, cujo autor e `user_id` e nunca `admin_account_id`.';

-- ---------------------------------------------------------------------------
-- 2. A vitrine: a ligacao ORDENADA entre a conta e as imagens
-- ---------------------------------------------------------------------------

CREATE TABLE user_showcase_images (
  -- `ON DELETE CASCADE`: conta apagada leva a ligacao. Os objetos do balde
  -- saem pelo expurgo de 30 dias (SEC-020), que le as chaves ANTES do
  -- `DELETE FROM users` -- a cascata destroi o unico ponteiro que existe.
  user_id   uuid     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  image_id  uuid     NOT NULL UNIQUE REFERENCES catalog_images (id),
  position  smallint NOT NULL
            CONSTRAINT user_showcase_images_posicao
            CHECK (position BETWEEN 0 AND 8),
  -- Anulavel, e e a UNICA diferenca do molde das outras duas galerias. O
  -- motivo esta no cabecalho: nao ha terceiro que leia a vitrine, e legenda
  -- esta fora de proposito.
  alt_text  text
            CONSTRAINT user_showcase_images_texto_alternativo_tem_tamanho
            CHECK (alt_text IS NULL OR char_length(btrim(alt_text)) BETWEEN 2 AND 150),
  PRIMARY KEY (user_id, image_id),
  -- Diferida para que reordenar seja um conjunto de escritas na mesma
  -- transacao sem colidir no meio.
  CONSTRAINT user_showcase_images_ordem_unica
    UNIQUE (user_id, position) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE user_showcase_images IS
  'A VITRINE DE FOTOS DO USUARIO, VISIVEL SO AO DONO. Molde de store_item_images e network_event_images. A capa e position = 0. Imagem de catalogo com purpose user_showcase, conferido pelo caso de uso. Sai em GET /me/showcase e em NENHUMA outra resposta: ADR-0025 item 2 proibe avatar de pessoa na Rede, e Conversation.participants nunca traz foto.';
COMMENT ON COLUMN user_showcase_images.position IS
  '0 e a capa. Ate 8: o teto de 9 fotos e este CHECK somado a unicidade por conta. Reordenar troca a capa, e por isso nao existe coluna is_cover para divergir da ordem.';
COMMENT ON COLUMN user_showcase_images.alt_text IS
  'Texto alternativo, OPCIONAL -- a unica diferenca do molde. Nao ha terceiro que leia esta vitrine, e legenda esta fora de proposito. Nulo faz o leitor de tela cair no rotulo da grade.';

-- A grade le a vitrine de uma conta em ordem. A chave primaria comeca por
-- `user_id`, entao ela ja serve o filtro; o indice abaixo e por ORDEM, que e o
-- que a leitura pede, e evita a ordenacao a cada abertura do perfil.
CREATE INDEX user_showcase_images_em_ordem
  ON user_showcase_images (user_id, position);

-- Down Migration

DROP TABLE IF EXISTS user_showcase_images;

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito fica gravado no envio, e a escrita que confirma exige o mesmo (T9): a capa de um encontro nao vira imagem de produto.';

-- O `down` devolve as CINCO da `20261018000008`, e nao as duas de antes dela:
-- descer ESTA migracao nao pode desfazer aquela. Mesmo raciocinio do `up`, na
-- direcao oposta, e o mesmo erro se escrito no automatico.
ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo'));

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo'));
