-- SEC-021 -- a localizacao de referencia passa a ser DO APARELHO, e some quando
-- aquele aparelho sai da conta.
--
-- ====================================================================
-- O DEFEITO, E POR QUE ELE NAO ERA UM ESQUECIMENTO
-- ====================================================================
--
-- ADR-0010, tabela "Retencao, por dado", linha "Localizacao de referencia do
-- usuario": "sem historico; apagada ao sair da conta E ao excluir a conta".
-- Metade dessa promessa esta cumprida desde 22/09: a migracao 20260922000006
-- poe um gatilho em `users` que apaga a linha no instante da exclusao logica. A
-- outra metade -- "ao sair da conta" -- nunca foi cumprida, e nao por descuido:
-- ela era INEXPRIMIVEL no esquema.
--
-- `sair()` e por APARELHO (ADR-0002, emenda 1, secao 1: "Sair deste aparelho
-- NAO empurra `sessions_invalid_before`... Quem sai no celular da recepcao do
-- pet shop nao esta pedindo para cair da propria casa"). A localizacao era por
-- PESSOA -- `user_id` era a chave primaria inteira de
-- `user_reference_locations`. Apagar no logout do tablet tiraria do alerta quem
-- continua logado no celular, e nao apagar deixa a promessa do ADR-0010 sem
-- cumprir. Nao havia forma certa de escrever o `DELETE`, porque a pergunta "a
-- localizacao de QUEM?" tinha uma resposta so e o verbo tinha outra.
--
-- ====================================================================
-- A DECISAO DO CLIENTE, EM 23/09/2026
-- ====================================================================
--
-- "A localizacao deveria ser por aparelho."
--
-- Isso nao e um ajuste do apagamento: e uma troca de DONO. A linha deixa de
-- pertencer a pessoa e passa a pertencer a sessao de um aparelho, e e por isso
-- que ela e uma migracao e nao um `DELETE` a mais no codigo do logout.
--
-- ====================================================================
-- COMO O APARELHO E IDENTIFICADO, E POR QUE NAO PELA TABELA QUE TEM `id`
-- ====================================================================
--
-- A escolha e a FAMILIA DE REFRESH (`refresh_tokens.family_id`), que e o mesmo
-- valor que o ADR-0002 emenda 1 secao 2 ja poe no `sid` do token de acesso.
-- Duas razoes, e a segunda e a que fecha:
--
-- 1. **E o que `sair()` ja tem na mao.** O logout revoga a familia do refresh
--    apresentado (`revogarFamilia(familia, 'logout', agora)`). Chavear a
--    localizacao pela familia faz o apagamento ser o mesmo predicado da
--    revogacao, e nao um segundo predicado que precisa concordar com o
--    primeiro. A renovacao NAO troca a familia ("a renovacao continua na MESMA
--    familia", auth-service), entao a chave e estavel pela vida da sessao.
--
-- 2. **`user_devices` NAO SERVE, e isso foi medido, nao suposto.** Aquela
--    tabela tem `id`, mas:
--      * ela NAO tem coluna que ligue a linha a uma familia de refresh, entao
--        nao ha como, a partir do logout, saber QUAL linha de `user_devices`
--        corresponde ao aparelho que esta saindo;
--      * a identidade de um aparelho ALI e o proprio `push_token`
--        (`DeviceRegistration` nao carrega identificador de instalacao -- esta
--        escrito no cabecalho da 20260922000003_aparelho-e-token-de-push), e o
--        token e `NULL` de forma legitima e frequente (iOS antes do APNs, e
--        quem negou a permissao, que o ADR-0008 manda registrar);
--      * o app descarta o `Device.id` que a resposta devolve, entao ele nao
--        volta em requisicao nenhuma.
--    Usar `user_devices.id` aqui exigiria INVENTAR uma segunda identidade de
--    aparelho e depois faze-la concordar com a primeira. Duas identidades para
--    a mesma coisa divergem, e a divergencia aqui significa localizacao que
--    sobrevive ao logout OU alerta que some de quem continua logado.
--
-- `refresh_tokens.family_id` NAO E chave estrangeira aqui, e a ausencia e
-- deliberada: `family_id` e coluna de `refresh_tokens`, nao chave de uma tabela
-- `refresh_families` -- essa tabela nao existe, e uma familia e o CONJUNTO de
-- linhas que compartilham o valor. Nao ha alvo para referenciar. O que segura a
-- integridade e o `ON DELETE CASCADE` de `user_id`, que ja estava aqui, mais o
-- apagamento explicito no logout.
--
-- ====================================================================
-- O QUE MUDA PARA QUEM USA DOIS APARELHOS
-- ====================================================================
--
-- Passa a haver DUAS linhas para a mesma pessoa, com DUAS regioes de
-- referencia. E o comportamento novo, e e o que foi pedido: quem tem o tablet
-- em casa e o celular no trabalho passa a ser alcancavel por caso aberto perto
-- de QUALQUER um dos dois lugares, em vez de so do ultimo que informou.
--
-- **A pessoa continua recebendo UM aviso por caso.** A consulta de alcance
-- (`kysely-alcance-por-postgis.ts`) passou a agrupar por `user_id` nesta mesma
-- entrega, e o motivo esta la: sem o agrupamento, duas linhas dentro do raio
-- devolveriam a pessoa DUAS vezes, ela receberia o mesmo alerta em duplicata,
-- gastaria dois dos tres lugares do teto de fadiga de 24 h e ocuparia dois dos
-- 500 lugares do teto de destinatarios -- tirando outro tutor do alerta.
--
-- **O que esta entrega NAO faz, e precisa estar dito:** o aviso continua indo
-- para TODOS os aparelhos da conta, e nao so para o aparelho cuja regiao casou.
-- Rotear por aparelho exigiria ligar a linha de `user_devices` a familia de
-- refresh, que e exatamente a coluna que aquela tabela nao tem. Enquanto isso
-- nao existir, quem esta em casa recebe no celular o aviso de um caso aberto
-- perto do trabalho. Isso e MAIS alcance do que hoje, nunca menos.
--
-- ====================================================================
-- AS LINHAS QUE JA EXISTEM SAO APAGADAS, E ISSO NAO E PERDA DISFARCADA
-- ====================================================================
--
-- A coluna nasce `NOT NULL` e as linhas de hoje nao tem familia. As tres saidas
-- possiveis:
--
--   a. inventar um valor -- proibido: `family_id` inventado nao casa com
--      revogacao nenhuma, entao a linha nunca seria apagada por logout algum.
--      Seria uma localizacao imortal com aparencia de linha correta;
--   b. deixar a coluna anulavel -- reintroduz "linha sem dono" e obriga toda
--      consulta futura a lembrar de um predicado, que e a forma de falhar que
--      as duas migracoes anteriores desta tabela recusaram por escrito;
--   c. apagar as linhas.
--
-- (c), e ela nao contraria o ADR-0010: apagar localizacao de referencia e
-- exatamente a direcao que aquele documento pede em toda duvida (minimizacao,
-- art. 6, III). Nada se perde que o produto nao refaca sozinho -- o app reenvia
-- a localizacao na proxima abertura, e `PUT /v1/me/location` e idempotente. O
-- custo e um intervalo em que a pessoa nao esta na base de alerta, e ele e
-- menor que o de qualquer uma das outras duas saidas.

-- Up Migration

-- Sem historico e sem valor inventado: ver o bloco acima.
DELETE FROM user_reference_locations;

ALTER TABLE user_reference_locations
  ADD COLUMN session_family_id uuid NOT NULL;

-- A CHAVE PRIMARIA E O PAR, e e ela que torna o comportamento novo uma
-- propriedade do esquema em vez de disciplina de aplicacao -- mesmo argumento
-- que a 20260922000002 usou para fazer `user_id` sozinho ser a PK ("a regra
-- 'uma unica linha por usuario, sempre a ultima, sem historico' vira CHAVE
-- PRIMARIA"). A regra hoje e outra: uma unica linha por SESSAO DE APARELHO,
-- sempre a ultima, sem historico. O par a exprime; `user_id` sozinho a
-- contradiz.
ALTER TABLE user_reference_locations
  DROP CONSTRAINT user_reference_locations_pkey;

ALTER TABLE user_reference_locations
  ADD CONSTRAINT user_reference_locations_pkey
  PRIMARY KEY (user_id, session_family_id);

-- O apagamento do logout procura POR FAMILIA, sem o dono: `sair()` chega com a
-- familia do refresh que apresentou. O indice existe para que esse `DELETE` nao
-- varra a tabela no caminho mais comum do produto.
CREATE INDEX user_reference_locations_por_familia
  ON user_reference_locations (session_family_id);

COMMENT ON COLUMN user_reference_locations.session_family_id IS
  'SEC-021: a familia de refresh (refresh_tokens.family_id, o mesmo valor do `sid` do token de acesso -- ADR-0002 emenda 1) que informou esta localizacao. E o que torna a localizacao DO APARELHO e nao da pessoa, decisao do cliente em 23/09/2026. Nao e chave estrangeira porque nao existe tabela de familias: uma familia e o conjunto de linhas de refresh_tokens com o mesmo valor. O logout apaga por esta coluna.';

COMMENT ON TABLE user_reference_locations IS
  'SEC-021: onde cada APARELHO da conta esta, aproximadamente, para a consulta de raio. Uma linha por (conta, sessao de aparelho), sempre a ultima, sem historico. Quantizada antes de gravar e com validade de 30 dias (ADR-0010). Apagada quando aquele aparelho sai da conta e quando a conta e excluida.';

-- Down Migration

DROP INDEX IF EXISTS user_reference_locations_por_familia;

-- A descida tambem esvazia a tabela, e pelo mesmo motivo da subida ao contrario:
-- com o par como chave uma pessoa pode ter duas linhas, e voltar `user_id` a ser
-- a chave primaria sozinho falharia na primeira conta que tiver duas. Escolher
-- qual das duas sobrevive seria escolher em qual regiao a pessoa mora, que nao
-- e decisao de uma migracao de descida.
DELETE FROM user_reference_locations;

ALTER TABLE user_reference_locations
  DROP CONSTRAINT user_reference_locations_pkey;

ALTER TABLE user_reference_locations
  DROP COLUMN session_family_id;

ALTER TABLE user_reference_locations
  ADD CONSTRAINT user_reference_locations_pkey PRIMARY KEY (user_id);
