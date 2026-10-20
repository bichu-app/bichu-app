-- O MURAL -- `user_publications`, a tabela que tres comentarios desta base
-- declararam faltando.
--
-- Pedido do cliente de 20/10/2026, literal: *"na secao do mural, nao tem a
-- caixa de texto para o usuario escrever uma mensagem, subir uma foto e
-- publicar o conteudo."* A rota `/mural` existe desde 19/10 como ramo da casca,
-- de proposito sem acao de publicar -- porque nao havia onde guardar
-- publicacao. Este arquivo cria onde.
--
-- ## O QUE ESTA MIGRACAO FECHA, e cada item tem um comentario pedindo
--
-- Tres lugares desta base dizem a MESMA coisa, e os tres param aqui:
--
--   - `src/shared/db/schema.ts` -- "SEM chave estrangeira: `user_publications`
--     e de outra fatia e nao existe";
--   - `migrations/20261018000032`, linha 90 -- "A tabela de publicacoes
--     (`user_publications`) e de outra fatia e NAO EXISTE nesta base";
--   - `migrations/20261018000032`, item (B) do recado -- "QUANDO A FATIA DA
--     PUBLICACAO (`user_publications`) POUSAR -- uma linha".
--
-- A linha do item (B) esta na secao 4 abaixo, e com ela a linha orfa de
-- `publication_reports` deixa de ser possivel.
--
-- ## O QUE ESTA MIGRACAO **NAO** CRIA, e a ausencia e escopo e nao esquecimento
--
-- **Nao ha `publication_likes` nem `publication_comments`.** O cliente decidiu
-- "curtir e comentar" para a primeira versao, e as duas sao prioridade 4 da
-- frente -- depois de publicar, ver o proprio e a linha do tempo. Criar aqui
-- duas tabelas que nenhuma operacao le seria repetir, sem a necessidade que a
-- justificou, exatamente o que `publication_reports` fez em 18/10: tabela sem
-- hospedeiro. Aquilo foi inevitavel (a denuncia nasceu antes do alvo); isto nao
-- e -- o carimbo da migracao de curtir e comentar e pedido quando elas forem
-- construidas.
--
-- **Nao ha "seguir".** Decisao do cliente de 18/10 foi "os dois, conexao e
-- seguir", e seguir assimetrico e objeto novo: tabela, operacoes e uma lista de
-- "quem me segue" que o portao `conexao-nao-expoe-lista-nem-identificador.test.ts`
-- nomeia num caso proprio (*"NAO EXISTE 'seguir': nenhum campo, valor ou
-- operacao de `follow`"*). Nao se decide isso numa migracao. **A linha do tempo
-- desta migracao e inteiramente sobre CONEXAO ACEITA**, e e o que a Emenda 2 do
-- ADR-0010 ja sustenta.
--
-- ## A VISAO DE MODERACAO E O ENUM JA ESTAO PRONTOS -- medido, nao suposto
--
-- Os itens 7 e 8 do desenho (`ModerationOrigin` ganha `publication`, e a perna
-- `publication` da visao `fila_de_moderacao`) **ja estao na `development`**:
-- a perna e SQL executado na secao 7 da `20261018000032` (linha 621, `FROM
-- publication_reports d`), e o `enum` do contrato ja lista os cinco valores
-- (`api/openapi.yaml`, `ModerationOrigin`). Nao ha nada a fazer por eles aqui,
-- e repetir qualquer um dos dois seria uma segunda definicao.
--
-- `publicacao_ocultada_para_quem_denunciou(text, uuid)` tambem existe
-- (`20261018000032`, secao 6), e e ela que a leitura desta fatia chama no
-- `WHERE` -- nao uma segunda expressao escrita em Kysely.

-- Up Migration

-- ---------------------------------------------------------------------------
-- 1. O SETIMO PROPOSITO -- e a conta das SETE, por extenso
-- ---------------------------------------------------------------------------

-- **A LISTA E A UNIAO DAS SETE, E A CONTA FOI REFEITA.**
--
-- `DROP CONSTRAINT` + `ADD CONSTRAINT` **reescreve** a lista inteira: escrever
-- aqui so `user_publication` nao ACRESCENTA um proposito -- APAGA os seis que
-- estao em vigor. A `20261018000040` quase entrou com esse defeito (ela teria
-- apagado `directory_logo`, `directory_photo` e `user_photo`) e foi pega em
-- BEGIN/ROLLBACK antes do banco; o cabecalho dela encerra com "Quem
-- acrescentar a setima repete esta conta -- e roda em BEGIN/ROLLBACK, porque
-- foi so isso que pegou esta".
--
-- Repetido. As seis em vigor, lidas da `20261018000040` (a ultima que reescreveu
-- estes dois `CHECK`): `store_item`, `network_event`, `directory_logo`,
-- `directory_photo`, `user_photo`, `user_showcase`. Com `user_publication`, SETE.
-- A prova de BEGIN/ROLLBACK -- as seis sobrevivem, a setima entra, a oitava
-- inventada e recusada -- esta no relatorio desta fatia.
--
-- **Proposito NOVO, e nao reuso de `user_showcase`.** Os dois sao foto que a
-- propria pessoa envia do celular, mas quem os ve e quando e outra coisa: a
-- vitrine e uma grade de ate nove no PERFIL, com ordem e capa, visivel ao dono e
-- a conexao aceita; a publicacao e UMA foto presa a UM texto, que aparece na
-- linha do tempo de quem tem conexao aceita e nao tem ordem nenhuma. Um
-- proposito so para os dois obrigaria a derivada a adivinhar qual tela vai
-- desenhar a imagem -- que e a frase que `20261018000040` ja escreveu para
-- separar `user_showcase` de `user_photo`.
ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase', 'user_publication'));

ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase', 'user_publication'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `user_showcase` e a vitrine do usuario e `user_publication` e a foto de UMA publicacao do Mural; os dois tem autor em `user_id` e nunca em `admin_account_id`.';

-- ---------------------------------------------------------------------------
-- 2. `user_publications` -- a publicacao do Mural
-- ---------------------------------------------------------------------------
-- UMA publicacao = texto livre obrigatorio + no maximo UMA foto.
--
-- ## IDENTIDADE INTERNA SEPARADA DA PUBLICA (ADR-0024, ADR-0010 item 6)
--
-- `id` e a chave primaria e **nunca sai em resposta**; `public_ref` e o
-- endereco, 128 bits em base64url, 22 simbolos -- a MESMA forma de
-- `users.public_ref` e exatamente a forma que `publication_reports` ja cobra
-- (`CHECK (publication_ref ~ '^[A-Za-z0-9_-]{22}$')`). A forma nao e escolha
-- desta migracao: ela foi fixada por quem escreveu a denuncia antes de a tabela
-- existir, e divergir dela faria a denuncia nao achar o alvo.
--
-- ## TEXTO LIVRE, 280, E **NENHUM FILTRO DE PALAVRA**
--
-- Decisao do cliente, literal: *"deixe o texto livre na timeline"* e *"quem
-- modera vai ser o administrador, deve ir para a pagina de backoffice"*. Nao ha
-- `CHECK` de conteudo aqui, nao ha lista de palavra, e nao ha nada em `src/` que
-- recuse texto por conteudo. O `CHECK` de `[<>]` que `detail` das denuncias usa
-- **nao** se repete aqui de proposito: ali ele protege um campo que o painel
-- renderiza, aqui ele recusaria "3 < 5" num texto que o cliente mandou deixar
-- livre.
--
-- 280 **nao e escolha minha**: e o teto que `publication_reports.publication_body`
-- ja cobra, e e o mesmo de `pets.care_notes`. Um numero diferente aqui faria a
-- copia congelada da denuncia truncar o texto julgado.
--
-- `body` e `NOT NULL` e minimo 1: publicacao vazia com foto seria um objeto sem
-- nada que o leitor de tela anuncie na linha do tempo, e a caixa que o cliente
-- pediu e "escrever uma mensagem, subir uma foto" -- nessa ordem.
--
-- ## A FOTO E UMA COLUNA, E NAO UMA TABELA DE LIGACAO
--
-- `user_showcase_images` e `network_event_images` sao tabelas porque sao MUITAS
-- imagens com ORDEM. Aqui e uma, sem ordem: uma tabela de ligacao com no maximo
-- uma linha por publicacao seria um `JOIN` a mais em toda leitura da linha do
-- tempo para expressar uma unicidade que `UNIQUE` expressa melhor.
--
-- `UNIQUE` em `image_id` -- e nao so a coluna: sem ela, o mesmo envio
-- confirmado poderia virar duas publicacoes, e a segunda apareceria na linha do
-- tempo como conteudo novo que ninguem enviou.
--
-- `ON DELETE SET NULL`: imagem apagada deixa o TEXTO de pe. O inverso -- a
-- publicacao morrer com a imagem -- apagaria a mensagem da pessoa por causa de
-- um objeto no balde.
--
-- ## EXCLUSAO LOGICA, e o motivo e a denuncia
--
-- `deleted_at` e nao `DELETE`. A chave estrangeira da secao 4 e `SET NULL`, e um
-- `DELETE` fisico deixaria a denuncia aberta sem alvo no meio da fila; com
-- `deleted_at` a linha fica, a fila continua achando o id, e `target_body` da
-- visao continua lendo a copia congelada de `publication_body`. Toda leitura
-- desta fatia carrega `deleted_at IS NULL` no `WHERE`, e nao num `if` de camada
-- acima (ADR-0021).
--
-- ## NADA DE PET, e isso e o item 7 do ADR-0010
--
-- **Nao existe coluna de pet nesta tabela**, e a ausencia e a regra: ligar uma
-- publicacao a ficha de um pet agruparia os pets de um tutor, que o item 7
-- proibe e que a Emenda 2 abriu **so** para a contagem. Foto de pet numa
-- publicacao e permitida (decisao do cliente de 19/10); marcar o pet, nao -- e a
-- diferenca e esta tabela nao ter onde guardar a marca. Coluna ausente ninguem
-- preenche por engano; um `if` alguem esquece de repetir.
--
-- ## NADA DE LUGAR, e isso e o ADR-0006
--
-- Nao existe cidade, bairro, coordenada nem `location` aqui. "Publicacoes perto
-- de voce" seria coordenada disfarcada, e nao ha geocodificacao neste produto.
CREATE TABLE user_publications (
  id              uuid        PRIMARY KEY,

  -- O AUTOR. `CASCADE` e nao `SET NULL`: a publicacao e conteudo da pessoa, e o
  -- expurgo da conta a leva. O que SOBREVIVE ao expurgo e a DENUNCIA, que
  -- guarda `publication_ref` e `publication_body` em copia -- e por isso a
  -- cascata aqui nao apaga prova nenhuma.
  --
  -- Entra no `WHERE` de toda leitura e de toda escrita; **nunca e projetada**.
  author_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- O endereco publico. A forma e a de `users.public_ref` e a que
  -- `publication_reports.publication_ref` ja cobra.
  public_ref      text        NOT NULL
                              CONSTRAINT user_publications_ref_unico UNIQUE
                              CONSTRAINT user_publications_ref_forma
                              CHECK (public_ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- O TEXTO, LIVRE. Ver o cabecalho: 280 vem da denuncia, e nao ha filtro.
  body            text        NOT NULL
                              CONSTRAINT user_publications_corpo_tamanho
                              CHECK (char_length(body) BETWEEN 1 AND 280),

  -- A FOTO, opcional e UNICA. `purpose = 'user_publication'` e conferido pelo
  -- caso de uso, como a vitrine faz: o `CHECK` nao alcanca outra tabela.
  image_id        uuid        CONSTRAINT user_publications_imagem_unica UNIQUE
                              REFERENCES catalog_images (id) ON DELETE SET NULL,

  -- O ROTULO DO LEITOR DE TELA, **opcional**, e a decisao esta no relatorio.
  --
  -- A faixa 2-150 e a MESMA de `network_event_images.alt_text`, que e
  -- obrigatoria la. Aqui ela e opcional porque as duas superficies nao se
  -- parecem: na capa do encontro a imagem E o conteudo e nao ha texto ao lado
  -- dela; aqui `body` e `NOT NULL` e o leitor de tela sempre tem o que anunciar.
  -- Exigir `alt_text` poria uma quarta exigencia na frente da unica acao que o
  -- cliente pediu ("escrever uma mensagem, subir uma foto e publicar").
  --
  -- Quando ela e nula, o app anuncia um rotulo generico ("Foto da publicacao")
  -- em vez de esconder a imagem do leitor: quem nao ve precisa saber que ha uma
  -- foto ali, mesmo sem saber o que ela mostra.
  alt_text        text        CONSTRAINT user_publications_texto_alternativo_tamanho
                              CHECK (alt_text IS NULL
                                     OR char_length(alt_text) BETWEEN 2 AND 150),

  -- Texto alternativo sem imagem nao descreve nada. Sem este `CHECK` a coluna
  -- aceitaria um rotulo que nenhuma superficie le.
  CONSTRAINT user_publications_texto_alternativo_pede_imagem
    CHECK (image_id IS NOT NULL OR alt_text IS NULL),

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- EXCLUSAO LOGICA. Ver o cabecalho: a denuncia e o motivo.
  deleted_at      timestamptz
);

COMMENT ON TABLE user_publications IS
  'A PUBLICACAO DO MURAL -- texto livre ate 280 mais no maximo UMA foto. Pedido do cliente de 20/10/2026 ("caixa de texto para o usuario escrever uma mensagem, subir uma foto e publicar o conteudo"). QUEM VE: o autor, em GET /me/publications (as proprias, inclusive sem conexao nenhuma), e quem e CONEXAO ACEITA do autor, em GET /timeline -- Emenda 2 do ADR-0010 por contraposicao, a mesma leitura que liberou a vitrine para conexao aceita em 19/10. A QUEM NAO TEM RELACAO, A QUEM NAO TEM CONTA E EM SUPERFICIE PUBLICA: NUNCA. Nao existe operacao que devolva a publicacao de quem nao e conexao aceita, e a autorizacao mora na clausula WHERE da consulta (EXISTS sobre user_connections com state=accepted nos dois sentidos, mais conta_habilitada das duas pontas, NOT bloqueio_entre e NOT publicacao_ocultada_para_quem_denunciou), e nao numa camada acima: ADR-0021. Publicacao invisivel responde 404 e NUNCA 403, pelo mesmo motivo do perfil: distinguir os dois seria oraculo. TEXTO LIVRE SEM FILTRO DE PALAVRA, por decisao do cliente ("deixe o texto livre na timeline", "quem modera vai ser o administrador, deve ir para a pagina de backoffice"): a moderacao e a denuncia (publication_reports, 20261018000032) somada a fila do painel, e nao um CHECK aqui. NADA DE PET: nao existe coluna que ligue publicacao a ficha de pet, porque isso agruparia os pets de um tutor (item 7 do ADR-0010); foto de pet e permitida, marcar o pet nao. NADA DE LUGAR: ADR-0006, nao ha geocodificacao e "publicacoes perto de voce" seria coordenada disfarcada. O endereco que sai e public_ref (22 simbolos, a forma que publication_reports ja cobrava antes desta tabela existir) e NUNCA o id.';

COMMENT ON COLUMN user_publications.author_user_id IS
  'Quem publicou. Entra no WHERE de toda leitura e de toda escrita (ADR-0021) e NUNCA e projetada: o que sai do autor e o apelido e o nome de exibicao, resolvidos por juncao. CASCADE: a publicacao morre com o expurgo da conta, e a denuncia sobrevive porque guarda publication_ref e publication_body em COPIA.';

COMMENT ON COLUMN user_publications.body IS
  'O texto, LIVRE. 280 e o teto que publication_reports.publication_body ja cobra e o mesmo de pets.care_notes -- um numero diferente aqui faria a copia congelada da denuncia truncar o texto julgado. NAO HA FILTRO DE PALAVRA, por decisao do cliente: nem CHECK aqui, nem conferencia em src/. Nem o CHECK de [<>] das denuncias se repete: ali ele protege campo que o painel renderiza, aqui recusaria "3 < 5".';

COMMENT ON COLUMN user_publications.image_id IS
  'A foto, opcional e UNICA. purpose = user_publication, conferido pelo caso de uso (CHECK nao alcanca outra tabela), como a vitrine faz. UNIQUE: sem ela o mesmo envio confirmado viraria duas publicacoes. SET NULL: imagem apagada deixa o texto de pe -- o inverso apagaria a mensagem da pessoa por causa de um objeto no balde.';

COMMENT ON COLUMN user_publications.alt_text IS
  'Rotulo para leitor de tela, OPCIONAL -- e a faixa 2-150 e a mesma de network_event_images.alt_text, onde ela e obrigatoria. A diferenca e a superficie: na capa do encontro a imagem E o conteudo e nao ha texto ao lado; aqui body e NOT NULL e ha sempre o que anunciar. Nulo faz o app anunciar um rotulo generico, e nao esconder a imagem do leitor.';

COMMENT ON COLUMN user_publications.deleted_at IS
  'EXCLUSAO LOGICA, e a denuncia e o motivo: a chave estrangeira de publication_reports.publication_id e SET NULL, e um DELETE fisico deixaria a denuncia aberta sem alvo no meio da fila. Toda leitura carrega deleted_at IS NULL no WHERE.';

-- ---------------------------------------------------------------------------
-- 3. OS INDICES -- um por consulta que existe, e nenhum a mais
-- ---------------------------------------------------------------------------

-- A LINHA DO TEMPO. A consulta e "as publicacoes vivas de quem e conexao aceita
-- de quem chama, mais recente primeiro", e o `EXISTS` sobre `user_connections`
-- e o filtro. Este indice serve ao recorte por autor somado a ordem.
--
-- `created_at DESC, public_ref DESC` e nao so `created_at`: duas publicacoes no
-- mesmo milissegundo empatariam, e o paginador por cursor devolveria a mesma
-- linha duas vezes ou nenhuma.
--
-- **O desempate e `public_ref` e NAO `id`, e a escolha e do item 6 do
-- ADR-0010.** O cursor que o cliente recebe carrega as duas colunas da ordem; se
-- a segunda fosse `id`, o cursor levaria um UUID interno para fora -- e base64
-- nao e segredo. `public_ref` ja e o endereco publico da linha, e por isso ele
-- pode sair. A consequencia e que ele precisa estar NESTE indice: cursor cuja
-- coluna de desempate nao esta na arvore vira varredura.
CREATE INDEX user_publications_da_linha_do_tempo
  ON user_publications (author_user_id, created_at DESC, public_ref DESC)
  WHERE deleted_at IS NULL;

-- AS MINHAS PUBLICACOES. Mesmo recorte por autor, e por isso o indice de cima
-- a serve tambem -- **nao ha indice novo para `GET /me/publications`**, e a
-- ausencia e deliberada: indice e escrita paga em todo `INSERT`.

-- O ENDERECO PUBLICO. `UNIQUE` acima ja cria o indice que `GET`/`DELETE` por
-- `public_ref` usam; um segundo seria a mesma arvore pagando duas vezes.

-- ---------------------------------------------------------------------------
-- 4. A CHAVE ESTRANGEIRA QUE ESPERAVA -- o item (B) da `20261018000032`
-- ---------------------------------------------------------------------------
-- Uma linha, escrita, comentada e justificada naquele arquivo desde 18/10. Ela
-- nao pode rodar antes da secao 2 acima: `ALTER` para tabela inexistente
-- reprova a subida inteira com "relation user_publications does not exist" e
-- leva as outras migracoes da rodada com ele -- que e exatamente a razao pela
-- qual ela ficou comentada.
--
-- **Com ela, a linha orfa deixa de ser possivel.** A frase daquele arquivo --
-- "ate a fatia da publicacao pousar, `publication_reports.publication_id` pode
-- apontar para uma publicacao que nao existe -- linha orfa e possivel, e nada no
-- banco a impede" -- deixa de valer nesta migracao.
--
-- `SET NULL` e nao `CASCADE`, e a escolha e a do arquivo que a escreveu: a
-- denuncia e "o unico registro desta frente que sobrevive a exclusao da conta",
-- e `CASCADE` aqui apagaria a prova de que houve resposta -- que e justamente o
-- que a retencao de 24 meses existe para guardar. A fila continua agrupando pelo
-- MESMO `publication_ref`, que esta em copia.
ALTER TABLE publication_reports
  ADD CONSTRAINT publication_reports_publicacao
  FOREIGN KEY (publication_id) REFERENCES user_publications (id) ON DELETE SET NULL;

COMMENT ON COLUMN publication_reports.publication_id IS
  'A publicacao denunciada. **A CHAVE ESTRANGEIRA ENTROU EM 20/10/2026** (migracao 20261020000002), pela linha que a 20261018000032 deixou escrita e comentada no item (B) do recado dela: user_publications passou a existir. Linha orfa NAO E MAIS POSSIVEL. ON DELETE SET NULL e nao CASCADE: a denuncia e o unico registro desta frente que sobrevive ao expurgo, e CASCADE apagaria a prova de que houve resposta -- a fila continua agrupando pelo MESMO publication_ref, que esta em copia, e target_body continua lendo publication_body, congelado.';

-- Down Migration

-- A CHAVE ESTRANGEIRA SAI **ANTES** da tabela, e a ordem e o cuidado: com ela
-- de pe, `DROP TABLE user_publications` falharia por dependencia e a descida
-- pararia no meio, deixando o `CHECK` de sete propositos com a tabela ainda
-- presente.
ALTER TABLE publication_reports
  DROP CONSTRAINT publication_reports_publicacao;

COMMENT ON COLUMN publication_reports.publication_id IS
  'SEM chave estrangeira: user_publications e de outra fatia e nao existe nesta base. O ALTER de uma linha que a liga esta no fim da 20261018000032. Ate ele rodar, nada impede linha orfa.';

DROP INDEX IF EXISTS user_publications_da_linha_do_tempo;

DROP TABLE IF EXISTS user_publications;

-- E O `CHECK` VOLTA AS SEIS. Sem isto a descida deixaria `user_publication`
-- aceito num banco onde nenhuma tabela o consome, e o proximo envio com esse
-- proposito criaria uma imagem que nada le -- o espelho do defeito que a
-- `20261018000040` pegou, do outro lado.
ALTER TABLE catalog_images
  DROP CONSTRAINT catalog_images_proposito;
ALTER TABLE catalog_images
  ADD CONSTRAINT catalog_images_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase'));

ALTER TABLE catalog_upload_intents
  DROP CONSTRAINT catalog_upload_intents_proposito;
ALTER TABLE catalog_upload_intents
  ADD CONSTRAINT catalog_upload_intents_proposito
  CHECK (purpose IN ('store_item', 'network_event',
                     'directory_logo', 'directory_photo', 'user_photo',
                     'user_showcase'));

COMMENT ON COLUMN catalog_upload_intents.purpose IS
  'O proposito, gravado no envio: a escrita que confirma exige o MESMO (T9). `user_showcase` e a vitrine do usuario, cujo autor e `user_id` e nunca `admin_account_id`.';
