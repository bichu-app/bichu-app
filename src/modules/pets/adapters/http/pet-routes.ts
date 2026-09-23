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
 * - **`createPet` passa por `executarComIdempotencia`.** O contrato declara
 *   `Idempotency-Key` na operação, e o portão de subida derruba a aplicação se
 *   a rota registrada divergir do contrato — nos dois sentidos. Foi ele que
 *   pegou esta rota na primeira subida: eu a registrei sem a máquina, e o
 *   serviço se recusou a subir em vez de aceitar cadastro duplicado da fila
 *   offline de um cliente sem rede. O defeito que ele evita é caro e silencioso:
 *   o reenvio criaria um SEGUNDO pet, com outro id, e o tutor veria o animal
 *   duplicado sem entender por quê.
 * - **A resposta é montada campo a campo, e não por espalhamento do objeto do
 *   domínio.** `PetGravado` carrega `careNotesRedactions` e, amanhã, o que mais
 *   o domínio precisar; um `...pet` publicaria cada campo novo por omissão. A
 *   lista explícita faz a decisão de expor ser sempre uma decisão.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { defineRoute } from '../../../../shared/http/route-definition.js';
import { registrarRota, type RegistradorDeRotas } from '../../../../shared/http/registrar-rota.js';
import { memoDaRequisicao } from '../../../../shared/http/memo-de-requisicao.js';
import { problemas } from '../../../../shared/http/errors.js';
import {
  executarComIdempotencia,
  exigenciaDeIdempotencia,
  type Idempotencia,
} from '../../../../shared/http/idempotency.js';
import type { Contrato } from '../../../../shared/http/contract.js';
import type { Clock } from '../../../../shared/ports/index.js';
import type { PetService, EntradaDoPet } from '../../application/pet-service.js';
import type { PetGravado } from '../../ports/pet-repository.js';
import type { FotoResumida, FotosDoPet } from '../../ports/fotos-do-pet.js';
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
  readonly idempotencia: Idempotencia;
  readonly contrato: Contrato;
  readonly clock: Clock;
  readonly fotos: FotosDoPet;
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
 * `open_case_id` sai nulo porque `lostfound` não existe nesta entrega. Ausência
 * é o valor verdadeiro; um identificador de caso inventado seria uma promessa
 * que o cliente descobre quebrada na tela.
 *
 * `photos` traz o ESTADO de cada foto, e não só as prontas. É o que sustenta o
 * cartão do pet dizendo "enviando" em vez de mostrar um espaço vazio que o
 * tutor não sabe se é erro dele: uma foto `processing` existe, aparece na lista
 * e tem as duas URLs nulas.
 */
function comoRespostaDoPet(
  pet: PetGravado,
  fotos: readonly FotoResumida[],
): Record<string, unknown> {
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
    photos: fotos.map((f) => ({
      id: f.id,
      status: f.status,
      is_primary: f.isPrimary,
      thumb_url: f.thumbUrl,
      card_url: f.cardUrl,
      created_at: f.createdAt.toISOString(),
    })),
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

/**
 * MEMOIZADA por requisição: o teto por `account` precisa do dono antes do
 * handler, e o handler precisa do mesmo dono. Sem a memória, toda rota de pet
 * passaria a verificar o token e a ler `users` duas vezes.
 */
function donoAutenticado(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePet,
): Promise<{ userId: UserId; correlationId: string; ip: string | undefined }> {
  return memoDaRequisicao(request, 'pets:dono', async () => {
    const cabecalho = request.headers.authorization;
    if (typeof cabecalho !== 'string' || !cabecalho.startsWith('Bearer ')) {
      throw problemas.naoAutenticado();
    }
    const token = cabecalho.slice('Bearer '.length).trim();
    if (token === '') throw problemas.naoAutenticado();
    const { userId } = await deps.autenticador.autenticar(token);
    return { userId, correlationId: request.id, ip: request.ip };
  });
}

/**
 * `account` para o teto. Quem não apresentou credencial válida não tem balde de
 * conta — a recusa dele é o 401 do handler, não um 429.
 */
async function contaDoTeto(
  request: FastifyRequest,
  deps: DependenciasDasRotasDePet,
): Promise<string | undefined> {
  try {
    return (await donoAutenticado(request, deps)).userId;
  } catch {
    return undefined;
  }
}

function petIdDoCaminho(request: FastifyRequest): PetId {
  const { petId } = request.params as { petId?: string };
  if (typeof petId !== 'string' || petId === '') throw problemas.naoEncontrado();
  return petId as PetId;
}

export function registrarRotasDePets(
  app: RegistradorDeRotas,
  deps: DependenciasDasRotasDePet,
): void {
  registrarRota(app, rotaDeListagemDePets, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const pets = await deps.pets.listar(chamador);
    // UMA consulta para as fotos de todos os pets: a lista do tutor é a tela
    // inicial do app, e uma leitura por pet aqui seria N+1 no caminho mais
    // percorrido do produto.
    const fotos = await deps.fotos.porPets(pets.map((p) => p.id));
    return reply.status(200).send({
      items: pets.map((p) => comoRespostaDoPet(p, fotos.get(p.id) ?? [])),
    });
  });

  registrarRota(
    app,
    rotaDeCadastroDePet,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeCadastroDePet.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
      // A marca que o portão de subida confere contra o contrato. Ela não faz a
      // idempotência acontecer — quem faz é `executarComIdempotencia`, abaixo —,
      // ela faz a divergência entre os dois ser impossível de passar batida.
      config: { idempotencia: true },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const corpo = request.body as CorpoDoPet;

      const resposta = await executarComIdempotencia(
        deps.idempotencia,
        {
          exigencia: exigenciaDeIdempotencia(deps.contrato, rotaDeCadastroDePet.operationId),
          chaveDoCabecalho: request.headers['idempotency-key'],
          // Sempre há conta aqui: `donoAutenticado` já recusou quem não tem. A
          // chave é escopada pelo tutor, então a chave de um não devolve nunca
          // o pet de outro.
          donoOuToken: chamador.userId,
          endpoint: `${rotaDeCadastroDePet.method.toUpperCase()} ${rotaDeCadastroDePet.path}`,
          // `/pets` nao tem parametro de caminho, e `{}` aqui e o fato, nao
          // omissao: `corpoCanonicoDoPedido` so exige valor para o que o molde
          // da rota declara.
          parametrosDeCaminho: {},
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          // Pet recém-criado não tem foto, e `[]` aqui é o fato, não um atalho.
          body: comoRespostaDoPet(await deps.pets.criar(comoEntrada(corpo), chamador), []),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  registrarRota(app, rotaDeDetalheDoPet, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const pet = await deps.pets.buscar(petIdDoCaminho(request), chamador);
    const fotos = await deps.fotos.porPets([pet.id]);
    return reply.status(200).send(comoRespostaDoPet(pet, fotos.get(pet.id) ?? []));
  });

  registrarRota(
    app,
    rotaDeEdicaoDoPet,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeEdicaoDoPet.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
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
      const fotos = await deps.fotos.porPets([petId]);
      return reply.status(200).send(comoRespostaDoPet(pet, fotos.get(petId) ?? []));
    },
  );

  registrarRota(
    app,
    rotaDeExclusaoDoPet,
    { resolvedores: { account: (request) => contaDoTeto(request, deps) } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      await deps.pets.excluir(petIdDoCaminho(request), chamador);
      return reply.status(204).send();
    },
  );
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
