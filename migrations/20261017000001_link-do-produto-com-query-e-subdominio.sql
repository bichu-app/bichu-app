-- O link do produto aceita query, fragmento e subdominio do parceiro.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: o cliente ficou **bloqueado**
-- tentando cadastrar um link de produto legitimo da Cobasi, e as duas razoes da
-- recusa estavam no banco, nao na aplicacao.
--
-- O link dele, por extenso:
--
--   https://www.cobasi.com.br/racao-granplus-performance-caes-senior-frango-e-peru-31197673/p?idsku=1197673
--
-- Duas coisas nele a `20260922000023` recusava:
--
--   1. `?idsku=1197673` -- o `CHECK` de `target_path` proibia `?` e `#`;
--   2. `www.` -- nao ha onde guardar o subdominio, porque a leitura compoe o
--      endereco com `store_partners.host`, que e `cobasi.com.br`.
--
-- ====================================================================
-- 1. QUERY E FRAGMENTO: A PROIBICAO ERA LARGA DEMAIS PARA O QUE PROTEGIA
-- ====================================================================
--
-- A `20260922000023` escreveu, e esta certa quanto ao risco: "parametro em link
-- de saida e onde dado pessoal vaza (consequencia 3 da BICHUS-185)". O que ela
-- errou foi o **instrumento**. Proibir `?` no banco nao impede dado pessoal de
-- viajar: impede *qualquer* parametro, e loja de verdade identifica SKU,
-- variacao e tamanho exatamente assim. `/p?idsku=1197673` nao e rastreio de
-- ninguem -- e o numero do produto no catalogo da Cobasi.
--
-- A consequencia 3 continua valendo e continua tendo dono: ela e sobre o que o
-- APLICATIVO acrescenta na saida, e isso e garantido onde sempre foi -- a tela
-- abre `target_url` como o servidor a mandou, sem acrescentar um parametro
-- sequer, e `app/test/telas/loja_abre_no_navegador_test.dart` reprova se algum
-- aparecer. O que o parceiro ja tinha na propria URL nunca foi o risco: ele e
-- publico, esta no site dele, e a pessoa chegaria nele digitando o nome do
-- produto no Google.
--
-- **Espaco em branco continua recusado**, e o caminho continua comecando em
-- `/`: isso nao e sobre privacidade, e sobre a coluna guardar um caminho e nao
-- uma frase.
--
-- ====================================================================
-- 2. `target_host`: O SUBDOMINIO, E POR QUE ELE E NULO NO CASO COMUM
-- ====================================================================
--
-- A `20260922000023` fez a juncao impor o host, e o ganho dela e real: um item
-- **nao tem como** apontar para fora do parceiro que declara, porque o host nao
-- vem do item. Esta migracao preserva esse ganho inteiro e so acrescenta a
-- excecao de que o mundo precisa: `www.cobasi.com.br` e `cobasi.com.br`.
--
-- `target_host` e **NULO quando o host e o do parceiro**, que e o caso comum. E
-- por isso que trocar o dominio de um parceiro continua sendo o `UPDATE` de uma
-- coluna so: as linhas com `NULL` acompanham sozinhas. So o item que mora num
-- subdominio carrega o proprio host, e so ele precisa de atencao numa troca de
-- dominio -- o que e verdade de qualquer jeito, porque `loja.parceiro.com.br`
-- nao vira `loja.outro.com.br` por deducao.
--
-- **O `CHECK` daqui so confere a FORMA do host** (o mesmo formato de
-- `store_partners.host`). O vinculo "e subdominio do parceiro" e conferido na
-- aplicacao (`errosDoDestino`), porque ele depende de OUTRA tabela e um `CHECK`
-- nao enxerga `store_partners`. A alternativa seria uma trigger, e trigger que
-- valida relacao entre tabelas e a regra que ninguem encontra quando ela
-- recusa. O que o banco garante aqui e o que o banco consegue garantir sozinho.
--
-- ATENCAO A QUEM FOR MEXER: a comparacao de subdominio na aplicacao e por
-- SUFIXO COM FRONTEIRA DE ROTULO (`host === alvo || host.endsWith('.' + alvo)`),
-- e nunca `endsWith` cru. `malcobasi.com.br` termina em `cobasi.com.br` e **nao
-- pode passar**; o ponto obrigatorio e o que separa um subdominio de um dominio
-- que so compartilha as ultimas letras. E a classe de defeito que esta
-- migracao nao consegue impedir, entao ela fica escrita aqui tambem.
--
-- ====================================================================
-- REVERSAO
-- ====================================================================
--
-- O `down` volta o `CHECK` antigo e derruba a coluna. Ele **falha de proposito**
-- se ja existir linha com `?`, `#` ou `target_host` preenchido: reverter com
-- dado novo no banco truncaria link de cliente em silencio, e um `down` que
-- apaga dado e pior que um `down` que recusa rodar.

-- Up Migration

ALTER TABLE store_items
  DROP CONSTRAINT store_items_destino_e_caminho;

-- O caminho, agora com `?` e `#`. Continua comecando em `/` e continua sem
-- espaco em branco: `[[:space:]]` cobre espaco, tabulacao e quebra de linha.
ALTER TABLE store_items
  ADD CONSTRAINT store_items_destino_e_caminho
  CHECK (target_path ~ '^/[^[:space:]]*$');

-- O host do destino, quando ele NAO e o do parceiro. Mesmo formato de
-- `store_partners.host`: so o host, minusculo, com pelo menos um ponto.
ALTER TABLE store_items
  ADD COLUMN target_host text
    CONSTRAINT store_items_destino_e_so_host
    CHECK (
      target_host IS NULL
      OR target_host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    );

COMMENT ON COLUMN store_items.target_path IS
  'O caminho do destino no site do parceiro, com query e fragmento quando a loja do parceiro os usa (link de SKU). Comeca em `/` e nao tem espaco. A proibicao de `?` que existia aqui ate 17/10/2026 bloqueava link legitimo de loja e nao protegia o que dizia proteger: o que o APLICATIVO acrescenta na saida e garantido na tela, nao nesta coluna.';
COMMENT ON COLUMN store_items.target_host IS
  'O host do destino quando ele e um SUBDOMINIO do parceiro (`www.cobasi.com.br` para o parceiro `cobasi.com.br`). NULO quando o host e o do proprio parceiro, que e o caso comum -- e e esse nulo que faz trocar o dominio de um parceiro continuar sendo o UPDATE de uma coluna so. O vinculo com o parceiro e conferido na aplicacao (`errosDoDestino`), por sufixo COM FRONTEIRA DE ROTULO: `malcobasi.com.br` nao e subdominio de `cobasi.com.br`.';

-- Down Migration

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM store_items WHERE target_host IS NOT NULL) THEN
    RAISE EXCEPTION 'ha item com target_host preenchido: reverter truncaria o subdominio do link e levaria a pessoa para outra pagina. Mova esses itens para o host do parceiro antes.';
  END IF;
  IF EXISTS (SELECT 1 FROM store_items WHERE target_path ~ '[?#]') THEN
    RAISE EXCEPTION 'ha item com query ou fragmento no caminho: reverter apagaria o identificador do produto no parceiro. Limpe esses caminhos antes.';
  END IF;
END
$$;

ALTER TABLE store_items
  DROP COLUMN target_host;

ALTER TABLE store_items
  DROP CONSTRAINT store_items_destino_e_caminho;

ALTER TABLE store_items
  ADD CONSTRAINT store_items_destino_e_caminho
  CHECK (target_path ~ '^/[^[:space:]?#]*$');
