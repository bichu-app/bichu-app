-- A CAIXA DE NOTIFICACOES PASSA A FECHAR LINHA E A LEVAR A ACAO.
--
-- DUAS METADES DO MESMO PEDIDO, e e por isso que elas moram numa migracao so.
-- O cliente pediu as duas na MESMA hora (20/10/2026):
--
--   1. "na notificacao alem da acao de marcar como lida, cada notificacao tem
--      que ter um x para fechar aquela notificacao para ir limpando a lista";
--   2. "tem que ter a pagina interna da notificacao ou o link que leva para a
--      acao que foi notificada".
--
-- **Esta migracao cobre as DUAS**, e isso esta escrito aqui para quem ler
-- depois nao achar que alguem juntou assuntos a toa: nao sao dois temas que
-- coincidiram no tempo, e a mesma capacidade da caixa -- a linha passa a ter
-- fim (dispensa) e passa a ter destino. As duas mexem na MESMA funcao de
-- leitura, `caixa_de_notificacoes(uuid, integer, integer)`, e separa-las em
-- dois carimbos faria a segunda reescrever a funcao que a primeira acabou de
-- reescrever.
--
-- A PRIMEIRA METADE (a dispensa) comeca em `dismissed_at`, logo abaixo.
-- A SEGUNDA METADE (o destino) comeca em `notificacao_destino(text, uuid)`.
--
-- ====================================================================
-- DISPENSAR NAO E LER, E AS DUAS CONVIVEM
-- ====================================================================
--
-- A caixa passa a ter DOIS eixos independentes sobre a mesma linha:
--
--   * **lido** (`read_at`) -- o item foi ABERTO. Tira do CONTADOR.
--   * **dispensado** (`dismissed_at`) -- a pessoa fechou aquela linha. Tira da
--     LISTA.
--
-- Eles sao independentes nos DOIS sentidos, e isso e requisito e nao
-- consequencia: uma notificacao pode ser dispensada SEM nunca ter sido lida (e
-- esse e o caso comum -- a pessoa limpa a lista sem abrir), e marcar como lida
-- NAO dispensa (a linha fica na lista, dizendo `Lido`).
--
-- Por isso sao DUAS colunas e nao um estado so com tres valores: um `status`
-- unico forcaria uma ordem entre os dois eventos que o produto nao tem, e
-- perderia "foi dispensada sem ter sido lida", que e justamente o que o
-- diagnostico vai querer saber depois.
--
-- ====================================================================
-- APAGAMENTO LOGICO, E NUNCA FISICO
-- ====================================================================
--
-- `dismissed_at timestamptz`, nulo enquanto a linha esta na lista -- o mesmo
-- estilo de `users.deleted_at`, `pet_tags.revoked_at` e
-- `network_events.cancelled_at`: coluna de DATA e nao booleano, porque
-- "quando" responde perguntas que "se" nao responde, e nenhuma delas custa uma
-- coluna a mais.
--
-- `DELETE` fisico foi recusado de proposito. A linha dispensada e a unica
-- evidencia de que o aviso existiu e chegou: sem ela, "o tutor nunca foi
-- avisado do escaneamento" e "o tutor dispensou o aviso do escaneamento" ficam
-- indistinguiveis depois do fato, e o primeiro e defeito de produto enquanto o
-- segundo e uso normal. Alem disso a linha apagada de verdade voltaria: o
-- gatilho da fonte reinsere pela `notification_items_um_por_destinatario` --
-- que e UNIQUE em (source_kind, source_id, recipient_user_id) --, entao apagar
-- a linha e o unico jeito de o MESMO fato virar um aviso novo. O apagamento
-- logico e o que faz o `ON CONFLICT DO NOTHING` continuar valendo e o aviso
-- dispensado NAO ressuscitar.
--
-- A retencao de 90 dias de `occurred_at` continua sendo a unica que apaga:
-- quem dispensa nao encurta o prazo, e quem nao dispensa nao o estica.
--
-- ====================================================================
-- OS TRES LUGARES QUE PASSAM A FILTRAR, E POR QUE SAO TRES
-- ====================================================================
--
-- `caixa_de_notificacoes` (a LISTA), `contagem_de_notificacoes` (o SINO) e
-- `notificacoes_marcar_todas_lidas` (o "marcar todas"). Os tres, e nao so a
-- lista: o defeito obvio deste recurso e a linha sumir da tela e voltar no
-- recarregamento, ou sumir da tela e continuar contando no sino -- dois
-- numeros discordando sobre a mesma caixa.
--
-- `notificacao_marcar_lida` e a UNICA que NAO filtra, e a assimetria e
-- deliberada. Ela e por ITEM e idempotente por contrato, e o aparelho reenvia:
-- um item dispensado que respondesse 404 em "marcar como lida" transformaria a
-- ordem em que os dois toques chegam ao servidor num erro visivel. Marcar como
-- lida uma linha ja dispensada nao muda nada que alguem veja -- ela nao esta
-- na lista nem no contador --, e aceitar e mais barato que explicar.
--
-- `notificacoes_marcar_todas_lidas` filtra porque e operacao de CONJUNTO, e a
-- regra dela ja era "nao mexe no que a caixa nao mostra mais" -- e por isso
-- que ela respeita a janela de 90 dias. Dispensado e exatamente isso: o que a
-- caixa nao mostra mais.

-- Up Migration

ALTER TABLE notification_items ADD COLUMN dismissed_at timestamptz;

COMMENT ON COLUMN notification_items.dismissed_at IS
  'Quando a pessoa DISPENSOU este aviso -- o "x" da linha (cliente, 20/10/2026). Nulo e "esta na lista". NAO e read_at e nao implica read_at: dispensar tira da LISTA, ler tira do CONTADOR, e os dois eixos sao independentes nos dois sentidos -- dispensar sem ter lido e o caso COMUM, e marcar como lida nao dispensa. Apagamento LOGICO e nunca DELETE: a linha dispensada e a unica evidencia de que o aviso chegou, e sem ela "nunca foi avisado" e "dispensou o aviso" ficam indistinguiveis; alem disso apagar a linha furaria notification_items_um_por_destinatario e o gatilho da fonte reinseriria o MESMO fato como aviso novo. A retencao de 90 dias sobre occurred_at continua sendo a unica que apaga.';

-- Os DOIS indices da caixa passam a ser PARCIAIS em `dismissed_at IS NULL`,
-- porque os dois caminhos quentes -- a lista e o sino -- passam a ter esse
-- predicado em toda leitura. O dispensado sai dos indices junto: ele nao e
-- lido por nenhuma consulta de produto, so por diagnostico, e diagnostico
-- raro pode varrer.
DROP INDEX notification_items_da_caixa;

CREATE INDEX notification_items_da_caixa
  ON notification_items (recipient_user_id, occurred_at DESC)
  WHERE dismissed_at IS NULL;

COMMENT ON INDEX notification_items_da_caixa IS
  'A pagina da caixa. PARCIAL em dismissed_at IS NULL desde a 20261020000011: a lista nunca mostra o dispensado, entao indexa-lo seria pagar escrita por linha que nenhuma consulta de produto le. O diagnostico que quiser o dispensado varre, e e raro de proposito.';

DROP INDEX notification_items_nao_lidos;

CREATE INDEX notification_items_nao_lidos
  ON notification_items (recipient_user_id, occurred_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

COMMENT ON INDEX notification_items_nao_lidos IS
  'O contador do sino. PARCIAL nos DOIS predicados: read_at IS NULL porque e so o nao lido que ele conta, e dismissed_at IS NULL desde a 20261020000011 porque o dispensado nao conta no sino -- sem o segundo predicado o indice ainda serviria, mas carregaria as linhas dispensadas nao lidas, que sao exatamente as que a pessoa fechou sem abrir, quer dizer, a maioria delas.';

-- ====================================================================
-- A SEGUNDA METADE: O DESTINO DA NOTIFICACAO
-- ====================================================================
--
-- Pedido do cliente: "tem que ter a pagina interna da notificacao ou o link
-- que leva para a acao que foi notificada". Das duas formas que ele ofereceu,
-- vale a SEGUNDA quando ela existe: a pessoa quer ver o pet, o encontro, o
-- caso -- e nao um intermediario. Pagina intermediaria so para o tipo que nao
-- tem destino natural, que e UM: o comunicado.
--
-- **IDENTIFICADOR INTERNO PODE SAIR AQUI, e isso foi decidido e nao assumido.**
-- O item 6 do ADR-0010 vive sob "O que a rota PUBLICA jamais exibe" e se limita
-- a `/t/<codigo>`, `/@<slug>`, `/cartaz/<token>`, a listagem publica de
-- perdidos e o JSON que as sirva. `listNotifications` nao e nenhuma dessas: ela
-- exige `bearerAuth` e e recortada pelo dono. A prova de que esta leitura ja e
-- tratada assim esta no proprio contrato, que ja devolve `Pet.id`,
-- `FoundReport.id` e `Pet.open_case_id` como UUID em rota autenticada.
--
-- **E por isso o RECORTE PELO DONO e obrigatorio e nao decorativo**: ele e o
-- que torna seguro devolver `pets.id`. Ele continua sendo a clausula `WHERE` de
-- `caixa_de_notificacoes`, e esta funcao e chamada SO de dentro dela, por
-- `LEFT JOIN LATERAL`, depois de o dono ja ter recortado as linhas. Nao ha
-- caminho por aqui que resolva o destino de uma notificacao de outra conta.
--
-- **O PUSH NAO MUDA.** Ele continua `{tipo, ref}` com token publico
-- (`conteudo-do-push.ts`), porque push acende sem desbloqueio, passa por
-- terceiro e fica no historico do aparelho -- publico por natureza, mesmo nao
-- estando na lista do ADR-0010 por nome. As duas superficies tem publicos
-- diferentes e por isso podem ter chaves diferentes.
--
-- ## ZERO LINHAS E A RESPOSTA CERTA, E NAO DEFEITO
--
-- A funcao devolve TABELA justamente para poder devolver NADA. Dois casos:
--
--   * **`match_suggested`**: nao ha ramo para ele, de proposito. NAO EXISTE
--     TELA de confirmar candidato neste app, e o `destinoDe` de
--     `avisos_recebidos.dart` ja o manda para `mostrarNoApp` pelo mesmo
--     motivo. Toque que leva a tela inexistente e pior que toque ausente.
--   * **o destino que sumiu**: pet com `deleted_at`, encontro apagado,
--     indicacao removida. O `JOIN` nao acha, saem zero linhas, o campo vai
--     nulo e a linha fica SEM TOQUE -- em vez de oferecer um atalho para um
--     404.
--
-- ## POR QUE FUNCAO, E NAO UM `CASE` DENTRO DA LEITURA
--
-- Ponto unico. O mapa tipo -> destino e a unica coisa que muda quando uma tela
-- nova entra, e um `CASE` de oito ramos no meio de um `WITH` de tres CTEs e
-- onde o nono ramo e esquecido. Aqui ele e uma funcao com nome, e a isca da
-- integracao a exercita tipo por tipo.
--
-- `p_source_kind` NAO e parametro: `item_kind` ja desambigua tudo. Em especial
-- `tag_request_updated` tem `source_kind` variavel (`collar_tag_status_*` e
-- `collar_tag_delivery_*`, a 20261018000020 ouve os dois eixos), mas o
-- `source_id` dele e sempre `collar_tag_requests.id` -- entao o eixo nao
-- importa para achar o destino, e receber o parametro convidaria a ramificar
-- por ele.
CREATE FUNCTION notificacao_destino(p_item_kind text, p_source_id uuid)
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

COMMENT ON FUNCTION notificacao_destino(text, uuid) IS
  'PARA ONDE O TOQUE NA LINHA LEVA, e com qual chave (cliente, 20/10/2026: "tem que ter a pagina interna da notificacao ou o link que leva para a acao que foi notificada"). Ponto unico do mapa tipo -> destino: um CASE de oito ramos dentro de caixa_de_notificacoes e onde o nono ramo e esquecido. Devolve TABELA para poder devolver NADA, e zero linhas e a resposta CERTA em dois casos -- match_suggested, que NAO TEM TELA neste app (o destinoDe de avisos_recebidos.dart ja o manda para mostrarNoApp pelo mesmo motivo, e toque para tela inexistente e pior que toque ausente), e o destino que sumiu (pet com deleted_at, encontro apagado), em que a linha fica SEM TOQUE em vez de oferecer atalho para um 404. IDENTIFICADOR INTERNO SAI AQUI, por decisao: o item 6 do ADR-0010 vale para a rota PUBLICA, e listNotifications exige bearerAuth e e recortada pelo dono -- o contrato ja devolve Pet.id e FoundReport.id como UUID em rota autenticada. O RECORTE PELO DONO e o que torna isso seguro, e por isso esta funcao e chamada SO de dentro de caixa_de_notificacoes, por LATERAL, depois de o WHERE do dono ja ter recortado as linhas. O PUSH NAO MUDA: ele segue {tipo, ref} com token publico, porque push acende sem desbloqueio e fica no historico do aparelho. Nao recebe p_source_kind porque item_kind ja desambigua: tag_request_updated tem source_kind variavel (os dois eixos da 20261018000004) mas source_id sempre de collar_tag_requests.';

-- A LISTA: uma linha dispensada nao aparece, e a linha que fica diz para onde
-- vai.
--
-- `DROP` e `CREATE`, e nao `CREATE OR REPLACE`: a funcao ganha DUAS colunas de
-- saida, e `CREATE OR REPLACE` recusa mudanca no tipo de retorno
-- ("cannot change return type of existing function"). Quem depende dela e um
-- adaptador so.
--
-- O filtro da dispensa entra em `visiveis`, que e o CTE de onde o agrupamento e
-- o `total_de_grupos` saem -- e nao numa clausula depois. Filtrar depois do
-- `GROUP BY` deixaria o dispensado contando no total e no `agrupados`: a linha
-- diria "Resume 3 avisos" sobre dois, e o rodape prometeria uma pagina
-- seguinte que nao existe.
--
-- O DESTINO entra por `LEFT JOIN LATERAL` no FIM, sobre `linhas` -- que e a
-- pagina ja agrupada e ja recortada. Resolver o destino dentro de `visiveis`
-- faria o banco pagar oito `JOIN` por AVISO da janela de 90 dias para depois
-- jogar fora todos menos os 30 da pagina. `LEFT` e nao `JOIN`: zero linhas de
-- `notificacao_destino` tem de deixar a notificacao na lista com destino nulo,
-- e um `JOIN` interno a faria DESAPARECER -- trocando "aviso sem destino" por
-- "aviso que nao existe", que e o defeito pior.
DROP FUNCTION caixa_de_notificacoes(uuid, integer, integer);

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
  destino         text,
  destino_ref     text,
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
           i.source_id,
           CASE
             WHEN notificacao_nunca_agrupa(i.item_kind) THEN i.id::text
             ELSE i.item_kind
                  || ':' || COALESCE(i.author_user_id::text, '-')
                  || ':' || to_char(date_trunc('day', i.occurred_at), 'YYYY-MM-DD')
           END AS chave
      FROM notification_items i
     WHERE i.recipient_user_id = p_usuario
       AND i.occurred_at > now() - interval '90 days'
       AND i.dismissed_at IS NULL
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
           v.source_id,
           g.agrupados
      FROM grupos g
      JOIN visiveis v
        ON v.chave = g.chave
       AND v.occurred_at = g.ultimo
     ORDER BY g.chave, v.id
  ),
  pagina AS (
    SELECT l.*
      FROM linhas l
     ORDER BY l.occurred_at DESC, l.ref
     LIMIT p_limite
    OFFSET (p_pagina - 1) * p_limite
  )
  SELECT pg.ref,
         pg.item_kind,
         pg.subject_label,
         pg.occurred_at,
         pg.lida,
         pg.agrupados,
         d.destino,
         d.destino_ref,
         (SELECT count(*) FROM grupos) AS total_de_grupos
    FROM pagina pg
    LEFT JOIN LATERAL notificacao_destino(pg.item_kind, pg.source_id) d ON true
   ORDER BY pg.occurred_at DESC, pg.ref
$$;

COMMENT ON FUNCTION caixa_de_notificacoes(uuid, integer, integer) IS
  'UMA PAGINA DA CAIXA DE NOTIFICACOES, ja agrupada e COM O DESTINO de cada linha. Devolve TABELA e nao json porque a rota projeta campo a campo. AGRUPAMENTO por (tipo, autor, dia): uma linha por combinacao por dia, com agrupados dizendo quantos avisos ela resume. Plaquinha e achado NUNCA agrupam -- a chave deles e o proprio id --, e o ponto unico dessa regra e notificacao_nunca_agrupa(text): "2 avisos de plaquinha" esconderia qual pet. RETENCAO de 90 dias, contada de occurred_at (o fato) e nao de created_at (a linha). O DISPENSADO NAO APARECE (dismissed_at IS NULL, 20261020000011), e o filtro entra em visiveis e nao depois do GROUP BY: filtrar depois deixaria o dispensado contando em agrupados e em total_de_grupos. O DESTINO vem de notificacao_destino(text, uuid) por LEFT JOIN LATERAL sobre a pagina JA RECORTADA -- resolve-lo em visiveis faria o banco pagar oito JOIN por aviso da janela de 90 dias para jogar fora todos menos 30 --, e o LATERAL e LEFT de proposito: zero linhas de destino deixa a notificacao na lista com destino nulo, e um JOIN interno a faria DESAPARECER, trocando "aviso sem destino" por "aviso que nao existe". A AUTORIZACAO E O PROPRIO WHERE, e e ela que torna seguro o destino carregar pets.id: nao ha caminho por aqui para a caixa de outra conta, e por isso a rota responde 404 e nunca 403 (ADR-0021). Conta desabilitada devolve ZERO linhas, delegando a conta_habilitada(uuid) (20261017000013) -- LUGAR 1 dos tres. NAO projeta author_user_id (parametro de agrupamento, nunca saida) nem o id da notificacao. Nao devolve imagem nenhuma, de proposito: 0 KB por pagina.';

-- O SINO: o dispensado nao conta, nem quando e dos dois tipos que atravessam
-- o zero do contador.
--
-- O predicado novo fica ANTES da disjuncao de `notificacao_persiste_no_contador`,
-- e nao dentro dela: plaquinha e achado atravessam o ZERO DA LISTA VISTA, e nao
-- a dispensa. Dentro do `OR` eles continuariam contando depois de dispensados,
-- que e o defeito "sumiu da tela e o sino nao mexeu" nos dois unicos tipos em
-- que ele seria mais visivel.
CREATE OR REPLACE FUNCTION contagem_de_notificacoes(p_usuario uuid) RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT count(*)::integer
    FROM notification_items i
   WHERE i.recipient_user_id = p_usuario
     AND i.read_at IS NULL
     AND i.dismissed_at IS NULL
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
  'O NUMERO DO SINO: quantos avisos esta conta ainda nao abriu. Conta ITENS e nao grupos -- um grupo de tres nao lidos sao tres avisos nao lidos. A REGRA DO ZERO: abrir a lista empurra notification_counter_state.zeroed_at para agora, e todo item anterior a isso para de contar SEM virar lido; a EXCECAO e notificacao_persiste_no_contador(text), que mantem plaquinha e achado contando atraves do zero, porque esses dois dizem que ha um pet na rua agora. O DISPENSADO NAO CONTA (dismissed_at IS NULL, 20261020000011), e o predicado fica FORA da disjuncao do persiste: plaquinha e achado atravessam o zero da LISTA VISTA e nao a dispensa -- dentro do OR eles continuariam contando depois de dispensados, e "sumiu da tela e o sino nao mexeu" seria pior justamente nos dois tipos em que ele e mais visivel. Conta desabilitada devolve ZERO, delegando a conta_habilitada(uuid) -- LUGAR 2 dos tres, e o que impede o sino de exibir numero sobre caixa vazia. NAO recorta em 9+: o teto de exibicao e regra da barra, e LEAST aqui apagaria a diferenca entre 10 e 400 para quem for medir uso.';

-- "Marcar todas como lidas" nao mexe no dispensado, pela MESMA razao pela qual
-- ela respeita a janela de 90 dias: ela nao mexe no que a caixa nao mostra
-- mais. Sem isto, o `marked` da resposta contaria linhas que a pessoa ja tinha
-- fechado, e o numero diria ter marcado mais do que havia na tela.
CREATE OR REPLACE FUNCTION notificacoes_marcar_todas_lidas(p_usuario uuid) RETURNS integer
LANGUAGE sql VOLATILE AS $$
  WITH marcadas AS (
    UPDATE notification_items
       SET read_at = now()
     WHERE recipient_user_id = p_usuario
       AND read_at IS NULL
       AND dismissed_at IS NULL
       AND occurred_at > now() - interval '90 days'
       AND conta_habilitada(p_usuario)
    RETURNING 1
  )
  SELECT count(*)::integer FROM marcadas
$$;

COMMENT ON FUNCTION notificacoes_marcar_todas_lidas(uuid) IS
  '"Marcar todas como lidas", explicito, e devolve quantas foram. Existe como acao PROPRIA e nao como efeito de abrir a lista: abrir a lista zera o NUMERO e deixa os itens nao lidos, e sem esta funcao nao haveria como limpar de verdade uma caixa grande -- inclusive a plaquinha e o achado, que atravessam o zero do contador de proposito. Respeita a mesma janela de 90 dias da listagem e, desde a 20261020000011, tambem o dismissed_at IS NULL: nao mexe no que a caixa nao mostra mais, e contar linha dispensada no marked diria ter marcado mais do que havia na tela.';

-- DISPENSAR UM AVISO: o "x" da linha.
--
-- ====================================================================
-- ELA DISPENSA O GRUPO INTEIRO, E ISSO NAO E GENEROSIDADE
-- ====================================================================
--
-- A caixa AGRUPA por (tipo, autor, dia), e o `ref` que sai na resposta de uma
-- linha agrupada e o do item MAIS NOVO do grupo -- um de tres, nao os tres.
-- Dispensar so aquele `ref` deixaria os outros dois de pe, e o grupo voltaria
-- na proxima listagem com outro `ref` e `grouped_count` menor: a linha somiria
-- da tela e REAPARECERIA no recarregamento. Esse e exatamente o defeito que
-- este recurso tem de nao ter, e ele nao e hipotetico -- oito dos dez tipos
-- agrupam.
--
-- Entao a unidade da dispensa e a LINHA que a pessoa ve, e nao o item que o
-- `ref` endereca. A chave de grupo e calculada aqui com a MESMA regra de
-- `caixa_de_notificacoes`: `notificacao_nunca_agrupa(text)` decide, e quando
-- ela e verdadeira o grupo e o proprio item (plaquinha e achado nunca agrupam,
-- e o `ref` deles ja e a linha inteira).
--
-- `IS NOT DISTINCT FROM` no autor, e nao `=`: o autor e ANULAVEL, e a chave da
-- listagem agrupa nulo com nulo (`COALESCE(author_user_id::text, '-')`). Com
-- `=` o grupo sem autor -- que e a maioria -- nunca casaria consigo mesmo, e a
-- dispensa recairia sobre uma linha so, de volta ao defeito.
--
-- O resto da forma e irmao de `notificacao_marcar_lida(uuid, text)` de
-- proposito -- mesmo `WHERE` com o dono, mesmo `COALESCE` idempotente --,
-- porque as duas respondem a mesma pergunta de autorizacao e precisam
-- responder 404 do mesmo jeito. O que ela NAO faz e a parte que importa: ela
-- nao toca `read_at`.
CREATE FUNCTION notificacao_dispensar(p_usuario uuid, p_ref text) RETURNS boolean
LANGUAGE sql VOLATILE AS $$
  WITH alvo AS (
    SELECT i.id,
           i.item_kind,
           i.author_user_id,
           i.occurred_at,
           notificacao_nunca_agrupa(i.item_kind) AS sozinho
      FROM notification_items i
     WHERE i.recipient_user_id = p_usuario
       AND i.ref = p_ref
       AND conta_habilitada(p_usuario)
  ),
  dispensadas AS (
    UPDATE notification_items i
       SET dismissed_at = COALESCE(i.dismissed_at, now())
      FROM alvo a
     WHERE i.recipient_user_id = p_usuario
       AND i.occurred_at > now() - interval '90 days'
       AND (
         (a.sozinho AND i.id = a.id)
         OR (
           NOT a.sozinho
           AND i.item_kind = a.item_kind
           AND i.author_user_id IS NOT DISTINCT FROM a.author_user_id
           AND date_trunc('day', i.occurred_at) = date_trunc('day', a.occurred_at)
         )
       )
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM dispensadas)
$$;

COMMENT ON FUNCTION notificacao_dispensar(uuid, text) IS
  'DISPENSA a LINHA da caixa -- o "x" (cliente, 20/10/2026) --, e devolve VERDADEIRO quando ela existia para esta conta. DISPENSA O GRUPO INTEIRO, e nao so o item do ref: a caixa agrupa por (tipo, autor, dia) e o ref de uma linha agrupada e o do item MAIS NOVO, entao dispensar so ele deixaria os outros de pe e o grupo voltaria na proxima listagem com outro ref -- a linha somiria da tela e REAPARECERIA no recarregamento, que e o defeito que este recurso tem de nao ter. A chave de grupo usa a MESMA regra de caixa_de_notificacoes(uuid, integer, integer), por notificacao_nunca_agrupa(text): plaquinha e achado nunca agrupam e o grupo deles e o proprio item. IS NOT DISTINCT FROM no autor porque o autor e ANULAVEL e a listagem agrupa nulo com nulo -- com = o grupo sem autor nunca casaria consigo mesmo. NAO TOCA read_at, e e essa ausencia que faz os dois eixos serem independentes: dispensar tira da LISTA, ler tira do CONTADOR, e dispensar sem ter lido e o caso comum. Apagamento LOGICO e nunca DELETE, pela razao escrita em notification_items.dismissed_at -- a linha e a evidencia de que o aviso chegou, e apaga-la furaria notification_items_um_por_destinatario e deixaria o gatilho da fonte reinserir o MESMO fato. COALESCE e nao dismissed_at IS NULL no WHERE: dispensar duas vezes e idempotente e nao pode virar 404 na segunda, porque o aparelho reenvia. A AUTORIZACAO E O PROPRIO WHERE: o item de outra conta nao e encontrado, nada e atualizado, a funcao devolve FALSO e a rota responde 404 e NUNCA 403 (ADR-0021), porque um 403 confirmaria que o ref existe. Conta desabilitada nao dispensa nada, delegando a conta_habilitada(uuid).';

-- Down Migration

DROP FUNCTION IF EXISTS notificacao_dispensar(uuid, text);

-- A LEITURA volta a ter SETE colunas de saida, sem destino. `DROP` antes do
-- `CREATE` pelo mesmo motivo da subida, ao contrario: o tipo de retorno muda, e
-- `CREATE OR REPLACE` recusaria. A ordem importa -- `caixa_de_notificacoes`
-- sai primeiro, porque e ela que chama `notificacao_destino`.
DROP FUNCTION IF EXISTS caixa_de_notificacoes(uuid, integer, integer);
DROP FUNCTION IF EXISTS notificacao_destino(text, uuid);

-- As tres funcoes voltam ao corpo da `20261018000020`, sem o predicado novo.

CREATE OR REPLACE FUNCTION notificacoes_marcar_todas_lidas(p_usuario uuid) RETURNS integer
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

CREATE OR REPLACE FUNCTION contagem_de_notificacoes(p_usuario uuid) RETURNS integer
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

DROP INDEX notification_items_nao_lidos;

CREATE INDEX notification_items_nao_lidos
  ON notification_items (recipient_user_id, occurred_at DESC)
  WHERE read_at IS NULL;

DROP INDEX notification_items_da_caixa;

CREATE INDEX notification_items_da_caixa
  ON notification_items (recipient_user_id, occurred_at DESC);

ALTER TABLE notification_items DROP COLUMN dismissed_at;
