-- `pet_transfers_pet_id_fkey` passa a DEFERRABLE INITIALLY DEFERRED. A acao
-- continua sendo `ON DELETE CASCADE`, e nenhuma outra chave e tocada.
--
-- ===========================================================================
-- O QUE ESTA MIGRACAO CONSERTA
-- ===========================================================================
-- A quinta forma (cabecalho de `20260922000005_mensagem-cede-para-a-cascata-do-
-- aviso.sql`) tem uma terceira ocorrencia em `pet_transfers`, e ela CONCLUI --
-- mas conclui por ORDEM DE GATILHO. Dentro da mesma instrucao
-- `DELETE FROM users` de quem recebeu o pet e virou dono dele:
--
--   1. DELETE em pets            (cascata `users -> pets`)
--   2. UPDATE em pet_transfers   (o SET NULL de `to_user_id`)
--   3. DELETE em pet_transfers   (cascata `pets -> pet_transfers`)
--
-- O passo 2 e a situacao que produziu `23503` em `conversation_messages`: o
-- UPDATE do SET NULL revalida `pet_id` contra um pai que a mesma instrucao ja
-- apagou. Hoje nao estoura porque o passo 3 chega antes.
--
-- Ordem de gatilho sai da ORDEM DE CRIACAO das restricoes, entao ela muda com
-- qualquer migracao que recrie uma chave. E isso foi MEDIDO, nao deduzido: na
-- pilha efemera, com o esquema desta branch, recriar `pets_owner_user_id_fkey`
-- -- que e o que qualquer `ALTER` em `pets.owner_user_id` faz -- inverte a
-- ordem e a exclusao de conta passa a falhar:
--
--   ERROR:  insert or update on table "pet_transfers" violates foreign key
--           constraint "pet_transfers_pet_id_fkey"
--   DETAIL: Key (pet_id)=(...) is not present in table "pets".
--
-- E o caminho que e direito da pessoa (art. 18 da LGPD) e obrigacao nossa.
--
-- ===========================================================================
-- POR QUE `DEFERRABLE`, E POR QUE NAO `RESTRICT` NEM `NO ACTION`
-- ===========================================================================
-- Diferida, a conferencia de `pet_id` sai do meio da instrucao e vai para o
-- fim da transacao. No fim da transacao a linha ja foi apagada pela cascata --
-- em QUALQUER ordem de gatilho -- e conferencia de linha que nao existe nao
-- roda. A dependencia de ordem deixa de existir, e nenhuma semantica de
-- delecao muda: a cascata continua sendo cascata.
--
-- `RESTRICT` e `NO ACTION` foram medidos e REPROVAM, nas duas ordens. Os dois
-- deixam a linha de pe, e linha de pe apontando para um pet apagado e
-- exatamente o que a chave recusa:
--
--   ordem            CASCADE   CASCADE DEFER   RESTRICT   NO ACTION   NO ACTION DEFER
--   atual            conclui   conclui         23503      23503       23503 (no commit)
--   invertida        23503     conclui         23503      23503       23503 (no commit)
--
-- `RESTRICT` ainda quebra um segundo caminho que hoje funciona: apagar um pet
-- que tem transferencia viva (BICHUS-61) passa a ser recusado pelo banco.
--
-- ===========================================================================
-- O QUE NAO MUDA
-- ===========================================================================
-- Medido depois da mudanca, com a ordem de gatilho INVERTIDA de proposito:
--
--   apagar quem recebeu o pet e virou dono   conclui, sem linha sobrando
--   apagar o destinatario de um convite      conclui, e a linha sobrevive com
--     aceito cujo pet e de outra pessoa      `to_user_id` nulo -- que e o nulo
--                                            que `recipient_gone` le
--   apagar o tutor de origem                 conclui, sem linha sobrando
--   apagar SO o pet                          conclui, sem linha sobrando
--
-- `to_user_id` NAO e tocada. O desenho das tres direcoes do cabecalho de
-- `20260922000005_transferencia-de-pet.sql` continua valendo inteiro.
--
-- ===========================================================================
-- O CUSTO DE DIFERIR, QUE E REAL E E PEQUENO
-- ===========================================================================
-- `INITIALLY DEFERRED` faz a violacao aparecer no `COMMIT` em vez de na
-- instrucao que a causou, o que piora a mensagem de quem escreve linha invalida
-- a mao. Nao piora nada em `src/`: nenhum caminho insere `pet_transfers` com
-- `pet_id` inventado, e o unico produtor e `criarTransferencia`, que le o pet
-- antes. A troca e essa, e ela paga: erro de diagnostico um pouco pior contra
-- a exclusao de conta deixar de depender de ordem de gatilho.

-- Up Migration

ALTER TABLE pet_transfers
  DROP CONSTRAINT pet_transfers_pet_id_fkey;

ALTER TABLE pet_transfers
  ADD CONSTRAINT pet_transfers_pet_id_fkey
  FOREIGN KEY (pet_id) REFERENCES pets (id)
  ON DELETE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

COMMENT ON CONSTRAINT pet_transfers_pet_id_fkey ON pet_transfers IS
  'DEFERRABLE INITIALLY DEFERRED de proposito: a conferencia no fim da transacao e o que '
  'tira a exclusao de conta da dependencia de ordem de gatilho. Ver a migracao 20260922000008.';

-- Down Migration

-- A descida devolve a chave nao diferivel, e com ela devolve a dependencia de
-- ordem de gatilho. Ela existe porque toda migracao precisa dos dois sentidos,
-- nao porque descer seja seguro: num banco cuja ordem de gatilho ja tenha sido
-- invertida por outra migracao, descer aqui e reabrir o 23503 na exclusao de
-- conta.

ALTER TABLE pet_transfers
  DROP CONSTRAINT pet_transfers_pet_id_fkey;

ALTER TABLE pet_transfers
  ADD CONSTRAINT pet_transfers_pet_id_fkey
  FOREIGN KEY (pet_id) REFERENCES pets (id)
  ON DELETE CASCADE;
