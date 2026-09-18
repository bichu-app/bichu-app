-- BICHUS-21 — marcar o pet como perdido.
--
-- A tabela espelha `LostCase` e `LostCaseInput` de `api/openapi.yaml`, que e a
-- fonte. O que o contrato declara e o servidor RESOLVE nao vira coluna:
-- `candidate_count`, `unread_message_count`, `share_url` e `poster_url` saem de
-- consulta ou sao montados na leitura.
--
-- COORDENADA E OPCIONAL, e essa e a decisao central desta historia. O criterio
-- 5 e explicito: bairro, cidade e UF bastam, e a area sozinha abre o caso. Quem
-- negou a permissao de localizacao -- que e muita gente, e especialmente quem
-- nunca abriu o app antes de precisar dele -- continua conseguindo marcar o pet
-- como perdido. O que muda e o alcance, nao a existencia: sem centro nao ha
-- raio, entao o alerta de 5 km nao dispara, e `has_location` existe justamente
-- para a tela dizer isso em vez de mostrar uma secao de alcance vazia.
--
-- O caso sem coordenada continua util por dois caminhos que nao dependem de
-- raio: ele entra na lista publica de perdidos da cidade e do bairro, e a tag
-- continua levando quem achar o animal direto ao tutor.

-- Up Migration

CREATE TABLE lost_cases (
  id                    uuid        PRIMARY KEY,
  pet_id                uuid        NOT NULL REFERENCES pets (id) ON DELETE CASCADE,
  -- Desnormalizado de `pets.owner_user_id` de proposito: o teto de 3 casos
  -- abertos POR CONTA (criterio 8) vira uma consulta sem juncao, e ele e
  -- conferido no caminho de escrita de todo caso novo.
  owner_user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  status                text        NOT NULL DEFAULT 'open'
                                    CHECK (status IN ('open', 'closed_reunited',
                                                      'closed_not_found', 'closed_false_alarm')),

  last_seen_at          timestamptz NOT NULL,

  -- PostGIS. Anulavel, e a anulabilidade E a regra (criterio 5).
  --
  -- `geography` e nao `geometry`: a consulta que importa e "tutores num raio de
  -- 5 km", e em `geometry` isso exigiria projetar para um sistema metrico e
  -- escolher a zona certa por regiao do Brasil. Em `geography` o raio e em
  -- metros sobre o elipsoide, e `ST_DWithin` faz a conta certa em Manaus e em
  -- Porto Alegre sem ninguem lembrar de nada.
  last_seen_point       geography(Point, 4326),

  -- A area por texto, o caminho de quem nao tem coordenada. Cidade e
  -- obrigatoria quando nao ha ponto; o bairro e o que a tela pede primeiro.
  last_seen_city        text        CONSTRAINT lost_cases_city_tamanho
                                    CHECK (last_seen_city IS NULL
                                           OR char_length(last_seen_city) BETWEEN 2 AND 80),
  last_seen_neighborhood text       CONSTRAINT lost_cases_bairro_tamanho
                                    CHECK (last_seen_neighborhood IS NULL
                                           OR char_length(last_seen_neighborhood) <= 80),
  last_seen_state       text        CONSTRAINT lost_cases_uf_tamanho
                                    CHECK (last_seen_state IS NULL
                                           OR char_length(last_seen_state) = 2),

  description           text        CONSTRAINT lost_cases_description_tamanho
                                    CHECK (description IS NULL
                                           OR char_length(description) <= 1000),

  -- Criterio 10: o padrao e VERDADEIRO. Quem abre um caso esta pedindo alcance,
  -- e perguntar isso a quem esta em panico e uma decisao a mais no pior momento.
  share_to_public_list  boolean     NOT NULL DEFAULT true,

  -- O token opaco que a lista publica e o cartaz usam como chave estavel. NAO e
  -- UUID e nao e ordenavel: ele e a unica coisa que identifica o caso em
  -- superficie publica, e `case_id` nunca sai de la (ADR-0010 item 6).
  share_token           text        NOT NULL,

  opened_at             timestamptz NOT NULL DEFAULT now(),
  closed_at             timestamptz,
  closure_outcome       text        CHECK (closure_outcome IN ('reunited', 'not_found', 'false_alarm')),
  closure_channel       text        CHECK (closure_channel IN ('tag_scan', 'bichu_alert',
                                                               'poster_or_link', 'on_my_own', 'other')),
  closure_note          text        CONSTRAINT lost_cases_closure_note_tamanho
                                    CHECK (closure_note IS NULL OR char_length(closure_note) <= 500),
  reopen_deadline       timestamptz,

  -- **UMA das duas, nunca nenhuma.** Sem esta restricao um caso poderia nascer
  -- sem ponto e sem cidade, e ele nao apareceria no alerta NEM na lista publica:
  -- um caso invisivel, que o tutor acha que abriu.
  CONSTRAINT lost_cases_tem_onde
    CHECK (last_seen_point IS NOT NULL OR last_seen_city IS NOT NULL),

  -- Encerrado exige desfecho, e aberto nao pode ter. Os dois sentidos, porque o
  -- estado pela metade e o que faz a metrica de reencontro mentir.
  CONSTRAINT lost_cases_encerrado_tem_desfecho
    CHECK ((status = 'open' AND closure_outcome IS NULL AND closed_at IS NULL)
           OR (status <> 'open' AND closure_outcome IS NOT NULL AND closed_at IS NOT NULL)),

  -- Canal de reencontro so faz sentido com `reunited`: e ele que torna a metrica
  -- atribuivel a um canal, e preenche-lo nos outros desfechos sujaria a conta.
  CONSTRAINT lost_cases_canal_so_com_reencontro
    CHECK (closure_channel IS NULL OR closure_outcome = 'reunited')
);

-- CRITERIO 8, primeira metade: **no maximo UM caso aberto por pet**, imposto
-- pelo banco. Na aplicacao isso seria uma consulta mais um `if`, e duas
-- requisicoes simultaneas do mesmo tutor -- que e exatamente o que a fila
-- offline produz quando o sinal volta -- passariam as duas pela consulta antes
-- de qualquer uma gravar.
CREATE UNIQUE INDEX lost_cases_um_aberto_por_pet ON lost_cases (pet_id)
  WHERE status = 'open';

-- O token e a chave publica: unico, e consultado a cada abertura de cartaz.
CREATE UNIQUE INDEX lost_cases_share_token_unico ON lost_cases (share_token);

-- Sustenta o teto de 3 abertos por conta e a tela de inicio do tutor.
CREATE INDEX lost_cases_abertos_da_conta ON lost_cases (owner_user_id)
  WHERE status = 'open';

-- A consulta do alerta e da lista publica: "casos abertos perto daqui".
-- GIST porque e o indice que `ST_DWithin` usa; sem ele a consulta de 5 km vira
-- varredura da tabela inteira, e ela roda no momento de maior pressa do produto.
CREATE INDEX lost_cases_abertos_por_lugar ON lost_cases USING GIST (last_seen_point)
  WHERE status = 'open' AND last_seen_point IS NOT NULL;

-- A lista publica filtra por cidade, e o criterio 8 registra por que o teto
-- existe: ele limita o tamanho da serie que um observador consegue cruzar ali.
CREATE INDEX lost_cases_publicos_por_cidade ON lost_cases (last_seen_city, opened_at DESC)
  WHERE status = 'open' AND share_to_public_list;

COMMENT ON COLUMN lost_cases.last_seen_point IS
  'Anulavel de proposito: area sozinha abre o caso (BICHUS-21 criterio 5). Sem ponto nao ha raio, e `has_location` diz isso a tela.';
COMMENT ON COLUMN lost_cases.share_token IS
  'A unica chave do caso em superficie publica. `case_id` nunca sai (ADR-0010 item 6).';

-- Down Migration

DROP TABLE lost_cases;
