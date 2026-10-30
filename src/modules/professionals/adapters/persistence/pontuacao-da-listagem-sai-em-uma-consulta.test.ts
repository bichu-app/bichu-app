/**
 * ISCA — a pontuacao dos cartoes sai na MESMA consulta da pagina, e o numero de
 * consultas da rota **nao cresce com o numero de cartoes**.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { Instant, OpaqueToken, UserId } from '../../../../shared/types/brands.js';
import type { FamiliaDeSessao } from '../../../identity/ports/localizacao-de-referencia-repository.js';
import type { PaginaDoDiretorio, RecorteDoDiretorio } from '../../ports/directory-repository.js';
import { criarDirectoryRepository } from './kysely-directory-repository.js';

const CONTA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const APARELHO = '018f3a2b-0000-7000-8000-0000000000cc' as FamiliaDeSessao;
const AGORA = 1_792_500_000_000 as Instant;

/** O `ids` nao e exercitado por `listarPublicados`: so a escrita sorteia `ref`. */
const IDS = {
  uuidv7: () => '018f3a2b-0000-7000-8000-00000000ffff',
  opaqueToken: () => 'nao-usado' as OpaqueToken,
  random128: () => new Uint8Array(16),
  random80: () => new Uint8Array(10),
};

/** Uma linha da pagina, com as colunas da entrada E as sete da pontuacao. */
function linha(n: number): Record<string, unknown> {
  return {
    slug: `local-${String(n)}`,
    kinds: ['clinic'],
    entity_kind: 'professional',
    display_name: `Local ${String(n)}`,
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    phone_e164: null,
    site_url: null,
    evidencias: null,
    distancia_em_metros: null,
    logo_public_key: null,
    media: `${String(n % 5)}.${String(n % 10)}`,
    quantidade: String(n),
    n1: '0',
    n2: '0',
    n3: '0',
    n4: '0',
    n5: String(n),
  };
}

interface Medicao {
  readonly pagina: PaginaDoDiretorio;
  readonly consultas: readonly string[];
}

/** A consulta da PAGINA, reconhecida por uma coluna da projecao dela. */
const DA_PAGINA = (sql: string): boolean => sql.includes('as "logo_public_key"');

/** A consulta que CHAMA a funcao da pontuacao, seja ela qual for. */
const CHAMA_A_PONTUACAO = (sql: string): boolean => sql.includes('pontuacao_do_local');

/**
 * `comConta` e uma propriedade EXPLICITA e nao um parametro com padrao: um padrao
 * (`chamador = CONTA`) e aplicado tambem quando se passa `undefined` de proposito,
 * e o caso "sem conta" media a leitura COM conta sem acusar nada.
 */
async function listar(opcoes: { cartoes: number; comConta: boolean }): Promise<Medicao> {
  const { cartoes, comConta } = opcoes;
  const { db, compilado } = bancoDeMentira<Database>((sql) => {
    if (DA_PAGINA(sql)) return Array.from({ length: cartoes }, (_, i) => linha(i + 1));
    if (sql.startsWith('select "user_id" from "user_reference_locations"')) {
      return [{ user_id: CONTA }];
    }
    return [{ total: String(cartoes) }];
  });
  const recorte: RecorteDoDiretorio = {
    chamador: comConta ? CONTA : undefined,
    familia: comConta ? APARELHO : undefined,
    agora: AGORA,
    sort: 'distance',
    page: 1,
    limit: 20,
  };
  const pagina = await criarDirectoryRepository(db, IDS).listarPublicados(recorte);
  return { pagina, consultas: [...compilado] };
}

void describe('ISCA: a pontuacao da listagem do diretorio', () => {
  void it('a listagem emite o MESMO numero de consultas com 1 e com 20 cartoes', async () => {
    const um = await listar({ cartoes: 1, comConta: true });
    const vinte = await listar({ cartoes: 20, comConta: true });
    assert.equal(
      vinte.consultas.length,
      um.consultas.length,
      'REPROVA: a listagem emite mais consultas quando a pagina tem mais ' +
        `cartoes (${String(um.consultas.length)} com 1, ` +
        `${String(vinte.consultas.length)} com 20). E o N+1: uma leitura de ` +
        'pontuacao por item. O agregado tem de sair da consulta da pagina. ' +
        `SQL: ${vinte.consultas.join(' ||| ')}`,
    );
    assert.equal(vinte.consultas.length, 3, `SQL: ${vinte.consultas.join(' ||| ')}`);
    assert.equal(vinte.pagina.itens.length, 20);
  });

  void it('a pontuacao sai da consulta da PAGINA, uma vez por pagina', async () => {
    const { consultas } = await listar({ cartoes: 20, comConta: true });
    const comPontuacao = consultas.filter(CHAMA_A_PONTUACAO);
    assert.equal(
      comPontuacao.length,
      1,
      'REPROVA: a pontuacao nao e lida UMA vez. Zero quer dizer que a listagem ' +
        'voltou a nao agregar nada (o defeito da BICHUS-313); mais de uma quer ' +
        `dizer leitura por item. SQL: ${consultas.join(' ||| ')}`,
    );
    assert.ok(
      /cross join lateral/i.test(comPontuacao[0] ?? ''),
      'REPROVA: a funcao da pontuacao nao entrou como lateral da consulta da ' +
        `pagina. SQL: ${String(comPontuacao[0])}`,
    );
  });

  void it('a pontuacao vem da FUNCAO do banco, e nao de um recorte reescrito', async () => {
    const { consultas } = await listar({ cartoes: 20, comConta: true });
    const pagina = consultas.find(DA_PAGINA) ?? '';
    assert.ok(
      pagina.includes('pontuacao_do_local(pagina.id_do_lateral)'),
      'REPROVA: a consulta da pagina nao chama `pontuacao_do_local`. Um agregado ' +
        'escrito a mao aqui seria a SEGUNDA copia do recorte ' +
        "(`status = 'published'` e `conta_habilitada(author_user_id)`), e o modo " +
        'de falha dessa copia esta na migracao `20261017000017`: "128 avaliacoes" ' +
        `sobre uma lista que mostra 126. SQL: ${pagina}`,
    );
    assert.ok(
      !/avg\s*\(/i.test(pagina) && !/count\s*\(\s*\*\s*\)\s*filter/i.test(pagina),
      'REPROVA: a consulta da pagina calcula a media ou o histograma por conta ' +
        `propria. A regra mora na funcao do banco, e so la. SQL: ${pagina}`,
    );
  });

  void it('o lateral vem DEPOIS do `limit`, e nao no nivel do `where`', async () => {
    const { consultas } = await listar({ cartoes: 20, comConta: true });
    const pagina = consultas.find(DA_PAGINA) ?? '';
    const limite = pagina.indexOf('limit $');
    const lateral = pagina.indexOf('cross join lateral');
    assert.ok(limite !== -1 && lateral !== -1, `SQL sem limit ou sem lateral: ${pagina}`);
    assert.ok(
      limite < lateral,
      'REPROVA: o lateral esta no MESMO nivel do `where`, antes do `limit`. ' +
        'Isso NAO e N+1 -- continua uma consulta, e a contagem de consultas nao ' +
        'o pega --, mas o `limit` acontece depois do `order by`, que acontece ' +
        'depois da juncao: a agregacao roda para TODA entrada do recorte e ' +
        'vinte e nove em cada trinta resultados sao jogados fora. Medido em ' +
        '28/10/2026 com 400 locais publicados e 4800 avaliacoes: `Aggregate` ' +
        'loops=400 e 16 872 buffers contra loops=20 e 909. O custo cresce com o ' +
        `tamanho do CATALOGO, nao da pagina. SQL: ${pagina}`,
    );
  });

  void it('a pontuacao de CADA cartao e a da linha dele', async () => {
    const { pagina } = await listar({ cartoes: 20, comConta: true });
    assert.deepEqual(
      pagina.itens.map((e) => [e.slug, e.pontuacao.media, e.pontuacao.quantidade]),
      Array.from({ length: 20 }, (_, i) => {
        const n = i + 1;
        return [`local-${String(n)}`, Number(`${String(n % 5)}.${String(n % 10)}`), n];
      }),
      'REPROVA: a pontuacao nao acompanha a linha. Pontuacao fixa (ou a vazia ' +
        'para todos) e o duble que aprova sem mecanismo.',
    );
  });

  void it('SEM conta a listagem nao pergunta pela localizacao, e ainda agrega', async () => {
    const { pagina, consultas } = await listar({ cartoes: 5, comConta: false });
    assert.equal(
      consultas.length,
      2,
      `REPROVA: a listagem sem conta nao emite 2 consultas. SQL: ${consultas.join(' ||| ')}`,
    );
    assert.equal(consultas.filter(CHAMA_A_PONTUACAO).length, 1);
    assert.equal(pagina.itens.length, 5);
  });
});
