-- BICHUS-43 -- conversa mediada entre tutor e achador.
--
-- O titulo da historia ja decide o modelo: "sem telefone e sem endereco". A
-- conversa existe para que o tutor nao precise publicar o numero dele e o
-- achador nao precise dizer onde mora. Por isso nao existe aqui, e nao pode
-- passar a existir, coluna de contato de nenhum dos dois lados: o que liga as
-- duas pessoas e a CONVERSA, nao um canal que uma delas entrega a outra.
--
-- ## Quem abre, e a partir de que
--
-- `found_report_id` e NOT NULL e UNIQUE, e essa e a decisao central. A conversa
-- nasce de um aviso -- o escaneamento da plaquinha, que e o momento em que
-- alguem esta com o animal na mao -- e de nada mais. Nao ha rota que crie
-- conversa, e o contrato nao declara nenhuma: nao existe `POST /conversations`.
-- Isso elimina por construcao a classe inteira de "abrir conversa com um tutor
-- qualquer", que seria mensagem direta entre desconhecidos com outro nome, e
-- que o produto excluiu ("chat geral entre usuarios" esta fora da historia).
--
-- O UNIQUE tambem e o que faz a abertura ser idempotente: o mesmo aviso
-- reenviado pela fila offline do cliente encontra a conversa que ja existe em
-- vez de criar a segunda.
--
-- ## Dois lados, e nao N participantes
--
-- `tutor_user_id` e `finder_user_id` em colunas, e nao uma tabela de
-- participantes. A conversa tem exatamente dois lados humanos por definicao de
-- produto, e uma tabela generica modelaria o grupo que a historia declara fora
-- de escopo. O achador pode nao ter conta -- `finder_user_id` e anulavel --, e
-- e por isso que o ALVO de uma acao sobre a outra parte e nomeado pelo par
-- (conversa, papel), nunca por um id de usuario:
--
--   * `blocked_by_role` guarda QUEM bloqueou sem exigir conta de quem bloqueou;
--   * a BICHUS-40 (bloquear e denunciar) precisa nomear o denunciado, e o
--     achador sem conta precisa ser nomeavel. O par (conversa, papel) nomeia os
--     dois lados com a mesma forma, e e por isso que `blocked_by_role` ja nasce
--     aqui em vez de um `blocked_by_user_id` que nao serviria para metade dos
--     casos.
--
-- ## O que NAO vira coluna
--
-- `status` do contrato (`open`, `blocked`, `closed`) e DERIVADO na leitura, de
-- `blocked_at`, de `closed_at` e do estado do caso ligado. Gravar um `status`
-- ao lado de `closed_at` cria duas fontes para o mesmo fato, e elas divergem no
-- primeiro caminho que esquecer de atualizar uma delas.
--
-- `participants` e `messages` do contrato tambem nao sao colunas: o primeiro e
-- projecao de `tutor_user_id`/`finder_*`, o segundo e a outra tabela.

-- Up Migration

CREATE TABLE conversations (
  id                    uuid        PRIMARY KEY,

  -- A origem, e a unica. Ver o cabecalho: um aviso, uma conversa.
  found_report_id       uuid        NOT NULL UNIQUE
                                    REFERENCES found_reports (id) ON DELETE CASCADE,

  pet_id                uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,

  -- Anulavel: a plaquinha pode ser escaneada com o pet em casa, sem caso
  -- aberto. `Conversation.case_id` do contrato ja e `nullable: true` por isso.
  -- `SET NULL` e nao `CASCADE`: apagar o caso nao pode levar junto a conversa
  -- em que as duas pessoas combinaram a devolucao.
  case_id               uuid        REFERENCES lost_cases (id) ON DELETE SET NULL,

  -- Desnormalizado de `pets.owner_user_id`, pela mesma razao que
  -- `lost_cases.owner_user_id`: a autorizacao do tutor vira um predicado numa
  -- coluna desta tabela, sem juncao, e `WHERE tutor_user_id = :chamador` passa
  -- a ser exprimivel em toda consulta (ADR-0021).
  tutor_user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Anulavel de proposito, e a anulabilidade e a regra: o achador civil nao tem
  -- conta e nao vai criar uma. Quando ele tem, e este id que o autoriza pela
  -- mesma clausula WHERE do tutor.
  finder_user_id        uuid        REFERENCES users (id) ON DELETE SET NULL,

  opened_at             timestamptz NOT NULL DEFAULT now(),

  -- Encerramento proprio da conversa. O encerramento por CASO e derivado da
  -- juncao com `lost_cases` na leitura, e nao copiado para ca: duas fontes para
  -- "esta conversa acabou" divergem no primeiro caminho que esquecer uma.
  closed_at             timestamptz,
  closure_reason        text        CONSTRAINT conversations_closure_reason_conhecida
                                    CHECK (closure_reason IS NULL
                                           OR closure_reason IN ('case_closed',
                                                                 'pet_returned',
                                                                 'retention')),

  -- BICHUS-40 escreve estas duas. Elas nascem aqui porque o criterio 2 daquela
  -- historia diz que a conversa bloqueada fica em modo leitura, e modo leitura
  -- e regra DESTA historia: sem a coluna, o envio nao teria o que consultar.
  blocked_at            timestamptz,
  blocked_by_role       text        CONSTRAINT conversations_blocked_by_role_conhecido
                                    CHECK (blocked_by_role IS NULL
                                           OR blocked_by_role IN ('tutor', 'finder')),

  -- Retencao para revisao humana (criterios 10, 11 e 17).
  --
  -- Nao e valor de `status`, e a ausencia e deliberada: os dois criterios dizem
  -- "sem notificar ninguem", e um status novo no corpo da resposta avisaria o
  -- golpista de que ele foi marcado -- que e ajudar o golpe a se corrigir. A
  -- conversa retida continua respondendo `open` para os dois lados.
  held_for_review_at    timestamptz,
  held_reason           text        CONSTRAINT conversations_held_reason_conhecido
                                    CHECK (held_reason IS NULL
                                           OR held_reason IN ('message_volume',
                                                              'serial_finder')),

  CONSTRAINT conversations_bloqueio_completo
    CHECK ((blocked_at IS NULL) = (blocked_by_role IS NULL)),
  CONSTRAINT conversations_encerramento_completo
    CHECK ((closed_at IS NULL) = (closure_reason IS NULL)),
  CONSTRAINT conversations_retencao_completa
    CHECK ((held_for_review_at IS NULL) = (held_reason IS NULL)),

  -- O achador com conta nao pode ser o proprio tutor: seria uma pessoa
  -- conversando consigo mesma, e faria `papelDe` responder duas coisas.
  CONSTRAINT conversations_dois_lados_distintos
    CHECK (finder_user_id IS NULL OR finder_user_id <> tutor_user_id)
);

-- "Minhas conversas" do tutor, na ordem em que a tela pede.
CREATE INDEX conversations_do_tutor ON conversations (tutor_user_id, opened_at DESC);

-- O mesmo para o achador que TEM conta. Parcial porque a maioria nao tem, e um
-- indice cheio de NULL so ocupa pagina.
CREATE INDEX conversations_do_achador ON conversations (finder_user_id, opened_at DESC)
  WHERE finder_user_id IS NOT NULL;

-- A fila de revisao humana da BICHUS-40 le por aqui.
CREATE INDEX conversations_retidas ON conversations (held_for_review_at)
  WHERE held_for_review_at IS NOT NULL;

COMMENT ON COLUMN conversations.found_report_id IS
  'A conversa nasce de um aviso e so dele. UNIQUE: o reenvio da fila offline encontra a que existe em vez de criar a segunda.';
COMMENT ON COLUMN conversations.held_for_review_at IS
  'Retencao para revisao humana. Invisivel aos dois lados por decisao dos criterios 10 e 11 da BICHUS-43: avisar o golpista e ajuda-lo a se corrigir.';
COMMENT ON COLUMN conversations.blocked_by_role IS
  'Papel, e nao id: o achador pode nao ter conta, e a BICHUS-40 precisa nomear os dois lados com a mesma forma.';

CREATE TABLE conversation_messages (
  id                uuid        PRIMARY KEY,
  conversation_id   uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,

  sender_role       text        NOT NULL
                                CONSTRAINT conversation_messages_sender_role_conhecido
                                CHECK (sender_role IN ('tutor', 'finder', 'system')),

  -- Quem mandou, quando tem conta. Nulo na mensagem do sistema e na do achador
  -- civil. O papel acima e que decide a apresentacao; este id serve a trilha.
  sender_user_id    uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- O TEXTO JA REDIGIDO. Nunca o que a pessoa digitou.
  --
  -- O contrato limita a ENTRADA a 1000 caracteres. A coluna aceita 4000 porque
  -- a redacao CRESCE o texto: `11987654321` (11 caracteres) vira
  -- `[telefone removido]` (19), e um corpo inteiro de numeros curtos chega
  -- perto de dobrar. Dimensionar a coluna pelo limite da entrada faria a
  -- mensagem mais evasiva de todas -- a que e quase toda telefone -- virar 500
  -- por violacao de CHECK, justamente a que a redacao existe para tratar.
  body              text        NOT NULL
                                CONSTRAINT conversation_messages_body_tamanho
                                CHECK (char_length(body) BETWEEN 1 AND 4000),

  -- O que a redacao retirou, para a tela explicar em vez de o remetente achar
  -- que foi censurado sem motivo. Array sempre, nunca NULL, como
  -- `pets.care_notes_redactions`. Guarda o ROTULO do que saiu, jamais o
  -- conteudo: gravar "retirei o telefone 11 9xxxx-xxxx" devolveria pela porta
  -- do lado exatamente o dado que a redacao reteve.
  redactions        jsonb       NOT NULL DEFAULT '[]'::jsonb
                                CONSTRAINT conversation_messages_redactions_array
                                CHECK (jsonb_typeof(redactions) = 'array'),

  -- A foto do achado, quando houver. CHAVE de objeto, nunca URL: a URL e
  -- montada na leitura a partir da base vigente (arquitetura, secao 11.1).
  photo_object_key  text        CONSTRAINT conversation_messages_photo_object_key_tamanho
                                CHECK (photo_object_key IS NULL
                                       OR char_length(photo_object_key) BETWEEN 1 AND 512),

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Mensagem de sistema nao tem remetente humano. Sem isto, um `sender_user_id`
  -- preenchido numa linha `system` faria o aviso de golpe parecer escrito pelo
  -- tutor.
  CONSTRAINT conversation_messages_sistema_sem_remetente
    CHECK (sender_role <> 'system' OR sender_user_id IS NULL)
);

-- A leitura da conversa: pagina por `created_at` e desempata por `id`, que e
-- UUIDv7 e por isso ordena junto. Sem o desempate, duas mensagens no mesmo
-- milissegundo fazem o cursor pular ou repetir uma delas.
CREATE INDEX conversation_messages_da_conversa
  ON conversation_messages (conversation_id, created_at, id);

-- O teto de 30 por hora e o de 200 em 24 h contam mensagem por participante, e
-- e por aqui que a contagem e feita sem varrer a conversa inteira.
CREATE INDEX conversation_messages_por_remetente
  ON conversation_messages (conversation_id, sender_role, created_at DESC);

COMMENT ON COLUMN conversation_messages.body IS
  'Texto JA redigido. A redacao roda antes de gravar (BICHUS-43 criterio 13), nos dois sentidos, e por isso o original nao existe em coluna nenhuma.';
COMMENT ON COLUMN conversation_messages.photo_object_key IS
  'Chave de objeto. URL absoluta nao e persistida em lugar nenhum deste banco.';

-- Down Migration

DROP TABLE conversation_messages;
DROP TABLE conversations;
