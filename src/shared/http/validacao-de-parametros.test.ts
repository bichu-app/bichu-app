/**
 * Iscas da validação de parâmetros.
 *
 * A primeira é a que vale, e ela é dupla: um `petId` torto precisa responder
 * **400** e precisa **não ter chegado ao repositório**. As duas metades são
 * necessárias. Só o status provaria que a resposta melhorou; só a ausência de
 * consulta provaria que alguém recusou em algum lugar. Juntas, provam que a
 * recusa aconteceu na borda, que é onde ela tem que acontecer.
 *
 * O repositório aqui **imita o Postgres**: recebendo um id que não é UUID ele
 * levanta o mesmo `invalid input syntax for type uuid` que o banco levanta. É o
 * que faz a isca reprovar de verdade quando a validação é removida — sem isso,
 * tirar a validação daria 404 em vez de 500 e a isca ainda passaria pela metade.
 *
 * Todas as rotas deste arquivo são registradas nos caminhos do contrato real
 * (`api/openapi.yaml`), e o contrato é carregado do disco. Uma bancada com um
 * contrato de mentira provaria que o código funciona contra o contrato de
 * mentira.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { escoparRotas, registrarRota, type RegistradorDeRotas } from './registrar-rota.js';
import { defineRoute } from './route-definition.js';
import { tetoDeTeste } from './teto-de-teste.js';

// As rotas que as bancadas registram. Elas passam por `registrarRota` como
// qualquer outra: o portao de registro da BICHUS-206 nao isenta arquivo de
// teste, de proposito, e o que estes casos provam -- que o vigia de parametro
// REPROVA a subida -- continua sendo provado, porque o vigia se instala por
// `onRoute` e `registrarRota` tambem passa por la.
const ROTA_DA_TAG = defineRoute({
  operationId: 'resolveTagCode',
  method: 'get',
  path: '/tags/:code',
  effects: [],
});

/** De proposito FORA do contrato: e o que o caso da rota inventada cobra. */
const ROTA_INVENTADA = defineRoute({
  operationId: 'rotaQueNaoExisteNoContrato',
  method: 'get',
  path: '/inventada/:algumId',
  effects: [],
});

const ROTA_DE_PET = defineRoute({
  operationId: 'getPet',
  method: 'get',
  path: '/pets/:petId',
  effects: [],
});

const ROTA_DE_PETS = defineRoute({
  operationId: 'listPets',
  method: 'get',
  path: '/pets',
  effects: [],
});

import { carregarContrato, type Contrato } from './contract.js';
import { criarServidor } from './server.js';
import { ocultarCodigoDaTagNaUrl } from './redacao-de-url.js';
import { vigiarParametrosDasRotas, _decisaoDeStatus } from './validacao-de-parametros.js';
import { PetService } from '../../modules/pets/application/pet-service.js';
import type {
  CodigosConhecidos,
  PetGravado,
  PetRepository,
} from '../../modules/pets/ports/pet-repository.js';
import { registrarRotasDePets } from '../../modules/pets/adapters/http/pet-routes.js';
import { rotaDeIntencaoDeFoto } from '../../modules/media/adapters/http/media-routes.js';
import type { Idempotencia } from './idempotency.js';
import { relogioParado } from '../time/relogio-de-teste.js';
import type { AbsoluteUrl, PetId, UserId } from '../types/brands.js';

const CAMINHO_DA_SPEC = resolve(process.cwd(), 'api/openapi.yaml');
const PREFIXO = '/v1';
const BASE_DE_PROBLEMAS = 'https://problemas.invalid/problems/' as AbsoluteUrl;

/** UUID bem formado que nenhum pet tem. É o caso de "não é seu / não existe". */
const UUID_INEXISTENTE = '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f';
/** Os quatro jeitos de um id chegar torto que já apareceram de verdade. */
const IDS_TORTOS = ['abc', 'undefined', '1', '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f-extra'];

function contratoDoDisco(): Contrato {
  return carregarContrato(CAMINHO_DA_SPEC);
}

/**
 * Repositório que se comporta como o Postgres: id fora do formato de UUID vira
 * exceção, e não `null`.
 */
class RepositorioQueImitaOPostgres implements PetRepository {
  readonly recebidos: string[] = [];

  private conferir(pet: PetId): void {
    this.recebidos.push(pet);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pet)) {
      // Texto do erro 22P02 do Postgres, que é o que chega hoje sem validação.
      throw new Error(`invalid input syntax for type uuid: "${pet}"`);
    }
  }

  contarDoTutor(): Promise<number> {
    return Promise.resolve(0);
  }
  conferirCodigos(): Promise<CodigosConhecidos> {
    return Promise.resolve({
      especieExiste: true,
      porteExiste: true,
      racaExisteNaEspecie: true,
      corPrimariaExiste: true,
      corSecundariaExiste: true,
      versaoExiste: true,
    });
  }
  criar(): Promise<PetGravado> {
    throw new Error('não usado nesta bancada');
  }
  listarDoTutor(): Promise<readonly PetGravado[]> {
    return Promise.resolve([]);
  }
  buscarDoTutor(pet: PetId): Promise<PetGravado | null> {
    this.conferir(pet);
    return Promise.resolve(null);
  }
  atualizar(pet: PetId): Promise<PetGravado | null> {
    this.conferir(pet);
    return Promise.resolve(null);
  }
  excluir(pet: PetId): Promise<boolean> {
    this.conferir(pet);
    return Promise.resolve(false);
  }
}

const IDEMPOTENCIA_INERTE: Idempotencia = {
  reservar: () => Promise.resolve(undefined),
  concluir: () => Promise.resolve(),
  liberar: () => Promise.resolve(),
};

interface Bancada {
  readonly app: RegistradorDeRotas;
  readonly repositorio: RepositorioQueImitaOPostgres;
  readonly conferir: () => void;
}

async function bancadaDePets(): Promise<Bancada> {
  const contrato = contratoDoDisco();
  const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    // Exigido desde a BICHUS-178. Contador EM MEMORIA, nao desligado.
    teto: tetoDeTeste(),
  });
  const conferir = vigiarParametrosDasRotas(app, contrato, PREFIXO);

  const repositorio = new RepositorioQueImitaOPostgres();
  const pets = new PetService({
    repositorio,
    ids: {
      uuidv7: () => UUID_INEXISTENTE,
      opaqueToken: () => {
        throw new Error('não usado');
      },
      random128: () => new Uint8Array(16),
      random80: () => new Uint8Array(10),
    },
    clock: relogioParado(),
    trilha: { record: () => Promise.resolve() },
  });

  await app.register(
    (escopo, _opcoes, pronto) => {
      registrarRotasDePets(escopo, {
        pets,
        autenticador: { autenticar: () => Promise.resolve({ userId: 'u-1' as UserId }) },
        idempotencia: IDEMPOTENCIA_INERTE,
        contrato,
        clock: relogioParado(),
        fotos: { porPets: () => Promise.resolve(new Map()) },
      });
      pronto();
    },
    { prefix: PREFIXO },
  );
  await app.ready();
  return { app, repositorio, conferir };
}

void describe('petId torto na rota do dono', () => {
  void it('responde 400 e NÃO chega ao repositório', async () => {
    const { app, repositorio } = await bancadaDePets();
    try {
      for (const torto of IDS_TORTOS) {
        const resposta = await app.inject({
          method: 'GET',
          url: `${PREFIXO}/pets/${encodeURIComponent(torto)}`,
          headers: { authorization: 'Bearer qualquer' },
        });
        assert.equal(
          resposta.statusCode,
          400,
          `'${torto}' respondeu ${resposta.statusCode}. Sem validação de params ele chega ` +
            'ao Postgres e volta 500, que é um erro nosso para uma requisição do cliente.',
        );
      }
      assert.deepEqual(
        repositorio.recebidos,
        [],
        'O repositório foi consultado com um id que não é UUID. A recusa precisa ' +
          'acontecer na borda: id torto não deve virar consulta.',
      );
    } finally {
      await app.close();
    }
  });

  void it('o corpo sai em problem+json com `type` validation-failed e o campo nomeado', async () => {
    const { app } = await bancadaDePets();
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: `${PREFIXO}/pets/abc`,
        headers: { authorization: 'Bearer qualquer' },
      });
      assert.match(resposta.headers['content-type'] as string, /application\/problem\+json/);
      const corpo = resposta.json<{ type: string; status: number; errors?: { field: string }[] }>();
      assert.equal(corpo.status, 400);
      assert.match(corpo.type, /validation-failed$/);
      assert.deepEqual(
        corpo.errors?.map((e) => e.field),
        ['petId'],
      );
    } finally {
      await app.close();
    }
  });

  void it('o valor recebido não é ecoado em `detail` nem em `errors`', () => {
    // `instance` carrega o caminho por definição da RFC 9457, e ele é a própria
    // requisição de quem chamou. O que não pode acontecer é o valor voltar
    // dentro do texto do problema, que é o que acaba colado em chamado de
    // suporte e em relato de defeito.
    const problema = _decisaoDeStatus.problemaDeParametroMalformado(
      [{ instancePath: '/petId', keyword: 'format', message: 'must match format "uuid"' }],
      new Map(),
    );
    const texto = JSON.stringify(problema);
    assert.ok(!texto.includes('SEGREDO'), texto);
    assert.match(texto, /petId/);
  });

  void it('id BEM FORMADO que não é seu continua respondendo 404, e aí sim consulta', async () => {
    // Esta é a metade que a ADR-0021 protege, e ela não pode ter mudado: a
    // distinção entre "não existe" e "não é seu" continua fechada.
    const { app, repositorio } = await bancadaDePets();
    try {
      const resposta = await app.inject({
        method: 'GET',
        url: `${PREFIXO}/pets/${UUID_INEXISTENTE}`,
        headers: { authorization: 'Bearer qualquer' },
      });
      assert.equal(resposta.statusCode, 404);
      assert.match(resposta.json<{ type: string }>().type, /not-found$/);
      assert.deepEqual(repositorio.recebidos, [UUID_INEXISTENTE]);
    } finally {
      await app.close();
    }
  });

  void it('vale para DELETE e PATCH também, e não só para o GET', async () => {
    const { app, repositorio } = await bancadaDePets();
    try {
      const del = await app.inject({
        method: 'DELETE',
        url: `${PREFIXO}/pets/abc`,
        headers: { authorization: 'Bearer qualquer' },
      });
      const patch = await app.inject({
        method: 'PATCH',
        url: `${PREFIXO}/pets/abc`,
        headers: { authorization: 'Bearer qualquer', 'content-type': 'application/json' },
        payload: { name: 'Rex', species: 'dog', size: 'M' },
      });
      assert.equal(del.statusCode, 400);
      assert.equal(patch.statusCode, 400);
      assert.deepEqual(repositorio.recebidos, []);
    } finally {
      await app.close();
    }
  });

  void it('corpo inválido continua respondendo o que respondia: o formatador não vazou', async () => {
    // O `schemaErrorFormatter` é por ROTA, não por lugar. Se ele não devolvesse
    // o erro do framework para `body`, instalar a validação de parâmetro teria
    // mudado, de lado, o corpo de erro de toda rota que valida corpo.
    const { app } = await bancadaDePets();
    try {
      const resposta = await app.inject({
        method: 'PATCH',
        url: `${PREFIXO}/pets/${UUID_INEXISTENTE}`,
        headers: { authorization: 'Bearer qualquer', 'content-type': 'application/json' },
        payload: { species: 'girafa' },
      });
      assert.equal(resposta.statusCode, 400);
      assert.match(resposta.json<{ type: string }>().type, /validation-failed$/);
    } finally {
      await app.close();
    }
  });
});

void describe('código da tag: o `type` é o que o contrato declara', () => {
  async function bancadaDaTag(): Promise<{ app: RegistradorDeRotas; alcancado: string[] }> {
    const contrato = contratoDoDisco();
    const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    // Exigido desde a BICHUS-178. Contador EM MEMORIA, nao desligado.
    teto: tetoDeTeste(),
  });
    const conferir = vigiarParametrosDasRotas(app, contrato, PREFIXO);
    const alcancado: string[] = [];
    await escoparRotas(app, PREFIXO, (escopo) => {
      registrarRota(escopo, ROTA_DA_TAG, {}, (request: FastifyRequest, reply: FastifyReply) => {
        alcancado.push((request.params as { code: string }).code);
        return Promise.resolve(reply.status(200).send({ ok: true }));
      });
    });
    await app.ready();
    conferir();
    return { app, alcancado };
  }

  void it('código malformado responde 400 `tag-code-malformed`, e o manipulador não roda', async () => {
    const { app, alcancado } = await bancadaDaTag();
    try {
      const resposta = await app.inject({ method: 'GET', url: `${PREFIXO}/tags/ABC` });
      assert.equal(resposta.statusCode, 400);
      assert.match(
        resposta.json<{ type: string }>().type,
        /tag-code-malformed$/,
        'caiu no `validation-failed` genérico. O app decide a tela pelo `type`, e o ' +
          'teto de tentativas inválidas conta por `type`: trocar o tipo aqui quebra os dois.',
      );
      assert.deepEqual(alcancado, []);
    } finally {
      await app.close();
    }
  });

  void it('o que a borda ACEITA como código é exatamente o que o log OCULTA', () => {
    // Consistência que não é óbvia e que vale caro: `ocultarCodigoDaTagNaUrl`
    // hasheia o segmento por tamanho e alfabeto, e `instance` do problema sai
    // por ele. Se alguém alargar o `pattern` do contrato sem alargar a redação,
    // um código PLAUSÍVEL passaria a chegar em claro no corpo de erro e no log
    // de acesso — a credencial ao portador do ADR-0004, exatamente onde ela não
    // pode estar. As duas expressões precisam aceitar as mesmas formas.
    const doContrato = (
      (
        contratoDoDisco().parameterSchemas('resolveTagCode').params?.['properties'] as Record<
          string,
          { pattern?: string }
        >
      )['code'] ?? {}
    ).pattern;
    assert.equal(typeof doContrato, 'string');
    const aceitaNaBorda = new RegExp(doContrato as string);

    const amostras = [
      'ABCD-EFGH-JKMN-PQRS-TVWX-YZ',
      'ABCDEFGHJKMNPQRSTVWXYZ01234',
      'ABC',
      '',
      'A'.repeat(41),
      'ABCDEFGHJKMNPQRSTVWXYZ0123456789ABCDEFGH',
    ];
    for (const amostra of amostras) {
      const redigida = ocultarCodigoDaTagNaUrl(`/v1/tags/${amostra}`);
      assert.equal(
        redigida.includes('sha256:'),
        aceitaNaBorda.test(amostra),
        `'${amostra.slice(0, 12)}...' é aceito pela borda e não é ocultado no log, ou o ` +
          'contrário. As duas regras precisam concordar sobre o que tem forma de código.',
      );
    }
  });

  void it('código com a forma certa passa pela borda e chega ao manipulador', async () => {
    const { app, alcancado } = await bancadaDaTag();
    try {
      // BICHUS-154: 16 caracteres, nao 27. O `pattern` do contrato foi de
      // `{15,39}` para `{15,23}` -- a amostra antiga deixou de passar na borda,
      // e o caso media a recusa em vez da travessia. O valor e o mesmo exemplo
      // que o proprio contrato declara em `TagCode`.
      const codigo = 'GQSM-0XHB-T4D9-G31S';
      const resposta = await app.inject({ method: 'GET', url: `${PREFIXO}/tags/${codigo}` });
      assert.equal(resposta.statusCode, 200);
      assert.deepEqual(alcancado, [codigo]);
    } finally {
      await app.close();
    }
  });
});

void describe('o contrato de verdade produz os schemas de verdade', () => {
  void it('todo parâmetro de caminho do contrato vira `params`, inclusive os do item de caminho', () => {
    // Esta é a isca do defeito que quase entrou: a maior parte dos parâmetros
    // de caminho deste contrato está declarada no NÍVEL DO ITEM DE CAMINHO, e
    // ler só `raw['parameters']` devolveria schema vazio para quase tudo — com
    // toda a aparência de estar validando.
    const contrato = contratoDoDisco();
    const semParams: string[] = [];
    for (const operacao of contrato.operacoes.values()) {
      const temParametroNoCaminho = /\{[^}]+\}/.test(operacao.path);
      if (!temParametroNoCaminho) continue;
      if (contrato.parameterSchemas(operacao.operationId).params === undefined) {
        semParams.push(`${operacao.operationId} (${operacao.path})`);
      }
    }
    assert.deepEqual(
      semParams,
      [],
      'Operações com `{param}` no caminho e sem schema de `params`. Ou o contrato ' +
        'deixou de declarar o parâmetro, ou a leitura do item de caminho quebrou:\n' +
        semParams.join('\n'),
    );
  });

  void it('`getPet` exige petId em formato uuid, vindo do item de caminho', () => {
    const esquemas = contratoDoDisco().parameterSchemas('getPet');
    assert.deepEqual(esquemas.params, {
      type: 'object',
      properties: { petId: { type: 'string', format: 'uuid' } },
      required: ['petId'],
    });
    assert.equal(esquemas.querystring, undefined);
  });

  void it('operação com query string vira `querystring`, com os limites do contrato', () => {
    const esquemas = contratoDoDisco().parameterSchemas('listPublicLostPets');
    const propriedades = esquemas.querystring?.['properties'] as Record<string, unknown>;
    assert.deepEqual(propriedades['limit'], {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      default: 20,
    });
    // `city` é o único obrigatório da operação, e o resto não pode virar obrigatório.
    assert.deepEqual(esquemas.querystring?.['required'], ['city']);
  });

  void it('o `code` carrega `tag-code-malformed`, e só ele', () => {
    const contrato = contratoDoDisco();
    assert.equal(
      contrato.parameterSchemas('resolveTagCode').tiposDeProblema.get('code'),
      'tag-code-malformed',
    );
    assert.equal(contrato.parameterSchemas('getPet').tiposDeProblema.size, 0);
  });

  void it('cabeçalho NÃO entra: `Idempotency-Key` tem máquina própria', () => {
    const esquemas = contratoDoDisco().parameterSchemas('createPet');
    assert.equal(esquemas.params, undefined);
    assert.equal(esquemas.querystring, undefined);
  });
});

/**
 * Uma cópia do contrato de verdade com UM status apagado de UMA operação.
 *
 * É o recorte mínimo que faz a isca reprovar: tudo o mais continua sendo o
 * documento do disco. Escrever um contrato de mentira inteiro provaria que o
 * portão funciona contra o contrato de mentira.
 */
function semOStatus(contrato: Contrato, operationId: string, status: string): Contrato {
  return {
    ...contrato,
    operacoes: new Map(
      [...contrato.operacoes].map(([id, operacao]) =>
        id !== operationId
          ? [id, operacao]
          : [
              id,
              {
                ...operacao,
                raw: {
                  ...operacao.raw,
                  responses: Object.fromEntries(
                    Object.entries((operacao.raw['responses'] ?? {}) as Record<string, unknown>).filter(
                      ([codigo]) => codigo !== status,
                    ),
                  ),
                },
              },
            ],
      ),
    ),
    parameterSchemas: (id) => contrato.parameterSchemas(id),
    requestBodySchema: (id) => contrato.requestBodySchema(id),
    responseSchema: (id, codigo) => contrato.responseSchema(id, codigo),
  };
}

/** A rota de verdade da intenção de foto, com o corpo que o contrato declara. */
function registrarIntencaoDeFoto(escopo: RegistradorDeRotas, contrato: Contrato): void {
  registrarRota(
    escopo,
    rotaDeIntencaoDeFoto,
    {
      schema: { body: contrato.requestBodySchema(rotaDeIntencaoDeFoto.operationId) },
      resolvedores: { account: () => 'uma-conta' },
    },
    (_request, reply) => Promise.resolve(reply.status(201).send({})),
  );
}

void describe('a conferência de subida reprova em vez de aprovar calada', () => {
  async function subir(
    registrar: (escopo: RegistradorDeRotas) => void,
  ): Promise<{ conferir: () => void; app: RegistradorDeRotas }> {
    const contrato = contratoDoDisco();
    const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    // Exigido desde a BICHUS-178. Contador EM MEMORIA, nao desligado.
    teto: tetoDeTeste(),
  });
    const conferir = vigiarParametrosDasRotas(app, contrato, PREFIXO);
    await escoparRotas(app, PREFIXO, registrar);
    await app.ready();
    return { conferir, app };
  }

  void it('rota sem operação no contrato derruba a subida, nomeando a rota', async () => {
    const { conferir, app } = await subir((escopo) => {
      registrarRota(escopo, ROTA_INVENTADA, {}, (_r, reply) => Promise.resolve(reply.send({})));
    });
    try {
      assert.throws(() => conferir(), /GET \/inventada\/\{algumId\}/);
    } finally {
      await app.close();
    }
  });

  void it('rota que declara `params` por conta própria derruba a subida', async () => {
    const { conferir, app } = await subir((escopo) => {
      registrarRota(
        escopo,
        ROTA_DE_PET,
        { schema: { params: { type: 'object', properties: { petId: { type: 'string' } } } } },
        (_r, reply) => Promise.resolve(reply.send({})),
      );
    });
    try {
      assert.throws(() => conferir(), /segunda definição/);
    } finally {
      await app.close();
    }
  });

  void it('nenhuma rota coberta derruba a subida: silêncio não é aprovação', async () => {
    const { conferir, app } = await subir((escopo) => {
      // `/pets` não tem parâmetro nenhum: nada a validar, nada coberto.
      registrarRota(escopo, ROTA_DE_PETS, {}, (_r, reply) =>
        Promise.resolve(reply.send({ items: [] })),
      );
    });
    try {
      assert.throws(() => conferir(), /Nenhuma rota recebeu validação de parâmetro/);
    } finally {
      await app.close();
    }
  });

  void it('operação que pode recusar e não declara 400 derruba a subida', async () => {
    // Erro é contrato também. Responder um status que a especificação não
    // promete é a mesma divergência que não validar, na direção oposta.
    const contrato = contratoDoDisco();
    const semQuatrocentos: Contrato = {
      ...contrato,
      operacoes: new Map(
        [...contrato.operacoes].map(([id, operacao]) =>
          id !== 'getPet'
            ? [id, operacao]
            : [
                id,
                {
                  ...operacao,
                  raw: {
                    ...operacao.raw,
                    responses: Object.fromEntries(
                      Object.entries(
                        (operacao.raw['responses'] ?? {}) as Record<string, unknown>,
                      ).filter(([status]) => status !== '400'),
                    ),
                  },
                },
              ],
        ),
      ),
      parameterSchemas: (id) => contrato.parameterSchemas(id),
      requestBodySchema: (id) => contrato.requestBodySchema(id),
      responseSchema: (id, status) => contrato.responseSchema(id, status),
    };

    const app = criarServidor({
    problemBaseUrl: BASE_DE_PROBLEMAS,
    isProduction: false,
    // Exigido desde a BICHUS-178. Contador EM MEMORIA, nao desligado.
    teto: tetoDeTeste(),
  });
    const conferir = vigiarParametrosDasRotas(app, semQuatrocentos, PREFIXO);
    await escoparRotas(app, PREFIXO, (escopo) => {
      registrarRota(escopo, ROTA_DE_PET, {}, (_r, reply) => Promise.resolve(reply.send({})));
    });
    await app.ready();
    try {
      assert.throws(() => conferir(), /não o declaram/);
    } finally {
      await app.close();
    }
  });

  /**
   * A isca do CORPO, que é a metade que o portão não tinha.
   *
   * `createPetPhotoUploadIntent` não tem parâmetro nenhum: até 22/09 ela saía do
   * laço do vigia antes de qualquer conferência, e por isso passou verde durante
   * meses sem declarar o 400 que o `enum` de `content_type` produz. Aqui a rota é
   * a de verdade, o corpo é o do contrato de verdade, e o único desvio é apagar
   * o `400` de uma CÓPIA do contrato — o mesmo recorte do caso de parâmetro logo
   * acima, e a mesma razão: uma bancada com contrato inventado provaria que o
   * portão funciona contra um contrato inventado.
   */
  void it('operação que valida CORPO e não declara 400 derruba a subida', async () => {
    const contrato = contratoDoDisco();
    const semQuatrocentos = semOStatus(contrato, 'createPetPhotoUploadIntent', '400');

    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMAS,
      isProduction: false,
      teto: tetoDeTeste(),
    });
    const conferir = vigiarParametrosDasRotas(app, semQuatrocentos, PREFIXO);
    await escoparRotas(app, PREFIXO, (escopo) => {
      registrarIntencaoDeFoto(escopo, contrato);
      // Uma rota com parâmetro junto: sem ela `cobertas` seria zero e o portão
      // reprovaria por OUTRO motivo, e a isca passaria sem provar nada.
      registrarRota(escopo, ROTA_DE_PET, {}, (_r, reply) => Promise.resolve(reply.send({})));
    });
    await app.ready();
    try {
      assert.throws(() => conferir(), /createPetPhotoUploadIntent .* valida corpo/);
    } finally {
      await app.close();
    }
  });

  /**
   * O lado permissivo, que é metade do valor de um portão: ele não pode passar a
   * reprovar quem está certo. Portão que acusa o inocente é desligado na primeira
   * semana, e aí vale menos que não existir.
   */
  void it('a mesma rota, com o 400 declarado no contrato de verdade, APROVA', async () => {
    const contrato = contratoDoDisco();
    const app = criarServidor({
      problemBaseUrl: BASE_DE_PROBLEMAS,
      isProduction: false,
      teto: tetoDeTeste(),
    });
    const conferir = vigiarParametrosDasRotas(app, contrato, PREFIXO);
    await escoparRotas(app, PREFIXO, (escopo) => {
      registrarIntencaoDeFoto(escopo, contrato);
      registrarRota(escopo, ROTA_DE_PET, {}, (_r, reply) => Promise.resolve(reply.send({})));
    });
    await app.ready();
    try {
      assert.doesNotThrow(conferir);
    } finally {
      await app.close();
    }
  });

  void it('o contrato de verdade, com as rotas de pets de verdade, APROVA', async () => {
    // O contraponto dos casos acima: sem ele, um portão que reprova tudo também
    // passaria em todos eles. E é aqui que o `/v1` e o HEAD que o Fastify
    // registra sozinho para cada GET são exercitados de verdade — os dois
    // derrubariam a subida se o casamento entre rota e contrato os tratasse mal.
    const { app, conferir } = await bancadaDePets();
    try {
      assert.doesNotThrow(conferir);
    } finally {
      await app.close();
    }
  });
});

void describe('a decisão de status, no único lugar que a contém', () => {
  void it('sem `x-problem-type`, é 400 validation-failed com o campo nomeado', () => {
    const problema = _decisaoDeStatus.problemaDeParametroMalformado(
      [{ instancePath: '/petId', keyword: 'format', message: 'must match format "uuid"' }],
      new Map(),
    );
    assert.equal(problema.status, 400);
    assert.equal(problema.problemType, 'validation-failed');
  });

  void it('com `x-problem-type` conhecido, é o tipo que o contrato declara', () => {
    const problema = _decisaoDeStatus.problemaDeParametroMalformado(
      [{ instancePath: '/code', keyword: 'pattern', message: 'must match pattern' }],
      new Map([['code', 'tag-code-malformed']]),
    );
    assert.equal(problema.problemType, 'tag-code-malformed');
  });

  void it('com `x-problem-type` que a borda não sabe produzir, FALHA RUIDOSA', () => {
    // O contrário seria cair no genérico e responder um `type` que o contrato
    // não promete — em silêncio, e justamente no campo pelo qual o app decide.
    assert.throws(
      () =>
        _decisaoDeStatus.problemaDeParametroMalformado(
          [{ instancePath: '/code', keyword: 'pattern' }],
          new Map([['code', 'tipo-que-ninguem-implementou']]),
        ),
      /não sabe produzir esse problema/,
    );
  });

  void it('`{ type: string }` sozinho não recusa nada, e não cobra 400 do contrato', () => {
    assert.equal(_decisaoDeStatus.podeRecusar({ type: 'string' }), false);
    assert.equal(_decisaoDeStatus.podeRecusar({ type: 'string', format: 'uuid' }), true);
    assert.equal(_decisaoDeStatus.podeRecusar({ type: 'string', minLength: 1 }), true);
  });
});
