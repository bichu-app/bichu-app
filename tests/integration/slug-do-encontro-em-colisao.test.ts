/**
 * A colisao de `slug` na criacao do encontro da comunidade, contra um Postgres
 * de verdade e pelo HTTP (BICHUS, defeito medido em `hml.bichu.app` em
 * 19/10/2026, commit `458cd005`).
 *
 * ===========================================================================
 * O DEFEITO QUE ESTE ARQUIVO PEGA
 * ===========================================================================
 * O `slug` do encontro e derivado do titulo e CORTADO em 30 caracteres, entao
 * dois titulos que so divergem depois do 30o caractere derivam o mesmo `slug`.
 * Em homologacao isso aconteceu com
 *
 *     "[teste] Encontro de tutores no Parque Villa-Lobos"
 *     "[teste] Encontro de tutores no Parque do Povo"
 *
 * -- os dois derivam `teste-encontro-de-tutores-no-p`. O segundo `POST
 * /v1/network/events` respondia **500** (`problems/internal`), e nao 201.
 *
 * A causa, nas duas pontas do mesmo `reqId`: o Postgres recusava com
 * `23505 / network_events_slug_unico`, e `inserirComSlugLivre` capturava o
 * `23505` para tentar o `slug` alternativo **dentro da mesma transacao, que a
 * violacao ja tinha abortado**. A segunda tentativa morria com
 * `25P02 current transaction is aborted`, e o erro subia como 500. **O caminho
 * de desempate era inalcancavel: ele nunca conseguia gravar.**
 *
 * ===========================================================================
 * POR QUE O TESTE PRECISA DE POSTGRES
 * ===========================================================================
 * A suite unitaria tem caso de `slug` ocupado, mas sobre o repositorio em
 * memoria (`rede-em-memoria-de-teste.ts`), que rejeita com
 * `SlugDoEncontroOcupado` e **nao tem transacao**. O defeito e exatamente a
 * transacao: nenhum dublê o reproduz. Por isso este arquivo mora na integracao
 * e sobe o Fastify de verdade com o repositorio de verdade.
 *
 * **A isca foi medida, e nao afirmada** (19/10/2026, Node 22, pilha efemera de
 * `npm run test:integration`, codigo de producao revertido e restaurado):
 *
 * | `inserirLinhaDoEncontro` | integracao |
 * |---|---|
 * | `INSERT` nu mais o `catch` do `23505` | 644 de 648; reprovam o segundo, o terceiro e a conferencia dos tres, os dois primeiros com `500 problems/internal` -- o corpo exato que homologacao devolveu |
 * | `ON CONFLICT (slug) DO NOTHING RETURNING slug` | os quatro casos passam |
 *
 * **Verificacao que nao consegue verificar REPROVA:** sem `DATABASE_URL` o
 * `before` levanta, e o primeiro caso confere que o `slug` sem sufixo saiu
 * antes de qualquer afirmacao sobre o desempate.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createDb, type DbHandle } from '../../src/shared/db/pool.js';
import { carregarContrato } from '../../src/shared/http/contract.js';
import { criarServidor } from '../../src/shared/http/server.js';
import { tetoDeTeste } from '../../src/shared/http/teto-de-teste.js';
import { criarContadorDesligado } from '../../src/shared/http/rate-limit.js';
import { problemas } from '../../src/shared/http/errors.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarIdGenerator } from '../../src/shared/id/uuidv7.js';
import { EncontroDaComunidade } from '../../src/modules/network/application/encontro-da-comunidade.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import { registrarRotasDaRede } from '../../src/modules/network/adapters/http/network-routes.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AbsoluteUrl, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const DOMINIO = 'exemplo.invalid';

/**
 * Os titulos sao os de homologacao com o prefixo trocado por uma isca: os tres
 * derivam `isca-slug-encontro-de-tutores` e so divergem DEPOIS do corte.
 */
const PREFIXO_DO_TITULO = 'isca-slug Encontro de tutores no';
const TITULOS = [
  `${PREFIXO_DO_TITULO} Parque Villa-Lobos`,
  `${PREFIXO_DO_TITULO} Parque do Povo`,
  `${PREFIXO_DO_TITULO} Largo da Batata`,
];

/** O `slug` que os tres titulos derivam sem sufixo, conferido no primeiro caso. */
const BASE = 'isca-slug-encontro-de-tutores';

/**
 * A limpeza, e o que ela precisa alcancar: o `slug` com sufixo tem base mais
 * curta (`...-de-tut-ab12`), porque o sufixo cabe DENTRO dos 30 caracteres.
 */
const LIKE_DA_LIMPEZA = 'isca-slug-encontro-de-tu%';

/** O formato do `CHECK network_events_slug_formato`, COPIADO da migracao. */
const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Teto de 3 encontros ativos por conta: tres criacoes e o maximo de uma conta. */
const AUTOR = randomUUID();

let banco: DbHandle;
let cliente: pg.Client;
let app: RegistradorDeRotas;

interface Resposta {
  readonly status: number;
  readonly corpo: { slug?: unknown; title?: unknown };
  readonly bruto: string;
}

function corpoDoEncontro(title: string): Record<string, unknown> {
  const inicio = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    title,
    summary: 'Encontro de teste para a colisão de slug.',
    place: {
      place_name: 'Parque Comum',
      neighborhood: 'Bairro Comum',
      city: 'São Paulo',
      state: 'SP',
    },
    starts_at: inicio.toISOString(),
    ends_at: new Date(inicio.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

async function criar(title: string): Promise<Resposta> {
  const r = await app.inject({
    method: 'POST',
    url: '/v1/network/events',
    headers: { authorization: `Bearer ${AUTOR}` },
    payload: corpoDoEncontro(title),
  });
  return { status: r.statusCode, corpo: r.json<{ slug?: unknown }>(), bruto: r.body };
}

async function limpar(): Promise<void> {
  await cliente.query('DELETE FROM network_events WHERE slug LIKE $1', [LIKE_DA_LIMPEZA]);
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error('DATABASE_URL ausente: este arquivo precisa de um Postgres de verdade.');
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  // Rodada anterior interrompida deixaria o `slug` sem sufixo ocupado, e o
  // primeiro caso mediria o desempate em vez da base.
  await limpar();

  // O canal verificado e a unica regua de quem pode criar (ADR-0025 emenda 3).
  await cliente.query(
    `INSERT INTO users (id, email, display_name, email_verified_at, public_ref)
     VALUES ($1, $2, $3, now(),
       translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_'))`,
    [AUTOR, `isca-slug-${AUTOR}@${DOMINIO}`, 'Conta da isca de slug'],
  );

  const contrato = carregarContrato('api/openapi.yaml');
  app = criarServidor({
    problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  void app.register(
    (escopo, _opcoes, pronto) => {
      const rede = criarNetworkRepository(
        banco.db,
        { uuidv7: () => randomUUID() },
        (chave) => `https://midia.exemplo.invalid/${chave}`,
      );
      registrarRotasDaRede(escopo, {
        rede,
        autenticador: {
          autenticar: (token: string) =>
            FORMA_DE_UUID.test(token)
              ? Promise.resolve({ userId: token as UserId })
              : Promise.reject(problemas.naoAutenticado()),
        },
        clock: systemClock,
        escritas: new EncontroDaComunidade({
          rede,
          trilha: { record: () => Promise.resolve() },
          ids: criarIdGenerator(() => Date.now()),
          clock: systemClock,
        }),
        contrato,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  await app.ready();
});

after(async () => {
  if (cliente !== undefined) {
    await limpar();
    await cliente.query('DELETE FROM users WHERE id = $1::uuid', [AUTOR]);
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
  if (app !== undefined) await app.close();
});

void describe('dois titulos que colidem nos 30 primeiros caracteres', () => {
  const slugs: string[] = [];

  void it('o primeiro grava com o `slug` derivado, sem sufixo', async () => {
    const r = await criar(TITULOS[0] as string);
    assert.equal(r.status, 201, r.bruto);
    assert.equal(r.corpo.slug, BASE);
    slugs.push(BASE);
  });

  void it('o segundo responde 201, e NAO 500: o desempate grava', async () => {
    const r = await criar(TITULOS[1] as string);
    // Era aqui que saia `500 problems/internal`, por `25P02` depois do `23505`.
    assert.equal(r.status, 201, r.bruto);
    assert.notEqual(r.corpo.slug, BASE);
    assert.match(r.corpo.slug as string, FORMATO_DE_SLUG);
    slugs.push(r.corpo.slug as string);
  });

  void it('o terceiro tambem: o desempate nao e de uma vez so', async () => {
    const r = await criar(TITULOS[2] as string);
    assert.equal(r.status, 201, r.bruto);
    assert.match(r.corpo.slug as string, FORMATO_DE_SLUG);
    slugs.push(r.corpo.slug as string);
  });

  void it('os tres `slug` sao distintos, e as tres linhas estao gravadas', async () => {
    assert.equal(new Set(slugs).size, 3, `slugs: ${slugs.join(', ')}`);
    const r = await cliente.query<{ slug: string; title: string; origin: string; publication_status: string }>(
      'SELECT slug, title, origin, publication_status FROM network_events WHERE slug = ANY($1::text[]) ORDER BY slug',
      [slugs],
    );
    assert.equal(r.rows.length, 3);
    for (const linha of r.rows) {
      assert.equal(linha.origin, 'community');
      assert.equal(linha.publication_status, 'published');
    }
    // Os tres titulos chegaram inteiros: o corte e do `slug`, e nao do titulo.
    assert.deepEqual(
      r.rows.map((l) => l.title).sort(),
      [...TITULOS].sort(),
    );
  });
});
