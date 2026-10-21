/**
 * As avaliacoes de um local do diretorio, sobre um Fastify de verdade.
 *
 * Mesmo arranjo de `directory-routes.test.ts` e pelo mesmo motivo: tres coisas
 * que estas rotas prometem so existem com o framework no caminho -- o **401**
 * de quem nao tem conta (a credencial e lida na borda), o **429** do teto (que
 * e gancho e nao `if`) e a **serializacao real**, que e onde um `id` interno
 * vazaria.
 *
 * ## ATENCAO: ESTAS ISCAS FORAM ESCRITAS E **NAO FORAM RODADAS**
 *
 * O cliente proibiu rodar suite unitaria e de integracao nesta rodada
 * (18/10/2026), e isto esta declarado aqui e no relatorio em vez de ser
 * omitido. **Nenhuma linha deste arquivo e prova de nada ainda**: ela e uma
 * afirmacao escrita, com o alvo nomeado, para a rodada em que a suite voltar a
 * rodar.
 *
 * As quatro iscas que o pedido exige, com **o que desligar** para provar cada
 * uma. Quem for rodar: desligue UMA por vez, confira o disco com
 * `git diff --stat`, rode, confirme que reprova **so** o caso nomeado, e
 * restaure.
 *
 * | isca | o que desligar para provar | onde |
 * |---|---|---|
 * | (a) o segundo envio ATUALIZA, nao cria | trocar o `ON CONFLICT ... DO UPDATE` por `DO NOTHING`, ou o `INSERT` por `INSERT` puro | `kysely-directory-repository.ts`, `gravarMinhaAvaliacao` |
 * | (b) quem nao confirmou e-mail NAO avalia | devolver sempre `true` em vez de `'sem-canal-verificado'` | o mesmo metodo, logo apos `TEM_CANAL_VERIFICADO` |
 * | (c) avaliacao de conta desabilitada NAO e listada | tirar `conta_habilitada(...)` de `AVALIACAO_VISIVEL` | `kysely-directory-repository.ts`, a constante |
 * | (d) nota fora de 1--5 e recusada | tirar o ramo `out_of_range` de `validarEntradaDaAvaliacao` | `avaliacao-do-local.ts` |
 *
 * **(c) e a unica que este arquivo NAO consegue provar sozinho**, e a limitacao
 * precisa estar escrita: `conta_habilitada` e uma funcao do BANCO, e o dobre em
 * memoria daqui nao a executa. O caso de (c) abaixo mede o contrato da porta --
 * que o repositorio NAO devolve a linha da conta desabilitada --, o que e o
 * acordo que a borda consome. A prova de que o SQL cumpre o acordo e de
 * integracao, contra Postgres, e esta nomeada no fim do arquivo como pendente.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { criarServidor } from '../../../../shared/http/server.js';
import { criarContadorDesligado } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, Instant, UserId } from '../../../../shared/types/brands.js';
import type { EntradaDoDiretorio } from '../../domain/entrada-do-diretorio.js';
import {
  validarEntradaDaAvaliacao,
  type AvaliacaoDoLocal,
  type EntradaDaAvaliacao,
  type PontuacaoDoLocal,
} from '../../domain/avaliacao-do-local.js';
import type {
  AvaliacaoGravada,
  DirectoryRepository,
  LocalDoDiretorio,
  PaginaDeAvaliacoes,
  RecorteDasAvaliacoes,
} from '../../ports/directory-repository.js';
import { registrarRotasDoDiretorio } from './directory-routes.js';

/** A montagem de URL de midia, pela porta. Nenhum caso deste arquivo tem imagem. */
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
};

const SEM_AVALIACAO: PontuacaoDoLocal = {
  media: null,
  quantidade: 0,
  histograma: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/**
 * O estado do dobre: uma avaliacao por (local, autor), como o indice unico do
 * banco impoe. **O dobre guarda num `Map` com a MESMA chave do indice**, e nao
 * numa lista: uma lista deixaria o dobre aceitar a segunda avaliacao da mesma
 * pessoa, e a isca (a) passaria aqui enquanto o banco a recusava -- o dobre
 * mentindo a favor do codigo.
 */
interface Cenario {
  /** Quem tem canal verificado. Fora daqui, `podeAvaliar` e falso. */
  readonly comCanalVerificado?: readonly UserId[];
  /** Avaliacoes ja gravadas, por autor. */
  readonly avaliacoes?: ReadonlyMap<UserId, AvaliacaoDoLocal>;
  /** Autores cuja conta esta DESABILITADA: o repositorio nao os lista. */
  readonly contasDesabilitadas?: readonly UserId[];
}

interface Espiao {
  readonly gravacoes: { autor: UserId; entrada: EntradaDaAvaliacao; criada: boolean }[];
}

function repositorio(cenario: Cenario, espiao: Espiao): DirectoryRepository {
  const avaliacoes = new Map<UserId, AvaliacaoDoLocal>(cenario.avaliacoes ?? []);
  const temCanal = (u: UserId): boolean => (cenario.comCanalVerificado ?? [QUEM_CHAMA]).includes(u);
  const habilitada = (u: UserId): boolean => !(cenario.contasDesabilitadas ?? []).includes(u);

  const pontuacao = (): PontuacaoDoLocal => {
    // A agregacao usa o MESMO recorte da listagem (conta habilitada), que e o
    // acordo que impede "128 avaliacoes" sobre uma lista de 126.
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
      });
    },

    listarAvaliacoes: (r: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined> => {
      if (r.slug !== SLUG) return Promise.resolve(undefined);
      // O FILTRO DE CONTA DESABILITADA, que no codigo de producao e
      // `conta_habilitada(uuid)` dentro de `AVALIACAO_VISIVEL`.
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
      // CHAVE (local, autor): sobrescreve. E o que o indice unico faz.
      avaliacoes.set(chamador, gravada);
      espiao.gravacoes.push({ autor: chamador, entrada, criada: jaTinha === undefined });
      return Promise.resolve({
        avaliacao: gravada,
        criada: jaTinha === undefined,
        pontuacao: pontuacao(),
      });
    },

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

/**
 * O teto entra DESLIGADO neste arquivo, e a escolha e deliberada.
 *
 * `directory-routes.test.ts` usa `criarContadorEmMemoria` porque o 429 e uma
 * das coisas que ele mede. Aqui o alvo sao as quatro regras de produto, e um
 * contador vivo as atrapalharia: a isca (d) faz sete escritas seguidas na mesma
 * conta e encostaria no teto de 20/h antes de terminar -- a isca passaria a
 * medir o teto em vez da faixa da nota.
 *
 * **O teto NAO fica sem prova por isso**: ele e declarado na rota
 * (`rateLimit`, que o tipo exige quando ha efeito) e o inventario da subida o
 * confere. O que falta e um caso que o exercite, e isso esta na lista do fim do
 * arquivo.
 */
function servidor(cenario: Cenario, espiao: Espiao): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorDesligado()),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDoDiretorio(app, {
    diretorio: repositorio(cenario, espiao),
    // Nenhum caso deste arquivo tem logo: `logoPublicKey` e nulo nas fixturas, e
    // `urlDaDerivada` devolve nulo sem chamar esta funcao.
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
  // ---------------------------------------------------------------- isca (a)
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

        // O QUE A ISCA MEDE, e e esta a linha que importa:
        assert.equal(segunda.corpo['created'], false, 'a segunda ATUALIZA, nao cria');

        // E a consequencia que a pessoa ve: UMA avaliacao, com a nota nova.
        const lista = await pedir(app, {
          method: 'GET',
          url: `/directory/entries/${SLUG}/reviews`,
        });
        assert.equal(lista.corpo['total'], 1, 'uma avaliacao, nao duas');
        const itens = lista.corpo['items'] as { rating: number }[];
        assert.equal(itens[0]?.rating, 3, 'a nota e a da ultima edicao');

        // A MEDIA acompanha, e nao e a media das duas.
        assert.equal(obj(segunda.corpo, 'rating')['count'], 1);
        assert.equal(obj(segunda.corpo, 'rating')['average'], 3);

        // E o `ref` NAO muda: links e denuncias existentes continuam valendo.
        assert.equal(obj(segunda.corpo, 'review')['ref'], obj(primeira.corpo, 'review')['ref']);

        // `edited_at` nasce nulo e passa a existir -- a tela escreve "editada".
        assert.equal(obj(primeira.corpo, 'review')['edited_at'], null);
        assert.notEqual(obj(segunda.corpo, 'review')['edited_at'], null);
      } finally {
        await app.close();
      }
    },
  );

  // ---------------------------------------------------------------- isca (b)
  void it('ISCA (b): quem NAO confirmou o e-mail nao consegue avaliar, e recebe 409', async () => {
    const espiao: Espiao = { gravacoes: [] };
    // `comCanalVerificado` vazio: ninguem tem e-mail confirmado.
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
      // A SAIDA vai na resposta: sem ela a tela diz "nao e possivel" sem caminho.
      assert.equal(r.corpo['next_action'], 'verify_email');
      // E NADA foi gravado. Um 409 que gravasse seria o pior dos dois mundos.
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
      // E a tela SABE que nao pode escrever, antes de montar o campo.
      assert.equal(r.corpo['can_review'], false);
      assert.equal(r.corpo['review_blocked_reason'], 'unverified_channel');
    } finally {
      await app.close();
    }
  });

  void it('ISCA (b3): sem conta nenhuma, a escrita e 401 e a leitura tambem', async () => {
    const espiao: Espiao = { gravacoes: [] };
    const app = servidor({}, espiao);
    try {
      // `semConta: true` -- sem ele a isca mandava o `Authorization` do cenario
      // padrao e media o caminho da conta VALIDA (200 de `putMyDirectoryEntryReview`),
      // que e o oposto do que o titulo afirma. O 401 e do contrato:
      // `api/openapi.yaml`, `putMyDirectoryEntryReview` -- "Visitante sem conta
      // nao escreve e nao e surpreendido: 401".
      const escrita = await pedir(app, {
        method: 'PUT',
        url: `/directory/entries/${SLUG}/reviews/me`,
        payload: { rating: 5 },
        semConta: true,
      });
      assert.equal(escrita.status, 401);
      assert.equal(espiao.gravacoes.length, 0);

      // "e a leitura tambem": o titulo afirma as DUAS e so a escrita estava
      // escrita. A leitura exige conta e NAO e publica -- `getDirectoryEntry`
      // declara `security: [bearerAuth]` em `api/openapi.yaml` (linha 3722) e a
      // propria descricao diz por que: ela devolve `phone_e164`, e
      // `src/tools/portao-contrato-publico.ts` reprova esse campo em qualquer
      // operacao alcancavel sem conta.
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

  // ---------------------------------------------------------------- isca (c)
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
      // Bruno desabilitou a conta: decisao do cliente de 17/10 -- conta
      // desabilitada "nao e mais encontrada em nenhuma pagina ou
      // funcionalidade".
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

        // E A CONTAGEM CONCORDA COM A LISTA. Este par de afirmacoes e o que
        // pega o defeito de recorte duplicado: "2 avaliacoes" sobre uma lista
        // de 1.
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

  // ---------------------------------------------------------------- isca (d)
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
      // E as da faixa passam, senao a isca aprovaria um codigo que recusa tudo.
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
    // No dominio, porque e onde a regra mora e porque o schema do contrato
    // (`type: integer`) e a PRIMEIRA recusa, nao a unica.
    assert.equal(validarEntradaDaAvaliacao({ rating: 4.5 }).entrada, undefined);
    assert.equal(validarEntradaDaAvaliacao({ rating: 4 }).entrada?.nota, 4);
  });

  // -------------------------------------------- o texto opcional, e o HTML
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
    // Uma unica representacao de "sem texto". Duas obrigariam cada tela a
    // conhecer as duas, e a primeira que esquecesse mostraria um paragrafo
    // vazio.
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

  // ------------------------------------------------------- 404 e nao 403
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

  // ------------------------------------------------- apagar, e a idempotencia
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

  // ------------------------------------------------------------- a denuncia
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
      // 202: o pedido foi recebido, nao que alguem ja olhou.
      assert.equal(r.status, 202);

      // E A AVALIACAO CONTINUA NO AR. Se a denuncia escondesse, uma denuncia
      // seria todo o custo de apagar a avaliacao de um concorrente.
      const lista = await pedir(app, {
          method: 'GET',
        url: `/directory/entries/${SLUG}/reviews`,
      });
      assert.equal(lista.corpo['total'], 1, 'a denuncia NAO esconde');
    } finally {
      await app.close();
    }
  });

  // ------------------------------------------------- o que NAO sai na resposta
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
        // O ADR-0010 item 6 proibe UUID interno em saida publica, e a
        // BICHUS-174 proibe expor vinculo entre duas pessoas: o `author_user_id`
        // de quem escreveu nao pode aparecer de forma nenhuma.
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
      // Zero se le como "pessimo" numa escala de 1 a 5, e um local que ninguem
      // avaliou nao e pessimo. A tela escreve "Ainda sem avaliacoes".
      assert.equal(obj(r.corpo, 'rating')['average'], null, 'NULA, nunca 0');
      assert.equal(obj(r.corpo, 'rating')['count'], 0);
      const histograma = obj(obj(r.corpo, 'rating'), 'histogram');
      assert.deepEqual(Object.keys(histograma).sort(), ['1', '2', '3', '4', '5']);
    } finally {
      await app.close();
    }
  });
});

/**
 * O QUE ESTE ARQUIVO NAO PROVA, e a lista e curta de proposito:
 *
 * 1. **Que `conta_habilitada(uuid)` de fato filtra no SQL.** Aqui o filtro e do
 *    dobre. A prova e de integracao, contra Postgres: inserir duas avaliacoes,
 *    marcar `users.deleted_at` de uma e conferir que a lista, a contagem E a
 *    media caem juntas. Pendente.
 * 2. **Que o `ON CONFLICT (professional_id, author_user_id)` impede a segunda
 *    linha sob concorrencia.** O dobre usa um `Map`, que serializa por
 *    construcao. A prova e de integracao, com duas transacoes simultaneas.
 * 3. **Que `pontuacao_do_local` arredonda a uma casa e devolve NULO sem
 *    avaliacao.** Isso foi exercitado em `BEGIN`/`ROLLBACK` contra o banco em
 *    18/10 (media nula com contagem zero, confirmado), mas nao por teste
 *    automatizado.
 * 4. **Que a remocao pelo administrador tira a linha da media.** A rota existe
 *    (`removeAdminDirectoryReview`) e nao tem isca escrita nesta rodada.
 */
