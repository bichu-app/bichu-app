-- BICHUS-41 -- a conversa do achador sem conta, pelo token.
--
-- Duas mudancas de esquema, e as duas existem porque o achador sem conta nao
-- tem `users.id` para pendurar nada.
--
-- ===========================================================================
-- 1. `upload_intents`: a foto de quem nao tem conta
-- ===========================================================================
-- `user_id` nasceu NOT NULL em 18/09, e `kind` ja previa `finder_photo` desde
-- entao: a tabela declarava o caso e nao conseguia guardar uma linha dele.
-- `createFinderPhotoUploadIntent` e autorizada por `finderToken`, e quem chama
-- nao tem conta nenhuma.
--
-- `user_id` passa a ser anulavel SO para `finder_photo`. As outras duas
-- especies continuam exigindo dono, e o CHECK cobra isso no banco, nao na
-- disciplina de quem escreve o INSERT.
--
-- `upload_ref` e a referencia OPACA que o contrato devolve ao achador
-- (`FinderUploadIntent.upload_ref`, 128 bits em base64url, 22 caracteres) e
-- que ele devolve em `PATCH /v1/finder/found-report`. O `id` da linha e
-- UUIDv7, carrega o instante de criacao e nao sai para quem nao tem conta
-- (SEC-001). A referencia e UNIQUE porque e ela que resolve o upload.
--
-- ===========================================================================
-- 2. `conversation_reports`: a fila de denuncia
-- ===========================================================================
-- `reportFinderConversation` e `human_work`: a denuncia vai para uma fila que
-- uma pessoa le. Ate aqui nao havia onde grava-la -- a BICHUS-40 (bloquear e
-- denunciar do lado com conta) ainda nao tinha construido a tabela.
--
-- O alvo e nomeado pelo PAR (conversa, papel), pelo mesmo motivo de
-- `conversations.blocked_by_role`: o achador pode nao ter conta, e a forma
-- precisa nomear os dois lados igual. Nao ha coluna de usuario aqui.
--
-- `accept_and_deduplicate` do contrato ("a tela confirma normal, e acima do
-- teto a denuncia e anexada ao item de fila ja aberto") e o indice unico
-- parcial abaixo: enquanto a denuncia de um lado contra o outro estiver aberta,
-- a proxima SOMA a ela (`repeat_count`) em vez de abrir outro item de fila.
-- Contado pelo indice, e nao por um SELECT antes do INSERT, que perde a corrida.

-- Up Migration

ALTER TABLE upload_intents ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE upload_intents
  ADD COLUMN upload_ref text
    CONSTRAINT upload_intents_upload_ref_formato
    CHECK (upload_ref IS NULL OR upload_ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- So a foto do achador sem conta pode nascer sem dono.
  ADD CONSTRAINT upload_intents_dono_salvo_achador_sem_conta
    CHECK (user_id IS NOT NULL OR kind = 'finder_photo'),

  -- E ela sempre pertence a um aviso, e sempre tem a referencia opaca: sem o
  -- aviso o teto de tres fotos nao tem o que contar, e sem a referencia o
  -- achador nao tem como ligar a foto ao aviso.
  ADD CONSTRAINT upload_intents_foto_do_achador_tem_aviso_e_ref
    CHECK (kind <> 'finder_photo' OR (found_report_id IS NOT NULL AND upload_ref IS NOT NULL));

CREATE UNIQUE INDEX upload_intents_upload_ref_unico ON upload_intents (upload_ref)
  WHERE upload_ref IS NOT NULL;

COMMENT ON COLUMN upload_intents.upload_ref IS
  'Referencia opaca (128 bits, base64url) devolvida ao achador sem conta. O id da linha e UUIDv7 e nao sai para ele (SEC-001).';

CREATE TABLE conversation_reports (
  id                uuid        PRIMARY KEY,
  conversation_id   uuid        NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,

  -- Quem denunciou, pelo papel. O alvo e o OUTRO papel da mesma conversa.
  reporter_role     text        NOT NULL
                                CONSTRAINT conversation_reports_reporter_role_conhecido
                                CHECK (reporter_role IN ('tutor', 'finder')),

  reason            text        NOT NULL
                                CONSTRAINT conversation_reports_reason_conhecido
                                CHECK (reason IN ('extortion', 'harassment', 'spam',
                                                  'impersonation', 'other')),

  -- O texto de quem denunciou, para quem modera. Limite do contrato.
  detail            text        CONSTRAINT conversation_reports_detail_tamanho
                                CHECK (detail IS NULL OR char_length(detail) <= 1000),

  -- Quantas vezes o mesmo lado denunciou de novo com a denuncia ainda aberta.
  repeat_count      integer     NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),

  created_at        timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),

  -- Escrito por quem modera (BICHUS-40). Nulo e "na fila".
  resolved_at       timestamptz
);

-- Um item de fila aberto por (conversa, lado). E o `accept_and_deduplicate`.
CREATE UNIQUE INDEX conversation_reports_uma_aberta_por_lado
  ON conversation_reports (conversation_id, reporter_role)
  WHERE resolved_at IS NULL;

-- A fila, na ordem em que ela e lida.
CREATE INDEX conversation_reports_fila ON conversation_reports (created_at)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE conversation_reports IS
  'Denuncias da conversa mediada. O alvo e o outro papel da conversa; nao ha coluna de usuario porque o achador pode nao ter conta.';

-- Down Migration

DROP TABLE IF EXISTS conversation_reports;

DROP INDEX IF EXISTS upload_intents_upload_ref_unico;

-- As intencoes do achador sem conta nao cabem no esquema anterior (que exige
-- `user_id`), entao a volta as apaga. `found_reports.photo_upload_id` aponta
-- para elas com `ON DELETE SET NULL`: o aviso fica, a foto deixa de estar
-- ligada. Sem o DELETE, o `SET NOT NULL` abaixo falharia em qualquer banco que
-- ja tenha recebido uma foto de achador.
DELETE FROM upload_intents WHERE user_id IS NULL;

ALTER TABLE upload_intents
  DROP CONSTRAINT IF EXISTS upload_intents_foto_do_achador_tem_aviso_e_ref,
  DROP CONSTRAINT IF EXISTS upload_intents_dono_salvo_achador_sem_conta,
  DROP COLUMN IF EXISTS upload_ref;

ALTER TABLE upload_intents ALTER COLUMN user_id SET NOT NULL;
