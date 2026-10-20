-- OS DOIS INDICES DO CONJUNTO `case_state=reunited` DE `listPublicLostPets`.
--
-- POR QUE AGORA: em 20/10/2026 o cliente decidiu que *"o pet ganha um
-- selo/filtro na pagina de pets como encontrado por 30 dias e depois ele expira
-- e sai"*, e que o sinal de "encontrado pela comunidade" e *"depois de um
-- usuario ter escaneado a tag do usuario ou ter entrado em contato"*.
--
-- A operacao ganhou o parametro `case_state`. Ausente ou `open`, ela responde o
-- conjunto que sempre respondeu e NADA nesta migracao a toca. Com
-- `case_state=reunited`, ela responde outro conjunto, com tres predicados que
-- nenhum indice de hoje serve:
--
--   status = 'closed_reunited'
--   AND closed_at >= :agora - 30 dias
--   AND EXISTS (SELECT 1 FROM conversations cv WHERE cv.case_id = lost_cases.id)
--   AND share_to_public_list ...
--
-- ===========================================================================
-- OS SETE INDICES DE `lost_cases` DE HOJE SAO TODOS `WHERE status = 'open'`
-- ===========================================================================
-- Conferido em 20/10/2026, lendo `pg_indexes`: `lost_cases_abertos_da_conta`,
-- `lost_cases_abertos_por_lugar`, `lost_cases_publicos_por_cidade`,
-- `lost_cases_publicos_por_cidade_e_visto`, `lost_cases_publicos_por_visto` e
-- `lost_cases_um_aberto_por_pet` carregam `status = 'open'` no indice parcial.
-- Nenhum deles alcanca uma linha `closed_reunited` -- o planejador nao pode usar
-- um indice parcial cujo predicado o `WHERE` da consulta contradiz. Sobram
-- `lost_cases_pkey` e `lost_cases_share_token_unico`, que nao servem a ordem.
--
-- E `conversations` NAO TINHA INDICE NENHUM POR `case_id`. Os indices dela sao
-- `conversations_pkey`, `conversations_do_achador` (`finder_user_id`),
-- `conversations_do_tutor` (`tutor_user_id`),
-- `conversations_found_report_id_key` e `conversations_retidas`. O `EXISTS`
-- correlacionado por `case_id` nao tinha por onde entrar.
--
-- ===========================================================================
-- A MEDICAO, E ELA E A RAZAO DOS DOIS E NAO DE UM
-- ===========================================================================
-- `EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)` da MESMA consulta que
-- `kysely-listagem-publica-de-perdidos.ts` compila -- impressa pelo proprio
-- construtor com `DummyDriver` e os parametros substituidos, nunca reescrita a
-- mao. Postgres 16 (`postgis/postgis:16-3.4`), banco descartavel no hospedeiro,
-- 20/10/2026, com `ANALYZE` nas tabelas antes de medir.
--
-- Volume: `lost_cases` 20 004 linhas (16 001 `open`, 4 003 `closed_reunited`),
-- `conversations` 2 002 linhas, 966 casos satisfazendo os tres predicados do
-- conjunto novo. Homologacao hoje tem 31 casos, todos abertos: medir SO nela
-- diria que qualquer indice e inerte, e diria errado -- o mesmo argumento que a
-- `20261019000008` registrou.
--
--   pagina 1, `case_state=reunited`, sem cidade
--     SEM os indices   Seq Scan em conversations + HashAggregate + Index Scan
--                      por lost_cases_pkey    11 843 buffers   171,1 ms
--     COM os indices   Bitmap Index Scan em lost_cases_reencontrados_por_visto
--                      + Index Only Scan em conversations_do_caso (Semi Join)
--                                             13 261 buffers    33,5 ms
--
--   pagina 1, `case_state=reunited`, com cidade
--     SEM os indices   10 251 buffers   (mesmo arranjo)
--     COM os indices   27,7 ms
--
--   pagina 1, SEM `case_state` (o conjunto de casos ABERTOS, que e a lista que a
--   vizinhanca abre)
--     SEM os indices   Index Scan em lost_cases_publicos_por_visto   242 buffers   11,9 ms
--     COM os indices   Index Scan em lost_cases_publicos_por_visto   242 buffers   11,5 ms
--
-- A ULTIMA LINHA E A QUE IMPORTA MAIS: os indices novos sao parciais sobre
-- `closed_reunited`, entao a consulta dos casos abertos nem os considera -- mesmo
-- plano, mesmo indice, mesmos buffers. A lista pela qual a vizinhanca acha o
-- animal que sumiu nao paga nada por isto.
--
-- O QUE O INDICE **NAO** RESOLVE, e esta dito para ninguem prometer: o
-- `top-N heapsort` FICA. O planejador escolhe `Bitmap Index Scan`, que nao
-- entrega ordem, porque `closed_at` e filtro residual e remove metade das
-- linhas do indice (`Rows Removed by Filter: 2044`). Por `closed_at` na frente a
-- ordem da rota (`last_seen_at DESC, share_token`) deixaria de ser a do indice,
-- e duas ordens para a mesma operacao e pior que um sort de 966 linhas. Se um
-- dia o conjunto crescer de verdade, o que muda e a ORDEM da rota, numa decisao
-- de produto -- nao mais um indice aqui.
--
-- SEM `CONCURRENTLY`, como nenhuma migracao deste repositorio: `node-pg-migrate`
-- roda cada migracao em transacao, e `CREATE INDEX CONCURRENTLY` nao executa
-- dentro de uma.
--
-- O CARIMBO `20261020000004` FOI DISTRIBUIDO, e nao escolhido aqui: o portao de
-- numero le so as refs do git e ja aprovou o mesmo numero para dois agentes no
-- mesmo dia (migracao nao comitada em outro worktree e invisivel para ele).
--
-- NENHUM `ALTER TABLE`, nenhuma coluna, nenhum CHECK reescrito: esta migracao
-- cria dois indices e nada mais. Nao ha dado a perder e nao ha o que provar em
-- BEGIN/ROLLBACK sobre desfecho de caso -- os seis `purpose` em vigor e o
-- `CHECK lost_cases_encerrado_tem_desfecho` nao sao tocados.

-- Up Migration

CREATE INDEX lost_cases_reencontrados_por_visto
  ON lost_cases (last_seen_at DESC, share_token)
  WHERE status = 'closed_reunited' AND share_to_public_list;

COMMENT ON INDEX lost_cases_reencontrados_por_visto IS
  'listPublicLostPets com case_state=reunited (cliente, 20/10/2026): o conjunto do selo de "encontrado pela comunidade". Parcial sobre closed_reunited de proposito -- os outros indices publicos de lost_cases sao WHERE status = open e nao alcancam linha encerrada, e este nao alcanca linha aberta, entao a lista de casos abertos nao muda de plano. closed_at fica como filtro residual: ver o cabecalho da migracao 20261020000004 para por que a ordem nao passa a ser por closed_at.';

CREATE INDEX conversations_do_caso
  ON conversations (case_id)
  WHERE case_id IS NOT NULL;

COMMENT ON INDEX conversations_do_caso IS
  'O EXISTS do sinal de comunidade em listPublicLostPets (case_state=reunited): existe conversa ligada a este caso? Conversa nasce de plaquinha lida que virou aviso (scan_notice) ou de achado avulso confirmado pelo tutor (found_notice), e os dois exigem que o outro lado NAO seja o tutor -- e por isso que ela, e nao tag_scans, e o sinal. Parcial porque case_id e anulavel (ON DELETE SET NULL do caso) e conversa sem caso nunca e procurada por este predicado.';

-- Down Migration

-- Descer devolve o conjunto `case_state=reunited` ao arranjo medido acima:
-- `Seq Scan` em `conversations` com `HashAggregate` e uma sonda por
-- `lost_cases_pkey` por conversa -- 11 843 buffers e 171,1 ms contra 33,5 ms.
-- Nada de dado se perde: indice nao guarda verdade nenhuma que a tabela nao
-- tenha, e o selo continua correto, so mais caro.
DROP INDEX IF EXISTS conversations_do_caso;
DROP INDEX IF EXISTS lost_cases_reencontrados_por_visto;
