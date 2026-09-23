/**
 * As tres rotas da `Rede`, sobre um Fastify de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque quatro coisas que estas
 * rotas prometem so existem com o framework no caminho: o **401** de quem tenta
 * confirmar presenca sem conta, o **404** do evento inativo, o **429** do teto
 * (que e um gancho `onRequest`/`preValidation`, e nao um `if`) e a
 * **serializacao real** da resposta -- que e onde uma pessoa vazaria.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a mudanca foi conferida no
 * disco (`git diff --stat` nao vazio), a suite rodou e reprovou com o nome do
 * caso na saida, e o arquivo foi restaurado.
 * 23/09/2026, Node 22 (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `ordemPadraoDe` devolvendo `proximos` tambem para `past` | 2 |
 * | `effective_when` saindo fixo em `upcoming` | 1 |
 * | o 404 do check-in virando 403 | 1 |
 * | `chamadorAutenticado` deixando de exigir o cabecalho no check-in | 1 |
 * | `chamadorOpcional` levantando em vez de devolver `undefined` | 1 |
 * | `deny_429` virando `log_and_alert` no teto da agenda | 1 |
 * | `rateLimit` removido da agenda (tem efeito) | **nao compila** |
 * | dimensao `account` do check-in declarada sem resolvedor | **nao compila** |
 * | `app.get` direto, fora de `registrarRota` | o portao de registro reprova |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { EncontroComGaleria, EncontroDaRede } from '../../domain/encontro-da-rede.js';
import type {
  DesfechoDoCheckIn,
  NetworkRepository,
  PaginaDaAgenda,
  PedidoDeCheckIn,
  PedidoDeEncontro,
  RecorteDaAgenda,
} from '../../ports/network-repository.js';
import { ordemPadraoDe, registrarRotasDaRede, rotaDaAgenda, rotaDeCheckIn } from './network-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = Date.UTC(2026, 8, 23, 12, 0, 0);
const UMA_HORA = 3_600_000;

const ENCONTRO: EncontroDaRede = {
  slug: 'encontro-de-domingo-na-benedito',
  title: 'Encontro de domingo na Benedito Calixto',
  summary: 'Cachorros de todos os portes, sombra e agua fresca.',
  placeName: 'Praça Benedito Calixto',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  state: 'SP',
  startsAt: (AGORA + UMA_HORA) as Instant,
  endsAt: (AGORA + 3 * UMA_HORA) as Instant,
  timeZone: 'America/Sao_Paulo',
  coverImageUrl: null,
  checkinCount: 12,
  photoCount: 1,
};

const COM_GALERIA: EncontroComGaleria = {
  ...ENCONTRO,
  galeria: [
    {
      slug: 'roda-de-cachorros-na-sombra',
      imageUrl: 'https://cdn.bichu.test/rede/roda-de-cachorros.jpg',
      caption: 'A roda das dez da manhã.',
    },
  ],
  viewerCheckedIn: false,
};

interface Cenario {
  readonly contador?: RateLimitStore;
  /** `undefined` e o evento que nao existe OU esta inativo -- o mesmo caso. */
  readonly encontro?: EncontroComGaleria | undefined;
  readonly desfecho?: DesfechoDoCheckIn | undefined;
}

const recortesVistos: RecorteDaAgenda[] = [];
const pedidosDeEncontro: PedidoDeEncontro[] = [];
const pedidosDeCheckIn: PedidoDeCheckIn[] = [];

function repositorio(cenario: Cenario): NetworkRepository {
  return {
    listarAgenda: (recorte): Promise<PaginaDaAgenda> => {
      recortesVistos.push(recorte);
      return Promise.resolve({ itens: [ENCONTRO], total: 1 });
    },
    buscarEncontro: (pedido): Promise<EncontroComGaleria | undefined> => {
      pedidosDeEncontro.push(pedido);
      return Promise.resolve('encontro' in cenario ? cenario.encontro : COM_GALERIA);
    },
    confirmarPresenca: (pedido): Promise<DesfechoDoCheckIn | undefined> => {
      pedidosDeCheckIn.push(pedido);
      return Promise.resolve('desfecho' in cenario ? cenario.desfecho : { checkinCount: 13 });
    },
  };
}

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  registrarRotasDaRede(app, {
    rede: repositorio(cenario),
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    clock,
  });
  return app;
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { metodo?: 'GET' | 'POST'; url?: string; como?: UserId | null } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? null : opcoes.como;
  const resposta = await app.inject({
    method: opcoes.metodo ?? 'GET',
    url: opcoes.url ?? '/network/events',
    ...(como === null ? {} : { headers: { authorization: `Bearer ${como}` } }),
  });
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

void describe('a agenda e publica, e a ordem depende do recorte de tempo', () => {
  void it('sem conta nenhuma, responde 200 -- a Rede e navegavel deslogado', async () => {
    const resposta = await pedir(servidor());
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['total'], 1);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
  });

  void it('sem `when`, o recorte que vale e `upcoming` e a ordem e `proximos`', async () => {
    // O default de `when` importa: uma agenda que abre misturando o que passou
    // com o que vem e o defeito mais comum de agenda.
    const resposta = await pedir(servidor());
    assert.equal(resposta.corpo['effective_when'], 'upcoming');
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('com `when=past` e SEM `sort`, a ordem que vale e `recentes`', async () => {
    // ISCA: com `ordemPadraoDe` devolvendo `proximos` para tudo, este caso le
    // `proximos`. O cliente que nao mandou `sort` nao tem como saber a ordem
    // sem `effective_sort`, e a barra de listagem mostra a ordem REAL.
    const resposta = await pedir(servidor(), { url: '/network/events?when=past' });
    assert.equal(resposta.corpo['effective_when'], 'past');
    assert.equal(resposta.corpo['effective_sort'], 'recentes');
  });

  void it('com `when=all` e SEM `sort`, a ordem que vale e `proximos`', async () => {
    const resposta = await pedir(servidor(), { url: '/network/events?when=all' });
    assert.equal(resposta.corpo['effective_when'], 'all');
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('o `sort` pedido ganha do default, inclusive no passado', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events?when=past&sort=proximos',
    });
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });

  void it('a ordem e o recorte que valeram chegam ao repositorio, e nao so a resposta', async () => {
    // Devolver `effective_sort` correto e consultar em outra ordem seria a
    // resposta afirmando uma ordem sobre uma lista que o servidor ordenou de
    // outro jeito -- exatamente o que este campo existe para impedir.
    recortesVistos.length = 0;
    await pedir(servidor(), { url: '/network/events?when=past' });
    const recorte = recortesVistos.at(-1);
    assert.ok(recorte !== undefined);
    assert.equal(recorte.when, 'past');
    assert.equal(recorte.sort, 'recentes');
    assert.equal(recorte.agora, AGORA);
  });

  void it('sem filtro nenhum, `applied_filters` traz `scope: all`', async () => {
    const resposta = await pedir(servidor());
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });

  void it('os filtros informados voltam em `applied_filters`, para a tela escrever', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events?q=domingo&city=S%C3%A3o%20Paulo',
    });
    assert.deepEqual(resposta.corpo['applied_filters'], { q: 'domingo', city: 'São Paulo' });
  });

  void it('`when` NAO entra em `applied_filters`: ele tem campo proprio', async () => {
    // Poe-lo tambem ali faria a tela mostrar "Proximos" como filtro escolhido,
    // e o botao de limpar filtros passaria a prometer que apaga o estado normal
    // da agenda.
    const resposta = await pedir(servidor(), { url: '/network/events?when=past' });
    assert.deepEqual(resposta.corpo['applied_filters'], { scope: 'all' });
  });

  void it('o cartao traz a contagem, o fuso e o rotulo calculado no servidor', async () => {
    const resposta = await pedir(servidor());
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens[0]?.['checkin_count'], 12);
    assert.equal(itens[0]?.['photo_count'], 1);
    assert.equal(itens[0]?.['time_zone'], 'America/Sao_Paulo');
    assert.equal(itens[0]?.['status'], 'upcoming');
  });
});

void describe('nenhuma pessoa sai da Rede', () => {
  void it('a listagem NAO devolve UUID em lugar nenhum do corpo', async () => {
    const resposta = await pedir(servidor());
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
      'ISCA: qualquer UUID no corpo reprova. O endereco de um encontro e o `slug`.',
    );
  });

  void it('o encontro com galeria NAO traz autor de foto nem campo com pessoas', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events/encontro-de-domingo-na-benedito',
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200);
    const bruto = resposta.bruto.toLowerCase();
    // Os nomes sao escritos por extenso. A varredura e sobre o corpo inteiro e
    // nao campo a campo: uma conferencia que olha os campos que ela conhece nao
    // enxerga o campo que alguem acrescentar amanha.
    for (const proibido of [
      'user_id',
      'attendee',
      'checkins',
      'checked_in_by',
      'display_name',
      'avatar',
      'pet_slug',
      'pet_id',
    ]) {
      assert.equal(bruto.includes(proibido), false, `ISCA: "${proibido}" no corpo da Rede.`);
    }
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
    );
  });

  void it('a foto da galeria sai com tres campos, e a lista e escrita por extenso', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events/encontro-de-domingo-na-benedito',
    });
    const galeria = resposta.corpo['gallery'] as Record<string, unknown>[];
    assert.deepEqual(Object.keys(galeria[0] ?? {}).sort(), ['caption', 'image_url', 'slug']);
  });
});

void describe('o encontro, e o 404 que nao distingue inativo de inexistente', () => {
  void it('quem chega sem conta recebe o corpo, com `viewer_checked_in` falso', async () => {
    const resposta = await pedir(servidor(), {
      url: '/network/events/encontro-de-domingo-na-benedito',
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['viewer_checked_in'], false);
  });

  void it('com token invalido a rota NAO recusa: ela atende como quem nao tem conta', async () => {
    // ISCA: com `chamadorOpcional` levantando, esta chamada responde 401 numa
    // rota que atende sem token nenhum -- a pessoa que reabriu o aplicativo
    // depois de um mes fora veria a agenda publica recusar.
    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMA,
      isProduction: false,
      teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
      bodyLimitBytes: 1_048_576,
    });
    registrarRotasDaRede(app, {
      rede: repositorio({}),
      autenticador: { autenticar: () => Promise.reject(new Error('token vencido')) },
      clock: { now: () => AGORA as ReturnType<Clock['now']> },
    });
    const resposta = await pedir(app, {
      url: '/network/events/encontro-de-domingo-na-benedito',
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['viewer_checked_in'], false);
  });

  void it('quem chama chega ao repositorio, para o EXISTS de `viewer_checked_in`', async () => {
    pedidosDeEncontro.length = 0;
    await pedir(servidor(), {
      url: '/network/events/encontro-de-domingo-na-benedito',
      como: QUEM_CHAMA,
    });
    assert.equal(pedidosDeEncontro.at(-1)?.chamador, QUEM_CHAMA);
  });

  void it('sem conta, o repositorio NAO recebe chamador nenhum', async () => {
    // `false` por decisao, e nao o resultado de um `EXISTS` sem filtro de
    // pessoa -- que responderia "alguem confirmou" no lugar de "voce confirmou".
    pedidosDeEncontro.length = 0;
    await pedir(servidor(), { url: '/network/events/encontro-de-domingo-na-benedito' });
    assert.equal(pedidosDeEncontro.at(-1)?.chamador, undefined);
  });

  void it('evento inativo ou inexistente: 404, e nunca 403', async () => {
    const resposta = await pedir(servidor({ encontro: undefined }), {
      url: '/network/events/encontro-que-foi-retirado',
    });
    assert.equal(resposta.status, 404);
    assert.notEqual(
      resposta.status,
      403,
      'ADR-0021: um 403 afirmaria que aquele `slug` existe e nao e seu, e um ' +
        'evento retirado nao e de ninguem.',
    );
  });
});

void describe('o check-in', () => {
  void it('sem cabecalho de credencial, 401 -- a operacao escreve em nome de alguem', async () => {
    const resposta = await pedir(servidor(), {
      metodo: 'POST',
      url: '/network/events/encontro-de-domingo-na-benedito/check-in',
      como: null,
    });
    assert.equal(resposta.status, 401);
  });

  void it('com "Bearer " vazio, 401 tambem', async () => {
    const resposta = await servidor().inject({
      method: 'POST',
      url: '/network/events/encontro-de-domingo-na-benedito/check-in',
      headers: { authorization: 'Bearer    ' },
    });
    assert.equal(resposta.statusCode, 401);
  });

  void it('devolve a contagem JA ATUALIZADA e `viewer_checked_in` verdadeiro', async () => {
    const resposta = await pedir(servidor(), {
      metodo: 'POST',
      url: '/network/events/encontro-de-domingo-na-benedito/check-in',
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['checkin_count'], 13);
    assert.equal(resposta.corpo['viewer_checked_in'], true);
  });

  void it('o corpo do check-in tem DOIS campos, e nenhum deles e uma lista', async () => {
    const resposta = await pedir(servidor(), {
      metodo: 'POST',
      url: '/network/events/encontro-de-domingo-na-benedito/check-in',
      como: QUEM_CHAMA,
    });
    assert.deepEqual(Object.keys(resposta.corpo).sort(), ['checkin_count', 'viewer_checked_in']);
  });

  void it('o pet NAO entra: o pedido que chega ao repositorio tem `slug` e chamador', async () => {
    // ADR-0025 secao 1. Nao ha caminho no banco pelo qual um check-in saiba
    // qual animal foi junto, e nao ha campo no pedido por onde ele entraria.
    pedidosDeCheckIn.length = 0;
    await pedir(servidor(), {
      metodo: 'POST',
      url: '/network/events/encontro-de-domingo-na-benedito/check-in',
      como: QUEM_CHAMA,
    });
    const pedido = pedidosDeCheckIn.at(-1);
    assert.ok(pedido !== undefined);
    assert.deepEqual(Object.keys(pedido).sort(), ['chamador', 'slug']);
    assert.equal(pedido.slug, 'encontro-de-domingo-na-benedito');
  });

  void it('evento inativo ou inexistente: 404 pelo proprio WHERE, e nunca 403', async () => {
    // ISCA: o repositorio devolve "nao achei" porque o `WHERE` da escrita nao
    // encontrou linha de origem. Trocar este 404 por 403 contaria a um estranho
    // que aquele `slug` existiu.
    const resposta = await pedir(servidor({ desfecho: undefined }), {
      metodo: 'POST',
      url: '/network/events/encontro-que-foi-retirado/check-in',
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 404);
  });
});

void describe('os tetos das tres rotas', () => {
  void it('a chamada 301 da agenda na mesma hora e recusada com 429', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const app = servidor({ contador });
    for (let i = 0; i < 300; i += 1) {
      const ok = await pedir(app);
      assert.equal(ok.status, 200, `a chamada ${String(i + 1)} deveria passar`);
    }
    const recusada = await pedir(app);
    assert.equal(
      recusada.status,
      429,
      'ISCA: com `log_and_alert` no lugar de `deny_429`, esta chamada responde 200.',
    );
  });

  void it('com o contador desligado, a 301 passa -- e e isso que prova que o caso mede LIMITE', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    for (let i = 0; i < 300; i += 1) await pedir(app);
    assert.equal(
      (await pedir(app)).status,
      200,
      'o mesmo caminho com o mecanismo desligado precisa deixar passar. Sem este ' +
        'controle, o caso acima mediria a capacidade de contar ate 301.',
    );
  });

  void it('a agenda conta por IP, porque nao ha conta para contar', () => {
    assert.deepEqual(
      rotaDaAgenda.rateLimit.map((entrada) => entrada.dimension),
      [['ip']],
    );
    assert.equal(rotaDaAgenda.rateLimit.length, 1, 'um teto so, e uma dimensao so');
  });

  void it('o check-in conta por CONTA, porque ele exige uma', () => {
    // No Brasil o CGNAT das operadoras poe muita gente atras de poucos
    // enderecos: teto por `ip` aqui pegaria vizinho inocente e erraria quem
    // enche a contagem de um encontro.
    assert.deepEqual(
      rotaDeCheckIn.rateLimit?.map((entrada) => entrada.dimension),
      [['account']],
    );
  });
});

void describe('a regra do default de ordem, isolada', () => {
  void it('`upcoming` e `all` abrem em `proximos`, e `past` em `recentes`', () => {
    assert.equal(ordemPadraoDe('upcoming'), 'proximos');
    assert.equal(ordemPadraoDe('all'), 'proximos');
    assert.equal(ordemPadraoDe('past'), 'recentes');
  });
});
