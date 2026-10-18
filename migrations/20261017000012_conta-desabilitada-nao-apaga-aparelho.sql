-- A conta e DESABILITADA, e desabilitar nao apaga nada.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO DESFAZ, E POR QUE
-- ====================================================================
--
-- Em 17/10 o cliente trocou o desenho da exclusao de conta, por escrito:
-- "Mantenha a foto e nao delete os dados do usuario, apenas desabilite na
-- plataforma e filtro as paginas para que esse usuario nao seja mais encontrado
-- em nenhuma pagina ou funcionalidade".
--
-- A `20260928000007_aparelho-nao-sobrevive-a-exclusao-logica.sql` (SEC-019,
-- segunda camada) apagava `user_devices` no instante em que `users.deleted_at`
-- deixava de ser nulo. Aquilo foi aprovado mais cedo NO MESMO DIA e esta sendo
-- revertido aqui de proposito: o gatilho APAGA DADO DO USUARIO, e dado do
-- usuario passou a ser retido.
--
-- ====================================================================
-- O DEFEITO QUE O GATILHO FECHAVA NAO VOLTA, E ISSO E MEDIVEL
-- ====================================================================
--
-- O risco que a 20260928000007 descreve e um so: "o aparelho continua sendo
-- destinatario valido de alerta de pet perdido -- com nome do animal e regiao --
-- numa conta que a pessoa ja mandou apagar". Quem decide se um aparelho recebe
-- alerta e a consulta de alcance, `kysely-alcance-por-postgis.ts`, e ela JA
-- junta `users` e exige `u.deleted_at IS NULL` (linhas 187 e 208, camada escrita
-- pela BICHUS-88 em 22/09). Conta desabilitada nao entra no conjunto de
-- notificados, com ou sem linha em `user_devices`.
--
-- Ou seja: a linha sobrevive, e o ENDERECO DE ENTREGA deixa de ser alcancavel
-- por propriedade da consulta, nao por ausencia de linha. E a mesma troca que o
-- cliente pediu para as paginas, aplicada ao push.
--
-- O QUE ESTA MIGRACAO NAO FAZ: ela nao toca o gatilho
-- `users_exclusao_logica_apaga_localizacao` da 20260922000019. Aquele apagamento
-- nao e da conta: o ADR-0010 manda apagar a localizacao de referencia TAMBEM AO
-- SAIR DA CONTA, num logout comum, entao ele e regra de ciclo de vida daquele
-- dado e nao consequencia da exclusao. Mantido, e relatado ao cliente como
-- pergunta em aberto em vez de decidido aqui.
--
-- Ela tambem nao toca `derrubarTodasAsSessoes`: "Sair de todos os aparelhos", a
-- troca de senha, a redefinicao e o "nao fui eu" continuam apagando o cadastro
-- de push, porque ali apagar E o remedio que a pessoa pediu. O que mudou e so o
-- caminho `account_deleted`, e a mudanca esta na aplicacao
-- (`auth-service.ts`, `derrubarTodasAsSessoes`).

-- ====================================================================
-- A SEGUNDA METADE: O PONTO UNICO DO "NAO SER ENCONTRADO"
-- ====================================================================
--
-- A outra metade da decisao e "filtro as paginas para que esse usuario nao seja
-- mais encontrado em nenhuma pagina ou funcionalidade". Medido hoje, o esquema
-- tem `deleted_at` em TRES tabelas so: `users`, `pets` e `pet_photos`. Nenhuma
-- outra tabela possuida por um usuario tem marca propria, e nao existe no
-- repositorio nenhum helper, view, RLS ou predicado compartilhado que aplique
-- `users.deleted_at` -- as quatro aplicacoes existentes sao copias a mao.
--
-- `pets` e o CONCENTRADOR da exposicao: o perfil publico, os casos de perdido,
-- as plaquinhas, os avisos de achado e as fotos todos chegam ao tutor por
-- `pets.owner_user_id`. E `pets` ja tem a coluna que as consultas ja filtram.
-- Entao a marca do dono PROPAGA para os pets dele, e as clausulas que ja existem
-- passam a fazer o trabalho sem que nenhuma consulta precise mudar.
--
-- Exemplo medido, e e o de maior exposicao: `GET /v1/public/pets/{slug}` e
-- publica (`security: []`) e ja termina em
-- `.where('pets.deleted_at', 'is', null)`
-- (`kysely-perfil-publico.ts:55`). Com a propagacao, ela deixa de devolver o pet
-- de conta desabilitada sem uma linha de TypeScript alterada.
--
-- POR QUE GATILHO, E NAO UMA CLAUSULA NOVA EM CADA CONSULTA: e o argumento que a
-- `20260922000019` ja escreveu e que o cliente repetiu com outras palavras --
-- "filtrar em cada tela e como se perde um caminho". Sao mais de setenta
-- consultas no inventario; a protecao que mora na memoria de quem escreve a
-- proxima consulta falha na primeira que esquecer.
--
-- ====================================================================
-- E REVERSIVEL, E A REVERSAO E EXATA
-- ====================================================================
--
-- Marcar nao e apagar: a linha de `pets` fica inteira, com nome, foto, chip e
-- historico. E a propagacao so toca pet que AINDA NAO tinha marca
-- (`deleted_at IS NULL`), gravando nele o INSTANTE EXATO da conta
-- (`NEW.deleted_at`).
--
-- Isso e o que torna a reativacao possivel sem perder informacao: o pet que a
-- propria pessoa havia excluido antes tem outro instante, e continua excluido.
-- A reversao e
--
--   UPDATE pets SET deleted_at = NULL
--    WHERE owner_user_id = :conta AND deleted_at = :deleted_at_da_conta;
--
-- Sem a igualdade de instante, reativar a conta ressuscitaria pet que a pessoa
-- tinha mandado embora -- e `pets.slug` e unico, entao isso nao e so estetico.
-- A reativacao em si NAO esta implementada, e isso esta no relatorio: hoje ela e
-- procedimento administrativo, como o apagamento.
--
-- O QUE A PROPAGACAO NAO COBRE, e esta escrito para nao ser confundido com
-- cobertura: ela nao alcanca a agenda da Rede (`network_events`), as conversas
-- (`conversations`), a fila do painel (`network_event_join_requests`), o
-- diretorio (`professionals`) nem as transferencias (`pet_transfers`) -- nenhuma
-- dessas tabelas tem `deleted_at` e nenhuma passa por `pets`. A Rede e a
-- conversa foram tratadas na aplicacao nesta mesma branch; as outras estao
-- listadas como o que falta.

-- ====================================================================
-- A REDE: O ENCONTRO DO AUTOR DESABILITADO SAI DA AGENDA
-- ====================================================================
--
-- Decisao do cliente, palavras dele: "Sim, sai da agenda".
--
-- `network_events` nao tem `deleted_at`, entao a propagacao de marca nao a
-- alcanca. E a autoria (`network_events.created_by_user_id`) esta marcada
-- "NUNCA sai do servidor" na 20260928000001 e o
-- `src/tools/portao-colunas-que-nao-saem.ts` REPROVA qualquer mencao ao nome
-- dessa coluna em `src/` -- o que e certo e nao vou dispensar.
--
-- Entao o predicado nasce aqui, como funcao, e `src/` o chama pelo nome da
-- funcao. Nao e desvio do portao: o portao proibe a coluna ATRAVESSAR A BORDA, e
-- uma funcao que devolve `boolean` nao carrega autoria para resposta nenhuma --
-- ela devolve sim ou nao. E o mesmo arranjo que a 20261001000005 ja escolheu com
-- `network_events_do_autor`.
--
-- `STABLE` e nao `VOLATILE`: dentro de uma instrucao o resultado nao muda, e e
-- isso que permite ao planejador chamar a funcao uma vez por linha em vez de
-- repetir por predicado.

-- Up Migration

CREATE FUNCTION encontro_com_autor_ativo(p_evento uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM network_events e
      JOIN users u ON u.id = e.created_by_user_id
     WHERE e.id = p_evento
       AND u.deleted_at IS NULL)
$$;

COMMENT ON FUNCTION encontro_com_autor_ativo(uuid) IS
  'O autor do encontro ainda tem conta habilitada? Decisao do cliente de 17/10: encontro criado por conta desabilitada SAI DA AGENDA. Chamada de `consultaBase` em kysely-network-repository.ts, que e por onde passam a agenda, o nearby, a leitura do encontro, o local, os detalhes privados e os pedidos -- entao o encontro sai de TODAS as superficies de uma vez, inclusive `when=all` com os passados. Devolve boolean de proposito: `network_events.created_by_user_id` nunca sai do servidor, e o portao `portao-colunas-que-nao-saem.ts` reprova o nome da coluna em src/.';

DROP TRIGGER IF EXISTS users_exclusao_logica_apaga_aparelhos ON users;
DROP FUNCTION IF EXISTS apagar_aparelhos_na_exclusao_logica();

CREATE FUNCTION marcar_pets_na_conta_desabilitada() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- `deleted_at IS NULL` no WHERE: so pet SEM marca recebe a marca. Pet que a
  -- propria pessoa excluiu antes guarda o instante dela, e e essa diferenca de
  -- instante que faz a reativacao da conta nao ressuscitar o que ela mandou
  -- embora.
  UPDATE pets
     SET deleted_at = NEW.deleted_at,
         updated_at = NEW.deleted_at
   WHERE owner_user_id = NEW.id
     AND deleted_at IS NULL;
  RETURN NULL;  -- AFTER ... FOR EACH ROW ignora o retorno.
END;
$$;

COMMENT ON FUNCTION marcar_pets_na_conta_desabilitada() IS
  'Decisao do cliente de 17/10: a conta e desabilitada e o usuario "nao e mais encontrado em nenhuma pagina ou funcionalidade". `pets` e a unica tabela possuida que tem `deleted_at`, e e por `pets.owner_user_id` que o perfil publico, os casos, as plaquinhas e as fotos chegam ao tutor -- entao a marca do dono propaga para os pets e as clausulas `pets.deleted_at IS NULL` que ja existem passam a esconder tudo isso sem consulta nova. NAO apaga: marca, e so pet sem marca propria, com o instante da conta, para a reversao ser exata.';

CREATE TRIGGER users_desabilitada_marca_pets
  AFTER UPDATE OF deleted_at ON users
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION marcar_pets_na_conta_desabilitada();

-- Down Migration

DROP FUNCTION IF EXISTS encontro_com_autor_ativo(uuid);
DROP TRIGGER IF EXISTS users_desabilitada_marca_pets ON users;
DROP FUNCTION IF EXISTS marcar_pets_na_conta_desabilitada();

CREATE FUNCTION apagar_aparelhos_na_exclusao_logica() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_devices WHERE user_id = NEW.id;
  RETURN NULL;  -- AFTER ... FOR EACH ROW ignora o retorno.
END;
$$;

CREATE TRIGGER users_exclusao_logica_apaga_aparelhos
  AFTER UPDATE OF deleted_at ON users
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION apagar_aparelhos_na_exclusao_logica();
