-- ATIVIDADES MULTIPLAS NA ENTRADA DO DIRETORIO (decisao do cliente de
-- 21/10/2026): uma clinica que tambem faz banho e tosa deixa de ter de escolher.
--
-- ## A FORMA: UMA COLUNA DE LISTA, e SEM TABELA NOVA
--
-- Decisao do cliente: **sem tabela nova**. Entao `kind text` vira
-- `kinds text[]`, e nao ha `professional_kinds` com chave estrangeira.
--
-- ## POR QUE LISTA DE VERDADE, E NAO TEXTO GRUDADO COM SEPARADOR
--
-- Esta e a decisao tecnica central deste arquivo, e o motivo e MEDIDO, nao
-- estetico.
--
-- Com texto grudado (`'vet,clinic'`, ou `'|vet|clinic|'`), o filtro por chip
-- deixa de comparar VALOR e passa a procurar PEDACO -- `LIKE '%vet%'`. E
-- `'vet'` e pedaco de outras coisas:
--
--   - casa dentro de `'veterinario'`, se a lista crescer com um valor assim;
--   - casa dentro de uma frase como `'sem vet'`, se algum dia o campo receber
--     texto livre;
--   - casa dentro de `'vet_especialista'`, que e exatamente o tipo de valor que
--     o cabecalho da `20260921000002` previu quando escreveu "esta lista vai
--     crescer".
--
-- O defeito disso **nao reprova nada**: o chip simplesmente traz o registro
-- errado, em silencio, e quem olha a tela nao tem como saber. Separador nas
-- bordas (`'|vet|'`) reduz o acidente mas nao o elimina, e troca uma comparacao
-- de igualdade por uma convencao que todo autor de consulta nova precisa
-- lembrar.
--
-- Lista de verdade devolve as duas coisas que o texto grudado tira:
--
--   1. o filtro compara **item inteiro** (`kinds @> ARRAY['vet']`), e `'vet'`
--      nunca casa com `'vet_especialista'`;
--   2. da para **indexar** (GIN), e o filtro por atividade volta a ter indice --
--      com texto grudado, `LIKE '%...%'` faria varredura de tabela.
--
-- ## O FILTRO E `EXISTS` SOBRE A LISTA, E NUNCA `JOIN` COM `SELECT` DIRETO
--
-- Dito aqui porque e a consequencia de produto da forma escolhida, e o lugar
-- onde ela sera desfeita por engano.
--
-- O estabelecimento com tres atividades tem de aparecer **nos tres chips** e
-- **uma vez em cada**. Com `unnest(kinds)` em `FROM` e `SELECT` direto, a linha
-- se multiplica por quantas atividades ela tem: a clinica que faz banho e tosa
-- apareceria DUAS vezes na mesma listagem, e `total` contaria duas. Com um teste
-- de pertinencia a linha e testada e nao desdobrada, e sai uma vez.
--
-- A FORMA ESCRITA E `kinds @> ARRAY['vet']::text[]`, e a escolha entre as formas
-- equivalentes e sobre o INDICE: `= ANY(kinds)` e `EXISTS (SELECT 1 FROM
-- unnest(kinds) ...)` dao o mesmo resultado, mas a classe `array_ops` de um GIN
-- sobre `text[]` indexa `@>`, `<@`, `&&` e `=` e **nao indexa `= ANY`** -- o
-- planejador nao reescreve um no outro. Com `= ANY` a consulta fica correta e
-- varre a tabela, com o indice abaixo ali do lado sem ser usado. E um defeito
-- que nao reprova nada: so aparece no `EXPLAIN`.
--
-- A suite tem isca para a duplicata, que e o defeito classico aqui.
--
-- ## MINIMO 1, TETO 6
--
-- `cardinality(kinds) BETWEEN 1 AND 6`.
--
-- **`cardinality` E NAO `array_length`, E ISTO FOI MEDIDO:** a primeira versao
-- deste arquivo escreveu `array_length(kinds, 1) BETWEEN 1 AND 6`, e a isca da
-- lista vazia REPROVOU contra o Postgres de verdade. O motivo:
-- `array_length('{}'::text[], 1)` devolve **NULL**, nao `0` -- e `CHECK` cujo
-- resultado e NULL conta como SATISFEITO. A lista vazia passava pelos dois
-- `CHECK` e gravava. `cardinality('{}'::text[])` devolve `0`, e `0 BETWEEN 1 AND
-- 6` e falso.
--
-- E a MESMA armadilha que esta migracao usa de PROPOSITO na 13 (o `CHECK` de
-- tamanho do texto alternativo, que passa a aceitar nulo sem reescrita) --
-- aqui ela era um defeito, e so apareceu porque havia isca para a lista vazia.
--
-- O minimo e 1 porque entrada sem atividade nenhuma nao e cadastravel: a
-- atividade e o que a entrada E, e `kind` sempre foi `NOT NULL`.
--
-- O teto e 6 porque **6 e o tamanho da lista fechada**. Teto maior seria
-- ficticio: nao existe sexto-e-primeiro valor para um setimo item apontar, e
-- `kinds <@ ARRAY[...]` ja impede qualquer coisa fora dos seis. Numero redondo
-- escolhido "com folga" aqui seria folga para nada.
--
-- **A UNICIDADE DOS ITENS FICA NA APLICACAO, e isso e limitacao do Postgres e
-- nao escolha:** `CHECK` nao aceita subconsulta, e `cardinality(kinds) =
-- cardinality(ARRAY(SELECT DISTINCT unnest(kinds)))` precisa de uma. O caso de
-- uso recusa repetido com `400`; o teto de 6 somado a `<@` garante que o pior
-- estado alcancavel por um caminho que ninguem previu e uma lista de seis
-- valores validos com repeticao -- feia, nunca insegura, e nunca com valor
-- inventado.
--
-- ## OS DOIS `CHECK`, E POR QUE SAO DOIS
--
--   - `professionals_atividades_tamanho`: faixa NUMERICA, sem literal de texto.
--     Fica FORA do registro de `tests/integration/conjunto-exato-dos-checks.test.ts`
--     pela regra do cabecalho dele, como `professionals_logradouro_tamanho`.
--   - `professionals_atividades_conhecidas`: a LISTA FECHADA, com os seis
--     literais. Entra no registro daquele arquivo, e por isso este commit toca
--     TRES arquivos juntos: esta migracao, aquele teste, e o contrato.
--
-- Dois e nao um porque sao duas perguntas diferentes ("quantas?" e "quais?") e
-- porque a mensagem de cada reprovacao precisa dizer qual delas falhou.
--
-- ## A CONVERSAO DO DADO: NENHUM REGISTRO PERDE NEM GANHA ATIVIDADE
--
-- `kinds := ARRAY[kind]`. Cada linha termina com **exatamente** a atividade que
-- tinha, agora como item unico de uma lista de um.
--
-- A ordem importa: a coluna nova nasce ANULAVEL, e preenchida a partir de
-- `kind`, e so depois recebe `NOT NULL`. Nascer `NOT NULL` exigiria um
-- `DEFAULT`, e um `DEFAULT` aqui seria uma atividade inventada para toda linha
-- existente.
--
-- A ISCA: o `SET NOT NULL` so passa se TODA linha foi convertida. Se o `UPDATE`
-- deixasse alguma de fora, a migracao reprova aqui em vez de seguir com uma
-- entrada sem atividade. E a prova esta na propria ordem dos comandos, sem
-- contagem a conferir a mao.
--
-- ## O INDICE
--
-- `professionals_publicados_por_atividade (kind, created_at DESC)` nao sobrevive
-- a queda da coluna, e um B-tree sobre `kinds` nao serve ao teste de pertinencia
-- de qualquer forma. Ele e trocado por GIN sobre `kinds`, parcial em
-- `status = 'published'` como o anterior -- a listagem do app so le publicado.
--
-- `created_at DESC` NAO entra no GIN, e nao da: GIN nao ordena. A ordenacao da
-- listagem e por distancia e depois por `display_name`
-- (`construtorDaListagem`), e nao por `created_at`, entao o par do indice
-- antigo nao estava servindo a ordenacao da consulta que existe hoje.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao mexe em `directory_suggestions.kind`.** A indicacao da comunidade
--   continua declarando UMA atividade: o formulario de quem indica pede uma, e
--   alargar a fila nao foi pedido. A aprovacao vira `ARRAY[kind]`.
-- - **Nao cria valor novo** na lista fechada. Os seis sao os mesmos.
-- - **Nao mexe em `entity_kind`**, que e eixo separado (`20261018000012`).
--
-- ## SOBRE O `down`
--
-- Devolve `kind text NOT NULL` com o `CHECK` original e **a PRIMEIRA atividade
-- da lista** (`kinds[1]`). A entrada com tres atividades perde duas, e isso e
-- perda de dado inevitavel: o esquema antigo tem lugar para uma. A primeira e a
-- escolha certa porque e a que a projecao do contrato publica como `kind` -- o
-- `down` devolve exatamente o que o app ja estava lendo.

-- Up Migration

-- Anulavel primeiro: ver "A CONVERSAO DO DADO" no cabecalho.
ALTER TABLE professionals
  ADD COLUMN kinds text[];

UPDATE professionals
   SET kinds = ARRAY[kind];

-- A ISCA DA CONVERSAO: se o `UPDATE` tivesse deixado linha de fora, isto
-- reprova a migracao inteira em vez de admitir entrada sem atividade.
ALTER TABLE professionals
  ALTER COLUMN kinds SET NOT NULL;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_tamanho
    CHECK (cardinality(kinds) BETWEEN 1 AND 6);

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_conhecidas
    CHECK (kinds <@ ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic']::text[]);

COMMENT ON COLUMN professionals.kinds IS
  'As ATIVIDADES da entrada, de 1 a 6, lista fechada dos mesmos seis valores que professionals.kind admitia (decisao do cliente de 21/10/2026: uma clinica que tambem faz banho e tosa nao precisa escolher). LISTA DE VERDADE e nao texto grudado com separador, e o motivo e o filtro: com texto grudado o chip procuraria PEDACO (LIKE) e "vet" casaria dentro de "vet_especialista" ou de uma frase, trazendo o registro errado SEM reprovar nada; lista deixa o filtro comparar ITEM INTEIRO (kinds @> ARRAY[valor]) e usar indice GIN -- `= ANY` daria o mesmo resultado e NAO usaria o indice, porque array_ops nao o indexa. O filtro e EXISTS/= ANY e NUNCA JOIN com unnest em SELECT direto: desdobrar a linha faria o estabelecimento de tres atividades aparecer tres vezes na mesma listagem e contar tres em total. Teto 6 = o tamanho da lista fechada, porque teto maior seria ficticio. A UNICIDADE DOS ITENS e conferida na APLICACAO: CHECK nao aceita subconsulta, e SELECT DISTINCT unnest precisa de uma. Substituiu kind, que foi convertido linha a linha com ARRAY[kind] -- nenhum registro perdeu nem ganhou atividade. O contrato publica kinds[1] como kind, para o APK em campo continuar lendo.';

COMMENT ON CONSTRAINT professionals_atividades_tamanho ON professionals IS
  'De 1 a 6. CARDINALITY e nao array_length, e a diferenca e a lista vazia: array_length(ARRAY[]::text[], 1) devolve NULL e CHECK que resulta NULL conta como SATISFEITO, entao com array_length a lista vazia GRAVAVA -- medido contra Postgres pela isca da lista vazia, que reprovou na primeira versao deste arquivo. cardinality devolve 0 e o CHECK recusa. Faixa NUMERICA, sem literal de texto, para ficar fora do registro de conjunto-exato-dos-checks.test.ts (a regra do cabecalho daquele arquivo). Minimo 1: a atividade e o que a entrada E, e kind sempre foi NOT NULL. Teto 6: o tamanho da lista fechada.';

COMMENT ON CONSTRAINT professionals_atividades_conhecidas ON professionals IS
  'A LISTA FECHADA das atividades, os mesmos seis de professionals_kind_check. `<@` (contido em) e nao `= ANY`: a pergunta e sobre a lista inteira, e lista vazia satisfaz `<@` -- quem proibe a vazia e professionals_atividades_tamanho. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts.';

-- O INDICE: GIN sobre a lista, no lugar do B-tree sobre a coluna que saiu.
DROP INDEX professionals_publicados_por_atividade;

CREATE INDEX professionals_publicados_por_atividade ON professionals USING GIN (kinds)
  WHERE status = 'published';

COMMENT ON INDEX professionals_publicados_por_atividade IS
  'O filtro por atividade da listagem de Perto, que le so publicado. GIN porque a pergunta e de PERTINENCIA (kinds @> ARRAY[valor]), que B-tree sobre array nao responde. A consulta precisa usar @> e nao = ANY: array_ops indexa @>, <@, && e =, e nao = ANY -- com = ANY a consulta fica correta e varre a tabela. `created_at DESC` saiu do indice e nao foi perdido: GIN nao ordena, e a listagem ordena por distancia e depois por display_name, nunca por created_at -- o par do indice antigo nao servia a ordenacao da consulta que existe.';

-- A coluna antiga sai por ultimo, depois de a nova estar completa e indexada.
ALTER TABLE professionals
  DROP COLUMN kind;

-- Down Migration

ALTER TABLE professionals
  ADD COLUMN kind text;

-- A PRIMEIRA atividade: e a que o contrato publica como `kind`, entao o `down`
-- devolve exatamente o que o app ja estava lendo. A entrada com mais de uma
-- perde as demais, e o esquema antigo nao tem onde guarda-las.
UPDATE professionals
   SET kind = kinds[1];

ALTER TABLE professionals
  ALTER COLUMN kind SET NOT NULL;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_kind_check
    CHECK (kind IN ('vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic'));

DROP INDEX professionals_publicados_por_atividade;

CREATE INDEX professionals_publicados_por_atividade ON professionals (kind, created_at DESC)
  WHERE status = 'published';

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_conhecidas;

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_tamanho;

ALTER TABLE professionals
  DROP COLUMN kinds;
