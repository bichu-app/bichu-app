-- Tags QR e o aviso de quem acha o animal.
--
-- O ponto irreversivel do PRODUTO esta aqui (ADR-0004): o que vai impresso na
-- plaquinha e o codigo, e o codigo nao e derivado de nada. 128 bits de CSPRNG,
-- sem relacao matematica com `pet_id`, `user_id`, data, sequencia ou lote. E
-- por isso que nao existe DEFAULT nenhum gerando codigo no banco: a geracao e
-- da aplicacao, com o CSPRNG dela, e o banco so guarda o resumo.
--
-- O QUE VAI NO BANCO NAO E O CODIGO. Sao duas formas dele:
--
--   `code_hash`       SHA-256 do codigo normalizado. E por ele que a resolucao
--                     busca, e e o unico indice. Sem sal, e isso e decisao e
--                     nao esquecimento: a entrada tem 128 bits de entropia,
--                     entao nao ha dicionario a percorrer e o sal so custaria
--                     uma leitura por verificacao.
--   `code_ciphertext` AES-256-GCM do mesmo codigo, com a chave de ambiente
--                     (`TAG_CODE_KEY`, porta `SecretCipher`). Existe para UMA
--                     coisa: reimprimir o QR. E apagado na revogacao, e o banco
--                     impoe isso com CHECK em vez de confiar em quem escreve o
--                     `UPDATE`.
--
-- Um vazamento do banco nao entrega codigo utilizavel: o hash nao se inverte
-- com 128 bits de entropia, e o cifrado nao se abre sem a chave, que nao mora
-- aqui.
--
-- SEM COLUNA GEOGRAFICA. O PostGIS e criado pela migracao 1 e continua sem
-- nenhum uso. O scan da tag nao tem ponto: quem escaneia na rua e um estranho
-- sem conta, e o que se pede a ele e um toque, zero campos. O ponto entra em
-- `lostfound`, com a tabela que precisa dele.

-- Up Migration

CREATE TABLE pet_tags (
  id                uuid        PRIMARY KEY,

  -- NOT NULL, e e a cadeia de fornecimento escolhida pelo cliente em 17/09 que
  -- permite afirmar isso: "impresso depois". O codigo nasce ligado ao pet, nao
  -- existe tag sem pet, e nao existe o estado `manufactured`. O cenario de tag
  -- pre-impressa (com `pet_id` anulavel, `batch_id` e segredo de ativacao) esta
  -- descrito no ADR-0004 com o delta exato; ele NAO e antecipado aqui, porque
  -- coluna anulavel que nada preenche e o que ninguem remove depois.
  --
  -- ON DELETE CASCADE e coerente com o ADR-0004: excluir o pet revoga as tags.
  -- A revogacao logica (status + motivo) e o caminho normal e e a que produz o
  -- 410 do achador; o CASCADE so cobre a exclusao fisica da linha do pet.
  pet_id            uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,

  code_hash         bytea       NOT NULL
                                CONSTRAINT pet_tags_code_hash_sha256
                                CHECK (octet_length(code_hash) = 32),

  -- Anulavel de proposito: a revogacao APAGA o cifrado. Nao se reimprime o que
  -- foi revogado, entao guardar o codigo depois disso seria manter uma copia
  -- que nenhum caminho de leitura usa.
  code_ciphertext   bytea,

  -- Os quatro ultimos caracteres do codigo canonico. E a UNICA parte do codigo
  -- que o tutor recebe de volta depois da emissao, e serve para ele saber qual
  -- plaquinha e qual. Quatro caracteres colidem, e e por isso que eles NAO sao
  -- caminho de identificacao em rota nenhuma.
  code_suffix       char(4)     NOT NULL
                                CONSTRAINT pet_tags_code_suffix_alfabeto
                                CHECK (code_suffix ~ '^[0-9A-HJKMNP-TV-Z]{4}$'),

  label             text        CONSTRAINT pet_tags_label_tamanho
                                CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 40),

  -- DOIS VALORES, e so dois (docs/03-arquitetura.md 4.3). Nao ha `suspended`
  -- nem `pending`: o codigo e imutavel, nao se edita, nao se transfere e nao se
  -- reativa. O que existe e emitir um novo e revogar o antigo.
  status            text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'revoked')),

  revoked_at        timestamptz,
  revocation_reason text        CHECK (revocation_reason IN ('lost_tag', 'suspected_clone',
                                                             'owner_request', 'pet_transferred',
                                                             'pet_deceased', 'pet_deleted')),

  scan_count        integer     NOT NULL DEFAULT 0
                                CONSTRAINT pet_tags_scan_count_nao_negativo
                                CHECK (scan_count >= 0),
  last_scanned_at   timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Estado revogado e um estado COMPLETO, e o banco recusa a versao pela
  -- metade. Sem isto, um `UPDATE` que esqueca `revoked_at` produz uma tag que
  -- responde 410 sem ninguem conseguir dizer desde quando, e uma que responde
  -- 200 com data de revogacao preenchida.
  CONSTRAINT pet_tags_revogacao_e_completa
    CHECK ((status = 'revoked' AND revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
           OR (status = 'active' AND revoked_at IS NULL AND revocation_reason IS NULL)),

  -- "O texto cifrado guardado para reimpressao e apagado" (ADR-0004, e a
  -- descricao de `revokePetTag` no contrato). Escrito como restricao e nao como
  -- combinado: enquanto isso for responsabilidade de quem escreve o UPDATE,
  -- basta um caminho novo de revogacao para o codigo continuar recuperavel de
  -- uma tag que o tutor acredita ter destruido.
  CONSTRAINT pet_tags_revogada_nao_guarda_o_codigo
    CHECK (status = 'active' OR code_ciphertext IS NULL)
);

COMMENT ON COLUMN pet_tags.code_hash IS
  'SHA-256 do codigo normalizado. A resolucao publica busca por ele, e so por ele.';
COMMENT ON COLUMN pet_tags.code_ciphertext IS
  'AES-256-GCM do codigo. Existe so para reimprimir o QR e e APAGADO na revogacao (ADR-0004).';
COMMENT ON COLUMN pet_tags.code_suffix IS
  'Quatro ultimos caracteres. Identifica a plaquinha para o tutor; NUNCA endereca nada.';

-- O indice que a rota mais publica do produto usa. UNIQUE porque dois pets com
-- o mesmo codigo e o defeito que abriria a pagina do pet errado.
CREATE UNIQUE INDEX pet_tags_code_hash_unico ON pet_tags (code_hash);

-- Sustenta a listagem do tutor e o teto de 5 tags ativas por pet.
CREATE INDEX pet_tags_ativas_do_pet ON pet_tags (pet_id) WHERE status = 'active';

-- Sustenta o teto de 10 emissoes por pet por dia, que conta emissao e nao tag
-- viva: revogar e emitir de novo nao zera a contagem do dia.
CREATE INDEX pet_tags_emissoes_do_pet ON pet_tags (pet_id, created_at DESC);

-- ---------------------------------------------------------------------------

-- APENAS INSERCAO. E a evidencia de "houve leitura em lugar improvavel" que
-- sustenta a revogacao por suspeita de clonagem (ADR-0004), e e o contador que
-- alimenta `scan_count`.
CREATE TABLE tag_scans (
  id                       uuid        PRIMARY KEY,
  tag_id                   uuid        NOT NULL REFERENCES pet_tags (id) ON DELETE CASCADE,
  scanned_at               timestamptz NOT NULL DEFAULT now(),

  -- HMAC-SHA-256 com chave secreta, NUNCA hash puro e nunca o endereco em claro
  -- (SEC-010). O espaco IPv4 inteiro tem 2^32 entradas: um SHA-256 sem chave se
  -- reverte por forca bruta em minutos, e "hash" reversivel nao e anonimizacao.
  -- O IPv4 e truncado para /24 antes do HMAC, o que basta para detectar abuso e
  -- deixa a vizinhanca em vez da casa.
  ip_hmac                  bytea       CONSTRAINT tag_scans_ip_hmac_sha256
                                       CHECK (ip_hmac IS NULL OR octet_length(ip_hmac) = 32),
  user_agent_hash          bytea       CONSTRAINT tag_scans_user_agent_hash_sha256
                                       CHECK (user_agent_hash IS NULL OR octet_length(user_agent_hash) = 32),

  -- Bairro, quando houver. NAO e coordenada e nao vira coordenada: o rotulo
  -- basta para "leitura em lugar improvavel" e nao carrega ponto exato de
  -- ninguem. Continua vazio enquanto nao houver de onde derivar o bairro.
  area_label               text,

  resulted_in_found_report boolean     NOT NULL DEFAULT false
);

COMMENT ON TABLE tag_scans IS
  'Apenas insercao. Retencao de 90 dias (docs/03-arquitetura.md 4.3); o expurgo entra com o worker.';

CREATE INDEX tag_scans_da_tag ON tag_scans (tag_id, scanned_at DESC);

-- ---------------------------------------------------------------------------

-- O aviso de quem achou. A tabela e de `lostfound`; o que esta aqui e o
-- SUBCONJUNTO que o caminho da tag preenche, e nada alem dele.
--
-- O que NAO esta aqui, e a ausencia e decisao: `case_id`, `status` do ciclo do
-- caso, `found_point`/`found_city`/`found_area_label`, `photo_id` e os atributos
-- de cruzamento (`species`, `breed_code`, `size`, `primary_color_code`, `sex`).
-- Todos pertencem ao caso e ao cruzamento, que nao existem ainda, e todos
-- chegam pelo enriquecimento (`PATCH /found-reports/{id}`), que tambem nao
-- existe. Criar coluna agora significaria escolher agora o dominio dela sem o
-- caso na mao, e e assim que se grava um `status` com tres valores que depois
-- precisam ser cinco.
CREATE TABLE found_reports (
  id                       uuid        PRIMARY KEY,

  origin                   text        NOT NULL
                                       CHECK (origin IN ('tag_scan', 'stray_report')),

  -- Preenchidos quando `origin = 'tag_scan'`. O achado avulso nao tem tag nem
  -- pet, e e o mesmo formulario sem o codigo.
  tag_id                   uuid        REFERENCES pet_tags (id) ON DELETE SET NULL,
  pet_id                   uuid        REFERENCES pets (id) ON DELETE CASCADE,

  -- Nulo no aviso anonimo, que e a excecao permanente do produto: esta operacao
  -- nao exige conta. Obrigatorio no achado avulso, e essa regra e de
  -- `lostfound`.
  reporter_user_id         uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- A identidade do achador SEM CONTA, derivada: HMAC do endereco de origem
  -- combinado ao resumo do agente. E o que a dimensao `finder_identity` dos
  -- tetos do contrato precisa para existir, e o que decide se um segundo aviso
  -- da mesma pessoa em 6 h ANEXA a conversa em vez de tocar o telefone do tutor
  -- de novo. Nunca guarda o endereco nem o agente em claro.
  finder_identity_hash     bytea       CONSTRAINT found_reports_finder_identity_hash_sha256
                                       CHECK (finder_identity_hash IS NULL
                                              OR octet_length(finder_identity_hash) = 32),

  finder_display_name      text        CONSTRAINT found_reports_finder_display_name_tamanho
                                       CHECK (finder_display_name IS NULL
                                              OR char_length(finder_display_name) BETWEEN 1 AND 60),
  finder_email             text,

  -- SHA-256 do token opaco de 256 bits, que e a unica forma em que ele e
  -- persistido (ADR-0002, SEC-005). E o que autoriza o achador a voltar a
  -- conversa sem ter conta.
  finder_token_hash        bytea       NOT NULL
                                       CONSTRAINT found_reports_finder_token_hash_sha256
                                       CHECK (octet_length(finder_token_hash) = 32),
  finder_token_expires_at  timestamptz NOT NULL,

  found_at                 timestamptz NOT NULL,

  -- O recado de quem achou, como ele digitou. Campo opcional: o caminho
  -- principal e corpo vazio.
  notes                    text        CONSTRAINT found_reports_notes_tamanho
                                       CHECK (notes IS NULL OR char_length(notes) <= 500),

  created_at               timestamptz NOT NULL DEFAULT now(),

  -- Aviso vindo do scan sem a tag, ou sem o pet, e um registro que nao tem como
  -- alcancar o tutor. O banco recusa em vez de deixar a linha orfa aparecer
  -- depois numa consulta que a ignora em silencio.
  CONSTRAINT found_reports_scan_tem_tag_e_pet
    CHECK (origin <> 'tag_scan' OR (tag_id IS NOT NULL AND pet_id IS NOT NULL))
);

COMMENT ON TABLE found_reports IS
  'Subconjunto que o caminho da tag preenche. Caso, ponto, foto e atributos de cruzamento entram com lostfound.';
COMMENT ON COLUMN found_reports.finder_identity_hash IS
  'Identidade derivada do achador sem conta. Sustenta a dimensao `finder_identity` dos tetos do contrato.';

CREATE UNIQUE INDEX found_reports_finder_token_unico ON found_reports (finder_token_hash);

-- Responde as duas perguntas do fluxo publico: "ja avisei nas ultimas 24 h?"
-- (`already_notified`) e "este mesmo achador avisou nas ultimas 6 h?" (a
-- decisao de agrupar em vez de notificar de novo).
CREATE INDEX found_reports_da_tag ON found_reports (tag_id, created_at DESC)
  WHERE tag_id IS NOT NULL;
CREATE INDEX found_reports_do_pet ON found_reports (pet_id, created_at DESC)
  WHERE pet_id IS NOT NULL;

-- Down Migration

DROP TABLE IF EXISTS found_reports;
DROP TABLE IF EXISTS tag_scans;
DROP TABLE IF EXISTS pet_tags;
