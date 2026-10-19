-- FATIA G DA FRENTE DE COMUNIDADE: **O PERFIL DE OUTRA PESSOA**, e o que esta
-- migracao faz e **corrigir tres afirmacoes do banco que a decisao do cliente
-- de 19/10/2026 tornou falsas**.
--
-- Decisao dele, literal, quando perguntado o que alguem que NAO e conexao pode
-- ver no perfil de outra pessoa:
--
--   "ele pode ver nome, quantidade de pets, conexoes, mas nao as fotos
--   publicadas e nem a timeline do usuario"
--
-- E a emenda 2 do ADR-0010. Por contraposicao, **quem JA E conexao aceita ve as
-- fotos** -- negar-lhas tambem esvaziaria a distincao que ele acabou de fazer -- e
-- e isso que a operacao `getPersonProfile` entrega.
--
-- ====================================================================
-- NENHUM DDL. SO COMENTARIO. E ISSO NAO E ZELO DECORATIVO
-- ====================================================================
--
-- `COMMENT ON` e a unica coisa aqui: nenhuma coluna nasce, nenhuma morre,
-- nenhum `CHECK` e reescrito e nenhum indice e criado. **Nenhum dado pode ser
-- perdido por esta migracao**, e nao ha o que provar em `BEGIN/ROLLBACK` sobre
-- perda de valor -- diferente da migracao de vitrine que, na primeira versao,
-- APAGAVA tres valores do `CHECK` de `purpose`.
--
-- O que ela corrige sao **afirmacoes**, e afirmacao errada no banco e pior que
-- comentario ausente: `COMMENT ON TABLE user_showcase_images` diz hoje, por
-- extenso, *"Sai em GET /me/showcase e em NENHUMA outra resposta"*, e a partir
-- da fatia G isso e falso. Quem ler aquele comentario em dezembro vai acreditar
-- nele -- e a leitura desta casa que o comentario e a documentacao rastreada
-- (`docs/` nao entra no git).
--
-- ====================================================================
-- POR QUE NENHUM INDICE: FOI MEDIDO, NAO SUPOSTO
-- ====================================================================
--
-- As duas consultas da fatia G nao pedem indice novo. Conferido em 19/10/2026,
-- indice por indice:
--
-- | O que a consulta faz | O indice que serve | Migracao |
-- |---|---|---|
-- | apelido -> pessoa | `handles_pkey` (`handle` e PK, `citext`) | `...021` |
-- | contagem de pets do tutor | `pets_do_tutor` -- `(owner_user_id) WHERE deleted_at IS NULL`, PARCIAL e exatamente o predicado da subconsulta | `20260917000006` |
-- | contagem de conexoes aceitas | `user_connections_do_pedinte` e `user_connections_do_destinatario` | `...030` |
-- | aresta do par | os mesmos dois | `...030` |
-- | vitrine em ordem | `user_showcase_images_em_ordem` -- `(user_id, position)` | `...040` |
--
-- O carimbo `20261019000001` **foi reservado para esta fatia pelo coordenador**,
-- e nao escolhido aqui: `infra/verificacao/verificar-carimbo-de-migracao.mjs` le
-- **so as refs** do git e nao ve arquivo nao comitado de outro agente -- dois
-- agentes ja receberam APROVADO para o mesmo numero no mesmo dia. Tomar numero
-- por conta propria e o defeito, nao a solucao.
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
-- `RAISE NOTICE` e `RAISE WARNING`. Nao ha nenhum aqui, de proposito -- um aviso
-- nesta migracao nao chegaria a ninguem.

-- Up Migration

-- ====================================================================
-- 1. A TABELA DA VITRINE: ELA NAO E MAIS "SO AO DONO"
-- ====================================================================
--
-- O que mudou: a vitrine passa a sair tambem em `getPersonProfile`, e **so
-- quando quem le e CONEXAO ACEITA do dono**. O predicado nao e um `if` de
-- camada de aplicacao: ele e `EXISTS` sobre `user_connections` com
-- `state = 'accepted'`, na clausula `WHERE` da propria consulta das fotos
-- (ADR-0021) -- a consulta que devolveria a vitrine de quem nao e conexao nao
-- existe.
--
-- O que NAO mudou: a vitrine continua invisivel a quem nao e conexao, a quem
-- nao tem conta e a toda superficie publica. O portao
-- `src/tools/vitrine-nao-sai-para-terceiro.test.ts` continua reprovando as duas
-- pontas, e foi ESTENDIDO em vez de afrouxado -- a lista de operacoes que podem
-- carregar vitrine passou a ser fechada e NOMEADA (tres), e nao "nenhuma".
COMMENT ON TABLE user_showcase_images IS
  'A VITRINE DE FOTOS DO USUARIO. Molde de store_item_images e network_event_images. A capa e position = 0. Imagem de catalogo com purpose user_showcase, conferido pelo caso de uso. QUEM VE: o dono, em GET /me/showcase (vitrine inteira, com status e motivo de recusa), e quem e CONEXAO ACEITA do dono, em GET /people/{handle} -- emenda 2 do ADR-0010, decisao do cliente de 19/10/2026 ("ele pode ver nome, quantidade de pets, conexoes, mas nao as fotos publicadas e nem a timeline do usuario": por contraposicao, conexao ve). Em NENHUMA outra resposta. A autorizacao da segunda mora na clausula WHERE da consulta (EXISTS sobre user_connections com state=accepted, mais NOT bloqueio_entre e NOT foto_ocultada_para_quem_denunciou), e nao numa camada acima: ADR-0021. Para a conexao sai MENOS do que para o dono -- so grid_url, open_url e alt_text, e so foto ready: sem status, sem rejection_reason, sem position e sem upload_id, que sao estado de moderacao e de edicao da propria vitrine. Foto em processing nao sai para terceiro porque carrega o EXIF do celular (ADR-0010 item 4). A quem NAO e conexao, a quem nao tem conta e em superficie publica: nunca -- ADR-0025 item 2 proibe avatar de pessoa na Rede, e Conversation.participants nunca traz foto.';

COMMENT ON COLUMN user_showcase_images.alt_text IS
  'Texto alternativo, OPCIONAL -- a unica diferenca do molde das outras duas galerias, onde ele e obrigatorio. ATENCAO, 19/10/2026: a razao original dessa diferenca era "nao ha terceiro que leia esta vitrine", e ela DEIXOU DE VALER -- a vitrine sai para quem e CONEXAO ACEITA (emenda 2 do ADR-0010), e agora existe terceiro lendo. A coluna continua anulavel, porque obriga-la quebraria as fotos que ja existem e porque quem escreve o texto e quem tirou a foto, nao um administrador descrevendo conteudo alheio. Nulo faz o leitor de tela cair no rotulo da grade. NAO E LEGENDA e nunca e desenhado como texto: legenda continua fora de proposito, e PersonShowcasePhoto nao tem campo para ela.';

-- ====================================================================
-- 2. O APELIDO: ELE AGORA TEM UMA LEITURA QUE O ENDERECA
-- ====================================================================
--
-- O comentario de `users.handle` dizia que o apelido *"nao sai em superficie
-- publica nesta fatia"*, e **isso continua verdade**: `getPersonProfile` exige
-- conta (`bearerAuth` sem alternativa vazia), entao ela nao e superficie
-- publica. O que o comentario nao dizia -- porque nao existia -- e que o
-- apelido passou a ser o **enderecamento** de uma operacao. Quem ler a coluna
-- precisa saber onde ela e usada como chave de leitura.
COMMENT ON COLUMN users.handle IS
  'O apelido (@) escolhido pela pessoa, normalizado (minusculo, aparado), apontando para o espaco de nomes de handles. Faixa 5-20, ^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$, A MESMA em handles.handle (CHECK), no contrato (PersonHandleParam e PersonProfile.handle: minLength/maxLength/pattern) e na tela (app/lib/formato/apelido.dart) -- esta casa ja pagou por divergencia de faixa entre contrato e coluna. ANULAVEL: as 7 contas de 18/10/2026 sao de teste e continuam no banco (plano 4-C.8); com nulo a tela cai para o nome de exibicao e nenhum fluxo obriga a escolher -- e quem nao tem apelido NAO TEM PAGINA DE PERFIL, porque nao tem endereco. NAO E DADO PESSOAL por decisao do cliente ("slug nao tem relacao com informacoes pessoais, e um id que o usuario escolhe"). DESDE 19/10/2026 ELE ENDERECA UMA LEITURA: GET /people/{handle}, o perfil de outra pessoa (fatia G), que exige conta -- entao ele continua NAO saindo em superficie publica, e o item 6 do ADR-0010 continua intacto porque o que sai e o apelido e users.public_ref, nunca o uuid. NAO HA rota de disponibilidade: a decisao e no envio, pelo indice, e nao existe busca de pessoas.';

-- Down Migration

-- Descer devolve os TRES comentarios ao texto exato que `origin/development`
-- tinha em 19/10/2026 -- copiado das migracoes `20261018000040` (os dois da
-- vitrine) e `20261018000021` (o do apelido), e nao reescrito de memoria.
--
-- **Esta descida nao reprova, e e a unica migracao desta frente em que isso e
-- certo.** As guardas de `DO $$ ... RAISE EXCEPTION` das vizinhas existem porque
-- descer apagaria declaracao de gente real (data de nascimento, apelido
-- escolhido). Aqui nao ha dado nenhum envolvido: descer so volta a afirmar uma
-- coisa que deixou de ser verdadeira, e travar a descida por causa de um texto
-- seria travar por nada.
--
-- O que descer **nao** desfaz, e esta dito para quem rodar: a operacao
-- `getPersonProfile` continua no contrato e no codigo. Comentario de banco nao
-- governa rota; quem reverte a decisao reverte o contrato, e esta migracao e so
-- a parte do banco que falava dela.
COMMENT ON TABLE user_showcase_images IS
  'A VITRINE DE FOTOS DO USUARIO, VISIVEL SO AO DONO. Molde de store_item_images e network_event_images. A capa e position = 0. Imagem de catalogo com purpose user_showcase, conferido pelo caso de uso. Sai em GET /me/showcase e em NENHUMA outra resposta: ADR-0025 item 2 proibe avatar de pessoa na Rede, e Conversation.participants nunca traz foto.';

COMMENT ON COLUMN user_showcase_images.alt_text IS
  'Texto alternativo, OPCIONAL -- a unica diferenca do molde. Nao ha terceiro que leia esta vitrine, e legenda esta fora de proposito. Nulo faz o leitor de tela cair no rotulo da grade.';

COMMENT ON COLUMN users.handle IS
  'O apelido (@) escolhido pela pessoa, normalizado (minusculo, aparado), apontando para o espaco de nomes de handles. Faixa 5-20, ^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$, A MESMA em handles.handle (CHECK), no contrato (minLength/maxLength/pattern) e na tela (app/lib/formato/apelido.dart) -- esta casa ja pagou por divergencia de faixa entre contrato e coluna. ANULAVEL: as 7 contas de 18/10/2026 sao de teste e continuam no banco (plano 4-C.8); com nulo a tela cai para o nome de exibicao e nenhum fluxo obriga a escolher. NAO E DADO PESSOAL por decisao do cliente ("slug nao tem relacao com informacoes pessoais, e um id que o usuario escolhe"), mas a VISIBILIDADE continua obedecendo a regua do ADR-0010: ele nao sai em superficie publica nesta fatia. NAO HA rota de disponibilidade: a decisao e no envio, pelo indice.';
