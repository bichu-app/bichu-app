-- ===========================================================================
-- O CARIMBO MUDOU DE `20261019000050` PARA `20261020000008` EM 20/10/2026
-- ===========================================================================
-- Nao houve duas migracoes: e ESTA, renumerada na mescla do terceiro lote de
-- 20/10/2026, e o numero novo foi atribuido pelo coordenador e nao escolhido
-- por quem mesclou.
--
-- O motivo e o teto. O portao `verificar-carimbo-de-migracao` reprova migracao
-- nova com carimbo ANTERIOR ao maior carimbo de `origin/development`, e a onda
-- 1 deste lote subiu esse teto para `20261020000007`. O `20261019000050`
-- passou a ficar abaixo dele, e a saida que o proprio portao imprime e
-- renumerar para o teto mais um.
--
-- As referencias ao numero antigo dentro deste arquivo e em
-- `tests/integration/resumo-do-token-tem-32-bytes.test.ts` foram trocadas na
-- mesma passada, para quem ler o historico nao procurar uma migracao que nunca
-- existiu.

-- As colunas `token_hash` guardam os 32 BYTES do SHA-256, e o banco passa a
-- cobrar isso.
--
-- ====================================================================
-- O DEFEITO, MEDIDO
-- ====================================================================
--
-- Em 19/10/2026, em homologacao (`hml.bichu.app`, commit `458cd005`):
--
--   select octet_length(token_hash) as bytes, count(*) from verification_tokens group by 1;
--    bytes | count
--   -------+-------
--       32 |     1   <- gravada a mao, e `/auth/email-verification/confirm` respondeu 410
--       44 |    14   <- as que a producao escreveu
--
-- SHA-256 tem 32 bytes. 44 e o tamanho do TEXTO base64 de 32 bytes.
--
-- A causa eram duas linhas que se encontravam. `comoTokenHash` em
-- `src/modules/identity/application/auth-service.ts` devolvia
-- `hashDeToken(valor).toString('base64')` -- uma string --, e o adaptador
-- fechava a distancia ate a coluna `bytea` com `Buffer.from(hash)`. Sem segundo
-- argumento, `Buffer.from` de uma string interpreta utf8: o que chegava a
-- coluna eram os 44 bytes ASCII do texto base64, nao o resumo.
--
-- Escrita e leitura passavam pelo MESMO caminho, entao o ida-e-volta pela
-- aplicacao funcionava e nenhum teste reprovava. A `20260917000001` declarava a
-- coluna com "SHA-256 de 256 bits de CSPRNG (SEC-005)" escrito ao lado dela --
-- e ela nao guardava isso. Era comentario de ARQUIVO, que ninguem pode
-- consultar; esta migracao o promove a `COMMENT ON COLUMN`, que se le do banco.
--
-- O conserto esta no codigo (`TokenHash` virou `Buffer`, e nao sobrou conversao
-- nenhuma para errar). Esta migracao responde pelo que ja esta no banco e pelo
-- que vier depois.
--
-- ====================================================================
-- OS DADOS EXISTENTES SAO RECUPERAVEIS, E NAO SAO DESCARTADOS
-- ====================================================================
--
-- O plano de origem previa APAGAR os tokens pendentes, aceitando que quem
-- esperava um link de verificacao ou de redefinicao tivesse de pedir outro. Nao
-- e preciso: o que esta na coluna e o TEXTO BASE64 do resumo certo, byte a byte
-- -- a conversao errada foi uma mudanca de representacao, nao uma perda. Ela se
-- desfaz inteira:
--
--   decode(encode(token_hash, 'escape'), 'base64')
--
-- `encode(..., 'escape')` le os 44 bytes como o texto que eles sao, `decode` o
-- resolve de volta aos 32 bytes do digest. Nenhum link pendente deixa de
-- resolver, nenhuma linha de trilha perde o valor que a enderecava, e o 410 sem
-- explicacao que o plano aceitava como sintoma nao acontece.
--
-- `encode(..., 'escape')` e nao `convert_from(..., 'UTF8')`, que seria a leitura
-- obvia: `convert_from` LEVANTA EXCECAO diante de bytes que nao formam UTF-8
-- valido, e o `AND` do `WHERE` nao tem ordem garantida -- uma linha de 44 bytes
-- que nao fosse o texto base64 derrubaria a migracao inteira em vez de ser
-- deixada de lado. `encode(..., 'escape')` nunca levanta: byte fora do
-- imprimivel sai como `\nnn`, que a expressao abaixo nao casa.
--
-- A conversao e GUARDADA, e nao so aplicada: `octet_length = 44` e o texto
-- casando o alfabeto base64 com o enchimento no fim. Linha que nao satisfaca as
-- duas condicoes nao e tocada -- e, se sobrar alguma, o `ALTER` no fim desta
-- migracao REPROVA, nomeando a restricao e a tabela (`check constraint
-- "verification_tokens_token_hash_32_bytes" of relation "verification_tokens"
-- is violated by some row`), em vez de deixar passar calado. Medido: uma linha
-- de 44 bytes com `0xff` dentro passa pelo bloco sem levantar e e o `ALTER` que
-- a acusa.
--
-- ====================================================================
-- AS TRES TABELAS, E POR QUE `refresh_tokens` ENTRA
-- ====================================================================
--
-- `verification_tokens` e `reauth_tokens` erravam: as duas sao escritas pelo
-- caminho com `Buffer.from(hash)` sem argumento.
--
-- `refresh_tokens` NAO errava -- o adaptador usava `Buffer.from(hash, 'base64')`
-- ali, que e a conversao certa, e foi essa divergencia dentro do mesmo arquivo
-- que deixou o defeito parecer um detalhe. Ela entra aqui so pela restricao: a
-- coluna e da mesma classe, a promessa do `COMMENT` e a mesma, e um `UPDATE`
-- que nao casa nenhuma linha custa o que custa uma varredura de tabela pequena.
--
-- `admin_sessions`, `admin_reauth_tokens`, `found_reports` e `pet_transfers` nao
-- entram porque nunca passaram por string: `hashDeToken` ja devolve `Buffer` e
-- e isso que o adaptador grava. As tres ultimas, inclusive, JA tem
-- `CHECK (octet_length(...) = 32)` desde o nascimento -- e e exatamente por isso
-- que nunca divergiram. A licao desta migracao e que a restricao que falta e a
-- diferenca entre um defeito que reprova na primeira escrita e um que atravessa
-- um mes de esteira.
--
-- ====================================================================
-- A CONTAGEM VAI PARA `audit.events`, E NAO PARA `RAISE NOTICE`
-- ====================================================================
--
-- O `node-pg-migrate` DESCARTA `NOTICE` e `WARNING` de migracao: ele nao
-- registra ouvinte de `notice` no cliente `pg`. O que ele imprime e o SQL que
-- vai executar, entao o TEXTO do `RAISE` aparece e a MENSAGEM emitida nunca
-- aparece (medido em 28/09/2026 contra Postgres 16). Quantas linhas foram
-- convertidas em cada ambiente e exatamente o tipo de numero que alguem vai
-- querer consultar depois -- entao ele e GRAVADO, com `actor_kind = 'system'`,
-- do mesmo jeito que a `20260921000001` faz.
--
-- `gen_random_uuid()` e v4 onde o resto do banco usa v7, pela mesma razao dada
-- la: a trilha ordena por `occurred_at`, nao por id, e nao ha restricao de
-- versao na coluna.
--
-- ====================================================================
-- A DESCIDA
-- ====================================================================
--
-- A descida derruba as restricoes e NAO desfaz a conversao. Reconverter os 32
-- bytes de volta a 44 de ASCII seria reintroduzir o defeito de proposito, e com
-- o codigo revertido junto o valor certo continua sendo o que o banco tem
-- agora: `Buffer.from(hash, 'base64')` em `refresh_tokens` sempre leu assim, e
-- os outros dois caminhos passam a ler assim. A descida existe para soltar a
-- trava, nao para refazer o estrago.

-- Up Migration

DO $$
DECLARE
  convertidas_verification bigint;
  convertidas_reauth       bigint;
  convertidas_refresh      bigint;
BEGIN
  -- `octet_length = 44` E o texto conferido contra o alfabeto base64: 43
  -- caracteres do alfabeto mais UM `=` de enchimento, que e exatamente a forma
  -- do base64 de 32 bytes (32 = 3*10 + 2, entao sobra um grupo de dois bytes).
  -- As duas condicoes juntas, e nao so o tamanho: `decode` de algo que nao e
  -- base64 levanta excecao e derrubaria a migracao por uma linha estranha.
  WITH convertidas AS (
    UPDATE verification_tokens
       SET token_hash = decode(encode(token_hash, 'escape'), 'base64')
     WHERE octet_length(token_hash) = 44
       AND encode(token_hash, 'escape') ~ '^[A-Za-z0-9+/]{43}=$'
    RETURNING 1
  )
  SELECT count(*) INTO convertidas_verification FROM convertidas;

  WITH convertidas AS (
    UPDATE reauth_tokens
       SET token_hash = decode(encode(token_hash, 'escape'), 'base64')
     WHERE octet_length(token_hash) = 44
       AND encode(token_hash, 'escape') ~ '^[A-Za-z0-9+/]{43}=$'
    RETURNING 1
  )
  SELECT count(*) INTO convertidas_reauth FROM convertidas;

  WITH convertidas AS (
    UPDATE refresh_tokens
       SET token_hash = decode(encode(token_hash, 'escape'), 'base64')
     WHERE octet_length(token_hash) = 44
       AND encode(token_hash, 'escape') ~ '^[A-Za-z0-9+/]{43}=$'
    RETURNING 1
  )
  SELECT count(*) INTO convertidas_refresh FROM convertidas;

  -- Uma linha so, e so quando houve o que converter: banco novo (a esteira, a
  -- maquina de quem desenvolve, `make reset`) nao ganha evento nenhum, e assim
  -- a presenca do evento significa "este ambiente tinha dado do defeito".
  IF convertidas_verification + convertidas_reauth + convertidas_refresh > 0 THEN
    INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, metadata)
    VALUES (
      gen_random_uuid(),
      'system',
      'token_hash_convertido_de_base64_para_bytes',
      'migration',
      '20261020000008',
      jsonb_build_object(
        'verification_tokens', convertidas_verification,
        'reauth_tokens', convertidas_reauth,
        'refresh_tokens', convertidas_refresh,
        'causa', 'Buffer.from(hash) sem segundo argumento gravava os 44 bytes ASCII do texto base64 na coluna bytea',
        'medido_em', 'hml.bichu.app, commit 458cd005, 19/10/2026',
        'migracao', '20261020000008_resumo-do-token-em-32-bytes'));
  END IF;
END
$$;

-- As restricoes. Elas sao o ponto desta migracao: o conserto no codigo vale
-- para quem passa por `comoTokenHash`, e isto vale para QUALQUER escrita --
-- inclusive a de um script rodado a mao, que e literalmente como a unica linha
-- de 32 bytes em homologacao apareceu.
--
-- `VALIDATE` imediato (sem `NOT VALID`): as tabelas sao pequenas, e uma
-- restricao que nasce nao validada nao responde pelo passado -- que e metade do
-- que se quer aqui.
ALTER TABLE verification_tokens
  ADD CONSTRAINT verification_tokens_token_hash_32_bytes
  CHECK (octet_length(token_hash) = 32);

ALTER TABLE reauth_tokens
  ADD CONSTRAINT reauth_tokens_token_hash_32_bytes
  CHECK (octet_length(token_hash) = 32);

ALTER TABLE refresh_tokens
  ADD CONSTRAINT refresh_tokens_token_hash_32_bytes
  CHECK (octet_length(token_hash) = 32);

-- A promessa sai do comentario de arquivo e vira `COMMENT ON COLUMN`: a mesma
-- frase, agora onde se consulta e com o banco cobrando o que ela diz.
COMMENT ON COLUMN verification_tokens.token_hash IS
  'SHA-256 de 256 bits de CSPRNG (SEC-005): os 32 BYTES do resumo, nunca o texto base64 deles. Ate 19/10/2026 esta coluna guardava os 44 bytes ASCII do base64, porque `Buffer.from(hash)` sem segundo argumento interpreta a string como utf8; a 20261020000008 converteu o que havia e trouxe `verification_tokens_token_hash_32_bytes`.';

COMMENT ON COLUMN reauth_tokens.token_hash IS
  'SHA-256 de 256 bits de CSPRNG (SEC-005): os 32 BYTES do resumo, nunca o texto base64 deles. Mesmo caminho e mesmo conserto de `verification_tokens.token_hash` (20261020000008).';

COMMENT ON COLUMN refresh_tokens.token_hash IS
  'SHA-256 de 256 bits de CSPRNG (SEC-005): os 32 BYTES do resumo, nunca o texto base64 deles. Esta coluna nunca divergiu -- o adaptador sempre usou `Buffer.from(hash, ''base64'')` aqui --, e ganhou `refresh_tokens_token_hash_32_bytes` na 20261020000008 porque e da mesma classe das duas que divergiram.';

-- Down Migration

ALTER TABLE refresh_tokens DROP CONSTRAINT refresh_tokens_token_hash_32_bytes;
ALTER TABLE reauth_tokens DROP CONSTRAINT reauth_tokens_token_hash_32_bytes;
ALTER TABLE verification_tokens DROP CONSTRAINT verification_tokens_token_hash_32_bytes;

-- As tres colunas nao tinham `COMMENT` antes desta migracao -- o texto vivia no
-- arquivo da `20260917000001`. Desfazer e voltar a nao ter.
COMMENT ON COLUMN verification_tokens.token_hash IS NULL;
COMMENT ON COLUMN reauth_tokens.token_hash IS NULL;
COMMENT ON COLUMN refresh_tokens.token_hash IS NULL;
