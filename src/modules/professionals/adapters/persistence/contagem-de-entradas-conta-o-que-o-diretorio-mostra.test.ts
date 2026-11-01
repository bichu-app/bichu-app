import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, UserId } from '../../../../shared/types/brands.js';
import { criarContagemDeEntradasNovas } from './kysely-contagem-de-entradas-novas.js';

const CONTA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = 1_792_500_000_000 as Instant;
const VISTO_EM = 1_792_400_000_000 as Instant;

async function contar(desde?: Instant): Promise<{ total: number; sql: string }> {
  const { db, compilado } = bancoDeMentira<Database>(() => [{ total: '9' }]);
  const total = await criarContagemDeEntradasNovas(db).contar({
    chamador: CONTA,
    agora: AGORA,
    ...(desde === undefined ? {} : { desde }),
  });
  assert.equal(compilado.length, 1, 'a contagem tem de ser UMA consulta');
  return { total, sql: compilado[0] as string };
}

void describe('ISCA: a contagem de entradas novas do diretorio', () => {
  void it('ISCA: conteudo novo faz o NUMERO APARECER', async () => {
    assert.equal((await contar(VISTO_EM)).total, 9);
  });

  void it('ISCA: ver a sub-aba Comunidade zera -- recorte pelo marcador', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      /published_at, professionals\.created_at\) >/.test(sql),
      'REPROVA: a contagem nao recorta pelo marcador. Sem ele a parcela do ' +
        'diretorio no selo da aba `Rede` nunca zera. SQL: ' + sql,
    );
  });

  void it('ISCA: entrada publicada com published_at nulo NAO fica invisivel', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      sql.includes('COALESCE(professionals.published_at, professionals.created_at) >'),
      'REPROVA: a contagem compara `published_at` CRU. A coluna e ANULAVEL e ' +
        '**nao ha `CHECK`** que a exija quando `status = published` -- medido nas ' +
        '80 migracoes: a `20260922000021` a cria sem restricao, e o `COMMENT` ' +
        'dela so descreve a intencao. Sem o `COALESCE`, a entrada publicada com ' +
        '`published_at` nulo aparece na lista e NUNCA no selo: e o defeito ' +
        'calado, que nenhum portao ve e que so se acha contando a mao. SQL: ' +
        sql,
    );
  });

  void it('ISCA: SEM marcador tudo conta', async () => {
    const { sql } = await contar();
    assert.ok(
      !/published_at, professionals\.created_at\) >/.test(sql),
      'REPROVA: predicado de tempo sem marcador. SQL: ' + sql,
    );
  });

  void it('ISCA: os predicados de PUBLICACAO vem do construtor da listagem', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      sql.includes('"status" = $') &&
        sql.includes('conta_habilitada(professionals.claimed_by_user_id)'),
      'REPROVA: a contagem perdeu um predicado de publicacao. `construtorDaListagem` ' +
        'e "o unico caminho de leitura do diretorio, e a contagem e a pagina a ' +
        'chamam as duas" -- esta escrito nele. Predicado posto so num dos ' +
        'caminhos da selo maior que a lista. SQL: ' + sql,
    );
  });

  void it('ISCA: a contagem NAO ordena por distancia', async () => {
    const { sql } = await contar(VISTO_EM);
    assert.ok(
      !sql.includes('distancia_m') && !sql.toLowerCase().includes('order by'),
      'REPROVA: a contagem ordena. `sort: distance` pede a localizacao de ' +
        'referencia do chamador e um calculo de distancia por linha, para um ' +
        'numero que nao depende de ordem nenhuma. SQL: ' + sql,
    );
  });
});
