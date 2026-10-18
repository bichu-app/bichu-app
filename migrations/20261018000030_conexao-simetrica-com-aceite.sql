-- FATIA F DA FRENTE DE COMUNIDADE: **CONEXAO ENTRE PESSOAS, SIMETRICA, COM
-- ACEITE**. Decisao do cliente de 18/10/2026, nas palavras dele: *"se elas
-- forem amigas nao tem problema, o que nao pode e ser publico, sem ter nenhum
-- relacionamento"*.
--
-- **UM GRAFO SO. NAO EXISTE "SEGUIR"**, e o argumento esta no plano
-- (`design/prototipos/conexao-e-vitrine/PLANO.md`, item 4-A.1): uma timeline de
-- quem voce segue E a lista de presenca com hora -- diz onde a pessoa vai estar
-- e quando, para alguem que so apertou um botao. O ADR-0025 ja recusou a lista
-- de presenca por dizer QUEM esteve; a linha do tempo e estritamente pior.
-- Encerrado, nao se reabre.
--
-- ====================================================================
-- O CARIMBO, CONFERIDO DAS DUAS FORMAS
-- ====================================================================
--
-- `verificar-carimbo-de-migracao.mjs` le **so as refs** e nao ve o arquivo nao
-- comitado do vizinho. Entao a varredura foi dupla, em 18/10/2026:
--
--   (a) **refs**: `git for-each-ref` + `git ls-tree -r <ref> -- migrations/`
--       sobre TODAS as refs do repositorio. Maior carimbo: `20261018000014`.
--   (b) **disco**: `ls migrations/` em todos os diretorios `migrations/` dos
--       ~157 worktrees (134 encontrados com a pasta). Maior carimbo:
--       `20261018000021` -- SETE acima do que as refs mostram, que e exatamente
--       o buraco que a forma (a) nao enxerga.
--
-- Escolhido `...0030`, **nove acima do maior de qualquer uma das duas**, porque
-- quatro agentes estavam tomando carimbo na mesma hora (idade/apelido,
-- notificacoes, vitrine e a fatia E). Os numeros 22 a 29 ficam livres para
-- eles. O teto APLICADO em homologacao e `20261018000008`; refs e disco tem
-- mais, e e por isso que o teto aplicado NAO serve de referencia para escolher.
-- Reconferido no instante do commit.
--
-- ====================================================================
-- NAO FOI APLICADA. O QUE FOI EXERCITADO, E O QUE NAO FOI
-- ====================================================================
--
-- `migrate up` e `make migrar` **nao foram rodados** (e `make migrar` nem
-- reconstroi a imagem: ele aplica as migracoes DA IMAGEM, e sem build se le o
-- erro antigo e se conclui que a correcao falhou). A validacao foi em
-- `BEGIN/ROLLBACK`. O que isso NAO exercita esta escrito no relatorio da
-- entrega: a descida sobre dado, e o comportamento sob concorrencia real.
--
-- ====================================================================
-- UMA LINHA POR PAR, E A SIMETRIA MORA NO INDICE
-- ====================================================================
--
-- A conexao e simetrica, entao o par `{A,B}` tem **uma** linha, nao duas.
-- `requester_user_id` e `addressee_user_id` guardam a DIRECAO do pedido (quem
-- pediu, quem decide), e `pair_low`/`pair_high` guardam o par CANONICO, que e o
-- que o indice unico vigia. Duas linhas por par deixariam "A aceitou B" e "B
-- recusou A" coexistirem, e nao existe leitura que resolva isso depois.
--
-- **Por que par canonico em colunas, e nao `LEAST`/`GREATEST` dentro de um
-- indice de expressao ou de coluna gerada:** coluna gerada e `CHECK` exigem
-- expressao imutavel, e eu nao vou apostar uma migracao na classificacao de
-- `LEAST`/`GREATEST` sobre `uuid`. As colunas sao escritas por GATILHO -- a
-- mesma forma que `handles_esqueleto_derivado` ja usa nesta casa -- e o `CHECK`
-- que as vigia usa so operadores:
--
--     pair_low  IN (requester_user_id, addressee_user_id)
--     pair_high IN (requester_user_id, addressee_user_id)
--     pair_low < pair_high
--
-- Com `requester <> addressee`, os tres juntos obrigam o par a ser exatamente o
-- canonico. Nao e "o gatilho e bem-comportado": e aritmetica.
--
-- ====================================================================
-- TRES ESTADOS NA COLUNA, QUATRO NO PRODUTO -- E O QUARTO NAO MORA AQUI
-- ====================================================================
--
-- O produto tem quatro estados: pedido, aceito, recusado e **bloqueado**. Aqui
-- ficam os tres primeiros. **O bloqueio e da fatia E** (`user_blocks`), que
-- outro agente esta construindo agora, e ele e ferramenta PESSOAL -- sem
-- administrador, sem revisao, com efeito imediato. Guardar "bloqueado" como
-- valor de `state` daria duas fontes para a mesma verdade e faria o bloqueio
-- depender de existir uma conexao antes, o que e falso.
--
-- `nenhum` nao e valor: e a ausencia de linha.
--
-- **`declined` NAO APARECE A NINGUEM.** Ele existe por uma razao so: o descanso
-- de 90 dias (`rest_until`), que impede o pedido recusado de voltar na semana
-- seguinte. Para quem PEDIU, a linha recusada se projeta como "enviado" ate
-- `expires_at` e depois desaparece -- indistinguivel de um pedido que ninguem
-- respondeu. E deliberado, e e o item 5 do plano 4: *"a recusa e silenciosa (...)
-- Nenhum 'ela recusou voce', que e o que faz as pessoas aceitarem estranhos
-- para nao criar atrito."* O mesmo desenho que `requestToJoinNetworkEvent` ja
-- aplica no pedido do encontro privado.
--
-- ====================================================================
-- OS TETOS, E POR QUE ESTES NUMEROS
-- ====================================================================
--
-- Os tres tetos contam LINHAS, nao requisicoes, entao nenhum deles e a porta de
-- teto do ADR-0016 (a mesma limitacao registrada para o teto de 3 encontros
-- ativos). Eles aparecem DUAS VEZES, de proposito, e nao sao duas copias:
--
--   1. no dominio (`src/modules/connections/domain/teto-de-conexoes.ts`), que e
--      quem produz a recusa que a pessoa LE;
--   2. na clausula `WHERE` do `INSERT`/`UPDATE` desta tabela, que e o unico
--      nivel que vale sob concorrencia -- dois pedidos simultaneos passam pela
--      conferencia do dominio e so o `WHERE` os barra.
--
-- Os numeros (plano item 4.1, a confirmar com o cliente no item 7.7):
--
--   * **150 conexoes aceitas por pessoa.** E bairro, nao plateia. 150 e o
--     numero que se SOBE depois e nao se desce: quem passou de 150 e depois
--     visse o teto cair perderia conexao que ja existia, e nao ha forma honesta
--     de escolher qual. O teto vale para os DOIS lados -- aceitar tambem conta
--     --, senao uma conta lotada continuaria crescendo por aceite.
--   * **20 pedidos pendentes enviados.** O pendente e a UNICA superficie de
--     saida de quem pede; 20 nao atrapalha uma semana real de bairro e limita o
--     alcance de quem espalha.
--   * **10 pedidos novos por dia** (janela corrida de 24 h, nao meia-noite:
--     meia-noite daria 20 pedidos em dois minutos na virada). Com 20 pendentes,
--     quem espalha esgota o pendente em dois dias e PARA -- o pendente e o
--     freio, e o diario e a desaceleracao.
--   * **90 dias de descanso apos recusa**, para o recusado nao voltar amanha.
--   * **30 dias de validade do pendente**, o que torna a expiracao PREGUICOSA:
--     ninguem precisa de tarefa periodica, porque toda leitura compara
--     `expires_at` com o agora. Linha expirada nao e apagada; ela so para de se
--     projetar.
--
-- O teto por REQUISICAO (60/h por conta na criacao) e do contrato, e e outra
-- coisa: ele limita a taxa de chamada, nao o tamanho do grafo.
--
-- ====================================================================
-- CONTA DESABILITADA: A CONEXAO SOME, A LINHA FICA
-- ====================================================================
--
-- `conta_habilitada(uuid)` (`20261017000013`) entra na clausula `WHERE` de toda
-- leitura, **nos dois lados**. O comentario daquela funcao carrega a decisao do
-- cliente de 17/10: conta desabilitada *"nao e mais encontrada em nenhuma
-- pagina ou funcionalidade"*.
--
-- **Some -- nao fica fantasma e nao vira marca.** Um "conta indisponivel" no
-- lugar contaria a um terceiro que aquela pessoa existiu e saiu, que e
-- informacao sobre ela; e contagem que nao bate com a lista e pior que as duas
-- coisas. **A linha NAO e apagada**, entao reabilitar devolve a conexao
-- intacta -- e por isso `ON DELETE CASCADE` aqui e sobre exclusao FISICA da
-- conta, que e outro evento.
--
-- **A consequencia que ninguem gosta, e que fica dita:** some da contagem
-- significa que o teto de 150 do LADO VIVO abre uma vaga, e reabilitar pode
-- devolver a pessoa a 151. Resolvido pelo lado certo: o teto e cobrado so no
-- pedido e no aceite NOVOS. Linha que ja existe nunca e recusada
-- retroativamente -- o contrario apagaria conexao por causa de um numero.
--
-- ====================================================================
-- NENHUM UUID EM SAIDA (ADR-0010 item 6): `ref` POR ARESTA
-- ====================================================================
--
-- `id` e UUIDv7, ordenavel, e entrega a taxa de criacao de linhas da
-- plataforma: nao sai. Quem sai e `ref`, 128 bits de CSPRNG em base64url,
-- **sorteado por LINHA** -- a mesma forma de `professional_reviews.ref`,
-- `directory_suggestions.ref` e do recibo do pedido de plaquinha.
--
-- **`ref` e DA ARESTA, nunca da pessoa, e isto e o coracao da fatia.** Um
-- identificador publico por PESSOA seria um endereco estavel e compartilhavel
-- -- exatamente o que matou a descoberta por link (plano 4-B.1): *"um endereco
-- estavel e compartilhavel vira endereco publico no primeiro grupo em que
-- alguem o cola"*. Com `ref` por aresta, so quem e uma das duas pontas chega a
-- ela, e o `WHERE` da leitura cobra isso: quem nao e ponta recebe **404, nunca
-- 403** (ADR-0021).
--
-- ====================================================================
-- COMO SE CHEGA A UM PEDIDO -- E POR QUE ESTA TABELA NAO SABE
-- ====================================================================
--
-- `origin` registra de onde o pedido NASCEU, e a lista e fechada em tres:
-- `anchored_case` (caso de pet encerrado como devolvido), `anchored_event`
-- (encontro em que os dois estiveram) e `presence_code` (codigo lido cara a
-- cara, token rotativo de 5 min). Sao as fatias **H'** e **H''**, e elas NAO
-- sao desta entrega.
--
-- **Nao existe quarto valor, e nao existe caminho por apelido, por busca nem
-- por link.** A coluna nasce com a lista completa de proposito: acrescentar um
-- valor depois exige mexer nesta migracao, que e onde a decisao do cliente esta
-- escrita. Um `origin` aberto a texto livre seria a porta por onde o quarto
-- caminho entraria sem ninguem decidir.
--
-- Esta tabela nao tem, e nao deve ter: busca de pessoa, listagem de pessoas,
-- sugestao de quem conhecer, contagem de seguidores, e **nenhuma leitura que
-- devolva a LISTA de conexoes de alguem** -- nem para o proprio dono (plano
-- 4-B: *"Lista de conexoes | nunca | nunca"*).

-- Up Migration

CREATE TABLE user_connections (
  id                 uuid        PRIMARY KEY,
  ref                text        NOT NULL
                                 CONSTRAINT user_connections_ref_opaca
                                 CHECK (ref ~ '^[A-Za-z0-9_-]{22}$'),
  requester_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  addressee_user_id  uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pair_low           uuid        NOT NULL,
  pair_high          uuid        NOT NULL,
  state              text        NOT NULL DEFAULT 'pending'
                                 CONSTRAINT user_connections_estado_conhecido
                                 CHECK (state IN ('pending', 'accepted', 'declined')),
  origin             text        NOT NULL
                                 CONSTRAINT user_connections_origem_fechada
                                 CHECK (origin IN ('anchored_case', 'anchored_event', 'presence_code')),
  requested_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  responded_at       timestamptz,
  rest_until         timestamptz,

  CONSTRAINT user_connections_nao_e_consigo
    CHECK (requester_user_id <> addressee_user_id),
  CONSTRAINT user_connections_par_canonico
    CHECK (pair_low IN (requester_user_id, addressee_user_id)
       AND pair_high IN (requester_user_id, addressee_user_id)
       AND pair_low < pair_high),
  CONSTRAINT user_connections_resposta_coerente
    CHECK ((state = 'pending') = (responded_at IS NULL)),
  CONSTRAINT user_connections_descanso_so_na_recusa
    CHECK ((state = 'declined') = (rest_until IS NOT NULL))
);

COMMENT ON TABLE user_connections IS
  'A conexao entre pessoas: SIMETRICA, com pedido e aceite, UMA LINHA POR PAR (fatia F, decisao do cliente de 18/10/2026: "se elas forem amigas nao tem problema, o que nao pode e ser publico, sem ter nenhum relacionamento"). NAO EXISTE SEGUIR: uma timeline de quem voce segue e a lista de presenca com hora, e o ADR-0025 ja recusou a lista de presenca -- ver o cabecalho desta migracao. NENHUMA leitura devolve a LISTA de conexoes de alguem, nem ao proprio dono (plano 4-B); o que existe e CONTAGEM para o dono e o predicado "estes dois estao conectados?" para as outras superficies. O bloqueio NAO esta aqui: ele e user_blocks, da fatia E, e e ferramenta pessoal e nao estado desta aresta.';

COMMENT ON COLUMN user_connections.ref IS
  'O identificador publico e opaco, 128 bits de CSPRNG em base64url (22 caracteres, sem preenchimento), sorteado por LINHA. Existe porque `id` e UUID interno e o ADR-0010 item 6 o proibe em saida publica; mesma forma de professional_reviews.ref e directory_suggestions.ref. E DA ARESTA e NUNCA DA PESSOA: identificador publico por pessoa seria endereco estavel e compartilhavel, que e exatamente o que matou a descoberta por link (plano 4-B.1).';

COMMENT ON COLUMN user_connections.requester_user_id IS
  'Quem PEDIU. Com addressee_user_id guarda a DIRECAO do pedido -- quem pede nao decide, quem recebe decide --, enquanto o par canonico em pair_low/pair_high guarda a simetria. Esta coluna NAO sai em resposta: ela e predicado de clausula WHERE (ADR-0021), e a resposta carrega `ref`, nome de exibicao e apelido.';

COMMENT ON COLUMN user_connections.addressee_user_id IS
  'Quem RECEBEU o pedido e e o unico que pode aceitar. Nao sai em resposta, pela mesma razao de requester_user_id.';

COMMENT ON COLUMN user_connections.pair_low IS
  'A menor das duas contas, escrita pelo gatilho user_connections_par_derivado. E com pair_high que o indice unico user_connections_um_par_uma_linha vigia a simetria: o par {A,B} tem UMA linha, nao duas. Nao e coluna gerada porque coluna gerada exige expressao imutavel e LEAST/GREATEST sobre uuid nao e aposta que se faz numa migracao; o CHECK user_connections_par_canonico usa so operadores e obriga o par a ser o canonico de qualquer forma.';

COMMENT ON COLUMN user_connections.pair_high IS
  'A maior das duas contas. Ver pair_low.';

COMMENT ON COLUMN user_connections.state IS
  'pending, accepted ou declined. "nenhum" e a AUSENCIA de linha, e "bloqueado" NAO e valor daqui (user_blocks, fatia E). declined NAO APARECE A NINGUEM: ele existe pelo descanso de 90 dias em rest_until, e para quem pediu a linha recusada se projeta como "enviado" ate expires_at e depois desaparece -- indistinguivel de pedido nao respondido. E o item 5 do plano 4: a recusa e silenciosa, porque "ela recusou voce" e o que faz as pessoas aceitarem estranhos para nao criar atrito.';

COMMENT ON COLUMN user_connections.origin IS
  'De onde o pedido NASCEU, em lista FECHADA de tres: anchored_case (caso encerrado como devolvido), anchored_event (encontro em que os dois estiveram) e presence_code (codigo lido cara a cara, token rotativo de 5 min). Sao as fatias H-linha e H-duas-linhas, que NAO sao desta entrega. NAO HA quarto valor, e nao ha caminho por apelido, por busca nem por link: a descoberta por link morreu na decisao de 18/10 (plano 4-B.1). A lista nasce fechada de proposito -- um valor novo obriga a mexer nesta migracao, que e onde a decisao esta escrita.';

COMMENT ON COLUMN user_connections.expires_at IS
  'O pendente vale 30 dias. A expiracao e PREGUICOSA: nenhuma tarefa periodica, porque toda leitura compara isto com o agora. Linha expirada nao e apagada, ela so para de se projetar -- e isso tambem e o que faz a recusa parecer expiracao para quem pediu.';

COMMENT ON COLUMN user_connections.rest_until IS
  'O descanso de 90 dias apos a recusa: antes disto nao se pede de novo ao mesmo par. NAO NULO exatamente quando state = declined (CHECK user_connections_descanso_so_na_recusa), porque um descanso sem recusa e um prazo sem fato e uma recusa sem descanso deixaria o pedido voltar amanha.';

-- O par canonico. A MESMA forma de `handles_esqueleto_derivado` (20261018000005):
-- valor derivado no banco, por gatilho, e nao confiado a quem escreve. Se duas
-- camadas puderem calcular o par, uma delas vai calcular diferente um dia.
CREATE FUNCTION user_connections_derivar_par() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.requester_user_id < NEW.addressee_user_id THEN
    NEW.pair_low  := NEW.requester_user_id;
    NEW.pair_high := NEW.addressee_user_id;
  ELSE
    NEW.pair_low  := NEW.addressee_user_id;
    NEW.pair_high := NEW.requester_user_id;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION user_connections_derivar_par() IS
  'Escreve pair_low/pair_high a partir das duas contas, em ordem canonica. Unica fonte do par: a aplicacao nao calcula e nao oferece as duas colunas no tipo.';

CREATE TRIGGER user_connections_par_derivado
  BEFORE INSERT OR UPDATE OF requester_user_id, addressee_user_id ON user_connections
  FOR EACH ROW EXECUTE FUNCTION user_connections_derivar_par();

CREATE UNIQUE INDEX user_connections_ref_unica ON user_connections (ref);

-- A SIMETRIA, em uma linha de SQL. Sem este indice o grafo aceita "A aceitou B"
-- e "B recusou A" ao mesmo tempo, e nenhuma leitura resolve isso depois.
CREATE UNIQUE INDEX user_connections_um_par_uma_linha
  ON user_connections (pair_low, pair_high);

-- Os tetos conferidos na clausula WHERE precisam contar rapido pelos DOIS lados:
-- 150 conta a pessoa como pedinte E como destinataria.
CREATE INDEX user_connections_do_pedinte
  ON user_connections (requester_user_id, state, requested_at DESC);

CREATE INDEX user_connections_do_destinatario
  ON user_connections (addressee_user_id, state, requested_at DESC);

-- Down Migration

DROP TRIGGER IF EXISTS user_connections_par_derivado ON user_connections;
DROP FUNCTION IF EXISTS user_connections_derivar_par();
DROP TABLE IF EXISTS user_connections;
