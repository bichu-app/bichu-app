/**
 * Rotas do cadastro do pet.
 *
 * O `operationId` de cada rota é o mesmo do contrato, e `effects`/`rateLimit`
 * **espelham** `api/openapi.yaml` — rota com efeito e sem teto não compila
 * (`shared/http/route-definition.ts`).
 *
 * Dois pontos desta fiação que não são detalhe:
 *
 * - **O corpo é validado pelo schema da própria especificação.** OpenAPI 3.1 é
 *   JSON Schema, e o Fastify valida com JSON Schema: escrever validação à mão
 *   em paralelo criaria a segunda definição, que diverge na primeira mudança.
 * - **A resposta é montada campo a campo, e não por espalhamento do objeto do
 *   domínio.** `PetGravado` carrega `careNotesRedactions` e, amanhã, o que mais
 *   o domínio precisar; um `...pet` publicaria cada campo novo por omissão. A
 *   lista explícita faz a decisão de expor ser sempre uma decisão.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { problemas } from '../../../../shared/http/errors.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { PetService, EntradaDoPet } from '../../application/pet-service.js';
import type { PetGravado } from '../../ports/pet-repository.js';
import type { PetId, UserId } from '../../../../shared/types/brands.js';

export const rotaDeListagemDePets = defineRoute({
  operationId: 'listMyPets',
  method: 'get',
  path: '/pets',
  effects: [],
});

export const rotaDeCadastroDePet = defineRoute({
  operationId: 'createPet',
  method: 'post',
  path: '/pets',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

export const rotaDeDetalheDoPet = defineRoute({
  operationId: 'getPet',
  method: 'get',
  path: '/pets/:petId',
  effects: [],
});

export const rotaDeEdicaoDoPet = defineRoute({
  operationId: 'updatePet',
  method: 'patch',
  path: '/pets/:petId',
  effects: [],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeExclusaoDoPet = defineRoute({
  operationId: 'deletePet',
  method: 'delete',
  path: '/pets/:petId',
  // Some da conta, das listas e do perfil público, e não há desfazer pela
  // interface. O registro continua existindo para a trilha (exclusão lógica),
  // e é por isso que o efeito declarado é `irreversible_write` e não `deletes`.
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 10, window: '24h', onExceed: 'deny_429' }],
});

export interface Autenticador {
  autenticar(token: string): Promise<{ userId: UserId }>;
}

export interface DependenciasDasRotasDePet {
  readonly pets: PetService;
  readonly autenticador: Autenticador;
  readonly contrato: Contrato;
}

interface CorpoDoPet {
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed_code?: string | null;
  breed_free_text?: string | null;
  ref_data_version?: string | null;
  size: 'P' | 'M' | 'G' | 'GG';
  primary_color_code?: string | null;
  secondary_color_code?: string | null;
  sex?: 'male' | 'female' | 'unknown' | null;
  neutered?: boolean | null;
  birth_date_approx?: string | null;
  distinctive_marks?: string | null;
  care_notes?: string | null;
  microchip_number?: string | null;
  sinpatinhas_id?: string | null;
}

/** Ausente e nulo são a mesma coisa aqui: "não informado". */
function ouNulo<T>(valor: T | null | undefined): T | null {
  return valor === undefined ? null : valor;
}

function comoEntrada(corpo: CorpoDoPet): EntradaDoPet {
  return {
    name: corpo.name,
    species: corpo.species,
    breedCode: ouNulo(corpo.breed_code),
    breedFreeText: ouNulo(corpo.breed_free_text),
    refDataVersion: ouNulo(corpo.ref_data_version),
    size: corpo.size,
    primaryColorCode: ouNulo(corpo.primary_color_code),
    secondaryColorCode: ouNulo(corpo.secondary_color_code),
    sex: ouNulo(corpo.sex),
    neutered: ouNulo(corpo.neutered),
    birthDateApprox: ouNulo(corpo.birth_date_approx),
    distinctiveMarks: ouNulo(corpo.distinctive_marks),
    careNotes: ouNulo(corpo.care_notes),
    microchipNumber: ouNulo(corpo.microchip_number),
    sinpatinhasId: ouNulo(corpo.sinpatinhas_id),
  };
}

/**
 * A visão do dono, campo a campo.
 *
 * `photos` sai vazio e `open_case_id` sai nulo porque `media` e `lostfound` não
 * existem nesta entrega. Ausência é o valor verdadeiro; devolver o endereço de
 * uma foto que ninguém guardou, ou um identificador de caso inventado, seria
 * uma promessa que o cliente descobre quebrada na tela.
 */
function comoRespostaDoPet(pet: PetGravado): Record<string, unknown> {
  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    breed_code: pet.breedCode,
    breed_free_text: pet.breedFreeText,
    breed_label: pet.breedLabel,
    ref_data_version: pet.refDataVersion,
    size: pet.size,
    primary_color_code: pet.primaryColorCode,
    secondary_color_code: pet.secondaryColorCode,
    sex: pet.sex,
    neutered: pet.neutered,
    birth_date_approx: pet.birthDateApprox,
    distinctive_marks: pet.distinctiveMarks,
    care_notes: pet.careNotes,
    care_notes_redactions: pet.careNotesRedactions,
    status: pet.status,
    slug: pet.slug,
    public_profile_enabled: pet.publicProfileEnabled,
    photos: [],
    active_tag_count: pet.activeTagCount,
    open_case_id: pet.openCaseId,
    created_at: pet.createdAt.toISOString(),
    updated_at: pet.updatedAt.toISOString(),
  };
}

function corpoDe(contrato: Contrato, operationId: string): Record<string, unknown> {
  const schema = contrato.requestBodySchema(operationId);
  if (schema === undefined) {
    throw new Error(
      `Operação ${operationId} não declara corpo de requisição em application/json ` +
        `no contrato, mas a rota espera um. Corrija a especificação, não o código.`,
    );
  }
  return schema;
}

async function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePet,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  const cabecalho = request.headers.authorization;
  if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
    throw problemas.naoAutenticado();
  }
  const token = cabecalho.slice('Bearer '.length).trim();
  if (token === '') throw problemas.naoAutenticado();
  const { userId } = await deps.autenticador.autenticar(token);
  return { userId, correlationId: request.id, ip: request.ip };
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId?: string };
  if (typeof petId !== 'string' || petId === '') throw problemas.naoEncontrado();
  return petId as PetId;
}

export function registrarRotasDePets(
  app: FastifyInstance,
  deps: DependenciasDasRotasDePet,
): void {
  app.get(rotaDeListagemDePets.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const pets = await deps.pets.listar(chamador);
    return reply.status(200).send({ items: pets.map(comoRespostaDoPet) });
  });

  app.post(
    rotaDeCadastroDePet.path,
    { schema: { body: corpoDe(deps.contrato, rotaDeCadastroDePet.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const pet = await deps.pets.criar(comoEntrada(request.body as CorpoDoPet), chamador);
      return reply.status(201).send(comoRespostaDoPet(pet));
    },
  );

  app.get(rotaDeDetalheDoPet.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const pet = await deps.pets.buscar(petIdDoCaminho(request), chamador);
    return reply.status(200).send(comoRespostaDoPet(pet));
  });

  app.patch(
    rotaDeEdicaoDoPet.path,
    { schema: { body: corpoDe(deps.contrato, rotaDeEdicaoDoPet.operationId) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const petId = petIdDoCaminho(request);

      // `PATCH` sobre o cadastro inteiro: o corpo parcial é fundido com o que
      // já está gravado, e a fusão acontece DEPOIS da leitura autorizada — ler
      // primeiro é o que garante que editar pet alheio responda 404 sem nunca
      // ter chegado perto de uma escrita.
      const atual = await deps.pets.buscar(petId, chamador);
      const parcial = request.body as Partial<CorpoDoPet>;
      const fundido = comoEntrada({ ...comoCorpo(atual), ...parcial });

      const pet = await deps.pets.atualizar(petId, fundido, chamador);
      return reply.status(200).send(comoRespostaDoPet(pet));
    },
  );

  app.delete(rotaDeExclusaoDoPet.path, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    await deps.pets.excluir(petIdDoCaminho(request), chamador);
    return reply.status(204).send();
  });
}

/** O gravado de volta na forma do corpo, para a fusão do `PATCH`. */
function comoCorpo(pet: PetGravado): CorpoDoPet {
  return {
    name: pet.name,
    species: pet.species,
    breed_code: pet.breedCode,
    breed_free_text: pet.breedFreeText,
    ref_data_version: pet.refDataVersion,
    size: pet.size,
    primary_color_code: pet.primaryColorCode,
    secondary_color_code: pet.secondaryColorCode,
    sex: pet.sex,
    neutered: pet.neutered,
    birth_date_approx: pet.birthDateApprox,
    distinctive_marks: pet.distinctiveMarks,
    care_notes: pet.careNotes,
    microchip_number: pet.microchipNumber,
    sinpatinhas_id: pet.sinpatinhasId,
  };
}
