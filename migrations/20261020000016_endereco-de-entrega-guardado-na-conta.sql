-- O ENDERECO DE ENTREGA GUARDADO NA CONTA: uma linha por usuario, reusada em
-- todo pedido de plaquinha e editavel num lugar so.
--
-- ====================================================================
-- A AUTORIZACAO DESTA TABELA, COM A DATA E AS PALAVRAS DELE
-- ====================================================================
--
-- **O ADR-0011 secao 5.5 proibe acrescentar tabela "sem voltar aqui".** Ele
-- voltou. Em **21/10/2026** o cliente escolheu esta opcao entre tres que lhe
-- foram apresentadas, e escolheu com estas palavras:
--
--     "Endereco guardado de verdade -- um endereco de entrega salvo na conta,
--      reusado em todo pedido e editavel num lugar so."
--
-- Este paragrafo existe porque a proibicao do ADR e real e a autorizacao e
-- posterior a ela. Quem ler este arquivo sem o registro acima vai concluir que
-- alguem criou tabela por conta propria, e vai estar errado. **A decisao e
-- dele, a data e 21/10/2026, e a frase e a de cima.**
--
-- ====================================================================
-- POR QUE A TABELA, E NAO UMA COLUNA EM `users`
-- ====================================================================
--
-- O endereco sao NOVE campos. Nove colunas em `users` fariam a tabela mais
-- lida do produto carregar dado pessoal que quase nenhuma leitura dela quer:
-- toda consulta de `users` passaria a tocar residencia, e o jeito de nao
-- projetar por descuido passaria a ser lembrar de nao projetar. Tabela
-- separada inverte o padrao -- quem quer o endereco faz `JOIN`, e quem nao
-- faz nao o tem em maos.
--
-- ====================================================================
-- `user_reference_locations` NAO SERVE DE CASA PARA ISTO, E O MOTIVO E MEDIDO
-- ====================================================================
--
-- A tentacao obvia era reaproveitar a regiao de referencia do perfil
-- (`Me.reference_area`). **Nao serve, por duas razoes e nenhuma delas e
-- estetica:**
--
-- 1. **Ela nao tem os campos.** `Me.reference_area` e CEP, bairro, cidade e
--    UF -- sem logradouro, sem numero e sem complemento. Um endereco de
--    entrega sem rua e sem numero nao entrega nada;
-- 2. **Ela alimenta calculo de distancia e `pending_profile_fields`.** Por o
--    endereco de CASA ali seria por residencia dentro de um campo cujo
--    proposito e dizer "perto de voce", e cujo preenchimento a tela cobra com
--    um aviso de cadastro incompleto. Isso **vaza residencia para calculo de
--    distancia**, que e exatamente o que a ADR-0006 e o ADR-0010 nao querem.
--
-- Entao o endereco guardado e uma coisa, a regiao de referencia e outra, e a
-- primeira nunca e lida pela segunda. **Nenhuma coluna desta tabela entra em
-- consulta de raio, de proximidade ou de ordenacao por distancia.**
--
-- ====================================================================
-- ISTO E A RESIDENCIA DA PESSOA. SO O DONO LE.
-- ====================================================================
--
-- Este produto tem TRES enderecos, com TRES posturas, e confundi-los e o erro
-- grave aqui:
--
--   1. **profissional** -- comercial, **publico** (ADR-0011 secao 4): o perfil
--      e uma entidade que ACEITOU aparecer para ser contratada, e cidade,
--      bairro e telefone comercial sao o conteudo util dela;
--   2. **encontro** -- lugar publico, mas o LOGRADOURO fica atras de conta
--      (ADR-0027 item 21.2): sai so em `getNetworkEventLocation`, com
--      `bearerAuth`, e "nunca na agenda, no detalhe publico, no teaser nem nos
--      detalhes do privado";
--   3. **usuario** -- e esta tabela -- **RESIDENCIA. So o dono le.** Nunca
--      projecao publica, nunca calculo de distancia, nunca lista.
--
-- As consequencias disso, nesta tabela:
--
-- - **A autorizacao mora na clausula `WHERE`.** `user_id` e a chave primaria,
--   e toda leitura o compara com o chamador. Endereco de outra conta nao
--   existe: ausencia vira 404, nunca 403 (ADR-0021);
-- - **Nenhum identificador interno sai** (ADR-0010 item 6). Esta tabela **nao
--   tem coluna `id`**, e a ausencia e deliberada: a chave e `user_id`, o
--   recurso e singular (`/v1/me/delivery-address`) e nao ha identificador
--   nenhum para por em caminho de rota. Nao ha `ref` aqui porque nao ha nada a
--   referenciar de fora;
-- - **Nada e geocodificado** (ADR-0006). Nao ha `lat`, nao ha `lon`, nao ha
--   `geography` e nao ha indice espacial. O CEP continua sendo resolvido NO
--   APP, por servico publico, e o que chega aqui e TEXTO ja digitado -- o
--   servidor nao participa da busca e nao sabe se ela aconteceu;
-- - **Nao entra na trilha de auditoria.** Nenhum campo desta tabela e copiado
--   para `audit.events`, nem em `before`, nem em `after`, nem em `metadata`.
--   E a MESMA regra que a `20261017000012` fixou para o endereco do pedido, e
--   ela nao afrouxa por o endereco passar a ser reutilizavel.
--
-- ====================================================================
-- NAO HA APAGAMENTO POR PRAZO, E A AUSENCIA E UMA DECISAO DELE
-- ====================================================================
--
-- **Nao existe coluna de expiracao, nao existe varredura e nao existe
-- constante de prazo neste arquivo.** A decisao do cliente de **17/10/2026**,
-- citada em `media/application/varrer-envios-vencidos.ts`, e literal:
--
--     "voce so deve apagar as informacoes, caso o usuario remova o pet ou
--      delete a conta"
--
-- Entao o endereco sai com a CONTA, e e o `ON DELETE CASCADE` em `user_id`
-- que o tira -- integridade e retencao pela mesma clausula. Remover um PET nao
-- apaga este endereco, e nao deveria: ele e da conta e nao do pet, e quem tem
-- dois pets nao perde o endereco ao soltar um deles. O endereco do PEDIDO ja
-- cai com o pet, pelo `CASCADE` da `20261017000012`.
--
-- **E nao ha constante de prazo nem sem uso.** Ja houve neste projeto uma
-- constante de 30 dias que ninguem lia, e a existencia dela sozinha fez mais
-- de uma pessoa concluir que havia divida de implementacao. Numero de prazo
-- que nao e cobrado por ninguem e pior que numero nenhum.
--
-- ====================================================================
-- AS TRAVAS SAO AS MESMAS DA `20261017000012`, DE PROPOSITO
-- ====================================================================
--
-- Cada `CHECK` abaixo e, caractere por caractere, a mesma forma que
-- `collar_tag_requests` ja cobra para o mesmo campo. **Isso nao e copia por
-- preguica: e a condicao para o endereco guardado poder PREENCHER o pedido.**
-- Se esta tabela aceitasse um `street_number` de 30 simbolos, o endereco
-- guardado nasceria capaz de produzir um pedido que o banco recusa, e a pessoa
-- descobriria isso no botao de pedir.
--
-- O contrato segue a mesma logica e por isso **nao ha schema novo de endereco
-- no `api/openapi.yaml`**: `DeliveryAddress` serve as duas superficies. Uma
-- segunda redacao do mesmo endereco seria a segunda fonte para divergir.
--
-- `complement` e a UNICA opcional, como la: casa sem complemento e o caso
-- comum, e ela e a excecao declarada e nao um campo que ficou de fora.
--
-- **Nenhuma lista de UF aqui**, pelo mesmo motivo da `20261017000012`: o
-- conjunto das 27 siglas vive no app (`app/lib/api/estados_brasileiros.dart`)
-- e um `CHECK IN (...)` criaria a segunda fonte. O formato e o que o banco
-- sabe cobrar; o conjunto e do app.

-- Up Migration

CREATE TABLE user_delivery_addresses (
  -- A CHAVE E A CONTA, e com isso "um endereco por conta" nao e regra de
  -- aplicacao: e a forma da tabela. Sem indice parcial, sem coluna `id` e sem
  -- jeito de a mesma conta ter dois.
  --
  -- `ON DELETE CASCADE`: a retencao e esta clausula. Ver a secao sobre
  -- apagamento no cabecalho -- some com a conta, e por prazo nunca.
  user_id           uuid        PRIMARY KEY
                                REFERENCES users (id) ON DELETE CASCADE,

  -- Quem recebe, como vai na etiqueta. Guardado e nao derivado de
  -- `users.display_name`: quem pede pode estar mandando para a casa de outra
  -- pessoa, e o nome da conta nao e o nome de quem recebe.
  recipient_name    text        NOT NULL
                                CONSTRAINT user_delivery_addresses_recipient_tamanho
                                CHECK (char_length(recipient_name) BETWEEN 2 AND 120),

  -- E.164 do Brasil, a MESMA forma de `collar_tag_requests.recipient_phone` e
  -- de `users.phone_e164`. Nao e o telefone do perfil copiado: e o telefone de
  -- quem recebe a encomenda, que a transportadora costuma exigir.
  recipient_phone   text        NOT NULL
                                CONSTRAINT user_delivery_addresses_telefone_formato
                                CHECK (recipient_phone ~ '^\+55[0-9]{10,11}$'),

  -- OITO DIGITOS, sem mascara e sem hifen. Quem normaliza e a aplicacao, antes
  -- de gravar; guardar "01311-000" e "01311000" na mesma coluna daria dois
  -- enderecos iguais com dois valores diferentes.
  --
  -- **O CEP nao e resolvido aqui por ninguem** (ADR-0006): o banco nao sabe, e
  -- nao tem como saber, se o bairro confere com o CEP.
  postal_code       text        NOT NULL
                                CONSTRAINT user_delivery_addresses_cep_formato
                                CHECK (postal_code ~ '^[0-9]{8}$'),

  street            text        NOT NULL
                                CONSTRAINT user_delivery_addresses_logradouro_tamanho
                                CHECK (char_length(street) BETWEEN 2 AND 120),

  -- Texto, e nao inteiro: "s/n", "120A" e "KM 32" sao numeros de porta
  -- legitimos, e uma coluna inteira recusaria endereco que existe.
  street_number     text        NOT NULL
                                CONSTRAINT user_delivery_addresses_numero_tamanho
                                CHECK (char_length(street_number) BETWEEN 1 AND 20),

  complement        text        CONSTRAINT user_delivery_addresses_complemento_tamanho
                                CHECK (complement IS NULL OR char_length(complement) BETWEEN 1 AND 80),

  neighborhood      text        NOT NULL
                                CONSTRAINT user_delivery_addresses_bairro_tamanho
                                CHECK (char_length(neighborhood) BETWEEN 2 AND 80),

  city              text        NOT NULL
                                CONSTRAINT user_delivery_addresses_cidade_tamanho
                                CHECK (char_length(city) BETWEEN 2 AND 80),

  -- DOIS CARACTERES, e nenhuma lista de siglas aqui. Ver o cabecalho.
  state             text        NOT NULL
                                CONSTRAINT user_delivery_addresses_uf_tamanho
                                CHECK (char_length(state) = 2),

  -- Quando a pessoa salvou pela ultima vez. **Nao e carimbo de expiracao**, e
  -- nada o le para apagar nada: ele existe para quem opera o banco saber se a
  -- linha e de hoje ou de marco. O `PUT` o reescreve; nenhuma varredura o olha.
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_delivery_addresses IS
  'O endereco de entrega GUARDADO NA CONTA, uma linha por usuario (`user_id` e a chave primaria). Autorizado pelo cliente em 21/10/2026, nas palavras dele: "um endereco de entrega salvo na conta, reusado em todo pedido e editavel num lugar so" -- e essa decisao e o que destrava a proibicao de acrescentar tabela do ADR-0011 secao 5.5. CONTEM A RESIDENCIA DO USUARIO: so o dono le, a autorizacao mora na clausula WHERE (404 e nunca 403, ADR-0021), nao sai em nenhuma superficie publica, nao aparece em lista nenhuma, nao entra na trilha de auditoria e NAO alimenta calculo de distancia -- para isso existe `user_reference_locations`, que e outra coisa e nao tem logradouro. Nada aqui e geocodificado (ADR-0006). NAO HA APAGAMENTO POR PRAZO: a decisao do cliente de 17/10/2026 e "voce so deve apagar as informacoes, caso o usuario remova o pet ou delete a conta", e quem apaga e o ON DELETE CASCADE de `user_id`.';

COMMENT ON COLUMN user_delivery_addresses.user_id IS
  'O dono do endereco, e a CHAVE PRIMARIA: "um endereco por conta" e a forma da tabela e nao uma regra de aplicacao. E tambem a retencao -- ON DELETE CASCADE tira o endereco quando a conta sai, que e o unico apagamento que este endereco tem (cliente, 17/10/2026). Remover um PET nao o apaga: ele e da conta, e quem tem dois pets nao perde o endereco ao soltar um. Nao ha coluna `id` nesta tabela de proposito: o recurso e singular em `/v1/me/delivery-address` e nenhum identificador interno vai para caminho de rota (ADR-0010 item 6).';

COMMENT ON COLUMN user_delivery_addresses.postal_code IS
  'CEP com oito digitos, sem mascara. O app o usa para buscar rua/bairro/cidade/UF (ViaCEP, BrasilAPI de reserva) e preencher campos editaveis; o servidor nao participa da busca. Nada e geocodificado (ADR-0006) e o banco nao tem como conferir se o CEP bate com as demais colunas. MESMA forma de `collar_tag_requests.postal_code`, de proposito: o endereco guardado tem de poder preencher o pedido sem o banco recusar.';

COMMENT ON COLUMN user_delivery_addresses.recipient_phone IS
  'Telefone de quem recebe, em E.164 (`+55` e 10 ou 11 digitos). DADO PESSOAL: nao sai em superficie publica, nao aparece em lista e nao entra na trilha de auditoria. Nao e `users.phone_e164` copiado -- e o telefone de quem recebe a encomenda, que pode nao ser o dono da conta.';

COMMENT ON COLUMN user_delivery_addresses.state IS
  'UF em dois caracteres. O CONJUNTO das 27 siglas vive no app (`app/lib/api/estados_brasileiros.dart`), e nao aqui: um CHECK com as siglas seria a segunda fonte para divergir.';

COMMENT ON COLUMN user_delivery_addresses.updated_at IS
  'Quando a pessoa salvou pela ultima vez. NAO E CARIMBO DE EXPIRACAO e nada o le para apagar nada: nao existe varredura, nao existe prazo e nao existe constante de prazo nesta frente, por decisao do cliente de 17/10/2026. Ele existe para quem opera o banco saber a idade da linha.';

-- Down Migration

-- Descer APAGA o endereco que a pessoa digitou, e nao ha de onde recuperar: o
-- endereco do PEDIDO e uma copia do momento do pedido, nao a fonte. Mas aqui a
-- descida NAO reprova em voz alta, ao contrario da `20261018000004`, e a
-- diferenca e de que trabalho se perde: la era o rastreio digitado por quem
-- despachou e a chegada conferida por quem recebeu -- trabalho de operacao,
-- irrecuperavel e de terceiro. Aqui e a conveniencia do proprio dono, que ele
-- redigita no formulario do pedido como fazia antes desta migracao. Travar a
-- descida por isso deixaria um banco de desenvolvimento preso por um campo de
-- comodidade.
DROP TABLE user_delivery_addresses;
