-- BLOQUEAR ALGUEM -- a ferramenta PESSOAL, e nao moderacao.
--
-- Fatia E da frente de comunidade, primeira do grupo 2. Ela vem antes de
-- conexao, de perfil a terceiros e da Petline porque uma decisao registrada do
-- projeto recusou envio de foto exatamente por falta de bloqueio e de denuncia:
-- sem este arquivo e sem a `20261018000032`, nao ha piso de seguranca sobre o
-- qual pousar nada que uma pessoa mostre a outra.
--
-- ## A DECISAO MAIS IMPORTANTE DESTE ARQUIVO: `user_blocks` NAO ENTRA NA FILA
--
-- A fila de moderacao do painel (`fila_de_moderacao`, migracao
-- `20261018000009`) junta as origens de DENUNCIA. `user_blocks` nao e uma
-- delas, e a ausencia e de proposito, nao esquecimento:
--
--   - bloquear nao tem administrador: ninguem revisa, ninguem aprova;
--   - bloquear nao tem revisao: nao existe fila, nao existe `resolved_at`;
--   - bloquear tem efeito IMEDIATO, na leitura, sem esperar por pessoa alguma.
--
-- Levar bloqueio para a fila faria o administrador responder por uma escolha
-- que e so de quem bloqueou -- e transformaria "nao quero ver esta pessoa" num
-- pedido de julgamento sobre ela. Sao coisas diferentes e continuam separadas.
--
-- ## `users.public_ref` -- POR QUE ESTA COLUNA NASCE AQUI
--
-- Para bloquear alguem e preciso ENDERECAR alguem, e hoje nao ha como: `users`
-- nao tem endereco publico nenhum. `id` e UUID interno e o ADR-0010 item 6 o
-- proibe em saida publica; o apelido (`@`) e de outra fatia, e quando chegar
-- sera um alias ESCOLHIDO e MUTAVEL -- exatamente o que o criterio 2 da
-- BICHUS-19 proibe como alvo de chave estrangeira e de endereco estavel.
--
-- Entao entra o desenho do ADR-0024, que e o de `pets`, de `professionals` e de
-- `professional_reviews.ref`: **`id uuid` primaria, endereco publico ao lado**.
-- `public_ref` e sorteado por linha, opaco, IMUTAVEL e nunca derivado de nome,
-- e-mail nem telefone -- ref derivado do dono permitiria cruzar as pegadas de
-- uma pessoa entre superficies, que e o defeito que a BICHUS-174 nomeia.
--
-- **ISTO E UMA DECISAO QUE ATRAVESSA A FRENTE E ESTA RELATADA COMO TAL.** Ela
-- nao emenda ADR nenhum (nao escrevo ADR): e a aplicacao literal do ADR-0024 a
-- uma tabela que ainda nao tinha endereco publico porque ninguem ainda havia
-- precisado apontar para uma pessoa.
--
-- ## A RETENCAO, e a divergencia que eu NAO implementei
--
-- O desenho da frente propoe, na tabela de retencao, que o BLOQUEIO sobreviva a
-- exclusao da conta do bloqueado por 24 meses, guardando o e-mail para que uma
-- conta nova com o mesmo e-mail nao reabra o canal. **NAO FIZ ISSO**, e o
-- briefing desta fatia diz o contrario por extenso: *"denuncia e o unico
-- registro que sobrevive a exclusao da conta do bloqueado"*.
--
-- Os dois textos divergem e eu segui o briefing, por uma razao tecnica que vale
-- sozinha: guardar o e-mail de uma conta expurgada e manter dado pessoal depois
-- do expurgo, que e precisamente o que o expurgo existe para nao deixar
-- acontecer (`tests/integration/expurgo-de-conta-conclui.test.ts`). Guardar o
-- HASH tampouco resolve: hash de e-mail e reversivel por dicionario, e um
-- indice sobre ele e uma lista de quem ja passou por aqui.
--
-- Entao `blocked_user_id` e `ON DELETE CASCADE`: expurgada a conta do
-- bloqueado, a linha de bloqueio vai com ela. A DENUNCIA, na
-- `20261018000032`, e a que sobrevive -- e la o mecanismo e outro e nao
-- precisa de e-mail: a denuncia guarda o `target_ref` em COPIA, entao a fila
-- continua agrupando pelo mesmo alvo depois do expurgo, sem apontar para
-- ninguem.
--
-- Relatado para quem decidir alargar, e nao resolvido por mim.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. O ENDERECO PUBLICO DA PESSOA
-- ---------------------------------------------------------------------------
-- Entra NULAVEL, recebe o preenchimento das linhas que ja existem e so entao
-- vira `NOT NULL`. A ordem e a unica que funciona sobre tabela com dado: uma
-- coluna `NOT NULL` sem valor padrao reprova no `ALTER`, e um valor padrao
-- constante daria o MESMO endereco a todas as contas.
ALTER TABLE users ADD COLUMN public_ref text;

-- 128 bits de aleatorio por linha, no mesmo formato de
-- `professional_reviews.ref`: 22 simbolos de base64url.
--
-- `gen_random_uuid()` e a fonte porque ela esta no nucleo do Postgres desde a
-- 13 e nao exige extensao -- `pgcrypto` NAO esta instalada neste banco, medido
-- (nenhuma migracao a cria, e `gen_random_bytes` nao existe). O UUID v4 carrega
-- 122 bits de aleatorio nos 128; os 6 bits de versao e variante sao constantes
-- e nao reduzem a aleatoriedade util abaixo do que um endereco opaco precisa.
--
-- `translate(..., '+/=', '-_')` faz duas coisas numa chamada: troca os dois
-- simbolos que base64 tem e base64url nao, e APAGA o `=` (tres simbolos de
-- origem contra dois de destino), que e o que leva 24 caracteres a 22.
UPDATE users
   SET public_ref = translate(
         encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
         '+/=', '-_')
 WHERE public_ref IS NULL;

ALTER TABLE users
  ALTER COLUMN public_ref SET NOT NULL,
  ADD CONSTRAINT users_public_ref_forma CHECK (public_ref ~ '^[A-Za-z0-9_-]{22}$');

-- UNICO E GLOBAL, e nao "so entre contas vivas": o endereco de uma conta
-- desabilitada nao pode ser reemitido a outra pessoa, porque um link antigo
-- passaria a apontar para alguem novo. Mesma razao de `pets_slug_unico`.
CREATE UNIQUE INDEX users_public_ref_unico ON users (public_ref);

COMMENT ON COLUMN users.public_ref IS
  'O ENDERECO PUBLICO E OPACO DA PESSOA (128 bits em base64url, 22 simbolos). Existe porque bloquear e denunciar precisam apontar para alguem e users nao tinha endereco nenhum: id e UUID interno e o ADR-0010 item 6 o proibe em saida publica. Desenho do ADR-0024 -- id uuid primaria, endereco publico ao lado, nenhuma chave estrangeira sobre o endereco publico. SORTEADO POR LINHA e NUNCA derivado de nome, e-mail ou telefone: ref derivado do dono permitiria cruzar as pegadas de uma pessoa entre superficies (BICHUS-174). IMUTAVEL: nao ha caminho de escrita que o troque. NAO e o apelido (@) -- aquele e alias escolhido e mutavel, de outra fatia, e endereco mutavel nao serve de endereco estavel (criterio 2 da BICHUS-19).';

-- ---------------------------------------------------------------------------
-- 2. `user_blocks`
-- ---------------------------------------------------------------------------
-- UNILATERAL e SILENCIOSO. Quem bloqueou decide sozinho; quem foi bloqueado
-- nao e avisado e nao tem como descobrir pela resposta -- recebe `404` com o
-- MESMO corpo de perfil inexistente, pelo ADR-0021 (autorizacao na clausula
-- `WHERE`, 404 e nunca 403). Um 404 diferente seria um oraculo, e descobrir que
-- foi bloqueado e o que gera retaliacao.
CREATE TABLE user_blocks (
  id                uuid        PRIMARY KEY,

  -- QUEM BLOQUEOU e QUEM FOI BLOQUEADO.
  --
  -- As duas NAO levam A MARCA do portao de saida, e a ausencia e
  -- deliberada -- mesma decisao e mesmas palavras de
  -- `professional_review_reports.reporter_user_id` (`20261017000017`): `src/`
  -- PRECISA das duas na clausula `WHERE`, porque o bloqueio e aplicado na
  -- LEITURA e em DOIS sentidos, e um predicado cujo nome `src/` nao pode
  -- escrever obrigaria toda leitura do produto a passar por funcao SQL.
  --
  -- O que NAO acontece: nenhuma resposta projeta nenhuma das duas. Nao existe
  -- campo de bloqueio em saida nenhuma, nem contagem, nem existencia -- e e por
  -- isso que o bloqueado vai continuar sem saber.
  blocker_user_id   uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  -- `ON DELETE CASCADE` e nao `SET NULL`: ver o cabecalho, secao da retencao. A
  -- linha morre com o expurgo da conta do bloqueado, de proposito, porque o
  -- unico jeito de ela sobreviver seria guardar o e-mail de uma conta
  -- expurgada.
  blocked_user_id   uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Ninguem bloqueia a si mesmo. Sem isto, `bloqueio_entre(eu, eu)` passaria a
-- ser verdadeiro e eu desapareceria das minhas proprias leituras.
ALTER TABLE user_blocks
  ADD CONSTRAINT user_blocks_nao_e_de_si_mesmo CHECK (blocker_user_id <> blocked_user_id);

-- UM bloqueio por par ORDENADO. Nao e por par nao-ordenado: A bloquear B e B
-- bloquear A sao dois atos distintos, e desbloquear e de quem bloqueou. Com
-- indice sobre par nao-ordenado, o desbloqueio de A apagaria o bloqueio de B.
CREATE UNIQUE INDEX user_blocks_um_por_par ON user_blocks (blocker_user_id, blocked_user_id);

-- O indice do SENTIDO INVERSO, e ele e o que faz "e vice-versa" ser barato.
-- A leitura pergunta as duas direcoes de uma vez; sem este indice, metade da
-- pergunta viria de varredura.
CREATE INDEX user_blocks_do_bloqueado ON user_blocks (blocked_user_id, blocker_user_id);

COMMENT ON TABLE user_blocks IS
  'BLOQUEIO ENTRE PESSOAS -- ferramenta PESSOAL, nao moderacao. NAO ENTRA NA FILA fila_de_moderacao (20261018000009), e isso e de proposito: bloquear nao tem administrador, nao tem revisao e tem efeito imediato na leitura. Levar bloqueio para a fila faria o administrador responder por uma escolha que e so de quem bloqueou. Unilateral e SILENCIOSO: o bloqueado nao e avisado e recebe 404 com o mesmo corpo de perfil inexistente (ADR-0021), porque um 404 diferente seria oraculo e descobrir que foi bloqueado e o que gera retaliacao. Efeito nos DOIS SENTIDOS na leitura -- quem bloqueou nao ve o bloqueado, e o bloqueado nao ve quem bloqueou --, aplicado por bloqueio_entre(uuid, uuid). NAO FECHA a conversa mediada de caso de pet ABERTO: ver o cabecalho dessa funcao.';

COMMENT ON COLUMN user_blocks.blocker_user_id IS
  'Quem bloqueou. ESTA COLUNA NAO LEVA A MARCA do portao de saida, de proposito, pela mesma decisao de professional_review_reports.reporter_user_id (20261017000017): src/ PRECISA dela na clausula WHERE, porque o bloqueio e aplicado na LEITURA e em dois sentidos, e um predicado cujo nome src/ nao pode escrever obrigaria toda leitura do produto a passar por funcao SQL. O que NAO acontece: nenhuma resposta a projeta, nem como contagem nem como existencia -- nao existe campo de bloqueio em saida nenhuma, e e por isso que o bloqueado continua sem saber.';

COMMENT ON COLUMN user_blocks.blocked_user_id IS
  'Quem foi bloqueado. ON DELETE CASCADE: a linha morre com o expurgo da conta do bloqueado. A alternativa do desenho -- sobreviver 24 meses guardando o e-mail para que conta nova com o mesmo e-mail nao reabra o canal -- NAO foi implementada, porque guardar e-mail de conta expurgada e manter dado pessoal depois do expurgo, e hash de e-mail e reversivel por dicionario. Divergencia relatada, nao resolvida.';

-- ---------------------------------------------------------------------------
-- 3. `bloqueio_entre(uuid, uuid)` -- o PONTO UNICO da pergunta
-- ---------------------------------------------------------------------------
-- SIMETRICA: verdadeira se QUALQUER DOS DOIS bloqueou o outro. O desenho diz
-- "o bloqueado nao aparece nas leituras do bloqueador E VICE-VERSA", e a
-- simetria e o que entrega a segunda metade. Sem ela, bloquear alguem
-- continuaria deixando essa pessoa ver quem a bloqueou -- que e exatamente a
-- situacao de quem bloqueia por estar sendo perseguido.
--
-- FUNCAO, e nao expressao repetida em Kysely, pela razao que a
-- `20261017000016` ja escreveu para a irma da fila: a pergunta vai aparecer em
-- toda leitura que mostre uma pessoa a outra -- perfil, conexao, timeline,
-- vitrine --, e N copias do predicado sao N lugares onde uma correcao pode
-- faltar. `LANGUAGE sql STABLE` para ser inlinada pelo planejador, que e o que
-- permite usar os dois indices acima.
--
-- NULO em qualquer argumento devolve FALSO (`EXISTS` sobre `= NULL` nao acha
-- linha): leitura sem chamador identificado nao e leitura bloqueada.
CREATE FUNCTION bloqueio_entre(p_um uuid, p_outro uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM user_blocks b
     WHERE (b.blocker_user_id = p_um    AND b.blocked_user_id = p_outro)
        OR (b.blocker_user_id = p_outro AND b.blocked_user_id = p_um))
$$;

COMMENT ON FUNCTION bloqueio_entre(uuid, uuid) IS
  'Existe bloqueio entre estas duas contas, em QUALQUER sentido? SIMETRICA de proposito: o desenho manda que o bloqueado nao apareca nas leituras do bloqueador E VICE-VERSA, e sem a simetria quem foi bloqueado continuaria vendo quem o bloqueou -- que e a situacao de quem bloqueia por estar sendo perseguido. PONTO UNICO da definicao: a pergunta vai aparecer em toda leitura que mostre uma pessoa a outra, e N copias do predicado em Kysely seriam N lugares onde uma correcao pode faltar. LANGUAGE sql STABLE para ser inlinada e usar user_blocks_um_por_par e user_blocks_do_bloqueado. Nulo em qualquer argumento devolve FALSO: leitura sem chamador identificado nao e leitura bloqueada. ELA NAO E CHAMADA NA CONVERSA MEDIADA DE CASO ABERTO, e essa ausencia e a decisao de produto mais consequente da fatia: cortar o canal mediado de um caso de pet aberto pode custar o animal. Ver o cabecalho da 20261018000032 e o relatorio da fatia E.';

-- Down Migration

DROP FUNCTION IF EXISTS bloqueio_entre(uuid, uuid);
DROP TABLE IF EXISTS user_blocks;
DROP INDEX IF EXISTS users_public_ref_unico;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_public_ref_forma;
ALTER TABLE users DROP COLUMN IF EXISTS public_ref;
