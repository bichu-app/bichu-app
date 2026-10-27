-- A CREDENCIAL DIGITAL (passkey) POR CONTA.
--
-- Pedido do cliente, 26/10/2026, literal: *"vamos implementar apos o usuario
-- realizar o cadastro o passkeys para que ele possa logar com credenciais
-- digitais"*. BICHUS-301.
--
-- ====================================================================
-- O CARIMBO NAO E SEQUENCIAL, E ISSO E DE PROPOSITO
-- ====================================================================
--
-- `20261027000001` JA EXISTE, em `endereco-de-entrega-por-pet.sql`, no worktree
-- de outra sessao -- NAO COMITADO. O portao `verificar-carimbo-de-migracao.mjs`
-- le as refs do git e por isso NAO o enxerga: ele teria dado APROVADO para o
-- carimbo repetido, e duas migracoes com o mesmo carimbo nao confundem quem le,
-- elas TRAVAM o `migrate up` com saida 1 e nada aplicado (o `checkOrder` do
-- node-pg-migrate recusa migracao nao-executada que precede uma executada).
--
-- Por isso este arquivo sai em `000020` em vez de `000002`: tres sessoes
-- trabalham neste repositorio e a frente sequencial do dia e onde elas colidem.
-- Afastar o carimbo e a unica defesa que nao depende de um portao que, por
-- construcao, nao ve o trabalho das outras.
--
-- ====================================================================
-- DUAS TABELAS, E POR QUE NAO UMA
-- ====================================================================
--
-- `passkey_credentials` guarda a chave publica, que vive enquanto a credencial
-- viver. `passkey_challenges` guarda o desafio, que vive cinco minutos e e
-- consumido. Juntar as duas faria a linha da credencial ser reescrita a cada
-- tentativa de entrada, inclusive as que falham -- e a fila de desafios
-- expirados tem de poder ser varrida sem tocar em credencial nenhuma.
--
-- ====================================================================
-- O DESAFIO E GUARDADO COMO HASH, E E ASSIM QUE ELE E ACHADO
-- ====================================================================
--
-- `challenge_hash` e o SHA-256 do desafio em base64url, no molde de
-- `verification_tokens.token_hash` e `reauth_tokens.token_hash`: o repositorio
-- nao guarda segredo em claro.
--
-- Mas aqui o hash faz um segundo trabalho, e ele resolve um problema real. Na
-- CONCLUSAO DA ENTRADA o servidor **nao sabe de quem e a tentativa** -- a
-- operacao nao recebe e-mail, de proposito (seria um oraculo de enumeracao de
-- conta numa porta sem autenticacao). Entao nao ha por onde buscar a linha do
-- desafio... exceto pelo proprio desafio, que volta dentro do
-- `clientDataJSON`. O servidor calcula o hash do que voltou e busca por ele.
--
-- E por isso `challenge_hash` e UNIQUE: ele e chave de busca, e nao so coluna.
--
-- `user_id` e NULO nos desafios de ENTRADA, e preenchido nos de CADASTRO. A
-- diferenca nao e descuido: no cadastro ha sessao e a credencial tem de nascer
-- na conta certa; na entrada nao ha sessao, e inventar um dono antes de a
-- assinatura conferir seria aceitar como identificacao o campo que quem chama
-- escolhe.
--
-- ====================================================================
-- O CONTADOR DE ASSINATURA, E A EXCECAO QUE A ESPECIFICACAO PREVE
-- ====================================================================
--
-- `sign_count` e a defesa contra REPETICAO: cada assercao aceita traz um
-- contador, e assercao com contador menor ou igual ao guardado e repeticao de
-- uma assercao capturada ou autenticador clonado.
--
-- `BIGINT` e nao `INTEGER` porque o campo do WebAuthn tem 32 bits SEM SINAL, e
-- `INTEGER` do Postgres tem 31 uteis: um autenticador que passasse de
-- 2 147 483 647 estouraria a coluna, e o erro apareceria como falha de entrada
-- sem explicacao.
--
-- A excecao: boa parte dos autenticadores de PLATAFORMA (que e o caso aqui,
-- `authenticatorAttachment: platform`) devolve SEMPRE ZERO, legitimamente -- a
-- especificacao permite. Entao a regra aplicada e: guardado zero e recebido
-- zero PASSA; em qualquer outro caso o recebido tem de ser estritamente maior.
-- Essa regra vive no codigo, e nao numa `CHECK`, porque ela compara o valor
-- NOVO com o ANTIGO e `CHECK` nao ve o antigo.
--
-- ====================================================================
-- REVOGAR MARCA, NAO APAGA
-- ====================================================================
--
-- Decisao do cliente de 26/10: *"nao apague nada"*. Nao ha `DELETE` de
-- credencial em lugar nenhum do codigo -- revogar preenche `revoked_at`.
--
-- Consequencia que precisa estar dita: o teto por conta e o `excludeCredentials`
-- contam `revoked_at IS NULL`, e o indice unico de `credential_id` e
-- **total e nao parcial**. Isso e deliberado: um `credential_id` revogado NAO
-- pode ser recadastrado, porque ele identifica um par de chaves que ja foi
-- descartado por decisao do dono. Indice parcial deixaria o mesmo aparelho
-- voltar depois de uma revogacao por contador repetido -- que e exatamente o
-- caso em que ele nao deve voltar sozinho.
--
-- `revoked_reason` separa quem revogou. `counter_regression` e a unica que o
-- SERVIDOR escreve por conta propria, e ela e sinal de seguranca: credencial
-- revogada por essa razao foi clonada ou teve assercao capturada.
--
-- ====================================================================
-- NADA DE RAISE NOTICE AQUI
-- ====================================================================
--
-- O node-pg-migrate DESCARTA `NOTICE` e `WARNING`: aviso escrito numa migracao
-- nao chega a ninguem. Quem precisa contar algo conta em `audit.events`.

-- Up Migration

CREATE TABLE passkey_credentials (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- O `credential_id` CRU, como o autenticador o emitiu. Nao e segredo (ele
  -- viaja em `excludeCredentials`), mas tambem nao sai em `listPasskeys`: o
  -- contrato devolve o `id` DA LINHA, para nao por identificador de credencial
  -- em caminho de URL, que vai para log de acesso.
  credential_id    BYTEA NOT NULL,

  -- A chave publica em COSE, como veio da atestacao. Guardada em bytes e nao
  -- decomposta em curva/x/y: quem a usa e a biblioteca de verificacao, e
  -- decompor aqui criaria uma segunda representacao para divergir da primeira.
  public_key       BYTEA NOT NULL,

  sign_count       BIGINT NOT NULL DEFAULT 0 CONSTRAINT passkey_credentials_contador_nao_negativo CHECK (sign_count >= 0),

  -- Rotulo do aparelho, escolhido pela pessoa. NULO e valido: o passo e
  -- dispensavel e o rotulo tambem, e a tela mostra a data quando falta.
  label            TEXT CONSTRAINT passkey_credentials_rotulo_com_teto CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 60),

  -- Informativo, para a tela. NUNCA decisao de seguranca.
  transports       TEXT[],

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  revoked_reason   TEXT CONSTRAINT passkey_credentials_razao_conhecida CHECK (
                     revoked_reason IS NULL
                     OR revoked_reason IN ('user', 'counter_regression', 'account_deleted')
                   ),

  -- Razao sem data, ou data sem razao, e meia revogacao: as duas colunas
  -- andam juntas ou o estado fica indecidivel.
  CONSTRAINT passkey_credentials_revogacao_completa CHECK (
    (revoked_at IS NULL AND revoked_reason IS NULL)
    OR (revoked_at IS NOT NULL AND revoked_reason IS NOT NULL)
  )
);

-- TOTAL e nao parcial, de proposito -- ver o cabecalho: `credential_id`
-- revogado nao volta.
CREATE UNIQUE INDEX passkey_credentials_credencial_unica
  ON passkey_credentials (credential_id);

-- A consulta de `listPasskeys`, de `excludeCredentials` e do teto por conta: as
-- tres pedem as ATIVAS de uma conta, mais recente primeiro.
CREATE INDEX passkey_credentials_ativas_da_conta
  ON passkey_credentials (user_id, created_at DESC)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE passkey_credentials IS
  'Credenciais WebAuthn por conta (BICHUS-301). SOMA a senha, nunca a substitui: passkey e presa ao aparelho, e trocar de celular sem outra porta trancaria a pessoa fora da conta. Revogar MARCA revogada (decisao do cliente de 26/10), nunca apaga.';
COMMENT ON COLUMN passkey_credentials.sign_count IS
  'Contador antirrepeticao. Assercao com contador <= o guardado e repeticao ou clone, e o servidor revoga com `counter_regression`. EXCECAO prevista na especificacao: guardado zero e recebido zero passa, porque autenticador de plataforma devolve zero legitimamente. BIGINT porque o campo do WebAuthn tem 32 bits SEM SINAL.';
COMMENT ON COLUMN passkey_credentials.revoked_reason IS
  '`user` pediu; `counter_regression` o SERVIDOR detectou clone ou repeticao (sinal de seguranca); `account_deleted` veio da conta.';

CREATE TABLE passkey_challenges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULO na ENTRADA e preenchido no CADASTRO -- ver o cabecalho.
  user_id          UUID REFERENCES users (id) ON DELETE CASCADE,

  purpose          TEXT NOT NULL CONSTRAINT passkey_challenges_proposito_conhecido CHECK (purpose IN ('registration', 'authentication')),

  -- SHA-256 do desafio em base64url. E tambem a CHAVE DE BUSCA na conclusao da
  -- entrada, que e por que ele e UNIQUE.
  challenge_hash   BYTEA NOT NULL,

  expires_at       TIMESTAMPTZ NOT NULL,

  -- Uso unico. Preenchido na conclusao, de sucesso OU de falha: desafio que
  -- sobrevive a uma falha e desafio que pode ser reusado.
  consumed_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Desafio de cadastro sem dono nao tem onde gravar a credencial; desafio de
  -- entrada COM dono seria dono adivinhado antes de a assinatura conferir.
  CONSTRAINT passkey_challenges_dono_conforme_proposito CHECK (
    (purpose = 'registration' AND user_id IS NOT NULL)
    OR (purpose = 'authentication' AND user_id IS NULL)
  )
);

CREATE UNIQUE INDEX passkey_challenges_desafio_unico
  ON passkey_challenges (challenge_hash);

-- A varredura dos vencidos.
CREATE INDEX passkey_challenges_vencidos
  ON passkey_challenges (expires_at)
  WHERE consumed_at IS NULL;

COMMENT ON TABLE passkey_challenges IS
  'Desafios WebAuthn: prazo e USO UNICO. Guardados como hash, no molde de verification_tokens. O hash e tambem a chave de busca, porque a conclusao da ENTRADA nao sabe de quem e a tentativa -- a operacao nao recebe e-mail de proposito, para nao virar oraculo de enumeracao de conta.';
COMMENT ON COLUMN passkey_challenges.user_id IS
  'NULO na entrada, preenchido no cadastro. Imposto pela CHECK `passkey_challenges_dono_conforme_proposito`.';

-- Down Migration

DROP TABLE IF EXISTS passkey_challenges;
DROP TABLE IF EXISTS passkey_credentials;
