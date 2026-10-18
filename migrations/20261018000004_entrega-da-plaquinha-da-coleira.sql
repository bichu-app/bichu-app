-- A ENTREGA da plaquinha da coleira: os passos que o tutor acompanha, e o
-- codigo de rastreio que o administrador digita.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE
-- ====================================================================
--
-- A `20261017000012` criou `collar_tag_requests` com TRES valores de `status`
-- -- `pending`, `fulfilled`, `declined` -- e isso cobria a DECISAO do painel:
-- atender ou recusar. O que ela nao cobria e o que acontece DEPOIS de atender,
-- e e exatamente ali que o tutor fica sem resposta: a plaquinha foi aceita, e
-- ninguem sabe dizer se ela esta no caminho ou se ja chegou.
--
-- Palavras do cliente, 18/10: "deve ser inserido uma rota no backoffice para o
-- adminstrador mudar o status da entrega e inserir o codigo de rastreio e
-- atualizar a entrega". E, do lado do aplicativo, uma pagina privada em que a
-- pessoa acompanha SO as plaquinhas dela, com os passos -- solicitado, em
-- transporte, chegou -- e o codigo de rastreio.
--
-- ====================================================================
-- DOIS EIXOS, E A ESCOLHA FOI MEDIDA E NAO PREFERIDA
-- ====================================================================
--
-- O desenho obvio era alargar `status`: acrescentar `delivered` ao `CHECK` e
-- deixar `pending` ser "solicitado", `fulfilled` ser "em transporte" e
-- `delivered` ser "chegou". UM eixo, um campo para a tela ler, nenhuma
-- combinacao impossivel. Foi a primeira forma escrita desta migracao.
--
-- **`oasdiff` reprovou, e a reprovacao foi colada e nao suposta.** Acrescentar
-- valor a `enum` de RESPOSTA e quebra de contrato pela regra
-- `response-property-enum-value-added`, e ela saiu em nivel `error` QUATRO
-- vezes -- uma por operacao que projeta o estado:
--
--     4 changes: 4 error, 0 warning, 0 info
--     error [response-property-enum-value-added] in API GET /admin/tag-requests
--     error [response-property-enum-value-added] in API POST /admin/tag-requests/{requestRef}/decline
--     error [response-property-enum-value-added] in API POST /admin/tag-requests/{requestRef}/fulfillment
--     error [response-property-enum-value-added] in API POST /pets/{petId}/tag-requests
--
-- O caminho da casa para essa quebra e DISPENSA DATADA, uma por operacao, que
-- caduca no merge -- e o que as `oasdiff-unidade-nova-*` e as
-- `oasdiff-descricao-do-encontro-ate-200-*` fizeram, e as duas ja sairam de
-- `.github/quality-gates.yml` depois de cumprirem o prazo. **Dispensar nao e
-- uma opcao nesta frente**, e entao o desenho muda em vez de o portao ser
-- desligado. Campo ACRESCENTADO nao quebra ninguem; valor acrescentado a
-- `enum` existente quebra.
--
-- Entao a entrega ganha o EIXO PROPRIO, `delivery_state`, e `status` nao e
-- tocado -- nem no `CHECK`, nem no conjunto de valores, nem no significado que
-- as respostas antigas carregam.
--
-- ## E as combinacoes impossiveis?
--
-- Essa e a objecao real a dois eixos, e e a mesma que a `20261017000016`
-- escreveu sobre `approved_entry_id`: eixos independentes produzem linhas que
-- nao sao estado nenhum. `status = 'declined'` com `delivery_state = 'arrived'`
-- seria uma plaquinha que chegou depois de o pedido ter sido recusado.
--
-- Aqui os eixos **nao sao independentes**, e e o banco que garante isso:
--
--     CHECK (delivery_state = 'requested' OR status = 'fulfilled')
--
-- Sair de `requested` exige pedido ATENDIDO. Com esse unico `CHECK`, toda
-- combinacao incoerente deixa de existir -- recusado nunca anda, pendente nunca
-- anda, e nao ha par a conferir na aplicacao.
--
-- ## E o nulo lido como passo?
--
-- Nao ha nulo. `delivery_state` e `NOT NULL DEFAULT 'requested'`: todo pedido
-- que existe, inclusive os que existiam antes desta migracao, tem um passo
-- escrito. A tela le UM campo e desenha UM passo, e nunca precisa inferir
-- "solicitado" da ausencia de valor -- que era o defeito de que se tinha medo.
--
--     solicitado    -> `delivery_state = 'requested'`   (DEFAULT)
--     em transporte -> `delivery_state = 'in_transit'`
--     chegou        -> `delivery_state = 'arrived'`
--
-- `status = 'declined'` continua sendo a recusa, e ela e do outro eixo porque e
-- outra coisa: o pedido nao foi aceito, e nao "a entrega nao andou".
--
-- ## O que `fulfilled` passa a querer dizer
--
-- A `20261017000012` escreveu, no `COMMENT ON COLUMN`, que `fulfilled` quer
-- dizer "a plaquinha SAIU". Com o eixo novo, "saiu" vira
-- `delivery_state = 'in_transit'`, e `fulfilled` fica com o sentido estreito de
-- **o painel aceitou o pedido**. O `COMMENT` e reescrito no fim desta migracao
-- para dizer isso, porque um comentario que descreve o desenho antigo e pior que
-- comentario nenhum.
--
-- Isso NAO muda nenhuma resposta ja emitida e nao reescreve nenhuma linha:
-- `fulfilled` continua sendo `fulfilled`, e pedido atendido antes desta
-- migracao nasce em `requested`, que e a verdade sobre ele -- ninguem registrou
-- despacho nenhum.
--
-- ====================================================================
-- NENHUM `CHECK` DESTA MIGRACAO PODE REPROVAR SOBRE LINHA EXISTENTE
-- ====================================================================
--
-- `ALTER TABLE ... ADD CONSTRAINT` VALIDA A TABELA INTEIRA, e uma reprovacao
-- aqui travaria o banco para todas as migracoes seguintes, de todos os agentes,
-- pelo `checkOrder` do `node-pg-migrate`. A `20261017000016` pagou esse preco
-- em analise e deixou o aviso escrito; esta migracao o respeita, e o argumento
-- vale para cada uma das travas:
--
-- 1. `delivery_state` nasce `NOT NULL DEFAULT 'requested'`, entao toda linha
--    existente passa a valer `'requested'`. O `CHECK` do conjunto aceita esse
--    valor;
-- 2. `entrega_exige_atendimento` e de UMA VIA e o lado esquerdo e verdadeiro
--    para toda linha existente (`delivery_state = 'requested'`), entao a
--    disjuncao e verdadeira sem olhar `status`;
-- 3. `rastreio_so_apos_sair` e de uma via sobre uma coluna que acabou de
--    nascer: `tracking_code IS NULL` em toda linha;
-- 4. os dois BICONDICIONAIS -- `despacho_tem_instante` e
--    `chegada_tem_instante` -- sao seguros porque **os dois lados sao novos**.
--    Nenhuma linha pode ter `delivery_state` diferente de `'requested'` (o
--    valor acabou de ser introduzido com `DEFAULT`) nem `shipped_at` ou
--    `delivered_at` preenchidos (as colunas acabaram de nascer), entao toda
--    linha existente vale `falso = falso`, que e verdadeiro. A forma de uma via
--    so e necessaria quando ha estado anterior que ela poderia reprovar.
--
-- `ADD COLUMN ... NOT NULL DEFAULT` nao reescreve a tabela no Postgres 11+: o
-- valor vai no catalogo e as linhas antigas o leem de la.
--
-- ====================================================================
-- OS CARIMBOS SAO PROPRIOS, E NAO `decided_at` RECICLADO
-- ====================================================================
--
-- `shipped_at` e `delivered_at` nascem como colunas, em vez de a tela derivar
-- "quando saiu" de `decided_at`. O motivo e que `decided_at` guarda tambem o
-- instante da RECUSA -- o `CHECK` `decidido_tem_instante` o exige para
-- `declined` --, e chamar aquilo de "saiu" seria mentir sobre uma plaquinha que
-- nunca foi despachada.
--
-- Com os dois, a pagina privada do aplicativo tem TRES carimbos para TRES
-- passos -- `requested_at`, `shipped_at`, `delivered_at` -- e nao deriva data de
-- estado nenhum.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO **NAO** VALIDA NO CODIGO DE RASTREIO
-- ====================================================================
--
-- Nao ha `CHECK` de formato de transportadora, e a ausencia e deliberada. O
-- formato dos Correios tem 13 simbolos; FedEx tem de 12 a 22; DHL tem 10;
-- transportadora regional tem o que quiser, e muda. Um `CHECK` com o formato de
-- hoje recusaria, em producao e sem aviso, o rastreio legitimo de amanha -- e o
-- administrador ficaria sem como registrar um envio que existe.
--
-- O que se recusa e so o que e claramente invalido:
--
-- - **vazio, ou so espaco.** `btrim(tracking_code) = tracking_code` mais o
--   minimo de 3 simbolos: `'   '` nao passa, e `''` nao passa. A aplicacao
--   normaliza antes (`trim`), e campo vazio vira NULO em vez de texto vazio --
--   guardar `''` e guardar "tem rastreio" sobre um rastreio que nao existe;
-- - **tamanho absurdo.** O teto e 64. Nenhum rastreio de transportadora passa de
--   perto disso, e o numero existe para que a coluna nao receba um texto colado
--   por engano. Nao e uma afirmacao sobre formato: e um teto de tamanho.
--
-- **E NAO HA INTEGRACAO COM TRANSPORTADORA.** O codigo de rastreio e TEXTO que
-- o administrador digita. Nada neste projeto consulta Correios nem ninguem:
-- seria custo recorrente e decisao do cliente, e ele nao a tomou.
--
-- ====================================================================
-- O ENDERECO CONTINUA FORA DA TRILHA, E ISSO NAO MUDA AQUI
-- ====================================================================
--
-- A `20261017000012` fixou quatro regras para o endereco de entrega, e as
-- quatro seguem valendo sem alteracao: so o necessario para entregar; nada
-- geocodificado (ADR-0006); nao sai em superficie publica; **e nao entra na
-- trilha de auditoria**. A acao nova desta frente --
-- `admin.collar_tag_request.delivery_updated` -- registra `delivery_state` e
-- `tracking_code` pelo `id` interno e pelo `ref`, e **nenhum campo de
-- endereco**, nem em `before`, nem em `after`, nem em `metadata`.
--
-- O codigo de rastreio, por outro lado, ENTRA na trilha de proposito: ele nao e
-- dado pessoal de ninguem -- e um numero de encomenda --, e e justamente o campo
-- cuja mudanca alguem vai querer auditar depois ("quem trocou o rastreio?").
--
-- ====================================================================
-- O QUE A PESSOA PASSA A LER
-- ====================================================================
--
-- `delivery_state`, `tracking_code`, `shipped_at` e `delivered_at` saem para o
-- DONO do pedido, e a autorizacao e a mesma de sempre: clausula `WHERE` com
-- `pets.owner_user_id = <chamador>`, 404 e nunca 403 (ADR-0021). Nenhum dos
-- quatro sai em superficie sem conta.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. O EIXO DA ENTREGA. `NOT NULL DEFAULT 'requested'`: todo pedido que existe
--    ganha um passo escrito, e a tela nunca le nulo como passo.
-- ---------------------------------------------------------------------------
ALTER TABLE collar_tag_requests
  ADD COLUMN delivery_state text NOT NULL DEFAULT 'requested'
      CONSTRAINT collar_tag_requests_entrega_conhecida
      CHECK (delivery_state IN ('requested', 'in_transit', 'arrived')),

  ADD COLUMN tracking_code text
      CONSTRAINT collar_tag_requests_rastreio_tamanho
      CHECK (tracking_code IS NULL OR char_length(tracking_code) BETWEEN 3 AND 64)
      CONSTRAINT collar_tag_requests_rastreio_sem_borda_em_branco
      CHECK (tracking_code IS NULL OR btrim(tracking_code) = tracking_code),

  ADD COLUMN shipped_at   timestamptz,
  ADD COLUMN delivered_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. AS TRAVAS QUE LIGAM OS DOIS EIXOS.
--
-- A primeira e a que responde a objecao a dois eixos: com ela, nao existe
-- recusado-que-chegou nem pendente-em-transporte, e nenhuma conferencia de par
-- precisa ser escrita na aplicacao.
-- ---------------------------------------------------------------------------
ALTER TABLE collar_tag_requests
  ADD CONSTRAINT collar_tag_requests_entrega_exige_atendimento
      CHECK (delivery_state = 'requested' OR status = 'fulfilled'),

  -- Rastreio em pedido que nao saiu nao e rastreio de nada. UMA VIA porque o
  -- rastreio e OPCIONAL: "saiu" nao exige rastreio, e exigir barraria entrega
  -- em maos e correio simples.
  ADD CONSTRAINT collar_tag_requests_rastreio_so_apos_sair
      CHECK (tracking_code IS NULL OR delivery_state <> 'requested'),

  -- BICONDICIONAIS, e seguros porque os dois lados sao novos. Ver a secao
  -- "nenhum CHECK desta migracao pode reprovar sobre linha existente".
  ADD CONSTRAINT collar_tag_requests_despacho_tem_instante
      CHECK ((delivery_state IN ('in_transit', 'arrived')) = (shipped_at IS NOT NULL)),

  ADD CONSTRAINT collar_tag_requests_chegada_tem_instante
      CHECK ((delivery_state = 'arrived') = (delivered_at IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 3. O INDICE DA FILA DE ENTREGA.
--
-- `collar_tag_requests_fila` e PARCIAL em `status = 'pending'` e serve a fila da
-- DECISAO. A fila da ENTREGA e outra consulta -- "o que esta em transporte" --
-- e nao tinha indice nenhum. Composto, na mesma ordem em que a listagem le
-- (`WHERE delivery_state = ? ORDER BY requested_at ASC`).
-- ---------------------------------------------------------------------------
CREATE INDEX collar_tag_requests_entrega
  ON collar_tag_requests (delivery_state, requested_at);

COMMENT ON COLUMN collar_tag_requests.delivery_state IS
  'O EIXO DA ENTREGA, e os tres passos que a pagina privada do aplicativo desenha: `requested` e "solicitado", `in_transit` e "em transporte", `arrived` e "chegou". NOT NULL DEFAULT requested, de proposito: todo pedido tem um passo escrito e a tela nunca infere passo de um nulo. E um eixo SEPARADO de `status` porque acrescentar valor a uma `enum` de resposta quebra o contrato (`oasdiff`, regra response-property-enum-value-added, quatro erros medidos) -- campo acrescentado nao quebra ninguem. Os eixos NAO sao independentes: collar_tag_requests_entrega_exige_atendimento proibe sair de requested sem o pedido estar fulfilled, e com isso recusado-que-chegou e pendente-em-transporte deixam de existir no banco. Os rotulos em portugues sao do painel e do aplicativo; o valor gravado e este.';

COMMENT ON COLUMN collar_tag_requests.tracking_code IS
  'O codigo de rastreio da encomenda, TEXTO que o administrador digita. OPCIONAL: nem todo envio tem rastreio (entrega em maos, correio simples), e exigi-lo barraria envio legitimo -- por isso a trava de coerencia e de uma via. NAO HA VALIDACAO DE FORMATO DE TRANSPORTADORA, de proposito: Correios tem 13 simbolos, FedEx de 12 a 22, DHL 10, regional tem o que quiser e muda, e um CHECK com o formato de hoje recusaria o rastreio legitimo de amanha. Recusa-se so o claramente invalido: 3 a 64 simbolos e sem espaco nas bordas. NAO HA INTEGRACAO COM TRANSPORTADORA: nada neste projeto consulta Correios nem ninguem, que seria custo recorrente e decisao do cliente. Sai para o DONO do pedido e para a administracao; nunca em superficie sem conta. ENTRA na trilha de auditoria, ao contrario do endereco: e numero de encomenda e nao dado pessoal, e e o campo cuja troca alguem vai querer auditar.';

COMMENT ON COLUMN collar_tag_requests.shipped_at IS
  'Quando a plaquinha SAIU, o carimbo do passo "em transporte". Coluna propria, e nao `decided_at` reciclado: `decided_at` guarda tambem o instante da RECUSA (o CHECK decidido_tem_instante o exige para declined), e chamar aquilo de "saiu" seria mentir sobre uma plaquinha que nunca foi despachada. Nao zera quando a encomenda chega: `arrived` tambem ja saiu, e e isso que o CHECK despacho_tem_instante cobra.';

COMMENT ON COLUMN collar_tag_requests.delivered_at IS
  'Quando a plaquinha CHEGOU, o carimbo do passo "chegou". Nulo em tudo que nao chegou, pelo CHECK chegada_tem_instante, que e BICONDICIONAL -- seguro porque a coluna e o valor `arrived` nascem na mesma migracao e nenhuma linha anterior pode violar. Com `requested_at` e `shipped_at`, fecha os TRES carimbos dos tres passos: a tela nao deriva data de estado nenhum.';

-- `fulfilled` ESTREITA o sentido, e o comentario antigo sai junto. Ele dizia "a
-- plaquinha saiu"; "saiu" agora e `delivery_state = 'in_transit'`, e `status`
-- volta a ser so a decisao do painel. Nenhuma linha e reescrita e nenhuma
-- resposta muda de forma: pedido atendido antes desta migracao nasce em
-- `requested`, que e a verdade sobre ele -- ninguem registrou despacho nenhum.
COMMENT ON COLUMN collar_tag_requests.status IS
  'A DECISAO do painel, e so ela: `pending` ate alguem decidir, `fulfilled` quer dizer que o pedido foi ACEITO, `declined` que foi recusado. Nao diz onde a encomenda esta -- isso e `delivery_state`, que e o eixo da entrega. Ate a migracao 20261018000004 este comentario dizia que `fulfilled` era "a plaquinha saiu"; "saiu" passou a ser delivery_state = in_transit, e o sentido aqui estreitou para o aceite. `fulfilled` NAO quer dizer que o codigo foi emitido: emitir e issuePetTag, e o codigo e irreversivel (ADR-0004).';

-- Down Migration

-- Descer com entrega registrada APAGA trabalho de pessoa: o rastreio foi
-- digitado por quem despachou, e a chegada foi marcada por quem conferiu. Mesma
-- forma do `down` da `20261017000016`, e pelo mesmo motivo -- a descida reprova
-- em voz alta em vez de descartar trabalho em silencio.
--
-- `RAISE NOTICE` nao serviria de aviso: o `node-pg-migrate` descarta
-- `NOTICE`/`WARNING` e ninguem le. O que precisa ser recusado e recusado com
-- `RAISE EXCEPTION`.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM collar_tag_requests
              WHERE delivery_state <> 'requested'
                 OR tracking_code IS NOT NULL
                 OR shipped_at IS NOT NULL
                 OR delivered_at IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha entrega registrada: reverter apagaria o codigo de rastreio digitado por quem despachou e a chegada marcada por quem conferiu. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

DROP INDEX collar_tag_requests_entrega;

ALTER TABLE collar_tag_requests
  DROP CONSTRAINT collar_tag_requests_chegada_tem_instante,
  DROP CONSTRAINT collar_tag_requests_despacho_tem_instante,
  DROP CONSTRAINT collar_tag_requests_rastreio_so_apos_sair,
  DROP CONSTRAINT collar_tag_requests_entrega_exige_atendimento,
  DROP COLUMN delivered_at,
  DROP COLUMN shipped_at,
  DROP COLUMN tracking_code,
  DROP COLUMN delivery_state;

-- O comentario de `status` volta ao texto da `20261017000012`: descer esta
-- migracao devolve o desenho de um eixo, em que "saiu" era `fulfilled`.
COMMENT ON COLUMN collar_tag_requests.status IS
  '`pending` ate o painel decidir. `fulfilled` quer dizer que a plaquinha saiu, e nao que o codigo foi emitido.';
