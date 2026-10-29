-- LOJA E HOSPITAL COMO ATIVIDADES DO DIRETORIO (decisao do cliente de
-- 28/10/2026): *"precisamos adicionar outros tipos de atividade no parceiro"*.
--
-- ## SAO DOIS VALORES, E NAO TRES -- O CLIENTE SE CORRIGIU NA MESMA DATA
--
-- O pedido original trazia quatro nomes: "Profissional autonomo, Loja, Pet
-- Sitter, Hospital". Dos quatro, **so dois sao valor novo**:
--
--   - `sitter` JA EXISTIA desde a `20260921000002`. "Pet Sitter" e o ROTULO
--     dele na tela a partir de 28/10 (antes, "Hospedagem"), e rotulo nao chega
--     ao banco;
--   - **"Profissional autonomo" NAO entra aqui**, e isso e correcao do proprio
--     cliente, verbatim: *"na verdade, nao inclua profissional autonomo como
--     atividade, ja esta no tipo"*. Ele pertence ao OUTRO eixo,
--     `professionals.entity_kind` (`20261018000012`), que responde O QUE A
--     ENTRADA E -- e cujo rotulo no painel passou a ser "Profissional ou
--     estabelecimento".
--
-- Ficam `store` e `hospital`. Os dois sao ATIVIDADE no sentido estrito desta
-- coluna: o que se contrata da entrada, o que ela FAZ.
--
-- ## OS DOIS EIXOS CONTINUAM SEPARADOS, e esta migracao nao os mistura
--
-- `kinds` = o que a entrada FAZ. `entity_kind` = o que ela E. Uma ONG que
-- atende como hospital tem `kinds = {hospital}` e `entity_kind =
-- 'organization'`: as duas coisas ao mesmo tempo. **Nada de ONG entra nesta
-- lista**, pelo motivo que a `20261018000012` fixou -- po-la aqui afirmaria que
-- organizacao e um tipo de profissional.
--
-- E `store` NAO e a `Loja` do produto. A secao `Loja` e catalogo de
-- PRODUTO (`store_items`, `20260922000023`), de outro dono e outro fluxo.
-- Aqui `store` e "um estabelecimento que vende" aparecendo em `Perto` -- um
-- petshop. A coincidencia de nome e so de palavra, e fica dita para quem
-- procurar a ligacao e nao achar nenhuma: ela nao existe.
--
-- ## POR QUE `hospital` ALEM DE `clinic`
--
-- Porque o cliente os separa, e a separacao existe no mundo: clinica atende
-- hora marcada e fecha; hospital veterinario interna e tem plantao. Quem
-- procura atendimento as 3 da manha precisa distinguir os dois, e com um valor
-- so a distincao ficaria no nome do estabelecimento -- isto e, em texto livre,
-- onde nenhum filtro alcanca.
--
-- ## O QUE ESTA MIGRACAO CUSTA NO CONTRATO, dito aqui porque e o preco real
--
-- `ProfessionalKind` sai em RESPOSTA, entao acrescentar valor a ele quebra
-- compatibilidade: `oasdiff`, regra `response-property-enum-value-added`.
-- **MEDIDO em 28/10/2026 para ESTES dois valores**, com
-- `tufin/oasdiff:v1.32.1` contra o `development` em `6b60db94`:
-- **26 erros e 16 avisos (42 mudancas), em 12 operacoes**. O registro anterior
-- do repositorio dizia "12 erros medidos em 18/10" -- aquele numero era de UM
-- valor hipotetico e de um contrato que desde entao ganhou
-- `GET /public/directory-entries` e o `rating` do #92. A dispensa datada em
-- `.github/quality-gates.yml` carrega a contagem nova, nao a velha.
--
-- O APK em campo NAO quebra, e o caminho ja existia: `porCodigo` do
-- `AtividadeDoDiretorio` devolve nulo para valor que a versao nao conhece, e
-- `glifoDoInscrito` tem a reserva (`domain_outlined`). Uma entrada `store`
-- aparece no app com o icone de reserva e **sem nome de atividade** ate o
-- aplicativo ganhar os dois valores -- o que e esperado e nao defeito, mas e
-- lacuna de produto e esta anotada como tal no relato deste lote.
--
-- ## AS TRES RESTRICOES QUE MUDAM, e por que a terceira tambem
--
--   1. `professionals_atividades_conhecidas`: a lista fechada, 6 -> 8 valores;
--   2. `professionals_atividades_tamanho`: o teto, 1..6 -> 1..8. **Ele nao e
--      cosmetico.** O teto era o tamanho da lista fechada de proposito ("teto
--      maior seria ficticio", diz a `20261020000015`); deixa-lo em 6 com 8
--      valores disponiveis recusaria uma entrada que legitimamente faz as oito
--      coisas, e a recusa viria do teto, nao do vocabulario;
--   3. `directory_suggestions_atividade_conhecida`: a MESMA lista, na fila de
--      indicacao da comunidade (`20261017000004`).
--
-- A terceira e a que mais vale explicar. O contrato tem UM `ProfessionalKind`,
-- e ele e o schema de `kind` tambem em `POST /v1/directory/suggestions` e nas
-- leituras de `/directory/suggestions` -- as 12 operacoes que o `oasdiff`
-- nomeia incluem as da indicacao. **Alargar so `professionals` deixaria o
-- contrato prometendo `store` numa rota cujo `CHECK` o recusa**, e a recusa
-- viria do banco: `500`, e nao o `400` de campo invalido. Um contrato que
-- promete o que a coluna nega e pior que os dois valores nao existirem.
--
-- Isto **nao muda o FLUXO da fila de indicacao**, que o cliente mandou nao
-- mexer: ela continua nascendo pendente e passando por aprovacao. O que muda e
-- so o VOCABULARIO que ela aceita, e so para nao divergir do contrato unico.
--
-- ## A FORMA: DROP e ADD, e nao `ALTER CONSTRAINT`
--
-- Postgres nao tem `ALTER TABLE ... ALTER CONSTRAINT` para `CHECK` -- so para
-- chave estrangeira. Trocar a lista e necessariamente derrubar e recriar.
--
-- **SEM `NOT VALID`**: a restricao nova e mais FROUXA que a antiga (dois
-- valores a mais, teto maior), entao toda linha que passava continua passando e
-- a validacao nao tem o que varrer. `NOT VALID` aqui pouparia zero e deixaria
-- uma restricao nao validada no catalogo, que e divida sem troco.
--
-- A ORDEM importa num ponto: o `tamanho` e derrubado e recriado junto, e nao
-- antes nem depois em outra migracao, porque entre os dois estados nenhuma
-- linha e escrita (migracao e transacao) e separar daria uma janela em que o
-- vocabulario aceita oito e o teto recusa a setima.

-- Up Migration

-- 1. A LISTA FECHADA de `professionals.kinds`: os seis de antes + `store` e
--    `hospital`. `<@` ("contida em") e nao `= ANY`, como na `20261020000015`:
--    a pergunta e sobre a lista INTEIRA. Lista vazia satisfaz `<@`, e quem a
--    proibe e o `tamanho`, logo abaixo.
ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_conhecidas;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_conhecidas
    CHECK (kinds <@ ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic', 'store', 'hospital']::text[]);

-- 2. O TETO: 1..8, o novo tamanho da lista fechada. `cardinality` e nao
--    `array_length`, e a diferenca e a lista vazia --
--    `array_length(ARRAY[]::text[], 1)` devolve NULL, `CHECK` que resulta NULL
--    conta como SATISFEITO, e com `array_length` a lista vazia GRAVARIA. Isso
--    foi medido contra Postgres pela isca da `20261020000015`; a forma e
--    copiada dela de proposito.
--
--    Faixa NUMERICA, sem literal de texto, para continuar FORA do registro de
--    `conjunto-exato-dos-checks.test.ts` (a regra do cabecalho daquele
--    arquivo).
ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_tamanho;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_tamanho
    CHECK (cardinality(kinds) BETWEEN 1 AND 8);

-- 3. A FILA DE INDICACAO. `= ANY` e nao `<@` porque aqui a coluna e UM valor
--    (`kind text`), e nao uma lista: a indicacao da comunidade sugere uma
--    atividade. A forma da restricao e preservada; so a lista cresce.
ALTER TABLE directory_suggestions
  DROP CONSTRAINT directory_suggestions_atividade_conhecida;

ALTER TABLE directory_suggestions
  ADD CONSTRAINT directory_suggestions_atividade_conhecida
    CHECK (kind = ANY (ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic', 'store', 'hospital']::text[]));

COMMENT ON CONSTRAINT professionals_atividades_conhecidas ON professionals IS
  'A LISTA FECHADA das atividades, OITO valores desde 28/10/2026 (decisao do cliente: store e hospital). `<@` (contido em) e nao `= ANY`: a pergunta e sobre a lista inteira, e lista vazia satisfaz `<@` -- quem proibe a vazia e professionals_atividades_tamanho. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts. NAO HA VALOR PARA ONG, e a ausencia e desenho: ONG e tipo de ENTIDADE (professionals.entity_kind, 20261018000012) e nao atividade -- uma ONG tem as duas coisas. E store NAO e a secao Loja do produto (store_items): aqui e um estabelecimento que vende aparecendo em Perto.';

COMMENT ON CONSTRAINT professionals_atividades_tamanho ON professionals IS
  'De 1 a 8 desde 28/10/2026, e o teto e o TAMANHO DA LISTA FECHADA de proposito: teto maior seria ficticio, porque nao ha nono valor para um nono item carregar. CARDINALITY e nao array_length: array_length(ARRAY[]::text[], 1) devolve NULL, CHECK que resulta NULL conta como SATISFEITO, e com array_length a lista vazia GRAVAVA (medido contra Postgres pela isca da 20261020000015). Faixa NUMERICA, sem literal de texto, para ficar fora do registro de conjunto-exato-dos-checks.test.ts. Minimo 1: a atividade e o que a entrada faz, e a coluna sempre foi NOT NULL.';

COMMENT ON CONSTRAINT directory_suggestions_atividade_conhecida ON directory_suggestions IS
  'A MESMA lista fechada de professionals_atividades_conhecidas, OITO valores desde 28/10/2026. Ela cresce JUNTO e nao por zelo: o contrato tem um unico ProfessionalKind, usado tambem no kind de POST /v1/directory/suggestions, e alargar so professionals deixaria o contrato prometendo store numa rota cujo CHECK o recusa -- com 500 do banco em vez do 400 de campo invalido. O FLUXO da fila nao muda: indicacao continua nascendo pendente e passando por aprovacao.';

-- Down Migration

-- A DESCIDA VOLTA AOS SEIS, e ela pode FALHAR de proposito.
--
-- Se alguma linha ja gravou `store` ou `hospital`, o `ADD CONSTRAINT` recusa e
-- a descida para com erro em vez de apagar dado. **E o desfecho certo**: o
-- contrario seria `DELETE` silencioso de entradas reais, ou um `CHECK NOT
-- VALID` que mente sobre o que a coluna contem. Quem precisa descer com dado
-- novo gravado decide primeiro o que fazer com ELE -- reclassificar para
-- `clinic`, ou remover a entrada -- e isso e decisao de produto, nao de
-- migracao.
--
-- O teto volta a 6 antes do vocabulario por simetria com a subida; entre os
-- dois nenhuma linha e escrita.
ALTER TABLE directory_suggestions
  DROP CONSTRAINT directory_suggestions_atividade_conhecida;

ALTER TABLE directory_suggestions
  ADD CONSTRAINT directory_suggestions_atividade_conhecida
    CHECK (kind = ANY (ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic']::text[]));

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_tamanho;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_tamanho
    CHECK (cardinality(kinds) BETWEEN 1 AND 6);

ALTER TABLE professionals
  DROP CONSTRAINT professionals_atividades_conhecidas;

ALTER TABLE professionals
  ADD CONSTRAINT professionals_atividades_conhecidas
    CHECK (kinds <@ ARRAY['vet', 'groomer', 'walker', 'sitter', 'trainer', 'clinic']::text[]);

COMMENT ON CONSTRAINT professionals_atividades_conhecidas ON professionals IS
  'A LISTA FECHADA das atividades, os mesmos seis de professionals_kind_check. `<@` (contido em) e nao `= ANY`: a pergunta e sobre a lista inteira, e lista vazia satisfaz `<@` -- quem proibe a vazia e professionals_atividades_tamanho. Menciona literal de texto, entao ESTA no registro de conjunto-exato-dos-checks.test.ts.';

-- Os outros dois comentarios tambem voltam ao texto da `20261020000015` e da
-- `20261017000004`: descida que restaura a restricao e deixa o comentario
-- falando de oito valores produz um catalogo que descreve o que nao esta mais
-- la, e e o catalogo que a proxima pessoa le.
COMMENT ON CONSTRAINT professionals_atividades_tamanho ON professionals IS
  'De 1 a 6. CARDINALITY e nao array_length, e a diferenca e a lista vazia: array_length(ARRAY[]::text[], 1) devolve NULL e CHECK que resulta NULL conta como SATISFEITO, entao com array_length a lista vazia GRAVAVA -- medido contra Postgres pela isca da lista vazia, que reprovou na primeira versao daquele arquivo. cardinality devolve 0 e o CHECK recusa. Faixa NUMERICA, sem literal de texto, para ficar fora do registro de conjunto-exato-dos-checks.test.ts (a regra do cabecalho daquele arquivo). Minimo 1: a atividade e o que a entrada E, e kind sempre foi NOT NULL. Teto 6: o tamanho da lista fechada.';

COMMENT ON CONSTRAINT directory_suggestions_atividade_conhecida ON directory_suggestions IS
  'A MESMA lista de professionals_kind_check: nao ha valor para ONG aqui pelo mesmo motivo de la.';
