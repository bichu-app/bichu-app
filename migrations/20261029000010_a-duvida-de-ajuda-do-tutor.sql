-- A DUVIDA DE AJUDA DO TUTOR -- UMA FILA GRAVADA, E NENHUM AVISO.
--
-- Pedido do cliente, 29/10/2026, literal: "no menu do usuario, adicione um
-- botao de ajuda, que abrira uma pagina com um formulario de duvida".
--
-- Perguntado ONDE a duvida para, com tres saidas na mesa, ele escolheu:
-- **grava no banco e vai para o backoffice**, na variante **SEM notificacao
-- por e-mail**. A duvida fica registrada numa fila que ele olha pelo painel.
--
-- Por isso esta migracao cria UMA tabela e nada mais: nao ha gatilho que
-- escreva em `notification_items`, nao ha linha em fila de envio, nao ha
-- coluna de `notified_at`. **A ausencia de aviso e a decisao, e nao um pedaco
-- que faltou.** Quem vier depois e achar que falta um disparo aqui precisa de
-- uma decisao nova do cliente, nao de um conserto.
--
-- ====================================================================
-- DOIS CAMPOS, E O AUTOR NAO E UM DELES
-- ====================================================================
--
-- O formulario tem `subject` e `body`, e so. **Nao ha nome, e-mail, telefone
-- nem endereco nesta tabela**, de proposito: o botao mora no menu do usuario,
-- entao existe sessao, e o autor sai do `Bearer` e nunca do corpo da
-- requisicao. Coletar de novo o que a conta ja tem seria pedir ao tutor que
-- digitasse um dado que o servidor pode errar menos do que ele.
--
-- Isso tambem e o que mantem esta tabela fora do alcance dos portoes de
-- endereco: `postal_code`, `street`, `street_number` e `complement` casam por
-- NOME EXATO nos portoes de saida, e nenhum deles existe aqui.
--
-- ====================================================================
-- O TETO RECUSA, E NUNCA TRUNCA
-- ====================================================================
--
-- `subject` vai a 120 e `body` a 4000, os dois por `CHECK`. Os mesmos dois
-- numeros estao em `api/openapi.yaml` (`maxLength`), e e la que o estouro vira
-- **400 com mensagem** antes de chegar ao banco. O `CHECK` e a terceira linha,
-- como em `user_publications`: ele existe para que uma escrita que nao passe
-- pela rota tambem nao caiba, e nao para ser a primeira defesa.
--
-- Truncar em silencio foi recusado: o tutor que escreve 4142 caracteres e
-- recebe 4000 gravados acredita ter contado o problema inteiro, e o que falta
-- e justamente o fim, onde ele costuma dizer o que ja tentou.
--
-- `BETWEEN 2 AND` e nao `BETWEEN 1 AND`: assunto e corpo de um caractere sao
-- ruido de toque, e o contrato ja cobra `minLength: 2` nos dois.
--
-- ====================================================================
-- CASCADE NO AUTOR, E A RAZAO ESCRITA
-- ====================================================================
--
-- `ON DELETE CASCADE`, como `user_publications.author_user_id`: a duvida e
-- conteudo da pessoa e o expurgo da conta a leva junto. Nao ha copia a
-- preservar, porque nao ha denuncia nem prova pendurada nesta linha -- o
-- contrario do que acontece com a publicacao, onde `publication_reports`
-- guarda `publication_body` em copia e por isso a cascata nao apaga evidencia.
--
-- `SET NULL` foi recusado: uma duvida sem autor nao e respondivel, e a fila do
-- painel existe para ser respondida. Guardar o texto orfao de uma conta
-- expurgada seria manter dado do titular depois do expurgo dele, que e
-- exatamente o que o ADR-0010 recusa.
--
-- ====================================================================
-- O QUE NAO TEM, E POR QUE
-- ====================================================================
--
-- **Nao ha `resolved_at` nem `status`.** A decisao do cliente foi "grava no
-- banco e vai para o backoffice"; a TELA do painel e de outra frente e nao foi
-- construida ainda. Uma coluna de estado que nenhum codigo escreve seria casca:
-- ela pareceria uma fila com tratamento e nao teria nenhum. Quando o painel
-- ganhar o botao de "resolvida", ele traz a coluna na migracao dele -- e,
-- quando trouxer, **sera mudanca de estado e nunca `DELETE`**, pela regra desta
-- casa de nao apagar nada.
--
-- **Nao ha anexo.** Nenhum `image_id`, nenhum `upload_intent`: o pedido do
-- cliente e um formulario de duvida, e `purpose` tem duas listas a manter em
-- acordo. Sem arquivo, nenhuma das duas e tocada.
--
-- ====================================================================
-- O QUE O PAINEL LE, E O QUE ELE NAO LE
-- ====================================================================
--
-- **NENHUM DADO DO AUTOR SAI PARA O PAINEL**, e isso nao e zelo meu: o
-- contrato afirma em TRES lugares que a fila de pedidos de encontro e *"a
-- unica leitura de pessoa do backoffice v1"*, coberta pelo RA-01 com as
-- decisoes D53 a D57 do cliente (23/09, ADR-0027 item 17). A fila de
-- plaquinhas repete a afirmacao e se abstem de ler perfil.
--
-- Entao a leitura administrativa desta tabela devolve a DUVIDA -- `ref`,
-- `subject`, `body`, `created_at` -- e nada do tutor. Projetar nome, e-mail ou
-- um identificador estavel dele criaria a SEGUNDA leitura de pessoa do
-- backoffice e tornaria aquela frase falsa nos tres lugares. Isso e decisao do
-- cliente, do tamanho da D53, e nao de quem escreve a migracao.
--
-- `author_user_id` existe para a chave estrangeira e para a cascata do
-- expurgo, e para mais nada: nenhuma consulta o projeta.
--
-- ====================================================================
-- O INDICE E O DA FILA
-- ====================================================================
--
-- Um indice so, `created_at DESC`, porque a unica leitura que existe e a do
-- painel: "as duvidas, da mais nova para a mais velha, em paginas". Nao ha
-- indice por autor porque nao ha tela que liste "minhas duvidas" -- o
-- formulario nao tem historico, por decisao de escopo, e indice sem consulta e
-- peso de escrita sem leitor.

-- Up Migration

CREATE TABLE help_requests (
  -- UUIDv7, gerado pela aplicacao como em todas as tabelas desta casa. Sem
  -- `DEFAULT`: quem cria a linha e quem conhece o instante dela.
  id              uuid        PRIMARY KEY,

  -- O ENDERECO OPACO DA DUVIDA, e e ele que o painel usa -- nunca o `id`.
  --
  -- 128 bits de CSPRNG em base64url, 22 simbolos: a MESMA forma de
  -- `users.public_ref`, `user_publications.public_ref` e
  -- `professional_reviews.ref`. As duas filas administrativas que ja existem
  -- (`AdminJoinRequest.ref` e `AdminCollarTagRequest.ref`) dizem o mesmo por
  -- escrito: *"Identificador opaco do pedido, 128 bits aleatorios. Nao e o
  -- UUID."* O motivo e SEC-001/SEC-002: `id` e UUIDv7, ordenavel no tempo, e
  -- dois deles publicados entregam a taxa de criacao de registros.
  --
  -- Nasce com a linha e nao na primeira leitura: a coluna e `NOT NULL`, entao
  -- um caminho de escrita que nao o preenchesse nao compila -- que e o freio
  -- que se quer.
  ref             text        NOT NULL
                              CONSTRAINT help_requests_ref_unico UNIQUE
                              CONSTRAINT help_requests_ref_forma
                              CHECK (ref ~ '^[A-Za-z0-9_-]{22}$'),

  -- QUEM PERGUNTOU. Sai da sessao e nunca do corpo. Entra no `INSERT` e,
  -- depois, na juncao que o painel usa para mostrar de quem e a duvida.
  author_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  -- O ASSUNTO, em poucas palavras. 120 e o que cabe numa linha da fila do
  -- painel sem reticencias no meio de uma palavra.
  subject         text        NOT NULL
                              CONSTRAINT help_requests_assunto_tamanho
                              CHECK (char_length(subject) BETWEEN 2 AND 120),

  -- A DUVIDA. 4000 e folgado de proposito: quem escreve para o suporte conta o
  -- que tentou, e cortar isso custa uma ida e volta de atendimento.
  body            text        NOT NULL
                              CONSTRAINT help_requests_corpo_tamanho
                              CHECK (char_length(body) BETWEEN 2 AND 4000),

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- A FILA DO PAINEL: da mais nova para a mais velha. E a unica leitura que
-- existe sobre esta tabela, e este indice e dela.
CREATE INDEX help_requests_da_fila ON help_requests (created_at DESC);

COMMENT ON TABLE help_requests IS
  'A DUVIDA QUE O TUTOR MANDA PELO BOTAO `Ajuda` DO MENU DO USUARIO. Pedido do cliente de 29/10/2026 ("no menu do usuario, adicione um botao de ajuda, que abrira uma pagina com um formulario de duvida"), com a decisao de destino tomada na mesma conversa: grava no banco e vai para o backoffice, SEM notificacao por e-mail. NAO EXISTE DISPARO: nenhum gatilho escreve em notification_items a partir daqui, nenhuma linha entra em fila de envio, e isso e decisao e nao esquecimento. QUEM ESCREVE: a propria pessoa, por POST /v1/me/help-requests, autenticada -- nao ha caminho anonimo, nao ha caminho administrativo de escrita. QUEM LE: o painel, pela fila ordenada por created_at DESC. O PROPRIO TUTOR NAO LE: o formulario nao tem historico, por escopo, e por isso nao ha indice por autor. NAO HA DADO PESSOAL EM COLUNA NENHUMA: nome, e-mail e telefone saem da conta por juncao, e nao daqui -- em particular nenhuma coluna de endereco existe, o que mantem esta tabela fora do alcance dos portoes que casam postal_code, street, street_number e complement por nome exato. NAO HA COLUNA DE ESTADO: resolved_at/status pertencem a tela do painel, que e de outra frente; quando ela existir, sera mudanca de estado e NUNCA DELETE.';

COMMENT ON COLUMN help_requests.ref IS
  'O endereco opaco da duvida: 128 bits de CSPRNG em base64url, 22 simbolos. E ELE que sai para o painel, e NUNCA o id -- que e UUIDv7, ordenavel no tempo, e cuja publicacao entregaria a taxa de criacao de registros (SEC-001/SEC-002). Mesma forma e mesma razao de AdminJoinRequest.ref e AdminCollarTagRequest.ref, as duas filas administrativas que ja existiam. NAO identifica o autor: e por duvida e nao por pessoa, entao duas duvidas do mesmo tutor tem refs sem relacao -- o painel nao monta "todas as duvidas da Maria", pela mesma regra D53 que proibe identificador estavel de pessoa no backoffice.';

COMMENT ON COLUMN help_requests.author_user_id IS
  'Quem perguntou. Sai do Bearer e NUNCA do corpo da requisicao: o botao mora no menu do usuario, entao ha sessao, e pedir de novo o que a conta ja tem seria pedir ao tutor que digitasse um dado que o servidor erra menos. CASCADE: a duvida e conteudo da pessoa e o expurgo da conta a leva. SET NULL foi recusado -- duvida sem autor nao e respondivel, e guardar o texto orfao seria reter dado do titular depois do expurgo (ADR-0010).';

COMMENT ON COLUMN help_requests.subject IS
  'O assunto, 2 a 120. O mesmo teto esta em api/openapi.yaml como maxLength, e e LA que o estouro vira 400 com mensagem. Este CHECK e a terceira linha: ele existe para que uma escrita fora da rota tambem nao caiba. Truncar em silencio foi recusado.';

COMMENT ON COLUMN help_requests.body IS
  'A duvida, 2 a 4000. Texto livre e sem filtro de palavra, como o Mural: quem le e um humano no painel. O teto recusa com mensagem e nunca trunca -- o fim do texto e onde o tutor costuma dizer o que ja tentou, e e justamente o que um corte silencioso comeria.';

-- Down Migration

DROP INDEX help_requests_da_fila;
DROP TABLE help_requests;
