-- A FILA DE REVISAO DA INDICACAO, do lado do banco: o motivo da recusa, a
-- ligacao com a entrada aprovada, e o predicado da conta desabilitada.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE
-- ====================================================================
--
-- A `20261017000004` criou `directory_suggestions` -- a fila -- e disse, no
-- proprio cabecalho, que as operacoes de que o painel ia precisar para
-- TRABALHAR a fila nao existiam no contrato ainda. Elas continuaram nao
-- existindo: a indicacao pelo aplicativo veio de `feat/rede-evento-e-perto-
-- sugestao` e os quatro menus do diretorio no painel vieram de
-- `feat/painel-diretorio-perto`, construidas em paralelo, e as duas subiram em
-- hml sem que nenhuma das duas fizesse a tela que LE a fila. O cliente mediu
-- isso: "no backoffice nao tem um menu para aprovar os profissionais que as
-- pessoas estao indicando".
--
-- Em 18/10/2026, `select count(*) from directory_suggestions` em hml devolve
-- ZERO: a fila nunca foi usada, porque nunca houve quem a lesse.
--
-- ====================================================================
-- AS DUAS COLUNAS, E POR QUE NENHUMA DAS DUAS JA EXISTIA
-- ====================================================================
--
-- 1. **`decline_reason`.** As outras duas filas do painel recusam SEM motivo, e
--    isso esta escrito no contrato das duas com a mesma frase -- "motivo e
--    mensagem, e mensagem e v2". A diferenca aqui nao e de zelo: la o motivo
--    seria uma mensagem para o TUTOR, e e a mensagem que e v2. Aqui o motivo e
--    para o PROXIMO REVISOR. A mesma clinica vai ser indicada outra vez por
--    outra pessoa, e sem o motivo gravado quem olhar depois refaz a checagem
--    que alguem ja fez -- "fechou", "nao atende pet", "o telefone e de pessoa
--    fisica". E o unico campo desta tabela que o painel escreve.
--
-- 2. **`approved_entry_id`.** Aprovar e o ponto da fila: aprovado quer dizer
--    que a entidade APARECE no `Perto`. Sem esta coluna a aprovacao seria um
--    `review_status` que nao aponta para nada, e ninguem conseguiria responder
--    "que entrada saiu desta indicacao?" nem "esta clinica ja foi indicada e
--    aprovada antes?" -- que e exatamente a pergunta da duplicata.
--
-- ====================================================================
-- OS DOIS `CHECK` SAO DE UMA VIA, E A ESCOLHA FOI MEDIDA
-- ====================================================================
--
-- A `20261017000004` escreveu o `CHECK` de `decided_at` como BICONDICIONAL
-- (`(review_status = 'pending') = (decided_at IS NULL)`), e esse e o estilo da
-- casa. Aqui os dois `CHECK` novos sao de UMA VIA:
--
--     decline_reason    IS NULL OR review_status = 'declined'
--     approved_entry_id IS NULL OR review_status = 'approved'
--
-- O motivo e operacional e nao estetico. Um biconditional (`(review_status =
-- 'declined') = (decline_reason IS NOT NULL)`) REPROVA a propria subida se
-- existir, em qualquer banco, uma linha ja `declined` -- e `ALTER TABLE ... ADD
-- CONSTRAINT` valida a tabela inteira. Em hml nao existe linha nenhuma (medido
-- acima), mas esta migracao sobe em bancos de desenvolvimento que esta sessao
-- NAO consegue inspecionar, e uma reprovacao ali TRAVA O BANCO para todas as
-- migracoes seguintes, de todos os agentes, pelo `checkOrder` do
-- node-pg-migrate. A forma de uma via nao pode reprovar sobre nenhuma linha
-- pre-existente: ela so proibe o estado novo.
--
-- O que a forma de uma via NAO garante e "recusada tem motivo". Isso e
-- garantido por quem escreve: a recusa so acontece pela aplicacao, com
-- `reason` obrigatorio no corpo do contrato (`required: [reason]`), e nao ha
-- outro caminho de escrita para esta coluna. A diferenca em relacao a
-- `review_status`, que o banco guarda com `CHECK`, e deliberada e esta escrita
-- aqui para quem vier conferir nao achar que faltou.
--
-- ====================================================================
-- A CHAVE ESTRANGEIRA, E POR QUE ELA NAO TEM `ON DELETE`
-- ====================================================================
--
-- `approved_entry_id REFERENCES professionals (id)` sem `ON DELETE` nenhum, o
-- que quer dizer `NO ACTION`: apagar a entrada do diretorio passa a ser
-- recusado pelo banco enquanto houver indicacao aprovada apontando para ela. E
-- o que se quer. Nao ha `apagarEntrada` neste produto -- retirar e
-- `status = 'removed'`, e a porta administrativa do diretorio diz isso por
-- extenso --, entao a chave nao atrapalha nenhum caminho existente; e, se
-- alguem escrever um `DELETE` um dia, o banco vai lembrar que isso apagaria a
-- memoria de uma revisao.
--
-- `CASCADE` seria o erro oposto: apagaria a indicacao, que e trabalho de
-- pessoa. `SET NULL` seria pior ainda -- deixaria a indicacao `approved`
-- apontando para o vazio, e a tela leria isso como "aprovada e sem entrada",
-- que nao e um estado que exista.
--
-- ====================================================================
-- O PREDICADO DA CONTA DESABILITADA, EM UM LUGAR SO NO SQL
-- ====================================================================
--
-- Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
-- nenhuma pagina ou funcionalidade". A indicacao de quem desabilitou a conta
-- nao pode aparecer nesta fila -- nem na listagem, nem na leitura, nem na
-- CONTAGEM do aviso do menu. Sao tres lugares em `src/`, e nao um: na fila da
-- Rede, filtrar so a listagem fez o painel dizer "1 pendente" sobre uma fila
-- vazia, e quem abriu procurou um pedido que a listagem nao mostrava mais.
--
-- **Mas `src/` nao pode escrever o nome da coluna de autoria.** Ela leva a
-- marca `NUNCA sai do servidor` no `COMMENT ON COLUMN` da `20261017000004`, e
-- `src/tools/portao-colunas-que-nao-saem.ts` varre todo `.ts` de `src/` pelo
-- nome literal dela -- inclusive em comentario. Um
-- `conta_habilitada(suggested_by_user_id)` escrito em TypeScript reprovaria o
-- portao. Entao o predicado vira FUNCAO, com o nome da coluna aqui dentro, que
-- e onde ele ja mora: mesmo arranjo e mesmo motivo de
-- `encontro_com_autor_ativo` (`20261017000014`).
--
-- A funcao DELEGA para `conta_habilitada(uuid)` (`20261017000013`), que e o
-- ponto unico da definicao e trata o nulo como habilitado. Aqui a autoria e
-- `NOT NULL`, entao o nulo nao acontece -- mas delegar, e nao copiar a regra,
-- e o que faz esta fila acompanhar quando a definicao mudar.
--
-- `RAISE NOTICE` nao serve de aviso neste projeto: o `node-pg-migrate` descarta
-- `NOTICE`/`WARNING` e ninguem le. O que precisa ser recusado e recusado com
-- `RAISE EXCEPTION`.

-- Up Migration

ALTER TABLE directory_suggestions
  ADD COLUMN decline_reason text
      CONSTRAINT directory_suggestions_motivo_tamanho
      CHECK (decline_reason IS NULL OR char_length(decline_reason) BETWEEN 2 AND 280),

  ADD COLUMN approved_entry_id uuid REFERENCES professionals (id);

ALTER TABLE directory_suggestions
  ADD CONSTRAINT directory_suggestions_motivo_so_na_recusa
      CHECK (decline_reason IS NULL OR review_status = 'declined'),

  ADD CONSTRAINT directory_suggestions_entrada_so_na_aprovacao
      CHECK (approved_entry_id IS NULL OR review_status = 'approved');

COMMENT ON COLUMN directory_suggestions.decline_reason IS
  'O motivo da recusa, escrito pelo administrador PARA O PROXIMO REVISOR -- a mesma entidade vai ser indicada outra vez, e sem o motivo gravado a checagem e refeita. Nao e publicado, nao chega a quem indicou e nao entra na entrada do diretorio. E o unico campo desta tabela que o painel escreve. Nulo em tudo que nao foi recusado, pelo CHECK directory_suggestions_motivo_so_na_recusa; que recusada TENHA motivo e garantido pelo corpo obrigatorio de declineAdminDirectorySuggestion, e nao por CHECK -- ver o cabecalho desta migracao, que explica por que o CHECK e de uma via.';

COMMENT ON COLUMN directory_suggestions.approved_entry_id IS
  'A entrada do diretorio que a aprovacao produziu -- OU a entrada que ja existia e a que a indicacao foi ligada, que e o caso da duplicata. Nulo em tudo que nao foi aprovado. Sem ON DELETE de proposito (NO ACTION): nao ha apagar entrada neste produto (retirar e status = removed), e se alguem escrever um DELETE um dia o banco vai recusar em vez de apagar a memoria de uma revisao. O painel nunca ve este UUID: a resposta devolve o slug da entrada (ADR-0010 item 6).';

CREATE FUNCTION indicacao_com_autor_ativo(p_indicacao uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM directory_suggestions s
     WHERE s.id = p_indicacao
       AND conta_habilitada(s.suggested_by_user_id))
$$;

COMMENT ON FUNCTION indicacao_com_autor_ativo(uuid) IS
  'Quem indicou ainda tem conta habilitada? DELEGA para conta_habilitada(uuid), que e o ponto unico da definicao (migracao 20261017000013) -- delegar, e nao copiar, e o que faz esta fila acompanhar quando a definicao mudar. Existe como FUNCAO porque src/ nao pode escrever o nome da coluna de autoria: ela leva a marca NUNCA sai do servidor e portao-colunas-que-nao-saem.ts varre todo .ts de src/ pelo nome literal dela, inclusive em comentario. Mesmo arranjo de encontro_com_autor_ativo (20261017000014). Chamada em TRES lugares de kysely-fila-de-indicacoes.ts -- listagem, leitura e a contagem de pending_total --, porque filtrar em um lugar so faz o painel dizer 1 pendente sobre fila vazia, defeito que a fila da Rede ja produziu. Devolve boolean: a coluna de autoria nunca sai do servidor. Indicacao que nao existe devolve FALSO, e a rota responde 404 e nunca 403 (ADR-0021).';

-- Down Migration

-- Descer com recusa gravada APAGA a decisao de uma pessoa: o motivo da recusa e
-- a unica memoria de por que aquela entidade nao entrou, e com ele a proxima
-- revisao refaz a checagem. Mesma forma do `down` da `20261017000004`, e pelo
-- mesmo motivo: a descida reprova em voz alta em vez de descartar trabalho em
-- silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM directory_suggestions
              WHERE decline_reason IS NOT NULL OR approved_entry_id IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha indicacao decidida: reverter apagaria o motivo da recusa e a ligacao com a entrada aprovada, que e a memoria de quem revisou. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

DROP FUNCTION indicacao_com_autor_ativo(uuid);

ALTER TABLE directory_suggestions
  DROP CONSTRAINT directory_suggestions_entrada_so_na_aprovacao,
  DROP CONSTRAINT directory_suggestions_motivo_so_na_recusa,
  DROP COLUMN approved_entry_id,
  DROP COLUMN decline_reason;
