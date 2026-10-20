-- QUAIS PAGINAS PUBLICAS DO SITE EXISTEM DE VERDADE -- e por que isto e uma
-- tabela, e nao uma variavel de ambiente nem um `--dart-define`.
--
-- ====================================================================
-- O QUE FOI MEDIDO EM 20/10/2026, E QUE ESTA TABELA EXISTE PARA CONTER
-- ====================================================================
--
-- O cliente pediu uma acao de compartilhar o pet perdido. O link que o produto
-- tem para compartilhar e `share_url`, montado por `linksDoCaso()` em
-- `lostfound/domain/projecao-publica-do-caso.ts`, e ele aponta para
-- `{WEB_BASE_URL}/p/{shareToken}`. MEDIDO, de fora, nos dois ambientes:
--
--   GET https://hml.bichu.app/p/<token>  -> 404
--   GET https://bichu.app/p/<token>      -> 404
--   GET https://bichu.app/cartaz/<token> -> 404
--
-- E `web/src/pages/` nao tem diretorio `p/` nem `cartaz/`: a pagina nao existe,
-- e nenhuma branch de `origin` a tem em andamento. O backend que a alimentaria
-- existe e responde 200 (`GET /v1/public/lost-cases/{shareToken}`) -- o que
-- falta e a PAGINA.
--
-- O que isso produz, se a acao de compartilhar sair assim: quem cola o link num
-- grupo de bairro recebe um cartao de pre-visualizacao que diz, com estas
-- letras (medido no HTML que o 404 serve hoje):
--
--   og:title       = Pagina nao encontrada · Bichu
--   og:description = Esta pagina nao existe no site do Bichu.
--
-- Ou seja: a melhor parte do compartilhamento nao e so perdida -- ela e
-- substituida por uma afirmacao de que o pet nao existe. O cliente decidiu
-- *"desenvolve a sua parte e criamos a versao web depois"*, e a condicao e que
-- a acao nasca DESLIGADA e acenda **sem APK novo e sem deploy da API**.
--
-- ====================================================================
-- POR QUE TABELA, E NAO AMBIENTE -- os mesmos tres motivos de `app_version_policy`
-- ====================================================================
--
-- Esta tabela e irma de `app_version_policy` (migracao `20261019000007`) e
-- repete o raciocinio dela de proposito, porque o problema e o mesmo:
--
-- 1. **Trocar o valor em `.env` exigiria reiniciar a API.** `loadAppConfig()` le
--    o ambiente UMA VEZ, na subida. O dia em que a pagina for ao ar e um dia de
--    publicacao, e derrubar e subir a API para acender um interruptor e o
--    oposto de "sem deploy".
-- 2. **`--dart-define` exigiria APK novo**, que o cliente recusou nominalmente:
--    o binario instalado nao se corrige, e a data em que a pagina sobe nao e
--    conhecida quando o APK e compilado -- exatamente o argumento de
--    `app_version_policy.store_url`.
-- 3. **O `.env` de homologacao tem 68 variaveis e nao se reescreve as pressas.**
--    `UPDATE` de uma coluna nao tem como estragar as outras 67.
--
-- Isto NAO e segredo e nao vai para o Secret Manager (ADR-0022): e configuracao
-- de produto, e o efeito dela sai em resposta de API, de proposito.
--
-- ====================================================================
-- AS LINHAS NASCEM COM O INTERRUPTOR DESLIGADO
-- ====================================================================
--
-- `is_published` nasce `false` nas duas linhas, porque hoje **e** falso: medido
-- acima. Uma migracao que semeasse `true` ligaria a acao no instante em que
-- rodasse, publicando um link morto para quem ja tem o APK instalado.
--
-- As linhas EXISTEM (em vez de a tabela nascer vazia) pelo mesmo motivo de
-- operacao da tabela irma: quem abre `SELECT * FROM site_page_availability;` as
-- pressas precisa VER onde se escreve, e nao adivinhar o nome das colunas e os
-- valores validos de `page`.
--
-- COMO SE ACENDE, no dia em que a pagina do caso for ao ar (API de pe, sem
-- reinicio, sem APK):
--
--   UPDATE site_page_availability
--      SET is_published = true, updated_by = 'quem publicou'
--    WHERE page = 'lost_case';
--
-- COMO SE APAGA DE VOLTA, se a pagina sair do ar ou voltar quebrada:
--
--   UPDATE site_page_availability SET is_published = false WHERE page = 'lost_case';
--
-- A AUSENCIA LIBERA? NAO -- AQUI ELA ESCONDE, E E O CONTRARIO DA TABELA IRMA
-- ====================================================================
--
-- Em `app_version_policy` toda forma de ausencia (coluna nula, linha apagada,
-- tabela inalcancavel) **libera o uso**, porque o erro caro la e trancar a base
-- inteira fora do produto. Aqui o erro caro e o oposto: publicar um link morto
-- em grupos de bairro nao se desfaz com um `UPDATE` -- a mensagem ja saiu do
-- nosso dominio, como o push do `conteudo-do-push.ts`. Entao:
--
--   linha ausente, `is_published` falso, tabela inalcancavel  ->  ESCONDIDO.
--
-- E a assimetria esta escrita na porta (`ports/disponibilidade-da-pagina.ts`) e
-- provada em teste, e nao deduzida de uma leitura de SQL: so `true` explicito
-- acende. `is_published` e `NOT NULL` por isso -- nulo seria um terceiro estado
-- que alguem leria como "talvez", e nao existe "talvez" neste interruptor.
--
-- ====================================================================
-- DUAS LINHAS, E NAO UMA
-- ====================================================================
--
-- `/p/{shareToken}` e `/cartaz/{shareToken}` sao DUAS paginas do site (ADR-0017,
-- quadro das oito rotas) e as duas dao 404 hoje. Uma linha so forcaria o dia em
-- que a pagina do caso subisse e o cartaz nao a mentir sobre uma das duas --
-- e e `poster_url` que vai parar em papel colado em poste, que nao se corrige.
--
-- ====================================================================
-- NENHUM `CHECK` EXISTENTE E REESCRITO
-- ====================================================================
--
-- Esta migracao so CRIA. Nao toca restricao, coluna nem tabela preexistente,
-- entao nao ha dado preexistente sobre o que provar `BEGIN`/`ROLLBACK`.

-- Up Migration

CREATE TABLE site_page_availability (
  -- A pagina e a chave. O dominio e fechado no `CHECK` porque a mao humana
  -- escreve aqui: `'lost-case'`, `'p'` e `'LOST_CASE'` sao recusados no
  -- `UPDATE`, com a configuracao anterior intacta e a API de pe.
  page text PRIMARY KEY
    CONSTRAINT site_page_availability_page_check CHECK (page IN ('lost_case', 'poster')),

  -- A pagina existe e serve 200 com as marcas de Open Graph? **Somente `true`
  -- explicito acende.** `NOT NULL DEFAULT false` de proposito: ver a secao da
  -- assimetria no cabecalho.
  is_published boolean NOT NULL DEFAULT false,

  -- Quem mexeu e quando. Nao e auditoria (a trilha vive em `audit.events`); e o
  -- minimo para quem chega depois saber a quem perguntar. Texto livre porque
  -- quem escreve esta no `psql`, nao num painel, e nao tem conta a que se
  -- vincular -- mesma decisao de `app_version_policy.updated_by`.
  updated_by text
    CONSTRAINT site_page_availability_updated_by_check CHECK (length(updated_by) <= 120),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE site_page_availability IS
  'Quais paginas publicas do site existem de verdade. ACENDER a acao de compartilhar: UPDATE site_page_availability SET is_published = true WHERE page = ''lost_case''; Linha ausente, false ou tabela inalcancavel ESCONDEM a acao -- o contrario de app_version_policy, e de proposito: link morto num grupo de bairro nao se desfaz.';
COMMENT ON COLUMN site_page_availability.is_published IS
  'A pagina serve 200 com og:title/og:description/og:image? Somente true explicito faz o app oferecer o compartilhamento.';

-- As duas linhas, DESLIGADAS, porque desligado e o estado medido em 20/10/2026.
-- `ON CONFLICT DO NOTHING` nao esta aqui: a tabela acabou de nascer, e conflito
-- seria sinal de que esta migracao rodou duas vezes -- coisa que precisa
-- estourar, nao coisa que se engole.
INSERT INTO site_page_availability (page, updated_by)
VALUES ('lost_case', 'migracao 20261020000005'),
       ('poster', 'migracao 20261020000005');

-- Down Migration

DROP TABLE site_page_availability;
