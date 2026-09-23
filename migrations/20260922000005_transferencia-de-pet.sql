-- BICHUS-66 -- transferencia de pet para outro tutor, com convite por e-mail e
-- janela de 24 h cancelavel.
--
-- UMA TABELA, E ELA E UMA MAQUINA DE ESTADO. O ciclo inteiro vive em
-- `pet_transfers.status`, e nao em quatro tabelas de evento: as perguntas que o
-- produto faz sao todas sobre a transferencia CORRENTE de um pet ("da para
-- cancelar?", "quando consuma?", "ja tem uma em andamento?"), e nenhuma delas se
-- responde bem varrendo um historico.
--
-- POR QUE A REVOGACAO DAS TAGS NAO ESTA AQUI. Consumar revoga todas as tags do
-- pet com `pet_transferred` (ADR-0004, ciclo de vida). Isso e escrita em
-- `pet_tags`, feita pelo servico dentro da mesma transacao da troca de dono --
-- nao ha coluna nesta tabela que registre "tags revogadas", porque a verdade
-- sobre uma tag mora em `pet_tags.status` e duplica-la aqui criaria duas
-- respostas para a mesma pergunta.
--
-- OS DOIS TOKENS, E POR QUE SAO DOIS.
--
--   `invite_token_hash`  vai por e-mail ao DESTINATARIO. E a credencial de
--                        aceitar. 256 bits de CSPRNG, 72 h de validade.
--   `cancel_token_hash`  nasce NO ACEITE e vai por e-mail ao TUTOR ATUAL. E a
--                        credencial de desfazer, e existe porque o tutor pode
--                        estar em outro aparelho, deslogado, com o app
--                        desinstalado -- e o momento de desfazer a operacao mais
--                        destrutiva do produto nao e o momento de pedir login
--                        (descricao de `getTransferByCancelToken`).
--
-- Os dois sao guardados como SHA-256 e so isso (ADR-0002, SEC-005): 256 bits de
-- entropia dispensam sal, e o claro existe apenas na caixa de entrada de quem
-- recebeu. Um dump do banco nao entrega nenhuma das duas credenciais.
--
-- O QUE ESTA TABELA DELIBERADAMENTE NAO GUARDA:
--
-- * NENHUM TOKEN EM CLARO, em nenhuma coluna e em nenhum momento -- nem sequer
--   transitoriamente. E por isso que o convite NAO passa pela fila `jobs`: o
--   payload dela e gravado, e enfileirar o token o deixaria numa linha que
--   sobrevive ao envio. O mesmo raciocinio de `ports/mailer.ts`.
-- * NENHUM `device_id`, NENHUM IP E NENHUM USER AGENT. Quem inicia e quem aceita
--   sao CONTAS. O rastro de abuso ja existe em `audit.events`, com
--   `actor_ip_hmac` (SEC-010), e uma segunda copia aqui so acumularia dano.
-- * NENHUMA COPIA DO PET. Nome, foto e especie sao lidos de `pets` na hora. O
--   e-mail de aviso congelaria o nome do pet numa linha que ninguem atualiza.
--
-- PENSANDO NA EXCLUSAO DE CONTA, QUE E ONDE CHAVE ESTRANGEIRA MAL DESENHADA
-- APARECE. Sao tres FKs e as tres tem direcao diferente, de proposito:
--
--   `pet_id`       CASCADE   -- transferencia e do pet e nao sobrevive a ele.
--   `from_user_id` CASCADE   -- quem inicia e o tutor; apagada a conta, some.
--   `to_user_id`   SET NULL  -- o destinatario e OUTRA pessoa. Se ele apagar a
--                               conta dele, a linha do tutor atual NAO pode ser
--                               arrastada junto, e a exclusao dele nao pode
--                               falhar por causa de uma transferencia alheia.
--
-- A coluna `to_user_id` e ANULAVEL por isso, e a nulidade nao e desleixo: ela e
-- a condicao para o `SET NULL` existir. Coluna obrigatoria com `ON DELETE SET
-- NULL` e a contradicao que faz a exclusao de conta estourar em producao --
-- declarada valida pelo esquema e impossivel de executar. Aqui as duas coisas
-- concordam, e a consumacao le a nulidade como o que ela e: destinatario que
-- deixou de existir nao recebe pet nenhum.

-- Up Migration

CREATE TABLE pet_transfers (
  id                  uuid        PRIMARY KEY,

  pet_id              uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,

  -- O tutor no momento do convite. Desnormalizado de `pets.owner_user_id` de
  -- proposito: depois da consumacao `pets.owner_user_id` e o tutor NOVO, e sem
  -- esta coluna a propria linha deixaria de saber de quem o pet saiu.
  from_user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- Endereco do destinatario, normalizado (minusculas, sem espaco em volta) no
  -- mesmo ponto em que `normalizarEmail` normaliza o cadastro. Nao e chave
  -- estrangeira, e nao pode ser: BICHUS-19 criterio 2 proibe e-mail em FK, e a
  -- conta pode nem existir quando o convite sai.
  --
  -- NAO SAI EM RESPOSTA NENHUMA EM CLARO. O contrato expoe
  -- `recipient_email_masked` (`ma****@exemplo.com.br`) na visao do tutor, e o
  -- `TransferCancelView` publico nao expoe nem mascarado.
  recipient_email     text        NOT NULL
                                  CONSTRAINT pet_transfers_email_nao_vazio
                                  CHECK (length(btrim(recipient_email)) > 0),

  -- Preenchida NO ACEITE, com a conta que apresentou o token. Ver o bloco das
  -- chaves no cabecalho: anulavel porque o `ON DELETE SET NULL` exige.
  to_user_id          uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- SHA-256 de 256 bits de CSPRNG. 32 bytes, e a restricao diz isso: uma coluna
  -- `bytea` sem tamanho aceitaria o token em claro por engano.
  invite_token_hash   bytea       NOT NULL
                                  CONSTRAINT pet_transfers_invite_hash_sha256
                                  CHECK (octet_length(invite_token_hash) = 32),

  -- Nulo ate o aceite. Depois dele, a credencial de desfazer.
  cancel_token_hash   bytea       CONSTRAINT pet_transfers_cancel_hash_sha256
                                  CHECK (cancel_token_hash IS NULL
                                         OR octet_length(cancel_token_hash) = 32),

  -- Os CINCO estados de `PetTransfer.status`, e os cinco sao distintos:
  --   pending_acceptance  convite enviado, ninguem aceitou
  --   accepted            aceito, janela de 24 h correndo, NADA foi revogado
  --   effective           consumado: o pet trocou de dono e as tags cairam
  --   cancelled           desfeito antes de consumar, por qualquer dos caminhos
  --   expired             as 72 h para aceitar passaram em branco
  status              text        NOT NULL DEFAULT 'pending_acceptance'
                                  CONSTRAINT pet_transfers_status_conhecido
                                  CHECK (status IN ('pending_acceptance', 'accepted',
                                                    'effective', 'cancelled', 'expired')),

  -- Fim do prazo para ACEITAR (72 h). E o `expires_at` do contrato.
  invite_expires_at   timestamptz NOT NULL,

  accepted_at         timestamptz,

  -- Quando a posse muda, se ninguem cancelar: 24 h depois do aceite. Enquanto o
  -- estado e `accepted` este instante esta no FUTURO -- e e o unico numero que a
  -- tela de cancelamento precisa mostrar.
  effective_at        timestamptz,

  cancelled_at        timestamptz,

  -- POR QUE FOI DESFEITA. Lista fechada, e o terceiro valor e a resposta da
  -- BICHUS-66 ao caso que nem ela nem a BICHUS-21 previram: o tutor antigo
  -- marcar o pet como PERDIDO no meio da janela de 24 h.
  --
  --   current_owner      o tutor cancelou de dentro do app
  --   cancel_token       o tutor cancelou pelo link do e-mail, sem conta
  --   lost_case_opened   abriu-se um caso de perdido para este pet. Consumar ali
  --                      revogaria a plaquinha da coleira no exato minuto em que
  --                      um estranho pode estar lendo o QR, e revogacao nao
  --                      volta (ADR-0004). O caso ganha, e a transferencia cai.
  --   recipient_gone     a conta do destinatario deixou de existir antes de
  --                      consumar (`to_user_id` virou nulo pelo SET NULL)
  cancellation_reason text        CONSTRAINT pet_transfers_motivo_conhecido
                                  CHECK (cancellation_reason IS NULL
                                         OR cancellation_reason IN ('current_owner', 'cancel_token',
                                                                    'lost_case_opened', 'recipient_gone')),

  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Cancelada TEM motivo, e nao-cancelada NAO tem. As duas direcoes: a segunda
  -- impede uma linha `effective` carregando `lost_case_opened`, que e o tipo de
  -- lixo que ninguem le ate alguem construir um relatorio em cima dele.
  CONSTRAINT pet_transfers_motivo_acompanha_o_cancelamento
    CHECK ((status = 'cancelled') = (cancellation_reason IS NOT NULL)),

  -- Aceita TEM os dois instantes, nao-aceita nao tem nenhum. `effective_at` sem
  -- `accepted_at` seria uma consumacao agendada a partir de nada.
  CONSTRAINT pet_transfers_aceite_traz_os_dois_instantes
    CHECK ((accepted_at IS NULL) = (effective_at IS NULL))
);

-- NO MAXIMO UMA TRANSFERENCIA VIVA POR PET, IMPOSTO PELO BANCO.
--
-- O contrato promete 409 em "transferencia ja em andamento". A conferencia na
-- aplicacao da a MENSAGEM certa; so o indice da a GARANTIA -- entre ler e
-- gravar ha uma janela, e e por ela que a fila offline de um cliente sem rede
-- passa em rajada quando o sinal volta. E a mesma decisao que `lost_cases`
-- tomou para `pet-already-lost`, e pelo mesmo motivo.
--
-- Parcial de proposito: transferencia cancelada, expirada ou ja consumada nao
-- ocupa a vaga. O tutor que desistiu consegue transferir de novo no minuto
-- seguinte, e o tutor novo consegue transferir de volta.
CREATE UNIQUE INDEX pet_transfers_uma_viva_por_pet
  ON pet_transfers (pet_id)
  WHERE status IN ('pending_acceptance', 'accepted');

-- A BUSCA PELO TOKEN DO CONVITE. Unico entre os convites VIVOS: dois convites
-- pendentes com o mesmo resumo seriam colisao de SHA-256 ou -- muito mais
-- provavel -- o mesmo token gerado duas vezes por um gerador quebrado. Nos dois
-- casos o banco precisa recusar em vez de deixar a consulta escolher uma linha.
--
-- PARCIAL, e a razao e o uso unico. O aceite QUEIMA o resumo (sobrescreve com
-- 32 zeros) na mesma escrita em que registra o aceite: a condicao de estado
-- sozinha seria uma conferencia, e queimar e o segredo deixando de existir.
-- Queimados, todos os convites aceitos passam a carregar o MESMO valor, e um
-- indice unico total recusaria o segundo aceite do sistema inteiro -- um defeito
-- que so apareceria na segunda transferencia consumada em producao.
--
-- A coluna continua `NOT NULL`: linha de transferencia sem resumo de convite
-- nunca existiu, e permitir o nulo abriria a porta para uma insercao que
-- esquecesse o token.
CREATE UNIQUE INDEX pet_transfers_invite_token
  ON pet_transfers (invite_token_hash)
  WHERE status = 'pending_acceptance';

-- A BUSCA PELO TOKEN DE CANCELAMENTO, o caminho das duas rotas publicas.
-- Parcial porque a coluna e nula ate o aceite, e `NULL` nao colide com `NULL`
-- num indice unico comum -- o indice parcial diz a intencao em vez de depender
-- dessa sutileza.
CREATE UNIQUE INDEX pet_transfers_cancel_token
  ON pet_transfers (cancel_token_hash)
  WHERE cancel_token_hash IS NOT NULL;

-- "QUAIS TRANSFERENCIAS VENCERAM?" e "quais consumam agora?". A varredura do
-- worker filtra por estado E por instante, e o prefixo por estado e o que torna
-- a busca uma faixa curta em vez de uma varredura da tabela inteira.
CREATE INDEX pet_transfers_por_estado_e_prazo
  ON pet_transfers (status, invite_expires_at);

CREATE INDEX pet_transfers_por_estado_e_consumacao
  ON pet_transfers (status, effective_at);

COMMENT ON TABLE pet_transfers IS
  'BICHUS-66: a maquina de estado da troca de tutor. Convite por e-mail com token de 72 h, aceite vinculado ao e-mail verificado do destinatario, e janela de 24 h cancelavel antes de a posse mudar e as tags cairem (ADR-0004).';

COMMENT ON COLUMN pet_transfers.invite_token_hash IS
  'SHA-256 do token de convite. O claro existe apenas na caixa de entrada do destinatario, e e isso que separa "o tutor quer transferir" de "quem pegou o celular do tutor transferiu".';

COMMENT ON COLUMN pet_transfers.cancel_token_hash IS
  'SHA-256 do token de cancelamento, criado no aceite e enviado ao tutor atual. Uso unico: consumido ao cancelar.';

COMMENT ON COLUMN pet_transfers.recipient_email IS
  'Endereco informado pelo tutor, normalizado. Sai mascarado (recipient_email_masked) na visao do tutor e nao sai de forma nenhuma na superficie publica (ADR-0010).';

COMMENT ON COLUMN pet_transfers.effective_at IS
  'Quando a posse muda, se ninguem cancelar: 24 h apos o aceite. Ate este instante NADA foi revogado.';

COMMENT ON COLUMN pet_transfers.to_user_id IS
  'A conta que aceitou. Anulavel porque a FK e ON DELETE SET NULL: o destinatario apagar a conta dele nao pode arrastar nem travar a linha do tutor atual. Nulo com status accepted significa destinatario que deixou de existir, e a consumacao recusa.';

-- Down Migration

DROP TABLE IF EXISTS pet_transfers;
