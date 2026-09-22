-- BICHUS-18 e BICHUS-20 — o disparo do alerta, e a memoria que os criterios 6 e
-- 7 do ADR-0006 exigem para serem verdadeiros.
--
-- O QUE FALTAVA, EM UMA FRASE: a BICHUS-92 disse ONDE o tutor esta, a BICHUS-91
-- disse POR ONDE avisa-lo, e nenhuma das duas guarda QUEM JA FOI AVISADO. Sem
-- esse registro, dois dos sete criterios do ADR-0006 nao tem como ser
-- consultados:
--
--   6. nao recebeu mais de 3 alertas nas ultimas 24 h (teto de fadiga);
--   7. o caso nao mandou alerta nas ultimas 24 h (um disparo por caso por dia).
--
-- Os dois sao perguntas sobre o PASSADO, e passado que ninguem grava nao se
-- deduz. Uma consulta de alcance escrita sem estas duas tabelas devolveria um
-- numero que ignora a fadiga e permitiria o mesmo caso alertar a vizinhanca de
-- hora em hora -- errado com cara de certo, que e a mesma classe de mentira que
-- o zero inventado.
--
-- DUAS TABELAS E NAO UMA. `alert_dispatches` responde por CASO ("este caso ja
-- disparou hoje?") e `alert_recipients` responde por PESSOA ("quantos alertas
-- esta conta recebeu hoje?"). Sao duas cardinalidades e duas perguntas: o
-- criterio 10 da BICHUS-18 e explicito em dizer que o teto de fadiga e POR
-- USUARIO e nao por caso, e colapsar as duas numa tabela so faria a contagem
-- por pessoa depender de varrer os disparos e abrir a lista de cada um.
--
-- O QUE ESTAS TABELAS DELIBERADAMENTE NAO GUARDAM:
--
-- * NENHUMA COORDENADA E NENHUMA DISTANCIA. A distancia de cada tutor ao ponto
--   onde o pet sumiu e calculada na consulta, usada para ORDENAR, e descartada.
--   Gravada, ela seria uma trilateracao pronta: tres casos abertos perto da
--   mesma pessoa e a distancia de cada um a colocam num circulo de poucos
--   metros. O ADR-0010 proibe `distance_m` em superficie publica; guarda-la no
--   banco sem ninguem precisar dela e acumular o dano sem o beneficio (LGPD,
--   minimizacao).
-- * NENHUM TOKEN E NENHUM `device_id`. Quem foi avisado e uma CONTA. O aparelho
--   e endereco de entrega, resolvido no instante do envio por
--   `enderecoDeEnvio`, e guardar aqui qual aparelho recebeu criaria uma segunda
--   copia do parque de aparelhos fora de `user_devices`, que sobreviveria a
--   revogacao.
-- * NENHUM TEXTO DO AVISO. O conteudo e montado na hora
--   (`domain/conteudo-do-push.ts`); gravado, ele congelaria o nome do pet e o
--   bairro numa linha que ninguem atualiza.

-- Up Migration

CREATE TABLE alert_dispatches (
  id                uuid        PRIMARY KEY,

  -- CASCADE: o disparo e do caso e nao sobrevive a ele. A trilha de auditoria
  -- nao referencia `lost_cases`, entao a evidencia do alerta continua la.
  case_id           uuid        NOT NULL REFERENCES lost_cases (id) ON DELETE CASCADE,

  -- Fixo em 5000 no MVP, e coluna mesmo assim: uma linha gravada com o raio de
  -- hoje continua valendo o que valia no dia em que foi gravada. E a mesma
  -- razao de `user_reference_locations.precision_m` ser coluna.
  radius_m          integer     NOT NULL
                                CONSTRAINT alert_dispatches_raio_positivo
                                CHECK (radius_m > 0),

  -- Os QUATRO estados de `AlertDispatch.reach_status`, e os quatro sao
  -- distintos de proposito: `computed` com `recipients_total = 0` e "nao ha
  -- ninguem num raio de 5 km"; `unavailable` e "nao conseguimos calcular";
  -- `queued` e "ainda nao rodou"; `no_location` e "nao existe raio". A tela tem
  -- texto diferente para cada um e trocar um pelo outro e mentir para quem esta
  -- em panico (ADR-0006, criterio 12 da BICHUS-20).
  --
  -- CHECK e nao enum nativo, pelo mesmo motivo das outras tabelas: enum novo
  -- exige ALTER TYPE, que nao volta atras numa migracao `down`.
  reach_status      text        NOT NULL
                                CONSTRAINT alert_dispatches_estado
                                CHECK (reach_status IN ('computed', 'unavailable', 'queued', 'no_location')),

  -- ANULAVEL, e a anulabilidade e a regra: so `computed` tem numero. Uma coluna
  -- NOT NULL DEFAULT 0 aqui gravaria zero para "nao calculamos" e para "nao ha
  -- raio", que e exatamente o apagamento de distincao que a BICHUS-20 existe
  -- para impedir. O CHECK abaixo torna o par impossivel de escrever errado.
  recipients_total  integer     NULL
                                CONSTRAINT alert_dispatches_total_nao_negativo
                                CHECK (recipients_total IS NULL OR recipients_total >= 0),

  CONSTRAINT alert_dispatches_total_so_quando_calculado
    CHECK ((reach_status = 'computed') = (recipients_total IS NOT NULL)),

  -- O teto de 500 foi atingido? Registrado no disparo porque isso MUDA A
  -- LEITURA DA METRICA (criterio 9 da BICHUS-18): 500 destinatarios com o teto
  -- atingido e 500 sem ele sao fatos diferentes, e quem le o painel meses
  -- depois nao tem como distinguir os dois se o fato nao estiver gravado aqui.
  cap_reached       boolean     NOT NULL DEFAULT false,

  requested_at      timestamptz NOT NULL,

  -- Quando o envio de fato saiu. NULL enquanto `queued`: e a diferenca entre
  -- "pedimos" e "saiu", e o criterio 7 do ADR-0006 conta a partir do SEGUNDO.
  dispatched_at     timestamptz NULL,

  CONSTRAINT alert_dispatches_saiu_depois_de_pedido
    CHECK (dispatched_at IS NULL OR dispatched_at >= requested_at)
);

-- O CRITERIO 7 DO ADR-0006, INDEXADO: "este caso disparou nas ultimas 24 h?".
-- Sem este indice a pergunta vira varredura da tabela de disparos no segundo
-- seguinte ao toque em "meu pet sumiu", que e o pior instante possivel.
--
-- Indice TOTAL e nao parcial por `dispatched_at IS NOT NULL`: a leitura tambem
-- pergunta pelos disparos `queued` do mesmo caso para nao enfileirar dois.
CREATE INDEX alert_dispatches_por_caso
  ON alert_dispatches (case_id, dispatched_at DESC);

COMMENT ON TABLE alert_dispatches IS
  'BICHUS-18: um disparo do alerta de 5 km, por caso. Guarda o que a metrica precisa (quantos, e se o teto de 500 cortou) e nada de geografia: a distancia ordena a consulta e e descartada.';

COMMENT ON COLUMN alert_dispatches.reach_status IS
  'computed, unavailable, queued ou no_location. computed com recipients_total = 0 e "ninguem num raio de 5 km"; unavailable e "nao conseguimos calcular"; no_location e "nao existe raio, o caso nao tem coordenada". O CHECK alert_dispatches_total_so_quando_calculado impede o par mentiroso (estado nao calculado com numero, ou computed sem numero).';

COMMENT ON COLUMN alert_dispatches.cap_reached IS
  'O teto de 500 destinatarios cortou a lista. Gravado porque muda a leitura da metrica: 500 com corte e 500 sem corte sao fatos diferentes (criterio 9 da BICHUS-18).';

CREATE TABLE alert_recipients (
  dispatch_id  uuid        NOT NULL REFERENCES alert_dispatches (id) ON DELETE CASCADE,

  -- CASCADE porque o registro de "esta conta foi avisada" e da conta e nao
  -- sobrevive a ela (ADR-0010, tabela de retencao).
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  notified_at  timestamptz NOT NULL,

  -- CHAVE COMPOSTA, E NAO UM `id` PROPRIO. Uma conta aparece no maximo uma vez
  -- por disparo, e isso e regra e nao coincidencia: o teto de fadiga conta
  -- LINHAS por conta nas ultimas 24 h, entao uma segunda linha do mesmo disparo
  -- consumiria o teto duas vezes e tiraria do alerta seguinte alguem que tinha
  -- direito a ele. Com a chave composta a duplicata deixa de ser exprimivel.
  PRIMARY KEY (dispatch_id, user_id)
);

-- O CRITERIO 6 DO ADR-0006, INDEXADO: "quantos alertas esta conta recebeu nas
-- ultimas 24 h?". A ordem das colunas e (user_id, notified_at) e nao o
-- contrario: a consulta filtra por conta E por janela, e o prefixo por conta e
-- o que torna a busca uma faixa curta em vez de uma varredura por data.
CREATE INDEX alert_recipients_por_conta_e_janela
  ON alert_recipients (user_id, notified_at DESC);

COMMENT ON TABLE alert_recipients IS
  'BICHUS-18: quem foi avisado em cada disparo. Existe para o teto de fadiga do ADR-0006 (3 alertas em 24 h, POR USUARIO e nao por caso). Guarda conta e instante; nao guarda aparelho, token, distancia nem o texto do aviso.';

COMMENT ON COLUMN alert_recipients.notified_at IS
  'Instante em que o aviso saiu para esta conta. E a coluna que o teto de fadiga le: count(*) nas ultimas 24 h por user_id.';

-- Down Migration

DROP TABLE IF EXISTS alert_recipients;
DROP TABLE IF EXISTS alert_dispatches;
