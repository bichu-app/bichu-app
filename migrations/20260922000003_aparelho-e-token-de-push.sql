-- BICHUS-91 — registro e revogacao do aparelho e do token de push.
--
-- O que esta migracao fecha, em uma frase: a BICHUS-92 deu ao sistema QUEM esta
-- perto (`user_reference_locations`, com `geography(Point,4326)` e indice GIST),
-- e continuava faltando QUEM tem como ser avisado. Os criterios 1 e 4 do
-- ADR-0006 -- "tem ao menos um aparelho com `push_permission = granted` e token
-- valido" -- nao eram exprimiveis porque nao havia tabela de aparelho em
-- migracao nenhuma. Sem ela, uma consulta PostGIS escrita hoje devolveria o
-- numero de quem tem localizacao e **nao tem como receber push**: numero errado
-- com cara de certo, que e a forma de mentir que o ADR-0006 proibe por escrito.
--
-- TABELA PROPRIA, E NAO COLUNAS EM `users`. Os mesmos tres argumentos da
-- BICHUS-92, e o primeiro pesa mais aqui do que la:
--
-- 1. **Menor exposicao por leitura.** `users` e lida no login, na renovacao e em
--    toda rota autenticada. O token de push e CREDENCIAL DE ENTREGA: quem o tem,
--    junto da credencial do projeto FCM, manda notificacao para aquele aparelho
--    -- e notificacao aparece na tela bloqueada, ao lado de quem estiver junto
--    da pessoa. Uma coluna assim nao pode entrar em todo `SELECT` amplo nem em
--    todo despejo de diagnostico. E o mesmo argumento que separou
--    `local_credentials` de `user_identities` (ADR-0002, "o segredo mora
--    separado do vinculo") e `user_reference_locations` de `users` (BICHUS-92).
-- 2. **Ausencia escrita como ausencia de linha.** Revogar e `DELETE FROM`, e nao
--    tres `UPDATE ... = NULL` que precisam ser lembrados juntos.
-- 3. **A cardinalidade vira indice, e nao disciplina de aplicacao.** Ver os dois
--    indices unicos abaixo.
--
-- POR QUE A REVOGACAO APAGA A LINHA, E NAO A MARCA COM `revoked_at`
--
-- A leitura literal do criterio 4 ("o aparelho e **marcado** e para de ser
-- tentado") sugere lapide. Ela foi considerada e recusada, com tres razoes:
--
--   a. **Token de push e credencial.** O estado mais seguro de uma credencial
--      revogada e "nao esta no banco". Uma lapide que guardasse o token seria
--      guardar a credencial depois de ela ter sido revogada; uma lapide que o
--      apagasse nao guardaria nada que o produto leia -- `Device` no contrato
--      nao tem campo para "registrado e morto", entao o Perfil nao teria como
--      exibir a distincao de qualquer jeito (criterio 5).
--   b. **Toda leitura passaria a depender de `revoked_at IS NULL`**, e filtro
--      que alguem esquece e exatamente o modo de falhar que este repositorio
--      persegue. Com `DELETE`, "parou de ser tentado" nao depende de predicado
--      nenhum: a linha nao existe.
--   c. **O "por que este aparelho parou de receber" ja tem lugar**, e ele e a
--      trilha de auditoria (`device.revoked`, com o motivo no metadado). A
--      trilha nao referencia `users` de proposito, entao ela sobrevive ao
--      `CASCADE` e responde a pergunta depois da conta ter sido apagada -- coisa
--      que uma lapide nesta tabela nunca faria.
--
-- O que "marcado" significa operacionalmente, e o que de fato foi entregue: o
-- aparelho para de ser tentado, na mesma transacao, sem derrubar o envio para os
-- outros aparelhos da mesma conta (`revogarPorTokenRecusado` apaga UMA linha,
-- pelo token, e nao a conta inteira).
--
-- POR QUE `push_token` NAO LEVA A MARCA `NUNCA sai do servidor` DE
-- `src/tools/portao-colunas-que-nao-saem.ts`
--
-- Pelo mesmo motivo estrutural que fez a BICHUS-92 nao marcar `reference_point`,
-- e vale escrever inteiro porque aqui a premissa parece satisfeita e nao e:
--
--   * aquele portao procura o NOME da coluna em TODO o contrato, e o percurso
--     de `components` nao distingue requisicao de resposta. `DeviceRegistration`
--     declara `push_token` como campo de ENTRADA (e precisa declarar: e assim
--     que o token chega). Marcar a coluna reprovaria o portao no primeiro
--     `npm test`, por um campo que esta certo;
--   * o mesmo portao reprova o nome em QUALQUER arquivo de `src/`, e o
--     adaptador de persistencia precisa escrever `push_token` para gravar a
--     coluna. Marcar obrigaria o adaptador a entrar na lista de dispensa do
--     portao, que e o furo que ele existe para impedir.
--
-- O que guarda esta coluna, em lugar da marca, e verificavel e roda a cada
-- suite: `src/modules/notifications/adapters/http/token-de-push-nao-vaza.test.ts`
-- usa `responseSchema` do proprio contrato e a varredura DO PROPRIO portao
-- (`inspecionarContrato`) para exigir ZERO ocorrencia de `push_token` em
-- qualquer RESPOSTA de qualquer operacao, com isca que precisa reprovar.

-- Up Migration

CREATE TABLE user_devices (
  -- UUIDv7 gerado pela aplicacao, como o resto do esquema. Ele SAI em
  -- `Device.id`, e so para o dono: `listDevices` e `deleteDevice` exigem
  -- `bearerAuth`, entao nao ha superficie sem conta que o alcance (ADR-0010
  -- proibe UUID interno em saida PUBLICA, e o portao mede exatamente isso).
  id               uuid        PRIMARY KEY,

  -- CASCADE porque o aparelho e da conta e nao sobrevive a ela (ADR-0010,
  -- tabela de retencao). A trilha de auditoria nao referencia `users`, entao o
  -- CASCADE aqui nao apaga a evidencia da revogacao.
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- CHECK e nao enum nativo: enum novo exige `ALTER TYPE`, que nao volta atras
  -- numa migracao `down`. Os valores sao os do contrato (`Device.platform`).
  platform         text        NOT NULL
                               CONSTRAINT user_devices_plataforma
                               CHECK (platform IN ('android', 'ios')),

  -- A CREDENCIAL DE ENTREGA. Guardada em claro porque ela precisa ser REPLICADA
  -- para o FCM a cada envio -- ao contrario do refresh, que so precisa ser
  -- CONFERIDO e por isso mora como SHA-256 (`shared/crypto/digest.ts`). Hash
  -- aqui nao protegeria nada: um token que nao pode ser lido nao pode ser
  -- usado, e o produto inteiro depende de usa-lo.
  --
  -- NULL e estado legitimo e frequente: no iOS o SDK so entrega token depois do
  -- registro no APNs, que depende da permissao; e o ADR-0008 manda registrar o
  -- aparelho de quem NEGOU, justamente para a metrica de alcance ser honesta.
  -- 512 e o mesmo teto do contrato (`DeviceRegistration.push_token.maxLength`).
  push_token       text        NULL
                               CONSTRAINT user_devices_tamanho_do_token
                               CHECK (push_token IS NULL OR char_length(push_token) BETWEEN 1 AND 512),

  -- Tres valores, e `not_asked` e distinto de `denied` (criterio 2): a linha de
  -- "permissao negada" na aba Perdidos so aparece para quem RESPONDEU nao.
  push_permission  text        NOT NULL
                               CONSTRAINT user_devices_permissao
                               CHECK (push_permission IN ('granted', 'denied', 'not_asked')),

  app_version      text        NULL
                               CONSTRAINT user_devices_tamanho_da_versao_do_app
                               CHECK (app_version IS NULL OR char_length(app_version) <= 20),
  os_version       text        NULL
                               CONSTRAINT user_devices_tamanho_da_versao_do_so
                               CHECK (os_version IS NULL OR char_length(os_version) <= 20),

  registered_at    timestamptz NOT NULL,
  -- Atualizado a cada `POST /v1/me/devices`. E o que o Perfil mostra ao lado do
  -- aparelho para o tutor reconhecer qual e qual (criterio 5).
  last_seen_at     timestamptz NOT NULL,

  CONSTRAINT user_devices_visto_depois_de_registrado
    CHECK (last_seen_at >= registered_at)
);

-- UM TOKEN, UMA CONTA. E o indice que torna o criterio 3 verdadeiro mesmo
-- quando o app NAO consegue chamar `DELETE /v1/me/devices/{deviceId}`.
--
-- O caso concreto, e ele nao e hipotetico: a ADR-0002 secao 5 registra que o
-- apagamento local no logout e incondicional e a revogacao no servidor "pode nao
-- acontecer" (sair sem rede). Se o token ficasse preso a conta antiga, o aviso
-- do pet da Marina chegaria no aparelho que agora esta com o Joao. O que
-- desfaz isso e a REGISTRO seguinte: o Joao entra, o app manda o mesmo token do
-- FCM, e `registrar()` reivindica a linha para ele. O indice unico e o que faz
-- "reivindicar" ser a unica saida possivel em vez de uma segunda linha viva.
--
-- Parcial (`WHERE push_token IS NOT NULL`) porque NULL nao e endereco de
-- entrega e varios aparelhos podem legitimamente nao ter token.
CREATE UNIQUE INDEX user_devices_um_token_uma_conta
  ON user_devices (push_token)
  WHERE push_token IS NOT NULL;

-- UMA LINHA SEM TOKEN POR (CONTA, PLATAFORMA).
--
-- Sem este indice, cada abertura do app de quem negou a permissao inseriria uma
-- linha nova para sempre -- nao ha por onde deduplicar, porque a identidade de
-- um aparelho NESTE contrato e o proprio token (`DeviceRegistration` nao carrega
-- identificador de instalacao). O teto de 60 chamadas por hora limita a
-- velocidade, nao o crescimento.
--
-- Uma linha sem token nao e endereco de entrega: e um FATO DE PERMISSAO sobre
-- uma pessoa numa plataforma, e e so assim que o produto a le (criterio 2 e a
-- escolha entre push e e-mail do ADR-0008, as duas por USUARIO). Colapsar duas
-- linhas sem token da mesma conta e da mesma plataforma nao perde informacao
-- que alguem leia.
CREATE UNIQUE INDEX user_devices_uma_linha_sem_token_por_plataforma
  ON user_devices (user_id, platform)
  WHERE push_token IS NULL;

-- A consulta que o alerta faz: "desta lista de tutores, quem tem como receber?"
-- Parcial pelos DOIS criterios do ADR-0006 de uma vez, e o predicado e
-- IMMUTABLE (nao ha `now()` aqui, ao contrario da validade da BICHUS-92), entao
-- o Postgres aceita. O indice e pequeno porque so indexa quem e alcancavel, que
-- e exatamente o conjunto que a consulta percorre.
CREATE INDEX user_devices_alcancaveis
  ON user_devices (user_id)
  WHERE push_permission = 'granted' AND push_token IS NOT NULL;

COMMENT ON TABLE user_devices IS
  'BICHUS-91: os aparelhos de uma conta que tem como receber push, e os que nao tem. Revogar e apagar a linha; o motivo fica na trilha de auditoria (device.revoked), que sobrevive ao CASCADE.';

COMMENT ON COLUMN user_devices.push_token IS
  'Credencial de ENTREGA do FCM, em claro porque precisa ser replicada a cada envio -- o refresh mora como SHA-256 porque so precisa ser conferido, e este nao. NAO sai em resposta nenhuma, e quem exige isso a cada suite e token-de-push-nao-vaza.test.ts, que le o contrato e reprova com isca. A marca de portao-colunas-que-nao-saem.ts NAO cabe aqui, e o raciocinio inteiro esta no cabecalho desta migracao: em resumo, o contrato precisa declarar este campo na ENTRADA (DeviceRegistration) e aquele portao nao distingue requisicao de resposta.';

COMMENT ON COLUMN user_devices.push_permission IS
  'granted, denied ou not_asked. not_asked e DISTINTO de denied (criterio 2): quem nunca respondeu a antessala nao ve a linha de permissao negada. So granted com token conta para reachable_tutors (ADR-0006, criterio 4).';

-- Down Migration

DROP TABLE IF EXISTS user_devices;
