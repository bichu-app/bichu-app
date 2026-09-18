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
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { comoData } from '../../../shared/time/clock.js';
import { LostCaseService, type ContextoDoChamador, type EntradaDoCaso } from './lost-case-service.js';
import type {
  CanalDoReencontro,
  CasoGravado,
  DesfechoDoCaso,
  EstadoDoPetParaAbertura,
  LostCaseRepository,
  NovoCaso,
} from '../ports/lost-case-repository.js';
import type { CaseId, Instant, OpaqueToken, PetId, UserId } from '../../../shared/types/brands.js';

const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const OUTRO_TUTOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const PET = '018f3a2b-0000-7000-8000-0000000000cc' as PetId;
const CASO = '018f3a2b-0000-7000-8000-0000000000dd' as CaseId;

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
  readonly conferiuAbertura: { pet: PetId; dono: UserId }[];
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
  const registro: Registro = { abriu: [], encerrou: [], buscou: [], conferiuAbertura: [] };
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
  };

  return { casos: new LostCaseService({ repositorio, ids, clock, trilha }), registro, eventos };
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

    const encerrado = await casos.encerrar(CASO, 'reunited', 'tag_scan', 'Voltou sozinha.', chamador(DONO));

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

    const primeiro = await casos.encerrar(CASO, 'reunited', 'bichu_alert', undefined, chamador(DONO));
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
      const encerrado = await casos.encerrar(CASO, desfecho, 'tag_scan', undefined, chamador(DONO));

      assert.equal(registro.encerrou[0]?.canal, undefined);
      assert.equal(encerrado.closureChannel, null);
    }
  });

  void it('o instante do encerramento vem do relógio injetado, nunca do relógio de parede', async () => {
    const { casos, registro } = servico({ caso: { dono: DONO, gravado: casoAberto() } });

    const encerrado = await casos.encerrar(CASO, 'reunited', 'on_my_own', undefined, chamador(DONO));

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

    const encerrado = await casos.encerrar(CASO, 'reunited', 'tag_scan', undefined, chamador(DONO));

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

    const caso = await casos.abrir(
      PET,
      { lastSeenAt: ONTEM, city: 'São Paulo', neighborhood: 'Pinheiros' },
      chamador(DONO),
    );

    // Critério 5 do BICHUS-21: falta de coordenada reduz o alcance, não a
    // existência. Bloquear aqui excluiria justamente quem negou a permissão de
    // localização — muita gente, e sobretudo quem instalou o app na pressa.
    assert.equal(caso.hasLocation, false);
    assert.equal(caso.status, 'open');
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
