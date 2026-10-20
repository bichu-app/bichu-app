-- BICHUS-278 -- O MARCADOR DE "JA VI" DAS SECOES `Pets` E `Rede`.
--
-- O contador de mensagens ja tem o dele (`conversation_list_views`, da
-- `20261018000014`). Esta tabela e a MESMA IDEIA para as outras tres contagens
-- que o cliente pediu em 20/10/2026, e e ela que faz o numero ZERAR -- contador
-- que nao zera e pior que contador nenhum.
--
-- ===========================================================================
-- POR QUE UMA TABELA COM `section`, E NAO TRES COLUNAS NEM TRES TABELAS
-- ===========================================================================
-- Tres colunas (`pets_seen_at`, `events_seen_at`, ...) em `users` fariam cada
-- secao nova custar um `ALTER TABLE` na tabela mais quente do sistema, e
-- deixariam a linha de `users` com buraco para toda conta que nunca abriu
-- nenhuma das secoes -- que hoje e a maioria.
--
-- Tres tabelas de duas colunas seriam tres migracoes, tres repositorios e tres
-- consultas para um fato de forma identica. O que varia entre as tres e **o
-- nome da area**, e nome de area e valor e nao esquema.
--
-- ===========================================================================
-- POR QUE `network_events` E `network_directory` SAO DUAS LINHAS, E NAO UMA
-- ===========================================================================
-- As duas contagens da `Rede` caem na MESMA aba da barra de baixo, que tem um
-- selo so. Mesmo assim o MARCADOR e separado, e a separacao e o requisito:
--
-- A secao `Rede` abre em UMA das duas sub-abas (`Eventos` ou `Comunidade`).
-- Com um marcador unico, entrar em `Eventos` apagaria tambem a contagem de
-- `Comunidade` -- quer dizer, o app teria afirmado que a pessoa viu um
-- profissional novo que nunca apareceu na tela dela. E a mentira contraria a do
-- contador que nao zera, e e pior: a que nao zera deixa trabalho na mesa, a que
-- zera sozinha APAGA conteudo sem ninguem ver.
--
-- Com duas linhas, o selo da aba mostra a SOMA e ela desce em dois passos: ver
-- `Eventos` derruba a parte dos eventos, e o resto fica ate `Comunidade` ser
-- vista. Quem conta a soma e o aplicativo (`casca_com_abas.dart`), e o rotulo
-- acessivel diz o que o numero junta.
--
-- ===========================================================================
-- POR CONTA, E NAO POR APARELHO -- a mesma razao de `conversation_list_views`
-- ===========================================================================
-- O contador e o mesmo nos dois telefones da mesma pessoa. Fosse por aparelho,
-- zerar num nao zeraria no outro.
--
-- **A consequencia honesta, e ela e MEDIDA e nao suposta:** o recorte de cidade
-- da contagem de `Pets` vem do APARELHO (a cadeia de `lista_de_perdidos.dart`:
-- cidade resolvida pela localizacao -> `Me.reference_area.city` -> nenhuma), e o
-- marcador e da CONTA. Entao a pessoa que abre `Pets` em Campinas e depois abre
-- em Sao Paulo conta, no segundo aparelho, a partir do instante do primeiro.
-- Isso e o mesmo comportamento que a LISTA ja tem -- ela tambem muda de recorte
-- entre os dois aparelhos --, e amarrar o marcador ao aparelho seria trocar
-- este desalinhamento por um pior: o numero voltaria a acender no telefone que
-- ficou na gaveta.
--
-- ===========================================================================
-- `CHECK` E NAO `enum`, E NENHUM `CHECK` E REESCRITO AQUI
-- ===========================================================================
-- Mesma forma de `conversation_messages.system_kind`: a lista fechada vive num
-- `CHECK` nomeado, que a migracao seguinte troca com `DROP CONSTRAINT` +
-- `ADD CONSTRAINT` sem reescrever tipo nenhum. Esta migracao **cria** a
-- restricao e nao altera nenhuma existente, entao nao ha valor a perder e nao ha
-- o que provar em `BEGIN`/`ROLLBACK`.
--
-- `Mural` NAO esta na lista, de proposito: a contagem dele e de outra frente (o
-- compositor), e um valor aceito sem leitor seria casca. Quem o acrescentar
-- troca o `CHECK` pelo nome dele.
--
-- ===========================================================================
-- SEM `DEFAULT now()` EM `seen_at`, e a ausencia e a mesma da irma
-- ===========================================================================
-- Um default faria a linha nascer dizendo que a pessoa viu a area. A linha so
-- existe depois de a area ter sido vista; ausencia de linha = nunca viu, e e
-- nesse estado que TODO conteudo conta como novo.

-- Up Migration

CREATE TABLE section_list_views (
  user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,

  section text        NOT NULL
                      CONSTRAINT section_list_views_secao_conhecida
                      CHECK (section IN ('pets', 'network_events', 'network_directory')),

  seen_at timestamptz NOT NULL,

  -- A chave composta e o indice da leitura: a consulta busca as tres linhas da
  -- conta de uma vez (`WHERE user_id = $1`), e o prefixo da chave primaria
  -- entrega isso. Indice proprio aqui seria o mesmo indice com outro nome.
  PRIMARY KEY (user_id, section)
);

COMMENT ON TABLE section_list_views IS
  'Quando a conta VIU cada area com contador (BICHUS-278, 20/10/2026). Irma de conversation_list_views, com a area como valor. Zera o contador da aba e NAO marca item nenhum como lido -- sao fatos diferentes. Ausencia de linha = nunca viu, e tudo conta como novo.';
COMMENT ON COLUMN section_list_views.section IS
  'A area: pets (a listagem publica de perdidos, que e o corpo da aba Pets), network_events (a sub-aba Eventos) e network_directory (a sub-aba Comunidade). Eventos e Comunidade sao DUAS linhas de proposito: entrar numa sub-aba nao pode apagar a contagem da outra.';
COMMENT ON COLUMN section_list_views.seen_at IS
  'Sem DEFAULT de proposito: um default faria a linha nascer afirmando que a pessoa viu a area.';

-- Down Migration

DROP TABLE section_list_views;
