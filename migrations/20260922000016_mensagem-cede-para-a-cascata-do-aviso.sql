-- A quinta ocorrencia da classe de 22/09, e a primeira que nao cabe na forma
-- das quatro anteriores: ela nao esta dentro de uma tabela, esta ENTRE TRES.
--
-- Medido na pilha efemera, nao deduzido. Massa: a achadora registra um aviso
-- avulso, a conversa mediada nasce desse aviso, e a achadora escreve UMA
-- mensagem nela. Entao `DELETE FROM users` da achadora:
--
--   ERROR:  insert or update on table "conversation_messages" violates
--           foreign key constraint "conversation_messages_conversation_id_fkey"
--   DETAIL: Key (conversation_id)=(...) is not present in table "conversations".
--
-- 23503, e nao 23514. Tres cenarios isolados, todos em ROLLBACK:
--
--   conversa SEM mensagem                       => a exclusao CONCLUI
--   conversa com mensagem DO SISTEMA            => CONCLUI
--     (`sender_user_id` ja e nulo: nao ha UPDATE a fazer)
--   conversa com mensagem DA PROPRIA ACHADORA   => 23503
--
-- ===========================================================================
-- O MECANISMO, QUE E O QUE TORNA ISTO INVISIVEL
-- ===========================================================================
-- Tres acoes de delecao disparam na MESMA instrucao, em tres tabelas:
--
--   users            --CASCADE--> found_reports.reporter_user_id
--   found_reports    --CASCADE--> conversations.found_report_id
--   users            --SET NULL-> conversation_messages.sender_user_id
--
-- As duas primeiras apagam. A terceira nao apaga: ela ATUALIZA a linha da
-- mensagem para por o nulo. E todo UPDATE revalida as chaves estrangeiras da
-- linha atualizada -- inclusive `conversation_id`, que nao tem nada a ver com
-- a coluna que esta mudando. Quando o gatilho do SET NULL roda depois da
-- cascata que ja levou a conversa, ele revalida contra um pai que nao existe
-- mais, e o banco recusa.
--
-- Nenhuma das tres declaracoes esta errada quando lida sozinha. O defeito so
-- existe na interseccao, e nenhuma das tres migracoes que as criaram poderia
-- te-lo visto: cada uma chegou por uma branch diferente, e as tres tabelas so
-- se encontraram na integracao.
--
-- ===========================================================================
-- POR QUE E A MENSAGEM QUE CEDE, E NAO O AVISO
-- ===========================================================================
-- Ha duas saidas, e a escolha nao e de gosto.
--
-- A intencao escrita em `conversa-mediada` e "a mensagem fica, a identidade
-- sai": quem escreveu deixa de ser nomeado, e o historico da conversa continua
-- legivel para o outro lado. Essa intencao foi desenhada para o caso em que a
-- CONVERSA SOBREVIVE e so o autor de uma mensagem some -- por exemplo, o tutor
-- apaga a conta e o achador continua vendo o que foi combinado.
--
-- Neste caminho a conversa NAO sobrevive: ela vai embora de qualquer jeito,
-- arrastada pela cascata do aviso. "A mensagem fica" nao quer dizer nada
-- quando nao ha onde ela ficar. O SET NULL aqui nao esta defendendo o
-- historico de ninguem; ele esta tentando anular uma coluna de uma linha que,
-- um gatilho adiante, deixa de existir. As duas intencoes nao colidem de fato:
-- uma delas esta fora do proprio escopo.
--
-- CASCADE escreve isso. A mensagem some junto com a conversa que a continha, e
-- o SET NULL continua valendo em todo caminho em que a conversa sobrevive --
-- que e onde ele foi pensado. Medido depois da mudanca: apagar a conta do
-- TUTOR continua levando a conversa inteira (era assim antes), e apagar uma
-- conta cuja conversa sobrevive continua deixando a mensagem de pe com
-- `sender_user_id` nulo.
--
-- ===========================================================================
-- E POR QUE NAO MEXER EM `found_reports.reporter_user_id`
-- ===========================================================================
-- A outra saida seria tirar a CASCADE do aviso, para o aviso sobreviver sem
-- dono. Ela resolveria o mesmo 23503, e e uma saida legitima -- mas ela nao e
-- de banco: ela muda o que o produto promete a quem registra um aviso, e essa
-- pergunta esta aberta com o cliente agora (o que acontece com a pista quando
-- alguem exerce o direito de apagar a conta).
--
-- Esta migracao foi escolhida por ser a REVERSIVEL das duas. Se o cliente
-- decidir anonimizar o aviso, o aviso passa a sobreviver sem dono, a conversa
-- sobrevive junto, e o CASCADE desta migracao simplesmente deixa de ser
-- exercido nesse caminho -- sem ficar errado, e sem precisar de outra descida.
-- Nada aqui fecha aquela porta.
--
-- O que se perde ao escolher assim: enquanto a decisao do cliente nao vier,
-- apagar a conta de quem achou o animal apaga tambem as mensagens que o TUTOR
-- escreveu naquela conversa. Isso ja era verdade antes desta migracao -- a
-- cascata de `conversations` para `conversation_messages` ja levava tudo --, e
-- esta migracao nao piora: ela so faz o caminho CONCLUIR em vez de falhar.

-- Up Migration

ALTER TABLE conversation_messages
  DROP CONSTRAINT conversation_messages_sender_user_id_fkey;

ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_sender_user_id_fkey
  FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE;

COMMENT ON COLUMN conversation_messages.sender_user_id IS
  'Quem escreveu, nulo para mensagem do sistema. CASCADE e nao SET NULL: quando a conta apagada e a de quem registrou o aviso, a conversa inteira ja vai embora pela cascata found_reports -> conversations, e o UPDATE do SET NULL revalidava conversation_id contra um pai que a cascata acabou de apagar (23503). O SET NULL continua correto no caso para o qual foi pensado, em que a conversa sobrevive; ali ele nunca chega a ser exercido por esta chave.';

-- Down Migration

-- Volta ao estado anterior, com o 23503 junto: e o que `down` significa.
-- Depois desta descida, apagar a conta de quem registrou um aviso avulso e
-- escreveu na conversa dele volta a reprovar com 23503 em
-- `conversation_messages_conversation_id_fkey`.
ALTER TABLE conversation_messages
  DROP CONSTRAINT conversation_messages_sender_user_id_fkey;

ALTER TABLE conversation_messages
  ADD CONSTRAINT conversation_messages_sender_user_id_fkey
  FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE SET NULL;

COMMENT ON COLUMN conversation_messages.sender_user_id IS NULL;
