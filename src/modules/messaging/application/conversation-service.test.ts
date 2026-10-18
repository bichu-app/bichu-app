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
import { selarContador, TETO_DA_PREVIA } from '../domain/conversa-mediada.js';
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
  /** BICHUS-278: o que `contarParaOSino` devolve. */
  readonly naoLidasNoSino?: number | undefined;
}

function conversaAberta(parcial: Partial<ConversaDoChamador> = {}): ConversaDoChamador {
  return {
    id: CONVERSA,
    caseId: null,
    petDisplayName: 'Aurora',
    abertaEm: comoData(AGORA),
    papelDoChamador: 'tutor',
    tutorDesabilitado: false,
    achadorDesabilitado: false,
    encerradaEm: null,
    motivoDoEncerramento: null,
    bloqueadaEm: null,
    casoEncerrado: false,
    nomeDoTutor: 'Leandro Panegassi',
    nomeDoAchador: 'Ana Paula Ribeiro',
    // BICHUS-278. O padrao e "lida e sem mensagem": o caso que fala de leitura
    // passa o que precisa por `parcial`, e os outros nao mudam de significado.
    naoLida: false,
    corpoDaUltima: null,
    ultimaMensagemEm: null,
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
  const listasVistas: { chamador: UserId; agora: Instant }[] = [];
  const conversasLidas: { conversa: ConversationId; chamador: UserId; agora: Instant }[] = [];

  const conversa = estado.conversa === undefined ? undefined : conversaAberta(estado.conversa);

  const repositorio: ConversationRepository = {
    abrirPorAviso: (abertura) => {
      aberturas.push(abertura);
      return Promise.resolve();
    },
    porAviso: () => Promise.resolve(estado.conversaDoAviso ?? CONVERSA),
    // BICHUS-278. Os tres sao REGISTRADORES e nao no-ops: os casos de leitura
    // conferem que `buscar` marca o item e que `listar` NAO marca nada.
    contarParaOSino: () => Promise.resolve(estado.naoLidasNoSino ?? 0),
    marcarListaVista: (chamador, agora) => {
      listasVistas.push({ chamador, agora });
      return Promise.resolve();
    },
    marcarConversaLida: (conversa_, chamador, agora) => {
      conversasLidas.push({ conversa: conversa_, chamador, agora });
      return Promise.resolve();
    },
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
    listasVistas,
    conversasLidas,
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

  /**
   * ISCA DO ENVIO TRAVADO, lado COM CONTA (17/10).
   *
   * O cliente pediu "bloquear o chat para não enviar ou receber mais nenhuma
   * nova mensagem". Aqui quem escreve é o participante que FICOU -- o outro não
   * consegue nem entrar, porque `autenticar()` recusa `status != 'active'`. Então
   * é este caso, e não um do lado que saiu, que implementa o "não receber".
   *
   * Isca a rodar (não rodada nesta branch): tirar
   * `participanteDesabilitado: ...` de `sinaisDe` deve reprovar os dois casos
   * abaixo; trocar o `||` por `&&` reprova os dois também.
   */
  void it('ISCA: tutor desabilitado trava o envio do OUTRO lado, com 410', async () => {
    const { servico, gravadas } = bancada({ conversa: { tutorDesabilitado: true } });
    await assert.rejects(
      () => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)),
      (erro: unknown) => {
        assert.ok(erro instanceof AppError);
        // 410 `conversation-closed`, e NÃO 403: a conversa EXISTE para quem
        // escreve, e o que mudou é o estado dela, não a autorização. E não 404
        // porque o ADR-0021 manda 404 para o que não deve existir -- esta
        // conversa deve existir, em modo leitura, para o lado que ficou.
        //
        // O tipo é o MESMO de encerrada e bloqueada, de propósito: um tipo
        // próprio tipo `participant-disabled` contaria a quem escreve o que
        // aconteceu com a conta da outra pessoa.
        assert.equal(erro.problemType, 'conversation-closed');
        return true;
      },
    );
    assert.deepEqual(gravadas, [], 'gravou mensagem numa conversa de conta desabilitada');
  });

  void it('ISCA: achador com conta desabilitada trava o envio igual', async () => {
    const { servico, gravadas } = bancada({ conversa: { achadorDesabilitado: true } });
    await assert.rejects(() => servico.enviar(CONVERSA, 'oi', chamador(TUTOR)));
    assert.deepEqual(gravadas, []);
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
      especie: 'scan_notice',
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
      especie: 'scan_notice',
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

// ===========================================================================
// BICHUS-278 — A LEITURA: "lido" é o ITEM ABERTO, não a lista vista.
//
// A exceção do aviso de plaquinha vive no SQL de `contarParaOSino` (pelo
// `system_kind`) e é exercitada contra o banco de verdade; o que estes casos
// pegam é a outra metade, que nenhum SQL pega: que `listar` **não** marca nada
// e que `buscar` marca.
// ===========================================================================

void describe('BICHUS-278 — abrir a lista NÃO é abrir as conversas', () => {
  void it('ISCA: `listar` não marca conversa nenhuma como lida', async () => {
    const { servico, conversasLidas } = bancada({
      conversa: { papelDoChamador: 'tutor', naoLida: true },
    });
    await servico.listar(chamador(TUTOR), PAGINA);
    assert.deepEqual(
      conversasLidas,
      [],
      'listar marcou conversa como lida; isso apaga a única pista de QUAL conversa guarda o recado',
    );
  });

  void it('ISCA: `listar` também não marca a LISTA como vista', async () => {
    // Zerar o contador é uma escrita com rota própria
    // (`markMyConversationsSeen`). Pendurá-la no GET faria um `Atualizar`, ou
    // um pré-carregamento, apagar o sino sem a pessoa ter olhado nada.
    const { servico, listasVistas } = bancada({ conversa: {} });
    await servico.listar(chamador(TUTOR), PAGINA);
    assert.deepEqual(listasVistas, [], 'o GET da lista zerou o contador');
  });

  void it('o contador da página vem do repositório, e não da contagem dos itens', async () => {
    // 23 no sino e UMA conversa na página: é o que acontece com quem tem 57 e
    // vê 20. Somar a página mostraria 1.
    const { servico } = bancada({
      conversa: { naoLida: true },
      naoLidasNoSino: 23,
    });
    const pagina = await servico.listar(chamador(TUTOR), PAGINA);
    assert.equal(pagina.naoLidas, 23, 'o contador não veio do repositório');
    assert.equal(pagina.items.length, 1);
  });

  void it('ISCA: `buscar` MARCA a conversa como lida — abrir o item é o que significa "lido"', async () => {
    const { servico, conversasLidas } = bancada({
      conversa: { papelDoChamador: 'tutor', naoLida: true },
    });
    await servico.buscar(CONVERSA, chamador(TUTOR), PAGINA);
    assert.equal(conversasLidas.length, 1, 'abrir a conversa não marcou nada como lido');
    assert.equal(conversasLidas[0]?.conversa, CONVERSA);
    assert.equal(conversasLidas[0]?.chamador, TUTOR, 'marcou a leitura de outra conta');
  });

  void it('ISCA: paginar para TRÁS não marca como lida', async () => {
    // Pedir mensagens antigas é a pessoa procurando o que já leu; marcar ali
    // zeraria o contador sem ela ter visto a mensagem NOVA, que é o topo.
    const { servico, conversasLidas } = bancada({ conversa: {} });
    await servico.buscar(CONVERSA, chamador(TUTOR), {
      limit: 20,
      depoisDe: { criadaEm: comoData(AGORA), id: 'm-1' },
    });
    assert.deepEqual(
      conversasLidas,
      [],
      'paginar para trás marcou como lida; o contador zeraria sem a pessoa ver a mensagem nova',
    );
  });

  void it('`marcarListaVista` do serviço zera o contador e NÃO toca em item', async () => {
    const { servico, listasVistas, conversasLidas } = bancada({ conversa: {} });
    await servico.marcarListaVista(chamador(TUTOR));
    assert.equal(listasVistas.length, 1, 'não marcou a lista como vista');
    assert.equal(listasVistas[0]?.chamador, TUTOR);
    assert.deepEqual(
      conversasLidas,
      [],
      'marcar a lista como vista marcou itens como lidos — é exatamente o defeito que a regra proíbe',
    );
  });

  void it('conversa de TERCEIRO responde 404 e não grava leitura nenhuma', async () => {
    // A escrita acontece depois da leitura vinculada, e por isso ela não é um
    // oráculo: sem conversa, nada é marcado.
    const { servico, conversasLidas } = bancada({});
    await assert.rejects(() => servico.buscar(CONVERSA, chamador(TUTOR), PAGINA));
    assert.deepEqual(conversasLidas, [], 'gravou leitura de uma conversa que não é do chamador');
  });
});

void describe('BICHUS-278 — a prévia não desfaz a redação', () => {
  void it('a prévia sai do corpo JÁ REDIGIDO, com o marcador no lugar do telefone', async () => {
    const { servico } = bancada({
      conversa: {
        // É este o valor que o banco guarda: o telefone já saiu.
        corpoDaUltima: 'me liga no [telefone removido] que eu levo',
        ultimaMensagemEm: comoData(AGORA),
      },
    });
    const pagina = await servico.listar(chamador(TUTOR), PAGINA);
    const previa = pagina.items[0]?.previaDaUltima ?? '';
    assert.match(previa, /\[telefone removido\]/u);
    assert.doesNotMatch(previa, /\d{4,}/u, 'a prévia trouxe de volta uma sequência de dígitos');
  });

  void it('ISCA: a prévia é CORTADA, e o corte não devolve o corpo inteiro', async () => {
    const longo = `${'a'.repeat(400)} FIM`;
    const { servico } = bancada({ conversa: { corpoDaUltima: longo } });
    const pagina = await servico.listar(chamador(TUTOR), PAGINA);
    const previa = pagina.items[0]?.previaDaUltima ?? '';
    assert.ok(previa.length <= TETO_DA_PREVIA, `prévia com ${previa.length} caracteres`);
    assert.doesNotMatch(previa, /FIM/u, 'a prévia trouxe o fim de um corpo de 400 caracteres');
  });

  void it('CONTRAPESO: conversa sem mensagem devolve prévia NULA, e não string vazia', async () => {
    // Sem este contrapeso, uma função que devolvesse sempre `''` passaria nos
    // dois casos acima.
    const { servico } = bancada({ conversa: { corpoDaUltima: null } });
    const pagina = await servico.listar(chamador(TUTOR), PAGINA);
    assert.equal(pagina.items[0]?.previaDaUltima, null);
    assert.equal(pagina.items[0]?.ultimaMensagemEm, null);
  });

  void it('`selarContador` corta em 9+, e zero não desenha nada', () => {
    assert.equal(selarContador(0), null, 'zero virou selo; um `0` pintado chama o olho para nada');
    assert.equal(selarContador(-3), null);
    assert.equal(selarContador(1), '1');
    assert.equal(selarContador(9), '9');
    assert.equal(selarContador(10), '9+');
    assert.equal(selarContador(237), '9+', 'três dígitos comem o espaço do título na barra');
  });
});

void describe('BICHUS-278 — a espécie do aviso chega ao banco', () => {
  void it('ISCA: a mensagem de abertura é gravada COM a espécie do aviso', async () => {
    // É esta marca que faz o aviso de plaquinha sobreviver a uma passada de
    // olho na lista. Sem ela, o recado sai do contador e ninguém sabe por quê.
    const { servico, gravadas } = bancada({ conversa: {} });
    await servico.abrirPorAviso({
      foundReportId: AVISO,
      petId: PET,
      nomeDoPet: 'Aurora',
      escaneadoEm: AGORA,
      rotuloDaArea: 'Centro',
      recado: 'está comigo',
      achadorComConta: null,
      avisoAnteriorId: null,
      especie: 'scan_notice',
    });
    const abertura = gravadas.at(-1) as { especie?: string } | undefined;
    assert.equal(abertura?.especie, 'scan_notice', 'a abertura foi gravada sem espécie');
  });

  void it('ISCA: o achado confirmado grava `found_notice`, e não `scan_notice`', async () => {
    const { servico, gravadas } = bancada({ conversa: {} });
    await servico.abrirPorAviso({
      foundReportId: AVISO,
      petId: PET,
      nomeDoPet: 'Aurora',
      escaneadoEm: AGORA,
      rotuloDaArea: null,
      recado: null,
      achadorComConta: null,
      avisoAnteriorId: null,
      especie: 'found_notice',
    });
    const abertura = gravadas.at(-1) as { especie?: string } | undefined;
    assert.equal(abertura?.especie, 'found_notice');
  });

  void it('CONTRAPESO: o aviso de dado retirado é `redaction_warning`, e NÃO aviso', async () => {
    // Marcá-lo como aviso deixaria o sino de quem escreveu o telefone aceso
    // por uma frase que ele acabou de ler na própria tela.
    const { servico, gravadas } = bancada({
      conversa: { papelDoChamador: 'tutor' },
    });
    await servico.enviar(CONVERSA, 'me liga no 11 98765-4321', chamador(TUTOR));
    const sistema = gravadas.find(
      (m) => (m as { senderRole?: string }).senderRole === 'system',
    ) as { especie?: string } | undefined;
    assert.equal(
      sistema?.especie,
      'redaction_warning',
      'o aviso de dado retirado foi marcado como aviso de plaquinha/achado',
    );
  });
});
