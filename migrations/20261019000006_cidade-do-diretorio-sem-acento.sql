-- O filtro de cidade do diretorio de `Perto` passa a comparar SEM ACENTO, e
-- este indice e o que impede a correcao de virar uma varredura.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: o predicado de cidade deixou de
-- ser `lower(city) = lower($1)` e passou a ser
-- `texto_para_busca(city) = texto_para_busca($1)`, e nenhum indice existente
-- atende uma FUNCAO sobre a coluna -- um B-tree sobre `city` crua nao serve a
-- uma expressao que o planejador nao sabe inverter.
--
-- O QUE ESTAVA ERRADO, MEDIDO NA HOMOLOGACAO EM 19/10/2026 COM CONTA VALIDA:
--
--   GET /v1/directory/entries
--     200  {"items":[{... "city":"São Paulo" ...}],"total":1}
--   GET /v1/directory/entries?city=Sao%20Paulo
--     200  {"items":[],"total":0}
--
-- Quem digitasse `Sao Paulo` sem til nao achava nada, e a tela nao dizia que o
-- filtro falhou: ela desenhava o estado vazio do recorte, que afirma que nao
-- ha profissional naquela regiao.
--
-- ---------------------------------------------------------------------------
-- UMA REGRA DE COMPARACAO DE CIDADE NO PRODUTO, E NAO DUAS
-- ---------------------------------------------------------------------------
-- A listagem publica de perdidos ja comparava cidade por
-- `texto_para_busca(lost_cases.last_seen_city) = texto_para_busca($1)`
-- (`kysely-listagem-publica-de-perdidos.ts`). Com o diretorio em `lower()`, o
-- mesmo texto digitado do mesmo jeito achava o pet perdido e nao achava o
-- veterinario -- duas regras que concordam so enquanto ninguem digita sem
-- acento.
--
-- `texto_para_busca` e a funcao da migracao `20260928000006`: `IMMUTABLE`,
-- `STRICT`, `PARALLEL SAFE`, definida como
-- `lower(unaccent('unaccent'::regdictionary, texto))`. A forma de dois
-- argumentos de `unaccent` e o que a torna `IMMUTABLE`, e **e por ser
-- IMMUTABLE que ela pode entrar num indice de expressao**. A prosa daquela
-- migracao explica o preco: trocar o conteudo do dicionario `unaccent` exige
-- `REINDEX`, e o dicionario deste produto e o que vem da imagem.
--
-- ---------------------------------------------------------------------------
-- B-TREE, E NAO GIN TRIGRAMA
-- ---------------------------------------------------------------------------
-- O indice de `q` (`professionals_busca_por_nome`) e GIN trigrama porque `q`
-- casa por `LIKE '%termo%'`, e um padrao sem prefixo nao da a um B-tree por
-- onde comecar. **Cidade e IGUALDADE**, e igualdade e exatamente o que um
-- B-tree faz melhor: um GIN aqui seria maior, mais lento de manter e nao
-- responderia nada que este nao responda.
--
-- ---------------------------------------------------------------------------
-- O INDICE NAO E PARCIAL, E A AUSENCIA E A MESMA DECISAO DE 20260928000006
-- ---------------------------------------------------------------------------
-- O reflexo seria `WHERE status = 'published'`, ja que toda leitura publica do
-- diretorio filtra por publicado. Ele NAO esta aqui, e o motivo e o mesmo
-- medido naquela migracao: o Kysely escreve `"status" = $1`, com PARAMETRO, e
-- para usar um indice parcial o planejador precisa PROVAR que o predicado da
-- consulta implica o do indice -- `status = $1` nao implica
-- `status = 'published'` num plano generico. O indice funcionaria nas
-- primeiras execucoes (plano customizado) e pararia de ser usado a partir da
-- sexta, quando o Postgres passa ao plano generico. Defeito de desempenho que
-- aparece so depois de aquecido e exatamente o que nao se quer.
--
-- Custo de nao ser parcial: cobre tambem rascunho, oculto e removido. Sao
-- poucas linhas, e o filtro de `status` continua no `WHERE`, onde sempre
-- esteve.
--
-- ---------------------------------------------------------------------------
-- O QUE ESTA MIGRACAO NAO TOCA
-- ---------------------------------------------------------------------------
-- `professionals_publicados_por_lugar_texto` em `(state, city, neighborhood)`
-- FICA. Ela nao atende mais o predicado de cidade, mas continua atendendo
-- `state` e `neighborhood`, que seguem comparando por `upper()`/`lower()`.
-- Derruba-la junto seria resolver um pedido mexendo em dois filtros que
-- ninguem mediu.

-- Up Migration

CREATE INDEX professionals_cidade_normalizada
  ON professionals (texto_para_busca(city));

COMMENT ON INDEX professionals_cidade_normalizada IS
  'Atende `city` de GET /v1/directory/entries. A expressao indexada e identica a do predicado; mudar uma sem a outra deixa o filtro correto e lento, sem erro nenhum. Igualdade, por isso B-tree e nao GIN.';

-- Down Migration

DROP INDEX professionals_cidade_normalizada;
