/**
 * `PATCH /v1/lost-cases/:caseId` **não reescreve `share_to_public_list`** quando o
 * corpo não o traz (BICHUS-278).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, CaseId, PetId, UserId } from '../../../../shared/types/brands.js';
import type { AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../../shared/ports/index.js';
import { LostCaseService } from '../../application/lost-case-service.js';
import type { AlcanceDoAlerta } from '../../ports/alcance-do-alerta.js';
import type { RegistroDeDisparos } from '../../ports/registro-de-disparos.js';
import type {
  AtualizacaoDoCaso,
  CasoGravado,
  LostCaseRepository,
} from '../../ports/lost-case-repository.js';
import { registrarRotasDeCasos, rotaDeAtualizacaoDoCaso } from './lost-case-routes.js';
import { paginaNenhumaPublicada } from '../../ports/disponibilidade-da-pagina.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DA_WEB = 'https://bichu.test' as AbsoluteUrl;

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const PET_DO_DONO = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const CASO = '018f3a2b-0000-7000-8000-0000000000ee' as CaseId;

/** O instante do relógio da bancada. */
const AGORA = 1_800_000_000_000;
const VISTO_EM = new Date(AGORA - 3_600_000).toISOString();

/** O caso como ele está gravado **antes** da edição: fora da lista pública. */
const CASO_FORA_DA_LISTA: CasoGravado = {
  id: CASO,
  petId: PET_DO_DONO,
  status: 'open',
  lastSeenAt: new Date(AGORA - 7_200_000),
  hasLocation: false,
  areaLabel: 'Vila Madalena',
  description: 'Fugiu pelo portão.',
  shareToken: 'tok-aaaaaaaaaaaaaaaa',
  shareToPublicList: false,
  openedAt: new Date(AGORA - 86_400_000),
  closedAt: null,
  reopenDeadline: null,
  closureOutcome: null,
  closureChannel: null,
  closureNote: null,
};

/** O que `atualizarOndeEQuando` recebeu. */
interface Espiao {
  readonly recebido: () => AtualizacaoDoCaso | undefined;
  readonly repositorio: LostCaseRepository;
}

function espiaoDoRepositorio(): Espiao {
  const naoUsado = (): never => {
    throw new Error('A edição não abre nem encerra caso: este método não devia ser chamado.');
  };

  let visto: AtualizacaoDoCaso | undefined;

  return {
    recebido: () => visto,
    repositorio: {
      estadoParaAbertura: () =>
        Promise.resolve({
          existeEhDoTutor: true,
          temFotoPronta: true,
          petJaTemCasoAberto: false,
          casosAbertosDaConta: 0,
          temCanalVerificado: true,
        }),
      estadoParaPrevia: naoUsado,
      abrir: naoUsado,
      buscarDoTutor: () => Promise.resolve(CASO_FORA_DA_LISTA),
      encerrar: () => Promise.resolve(null),
      reabrir: naoUsado,
      atualizarOndeEQuando: (entrada: AtualizacaoDoCaso): Promise<CasoGravado | null> => {
        visto = entrada;
        return Promise.resolve({
          ...CASO_FORA_DA_LISTA,
          shareToPublicList: entrada.shareToPublicList ?? CASO_FORA_DA_LISTA.shareToPublicList,
          description: entrada.description ?? CASO_FORA_DA_LISTA.description,
          lastSeenAt: new Date(Number(entrada.lastSeenAt)),
        });
      },
      decidirCandidato: naoUsado,
      candidatoDecididoDoTutor: naoUsado,
      candidatosDoCaso: () => Promise.resolve([]),
    },
  };
}

function disparosDeTeste(): RegistroDeDisparos {
  return {
    abrir: (entrada) =>
      Promise.resolve({
        id: entrada.id,
        caso: entrada.caso,
        estado: entrada.estado,
        destinatarios: null,
        raioEmMetros: entrada.raioEmMetros,
        tetoAtingido: false,
        pedidoEm: new Date(Number(entrada.pedidoEm)),
        enviadoEm: null,
      }),
    ultimoDoCaso: () => Promise.resolve(null),
    ultimoEnvioDoCaso: () => Promise.resolve(null),
    contextoDoCaso: () => Promise.resolve(null),
    concluir: () => Promise.resolve(),
  };
}

function filaDeTeste(): JobQueue {
  return {
    enqueue: () => Promise.resolve('018f3a2b-0000-7000-8000-00000000f11a'),
    claim: () => Promise.resolve([]),
    recuperarOrfaos: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };
}

function bancada(): { app: RegistradorDeRotas; recebido: () => AtualizacaoDoCaso | undefined } {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  const espiao = espiaoDoRepositorio();
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  const alcance: AlcanceDoAlerta = { alcancaveis: () => Promise.resolve(null) };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: () => {
      throw new Error('A edição não gera identificador.');
    },
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const trilha: AuditLog = { record: () => Promise.resolve() };

  registrarRotasDeCasos(app, {
    casos: new LostCaseService({
      repositorio: espiao.repositorio,
      ids,
      clock,
      trilha,
      alcance,
      disparos: disparosDeTeste(),
      fila: filaDeTeste(),
      transferencias: { cancelarPorCasoAberto: () => Promise.resolve() },
      conversaDaCorrespondencia: { aoConfirmarCorrespondencia: () => Promise.resolve() },
    }),
    autenticador: {
      autenticar: (token: string) => Promise.resolve({ userId: token as UserId }),
    },
    idempotencia: {
      reservar: () => Promise.resolve(undefined),
      concluir: () => Promise.resolve(),
      liberar: () => Promise.resolve(),
    },
    contrato: carregarContrato('api/openapi.yaml'),
    clock,
    baseDaWeb: BASE_DA_WEB,
    paginas: paginaNenhumaPublicada,
  });

  return { app, recebido: espiao.recebido };
}

async function editar(
  app: RegistradorDeRotas,
  corpo: Record<string, unknown>,
): Promise<{ status: number }> {
  const resposta = await app.inject({
    method: 'PATCH',
    url: `/lost-cases/${CASO}`,
    headers: { authorization: `Bearer ${DONO}` },
    payload: corpo,
  });
  return { status: resposta.statusCode };
}

void describe('a edição do caso não republica o que o tutor tirou da lista pública', () => {
  void it('corpo com UM campo só: `share_to_public_list` chega ao repositório como `undefined`', async () => {
    const { app, recebido } = bancada();
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    assert.equal(
      entrada.shareToPublicList,
      undefined,
      'campo que o corpo não trouxe não pode chegar ao repositório com valor',
    );
    assert.notEqual(entrada.shareToPublicList, true);
    assert.equal(entrada.description, undefined);
  });

  void it('`share_to_public_list: false` explícito CHEGA como `false` — a correção não ignora o campo', async () => {
    const { app, recebido } = bancada();
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
      share_to_public_list: false,
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    assert.equal(entrada.shareToPublicList, false);
    assert.notEqual(entrada.shareToPublicList, undefined);
  });

  void it('`share_to_public_list: true` explícito também chega, e não é confundido com o padrão', async () => {
    const { app, recebido } = bancada();
    const { status } = await editar(app, {
      last_seen_at: VISTO_EM,
      last_seen_area: { city: 'São Paulo' },
      share_to_public_list: true,
    });
    await app.close();

    assert.equal(status, 200);

    const entrada = recebido();
    assert.ok(entrada !== undefined, 'o repositório precisa ter sido chamado');
    assert.equal(entrada.shareToPublicList, true);
  });

  void it('a rota desta bancada é a `updateLostCase` do contrato', () => {
    assert.equal(rotaDeAtualizacaoDoCaso.operationId, 'updateLostCase');
    assert.equal(rotaDeAtualizacaoDoCaso.method, 'patch');
  });
});
