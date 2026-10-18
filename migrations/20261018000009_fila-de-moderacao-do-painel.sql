-- A FILA DE MODERACAO DO PAINEL: quem modera e o administrador.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE
-- ====================================================================
--
-- Decisao do cliente de 18/10/2026, literal: "quem modera vai ser o
-- administrador, deve ir para a pagina de backoffice".
--
-- O estado medido antes de escrever uma linha disto:
--
--   1. `conversation_reports` existe desde a `20260928000009` e GRAVA
--      denuncia. **Nenhuma rota do painel a resolve.** Nenhuma rota a LE: a
--      tabela tem `resolved_at` desde o primeiro dia e nada no produto
--      escreve nessa coluna;
--   2. `professional_review_reports` existe desde a `20261017000017` e grava
--      a denuncia de avaliacao do `Perto`. A REMOCAO pelo administrador
--      existe (`removeAdminDirectoryReview`), e e exclusao logica com motivo
--      obrigatorio na trilha -- mas ela se enderecava pelo `ref` que o
--      administrador tirava da pagina publica do local, porque **nao havia
--      fila navegavel**. O cabecalho daquela rota diz isso por extenso: "a
--      fila de moderacao navegavel e a continuacao natural e nao cabia aqui";
--   3. `human_work` e CITADA na `20260928000009` ("a denuncia vai para uma
--      fila que uma pessoa le") e **nunca foi criada**. O nome vive hoje so
--      como `x-effects` do contrato, que e marcador de esteira e nao tabela.
--
-- Esta migracao nao cria tabela de fila nenhuma, e a ausencia e a decisao
-- central do arquivo -- ver a secao da VISAO, abaixo.
--
-- ====================================================================
-- NAO HA TABELA NOVA DE FILA, E ISSO E DELIBERADO
-- ====================================================================
--
-- A saida obvia era `moderation_reports`: uma tabela unica, com `origin`,
-- `target_id` e `reason`, e as duas tabelas existentes migrando para dentro
-- dela. Ela foi recusada por tres motivos medidos:
--
-- 1. **Mover dado exige reescrever quem grava.** Os dois caminhos de escrita
--    estao em modulos diferentes (`messaging` e `professionals`), e tres
--    outras frentes mexem neles hoje. Uma tabela nova obrigaria a trocar os
--    dois `INSERT` no mesmo commit, e uma mescla perdida ali deixaria denuncia
--    sendo gravada em tabela que ninguem le -- que e exatamente o defeito que
--    esta frente existe para consertar;
--
-- 2. **Os dois alvos nao tem a mesma forma, e forcar uma perde regra.** A
--    denuncia de avaliacao tem `reporter_user_id` (a rota exige conta) e
--    indice unico INCONDICIONAL por (avaliacao, denunciante). A denuncia de
--    conversa nao tem coluna de usuario nenhuma -- o achador pode nao ter
--    conta -- e o unico e PARCIAL por (conversa, papel) com `resolved_at IS
--    NULL`. Os dois unicos sao diferentes de proposito, cada um com o seu
--    paragrafo de justificativa na migracao que o criou. Uma tabela unica
--    precisaria escolher um dos dois e revogaria a outra decisao em silencio;
--
-- 3. **A pergunta da fila nao e por linha de denuncia, e por ALVO.** "Quantas
--    denuncias o mesmo alvo tem" e o sinal que separa briga de problema real,
--    e ele se responde agregando, nao normalizando.
--
-- O que esta migracao faz, entao:
--
--   - acrescenta **a DECISAO** as duas tabelas de denuncia que ja existem
--     (`resolution` e `resolution_reason`), porque nenhuma das duas tinha onde
--     guardar o que o administrador decidiu nem por que;
--   - acrescenta a **remocao logica da conversa** em `conversations`, porque a
--     avaliacao ja tinha a sua (`status` + `moderation_reason`) e a conversa
--     nao tinha nenhuma;
--   - cria uma **VISAO** que junta as origens numa fila so;
--   - cria o predicado de **conta desabilitada** de cada origem, como funcao.
--
-- ====================================================================
-- A VISAO `fila_de_moderacao` E O PONTO DE EXTENSAO
-- ====================================================================
--
-- Uma fila, as origens que existem, e o desenho pronto para as que vem.
--
-- HOJE a visao tem DUAS pernas: `review` (denuncia de avaliacao do `Perto`) e
-- `conversation` (denuncia de conversa mediada). Acrescentar denuncia de
-- PERFIL e de FOTO, que vem na frente de comunidade, custa:
--
--   1. a tabela da denuncia nova, com as mesmas cinco colunas de decisao que
--      as duas existentes agora tem;
--   2. **uma perna de `UNION ALL` aqui**, com o mesmo contrato de colunas;
--   3. um valor no `enum` `ModerationOrigin` do contrato e um rotulo na tela.
--
-- Nenhum dos tres mexe em `src/`: a consulta da fila le a visao, e nao as
-- tabelas. **Isto e desenho declarado e nao construido** -- nao ha tabela de
-- denuncia de perfil nem de foto neste repositorio, e esta migracao nao cria
-- nenhuma. O que ela garante e que a terceira origem nao exija reescrever a
-- fila.
--
-- A visao nao agrega: ela devolve UMA LINHA POR DENUNCIA. A agregacao por
-- alvo mora na consulta de `src/`, porque e la que o recorte da pagina e a
-- ordem da fila sao decididos, e uma visao agregada obrigaria a reagrupar
-- por cima do grupo para contar a pagina.
--
-- ====================================================================
-- NENHUMA ACAO SOBRE A CONTA DA PESSOA, E A AUSENCIA E ESTRUTURAL
-- ====================================================================
--
-- Esta migracao nao escreve, nao le e nao referencia `users.deleted_at` em
-- caminho de escrita nenhum. Desabilitar conta e outro poder: ele mora em
-- `src/bin/conta-admin.ts` para a conta do painel e no caminho de privacidade
-- para a conta do app, com eventos de trilha proprios
-- (`admin.account.disabled`, `privacy.account_deletion_requested`). Juntar os
-- dois poderes nesta fila faria o clique mais facil do painel ser o de maior
-- consequencia do produto.
--
-- ====================================================================
-- NENHUMA NOTIFICACAO, E ISSO TAMBEM E ESTRUTURAL
-- ====================================================================
--
-- Nao ha coluna de aviso, nao ha gatilho e nao ha fila de envio aqui. O
-- denunciante NAO recebe resultado e o denunciado NAO e avisado -- avisar o
-- denunciado e retaliacao, e e decisao de desenho ja tomada. `resolution` e
-- `resolution_reason` nao saem para o aplicativo em resposta nenhuma; sao do
-- administrador e de quem auditar.
--
-- ====================================================================
-- OS `CHECK` SAO DE UMA VIA, PELO MOTIVO DA `20261017000016`
-- ====================================================================
--
-- `ALTER TABLE ... ADD CONSTRAINT` valida a tabela INTEIRA. Um bicondicional
-- (`(resolved_at IS NOT NULL) = (resolution IS NOT NULL)`) REPROVARIA a
-- propria subida em qualquer banco que ja tenha uma linha com `resolved_at`
-- preenchido -- e `resolved_at` existe nas duas tabelas desde o primeiro dia
-- delas. Esta sessao nao consegue inspecionar os bancos de desenvolvimento dos
-- outros agentes, e uma reprovacao ali TRAVA O BANCO para todas as migracoes
-- seguintes pelo `checkOrder` do node-pg-migrate.
--
-- A forma de uma via -- `resolution IS NULL OR resolved_at IS NOT NULL` -- nao
-- pode reprovar sobre linha pre-existente, porque a coluna nova nasce nula em
-- todas elas. Ela so proibe o estado novo.
--
-- O que a forma de uma via NAO garante e "resolvida TEM decisao e motivo".
-- Isso e garantido por quem escreve: as duas unicas escritas sao as rotas
-- `/removal` e `/dismissal`, com `reason` obrigatorio no corpo do contrato, e
-- nao ha outro caminho de escrita para estas colunas.
--
-- `RAISE NOTICE` nao serve de aviso neste projeto: o `node-pg-migrate`
-- descarta `NOTICE`/`WARNING` e ninguem le.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. A REMOCAO LOGICA DA CONVERSA
-- ---------------------------------------------------------------------------
-- A avaliacao ja tinha a sua: `professional_reviews.status = 'removed'` com
-- `moderation_reason` obrigatorio por `CHECK` cruzado (`20261017000017`). A
-- CONVERSA nao tinha nenhuma -- `blocked_at` e acao de um dos dois lados
-- (BICHUS-40), `closed_at` e encerramento, e `held_for_review_at` e a retencao
-- automatica, que e de outro assunto e e invisivel aos dois lados.
--
-- **Nao e `DELETE` e nunca sera**: `conversation_messages` continua inteira, e
-- o texto redigido continua gravado. O que estas duas colunas fazem e tirar a
-- conversa das LEITURAS dos dois lados -- quatro clausulas `WHERE` em
-- `kysely-conversation-repository.ts`.
--
-- **Nao ha coluna de quem removeu.** Quem removeu esta na trilha
-- (`admin.moderation_report.content_removed`, ator `admin`), que e onde a
-- autoria administrativa mora e onde ela sobrevive a exclusao de conta. Uma
-- segunda copia aqui seria uma segunda fonte para a mesma pergunta.
ALTER TABLE conversations
  ADD COLUMN moderation_removed_at timestamptz,

  ADD COLUMN moderation_reason text
      CONSTRAINT conversations_moderation_reason_tamanho
      CHECK (moderation_reason IS NULL
             OR char_length(moderation_reason) BETWEEN 3 AND 500);

ALTER TABLE conversations
  ADD CONSTRAINT conversations_remocao_tem_motivo
      CHECK (moderation_removed_at IS NULL OR moderation_reason IS NOT NULL),

  ADD CONSTRAINT conversations_motivo_so_na_remocao
      CHECK (moderation_reason IS NULL OR moderation_removed_at IS NOT NULL);

COMMENT ON COLUMN conversations.moderation_removed_at IS
  'Quando o administrador removeu a conversa pela fila de moderacao, ou nulo. Exclusao LOGICA: conversation_messages continua inteira e nada e apagado -- a trilha aponta para esta conversa, e trilha que aponta para linha apagada nao e trilha. O que esta coluna faz e tirar a conversa das leituras dos dois lados. Nao e blocked_at (acao de um dos lados, BICHUS-40), nao e closed_at (encerramento) e nao e held_for_review_at (retencao automatica, invisivel aos dois lados).';

COMMENT ON COLUMN conversations.moderation_reason IS
  'O motivo escrito por quem removeu. Obrigatorio quando ha remocao, cobrado pelo CHECK conversations_remocao_tem_motivo: e a diferenca entre moderacao e arbitrio. NUNCA sai para o aplicativo -- nenhuma leitura de conversa projeta esta coluna, e o denunciado nao e avisado (avisar e retaliacao, decisao de desenho ja tomada). Vai para a trilha, que e de quem audita.';

-- ---------------------------------------------------------------------------
-- 2. A DECISAO DO ADMINISTRADOR, nas DUAS tabelas de denuncia
-- ---------------------------------------------------------------------------
-- As duas ja tinham `resolved_at` ("nulo e na fila") e nenhuma das duas tinha
-- onde guardar O QUE foi decidido nem POR QUE. Sem `resolution`, uma denuncia
-- descartada e uma denuncia cujo conteudo foi removido ficariam
-- indistinguiveis -- as duas com `resolved_at` preenchido --, e e justamente
-- essa diferenca que alguem vai querer contar depois.
--
-- **Dois valores, e nao tres.** Nao ha `escalated` nem `pending_review`: a
-- fila tem um estado de espera (`resolved_at IS NULL`) e dois de saida, e um
-- terceiro valor convidaria a primeira pessoa com pressa a inventar um fluxo
-- que ninguem desenhou.
ALTER TABLE professional_review_reports
  ADD COLUMN resolution text
      CONSTRAINT professional_review_reports_resolution_conhecida
      CHECK (resolution IS NULL OR resolution IN ('content_removed', 'dismissed')),

  ADD COLUMN resolution_reason text
      CONSTRAINT professional_review_reports_resolution_reason_tamanho
      CHECK (resolution_reason IS NULL
             OR char_length(resolution_reason) BETWEEN 3 AND 500);

ALTER TABLE professional_review_reports
  ADD CONSTRAINT professional_review_reports_decisao_depois_de_resolver
      CHECK (resolution IS NULL OR resolved_at IS NOT NULL),

  ADD CONSTRAINT professional_review_reports_motivo_com_decisao
      CHECK (resolution_reason IS NULL OR resolution IS NOT NULL);

COMMENT ON COLUMN professional_review_reports.resolution IS
  'content_removed | dismissed, ou nulo enquanto na fila. Sem esta coluna, denuncia descartada e denuncia cujo conteudo foi removido ficariam indistinguiveis -- as duas com resolved_at preenchido --, e e essa diferenca que alguem vai querer contar. Dois valores e nao tres: a fila tem um estado de espera e dois de saida. DESCARTAR NAO APAGA A DENUNCIA: a linha fica, com a decisao e o motivo.';

COMMENT ON COLUMN professional_review_reports.resolution_reason IS
  'O motivo da decisao, escrito pelo administrador PARA QUEM AUDITAR e para o proximo moderador. Obrigatorio nas duas acoes pelo corpo do contrato (minLength 3), e nao por CHECK -- ver o cabecalho da 20261018000009, que explica por que o CHECK e de uma via. Nao e publicado, nao chega a quem denunciou e nao chega a quem foi denunciado.';

ALTER TABLE conversation_reports
  ADD COLUMN resolution text
      CONSTRAINT conversation_reports_resolution_conhecida
      CHECK (resolution IS NULL OR resolution IN ('content_removed', 'dismissed')),

  ADD COLUMN resolution_reason text
      CONSTRAINT conversation_reports_resolution_reason_tamanho
      CHECK (resolution_reason IS NULL
             OR char_length(resolution_reason) BETWEEN 3 AND 500);

ALTER TABLE conversation_reports
  ADD CONSTRAINT conversation_reports_decisao_depois_de_resolver
      CHECK (resolution IS NULL OR resolved_at IS NOT NULL),

  ADD CONSTRAINT conversation_reports_motivo_com_decisao
      CHECK (resolution_reason IS NULL OR resolution IS NOT NULL);

COMMENT ON COLUMN conversation_reports.resolution IS
  'content_removed | dismissed, ou nulo enquanto na fila. Mesma forma e mesmo motivo de professional_review_reports.resolution. ATENCAO ao indice unico PARCIAL desta tabela (conversation_reports_uma_aberta_por_lado, WHERE resolved_at IS NULL): resolver LIBERA o par (conversa, papel) para uma denuncia nova, e isso e legitimo aqui -- a conversa continua, e um abuso novo depois da decisao e um item de fila novo. A tabela da avaliacao e o contrario de proposito, e a 20261017000017 explica por que.';

COMMENT ON COLUMN conversation_reports.resolution_reason IS
  'O motivo da decisao, escrito pelo administrador. Mesma regra de professional_review_reports.resolution_reason: obrigatorio pelo corpo do contrato, nao publicado, nao chega a nenhum dos dois lados.';

-- ---------------------------------------------------------------------------
-- 3. O PREDICADO DA CONTA DESABILITADA, uma funcao por origem
-- ---------------------------------------------------------------------------
-- Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
-- nenhuma pagina ou funcionalidade". A denuncia de quem desabilitou a conta
-- nao pode aparecer nesta fila -- nem na listagem, nem na leitura, nem na
-- CONTAGEM do aviso do menu. **Sao TRES lugares em `src/`**, e nao um: na fila
-- da Rede o filtro entrou primeiro so na listagem, e o painel passou a dizer
-- "1 pendente" sobre uma fila vazia; quem abria procurava um pedido que a
-- listagem nao mostrava mais. A `20261017000016` registra o episodio e a fila
-- de indicacao repete o arranjo em `kysely-fila-de-indicacoes.ts`.
--
-- **Predicado como FUNCAO, e nao expressao em TypeScript.** Duas razoes, e as
-- duas valem sozinhas:
--
--   - `src/tools/portao-colunas-que-nao-saem.ts` varre todo `.ts` de `src/`
--     pelo nome literal das colunas marcadas `NUNCA sai do servidor`,
--     inclusive em comentario. Escrever o nome de uma coluna de autoria em
--     TypeScript reprova o portao;
--   - a resolucao do denunciante da CONVERSA e por PAPEL e nao por coluna --
--     ela depende de dois `IF` sobre `reporter_role` --, e isso em Kysely
--     viraria um `CASE` escrito a mao em cada uma das tres consultas. Tres
--     copias sao tres lugares onde uma correcao pode faltar.
--
-- As duas DELEGAM para `conta_habilitada(uuid)` (`20261017000013`), que e o
-- ponto unico da definicao. Delegar, e nao copiar a regra, e o que faz esta
-- fila acompanhar quando a definicao mudar.
--
-- Denuncia que nao existe devolve FALSO, e a rota responde 404 e nunca 403
-- (ADR-0021): para esta superficie ela nao existe.

CREATE FUNCTION denuncia_de_avaliacao_com_denunciante_ativo(p_denuncia uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM professional_review_reports d
     WHERE d.id = p_denuncia
       AND conta_habilitada(d.reporter_user_id))
$$;

COMMENT ON FUNCTION denuncia_de_avaliacao_com_denunciante_ativo(uuid) IS
  'Quem denunciou esta avaliacao ainda tem conta habilitada? DELEGA para conta_habilitada(uuid) (20261017000013), que e o ponto unico da definicao. Chamada em TRES lugares da fila de moderacao -- listagem, leitura e a contagem de pending_total --, porque filtrar em um lugar so faz o painel dizer 1 pendente sobre fila vazia (defeito que a fila da Rede ja produziu). Devolve boolean: nenhuma autoria atravessa a borda. Denuncia que nao existe devolve FALSO, e a rota responde 404 e nunca 403 (ADR-0021).';

-- A CONVERSA NAO TEM COLUNA DE DENUNCIANTE, e e por isso que esta funcao e
-- maior que a irma.
--
-- `conversation_reports` nomeia o denunciante pelo PAPEL (`reporter_role`), e
-- nao por `user_id`, porque o achador pode nao ter conta -- a
-- `20260928000009` escreve isso no cabecalho: "nao ha coluna de usuario aqui".
-- O papel se resolve em conta pela conversa: `tutor` -> `tutor_user_id`,
-- `finder` -> `finder_user_id`.
--
-- `finder_user_id` E NULA no caminho principal (achador sem conta), e
-- `conta_habilitada(NULL)` devolve VERDADEIRO de proposito: "linha sem conta
-- nao e linha de conta desabilitada". A denuncia do achador anonimo PERMANECE
-- na fila, e esse e o comportamento que se quer -- ele e justamente quem nao
-- tem outro canal.
CREATE FUNCTION denuncia_de_conversa_com_denunciante_ativo(p_denuncia uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM conversation_reports d
      JOIN conversations c ON c.id = d.conversation_id
     WHERE d.id = p_denuncia
       AND conta_habilitada(
             CASE d.reporter_role
               WHEN 'tutor'  THEN c.tutor_user_id
               WHEN 'finder' THEN c.finder_user_id
             END))
$$;

COMMENT ON FUNCTION denuncia_de_conversa_com_denunciante_ativo(uuid) IS
  'Quem denunciou esta conversa ainda tem conta habilitada? Maior que a irma da avaliacao porque conversation_reports nomeia o denunciante pelo PAPEL e nao por user_id -- o achador pode nao ter conta (20260928000009). O papel se resolve em conta pela conversa. finder_user_id e NULA no caminho principal, e conta_habilitada(NULL) devolve VERDADEIRO: a denuncia do achador anonimo PERMANECE na fila, e e isso que se quer -- ele e quem nao tem outro canal. Chamada nos mesmos TRES lugares.';

-- ---------------------------------------------------------------------------
-- 4. A VISAO: uma fila, as origens que existem
-- ---------------------------------------------------------------------------
-- UMA LINHA POR DENUNCIA. A agregacao por alvo -- que e o que a tela mostra --
-- mora na consulta de `src/`, com `GROUP BY (origin, target_ref)`.
--
-- ## `target_ref` e o identificador PUBLICO do alvo, e ele difere por origem
--
-- - `review`: `professional_reviews.ref`, 22 simbolos em base64url. Ele existe
--   justamente porque `id` e UUID interno e o ADR-0010 item 6 o proibe em
--   saida publica, e a `20261017000017` o criou para "a denuncia e a remocao
--   pelo painel";
-- - `conversation`: `conversations.id`, e **nao ha violacao do ADR-0010 aqui**:
--   este UUID JA e o identificador publico da conversa no contrato em vigor
--   (`parameters/ConversationId`, usado por `getConversation`,
--   `listConversationMessages`, `blockConversation` e `reportConversation`).
--   Inventar um segundo identificador para a mesma linha seria exposicao nova,
--   e nao menos.
--
-- O `::text` nas duas pernas e o que faz o `UNION ALL` fechar com UM tipo de
-- coluna. A consulta de `src/` trata `target_ref` como cadeia opaca e nunca
-- tenta interpreta-la.
--
-- ## O CONTEUDO DENUNCIADO: a avaliacao SAI, a conversa NAO
--
-- Esta e a assimetria mais importante da visao, e ela e deliberada.
--
-- `target_body` e `target_rating` saem na perna da avaliacao porque a
-- avaliacao e **conteudo publicado**: ela esta na pagina do local, qualquer
-- pessoa a le, e quem modera precisa ler exatamente o que todo mundo esta
-- lendo para decidir.
--
-- Na perna da conversa os dois saem NULOS, e nao por esquecimento. A conversa
-- mediada e **privada entre duas pessoas**, `conversation_messages.body` e
-- texto que elas trocaram esperando que ninguem mais lesse, e
-- `docs/04-seguranca.md` 9 proibe conteudo de mensagem na trilha pelo mesmo
-- juizo. Nada neste produto autoriza o administrador a ler conversa alheia, e
-- esta migracao nao e o lugar de conceder esse poder: isso e decisao de
-- produto e de ADR, nao de esquema.
--
-- O que a perna da conversa entrega para quem decide: o MOTIVO escolhido, o
-- `detail` que o denunciante escreveu -- que e o canal desenhado para isso, e
-- e por isso que ele aceita 1000 simbolos --, a contagem de repeticao e o nome
-- do pet, que e o que identifica de qual conversa se trata sem abrir nenhuma
-- mensagem. **Esta e uma limitacao real da fila, e esta escrita aqui para
-- quem for decidir alargá-la saber que a estreiteza foi escolhida.**
--
-- ## `reporter_active` sai como BOOLEANO
--
-- Nenhuma coluna de autoria atravessa a visao. O booleano vem das funcoes
-- acima, e `src/` o usa nos tres `WHERE`.
CREATE VIEW fila_de_moderacao AS
  SELECT 'review'::text                                     AS origin,
         r.ref::text                                        AS target_ref,
         d.id                                               AS report_id,
         d.reason::text                                     AS reason,
         d.detail                                           AS detail,
         d.repeat_count                                     AS repeat_count,
         d.created_at                                       AS created_at,
         d.last_reported_at                                 AS last_reported_at,
         d.resolved_at                                      AS resolved_at,
         d.resolution                                       AS resolution,
         d.resolution_reason                                AS resolution_reason,
         denuncia_de_avaliacao_com_denunciante_ativo(d.id)  AS reporter_active,
         (r.status <> 'published')                          AS target_removed,
         r.rating                                           AS target_rating,
         r.body                                             AS target_body,
         p.display_name::text                               AS target_subject
    FROM professional_review_reports d
    JOIN professional_reviews r ON r.id = d.review_id
    JOIN professionals        p ON p.id = r.professional_id

  UNION ALL

  SELECT 'conversation'::text,
         c.id::text,
         d.id,
         d.reason::text,
         d.detail,
         d.repeat_count,
         d.created_at,
         d.last_reported_at,
         d.resolved_at,
         d.resolution,
         d.resolution_reason,
         denuncia_de_conversa_com_denunciante_ativo(d.id),
         (c.moderation_removed_at IS NOT NULL),
         -- A conversa nao tem nota, e **nao entrega o texto trocado**. Ver a
         -- secao "O CONTEUDO DENUNCIADO" no cabecalho desta secao: a
         -- assimetria e escolhida, e nao esquecida.
         NULL::integer,
         NULL::text,
         pet.name::text
    FROM conversation_reports d
    JOIN conversations c   ON c.id   = d.conversation_id
    JOIN pets          pet ON pet.id = c.pet_id;

COMMENT ON VIEW fila_de_moderacao IS
  'A FILA DE MODERACAO do painel, uma linha por denuncia, juntando as origens que existem: review (denuncia de avaliacao do Perto) e conversation (denuncia de conversa mediada, que ate 18/10/2026 era gravada e nunca lida por ninguem). Decisao do cliente de 18/10: "quem modera vai ser o administrador, deve ir para a pagina de backoffice". Acrescentar denuncia de PERFIL e de FOTO, que vem na frente de comunidade, custa uma perna de UNION ALL aqui, um valor no enum do contrato e um rotulo na tela -- e nenhuma linha de src/, porque a consulta le a visao e nao as tabelas. Isso e desenho DECLARADO e nao construido: nao existe tabela de denuncia de perfil nem de foto neste repositorio. A visao nao agrega de proposito; a agregacao por alvo mora na consulta, com GROUP BY (origin, target_ref). target_body e target_rating saem NULOS na perna da conversa porque a conversa e privada entre duas pessoas e nada neste produto autoriza o administrador a le-la -- limitacao escolhida, nao esquecida.';

-- Down Migration

-- Descer com decisao gravada APAGA a decisao de uma pessoa: `resolution` e
-- `resolution_reason` sao a unica memoria de por que aquele conteudo saiu do ar
-- ou de por que aquela denuncia nao procedia, e com ela o proximo moderador
-- refaz o juizo que alguem ja fez. Mesma forma do `down` da `20261017000016`,
-- e pelo mesmo motivo: a descida reprova em voz alta em vez de descartar
-- trabalho em silencio.
--
-- A remocao da conversa entra na mesma conferencia: descer com conversa
-- removida a traria de volta para as leituras dos dois lados, que e
-- republicar conteudo que uma pessoa decidiu tirar do ar.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM professional_review_reports WHERE resolution IS NOT NULL)
     OR EXISTS (SELECT 1 FROM conversation_reports WHERE resolution IS NOT NULL)
     OR EXISTS (SELECT 1 FROM conversations WHERE moderation_removed_at IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha decisao de moderacao gravada: reverter apagaria o motivo da decisao -- a unica memoria de por que o conteudo saiu do ar ou de por que a denuncia nao procedia -- e traria de volta conversa que alguem removeu. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

DROP VIEW IF EXISTS fila_de_moderacao;

DROP FUNCTION IF EXISTS denuncia_de_conversa_com_denunciante_ativo(uuid);
DROP FUNCTION IF EXISTS denuncia_de_avaliacao_com_denunciante_ativo(uuid);

ALTER TABLE conversation_reports
  DROP CONSTRAINT IF EXISTS conversation_reports_motivo_com_decisao,
  DROP CONSTRAINT IF EXISTS conversation_reports_decisao_depois_de_resolver,
  DROP COLUMN IF EXISTS resolution_reason,
  DROP COLUMN IF EXISTS resolution;

ALTER TABLE professional_review_reports
  DROP CONSTRAINT IF EXISTS professional_review_reports_motivo_com_decisao,
  DROP CONSTRAINT IF EXISTS professional_review_reports_decisao_depois_de_resolver,
  DROP COLUMN IF EXISTS resolution_reason,
  DROP COLUMN IF EXISTS resolution;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_motivo_so_na_remocao,
  DROP CONSTRAINT IF EXISTS conversations_remocao_tem_motivo,
  DROP COLUMN IF EXISTS moderation_reason,
  DROP COLUMN IF EXISTS moderation_removed_at;
