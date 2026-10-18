-- A avaliacao de um local do diretorio `Perto`: pontuacao de 1 a 5 e
-- recomendacao em texto, visiveis para os outros usuarios.
--
-- PEDIDO LITERAL DO CLIENTE, 18/10/2026: "os locais indicados devem ser
-- clicados, para visualizar mais informacoes e para que os usuarios possam dar
-- pontuacao e fazer recomendacoes em texto, onde ficara disponivel para outros
-- usuarios, como acontece na playstore".
--
-- ESTE ESQUEMA NAO FOI INVENTADO AQUI. O ADR-0011 ja o escreve, coluna por
-- coluna, no bloco de esquema da secao 3 e na secao "O que acontece com as
-- avaliacoes quando o profissional assume o perfil":
--
--   professional_reviews
--     id, professional_id, author_user_id, rating 1..5, body,
--     service_kind, created_at, edited_at,
--     status -- 'published' | 'hidden' | 'removed'
--     moderation_reason,
--     UNIQUE (professional_id, author_user_id)
--
-- A secao 5.4 daquele ADR declarou a tabela FORA da migracao de 21/09 com uma
-- razao datada -- "nao foram autorizadas e nao sao urgentes". Em 18/10/2026 ela
-- foi autorizada. Esta migracao e a execucao da parte do ADR que estava
-- esperando a decisao, e nao uma segunda opiniao sobre o modelo. Onde eu
-- divirjo do ADR, eu digo abaixo e digo por que.
--
-- O QUE ELA NAO FAZ, E CADA AUSENCIA E DELIBERADA:
--
-- - **Nao cria `professional_review_replies`** (o direito de resposta publica
--   do profissional, uma por avaliacao, do ADR-0011). Ele depende de
--   reivindicacao de perfil, e `professional_claims` tambem nao existe: hoje
--   NENHUMA entrada do diretorio tem dono que possa responder. Tabela sem
--   quem a escreva e divida, nao adiantamento.
-- - **Nao cria `claim_snapshot_at`** nem o marco que congela as avaliacoes na
--   reivindicacao (regra 2 do ADR-0011). Mesmo motivo: nao ha reivindicacao.
--   Quando houver, `created_at` de cada avaliacao e o que permite separar
--   "antes" de "depois" sem migracao de dados -- e por isso ele e obrigatorio
--   aqui.
-- - **Nao toca em `professionals` nem em `users`.** Nenhum `ALTER` de coluna
--   existente, nenhum `DROP`. Duas tabelas novas, uma funcao e indices.
-- - **Nao cria media nem contagem materializadas.** Ver o bloco "A MEDIA NAO
--   E COLUNA" mais abaixo, que e a decisao com mais consequencia deste
--   arquivo.
-- - **Nao cria coluna de site, e-mail, WhatsApp, rede social, horario nem
--   foto** em `professionals`. A pagina do local mostra o que ha. Essas seis
--   faltam de verdade e estao relatadas, mas inventa-las aqui encheria a tela
--   de linhas vazias permanentes, porque nao existe painel que as preencha.
--
-- NAO FOI EXERCITADA CONTRA BANCO. Validada em `BEGIN`/`ROLLBACK` apenas; o
-- banco de desenvolvimento e compartilhado com outras sessoes e `migrate up`
-- nao foi rodado. O que isso deixa sem prova esta no fim do arquivo.

-- Up Migration

-- ---------------------------------------------------------------------------
-- professional_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE professional_reviews (
  id                uuid        PRIMARY KEY,

  -- O IDENTIFICADOR PUBLICO, e ele existe porque `id` nao pode sair.
  --
  -- A denuncia e a remocao pelo painel precisam apontar para UMA avaliacao, e
  -- o ADR-0010 item 6 proibe UUID interno em saida publica. O formato e o de
  -- `upload_intents.upload_ref` (128 bits em base64url, migracao
  -- 20260928000009) e nao o de `slug`: slug e endereco legivel escolhido por
  -- alguem, e ninguem batiza uma avaliacao.
  --
  -- SORTEADO POR LINHA, e nunca derivado do autor. Um ref que carregasse a
  -- conta permitiria cruzar as avaliacoes de uma pessoa entre locais, que e o
  -- vinculo entre duas pessoas que a BICHUS-174 proibe "inclusive como
  -- contagem e como existencia".
  ref               text        NOT NULL
                                CONSTRAINT professional_reviews_ref_formato
                                CHECK (ref ~ '^[A-Za-z0-9_-]{22}$'),

  professional_id   uuid        NOT NULL
                                REFERENCES professionals (id) ON DELETE CASCADE,

  -- QUEM ESCREVEU. `ON DELETE CASCADE` e a escolha certa aqui e a diferenca
  -- em relacao a `professionals.created_by_user_id` e relevante: aquela coluna
  -- carrega a marca "NUNCA sai do servidor" e o portao
  -- `portao-colunas-que-nao-saem.ts` reprova o nome dela em `src/`. Esta NAO
  -- carrega a marca, porque `src/` precisa dela na clausula WHERE: toda
  -- escrita e "a MINHA avaliacao", resolvida por igualdade com quem chama
  -- (ADR-0021), e o DELETE do autor nao aceita identificador de avaliacao
  -- nenhum justamente por isso.
  --
  -- O que NAO acontece: o nome da coluna nao sai em resposta nenhuma, e
  -- `DirectoryReview` nao tem campo de autor alem do nome de exibicao.
  author_user_id    uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  -- A NOTA. Inteira de 1 a 5, decisao do cliente de 18/10.
  --
  -- `smallint` seria suficiente e `integer` e o que o resto do esquema usa;
  -- a diferenca de dois bytes por linha nao paga a inconsistencia. O CHECK e a
  -- segunda recusa: a primeira e a validacao do contrato na borda, e esta e a
  -- que sobra quando alguem escrever na tabela por outro caminho.
  rating            integer     NOT NULL
                                CONSTRAINT professional_reviews_rating_faixa
                                CHECK (rating BETWEEN 1 AND 5),

  -- A RECOMENDACAO EM TEXTO. **Opcional**, e nulo e o caso comum: o cliente
  -- decidiu que dar so a nota tem de funcionar.
  --
  -- Nulo e NAO string vazia, e o banco cobra isso: duas representacoes de "sem
  -- texto" obrigariam toda tela e toda consulta a conhecer as duas, e a
  -- primeira que esquecesse mostraria um paragrafo vazio.
  --
  -- SEM HTML, recusado na ENTRADA e nao escapado na saida. Escapar depende de
  -- toda tela futura lembrar de escapar; recusar vale uma vez. O CHECK e o
  -- mesmo juizo da borda, aqui para o caso de a borda ser contornada.
  body              text        CONSTRAINT professional_reviews_body_tamanho
                                CHECK (body IS NULL
                                       OR char_length(body) BETWEEN 1 AND 1500)
                                CONSTRAINT professional_reviews_body_sem_html
                                CHECK (body IS NULL
                                       OR body !~ '[<>]')
                                CONSTRAINT professional_reviews_body_nao_vazio
                                CHECK (body IS NULL OR btrim(body) <> ''),

  -- QUAL SERVICO FOI AVALIADO, do esquema do ADR-0011.
  --
  -- Nulavel e SEM lista fechada por enquanto, e a diferenca em relacao a
  -- `professionals.kind` e deliberada: a atividade do local e cadastro, e o
  -- servico que a pessoa usou e relato dela. Fechar a lista agora decidiria
  -- um vocabulario que nenhuma tela ainda coleta -- o campo nao esta no
  -- contrato e nenhuma rota o preenche hoje. Ele existe porque o ADR o nomeia
  -- e porque acrescenta-lo depois sobre tabela com dado gravado custa mais do
  -- que nasce-lo nulo.
  service_kind      text        CONSTRAINT professional_reviews_service_kind_tamanho
                                CHECK (service_kind IS NULL
                                       OR char_length(service_kind) BETWEEN 2 AND 30),

  created_at        timestamptz NOT NULL DEFAULT now(),

  -- Quando o AUTOR editou, ou nulo se nunca editou.
  --
  -- Nao e `updated_at`: remocao pela moderacao mexe em `status` e NAO toca
  -- aqui. Uma avaliacao marcada como "editada" porque alguem a moderou diria
  -- ao leitor que o autor mudou de ideia, que e falso. A tela mostra
  -- "editada", e isso importa: reescrever a avaliacao depois de alguem ter
  -- lido a primeira versao e um formato conhecido de ma-fe.
  edited_at         timestamptz,

  -- O ESTADO, com os tres valores do ADR-0011.
  --
  -- `published` e o DEFAULT, e isso e a decisao do cliente de 18/10 escrita no
  -- esquema: a avaliacao aparece na hora, "como acontece na playstore". NAO HA
  -- FILA DE APROVACAO e nao ha valor `pending` -- um valor desses convidaria a
  -- primeira pessoa com pressa a ligar uma fila que o cliente recusou.
  --
  -- CUIDADO PARA NAO CONFUNDIR COM A OUTRA REGRA DELE: a INDICACAO de um local
  -- NOVO continua passando por revisao do administrador (`professionals.status`
  -- e `/directory/suggestions`). Isto aqui e a avaliacao de um local que JA
  -- EXISTE. Afrouxar uma nao afrouxa a outra, e esta tabela nao cria entrada de
  -- diretorio nenhuma.
  --
  -- `hidden` e `removed` sao os dois estados da moderacao e os dois tiram a
  -- linha da lista, da media e da contagem. A linha FICA: o ADR-0011 manda a
  -- remocao ser "registrada na trilha com o motivo", e trilha que aponta para
  -- linha apagada nao e trilha.
  status            text        NOT NULL DEFAULT 'published'
                                CONSTRAINT professional_reviews_status_conhecido
                                CHECK (status IN ('published', 'hidden', 'removed')),

  -- O motivo escrito por quem moderou. **Nunca sai para o app.**
  --
  -- Obrigatorio QUANDO ha moderacao, e o CHECK cruzado abaixo cobra isso: e a
  -- diferenca entre moderacao e arbitrio. Nulo enquanto `published`.
  moderation_reason text        CONSTRAINT professional_reviews_moderation_reason_tamanho
                                CHECK (moderation_reason IS NULL
                                       OR char_length(moderation_reason) BETWEEN 3 AND 500),

  moderated_at      timestamptz,

  -- A REGRA CRUZADA: nao se tira do ar sem dizer por que, e nao se escreve
  -- motivo sobre algo que esta no ar.
  CONSTRAINT professional_reviews_moderacao_tem_motivo
    CHECK ((status = 'published' AND moderation_reason IS NULL AND moderated_at IS NULL)
           OR (status <> 'published' AND moderation_reason IS NOT NULL
               AND moderated_at IS NOT NULL))
);

-- UMA AVALIACAO POR PESSOA POR LOCAL. Decisao do cliente de 18/10, e a mesma
-- linha do ADR-0011: "Uma avaliacao por autor por profissional, editavel pelo
-- autor".
--
-- INCONDICIONAL, e nao `WHERE status = 'published'`. Parcial permitiria uma
-- segunda avaliacao da mesma pessoa depois de a primeira ser removida pela
-- moderacao -- ou seja, remocao viraria o caminho para reescrever do zero, que
-- e exatamente o uso que a moderacao existe para impedir. Com o indice
-- incondicional, `PUT` enviado de novo ATUALIZA a linha que existe, qualquer
-- que seja o estado dela, e a moderacao continua valendo.
CREATE UNIQUE INDEX professional_reviews_uma_por_autor
  ON professional_reviews (professional_id, author_user_id);

CREATE UNIQUE INDEX professional_reviews_ref_unico ON professional_reviews (ref);

-- O INDICE QUE ATENDE A LISTA E A MEDIA, e e o mesmo de proposito.
--
-- A lista le `(professional_id, status)` ordenando por `created_at DESC`, e a
-- media agrega sobre o MESMO recorte. Um indice so, com `created_at` como
-- terceira coluna, serve as duas: a agregacao varre a faixa sem ordenar e a
-- lista a le na ordem ja gravada.
CREATE INDEX professional_reviews_do_local
  ON professional_reviews (professional_id, status, created_at DESC);

-- A ordem por NOTA, que o cliente pediu ("como acontece na playstore").
CREATE INDEX professional_reviews_por_nota
  ON professional_reviews (professional_id, rating DESC, created_at DESC)
  WHERE status = 'published';

COMMENT ON TABLE professional_reviews IS
  'Avaliacao de um local do diretorio Perto: nota 1-5 e texto opcional, visiveis para os outros usuarios. Pedido do cliente de 18/10/2026. Esquema do ADR-0011 secao 3, autorizado em 18/10 (a secao 5.4 o declarava fora da migracao de 21/09). Publica na hora, sem fila: nao confundir com a INDICACAO de local novo, que continua passando por revisao do administrador. Uma por (local, autor), editavel e apagavel pelo autor; remover do ar e da moderacao e exige motivo.';

COMMENT ON COLUMN professional_reviews.ref IS
  'O identificador publico e opaco da avaliacao (128 bits base64url), usado pela denuncia e pela remocao do painel. Existe porque `id` e UUID interno e o ADR-0010 item 6 o proibe em saida publica. Sorteado por linha e NUNCA derivado do autor: ref de autor permitiria cruzar as avaliacoes de uma pessoa entre locais (BICHUS-174).';

COMMENT ON COLUMN professional_reviews.rating IS
  'A nota, inteira de 1 a 5 (decisao do cliente, 18/10). Nunca nula: a nota E a avaliacao, e o texto e o opcional. Sem meia estrela -- mudaria o tipo da coluna depois de haver dado gravado.';

COMMENT ON COLUMN professional_reviews.body IS
  'A recomendacao em texto, OPCIONAL (decisao do cliente, 18/10: dar so a nota tem de funcionar). Nulo e nao string vazia, cobrado por CHECK: duas representacoes de "sem texto" obrigariam toda tela a conhecer as duas. Sem HTML, recusado na ENTRADA -- escapar na saida depende de toda tela futura lembrar, recusar na entrada vale uma vez.';

COMMENT ON COLUMN professional_reviews.status IS
  'published (DEFAULT) | hidden | removed. O default E a decisao do cliente de 18/10: a avaliacao aparece na hora, como na Play Store, e nao ha valor `pending` porque nao ha fila de aprovacao. A INDICACAO de local novo continua revisada pelo administrador, e e outra coisa. hidden e removed tiram a linha da lista, da media e da contagem; a linha FICA, porque o ADR-0011 manda a remocao ser registrada na trilha com o motivo.';

COMMENT ON COLUMN professional_reviews.edited_at IS
  'Quando o AUTOR editou, ou nulo. Nao e updated_at: a moderacao mexe em status e nao toca aqui, senao a tela diria "editada" sobre uma avaliacao que o autor nao mudou. A tela mostra "editada" de proposito -- reescrever depois de alguem ter lido a primeira versao e um formato conhecido de ma-fe.';

COMMENT ON COLUMN professional_reviews.moderation_reason IS
  'O motivo escrito por quem removeu ou escondeu. Obrigatorio quando status <> published (CHECK cruzado): e a diferenca entre moderacao e arbitrio. NUNCA sai para o app -- nenhuma leitura publica projeta esta coluna.';

COMMENT ON COLUMN professional_reviews.service_kind IS
  'Qual servico foi avaliado (ADR-0011). Nulavel e sem lista fechada: a atividade do local e cadastro, o servico usado e relato de quem escreve. Nenhuma rota o preenche hoje e ele nao esta no contrato; existe porque o ADR o nomeia e porque acrescentar coluna depois sobre tabela com dado gravado custa mais.';

-- ---------------------------------------------------------------------------
-- professional_review_reports -- a denuncia
-- ---------------------------------------------------------------------------
-- ELA ENTRA NA MESMA MIGRACAO QUE A AVALIACAO, e nao depois. A publicacao e
-- imediata e isto fala de negocio real com nome e endereco: publicacao
-- imediata sem caminho de remocao e uma funcionalidade que nao se pode
-- desligar.
--
-- A DENUNCIA NAO ESCONDE A AVALIACAO, e nao ha gatilho aqui que mexa em
-- `status`. Se escondesse, uma denuncia seria todo o custo de apagar a
-- avaliacao de um concorrente, e esse seria o primeiro uso da rota. Ela
-- enfileira para a moderacao, que decide e escreve o motivo.
CREATE TABLE professional_review_reports (
  id                uuid        PRIMARY KEY,

  review_id         uuid        NOT NULL
                                REFERENCES professional_reviews (id) ON DELETE CASCADE,

  -- Quem denunciou. Diferente de `conversation_reports`, que nao tem coluna de
  -- usuario porque o achador pode nao ter conta: aqui a rota EXIGE conta, e
  -- sem a coluna nao haveria como deduplicar nem como recusar a denuncia da
  -- propria avaliacao.
  reporter_user_id  uuid        NOT NULL
                                REFERENCES users (id) ON DELETE CASCADE,

  -- Lista fechada, e os valores sao os do contrato. Campo livre nao tria fila.
  reason            text        NOT NULL
                                CONSTRAINT professional_review_reports_reason_conhecido
                                CHECK (reason IN ('spam', 'offensive', 'false_information',
                                                  'not_about_this_place', 'other')),

  -- O mesmo limite de `conversation_reports.detail`, e sem HTML pelo mesmo
  -- motivo do corpo da avaliacao.
  detail            text        CONSTRAINT professional_review_reports_detail_tamanho
                                CHECK (detail IS NULL OR char_length(detail) <= 1000)
                                CONSTRAINT professional_review_reports_detail_sem_html
                                CHECK (detail IS NULL OR detail !~ '[<>]'),

  -- Quantas vezes a MESMA pessoa denunciou a MESMA avaliacao. Igual a
  -- `conversation_reports`: a segunda chamada responde 202 e incrementa, em vez
  -- de duplicar a fila ou devolver erro. Erro ensinaria a quem denuncia que ele
  -- ja denunciou, o que nao e informacao dele e nao muda nada.
  repeat_count      integer     NOT NULL DEFAULT 1 CHECK (repeat_count >= 1),

  created_at        timestamptz NOT NULL DEFAULT now(),
  last_reported_at  timestamptz NOT NULL DEFAULT now(),

  -- Escrito por quem modera. Nulo e "na fila".
  resolved_at       timestamptz
);

-- Uma denuncia por (avaliacao, denunciante). INCONDICIONAL, ao contrario da
-- parcial de `conversation_reports`: lá a fila e por papel e reabrir depois de
-- resolvida e legitimo. Aqui, deixar reabrir daria a uma conta so um contador
-- de pressao ilimitado sobre a mesma avaliacao, bastando esperar a primeira ser
-- resolvida. `repeat_count` e `last_reported_at` registram a insistencia sem
-- criar linha nova.
CREATE UNIQUE INDEX professional_review_reports_uma_por_denunciante
  ON professional_review_reports (review_id, reporter_user_id);

-- A fila, na ordem em que ela e lida.
CREATE INDEX professional_review_reports_fila
  ON professional_review_reports (created_at)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE professional_review_reports IS
  'Denuncias de avaliacao do diretorio. Contrapeso de a avaliacao publicar na hora (18/10/2026). NAO esconde a avaliacao: se escondesse, uma denuncia seria todo o custo de apagar a avaliacao de um concorrente. Enfileira para a moderacao, que decide e registra o motivo em professional_reviews.moderation_reason.';

-- ---------------------------------------------------------------------------
-- A MEDIA NAO E COLUNA, e esta e a decisao com mais consequencia do arquivo
-- ---------------------------------------------------------------------------
-- Nao ha `professionals.rating_average` nem `rating_count`, e nao ha gatilho
-- que os mantenha. A media e a contagem sao CALCULADAS NA CONSULTA, pela funcao
-- abaixo.
--
-- O motivo e CONSISTENCIA e nao preguica. Media guardada tem quatro caminhos de
-- invalidacao obvios -- criar, editar, apagar e moderar -- e um quinto que
-- nenhum gatilho em `professional_reviews` consegue ver: **o autor desabilitar
-- a conta**. Isso muda a media de todo local que ele avaliou sem tocar em
-- nenhuma linha de avaliacao. Um gatilho nessa tabela nao dispara, e a media
-- fica errada em silencio -- que e o pior defeito desta classe, porque a tela
-- continua mostrando um numero com cara de certo.
--
-- Cobrir o quinto caminho exigiria um gatilho em `users.deleted_at` que
-- percorresse todas as avaliacoes da conta e recalculasse cada local afetado,
-- dentro da transacao de desabilitar a conta. Isso poe um laco de tamanho
-- desconhecido no caminho de uma operacao que o usuario esta esperando, para
-- economizar um `AVG` sobre um indice que ja existe, numa consulta que le UM
-- local.
--
-- SE ALGUM DIA PRECISAR MATERIALIZAR: a condicao de consistencia e que o
-- recalculo seja disparado pelos CINCO caminhos, e o quinto e
-- `users.deleted_at`, nao `professional_reviews`.
CREATE FUNCTION pontuacao_do_local(p_professional uuid)
RETURNS TABLE (media numeric, quantidade bigint,
               n1 bigint, n2 bigint, n3 bigint, n4 bigint, n5 bigint)
LANGUAGE sql STABLE AS $$
  SELECT
    -- UMA CASA DECIMAL, arredondada AQUI e nao na tela: tres telas (app,
    -- painel, site) arredondariam de tres jeitos, e a media do mesmo local
    -- apareceria diferente em cada uma.
    --
    -- NULO quando nao ha avaliacao, e nao zero: zero se le como "pessimo", e
    -- um local sem avaliacao nao e pessimo. `AVG` de conjunto vazio ja devolve
    -- nulo, e o `round` o preserva -- o que esta escrito aqui e que esse nulo e
    -- intencional e nao pode virar `COALESCE(...,0)` numa limpeza futura.
    round(avg(r.rating)::numeric, 1)                      AS media,
    count(*)                                              AS quantidade,
    count(*) FILTER (WHERE r.rating = 1)                  AS n1,
    count(*) FILTER (WHERE r.rating = 2)                  AS n2,
    count(*) FILTER (WHERE r.rating = 3)                  AS n3,
    count(*) FILTER (WHERE r.rating = 4)                  AS n4,
    count(*) FILTER (WHERE r.rating = 5)                  AS n5
  FROM professional_reviews r
  WHERE r.professional_id = p_professional
    AND r.status = 'published'
    -- AVALIACAO DE CONTA DESABILITADA NAO CONTA E NAO E LISTADA.
    --
    -- Decisao do cliente de 17/10: conta desabilitada "nao e mais encontrada em
    -- nenhuma pagina ou funcionalidade". `conta_habilitada(uuid)` (migracao
    -- 20261017000013) e o PONTO UNICO da definicao e trata o nulo como
    -- habilitado -- e aqui `author_user_id` e NOT NULL, entao o ramo do nulo
    -- nao ocorre.
    --
    -- O MESMO predicado filtra a lista de avaliacoes em
    -- `kysely-directory-repository.ts`. Os dois lugares precisam concordar
    -- caractere a caractere: media e contagem calculadas com um recorte e lista
    -- exibida com outro produzem "128 avaliacoes" sobre uma lista de 126, que e
    -- o defeito que a duplicacao de recorte sempre produz.
    AND conta_habilitada(r.author_user_id)
$$;

COMMENT ON FUNCTION pontuacao_do_local(uuid) IS
  'Media (1 casa, NULA sem avaliacao -- zero se leria como "pessimo"), contagem e histograma das notas publicadas de um local. CALCULADA e nao materializada: media guardada tem um quinto caminho de invalidacao que nenhum gatilho em professional_reviews enxerga -- o autor desabilitar a conta muda a media de todo local que ele avaliou sem tocar em nenhuma avaliacao. Usa conta_habilitada(uuid) (ponto unico, migracao 20261017000013) com o MESMO recorte da lista, para contagem e lista nunca discordarem.';

-- Down Migration

DROP FUNCTION IF EXISTS pontuacao_do_local(uuid);
DROP TABLE IF EXISTS professional_review_reports;
DROP TABLE IF EXISTS professional_reviews;
