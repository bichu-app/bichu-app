-- DUAS DECISOES DO CLIENTE DE 18/10/2026, NUMA MIGRACAO SO.
--
-- 1. **A data de nascimento**, e com ela o PRIMEIRO freio de idade do produto
--    (verbatim: *"coloque maiores de 16 anos"*);
-- 2. **O apelido (`@`)**, identificador escolhido e unico (verbatim: *"o
--    apelido esta livre, vai estar no cadastro do usuario e na pagina de
--    edicao do perfil"*).
--
-- **Por que num carimbo so, e nao em dois:** as duas acrescentam coluna em
-- `users`, e `ALTER TABLE` separado toma o mesmo `ACCESS EXCLUSIVE` duas
-- vezes. Mais importante, os carimbos deste repositorio sao recurso disputado
-- -- cinco colisoes em 18/10/2026, de sessoes que nao se enxergam -- e dois
-- arquivos onde um basta e um carimbo a mais no caminho de outro agente.
--
-- O carimbo foi conferido **das duas formas** antes de ser escolhido, porque o
-- portao (`verificar-carimbo-de-migracao.mjs`) le **so as refs** e nao ve
-- arquivo nao comitado de outro agente: (a) `git log --all` sobre
-- `migrations/`, e (b) `ls migrations/` nos 143 worktrees em disco. Os dois
-- deram `20261018000004` como o ultimo tomado.
--
-- ====================================================================
-- ANTES DESTA MIGRACAO NAO HAVIA FREIO NENHUM -- MEDIDO, NAO SUPOSTO
-- ====================================================================
--
-- Varrido em 18/10/2026 contra `e636f69c`:
--
-- 1. **nenhuma coluna de idade em `users`**. As 22 colunas da tabela foram
--    lidas no banco de homologacao e nao ha nada de nascimento entre elas. O
--    unico `birth_date_approx` do repositorio e de **pets**
--    (`20260917000006_pets.sql`), e e do animal, nao da pessoa;
-- 2. **nenhum campo no contrato**. `RegisterRequest` declarava
--    `[email, password]` em `required` e cinco propriedades, nenhuma de idade;
-- 3. **nenhum campo na tela**. `app/lib/telas/conta/tela_criar_conta.dart`
--    tem tres campos -- Nome, E-mail, Senha -- e a caixa dos termos.
--
-- E a nossa propria politica de privacidade **confessava isso por escrito**,
-- no item 10: *"Hoje o cadastro nao confere a idade."* Era verdade.
--
-- ====================================================================
-- ANULAVEL, E ISSO NAO E FROUXIDAO
-- ====================================================================
--
-- `NOT NULL` aqui quebraria as **7 contas que existem em homologacao**
-- (contadas em 18/10/2026, todas com `status = 'active'`): nenhuma delas tem
-- data de nascimento, porque a coluna nao existia quando elas nasceram.
-- `ALTER TABLE ... ADD COLUMN ... NOT NULL` sem `DEFAULT` reprova na hora numa
-- tabela com linha, e com `DEFAULT` seria pior: inventaria uma data de
-- nascimento para sete pessoas reais e o banco passaria a afirmar uma idade
-- que ninguem declarou.
--
-- **Entao a obrigatoriedade mora no CADASTRO, nao na coluna**, e as duas
-- coisas sao diferentes: o contrato exige `birth_date` em `RegisterRequest`
-- (quem cria conta a partir de hoje precisa dela) e a coluna aceita `NULL`
-- (quem ja tem conta continua entrando). Conta antiga sem data **nao muda de
-- comportamento** -- essa foi a opcao implementada, e as outras duas que
-- estavam na mesa (cobrar no proximo acesso, travar acao ate preencher) sao
-- decisao do cliente e nao foram feitas.
--
-- ====================================================================
-- O `CHECK` PEGA O ABSURDO, E **NAO** PEGA O FUTURO -- DITO EM VOZ ALTA
-- ====================================================================
--
-- O piso de 1900 esta aqui. O teto "nao pode ser no futuro" **nao esta**, e a
-- ausencia e tecnica e nao esquecimento: o Postgres recusa funcao nao-IMMUTABLE
-- em `CHECK` (*"functions in check constraint must be marked IMMUTABLE"*), e
-- `now()`/`CURRENT_DATE` sao STABLE. Nao existe forma de escrever "menor que
-- hoje" num `CHECK`, e inventar um gatilho para isso seria uma segunda fonte da
-- regra de idade -- que ja mora em `idade-minima.ts`, com o fuso do produto.
--
-- **Quem recusa data futura e o servidor**, em `verificarDataDeNascimento`, e e
-- de la que vem a recusa que a pessoa le. O `CHECK` daqui cobre o que o
-- servidor nao alcanca: escrita por script, por `psql` e por migracao futura.
-- Dois niveis com alcances diferentes, e nao duas copias da mesma regra.
--
-- O piso de 1900 e deliberadamente largo. Ele nao e a regra de idade minima: e
-- a recusa do que nao e data de nascimento de ninguem (`0001-05-03`, o ano
-- digitado errado por quatro digitos). A pessoa mais velha de que se tem
-- registro nasceu em 1875, e um piso apertado aqui recusaria gente viva por
-- causa de uma estimativa nossa.
--
-- ====================================================================
-- ESTA COLUNA NAO LEVA A MARCA `NUNCA sai do servidor`, E O MOTIVO E O PORTAO
-- ====================================================================
--
-- Ela **nao sai em resposta nenhuma** -- isso e verdade e esta conferido
-- abaixo. Mas a marca nao e o instrumento certo, pela MESMA razao escrita na
-- `20261017000015` para `directory_suggestions.postal_code`:
-- `src/tools/portao-colunas-que-nao-saem.ts` varre o nome literal da coluna
-- marcada em `components` INTEIRO do contrato, e nao distingue entrada de
-- saida. `RegisterRequest.birth_date` e corpo de REQUISICAO e vive em
-- `components/schemas` -- marcar a coluna reprovaria o cadastro que esta
-- migracao existe para criar. Portao reprovando o fluxo correto e portao que
-- alguem desliga.
--
-- O que guarda esta coluna sao tres fatos, e nenhum deles e boa vontade:
--
-- 1. **nenhuma resposta do contrato declara `birth_date`.** `Me`, `MeUpdate` e
--    `RegisterResponse` nao a tem, e nao ha operacao de leitura dela;
-- 2. **a consulta nao a seleciona.** `kysely-identity-repository.ts` lista as
--    colunas de `users` uma a uma (nao ha `select('*')` em `users`), e
--    `birth_date` nao entrou em nenhuma lista de leitura -- so na escrita do
--    cadastro;
-- 3. **o tipo `Conta` nao a carrega.** O que atravessa a borda e `Conta`, e
--    acrescentar a data la seria a mudanca que os dois portoes de vazamento
--    (`verificar-colunas-que-nao-saem`, `verificar-contrato-publico`) pegam.
--
-- **Por que isso importa mais aqui do que em outra coluna:** com idade minima
-- de 16, o titular PODE ser adolescente, e data de nascimento de adolescente
-- junto com nome e bairro e material de identificacao de menor. Ela entra para
-- ser CONFERIDA no cadastro, nao para ser exibida.

-- Up Migration

ALTER TABLE users
  ADD COLUMN birth_date date
  CONSTRAINT users_birth_date_nao_absurda
  CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01');

COMMENT ON COLUMN users.birth_date IS
  'A data de nascimento declarada no cadastro, para conferir a idade minima de 16 anos (decisao do cliente de 18/10/2026). ANULAVEL de proposito: as 7 contas que ja existiam em 18/10/2026 nasceram sem a coluna, e NOT NULL as quebraria -- a obrigatoriedade mora em RegisterRequest.required, nao aqui. O CHECK pega o absurdo (ano antes de 1900) e NAO pega data futura: o Postgres recusa funcao nao-IMMUTABLE em CHECK, e quem recusa o futuro e o servidor, em shared/idade/idade-minima.ts, com o fuso America/Sao_Paulo. NAO SAI EM RESPOSTA NENHUMA: nenhum schema de resposta a declara, a consulta de leitura nao a seleciona e o tipo Conta nao a carrega. SEM A MARCA do portao de colunas de saida, de proposito: aquele portao varre o nome literal da coluna em components INTEIRO do contrato e em todo .ts de src/, e nao distingue entrada de saida -- marcar esta coluna reprovaria RegisterRequest.birth_date, que e corpo de REQUISICAO, e reprovaria pets.birth_date_approx por conter o mesmo texto. Ver o cabecalho desta migracao: o que guarda esta coluna sao tres fatos, nao uma marca.';

-- ====================================================================
-- 2. O APELIDO (`@`): `handles` E O ESPACO DE NOMES, E ELE E COMPARTILHADO
-- ====================================================================
--
-- Decisao do cliente de 18/10/2026: *"o apelido esta livre, vai estar no
-- cadastro do usuario e na pagina de edicao do perfil"*, e antes dela
-- *"slug nao tem relacao com informacoes pessoais, e um id que o usuario
-- escolhe e voce deve verificar para garantir que nao tem dois iguais"*.
--
-- **Medido antes de escrever:** `users` nao tinha coluna de apelido, e a unica
-- coluna de slug do repositorio e `pets.slug` (`20260917000006`), do ANIMAL.
-- Em homologacao, 18/10/2026: 6 pets, **0 com slug** -- a operacao que define
-- slug de pet nao esta implementada.
--
-- **POR QUE UMA TABELA E NAO UMA COLUNA COM INDICE UNICO.** O site publica o
-- pet em `/@{slug}` (ADR-0028) e o `@` e **um simbolo so** para quem le:
-- `@bidu` nao pode ser um pet para um leitor e uma pessoa para outro. Dois
-- indices unicos em duas tabelas nao conversam, e nada impediria a coexistencia
-- -- o espaco de nomes precisa de **um** lugar onde a unicidade acontece.
--
-- `handles` e esse lugar, e ela hospeda as tres especies de `kind`: `pessoa`,
-- `pet` e `reservado`. As reservadas moram aqui, e nao numa lista no codigo,
-- por uma razao concreta: lista em `src/` nao impede o `INSERT` por `psql`,
-- por script de carga nem por migracao futura.
--
-- **O ESQUELETO E O INDICE QUE TRABALHA.** `@maria-silva`, `@mariasilva` e
-- `@mar1a-silva` nao podem coexistir, e unicidade de texto nao os separa.
-- `handle_esqueleto` tira o hifen e colapsa os parecidos.
--
-- **ATENCAO, DIVERGENCIA DO DESENHO, E ELA E DELIBERADA:** o plano
-- (`9d99ac0f`) escreve o mapa como `0->o`, `1->l`, `5->s`, `3->e`, e **esse
-- mapa sozinho NAO produz a colisao que o proprio plano exige**: com ele,
-- `mar1a` vira `marla` e `maria` fica `maria`, e os dois coexistiriam. Para o
-- invariante escrito valer, **`i` tambem colapsa em `l`** -- e a funcao abaixo
-- faz isso. O mapa real e por GRUPO de parecidos: `{0,o}`, `{1,i,l}`, `{5,s}`,
-- `{3,e}`. Custo dito em voz alta: `@lia` e `@l1a` e `@iia` passam a ser o
-- mesmo apelido, o que recusa alguns apelidos legitimos a mais. Sem isso, a
-- isca de `@mar1a-silva` do plano nao passa.
--
-- **A FAIXA E A MESMA NOS TRES LUGARES**, e esta casa ja pagou por nao ser: o
-- recado do achado aceitava 1000 no contrato e a coluna recusava acima de 500,
-- e a pessoa recebia erro de servidor em vez de recusa explicada. Aqui:
-- `CHECK` com `^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$` nesta migracao,
-- `minLength: 5` + `maxLength: 20` + o MESMO `pattern` no contrato, e o MESMO
-- regex em `app/lib/formato/apelido.dart`.
--
-- **O teto de 20 e do apelido NORMALIZADO, e por construcao ele e identico ao
-- digitado**: o conjunto e ASCII restrito, normalizar e so minusculo e aparo,
-- e maiuscula->minuscula e um para um. Conferido no codigo dos tres lados.
--
-- **NAO HA ROTA DE "ESTA DISPONIVEL?"**, e a ausencia e a decisao: ela deixaria
-- varrer a base. A disponibilidade e decidida **no envio**, por estes indices;
-- o servidor traduz a violacao em erro de campo e a tela oferece sugestoes.
-- Nenhum codigo deste repositorio confere antes e confia: a janela entre
-- conferir e gravar e onde a corrida mora.

CREATE TABLE handles (
  -- `citext`: `@Leandro` e `@leandro` nao coexistem, e quem garante e a chave.
  -- A aplicacao ja grava normalizado; `citext` e o que impede o `INSERT` por
  -- fora de criar a segunda forma.
  handle            citext      PRIMARY KEY
                                CONSTRAINT handles_formato
                                CHECK (handle ~ '^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$'),

  -- O apelido sem hifen e com os parecidos colapsados. **UNIQUE**, e e este o
  -- indice que separa `@mar1a-silva` de `@maria-silva`.
  handle_esqueleto  text        NOT NULL,

  kind              text        NOT NULL
                                CHECK (kind IN ('pessoa', 'pet', 'reservado')),

  -- A conta dona, quando `kind = 'pessoa'`. `ON DELETE SET NULL` e nao
  -- CASCADE: apelido de conta que sai NAO volta ao pool na hora (plano 4-C.7),
  -- e CASCADE o soltaria no mesmo instante -- um estranho pegaria `@maria` e
  -- herdaria o que a vizinhanca associava a ela, que e imitacao servida pelo
  -- produto. A linha fica, sem dono, e a liberacao e decisao de quem
  -- administrar o pool. **Apagar conta esta proibido no produto de todo modo**
  -- (a decisao do cliente foi desabilitar), entao este caminho e defensivo.
  user_id           uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- Quando `kind = 'pessoa'`, quando o apelido passou a valer. A regra de
  -- troca (1 vez a cada 60 dias) e lida daqui.
  claimed_at        timestamptz NOT NULL DEFAULT now(),

  -- Apelido de pessoa TEM dono. Sem isto, `kind = 'pessoa'` com `user_id`
  -- nulo seria um apelido ocupando o espaco de nomes sem conta nenhuma atras
  -- -- indistinguivel de uma reservada, mas sem estar na lista.
  CONSTRAINT handles_pessoa_tem_dono
    CHECK (kind <> 'pessoa' OR user_id IS NOT NULL)
);

COMMENT ON TABLE handles IS
  'O espaco de nomes do @, COMPARTILHADO entre pessoa, pet e reservadas. Existe como tabela e nao como coluna com indice unico porque o site publica o pet em /@{slug} (ADR-0028) e o @ e um simbolo so para quem le: @bidu nao pode ser um pet para um leitor e uma pessoa para outro. Dois indices unicos em duas tabelas nao conversam. As reservadas moram aqui, e nao numa lista em src/, porque lista no codigo nao impede INSERT por psql, por script de carga nem por migracao futura. NAO HA rota de disponibilidade: a decisao e no envio, por estes indices (plano 4-C.5).';

COMMENT ON COLUMN handles.handle_esqueleto IS
  'O apelido sem hifen e com os parecidos colapsados por GRUPO: {0,o}->o, {1,i,l}->l, {5,s}->s, {3,e}->e. UNIQUE, e e este o indice que trabalha: ele e o que impede @maria-silva, @mariasilva e @mar1a-silva de coexistirem. ATENCAO: o plano 9d99ac0f escreve o mapa como 0->o, 1->l, 5->s, 3->e, e esse mapa SOZINHO nao produz a colisao que o proprio plano exige (mar1a->marla e maria->maria nao colidem). i->l foi acrescentado para o invariante escrito valer; o custo e que @lia, @l1a e @iia passam a ser o mesmo apelido.';

-- Unicidade do esqueleto, GLOBAL e nao so entre contas vivas -- mesma escolha
-- de `pets_slug_unico`. Indice e nao `UNIQUE` na coluna so para o nome ficar
-- dito e achavel na mensagem de erro que a aplicacao traduz.
CREATE UNIQUE INDEX handles_esqueleto_unico ON handles (handle_esqueleto);

-- O esqueleto, numa funcao, porque ele e calculado em TRES lugares (o
-- `INSERT` da aplicacao, o gatilho do pet abaixo e a carga das reservadas) e
-- tres copias divergiriam na primeira mudanca do mapa.
--
-- `IMMUTABLE`: ela depende so da entrada, e e isso que a deixa ser usada em
-- indice e em `CHECK` se um dia precisar.
CREATE FUNCTION handle_esqueleto(p_handle text) RETURNS text AS $$
  SELECT translate(
    replace(lower(trim(p_handle)), '-', ''),
    -- A ORDEM IMPORTA e os dois lados tem o mesmo comprimento: `translate`
    -- casa caractere a caractere por posicao.
    '01i53',
    'ollse'
  );
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION handle_esqueleto(text) IS
  'O esqueleto de um apelido: minusculo, aparado, sem hifen, e com os parecidos colapsados por grupo -- {0,o}->o, {1,i,l}->l, {5,s}->s, {3,e}->e. Uma fonte so, porque o esqueleto e calculado no INSERT da aplicacao, no gatilho de pets.slug e na carga das reservadas.';

-- O esqueleto nao e dado de entrada: ele e DERIVADO, sempre, e por isso o
-- gatilho o recalcula em vez de confiar no que chegou. Sem isto, quem gravasse
-- um esqueleto errado de proposito contornaria o indice que separa os
-- parecidos -- que e o unico freio de imitacao que esta migracao instala.
CREATE FUNCTION handles_derivar_esqueleto() RETURNS trigger AS $$
BEGIN
  NEW.handle := lower(trim(NEW.handle));
  NEW.handle_esqueleto := handle_esqueleto(NEW.handle);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER handles_esqueleto_derivado
  BEFORE INSERT OR UPDATE OF handle ON handles
  FOR EACH ROW EXECUTE FUNCTION handles_derivar_esqueleto();

-- AS RESERVADAS, do plano 4-C.6, refeitas para o piso de 5.
--
-- O piso de 5 matou 24 palavras do rascunho anterior (`t`, `v1`, `me`, `api`,
-- `app`, `web`, `img`, `pet`, `tag`, `oi`, `vip`, `pix`, `sair`, `pets`,
-- `rede`, `loja`, `blog`, `time`, `root`, `selo`, `null`, `true`, `test`,
-- `user`): reservar o que o `CHECK` de formato ja proibe e regra morta, e
-- regra morta numa tabela e pior que em codigo, porque ela parece estar
-- protegendo algo.
--
-- `bichu` ENTRA NA LISTA, mas a regra dele e **CONTEM** e nao igualdade --
-- `@suporte-bichu` e `@oi-bichu` sao a forma real do golpe, e nenhum dos dois
-- e igual a `bichu`. A igualdade nao da conta disso, e `CHECK` com `LIKE
-- '%bichu%'` sobre a coluna recusaria tambem o apelido ja dado no dia em que
-- alguem acrescentasse palavra. **Quem confere o CONTEM e a aplicacao**
-- (`src/shared/apelido/apelido.ts`), sobre o ESQUELETO -- senao
-- `@b1chu-suporte` passa pela lista inteira.
--
-- O que esta tabela garante e o outro lado: nenhuma destas palavras pode ser
-- TOMADA, nem pela aplicacao nem por `psql`, porque a chave primaria ja esta
-- ocupada. As duas metades sao necessarias e nenhuma substitui a outra.
INSERT INTO handles (handle, handle_esqueleto, kind) 
SELECT palavra, handle_esqueleto(palavra), 'reservado'
FROM (VALUES
  -- Caminho
  ('public'),
  ('media'),
  ('static'),
  ('assets'),
  ('health'),
  ('cartaz'),
  ('login'),
  ('entrar'),
  ('conta'),
  ('perfil'),
  ('perto'),
  ('achado'),
  ('perdido'),
  ('plaquinha'),
  ('evento'),
  ('eventos'),
  ('diretorio'),
  ('busca'),
  ('termos'),
  ('privacidade'),
  ('sobre'),
  -- Plataforma
  ('bichu'),
  ('oficial'),
  ('equipe'),
  ('suporte'),
  ('atendimento'),
  ('ajuda'),
  ('moderacao'),
  ('moderador'),
  ('seguranca'),
  ('admin'),
  ('administrador'),
  ('sistema'),
  ('contato'),
  ('noreply'),
  ('no-reply'),
  -- Golpe
  ('verificado'),
  ('validado'),
  ('premium'),
  ('premio'),
  ('recompensa'),
  ('sorteio'),
  ('ganhador'),
  ('pagamento'),
  ('cobranca'),
  -- Tecnica
  ('false'),
  ('teste'),
  ('usuario'),
  ('anonimo'),
  ('deleted'),
  ('excluido'),
  ('undefined')
) AS reservadas(palavra)
-- `ON CONFLICT DO NOTHING` sobre o ESQUELETO tambem: duas reservadas podem ter
-- o mesmo esqueleto (`moderacao` e `moderaçao` nao, mas `premio`/`prem1o` sim
-- se a lista crescer), e a carga nao pode morrer por isso.
ON CONFLICT DO NOTHING;

-- A COLUNA EM `users`, que aponta para o espaco de nomes.
--
-- **ANULAVEL, e isso e decisao de produto e nao frouxidao.** O plano 4-C.8
-- encerrou o assunto das contas que ja existem: *"as contas que nao tem ainda
-- sao de teste, voce nao precisa se preocupar"*, a oferta de apagar foi
-- recusada, e elas continuam no banco. Com `NULL`, a tela cai para o nome de
-- exibicao -- que e o que ela ja faz -- e **nenhum fluxo obriga a escolher
-- apelido**. `NOT NULL` aqui quebraria as 7 contas de homologacao, e `DEFAULT`
-- inventaria apelido para sete pessoas.
--
-- **FK para `handles` e nao texto solto**: e a FK que faz a unicidade do
-- espaco compartilhado valer para a pessoa. Sem ela, `users.handle` seria uma
-- segunda fonte do mesmo apelido, livre para divergir da tabela.
ALTER TABLE users
  ADD COLUMN handle citext
  CONSTRAINT users_handle_no_espaco_de_nomes
  REFERENCES handles (handle) ON UPDATE CASCADE;

COMMENT ON COLUMN users.handle IS
  'O apelido (@) escolhido pela pessoa, normalizado (minusculo, aparado), apontando para o espaco de nomes de handles. Faixa 5-20, ^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$, A MESMA em handles.handle (CHECK), no contrato (minLength/maxLength/pattern) e na tela (app/lib/formato/apelido.dart) -- esta casa ja pagou por divergencia de faixa entre contrato e coluna. ANULAVEL: as 7 contas de 18/10/2026 sao de teste e continuam no banco (plano 4-C.8); com nulo a tela cai para o nome de exibicao e nenhum fluxo obriga a escolher. NAO E DADO PESSOAL por decisao do cliente ("slug nao tem relacao com informacoes pessoais, e um id que o usuario escolhe"), mas a VISIBILIDADE continua obedecendo a regua do ADR-0010: ele nao sai em superficie publica nesta fatia. NAO HA rota de disponibilidade: a decisao e no envio, pelo indice.';

-- UNICIDADE DA PESSOA DENTRO DE `handles`: uma conta tem no maximo um apelido
-- vivo. Sem isto, `handles` aceitaria dez linhas `kind = 'pessoa'` com o mesmo
-- `user_id`, e `users.handle` apontaria para uma delas enquanto as outras nove
-- ficariam tomando o espaco de nomes sem aparecer em tela nenhuma.
--
-- Parcial, porque o apelido ANTERIOR da mesma conta fica reservado por 180
-- dias (plano 4-C.7) e precisa continuar existindo: ele deixa de ser
-- `kind = 'pessoa'` e passa a `kind = 'reservado'` com o `user_id` preservado,
-- e a reserva e o que impede um estranho de herdar a vizinhanca de quem
-- trocou.
CREATE UNIQUE INDEX handles_uma_pessoa_um_apelido
  ON handles (user_id) WHERE kind = 'pessoa' AND user_id IS NOT NULL;

-- O SLUG DO PET ENTRA NO MESMO ESPACO, PELO BANCO E NAO PELO `src/`.
--
-- `pets.slug` existe desde a `20260917000006` e tem indice unico PROPRIO. Ele
-- continua: derruba-lo exigiria mexer no modulo de pets, que e de outra
-- frente, e deixaria a tabela sem freio enquanto a troca acontecesse.
--
-- O que este gatilho acrescenta e o OUTRO invariante: slug de pet e apelido de
-- pessoa **nao coexistem iguais**. Ele mora no banco de proposito -- o codigo
-- que grava `pets.slug` e de outro modulo, e um gatilho nao pede que ninguem
-- se lembre de chamar nada. Quem gravar slug de pet por qualquer caminho
-- reivindica o apelido no espaco comum, ou a escrita reprova.
--
-- A FAIXA DIVERGE DE PROPOSITO, e e por isso que o gatilho reprova com nome:
-- `pets.slug` aceita 3 a 30 e `handles` aceita 5 a 20. Slug de pet de 3 ou de
-- 25 caracteres **nao cabe** no espaco comum, e o gatilho diz isso em voz alta
-- em vez de gravar o pet e deixar o espaco de nomes inconsistente. Em
-- homologacao isto nao afeta ninguem: 0 pets com slug, medido em 18/10/2026.
CREATE FUNCTION pets_slug_reivindica_handle() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.slug !~ '^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$' THEN
    RAISE EXCEPTION
      'slug de pet "%" esta fora da faixa do espaco de nomes compartilhado (5 a 20, ^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$). pets.slug aceita 3 a 30 e handles aceita 5 a 20: a divergencia e deliberada, e gravar aqui deixaria /@{slug} sem linha em handles.', NEW.slug;
  END IF;

  INSERT INTO handles (handle, handle_esqueleto, kind)
  VALUES (NEW.slug, handle_esqueleto(NEW.slug), 'pet')
  ON CONFLICT (handle) DO NOTHING;

  -- `DO NOTHING` acima cobre o re-salvamento do MESMO slug pelo mesmo pet. O
  -- que ele nao pode cobrir e o slug ja tomado por OUTRA especie: se a linha
  -- existe e nao e `pet`, a escrita precisa reprovar.
  IF NOT EXISTS (
    SELECT 1 FROM handles WHERE handle = NEW.slug AND kind = 'pet'
  ) THEN
    RAISE EXCEPTION
      'o apelido "%" ja esta tomado no espaco de nomes compartilhado (@ e um simbolo so: ADR-0028). Escolha outro slug para o pet.', NEW.slug;
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pets_slug_reivindica_handle() IS
  'Faz o slug do pet reivindicar o apelido no espaco de nomes compartilhado de handles. Mora no banco e nao em src/ porque quem grava pets.slug e outro modulo, e gatilho nao pede que ninguem se lembre de chamar nada. Reprova com nome quando o slug esta fora da faixa 5-20 de handles (pets.slug aceita 3-30: a divergencia e do desenho) ou quando o apelido ja e de uma pessoa.';

CREATE TRIGGER pets_slug_no_espaco_de_nomes
  BEFORE INSERT OR UPDATE OF slug ON pets
  FOR EACH ROW EXECUTE FUNCTION pets_slug_reivindica_handle();

-- Down Migration

-- Descer APAGA a data de nascimento de quem a declarou, e com ela a unica
-- prova de que a idade minima foi conferida naquela conta. Mesma forma da
-- `20261017000015` e da `20261017000004`: a descida reprova em voz alta em vez
-- de descartar declaracao de gente real em silencio.
--
-- A conferencia e por data PREENCHIDA e nao por linha existente: um banco onde
-- ninguem se cadastrou depois desta migracao nao perde nada ao perder a
-- coluna, e reprovar ali travaria a descida sem motivo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE birth_date IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha conta com data de nascimento declarada: reverter apagaria a declaracao da pessoa e a prova de que a idade minima de 16 anos foi conferida. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

ALTER TABLE users DROP COLUMN birth_date;

-- E a MESMA guarda para o apelido, pelo mesmo motivo e com outro peso: o
-- apelido e escolhido, e soltar um apelido de volta ao pool e o furo que o
-- plano 4-C.7 descreve -- um estranho pega `@maria` e herda o que a vizinhanca
-- associava a ela. Descer com apelido de PESSOA gravado reprova.
--
-- A conferencia e por `kind = 'pessoa'` e nao por linha de `handles`: a tabela
-- cheia de reservadas e de slugs de pet nao perde escolha de ninguem ao ser
-- derrubada, e reprovar ali impediria a descida sem motivo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM handles WHERE kind = 'pessoa') THEN
    RAISE EXCEPTION
      'ha conta com apelido escolhido: reverter soltaria o apelido de volta ao pool, e quem o pegasse herdaria o que a vizinhanca associava a quem o escolheu (plano 4-C.7). Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

-- A ORDEM DA DESCIDA E O INVERSO DA SUBIDA, e ela importa: o gatilho de `pets`
-- chama `handle_esqueleto`, e `users.handle` tem FK para `handles`. Derrubar
-- `handles` antes de soltar a FK deixaria o `DROP TABLE` reprovando por
-- dependencia, e a migracao morreria no meio.
DROP TRIGGER pets_slug_no_espaco_de_nomes ON pets;
DROP FUNCTION pets_slug_reivindica_handle();

ALTER TABLE users DROP COLUMN handle;

DROP TRIGGER handles_esqueleto_derivado ON handles;
DROP FUNCTION handles_derivar_esqueleto();

-- `handles_esqueleto_unico` e `handles_uma_pessoa_um_apelido` caem com a
-- tabela; nomea-los aqui seria `DROP INDEX` de indice que ja nao existe.
DROP TABLE handles;

DROP FUNCTION handle_esqueleto(text);
