/**
 * ISCA — a contagem de encontros novos conta O QUE A AGENDA MOSTRA.
 *
 * ## COMO DESLIGAR O MECANISMO E VER ESTE ARQUIVO REPROVAR
 *
 * Em `kysely-contagem-de-eventos-novos.ts`: apague o `if (recorte.desde !==
 * undefined)` -> reprova `ISCA: ver a sub-aba Eventos zera`. Troque
 * `when: 'upcoming'` por `'all'` -> reprova `ISCA: a contagem usa o MESMO
 * recorte de tempo da agenda`. Troque `published_at` por `created_at` ->
 * reprova `ISCA: o sinal e a PUBLICACAO`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant } from '../../../../shared/types/brands.js';
import { criarContagemDeEventosNovos } from './kysely-contagem-de-eventos-novos.js';

const AGORA = 1_792_500_000_000 as Instant;
const VISTO_EM = 1_792_400_000_000 as Instant;

async function contar(desde?: Instant): Promise<{ total: number; sql: string }> {
  const { db, compilado } = bancoDeMentira<Database>(() => [{ total: '4' }]);
  const total = await criarContagemDeEventosNovos(db).contar({
    agora: AGORA,
    ...(desde === undefined ? {} : { desde }),
  });
  assert.equal(compilado.length, 1, 'a contagem tem de ser UMA consulta');
  return { total, sql: compilado[0] as string };
}

void describe('ISCA: a contagem de encontros novos', () => {
  void it('ISCA: conteudo novo faz o NUMERO APARECER', async () => {
    assert.equal((await contar(VISTO_EM)).total, 4);
  });

  void it('ISCA: ver a sub-aba Eventos zera -- recorte por published_at > marcador', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      /"e"\."published_at" >/.test(sql),
      'REPROVA: a contagem nao recorta pelo marcador. Sem ele a parcela de ' +
        '`Eventos` no selo da aba `Rede` nunca zera. SQL: ' + sql,
    );
  });

  void it('ISCA: o sinal e a PUBLICACAO, e nao a criacao', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      !/"e"\."created_at" >/.test(sql),
      'REPROVA: a contagem compara `created_at`. Um encontro pode nascer em ' +
        'rascunho no painel e ser publicado meses depois; quem entra na agenda ' +
        'e a PUBLICACAO, e contar a criacao poria no selo o que a agenda nao ' +
        'abre. SQL: ' + sql,
    );
  });

  void it('ISCA: SEM marcador tudo conta', async () => {
    const { sql } = await contar();
    assert.ok(
      !/"e"\."published_at" >/.test(sql),
      'REPROVA: predicado de tempo sem marcador. SQL: ' + sql,
    );
  });

  void it('ISCA: a contagem usa o MESMO recorte de tempo da agenda (upcoming)', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      /"e"\."ends_at" is null/.test(sql) && /"e"\."starts_at" >/.test(sql),
      'REPROVA: a contagem nao carrega o recorte `upcoming`. ' +
        '`listNetworkEvents` tem `when` com default `upcoming`, entao sem este ' +
        'recorte um encontro publicado hoje para data que JA PASSOU entra no ' +
        'selo e nao na agenda. SQL: ' + sql,
    );
  });

  void it('ISCA: os predicados de VISIBILIDADE vem do construtor da agenda', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      sql.includes('"e"."publication_status" in') &&
        sql.includes('encontro_com_autor_ativo(e.id)'),
      'REPROVA: a contagem perdeu um predicado de visibilidade. Ela tem de sair ' +
        'de `construtorDaAgenda`: a agenda exclui encontro de autor inativo, e ' +
        'uma contagem que nao exclui poe no selo o que a lista nao mostra. ' +
        'SQL: ' + sql,
    );
  });
});
