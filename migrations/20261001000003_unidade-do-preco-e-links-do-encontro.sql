-- Unidade do preco e links do encontro da `Rede` (decisoes do cliente de
-- 01/10/2026): "em um evento, tem que saber se o preco e por pet, por humano,
-- por dupla (humano + pet) ou (dois humanos)" e "pode criar o link".
--
-- 1. UNIDADE DO PRECO, ADITIVA. O conjunto que o painel oferece passa a ser:
--      per_pet         por pet                         (novo)
--      per_person      por humano                      (codigo mantido)
--      per_pair        dupla: 1 humano + 1 pet         (codigo mantido, mesmo sentido)
--      per_two_people  dupla de humanos (2 humanos)    (novo)
--    `per_dog` CONTINUA VALIDO e as linhas que o tem NAO sao reescritas: o
--    encontro existente responde como responde hoje. O painel o mostra como
--    "por pet" e nao o oferece mais; a aposentadoria esta no ADR-0027 item 22.
--    O encontro continua com UM preco (uma unidade).
--
-- 2. LINKS (ADR-0027 item 22, que reverte o "nao ha coluna de link" de 23/09):
--    - `ticket_url`: https, ate 500. O CHECK confere o esquema e o tamanho; o
--      resto (sem usuario e senha, sem IP literal, sem host local) e do caso
--      de uso, que sabe analisar URL;
--    - `instagram_handle`: so o usuario, sem `@`, em minusculas, 1 a 30 de
--      letras, digitos, ponto e sublinhado. A URL e montada na saida.
--    Os dois nascem NULOS em toda linha, e os CHECKs aceitam NULL.

-- Up Migration

-- O CHECK so ALARGA: todo valor que existe continua valendo, e nenhuma linha
-- e lida para ser reescrita.
ALTER TABLE network_events
  DROP CONSTRAINT network_events_unidade_do_valor_conhecida,
  ADD CONSTRAINT network_events_unidade_do_valor_conhecida
    CHECK (admission_unit IS NULL OR admission_unit IN ('per_dog', 'per_pet', 'per_person', 'per_pair', 'per_two_people')),
  ADD COLUMN ticket_url text
    CONSTRAINT network_events_link_de_ingresso_https
    CHECK (ticket_url IS NULL OR (char_length(ticket_url) <= 500 AND ticket_url ~ '^https:[/]{2}[^/?#@[:space:]]+')),
  ADD COLUMN instagram_handle text
    CONSTRAINT network_events_instagram_forma
    CHECK (instagram_handle IS NULL OR instagram_handle ~ '^[a-z0-9._]{1,30}$');

COMMENT ON COLUMN network_events.admission_unit IS
  'A que o preco se refere: per_pet (por pet), per_person (por humano), per_pair (1 humano + 1 pet), per_two_people (2 humanos). `per_dog` e legado, ainda valido e exibido como "por pet"; aposentadoria no ADR-0027 item 22.';
COMMENT ON COLUMN network_events.ticket_url IS
  'Link de compra/inscricao do encontro, https. PUBLICO: sai na agenda e no detalhe (ADR-0027 item 22). Excecao explicita ao D59, so neste campo.';
COMMENT ON COLUMN network_events.instagram_handle IS
  'O @ do Instagram do encontro, guardado sem o @ e em minusculas. PUBLICO; a URL e montada na saida (ADR-0027 item 22).';

-- Down Migration

ALTER TABLE network_events
  DROP COLUMN instagram_handle,
  DROP COLUMN ticket_url,
  DROP CONSTRAINT network_events_unidade_do_valor_conhecida;

-- `NOT VALID`: a descida nao recusa linha que ja tenha `per_pet` ou
-- `per_two_people`; o conjunto antigo volta a valer para escrita nova.
ALTER TABLE network_events
  ADD CONSTRAINT network_events_unidade_do_valor_conhecida
    CHECK (admission_unit IS NULL OR admission_unit IN ('per_dog', 'per_person', 'per_pair')) NOT VALID;
