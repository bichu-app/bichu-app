import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bancoDeMentira } from '../../../../shared/db/banco-de-teste-que-devolve-linha.js';
import type { Database } from '../../../../shared/db/schema.js';
import type { PaginaDaFila } from '../../ports/fila-de-indicacoes.js';
import {
  criarFilaDeIndicacoesRepository,
  type DependenciasDaFilaDeIndicacoes,
} from './kysely-fila-de-indicacoes.js';

const DA_PAGINA = (sql: string): boolean => sql.includes('AS foto_card_keys');

const TOCA_AS_FOTOS = (sql: string): boolean => sql.includes('directory_suggestion_images');

function linha(n: number): Record<string, unknown> {
  return {
    ref: `ref-${String(n)}`,
    display_name: `Clínica ${String(n)}`,
    kind: 'clinic',
    entity_kind: 'organization',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Bela Vista',
    contact_kind: 'phone',
    contact_value: '+551130612200',
    note: null,
    review_status: 'pending',
    created_at: new Date(Date.UTC(2026, 9, 30, 12, 0, n)),
    decided_at: null,
    decline_reason: null,
    entry_slug: null,
    logo_thumb_key: `directory/thumb/bG9nby0${String(n)}.webp`,
    foto_card_keys: [`directory/card/Zm90by0${String(n)}.webp`],
    fotos_total: String(n % 4),
  };
}

interface Medicao {
  readonly pagina: PaginaDaFila;
  readonly consultas: readonly string[];
}

const DEPS_SEM_TRANSACAO = {} as unknown as Omit<DependenciasDaFilaDeIndicacoes, 'db'>;

async function listar(linhas: number): Promise<Medicao> {
  const { db, compilado } = bancoDeMentira<Database>((sql) => {
    if (DA_PAGINA(sql)) return Array.from({ length: linhas }, (_, i) => linha(i + 1));
    return [{ total: String(linhas) }];
  });
  const repositorio = criarFilaDeIndicacoesRepository({ ...DEPS_SEM_TRANSACAO, db });
  const pagina = await repositorio.listar({ page: 1, limit: 20 });
  return { pagina, consultas: [...compilado] };
}

void describe('ISCA: as imagens da fila de indicacoes', () => {
  void it('a fila emite o MESMO numero de consultas com 1 e com 20 linhas', async () => {
    const uma = await listar(1);
    const vinte = await listar(20);

    assert.equal(
      vinte.consultas.length,
      uma.consultas.length,
      'REPROVA: a fila emite mais consultas quando a pagina tem mais linhas ' +
        `(${String(uma.consultas.length)} com 1, ${String(vinte.consultas.length)} com 20). ` +
        'E o N+1: uma leitura de imagem por indicacao. As tres projecoes de imagem ' +
        `tem de sair da consulta da pagina. SQL: ${vinte.consultas.join(' ||| ')}`,
    );
    assert.equal(vinte.consultas.length, 3, `SQL: ${vinte.consultas.join(' ||| ')}`);
    assert.equal(vinte.pagina.itens.length, 20);
  });

  void it('a tabela das fotos e tocada SO na consulta da pagina, uma vez por pagina', async () => {
    const { consultas } = await listar(20);
    const comFotos = consultas.filter(TOCA_AS_FOTOS);

    assert.equal(
      comFotos.length,
      1,
      'REPROVA: `directory_suggestion_images` nao e lida UMA vez por pagina. Zero quer ' +
        'dizer que a projecao voltou a nao ler imagem nenhuma (o estado da ' +
        '`20261029000004`, em que o revisor decidia sem ver); mais de uma quer dizer ' +
        `leitura por item. SQL: ${consultas.join(' ||| ')}`,
    );
    assert.ok(DA_PAGINA(comFotos[0] ?? ''), 'a leitura das fotos nao e a consulta da pagina');
  });

  void it('as TRES projecoes de imagem saem da consulta da PAGINA', async () => {
    const { consultas } = await listar(20);
    const pagina = consultas.find(DA_PAGINA) ?? '';

    for (const esperado of ['AS logo_thumb_key', 'AS foto_card_keys', 'AS fotos_total']) {
      assert.ok(pagina.includes(esperado), `a consulta da pagina nao projeta ${esperado}: ${pagina}`);
    }
    assert.ok(
      pagina.includes('ORDER BY i.position'),
      `as fotos nao saem ordenadas por \`position\` (a 0 e a capa): ${pagina}`,
    );
  });

  void it('`foto_card_keys` filtra as `ready` DENTRO da propria subconsulta', async () => {
    const { consultas } = await listar(20);
    const pagina = consultas.find(DA_PAGINA) ?? '';
    const inicio = pagina.indexOf('(SELECT coalesce(json_agg');
    const fim = pagina.indexOf('AS foto_card_keys');
    assert.ok(inicio !== -1 && fim > inicio, `nao achei a subconsulta das fotos: ${pagina}`);
    const subconsulta = pagina.slice(inicio, fim);

    assert.ok(
      subconsulta.includes("c.status = 'ready'"),
      'REPROVA: a subconsulta das fotos nao filtra `ready`. Foto que o worker nao ' +
        'terminou -- e foto RECUSADA nos bytes -- entraria em `photo_urls` com ' +
        `\`public_key\` nula. SQL: ${subconsulta}`,
    );
    assert.ok(
      subconsulta.includes('ORDER BY i.position'),
      `a subconsulta das fotos nao ordena por \`position\`: ${subconsulta}`,
    );
  });

  void it('`fotos_total` conta as LINHAS da tabela, sem juntar com `catalog_images`', async () => {
    const { consultas } = await listar(20);
    const pagina = consultas.find(DA_PAGINA) ?? '';
    const contagem = pagina.slice(pagina.indexOf('(SELECT count(*) FROM directory_suggestion_images'));

    assert.ok(contagem.startsWith('(SELECT count(*) FROM directory_suggestion_images'), pagina);
    assert.ok(
      !contagem.slice(0, contagem.indexOf('AS fotos_total')).includes('catalog_images'),
      'REPROVA: a contagem junta com `catalog_images`, e perde a foto cuja imagem ' +
        `o varredor apagou. SQL: ${contagem}`,
    );
  });

  void it('NENHUMA consulta pede `image_id`: o que sai e a chave da derivada (ADR-0010 item 6)', async () => {
    const { consultas, pagina } = await listar(20);
    const daPagina = consultas.find(DA_PAGINA) ?? '';

    assert.ok(
      !/AS\s+\w*image_id/i.test(daPagina),
      `a consulta da pagina projeta um \`image_id\`: ${daPagina}`,
    );
    assert.ok(
      !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(JSON.stringify(pagina)),
      'a pagina carrega um UUID',
    );
  });

  void it('as imagens de CADA linha sao as da linha dela', async () => {
    const { pagina } = await listar(20);

    assert.deepEqual(
      pagina.itens.map((i) => [i.ref, i.logoThumbKey, i.fotoCardKeys, i.fotosTotal]),
      Array.from({ length: 20 }, (_, idx) => {
        const n = idx + 1;
        return [
          `ref-${String(n)}`,
          `directory/thumb/bG9nby0${String(n)}.webp`,
          [`directory/card/Zm90by0${String(n)}.webp`],
          n % 4,
        ];
      }),
      'REPROVA: as imagens nao acompanham a linha. Imagem fixa (ou vazia para todas) ' +
        'e o dublê que aprova sem mecanismo.',
    );
  });
});
