-- ADR-0011, emenda 1 de 21/09/2026 — o diretorio de profissionais nasce no
-- esquema, sem fluxo e sem rota.
--
-- A PREMISSA DO ADR FOI NEGADA, NAO CONFIRMADA. O titulo do arquivo do ADR
-- ainda diz "perfil criado pela comunidade" porque ADR e registro historico; a
-- regra que vale e a da emenda 1:
--
--   Nenhum perfil nasce sem o aceite de quem ele descreve. A comunidade
--   convida e avalia -- nunca cria.
--
-- O mecanismo e convite com aceite, mais semente por parceria. Por isso
-- `source` NAO tem 'community': tem 'self', 'invited' e 'import'.
--
-- ESCOPO AUTORIZADO PELO CLIENTE EM 21/09: duas tabelas, e so elas.
-- `professional_reviews` e `professional_review_replies` ficam de fora porque o
-- modelo de avaliacao MUDOU com a queda da premissa, e criar hoje uma tabela
-- cuja regra acabou de mudar e o oposto de evitar migracao futura.
-- `professional_invitations` vai ser necessaria e NAO esta desenhada (quem
-- convida, o que o convite carrega, validade, o que uma recusa impede): tabela
-- criada antes do fluxo nasce com as colunas erradas. E migracao futura
-- CONHECIDA, nao surpresa. Ver ADR-0011 secao 5.4.
--
-- ---------------------------------------------------------------------------
-- O QUE "NENHUMA MIGRACAO DESTRUTIVA" QUER DIZER AQUI, EM OBRIGACAO
-- ---------------------------------------------------------------------------
-- 1. So CREATE. Nenhum DROP, nenhum ALTER ... DROP COLUMN, nenhum ALTER ...
--    TYPE em tabela existente. Esta migracao nao toca em nada que ja existe,
--    `users` inclusive.
-- 2. Nenhuma FK nova para fora destas duas tabelas alem de `users.id`
--    (ADR-0002). E-mail, telefone, `sub` externo e qualquer valor impresso em
--    QR nunca sao chave estrangeira.
-- 3. Todo dominio fechado nasce com CHECK, nao com `enum` nativo. Acrescentar
--    valor a um `enum` nativo e DDL, e o ponto inteiro desta migracao e nao
--    precisar de DDL com produto no ar: `source` acabou de perder 'community' e
--    ganhar 'invited', e vai mudar de novo.
-- 4. As duas tabelas nascem VAZIAS e SEM FLUXO. Nenhuma operacao de
--    `api/openapi.yaml` muda nesta rodada, e nenhuma rota escreve aqui.
--
-- SOBRE O `down`: ele e `DROP TABLE` das duas, e so e reversao ENQUANTO NAO
-- HOUVER LINHA. Depois do primeiro registro ele deixa de ser volta atras e vira
-- PERDA -- de perfil aceito por uma pessoa e de evidencia de verificacao. Quem
-- for descer isto com dado dentro precisa exportar antes, e a decisao nao e de
-- quem roda o comando.

-- Up Migration

-- ---------------------------------------------------------------------------
-- professionals
-- ---------------------------------------------------------------------------
CREATE TABLE professionals (
  id                  uuid        PRIMARY KEY,

  -- Lista fechada de atividade. As cinco primeiras sao as que o ADR nomeia na
  -- prosa das provas aceitas; `clinic` e o estabelecimento que a secao 4 cita
  -- como o caso de CNPJ. CHECK e nao `enum` pelo motivo 3 do cabecalho: esta
  -- lista vai crescer, e crescer nao pode custar DDL.
  kind                text        NOT NULL
                                  CHECK (kind IN ('vet', 'groomer', 'walker',
                                                  'sitter', 'trainer', 'clinic')),

  display_name        text        NOT NULL
                                  CONSTRAINT professionals_display_name_tamanho
                                  CHECK (char_length(display_name) BETWEEN 2 AND 120),
  about               text        CONSTRAINT professionals_about_tamanho
                                  CHECK (about IS NULL OR char_length(about) <= 2000),

  -- Cidade, bairro e ponto sao PERMITIDOS aqui, e a diferenca para a pagina
  -- publica do tutor (BICHUS-174, que proibe localizacao em qualquer precisao)
  -- e legitima: o tutor e uma pessoa que nao pediu para ser achada; o
  -- profissional e uma entidade que ACEITOU aparecer para ser contratada, e
  -- onde ela atende e o conteudo util do diretorio. Diretorio de servico sem
  -- onde a pessoa atende nao e diretorio. Ver ADR-0011 secao 4.
  city                text        CONSTRAINT professionals_city_tamanho
                                  CHECK (city IS NULL OR char_length(city) BETWEEN 2 AND 80),
  state               text        CONSTRAINT professionals_uf_tamanho
                                  CHECK (state IS NULL OR char_length(state) = 2),
  neighborhood        text        CONSTRAINT professionals_bairro_tamanho
                                  CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 80),
  -- `geography` e nao `geometry`, pelo mesmo motivo de `lost_cases`: a consulta
  -- que importa e "quem atende perto daqui", em metros sobre o elipsoide, e
  -- `ST_DWithin` acerta em Manaus e em Porto Alegre sem ninguem escolher zona.
  geo                 geography(Point, 4326),

  -- 'community' NAO EXISTE MAIS. A emenda 1 o substituiu por 'invited'. Quem
  -- reintroduzir 'community' aqui estara desfazendo a decisao do cliente de
  -- 21/09, e nao corrigindo um esquecimento.
  source              text        NOT NULL
                                  CHECK (source IN ('self', 'invited', 'import')),

  -- "QUEM CONVIDOU". Antes da emenda ela era "quem cadastrou"; com convite ela
  -- passou a ser um VINCULO ENTRE DUAS PESSOAS, que e exatamente o que a
  -- BICHUS-174 proibe expor em superficie publica -- inclusive na forma de
  -- contagem e inclusive na forma da existencia.
  --
  -- ELA NUNCA SAI DO SERVIDOR. Isso e restricao de SAIDA, nao so de coluna: a
  -- trilha precisa dela, nenhuma resposta pode carrega-la. Quem faz esta regra
  -- ser verificavel em vez de combinada e
  -- `src/tools/portao-colunas-que-nao-saem.ts`.
  --
  -- SET NULL e nao CASCADE: apagar a conta de quem convidou nao pode apagar o
  -- perfil de quem aceitou o convite. O perfil e da pessoa que ele descreve.
  created_by_user_id  uuid        REFERENCES users (id) ON DELETE SET NULL,

  claim_status        text        NOT NULL DEFAULT 'claimed'
                                  CHECK (claim_status IN ('unclaimed', 'claim_pending',
                                                          'claimed', 'disputed')),
  -- SET NULL pelo mesmo motivo: o direito de apagar a conta (LGPD) nao pode ser
  -- travado pelo diretorio, e nao pode levar junto o registro da entidade.
  claimed_by_user_id  uuid        REFERENCES users (id) ON DELETE SET NULL,
  claimed_at          timestamptz,

  -- Sem uso no caminho normal, e MANTIDA de proposito. Ela existia porque havia
  -- um periodo em que o perfil rodava sem dono; com convite e aceite esse
  -- periodo deixou de existir. Fica porque `source = 'import'` continua
  -- previsto, e no dia em que ele for usado o marco volta a significar algo.
  -- Coluna nula custa nada; recria-la com avaliacao ja gravada custa migracao
  -- com consequencia.
  claim_snapshot_at   timestamptz,

  -- DERIVADO da verificacao aprovada mais forte da entidade
  -- (`entity_verifications`). NUNCA escrito a mao por rota de escrita de
  -- perfil: se o perfil pudesse declarar o proprio nivel, a verificacao seria
  -- decorativa.
  --
  -- E ele, e nao um selo generico, que aparece na interface: "verificado" sem
  -- dizer O QUE foi verificado transfere para o Bichu uma responsabilidade que
  -- ele nao tem como sustentar. Foi por isso que a BICHUS-165 nao passou.
  verification_level  text        NOT NULL DEFAULT 'none'
                                  CHECK (verification_level IN ('none', 'contact_verified',
                                                                'document_verified')),

  crmv_number         text        CONSTRAINT professionals_crmv_tamanho
                                  CHECK (crmv_number IS NULL
                                         OR char_length(crmv_number) BETWEEN 3 AND 20),
  crmv_uf             text        CONSTRAINT professionals_crmv_uf_tamanho
                                  CHECK (crmv_uf IS NULL OR char_length(crmv_uf) = 2),
  cnpj                text        CONSTRAINT professionals_cnpj_tamanho
                                  CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$'),
  -- Telefone COMERCIAL, publicado de proposito pela entidade que aceitou
  -- aparecer. Continua fora de qualquer chave estrangeira (BICHUS-19).
  phone_e164          text        CONSTRAINT professionals_telefone_formato
                                  CHECK (phone_e164 IS NULL OR phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),

  status              text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft', 'published', 'hidden', 'removed')),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- A REGRA CENTRAL DA EMENDA, escrita no banco em vez de combinada na prosa:
  -- nenhum perfil nasce sem o aceite de quem ele descreve. 'self' e 'invited'
  -- sao os dois caminhos que passam por aceite, e neles o perfil NUNCA pode
  -- estar sem titular. So 'import' -- previsto no ADR e sem uso hoje -- admite
  -- 'unclaimed'.
  --
  -- O teto e `<> 'unclaimed'` e nao `= 'claimed'` de proposito: disputa
  -- acontece DEPOIS do aceite, e um CHECK preso a 'claimed' impediria a
  -- transicao para 'disputed' de um perfil legitimamente convidado.
  CONSTRAINT professionals_aceite_antes_do_perfil
    CHECK (source = 'import' OR claim_status <> 'unclaimed'),

  -- Os dois sentidos do marco de titularidade. `claimed_by_user_id` fica de
  -- fora desta restricao de proposito: o SET NULL acima faz um perfil legitimo
  -- ficar 'claimed' com titular nulo quando a pessoa apaga a conta, e um CHECK
  -- que o proibisse transformaria o exercicio de um direito em erro de banco.
  CONSTRAINT professionals_titularidade_tem_marco
    CHECK ((claim_status = 'unclaimed' AND claimed_at IS NULL AND claimed_by_user_id IS NULL)
           OR (claim_status <> 'unclaimed' AND claimed_at IS NOT NULL))
);

-- "Quem atende perto daqui". GIST e o indice que `ST_DWithin` usa; sem ele a
-- consulta por raio vira varredura da tabela inteira.
CREATE INDEX professionals_publicados_por_lugar ON professionals USING GIST (geo)
  WHERE status = 'published' AND geo IS NOT NULL;

-- Toda leitura publica do diretorio filtra por `published`. Parcial porque
-- rascunho, oculto e removido nunca aparecem, e indexa-los seria pagar por
-- linha que a consulta descarta.
CREATE INDEX professionals_publicados_por_lugar_texto
  ON professionals (state, city, neighborhood)
  WHERE status = 'published';

CREATE INDEX professionals_publicados_por_atividade ON professionals (kind, created_at DESC)
  WHERE status = 'published';

COMMENT ON TABLE professionals IS
  'ADR-0011 emenda 1: nenhum perfil nasce sem o aceite de quem ele descreve. A comunidade convida e avalia, nunca cria. Nasce vazia e sem rota.';
COMMENT ON COLUMN professionals.created_by_user_id IS
  'QUEM CONVIDOU. Vinculo entre duas pessoas: NUNCA sai do servidor, em nenhuma resposta, nem como contagem nem como existencia (ADR-0011 secao 4, BICHUS-174). Guardado por `src/tools/portao-colunas-que-nao-saem.ts`.';
COMMENT ON COLUMN professionals.source IS
  'Sem ''community'': a emenda 1 de 21/09 negou a criacao pela comunidade e pos ''invited'' no lugar.';
COMMENT ON COLUMN professionals.verification_level IS
  'DERIVADO da verificacao aprovada mais forte em entity_verifications. Nunca escrito por rota de escrita de perfil. Selo generico e proibido: a interface diz O QUE foi verificado.';
COMMENT ON COLUMN professionals.claim_snapshot_at IS
  'Sem uso no caminho normal (convite e aceite nao tem periodo sem dono). Mantida para source = ''import''.';

-- ---------------------------------------------------------------------------
-- entity_verifications  --  NAO e tabela de profissional
-- ---------------------------------------------------------------------------
-- Verificacao e propriedade de ENTIDADE, nao de profissional. Profissional e
-- organizacao dividem exatamente uma coisa -- provar quem sao -- e o CNPJ
-- verifica as duas do mesmo jeito. Tudo o mais difere. Se a verificacao
-- nascesse presa a `professionals`, a primeira entidade que nao fosse
-- profissional (a ONG da parceria de adocao) obrigaria a refaze-la, e refazer
-- verificacao com registro ja aprovado e migracao com consequencia JURIDICA,
-- nao so de dados. Generalizar antes de existir uma linha custa o nome da
-- tabela.
CREATE TABLE entity_verifications (
  id                  uuid        PRIMARY KEY,

  entity_kind         text        NOT NULL
                                  CHECK (entity_kind IN ('professional', 'organization')),

  -- SEM CHAVE ESTRANGEIRA, E ISSO E DECISAO -- NAO ESQUECIMENTO.
  --
  -- A tabela e polimorfica por desenho: e o item que a revisao de 17/09 do
  -- ADR-0011 generalizou justamente para que a primeira entidade
  -- nao-profissional nao obrigasse a refazer a tabela. O Postgres nao expressa
  -- FK condicional ao valor de outra coluna, e as duas saidas usuais custam
  -- mais do que compram: uma FK por tipo com CHECK cruzado engessa o acrescimo
  -- do terceiro tipo, e a tabela de super-tipo e uma indirecao a mais para um
  -- diretorio que ainda nao tem uma linha.
  --
  -- A INTEGRIDADE FICA NA APLICACAO. Esta escrito aqui porque sem isso a
  -- proxima pessoa "conserta" acrescentando a FK e desfaz a generalizacao.
  -- Quem faz esta frase ser verificavel em vez de combinada e o caso
  -- `entity_id nao tem chave estrangeira` em `tests/integration/esquema.test.ts`.
  entity_id           uuid        NOT NULL,

  claimant_user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  evidence_kind       text        NOT NULL
                                  CHECK (evidence_kind IN ('crmv', 'cnpj',
                                                           'phone_callback', 'document')),

  -- REFERENCIA AO DOCUMENTO, NUNCA O DOCUMENTO. CRMV, CNPJ e documento sao dado
  -- sensivel de terceiro; o objeto vive no armazenamento privado com URL
  -- assinada (ADR-0007), e esta coluna guarda o ponteiro. Documento em coluna
  -- de texto e o caminho curto que vira incidente.
  --
  -- O teto de 200 caracteres e a traducao verificavel dessa frase: uma
  -- referencia cabe, um documento colado nao.
  evidence_ref        text        CONSTRAINT entity_verifications_evidence_ref_e_referencia
                                  CHECK (evidence_ref IS NULL
                                         OR char_length(evidence_ref) BETWEEN 1 AND 200),

  submitted_at        timestamptz NOT NULL DEFAULT now(),

  decision            text        NOT NULL DEFAULT 'pending'
                                  CHECK (decision IN ('pending', 'approved', 'rejected')),
  reviewed_by_user_id uuid        REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  rejection_reason    text        CONSTRAINT entity_verifications_rejection_reason_tamanho
                                  CHECK (rejection_reason IS NULL
                                         OR char_length(rejection_reason) <= 500),

  created_at          timestamptz NOT NULL DEFAULT now(),

  -- Pendente nao tem decisao; decidido tem quando. Os dois sentidos, porque o
  -- estado pela metade e o que faz `verification_level` derivar de nada.
  CONSTRAINT entity_verifications_decidida_tem_quando
    CHECK ((decision = 'pending' AND reviewed_at IS NULL)
           OR (decision <> 'pending' AND reviewed_at IS NOT NULL)),

  -- Motivo de recusa so com recusa: preenche-lo em 'approved' sujaria a unica
  -- coluna que explica um "nao" a quem o recebeu.
  CONSTRAINT entity_verifications_motivo_so_com_recusa
    CHECK (rejection_reason IS NULL OR decision = 'rejected')
);

-- A consulta que deriva `verification_level`: "as verificacoes aprovadas desta
-- entidade". Sem ela a derivacao varre a tabela.
CREATE INDEX entity_verifications_aprovadas_da_entidade
  ON entity_verifications (entity_kind, entity_id)
  WHERE decision = 'approved';

-- A fila de moderacao. Manual desde o inicio, por decisao do ADR.
CREATE INDEX entity_verifications_fila_de_analise
  ON entity_verifications (submitted_at)
  WHERE decision = 'pending';

CREATE INDEX entity_verifications_do_solicitante ON entity_verifications (claimant_user_id);

COMMENT ON TABLE entity_verifications IS
  'Verificacao e propriedade de ENTIDADE, nao de profissional (ADR-0011, revisao de 17/09). Polimorfica de proposito.';
COMMENT ON COLUMN entity_verifications.entity_id IS
  'SEM chave estrangeira DE PROPOSITO: a tabela e polimorfica e o Postgres nao expressa FK condicional. A integridade fica na aplicacao. Acrescentar FK aqui desfaz a generalizacao de 17/09.';
COMMENT ON COLUMN entity_verifications.evidence_ref IS
  'Referencia ao documento, NUNCA o documento. O objeto vive no armazenamento privado com URL assinada (ADR-0007).';

-- Down Migration

-- Reversao ENQUANTO VAZIAS. Com linha dentro isto e perda, nao volta atras:
-- ver o cabecalho.
DROP TABLE entity_verifications;
DROP TABLE professionals;
