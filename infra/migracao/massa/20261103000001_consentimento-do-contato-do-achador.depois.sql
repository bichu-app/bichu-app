-- O ESTADO FINAL que a massa de 20261103000001 tem de produzir.
--
-- Afirma por `RAISE EXCEPTION` dentro do SQL, e nao por mensagem no log: o
-- `node-pg-migrate` nao registra ouvinte de `notice`, entao `RAISE NOTICE` e
-- `RAISE WARNING` de migracao sao DESCARTADOS, e um portao que procurasse a
-- mensagem procuraria o que nunca esta la.
--
-- Isto e o que separa este portao de "a migracao nao explodiu".

DO $$
DECLARE
  n bigint;
BEGIN
  -- 1. AS CINCO LINHAS DE ANTES CONTINUAM LA, com a especie que tinham. Se o
  --    `ADD CONSTRAINT` tivesse apertado a lista em vez de alarga-la, a
  --    migracao reprovaria; mas se alguem "consertasse" isso apagando linha, o
  --    portao ficaria verde sem esta afirmacao.
  SELECT count(*) INTO n FROM conversation_messages
   WHERE conversation_id = '01b11030-0000-7000-8000-0000000000e1';
  IF n <> 5 THEN
    RAISE EXCEPTION
      'a troca do CHECK de `system_kind` mexeu nas mensagens que ja existiam '
      '(achei % de 5). Migracao de restricao nao pode tocar dado.', n;
  END IF;

  -- 2. O RAMO `IS NULL` SOBREVIVEU. As linhas gravadas antes da coluna de
  --    especie sao nulas de proposito (20261018000014), e perder esse ramo as
  --    tornaria ilegais -- em banco vazio isso passa sem ninguem ver.
  SELECT count(*) INTO n FROM conversation_messages
   WHERE conversation_id = '01b11030-0000-7000-8000-0000000000e1'
     AND system_kind IS NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION
      'o ramo `system_kind IS NULL` do CHECK se perdeu na troca (achei % de 2 '
      'linhas nulas).', n;
  END IF;

  -- 3. A ESPECIE NOVA E ACEITA. Sem isto, uma migracao que recriasse o CHECK
  --    igual ao antigo passaria os dois primeiros testes.
  BEGIN
    INSERT INTO conversation_messages
      (id, conversation_id, sender_role, body, redactions, system_kind)
    VALUES ('01b11030-0000-7000-8000-00000000f101',
            '01b11030-0000-7000-8000-0000000000e1',
            'system', 'divulgacao de contato', '[]'::jsonb, 'finder_contact');
  EXCEPTION WHEN check_violation THEN
    RAISE EXCEPTION
      '`finder_contact` nao foi aceito como `system_kind`: a lista nao foi '
      'alargada, e a divulgacao do contato do achador nao tem como existir.';
  END;

  -- 4. E NENHUM OUTRO VALOR PASSOU A SER ACEITO. Lista que aceita qualquer
  --    coisa nao e lista, e um `CHECK` largo demais aprova em silencio.
  BEGIN
    INSERT INTO conversation_messages
      (id, conversation_id, sender_role, body, redactions, system_kind)
    VALUES ('01b11030-0000-7000-8000-00000000f102',
            '01b11030-0000-7000-8000-0000000000e1',
            'system', 'especie inventada', '[]'::jsonb, 'contato_do_achador');
    RAISE EXCEPTION
      'o CHECK de `system_kind` aceitou `contato_do_achador`, que ninguem '
      'declarou: a lista deixou de ser fechada.';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- e o esperado
  END;

  -- 5. A TABELA DO CONSENTIMENTO NASCEU VAZIA, e com a chave estrangeira para o
  --    aviso. Nada retroativo: ninguem consentiu no passado, e inventar linha
  --    seria arbitrar consentimento que nao houve -- o oposto do que esta
  --    migracao existe para garantir.
  SELECT count(*) INTO n FROM finder_contact_consents;
  IF n <> 0 THEN
    RAISE EXCEPTION
      'a tabela de consentimento nasceu com % linha(s). Consentimento '
      'retroativo nao e consentimento.', n;
  END IF;

  -- 6. O `CASCADE` DO AVISO ESTA LIGADO. Ele e o unico `ON DELETE` desta tabela,
  --    e e o que amarra a guarda a finalidade (ADR-0010 emenda 6).
  SELECT count(*) INTO n
    FROM information_schema.referential_constraints r
    JOIN information_schema.table_constraints t
      ON t.constraint_name = r.constraint_name
     AND t.constraint_schema = r.constraint_schema
   WHERE t.table_name = 'finder_contact_consents'
     AND r.delete_rule = 'CASCADE';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'esperava exatamente 1 chave estrangeira com ON DELETE CASCADE em '
      '`finder_contact_consents` (o aviso), e achei %.', n;
  END IF;
END
$$;
