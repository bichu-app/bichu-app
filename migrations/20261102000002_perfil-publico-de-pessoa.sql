-- O PERFIL PUBLICO DA PESSOA (decisao do cliente, 02/11/2026).
--
-- Literal dele, as duas frases que decidem este arquivo:
--
--   1. *"desligado por padrao e o usuario habilita"*;
--   2. *"nao tem relacao com permissoes dentro do sistema, apenas de
--      visibilidade"* -- ele exibe as informacoes da pessoa, e o perfil e os
--      posts dela podem aparecer para outras pessoas.
--
-- A segunda frase e a mais importante para quem mexer nisto depois: **esta
-- coluna NAO e capacidade e nao entra na matriz de capacidades**
-- (`src/shared/autorizacao/matriz-de-capacidades.ts`). Ela nao libera nem
-- bloqueia NADA que a pessoa faz; ela decide o que OUTROS veem. O cliente
-- separou as duas coisas explicitamente, e a separacao esta no codigo em dois
-- arquivos diferentes para que ninguem as confunda depois.
--
-- ## POR QUE A COLUNA E NOVA
--
-- Nao existe perfil publico de PESSOA neste banco. `public_profile_enabled`
-- existe, mas so em `pets` (migracao `20260917000006`, linha 103), e pet e
-- pessoa sao dois cadastros -- ADR-0010 item 7 trata deles separadamente, e
-- juntar os dois numa coluna faria o perfil da pessoa acender junto com o do
-- pet dela.
--
-- **Nao reaproveitei `region_listing_opted_in_at`**, a adesao que a frente da
-- listagem por regiao esta criando no MESMO dia: ela responde *"quero aparecer
-- na lista da minha regiao?"*, e esta responde *"meu perfil e visivel?"*. Sao
-- duas perguntas, e a segunda e mais ampla -- vale para o perfil e para os
-- posts, nao para uma listagem. **Isso precisa de coordenacao humana e nao de
-- palpite meu:** o cliente refinou em 02/11/2026 que o que coloca a pessoa na
-- listagem e **foto + perfil publico**, e se as duas colunas subirem como
-- estao havera DUAS adesoes para o mesmo ato. Nao decidi isso aqui, e esta
-- escrito para que a decisao seja tomada por quem pode toma-la.
--
-- ## POR QUE `boolean`, E NAO INSTANTE
--
-- A casa escreve adesao de DUAS formas, e as duas tem precedente:
-- `email_verified_at` e `accepted_terms_at` sao instantes; `pets.public_profile_enabled`
-- e `email_deliverable` sao booleanos. Para ESTA coluna o precedente que manda e
-- `pets.public_profile_enabled`: mesmo nome, mesmo significado, mesma pergunta
-- ("este perfil e publico?"), e dois tipos para o mesmo nome nos dois cadastros
-- seriam duas respostas para uma pergunta -- o jeito de um dia projetar o pet em
-- booleano e a pessoa em data e descobrir pela tela.
--
-- **DESLIGADO POR PADRAO, e isso e a decisao e nao o default do tipo:** `false`
-- e o valor de toda linha que ja existe e de toda linha nova. Nenhuma conta fica
-- visivel por esta migracao.
--
-- `ADD COLUMN` com `DEFAULT` constante nao reescreve a tabela desde o
-- PostgreSQL 11: o valor fica no catalogo e as linhas nao sao tocadas.
--
-- ## O `CHECK`, E ELE E O PRECEDENTE DO PET APLICADO INTEIRO
--
-- `pets` tem `CONSTRAINT pets_perfil_publico_exige_slug CHECK (NOT
-- public_profile_enabled OR slug IS NOT NULL)`, com o motivo escrito la: *"Perfil
-- publico ligado sem slug e um estado sem endereco: `/@{slug}` e a unica forma de
-- alcanca-lo."*
--
-- **A mesma forma transfere, e transfere literalmente**, porque `users.handle`
-- **E uma coluna de `users`** (migracao `20261018000021`, `citext` anulavel com FK
-- para `handles`) -- nao esta so na tabela `handles`, e por isso o `CHECK` cabe na
-- propria tabela e nao precisa de gatilho. E o endereco e o mesmo tipo de
-- endereco: a unica rota que serve o perfil de uma pessoa e
-- `getPersonProfile`, em `GET /v1/people/{handle}`. Perfil publico ligado sem
-- apelido e um perfil que ninguem tem como pedir.
--
-- `NOT public_profile_enabled OR handle IS NOT NULL` passa para TODA linha
-- existente, porque o default e `false` -- a restricao nasce satisfeita e nao ha
-- carga de dado.
--
-- **O apelido e anulavel e continua anulavel:** nenhum fluxo obriga a escolher
-- apelido (plano 4-C.8), e o `CHECK` nao o torna obrigatorio -- ele torna
-- obrigatorio o apelido de quem LIGA o perfil publico. Quem nao tem apelido
-- recebe `400` no servidor, com o campo nomeado, em vez de um erro de banco.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao cria indice.** Nao ha consulta que filtre por esta coluna ainda: a
--   listagem e de outra frente, e criar o indice dela aqui seria criar objeto
--   para uma consulta que este trabalho nao escreve.
-- - **Nao poe nesta coluna a marca de "reservada ao servidor".** Ela SAI para o
--   DONO, em `Me.public_profile_enabled`, e marca-la faria
--   `portao-colunas-que-nao-saem` reprovar essa projecao legitima.
--
--   **E a frase-marca daquele portao nao aparece em lugar nenhum deste arquivo,
--   nem negada**, e isso e medido e nao estilo: `lerColunasQueNaoSaem` procura a
--   frase no corpo de cada `COMMENT ON COLUMN` com uma expressao regular e **nao
--   le polaridade** -- "esta coluna NAO e marcada como <frase>" marca a coluna.
--   Aconteceu na primeira versao deste arquivo: o portao reprovou dez lugares, e
--   como ele casa apenas o NOME da coluna, levou `pets.public_profile_enabled`
--   junto, numa tabela que esta migracao nem toca.
-- - **Nao abre superficie nenhuma para terceiro.** `getPersonProfile` continua
--   respondendo exatamente o que respondia; ligar a visibilidade nas leituras
--   de terceiro e trabalho da frente que as serve, com a regra em
--   `people/domain/perfil-publico-de-pessoa.ts`.
-- - **Nao toca `src/modules/publications` nem a audiencia do Mural.** O PR #147
--   abriu o Mural para todo verificado sem olhar perfil publico; o ajuste e
--   daquela frente, e mexer aqui produziria conflito numa lista que dois lados
--   editam.
--
-- ## SOBRE O `down`
--
-- A descida apaga a escolha de quem LIGOU o perfil publico, e nao ha onde
-- recolhe-la: nenhuma outra coluna deste banco registra essa decisao. Por isso
-- ela RECUSA quando ha perfil ligado, nomeando quantas contas -- descer e subir
-- de novo deixaria todas essas pessoas INVISIVEIS sem que nenhuma soubesse, e
-- religar e decisao de cada uma.
--
-- `RAISE EXCEPTION`, e nunca `RAISE NOTICE`: `node-pg-migrate` **DESCARTA**
-- `NOTICE` e `WARNING`, entao um aviso aqui nao chegaria a ninguem e a descida
-- concluiria apagando a coluna.

-- Up Migration

ALTER TABLE users
  ADD COLUMN public_profile_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE users
  ADD CONSTRAINT users_perfil_publico_exige_apelido
  CHECK (NOT public_profile_enabled OR handle IS NOT NULL);

COMMENT ON COLUMN users.public_profile_enabled IS
  'O PERFIL PUBLICO DA PESSOA (decisao do cliente, 02/11/2026: "desligado por padrao e o usuario habilita"). NAO E CAPACIDADE, E VISIBILIDADE -- ele mesmo: "nao tem relacao com permissoes dentro do sistema, apenas de visibilidade". Nao libera nem bloqueia nada que a pessoa FAZ; decide o que outros VEEM dela (o perfil e os posts). A matriz de capacidades esta em src/shared/autorizacao/matriz-de-capacidades.ts e esta coluna NAO entra nela, de proposito: o cliente separou as duas coisas, e a separacao mora em dois arquivos para que ninguem as confunda. false e o valor de toda linha que ja existia e de toda linha nova -- nenhuma conta ficou visivel pela migracao. boolean e nao instante pelo precedente de pets.public_profile_enabled, que tem o MESMO nome e a MESMA pergunta: dois tipos para o mesmo nome nos dois cadastros seriam duas respostas para uma pergunta. SAI para o DONO em Me.public_profile_enabled, e por isso ela NAO leva a marca de coluna reservada ao servidor -- a frase-marca de portao-colunas-que-nao-saem esta FORA deste comentario de proposito, porque aquele portao a casa por substring e nao le negacao: escreve-la aqui, mesmo negada, marcaria a coluna e reprovaria a projecao legitima (e, como ele casa so o NOME da coluna, reprovaria pets.public_profile_enabled junto). A regra de quem APARECE em listagem de pessoas e foto + perfil publico (cliente, 02/11/2026) e vive em src/modules/people/domain/perfil-publico-de-pessoa.ts -- esta coluna e metade dessa regra, nunca ela toda. Nao confundir com users.region_listing_opted_in_at, a adesao da listagem por regiao: se as duas existirem, sao DUAS adesoes para o mesmo ato e isso precisa de decisao humana.';

COMMENT ON CONSTRAINT users_perfil_publico_exige_apelido ON users IS
  'Perfil publico ligado sem apelido e um estado sem endereco: GET /v1/people/{handle} (getPersonProfile) e a unica rota que serve o perfil de uma pessoa, e sem handle ninguem tem como pedi-lo. E o MESMO motivo e a MESMA forma de pets_perfil_publico_exige_slug, e a forma transfere porque users.handle E coluna de users (migracao 20261018000021) e nao so linha de handles -- logo cabe num CHECK de tabela e nao precisa de gatilho. NAO torna o apelido obrigatorio: nenhum fluxo obriga a escolher apelido (plano 4-C.8), e esta restricao so o exige de quem LIGA o perfil publico. O servidor recusa antes, com 400 e o campo nomeado, para que a pessoa veja um erro de campo e nao um erro de banco. Nasce satisfeita por toda linha existente, porque o default da coluna e false.';

-- Down Migration

-- A descida apaga a escolha de quem ligou o perfil publico, e nao ha onde
-- recolhe-la: nenhuma outra coluna deste banco registra essa decisao. Por isso
-- ela RECUSA quando ha perfil ligado. `RAISE EXCEPTION` e nao `NOTICE`, porque
-- `node-pg-migrate` descarta `NOTICE`.
DO $$
DECLARE
  ligados bigint;
BEGIN
  SELECT count(*) INTO ligados
    FROM users
   WHERE public_profile_enabled;

  IF ligados > 0 THEN
    RAISE EXCEPTION
      'a descida apagaria o perfil publico de % conta(s), e nao ha onde recolhe-lo: nenhuma outra coluna registra a escolha. Descer e subir de novo deixaria todas essas pessoas INVISIVEIS sem que nenhuma soubesse, e religar e decisao de cada uma. Decida o que fazer com as escolhas ANTES de descer',
      ligados;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT users_perfil_publico_exige_apelido;

ALTER TABLE users DROP COLUMN public_profile_enabled;
