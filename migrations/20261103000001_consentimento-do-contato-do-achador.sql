-- O CONSENTIMENTO DE QUEM ACHOU O PET PARA O CONTATO DELE CHEGAR AO TUTOR
--
-- Decisao do cliente, 03/11/2026, literal: *"o achador vai enviar os dados e
-- ter um botao de 'aceito compartilhar meus dados com o tutor do pet' com o
-- objetivo exclusivamente dele conseguir entrar em contato para recuperar seu
-- pet"*.
--
-- Esta e a peca mais sensivel da trilha do achador: dado pessoal de alguem que
-- NAO TEM CONTA, entregue a um terceiro. O que a torna legitima e o registro
-- abaixo -- e nada mais.
--
-- ## POR QUE A TABELA GUARDA O TEXTO, E NAO UM PONTEIRO PARA A VERSAO
--
-- `terms_acceptances` (migracao 20261101000001) guarda `version`, e aquilo
-- basta la porque o texto dos termos e publicado e versionado no site, com
-- `web/src/conteudo/versao-legal.json` como fonte unica e um portao que a
-- confere. Aqui nao basta, por duas razoes:
--
--   1. o achador NAO TEM CONTA. Nao ha perfil onde reconsultar o que ele
--      aceitou, nao ha e-mail nosso confirmando, nao ha sessao. O registro e a
--      unica evidencia que existe;
--   2. o que a lei cobra e demonstrar que AQUELA pessoa leu AQUELE texto
--      naquele dia. Ponteiro para "a versao atual" responde o que o texto diz
--      HOJE. No dia em que o texto mudar, o ponteiro passa a mentir sobre todo
--      consentimento antigo -- e mente em silencio, que e o pior modo.
--
-- Por isso `consent_text` e NOT NULL com `CHECK` contra vazio: consentimento
-- sem o texto lido nao prova consentimento nenhum, e quem recusa isso e o
-- Postgres, nao a disciplina de quem escreve o repositorio. Mesma forma da
-- `terms_acceptances_versao_nao_vazia`, e pelo mesmo motivo medido la.
--
-- `consent_version` fica ao lado do texto, e nao em lugar dele: ela e o que
-- responde "quantas pessoas consentiram sob o texto novo?" sem comparar
-- paragrafos.
--
-- ## APENDA, E NUNCA SOBRESCREVE
--
-- Sem `UPDATE`, sem `DELETE`, sem expurgo por prazo. ADR-0007 emenda 2 e
-- ADR-0010 emenda 6, as duas de 26/10/2026, decisao do cliente: *"nao apague
-- nada"*. O unico `ON DELETE` e o `CASCADE` do aviso -- se o aviso sai, o
-- consentimento de divulgar o contato daquele aviso sai com ele, porque sem o
-- aviso a finalidade declarada deixou de existir.
--
-- Note que NAO ha `CASCADE` a partir de `users`: o achador nao tem conta, e e
-- justamente essa a diferenca entre esta tabela e `terms_acceptances`.
--
-- ## O QUE NAO ESTA AQUI, DE PROPOSITO
--
-- **Nao ha coluna de telefone.** O telefone do achador nao e persistido em
-- `found_reports`: ele chega no corpo do pedido, e vai para o recado de sistema
-- da conversa -- que e imutavel, fica no historico e e exatamente o instante a
-- que o consentimento se refere. Uma segunda copia em coluna seria guarda sem
-- finalidade declarada propria (ADR-0010 emenda 6: a guarda e amarrada a
-- finalidade). `found_reports.finder_email` continua existindo, com a
-- finalidade que ela ja tinha ("avisar a resposta do tutor e o desfecho do
-- caso"), e esta decisao nao a toca.
--
-- **Nao ha coluna dizendo "consentiu: sim/nao".** A existencia da linha E o
-- consentimento. Booleano em `found_reports` seria uma bandeira que, esquecida
-- em `false`, apenas deixaria de divulgar -- mas que, lida errada, divulgaria
-- sem prova. Linha presente / linha ausente nao tem esse modo de falha.

-- Up Migration

CREATE TABLE finder_contact_consents (
  -- UUIDv7 da aplicacao, como todo id nosso.
  id              uuid        PRIMARY KEY,

  -- QUEM consentiu. O achador sem conta so tem uma identidade estavel: o aviso
  -- que ele mandou, alcancado pelo resumo do `finder_token`.
  found_report_id uuid        NOT NULL
                              REFERENCES found_reports (id) ON DELETE CASCADE,

  -- QUANDO. Nao e `Generated` por capricho: o recado que o tutor le cita este
  -- instante, e o banco e o relogio de referencia.
  consented_at    timestamptz NOT NULL DEFAULT now(),

  -- PARA QUE. Lista fechada de um valor so, e nao texto livre: finalidade e o
  -- limite do consentimento, e finalidade inventada no meio do codigo tem de
  -- nao compilar e tambem nao gravar. Espelha
  -- `FinalidadeDoConsentimento` em
  -- `src/modules/found/domain/consentimento-de-contato.ts`.
  --
  -- `= ANY (ARRAY[...])` e nao `IN (...)` porque o valor e UM: o Postgres
  -- normaliza `IN ('x')` para `= 'x'::text`, e com isso a restricao deixa de ser
  -- legivel como lista fechada por `conjunto-exato-dos-checks` -- ela cairia na
  -- gaveta de "CHECK com literal de texto" e a lista pararia de ser conferida.
  -- Escrita assim, ela continua sendo uma LISTA, que e o que ela e: hoje com um
  -- valor, e com a conferencia armada para o dia em que alguem tentar um segundo.
  purpose         text        NOT NULL
                              CONSTRAINT finder_contact_consents_finalidade_conhecida
                              CHECK (purpose = ANY (ARRAY['owner_contact'])),

  -- A VERSAO do texto exibido.
  consent_version text        NOT NULL
                              CONSTRAINT finder_contact_consents_versao_nao_vazia
                              CHECK (btrim(consent_version) <> ''),

  -- O TEXTO EXATO que a pessoa leu, naquele dia. Ver o cabecalho.
  consent_text    text        NOT NULL
                              CONSTRAINT finder_contact_consents_texto_nao_vazio
                              CHECK (btrim(consent_text) <> '')
);

COMMENT ON TABLE finder_contact_consents IS
  'O consentimento de quem achou o pet, e NAO TEM CONTA, para o contato dele chegar ao tutor (decisao do cliente, 03/11/2026). APENDA, e nunca sobrescreve: sem UPDATE, sem DELETE e sem expurgo por prazo (ADR-0007 emenda 2, ADR-0010 emenda 6). A existencia da linha E o consentimento -- nao ha booleano em lugar nenhum deste caminho.';

COMMENT ON COLUMN finder_contact_consents.purpose IS
  'A finalidade declarada, que e o limite do consentimento. Lista fechada de um valor so (`owner_contact`): o tutor entrar em contato para recuperar o pet, e nada mais.';

COMMENT ON COLUMN finder_contact_consents.consent_text IS
  'O texto EXATO que o achador leu, como ele estava naquele dia -- e nao um ponteiro para a versao de hoje. O achador nao tem conta, entao este registro e a unica evidencia que existe; e ponteiro para "a versao atual" passa a mentir sobre todo consentimento antigo no dia em que o texto mudar.';

COMMENT ON COLUMN finder_contact_consents.consent_version IS
  'A versao do texto exibido, ao lado do texto e nao em lugar dele: responde "quantos consentiram sob o texto novo?" sem comparar paragrafos. Espelha `VERSAO_ATUAL_DO_CONSENTIMENTO` em `src/modules/found/domain/consentimento-de-contato.ts`.';

-- "Este aviso ja teve consentimento?" e a unica pergunta de leitura, e ela e
-- feita pelo aviso.
CREATE INDEX finder_contact_consents_por_aviso
  ON finder_contact_consents (found_report_id, consented_at DESC);

-- A ESPECIE NOVA DE MENSAGEM DO SISTEMA
--
-- O contato vai ao tutor como mensagem de SISTEMA, e nao como mensagem do
-- achador, por um motivo que nao e estetico: `enviar` redige o corpo de toda
-- mensagem humana (`redigirCanalMediado`), e redigir e exatamente o que nao se
-- quer aqui -- o telefone e o e-mail tem de atravessar, porque foi para isso
-- que a pessoa consentiu. Mensagem de sistema nao passa pela redacao.
--
-- `finder_contact` cai na REGRA GERAL do contador (sai do sino quando o tutor
-- le), ao contrario de `scan_notice` e `found_notice`: ela e uma mensagem nova
-- de verdade, e nao o cabecalho permanente da conversa.
ALTER TABLE conversation_messages
  DROP CONSTRAINT conversation_messages_system_kind_conhecido,
  ADD CONSTRAINT conversation_messages_system_kind_conhecido
    CHECK (system_kind IS NULL
           OR system_kind IN ('scan_notice', 'found_notice', 'redaction_warning',
                              'finder_contact'));

COMMENT ON COLUMN conversation_messages.system_kind IS
  'Especie da mensagem do Bichu. `scan_notice` e `found_notice` NAO saem do contador quando a pessoa abre a lista (BICHUS-278); `redaction_warning` e `finder_contact` saem pela regra geral. Nulo nas linhas gravadas antes da coluna -- nao da para classificar retroativamente, e nulo cai na regra geral.';

-- Down Migration

-- A ORDEM AQUI E DELIBERADA: o `CHECK` volta ANTES de a tabela cair.
--
-- Restaurar a lista sem `finder_contact` faz o Postgres validar as linhas que
-- ja existem, e a descida REPROVA sozinha se alguma divulgacao ja aconteceu --
-- sem `DO` block e sem eu inventar politica: e a propria restricao que recusa.
-- Isso importa porque `finder_contact` e a prova de que um contato foi
-- divulgado sob consentimento, e a descida nao e autorizacao para apagar
-- evidencia. Se o `CHECK` caisse por ultimo, a tabela de consentimentos iria
-- embora ANTES de o banco perceber o problema, deixando as mensagens de
-- divulgacao orfas da prova que as legitima.
--
-- Com a ordem abaixo, a descida ou e completa ou nao mexe em nada.
ALTER TABLE conversation_messages
  DROP CONSTRAINT conversation_messages_system_kind_conhecido,
  ADD CONSTRAINT conversation_messages_system_kind_conhecido
    CHECK (system_kind IS NULL
           OR system_kind IN ('scan_notice', 'found_notice', 'redaction_warning'));

COMMENT ON COLUMN conversation_messages.system_kind IS
  'Especie da mensagem do Bichu. `scan_notice` e `found_notice` NAO saem do contador quando a pessoa abre a lista (BICHUS-278); `redaction_warning` sai pela regra geral. Nulo nas linhas gravadas antes da coluna -- nao da para classificar retroativamente, e nulo cai na regra geral.';

DROP INDEX finder_contact_consents_por_aviso;

DROP TABLE finder_contact_consents;
