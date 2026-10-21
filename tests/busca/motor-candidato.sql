-- ===========================================================================
-- O MOTOR CANDIDATO, para MEDIR -- nao e implementacao de producao.
-- ===========================================================================
-- Tres mudancas sobre o motor de hoje, e so tres:
--   1. Casa por PALAVRA (`word_similarity`) e nao por substring, o que tolera
--      erro de digitacao e pontuacao.
--   2. Casa em VARIOS CAMPOS com peso, o que resolve termo composto.
--   3. Ordena por RELEVANCIA, com bonus para nome exato e para prefixo.

-- A normalizacao continua sendo a do banco, a MESMA de `texto_para_busca`.
-- `padrao_de_busca` continua existindo para o caminho de substring.

CREATE OR REPLACE FUNCTION relevancia_da_entrada(
  p_nome text, p_cidade text, p_bairro text, p_consulta text,
  p_piso real DEFAULT 0.42
) RETURNS real LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  WITH q AS (SELECT texto_para_busca(btrim(p_consulta)) AS qn),
  -- A consulta vira palavras; cada palavra precisa achar casa em ALGUM campo.
  termos AS (
    SELECT unnest(string_to_array(regexp_replace((SELECT qn FROM q), '[^a-z0-9]+', ' ', 'g'), ' ')) AS t
  ),
  uteis AS (SELECT t FROM termos WHERE length(t) >= 2),
  -- Por termo, o melhor casamento ponderado entre os campos.
  -- Nome pesa 1,0; cidade e bairro 0,65 -- quem digita um nome quer o nome,
  -- e o lugar e o recorte, nao o alvo.
  melhor AS (
    SELECT u.t,
           greatest(
             1.00 * word_similarity(u.t, texto_para_busca(coalesce(p_nome,   ''))),
             0.65 * word_similarity(u.t, texto_para_busca(coalesce(p_cidade, ''))),
             0.65 * word_similarity(u.t, texto_para_busca(coalesce(p_bairro, '')))
           ) AS s
    FROM uteis u
  )
  SELECT CASE
    WHEN (SELECT count(*) FROM uteis) = 0 THEN 0::real
    -- TODO termo tem de casar. Sem isto, `vet vila mariana` casaria por `vet`
    -- sozinho e devolveria o catalogo de veterinarios inteiro.
    WHEN (SELECT min(s) FROM melhor) < p_piso THEN 0::real
    ELSE (
      (SELECT avg(s) FROM melhor)::real
      -- Bonus de nome exato: quem digita o nome inteiro quer AQUELE registro.
      + CASE WHEN texto_para_busca(coalesce(p_nome,'')) = (SELECT qn FROM q) THEN 1.00 ELSE 0 END
      -- Bonus de prefixo: comeco do nome vale mais que meio.
      + CASE WHEN texto_para_busca(coalesce(p_nome,'')) LIKE (SELECT qn FROM q) || '%' THEN 0.35 ELSE 0 END
      -- Bonus de nome curto: entre dois que casam igual, o nome que e so aquilo.
      + (0.15 / (1 + length(coalesce(p_nome,''))::real / 20))
    )::real
  END
$$;
