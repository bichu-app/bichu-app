-- O endereco por extenso do encontro da `Rede` (decisao do cliente de
-- 01/10/2026): "no backoffice nao precisa ter mapa, apenas o endereco. Nao faz
-- sentido gastar dinheiro com isso".
--
-- O QUE MUDA, E O QUE NAO MUDA:
--
-- - `street_address`: texto livre, de 5 a 200 code points depois de `btrim`,
--   anulavel. O painel o escreve na criacao e na edicao. O app o le SO em
--   `GET /v1/network/events/{slug}/location`, com conta, pela mesma regra do
--   ponto (emenda 1 do ADR-0010, emenda de 01/10 do ADR-0027). Nunca na agenda
--   nem no detalhe publico. O app abre o endereco no aplicativo de mapas do
--   aparelho, por intent com o TEXTO: o Bichu nao geocodifica (ADR-0006).
-- - `geo`/`geo_source` e a rota de mover CONTINUAM, so por compatibilidade: o
--   painel deixou de usa-los. Nenhuma coluna sai.
--
-- DADO EXISTENTE: a coluna nasce NULA em toda linha, e o `CHECK` aceita NULL.
-- Nenhuma linha e lida, reescrita ou recusada (hml tem encontros reais).
--
-- `char_length` conta code points, o mesmo que o servidor conta
-- (`[...texto.trim()]`). O detector de contato e pagamento (D59) nao vale aqui
-- como vale nas observacoes: endereco e CEP sao o conteudo do campo. O caso de
-- uso recusa so link, e-mail, perfil, telefone e pagamento.

-- Up Migration

ALTER TABLE network_events
  ADD COLUMN street_address text
    CONSTRAINT network_events_endereco_tem_tamanho
    CHECK (street_address IS NULL OR char_length(btrim(street_address)) BETWEEN 5 AND 200);

COMMENT ON COLUMN network_events.street_address IS
  'O endereco por extenso do encontro (decisao do cliente de 01/10/2026). Sai SO em `getNetworkEventLocation`, com conta, como o ponto; nunca em leitura publica. Sem geocodificacao: o app abre o texto no aplicativo de mapas do aparelho.';

COMMENT ON COLUMN network_events.geo IS
  'O ponto do encontro, marcado no mapa pelo administrador. Opcional. SO POR COMPATIBILIDADE desde 01/10/2026: o painel deixou de usar o mapa e passou ao endereco (`street_address`). So sai em `getNetworkEventLocation`, com `bearerAuth` obrigatorio; nunca em operacao alcancavel sem conta.';

-- Down Migration

COMMENT ON COLUMN network_events.geo IS
  'O ponto do encontro, marcado no mapa pelo administrador. Opcional. So sai em `getNetworkEventLocation`, com `bearerAuth` obrigatorio; nunca em operacao alcancavel sem conta.';

ALTER TABLE network_events
  DROP COLUMN street_address;
