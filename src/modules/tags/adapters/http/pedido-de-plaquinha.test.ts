/**
 * `POST /v1/pets/{petId}/tag-requests`: o pedido da plaquinha da coleira.
 *
 * ===========================================================================
 * ESTE ARQUIVO FOI ESCRITO E **NAO FOI EXECUTADO**
 * ===========================================================================
 * Por decisao explicita de quem pediu a entrega (17/10/2026): nenhuma suite
 * unitaria nem de integracao rodou nesta branch. O que rodou foi `tsc
 * --noEmit`, `npm run build`, `eslint`, `verify:types`, `flutter analyze` e os
 * portoes offline. **Nenhuma afirmacao deste arquivo esta provada.** Quem
 * rodar a suite pela primeira vez deve esperar ajuste de dubles, e a ausencia
 * de prova esta dita aqui em vez de presumida verde.
 *
 * ===========================================================================
 * O QUE CADA CASO MEDE, E POR QUE ELE NAO E TAUTOLOGIA
 * ===========================================================================
 *
 * 1. **A ROTA ESTA REGISTRADA DE FATO.** Este projeto ja teve 22 operacoes
 *    declaradas no contrato sem codigo nenhum atras (`revokePetTag` ainda
 *    esta assim). Uma operacao declarada e nao registrada responde 404, e 404
 *    e indistinguivel de "pet de outra pessoa" -- que e justamente a resposta
 *    correta do caso 3. Por isso o caso 1 pede um pet que o duble ACEITA: um
 *    201/200 so sai de codigo que existe.
 *
 * 2. **O corpo da resposta nao carrega `ref` nem UUID** (ADR-0010 item 6).
 *    Nenhum portao deste repositorio confere corpo de resposta -- so corpo de
 *    REQUISICAO e validado --, entao esta assercao e o unico instrumento que
 *    acusaria um UUID vazando daqui.
 *
 * 3. **Pet de outra pessoa responde 404, e nunca 403** (ADR-0021). O duble
 *    devolve `undefined`, que e o que a clausula `WHERE` do adaptador real
 *    produz quando nao encontra linha. O caso afirma o status E o `type` do
 *    corpo: um 403 com corpo de 404 passaria por uma assercao de status so.
 *
 * 4. **O teto e de 3 por conta em 24 h, e ele FREIA ANTES do manipulador.** A
 *    assercao que carrega o caso nao e o status: e a CONTAGEM DE CHAMADAS AO
 *    REPOSITORIO. Tres pedidos, tres chegadas; quatro pedidos, tres chegadas.
 *    Se o quarto chegar la, a borda deixou de frear -- e aqui, diferente da
 *    emissao, nao existe segunda camada que recuse, entao o pedido seria
 *    GRAVADO. O numero 3 e escrito a mao com a fonte citada e nao lido de
 *    `rotaDePedidoDePlaquinha.rateLimit`: teste que tira o esperado do mesmo
 *    lugar que exercita passaria a cobrar 50 no dia em que alguem escrevesse
 *    50.
 *
 * 5. **Corpo ausente e corpo vazio.** Pedir a plaquinha sem escrever nada e o
 *    caminho comum, e o contrato declara `requestBody.required: false`. Sem o
 *    gancho `corpoAusenteEhCorpoVazio`, o POST de um toque responderia 400
 *    `body must be object` -- o defeito que o aviso pela tag ja teve.
 *
 * 6. **A observacao passa pelo schema do contrato.** 501 caracteres respondem
 *    400, e nao 500: sem `schema.body` o texto iria do corpo ao `INSERT` e
 *    quem recusaria seria o `CHECK` do banco, com 500 numa rota autenticada.
 *    E o mesmo defeito que `label` de `issuePetTag` teve.
 *
 * O CAMINHO SAI DA DECLARACAO (`rotaDePedidoDePlaquinha.path`), nunca escrito a
 * mao: caminho a mao vira 404 em silencio, e 404 e a resposta do caso 3.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { carregarContrato } from '../../../../shared/http/contract.js';
import { criarServidor } from '../../../../shared/http/server.js';
import type { RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { criarContadorEmMemoria } from '../../../../shared/http/rate-limit.js';
import { tetoDeTeste } from '../../../../shared/http/teto-de-teste.js';
import type { RateLimitStore } from '../../../../shared/ports/rate-limit-store.js';
import type { IdGenerator } from '../../../../shared/ports/index.js';
import type { AbsoluteUrl, OpaqueToken, PetId, UserId } from '../../../../shared/types/brands.js';
import type { Autenticador } from '../../ports/autenticador.js';
import type {
  PedidoDePlaquinhaRepository,
  PedidoDoTutor,
} from '../../ports/pedido-de-plaquinha.js';
import { PedidoDePlaquinhaService } from '../../application/pedido-de-plaquinha-service.js';
import {
  registrarRotaDePedidoDePlaquinha,
  rotaDePedidoDePlaquinha,
} from './pedido-de-plaquinha-routes.js';

const PREFIXO_DA_API = '/v1';
const PROBLEM_BASE_URL = 'https://api.exemplo.invalid/problems' as AbsoluteUrl;
const DONO = '018f3a2b-0000-7000-8000-0000000000aa' as UserId;
/** O pet do dono: o duble devolve pedido para ele. */
const MEU_PET = '018f3a2b-0000-7000-8000-0000000000c1' as PetId;
/** Pet de outra pessoa: o duble devolve `undefined`, como o `WHERE` faria. */
const PET_DE_OUTRO = '018f3a2b-0000-7000-8000-0000000000c9' as PetId;
const TOKEN_DE_ACESSO = 'acesso-do-tutor';
const SOLICITADO_EM = new Date('2026-10-17T12:00:00.000Z');

/** Da DECLARACAO, nunca escrito a mao. */
const PEDIDO = rotaDePedidoDePlaquinha.path;

/**
 * O teto por conta, literal e com fonte.
 *
 * Fonte: `api/openapi.yaml`, operacao `requestCollarTag`, unica entrada de
 * `x-rate-limit` (`dimension: [account]`, `limit: 3`, `window: 24h`,
 * `on_exceed: deny_429`). ADR-0016 define o mecanismo.
 */
const TETO_POR_CONTA = 3;

/** O teto de `notes` no contrato (`CollarTagRequestInput`). */
const LIMITE_DA_OBSERVACAO = 500;

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Todo pedido que chegou ao repositorio, na ordem. E o que o caso 4 mede. */
  readonly criados: { readonly petId: PetId; readonly observacao: string | null }[];
}

function bancada(contador: RateLimitStore = criarContadorEmMemoria(() => Date.now())): Bancada {
  const criados: { petId: PetId; observacao: string | null }[] = [];

  const repositorio: PedidoDePlaquinhaRepository = {
    criarOuDevolverPendente: (entrada): Promise<PedidoDoTutor | undefined> => {
      criados.push({ petId: entrada.petId, observacao: entrada.observacao });
      // `undefined` para pet de outra pessoa: e exatamente o que o
      // `INSERT ... SELECT` do adaptador real produz quando a clausula
      // `WHERE` nao encontra linha.
      if (entrada.petId !== MEU_PET) return Promise.resolve(undefined);
      return Promise.resolve({
        status: 'pending',
        solicitadoEm: SOLICITADO_EM,
        observacao: entrada.observacao,
      });
    },
    listarFila: () => naoUsado('listarFila'),
    pedidoPorRef: () => naoUsado('pedidoPorRef'),
    decidir: () => naoUsado('decidir'),
  };

  const ids: IdGenerator = {
    uuidv7: () => '018f3a2b-0000-7000-8000-0000000000f1',
    opaqueToken: () => 'token' as OpaqueToken,
    random128: () => new Uint8Array(16).fill(0x2b),
    random80: () => new Uint8Array(10).fill(0x2b),
  };

  const autenticador: Autenticador = {
    autenticar: (token) =>
      token === TOKEN_DE_ACESSO
        ? Promise.resolve({ userId: DONO })
        : naoUsado('autenticar com token desconhecido'),
  };

  const app = criarServidor({
    problemBaseUrl: PROBLEM_BASE_URL,
    isProduction: false,
    teto: tetoDeTeste(contador),
  });
  void app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotaDePedidoDePlaquinha(escopo, {
        pedidos: new PedidoDePlaquinhaService({ repositorio, ids }),
        autenticador,
        contrato: carregarContrato('api/openapi.yaml'),
      });
      pronto();
    },
    { prefix: PREFIXO_DA_API },
  );
  return { app, criados };
}

function pedir(
  b: Bancada,
  pet: PetId,
  corpo?: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> {
  return b.app.inject({
    method: 'POST',
    url: `${PREFIXO_DA_API}${PEDIDO.replace(':petId', pet)}`,
    headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    ...(corpo === undefined ? {} : { payload: corpo }),
  });
}

void describe('POST /v1/pets/{petId}/tag-requests', () => {
  void it('1. esta REGISTRADA: o pedido do proprio pet responde 200, e nao 404', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados.length, 1);
    assert.equal(b.criados[0]?.petId, MEU_PET);
  });

  void it('2. o corpo da resposta nao carrega `ref` nem UUID nenhum', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    const corpo = JSON.parse(resposta.body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(corpo).sort(), ['notes', 'requested_at', 'status']);
    assert.equal(corpo['status'], 'pending');
    // Nenhum valor da resposta tem forma de UUID. A varredura e sobre o corpo
    // inteiro, e nao sobre uma lista de campos: campo novo que vaze UUID
    // amanha reprova aqui sem ninguem lembrar de incluir o nome dele.
    assert.doesNotMatch(
      resposta.body,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  void it('3. pet de outra pessoa responde 404 `not-found`, e nunca 403', async () => {
    const b = bancada();
    const resposta = await pedir(b, PET_DE_OUTRO);
    assert.equal(resposta.statusCode, 404);
    const corpo = JSON.parse(resposta.body) as { type?: string };
    assert.match(String(corpo.type), /not-found$/);
  });

  void it('4. o quarto pedido da mesma conta responde 429, e NAO chega ao repositorio', async () => {
    const b = bancada();
    for (let i = 0; i < TETO_POR_CONTA; i += 1) {
      assert.equal((await pedir(b, MEU_PET)).statusCode, 200);
    }
    assert.equal(b.criados.length, TETO_POR_CONTA);

    const excedente = await pedir(b, MEU_PET);
    assert.equal(excedente.statusCode, 429);
    // A assercao que importa: a borda freou ANTES do manipulador. Sem ela o
    // caso ficaria verde com o teto removido, porque nada mais recusa aqui.
    assert.equal(b.criados.length, TETO_POR_CONTA);
  });

  void it('5. pedir sem corpo nenhum funciona: e o caminho comum', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.observacao, null);
  });

  void it('6. observacao acima do limite responde 400, e nao 500', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET, {
      notes: 'x'.repeat(LIMITE_DA_OBSERVACAO + 1),
    });
    assert.equal(resposta.statusCode, 400);
    // E o schema do contrato que recusou, nao o banco: nada chegou ao
    // repositorio.
    assert.equal(b.criados.length, 0);
  });

  void it('6b. observacao no limite passa, e chega inteira ao repositorio', async () => {
    const b = bancada();
    const texto = 'y'.repeat(LIMITE_DA_OBSERVACAO);
    const resposta = await pedir(b, MEU_PET, { notes: texto });
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.observacao, texto);
  });
});
