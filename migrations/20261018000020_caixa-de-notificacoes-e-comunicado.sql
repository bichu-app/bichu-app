-- A CAIXA DE NOTIFICACOES (o conteudo do sino) e o COMUNICADO do painel.
--
-- Pedido do cliente: "na barra principal crie um icone de notificacao para
-- alertar o usuario sobre os posts dos seus amigos e sobre informacoes
-- sistemicas e comunicados de eventos". O sino ja esta sendo posto na barra por
-- outra frente, COM CONTADOR, e o toque dele nao tinha destino: esta migracao
-- cria o destino e a fonte do numero.
--
-- ====================================================================
-- O QUE EXISTIA, MEDIDO E NAO SUPOSTO
-- ====================================================================
--
-- `notification_deliveries` (`20260919000001`) NAO e isto. O COMMENT ON TABLE
-- dela diz por extenso o que ela e: "Eventos de entrega do provedor de e-mail
-- (BICHUS-13 criterios 7 e 9)". Ela guarda `message_id` e `record_type` do
-- Postmark, nao tem destinatario, nao tem estado de leitura e nao tem linha por
-- pessoa. Nao ha rota de listar notificacao em `api/openapi.yaml`, e
-- `broadcast`, `comunicado`, `announcement` e `anuncio` devolvem ZERO ocorrencia
-- no contrato. O sino nao tinha de onde buscar o que mostrar.
--
-- ====================================================================
-- POR QUE A CAIXA E MATERIALIZADA, E NAO UMA UNIAO LIDA NA HORA
-- ====================================================================
--
-- A tentacao era um `UNION ALL` de nove tabelas no momento da leitura, sem
-- tabela nova. Tres coisas matam esse desenho, e as tres sao requisito escrito:
--
--   1. **ADR-0010: nenhum UUID interno em saida publica.** Um item da caixa
--      precisa de um identificador opaco para a rota de marcar como lido. As
--      fontes nao tem: `tag_scans`, `found_reports`, `match_candidates` e
--      `alert_recipients` so tem `uuid` (ou chave composta). Derivar um `ref`
--      na leitura exigiria segredo em migracao, que o ADR-0022 proibe.
--   2. **"Lido" e por item, e persiste.** Estado de leitura precisa de linha
--      propria de qualquer forma; se ela existe, ela e a caixa.
--   3. **O contador.** Ele e lido em toda abertura de tela. Nove juncoes com
--      `pets`, `lost_cases` e `network_events` por contador seria o caminho
--      mais quente do produto pagando o preco mais alto.
--
-- Entao a caixa e uma TABELA por destinatario, preenchida por GATILHO na fonte.
-- O gatilho tambem e o que mantem esta frente fora de `src/modules/found/` e dos
-- outros modulos que nao sao dela: nada em `src/` precisou mudar para o aviso
-- nascer.
--
-- ====================================================================
-- POR QUE AS CONSULTAS SAO FUNCAO SQL, E NAO Kysely EM `src/`
-- ====================================================================
--
-- Duas das nove fontes sao alcancadas por coluna MARCADA com "NUNCA sai do
-- servidor", e `portao-colunas-que-nao-saem.ts` reprova o nome literal delas em
-- qualquer `.ts` de `src/`, inclusive em comentario:
--
--     directory_suggestions.suggested_by_user_id   (indicacao -> quem indicou)
--     network_events.created_by_user_id            (encontro -> organizador)
--
-- Escrever o destinatario desses dois em TypeScript reprovaria o portao. Mesmo
-- arranjo de `indicacao_com_autor_ativo` (`20261017000016`) e de
-- `encontro_com_autor_ativo` (`20261017000014`), e pelo mesmo motivo.
--
-- ====================================================================
-- OS TIPOS QUE ENTRAM, E OS DOIS QUE NAO TEM DE ONDE SAIR
-- ====================================================================
--
-- ENTRAM (fonte medida, destinatario derivavel):
--   tag_scanned           tag_scans.scanned_at        -> pet_tags -> pets.owner_user_id
--   found_reported        found_reports.created_at    -> pets.owner_user_id
--   match_suggested       match_candidates.created_at -> lost_cases.owner_user_id
--   neighborhood_alert    alert_recipients.user_id    (destinatario EXPLICITO)
--   event_join_requested  network_event_join_requests.requested_at -> organizador
--   event_join_decided    network_event_join_requests.decided_at   -> requerente
--   event_cancelled       network_events.cancelled_at -> aprovados do encontro
--   suggestion_decided    directory_suggestions.decided_at -> quem indicou
--   tag_request_updated   collar_tag_requests (status / delivery_state) -> requested_by
--   broadcast             comunicado, criado aqui (nao existia fonte nenhuma)
--
-- NAO ENTRAM, e as duas ausencias sao MEDIDAS e nao esquecimento:
--
--   * **evento MOVIDO.** Nao existe coluna que registre a mudanca de lugar ou de
--     hora. `starts_at` e o endereco mudam EM CIMA da linha, e a unica memoria do
--     movimento e `audit.events` com acao `admin.network_event.relocated`.
--     `audit.events` e trilha forense de ator administrativo, nao fonte de
--     produto: a porta de `audit` expoe `record`/`recordIn` para ESCREVER, e
--     nenhuma leitura de produto. Construir feed de usuario em cima da trilha
--     seria usar o registro de auditoria como tabela de aplicacao. Fica sem
--     fonte, e um aviso de "movido" exige coluna nova ou evento de produto --
--     decisao, nao conserto.
--   * **caso devolvido.** A linha EXISTE (`lost_cases.closed_at` com
--     `closure_outcome = 'reunited'`), mas nao tem destinatario de SINO: quem
--     fecha o caso e o proprio tutor, e avisa-lo do que ele mesmo acabou de
--     fazer e ruido. Para os vizinhos que receberam o alerta, a noticia e de
--     TERCEIRO e informativa -- quer dizer, Petline, pela fronteira das tres
--     caixas, e a Petline nao e desta frente.
--
--   * **"post de amigo" NAO entra no sino, por decisao de desenho ja tomada**
--     (150 conexoes a uma publicacao por semana dariam ~21 avisos por dia, e o
--     aviso da plaquinha chegaria na 22a posicao). Registrado aqui porque a
--     medicao achou algo pior do que "fica para a Petline": **nao existe tabela
--     de conexao entre pessoas neste banco.** Nao ha `connections`, `follows`
--     nem `friendships`. A Petline nao tem de onde sair tambem, e isso e
--     informacao para quem for construi-la.
--
-- ====================================================================
-- "LIDO" E O ITEM ABERTO, NAO A LISTA VISTA
-- ====================================================================
--
-- Abrir a lista ZERA O NUMERO e NAO marca os itens. Os dois efeitos sao
-- separados de proposito, e e por isso que ha duas coisas aqui:
--
--   `notification_items.read_at`        -> o item foi ABERTO (lido de verdade)
--   `notification_counter_state.zeroed_at` -> a lista foi VISTA (o numero caiu)
--
-- O contador conta item nao lido cujo `occurred_at` e POSTERIOR a `zeroed_at`.
-- Abrir a lista empurra `zeroed_at` para agora, e o numero cai sem que nenhum
-- item passe a lido.
--
-- A EXCECAO NOMEADA: plaquinha lida e achado NAO saem do contador ao abrir a
-- lista. Eles so saem quando o item e aberto. `notificacao_persiste_no_contador`
-- e o ponto unico dessa lista, e a razao e que esses dois sao os unicos cujo
-- custo de passar batido e irreversivel -- um pet na rua agora.
--
-- ====================================================================
-- AGRUPAMENTO, E OS DOIS QUE NUNCA AGRUPAM
-- ====================================================================
--
-- Uma linha por (tipo, autor quando houver, dia). Plaquinha e achado NUNCA
-- agrupam: cada um e um animal e uma acao distintos, e "2 avisos de plaquinha"
-- esconde QUAL pet. `notificacao_nunca_agrupa` e o ponto unico dessa lista.
--
-- As duas listas (nunca agrupa / persiste no contador) tem HOJE os mesmos dois
-- valores, e sao DUAS FUNCOES de proposito: sao duas regras com duas razoes
-- diferentes, e juntar as duas numa so faria a proxima mudanca de uma delas
-- mexer calada na outra.
--
-- ====================================================================
-- O COMUNICADO, E O TETO
-- ====================================================================
--
-- Comunicado e o UNICO aviso do produto com alcance total, e por isso ele tem
-- trava: papel de administrador fechado (no contrato), trilha de auditoria
-- obrigatoria (`EscritaAuditada`, que nao admite escrita sem evento) e teto de
-- TRES por dia, aqui no banco. Megafone sem trilha e o que vira incidente.
--
-- O teto e TRES e nao um nem dez: tres cabe um comunicado, a correcao dele e um
-- terceiro imprevisto no mesmo dia, e nao cabe uma sequencia que transforme o
-- sino em feed. Ele mora NA FUNCAO e nao em `src/` porque a contagem e a
-- insercao precisam ser a mesma transacao -- teto conferido antes, em outra
-- consulta, e teto que duas abas furam.
--
-- NAO HA REAUTENTICACAO POR SENHA, e a ausencia e decisao em vigor e nao
-- esquecimento: ADR-0027 emenda do item 23 (07/10/2026) diz que "as escritas do
-- painel deixam de pedir senha (reautenticacao), por decisao do cliente, com o
-- risco de sessao sequestrada aceito; a rota de reautenticacao fica obsoleta,
-- sem remover". O esquema `adminReauth` existe no contrato e ZERO operacoes o
-- declaram. Inventar reautenticacao aqui contrariaria ADR em vigor.
--
-- O comunicado NAO dispara e-mail nem push nesta fatia: ele entra na caixa.
-- Push para todo mundo e decisao do cliente, e nao foi tomada.
--
-- ====================================================================
-- CONTA DESABILITADA, NOS TRES LUGARES
-- ====================================================================
--
-- `conta_habilitada(uuid)` (`20261017000013`) e o ponto unico da definicao, e
-- ela e chamada em TRES lugares desta migracao -- listagem, contagem e marcacao
-- de lido. Filtrar em um lugar so e o defeito que a fila da Rede ja produziu:
-- o painel dizia "1 pendente" sobre fila vazia. Aqui seria pior, porque o
-- numero mora na barra de toda tela.

-- Up Migration

-- ====================================================================
-- 1. AS DUAS LISTAS DE EXCECAO, CADA UMA COM A SUA RAZAO
-- ====================================================================

CREATE FUNCTION notificacao_nunca_agrupa(p_kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('tag_scanned', 'found_reported')
$$;

COMMENT ON FUNCTION notificacao_nunca_agrupa(text) IS
  'Este tipo de aviso NUNCA se junta a outro no agrupamento por (tipo, autor, dia)? Verdadeiro para plaquinha escaneada e achado registrado, e a razao e que cada um deles e um ANIMAL e uma ACAO distintos: "2 avisos de plaquinha" esconde qual pet foi escaneado, e e justamente o pet que a pessoa precisa saber. Ponto unico da lista, chamada por caixa_de_notificacoes(uuid, integer, integer). IMMUTABLE para ser inlinada na chave de agrupamento. Irma de notificacao_persiste_no_contador(text): as duas tem hoje os mesmos dois valores e sao duas funcoes de proposito, porque sao duas regras com duas razoes, e juntar faria a mudanca de uma mexer calada na outra.';

CREATE FUNCTION notificacao_persiste_no_contador(p_kind text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_kind IN ('tag_scanned', 'found_reported')
$$;

COMMENT ON FUNCTION notificacao_persiste_no_contador(text) IS
  'Este tipo de aviso continua contando mesmo depois de a lista ter sido vista? Verdadeiro para plaquinha escaneada e achado registrado: abrir a lista zera o numero de todo o resto, mas estes dois so saem do contador quando o ITEM e aberto. A razao e o custo de passar batido -- os dois dizem que ha um pet na rua agora, e esse e o unico custo irreversivel da caixa. Ponto unico da lista, chamada por contagem_de_notificacoes(uuid). Irma de notificacao_nunca_agrupa(text), e separada dela de proposito.';

-- ====================================================================
-- 2. O `ref` OPACO (ADR-0010)
-- ====================================================================
--
-- Mesmo formato dos `ref` que ja existem em `collar_tag_requests`,
-- `directory_suggestions` e `network_event_join_requests`: 22 caracteres
-- base64url, que e `randomBytes(16).toString('base64url')` do lado de `src/`.
-- Aqui ele nasce em SQL porque quem insere e GATILHO, e nao `src/`.
--
-- `gen_random_uuid()` e builtin desde o Postgres 13 -- NAO exige `pgcrypto`,
-- que este banco nao tem (medido: `pg_extension` traz citext, fuzzystrmatch,
-- pg_trgm, plpgsql, postgis, postgis_tiger_geocoder, postgis_topology,
-- unaccent). `uuid_send` devolve os 16 bytes, e o `translate` troca o alfabeto
-- base64 pelo base64url e descarta o `=` do enchimento.

CREATE FUNCTION notificacao_ref_novo() RETURNS text
LANGUAGE sql VOLATILE AS $$
  SELECT translate(encode(uuid_send(gen_random_uuid()), 'base64'), '+/=', '-_')
$$;

COMMENT ON FUNCTION notificacao_ref_novo() IS
  'Um identificador opaco novo para um item da caixa: 22 caracteres base64url, o mesmo formato dos ref de collar_tag_requests e directory_suggestions. Existe porque ADR-0010 proibe UUID interno em saida publica e as fontes do aviso (tag_scans, found_reports, match_candidates, alert_recipients) nao tem ref proprio. Usa gen_random_uuid(), builtin do Postgres 13+, e NAO pgcrypto, que este banco nao instala.';

-- ====================================================================
-- 3. A CAIXA
-- ====================================================================

CREATE TABLE notification_items (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- O identificador que SAI. `ref` e o que a rota de marcar como lido recebe.
  ref                text        NOT NULL
                                 CONSTRAINT notification_items_ref_formato
                                 CHECK (ref ~ '^[A-Za-z0-9_-]{20,32}$'),

  -- Uma linha POR DESTINATARIO. Um alerta de vizinhanca com 40 vizinhos sao 40
  -- linhas, e e isso que faz "lido" e o contador serem por pessoa sem juncao.
  recipient_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  item_kind          text        NOT NULL
                                 CONSTRAINT notification_items_tipo_conhecido
                                 CHECK (item_kind IN (
                                   'tag_scanned', 'found_reported', 'match_suggested',
                                   'neighborhood_alert', 'event_join_requested',
                                   'event_join_decided', 'event_cancelled',
                                   'suggestion_decided', 'tag_request_updated',
                                   'broadcast')),

  -- O que a linha diz, em texto ja pronto: o nome do pet, o titulo do encontro,
  -- o nome indicado. NAO e dado de terceiro que nao pediu para estar aqui, e
  -- nao e UUID. Vem da fonte no instante do gatilho porque a fonte pode mudar
  -- depois (ou sair), e o aviso tem de continuar legivel.
  subject_label      text        CONSTRAINT notification_items_rotulo_tamanho
                                 CHECK (subject_label IS NULL
                                        OR char_length(subject_label) BETWEEN 1 AND 120),

  -- O AUTOR, quando houver, e so para AGRUPAR. Ele nao sai na resposta: o
  -- agrupamento e por (tipo, autor, dia), e sem esta coluna dois pedidos de
  -- duas pessoas diferentes no mesmo dia virariam uma linha so.
  author_user_id     uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- De onde o aviso nasceu. O par (source_kind, source_id, recipient_user_id) e
  -- unico: e ele que faz o gatilho ser idempotente e o reenvio do mesmo evento
  -- nao virar dois avisos.
  source_kind        text        NOT NULL,
  source_id          uuid        NOT NULL,

  -- QUANDO a coisa aconteceu, e nao quando a linha foi inserida: a ordem da
  -- caixa e a do fato, e a retencao de 90 dias conta do fato.
  occurred_at        timestamptz NOT NULL,

  -- O item foi ABERTO. Nulo e nao lido. Nao ha coluna de "visto": ver a lista
  -- nao e ler o item, e as duas coisas moram em lugares separados de proposito.
  read_at            timestamptz,

  created_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_items_ref_unico UNIQUE (ref),
  CONSTRAINT notification_items_um_por_destinatario
    UNIQUE (source_kind, source_id, recipient_user_id)
);

COMMENT ON TABLE notification_items IS
  'A CAIXA DE NOTIFICACOES: o conteudo do sino, uma linha por aviso e por destinatario. Materializada e preenchida por GATILHO na fonte, e nao lida como uniao de nove tabelas, por tres motivos escritos: ADR-0010 exige um ref opaco que as fontes nao tem; "lido" e por item e precisa de linha propria de qualquer forma; e o contador e lido em toda abertura de tela, onde nove juncoes seriam o caminho mais quente pagando o preco mais alto. NAO e notification_deliveries (20260919000001), que e telemetria de entrega do provedor de e-mail e nao tem destinatario. Denuncia NUNCA entra aqui: o denunciante nao recebe resultado nem prazo, e o denunciado nao e avisado.';
COMMENT ON COLUMN notification_items.ref IS
  'O identificador que SAI na resposta, 22 caracteres base64url. Nenhum UUID interno atravessa a borda (ADR-0010). Mesmo formato dos ref de collar_tag_requests e directory_suggestions.';
COMMENT ON COLUMN notification_items.author_user_id IS
  'Quem causou o aviso, quando ha alguem. Existe SO para agrupar por (tipo, autor, dia): sem ela, dois pedidos de duas pessoas no mesmo dia virariam uma linha. NAO sai na resposta -- a caixa nao tem avatar nem autor na tela, de proposito (0 KB de imagem por pagina, para nao trazer a foto a uma quarta superficie).';
COMMENT ON COLUMN notification_items.occurred_at IS
  'Quando o FATO aconteceu, e nao quando a linha nasceu. A ordem da caixa e a do fato, e a retencao de 90 dias conta dele.';
COMMENT ON COLUMN notification_items.read_at IS
  'O item foi ABERTO. Nulo e nao lido. Ver a LISTA nao marca nada: isso mora em notification_counter_state.zeroed_at, e a separacao e o requisito.';
COMMENT ON CONSTRAINT notification_items_um_por_destinatario ON notification_items IS
  'A idempotencia do gatilho. O mesmo fato para o mesmo destinatario e UM aviso: sem isto, um UPDATE que nao muda nada, ou um reenvio, viraria uma segunda linha e o contador subiria sozinho.';

-- A listagem e a contagem sempre filtram por destinatario e por janela, e
-- sempre em ordem decrescente de `occurred_at`. O indice espelha isso.
CREATE INDEX notification_items_da_caixa
  ON notification_items (recipient_user_id, occurred_at DESC);

-- O contador le so o nao lido. Indice PARCIAL: a caixa cresce para sempre (ate
-- os 90 dias), e o nao lido e uma fracao pequena dela.
CREATE INDEX notification_items_nao_lidos
  ON notification_items (recipient_user_id, occurred_at DESC)
  WHERE read_at IS NULL;

COMMENT ON INDEX notification_items_nao_lidos IS
  'O contador do sino. PARCIAL em read_at IS NULL porque e so o nao lido que ele conta, e o lido e a maioria das linhas depois do primeiro dia de uso.';

-- ====================================================================
-- 4. "A LISTA FOI VISTA" -- O ZERO DO CONTADOR
-- ====================================================================
--
-- Tabela propria e nao coluna em `users`: `users` e a tabela mais disputada
-- deste repositorio, e tres sessoes do cliente mais nove frentes empurram nela.
-- Uma coluna nova ali seria colisao garantida, e este estado nao e identidade.

CREATE TABLE notification_counter_state (
  user_id    uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  zeroed_at  timestamptz NOT NULL
);

COMMENT ON TABLE notification_counter_state IS
  'Quando esta conta viu a lista pela ultima vez. Abrir a caixa empurra zeroed_at para agora, e o contador passa a ignorar todo item anterior a isso -- SEM marcar nenhum item como lido, que e o requisito ("abrir a lista zera o numero, os itens continuam nao lidos"). A excecao mora em notificacao_persiste_no_contador(text): plaquinha e achado atravessam o zero e so saem quando o item e aberto. Tabela propria e nao coluna em users de proposito: users e a tabela mais disputada do repositorio, e este estado nao e identidade.';

-- ====================================================================
-- 5. O COMUNICADO
-- ====================================================================

CREATE TABLE notification_broadcasts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  ref                 text        NOT NULL
                                  CONSTRAINT notification_broadcasts_ref_formato
                                  CHECK (ref ~ '^[A-Za-z0-9_-]{20,32}$'),

  title               text        NOT NULL
                                  CONSTRAINT notification_broadcasts_titulo_tamanho
                                  CHECK (char_length(title) BETWEEN 2 AND 80),

  body                text        NOT NULL
                                  CONSTRAINT notification_broadcasts_corpo_tamanho
                                  CHECK (char_length(body) BETWEEN 2 AND 1000),

  -- Quem disparou. Conta do PAINEL (`admin_accounts`, ADR-0027 item 20.2), e
  -- NAO `users`: a trilha nunca mistura UUIDs de duas tabelas numa coluna.
  -- `ON DELETE RESTRICT` e deliberado: comunicado disparado fica registrado, e
  -- apagar a conta nao pode apagar de quem ele foi.
  dispatched_by_admin uuid        NOT NULL REFERENCES admin_accounts (id) ON DELETE RESTRICT,

  dispatched_at       timestamptz NOT NULL DEFAULT now(),

  -- Quantas caixas ele alcancou, no instante do disparo. Guardado e nao
  -- calculado: o numero de contas habilitadas muda depois, e a pergunta que
  -- este campo responde e "quantas pessoas viram ISTO", que e historica.
  recipients_total    integer     NOT NULL
                                  CONSTRAINT notification_broadcasts_total_nao_negativo
                                  CHECK (recipients_total >= 0),

  CONSTRAINT notification_broadcasts_ref_unico UNIQUE (ref)
);

COMMENT ON TABLE notification_broadcasts IS
  'Os COMUNICADOS disparados pelo painel -- o unico aviso do produto com alcance total. Nao ha coluna de exclusao e nao ha rota de apagar: comunicado disparado fica registrado, por requisito. Nao ha rascunho: a pre-visualizacao nao grava nada (previewAdminBroadcast nao escreve), e a linha nasce ja disparada. O teto de TRES por dia e aplicado dentro de comunicado_disparar(uuid, text, text), na mesma transacao da insercao, porque teto conferido numa consulta anterior e teto que duas abas furam. NAO dispara e-mail nem push: o comunicado entra na caixa, e push para todo mundo e decisao do cliente que nao foi tomada. SEM reautenticacao por senha -- ADR-0027 emenda do item 23 (07/10/2026) removeu a senha de TODA escrita do painel, e inventa-la aqui contrariaria ADR em vigor.';
COMMENT ON COLUMN notification_broadcasts.dispatched_by_admin IS
  'A conta do painel que disparou (admin_accounts, ADR-0027 item 20.2). ON DELETE RESTRICT: o comunicado fica, e apagar a conta nao pode apagar de quem ele foi. A trilha em audit.events e a memoria canonica; esta coluna e a que a propria listagem do painel le.';
COMMENT ON COLUMN notification_broadcasts.recipients_total IS
  'Quantas caixas o comunicado alcancou NO INSTANTE do disparo. Guardado e nao calculado: o numero de contas habilitadas muda, e a pergunta e historica -- quantas pessoas viram ISTO.';

CREATE INDEX notification_broadcasts_por_data
  ON notification_broadcasts (dispatched_at DESC);

-- ====================================================================
-- 6. OS GATILHOS -- UM POR CAMINHO DE AVISO
-- ====================================================================
--
-- Todos sao `AFTER` e todos devolvem `NULL` (gatilho de instrucao posterior nao
-- usa o valor). Todos inserem com `ON CONFLICT DO NOTHING` sobre
-- `notification_items_um_por_destinatario`: o mesmo fato para o mesmo
-- destinatario e UM aviso, e um `UPDATE` que nao mudou nada nao vira linha.
--
-- Nenhum deles avisa a PROPRIA conta do que ela mesma fez: a condicao
-- `<> NEW.<quem agiu>` aparece onde o autor e o destinatario podem coincidir.

-- 6.1 Plaquinha escaneada -> o tutor do pet.
CREATE FUNCTION notificacao_de_plaquinha_escaneada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), p.owner_user_id, 'tag_scanned', p.name,
         'tag_scan', NEW.id, NEW.scanned_at
    FROM pet_tags t
    JOIN pets p ON p.id = t.pet_id
   WHERE t.id = NEW.tag_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_plaquinha_escaneada() IS
  'Alguem escaneou a plaquinha -> aviso para o tutor do pet, com o NOME do pet no rotulo. Chega ao tutor por pets.owner_user_id, que e coluna legitima em src/. Este aviso NUNCA agrupa e NAO sai do contador ao abrir a lista (as duas excecoes nomeadas): e um pet especifico, e e o aviso cujo custo de passar batido e irreversivel.';

CREATE TRIGGER tag_scans_avisa_o_tutor
  AFTER INSERT ON tag_scans
  FOR EACH ROW
  EXECUTE FUNCTION notificacao_de_plaquinha_escaneada();

-- 6.2 Achado registrado -> o tutor do pet.
CREATE FUNCTION notificacao_de_achado_registrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- `pet_id` e ANULAVEL: `origin = 'stray_report'` e achado de bicho que ninguem
  -- reclamou ainda, e ele nao tem tutor a quem avisar. O `JOIN` ja o descarta, e
  -- essa ausencia e a resposta certa e nao um defeito.
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, author_user_id,
     source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), p.owner_user_id, 'found_reported', p.name,
         NEW.reporter_user_id, 'found_report', NEW.id, NEW.created_at
    FROM pets p
   WHERE p.id = NEW.pet_id
     AND p.owner_user_id IS DISTINCT FROM NEW.reporter_user_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_achado_registrado() IS
  'Alguem registrou um achado do pet -> aviso para o tutor. pet_id e anulavel (origin = stray_report e bicho sem tutor conhecido), e o JOIN o descarta: ausencia de destinatario e a resposta certa, nao defeito. Nao avisa quando o proprio tutor registrou o achado. NUNCA agrupa e NAO sai do contador ao abrir a lista.';

CREATE TRIGGER found_reports_avisa_o_tutor
  AFTER INSERT ON found_reports
  FOR EACH ROW
  EXECUTE FUNCTION notificacao_de_achado_registrado();

-- 6.3 Possivel correspondencia -> o tutor do caso.
CREATE FUNCTION notificacao_de_correspondencia() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), c.owner_user_id, 'match_suggested', p.name,
         'match_candidate', NEW.id, NEW.created_at
    FROM lost_cases c
    JOIN pets p ON p.id = c.pet_id
   WHERE c.id = NEW.case_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_correspondencia() IS
  'Nasceu um candidato de correspondencia para um caso de perdido -> aviso para o tutor do caso, com o nome do pet. So no INSERT: a DECISAO sobre o candidato e do proprio tutor, e avisa-lo do que ele mesmo decidiu seria ruido.';

CREATE TRIGGER match_candidates_avisa_o_tutor
  AFTER INSERT ON match_candidates
  FOR EACH ROW
  EXECUTE FUNCTION notificacao_de_correspondencia();

-- 6.4 Alerta de vizinhanca -> o vizinho notificado.
--
-- Este e o unico tipo cuja fonte ja traz o destinatario explicito
-- (`alert_recipients.user_id`), e e tambem a DUPLICACAO DELIBERADA: pet perdido
-- perto de voce aparece no sino E na Petline, porque e o unico item cujo custo
-- de ser perdido e irreversivel.
CREATE FUNCTION notificacao_de_alerta_de_vizinhanca() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), NEW.user_id, 'neighborhood_alert', p.name,
         'alert_dispatch', NEW.dispatch_id, NEW.notified_at
    FROM alert_dispatches d
    JOIN lost_cases c ON c.id = d.case_id
    JOIN pets p ON p.id = c.pet_id
   WHERE d.id = NEW.dispatch_id
     AND c.owner_user_id <> NEW.user_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_alerta_de_vizinhanca() IS
  'Um pet sumiu perto desta conta -> aviso para o vizinho notificado. Unico tipo cuja fonte ja traz o destinatario explicito (alert_recipients.user_id). E a DUPLICACAO DELIBERADA da fronteira das tres caixas: este item aparece no sino E na Petline, e e o unico que aparece nas duas, porque e o unico cujo custo de ser perdido e irreversivel. source_id e o dispatch e nao a linha de alert_recipients, que tem chave composta -- com o destinatario na chave de unicidade, um disparo por vizinho continua sendo um aviso por vizinho. Nao avisa o proprio tutor, que e quem abriu o caso.';

CREATE TRIGGER alert_recipients_avisa_o_vizinho
  AFTER INSERT ON alert_recipients
  FOR EACH ROW
  EXECUTE FUNCTION notificacao_de_alerta_de_vizinhanca();

-- 6.5 Pedido de participacao em encontro -> o ORGANIZADOR.
--
-- O destinatario e `network_events.created_by_user_id`, coluna MARCADA com
-- "NUNCA sai do servidor". E por isso que este caminho e funcao SQL e nao
-- Kysely: o nome dela em `.ts` reprovaria `portao-colunas-que-nao-saem.ts`.
-- Encontro do painel nao tem autor de usuario (`created_by_admin_id`), e o
-- `WHERE` o descarta: nao ha caixa de notificacoes para conta de painel.
CREATE FUNCTION notificacao_de_pedido_de_participacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, author_user_id,
     source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), e.created_by_user_id, 'event_join_requested', e.title,
         NEW.user_id, 'event_join_request', NEW.id, NEW.requested_at
    FROM network_events e
   WHERE e.id = NEW.event_id
     AND e.created_by_user_id IS NOT NULL
     AND e.created_by_user_id <> NEW.user_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_pedido_de_participacao() IS
  'Alguem pediu para participar de um encontro da comunidade -> aviso para o ORGANIZADOR. Existe como FUNCAO porque o destinatario e network_events.created_by_user_id, que leva a marca NUNCA sai do servidor e portao-colunas-que-nao-saem.ts varre todo .ts de src/ pelo nome literal dela, inclusive em comentario. Encontro criado pelo painel tem created_by_admin_id e nao autor de usuario: o WHERE o descarta, porque conta de painel nao tem caixa de notificacoes. O autor do pedido vai em author_user_id so para agrupar -- dois pedidos de duas pessoas no mesmo dia nao podem virar uma linha.';

CREATE TRIGGER join_requests_avisa_o_organizador
  AFTER INSERT ON network_event_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION notificacao_de_pedido_de_participacao();

-- 6.6 Resposta do pedido -> o REQUERENTE.
CREATE FUNCTION notificacao_de_resposta_ao_pedido() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), NEW.user_id, 'event_join_decided', e.title,
         'event_join_decision', NEW.id, NEW.decided_at
    FROM network_events e
   WHERE e.id = NEW.event_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_resposta_ao_pedido() IS
  'O organizador aprovou ou recusou o pedido -> aviso para quem pediu. source_kind e event_join_decision e nao event_join_request de proposito: o pedido e a resposta sao DOIS avisos sobre a MESMA linha, para pessoas diferentes, e com a mesma chave de origem o segundo cairia no ON CONFLICT do primeiro quando organizador e requerente fossem a mesma conta.';

CREATE TRIGGER join_requests_avisa_o_requerente
  AFTER UPDATE OF status ON network_event_join_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status IN ('approved', 'declined'))
  EXECUTE FUNCTION notificacao_de_resposta_ao_pedido();

-- 6.7 Encontro cancelado -> quem tinha pedido aprovado.
CREATE FUNCTION notificacao_de_encontro_cancelado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), r.user_id, 'event_cancelled', NEW.title,
         'event_cancellation', NEW.id, COALESCE(NEW.cancelled_at, now())
    FROM network_event_join_requests r
   WHERE r.event_id = NEW.id
     AND r.status = 'approved'
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_encontro_cancelado() IS
  'O encontro foi cancelado -> aviso para quem tinha pedido APROVADO. Nao avisa quem foi recusado nem quem so olhou: a caixa do sino e o que e dirigido a voce e acionavel, e quem nao ia nao tem o que fazer com isto. NAO HA par para "encontro MOVIDO": nao existe coluna que registre mudanca de lugar ou de hora -- starts_at e o endereco mudam em cima da linha, e a unica memoria do movimento e audit.events com acao admin.network_event.relocated, que e trilha forense de ator administrativo e nao fonte de produto. Um aviso de movido exige coluna nova ou evento de produto, e isso e decisao.';

CREATE TRIGGER network_events_avisa_o_cancelamento
  AFTER UPDATE OF publication_status ON network_events
  FOR EACH ROW
  WHEN (OLD.publication_status <> 'cancelled' AND NEW.publication_status = 'cancelled')
  EXECUTE FUNCTION notificacao_de_encontro_cancelado();

-- 6.8 Indicacao decidida -> quem indicou.
--
-- `directory_suggestions.suggested_by_user_id` tambem leva a marca "NUNCA sai do
-- servidor", e este e o segundo motivo de o caminho ser SQL.
CREATE FUNCTION notificacao_de_indicacao_decidida() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  VALUES (notificacao_ref_novo(), NEW.suggested_by_user_id, 'suggestion_decided',
          NEW.display_name, 'directory_suggestion', NEW.id,
          COALESCE(NEW.decided_at, now()))
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_indicacao_decidida() IS
  'A indicacao de uma entrada do diretorio foi aprovada ou recusada -> aviso para quem indicou. Existe como FUNCAO porque o destinatario e directory_suggestions.suggested_by_user_id, que leva a marca NUNCA sai do servidor e portao-colunas-que-nao-saem.ts a reprova em qualquer .ts de src/. O rotulo e o display_name SUGERIDO, que e o que a pessoa escreveu e reconhece; o motivo da recusa NAO entra na caixa -- ele e texto de revisor para o proximo revisor, e a tela da indicacao e que o mostra.';

CREATE TRIGGER directory_suggestions_avisa_quem_indicou
  AFTER UPDATE OF review_status ON directory_suggestions
  FOR EACH ROW
  WHEN (OLD.review_status = 'pending' AND NEW.review_status IN ('approved', 'declined'))
  EXECUTE FUNCTION notificacao_de_indicacao_decidida();

-- 6.9 Pedido de plaquinha mudou de estado -> quem pediu.
--
-- DOIS eixos mudam de estado e os dois interessam: `status` (a decisao do
-- painel) e `delivery_state` (a encomenda). O gatilho ouve os dois, e
-- `source_kind` carrega QUAL eixo mudou -- sem isso, a mudanca de entrega
-- cairia no `ON CONFLICT` da decisao e a pessoa nunca saberia que a plaquinha
-- saiu para entrega.
CREATE FUNCTION notificacao_de_pedido_de_plaquinha() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_eixo text;
  v_quando timestamptz;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_eixo := 'collar_tag_status_' || NEW.status;
    v_quando := COALESCE(NEW.decided_at, now());
  ELSE
    v_eixo := 'collar_tag_delivery_' || NEW.delivery_state;
    v_quando := now();
  END IF;

  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), NEW.requested_by, 'tag_request_updated', p.name,
         v_eixo, NEW.id, v_quando
    FROM pets p
   WHERE p.id = NEW.pet_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_pedido_de_plaquinha() IS
  'O pedido da plaquinha da coleira mudou de estado -> aviso para quem pediu. Ouve os DOIS eixos da 20261018000004: status (a decisao do painel) e delivery_state (a encomenda). source_kind carrega QUAL eixo e qual valor, porque com uma chave de origem so a mudanca de entrega cairia no ON CONFLICT da decisao e a pessoa nunca saberia que a plaquinha saiu para entrega. O rotulo e o nome do pet. O codigo de rastreio NAO entra na caixa: a tela do pedido o mostra, e repeti-lo aqui poria numero de encomenda numa segunda superficie sem precisar.';

CREATE TRIGGER collar_tag_requests_avisa_quem_pediu
  AFTER UPDATE OF status, delivery_state ON collar_tag_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status
        OR OLD.delivery_state IS DISTINCT FROM NEW.delivery_state)
  EXECUTE FUNCTION notificacao_de_pedido_de_plaquinha();

-- ====================================================================
-- 7. A LEITURA DA CAIXA -- LUGAR 1 DE `conta_habilitada`
-- ====================================================================
--
-- Pagina de 30 (o `p_limite` vem do contrato), retencao de 90 dias, e
-- agrupamento por (tipo, autor, dia) com plaquinha e achado de fora.
--
-- `total_de_grupos` sai em toda linha, repetido, porque a pagina precisa do
-- total para o rodape e uma segunda consulta para conta-lo poderia discordar
-- da primeira. Mesma forma das outras paginacoes do painel.
--
-- NAO projeta `author_user_id`: ele e parametro de agrupamento, nunca saida. E
-- nao projeta `id`: ADR-0010, o UUID interno nao atravessa a borda.

CREATE FUNCTION caixa_de_notificacoes(
  p_usuario uuid,
  p_pagina  integer,
  p_limite  integer
)
RETURNS TABLE (
  ref             text,
  item_kind       text,
  subject_label   text,
  occurred_at     timestamptz,
  lida            boolean,
  agrupados       integer,
  total_de_grupos bigint
)
LANGUAGE sql STABLE AS $$
  WITH visiveis AS (
    SELECT i.id,
           i.ref,
           i.item_kind,
           i.subject_label,
           i.occurred_at,
           i.read_at,
           CASE
             WHEN notificacao_nunca_agrupa(i.item_kind) THEN i.id::text
             ELSE i.item_kind
                  || ':' || COALESCE(i.author_user_id::text, '-')
                  || ':' || to_char(date_trunc('day', i.occurred_at), 'YYYY-MM-DD')
           END AS chave
      FROM notification_items i
     WHERE i.recipient_user_id = p_usuario
       AND i.occurred_at > now() - interval '90 days'
       AND conta_habilitada(p_usuario)
  ),
  grupos AS (
    SELECT v.chave,
           count(*)::integer AS agrupados,
           max(v.occurred_at) AS ultimo
      FROM visiveis v
     GROUP BY v.chave
  ),
  linhas AS (
    SELECT DISTINCT ON (g.chave)
           v.ref,
           v.item_kind,
           v.subject_label,
           v.occurred_at,
           (v.read_at IS NOT NULL) AS lida,
           g.agrupados
      FROM grupos g
      JOIN visiveis v
        ON v.chave = g.chave
       AND v.occurred_at = g.ultimo
     ORDER BY g.chave, v.id
  )
  SELECT l.ref,
         l.item_kind,
         l.subject_label,
         l.occurred_at,
         l.lida,
         l.agrupados,
         (SELECT count(*) FROM grupos) AS total_de_grupos
    FROM linhas l
   ORDER BY l.occurred_at DESC, l.ref
   LIMIT p_limite
  OFFSET (p_pagina - 1) * p_limite
$$;

COMMENT ON FUNCTION caixa_de_notificacoes(uuid, integer, integer) IS
  'UMA PAGINA DA CAIXA DE NOTIFICACOES, ja agrupada. Devolve TABELA e nao json porque a rota projeta campo a campo. AGRUPAMENTO por (tipo, autor, dia): uma linha por combinacao por dia, com agrupados dizendo quantos avisos ela resume. Plaquinha e achado NUNCA agrupam -- a chave deles e o proprio id --, e o ponto unico dessa regra e notificacao_nunca_agrupa(text): "2 avisos de plaquinha" esconderia qual pet. RETENCAO de 90 dias, contada de occurred_at (o fato) e nao de created_at (a linha). A AUTORIZACAO E O PROPRIO WHERE: nao ha caminho por aqui para a caixa de outra conta, e por isso a rota responde 404 e nunca 403 (ADR-0021). Conta desabilitada devolve ZERO linhas, delegando a conta_habilitada(uuid) (20261017000013) -- este e o LUGAR 1 dos tres, e filtrar em um lugar so e o defeito que a fila da Rede produziu ("1 pendente" sobre fila vazia). NAO projeta author_user_id (parametro de agrupamento, nunca saida) nem id (ADR-0010). Nao devolve imagem nenhuma, de proposito: 0 KB por pagina, para nao trazer a foto do pet a uma quarta superficie.';

-- ====================================================================
-- 8. O CONTADOR -- LUGAR 2 DE `conta_habilitada`
-- ====================================================================
--
-- Conta ITENS nao lidos, e nao grupos: "contador de nao lidos" e o numero de
-- avisos que a pessoa ainda nao abriu, e um grupo de tres nao lidos sao tres.
--
-- O TETO DE EXIBICAO (`9+`) NAO ESTA AQUI. Esta funcao devolve o numero
-- inteiro, e quem o recorta e a barra -- tres digitos comem o espaco do titulo,
-- mas isso e regra de desenho da barra e nao do banco, e um `LEAST(n, 10)` aqui
-- apagaria a diferenca entre 10 e 400 para quem for medir uso depois.

CREATE FUNCTION contagem_de_notificacoes(p_usuario uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
    FROM notification_items i
   WHERE i.recipient_user_id = p_usuario
     AND i.read_at IS NULL
     AND i.occurred_at > now() - interval '90 days'
     AND conta_habilitada(p_usuario)
     AND (
       notificacao_persiste_no_contador(i.item_kind)
       OR i.occurred_at > COALESCE(
            (SELECT s.zeroed_at FROM notification_counter_state s WHERE s.user_id = p_usuario),
            '-infinity'::timestamptz)
     )
$$;

COMMENT ON FUNCTION contagem_de_notificacoes(uuid) IS
  'O NUMERO DO SINO: quantos avisos esta conta ainda nao abriu. Conta ITENS e nao grupos -- um grupo de tres nao lidos sao tres avisos nao lidos. A REGRA DO ZERO: abrir a lista empurra notification_counter_state.zeroed_at para agora, e todo item anterior a isso para de contar SEM virar lido; a EXCECAO e notificacao_persiste_no_contador(text), que mantem plaquinha e achado contando atraves do zero, porque esses dois dizem que ha um pet na rua agora. Conta desabilitada devolve ZERO, delegando a conta_habilitada(uuid) -- LUGAR 2 dos tres, e o que impede o sino de exibir numero sobre caixa vazia. NAO recorta em 9+: o teto de exibicao e regra da barra, e LEAST aqui apagaria a diferenca entre 10 e 400 para quem for medir uso.';

-- ====================================================================
-- 9. MARCAR LIDO -- LUGAR 3 DE `conta_habilitada`
-- ====================================================================

CREATE FUNCTION notificacao_marcar_lida(p_usuario uuid, p_ref text) RETURNS boolean
LANGUAGE sql VOLATILE AS $$
  UPDATE notification_items
     SET read_at = COALESCE(read_at, now())
   WHERE recipient_user_id = p_usuario
     AND ref = p_ref
     AND conta_habilitada(p_usuario)
  RETURNING true
$$;

COMMENT ON FUNCTION notificacao_marcar_lida(uuid, text) IS
  'Marca UM item da caixa como lido, e devolve VERDADEIRO quando ele existia para esta conta. COALESCE e nao read_at IS NULL no WHERE: marcar duas vezes e idempotente e nao pode virar 404 na segunda, porque o aparelho reenvia. A AUTORIZACAO E O PROPRIO WHERE: o item de outra conta nao e encontrado, a funcao devolve NULO e a rota responde 404 e NUNCA 403 (ADR-0021) -- um 403 confirmaria que o ref existe. Conta desabilitada nao marca nada, delegando a conta_habilitada(uuid) -- LUGAR 3 dos tres.';

CREATE FUNCTION notificacoes_marcar_todas_lidas(p_usuario uuid) RETURNS integer
LANGUAGE sql VOLATILE AS $$
  WITH marcadas AS (
    UPDATE notification_items
       SET read_at = now()
     WHERE recipient_user_id = p_usuario
       AND read_at IS NULL
       AND occurred_at > now() - interval '90 days'
       AND conta_habilitada(p_usuario)
    RETURNING 1
  )
  SELECT count(*)::integer FROM marcadas
$$;

COMMENT ON FUNCTION notificacoes_marcar_todas_lidas(uuid) IS
  '"Marcar todas como lidas", explicito, e devolve quantas foram. Existe como acao PROPRIA e nao como efeito de abrir a lista: abrir a lista zera o NUMERO e deixa os itens nao lidos, e sem esta funcao nao haveria como limpar de verdade uma caixa grande -- inclusive a plaquinha e o achado, que atravessam o zero do contador de proposito. Respeita a mesma janela de 90 dias da listagem: nao mexe no que a caixa nao mostra mais.';

CREATE FUNCTION notificacoes_lista_vista(p_usuario uuid) RETURNS void
LANGUAGE sql VOLATILE AS $$
  INSERT INTO notification_counter_state (user_id, zeroed_at)
  SELECT p_usuario, now()
   WHERE conta_habilitada(p_usuario)
  ON CONFLICT (user_id) DO UPDATE SET zeroed_at = now()
$$;

COMMENT ON FUNCTION notificacoes_lista_vista(uuid) IS
  'A lista foi aberta: zera o NUMERO sem marcar item nenhum. E operacao PROPRIA e nao efeito da listagem porque a listagem e GET, e GET que escreve e GET que nao pode ser repetido nem cacheado -- separar as duas e o que torna "abrir a lista nao marca os itens" verificavel em teste.';

-- ====================================================================
-- 10. DISPARAR O COMUNICADO -- COM O TETO NA MESMA TRANSACAO
-- ====================================================================

CREATE FUNCTION comunicado_disparar(
  p_admin  uuid,
  p_titulo text,
  p_corpo  text
)
RETURNS TABLE (ref text, destinatarios integer)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_hoje  integer;
  v_ref   text;
  v_id    uuid;
  v_total integer;
BEGIN
  -- O TETO: tres por dia. `FOR SHARE` nao serve aqui (nao ha linha a travar
  -- quando a contagem e zero), e por isso o teto e conferido DENTRO da mesma
  -- transacao da insercao -- duas abas em paralelo serializam no `INSERT`.
  SELECT count(*)::integer INTO v_hoje
    FROM notification_broadcasts b
   WHERE b.dispatched_at >= date_trunc('day', now());

  IF v_hoje >= 3 THEN
    RETURN;
  END IF;

  v_ref := notificacao_ref_novo();

  INSERT INTO notification_broadcasts
    (ref, title, body, dispatched_by_admin, recipients_total)
  VALUES (v_ref, p_titulo, p_corpo, p_admin, 0)
  RETURNING id INTO v_id;

  -- A ABERTURA EM LEQUE. Uma linha por conta habilitada: e isso que faz o
  -- comunicado ter estado de leitura e contador por pessoa, como qualquer outro
  -- aviso, em vez de um caso especial na leitura.
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), u.id, 'broadcast', p_titulo,
         'broadcast', v_id, now()
    FROM users u
   WHERE u.deleted_at IS NULL
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario DO NOTHING;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  UPDATE notification_broadcasts SET recipients_total = v_total WHERE id = v_id;

  RETURN QUERY SELECT v_ref, v_total;
END
$$;

COMMENT ON FUNCTION comunicado_disparar(uuid, text, text) IS
  'Dispara um COMUNICADO: grava a linha em notification_broadcasts e abre em leque uma notificacao por conta habilitada. Devolve ZERO LINHAS quando o TETO DE TRES POR DIA ja foi atingido, e a rota traduz isso em recusa -- excecao nao serve, porque limite de produto nao e erro de banco. O teto mora AQUI e nao em src/ porque a contagem e a insercao tem de ser a mesma transacao: teto conferido numa consulta anterior e teto que duas abas furam. Tres e nao um nem dez -- cabe um comunicado, a correcao dele e um imprevisto no mesmo dia, e nao cabe sequencia que transforme o sino em feed. A abertura em leque usa users.deleted_at direto, e nao conta_habilitada(uuid), porque aqui o filtro e sobre o CONJUNTO e nao sobre uma conta: conta_habilitada recebe um uuid e devolve VERDADEIRO para nulo, o que num SELECT de todas as contas nao e o recorte certo. NAO dispara e-mail nem push.';

-- Down Migration

DROP FUNCTION IF EXISTS comunicado_disparar(uuid, text, text);
DROP FUNCTION IF EXISTS notificacoes_lista_vista(uuid);
DROP FUNCTION IF EXISTS notificacoes_marcar_todas_lidas(uuid);
DROP FUNCTION IF EXISTS notificacao_marcar_lida(uuid, text);
DROP FUNCTION IF EXISTS contagem_de_notificacoes(uuid);
DROP FUNCTION IF EXISTS caixa_de_notificacoes(uuid, integer, integer);

DROP TRIGGER IF EXISTS collar_tag_requests_avisa_quem_pediu ON collar_tag_requests;
DROP FUNCTION IF EXISTS notificacao_de_pedido_de_plaquinha();
DROP TRIGGER IF EXISTS directory_suggestions_avisa_quem_indicou ON directory_suggestions;
DROP FUNCTION IF EXISTS notificacao_de_indicacao_decidida();
DROP TRIGGER IF EXISTS network_events_avisa_o_cancelamento ON network_events;
DROP FUNCTION IF EXISTS notificacao_de_encontro_cancelado();
DROP TRIGGER IF EXISTS join_requests_avisa_o_requerente ON network_event_join_requests;
DROP FUNCTION IF EXISTS notificacao_de_resposta_ao_pedido();
DROP TRIGGER IF EXISTS join_requests_avisa_o_organizador ON network_event_join_requests;
DROP FUNCTION IF EXISTS notificacao_de_pedido_de_participacao();
DROP TRIGGER IF EXISTS alert_recipients_avisa_o_vizinho ON alert_recipients;
DROP FUNCTION IF EXISTS notificacao_de_alerta_de_vizinhanca();
DROP TRIGGER IF EXISTS match_candidates_avisa_o_tutor ON match_candidates;
DROP FUNCTION IF EXISTS notificacao_de_correspondencia();
DROP TRIGGER IF EXISTS found_reports_avisa_o_tutor ON found_reports;
DROP FUNCTION IF EXISTS notificacao_de_achado_registrado();
DROP TRIGGER IF EXISTS tag_scans_avisa_o_tutor ON tag_scans;
DROP FUNCTION IF EXISTS notificacao_de_plaquinha_escaneada();

DROP TABLE IF EXISTS notification_broadcasts;
DROP TABLE IF EXISTS notification_counter_state;
DROP TABLE IF EXISTS notification_items;

DROP FUNCTION IF EXISTS notificacao_ref_novo();
DROP FUNCTION IF EXISTS notificacao_persiste_no_contador(text);
DROP FUNCTION IF EXISTS notificacao_nunca_agrupa(text);
