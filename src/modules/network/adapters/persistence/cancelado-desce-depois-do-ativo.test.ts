/**
 * ISCA: o encontro CANCELADO desce para depois do ativo, nas DUAS listas, e o
 * recorte por situação usa o rótulo CALCULADO e não a coluna crua.
 *
 * ## A decisão
 *
 * Cliente, 26/10/2026, em três mensagens: *"não existe filtro na listagem de
 * eventos por eventos cancelados"*; *"os eventos cancelados e que já passaram
 * devem vir por último na listagem. Os primeiros da lista tem que ser os
 * próximos eventos que vão acontecer"*; *"e baseados na região do usuário
 * (cidade)"*. A cidade já existia (`city`, digitada, ADR-0006) e a ordem por
 * data também; o que não existia era `status`, e nenhuma ordem tratava o
 * cancelado de forma diferente.
 *
 * ## Por que ler o SQL COMPILADO, e não a resposta da rota
 *
 * Mesmo instrumento de `conta-desabilitada-sai-da-agenda.test.ts`:
 * `DummyDriver` compila a consulta sem banco e sem executá-la, e o caso lê o
 * `ORDER BY` e o `WHERE`. Uma ordem conferida pela resposta de uma rota passa
 * igual se alguém reordenar em memória depois do `LIMIT` -- e reordenar depois
 * do `LIMIT` é o defeito, não o conserto: a página 2 repetiria e pularia
 * linhas. Aqui o caso lê **onde** a decisão mora.
 *
 * E a razão de haver um construtor exportado por lista
 * (`agendaOrdenada`, `meusEncontrosOrdenados`): a ordem é escrita UMA vez e
 * lida por este arquivo. Uma segunda escrita da mesma ordem dentro do método
 * do repositório divergiria na primeira correção, e a que o teste não lê é a
 * que fica errada.
 *
 * ## A ISCA, PROVADA (27/10/2026)
 *
 * Cada linha foi desligada no arquivo de produção, a suíte rodada, e o caso
 * que reprovou conferido PELO NOME. `git diff` não vazio em cada rodada, como
 * a BICHUS-237 exige.
 *
 * | o que se desliga em `kysely-network-repository.ts` | quem reprova |
 * |---|---|
 * | `chaveDoCancelado` sai do `ORDER BY` de `agendaOrdenada` | `a agenda em \`proximos\` ordena pelo cancelado ANTES da data` |
 * | `rotuladoCancelado` passa a ser só `publication_status = 'cancelled'` | `o rótulo é CALCULADO: o fim previsto entra no predicado` |
 * | o `WHEN ${cancelado}` de `meusEncontrosOrdenados` vai para depois do `WHEN ${naoTerminou}` | `\`Meus eventos\` testa o cancelado ANTES de "ainda não terminou"` |
 * | `situacaoCalculada` sai do `WHERE` de `construtorDaAgenda` | `\`status\` recorta a agenda pela situação calculada` |
 * | `status` deixa de ser aplicado em `construtorDosMeusEncontros` | `\`status\` recorta \`Meus eventos\` pela MESMA expressão da agenda` |
 *
 * O resultado de cada rodada está no relatório da entrega.
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
import type { Instant } from '../../../../shared/types/brands.js';
import type {
  RecorteDaAgenda,
  RecorteDosMeusEncontros,
} from '../../ports/network-repository.js';
import {
  agendaOrdenada,
  construtorDaAgenda,
  construtorDosMeusEncontros,
  meusEncontrosOrdenados,
} from './kysely-network-repository.js';

const CHAMADOR = '018f3a2b-0000-7000-8000-0000000000aa';
const AGORA = 1_800_000_000_000 as Instant;

const semBanco = new Kysely<Database>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});

function agenda(extra: Partial<RecorteDaAgenda> = {}): RecorteDaAgenda {
  return { when: 'upcoming', sort: 'proximos', agora: AGORA, page: 1, limit: 20, ...extra };
}

function meus(extra: Partial<RecorteDosMeusEncontros> = {}): RecorteDosMeusEncontros {
  return { chamador: CHAMADOR, agora: AGORA, page: 1, limit: 20, ...extra };
}

/** O `ORDER BY` compilado, sem o resto da consulta. EXPLODE se não houver um. */
function ordemDe(sql: string): string {
  const i = sql.lastIndexOf('order by');
  assert.notEqual(
    i,
    -1,
    `a consulta compilou SEM \`order by\` -- este arquivo mede ordem, e sem ela ` +
      `todo caso abaixo ficaria verde por não ter o que ler. SQL: ${sql}`,
  );
  return sql.slice(i);
}

/**
 * A marca da chave do cancelado no `ORDER BY`.
 *
 * Cobra as TRÊS partes juntas -- a coluna de publicação, o literal
 * `'cancelled'` e o fim previsto (`coalesce`) --, porque cada uma sozinha
 * aparece em outro lugar da consulta: `publication_status` está no predicado
 * de visibilidade da base, e `coalesce` está na chave de "ainda não terminou".
 */
const CHAVE_DO_CANCELADO = /case when \(\s*"?e"?\."?publication_status"? = 'cancelled'[\s\S]*?coalesce/i;

void describe('o cancelado desce para depois do ativo nas duas listas', () => {
  void it('a agenda em `proximos` ordena pelo cancelado ANTES da data', () => {
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda()).compile().sql);
    assert.match(
      ordem,
      CHAVE_DO_CANCELADO,
      'a ordem `proximos` perdeu a chave que desce o cancelado. Um encontro cancelado ' +
        'para amanhã volta a abrir a agenda na frente de um encontro ativo para depois ' +
        `de amanhã (decisão de 26/10/2026). ORDER BY: ${ordem}`,
    );
    // A chave é ANTES da data, e não no lugar dela: dentro de cada grupo a
    // ordem continua sendo a data. Posta depois de `starts_at`, ela nunca
    // mudaria nada, e o caso acima ficaria verde com a ordem errada.
    const posCancelado = ordem.search(CHAVE_DO_CANCELADO);
    const posData = ordem.indexOf('starts_at');
    assert.ok(
      posCancelado < posData,
      'a chave do cancelado está DEPOIS de `starts_at` no `ORDER BY`, e nessa posição ' +
        `ela não reordena nada. ORDER BY: ${ordem}`,
    );
  });

  void it('o rótulo é CALCULADO: o fim previsto entra no predicado', () => {
    // `publication_status = 'cancelled'` sozinho trataria um cancelado de três
    // semanas atrás como cancelado, e para o app ele é `ended`. O servidor
    // discordaria do campo `status` que ele mesmo projeta.
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda()).compile().sql);
    assert.match(
      ordem,
      /coalesce\(\s*"?e"?\."?ends_at"?/i,
      'a chave do cancelado parou de olhar o fim previsto. Sem ele, o rótulo da ordem ' +
        `deixa de ser o rótulo da resposta. ORDER BY: ${ordem}`,
    );
  });

  void it('a ordem `recentes` NÃO carrega a chave do cancelado', () => {
    // CONTRAPESO, e ele é o que prova que o caso de cima mede a chave e não o
    // formato do `ORDER BY`: `recentes` é a ordem do passado, onde o rótulo do
    // cancelado já virou `ended` para todo mundo.
    const ordem = ordemDe(agendaOrdenada(semBanco, agenda({ sort: 'recentes' })).compile().sql);
    assert.doesNotMatch(
      ordem,
      CHAVE_DO_CANCELADO,
      `\`recentes\` ganhou uma chave que nunca muda de valor. ORDER BY: ${ordem}`,
    );
  });

  void it('`Meus eventos` testa o cancelado ANTES de "ainda não terminou"', () => {
    // A ORDEM DOS `WHEN` É O DEFEITO INTEIRO. O cancelado também satisfaz
    // "ainda não terminou" (`coalesce(ends_at, starts_at) > agora`), então
    // testado depois ele volta para o grupo 1 e ordena na frente de um ativo
    // mais distante -- que é exatamente o estado de 26/10/2026.
    const ordem = ordemDe(meusEncontrosOrdenados(semBanco, meus()).compile().sql);
    const posCancelado = ordem.search(CHAVE_DO_CANCELADO);
    assert.notEqual(
      posCancelado,
      -1,
      `\`Meus eventos\` perdeu a chave do cancelado. ORDER BY: ${ordem}`,
    );
    const posNaoTerminou = ordem.search(/coalesce\(\s*"?e"?\."?ends_at"?,\s*"?e"?\."?starts_at"?/i);
    assert.notEqual(
      posNaoTerminou,
      -1,
      `\`Meus eventos\` perdeu a chave de "ainda não terminou". ORDER BY: ${ordem}`,
    );
    assert.ok(
      posCancelado < posNaoTerminou,
      'o `WHEN` do cancelado está DEPOIS do `WHEN` de "ainda não terminou", e nessa ' +
        'ordem o cancelado cai no grupo do ativo. É o defeito que esta entrega fecha. ' +
        `ORDER BY: ${ordem}`,
    );
  });

  void it('`Meus eventos` ordena em TRÊS grupos, e o passado é o último', () => {
    const ordem = ordemDe(meusEncontrosOrdenados(semBanco, meus()).compile().sql);
    // Os três rótulos de grupo saem como literais na chave 1.
    for (const grupo of ['1', '0', '2']) {
      assert.match(
        ordem,
        new RegExp(`then ${grupo}\\b|else ${grupo}\\b`, 'i'),
        `o grupo \`${grupo}\` saiu da chave de agrupamento -- a ordem voltou a ter dois ` +
          `grupos. ORDER BY: ${ordem}`,
      );
    }
    assert.match(
      ordem,
      /"?e"?\."?starts_at"? desc/i,
      `o passado perdeu a ordem decrescente. ORDER BY: ${ordem}`,
    );
  });

  void it('`status` recorta a agenda pela situação calculada', () => {
    const compilada = construtorDaAgenda(semBanco, agenda({ status: 'cancelled' })).compile();
    assert.match(
      compilada.sql,
      /case[\s\S]*?then 'cancelled'[\s\S]*?then 'upcoming'/i,
      'o recorte por `status` não usa a situação calculada. Recortar por ' +
        '`publication_status` entregaria encontro cujo rótulo contradiz o filtro que o ' +
        `trouxe. SQL: ${compilada.sql}`,
    );
    assert.ok(
      compilada.parameters.includes('cancelled'),
      'o valor pedido não chegou como parâmetro ligado -- o recorte não vale. ' +
        `Parâmetros: ${JSON.stringify(compilada.parameters)}`,
    );
  });

  void it('`status` recorta `Meus eventos` pela MESMA expressão da agenda', () => {
    // Duas expressões para a mesma situação divergiriam, e a divergência
    // apareceria como "o filtro funciona numa lista e não na outra".
    const naAgenda = construtorDaAgenda(semBanco, agenda({ status: 'ended' })).compile().sql;
    const nosMeus = construtorDosMeusEncontros(semBanco, meus({ status: 'ended' })).compile().sql;
    const caso = /\(case\s+when[\s\S]*?then 'cancelled'[\s\S]*?end\)/i;
    const daAgenda = naAgenda.match(caso);
    const dosMeus = nosMeus.match(caso);
    assert.ok(daAgenda !== null, `a agenda perdeu a expressão de situação. SQL: ${naAgenda}`);
    assert.ok(dosMeus !== null, `\`Meus eventos\` não recorta por situação. SQL: ${nosMeus}`);
    // O NÚMERO DO PARÂMETRO LIGADO É NORMALIZADO, e isto não é afrouxar o
    // caso: as duas consultas têm quantidades diferentes de parâmetros antes
    // desta expressão (`Meus eventos` liga a conta antes), então `$4` numa é
    // `$6` na outra pela POSIÇÃO e não pelo conteúdo. Sem normalizar, o caso
    // reprovaria com as duas expressões idênticas -- medido na primeira
    // rodada. O que se compara é a forma da expressão, que é o que pode
    // divergir de verdade.
    const semIndice = (sql: string): string => sql.replace(/\$\d+/g, '$N');
    assert.equal(
      semIndice(dosMeus[0]),
      semIndice(daAgenda[0]),
      'as duas listas calculam a situação de formas DIFERENTES. Elas têm de sair da ' +
        'mesma função, senão o mesmo encontro entra num recorte e sai do outro.',
    );
  });

  void it('CONTRAPESO -- sem `status` nada é recortado, e o cancelado continua na lista', () => {
    // O default PRESERVA o comportamento de antes desta entrega. Um
    // `default: upcoming` tiraria da agenda de quem já usa o app o encontro
    // cancelado que ela precisa ver para saber que não vai acontecer.
    const semFiltro = construtorDaAgenda(semBanco, agenda()).compile();
    assert.doesNotMatch(
      semFiltro.sql,
      /then 'cancelled'[\s\S]*?then 'upcoming'[\s\S]*?end\) = \$/i,
      `uma agenda sem \`status\` ganhou recorte por situação. SQL: ${semFiltro.sql}`,
    );
    const semFiltroNosMeus = construtorDosMeusEncontros(semBanco, meus()).compile();
    assert.doesNotMatch(
      semFiltroNosMeus.sql,
      /then 'cancelled'/i,
      `\`Meus eventos\` sem \`status\` ganhou recorte por situação. SQL: ${semFiltroNosMeus.sql}`,
    );
  });
});
