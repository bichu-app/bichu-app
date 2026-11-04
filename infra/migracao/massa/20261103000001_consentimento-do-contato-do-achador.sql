-- A MASSA DE ARESTA DE 20261103000001, aplicada ANTES da migracao.
--
-- O que esta migracao faz com DADO preexistente e trocar o `CHECK` de
-- `conversation_messages.system_kind` por uma lista mais larga. `ALTER TABLE
-- ... ADD CONSTRAINT` VALIDA as linhas que ja existem, e em banco vazio nao ha
-- o que validar: os dois resultados sao verdes por motivos diferentes, que e
-- exatamente a classe de defeito que este portao existe para alcancar.
--
-- Esta massa poe uma linha de CADA especie que existia antes (`scan_notice`,
-- `found_notice`, `redaction_warning`), mais uma de especie NULA (as linhas
-- gravadas antes da coluna, que a migracao 20261018000014 deixou assim de
-- proposito) e uma mensagem HUMANA sem especie. Se a troca de `CHECK` apertasse
-- a lista em vez de alarga-la, ou esquecesse o ramo `IS NULL`, a validacao
-- reprovaria aqui -- e passaria em banco vazio.

-- O tutor, o pet, a plaquinha e o aviso: a conversa exige os quatro.
-- `public_ref` tem forma exigida por `users_public_ref_forma`: 22 caracteres de
-- base64url. Um rotulo legivel reprova na restricao, e reprovou na primeira
-- versao desta massa.
INSERT INTO users (id, email, display_name, public_ref)
VALUES ('01b11030-0000-7000-8000-0000000000a1', 'massa-20261103@exemplo.invalid',
        'Tutor da Massa',
        translate(encode(decode(replace('01b11030-0000-7000-8000-0000000000a1', '-', ''),
                                'hex'), 'base64'),
                  '+/=', '-_'));

INSERT INTO pets (id, owner_user_id, name, species_code, size_code)
SELECT '01b11030-0000-7000-8000-0000000000b1',
       '01b11030-0000-7000-8000-0000000000a1',
       'Aurora da Massa',
       (SELECT code FROM ref_species ORDER BY code LIMIT 1),
       (SELECT code FROM ref_sizes ORDER BY code LIMIT 1);

INSERT INTO pet_tags (id, pet_id, code_hash, code_suffix)
VALUES ('01b11030-0000-7000-8000-0000000000c1',
        '01b11030-0000-7000-8000-0000000000b1',
        sha256('massa-20261103000001'::bytea),
        'M103');

INSERT INTO found_reports
  (id, origin, tag_id, pet_id, finder_token_hash, finder_token_expires_at, found_at)
VALUES ('01b11030-0000-7000-8000-0000000000d1', 'tag_scan',
        '01b11030-0000-7000-8000-0000000000c1',
        '01b11030-0000-7000-8000-0000000000b1',
        sha256('token-da-massa-20261103000001'::bytea),
        now() + interval '30 days', now());

INSERT INTO conversations (id, found_report_id, pet_id, tutor_user_id)
VALUES ('01b11030-0000-7000-8000-0000000000e1',
        '01b11030-0000-7000-8000-0000000000d1',
        '01b11030-0000-7000-8000-0000000000b1',
        '01b11030-0000-7000-8000-0000000000a1');

-- UMA LINHA DE CADA ESPECIE QUE A LISTA ANTIGA ACEITAVA, mais o nulo e a
-- mensagem humana. E contra ESTAS cinco que o `ADD CONSTRAINT` da migracao
-- roda.
INSERT INTO conversation_messages
  (id, conversation_id, sender_role, body, redactions, system_kind)
VALUES
  ('01b11030-0000-7000-8000-0000000000f1', '01b11030-0000-7000-8000-0000000000e1',
   'system', 'Alguem escaneou a tag da Aurora da Massa.', '[]'::jsonb, 'scan_notice'),
  ('01b11030-0000-7000-8000-0000000000f2', '01b11030-0000-7000-8000-0000000000e1',
   'system', 'Um achado avulso foi ligado a este caso.', '[]'::jsonb, 'found_notice'),
  ('01b11030-0000-7000-8000-0000000000f3', '01b11030-0000-7000-8000-0000000000e1',
   'system', 'O Bichu nao entrega telefone por aqui.', '[]'::jsonb, 'redaction_warning'),
  -- Especie NULA: as linhas de antes da coluna. O ramo `system_kind IS NULL` do
  -- `CHECK` e o que as mantem legais, e a migracao tem de preserva-lo.
  ('01b11030-0000-7000-8000-0000000000f4', '01b11030-0000-7000-8000-0000000000e1',
   'system', 'Mensagem de sistema de antes da coluna de especie.', '[]'::jsonb, NULL),
  ('01b11030-0000-7000-8000-0000000000f5', '01b11030-0000-7000-8000-0000000000e1',
   'finder', 'Estou com ela, esta tudo bem.', '[]'::jsonb, NULL);
