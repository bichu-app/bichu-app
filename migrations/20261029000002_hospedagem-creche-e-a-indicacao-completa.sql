-- HOSPEDAGEM E CRECHE COMO ATIVIDADES (decisao do cliente de 29/10/2026).
--
-- ## A HISTORIA PRECISA FICAR ESCRITA, PORQUE ELA EXPLICA 27 LINHAS
--
-- O valor `sitter` nasceu no PRIMEIRO commit da listagem de `Perto`
-- (`109770b4 wip: listagem de Perto`) com o rotulo **"Hospedagem"**. O valor
-- dizia *pet sitter* e o rotulo dizia *hospedagem*, e as duas coisas sao
-- diferentes: hospedagem e o pet FICAR no estabelecimento; pet sitter e alguem
-- que CUIDA, muitas vezes na casa do tutor. **O contrato nunca descreveu o que
-- cada atividade significa** -- `ProfessionalKind` lista o enum e nada mais --,
-- entao nao havia onde a divergencia ser pega, e ela viveu meses.
--
-- O glifo do app seguiu o ROTULO e nao o valor: `sitter` ficou com
-- `hotel_outlined`, uma cama.
--
-- Em 28/10/2026 o cliente renomeou o rotulo para **"Pet Sitter"**, e isso
-- CORRIGIU o rotulo -- passou a dizer o que o valor sempre disse. A pergunta que
-- ele fez na mesma conversa e a que fecha o assunto: *"o que sitter tem a ver
-- com hospedagem?"*. Nada.
--
-- Em 29/10 ele decidiu o resto, verbatim: *"Nao e um ou outro, sao todos ..
-- hospedagem, pet sitter, sao coisas diferentes"* e *"Acrescentar Creche
-- junto"*.
--
-- **AS 27 LINHAS.** Em homologacao ha 27 entradas com `kinds = {sitter}`
-- (medido em 29/10; as outras: `clinic` 50, `vet` 41, `groomer` 33, `trainer`
-- 15, `walker` 7). Elas foram cadastradas por quem viu **"Hospedagem"** na
-- tela, entao o que elas SIGNIFICAM e hospedagem -- e a partir desta migracao
-- elas passam a significar *pet sitter*, porque e isso que o rotulo diz agora.
--
-- **ESTA MIGRACAO AS RECLASSIFICA**, por decisao do cliente de 29/10/2026:
-- *"passa as 27 para boarding"*. Entao ela nao e so de restricao -- ela mexe em
-- DADO, e o cuidado e outro.
--
-- ### A ORDEM DENTRO DA SUBIDA, e ela nao e negociavel
--
-- Primeiro os tres `CHECK` ganham `boarding` e `daycare`; SO ENTAO o `UPDATE`
-- escreve `boarding`. Na ordem inversa o `CHECK` antigo recusaria o valor que a
-- propria migracao esta gravando.
--
-- ### `kinds` E ARRAY: a troca e DO ELEMENTO, e nao da coluna
--
-- `array_replace(kinds, 'sitter', 'boarding')` troca o elemento **na posicao em
-- que ele esta** e preserva o resto: `{sitter}` vira `{boarding}` e
-- `{sitter,vet}` vira `{boarding,vet}`. Sobrescrever a coluna
-- (`SET kinds = ARRAY['boarding']`) apagaria as outras atividades de uma entrada
-- que faz mais de uma.
--
-- **A POSICAO IMPORTA, e isso foi conferido e nao assumido.** `ProfessionalKinds`
-- diz, no contrato: *"a ORDEM IMPORTA, e so por uma razao: o primeiro item e o
-- que as respostas publicam em `kind`"*, e `atividadePrincipal(kinds)` devolve o
-- primeiro. (O que NAO importa e a ordem na COMPARACAO do painel --
-- `atividadesMudaram` compara conjunto --, e e so disso que fala a nota de que
-- `['vet','clinic']` e `['clinic','vet']` *"sao a mesma coisa"*.) `array_replace`
-- preserva posicao e tamanho, entao a entrada que publicava `kind: sitter`
-- publica `kind: boarding`, e a que publicava `kind: vet` continua publicando
-- `vet`.
--
-- **Nao ha como esta troca criar elemento repetido**, e a razao e temporal:
-- antes desta migracao `boarding` nao existia no vocabulario, entao nenhuma
-- linha pode ter `boarding` e `sitter` ao mesmo tempo. Nao e suposicao de
-- ausencia -- e o `CHECK` anterior que a garante.
--
-- ### O CONTROLE DE CONTAGEM, dentro da propria migracao
--
-- A subida confere, no mesmo bloco, que **nenhum array encolheu nem cresceu**:
-- `sum(cardinality(kinds))` antes e depois tem de ser identico. Se divergir, ela
-- para com erro em vez de concluir -- a conferencia e a diferenca entre "o
-- `UPDATE` rodou" e "o `UPDATE` fez a coisa certa".
--
-- O esperado em homologacao, medido pela coordenacao em 29/10 (`clinic` 50,
-- `vet` 41, `groomer` 33, `sitter` 27, `trainer` 15, `walker` 7): depois da
-- subida, **`sitter` = 0** e **`boarding` = 27**, com os outros cinco
-- inalterados. `sitter` em zero e o resultado CERTO e nao defeito: ninguem
-- estava cadastrado como pet sitter -- todos foram cadastrados como hospedagem.
--
-- **A CONTAGEM MOVIDA VAI PARA `audit.events`**, e nao para um `RAISE NOTICE`:
-- `node-pg-migrate` DESCARTA `NOTICE` e `WARNING`, entao um aviso nao chegaria a
-- ninguem. E o mesmo lugar que a `20261018000013` usou para registrar
-- reclassificacao de categoria.
--
-- ### A FILA DE INDICACAO NAO TEM O DADO RECLASSIFICADO
--
-- `directory_suggestions.kind` ganha os dois valores no `CHECK`, e **nenhuma
-- linha dela e reescrita**. A decisao do cliente nomeou as entradas do
-- DIRETORIO; uma indicacao pendente com `kind = 'sitter'` foi digitada por uma
-- pessoa que tambem leu "Hospedagem", mas reclassificar a indicacao de outra
-- pessoa e decisao que ninguem tomou -- e a fila passa por revisao, onde quem
-- aprova escolhe a atividade. Dito aqui para nao parecer esquecimento.
--
-- ### O RISCO REAL, dito com o que ele e
--
-- As 27 sao massa de HOMOLOGACAO: nao existe producao servindo cliente real,
-- entao nenhum dado de verdade esta em risco hoje. **O `UPDATE` tem de estar
-- certo de qualquer forma**, porque esta mesma migracao roda em producao no
-- lancamento, e la nao ha segunda chance.
--
-- ## OS NOMES ESCOLHIDOS, e por que estes
--
-- `boarding` para Hospedagem: e a palavra do ramo em ingles (*pet boarding*,
-- *boarding kennel*), e nao `lodging` nem `hotel` -- `hotel` descreve o PREDIO
-- e o servico se contrata como *boarding*.
--
-- `daycare` para Creche: *doggy daycare* e o termo corrente, e e uma palavra so,
-- como os outros oito valores.
--
-- **`sitter` NAO E RENOMEADO**, e isto e decisao tomada com o custo na mesa:
-- renomear valor de `enum` quebra linha ja gravada e exigiria migracao de DADO,
-- nao so de `CHECK`. O valor fica, e agora ele e coerente -- `sitter` = Pet
-- Sitter.
--
-- ## AS TRES RESTRICOES QUE MUDAM, e a terceira tambem muda por obrigacao
--
--   1. `professionals_atividades_conhecidas`: a lista fechada, 8 -> 10 valores;
--   2. `professionals_atividades_tamanho`: o teto, 1..8 -> 1..10. **Nao e
--      cosmetico**: o teto E o tamanho da lista fechada de proposito ("teto
--      maior seria ficticio", diz a `20261020000015`), e deixa-lo em 8 com 10
--      valores recusaria uma entrada que legitimamente faz as dez coisas -- com
--      a recusa vindo do TETO e nao do vocabulario;
--   3. `directory_suggestions_atividade_conhecida`: a MESMA lista, na fila de
--      indicacao da comunidade.
--
-- A terceira pelo motivo que a `20261028000001` escreveu: o contrato tem UM
-- `ProfessionalKind`, usado tambem no `kind` de `POST /v1/directory/suggestions`.
-- Alargar so `professionals` deixaria o contrato prometendo `boarding` numa rota
-- cujo `CHECK` o recusa -- `500` do banco em vez do `400` de campo invalido.
--
-- Isto **nao muda o FLUXO da fila de indicacao**: ela continua nascendo pendente
-- e passando por aprovacao. O que muda e o vocabulario que ela aceita.
--
-- ## A FORMA: DROP e ADD, e nao `ALTER CONSTRAINT`
--
-- Postgres nao tem `ALTER TABLE ... ALTER CONSTRAINT` para `CHECK`. **SEM `NOT
-- VALID`**: a restricao nova e mais FROUXA que a antiga, entao toda linha que
-- passava continua passando e a validacao nao tem o que varrer.
--
-- ## O QUE ESTA MIGRACAO CUSTA NO CONTRATO
--
-- `ProfessionalKind` sai em RESPOSTA, entao acrescentar valor a ele quebra
-- compatibilidade (`oasdiff`, `response-property-enum-value-added`), e
-- `ProfessionalKinds.maxItems` subindo de 8 para 10 quebra tambem
-- (`response-property-max-items-increased`). A contagem medida para ESTA arvore
-- esta na dispensa datada em `.github/quality-gates.yml`, e NAO e a de ontem.
--
-- O APK em campo nao quebra, e o caminho ja existia:
-- `AtividadeDoDiretorio.porCodigo` devolve nulo para valor que a versao nao
-- conhece e `glifoDoInscrito` tem a reserva (`domain_outlined`).
--
-- ## SOBRE O `down`, e aqui e sutil
--
-- Ele e o inverso da subida em TRES passos, nesta ordem:
--
-- 1. **`daycare` PARA A DESCIDA COM ERRO.** Ele nao tem para onde voltar: nao
--    existia antes desta migracao, e nenhum valor antigo significa "creche".
--    Inventar um mapeamento seria a migracao decidindo produto. Ela nomeia
--    quantas linhas e quais `slug` tem `daycare` e para.
-- 2. **`boarding` volta a `sitter`**, pelo mesmo `array_replace`.
-- 3. **so entao os `CHECK` encolhem**, porque ate o passo 2 o valor novo ainda
--    esta na coluna.
--
-- **A DESCIDA SO E FIEL SE NADA NOVO FOI GRAVADO**, e isto precisa estar dito:
-- uma entrada cadastrada DEPOIS da subida como `boarding` -- que nunca foi
-- `sitter` -- volta a `sitter` errada. A descida nao tem como distinguir as 27
-- originais de uma gravacao nova, porque o `UPDATE` da subida nao deixa marca na
-- linha (deixa em `audit.events`, que a descida nao le: ler trilha para decidir
-- escrita faria a trilha deixar de ser so registro). E o mesmo limite que a
-- `20261028000001` declara.
--
-- E a descida tambem para com erro se alguma linha tiver `boarding` **e**
-- `sitter` juntos -- estado que a subida nao produz, mas que uma edicao pelo
-- painel depois dela produziria: `array_replace` ali geraria `{sitter,sitter}`,
-- e elemento repetido e justamente o que `atividadesDoCorpo` recusa com
-- `duplicate_kind` na escrita.

-- ## O QUE FOI MEDIDO, e contra o que
--
-- Postgres 16 (`postgis/postgis:16-3.4`, o digest do `compose.yaml`) em
-- instancia ISOLADA -- porta 55433, nunca a pilha compartilhada --, com a massa
-- de `infra/migracao/massa/20261029000002_*.sql` semeada: tres linhas com
-- `sitter` nas tres formas (`{sitter}`, `{sitter,vet}`, `{vet,sitter}`), uma
-- linha de controle sem `sitter` (`{groomer,clinic}`) e uma indicacao pendente
-- com `kind = 'sitter'`.
--
-- SUBIDA: `sitter` 3 -> 0, `boarding` 0 -> 3, `vet` 2 e `groomer`/`clinic`
-- inalterados, total de elementos 7 antes e 7 depois. `{sitter,vet}` ->
-- `{boarding,vet}` e `{vet,sitter}` -> `{vet,boarding}` -- posicao preservada
-- nos dois. A indicacao continuou `sitter`.
--
-- DESCIDA, quatro cenarios: com `daycare` gravado REPROVA nomeando as linhas;
-- com `boarding` e `sitter` juntos REPROVA; limpa, CONCLUI e devolve as tres a
-- `sitter` com as formas intactas; e com `boarding` gravado numa entrada o
-- `ADD CONSTRAINT` do encolhimento reprova com 23514 quando o passo 2 nao o
-- tirou.
--
-- AS ISCAS, provadas NOS DOIS SENTIDOS (cada uma sabotando o codigo e
-- conferindo a reprovacao):
--
--   - `SET kinds = ARRAY['boarding']` (apaga a outra atividade): o controle de
--     contagem DESTA migracao reprova a subida (7 antes, 5 depois);
--   - `ARRAY['boarding'] || array_remove(kinds,'sitter')` (perde a POSICAO): a
--     assercao do `.depois.sql` reprova nomeando `{boarding,vet}` no lugar de
--     `{vet,boarding}`;
--   - `WHERE kinds IS NOT NULL` (sem o recorte de `sitter`): o controle desta
--     migracao reprova a subida, e o `.depois.sql` tambem;
--   - `UPDATE directory_suggestions SET kind='boarding'` (fila de carona): o
--     `.depois.sql` reprova;
--   - o evento da trilha com outro nome de acao: o `.depois.sql` reprova.
--
-- **A DESCIDA NAO APAGA O EVENTO DA TRILHA**, e isso e desenho e nao
-- esquecimento: trilha e append-only, e uma descida que a limpasse apagaria o
-- registro de que a subida aconteceu. Consequencia medida: subir e descer em
-- sequencia acumula um evento por subida -- e e por isso que a assercao do
-- `.depois.sql` conta `>= 1` e confere o evento MAIS RECENTE.

-- Up Migration

-- 1. A LISTA FECHADA de `professionals.kinds`: os oito de 28/10 + `boarding` e
--    `daycare`. `<@` ("contida em") e nao `= ANY`: a pergunta e sobre a lista
--    INTEIRA. Lista vazia satisfaz `<@`, e quem a proibe e o `tamanho`.
ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_conhecidas;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_conhecidas
    CHECK (kinds <@ ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic',
                          'store', 'hospital', 'boarding', 'daycare']::text[]);

-- 2. O TETO: 1..10, o novo tamanho da lista fechada. `cardinality` e nao
--    `array_length`, e a diferenca e a lista vazia --
--    `array_length(ARRAY[]::text[], 1)` devolve NULL, `CHECK` que resulta NULL
--    conta como SATISFEITO, e com `array_length` a lista vazia GRAVARIA. Medido
--    contra Postgres pela isca da `20261020000015`.
--
--    Faixa NUMERICA, sem literal de texto, para continuar FORA do registro de
--    `conjunto-exato-dos-checks.test.ts`.
ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_tamanho;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_tamanho
    CHECK (cardinality(kinds) BETWEEN 1 AND 10);

-- 3. A FILA DE INDICACAO. `= ANY` e nao `<@` porque aqui a coluna e UM valor
--    (`kind text`): a indicacao da comunidade sugere uma atividade.
ALTER TABLE directory_suggestions
  DROP CONSTRAINT directory_suggestions_atividade_conhecida;

ALTER TABLE directory_suggestions
  ADD CONSTRAINT directory_suggestions_atividade_conhecida
    CHECK (kind = ANY (ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic',
                             'store', 'hospital', 'boarding', 'daycare']::text[]));

COMMENT ON CONSTRAINT professionals_atividades_conhecidas ON professionals IS
  'A LISTA FECHADA das atividades, DEZ valores desde 29/10/2026 (decisao do cliente: boarding e daycare, "nao e um ou outro, sao todos .. hospedagem, pet sitter, sao coisas diferentes" e "acrescentar Creche junto"). `sitter` significa PET SITTER e sempre significou: o rotulo "Hospedagem" que ele carregava desde o primeiro commit da listagem divergia do valor, foi corrigido para "Pet Sitter" em 28/10/2026, e `boarding` entrou em 29/10 para cobrir o que o rotulo errado vinha representando -- as 27 linhas de homologacao com kinds = {sitter} foram cadastradas como hospedagem e NAO foram reclassificadas por esta migracao, porque mexer em dado e decisao de produto. `<@` (contido em) e nao `= ANY`: a pergunta e sobre a lista inteira, e lista vazia satisfaz `<@` -- quem proibe a vazia e professionals_atividades_tamanho. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts. NAO HA VALOR PARA ONG: ONG e tipo de ENTIDADE (professionals.entity_kind) e nao atividade. E store NAO e a secao Loja do produto (store_items): aqui e um estabelecimento que vende aparecendo em Perto.';

COMMENT ON CONSTRAINT professionals_atividades_tamanho ON professionals IS
  'De 1 a 10 desde 29/10/2026, e o teto e o TAMANHO DA LISTA FECHADA de proposito: teto maior seria ficticio, porque nao ha decimo primeiro valor para um decimo primeiro item carregar. CARDINALITY e nao array_length: array_length(ARRAY[]::text[], 1) devolve NULL, CHECK que resulta NULL conta como SATISFEITO, e com array_length a lista vazia GRAVAVA (medido contra Postgres pela isca da 20261020000015). Faixa NUMERICA, sem literal de texto, para ficar fora do registro de conjunto-exato-dos-checks.test.ts. Minimo 1: a atividade e o que a entrada faz, e a coluna sempre foi NOT NULL.';

COMMENT ON CONSTRAINT directory_suggestions_atividade_conhecida ON directory_suggestions IS
  'A MESMA lista fechada de professionals_atividades_conhecidas, DEZ valores desde 29/10/2026. Ela cresce JUNTO e nao por zelo: o contrato tem um unico ProfessionalKind, usado tambem no kind de POST /v1/directory/suggestions, e alargar so professionals deixaria o contrato prometendo boarding numa rota cujo CHECK o recusa -- com 500 do banco em vez do 400 de campo invalido. O FLUXO da fila nao muda: indicacao continua nascendo pendente e passando por aprovacao.';

-- ---------------------------------------------------------------------------
-- 4. A RECLASSIFICACAO: `sitter` -> `boarding` (cliente, 29/10/2026)
-- ---------------------------------------------------------------------------
--
-- *"passa as 27 para boarding"*. Depois dos `CHECK`, nunca antes: o `CHECK`
-- antigo recusaria o valor que este bloco grava.
--
-- `array_replace` e nao `SET kinds = ARRAY[...]`: troca o ELEMENTO na posicao em
-- que ele esta e preserva o resto. Ver o cabecalho para a posicao e para a
-- impossibilidade de elemento repetido.
DO $$
DECLARE
  entradas_com_sitter   bigint;
  elementos_antes       bigint;
  elementos_depois      bigint;
  movidas               bigint;
  sitter_depois         bigint;
  boarding_depois       bigint;
BEGIN
  SELECT count(*) FILTER (WHERE 'sitter' = ANY (kinds)),
         coalesce(sum(cardinality(kinds)), 0)
    INTO entradas_com_sitter, elementos_antes
    FROM professionals;

  UPDATE professionals
     SET kinds = array_replace(kinds, 'sitter', 'boarding'),
         -- `updated_at` acompanha porque a linha MUDOU, e o painel ordena por
         -- ele. `version` NAO e incrementada de proposito: ela e o `ETag` do
         -- painel, e incrementa-la aqui derrubaria com 412 toda tela aberta no
         -- navegador de quem estiver cadastrando no momento da subida -- uma
         -- migracao nao deve invalidar a leitura de ninguem.
         updated_at = now()
   WHERE 'sitter' = ANY (kinds);

  GET DIAGNOSTICS movidas = ROW_COUNT;

  SELECT coalesce(sum(cardinality(kinds)), 0),
         count(*) FILTER (WHERE 'sitter' = ANY (kinds)),
         count(*) FILTER (WHERE 'boarding' = ANY (kinds))
    INTO elementos_depois, sitter_depois, boarding_depois
    FROM professionals;

  -- O CONTROLE: nenhum array encolheu nem cresceu. E a diferenca entre "o
  -- UPDATE rodou" e "o UPDATE fez a coisa certa" -- `SET kinds =
  -- ARRAY['boarding']` passaria pelo ROW_COUNT e reprovaria aqui.
  IF elementos_depois <> elementos_antes THEN
    RAISE EXCEPTION
      'a reclassificacao mudou a quantidade total de atividades: % antes, % depois. Nenhum array deveria ter encolhido nem crescido -- array_replace preserva posicao e tamanho, entao isto e defeito do UPDATE e nao do dado',
      elementos_antes, elementos_depois;
  END IF;

  -- E `sitter` tem de ter chegado a ZERO: toda linha que o tinha foi movida.
  IF sitter_depois <> 0 THEN
    RAISE EXCEPTION
      'sobraram % entrada(s) com sitter depois da reclassificacao, e deveriam ser zero',
      sitter_depois;
  END IF;

  -- `movidas` e `entradas_com_sitter` tem de coincidir; divergir significa que
  -- o `WHERE` do `UPDATE` nao e o mesmo conjunto que a contagem mediu.
  IF movidas <> entradas_com_sitter THEN
    RAISE EXCEPTION
      'o UPDATE tocou % linha(s) e a contagem previa achou %: o WHERE nao casa com a medicao',
      movidas, entradas_com_sitter;
  END IF;

  -- A CONTAGEM FICA EM `audit.events`, e nao num `RAISE NOTICE`:
  -- `node-pg-migrate` descarta `NOTICE` e `WARNING`, e um aviso que ninguem le
  -- e o mesmo que nao registrar. `resource_id` nulo porque o evento e do LOTE e
  -- nao de uma entrada; os `slug` nao entram, porque a contagem e o que
  -- interessa auditar e uma lista de 27 enderecos publicos na trilha seria
  -- dado a mais sem pergunta que o justifique.
  INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, before, after, metadata)
  VALUES (
    gen_random_uuid(),
    'system',
    'directory_entry_kind_reclassificado',
    'directory_entry',
    NULL,
    jsonb_build_object('kind', 'sitter', 'entradas', entradas_com_sitter),
    jsonb_build_object('kind', 'boarding', 'entradas', boarding_depois),
    jsonb_build_object(
      'migracao', '20261029000002_hospedagem-creche-e-a-indicacao-completa',
      'decisao', 'cliente 29/10/2026: passa as 27 para boarding',
      'motivo', 'o rotulo de sitter era "Hospedagem" desde o primeiro commit da listagem de Perto e divergia do valor; estas entradas foram cadastradas por quem leu Hospedagem na tela, entao o que elas significam e hospedagem',
      'elementos_antes', elementos_antes,
      'elementos_depois', elementos_depois,
      'fila_de_indicacao_nao_reclassificada', true)
  );
END $$;

-- Down Migration

-- A DESCIDA VOLTA AOS OITO, e ela pode FALHAR de proposito.
--
-- Se alguma linha ja gravou `boarding` ou `daycare`, o `ADD CONSTRAINT` recusa
-- com 23514 e a descida para com erro em vez de apagar dado. **E o desfecho
-- certo**, e e o mesmo da `20261028000001`: o contrario seria `DELETE`
-- silencioso de entradas reais, ou um `CHECK NOT VALID` que mente sobre o que a
-- coluna contem. Quem precisa descer com dado novo gravado decide primeiro o que
-- fazer com ELE -- reclassificar, ou remover a entrada --, e isso e decisao de
-- produto.
--
-- O teto volta a 8 antes do vocabulario por simetria com a subida; entre os dois
-- nenhuma linha e escrita, porque migracao e transacao.
-- PASSO 1: `daycare` nao tem para onde voltar, e a descida PARA. Ver o
-- cabecalho: inventar mapeamento seria a migracao decidindo produto.
--
-- PASSO 1b: `boarding` junto com `sitter` na mesma linha tambem para -- estado
-- que a subida nao produz, mas que uma edicao posterior pelo painel produziria,
-- e em que `array_replace` geraria `{sitter,sitter}`.
DO $$
DECLARE
  com_daycare   bigint;
  slugs_daycare text;
  com_os_dois   bigint;
BEGIN
  SELECT count(*), coalesce(string_agg(slug, ', ' ORDER BY slug), '(sem slug)')
    INTO com_daycare, slugs_daycare
    FROM professionals
   WHERE 'daycare' = ANY (kinds);

  IF com_daycare > 0 THEN
    RAISE EXCEPTION
      'a descida nao tem para onde devolver `daycare`: % entrada(s) o gravaram (%), e nenhum valor antigo significa creche. Reclassificar e decisao de produto, nao de migracao -- decida o que fazer com elas ANTES de descer',
      com_daycare, slugs_daycare;
  END IF;

  SELECT count(*) INTO com_os_dois
    FROM professionals
   WHERE 'boarding' = ANY (kinds) AND 'sitter' = ANY (kinds);

  IF com_os_dois > 0 THEN
    RAISE EXCEPTION
      'a descida produziria atividade repetida em % entrada(s), que tem boarding E sitter ao mesmo tempo: array_replace deixaria {sitter,sitter}, e elemento repetido e o que a escrita recusa com duplicate_kind',
      com_os_dois;
  END IF;
END $$;

-- A indicacao nao teve dado reescrito na subida, entao nao tem o que devolver
-- aqui: `kind = 'daycare'` ou `'boarding'` numa indicacao e gravacao NOVA, e o
-- `ADD CONSTRAINT` abaixo a recusa com 23514 -- que e o desfecho certo, pelo
-- mesmo motivo do bloco acima.
--
-- PASSO 2: `boarding` volta a `sitter`, ANTES de os `CHECK` encolherem.
UPDATE professionals
   SET kinds = array_replace(kinds, 'boarding', 'sitter'),
       updated_at = now()
 WHERE 'boarding' = ANY (kinds);

-- PASSO 3: os `CHECK` encolhem.
ALTER TABLE directory_suggestions
  DROP CONSTRAINT directory_suggestions_atividade_conhecida;

ALTER TABLE directory_suggestions
  ADD CONSTRAINT directory_suggestions_atividade_conhecida
    CHECK (kind = ANY (ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic',
                             'store', 'hospital']::text[]));

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_tamanho;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_tamanho
    CHECK (cardinality(kinds) BETWEEN 1 AND 8);

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_conhecidas;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_conhecidas
    CHECK (kinds <@ ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic',
                          'store', 'hospital']::text[]);

-- Os comentarios voltam ao texto da `20261028000001`: descida que restaura a
-- restricao e deixa o comentario falando de dez valores produz um catalogo que
-- descreve o que nao esta mais la -- e e o catalogo que a proxima pessoa le.
COMMENT ON CONSTRAINT professionals_atividades_conhecidas ON professionals IS
  'A LISTA FECHADA das atividades, OITO valores desde 28/10/2026 (decisao do cliente: store e hospital). `<@` (contido em) e nao `= ANY`: a pergunta e sobre a lista inteira, e lista vazia satisfaz `<@` -- quem proibe a vazia e professionals_atividades_tamanho. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts. NAO HA VALOR PARA ONG, e a ausencia e desenho: ONG e tipo de ENTIDADE (professionals.entity_kind, 20261018000012) e nao atividade -- uma ONG tem as duas coisas. E store NAO e a secao Loja do produto (store_items): aqui e um estabelecimento que vende aparecendo em Perto.';

COMMENT ON CONSTRAINT professionals_atividades_tamanho ON professionals IS
  'De 1 a 8 desde 28/10/2026, e o teto e o TAMANHO DA LISTA FECHADA de proposito: teto maior seria ficticio, porque nao ha nono valor para um nono item carregar. CARDINALITY e nao array_length: array_length(ARRAY[]::text[], 1) devolve NULL, CHECK que resulta NULL conta como SATISFEITO, e com array_length a lista vazia GRAVAVA (medido contra Postgres pela isca da 20261020000015). Faixa NUMERICA, sem literal de texto, para ficar fora do registro de conjunto-exato-dos-checks.test.ts. Minimo 1: a atividade e o que a entrada faz, e a coluna sempre foi NOT NULL.';

COMMENT ON CONSTRAINT directory_suggestions_atividade_conhecida ON directory_suggestions IS
  'A MESMA lista fechada de professionals_atividades_conhecidas, OITO valores desde 28/10/2026. Ela cresce JUNTO e nao por zelo: o contrato tem um unico ProfessionalKind, usado tambem no kind de POST /v1/directory/suggestions, e alargar so professionals deixaria o contrato prometendo store numa rota cujo CHECK o recusa -- com 500 do banco em vez do 400 de campo invalido. O FLUXO da fila nao muda: indicacao continua nascendo pendente e passando por aprovacao.';
