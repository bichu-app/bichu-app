/**
 * As tres rotas da `Rede`, sobre um Fastify de verdade.
 *
 * Sobe o servidor em vez de chamar o manipulador porque o que estas rotas
 * prometem so existe com o framework no caminho: o **401** de quem pede o
 * ponto sem conta, o **404** do encontro invisivel, o **429** do teto (que e
 * um gancho, e nao um `if`) e a **serializacao real** da resposta -- que e onde
 * uma coordenada vazaria.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no codigo de producao, a suite rodou e reprovou com
 * o nome do caso na saida, e o arquivo foi restaurado. As linhas "23/09,
 * emenda" foram medidas na emenda da BICHUS-251 (ADR-0027 12), Node 22
 * (`/opt/homebrew/opt/node@22`).
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `ordemPadraoDe` devolvendo `proximos` tambem para `past` | 2 |
 * | `effective_when` saindo fixo em `upcoming` | 1 |
 * | `deny_429` virando `log_and_alert` no teto da agenda | 1 |
 * | 23/09, emenda: `location` sem `chamadorAutenticado` (responde sem conta) | 4 |
 * | 23/09, emenda: `location` consultando ANTES de autenticar | 2 |
 * | 23/09, emenda: o 404 do `location` virando 403 | 1 |
 * | 23/09, emenda: o detalhe levando o ponto junto (`point` no corpo publico) | 1 |
 * | `rateLimit` removido da agenda (tem efeito) | **nao compila** |
 * | dimensao `account` do `location` declarada sem resolvedor | **nao compila** |
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock, IdGenerator } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { EncontroDaRede } from '../../domain/encontro-da-rede.js';
import type {
  DesfechoDaDesistencia,
  DesfechoDoPedido,
  CapaDoMeuEncontro,
  EncontroDoAutor,
  EstadoDaContaParaCriar,
  LocalDoEncontro,
  MeuEncontro,
  NetworkRepository,
  PaginaDaAgenda,
  PaginaDosMeusEncontros,
  PaginaDosMeusPedidos,
  PaginaPorDistancia,
  PedidoDaConta,
  RecorteDaAgenda,
  RecorteDosMeusEncontros,
  TransacaoDaComunidade,
} from '../../ports/network-repository.js';
import { ordemPadraoDe, registrarRotasDaRede, rotaDaAgenda, rotaDoLocal } from './network-routes.js';
import { EncontroDaComunidade } from '../../application/encontro-da-comunidade.js';
import type {
  MudancaDoEncontroDaComunidade,
  NovoEncontroDaComunidade,
} from '../../domain/encontro-da-comunidade.js';
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import { carregarContrato } from '../../../../shared/http/contract.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

/** O contrato de VERDADE: a isca da autoria o le, e nao um objeto inline. */
const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const AGORA = Date.UTC(2026, 8, 23, 12, 0, 0);
const UMA_HORA = 3_600_000;
const SLUG = 'encontro-de-domingo-na-benedito';
const PONTO = { lat: -23.5617, lon: -46.6823 };

const ENCONTRO: EncontroDaRede = {
  slug: SLUG,
  title: 'Encontro de domingo na Benedito Calixto',
  summary: 'Cachorros de todos os portes, sombra e agua fresca.',
  placeName: 'Praça Benedito Calixto',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  state: 'SP',
  startsAt: (AGORA + UMA_HORA) as Instant,
  endsAt: (AGORA + 3 * UMA_HORA) as Instant,
  timeZone: 'America/Sao_Paulo',
  publicacao: 'published',
  // `admin` e o `DEFAULT` da coluna e o caso comum. A isca da autoria, mais
  // abaixo neste arquivo, continua cobrando que NENHUMA coluna de autoria saia
  // -- e `origin` nao e uma: sao dois valores fixos, sem pessoa.
  origem: 'admin',
  dataLocal: '2026-09-23',
  visibilidade: 'public',
  entrada: { tipo: 'free' },
  portesAceitos: ['P', 'M', 'G', 'GG'],
  idadeDosCaes: 'any',
  vacinacaoExigida: true,
  areaCercada: false,
  estrutura: [],
  paraLevar: [],
  observacoes: null,
  endereco: null,
  linkDeIngresso: null,
  instagram: null,
  instagramUrl: null,
  imagens: [],
};

const PRIVADO: EncontroDaRede = {
  ...ENCONTRO,
  slug: 'p-q8w3n5z1ty',
  visibilidade: 'private',
  placeName: 'ISCA-LUGAR',
  neighborhood: 'ISCA-BAIRRO',
  summary: 'ISCA-RESUMO',
};

interface Cenario {
  readonly contador?: RateLimitStore;
  readonly estadoDaConta?: EstadoDaContaParaCriar;
  /** `undefined` e "nao e seu OU nao existe" -- o mesmo caso, de proposito. */
  readonly meuEncontro?: EncontroDoAutor | undefined;
  /**
   * A capa como a leitura do DONO a entrega. `undefined` no cenario e
   * "encontro sem capa nenhuma", que e diferente de `processing`.
   */
  readonly capaDoDono?: CapaDoMeuEncontro | undefined;
  readonly versaoMudou?: boolean;
  readonly capaNaoServe?: boolean;
  /** `undefined` e o encontro que nao existe OU nao e visivel -- o mesmo caso. */
  readonly encontro?: EncontroDaRede | undefined;
  readonly local?: LocalDoEncontro | undefined;
  readonly pedido?: DesfechoDoPedido;
  readonly desistencia?: DesfechoDaDesistencia;
  readonly detalhes?: EncontroDaRede | undefined;
  readonly temRegiao?: boolean;
}

const recortesVistos: RecorteDaAgenda[] = [];
const locaisPedidos: string[] = [];
const gravados: NovoEncontroDaComunidade[] = [];
const mudancas: MudancaDoEncontroDaComunidade[] = [];
const cancelamentos: string[] = [];
/** A versao que o `UPDATE` do cancelamento comparou: o `If-Match` que chegou. */
const versoesDoCancelamento: number[] = [];
const capasPedidas: string[] = [];
const capasDefinidas: (string | null)[] = [];
const encontrosPedidos: string[] = [];
const recortesDosMeus: RecorteDosMeusEncontros[] = [];
const meusEncontrosPedidos: { slug: string; chamador: string }[] = [];
const trilhaDeTeste: AuditEvent[] = [];

/** Um `upload_id` com forma de UUID, que e o que o contrato exige. */
const ENVIO = '018f3a2b-0000-7000-8000-0000000000c1';

/** A capa que entrou: o caminho comum da lista do dono. */
const CAPA_PRONTA: CapaDoMeuEncontro = {
  estado: 'ready',
  url: 'https://midia.exemplo.invalid/capa-1024.jpg',
  motivoDaRecusa: null,
};

/**
 * A capa RECUSADA, com o motivo que o servidor devolve.
 *
 * O texto e um dos exemplos REAIS medidos em 19/10/2026, e nao uma frase
 * inventada: e ele que a tela mostra, e e por isso que a isca o procura
 * literalmente.
 */
const CAPA_RECUSADA: CapaDoMeuEncontro = {
  estado: 'rejected',
  url: null,
  motivoDaRecusa: 'A imagem precisa ter pelo menos 600 x 600 pixels.',
};

/** O encontro da propria conta, ainda no futuro. */
const MEU_ENCONTRO: EncontroDoAutor = {
  id: '018f3a2b-0000-7000-8000-0000000000ee',
  versao: 1,
  publicacao: 'published',
  startsAt: (AGORA + UMA_HORA * 24) as Instant,
  endsAt: (AGORA + UMA_HORA * 27) as Instant,
};

/** `IdGenerator` so com o que esta rota usa; o resto nao e chamado aqui. */
const idsDeTeste = {
  uuidv7: () => '018f3a2b-0000-7000-8000-0000000000ee',
  opaqueToken: () => {
    throw new Error('nao usado');
  },
  random128: () => new Uint8Array(16),
  tagEntropy: () => new Uint8Array(10),
} as unknown as IdGenerator;

function repositorio(cenario: Cenario): NetworkRepository {
  // O ESTADO QUE A TRANSACAO MUDA E AS LEITURAS VEEM DEPOIS.
  //
  // Sem ele, o dobre respondia `published` depois de `cancelarEncontro` ter
  // rodado, e um caso que afirmasse "o encontro virou cancelled" estaria
  // medindo a constante do arquivo e nao o desfecho da chamada -- vacuidade,
  // que e o defeito recorrente deste repositorio. Com ele, a leitura DEPOIS do
  // cancelamento devolve `cancelled` e a versao avanca, como o `UPDATE` de
  // verdade faz.
  let cancelado = false;
  const encontroAtual = (): EncontroDaRede | undefined => {
    const base = 'encontro' in cenario ? cenario.encontro : ENCONTRO;
    if (base === undefined) return undefined;
    return cancelado ? { ...base, publicacao: 'cancelled' } : base;
  };
  /** O dono, pela MESMA regra de `encontroDoAutor`: `undefined` e o 404. */
  const dono = (): EncontroDoAutor | undefined =>
    'meuEncontro' in cenario ? cenario.meuEncontro : MEU_ENCONTRO;
  /**
   * A capa do dono. O default e `ready`: o caminho comum e a capa que entrou.
   * `capaDoDono: undefined` no cenario e "encontro SEM capa", que e o terceiro
   * estado e nao um sinonimo de `processing`.
   */
  const capaDoCenario = (): CapaDoMeuEncontro | null =>
    'capaDoDono' in cenario ? (cenario.capaDoDono ?? null) : CAPA_PRONTA;

  return {
    listarAgenda: (recorte): Promise<PaginaDaAgenda> => {
      recortesVistos.push(recorte);
      return Promise.resolve({ itens: [ENCONTRO], total: 1 });
    },
    buscarEncontro: (): Promise<EncontroDaRede | undefined> => Promise.resolve(encontroAtual()),
    listarMeusEncontros: (recorte): Promise<PaginaDosMeusEncontros> => {
      // O RECORTE E GUARDADO, e e sobre ele que o caso da autoria afirma: a
      // conta que chega aqui tem de ser a do token, e nao algo que a consulta
      // da requisicao tenha dito.
      recortesDosMeus.push(recorte);
      const encontro = encontroAtual();
      const itens =
        dono() === undefined || encontro === undefined
          ? []
          : [{ encontro, capa: capaDoCenario() }];
      return Promise.resolve({ itens, total: itens.length });
    },
    buscarMeuEncontro: (slug, chamador): Promise<MeuEncontro | undefined> => {
      meusEncontrosPedidos.push({ slug, chamador });
      const meu = dono();
      const encontro = encontroAtual();
      if (meu === undefined || encontro === undefined) return Promise.resolve(undefined);
      // A versao avanca depois do cancelamento, como o `UPDATE` faz: e isso que
      // torna o 412 de versao velha mensuravel sem dobre nenhum a mais.
      return Promise.resolve({
        encontro,
        capa: capaDoCenario(),
        versao: cancelado ? meu.versao + 1 : meu.versao,
      });
    },
    buscarLocalDoEncontro: (slug): Promise<LocalDoEncontro | undefined> => {
      locaisPedidos.push(slug);
      return Promise.resolve('local' in cenario ? cenario.local : { ponto: PONTO, endereco: 'Praça Benedito Calixto, s/n - Pinheiros' });
    },
    listarPorDistancia: (): Promise<PaginaPorDistancia> =>
      Promise.resolve({
        itens: [{ encontro: ENCONTRO, distanciaM: 1249 }],
        total: 1,
        temRegiao: cenario.temRegiao ?? true,
      }),
    buscarDetalhesPrivados: (): Promise<EncontroDaRede | undefined> =>
      Promise.resolve('detalhes' in cenario ? cenario.detalhes : PRIVADO),
    pedirParaParticipar: (): Promise<DesfechoDoPedido> =>
      Promise.resolve(
        cenario.pedido ?? {
          tipo: 'ok',
          pedido: { decisao: 'pending', pedidoEm: AGORA as Instant, encontro: PRIVADO },
        },
      ),
    lerMeuPedido: (): Promise<PedidoDaConta | undefined> =>
      Promise.resolve({ decisao: 'declined', pedidoEm: AGORA as Instant, encontro: PRIVADO }),
    desistirDoPedido: (): Promise<DesfechoDaDesistencia> =>
      Promise.resolve(cenario.desistencia ?? { tipo: 'ok', pedidoEm: AGORA as Instant }),
    listarMeusPedidos: (): Promise<PaginaDosMeusPedidos> =>
      Promise.resolve({
        itens: [{ decisao: 'declined', pedidoEm: AGORA as Instant, encontro: PRIVADO }],
        total: 1,
      }),
    estadoParaCriarEncontro: (): Promise<EstadoDaContaParaCriar> =>
      Promise.resolve(cenario.estadoDaConta ?? { temCanalVerificado: true, encontrosAtivos: 0 }),
    emTransacao: <T>(trabalho: (tx: TransacaoDaComunidade) => Promise<T>): Promise<T> =>
      trabalho(
        transacaoDeTeste(cenario, () => {
          cancelado = true;
        }),
      ),
  };
}

/**
 * O dobre da transacao da comunidade.
 *
 * `encontroDoAutor` devolve `undefined` quando o cenario diz que o encontro
 * **nao e desta conta** -- e e assim que o dobre imita a clausula `WHERE` do
 * Kysely: a borda nao tem como saber a diferenca entre "nao existe" e "nao e
 * seu", e e disso que o 404 do ADR-0021 depende.
 */
function transacaoDeTeste(cenario: Cenario, aoCancelar: () => void = () => {}): TransacaoDaComunidade {
  return {
    encontroDoAutor: (slug) => {
      encontrosPedidos.push(slug);
      return Promise.resolve('meuEncontro' in cenario ? cenario.meuEncontro : MEU_ENCONTRO);
    },
    inserirEncontro: (novo) => {
      gravados.push(novo);
      return Promise.resolve('encontro-na-praca');
    },
    alterarEncontro: (_id, versaoLida, mudanca) => {
      mudancas.push(mudanca);
      return Promise.resolve(cenario.versaoMudou === true ? null : versaoLida + 1);
    },
    cancelarEncontro: (_id, versaoLida, nota) => {
      cancelamentos.push(nota);
      // `null` e "a versao mudou": o `UPDATE` nao casou, e NADA foi gravado --
      // por isso `aoCancelar` nao e chamado neste ramo.
      if (cenario.versaoMudou === true) return Promise.resolve(null);
      versoesDoCancelamento.push(versaoLida);
      aoCancelar();
      return Promise.resolve(versaoLida + 1);
    },
    substituirPortes: () => Promise.resolve(),
    substituirEstrutura: () => Promise.resolve(),
    substituirParaLevar: () => Promise.resolve(),
    capaDoEnvio: (entrada) => {
      capasPedidas.push(entrada.uploadId);
      return Promise.resolve(cenario.capaNaoServe === true ? undefined : 'imagem-da-capa');
    },
    definirCapa: (_id, capa) => {
      capasDefinidas.push(capa === null ? null : capa.altText);
      return Promise.resolve();
    },
  };
}

function servidor(
  cenario: Cenario = {},
  autenticar: (token: string) => Promise<{ userId: UserId }> = (token) =>
    Promise.resolve({ userId: token as UserId }),
): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  const rede = repositorio(cenario);
  registrarRotasDaRede(app, {
    rede,
    autenticador: { autenticar },
    clock,
    escritas: new EncontroDaComunidade({
      rede,
      trilha: {
        record: (evento) => {
          trilhaDeTeste.push(evento);
          return Promise.resolve();
        },
      },
      ids: idsDeTeste,
      clock,
    }),
    // O ESQUEMA DO CORPO E O DO CONTRATO DE VERDADE, e nao um objeto inline:
    // e esse carregamento que faz o teste reprovar quando a operacao sai da
    // especificacao ou muda de forma la.
    contrato: carregarContrato(resolve(process.cwd(), 'api/openapi.yaml')),
  });
  return app;
}

interface Resposta {
  readonly status: number;
  readonly etag: string | undefined;
  readonly cache: string | string[] | number | undefined;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: {
    url?: string;
    como?: UserId | null;
    metodo?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
    corpo?: Record<string, unknown>;
    ifMatch?: string;
  } = {},
): Promise<Resposta> {
  const como = opcoes.como === undefined ? null : opcoes.como;
  const resposta = await app.inject({
    method: opcoes.metodo ?? 'GET',
    url: opcoes.url ?? '/network/events',
    headers: {
      ...(como === null ? {} : { authorization: `Bearer ${como}` }),
      ...(opcoes.ifMatch === undefined ? {} : { 'if-match': opcoes.ifMatch }),
    },
    ...(opcoes.corpo === undefined ? {} : { payload: opcoes.corpo }),
  });
  const etag = resposta.headers['etag'];
  return {
    status: resposta.statusCode,
    etag: typeof etag === 'string' ? etag : undefined,
    cache: resposta.headers['cache-control'],
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

const URL_DO_LOCAL = `/network/events/${SLUG}/location`;

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

  void it('o cartao traz o fuso e o rotulo calculado no servidor', async () => {
    const resposta = await pedir(servidor());
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens[0]?.['time_zone'], 'America/Sao_Paulo');
    assert.equal(itens[0]?.['status'], 'upcoming');
  });
});

void describe('nenhuma coordenada e nenhuma pessoa nas leituras publicas', () => {
  void it('a listagem NAO devolve UUID nem ponto em lugar nenhum do corpo', async () => {
    const resposta = await pedir(servidor());
    assert.equal(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(resposta.bruto),
      false,
      'ISCA: qualquer UUID no corpo reprova. O endereco de um encontro e o `slug`.',
    );
    for (const proibido of ['"lat"', '"lon"', '"point"']) {
      assert.equal(resposta.bruto.includes(proibido), false, `${proibido} na agenda publica.`);
    }
  });

  void it('o detalhe, COM conta, continua sem ponto: o corpo e um so', async () => {
    // ISCA: se o detalhe levar o ponto junto quando ha token, este caso acusa.
    // `getNetworkEvent` tem autenticacao opcional, e para o portao de contrato
    // publico isso e operacao publica (ADR-0027 12.5).
    const comConta = await pedir(servidor(), { url: `/network/events/${SLUG}`, como: QUEM_CHAMA });
    const semConta = await pedir(servidor(), { url: `/network/events/${SLUG}` });
    assert.equal(comConta.status, 200);
    assert.equal(comConta.bruto, semConta.bruto, 'ADR-0021: o corpo nao muda conforme o chamador.');
    for (const proibido of ['"lat"', '"lon"', '"point"', 'checkin', 'gallery', 'viewer_']) {
      assert.equal(comConta.bruto.includes(proibido), false, `${proibido} no detalhe publico.`);
    }
  });

  void it('o detalhe com token INVALIDO atende como quem nao tem conta', async () => {
    // O detalhe nao le o token. Um token vencido nao pode virar 401 numa rota
    // que atende sem token nenhum.
    const app = servidor({}, () => Promise.reject(new Error('token vencido')));
    const resposta = await pedir(app, { url: `/network/events/${SLUG}`, como: QUEM_CHAMA });
    assert.equal(resposta.status, 200);
  });

  void it('encontro invisivel ou inexistente: 404, e nunca 403', async () => {
    const resposta = await pedir(servidor({ encontro: undefined }), {
      url: '/network/events/encontro-que-foi-retirado',
    });
    assert.equal(resposta.status, 404);
  });

  void it('o cancelado sai na leitura publica com `status` `cancelled`', async () => {
    const resposta = await pedir(servidor({ encontro: { ...ENCONTRO, publicacao: 'cancelled' } }), {
      url: `/network/events/${SLUG}`,
    });
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['status'], 'cancelled');
  });
});

void describe('getNetworkEventLocation: o ponto, so com conta', () => {
  void it('ISCA -- SEM cabecalho de credencial, 401, e o repositorio nem e consultado', async () => {
    // A prova negativa da emenda 1 do ADR-0010: sem conta, nao ha ponto. E o
    // 401 vem ANTES da consulta -- sem conta nao se descobre nem se o `slug`
    // existe.
    locaisPedidos.length = 0;
    const resposta = await pedir(servidor(), { url: URL_DO_LOCAL, como: null });
    assert.equal(resposta.status, 401);
    assert.equal(resposta.bruto.includes('"lat"'), false);
    assert.deepEqual(locaisPedidos, [], 'o repositorio foi consultado antes da autenticacao');
  });

  void it('ISCA -- com "Bearer " vazio, 401 tambem', async () => {
    const resposta = await servidor().inject({
      method: 'GET',
      url: URL_DO_LOCAL,
      headers: { authorization: 'Bearer    ' },
    });
    assert.equal(resposta.statusCode, 401);
  });

  void it('ISCA -- com token recusado pelo servico de identidade, 401', async () => {
    // O servico de identidade recusa com o mesmo problema que ele devolve em
    // producao; a rota nao traduz nem engole.
    const app = servidor({}, () => Promise.reject(problemas.naoAutenticado()));
    const resposta = await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.equal(resposta.status, 401);
    assert.equal(resposta.bruto.includes('"lat"'), false);
  });

  void it('sem conta, 401 MESMO para `slug` que nao existe -- o 401 nao conta que ele existe', async () => {
    const resposta = await pedir(servidor({ local: undefined }), {
      url: '/network/events/nao-existe-isto/location',
      como: null,
    });
    assert.equal(resposta.status, 401);
  });

  void it('com conta, devolve `{ point, street_address }`, e o corpo tem so isso', async () => {
    const resposta = await pedir(servidor(), { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { point: PONTO, street_address: 'Praça Benedito Calixto, s/n - Pinheiros' });
  });

  void it('com conta e sem ponto marcado, `point` e nulo', async () => {
    const resposta = await pedir(servidor({ local: { ponto: null, endereco: null } }), {
      url: URL_DO_LOCAL,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200);
    assert.deepEqual(resposta.corpo, { point: null, street_address: null });
  });

  void it('encontro invisivel ou inexistente: 404 com o mesmo corpo do detalhe, e nunca 403', async () => {
    const local = await pedir(servidor({ local: undefined }), {
      url: '/network/events/encontro-que-foi-retirado/location',
      como: QUEM_CHAMA,
    });
    const detalhe = await pedir(servidor({ encontro: undefined }), {
      url: '/network/events/encontro-que-foi-retirado',
    });
    assert.equal(local.status, 404);
    assert.deepEqual(
      { ...local.corpo, instance: undefined, correlation_id: undefined },
      { ...detalhe.corpo, instance: undefined, correlation_id: undefined },
      'ADR-0027 12.5: o 404 do ponto e o mesmo corpo do 404 do detalhe',
    );
  });

  void it('o `slug` do caminho chega ao repositorio, e so ele', async () => {
    locaisPedidos.length = 0;
    await pedir(servidor(), { url: URL_DO_LOCAL, como: QUEM_CHAMA });
    assert.deepEqual(locaisPedidos, [SLUG]);
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
    assert.equal((await pedir(app)).status, 200);
  });

  void it('a agenda conta por IP, porque nao ha conta para contar', () => {
    assert.deepEqual(
      rotaDaAgenda.rateLimit.map((entrada) => entrada.dimension),
      [['ip']],
    );
    assert.equal(rotaDaAgenda.rateLimit.length, 1, 'um teto so, e uma dimensao so');
  });

  void it('o ponto conta por CONTA, porque ele exige uma (ADR-0027 12.5)', () => {
    assert.deepEqual(
      rotaDoLocal.rateLimit?.map((entrada) => entrada.dimension),
      [['account']],
    );
  });

  void it('a chamada 601 do ponto pela mesma conta na mesma hora e recusada com 429', async () => {
    const app = servidor({ contador: criarContadorEmMemoria(() => AGORA) });
    for (let i = 0; i < 600; i += 1) {
      const ok = await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA });
      assert.equal(ok.status, 200, `a chamada ${String(i + 1)} deveria passar`);
    }
    assert.equal((await pedir(app, { url: URL_DO_LOCAL, como: QUEM_CHAMA })).status, 429);
  });
});

const ROTAS_COM_CONTA: readonly { metodo: 'GET' | 'POST' | 'DELETE'; url: string }[] = [
  { metodo: 'GET', url: '/network/events/nearby' },
  { metodo: 'GET', url: `/network/events/${SLUG}/location` },
  { metodo: 'GET', url: `/network/events/${SLUG}/private-details` },
  { metodo: 'POST', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'GET', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'DELETE', url: `/network/events/${SLUG}/join-request` },
  { metodo: 'GET', url: '/network/join-requests' },
  // As duas de 19/10: a lista do dono e a leitura que entrega o `ETag`.
  { metodo: 'GET', url: '/network/my-events' },
  { metodo: 'GET', url: `/network/my-events/${SLUG}` },
];

void describe('as nove operacoes com conta: 401 sem token, e nada do encontro no corpo', () => {
  for (const rota of ROTAS_COM_CONTA) {
    void it(`ISCA -- ${rota.metodo} ${rota.url} sem token responde 401`, async () => {
      const resposta = await pedir(servidor(), { metodo: rota.metodo, url: rota.url, como: null });
      assert.equal(resposta.status, 401);
      for (const proibido of ['ISCA-', '"lat"', '"state"', 'Benedito']) {
        assert.equal(resposta.bruto.includes(proibido), false, `${proibido} no 401 de ${rota.url}`);
      }
    });
  }
});

void describe('o privado na leitura publica e o teaser', () => {
  void it('o detalhe do privado tem exatamente cinco campos, com e sem conta', async () => {
    const app = servidor({ encontro: PRIVADO });
    const semConta = await pedir(app, { url: `/network/events/${PRIVADO.slug}` });
    const comConta = await pedir(app, { url: `/network/events/${PRIVADO.slug}`, como: QUEM_CHAMA });
    assert.deepEqual(Object.keys(semConta.corpo).sort(), ['local_date', 'slug', 'status', 'title', 'visibility']);
    assert.equal(semConta.bruto, comConta.bruto, 'ADR-0021: a forma vem do evento, nao do chamador');
    assert.equal(semConta.bruto.includes('ISCA-'), false);
  });

  void it('private-details e location respondem com `private, no-store`', async () => {
    const detalhes = await pedir(servidor(), { url: `/network/events/${SLUG}/private-details`, como: QUEM_CHAMA });
    const local = await pedir(servidor(), { url: `/network/events/${SLUG}/location`, como: QUEM_CHAMA });
    assert.equal(detalhes.status, 200);
    assert.equal(detalhes.cache, 'private, no-store');
    assert.equal(local.cache, 'private, no-store');
  });

  void it('private-details sem aprovacao e 404, com o mesmo corpo do detalhe inexistente', async () => {
    const detalhes = await pedir(servidor({ detalhes: undefined }), {
      url: `/network/events/${SLUG}/private-details`,
      como: QUEM_CHAMA,
    });
    const inexistente = await pedir(servidor({ encontro: undefined }), { url: '/network/events/nao-existe' });
    assert.equal(detalhes.status, 404);
    assert.deepEqual(
      { ...detalhes.corpo, instance: undefined, correlation_id: undefined },
      { ...inexistente.corpo, instance: undefined, correlation_id: undefined },
    );
  });
});

void describe('o pedido para participar, no vocabulario do app', () => {
  void it('ISCA -- o recusado sai como `requested`, nunca como `declined`', async () => {
    const resposta = await pedir(servidor(), { url: `/network/events/${SLUG}/join-request`, como: QUEM_CHAMA });
    assert.deepEqual(Object.keys(resposta.corpo).sort(), ['requested_at', 'state']);
    assert.equal(resposta.corpo['state'], 'requested');
    assert.equal(resposta.bruto.includes('declined'), false);
  });

  void it('pedir em encontro encerrado e 400 `event_ended`', async () => {
    const resposta = await pedir(servidor({ pedido: { tipo: 'encerrado' } }), {
      metodo: 'POST',
      url: `/network/events/${SLUG}/join-request`,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.bruto.includes('event_ended'), true);
  });

  void it('desistir de aprovado e 400 `join_request_final`, e desistir de pedido e 200 `withdrawn`', async () => {
    const final = await pedir(servidor({ desistencia: { tipo: 'final' } }), {
      metodo: 'DELETE',
      url: `/network/events/${SLUG}/join-request`,
      como: QUEM_CHAMA,
    });
    assert.equal(final.status, 400);
    const ok = await pedir(servidor(), { metodo: 'DELETE', url: `/network/events/${SLUG}/join-request`, como: QUEM_CHAMA });
    assert.equal(ok.corpo['state'], 'withdrawn');
  });

  void it('meus pedidos traz o teaser e o estado, e nada oculto', async () => {
    const resposta = await pedir(servidor(), { url: '/network/join-requests', como: QUEM_CHAMA });
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.deepEqual(Object.keys(itens[0] ?? {}).sort(), ['event', 'requested_at', 'state']);
    assert.equal(resposta.bruto.includes('ISCA-'), false);
    assert.equal(resposta.bruto.includes('declined'), false);
  });
});

void describe('a agenda por distancia', () => {
  void it('com regiao, a distancia sai arredondada a 100 m e a ordem e `distancia`', async () => {
    const resposta = await pedir(servidor(), { url: '/network/events/nearby', como: QUEM_CHAMA });
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens[0]?.['distance_m'], 1200);
    assert.equal(resposta.corpo['effective_sort'], 'distancia');
  });

  void it('sem regiao, a ordem efetiva e `proximos`, e a resposta diz isso', async () => {
    const resposta = await pedir(servidor({ temRegiao: false }), { url: '/network/events/nearby', como: QUEM_CHAMA });
    assert.equal(resposta.corpo['effective_sort'], 'proximos');
  });
});

void describe('a regra do default de ordem, isolada', () => {
  void it('`upcoming` e `all` abrem em `proximos`, e `past` em `recentes`', () => {
    assert.equal(ordemPadraoDe('upcoming'), 'proximos');
    assert.equal(ordemPadraoDe('all'), 'proximos');
    assert.equal(ordemPadraoDe('past'), 'recentes');
  });
});

// ---------------------------------------------------------------------------
// As tres escritas da comunidade (ADR-0025 emenda 3)
// ---------------------------------------------------------------------------
//
// ## As iscas desta secao, e o que cada uma reprova quando desligada
//
// | o que se desliga em producao | reprova |
// |---|---|
// | `atingiuTetoDeEncontros` sempre `false` | o caso do teto |
// | `bloqueiosParaCriarEncontro` devolvendo `[]` | o caso do canal |
// | a ordem invertida (canal antes do teto) | o caso da ORDEM |
// | `publication_status` nascendo em qualquer coisa que nao `published` | o caso do 201 |
// | `errosDoNomeDoLugar` virando `errosDeTexto` | os dois casos de `place_name` |
// | `temContatoOuPagamento` fora de `title`/`summary`/`alt_text` | o caso do D59 |
// | `origin` nascendo `admin` | o caso da autoria |
// | `encontroDoAutor` sem a conta na clausula `WHERE` | o caso do 404 alheio |
// | o 404 de encontro alheio virando 403 | o mesmo caso |
// | `versaoExigida` deixando de exigir | o caso do 428 |
// | `lerIfMatch` trocado por uma regex sem sufixo | o caso do `"1-zstd"` |
// | `meuEncontro` deixando de barrar encerrado | o caso do encerrado |
// | `capaDoEnvio` sem a conta na clausula `WHERE` | o caso da capa alheia |
// | `chamadorAutenticado` saindo de qualquer manipulador | o caso do 401 |

const CORPO_VALIDO = {
  title: 'Encontro na praça',
  summary: 'Um domingo de manhã com os cães do bairro.',
  place: { place_name: 'Praça Benedito Calixto', neighborhood: 'Pinheiros', city: 'São Paulo', state: 'SP' },
  starts_at: new Date(AGORA + UMA_HORA * 24).toISOString(),
};

function criar(cenario: Cenario = {}, corpo: Record<string, unknown> = CORPO_VALIDO) {
  return pedir(servidor(cenario), { metodo: 'POST', corpo, como: QUEM_CHAMA });
}

function editar(
  cenario: Cenario = {},
  corpo: Record<string, unknown> = { title: 'Encontro na praça, agora de tarde' },
  ifMatch: string | null = '"1"',
) {
  return pedir(servidor(cenario), {
    metodo: 'PATCH',
    url: `/network/events/${SLUG}`,
    corpo,
    como: QUEM_CHAMA,
    ...(ifMatch === null ? {} : { ifMatch }),
  });
}

function cancelar(cenario: Cenario = {}, ifMatch: string | null = '"1"') {
  return pedir(servidor(cenario), {
    metodo: 'POST',
    url: `/network/events/${SLUG}/cancellation`,
    corpo: { note: 'Choveu demais e o parque fechou.' },
    como: QUEM_CHAMA,
    ...(ifMatch === null ? {} : { ifMatch }),
  });
}

void describe('criar encontro: quem pode, quantos, e ele PUBLICA direto', () => {
  void it('ISCA: com canal verificado e sem teto, 201 com o encontro ja publico', async () => {
    gravados.length = 0;
    const resposta = await criar();
    assert.equal(resposta.status, 201);
    // A resposta e a leitura publica: o mesmo corpo de `getNetworkEvent`.
    assert.equal(resposta.corpo['slug'], SLUG);
    assert.equal(resposta.corpo['visibility'], 'public');
    // Nenhum estado de revisao em lugar nenhum: a fila nao existe mais.
    assert.equal(resposta.bruto.includes('pending_review'), false);
    assert.equal(resposta.bruto.includes('review_state'), false);
    // Nenhum UUID interno (ADR-0010 item 6) e nenhuma coordenada (ADR-0006).
    assert.equal(resposta.bruto.includes('018f3a2b'), false);
    assert.equal(/"lat"|"lon"|street_address/.test(resposta.bruto), false);
    assert.equal(resposta.cache, 'private, no-store');
  });

  void it('ISCA: o encontro nasce com AUTOR, sem ponto e gratuito', async () => {
    gravados.length = 0;
    await criar();
    const gravado = gravados.at(-1);
    assert.ok(gravado !== undefined);
    assert.equal(gravado.autor, QUEM_CHAMA);
    assert.equal(gravado.lugar.ponto, null);
  });

  void it('ISCA: a trilha grava `network_event.submitted` com o ator e `origin: community`', async () => {
    trilhaDeTeste.length = 0;
    await criar();
    const evento = trilhaDeTeste.at(-1);
    assert.ok(evento !== undefined);
    assert.equal(evento.action, 'network_event.submitted');
    assert.equal(evento.actorKind, 'user');
    assert.equal(evento.actorUserId, QUEM_CHAMA);
    assert.equal((evento.after ?? {})['origin'], 'community');
    assert.equal((evento.after ?? {})['publication_status'], 'published');
  });

  void it('sem conta nenhuma, 401 antes de qualquer consulta', async () => {
    const resposta = await pedir(servidor(), { metodo: 'POST', corpo: CORPO_VALIDO, como: null });
    assert.equal(resposta.status, 401);
  });

  void it('ISCA: sem canal de contato verificado, 409 `contact-channel-unverified`', async () => {
    const resposta = await criar({ estadoDaConta: { temCanalVerificado: false, encontrosAtivos: 0 } });
    assert.equal(resposta.status, 409);
    assert.equal(resposta.corpo['type'], `${BASE_DE_PROBLEMA}/contact-channel-unverified`);
    assert.equal(resposta.corpo['next_action'], 'verify_email');
  });

  void it('ISCA: com tres encontros ativos, 409 `community-event-limit-reached`', async () => {
    const resposta = await criar({ estadoDaConta: { temCanalVerificado: true, encontrosAtivos: 3 } });
    assert.equal(resposta.status, 409);
    assert.equal(resposta.corpo['type'], `${BASE_DE_PROBLEMA}/community-event-limit-reached`);
  });

  void it('ISCA: a ORDEM -- o teto vem ANTES do canal, e nao o contrario', async () => {
    // Quem esta nos dois casos recebe o teto: mandar a pessoa confirmar o
    // e-mail para ela descobrir depois que ja tem tres encontros e uma ida a
    // caixa de entrada a toa. Inverter os dois `if` reprova so este caso.
    const resposta = await criar({ estadoDaConta: { temCanalVerificado: false, encontrosAtivos: 3 } });
    assert.equal(resposta.corpo['type'], `${BASE_DE_PROBLEMA}/community-event-limit-reached`);
  });

  void it('ISCA: o corpo e FECHADO pelo contrato -- visibilidade, preco e endereco nao entram', async () => {
    for (const extra of [
      { visibility: 'private' },
      { admission: { kind: 'paid', price: { amount: 2000, currency: 'BRL', unit: 'per_dog' } } },
      { slug: 'endereco-escolhido' },
      { street_address: 'Avenida Brasil, 200' },
      { ticket_url: 'https://exemplo.test/ingresso' },
      { publication_status: 'published' },
    ]) {
      const resposta = await criar({}, { ...CORPO_VALIDO, ...extra });
      assert.equal(resposta.status, 400, JSON.stringify(extra));
    }
  });

  void it('encontro que ja teria terminado e recusado com `event_in_past`', async () => {
    const resposta = await criar({}, { ...CORPO_VALIDO, starts_at: new Date(AGORA - UMA_HORA).toISOString() });
    assert.equal(resposta.status, 400);
    const erros = resposta.corpo['errors'] as { code: string }[];
    assert.equal(erros.some((e) => e.code === 'event_in_past'), true);
  });
});

void describe('o conteudo que ninguem mais olha: as duas conferencias sao a unica protecao', () => {
  void it('ISCA: `place_name` com endereco embutido, 400 com o campo e o codigo', async () => {
    for (const nome of [
      'Praça do Bairro - Avenida Brasil, 200',
      'Parque, CEP 01310-100',
      'Av. Brasil 1578',
      'Rodovia Raposo Tavares km 23',
      'Praça da Matriz, s/n',
      'Salão do bloco 2',
    ]) {
      const resposta = await criar({}, { ...CORPO_VALIDO, place: { ...CORPO_VALIDO.place, place_name: nome } });
      assert.equal(resposta.status, 400, nome);
      const erros = resposta.corpo['errors'] as { field: string; code: string }[];
      assert.equal(erros[0]?.field, 'place.place_name', nome);
      assert.equal(erros[0]?.code, 'address_in_place_name', nome);
    }
  });

  void it('ISCA: nome de lugar legitimo PASSA, com logradouro e com numero no nome', async () => {
    for (const nome of ['Avenida Paulista', 'Rua 25 de Março', 'Praça 14 de Janeiro', 'Quadra 302 Norte']) {
      const resposta = await criar({}, { ...CORPO_VALIDO, place: { ...CORPO_VALIDO.place, place_name: nome } });
      assert.equal(resposta.status, 201, `${nome}: ${resposta.bruto}`);
    }
  });

  void it('ISCA: D59 vale no titulo, na descricao e no texto alternativo da capa', async () => {
    const casos: [string, Record<string, unknown>][] = [
      ['title', { ...CORPO_VALIDO, title: 'Encontro, chama no 11 98765-4321' }],
      ['summary', { ...CORPO_VALIDO, summary: 'Inscrição em bit.ly/encontro, corre' }],
      ['notes', { ...CORPO_VALIDO, notes: 'Pix do rateio: 123.456.789-09' }],
      [
        'cover_image.alt_text',
        { ...CORPO_VALIDO, cover_image: { upload_id: ENVIO, alt_text: 'segue @meuperfil' } },
      ],
    ];
    for (const [campo, corpo] of casos) {
      const resposta = await criar({}, corpo);
      assert.equal(resposta.status, 400, campo);
      const erros = resposta.corpo['errors'] as { field: string; code: string }[];
      assert.equal(erros.some((e) => e.field === campo && e.code === 'contact_or_payment_detected'), true, campo);
    }
  });
});

void describe('a capa, que e publica', () => {
  void it('ISCA: a capa do corpo e confirmada e vai para a posicao 0', async () => {
    capasPedidas.length = 0;
    capasDefinidas.length = 0;
    const resposta = await criar({}, {
      ...CORPO_VALIDO,
      cover_image: { upload_id: ENVIO, alt_text: 'Cães correndo na grama' },
    });
    assert.equal(resposta.status, 201, resposta.bruto);
    assert.deepEqual(capasPedidas, [ENVIO]);
    assert.deepEqual(capasDefinidas, ['Cães correndo na grama']);
  });

  void it('ISCA: envio que nao serve (de outra conta, vencido, de outro proposito) e UM 400 so', async () => {
    const resposta = await criar({ capaNaoServe: true }, {
      ...CORPO_VALIDO,
      cover_image: { upload_id: ENVIO, alt_text: 'Cães correndo na grama' },
    });
    assert.equal(resposta.status, 400);
    const erros = resposta.corpo['errors'] as { field: string; code: string }[];
    assert.deepEqual(
      erros.map((e) => [e.field, e.code]),
      [['cover_image', 'upload_not_usable']],
    );
  });
});

void describe('o autor administra o proprio encontro: editar', () => {
  void it('com If-Match certo, 200 com o encontro e o ETag da versao nova', async () => {
    const resposta = await editar();
    assert.equal(resposta.status, 200, resposta.bruto);
    assert.equal(resposta.etag, '"2"');
  });

  void it('ISCA: encontro de OUTRA pessoa responde 404, nunca 403, e com o mesmo corpo', async () => {
    const alheio = await editar({ meuEncontro: undefined });
    assert.equal(alheio.status, 404);
    const inexistente = await pedir(servidor({ meuEncontro: undefined }), {
      metodo: 'PATCH',
      url: '/network/events/nunca-existiu',
      corpo: { title: 'Outro titulo' },
      como: QUEM_CHAMA,
      ifMatch: '"1"',
    });
    assert.equal(inexistente.status, 404);
    // O corpo e identico: nada distingue "nao e seu" de "nao existe".
    assert.equal(alheio.corpo['type'], inexistente.corpo['type']);
    assert.equal(alheio.corpo['title'], inexistente.corpo['title']);
  });

  void it('ISCA: sem If-Match, 428; com versao velha, 412', async () => {
    assert.equal((await editar({}, { title: 'Outro titulo' }, null)).status, 428);
    assert.equal((await editar({ versaoMudou: true })).status, 412);
  });

  void it('ISCA: o ETag sufixado pela borda VALE (`"1-zstd"`, `W/"1"`)', async () => {
    // O defeito de 05/10: o Caddy acrescenta o sufixo da codificacao e a
    // escrita caia em 412 sem ninguem ter alterado nada.
    for (const forma of ['"1-zstd"', '"1-gzip"', '"1-br"', 'W/"1"']) {
      const resposta = await editar({}, { title: 'Encontro na praça, de tarde' }, forma);
      assert.equal(resposta.status, 200, `${forma}: ${resposta.bruto}`);
    }
  });

  void it('ISCA: `place_name` e D59 valem na EDICAO tambem', async () => {
    const endereco = await editar({}, { place: { ...CORPO_VALIDO.place, place_name: 'Rua das Flores 12' } });
    assert.equal(endereco.status, 400);
    assert.equal((endereco.corpo['errors'] as { code: string }[])[0]?.code, 'address_in_place_name');
    const contato = await editar({}, { summary: 'Agora é em exemplo.test/encontro' });
    assert.equal(contato.status, 400);
    assert.equal((contato.corpo['errors'] as { code: string }[])[0]?.code, 'contact_or_payment_detected');
  });

  void it('ISCA: o corpo da edicao e FECHADO -- o autor nao muda visibilidade nem preco', async () => {
    for (const corpo of [
      { visibility: 'private' },
      { admission: { kind: 'free' } },
      { slug: 'outro-endereco' },
      { street_address: 'Avenida Brasil, 200' },
      { publication_status: 'cancelled' },
      { origin: 'admin' },
    ]) {
      const resposta = await editar({}, corpo);
      assert.equal(resposta.status, 400, JSON.stringify(corpo));
    }
  });

  void it('ISCA: encontro que JA TERMINOU nao se edita, e o que ja comecou se edita', async () => {
    const encerrado = await editar({
      meuEncontro: { ...MEU_ENCONTRO, startsAt: (AGORA - UMA_HORA * 3) as Instant, endsAt: (AGORA - UMA_HORA) as Instant },
    });
    assert.equal(encerrado.status, 400);
    assert.equal((encerrado.corpo['errors'] as { code: string }[])[0]?.code, 'event_ended');

    const acontecendo = await editar({
      meuEncontro: { ...MEU_ENCONTRO, startsAt: (AGORA - UMA_HORA) as Instant, endsAt: (AGORA + UMA_HORA) as Instant },
    });
    assert.equal(acontecendo.status, 200, acontecendo.bruto);
  });

  void it('ISCA: a trilha da edicao grava os NOMES dos campos, nunca o conteudo', async () => {
    trilhaDeTeste.length = 0;
    await editar({}, { title: 'Encontro na praça, de tarde', notes: 'Levem água' });
    const evento = trilhaDeTeste.at(-1);
    assert.equal(evento?.action, 'network_event.updated');
    assert.deepEqual((evento?.after ?? {})['fields'], ['notes', 'title']);
    assert.equal(JSON.stringify(evento?.after).includes('Levem'), false);
  });

  void it('`cover_image: null` tira a capa', async () => {
    capasDefinidas.length = 0;
    const resposta = await editar({}, { cover_image: null });
    assert.equal(resposta.status, 200, resposta.bruto);
    assert.deepEqual(capasDefinidas, [null]);
  });
});

void describe('o autor administra o proprio encontro: cancelar', () => {
  void it('ISCA: cancelar grava a nota e NAO apaga', async () => {
    cancelamentos.length = 0;
    const resposta = await cancelar();
    assert.equal(resposta.status, 200, resposta.bruto);
    assert.deepEqual(cancelamentos, ['Choveu demais e o parque fechou.']);
    assert.equal(resposta.etag, '"2"');
  });

  void it('ISCA: a nota do cancelamento NAO sai na resposta publica', async () => {
    const resposta = await cancelar();
    assert.equal(resposta.bruto.includes('Choveu'), false);
  });

  void it('encontro de outra pessoa: 404', async () => {
    assert.equal((await cancelar({ meuEncontro: undefined })).status, 404);
  });

  void it('ISCA: encontro ja cancelado responde `event_not_published`', async () => {
    const resposta = await cancelar({ meuEncontro: { ...MEU_ENCONTRO, publicacao: 'cancelled' } });
    assert.equal(resposta.status, 400);
    assert.equal((resposta.corpo['errors'] as { code: string }[])[0]?.code, 'event_not_published');
  });

  void it('encontro que ja terminou: `event_ended`, e nao ha o que cancelar', async () => {
    const resposta = await cancelar({
      meuEncontro: { ...MEU_ENCONTRO, startsAt: (AGORA - UMA_HORA * 3) as Instant, endsAt: (AGORA - UMA_HORA) as Instant },
    });
    assert.equal(resposta.status, 400);
    assert.equal((resposta.corpo['errors'] as { code: string }[])[0]?.code, 'event_ended');
  });

  void it('sem If-Match, 428', async () => {
    assert.equal((await cancelar({}, null)).status, 428);
  });

  void it('ISCA: a trilha grava `network_event.cancelled`', async () => {
    trilhaDeTeste.length = 0;
    await cancelar();
    assert.equal(trilhaDeTeste.at(-1)?.action, 'network_event.cancelled');
  });
});

// ---------------------------------------------------------------------------
// "Meus eventos": a lista do dono, o `ETag` e o caminho ate o cancelamento
// (19/10/2026, decisao do cliente)
// ---------------------------------------------------------------------------
//
// ## AS ISCAS DESTA SECAO, e o que cada uma reprova quando desligada
//
// | o que se desliga em producao | reprova |
// |---|---|
// | `chamadorAutenticado` trocado por constante na lista | `a conta que chega ao repositorio e a DO TOKEN` |
// | `comoEtag` fora do `reply.header` de `getMyNetworkEvent` | `a leitura do dono emite o ETag da versao` |
// | `buscarMeuEncontro` devolvendo o encontro de qualquer conta | `encontro de OUTRA pessoa: 404` |
// | o 404 da leitura do dono virando 403 | o mesmo caso |
// | `projetarMeuEncontro` trocado por `projetarEncontro` | `a projecao do dono tem SETE propriedades` |
// | `versaoExigida` do cancelamento deixando de comparar | `com ETag velho, 412` |
//
// **O que esta secao NAO prova, dito por escrito**: que o encontro de outra
// pessoa nao entra na CONSULTA. Aqui o dobre decide quem e o dono, e afirmar
// isso sobre o dobre seria medir a constante do arquivo. A prova disso e
// `tests/integration/meus-encontros-da-rede.test.ts`, contra Postgres, com duas
// contas e quatro linhas.

const URL_DOS_MEUS = '/network/my-events';
const URL_DO_MEU = `/network/my-events/${SLUG}`;

/** As sete propriedades de `MyNetworkEvent`, e nenhuma outra. */
const PROPRIEDADES_DO_MEU = ['cover', 'ends_at', 'slug', 'starts_at', 'status', 'time_zone', 'title'];

void describe('a lista do dono: `Perfil` > `Meus eventos`', () => {
  void it('ISCA: a conta que chega ao repositorio e a DO TOKEN, e nao da consulta', async () => {
    // O defeito que este caso pega: um `chamador` que viesse da requisicao (ou
    // uma constante) faria a lista de uma pessoa aparecer para outra. A
    // operacao NAO tem parametro de autoria -- o caso de baixo prova isso
    // contra o contrato --, entao a unica origem possivel e o token.
    recortesDosMeus.length = 0;
    const outra = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
    assert.equal((await pedir(servidor(), { url: URL_DOS_MEUS, como: QUEM_CHAMA })).status, 200);
    assert.equal((await pedir(servidor(), { url: URL_DOS_MEUS, como: outra })).status, 200);
    assert.deepEqual(
      recortesDosMeus.map((r) => r.chamador),
      [QUEM_CHAMA, outra],
    );
  });

  void it('ISCA: o contrato da lista NAO tem parametro de autoria nenhum', () => {
    // A metade de contrato da isca de cima. Um `author`, `mine` ou `user_id`
    // aqui seria uma porta para pedir a lista de outra pessoa, e o `WHERE` do
    // repositorio deixaria de ser o unico lugar que decide autoria.
    const spec = parseYaml(readFileSync(CAMINHO_DA_SPEC, 'utf8')) as {
      paths: Record<string, Record<string, { operationId?: string; parameters?: { name: string }[] }>>;
    };
    const operacao = spec.paths['/network/my-events']?.['get'];
    assert.equal(operacao?.operationId, 'listMyNetworkEvents');
    assert.deepEqual((operacao?.parameters ?? []).map((p) => p.name).sort(), ['limit', 'page']);
  });

  void it('ISCA: a projecao do dono tem SETE propriedades, e nenhuma do corpo publico', async () => {
    // Trocar `projetarMeuEncontro` por `projetarEncontro` faz este caso
    // reprovar nomeando as propriedades extras. A lista do dono e menor que a
    // vitrine de proposito (decisao de 19/10: o cartao e foto + titulo), e o
    // que entra alem disso esta justificado no esquema.
    const resposta = await pedir(servidor(), { url: URL_DOS_MEUS, como: QUEM_CHAMA });
    assert.equal(resposta.status, 200, resposta.bruto);
    const itens = resposta.corpo['items'] as Record<string, unknown>[];
    assert.equal(itens.length, 1);
    assert.deepEqual(Object.keys(itens[0] ?? {}).sort(), PROPRIEDADES_DO_MEU);
    // Nada de lugar, resumo, preco nem UUID: a varredura e no JSON cru.
    // `Benedito` NAO entra nesta lista: ele esta no TITULO do encontro de
    // teste ("Encontro de domingo na Benedito Calixto"), que e uma das sete
    // propriedades legitimas. Procurar por ele reprovaria o caso certo.
    for (const proibido of ['place_name', 'summary', 'admission', 'Pinheiros', 'visibility']) {
      assert.equal(resposta.bruto.includes(proibido), false, `${proibido} na lista do dono`);
    }
  });

  void it('a pagina traz `total`, `page` e `limit`, e nada de filtro aplicado', async () => {
    const resposta = await pedir(servidor(), { url: URL_DOS_MEUS, como: QUEM_CHAMA });
    assert.equal(resposta.corpo['total'], 1);
    assert.equal(resposta.corpo['page'], 1);
    assert.equal(resposta.corpo['limit'], 20);
    assert.equal('applied_filters' in resposta.corpo, false);
    assert.equal('effective_sort' in resposta.corpo, false);
  });

  void it('conta que nunca criou encontro recebe lista VAZIA, e nao erro', async () => {
    const resposta = await pedir(servidor({ meuEncontro: undefined }), {
      url: URL_DOS_MEUS,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200, resposta.bruto);
    assert.deepEqual(resposta.corpo['items'], []);
    assert.equal(resposta.corpo['total'], 0);
  });

  void it('a lista nao e cacheada: `private, no-store`', async () => {
    const resposta = await pedir(servidor(), { url: URL_DOS_MEUS, como: QUEM_CHAMA });
    assert.equal(resposta.cache, 'private, no-store');
  });
});

void describe('a leitura do dono: a FONTE do `ETag` da Rede', () => {
  void it('ISCA: a leitura do dono emite o `ETag` da versao, e as publicas NAO emitem', async () => {
    // ESTE E O DEFEITO QUE A ENTREGA FECHA. Medido em homologacao em
    // 19/10/2026: nenhuma leitura da Rede devolvia `ETag`, e por isso a
    // primeira escrita versionada era impossivel -- `cancelNetworkEvent` exige
    // `If-Match` e nao havia de onde tirar o valor.
    //
    // As duas metades estao no mesmo caso de proposito: afirmar so que a nova
    // emite deixaria passar um `ETag` posto por engano na agenda, que e o
    // cabecalho que NAO serve (uma versao de pagina apresentada como versao de
    // um item da 412 em toda tentativa).
    const app = servidor();
    const minha = await pedir(app, { url: URL_DO_MEU, como: QUEM_CHAMA });
    assert.equal(minha.status, 200, minha.bruto);
    assert.equal(minha.etag, '"1"');

    assert.equal((await pedir(app, { url: '/network/events' })).etag, undefined);
    assert.equal((await pedir(app, { url: `/network/events/${SLUG}` })).etag, undefined);
  });

  void it('o `ETag` acompanha a versao: versao 7 sai como `"7"`', async () => {
    const resposta = await pedir(
      servidor({ meuEncontro: { ...MEU_ENCONTRO, versao: 7 } }),
      { url: URL_DO_MEU, como: QUEM_CHAMA },
    );
    assert.equal(resposta.etag, '"7"');
  });

  void it('ISCA: encontro de OUTRA pessoa: 404 com o MESMO corpo do inexistente, nunca 403', async () => {
    const alheio = await pedir(servidor({ meuEncontro: undefined }), {
      url: URL_DO_MEU,
      como: QUEM_CHAMA,
    });
    const inexistente = await pedir(servidor({ meuEncontro: undefined }), {
      url: '/network/my-events/nunca-existiu',
      como: QUEM_CHAMA,
    });
    assert.equal(alheio.status, 404);
    assert.equal(inexistente.status, 404);
    assert.equal(alheio.corpo['type'], inexistente.corpo['type']);
    assert.equal(alheio.corpo['title'], inexistente.corpo['title']);
    // E sem `ETag`: um cabecalho de versao num 404 contaria que a linha existe.
    assert.equal(alheio.etag, undefined);
  });

  void it('o `slug` do caminho e a conta do token chegam ao repositorio, e so eles', async () => {
    meusEncontrosPedidos.length = 0;
    await pedir(servidor(), { url: URL_DO_MEU, como: QUEM_CHAMA });
    assert.deepEqual(meusEncontrosPedidos, [{ slug: SLUG, chamador: QUEM_CHAMA }]);
  });

  void it('a projecao e a MESMA da lista: esta leitura existe pela versao, nao por conteudo', async () => {
    const resposta = await pedir(servidor(), { url: URL_DO_MEU, como: QUEM_CHAMA });
    assert.deepEqual(Object.keys(resposta.corpo).sort(), PROPRIEDADES_DO_MEU);
  });
});

void describe('o caminho inteiro: ler a versao, cancelar com ela, e o encontro vira `cancelled`', () => {
  void it('ISCA: com o `ETag` da leitura, o cancelamento passa e o encontro vira `cancelled`', async () => {
    // O CAMINHO COMPLETO, num servidor so: a tela le a versao, manda o valor
    // em `If-Match` e, depois do 200, o encontro aparece cancelado. Desligar o
    // `reply.header('ETag', ...)` da leitura faz o primeiro `assert` reprovar;
    // desligar a comparacao de versao do `UPDATE` faz o caso do 412 reprovar.
    versoesDoCancelamento.length = 0;
    const app = servidor();

    const leitura = await pedir(app, { url: URL_DO_MEU, como: QUEM_CHAMA });
    assert.equal(leitura.etag, '"1"');
    assert.equal(leitura.corpo['status'], 'upcoming');

    const cancelamento = await pedir(app, {
      metodo: 'POST',
      url: `/network/events/${SLUG}/cancellation`,
      corpo: { note: 'Choveu demais e o parque fechou.' },
      como: QUEM_CHAMA,
      ifMatch: leitura.etag,
    });
    assert.equal(cancelamento.status, 200, cancelamento.bruto);
    // A versao que o `UPDATE` comparou e a que a LEITURA entregou: e isto que
    // prova que o valor atravessou o caminho inteiro, e nao que alguem mandou
    // um `"1"` escrito a mao.
    assert.deepEqual(versoesDoCancelamento, [1]);
    assert.equal(cancelamento.corpo['status'], 'cancelled');

    // E a leitura seguinte ja ve o estado novo e a versao nova.
    const depois = await pedir(app, { url: URL_DO_MEU, como: QUEM_CHAMA });
    assert.equal(depois.corpo['status'], 'cancelled');
    assert.equal(depois.etag, '"2"');
  });

  void it('ISCA: com `ETag` VELHO, 412 e nada vira `cancelled`', async () => {
    // O 412 e colisao entre pessoas: alguem salvou depois desta leitura. O que
    // este caso exige a mais do que o status e que **nada foi gravado**: sem a
    // segunda afirmacao, uma implementacao que cancelasse e depois respondesse
    // 412 passaria.
    const app = servidor({ versaoMudou: true });
    versoesDoCancelamento.length = 0;
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: `/network/events/${SLUG}/cancellation`,
      corpo: { note: 'Choveu demais e o parque fechou.' },
      como: QUEM_CHAMA,
      ifMatch: '"1"',
    });
    assert.equal(resposta.status, 412);
    assert.equal(resposta.corpo['type'], `${BASE_DE_PROBLEMA}/precondition-failed`);
    assert.deepEqual(versoesDoCancelamento, []);
    assert.equal((await pedir(app, { url: URL_DO_MEU, como: QUEM_CHAMA })).corpo['status'], 'upcoming');
  });

  void it('o 428 e o 412 tem tipos DIFERENTES: a tela os distingue', async () => {
    // Sem isto os dois cairiam na faixa generica do app, que e a frase que
    // esconde justamente o que resolve.
    const semVersao = await pedir(servidor(), {
      metodo: 'POST',
      url: `/network/events/${SLUG}/cancellation`,
      corpo: { note: 'Choveu demais e o parque fechou.' },
      como: QUEM_CHAMA,
    });
    assert.equal(semVersao.status, 428);
    assert.equal(semVersao.corpo['type'], `${BASE_DE_PROBLEMA}/precondition-required`);
  });
});

void describe('a capa do dono: o unico lugar que conta que a foto foi recusada', () => {
  // POR QUE ESTA SECAO EXISTE: outra frente mediu, em 19/10/2026, que a capa
  // sobe no mesmo `POST` de criar o encontro e que o processador pode RECUSA-LA
  // depois do `201`. `NetworkEventPublic` nao tem `rejection_reason`, a pagina
  // de detalhe do encontro foi apagada por decisao do cliente e o cartao da
  // agenda e foto + titulo -- entao nao havia superficie nenhuma que contasse a
  // recusa a quem enviou a imagem. A lista do dono e o lugar.

  void it('ISCA: capa RECUSADA sai com o motivo DO SERVIDOR, literal', async () => {
    // Um texto generico aqui ("a foto nao foi aceita") passaria num caso que
    // afirmasse so `status: rejected`. Este caso exige a FRASE, porque e ela
    // que diz a pessoa o que consertar.
    const resposta = await pedir(servidor({ capaDoDono: CAPA_RECUSADA }), {
      url: URL_DOS_MEUS,
      como: QUEM_CHAMA,
    });
    assert.equal(resposta.status, 200, resposta.bruto);
    const capa = (resposta.corpo['items'] as Record<string, unknown>[])[0]?.['cover'] as
      | Record<string, unknown>
      | undefined;
    assert.equal(capa?.['status'], 'rejected');
    assert.equal(capa?.['rejection_reason'], 'A imagem precisa ter pelo menos 600 x 600 pixels.');
    // E sem url: servir o endereco de uma derivada que nao existe e promessa
    // que a tela descobre quebrada.
    assert.equal(capa?.['url'], null);
  });

  void it('ISCA: capa PRONTA nao tem motivo nenhum, e a url e a derivada publica', async () => {
    const resposta = await pedir(servidor(), { url: URL_DOS_MEUS, como: QUEM_CHAMA });
    const capa = (resposta.corpo['items'] as Record<string, unknown>[])[0]?.['cover'] as
      | Record<string, unknown>
      | undefined;
    assert.equal(capa?.['status'], 'ready');
    assert.equal(capa?.['rejection_reason'], null);
    assert.equal(capa?.['url'], 'https://midia.exemplo.invalid/capa-1024.jpg');
  });

  void it('`processing` tem url nula e motivo nulo: "ainda nao" nao e "nunca"', async () => {
    const resposta = await pedir(
      servidor({ capaDoDono: { estado: 'processing', url: null, motivoDaRecusa: null } }),
      { url: URL_DOS_MEUS, como: QUEM_CHAMA },
    );
    const capa = (resposta.corpo['items'] as Record<string, unknown>[])[0]?.['cover'] as
      | Record<string, unknown>
      | undefined;
    assert.equal(capa?.['status'], 'processing');
    assert.equal(capa?.['url'], null);
    assert.equal(capa?.['rejection_reason'], null);
  });

  void it('encontro SEM capa sai com `cover` nulo, e nao com `processing`', async () => {
    const resposta = await pedir(servidor({ capaDoDono: undefined }), {
      url: URL_DOS_MEUS,
      como: QUEM_CHAMA,
    });
    assert.equal((resposta.corpo['items'] as Record<string, unknown>[])[0]?.['cover'], null);
  });

  void it('ISCA: o estado da capa NAO sai na agenda publica nem no detalhe publico', async () => {
    // A outra metade da decisao: estado de processamento de imagem e assunto
    // entre quem enviou e o servidor. Se ele vazasse para a agenda, qualquer
    // visitante leria o motivo da recusa da foto de outra pessoa.
    const app = servidor({ capaDoDono: CAPA_RECUSADA });
    for (const url of ['/network/events', `/network/events/${SLUG}`]) {
      const resposta = await pedir(app, { url });
      assert.equal(resposta.status, 200, resposta.bruto);
      for (const proibido of ['rejection_reason', 'processing', 'rejected', '600 x 600']) {
        assert.equal(resposta.bruto.includes(proibido), false, `${proibido} em ${url}`);
      }
    }
  });

  void it('a leitura de UM encontro meu carrega a mesma capa da lista', async () => {
    const resposta = await pedir(servidor({ capaDoDono: CAPA_RECUSADA }), {
      url: URL_DO_MEU,
      como: QUEM_CHAMA,
    });
    const capa = resposta.corpo['cover'] as Record<string, unknown>;
    assert.equal(capa['rejection_reason'], 'A imagem precisa ter pelo menos 600 x 600 pixels.');
  });
});
