-- DISPENSAR UMA NOTIFICACAO: o "x" de cada linha da caixa.
--
-- Pedido do cliente (20/10/2026): "na notificacao alem da acao de marcar como
-- lida, cada notificacao tem que ter um x para fechar aquela notificacao para
-- ir limpando a lista".
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

-- A LISTA: uma linha dispensada nao aparece, e nao volta no recarregamento.
--
-- O filtro entra em `visiveis`, que e o CTE de onde o agrupamento e o
-- `total_de_grupos` saem -- e nao numa clausula depois. Filtrar depois do
-- `GROUP BY` deixaria o dispensado contando no total e no `agrupados`: a linha
-- diria "Resume 3 avisos" sobre dois, e o rodape prometeria uma pagina
-- seguinte que nao existe.
CREATE OR REPLACE FUNCTION caixa_de_notificacoes(
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
  'UMA PAGINA DA CAIXA DE NOTIFICACOES, ja agrupada. Devolve TABELA e nao json porque a rota projeta campo a campo. AGRUPAMENTO por (tipo, autor, dia): uma linha por combinacao por dia, com agrupados dizendo quantos avisos ela resume. Plaquinha e achado NUNCA agrupam -- a chave deles e o proprio id --, e o ponto unico dessa regra e notificacao_nunca_agrupa(text): "2 avisos de plaquinha" esconderia qual pet. RETENCAO de 90 dias, contada de occurred_at (o fato) e nao de created_at (a linha). O DISPENSADO NAO APARECE (dismissed_at IS NULL, 20261020000011), e o filtro entra em visiveis e nao depois do GROUP BY: filtrar depois deixaria o dispensado contando em agrupados e em total_de_grupos, e a linha diria "Resume 3 avisos" sobre dois. A AUTORIZACAO E O PROPRIO WHERE: nao ha caminho por aqui para a caixa de outra conta, e por isso a rota responde 404 e nunca 403 (ADR-0021). Conta desabilitada devolve ZERO linhas, delegando a conta_habilitada(uuid) (20261017000013) -- este e o LUGAR 1 dos tres, e filtrar em um lugar so e o defeito que a fila da Rede produziu ("1 pendente" sobre fila vazia). NAO projeta author_user_id (parametro de agrupamento, nunca saida) nem id (ADR-0010). Nao devolve imagem nenhuma, de proposito: 0 KB por pagina, para nao trazer a foto do pet a uma quarta superficie.';

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

CREATE OR REPLACE FUNCTION caixa_de_notificacoes(
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
