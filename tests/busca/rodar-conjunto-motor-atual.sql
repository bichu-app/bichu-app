-- Roda o conjunto de referencia contra O MOTOR QUE EXISTE HOJE.
-- A consulta e a de `kysely-directory-repository.ts` linha 291, verbatim:
--   texto_para_busca(professionals.display_name) LIKE padrao_de_busca($1)
-- mais o `status = 'published'` do `construtorDaListagem` e a ordenacao
-- `.orderBy('display_name')` da linha 566 (o caminho sem ponto geografico).
\pset format aligned
\pset border 2
SELECT
  c.id,
  c.categoria,
  c.consulta,
  m.total                                                    AS encontrados,
  m.posicao                                                  AS pos_do_alvo,
  c.posicao_esperada                                         AS pos_esperada,
  CASE
    WHEN c.espera_recusa                THEN 'N/A (piso)'
    WHEN c.espera_zero                  THEN CASE WHEN m.total = 0 THEN 'PASSA' ELSE 'REPROVA' END
    WHEN c.espera_resultados            THEN CASE WHEN m.total > 0 THEN 'PASSA' ELSE 'REPROVA' END
    WHEN m.posicao IS NULL              THEN 'REPROVA (nao achou)'
    WHEN m.posicao <= c.posicao_esperada THEN 'PASSA'
    ELSE 'REPROVA (posicao)'
  END                                                        AS veredito
FROM casos c
CROSS JOIN LATERAL (
  SELECT
    (SELECT count(*) FROM professionals p
      WHERE p.status = 'published'
        AND texto_para_busca(p.display_name) LIKE padrao_de_busca(c.consulta)) AS total,
    (SELECT min(s.rn) FROM (
        SELECT row_number() OVER (ORDER BY p.display_name) AS rn, p.display_name
        FROM professionals p
        WHERE p.status = 'published'
          AND texto_para_busca(p.display_name) LIKE padrao_de_busca(c.consulta)
     ) s WHERE c.alvo <> '' AND s.display_name = c.alvo) AS posicao
) m
ORDER BY c.id;
