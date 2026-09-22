-- Down Migration escrito num comentario explicativo, ACIMA do de verdade.
--
-- O `node-pg-migrate` usa `String.search`, que devolve a PRIMEIRA ocorrencia:
-- a subida e cortada aqui em cima, o `CREATE TABLE` la embaixo nunca chega ao
-- banco, e a "descida" passa a ser o corpo inteiro da migracao. Nenhum erro,
-- nenhuma saida diferente de zero.
--
-- Mesma classe do incidente, pelo outro lado: SQL que o autor escreveu e que o
-- banco nunca ve.

-- Up Migration

CREATE TABLE exemplo (
  id   uuid PRIMARY KEY,
  nome text NOT NULL
);

-- Down Migration

DROP TABLE exemplo;
