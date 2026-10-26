-- O AVISO DE PEDIDO DE CONEXAO: quem RECEBE o pedido ganha linha na caixa.
--
-- Pedido do cliente, 22/10/2026, literal: *"quando o usuario me adicionou, nao
-- apareceu na notificacao que eu tinha uma solicitacao de amizade. Isso precisa
-- aparecer na notificacao"*.
--
-- ====================================================================
-- A LACUNA, MEDIDA E NAO SUPOSTA
-- ====================================================================
--
-- `NotificationKind` tinha DEZ valores (`tag_scanned`, `found_reported`,
-- `match_suggested`, `neighborhood_alert`, `event_join_requested`,
-- `event_join_decided`, `event_cancelled`, `suggestion_decided`,
-- `tag_request_updated`, `broadcast`) e NENHUM deles e pedido de conexao. E
-- `git grep` por notificacao em `src/modules/connections` devolvia ZERO
-- escrita: o modulo so tem a prosa de `conexao-entre-pessoas.ts`, que diz, em
-- 20/10, *"nenhum aviso: a caixa de notificacoes e a fatia M, e o aviso de
-- pedido recebido entra por la quando ela descer"*. A caixa desceu em 18/10
-- (`20261018000020`) e o aviso nao entrou. O cliente esta certo: pedir conexao
-- nao criava aviso nenhum, e o pedido so aparecia para quem abrisse a tela
-- *"Pedidos de conexao"* por conta propria.
--
-- O cabecalho da `20261018000020` registra por que o aviso nao nasceu junto, e
-- a razao caducou: ele afirma que *"nao existe tabela de conexao entre pessoas
-- neste banco"*. Existe desde a `20261018000030` (`user_connections`), dez
-- migracoes depois da frase.
--
-- ====================================================================
-- E O MOLDE DE `event_join_requested`, INTEIRO
-- ====================================================================
--
-- Nao se inventa um segundo jeito de notificar aqui. `event_join_requested` ja
-- e *"alguem pediu para entrar"* e ja esta resolvido ponta a ponta, e esta
-- migracao copia a FORMA dele:
--
--   * **gatilho na FONTE**, e nenhuma linha de `src/` muda para o aviso nascer
--     -- a mesma razao escrita na `20261018000020` ("o gatilho e o que mantem
--     esta frente fora dos modulos que nao sao dela");
--   * **`ON CONFLICT` sobre `notification_items_um_por_destinatario`**, que e a
--     idempotencia;
--   * **quem causou vai em `author_user_id`**, so para agrupar: dois pedidos de
--     duas pessoas no mesmo dia nao podem virar uma linha;
--   * **`subject_label` em texto ja pronto**, lido da fonte no instante do
--     gatilho;
--   * **o destino entra em `notificacao_destino`**, que e o ponto unico do mapa
--     tipo -> tela (`20261020000011`).
--
-- ====================================================================
-- A UNICA DIVERGENCIA DO MOLDE, E POR QUE ELA E FORCADA
-- ====================================================================
--
-- O molde usa `DO NOTHING`. Aqui e `DO UPDATE`, e a razao e uma propriedade de
-- `user_connections` que nenhuma outra fonte da caixa tem: **ela tem UMA LINHA
-- POR PAR, para sempre** (indice unico `user_connections_um_par_uma_linha`), e
-- por isso um pedido NOVO sobre uma aresta morta nao e um `INSERT` -- e o
-- `ON CONFLICT (pair_low, pair_high) DO UPDATE` de `construtorDoPedido`, que
-- reescreve `ref`, `requested_at` e `state` **na mesma linha, com o mesmo
-- `id`**. Duas consequencias, as duas medidas no SQL daquele construtor:
--
--   1. um gatilho `AFTER INSERT` sozinho **nao veria** o pedido refeito depois
--      dos 30 dias de validade ou dos 90 de descanso. Por isso o gatilho ouve
--      `INSERT OR UPDATE OF requested_at` -- a coluna que SO aquele caminho
--      escreve (`aceitar` e `encerrar` nao a tocam, medido);
--   2. `source_id` e `user_connections.id`, que e o MESMO na linha refeita.
--      Com `DO NOTHING` o segundo pedido cairia no conflito do primeiro e o
--      defeito do cliente voltaria -- calado, e so para quem pede duas vezes.
--      `DO UPDATE` empurra `occurred_at` para o fato novo e zera `read_at`:
--      e a MESMA aresta, e um aviso so, mas o fato e de agora e nao esta lido.
--
-- Quando o par TROCA de lado (A pediu, venceu, B pede) o destinatario muda e o
-- conflito nem acontece: a chave de unicidade inclui `recipient_user_id`.
--
-- ====================================================================
-- O QUE SAI NA LINHA, E O LIMITE
-- ====================================================================
--
-- `subject_label` leva **o nome de quem pediu** -- apelido quando ha, nome de
-- exibicao quando nao ha, nulo quando nao ha nenhum dos dois. E exatamente
-- `nomeParaLer` de `src/modules/connections/domain/conexao.ts`, e a duplicacao
-- e deliberada e tem isca: a tela *"Pedidos de conexao"* ja escreve a pessoa
-- assim, e um aviso que a escrevesse de outro jeito seria a mesma pessoa com
-- dois nomes em duas telas. Nulo e estado NORMAL na caixa (`subject` e
-- anulavel no contrato) e a linha entao mostra so o tipo e a data -- inventar
-- um "Alguem" aqui seria o servidor escrevendo na tela, que `nomeParaLer`
-- recusa de proposito.
--
-- **Nada alem do nome.** O limite do que pode sair de quem pediu e nome,
-- apelido, contagem de pets, contagem de conexoes e a foto; a caixa nao tem
-- avatar nem autor na tela (0 KB de imagem por pagina, `20261018000020`), e
-- `author_user_id` continua **nao saindo na resposta** -- ele existe so para
-- agrupar.
--
-- **O PUSH NAO MUDA, e nao e esquecimento.** `event_join_requested` tambem nao
-- tem push, e a carga do aviso no celular segue `{tipo, ref}` com token
-- publico (`domain/conteudo-do-push.ts`): o aviso acende sem desbloquear o
-- telefone, passa pelos servidores de terceiro e fica no historico do aparelho.
-- Nenhum identificador interno entra nela, e esta migracao nao poe nenhum.
--
-- ====================================================================
-- O DESTINO: A TELA QUE JA EXISTE
-- ====================================================================
--
-- Cada linha da caixa leva a algum lugar (cliente, 20/10). A linha de pedido de
-- conexao leva a **"Pedidos de conexao"** (`/conexoes/pedidos`), que existe
-- desde 18/10. A chave e `user_connections.ref` -- 22 caracteres base64url,
-- OPACO, o identificador que aquela tabela criou justamente porque o item 6 do
-- ADR-0010 proibe UUID interno em saida publica. Nenhum UUID sai por aqui.
--
-- O ramo filtra `state = 'pending'`: pedido ja respondido nao esta naquela
-- lista, e levar a pessoa a uma lista onde o item nao esta e o mesmo defeito do
-- pet com `deleted_at` -- destino que sumiu vira NULO e a linha fica sem toque,
-- em vez de oferecer atalho para o nada. `LEFT JOIN LATERAL` na leitura ja
-- garante que a linha continua na caixa sem o destino.
--
-- **A tela e a LISTA e nao o item**, como `directory_suggestion` ja e: o `ref`
-- viaja porque o contrato promete que `destination` e `destination_ref` andam
-- juntos, e `rotas.dart` leva a lista -- a mesma decisao, escrita la.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
-- ====================================================================
--
-- **Nao ha o par "sua solicitacao foi aceita".** `event_join_decided` existe
-- para encontro, entao o molde do par existe; o aviso de aceite depende de
-- decisao do cliente, que foi levantada em 22/10 e ainda nao voltou. Construi-lo
-- sem a resposta seria escolher no lugar dele. O caminho fica preparado e o
-- custo de acrescenta-lo e um tipo no `CHECK`, um gatilho em
-- `AFTER UPDATE OF state WHEN (OLD.state = 'pending' AND NEW.state =
-- 'accepted')` e um ramo no destino -- tres edicoes nos mesmos tres lugares
-- desta migracao.
--
-- E **nao se mexe no agrupamento nem no contador**: `connection_requested`
-- agrupa por (tipo, autor, dia) como a regra geral, e sai do contador quando a
-- lista e vista. Ele nao e um pet na rua agora, que e o unico criterio das duas
-- excecoes.
--
-- ====================================================================
-- `BEGIN`/`ROLLBACK` SOBRE DADO PREEXISTENTE
-- ====================================================================
--
-- A subida roda sobre `notification_items` e `user_connections` POVOADAS. O
-- `CHECK` so AMPLIA o dominio (os dez valores continuam todos la), entao
-- nenhuma linha existente pode reprova-lo -- e foi conferido em
-- `BEGIN`/`ROLLBACK`. A descida ESTREITA, e por isso ela apaga as linhas do
-- tipo novo ANTES de recolocar a restricao: sem isso o `ADD CONSTRAINT`
-- reprovaria sobre as proprias linhas que a subida fez nascer, que e o defeito
-- que a `20261020000017` ja pagou.

-- Up Migration

-- O DOMINIO DO TIPO. `DROP` e `ADD`, e nao `ALTER CONSTRAINT`: Postgres nao
-- altera a expressao de um `CHECK` no lugar.
ALTER TABLE notification_items
  DROP CONSTRAINT IF EXISTS notification_items_tipo_conhecido;

ALTER TABLE notification_items
  ADD CONSTRAINT notification_items_tipo_conhecido
  CHECK (item_kind IN (
    'tag_scanned', 'found_reported', 'match_suggested',
    'neighborhood_alert', 'event_join_requested',
    'event_join_decided', 'event_cancelled',
    'suggestion_decided', 'tag_request_updated',
    'broadcast', 'connection_requested'));

COMMENT ON CONSTRAINT notification_items_tipo_conhecido ON notification_items IS
  'Os ONZE tipos de item da caixa. connection_requested entrou em 20261020000018 (cliente, 22/10/2026: "quando o usuario me adicionou, nao apareceu na notificacao que eu tinha uma solicitacao de amizade"). O conjunto e espelhado em TIPOS_DE_AVISO (src/modules/notifications/domain/caixa.ts), no enum NotificationKind do contrato e em TipoDeAviso (app/lib/api/modelos_notificacao.dart); excecoes-da-caixa-nao-divergiram.test.ts compara o dominio com este CHECK, e conjunto-exato-dos-checks.test.ts afirma o conjunto no BANCO.';

-- O GATILHO. Mesma forma de `notificacao_de_pedido_de_participacao`.
CREATE FUNCTION notificacao_de_pedido_de_conexao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_items
    (ref, recipient_user_id, item_kind, subject_label, author_user_id,
     source_kind, source_id, occurred_at)
  SELECT notificacao_ref_novo(), NEW.addressee_user_id, 'connection_requested',
         -- `nomeParaLer`, em SQL: apelido com arroba, senao nome de exibicao,
         -- senao NULO. `left(...,120)` porque `users.display_name` nao tem teto
         -- e `notification_items_rotulo_tamanho` cobra de 1 a 120; `NULLIF`
         -- porque nome de exibicao vazio e ausencia e nao rotulo.
         NULLIF(left(COALESCE('@' || u.handle::text, u.display_name), 120), ''),
         NEW.requester_user_id, 'connection_request', NEW.id, NEW.requested_at
    FROM users u
   WHERE u.id = NEW.requester_user_id
  ON CONFLICT ON CONSTRAINT notification_items_um_por_destinatario
  DO UPDATE SET occurred_at   = EXCLUDED.occurred_at,
                subject_label = EXCLUDED.subject_label,
                -- O fato e NOVO: deixar lido esconderia o pedido refeito, que
                -- e exatamente o defeito que esta migracao conserta.
                read_at       = NULL
            -- SO quando o fato e mais recente. Sem esta guarda um `UPDATE` que
            -- reescrevesse `requested_at` para tras ressuscitaria um aviso
            -- velho como nao lido.
            WHERE EXCLUDED.occurred_at > notification_items.occurred_at;
  RETURN NULL;
END
$$;

COMMENT ON FUNCTION notificacao_de_pedido_de_conexao() IS
  'Alguem pediu conexao -> aviso para QUEM RECEBEU o pedido (cliente, 22/10/2026). Nao avisa quem pediu: o destinatario e addressee_user_id, e o pedinte entra em author_user_id, que existe SO para agrupar e NAO sai na resposta. subject_label e o nome de quem pediu pela mesma regra de nomeParaLer (apelido com arroba, senao nome de exibicao, senao nulo), para a mesma pessoa nao ter dois nomes na caixa e na tela de pedidos. Ouve INSERT E UPDATE OF requested_at porque user_connections tem UMA linha por par: um pedido refeito depois da validade ou do descanso e um ON CONFLICT DO UPDATE na mesma linha, e um gatilho de INSERT so nao o veria. ON CONFLICT DO UPDATE e nao DO NOTHING pela mesma razao -- source_id e o id da linha e nao muda --, e o UPDATE so avanca: zera read_at e empurra occurred_at quando o fato e mais recente.';

CREATE TRIGGER user_connections_avisa_quem_recebeu
  AFTER INSERT OR UPDATE OF requested_at ON user_connections
  FOR EACH ROW
  -- `pending` e o unico estado que e um PEDIDO. `aceitar` e `encerrar` nao
  -- escrevem `requested_at` e nao chegam aqui; a guarda e a segunda rede.
  WHEN (NEW.state = 'pending')
  EXECUTE FUNCTION notificacao_de_pedido_de_conexao();

-- O DESTINO. `CREATE OR REPLACE` e nao `DROP`/`CREATE`: o tipo de retorno nao
-- muda (ao contrario da `20261020000011`, que acrescentou duas colunas), e
-- `caixa_de_notificacoes` depende desta funcao por `LATERAL` -- um `DROP`
-- obrigaria a recriar a leitura inteira junto.
CREATE OR REPLACE FUNCTION notificacao_destino(p_item_kind text, p_source_id uuid)
RETURNS TABLE (destino text, destino_ref text)
LANGUAGE sql STABLE AS $$
  -- Os valores de `destino` saem em INGLES, como todo valor de fio deste
  -- contrato (`NotificationKind`, `source_kind`, `item_kind`): o nome do
  -- destino e dado que atravessa a borda, e nao prosa de comentario.
  --
  -- O PET escaneado. Chega por tag_scans -> pet_tags -> pets, e o destino e a
  -- ficha do pet (`/pets/:petId`), que e autenticada e do dono.
  SELECT 'pet', p.id::text
    FROM tag_scans s
    JOIN pet_tags t ON t.id = s.tag_id
    JOIN pets p     ON p.id = t.pet_id
   WHERE p_item_kind = 'tag_scanned'
     AND s.id = p_source_id
     AND p.deleted_at IS NULL

  UNION ALL

  -- O ACHADO. Unico tipo cujo `source_id` JA E a chave do destino
  -- (`found_reports.id`, que e o que `/achados/:achadoId` pede), e por isso o
  -- unico sem `JOIN`. A linha so sai se o achado ainda existe.
  SELECT 'found_report', f.id::text
    FROM found_reports f
   WHERE p_item_kind = 'found_reported'
     AND f.id = p_source_id

  UNION ALL

  -- O CASO PUBLICO, por `share_token`. Aqui a chave e PUBLICA e nao por
  -- economia de ADR: a pagina do caso E publica (`/p/<share_token>`), e e o
  -- mesmo token que o link do grupo do bairro ja carrega.
  SELECT 'public_case', c.share_token
    FROM alert_dispatches d
    JOIN lost_cases c ON c.id = d.case_id
   WHERE p_item_kind = 'neighborhood_alert'
     AND d.id = p_source_id

  UNION ALL

  -- O ENCONTRO, pelos DOIS tipos de pedido. `source_id` e a linha do pedido
  -- nos dois (`event_join_request` e `event_join_decision` sao dois avisos
  -- sobre a MESMA linha, para pessoas diferentes), e o destino dos dois e o
  -- encontro: quem pediu quer ver onde e quando, e o organizador tambem.
  SELECT 'network_event', e.slug
    FROM network_event_join_requests r
    JOIN network_events e ON e.id = r.event_id
   WHERE p_item_kind IN ('event_join_requested', 'event_join_decided')
     AND r.id = p_source_id

  UNION ALL

  -- O ENCONTRO CANCELADO. Ramo proprio porque aqui `source_id` e o PROPRIO
  -- encontro (`event_cancellation` nasce do `UPDATE` em `network_events`), e
  -- nao um pedido. O cancelado continua tendo pagina: quem ia precisa ler que
  -- nao vai mais.
  SELECT 'network_event', e.slug
    FROM network_events e
   WHERE p_item_kind = 'event_cancelled'
     AND e.id = p_source_id

  UNION ALL

  -- A INDICACAO, pelo `ref` opaco que ela ja tem.
  SELECT 'directory_suggestion', g.ref
    FROM directory_suggestions g
   WHERE p_item_kind = 'suggestion_decided'
     AND g.id = p_source_id

  UNION ALL

  -- O PEDIDO DA PLAQUINHA -> a tela de ACOMPANHAMENTO, que e endereçada por
  -- PET (`/pets/plaquinha/:petId`) e nao pelo `ref` do pedido.
  --
  -- Medido antes de escolher: `listCollarTagRequests` e a leitura que sustenta
  -- aquela pagina e ela e POR PET, nao por pedido. Devolver o `ref` do pedido
  -- exigiria uma rota nova e uma operacao nova para chegar a mesma tela onde a
  -- pessoa chegaria de qualquer jeito. O `ref` continua existindo e saindo em
  -- `CollarTagRequest.ref`, para quem precisa citar o pedido.
  SELECT 'collar_tag_request', r.pet_id::text
    FROM collar_tag_requests r
    JOIN pets p ON p.id = r.pet_id
   WHERE p_item_kind = 'tag_request_updated'
     AND r.id = p_source_id
     AND p.deleted_at IS NULL

  UNION ALL

  -- O COMUNICADO -> a PAGINA INTERMEDIARIA, e e o unico tipo que a tem.
  -- Ele nao fala de pet, de caso nem de encontro: e texto, e o texto precisa
  -- de onde ser lido. A caixa carrega so o TITULO (`subject_label`), e o corpo
  -- vive em `notification_broadcasts.body` -- quem o le e `getMyBroadcast`,
  -- por este `ref`.
  SELECT 'broadcast', b.ref
    FROM notification_broadcasts b
   WHERE p_item_kind = 'broadcast'
     AND b.id = p_source_id

  UNION ALL

  -- O PEDIDO DE CONEXAO -> a tela "Pedidos de conexao" (`/conexoes/pedidos`),
  -- pelo `ref` OPACO da aresta (22 caracteres base64url). Nenhum UUID sai
  -- daqui: `user_connections.ref` existe justamente porque `id` e UUID interno
  -- e o item 6 do ADR-0010 o proibe em saida publica.
  --
  -- A tela e a LISTA e nao o item, como `directory_suggestion`: `rotas.dart`
  -- leva a lista, e o `ref` viaja porque o contrato promete que os dois campos
  -- andam juntos.
  --
  -- `state = 'pending'` e o analogo de `p.deleted_at IS NULL` do ramo do pet:
  -- pedido ja respondido nao esta naquela lista, e zero linhas aqui deixam a
  -- notificacao na caixa SEM TOQUE -- que e melhor que um toque para onde o
  -- item nao esta.
  SELECT 'connection_request', c.ref
    FROM user_connections c
   WHERE p_item_kind = 'connection_requested'
     AND c.id = p_source_id
     AND c.state = 'pending'
$$;

-- Down Migration

DROP TRIGGER IF EXISTS user_connections_avisa_quem_recebeu ON user_connections;
DROP FUNCTION IF EXISTS notificacao_de_pedido_de_conexao();

-- O destino volta a forma da `20261020000011`, SEM o ramo da conexao. Repetido
-- por extenso e nao reconstruido: `CREATE OR REPLACE` substitui o corpo
-- inteiro, e uma descida que so apagasse o ramo deixaria a funcao sem os outros
-- oito.
CREATE OR REPLACE FUNCTION notificacao_destino(p_item_kind text, p_source_id uuid)
RETURNS TABLE (destino text, destino_ref text)
LANGUAGE sql STABLE AS $$
  -- Os valores de `destino` saem em INGLES, como todo valor de fio deste
  -- contrato (`NotificationKind`, `source_kind`, `item_kind`): o nome do
  -- destino e dado que atravessa a borda, e nao prosa de comentario.
  --
  -- O PET escaneado. Chega por tag_scans -> pet_tags -> pets, e o destino e a
  -- ficha do pet (`/pets/:petId`), que e autenticada e do dono.
  SELECT 'pet', p.id::text
    FROM tag_scans s
    JOIN pet_tags t ON t.id = s.tag_id
    JOIN pets p     ON p.id = t.pet_id
   WHERE p_item_kind = 'tag_scanned'
     AND s.id = p_source_id
     AND p.deleted_at IS NULL

  UNION ALL

  -- O ACHADO. Unico tipo cujo `source_id` JA E a chave do destino
  -- (`found_reports.id`, que e o que `/achados/:achadoId` pede), e por isso o
  -- unico sem `JOIN`. A linha so sai se o achado ainda existe.
  SELECT 'found_report', f.id::text
    FROM found_reports f
   WHERE p_item_kind = 'found_reported'
     AND f.id = p_source_id

  UNION ALL

  -- O CASO PUBLICO, por `share_token`. Aqui a chave e PUBLICA e nao por
  -- economia de ADR: a pagina do caso E publica (`/p/<share_token>`), e e o
  -- mesmo token que o link do grupo do bairro ja carrega.
  SELECT 'public_case', c.share_token
    FROM alert_dispatches d
    JOIN lost_cases c ON c.id = d.case_id
   WHERE p_item_kind = 'neighborhood_alert'
     AND d.id = p_source_id

  UNION ALL

  -- O ENCONTRO, pelos DOIS tipos de pedido. `source_id` e a linha do pedido
  -- nos dois (`event_join_request` e `event_join_decision` sao dois avisos
  -- sobre a MESMA linha, para pessoas diferentes), e o destino dos dois e o
  -- encontro: quem pediu quer ver onde e quando, e o organizador tambem.
  SELECT 'network_event', e.slug
    FROM network_event_join_requests r
    JOIN network_events e ON e.id = r.event_id
   WHERE p_item_kind IN ('event_join_requested', 'event_join_decided')
     AND r.id = p_source_id

  UNION ALL

  -- O ENCONTRO CANCELADO. Ramo proprio porque aqui `source_id` e o PROPRIO
  -- encontro (`event_cancellation` nasce do `UPDATE` em `network_events`), e
  -- nao um pedido. O cancelado continua tendo pagina: quem ia precisa ler que
  -- nao vai mais.
  SELECT 'network_event', e.slug
    FROM network_events e
   WHERE p_item_kind = 'event_cancelled'
     AND e.id = p_source_id

  UNION ALL

  -- A INDICACAO, pelo `ref` opaco que ela ja tem.
  SELECT 'directory_suggestion', g.ref
    FROM directory_suggestions g
   WHERE p_item_kind = 'suggestion_decided'
     AND g.id = p_source_id

  UNION ALL

  -- O PEDIDO DA PLAQUINHA -> a tela de ACOMPANHAMENTO, que e endereçada por
  -- PET (`/pets/plaquinha/:petId`) e nao pelo `ref` do pedido.
  --
  -- Medido antes de escolher: `listCollarTagRequests` e a leitura que sustenta
  -- aquela pagina e ela e POR PET, nao por pedido. Devolver o `ref` do pedido
  -- exigiria uma rota nova e uma operacao nova para chegar a mesma tela onde a
  -- pessoa chegaria de qualquer jeito. O `ref` continua existindo e saindo em
  -- `CollarTagRequest.ref`, para quem precisa citar o pedido.
  SELECT 'collar_tag_request', r.pet_id::text
    FROM collar_tag_requests r
    JOIN pets p ON p.id = r.pet_id
   WHERE p_item_kind = 'tag_request_updated'
     AND r.id = p_source_id
     AND p.deleted_at IS NULL

  UNION ALL

  -- O COMUNICADO -> a PAGINA INTERMEDIARIA, e e o unico tipo que a tem.
  -- Ele nao fala de pet, de caso nem de encontro: e texto, e o texto precisa
  -- de onde ser lido. A caixa carrega so o TITULO (`subject_label`), e o corpo
  -- vive em `notification_broadcasts.body` -- quem o le e `getMyBroadcast`,
  -- por este `ref`.
  SELECT 'broadcast', b.ref
    FROM notification_broadcasts b
   WHERE p_item_kind = 'broadcast'
     AND b.id = p_source_id
$$;

-- As linhas do tipo novo saem ANTES de a restricao estreitar: senao o
-- `ADD CONSTRAINT` reprova sobre o que a subida fez nascer.
DELETE FROM notification_items WHERE item_kind = 'connection_requested';

ALTER TABLE notification_items
  DROP CONSTRAINT IF EXISTS notification_items_tipo_conhecido;

ALTER TABLE notification_items
  ADD CONSTRAINT notification_items_tipo_conhecido
  CHECK (item_kind IN (
    'tag_scanned', 'found_reported', 'match_suggested',
    'neighborhood_alert', 'event_join_requested',
    'event_join_decided', 'event_cancelled',
    'suggestion_decided', 'tag_request_updated',
    'broadcast'));

COMMENT ON CONSTRAINT notification_items_tipo_conhecido ON notification_items IS
  'Os DEZ tipos de item da caixa, espelhando o enum NotificationKind do contrato. broadcast e o comunicado do painel e e o unico que nao nasce de um fato do tutor.';
