-- ISCA. Este arquivo EXISTE PARA SER MEDIDO pelo portao de portabilidade, e
-- nao para rodar: ele NAO mora em `migrations/`, entao o migrador nunca o ve e
-- a tabela abaixo nunca existe. O autoteste o le por caminho proprio e o mede
-- COM UM `rel` DE MIGRACAO, de proposito -- a regra de URL absoluta so vale
-- para `migrations/*.sql`, e ate 20/10/2026 ela nao tinha testemunha nenhuma.
-- Nao corrija este arquivo. Ver docs/07-devops.md 3.6 e 3.9.
--
-- Tres marcas, no FIM da linha, depois de `--`. Escritas aqui SEM os
-- dois-pontos de proposito: com eles, esta propria explicacao entraria como
-- anotacao de um motivo que nunca existiu, que e o mesmo tropeco que
-- `motivo_anotado` documenta.
--
--   `isca` + motivo .................. a linha medida TEM de reprovar com ele
--   `dispensa-de-comentario` + motivo  o texto CRU reprova e a linha MEDIDA
--                                      nao: comentario nao e codigo
--   `dispensa-de-forma` + motivo ..... nao reprova nem crua, porque o
--                                      `https://` dela e a FORMA de uma URL e
--                                      nao um endereco -- nao ha host
--
-- As duas dispensas sao as duas metades do que travou a esteira inteira em
-- 20/10/2026, e nenhuma delas vale sozinha: a de forma so prova algo em par
-- com as linhas de `isca` daqui, que provam que a regra continua enxergando.

CREATE TABLE isca_de_portabilidade (
  -- O CASO QUE O PORTAO EXISTE PARA PEGAR: endereco NOSSO gravado no banco.
  -- Trocar de dominio deixa de ser uma variavel e passa a ser migracao de
  -- dados sobre plastico ja impresso.
  capa_padrao text NOT NULL DEFAULT 'https://img.bichu.app/padrao/capa.jpeg', -- isca: URL absoluta em migracao

  -- E DENTRO DE UM `CHECK` TAMBEM, quando ha host escrito. A dispensa de forma
  -- abaixo nao e "`CHECK` esta liberado": e "esquema sem host nao e endereco".
  -- Aqui o dominio esta escrito, e isso e amarracao de verdade.
  loja_amarrada text CHECK (loja_amarrada ~ '^https://bichu\.app/'), -- isca: URL absoluta em migracao

  -- O CASO QUE O PORTAO ACUSAVA SEM MOTIVO, medido em
  -- `migrations/20261019000007_versao-minima-do-app.sql:161`. O literal
  -- `https://` aqui e a REGRA DE VALIDACAO: ele existe para o banco RECUSAR um
  -- endereco mal digitado. Nao ha host, nao ha dominio, e nao ha nada para
  -- empurrar para configuracao -- e o portao mandava empurrar.
  loja_url text CHECK (loja_url ~ '^https://[^[:space:]]+$' AND length(loja_url) <= 300), -- dispensa-de-forma: URL absoluta em migracao

  -- E PROSA, e prosa nao grava nada em coluna nenhuma. O endereco esta aqui
  -- para ser LIDO por quem mantem a migracao, que foi o caso dos dois achados
  -- de `20261019000007_versao-minima-do-app.sql:156` e `:157`. Medido contra a
  -- homologacao: a derivada saiu em `https://img-hml.bichu.app/events/card/x.jpeg` -- dispensa-de-comentario: URL absoluta em migracao
  criado_em timestamptz NOT NULL DEFAULT now()
);
