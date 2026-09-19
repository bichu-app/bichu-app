-- BICHUS-13 criterios 7 e 9 — o webhook de entrega do provedor de e-mail.
--
-- Esta tabela e citada por `api/openapi.yaml` (`postmarkWebhook`) desde que o
-- contrato foi fechado, e NAO EXISTIA em migracao nenhuma: `grep -rn
-- notification_deliveries migrations/` devolvia zero linhas. O contrato
-- prometia um efeito que nao tinha onde acontecer.
--
-- O QUE ELA EXISTE PARA IMPEDIR, e que e o motivo de ela vir antes do handler:
-- o provedor REENVIA o mesmo evento quando a nossa resposta demora ou falha.
-- Sem uma chave natural unica, a segunda entrega do mesmo evento conta de novo
-- -- e no caso de devolucao definitiva isso significa marcar o endereco como
-- nao entregavel duas vezes, que hoje e idempotente por sorte e deixa de ser no
-- dia em que alguem acrescentar um contador ou um aviso ao lado.
--
-- POR QUE NAO HA COLUNA COM O ENDERECO DO DESTINATARIO. O corpo do evento traz
-- `Recipient` em claro. Grava-lo aqui criaria uma SEGUNDA copia do e-mail de
-- todo mundo, fora de `users`, sem dono e sem caminho de exclusao quando a
-- conta pedir remocao -- e o ADR-0010 item 6 nao abre excecao para tabela de
-- operacao. O endereco e usado em memoria, dentro da requisicao, para achar a
-- conta e marcar `users.email_deliverable`; depois disso ele e descartado. O
-- que liga esta linha ao envio original e `message_id`, que e identificador do
-- provedor e nao dado pessoal.

-- Up Migration

CREATE TABLE notification_deliveries (
  id            uuid        PRIMARY KEY,

  -- `MessageID` do provedor. Texto, e nao uuid: o formato e do provedor, e
  -- declara-lo `uuid` faria a troca de provedor virar migracao de tipo.
  message_id    text        NOT NULL,

  -- `RecordType` do corpo. O CHECK espelha o `enum` do contrato; valor fora da
  -- lista reprova na escrita em vez de virar uma linha que ninguem sabe ler.
  record_type   text        NOT NULL
                            CHECK (record_type IN ('Delivery', 'Bounce', 'SpamComplaint',
                                                   'Open', 'SubscriptionChange')),

  -- `Type` e `Description` do corpo: o subtipo da devolucao (`HardBounce`,
  -- `Transient`, ...) e o texto do provedor. Anulaveis porque o contrato so
  -- exige `RecordType` e `MessageID`.
  event_type    text,
  description   text,

  -- `DeliveredAt` do corpo, quando vem. Anulavel: nem todo tipo de evento traz.
  occurred_at   timestamptz,

  -- Quando NOS recebemos. Sempre presente, e e por ele que se investiga
  -- reentrega: `received_at` distante de `occurred_at` e o provedor repetindo.
  received_at   timestamptz NOT NULL DEFAULT now()
);

-- A IDEMPOTENCIA INTEIRA ESTA NESTA LINHA.
--
-- O contrato diz, com estas palavras: "Idempotente por `MessageID` mais tipo de
-- evento: o provedor reenvia". E chave natural, e nao `Idempotency-Key`: quem
-- chama e o provedor, que nao manda cabecalho nosso e nao sabe que ele existe.
-- A rota grava com `ON CONFLICT DO NOTHING` e responde 204 nos dois casos, que
-- e o que o contrato declara ("Evento processado ou ignorado por duplicidade").
--
-- O par e (mensagem, tipo) e nao a mensagem sozinha porque a MESMA mensagem
-- produz eventos diferentes ao longo da vida dela: entrega, abertura e, depois,
-- marcacao de spam. Unicidade so por `message_id` descartaria a reclamacao de
-- spam de quem ja tinha recebido -- que e exatamente o evento que o contrato
-- diz ser o mais importante dos tres ("e por este caminho que a lista de
-- supressao do provedor chega ate nos").
CREATE UNIQUE INDEX notification_deliveries_evento_unico
  ON notification_deliveries (message_id, record_type);

COMMENT ON TABLE notification_deliveries IS
  'Eventos de entrega do provedor de e-mail (BICHUS-13 criterios 7 e 9). Sem endereco de destinatario, de proposito: ADR-0010 item 6.';
COMMENT ON INDEX notification_deliveries_evento_unico IS
  'A idempotencia do webhook. O provedor reenvia em falha; o par (mensagem, tipo) faz a segunda entrega nao produzir efeito.';

-- Down Migration

DROP TABLE notification_deliveries;
