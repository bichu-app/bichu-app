-- BICHUS-35 — o achado avulso, sem QR, e a correspondencia que ele sugere.
--
-- O que esta migracao fecha, em uma frase: `POST /v1/found-reports` estava
-- declarado no contrato desde 17/09 e nao existia em `src/` porque nao existia
-- dominio nenhum de achado avulso -- e nao existia porque a migracao
-- `20260917000007` deixou, por escrito, as colunas de caso, ponto, foto e
-- atributos de cruzamento para "quando `lostfound` chegar". Chegou.
--
-- ======================================================================
-- POR QUE ALTER EM `found_reports`, E NAO UMA TABELA NOVA
-- ======================================================================
--
-- A tentacao e criar `stray_found_reports`: o formulario e outro, o autor tem
-- conta, e nao ha tag nem pet. Tres coisas ja decididas dizem que nao:
--
-- 1. **O modelo da secao 4.4 de `docs/03-arquitetura.md` tem UMA tabela**, com
--    `origin` (`tag_scan`/`stray_report`) discriminando. A coluna existe desde
--    17/09 e hoje nenhuma linha usa o segundo valor: uma tabela nova faria a
--    coluna virar mentira no mesmo dia em que ela passaria a ter uso.
-- 2. **`match_candidates` e `conversations` apontam para `found_reports.id`.**
--    Com duas tabelas, cada uma dessas duas precisaria de duas chaves
--    estrangeiras anulaveis e de um CHECK dizendo que exatamente uma esta
--    preenchida -- o arranjo que a propria secao 4.5 escolheu NAO ter para a
--    ancora da conversa.
-- 3. **O cruzamento da secao 4.10 le os dois caminhos.** Um achado que chegou
--    pelo QR de uma tag revogada e um achado avulso sao a mesma coisa para o
--    cruzamento: animal visto, com atributos e lugar. Duas tabelas virariam um
--    `UNION ALL` em todas as consultas do miolo do F3.
--
-- O preco e que `found_reports` passa a ter colunas que so um dos dois caminhos
-- preenche. Esse preco esta pago em CHECK, abaixo, e nao em disciplina de
-- aplicacao: a forma errada nao entra.
--
-- ======================================================================
-- AS DUAS COLUNAS QUE PERDEM O `NOT NULL`, E POR QUE ISSO NAO AFROUXA NADA
-- ======================================================================
--
-- `finder_token_hash` e `finder_token_expires_at` nasceram `NOT NULL` porque no
-- caminho do QR eles SAO a autorizacao: e o token opaco que deixa quem nao tem
-- conta voltar a conversa. No achado avulso o contrato exige `bearerAuth`, e
-- quem autoriza e `reporter_user_id`.
--
-- Cunhar um token ao portador para quem ja tem conta seria **fabricar uma
-- credencial que ninguem usa**: mais um segredo de 256 bits gravado, mais uma
-- superficie de vazamento, zero funcao. Entao a regra deixa de ser "toda linha
-- tem token" e passa a ser, literalmente, "toda linha tem exatamente a
-- autorizacao do caminho por onde ela entrou" -- e isso e um CHECK, conferido
-- pelo banco em toda insercao, e nao um comentario.

-- Up Migration

-- ----------------------------------------------------------------------
-- 1. `found_reports` ganha o que faltava
-- ----------------------------------------------------------------------

ALTER TABLE found_reports
  -- O vinculo direto com o caso (criterio 10). `SET NULL` e nao `CASCADE`: o
  -- achado e relato de um terceiro sobre um animal na rua e nao deixa de ter
  -- acontecido porque o caso sumiu. Apagar o achado junto apagaria a unica
  -- prova de que alguem viu aquele animal naquele dia.
  ADD COLUMN case_id uuid REFERENCES lost_cases (id) ON DELETE SET NULL,

  -- Os atributos que o cruzamento le (secao 4.10). Anulaveis porque quem acha
  -- um animal na rua nao sabe quase nada dele -- `species` e `size` sao o
  -- minimo que o contrato exige, e estao cobertos por CHECK mais abaixo.
  ADD COLUMN species             text CONSTRAINT found_reports_especie
                                 CHECK (species IS NULL
                                        OR species IN ('dog', 'cat', 'other')),
  ADD COLUMN size                text CONSTRAINT found_reports_porte
                                 CHECK (size IS NULL
                                        OR size IN ('P', 'M', 'G', 'GG')),
  ADD COLUMN sex                 text CONSTRAINT found_reports_sexo
                                 CHECK (sex IS NULL
                                        OR sex IN ('male', 'female', 'unknown')),
  -- CHECK e nao enum nativo em todas as tres acima, pela mesma razao da
  -- BICHUS-92: `ALTER TYPE` nao volta atras numa migracao `down`.

  -- Codigo de `reference-data`. E ELE que o cruzamento le (criterio 8): raca
  -- digitada a mao produz falso negativo justamente no caso que importa.
  ADD COLUMN breed_code          text CONSTRAINT found_reports_breed_code_tamanho
                                 CHECK (breed_code IS NULL
                                        OR char_length(breed_code) BETWEEN 1 AND 40),
  -- A raca como o achador escreveu. DESCREVE, nao cruza -- a mesma separacao de
  -- `pets`, e e o que impede "vira-lata caramelo" digitado de virar criterio.
  ADD COLUMN breed_free_text     text CONSTRAINT found_reports_breed_free_text_tamanho
                                 CHECK (breed_free_text IS NULL
                                        OR char_length(breed_free_text) BETWEEN 1 AND 40),
  ADD COLUMN primary_color_code  text CONSTRAINT found_reports_cor_tamanho
                                 CHECK (primary_color_code IS NULL
                                        OR char_length(primary_color_code) BETWEEN 1 AND 30),
  ADD COLUMN ref_data_version    text CONSTRAINT found_reports_ref_data_version_tamanho
                                 CHECK (ref_data_version IS NULL
                                        OR char_length(ref_data_version) BETWEEN 1 AND 40),

  -- Onde o animal foi achado. `geography(Point, 4326)` pelo mesmo motivo de
  -- `lost_cases.last_seen_point` e `user_reference_locations.reference_point`:
  -- o que se pergunta e "a que distancia do ponto do caso", em metros sobre o
  -- elipsoide, e em `geometry` isso exigiria escolher uma zona metrica por
  -- regiao do Brasil.
  --
  -- ANULAVEL, e essa e a metade do criterio 6 que o banco sustenta: quem negou
  -- a permissao de localizacao digita bairro e cidade, e o achado e registrado
  -- do mesmo jeito. O `anyOf` do contrato vira o CHECK
  -- `found_reports_avulso_tem_onde`, abaixo.
  ADD COLUMN found_point geography(Point, 4326),

  -- O lugar em TEXTO, exatamente como a pessoa digitou. Tres colunas e nao uma:
  -- a cidade e filtro eliminatorio do cruzamento (secao 4.10, item 5) e precisa
  -- ser comparavel, enquanto bairro e UF so aparecem no rotulo.
  --
  -- NAO existe coluna `found_area_label`. O rotulo publico e DERIVADO na
  -- leitura por `rotuloDaArea` (`src/modules/lostfound/domain/abertura-do-
  -- caso.ts`), que ja e a unica definicao de "Bairro, Cidade" do produto.
  -- Gravar o texto montado criaria a segunda definicao, e duas definicoes do
  -- mesmo rotulo divergem na primeira vez que uma delas muda.
  ADD COLUMN found_city         text CONSTRAINT found_reports_cidade_tamanho
                                CHECK (found_city IS NULL
                                       OR char_length(found_city) BETWEEN 2 AND 80),
  ADD COLUMN found_neighborhood text CONSTRAINT found_reports_bairro_tamanho
                                CHECK (found_neighborhood IS NULL
                                       OR char_length(found_neighborhood) BETWEEN 1 AND 80),
  ADD COLUMN found_state        text CONSTRAINT found_reports_uf_tamanho
                                CHECK (found_state IS NULL
                                       OR char_length(found_state) = 2),

  -- A foto do achador. Aponta para `upload_intents` e nao para `pet_photos`
  -- porque ela NAO e foto de pet: nao tem dono, nao entra em cartaz, nao e
  -- servida pelo dominio publico de midia, e o criterio 9 manda que ela fique
  -- no bucket privado, visivel so ao tutor dentro da conversa mediada.
  --
  -- (A secao 4.4 do documento de arquitetura chama esta coluna de `photo_id`.
  -- O nome aqui e `photo_upload_id` porque e para `upload_intents` que ela
  -- aponta, e porque `photo_upload_id` e o nome do campo no contrato
  -- (`StrayFoundReportInput`). Um `photo_id` apontando para `upload_intents`
  -- seria um nome pedindo para alguem fazer o join errado.)
  ADD COLUMN photo_upload_id uuid REFERENCES upload_intents (id) ON DELETE SET NULL,

  ADD COLUMN status text NOT NULL DEFAULT 'open'
                    CONSTRAINT found_reports_status
                    CHECK (status IN ('open', 'matched', 'closed')),

  -- Ate quando esta linha existe. Coluna e nao conta feita na leitura, pelo
  -- mesmo argumento de `user_reference_locations.expires_at`: com a data
  -- gravada, mudar a janela nao reescreve o passado.
  --
  -- 30 dias a partir da criacao e o piso (ADR-0010, "dados do achador sem
  -- conta: vida do caso mais 30 dias"; e a historia "Achado sem correspondencia
  -- guardado por 30 dias", que esta destrava). Confirmar uma correspondencia
  -- EMPURRA esta data para 30 dias depois do encerramento do caso -- isso e
  -- trabalho da historia da confirmacao, e a coluna existe para que ela tenha
  -- onde escrever em vez de precisar de outra migracao.
  ADD COLUMN retention_until timestamptz;

-- As duas colunas do token do achador sem conta deixam de ser obrigatorias PARA
-- TODA LINHA e passam a ser obrigatorias PARA O CAMINHO QUE AS USA. Ver o bloco
-- no topo deste arquivo.
ALTER TABLE found_reports ALTER COLUMN finder_token_hash       DROP NOT NULL;
ALTER TABLE found_reports ALTER COLUMN finder_token_expires_at DROP NOT NULL;

-- ----------------------------------------------------------------------
-- 2. Os CHECK que substituem a disciplina de aplicacao
-- ----------------------------------------------------------------------
--
-- Cada um destes recusa uma linha que, sem ele, o sistema gravaria calado e
-- alguem descobriria numa consulta que a ignora.

ALTER TABLE found_reports
  -- O aviso vindo do QR continua sendo enderecado pelo token: sem ele o achador
  -- perde a conversa e o tutor perde o unico canal de volta.
  ADD CONSTRAINT found_reports_scan_tem_token
    CHECK (origin <> 'tag_scan'
           OR (finder_token_hash IS NOT NULL AND finder_token_expires_at IS NOT NULL)),

  -- "Exige conta (regra fechada no briefing)", `createStrayFoundReport` no
  -- contrato; e a secao 4.4, que diz `reporter_user_id` "obrigatorio no achado
  -- avulso". Sem conta nao ha a quem responder nem de quem cobrar o teto.
  ADD CONSTRAINT found_reports_avulso_tem_conta
    CHECK (origin <> 'stray_report' OR reporter_user_id IS NOT NULL),

  -- O `anyOf: [location, area]` do contrato, no banco. Um achado sem ponto E
  -- sem cidade nao e cruzavel por criterio nenhum da secao 4.10: ele nao passa
  -- pelo filtro de distancia nem pelo de cidade, e ficaria guardado 30 dias
  -- sem poder virar candidato de nada.
  ADD CONSTRAINT found_reports_avulso_tem_onde
    CHECK (origin <> 'stray_report' OR found_point IS NOT NULL OR found_city IS NOT NULL),

  -- `required: [species, size, found_at]` do `StrayFoundReportInput`.
  -- `found_at` ja e `NOT NULL` desde 17/09.
  ADD CONSTRAINT found_reports_avulso_tem_atributos
    CHECK (origin <> 'stray_report' OR (species IS NOT NULL AND size IS NOT NULL)),

  -- Raca em texto livre SEM codigo e o campo que descreve sem ter o que
  -- descrever: o cruzamento nao o le, e a tela nao tem o que exibir ao lado.
  -- Mesma regra de `PetInput`.
  ADD CONSTRAINT found_reports_texto_de_raca_acompanha_codigo
    CHECK (breed_free_text IS NULL OR breed_code IS NOT NULL),

  -- Achado avulso sem prazo de guarda e a linha que o expurgo nunca acha.
  ADD CONSTRAINT found_reports_avulso_tem_prazo
    CHECK (origin <> 'stray_report' OR retention_until IS NOT NULL);

COMMENT ON COLUMN found_reports.found_point IS
  'Onde o animal foi visto. Existe para CONSULTA de distancia (ST_DWithin/ST_Distance no cruzamento da secao 4.10), nao para exibicao: o que sai em qualquer resposta e o rotulo de bairro e cidade derivado de found_neighborhood e found_city, jamais a coordenada, nem arredondada (ADR-0006 e ADR-0010).';

COMMENT ON COLUMN found_reports.retention_until IS
  'Quando esta linha para de existir. 30 dias da criacao para o achado que nao virou correspondencia; empurrado para 30 dias apos o encerramento quando o achado se liga a um caso. O expurgo le esta coluna.';

COMMENT ON COLUMN found_reports.photo_upload_id IS
  'A foto do achador, no bucket privado. Visivel so ao tutor dentro da conversa mediada, por URL assinada (criterio 9): nenhuma rota publica a serve.';

-- ----------------------------------------------------------------------
-- 3. Os indices
-- ----------------------------------------------------------------------

-- GIST, que e o indice que `ST_DWithin` usa. Sem ele o filtro de 20 km da
-- secao 4.10 vira varredura da tabela inteira de achados a cada caso aberto.
-- Indice TOTAL e nao parcial pelo mesmo motivo da BICHUS-92: o predicado
-- natural seria por validade, e `now()` nao e IMMUTABLE.
CREATE INDEX found_reports_por_lugar ON found_reports USING GIST (found_point);

-- `listMyFoundReports`, paginada por cursor decrescente. Parcial porque o aviso
-- anonimo nao tem relator e nunca aparece nesta lista.
CREATE INDEX found_reports_do_relator ON found_reports (reporter_user_id, created_at DESC)
  WHERE reporter_user_id IS NOT NULL;

-- O lado do cruzamento que parte do CASO: "achados abertos da mesma especie nos
-- ultimos 14 dias". Especie e filtro eliminatorio e vem primeiro.
CREATE INDEX found_reports_abertos_por_especie ON found_reports (species, found_at DESC)
  WHERE status = 'open';

-- A varredura de expurgo.
CREATE INDEX found_reports_retencao ON found_reports (retention_until)
  WHERE retention_until IS NOT NULL;

-- ----------------------------------------------------------------------
-- 4. A intencao de envio ganha o aviso a que ela pertence
-- ----------------------------------------------------------------------
--
-- `upload_intents.kind` ja previa `found_report_photo` desde 18/09, e nao havia
-- coluna dizendo DE QUAL aviso. Sem ela, o teto de tres fotos por aviso
-- (SEC-009, e o `x-rate-limit` de `createFoundReportPhotoUploadIntent`) nao
-- teria como ser contado, e a foto confirmada nao teria como ser ligada.

ALTER TABLE upload_intents
  ADD COLUMN found_report_id uuid REFERENCES found_reports (id) ON DELETE CASCADE,

  -- Uma intencao pertence a UM contexto. Com as duas colunas preenchidas, a
  -- foto do achador entraria na ficha de um pet; com nenhuma, ela e um objeto
  -- pago no bucket que nenhuma linha alcanca.
  ADD CONSTRAINT upload_intents_um_contexto_so
    CHECK (num_nonnulls(pet_id, found_report_id) <= 1),

  ADD CONSTRAINT upload_intents_foto_de_achado_tem_aviso
    CHECK (kind <> 'found_report_photo' OR found_report_id IS NOT NULL);

CREATE INDEX upload_intents_do_achado ON upload_intents (found_report_id)
  WHERE found_report_id IS NOT NULL;

-- ----------------------------------------------------------------------
-- 5. `match_candidates`: a tabela onde "sugerir" e diferente de "afirmar"
-- ----------------------------------------------------------------------
--
-- Esta tabela e o criterio 7 da BICHUS-35 escrito em DDL. A regra e a ultima
-- frase da secao 4.10: "ele SUGERE, e toda correspondencia passa por decisao
-- humana do tutor -- e a mesma regra que protege contra o falso achador, e ela
-- nao tem excecao nem para score alto".
--
-- Um falso positivo aqui manda uma tutora atras do cao errado. Entao a
-- confirmacao humana nao pode ser um `if` no servico: ela e
-- `match_candidates_decisao_tem_autor`, abaixo. Um cruzamento que tentasse
-- gravar `status = 'confirmed'` nao tem `decided_by_user_id` para por na linha,
-- porque ele nao tem usuario nenhum -- e o Postgres recusa com 23514.
--
-- Inverter isso exigiria o cruzamento inventar um usuario decisor, que e uma
-- coisa que ninguem escreve por engano.

CREATE TABLE match_candidates (
  id               uuid        PRIMARY KEY,

  -- CASCADE nos dois lados: um candidato e uma SUGESTAO sobre um par, e sem um
  -- dos lados ela nao e nada. E diferente de `found_reports.case_id`, que e o
  -- relato em si e sobrevive ao caso.
  case_id          uuid        NOT NULL REFERENCES lost_cases (id) ON DELETE CASCADE,
  found_report_id  uuid        NOT NULL REFERENCES found_reports (id) ON DELETE CASCADE,

  -- 0 a 1, com tres casas. `numeric` e nao `double precision`: o corte de 0,45
  -- e uma fronteira de produto, e comparar fronteira com binario flutuante faz
  -- um score de 0,45 cair dos dois lados dependendo de como ele foi somado.
  score            numeric(4, 3) NOT NULL
                                 CONSTRAINT match_candidates_score_normalizado
                                 CHECK (score >= 0 AND score <= 1),

  -- O que pontuou, atributo a atributo. Existe para a tela poder dizer POR QUE
  -- aquele animal apareceu: "mesmo porte, mesma cor, a 800 m" convence ou
  -- desconvence uma pessoa, e um numero de 0 a 1 sozinho nao faz nem uma coisa
  -- nem outra.
  matched_attributes jsonb     NOT NULL DEFAULT '{}'::jsonb,

  -- Nulo quando algum dos dois lados nao tem coordenada -- e nesse caso o peso
  -- da proximidade e redistribuido, secao 4.10.
  distance_m       integer     CONSTRAINT match_candidates_distancia_nao_negativa
                               CHECK (distance_m IS NULL OR distance_m >= 0),

  link_origin      text        NOT NULL
                               CONSTRAINT match_candidates_origem_do_vinculo
                               CHECK (link_origin IN ('attribute_match', 'share_token')),

  -- Qual versao da regra produziu esta linha. Sem ela ninguem consegue explicar
  -- por que um candidato antigo tem o score que tem, e mudar peso ou limiar
  -- passa a reescrever a historia.
  strategy_version text        NOT NULL,

  status           text        NOT NULL DEFAULT 'suggested'
                               CONSTRAINT match_candidates_status
                               CHECK (status IN ('suggested', 'confirmed', 'rejected')),

  decided_by_user_id uuid      REFERENCES users (id) ON DELETE SET NULL,
  decided_at       timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),

  -- **A confirmacao humana, no banco.** Sair de `suggested` exige uma pessoa e
  -- um instante; continuar em `suggested` exige que nao haja nenhum dos dois.
  -- A segunda metade importa tanto quanto a primeira: sem ela, uma linha
  -- decidida poderia ser devolvida a `suggested` mantendo o autor da decisao
  -- anterior, e a trilha passaria a mentir sobre quem decidiu o que.
  CONSTRAINT match_candidates_decisao_tem_autor
    CHECK (
      (status = 'suggested'
         AND decided_by_user_id IS NULL AND decided_at IS NULL)
      OR
      (status IN ('confirmed', 'rejected')
         AND decided_by_user_id IS NOT NULL AND decided_at IS NOT NULL)
    ),

  -- Reprocessar nao duplica (secao 4.10, "Idempotencia").
  CONSTRAINT match_candidates_par_unico UNIQUE (case_id, found_report_id)
);

COMMENT ON TABLE match_candidates IS
  'BICHUS-35 criterio 7: o cruzamento SUGERE. match_candidates_decisao_tem_autor e a confirmacao humana escrita em DDL -- sair de suggested exige uma pessoa e um instante, e o cruzamento nao tem nem um nem outro.';

COMMENT ON COLUMN match_candidates.score IS
  'De 0 a 1 pela tabela de pesos da secao 4.10 de docs/03-arquitetura.md. Vira candidato a partir de 0,45. numeric e nao double: o corte e fronteira de produto e binario flutuante faz a fronteira cair dos dois lados.';

COMMENT ON COLUMN match_candidates.link_origin IS
  'share_token quando o vizinho chegou pelo push e disse "vi este pet" (criterio 10): score 1,0, sem cruzamento -- e ainda assim suggested, porque a confirmacao humana nao tem excecao.';

-- "Os 10 candidatos daquele caso, por score decrescente" e a unica leitura de
-- volume desta tabela.
CREATE INDEX match_candidates_do_caso ON match_candidates (case_id, score DESC, created_at DESC);

-- "Este achado ja e candidato em que casos?" -- usado ao recalcular e ao
-- resolver os demais quando um caso encerra como `reunited`.
CREATE INDEX match_candidates_do_achado ON match_candidates (found_report_id);

-- Down Migration

DROP TABLE IF EXISTS match_candidates;

DROP INDEX IF EXISTS upload_intents_do_achado;
ALTER TABLE upload_intents
  DROP CONSTRAINT IF EXISTS upload_intents_foto_de_achado_tem_aviso,
  DROP CONSTRAINT IF EXISTS upload_intents_um_contexto_so,
  DROP COLUMN IF EXISTS found_report_id;

DROP INDEX IF EXISTS found_reports_retencao;
DROP INDEX IF EXISTS found_reports_abertos_por_especie;
DROP INDEX IF EXISTS found_reports_do_relator;
DROP INDEX IF EXISTS found_reports_por_lugar;

ALTER TABLE found_reports
  DROP CONSTRAINT IF EXISTS found_reports_avulso_tem_prazo,
  DROP CONSTRAINT IF EXISTS found_reports_texto_de_raca_acompanha_codigo,
  DROP CONSTRAINT IF EXISTS found_reports_avulso_tem_atributos,
  DROP CONSTRAINT IF EXISTS found_reports_avulso_tem_onde,
  DROP CONSTRAINT IF EXISTS found_reports_avulso_tem_conta,
  DROP CONSTRAINT IF EXISTS found_reports_scan_tem_token;

-- O `down` REPROVA se algum aviso avulso tiver sido gravado: sem token, essas
-- linhas nao cabem no `NOT NULL` que volta. Deixar o `ALTER` falhar e o
-- comportamento certo -- preencher com um token inventado para o comando passar
-- gravaria uma credencial falsa em cada linha, e credencial falsa no banco e
-- pior que uma migracao que nao desce.
ALTER TABLE found_reports ALTER COLUMN finder_token_expires_at SET NOT NULL;
ALTER TABLE found_reports ALTER COLUMN finder_token_hash       SET NOT NULL;

ALTER TABLE found_reports
  DROP COLUMN IF EXISTS retention_until,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS photo_upload_id,
  DROP COLUMN IF EXISTS found_state,
  DROP COLUMN IF EXISTS found_neighborhood,
  DROP COLUMN IF EXISTS found_city,
  DROP COLUMN IF EXISTS found_point,
  DROP COLUMN IF EXISTS ref_data_version,
  DROP COLUMN IF EXISTS primary_color_code,
  DROP COLUMN IF EXISTS breed_free_text,
  DROP COLUMN IF EXISTS breed_code,
  DROP COLUMN IF EXISTS sex,
  DROP COLUMN IF EXISTS size,
  DROP COLUMN IF EXISTS species,
  DROP COLUMN IF EXISTS case_id;
