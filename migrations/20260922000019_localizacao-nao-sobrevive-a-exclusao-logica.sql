-- BICHUS-88 -- a localizacao de referencia morre na exclusao LOGICA, e nao 30
-- dias depois.
--
-- ====================================================================
-- O DEFEITO
-- ====================================================================
--
-- A BICHUS-88 decide (criterio 12) que a exclusao da conta e logica e imediata,
-- e que o expurgo definitivo acontece em 30 dias. Entre os dois instantes a
-- linha de `user_reference_locations` continua existindo e continua casando com
-- `ST_DWithin`: `expires_at` fala da validade da CAPTURA, nao do estado da
-- conta. Quem sai da base de alerta hoje sai por uma clausula da consulta de
-- quem le -- `kysely-alcance-por-postgis.ts` junta `users` e exige
-- `u.deleted_at IS NULL` -- e nao por uma propriedade da linha.
--
-- Essa protecao e fragil pela forma, nao pela qualidade: ela vale enquanto toda
-- consulta futura sobre esta tabela lembrar de repetir a junção. A tabela existe
-- para ser consultada por raio; o segundo consumidor dela e uma questao de
-- tempo, e o defeito volta calado no dia em que ele nao repetir a clausula.
--
-- ====================================================================
-- A LINHA PRECISA EXISTIR ESSES 30 DIAS? NAO. E ISSO ESTA ESCRITO.
-- ====================================================================
--
-- ADR-0010, tabela "Retencao, por dado", linha "Localizacao de referencia do
-- usuario":
--
--     Retencao: "so a ultima, quantizada a ~100 m, validade de 30 dias"
--     Observacao: "sem historico; APAGADA AO SAIR DA CONTA E AO EXCLUIR A CONTA"
--
-- Os 30 dias daquela linha sao a validade da captura, e a propria migracao
-- 20260922000002 ja diz isso ao declarar `expires_at`: "30 dias depois da
-- captura". Os OUTROS 30 dias -- os do expurgo -- sao da linha "Conta excluida:
-- exclusao logica imediata, expurgo em 30 dias", que fala da CONTA. A
-- localizacao tem regra propria na mesma tabela, e a regra propria nao concede
-- prazo nenhum: ela diz "ao excluir a conta", sem janela.
--
-- Entao nao ha arrependimento, obrigacao legal nem investigacao sustentando
-- esta linha por 30 dias. O que ha e uma inferencia que nunca foi conferida: a
-- migracao 20260922000002 escreveu `ON DELETE CASCADE` e justificou com essa
-- mesma frase do ADR-0010 ("a localizacao e da conta e nao sobrevive a ela"). A
-- CASCADE cumpre a promessa para a exclusao FISICA. A exclusao logica nao emite
-- `DELETE FROM users`: ela escreve `deleted_at`, e a CASCADE nao dispara. A
-- promessa ficou meio cumprida sem que nada acusasse, e e essa metade que esta
-- migracao fecha.
--
-- Vale dizer o que NAO se perde ao apagar. Onde a pessoa mora e, pelo texto da
-- 20260922000002, "o dado mais sensivel da conta". A base legal dele no ADR-0010
-- e legitimo interesse, e a finalidade declarada e uma so: alertar tutores
-- proximos de um caso de perdido. Conta excluida nao recebe alerta -- e a
-- BICHUS-88 encerra os casos abertos dela na hora, criterio 12 -- entao a
-- finalidade acabou, e com ela a base. Guardar por mais 30 dias e retencao sem
-- finalidade, que e exatamente o que o ADR-0010 recusa em "Guardar historico de
-- localizacao: acumulo sem finalidade declarada -- minimizacao (art. 6, III)".
-- A trilha de auditoria, que e o que prova o pedido de exclusao, nao referencia
-- `users` de proposito e nao e tocada aqui.
--
-- ====================================================================
-- POR QUE UM GATILHO, E NAO MAIS UMA CLAUSULA NA CONSULTA
-- ====================================================================
--
-- Acrescentar `deleted_at IS NULL` a uma consulta nova e repetir a forma que ja
-- falhou: a protecao continua morando na memoria de quem escreve a proxima
-- consulta. O que se quer e que NAO HAJA LINHA para uma consulta distraida
-- encontrar.
--
-- O lugar de apagar tambem nao e o codigo do caminho de exclusao, e a razao e
-- verificavel: HOJE NAO EXISTE CAMINHO DE EXCLUSAO. `users.deleted_at` nao e
-- escrito em nenhum ponto de `src/` -- so lido, em onze lugares. Ou seja, a
-- unica linha de codigo que poderia lembrar de apagar a localizacao ainda vai
-- ser escrita, por outra pessoa, depois desta migracao. Uma correcao que dependa
-- dela e uma correcao que depende de alguem lembrar de algo que ainda nao
-- comecou a esquecer.
--
-- O gatilho nao depende disso. Ele reage ao FATO (`deleted_at` deixou de ser
-- nulo), qualquer que seja o codigo que o produziu, e por isso cobre tambem o
-- `UPDATE` feito a mao em producao e a migracao de dados que ninguem reviu.
--
-- E o primeiro gatilho deste repositorio, e isso merece ser dito em voz alta em
-- vez de passar. Gatilho e comportamento que nao aparece na leitura do codigo da
-- aplicacao, e esse e um custo real. Ele se paga aqui porque a alternativa e
-- pior pela mesma medida que o repositorio ja aplicou duas vezes nesta tabela:
-- "a regra ... vira CHAVE PRIMARIA, e nao disciplina de aplicacao"
-- (20260922000002), e "'Nao expor endereco' precisa ser propriedade do esquema e
-- do contrato, nao lembrete de quem escreve a interface" (ADR-0010, Contexto).
-- A garantia que se quer aqui e da mesma familia, e o `deleted_at` e um UPDATE:
-- gatilho e o unico mecanismo do banco que reage a um UPDATE.
--
-- AFTER e nao BEFORE: a exclusao da localizacao acontece na mesma transacao que
-- marcou a conta, entao o criterio 7 da BICHUS-88 ("ou tudo foi apagado, ou nada
-- foi") vale sem nada a mais -- se a transacao volta atras, a localizacao volta
-- com ela.
--
-- `UPDATE OF deleted_at` porque uma coluna so muda se for atribuida, entao a
-- lista de colunas nao perde nenhum caso e poupa o gatilho de ser considerado em
-- todo `UPDATE` de `users` (login, perfil). A clausula `WHEN` fecha os dois
-- restantes: `deleted_at` atribuido com o mesmo valor que ja tinha, e a
-- reversao (`NOT NULL` -> `NULL`), que nao deve ressuscitar coordenada nenhuma.
--
-- O QUE ESTA MIGRACAO NAO FAZ: ela nao remove `u.deleted_at IS NULL` da consulta
-- de alcance, e nao deve. Aquela clausula deixa de ser a unica defesa e passa a
-- ser a segunda; retira-la trocaria uma protecao em duas camadas por uma, sem
-- ganho.

-- Up Migration

CREATE FUNCTION apagar_localizacao_na_exclusao_logica() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM user_reference_locations WHERE user_id = NEW.id;
  RETURN NULL;  -- AFTER ... FOR EACH ROW ignora o retorno.
END;
$$;

COMMENT ON FUNCTION apagar_localizacao_na_exclusao_logica() IS
  'BICHUS-88: apaga a localizacao de referencia no instante da exclusao LOGICA da conta. Sem isto a linha sobrevive ate o expurgo de 30 dias e continua casando com ST_DWithin, e a unica defesa e a junção com users na consulta de quem le. ADR-0010, tabela de retencao: a localizacao e "apagada ao sair da conta e ao excluir a conta", sem janela.';

CREATE TRIGGER users_exclusao_logica_apaga_localizacao
  AFTER UPDATE OF deleted_at ON users
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION apagar_localizacao_na_exclusao_logica();

-- Down Migration

DROP TRIGGER IF EXISTS users_exclusao_logica_apaga_localizacao ON users;
DROP FUNCTION IF EXISTS apagar_localizacao_na_exclusao_logica();
