-- O SITE DA ENTRADA DO DIRETORIO (decisao do cliente de 21/10/2026).
--
-- ## POR QUE ISTO NAO E RECURSO NOVO: o dado JA CHEGA e e DESCARTADO
--
-- Este e o argumento que justifica a coluna, e ele foi MEDIDO, nao suposto.
--
-- `directory_suggestions` -- a fila de indicacao da comunidade, criada na
-- `20261017000004` -- guarda o contato publico em DUAS colunas:
--
--     contact_kind  text NOT NULL CHECK (contact_kind IN ('phone','website','instagram'))
--     contact_value text NOT NULL CHECK (char_length(contact_value) BETWEEN 3 AND 120)
--
-- Ou seja: **desde 17/10 qualquer pessoa pode indicar um estabelecimento
-- mandando o SITE dele**, e o servidor VALIDA esse site -- o caso de uso confere
-- `contact_value` contra `contact_kind` e, para `website`, passa pelo
-- `errosDoEnderecoCompleto` de `src/shared/url/endereco-completo.ts`.
--
-- E A APROVACAO NAO COPIA NADA. `criarEntradaDaIndicacao`
-- (`src/modules/professionals/application/fila-de-indicacoes.ts`) monta a
-- entrada nova e o UNICO contato que ela leva e o telefone, e so quando
-- `contact_kind = 'phone'`. Com `contact_kind = 'website'` o endereco
-- simplesmente **nao tem coluna de destino** e se perde: a indicacao e aprovada,
-- a entrada nasce rascunho sem canal nenhum, e o site que alguem digitou morre
-- na fila.
--
-- Entao a coluna nao esta abrindo um campo novo. Ela esta **dando destino a um
-- dado que o produto ja coleta, ja valida e hoje joga fora**.
--
-- ## O FORMATO: `https` so, e NAO SE NORMALIZA
--
-- O padrao de URL e decisao do cliente de 17/10/2026 e esta implementado em
-- `src/shared/url/endereco-completo.ts`, que e A AUTORIDADE. Resumo do que ele
-- cobra, e nao ha segunda definicao em lugar nenhum:
--
--   - `https://` obrigatorio. Esquema AUSENTE e **recusado** ("cobasi.com.br"
--     nao e aceito e nao e completado), com a frase que ensina: "Escreva o
--     endereco completo, comecando com https://.". `http://` recusa com "Troque
--     http:// por https://.".
--   - sem espaco, sem controle bidirecional, sem usuario:senha, sem literal de
--     IP, sem host local e sem host sem ponto.
--   - **NAO NORMALIZA**: o que a pessoa conferiu na tela e o que fica gravado.
--     Nao se acrescenta esquema, nao se tira `www`, nao se corta caminho nem
--     query. Normalizar seria gravar uma coisa diferente da que foi aprovada.
--
-- Guarda a URL INTEIRA, e nao o host. Esta e a diferenca deliberada em relacao
-- a `store_partners.host` (`20260922000023`), que guarda so o host porque lá o
-- destino e montado pelo app a partir de `target_path`. Aqui o site da clinica e
-- um endereco de terceiro que a tela ABRE como esta; cortar o caminho levaria
-- quem toca para a raiz de um dominio em vez da pagina que o estabelecimento
-- indicou.
--
-- ## O `CHECK` E SO DE TAMANHO, E ISSO E DELIBERADO
--
-- `CHECK (site_url IS NULL OR char_length(site_url) BETWEEN 9 AND 261)` --
-- numerico, **sem um unico literal de texto**.
--
-- POR QUE NAO HA REGEX AQUI, e a razao e um portao concreto:
-- `tests/integration/conjunto-exato-dos-checks.test.ts` le o CATALOGO
-- (`pg_constraint`) e exige registro escrito a mao, exato nos dois sentidos,
-- para todo `CHECK` que mencione literal de texto. Um `~ '^https://...'`
-- entraria nesse registro e passaria a existir em DOIS lugares -- o banco e o
-- arquivo de teste --, que divergiriam no dia em que o padrao mudasse. Faixa
-- numerica pura nao entra em registro nenhum, pela regra do cabecalho daquele
-- arquivo (e e por isso que `professionals_logradouro_tamanho` e os vizinhos
-- tambem estao fora dele).
--
-- **ESQUEMA E HOST FICAM NA APLICACAO**, onde ja estao e onde ha UMA definicao
-- so. O `CHECK` aqui e a rede embaixo dela: ele impede que um caminho que
-- ninguem previu grave texto absurdamente longo, e nada mais.
--
-- Os numeros: `261` e `'https://'.length + 253`, o mesmo teto que o contrato
-- declara e que `LIMITE_DO_SITE` espelha no painel. `9` e `'https://'` mais um
-- caractere -- o menor texto que o validador da aplicacao poderia aprovar.
--
-- ## O QUE ESTA MIGRACAO NAO FAZ
--
-- - **Nao mexe na regua de publicacao.** `phone_e164` continua sendo o canal
--   que a publicacao cobra, e o site NAO entra em
--   `AdminDirectoryEntryMissingField`. Transformar "ao menos um canal" numa
--   disjuncao (site OU telefone) e decisao de produto que NAO foi tomada; o
--   contrato ja prometia essa disjuncao "quando existir coluna", e a promessa
--   fica anotada lá como pendente em vez de cumprida por conta propria.
-- - **Nao copia os sites que ja estao na fila.** As indicacoes de
--   `contact_kind = 'website'` ja aprovadas perderam o dado no momento da
--   aprovacao e ele nao esta em `professionals` para ser recuperado; o que
--   existe em `directory_suggestions` continua lá, e passar a copiar vale para a
--   aprovacao de agora em diante, nao retroativamente.
-- - **Nao cria indice.** Ninguem filtra nem ordena por site.
--
-- ## SOBRE DADO QUE JA EXISTE
--
-- Coluna nova e anulavel: toda linha existente fica com `NULL`, que e o estado
-- "nao informou". Nao ha reescrita de linha e o `CHECK` entra VALIDADO -- `NULL`
-- satisfaz o primeiro ramo dele.

-- Up Migration

ALTER TABLE professionals
  ADD COLUMN site_url text
    CONSTRAINT professionals_site_tamanho
    CHECK (site_url IS NULL OR char_length(site_url) BETWEEN 9 AND 261);

COMMENT ON COLUMN professionals.site_url IS
  'O site do estabelecimento, a URL INTEIRA e nao o host (decisao do cliente de 21/10/2026). Opcional; NULL quer dizer "nao informou". Formato: https obrigatorio, esquema ausente RECUSADO (nunca completado), sem espaco, sem credencial, sem IP e sem host local -- a autoridade e src/shared/url/endereco-completo.ts (errosDoEnderecoCompleto com prefixo site_url), espelhada no painel por admin/src/endereco/enderecos.ts, e NAO HA segunda definicao. NAO E NORMALIZADA: o texto aprovado na tela e o texto gravado. O CHECK daqui e so de TAMANHO, de proposito: regex no banco entraria no registro de conjunto-exato-dos-checks.test.ts e viveria em dois lugares que divergiriam. Guarda a URL inteira ao contrario de store_partners.host, porque a tela ABRE este endereco como esta. NAO entra na regua de publicacao: phone_e164 segue o unico canal que missing_to_publish cobra. EXISTE porque directory_suggestions.contact_kind ja aceita website desde 17/10 e a aprovacao nao tinha onde copiar o valor -- o site chegava pela comunidade e se perdia.';

COMMENT ON CONSTRAINT professionals_site_tamanho ON professionals IS
  'So TAMANHO, e numerico: 261 = length(https://) + 253, e 9 = length(https://) + 1. Esquema, host e credencial sao conferidos na APLICACAO, onde ha uma definicao so. Sem literal de texto de proposito, para ficar fora do registro de conjunto-exato-dos-checks.test.ts.';

-- Down Migration

ALTER TABLE professionals
  DROP CONSTRAINT professionals_site_tamanho;

ALTER TABLE professionals
  DROP COLUMN site_url;
