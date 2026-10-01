-- MASSA de 20261001000001 (descricao do encontro ate 200).
--
-- Cinco encontros, o numero que hml carrega com dado real do cliente, com as
-- arestas que a migracao poderia estragar se fizesse mais do que alargar o
-- CHECK: uma descricao no teto ANTIGO (180), uma no piso (2), uma com espaco
-- nas pontas (o CHECK mede `btrim`), um encontro cancelado e um com ponto no
-- mapa. A `.depois.sql` afirma que nenhuma linha mudou.

INSERT INTO network_events
  (id, slug, title, summary, place_name, neighborhood, city, state,
   starts_at, ends_at, publication_status, published_at, cancelled_at,
   geo, geo_source, updated_at, version)
VALUES
  ('01a0b229-0000-7000-8000-0000000e0001', 'massa-teto-antigo', 'Teto antigo',
   repeat('a', 180), 'Parque da Cidade', 'Centro', 'Sao Paulo', 'SP',
   '2026-10-10 12:00+00', '2026-10-10 14:00+00', 'published', '2026-09-28 12:00+00', NULL,
   NULL, NULL, '2026-09-28 12:00+00', 3),
  ('01a0b229-0000-7000-8000-0000000e0002', 'massa-piso', 'Piso',
   'ok', 'Praca Buenos Aires', 'Higienopolis', 'Sao Paulo', 'SP',
   '2026-10-11 12:00+00', NULL, 'published', '2026-09-28 12:00+00', NULL,
   NULL, NULL, '2026-09-28 12:00+00', 1),
  ('01a0b229-0000-7000-8000-0000000e0003', 'massa-espaco-nas-pontas', 'Espaco nas pontas',
   '  ' || repeat('b', 178) || '  ', 'Praca do Por do Sol', 'Alto de Pinheiros', 'Sao Paulo', 'SP',
   '2026-10-12 12:00+00', NULL, 'published', '2026-09-28 12:00+00', NULL,
   NULL, NULL, '2026-09-28 12:00+00', 2),
  ('01a0b229-0000-7000-8000-0000000e0004', 'massa-cancelado', 'Cancelado',
   'Encontro que nao vai mais acontecer.', 'Parque Ibirapuera', 'Vila Mariana', 'Sao Paulo', 'SP',
   '2026-10-13 12:00+00', NULL, 'cancelled', '2026-09-28 12:00+00', '2026-09-29 12:00+00',
   NULL, NULL, '2026-09-29 12:00+00', 2),
  ('01a0b229-0000-7000-8000-0000000e0005', 'massa-com-pino', 'Com pino',
   'Encontro com ponto marcado no mapa.', 'Praca Benedito Calixto', 'Pinheiros', 'Sao Paulo', 'SP',
   '2026-10-14 12:00+00', NULL, 'published', '2026-09-28 12:00+00', NULL,
   ST_SetSRID(ST_MakePoint(-46.6814, -23.5586), 4326)::geography, 'map_pin', '2026-09-28 12:00+00', 1);
