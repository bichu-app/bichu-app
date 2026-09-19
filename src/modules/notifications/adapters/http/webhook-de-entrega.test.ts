/**
 * `POST /webhooks/postmark` sobre um Fastify de verdade (BICHUS-13, critérios
 * 7 e 9).
 *
 * Por que este arquivo sobe servidor em vez de chamar o handler direto: o que
 * está sob teste aqui é **a borda da aplicação**, e metade do que ela promete
 * só existe quando o Fastify está no caminho — a validação do corpo contra o
 * schema do contrato, o formato `application/problem+json` do 401, o 204 sem
 * corpo. Chamar a função direto provaria a parte fácil e deixaria de fora tudo
 * o que um chamador de fora enxerga.
 *
 * `carregarContrato('api/openapi.yaml')` é o contrato DE VERDADE, e não um
 * dobre: é ele que decide o schema do corpo, e usar uma cópia aqui faria o
 * teste continuar verde no dia em que a especificação mudasse.
 *
 * ## As iscas deste arquivo
 *
 * Duas são automáticas e estão marcadas com `ISCA` no nome do caso: elas exigem
 * o defeito de volta, e falham se a defesa deixar de ser necessária.
 *
 * A terceira foi conferida à mão, porque desligá-la exige editar o código sob
 * teste e não uma dependência (procedimento igual ao de
 * `rotas-de-descoberta.test.ts`): trocar `iguaisEmTempoConstante` por `===` em
 * `conferirAssinatura` mantém TODOS os casos deste arquivo verdes — o que é
 * exatamente o ponto, porque tempo constante não muda resultado, só muda quanto
 * o resultado demora a sair. Nenhum teste de igualdade pega isso; quem pega é a
 * revisão, e é por isso que o `===` está proibido por escrito no comentário da
 * função e o segredo chega como `Buffer` em vez de `string`. Já desligar a
 * chamada de `conferirAssinatura` faz **7 casos** reprovarem de uma vez (os
 * seis de autenticação mais "corpo inválido com assinatura ERRADA responde
 * 401") — conferido em 19/09, e `webhook-de-entrega.ts` restaurado da cópia
 * própria com o SHA-256 conferido
 * (`7b07ad2740160ce7dd44e3f6abdf61249b37e37ce3ee0f05823fde29999bcff9`).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { AbsoluteUrl } from '../../../../shared/types/brands.js';
import { registrarRotaDoWebhookDeEntrega } from './webhook-de-entrega.js';
import type { EventoParaGravar, RegistroDeEntregas } from '../../ports/registro-de-entregas.js';

/**
 * 32 bytes, que é o piso que `app-config.ts` impõe. O valor é descartável; o
 * que importa é o tamanho, porque um segredo curto passaria aqui e reprovaria
 * na subida de verdade.
 */
const SEGREDO = 'segredo-de-teste-com-32-bytes!!!';
const TUTOR = 'tutor@exemplo.invalid';

/** Nada de `localhost` nesta bancada: o portão de portabilidade varre `src/`. */
const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;

interface Bancada {
  readonly app: FastifyInstance;
  readonly gravados: EventoParaGravar[];
  readonly suprimidos: string[];
  /** Só o que a NOSSA rota mandou para o log. Ver `ehLogDoFastify`. */
  readonly logs: unknown[];
}

function subirApp(opcoes: { segredoDoServidor?: string } = {}): Bancada {
  const gravados: EventoParaGravar[] = [];
  const suprimidos: string[] = [];
  const logs: unknown[] = [];
  const vistos = new Set<string>();

  const registro: RegistroDeEntregas = {
    registrar(evento) {
      const chave = JSON.stringify([evento.messageId, evento.recordType]);
      if (vistos.has(chave)) return Promise.resolve(false);
      vistos.add(chave);
      gravados.push(evento);
      return Promise.resolve(true);
    },
    marcarEnderecoNaoEntregavel(endereco) {
      suprimidos.push(endereco);
      return Promise.resolve(true);
    },
  };

  const app = criarServidor({ problemBaseUrl: BASE_DE_PROBLEMA, isProduction: false });

  app.addHook('onRequest', (request, _reply, pronto) => {
    for (const nivel of ['info', 'warn', 'error'] as const) {
      const original = request.log[nivel].bind(request.log);
      request.log[nivel] = (dados: unknown, mensagem?: string) => {
        if (!ehLogDoFastify(dados)) logs.push(dados);
        original(dados, mensagem);
      };
    }
    pronto();
  });

  registrarRotaDoWebhookDeEntrega(app, {
    registro,
    segredo: Buffer.from(opcoes.segredoDoServidor ?? SEGREDO, 'utf8'),
    contrato: carregarContrato('api/openapi.yaml'),
  });

  return { app, gravados, suprimidos, logs };
}

/** O mesmo corpo sem um dos campos, para exercitar o que o contrato torna opcional. */
function semACchave(corpo: Record<string, unknown>, chave: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(corpo).filter(([nome]) => nome !== chave));
}

function devolucao(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    RecordType: 'Bounce',
    MessageID: 'mensagem-1',
    Recipient: TUTOR,
    Type: 'HardBounce',
    Description: 'A caixa nao existe',
    DeliveredAt: '2026-09-19T12:00:00.000Z',
    ...extra,
  };
}

/**
 * Executa a chamada registrando o que **a nossa rota** manda para o log.
 *
 * O que se mede aqui é o objeto que o handler passa para `request.log.*`, e as
 * entradas internas do Fastify ("incoming request", "request completed") são
 * descartadas por `ehLogDoFastify`. A separação não é conveniência:
 *
 * - o que o Fastify registra por conta própria passa pelo serializador `req` de
 *   `shared/http/server.ts`, que emite método, URL, host e endereço e **não** o
 *   corpo. Quem garante isso é aquele arquivo, com os testes dele;
 * - o objeto CRU que o Fastify passa para o logger é a requisição inteira, com
 *   corpo e tudo. Uma primeira versão deste arquivo mediu justamente esse
 *   objeto e acusou um vazamento que não existia — teste de privacidade que
 *   mede o lugar errado reprova com tudo certo e, pior, ensina a ignorá-lo.
 *
 * O que sobra é exatamente a promessa deste módulo: a rota não escreve o
 * endereço do destinatário em lugar nenhum.
 */
function ehLogDoFastify(dados: unknown): boolean {
  if (typeof dados !== 'object' || dados === null) return false;
  return 'req' in dados || 'res' in dados;
}

async function chamar(
  bancada: Bancada,
  opcoes: { assinatura?: string; corpo?: unknown } = {},
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  return bancada.app.inject({
    method: 'POST',
    url: '/webhooks/postmark',
    headers: {
      'content-type': 'application/json',
      ...(opcoes.assinatura === undefined ? {} : { 'x-postmark-signature': opcoes.assinatura }),
    },
    payload: JSON.stringify(opcoes.corpo ?? devolucao()),
  });
}

void describe('autenticação: o webhook é chamada DE ENTRADA, da internet aberta', () => {
  void it('SEM o cabeçalho de assinatura responde 401 e não executa nada', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada);

    assert.equal(resposta.statusCode, 401);
    // O que este caso realmente protege: um webhook sem autenticação é um
    // endpoint em que qualquer um forja evento de devolução definitiva para o
    // e-mail de um tutor e desliga o aviso de pet perdido dele.
    assert.equal(bancada.gravados.length, 0, 'nada pode ser gravado sem assinatura');
    assert.deepEqual(bancada.suprimidos, [], 'nenhum endereço pode ser suprimido sem assinatura');
  });

  void it('com assinatura ERRADA responde 401 e não executa nada', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'x'.repeat(SEGREDO.length) });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
    assert.deepEqual(bancada.suprimidos, []);
  });

  void it('assinatura que é PREFIXO do segredo não passa', async () => {
    // O ataque que a comparação em tempo constante existe para impedir começa
    // exatamente assim: descobrir o segredo um byte por vez. O resultado
    // precisa ser indistinguível de qualquer outro erro.
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO.slice(0, -1) });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('assinatura vazia não passa', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: '' });

    assert.equal(resposta.statusCode, 401);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('o 401 sai em `application/problem+json` e sem `next_action`', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'errada' });
    const corpo = resposta.json<Record<string, unknown>>();

    assert.match(String(resposta.headers['content-type']), /application\/problem\+json/);
    assert.equal(corpo['status'], 401);
    assert.equal(String(corpo['type']).endsWith('/unauthenticated'), true);

    // `sign_in` seria a saída certa para um tutor numa tela e um absurdo para
    // um provedor de e-mail, que não tem tela para abrir.
    assert.equal('next_action' in corpo, false, 'não se manda um robô fazer login');
  });

  void it('o corpo do 401 é IDÊNTICO para cabeçalho ausente e para segredo errado', async () => {
    // Distinguir os dois contaria a quem está tentando em qual metade do
    // problema ele está: "o cabeçalho está certo, agora só falta o valor".
    const semCabecalho = (await chamar(subirApp()))
      .json<Record<string, unknown>>();
    const comSegredoErrado = (await chamar(subirApp(), { assinatura: 'errada' }))
      .json<Record<string, unknown>>();

    // `correlation_id` muda a cada requisicao, entao sai da comparacao. O
    // resto do corpo precisa ser identico byte a byte.
    const semCorrelacao = (corpo: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(Object.entries(corpo).filter(([chave]) => chave !== 'correlation_id'));
    assert.deepEqual(semCorrelacao(semCabecalho), semCorrelacao(comSegredoErrado));
  });

  void it('ISCA: com o segredo CERTO o mesmo pedido passa', async () => {
    // Prova que os casos de 401 acima reprovam por causa da assinatura, e não
    // porque a rota recusa tudo. Sem este caso, um handler que respondesse 401
    // sempre passaria em todos os anteriores.
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO });

    assert.equal(resposta.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
  });
});

void describe('idempotência pela borda: o provedor reenvia', () => {
  void it('o reenvio responde 204 e não produz segundo efeito', async () => {
    const bancada = subirApp();
    const primeira = await chamar(bancada, { assinatura: SEGREDO });
    const segunda = await chamar(bancada, { assinatura: SEGREDO });

    // 204 nos dois, palavra por palavra do contrato: "Evento processado ou
    // ignorado por duplicidade". Responder 409 na repetição faria o provedor
    // tratar a reentrega como falha e reenviar de novo, em laço.
    assert.equal(primeira.statusCode, 204);
    assert.equal(segunda.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
    assert.equal(bancada.suprimidos.length, 1, 'o endereço não pode ser suprimido duas vezes');
  });
});

void describe('contato mediado e ADR-0010 item 6: o que NÃO sai daqui', () => {
  void it('a resposta de sucesso é 204 sem corpo nenhum', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: SEGREDO });

    assert.equal(resposta.statusCode, 204);
    // Nenhum telefone, endereço, `user_id`, `case_id` ou UUID de banco pode
    // vazar por um corpo que não existe. É a forma mais barata de cumprir a
    // regra, e é a que o contrato declara.
    assert.equal(resposta.body, '');
  });

  void it('o e-mail do destinatário NUNCA aparece no log', async () => {
    const bancada = subirApp();
    await chamar(bancada, { assinatura: SEGREDO });

    const tudoQueFoiLogado = JSON.stringify(bancada.logs);
    // O log de aplicação é lido por muita gente, sai do host e sobrevive à
    // exclusão da conta. Um e-mail ali desfaz a promessa num lugar onde
    // ninguém vai procurá-la.
    assert.equal(
      tudoQueFoiLogado.includes(TUTOR),
      false,
      `o endereço do tutor vazou para o log: ${tudoQueFoiLogado}`,
    );
    assert.equal(tudoQueFoiLogado.includes('exemplo.invalid'), false);

    // E o que DEVE estar lá, porque sem isso não há como investigar reentrega:
    assert.equal(tudoQueFoiLogado.includes('mensagem-1'), true, 'o `MessageID` precisa ser logado');
  });

  void it('ISCA: o teste de log enxerga o e-mail quando ele realmente vaza', async () => {
    // Prova que a asserção acima tem dentes. Sem este caso, uma captura que
    // ficasse vazia por engano (log desligado, saída redirecionada) faria o
    // teste de cima passar sem ter olhado para nada — que é a forma mais comum
    // de uma verificação de privacidade morrer em silêncio.
    const bancada = subirApp();
    await chamar(bancada, { assinatura: SEGREDO });

    assert.ok(bancada.logs.length > 0, 'a captura precisa ter pegado alguma linha da rota');
    bancada.logs.push({ recipient: TUTOR });
    assert.equal(JSON.stringify(bancada.logs).includes(TUTOR), true);
  });

  void it('o e-mail também não aparece no corpo do 401', async () => {
    const bancada = subirApp();
    const resposta = await chamar(bancada, { assinatura: 'errada' });

    assert.equal(resposta.body.includes(TUTOR), false);
  });
});

void describe('o corpo é validado pelo schema do contrato, e não por regra local', () => {
  void it('corpo sem `MessageID` é recusado', async () => {
    const bancada = subirApp();
    const semId = semACchave(devolucao(), 'MessageID');
    const resposta = await chamar(bancada, { assinatura: SEGREDO, corpo: semId });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('`RecordType` fora do `enum` é recusado antes de chegar ao banco', async () => {
    // O CHECK de `notification_deliveries` recusaria este valor, e o erro
    // sairia como 500 — que o provedor lê como "reenvie". Recusar aqui
    // transforma um laço de reentrega num 400 que fica parado.
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: SEGREDO,
      corpo: devolucao({ RecordType: 'Inventado' }),
    });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('corpo inválido com assinatura ERRADA responde 401, e não 400', async () => {
    // A ordem importa: validar o corpo antes de conferir a assinatura daria a
    // quem está tentando um oráculo do formato que aceitamos, de graça e sem
    // credencial nenhuma.
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: 'errada',
      corpo: { isto: 'nao e um evento' },
    });

    assert.equal(resposta.statusCode, 401);
  });

  void it('`DeliveredAt` AUSENTE não derruba o evento', async () => {
    // O campo é opcional no contrato: só `RecordType` e `MessageID` são
    // exigidos. A ausência vira `null` na coluna, e não um carimbo inventado.
    const bancada = subirApp();
    const semData = semACchave(devolucao(), 'DeliveredAt');
    const resposta = await chamar(bancada, { assinatura: SEGREDO, corpo: semData });

    assert.equal(resposta.statusCode, 204);
    assert.equal(bancada.gravados.length, 1);
    assert.equal(bancada.gravados[0]?.ocorridoEm, null);
  });

  void it('`DeliveredAt` ILEGÍVEL é recusado pelo schema do contrato, com 400', async () => {
    // ESTE CASO DOCUMENTA UM COMPORTAMENTO DO CONTRATO, e não uma escolha
    // nossa: `DeliveredAt` é declarado `format: date-time`, e o validador do
    // Fastify recusa o corpo inteiro quando o carimbo não casa.
    //
    // A consequência operacional está anotada no relatório da tarefa e merece
    // decisão de quem mantém a especificação: o provedor trata 400 como falha e
    // REENVIA. Um carimbo que o validador não aceite transforma um campo
    // opcional num laço de reentrega, e o evento — que talvez fosse uma
    // devolução definitiva — nunca é registrado. `instante()` em
    // `webhook-de-entrega.ts` já tolera data ilegível; hoje ela não chega lá,
    // porque o schema recusa antes. Afrouxar o `format` no contrato é a
    // correção, e ela é do contrato, não do código.
    const bancada = subirApp();
    const resposta = await chamar(bancada, {
      assinatura: SEGREDO,
      corpo: devolucao({ DeliveredAt: 'nao-e-uma-data' }),
    });

    assert.equal(resposta.statusCode, 400);
    assert.equal(bancada.gravados.length, 0);
  });

  void it('a rota fica FORA de `/v1`, como o contrato declara', async () => {
    // O caminho é registrado na raiz. Se alguém o mover para dentro do escopo
    // com prefixo, a borda (`handle /webhooks/postmark`) deixa de alcançá-lo e
    // o provedor passa a receber 404 — que ele trata como falha e reenvia.
    const bancada = subirApp();
    const fora = await chamar(bancada, { assinatura: SEGREDO });
    const dentro = await bancada.app.inject({
      method: 'POST',
      url: '/v1/webhooks/postmark',
      headers: { 'content-type': 'application/json', 'x-postmark-signature': SEGREDO },
      payload: JSON.stringify(devolucao()),
    });

    assert.equal(fora.statusCode, 204);
    assert.equal(dentro.statusCode, 404, 'a rota não pode existir sob `/v1`');
  });
});
