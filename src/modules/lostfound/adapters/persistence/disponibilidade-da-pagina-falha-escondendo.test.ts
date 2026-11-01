import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Db } from '../../../../shared/db/pool.js';
import { criarDisponibilidadeDaPagina } from './kysely-disponibilidade-da-pagina.js';

type Desfecho = { readonly linha: unknown } | { readonly estoura: Error };

function bancoQue(desfecho: Desfecho, consultadas: string[]): Db {
  const executor: Record<string, unknown> = {};
  executor['selectFrom'] = (tabela: string) => {
    consultadas.push(tabela);
    const elo: Record<string, unknown> = {};
    const devolveElo = () => elo;
    for (const metodo of ['select', 'where', 'orderBy', 'limit']) elo[metodo] = devolveElo;
    elo['executeTakeFirst'] = () => {
      if ('estoura' in desfecho) return Promise.reject(desfecho.estoura);
      return Promise.resolve(desfecho.linha);
    };
    return elo;
  };
  return executor as unknown as Db;
}

void describe('o interruptor da pagina publica: somente `true` explicito acende', () => {
  void it('CONTROLE -- com a linha dizendo `true`, acende (sem isto, os casos abaixo nao medem nada)', async () => {
    const consultadas: string[] = [];
    const porta = criarDisponibilidadeDaPagina(bancoQue({ linha: { is_published: true } }, consultadas));

    assert.equal(
      await porta.estaPublicada('lost_case'),
      true,
      'Se nem `is_published: true` acende, o interruptor esta preso em desligado ' +
        'e os casos negativos deste arquivo passariam com o adaptador quebrado.',
    );
    assert.deepEqual(
      consultadas,
      ['site_page_availability'],
      'A leitura tem de ir a tabela do interruptor, e so a ela.',
    );
  });

  void it('com a linha dizendo `false`, ESCONDE', async () => {
    const consultadas: string[] = [];
    const porta = criarDisponibilidadeDaPagina(
      bancoQue({ linha: { is_published: false } }, consultadas),
    );

    assert.equal(await porta.estaPublicada('lost_case'), false);
    assert.deepEqual(consultadas, ['site_page_availability'], 'E consultou de verdade.');
  });

  void it('sem linha nenhuma, ESCONDE -- ausencia nao e permissao', async () => {
    const consultadas: string[] = [];
    const porta = criarDisponibilidadeDaPagina(bancoQue({ linha: undefined }, consultadas));

    assert.equal(
      await porta.estaPublicada('poster'),
      false,
      'Linha ausente significa que ninguem afirmou que a pagina existe. Na tabela ' +
        'irma (`app_version_policy`) a ausencia LIBERA, e aqui ela ESCONDE: o erro ' +
        'caro la e trancar a base, e aqui e publicar link morto em grupo de bairro.',
    );
    assert.deepEqual(consultadas, ['site_page_availability']);
  });

  void it('com o banco fora, ESCONDE e NAO LANCA -- `closeLostCase` nao pode cair por causa deste interruptor', async () => {
    const consultadas: string[] = [];
    const porta = criarDisponibilidadeDaPagina(
      bancoQue({ estoura: new Error('relation "site_page_availability" does not exist') }, consultadas),
    );

    await assert.doesNotReject(
      () => porta.estaPublicada('lost_case'),
      'A porta declara que NUNCA lanca. Uma tabela de configuracao inalcancavel ' +
        'nao tem o direito de impedir o tutor de dizer que encontrou o pet.',
    );
    assert.equal(await porta.estaPublicada('lost_case'), false);
    assert.equal(consultadas.length, 2, 'As duas chamadas acima tentaram consultar.');
  });

  void it('com `is_published` valendo o texto `t`, ESCONDE -- e isto e o que `!!` aprovaria', async () => {
    const consultadas: string[] = [];
    const porta = criarDisponibilidadeDaPagina(
      bancoQue({ linha: { is_published: 't' } }, consultadas),
    );

    assert.equal(
      await porta.estaPublicada('lost_case'),
      false,
      "`'t'` e verdadeiro para `!!` e nao e `true`. O dia em que o tipo da coluna " +
        'mudar, ou um driver passar a entregar texto, o `===` e o que impede o ' +
        'interruptor de acender por conta propria.',
    );
    assert.deepEqual(consultadas, ['site_page_availability']);
  });

  void it('`paginaNenhumaPublicada` esconde as duas paginas', async () => {
    const { paginaNenhumaPublicada } = await import('../../ports/disponibilidade-da-pagina.js');

    assert.equal(await paginaNenhumaPublicada.estaPublicada('lost_case'), false);
    assert.equal(
      await paginaNenhumaPublicada.estaPublicada('poster'),
      false,
      'E o padrao seguro que os arneses de teste usam: esquecer de ligar o ' +
        'adaptador de verdade falha para o lado escondido, nunca para o aceso.',
    );
  });
});
