-- A leitura do diretorio de `Perto` ganha endereco publico e marco de
-- publicacao.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a rota de leitura do diretorio
-- nao tem como devolver um identificador. `professionals.id` e UUID interno e o
-- ADR-0010 item 6 o proibe em saida publica; sem `slug` a lista sai sem chave
-- estavel e nenhuma tela de detalhe pode nascer.
--
-- ELA NAO E UMA IDEIA NOVA. As mudancas abaixo estao pedidas, uma a uma e com
-- o motivo, na secao "O QUE FALTA NO BANCO PARA ESTA PROPOSTA COMPILAR" de
-- `api/diretorio.proposta.yaml` (branch `docs/contrato-do-backoffice-do-diretorio`).
-- Esta migracao e a execucao daquela lista, e nao uma quarta opiniao sobre o
-- modelo. Duas das tres entraram; a terceira NAO, e o motivo esta medido mais
-- abaixo.
--
-- O QUE ELA NAO FAZ, E A AUSENCIA E DELIBERADA:
--
-- - **Nao cria valor para ONG.** `professionals.kind` continua com os seis
--   valores de 21/09 e `professionals` continua sem `entity_kind`. Uma ONG nao
--   tem onde ser uma linha hoje, e resolver isso com um valor a mais numa lista
--   fechada decidiria por conta propria se ONG e um tipo de profissional --
--   que e exatamente a pergunta aberta. Fica como esta ate a decisao.
-- - **Nao cria `professional_invitations` nem `professional_reviews`.** As duas
--   continuam sendo migracao futura CONHECIDA (ADR-0011 secao 5.4).
-- - **Nao toca em nenhuma coluna existente.** So `ADD COLUMN` anulavel, indice
--   e comentario. Nenhum `DROP`, nenhum `ALTER ... TYPE`.
--
-- SOBRE O `down`: ele apaga as duas colunas novas. Isso e reversao enquanto
-- nenhuma entrada tiver endereco divulgado; depois disso derrubar `slug` quebra
-- todo link ja compartilhado, que e perda e nao volta atras.

-- Up Migration

-- ---------------------------------------------------------------------------
-- slug -- o endereco publico, no lugar do UUID
-- ---------------------------------------------------------------------------
-- Formato e unicidade COPIADOS de `pets.slug` (migracao 20260917000006), e nao
-- escolhidos de novo: os dois sao endereco publico do mesmo produto, e dois
-- formatos diferentes para a mesma coisa e o defeito que a duplicacao produz.
ALTER TABLE professionals
  ADD COLUMN slug text
    CONSTRAINT professionals_slug_formato
    CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- Unicidade GLOBAL sobre nao-nulo, e nao so entre publicados. A proposta dizia
-- "unico entre publicados"; a diferenca aparece no dia em que duas entradas em
-- rascunho nascem com o mesmo endereco e a segunda falha AO PUBLICAR, que e o
-- pior momento possivel para descobrir um conflito de nome. Unico desde o
-- rascunho move a recusa para quem esta cadastrando, com o cadastro na tela.
CREATE UNIQUE INDEX professionals_slug_unico ON professionals (slug)
  WHERE slug IS NOT NULL;

COMMENT ON COLUMN professionals.slug IS
  'O endereco publico da entrada. Existe porque `id` e UUID interno e o ADR-0010 item 6 o proibe em saida publica. Mesmo formato de `pets.slug`.';

-- ---------------------------------------------------------------------------
-- published_at -- desde quando esta no ar
-- ---------------------------------------------------------------------------
-- `created_at` responde "quando a linha nasceu" e `updated_at` responde "quando
-- alguem mexeu". Nenhum dos dois responde "desde quando esta no ar", e um
-- perfil pode nascer em rascunho e ser publicado meses depois.
ALTER TABLE professionals ADD COLUMN published_at timestamptz;

COMMENT ON COLUMN professionals.published_at IS
  'Desde quando a entrada esta no ar. Nulo enquanto status <> ''published''. Nao e created_at: perfil nasce rascunho e pode ser publicado meses depois.';

-- ---------------------------------------------------------------------------
-- A TERCEIRA MUDANCA QUE A PROPOSTA PEDIA NAO ENTROU, E O MOTIVO E MEDIDO
-- ---------------------------------------------------------------------------
-- `api/diretorio.proposta.yaml` pedia um `COMMENT ON COLUMN` marcando o
-- titular da entrada com `NUNCA sai do servidor`, pelo mesmo raciocinio que
-- ja vale para quem convidou: as duas colunas ligam uma entrada do diretorio a
-- uma conta de pessoa, e a BICHUS-174 proibe expor vinculo entre duas pessoas.
--
-- O raciocinio esta certo e a execucao nao cabe, por uma razao que so aparece
-- rodando o portao. `src/tools/portao-colunas-que-nao-saem.ts` procura o NOME
-- LITERAL da coluna marcada em **todo** `.ts` e `.mjs` de `src/`, comentario
-- inclusive, e dispensa exatamente dois arquivos (ele mesmo e o teste dele).
--
-- MEDIDO em 22/09/2026, com o comentario aplicado:
--
--   REPROVADO -- 9 saida(s) indevida(s):
--     src/bin/seed.ts:174: <titular> ...
--     src/shared/db/schema.ts:763: ...
--     (e mais sete, quase todas em comentario)
--
-- A linha do `seed` e a que decide: **semear a massa do diretorio PRECISA
-- escrever essa coluna.** O mesmo vale para o fluxo de aceite do convite, que
-- e justamente o que a emenda 1 do ADR-0011 manda existir. Uma marca que torna
-- a ESCRITA inexprimivel nao protege a SAIDA: ela proibe a coluna.
--
-- Quem convidou nao tem esse problema porque nenhuma escrita a toca hoje --
-- e e por isso que a marca funciona la e nao funciona aqui.
--
-- A saida NAO e dispensar `seed.ts` nem `schema.ts` no portao: isso o
-- desligaria para toda coluna marcada, presente e futura. A saida e o portao
-- passar a distinguir "escrita para o banco" de "saida para o cliente", e isso
-- e mudanca no portao, nao nesta migracao. Fica registrado como pendencia
-- CONHECIDA, com a medicao junto, em vez de virar um `COMMENT` que alguem
-- remove daqui a duas semanas sem saber por que ele estava la.
--
-- Enquanto isso, a protecao de saida do titular e estrutural e nao declarativa:
-- a coluna nao esta na interface `ProfessionalsTable` (ver o comentario la) e
-- nao esta em nenhuma consulta de leitura do diretorio. O que nao e
-- selecionado nao vaza.

-- Down Migration

DROP INDEX professionals_slug_unico;
ALTER TABLE professionals DROP COLUMN published_at;
ALTER TABLE professionals DROP COLUMN slug;
