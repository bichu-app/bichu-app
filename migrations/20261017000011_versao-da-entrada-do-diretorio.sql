-- A entrada do diretorio de `Perto` ganha `version`, para a escrita do painel
-- poder ser condicional.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: `/v1/admin/directory/entries`
-- passa a existir, e toda escrita administrativa deste produto exige
-- `If-Match` com a versao lida -- `professionals` e a UNICA tabela que o painel
-- escreve e que nao tem onde guardar essa versao.
--
-- O CARIMBO E O `ETag`, E NAO `updated_at`. A tentacao e emitir o `ETag` do
-- `updated_at` e evitar a coluna. Ela quebra de um jeito que nenhum teste
-- unitario pega: duas escritas no MESMO milissegundo produzem o mesmo
-- `updated_at`, e a segunda passa pela pre-condicao da primeira. `version` e
-- inteiro e cresce na propria clausula `WHERE`
-- (`... SET version = version + 1 WHERE id = $1 AND version = $2`), que e como
-- a `Loja` (`store_partners`, `store_items`) e a `Rede` (`network_events`) ja
-- fazem desde 28/09. Uma terceira forma de versionar no mesmo banco seria a
-- forma que diverge.
--
-- `NOT NULL DEFAULT 1` nao pode falhar por dado: a coluna nasce preenchida em
-- toda linha que existe, e as 12 linhas da massa do diretorio passam a valer
-- como "versao 1", que e exatamente o que elas sao -- ninguem as editou nunca,
-- porque ate hoje nao havia por onde.
--
-- O `CHECK (version > 0)` e copiado de `network_events` (20260928000001), e nao
-- escolhido de novo: `comoEtag` serializa o inteiro entre aspas e
-- `shared/http/if-match.ts` so reconhece `"[1-9][0-9]*"`. Versao zero seria uma
-- versao que o leitor de `If-Match` recusa como invalida, e a escrita
-- responderia 412 para sempre sem ninguem ter alterado nada.
--
-- O QUE ELA NAO FAZ, E CADA AUSENCIA E UMA DECISAO PENDENTE DO CLIENTE,
-- REGISTRADA NA SECAO 9 DE `api/contrato-de-escrita-do-diretorio.md`:
--
-- - **Nao acrescenta valor para ONG em `professionals.kind`.** Continuam os
--   seis valores de 21/09 (`vet`, `groomer`, `walker`, `sitter`, `trainer`,
--   `clinic`). A migracao `20260922000021` ja recusou isso com o motivo, e ele
--   nao mudou: um valor a mais na lista fechada DECIDIRIA por conta propria que
--   ONG e um tipo de profissional, que e justamente a decisao 9.1. Enquanto ela
--   nao for respondida, o painel cadastra estabelecimento (`clinic`) e
--   profissional, e nao cadastra ONG.
-- - **Nao cria endereco de rua** (decisao 9.2), **nao escreve `geo`**
--   (decisao 9.4), **nao cria horario de funcionamento, foto, site, e-mail nem
--   redes sociais**: nenhuma dessas colunas existe, e inventa-las aqui seria
--   decidir produto numa migracao.
-- - **Nao cria `CHECK` de completude da publicacao.** A `Loja` tem o seu
--   (`store_items_publicado_esta_completo`) e a tentacao e copiar. Ele NAO
--   entra aqui porque a massa publicada de hoje nasceu sob outra regua: um
--   `CHECK` novo sobre linha que ja existe reprova a migracao em qualquer
--   destino cuja linha nao o satisfaca, e descobrir isso no job de migracao de
--   hml e o pior momento. A completude e cobrada no caso de uso
--   (`diretorio-administrativo.ts`), que e quem sabe dizer QUAL campo falta.
--
-- SOBRE O `down`: ele apaga a coluna. Isso e reversao de verdade -- a versao e
-- derivada do uso e nao e dado do cliente --, mas toda escrita administrativa
-- do diretorio para de funcionar sem ela, porque `If-Match` deixa de ter o que
-- comparar.

-- Up Migration

ALTER TABLE professionals
  ADD COLUMN version integer NOT NULL DEFAULT 1
    CONSTRAINT professionals_versao_positiva CHECK (version > 0);

COMMENT ON COLUMN professionals.version IS
  'A versao para `If-Match`. Cresce na propria clausula WHERE do UPDATE, como em store_partners e network_events: ler, comparar e gravar em tres passos deixaria dois operadores passarem juntos pela comparacao.';

-- Down Migration

ALTER TABLE professionals DROP COLUMN version;
