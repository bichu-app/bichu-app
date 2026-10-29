-- O TIPO DE ENTIDADE NA FILA DE INDICACAO (pedido do cliente, 29/10/2026):
-- *"esta faltando o campo se e um profissional, ong ou estabelecimento"*, no
-- formulario de INDICAR do aplicativo.
--
-- ## POR QUE ISTO PRECISA DE MIGRACAO, e por que a frente do formulario parou
--
-- `directory_suggestions` **nao tinha `entity_kind`**. A `20261018000012` criou
-- a coluna em `professionals`, nao na fila. Sem coluna, o campo seria **aceito e
-- descartado em silencio** -- o pior desfecho, porque a tela prometeria guardar
-- o que o revisor nunca veria. A frente que montou o formulario mediu isso e
-- parou, e essa foi a decisao certa.
--
-- ## POR QUE ESTA MIGRACAO E SEPARADA DA `20261029000002`
--
-- A coordenacao pediu "uma migracao para tudo, se couber". **Nao couber e a
-- resposta medida**: a `20261029000002` carrega RECLASSIFICACAO DE DADO (as 27
-- entradas `sitter` -> `boarding`), e ela ja foi exercitada contra Postgres com
-- massa semeada, `up` e `down`, e cinco iscas provadas. Apendar um assunto
-- diferente nela obrigaria a refazer aquela medicao inteira para medir uma
-- coluna aditiva -- e o risco de um `up` novo mexer no dado reclassificado nao
-- se paga por um arquivo menos.
--
-- O risco que a coordenacao queria evitar e OUTRO e continua evitado: duas
-- FRENTES numerando migracao ao mesmo tempo. Esta e a terceira do mesmo lote, da
-- mesma frente, numerada em sequencia depois de conferir `origin/development`.
--
-- ## O VOCABULARIO NAO E NOVO, E ISSO E O PONTO
--
-- `entity_verifications.entity_kind` existe desde a `20260921000002` e
-- `professionals.entity_kind` desde a `20261018000012`, as duas com
-- `CHECK (entity_kind IN ('professional', 'organization'))`. Aqui nao se
-- inventa vocabulario: **MESMO NOME DE COLUNA, MESMOS DOIS VALORES, MESMA
-- ORDEM**. Uma segunda convencao para o mesmo conceito e a convencao que
-- diverge, e o diretorio passaria a ter `organization` num lugar e `ong` no
-- outro.
--
-- Os ROTULOS sao os que o cliente definiu e os que o painel ja mostra em
-- `TIPOS_DE_ENTIDADE`: **"Profissional ou estabelecimento"** e **"ONG"**.
-- Rotulo nao chega ao banco; fica dito aqui porque a igualdade entre as duas
-- telas e requisito e nao coincidencia.
--
-- ## ADITIVO, COM PADRAO: NENHUMA LINHA E REESCRITA
--
-- `NOT NULL DEFAULT 'professional'`, exatamente como a `20261018000012` fez em
-- `professionals`. Toda indicacao que ja existe vale como profissional, que e o
-- que ela sempre significou -- nao havia como dizer outra coisa.
--
-- ## A FUNCAO DE REGISTRO VAI DE DOZE PARA TREZE ARGUMENTOS
--
-- `directory_suggestions_registrar` existe porque `suggested_by_user_id` e
-- coluna proibida para o SQL da aplicacao: o nome dela fica dentro da funcao, e
-- o repositorio chama a funcao pelo nome. A `20261017000015` ja fez esta troca
-- uma vez (onze -> doze, com `postal_code`) e escreveu o motivo da forma:
-- **DROP e CREATE, e nunca `CREATE OR REPLACE`** -- no Postgres assinatura
-- diferente e OUTRA funcao, e deixar a de doze de pe a deixaria gravando
-- indicacao sem tipo de entidade para sempre, pronta para alguem chamar.
--
-- `p_entity_kind` entra DEPOIS de `p_kind`, porque e o outro eixo do mesmo par:
-- `kind` e o que a entrada FAZ e `entity_kind` e o que ela E. Posicao no fim
-- seria ordem de migracao e nao ordem de leitura.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao toca o FLUXO da fila.** A indicacao continua nascendo `pending` e
--   passando por aprovacao -- o cliente foi explicito sobre isso em 29/10, e
--   esta migracao nao tem nada que mude estado.
-- - **Nao reclassifica indicacao existente.** Todas valem `professional` pelo
--   `DEFAULT`, e adivinhar qual delas era ONG a partir do nome seria a migracao
--   inventando dado de terceiro.
-- - **Nao alarga `professionals_atividades_conhecidas`.** ONG nao e atividade; e
--   justamente esta coluna que diz o que a entrada E (ver a `20261018000012`).
--
-- ## SOBRE O `down`
--
-- Ele apaga a coluna e devolve a funcao de doze argumentos. **Apagar a coluna
-- PERDE o tipo de entidade das indicacoes gravadas depois da subida**, e isso
-- esta dito porque e o custo real: nao ha onde recolher o valor -- a indicacao
-- nao tem segunda coluna de tipo, e `professionals.entity_kind` so recebe o
-- valor quando a indicacao e APROVADA.
--
-- Diferente da `20261029000002`, aqui a descida **nao para com erro**: o que se
-- perde e um campo que vale `professional` em quase toda linha (o `DEFAULT`), e
-- a entrada ja aprovada guarda o tipo dela em `professionals`. Parar a descida
-- por isso travaria a volta por um dado que a aprovacao ja copiou.

-- Up Migration

ALTER TABLE directory_suggestions
  ADD COLUMN entity_kind text NOT NULL DEFAULT 'professional'
             CONSTRAINT directory_suggestions_tipo_de_entidade_conhecido
             CHECK (entity_kind IN ('professional', 'organization'));

COMMENT ON COLUMN directory_suggestions.entity_kind IS
  'O QUE a entidade indicada E -- eixo SEPARADO de `kind`, que e o que ela FAZ. Pedido do cliente de 29/10/2026: "esta faltando o campo se e um profissional, ong ou estabelecimento" no formulario de indicar. MESMO nome de coluna e MESMOS dois valores de professionals.entity_kind (20261018000012) e de entity_verifications.entity_kind (20260921000002): uma segunda convencao para o mesmo conceito e a que diverge. DEFAULT professional porque toda indicacao gravada antes desta migracao vale como profissional -- nao havia como dizer outra coisa. Os rotulos sao "Profissional ou estabelecimento" e "ONG", iguais aos de TIPOS_DE_ENTIDADE no painel, e rotulo nao chega ao banco. Uma ONG que atende como clinica tem kind = clinic E entity_kind = organization: as duas coisas ao mesmo tempo.';

COMMENT ON CONSTRAINT directory_suggestions_tipo_de_entidade_conhecido ON directory_suggestions IS
  'Os DOIS valores de professionals_entity_kind_check e de entity_verifications_entity_kind_check, na mesma ordem. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts.';

-- A FUNCAO DE REGISTRO, de doze para treze argumentos. `DROP` e `CREATE`, e
-- nunca `CREATE OR REPLACE`: no Postgres assinatura diferente e outra funcao, e
-- deixar a de doze de pe a deixaria gravando indicacao sem tipo de entidade
-- para sempre. Mesmo arranjo da `20261017000015`.
DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION directory_suggestions_registrar(
  p_id            uuid,
  p_ref           text,
  p_autor         uuid,
  p_display_name  text,
  p_kind          text,
  p_entity_kind   text,
  p_city          text,
  p_state         text,
  p_neighborhood  text,
  p_postal_code   text,
  p_contact_kind  text,
  p_contact_value text,
  p_note          text
) RETURNS timestamptz AS $$
  INSERT INTO directory_suggestions (
    id, ref, suggested_by_user_id, display_name, kind, entity_kind,
    city, state, neighborhood, postal_code, contact_kind, contact_value, note
  ) VALUES (
    p_id, p_ref, p_autor, p_display_name, p_kind, coalesce(p_entity_kind, 'professional'),
    p_city, p_state, p_neighborhood, p_postal_code, p_contact_kind, p_contact_value, p_note
  )
  RETURNING created_at;
$$ LANGUAGE sql;

COMMENT ON FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text) IS
  'Grava a indicacao da comunidade. Existe porque suggested_by_user_id e coluna proibida para o SQL da aplicacao (portao-colunas-que-nao-saem): o nome dela fica aqui dentro e o repositorio chama a funcao pelo nome. TREZE argumentos desde 29/10/2026, com p_entity_kind depois de p_kind -- os dois eixos do mesmo par, e nao o campo novo no fim. `coalesce(p_entity_kind, professional)` porque o corpo do contrato deixa o campo OPCIONAL: app publicado que nao o manda continua indicando, e grava o mesmo valor que o DEFAULT da coluna. A de DOZE foi DERRUBADA e nao substituida com CREATE OR REPLACE: assinatura diferente e outra funcao, e as duas de pe deixariam a antiga gravando indicacao sem tipo de entidade para sempre.';

-- Down Migration

-- Ver o cabecalho: a descida PERDE o tipo de entidade das indicacoes gravadas
-- depois da subida, e nao para por isso. O que se perde vale `professional` em
-- quase toda linha, e a entrada ja APROVADA guarda o tipo dela em
-- `professionals` -- travar a volta por um dado que a aprovacao ja copiou
-- custaria mais do que o dado vale.
DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text);

CREATE FUNCTION directory_suggestions_registrar(
  p_id            uuid,
  p_ref           text,
  p_autor         uuid,
  p_display_name  text,
  p_kind          text,
  p_city          text,
  p_state         text,
  p_neighborhood  text,
  p_postal_code   text,
  p_contact_kind  text,
  p_contact_value text,
  p_note          text
) RETURNS timestamptz AS $$
  INSERT INTO directory_suggestions (
    id, ref, suggested_by_user_id, display_name, kind,
    city, state, neighborhood, postal_code, contact_kind, contact_value, note
  ) VALUES (
    p_id, p_ref, p_autor, p_display_name, p_kind,
    p_city, p_state, p_neighborhood, p_postal_code, p_contact_kind, p_contact_value, p_note
  )
  RETURNING created_at;
$$ LANGUAGE sql;

COMMENT ON FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text) IS
  'Grava a indicacao da comunidade. Existe porque suggested_by_user_id e coluna proibida para o SQL da aplicacao: o nome dela fica aqui dentro e o repositorio chama a funcao pelo nome. DOZE argumentos desde a 20261017000015, que acrescentou p_postal_code. A de ONZE foi DERRUBADA e nao substituida com CREATE OR REPLACE: assinatura diferente e outra funcao, e as duas de pe deixariam a antiga gravando sugestao sem CEP para sempre.';

ALTER TABLE directory_suggestions
  DROP COLUMN entity_kind;
