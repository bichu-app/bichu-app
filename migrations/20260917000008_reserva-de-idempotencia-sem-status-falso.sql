-- A reserva de idempotencia deixa de inventar um status HTTP.
--
-- O DEFEITO, encontrado ao ligar a primeira rota idempotente de verdade
-- (`createFoundReportFromTag`): `idempotency_keys.response_status` e `NOT NULL`
-- com `CHECK (response_status BETWEEN 100 AND 599)`, e a reserva -- o passo que
-- acontece ANTES de executar, para que duas tentativas simultaneas da mesma
-- chave nao executem as duas -- gravava `0` para dizer "ainda nao ha resposta".
-- Zero nao e status HTTP, a restricao recusava a linha, e toda chamada a uma
-- rota idempotente terminava em 500 sem nunca chegar ao efeito.
--
-- A RESTRICAO ESTAVA CERTA e nao e ela que muda de sentido: a coluna guarda um
-- status HTTP, e `0` nao e um. O que estava errado era usar um valor de fora do
-- dominio da coluna como sinalizador de outro estado. O estado "reservada, ainda
-- executando" e a AUSENCIA de resposta, e a ausencia de valor tem uma forma
-- propria no banco.
--
-- POR QUE ISSO SOBREVIVEU AOS TESTES, que e a parte que interessa para a proxima
-- vez: a suite exercita a idempotencia contra um dobre em memoria que reproduz
-- as tres regras do adaptador, e o dobre nao tem restricao nenhuma. Ele aceitava
-- o `0` com prazer. Nenhum teste tocava a tabela, entao a divergencia entre o
-- codigo e o esquema nao tinha onde aparecer -- e apareceu na primeira rota que
-- de fato passou por ali.

-- Up Migration

ALTER TABLE idempotency_keys
  ALTER COLUMN response_status DROP NOT NULL;

ALTER TABLE idempotency_keys
  DROP CONSTRAINT idempotency_keys_response_status_check;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_response_status_check
  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599);

COMMENT ON COLUMN idempotency_keys.response_status IS
  'NULL enquanto a chave esta reservada e a execucao em curso. Depois disso, o status HTTP da resposta gravada.';

-- Corpo sem status seria uma linha concluida sem saber com o que: as duas
-- colunas andam juntas, e o banco passa a dizer isso em vez de confiar em quem
-- escreve o UPDATE.
ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_corpo_exige_status
  CHECK (response_status IS NOT NULL OR response_body IS NULL);

-- Down Migration

-- Uma reserva em curso nao e dado a preservar: ela e o registro de uma execucao
-- que ainda nao terminou, e o cliente repete. Apagar e o unico jeito de a coluna
-- voltar a ser NOT NULL sem inventar um status para linha nenhuma -- que e
-- exatamente o defeito que esta migracao desfaz.
DELETE FROM idempotency_keys WHERE response_status IS NULL;

ALTER TABLE idempotency_keys
  DROP CONSTRAINT idempotency_keys_corpo_exige_status;

ALTER TABLE idempotency_keys
  DROP CONSTRAINT idempotency_keys_response_status_check;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT idempotency_keys_response_status_check
  CHECK (response_status BETWEEN 100 AND 599);

ALTER TABLE idempotency_keys
  ALTER COLUMN response_status SET NOT NULL;
