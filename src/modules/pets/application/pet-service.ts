/** As operações do cadastro do pet. */
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import { problemas } from '../../../shared/http/errors.js';
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import { conferirRaca } from '../domain/breed.js';
import type { DadosDoPet, PetGravado, PetRepository } from '../ports/pet-repository.js';
import type { PetId, UserId } from '../../../shared/types/brands.js';

/** Teto de pets por conta, como o contrato declara em `PetLimitReached`. */
export const TETO_DE_PETS_POR_CONTA = 20;

/**
 * Teto de `care_notes` **depois da redação**, igual ao `CHECK`
 * `pets_care_notes_tamanho` da migração `20260917000006_pets.sql`
 * (`char_length(care_notes) <= 280`).
 */
export const TETO_DE_CARE_NOTES = 280;

export interface DependenciasDePets {
  readonly repositorio: PetRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
}

/** O que a rota entrega, já normalizado: ainda **sem** redação nem validação. */
export type EntradaDoPet = Omit<DadosDoPet, 'careNotesRedactions'>;

export interface ContextoDoChamador {
  readonly userId: UserId;
  readonly correlationId: string;
  readonly ip: string | undefined;
}

export class PetService {
  constructor(private readonly deps: DependenciasDePets) {}

  async criar(entrada: EntradaDoPet, chamador: ContextoDoChamador): Promise<PetGravado> {
    const quantos = await this.deps.repositorio.contarDoTutor(chamador.userId);
    if (quantos >= TETO_DE_PETS_POR_CONTA) throw problemas.tetoDePetsDaConta();

    const dados = await this.prepararEConferir(entrada);
    const id = this.deps.ids.uuidv7() as PetId;
    const pet = await this.deps.repositorio.criar(id, chamador.userId, dados);

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.created',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: pet.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });

    return pet;
  }

  async listar(chamador: ContextoDoChamador): Promise<readonly PetGravado[]> {
    return this.deps.repositorio.listarDoTutor(chamador.userId);
  }

  async buscar(pet: PetId, chamador: ContextoDoChamador): Promise<PetGravado> {
    const achado = await this.deps.repositorio.buscarDoTutor(pet, chamador.userId);
    if (achado === null) throw problemas.naoEncontrado();
    return achado;
  }

  async atualizar(
    pet: PetId,
    entrada: EntradaDoPet,
    chamador: ContextoDoChamador,
  ): Promise<PetGravado> {
    const dados = await this.prepararEConferir(entrada);
    const atualizado = await this.deps.repositorio.atualizar(pet, chamador.userId, dados);
    if (atualizado === null) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.updated',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: atualizado.id,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });

    return atualizado;
  }

  async excluir(pet: PetId, chamador: ContextoDoChamador): Promise<void> {
    const foi = await this.deps.repositorio.excluir(pet, chamador.userId, this.deps.clock.now());
    if (!foi) throw problemas.naoEncontrado();

    await this.deps.trilha.record({
      actorKind: 'user',
      action: 'pet.deleted',
      actorUserId: chamador.userId,
      resourceKind: 'pet',
      resourceId: pet,
      correlationId: chamador.correlationId,
      actorIp: chamador.ip,
    });
  }

  /**
   * Redige, confere a raça e confere os códigos — nesta ordem, e a ordem importa: a
   * redação muda o texto que será gravado, e conferir antes dela validaria um valor
   * que não é o que vai para o banco.
   */
  private async prepararEConferir(entrada: EntradaDoPet): Promise<DadosDoPet> {
    const redigido = redigirCanalMediado(entrada.careNotes);

    const problemaDaRaca = conferirRaca({
      breedCode: entrada.breedCode,
      breedFreeText: entrada.breedFreeText,
    });
    if (problemaDaRaca !== null) throw problemaDaRaca === 'codigo_outro_sem_texto'
      ? problemas.validacao([
          { field: 'breed_free_text', code: 'required', message: 'Diga qual é a raça.' },
        ])
      : problemas.validacao([
          {
            field: 'breed_free_text',
            code: 'conflict',
            message: 'Texto livre só com raça "outra". Escolha uma das duas.',
          },
        ]);

    const dados: DadosDoPet = {
      ...entrada,
      careNotes: entrada.careNotes === null ? null : redigido.texto,
      careNotesRedactions: redigido.retirados,
    };

    const conhecidos = await this.deps.repositorio.conferirCodigos(dados);
    const invalidos: { field: string; code: string; message: string }[] = [];
    if (!conhecidos.especieExiste) {
      invalidos.push({ field: 'species', code: 'unknown', message: 'Espécie desconhecida.' });
    }
    if (!conhecidos.porteExiste) {
      invalidos.push({ field: 'size', code: 'unknown', message: 'Porte desconhecido.' });
    }
    if (!conhecidos.racaExisteNaEspecie) {
      invalidos.push({ field: 'breed_code', code: 'unknown', message: 'Raça desconhecida para esta espécie.' });
    }
    if (!conhecidos.corPrimariaExiste) {
      invalidos.push({ field: 'primary_color_code', code: 'unknown', message: 'Cor desconhecida.' });
    }
    if (!conhecidos.corSecundariaExiste) {
      invalidos.push({ field: 'secondary_color_code', code: 'unknown', message: 'Cor desconhecida.' });
    }
    if (!conhecidos.versaoExiste) {
      invalidos.push({ field: 'ref_data_version', code: 'unknown', message: 'Versão de lista desconhecida.' });
    }
    if (dados.careNotes !== null && [...dados.careNotes].length > TETO_DE_CARE_NOTES) {
      invalidos.push({
        field: 'care_notes',
        code: 'too_long',
        message: `A nota passou de ${String(TETO_DE_CARE_NOTES)} caracteres depois de retirarmos os dados de contato. Encurte a nota.`,
      });
    }
    if (invalidos.length > 0) throw problemas.validacao(invalidos);

    return dados;
  }
}
