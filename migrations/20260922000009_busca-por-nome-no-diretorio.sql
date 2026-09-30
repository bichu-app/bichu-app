-- Busca por nome no diretorio de `Perto`: normalizacao unica e indice trigrama.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: `GET /v1/directory/entries`
-- passa a aceitar `q`, e `q` casa por SUBSTRING tolerante a acento e a caixa.
-- Nenhum indice B-tree atende `LIKE '%texto%'`, entao sem esta migracao toda
-- busca e uma varredura sequencial da tabela inteira por requisicao.
--
-- ---------------------------------------------------------------------------
-- A NORMALIZACAO MORA AQUI, E SO AQUI
-- ---------------------------------------------------------------------------
-- A tentacao e normalizar em TypeScript e comparar com a coluna crua. Ela
-- quebra de um jeito que nenhum teste unitario pega: o indice e construido
-- sobre UMA expressao, e o predicado precisa ser a MESMA expressao, caractere
-- a caractere, ou o planejador nao casa os dois e o indice fica de enfeite.
-- Duas definicoes da mesma normalizacao, uma em `.ts` e outra em SQL, e a
-- segunda definicao que diverge -- e ela diverge sem erro, so ficando lenta.
--
-- Por isso `texto_para_busca` e uma funcao do banco, e os dois lados da
-- comparacao passam por ela: o lado indexado (`display_name`) e o termo que
-- chegou pela requisicao. O TypeScript nao normaliza nada; ele apara espaco e
-- entrega o texto como parametro.
--
-- Ja existem duas normalizacoes neste produto, e nenhuma serve aqui:
--
-- - `normalizarParaComparacao` (`src/modules/identity/domain/password-policy.ts`)
--   remove TODO caractere nao alfanumerico, inclusive espaco. Ela existe para
--   decidir se uma senha parece com o e-mail, onde colar as palavras e o
--   objetivo. Em busca de nome, colar as palavras faz `Clinica Vet` casar com
--   o termo `avet`, que nao esta escrito em lugar nenhum do nome.
-- - `normalizarCodigo` (`src/modules/tags/domain/tag-code.ts`) mapeia `I`/`L`
--   para `1` e `O` para `0`, que e correcao de leitura de plaquinha ao sol.
--   Aplicada a nome de gente, ela transformaria `Lili` em `1i1i`.
--
-- ---------------------------------------------------------------------------
-- POR QUE `unaccent` PRECISA DA FORMA DE DOIS ARGUMENTOS
-- ---------------------------------------------------------------------------
-- `unaccent(text)` e declarada STABLE, porque le o dicionario de busca padrao
-- do momento -- e nada STABLE pode entrar num indice de expressao. A forma
-- `unaccent(regdictionary, text)` e IMMUTABLE justamente porque o dicionario
-- vai fixado na chamada. E a receita da propria documentacao do PostgreSQL
-- (F.47.1, "unaccent"), e nao um truque nosso.
--
-- A consequencia honesta: se alguem trocar o conteudo do dicionario
-- `unaccent`, o indice fica dessincronizado do que a funcao passa a devolver e
-- precisa de REINDEX. Isso e o preco documentado da receita, e o dicionario
-- deste produto e o que vem da imagem -- ninguem o edita.
--
-- ---------------------------------------------------------------------------
-- POR QUE O INDICE NAO E PARCIAL, EMBORA A CONSULTA SEJA SO DE PUBLICADOS
-- ---------------------------------------------------------------------------
-- O reflexo seria `... WHERE status = 'published'`, para o indice ficar menor.
-- Ele NAO esta aqui, e o motivo e medido e nao estetico: a consulta gerada
-- pelo Kysely escreve `"status" = $1`, com PARAMETRO. Para usar um indice
-- parcial o planejador precisa PROVAR que o predicado da consulta implica o do
-- indice, e `status = $1` nao implica `status = 'published'` num plano
-- generico. O indice funcionaria nas primeiras execucoes (plano customizado,
-- com o valor a vista) e pararia de ser usado a partir da sexta, quando o
-- Postgres passa ao plano generico. Defeito de desempenho que aparece so em
-- producao e so depois de aquecido e exatamente o que nao se quer.
--
-- Custo de nao ser parcial: o indice cobre tambem rascunho, oculto e removido.
-- Sao poucas linhas e o filtro de `status` continua na clausula WHERE, onde
-- sempre esteve.

-- Up Migration

-- O CREATE aqui compra o mesmo que o `CREATE EXTENSION IF NOT EXISTS postgis`
-- da migracao 20260917000001 compra: num destino sem a extensao instalada, a
-- falha acontece no JOB DE MIGRACAO, com o nome do que falta, e nao na
-- primeira busca com o produto no ar.
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- A normalizacao, em um lugar so. `STRICT` porque nulo normalizado e nulo, e
-- `PARALLEL SAFE` porque a funcao nao toca em nada fora dos proprios
-- argumentos.
CREATE FUNCTION texto_para_busca(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT lower(unaccent('unaccent'::regdictionary, texto)) $$;

COMMENT ON FUNCTION texto_para_busca(text) IS
  'Forma comparavel de um texto de busca: sem acento e em minuscula. E a MESMA expressao do indice professionals_busca_por_nome e do predicado da busca -- duas definicoes divergiriam em silencio, ficando so lentas.';

-- O padrao de `LIKE`, com os curingas do usuario neutralizados.
--
-- Sem isto, `q=%` e `q=_` sao consultas legitimas do ponto de vista do schema
-- e devolvem a tabela inteira com uma varredura completa -- o caminho de abuso
-- mais barato que existe, e sem nenhum caractere suspeito na URL. O escape e
-- `\`, que e o padrao de `LIKE` e por isso nao precisa de clausula `ESCAPE`.
--
-- A ordem das trocas importa: a barra invertida primeiro, senao as barras
-- introduzidas pelas trocas seguintes seriam escapadas de novo.
CREATE FUNCTION padrao_de_busca(termo text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$
    SELECT '%' ||
           replace(replace(replace(texto_para_busca(termo), '\', '\\'), '%', '\%'), '_', '\_') ||
           '%'
  $$;

COMMENT ON FUNCTION padrao_de_busca(text) IS
  'O termo do usuario como padrao de LIKE, normalizado e com %, _ e \ neutralizados. Sem isto, q=% devolve a tabela inteira numa varredura completa.';

-- GIN trigrama, e nao B-tree: `LIKE '%texto%'` nao tem prefixo, e sem prefixo
-- um B-tree nao tem por onde comecar. O `gin_trgm_ops` quebra o texto em
-- trigramas e casa o padrao por eles.
--
-- ISSO TEM UM PISO: um padrao com menos de tres caracteres nao produz trigrama
-- nenhum, e a consulta volta a varrer a tabela. E por isso que `q` declara
-- `minLength: 3` no contrato -- o limite nao e gosto, e o ponto em que este
-- indice deixa de existir.
CREATE INDEX professionals_busca_por_nome
  ON professionals USING gin (texto_para_busca(display_name) gin_trgm_ops);

COMMENT ON INDEX professionals_busca_por_nome IS
  'Atende `q` de GET /v1/directory/entries. A expressao indexada e identica a do predicado; mudar uma sem a outra deixa a busca correta e lenta, sem erro nenhum.';

-- Down Migration

DROP INDEX professionals_busca_por_nome;

DROP FUNCTION padrao_de_busca(text);

DROP FUNCTION texto_para_busca(text);

-- AS EXTENSOES NAO SAO DERRUBADAS, E A AUSENCIA E DECISAO.
--
-- `CREATE EXTENSION IF NOT EXISTS` pode nao ter criado nada: em servico
-- gerenciado quem instala extensao e outro papel (ADR-0013 R1), e a imagem de
-- desenvolvimento pode ja traze-las. Derrubar aqui apagaria o que esta
-- migracao nao criou, e `DROP EXTENSION` leva junto, em cascata, tudo que
-- qualquer outra coisa tenha construido sobre ela. A descida desfaz o que a
-- subida acrescentou; ela nao desinstala infraestrutura compartilhada.
