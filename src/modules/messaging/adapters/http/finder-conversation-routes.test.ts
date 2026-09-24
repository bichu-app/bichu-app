/**
 * As quatro rotas da conversa do achador sem conta, sobre um Fastify de
 * verdade, com o serviço de verdade e o contrato de verdade (BICHUS-41).
 *
 * ## A regra inviolável, e como este arquivo a cobra
 *
 * "Quem acha nunca vê telefone, endereço, e-mail nem id interno do tutor, e o
 * contato é sempre mediado." O repositório daqui é um dublê que **entrega
 * demais de propósito**: cada conversa e cada mensagem que ele devolve vêm com
 * e-mail, telefone, endereço e ids do tutor pendurados, como faria um adaptador
 * que selecionasse colunas a mais. Se o serviço ou a rota passarem a espalhar o
 * objeto em vez de montar a resposta campo a campo, o dado aparece no corpo e
 * os casos de "não vaza" reprovam. A mesma checagem procura QUALQUER UUID no
 * corpo, e não só os que o dublê conhece.
 *
 * ## O token nunca desce em claro
 *
 * O dublê registra todo argumento que recebe, e um caso confere que o token
 * apresentado não aparece em nenhum deles: o que chega à persistência é o
 * resumo.
 *
 * ## A segunda chave
 *
 * Um cenário faz o "banco" devolver a conversa para QUALQUER resumo (o banco
 * que compara errado). A rota precisa responder 403 mesmo assim, porque o
 * serviço compara o resumo gravado com o apresentado em tempo constante.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import {
  criarContadorDesligado,
  criarContadorEmMemoria,
} from '../../../../shared/http/rate-limit.js';
import { hashDeToken } from '../../../../shared/crypto/digest.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { AuditEvent } from '../../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, ConversationId, Instant, OpaqueToken } from '../../../../shared/types/brands.js';
import { ConversaDoAchadorService } from '../../application/conversa-do-achador.js';
import type {
  ConversaDoAchador,
  ConversationRepository,
  MensagemGravada,
  NovaDenuncia,
  NovaMensagem,
} from '../../ports/conversation-repository.js';
import { registrarRotasDoAchador } from './finder-conversation-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-09-23T12:00:00Z') as Instant;

/** O token de verdade tem 43 caracteres de base64url. */
const TOKEN = 'T'.repeat(21) + 'o'.repeat(22);
const OUTRO_TOKEN = 'X'.repeat(43);

const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc' as ConversationId;

/** O que o tutor tem e o achador NUNCA pode ver. */
const DO_TUTOR = {
  userId: '018f3a2b-0000-7000-8000-0000000000aa',
  email: 'leandro.tutor@exemplo.invalid',
  telefone: '+5511987654321',
  telefoneLocal: '11987654321',
  endereco: 'Rua das Acácias, 742',
  cep: '05422-030',
  sobrenome: 'Panegassi',
  caseId: '018f3a2b-0000-7000-8000-00000000ca5e',
  petId: '018f3a2b-0000-7000-8000-000000000be7',
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface Cenario {
  readonly contador?: RateLimitStore;
  readonly bloqueada?: boolean;
  readonly encerrada?: boolean;
  /** O aviso tem mais de 30 dias. */
  readonly tokenVencidoPeloAviso?: boolean;
  readonly caso?: ConversaDoAchador['caso'];
  /** O banco que compara errado: devolve a conversa para qualquer resumo. */
  readonly bancoSemFiltro?: boolean;
  readonly mensagensDoAchadorEm24h?: number;
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly argumentos: unknown[];
  readonly gravadas: NovaMensagem[];
  readonly denuncias: NovaDenuncia[];
  readonly bloqueios: number[];
  readonly retencoes: string[];
  readonly eventos: AuditEvent[];
}

/**
 * A mensagem como um adaptador desatento a devolveria: com o id, a conta de
 * quem mandou e a chave do objeto. Nada disso pode chegar ao achador.
 */
function mensagemComExtras(parcial: Partial<MensagemGravada>): MensagemGravada {
  return {
    id: '018f3a2b-0000-7000-8000-00000000e001',
    senderRole: 'tutor',
    body: 'Oi! Sou o tutor. Onde você está?',
    redactions: [],
    photoObjectKey: `found-reports/${DO_TUTOR.caseId}/original/abc`,
    createdAt: new Date(AGORA - 60_000),
    ...parcial,
    ...{ senderUserId: DO_TUTOR.userId, emailDoRemetente: DO_TUTOR.email },
  };
}

function bancada(cenario: Cenario = {}): Bancada {
  const argumentos: unknown[] = [];
  const gravadas: NovaMensagem[] = [];
  const denuncias: NovaDenuncia[] = [];
  const bloqueios: number[] = [];
  const retencoes: string[] = [];
  const eventos: AuditEvent[] = [];
  const resumoCerto = hashDeToken(TOKEN);

  const conversa = {
    id: CONVERSA,
    petDisplayName: 'Aurora',
    encerradaEm: cenario.encerrada === true ? new Date(AGORA - DIA) : null,
    bloqueadaEm: cenario.bloqueada === true ? new Date(AGORA - DIA) : null,
    nomeDoTutor: `Leandro ${DO_TUTOR.sobrenome}`,
    nomeDoAchador: null,
    resumoDoToken: new Uint8Array(resumoCerto),
    tokenExpiraEm:
      cenario.tokenVencidoPeloAviso === true ? new Date(AGORA - DIA) : new Date(AGORA + 29 * DIA),
    caso: cenario.caso ?? null,
    // O que um adaptador que selecionasse colunas a mais traria junto.
    ...{
      tutorUserId: DO_TUTOR.userId,
      emailDoTutor: DO_TUTOR.email,
      telefoneDoTutor: DO_TUTOR.telefone,
      enderecoDoTutor: `${DO_TUTOR.endereco}, CEP ${DO_TUTOR.cep}`,
      caseId: DO_TUTOR.caseId,
      petId: DO_TUTOR.petId,
    },
  } as ConversaDoAchador;

  const eDoToken = (resumo: Uint8Array): boolean =>
    cenario.bancoSemFiltro === true || Buffer.from(resumo).equals(resumoCerto);

  const historico: MensagemGravada[] = [
    mensagemComExtras({ senderRole: 'system', body: 'Alguém escaneou a plaquinha da Aurora.' }),
    mensagemComExtras({ id: '018f3a2b-0000-7000-8000-00000000e002' }),
    mensagemComExtras({
      id: '018f3a2b-0000-7000-8000-00000000e003',
      body: 'Me chama no [telefone removido].',
      redactions: [{ kind: 'phone', hint: 'telefone' }],
    }),
  ];

  const repositorio: ConversationRepository = {
    buscarPeloTokenDoAchador: (resumo) => {
      argumentos.push(resumo);
      return Promise.resolve(eDoToken(resumo) ? conversa : undefined);
    },
    mensagensPeloTokenDoAchador: (resumo, pagina) => {
      argumentos.push(resumo, pagina);
      if (!eDoToken(resumo)) return Promise.resolve([]);
      return Promise.resolve(historico.slice(pagina.deslocamento, pagina.deslocamento + pagina.limit));
    },
    bloquearPeloAchador: (resumo, agora) => {
      argumentos.push(resumo, agora);
      bloqueios.push(agora);
      return Promise.resolve();
    },
    registrarDenuncia: (denuncia) => {
      argumentos.push(denuncia);
      denuncias.push(denuncia);
      return Promise.resolve();
    },
    gravarMensagem: (mensagem) => {
      argumentos.push(mensagem);
      gravadas.push(mensagem);
      return Promise.resolve(
        mensagemComExtras({
          id: mensagem.id,
          senderRole: mensagem.senderRole,
          body: mensagem.body,
          redactions: mensagem.redactions,
          createdAt: new Date(AGORA),
        }),
      );
    },
    gravarMensagemDeSistema: (mensagem) => {
      argumentos.push(mensagem);
      gravadas.push({ ...mensagem, senderRole: 'system', senderUserId: null });
      return Promise.resolve(mensagemComExtras({ id: mensagem.id, senderRole: 'system', body: mensagem.body }));
    },
    contarMensagensDoParticipante: (conversaId, papel, desde) => {
      argumentos.push(conversaId, papel, desde);
      return Promise.resolve(cenario.mensagensDoAchadorEm24h ?? 1);
    },
    reterParaRevisao: (conversaId, motivo) => {
      argumentos.push(conversaId, motivo);
      retencoes.push(motivo);
      return Promise.resolve();
    },
    // O lado com conta não é exercido por estas rotas.
    abrirPorAviso: () => Promise.reject(new Error('fora desta bancada')),
    porAviso: () => Promise.reject(new Error('fora desta bancada')),
    listarDoChamador: () => Promise.reject(new Error('fora desta bancada')),
    buscarDoChamador: () => Promise.reject(new Error('fora desta bancada')),
    mensagens: () => Promise.reject(new Error('fora desta bancada')),
    contarCasosDistintosDaConta: () => Promise.reject(new Error('o token não tem série de casos')),
  };

  let sequencia = 0;
  const ids: IdGenerator = {
    uuidv7: () => `018f3a2b-0000-7000-8000-0000000${String(10_000 + (sequencia += 1))}`,
    opaqueToken: () => 'nao-usado' as OpaqueToken,
    random128: () => new Uint8Array(16),
    random80: () => new Uint8Array(10),
  };
  const clock: Clock = { now: () => AGORA };

  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(cenario.contador ?? criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });
  registrarRotasDoAchador(app, {
    conversas: new ConversaDoAchadorService({
      repositorio,
      ids,
      clock,
      trilha: {
        record: (evento) => {
          eventos.push(evento);
          return Promise.resolve();
        },
      },
    }),
    // O contrato DE VERDADE: é dele que sai o schema do corpo.
    contrato: carregarContrato('api/openapi.yaml'),
    idempotencia: {
      reservar: () => Promise.resolve(undefined),
      concluir: () => Promise.resolve(),
      liberar: () => Promise.resolve(),
    },
    clock,
  });

  return { app, argumentos, gravadas, denuncias, bloqueios, retencoes, eventos };
}

interface Resposta {
  readonly status: number;
  readonly corpo: Record<string, unknown>;
  readonly bruto: string;
}

async function pedir(
  app: RegistradorDeRotas,
  opcoes: { metodo?: 'GET' | 'POST'; url: string; token?: string | null; corpo?: unknown },
): Promise<Resposta> {
  const token = opcoes.token === undefined ? TOKEN : opcoes.token;
  const base = {
    method: opcoes.metodo ?? 'GET',
    url: opcoes.url,
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
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

/** As propriedades que o contrato declara para um schema, lidas do YAML. */
function propriedadesDoContrato(nome: string): Set<string> {
  const spec = parseYaml(readFileSync('api/openapi.yaml', 'utf8')) as {
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  const schema = spec.components.schemas[nome];
  assert.ok(schema?.properties !== undefined, `o contrato não declara ${nome}`);
  return new Set(Object.keys(schema.properties));
}

/**
 * **A checagem de não-vazamento.** Reprova quando o corpo carrega qualquer dado
 * de contato do tutor, o sobrenome, qualquer UUID (conhecido ou não), ou uma
 * chave de identificador.
 *
 * `correlation_id` sai do corpo de problema antes da busca por UUID: é o
 * identificador da requisição (v4, aleatório), não um registro do banco, e o
 * contrato o declara em `Problem`.
 */
function exigirQueNaoVaza(resposta: Resposta, onde: string): void {
  const bruto = resposta.bruto;
  for (const proibido of [
    DO_TUTOR.email,
    DO_TUTOR.telefone,
    DO_TUTOR.telefoneLocal,
    '98765-4321',
    DO_TUTOR.endereco,
    DO_TUTOR.cep,
    DO_TUTOR.sobrenome,
    'found-reports/',
  ]) {
    assert.ok(!bruto.includes(proibido), `${onde}: \`${proibido}\` vazou para o achador: ${bruto}`);
  }
  const semCorrelacao = { ...resposta.corpo };
  delete semCorrelacao['correlation_id'];
  const texto = JSON.stringify(semCorrelacao);
  assert.doesNotMatch(texto, UUID, `${onde}: um UUID interno saiu para o achador: ${texto}`);
  for (const chave of ['"id"', '"case_id"', '"pet_id"', '"user_id"', '"tutor_user_id"', '"email"', '"phone"']) {
    assert.ok(!texto.includes(`${chave}:`), `${onde}: a chave ${chave} saiu para o achador: ${texto}`);
  }
}

void describe('getFinderConversation: a conversa pelo token, e só o que o contrato declara', () => {
  void it('200 com `FinderConversation` exato: sem id, sem case_id, participantes com dois campos', async () => {
    const { app } = bancada();
    const resposta = await pedir(app, { url: '/finder/conversation' });
    await app.close();

    assert.equal(resposta.status, 200);
    const declaradas = propriedadesDoContrato('FinderConversation');
    for (const chave of Object.keys(resposta.corpo)) {
      assert.ok(declaradas.has(chave), `\`${chave}\` não está em FinderConversation`);
    }
    assert.equal(resposta.corpo['pet_display_name'], 'Aurora');
    assert.equal(resposta.corpo['status'], 'open');
    assert.deepEqual(resposta.corpo['participants'], [
      { role: 'tutor', display_name: 'Leandro' },
      { role: 'finder', display_name: 'Quem achou' },
    ]);

    const daMensagem = propriedadesDoContrato('FinderMessage');
    const mensagens = resposta.corpo['messages'] as Record<string, unknown>[];
    assert.equal(mensagens.length, 3);
    for (const mensagem of mensagens) {
      for (const chave of Object.keys(mensagem)) {
        assert.ok(daMensagem.has(chave), `\`${chave}\` não está em FinderMessage`);
      }
    }
  });

  void it('NÃO VAZA: nem contato, nem sobrenome, nem id do tutor, nem UUID nenhum', async () => {
    const { app } = bancada();
    const resposta = await pedir(app, { url: '/finder/conversation' });
    await app.close();
    exigirQueNaoVaza(resposta, 'GET /finder/conversation');
  });

  void it('o cursor da próxima página é a posição, sem UUID dentro', async () => {
    const { app } = bancada();
    const primeira = await pedir(app, { url: '/finder/conversation?limit=2' });
    const cursor = primeira.corpo['next_cursor'];
    assert.equal(typeof cursor, 'string');
    assert.doesNotMatch(Buffer.from(cursor as string, 'base64url').toString('utf8'), UUID);

    const segunda = await pedir(app, {
      url: `/finder/conversation?limit=2&cursor=${encodeURIComponent(cursor as string)}`,
    });
    await app.close();
    const corpos = (segunda.corpo['messages'] as { body: string }[]).map((m) => m.body);
    assert.deepEqual(corpos, ['Me chama no [telefone removido].']);
    assert.equal(segunda.corpo['next_cursor'], null);
  });

  void it('com o caso encerrado e o token ainda válido: 200 em modo leitura, `closed`', async () => {
    const { app } = bancada({
      caso: { aberto: false, encerradoEm: new Date(AGORA - DIA), desfecho: 'reunited' },
    });
    const resposta = await pedir(app, { url: '/finder/conversation' });
    await app.close();
    assert.equal(resposta.status, 200);
    assert.equal(resposta.corpo['status'], 'closed');
  });

  void it('com o caso ABERTO, o token vale depois dos 30 dias do aviso', async () => {
    const { app } = bancada({
      tokenVencidoPeloAviso: true,
      caso: { aberto: true, encerradoEm: null, desfecho: null },
    });
    const resposta = await pedir(app, { url: '/finder/conversation' });
    await app.close();
    assert.equal(resposta.status, 200);
  });

  void it('token vencido: 410 `conversation-closed`, com o desfecho no texto', async () => {
    const { app } = bancada({
      tokenVencidoPeloAviso: true,
      caso: { aberto: false, encerradoEm: new Date(AGORA - 40 * DIA), desfecho: 'reunited' },
    });
    const resposta = await pedir(app, { url: '/finder/conversation' });
    await app.close();
    assert.equal(resposta.status, 410);
    assert.equal(tipoDe(resposta.corpo), 'conversation-closed');
    assert.match(String(resposta.corpo['detail']), /Aurora voltou para casa/);
    exigirQueNaoVaza(resposta, '410 do token vencido');
  });
});

void describe('o token: 403 idêntico para ausente, malformado, desconhecido e que não confere', () => {
  void it('os quatro casos respondem o mesmo 403 `forbidden`', async () => {
    const casos: { rotulo: string; token: string | null; cenario?: Cenario }[] = [
      { rotulo: 'ausente', token: null },
      { rotulo: 'malformado', token: 'curto' },
      { rotulo: 'desconhecido', token: OUTRO_TOKEN },
      // O banco que compara errado devolve a conversa para o token de outra
      // pessoa. A segunda chave, em tempo constante, é quem recusa.
      { rotulo: 'que não confere', token: OUTRO_TOKEN, cenario: { bancoSemFiltro: true } },
    ];
    const titulos = new Set<string>();
    for (const caso of casos) {
      const { app } = bancada(caso.cenario);
      const resposta = await pedir(app, { url: '/finder/conversation', token: caso.token });
      await app.close();
      assert.equal(resposta.status, 403, `token ${caso.rotulo}: ${resposta.bruto}`);
      assert.equal(tipoDe(resposta.corpo), 'forbidden', `token ${caso.rotulo}`);
      titulos.add(`${String(resposta.corpo['title'])}|${String(resposta.corpo['detail'])}`);
      exigirQueNaoVaza(resposta, `403 do token ${caso.rotulo}`);
    }
    assert.equal(titulos.size, 1, 'os quatro 403 são distinguíveis pelo texto');
  });

  void it('o token em claro nunca chega à persistência: só o resumo', async () => {
    const bancadaDoCaso = bancada();
    const { app, argumentos } = bancadaDoCaso;
    await pedir(app, { url: '/finder/conversation' });
    await pedir(app, { metodo: 'POST', url: '/finder/conversation/messages', corpo: { body: 'Oi' } });
    await pedir(app, { metodo: 'POST', url: '/finder/conversation/block' });
    await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/report',
      corpo: { reason: 'spam' },
    });
    await app.close();

    assert.ok(argumentos.length > 0, 'o dublê não registrou argumento nenhum: o caso não mediu nada');
    const tudo = JSON.stringify(argumentos, (_chave, valor: unknown) =>
      valor instanceof Uint8Array ? Buffer.from(valor).toString('utf8') : valor,
    );
    assert.ok(!tudo.includes(TOKEN), 'o token em claro chegou ao repositório');
    assert.ok(
      argumentos.some((a) => a instanceof Uint8Array && Buffer.from(a).equals(hashDeToken(TOKEN))),
      'o resumo do token não chegou ao repositório: a consulta não está filtrando por ele',
    );
  });
});

void describe('postFinderMessage: canal mediado, redigido nos dois sentidos', () => {
  void it('201 com `FinderMessage` exato, e o telefone do achador retirado antes de gravar', async () => {
    const { app, gravadas } = bancada();
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/messages',
      corpo: { body: 'Estou com ela! Me liga 11 99876-5432 ou achador@exemplo.invalid' },
    });
    await app.close();

    assert.equal(resposta.status, 201);
    const declaradas = propriedadesDoContrato('FinderMessage');
    for (const chave of Object.keys(resposta.corpo)) {
      assert.ok(declaradas.has(chave), `\`${chave}\` não está em FinderMessage`);
    }
    assert.equal(resposta.corpo['sender_role'], 'finder');
    assert.ok(!resposta.bruto.includes('99876-5432'), 'o telefone voltou na resposta');
    assert.ok(!resposta.bruto.includes('achador@exemplo.invalid'), 'o e-mail voltou na resposta');
    const tipos = (resposta.corpo['redactions'] as { kind: string }[]).map((r) => r.kind).sort();
    assert.deepEqual(tipos, ['email', 'phone']);

    const doAchador = gravadas.find((g) => g.senderRole === 'finder');
    assert.ok(doAchador !== undefined);
    assert.ok(!doAchador.body.includes('99876-5432'), 'o telefone foi gravado em claro');
    assert.equal(doAchador.senderUserId, null, 'quem escreve pelo token não é afirmado como conta');
    assert.ok(
      gravadas.some((g) => g.senderRole === 'system'),
      'o aviso do sistema sobre o dado retirado não foi gravado',
    );
    exigirQueNaoVaza(resposta, 'POST /finder/conversation/messages');
  });

  void it('conversa bloqueada ou encerrada: 410 `conversation-closed`, a mesma resposta', async () => {
    const corpos: string[] = [];
    for (const cenario of [{ bloqueada: true }, { encerrada: true }]) {
      const { app, gravadas } = bancada(cenario);
      const resposta = await pedir(app, {
        metodo: 'POST',
        url: '/finder/conversation/messages',
        corpo: { body: 'Oi' },
      });
      await app.close();
      assert.equal(resposta.status, 410);
      assert.equal(tipoDe(resposta.corpo), 'conversation-closed');
      assert.equal(gravadas.length, 0);
      corpos.push(`${String(resposta.corpo['title'])}|${String(resposta.corpo['detail'])}`);
    }
    // Distinguir contaria a quem escreve que o tutor o bloqueou.
    assert.equal(corpos[0], corpos[1]);
  });

  void it('INVARIANTE 1: a 201ª mensagem em 24 h é GRAVADA, e a conversa é retida em silêncio', async () => {
    // `hold_for_review` não é recusa: nada que o achador manda ao tutor é
    // descartado por limite. Recusar avisaria o golpista de que foi marcado.
    const { app, gravadas, retencoes } = bancada({ mensagensDoAchadorEm24h: 201 });
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/messages',
      corpo: { body: 'Ainda estou aqui com ela.' },
    });
    await app.close();
    assert.equal(resposta.status, 201);
    assert.equal(gravadas.length, 1);
    assert.deepEqual(retencoes, ['message_volume']);
    assert.ok(!resposta.bruto.includes('review'), 'a resposta avisou o remetente da retenção');
  });

  void it('a 31ª mensagem da hora é recusada com 429 e `Retry-After`', async () => {
    const { app } = bancada();
    for (let i = 0; i < 30; i += 1) {
      const ok = await pedir(app, {
        metodo: 'POST',
        url: '/finder/conversation/messages',
        corpo: { body: `mensagem ${String(i)}` },
      });
      assert.equal(ok.status, 201, `a ${String(i + 1)}ª foi recusada cedo demais`);
    }
    const estourou = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/messages',
      corpo: { body: 'a trigésima primeira' },
    });
    await app.close();
    assert.equal(estourou.status, 429);
    assert.equal(tipoDe(estourou.corpo), 'rate-limited');
  });

  void it('ISCA: com o contador desligado, a 31ª passa, e o caso acima reprovaria', async () => {
    const { app } = bancada({ contador: criarContadorDesligado() });
    for (let i = 0; i < 30; i += 1) {
      await pedir(app, { metodo: 'POST', url: '/finder/conversation/messages', corpo: { body: 'x' } });
    }
    const trigesimaPrimeira = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/messages',
      corpo: { body: 'x' },
    });
    await app.close();
    assert.equal(trigesimaPrimeira.status, 201);
  });

  void it('o teto é por TOKEN: estourar num não cala o achador de outra conversa', async () => {
    const contador = criarContadorEmMemoria(() => AGORA);
    const { app } = bancada({ contador });
    for (let i = 0; i <= 30; i += 1) {
      await pedir(app, { metodo: 'POST', url: '/finder/conversation/messages', corpo: { body: 'x' } });
    }
    await app.close();
    // Mesmo contador, outro token: o balde é outro. O token é desconhecido
    // desta bancada, então a resposta é o 403 do handler, e não um 429.
    const { app: outra } = bancada({ contador });
    const resposta = await pedir(outra, {
      metodo: 'POST',
      url: '/finder/conversation/messages',
      token: OUTRO_TOKEN,
      corpo: { body: 'x' },
    });
    await outra.close();
    assert.equal(resposta.status, 403);
  });
});

void describe('blockFinderConversation e reportFinderConversation', () => {
  void it('bloquear responde 204 sem corpo, e a trilha registra o papel e não a pessoa', async () => {
    const { app, bloqueios, eventos } = bancada();
    const resposta = await pedir(app, { metodo: 'POST', url: '/finder/conversation/block' });
    await app.close();
    assert.equal(resposta.status, 204);
    assert.equal(resposta.bruto, '');
    assert.equal(bloqueios.length, 1);
    const evento = eventos.find((e) => e.action === 'conversation.blocked');
    assert.equal(evento?.actorKind, 'anonymous');
    assert.deepEqual(evento?.metadata, { by_role: 'finder' });
  });

  void it('denunciar responde 202 `{ status: accepted }`, vai para a fila e não age sobre o alvo', async () => {
    const { app, denuncias, bloqueios, eventos } = bancada();
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/report',
      corpo: { reason: 'extortion', detail: 'Pediu PIX para devolver.' },
    });
    await app.close();
    assert.equal(resposta.status, 202);
    assert.deepEqual(resposta.corpo, { status: 'accepted' });
    assert.equal(denuncias.length, 1);
    assert.equal(denuncias[0]?.papel, 'finder');
    assert.equal(denuncias[0]?.motivo, 'extortion');
    assert.equal(bloqueios.length, 0, 'a denúncia agiu sobre o alvo');
    const evento = eventos.find((e) => e.action === 'conversation.reported');
    assert.ok(
      !JSON.stringify(evento).includes('PIX'),
      'o texto da denúncia entrou na trilha, que sobrevive à exclusão da conta',
    );
  });

  void it('motivo fora da lista é recusado pelo schema do contrato', async () => {
    const { app, denuncias } = bancada();
    const resposta = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/report',
      corpo: { reason: 'nao-existe' },
    });
    await app.close();
    assert.equal(resposta.status, 400);
    assert.equal(denuncias.length, 0);
  });

  void it('token vencido: bloquear e denunciar respondem 403, que é o que o contrato declara', async () => {
    const { app, bloqueios, denuncias } = bancada({ tokenVencidoPeloAviso: true });
    const bloqueio = await pedir(app, { metodo: 'POST', url: '/finder/conversation/block' });
    const denuncia = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/report',
      corpo: { reason: 'spam' },
    });
    await app.close();
    assert.equal(bloqueio.status, 403);
    assert.equal(denuncia.status, 403);
    assert.equal(bloqueios.length + denuncias.length, 0);
  });

  void it('sem token, bloquear e denunciar respondem 403 e não tocam nada', async () => {
    const { app, bloqueios, denuncias } = bancada();
    const bloqueio = await pedir(app, { metodo: 'POST', url: '/finder/conversation/block', token: null });
    const denuncia = await pedir(app, {
      metodo: 'POST',
      url: '/finder/conversation/report',
      token: null,
      corpo: { reason: 'spam' },
    });
    await app.close();
    assert.equal(bloqueio.status, 403);
    assert.equal(denuncia.status, 403);
    assert.equal(bloqueios.length + denuncias.length, 0);
  });
});
