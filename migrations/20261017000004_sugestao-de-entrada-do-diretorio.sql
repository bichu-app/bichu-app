-- A sugestao de entrada do diretorio: a FILA DE REVISAO de `Perto`, e nada
-- alem dela (operacao `suggestDirectoryEntry` do contrato).
--
-- ====================================================================
-- POR QUE ESTA TABELA EXISTE, E POR QUE ELA NAO E `professionals`
-- ====================================================================
--
-- A comunidade SUGERE um estabelecimento ou profissional. A sugestao nasce
-- `pending` e **nao publica nada**, nem agora nem automaticamente depois.
--
-- Isso nao e zelo novo: e a emenda 1 do ADR-0011, que ja esta escrita no
-- `CHECK` de `professionals.source` da `20260921000002` -- ele **nao tem** o
-- valor `'community'`:
--
--   Nenhum perfil nasce sem o aceite de quem ele descreve. A comunidade
--   convida e avalia -- nunca cria.
--
-- Criar encontro da `Rede` e a pessoa falando DELA MESMA: ela escolheu o
-- lugar, marcou a hora e responde pelo que escreveu, e por isso a
-- `20261001000005` deixou o encontro publicar direto. Sugerir uma clinica e
-- publicar sobre um TERCEIRO que nao pediu, nao sabe e pode discordar -- do
-- texto, da categoria e de aparecer. O autor e o assunto nao sao a mesma
-- pessoa, e nao existe no produto quem represente o assunto.
--
-- Entao uma rota da comunidade que inserisse em `professionals` desfaria
-- aquela decisao em vez de implementar esta. **Esta tabela e fila de revisao.**
-- Quem cria a entrada do diretorio continua sendo o painel, a partir da
-- sugestao, e pelo caminho de convite e aceite do ADR-0011.
--
-- ====================================================================
-- O QUE ESTA TABELA NAO TEM, E CADA AUSENCIA E DECISAO
-- ====================================================================
--
-- Escrito aqui para que ninguem "complete" a tabela depois achando que faltou:
--
-- 1. **Sem `geo`, sem coordenada, sem `street_address`** (ADR-0006). Nao ha
--    mapa nem geocodificacao neste caminho: `city`, `state` e `neighborhood`
--    sao ROTULO DE TEXTO. O ponto do mapa e trabalho do painel, com mapa de
--    toque, como `listDirectoryEntries` descreve. Bairro digitado nao vira
--    ponto, nem aqui nem em lugar nenhum.
-- 2. **Sem coluna de documento** (CRMV, CNPJ). Documento e prova de
--    verificacao, mora em `entity_verifications` e so entra por quem o
--    apresenta. Pedi-lo aqui seria coletar o documento de um terceiro pela mao
--    de um estranho.
-- 3. **Sem `verification_level`, `status` de perfil, `slug`, `about`,
--    `source` e `claim_status`.** Nenhum desses campos e de quem sugere:
--    publicacao, nivel e endereco publico sao do painel, e a sugestao nao e a
--    entrada.
-- 4. **Sem contato de PESSOA FISICA.** O unico contato aqui e o que a entidade
--    ja divulga para ser contratada (`contact_kind`/`contact_value`), e nunca o
--    de quem sugeriu -- a conta de quem sugeriu o servidor ja conhece.
--
-- ====================================================================
-- TRES REGRAS DA CASA QUE ESTA MIGRACAO SEGUE, E NAO REINVENTA
-- ====================================================================
--
-- - **`CHECK` e nunca `enum` nativo**, pelo motivo 3 do cabecalho da
--   `20260921000002`: acrescentar valor a `enum` nativo e DDL, e o ponto e nao
--   precisar de DDL com produto no ar. `kind` repete a lista fechada de
--   `professionals.kind`, caractere a caractere.
-- - **A coluna de estado se chama `review_status`, e nao `state`.** `state` ja
--   e a UF nesta mesma tabela, como em `professionals` e em `network_events`.
--   Duas colunas com o mesmo nome e sentidos diferentes e defeito esperando
--   quem leia rapido.
-- - **`RAISE NOTICE` nao serve de aviso neste projeto**: o `node-pg-migrate`
--   descarta `NOTICE`/`WARNING`, e ninguem le. O que precisa ser recusado e
--   recusado com `RAISE EXCEPTION`; o que precisa ser contado vai para
--   `audit.events`.

-- Up Migration

CREATE TABLE directory_suggestions (
  id                   uuid        PRIMARY KEY,

  -- O identificador que a sugestao devolve no recibo: 128 bits aleatorios em
  -- base64url, porque um UUIDv7 carrega o instante de criacao dentro. Mesmo
  -- desenho de `network_event_join_requests.ref` (`20260928000001`) e pela
  -- mesma razao do ADR-0010 item 6: o que sai em resposta nao e a chave
  -- interna, e nao entrega a taxa de criacao de registros da plataforma.
  ref                  text        NOT NULL
                       CONSTRAINT directory_suggestions_ref_formato
                       CHECK (ref ~ '^[A-Za-z0-9_-]{20,32}$'),

  -- A AUTORIA. Vinculo entre duas pessoas -- quem sugeriu e a entidade
  -- sugerida --, e ele nao atravessa a borda. Ver o `COMMENT ON COLUMN` desta
  -- coluna, que e o que o portao le.
  suggested_by_user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  display_name         text        NOT NULL
                       CONSTRAINT directory_suggestions_nome_tamanho
                       CHECK (char_length(display_name) BETWEEN 2 AND 120),

  -- A MESMA lista fechada de `professionals.kind` (`20260921000002`). Nao ha
  -- valor para ONG aqui pelo mesmo motivo de la: `professionals` nao tem
  -- `entity_kind`, e acrescentar um valor decidiria por conta propria que uma
  -- ONG e um tipo de profissional, que e justamente a pergunta aberta.
  kind                 text        NOT NULL
                       CONSTRAINT directory_suggestions_atividade_conhecida
                       CHECK (kind IN ('vet', 'groomer', 'walker',
                                       'sitter', 'trainer', 'clinic')),

  -- Rotulo de texto, com os tetos do contrato. NAO e endereco, e nao vira
  -- ponto: ver a ausencia 1 do cabecalho.
  city                 text        NOT NULL
                       CONSTRAINT directory_suggestions_cidade_tamanho
                       CHECK (char_length(city) BETWEEN 2 AND 80),

  state                text        NOT NULL
                       CONSTRAINT directory_suggestions_uf_tamanho
                       CHECK (char_length(state) = 2),

  -- Opcional: quem sugere de outra cidade costuma nao saber o bairro, e
  -- exigi-lo trocaria uma sugestao por um campo inventado.
  neighborhood         text
                       CONSTRAINT directory_suggestions_bairro_tamanho
                       CHECK (neighborhood IS NULL
                              OR char_length(neighborhood) BETWEEN 2 AND 80),

  -- O tipo do contato e DECLARADO, nunca adivinhado por heuristica: um palpite
  -- aceitaria um telefone no campo de site e vice-versa. O formato de
  -- `contact_value` e conferido contra ele na aplicacao, pelo mesmo detector
  -- que os campos equivalentes do painel usam.
  contact_kind         text        NOT NULL
                       CONSTRAINT directory_suggestions_contato_conhecido
                       CHECK (contact_kind IN ('phone', 'website', 'instagram')),

  contact_value        text        NOT NULL
                       CONSTRAINT directory_suggestions_contato_tamanho
                       CHECK (char_length(contact_value) BETWEEN 3 AND 120),

  -- Recado PARA QUEM REVISA, e nao para o diretorio. Nao e publicado, nem se a
  -- sugestao for aprovada: avaliacao da comunidade e outro modelo, e ele nao
  -- existe (ADR-0011 secao 5.4).
  note                 text
                       CONSTRAINT directory_suggestions_recado_tamanho
                       CHECK (note IS NULL OR char_length(note) <= 280),

  -- O estado da revisao. Nasce `pending` pelo DEFAULT, e nao por parametro de
  -- quem chama: estado inicial que viaja no corpo e estado que um dia chega
  -- diferente. `approved` NAO quer dizer que a entrada esta no ar -- quer dizer
  -- que a revisao aceitou seguir com o convite do ADR-0011.
  review_status        text        NOT NULL DEFAULT 'pending'
                       CONSTRAINT directory_suggestions_revisao_conhecida
                       CHECK (review_status IN ('pending', 'approved', 'declined')),

  created_at           timestamptz NOT NULL DEFAULT now(),

  -- Nulo ENQUANTO pendente, e preenchido quando alguem decidiu. As duas
  -- colunas andam juntas por restricao e nao por combinado: uma sugestao
  -- decidida sem instante, ou pendente com instante, e estado que nenhuma tela
  -- sabe desenhar.
  decided_at           timestamptz,

  CONSTRAINT directory_suggestions_ref_unico UNIQUE (ref),

  CONSTRAINT directory_suggestions_decisao_tem_instante
  CHECK ((review_status = 'pending') = (decided_at IS NULL))
);

COMMENT ON TABLE directory_suggestions IS
  'A fila de revisao de `Perto`: o que a comunidade SUGERIU para o diretorio. Nao e a entrada do diretorio e nao publica nada -- a entrada continua nascendo pelo convite e aceite do ADR-0011 (emenda 1), e por isso professionals.source nao tem ''community''. Sem coordenada, sem endereco por extenso e sem documento (ADR-0006 e ADR-0011 secao 4).';

COMMENT ON COLUMN directory_suggestions.ref IS
  'O identificador opaco que sai no recibo: 128 bits aleatorios em base64url, porque um UUIDv7 carregaria o instante de criacao dentro (ADR-0010 item 6). Mesmo desenho de network_event_join_requests.ref.';

-- A MARCA. Ela e o que `src/tools/portao-colunas-que-nao-saem.ts` le: o portao
-- extrai as colunas marcadas do texto das migracoes e REPROVA o nome literal
-- em qualquer `.ts` de `src/` e em qualquer resposta do contrato. Registrar a
-- coluna no portao e escrever esta frase aqui -- nao ha lista a manter em
-- `src/`, e e de proposito que nao ha.
COMMENT ON COLUMN directory_suggestions.suggested_by_user_id IS
  'QUEM SUGERIU. Vinculo entre duas pessoas -- quem sugeriu e a entidade sugerida --: NUNCA sai do servidor, em nenhuma resposta, nem como contagem nem como existencia (ADR-0011 secao 4, BICHUS-174). O recibo da sugestao nao traz o nome de quem sugeriu nem contagem por entidade. Guardado por `src/tools/portao-colunas-que-nao-saem.ts`, e escrito por `directory_suggestions_registrar`.';

COMMENT ON COLUMN directory_suggestions.display_name IS
  'O nome do estabelecimento ou do profissional, como ele se anuncia. Mesmo teto de professionals.display_name. Recusa contato e pagamento (D59) e controle bidirecional na aplicacao, pelo mesmo detector do encontro da comunidade: nada olha este texto antes da fila.';

COMMENT ON COLUMN directory_suggestions.kind IS
  'A MESMA lista fechada de professionals.kind. CHECK e nao enum nativo pelo motivo 3 do cabecalho da 20260921000002: esta lista vai crescer, e crescer nao pode custar DDL com produto no ar.';

COMMENT ON COLUMN directory_suggestions.city IS
  'Rotulo de texto, nunca endereco e nunca origem de ponto (ADR-0006). Nao ha geocodificacao neste caminho.';

COMMENT ON COLUMN directory_suggestions.state IS
  'A UF, duas letras. E por ESTA coluna que a de estado da revisao se chama review_status: state aqui e Unidade Federativa, como em professionals e em network_events.';

COMMENT ON COLUMN directory_suggestions.neighborhood IS
  'Opcional: quem sugere de outra cidade costuma nao saber o bairro, e exigi-lo trocaria uma sugestao por um campo inventado.';

COMMENT ON COLUMN directory_suggestions.contact_kind IS
  'Que tipo de contato PUBLICO da entidade foi informado. Declarado, nunca adivinhado: heuristica aceitaria telefone no campo de site e vice-versa.';

COMMENT ON COLUMN directory_suggestions.contact_value IS
  'UM contato publico da ENTIDADE, divulgado por ela para ser contratada -- e o que permite o painel convidar quem a sugestao descreve (ADR-0011: convite e aceite). Nunca o telefone de uma pessoa fisica e nunca o contato de quem sugeriu. E a UNICA posicao do corpo em que telefone, site ou perfil pode entrar, e o formato e conferido contra contact_kind.';

COMMENT ON COLUMN directory_suggestions.note IS
  'Recado PARA QUEM REVISA, nao para o diretorio. Nao e publicado nem se a sugestao for aprovada: avaliacao da comunidade e outro modelo e ele nao existe (ADR-0011 secao 5.4). Recusa contato e pagamento (D59), porque o canal do contato e contact_value.';

COMMENT ON COLUMN directory_suggestions.review_status IS
  'O estado da revisao, sempre pending ao nascer. approved NAO quer dizer que a entrada esta no ar: quer dizer que a revisao aceitou seguir com o convite do ADR-0011. Nao se chama state porque state aqui e a UF.';

COMMENT ON COLUMN directory_suggestions.decided_at IS
  'Nulo ENQUANTO pendente. Anda junto de review_status pelo CHECK directory_suggestions_decisao_tem_instante, e nao por combinado.';

-- ---------------------------------------------------------------------------
-- A ESCRITA, PELA FUNCAO: a autoria entra sem o nome da coluna em `src/`
-- ---------------------------------------------------------------------------
--
-- Mesmo arranjo de `network_events_gravar_autoria` (`20261001000004`), e pela
-- mesma medicao que o fez nascer: o portao de colunas que nao saem e uma
-- varredura de NOME LITERAL sobre `src/`, e ele nao sabe distinguir escrever de
-- projetar. Um `INSERT` em TypeScript que citasse `suggested_by_user_id`
-- reprovaria o portao -- e foi exatamente por esse caminho que
-- `created_by_admin_id` passou dez dias existindo sem nunca ser gravada.
--
-- A DIFERENCA em relacao a 20261001000004: la a funcao CARIMBA depois do
-- `INSERT`, porque as duas colunas de autoria sao anulaveis. Aqui a autoria e
-- `NOT NULL` -- sugestao sem autor nao e sugestao, e nao ha a quem responder
-- por ela --, entao nao existe linha intermediaria para carimbar: a funcao faz
-- o `INSERT` INTEIRO. O nome da coluna fica onde ele ja mora, nesta migracao, e
-- `src/` chama a funcao pelo nome dela.
--
-- `SECURITY INVOKER` (o padrao) de proposito: quem a chama escreve com o
-- proprio papel, e ela nao vira caminho de escrita privilegiado. `review_status`
-- NAO e parametro: ele vem do `DEFAULT` da tabela, porque estado inicial que
-- viaja em argumento e estado que um dia chega diferente. Devolve `created_at`
-- para o recibo nao precisar de uma segunda consulta.

CREATE FUNCTION directory_suggestions_registrar(
  p_id            uuid,
  p_ref           text,
  p_autor         uuid,
  p_display_name  text,
  p_kind          text,
  p_city          text,
  p_state         text,
  p_neighborhood  text,
  p_contact_kind  text,
  p_contact_value text,
  p_note          text
) RETURNS timestamptz AS $$
  INSERT INTO directory_suggestions (
    id, ref, suggested_by_user_id, display_name, kind,
    city, state, neighborhood, contact_kind, contact_value, note
  ) VALUES (
    p_id, p_ref, p_autor, p_display_name, p_kind,
    p_city, p_state, p_neighborhood, p_contact_kind, p_contact_value, p_note
  )
  RETURNING created_at;
$$ LANGUAGE sql;

COMMENT ON FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text) IS
  'Grava a sugestao com a autoria, em um comando. Existe porque o nome da coluna de autoria e reprovado em src/ pelo portao de colunas que nao saem: aqui o nome fica na migracao, que e onde ele ja mora. review_status nao e parametro -- a sugestao nasce pending pelo DEFAULT da tabela. Devolve created_at, que e o unico carimbo que o recibo traz.';

-- ---------------------------------------------------------------------------
-- A FILA DO PAINEL
-- ---------------------------------------------------------------------------
--
-- Parcial em `review_status = 'pending'`: a pergunta do painel e sempre "o que
-- esta na fila, do mais antigo para o mais novo", e o indice parcial e do
-- tamanho da fila e nao do tamanho da tabela. O decidido nao sai da tabela
-- (ele e a memoria de que alguem olhou), mas tambem nao precisa de indice: nao
-- ha tela que o percorra.
--
-- `created_at` entra na chave, e nao so `review_status`: sem ela a fila
-- ordenaria por ordenacao fisica, e "o mais antigo primeiro" -- que e a unica
-- ordem justa numa fila de trabalho humano -- custaria uma ordenacao a cada
-- abertura.

CREATE INDEX directory_suggestions_fila_de_revisao
  ON directory_suggestions (review_status, created_at)
  WHERE review_status = 'pending';

-- Down Migration

-- Descer com sugestao dentro APAGA trabalho de pessoa: o que a comunidade
-- escreveu e, nas decididas, o registro de que alguem revisou. Mesma forma da
-- `20261017000001` e da `20261017000003`: a descida reprova em voz alta em vez
-- de descartar trabalho em silencio.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM directory_suggestions) THEN
    RAISE EXCEPTION
      'ha sugestao gravada: reverter apagaria o que a comunidade escreveu e a memoria de quem revisou. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

DROP INDEX directory_suggestions_fila_de_revisao;

DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text);

DROP TABLE directory_suggestions;
