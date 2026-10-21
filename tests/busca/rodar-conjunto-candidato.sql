\pset format aligned
\pset border 2
SELECT
  c.id, c.categoria, c.consulta,
  a.total AS hoje_n, a.pos AS hoje_pos,
  b.total AS cand_n, b.pos AS cand_pos,
  c.posicao_esperada AS esperada,
  CASE WHEN c.espera_recusa THEN 'N/A'
       WHEN c.espera_zero THEN CASE WHEN a.total=0 THEN 'passa' ELSE 'REPROVA' END
       WHEN c.espera_resultados THEN CASE WHEN a.total>0 THEN 'passa' ELSE 'REPROVA' END
       WHEN a.pos IS NULL THEN 'REPROVA'
       WHEN a.pos<=c.posicao_esperada THEN 'passa' ELSE 'REPROVA' END AS hoje,
  CASE WHEN c.espera_recusa THEN 'N/A'
       WHEN c.espera_zero THEN CASE WHEN b.total=0 THEN 'passa' ELSE 'REPROVA' END
       WHEN c.espera_resultados THEN CASE WHEN b.total>0 THEN 'passa' ELSE 'REPROVA' END
       WHEN b.pos IS NULL THEN 'REPROVA'
       WHEN b.pos<=c.posicao_esperada THEN 'passa' ELSE 'REPROVA' END AS candidato
FROM casos c
CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM professionals p WHERE p.status='published'
            AND texto_para_busca(p.display_name) LIKE padrao_de_busca(c.consulta)) AS total,
         (SELECT min(s.rn) FROM (SELECT row_number() OVER (ORDER BY p.display_name) rn, p.display_name
             FROM professionals p WHERE p.status='published'
               AND texto_para_busca(p.display_name) LIKE padrao_de_busca(c.consulta)) s
           WHERE c.alvo<>'' AND s.display_name=c.alvo) AS pos
) a
CROSS JOIN LATERAL (
  SELECT (SELECT count(*) FROM professionals p WHERE p.status='published'
            AND relevancia_da_entrada(p.display_name,p.city,p.neighborhood,c.consulta) > 0) AS total,
         (SELECT min(s.rn) FROM (
             SELECT row_number() OVER (ORDER BY relevancia_da_entrada(p.display_name,p.city,p.neighborhood,c.consulta) DESC,
                                                p.display_name) rn, p.display_name
             FROM professionals p WHERE p.status='published'
               AND relevancia_da_entrada(p.display_name,p.city,p.neighborhood,c.consulta) > 0) s
           WHERE c.alvo<>'' AND s.display_name=c.alvo) AS pos
) b
ORDER BY c.id;
