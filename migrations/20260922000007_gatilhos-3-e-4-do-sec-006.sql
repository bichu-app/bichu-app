-- Os dois valores que faltavam para os gatilhos 3 e 4 do SEC-006 existirem.
--
-- O rastro que a BICHUS-215 registra e literal: `account_deleted` esta no tipo
-- e na restricao deste banco desde 17/09 e NUNCA teve produtor. Valor de uniao
-- sem quem o emita e a assinatura de um gatilho especificado e nao construido.
-- Esta migracao nao acrescenta `account_deleted` -- ele ja esta la; ela
-- acrescenta os dois valores que faltam para que o quarto gatilho tambem possa
-- ser escrito, e o codigo desta branch passa a ser o produtor dos dois.
--
-- ===========================================================================
-- 1. `not_me` EM `refresh_tokens.revoked_reason`
-- ===========================================================================
-- O SEC-006 lista CINCO gatilhos: sair de todos, troca de senha, redefinicao,
-- "Nao fui eu" e exclusao de conta. A restricao tinha tres motivos de massa --
-- `logout_all`, `password_changed` (que cobre troca E redefinicao, conforme a
-- migracao 20260922000001) e `account_deleted`. O quinto nao tinha valor.
--
-- Reusar `logout_all` seria barato e errado, pelo motivo que este repositorio
-- ja escreveu uma vez: a emenda 1 do ADR-0002 separou `logout` de `logout_all`
-- porque "sem os dois, a trilha nao distingue os dois verbos". Aqui a distincao
-- e maior, nao menor. `logout_all` e o titular arrumando a casa; `not_me` e
-- alguem declarando que a conta esta com outra pessoa. Quem investigar um
-- incidente seis meses depois precisa dessa diferenca, e ela so existe se
-- estiver gravada no momento em que aconteceu.
--
-- `reuse_detected` tambem nao serve: ele e a deteccao automatica, de UMA
-- familia, e ja existe. `not_me` e a resposta HUMANA aquela deteccao, e derruba
-- a conta inteira.
--
-- ===========================================================================
-- 2. `session_disavow` EM `verification_tokens.purpose`
-- ===========================================================================
-- O "nao fui eu" e alcancado por link de e-mail, por alguem que pode nao
-- conseguir entrar na conta. Isso exige uma credencial de uso unico, com prazo,
-- hash guardado em vez do valor, e HMAC do IP de emissao -- que e exatamente o
-- que `verification_tokens` ja e. Tabela nova aqui seria uma segunda
-- implementacao do mesmo mecanismo, com a segunda chance de errar o consumo
-- atomico que a porta ja resolve em UMA instrucao.
--
-- A FK `verification_tokens.user_id` ja e `ON DELETE CASCADE`: o token morre
-- junto com a conta no expurgo, sem chave estrangeira nova e sem entrada nova
-- no portao de chave-estrangeira-contra-restricao.
--
-- ===========================================================================
-- 3. O INDICE DO EXPURGO
-- ===========================================================================
-- `users_email_unico_ativo` ja e parcial `WHERE deleted_at IS NULL`, e serve a
-- pergunta oposta da que o expurgo faz. A varredura de 30 dias procura
-- justamente as linhas que aquele indice exclui, e sem indice proprio ela e uma
-- varredura sequencial da tabela de contas a cada rodada do worker.
--
-- ===========================================================================
-- POR QUE 000007, E O QUE ISSO EVITA
-- ===========================================================================
-- Os dois prefixos anteriores ja estao tomados por branches que nao foram
-- mescladas, e duas migracoes com o mesmo prefixo se ordenam por NOME DE
-- ARQUIVO -- que e ordem arbitraria entre branches, decidida por quem escolheu
-- o titulo. Conferido com `git ls-tree` em todas as branches:
--
--   20260922000005  `mensagem-cede-para-a-cascata-do-aviso`   (nesta base)
--   20260922000005  `reautenticacao-com-senha`                (BICHUS-48)
--   20260922000006  `localizacao-nao-sobrevive-a-exclusao-logica`
--
-- A terceira e vizinha desta: ela apaga `user_reference_locations` por gatilho
-- no instante em que `deleted_at` deixa de ser nulo, e quem passa a escrever
-- esse `deleted_at` e o `registrarPedidoDeExclusao` desta branch. As duas se
-- compoem, e esta precisa vir DEPOIS para que o gatilho ja exista quando o
-- primeiro pedido de exclusao rodar num banco migrado do zero.

-- Up Migration

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_revoked_reason_check;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout', 'logout_all',
    'password_changed', 'account_deleted', 'not_me'));

COMMENT ON COLUMN refresh_tokens.revoked_reason IS
  'Por que a linha morreu. `logout` e um aparelho; `logout_all` e a conta inteira (ADR-0002 emenda 1). `reuse_detected` e a deteccao automatica de UMA familia; `not_me` e a resposta humana a ela, e derruba a conta toda. Sem os quatro, a trilha nao distingue os verbos.';

ALTER TABLE verification_tokens DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;
ALTER TABLE verification_tokens ADD CONSTRAINT verification_tokens_purpose_check
  CHECK (purpose IN ('email_verify', 'password_reset', 'email_change', 'session_disavow'));

COMMENT ON COLUMN verification_tokens.purpose IS
  'A que serve o token. `session_disavow` e o "Nao fui eu" do aviso de reuso: uso unico, 7 dias, e o unico proposito que NAO leva a pessoa a digitar nada -- ele derruba as sessoes e acaba.';

CREATE INDEX IF NOT EXISTS users_a_expurgar
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON INDEX users_a_expurgar IS
  'A varredura de expurgo de 30 dias (ADR-0010: exclusao logica imediata, expurgo em 30 dias). Parcial na direcao oposta a de `users_email_unico_ativo`, que so enxerga conta viva.';

-- Down Migration

-- A descida so e possivel se nenhuma linha ja carregar os valores novos: a
-- restricao antiga os recusaria e o `ALTER` falharia com 23514, apontando as
-- linhas. Isso e o certo -- descer apagando o motivo pelo qual uma sessao caiu
-- reescreveria a trilha de seguranca para caber no esquema antigo.

DROP INDEX IF EXISTS users_a_expurgar;

ALTER TABLE verification_tokens DROP CONSTRAINT IF EXISTS verification_tokens_purpose_check;
ALTER TABLE verification_tokens ADD CONSTRAINT verification_tokens_purpose_check
  CHECK (purpose IN ('email_verify', 'password_reset', 'email_change'));

COMMENT ON COLUMN verification_tokens.purpose IS NULL;

ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_revoked_reason_check;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_revoked_reason_check
  CHECK (revoked_reason IN (
    'rotation', 'reuse_detected', 'logout', 'logout_all',
    'password_changed', 'account_deleted'));

COMMENT ON COLUMN refresh_tokens.revoked_reason IS
  'Por que a linha morreu. `logout` e um aparelho; `logout_all` e a conta inteira (ADR-0002 emenda 1). Sem os dois, a trilha nao distingue os dois verbos.';
