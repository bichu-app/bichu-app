-- A entrada do diretorio de `Perto` ganha CEP, logradouro, numero e
-- complemento.
--
-- POR QUE ESTA MIGRACAO EXISTE, EM UMA FRASE: a decisao 9.2 de
-- `api/contrato-de-escrita-do-diretorio.md` ("endereco de rua e numero entra no
-- diretorio?") foi RESPONDIDA pelo cliente em 18/10/2026 -- *"pode colocar o
-- campo cep sim, ele e um usuario administrador, responsavel por cadastrar
-- varias informacoes publicas"* --, e ate agora nao havia onde guardar o que o
-- painel passa a coletar.
--
-- O QUE A DECISAO DO CLIENTE AUTORIZOU, E O QUE ELA NAO AUTORIZOU
--
-- Ele falou de QUEM PREENCHE, e nao de O QUE APARECE EM PUBLICO. As duas
-- coisas sao diferentes, e esta migracao cobre so a primeira:
--
-- - **o painel passa a poder gravar** CEP, logradouro, numero e complemento;
-- - **nenhuma saida ganhou campo novo.** `DirectoryEntrySummary` -- o cartao
--   que o aplicativo le em `Perto` -- continua com `city`, `state` e
--   `neighborhood` e mais nada de endereco. Quatro colunas gravadas e zero
--   colunas projetadas e proposital: exibir endereco completo e decisao do
--   cliente, e ela nao foi tomada.
--
-- O ADR-0010, no item 2 de "o que a rota publica jamais exibe", proibe
-- "endereco, CEP e numero de residencia" em `/t/<codigo>`, `/@<slug>`,
-- `/cartaz/<token>` e na listagem publica de perdidos. O diretorio EXIGE conta
-- e nao esta naquela lista, entao estas colunas nao o contrariam enquanto
-- ninguem as projetar -- e e por isso que o paragrafo acima esta aqui, do lado
-- das colunas, e nao num documento.
--
-- TODAS ANULAVEIS, E ISSO E A PARTE QUE IMPORTA PARA O PRODUTO
--
-- Um profissional autonomo -- adestrador, passeador, veterinario que atende em
-- casa -- costuma nao ter endereco comercial nenhum, e o "endereco" dele seria
-- a casa dele. Coluna obrigatoria o tornaria incadastravel, ou o obrigaria a
-- publicar onde mora. Nenhuma das quatro e `NOT NULL`, nenhuma entra em
-- `missing_to_publish`, e a entrada continua publicavel sem nenhuma delas.
--
-- O QUE ELA NAO FAZ, E CADA AUSENCIA E DELIBERADA:
--
-- - **Nao escreve `geo` e nao abre caminho para ela** (ADR-0006, decisao 9.4).
--   CEP vira TEXTO -- rua, bairro, cidade, UF --, nunca coordenada. O servico
--   de reserva (BrasilAPI) devolve `location.coordinates`, e o adaptador
--   `src/modules/addresses/adapters/external/` le quatro campos e ignora o
--   resto, de proposito.
-- - **Nao cria valor para ONG em `professionals.kind`** (decisao 9.1), nao cria
--   horario de funcionamento, foto, site nem rede social: nenhuma dessas
--   colunas existe, e inventa-las aqui seria decidir produto numa migracao.
-- - **Nao poe `CHECK` de completude de endereco.** Rua sem numero e caso real
--   (estrada, rodovia, quadra), e um `CHECK` que exigisse os dois juntos
--   reprovaria cadastro legitimo. Pelo mesmo motivo de `20261017000011`: um
--   `CHECK` novo sobre linha que ja existe reprova a migracao em qualquer
--   destino cuja linha nao o satisfaca.
-- - **Nao toca em nenhuma coluna existente.** So `ADD COLUMN` anulavel com
--   `CHECK` sobre a propria coluna, e `COMMENT`. Nenhum `DROP`, nenhum
--   `ALTER ... TYPE`, nenhum indice -- ninguem consulta o diretorio por CEP, e
--   indice sem consulta e peso de escrita de graca.
--
-- O FORMATO DO CEP E O DE `CollarTagShippingAddress.postal_code`, COPIADO DELE
--
-- Oito digitos, sem mascara e sem hifen (`^[0-9]{8}$`). A mascara vive na tela.
-- Dois formatos para o mesmo CEP no mesmo banco e o defeito que a duplicacao
-- produz, e o do pedido da plaquinha (20261017000012) chegou primeiro.
--
-- SOBRE O `down`: ele apaga as quatro colunas, e isso e PERDA DE DADO DO
-- CLIENTE depois do primeiro cadastro com endereco -- o painel e o unico lugar
-- que as escreve, e nada mais guarda esse texto. Reversao de verdade so
-- enquanto nenhuma entrada tiver endereco.

-- Up Migration

ALTER TABLE professionals
  ADD COLUMN postal_code text
    CONSTRAINT professionals_cep_oito_digitos
    CHECK (postal_code IS NULL OR postal_code ~ '^[0-9]{8}$');

COMMENT ON COLUMN professionals.postal_code IS
  'O CEP comercial da entrada, oito digitos sem mascara. Mesmo formato de collar_tag_requests.postal_code, copiado dele. Anulavel: profissional autonomo nao tem endereco comercial. NAO sai em DirectoryEntrySummary -- exibir endereco completo e decisao de produto que nao foi tomada.';

ALTER TABLE professionals
  ADD COLUMN street text
    CONSTRAINT professionals_logradouro_tamanho
    CHECK (street IS NULL OR char_length(street) BETWEEN 2 AND 120);

COMMENT ON COLUMN professionals.street IS
  'O logradouro comercial. Vem da busca de CEP (texto, nunca coordenada -- ADR-0006) e o administrador pode editar. Anulavel e NAO exigido para publicar.';

ALTER TABLE professionals
  ADD COLUMN street_number text
    CONSTRAINT professionals_numero_tamanho
    CHECK (street_number IS NULL OR char_length(street_number) BETWEEN 1 AND 20);

COMMENT ON COLUMN professionals.street_number IS
  'O numero da porta, TEXTO e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. Mesma decisao de collar_tag_requests.street_number.';

ALTER TABLE professionals
  ADD COLUMN complement text
    CONSTRAINT professionals_complemento_tamanho
    CHECK (complement IS NULL OR char_length(complement) BETWEEN 1 AND 80);

COMMENT ON COLUMN professionals.complement IS
  'Sala, andar, conjunto. Anulavel, como no endereco da plaquinha: estabelecimento sem complemento e o caso comum.';

-- Down Migration

ALTER TABLE professionals DROP COLUMN complement;
ALTER TABLE professionals DROP COLUMN street_number;
ALTER TABLE professionals DROP COLUMN street;
ALTER TABLE professionals DROP COLUMN postal_code;
