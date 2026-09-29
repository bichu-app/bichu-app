-- MASSA DE ARESTA para `migrations/20260921000001_indice-cego-do-codigo-da-tag.sql`.
--
-- Aplicada pelo portao `verificar-migracao-em-banco-com-dado` no instante
-- IMEDIATAMENTE ANTES daquela migracao, num banco que ja subiu tudo o que vem
-- antes dela. O esquema visivel aqui e o de 20260919000001, e nao o da cabeca:
-- nao use coluna, restricao ou gatilho que nasce depois.
--
-- ESTA MASSA VIVE EM `infra/`, E NAO EM `migrations/`, por duas razoes que nao
-- sao organizacao de pasta:
--   1. o `Dockerfile` faz `COPY migrations ./migrations` no alvo `migrador`.
--      Massa de teste dentro de `migrations/` viajaria DENTRO da imagem que
--      migra producao.
--   2. o `node-pg-migrate` le `migrations/` inteiro. Hoje ele tolera
--      subdiretorio; depender disso e apostar numa versao.
--
-- ===========================================================================
-- O DEFEITO QUE ESTA MASSA EXISTE PARA REPRODUZIR
-- ===========================================================================
-- Em banco VAZIO a migracao aplica sem erro, e era so assim que a esteira e os
-- portoes locais a exercitavam (`make reset`, `verificar-subida-da-api` e
-- `npm run test:integration` sobem pilha efemera e migram do zero). Contra o
-- banco de desenvolvimento, que tem dado, ela morria com saida 1:
--
--   error: new row for relation "found_reports" violates check constraint
--          "found_reports_scan_tem_tag_e_pet"   (23514)
--   where: SQL statement "UPDATE ONLY ... SET "tag_id" = NULL ..."
--          SQL statement "DELETE FROM pet_tags WHERE status = 'revoked'"
--
-- Sao DOIS casos aqui, e os dois importam:
--
--   TAG CITADA    -- um `found_reports` de `origin = 'tag_scan'` aponta para
--                    ela. Ela tem que FICAR: `found_reports_scan_tem_tag_e_pet`
--                    exige a tag, e o aviso e registro historico que carrega a
--                    conversa mediada com o tutor (migrations/20260922000015).
--   TAG SOLTA     -- ninguem a cita. Ela tem que SAIR, que e o que a secao 12.2
--                    da Emenda 1 do ADR-0004 manda fazer. Sem esta segunda
--                    linha, um `DELETE` que nunca apaga nada passaria o portao.

-- O tutor. `users.email` e dominio proprio; `@exemplo.invalido` nunca resolve.
INSERT INTO users (id, email, status)
VALUES ('01a0b229-0000-7000-8000-000000000001', 'massa.migracao@exemplo.invalido', 'active');

INSERT INTO pets (id, owner_user_id, name, species_code, size_code, status)
VALUES ('01a0b229-0000-7000-8000-000000000002',
        '01a0b229-0000-7000-8000-000000000001',
        'Thor', 'dog', 'M', 'active');

-- As duas plaquinhas revogadas. `code_ciphertext` NULO nas duas, que e o que
-- `pet_tags_revogada_nao_guarda_o_codigo` obriga fora de `active` -- e e
-- exatamente por isso que o codigo delas nao e recuperavel e o `code_hash` nao
-- pode ser recalculado para HMAC.
INSERT INTO pet_tags (id, pet_id, code_hash, code_ciphertext, code_suffix,
                      label, status, revoked_at, revocation_reason, scan_count)
VALUES
  -- CITADA por um found_reports.
  ('01a0b229-0000-7000-8000-00000000000a',
   '01a0b229-0000-7000-8000-000000000002',
   decode('1baec4119a04c70769b3b4853158829832f33e2008d351b96ddceb1ee10565c4', 'hex'),
   NULL, 'YXDQ', 'coleira do dia a dia', 'revoked',
   '2026-09-18 01:46:35.773004+00', 'lost_tag', 2),
  -- SOLTA: nenhum aviso a cita.
  ('01a0b229-0000-7000-8000-00000000000b',
   '01a0b229-0000-7000-8000-000000000002',
   decode('2baec4119a04c70769b3b4853158829832f33e2008d351b96ddceb1ee10565c4', 'hex'),
   NULL, 'ZKPR', 'coleira de passeio', 'revoked',
   '2026-09-18 01:46:35.773004+00', 'owner_request', 0);

-- Leitura crua da plaquinha citada. A FK de `tag_scans` e CASCADE de proposito
-- (tabela de insercao apenas), entao estas linhas nao travam DELETE nenhum --
-- estao aqui para que a massa tenha a forma do banco de verdade.
INSERT INTO tag_scans (id, tag_id, scanned_at, resulted_in_found_report)
VALUES
  ('01a0b229-0000-7000-8000-0000000000c1', '01a0b229-0000-7000-8000-00000000000a',
   '2026-09-18 01:46:30+00', false),
  ('01a0b229-0000-7000-8000-0000000000c2', '01a0b229-0000-7000-8000-00000000000a',
   '2026-09-18 01:46:35+00', true);

-- O AVISO DO ACHADOR, e a linha que torna o DELETE impossivel. `origin` e
-- `tag_scan`, entao `found_reports_scan_tem_tag_e_pet` exige `tag_id` E
-- `pet_id` preenchidos, e nenhuma chave estrangeira pode anular o primeiro.
INSERT INTO found_reports (id, origin, tag_id, pet_id,
                           finder_token_hash, finder_token_expires_at, found_at)
VALUES ('01a0b229-0000-7000-8000-0000000000d1', 'tag_scan',
        '01a0b229-0000-7000-8000-00000000000a',
        '01a0b229-0000-7000-8000-000000000002',
        decode('3baec4119a04c70769b3b4853158829832f33e2008d351b96ddceb1ee10565c4', 'hex'),
        '2026-12-31 00:00:00+00', '2026-09-18 01:46:35.14+00');
