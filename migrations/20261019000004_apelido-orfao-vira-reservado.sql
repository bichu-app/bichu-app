-- O APELIDO QUE PERDE O DONO PASSA A SER `reservado`, E `DELETE FROM users`
-- VOLTA A CONCLUIR.
--
-- ===========================================================================
-- O DEFEITO, MEDIDO E NAO LIDO
-- ===========================================================================
-- A `20261018000021` criou `handles` com DUAS declaracoes que nao podem valer
-- juntas, e as duas estao a seis linhas de distancia uma da outra:
--
--   user_id uuid REFERENCES users (id) ON DELETE SET NULL
--   CONSTRAINT handles_pessoa_tem_dono
--     CHECK (kind <> 'pessoa' OR user_id IS NOT NULL)
--
-- A primeira manda POR O NULO quando a conta sai; a segunda PROIBE o nulo
-- quando `kind = 'pessoa'`. Medido nesta maquina em 19/10/2026, em
-- BEGIN/ROLLBACK, sobre o esquema de `origin/fix/integracao-nao-compila`:
--
--   insert into users  (id, email, public_ref) values (...);
--   insert into handles (handle, handle_esqueleto, kind, user_id)
--        values ('medirpessoa', 'medirpessoa', 'pessoa', <a conta>);
--   update users set handle = 'medirpessoa' where id = <a conta>;
--   DELETE FROM users WHERE id = <a conta>;
--
--   ERROR:  new row for relation "handles" violates check constraint
--           "handles_pessoa_tem_dono"
--   DETAIL: Failing row contains (medirpessoa, medlrpessoa, pessoa, null, ...).
--   CONTEXT: SQL statement "UPDATE ONLY "public"."handles"
--            SET "user_id" = NULL WHERE $1 OPERATOR(pg_catalog.=) "user_id""
--
-- Nao e caso de teste: e **toda conta que tenha escolhido um `@`**. Enquanto o
-- apagamento era automatico (SEC-020) isto teria travado o expurgo; hoje o
-- `DELETE FROM users` saiu de `src/` por decisao do cliente e o apagamento sob
-- pedido do titular e PROCEDIMENTO ADMINISTRATIVO -- quer dizer, alguem com
-- `psql` na mao, que recebe 23514 e nao tem como concluir o pedido. O caminho
-- que sobrou em codigo e `src/bin/seed.ts`, que apaga os titulares da massa de
-- QA; ele sobrevive hoje so porque a massa nao reivindica apelido.
--
-- A CONTRADICAO E DE DESENHO, E NAO DE DIGITACAO: o cabecalho da
-- `20261018000021` escolhe `SET NULL` com argumento ("apelido de conta que sai
-- NAO volta ao pool na hora (plano 4-C.7), e CASCADE o soltaria no mesmo
-- instante -- um estranho pegaria `@maria` e herdaria o que a vizinhanca
-- associava a ela") e, seis linhas abaixo, escolhe o CHECK com argumento
-- ("`kind = 'pessoa'` com `user_id` nulo seria um apelido ocupando o espaco de
-- nomes sem conta nenhuma atras -- indistinguivel de uma reservada, mas sem
-- estar na lista"). As duas razoes sao boas. O que falta e o passo que as
-- reconcilia.
--
-- ===========================================================================
-- O CONSERTO, E POR QUE ELE NAO E NENHUMA DAS DUAS SAIDAS OBVIAS
-- ===========================================================================
-- **Nao e trocar para CASCADE.** Isso devolveria `@maria` ao pool no instante
-- da exclusao, que e exatamente o que a `20261018000021` recusou pelo nome, e
-- a razao dela e imitacao servida pelo produto -- nao gosto.
--
-- **Nao e afrouxar o CHECK.** Deixar `kind = 'pessoa'` com dono nulo cria a
-- linha que o proprio CHECK descreve como indistinguivel de uma reservada sem
-- estar na lista. Seria apagar o alarme.
--
-- **E DAR O TERCEIRO PASSO QUE OS DOIS TEXTOS PEDEM**: o apelido orfao vira
-- `reservado`. As duas intencoes sobrevivem inteiras -- o apelido NAO volta ao
-- pool (continua ocupando o espaco de nomes, agora como reservada de verdade,
-- na lista onde as reservadas moram) e nao existe linha `pessoa` sem dono. E a
-- liberacao continua sendo "decisao de quem administrar o pool", como estava
-- escrito: ela passa a ser `DELETE` ou `UPDATE` explicito sobre uma linha
-- `reservado`.
--
-- GATILHO `BEFORE UPDATE OF user_id`, e nao `AFTER`: a acao referencial do
-- Postgres e um `UPDATE ... SET user_id = NULL`, e `CHECK` e avaliado DEPOIS
-- dos gatilhos de linha `BEFORE`. Em `AFTER` o CHECK ja teria reprovado.
--
-- `claimed_at` fica como esta: ele registra quando aquele apelido passou a
-- valer, e isso continua verdade depois de a conta sair. A regra de troca de
-- apelido (1 vez a cada 60 dias) le `claimed_at` de linha `pessoa`, e esta
-- linha deixou de ser uma.
--
-- Isto NAO cria caminho de escrita novo em `src/`: nenhum caso de uso chama
-- nada aqui. O gatilho existe para o caminho defensivo que a propria
-- `20261018000021` chama de defensivo -- so que agora ele funciona.

-- Up Migration

CREATE FUNCTION handles_orfao_vira_reservado() RETURNS trigger AS $$
BEGIN
  NEW.kind := 'reservado';
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION handles_orfao_vira_reservado() IS
  'Transforma em `reservado` o apelido de pessoa que acabou de perder o dono. Existe porque `handles.user_id` e `ON DELETE SET NULL` (apelido de conta que sai nao volta ao pool -- plano 4-C.7) e `handles_pessoa_tem_dono` proibe `pessoa` sem dono: as duas declaracoes da 20261018000021 nao podiam valer juntas, e `DELETE FROM users` de quem tinha @ reprovava com 23514 (medido em 19/10/2026). Este e o passo que reconcilia as duas: o apelido continua ocupando o espaco de nomes, agora como reservada, e a liberacao volta a ser decisao de quem administrar o pool.';

-- `OF user_id` estreita o gatilho a UNICA escrita que pode orfanar a linha:
-- renomear o apelido ou mexer no esqueleto nao o dispara. O `WHEN` fecha o
-- resto -- a linha ja `reservado` ou `pet` nao e tocada, e `user_id` que muda
-- de uma conta para outra (nao para nulo) tambem nao.
CREATE TRIGGER handles_orfao_reservado
  BEFORE UPDATE OF user_id ON handles
  FOR EACH ROW
  WHEN (OLD.kind = 'pessoa' AND NEW.user_id IS NULL)
  EXECUTE FUNCTION handles_orfao_vira_reservado();

-- Down Migration

DROP TRIGGER handles_orfao_reservado ON handles;
DROP FUNCTION handles_orfao_vira_reservado();
