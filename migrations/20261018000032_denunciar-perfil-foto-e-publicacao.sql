-- DENUNCIAR PERFIL, FOTO E PUBLICACAO -- os tres alvos novos da fila.
--
-- Fatia E da frente de comunidade. A fila de moderacao do painel
-- (`fila_de_moderacao`, migracao `20261018000009`) nasceu com DUAS origens --
-- `review` (avaliacao do Perto) e `conversation` (conversa mediada) -- e o
-- cabecalho dela ja declarou, por escrito, que perfil e foto viriam desta
-- frente e que o custo de cada alvo novo seria "uma perna de UNION ALL, um
-- valor no enum e um rotulo -- e nenhuma linha de src/". Este arquivo cria as
-- tabelas que essas pernas consomem. **A fila passa de dois para cinco alvos.**
--
-- ## A FILA NAO ESTA NESTA BASE, e o que isso significa
--
-- Medido: `fila_de_moderacao`, `admin/moderation` e `admin/reports` nao existem
-- em `origin/development` (`87979b6d`), e a migracao `20261018000009` nao esta
-- aqui. A fila vive em `feat/fila-de-moderacao-backoffice` (`e9b1fcb7`), que eu
-- NAO mesclei. Entao:
--
--   - as TABELAS, as FUNCOES e as ESCRITAS estao prontas e exercitadas aqui;
--   - as TRES PERNAS da visao estao escritas no fim deste arquivo, literais,
--     para colar na mescla -- nao ha como cria-las antes de a visao existir;
--   - a visao precisa de UMA coluna nova (`reporter_weighs`) para que o peso de
--     ordenacao funcione, e o texto dela tambem esta no fim, para as CINCO
--     pernas.
--
-- ## TRES TABELAS, e nao uma `content_reports` polimorfica
--
-- O desenho da frente previa uma tabela so. **Divergi, e a razao e a fila.** As
-- duas origens que existem sao duas tabelas, cada uma com chave estrangeira
-- para o seu proprio alvo, e a visao as junta por `UNION ALL`. Uma tabela
-- polimorfica trocaria tres chaves estrangeiras reais por uma coluna de tipo e
-- um id sem referencia -- ou seja, trocaria integridade do banco por disciplina
-- de aplicacao, no exato lugar onde o dado precisa durar 24 meses. Tambem
-- impediria as listas fechadas de motivo de serem `CHECK` por alvo, que e o que
-- recusa `nudez` numa denuncia de perfil.
--
-- ## O MOLDE: `professional_review_reports`, lido e seguido
--
-- As tres tabelas repetem, coluna por coluna, o exemplar mais novo
-- (`20261017000017` + as colunas de decisao da `20261018000009`): `id`, o alvo,
-- `reporter_user_id`, `reason` de lista fechada, `detail` com os dois `CHECK`
-- (tamanho e `[<>]`), `repeat_count`, `created_at`, `last_reported_at`,
-- `resolved_at`, `resolution` e `resolution_reason`. Nascem JA com as colunas de
-- decisao, para que a perna da visao seja copia da perna da avaliacao.
--
-- ## O QUE O DENUNCIADO VE: NADA. E ISSO ESTA NO CODIGO, NAO NA PROSA
--
-- Nenhuma coluna destas tabelas sai em resposta a ninguem alem do painel. Nao
-- ha coluna de aviso, nao ha gatilho que escreva em `notification_deliveries`,
-- nao ha `notified_at`, e nenhuma destas tabelas e lida por caminho que o
-- denunciado alcance. **Avisar o denunciado e retaliacao**, e o silencio e
-- mecanismo e nao omissao. A unica leitura do denunciado que estas tabelas
-- mudam e a dele proprio quando ELE e o denunciante (a ocultacao imediata).
--
-- ## A OCULTACAO IMEDIATA e DO DENUNCIANTE, e nao da fila
--
-- Quem denunciou para de ver o alvo na hora, sem depender de ninguem. **E
-- filtro de LEITURA**, e e o que faz a denuncia valer sem prazo prometido --
-- porque nao temos prazo. Implementada por
-- `ocultado_para_quem_denunciou(...)`, abaixo. Nao e `resolved_at`, nao e
-- remocao e nao aparece para mais ninguem: quem nao denunciou continua vendo o
-- alvo exatamente como antes.
--
-- ## O CONTEUDO DENUNCIADO SAI PARA QUEM MODERA NOS TRES ALVOS
--
-- A visao tem a assimetria declarada: `target_body` sai na perna da avaliacao
-- (conteudo PUBLICADO) e e nulo na perna da conversa (privada entre duas
-- pessoas, e nada neste produto autoriza o administrador a le-la). **Perfil,
-- foto e publicacao caem do lado da avaliacao**, pelo mesmo criterio e nao por
-- conveniencia: os tres sao conteudo que a propria pessoa PUBLICOU para outros
-- verem. Quem decide precisa ler exatamente o que todo mundo esta lendo, e no
-- caso da foto precisa saber QUAL imagem -- que e a razao de a denuncia de foto
-- ser um lugar separado da denuncia de perfil.
--
-- Para a foto, `target_body` e a CHAVE DA DERIVADA PUBLICA
-- (`catalog_images.public_key`, 128 bits aleatorios, ADR-0007), e nao o UUID da
-- imagem: e o endereco pelo qual a imagem ja e servida a quem a viu.
--
-- ## O ALVO SOBREVIVE AO EXPURGO, e e por isso que ha `target_ref` em COPIA
--
-- `denuncia e o unico registro desta frente que sobrevive a exclusao da conta`.
-- As chaves estrangeiras para o alvo sao `ON DELETE SET NULL`, e cada linha
-- guarda `target_ref` em copia. Expurgada a conta (ou apagada a imagem), a
-- denuncia fica, a fila continua agrupando pelo MESMO `target_ref` -- e nao
-- aponta mais para ninguem. Chave estrangeira `CASCADE` aqui apagaria a prova
-- de que houve resposta, que e justamente o que a retencao de 24 meses existe
-- para guardar.
--
-- ## `publication_reports` NAO TEM CHAVE ESTRANGEIRA, e isso esta declarado
--
-- A tabela de publicacoes (`user_publications`) e de outra fatia e NAO EXISTE
-- nesta base -- medido na lista de tabelas de `src/shared/db/schema.ts`. Chave
-- estrangeira para tabela inexistente nao compila, e inventar a tabela aqui
-- seria construir a fatia de outro agente. Entao `publication_id` entra sem
-- referencia, com o `ALTER TABLE` que a liga escrito no fim deste arquivo, de
-- uma linha. **Ate ele rodar, nada impede uma linha orfa**, e esta frase existe
-- para que isso seja escolha conhecida e nao surpresa.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. DENUNCIA DE PERFIL -- 5 motivos
-- ---------------------------------------------------------------------------
-- Sobre QUEM A PESSOA E: apelido, nome de exibicao, capa. O administrador
-- resolve removendo o ARTEFATO ofensivo, um de cada vez, com motivo
-- obrigatorio -- nunca a conta, porque a fila nao tem acao sobre conta.
CREATE TABLE profile_reports (
  id                uuid        PRIMARY KEY,

  -- O ALVO. `SET NULL` para a denuncia sobreviver ao expurgo; ver o cabecalho.
  subject_user_id   uuid        REFERENCES users (id) ON DELETE SET NULL,

  -- `users.public_ref` em COPIA, e e ele o `target_ref` da fila. Copia e nao
  -- junta: depois do expurgo nao ha linha de `users` para juntar, e sem a copia
  -- a denuncia sobreviveria sem saber mais de quem ela era.
  subject_ref       text        NOT NULL
                                CONSTRAINT profile_reports_subject_ref_forma
                                CHECK (subject_ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- SEM A MARCA do portao de saida, pela mesma decisao de
  -- `professional_review_reports.reporter_user_id`: `src/` precisa dela no
  -- `WHERE` -- para a ocultacao imediata, para os tetos e para recusar a
  -- denuncia do proprio perfil. Nenhuma resposta a projeta.
  reporter_user_id  uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  -- LISTA FECHADA, pelo padrao do ADR-0023 secao 3. SEM TEXTO LIVRE de motivo:
  -- campo livre vira desabafo e nao se tria.
  --
  -- `minor_suspected` vai ao TOPO DA FILA na ordenacao da tela, e por isso
  -- existe separado de `other`.
  reason            text        NOT NULL
                                CONSTRAINT profile_reports_reason_conhecido
                                CHECK (reason IN ('impersonation',
                                                  'harassment',
                                                  'pet_ransom_scam',
                                                  'minor_suspected',
                                                  'other')),

  -- O MESMO limite e os MESMOS dois `CHECK` das duas tabelas que existem.
  detail            text        CONSTRAINT profile_reports_detail_tamanho
                                CHECK (detail IS NULL OR char_length(detail) <= 1000)
                                CONSTRAINT profile_reports_detail_sem_html
                                CHECK (detail IS NULL OR detail !~ '[<>]'),

  repeat_count      integer     NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),

  created_at        timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),

  resolved_at       timestamptz,

  resolution        text        CONSTRAINT profile_reports_resolution_conhecida
                                CHECK (resolution IS NULL
                                       OR resolution IN ('content_removed', 'dismissed')),

  resolution_reason text        CONSTRAINT profile_reports_resolution_reason_tamanho
                                CHECK (resolution_reason IS NULL
                                       OR char_length(resolution_reason) BETWEEN 3 AND 500)
);

ALTER TABLE profile_reports
  ADD CONSTRAINT profile_reports_decisao_depois_de_resolver
      CHECK (resolution IS NULL OR resolved_at IS NOT NULL),
  ADD CONSTRAINT profile_reports_motivo_com_decisao
      CHECK (resolution_reason IS NULL OR resolution IS NOT NULL);

-- UMA DENUNCIA ABERTA POR PAR, e o indice e PARCIAL.
--
-- O teto do briefing e literal: "1 denuncia aberta por par". Parcial e nao
-- incondicional, entao, e esta e a forma de `conversation_reports` e nao a de
-- `professional_review_reports`. A diferenca vale a pena dizer: resolver LIBERA
-- o par para uma denuncia nova, e aqui isso e legitimo -- a pessoa continua
-- existindo, continua tendo perfil, e um abuso NOVO depois da decisao e um item
-- de fila novo. Impedir para sempre daria a quem errou uma imunidade.
--
-- A insistencia dentro da MESMA denuncia aberta nao cria linha: soma em
-- `repeat_count` e move `last_reported_at`, e a rota responde `202` igual. Erro
-- ensinaria a quem denuncia que ele ja denunciou, o que nao e informacao dele.
CREATE UNIQUE INDEX profile_reports_uma_aberta_por_par
  ON profile_reports (subject_ref, reporter_user_id)
  WHERE resolved_at IS NULL;

-- A fila, na ordem em que ela e lida.
CREATE INDEX profile_reports_fila ON profile_reports (created_at) WHERE resolved_at IS NULL;

-- A OCULTACAO IMEDIATA, do lado de quem denunciou. Sem este indice o filtro de
-- leitura seria varredura em toda tela que mostra uma pessoa.
CREATE INDEX profile_reports_do_denunciante ON profile_reports (reporter_user_id, subject_ref);

COMMENT ON TABLE profile_reports IS
  'DENUNCIA DE PERFIL -- sobre QUEM A PESSOA E (apelido, nome de exibicao, capa). Alvo novo da fila fila_de_moderacao (20261018000009): a fila passa de dois para cinco com esta, photo_reports e publication_reports. Lista fechada de 5 motivos pelo ADR-0023 secao 3, sem texto livre de motivo. O DENUNCIADO NAO E AVISADO: nao ha coluna de aviso, nao ha gatilho de notificacao e nenhuma leitura que ele alcance le esta tabela -- avisar e retaliacao. A ocultacao imediata para quem denunciou e filtro de LEITURA (ocultado_para_quem_denunciou), nao e da fila, e e o que faz a denuncia valer SEM PRAZO PROMETIDO. O administrador resolve removendo o ARTEFATO ofensivo, um de cada vez, com motivo obrigatorio -- nunca a conta, porque a fila nao tem acao sobre conta. SOBREVIVE AO EXPURGO: subject_user_id e SET NULL e subject_ref fica em copia.';

COMMENT ON COLUMN profile_reports.subject_ref IS
  'users.public_ref do perfil denunciado, em COPIA, e e ele o target_ref da perna desta origem na fila. Copia e nao junta: depois do expurgo nao ha linha de users para juntar, e e esta coluna que faz a fila continuar agrupando pelo mesmo alvo sem apontar para ninguem.';

-- ---------------------------------------------------------------------------
-- 2. DENUNCIA DE FOTO -- 6 motivos
-- ---------------------------------------------------------------------------
-- DOIS LUGARES, e nao um: a foto se denuncia NA FOTO. O administrador precisa
-- saber QUAL imagem, e uma denuncia de perfil que dissesse "tem uma foto ruim"
-- obrigaria quem modera a adivinhar entre as fotos da pessoa.
--
-- O ALVO E `catalog_images`, que e a esteira UNICA de imagem desta casa
-- (ADR-0007, ADR-0027 A.3) e e por onde a foto da propria pessoa (`user_photo`,
-- `20261018000008`) e as fotos da vitrine (quando a fatia delas chegar) passam.
-- Apontar para a esteira, e nao para a tabela de uma superficie, e o que faz
-- esta denuncia valer para a foto de perfil de hoje e para a vitrine de amanha
-- sem segunda tabela.
CREATE TABLE photo_reports (
  id                uuid        PRIMARY KEY,

  image_id          uuid        REFERENCES catalog_images (id) ON DELETE SET NULL,

  -- `catalog_images.public_key` em COPIA: a chave da derivada publica (128 bits
  -- aleatorios, ADR-0007), que e o endereco pelo qual a imagem ja e servida a
  -- quem a viu. E o `target_ref` E o `target_body` da perna: quem modera abre a
  -- mesma imagem que o denunciante abriu.
  --
  -- Sem `CHECK` de forma: a chave e caminho de armazenamento com prefixo por
  -- proposito, e um padrao escrito aqui divergiria de `derivadas.ts` na
  -- primeira geometria nova.
  image_public_key  text        NOT NULL
                                CONSTRAINT photo_reports_chave_tamanho
                                CHECK (char_length(image_public_key) BETWEEN 1 AND 500),

  -- De QUEM e a foto, para a fila dizer sobre quem ela fala. `SET NULL` pela
  -- mesma razao do alvo.
  owner_user_id     uuid        REFERENCES users (id) ON DELETE SET NULL,

  reporter_user_id  uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  -- LISTA FECHADA de SEIS. `child_at_risk` vai ao TOPO DA FILA.
  --
  -- `i_am_in_it` existe porque quem aparece numa foto nao e quem a enviou, e nao
  -- tem outro caminho: e o direito de oposicao que o ADR-0011 emenda 1 deu ao
  -- profissional cadastrado por terceiro, pela mesma razao.
  reason            text        NOT NULL
                                CONSTRAINT photo_reports_reason_conhecido
                                CHECK (reason IN ('nudity_or_sexual',
                                                  'child_at_risk',
                                                  'animal_violence',
                                                  'i_am_in_it',
                                                  'impersonation',
                                                  'other')),

  detail            text        CONSTRAINT photo_reports_detail_tamanho
                                CHECK (detail IS NULL OR char_length(detail) <= 1000)
                                CONSTRAINT photo_reports_detail_sem_html
                                CHECK (detail IS NULL OR detail !~ '[<>]'),

  repeat_count      integer     NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),

  created_at        timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),

  resolved_at       timestamptz,

  resolution        text        CONSTRAINT photo_reports_resolution_conhecida
                                CHECK (resolution IS NULL
                                       OR resolution IN ('content_removed', 'dismissed')),

  resolution_reason text        CONSTRAINT photo_reports_resolution_reason_tamanho
                                CHECK (resolution_reason IS NULL
                                       OR char_length(resolution_reason) BETWEEN 3 AND 500)
);

ALTER TABLE photo_reports
  ADD CONSTRAINT photo_reports_decisao_depois_de_resolver
      CHECK (resolution IS NULL OR resolved_at IS NOT NULL),
  ADD CONSTRAINT photo_reports_motivo_com_decisao
      CHECK (resolution_reason IS NULL OR resolution IS NOT NULL);

-- O PAR AQUI E (FOTO, DENUNCIANTE), e nao (pessoa, denunciante): denunciar duas
-- fotos diferentes da mesma pessoa sao duas denuncias, porque sao dois
-- conteudos e o administrador decide um de cada vez.
CREATE UNIQUE INDEX photo_reports_uma_aberta_por_par
  ON photo_reports (image_public_key, reporter_user_id)
  WHERE resolved_at IS NULL;

CREATE INDEX photo_reports_fila ON photo_reports (created_at) WHERE resolved_at IS NULL;

CREATE INDEX photo_reports_do_denunciante ON photo_reports (reporter_user_id, image_public_key);

COMMENT ON TABLE photo_reports IS
  'DENUNCIA DE FOTO -- denuncia-se NA FOTO, e nao no perfil, porque o administrador precisa saber QUAL imagem. Alvo novo da fila fila_de_moderacao (20261018000009). O alvo e catalog_images, a esteira UNICA de imagem da casa (ADR-0007), e nao a tabela de uma superficie: assim esta denuncia vale para a foto da propria pessoa (user_photo, 20261018000008) e para a vitrine quando ela chegar, sem segunda tabela. Lista fechada de 6 motivos (ADR-0023 secao 3), com child_at_risk no topo da fila e i_am_in_it para quem aparece na foto e nao a enviou -- o direito de oposicao do ADR-0011 emenda 1. O DENUNCIADO NAO E AVISADO. O CONTEUDO SAI para quem modera (image_public_key), pelo mesmo criterio da avaliacao: foto e conteudo PUBLICADO, nao e conversa privada. O par do indice parcial e (foto, denunciante) e nao (pessoa, denunciante): duas fotos sao dois conteudos.';

-- ---------------------------------------------------------------------------
-- 3. DENUNCIA DE PUBLICACAO -- 5 motivos, a lista especifica DAQUI
-- ---------------------------------------------------------------------------
-- TERCEIRA LISTA, e nao reuso de uma das outras duas: "nudez" e "maus-tratos"
-- sao de IMAGEM e "nao e quem diz ser" e de PERFIL.
--
-- `false_lost_pet_info` e o motivo que so existe neste produto: um avistamento
-- inventado manda a pessoa para o BAIRRO ERRADO e custa HORAS DE BUSCA. Nao e
-- "informacao falsa" genérica, e por isso nao cabia em `other`.
CREATE TABLE publication_reports (
  id                uuid        PRIMARY KEY,

  -- SEM CHAVE ESTRANGEIRA, e a ausencia esta declarada no cabecalho:
  -- `user_publications` e de outra fatia e nao existe nesta base. O `ALTER
  -- TABLE` que a liga esta no fim deste arquivo, de uma linha.
  publication_id    uuid,

  -- O endereco publico da publicacao, em COPIA, e e ele o `target_ref`.
  -- `NOT NULL` porque a fila agrupa por ele, e sem ele a linha nao tem alvo.
  publication_ref   text        NOT NULL
                                CONSTRAINT publication_reports_ref_forma
                                CHECK (publication_ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- O TEXTO DENUNCIADO, em COPIA, e e ele o `target_body` da perna.
  --
  -- COPIA e nao junta, e aqui a copia faz mais do que sobreviver ao expurgo:
  -- ela congela o que FOI DENUNCIADO. Sem ela, editar a publicacao depois de
  -- denunciada faria o administrador julgar um texto que ninguem denunciou.
  --
  -- 280 e o teto da publicacao, que e o teto que `pets.care_notes` ja usa.
  publication_body  text        CONSTRAINT publication_reports_corpo_tamanho
                                CHECK (publication_body IS NULL
                                       OR char_length(publication_body) <= 280),

  author_user_id    uuid        REFERENCES users (id) ON DELETE SET NULL,

  reporter_user_id  uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  reason            text        NOT NULL
                                CONSTRAINT publication_reports_reason_conhecido
                                CHECK (reason IN ('offensive_or_discriminatory',
                                                  'scam_or_animal_sale',
                                                  'false_lost_pet_info',
                                                  'spam_or_repetition',
                                                  'other')),

  detail            text        CONSTRAINT publication_reports_detail_tamanho
                                CHECK (detail IS NULL OR char_length(detail) <= 1000)
                                CONSTRAINT publication_reports_detail_sem_html
                                CHECK (detail IS NULL OR detail !~ '[<>]'),

  repeat_count      integer     NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),

  created_at        timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),

  resolved_at       timestamptz,

  resolution        text        CONSTRAINT publication_reports_resolution_conhecida
                                CHECK (resolution IS NULL
                                       OR resolution IN ('content_removed', 'dismissed')),

  resolution_reason text        CONSTRAINT publication_reports_resolution_reason_tamanho
                                CHECK (resolution_reason IS NULL
                                       OR char_length(resolution_reason) BETWEEN 3 AND 500)
);

ALTER TABLE publication_reports
  ADD CONSTRAINT publication_reports_decisao_depois_de_resolver
      CHECK (resolution IS NULL OR resolved_at IS NOT NULL),
  ADD CONSTRAINT publication_reports_motivo_com_decisao
      CHECK (resolution_reason IS NULL OR resolution IS NOT NULL);

CREATE UNIQUE INDEX publication_reports_uma_aberta_por_par
  ON publication_reports (publication_ref, reporter_user_id)
  WHERE resolved_at IS NULL;

CREATE INDEX publication_reports_fila ON publication_reports (created_at) WHERE resolved_at IS NULL;

CREATE INDEX publication_reports_do_denunciante
  ON publication_reports (reporter_user_id, publication_ref);

COMMENT ON TABLE publication_reports IS
  'DENUNCIA DE PUBLICACAO -- ponto de acesso no PROPRIO CARTAO, pelo mesmo principio da foto: denuncia-se onde o dano esta. Alvo novo da fila fila_de_moderacao (20261018000009). TERCEIRA lista fechada de motivos (5), e nao reuso: nudez e maus-tratos sao de imagem e "nao e quem diz ser" e de perfil. false_lost_pet_info so existe neste produto -- um avistamento inventado manda a pessoa para o bairro errado e custa horas de busca. publication_id entra SEM chave estrangeira porque user_publications e de outra fatia e nao existe nesta base; o ALTER de uma linha que a liga esta no fim desta migracao, e ate ele rodar nada impede linha orfa. publication_body e COPIA do texto denunciado e congela o que FOI denunciado: sem a copia, editar depois faria o administrador julgar um texto que ninguem denunciou. O DENUNCIADO NAO E AVISADO.';

-- ---------------------------------------------------------------------------
-- 4. O DENUNCIANTE AINDA TEM CONTA? -- uma funcao por origem
-- ---------------------------------------------------------------------------
-- Conta desabilitada "nao e mais encontrada em nenhuma pagina ou funcionalidade"
-- (cliente, 17/10). A denuncia de quem desabilitou a conta nao aparece na fila:
-- nem na listagem, nem na leitura, nem na CONTAGEM do aviso do menu -- SAO TRES
-- LUGARES em `src/`, e a `20261017000016` registra o episodio em que filtrar
-- so na listagem fez o painel dizer "1 pendente" sobre fila vazia.
--
-- As tres DELEGAM para `conta_habilitada(uuid)` (`20261017000013`), que e o
-- ponto unico da definicao. Delegar, e nao copiar a regra, e o que faz esta
-- fila acompanhar quando a definicao mudar.
--
-- Os nomes seguem os das duas irmas que a `20261018000009` ja criou
-- (`denuncia_de_avaliacao_com_denunciante_ativo`,
-- `denuncia_de_conversa_com_denunciante_ativo`), para que as pernas novas da
-- visao sejam copia das que existem.
--
-- Denuncia que nao existe devolve FALSO, e a rota responde 404 e nunca 403
-- (ADR-0021): para essa superficie ela nao existe.

CREATE FUNCTION denuncia_de_perfil_com_denunciante_ativo(p_denuncia uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_reports d
     WHERE d.id = p_denuncia AND conta_habilitada(d.reporter_user_id))
$$;

CREATE FUNCTION denuncia_de_foto_com_denunciante_ativo(p_denuncia uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM photo_reports d
     WHERE d.id = p_denuncia AND conta_habilitada(d.reporter_user_id))
$$;

CREATE FUNCTION denuncia_de_publicacao_com_denunciante_ativo(p_denuncia uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM publication_reports d
     WHERE d.id = p_denuncia AND conta_habilitada(d.reporter_user_id))
$$;

COMMENT ON FUNCTION denuncia_de_perfil_com_denunciante_ativo(uuid) IS
  'Quem denunciou este perfil ainda tem conta habilitada? DELEGA para conta_habilitada(uuid) (20261017000013), ponto unico da definicao. Chamada nos MESMOS TRES lugares das irmas da 20261018000009 -- listagem, leitura e a contagem de pending_total --, porque filtrar em um lugar so faz o painel dizer 1 pendente sobre fila vazia. Devolve boolean: nenhuma autoria atravessa a borda. Denuncia que nao existe devolve FALSO, e a rota responde 404 e nunca 403 (ADR-0021).';

COMMENT ON FUNCTION denuncia_de_foto_com_denunciante_ativo(uuid) IS
  'Quem denunciou esta foto ainda tem conta habilitada? Mesma forma e mesmo motivo da irma do perfil, e delega ao mesmo ponto unico.';

COMMENT ON FUNCTION denuncia_de_publicacao_com_denunciante_ativo(uuid) IS
  'Quem denunciou esta publicacao ainda tem conta habilitada? Mesma forma e mesmo motivo da irma do perfil, e delega ao mesmo ponto unico.';

-- ---------------------------------------------------------------------------
-- 5. O PESO DE ORDENACAO -- `denunciante_ordena_a_fila(uuid)`
-- ---------------------------------------------------------------------------
-- A DEFESA CONTRA DENUNCIA COORDENADA NAO E TETO, E PESO. Teto por alvo seria
-- a defesa errada: quantas pessoas distintas denunciam o mesmo alvo e o SINAL,
-- nao o abuso -- um teto por alvo protegeria exatamente quem merece fila.
--
-- A defesa e esta: **denuncia de conta sem e-mail confirmado NAO ORDENA A
-- FILA.** Ela ENTRA (nao e descartada, porque descartar seria julgar sem olhar)
-- e NAO PESA na ordem. Uma brigada de contas novas e baratas deixa de conseguir
-- subir um alvo no topo, porque confirmar e-mail e o unico custo que ela nao
-- consegue automatizar de graca.
--
-- NAO E A MESMA PERGUNTA de `..._com_denunciante_ativo`. Aquela e FILTRO (a
-- linha aparece ou nao); esta e PESO (a linha aparece e conta ou nao conta para
-- a ordem). Duas perguntas, duas funcoes, e juntar as duas faria a denuncia da
-- conta sem e-mail confirmado DESAPARECER -- que nao e o desenho.
--
-- `email_verified_at` e a mesma regua do selo de validado
-- (`20261018000008`), e nao uma segunda definicao de "conta de verdade".
--
-- Recebe a CONTA e nao a denuncia, de proposito: as tres tabelas tem
-- `reporter_user_id`, entao uma funcao serve as tres pernas e nao ha tres
-- copias para divergirem.
CREATE FUNCTION denunciante_ordena_a_fila(p_usuario uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
     WHERE u.id = p_usuario
       AND u.email_verified_at IS NOT NULL
       AND conta_habilitada(u.id))
$$;

COMMENT ON FUNCTION denunciante_ordena_a_fila(uuid) IS
  'Esta denuncia PESA na ordem da fila? Falso para conta sem e-mail confirmado, e e a DEFESA CONTRA DENUNCIA COORDENADA: contra brigada a defesa e peso e nao teto, porque teto por alvo protegeria justamente quem merece fila -- quantas pessoas distintas denunciam o mesmo alvo e o SINAL, nao o abuso. A denuncia da conta sem e-mail confirmado ENTRA na fila e NAO ORDENA: descartar seria julgar sem olhar. NAO e a mesma pergunta de denuncia_de_X_com_denunciante_ativo, que e FILTRO -- juntar as duas faria essa denuncia desaparecer, que nao e o desenho. email_verified_at e a mesma regua do selo de validado (20261018000008). Recebe a CONTA e nao a denuncia porque as tres tabelas novas tem reporter_user_id: uma funcao serve as tres pernas.';

-- ---------------------------------------------------------------------------
-- 6. A OCULTACAO IMEDIATA -- `ocultado_para_quem_denunciou(...)`
-- ---------------------------------------------------------------------------
-- O QUE FAZ A DENUNCIA VALER SEM PRAZO PROMETIDO. Quem denunciou para de ver o
-- alvo NA HORA, sem depender de ninguem; a remocao para todos continua exigindo
-- o administrador. Sao duas consequencias separadas, e a separacao e o
-- mecanismo.
--
-- **VALE SO PARA QUEM DENUNCIOU.** Nao e remocao, nao e `resolved_at`, e nao
-- muda nada para mais ninguem -- quem nao denunciou continua vendo o alvo
-- exatamente como antes. Isso e o que impede uma denuncia de ser o custo
-- inteiro de apagar o conteudo de alguem, que e o argumento que a
-- `20261017000017` ja escreveu para a avaliacao.
--
-- Uma funcao por alvo, e as tres recebem o ENDERECO PUBLICO do alvo (nao o
-- UUID): e o que a leitura tem em maos, e e o que a denuncia guardou em copia.
--
-- Oculta mesmo depois de resolvida. Quem denunciou e nao quer mais ver nao
-- precisa concordar com a decisao do administrador para continuar nao vendo.

CREATE FUNCTION perfil_ocultado_para_quem_denunciou(p_subject_ref text, p_leitor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM profile_reports d
     WHERE d.subject_ref = p_subject_ref AND d.reporter_user_id = p_leitor)
$$;

CREATE FUNCTION foto_ocultada_para_quem_denunciou(p_chave text, p_leitor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM photo_reports d
     WHERE d.image_public_key = p_chave AND d.reporter_user_id = p_leitor)
$$;

CREATE FUNCTION publicacao_ocultada_para_quem_denunciou(p_publication_ref text, p_leitor uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM publication_reports d
     WHERE d.publication_ref = p_publication_ref AND d.reporter_user_id = p_leitor)
$$;

COMMENT ON FUNCTION perfil_ocultado_para_quem_denunciou(text, uuid) IS
  'A OCULTACAO IMEDIATA, e ela e DO DENUNCIANTE e nao da fila: e filtro de LEITURA, acontece na hora, sem depender de ninguem, e e o que faz a denuncia valer SEM PRAZO PROMETIDO -- porque nao temos prazo. VALE SO PARA QUEM DENUNCIOU: quem nao denunciou continua vendo o perfil exatamente como antes, que e o que impede uma denuncia de ser o custo inteiro de apagar o conteudo de alguem (mesmo argumento da 20261017000017). Oculta mesmo depois de resolvida: quem denunciou nao precisa concordar com a decisao para continuar nao vendo. Usa o indice profile_reports_do_denunciante. Recebe o ENDERECO PUBLICO porque e o que a leitura tem em maos e o que a denuncia guardou em copia.';

COMMENT ON FUNCTION foto_ocultada_para_quem_denunciou(text, uuid) IS
  'A ocultacao imediata da FOTO, para quem a denunciou. Mesma regra e mesmo motivo da irma do perfil; a chave e catalog_images.public_key, que e o endereco pelo qual a imagem e servida.';

COMMENT ON FUNCTION publicacao_ocultada_para_quem_denunciou(text, uuid) IS
  'A ocultacao imediata da PUBLICACAO, para quem a denunciou. Mesma regra e mesmo motivo da irma do perfil.';

-- ---------------------------------------------------------------------------
-- 7. O QUE FALTA LIGAR -- texto literal, para a mescla
-- ---------------------------------------------------------------------------
-- Nada abaixo desta linha e executado. Esta aqui porque o que falta ligar
-- depende de migracoes que NAO estao nesta base, e um relatorio em outro lugar
-- se perde da tabela que ele descreve.
--
-- (A) QUANDO `feat/fila-de-moderacao-backoffice` (`e9b1fcb7`) E ESTA FATIA
--     ESTIVEREM NA MESMA ARVORE -- uma migracao nova, com carimbo novo, que
--     faz `CREATE OR REPLACE VIEW fila_de_moderacao` com CINCO pernas: as duas
--     que existem, mais uma coluna nova, mais as tres abaixo.
--
--     A COLUNA NOVA, nas CINCO pernas, e o peso de ordenacao:
--
--       perna `review`:       denunciante_ordena_a_fila(d.reporter_user_id)  AS reporter_weighs
--       perna `conversation`: false                                          AS reporter_weighs
--           -- `false` e nao a funcao: `conversation_reports` nao tem coluna de
--           -- denunciante (o achador pode nao ter conta), e nao ha a quem
--           -- perguntar. A alternativa seria resolver o papel em conta como a
--           -- irma faz, e entao o achador ANONIMO nunca pesaria, o que e pior
--           -- do que nenhuma das duas origens antigas pesar. DECISAO DE QUEM
--           -- JUNTAR AS DUAS BRANCHES, e esta nota existe para ela ser tomada
--           -- e nao herdada.
--       pernas novas:         denunciante_ordena_a_fila(d.reporter_user_id)  AS reporter_weighs
--
--     AS TRES PERNAS NOVAS, com o MESMO contrato de colunas da visao
--     (origin, target_ref, report_id, reason, detail, repeat_count, created_at,
--      last_reported_at, resolved_at, resolution, resolution_reason,
--      reporter_active, target_removed, target_rating, target_body,
--      target_subject [, reporter_weighs]):
--
--     UNION ALL
--     SELECT 'profile'::text,
--            d.subject_ref,
--            d.id, d.reason::text, d.detail, d.repeat_count,
--            d.created_at, d.last_reported_at, d.resolved_at,
--            d.resolution, d.resolution_reason,
--            denuncia_de_perfil_com_denunciante_ativo(d.id),
--            (d.resolution = 'content_removed'),
--            NULL::integer,
--            u.display_name::text,     -- target_body: o ARTEFATO denunciado
--            u.display_name::text      -- target_subject
--       FROM profile_reports d
--       LEFT JOIN users u ON u.id = d.subject_user_id
--
--     UNION ALL
--     SELECT 'photo'::text,
--            d.image_public_key,
--            d.id, d.reason::text, d.detail, d.repeat_count,
--            d.created_at, d.last_reported_at, d.resolved_at,
--            d.resolution, d.resolution_reason,
--            denuncia_de_foto_com_denunciante_ativo(d.id),
--            (d.image_id IS NULL OR d.resolution = 'content_removed'),
--            NULL::integer,
--            d.image_public_key,       -- target_body: a derivada publica
--            u.display_name::text
--       FROM photo_reports d
--       LEFT JOIN users u ON u.id = d.owner_user_id
--
--     UNION ALL
--     SELECT 'publication'::text,
--            d.publication_ref,
--            d.id, d.reason::text, d.detail, d.repeat_count,
--            d.created_at, d.last_reported_at, d.resolved_at,
--            d.resolution, d.resolution_reason,
--            denuncia_de_publicacao_com_denunciante_ativo(d.id),
--            (d.resolution = 'content_removed'),
--            NULL::integer,
--            d.publication_body,       -- target_body: o texto CONGELADO
--            u.display_name::text
--       FROM publication_reports d
--       LEFT JOIN users u ON u.id = d.author_user_id
--
--     `target_removed` sai de `resolution = 'content_removed'` nas tres, e nao
--     de coluna no alvo: a remocao do artefato de perfil, da foto e da
--     publicacao e de quem construir a acao do painel, e inventar a coluna aqui
--     seria adivinhar a forma dela.
--
-- (B) QUANDO A FATIA DA PUBLICACAO (`user_publications`) POUSAR -- uma linha:
--
--     ALTER TABLE publication_reports
--       ADD CONSTRAINT publication_reports_publicacao
--       FOREIGN KEY (publication_id) REFERENCES user_publications (id) ON DELETE SET NULL;
--
-- (C) `ModerationOrigin` no contrato ganha `profile`, `photo` e `publication`,
--     pelo caminho de lista fechada do ADR-0023 secao 3, e a tela ganha os tres
--     rotulos. Nenhuma linha de `src/` da fila muda: a consulta le a VISAO.

-- Down Migration

DROP FUNCTION IF EXISTS publicacao_ocultada_para_quem_denunciou(text, uuid);
DROP FUNCTION IF EXISTS foto_ocultada_para_quem_denunciou(text, uuid);
DROP FUNCTION IF EXISTS perfil_ocultado_para_quem_denunciou(text, uuid);
DROP FUNCTION IF EXISTS denunciante_ordena_a_fila(uuid);
DROP FUNCTION IF EXISTS denuncia_de_publicacao_com_denunciante_ativo(uuid);
DROP FUNCTION IF EXISTS denuncia_de_foto_com_denunciante_ativo(uuid);
DROP FUNCTION IF EXISTS denuncia_de_perfil_com_denunciante_ativo(uuid);
DROP TABLE IF EXISTS publication_reports;
DROP TABLE IF EXISTS photo_reports;
DROP TABLE IF EXISTS profile_reports;
