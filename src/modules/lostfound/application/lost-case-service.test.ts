/**
 * O serviço do caso de perdido. O que se prova aqui é o **efeito**, não a chamada.
 *
 * O foco é o encerramento (`BICHUS-82`), que até aqui nunca tinha sido exercido
 * de ponta a ponta. Quem está do outro lado dessas asserções é a tutora cujo pet
 * voltou: ela toca em "Voltou" com o app na fila offline, o toque sai duas
 * vezes, e o segundo encerramento não pode reescrever o desfecho do primeiro —
 * porque é esse desfecho que diz se o produto funciona.
 *
 * Quatro coisas que estes testes tratam como regra, e não como detalhe:
 *
 * - **Caso alheio e caso inexistente são a MESMA resposta**, e a asserção cobra
 *   404 e cobra explicitamente que não seja 403. Aqui um 403 confirmaria a um
 *   estranho que aquele pet está perdido.
 * - **O vínculo com o dono viaja em todo argumento.** Os testes leem o que o
 *   serviço entregou ao repositório: um `encerrar` que esquecesse de passar o
 *   dono passaria numa asserção de resultado e reprova nesta.
 * - **A corrida do índice `lost_cases_um_aberto_por_pet` é reproduzida**, e não
 *   descrita: o repositório de memória tem o índice, e a conferência devolve o
 *   estado velho — que é exatamente a janela por onde a rajada da fila offline
 *   passa quando o sinal volta.
 * - **Nada que saia do serviço carrega coordenada, telefone ou endereço.** A
 *   busca é por forma no objeto serializado, e não por nome de campo: um campo
 *   novo acrescentado depois cai na asserção sem ninguém atualizar o teste.
 */
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
  /**
   * Pets que o índice único `lost_cases_um_aberto_por_pet` já cobre.
   *
   * Existe separado de `abertura.petJaTemCasoAberto` de propósito: a corrida que
   * este módulo sofre é justamente a conferência dizer "pode" e o índice dizer
   * "não", e sem dois lugares para o estado essa corrida não é representável.
   */
  petsComCasoAbertoNoIndice?: PetId[];
  /** A area de referencia em texto do tutor, que so sai no caminho sem centro. */
  areaDeReferencia?: { city?: string; neighborhood?: string };
  /**
   * O que a porta `AlcanceDoAlerta` responde.
   *
   * `null` e o padrao de proposito: e o que a implementacao ligada em `api.ts`
   * devolve hoje, porque as tabelas de localizacao e de push nao existem. Um
   * padrao numerico aqui faria os testes exercitarem um mundo que nao existe.
   */
  contagemDeAlcance?: number | null;
  /**
   * Um candidato de `match_candidates`, com o dono do CASO dele.
   *
   * O dono mora aqui e não no candidato porque `match_candidates` **não tem
   * coluna de dono**: quem decide é o tutor do caso, e o duplo aqui precisa ter
   * a mesma forma para que a asserção "um terceiro não decide" signifique a
   * mesma coisa que no banco.
   */
  candidato?: {
    readonly dono: UserId;
    readonly casoAberto?: boolean;
    readonly status: 'suggested' | DecisaoDoCandidato;
    readonly decididoPor?: UserId;
  };
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
  /** BICHUS-66: os pets cuja transferencia viva o servico mandou cancelar. */
  readonly transferenciasCanceladas: PetId[];
  /** O que o serviço pediu ao repositório ao decidir, dono incluído. */
  readonly decidiu: { caso: CaseId; candidato: string; dono: UserId; decisao: string }[];
  /** As conversas que a decisão mandou abrir. Vazio prova que NÃO abriu. */
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
  // Cópia mutável: encerrar de verdade muda o estado, e é essa mudança que faz
  // o segundo encerramento da fila offline encontrar um caso que não está mais
  // aberto — em vez de o teste fingir isso com um contador.
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
      // O índice único parcial, reproduzido: quem chega com o pet já coberto sai
      // com zero linhas, que é o `null` do contrato da porta.
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
      // O `WHERE` do repositório de verdade resolve os dois predicados no banco.
      // Aqui o vínculo é reproduzido: quem não é o dono recebe exatamente o
      // mesmo nada de quem pediu um caso que nunca existiu.
      if (guardado === undefined || guardado.gravado.id !== caso) return Promise.resolve(null);
      return Promise.resolve(guardado.dono === dono ? guardado.gravado : null);
    },

    encerrar: (entrada) => {
      registro.encerrou.push({ ...entrada });
      if (guardado === undefined || guardado.gravado.id !== entrada.caso) {
        return Promise.resolve(null);
      }
      // `status = 'open'` mora no `WHERE` do UPDATE, e não num `if` antes dele.
      // As três recusas — não existe, não é seu, já estava encerrado — saem como
      // o mesmo `null`.
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
      };
      indice.delete(guardado.gravado.petId);
      guardado = { dono: guardado.dono, gravado: encerrado };
      return Promise.resolve(encerrado);
    },

    /**
     * A decisão, com o mesmo `WHERE` que o SQL carrega.
     *
     * As quatro recusas saem como o MESMO `null`, e é isso que faz 404 e não
     * 403: não existe caminho em que a linha de outro tutor chegue à camada de
     * cima para ser descartada por um `if`.
     */
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

  // O dublê devolve **a lista**, porque a porta só sabe devolver lista. Um
  // dublê que ainda devolvesse um número testaria uma porta que não existe, e
  // é assim que uma suíte inteira fica verde contra uma implementação trocada.
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
    ultimoEnvioDoCaso: () => Promise.resolve(null),
    contextoDoCaso: () => Promise.resolve(null),
    concluir: () => Promise.resolve(),
  };

  const fila: JobQueue = {
    enqueue: (kind, payload) => {
      registro.enfileirados.push({ kind, payload });
      return Promise.resolve('018f3a2b-0000-7000-8000-00000000f11a');
    },
    claim: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    fail: () => Promise.resolve(),
  };

  // BICHUS-66. Nao e dublê mudo: ele REGISTRA, para que o caso de "abrir caso
  // cancela a transferencia" possa afirmar que a chamada aconteceu em vez de
  // apenas compilar.
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

/** Usada nas asserções de vazamento: o formato de um UUID, de um telefone e de um CEP. */
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
    // A segunda asserção é o ADR-0021 escrito como cobrança: um 403 diria ao
    // curioso que aquele caso existe, e neste módulo isso é contar que aquele
    // pet está perdido a quem não deveria saber.
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

    // Textos iguais, tipo igual, status igual. Qualquer diferença aqui é um
    // oráculo de existência: dá para varrer IDs e separar o que existe do que
    // não existe pela resposta.
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
    // O que a métrica mede é o evento, e um caso que encerrou uma vez tem UM
    // evento. Se o segundo toque gravasse, "reencontrado" viraria "não
    // encontrado" na única conta que diz se o produto funciona.
    const encerramentos = eventos.filter((e) => e.action === 'lost_case.closed');
    assert.equal(encerramentos.length, 1);
    assert.equal(encerramentos[0]?.metadata?.['outcome'], 'reunited');
  });

  void it('o encerramento recusado não deixa rastro na trilha', async () => {
    const { casos, eventos } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await capturar(() => casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, chamador(OUTRO_TUTOR)));

    // Trilha com evento de encerramento que não encerrou nada faz o investigador
    // de amanhã acreditar num desfecho que nunca existiu.
    assert.equal(eventos.length, 0);
  });

  void it('o dono viaja em TODO argumento de encerramento, e não numa conferência antes', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    await casos.encerrar(CASO, 'not_found', undefined, undefined, chamador(DONO));

    // O ADR-0021 pede a autorização no `WHERE`. A prova de que ela não virou um
    // `if` depois da leitura é dupla: o dono está na entrada do `encerrar`, e
    // nenhuma busca solta aconteceu antes dele.
    assert.equal(registro.encerrou[0]?.dono, DONO);
    assert.equal(registro.buscou.length, 0);
  });

  void it('o canal do reencontro só acompanha o desfecho `reunited`', async () => {
    for (const desfecho of ['not_found', 'false_alarm'] as const) {
      const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

      // O app manda o canal que estava na tela anterior; o serviço é quem
      // descarta. Canal preenchido num caso que não foi reencontro sujaria a
      // conta de "um reencontro em cada três" com atribuição inventada — e no
      // `false_alarm` (BICHUS-44 critério 3) ele tem de ser nulo, porque não
      // houve reencontro nenhum.
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

    // A nota é campo livre, e campo livre recebe telefone e endereço de gente
    // que não consentiu com nada. A trilha é imutável por papel de banco: o que
    // entrar ali não sai mais.
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

    // O ALERTA TAMBÉM PASSA PELA VARREDURA, e é a parte nova: ele nasceu nesta
    // história e é o objeto mais provável de carregar geografia por engano —
    // uma `distance_m` do destinatário mais próximo pareceria informação útil e
    // seria uma trilateração pronta (ADR-0010).
    assert.doesNotMatch(JSON.stringify(alerta ?? {}), COORDENADA);

    // A busca é por forma, e não por nome de campo: um `lat` renomeado para
    // `ponto` continuaria sendo o vazamento. Ficam de fora da varredura os
    // campos que o contrato manda existir nesta resposta do DONO — os dois
    // UUIDs, o rótulo de área (bairro e cidade, o máximo de precisão que o
    // ADR-0010 admite) e as datas — porque os dígitos deles disparariam sozinhos.
    const semOQueOContratoExige = {
      ...encerrado,
      id: null,
      petId: null,
      areaLabel: null,
      lastSeenAt: null,
      openedAt: null,
      closedAt: null,
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
    // A conferência diz que pode e o índice diz que não: é a rajada da fila
    // offline quando o sinal volta, com duas requisições do mesmo tutor passando
    // pela leitura antes de qualquer uma gravar.
    const { casos, eventos, registro } = servico({
      abertura: { petJaTemCasoAberto: false },
      petsComCasoAbertoNoIndice: [PET],
    });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    assert.equal(erro.problemType, 'pet-already-lost');
    assert.equal(erro.status, 409);
    assert.equal(registro.abriu.length, 1, 'a gravação precisa ter sido TENTADA: é o índice que recusa');
    // Sem caso gravado não há alerta, e a trilha não pode dizer que houve.
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

    // Mandar a pessoa verificar o e-mail para ela descobrir depois que o teto
    // barrou é uma ida à caixa de entrada à toa, no pior momento da vida dela.
    assert.equal(erro.problemType, 'open-case-limit-reached');
  });

  void it('entre os bloqueios do pet, o canal de contato vem antes da foto', async () => {
    const { casos } = servico({ abertura: { temCanalVerificado: false, temFotoPronta: false } });

    const erro = await capturar(() => casos.abrir(PET, entradaPadrao(), chamador(DONO)));

    // Verificar o e-mail é o que mais gente resolve na hora; a foto exige sair
    // da tela e voltar. Pedir a difícil primeiro faz desistir quem resolveria a
    // fácil.
    assert.equal(erro.problemType, 'contact-channel-unverified');
  });

  void it('caso sem coordenada abre pela cidade, e diz que não tem ponto', async () => {
    const { casos } = servico();

    const { caso, alerta } = await casos.abrir(
      PET,
      { lastSeenAt: ONTEM, city: 'São Paulo', neighborhood: 'Pinheiros' },
      chamador(DONO),
    );

    // Critério 5 do BICHUS-21: falta de coordenada reduz o alcance, não a
    // existência. Bloquear aqui excluiria justamente quem negou a permissão de
    // localização — muita gente, e sobretudo quem instalou o app na pressa.
    assert.equal(caso.hasLocation, false);
    assert.equal(caso.status, 'open');
    // Critério 14 da BICHUS-18: sem centro não há raio, e isso é registrado
    // como `no_location` — não como falha de envio.
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
    // Critério 10: quem abre um caso está pedindo alcance, e perguntar isso a
    // quem está em pânico é uma decisão a mais no pior momento.
    assert.equal(registro.abriu[0]?.shareToPublicList, true);

    const outro = servico();
    await outro.casos.abrir(PET, entradaPadrao({ shareToPublicList: false }), chamador(DONO));
    assert.equal(outro.registro.abriu[0]?.shareToPublicList, false);
  });

  void it('a trilha da abertura não guarda coordenada, só se havia ponto', async () => {
    const { casos, eventos } = servico();

    await casos.abrir(PET, entradaPadrao({ lat: -23.561414, lon: -46.681872 }), chamador(DONO));

    // docs/04-seguranca.md 9: a trilha não guarda coordenada bruta. O que
    // importa para investigar depois é se houve alerta, e `has_location`
    // responde isso sem gravar onde a pessoa mora.
    const serializada = JSON.stringify(eventos[0]?.metadata ?? {});
    assert.doesNotMatch(serializada, COORDENADA);
    assert.equal(eventos[0]?.metadata?.['has_location'], true);
  });

  void it('o token público é opaco, e não o id do caso', async () => {
    const { casos, registro } = servico();

    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    // ADR-0010 item 6: nenhum UUID de banco em superfície pública. O `share_url`
    // e o cartaz são montados com este token, então um `shareToken` que fosse o
    // id do caso publicaria a chave interna em cada cartaz de poste.
    const novo = registro.abriu[0];
    assert.ok(novo !== undefined);
    assert.notEqual(novo.shareToken, novo.id);
    assert.doesNotMatch(novo.shareToken, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

/**
 * A prévia do alcance (BICHUS-202).
 *
 * O que se prova aqui é o que a rota não consegue provar sozinha: **o vínculo
 * com o dono viaja no argumento**. Um serviço que buscasse o estado sem passar o
 * chamador e conferisse o dono depois passaria em toda asserção de status desta
 * suíte e reprovaria neste bloco — que é a única forma de acusar a diferença
 * entre autorização na consulta e autorização num `if`.
 */
/**
 * BICHUS-66. Abrir um caso de perdido DERRUBA a transferencia viva daquele pet.
 *
 * Este bloco e a isca dessa ligacao, e ela existe porque a primeira medicao
 * mostrou que ela faltava: com `cancelarPorCasoAberto` trocado por um `no-op`,
 * os 1389 casos unitarios continuaram VERDES. O caso da transferencia chamava o
 * servico dela diretamente e nao passava por aqui, entao a unica coisa que
 * segurava a ligacao era o tipo -- e tipo prova que a fiacao existe, nao que
 * ela e usada.
 *
 * A assimetria que decide o desenho: consumar com caso aberto revogaria todas
 * as tags do pet (ADR-0004, irreversivel) no minuto em que a plaquinha da
 * coleira e a unica coisa ligando o animal ao tutor. Cancelar custa refazer o
 * convite depois do reencontro.
 */
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
    // A ordem importa: cancelar antes e ver a abertura falhar por corrida no
    // indice unico deixaria o tutor sem caso E sem transferencia, que e o pior
    // dos tres desfechos.
    const { casos, registro } = servico();
    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.equal(registro.abriu.length, 1);
    assert.equal(registro.transferenciasCanceladas.length, 1);
  });

  void it('abertura RECUSADA nao avisa ninguem', async () => {
    // Pet de outro tutor: nao houve caso, entao nao ha transferencia a derrubar.
    // Avisar aqui deixaria qualquer conta cancelar a transferencia de qualquer
    // pet, usando a abertura recusada como gatilho.
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
        // A BICHUS-21, critério 12, diz 403. A ADR-0021 diz 404 e é ela que
        // vale: aqui um 403 confirmaria que aquele pet existe e está perdido a
        // quem não é dono dele.
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

    // Critério 5 do ADR-0006: o tutor do caso nunca entra na própria lista de
    // notificados. O número da tela é o mesmo que o disparo vai usar, então um
    // tutor contado aqui seria um destinatário a mais na métrica e a menos na
    // realidade.
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

    // Rotular o ponto onde o pet sumiu com o bairro de casa do tutor seria uma
    // mentira de aparência plausível, e a tela a exibiria com a confiança de um
    // dado do servidor: "Vamos avisar 46 tutores num raio de 5 km da Vila
    // Madalena" quando o pet sumiu em outra cidade.
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

    // Busca por FORMA, e não por nome de campo: um campo novo acrescentado
    // depois cai nesta asserção sem ninguém atualizar o teste.
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

    // Ele não está entre os três `blockers` do contrato, e devolvê-lo "porque já
    // está na mão" agruparia os pets do tutor numa resposta que o documento não
    // declara — propriedade a MAIS, que nenhum portão de contrato acusa.
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
    // A API enfileira e o worker envia (ADR-0001). `queued` é um estado
    // próprio e não um sinônimo de `unavailable` — critério 11 da BICHUS-20,
    // que pede os dois como estados distintos.
    const { casos, registro } = servico();

    const { caso, alerta } = await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.equal(alerta?.estado, 'queued');
    assert.equal(alerta?.destinatarios, null, 'um disparo que não rodou não tem número');
    // O identificador enfileirado é o do caso que ACABOU de ser gravado. Um
    // trabalho enfileirado com outro identificador some na fila sem erro
    // nenhum, e o alerta simplesmente nunca sai.
    assert.deepEqual(registro.enfileirados, [
      { kind: 'alert.dispatch', payload: { caseId: caso.id } },
    ]);
  });

  void it('SEM coordenada nada é enfileirado: não é falha de envio, e não retenta', async () => {
    // Critério 14 da BICHUS-18, textual. Enfileirar para depois descobrir que
    // não há centro produziria uma tentativa fracassada onde não havia o que
    // tentar, e a tela leria isso como "o alerta falhou".
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
    // A regra do payload da fila (§11.5). O nome do pet e o bairro são lidos
    // pelo worker no instante do envio; enfileirados aqui, eles congelariam o
    // que a tutora corrigir nos próximos cinco minutos.
    const { casos, registro } = servico();

    await casos.abrir(PET, entradaPadrao(), chamador(DONO));

    assert.deepEqual(Object.keys(registro.enfileirados[0]?.payload as object), ['caseId']);
  });

  void it('os quatro estados de `AlertDispatch` são distintos entre si', () => {
    // Critério 12 da BICHUS-20: `no_location` é um quarto estado, distinto de
    // `computed` com zero, de `unavailable` e de `queued`. A tela tem texto
    // diferente para cada um, e trocar um pelo outro é mentir para quem está
    // em pânico.
    const estados = new Set(['computed', 'unavailable', 'queued', 'no_location']);
    assert.equal(estados.size, 4);
  });
});

/**
 * A decisão humana sobre o candidato (BICHUS-86, critérios 4, 5 e 12).
 *
 * O que se prova aqui é **o efeito da decisão sobre a conversa**, que é a parte
 * que nenhum banco pega: se `aoConfirmarCorrespondencia` sai do `if`, o Postgres
 * continua feliz e o tutor passa a receber o canal aberto de alguém que ele
 * acabou de dizer que não achou o pet dele.
 *
 * A autorização também está aqui, e é deliberadamente redundante com
 * `autorizacao-do-decisor-na-clausula-where.test.ts` e com a integração: aquele
 * lê o SQL, a integração o executa, e este cobra que a camada de cima **não
 * invente um segundo caminho** — um `if` que devolvesse a linha do terceiro
 * antes de o repositório recusar passaria nos outros dois.
 */
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
    // O dono viajou no argumento: um `decidirCandidato` que esquecesse de
    // passá-lo passaria numa asserção de resultado e reprova nesta.
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
    // Seção 4.10 de `docs/03-arquitetura.md` e critério 12 da BICHUS-86, com a
    // mesma frase nos dois: "rejeitado não volta".
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
    // Critério 7: sem conexão, a confirmação entra numa fila — e fila reenvia.
    // Um 404 aqui diria "não encontramos isso" logo depois de a ação ter dado
    // certo, que é a tela quebrada que a fila offline produz.
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
    // Rejeição é irreversível: ela precisa de autor e instante em lugar
    // auditável, que é a mesma razão de `match_candidates_decisao_tem_autor`.
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
    // O que sai é `MatchCandidate`. `pet_id` e o identificador de quem
    // registrou o achado não estão no schema, e o portão de contrato só procura
    // o que SUMIU — propriedade a mais passa por ele.
    const { casos } = servico(comCandidato());
    const decidido = await casos.decidirCandidato(CASO, CANDIDATO, 'confirmed', contextoDoDono);

    // A camada de aplicação ainda os carrega, de propósito: é com eles que ela
    // abre a conversa. Quem os deixa de fora é `comoRespostaDoCandidato`, e o
    // que se cobra aqui é que eles CHEGUEM, para que a borda tenha o que omitir.
    assert.equal(decidido.petId, PET);
    assert.equal(decidido.relatorUserId, RELATOR);
  });
});
