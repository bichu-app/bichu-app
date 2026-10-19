-- A LISTA DE QUEM EU BLOQUEEI -- e o que esta migracao faz e **corrigir duas
-- afirmacoes do banco que a decisao do cliente de 19/10/2026 tornou falsas**.
--
-- ====================================================================
-- O DEFEITO QUE A DECISAO CONSERTA
-- ====================================================================
--
-- O bloqueio e SIMETRICO por desenho (`bloqueio_entre`, criada aqui ao lado na
-- `20261018000031`), e a simetria tinha uma consequencia que ninguem havia
-- medido: quem bloqueia alguem tambem passa a receber `404` no perfil dessa
-- pessoa. E o botao "Desbloquear" morava dentro do menu **daquele perfil** --
-- que nunca mais abre. Ou seja: **bloquear era irreversivel pelo aplicativo**.
--
-- Decisao do cliente, 19/10/2026: *uma lista de quem voce bloqueou, na gaveta
-- do Perfil, e o desbloqueio acontece ali*. E onde as pessoas procuram, por
-- habito de outros aplicativos, e **resolve sem mexer na simetria do
-- bloqueio** -- que e o que protege quem bloqueia por estar sendo perseguido.
--
-- ====================================================================
-- NENHUM DDL. SO COMENTARIO. E NENHUM DADO PODE SER PERDIDO
-- ====================================================================
--
-- `COMMENT ON` e a unica coisa aqui: nenhuma coluna nasce, nenhuma morre,
-- nenhum `CHECK` e reescrito e nenhum indice e criado. Nao ha o que provar em
-- `BEGIN/ROLLBACK` sobre perda de valor, porque nenhum valor e tocado.
--
-- O que ela corrige sao **afirmacoes**, e afirmacao errada no banco e pior que
-- comentario ausente: `COMMENT ON COLUMN user_blocks.blocker_user_id` diz hoje,
-- por extenso, que *"nenhuma resposta a projeta, nem como contagem nem como
-- existencia -- nao existe campo de bloqueio em saida nenhuma"*. A primeira
-- metade continua verdadeira; a segunda deixou de ser, porque **existe uma
-- saida de bloqueio**: `GET /me/blocks`. Quem ler aquele comentario em dezembro
-- vai acreditar nele, e a leitura desta casa e que o comentario e a
-- documentacao rastreada (`docs/` nao entra no git).
--
-- ====================================================================
-- A SAIDA NOVA E ASSIMETRICA, E E ISSO QUE A TORNA ACEITAVEL
-- ====================================================================
--
-- `bloqueio_entre` e simetrica, e a consulta de `listMyBlocks` **nao a chama**.
-- A autorizacao dela e a igualdade `blocker_user_id = quem chama` na clausula
-- `WHERE` (ADR-0021), e e essa igualdade que faz a leitura ser assimetrica
-- sobre um predicado simetrico:
--
-- | Pergunta | Responde? |
-- |---|---|
-- | quem EU bloqueei | sim, so para quem bloqueou |
-- | quem me bloqueou | **nao**, em forma nenhuma -- nem lista, nem contagem, nem existencia |
--
-- A segunda linha e o oraculo *"ela te bloqueou"*, e descobrir que foi
-- bloqueado e o que gera retaliacao. **O bloqueado continua sem saber.**
--
-- O QUE A LINHA MOSTRA: `users.public_ref`, `handles.handle`,
-- `users.display_name` e o `created_at` do proprio bloqueio. Os tres primeiros
-- sao exatamente os tres que a **emenda 2 do ADR-0010** (19/10/2026) ja libera
-- a qualquer chamador com conta em `getPersonProfile`; o quarto e o ato de quem
-- le, e nao dado da outra pessoa. **Nao ha foto**: a emenda 3 do ADR-0010 abriu
-- a foto de perfil em UMA superficie, a conversa mediada, e **so entre conexoes
-- aceitas** -- e bloqueado e o oposto de conexao aceita. Esta migracao nao pede
-- emenda nenhuma, porque nao abre campo nenhum que as emendas 2 e 3 nao tenham
-- aberto.
--
-- ====================================================================
-- POR QUE NENHUM INDICE: FOI MEDIDO, NAO SUPOSTO
-- ====================================================================
--
-- A consulta filtra por `blocker_user_id` e junta `users` e `handles`.
-- Conferido em 19/10/2026, indice por indice:
--
-- | O que a consulta faz | O indice que serve | Migracao |
-- |---|---|---|
-- | linhas de um bloqueador | `user_blocks_um_por_par` -- `(blocker_user_id, blocked_user_id)`, e `blocker_user_id` e o PREFIXO | `...031` |
-- | bloqueado -> conta | `users_pkey` | `20260917000001` |
-- | conta -> apelido | `handles_uma_pessoa_um_apelido` -- `(user_id) WHERE kind = 'pessoa' AND user_id IS NOT NULL`, PARCIAL e exatamente o predicado do `LEFT JOIN` | `...021` |
--
-- O carimbo `20261019000005` **foi reservado para esta frente pelo
-- coordenador**, e nao escolhido aqui:
-- `infra/verificacao/verificar-carimbo-de-migracao.mjs` le **so as refs** do git
-- e nao ve arquivo nao comitado de outro agente -- dois agentes ja receberam
-- APROVADO para o mesmo numero no mesmo dia.
--
-- ====================================================================
-- NAO FOI APLICADA
-- ====================================================================
--
-- `migrate up` e `make migrar` **nao foram rodados** (e `make migrar` nem
-- reconstroi a imagem: ele aplica as migracoes DA IMAGEM, e sem build se le o
-- erro antigo e se conclui que a correcao falhou). Sendo so `COMMENT ON` em
-- objetos que existem em `origin/development`, o risco de aplicacao e o de uma
-- instrucao de metadado; o que NAO foi exercitado esta no relatorio da entrega.
--
-- E vale o lembrete que esta casa ja pagou: o node-pg-migrate **descarta**
-- `RAISE NOTICE` e `RAISE WARNING`. Nao ha nenhum aqui, de proposito.

-- Up Migration

COMMENT ON TABLE user_blocks IS
  'BLOQUEIO ENTRE PESSOAS -- ferramenta PESSOAL, nao moderacao. NAO ENTRA NA FILA fila_de_moderacao (20261018000009), e isso e de proposito: bloquear nao tem administrador, nao tem revisao e tem efeito imediato na leitura. Levar bloqueio para a fila faria o administrador responder por uma escolha que e so de quem bloqueou. Unilateral e SILENCIOSO: o bloqueado nao e avisado e recebe 404 com o mesmo corpo de perfil inexistente (ADR-0021), porque um 404 diferente seria oraculo e descobrir que foi bloqueado e o que gera retaliacao. Efeito nos DOIS SENTIDOS na leitura -- quem bloqueou nao ve o bloqueado, e o bloqueado nao ve quem bloqueou --, aplicado por bloqueio_entre(uuid, uuid). DESDE 19/10/2026 ESTA TABELA TEM UMA LEITURA, E ELA E ASSIMETRICA: GET /me/blocks devolve a lista de quem QUEM CHAMA bloqueou, por blocker_user_id = chamador na clausula WHERE (ADR-0021), e NAO chama bloqueio_entre -- aquela funcao e simetrica e devolveria as duas metades do par, e a segunda metade e o oraculo. Nao existe leitura, contagem nem existencia de quem bloqueou quem chama, em superficie nenhuma. Decisao do cliente de 19/10/2026: sem a lista, bloquear era irreversivel pelo aplicativo, porque o Desbloquear morava no perfil que a simetria do bloqueio fecha. NAO FECHA a conversa mediada de caso de pet ABERTO: ver o cabecalho dessa funcao.';

COMMENT ON COLUMN user_blocks.blocker_user_id IS
  'Quem bloqueou. ESTA COLUNA NAO LEVA A MARCA do portao de saida, de proposito, pela mesma decisao de professional_review_reports.reporter_user_id (20261017000017): src/ PRECISA dela na clausula WHERE, porque o bloqueio e aplicado na LEITURA e em dois sentidos, e um predicado cujo nome src/ nao pode escrever obrigaria toda leitura do produto a passar por funcao SQL. ELA CONTINUA SEM SAIR EM RESPOSTA: em GET /me/blocks (19/10/2026) ela e o FILTRO e nunca a projecao -- o valor e sempre o proprio chamador, que ja o conhece. O que sai naquela lista e blocked_user_id resolvido em public_ref, handle e display_name, e SO para quem bloqueou. Nao existe campo, contagem ou existencia de quem bloqueou quem chama, e e por isso que o bloqueado continua sem saber.';

-- Down Migration

-- Descer devolve os DOIS comentarios ao texto exato que `origin/development`
-- tinha em 19/10/2026 -- copiado da `20261018000031`, e nao reescrito de
-- memoria.
--
-- **Esta descida nao reprova.** Nao ha dado nenhum envolvido: descer so volta a
-- afirmar uma coisa que deixou de ser verdadeira, e travar a descida por causa
-- de um texto seria travar por nada.
--
-- O que descer **nao** desfaz, e esta dito para quem rodar: a operacao
-- `listMyBlocks` continua no contrato e no codigo. Comentario de banco nao
-- governa rota; quem reverte a decisao reverte o contrato, e esta migracao e so
-- a parte do banco que falava dela.
COMMENT ON TABLE user_blocks IS
  'BLOQUEIO ENTRE PESSOAS -- ferramenta PESSOAL, nao moderacao. NAO ENTRA NA FILA fila_de_moderacao (20261018000009), e isso e de proposito: bloquear nao tem administrador, nao tem revisao e tem efeito imediato na leitura. Levar bloqueio para a fila faria o administrador responder por uma escolha que e so de quem bloqueou. Unilateral e SILENCIOSO: o bloqueado nao e avisado e recebe 404 com o mesmo corpo de perfil inexistente (ADR-0021), porque um 404 diferente seria oraculo e descobrir que foi bloqueado e o que gera retaliacao. Efeito nos DOIS SENTIDOS na leitura -- quem bloqueou nao ve o bloqueado, e o bloqueado nao ve quem bloqueou --, aplicado por bloqueio_entre(uuid, uuid). NAO FECHA a conversa mediada de caso de pet ABERTO: ver o cabecalho dessa funcao.';

COMMENT ON COLUMN user_blocks.blocker_user_id IS
  'Quem bloqueou. ESTA COLUNA NAO LEVA A MARCA do portao de saida, de proposito, pela mesma decisao de professional_review_reports.reporter_user_id (20261017000017): src/ PRECISA dela na clausula WHERE, porque o bloqueio e aplicado na LEITURA e em dois sentidos, e um predicado cujo nome src/ nao pode escrever obrigaria toda leitura do produto a passar por funcao SQL. O que NAO acontece: nenhuma resposta a projeta, nem como contagem nem como existencia -- nao existe campo de bloqueio em saida nenhuma, e e por isso que o bloqueado continua sem saber.';
