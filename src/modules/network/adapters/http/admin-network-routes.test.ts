/**
 * As rotas da escrita administrativa da `Rede` e da fila de pedidos, montadas
 * DENTRO da guarda do prefixo `/v1/admin`, sem banco (BICHUS-273 e BICHUS-292).
 *
 * A sessao e um duble da porta de identidade (o desenho de
 * `admin-store-routes.test.ts`); o caso de uso e o de verdade, sobre o
 * repositorio em memoria, que desfaz a transacao inteira quando a trilha falha.
 *
 * As iscas do briefing que moram aqui, cada uma com o caso que PRECISA
 * reprovar:
 *
 * - tutor recusado sem escrita (403, nada gravado, nenhuma linha de trilha);
 * - trilha que falha desfaz a escrita (o encontro nao existe depois);
 * - cancelar e remover sem reautenticacao recusados (401), e mover e mudar
 *   acesso tambem;
 * - aprovado -> recusado recusado (400 `request_not_pending`);
 * - leitura da fila sem registro na trilha reprova: a leitura grava a linha, e
 *   com a trilha fora do ar a fila NAO sai.
 *
 * A mesma matriz contra Postgres esta em
 * `tests/integration/escrita-administrativa-da-rede.test.ts`.
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
import { criarServidor } from '../../../../shared/http/server.js';
import {
  escoparRotasAdministrativas,
  type PortaDaSessaoAdministrativa,
  type SessaoAdministrativaConferida,
} from '../../../../shared/http/superficie-administrativa.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { comoData } from '../../../../shared/time/clock.js';
import type { AbsoluteUrl, AdminAccountId, Instant } from '../../../../shared/types/brands.js';
import { RedeAdministrativa } from '../../application/rede-administrativa.js';
import { repositorioDaRedeEmMemoria, type EstadoDaRede } from '../persistence/rede-em-memoria-de-teste.js';
import * as rotas from './admin-network-routes.js';

const ORIGEM = 'https://admin.bichu.test';
const BASE = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = Date.UTC(2026, 8, 28, 15, 0, 0) as Instant;
const CSRF_ADMIN = 'csrf-admin-0123456789abcdef0123456789';
const CSRF_TUTOR = 'csrf-tutor-0123456789abcdef0123456789';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ADMIN_ID = '0192a3b4-0000-7000-8000-0000000000a1' as AdminAccountId;
const ESCOPOS = new Set([
  'network_event_relocation',
  'network_event_cancellation',
  'network_event_removal',
  'network_event_access_change',
]);

function sessao(id: 'admin' | 'tutor', csrf: string, papeis: readonly string[]): SessaoAdministrativaConferida {
  return {
    sessionId: `sessao-${id}`,
    adminAccountId: (id === 'admin' ? ADMIN_ID : '0192a3b4-0000-7000-8000-0000000000b2') as AdminAccountId,
    displayName: 'Operacao',
    papeis,
    csrfTokenHash: hashDeToken(csrf),
    etiqueta: '0011223344556677',
    idleExpiresAt: comoData(AGORA),
    absoluteExpiresAt: comoData(AGORA),
    instanteDaSenha: comoData(AGORA),
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly estado: () => EstadoDaRede;
  readonly semear: (ajuste: (e: EstadoDaRede) => void) => void;
  readonly avisos: { assunto: string; linhas: readonly string[] }[];
  readonly janelas: string[];
  quebrarTrilha: boolean;
}

let contador = 0;
function novoId(): string {
  contador += 1;
  return `0192a3b4-0000-7000-8000-${String(contador).padStart(12, '0')}`;
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
      if (ESCOPOS.has(escopo) && token === `janela-${escopo}`) {
        janelas.push(escopo);
        return Promise.resolve();
      }
      return Promise.reject(problemas.reautenticacaoNecessaria());
    },
  };
  const avisos: { assunto: string; linhas: readonly string[] }[] = [];
  const b = { quebrarTrilha: false } as { quebrarTrilha: boolean };
  const { repo, estado, semear } = repositorioDaRedeEmMemoria({
    trilhaFalha: () => b.quebrarTrilha,
    relogio: () => AGORA,
  });
  let aleatorio = 0;
  const rede = new RedeAdministrativa({
    repositorio: repo,
    avisos: {
      avisar: (aviso) => {
        avisos.push(aviso);
        return Promise.resolve();
      },
    },
    ids: {
      uuidv7: novoId,
      random128: () => {
        aleatorio += 1;
        return new Uint8Array(16).map((_, i) => (i * 37 + aleatorio * 101) % 256);
      },
      random80: () => new Uint8Array(10),
      opaqueToken: () => {
        throw new Error('nao usado');
      },
    },
    clock: { now: () => AGORA },
    urlDeMidia: (chave) => `https://midia.bichu.test/${chave}`,
    registrarOcorrencia: () => undefined,
  });
  const contrato = carregarContrato(resolve(process.cwd(), 'api/openapi.yaml'));
  const app = criarServidor({ problemBaseUrl: BASE, isProduction: false, teto: tetoDeTeste() });
  void escoparRotas(app, '/v1', (v1) => {
    escoparRotasAdministrativas(v1, { origem: ORIGEM, sessoes: porta }, (adm) => {
      rotas.registrarRotasDaRedeAdministrativa(adm, { rede, contrato });
    });
  });
  return Object.assign(b, { app, estado, semear, avisos, janelas });
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function chamar(
  b: Bancada,
  metodo: Metodo,
  caminho: string,
  opcoes: { corpo?: unknown; conta?: 'admin' | 'tutor'; ifMatch?: string; reauth?: string } = {},
): Promise<{ status: number; corpo: Record<string, unknown>; etag: string | undefined; bruto: string; cabecalhos: Record<string, unknown> }> {
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
    bruto: r.body,
    cabecalhos: r.headers,
  };
}

function codigos(corpo: Record<string, unknown>): string[] {
  return ((corpo['errors'] as { code: string }[] | undefined) ?? []).map((e) => e.code);
}

function tipo(corpo: Record<string, unknown>): string {
  const valor = corpo['type'];
  return typeof valor === 'string' ? (valor.split('/').pop() ?? '') : '';
}

const PRACA = {
  title: 'Caminhada no parque',
  summary: 'Encontro de tutores para caminhar com os caes.',
  place: { place_name: 'Parque da Cidade', neighborhood: 'Centro', city: 'Sao Paulo', state: 'SP' },
  starts_at: '2026-10-10T12:00:00Z',
  ends_at: '2026-10-10T14:00:00Z',
};

const PRIVADO = {
  ...PRACA,
  title: 'Encontro fechado de galgos',
  visibility: 'private',
  place: { ...PRACA.place, point: { lat: -23.55, lon: -46.63 } },
};

function acoesNaTrilha(b: Bancada): string[] {
  return b.estado().trilha.map((t) => t.action);
}

void describe('rotas da escrita administrativa da Rede, dentro da guarda', () => {
  let b: Bancada;
  beforeEach(() => {
    b = bancada();
  });

  void it('criar publica, devolve ETag, nao leva UUID nem autor, grava a trilha e avisa os administradores', async () => {
    const r = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    assert.equal(r.status, 201, r.bruto);
    assert.equal(r.etag, '"1"');
    assert.equal(r.corpo['publication_status'], 'published');
    assert.equal(r.corpo['origin'], 'admin');
    assert.equal(r.corpo['slug'], 'caminhada-no-parque');
    assert.deepEqual(r.corpo['accepted_sizes'], ['P', 'M', 'G', 'GG']);
    assert.doesNotMatch(r.bruto, UUID);
    assert.doesNotMatch(r.bruto, /created_by/);
    assert.deepEqual(acoesNaTrilha(b), ['admin.network_event.created']);
    assert.equal(b.avisos.length, 1);
    assert.match(b.avisos[0]?.assunto ?? '', /Encontro criado/);
  });

  void it('ISCA: tutor e recusado com 403, sem escrita e sem linha de trilha', async () => {
    const r = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA, conta: 'tutor' });
    assert.equal(r.status, 403, r.bruto);
    assert.equal(b.estado().encontros.size, 0, 'o tutor gravou um encontro');
    assert.equal(b.estado().trilha.length, 0);
    assert.equal(b.avisos.length, 0);
    const fila = await chamar(b, 'GET', '/admin/network/join-requests', { conta: 'tutor' });
    assert.equal(fila.status, 403);
  });

  void it('ISCA: com a trilha falhando, o encontro NAO e gravado e ninguem e avisado', async () => {
    b.quebrarTrilha = true;
    const r = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    assert.equal(r.status, 500, r.bruto);
    assert.equal(b.estado().encontros.size, 0, 'a escrita sobreviveu a falha da trilha');
    assert.equal(b.avisos.length, 0, 'o aviso saiu de uma escrita desfeita');
  });

  void it('ISCA: cancelar, remover, mover e mudar acesso sem reautenticacao sao recusados com 401', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    const slug = String(criado.corpo['slug']);
    const etag = criado.etag ?? '';
    const tentativas = [
      await chamar(b, 'POST', `/admin/network/events/${slug}/cancellation`, { corpo: { note: 'Obra na praca.' }, ifMatch: etag }),
      await chamar(b, 'DELETE', `/admin/network/events/${slug}`, { ifMatch: etag }),
      await chamar(b, 'POST', `/admin/network/events/${slug}/relocation`, {
        corpo: { starts_at: '2026-10-11T12:00:00Z', ends_at: '2026-10-11T14:00:00Z', reason: 'Chuva no sabado.' },
        ifMatch: etag,
      }),
      await chamar(b, 'POST', `/admin/network/events/${slug}/access`, {
        corpo: { visibility: 'private', reason: 'Passou a ser fechado.' },
        ifMatch: etag,
      }),
      // A janela de OUTRO escopo nao abre esta operacao.
      await chamar(b, 'POST', `/admin/network/events/${slug}/cancellation`, {
        corpo: { note: 'Obra na praca.' },
        ifMatch: etag,
        reauth: 'janela-network_event_removal',
      }),
    ];
    for (const t of tentativas) {
      assert.equal(t.status, 401, t.bruto);
      assert.equal(tipo(t.corpo), 'reauthentication-required');
    }
    const lido = await chamar(b, 'GET', `/admin/network/events/${slug}`);
    assert.equal(lido.corpo['publication_status'], 'published');
    assert.equal(lido.etag, '"1"');
    assert.deepEqual(acoesNaTrilha(b), ['admin.network_event.created']);
  });

  void it('com a janela certa: cancelar avisa e grava; remover e terminal e responde 204', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    const slug = String(criado.corpo['slug']);
    const cancelado = await chamar(b, 'POST', `/admin/network/events/${slug}/cancellation`, {
      corpo: { note: 'A praca vai estar em obra.' },
      ifMatch: criado.etag ?? '',
      reauth: 'janela-network_event_cancellation',
    });
    assert.equal(cancelado.status, 200, cancelado.bruto);
    assert.equal(cancelado.corpo['publication_status'], 'cancelled');
    assert.equal(b.avisos.length, 2);

    const deNovo = await chamar(b, 'POST', `/admin/network/events/${slug}/cancellation`, {
      corpo: { note: 'Outra vez.' },
      ifMatch: cancelado.etag ?? '',
      reauth: 'janela-network_event_cancellation',
    });
    assert.equal(deNovo.status, 400);
    assert.deepEqual(codigos(deNovo.corpo), ['event_not_published']);

    const removido = await chamar(b, 'DELETE', `/admin/network/events/${slug}`, {
      ifMatch: cancelado.etag ?? '',
      reauth: 'janela-network_event_removal',
    });
    assert.equal(removido.status, 204, removido.bruto);
    const editar = await chamar(b, 'PATCH', `/admin/network/events/${slug}`, {
      corpo: { title: 'Outro titulo' },
      ifMatch: '"3"',
    });
    assert.deepEqual(codigos(editar.corpo), ['event_removed']);
    assert.deepEqual(acoesNaTrilha(b), [
      'admin.network_event.created',
      'admin.network_event.cancelled',
      'admin.network_event.removed',
    ]);
  });

  void it('removido some da lista por padrao e so volta com publication_status=removed', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    const slug = String(criado.corpo['slug']);
    await chamar(b, 'DELETE', `/admin/network/events/${slug}`, { ifMatch: criado.etag ?? '', reauth: 'janela-network_event_removal' });
    const padrao = await chamar(b, 'GET', '/admin/network/events');
    assert.equal(padrao.status, 200, padrao.bruto);
    assert.equal(padrao.corpo['total'], 0);
    const removidos = await chamar(b, 'GET', '/admin/network/events?publication_status=removed');
    assert.equal(removidos.corpo['total'], 1);
    assert.deepEqual(removidos.corpo['applied_filters'], { publication_status: 'removed' });
  });

  void it('ISCA do QA (bug 1): sem filtro de visibilidade, a lista do painel traz publico E privado', async () => {
    await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    await chamar(b, 'POST', '/admin/network/events', { corpo: PRIVADO });
    const tudo = await chamar(b, 'GET', '/admin/network/events');
    assert.equal(tudo.status, 200, tudo.bruto);
    assert.equal(tudo.corpo['total'], 2, 'o encontro privado sumiu da lista do painel sem filtro');
    assert.deepEqual(tudo.corpo['applied_filters'], { scope: 'all' });
    const privados = await chamar(b, 'GET', '/admin/network/events?visibility=private');
    assert.equal(privados.corpo['total'], 1);
    assert.deepEqual(privados.corpo['applied_filters'], { visibility: 'private' });
  });

  void it('ISCA do QA (bug 1): o filtro visibility de listAdminNetworkEvents NAO tem default no contrato', () => {
    // O default de `NetworkEventVisibility` (public) e o de quem CRIA. Num
    // parametro de filtro ele vira "so publicos" em todo cliente gerado do
    // contrato, e o encontro privado some da lista do painel.
    const texto = readFileSync(resolve(process.cwd(), 'api/openapi.yaml'), 'utf8');
    const spec = parseYaml(texto) as {
      paths: Record<string, Record<string, { operationId?: string; parameters?: unknown[] }>>;
      components: { schemas: Record<string, Record<string, unknown>> };
    };
    const operacao = spec.paths['/admin/network/events']?.['get'];
    assert.equal(operacao?.operationId, 'listAdminNetworkEvents');
    const parametro = (operacao?.parameters ?? []).find(
      (p): p is { name: string; schema: Record<string, unknown> } =>
        typeof p === 'object' && p !== null && (p as { name?: unknown }).name === 'visibility',
    );
    assert.ok(parametro !== undefined, 'o contrato perdeu o filtro visibility');
    const ref = parametro.schema['$ref'];
    const esquema =
      typeof ref === 'string' ? spec.components.schemas[ref.replace('#/components/schemas/', '')] : parametro.schema;
    assert.equal(esquema?.['default'], undefined, 'o filtro visibility voltou a ter default');
  });

  void it('mover grava point_changed e NUNCA a coordenada na trilha; o aviso diz o antes e o depois', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRIVADO });
    const slug = String(criado.corpo['slug']);
    const movido = await chamar(b, 'POST', `/admin/network/events/${slug}/relocation`, {
      corpo: {
        place: { ...PRACA.place, place_name: 'Praca Nova', point: { lat: -23.6, lon: -46.7 } },
        reason: 'O parque fechou para reforma.',
      },
      ifMatch: criado.etag ?? '',
      reauth: 'janela-network_event_relocation',
    });
    assert.equal(movido.status, 200, movido.bruto);
    const evento = b.estado().trilha.find((t) => t.action === 'admin.network_event.relocated');
    assert.ok(evento !== undefined);
    assert.equal(evento.after?.['point_changed'], true);
    const trilhaInteira = JSON.stringify(b.estado().trilha);
    for (const coordenada of ['-23.55', '-46.63', '-23.6', '-46.7']) {
      assert.ok(!trilhaInteira.includes(coordenada), `a coordenada ${coordenada} foi para a trilha`);
    }
    assert.match(b.avisos.at(-1)?.linhas.join('\n') ?? '', /Praca Nova/);
  });

  void it('privado: slug gerado, que nao carrega o titulo nem o lugar; mandar slug ou troca-lo e recusado', async () => {
    const comSlug = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRIVADO, slug: 'galgos-no-parque' } });
    assert.equal(comSlug.status, 400);
    assert.deepEqual(codigos(comSlug.corpo), ['private_slug_is_generated']);

    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRIVADO });
    assert.equal(criado.status, 201, criado.bruto);
    const slug = String(criado.corpo['slug']);
    assert.match(slug, /^[a-z0-9]{25}$/);
    for (const palavra of ['galgo', 'parque', 'cidade', 'centro']) assert.ok(!slug.includes(palavra));

    const troca = await chamar(b, 'PATCH', `/admin/network/events/${slug}`, {
      corpo: { slug: 'galgos' },
      ifMatch: criado.etag ?? '',
    });
    assert.deepEqual(codigos(troca.corpo), ['private_slug_is_generated']);
  });

  void it('publico que vira privado ganha slug novo, e o antigo passa a 404', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    const antigo = String(criado.corpo['slug']);
    const mudado = await chamar(b, 'POST', `/admin/network/events/${antigo}/access`, {
      corpo: { visibility: 'private', admission: { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_dog' } }, reason: 'Passou a ser fechado.' },
      ifMatch: criado.etag ?? '',
      reauth: 'janela-network_event_access_change',
    });
    assert.equal(mudado.status, 200, mudado.bruto);
    assert.notEqual(mudado.corpo['slug'], antigo);
    assert.deepEqual(mudado.corpo['admission'], { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_dog' } });
    assert.equal((await chamar(b, 'GET', `/admin/network/events/${antigo}`)).status, 404);
    assert.match(b.avisos.at(-1)?.assunto ?? '', /Condição de acesso/);
  });

  void it('D59: observacoes com telefone, e-mail, link, CEP, endereco ou chave PIX sao recusadas; texto com controle bidirecional tambem', async () => {
    for (const notes of [
      'Chame no 11 98765-4321',
      'Escreva para org@exemplo.test',
      'Inscricao em www.exemplo.test/rede',
      'Perto do CEP 01310-100',
      'Na Rua das Flores, 120',
      'Pague no pix da organizacao',
      'Chave 123.456.789-09',
    ]) {
      const r = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, notes } });
      assert.equal(r.status, 400, notes);
      assert.deepEqual(codigos(r.corpo), ['contact_or_payment_detected'], notes);
    }
    const bidi = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, title: 'Caminhada ‮noturna' } });
    assert.deepEqual(codigos(bidi.corpo), ['bidi_control']);
    assert.equal(b.estado().encontros.size, 0);

    const ok = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, notes: 'Traga agua para o seu cao.' } });
    assert.equal(ok.status, 201, ok.bruto);
  });

  void it('mudar as observacoes avisa todos os administradores com o antes e o depois (D60)', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, notes: 'Traga agua.' } });
    const r = await chamar(b, 'PATCH', `/admin/network/events/${String(criado.corpo['slug'])}`, {
      corpo: { notes: 'Traga agua e petisco.' },
      ifMatch: criado.etag ?? '',
    });
    assert.equal(r.status, 200, r.bruto);
    const aviso = b.avisos.at(-1)?.linhas.join('\n') ?? '';
    assert.match(aviso, /Antes: Traga agua\./);
    assert.match(aviso, /Depois: Traga agua e petisco\./);
  });

  void it('encontro que ja terminou e recusado (event_in_past); pago sem valor e recusado (admission_incomplete)', async () => {
    const passado = await chamar(b, 'POST', '/admin/network/events', {
      corpo: { ...PRACA, starts_at: '2026-09-01T12:00:00Z', ends_at: '2026-09-01T14:00:00Z' },
    });
    assert.deepEqual(codigos(passado.corpo), ['event_in_past']);
    const pago = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, admission: { kind: 'paid' } } });
    assert.deepEqual(codigos(pago.corpo), ['admission_incomplete']);
  });

  void it('descricao (01/10): 200 caracteres passam na criacao e na edicao; ISCA: 201 e recusada nas duas', async () => {
    const duzentos = 'a'.repeat(200);
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, summary: duzentos } });
    assert.equal(criado.status, 201, criado.bruto);
    assert.equal(criado.corpo['summary'], duzentos);

    const demais = await chamar(b, 'POST', '/admin/network/events', {
      corpo: { ...PRACA, title: 'Outro encontro', summary: 'a'.repeat(201) },
    });
    assert.equal(demais.status, 400, demais.bruto);
    assert.equal(tipo(demais.corpo), 'validation-failed');

    const slug = String(criado.corpo['slug']);
    const editado = await chamar(b, 'PATCH', `/admin/network/events/${slug}`, {
      corpo: { summary: 'b'.repeat(181) },
      ifMatch: '"1"',
    });
    assert.equal(editado.status, 200, editado.bruto);
    const recusado = await chamar(b, 'PATCH', `/admin/network/events/${slug}`, {
      corpo: { summary: 'b'.repeat(201) },
      ifMatch: '"2"',
    });
    assert.equal(recusado.status, 400, recusado.bruto);
    assert.equal((await chamar(b, 'GET', `/admin/network/events/${slug}`)).corpo['summary'], 'b'.repeat(181));
  });

  void it('endereco (01/10): nasce na criacao, sem mapa; o painel o le; endereco com contato e recusado', async () => {
    const ENDERECO = 'Rua Fradique Coutinho, 1234 - Pinheiros, 05416-001';
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, street_address: `  ${ENDERECO}  ` } });
    assert.equal(criado.status, 201, criado.bruto);
    assert.equal(criado.corpo['street_address'], ENDERECO);
    assert.equal((criado.corpo['place'] as Record<string, unknown>)['point'], null);
    assert.match(b.avisos.at(-1)?.linhas.join('\n') ?? '', /Fradique Coutinho/);

    const semEndereco = await chamar(b, 'POST', '/admin/network/events', { corpo: { ...PRACA, title: 'Sem endereco' } });
    assert.equal(semEndereco.corpo['street_address'], null);

    const comTelefone = await chamar(b, 'POST', '/admin/network/events', {
      corpo: { ...PRACA, title: 'Com telefone', street_address: 'Rua X, 10 - (11) 91234-5678' },
    });
    assert.equal(comTelefone.status, 400, comTelefone.bruto);
    assert.deepEqual(codigos(comTelefone.corpo), ['contact_or_payment_detected']);
  });

  void it('ISCA T11 (01/10): o endereco NAO muda pelo PATCH, que nao pede reautenticacao; muda so por mover', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', {
      corpo: { ...PRACA, street_address: 'Praca Benedito Calixto, s/n - Pinheiros' },
    });
    const slug = String(criado.corpo['slug']);
    const pelaEdicao = await chamar(b, 'PATCH', `/admin/network/events/${slug}`, {
      corpo: { street_address: 'Rua Outra, 99 - Centro' },
      ifMatch: criado.etag ?? '',
    });
    assert.equal(pelaEdicao.status, 400, pelaEdicao.bruto);

    const semJanela = await chamar(b, 'POST', `/admin/network/events/${slug}/relocation`, {
      corpo: { street_address: 'Rua Outra, 99 - Centro', reason: 'Mudou de praca.' },
      ifMatch: criado.etag ?? '',
    });
    assert.equal(semJanela.status, 401, semJanela.bruto);
    assert.equal(
      (await chamar(b, 'GET', `/admin/network/events/${slug}`)).corpo['street_address'],
      'Praca Benedito Calixto, s/n - Pinheiros',
    );

    const movido = await chamar(b, 'POST', `/admin/network/events/${slug}/relocation`, {
      corpo: { street_address: 'Rua Outra, 99 - Centro', reason: 'Mudou de praca.' },
      ifMatch: criado.etag ?? '',
      reauth: 'janela-network_event_relocation',
    });
    assert.equal(movido.status, 200, movido.bruto);
    assert.equal(movido.corpo['street_address'], 'Rua Outra, 99 - Centro');
    const aviso = b.avisos.at(-1)?.linhas.join('\n') ?? '';
    assert.match(aviso, /Endereço antes: Praca Benedito Calixto/);
    assert.match(aviso, /Endereço depois: Rua Outra, 99/);

    const tirado = await chamar(b, 'POST', `/admin/network/events/${slug}/relocation`, {
      corpo: { street_address: null, reason: 'Sem endereco fixo.' },
      ifMatch: movido.etag ?? '',
      reauth: 'janela-network_event_relocation',
    });
    assert.equal(tirado.status, 200, tirado.bruto);
    assert.equal(tirado.corpo['street_address'], null);
  });

  void it('edicao sem If-Match: 428; com versao velha: 412, e nada muda', async () => {
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRACA });
    const slug = String(criado.corpo['slug']);
    assert.equal((await chamar(b, 'PATCH', `/admin/network/events/${slug}`, { corpo: { title: 'Outro' } })).status, 428);
    assert.equal(
      (await chamar(b, 'PATCH', `/admin/network/events/${slug}`, { corpo: { title: 'Outro' }, ifMatch: '"9"' })).status,
      412,
    );
    assert.equal((await chamar(b, 'GET', `/admin/network/events/${slug}`)).corpo['title'], PRACA.title);
  });
});

void describe('a fila de pedidos (D53 a D56)', () => {
  let b: Bancada;
  let slug: string;
  const CONTA = '0192a3b4-0000-7000-8000-00000000c001';

  beforeEach(async () => {
    b = bancada();
    const criado = await chamar(b, 'POST', '/admin/network/events', { corpo: PRIVADO });
    slug = String(criado.corpo['slug']);
    const eventoId = [...b.estado().encontros.values()][0]?.id ?? '';
    b.semear((e) => {
      e.contas.set(CONTA, {
        displayName: null,
        createdAt: comoData(Date.UTC(2025, 2, 14) as Instant),
        emailConfirmado: true,
        email: 'tutora@exemplo.test',
      });
      for (const [n, ref] of ['refPendenteAAAAAAAAAAAA', 'refPendenteBBBBBBBBBBBB'].entries()) {
        const id = `0192a3b4-0000-7000-8000-00000000d00${String(n)}`;
        e.pedidos.set(id, {
          id,
          ref,
          eventoId,
          userId: CONTA,
          decisao: 'pending',
          requestedAt: comoData((AGORA - (10 - n) * 60_000) as Instant),
          decidedAt: null,
          withdrawnAt: null,
          decisor: null,
        });
      }
    });
  });

  void it('D53: so nome de exibicao (null, nunca o e-mail), mes da conta e e-mail confirmado; sem cache', async () => {
    const r = await chamar(b, 'GET', '/admin/network/join-requests');
    assert.equal(r.status, 200, r.bruto);
    assert.match(String(r.cabecalhos['cache-control']), /no-store/);
    const itens = r.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 2);
    assert.deepEqual(itens[0]?.['requester'], { display_name: null, member_since: '2025-03', email_verified: true });
    assert.doesNotMatch(r.bruto, /tutora@exemplo/);
    assert.doesNotMatch(r.bruto, UUID);
  });

  void it('ISCA: leitura da fila sem registro na trilha reprova -- a leitura grava a linha, e sem trilha a fila nao sai', async () => {
    const r = await chamar(b, 'GET', `/admin/network/join-requests?event=${slug}`);
    assert.equal(r.status, 200);
    const linha = b.estado().trilha.find((t) => t.action === 'admin.network_join_request.listed');
    assert.ok(linha !== undefined, 'a leitura da fila nao foi gravada na trilha (D55)');
    assert.equal(linha.metadata?.['rows_returned'], 2);
    assert.deepEqual(linha.metadata?.['filters'], { status: 'pending', event: slug, page: 1, limit: 50 });
    assert.ok(!JSON.stringify(linha).includes('tutora'), 'a trilha da leitura levou dado de pessoa');

    b.quebrarTrilha = true;
    const semTrilha = await chamar(b, 'GET', '/admin/network/join-requests');
    assert.equal(semTrilha.status, 500);
    assert.ok(!semTrilha.bruto.includes('member_since'), 'a fila saiu sem linha de trilha');
  });

  void it('D56: com 300 linhas devolvidas na hora, a fila responde 429 com Retry-After; a pagina e cortada no que falta', async () => {
    b.semear((e) => {
      e.trilha.push({
        actorKind: 'admin',
        actorAdminId: ADMIN_ID,
        action: 'admin.network_join_request.listed',
        resourceKind: 'network_join_request',
        metadata: { rows_returned: 299 },
        em: (AGORA - 10 * 60_000) as Instant,
      });
    });
    const cortada = await chamar(b, 'GET', '/admin/network/join-requests');
    assert.equal(cortada.status, 200);
    assert.equal((cortada.corpo['items'] as unknown[]).length, 1);
    const estourada = await chamar(b, 'GET', '/admin/network/join-requests');
    assert.equal(estourada.status, 429, estourada.bruto);
    assert.equal(estourada.cabecalhos['retry-after'], String(50 * 60));
  });

  void it('aprovar enfileira o push; ISCA: aprovado -> recusado e recusado', async () => {
    const aprovado = await chamar(b, 'POST', '/admin/network/join-requests/refPendenteAAAAAAAAAAAA/approval');
    assert.equal(aprovado.status, 200, aprovado.bruto);
    assert.equal(aprovado.corpo['status'], 'approved');
    assert.deepEqual(
      b.estado().trabalhos.filter((t) => t.kind === 'network.join_request_approved').length,
      1,
    );
    const recusar = await chamar(b, 'POST', '/admin/network/join-requests/refPendenteAAAAAAAAAAAA/decline');
    assert.equal(recusar.status, 400, recusar.bruto);
    assert.deepEqual(codigos(recusar.corpo), ['request_not_pending']);
    const deNovo = await chamar(b, 'POST', '/admin/network/join-requests/refPendenteAAAAAAAAAAAA/approval');
    assert.deepEqual(codigos(deNovo.corpo), ['request_not_pending']);
    assert.deepEqual(
      acoesNaTrilha(b).filter((a) => a.startsWith('admin.network_join_request')),
      ['admin.network_join_request.approved'],
    );
  });

  void it('recusar nao avisa ninguem; recusado pode ser revertido para aprovado, e so ai o push sai', async () => {
    const recusado = await chamar(b, 'POST', '/admin/network/join-requests/refPendenteBBBBBBBBBBBB/decline');
    assert.equal(recusado.status, 200, recusado.bruto);
    assert.equal(b.estado().trabalhos.filter((t) => t.kind === 'network.join_request_approved').length, 0);
    const revertido = await chamar(b, 'POST', '/admin/network/join-requests/refPendenteBBBBBBBBBBBB/approval');
    assert.equal(revertido.status, 200, revertido.bruto);
    assert.equal(b.estado().trabalhos.filter((t) => t.kind === 'network.join_request_approved').length, 1);
    const evento = b.estado().trilha.find((t) => t.action === 'admin.network_join_request.approved');
    assert.deepEqual(evento?.before, { status: 'declined' });
  });

  void it('ISCA (QA 28/09): encontro cancelado, removido ou encerrado nao recebe decisao -- 409 event-not-open', async () => {
    for (const ajuste of [
      { publicacao: 'cancelled' as const },
      { publicacao: 'removed' as const },
      { startsAt: comoData((AGORA - 3 * 3_600_000) as Instant), endsAt: comoData((AGORA - 3_600_000) as Instant) },
    ]) {
      b.semear((e) => {
        for (const [id, g] of e.encontros) e.encontros.set(id, { ...g, publicacao: 'published', ...ajuste });
      });
      for (const acao of ['approval', 'decline']) {
        const r = await chamar(b, 'POST', `/admin/network/join-requests/refPendenteAAAAAAAAAAAA/${acao}`);
        assert.equal(r.status, 409, `${JSON.stringify(ajuste)} ${acao}: ${r.bruto}`);
        assert.equal(tipo(r.corpo), 'event-not-open');
      }
    }
    assert.equal(b.estado().trabalhos.filter((t) => t.kind === 'network.join_request_approved').length, 0);
    assert.ok(!acoesNaTrilha(b).some((a) => a.startsWith('admin.network_join_request.ap')));
  });

  void it('pedido inexistente: 404', async () => {
    const r = await chamar(b, 'POST', '/admin/network/join-requests/refQueNaoExisteXXXXXXXX/approval');
    assert.equal(r.status, 404);
  });
});
