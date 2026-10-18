-- A fila de PEDIDOS da plaquinha da coleira.
--
-- POR QUE ESTA MIGRACAO EXISTE: o botao `Fazer a tag da coleira`
-- (`app/lib/telas/pet/tela_pet_cadastrado.dart`) nasceu com `aoTocar: null`
-- porque o destino dele nunca existiu -- nao ha rota, nao ha tabela e nao ha
-- estado para "o tutor pediu a plaquinha". O cliente pediu o fluxo: formulario
-- no app, pedido registrado, fila no painel.
--
-- ====================================================================
-- SOLICITAR NAO E EMITIR, E A DIFERENCA E O ADR-0004
-- ====================================================================
--
-- `pet_tags` guarda o CODIGO, que e irreversivel: 16 simbolos Crockford com
-- simbolo de verificacao, emitidos por `issuePetTag` a pedido do tutor, sem
-- volta e sem reciclagem. Esta tabela nao toca nisso e nao emite nada.
--
-- O que ela guarda e o pedido do OBJETO FISICO: o tutor ja tem o codigo (a
-- tela de `Pet cadastrado` emite a tag antes de oferecer o botao) e quer a
-- plaquinha prensada na mao. Por isso nao ha `tag_id` aqui: o pedido e do pet,
-- e qual tag ativa dele vai para o plastico e decisao de quem atende, no
-- minuto em que atende. Amarrar o pedido a uma tag especifica faria uma
-- revogacao posterior deixar o pedido apontando para codigo morto.
--
-- ====================================================================
-- O ENDERECO DE ENTREGA ENTRA, E O VALOR CONTINUA FORA
-- ====================================================================
--
-- **O cliente decidiu em 17/10: o endereco entra.** A pergunta estava aberta
-- e o motivo dela era exatamente este -- sem endereco, quem atende no painel
-- recebe um pedido que nao consegue cumprir. As colunas de endereco nascem
-- aqui, nesta mesma migracao e nao numa segunda: esta tabela nunca foi
-- aplicada em banco nenhum, entao um `ALTER` sobre ela seria cerimonia sobre
-- uma tabela que nao existe em lugar nenhum.
--
-- **O valor continua fora.** Cobranca esta fora de escopo por decisao dele, e
-- nao ha coluna de preco, de pagamento nem de status de cobranca.
--
-- ====================================================================
-- ISTO E DADO PESSOAL, E A TABELA TRATA COMO TAL
-- ====================================================================
--
-- 1. **So o necessario para entregar.** Os campos do endereco, o nome de quem
--    recebe e o TELEFONE dele -- os tres sao o que vai na etiqueta e o que a
--    transportadora pede. Sem documento, sem data de nascimento, sem nada
--    alem disso.
-- 2. **Nada aqui e geocodificado.** Nao ha `lat`, nao ha `lon`, nao ha
--    `geography` e nao ha indice espacial -- a ADR-0006 proibe transformar
--    endereco em COORDENADA, e nada nesta tabela guarda uma.
--
--    O CEP passou a PREENCHER rua, bairro, cidade e estado no app (decisao do
--    cliente, 17/10), pelo ViaCEP com BrasilAPI de reserva. Isso e texto, e a
--    distincao e a que autoriza o recurso. **O servidor nao participa**: ele
--    recebe os campos ja digitados ou ja corrigidos, e nao sabe nem se a
--    busca aconteceu.
-- 3. **O endereco nao sai em superficie publica.** Quem o le e o proprio
--    solicitante e a administracao, e a autorizacao mora na clausula `WHERE`
--    (404 e nunca 403, ADR-0021).
-- 4. **O endereco nao entra na trilha de auditoria.** `audit.events` registra
--    que houve pedido e qual foi a decisao, pelo `id` interno e pelo `ref`;
--    o endereco nunca e copiado para la, nem em `before`/`after`, nem em
--    `metadata`.
-- 5. **Cai com o pet.** `ON DELETE CASCADE` em `pet_id` nao e so integridade:
--    e o endereco saindo do banco quando o pet sai.

-- Up Migration

-- ---------------------------------------------------------------------------
-- `ref` E NAO O UUID: o painel precisa de um identificador no caminho, e
-- `id` e UUIDv7, que carrega o instante do pedido. A forma e a MESMA de
-- `network_event_join_requests.ref` (128 bits em base64url), porque e a mesma
-- necessidade e um segundo formato seria um segundo validador para divergir.
-- ---------------------------------------------------------------------------
CREATE TABLE collar_tag_requests (
  id                uuid        PRIMARY KEY,

  ref               text        NOT NULL
                                CONSTRAINT collar_tag_requests_ref_formato
                                CHECK (ref ~ '^[A-Za-z0-9_-]{20,32}$'),

  -- O pedido e de UM PET do solicitante. `ON DELETE CASCADE` porque excluir o
  -- pet desativa a plaquinha para sempre (ADR-0004): um pedido sobrevivente
  -- mandaria o administrador prensar o codigo de um pet que nao existe mais.
  pet_id            uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,

  -- Quem pediu. Guardado alem de `pets.owner_id` porque e ele que o teto de
  -- 3 por 24 h conta, e porque a transferencia do pet (BICHUS-61) troca o dono
  -- sem reescrever a historia de quem fez o pedido.
  requested_by      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Texto livre do tutor. Opcional: pedir a plaquinha sem dizer nada e o
  -- caminho comum. O teto de 500 e o mesmo de `client_note` do aviso do
  -- achador, e nao um numero novo.
  notes             text        CONSTRAINT collar_tag_requests_notes_tamanho
                                CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),

  -- -------------------------------------------------------------------------
  -- O ENDERECO DE ENTREGA. Obrigatorio: sem ele o pedido nao se cumpre, e um
  -- pedido que nao se cumpre nao deveria poder existir. Por isso `NOT NULL`
  -- no banco, e nao so validacao de formulario -- a trava que vale e a que
  -- nenhum cliente consegue contornar.
  --
  -- `complement` e a UNICA opcional, porque casa sem complemento e o caso
  -- comum. Ela e a excecao declarada, e nao um campo que ficou de fora.
  -- -------------------------------------------------------------------------

  -- Quem recebe, como vai na etiqueta. E o minimo que falta ao endereco para
  -- ele ser entregavel; nao e perfil, nao e identidade e nao e contato.
  recipient_name    text        NOT NULL
                                CONSTRAINT collar_tag_requests_recipient_tamanho
                                CHECK (char_length(recipient_name) BETWEEN 2 AND 120),

  -- E.164 do Brasil, a MESMA forma do contrato (`^\+55\d{10,11}$`) e do
  -- `phone_e164` do perfil. Obrigatorio: transportadora costuma exigir um
  -- telefone para entregar, e um pedido sem ele volta para a fila.
  recipient_phone   text        NOT NULL
                                CONSTRAINT collar_tag_requests_telefone_formato
                                CHECK (recipient_phone ~ '^\+55[0-9]{10,11}$'),

  -- OITO DIGITOS, sem mascara e sem hifen. Guardar "01311-000" e "01311000"
  -- na mesma coluna daria dois enderecos iguais com dois valores diferentes, e
  -- quem normaliza e a aplicacao, antes de gravar.
  --
  -- **O CEP nao e resolvido por ninguem.** Nao ha consulta a servico externo
  -- que o complete (ADR-0006), e por isso ele nao tem relacao nenhuma com as
  -- outras colunas: o banco nao sabe, e nao tem como saber, se o bairro
  -- confere com o CEP.
  postal_code       text        NOT NULL
                                CONSTRAINT collar_tag_requests_cep_formato
                                CHECK (postal_code ~ '^[0-9]{8}$'),

  street            text        NOT NULL
                                CONSTRAINT collar_tag_requests_logradouro_tamanho
                                CHECK (char_length(street) BETWEEN 2 AND 120),

  -- Texto, e nao inteiro: "s/n", "120A" e "KM 32" sao numeros de porta
  -- legitimos, e uma coluna inteira recusaria endereco que existe.
  street_number     text        NOT NULL
                                CONSTRAINT collar_tag_requests_numero_tamanho
                                CHECK (char_length(street_number) BETWEEN 1 AND 20),

  complement        text        CONSTRAINT collar_tag_requests_complemento_tamanho
                                CHECK (complement IS NULL OR char_length(complement) BETWEEN 1 AND 80),

  neighborhood      text        NOT NULL
                                CONSTRAINT collar_tag_requests_bairro_tamanho
                                CHECK (char_length(neighborhood) BETWEEN 2 AND 80),

  city              text        NOT NULL
                                CONSTRAINT collar_tag_requests_cidade_tamanho
                                CHECK (char_length(city) BETWEEN 2 AND 80),

  -- DOIS CARACTERES, e nenhuma lista de siglas aqui.
  --
  -- O servidor nao tem lista de UF em lugar nenhum -- `Area.state` do contrato
  -- tambem e so `minLength: 2, maxLength: 2` --, e a lista dos 27 vive no app
  -- (`app/lib/api/estados_brasileiros.dart`). Escrever um `CHECK IN (...)` com
  -- as 27 siglas criaria a SEGUNDA fonte, e as duas divergiriam no dia em que
  -- uma mudasse. O formato e o que o banco sabe cobrar; o conjunto e do app.
  state             text        NOT NULL
                                CONSTRAINT collar_tag_requests_uf_tamanho
                                CHECK (char_length(state) = 2),

  -- TRES valores, e a decisao e so do painel. `fulfilled` quer dizer "a
  -- plaquinha saiu", e nao "o codigo foi emitido" -- o codigo ja existia.
  status            text        NOT NULL DEFAULT 'pending'
                                CONSTRAINT collar_tag_requests_decisao_conhecida
                                CHECK (status IN ('pending', 'fulfilled', 'declined')),

  requested_at      timestamptz NOT NULL DEFAULT now(),
  decided_at        timestamptz,

  -- Conta do PAINEL (`admin_accounts`), nunca de `users`: ADR-0027 item 20.2.
  decided_by_admin_id uuid      REFERENCES admin_accounts (id) ON DELETE SET NULL,

  -- UM PEDIDO PENDENTE POR PET, e e isto que faz a rota do app ser idempotente
  -- sem chave de idempotencia: pedir de novo devolve o pedido que ja existe em
  -- vez de encher a fila com a mesma coisa. Indice parcial e nao `UNIQUE` de
  -- coluna porque um pet atendido pode pedir a segunda plaquinha.
  CONSTRAINT collar_tag_requests_decidido_tem_instante
    CHECK ((status IN ('fulfilled', 'declined')) = (decided_at IS NOT NULL))
);

CREATE UNIQUE INDEX collar_tag_requests_ref_unico ON collar_tag_requests (ref);

CREATE UNIQUE INDEX collar_tag_requests_um_pendente_por_pet
  ON collar_tag_requests (pet_id)
  WHERE status = 'pending';

-- A fila do painel: do pedido mais antigo para o mais novo.
CREATE INDEX collar_tag_requests_fila
  ON collar_tag_requests (requested_at)
  WHERE status = 'pending';

-- O teto por conta e a leitura "os pedidos desta conta".
CREATE INDEX collar_tag_requests_da_conta ON collar_tag_requests (requested_by);

COMMENT ON TABLE collar_tag_requests IS
  'Pedidos do OBJETO FISICO da plaquinha da coleira. Nao emite codigo: o codigo e de `pet_tags` e e irreversivel (ADR-0004). CONTEM DADO PESSOAL (endereco de entrega): nao sai em superficie publica, nao entra na trilha de auditoria e nao e geocodificado (ADR-0006). Sem valor e sem cobranca, que seguem fora de escopo por decisao do cliente.';

COMMENT ON COLUMN collar_tag_requests.postal_code IS
  'CEP com oito digitos, sem mascara. O app o usa para buscar rua/bairro/cidade/UF (ViaCEP, BrasilAPI de reserva) e preencher campos editaveis; o servidor nao participa da busca. Nada e geocodificado (ADR-0006), e o banco nao tem como conferir se o CEP bate com as demais colunas.';

COMMENT ON COLUMN collar_tag_requests.recipient_phone IS
  'Telefone de quem recebe, em E.164 (`+55` e 10 ou 11 digitos). DADO PESSOAL: nao sai em superficie publica e nao entra na trilha de auditoria.';

COMMENT ON COLUMN collar_tag_requests.state IS
  'UF em dois caracteres. O CONJUNTO das 27 siglas vive no app (`app/lib/api/estados_brasileiros.dart`), e nao aqui: um CHECK com as siglas seria a segunda fonte para divergir.';

COMMENT ON COLUMN collar_tag_requests.ref IS
  'Identificador opaco do pedido no caminho do painel, 128 bits em base64url. Nao e o UUID (ADR-0010 item 6).';

COMMENT ON COLUMN collar_tag_requests.status IS
  '`pending` ate o painel decidir. `fulfilled` quer dizer que a plaquinha saiu, e nao que o codigo foi emitido.';

-- Down Migration

DROP INDEX collar_tag_requests_da_conta;
DROP INDEX collar_tag_requests_fila;
DROP INDEX collar_tag_requests_um_pendente_por_pet;
DROP INDEX collar_tag_requests_ref_unico;
DROP TABLE collar_tag_requests;
