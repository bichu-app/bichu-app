CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- VERBATIM da migracao 20260928000006_busca-por-nome-no-diretorio.sql
CREATE FUNCTION texto_para_busca(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT lower(unaccent('unaccent'::regdictionary, texto)) $$;

CREATE FUNCTION padrao_de_busca(termo text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$
    SELECT '%' ||
           replace(replace(replace(texto_para_busca(termo), '\', '\\'), '%', '\%'), '_', '\_') ||
           '%'
  $$;

-- Colunas de texto de `professionals` que a busca alcanca, com os MESMOS
-- CHECKs de tamanho da migracao 20260921000002.
CREATE TABLE professionals (
  id            bigserial PRIMARY KEY,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 120),
  kind          text NOT NULL CHECK (kind IN ('vet','groomer','walker','sitter','trainer','clinic')),
  city          text CHECK (city IS NULL OR char_length(city) BETWEEN 2 AND 80),
  state         text CHECK (state IS NULL OR char_length(state) = 2),
  neighborhood  text CHECK (neighborhood IS NULL OR char_length(neighborhood) <= 80),
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','hidden','removed'))
);
