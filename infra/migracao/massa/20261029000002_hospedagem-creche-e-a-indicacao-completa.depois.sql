-- O ESTADO FINAL que a massa de `20261029000002` tem de produzir.
--
-- Roda depois de `migrate up` chegar a cabeca, e afirma por `RAISE EXCEPTION`
-- dentro do SQL -- nao por mensagem no log. O motivo e medido: o
-- `node-pg-migrate` nao registra ouvinte de `notice` no cliente `pg`, entao
-- `RAISE NOTICE` e `RAISE WARNING` de migracao sao DESCARTADOS. Um portao que
-- procurasse a contagem na saida da migracao procuraria o que nunca esta la.
--
-- Isto e o que separa este portao de "a migracao nao explodiu". Sem o estado
-- final afirmado, `SET kinds = ARRAY['boarding']` -- que APAGA a segunda
-- atividade da entrada -- tambem sairia 0.

DO $$
DECLARE
  n         bigint;
  atividades text[];
BEGIN
  -- 0. A MASSA ESTA LA. Sem este controle, um `WHERE` que nao casasse nada
  --    faria todas as afirmacoes abaixo passarem sobre zero linha.
  SELECT count(*) INTO n FROM professionals WHERE slug LIKE 'massa-s%' OR slug = 'massa-sem-sitter';
  IF n <> 4 THEN
    RAISE EXCEPTION 'esperava as 4 entradas da massa, achei %', n;
  END IF;

  -- 1. NENHUMA entrada ficou com `sitter`. Zero e o resultado certo: as linhas
  --    da massa foram semeadas como hospedagem, e e isso que elas significam.
  SELECT count(*) INTO n FROM professionals WHERE 'sitter' = ANY (kinds);
  IF n <> 0 THEN
    RAISE EXCEPTION 'sobraram % entrada(s) com sitter; a reclassificacao deveria ter movido todas', n;
  END IF;

  -- 2. AS TRES que tinham `sitter` tem `boarding`.
  SELECT count(*) INTO n
    FROM professionals
   WHERE slug IN ('massa-so-sitter', 'massa-sitter-primeiro', 'massa-sitter-depois')
     AND 'boarding' = ANY (kinds);
  IF n <> 3 THEN
    RAISE EXCEPTION 'esperava 3 entradas da massa com boarding, achei %', n;
  END IF;

  -- 3. A SEGUNDA ATIVIDADE NAO FOI APAGADA, e esta e a afirmacao que pega
  --    `SET kinds = ARRAY['boarding']`.
  SELECT kinds INTO atividades FROM professionals WHERE slug = 'massa-sitter-primeiro';
  IF atividades <> ARRAY['boarding', 'vet']::text[] THEN
    RAISE EXCEPTION
      'massa-sitter-primeiro deveria ser {boarding,vet} e e %: ou a outra atividade foi apagada, ou a POSICAO mudou',
      atividades;
  END IF;

  -- 4. A POSICAO FOI PRESERVADA. `{vet,sitter}` vira `{vet,boarding}`, com
  --    `vet` ainda em PRIMEIRO -- e o primeiro elemento e o que o contrato
  --    publica em `kind` (`ProfessionalKinds`). Uma implementacao que
  --    reconstruisse o array poria `boarding` na frente e passaria no item 3
  --    se ele comparasse conjunto; por isso a comparacao e de ARRAY e nao de
  --    pertinencia.
  SELECT kinds INTO atividades FROM professionals WHERE slug = 'massa-sitter-depois';
  IF atividades <> ARRAY['vet', 'boarding']::text[] THEN
    RAISE EXCEPTION
      'massa-sitter-depois deveria ser {vet,boarding} e e %: a reclassificacao mexeu na ORDEM, e o primeiro elemento e o que sai em kind',
      atividades;
  END IF;

  -- 5. O CONTROLE: a entrada SEM `sitter` nao mudou, nem no conteudo nem na
  --    ordem. Sem ela, um `UPDATE` sem `WHERE` passaria nos itens 1 a 4.
  SELECT kinds INTO atividades FROM professionals WHERE slug = 'massa-sem-sitter';
  IF atividades <> ARRAY['groomer', 'clinic']::text[] THEN
    RAISE EXCEPTION
      'massa-sem-sitter deveria continuar {groomer,clinic} e e %: a reclassificacao tocou linha que nao tinha sitter',
      atividades;
  END IF;

  -- 6. NENHUM ARRAY ENCOLHEU NEM CRESCEU. As quatro linhas da massa somam
  --    1 + 2 + 2 + 2 = **7** elementos quando semeadas, e tem de somar 7
  --    depois. O item 3 pega a perda numa linha nomeada; este pega a perda em
  --    qualquer uma delas, inclusive numa que alguem acrescente a massa depois.
  SELECT coalesce(sum(cardinality(kinds)), 0) INTO n
    FROM professionals
   WHERE slug IN ('massa-so-sitter', 'massa-sitter-primeiro', 'massa-sitter-depois', 'massa-sem-sitter');
  IF n <> 7 THEN
    RAISE EXCEPTION 'as 4 entradas da massa somavam 7 atividades e agora somam %', n;
  END IF;

  -- 7. A FILA DE INDICACAO NAO FOI RECLASSIFICADA, e este e o segundo
  --    controle. A decisao do cliente nomeou as entradas do DIRETORIO;
  --    reescrever a indicacao de outra pessoa e decisao que ninguem tomou.
  SELECT count(*) INTO n
    FROM directory_suggestions
   WHERE ref = 'massa-hospedagem-indicacao-0001' AND kind = 'sitter';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'a indicacao da massa deveria continuar com kind = sitter, e nao continua: a migracao reclassificou a fila de carona';
  END IF;

  -- 8. A CONTAGEM MOVIDA FICOU NA TRILHA. `node-pg-migrate` descarta NOTICE,
  --    entao `audit.events` e o unico lugar onde o registro sobrevive -- e sem
  --    esta afirmacao o `INSERT` poderia ter sido esquecido sem ninguem ver.
  SELECT count(*) INTO n
    FROM audit.events
   WHERE action = 'directory_entry_kind_reclassificado'
     AND resource_kind = 'directory_entry'
     AND actor_kind = 'system'
     AND metadata ->> 'migracao' = '20261029000002_hospedagem-creche-e-a-indicacao-completa';
  -- **`>= 1` e nao `= 1`, e a diferenca foi MEDIDA e nao prevista.** No fluxo
  --    deste portao o banco e efemero e a migracao sobe uma vez, entao o numero
  --    e 1. Mas a descida NAO apaga o evento -- trilha e append-only por
  --    desenho, e uma descida que a limpasse apagaria o registro de que a
  --    subida aconteceu --, entao subir e descer em sequencia ACUMULA um evento
  --    por subida. Isso apareceu com 4 eventos num banco onde eu havia
  --    exercitado `up`/`down` quatro vezes; `= 1` reprovaria por um
  --    comportamento correto.
  IF n < 1 THEN
    RAISE EXCEPTION 'nenhum evento de reclassificacao na trilha: a subida nao registrou o que moveu';
  END IF;

  -- E o evento MAIS RECENTE carrega a contagem, e nao so a existencia: nos dois
  -- lados, e com `entradas` igual ao que de fato moveu. (Em homologacao o
  -- numero e 27; aqui e 3, porque a massa semeia 3.)
  SELECT count(*) INTO n
    FROM (
      SELECT e.before AS antes, e.after AS depois
        FROM audit.events AS e
       WHERE e.action = 'directory_entry_kind_reclassificado'
       ORDER BY e.occurred_at DESC
       LIMIT 1
    ) AS ultimo
   WHERE ultimo.antes ->> 'kind' = 'sitter'
     AND ultimo.depois ->> 'kind' = 'boarding'
     AND (ultimo.antes -> 'entradas')::bigint >= 3
     AND (ultimo.depois -> 'entradas')::bigint >= 3;
  IF n <> 1 THEN
    RAISE EXCEPTION
      'o evento de reclassificacao nao carrega a contagem movida nos dois lados (before.kind=sitter, after.kind=boarding, entradas >= 3)';
  END IF;
END $$;
