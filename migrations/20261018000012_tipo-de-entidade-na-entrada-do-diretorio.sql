-- O TIPO DE ENTIDADE da entrada do diretorio: ONG passa a caber, por EIXO
-- PROPRIO, e a ATIVIDADE (`kind`) nao e tocada.
--
-- ====================================================================
-- POR QUE ESTA MIGRACAO EXISTE
-- ====================================================================
--
-- Pedido do cliente de 18/10/2026: ONG como tipo no diretorio. O caminho
-- obvio era acrescentar `organization` ao `CHECK` de `professionals.kind`.
-- ESSE CAMINHO FOI MEDIDO E RECUSADO, por duas razoes independentes.
--
-- 1. `oasdiff` REPROVOU, e a reprovacao foi colada e nao suposta. `kind` sai
--    em RESPOSTA como `enum`, e acrescentar valor a `enum` de resposta e
--    quebra: regra `response-property-enum-value-added`, **12 erros**, `level`
--    3 (ERR), em `listDirectoryEntries`, `getDirectoryEntry`,
--    `listMyDirectorySuggestions` e nove operacoes de `/admin/directory/*`.
--    Veredito literal de um deles:
--
--      "added the new `organization` enum value to the `items/items/kind`
--       response property for the response status `200`"
--
--    O proprio `oasdiff` comenta: "The server may now return a value the
--    previous contract excluded, so a client written against it may not handle
--    the response."
--
--    Sair disso por DISPENSA datada era possivel e foi recusado pelo cliente
--    em favor da razao 2. A `20261018000004`, do mesmo dia, resolveu o caso
--    gemeo (o eixo da ENTREGA da plaquinha) pela mesma escolha, e a prosa dela
--    registra os mesmos "quatro erros medidos".
--
-- 2. **E a razao que manda: uma ONG nao e uma ATIVIDADE.** Poe-la em `kind`
--    afirmaria que organizacao e um tipo de profissional -- que era
--    exatamente a pergunta aberta. O repositorio ja tinha escrito isso em
--    DOIS lugares, antes de qualquer pedido:
--
--    - `ProfessionalKind` no contrato: "a ausencia e decisao pendente do
--      modelo, nao esquecimento: `professionals` nao tem `entity_kind`";
--    - `conjunto-exato-dos-checks.test.ts`, no conjunto da indicacao: "nao ha
--      valor para ONG aqui pelo mesmo motivo de la -- `professionals` nao tem
--      `entity_kind`, e acrescentar um decidiria por conta propria que uma ONG
--      e um tipo de profissional, que e justamente a pergunta aberta".
--
--    Os dois textos nomeiam a coluna que faltava. Esta migracao cria ELA, e
--    nao alarga a lista. Uma ONG tem atividade (`clinic`, `vet`) **e** tipo de
--    entidade (`organization`): sao dois eixos ao mesmo tempo, e e por isso que
--    um campo so nao os expressava.
--
-- ====================================================================
-- O VOCABULARIO NAO E NOVO, E ISSO E O PONTO
-- ====================================================================
--
-- `entity_verifications.entity_kind` ja existe desde a `20260921000002` com
-- `CHECK (entity_kind IN ('professional', 'organization'))` -- os dois valores,
-- este nome de coluna, e `organization` entre eles desde antes de existir uma
-- linha no banco. Nao foi previsao: a revisao de 17/09 do ADR-0011 generalizou
-- `professional_claims` para `entity_verifications` justamente para que a
-- primeira entidade nao-profissional nao obrigasse a refazer tabela.
--
-- Entao aqui nao se inventa vocabulario: MESMO NOME DE COLUNA, MESMOS DOIS
-- VALORES, mesma ordem. Uma segunda convencao para o mesmo conceito e a
-- convencao que diverge, e o diretorio passaria a ter `organization` num lugar
-- e `ong` ou `nonprofit` no outro.
--
-- ====================================================================
-- ADITIVO, COM PADRAO: NENHUMA LINHA E REESCRITA
-- ====================================================================
--
-- `NOT NULL DEFAULT 'professional'`. Toda entrada que existe hoje passa a
-- valer como `professional`, que e o que ela sempre foi -- o `DEFAULT`
-- preenche, nenhum `UPDATE` de dado do cliente acontece, e nenhuma entrada
-- muda de sentido.
--
-- `NOT NULL` e nao anulavel de proposito: "nenhum tipo de entidade" nao e
-- estado que esta tabela deva guardar. Toda entrada e uma coisa ou a outra, e
-- nulo aqui so criaria um terceiro estado que nenhuma tela saberia desenhar --
-- o mesmo motivo pelo qual a `20261018000004` pos `NOT NULL DEFAULT` no eixo
-- da entrega em vez de deixar o passo inferido de um nulo.
--
-- CHECK e nao `enum`, pelo motivo 3 do cabecalho da `20260921000002`: a lista
-- pode crescer (abrigo, protetor independente, orgao publico), e crescer nao
-- pode custar DDL. O nome da restricao e deixado para o Postgres gerar
-- (`professionals_entity_kind_check`), que e a forma de `professionals_kind_check`
-- e de `entity_verifications_entity_kind_check` -- o teste de conjunto exato
-- cobra o nome gerado.
--
-- ====================================================================
-- O QUE ESTA MIGRACAO NAO FAZ
-- ====================================================================
--
-- **Nao constroi adocao.** ONG aqui e tipo de ESTABELECIMENTO. Pet em adocao
-- e outro assunto, nao tem rota no contrato, e nao ganhou nenhuma.
--
-- **Nao mexe em `directory_suggestions`.** A indicacao da comunidade tem
-- `CHECK` proprio (`directory_suggestions_atividade_conhecida`) e fluxo de
-- outro ramo. Quem indica hoje nao escolhe tipo de entidade, e o administrador
-- define no aceite -- que e onde a curadoria mora.
--
-- **Nao toca `professionals.kind`.** Nenhum valor acrescentado, nenhum
-- removido, nenhuma linha reescrita.

-- Up Migration

ALTER TABLE professionals
  ADD COLUMN entity_kind text NOT NULL DEFAULT 'professional'
                              CHECK (entity_kind IN ('professional',
                                                     'organization'));

COMMENT ON COLUMN professionals.entity_kind IS
  'O QUE a entrada E, e nao o que ela faz: eixo SEPARADO de `kind`, que e a ATIVIDADE. ONG e `organization` com a atividade que ela exerce (`clinic`, `vet`) -- os dois eixos ao mesmo tempo. Nome e valores COPIADOS de `entity_verifications.entity_kind` (20260921000002), que ja tinha `organization` desde antes de existir linha; segunda convencao para o mesmo conceito e a convencao que diverge. Nao entrou em `kind` por duas razoes: acrescentar valor a `enum` de RESPOSTA quebra o contrato (`oasdiff`, response-property-enum-value-added, 12 erros medidos em 18/10) e, sobretudo, porque afirmaria que organizacao e um tipo de profissional -- a pergunta que `ProfessionalKind` e `conjunto-exato-dos-checks.test.ts` registravam como aberta, os dois nomeando ESTA coluna como a que faltava. NOT NULL DEFAULT professional: aditivo, nenhuma linha reescrita.';

-- O indice espelha `professionals_publicados_por_atividade` da
-- `20260921000002`: o filtro novo do `Perto` e por tipo de entidade, e sem
-- indice parcial ele varre a tabela inteira para achar as ONGs publicadas.
-- Parcial em `status = 'published'` pelo mesmo motivo do de la -- a listagem
-- publica nunca pergunta por entrada que nao esta no ar.
CREATE INDEX professionals_publicados_por_tipo_de_entidade
  ON professionals (entity_kind, created_at DESC)
  WHERE status = 'published';

-- Down Migration

DROP INDEX professionals_publicados_por_tipo_de_entidade;

-- Sem `UPDATE` de volta: a coluna sai inteira, e com ela o `CHECK` e o
-- `DEFAULT`. `kind` nunca foi tocado, entao nao ha o que restaurar nele.
ALTER TABLE professionals DROP COLUMN entity_kind;
