-- A TRILHA DO ACEITE DOS TERMOS -- APENDA, E NUNCA SOBRESCREVE.
--
-- ====================================================================
-- O DEFEITO QUE ESTA MIGRACAO EXISTE PARA CONSERTAR
-- ====================================================================
--
-- Medido em 01/11/2026, e o conserto do PR #142 fechou so a metade do futuro:
-- a partir dele a versao gravada no cadastro sai de UMA fonte
-- (`web/src/conteudo/versao-legal.json`), e divergir reprova no portao
-- `make verificar-versao-dos-termos`. O que ele NAO fez -- nem podia -- foi
-- consertar o consentimento que JA esta gravado.
--
-- O estado medido no banco local em 01/11/2026, 37 registros de conta:
--
--     1 com `accepted_terms_version = '2026-09-17'`  -- versao que NUNCA esteve
--                                                       no ar: e a data dos
--                                                       ADR-0001..0013
--    36 com `accepted_terms_version IS NULL`         -- consentimento sem versao
--                                                       NENHUMA, que e pior que
--                                                       versao errada
--
-- Homologacao e producao NAO FORAM MEDIDAS. O SQL de medicao esta no PR #142.
--
-- ====================================================================
-- POR QUE TABELA NOVA, E NAO MAIS UMA COLUNA EM `users`
-- ====================================================================
--
-- `users.accepted_terms_version` e `users.accepted_terms_at` (migracao
-- `20260917000001`) guardam **um** aceite, e um `UPDATE` neles APAGA o
-- anterior. Hoje isso nao se nota porque nada no produto grava aceite depois do
-- cadastro -- `accepted_terms_version` e escrito uma vez, em
-- `kysely-identity-repository.ts`, no `INSERT` da conta, e lido por ninguem.
--
-- No dia em que a recoleta rodar, essas duas colunas passariam a ser
-- SOBRESCRITAS, e a trilha de consentimento e exatamente a prova de **quando a
-- pessoa concordou com o que**. Perder o aceite de 2026-09-17 ao gravar o aceite
-- do texto aprovado nao e detalhe de esquema: e apagar a unica evidencia de que
-- houve consentimento antes, defeito ou nao.
--
-- Entao: TABELA PROPRIA, uma linha por aceite, so `INSERT`. As duas colunas de
-- `users` continuam existindo e continuam sendo o valor CORRENTE (quem le "qual
-- a versao que esta conta aceita hoje" nao tem de agregar nada), mas a memoria
-- mora aqui e nao e tocada por `UPDATE`.
--
-- ====================================================================
-- `version` E `NOT NULL`, E ISSO E O CONSERTO E NAO ZELO
-- ====================================================================
--
-- O defeito dos 36 nulos e "aceite gravado sem versao". Em `users` a coluna e
-- anulavel, e tem de continuar: 36 linhas ja estao assim, e torna-la `NOT NULL`
-- exigiria inventar um valor para elas -- que e arbitrar data, exatamente o que
-- nao se faz aqui.
--
-- Nesta tabela ela e `NOT NULL` **com `CHECK` contra vazio e espaco**, porque
-- aqui nao ha passado para acomodar: toda linha nasce de um aceite novo. O
-- caminho novo fica **incapaz** de produzir o defeito antigo -- nao por
-- disciplina de quem escreve o repositorio, e sim porque o Postgres recusa.
-- `''` e `'   '` passariam por `NOT NULL` e nao identificam texto nenhum.
--
-- ====================================================================
-- O QUE A CARGA INICIAL FAZ, E O QUE ELA NAO INVENTA
-- ====================================================================
--
-- Ela copia para a trilha os aceites que `users` ja tem **e que tem versao**.
-- Sao as linhas que carregam informacao: a de `2026-09-17` entra como
-- `source = 'signup'`, com o `accepted_terms_at` dela, e e o registro de que
-- aquela conta aceitou aquilo naquele instante. A versao errada fica
-- REGISTRADA, e nao corrigida: a trilha guarda o que houve.
--
-- As 36 linhas NULAS **nao entram**, e nao por economia: uma linha de trilha
-- sem versao e o proprio defeito copiado para o lugar novo, e `version NOT NULL`
-- a recusaria. Para o mecanismo de recoleta, conta sem linha na trilha e conta
-- que **nunca aceitou a versao atual** -- que e o tratamento certo, e o mesmo
-- que ela ja recebe por `accepted_terms_version IS NULL`.
--
-- `accepted_terms_at` pode ser nulo com versao presente (o `INSERT` do cadastro
-- grava os dois juntos, mas nada no esquema cobra isso), e por isso a carga cai
-- em `created_at` da conta quando falta: instante de conta e o limite superior
-- honesto de quando aquele aceite pode ter acontecido.
--
-- ====================================================================
-- NADA AQUI APAGA LINHA
-- ====================================================================
--
-- Sem `DELETE`, sem expurgo por prazo, sem `UPDATE`. O unico `ON DELETE` e o
-- `CASCADE` da conta, que e o mesmo das outras tabelas de pessoa: quando a
-- conta sai no expurgo, o consentimento dela sai com ela -- e o oposto seria
-- guardar dado de quem pediu exclusao.

-- Up Migration

CREATE TABLE terms_acceptances (
  id           uuid        PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- A VERSAO ACEITA, obrigatoria e nao vazia. Ver o cabecalho: e esta linha
  -- que torna o caminho novo incapaz de gravar o defeito que ele conserta.
  version      text        NOT NULL
                           CONSTRAINT terms_acceptances_versao_nao_vazia
                           CHECK (btrim(version) <> ''),

  accepted_at  timestamptz NOT NULL DEFAULT now(),

  -- DE ONDE VEIO o aceite. `signup` e o do cadastro (e o da carga inicial);
  -- `recollection` e o da recoleta, pedida a quem ja tinha conta. Enumerado e
  -- nao texto livre porque a pergunta "quantos aceites vieram da recoleta?" e a
  -- medicao do mecanismo, e texto livre a responde errado em silencio.
  source       text        NOT NULL
                           CONSTRAINT terms_acceptances_origem_conhecida
                           CHECK (source IN ('signup', 'recollection'))
);

-- A LEITURA QUE O PRODUTO FAZ: o ultimo aceite desta conta. `DESC` porque a
-- pergunta e sempre "o mais recente", e nunca "o primeiro".
CREATE INDEX terms_acceptances_por_conta
  ON terms_acceptances (user_id, accepted_at DESC);

COMMENT ON TABLE terms_acceptances IS
  'A TRILHA DO ACEITE DOS TERMOS, uma linha por aceite, so INSERT. Existe porque users.accepted_terms_version/at guardam UM aceite e um UPDATE neles apagaria o anterior -- e a trilha de consentimento e a prova de quando a pessoa concordou com o que. As colunas de users continuam sendo o valor CORRENTE; a memoria e esta tabela. Nada aqui apaga nem atualiza linha: o unico ON DELETE e o CASCADE da conta, para o expurgo nao deixar consentimento de quem pediu exclusao.';

COMMENT ON COLUMN terms_acceptances.version IS
  'A versao do texto legal que a pessoa aceitou, na forma AAAA-MM-DD que web/src/conteudo/versao-legal.json publica. NOT NULL com CHECK contra vazio e espaco, de proposito: o defeito medido em 01/11/2026 era aceite gravado SEM versao (36 de 37 registros locais), e aqui o Postgres recusa produzi-lo. Em users a coluna continua anulavel porque as 36 linhas ja estao assim e dar valor a elas seria arbitrar data.';

COMMENT ON COLUMN terms_acceptances.source IS
  'De onde veio o aceite: signup (cadastro, e a carga inicial desta migracao) ou recollection (a recoleta pedida a quem ja tinha conta). Enumerado porque "quantos aceites vieram da recoleta?" e a medicao do mecanismo, e texto livre a responde errado em silencio.';

-- A CARGA INICIAL. So as linhas COM versao: linha de trilha sem versao e o
-- defeito copiado, e `version NOT NULL` a recusaria. Ver o cabecalho.
INSERT INTO terms_acceptances (id, user_id, version, accepted_at, source)
SELECT
  gen_random_uuid(),
  u.id,
  u.accepted_terms_version,
  COALESCE(u.accepted_terms_at, u.created_at),
  'signup'
FROM users AS u
WHERE u.accepted_terms_version IS NOT NULL
  AND btrim(u.accepted_terms_version) <> '';

-- Down Migration

DROP INDEX terms_acceptances_por_conta;

DROP TABLE terms_acceptances;
