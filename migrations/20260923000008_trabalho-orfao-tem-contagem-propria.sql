-- Up Migration
--
-- O MARCADOR ACIMA E OBRIGATORIO. Sem ele o `node-pg-migrate` roda subida e
-- descida na mesma transacao, e foi assim que "sair de todos os aparelhos"
-- respondeu 500 por vinte horas.
--
-- ============================================================================
-- POR QUE UMA CONTAGEM SEPARADA DE `attempts`
-- ============================================================================
--
-- `attempts` sobe na RESERVA, e isso e deliberado: trabalho que derruba o
-- processo nunca chega ao `fail`, e contar na falha faria o veneno voltar com a
-- contagem zerada, para sempre. A nota em `kysely-job-queue.ts` explica.
--
-- O preco e que `attempts` passa a somar duas historias diferentes na mesma
-- coluna:
--
--   o processo morreu segurando o trabalho     -> suspeita recai sobre a CARGA
--   o trabalho lancou e a fila adiou           -> suspeita recai sobre o AMBIENTE
--
-- As duas merecem tetos diferentes, e por um motivo medido: uma foto que estoura
-- a memoria do processo estoura de novo na retentativa, e cada estouro leva
-- consigo TODO trabalho que estava em voo no mesmo processo. Repetir isso cinco
-- vezes -- que e o `max_attempts` padrao -- e cinco quedas para descobrir o que
-- a segunda ja tinha dito.
--
-- Entao a contagem de ORFANDADE mora em coluna propria. Ela sobe so quando o
-- trabalho e recuperado de `running` por trava vencida, que e a assinatura de
-- "o processo morreu com ele na mao": quem falha por excecao passa por `fail` e
-- nao encosta aqui.
--
-- Nome de coluna em ingles porque e o que as vizinhas usam (`attempts`,
-- `locked_at`, `max_attempts`). Identificador em portugues vale para o codigo
-- TypeScript; trocar a lingua no meio de uma tabela deixa a tabela sem lingua.

ALTER TABLE jobs
  ADD COLUMN orphan_recoveries integer NOT NULL DEFAULT 0
    CHECK (orphan_recoveries >= 0);

COMMENT ON COLUMN jobs.orphan_recoveries IS
  'Quantas vezes este trabalho foi recuperado de `running` por trava vencida, isto e, quantas vezes o processo morreu segurando ele. NAO e `attempts`: esta coluna acusa a carga, aquela acusa o ambiente.';

-- ============================================================================
-- O INDICE, E POR QUE O `jobs_proximo` NAO SERVE
-- ============================================================================
--
-- `jobs_proximo` e `(run_after) WHERE status IN ('pending','running')`. A
-- varredura de orfao nao pergunta por `run_after`: ela pergunta por `locked_at`
-- vencido entre os `running`. Percorrer o indice de `run_after` para depois
-- filtrar `locked_at` funciona e le tudo que esta em voo -- que e pouco hoje e
-- deixa de ser quando a fila crescer.
--
-- Parcial em `running` de proposito: trabalho terminado e a maior parte da
-- tabela depois da primeira semana, e `locked_at` volta a NULL em `complete` e
-- em `fail`. O indice so guarda o que pode estar orfao.
CREATE INDEX jobs_orfaos ON jobs (locked_at)
  WHERE status = 'running';

-- Down Migration

DROP INDEX jobs_orfaos;

ALTER TABLE jobs
  DROP COLUMN orphan_recoveries;
