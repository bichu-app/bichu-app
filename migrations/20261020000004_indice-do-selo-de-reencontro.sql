-- OS TRES INDICES QUE O SELO DE REENCONTRO PEDIU EM `listPublicLostPets`.
--
-- POR QUE AGORA: em 20/10/2026 o cliente decidiu que *"o pet ganha um
-- selo/filtro na pagina de pets como encontrado por 30 dias e depois ele expira
-- e sai"*, e que o sinal de "encontrado pela comunidade" e *"depois de um
-- usuario ter escaneado a tag do usuario ou ter entrado em contato"*.
--
-- A operacao ganhou o parametro `case_state`, com TRES conjuntos:
--
--   ausente       os abertos MAIS os reencontrados na janela (o recorte PADRAO,
--                 pela segunda decisao do cliente no mesmo dia: perguntado se o
--                 reencontrado devia aparecer so no filtro ou tambem na lista de
--                 sempre, a resposta foi "Tambem na lista padrao")
--   open          somente os abertos (o recorte de antes do selo)
--   reunited      somente os reencontrados na janela
--
-- `open` responde o que sempre respondeu e NADA nesta migracao o toca. Os outros
-- dois precisam de indice, e por motivos DIFERENTES.
--
-- O conjunto `reunited` tem tres predicados que nenhum indice de hoje serve:
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
--   pagina 1, `case_state=open` (o recorte de antes do selo)
--     SEM os indices   Index Scan em lost_cases_publicos_por_visto          0,85 ms
--     COM os tres      Index Scan em lost_cases_publicos_do_recorte_padrao  0,30 ms
--
-- Os dois indices do bloco acima sao parciais sobre `closed_reunited`, entao o
-- recorte `open` nao os considera. O TERCEIRO ele considera, e PASSOU a
-- escolher: o predicado dele (`status IN ('open','closed_reunited')`) tambem e
-- implicado por `status = 'open'`, e o planejador o prefere. MEDIDO, e nao
-- suposto -- e esta dito aqui porque a versao anterior deste comentario afirmava
-- que o recorte `open` "nem os considera", e com tres indices isso deixou de ser
-- verdade. O tempo caiu (0,85 -> 0,30 ms) e a resposta e a mesma: o indice novo
-- e um superconjunto ordenado pela mesma ordem.
--
-- `lost_cases_publicos_por_visto` FICA. Ele e mais estreito (so abertos) e e o
-- indice que a migracao `20261019000008` justifica; tira-lo seria apagar o
-- caminho medido de outra decisao para economizar 2880 kB.
--
-- ===========================================================================
-- O TERCEIRO INDICE, E ELE NASCEU DE UMA REGRESSAO QUE EU MEDI
-- ===========================================================================
-- O recorte PADRAO virou a UNIAO, e a uniao e um `OR`:
--
--   (status = 'open' OR (status = 'closed_reunited' AND janela AND conversa))
--
-- **Nenhum indice parcial de hoje atende um `OR` assim.** Um indice
-- `WHERE status = 'open'` nao pode ser usado por uma consulta que tambem aceita
-- linha encerrada, e o planejador cai para varredura. MEDIDO, na mesma massa:
--
--   pagina 1, SEM `case_state` (o recorte PADRAO, a lista que todo mundo abre)
--     SEM o terceiro indice   Seq Scan em lost_cases (18 000 linhas) + Seq Scan
--                             em conversations + Seq Scan em pets + top-N sort
--                             51 773 buffers   182,1 ms
--     COM o terceiro indice   Index Scan em lost_cases_publicos_do_recorte_padrao
--                                239 buffers     3,1 ms
--
-- **182 ms contra 3 ms, e 51 773 buffers contra 239, na consulta mais aberta do
-- produto.** Sem este indice, a decisao de por o reencontrado na lista padrao
-- custaria uma varredura de `lost_cases` por abertura da pagina de pets, e o
-- custo cresce com o numero de casos -- nao com o numero de reencontrados.
--
-- POR QUE O PREDICADO E `status IN ('open','closed_reunited')` E NAO SO
-- `share_to_public_list`: os dois funcionam (medidos, 237 buffers cada, 3,58 ms
-- contra 3,20 ms), e o planejador escolhe qualquer um dos dois -- o provador de
-- implicacao do Postgres resolve `(A OR (B AND C)) => (A OR B)`, o que eu nao
-- supus: eu medi, criando um de cada vez. O dos dois estados fica porque ele
-- EXCLUI `closed_not_found` e `closed_false_alarm`, que nenhum conjunto desta
-- rota pode devolver -- indice que indexa linha que a rota nunca pede e disco e
-- escrita pagos por nada. Tamanho medido na massa: 1512 kB.
--
-- A ORDEM da rota (`last_seen_at DESC, share_token`) e a do indice, e e por isso
-- que o `LIMIT 20` para cedo: ele caminha o indice em ordem e os predicados
-- residuais (`closed_at`, o `EXISTS`, `conta_habilitada`) sao avaliados por linha
-- caminhada. Como quase toda linha aberta passa, a pagina 1 custa ~20 linhas.
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
-- cria tres indices e nada mais. Nao ha dado a perder e nao ha o que provar em
-- BEGIN/ROLLBACK sobre desfecho de caso -- os seis `purpose` em vigor e o
-- `CHECK lost_cases_encerrado_tem_desfecho` nao sao tocados.

-- Up Migration

CREATE INDEX lost_cases_publicos_do_recorte_padrao
  ON lost_cases (last_seen_at DESC, share_token)
  WHERE share_to_public_list AND status IN ('open', 'closed_reunited');

COMMENT ON INDEX lost_cases_publicos_do_recorte_padrao IS
  'listPublicLostPets SEM case_state (cliente, 20/10/2026: "Tambem na lista padrao"): o recorte PADRAO e a UNIAO de abertos com reencontrados na janela, e um OR nao pode usar indice parcial de um estado so. Sem este indice a consulta mais aberta do produto cai para Seq Scan: 51 773 buffers e 182,1 ms contra 239 e 3,1 ms (medido com 20 000 casos). O predicado exclui closed_not_found e closed_false_alarm porque nenhum conjunto desta rota os devolve. NAO substitui lost_cases_publicos_por_visto, que serve case_state=open, nem lost_cases_reencontrados_por_visto, que serve case_state=reunited -- os tres caminhos foram medidos com os tres indices no lugar.';

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
-- Descer este devolve o recorte PADRAO -- a pagina que todo mundo abre -- ao
-- `Seq Scan` medido acima: 51 773 buffers e 182,1 ms. E a descida que mais
-- custa das tres, e ela nao perde dado nenhum.
DROP INDEX IF EXISTS lost_cases_publicos_do_recorte_padrao;
