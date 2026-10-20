/**
 * A ISCA do interruptor da pagina publica: **toda ausencia ESCONDE.**
 *
 * ====================================================================
 * POR QUE ESTA ISCA EXISTE
 * ====================================================================
 *
 * `estaPublicada` tem um contrato escrito na porta -- "somente `true` explicito
 * acende" -- e um contrato escrito e uma frase enquanto ninguem o mede. O jeito
 * de ele apodrecer e especifico e conhecido: alguem acha o `try { } catch {
 * return false }` do adaptador "suspeito" (e ele PARECE suspeito -- a casa tem
 * uma regra contra engolir erro), troca por um `throw`, a suite verde nao
 * acusa, e no dia em que a tabela ficar inalcancavel `getLostCase` passa a
 * responder 500. Em `closeLostCase` isso vira o tutor sem conseguir dizer
 * "encontrei meu pet".
 *
 * O caminho oposto e pior e mais silencioso: alguem troca
 * `linha.is_published === true` por `!!linha.is_published`, ou devolve `true`
 * quando a linha nao existe ("nenhuma restricao escrita, entao liberado"), e a
 * acao de compartilhar acende sobre uma pagina que da 404.
 *
 * ====================================================================
 * O DUBLE DEVOLVE O QUE O DRIVER DEVOLVE, E SO ISSO
 * ====================================================================
 *
 * Nada aqui monta resposta de servidor. O duble e um encadeador que termina em
 * `executeTakeFirst`, e os valores que ele devolve sao os tres que o driver de
 * fato produz para esta consulta: a linha com o booleano, `undefined` quando
 * nao ha linha, e a excecao quando a consulta nao completa. O quarto caso --
 * `'t'` em vez de `true` -- esta aqui porque e o que um driver entregaria se o
 * tipo da coluna mudasse, e e justamente o caso que `!!` aprovaria.
 *
 * A consulta em si (o `WHERE page = ...`, o `select` explicito) nao e provada
 * aqui e nao pode ser: SQL se prova contra Postgres. O que esta isca prova e a
 * TRADUCAO do que voltou em acender/esconder, que e onde o erro caro mora.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Db } from '../../../../shared/db/pool.js';
import { criarDisponibilidadeDaPagina } from './kysely-disponibilidade-da-pagina.js';

/** O que `executeTakeFirst` vai fazer: devolver algo, ou estourar. */
type Desfecho = { readonly linha: unknown } | { readonly estoura: Error };

/**
 * Um banco de MENTIRA, encadeavel como o Kysely, que termina no desfecho dado.
 *
 * Registra as tabelas consultadas para que o CONTROLE de cada caso possa provar
 * que a consulta aconteceu -- sem isso, um adaptador que devolvesse `false` sem
 * nunca consultar passaria todos os casos negativos.
 */
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

    // `doesNotReject` e a metade que importa: se um `throw` voltar ao
    // adaptador, a resposta de `LostCase` inteira passa a 500 -- e `LostCase` e
    // o corpo de encerrar e de reabrir o caso, nao so de ler.
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
