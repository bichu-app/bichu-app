-- BICHUS-273 / BICHUS-292 (ADR-0027 apendice A.4.2).
--
-- A galeria do encontro da `Rede`, no mesmo modelo de `store_item_images`: ate
-- 8 imagens, a capa e `position = 0`, texto alternativo obrigatorio em TODA
-- posicao (a obrigacao acompanha a imagem que vira capa numa reordenacao).
--
-- Nao nasceu na `20260928000001` porque aponta para `catalog_images`, que nasce
-- na `20260928000003`. `network_events.cover_image_url` saiu (decisao da
-- coordenacao, 23/09): o banco guarda a chave do objeto, e a URL da capa e
-- composta na leitura a partir da imagem de posicao 0.
--
-- No encontro privado a galeria e oculta: ela so sai em `private-details`,
-- para conta aprovada (ADR-0027 12.10 a 12.12).

-- Up Migration

CREATE TABLE network_event_images (
  event_id  uuid     NOT NULL REFERENCES network_events (id) ON DELETE CASCADE,
  image_id  uuid     NOT NULL UNIQUE REFERENCES catalog_images (id),
  position  smallint NOT NULL
            CONSTRAINT network_event_images_posicao
            CHECK (position BETWEEN 0 AND 7),
  alt_text  text     NOT NULL
            CONSTRAINT network_event_images_texto_alternativo_tem_tamanho
            CHECK (char_length(btrim(alt_text)) BETWEEN 2 AND 150),
  PRIMARY KEY (event_id, image_id),
  -- Diferida para que reordenar seja um conjunto de escritas na mesma
  -- transacao sem colidir no meio.
  CONSTRAINT network_event_images_ordem_unica
    UNIQUE (event_id, position) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE network_event_images IS
  'A galeria do encontro (ADR-0027 A.4.2). A capa e position = 0. Imagem de catalogo com purpose network_event, conferido pelo caso de uso.';
COMMENT ON COLUMN network_event_images.alt_text IS
  'Texto alternativo, obrigatorio em TODA posicao: a obrigacao acompanha a imagem que vira capa numa reordenacao.';
COMMENT ON COLUMN network_event_images.position IS
  '0 e a capa. Ate 7: o teto de 8 imagens e este CHECK somado a unicidade por encontro.';

-- Down Migration

DROP TABLE IF EXISTS network_event_images;
