-- O ESTADO FINAL da massa de 20261001000003: a mudanca e ADITIVA, entao
-- `per_dog` continua `per_dog` e nada e reescrito. RAISE EXCEPTION, porque o
-- node-pg-migrate descarta NOTICE.

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM network_events
   WHERE (slug = 'preco-por-cao'    AND admission_unit = 'per_dog'    AND admission_amount = 1500 AND version = 2 AND admission_currency = 'BRL')
      OR (slug = 'preco-por-pessoa' AND admission_unit = 'per_person' AND admission_amount = 3000)
      OR (slug = 'preco-por-dupla'  AND admission_unit = 'per_pair'   AND admission_amount = 4000)
      OR (slug = 'preco-gratuito'   AND admission_kind = 'free' AND admission_unit IS NULL AND admission_amount IS NULL);
  IF n <> 4 THEN
    RAISE EXCEPTION 'a troca de unidade perdeu ou trocou dado: so % de 4 encontros estao como deviam', n;
  END IF;

  -- Aditiva: nenhuma linha reescrita.
  SELECT count(*) INTO n FROM network_events
   WHERE slug LIKE 'preco-%' AND updated_at <> '2026-09-28 12:00+00'::timestamptz;
  IF n <> 0 THEN
    RAISE EXCEPTION 'a migracao reescreveu % linha(s): devia so alargar o CHECK', n;
  END IF;

  SELECT count(*) INTO n FROM network_events
   WHERE slug LIKE 'preco-%' AND (ticket_url IS NOT NULL OR instagram_handle IS NOT NULL);
  IF n <> 0 THEN
    RAISE EXCEPTION 'os links nasceram preenchidos em % linha(s): deviam nascer nulos', n;
  END IF;
END $$;
