/**
 * As rotas da escrita administrativa da `Loja`, montadas DENTRO da guarda do
 * prefixo `/v1/admin`, sem banco (BICHUS-266 e BICHUS-267).
 *
 * A sessao e um dublê da porta que o modulo de identidade entrega, o mesmo
 * desenho de `superficie-administrativa.test.ts`; o caso de uso e o de verdade,
 * sobre o repositorio em memoria. O que este arquivo prova sao as iscas do
 * briefing que dependem da ROTA, e nao do caso de uso:
 *
 * - **tutor recebe recusa sem escrita**: conta sem papel `admin` leva 403 e o
 *   repositorio continua vazio, sem linha de trilha;
 * - **retirar sem reautenticacao e recusado**: 401 `reauthentication-required`,
 *   e o item continua publicado;
 * - **corpo com campo extra recebe 400**, e nada e gravado (o Ajv do Fastify o
 *   apagaria em silencio e responderia 201);
 * - **nenhum UUID interno na resposta**, e o `ETag` sai em toda leitura e
 *   escrita;
 * - a declaracao de cada rota bate com o contrato em papel, trilha, escopo de
 *   reautenticacao e balde compartilhado.
 *
 * A mesma matriz contra Postgres, com a sessao real, esta em
 * `tests/integration/escrita-da-loja-pelo-http.test.ts`.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { hashDeToken } from '../../../../shared/crypto/digest.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { problemas } from '../../../../shared/http/errors.js';
import { escoparRotas, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { RouteDefinition } from '../../../../shared/http/route-definition.js';
import { criarServidor } from '../../../../shared/http/server.js';
import {
  escoparRotasAdministrativas,
  type PortaDaSessaoAdministrativa,
  type SessaoAdministrativaConferida,
} from '../../../../shared/http/superficie-administrativa.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import { CatalogoAdministrativo } from '../../application/catalogo-administrativo.js';
import {
  novoId,
  preparadorFalso,
  repositorioEmMemoria,
  type Estado,
} from '../persistence/catalogo-em-memoria-de-teste.js';
import * as rotas from './admin-store-routes.js';

const ORIGEM = 'https://admin.bichu.test';
const BASE = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = Date.UTC(2026, 8, 23, 15, 0, 0) as Instant;
const CSRF_ADMIN = 'csrf-admin-0123456789abcdef0123456789';
const CSRF_TUTOR = 'csrf-tutor-0123456789abcdef0123456789';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function sessao(id: string, csrf: string, papeis: readonly string[]): SessaoAdministrativaConferida {
  return {
    sessionId: `sessao-${id}`,
    userId: `0192a3b4-0000-7000-8000-0000000000${id === 'admin' ? 'a1' : 'b2'}` as UserId,
    displayName: 'Operacao',
    papeis,
    csrfTokenHash: hashDeToken(csrf),
    etiqueta: '0011223344556677',
    idleExpiresAt: comoData(AGORA),
    absoluteExpiresAt: comoData(AGORA),
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly estado: () => Estado;
  readonly janelas: string[];
}

function bancada(): Bancada {
  const sessoes = new Map<string, SessaoAdministrativaConferida>([
    ['cookie-admin', sessao('admin', CSRF_ADMIN, ['admin'])],
    ['cookie-tutor', sessao('tutor', CSRF_TUTOR, ['tutor'])],
  ]);
  const janelas: string[] = [];
  const porta: PortaDaSessaoAdministrativa = {
    conferir: (valor) => {
      const achada = sessoes.get(valor);
      return achada === undefined ? Promise.reject(problemas.naoAutenticado()) : Promise.resolve(achada);
    },
    registrarRecusa: () => Promise.resolve(),
    consumirReautenticacao: (_s, escopo, token) => {
      if (escopo === 'store_item_retirement' && token === 'janela-certa') {
        janelas.push(escopo);
        return Promise.resolve();
      }
      return Promise.reject(problemas.reautenticacaoNecessaria());
    },
  };
  const { repo, estado } = repositorioEmMemoria();
  const catalogo = new CatalogoAdministrativo({
    repositorio: repo,
    envios: preparadorFalso(AGORA),
    ids: {
      uuidv7: novoId,
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
      opaqueToken: () => {
        throw new Error('nao usado');
      },
    },
    clock: { now: () => AGORA },
    urlDeMidia: (chave) => `https://midia.bichu.test/${chave}`,
  });
  const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));

  const app = criarServidor({ problemBaseUrl: BASE, isProduction: false, teto: tetoDeTeste() });
  void escoparRotas(app, '/v1', (v1) => {
    escoparRotasAdministrativas(v1, { origem: ORIGEM, sessoes: porta }, (adm) => {
      rotas.registrarRotasDaLojaAdministrativa(adm, { catalogo, contrato });
    });
  });
  return { app, estado, janelas };
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function chamar(
  b: Bancada,
  metodo: Metodo,
  caminho: string,
  opcoes: { corpo?: unknown; conta?: 'admin' | 'tutor'; ifMatch?: string; reauth?: string } = {},
): Promise<{ status: number; corpo: Record<string, unknown>; etag: string | undefined }> {
  const conta = opcoes.conta ?? 'admin';
  const headers: Record<string, string> = {
    'x-internal-surface': 'admin',
    cookie: `__Host-bichu_adm=cookie-${conta}`,
    origin: ORIGEM,
    'x-csrf-token': conta === 'admin' ? CSRF_ADMIN : CSRF_TUTOR,
  };
  if (opcoes.corpo !== undefined) headers['content-type'] = 'application/json';
  if (opcoes.ifMatch !== undefined) headers['if-match'] = opcoes.ifMatch;
  if (opcoes.reauth !== undefined) headers['x-admin-reauth-token'] = opcoes.reauth;
  const r = await b.app.inject({
    method: metodo,
    url: `/v1${caminho}`,
    headers,
    ...(opcoes.corpo === undefined ? {} : { payload: JSON.stringify(opcoes.corpo) }),
  });
  const etag = r.headers['etag'];
  return {
    status: r.statusCode,
    corpo: r.body === '' ? {} : (JSON.parse(r.body) as Record<string, unknown>),
    etag: typeof etag === 'string' ? etag : undefined,
  };
}

const PARCEIRO = { slug: 'loja-do-bairro', name: 'Loja do Bairro', host: 'lojadobairro.test' };
const ITEM = {
  slug: 'racao-adulto-10kg',
  partner_slug: 'loja-do-bairro',
  title: 'Racao para cao adulto, 10 kg',
  summary: 'Racao seca para caes adultos de porte medio.',
  category: 'food',
  species: ['dog'],
  target_url: 'https://lojadobairro.test/racao-adulto-10kg',
  price: { amount: 18990, currency: 'BRL', checked_at: '2026-09-22' },
};

function tipo(corpo: Record<string, unknown>): string {
  const valor = corpo['type'];
  return typeof valor === 'string' ? (valor.split('/').pop() ?? '') : '';
}

void describe('rotas da escrita administrativa da Loja, dentro da guarda', () => {
  let b: Bancada;
  beforeEach(() => {
    b = bancada();
  });

  void it('o fluxo inteiro, com ETag em cada passo e nenhum UUID na resposta', async () => {
    const p = await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO });
    assert.equal(p.status, 201, JSON.stringify(p.corpo));
    assert.equal(p.etag, '"1"');

    const i = await chamar(b, 'POST', '/admin/store/items', { corpo: ITEM });
    assert.equal(i.status, 201, JSON.stringify(i.corpo));
    assert.equal(i.corpo['publication_state'], 'draft');

    const pub = await chamar(b, 'PUT', `/admin/store/items/${ITEM.slug}/publication`, { ifMatch: i.etag ?? '' });
    assert.equal(pub.status, 200, JSON.stringify(pub.corpo));
    assert.equal(pub.corpo['publication_state'], 'published');

    const lido = await chamar(b, 'GET', `/admin/store/items/${ITEM.slug}`);
    assert.equal(lido.status, 200);
    assert.equal(lido.etag, pub.etag);

    const lista = await chamar(b, 'GET', '/admin/store/items');
    const parceiros = await chamar(b, 'GET', '/admin/store/partners');
    for (const resposta of [p, i, pub, lido, lista, parceiros]) {
      assert.doesNotMatch(JSON.stringify(resposta.corpo), UUID, 'UUID interno na resposta do painel');
    }
    assert.equal(b.estado().trilha.length, 3);
  });

  void it('tag pela rota: 201 com ETag; a segunda grafia e 409; o item a referencia e a lista filtra', async () => {
    const t = await chamar(b, 'POST', '/admin/store/tags', { corpo: { label: 'Porte médio' } });
    assert.equal(t.status, 201, JSON.stringify(t.corpo));
    assert.equal(t.corpo['slug'], 'porte-medio');
    assert.equal(t.etag, '"1"');
    const dup = await chamar(b, 'POST', '/admin/store/tags', { corpo: { label: 'porte medio' } });
    assert.equal(dup.status, 409);
    const campoExtra = await chamar(b, 'POST', '/admin/store/tags', { corpo: { label: 'Outra', slug: 'x' } });
    assert.equal(campoExtra.status, 400);

    await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO });
    const i = await chamar(b, 'POST', '/admin/store/items', { corpo: { ...ITEM, tag_slugs: ['porte-medio'] } });
    assert.equal(i.status, 201, JSON.stringify(i.corpo));
    assert.deepEqual(i.corpo['tags'], [{ slug: 'porte-medio', label: 'Porte médio', active: true }]);
    assert.deepEqual(i.corpo['species'], ['dog']);

    const desativada = await chamar(b, 'PATCH', '/admin/store/tags/porte-medio', {
      corpo: { active: false },
      ifMatch: t.etag ?? '',
    });
    assert.equal(desativada.status, 200, JSON.stringify(desativada.corpo));
    assert.equal(desativada.corpo['active'], false);
  });

  void it('ISCA: tutor recebe 403 e NADA e gravado, nem trilha', async () => {
    const r = await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO, conta: 'tutor' });
    assert.equal(r.status, 403);
    assert.equal(tipo(r.corpo), 'forbidden');
    assert.equal(b.estado().parceiros.size, 0);
    assert.equal(b.estado().trilha.length, 0);
  });

  void it('ISCA: retirar sem X-Admin-Reauth-Token e 401 reauthentication-required, e o item continua publicado', async () => {
    await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO });
    const i = await chamar(b, 'POST', '/admin/store/items', { corpo: ITEM });
    const pub = await chamar(b, 'PUT', `/admin/store/items/${ITEM.slug}/publication`, { ifMatch: i.etag ?? '' });
    const linhas = b.estado().trilha.length;

    const sem = await chamar(b, 'DELETE', `/admin/store/items/${ITEM.slug}/publication`, { ifMatch: pub.etag ?? '' });
    assert.equal(sem.status, 401);
    assert.equal(tipo(sem.corpo), 'reauthentication-required');
    const errada = await chamar(b, 'DELETE', `/admin/store/items/${ITEM.slug}/publication`, {
      ifMatch: pub.etag ?? '',
      reauth: 'janela-de-outro-escopo',
    });
    assert.equal(errada.status, 401);
    assert.equal([...b.estado().itens.values()][0]?.active, true, 'o item saiu da vitrine sem a senha');
    assert.equal(b.estado().trilha.length, linhas);

    const com = await chamar(b, 'DELETE', `/admin/store/items/${ITEM.slug}/publication`, {
      ifMatch: pub.etag ?? '',
      reauth: 'janela-certa',
    });
    assert.equal(com.status, 200, JSON.stringify(com.corpo));
    assert.equal(com.corpo['publication_state'], 'retired');
    assert.deepEqual(b.janelas, ['store_item_retirement']);
  });

  void it('ISCA: corpo com campo extra recebe 400 unknown_field, e nada e gravado', async () => {
    const r = await chamar(b, 'POST', '/admin/store/partners', {
      corpo: { ...PARCEIRO, active: false, verification_level: 'x' },
    });
    assert.equal(r.status, 400, JSON.stringify(r.corpo));
    const campos = (r.corpo['errors'] as { field: string; code: string }[]).map((e) => `${e.field}:${e.code}`);
    assert.deepEqual(campos.sort(), ['active:unknown_field', 'verification_level:unknown_field']);
    assert.equal(b.estado().parceiros.size, 0);
  });

  void it('sem If-Match: 428; If-Match velho: 412', async () => {
    const p = await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO });
    const sem = await chamar(b, 'PATCH', `/admin/store/partners/${PARCEIRO.slug}`, { corpo: { name: 'Novo nome' } });
    assert.equal(sem.status, 428);
    await chamar(b, 'PATCH', `/admin/store/partners/${PARCEIRO.slug}`, {
      corpo: { name: 'Novo nome' },
      ifMatch: p.etag ?? '',
    });
    const velho = await chamar(b, 'PATCH', `/admin/store/partners/${PARCEIRO.slug}`, {
      corpo: { name: 'Outro nome' },
      ifMatch: p.etag ?? '',
    });
    assert.equal(velho.status, 412);
  });

  void it('recurso inexistente: 404; destino fora do host: 400 host_mismatch', async () => {
    const nao = await chamar(b, 'GET', '/admin/store/items/nao-existe');
    assert.equal(nao.status, 404);
    await chamar(b, 'POST', '/admin/store/partners', { corpo: PARCEIRO });
    const fora = await chamar(b, 'POST', '/admin/store/items', {
      corpo: { ...ITEM, target_url: 'https://outraloja.test/x' },
    });
    assert.equal(fora.status, 400);
    assert.deepEqual((fora.corpo['errors'] as { code: string }[]).map((e) => e.code), ['host_mismatch']);
  });

  void it('intencao de envio: 201 com upload_id; SVG e 415', async () => {
    const ok = await chamar(b, 'POST', '/admin/media/catalog-image-intents', {
      corpo: { purpose: 'store_item', content_type: 'image/webp', byte_size: 1000 },
    });
    assert.equal(ok.status, 201, JSON.stringify(ok.corpo));
    assert.equal(typeof ok.corpo['upload_id'], 'string');
    const svg = await chamar(b, 'POST', '/admin/media/catalog-image-intents', {
      corpo: { purpose: 'store_item', content_type: 'image/svg+xml', byte_size: 1000 },
    });
    assert.ok(svg.status === 415 || svg.status === 400, `SVG passou: ${String(svg.status)}`);
    assert.equal(b.estado().intencoes.length, 1);
  });
});

void describe('a declaracao de cada rota bate com o contrato', () => {
  const spec = parseYaml(readFileSync(resolve(process.cwd(), 'api/openapi.yaml'), 'utf8')) as {
    paths: Record<string, Record<string, Record<string, unknown>>>;
  };
  const declaradas: RouteDefinition[] = (Object.values(rotas) as unknown[]).filter(
    (v): v is RouteDefinition => typeof v === 'object' && v !== null && 'operationId' in v,
  );

  function operacao(rota: RouteDefinition): Record<string, unknown> {
    const caminho = rota.path.replace(/:([^/]+)/g, '{$1}');
    const op = spec.paths[caminho]?.[rota.method];
    assert.ok(op, `${rota.operationId} nao existe no contrato em ${rota.method} ${caminho}`);
    return op;
  }

  void it('catorze rotas, todas com operacao no contrato', () => {
    assert.equal(declaradas.length, 14, 'rota nova ou sumida; confira contra o contrato');
    for (const rota of declaradas) assert.equal(operacao(rota)['operationId'], rota.operationId);
  });

  void it('papel, trilha e escopo de reautenticacao iguais ao contrato', () => {
    for (const rota of declaradas) {
      const op = operacao(rota);
      assert.deepEqual(rota.adminRoles, op['x-admin-roles'], rota.operationId);
      const audit = op['x-audit'] as { action: string; resource_kind: string } | undefined;
      assert.deepEqual(
        rota.audit,
        audit === undefined ? undefined : { action: audit.action, resourceKind: audit.resource_kind },
        rota.operationId,
      );
      assert.equal(rota.adminReauthScope, op['x-admin-reauth-scope'], rota.operationId);
    }
  });

  void it('ISCA: o balde compartilhado de cada entrada e o que a `note` do contrato nomeia', () => {
    let comparadas = 0;
    for (const rota of declaradas) {
      const doContrato = (operacao(rota)['x-rate-limit'] ?? []) as { note?: string }[];
      const doCodigo = rota.rateLimit ?? [];
      assert.equal(doCodigo.length, doContrato.length, rota.operationId);
      doContrato.forEach((entrada, n) => {
        const nomeado = /admin_publication/.test(entrada.note ?? '')
          ? 'admin_publication'
          : /admin_write/.test(entrada.note ?? '')
            ? 'admin_write'
            : undefined;
        assert.equal(doCodigo[n]?.bucket, nomeado, `${rota.operationId}, entrada ${String(n)}`);
        comparadas += 1;
      });
    }
    assert.ok(comparadas >= 7, `so ${String(comparadas)} entradas comparadas: o filtro nao achou o que comparar`);
  });
});
