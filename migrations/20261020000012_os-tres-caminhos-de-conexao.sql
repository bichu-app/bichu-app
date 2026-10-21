-- OS TRES CAMINHOS DE CONEXAO: BUSCA, QR E LINK DE CONVITE. Decisao do cliente
-- de 20/10/2026, nas palavras dele:
--
--   "vamos implementar a busca pelo usuario, mas vamos implementar tambem o
--    qr-code no perfil do usuario para que o convidado possa escanear e
--    conectar com o usuario presencialmente e vamos implementar o link de
--    convite, para o usuario compartilhar no whatsapp por exemplo e ao clicar
--    vai para a pagina do perfil do usuario com o botao de adicionar"
--
-- ===========================================================================
-- ESTA MIGRACAO REVERTE, DE PROPOSITO, O QUE A `20261018000030` FECHOU
-- ===========================================================================
--
-- A `20261018000030` escreveu, ao lado da coluna `origin`:
--
--   "Nao existe quarto valor, e nao existe caminho por apelido, por busca nem
--    por link."
--
-- O cliente pediu **os tres**. A lista fechada fez exatamente o trabalho para o
-- qual nasceu: ela obrigou a decisao a passar por uma migracao, e e por isso
-- que esta existe em vez de alguem ter acrescentado um `if` numa borda. A frase
-- acima **deixa de valer** nesta data, e o `COMMENT ON COLUMN` desta migracao a
-- substitui -- comentario que contradiz o codigo e defeito, e um comentario
-- que contradiz a DECISAO e pior, porque ele parece autoridade.
--
-- O que **nao** foi revertido, e continua inteiro:
--
--   * nao existe lista de conexoes, nem para o dono (plano 4-B);
--   * nao existe "seguir" e nao existe timeline de quem se segue;
--   * nao existe identificador interno em saida (ADR-0010 item 6);
--   * o aceite continua obrigatorio -- os tres caminhos criam `pending`, e
--     nenhum deles cria `accepted`.
--
-- ===========================================================================
-- DOIS VALORES NOVOS EM `origin`, E NAO UM NEM TRES
-- ===========================================================================
--
-- O cliente descreveu tres caminhos; eles sao **dois** valores de procedencia, e
-- a conta e dele mesmo: *"o qr-code ... para que o convidado possa escanear"* e
-- *"o link de convite, para o usuario compartilhar"* sao o MESMO segredo em
-- dois transportes -- o QR e o link codificado em imagem. Um valor por
-- TRANSPORTE registraria como a pessoa leu a tela, que nao e procedencia e que
-- o servidor nao tem como conferir: quem resolve um token nao sabe, e nao pode
-- saber, se ele chegou por camera ou por WhatsApp.
--
--   * `invite_link` -- o pedido nasceu de um convite emitido pelo dono do
--     perfil, resolvido por `POST /connections` com `invite_token`. Cobre o QR
--     e o link, porque os dois carregam o mesmo token.
--   * `people_search` -- o pedido nasceu da busca, resolvido por
--     `POST /connections` com `handle`. Aqui nao houve convite nenhum: quem
--     pede achou a pessoa e pediu.
--
-- A diferenca entre os dois **e verificavel pelo servidor**, e e so por isso que
-- ela e gravavel: cada um corresponde a qual credencial a requisicao carregou.
-- `origin` continua dizendo de onde o pedido nasceu, e continua nao sendo
-- palpite.
--
-- `presence_code` **fica, e nao foi reaproveitado para o QR**. Ele e a fatia H''
-- que nunca desceu: token curto e ROTATIVO de 5 min, para codigo mostrado cara a
-- cara. O QR que o cliente pediu e outra coisa -- ele mora no perfil, e quem o
-- mostra quer que ele continue valendo amanha. Enfiar o QR em `presence_code`
-- faria a procedencia de um link duravel se declarar como codigo rotativo, e a
-- primeira pessoa a consultar `origin` para medir risco leria o contrario do que
-- aconteceu. A lista continua fechada, e agora em CINCO.
--
-- ===========================================================================
-- VALIDADE, REUSO E REVOGACAO DO CONVITE -- A DECISAO, COM O MOTIVO
-- ===========================================================================
--
-- O cliente nao especificou nenhum dos tres. Eles sao decididos aqui porque um
-- convite sem prazo, sem regra de reuso e sem revogacao nao e um convite: e um
-- endereco publico permanente, que e exatamente o que o plano 4-B.1 matou com a
-- frase *"um endereco estavel e compartilhavel vira endereco publico no primeiro
-- grupo em que alguem o cola"*.
--
-- **REUSO: um convite serve para VARIAS pessoas.** E o que o pedido descreve:
-- *"compartilhar no whatsapp"* e, na pratica, mandar para um grupo, e um QR no
-- perfil e mostrado a quem passar. Um convite de uso unico funcionaria para a
-- primeira pessoa e falharia calado para todas as outras do grupo -- e, pior,
-- quem compartilhou **nao teria como saber**, porque a falha acontece na tela de
-- outra pessoa. Esse e o modo de falha mais caro possivel num produto de
-- vizinhanca. O freio do volume nao e o uso unico: e o teto de 150 conexoes, o
-- de 20 pendentes e o de 10 pedidos por dia, que a `20261018000030` ja cobra na
-- clausula `WHERE` e que **continuam valendo em cada pedido que o convite
-- gera**. Um link reusado nao compra conexao nenhuma sem aceite.
--
-- **VALIDADE: 30 dias.** O numero nao e novo -- e o mesmo `expires_at` do pedido
-- pendente da `20261018000030`, e reusa-lo e deliberado: dois prazos diferentes
-- para "quanto tempo uma intencao de conexao sobrevive" obrigariam a defender os
-- dois. O prazo e o que impede o link colado num grupo de virar endereco
-- permanente: ele para de resolver sozinho, sem ninguem precisar lembrar.
--
-- **REVOGACAO: explicita, e emitir de novo revoga o anterior.** Uma vez que um
-- link vaza para onde nao devia, o unico remedio e mata-lo -- entao a revogacao
-- nao e um extra, e a razao de o convite ser uma LINHA e nao um token assinado
-- sem estado. Um token assinado seria mais barato e **nao revogavel**, e isso o
-- descarta inteiro.
--
-- **UM convite ativo por conta**, garantido pelo indice parcial unico abaixo.
-- Varios simultaneos tornariam "quantos links meus estao soltos por ai?" uma
-- pergunta sem resposta para o dono -- e e a pergunta que ele faz justamente
-- quando algo deu errado. Com um, a tela do perfil mostra um QR, e trocar o QR
-- e um ato unico com consequencia obvia.
--
-- **O que isto NAO abre:** o convite nao cria conexao, nao dispensa aceite, nao
-- da acesso a vitrine e nao carrega identificador interno. Ele resolve para um
-- PERFIL -- o mesmo recorte da emenda 2 do ADR-0010 que `getPersonProfile` ja
-- serve -- e o botao de adicionar continua criando `pending`.
--
-- ===========================================================================
-- O TOKEN: 32 BYTES DE RESUMO, NUNCA O TOKEN CRU
-- ===========================================================================
--
-- `token_hash` guarda os **32 bytes** do SHA-256, com `CHECK
-- (octet_length(token_hash) = 32)` desde o nascimento. O precedente e a
-- `20261020000008`, e ela ensina as duas metades:
--
--   1. a coluna que nasce COM a restricao nunca divergiu -- `found_reports` e
--      `pet_transfers` sao a prova, e e por isso que a restricao esta aqui e nao
--      numa migracao de conserto depois;
--   2. `Buffer.from(hash)` sem segundo argumento grava os 44 bytes ASCII do
--      texto base64. O codigo desta fatia usa `hashDeToken`, que ja devolve
--      `Buffer`, e nao ha conversao nenhuma para errar.
--
-- O token CRU nunca e gravado: ele existe uma vez, na resposta de
-- `issueConnectionInvite`, e depois so o resumo. Quem perde o link emite outro.
--
-- Nao ha `audit.events` nesta migracao porque **nao ha dado a converter**: a
-- tabela nasce vazia. A `20261020000008` registrou contagem por ter mexido em
-- linha existente, e `node-pg-migrate` descarta `NOTICE` -- o que vale lembrar
-- aqui e que, se algum dia esta tabela precisar de conversao, a contagem vai
-- para `audit.events` e nao para `RAISE NOTICE`.
--
-- ===========================================================================
-- OS INDICES DA BUSCA, E POR QUE O PISO DE 3 CARACTERES NAO E GOSTO
-- ===========================================================================
--
-- A busca casa por SUBSTRING tolerante a acento e a caixa, em **nome de
-- exibicao e apelido**. A normalizacao e `texto_para_busca`, a funcao que a
-- `20260928000006` criou para o diretorio -- a MESMA, e nao uma copia: o indice
-- e construido sobre uma expressao e o predicado precisa ser a mesma expressao,
-- caractere a caractere, ou o planejador nao casa os dois e o indice fica de
-- enfeite.
--
-- GIN trigrama pela razao escrita naquela migracao: `LIKE '%texto%'` nao tem
-- prefixo, e sem prefixo um B-tree nao tem por onde comecar. **E o trigrama e o
-- que da o piso de tres caracteres**: um padrao com menos de tres caracteres nao
-- produz trigrama nenhum e a consulta volta a varrer a tabela inteira. O
-- `minLength: 3` do contrato e a consulta mais curta devolvendo lista vazia
-- **sao esse piso**, e nao uma preferencia de produto -- e a decisao do cliente
-- ("minimo de 3 caracteres") cai exatamente sobre ele.
--
-- `handles.handle` e `citext` e PRIMARY KEY, entao a igualdade ja tem indice. O
-- trigrama aqui atende a BUSCA por substring, que e outra consulta.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. `origin` ganha os dois valores, e a lista continua FECHADA
-- ---------------------------------------------------------------------------
--
-- `DROP` e `ADD` na mesma transacao, e nao um `CHECK` novo ao lado: duas
-- restricoes sobre a mesma coluna deixariam a lista verdadeira sendo a
-- INTERSECAO de duas listas escritas em lugares diferentes, que e a forma de
-- ninguem mais saber qual e a lista.
--
-- Sem `NOT VALID`: a tabela e pequena e toda linha existente tem um dos tres
-- valores antigos, que continuam na lista nova. Uma restricao que nasce nao
-- validada nao responde pelo passado, e aqui o passado passa.
ALTER TABLE user_connections
  DROP CONSTRAINT user_connections_origem_fechada;

ALTER TABLE user_connections
  ADD CONSTRAINT user_connections_origem_fechada
  CHECK (origin IN ('anchored_case', 'anchored_event', 'presence_code',
                    'invite_link', 'people_search'));

COMMENT ON COLUMN user_connections.origin IS
  'De onde o pedido NASCEU, em lista FECHADA de CINCO. Os tres primeiros sao de 18/10/2026: anchored_case (caso encerrado como devolvido), anchored_event (encontro em comum) e presence_code (codigo ROTATIVO de 5 min lido cara a cara, fatia H-duas-linhas, nunca construida). Os dois ultimos entraram em 20/10/2026 por decisao do cliente, que pediu busca, QR e link de convite: invite_link (convite emitido pelo dono, resolvido por invite_token -- cobre o QR E o link, porque os dois carregam o mesmo token) e people_search (a busca por nome ou apelido, resolvida por handle). O QR NAO reusa presence_code: aquele e rotativo de 5 min e este mora no perfil e dura 30 dias. A frase da 20261018000030 que dizia "nao existe quarto valor, e nao existe caminho por apelido, por busca nem por link" DEIXOU DE VALER nesta data -- a lista fechada fez o trabalho dela, que era obrigar a decisao a passar por uma migracao. Cada valor corresponde a qual CREDENCIAL a requisicao carregou, e e so por isso que ele e verificavel pelo servidor em vez de palpite.';

-- ---------------------------------------------------------------------------
-- 2. O CONVITE
-- ---------------------------------------------------------------------------

CREATE TABLE connection_invites (
  id              uuid        PRIMARY KEY,

  -- Quem emitiu. O convite e DELE, e resolve para o perfil dele.
  owner_user_id   uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Os 32 BYTES do SHA-256 do token. Ver o cabecalho: a restricao nasce com a
  -- coluna, que e a licao da 20261020000008.
  token_hash      bytea       NOT NULL
                              CONSTRAINT connection_invites_token_hash_32_bytes
                              CHECK (octet_length(token_hash) = 32),

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- 30 dias, o MESMO prazo do pendente da 20261018000030. A expiracao e
  -- PREGUICOSA, como a dali: nenhuma tarefa periodica, porque toda leitura
  -- compara isto com o agora. Linha vencida nao e apagada -- ela so para de
  -- resolver, e e isso que permite `revoked_at` continuar auditavel.
  expires_at      timestamptz NOT NULL,

  -- Revogacao explicita. Emitir de novo preenche este campo no anterior, e e o
  -- indice parcial abaixo que torna "um ativo por conta" uma garantia do banco
  -- em vez de uma promessa da aplicacao.
  revoked_at      timestamptz,

  CONSTRAINT connection_invites_prazo_coerente
    CHECK (expires_at > created_at)
);

COMMENT ON TABLE connection_invites IS
  'O convite de conexao que alimenta o LINK e o QR (decisao do cliente de 20/10/2026). Uma linha por convite, UM ATIVO POR CONTA (indice connection_invites_um_ativo_por_conta). REUSAVEL por varias pessoas, de proposito: "compartilhar no whatsapp" e mandar para um grupo, e uso unico falharia calado para todos menos o primeiro -- sem que quem compartilhou soubesse. O freio do volume nao e o uso unico, sao os tetos de 150/20/10 da 20261018000030, cobrados em CADA pedido que o convite gera. VALE 30 DIAS, o mesmo prazo do pendente, porque dois prazos para "quanto tempo uma intencao de conexao sobrevive" obrigariam a defender os dois. REVOGAVEL, e e por isso que o convite e uma LINHA e nao um token assinado sem estado: token assinado sai mais barato e nao se revoga, e um link que vazou para o grupo errado so tem um remedio. O convite NAO cria conexao e NAO dispensa aceite: ele resolve para um PERFIL, e o botao de adicionar cria pending.';

COMMENT ON COLUMN connection_invites.token_hash IS
  'SHA-256 de 256 bits de CSPRNG: os 32 BYTES do resumo, nunca o texto base64 deles e nunca o token cru. A restricao connection_invites_token_hash_32_bytes nasce com a coluna, que e a licao da 20261020000008 -- as colunas que nasceram com o CHECK (found_reports, pet_transfers) nunca divergiram, e as que nao nasceram atravessaram um mes de esteira guardando 44 bytes de ASCII. O token cru existe UMA vez, na resposta de issueConnectionInvite; quem perde o link emite outro.';

COMMENT ON COLUMN connection_invites.owner_user_id IS
  'Quem emitiu o convite, e para quem ele resolve. NAO sai em resposta nenhuma: ele e predicado de clausula WHERE (ADR-0021), e o que sai e o perfil -- apelido, public_ref, nome e as duas contagens (emenda 2 do ADR-0010).';

COMMENT ON COLUMN connection_invites.expires_at IS
  '30 dias apos a emissao, o MESMO prazo de user_connections.expires_at. A expiracao e PREGUICOSA: toda leitura compara isto com o agora, e nao ha tarefa periodica. Linha vencida NAO e apagada -- ela para de resolver e continua auditavel.';

COMMENT ON COLUMN connection_invites.revoked_at IS
  'Quando o convite foi revogado, por pedido explicito ou por o dono ter emitido outro. NULO e o convite ativo, e o indice parcial connection_invites_um_ativo_por_conta conta exatamente os nulos -- e por isso que "um ativo por conta" e garantia do banco e nao promessa da aplicacao.';

-- A resolucao do token: por `token_hash`, e UNIQUE porque dois convites com o
-- mesmo resumo seriam colisao de SHA-256 ou escrita duplicada, e nos dois casos
-- a leitura precisa ser determinada.
CREATE UNIQUE INDEX connection_invites_token_unico
  ON connection_invites (token_hash);

-- **UM ATIVO POR CONTA.** Parcial em `revoked_at IS NULL`, e o predicado e
-- CONSTANTE (`IS NULL`), nao um parametro -- entao ele nao tem o problema de
-- plano generico que a 20260928000006 documenta para `status = $1`: o
-- planejador prova a implicacao sem precisar ver valor nenhum.
--
-- O vencido NAO conta como ativo aqui, de proposito: a conta cujo convite venceu
-- precisa poder emitir outro, e um unico por conta sem recorte de prazo a
-- deixaria travada para sempre. A consequencia e que uma conta acumula linhas
-- vencidas ao longo do tempo, o que e barato e o que mantem a trilha.
CREATE UNIQUE INDEX connection_invites_um_ativo_por_conta
  ON connection_invites (owner_user_id)
  WHERE revoked_at IS NULL;

COMMENT ON INDEX connection_invites_um_ativo_por_conta IS
  'UM convite ativo por conta. Varios simultaneos tornariam "quantos links meus estao soltos por ai?" uma pergunta sem resposta para o dono -- que e a pergunta que ele faz justamente quando algo deu errado. Parcial em revoked_at IS NULL, predicado CONSTANTE: sem o problema de plano generico que a 20260928000006 registra para parametro. Convite VENCIDO nao conta como ativo, senao a conta ficaria travada para sempre depois do primeiro prazo.';

-- ---------------------------------------------------------------------------
-- 3. OS INDICES DA BUSCA DE PESSOAS
-- ---------------------------------------------------------------------------
--
-- `texto_para_busca` e de `20260928000006`, e e reusada e nao copiada. Ela e
-- `IMMUTABLE STRICT PARALLEL SAFE`, que e o que permite entrar num indice de
-- expressao; o detalhe de `unaccent` precisar da forma de dois argumentos para
-- ser IMMUTABLE esta escrito naquela migracao.

CREATE INDEX users_busca_por_nome
  ON users USING gin (texto_para_busca(display_name) gin_trgm_ops);

COMMENT ON INDEX users_busca_por_nome IS
  'Atende a parte de NOME de GET /v1/people. A expressao indexada e identica a do predicado (texto_para_busca, da 20260928000006); mudar uma sem a outra deixa a busca correta e LENTA, sem erro nenhum. Nao e parcial em conta_habilitada: o predicado da consulta usa a funcao, e um indice parcial sobre ela exigiria que o planejador provasse a implicacao -- o mesmo caminho que a 20260928000006 descartou, medido, para status = $1.';

-- `handle` e `citext`, e `texto_para_busca` recebe `text`. O `::text` esta
-- explicito por legibilidade, e **nao** porque a forma implicita quebraria:
-- MEDIDO em 20/10/2026, Postgres 16.4, com 5000 linhas em `handles` e
-- `enable_seqscan` ligado, os dois predicados -- `texto_para_busca(handle)` e
-- `texto_para_busca(handle::text)` -- produzem o MESMO `Index Cond`
-- (`texto_para_busca((handle)::text) ~~ '%ant%'`) e os dois usam este indice.
-- O planejador normaliza a conversao implicita antes de casar a expressao.
--
-- O registro fica porque o reflexo e acreditar no contrario: a `20260928000006`
-- documenta, com razao, que indice de expressao exige o predicado ser a MESMA
-- expressao caractere a caractere, e daquilo e facil concluir que uma conversao
-- implicita de um lado derrubaria o casamento. Aqui ela nao derruba, e a
-- diferenca e que conversao implicita nao e outra expressao: e a mesma, escrita
-- mais curta. Quem mexer nisto nao precisa reconferir o que ja foi conferido.
CREATE INDEX handles_busca_por_apelido
  ON handles USING gin (texto_para_busca(handle::text) gin_trgm_ops);

COMMENT ON INDEX handles_busca_por_apelido IS
  'Atende a parte de APELIDO de GET /v1/people. O ::text e explicito por legibilidade; medido em 20/10/2026 (Postgres 16.4, 5000 linhas) que texto_para_busca(handle) e texto_para_busca(handle::text) dao o MESMO Index Cond e os dois usam este indice -- o planejador normaliza a conversao implicita. A igualdade de apelido NAO usa este indice: handle e PRIMARY KEY e ja tem o dela.';

-- Down Migration

DROP INDEX IF EXISTS handles_busca_por_apelido;
DROP INDEX IF EXISTS users_busca_por_nome;

DROP TABLE IF EXISTS connection_invites;

-- A descida devolve `origin` a lista de TRES. Ela e segura porque nenhuma linha
-- com os valores novos pode existir num banco que esta descendo esta migracao
-- junto com o codigo que os escreve -- e, se existir (descida de migracao com
-- codigo novo no ar), o `ALTER` REPROVA nomeando a restricao e a tabela, em vez
-- de deixar passar calado. Reprovar e o comportamento certo: apagar a
-- procedencia de arestas reais para a descida passar seria perder dado para
-- fazer um comando funcionar.
ALTER TABLE user_connections
  DROP CONSTRAINT user_connections_origem_fechada;

ALTER TABLE user_connections
  ADD CONSTRAINT user_connections_origem_fechada
  CHECK (origin IN ('anchored_case', 'anchored_event', 'presence_code'));

COMMENT ON COLUMN user_connections.origin IS
  'De onde o pedido NASCEU, em lista FECHADA de tres: anchored_case (caso encerrado como devolvido), anchored_event (encontro em que os dois estiveram) e presence_code (codigo lido cara a cara, token rotativo de 5 min). Sao as fatias H-linha e H-duas-linhas, que NAO sao desta entrega. NAO HA quarto valor, e nao ha caminho por apelido, por busca nem por link: a descoberta por link morreu na decisao de 18/10 (plano 4-B.1). A lista nasce fechada de proposito -- um valor novo obriga a mexer nesta migracao, que e onde a decisao esta escrita.';
