-- O caso comum, e a forma das 16 migracoes do repositorio. Se esta isca
-- reprovar, o portao virou ruido e nenhuma migracao nova consegue entrar.

-- Up Migration

CREATE TABLE exemplo (
  id   uuid PRIMARY KEY,
  nome text NOT NULL
);

COMMENT ON COLUMN exemplo.nome IS 'O nome, como a pessoa escreveu.';

-- Down Migration

DROP TABLE exemplo;
