-- MASSA de 20261001000003: um encontro por unidade antiga, mais um gratuito.
-- A `.depois.sql` afirma que nada mudou: `per_dog` continua valido e intacto.

INSERT INTO network_events
  (id, slug, title, summary, place_name, neighborhood, city, state,
   starts_at, publication_status, published_at,
   admission_kind, admission_amount, admission_currency, admission_unit, updated_at, version)
VALUES
  ('01a0b229-0000-7000-8000-0000000f0001', 'preco-por-cao', 'Por cao', 'Preco por cao.',
   'Parque A', 'Centro', 'Sao Paulo', 'SP', '2026-10-10 12:00+00', 'published', '2026-09-28 12:00+00',
   'paid', 1500, 'BRL', 'per_dog', '2026-09-28 12:00+00', 2),
  ('01a0b229-0000-7000-8000-0000000f0002', 'preco-por-pessoa', 'Por pessoa', 'Preco por pessoa.',
   'Parque B', 'Centro', 'Sao Paulo', 'SP', '2026-10-11 12:00+00', 'published', '2026-09-28 12:00+00',
   'paid', 3000, 'BRL', 'per_person', '2026-09-28 12:00+00', 1),
  ('01a0b229-0000-7000-8000-0000000f0003', 'preco-por-dupla', 'Por dupla', 'Preco por dupla.',
   'Parque C', 'Centro', 'Sao Paulo', 'SP', '2026-10-12 12:00+00', 'published', '2026-09-28 12:00+00',
   'paid', 4000, 'BRL', 'per_pair', '2026-09-28 12:00+00', 1),
  ('01a0b229-0000-7000-8000-0000000f0004', 'preco-gratuito', 'Gratuito', 'Sem preco.',
   'Parque D', 'Centro', 'Sao Paulo', 'SP', '2026-10-13 12:00+00', 'published', '2026-09-28 12:00+00',
   'free', NULL, NULL, NULL, '2026-09-28 12:00+00', 1);
