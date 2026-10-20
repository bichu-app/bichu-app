-- ISCA NEGATIVA, em SQL. Este arquivo EXISTE PARA **NAO** SER REPROVADO pela
-- regra de migracao do portao de portabilidade. O par positivo dele e
-- `deve-reprovar-migracao.sql`. Nao "corrija" apagando os enderecos.
--
-- Ele cobre as duas coisas que a regra acusava sem haver amarracao nenhuma,
-- medidas em 20/10/2026 na `20261019000007_versao-minima-do-app.sql`:
--
--   1. o comentario `--` que EXPLICA o que a coluna aceita. Prosa nao persiste
--      URL em lugar nenhum: ela diz o que a coluna vai recusar.
--   2. o ESQUEMA dentro de literal de regex, sem host nenhum depois dele. Esse
--      `CHECK` e a validacao que IMPEDE guardar URL malformada -- o portao
--      estava acusando a propria defesa.
--
-- A marca diz, nos dois casos, qual regra nao pode disparar. `nao-isca` afirma
-- que o defeito esta na linha e so nao acusa por ser comentario;
-- `nao-isca-sem-host` afirma que nao ha host ali de forma nenhuma.

-- O `CHECK` exige `https://` e recusa espaco: um endereco de loja digitado as
-- pressas como `http://bichu.app ` abriria o navegador em lugar nenhum. -- nao-isca: URL absoluta em migracao
CREATE TABLE isca_de_portabilidade (
  store_url text
    CONSTRAINT isca_de_portabilidade_store_url_check
    CHECK (store_url ~ '^https://[^[:space:]]+$' AND length(store_url) <= 300) -- nao-isca-sem-host: URL absoluta em migracao
);
