-- MINHAS INDICACOES: o lado de QUEM INDICOU, que nunca existiu.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE
-- ====================================================================
--
-- A `20261017000004` criou `directory_suggestions` e a `20261017000016` deu ao
-- PAINEL o que ele precisava para trabalhar a fila -- listar, ler, aprovar,
-- recusar. Nenhuma das duas deu nada a quem INDICOU: o recibo de
-- `suggestDirectoryEntry` devolve `reference`, `state` e `created_at` e some, e
-- nao havia, no contrato inteiro, uma operacao que lesse esta tabela do lado da
-- pessoa. Quem indicou nao tinha como saber se alguem olhou.
--
-- O cliente mediu isso em 18/10/2026, nas palavras dele: *"e a aba de minhas
-- indicacoes, com o status se esta pendente ou se ja foi aprovado pelo
-- administrador?"*.
--
-- ====================================================================
-- A FUNCAO, E POR QUE ELA DEVOLVE LINHAS E NAO UM BOOLEANO
-- ====================================================================
--
-- `src/` **nao pode escrever o nome da coluna de autoria**: ela leva a marca
-- `NUNCA sai do servidor` no `COMMENT ON COLUMN` da `20261017000004`, e
-- `src/tools/portao-colunas-que-nao-saem.ts` varre todo `.ts` de `src/` pelo
-- nome literal dela, inclusive em comentario. Um
-- `.where('suggested_by_user_id', '=', ...)` em TypeScript reprovaria o portao.
--
-- O arranjo que ja existe para LER uma linha e um predicado booleano
-- (`indicacao_com_autor_ativo`, `encontro_com_autor_ativo`). **Aqui ele nao
-- serve**, e a diferenca e de plano de execucao e nao de gosto: um
-- `WHERE predicado(s.id, p_usuario)` e opaco para o planejador, que varreria a
-- tabela inteira chamando a funcao linha a linha -- e esta consulta e por
-- AUTORIA, que e justamente a coluna que o indice novo abaixo cobre. Uma funcao
-- `LANGUAGE sql STABLE` que devolve `TABLE` e INLINADA pelo planejador: o
-- `WHERE` de igualdade sobre a coluna de autoria entra no plano e o indice e
-- usado. O nome da coluna fica onde ele ja mora -- aqui dentro --, e `src/`
-- chama a funcao pelo nome dela, como ja faz com
-- `directory_suggestions_registrar`.
--
-- ====================================================================
-- A AUTORIZACAO ESTA NO `WHERE` DA FUNCAO, E NAO EM UM `if`
-- ====================================================================
--
-- `p_usuario` entra na clausula `WHERE` da propria funcao. Nao ha caminho, por
-- esta funcao, para ler a indicacao de outra pessoa: nao e um filtro que a
-- aplicacao aplica depois de ler, e nao e um `if` sobre a linha lida. Um `if`
-- depois da leitura responderia `403` onde o ADR-0021 manda `404` -- e, pior,
-- a linha ja estaria na memoria do processo. Para quem chama esta funcao, a
-- indicacao de outra conta **nao existe**.
--
-- ====================================================================
-- CONTA DESABILITADA: `conta_habilitada`, UMA VEZ E NO LUGAR CERTO
-- ====================================================================
--
-- Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
-- nenhuma pagina ou funcionalidade". A funcao DELEGA para
-- `conta_habilitada(uuid)` (`20261017000013`), que e o ponto unico da
-- definicao -- nada da regra e copiado aqui.
--
-- **Ela chama `conta_habilitada(p_usuario)`, e nao `indicacao_com_autor_ativo(
-- s.id)`, e isso nao e duplicar o predicado.** Nesta consulta o autor de toda
-- linha candidata **e** `p_usuario`, por construcao do proprio `WHERE`: os dois
-- predicados sao a mesma pergunta, e o segundo a faria uma vez por linha em vez
-- de uma vez por consulta. Mesma definicao, mesma fonte, uma avaliacao.
--
-- ====================================================================
-- O INDICE NOVO, E POR QUE O QUE EXISTE NAO SERVE
-- ====================================================================
--
-- O unico indice da tabela e `directory_suggestions_fila_de_revisao`, parcial
-- em `review_status = 'pending'` e com a chave `(review_status, created_at)`:
-- ele responde a pergunta do PAINEL ("o que esta na fila, do mais antigo para o
-- mais novo") e nao responde a desta tela, que e por AUTORIA e inclui o
-- decidido. Sem indice, "minhas indicacoes" varreria a tabela inteira a cada
-- abertura.
--
-- `(suggested_by_user_id, created_at DESC)`, e o `DESC` e a ordem da tela: aqui
-- o mais RECENTE vem primeiro, ao contrario da fila do painel. Fila de trabalho
-- humano se atende do mais antigo; lista do que EU fiz se le do mais novo, que
-- e o que a pessoa acabou de mandar e sobre o que ela quer noticia.
--
-- ====================================================================
-- O MOTIVO DA RECUSA PASSA A CHEGAR A QUEM INDICOU -- E ISSO E UMA REVERSAO
-- ====================================================================
--
-- **Esta e a unica decisao que esta migracao DESFAZ, e ela esta escrita aqui
-- para nao ser descoberta no diff.** O `COMMENT ON COLUMN` que a
-- `20261017000016` deixou em `decline_reason` diz, com estas palavras: "Nao e
-- publicado, nao chega a quem indicou". O contrato repetia a frase em dois
-- lugares. A partir de 18/10/2026 o motivo **chega a quem indicou**, porque a
-- alternativa medida e pior: uma tela que diz "recusada" e nada mais faz a
-- pessoa indicar a mesma clinica outra vez, e a recusa sem motivo e a unica
-- forma de resposta que nao ensina nada a ninguem.
--
-- **O que isso cobra de quem recusa:** o motivo deixou de ser recado interno
-- entre revisores e passou a ser texto que a pessoa le. Ele ja era obrigatorio
-- (`required: [reason]` em `declineAdminDirectorySuggestion`) e ja tinha teto
-- de 280 caracteres; o que muda e a audiencia, e o `COMMENT` abaixo passa a
-- dizer isso para quem for escrever a proxima tela do painel.
--
-- **O que NAO muda:** `decline_reason` continua fora da entrada do diretorio e
-- continua nao sendo publicado para terceiros -- quem o le e a conta que
-- indicou, e so ela, pelo `WHERE` da funcao acima.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
-- ====================================================================
--
-- Nenhuma coluna nova, nenhum `CHECK` novo, nenhuma marca de portao alterada.
-- `suggested_by_user_id` continua com a marca `NUNCA sai do servidor` intacta,
-- e a funcao abaixo **nao a projeta**: ela e parametro de entrada e clausula de
-- filtro, nunca coluna de saida.
--
-- `RAISE NOTICE` nao serve de aviso neste projeto: o `node-pg-migrate` descarta
-- `NOTICE`/`WARNING` e ninguem le.

-- Up Migration

CREATE INDEX directory_suggestions_do_autor
  ON directory_suggestions (suggested_by_user_id, created_at DESC);

COMMENT ON INDEX directory_suggestions_do_autor IS
  'A pergunta da tela `Minhas indicacoes`: o que ESTA CONTA indicou, do mais recente para o mais antigo. O indice parcial directory_suggestions_fila_de_revisao nao serve: ele e parcial em pending (a tela mostra o decidido tambem) e a chave dele comeca por review_status. DESC porque esta lista se le do mais novo -- ao contrario da fila do painel, que e trabalho humano e se atende do mais antigo.';

CREATE FUNCTION indicacoes_do_autor(p_usuario uuid)
RETURNS TABLE (
  ref            text,
  display_name   text,
  kind           text,
  city           text,
  state          text,
  neighborhood   text,
  contact_kind   text,
  contact_value  text,
  review_status  text,
  created_at     timestamptz,
  decided_at     timestamptz,
  decline_reason text,
  entry_slug     text
)
LANGUAGE sql STABLE AS $$
  SELECT s.ref, s.display_name, s.kind, s.city, s.state, s.neighborhood,
         s.contact_kind, s.contact_value, s.review_status,
         s.created_at, s.decided_at, s.decline_reason,
         -- O `slug` SO SAI PUBLICADO, e esta e a regra que impede a tela de
         -- prometer um link morto. Entrada nascida de indicacao cujo contato
         -- publico e site ou Instagram nasce `draft` (ela nao tem
         -- `phone_e164`, que e o canal unico de `professionals`), e `Perto` so
         -- lista `status = 'published'`. Devolver o `slug` do rascunho faria a
         -- tela oferecer "ver no Perto" para uma pagina que nao esta la.
         --
         -- Por isso `entry_slug` nulo em `approved` TEM significado, e e o que
         -- a tela diz com palavras: aprovada, ainda nao no `Perto`.
         (SELECT p.slug FROM professionals p
           WHERE p.id = s.approved_entry_id
             AND p.status = 'published') AS entry_slug
    FROM directory_suggestions s
   WHERE s.suggested_by_user_id = p_usuario
     AND conta_habilitada(p_usuario)
$$;

COMMENT ON FUNCTION indicacoes_do_autor(uuid) IS
  'AS INDICACOES DE UMA CONTA, para a tela `Minhas indicacoes`. Existe como FUNCAO porque src/ nao pode escrever o nome da coluna de autoria -- ela leva a marca NUNCA sai do servidor e portao-colunas-que-nao-saem.ts varre todo .ts de src/ pelo nome literal dela, inclusive em comentario. Devolve TABELA, e nao booleano como indicacao_com_autor_ativo: predicado opaco no WHERE impediria o planejador de usar o indice directory_suggestions_do_autor, e esta consulta e justamente por autoria. LANGUAGE sql STABLE para ser inlinada. A AUTORIZACAO E O PROPRIO WHERE: nao ha caminho por aqui para a indicacao de outra conta, e por isso a rota responde 404 e nunca 403 (ADR-0021). Conta desabilitada devolve ZERO linhas, delegando a conta_habilitada(uuid) (20261017000013), que e o ponto unico da definicao -- uma avaliacao por consulta, porque o autor de toda linha candidata e p_usuario por construcao. NAO projeta a coluna de autoria: ela e parametro e filtro, nunca saida.';

COMMENT ON COLUMN directory_suggestions.decline_reason IS
  'O motivo da recusa, escrito pelo administrador. **A PARTIR DE 18/10/2026 ELE CHEGA A QUEM INDICOU**, pela funcao indicacoes_do_autor(uuid) e pela operacao listMyDirectorySuggestions -- isto REVERTE a frase que este proprio COMMENT trazia ("nao chega a quem indicou"), e a reversao esta justificada no cabecalho da migracao 20261018000003: recusa sem motivo faz a mesma clinica ser indicada outra vez. Quem escreve deve escrever PARA A PESSOA, e nao so para o proximo revisor. Continua fora da entrada do diretorio e continua nao publicado para terceiros: quem o le e a conta que indicou, e so ela, pelo WHERE daquela funcao. Nulo em tudo que nao foi recusado, pelo CHECK directory_suggestions_motivo_so_na_recusa; que recusada TENHA motivo e garantido pelo corpo obrigatorio de declineAdminDirectorySuggestion, e nao por CHECK -- ver o cabecalho da 20261017000016, que explica por que o CHECK e de uma via.';

-- Down Migration

-- Nada aqui apaga trabalho de pessoa: a descida derruba um indice e uma funcao
-- de leitura, e devolve o `COMMENT` anterior palavra por palavra. Nenhuma linha
-- de `directory_suggestions` e tocada, e por isso esta descida **nao** precisa
-- da guarda de `RAISE EXCEPTION` que a `20261017000004` e a `20261017000016`
-- tem -- a delas existe porque a delas apagaria coluna com dado dentro.
--
-- O `COMMENT` restaurado e o da `20261017000016`, e restaura-lo e deliberado:
-- se a operacao de leitura sair, o motivo volta a nao chegar a quem indicou, e
-- o comentario tem de voltar a dizer isso. Comentario que sobrevive a remocao
-- da funcao que o justificava e documentacao que mente.

DROP FUNCTION indicacoes_do_autor(uuid);

DROP INDEX directory_suggestions_do_autor;

COMMENT ON COLUMN directory_suggestions.decline_reason IS
  'O motivo da recusa, escrito pelo administrador PARA O PROXIMO REVISOR -- a mesma entidade vai ser indicada outra vez, e sem o motivo gravado a checagem e refeita. Nao e publicado, nao chega a quem indicou e nao entra na entrada do diretorio. E o unico campo desta tabela que o painel escreve. Nulo em tudo que nao foi recusado, pelo CHECK directory_suggestions_motivo_so_na_recusa; que recusada TENHA motivo e garantido pelo corpo obrigatorio de declineAdminDirectorySuggestion, e nao por CHECK -- ver o cabecalho desta migracao, que explica por que o CHECK e de uma via.';
