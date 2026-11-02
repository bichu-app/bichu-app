-- A ADESAO `aparecer na lista da minha regiao` (decisao do cliente, 02/11/2026).
--
-- O pedido dele foi *"trazer a listagem de usuarios que estao na mesma regiao
-- dele e que as pessoas podem adicionar"*, e as DUAS perguntas fechadas que
-- foram postas antes de escrever qualquer coisa foram decididas por ele:
--
--  1. **so quem optar aparece.** Nasce uma adesao, DESLIGADA por padrao, que a
--     pessoa liga no proprio perfil. Ele recusou listar todo mundo **sabendo
--     que a lista comeca menor**;
--  2. **o piso de 3 caracteres da busca FICA.** `searchPeople` nao muda em
--     nada -- e e por isso que esta migracao nao toca indice nenhum da busca.
--
-- ## POR QUE A COLUNA E NOVA, E NAO UM CAMPO REAPROVEITADO
--
-- Nao existe nenhum "encontravel" neste banco para reusar: as unicas colunas
-- com esse sentido no repositorio sao as do passkey (`discoverable`), que falam
-- de credencial e nao de pessoa. Reaproveitar `email_deliverable`,
-- `status` ou qualquer um dos `*_verified_at` daria DOIS significados a uma
-- coluna -- e o dia em que um deles mudasse moveria o outro em silencio.
--
-- ## POR QUE E UM INSTANTE, E NAO UM `boolean`
--
-- A casa ja escreve adesao como instante (`email_verified_at`,
-- `accepted_terms_at`, `phone_verified_at`): `NULL` e "nunca ligou", e o
-- instante diz QUANDO. Um `boolean NOT NULL DEFAULT false` responderia "esta
-- ligado?" e perderia a unica pergunta que uma adesao revogavel faz depois:
-- *desde quando*. O contrato nao devolve o instante -- `Me.region_listing_opt_in`
-- e um booleano --, e a assimetria e deliberada: a TELA so precisa do estado do
-- interruptor, e a data de uma decisao de privacidade nao e material de tela.
--
-- **DESLIGADA POR PADRAO, e isso e a decisao e nao o default do tipo:**
-- `NULL` e o valor de toda linha que ja existe e de toda linha nova. Nenhuma
-- conta entra na lista por esta migracao -- a lista nasce VAZIA, e e esse o
-- custo que o cliente aceitou.
--
-- ## A REGIAO E `reference_city` + `reference_state`, E A ESCOLHA TEM MOTIVO
--
-- As quatro colunas de referencia (`reference_postal_code`,
-- `reference_neighborhood`, `reference_city`, `reference_state`) ja existem e
-- sao **o mesmo dado que define o raio do alerta de pet perdido**, entao
-- granularidade aqui e escolha e nao limitacao.
--
-- **O par e CIDADE + ESTADO, e nao cidade sozinha**: ha muitas `Santa Maria` e
-- muitas `Bom Jesus` no Brasil, e casar por cidade sem estado juntaria pessoas
-- a mil quilometros uma da outra numa lista que promete vizinhanca.
--
-- **O BAIRRO NAO ENTRA, nem para casar, nem para ordenar, nem para exibir**, e
-- a razao principal e de CORRECAO e nao de prudencia: `reference_neighborhood`
-- e texto livre de 80 caracteres, preenchido pela consulta de CEP **ou digitado
-- a mao**, e nao tem forma canonica -- `Vila Mariana`, `vila mariana` e
-- `V. Mariana` sao tres grupos distintos para qualquer agrupamento, e a lista
-- ficaria errada antes de ficar apertada. A razao secundaria e de desenho: um
-- bairro e um recorte muito mais estreito do que uma cidade, e esta e a
-- primeira superficie do produto que coloca uma conta COM NOME num balde
-- geografico para estranhos folhearem.
--
-- **Ordenar por bairro tambem esta fora**, e essa consequencia merece a linha:
-- ordenacao por bairro entregaria o bairro **pela posicao** mesmo sem nenhum
-- campo de bairro na resposta. A ordem e nome e depois apelido, a MESMA de
-- `searchPeople`.
--
-- A cidade e o estado sao comparados por `texto_para_busca` -- a MESMA funcao
-- do diretorio e da busca de pessoas, e nao uma segunda normalizacao, que
-- divergiria em silencio ficando so lenta. Ela e `STRICT`, e isso vale dito:
-- cidade nula devolve nulo, e `NULL = NULL` nao e verdadeiro -- entao **quem
-- nao tem regiao de referencia nao casa com ninguem e nao e casado por
-- ninguem**, sem nenhum `if`.
--
-- ## O INDICE, E O QUE ELE COBRE
--
-- `users_lista_da_regiao` e PARCIAL (`WHERE region_listing_opted_in_at IS NOT
-- NULL`) e sobre a expressao normalizada. Parcial porque a esmagadora maioria
-- das linhas e `NULL` por decisao -- um indice total guardaria a tabela inteira
-- para responder sobre um subconjunto pequeno. Ele nao e um indice de BUSCA:
-- nao ha trigrama, nao ha `LIKE` e nao ha termo. E igualdade sobre duas
-- expressoes imutaveis, que e o que a listagem pergunta.
--
-- Ele **nao substitui e nao toca** `users_busca_por_nome` nem nada de
-- `searchPeople`: a decisao 2 do cliente e que a busca nao muda em nada.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao cria tabela de "regiao".** Nao ha entidade de regiao neste produto, e
--   criar uma aqui seria inventar um cadastro que ninguem decidiu, com
--   migracao de dado para preenche-lo.
-- - **Nao toca as quatro colunas de referencia.** Elas ficam como estao, com o
--   mesmo papel no raio do alerta.
-- - **Nao escreve em linha nenhuma.** `ADD COLUMN` de coluna anulavel sem
--   `DEFAULT` nao reescreve a tabela no PostgreSQL, e o valor de todo mundo
--   continua "nunca ligou".
-- - **Nao marca a coluna como `nunca sai do servidor`.** Ela SAI, para o
--   DONO e so para ele, projetada em booleano (`Me.region_listing_opt_in`) --
--   marca-la faria `portao-colunas-que-nao-saem` reprovar a projecao legitima.
--   Para TERCEIRO ela nao sai de forma nenhuma: a listagem devolve nome,
--   apelido e duas contagens, e quem esta nela ja esta por ter ligado.
-- - **Nao cria teto nenhum.** O teto da listagem e `x-rate-limit` no contrato,
--   aplicado no servico, como o da busca.
--
-- ## SOBRE O `down`
--
-- A descida **apaga a adesao de quem a ligou**, e isso nao tem recolhimento
-- possivel: nao existe outro lugar no banco que registre a escolha. Por isso ela
-- RECUSA quando ha adesao de pe, nomeando quantas contas -- subir de novo depois
-- de uma descida silenciosa deixaria todas essas pessoas FORA da lista sem que
-- nenhuma delas soubesse, e re-aderir e uma decisao de cada uma.
--
-- `RAISE EXCEPTION`, e nunca `RAISE NOTICE`: `node-pg-migrate` **DESCARTA**
-- `NOTICE` e `WARNING`, entao um aviso aqui nao chegaria a ninguem e a descida
-- concluiria apagando a coluna.

-- Up Migration

ALTER TABLE users
  ADD COLUMN region_listing_opted_in_at timestamptz;

COMMENT ON COLUMN users.region_listing_opted_in_at IS
  'QUANDO esta conta ligou a adesao `aparecer na lista da minha regiao` (decisao do cliente, 02/11/2026: ele escolheu que SO QUEM OPTAR aparece, com a adesao DESLIGADA por padrao, sabendo que a lista comeca menor). NULL e o valor de toda linha que ja existia e de toda linha nova: nunca ligou. E a unica porta de entrada da listagem -- `listPeopleInMyRegion` exige `region_listing_opted_in_at IS NOT NULL` na clausula WHERE (ADR-0021), e nao num filtro de borda. REVOGAVEL, e desligar vale na hora: voltar a coluna para NULL tira a conta da proxima resposta, porque a leitura nao tem cache e a resposta sai com Cache-Control: private, no-store. E INSTANTE e nao boolean pela mesma razao de email_verified_at e accepted_terms_at: NULL diz "nunca", e o instante diz desde quando -- a pergunta que uma adesao revogavel faz depois. O CONTRATO NAO DEVOLVE O INSTANTE: para o DONO sai o booleano Me.region_listing_opt_in, e para TERCEIRO nao sai nada -- a listagem entrega nome, apelido e duas contagens, e quem esta nela ja esta por ter ligado. NAO LEVA A MARCA DE SAIDA PROIBIDA de proposito, e a frase e dita sem a marca dentro: `portao-colunas-que-nao-saem` casa a expressao por SUBSTRING no corpo deste comentario, entao escrever aqui que a coluna nao e marcada MARCARIA a coluna -- medido em 02/11/2026, com o portao reprovando quatro arquivos legitimos. O motivo de nao a marcar: a projecao em booleano para o DONO e legitima, e a marca a reprovaria. Nao confundir com o `discoverable` do passkey, que fala de credencial.';

-- O indice da listagem. PARCIAL, porque a esmagadora maioria das linhas e NULL
-- por decisao, e sobre a MESMA normalizacao do diretorio e da busca de pessoas.
CREATE INDEX users_lista_da_regiao
  ON users (texto_para_busca(reference_city), texto_para_busca(reference_state))
  WHERE region_listing_opted_in_at IS NOT NULL;

COMMENT ON INDEX users_lista_da_regiao IS
  'A listagem de usuarios da mesma regiao (cliente, 02/11/2026). PARCIAL: so as contas que ADERIRAM entram, e elas sao a minoria por decisao -- um indice total guardaria a tabela inteira para responder sobre um subconjunto pequeno. A chave e CIDADE + ESTADO, e nao cidade sozinha: ha muitas Santa Maria no Brasil, e casar sem estado juntaria pessoas a mil quilometros numa lista que promete vizinhanca. O BAIRRO NAO ESTA AQUI, e a razao e de correcao antes de ser de prudencia: reference_neighborhood e texto livre sem forma canonica (Vila Mariana, vila mariana, V. Mariana sao tres grupos), e agrupar por ele daria uma lista ERRADA, nao so mais apertada. Normalizado por texto_para_busca, a MESMA funcao do diretorio e da busca -- duas normalizacoes divergiriam em silencio ficando so lentas. Ela e STRICT: cidade nula devolve nulo, NULL = NULL nao e verdadeiro, e por isso quem nao tem regiao de referencia nao casa com ninguem nem e casado por ninguem, sem nenhum if. ESTE INDICE NAO E DE BUSCA: nao ha trigrama, LIKE nem termo -- a listagem nao aceita texto, e o piso de 3 caracteres e o teto da busca continuam sendo dela (decisao 2 do cliente: a busca nao muda em nada).';

-- Down Migration

-- A descida apaga a escolha de quem a ligou, e nao ha onde recolhe-la: nenhuma
-- outra coluna deste banco registra a adesao. Por isso ela RECUSA quando ha
-- adesao de pe. `RAISE EXCEPTION` e nao `NOTICE`, porque `node-pg-migrate`
-- descarta `NOTICE`.
DO $$
DECLARE
  aderidas bigint;
BEGIN
  SELECT count(*) INTO aderidas
    FROM users
   WHERE region_listing_opted_in_at IS NOT NULL;

  IF aderidas > 0 THEN
    RAISE EXCEPTION
      'a descida apagaria a adesao `aparecer na lista da minha regiao` de % conta(s), e nao ha onde recolhe-la: nenhuma outra coluna registra a escolha. Subir de novo depois disto deixaria todas essas pessoas FORA da lista sem que nenhuma soubesse, e re-aderir e decisao de cada uma. Decida o que fazer com as adesoes ANTES de descer',
      aderidas;
  END IF;
END $$;

DROP INDEX users_lista_da_regiao;

ALTER TABLE users DROP COLUMN region_listing_opted_in_at;
