-- MASSA DE ARESTA para `migrations/20261029000002_hospedagem-creche-e-a-indicacao-completa.sql`.
--
-- Aplicada pelo portao `verificar-migracao-em-banco-com-dado` no instante
-- IMEDIATAMENTE ANTES daquela migracao, num banco que ja subiu tudo o que vem
-- antes dela. O esquema visivel aqui e o da `20261029000001`, e nao o da
-- cabeca: nao use coluna, restricao ou gatilho que nasce depois.
--
-- ===========================================================================
-- O DEFEITO QUE ESTA MASSA EXISTE PARA REPRODUZIR
-- ===========================================================================
--
-- A `20261029000002` nao e so de restricao: ela RECLASSIFICA DADO -- troca o
-- elemento `sitter` por `boarding` em `professionals.kinds`, por decisao do
-- cliente de 29/10/2026 (*"passa as 27 para boarding"*).
--
-- **Em banco VAZIO ela aplica sem erro e sem fazer nada**, e e so assim que
-- `make reset` e a esteira a exercitariam. As tres formas de ela estar errada
-- so aparecem com dado:
--
-- 1. `SET kinds = ARRAY['boarding']` em vez de `array_replace` -- a entrada que
--    faz duas coisas PERDE a outra atividade. Sai 0, `ROW_COUNT` certo, dado
--    destruido. (Conferido: com essa troca, a propria migracao reprova pelo
--    controle de contagem dela. Esta massa e a rede de baixo, e mede tambem o
--    que o controle nao mede: a POSICAO.)
-- 2. a POSICAO perdida -- `{vet,sitter}` virando `{boarding,vet}` em vez de
--    `{vet,boarding}`. O contrato publica o PRIMEIRO elemento em `kind`
--    (`ProfessionalKinds`: *"a ORDEM IMPORTA ... o primeiro item e o que as
--    respostas publicam"*), entao trocar a ordem muda o que o app mostra.
-- 3. a FILA DE INDICACAO reclassificada de carona -- a decisao do cliente
--    nomeou as entradas do DIRETORIO, e reescrever a indicacao de outra pessoa
--    e decisao que ninguem tomou.
--
-- ===========================================================================
-- O QUE ESTA MASSA SEMEIA, e cada linha tem um porque
-- ===========================================================================
--
-- `professionals`:
--   - `massa-so-sitter`      `{sitter}`      -- o caso comum das 27
--   - `massa-sitter-primeiro` `{sitter,vet}` -- `sitter` na posicao 0
--   - `massa-sitter-depois`  `{vet,sitter}`  -- `sitter` na posicao 1
--   - `massa-sem-sitter`     `{groomer,clinic}` -- CONTROLE: nao deve mudar
--
-- `directory_suggestions`:
--   - uma indicacao pendente com `kind = 'sitter'` -- CONTROLE: a migracao NAO
--     a toca, e o `.depois.sql` cobra que ela continue `sitter`.
--
-- As duas ultimas sao o que separa "a migracao mexeu no que devia" de "a
-- migracao mexeu em tudo o que encontrou".

-- Uma conta de app para ser a autora da indicacao. `.invalid` e reservado por
-- RFC 2606: nenhum e-mail sai daqui para o mundo.
--
-- `public_ref` tem 22 caracteres de `[A-Za-z0-9_-]`
-- (`users_public_ref_forma`), e o valor sai da MESMA expressao que a suite de
-- integracao usa -- escrever um literal a mao foi o primeiro caminho e ele
-- reprovou no `CHECK`.
INSERT INTO users (id, email, display_name, created_at, updated_at, public_ref)
VALUES (
  '00000000-0000-7000-8000-00000000a001'::uuid,
  'massa-hospedagem@exemplo.invalid',
  'Quem Indicou Da Massa',
  now(), now(),
  translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_')
);

INSERT INTO professionals (id, slug, kinds, display_name, status, source, claim_status, city, state, phone_e164)
VALUES
  ('00000000-0000-7000-8000-00000000a011'::uuid, 'massa-so-sitter',
   ARRAY['sitter']::text[], 'Massa So Sitter', 'published', 'import', 'unclaimed',
   'Sao Paulo', 'SP', '+551130612200'),
  ('00000000-0000-7000-8000-00000000a012'::uuid, 'massa-sitter-primeiro',
   ARRAY['sitter', 'vet']::text[], 'Massa Sitter Primeiro', 'draft', 'import', 'unclaimed',
   NULL, NULL, NULL),
  ('00000000-0000-7000-8000-00000000a013'::uuid, 'massa-sitter-depois',
   ARRAY['vet', 'sitter']::text[], 'Massa Sitter Depois', 'draft', 'import', 'unclaimed',
   NULL, NULL, NULL),
  -- O CONTROLE: nenhuma das duas atividades desta linha pode mudar.
  ('00000000-0000-7000-8000-00000000a014'::uuid, 'massa-sem-sitter',
   ARRAY['groomer', 'clinic']::text[], 'Massa Sem Sitter', 'draft', 'import', 'unclaimed',
   NULL, NULL, NULL);

-- `published_at` na linha publicada, porque `professionals` nao exige, mas uma
-- entrada publicada sem marco e estado que o painel le errado -- e a massa nao
-- deve semear um estado que o produto trata como defeito.
UPDATE professionals SET published_at = now() WHERE slug = 'massa-so-sitter';

-- A INDICACAO PENDENTE, o segundo controle. Escrita com `INSERT` direto, e nao
-- por `directory_suggestions_registrar`: a massa semeia ESTADO, e passar pela
-- funcao faria ela medir a funcao em vez de semear.
INSERT INTO directory_suggestions (
  id, ref, suggested_by_user_id, display_name, kind,
  city, state, neighborhood, contact_kind, contact_value, review_status
) VALUES (
  '00000000-0000-7000-8000-00000000a021'::uuid,
  'massa-hospedagem-indicacao-0001',
  '00000000-0000-7000-8000-00000000a001'::uuid,
  'Massa Indicacao Sitter',
  'sitter',
  'Sao Paulo', 'SP', 'Bela Vista', 'phone', '+551130612200', 'pending'
);
