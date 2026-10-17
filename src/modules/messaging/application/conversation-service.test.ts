/**
 * O serviço da conversa mediada.
 *
 * ## O que este arquivo consegue provar, e o que ele NÃO consegue
 *
 * Ele prova a REGRA: que a redação roda antes de gravar, nos dois sentidos; que
 * a conversa encerrada recusa mensagem; que a retenção acontece sem notificar
 * ninguém; e que o objeto que sai não carrega telefone, e-mail, endereço nem
 * identificador de conta.
 *
 * Ele **não** prova que a consulta filtra pelo dono. Aqui quem recusa é o
 * dublê, e um repositório que ignorasse o chamador continuaria passando neste
 * arquivo inteiro. Quem prova aquilo é
 * `adapters/persistence/autorizacao-na-clausula-where.test.ts`, que lê o SQL
 * compilado — e é por isso que ele existe, e não por simetria.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AppError } from '../../../shared/http/errors.js';
import { comoData } from '../../../shared/time/clock.js';
import { ConversationService, type Chamador } from './conversation-service.js';
import type { AuditEvent, AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import type {
  ConversaDoChamador,
  ConversationRepository,
  MensagemGravada,
  NovaDenuncia,
  NovaMensagem,
} from '../ports/conversation-repository.js';
import type {
  ConversationId,
  FoundReportId,
  Instant,
  OpaqueToken,
  PetId,
  UserId,
} from '../../../shared/types/brands.js';

const AGORA = 1_790_000_000_000 as Instant;
const TUTOR = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
const ACHADOR = '018f3a2b-0000-7000-8000-0000000000bb' as UserId;
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;
const PET = '018f3a2b-0000-7000-8000-0000000000dd' as PetId;
const AVISO = '018f3a2b-0000-7000-8000-0000000000ee' as FoundReportId;

interface Estado {
  readonly conversa?: Partial<ConversaDoChamador> | undefined;
  readonly mensagensDoParticipante?: number | undefined;
  readonly casosDistintos?: number | undefined;
  readonly conversaDoAviso?: ConversationId | undefined;
}

function conversaAberta(parcial: Partial<ConversaDoChamador> = {}): ConversaDoChamador {
  return {
    id: CONVERSA,
    caseId: null,
    petDisplayName: 'Aurora',
    abertaEm: comoData(AGORA),
    papelDoChamador: 'tutor',
    encerradaEm: null,
    motivoDoEncerramento: null,
    bloqueadaEm: null,
    casoEncerrado: false,
    nomeDoTutor: 'Leandro Panegassi',
    nomeDoAchador: 'Ana Paula Ribeiro',
    ...parcial,
  };
}

function bancada(estado: Estado = {}) {
  const gravadas: NovaMensagem[] = [];
  const aberturas: unknown[] = [];
  const retencoes: { conversa: ConversationId; motivo: string }[] = [];
  const bloqueios: { conversa: ConversationId; chamador: UserId; agora: Instant }[] = [];
  const denuncias: NovaDenuncia[] = [];
  const eventos: AuditEvent[] = [];

  const conversa = estado.conversa === undefined ? undefined : conversaAberta(estado.conversa);

  const repositorio: ConversationRepository = {
    abrirPorAviso: (abertura) => {
      aberturas.push(abertura);
      return Promise.resolve();
    },
    porAviso: () => Promise.resolve(estado.conversaDoAviso ?? CONVERSA),
    listarDoChamador: () => Promise.resolve(conversa === undefined ? [] : [conversa]),
    buscarDoChamador: () => Promise.resolve(conversa),
    mensagens: () => Promise.resolve([]),
    gravarMensagem: (mensagem) => {
      gravadas.push(mensagem);
      return Promise.resolve(comoGravada(mensagem));
    },
    gravarMensagemDeSistema: (mensagem) => {
      const completa: NovaMensagem = { ...mensagem, senderRole: 'system', senderUserId: null };
      gravadas.push(completa);
      return Promise.resolve(comoGravada(completa));
    },
    contarMensagensDoParticipante: () => Promise.resolve(estado.mensagensDoParticipante ?? 1),
    contarCasosDistintosDaConta: () => Promise.resolve(estado.casosDistintos ?? 1),
    reterParaRevisao: (alvo, motivo) => {
      retencoes.push({ conversa: alvo, motivo });
      return Promise.resolve();
    },
    // O lado do achador sem conta tem bancada própria
    // (`conversa-do-achador.test.ts`). Aqui ele não é exercido, e chamá-lo é
    // defeito de fiação que precisa aparecer, e não um `undefined` silencioso.
    buscarPeloTokenDoAchador: () => Promise.reject(new Error('fora desta bancada')),
    mensagensPeloTokenDoAchador: () => Promise.reject(new Error('fora desta bancada')),
    bloquearPeloAchador: () => Promise.reject(new Error('fora desta bancada')),
    // Estes DOIS são exercidos aqui: são as duas escritas do lado com conta que
    // faltavam, e o dublê as registra para que a asserção possa afirmar que a
    // chamada aconteceu com o chamador certo, em vez de apenas compilar.
    bloquearPeloChamador: (alvo, quem, agora) => {
      bloqueios.push({ conversa: alvo, chamador: quem, agora });
      return Promise.resolve();
    },
    registrarDenuncia: (denuncia) => {
      denuncias.push(denuncia);
      return Promise.resolve();
    },
  };

  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => {
      sequencia += 1;
      return `018f3a2b-0000-7000-8000-00000000${String(sequencia).padStart(4, '0')}`;
    },
    opaqueToken: () => 'token' as OpaqueToken,
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const clock: Clock = { now: () => AGORA };
  const trilha: AuditLog = {
    record: (evento) => {
      eventos.push(evento);
      return Promise.resolve();
    },
  };

  return {
    servico: new ConversationService({ repositorio, ids, clock, trilha }),
    gravadas,
    aberturas,
    retencoes,
    bloqueios,
    denuncias,
    eventos,
  };
}

function comoGravada(mensagem: NovaMensagem): MensagemGravada {
  return {
    id: mensagem.id,
    senderRole: mensagem.senderRole,
    body: mensagem.body,
    redactions: mensagem.redactions,
    photoObjectKey: null,
    createdAt: comoData(AGORA),
  };
}

function chamador(userId: UserId): Chamador {
  return { userId, correlationId: 'corr-1', ip: '203.0.113.7' };
}

const PAGINA = { limit: 20, depoisDe: undefined };

void describe('critério 13 — a redação roda ANTES de gravar, nos dois sentidos', () => {
  void it('o telefone que o tutor digitou não chega ao banco', async () => {
    const { servico, gravadas } = bancada({ conversa: { papelDoChamador: 'tutor' } });
    const mensagem = await servico.enviar(CONVERSA, 'me liga 11 98765-4321', chamador(TUTOR));

    const doTutor = gravadas.find((m) => m.senderRole === 'tutor');
    assert.ok(doTutor !== undefined, 'a mensagem do tutor não foi gravada');
    assert.doesNotMatch(doTutor.body, /9876/, `o telefone foi gravado: ${doTutor.body}`);
    assert.deepEqual(
      doTutor.redactions.map((r) => r.kind),
      ['phone'],
    );
    assert.doesNotMatch(mensagem.body, /9876/, 'o telefone voltou na resposta');
  });

  void it('o mesmo vale no sentido contrário, do achador para o tutor', async () => {
    // Proteger só um lado é o defeito que o critério 16 nomeia. A conversa é
    // mediada, e mediação de mão única é um filtro de tela com outro nome.
    const { servico, gravadas } = bancada({ conversa: { papelDoChamador: 'finder' } });
    await servico.enviar(CONVERSA, 'estou na Rua das Acacias, 120', chamador(ACHADOR));

    const doAchador = gravadas.find((m) => m.senderRole === 'finder');
    assert.ok(doAchador !== undefined);
    assert.doesNotMatch(doAchador.body, /Acacias, 120/, `o endereço foi gravado: ${doAchador.body}`);
    assert.deepEqual(
      doAchador.redactions.map((r) => r.kind),
      ['address'],
    );
  });

  void it('critério 16 — o sistema explica, em vez de o texto sumir sozinho', async () => {
    const { servico, gravadas } = bancada({ conversa: {} });
    await servico.enviar(CONVERSA, 'moro na Rua X, 10', chamador(TUTOR));

    const aviso = gravadas.find((m) => m.senderRole === 'system');
    assert.ok(aviso !== undefined, 'nenhuma mensagem de sistema explicou o que saiu');
    assert.match(aviso.body, /não entrega telefone, e-mail nem endereço/);
  });

  void it('ISCA NEGATIVA — mensagem sem contato não ganha aviso nem perde texto', async () => {
    const { servico, gravadas } = bancada({ conversa: {} });
    const texto = 'consigo te encontrar amanhã de manhã na praça central';
    const mensagem = await servico.enviar(CONVERSA, texto, chamador(TUTOR));

    assert.equal(mensagem.body, texto, 'a redação comeu texto que não devia');
    assert.deepEqual(mensagem.redactions, []);
    assert.equal(
      gravadas.filter((m) => m.senderRole === 'system').length,
      0,
      'apareceu aviso de dado retirado numa mensagem que não teve nada retirado',
    );
  });
});

void describe('ADR-0021 — conversa que não é sua responde 404, nunca 403', () => {
  void it('a busca de uma conversa que o repositório não devolve é 404', async () => {
    const { servico } = bancada({ conversa: undefined });
    await assert.rejects(
      () => servico.buscar(CONVERSA, chamador(TUTOR), PAGINA),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.problemType, 'not-found');
        return true;
      },
    );
  });

  void it('o envio para uma conversa que não é sua é 404, e nada é gravado', async () => {
    // O 403 confirmaria que aquele id existe. E gravar antes de autorizar
    // deixaria a mensagem no banco de uma conversa alheia.
    const { servico, gravadas } = bancada({ conversa: undefined });
    await assert.rejects(() => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)));
    assert.deepEqual(gravadas, []);
  });
});

void describe('critério 8 — conversa em modo leitura não recebe mensagem', () => {
  void it('encerrada responde 410 `conversation-closed`', async () => {
    const { servico, gravadas } = bancada({
      conversa: { encerradaEm: comoData(AGORA), motivoDoEncerramento: 'pet_returned' },
    });
    await assert.rejects(
      () => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.problemType, 'conversation-closed');
        return true;
      },
    );
    assert.deepEqual(gravadas, [], 'gravou mensagem numa conversa fechada');
  });

  void it('caso encerrado fecha a conversa mesmo sem `closed_at` próprio', async () => {
    const { servico } = bancada({ conversa: { casoEncerrado: true } });
    await assert.rejects(() => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)));
  });

  void it('bloqueada também recusa, e com o MESMO problema', async () => {
    // Um tipo próprio para "você foi bloqueado" contaria a quem escreve que a
    // outra pessoa o bloqueou. Bloquear é a ação que alguém executa com medo.
    const { servico } = bancada({ conversa: { bloqueadaEm: comoData(AGORA) } });
    await assert.rejects(
      () => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        assert.equal(erro.problemType, 'conversation-closed');
        return true;
      },
    );
  });
});

void describe('critérios 10 e 11 — reter para revisão, sem notificar ninguém', () => {
  void it('a 201ª mensagem retém por volume, e a mensagem É gravada', async () => {
    const { servico, retencoes, gravadas } = bancada({
      conversa: {},
      mensagensDoParticipante: 201,
    });
    await servico.enviar(CONVERSA, 'oi', chamador(TUTOR));
    assert.deepEqual(
      retencoes.map((r) => r.motivo),
      ['message_volume'],
    );
    assert.equal(gravadas.length, 1, 'a mensagem que estourou o teto precisa ser gravada');
  });

  void it('três casos distintos retêm por falso achador em série', async () => {
    const { servico, retencoes } = bancada({ conversa: {}, casosDistintos: 3 });
    await servico.enviar(CONVERSA, 'oi', chamador(ACHADOR));
    assert.deepEqual(
      retencoes.map((r) => r.motivo),
      ['serial_finder'],
    );
  });

  void it('a retenção NÃO produz mensagem, nem muda o que o remetente recebe', async () => {
    // "Sem notificar ninguém" é o critério, e a razão está nele: avisar é
    // ajudar o golpe a se corrigir antes de a moderação olhar.
    const { servico, gravadas } = bancada({ conversa: {}, casosDistintos: 3 });
    const mensagem = await servico.enviar(CONVERSA, 'oi', chamador(ACHADOR));
    assert.equal(gravadas.length, 1, 'a retenção gerou mensagem visível');
    assert.equal(mensagem.body, 'oi');
  });

  void it('a trilha registra o MOTIVO, e nunca o texto da mensagem', async () => {
    const { servico, eventos } = bancada({ conversa: {}, casosDistintos: 3 });
    await servico.enviar(CONVERSA, 'me liga 11987654321', chamador(ACHADOR));
    const retido = eventos.find((e) => e.action === 'conversation.held_for_review');
    assert.ok(retido !== undefined, 'a retenção não foi auditada');
    assert.deepEqual(retido.metadata, { reason: 'serial_finder' });
    assert.doesNotMatch(JSON.stringify(retido), /9876/, 'o texto entrou na trilha');
  });

  void it('conversa dentro dos tetos não é retida', async () => {
    const { servico, retencoes } = bancada({
      conversa: {},
      mensagensDoParticipante: 200,
      casosDistintos: 2,
    });
    await servico.enviar(CONVERSA, 'oi', chamador(TUTOR));
    assert.deepEqual(retencoes, []);
  });
});

void describe('a conversa que sai do servidor', () => {
  void it('não carrega tutor_user_id, retenção, nem nada que identifique o outro lado', async () => {
    const { servico } = bancada({
      conversa: { nomeDoTutor: 'Leandro Panegassi', nomeDoAchador: 'Ana Paula Ribeiro' },
    });
    const conversa = await servico.buscar(CONVERSA, chamador(TUTOR), PAGINA);
    const serializado = JSON.stringify(conversa);

    assert.ok(!serializado.includes(TUTOR), 'o id do tutor saiu na resposta');
    assert.doesNotMatch(serializado, /held|review|retid/i, 'a marca de retenção saiu');
    assert.doesNotMatch(serializado, /Panegassi|Ribeiro/, 'o sobrenome atravessou');
    assert.deepEqual(
      conversa.participants.map((p) => p.displayName),
      ['Leandro', 'Ana'],
    );
  });

  void it('a lista não carrega mensagens, e isso é o valor verdadeiro da vista', async () => {
    const { servico } = bancada({ conversa: {} });
    const pagina = await servico.listar(chamador(TUTOR), PAGINA);
    assert.equal(pagina.items.length, 1);
    assert.deepEqual(pagina.items[0]?.messages, []);
    assert.equal(pagina.nextCursor, null, 'página curta não tem próxima');
  });
});

void describe('a conversa nasce de um aviso, e só dele', () => {
  void it('abrir grava a mensagem de sistema do critério 2', async () => {
    const { servico, gravadas, aberturas } = bancada({ conversaDoAviso: undefined });
    await servico.abrirPorAviso({
      foundReportId: AVISO,
      petId: PET,
      nomeDoPet: 'Aurora',
      escaneadoEm: AGORA,
      rotuloDaArea: 'Pinheiros, São Paulo',
      recado: 'achei ela, me liga 11987654321',
      achadorComConta: null,
      avisoAnteriorId: null,
    });

    assert.equal(aberturas.length, 1, 'a conversa não foi aberta');
    const sistema = gravadas.find((m) => m.senderRole === 'system');
    assert.ok(sistema !== undefined);
    assert.match(sistema.body, /Alguém escaneou a tag da Aurora/);
    assert.doesNotMatch(sistema.body, /9876/, 'o telefone do recado entrou na conversa');
  });

  void it('aviso agrupado NÃO abre a segunda conversa', async () => {
    // Dois avisos do mesmo achador em 6 h são uma conversa só. Abrir a segunda
    // faria o tutor ver duas linhas para a mesma pessoa, e tocaria o telefone
    // dele de novo por um fato que ele já sabe.
    const { servico, aberturas, gravadas } = bancada({});
    await servico.abrirPorAviso({
      foundReportId: AVISO,
      petId: PET,
      nomeDoPet: 'Aurora',
      escaneadoEm: AGORA,
      rotuloDaArea: null,
      recado: null,
      achadorComConta: null,
      avisoAnteriorId: '018f3a2b-0000-7000-8000-00000000ffff' as FoundReportId,
    });
    assert.deepEqual(aberturas, [], 'abriu a segunda conversa para um aviso agrupado');
    assert.equal(gravadas.length, 1, 'o aviso agrupado precisa virar mensagem na que existe');
  });
});

// ===========================================================================
// O bloqueio e a denúncia do lado COM CONTA (a assimetria que faltava)
// ===========================================================================

/** A recusa, capturada como `AppError`. Não recusar é falha do caso. */
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
 * O que estas duas suítes cobram, e o que elas NÃO cobram.
 *
 * O achador sem conta já tinha `/finder/conversation/block` e `/report` no ar, e
 * o lado autenticado não tinha nenhuma das duas: um tutor sendo extorquido no
 * canal mediado não tinha saída. O que se prova aqui é a REGRA — quem denuncia é
 * o lado lido da consulta vinculada, o alvo é o outro papel, e conversa de
 * terceiro responde 404.
 *
 * O que **não** se prova aqui é que a escrita filtra pelo chamador: nesta
 * bancada quem recusa é o dublê. Quem prova aquilo é
 * `adapters/persistence/bloqueio-do-chamador-na-clausula-where.test.ts`, que lê
 * o SQL compilado.
 */
void describe('blockConversation: o lado com conta também bloqueia', () => {
  void it('o tutor bloqueia, e a escrita recebe a conversa e o chamador', async () => {
    const { servico, bloqueios } = bancada({ conversa: {} });

    await servico.bloquear(CONVERSA, chamador(TUTOR));

    assert.deepEqual(bloqueios, [{ conversa: CONVERSA, chamador: TUTOR, agora: AGORA }]);
  });

  void it('a trilha grava o PAPEL lido da consulta, e não um argumento de quem chama', async () => {
    // `blocked_by_role` é o campo que diz à outra pessoa quem fechou a porta.
    // Vindo de fora, ele acusaria a vítima.
    const { servico, eventos } = bancada({ conversa: { papelDoChamador: 'finder' } });

    await servico.bloquear(CONVERSA, chamador(ACHADOR));

    const evento = eventos.find((e) => e.action === 'conversation.blocked');
    assert.ok(evento !== undefined, 'o bloqueio precisa aparecer na trilha');
    assert.equal((evento.metadata as { by_role?: string }).by_role, 'finder');
  });

  void it('conversa de TERCEIRO responde 404, e nunca 403', async () => {
    // `conversa: undefined` é o que a consulta vinculada devolve para quem não
    // é parte: a mesma coisa que para uma conversa que nunca existiu. Um 403
    // confirmaria que aquele id existe (ADR-0021).
    const { servico, bloqueios } = bancada({});

    const erro = await capturar(() => servico.bloquear(CONVERSA, chamador(TUTOR)));

    assert.equal(erro.problemType, 'not-found');
    assert.notEqual(erro.status, 403);
    assert.deepEqual(bloqueios, [], 'nada pode ser escrito quando a conversa não é do chamador');
  });

  void it('repetir o bloqueio NÃO recusa: quem se protege não recebe erro', async () => {
    // Bloquear é a ação que a pessoa executa com medo, e o contrato declara
    // `accept_and_deduplicate`. A idempotência de verdade é do `WHERE` da
    // escrita (`blocked_at IS NULL`); esta camada não pode inventar uma recusa.
    const { servico, bloqueios } = bancada({ conversa: { bloqueadaEm: comoData(AGORA) } });

    await servico.bloquear(CONVERSA, chamador(TUTOR));

    assert.equal(bloqueios.length, 1);
  });

  void it('conversa ENCERRADA ainda pode ser bloqueada', async () => {
    // É o que impede a conversa de voltar a aceitar mensagem se o caso for
    // reaberto, e é o registro de que aquela pessoa não é bem-vinda.
    const { servico, bloqueios } = bancada({ conversa: { encerradaEm: comoData(AGORA) } });

    await servico.bloquear(CONVERSA, chamador(TUTOR));

    assert.equal(bloqueios.length, 1);
  });
});

void describe('reportConversation: a denúncia do lado com conta', () => {
  void it('a denúncia entra na fila com o papel de QUEM denuncia', async () => {
    const { servico, denuncias } = bancada({ conversa: { papelDoChamador: 'tutor' } });

    await servico.denunciar(CONVERSA, 'extortion', 'Pediu PIX para devolver.', chamador(TUTOR));

    assert.equal(denuncias.length, 1);
    assert.equal(denuncias[0]?.papel, 'tutor');
    assert.equal(denuncias[0]?.motivo, 'extortion');
    assert.equal(denuncias[0]?.detalhe, 'Pediu PIX para devolver.');
  });

  void it('detalhe vazio ou só com espaço vira `null`, e não string vazia', async () => {
    const { servico, denuncias } = bancada({ conversa: {} });

    await servico.denunciar(CONVERSA, 'harassment', '   ', chamador(TUTOR));

    assert.equal(denuncias[0]?.detalhe, null);
  });

  void it('a denúncia NÃO age sobre o alvo: não bloqueia, não encerra, não retém', async () => {
    const { servico, bloqueios, retencoes, gravadas } = bancada({ conversa: {} });

    await servico.denunciar(CONVERSA, 'extortion', undefined, chamador(TUTOR));

    assert.deepEqual(bloqueios, []);
    assert.deepEqual(retencoes, []);
    // Nem mensagem de sistema: avisar o alvo é ajudar o golpe a se corrigir.
    assert.deepEqual(gravadas, []);
  });

  void it('a trilha guarda o MOTIVO, e nunca o texto da denúncia', async () => {
    // A trilha sobrevive à exclusão da conta. O detalhe é prova para quem
    // modera, e o lugar dele é `conversation_reports`.
    const { servico, eventos } = bancada({ conversa: {} });

    await servico.denunciar(CONVERSA, 'extortion', 'Pediu PIX de 300 reais.', chamador(TUTOR));

    const evento = eventos.find((e) => e.action === 'conversation.reported');
    assert.ok(evento !== undefined, 'a denúncia precisa aparecer na trilha');
    assert.equal((evento.metadata as { reason?: string }).reason, 'extortion');
    assert.doesNotMatch(JSON.stringify(evento.metadata), /PIX|300/);
  });

  void it('conversa de TERCEIRO responde 404, e nada entra na fila', async () => {
    const { servico, denuncias } = bancada({});

    const erro = await capturar(() =>
      servico.denunciar(CONVERSA, 'extortion', undefined, chamador(TUTOR)),
    );

    assert.equal(erro.problemType, 'not-found');
    assert.notEqual(erro.status, 403);
    assert.deepEqual(denuncias, []);
  });

  void it('o alvo do teto é o papel OPOSTO ao de quem denuncia', async () => {
    // É esta dimensão que pega denúncia em laço — muitos denunciantes contra o
    // mesmo alvo, que é o ataque do concorrente. Usar o papel de quem denuncia
    // inverteria a contramedida: ela contaria quantas vezes a VÍTIMA denunciou.
    const doTutor = bancada({ conversa: { papelDoChamador: 'tutor' } });
    const doAchador = bancada({ conversa: { papelDoChamador: 'finder' } });

    assert.equal(
      await doTutor.servico.alvoDaDenuncia(CONVERSA, chamador(TUTOR)),
      `${CONVERSA}:finder`,
    );
    assert.equal(
      await doAchador.servico.alvoDaDenuncia(CONVERSA, chamador(ACHADOR)),
      `${CONVERSA}:tutor`,
    );
  });

  void it('conversa que não é do chamador não conta NINGUÉM no teto', async () => {
    // `undefined` faz `resolverValores` pular a entrada inteira: a recusa dele é
    // o 404 do handler, e não um 429 que esconderia o motivo verdadeiro.
    const { servico } = bancada({});

    assert.equal(await servico.alvoDaDenuncia(CONVERSA, chamador(TUTOR)), undefined);
  });
});
