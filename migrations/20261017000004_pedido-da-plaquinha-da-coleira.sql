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
-- O QUE ESTA TABELA NAO TEM, E A AUSENCIA E DELIBERADA
-- ====================================================================
--
-- **Nao ha endereco de entrega e nao ha valor.** As duas sao decisao de
-- produto do cliente e nao foram tomadas: sem endereco o administrador recebe
-- um pedido que nao consegue cumprir, e com valor entra cobranca, que esta
-- fora de escopo por decisao dele. Inventar as colunas aqui seria decidir no
-- lugar dele, e migracao de coluna inventada custa mais do que a que falta.
--
-- Entra no lugar `notes`, texto livre e opcional do tutor, que e o minimo que
-- deixa o pedido dizer alguma coisa alem de "quero".

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
  'Pedidos do OBJETO FISICO da plaquinha da coleira. Nao emite codigo: o codigo e de `pet_tags` e e irreversivel (ADR-0004). Sem endereco de entrega e sem valor -- as duas sao decisao de produto do cliente, ainda em aberto, e a ausencia e deliberada.';

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
