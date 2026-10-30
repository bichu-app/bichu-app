/**
 * `POST /v1/lost-cases/:caseId/reopen` (`reopenLostCase`) — a ROTA que o contrato
 * prometia e que não existia.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { AbsoluteUrl, CaseId, PetId, UserId } from '../../../../shared/types/brands.js';
import type { AuditEvent, AuditLog } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobQueue } from '../../../../shared/ports/index.js';
import { LostCaseService } from '../../application/lost-case-service.js';
import type { AlcanceDoAlerta } from '../../ports/alcance-do-alerta.js';
import type { RegistroDeDisparos } from '../../ports/registro-de-disparos.js';
import type { CasoGravado, LostCaseRepository } from '../../ports/lost-case-repository.js';
import { registrarRotasDeCasos, rotaDeReabertura } from './lost-case-routes.js';
import { paginaNenhumaPublicada } from '../../ports/disponibilidade-da-pagina.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const BASE_DA_WEB = 'https://bichu.test' as AbsoluteUrl;

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const CASO = '018f3a2b-0000-7000-8000-0000000000ee' as CaseId;

/** O relógio da bancada. Um instante fixo: a janela é medida contra ele. */
const AGORA = 1_800_000_000_000;
const UM_DIA = 24 * 3_600_000;
const SETE_DIAS = 7 * UM_DIA;

/** O caso ENCERRADO, com o prazo de reabertura que `encerrar` grava. */
function casoEncerrado(prazoDaqui: number): CasoGravado {
  return {
    id: CASO,
    petId: PET,
    status: 'closed_reunited',
    lastSeenAt: new Date(AGORA - 3 * UM_DIA),
    hasLocation: false,
    areaLabel: 'Pinheiros, São Paulo',
    description: 'Fugiu pelo portão.',
    shareToken: 'tok-aaaaaaaaaaaaaaaa',
    shareToPublicList: true,
    openedAt: new Date(AGORA - 4 * UM_DIA),
    closedAt: new Date(AGORA + prazoDaqui - SETE_DIAS),
    reopenDeadline: new Date(AGORA + prazoDaqui),
    closureOutcome: 'reunited',
    closureChannel: 'tag_scan',
    closureNote: 'Voltou sozinha.',
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly trilhado: () => readonly AuditEvent[];
}

/** O repositório da bancada, DERIVADO do `WHERE` do `UPDATE` real. */
function repositorioDeMemoria(
  inicial: CasoGravado,
  { dono = DONO, petTemOutroCasoAberto = false }: { dono?: UserId; petTemOutroCasoAberto?: boolean } = {},
): LostCaseRepository {
  const naoUsado = (): never => {
    throw new Error('A reabertura não abre, não corrige e não encerra caso: método não esperado.');
  };

  let guardado = inicial;

  return {
    estadoParaAbertura: naoUsado,
    estadoParaPrevia: naoUsado,
    abrir: naoUsado,
    buscarDoTutor: (caso, quem) =>
      Promise.resolve(caso === guardado.id && quem === dono ? guardado : null),
    atualizarOndeEQuando: naoUsado,
    encerrar: naoUsado,
    reabrir: (entrada) => {
      if (entrada.caso !== guardado.id) return Promise.resolve(null);
      if (entrada.dono !== dono) return Promise.resolve(null);
      if (guardado.status === 'open') return Promise.resolve(null);
      const prazo = guardado.reopenDeadline;
      if (prazo === null || Number(prazo) <= Number(entrada.agora)) {
        return Promise.resolve(null);
      }
      if (petTemOutroCasoAberto) return Promise.resolve(null);
      guardado = {
        ...guardado,
        status: 'open',
        closedAt: null,
        reopenDeadline: null,
        closureOutcome: null,
        closureChannel: null,
        closureNote: null,
      };
      return Promise.resolve(guardado);
    },
    decidirCandidato: naoUsado,
    candidatoDecididoDoTutor: naoUsado,
    candidatosDoCaso: () => Promise.resolve([]),
  };
}

function disparosDeTeste(): RegistroDeDisparos {
  return {
    abrir: () => {
      throw new Error('A reabertura não dispara alerta: `POST /alerts` é quem faz isso.');
    },
    ultimoDoCaso: () => Promise.resolve(null),
    ultimoEnvioDoCaso: () => Promise.resolve(null),
    contextoDoCaso: () => Promise.resolve(null),
    concluir: () => Promise.resolve(),
  };
}

function filaDeTeste(): JobQueue {
  return {
    enqueue: () => {
      throw new Error('A reabertura não enfileira nada.');
    },
    claim: () => Promise.resolve([]),
    recuperarOrfaos: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };
}

function bancada(
  inicial: CasoGravado,
  opcoes: { dono?: UserId; petTemOutroCasoAberto?: boolean } = {},
): Bancada {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };
  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-000000000001',
    opaqueToken: () => {
      throw new Error('A reabertura não gera token.');
    },
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const alcance: AlcanceDoAlerta = { alcancaveis: () => Promise.resolve(null) };

  registrarRotasDeCasos(app, {
    casos: new LostCaseService({
      repositorio: repositorioDeMemoria(inicial, opcoes),
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

  return { app, trilhado: () => eventos };
}

async function reabrir(
  app: RegistradorDeRotas,
  quem: UserId,
  caso: CaseId = CASO,
): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/lost-cases/${caso}/reopen`,
    headers: { authorization: `Bearer ${quem}` },
  });
  return {
    status: resposta.statusCode,
    corpo: JSON.parse(resposta.body) as Record<string, unknown>,
  };
}

void describe('reopenLostCase: a rota que o contrato prometia', () => {
  void it('ISCA (a) — DENTRO da janela de 7 dias: 200, e o caso volta a `open` sem resto do encerramento', async () => {
    const { app, trilhado } = bancada(casoEncerrado(6 * UM_DIA));
    const { status, corpo } = await reabrir(app, DONO);
    await app.close();

    assert.equal(
      status,
      200,
      'REPROVA: reabrir dentro da janela não respondeu 200. O contrato promete, ' +
        'em `closeLostCase`, que "encerrar e reversivel por 7 dias", e declara ' +
        '`200` com `LostCase` em `reopenLostCase`. Enquanto a operação ficou em ' +
        '`OPERACOES_AINDA_SEM_ROTA` este caminho respondia 404.',
    );
    assert.equal(
      corpo['status'],
      'open',
      'REPROVA: a resposta não diz que o caso está aberto. Nenhum portão deste ' +
        'repositório confere o corpo da resposta, então ele é medido aqui: uma ' +
        'rota que responde 200 com o caso ainda encerrado é indistinguível de ' +
        'uma que funcionou, para quem só olha o status.',
    );
    assert.equal(
      corpo['closed_at'],
      null,
      'REPROVA: o caso reaberto continua com `closed_at`. O CHECK do banco ' +
        'recusa `status = open` com `closed_at` preenchido.',
    );
    assert.equal(
      corpo['resolution'],
      null,
      'REPROVA: o caso reaberto continua carregando o desfecho que foi desfeito. ' +
        'Ele sujaria a métrica de reencontro, que o contrato chama de ' +
        '"instrumento de medicao do produto".',
    );
    assert.equal(
      corpo['reopen_deadline'],
      null,
      'REPROVA: o prazo de reabertura sobreviveu à reabertura. Ele é o prazo ' +
        'DAQUELE encerramento, e mantê-lo faria a tela oferecer "reabrir" num ' +
        'caso que já está aberto.',
    );

    const reaberturas = trilhado().filter((e) => e.action === 'lost_case.reopened');
    assert.equal(
      reaberturas.length,
      1,
      'REPROVA: reabrir não deixou rastro em `audit.events`. Reabrir DESFAZ um ' +
        'desfecho que a métrica já contabilizou, e `lost_case.reopened` é a ' +
        'única ação que responde "este `reunited` foi desfeito, por quem".',
    );
    const evento = reaberturas[0];
    assert.ok(evento !== undefined);
    assert.equal(evento.actorUserId, DONO);
    assert.deepEqual(
      evento.metadata?.['undone_outcome'],
      'reunited',
      'REPROVA: a trilha não guardou o desfecho DESFEITO. Sem ele o evento diz ' +
        'que algo foi reaberto e não diz o que deixou de valer — que é a ' +
        'pergunta de uma investigação sobre a métrica.',
    );
  });

  void it('ISCA (b) — FORA da janela: 410 pelo motivo certo, e NUNCA 404 nem 403', async () => {
    const { app, trilhado } = bancada(casoEncerrado(-UM_DIA));
    const { status, corpo } = await reabrir(app, DONO);
    await app.close();

    assert.equal(
      status,
      410,
      'REPROVA: reabrir fora da janela não respondeu 410. É o que o contrato ' +
        'declara em `reopenLostCase`, com esta descrição: "Passou dos 7 dias". ' +
        'Um 404 aqui diria ao tutor que o caso dele não existe, e um 200 ' +
        'reabriria um caso que o contrato e a tela prometeram não reabrir.',
    );
    assert.equal(
      corpo['type'],
      `${BASE_DE_PROBLEMA}/lost-case-closed`,
      'REPROVA: o 410 saiu com outro `type`. O cliente decide por `type`, nunca ' +
        'pelo texto (RFC 9457), e `x-problem-types` é uma lista FECHADA: um ' +
        'slug fora dela é exatamente o que aquela lista existe para impedir.',
    );
    assert.equal(corpo['status'], 410);
    assert.match(
      String(corpo['detail']),
      /7 dias/u,
      'REPROVA: o corpo do 410 não diz qual é o prazo. Quem chegou no oitavo dia ' +
        'precisa saber que existiam sete, e qual é a saída.',
    );
    assert.equal(
      corpo['next_action'],
      undefined,
      'REPROVA: o 410 do tutor saiu com a saída do 410 público.',
    );
    assert.equal(
      trilhado().filter((e) => e.action === 'lost_case.reopened').length,
      0,
      'REPROVA: a recusa gravou evento de reabertura. Nada foi reaberto.',
    );
  });

  void it('ISCA (c) — caso de OUTRO tutor: 404, e NUNCA 403 (ADR-0021)', async () => {
    const { app } = bancada(casoEncerrado(6 * UM_DIA));
    const { status, corpo } = await reabrir(app, OUTRO_TUTOR);
    await app.close();

    assert.equal(
      status,
      404,
      'REPROVA: o caso de outro tutor não respondeu 404. O ADR-0021 é explícito ' +
        '— "recurso de outro tutor responde 404, nao 403" — e neste módulo vale ' +
        'duas vezes: um 403 confirmaria, a quem não é dono, que aquele pet esteve ' +
        'perdido.',
    );
    assert.notEqual(
      status,
      403,
      'REPROVA: a rota respondeu 403 para caso alheio. É a resposta que o ' +
        'ADR-0021 proíbe por nome, e o contrato declara `403` nesta operação — ' +
        'declaração que não autoriza usá-la para este caso.',
    );
    assert.equal(
      corpo['type'],
      `${BASE_DE_PROBLEMA}/not-found`,
      'REPROVA: o 404 saiu com outro `type`. O app decide por `type`.',
    );

    const comODono = bancada(casoEncerrado(6 * UM_DIA));
    const doDono = await reabrir(comODono.app, DONO);
    await comODono.app.close();
    assert.equal(
      doDono.status,
      200,
      'REPROVA (ASSERÇÃO VÁCUA): o 404 de cima não distingue "caso alheio" de ' +
        '"rota inexistente". Com a rota ausente os dois são 404, e este caso ' +
        'passaria sem medir a autorização.',
    );
  });

  void it('o REENVIO da fila offline devolve 200 com o caso aberto, e não 404', async () => {
    const { app } = bancada(casoEncerrado(6 * UM_DIA));
    const primeira = await reabrir(app, DONO);
    const segunda = await reabrir(app, DONO);
    await app.close();

    assert.equal(primeira.status, 200);
    assert.equal(
      segunda.status,
      200,
      'REPROVA: o segundo pedido da fila offline recebeu erro. A fila reenvia em ' +
        'rajada quando o sinal volta, e 404 diria "não encontramos isso" logo ' +
        'depois de a ação ter dado certo. É a mesma decisão escrita em ' +
        '`decidirCandidato`.',
    );
    assert.equal(segunda.corpo['status'], 'open');
  });

  void it('pet que JÁ tem outro caso aberto: 409 `pet-already-lost`, e não 500 do índice único', async () => {
    const { app } = bancada(casoEncerrado(6 * UM_DIA), { petTemOutroCasoAberto: true });
    const { status, corpo } = await reabrir(app, DONO);
    await app.close();

    assert.equal(
      status,
      409,
      'REPROVA: reabrir um caso cujo pet já tem outro caso aberto não respondeu ' +
        '409. Sem este ramo a violação de `lost_cases_um_aberto_por_pet` chega à ' +
        'borda como 500 — defeito de servidor no lugar de recusa explicada. A ' +
        'sequência é de dois toques: encerrar, marcar como perdido de novo, ' +
        'tentar reabrir o primeiro.',
    );
    assert.equal(corpo['type'], `${BASE_DE_PROBLEMA}/pet-already-lost`);
  });

  void it('a rota desta bancada é a `reopenLostCase` do contrato, em `/reopen`', () => {
    assert.equal(rotaDeReabertura.operationId, 'reopenLostCase');
    assert.equal(rotaDeReabertura.method, 'post');
    assert.equal(rotaDeReabertura.path, '/lost-cases/:caseId/reopen');
  });
});
