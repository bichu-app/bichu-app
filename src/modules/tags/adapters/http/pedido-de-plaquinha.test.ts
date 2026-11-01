import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
const MEU_PET = '018f3a2b-0000-7000-8000-0000000000c1' as PetId;
const PET_DE_OUTRO = '018f3a2b-0000-7000-8000-0000000000c9' as PetId;
const TOKEN_DE_ACESSO = 'acesso-do-tutor';
const SOLICITADO_EM = new Date('2026-10-17T12:00:00.000Z');

const REF_GERADO = Buffer.from(new Uint8Array(16).fill(0x2b)).toString('base64url');

const PEDIDO = rotaDePedidoDePlaquinha.path;

const TETO_POR_CONTA = 3;

const LIMITE_DA_OBSERVACAO = 500;

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
  readonly criados: {
    readonly petId: PetId;
    readonly endereco: EnderecoDeEntrega;
    readonly observacao: string | null;
  }[];
}

const ENTREGA_NOVA = {
  passoDaEntrega: 'requested',
  codigoDeRastreio: null,
  despachadoEm: null,
  entregueEm: null,
} as const satisfies Pick<
  PedidoDoTutor,
  'passoDaEntrega' | 'codigoDeRastreio' | 'despachadoEm' | 'entregueEm'
>;

function bancada(
  contador: RateLimitStore = criarContadorEmMemoria(() => Date.now()),
  pedidosDoPet: readonly PedidoDoTutor[] = [],
  entrega: Pick<
    PedidoDoTutor,
    'passoDaEntrega' | 'codigoDeRastreio' | 'despachadoEm' | 'entregueEm'
  > = ENTREGA_NOVA,
): Bancada {
  const criados: { petId: PetId; endereco: EnderecoDeEntrega; observacao: string | null }[] = [];

  const repositorio: PedidoDePlaquinhaRepository = {
    criarOuDevolverPendente: (entrada): Promise<PedidoDoTutor | undefined> => {
      criados.push({
        petId: entrada.petId,
        endereco: entrada.endereco,
        observacao: entrada.observacao,
      });
      if (entrada.petId !== MEU_PET) return Promise.resolve(undefined);
      return Promise.resolve({
        ref: entrada.ref,
        status: 'pending',
        solicitadoEm: SOLICITADO_EM,
        decididoEm: null,
        observacao: entrada.observacao,
        ...entrega,
      });
    },
    listarDoPet: (petId): Promise<readonly PedidoDoTutor[] | undefined> => {
      if (petId !== MEU_PET) return Promise.resolve(undefined);
      return Promise.resolve(pedidosDoPet);
    },
    listarFila: () => naoUsado('listarFila'),
    pedidoPorRef: () => naoUsado('pedidoPorRef'),
    pedidoParaLeitura: () => naoUsado('pedidoParaLeitura'),
    decidir: () => naoUsado('decidir'),
    atualizarEntrega: () => naoUsado('atualizarEntrega'),
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

  void it('2. o corpo carrega o `ref` do servidor e NENHUM UUID', async () => {
    const b = bancada();
    const resposta = await pedir(b, MEU_PET);
    const corpo = JSON.parse(resposta.body) as Record<string, unknown>;
    assert.deepEqual(Object.keys(corpo).sort(), [
      'decided_at',
      'delivered_at',
      'delivery_state',
      'notes',
      'ref',
      'requested_at',
      'shipped_at',
      'status',
      'tracking_code',
    ]);
    assert.equal(corpo['status'], 'pending');
    assert.equal(corpo['ref'], REF_GERADO);
    assert.equal(corpo['delivery_state'], 'requested');
    assert.equal(corpo['tracking_code'], null);
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
    assert.equal(b.criados.length, TETO_POR_CONTA);
  });

  void it('5. cada campo obrigatorio do endereco, faltando, e NOMEADO no 400', async () => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      const b = bancada();
      const endereco: Record<string, unknown> = { ...ENDERECO_VALIDO };
      delete endereco[campo];
      const resposta = await pedir(b, MEU_PET, { delivery_address: endereco });

      assert.equal(resposta.statusCode, 400, `faltando ${campo} deveria recusar`);
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
    assert.equal(b.criados.length, 0);
  });

  void it('7. a ENTREGA sai na leitura do DONO: passo, rastreio e os dois carimbos', async () => {
    const RASTREIO = 'XQ771230045BR';
    const DESPACHADO = new Date('2026-10-18T09:30:00.000Z');
    const CHEGOU = new Date('2026-10-20T14:05:00.000Z');
    const b = bancada(undefined, undefined, {
      passoDaEntrega: 'arrived',
      codigoDeRastreio: RASTREIO,
      despachadoEm: DESPACHADO,
      entregueEm: CHEGOU,
    });
    const resposta = await pedir(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as Record<string, unknown>;

    assert.equal(corpo['delivery_state'], 'arrived');
    assert.equal(corpo['tracking_code'], RASTREIO);
    assert.equal(corpo['shipped_at'], DESPACHADO.toISOString());
    assert.equal(corpo['delivered_at'], CHEGOU.toISOString());

  });

  void it('7b. o rastreio NAO sai em superficie sem conta: `resolveTag` nao o projeta', () => {
    const fonte = readFileSync(
      join(process.cwd(), 'src/modules/tags/adapters/persistence/kysely-tag-repository.ts'),
      'utf8',
    );
    for (const campo of ['tracking_code', 'delivery_state', 'shipped_at', 'delivered_at']) {
      assert.ok(
        !fonte.includes(campo),
        `o repositorio da resolucao publica da tag passou a tocar \`${campo}\`. ` +
          'O rastreio e a entrega sao do DONO e da administracao; uma superficie sem conta ' +
          'que os projete entrega informacao de encomenda a quem so escaneou a coleira.',
      );
    }

    assert.ok(fonte.includes('pet_tags'), 'a fonte lida nao e o repositorio da tag');
  });

  void it('6b. observacao no limite passa, e chega inteira ao repositorio', async () => {
    const b = bancada();
    const texto = 'y'.repeat(LIMITE_DA_OBSERVACAO);
    const resposta = await pedir(b, MEU_PET, corpoValido({ notes: texto }));
    assert.equal(resposta.statusCode, 200);
    assert.equal(b.criados[0]?.observacao, texto);
  });
});

void describe('GET /v1/pets/{petId}/tag-requests', () => {
  const UM_PEDIDO: readonly PedidoDoTutor[] = [
    {
      ref: 'Ref-De-Teste_0123456789a',
      status: 'fulfilled',
      solicitadoEm: SOLICITADO_EM,
      decididoEm: new Date('2026-10-18T09:00:00.000Z'),
      observacao: null,
      passoDaEntrega: 'in_transit',
      codigoDeRastreio: 'XQ771230045BR',
      despachadoEm: new Date('2026-10-18T10:00:00.000Z'),
      entregueEm: null,
    },
  ];

  function listar(b: Bancada, pet: PetId, token: string = TOKEN_DE_ACESSO) {
    return b.app.inject({
      method: 'GET',
      url: `${PREFIXO_DA_API}/pets/${pet}/tag-requests`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  void it('7. o pedido do PROPRIO pet responde 200 com o `ref` do servidor', async () => {
    const b = bancada(undefined, UM_PEDIDO);
    const resposta = await listar(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as { items: Record<string, unknown>[] };
    assert.equal(corpo.items.length, 1);
    assert.equal(corpo.items[0]?.['ref'], UM_PEDIDO[0]?.ref);
    assert.equal(corpo.items[0]?.['status'], 'fulfilled');
  });

  void it('8. pet de OUTRA conta responde 404, e nunca 403', async () => {
    const b = bancada(undefined, UM_PEDIDO);
    const resposta = await listar(b, PET_DE_OUTRO);
    assert.equal(resposta.statusCode, 404);
    assert.notEqual(resposta.statusCode, 403);
  });

  void it('9. pet SEU e sem pedido responde 200 com lista vazia, e nao 404', async () => {
    const b = bancada(undefined, []);
    const resposta = await listar(b, MEU_PET);
    assert.equal(resposta.statusCode, 200);
    const corpo = JSON.parse(resposta.body) as { items: unknown[] };
    assert.deepEqual(corpo.items, []);
  });

  void it('10. sem credencial responde 401, e nao devolve pedido nenhum', async () => {
    const b = bancada(undefined, UM_PEDIDO);
    const resposta = await b.app.inject({
      method: 'GET',
      url: `${PREFIXO_DA_API}/pets/${MEU_PET}/tag-requests`,
    });
    assert.equal(resposta.statusCode, 401);
    assert.doesNotMatch(resposta.body, /Ref-De-Teste/);
  });

  void it('11. nenhum endereco de entrega escorre para esta resposta', async () => {
    const b = bancada(undefined, UM_PEDIDO);
    const resposta = await listar(b, MEU_PET);
    for (const proibido of ['recipient_name', 'postal_code', 'street', 'recipient_phone']) {
      assert.doesNotMatch(resposta.body, new RegExp(proibido));
    }
  });
});
