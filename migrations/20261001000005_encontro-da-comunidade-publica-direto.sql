-- O encontro da comunidade PUBLICA DIRETO, e a capa dele e de usuario
-- (decisao do cliente de 17/10/2026; ADR-0025 emenda 3).
--
-- POR QUE ESTA MIGRACAO EXISTE: a 20261001000004 nasceu num desenho com fila de
-- moderacao, e o cliente desfez a fila no mesmo dia: "porque teria evento
-- recusado? o usuario validado pode criar eventos sem aprovacao. A imagem de
-- capa do evento e publica". Ela nunca rodou em ambiente nenhum, mas o carimbo
-- dela ja foi reservado nesta branch, e migracao reservada nao se reescreve --
-- foi colisao de carimbo que quase travou este banco para sempre.
--
-- O QUE ELA FAZ, EM TRES PARTES:
--
-- 1. `pending_review` DEIXA DE EXISTIR. Ele era o estado da fila, e o
--    `CHECK network_events_revisao_so_da_comunidade` existia so para amarra-lo a
--    origem `community`. Sem fila, os dois saem. **Nenhuma linha esta nesse
--    estado**: a rota que o criava nasceu nesta mesma branch e nunca foi
--    mesclada, e a massa grava `published`. O `UPDATE` de seguranca antes do
--    `CHECK` novo esta aqui de proposito -- se alguma linha existir, ela vira
--    `published` com `published_at` em vez de travar a migracao em producao.
--
-- 2. O teto por conta passa a contar encontro ATIVO, e nao em revisao. Sem
--    revisao humana, o teto de 3 e o teto de chamada da rota sao a unica
--    contencao de volume, e por isso o numero fica e o que ele mede muda:
--    encontro publicado que ainda nao terminou. O encerrado e o cancelado saem
--    da conta sozinhos.
--
--    `p_agora` e PARAMETRO e nao `now()`: o relogio deste projeto e injetado, e
--    uma funcao que le o relogio do banco faria o teto discordar do recorte de
--    tempo que a mesma requisicao usa.
--
-- 3. `catalog_upload_intents` passa a aceitar autor de `users`. A tabela nasceu
--    so para o painel (`admin_account_id NOT NULL`), e a capa do encontro da
--    comunidade e de USUARIO. As duas colunas convivem com um `CHECK` de "um e
--    so um": o envio tem exatamente um autor, e nunca os dois nem nenhum.
--    A alternativa seria `upload_intents` (a tabela do app), e ela esta errada
--    aqui: a capa do encontro vira `catalog_images`, e e `catalog_images` que
--    `network_event_images` referencia. Dois caminhos para a mesma imagem
--    divergiriam no primeiro worker que mudasse.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. `pending_review` sai
-- ---------------------------------------------------------------------------

UPDATE network_events
   SET publication_status = 'published',
       published_at = COALESCE(published_at, created_at)
 WHERE publication_status = 'pending_review';

ALTER TABLE network_events
  DROP CONSTRAINT network_events_revisao_so_da_comunidade,
  DROP CONSTRAINT network_events_publicacao_conhecida,
  ADD CONSTRAINT network_events_publicacao_conhecida
    CHECK (publication_status IN ('published', 'cancelled', 'removed'));

COMMENT ON COLUMN network_events.publication_status IS
  'Se o encontro aparece. Visivel e `published` ou `cancelled` (o cancelado sai com `status` `cancelled` ate o fim previsto e, depois dele, segue a regra do encerrado; decisao do cliente de 23/09). `removed` e terminal. Nasce `published` tanto pelo painel quanto pela comunidade: nao ha rascunho (ADR-0027 12.9) e nao ha revisao (ADR-0025 emenda 3, 17/10/2026).';

-- ---------------------------------------------------------------------------
-- 2. O teto passa a contar encontro ativo
-- ---------------------------------------------------------------------------

DROP FUNCTION network_events_em_revisao_do_autor(uuid);

DROP INDEX network_events_em_revisao_por_autor;

CREATE INDEX network_events_da_comunidade_por_autor
  ON network_events (created_by_user_id, starts_at)
  WHERE origin = 'community' AND publication_status = 'published';

CREATE FUNCTION network_events_ativos_do_autor(p_autor uuid, p_agora timestamptz)
RETURNS integer AS $$
  SELECT count(*)::integer
    FROM network_events
   WHERE created_by_user_id = p_autor
     AND origin = 'community'
     AND publication_status = 'published'
     AND COALESCE(ends_at, starts_at) > p_agora;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION network_events_ativos_do_autor(uuid, timestamptz) IS
  'Quantos encontros da comunidade desta conta ainda nao terminaram (ADR-0025 emenda 3, teto de 3). Existe pelo mesmo motivo de network_events_gravar_autoria: o nome da coluna de autoria e reprovado em src/ pelo portao de colunas que nao saem, e a contagem precisa dela na clausula WHERE.';

-- A leitura de "este encontro e desta pessoa?", que decide a edicao e o
-- cancelamento pelo autor. Ela existe pelo MESMO motivo das duas acima, e
-- existe UMA VEZ: a regra de autoria mora num lugar so, e a edicao e o
-- cancelamento a consultam pela mesma funcao. Devolve o `id` interno (que nunca
-- sai em resposta) ou nenhuma linha -- e "nenhuma linha" e o 404 do ADR-0021,
-- identico para encontro inexistente, de outra pessoa e do painel.
CREATE FUNCTION network_events_do_autor(p_slug text, p_autor uuid)
RETURNS TABLE (id uuid, version integer, publication_status text, starts_at timestamptz, ends_at timestamptz) AS $$
  SELECT e.id, e.version, e.publication_status, e.starts_at, e.ends_at
    FROM network_events e
   WHERE e.slug = p_slug
     AND e.origin = 'community'
     AND e.created_by_user_id = p_autor
     AND e.publication_status <> 'removed';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION network_events_do_autor(text, uuid) IS
  'O encontro da comunidade DESTA conta, pelo slug (ADR-0025 emenda 3). Zero linhas para o que nao existe, o de outra pessoa e o do painel: os tres sao o mesmo 404 (ADR-0021). Funcao e nao consulta em src/ porque a autoria esta na coluna que o portao de colunas que nao saem proibe nomear ali.';

-- ---------------------------------------------------------------------------
-- 3. A intencao de envio de capa passa a ter autor de `users`
-- ---------------------------------------------------------------------------

ALTER TABLE catalog_upload_intents
  ALTER COLUMN admin_account_id DROP NOT NULL,
  ADD COLUMN user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  ADD CONSTRAINT catalog_upload_intents_um_autor
    CHECK ((admin_account_id IS NULL) <> (user_id IS NULL));

CREATE INDEX catalog_upload_intents_por_usuario
  ON catalog_upload_intents (user_id) WHERE user_id IS NOT NULL;

COMMENT ON COLUMN catalog_upload_intents.user_id IS
  'A conta do app que pediu o envio, quando o envio e da comunidade (ADR-0025 emenda 3): hoje, a capa do encontro. Exatamente um dos dois autores e preenchido, e o CHECK impoe. ON DELETE CASCADE porque a intencao e descartavel: ela vence em dez minutos e o varredor a recolhe.';

COMMENT ON TABLE catalog_upload_intents IS
  'Intencao de envio de imagem de catalogo (Loja e Rede). Autor e uma conta do painel (admin_account_id, ADR-0027 A.3) OU uma conta do app (user_id, ADR-0025 emenda 3), nunca os dois. Separada de upload_intents, que e a da foto de pet e do achador.';

-- Down Migration

DROP INDEX catalog_upload_intents_por_usuario;

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_um_autor,
  DROP COLUMN user_id,
  ALTER COLUMN admin_account_id SET NOT NULL;

DROP FUNCTION network_events_do_autor(text, uuid);

DROP FUNCTION network_events_ativos_do_autor(uuid, timestamptz);

DROP INDEX network_events_da_comunidade_por_autor;

CREATE INDEX network_events_em_revisao_por_autor
  ON network_events (created_by_user_id)
  WHERE publication_status = 'pending_review';

CREATE FUNCTION network_events_em_revisao_do_autor(p_autor uuid)
RETURNS integer AS $$
  SELECT count(*)::integer
    FROM network_events
   WHERE created_by_user_id = p_autor
     AND publication_status = 'pending_review';
$$ LANGUAGE sql STABLE;

ALTER TABLE network_events
  DROP CONSTRAINT network_events_publicacao_conhecida,
  ADD CONSTRAINT network_events_publicacao_conhecida
    CHECK (publication_status IN ('pending_review', 'published', 'cancelled', 'removed')),
  ADD CONSTRAINT network_events_revisao_so_da_comunidade
    CHECK (origin = 'community' OR publication_status <> 'pending_review');
