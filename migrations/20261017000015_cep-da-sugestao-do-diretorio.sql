-- O CEP da sugestao do diretorio: **guardado para quem REVISA, nunca
-- publicado** (cliente, 18/10/2026: "pode armazenar o cep sim!").
--
-- ====================================================================
-- POR QUE ESTA COLUNA EXISTE, E POR QUE A `20261017000004` NAO A TINHA
-- ====================================================================
--
-- A `20261017000004` escreveu, na ausencia 1 do cabecalho dela, "sem `geo`,
-- sem coordenada, sem `street_address`", e nao havia campo de CEP em lugar
-- nenhum daquele caminho. O cliente pediu o campo no formulario em 18/10 ("no
-- formulario de indicacao do profissional, o campo cep nao entrou tambem") e,
-- perguntado se queria o valor GUARDADO, respondeu que sim.
--
-- **A ausencia 1 daquela migracao continua inteira.** O que ela proibe e
-- coordenada e logradouro, e nenhum dos dois entra aqui:
--
-- - **nao ha coordenada**, e o CEP nao se converte em uma. A ADR-0006 proibe
--   transformar endereco em ponto, e o app que preenche este campo le QUATRO
--   campos de texto do servico de CEP e **ignora de proposito** o
--   `location.coordinates` que a BrasilAPI devolve (ver
--   `app/lib/api/busca_de_cep.dart`, do lado da chamada). Nao existe coluna de
--   ponto nesta tabela, nem indice espacial, e nada aqui cria uma;
-- - **nao ha `street_address`**, e a assimetria e decisao e nao meio caminho.
--   O CEP aponta para um TRECHO DE RUA e tem destinatario -- o revisor, que
--   precisa achar o estabelecimento para convida-lo (ADR-0011: convite e
--   aceite). Logradouro e numero apontam para a PORTA de um terceiro que nao
--   pediu nada, e nao tem destinatario nenhum: o endereco publico da entrada
--   do diretorio continua sendo trabalho do painel.
--
-- ====================================================================
-- O QUE ESTA COLUNA NAO FAZ: ELA NAO SAI
-- ====================================================================
--
-- Guardar para quem revisa **nao e mostrar em publico**, e a regra de
-- superficie publica do diretorio continua valendo caractere a caractere: rua
-- e CEP nao aparecem no `Perto` (ADR-0010, itens 4 e 5 -- bairro e cidade sao
-- o teto de granularidade). Tres coisas sustentam isso, e nenhuma delas e boa
-- vontade:
--
-- 1. **nao existe caminho de leitura desta tabela.** A porta
--    `DirectorySuggestionRepository` tem UM metodo e ele escreve; o contrato
--    nao declara nenhuma operacao de leitura de `directory_suggestions`, nem
--    publica nem com conta. O que o `Perto` le e `professionals`, que e outra
--    tabela e nao tem esta coluna;
-- 2. **`postal_code` ja e nome proibido em resposta sem conta**, nas DUAS
--    listas que guardam isso: `src/tools/portao-contrato-publico.ts`
--    (confere o que o CONTRATO declara) e
--    `src/shared/http/vazamento-publico.ts` (confere o que a ROTA responde).
--    As duas ja o listavam antes desta migracao, pela BICHUS-92;
-- 3. **o recibo da operacao e fechado.** `DirectorySuggestionReceipt` e
--    `additionalProperties: false` com `reference`, `state` e `created_at`, e
--    nada mais -- o CEP nao volta nem para quem o digitou.
--
-- **ESTA COLUNA NAO LEVA A MARCA `NUNCA sai do servidor`**, e a ausencia da
-- marca e deliberada. O portao `portao-colunas-que-nao-saem.ts` varre o NOME
-- LITERAL da coluna marcada em todo `.ts` de `src/` e em toda resposta do
-- contrato. Marcar `postal_code` reprovaria `Me.reference_area.postal_code`,
-- que e resposta legitima da propria conta (BICHUS-92), e reprovaria o nome no
-- corpo de REQUISICAO desta operacao -- o portao nao distingue entrada de
-- saida. Seria portao reprovando o fluxo correto, que e portao que alguem
-- desliga. Quem guarda esta coluna sao as tres razoes acima.
--
-- ====================================================================
-- OITO DIGITOS, SEM HIFEN, PELO `CHECK`
-- ====================================================================
--
-- A MESMA forma de `tag_requests.postal_code` e de `TagRequestInput.
-- postal_code`: `^[0-9]{8}$`. Uma forma canonica e o que faz duas sugestoes do
-- mesmo lugar serem comparaveis -- `05435-000` e `05435000` guardados lado a
-- lado nao sao, e quem revisa nao tem como saber que sao o mesmo CEP. O hifen
-- e apresentacao, e apresentacao nao se guarda.
--
-- O `CHECK` e no banco e nao so na aplicacao de proposito: `MeUpdate.
-- reference_area.postal_code` aceita `^\d{5}-?\d{3}$` (COM hifen opcional) no
-- mesmo contrato, e um dia alguem vai copiar aquele padrao para ca. Com o
-- `CHECK`, o `INSERT` com hifen reprova em voz alta em vez de guardar duas
-- formas na mesma coluna.
--
-- **Anulavel, e `required` do contrato nao mudou.** Quem indica uma clinica de
-- outro bairro quase sempre nao sabe o CEP dela, e cobra-lo trocaria uma
-- indicacao por um campo inventado -- o mesmo juizo que deixou `neighborhood`
-- opcional na `20261017000004`.
--
-- ====================================================================
-- A FUNCAO TROCA DE FORMA, E E POR ISSO QUE ELA APARECE AQUI INTEIRA
-- ====================================================================
--
-- `directory_suggestions_registrar` existe porque o nome da coluna de AUTORIA
-- e reprovado em `src/` pelo portao de colunas que nao saem: o nome dela fica
-- na migracao, e `src/` chama a funcao pelo nome dela. Acrescentar um
-- parametro muda a ASSINATURA, e no Postgres assinatura diferente e outra
-- funcao -- `CREATE OR REPLACE` deixaria as DUAS de pe, e a de 11 argumentos
-- continuaria gravando sugestao sem CEP para sempre, pronta para alguem
-- chamar.
--
-- Entao a de 11 e derrubada e a de 12 nasce no lugar. A descida faz o inverso,
-- e e por isso que ela recria a de 11: sem isso, descer esta migracao deixaria
-- o `src/` da versao anterior sem nenhuma funcao para chamar.
--
-- `SECURITY INVOKER` (o padrao), como a original: quem chama escreve com o
-- proprio papel. `review_status` continua NAO sendo parametro -- a sugestao
-- nasce `pending` pelo `DEFAULT` da tabela, e quem revisa continua sendo o
-- painel. **Esta migracao nao cria caminho de publicacao nenhum.**

-- Up Migration

ALTER TABLE directory_suggestions
  ADD COLUMN postal_code text
  CONSTRAINT directory_suggestions_cep_formato
  CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$');

COMMENT ON COLUMN directory_suggestions.postal_code IS
  'O CEP do estabelecimento sugerido, oito digitos SEM hifen (mesma forma de tag_requests.postal_code). Opcional: quem indica de outro bairro costuma nao saber o CEP. GUARDADO PARA QUEM REVISA no painel, que precisa achar o estabelecimento para convida-lo (ADR-0011), e NUNCA publicado -- rua e CEP nao saem em superficie publica (ADR-0010 itens 4 e 5), nao ha operacao de leitura desta tabela no contrato, e postal_code ja e nome proibido em resposta sem conta em portao-contrato-publico.ts e em vazamento-publico.ts. Texto, nunca coordenada: nada aqui e geocodificado (ADR-0006).';

DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text);

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
  'Grava a sugestao com a autoria e o CEP, em um comando. Existe porque o nome da coluna de autoria e reprovado em src/ pelo portao de colunas que nao saem: aqui o nome fica na migracao, que e onde ele ja mora. review_status nao e parametro -- a sugestao nasce pending pelo DEFAULT da tabela, e quem decide continua sendo o painel. Devolve created_at, que e o unico carimbo que o recibo traz.';

-- Down Migration

-- Descer com CEP gravado APAGA dado que a comunidade informou e que a fila de
-- revisao usa para achar o estabelecimento. Mesma forma da `20261017000004`: a
-- descida reprova em voz alta em vez de descartar trabalho em silencio.
--
-- A conferencia e por CEP PREENCHIDO, e nao por linha existente: a tabela
-- cheia de sugestoes sem CEP nenhum nao perde nada ao perder esta coluna, e
-- reprovar ali impediria a descida sem motivo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM directory_suggestions WHERE postal_code IS NOT NULL) THEN
    RAISE EXCEPTION
      'ha sugestao com CEP gravado: reverter apagaria o que a comunidade informou e o que a fila de revisao usa para achar o estabelecimento. Exporte antes, e a decisao nao e de quem roda o comando.';
  END IF;
END
$$;

DROP FUNCTION directory_suggestions_registrar(uuid, text, uuid, text, text, text, text, text, text, text, text, text);

-- A de 11 argumentos volta IDENTICA a da `20261017000004`: sem ela, a versao
-- anterior de `src/` ficaria sem nenhuma funcao para chamar.
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

ALTER TABLE directory_suggestions DROP COLUMN postal_code;
