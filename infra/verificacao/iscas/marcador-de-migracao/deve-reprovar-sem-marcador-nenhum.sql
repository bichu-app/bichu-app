-- Nenhum marcador. O arquivo inteiro vira a subida e nao ha descida nenhuma:
-- a migracao aplica e nao volta.
--
-- Esta isca cobre a familia 2 sozinha, e existe porque ela e a saida mais
-- barata para calar a familia 1: apague o marcador de descida do arquivo
-- irmao e o portao deixaria de achar a descida dentro da subida. Sem esta
-- isca, "consertar" o portao daquele jeito ficaria verde.

CREATE TABLE exemplo (
  id   uuid PRIMARY KEY,
  nome text NOT NULL
);
