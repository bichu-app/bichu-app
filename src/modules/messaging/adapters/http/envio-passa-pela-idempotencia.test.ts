/**
 * O envio de mensagem passa pela idempotência DE VERDADE.
 *
 * ## O defeito que este arquivo existe para impedir de voltar
 *
 * `POST /conversations/{conversationId}/messages` declarava
 * `Idempotency-Key` no contrato e não passava pelo mecanismo. A API recusava
 * subir por causa disso (`vigiarIdempotenciaDasRotas`), e o portão está certo:
 * o contrato prometia que reenviar não duplica, e reenviar duplicava.
 *
 * ## Por que uma isca própria, se o portão de subida já acusa
 *
 * Porque os dois medem coisas diferentes, e só um deles mede o efeito.
 *
 * O portão de subida lê a MARCA `config: { idempotencia: true }` e compara com
 * o contrato. Ele reprova a rota sem marca — e aprova a rota marcada cujo
 * handler não chama `executarComIdempotencia`. Marca e comportamento são duas
 * declarações da mesma coisa, e as duas divergem no dia em que alguém mexe no
 * handler sem mexer na marca. Aqui o que se mede é o EFEITO: o mesmo envio,
 * com a mesma chave, duas vezes, e o serviço chamado UMA vez.
 *
 * Medido, e é por isso que este arquivo tem esta forma: tirar só a chamada a
 * `executarComIdempotencia` do handler, deixando a marca de pé, mantém a API
 * subindo e o portão verde. O caso `o segundo envio com a mesma chave não
 * chama o serviço de novo` é o único que reprova.
 *
 * ## O dobre de idempotência não é "sempre undefined"
 *
 * O dobre das outras bancadas devolve `undefined` em `reservar`, que é o
 * suficiente quando o que se testa é outra coisa. Aqui ele seria a armadilha
 * exata que este repositório já pagou duas vezes: com `reservar` sempre
 * devolvendo `undefined`, o efeito roda nas duas chamadas e o teste passa com a
 * idempotência DESLIGADA. Este dobre guarda e devolve, como a tabela guarda e
 * devolve, e recusa a chave reaproveitada para outro pedido.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import { hashDeCorpo } from '../../../../shared/crypto/digest.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  vigiarIdempotenciaDasRotas,
  type EntradaDeIdempotencia,
  type Idempotencia,
  type RespostaGravada,
} from '../../../../shared/http/idempotency.js';
import { registrarRotasDeConversas } from './conversation-routes.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { MensagemGravada } from '../../ports/conversation-repository.js';
import type { ConversationId, AbsoluteUrl, UserId } from '../../../../shared/types/brands.js';
import type { DependenciasDasRotasDeConversa } from './conversation-routes.js';

const BASE_DE_PROBLEMA = 'https://api.bichu.test/problems' as AbsoluteUrl;
const AGORA = Date.UTC(2026, 8, 22, 12, 0, 0);
const CONVERSA = '018f3a2b-0000-7000-8000-0000000000cc';
const OUTRA_CONVERSA = '018f3a2b-0000-7000-8000-0000000000dd';
const CONTA = '018f3a2b-0000-7000-8000-0000000000aa';
const CHAVE = '9f0b6a2e-4d1c-4f2a-9b3e-7c5d8a1f0e42';

/**
 * A tabela `idempotency_keys` em memória, com as três regras que importam aqui:
 * devolve a resposta gravada, recusa a chave usada para outro pedido, e nunca
 * deixa o efeito rodar duas vezes para a mesma reserva concluída.
 */
function idempotenciaEmMemoria(): Idempotencia {
  const linhas = new Map<string, { resumo: string; dono: string; gravada?: RespostaGravada }>();
  return {
    reservar(entrada: EntradaDeIdempotencia): Promise<RespostaGravada | undefined> {
      const resumo = hashDeCorpo(entrada.corpoCanonico).toString('hex');
      const existente = linhas.get(entrada.chave);
      if (existente === undefined) {
        linhas.set(entrada.chave, { resumo, dono: entrada.donoOuToken });
        return Promise.resolve(undefined);
      }
      if (existente.resumo !== resumo || existente.dono !== entrada.donoOuToken) {
        throw problemas.validacao([
          { field: 'Idempotency-Key', code: 'reused', message: 'Chave usada para outro pedido.' },
        ]);
      }
      return Promise.resolve(existente.gravada);
    },
    concluir(chave: string, status: number, corpo: unknown): Promise<void> {
      const linha = linhas.get(chave);
      if (linha !== undefined) linha.gravada = { status, body: corpo };
      return Promise.resolve();
    },
    liberar(chave: string): Promise<void> {
      linhas.delete(chave);
      return Promise.resolve();
    },
  };
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Quantas vezes o SERVIÇO foi chamado. É este número que a isca observa. */
  envios(): number;
}

function bancada(): Bancada {
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMA,
    isProduction: false,
    teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
    bodyLimitBytes: 1_048_576,
  });

  let chamadas = 0;
  const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };

  const conversas = {
    enviar(conversa: ConversationId, texto: string): Promise<MensagemGravada> {
      chamadas += 1;
      return Promise.resolve({
        id: `018f3a2b-0000-7000-8000-0000000000${String(10 + chamadas)}`,
        senderRole: 'owner',
        body: `${texto} (${conversa})`,
        redactions: [],
        createdAt: new Date(AGORA),
      } as unknown as MensagemGravada);
    },
  } as unknown as DependenciasDasRotasDeConversa['conversas'];

  registrarRotasDeConversas(app, {
    conversas,
    autenticador: { autenticar: (token: string) => Promise.resolve({ userId: token as UserId }) },
    // O contrato DE VERDADE: é ele que diz se a operação declara
    // `Idempotency-Key`, e uma cópia aqui deixaria de acusar mudança na spec.
    contrato: carregarContrato('api/openapi.yaml'),
    idempotencia: idempotenciaEmMemoria(),
    clock,
  });

  return { app, envios: () => chamadas };
}

function enviar(
  app: RegistradorDeRotas,
  opcoes: { conversa?: string; chave?: string; texto?: string } = {},
) {
  return app.inject({
    method: 'POST',
    url: `/conversations/${opcoes.conversa ?? CONVERSA}/messages`,
    headers: {
      authorization: `Bearer ${CONTA}`,
      ...(opcoes.chave === undefined ? {} : { 'idempotency-key': opcoes.chave }),
    },
    payload: { body: opcoes.texto ?? 'estou com ele aqui em casa' },
  });
}

void describe('o envio de mensagem honra a Idempotency-Key que o contrato declara', () => {
  void it('o segundo envio com a mesma chave não chama o serviço de novo', async () => {
    const { app, envios } = bancada();

    const primeira = await enviar(app, { chave: CHAVE });
    const segunda = await enviar(app, { chave: CHAVE });
    await app.close();

    assert.equal(primeira.statusCode, 201);
    assert.equal(segunda.statusCode, 201);
    // A MESMA resposta, e não uma segunda mensagem parecida: o tutor e quem
    // achou o animal veriam duas linhas iguais na conversa.
    assert.deepEqual(JSON.parse(segunda.body), JSON.parse(primeira.body));
    assert.equal(
      envios(),
      1,
      'o serviço foi chamado duas vezes: o reenvio da fila offline criaria duas mensagens iguais',
    );
  });

  void it('sem chave, cada envio é um envio: a idempotência é opcional no contrato', async () => {
    const { app, envios } = bancada();

    assert.equal((await enviar(app)).statusCode, 201);
    assert.equal((await enviar(app)).statusCode, 201);
    await app.close();

    assert.equal(envios(), 2);
  });

  void it('a mesma chave em outra conversa é recusada, e não devolve a mensagem da primeira', async () => {
    const { app, envios } = bancada();

    const primeira = await enviar(app, { chave: CHAVE, conversa: CONVERSA });
    const segunda = await enviar(app, { chave: CHAVE, conversa: OUTRA_CONVERSA });
    await app.close();

    assert.equal(primeira.statusCode, 201);
    // 400 e não 201: devolver o corpo gravado aqui entregaria a mensagem de uma
    // conversa dentro de outra, que é pior do que recusar.
    assert.equal(segunda.statusCode, 400);
    assert.equal(envios(), 1);
  });

  void it('chave que não é UUID é recusada antes de qualquer efeito', async () => {
    const { app, envios } = bancada();

    const resposta = await enviar(app, { chave: 'nao-e-uuid' });
    await app.close();

    assert.equal(resposta.statusCode, 400);
    assert.equal(envios(), 0);
  });

  void it('o portão de subida aprova esta rota contra o contrato', async () => {
    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMA,
      isProduction: false,
      teto: tetoDeTeste(criarContadorEmMemoria(() => AGORA)),
      bodyLimitBytes: 1_048_576,
    });
    const contrato = carregarContrato('api/openapi.yaml');
    // Registrado ANTES das rotas, como `api.ts` faz: o gancho `onRoute` só vê o
    // que for registrado depois dele.
    const conferir = vigiarIdempotenciaDasRotas(app, contrato, '/v1');
    const clock: Clock = { now: () => AGORA as ReturnType<Clock['now']> };

    registrarRotasDeConversas(app, {
      conversas: undefined as unknown as DependenciasDasRotasDeConversa['conversas'],
      autenticador: { autenticar: () => Promise.resolve({ userId: CONTA as UserId }) },
      contrato,
      idempotencia: idempotenciaEmMemoria(),
      clock,
    });
    await app.ready();

    assert.doesNotThrow(conferir);
    await app.close();
  });
});
