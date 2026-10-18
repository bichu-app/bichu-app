-- BICHUS-278 -- a leitura da conversa, por participante, e o contador do sino.
--
-- ## Por que esta migracao existe
--
-- O cliente pediu um sino na barra de topo COM CONTADOR, e "o app tem que ter
-- uma area de mensagens e deve notificar o usuario". O contrato nao tinha
-- `unread_count`, e o banco nao tinha de onde tira-lo: NENHUMA coluna guardava
-- o que cada lado da conversa ja leu. Medido em 18/10/2026 varrendo
-- `migrations/` inteiro.
--
-- Sem esta coluna, o contador so poderia ser calculado no app -- e aí ele
-- divergiria entre dois aparelhos da mesma pessoa e mentiria no primeiro.
-- Contador que mostra zero quando ha coisa e pior que contador ausente.
--
-- ## DUAS MARCAS, e nao uma -- e a diferenca E a regra de produto
--
-- A decisao e: **"lido" e o ITEM ABERTO, nao a lista vista.** Abrir a lista
-- ZERA O NUMERO, e os itens CONTINUAM NAO LIDOS. Sao dois fatos diferentes e
-- por isso sao duas tabelas; uma coluna so faria abrir a lista marcar tudo como
-- lido, que e exatamente o defeito que a regra proibe -- o tutor abriria a
-- area, veria "1", e perderia para sempre a marca de qual conversa era.
--
--   * `conversation_reads.last_read_at` -- o ITEM. Escrito ao ABRIR a conversa.
--     E ele que apaga a marca de nao lida daquela linha.
--   * `conversation_list_views.seen_at` -- a LISTA. Escrito ao abrir a area.
--     E ele que zera o CONTADOR, sem tocar em marca nenhuma.
--
-- ## A EXCECAO NOMEADA: plaquinha lida e achado NAO saem do contador
--
-- Abrir a lista zera o numero, **menos** para o aviso de plaquinha lida e o de
-- achado. Esses dois sao a coisa mais importante que o produto tem para dizer:
-- alguem esta com o animal na mao AGORA. Deixar que uma passada de olho na
-- lista os tire do contador e perder o recado pelo outro caminho -- que e o
-- buraco que esta historia inteira existe para fechar.
--
-- A excecao precisa ser EXPRIMIVEL, e e por isso que `system_kind` entra junto.
--
-- **Por que nao bastou "conversa nunca aberta".** Era tentador: toda conversa
-- nasce de um aviso e a primeira mensagem dela E o aviso, entao "nunca aberta"
-- pareceria equivalente. Nao e, e o caso que quebra e real: `abrirPorAviso`
-- AGRUPA o segundo escaneamento do mesmo achador na conversa que ja existe
-- (`avisoAnteriorId`). Nessa conversa o tutor ja entrou uma vez, `last_read_at`
-- ja esta preenchido, e o aviso NOVO cairia na regra geral -- a segunda
-- plaquinha lida sairia do contador com uma passada de olho na lista. Marcar a
-- MENSAGEM, e nao a conversa, e o que faz a excecao valer no caso agrupado.
--
-- ## Por que (conversa, papel) e nao (conversa, usuario)
--
-- Mesma razao de `blocked_by_role`, que esta tabela segue de proposito: o
-- achador pode nao ter conta, e a maioria nao tem. Uma chave por `user_id`
-- nomearia um dos dois lados e deixaria o outro sem forma -- e no dia em que a
-- BICHUS-41 der tela ao achador sem conta, a leitura dele nao teria onde morar.
-- O par (conversa, papel) nomeia os dois lados com a mesma forma.
--
-- ## O que NAO entra aqui
--
-- **Nenhuma contagem materializada.** Nao ha `unread_count` em coluna: ele e
-- DERIVADO na leitura, dos dois instantes acima mais `conversation_messages`.
-- Guardar o numero criaria duas fontes para o mesmo fato, e elas divergem no
-- primeiro caminho que esquecer de incrementar uma -- e o caminho de
-- decremento aqui e um `UPDATE` disparado por tela, o mais facil de esquecer.
--
-- **Nenhuma previa materializada.** `last_message_preview` do contrato tambem
-- sai da leitura, de `conversation_messages.body` -- que ja esta REDIGIDO no
-- banco (ver a migracao da conversa mediada: "O TEXTO JA REDIGIDO. Nunca o que
-- a pessoa digitou"). E essa a garantia de que a previa nao desfaz a redacao:
-- ela nao e uma promessa de quem escreveu a consulta, e sim o unico texto que
-- existe em coluna. O texto cru do recado do achador vive em
-- `found_reports.notes`, EM CLARO, e a previa NAO PODE sair de la.

-- Up Migration

CREATE TABLE conversation_reads (
  conversation_id uuid        NOT NULL
                              REFERENCES conversations (id) ON DELETE CASCADE,

  -- Papel, e nao id de usuario. Ver o cabecalho: o achador pode nao ter conta.
  -- `system` nao entra: o Bichu nao le a conversa.
  role            text        NOT NULL
                              CONSTRAINT conversation_reads_role_conhecido
                              CHECK (role IN ('tutor', 'finder')),

  -- Ate quando este lado JA LEU. A linha so existe depois de a pessoa abrir a
  -- conversa uma vez, e por isso a ausencia de linha significa "nunca abriu" --
  -- que e o estado em que TODA mensagem esta nao lida. Sem `DEFAULT now()`
  -- de proposito: um default faria a linha nascer dizendo que a pessoa leu.
  last_read_at    timestamptz NOT NULL,

  PRIMARY KEY (conversation_id, role)
);

COMMENT ON TABLE conversation_reads IS
  'Ate quando cada LADO leu a conversa. Escrito ao ABRIR a conversa, nunca ao abrir a lista: "lido" e o item aberto (BICHUS-278). Ausencia de linha = nunca abriu.';
COMMENT ON COLUMN conversation_reads.role IS
  'Papel e nao id: o achador pode nao ter conta. Mesma forma de conversations.blocked_by_role.';

CREATE TABLE conversation_list_views (
  -- Por CONTA, e nao por aparelho: o contador e o mesmo nos dois telefones da
  -- mesma pessoa. Fosse por aparelho, zerar num nao zeraria no outro e o sino
  -- mentiria no segundo.
  user_id uuid        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,

  -- Quando esta conta viu a area de mensagens pela ultima vez. Zera o CONTADOR
  -- e NAO marca item nenhum como lido.
  seen_at timestamptz NOT NULL
);

COMMENT ON TABLE conversation_list_views IS
  'Quando a conta abriu a AREA de mensagens. Zera o contador do sino e NAO marca item nenhum como lido -- as duas coisas sao fatos diferentes (BICHUS-278).';

-- A classificacao da mensagem do Bichu, para a EXCECAO NOMEADA do contador.
--
-- Anulavel, e o nulo e honesto: as mensagens de sistema que ja existem foram
-- gravadas antes desta coluna e NAO DA para classifica-las retroativamente com
-- certeza. Preencher `scan_notice` em todas por heuristica de texto poria no
-- contador avisos que talvez nao sejam avisos, e a heuristica quebraria no dia
-- em que a microcopy mudasse. Nulo = "nao sei", e a leitura trata nulo pela
-- regra geral.
ALTER TABLE conversation_messages
  ADD COLUMN system_kind text
    CONSTRAINT conversation_messages_system_kind_conhecido
    CHECK (system_kind IS NULL
           OR system_kind IN ('scan_notice', 'found_notice', 'redaction_warning')),
    -- So mensagem do sistema tem especie. Sem isto, uma linha `tutor` com
    -- `scan_notice` ficaria permanentemente no contador do outro lado, e o
    -- remetente teria descoberto como nao sair do sino de quem ele aborda --
    -- que e exatamente a alavanca do falso achador.
    ADD CONSTRAINT conversation_messages_especie_so_do_sistema
    CHECK (system_kind IS NULL OR sender_role = 'system');

COMMENT ON COLUMN conversation_messages.system_kind IS
  'Especie da mensagem do Bichu. `scan_notice` e `found_notice` NAO saem do contador quando a pessoa abre a lista (BICHUS-278); `redaction_warning` sai pela regra geral. Nulo nas linhas gravadas antes da coluna -- nao da para classificar retroativamente, e nulo cai na regra geral.';

-- O contador varre "mensagens desta conversa mais novas que o que eu li", por
-- conversa, e precisa da especie no mesmo indice para nao voltar a tabela.
CREATE INDEX conversation_messages_para_o_contador
  ON conversation_messages (conversation_id, created_at DESC)
  INCLUDE (system_kind, sender_role);

-- Down Migration

DROP INDEX conversation_messages_para_o_contador;
ALTER TABLE conversation_messages
  DROP CONSTRAINT conversation_messages_especie_so_do_sistema;
ALTER TABLE conversation_messages DROP COLUMN system_kind;
DROP TABLE conversation_list_views;
DROP TABLE conversation_reads;
