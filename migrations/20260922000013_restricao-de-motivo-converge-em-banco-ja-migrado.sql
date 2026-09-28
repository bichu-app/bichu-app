-- Up Migration
--
-- BICHUS-125, segunda metade do conserto: fazer convergir os bancos que JA
-- rodaram a migracao defeituosa.
--
-- ====================================================================
-- POR QUE CONSERTAR O ARQUIVO ANTERIOR NAO BASTA
-- ====================================================================
--
-- `20260922000001_motivo-de-revogacao-por-sair-de-todos.sql` nasceu sem o
-- marcador `-- Up Migration`. Sem ele o `node-pg-migrate` manda o ARQUIVO
-- INTEIRO como subida: a metade de cima acrescentava `logout_all` a restricao
-- e a metade de baixo, que e a descida, o removia na sequencia. A migracao
-- ficou registrada em `pgmigrations` como APLICADA, e a restricao voltou a ser
-- a antiga, de cinco valores.
--
-- Acrescentar o marcador conserta o arquivo, e so o arquivo. `node-pg-migrate`
-- pula toda migracao cujo nome ja esta em `pgmigrations` -- ele nao guarda
-- soma de verificacao do conteudo, entao a versao corrigida do arquivo NUNCA
-- roda num banco que ja passou por ele. `development` e a VM de homologacao
-- ficariam com a restricao antiga para sempre, e "sair de todos os aparelhos"
-- continuaria respondendo 500 nelas enquanto passa na esteira.
--
-- ====================================================================
-- POR QUE UMA MIGRACAO NOVA, E NAO APAGAR A LINHA DE `pgmigrations`
-- ====================================================================
--
-- O outro caminho seria `delete from pgmigrations where name = '...'` em cada
-- ambiente, para o arquivo corrigido rodar de novo. Ele funciona e foi
-- descartado por tres razoes:
--
--   1. E passo manual, fora do repositorio, repetido uma vez por ambiente.
--      Nao ha como provar na esteira que foi feito, e o ambiente esquecido e
--      justamente o que ninguem olha.
--   2. Faz o historico de migracao de dois bancos divergir: um banco novo teria
--      a linha uma vez, o consertado a mesma linha com outra data, e o
--      esquecido com o efeito ausente. Investigar qualquer coisa depois disso
--      exige saber qual dos tres se esta olhando.
--   3. Migracao aplicada e fato consumado. A convencao do ecossistema --
--      node-pg-migrate, Flyway, Rails -- e que o corretivo vai PARA A FRENTE,
--      nunca reescrevendo o que ja rodou. Uma migracao nova roda sozinha, em
--      todo ambiente, na ordem, e deixa rastro.
--
-- As duas metades juntas fazem os dois casos convergirem no mesmo esquema:
-- banco novo aplica 000001 corretamente e depois esta aqui, que e inocua;
-- banco ja migrado pula 000001 e e consertado aqui.
--
-- ====================================================================
-- POR QUE `IF EXISTS`, se a restricao deveria existir
-- ====================================================================
--
-- Porque esta migracao roda contra DOIS estados diferentes -- o banco novo e o
-- banco que passou pela versao defeituosa -- e precisa terminar igual nos
-- dois. `DROP CONSTRAINT` sem `IF EXISTS` transformaria um terceiro estado
-- plausivel (alguem ja consertou a mao) em migracao reprovada, e migracao que
-- reprova por estar certo demais e a que vira `--force` na proxima vez.
-- Idempotencia pelo ESTADO, e nao por tratamento de erro.

ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS refresh_tokens_revoked_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout', 'logout_all',
    'password_changed', 'account_deleted'));

-- O comentario sobreviveu a migracao defeituosa (ele estava na metade de cima e
-- nada na de baixo o desfazia), e por isso ele PROMETIA `logout_all` num banco
-- que o recusava. Reescrever aqui nao e zelo: e o que garante que a coluna e a
-- descricao dela cheguem juntas ao mesmo estado, inclusive num banco onde
-- alguem tenha desfeito o comentario a mao.
COMMENT ON COLUMN refresh_tokens.revoked_reason IS
  'Por que a linha morreu. `logout` e um aparelho; `logout_all` e a conta inteira (ADR-0002 emenda 1). Sem os dois, a trilha nao distingue os dois verbos.';

-- Down Migration
--
-- A volta so e possivel se nenhuma linha ja carregar `logout_all`: a restricao
-- de cinco valores a recusaria, e falhar alto aqui e o comportamento certo. Uma
-- reversao que apagasse o motivo em silencio perderia o registro de uma
-- revogacao real -- exatamente a evidencia que alguem investigando uma tomada
-- de conta iria procurar.
--
-- O estado para o qual esta descida volta e o estado ANTERIOR a esta migracao,
-- que difere entre os dois bancos: no banco ja migrado era a restricao de cinco
-- valores, no banco novo era a de seis (posta por 000001). Esta descida devolve
-- a de cinco, que e o pior caso dos dois, porque logo em seguida a descida de
-- 000001 devolveria a de cinco de qualquer maneira. Reverter as duas em
-- sequencia termina no mesmo lugar; reverter so esta deixa o banco como estava
-- antes do incidente ser conhecido.

ALTER TABLE refresh_tokens
  DROP CONSTRAINT IF EXISTS refresh_tokens_revoked_reason_check;

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout',
    'password_changed', 'account_deleted'));
