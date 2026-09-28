-- O ESTADO FINAL que a massa de 20260921000001 tem de produzir.
--
-- Roda depois de `migrate up` chegar a cabeca, e afirma por `RAISE EXCEPTION`
-- dentro do SQL -- nao por mensagem no log. O motivo e medido: o
-- `node-pg-migrate` nao registra ouvinte de `notice` no cliente `pg`, entao
-- `RAISE NOTICE` e `RAISE WARNING` de migracao sao DESCARTADOS. Um portao que
-- procurasse a mensagem da migracao na saida dela procuraria o que nunca esta la.
--
-- Isto e o que separa este portao de "a migracao nao explodiu". Sem o estado
-- final afirmado, um `DELETE` que apagasse o `found_reports` junto com a tag
-- tambem sairia 0 -- e seria o pior desfecho possivel, porque o aviso carrega a
-- conversa mediada com o tutor.

DO $$
DECLARE
  n bigint;
  t text;
BEGIN
  -- 1. A TAG CITADA FICOU. Apagar a tag para limpar o indice destruiria a
  --    procedencia de um resgate (migrations/20260922000015).
  SELECT count(*) INTO n FROM pet_tags
   WHERE id = '01a0b229-0000-7000-8000-00000000000a' AND status = 'revoked';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'a tag revogada CITADA por um found_reports desapareceu (achei % linha(s), esperava 1). '
      'Ou o DELETE voltou a ser incondicional, ou alguma migracao posterior a levou.', n;
  END IF;

  -- 2. A TAG SOLTA SAIU. Sem esta afirmacao, um `DELETE` que nunca apaga nada
  --    passaria o portao, e a secao 12.2 da Emenda 1 do ADR-0004 deixaria de
  --    valer em silencio.
  SELECT count(*) INTO n FROM pet_tags WHERE id = '01a0b229-0000-7000-8000-00000000000b';
  IF n <> 0 THEN
    RAISE EXCEPTION
      'a tag revogada que NINGUEM cita continua no banco (% linha(s)). O DELETE da Fase 1 '
      'deixou de apagar o que ele pode apagar, e a linha irresolvivel ficou no indice unico.', n;
  END IF;

  -- 3. O AVISO DO ACHADOR ESTA INTEIRO, com a tag no lugar. Um `tag_id` nulo
  --    aqui seria a contradicao que a restricao existe para recusar, e um aviso
  --    ausente seria a conversa com o achador desligada.
  SELECT count(*) INTO n FROM found_reports
   WHERE id = '01a0b229-0000-7000-8000-0000000000d1'
     AND origin = 'tag_scan'
     AND tag_id = '01a0b229-0000-7000-8000-00000000000a'
     AND pet_id = '01a0b229-0000-7000-8000-000000000002';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'o found_reports de origin = tag_scan nao sobreviveu intacto (achei % linha(s) com a tag '
      'e o pet no lugar, esperava 1). Ele e registro historico e carrega o finder_token_hash '
      'por onde o achador e o tutor combinam a devolucao.', n;
  END IF;

  -- 4. A DEGRADACAO FICOU REGISTRADA, com o id na trilha. E o que 12.2 vai
  --    precisar no dia em que `code_hash_legacy` virar entrega.
  SELECT count(*) INTO n FROM audit.events
   WHERE action = 'tag_code_hash_nao_migrado_para_hmac'
     AND resource_kind = 'pet_tag'
     AND resource_id = '01a0b229-0000-7000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION
      'a tag guardada nao entrou em audit.events (achei % linha(s), esperava 1). A migracao '
      'guardou a linha e nao disse a ninguem: o code_hash dela continua SHA-256 e aquela '
      'plaquinha responde 404 onde o produto promete 410.', n;
  END IF;

  -- 5. O RENOMEIO ACONTECEU. E a metade de esquema desta migracao, e ela nao
  --    pode ter sido engolida por uma falha silenciosa no meio do bloco.
  SELECT string_agg(conname, ', ') INTO t FROM pg_constraint
   WHERE conrelid = 'pet_tags'::regclass AND conname LIKE 'pet_tags_code_hash%';
  IF t <> 'pet_tags_code_hash_32_bytes' THEN
    RAISE EXCEPTION
      'a restricao de tamanho de code_hash esta como "%", e devia ser '
      'pet_tags_code_hash_32_bytes. O nome antigo declarava a FUNCAO (sha256) e passou a '
      'mentir com HMAC no lugar.', t;
  END IF;

  RAISE NOTICE 'estado final conferido: 5 afirmacoes.';
END $$;
