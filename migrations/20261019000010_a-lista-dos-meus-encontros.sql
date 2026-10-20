-- "Meus eventos": a lista dos encontros da PROPRIA conta (19/10/2026).
--
-- POR QUE ESTA MIGRACAO EXISTE: `cancelNetworkEvent` existia desde 17/10 e NAO
-- TINHA CAMINHO. Nada na resposta da agenda diz de quem e o encontro, e o
-- cliente decidiu em 19/10 onde o cancelar mora: *"uma tela com os eventos que
-- voce criou, e o cancelar mora la"*. A tela precisa de uma consulta por AUTOR,
-- e e so isso que esta migracao entrega.
--
-- POR QUE E UMA FUNCAO, e nao um `WHERE` em `src/`: a coluna de autoria de
-- `network_events` leva a marca `NUNCA sai do servidor` (migracao
-- `20260928000001`), e `src/tools/portao-colunas-que-nao-saem.ts` reprova
-- QUALQUER arquivo de `src/` que escreva o nome dela -- inclusive dentro de um
-- `WHERE` e inclusive dentro de um comentario, porque ele compara texto puro.
-- Mesmo arranjo de `network_events_do_autor` (`20261001000005`),
-- `network_events_ativos_do_autor` (idem) e `encontro_com_autor_ativo`
-- (`20261017000014`).
--
-- POR QUE ELA DEVOLVE UM CONJUNTO DE `id`, e nao um booleano por linha: a
-- consulta da tela e `consultaBase(db) ... WHERE e.id IN (SELECT ...)`, e um
-- predicado booleano chamado por linha obrigaria o planejador a varrer a tabela
-- inteira de encontros visiveis e chamar a funcao em cada um. Devolvendo o
-- conjunto, a leitura do autor acontece UMA vez, pelo indice, e o resto e
-- semi-juncao. `encontro_com_autor_ativo` e booleano porque a pergunta dela e
-- sobre uma linha que a consulta JA tem na mao; esta nao e.
--
-- O QUE ELA INCLUI, E O QUE ELA NAO INCLUI:
--
-- - `origin = 'community'`: encontro do painel nao entra NEM quando a conta e a
--   mesma -- ele se administra pelo painel (ADR-0027), e devolve 404 nas duas
--   escritas da comunidade. Uma lista que o mostrasse com `Cancelar` ofereceria
--   uma acao que o servidor recusa.
-- - `publication_status <> 'removed'`: o removido e terminal e nao volta. Nao ha
--   o que a pessoa faca com ele, e `consultaBase` ja o exclui -- a condicao esta
--   aqui tambem porque e **o indice** desta funcao que precisa dela, e um indice
--   parcial que nao casa o predicado da consulta nao e usado.
-- - O **cancelado ENTRA**. Quem cancelou precisa ver que cancelou: a lista e o
--   unico lugar do app onde o proprio encontro aparece nomeado como seu, e uma
--   lista que esconde o cancelado deixa a pessoa sem confirmacao do que fez.
-- - **Nao ha recorte de tempo.** O passado entra, e isso e a diferenca em
--   relacao a agenda (`when` com default `upcoming`): o encontro que acabou
--   continua sendo um encontro que ela criou. A tela ordena, e nao filtra.
--
-- NAO HA `starts_at` NO RETORNO de proposito: o `id` e a unica coluna que a
-- consulta precisa daqui, e todo o resto sai de `consultaBase`, que e o ponto
-- unico da projecao da Rede. Devolver colunas duplicadas criaria dois lugares
-- para o mesmo dado divergir.

-- Up Migration

-- O indice que esta funcao usa. O que ja existia
-- (`network_events_da_comunidade_por_autor`, `20261001000005`) e parcial em
-- `publication_status = 'published'`, porque ele serve ao TETO de 3 ativos. Ele
-- NAO serve aqui: a lista do dono mostra o cancelado tambem, e um indice parcial
-- cujo predicado nao cobre o da consulta fica de fora do plano.
CREATE INDEX network_events_da_conta_por_autor
  ON network_events (created_by_user_id, starts_at)
  WHERE origin = 'community' AND publication_status <> 'removed';

COMMENT ON INDEX network_events_da_conta_por_autor IS
  'Serve network_events_da_conta(uuid), a lista `Perfil` > `Meus eventos` (19/10/2026). Separado de network_events_da_comunidade_por_autor porque aquele e parcial em publication_status = published, para o teto de 3 ativos, e a lista do dono inclui o cancelado. starts_at na segunda posicao porque a tela ordena por ele.';

CREATE FUNCTION network_events_da_conta(p_autor uuid)
RETURNS TABLE (id uuid) AS $$
  SELECT e.id
    FROM network_events e
   WHERE e.origin = 'community'
     AND e.created_by_user_id = p_autor
     AND e.publication_status <> 'removed';
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION network_events_da_conta(uuid) IS
  'Os `id` dos encontros da comunidade DESTA conta, para a lista `Perfil` > `Meus eventos` (decisao do cliente de 19/10/2026). Conjunto vazio para conta que nunca criou encontro, e nao erro. Funcao e nao consulta em src/ porque a autoria esta na coluna que o portao de colunas que nao saem proibe nomear ali -- mesmo arranjo de network_events_do_autor(text, uuid). Devolve so `id`: o resto sai de consultaBase em kysely-network-repository.ts, que e o ponto unico da projecao da Rede. Inclui o cancelado (quem cancelou precisa ver que cancelou) e exclui o removido (terminal) e o do painel (se administra pelo painel, e as escritas da comunidade respondem 404 nele).';

-- Down Migration

DROP FUNCTION network_events_da_conta(uuid);

DROP INDEX network_events_da_conta_por_autor;
