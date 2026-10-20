-- CURTIR E COMENTAR -- a interacao da primeira versao do Mural.
--
-- Decisao do cliente de 19/10/2026: **"curtir e comentar"** na primeira versao.
-- A fatia da publicacao (`20261020000002`) parou antes das duas, de proposito e
-- por escrito: *"criar aqui duas tabelas que nenhuma operacao le seria repetir,
-- sem a necessidade que a justificou, exatamente o que `publication_reports`
-- fez em 18/10: tabela sem hospedeiro"*. As operacoes chegaram com este
-- arquivo, e as duas tabelas nascem COM leitor.
--
-- ## AS DUAS NASCEM COM LEITURA E COM CONTAGEM EMITIDA
--
-- `like_count`, `comment_count` e `liked_by_me` entram em `Publication` no
-- MESMO commit, e saem da MESMA consulta da linha do tempo. Nao ha coluna
-- denormalizada de contagem, e a ausencia e a decisao mais consequente deste
-- arquivo -- ver a secao 3.
--
-- ## O RECORTE E O MESMO DA PUBLICACAO, e ele nao se repete aqui
--
-- Curtida e comentario de quem nao ve a publicacao **nao existem**: as duas
-- escritas resolvem o alvo pela MESMA consulta que a leitura usa (autor ou
-- conexao aceita, menos bloqueio, menos ocultacao por denuncia), e endereco que
-- nao passa por ela responde `404` -- nunca `403`.
--
-- **Nenhum predicado de visibilidade mora nestas tabelas**, e isso e de
-- proposito: elas sao a ARESTA (quem curtiu o que, quem comentou o que), e o
-- recorte e da LEITURA. Repetir o predicado aqui seria a segunda copia dele.
--
-- ## O QUE ESTE ARQUIVO NAO RESOLVE, e esta dito em voz alta
--
-- **A DENUNCIA DE COMENTARIO NAO EXISTE, E FICAR SEM ELA FOI DECISAO DO
-- CLIENTE EM 20/10/2026.**
--
-- Isto nao e esquecimento e nao e divida descoberta depois: a medicao abaixo foi
-- levada a ele com o custo na mesa, e ele escolheu deixar para depois. A data
-- esta aqui para quem ler em seis meses saber que alguem olhou e decidiu.
--
-- Medido: os CINCO motivos de `publication_reports` servem a um comentario sem
-- mudanca nenhuma -- `offensive_or_discriminatory`, `scam_or_animal_sale`,
-- `false_lost_pet_info` (um comentario pode inventar um avistamento tanto
-- quanto uma publicacao), `spam_or_repetition` e `other`. **O que falta nao e
-- motivo: e ALVO.** Um comentario nao e uma publicacao, e `publication_reports`
-- e chaveada em `publication_ref`; apontar a denuncia de um comentario para a
-- publicacao faria o administrador julgar o texto errado.
--
-- O custo da fatia que falta, por extenso, para quem a pedir:
--   - `comment_reports`, no molde das outras tres (`20261018000032`);
--   - a SEXTA perna de `UNION ALL` em `fila_de_moderacao`;
--   - `comment` no `enum` `ModerationOrigin` -- hoje com cinco;
--   - uma operacao nova em `safety`, que passaria de SEIS para SETE (e o numero
--     seis e afirmado por `publicacao-nao-sai-para-quem-nao-tem-relacao.test.ts`
--     e por `denuncia-de-publicacao-confere-o-alvo.test.ts`);
--   - o rotulo do alvo novo na tela do painel.
--
-- **O que existe enquanto ela nao chega, e nao e nada:** quem comenta apaga o
-- proprio comentario, **o dono da publicacao apaga comentario de terceiro na
-- publicacao DELE** (decisao do cliente de 20/10/2026 -- e isso e dono
-- limpando a propria casa, NAO moderacao: nao passa por fila, nao tem
-- administrador e nao tem revisao), e **bloquear o autor some com os
-- comentarios dele** --
-- `bloqueio_entre` esta no `WHERE` da leitura de comentario, como esta no da
-- publicacao. O que NAO existe e o administrador agir sobre um comentario.
-- **Isto e risco conhecido e nao surpresa**, e a decisao do cliente de 18/10 e
-- moderacao minima com o administrador no backoffice -- entao a fila e o lugar
-- certo, e ela ainda nao alcanca comentario.
--
-- **E NAO HA FILTRO DE PALAVRA**, nem aqui nem em `src/`: a mesma decisao que
-- vale para a publicacao (*"deixe o texto livre na timeline"*) vale para o
-- comentario, e inventar um filtro para o comentario seria resolver por conta
-- propria o que ele mandou resolver pelo painel.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. `publication_likes` -- a curtida, e ela e UMA POR PESSOA POR PUBLICACAO
-- ---------------------------------------------------------------------------
-- **A UNICIDADE E A CHAVE PRIMARIA, e e ela que faz "curtir duas vezes nao
-- conta duas".**
--
-- Nao e um `UPDATE ... SET count = count + 1`, nao e um `INSERT` com conferencia
-- em `src/` e nao e um `CHECK`: e a chave primaria composta. Sob concorrencia,
-- duas requisicoes simultaneas da mesma pessoa produzem uma linha e um conflito
-- -- e o conflito e absorvido por `ON CONFLICT DO NOTHING` na escrita, que e o
-- que torna curtir IDEMPOTENTE sem laco de retentativa.
--
-- A alternativa -- conferir antes de inserir -- tem uma janela entre a leitura e
-- a escrita, e e exatamente a janela em que o toque duplo do dedo na tela entra
-- duas vezes. O banco nao tem essa janela.
--
-- **NENHUM `id` proprio**, e a ausencia e deliberada: a curtida nao tem endereco
-- publico, nao sai em resposta individual e nao se enderecava por nada. O que
-- sai dela e a CONTAGEM e o booleano `liked_by_me`. Um `id` aqui seria
-- identificador sem leitor -- e, pior, o comeco de uma lista de quem curtiu,
-- que o item 7 da Emenda 5 do ADR-0010 registra como nao autorizada.
CREATE TABLE publication_likes (
  publication_id uuid        NOT NULL
                             REFERENCES user_publications (id) ON DELETE CASCADE,

  -- Quem curtiu. Entra no `WHERE` de toda escrita e da leitura de
  -- `liked_by_me`; **nunca e projetada**. `CASCADE`: a curtida morre com o
  -- expurgo da conta, e a contagem cai com ela -- o que e correto, porque a
  -- pessoa que curtiu deixou de existir.
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- **A UNICIDADE. Ver o cabecalho desta secao.**
  PRIMARY KEY (publication_id, user_id)
);

COMMENT ON TABLE publication_likes IS
  'A CURTIDA de uma publicacao do Mural. Decisao do cliente de 19/10/2026 ("curtir e comentar" na primeira versao). UMA POR PESSOA POR PUBLICACAO, e a unicidade e a CHAVE PRIMARIA composta -- nao um CHECK, nao uma conferencia em src/: sob concorrencia, duas requisicoes simultaneas da mesma pessoa produzem uma linha e um conflito, absorvido por ON CONFLICT DO NOTHING, e e isso que torna curtir idempotente sem laco de retentativa. Conferir antes de inserir teria a janela em que o toque duplo entra duas vezes. SEM id proprio: a curtida nao tem endereco publico e nao sai em resposta individual -- o que sai e a CONTAGEM e o booleano liked_by_me. NAO EXISTE LISTA DE QUEM CURTIU, em superficie nenhuma: o item 7 da Emenda 5 do ADR-0010 registra que "parecido com o Instagram" foi dito sobre a FOTO e nao autoriza redesenho, e a decisao de 19/10 sobre curtir e CONTAGEM -- contagem nao diz quem. O recorte de quem pode curtir e da LEITURA e nao desta tabela: a escrita resolve o alvo pela mesma consulta da linha do tempo (autor ou conexao aceita, menos bloqueio, menos ocultacao por denuncia), e endereco que nao passa por ela responde 404 e nunca 403 (ADR-0021).';

COMMENT ON COLUMN publication_likes.user_id IS
  'Quem curtiu. Entra no WHERE de toda escrita e da leitura de liked_by_me; NUNCA e projetada. Nao existe operacao que devolva quem curtiu uma publicacao, e a ausencia e o item 7 da Emenda 5 do ADR-0010. CASCADE: a curtida morre com o expurgo da conta.';

-- A CONTAGEM POR PUBLICACAO. `count(*)` da linha do tempo filtra por
-- `publication_id`, e sem este indice cada publicacao da pagina custaria uma
-- varredura. A chave primaria **ja** indexa `(publication_id, user_id)` nessa
-- ordem, entao a contagem usa o prefixo dela -- **nao ha indice novo para a
-- contagem**, e a ausencia e deliberada.

-- A LEITURA DE `liked_by_me` filtra por `(publication_id, user_id)`, que e a
-- chave primaria inteira. Tambem sem indice novo.

-- ---------------------------------------------------------------------------
-- 2. `publication_comments` -- o comentario
-- ---------------------------------------------------------------------------
-- Molde de `user_publications`, coluna por coluna, e a repeticao e o mecanismo:
-- `id` interno, `public_ref` de 22 simbolos, corpo com o MESMO teto de 280,
-- `created_at` e exclusao logica.
--
-- **280, e o numero nao e escolha deste arquivo.** E o teto do corpo da
-- publicacao, que por sua vez e o de `publication_reports.publication_body` e o
-- de `pets.care_notes`. Um teto diferente para o comentario seria um quarto
-- numero para a mesma coisa -- texto curto que uma pessoa escreve nesta casa.
--
-- **TEXTO LIVRE, SEM FILTRO DE PALAVRA.** A decisao do cliente de 18/10 vale
-- aqui inteira: *"deixe o texto livre na timeline"* e *"quem modera vai ser o
-- administrador, deve ir para a pagina de backoffice"*. Nao ha `CHECK` de
-- conteudo, e o `CHECK` de `[<>]` das denuncias tambem nao se repete -- ali ele
-- protege campo que o painel renderiza, aqui recusaria "3 < 5".
--
-- **SEM FOTO, e a ausencia e escopo.** O cliente pediu "comentar", e comentario
-- com imagem e uma segunda esteira de midia numa superficie de terceiro. Nao ha
-- coluna, entao nao ha o que preencher por engano.
--
-- **SEM RESPOSTA ANINHADA.** Nao ha `parent_comment_id`: fio de resposta e
-- outro objeto, com outra leitura e outra paginacao, e ele nao foi pedido.
CREATE TABLE publication_comments (
  id             uuid        PRIMARY KEY,

  -- A PUBLICACAO. `CASCADE`: apagar a publicacao leva os comentarios, e isso e
  -- o desenho -- comentario de publicacao que nao existe mais nao tem contexto
  -- nenhum, e deixa-lo orfao seria repetir o defeito que a chave estrangeira de
  -- `publication_reports` existiu dezoito dias para consertar.
  --
  -- **E a exclusao LOGICA da publicacao nao dispara este `CASCADE`**: ela e um
  -- `UPDATE`. Os comentarios ficam na tabela e param de ser lidos, porque a
  -- leitura deles exige a publicacao viva. O `CASCADE` vale no expurgo da conta,
  -- que apaga a publicacao de verdade.
  publication_id uuid        NOT NULL
                             REFERENCES user_publications (id) ON DELETE CASCADE,

  -- Quem comentou. Entra no `WHERE`; **nunca e projetada** -- o que sai do
  -- autor e o apelido, o nome e a `thumb` da foto (Emenda 5), por juncao.
  author_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- O endereco publico, na MESMA forma de `user_publications.public_ref` e de
  -- `users.public_ref`. E ele que `DELETE` recebe.
  public_ref     text        NOT NULL
                             CONSTRAINT publication_comments_ref_unico UNIQUE
                             CONSTRAINT publication_comments_ref_forma
                             CHECK (public_ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- O texto, LIVRE, 1 a 280. Ver o cabecalho desta secao.
  body           text        NOT NULL
                             CONSTRAINT publication_comments_corpo_tamanho
                             CHECK (char_length(body) BETWEEN 1 AND 280),

  created_at     timestamptz NOT NULL DEFAULT now(),

  -- EXCLUSAO LOGICA, pelo mesmo molde da publicacao. Aqui ela nao tem denuncia
  -- apontando para a linha (a denuncia de comentario nao existe -- ver o
  -- cabecalho do arquivo), e fica assim mesmo por DUAS razoes: a simetria com a
  -- publicacao, e o dia em que `comment_reports` existir -- naquele dia a
  -- chave estrangeira dela encontra a linha de pe, sem migracao de dado.
  deleted_at     timestamptz
);

COMMENT ON TABLE publication_comments IS
  'O COMENTARIO de uma publicacao do Mural. Decisao do cliente de 19/10/2026 ("curtir e comentar" na primeira versao). Molde de user_publications, coluna por coluna. 280 nao e escolha deste arquivo: e o teto do corpo da publicacao, que e o de publication_reports.publication_body e o de pets.care_notes -- um quarto numero para a mesma coisa e o que ninguem consegue explicar depois. TEXTO LIVRE SEM FILTRO DE PALAVRA, pela mesma decisao do cliente de 18/10 que vale para a publicacao: a moderacao e a denuncia mais a fila do painel, e nao um CHECK aqui. SEM FOTO (comentario com imagem seria uma segunda esteira de midia em superficie de terceiro, e nao foi pedido) e SEM RESPOSTA ANINHADA (nao ha parent_comment_id: fio de resposta e outro objeto, com outra leitura e outra paginacao). A DENUNCIA DE COMENTARIO NAO EXISTE AINDA, e isso e risco conhecido e declarado: os cinco motivos de publication_reports servem a um comentario sem mudanca, mas o ALVO e outro -- falta comment_reports, a sexta perna de fila_de_moderacao, o valor comment em ModerationOrigin e uma operacao em safety (que passaria de seis para sete). Enquanto ela nao chega, quem comenta apaga o proprio comentario e BLOQUEAR O AUTOR SOME COM OS COMENTARIOS DELE -- bloqueio_entre esta no WHERE da leitura. O que nao existe e o administrador agir sobre um comentario. QUEM VE: quem ve a publicacao, pelo MESMO recorte dela (autor ou conexao aceita, menos bloqueio, menos ocultacao por denuncia), resolvido na clausula WHERE (ADR-0021); 404 e nunca 403.';

COMMENT ON COLUMN publication_comments.publication_id IS
  'A publicacao comentada. ON DELETE CASCADE: o expurgo da conta apaga a publicacao de verdade e leva os comentarios com ela -- comentario de publicacao inexistente nao tem contexto, e deixa-lo orfao repetiria o defeito que a chave estrangeira de publication_reports existiu dezoito dias para consertar. A exclusao LOGICA da publicacao NAO dispara este CASCADE (ela e um UPDATE): os comentarios ficam e param de ser lidos, porque a leitura exige a publicacao viva.';

COMMENT ON COLUMN publication_comments.deleted_at IS
  'EXCLUSAO LOGICA, pelo molde da publicacao. Nao ha denuncia apontando para esta linha hoje (a denuncia de comentario nao existe), e fica logica mesmo assim por duas razoes: simetria com a publicacao, e o dia em que comment_reports existir -- naquele dia a chave estrangeira dela encontra a linha de pe, sem migracao de dado.';

-- A LISTAGEM DE COMENTARIOS de uma publicacao, em ordem e sem os apagados.
--
-- `created_at ASC` e nao `DESC`: comentario se le na ordem em que foi escrito,
-- ao contrario da linha do tempo. `public_ref` desempata, pela mesma razao da
-- publicacao -- dois comentarios no mesmo milissegundo, e o cursor precisa de
-- ordem total.
CREATE INDEX publication_comments_da_publicacao
  ON publication_comments (publication_id, created_at ASC, public_ref ASC)
  WHERE deleted_at IS NULL;

-- A CONTAGEM por publicacao usa o prefixo do indice acima. **Nenhum indice
-- novo para ela.**

-- Down Migration

DROP INDEX IF EXISTS publication_comments_da_publicacao;
DROP TABLE IF EXISTS publication_comments;
DROP TABLE IF EXISTS publication_likes;
