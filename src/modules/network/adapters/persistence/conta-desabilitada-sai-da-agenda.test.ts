/**
 * ISCA: o encontro de quem desabilitou a conta sai da agenda, e sai de TODAS as
 * superfícies da Rede de uma vez.
 *
 * ## A decisão
 *
 * O cliente decidiu em 17/10, perguntado se o encontro criado por conta
 * desabilitada deveria sair da agenda. Palavras dele: **"Sim, sai da agenda"**.
 *
 * ## Por que ler o SQL COMPILADO, e não a resposta da rota
 *
 * A proteção não é "a rota não devolveu o encontro": é **onde** a decisão mora.
 * Uma consulta que trouxesse o encontro do autor desabilitado e o descartasse
 * num `filter` da aplicação responderia igual — até o dia em que alguém mexe no
 * `filter`, e aí não existe caso que acuse, porque o `filter` era o caso.
 *
 * É o mesmo instrumento de `autorizacao-na-clausula-where.test.ts`: `DummyDriver`
 * compila a consulta sem banco e sem executá-la, e o caso lê o predicado.
 *
 * ## O que este arquivo mede, e é a parte que importa
 *
 * Ele não confere a agenda. Ele confere que **as sete leituras de encontro
 * compartilham o predicado**, porque todas passam por `consultaBase`. Se alguém
 * separar uma delas da base para tratá-la à parte — que é exatamente como a
 * redefinição de senha ficou meses empurrando a barreira sem revogar família —
 * o furo reabre naquela superfície e só nela, e é esse caso que estes `it`
 * guardam um por um.
 *
 * ## `when=all` e o encontro PASSADO
 *
 * Perguntado explicitamente. O predicado é da consulta base e não da janela de
 * tempo, então o encontro passado de autor desabilitado também sai, nos seis
 * recortes. O caso dos seis recortes está abaixo e é o que prova isso.
 *
 * ## A isca, e como ela SERIA provada
 *
 * **Nada neste arquivo foi executado**, por instrução do cliente nesta rodada
 * (sem suíte unitária, sem integração). O roteiro para provar, quando houver
 * autorização de rodar:
 *
 * | o que desligar em `kysely-network-repository.ts` | esperado |
 * |---|---|
 * | a linha `.where(sql\`encontro_com_autor_ativo(e.id)\`)` de `consultaBase` | TODOS os casos reprovam |
 * | mover o predicado de `consultaBase` para dentro de `construtorDaAgenda` | reprovam os de local, detalhes privados e pedido |
 * | trocar `encontro_com_autor_ativo` por outro nome de função | todos reprovam |
 *
 * Exigência de método, da BICHUS-237: uma prova de isca só conta quando o
 * arquivo de fato mudou entre o antes e o depois (`git diff` não vazio). Sem
 * isso o que se mede é o silêncio da própria tentativa.
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
import type { RecorteDaAgenda, RecorteNoTempo } from '../../ports/network-repository.js';
import { construtorDaAgenda, construtorDoLocal } from './kysely-network-repository.js';

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

/**
 * O predicado, como o compilador do Postgres o escreve.
 *
 * Cobra a CHAMADA com o argumento, e não só o nome da função: um
 * `encontro_com_autor_ativo(NULL)` ou uma menção em comentário não protegem
 * nada. `e"."id` porque o compilador cita cada parte do qualificado.
 */
const PREDICADO_DO_AUTOR = /encontro_com_autor_ativo\(\s*"?e"?\."?id"?\s*\)/;

const SEM_O_PREDICADO =
  'a consulta perdeu `encontro_com_autor_ativo(e.id)`. O encontro de quem desabilitou a ' +
  'conta volta a aparecer nesta superfície, e a decisão do cliente de 17/10 é "Sim, sai da ' +
  'agenda".';

function agenda(when: RecorteNoTempo): RecorteDaAgenda {
  return { when, sort: 'proximos', agora: AGORA, page: 1, limit: 20 };
}

void describe('o encontro de conta desabilitada sai de toda superfície da Rede', () => {
  void it('a agenda PÚBLICA carrega o predicado do autor', () => {
    // `GET /v1/network/events` é `security: []` no contrato. É a superfície de
    // maior exposição da Rede: não exige conta nenhuma para ser lida.
    const compilada = construtorDaAgenda(semBanco, agenda('upcoming')).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('OS SEIS RECORTES carregam o predicado, `past` e `all` inclusive', () => {
    // O ponto deste caso é o PASSADO. Um predicado posto dentro de
    // `recorteNoTempo` cobriria `upcoming` e deixaria `past` e `all` abertos, e
    // o caso acima, sozinho, ficaria verde com esse arranjo.
    const recortes: readonly RecorteNoTempo[] = [
      'upcoming',
      'past',
      'all',
      'today',
      'weekend',
      'next_30_days',
    ];
    for (const when of recortes) {
      const compilada = construtorDaAgenda(semBanco, agenda(when)).compile();
      assert.match(
        compilada.sql,
        PREDICADO_DO_AUTOR,
        `recorte \`${when}\`: ${SEM_O_PREDICADO} SQL: ${compilada.sql}`,
      );
    }
  });

  void it('o LOCAL do encontro carrega o predicado', () => {
    // O local é o ponto no mapa e o endereço por extenso. Vazar o endereço de
    // um encontro que não devia existir é pior do que vazar o título dele.
    const compilada = construtorDoLocal(semBanco, 'encontro-de-teste', CHAMADOR).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('o predicado está na BASE, e por isso o filtro de visibilidade não o desloca', () => {
    // Um predicado acrescentado depois do `recorteOculto` ou depois do filtro de
    // `visibility` seria perdido pelo caminho que não passa por eles. Este caso
    // compila a agenda COM o filtro de visibilidade e exige o predicado junto.
    const compilada = construtorDaAgenda(semBanco, {
      ...agenda('all'),
      visibility: 'private',
    }).compile();
    assert.match(compilada.sql, PREDICADO_DO_AUTOR, `${SEM_O_PREDICADO} SQL: ${compilada.sql}`);
  });

  void it('o predicado NÃO cita a coluna de autoria: ela nunca sai do servidor', () => {
    // `portao-colunas-que-nao-saem.ts` reprova o nome dessa coluna em qualquer
    // arquivo de `src/`, e reprovou a primeira versão do comentário de
    // `consultaBase`. Este caso é a segunda camada, sobre o SQL COMPILADO: ele
    // reprova quem trocar a função de banco por um `innerJoin` que traga a
    // autoria para dentro da consulta da aplicação.
    const compilada = construtorDaAgenda(semBanco, agenda('all')).compile();
    assert.doesNotMatch(
      compilada.sql,
      /created_by/,
      'a consulta passou a citar a coluna de autoria. Ela está marcada "NUNCA sai do ' +
        'servidor" e o predicado existe como FUNÇÃO de banco exatamente para não precisar ' +
        `dela aqui. SQL: ${compilada.sql}`,
    );
  });
});
