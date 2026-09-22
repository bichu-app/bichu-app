-- BICHUS-92 — localizacao de referencia do tutor.
--
-- O que esta migracao fecha, em uma frase: o caso de perdido sabe ONDE o pet
-- sumiu (`lost_cases.last_seen_point`) e o sistema nao sabia QUEM esta perto.
-- `users` guarda localizacao so em texto (`reference_postal_code`,
-- `reference_neighborhood`, `reference_city`, `reference_state`) e nao tem
-- coluna geografica, entao "tutores num raio de 5 km" nao era calculavel: por
-- isso `AlcanceDoAlerta` responde `null` e a previa do alcance responde
-- `unavailable`. Texto nao vira coordenada, e nao ha geocodificacao (ADR-0006).
--
-- TABELA PROPRIA, E NAO QUATRO COLUNAS EM `users`. Tres razoes, na ordem de
-- peso:
--
-- 1. **Menor exposicao por leitura.** `users` e lida no login, na renovacao,
--    em toda rota autenticada e no perfil. Uma coluna geografica ali entra em
--    todo `SELECT` amplo, em todo despejo de diagnostico e em todo lugar onde
--    alguem escrever `select *`. Onde a pessoa MORA e o dado mais sensivel da
--    conta, e ele nao precisa acompanhar a leitura de sessao. E o mesmo
--    argumento que ja separou `local_credentials` de `user_identities` no
--    ADR-0002 ("o segredo mora separado do vinculo").
-- 2. **Ausencia escrita como ausencia de linha.** `DELETE /v1/me/location` vira
--    `DELETE FROM`, e nao tres `UPDATE ... = NULL` que precisam ser lembrados
--    juntos. Um par (ponto, validade) meio apagado nao e estado representavel.
-- 3. **A regra "uma unica linha por usuario, sempre a ultima, sem historico"
--    (criterio 5) vira CHAVE PRIMARIA**, e nao disciplina de aplicacao. Com
--    `user_id` como PK o historico deixa de ser exprimivel; com coluna em
--    `users` a mesma garantia dependeria de ninguem nunca escrever um INSERT.
--
-- `geography(Point, 4326)` e nao `geometry`, pelo mesmo motivo que
-- `lost_cases.last_seen_point` e `professionals.geo`: a consulta que importa e
-- "tutores num raio de 5 km", e em `geometry` isso exigiria projetar para um
-- sistema metrico e escolher a zona certa por regiao do Brasil. Em `geography`
-- o raio e em metros sobre o elipsoide e `ST_DWithin` acerta em Manaus e em
-- Porto Alegre sem ninguem lembrar de nada.
--
-- SOBRE A MARCA `NUNCA sai do servidor` DE `src/tools/portao-colunas-que-nao-
-- saem.ts`, E POR QUE ELA NAO ESTA AQUI: aquela marca significa "nao atravessa
-- a borda, em resposta nenhuma, para leitor nenhum" -- e por isso o portao
-- reprova o NOME da coluna tambem em `src/`. `reference_point` nao satisfaz a
-- premissa: o contrato declara `GET /v1/me/location` devolvendo `lat` e `lon`
-- ao PROPRIO dono. Escrever a marca aqui seria gravar uma afirmacao falsa no
-- banco e, na pratica, obrigar o adaptador de persistencia a entrar na lista de
-- dispensa do portao, que e exatamente o furo que ele existe para impedir.
--
-- O que guarda esta coluna, em lugar da marca, e verificavel e esta escrito:
--   * `src/modules/identity/adapters/http/localizacao-nao-vaza.test.ts` usa as
--     funcoes DO PROPRIO portao (`inspecionarContrato`) com o nome lido DESTE
--     arquivo, e exige zero ocorrencia em QUALQUER resposta do contrato;
--   * `src/tools/portao-contrato-publico.ts` passa a reprovar `reference_point`,
--     `point`, `geo`, `geohash`, `coordinates`, `distance_m` e `radius_m` em
--     resposta a quem nao tem conta, com isca propria;
--   * a granularidade publica continua sendo bairro, cidade e UF (ADR-0010,
--     "o que a rota publica jamais exibe", itens 4 e 5).

-- Up Migration

CREATE TABLE user_reference_locations (
  -- PK e FK na mesma coluna: e isto que torna o historico inexprimivel.
  -- CASCADE porque a localizacao e da conta e nao sobrevive a ela -- ADR-0010,
  -- tabela de retencao: "apagada ao sair da conta e ao excluir a conta". A
  -- trilha de auditoria nao referencia `users` de proposito, entao o CASCADE
  -- aqui nao apaga a evidencia do pedido de exclusao.
  user_id          uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,

  -- JA QUANTIZADO quando chega aqui. O bruto nao e gravado em lugar nenhum:
  -- precisao maior nao melhora um raio de 5 km e so aumenta o dano de um
  -- vazamento (criterio 5, e a descricao de `putMyLocation` no contrato).
  reference_point  geography(Point, 4326) NOT NULL,

  -- O lado da celula da grade, em metros, como ele SAI na resposta
  -- (`UserLocation.precision_m`). Coluna e nao constante de codigo porque uma
  -- linha gravada com a grade de hoje continua valendo o que valia no dia em
  -- que foi gravada, mesmo que a grade mude depois.
  precision_m      integer     NOT NULL
                               CONSTRAINT user_reference_locations_precisao_positiva
                               CHECK (precision_m > 0),

  -- CHECK e nao enum nativo: enum novo exige ALTER TYPE, que nao volta atras
  -- numa migracao `down`. Os dois valores sao os do contrato
  -- (`UserLocationInput.source`).
  source           text        NOT NULL
                               CONSTRAINT user_reference_locations_origem
                               CHECK (source IN ('device_gps', 'map_pin')),

  captured_at      timestamptz NOT NULL,

  -- 30 dias depois da captura (ADR-0010). Coluna e nao conta feita na leitura:
  -- com a data gravada, mudar a janela nao reescreve o passado, e a consulta de
  -- elegibilidade compara uma coluna em vez de repetir um intervalo que cada
  -- chamador poderia escrever diferente.
  expires_at       timestamptz NOT NULL,

  CONSTRAINT user_reference_locations_validade_no_futuro
    CHECK (expires_at > captured_at)
);

-- GIST porque e o indice que `ST_DWithin` usa; sem ele a consulta de 5 km vira
-- varredura da tabela inteira de tutores no pior instante possivel, que e o
-- segundo seguinte ao toque em "meu pet sumiu".
--
-- Indice TOTAL e nao parcial: o predicado natural seria `expires_at > now()`, e
-- `now()` nao e IMMUTABLE, entao o Postgres recusa. A validade entra na
-- clausula WHERE da consulta, nunca no indice.
CREATE INDEX user_reference_locations_por_lugar
  ON user_reference_locations USING GIST (reference_point);

-- A varredura de expurgo (worker) apaga por validade vencida.
CREATE INDEX user_reference_locations_vencidas
  ON user_reference_locations (expires_at);

COMMENT ON TABLE user_reference_locations IS
  'BICHUS-92: onde o tutor mora, aproximadamente, para a consulta de raio. Uma linha por conta, sempre a ultima, sem historico. Quantizada antes de gravar e com validade de 30 dias (ADR-0010).';

COMMENT ON COLUMN user_reference_locations.reference_point IS
  'Ponto JA quantizado na grade declarada em precision_m. Existe para CONSULTA (ST_DWithin), nao para exibicao: a granularidade que sai em superficie publica e bairro, cidade e UF, nunca mais fino (ADR-0010). Sai em lat/lon apenas em GET/PUT /v1/me/location, e apenas para o proprio dono.';

COMMENT ON COLUMN user_reference_locations.expires_at IS
  'Vencida, a conta sai da base de alerta na mesma consulta. Toda leitura filtra por expires_at > agora; o expurgo do worker apaga a linha depois.';

-- Down Migration

DROP TABLE IF EXISTS user_reference_locations;
