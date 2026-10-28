-- O ENDERECO DE ENTREGA DO PET: uma linha por pet, lida pelo formulario da
-- plaquinha daquele pet e editavel dentro do cadastro dele.
--
-- ====================================================================
-- AS DUAS DECISOES DELE, COM AS DATAS E AS PALAVRAS -- E A DE 21/10 CAI
-- ====================================================================
--
-- **21/10/2026**, escolhendo entre tres opcoes apresentadas, e esta frase esta
-- citada literal no cabecalho da `20261020000016` e em
-- `app/lib/telas/pet/tela_solicitar_plaquinha.dart`:
--
--     "Endereco guardado de verdade -- um endereco de entrega salvo na CONTA,
--      reusado em todo pedido e editavel num lugar so."
--
-- **27/10/2026**, pedido dele:
--
--     "o endereco de entrega da plaquinha tem que estar dentro do cadastro do
--      pet"
--
-- A contradicao com 21/10 foi posta na mesa para ele, nomeada e datada, citando
-- a frase de cima. Ele respondeu:
--
--     "endereco um por pet"
--
-- **Entao a decisao de 21/10/2026 CAI e a de 27/10/2026 vale.** Este paragrafo
-- existe porque nao foi descuido dele: a decisao anterior estava em maos quando
-- a nova foi tomada. Quem ler `user_delivery_addresses` (que continua de pe,
-- logo abaixo) sem este registro vai concluir que existem duas fontes
-- concorrentes para o mesmo endereco, e vai estar errado -- **a fonte do pedido
-- e o PET.**
--
-- E o ADR-0011 secao 5.5 proibe acrescentar tabela "sem voltar aqui". Ele
-- voltou, duas vezes: em 21/10 para a tabela da conta e em 27/10 para esta.
--
-- ====================================================================
-- `user_delivery_addresses` NAO E APAGADA, E A AUSENCIA DE `DROP` E DECISAO
-- ====================================================================
--
-- A decisao do cliente de **26/10/2026** e *"nao apague nada"*. Entao:
--
-- - **a tabela da conta fica**, com as linhas que ja tem;
-- - **as rotas `/v1/me/delivery-address` ficam** (contrato e servidor);
-- - o que ela perde e o PAPEL: nenhum pedido de plaquinha le dela depois desta
--   migracao.
--
-- E ela e tambem a FONTE DA COPIA abaixo. Apagar a fonte tiraria o unico
-- registro de onde o endereco de cada pet veio.
--
-- ====================================================================
-- A COPIA, E A SUPOSICAO QUE ELA CARREGA -- declarada, nao escondida
-- ====================================================================
--
-- O endereco guardado na conta e COPIADO para TODOS os pets vivos daquela
-- conta. Isto e uma suposicao de quem implementou, **nao uma frase do
-- cliente**, e a razao e a propria razao dele de 21/10:
--
--     "que a pessoa nao redigite nove campos"
--
-- Deixar os pets vazios na virada obrigaria TODO tutor que ja havia guardado
-- endereco a redigitar nove campos no proximo pedido -- perdendo exatamente a
-- conveniencia que a decisao de 21/10 comprou, e perdendo-a como efeito colateral
-- de uma mudanca de modelo que ele nao pediu para sentir.
--
-- **Copiar para TODOS os pets, e nao para um:** nao existe, no banco nem no
-- contrato, nada que diga qual pet "merece" o endereco da conta -- nao ha pet
-- principal, nao ha ordem de preferencia e o endereco da conta nunca foi de um
-- pet. Escolher um (o mais antigo, o do ultimo pedido) seria inventar um
-- criterio e deixar os outros pets vazios por um motivo que ninguem decidiu.
-- Todos preenchidos com o MESMO endereco e exatamente o que o modelo da conta
-- entregava: o mesmo endereco servia a todo pedido, de qualquer pet.
--
-- E a copia **nao e irreversivel pelo tutor**: cada pet tem um `PUT` proprio, e
-- editar um nao toca os outros -- que e precisamente o "um por pet" que ele
-- pediu.
--
-- **So pet vivo** (`deleted_at IS NULL`). Pet excluido nao pede plaquinha, e
-- copiar residencia para linha que nenhuma leitura alcanca seria espalhar dado
-- pessoal sem destinatario. O indice `pets_do_tutor` da `20260917000006` ja
-- recorta a mesma coisa pelo mesmo motivo.
--
-- `status` NAO entra no recorte: pet `lost`, `deceased` ou `archived` continua
-- no cadastro, continua aparecendo para o tutor e nao perdeu o endereco dele.
--
-- ====================================================================
-- A CONTAGEM VAI PARA `audit.events`, PORQUE `NOTICE` NAO CHEGA A NINGUEM
-- ====================================================================
--
-- `node-pg-migrate` DESCARTA `RAISE NOTICE` e `RAISE WARNING`: quem roda
-- `make migrar` nao ve uma linha do que a migracao disse. Entao a unica forma
-- de alguem saber amanha quantas linhas esta copia produziu e a trilha, e e
-- para la que o numero vai -- sem nenhum campo de endereco dentro dele.
--
-- **Nenhum campo de endereco entra na trilha**, nem em `before`, nem em
-- `after`, nem em `metadata`: e a MESMA regra que a `20261017000012` fixou para
-- o endereco do pedido e a `20261020000016` para o da conta, e ela nao afrouxa
-- por o endereco mudar de dono. O que vai para a trilha sao CONTAGENS.
--
-- ====================================================================
-- ISTO CONTINUA SENDO A RESIDENCIA DA PESSOA. SO O TUTOR LE.
-- ====================================================================
--
-- Mudou de dono, nao de classe. Os tres enderecos deste produto e as tres
-- posturas seguem valendo, e o cabecalho da `20261020000016` os lista:
-- profissional e publico (ADR-0011 secao 4), o do encontro tem o logradouro
-- atras de conta (ADR-0027 item 21.2) e **este e RESIDENCIA**.
--
-- Nesta tabela:
--
-- - **A autorizacao mora na clausula `WHERE`**, e ela e um `JOIN` com `pets`:
--   `pet_id` e a chave primaria, e toda leitura confere `pets.owner_user_id`
--   contra o chamador. Pet de outra pessoa nao e recusado -- ele nao encontra
--   linha, e ausencia vira 404 e nunca 403 (ADR-0021);
-- - **Nenhum identificador novo sai** (ADR-0010 item 6). Esta tabela **nao tem
--   coluna `id`**: a chave e `pet_id`, o recurso e singular
--   (`/v1/pets/{petId}/delivery-address`) e o `petId` do caminho ja e o
--   identificador que `/v1/pets/{petId}` usa desde a `20260917000006` -- nao ha
--   identificador NOVO em caminho de rota;
-- - **Nada e geocodificado** (ADR-0006). Nao ha `lat`, nao ha `lon`, nao ha
--   `geography` e nao ha indice espacial. O CEP continua resolvido NO APP, por
--   servico publico (ViaCEP, BrasilAPI de reserva, decisao do cliente de
--   17/10/2026), e o que chega aqui e TEXTO ja digitado;
-- - **Nenhuma coluna desta tabela entra em consulta de raio, de proximidade ou
--   de ordenacao por distancia**, e nenhuma alimenta `pending_profile_fields`.
--   Para distancia existe `user_reference_locations`, que e outra coisa e nao
--   tem logradouro;
-- - **Nao sai em superficie publica e nao aparece em lista.** `Pet` sai em
--   `listMyPets`, e o endereco NAO esta em `Pet` exatamente por isso: ele e um
--   sub-recurso proprio, lido um por vez. O cabecalho da `20261020000016` fixou
--   a regra -- *"quem quer o endereco faz JOIN, e quem nao faz nao o tem em
--   maos"* -- e ela nao afrouxa aqui.
--
-- ====================================================================
-- NAO HA APAGAMENTO POR PRAZO, E A AUSENCIA E DECISAO DELE
-- ====================================================================
--
-- **Nao existe coluna de expiracao, nao existe varredura e nao existe constante
-- de prazo neste arquivo.** A decisao do cliente de **17/10/2026**, citada em
-- `media/application/varrer-envios-vencidos.ts`, e literal:
--
--     "voce so deve apagar as informacoes, caso o usuario remova o pet ou
--      delete a conta"
--
-- E com o endereco no PET os dois casos dessa frase ficam cobertos pela MESMA
-- clausula: `ON DELETE CASCADE` em `pet_id` tira o endereco quando o pet sai, e
-- `pets.owner_user_id` ja tem `ON DELETE CASCADE` para `users`, entao apagar a
-- conta derruba os pets e os enderecos deles em cadeia. **Esta e a primeira vez
-- em que a frase dele de 17/10 vale literalmente**: no modelo da conta,
-- *"remova o pet"* nao apagava endereco nenhum.
--
-- ====================================================================
-- AS TRAVAS SAO AS DA `20261020000016`, CARACTERE POR CARACTERE
-- ====================================================================
--
-- Cada `CHECK` abaixo e a mesma forma que `user_delivery_addresses` e
-- `collar_tag_requests` ja cobram para o mesmo campo. **Nao e copia por
-- preguica: e a condicao para o endereco do pet poder PREENCHER o pedido.** Se
-- esta tabela aceitasse um `street_number` de 30 simbolos, o endereco do pet
-- nasceria capaz de produzir um pedido que o banco recusa, e a pessoa
-- descobriria isso no botao de pedir. E e tambem a condicao da COPIA abaixo:
-- trava diferente faria a copia reprovar em linha que a tabela de origem
-- aceitou, no meio da migracao.
--
-- `complement` e a UNICA opcional, como la: casa sem complemento e o caso
-- comum, e ela e a excecao declarada e nao um campo que ficou de fora.
--
-- **Nenhuma lista de UF aqui**, pelo mesmo motivo das outras duas: o conjunto
-- das 27 siglas vive no app (`app/lib/api/estados_brasileiros.dart`) e um
-- `CHECK IN (...)` criaria a segunda fonte. O formato e o que o banco sabe
-- cobrar; o conjunto e do app.

-- Up Migration

CREATE TABLE pet_delivery_addresses (
  -- A CHAVE E O PET, e com isso "um endereco por pet" nao e regra de aplicacao:
  -- e a forma da tabela. Sem indice parcial, sem coluna `id` e sem jeito de o
  -- mesmo pet ter dois.
  --
  -- `ON DELETE CASCADE`: a retencao e esta clausula, e ela cobre as DUAS metades
  -- da frase do cliente de 17/10/2026 -- o endereco sai com o PET, e sai com a
  -- CONTA em cadeia, porque `pets.owner_user_id` ja cascateia de `users`.
  pet_id            uuid        PRIMARY KEY
                                REFERENCES pets (id) ON DELETE CASCADE,

  -- Quem recebe, como vai na etiqueta. Guardado e nao derivado de
  -- `users.display_name`: quem pede pode estar mandando para a casa de outra
  -- pessoa, e o nome da conta nao e o nome de quem recebe.
  recipient_name    text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_recipient_tamanho
                                CHECK (char_length(recipient_name) BETWEEN 2 AND 120),

  -- E.164 do Brasil, a MESMA forma de `user_delivery_addresses.recipient_phone`
  -- e de `collar_tag_requests.recipient_phone`. Nao e o telefone do perfil
  -- copiado: e o telefone de quem recebe a encomenda, que a transportadora
  -- costuma exigir.
  recipient_phone   text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_telefone_formato
                                CHECK (recipient_phone ~ '^\+55[0-9]{10,11}$'),

  -- OITO DIGITOS, sem mascara e sem hifen. Quem normaliza e a aplicacao, antes
  -- de gravar; guardar "01311-000" e "01311000" na mesma coluna daria dois
  -- enderecos iguais com dois valores diferentes.
  --
  -- **O CEP nao e resolvido aqui por ninguem** (ADR-0006): o banco nao sabe, e
  -- nao tem como saber, se o bairro confere com o CEP.
  postal_code       text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_cep_formato
                                CHECK (postal_code ~ '^[0-9]{8}$'),

  street            text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_logradouro_tamanho
                                CHECK (char_length(street) BETWEEN 2 AND 120),

  -- Texto, e nao inteiro: "s/n", "120A" e "KM 32" sao numeros de porta
  -- legitimos, e uma coluna inteira recusaria endereco que existe.
  street_number     text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_numero_tamanho
                                CHECK (char_length(street_number) BETWEEN 1 AND 20),

  complement        text        CONSTRAINT pet_delivery_addresses_complemento_tamanho
                                CHECK (complement IS NULL OR char_length(complement) BETWEEN 1 AND 80),

  neighborhood      text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_bairro_tamanho
                                CHECK (char_length(neighborhood) BETWEEN 2 AND 80),

  city              text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_cidade_tamanho
                                CHECK (char_length(city) BETWEEN 2 AND 80),

  -- DOIS CARACTERES, e nenhuma lista de siglas aqui. Ver o cabecalho.
  state             text        NOT NULL
                                CONSTRAINT pet_delivery_addresses_uf_tamanho
                                CHECK (char_length(state) = 2),

  -- Quando o tutor salvou pela ultima vez. **Nao e carimbo de expiracao**, e
  -- nada o le para apagar nada: ele existe para quem opera o banco saber se a
  -- linha e de hoje ou de marco. O `PUT` o reescreve; nenhuma varredura o olha.
  --
  -- Nas linhas que a COPIA abaixo criou, ele e a hora da migracao e nao a hora
  -- em que a pessoa digitou -- e isso e o certo: a hora em que o endereco
  -- passou a ser deste pet e a hora da copia.
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE pet_delivery_addresses IS
  'O endereco de entrega guardado NO PET, uma linha por pet (`pet_id` e a chave primaria). Autorizado pelo cliente em 27/10/2026, nas palavras dele: "o endereco de entrega da plaquinha tem que estar dentro do cadastro do pet" e, confrontado com a decisao anterior, "endereco um por pet" -- e essa decisao SUPERA a de 21/10/2026 ("um endereco de entrega salvo na conta, reusado em todo pedido e editavel num lugar so"), que criou `user_delivery_addresses`. A tabela da conta NAO foi apagada (decisao do cliente de 26/10/2026, "nao apague nada") e foi a fonte da copia inicial desta; o que ela perdeu foi o papel, porque nenhum pedido de plaquinha le dela. CONTEM A RESIDENCIA DO USUARIO: so o tutor le, a autorizacao mora na clausula WHERE com JOIN em `pets` (404 e nunca 403, ADR-0021), nao sai em superficie publica, nao aparece em lista -- `Pet` sai em `listMyPets` e o endereco NAO esta em `Pet`, de proposito --, nao entra na trilha de auditoria e NAO alimenta calculo de distancia. Nada aqui e geocodificado (ADR-0006). NAO HA APAGAMENTO POR PRAZO: a decisao do cliente de 17/10/2026 e "voce so deve apagar as informacoes, caso o usuario remova o pet ou delete a conta", e com o endereco no pet as DUAS metades dessa frase sao o mesmo ON DELETE CASCADE.';

COMMENT ON COLUMN pet_delivery_addresses.pet_id IS
  'O pet a que este endereco pertence, e a CHAVE PRIMARIA: "um endereco por pet" e a forma da tabela e nao uma regra de aplicacao. E tambem a retencao -- ON DELETE CASCADE tira o endereco quando o pet sai, e em cadeia quando a conta sai (`pets.owner_user_id` ja cascateia de `users`), que sao exatamente os dois casos da decisao do cliente de 17/10/2026. Nao ha coluna `id` nesta tabela de proposito: o recurso e singular em `/v1/pets/{petId}/delivery-address` e nenhum identificador NOVO vai para caminho de rota (ADR-0010 item 6) -- `petId` ja e o identificador de `/v1/pets/{petId}`.';

COMMENT ON COLUMN pet_delivery_addresses.postal_code IS
  'CEP com oito digitos, sem mascara. O app o usa para buscar rua/bairro/cidade/UF (ViaCEP, BrasilAPI de reserva, decisao do cliente de 17/10/2026) e preencher campos editaveis; o servidor nao participa da busca. Nada e geocodificado (ADR-0006) e o banco nao tem como conferir se o CEP bate com as demais colunas. MESMA forma de `user_delivery_addresses.postal_code` e de `collar_tag_requests.postal_code`, de proposito: o endereco do pet tem de poder preencher o pedido sem o banco recusar.';

COMMENT ON COLUMN pet_delivery_addresses.recipient_phone IS
  'Telefone de quem recebe, em E.164 (`+55` e 10 ou 11 digitos). DADO PESSOAL: nao sai em superficie publica, nao aparece em lista e nao entra na trilha de auditoria. Nao e `users.phone_e164` copiado -- e o telefone de quem recebe a encomenda, que pode nao ser o dono da conta.';

COMMENT ON COLUMN pet_delivery_addresses.state IS
  'UF em dois caracteres. O CONJUNTO das 27 siglas vive no app (`app/lib/api/estados_brasileiros.dart`), e nao aqui: um CHECK com as siglas seria a segunda fonte para divergir.';

COMMENT ON COLUMN pet_delivery_addresses.updated_at IS
  'Quando o tutor salvou pela ultima vez. NAO E CARIMBO DE EXPIRACAO e nada o le para apagar nada: nao existe varredura, nao existe prazo e nao existe constante de prazo nesta frente, por decisao do cliente de 17/10/2026. Nas linhas criadas pela copia da `20261027000001` ele e a hora da migracao, que e a hora em que o endereco passou a ser deste pet.';

-- A COPIA. Ver a secao do cabecalho: a razao e a propria razao dele de 21/10
-- ("que a pessoa nao redigite nove campos"), e a SUPOSICAO de que copiar e o
-- certo e de quem implementou, nao frase do cliente.
--
-- Colunas nomeadas uma a uma nos dois lados. `SELECT *` traria `user_id` no
-- lugar de `pet_id` e `updated_at` da conta no lugar da hora da copia -- e
-- traria, por omissao, toda coluna que a tabela de origem ganhar amanha.
INSERT INTO pet_delivery_addresses (
  pet_id, recipient_name, recipient_phone, postal_code,
  street, street_number, complement, neighborhood, city, state
)
SELECT p.id,
       u.recipient_name, u.recipient_phone, u.postal_code,
       u.street, u.street_number, u.complement, u.neighborhood, u.city, u.state
  FROM pets p
  JOIN user_delivery_addresses u ON u.user_id = p.owner_user_id
 -- SO PET VIVO. Ver o cabecalho: pet excluido nao pede plaquinha, e `status`
 -- nao entra no recorte -- `lost`, `deceased` e `archived` continuam no
 -- cadastro do tutor.
 WHERE p.deleted_at IS NULL;

-- A CONTAGEM VAI PARA A TRILHA, porque `node-pg-migrate` descarta `NOTICE` e
-- quem roda `make migrar` nao ve uma linha do que a migracao disse.
--
-- **Nenhum campo de endereco aqui dentro**: nem em `metadata`, nem em lugar
-- nenhum. Sao contagens, e so.
INSERT INTO audit.events (id, actor_kind, action, resource_kind, resource_id, metadata)
SELECT gen_random_uuid(),
       'system',
       'endereco_de_entrega_copiado_da_conta_para_os_pets',
       'pet',
       NULL,
       jsonb_build_object(
         'pets_com_endereco_copiado', (SELECT count(*) FROM pet_delivery_addresses),
         'contas_que_tinham_endereco_guardado', (SELECT count(*) FROM user_delivery_addresses),
         -- Quantos pets vivos de conta COM endereco guardado nao receberam
         -- copia. Esperado: zero. Se aparecer outro numero, a copia recortou
         -- mais do que o cabecalho diz, e o numero e a unica pista que sobra.
         'pets_vivos_sem_copia', (
           SELECT count(*) FROM pets p
             JOIN user_delivery_addresses u ON u.user_id = p.owner_user_id
            WHERE p.deleted_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM pet_delivery_addresses d WHERE d.pet_id = p.id)
         ),
         'pets_excluidos_fora_da_copia', (
           SELECT count(*) FROM pets p
             JOIN user_delivery_addresses u ON u.user_id = p.owner_user_id
            WHERE p.deleted_at IS NOT NULL
         ),
         'tabela_de_origem_preservada', true,
         'motivo', 'cliente 27/10/2026: "endereco um por pet" -- supera a decisao de 21/10/2026 de guardar um endereco por conta; a de 26/10/2026 ("nao apague nada") e por que user_delivery_addresses nao foi apagada',
         'migracao', '20261027000001_endereco-de-entrega-por-pet');

-- Down Migration

-- Descer APAGA o endereco de cada pet. **Mas nao apaga trabalho
-- irrecuperavel**, e e por isso que a descida nao reprova em voz alta como a da
-- `20261018000004`:
--
-- - o que a COPIA trouxe continua em `user_delivery_addresses`, que esta
--   migracao nao tocou -- e e por isso que a decisao de 26/10 ("nao apague
--   nada") tambem e uma rede de seguranca aqui;
-- - o que o tutor EDITOU por pet depois da subida se perde, e o custo real e
--   ele redigitar no formulario do pedido -- exatamente onde ele estava antes
--   desta migracao.
--
-- Travar a descida por um campo de comodidade deixaria um banco de
-- desenvolvimento preso. A mesma leitura, e a mesma frase, do rodape da
-- `20261020000016`.
DROP TABLE pet_delivery_addresses;
