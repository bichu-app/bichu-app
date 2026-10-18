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
 * 5. **O ENDERECO E OBRIGATORIO, e a recusa diz QUAL campo falta.** Esta e a
 *    isca que o cliente comprou junto da decisao de 17/10: botao que recusa
 *    sem explicar custou tempo a ele tres vezes num dia. O caso nao afirma
 *    "responde 400": ele afirma que `errors[].field` nomeia o campo ausente,
 *    um por um, para os sete obrigatorios. Um 400 generico passa na primeira
 *    assercao e reprova nesta.
 *
 * 5b. **O ENDERECO E O TELEFONE NAO VOLTAM NA RESPOSTA.** Dado pessoal nao e
 *    ecoado: quem o enviou acabou de digita-lo. A varredura procura cada
 *    valor enviado no corpo da resposta, telefone inclusive.
 *
 * 5c. **O CEP e normalizado, e nada mais e tocado.** `01311-000` e `01311000`
 *    sao o mesmo lugar e precisam virar a mesma linha. O caso tambem afirma o
 *    que NAO muda: nenhum outro campo e completado, porque nada resolve CEP
 *    neste produto (ADR-0006).
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
  EnderecoDeEntrega,
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

/**
 * Um endereco valido, no formato do contrato. Valores unicos neste arquivo,
 * para a varredura da isca 5b nao casar com outra coisa por acidente.
 */
const ENDERECO_VALIDO = {
  recipient_name: 'Mariana Destinataria',
  recipient_phone: '+5511987654321',
  postal_code: '01311000',
  street: 'Avenida Paulista Ficticia',
  street_number: '1578B',
  complement: 'apto 92 fundos',
  neighborhood: 'Bela Vista Inventada',
  city: 'Sao Paulo dos Testes',
  state: 'SP',
} as const;

/** Os sete obrigatorios. `complement` nao esta aqui, e e a unica excecao. */
const CAMPOS_OBRIGATORIOS = [
  'recipient_name',
  'recipient_phone',
  'postal_code',
  'street',
  'street_number',
  'neighborhood',
  'city',
  'state',
] as const;

function corpoValido(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { delivery_address: { ...ENDERECO_VALIDO }, ...extra };
}

function naoUsado(nome: string): never {
  throw new Error(`o duble nao implementa ${nome}: nenhum caso deste arquivo chega la`);
}

interface Bancada {
  readonly app: RegistradorDeRotas;
  /** Todo pedido que chegou ao repositorio, na ordem. E o que o caso 4 mede. */
  readonly criados: {
    readonly petId: PetId;
    readonly endereco: EnderecoDeEntrega;
    readonly observacao: string | null;
  }[];
}

function bancada(contador: RateLimitStore = criarContadorEmMemoria(() => Date.now())): Bancada {
  const criados: { petId: PetId; endereco: EnderecoDeEntrega; observacao: string | null }[] = [];

  const repositorio: PedidoDePlaquinhaRepository = {
    criarOuDevolverPendente: (entrada): Promise<PedidoDoTutor | undefined> => {
      criados.push({
        petId: entrada.petId,
        endereco: entrada.endereco,
        observacao: entrada.observacao,
      });
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

/**
 * Marca de "NENHUM corpo foi enviado", e por que ela nao e `undefined`.
 *
 * `pedir(b, pet, undefined)` NAO manda requisicao sem corpo: parametro com
 * valor padrao recebe o padrao justamente quando o argumento e `undefined`
 * (semantica de ES), entao o terceiro argumento virava `corpoValido()` e a
 * requisicao saia COMPLETA. O caso 5a afirmava 400 sobre um pedido valido, que
 * responde 200 -- ele reprovava por nao conseguir dizer o que queria dizer, e
 * nao por defeito do servidor. Medido em 18/10. Com a marca explicita a
 * ausencia e inequivoca e o padrao continua valendo para quem omite o
 * argumento.
 */
const SEM_CORPO = Symbol('sem corpo');

function pedir(
  b: Bancada,
  pet: PetId,
  corpo: Record<string, unknown> | typeof SEM_CORPO = corpoValido(),
): Promise<{ statusCode: number; body: string }> {
  return b.app.inject({
    method: 'POST',
    url: `${PREFIXO_DA_API}${PEDIDO.replace(':petId', pet)}`,
    headers: { authorization: `Bearer ${TOKEN_DE_ACESSO}` },
    ...(corpo === SEM_CORPO ? {} : { payload: corpo }),
  });
}

/** Os campos que o 400 de validacao nomeou. */
function camposRecusados(body: string): string[] {
  const corpo = JSON.parse(body) as { errors?: { field?: string }[] };
  return (corpo.errors ?? []).map((e) => String(e.field));
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

  void it('5. cada campo obrigatorio do endereco, faltando, e NOMEADO no 400', async () => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const b = bancada();
      const endereco: Record<string, unknown> = { ...ENDERECO_VALIDO };
      delete endereco[campo];
      const resposta = await pedir(b, MEU_PET, { delivery_address: endereco });

      assert.equal(resposta.statusCode, 400, `faltando ${campo} deveria recusar`);
      // A assercao que carrega o caso: um 400 generico passa na linha de cima
      // e reprova aqui. E dela que o formulario tira "falta o CEP".
      assert.ok(
        camposRecusados(resposta.body).some((f) => f.includes(campo)),
        `o 400 de ${campo} ausente nao nomeia o campo: ${resposta.body}`,
      );
      assert.equal(b.criados.length, 0);
    }
  });

  void it('5a. corpo ausente recusa: sem corpo nao ha endereco', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET, SEM_CORPO);
    assert.equal(resposta.statusCode, 400);
    assert.equal(b.criados.length, 0);
  });

  void it('5a2. `complement` e o UNICO opcional, e sem ele o pedido passa', async () => {
    const b = bancada();
    const endereco: Record<string, unknown> = { ...ENDERECO_VALIDO };
    delete endereco['complement'];
    const resposta = await pedir(b, MEU_PET, { delivery_address: endereco });
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.endereco.complemento, null);
  });

  void it('5b. endereco e telefone NAO voltam na resposta, campo por campo', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    for (const valor of Object.values(ENDERECO_VALIDO)) {
      assert.ok(
        !resposta.body.includes(valor),
        `a resposta ecoa um campo do endereco ou o telefone: ${valor}`,
      );
    }
  });

  /**
   * O CEP COM MASCARA e recusado, e o CEP limpo e gravado como veio.
   *
   * Este caso afirmava o contrario -- que `01311-000` respondia 200 e era
   * normalizado para `01311000` -- e reprovava com 400. A isca estava errada,
   * e a prova esta no contrato: `DeliveryAddress.postal_code` declara
   * `pattern: '^[0-9]{8}$'` e a descricao diz, com estas palavras, "CEP com
   * oito digitos, **sem mascara e sem hifen**" (`api/openapi.yaml`). O Ajv do
   * Fastify aplica esse padrao antes de o manipulador existir, entao o 400 e o
   * comportamento CERTO, e o contrato manda nos quatro clientes.
   *
   * (O `replace(/\D/gu, '')` de `comoEnderecoDeEntrega` e, por consequencia,
   * inalcancavel por esta rota: o schema recusa antes. Ele fica como defesa,
   * mas nao e um caminho que se possa afirmar daqui.)
   *
   * O caso continua cobrindo as duas coisas que importam: a mascara NAO entra,
   * e com o CEP valido nada mais e tocado (ADR-0006).
   */
  void it('5c. CEP com mascara e recusado e NOMEADO; o valido e gravado sem nada completar nada', async () => {
    const comMascara = bancada();
    const recusa = await pedir(
      comMascara,
      MEU_PET,
      corpoValido({ delivery_address: { ...ENDERECO_VALIDO, postal_code: '01311-000' } }),
    );
    assert.equal(recusa.statusCode, 400);
    assert.ok(
      camposRecusados(recusa.body).some((f) => f.includes('postal_code')),
      `o 400 do CEP com mascara nao nomeia o campo: ${recusa.body}`,
    );
    assert.equal(comMascara.criados.length, 0);

    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    const gravado = b.criados[0]?.endereco;
    assert.equal(gravado?.cep, ENDERECO_VALIDO.postal_code);
    // Nada completa nada (ADR-0006): o que foi digitado e o que foi gravado.
    assert.equal(gravado?.bairro, ENDERECO_VALIDO.neighborhood);
    assert.equal(gravado?.cidade, ENDERECO_VALIDO.city);
    assert.equal(gravado?.logradouro, ENDERECO_VALIDO.street);
  });

  void it('5c2. telefone fora de E.164 e recusado, e NOMEADO', async () => {
    for (const ruim of ['11987654321', '(11) 98765-4321', '+1555123456789']) {
      const b = bancada();
      const resposta = await pedir(
        b,
        MEU_PET,
        corpoValido({ delivery_address: { ...ENDERECO_VALIDO, recipient_phone: ruim } }),
      );
      assert.equal(resposta.statusCode, 400, `${ruim} deveria recusar`);
      assert.ok(
        camposRecusados(resposta.body).some((f) => f.includes('recipient_phone')),
        `o 400 de '${ruim}' nao nomeia o telefone: ${resposta.body}`,
      );
      assert.equal(b.criados.length, 0);
    }
  });

  void it('5d. pedir sem `notes` continua valendo: a observacao e opcional', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.observacao, null);
  });

  void it('6. observacao acima do limite responde 400, e nao 500', async () => {
    const b = bancada();
    const resposta = await pedir(
      b,
      MEU_PET,
      corpoValido({ notes: 'x'.repeat(LIMITE_DA_OBSERVACAO + 1) }),
    );
    assert.equal(resposta.statusCode, 400);
    // E o schema do contrato que recusou, nao o banco: nada chegou ao
    // repositorio.
    assert.equal(b.criados.length, 0);
  });

  void it('6b. observacao no limite passa, e chega inteira ao repositorio', async () => {
    const b = bancada();
    const texto = 'y'.repeat(LIMITE_DA_OBSERVACAO);
    const resposta = await pedir(b, MEU_PET, corpoValido({ notes: texto }));
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.observacao, texto);
  });
});
