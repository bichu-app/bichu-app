/** O serviço do caso de perdido. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../../../shared/http/errors.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, JobKind, JobQueue } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import { LostCaseService, type ContextoDoChamador, type EntradaDoCaso } from './lost-case-service.js';
import type {
  CanalDoReencontro,
  CandidatoDecidido,
  CasoGravado,
  DecisaoDoCandidato,
  DesfechoDoCaso,
  EstadoDoPetParaAbertura,
  LostCaseRepository,
  NovoCaso,
} from '../ports/lost-case-repository.js';
import type { AberturaDeConversaPorCorrespondencia } from './lost-case-service.js';
import type { AlcanceDoAlerta } from '../ports/alcance-do-alerta.js';
import type { DisparoGravado, RegistroDeDisparos } from '../ports/registro-de-disparos.js';
import type { CentroDoAlcance } from '../domain/previa-do-alcance.js';
import { decodificarCursorDeCandidato } from '../domain/paginacao-de-candidatos.js';
import type {
  CaseId,
  FoundReportId,
  Instant,
  OpaqueToken,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;

const CANDIDATO = '018f3a2b-0000-7000-8000-0000000000ee';
const ACHADO = '018f3a2b-0000-7000-8000-0000000000f1' as FoundReportId;
const RELATOR = '018f3a2b-0000-7000-8000-0000000000f2' as UserId;

const AGORA = 1_800_000_000_000 as Instant;
const ONTEM = (1_800_000_000_000 - 24 * 3600 * 1000) as Instant;

/** O estado que o banco teria: quem existe, de quem é, e o que já está aberto. */
interface EstadoDoRepositorio {
  /** O que a consulta única de abertura responde. */
  abertura?: Partial<EstadoDoPetParaAbertura>;
  /** Um caso já gravado, com o dono dele. */
  caso?: { readonly dono: UserId; readonly gravado: CasoGravado };
  /** Pets que o índice único `lost_cases_um_aberto_por_pet` já cobre. */
  petsComCasoAbertoNoIndice?: PetId[];
  /** A area de referencia em texto do tutor, que so sai no caminho sem centro. */
  areaDeReferencia?: { city?: string; neighborhood?: string };
  /** O que a porta `AlcanceDoAlerta` responde. */
  contagemDeAlcance?: number | null;
  /** Um candidato de `match_candidates`, com o dono do CASO dele. */
  candidato?: {
    readonly dono: UserId;
    readonly casoAberto?: boolean;
    readonly status: 'suggested' | DecisaoDoCandidato;
    readonly decididoPor?: UserId;
  };
  /**
   * Quando o último alerta deste caso **saiu**, para o critério 7 do ADR-0006 (um
   * disparo por caso a cada 24 h).
   */
  ultimoEnvio?: Instant;
}

interface Registro {
  readonly abriu: NovoCaso[];
  readonly encerrou: {
    caso: CaseId;
    dono: UserId;
    desfecho: DesfechoDoCaso;
    canal: CanalDoReencontro | undefined;
    nota: string | undefined;
    agora: Instant;
  }[];
  readonly buscou: { caso: CaseId; dono: UserId }[];
  /** O que o servico pediu ao repositorio ao REABRIR, dono incluido. */
  readonly reabriu: { caso: CaseId; dono: UserId; agora: Instant }[];
  /** BICHUS-66: os pets cuja transferencia viva o servico mandou cancelar. */
  readonly transferenciasCanceladas: PetId[];
  /** O que o serviço pediu ao repositório ao decidir, dono incluído. */
  readonly decidiu: { caso: CaseId; candidato: string; dono: UserId; decisao: string }[];
  /** As conversas que a decisão mandou abrir. */
  readonly conversasAbertas: Parameters<
    AberturaDeConversaPorCorrespondencia['aoConfirmarCorrespondencia']
  >[0][];
  readonly conferiuAbertura: { pet: PetId; dono: UserId }[];
  readonly conferiuPrevia: { pet: PetId; dono: UserId }[];
  /** O que o servico pediu a porta de alcance, incluindo quem ele excluiu. */
  readonly contou: { centro: CentroDoAlcance; raio: number; excluiu: UserId }[];
  readonly disparosAbertos: DisparoGravado[];
  readonly enfileirados: { kind: JobKind; payload: unknown }[];
}

function casoAberto(): CasoGravado {
  return {
    id: CASO,
    petId: PET,
    status: 'open',
    lastSeenAt: comoData(ONTEM),
    hasLocation: true,
    areaLabel: 'Pinheiros, São Paulo',
    description: 'Fugiu pelo portão aberto.',
    shareToken: 'tok-publico',
    shareToPublicList: true,
    openedAt: comoData(ONTEM),
    closedAt: null,
    reopenDeadline: null,
    closureOutcome: null,
    closureChannel: null,
    closureNote: null,
  };
}

function repositorioDeMemoria(estado: EstadoDoRepositorio): {
  repositorio: LostCaseRepository;
  registro: Registro;
} {
  const registro: Registro = {
    abriu: [],
    encerrou: [],
    buscou: [],
    reabriu: [],
    decidiu: [],
    conversasAbertas: [],
    conferiuAbertura: [],
    conferiuPrevia: [],
    contou: [],
    disparosAbertos: [],
    enfileirados: [],
    transferenciasCanceladas: [],
  };
  const indice = new Set<PetId>(estado.petsComCasoAbertoNoIndice ?? []);
  let guardado = estado.caso;

  const repositorio: LostCaseRepository = {
    estadoParaAbertura: (pet, dono) => {
      registro.conferiuAbertura.push({ pet, dono });
      return Promise.resolve({
        existeEhDoTutor: true,
        temFotoPronta: true,
        petJaTemCasoAberto: false,
        casosAbertosDaConta: 0,
        temCanalVerificado: true,
        ...estado.abertura,
      });
    },

    estadoParaPrevia: (pet, dono) => {
      registro.conferiuPrevia.push({ pet, dono });
      return Promise.resolve({
        existeEhDoTutor: true,
        temFotoPronta: true,
        petJaTemCasoAberto: false,
        casosAbertosDaConta: 0,
        temCanalVerificado: true,
        ...estado.abertura,
        areaDeReferenciaDoTutor: {
          city: estado.areaDeReferencia?.city,
          neighborhood: estado.areaDeReferencia?.neighborhood,
        },
      });
    },

    abrir: (novo) => {
      registro.abriu.push(novo);
      if (indice.has(novo.petId)) return Promise.resolve(null);
      indice.add(novo.petId);
      const gravado: CasoGravado = {
        ...casoAberto(),
        id: novo.id,
        petId: novo.petId,
        lastSeenAt: comoData(novo.lastSeenAt),
        hasLocation: novo.lat !== undefined && novo.lon !== undefined,
        areaLabel: novo.city ?? null,
        description: novo.description ?? null,
        shareToken: novo.shareToken,
        shareToPublicList: novo.shareToPublicList,
      };
      guardado = { dono: novo.ownerUserId, gravado };
      return Promise.resolve(gravado);
    },

    buscarDoTutor: (caso, dono) => {
      registro.buscou.push({ caso, dono });
      if (guardado === undefined || guardado.gravado.id !== caso) return Promise.resolve(null);
      return Promise.resolve(guardado.dono === dono ? guardado.gravado : null);
    },

    encerrar: (entrada) => {
      registro.encerrou.push({ ...entrada });
      if (guardado === undefined || guardado.gravado.id !== entrada.caso) {
        return Promise.resolve(null);
      }
      if (guardado.dono !== entrada.dono || guardado.gravado.status !== 'open') {
        return Promise.resolve(null);
      }
      const encerrado: CasoGravado = {
        ...guardado.gravado,
        status: `closed_${entrada.desfecho}`,
        closedAt: comoData(entrada.agora),
        closureOutcome: entrada.desfecho,
        closureChannel: entrada.canal ?? null,
        closureNote: entrada.nota ?? null,
        reopenDeadline: comoData((Number(entrada.agora) + 7 * 24 * 3600 * 1000) as Instant),
      };
      indice.delete(guardado.gravado.petId);
      guardado = { dono: guardado.dono, gravado: encerrado };
      return Promise.resolve(encerrado);
    },

    /**
     * A reabertura, com os MESMOS quatro predicados que o `WHERE` do `UPDATE` carrega
     * — e não um `if` a mais nem um a menos.
     */
    reabrir: (entrada) => {
      registro.reabriu.push({ ...entrada });
      if (guardado === undefined || guardado.gravado.id !== entrada.caso) {
        return Promise.resolve(null);
      }
      if (guardado.dono !== entrada.dono) return Promise.resolve(null);
      if (guardado.gravado.status === 'open') return Promise.resolve(null);
      const prazo = guardado.gravado.reopenDeadline;
      if (prazo === null || Number(prazo) <= Number(entrada.agora)) {
        return Promise.resolve(null);
      }
      if (indice.has(guardado.gravado.petId)) return Promise.resolve(null);
      const reaberto: CasoGravado = {
        ...guardado.gravado,
        status: 'open',
        closedAt: null,
        reopenDeadline: null,
        closureOutcome: null,
        closureChannel: null,
        closureNote: null,
      };
      indice.add(guardado.gravado.petId);
      guardado = { dono: guardado.dono, gravado: reaberto };
      return Promise.resolve(reaberto);
    },

    /** A decisão, com o mesmo `WHERE` que o SQL carrega. */
    decidirCandidato: (entrada) => {
      registro.decidiu.push({
        caso: entrada.caso,
        candidato: entrada.candidato,
        dono: entrada.dono,
        decisao: entrada.decisao,
      });
      const c = estado.candidato;
      if (c === undefined || entrada.caso !== CASO || entrada.candidato !== CANDIDATO) {
        return Promise.resolve(null);
      }
      if (c.dono !== entrada.dono) return Promise.resolve(null);
      if ((c.casoAberto ?? true) === false) return Promise.resolve(null);
      if (c.status !== 'suggested') return Promise.resolve(null);
      estado.candidato = { ...c, status: entrada.decisao, decididoPor: entrada.dono };
      return Promise.resolve(candidatoGravado(entrada.decisao));
    },

    /**
     * `PATCH` com o mesmo `WHERE` do `UPDATE` de verdade: `id`, `dono` e `status =
     * 'open'`.
     */
    atualizarOndeEQuando: (entrada) => {
      if (guardado === undefined || guardado.gravado.id !== entrada.caso) {
        return Promise.resolve(null);
      }
      if (guardado.dono !== entrada.dono || guardado.gravado.status !== 'open') {
        return Promise.resolve(null);
      }
      const atualizado: CasoGravado = {
        ...guardado.gravado,
        lastSeenAt: comoData(entrada.lastSeenAt),
        hasLocation: entrada.lat !== undefined && entrada.lon !== undefined,
        areaLabel: entrada.city ?? null,
        description:
          entrada.description === undefined
            ? guardado.gravado.description
            : entrada.description,
        shareToPublicList: entrada.shareToPublicList ?? guardado.gravado.shareToPublicList,
      };
      guardado = { dono: guardado.dono, gravado: atualizado };
      return Promise.resolve(atualizado);
    },

    /**
     * A listagem com o dono na junção, como o SQL a carrega: candidato de caso de
     * outro tutor não chega a esta camada para ser descartado por um `if`.
     */
    candidatosDoCaso: (caso, dono) => {
      const c = estado.candidato;
      if (c === undefined || caso !== CASO || c.dono !== dono) return Promise.resolve([]);
      return Promise.resolve([{ ...candidatoGravado('confirmed'), status: c.status }]);
    },

    candidatoDecididoDoTutor: (caso, candidato, dono) => {
      const c = estado.candidato;
      if (c === undefined || caso !== CASO || candidato !== CANDIDATO) {
        return Promise.resolve(null);
      }
      if (c.dono !== dono || c.status === 'suggested') return Promise.resolve(null);
      return Promise.resolve(candidatoGravado(c.status));
    },
  };

  return { repositorio, registro };
}

function servico(estado: EstadoDoRepositorio = {}): {
  casos: LostCaseService;
  registro: Registro;
  eventos: AuditEvent[];
} {
  const { repositorio, registro } = repositorioDeMemoria(estado);
  const eventos: AuditEvent[] = [];
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };
  const clock: Clock = { now: () => AGORA };
  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => {
      sequencia += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sequencia).padStart(4, '0')}`;
    },
    opaqueToken: () => `token-${String(sequencia)}` as OpaqueToken,
    random128: () => new Uint8Array(16).fill(0x2b),
    random80: () => new Uint8Array(10).fill(0x2b),
  };

  const alcance: AlcanceDoAlerta = {
    alcancaveis: ({ centro, raioEmMetros, excluir }) => {
      registro.contou.push({ centro, raio: raioEmMetros, excluiu: excluir });
      const n = estado.contagemDeAlcance;
      if (n == null) return Promise.resolve(null);
      return Promise.resolve({
        destinatarios: Array.from({ length: n }, (_, i) => ({
          usuario: `018f3a2b-0000-7000-8000-${String(i).padStart(12, '0')}` as UserId,
          aparelhos: [`018f3a2b-0000-7000-8000-a${String(i).padStart(11, '0')}`],
        })),
        tetoAtingido: false,
      });
    },
  };

  const disparos: RegistroDeDisparos = {
    abrir: (entrada) => {
      const gravado: DisparoGravado = {
        id: entrada.id,
        caso: entrada.caso,
        estado: entrada.estado,
        destinatarios: null,
        raioEmMetros: entrada.raioEmMetros,
        tetoAtingido: false,
        pedidoEm: comoData(entrada.pedidoEm),
        enviadoEm: null,
      };
      registro.disparosAbertos.push(gravado);
      return Promise.resolve(gravado);
    },
    ultimoDoCaso: (caso) =>
      Promise.resolve(registro.disparosAbertos.find((d) => d.caso === caso) ?? null),
    ultimoEnvioDoCaso: () => Promise.resolve(estado.ultimoEnvio ?? null),
    contextoDoCaso: () => Promise.resolve(null),
    concluir: () => Promise.resolve(),
  };

  const fila: JobQueue = {
    enqueue: (kind, payload) => {
      registro.enfileirados.push({ kind, payload });
      return Promise.resolve('018f3a2b-0000-7000-8000-00000000f11a');
    },
    claim: () => Promise.resolve([]),
    recuperarOrfaos: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };

  const transferencias = {
    cancelarPorCasoAberto: (pet: PetId) => {
      registro.transferenciasCanceladas.push(pet);
      return Promise.resolve();
    },
  };

  return {
    casos: new LostCaseService({
      repositorio,
      ids,
      clock,
      trilha,
      alcance,
      disparos,
      fila,
      transferencias,
      conversaDaCorrespondencia: {
        aoConfirmarCorrespondencia: (aviso) => {
          registro.conversasAbertas.push(aviso);
          return Promise.resolve();
        },
      },
    }),
    registro,
    eventos,
  };
}

/** O candidato como o repositório o devolve depois de decidido. */
function candidatoGravado(status: DecisaoDoCandidato): CandidatoDecidido {
  return {
    id: CANDIDATO,
    caseId: CASO,
    foundReportId: ACHADO,
    petId: PET,
    nomeDoPet: 'Nina',
    relatorUserId: RELATOR,
    score: 0.78,
    atributosQuePontuaram: ['size', 'primary_color'],
    distanciaEmMetros: 800,
    linkOrigin: 'attribute_match',
    versaoDaEstrategia: 'v1',
    status,
    criadoEm: comoData(ONTEM),
    achado: {
      id: ACHADO,
      origin: 'stray_report',
      status: 'open',
      especie: 'dog',
      porte: 'M',
      cidade: 'São Paulo',
      bairro: 'Vila Madalena',
      achadoEm: comoData(ONTEM),
      observacao: 'Estava com coleira vermelha.',
      criadoEm: comoData(ONTEM),
    },
  };
}

function chamador(userId: UserId): ContextoDoChamador {
  return { userId, correlationId: '018f3a2b-0000-7000-8000-000000000fff', ip: '203.0.113.7' };
}

function entradaPadrao(extra: Partial<EntradaDoCaso> = {}): EntradaDoCaso {
  return { lastSeenAt: ONTEM, lat: -23.56, lon: -46.68, city: 'São Paulo', ...extra };
}

async function capturar(executar: () => Promise<unknown>): Promise<AppError> {
  try {
    await executar();
  } catch (erro) {
    assert.ok(erro instanceof AppError, `esperava AppError e veio ${String(erro)}`);
    return erro;
  }
  throw new Error('a operação não recusou, e deveria ter recusado');
}

/**
 * Usada nas asserções de vazamento: o formato de um UUID, de um telefone e de um
 * CEP.
 */
const COORDENADA = /-?\d{1,3}\.\d{3,}/;
const TELEFONE = /(\+55|\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]?\d{4}/;

void describe('closeLostCase: o desfecho é o instrumento de medição do produto', () => {
  void it('o dono encerra o caso aberto e o desfecho fica gravado', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso: encerrado } = await casos.encerrar(CASO, 'reunited', 'tag_scan', 'Voltou sozinha.', chamador(DONO));

    assert.equal(encerrado.status, 'closed_reunited');
    assert.equal(encerrado.closureOutcome, 'reunited');
    assert.equal(encerrado.closureChannel, 'tag_scan');
    assert.equal(registro.encerrou.length, 1);
  });

  void it('caso de OUTRO tutor responde 404, e nunca 403', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const erro = await capturar(() => casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, chamador(OUTRO_TUTOR)));

    assert.equal(erro.problemType, 'not-found');
    assert.equal(erro.status, 404);
    assert.notEqual(erro.status, 403);
  });

  void it('caso de outro tutor é a MESMA resposta de caso inexistente', async () => {
    const alheio = await capturar(async () => {
      const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });
      return casos.encerrar(CASO, 'not_found', undefined, undefined, chamador(OUTRO_TUTOR));
    });
    const inexistente = await capturar(async () => {
      const { casos } = servico();
      return casos.encerrar(CASO, 'not_found', undefined, undefined, chamador(OUTRO_TUTOR));
    });

    assert.equal(alheio.problemType, inexistente.problemType);
    assert.equal(alheio.status, inexistente.status);
    assert.equal(alheio.title, inexistente.title);
    assert.equal(alheio.detail, inexistente.detail);
  });

  void it('o segundo encerramento da fila offline não reescreve o desfecho do primeiro', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso: primeiro } = await casos.encerrar(CASO, 'reunited', 'bichu_alert', undefined, chamador(DONO));
    const segundo = await capturar(() => casos.encerrar(CASO, 'not_found', undefined, undefined, chamador(DONO)));

    assert.equal(primeiro.closureOutcome, 'reunited');
    assert.equal(segundo.problemType, 'not-found');
    const encerramentos = eventos.filter((e) => e.action === 'lost_case.closed');
    assert.equal(encerramentos.length, 1);
    assert.equal(encerramentos[0]?.metadata?.['outcome'], 'reunited');
  });

  void it('o encerramento recusado não deixa rastro na trilha', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await capturar(() => casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, chamador(OUTRO_TUTOR)));

    assert.equal(eventos.length, 0);
  });

  void it('o dono viaja em TODO argumento de encerramento, e não numa conferência antes', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.encerrar(CASO, 'not_found', undefined, undefined, chamador(DONO));

    assert.equal(registro.encerrou[0]?.dono, DONO);
    assert.equal(registro.buscou.length, 0);
  });

  void it('o canal do reencontro só acompanha o desfecho `reunited`', async () => {
    for (const desfecho of ['not_found', 'false_alarm'] as const) {
      const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

      const { caso: encerrado } = await casos.encerrar(CASO, desfecho, 'tag_scan', undefined, chamador(DONO));

      assert.equal(registro.encerrou[0]?.canal, undefined);
      assert.equal(encerrado.closureChannel, null);
    }
  });

  void it('o instante do encerramento vem do relógio injetado, nunca do relógio de parede', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso: encerrado } = await casos.encerrar(CASO, 'reunited', 'on_my_own', undefined, chamador(DONO));

    assert.equal(registro.encerrou[0]?.agora, AGORA);
    assert.equal(encerrado.closedAt?.getTime(), Number(AGORA));
  });

  void it('a trilha do encerramento não guarda a nota livre do tutor', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.encerrar(
      CASO,
      'reunited',
      'poster_or_link',
      'A vizinha do 32 achou ela, telefone 11 98888-7777.',
      chamador(DONO),
    );

    const serializada = JSON.stringify(eventos[0]?.metadata ?? {});
    assert.doesNotMatch(serializada, /vizinha|98888/i);
    assert.doesNotMatch(serializada, TELEFONE);
  });

  void it('o caso encerrado que o serviço devolve não carrega coordenada nem contato', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso: encerrado, alerta } = await casos.encerrar(
      CASO,
      'reunited',
      'tag_scan',
      undefined,
      chamador(DONO),
    );

    assert.doesNotMatch(JSON.stringify(alerta ?? {}), COORDENADA);

    const semOQueOContratoExige = {
      ...encerrado,
      id: null,
      petId: null,
      areaLabel: null,
      lastSeenAt: null,
      openedAt: null,
      closedAt: null,
      reopenDeadline: null,
    };
    assert.doesNotMatch(JSON.stringify(semOQueOContratoExige), COORDENADA);
    assert.doesNotMatch(JSON.stringify(semOQueOContratoExige), TELEFONE);
  });
});

void describe('getLostCase: a leitura é vinculada ao dono', () => {
  void it('caso de outro tutor responde 404, e nunca 403', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const erro = await capturar(() => casos.buscar(CASO, chamador(OUTRO_TUTOR)));

    assert.equal(erro.problemType, 'not-found');
    assert.equal(erro.status, 404);
    assert.notEqual(erro.status, 403);
  });

  void it('a busca leva o dono ao repositório, e não o compara depois', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.buscar(CASO, chamador(DONO));

    assert.deepEqual(registro.buscou, [{ caso: CASO, dono: DONO }]);
  });
});

void describe('openLostCase: a conferência dá a mensagem, o índice dá a garantia', () => {
  void it('pet de outro tutor e pet inexistente saem como 404', async () => {
    const { casos } = servico({ abertura: { existeEhDoTutor: false } });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(OUTRO_TUTOR)));

    assert.equal(erro.problemType, 'not-found');
    assert.equal(erro.status, 404);
    assert.notEqual(erro.status, 403);
  });

  void it('perder a corrida do índice `lost_cases_um_aberto_por_pet` vira `pet-already-lost`', async () => {
    const { casos, eventos, registro } = servico({
      abertura: { petJaTemCasoAberto: false },
      petsComCasoAbertoNoIndice: [PET],
    });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    assert.equal(erro.problemType, 'pet-already-lost');
    assert.equal(erro.status, 409);
    assert.equal(registro.abriu.length, 1, 'a gravação precisa ter sido TENTADA: é o índice que recusa');
    assert.equal(eventos.length, 0);
  });

  void it('duas aberturas seguidas do mesmo pet: a segunda é recusada pelo índice', async () => {
    const { casos } = servico({ abertura: { petJaTemCasoAberto: false } });

    await casos.abrir(PET, entradaPadrao(), chamador(DONO));
    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    assert.equal(erro.problemType, 'pet-already-lost');
  });

  void it('o teto da conta é cobrado ANTES dos bloqueios do pet', async () => {
    const { casos } = servico({
      abertura: { casosAbertosDaConta: 3, temCanalVerificado: false, temFotoPronta: false },
    });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    assert.equal(erro.problemType, 'open-case-limit-reached');
  });

  void it('entre os bloqueios do pet, o canal de contato vem antes da foto', async () => {
    const { casos } = servico({ abertura: { temCanalVerificado: false, temFotoPronta: false } });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    assert.equal(erro.problemType, 'contact-channel-unverified');
  });

  void it('caso sem coordenada abre pela cidade, e diz que não tem ponto', async () => {
    const { casos } = servico();

    const { caso, alerta } = await casos.abrir(
      PET,
      { lastSeenAt: ONTEM, city: 'São Paulo', neighborhood: 'Pinheiros' },
      chamador(DONO),
    );

    assert.equal(caso.hasLocation, false);
    assert.equal(caso.status, 'open');
    assert.equal(alerta?.estado, 'no_location');
  });

  void it('sem coordenada E sem cidade o caso não abre: seria um caso invisível', async () => {
    const { casos, registro } = servico();

    const erro = await capturar(() => casos.abrir(PET, { lastSeenAt: ONTEM }, chamador(DONO)));

    assert.equal(erro.problemType, 'validation-failed');
    assert.equal(erro.errors?.[0]?.field, 'last_seen_area');
    assert.equal(registro.abriu.length, 0);
  });

  void it('compartilhar na lista pública é o padrão, e quem disse não é respeitado', async () => {
    const { casos, registro } = servico();
    await casos.abrir(PET, entradaPadrao(), chamador(DONO));
    assert.equal(registro.abriu[0]?.shareToPublicList, true);

    const outro = servico();
    await outro.casos.abrir(PET, entradaPadrao({ shareToPublicList: false }), chamador(DONO));
    assert.equal(outro.registro.abriu[0]?.shareToPublicList, false);
  });

  void it('a trilha da abertura não guarda coordenada, só se havia ponto', async () => {
    const { casos, eventos } = servico();

    await casos.abrir(PET, entradaPadrao({ lat: -23.561414, lon: -46.681872 }), chamador(DONO));

    const serializada = JSON.stringify(eventos[0]?.metadata ?? {});
    assert.doesNotMatch(serializada, COORDENADA);
    assert.equal(eventos[0]?.metadata?.['has_location'], true);
  });

  void it('o token público é opaco, e não o id do caso', async () => {
    const { casos, registro } = servico();

    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    const novo = registro.abriu[0];
    assert.ok(novo !== undefined);
    assert.notEqual(novo.shareToken, novo.id);
    assert.doesNotMatch(novo.shareToken, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

/** A prévia do alcance (BICHUS-202). */
void describe('BICHUS-66: abrir o caso cancela a transferencia viva do pet', () => {
  void it('o caso aberto avisa o modulo de transferencia, com o pet certo', async () => {
    const { casos, registro } = servico();
    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.deepEqual(
      registro.transferenciasCanceladas,
      [PET],
      'abrir um caso de perdido deixou de derrubar a transferencia em curso: a janela de 24 h ' +
        'continua correndo e, quando fechar, o QR da coleira e revogado com o animal na rua',
    );
  });

  void it('o aviso sai DEPOIS de o caso existir, e nao antes', async () => {
    const { casos, registro } = servico();
    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.equal(registro.abriu.length, 1);
    assert.equal(registro.transferenciasCanceladas.length, 1);
  });

  void it('abertura RECUSADA nao avisa ninguem', async () => {
    const { casos, registro } = servico({ abertura: { existeEhDoTutor: false } });
    await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(OUTRO_TUTOR)));

    assert.deepEqual(registro.transferenciasCanceladas, []);
  });
});

void describe('previa do alcance — o vínculo com o dono e a honestidade do número', () => {
  void it('o dono viaja no argumento da consulta, e não é conferido depois', async () => {
    const { casos, registro } = servico();

    await casos.previa(PET, undefined, chamador(DONO));

    assert.deepEqual(registro.conferiuPrevia, [{ pet: PET, dono: DONO }]);
  });

  void it('pet que a consulta vinculada não devolve responde 404, e nunca 403', async () => {
    const { casos } = servico({ abertura: { existeEhDoTutor: false } });

    await assert.rejects(
      () => casos.previa(PET, undefined, chamador(OUTRO_TUTOR)),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.status, 404);
        assert.notEqual(erro.status, 403);
        assert.equal(erro.problemType, 'not-found');
        return true;
      },
    );
  });

  void it('bloqueio NÃO é erro na prévia: ele sai em lista, com 200', async () => {
    const { casos } = servico({
      abertura: { temCanalVerificado: false, temFotoPronta: false, petJaTemCasoAberto: true },
    });

    const previa = await casos.previa(PET, undefined, chamador(DONO));

    assert.deepEqual(previa.bloqueios, [
      'contact_channel_unverified',
      'pet_photo_missing',
      'pet_already_lost',
    ]);
  });

  void it('a contagem exclui o próprio tutor e usa o raio de 5 km', async () => {
    const { casos, registro } = servico({ contagemDeAlcance: 46 });

    await casos.previa(PET, { lat: -23.56, lon: -46.68 }, chamador(DONO));

    assert.deepEqual(registro.contou, [
      { centro: { lat: -23.56, lon: -46.68 }, raio: 5000, excluiu: DONO },
    ]);
  });

  void it('sem centro a porta de alcance NÃO é chamada: não há raio para contar', async () => {
    const { casos, registro } = servico({ contagemDeAlcance: 46 });

    const previa = await casos.previa(PET, undefined, chamador(DONO));

    assert.deepEqual(registro.contou, []);
    assert.equal(previa.estadoDoAlcance, 'no_location');
    assert.equal(previa.tutoresAlcancaveis, null);
  });

  void it('com centro o rótulo de área é nulo: não há geocodificação no MVP', async () => {
    const { casos } = servico({
      contagemDeAlcance: 46,
      areaDeReferencia: { neighborhood: 'Vila Madalena', city: 'São Paulo' },
    });

    const previa = await casos.previa(PET, { lat: -23.56, lon: -46.68 }, chamador(DONO));

    assert.equal(previa.rotuloDaArea, null);
  });

  void it('sem centro o rótulo é a área de referência do próprio tutor', async () => {
    const { casos } = servico({
      areaDeReferencia: { neighborhood: 'Vila Madalena', city: 'São Paulo' },
    });

    const previa = await casos.previa(PET, undefined, chamador(DONO));

    assert.equal(previa.rotuloDaArea, 'Vila Madalena, São Paulo');
  });

  void it('nada que sai da prévia carrega coordenada ou identificador interno', async () => {
    const { casos } = servico({ contagemDeAlcance: 46 });

    const previa = await casos.previa(PET, { lat: -23.56, lon: -46.68 }, chamador(DONO));

    const serializada = JSON.stringify(previa);
    assert.doesNotMatch(serializada, COORDENADA);
    assert.doesNotMatch(
      serializada,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  void it('o teto de casos abertos da conta NÃO vira bloqueio nem sai na resposta', async () => {
    const { casos } = servico({ abertura: { casosAbertosDaConta: 99 } });

    const previa = await casos.previa(PET, undefined, chamador(DONO));

    assert.deepEqual(previa.bloqueios, []);
    assert.deepEqual(Object.keys(previa).sort(), [
      'bloqueios',
      'estadoDoAlcance',
      'raioEmMetros',
      'rotuloDaArea',
      'tutoresAlcancaveis',
    ]);
  });
});

void describe('o alerta nasce junto do caso, e diz a verdade desde o primeiro instante', () => {
  void it('com coordenada o alerta nasce `queued` e o trabalho é ENFILEIRADO', async () => {
    const { casos, registro } = servico();

    const { caso, alerta } = await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.equal(alerta?.estado, 'queued');
    assert.equal(alerta?.destinatarios, null, 'um disparo que não rodou não tem número');
    assert.deepEqual(registro.enfileirados, [
      { kind: 'alert.dispatch', payload: { caseId: caso.id } },
    ]);
  });

  void it('SEM coordenada nada é enfileirado: não é falha de envio, e não retenta', async () => {
    const { casos, registro } = servico();

    const { alerta } = await casos.abrir(
      PET,
      { lastSeenAt: ONTEM, city: 'São Paulo', neighborhood: 'Pinheiros' },
      chamador(DONO),
    );

    assert.equal(alerta?.estado, 'no_location');
    assert.deepEqual(registro.enfileirados, []);
  });

  void it('o payload da fila leva o identificador, e nunca conteúdo montado', async () => {
    const { casos, registro } = servico();

    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.deepEqual(Object.keys(registro.enfileirados[0]?.payload as object), ['caseId']);
  });

  void it('os quatro estados de `AlertDispatch` são distintos entre si', () => {
    const estados = new Set(['computed', 'unavailable', 'queued', 'no_location']);
    assert.equal(estados.size, 4);
  });
});

/** A decisão humana sobre o candidato (BICHUS-86, critérios 4, 5 e 12). */
void describe('a decisão do candidato', () => {
  const contextoDoDono = chamador(DONO);

  function comCandidato(
    extra: Partial<NonNullable<EstadoDoRepositorio['candidato']>> = {},
  ): EstadoDoRepositorio {
    return { candidato: { dono: DONO, status: 'suggested', ...extra } };
  }

  void it('confirmar abre a conversa mediada com quem registrou o achado', async () => {
    const { casos, registro } = servico(comCandidato());

    const decidido = await casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono);

    assert.equal(decidido.status, 'confirmed');
    assert.equal(registro.conversasAbertas.length, 1, 'confirmar não abriu a conversa');
    const aberta = registro.conversasAbertas[0];
    assert.equal(aberta?.foundReportId, ACHADO);
    assert.equal(
      aberta?.achadorComConta,
      RELATOR,
      'a conversa nasceu sem o lado de quem achou: sem token e sem `finder_user_id`, ' +
        'quem registrou o achado não volta a ela nunca mais',
    );
    assert.equal(
      aberta?.petId,
      PET,
      'o pet precisa vir do CASO que casou: o achado avulso não tem `pet_id`',
    );
    assert.equal(aberta?.nomeDoPet, 'Nina');
    assert.equal(
      aberta?.rotuloDaArea,
      'Vila Madalena, São Paulo',
      'a primeira mensagem do sistema precisa dizer ONDE, e o rótulo sai do achado',
    );
  });

  void it('rejeitar NÃO abre conversa nenhuma', async () => {
    const { casos, registro } = servico(comCandidato());

    const decidido = await casos.decidirCandidato(CASO, CANDIDATO, 'rejected', contextoDoDono);

    assert.equal(decidido.status, 'rejected');
    assert.deepEqual(
      registro.conversasAbertas,
      [],
      'rejeitar abriu o canal com quem o tutor acabou de dizer que não achou o pet dele',
    );
  });

  void it('um TERCEIRO não decide, e recebe 404 e não 403', async () => {
    const { casos, registro } = servico(comCandidato());

    const erro = await capturar(() =>
      casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', chamador(OUTRO_TUTOR)),
    );

    assert.equal(erro.status, 404);
    assert.notEqual(
      erro.status,
      403,
      'um 403 confirmaria a existência de uma correspondência entre o pet de outra ' +
        'pessoa e um achado, que é exatamente o que a decisão humana existe para não ' +
        'afirmar sozinha (ADR-0021)',
    );
    assert.deepEqual(registro.conversasAbertas, []);
    assert.equal(registro.decidiu[0]?.dono, OUTRO_TUTOR);
  });

  void it('o candidato de outro caso do MESMO tutor não é decidido por este endereço', async () => {
    const { casos } = servico(comCandidato());
    const outroCaso = '018f3a2b-0000-7000-8000-0000000000d9' as CaseId;

    const erro = await capturar(() =>
      casos.decidirCandidato(outroCaso, CANDIDATO, 'confirmed', contextoDoDono),
    );

    assert.equal(erro.status, 404);
  });

  void it('REJEITADO NÃO VOLTA: confirmar depois de rejeitar é recusado', async () => {
    const { casos, registro } = servico(comCandidato({ status: 'rejected', decididoPor: DONO }));

    const erro = await capturar(() =>
      casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono),
    );

    assert.equal(erro.status, 404);
    assert.deepEqual(
      registro.conversasAbertas,
      [],
      'desfazer uma rejeição abriu a conversa que a rejeição existia para não abrir',
    );
  });

  void it('o reenvio da MESMA decisão devolve o mesmo candidato, e não 404', async () => {
    const { casos, registro } = servico(comCandidato());

    const primeira = await casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono);
    const reenvio = await casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono);

    assert.equal(reenvio.id, primeira.id);
    assert.equal(reenvio.status, 'confirmed');
    assert.equal(
      registro.conversasAbertas.length,
      1,
      'o reenvio abriu uma SEGUNDA conversa, e o tutor passou a ver duas linhas para a ' +
        'mesma pessoa',
    );
  });

  void it('o reenvio do TERCEIRO continua 404, e a leitura do já decidido não o relaxa', async () => {
    const { casos } = servico(comCandidato({ status: 'confirmed', decididoPor: DONO }));

    const erro = await capturar(() =>
      casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', chamador(OUTRO_TUTOR)),
    );

    assert.equal(erro.status, 404);
  });

  void it('a decisão de caso já encerrado é recusada', async () => {
    const { casos, registro } = servico(comCandidato({ casoAberto: false }));

    const erro = await capturar(() =>
      casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono),
    );

    assert.equal(erro.status, 404);
    assert.deepEqual(registro.conversasAbertas, []);
  });

  void it('as DUAS decisões entram na trilha, com quem decidiu e o que decidiu', async () => {
    for (const decisao of ['confirmed', 'rejected'] as const) {
      const { casos, eventos } = servico(comCandidato());
      await casos.decidirCandidato(CASO, CANDIDATO, decisao, contextoDoDono);

      const evento = eventos.find((e) => e.action === 'match.candidate_decided');
      assert.ok(evento !== undefined, `a decisão \`${decisao}\` não entrou na trilha`);
      assert.equal(evento.actorUserId, DONO);
      assert.equal(evento.resourceId, CANDIDATO);
      assert.equal((evento.metadata as { decision?: string }).decision, decisao);
    }
  });

  void it('a resposta da decisão não carrega o dono do achado nem o id do caso do pet', async () => {
    const { casos } = servico(comCandidato());
    const decidido = await casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono);

    assert.equal(decidido.petId, PET);
    assert.equal(decidido.relatorUserId, RELATOR);
  });
});

/** O contexto do dono, o mesmo molde das suítes de cima. */
const contextoDoTutor = chamador(DONO);

void describe('listLostCaseCandidates: o tutor VÊ o que ele podia decidir', () => {
  void it('o dono lê as correspondências do caso dele, inclusive as ainda sugeridas', async () => {
    const { casos } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      candidato: { dono: DONO, status: 'suggested' },
    });

    const pagina = await casos.candidatos(CASO, contextoDoTutor, { limit: 20, depoisDe: undefined });

    assert.equal(pagina.items.length, 1);
    assert.equal(pagina.items[0]?.status, 'suggested');
    assert.equal(pagina.items[0]?.id, CANDIDATO);
  });

  void it('caso de OUTRO tutor responde 404, e não uma lista vazia', async () => {
    const { casos } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      candidato: { dono: DONO, status: 'suggested' },
    });

    const erro = await capturar(() =>
      casos.candidatos(CASO, chamador(OUTRO_TUTOR), { limit: 20, depoisDe: undefined }),
    );

    assert.equal(erro.problemType, 'not-found');
    assert.notEqual(erro.status, 403);
  });

  void it('caso de outro tutor é a MESMA resposta de caso inexistente', async () => {
    const alheio = await capturar(async () => {
      const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });
      return casos.candidatos(CASO, chamador(OUTRO_TUTOR), { limit: 20, depoisDe: undefined });
    });
    const inexistente = await capturar(async () => {
      const { casos } = servico();
      return casos.candidatos(CASO, chamador(OUTRO_TUTOR), { limit: 20, depoisDe: undefined });
    });

    assert.equal(alheio.problemType, inexistente.problemType);
    assert.equal(alheio.title, inexistente.title);
    assert.equal(alheio.detail, inexistente.detail);
  });

  void it('lista vazia do PRÓPRIO caso é 200 com `items: []`, e não erro', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const pagina = await casos.candidatos(CASO, contextoDoTutor, { limit: 20, depoisDe: undefined });

    assert.deepEqual(pagina.items, []);
    assert.equal(pagina.nextCursor, null);
  });

  void it('página CURTA não devolve cursor: página curta é o fim da lista', async () => {
    const { casos } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      candidato: { dono: DONO, status: 'suggested' },
    });

    const pagina = await casos.candidatos(CASO, contextoDoTutor, { limit: 20, depoisDe: undefined });

    assert.equal(pagina.items.length, 1);
    assert.equal(pagina.nextCursor, null);
  });

  void it('página CHEIA devolve cursor, e ele carrega a posição do último item', async () => {
    const { casos } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      candidato: { dono: DONO, status: 'suggested' },
    });

    const pagina = await casos.candidatos(CASO, contextoDoTutor, { limit: 1, depoisDe: undefined });

    assert.notEqual(pagina.nextCursor, null);
    const posicao = decodificarCursorDeCandidato(pagina.nextCursor ?? undefined);
    assert.equal(posicao?.id, CANDIDATO);
    assert.equal(posicao?.score, pagina.items[0]?.score);
  });

  void it('a leitura NÃO conta nada e NÃO enfileira nada: `x-effects` é vazio de verdade', async () => {
    const { casos, registro } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      candidato: { dono: DONO, status: 'suggested' },
    });

    await casos.candidatos(CASO, contextoDoTutor, { limit: 20, depoisDe: undefined });

    assert.deepEqual(registro.enfileirados, []);
    assert.deepEqual(registro.contou, []);
    assert.deepEqual(registro.disparosAbertos, []);
  });
});

void describe('updateLostCase: o tutor corrige onde e quando', () => {
  void it('a correção grava a data nova e o novo onde', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso } = await casos.atualizar(
      CASO,
      { lastSeenAt: ONTEM, lat: -23.6, lon: -46.7, city: 'Santo André' },
      contextoDoTutor,
    );

    assert.equal(caso.lastSeenAt.getTime(), Number(ONTEM));
    assert.equal(caso.hasLocation, true);
    assert.equal(caso.areaLabel, 'Santo André');
  });

  void it('corrigir de PONTO para SÓ ÁREA apaga o ponto: `has_location` vira falso', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const { caso } = await casos.atualizar(
      CASO,
      { lastSeenAt: ONTEM, city: 'São Paulo', neighborhood: 'Vila Madalena' },
      contextoDoTutor,
    );

    assert.equal(caso.hasLocation, false);
  });

  void it('NÃO dispara alerta: o reenvio é outra operação, com teto próprio', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.atualizar(CASO, entradaPadrao(), contextoDoTutor);

    assert.deepEqual(registro.enfileirados, []);
    assert.deepEqual(registro.disparosAbertos, []);
  });

  void it('caso de OUTRO tutor responde 404, e nunca 403', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const erro = await capturar(() =>
      casos.atualizar(CASO, entradaPadrao(), chamador(OUTRO_TUTOR)),
    );

    assert.equal(erro.problemType, 'not-found');
    assert.notEqual(erro.status, 403);
  });

  void it('caso ENCERRADO não se corrige: 404, o mesmo `null` do encerramento', async () => {
    const { casos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });
    await casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, contextoDoTutor);

    const erro = await capturar(() => casos.atualizar(CASO, entradaPadrao(), contextoDoTutor));

    assert.equal(erro.problemType, 'not-found');
  });

  void it('a trilha registra a correção SEM coordenada no metadado', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.atualizar(
      CASO,
      { lastSeenAt: ONTEM, lat: -23.5678901, lon: -46.6789012, city: 'São Paulo' },
      contextoDoTutor,
    );

    const evento = eventos.find((e) => e.action === 'lost_case.updated');
    assert.ok(evento !== undefined, 'a correção precisa aparecer na trilha');
    assert.equal(evento.actorUserId, DONO);
    assert.doesNotMatch(JSON.stringify(evento.metadata), COORDENADA);
    assert.equal((evento.metadata as { has_location?: boolean }).has_location, true);
  });
});

void describe('resendLostCaseAlert: reusa a máquina de disparo, uma vez por dia', () => {
  void it('o reenvio grava o disparo e ENFILEIRA, pela mesma máquina da abertura', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const disparo = await casos.reenviarAlerta(CASO, contextoDoTutor);

    assert.equal(disparo.estado, 'queued');
    assert.equal(registro.disparosAbertos.length, 1);
    assert.deepEqual(registro.enfileirados, [{ kind: 'alert.dispatch', payload: { caseId: CASO } }]);
  });

  void it('caso SEM coordenada nasce `no_location` e NÃO é enfileirado', async () => {
    const { casos, registro } = servico({
      caso: { dono: DONO, gravado: { ...casoAberto(), hasLocation: false } },
    });

    const disparo = await casos.reenviarAlerta(CASO, contextoDoTutor);

    assert.equal(disparo.estado, 'no_location');
    assert.deepEqual(registro.enfileirados, []);
  });

  void it('o segundo reenvio dentro de 24 h recebe 429 com prazo, e não um alerta', async () => {
    const umaHoraAtras = (Number(AGORA) - 60 * 60 * 1000) as Instant;
    const { casos, registro } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      ultimoEnvio: umaHoraAtras,
    });

    const erro = await capturar(() => casos.reenviarAlerta(CASO, contextoDoTutor));

    assert.equal(erro.problemType, 'rate-limited');
    assert.equal(erro.status, 429);
    assert.ok(
      (erro.retryAfterSeconds ?? 0) > 22 * 3600 && (erro.retryAfterSeconds ?? 0) <= 23 * 3600,
      `esperava ~23 h de prazo e veio ${String(erro.retryAfterSeconds)}`,
    );
    assert.deepEqual(registro.enfileirados, []);
  });

  void it('um disparo que ficou ENFILEIRADO e nunca saiu não gasta o direito de ninguém', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.reenviarAlerta(CASO, contextoDoTutor);
    const segundo = await casos.reenviarAlerta(CASO, contextoDoTutor);

    assert.equal(segundo.estado, 'queued');
    assert.equal(registro.enfileirados.length, 2);
  });

  void it('caso de OUTRO tutor responde 404, e nunca 403', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const erro = await capturar(() => casos.reenviarAlerta(CASO, chamador(OUTRO_TUTOR)));

    assert.equal(erro.problemType, 'not-found');
    assert.notEqual(erro.status, 403);
    assert.deepEqual(registro.enfileirados, []);
  });

  void it('caso ENCERRADO não alerta ninguém: 404, e nada é enfileirado', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });
    await casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, contextoDoTutor);

    const erro = await capturar(() => casos.reenviarAlerta(CASO, contextoDoTutor));

    assert.equal(erro.problemType, 'not-found');
    assert.deepEqual(registro.enfileirados, []);
  });

  void it('o reenvio recusado não deixa rastro na trilha', async () => {
    const umaHoraAtras = (Number(AGORA) - 60 * 60 * 1000) as Instant;
    const { casos, eventos } = servico({
      caso: { dono: DONO, gravado: casoAberto() },
      ultimoEnvio: umaHoraAtras,
    });

    await capturar(() => casos.reenviarAlerta(CASO, contextoDoTutor));

    assert.equal(eventos.filter((e) => e.action === 'lost_case.alert_resent').length, 0);
  });

  void it('a trilha do reenvio tem autor humano, e é SEPARADA do disparo do worker', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.reenviarAlerta(CASO, contextoDoTutor);

    const evento = eventos.find((e) => e.action === 'lost_case.alert_resent');
    assert.ok(evento !== undefined, 'o reenvio precisa aparecer na trilha');
    assert.equal(evento.actorKind, 'user');
    assert.equal(evento.actorUserId, DONO);
    assert.doesNotMatch(JSON.stringify(evento.metadata), COORDENADA);
  });
});
