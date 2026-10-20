/**
 * O conjunto `case_state=reunited` da listagem publica: os TRES predicados do
 * selo, e o conjunto de casos ABERTOS intacto. Pelo SQL compilado.
 *
 * ## A decisao, e de quem ela e
 *
 * Cliente, 20/10/2026: *"o pet ganha um selo/filtro na pagina de pets como
 * encontrado por 30 dias e depois ele expira e sai"*, e, sobre quem conta como
 * comunidade, *"se o usuario remover que o cachorro estiver perdido, depois de
 * um usuario ter escaneado a tag do usuario ou ter entrado em contato"*.
 *
 * Esta e exposicao NOVA em superficie alcancavel sem conta -- medido: encerrar o
 * caso removia o animal da lista publica no mesmo instante --, e esta escrita na
 * Emenda 4 do ADR-0010, com data e com dono.
 *
 * ## Por que o SQL compilado, e o que este arquivo NAO alcanca
 *
 * Tres dos predicados deste conjunto decidem se um pet aparece numa pagina
 * publica, e dois deles sao invisiveis de fora: a janela de 30 dias so se nota
 * na borda, e o `EXISTS` da conversa so se nota com dado. Um teste de resposta
 * aprovaria uma consulta que perdeu o `EXISTS` sempre que a massa nao tivesse um
 * caso reencontrado SEM conversa -- e o selo estaria na rua, errado, com a
 * suite verde.
 *
 * O **efeito** e de `tests/integration/selo-de-reencontro-na-listagem-publica.test.ts`,
 * que mede contra Postgres com um caso de 29 dias, um de 31 e um sem conversa.
 * Este arquivo le a FORMA; aquele le o resultado. Nenhum dos dois basta.
 *
 * Ele le o SQL que o compilador do Postgres escreve, nunca o texto-fonte do
 * adaptador: uma conferencia que procurasse `conversations` no arquivo casaria
 * com a mencao dentro deste proprio comentario.
 *
 * ## A ISCA DA REGRESSAO MAIS CARA, e ela e a primeira do arquivo
 *
 * A lista de casos ABERTOS e como a vizinhanca acha o animal que sumiu. O
 * primeiro caso deste arquivo compara o SQL do conjunto aberto com o texto
 * LITERAL que `origin/development` compilava antes desta mudanca, caractere por
 * caractere. Nao e um `assert.ok(sql.includes(...))`: e igualdade.
 *
 * ## A isca, e como ela foi provada
 *
 * Em 20/10/2026, Node v22.23.2. Cada desligamento foi confirmado por diferenca
 * de conteudo do arquivo ANTES de a suite rodar.
 *
 * Base deste arquivo: 11 casos, 11 passaram.
 *
 * | o que foi desligado em `kysely-listagem-publica-de-perdidos.ts` | placar | reprovaram, por nome |
 * |---|---|---|
 * | `.where('lost_cases.closed_at', '>=', ...)` do ramo | 10/1 | `a janela de 30 dias e predicado, e ela conta de closed_at` |
 * | o `exists` da conversa | 10/1 | `o sinal da comunidade e a CONVERSA ligada ao caso` |
 * | `'closed_reunited'` virando `'closed_not_found'` | 10/1 | `o ramo do selo le SO o encerramento com reencontro` |
 * | o ramo inteiro (a condicao virando `true`, e o conjunto do selo caindo no de abertos) | 7/4 | os tres acima e mais `o conjunto reencontrado NAO e o conjunto aberto` |
 * | o ramo movido para DEPOIS de `share_to_public_list` | 10/1 | `o SQL do conjunto ABERTO e identico ao de antes desta mudanca` |
 *
 * A ULTIMA LINHA e a que justifica a igualdade: mover o predicado de lugar nao
 * muda resultado nenhum, e e justamente por isso que nenhum teste de resposta
 * acusaria. O que ela protege e a promessa da Emenda 4 -- *a consulta da
 * vizinhanca nao foi tocada* --, e promessa sem instrumento e fe.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';

import type { Database } from '../../../../shared/db/schema.js';
import {
  DIAS_DO_SELO_DE_REENCONTRO,
  type RecorteDePerdidos,
} from '../../ports/listagem-publica-de-perdidos.js';
import {
  construtorDaListagemPublicaDePerdidos,
  inicioDaJanelaDoSelo,
} from './kysely-listagem-publica-de-perdidos.js';

/** O mesmo arranjo dos vizinhos: compila, nao executa. */
const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

/** Instante fixo: a borda da janela nao sai do relogio da maquina. */
const AGORA = new Date('2026-10-20T13:00:00.000Z');

function recorte(ajustes: Partial<RecorteDePerdidos> = {}): RecorteDePerdidos {
  return { conjunto: 'aberto', pagina: 1, limite: 20, agora: AGORA, ...ajustes };
}

function compilado(ajustes: Partial<RecorteDePerdidos> = {}) {
  return construtorDaListagemPublicaDePerdidos(semBanco, recorte(ajustes)).compile();
}

/**
 * O `WHERE` compilado do conjunto de casos ABERTOS, como `origin/development`
 * (`fb3a0fba`) o escrevia ANTES desta mudanca.
 *
 * Transcrito de uma impressao do proprio construtor naquela arvore, e nao
 * escrito a mao: um texto inventado aqui provaria que ele casa consigo mesmo.
 */
const ONDE_DO_CONJUNTO_ABERTO_ANTES =
  'where "lost_cases"."status" = $3 and "lost_cases"."share_to_public_list" = $4 ' +
  'and conta_habilitada(lost_cases.owner_user_id) and "pets"."deleted_at" is null ' +
  'and "pets"."status" not in ($5, $6)';

/**
 * Os parametros do conjunto aberto, na ordem, como `origin/development` os
 * ligava. `$1` e `$2` sao da juncao da foto (`is_primary` e `status`), e e por
 * isso que o estado do caso comeca em `$3` -- a leitura por posicao fixa aqui
 * nao e um indice adivinhado: ela e o texto compilado conferido contra o da
 * arvore base.
 */
const PARAMETROS_DO_CONJUNTO_ABERTO_ANTES: readonly unknown[] = [
  true,
  'ready',
  'open',
  true,
  'deceased',
  'archived',
];

function ondeDe(sql: string): string {
  const i = sql.indexOf('where ');
  assert.notEqual(i, -1, `o SQL compilado nao tem WHERE. SQL: ${sql}`);
  return sql.slice(i);
}

void describe('a lista de casos ABERTOS nao muda, e e ela que a vizinhanca abre', () => {
  void it('o SQL do conjunto ABERTO e identico ao de antes desta mudanca', () => {
    const compilada = compilado();

    assert.equal(
      ondeDe(compilada.sql),
      ONDE_DO_CONJUNTO_ABERTO_ANTES,
      'o `WHERE` do conjunto de casos abertos mudou. Esta e a consulta pela qual a vizinhanca ' +
        'acha o animal que sumiu, e a Emenda 4 do ADR-0010 promete que ela nao foi tocada: ' +
        'mesmos predicados, mesma ordem. Se a mudanca for deliberada, ela e uma decisao de ' +
        'produto e nao um efeito colateral do selo.',
    );
    assert.deepEqual(
      [...compilada.parameters],
      [...PARAMETROS_DO_CONJUNTO_ABERTO_ANTES],
      'os parametros do conjunto aberto mudaram de valor ou de ordem',
    );
  });

  void it('o conjunto ABERTO nao olha `conversations` nem `closed_at`', () => {
    const { sql } = compilado();

    assert.doesNotMatch(
      sql,
      /conversations/,
      `a lista de abertos passou a avaliar o sinal da comunidade por linha. Nao ha valor a ` +
        `medir ali -- selo de reencontro em caso aberto nao tem significado -- e o custo cai ` +
        `na consulta que menos pode ganhar custo. SQL: ${sql}`,
    );
    assert.doesNotMatch(sql, /closed_at/, `SQL: ${sql}`);
  });
});

void describe('o conjunto do selo carrega os TRES predicados, e nenhum e opcional', () => {
  void it('o ramo do selo le SO o encerramento com reencontro', () => {
    const compilada = compilado({ conjunto: 'reencontrado' });

    assert.match(
      compilada.sql,
      /"lost_cases"\."status" = \$(\d+)/,
      `o predicado de estado saiu do ramo. SQL: ${compilada.sql}`,
    );
    const posicao = /"lost_cases"\."status" = \$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined);
    assert.equal(
      compilada.parameters[Number(posicao) - 1],
      'closed_reunited',
      'o estado ligado ao ramo do selo nao e `closed_reunited`. `closed_not_found` e a busca ' +
        'que nao acabou bem e `closed_false_alarm` e o caso que nunca existiu: publicar ' +
        'qualquer um dos dois seria contar uma historia que o tutor nao autorizou (Emenda 4 ' +
        `do ADR-0010). parametros: ${JSON.stringify([...compilada.parameters])}`,
    );
  });

  void it('a janela de 30 dias e predicado, e ela conta de closed_at', () => {
    const compilada = compilado({ conjunto: 'reencontrado' });

    assert.match(
      compilada.sql,
      /"lost_cases"\."closed_at" >= \$(\d+)/,
      'a janela saiu da consulta. Sem ela o selo fica na rua para sempre, e a Emenda 4 do ' +
        `ADR-0010 promete 30 dias. SQL: ${compilada.sql}`,
    );
    const posicao = /"lost_cases"\."closed_at" >= \$(\d+)/.exec(compilada.sql)?.[1];
    assert.ok(posicao !== undefined);
    assert.deepEqual(
      compilada.parameters[Number(posicao) - 1],
      inicioDaJanelaDoSelo(AGORA),
      'o instante ligado a janela nao e `agora - 30 dias` do relogio da APLICACAO. Um `now()` ' +
        'do banco aqui poria dois relogios na mesma decisao, e a decisao e se um animal ' +
        'aparece numa pagina publica.',
    );
    // O valor, e nao so a forma: 30 dias e numero de produto, e a conta e
    // conferida contra a constante da porta -- nao refeita aqui, que seria a
    // isca medindo a copia dela mesma.
    assert.equal(
      Number(AGORA) - Number(inicioDaJanelaDoSelo(AGORA)),
      DIAS_DO_SELO_DE_REENCONTRO * 24 * 60 * 60 * 1000,
      'a janela deixou de ter o tamanho que `DIAS_DO_SELO_DE_REENCONTRO` declara',
    );
  });

  void it('o sinal da comunidade e a CONVERSA ligada ao caso', () => {
    const { sql } = compilado({ conjunto: 'reencontrado' });

    assert.match(
      sql,
      /exists \(select "conversations"\."id" from "conversations" where "conversations"\."case_id" = "lost_cases"\."id"\)/,
      'o sinal da comunidade saiu da consulta. Sem ele o selo diz "encontrado pela ' +
        'comunidade" sobre um pet que o tutor achou sozinho, numa pagina publica, e passa a ' +
        'ser uma afirmacao que o proprio dono fabrica. A conversa e o sinal porque ela nasce ' +
        'de plaquinha lida que virou aviso (`scan_notice`) ou de achado confirmado pelo tutor ' +
        `(\`found_notice\`), e os dois exigem que o outro lado nao seja o tutor. SQL: ${sql}`,
    );
    assert.doesNotMatch(
      sql,
      /tag_scans/,
      'a consulta passou a ler `tag_scans`. Aquela tabela grava a leitura da pagina, sem ' +
        'conta, sem identidade e sem mensagem: ela conta o proprio tutor e o robo que ' +
        `pre-visualiza o link. SQL: ${sql}`,
    );
    assert.doesNotMatch(
      sql,
      /closure_channel|reunion_channel/,
      'a consulta passou a decidir por `reunion_channel`, que esta NULO em todo o dado ' +
        `(nenhuma tela o preenche, medido em 20/10/2026). SQL: ${sql}`,
    );
  });

  void it('o conjunto reencontrado NAO e o conjunto aberto', () => {
    const aberto = compilado();
    const reencontrado = compilado({ conjunto: 'reencontrado' });

    assert.notEqual(
      ondeDe(aberto.sql),
      ondeDe(reencontrado.sql),
      'os dois conjuntos compilam o mesmo `WHERE`: o ramo nao esta sendo tomado, e ' +
        '`case_state=reunited` responde a lista de perdidos abertos com o selo ligado.',
    );
  });

  void it('os quatro predicados de publicacao continuam no ramo do selo', () => {
    // O selo nao afrouxa nada: conta desabilitada, pet apagado, pet falecido ou
    // arquivado e caso que o tutor nao deixou na lista continuam fora. O
    // `share_to_public_list` e o que faz "o tutor continua decidindo" da Emenda
    // 4 ser verdade sem codigo novo.
    const { sql } = compilado({ conjunto: 'reencontrado' });

    assert.match(sql, /"lost_cases"\."share_to_public_list" = \$\d+/, `SQL: ${sql}`);
    assert.match(sql, /conta_habilitada\(lost_cases\.owner_user_id\)/, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."deleted_at" is null/, `SQL: ${sql}`);
    assert.match(sql, /"pets"\."status" not in \(\$\d+, \$\d+\)/, `SQL: ${sql}`);
  });

  void it('os filtros que ja existiam valem nos DOIS conjuntos', () => {
    // Quem escolheu `Encontrados` e digitou uma cidade espera as duas coisas.
    const { sql } = compilado({ conjunto: 'reencontrado', cidade: 'Sao Paulo', especie: 'dog' });

    assert.match(
      sql,
      /texto_para_busca\(lost_cases\.last_seen_city\) = texto_para_busca\(\$\d+\)/,
      `a cidade deixou de recortar o conjunto do selo. SQL: ${sql}`,
    );
    assert.match(sql, /"pets"\."species_code" = \$\d+/, `SQL: ${sql}`);
  });
});

void describe('ISCA: a mesma conferencia REPROVA uma consulta sem os predicados do selo', () => {
  void it('um ramo que esqueceu a janela e acusado', () => {
    const semJanela = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'closed_reunited')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('conversations')
            .whereRef('conversations.case_id', '=', 'lost_cases.id')
            .select('conversations.id'),
        ),
      )
      .compile();

    assert.doesNotMatch(
      semJanela.sql,
      /"lost_cases"\."closed_at" >= \$\d+/,
      `a conferencia da janela aprovou uma consulta sem janela. SQL: ${semJanela.sql}`,
    );
  });

  void it('um ramo que esqueceu o sinal da comunidade e acusado', () => {
    const semSinal = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'closed_reunited')
      .where('lost_cases.closed_at', '>=', inicioDaJanelaDoSelo(AGORA))
      .compile();

    assert.doesNotMatch(
      semSinal.sql,
      /exists \(select "conversations"/,
      `a conferencia do sinal aprovou uma consulta sem o EXISTS. SQL: ${semSinal.sql}`,
    );
  });

  void it('um `WHERE` com um predicado a MAIS no conjunto aberto e acusado pela igualdade', () => {
    // A igualdade do primeiro caso nao e um `includes`: ela reprova tambem o
    // predicado ACRESCENTADO, que e por onde a lista de abertos mudaria de
    // comportamento sem ninguem notar.
    const comUmAMais = semBanco
      .selectFrom('lost_cases')
      .select('lost_cases.share_token')
      .where('lost_cases.status', '=', 'open')
      .where('lost_cases.share_to_public_list', '=', true)
      .where('lost_cases.closed_at', 'is', null)
      .compile();

    assert.notEqual(
      ondeDe(comUmAMais.sql),
      ONDE_DO_CONJUNTO_ABERTO_ANTES,
      `a igualdade aprovou um WHERE diferente; ela nao mede nada. SQL: ${comUmAMais.sql}`,
    );
  });
});
