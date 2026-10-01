-- O ESTADO FINAL que a massa de 20261001000001 tem de produzir: NENHUMA linha
-- mudou. Afirmado por `RAISE EXCEPTION`, porque o node-pg-migrate descarta
-- NOTICE. Sem esta afirmacao, uma migracao que truncasse a descricao para
-- caber num teto, ou que reescrevesse a linha, tambem sairia 0.

DO $$
DECLARE
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM network_events WHERE slug LIKE 'massa-%';
  IF n <> 5 THEN
    RAISE EXCEPTION 'esperava os 5 encontros da massa, achei %', n;
  END IF;

  -- 1. As descricoes, byte a byte. A de 180 e a com espaco nas pontas sao as
  --    que um "ajuste" de dado estragaria.
  SELECT count(*) INTO n FROM network_events
   WHERE (slug = 'massa-teto-antigo' AND summary = repeat('a', 180))
      OR (slug = 'massa-piso' AND summary = 'ok')
      OR (slug = 'massa-espaco-nas-pontas' AND summary = '  ' || repeat('b', 178) || '  ')
      OR (slug = 'massa-cancelado' AND summary = 'Encontro que nao vai mais acontecer.')
      OR (slug = 'massa-com-pino' AND summary = 'Encontro com ponto marcado no mapa.');
  IF n <> 5 THEN
    RAISE EXCEPTION 'a migracao mexeu em descricao existente: so % de 5 continuam identicas', n;
  END IF;

  -- 2. Nenhuma linha foi reescrita: versao e updated_at intactos.
  SELECT count(*) INTO n FROM network_events
   WHERE slug LIKE 'massa-%'
     AND (version, updated_at) NOT IN (
       VALUES (3, '2026-09-28 12:00+00'::timestamptz), (1, '2026-09-28 12:00+00'::timestamptz),
              (2, '2026-09-28 12:00+00'::timestamptz), (2, '2026-09-29 12:00+00'::timestamptz));
  IF n <> 0 THEN
    RAISE EXCEPTION 'a migracao reescreveu % linha(s) de network_events (versao ou updated_at mudou)', n;
  END IF;

  -- 3. O pino continua onde estava, com a origem.
  SELECT count(*) INTO n FROM network_events
   WHERE slug = 'massa-com-pino' AND geo_source = 'map_pin'
     AND abs(ST_Y(geo::geometry) - (-23.5586)) < 1e-9 AND abs(ST_X(geo::geometry) - (-46.6814)) < 1e-9;
  IF n <> 1 THEN
    RAISE EXCEPTION 'o ponto do encontro com pino mudou ou sumiu';
  END IF;

  -- 4. O teto novo vale: 200 cabe, 201 nao.
  SELECT count(*) INTO n FROM pg_constraint
   WHERE conname = 'network_events_resumo_tem_tamanho'
     AND pg_get_constraintdef(oid) LIKE '%<= 200%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'o CHECK network_events_resumo_tem_tamanho nao e 2..200';
  END IF;
END $$;
