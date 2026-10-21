-- Mede a MESMA consulta do produto, em tres termos de perfil diferente:
--   seletivo  = `clinica veterinaria sao francisco` (1 linha)
--   medio     = `vacin`                             (1 linha, termo curto)
--   AMPLO     = `vet`                               (metade do catalogo)
-- Cada termo roda 7 vezes; o relatorio traz a MEDIANA, nao a melhor.
\set ON_ERROR_STOP on
CREATE OR REPLACE FUNCTION medir(termo text, voltas int DEFAULT 7)
RETURNS TABLE(mediana_ms numeric, linhas bigint) LANGUAGE plpgsql AS $$
DECLARE t0 timestamptz; n bigint; tempos double precision[] := '{}';
BEGIN
  FOR i IN 1..voltas LOOP
    t0 := clock_timestamp();
    PERFORM display_name FROM (
      SELECT display_name FROM professionals
      WHERE status = 'published'
        AND texto_para_busca(display_name) LIKE padrao_de_busca(termo)
      ORDER BY display_name LIMIT 20
    ) s;
    tempos := tempos || (EXTRACT(epoch FROM clock_timestamp() - t0) * 1000);
  END LOOP;
  SELECT count(*) INTO n FROM professionals
    WHERE status = 'published'
      AND texto_para_busca(display_name) LIKE padrao_de_busca(termo);
  RETURN QUERY SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY x)::numeric, 3), n
    FROM unnest(tempos) x;
END $$;
