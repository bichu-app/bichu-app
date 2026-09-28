/**
 * P19, a metade da EXECUCAO (ADR-0027 12.12, `04-seguranca.md` 22.10.4), contra
 * o Postgres de verdade e as rotas de verdade, pelo HTTP.
 *
 * ===========================================================================
 * O QUE ESTE ARQUIVO PROVA, E COMO
 * ===========================================================================
 * 1. **Sentinelas no corpo bruto.** Um encontro privado com TODO campo oculto
 *    preenchido por sentinela (`ISCA-LUGAR`, `ISCA-BAIRRO`, `ISCA-CIDADE`,
 *    `ISCA-RESUMO`, `ISCA-NOTA`, um valor em centavos e um ponto que nao
 *    existem em outra linha, o fuso `America/Porto_Velho`, e toda lista
 *    marcada). As NOVE operacoes que tocam encontro ou pedido sao chamadas como
 *    anonimo, sem pedido, pendente, RECUSADO, desistido e recusado depois de
 *    desistido, **incluindo as respostas de erro (400 e 404)**, e o corpo bruto
 *    e varrido como TEXTO. **Controle positivo:** a mesma varredura sobre
 *    `private-details` do aprovado precisa achar todas as sentinelas.
 * 2. **A recusa nao se distingue do pendente.** Estado do pedido, pedir de
 *    novo, "meus pedidos" e a desistencia sao identicos byte a byte entre a
 *    conta pendente e a recusada, depois de normalizar os carimbos do proprio
 *    pedido e os identificadores de requisicao do corpo de erro. O cabecalho de
 *    cache tambem.
 * 3. **Presenca.** Para cada recorte que toca campo oculto (`q` por bairro e
 *    lugar, `city`, `admission`, `size`, e `max_km` na lista por distancia),
 *    dois privados iguais em tudo menos naquele atributo nunca se separam.
 * 4. **O `slug` do privado nao carrega o lugar.**
 *
 * **O que fica de fora, e por que:** as imagens (a tabela depende de
 * `catalog_images`, que nasce na migracao `20260923000007`, da fatia da Loja)
 * e "a criacao recusa `slug` enviado para privado" (a criacao e
 * `/admin/network/*`, fatia seguinte). Os dois voltam com as fatias deles.
 *
 * **Verificacao que nao consegue verificar reprova:** sem `DATABASE_URL` o
 * `before` levanta, e o controle positivo reprova se a varredura nao enxergar.
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
import { vigiarParametrosDasRotas } from '../../src/shared/http/validacao-de-parametros.js';
import { problemas } from '../../src/shared/http/errors.js';
import type { RegistradorDeRotas } from '../../src/shared/http/registrar-rota.js';
import { criarNetworkRepository } from '../../src/modules/network/adapters/persistence/kysely-network-repository.js';
import { registrarRotasDaRede } from '../../src/modules/network/adapters/http/network-routes.js';
import { systemClock } from '../../src/shared/time/clock.js';
import type { AbsoluteUrl, UserId } from '../../src/shared/types/brands.js';

const CONEXAO = process.env['DATABASE_URL'] ?? process.env['TEST_DATABASE_URL'];
const DOMINIO = 'exemplo.invalid';
const PREFIXO_DO_TITULO = 'P19 isca';

/** As sentinelas. Nenhuma aparece em outra linha do banco. */
const LAT = -9.87654;
const LON = -38.76543;
const SENTINELAS = [
  'ISCA-LUGAR',
  'ISCA-BAIRRO',
  'ISCA-CIDADE',
  'ISCA-RESUMO',
  'ISCA-NOTA',
  '987654',
  'Porto_Velho',
  String(LAT),
  String(LON),
  'dog_water_fountain',
  'vaccination_card',
  'from_1_year',
];

/** O `slug` do privado, aleatorio, como o servidor o gera. */
const SLUG_PRIVADO = `p-${randomUUID().slice(0, 10)}`;

/** Os pares de presenca: iguais em tudo menos num atributo oculto. */
interface Par {
  readonly nome: string;
  readonly a: string;
  readonly b: string;
}
const PARES: Par[] = [];

type Conta = 'sem_pedido' | 'pendente' | 'recusado' | 'desistido' | 'recusado_desistido' | 'aprovado';
const CONTAS: Record<Conta, string> = {
  sem_pedido: randomUUID(),
  pendente: randomUUID(),
  recusado: randomUUID(),
  desistido: randomUUID(),
  recusado_desistido: randomUUID(),
  aprovado: randomUUID(),
};

let banco: DbHandle;
let cliente: pg.Client;
let app: RegistradorDeRotas;
const eventos: string[] = [];

interface Resposta {
  readonly status: number;
  readonly bruto: string;
  readonly cache: string | undefined;
}

async function chamar(
  metodo: 'GET' | 'POST' | 'DELETE',
  url: string,
  conta?: Conta,
): Promise<Resposta> {
  const r = await app.inject({
    method: metodo,
    url: `/v1${url}`,
    ...(conta === undefined ? {} : { headers: { authorization: `Bearer ${CONTAS[conta]}` } }),
  });
  const cache = r.headers['cache-control'];
  return { status: r.statusCode, bruto: r.body, cache: typeof cache === 'string' ? cache : undefined };
}

/** Normaliza os carimbos do proprio pedido e os identificadores da requisicao. */
function normalizado(bruto: string): string {
  return bruto
    .replace(/"requested_at":"[^"]+"/g, '"requested_at":"<carimbo>"')
    .replace(/"correlation_id":"[^"]+"/g, '"correlation_id":"<id>"')
    .replace(/"instance":"[^"]+"/g, '"instance":"<instancia>"');
}

interface Encontro {
  readonly slug: string;
  readonly title: string;
  readonly visibility?: 'public' | 'private';
  readonly placeName?: string;
  readonly neighborhood?: string;
  readonly city?: string;
  readonly summary?: string;
  readonly notes?: string | null;
  readonly centavos?: number | null;
  readonly ponto?: { lat: number; lon: number } | null;
  readonly timeZone?: string;
  readonly portes?: string[];
  readonly idade?: string;
  readonly estrutura?: string[];
  readonly levar?: string[];
  readonly diasAFrente?: number;
}

async function inserirEncontro(e: Encontro): Promise<string> {
  const id = randomUUID();
  const pago = e.centavos ?? null;
  await cliente.query(
    `INSERT INTO network_events (
       id, slug, title, summary, place_name, neighborhood, city, state,
       geo, geo_source, starts_at, ends_at, time_zone, origin, publication_status, published_at,
       visibility, admission_kind, admission_amount, admission_currency, admission_unit,
       dog_age, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'SP',
       CASE WHEN $8::float8 IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9::float8, $8::float8), 4326)::geography END,
       CASE WHEN $8::float8 IS NULL THEN NULL ELSE 'map_pin' END,
       now() + make_interval(days => $10::int), now() + make_interval(days => $10::int, hours => 2),
       $11, 'admin', 'published', now() - interval '1 day',
       $12, $13, $14, $15, $16, $17, $18)`,
    [
      id,
      e.slug,
      e.title,
      e.summary ?? 'Resumo comum aos pares.',
      e.placeName ?? 'Praca Comum',
      e.neighborhood ?? 'Bairro Comum',
      e.city ?? 'Cidade Comum',
      e.ponto?.lat ?? null,
      e.ponto?.lon ?? null,
      e.diasAFrente ?? 3,
      e.timeZone ?? 'America/Sao_Paulo',
      e.visibility ?? 'private',
      pago === null ? 'free' : 'paid',
      pago,
      pago === null ? null : 'BRL',
      pago === null ? null : 'per_pair',
      e.idade ?? 'any',
      e.notes ?? null,
    ],
  );
  for (const porte of e.portes ?? ['P', 'M', 'G', 'GG']) {
    await cliente.query('INSERT INTO network_event_sizes (event_id, size) VALUES ($1, $2)', [id, porte]);
  }
  for (const item of e.estrutura ?? []) {
    await cliente.query('INSERT INTO network_event_amenities (event_id, amenity) VALUES ($1, $2)', [id, item]);
  }
  for (const item of e.levar ?? []) {
    await cliente.query('INSERT INTO network_event_bring_items (event_id, item) VALUES ($1, $2)', [id, item]);
  }
  eventos.push(id);
  return id;
}

async function decidir(eventId: string, conta: Conta, status: string, desistido = false): Promise<void> {
  await cliente.query(
    `INSERT INTO network_event_join_requests (id, ref, event_id, user_id, status, decided_at, withdrawn_at)
     VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $5 = 'pending' THEN NULL ELSE now() END,
             CASE WHEN $6::boolean THEN now() END)`,
    [randomUUID(), randomUUID().replace(/-/g, '').slice(0, 24), eventId, CONTAS[conta], status, desistido],
  );
}

before(async () => {
  if (CONEXAO === undefined || CONEXAO === '') {
    throw new Error('DATABASE_URL nao esta definida: o P19 sem banco nao prova nada. Rode `npm run test:integration`.');
  }
  banco = createDb(CONEXAO);
  cliente = new pg.Client({ connectionString: CONEXAO });
  await cliente.connect();

  for (const [nome, id] of Object.entries(CONTAS)) {
    await cliente.query('INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)', [
      id,
      `p19-${nome}-${id}@${DOMINIO}`,
      `Conta ${nome}`,
    ]);
  }
  // Quem pede a lista por distancia tem regiao cadastrada, perto do ponto
  // sentinela: se o privado entrasse, entraria primeiro.
  for (const id of Object.values(CONTAS)) {
    await cliente.query(
      `INSERT INTO user_reference_locations (user_id, reference_point, precision_m, source, captured_at, expires_at)
       VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, 100, 'map_pin', now(), now() + interval '1 day')`,
      [id, LON, LAT],
    );
  }

  const privado = await inserirEncontro({
    slug: SLUG_PRIVADO,
    title: `${PREFIXO_DO_TITULO} principal`,
    placeName: 'ISCA-LUGAR',
    neighborhood: 'ISCA-BAIRRO',
    city: 'ISCA-CIDADE',
    summary: 'ISCA-RESUMO',
    notes: 'ISCA-NOTA',
    centavos: 987654,
    ponto: { lat: LAT, lon: LON },
    timeZone: 'America/Porto_Velho',
    idade: 'from_1_year',
    estrutura: ['level_ground_or_ramp', 'accessible_restroom', 'public_restroom_nearby', 'shade', 'benches', 'dog_water_fountain', 'parking_nearby'],
    levar: ['water', 'water_bowl', 'leash', 'poop_bags', 'treats', 'towel', 'vaccination_card', 'toy'],
  });
  await decidir(privado, 'pendente', 'pending');
  await decidir(privado, 'recusado', 'declined');
  await decidir(privado, 'recusado_desistido', 'declined', true);
  await decidir(privado, 'aprovado', 'approved');
  // A conta "desistido" pede e desiste pelo HTTP, que e como a linha some (D54).

  // Os pares de presenca. Mesmo titulo, mesma data, e SO o atributo difere.
  const pares: [string, Encontro, Encontro][] = [
    ['q por bairro', { slug: `p-qa${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par q`, neighborhood: 'ISCA-PAR-BAIRRO' }, { slug: `p-qb${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par q`, neighborhood: 'Outro Bairro' }],
    ['q por lugar', { slug: `p-la${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par lugar`, placeName: 'ISCA-PAR-LUGAR' }, { slug: `p-lb${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par lugar`, placeName: 'Outro Lugar' }],
    ['city', { slug: `p-ca${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par cidade`, city: 'IscaCidadeDoPar' }, { slug: `p-cb${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par cidade`, city: 'Outra Cidade' }],
    ['admission', { slug: `p-aa${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par valor`, centavos: 4200 }, { slug: `p-ab${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par valor`, centavos: null }],
    ['size', { slug: `p-sa${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par porte`, portes: ['P'] }, { slug: `p-sb${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par porte`, portes: ['GG'] }],
    ['max_km', { slug: `p-ka${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par ponto`, ponto: { lat: LAT + 0.001, lon: LON } }, { slug: `p-kb${randomUUID().slice(0, 8)}`, title: `${PREFIXO_DO_TITULO} par ponto`, ponto: null }],
  ];
  for (const [nome, a, b] of pares) {
    await inserirEncontro(a);
    await inserirEncontro(b);
    PARES.push({ nome, a: a.slug, b: b.slug });
  }

  const contrato = carregarContrato('api/openapi.yaml');
  app = criarServidor({
    problemBaseUrl: 'https://api.bichu.test/problems' as AbsoluteUrl,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  const conferir = vigiarParametrosDasRotas(app, contrato, '/v1');
  // Qualquer token com forma de UUID vale como a conta de mesmo id; o resto e
  // 401, como o servico de identidade responde.
  const FORMA_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDaRede(escopo, {
        rede: criarNetworkRepository(banco.db, { uuidv7: () => randomUUID() }),
        autenticador: {
          autenticar: (token: string) =>
            FORMA_DE_UUID.test(token)
              ? Promise.resolve({ userId: token as UserId })
              : Promise.reject(problemas.naoAutenticado()),
        },
        clock: systemClock,
      });
      pronto();
    },
    { prefix: '/v1' },
  );
  await app.ready();
  // A mesma conferencia da subida: operacao com parametro que pode recusar e
  // nao declara 400 derruba aqui.
  conferir();

  // A conta "desistido": pede e desiste pelo HTTP. Pendente desistido e apagado.
  assert.equal((await chamar('POST', `/network/events/${SLUG_PRIVADO}/join-request`, 'desistido')).status, 200);
  assert.equal((await chamar('DELETE', `/network/events/${SLUG_PRIVADO}/join-request`, 'desistido')).status, 200);
});

after(async () => {
  if (cliente !== undefined) {
    await cliente.query('DELETE FROM network_events WHERE id = ANY($1::uuid[])', [eventos]);
    await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [Object.values(CONTAS)]);
    await cliente.end();
  }
  if (banco !== undefined) await banco.close();
  if (app !== undefined) await app.close();
});

/** As nove operacoes, com os caminhos de sucesso e de erro de cada uma. */
function chamadasDeTodas(): { rotulo: string; metodo: 'GET' | 'POST' | 'DELETE'; url: string }[] {
  const s = SLUG_PRIVADO;
  return [
    { rotulo: 'listNetworkEvents', metodo: 'GET', url: `/network/events?when=all&q=${encodeURIComponent(PREFIXO_DO_TITULO)}` },
    { rotulo: 'listNetworkEvents 400', metodo: 'GET', url: '/network/events?q=x' },
    { rotulo: 'getNetworkEvent', metodo: 'GET', url: `/network/events/${s}` },
    { rotulo: 'getNetworkEvent 400', metodo: 'GET', url: '/network/events/ab' },
    { rotulo: 'getNetworkEvent 404', metodo: 'GET', url: '/network/events/nao-existe-isto' },
    { rotulo: 'listNearbyNetworkEvents', metodo: 'GET', url: '/network/events/nearby?when=all' },
    { rotulo: 'listNearbyNetworkEvents max_km', metodo: 'GET', url: '/network/events/nearby?when=all&max_km=2' },
    { rotulo: 'listNearbyNetworkEvents 400', metodo: 'GET', url: '/network/events/nearby?max_km=3' },
    { rotulo: 'getNetworkEventLocation', metodo: 'GET', url: `/network/events/${s}/location` },
    { rotulo: 'getNetworkEventLocation 400', metodo: 'GET', url: '/network/events/ab/location' },
    { rotulo: 'getNetworkEventPrivateDetails', metodo: 'GET', url: `/network/events/${s}/private-details` },
    { rotulo: 'getNetworkEventPrivateDetails 400', metodo: 'GET', url: '/network/events/ab/private-details' },
    { rotulo: 'getMyNetworkEventJoinRequest', metodo: 'GET', url: `/network/events/${s}/join-request` },
    { rotulo: 'getMyNetworkEventJoinRequest 400', metodo: 'GET', url: '/network/events/ab/join-request' },
    { rotulo: 'listMyNetworkEventJoinRequests', metodo: 'GET', url: '/network/join-requests' },
    { rotulo: 'listMyNetworkEventJoinRequests 400', metodo: 'GET', url: '/network/join-requests?state=declined' },
    { rotulo: 'requestToJoinNetworkEvent 404', metodo: 'POST', url: '/network/events/nao-existe-isto/join-request' },
    { rotulo: 'requestToJoinNetworkEvent 400', metodo: 'POST', url: '/network/events/ab/join-request' },
    { rotulo: 'withdrawNetworkEventJoinRequest 404', metodo: 'DELETE', url: '/network/events/nao-existe-isto/join-request' },
    { rotulo: 'withdrawNetworkEventJoinRequest 400', metodo: 'DELETE', url: '/network/events/ab/join-request' },
  ];
}

function varrer(rotulo: string, bruto: string): void {
  // Os identificadores aleatorios da requisicao sao tirados antes: um UUID
  // pode conter `987654` por acaso, e o teste ficaria intermitente.
  const texto = normalizado(bruto);
  for (const sentinela of SENTINELAS) {
    assert.equal(texto.includes(sentinela), false, `${rotulo}: a sentinela ${sentinela} saiu no corpo`);
  }
}

void describe('P19.1 -- nenhuma sentinela sai para quem nao foi aprovado, em nenhuma das nove operacoes', () => {
  void it('o cenario existe: o privado com sentinelas esta no banco, e ha privados na leitura', async () => {
    const r = await cliente.query<{ n: number }>('SELECT count(*)::int AS n FROM network_events WHERE slug = $1 AND visibility = $2', [SLUG_PRIVADO, 'private']);
    assert.equal(r.rows[0]?.n, 1);
    const lista = await chamar('GET', `/network/events?when=all&q=${encodeURIComponent(PREFIXO_DO_TITULO)}`);
    assert.ok(lista.bruto.includes(SLUG_PRIVADO), 'o privado nem aparece na agenda: a varredura nao teria alvo');
  });

  for (const conta of [undefined, 'sem_pedido', 'pendente', 'recusado', 'desistido', 'recusado_desistido'] as const) {
    void it(`ISCA -- como ${conta ?? 'anonimo'}: as nove operacoes, com os erros, nao trazem sentinela`, async () => {
      for (const chamada of chamadasDeTodas()) {
        const r = await chamar(chamada.metodo, chamada.url, conta);
        varrer(`${chamada.rotulo} como ${conta ?? 'anonimo'} (${String(r.status)})`, r.bruto);
      }
      if (conta !== undefined) {
        // Pedir de novo: o POST de sucesso tambem entra na varredura.
        const pedido = await chamar('POST', `/network/events/${SLUG_PRIVADO}/join-request`, conta);
        varrer(`requestToJoinNetworkEvent como ${conta}`, pedido.bruto);
      }
    });
  }

  void it('o aprovado continua recebendo o teaser na leitura publica, e nada oculto nela', async () => {
    for (const chamada of chamadasDeTodas().filter((c) => !c.rotulo.startsWith('getNetworkEventPrivateDetails') && !c.rotulo.startsWith('getNetworkEventLocation'))) {
      const r = await chamar(chamada.metodo, chamada.url, 'aprovado');
      varrer(`${chamada.rotulo} como aprovado`, r.bruto);
    }
  });

  void it('CONTROLE POSITIVO -- private-details do aprovado traz TODAS as sentinelas', async () => {
    const r = await chamar('GET', `/network/events/${SLUG_PRIVADO}/private-details`, 'aprovado');
    assert.equal(r.status, 200);
    assert.equal(r.cache, 'private, no-store');
    for (const sentinela of SENTINELAS) {
      assert.equal(r.bruto.includes(sentinela), true, `a varredura nao enxerga ${sentinela}: um teste cego aprovaria qualquer coisa`);
    }
  });

  void it('o ponto do privado sai so para o aprovado', async () => {
    const aprovado = await chamar('GET', `/network/events/${SLUG_PRIVADO}/location`, 'aprovado');
    assert.equal(aprovado.status, 200);
    assert.equal(aprovado.bruto.includes(String(LAT)), true);
    for (const conta of ['sem_pedido', 'pendente', 'recusado'] as const) {
      assert.equal((await chamar('GET', `/network/events/${SLUG_PRIVADO}/location`, conta)).status, 404);
    }
  });
});

void describe('P19.3 -- a recusa nao se distingue do pendente, byte a byte', () => {
  for (const chamada of [
    { rotulo: 'estado do pedido', metodo: 'GET' as const, url: `/network/events/${SLUG_PRIVADO}/join-request` },
    { rotulo: 'pedir de novo', metodo: 'POST' as const, url: `/network/events/${SLUG_PRIVADO}/join-request` },
    { rotulo: 'meus pedidos', metodo: 'GET' as const, url: '/network/join-requests' },
    { rotulo: 'meus pedidos, state=requested', metodo: 'GET' as const, url: '/network/join-requests?state=requested' },
  ]) {
    void it(`ISCA -- ${chamada.rotulo}: pendente e recusado respondem igual`, async () => {
      const pendente = await chamar(chamada.metodo, chamada.url, 'pendente');
      const recusado = await chamar(chamada.metodo, chamada.url, 'recusado');
      assert.equal(pendente.status, 200);
      assert.equal(recusado.status, pendente.status);
      assert.equal(recusado.cache, pendente.cache);
      assert.equal(normalizado(recusado.bruto), normalizado(pendente.bruto));
      assert.equal(recusado.bruto.length, pendente.bruto.length);
      assert.equal(recusado.bruto.includes('declined'), false);
    });
  }

  void it('ISCA -- depois de desistir, pendente e recusado tambem respondem igual (404)', async () => {
    const desistido = await chamar('GET', `/network/events/${SLUG_PRIVADO}/join-request`, 'desistido');
    const recusadoDesistido = await chamar('GET', `/network/events/${SLUG_PRIVADO}/join-request`, 'recusado_desistido');
    assert.equal(desistido.status, 404);
    assert.equal(recusadoDesistido.status, 404);
    assert.equal(normalizado(recusadoDesistido.bruto), normalizado(desistido.bruto));
  });

  void it('desistir: o pendente e o recusado recebem a mesma resposta, e a recusa nao se lava', async () => {
    // Contas descartaveis para nao mexer nas de cima.
    const evento = eventos[0] as string;
    const pendente2 = randomUUID();
    const recusado2 = randomUUID();
    for (const [id, status] of [[pendente2, 'pending'], [recusado2, 'declined']] as const) {
      await cliente.query('INSERT INTO users (id, email) VALUES ($1, $2)', [id, `p19-extra-${id}@${DOMINIO}`]);
      await cliente.query(
        `INSERT INTO network_event_join_requests (id, ref, event_id, user_id, status, decided_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'pending' THEN NULL ELSE now() END)`,
        [randomUUID(), randomUUID().replace(/-/g, '').slice(0, 24), evento, id, status],
      );
    }
    (CONTAS as Record<string, string>)['pendente2'] = pendente2;
    (CONTAS as Record<string, string>)['recusado2'] = recusado2;
    try {
      const a = await chamar('DELETE', `/network/events/${SLUG_PRIVADO}/join-request`, 'pendente2' as Conta);
      const b = await chamar('DELETE', `/network/events/${SLUG_PRIVADO}/join-request`, 'recusado2' as Conta);
      assert.equal(a.status, 200);
      assert.equal(normalizado(b.bruto), normalizado(a.bruto));
      // Pedir de novo: o recusado continua recusado no banco, e o app ve `requested`.
      const denovo = await chamar('POST', `/network/events/${SLUG_PRIVADO}/join-request`, 'recusado2' as Conta);
      assert.equal((JSON.parse(denovo.bruto) as { state: string }).state, 'requested');
      const banco2 = await cliente.query<{ status: string }>('SELECT status FROM network_event_join_requests WHERE user_id = $1', [recusado2]);
      assert.equal(banco2.rows[0]?.status, 'declined', 'desistir e pedir de novo lavou a recusa');
    } finally {
      await cliente.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[pendente2, recusado2]]);
    }
  });
});

void describe('P19.4 -- presenca: nenhum recorte separa dois privados que diferem so no oculto', () => {
  async function presentes(url: string, conta?: Conta): Promise<{ bruto: string; total: number }> {
    const r = await chamar('GET', url, conta);
    assert.equal(r.status, 200, `${url} respondeu ${String(r.status)}`);
    const corpo = JSON.parse(r.bruto) as { total: number };
    return { bruto: r.bruto, total: corpo.total };
  }

  const recortes: { par: string; url: string; conta?: Conta }[] = [
    { par: 'q por bairro', url: '/network/events?when=all&q=ISCA-PAR-BAIRRO' },
    { par: 'q por lugar', url: '/network/events?when=all&q=ISCA-PAR-LUGAR' },
    { par: 'city', url: '/network/events?when=all&city=IscaCidadeDoPar' },
    { par: 'admission', url: '/network/events?when=all&admission=paid' },
    { par: 'admission', url: '/network/events?when=all&admission=free' },
    { par: 'size', url: '/network/events?when=all&size=P' },
    { par: 'size', url: '/network/events?when=all&size=GG' },
    { par: 'max_km', url: '/network/events/nearby?when=all&max_km=2', conta: 'sem_pedido' },
    { par: 'max_km', url: '/network/events/nearby?when=all', conta: 'sem_pedido' },
  ];
  for (const recorte of recortes) {
    void it(`ISCA -- ${recorte.par}: ${recorte.url}`, async () => {
      const par = PARES.find((p) => p.nome === recorte.par);
      assert.ok(par !== undefined);
      const { bruto } = await presentes(recorte.url, recorte.conta);
      assert.equal(
        bruto.includes(par.a),
        bruto.includes(par.b),
        `o recorte separou ${par.a} de ${par.b}: ele entrega o atributo oculto`,
      );
    });
  }

  void it('o titulo, que e visivel, casa os dois privados do par (o recorte nao e cego)', async () => {
    const { bruto } = await presentes(`/network/events?when=all&q=${encodeURIComponent(`${PREFIXO_DO_TITULO} par q`)}`);
    const par = PARES.find((p) => p.nome === 'q por bairro');
    assert.ok(par !== undefined && bruto.includes(par.a) && bruto.includes(par.b));
  });
});

void describe('P19.5 -- o slug do privado nao carrega o lugar', () => {
  void it('ISCA -- nenhuma sentinela de lugar no slug', () => {
    for (const sentinela of ['isca-lugar', 'isca-bairro', 'isca-cidade']) {
      assert.equal(SLUG_PRIVADO.toLowerCase().includes(sentinela), false);
    }
  });
});
