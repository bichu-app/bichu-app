import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant } from '../../../../shared/types/brands.js';
import { criarContagemDePerdidosNovos } from './kysely-contagem-de-perdidos-novos.js';

const AGORA = 1_792_500_000_000 as Instant;
const VISTO_EM = 1_792_400_000_000 as Instant;

async function contar(
  recorte: { desde?: Instant; cidade?: string },
): Promise<{ total: number; sql: string }> {
  const { db, compilado } = bancoDeMentira<Database>(() => [{ total: '7' }]);
  const total = await criarContagemDePerdidosNovos(db).contar({ agora: AGORA, ...recorte });
  assert.equal(compilado.length, 1, 'a contagem tem de ser UMA consulta');
  return { total, sql: compilado[0] as string };
}

void describe('ISCA: a contagem de perdidos novos', () => {
  void it('ISCA: conteudo novo faz o NUMERO APARECER', async () => {
    const { total } = await contar({ desde: VISTO_EM });
    assert.equal(
      total,
      7,
      'REPROVA: a contagem nao devolveu o numero que o banco respondeu.',
    );
  });

  void it('ISCA: ver a aba Pets zera -- recorte por last_seen_at > marcador', async () => {
    const { sql } = await contar({ desde: VISTO_EM });
    assert.ok(
      /"lost_cases"\."last_seen_at" >/.test(sql),
      'REPROVA: a contagem nao recorta por `last_seen_at > marcador`. Sem este ' +
        'predicado o selo da aba `Pets` NUNCA zera: a pessoa abre a lista, ve ' +
        'tudo, e o numero continua aceso para sempre. SQL: ' +
        sql,
    );
  });

  void it('ISCA: SEM marcador tudo conta -- nao ha predicado de tempo nenhum', async () => {
    const { sql } = await contar({});
    assert.ok(
      !/"lost_cases"\."last_seen_at" >/.test(sql),
      'REPROVA: a contagem poe predicado de tempo sem marcador. Ausencia de ' +
        'linha em `section_list_views` e "nunca viu a area", e nesse estado ' +
        'TODO item conta -- nascer com o marcador em `now()` esconderia de quem ' +
        'acabou de instalar tudo o que a comunidade ja tem. SQL: ' +
        sql,
    );
  });

  void it('ISCA: os predicados de PUBLICACAO vem do construtor da listagem', async () => {
    const { sql } = await contar({ desde: VISTO_EM });
    for (const pedaco of [
      '"lost_cases"."status" = $',
      '"share_to_public_list"',
      'conta_habilitada(lost_cases.owner_user_id)',
      '"pets"."deleted_at" is null',
    ]) {
      assert.ok(
        sql.includes(pedaco),
        `REPROVA: falta \`${pedaco}\` na contagem. Ela tem de sair de ` +
          '`construtorDaListagemPublicaDePerdidos`, que e exportado EXATAMENTE ' +
          'para a contagem e a pagina nao divergirem -- esta escrito no ' +
          'cabecalho dele. Reescrever os predicados a mao poe o selo contando ' +
          'caso que a lista nao mostra. SQL: ' +
          sql,
      );
    }
  });

  void it('ISCA: a cidade entra NORMALIZADA, como na listagem', async () => {
    const { sql } = await contar({ desde: VISTO_EM, cidade: 'Campinas' });
    assert.ok(
      sql.includes('texto_para_busca(lost_cases.last_seen_city) = texto_para_busca($'),
      'REPROVA: a cidade nao entra pela comparacao normalizada do banco. Um `=` ' +
        'cru responderia vazio para quem digitou com acento diferente do que o ' +
        'tutor gravou, e o selo ficaria em zero numa cidade cheia de casos. ' +
        'SQL: ' +
        sql,
    );
  });

  void it('ISCA: sem cidade NAO ha predicado de cidade -- geografia aberta', async () => {
    const { sql } = await contar({ desde: VISTO_EM });
    assert.ok(
      !sql.includes('last_seen_city'),
      'REPROVA: a contagem recortou por cidade sem cidade pedida. Geografia ' +
        'aberta e a AUSENCIA do predicado, e nao um valor-sentinela. SQL: ' + sql,
    );
  });

  void it('ISCA: a JANELA de 30 dias NAO entra -- o recorte de tempo e o marcador', async () => {
    const { sql } = await contar({ desde: VISTO_EM });
    const comparacoesDeData = sql.match(/"lost_cases"\."last_seen_at" >/g) ?? [];
    assert.equal(
      comparacoesDeData.length,
      1,
      'REPROVA: ha mais de uma comparacao de `last_seen_at` na contagem. A aba ' +
        'abre SEM janela desde 18/10/2026 (decisao do cliente), e somar a ' +
        'janela de 30 dias aqui esconderia do selo o caso que a lista mostra. ' +
        'SQL: ' +
        sql,
    );
  });
});
