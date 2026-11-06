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
import { corpoDe, type Contrato } from '../../../../shared/http/contract.js';
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

/**
 * A FOTO DE CAPA DO PET (cliente, 06/11/2026).
 *
 * `PUT` e nao `PATCH`: a capa e UMA, e trocar a capa troca a capa inteira --
 * nao ha campo para mesclar. E SUB-RECURSO e nao campo de `PetInput` pela
 * mesma razao medida que moveu o endereco de entrega para fora dele:
 * `PATCH updatePet` recebe `PetInput`, que exige `name`, `species` e `size`,
 * entao trocar a capa por ali obrigaria a tela da capa a reenviar o pet
 * inteiro.
 */
export const rotaDeCapaDoPet = defineRoute({
  operationId: 'setPetCover',
  method: 'put',
  path: '/pets/:petId/cover',
  effects: ['irreversible_write'],
  rateLimit: [{ dimension: ['account'], limit: 60, window: '1h', onExceed: 'deny_429' }],
});

export const rotaDeExclusaoDoPet = defineRoute({
  operationId: 'deletePet',
  method: 'delete',
  path: '/pets/:petId',
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
  /** Dominio de midia, separado da origem da aplicacao (ADR-0007). */
  readonly baseDeMidia: string;
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

function comoRespostaDoPet(
  pet: PetGravado,
  fotos: readonly FotoResumida[],
  baseDeMidia: string,
): Record<string, unknown> {
  // A CHAVE vira URL AQUI, na borda, e nao no repositorio: a base de midia e
  // dominio separado da origem da aplicacao (ADR-0007), e o mesmo arranjo das
  // derivadas da foto do pet (`thumbUrl`/`cardUrl`, montadas em `api.ts`).
  const urlDeMidia = (chave: string): string =>
    `${baseDeMidia.replace(/\/$/, '')}/${chave}`;
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
      rejection_reason: f.rejectionReason,
      thumb_url: f.thumbUrl,
      card_url: f.cardUrl,
      created_at: f.createdAt.toISOString(),
    })),
    cover_image_url: pet.coverBannerKey === null ? null : urlDeMidia(pet.coverBannerKey),
    active_tag_count: pet.activeTagCount,
    open_case_id: pet.openCaseId,
    created_at: pet.createdAt.toISOString(),
    updated_at: pet.updatedAt.toISOString(),
  };
}

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
    const fotos = await deps.fotos.porPets(pets.map((p) => p.id));
    return reply.status(200).send({
      items: pets.map((p) => comoRespostaDoPet(p, fotos.get(p.id) ?? [], deps.baseDeMidia)),
    });
  });

  registrarRota(
    app,
    rotaDeCadastroDePet,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeCadastroDePet.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
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
          donoOuToken: chamador.userId,
          endpoint: `${rotaDeCadastroDePet.method.toUpperCase()} ${rotaDeCadastroDePet.path}`,
          parametrosDeCaminho: {},
          corpo,
          agoraEmMilissegundos: deps.clock.now(),
        },
        async () => ({
          status: 201,
          body: comoRespostaDoPet(
            await deps.pets.criar(comoEntrada(corpo), chamador),
            [],
            deps.baseDeMidia,
          ),
        }),
      );

      return reply.status(resposta.status).send(resposta.body);
    },
  );

  registrarRota(app, rotaDeDetalheDoPet, {}, async (request: FastifyRequest, reply: FastifyReply) => {
    const chamador = await donoAutenticado(request, deps);
    const pet = await deps.pets.buscar(petIdDoCaminho(request), chamador);
    const fotos = await deps.fotos.porPets([pet.id]);
    return reply
      .status(200)
      .send(comoRespostaDoPet(pet, fotos.get(pet.id) ?? [], deps.baseDeMidia));
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

      const atual = await deps.pets.buscar(petId, chamador);
      const parcial = request.body as Partial<CorpoDoPet>;
      const fundido = comoEntrada({ ...comoCorpo(atual), ...parcial });

      const pet = await deps.pets.atualizar(petId, fundido, chamador);
      const fotos = await deps.fotos.porPets([petId]);
      return reply
        .status(200)
        .send(comoRespostaDoPet(pet, fotos.get(petId) ?? [], deps.baseDeMidia));
    },
  );

  registrarRota(
    app,
    rotaDeCapaDoPet,
    {
      schema: { body: corpoDe(deps.contrato, rotaDeCapaDoPet.operationId) },
      resolvedores: { account: (request) => contaDoTeto(request, deps) },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const chamador = await donoAutenticado(request, deps);
      const petId = petIdDoCaminho(request);
      const corpo = request.body as { upload_id: string };

      const pet = await deps.pets.definirCapa(petId, corpo.upload_id, chamador);
      const fotos = await deps.fotos.porPets([petId]);
      // **202, e nao 200**: a derivada ainda nao existe quando esta resposta
      // sai, entao `cover_image_url` vem NULO aqui e passa a ter valor na
      // proxima leitura. Prometer a URL agora seria prometer arquivo que nao
      // esta no balde.
      return reply
        .status(202)
        .send(comoRespostaDoPet(pet, fotos.get(petId) ?? [], deps.baseDeMidia));
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
