-- O encontro criado pelo PAINEL volta para a agenda.
--
-- ====================================================================
-- O DEFEITO, MEDIDO EM HOMOLOGACAO E NAO SUPOSTO
-- ====================================================================
--
-- A `20261017000013` criou `encontro_com_autor_ativo(uuid)` e a
-- `consultaBase` de `kysely-network-repository.ts` passou a exigi-la. O corpo
-- dela usava JOIN INTERNO com `users`:
--
--     FROM network_events e JOIN users u ON u.id = e.created_by_user_id
--    WHERE e.id = p_evento AND u.deleted_at IS NULL
--
-- Encontro criado pelo painel NAO TEM autor de usuario -- a coluna de autoria
-- de usuario e nula, e a autoria fica na coluna de administrador. Com o join
-- interno a linha nao casa, `EXISTS` devolve FALSO, e o encontro sai de TODAS
-- as superficies da Rede de uma vez: agenda, `nearby`, leitura por slug,
-- local, detalhes privados, pedido de participacao e "meus pedidos".
--
-- MEDIDO em hml, logo depois de subir o lote de 18/10, e por isso esta
-- migracao existe: `GET /v1/network/events?when=all` devolveu
-- `{"items":[],"total":0}` com NOVE encontros no banco, OITO deles
-- `publication_status = 'published'` e `visibility = 'public'`, e os nove com
-- autoria de usuario nula. Antes do lote a mesma rota devolvia os oito. Nenhum
-- usuario estava desabilitado: a contagem de contas com marca de exclusao era
-- ZERO, entao o filtro nao escondeu ninguem que o cliente mandou esconder --
-- escondeu a agenda inteira.
--
-- ====================================================================
-- A CORRECAO: UM PONTO UNICO, E NAO UMA SEGUNDA DEFINICAO
-- ====================================================================
--
-- A irma `conta_habilitada(uuid)`, da MESMA migracao, ja trata o nulo e o
-- documenta: "NULO devolve VERDADEIRO de proposito -- linha sem conta nao e
-- linha de conta desabilitada, e trata-la como desabilitada apagaria da tela
-- quem nunca teve dono". O comentario dela previa exatamente esta classe de
-- erro: "e esse ramo que sete copias a mao errariam". A oitava copia errou.
--
-- Entao `encontro_com_autor_ativo` para de ter regra propria e DELEGA. No dia
-- em que existir reativacao, suspensao temporaria ou bloqueio por denuncia,
-- muda `conta_habilitada` e esta acompanha.
--
-- O QUE A CORRECAO NAO AFROUXA: encontro cujo autor de usuario existe e esta
-- desabilitado continua SAINDO da agenda -- e a decisao do cliente de 17/10,
-- "Sim, sai da agenda", e ela seguiu valendo. O `EXISTS` sobre
-- `network_events` tambem ficou, entao id de encontro que nao existe continua
-- devolvendo FALSO.
--
-- A coluna de autoria continua sem aparecer em `src/`: a funcao devolve
-- `boolean`, e `portao-colunas-que-nao-saem.ts` segue verde.

-- Up Migration

CREATE OR REPLACE FUNCTION encontro_com_autor_ativo(p_evento uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM network_events e
     WHERE e.id = p_evento
       AND conta_habilitada(e.created_by_user_id))
$$;

COMMENT ON FUNCTION encontro_com_autor_ativo(uuid) IS
  'O autor do encontro ainda tem conta habilitada? DELEGA para conta_habilitada(uuid), que e o ponto unico da definicao e trata o NULO como habilitado. Encontro criado pelo painel nao tem autor de usuario, e o corpo anterior (JOIN interno com users, migracao 20261017000013) o tirava da agenda junto com os de conta desabilitada -- medido em hml em 18/10: oito encontros publicados sumiram da Rede. Chamada de consultaBase em kysely-network-repository.ts, por onde passam a agenda, o nearby, a leitura do encontro, o local, os detalhes privados e os pedidos. Devolve boolean de proposito: a coluna de autoria nunca sai do servidor.';

-- Down Migration

-- A descida repoe o corpo da `20261017000013`, com JOIN interno. ELE E O
-- DEFEITUOSO: descer esta migracao faz os encontros do painel sairem da agenda
-- outra vez. Esta escrito assim porque `down` repoe o estado anterior e nao
-- "o estado que eu preferia"; quem descer precisa saber o que volta.
CREATE OR REPLACE FUNCTION encontro_com_autor_ativo(p_evento uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM network_events e
      JOIN users u ON u.id = e.created_by_user_id
     WHERE e.id = p_evento
       AND u.deleted_at IS NULL)
$$;
