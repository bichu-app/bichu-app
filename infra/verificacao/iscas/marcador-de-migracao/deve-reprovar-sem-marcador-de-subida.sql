-- A ISCA DA BICHUS-125, copiada em miniatura.
--
-- Nao ha `-- Up Migration`. O `node-pg-migrate` manda o arquivo INTEIRO como
-- subida, entao a descida abaixo roda logo depois da subida e desfaz o que ela
-- acabou de fazer. A migracao NAO da erro: ela e registrada como aplicada e o
-- banco fica errado em silencio.
--
-- Este e o unico arquivo deste diretorio que reproduz o incidente de verdade.
-- Se ele passar, o portao parou de enxergar a familia inteira.

ALTER TABLE exemplo
  DROP CONSTRAINT exemplo_motivo_check;

ALTER TABLE exemplo
  ADD CONSTRAINT exemplo_motivo_check
  CHECK (motivo IN ('a', 'b', 'c'));

-- Down Migration

ALTER TABLE exemplo
  DROP CONSTRAINT exemplo_motivo_check;

ALTER TABLE exemplo
  ADD CONSTRAINT exemplo_motivo_check
  CHECK (motivo IN ('a', 'b'));
