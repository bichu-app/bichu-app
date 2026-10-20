-- A POLITICA DE VERSAO MINIMA DO APLICATIVO: onde o numero mora, e por que
-- ele mora aqui e nao em `.env`.
--
-- O pedido do cliente de 19/10/2026 foi "forcar a atualizacao do app quando
-- fizermos um deployment novo". Nenhum aplicativo se atualiza sozinho; o que
-- existe e BLOQUEAR a versao velha e levar a pessoa a loja. Esta tabela e o
-- interruptor desse bloqueio.
--
-- ====================================================================
-- ESTE E UM INTERRUPTOR CAPAZ DE DESLIGAR O APP DE TODO MUNDO
-- ====================================================================
--
-- Um numero errado escrito aqui tranca a base inteira fora do produto, e o
-- conserto nao pode exigir outro deploy -- se exigir, a janela de tranca dura
-- o tempo de um roteiro manual (nao existe CD neste projeto). Tudo o que vem
-- abaixo e consequencia disso.
--
-- ====================================================================
-- POR QUE TABELA, E NAO VARIAVEL DE AMBIENTE
-- ====================================================================
--
-- `.env` seria o lugar obvio: toda configuracao deste servico vem de ambiente
-- (§11.2 de docs/03-arquitetura.md, `shared/config/app-config.ts`). E para
-- quase tudo ele continua certo. Para ESTE valor ele e errado, por tres
-- medidas e nao por gosto:
--
-- 1. **TROCAR O VALOR EXIGIRIA REINICIAR A APLICACAO.** `loadAppConfig()` le
--    o ambiente UMA VEZ, na subida. Reiniciar nao e "deploy de imagem nova",
--    entao a letra do requisito estaria cumprida -- e o espirito nao: o
--    momento em que alguem precisa DESLIGAR este mecanismo as pressas e o
--    pior momento possivel para derrubar e subir a API.
--
-- 2. **O ERRO DE DIGITACAO SO APARECERIA DEPOIS.** Em `.env`, quem escreve
--    `APP_MIN_VERSION=1.10` descobre no boot (se o boot recusar, a API nao
--    sobe -- pior ainda) ou nunca (se o boot tolerar, o mecanismo fica morto
--    em silencio). Aqui o `CHECK` abaixo recusa a escrita NA HORA, com a
--    aplicacao de pe e a politica anterior intacta. O requisito e "escrever
--    errado deve ser dificil, formato validado na entrada": entrada e o
--    `UPDATE`, e e no `UPDATE` que ele e validado.
--
-- 3. **O `.env` DE HOMOLOGACAO TEM 68 VARIAVEIS E NAO PODE SER REESCRITO POR
--    ENGANO.** Editar aquele arquivo as pressas, de madrugada, para trocar um
--    numero e exatamente o gesto que nao se quer convidar. `psql -c "UPDATE
--    ..."` nao tem como estragar as outras 67.
--
-- **Nenhuma variavel de ambiente nova entra por esta mudanca.** O endereco da
-- loja tambem mora aqui (coluna `store_url`), e nao em `--dart-define` do
-- aplicativo, porque no dia da publicacao o endereco so e conhecido DEPOIS de
-- o binario existir -- um endereco embutido no APK precisaria de outro APK
-- para ser corrigido.
--
-- Isto NAO e segredo e por isso nao vai para o Secret Manager (ADR-0022): sai
-- em resposta publica, de proposito. E configuracao de produto.
--
-- ====================================================================
-- A COMPARACAO NAO ESTA AQUI, E ISSO E DELIBERADO
-- ====================================================================
--
-- A tabela guarda NUMEROS; quem compara e `app-release/domain/versao.ts`, em
-- TypeScript, com tabela de casos. Comparacao em SQL (`string_to_array` +
-- `::int[]`) funcionaria, e foi recusada por um motivo pratico: o erro
-- classico de comparacao de versao (`1.10.0` contra `1.9.0`) e exatamente o
-- tipo de coisa que se prova com uma tabela de casos num teste unitario, e
-- `CHECK`/expressao SQL nao tem onde pendurar essa prova.
--
-- ====================================================================
-- AS DUAS LINHAS NASCEM COM O MECANISMO DESLIGADO
-- ====================================================================
--
-- `minimum_version` e `recommended_version` nascem NULAS. Uma migracao que
-- semeasse um numero bloquearia aparelhos instalados no instante em que
-- rodasse, e o cliente tem APK instalado.
--
-- As linhas EXISTEM (em vez de a tabela nascer vazia) por um motivo de
-- operacao: quem abre `SELECT * FROM app_version_policy;` as pressas precisa
-- VER onde se escreve. Tabela vazia obriga a pessoa a saber de cabeca o nome
-- das colunas e o valor de `platform` para montar um `INSERT`; duas linhas
-- prontas transformam o ato em `UPDATE ... SET minimum_version = '1.4.0'`.
--
-- COMO SE LIGA (sem deploy, com a API de pe):
--
--   UPDATE app_version_policy
--      SET minimum_version = '1.4.0', updated_by = 'quem fez'
--    WHERE platform = 'android';
--
-- COMO SE DESTRAVA A BASE (a emergencia: numero errado publicado). UM comando,
-- UMA coluna, SEM reiniciar nada:
--
--   UPDATE app_version_policy SET minimum_version = NULL WHERE platform = 'android';
--
-- MEDIDO em 19/10/2026, na pilha efemera, com a API de pe e sem reinicio: a
-- mesma versao `0.0.1` que recebia `update_required` passou a receber
-- `update_recommended` na requisicao SEGUINTE. Ou seja: o BLOQUEIO sai na hora.
--
-- E o `recommended_version` CONTINUA valendo -- a faixa dispensavel segue
-- aparecendo. Isso esta escrito aqui porque a medicao mostrou, e nao porque
-- alguem deduziu: quem destrava as pressas provavelmente quer o mecanismo
-- INTEIRO calado, e para isso sao duas colunas:
--
--   UPDATE app_version_policy
--      SET minimum_version = NULL, recommended_version = NULL
--    WHERE platform = 'android';
--
-- E o jeito que nao da para fazer pela metade, que e apagar a linha:
--
--   DELETE FROM app_version_policy WHERE platform = 'android';
--
-- Medido tambem: com a linha apagada, `0.0.1` recebe `supported`.
--
-- A ausencia e que libera, em toda forma que a ausencia tem: coluna nula,
-- linha apagada, tabela inalcancavel. Nao existe caminho em que a falta de
-- informacao bloqueie alguem -- ver o cabecalho de
-- `app-release/adapters/http/version-status-routes.ts`.
--
-- ====================================================================
-- NENHUM `CHECK` EXISTENTE E REESCRITO
-- ====================================================================
--
-- Esta migracao so CRIA. Ela nao toca restricao, coluna nem tabela que ja
-- exista, entao nao ha o que provar em `BEGIN`/`ROLLBACK` sobre dado
-- preexistente: nao ha dado preexistente.

-- Up Migration

CREATE TABLE app_version_policy (
  -- A plataforma e a chave. Politica por plataforma e requisito, nao
  -- generalidade: hoje so o Android e publicado (decisao do cliente de
  -- 23/09) e o iOS esta DORMENTE, nao apagado. Com uma politica unica, ligar
  -- o bloqueio para o Android bloquearia tambem o build de provisionamento
  -- gratuito que e instalado por cabo -- e naquele build "va para a loja" e
  -- uma instrucao impossivel.
  platform text PRIMARY KEY
    CONSTRAINT app_version_policy_platform_check CHECK (platform IN ('android', 'ios')),

  -- Abaixo desta versao o aplicativo FECHA. Nula = ninguem e bloqueado.
  --
  -- O `CHECK` e o mesmo formato que `AppVersion` do contrato cobra na
  -- requisicao, e ele esta aqui porque e AQUI que a mao humana escreve.
  -- `'1.10'`, `'v1.10.0'`, `'1.10.0-rc1'` e `' 1.10.0'` sao recusados no
  -- `UPDATE`, com a politica anterior intacta e a API de pe.
  minimum_version text
    CONSTRAINT app_version_policy_minimum_version_check
    CHECK (minimum_version ~ '^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$'),

  -- A versao a partir da qual o aplicativo so AVISA, de forma dispensavel.
  -- Nula = nenhum aviso. Separada de `minimum_version` porque os dois estados
  -- sao coisas diferentes: um fecha o produto, o outro e um bilhete.
  recommended_version text
    CONSTRAINT app_version_policy_recommended_version_check
    CHECK (recommended_version ~ '^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$'),

  -- Para onde o botao manda. **Nula hoje, e a nulidade e o estado real**: nao
  -- ha loja (o APK vai por arquivo, o iOS por cabo). Nula, o aplicativo nao
  -- desenha botao nenhum.
  --
  -- O `CHECK` exige `https://` e recusa espaco: um endereco de loja digitado
  -- as pressas com `http://` ou com espaco no fim abriria o navegador em
  -- lugar nenhum, e a pessoa bloqueada ficaria sem saida.
  store_url text
    CONSTRAINT app_version_policy_store_url_check
    CHECK (store_url ~ '^https://[^[:space:]]+$' AND length(store_url) <= 300),

  -- Quem mexeu e quando. Nao e auditoria (a trilha vive em `audit.events`); e
  -- o minimo para quem chega depois de uma tranca acidental saber a quem
  -- perguntar. Texto livre de proposito: quem escreve esta no `psql`, nao no
  -- painel, e nao tem conta nenhuma a que se vincular.
  updated_by text
    CONSTRAINT app_version_policy_updated_by_check CHECK (length(updated_by) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE app_version_policy IS
  'Politica de versao minima do aplicativo. Linha ausente ou minimum_version nula NAO bloqueia ninguem. DESTRAVAR A BASE: UPDATE app_version_policy SET minimum_version = NULL WHERE platform = ''android''; (o aviso brando segue valendo). DESLIGAR TUDO: DELETE FROM app_version_policy WHERE platform = ''android'';';
COMMENT ON COLUMN app_version_policy.minimum_version IS
  'Abaixo desta versao o app fecha. NULA = ninguem bloqueado. Formato MAIOR.MENOR.CORRECAO, cobrado pelo CHECK na escrita.';
COMMENT ON COLUMN app_version_policy.recommended_version IS
  'A partir desta versao o app so avisa, de forma dispensavel. NULA = nenhum aviso.';
COMMENT ON COLUMN app_version_policy.store_url IS
  'Destino do botao da tela de bloqueio. NULA enquanto nao houver loja; nula, o app nao desenha botao.';

-- As duas linhas, com o mecanismo DESLIGADO. `ON CONFLICT DO NOTHING` nao
-- esta aqui: a tabela acabou de nascer, e um conflito aqui seria sinal de que
-- esta migracao rodou duas vezes -- que e coisa que precisa estourar, nao
-- coisa que se engole.
INSERT INTO app_version_policy (platform, updated_by)
VALUES ('android', 'migracao 20261019000007'),
       ('ios', 'migracao 20261019000007');

-- Down Migration

DROP TABLE app_version_policy;
