/**
 * As cinco rotas do achado avulso, sobre um Fastify de verdade.
 *
 * Sobe o servidor em vez de chamar o handler porque quatro das coisas que estas
 * rotas prometem só existem com o framework no caminho: o **429 do teto** (que é
 * um gancho `onRequest`/`preValidation`, e não um `if` do handler), o
 * `application/problem+json` do 404, a validação de corpo vinda do contrato, e a
 * serialização real da resposta — que é onde um `case_id` vazaria.
 *
 * ## As iscas deste arquivo, e como cada uma foi provada
 *
 * Cada linha foi desligada no código de produção, a mudança foi conferida no
 * disco (`git diff --stat` não vazio), a suíte rodou e reprovou, e o arquivo foi
 * restaurado. 22/09/2026, Node 22 no contêiner / Node 26.8.2 nesta máquina.
 * O número é o `fail` que o próprio `node --test` reporta.
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `deny_429` virando `log_and_alert` no teto da foto | 2 |
 * | `window: 'lifetime'` virando `'1h'` no teto da foto | 1 |
 * | `JANELA_VITALICIA_EM_SEGUNDOS` de 100 anos para 1 h | 1 |
 * | a segunda contagem do serviço (SEC-009) | 1 |
 * | o teto de 2 MB virando os 10 MB da foto de pet | 1 |
 * | a chave da foto voltando para o prefixo `pets/` | 1 |
 * | `naoEncontrado()` virando `semPermissao()` (403 no lugar de 404) | 1 |
 * | `case_id` acrescentado ao montador da resposta | 1 |
 * | o vínculo direto do critério 10 virando enfileiramento | 1 |
 * | `deny_429` virando `hold_for_review` no registro | **não compila** |
 * | `rateLimit` removido de qualquer rota com efeito | **não compila** |
 * | dimensão `found_report` declarada sem resolvedor | **não compila** |
 * | `app.post` direto, fora de `registrarRota` | o portão de registro reprova |
 *
 * As três linhas de "não compila" são a forma mais forte: o tipo de
 * `defineRoute` e o de `registrarRota` recusam o arranjo antes de a suíte
 * existir. E é por elas que a isca do teto precisa ser **automática** — o mesmo
 * caminho com `criarContadorDesligado()` deixa a quarta foto passar, e é isso
 * que prova que o caso mede LIMITE, e não a capacidade de contar até quatro.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
  inicioDaJanela,
  janelaEmSegundos,
} from '../../../../shared/http/rate-limit.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock, IdGenerator, JobQueue } from '../../../../shared/ports/index.js';
import type {
  AbsoluteUrl,
  CaseId,
  FoundReportId,
  UserId,
} from '../../../../shared/types/brands.js';
import { FoundReportService } from '../../application/found-report-service.js';
import type { AchadoGravado } from '../../domain/registro-de-achado.js';
import type { Sugestao } from '../../domain/cruzamento.js';
import type { FoundReportRepository } from '../../ports/found-report-repository.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../../../media/ports/object-storage.js';
import {
  registrarRotasDeAchado,
  rotaDeIntencaoDeFotoDoAchado,
  rotaDeRegistroDeAchado,
} from './found-report-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

const RELATOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
/** Sabe o UUID do achado do `RELATOR` e tenta mesmo assim. */
const INTRUSO = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;

const ACHADO_DO_RELATOR = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
/** Não é de ninguém. O 404 dele precisa ser indistinguível do 404 do achado alheio. */
const ACHADO_INEXISTENTE = '018f3a2b-0000-7000-8000-00000000f002' as FoundReportId;
const CASO_DO_SHARE_TOKEN = '018f3a2b-0000-7000-8000-00000000c001' as CaseId;

const AGORA = 1_800_000_000_000;
const SHARE_TOKEN = 'tok'.padEnd(24, 'x');

interface Cenario {
  readonly contador?: RateLimitStore;
  /**
   * **A isca da autorização.** Com `true`, o dobre do repositório para de olhar
   * o dono — é o equivalente exato de tirar `reporter_user_id = :dono` da
   * cláusula `WHERE` e conferir depois, que é o arranjo que o ADR-0021 elimina.
   */
  readonly autorizacaoDesligada?: boolean;
  readonly statusDoAchado?: AchadoGravado['status'];
  readonly fotosJaPedidas?: number;
}

const gravadas: Sugestao[] = [];
const enfileirados: { kind: string; payload: unknown }[] = [];

function achadoGravado(ajustes: Partial<AchadoGravado> = {}): AchadoGravado {
  return {
    id: ACHADO_DO_RELATOR,
    origin: 'stray_report',
    status: 'open',
    especie: 'dog',
    porte: 'M',
    cidade: 'São Paulo',
    bairro: 'Pinheiros',
    achadoEm: new Date(AGORA - 86_400_000),
    temFoto: false,
    observacao: 'Coleira azul, sem plaquinha.',
    criadoEm: new Date(AGORA),
    ...ajustes,
  };
}

/**
 * O repositório, com a autorização **dentro da consulta**.
 *
 * `buscarDoRelator` devolve `null` para qualquer chamador que não seja o dono, e
 * essa é a única coisa que o serviço recebe: ele não tem como saber se o achado
 * existe e é de outra pessoa, ou se não existe. Os dois casos chegam idênticos, e
 * é isso que faz o 404 ser estrutural em vez de lembrado.
 */
function repositorio(cenario: Cenario): FoundReportRepository {
  const meu = (achado: FoundReportId, dono: UserId): boolean =>
    achado === ACHADO_DO_RELATOR && (cenario.autorizacaoDesligada === true || dono === RELATOR);

  return {
    casoAbertoPorShareToken: (token) =>
      Promise.resolve(token === SHARE_TOKEN ? CASO_DO_SHARE_TOKEN : null),
    criar: (novo) =>
      Promise.resolve(
        achadoGravado({
          id: novo.id,
          especie: novo.especie,
          porte: novo.porte,
          cidade: novo.cidade,
          bairro: novo.bairro,
          achadoEm: new Date(Number(novo.achadoEm)),
          observacao: novo.observacao,
        }),
      ),
    buscarDoRelator: (achado, dono) =>
      Promise.resolve(
        meu(achado, dono) ? achadoGravado({ status: cenario.statusDoAchado ?? 'open' }) : null,
      ),
    listarDoRelator: (dono, limite) =>
      Promise.resolve({
        itens: dono === RELATOR ? [achadoGravado()].slice(0, limite) : [],
        proximoCursor: null,
      }),
    enriquecer: (achado, dono, mudanca) =>
      Promise.resolve(
        meu(achado, dono) && (cenario.statusDoAchado ?? 'open') !== 'closed'
          ? achadoGravado({ observacao: mudanca.observacao ?? null })
          : null,
      ),
    statusDoRelator: (achado, dono) =>
      Promise.resolve(meu(achado, dono) ? (cenario.statusDoAchado ?? 'open') : null),
    contarIntencoesDeFoto: () => Promise.resolve(cenario.fotosJaPedidas ?? 0),
    registrarIntencaoDeFoto: () => Promise.resolve(),
    paresParaCruzar: () => Promise.resolve([]),
    sugerirCorrespondencias: (sugestoes) => {
      gravadas.push(...sugestoes);
      return Promise.resolve(sugestoes.length);
    },
    // O achador sem conta tem bancada própria (`finder-found-report-routes.test.ts`).
    avisoPeloTokenDoAchador: () => Promise.reject(new Error('fora desta bancada')),
    enriquecerPeloTokenDoAchador: () => Promise.reject(new Error('fora desta bancada')),
    intencaoDeFotoDoAchadorPelaReferencia: () => Promise.reject(new Error('fora desta bancada')),
    contarIntencoesDeFotoPeloTokenDoAchador: () => Promise.reject(new Error('fora desta bancada')),
    registrarIntencaoDeFotoDoAchadorSemConta: () => Promise.reject(new Error('fora desta bancada')),
  };
}

const armazenamento: ObjectStorage = {
  createUploadIntent: (pedido): Promise<AutorizacaoDeEnvio> =>
    Promise.resolve({
      metodo: 'POST',
      url: 'https://objetos.bichu.test/privado' as AbsoluteUrl,
      campos: { key: pedido.chave },
      expiraEm: new Date(AGORA + 300_000),
      maxBytes: pedido.maxBytes,
    }),
  getSignedReadUrl: () => {
    throw new Error('Estas rotas não assinam leitura: a foto é vista na conversa mediada.');
  },
  head: () => Promise.resolve(null),
  get: () => {
    throw new Error('A rota HTTP não lê bytes de foto.');
  },
  put: () => Promise.resolve(),
  delete: () => Promise.resolve(),
};

function servidor(cenario: Cenario = {}): RegistradorDeRotas {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  let contadorDeIds = 0;
  const ids: IdGenerator = {
    uuidv7: () => `018f3a2b-0000-7000-8000-00000000f0${String(10 + (contadorDeIds += 1))}`,
    opaqueToken: () => {
      throw new Error('O achado avulso não cunha token: quem o registra tem conta.');
    },
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const fila: JobQueue = {
    enqueue: (kind, payload) => {
      enfileirados.push({ kind, payload });
      return Promise.resolve('job-1');
    },
    claim: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };

  registrarRotasDeAchado(app, {
    achados: new FoundReportService({
      repositorio: repositorio(cenario),
      armazenamento,
      fila,
      ids,
      clock,
    }),
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    idempotencia: {
      reservar: () => Promise.resolve(undefined),
      concluir: () => Promise.resolve(),
      liberar: () => Promise.resolve(),
    },
    // O contrato DE VERDADE: é ele que decide o schema do corpo, e uma cópia
    // aqui deixaria de acusar mudança na spec.
    contrato: carregarContrato('api/openapi.yaml'),
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
  opcoes: {
    metodo?: 'GET' | 'POST' | 'PATCH';
    url: string;
    como?: UserId;
    corpo?: unknown;
  },
): Promise<Resposta> {
  const base = {
    method: opcoes.metodo ?? 'GET',
    url: opcoes.url,
    headers: { authorization: `Bearer ${opcoes.como ?? RELATOR}` },
  };
  const resposta = await app.inject(
    opcoes.corpo === undefined ? base : { ...base, payload: opcoes.corpo as object },
  );
  return {
    status: resposta.statusCode,
    corpo: resposta.body === '' ? {} : (JSON.parse(resposta.body) as Record<string, unknown>),
    bruto: resposta.body,
  };
}

function tipoDe(corpo: Record<string, unknown>): string | undefined {
  const { type } = corpo;
  return typeof type === 'string' ? type.slice(type.lastIndexOf('/') + 1) : undefined;
}

const CORPO_MINIMO = {
  species: 'dog',
  size: 'M',
  found_at: new Date(AGORA - 86_400_000).toISOString(),
  area: { city: 'São Paulo', neighborhood: 'Pinheiros' },
};

void describe('as rotas existem e respondem o que o contrato declara', () => {
  void it('o registro responde 201 com os campos de `FoundReport`', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: CORPO_MINIMO,
    });
    await app.close();

    assert.equal(status, 201);
    assert.equal(corpo['origin'], 'stray_report');
    assert.equal(corpo['status'], 'open');
    assert.equal(corpo['area_label'], 'Pinheiros, São Paulo');
  });

  void it('critério 6: sem coordenada, o achado é registrado do mesmo jeito', async () => {
    const app = servidor();
    const { status } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO },
    });
    await app.close();
    assert.equal(status, 201);
  });

  void it('sem coordenada E sem área, recusa com `validation-failed` apontando `area`', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { species: 'dog', size: 'M', found_at: new Date(AGORA).toISOString() },
    });
    await app.close();

    assert.equal(status, 400);
    assert.equal(tipoDe(corpo), 'validation-failed');
  });

  void it('a lista do relator devolve `items` e `next_cursor`', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, { url: '/found-reports' });
    await app.close();

    assert.equal(status, 200);
    assert.deepEqual(Object.keys(corpo).sort(), ['items', 'next_cursor']);
  });

  void it('o detalhe do próprio achado responde 200', async () => {
    const app = servidor();
    const { status } = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    await app.close();
    assert.equal(status, 200);
  });

  void it('o enriquecimento do próprio achado responde 200', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      corpo: { message: 'Está com a vizinha do 42.' },
    });
    await app.close();

    assert.equal(status, 200);
    assert.equal(corpo['notes'], 'Está com a vizinha do 42.');
  });

  void it('enriquecer um achado já encerrado responde 410, e não 404', async () => {
    // O achado existe e é de quem está perguntando. Esconder isso faria a pessoa
    // achar que perdeu o próprio relato.
    const app = servidor({ statusDoAchado: 'closed' });
    const { status, corpo } = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      corpo: { message: 'oi' },
    });
    await app.close();

    assert.equal(status, 410);
    assert.equal(tipoDe(corpo), 'conversation-closed');
  });
});

void describe('ADR-0021: recurso de outra conta responde 404, nunca 403', () => {
  void it('o detalhe do achado alheio é 404', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      como: INTRUSO,
    });
    await app.close();

    assert.equal(status, 404);
    assert.equal(tipoDe(corpo), 'not-found');
    assert.notEqual(status, 403);
  });

  void it('o 404 do achado alheio é INDISTINGUÍVEL do 404 do inexistente', async () => {
    // Se os dois diferissem em qualquer coisa — status, `type`, `detail` —, a
    // rota viraria um oráculo: quem tivesse um UUID descobriria se ele é um
    // achado de verdade, e um achado carrega onde um animal foi visto.
    const app = servidor();
    const alheio = await pedir(app, {
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      como: INTRUSO,
    });
    const inexistente = await pedir(app, {
      url: `/found-reports/${ACHADO_INEXISTENTE}`,
      como: INTRUSO,
    });
    await app.close();

    assert.equal(alheio.status, inexistente.status);
    assert.equal(tipoDe(alheio.corpo), tipoDe(inexistente.corpo));
    assert.equal(alheio.corpo['detail'], inexistente.corpo['detail']);
  });

  void it('enriquecer o achado alheio é 404, e não 410 nem 403', async () => {
    const app = servidor({ statusDoAchado: 'closed' });
    const { status } = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      como: INTRUSO,
      corpo: { message: 'oi' },
    });
    await app.close();
    // O 410 é o ramo de quem JÁ provou ser dono. Para o intruso, o achado não
    // existe — inclusive o encerrado.
    assert.equal(status, 404);
  });

  void it('a foto de um achado alheio é 404', async () => {
    const app = servidor();
    const { status } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      como: INTRUSO,
      corpo: {
        found_report_id: ACHADO_DO_RELATOR,
        content_type: 'image/jpeg',
        byte_size: 500_000,
      },
    });
    await app.close();
    assert.equal(status, 404);
  });
});

void describe('ADR-0010: o que NÃO sai na resposta', () => {
  void it('nenhuma resposta carrega coordenada, `case_id`, `pet_id` nem `reporter_user_id`', async () => {
    // O achado pode ter se ligado a um caso pelo `share_token`. Devolver qual
    // contaria a quem registrou qual pet de qual tutor está sendo procurado —
    // antes de confirmação humana nenhuma, e para quem, no pior caso, é o falso
    // achador. O portão de contrato só procura o que SUMIU: propriedade a mais
    // passa por ele.
    const app = servidor();
    const criado = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, share_token: SHARE_TOKEN },
    });
    const detalhe = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    const lista = await pedir(app, { url: '/found-reports' });
    await app.close();

    const proibidos = [
      'case_id',
      'pet_id',
      'reporter_user_id',
      'lat',
      'lon',
      'found_point',
      'location',
      'distance_m',
      'share_token',
      'finder_token',
    ];
    for (const resposta of [criado, detalhe, lista]) {
      for (const proibido of proibidos) {
        assert.ok(
          !resposta.bruto.includes(proibido),
          `\`${proibido}\` apareceu no corpo serializado: ${resposta.bruto}`,
        );
      }
    }
  });

  void it('`area_label` é bairro e cidade, e o ponto nunca sai nem arredondado', async () => {
    const app = servidor();
    const { corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: {
        ...CORPO_MINIMO,
        location: { lat: -23.5614, lon: -46.656 },
      },
    });
    await app.close();

    assert.equal(corpo['area_label'], 'Pinheiros, São Paulo');
    // Ponto arredondado ainda é ponto: um arredondamento de 100 m no meio de um
    // bairro residencial aponta para o quarteirão.
    assert.ok(!/-23\.\d|-46\.\d|-23,|-46,/.test(JSON.stringify(corpo)));
  });
});

void describe('critério 10: o `share_token` vincula direto, e ainda assim só SUGERE', () => {
  void it('com `share_token`, o vínculo é gravado na hora e o cruzamento não é enfileirado', async () => {
    gravadas.length = 0;
    enfileirados.length = 0;
    const app = servidor();
    await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, share_token: SHARE_TOKEN },
    });
    await app.close();

    assert.equal(gravadas.length, 1);
    assert.equal(gravadas[0]?.linkOrigin, 'share_token');
    assert.equal(gravadas[0]?.score, 1);
    assert.equal(gravadas[0]?.caseId, CASO_DO_SHARE_TOKEN);
    assert.deepEqual(enfileirados, []);
  });

  void it('**o vínculo direto NÃO confirma nada**: a sugestão não carrega decisão', async () => {
    // Score 1,0 e a pessoa dizendo "vi este pet" é o caso mais forte que existe,
    // e é exatamente onde a regra precisa não ter exceção: quem chega pelo link
    // do caso é quem mais facilmente erraria o animal de boa-fé, e quem mais
    // facilmente mentiria de má-fé.
    gravadas.length = 0;
    const app = servidor();
    await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, share_token: SHARE_TOKEN },
    });
    await app.close();

    const chaves = Object.keys(gravadas[0] ?? {});
    for (const proibido of ['status', 'confirmado', 'confirmed', 'decidedBy', 'decided_at']) {
      assert.ok(!chaves.includes(proibido), `a sugestão passou a carregar \`${proibido}\``);
    }
  });

  void it('sem `share_token`, o cruzamento é ENFILEIRADO e não roda na requisição', async () => {
    // Seção 4.10: "é um job na fila, nunca síncrono na requisição".
    gravadas.length = 0;
    enfileirados.length = 0;
    const app = servidor();
    await pedir(app, { metodo: 'POST', url: '/found-reports', corpo: CORPO_MINIMO });
    await app.close();

    assert.equal(enfileirados.length, 1);
    assert.equal(enfileirados[0]?.kind, 'match.recompute');
    assert.deepEqual(gravadas, []);
  });

  void it('um `share_token` que não resolve não impede o registro', async () => {
    // A pessoa chegou por um push que envelheceu. O achado dela continua valendo
    // como achado avulso, e vale por 30 dias.
    enfileirados.length = 0;
    const app = servidor();
    const { status } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, share_token: 'token-que-nao-existe-aaaaaa' },
    });
    await app.close();

    assert.equal(status, 201);
    assert.equal(enfileirados.length, 1);
  });
});

void describe('SEC-009: o teto de três fotos por aviso VALE', () => {
  const corpoDaFoto = {
    found_report_id: ACHADO_DO_RELATOR,
    content_type: 'image/jpeg',
    byte_size: 500_000,
  };

  void it('as três primeiras passam e a quarta recebe 429', async () => {
    const app = servidor();
    const status: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      status.push(
        (await pedir(app, { metodo: 'POST', url: '/media/found-report-photo-intents', corpo: corpoDaFoto }))
          .status,
      );
    }
    await app.close();

    assert.deepEqual(status, [201, 201, 201, 429]);
  });

  void it('ISCA: com o contador desligado, a quarta passa — o caso acima mede LIMITE', async () => {
    // Sem esta metade, o caso acima poderia estar medindo qualquer coisa que
    // falha na quarta chamada.
    const app = servidor({ contador: criarContadorDesligado() });
    const status: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      status.push(
        (await pedir(app, { metodo: 'POST', url: '/media/found-report-photo-intents', corpo: corpoDaFoto }))
          .status,
      );
    }
    await app.close();

    assert.deepEqual(
      status,
      [201, 201, 201, 201],
      'com o teto desligado a quarta continuou sendo recusada: o caso anterior não estava ' +
        'medindo o teto, e sim outra coisa que também falha na quarta chamada',
    );
  });

  void it('o teto é por AVISO, e não por conta', async () => {
    // Um teto por conta faria o segundo animal da noite ficar sem foto nenhuma.
    const app = servidor();
    for (let i = 0; i < 3; i += 1) {
      await pedir(app, { metodo: 'POST', url: '/media/found-report-photo-intents', corpo: corpoDaFoto });
    }
    // Outro aviso, mesma conta. O dobre do repositório diz que só o
    // `ACHADO_DO_RELATOR` é do relator, então este responde 404 — e o que
    // importa é que ele NÃO responde 429, que é o que um teto por conta daria.
    const outro = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, found_report_id: ACHADO_INEXISTENTE },
    });
    await app.close();

    assert.notEqual(outro.status, 429);
  });

  void it('a janela `lifetime` não vira: o balde começa na época', () => {
    // Um teto vitalício que rolasse deixaria a quarta foto passar no dia da
    // virada, em silêncio. `inicioDaJanela` precisa devolver a época para
    // qualquer instante que este sistema vá ver.
    const janela = janelaEmSegundos('lifetime');
    assert.equal(inicioDaJanela(AGORA, janela).getTime(), 0);
    assert.equal(inicioDaJanela(Date.now(), janela).getTime(), 0);
    // E o contrário: uma janela de 1 h rola, e é por isso que a de cima precisa
    // ser vitalícia para valer.
    assert.notEqual(inicioDaJanela(AGORA, janelaEmSegundos('1h')).getTime(), 0);
  });

  void it('a segunda contagem, a do serviço, recusa mesmo com o teto da borda desligado', async () => {
    // Duas contagens independentes de propósito (ADR-0001): basta um job ou uma
    // rota interna nova para a borda ser contornada, e aí o limite vira
    // decoração. A mais restritiva vence.
    const app = servidor({ contador: criarContadorDesligado(), fotosJaPedidas: 3 });
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: corpoDaFoto,
    });
    await app.close();

    assert.equal(status, 429);
    assert.equal(tipoDe(corpo), 'rate-limited');
  });

  void it('SVG nunca passa, e ele é recusado na BORDA pelo enum do contrato', async () => {
    // **Divergência medida, e ela é anterior a esta história.** O contrato
    // declara `content_type` como enum fechado, então o schema do corpo recusa
    // SVG antes do handler e o status é 400, não 415 — e nem
    // `createFoundReportPhotoUploadIntent` nem `createPetPhotoUploadIntent`
    // declaram 400 nas respostas. As duas têm a mesma forma e o mesmo furo.
    //
    // O caso afirma o que o sistema FAZ, e não o que eu gostaria que ele
    // fizesse: uma asserção em 415 aqui ficaria vermelha sem nenhum defeito, e
    // uma que aceitasse os dois esconderia a divergência. Está na pauta de
    // refinamento como pergunta fechada.
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, content_type: 'image/svg+xml' },
    });
    await app.close();

    assert.equal(status, 400);
    assert.equal(tipoDe(corpo), 'validation-failed');
    // O que importa de verdade: ele NÃO passa. Documento com script servido do
    // domínio de mídia é o que o ADR-0007 fecha, e 400 fecha igual a 415.
    assert.notEqual(status, 201);
  });

  void it('acima de 2 MB responde 415, e o teto NÃO é o de 10 MB da foto de pet', async () => {
    // Este é o caminho em que o 415 declarado no contrato É alcançável: o schema
    // aceita até 10 MB (é o `UploadIntentInput` compartilhado com a foto de
    // pet), e quem recusa em 2 MB é o SEC-009, no serviço.
    const app = servidor();
    const doisMegasEUm = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, byte_size: 2 * 1024 * 1024 + 1 },
    });
    const dentroDoTeto = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, byte_size: 2 * 1024 * 1024 },
    });
    await app.close();

    assert.equal(doisMegasEUm.status, 415);
    assert.equal(dentroDoTeto.status, 201);
  });

  void it('a chave do objeto fica sob `found-reports/`, e não sob `pets/`', async () => {
    // Prefixos separados é o que permite a uma política de bucket e a uma
    // varredura de expurgo tratarem os dois de formas diferentes: a foto do
    // achador some 30 dias depois do encerramento, a do pet segue o cadastro.
    const app = servidor();
    const { corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: corpoDaFoto,
    });
    await app.close();

    const campos = corpo['fields'] as Record<string, string> | undefined;
    assert.ok(campos?.['key']?.startsWith(`found-reports/${ACHADO_DO_RELATOR}/original/`), campos?.['key']);
  });
});

void describe('o teto do registro é o do contrato, e ele RECUSA', () => {
  void it('a 11ª chamada em 24 h recebe 429', async () => {
    const app = servidor();
    const status: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      status.push(
        (await pedir(app, { metodo: 'POST', url: '/found-reports', corpo: CORPO_MINIMO })).status,
      );
    }
    await app.close();

    assert.deepEqual(status.slice(0, 10), Array.from({ length: 10 }, () => 201));
    assert.equal(status[10], 429);
  });

  void it('ISCA: com o contador desligado, a 11ª passa', async () => {
    const app = servidor({ contador: criarContadorDesligado() });
    const status: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      status.push(
        (await pedir(app, { metodo: 'POST', url: '/found-reports', corpo: CORPO_MINIMO })).status,
      );
    }
    await app.close();

    assert.equal(
      status[10],
      201,
      'com o teto desligado a 11ª continuou sendo recusada: o caso anterior não media o teto',
    );
  });

  void it('as duas entradas do contrato estão declaradas, e só uma delas recusa', () => {
    // `hold_for_review` NÃO vira 429 (`aplicacao-de-teto.ts`): ele conta e
    // alerta. Está aqui porque o contrato o declara, não porque a rota o quis.
    const recusam = rotaDeRegistroDeAchado.rateLimit.filter((e) => e.onExceed === 'deny_429');
    assert.equal(rotaDeRegistroDeAchado.rateLimit.length, 2);
    assert.equal(recusam.length, 1);
    assert.equal(recusam[0]?.limit, 10);
    assert.equal(recusam[0]?.window, '24h');
  });

  void it('o teto da foto é por `found_report`, vitalício, e recusa', () => {
    const entrada = rotaDeIntencaoDeFotoDoAchado.rateLimit[0];
    assert.deepEqual(entrada?.dimension, ['found_report']);
    assert.equal(entrada?.limit, 3);
    assert.equal(entrada?.window, 'lifetime');
    assert.equal(entrada?.onExceed, 'deny_429');
  });
});

void describe('ISCA: o dobre da autorização REPROVA quando desligado', () => {
  void it('com a autorização desligada, o intruso passa a ler o achado alheio', async () => {
    // Este caso não é uma garantia: ele é a prova de que os casos de 404 acima
    // medem a autorização, e não o fato de o dobre devolver `null` para tudo.
    const app = servidor({ autorizacaoDesligada: true });
    const { status } = await pedir(app, {
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      como: INTRUSO,
    });
    await app.close();

    assert.equal(
      status,
      200,
      'a isca não conseguiu desligar a autorização: os casos de 404 deste arquivo ' +
        'passaram a medir outra coisa',
    );
  });
});
