/**
 * A transferencia de pet, medida sem banco, sem servidor e sem rede.
 *
 * Quatro casos aqui sao ISCAS no sentido estrito: eles existem para reprovar se
 * alguem afrouxar a regra, e cada um esta anotado com o que precisa quebrar para
 * que ele fique vermelho. Rodei os quatro com a regra desligada antes de
 * entregar; a prova esta na entrega, e a reexecucao e o proprio teste.
 *
 *   1. transferir pet que nao e seu   -> 404, e NUNCA a transferencia aberta
 *   2. a janela de 24 h               -> nao consuma antes, consuma depois
 *   3. cancelar por token apos consumar -> 410, e o estado nao volta
 *   4. consumar sem aceite            -> nunca troca dono nem revoga tag
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import { PetTransferService } from './pet-transfer-service.js';
import {
  instanteDaConsumacao,
  instanteDoVencimentoDoConvite,
  podeCancelar,
  podeConsumar,
} from '../domain/janela-da-transferencia.js';
import type {
  MotivoDoCancelamento,
  StatusDaTransferencia,
} from '../domain/janela-da-transferencia.js';
import type {
  ConviteResolvido,
  NovaTransferencia,
  ResultadoDaAbertura,
  ResultadoDaConsumacao,
  ResultadoDoAceite,
  TransferId,
  TransferRepository,
  TransferenciaGravada,
  TransferenciaPorTokenDeCancelamento,
} from '../ports/transfer-repository.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Instant, PetId, UserId } from '../../../shared/types/brands.js';

const T0 = 1_758_000_000_000 as Instant;
const TUTOR = '018f0000-0000-7000-8000-000000000001' as UserId;
const OUTRO = '018f0000-0000-7000-8000-000000000002' as UserId;
const DESTINO = '018f0000-0000-7000-8000-000000000003' as UserId;
const PET = '018f0000-0000-7000-8000-0000000000a1' as PetId;
const TRANSFER = '018f0000-0000-7000-8000-0000000000b1' as TransferId;

const EMAIL_TUTOR = 'tutor@exemplo.com.br';
const EMAIL_DESTINO = 'destino@exemplo.com.br';

/**
 * O banco de mentira, e ele e uma MAQUINA DE ESTADO de verdade.
 *
 * Um dublê que devolvesse valores fixos nao poderia responder "o cancelamento
 * por token para de funcionar depois de consumada", porque essa frase e sobre o
 * estado mudar. As condicoes que o adaptador real poe no `WHERE` estao
 * reproduzidas aqui como `if`, e e a suite de integracao que confere que o
 * adaptador real as poe mesmo -- este arquivo mede a REGRA, aquele mede o SQL.
 */
interface Mundo {
  petsDoTutor: Map<PetId, UserId>;
  petsComCasoAberto: Set<PetId>;
  donoDoPet: Map<PetId, UserId>;
  tagsAtivas: Map<PetId, number>;
  linhas: Map<TransferId, Linha>;
  porTokenDeConvite: Map<string, TransferId>;
  porTokenDeCancelamento: Map<string, TransferId>;
}

interface Linha {
  id: TransferId;
  petId: PetId;
  fromUserId: UserId;
  toUserId: UserId | null;
  recipientEmail: string;
  status: StatusDaTransferencia;
  inviteExpiresAt: Date;
  acceptedAt: Date | null;
  effectiveAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: MotivoDoCancelamento | null;
}

const VIVOS: readonly StatusDaTransferencia[] = ['pending_acceptance', 'accepted'];

function mundoNovo(): Mundo {
  return {
    petsDoTutor: new Map([[PET, TUTOR]]),
    petsComCasoAberto: new Set(),
    donoDoPet: new Map([[PET, TUTOR]]),
    tagsAtivas: new Map([[PET, 3]]),
    linhas: new Map(),
    porTokenDeConvite: new Map(),
    porTokenDeCancelamento: new Map(),
  };
}

function comoGravada(l: Linha): TransferenciaGravada {
  return { ...l };
}

function repositorioDe(mundo: Mundo): TransferRepository {
  return {
    abrir(nova: NovaTransferencia): Promise<ResultadoDaAbertura> {
      if (mundo.petsDoTutor.get(nova.petId) !== nova.fromUserId) {
        return Promise.resolve({ tipo: 'pet_nao_e_deste_tutor' });
      }
      if (mundo.petsComCasoAberto.has(nova.petId)) {
        return Promise.resolve({ tipo: 'caso_aberto' });
      }
      for (const l of mundo.linhas.values()) {
        if (l.petId === nova.petId && VIVOS.includes(l.status)) {
          return Promise.resolve({ tipo: 'ja_em_andamento' });
        }
      }
      const linha: Linha = {
        id: nova.id,
        petId: nova.petId,
        fromUserId: nova.fromUserId,
        toUserId: null,
        recipientEmail: nova.recipientEmail,
        status: 'pending_acceptance',
        inviteExpiresAt: comoData(nova.inviteExpiresAt),
        acceptedAt: null,
        effectiveAt: null,
        cancelledAt: null,
        cancellationReason: null,
      };
      mundo.linhas.set(linha.id, linha);
      mundo.porTokenDeConvite.set(Buffer.from(nova.inviteTokenHash).toString('hex'), linha.id);
      return Promise.resolve({ tipo: 'aberta', transferencia: comoGravada(linha) });
    },

    buscarDoTutor(t: TransferId, dono: UserId): Promise<TransferenciaGravada | undefined> {
      const l = mundo.linhas.get(t);
      // A CLAUSULA `WHERE` INTEIRA, e as duas condicoes juntas. Tirar a segunda
      // e o que a isca 1 exercita.
      if (l === undefined || l.fromUserId !== dono) return Promise.resolve(undefined);
      return Promise.resolve(comoGravada(l));
    },

    buscarPorTokenDeConvite(hash: Uint8Array): Promise<ConviteResolvido | undefined> {
      const id = mundo.porTokenDeConvite.get(Buffer.from(hash).toString('hex'));
      const l = id === undefined ? undefined : mundo.linhas.get(id);
      if (l === undefined) return Promise.resolve(undefined);
      return Promise.resolve({
        id: l.id,
        petId: l.petId,
        fromUserId: l.fromUserId,
        recipientEmail: l.recipientEmail,
        status: l.status,
        inviteExpiresAt: l.inviteExpiresAt,
      });
    },

    buscarPorTokenDeCancelamento(
      hash: Uint8Array,
    ): Promise<TransferenciaPorTokenDeCancelamento | undefined> {
      const id = mundo.porTokenDeCancelamento.get(Buffer.from(hash).toString('hex'));
      const l = id === undefined ? undefined : mundo.linhas.get(id);
      if (l === undefined) return Promise.resolve(undefined);
      return Promise.resolve({
        id: l.id,
        petDisplayName: 'Nina',
        status: l.status,
        effectiveAt: l.effectiveAt,
        requestedAt: comoData(T0),
      });
    },

    registrarAceite(e): Promise<ResultadoDoAceite> {
      const l = mundo.linhas.get(e.transferencia);
      if (l === undefined) return Promise.resolve({ tipo: 'estado_mudou' });
      if (l.status !== 'pending_acceptance') return Promise.resolve({ tipo: 'estado_mudou' });
      if (l.inviteExpiresAt.getTime() <= e.acceptedAt) {
        return Promise.resolve({ tipo: 'estado_mudou' });
      }
      l.status = 'accepted';
      l.toUserId = e.toUserId;
      l.acceptedAt = comoData(e.acceptedAt);
      l.effectiveAt = comoData(e.effectiveAt);
      mundo.porTokenDeCancelamento.set(Buffer.from(e.cancelTokenHash).toString('hex'), l.id);
      return Promise.resolve({ tipo: 'aceita', transferencia: comoGravada(l) });
    },

    cancelar(e): Promise<TransferenciaGravada | undefined> {
      const l = mundo.linhas.get(e.transferencia);
      // A CONDICAO DE ESTADO. Tirar esta linha e o que a isca 3 exercita.
      if (l === undefined || !VIVOS.includes(l.status)) return Promise.resolve(undefined);
      l.status = 'cancelled';
      l.cancelledAt = comoData(e.quando);
      l.cancellationReason = e.motivo;
      if (e.consumirTokenDeCancelamento) {
        for (const [chave, id] of mundo.porTokenDeCancelamento) {
          if (id === l.id) mundo.porTokenDeCancelamento.delete(chave);
        }
      }
      return Promise.resolve(comoGravada(l));
    },

    cancelarVivaDoPet(e): Promise<TransferenciaGravada | undefined> {
      for (const l of mundo.linhas.values()) {
        if (l.petId !== e.pet || !VIVOS.includes(l.status)) continue;
        l.status = 'cancelled';
        l.cancelledAt = comoData(e.quando);
        l.cancellationReason = e.motivo;
        return Promise.resolve(comoGravada(l));
      }
      return Promise.resolve(undefined);
    },

    expirar(t: TransferId, quando: Instant): Promise<boolean> {
      const l = mundo.linhas.get(t);
      if (l === undefined || l.status !== 'pending_acceptance') return Promise.resolve(false);
      if (l.inviteExpiresAt.getTime() > quando) return Promise.resolve(false);
      l.status = 'expired';
      return Promise.resolve(true);
    },

    consumar(t: TransferId, agora: Instant): Promise<ResultadoDaConsumacao> {
      const l = mundo.linhas.get(t);
      if (l === undefined || l.status !== 'accepted' || l.effectiveAt === null) {
        return Promise.resolve({ tipo: 'ja_resolvida' });
      }
      // A JANELA. Trocar `<` por `<=` aqui e o que a isca 2 exercita.
      if (agora < l.effectiveAt.getTime()) {
        return Promise.resolve({ tipo: 'ainda_na_janela', effectiveAt: l.effectiveAt });
      }
      if (mundo.petsComCasoAberto.has(l.petId)) return Promise.resolve({ tipo: 'caso_aberto' });
      if (l.toUserId === null) return Promise.resolve({ tipo: 'destinatario_sumiu' });

      mundo.donoDoPet.set(l.petId, l.toUserId);
      const revogadas = mundo.tagsAtivas.get(l.petId) ?? 0;
      mundo.tagsAtivas.set(l.petId, 0);
      l.status = 'effective';
      return Promise.resolve({
        tipo: 'consumada',
        transferencia: comoGravada(l),
        tagsRevogadas: revogadas,
      });
    },
  };
}

interface Bancada {
  servico: PetTransferService;
  mundo: Mundo;
  enviados: { para: string; assunto: string; corpo: string }[];
  eventos: AuditEvent[];
  enfileirados: { kind: string; payload: unknown; runAt: Instant | undefined }[];
  agora: () => Instant;
  avancar: (ms: number) => void;
  tokens: string[];
}

function bancada(mundo = mundoNovo()): Bancada {
  let relogio = T0;
  const enviados: Bancada['enviados'] = [];
  const eventos: AuditEvent[] = [];
  const enfileirados: Bancada['enfileirados'] = [];
  const tokens: string[] = [];
  let contador = 0;

  const trilha: AuditLog = {
    record: (e) => {
      eventos.push(e);
      return Promise.resolve();
    },
  };

  const servico = new PetTransferService({
    repositorio: repositorioDe(mundo),
    ids: {
      uuidv7: () => TRANSFER,
      opaqueToken: () => {
        contador += 1;
        const t = `token-${contador}`;
        tokens.push(t);
        return t as never;
      },
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: { now: () => relogio },
    trilha,
    mailer: {
      enviar: (m) => {
        enviados.push(m);
        return Promise.resolve();
      },
    },
    contas: {
      emailVerificadoDe: (conta) =>
        Promise.resolve(
          conta === TUTOR
            ? EMAIL_TUTOR
            : conta === DESTINO
              ? EMAIL_DESTINO
              : undefined,
        ),
    },
    pets: { nomeDe: () => Promise.resolve('Nina') },
    fila: {
      enqueue: (kind, payload, runAt) => {
        enfileirados.push({ kind, payload, runAt });
        return Promise.resolve('job-1');
      },
      claim: () => Promise.resolve([]),
      complete: () => Promise.resolve(),
      fail: () => Promise.resolve(),
    },
    baseDaWeb: 'https://bichu.example',
  });

  return {
    servico,
    mundo,
    enviados,
    eventos,
    enfileirados,
    tokens,
    agora: () => relogio,
    avancar: (ms) => {
      relogio = (relogio + ms) as Instant;
    },
  };
}

function chamador(userId: UserId): { userId: UserId; correlationId: string; ip: string | undefined } {
  return { userId, correlationId: 'corr-1', ip: '203.0.113.7' };
}

async function recusa(fn: () => Promise<unknown>): Promise<AppError> {
  try {
    await fn();
  } catch (erro) {
    assert.ok(erro instanceof AppError, `esperava AppError, veio ${String(erro)}`);
    return erro;
  }
  throw new Error('a chamada devia ter sido recusada e nao foi');
}

// ---------------------------------------------------------------------------
// ISCA 1 -- transferir pet que nao e seu
// ---------------------------------------------------------------------------
// PARA FICAR VERMELHA: tire `l.fromUserId !== dono` de `buscarDoTutor`, ou tire
// a conferencia de `petsDoTutor` de `abrir`. No adaptador real, a linha
// equivalente e `.where('pet_transfers.from_user_id', '=', dono)` e
// `.where('pets.owner_user_id', '=', nova.fromUserId)`.
void describe('isca: transferir pet que nao e seu', () => {
  void it('responde 404 e NAO abre transferencia nenhuma', async () => {
    const b = bancada();
    const erro = await recusa(() => b.servico.iniciar(PET, EMAIL_DESTINO, chamador(OUTRO)));

    assert.equal(erro.status, 404);
    assert.equal(erro.problemType, 'not-found');
    // O que a isca precisa ver e o EFEITO, nao so o status: um 404 devolvido
    // depois de a linha ter sido gravada seria a mesma resposta com o dano
    // feito.
    assert.equal(b.mundo.linhas.size, 0, 'nenhuma linha podia existir');
    assert.equal(b.enviados.length, 0, 'nenhum convite podia sair');
  });

  void it('404 e nao 403: o status nao pode confirmar que o pet existe', async () => {
    const b = bancada();
    const doOutro = await recusa(() => b.servico.iniciar(PET, EMAIL_DESTINO, chamador(OUTRO)));
    const inexistente = await recusa(() =>
      b.servico.iniciar('018f0000-0000-7000-8000-0000000000ff' as PetId, EMAIL_DESTINO, chamador(OUTRO)),
    );
    // As duas respostas IDENTICAS. Distinguir confirmaria a existencia do pet.
    assert.equal(doOutro.status, inexistente.status);
    assert.equal(doOutro.problemType, inexistente.problemType);
  });

  void it('cancelar transferencia alheia responde 404 e nao cancela', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));

    const erro = await recusa(() => b.servico.cancelarPeloTutor(TRANSFER, chamador(OUTRO)));
    assert.equal(erro.status, 404);
    assert.equal(b.mundo.linhas.get(TRANSFER)?.status, 'pending_acceptance');
  });
});

// ---------------------------------------------------------------------------
// ISCA 2 -- a janela de 24 h
// ---------------------------------------------------------------------------
// PARA FICAR VERMELHA: troque `agora < l.effectiveAt.getTime()` por
// `agora <= ...` no dublê (ou troque `>=` por `>` em `podeConsumar`). O primeiro
// caso passa a consumar antes da hora.
void describe('isca: a janela de 24 h vale', () => {
  void it('nao consuma um milissegundo antes, consuma no instante exato', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    b.avancar(24 * 3_600_000 - 1);
    const cedo = await b.servico.consumar(TRANSFER);
    assert.equal(cedo.tipo, 'reagendar');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR, 'o dono nao podia ter mudado');
    assert.equal(b.mundo.tagsAtivas.get(PET), 3, 'nenhuma tag podia ter caido');

    b.avancar(1);
    const naHora = await b.servico.consumar(TRANSFER);
    assert.equal(naHora.tipo, 'consumada');
    assert.equal(b.mundo.donoDoPet.get(PET), DESTINO);
    assert.equal(b.mundo.tagsAtivas.get(PET), 0);
  });

  void it('o aceite agenda a consumacao para 24 h depois, e so com identificador', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    assert.equal(b.enfileirados.length, 1);
    const trabalho = b.enfileirados[0]!;
    assert.equal(trabalho.kind, 'case.transfer_consummate');
    assert.equal(trabalho.runAt, instanteDaConsumacao(T0));
    // REGRA NORMATIVA DA FILA: identificador, nunca conteudo. O payload nao
    // pode carregar token nem endereco -- ele e GRAVADO e sobrevive ao envio.
    assert.deepEqual(trabalho.payload, { transferId: TRANSFER });
    const serializado = JSON.stringify(trabalho.payload);
    for (const t of b.tokens) {
      assert.equal(serializado.includes(t), false, 'token no payload da fila');
    }
    assert.equal(serializado.includes(EMAIL_DESTINO), false, 'endereco no payload da fila');
  });

  void it('aceitar NAO revoga tag nenhuma: a revogacao e da consumacao', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    // ADR-0004 dizia "aceitar revoga"; o contrato moveu a revogacao para a
    // consumacao, e e o contrato que vale. Este caso e o que impede a volta.
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
  });

  void it('convite vencido nao e aceito', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    b.avancar(72 * 3_600_000);
    const erro = await recusa(() => b.servico.aceitar(b.tokens[0]!, chamador(DESTINO)));
    assert.equal(erro.status, 410);
  });
});

// ---------------------------------------------------------------------------
// ISCA 3 -- cancelamento por token depois de consumada
// ---------------------------------------------------------------------------
// PARA FICAR VERMELHA: tire `!VIVOS.includes(l.status)` de `cancelar` no dublê.
// No adaptador real, a linha equivalente e
// `.where('status', 'in', [...ESTADOS_VIVOS])`.
void describe('isca: o token de cancelamento para de funcionar apos a consumacao', () => {
  void it('depois de consumada o token responde 410 e o estado NAO volta', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    const tokenDeCancelamento = b.tokens[1]!;

    b.avancar(24 * 3_600_000);
    assert.equal((await b.servico.consumar(TRANSFER)).tipo, 'consumada');

    const erro = await recusa(() => b.servico.cancelarPorToken(tokenDeCancelamento));
    assert.equal(erro.status, 410);
    // O EFEITO, e nao so o status: o pet continua com o dono novo e as tags
    // continuam revogadas. Um cancelamento tardio que "funcionasse" devolveria
    // um pet sem plaquinha nenhuma para o tutor antigo.
    assert.equal(b.mundo.linhas.get(TRANSFER)?.status, 'effective');
    assert.equal(b.mundo.donoDoPet.get(PET), DESTINO);
    assert.equal(b.mundo.tagsAtivas.get(PET), 0);
  });

  void it('o token e de uso unico: o segundo cancelamento responde 410', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    const tokenDeCancelamento = b.tokens[1]!;

    await b.servico.cancelarPorToken(tokenDeCancelamento);
    const erro = await recusa(() => b.servico.cancelarPorToken(tokenDeCancelamento));
    assert.equal(erro.status, 410);
  });

  void it('dentro da janela, o token cancela e nada e revogado', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    b.avancar(23 * 3_600_000);
    await b.servico.cancelarPorToken(b.tokens[1]!);

    assert.equal(b.mundo.linhas.get(TRANSFER)?.status, 'cancelled');
    assert.equal(b.mundo.linhas.get(TRANSFER)?.cancellationReason, 'cancel_token');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);

    // E a consumacao agendada, quando acordar, nao faz nada.
    b.avancar(2 * 3_600_000);
    assert.equal((await b.servico.consumar(TRANSFER)).tipo, 'nada_a_fazer');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
  });
});

// ---------------------------------------------------------------------------
// ISCA 4 -- consumar sem aceite
// ---------------------------------------------------------------------------
// PARA FICAR VERMELHA: tire `l.status !== 'accepted'` de `consumar` no dublê.
// No adaptador real, a linha equivalente e o `if (linha.status !== 'accepted')`
// dentro da transacao, depois do `FOR UPDATE`.
void describe('isca: a transferencia nao conclui sem o aceite', () => {
  void it('convite pendente nunca consuma, por mais tempo que passe', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));

    b.avancar(365 * 24 * 3_600_000);
    const r = await b.servico.consumar(TRANSFER);

    assert.equal(r.tipo, 'nada_a_fazer');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
    assert.equal(b.mundo.tagsAtivas.get(PET), 3, 'nenhuma tag podia ter caido');
  });

  void it('token de convite apresentado por outra conta responde 403, e nao aceita', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));

    // A camada 2: a posse do token nao basta. 403 e nao 410, porque o token
    // esta certo e quem apresenta e que nao e o destinatario.
    const erro = await recusa(() => b.servico.aceitar(b.tokens[0]!, chamador(OUTRO)));
    assert.equal(erro.status, 403);
    assert.equal(erro.problemType, 'forbidden');
    assert.equal(b.mundo.linhas.get(TRANSFER)?.status, 'pending_acceptance');
    assert.equal(b.enfileirados.length, 0, 'nada podia ter sido agendado');
  });

  void it('conta sem e-mail verificado responde igual a conta errada', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    // `OUTRO` nao tem e-mail verificado na bancada. As duas respostas precisam
    // ser identicas: separa-las daria a quem tem o token uma pista sobre o
    // cadastro do destinatario.
    const semVerificar = await recusa(() => b.servico.aceitar(b.tokens[0]!, chamador(OUTRO)));
    assert.equal(semVerificar.problemType, 'forbidden');
  });
});

// ---------------------------------------------------------------------------
// O caso que a issue pediu: pet marcado como perdido no meio da janela
// ---------------------------------------------------------------------------
void describe('pet marcado como perdido durante a janela de 24 h', () => {
  void it('a transferencia e cancelada e NENHUMA tag e revogada', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    // Hora 3 da janela: o tutor abre o caso de perdido.
    b.avancar(3 * 3_600_000);
    b.mundo.petsComCasoAberto.add(PET);
    await b.servico.cancelarPorCasoAberto(PET);

    const linha = b.mundo.linhas.get(TRANSFER)!;
    assert.equal(linha.status, 'cancelled');
    assert.equal(linha.cancellationReason, 'lost_case_opened');
    // O QUE IMPORTA: a plaquinha da coleira continua viva. E ela que liga o
    // animal ao tutor enquanto ele esta na rua.
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
  });

  void it('os dois lados sao avisados, e o texto diz que a plaquinha continua', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    b.enviados.length = 0;

    b.mundo.petsComCasoAberto.add(PET);
    await b.servico.cancelarPorCasoAberto(PET);

    const destinos = b.enviados.map((m) => m.para).sort();
    assert.deepEqual(destinos, [EMAIL_DESTINO, EMAIL_TUTOR].sort());
    for (const m of b.enviados) {
      assert.match(m.corpo, /perdido/);
      assert.match(m.corpo, /continuam funcionando/);
    }
  });

  void it('A BARREIRA QUE GARANTE: a consumacao recusa mesmo sem ninguem ter cancelado', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    // O caso abre e NINGUEM avisa a transferencia -- a corrida entre a
    // checagem e a escrita, ou um caminho de abertura que alguem escreva amanha
    // sem lembrar de chamar a porta.
    b.mundo.petsComCasoAberto.add(PET);
    b.avancar(24 * 3_600_000);

    const r = await b.servico.consumar(TRANSFER);
    assert.equal(r.tipo, 'cancelada');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR, 'o dono NAO podia mudar');
    assert.equal(b.mundo.tagsAtivas.get(PET), 3, 'a plaquinha NAO podia cair');
    assert.equal(b.mundo.linhas.get(TRANSFER)?.cancellationReason, 'lost_case_opened');
  });

  void it('pet ja perdido nao inicia transferencia: 409 com a saida na mensagem', async () => {
    const b = bancada();
    b.mundo.petsComCasoAberto.add(PET);
    const erro = await recusa(() => b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR)));
    assert.equal(erro.status, 409);
    assert.equal(erro.problemType, 'pet-already-lost');
    assert.equal(b.mundo.linhas.size, 0);
  });
});

// ---------------------------------------------------------------------------
// O resto do escopo
// ---------------------------------------------------------------------------
void describe('o convite', () => {
  void it('o token NAO aparece na resposta, e sai so no corpo do e-mail', async () => {
    const b = bancada();
    const t = await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));

    const serializado = JSON.stringify(t);
    assert.equal(serializado.includes(b.tokens[0]!), false, 'token na resposta da API');
    assert.equal(b.enviados.length, 1);
    assert.ok(b.enviados[0]!.corpo.includes(b.tokens[0]!), 'o token tinha de ir no e-mail');
    assert.equal(b.enviados[0]!.para, EMAIL_DESTINO);
  });

  void it('vence em 72 h e o prazo esta na linha', async () => {
    const b = bancada();
    const t = await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    assert.equal(t.inviteExpiresAt.getTime(), instanteDoVencimentoDoConvite(T0));
  });

  void it('o endereco e normalizado antes de gravar e de comparar', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, '  DesTino@Exemplo.Com.BR  ', chamador(TUTOR));
    assert.equal(b.mundo.linhas.get(TRANSFER)?.recipientEmail, EMAIL_DESTINO);
    // E o aceite reconhece a mesma pessoa: sem a normalizacao dos dois lados,
    // `Marina@` deixaria de ser a mesma pessoa que `marina@`.
    const aceita = await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    assert.equal(aceita.status, 'accepted');
  });

  void it('transferir para o proprio e-mail e recusado', async () => {
    const b = bancada();
    const erro = await recusa(() => b.servico.iniciar(PET, 'TUTOR@exemplo.com.br', chamador(TUTOR)));
    assert.equal(erro.status, 400);
    assert.equal(b.mundo.linhas.size, 0);
    // Consumado, ele revogaria todas as tags e devolveria o pet ao mesmo dono
    // sem plaquinha nenhuma: destruicao sem transferencia.
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);
  });

  void it('transferencia ja em andamento responde 409, nao uma segunda linha', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    const erro = await recusa(() => b.servico.iniciar(PET, 'outro@exemplo.com', chamador(TUTOR)));
    assert.equal(erro.status, 409);
    assert.equal(erro.problemType, 'transfer-already-in-progress');
    assert.equal(b.mundo.linhas.size, 1);
  });

  void it('a trilha guarda o endereco MASCARADO, nunca em claro', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));

    const evento = b.eventos.find((e) => e.action === 'pet_transfer.started');
    assert.ok(evento !== undefined);
    const metadado = JSON.stringify(evento.metadata);
    assert.equal(metadado.includes(EMAIL_DESTINO), false, 'endereco em claro na trilha');
    assert.ok(metadado.includes('de****@exemplo.com.br'));
  });
});

void describe('o cancelamento pelo tutor', () => {
  void it('cancela dentro da janela e nada e revogado', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    b.avancar(12 * 3_600_000);
    const t = await b.servico.cancelarPeloTutor(TRANSFER, chamador(TUTOR));

    assert.equal(t.status, 'cancelled');
    assert.equal(t.cancellationReason, 'current_owner');
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);
  });

  void it('depois de consumada responde 409 e nao 404', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    b.avancar(24 * 3_600_000);
    await b.servico.consumar(TRANSFER);

    const erro = await recusa(() => b.servico.cancelarPeloTutor(TRANSFER, chamador(TUTOR)));
    // 409 e nao 410: a rota exige conta, e o tutor tem direito de saber em que
    // pe esta a propria transferencia. O 410 sem distincao e da superficie
    // publica do token.
    assert.equal(erro.status, 409);
    assert.equal(erro.problemType, 'transfer-already-effective');
  });
});

void describe('a visao publica do token de cancelamento', () => {
  void it('devolve o minimo: nome do pet e quando consuma', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    const v = await b.servico.verPorTokenDeCancelamento(b.tokens[1]!);
    assert.equal(v.petDisplayName, 'Nina');
    assert.equal(v.effectiveAt?.getTime(), instanteDaConsumacao(T0));

    // ADR-0010: nem o endereco do destinatario, nem os identificadores internos.
    const serializado = JSON.stringify(v);
    assert.equal(serializado.includes(EMAIL_DESTINO), false);
    assert.equal(serializado.includes(PET), false);
  });

  void it('token desconhecido e token de transferencia consumada respondem IGUAL', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));
    b.avancar(24 * 3_600_000);
    await b.servico.consumar(TRANSFER);

    const consumada = await recusa(() => b.servico.verPorTokenDeCancelamento(b.tokens[1]!));
    const inexistente = await recusa(() => b.servico.verPorTokenDeCancelamento('nao-existe'));
    assert.equal(consumada.status, inexistente.status);
    assert.equal(consumada.problemType, inexistente.problemType);
    assert.equal(consumada.detail, inexistente.detail);
  });
});

void describe('o destinatario que apagou a conta', () => {
  void it('a consumacao cancela em vez de revogar as tags de um pet sem destino', async () => {
    const b = bancada();
    await b.servico.iniciar(PET, EMAIL_DESTINO, chamador(TUTOR));
    await b.servico.aceitar(b.tokens[0]!, chamador(DESTINO));

    // `ON DELETE SET NULL`: a conta do destinatario sumiu.
    b.mundo.linhas.get(TRANSFER)!.toUserId = null;
    b.avancar(24 * 3_600_000);

    const r = await b.servico.consumar(TRANSFER);
    assert.equal(r.tipo, 'cancelada');
    assert.equal(b.mundo.donoDoPet.get(PET), TUTOR);
    assert.equal(b.mundo.tagsAtivas.get(PET), 3);
  });
});

void describe('o dominio e a implementacao concordam', () => {
  void it('podeConsumar e podeCancelar sao exclusivos no instante da virada', () => {
    const estado = {
      status: 'accepted' as const,
      inviteExpiresAt: instanteDoVencimentoDoConvite(T0),
      effectiveAt: instanteDaConsumacao(T0),
    };
    const virada = instanteDaConsumacao(T0);
    // Nunca os dois verdadeiros ao mesmo tempo: se fossem, haveria um instante
    // em que cancelar e consumar competiriam pela mesma linha.
    for (const delta of [-2, -1, 0, 1, 2]) {
      const t = (virada + delta) as Instant;
      assert.equal(podeCancelar(estado, t) && podeConsumar(estado, t), false, `delta ${delta}`);
    }
  });
});
