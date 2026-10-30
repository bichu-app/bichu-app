/** As cinco rotas do achado avulso, sobre um Fastify de verdade. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
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
import {
  FoundReportService,
  TETO_DE_BYTES_DA_FOTO_DO_ACHADO,
} from '../../application/found-report-service.js';
import type { AchadoGravado, PetCorrespondente } from '../../domain/registro-de-achado.js';
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
/** O TUTOR DO PET a que o aviso se refere (BICHUS-35). */
const TUTOR = '018f3a2b-0000-7000-8000-0000000000cc' as UserId;

const ACHADO_DO_RELATOR = '018f3a2b-0000-7000-8000-00000000f001' as FoundReportId;
/** Não é de ninguém. O 404 dele precisa ser indistinguível do 404 do achado alheio. */
const ACHADO_INEXISTENTE = '018f3a2b-0000-7000-8000-00000000f002' as FoundReportId;
const CASO_DO_SHARE_TOKEN = '018f3a2b-0000-7000-8000-00000000c001' as CaseId;

const AGORA = 1_800_000_000_000;
const SHARE_TOKEN = 'tok'.padEnd(24, 'x');

/** A base de MÍDIA, de onde sai `matched_pet.photo_url`. */
const BASE_DE_MIDIA = 'https://midia.bichu.test' as AbsoluteUrl;
const BASE_DA_WEB = 'https://www.bichu.test' as AbsoluteUrl;

/** `pet_photos.card_key` como o worker a grava: 128 bits aleatórios no caminho. */
const CHAVE_DA_CAPA = 'pets/9f2c/card/4a7b1e0d9c3f.webp';
const NOME_DO_PET = 'Aurora';

interface Cenario {
  readonly contador?: RateLimitStore;
  /**
   * **A isca da autorização.** Com `true`, o dobre do repositório para de olhar o
   * dono — é o equivalente exato de tirar `reporter_user_id = :dono` da cláusula
   * `WHERE` e conferir depois, que é o arranjo que o ADR-0021 elimina.
   */
  readonly autorizacaoDesligada?: boolean;
  /**
   * **A isca da AMPLIAÇÃO (BICHUS-35).** Com `true`, `avisoParaAnexarFoto` volta a
   * aceitar só o relator — é o equivalente exato de não ter acrescentado `OR
   * pets.owner_user_id = :chamador` ao `WHERE`.
   */
  readonly ampliacaoDesligada?: boolean;
  readonly statusDoAchado?: AchadoGravado['status'];
  readonly fotosJaPedidas?: number;
  /** O pet JA identificado, quando o cenario tem um. */
  readonly petCorrespondente?: PetCorrespondente | null;
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
    petCorrespondente: null,
    ...ajustes,
  };
}

/** O repositório, com a autorização **dentro da consulta**. */
function repositorio(cenario: Cenario): FoundReportRepository {
  const meu = (achado: FoundReportId, dono: UserId): boolean =>
    achado === ACHADO_DO_RELATOR && (cenario.autorizacaoDesligada === true || dono === RELATOR);

  return {
    casoAbertoPorShareToken: (token) =>
      Promise.resolve(token === SHARE_TOKEN ? CASO_DO_SHARE_TOKEN : null),
    criar: (novo) =>
      Promise.resolve(
        achadoGravado({
          petCorrespondente: cenario.petCorrespondente ?? null,
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
        meu(achado, dono)
          ? achadoGravado({
              status: cenario.statusDoAchado ?? 'open',
              petCorrespondente: cenario.petCorrespondente ?? null,
            })
          : null,
      ),
    listarDoRelator: (dono, limite) =>
      Promise.resolve({
        itens:
          dono === RELATOR
            ? [achadoGravado({ petCorrespondente: cenario.petCorrespondente ?? null })].slice(
                0,
                limite,
              )
            : [],
        proximoCursor: null,
      }),
    enriquecer: (achado, dono, mudanca) =>
      Promise.resolve(
        meu(achado, dono) && (cenario.statusDoAchado ?? 'open') !== 'closed'
          ? achadoGravado({
              observacao: mudanca.observacao ?? null,
              petCorrespondente: cenario.petCorrespondente ?? null,
            })
          : null,
      ),
    statusDoRelator: (achado, dono) =>
      Promise.resolve(meu(achado, dono) ? (cenario.statusDoAchado ?? 'open') : null),
    avisoParaAnexarFoto: (achado, chamador) =>
      Promise.resolve(
        meu(achado, chamador) ||
          (cenario.ampliacaoDesligada !== true &&
            achado === ACHADO_DO_RELATOR &&
            chamador === TUTOR)
          ? achadoGravado({ status: cenario.statusDoAchado ?? 'open' })
          : null,
      ),
    contarIntencoesDeFoto: () => Promise.resolve(cenario.fotosJaPedidas ?? 0),
    registrarIntencaoDeFoto: () => Promise.resolve(),
    paresParaCruzar: () => Promise.resolve([]),
    sugerirCorrespondencias: (sugestoes) => {
      gravadas.push(...sugestoes);
      return Promise.resolve(sugestoes.length);
    },
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
    recuperarOrfaos: () => Promise.resolve([]),
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
    baseDeMidia: BASE_DE_MIDIA,
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

/** O `maxLength` que o contrato declara, lido dele e não escrito aqui. */
function tetoNoContrato(schema: string, campo: string): number {
  const spec = carregarContrato('api/openapi.yaml').spec as {
    components?: { schemas?: Record<string, { properties?: Record<string, { maxLength?: unknown }> }> };
  };
  const teto = spec.components?.schemas?.[schema]?.properties?.[campo]?.maxLength;
  assert.equal(typeof teto, 'number', `o contrato não declara \`maxLength\` em ${schema}.${campo}`);
  return teto as number;
}

/** `StrayFoundReportInput.notes.maxLength`, lido do contrato e não escrito aqui. */
function tetoDoRecadoNoContrato(): number {
  return tetoNoContrato('StrayFoundReportInput', 'notes');
}

/**
 * O teto de `found_reports.notes` lido do **CHECK da migração**, e não escrito
 * aqui.
 */
function tetoDaColunaNaMigracao(): number {
  const sql = readFileSync('migrations/20260917000007_tags-e-avisos-do-achador.sql', 'utf8');
  const achado = /CHECK \(notes IS NULL OR char_length\(notes\) <= (\d+)\)/.exec(sql);
  assert.ok(achado, '`found_reports_notes_tamanho` não está mais escrito como esta leitura espera');
  return Number(achado[1]);
}

void describe('as rotas existem e respondem o que o contrato declara', () => {
  void it('`notes` no teto do contrato passa, e um caractere a mais é 400 antes do banco', async () => {
    const teto = tetoDoRecadoNoContrato();
    const app = servidor();
    const noTeto = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, notes: 'a'.repeat(teto) },
    });
    const acima = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, notes: 'a'.repeat(teto + 1) },
    });
    await app.close();
    assert.equal(teto, 500, 'o teto do contrato deixou de ser o do banco (500)');
    assert.equal(noTeto.status, 201);
    assert.equal(acima.status, 400);
    assert.equal(tipoDe(acima.corpo), 'validation-failed');
  });

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
    assert.equal(status, 404);
  });

  void it('a foto de um achado alheio é 404 — e CONTINUA 404 depois da ampliação', async () => {
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

/** BICHUS-35: A AMPLIAÇÃO DA AUTORIZAÇÃO DA INTENÇÃO DE FOTO. */
void describe('BICHUS-35: o tutor do pet obtém intenção de foto, e o terceiro não', () => {
  const corpoDaIntencao = {
    found_report_id: ACHADO_DO_RELATOR,
    content_type: 'image/jpeg',
    byte_size: 500_000,
  };

  const pedirComo = async (cenario: Cenario, como: UserId): Promise<number> => {
    const app = servidor(cenario);
    const { status } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      como,
      corpo: corpoDaIntencao,
    });
    await app.close();
    return status;
  };

  void it('o TUTOR do pet recebe 201 — a conversa mediada é simétrica', async () => {
    assert.equal(await pedirComo({}, TUTOR), 201);
  });

  void it('um TERCEIRO recebe 404, e não 403 (ADR-0021)', async () => {
    assert.equal(await pedirComo({}, INTRUSO), 404);
  });

  void it('CONTROLE POSITIVO: o RELATOR continua recebendo 201 nos dois estados', async () => {
    assert.equal(await pedirComo({}, RELATOR), 201);
    assert.equal(await pedirComo({ ampliacaoDesligada: true }, RELATOR), 201);
  });

  void it('CONTROLE NEGATIVO: o achado INEXISTENTE é 404 nos dois estados', async () => {
    for (const cenario of [{}, { ampliacaoDesligada: true }]) {
      const app = servidor(cenario);
      const { status } = await pedir(app, {
        metodo: 'POST',
        url: '/media/found-report-photo-intents',
        como: TUTOR,
        corpo: { ...corpoDaIntencao, found_report_id: ACHADO_INEXISTENTE },
      });
      await app.close();
      assert.equal(status, 404);
    }
  });

  void it('ISCA: com a ampliação desligada, o tutor volta a receber 404', async () => {
    assert.equal(await pedirComo({ ampliacaoDesligada: true }, TUTOR), 404);
    assert.equal(await pedirComo({ ampliacaoDesligada: true }, INTRUSO), 404);
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
    const app = servidor();
    for (let i = 0; i < 3; i += 1) {
      await pedir(app, { metodo: 'POST', url: '/media/found-report-photo-intents', corpo: corpoDaFoto });
    }
    const outro = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, found_report_id: ACHADO_INEXISTENTE },
    });
    await app.close();

    assert.notEqual(outro.status, 429);
  });

  void it('a janela `lifetime` não vira: o balde começa na época', () => {
    const janela = janelaEmSegundos('lifetime');
    assert.equal(inicioDaJanela(AGORA, janela).getTime(), 0);
    assert.equal(inicioDaJanela(Date.now(), janela).getTime(), 0);
    assert.notEqual(inicioDaJanela(AGORA, janelaEmSegundos('1h')).getTime(), 0);
  });

  void it('a segunda contagem, a do serviço, recusa mesmo com o teto da borda desligado', async () => {
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
    const app = servidor();
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, content_type: 'image/svg+xml' },
    });
    await app.close();

    assert.equal(status, 400);
    assert.equal(tipoDe(corpo), 'validation-failed');
    assert.notEqual(status, 201);
  });

  void it('acima do teto ÚNICO de envio não passa, e ele é recusado na BORDA pelo schema', async () => {
    const app = servidor();
    const acimaDoTeto = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, byte_size: TETO_DE_BYTES_DA_FOTO_DO_ACHADO + 1 },
    });
    const dentroDoTeto = await pedir(app, {
      metodo: 'POST',
      url: '/media/found-report-photo-intents',
      corpo: { ...corpoDaFoto, byte_size: TETO_DE_BYTES_DA_FOTO_DO_ACHADO },
    });
    await app.close();

    assert.notEqual(acimaDoTeto.status, 201);
    assert.equal(acimaDoTeto.status, 400);
    assert.equal(tipoDe(acimaDoTeto.corpo), 'validation-failed');
    assert.equal(dentroDoTeto.status, 201);
  });

  void it('a chave do objeto fica sob `found-reports/`, e não sob `pets/`', async () => {
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

/** O RECADO DO ENRIQUECIMENTO, nas duas bordas. */
void describe('o recado do enriquecimento casa com o teto da coluna, nas duas bordas', () => {
  void it('500 exatos é ACEITO e chega gravado na resposta', async () => {
    const teto = tetoDaColunaNaMigracao();
    const app = servidor();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      corpo: { message: 'a'.repeat(teto) },
    });
    await app.close();

    assert.equal(teto, 500, 'o CHECK da coluna deixou de ser 500');
    assert.equal(
      tetoNoContrato('FoundReportEnrichment', 'message'),
      teto,
      'o contrato voltou a prometer mais do que a coluna aceita: é o defeito de novo',
    );
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['notes'], 'a'.repeat(teto));
  });

  void it('501 é RECUSADO pela validação, com o limite na mensagem, e não chega ao banco', async () => {
    const teto = tetoDaColunaNaMigracao();
    const app = servidor();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      corpo: { message: 'a'.repeat(teto + 1) },
    });
    await app.close();

    assert.equal(
      resposta.status,
      400,
      'o caractere a mais que a COLUNA aceita passou pela validação: ele vai estourar no banco como erro de servidor',
    );
    assert.equal(tipoDe(resposta.corpo), 'validation-failed');

    const erros = resposta.corpo['errors'] as { field: string; code: string; message: string }[];
    const doRecado = erros.find((e) => e.field === 'message');
    assert.ok(doRecado, `o 400 não nomeia o campo \`message\`: ${resposta.bruto}`);
    assert.equal(doRecado.code, 'maxLength');
    assert.match(
      doRecado.message,
      new RegExp(String(teto)),
      `a recusa não diz o limite de ${String(teto)}: ${doRecado.message}`,
    );
  });

  void it('o 501 é recusado ANTES do repositório: nada foi gravado', async () => {
    const teto = tetoDaColunaNaMigracao();
    const app = servidor();
    const resposta = await pedir(app, {
      metodo: 'PATCH',
      url: `/found-reports/${ACHADO_DO_RELATOR}`,
      corpo: { message: 'a'.repeat(teto + 1) },
    });
    await app.close();

    assert.notEqual(resposta.corpo['notes'], 'a'.repeat(teto + 1));
    assert.equal(resposta.status, 400);
  });
});

/** O TETO DE `ref_data_version`, ancorado no `CHECK` DA MIGRAÇÃO. */
void describe('o teto de `ref_data_version` é o da coluna, e a recusa diz o limite', () => {
  /** O `BETWEEN 1 AND 40` de `found_reports_ref_data_version_tamanho`, lido do disco. */
  function tetoDaColuna(): number {
    const pasta = resolve(process.cwd(), 'migrations');
    const achados: number[] = [];
    for (const arquivo of readdirSync(pasta).filter((n) => n.endsWith('.sql'))) {
      const sql = readFileSync(resolve(pasta, arquivo), 'utf8');
      const m = /char_length\(ref_data_version\)\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/.exec(sql);
      if (m) achados.push(Number(m[2]));
    }
    assert.equal(
      achados.length,
      1,
      'não achei exatamente um `CHECK ... char_length(ref_data_version) BETWEEN x AND y` ' +
        'em `migrations/`. Sem ele esta isca não sabe qual é o teto da coluna, e aprovar ' +
        'sem saber é o defeito que ela existe para impedir',
    );
    return achados[0]!;
  }

  void it('o teto da coluna é 40, e o contrato declara o MESMO número', () => {
    const spec = carregarContrato('api/openapi.yaml').spec as {
      components?: {
        schemas?: Record<string, { properties?: Record<string, { maxLength?: unknown }> }>;
      };
    };
    const noContrato =
      spec.components?.schemas?.['StrayFoundReportInput']?.properties?.['ref_data_version']
        ?.maxLength;
    assert.equal(tetoDaColuna(), 40);
    assert.equal(
      noContrato,
      tetoDaColuna(),
      'o `maxLength` de `StrayFoundReportInput.ref_data_version` divergiu de ' +
        '`found_reports_ref_data_version_tamanho`. Enquanto os dois não são o mesmo número, ' +
        'existe um texto que a borda aceita e o banco recusa — e isso sai como erro de ' +
        'servidor, não como recusa explicada',
    );
  });

  void it('no teto da coluna o registro passa, e um caractere acima é 400 com o limite na mensagem', async () => {
    const teto = tetoDaColuna();
    const app = servidor();
    const noTeto = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, ref_data_version: 'v'.repeat(teto) },
    });
    const acima = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, ref_data_version: 'v'.repeat(teto + 1) },
    });
    await app.close();

    assert.equal(noTeto.status, 201, `o registro recusou ${String(teto)} caracteres, que é o que a coluna ACEITA`);
    assert.equal(
      acima.status,
      400,
      `${String(teto + 1)} caracteres não foram recusados na borda. Eles chegam ao ` +
        '`INSERT` e o `CHECK` os derruba como erro de servidor, que não diz nada a quem chamou',
    );
    assert.equal(tipoDe(acima.corpo), 'validation-failed');
    assert.match(
      acima.bruto,
      new RegExp(String(teto)),
      'a recusa não diz qual é o limite. Sem o número, quem chamou não sabe para quanto ' +
        'encurtar e tenta de novo às cegas',
    );
  });
});

const PET_IDENTIFICADO = { nome: NOME_DO_PET, chaveDaFoto: CHAVE_DA_CAPA };

void describe('emenda 7: com o pet JÁ identificado, a foto e o nome SAEM', () => {
  void it('`matched_pet` traz o nome e a capa montada sobre a base de MÍDIA', async () => {
    const app = servidor({ petCorrespondente: PET_IDENTIFICADO });
    const { status, corpo } = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: { ...CORPO_MINIMO, share_token: SHARE_TOKEN },
    });
    await app.close();

    assert.equal(status, 201);
    const pet = corpo['matched_pet'] as Record<string, unknown> | null;
    assert.ok(
      pet !== null && pet !== undefined,
      'REPROVA: `matched_pet` não veio no 201 do registro. É a queixa do ' +
        'cliente palavra por palavra — "não tem foto do pet" — e a autorização ' +
        'de 28/10/2026 foi "pode colocar a foto e o nome do pet". Este corpo é ' +
        'a PRIMEIRA resposta que a tela do achado lê.',
    );
    assert.equal(
      pet['display_name'],
      NOME_DO_PET,
      `REPROVA: o nome do pet não saiu. Veio "${String(pet['display_name'])}".`,
    );
    assert.equal(
      pet['photo_url'],
      `${BASE_DE_MIDIA}/${CHAVE_DA_CAPA}`,
      'REPROVA: a capa não é o endereço da chave sobre a base de MÍDIA. Veio ' +
        `"${String(pet['photo_url'])}".`,
    );
  });

  void it('a base é a de MÍDIA, e não a da web — elas são hosts diferentes por decisão', async () => {
    const app = servidor({ petCorrespondente: PET_IDENTIFICADO });
    const { corpo, bruto } = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    await app.close();

    const pet = corpo['matched_pet'] as Record<string, unknown>;
    assert.ok(
      String(pet['photo_url']).startsWith(BASE_DE_MIDIA),
      `REPROVA: a capa não sai sobre a base de MÍDIA. Veio "${String(pet['photo_url'])}".`,
    );
    assert.ok(
      !bruto.includes(BASE_DA_WEB),
      'REPROVA: o corpo carrega a base da WEB. A capa do pet mora no host de ' +
        'mídia, e as duas bases são diferentes de propósito — apontar a tela ' +
        `para o host errado pede uma derivada que não existe lá. Corpo: ${bruto}`,
    );
  });

  void it('sem capa pronta, o nome sai e `photo_url` é nulo', async () => {
    const app = servidor({ petCorrespondente: { nome: NOME_DO_PET, chaveDaFoto: null } });
    const { corpo } = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    await app.close();

    const pet = corpo['matched_pet'] as Record<string, unknown>;
    assert.equal(pet['display_name'], NOME_DO_PET, 'REPROVA: o nome sumiu junto com a foto.');
    assert.equal(
      pet['photo_url'],
      null,
      'REPROVA: sem capa pronta a rota devolveu um endereço. Montar o endereço ' +
        'de um objeto que o worker não gravou é prometer uma foto que vai dar ' +
        `404. Veio "${String(pet['photo_url'])}".`,
    );
  });

  void it('o detalhe e a LISTA trazem o pet, e não só o 201 do registro', async () => {
    const app = servidor({ petCorrespondente: PET_IDENTIFICADO });
    const lista = await pedir(app, { url: '/found-reports' });
    await app.close();

    const itens = lista.corpo['items'] as Record<string, unknown>[];
    assert.ok(itens.length > 0, 'REPROVA NA ÂNCORA: a lista veio vazia.');
    const pet = itens[0]?.['matched_pet'] as Record<string, unknown> | null;
    assert.ok(
      pet !== null && pet !== undefined,
      'REPROVA: a LISTA de achados não traz o pet. É a tela "Meus achados", e ' +
        'ela é metade da queixa do cliente.',
    );
    assert.equal(itens[0]?.['matched_pet'] === null, false);
    assert.equal(pet['display_name'], NOME_DO_PET);
  });
});

void describe('emenda 7: no achado AVULSO, a foto e o nome NÃO saem', () => {
  void it('`matched_pet` é nulo, e nem o nome nem a chave da capa aparecem no corpo', async () => {
    const app = servidor();
    const criado = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: CORPO_MINIMO,
    });
    const detalhe = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    const lista = await pedir(app, { url: '/found-reports' });
    await app.close();

    for (const [onde, resposta] of [
      ['o 201 do registro', criado],
      ['o detalhe', detalhe],
      ['a lista', lista],
    ] as const) {
      assert.equal(
        resposta.status,
        onde === 'o 201 do registro' ? 201 : 200,
        `REPROVA NA ÂNCORA: ${onde} não respondeu. Ausência medida sobre ` +
          'resposta que não veio não significa nada.',
      );
      assert.ok(
        resposta.bruto.includes('stray_report'),
        `REPROVA NA ÂNCORA: ${onde} não traz o achado avulso. Conserte a ` +
          `âncora antes de ler o resto. Corpo: ${resposta.bruto}`,
      );

      assert.ok(
        !resposta.bruto.includes(NOME_DO_PET),
        `REPROVA: ${onde} entregou o NOME do pet num achado avulso. O vínculo ` +
          'aqui só poderia vir de `match_candidates`, com ' +
          '`link_origin = "attribute_match"` — um PALPITE da máquina, que ' +
          'sugere e não confirma (BICHUS-35, critério 7). O cliente mediu o ' +
          'golpe do falso achador em 20/10/2026: nome e foto de uma ' +
          'correspondência palpitada são exatamente o que falta ao golpista ' +
          `para "achei seu pet" soar verdadeiro. Corpo: ${resposta.bruto}`,
      );
      assert.ok(
        !resposta.bruto.includes(CHAVE_DA_CAPA),
        `REPROVA: ${onde} entregou a chave da CAPA do pet num achado avulso. ` +
          `Mesma razão do nome, e a foto é o insumo mais caro. Corpo: ${resposta.bruto}`,
      );
      assert.ok(
        !resposta.bruto.includes(BASE_DE_MIDIA),
        `REPROVA: ${onde} carrega um endereço de mídia do pet num achado ` +
          `avulso. Corpo: ${resposta.bruto}`,
      );
    }

    assert.equal(
      criado.corpo['matched_pet'],
      null,
      'REPROVA: `matched_pet` não é `null` no achado avulso. O contrato o ' +
        'declara anulável e o nulo aqui NÃO é "ainda não temos": ele é a ' +
        'decisão.',
    );
    assert.equal(detalhe.corpo['matched_pet'], null);
  });

  void it('ISCA NO SENTIDO CONTRÁRIO: com o pet no cenário, o MESMO corpo passa a trazê-los', async () => {
    const app = servidor({ petCorrespondente: PET_IDENTIFICADO });
    const criado = await pedir(app, {
      metodo: 'POST',
      url: '/found-reports',
      corpo: CORPO_MINIMO,
    });
    const detalhe = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    const lista = await pedir(app, { url: '/found-reports' });
    await app.close();

    for (const [onde, resposta] of [
      ['o 201 do registro', criado],
      ['o detalhe', detalhe],
      ['a lista', lista],
    ] as const) {
      assert.ok(
        resposta.bruto.includes(NOME_DO_PET),
        `REPROVA: ${onde} NÃO traz o nome do pet nem quando o pet está ` +
          'identificado. Enquanto este caso não passar, o caso de ausência ' +
          'acima não prova a decisão de privacidade — ele só prova que esta ' +
          `rota não sabe projetar o pet. Corpo: ${resposta.bruto}`,
      );
      assert.ok(
        resposta.bruto.includes(CHAVE_DA_CAPA),
        `REPROVA: ${onde} NÃO traz a capa do pet nem quando ele está ` +
          `identificado. Mesma razão. Corpo: ${resposta.bruto}`,
      );
    }
  });

  void it('o nulo do pet não arrasta os outros campos do achado', async () => {
    const app = servidor();
    const { status, corpo } = await pedir(app, { url: `/found-reports/${ACHADO_DO_RELATOR}` });
    await app.close();

    assert.equal(status, 200);
    assert.equal(corpo['origin'], 'stray_report');
    assert.equal(corpo['status'], 'open');
    assert.equal(corpo['area_label'], 'Pinheiros, São Paulo');
    assert.equal(corpo['photo_url'], null, 'REPROVA: o `photo_url` do ACHADOR mudou de valor.');
  });
});
