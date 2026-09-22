-- A grafia que a expressao do node-pg-migrate aceita e que um portao de texto
-- exato reprovaria: maiusculas, tracos a mais e espaco a mais.
--
-- Ela e valida -- `^\s*--[\s-]*up\s+migration` com `i` e `m` casa as tres
-- variacoes -- e por isso PRECISA passar. Um portao que casasse a string
-- `-- Up Migration` reprovaria este arquivo, e portao que reprova quem esta
-- certo e desligado na primeira semana.

---- UP   MIGRATION

ALTER TABLE exemplo ADD COLUMN apelido text;

----- Down    Migration

ALTER TABLE exemplo DROP COLUMN apelido;
