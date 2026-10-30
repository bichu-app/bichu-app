/** As avaliacoes de um local do diretorio, sobre um Fastify de verdade. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { criarContadorDesligado } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type {
  EnderecoComercial,
  EntradaDoDiretorio,
} from '../../domain/entrada-do-diretorio.js';
import {
  PONTUACAO_VAZIA,
  validarEntradaDaAvaliacao,
  type AvaliacaoDoLocal,
  type EntradaDaAvaliacao,
  type PontuacaoDoLocal,
} from '../../domain/avaliacao-do-local.js';
import {
  CODIGO_DA_MODERACAO,
  MENSAGEM_DA_MODERACAO,
} from '../../../../shared/texto/moderacao.js';
import type {
  AvaliacaoGravada,
  DirectoryRepository,
  LocalDoDiretorio,
  PaginaDeAvaliacoes,
  RecorteDasAvaliacoes,
} from '../../ports/directory-repository.js';
import { registrarRotasDoDiretorio } from './directory-routes.js';

/** A montagem de URL de midia, pela porta. */
const URL_DE_MIDIA = (chave: string): string => `https://img.bichu.test/${chave}`;

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const QUEM_CHAMA = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRA_PESSOA = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const AGORA = 1_800_000_000_000;
const SLUG = 'clinica-veterinaria-santa-barbara';

const ENTRADA: EntradaDoDiretorio = {
  slug: SLUG,
  kinds: ['clinic'],
  entityKind: 'professional',
  displayName: 'Clínica Veterinária Santa Bárbara',
  about: 'Pronto atendimento 24 horas.',
  city: 'São Paulo',
  state: 'SP',
  neighborhood: 'Pinheiros',
  phoneE164: '+551130612200',
  siteUrl: null,
  verificacoes: [{ evidenceKind: 'crmv', decision: 'approved' }],
  distanciaEmMetros: 2740,
  logoPublicKey: null,
  pontuacao: PONTUACAO_VAZIA,
};

const SEM_AVALIACAO: PontuacaoDoLocal = {
  media: null,
  quantidade: 0,
  histograma: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * O estado do dobre: uma avaliacao por (local, autor), como o indice unico do
 * banco impoe.
 */
interface Cenario {
  /** Quem tem canal verificado. */
  readonly comCanalVerificado?: readonly UserId[];
  /** Avaliacoes ja gravadas, por autor. */
  readonly avaliacoes?: ReadonlyMap<UserId, AvaliacaoDoLocal>;
  /** Autores cuja conta esta DESABILITADA: o repositorio nao os lista. */
  readonly contasDesabilitadas?: readonly UserId[];
  /** O ENDERECO COMERCIAL da entrada (cliente, 21/10/2026). */
  readonly enderecoComercial?: EnderecoComercial;
}

const SEM_ENDERECO: EnderecoComercial = {
  postalCode: null,
  street: null,
  streetNumber: null,
  complement: null,
};

interface Espiao {
  readonly gravacoes: { autor: UserId; entrada: EntradaDaAvaliacao; criada: boolean }[];
}

function repositorio(cenario: Cenario, espiao: Espiao): DirectoryRepository {
  const avaliacoes = new Map<UserId, AvaliacaoDoLocal>(cenario.avaliacoes ?? []);
  const temCanal = (u: UserId): boolean => (cenario.comCanalVerificado ?? [QUEM_CHAMA]).includes(u);
  const habilitada = (u: UserId): boolean => !(cenario.contasDesabilitadas ?? []).includes(u);

  const pontuacao = (): PontuacaoDoLocal => {
    const visiveis = [...avaliacoes.entries()].filter(([autor]) => habilitada(autor));
    if (visiveis.length === 0) return SEM_AVALIACAO;
    const histograma = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let soma = 0;
    for (const [, a] of visiveis) {
      soma += a.nota;
      histograma[a.nota as 1 | 2 | 3 | 4 | 5] += 1;
    }
    return {
      media: Math.round((soma / visiveis.length) * 10) / 10,
      quantidade: visiveis.length,
      histograma,
    };
  };

  return {
    listarPublicados: () => {
      throw new Error('listarPublicados nao e exercitado por este arquivo');
    },

    lerLocalPublicado: (slug, chamador): Promise<LocalDoDiretorio | undefined> => {
      if (slug !== SLUG) return Promise.resolve(undefined);
      const minha = avaliacoes.get(chamador);
      return Promise.resolve({
        entrada: ENTRADA,
        pontuacao: pontuacao(),
        refDaMinhaAvaliacao: minha?.ref ?? null,
        podeAvaliar: temCanal(chamador),
        fotoPublicKey: null,
        enderecoComercial: cenario.enderecoComercial ?? SEM_ENDERECO,
      });
    },

    listarAvaliacoes: (r: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined> => {
      if (r.slug !== SLUG) return Promise.resolve(undefined);
      const visiveis = [...avaliacoes.entries()]
        .filter(([autor]) => habilitada(autor))
        .map(([autor, a]) => ({ ...a, minha: autor === r.chamador }));
      return Promise.resolve({ itens: visiveis, total: visiveis.length });
    },

    gravarMinhaAvaliacao: (
      slug: string,
      chamador: UserId,
      entrada: EntradaDaAvaliacao,
    ): Promise<AvaliacaoGravada | 'local-ausente' | 'sem-canal-verificado'> => {
      if (slug !== SLUG) return Promise.resolve('local-ausente');
      if (!temCanal(chamador)) return Promise.resolve('sem-canal-verificado');
      const jaTinha = avaliacoes.get(chamador);
      const gravada: AvaliacaoDoLocal = {
        ref: jaTinha?.ref ?? `ref-de-${chamador.slice(-2)}-aaaaaaaa`,
        nota: entrada.nota,
        texto: entrada.texto,
        nomeDeExibicaoDoAutor: 'Ana',
        criadaEm: jaTinha?.criadaEm ?? new Date(AGORA),
        editadaEm: jaTinha === undefined ? null : new Date(AGORA),
        minha: true,
      };
      avaliacoes.set(chamador, gravada);
      espiao.gravacoes.push({ autor: chamador, entrada, criada: jaTinha === undefined });
      return Promise.resolve({
        avaliacao: gravada,
        criada: jaTinha === undefined,
        pontuacao: pontuacao(),
      });
    },

    temCanalVerificadoParaAvaliar: (chamador: UserId): Promise<boolean> =>
      Promise.resolve(temCanal(chamador)),

    apagarMinhaAvaliacao: (slug: string, chamador: UserId): Promise<boolean> => {
      if (slug !== SLUG) return Promise.resolve(false);
      avaliacoes.delete(chamador);
      return Promise.resolve(true);
    },

    denunciarAvaliacao: (slug, ref, chamador) => {
      if (slug !== SLUG) return Promise.resolve('ausente');
      const alvo = [...avaliacoes.entries()].find(([, a]) => a.ref === ref);
      if (alvo === undefined) return Promise.resolve('ausente');
      return Promise.resolve(alvo[0] === chamador ? 'propria' : 'enfileirada');
    },
  };
}

const clock: Clock = { now: () => AGORA as Instant };

/** O teto entra DESLIGADO neste arquivo, e a escolha e deliberada. */
function servidor(cenario: Cenario, espiao: Espiao, log?: string[]): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
    ...(log === undefined ? {} : { destinoDoLog: { write: (linha: string) => void log.push(linha) } }),
  });
  registrarRotasDoDiretorio(app, {
    diretorio: repositorio(cenario, espiao),
    urlDeMidia: URL_DE_MIDIA,
    autenticador: {
      autenticar: (token: string) =>
        Promise.resolve({ userId: token === 'outra' ? OUTRA_PESSOA : QUEM_CHAMA }),
    },
    clock,
  });
  return app;
}

const COM_CONTA = { authorization: 'Bearer eu' };

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

/**
 * `JSON.parse` tipado em vez de `resposta.json()`, pelo mesmo motivo do arquivo
 * irmao: `json()` devolve `any`, e `any` desliga o lint que confere o acesso --
 * num arquivo cujo trabalho e afirmar a FORMA da resposta, ler o corpo sem tipo
 * seria afirmar sobre o que nao se conferiu.
 */
async function pedir(
  app: RegistradorDeRotas,
  opcoes: {
    method?: 'GET' | 'PUT' | 'POST' | 'DELETE';
    url: string;
    payload?: Record<string, unknown>;
    semConta?: boolean;
  },
): Promise<Resposta> {
  const resposta = await app.inject({
    method: opcoes.method ?? 'GET',
    url: opcoes.url,
    ...(opcoes.semConta === true ? {} : { headers: COM_CONTA }),
    ...(opcoes.payload === undefined ? {} : { payload: opcoes.payload }),
  });
  if (typeof resposta.body !== 'string') throw new Error('resposta sem corpo de texto');
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

/** Um campo aninhado, tipado, para o lint nao precisar de `any`. */
function obj(corpo: Record<string, unknown>, chave: string): Record<string, unknown> {
  return corpo[chave] as Record<string, unknown>;
}

void describe('a avaliacao de um local do diretorio', () => {
  void it(
    'ISCA (a): o SEGUNDO envio da mesma pessoa ATUALIZA a avaliacao dela, e nao cria uma segunda',
    async () => {
      const espiao: Espiao = { gravacoes: [] };
      const app = servidor({}, espiao);
      try {
        const primeira = await pedir(app, {
          method: 'PUT',
          url: `/directory/entries/${SLUG}/reviews/me`,
          payload: { rating: 5, body: 'Atenderam a minha cadela de madrugada.' },
        });
        assert.equal(primeira.status, 200);
        assert.equal(primeira.corpo['created'], true, 'a primeira NASCE');

        const segunda = await pedir(app, {
          method: 'PUT',
          url: `/directory/entries/${SLUG}/reviews/me`,
          payload: { rating: 3, body: 'Mudei de ideia: demorou na segunda vez.' },
        });
        assert.equal(segunda.status, 200);

        assert.equal(segunda.corpo['created'], false, 'a segunda ATUALIZA, nao cria');

        const lista = await pedir(app, {
          method: 'GET',
          url: `/directory/entries/${SLUG}/reviews`,
        });
        assert.equal(lista.corpo['total'], 1, 'uma avaliacao, nao duas');
        const itens = lista.corpo['items'] as { rating: number }[];
        assert.equal(itens[0]?.rating, 3, 'a nota e a da ultima edicao');

        assert.equal(obj(segunda.corpo, 'rating')['count'], 1);
        assert.equal(obj(segunda.corpo, 'rating')['average'], 3);

        assert.equal(obj(segunda.corpo, 'review')['ref'], obj(primeira.corpo, 'review')['ref']);

        assert.equal(obj(primeira.corpo, 'review')['edited_at'], null);
        assert.notEqual(obj(segunda.corpo, 'review')['edited_at'], null);
      } finally {
        await app.close();
      }
    },
  );

  void it('ISCA (b): quem NAO confirmou o e-mail nao consegue avaliar, e recebe 409', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({ comCanalVerificado: [] }, espiao);
    try {
      const r = await pedir(app, {
          method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 5 },
      });

      assert.equal(r.status, 409, 'e a mesma regua de criar encontro');
      assert.equal(
        r.corpo['type'],
        `${BASE_DE_PROBLEMA}/contact-channel-unverified`,
        'o MESMO tipo de problema que criar encontro: a regra e a mesma regra',
      );
      assert.equal(r.corpo['next_action'], 'verify_email');
      assert.equal(espiao.gravacoes.length, 0, 'nada foi escrito');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (b2): a LEITURA nao exige e-mail confirmado -- visitante com conta LE', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({ comCanalVerificado: [] }, espiao);
    try {
      const r = await pedir(app, {
          method: 'GET',
        url: `/directory/entries/${SLUG}`,
      });
      assert.equal(r.status, 200, 'ler e permitido');
      assert.equal(r.corpo['can_review'], false);
      assert.equal(r.corpo['review_blocked_reason'], 'unverified_channel');
    } finally {
      await app.close();
    }
  });

  void it('o ENDERECO COMERCIAL sai no detalhe, nos quatro campos e como gravado', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor(
      {
        enderecoComercial: {
          postalCode: '05422030',
          street: 'Rua Teodoro Sampaio',
          streetNumber: '1020',
          complement: 'Sala 3',
        },
      },
      espiao,
    );
    try {
      const r = await pedir(app, { method: 'GET', url: `/directory/entries/${SLUG}` });
      assert.equal(r.status, 200);
      assert.equal(r.corpo['postal_code'], '05422030');
      assert.equal(r.corpo['street'], 'Rua Teodoro Sampaio');
      assert.equal(r.corpo['street_number'], '1020');
      assert.equal(r.corpo['complement'], 'Sala 3');
    } finally {
      await app.close();
    }
  });

  void it('ISCA: entrada SEM endereco devolve os quatro NULOS, e nao campo ausente', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, { method: 'GET', url: `/directory/entries/${SLUG}` });
      assert.equal(r.status, 200);
      for (const campo of ['postal_code', 'street', 'street_number', 'complement']) {
        assert.ok(campo in r.corpo, `\`${campo}\` precisa EXISTIR na resposta, ainda que nulo`);
        assert.equal(r.corpo[campo], null);
      }
    } finally {
      await app.close();
    }
  });

  void it('ISCA (b3): sem conta nenhuma, a escrita e 401 e a leitura tambem', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const escrita = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 5 },
        semConta: true,
      });
      assert.equal(escrita.status, 401);
      assert.equal(espiao.gravacoes.length, 0);

      const leitura = await pedir(app, {
        method: 'GET',
        url: `/directory/entries/${SLUG}`,
        semConta: true,
      });
      assert.equal(leitura.status, 401, 'a leitura do local tambem exige conta');
    } finally {
      await app.close();
    }
  });

  void it(
    'ISCA (c): a avaliacao de uma conta DESABILITADA nao e listada, e nao conta na media',
    async () => {
      const espiao: Espiao = { gravacoes: [] };
      const avaliacoes = new Map<UserId, AvaliacaoDoLocal>([
        [
          QUEM_CHAMA,
          {
            ref: 'ref-da-ana-aaaaaaaaaa',
            nota: 5,
            texto: 'Excelente.',
            nomeDeExibicaoDoAutor: 'Ana',
            criadaEm: new Date(AGORA),
            editadaEm: null,
            minha: false,
          },
        ],
        [
          OUTRA_PESSOA,
          {
            ref: 'ref-do-bruno-bbbbbbbb',
            nota: 1,
            texto: 'Pessimo.',
            nomeDeExibicaoDoAutor: 'Bruno',
            criadaEm: new Date(AGORA),
            editadaEm: null,
            minha: false,
          },
        ],
      ]);
      const app = servidor(
        { avaliacoes, contasDesabilitadas: [OUTRA_PESSOA] },
        espiao,
      );
      try {
        const lista = await pedir(app, {
          method: 'GET',
          url: `/directory/entries/${SLUG}/reviews`,
        });
        const itens = lista.corpo['items'] as { ref: string }[];

        assert.equal(itens.length, 1, 'so a avaliacao da conta habilitada');
        assert.equal(itens[0]?.ref, 'ref-da-ana-aaaaaaaaaa');
        assert.ok(
          !itens.some((i) => i.ref === 'ref-do-bruno-bbbbbbbb'),
          'a avaliacao da conta desabilitada NAO aparece, e nao vira anonima',
        );

        assert.equal(lista.corpo['total'], 1);
        const local = await pedir(app, {
          method: 'GET',
          url: `/directory/entries/${SLUG}`,
        });
        assert.equal(obj(local.corpo, 'rating')['count'], 1, 'a contagem bate com a lista');
        assert.equal(obj(local.corpo, 'rating')['average'], 5, 'o 1 do Bruno nao entra na media');
      } finally {
        await app.close();
      }
    },
  );

  void it('ISCA (d): nota fora de 1--5 e recusada, com 400 e o campo nomeado', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      for (const nota of [0, 6, -1, 99]) {
        const r = await pedir(app, {
          method: 'PUT',
          url: `/directory/entries/${SLUG}/reviews/me`,
          payload: { rating: nota },
        });
        assert.equal(r.status, 400, `nota ${String(nota)} e recusada`);
      }
      for (const nota of [1, 3, 5]) {
        const r = await pedir(app, {
          method: 'PUT',
          url: `/directory/entries/${SLUG}/reviews/me`,
          payload: { rating: nota },
        });
        assert.equal(r.status, 200, `nota ${String(nota)} e aceita`);
      }
      assert.equal(espiao.gravacoes.length, 3, 'so as tres validas foram gravadas');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (d2): nota fracionada e recusada -- a escala e inteira', () => {
    assert.equal(validarEntradaDaAvaliacao({ rating: 4.5 }).entrada, undefined);
    assert.equal(validarEntradaDaAvaliacao({ rating: 4 }).entrada?.nota, 4);
  });

  void it('o TEXTO e opcional: dar so a nota funciona e grava nulo', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, {
          method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 4 },
      });
      assert.equal(r.status, 200);
      assert.equal(obj(r.corpo, 'review')['body'], null);
      assert.equal(espiao.gravacoes[0]?.entrada.texto, null);
    } finally {
      await app.close();
    }
  });

  void it('texto so com espaco vira NULO, e nao string vazia', () => {
    assert.equal(validarEntradaDaAvaliacao({ rating: 5, body: '   ' }).entrada?.texto, null);
  });

  void it('HTML no texto e recusado na ENTRADA, e nao escapado na saida', () => {
    const r = validarEntradaDaAvaliacao({ rating: 5, body: 'Otimo <script>x</script>' });
    assert.equal(r.entrada, undefined);
    assert.equal(r.erros[0]?.code, 'html_not_allowed');
  });

  void it('texto acima de 1500 caracteres e recusado', () => {
    assert.equal(validarEntradaDaAvaliacao({ rating: 5, body: 'a'.repeat(1501) }).entrada, undefined);
    assert.equal(validarEntradaDaAvaliacao({ rating: 5, body: 'a'.repeat(1500) }).entrada?.texto?.length, 1500);
  });

  void it('slug que nao e de entrada publicada responde 404, nunca 403', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      for (const [metodo, url] of [
        ['GET', '/directory/entries/nao-existe'],
        ['GET', '/directory/entries/nao-existe/reviews'],
        ['DELETE', '/directory/entries/nao-existe/reviews/me'],
      ] as const) {
        const r = await pedir(app, {
          method: metodo,
          url,
        });
        assert.equal(r.status, 404, `${metodo} ${url}`);
      }
      const escrita = await pedir(app, {
          method: 'PUT',
        url: '/directory/entries/nao-existe/reviews/me',
        payload: { rating: 5 },
      });
      assert.equal(escrita.status, 404, 'rascunho e oculto caem no MESMO 404');
    } finally {
      await app.close();
    }
  });

  void it('apagar a minha e idempotente: sem avaliacao, ainda e 204', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const primeira = await pedir(app, {
          method: 'DELETE',
        url: `/directory/entries/${SLUG}/reviews/me`,
      });
      assert.equal(primeira.status, 204);
      const segunda = await pedir(app, {
          method: 'DELETE',
        url: `/directory/entries/${SLUG}/reviews/me`,
      });
      assert.equal(segunda.status, 204, 'o estado pedido e o estado final');
    } finally {
      await app.close();
    }
  });

  void it('denunciar a PROPRIA avaliacao e recusado: a porta dela e o DELETE', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const avaliacoes = new Map<UserId, AvaliacaoDoLocal>([
      [
        QUEM_CHAMA,
        {
          ref: 'ref-da-ana-aaaaaaaaaa',
          nota: 5,
          texto: 'Excelente.',
          nomeDeExibicaoDoAutor: 'Ana',
          criadaEm: new Date(AGORA),
          editadaEm: null,
          minha: true,
        },
      ],
    ]);
    const app = servidor({ avaliacoes }, espiao);
    try {
      const r = await pedir(app, {
          method: 'POST',
        url: `/directory/entries/${SLUG}/reviews/ref-da-ana-aaaaaaaaaa/reports`,
        payload: { reason: 'spam' },
      });
      assert.equal(r.status, 400);
    } finally {
      await app.close();
    }
  });

  void it('a denuncia de outra pessoa responde 202, e nao esconde a avaliacao', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const avaliacoes = new Map<UserId, AvaliacaoDoLocal>([
      [
        OUTRA_PESSOA,
        {
          ref: 'ref-do-bruno-bbbbbbbb',
          nota: 1,
          texto: 'Afirmacao falsa sobre o lugar.',
          nomeDeExibicaoDoAutor: 'Bruno',
          criadaEm: new Date(AGORA),
          editadaEm: null,
          minha: false,
        },
      ],
    ]);
    const app = servidor({ avaliacoes }, espiao);
    try {
      const r = await pedir(app, {
          method: 'POST',
        url: `/directory/entries/${SLUG}/reviews/ref-do-bruno-bbbbbbbb/reports`,
        payload: { reason: 'false_information', detail: 'Nunca atenderam essa pessoa.' },
      });
      assert.equal(r.status, 202);

      const lista = await pedir(app, {
          method: 'GET',
        url: `/directory/entries/${SLUG}/reviews`,
      });
      assert.equal(lista.corpo['total'], 1, 'a denuncia NAO esconde');
    } finally {
      await app.close();
    }
  });

  void it('nenhum UUID e nenhum identificador de autor sai nas respostas', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const avaliacoes = new Map<UserId, AvaliacaoDoLocal>([
      [
        OUTRA_PESSOA,
        {
          ref: 'ref-do-bruno-bbbbbbbb',
          nota: 4,
          texto: 'Bom.',
          nomeDeExibicaoDoAutor: 'Bruno',
          criadaEm: new Date(AGORA),
          editadaEm: null,
          minha: false,
        },
      ],
    ]);
    const app = servidor({ avaliacoes }, espiao);
    try {
      for (const url of [`/directory/entries/${SLUG}`, `/directory/entries/${SLUG}/reviews`]) {
        const r = await pedir(app, {
          url,
        });
        const cru = r.bruto;
        assert.ok(!cru.includes(OUTRA_PESSOA), `${url} nao vaza a conta do autor`);
        assert.ok(!cru.includes(QUEM_CHAMA), `${url} nao vaza a conta de quem chama`);
        assert.ok(!/"id"\s*:/.test(cru), `${url} nao tem campo id`);
        assert.ok(!cru.includes('moderation_reason'), `${url} nao vaza motivo de moderacao`);
      }
    } finally {
      await app.close();
    }
  });

  void it('local sem avaliacao: media NULA e nao zero, e as cinco barras existem', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, {
          method: 'GET',
        url: `/directory/entries/${SLUG}`,
      });
      assert.equal(obj(r.corpo, 'rating')['average'], null, 'NULA, nunca 0');
      assert.equal(obj(r.corpo, 'rating')['count'], 0);
      const histograma = obj(obj(r.corpo, 'rating'), 'histogram');
      assert.deepEqual(Object.keys(histograma).sort(), ['1', '2', '3', '4', '5']);
    } finally {
      await app.close();
    }
  });

  void it('ISCA (m1): avaliacao com xingamento e RECUSADA, chamando a aplicacao direto', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 1, body: 'o atendente e um babaca, nao voltem' },
      });

      assert.equal(r.status, 400, 'recusada na escrita, nao depois');
      const erros = r.corpo['errors'] as { field: string; code: string }[];
      assert.equal(erros.length, 1);
      assert.equal(erros[0]?.field, 'body');
      assert.equal(erros[0]?.code, CODIGO_DA_MODERACAO);

      assert.equal(espiao.gravacoes.length, 0, 'nada chegou ao repositorio');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (m2): "Clinica Pinto" e "cadela" PASSAM -- o falso positivo e o defeito', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: {
          rating: 5,
          body: 'Levei minha cadela na Clinica Pinto e o cavalo crioulo do vizinho tambem. Otima reputacao.',
        },
      });

      assert.equal(r.status, 200, 'nome proprio e termo do dominio NAO sao ofensa');
      assert.equal(espiao.gravacoes.length, 1, 'foi gravada');
      assert.equal(
        espiao.gravacoes[0]?.entrada.texto,
        'Levei minha cadela na Clinica Pinto e o cavalo crioulo do vizinho tambem. Otima reputacao.',
        'chegou inteira ao repositorio, sem corte e sem mascara',
      );
    } finally {
      await app.close();
    }
  });

  void it('ISCA (m3): a palavra recusada NAO aparece na resposta nem no log', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const log: string[] = [];
    const app = servidor({}, espiao, log);
    try {
      const PALAVRA = 'babaca';
      const r = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 1, body: `que ${PALAVRA}, nunca mais` },
      });
      assert.equal(r.status, 400);

      assert.ok(
        !r.bruto.toLowerCase().includes(PALAVRA),
        'a palavra recusada vazou no corpo da resposta',
      );
      const erros = r.corpo['errors'] as { message: string }[];
      assert.equal(erros[0]?.message, MENSAGEM_DA_MODERACAO);

      const tudo = log.join('\n').toLowerCase();
      assert.ok(tudo.length > 0, 'o log foi capturado de verdade (senao a isca nao mede nada)');
      assert.ok(!tudo.includes(PALAVRA), 'a palavra recusada vazou no log');
      assert.ok(!tudo.includes('nunca mais'), 'o texto recusado vazou no log');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (m4): CONTRAPESO -- avaliacao limpa com critica negativa e aceita e gravada', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      const r = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 1, body: 'Demorou duas horas, cobraram caro e nao resolveram. Nao recomendo.' },
      });

      assert.equal(r.status, 200);
      assert.equal(r.corpo['created'], true);
      assert.equal(espiao.gravacoes.length, 1, 'gravada de verdade');
      assert.equal(obj(r.corpo, 'review')['rating'], 1, 'nota baixa nao e ofensa');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (m5): a trava de e-mail confirmado vem ANTES da moderacao -- 409 e nao 400', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({ comCanalVerificado: [] }, espiao);
    try {
      const r = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 1, body: 'o atendente e um babaca' },
      });

      assert.equal(r.status, 409, 'o canal verificado vence a moderacao');
      assert.equal(r.corpo['type'], `${BASE_DE_PROBLEMA}/contact-channel-unverified`);
      assert.equal(r.corpo['next_action'], 'verify_email');
      assert.ok(!r.bruto.toLowerCase().includes('babaca'));
      assert.equal(espiao.gravacoes.length, 0);
    } finally {
      await app.close();
    }
  });
});

