/** As operações da foto (BICHUS-87). */
import { problemas } from '../../../shared/http/errors.js';
import type { Clock, IdGenerator } from '../../../shared/ports/index.js';
import {
  TETO_DE_BYTES,
  chaveDoOriginal,
  ehTipoAceito,
} from '../domain/chave-de-objeto.js';
import type { FotoDoPet, MediaRepository } from '../ports/media-repository.js';
import type { AutorizacaoDeEnvio, ObjectStorage } from '../ports/object-storage.js';
import type { PetId, UserId } from '../../../shared/types/brands.js';

/** Cinco minutos para enviar, e o número vem do critério 22 de `BICHUS-87`. */
const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 300;

export interface DependenciasDeMidia {
  readonly repositorio: MediaRepository;
  readonly armazenamento: ObjectStorage;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export interface EnvioAutorizado {
  readonly uploadId: string;
  readonly autorizacao: AutorizacaoDeEnvio;
}

export class MediaService {
  constructor(private readonly deps: DependenciasDeMidia) {}

  async autorizarEnvioDeFoto(
    pet: PetId,
    dono: UserId,
    contentType: string,
    byteSize: number,
  ): Promise<EnvioAutorizado> {
    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES) throw problemas.tipoDeMidiaNaoAceito();

    if (!(await this.deps.repositorio.petEhDoTutor(pet, dono))) throw problemas.naoEncontrado();

    const uploadId = this.deps.ids.uuidv7();
    const chave = chaveDoOriginal(pet, this.deps.ids.random128());

    const autorizacao = await this.deps.armazenamento.createUploadIntent({
      classe: 'privado',
      chave,
      contentType,
      maxBytes: TETO_DE_BYTES,
      validadeEmSegundos: VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS,
    });

    await this.deps.repositorio.registrarIntencao({
      id: uploadId,
      userId: dono,
      petId: pet,
      objectKey: chave,
      declaredType: contentType,
      maxBytes: TETO_DE_BYTES,
      expiresAt: autorizacao.expiraEm,
    });

    return { uploadId, autorizacao };
  }

  /** Confirma que os bytes chegaram e enfileira o processamento. */
  async confirmarFoto(
    pet: PetId,
    dono: UserId,
    uploadId: string,
    definirComoPrincipal: boolean,
  ): Promise<FotoDoPet> {
    const agora = this.deps.clock.now();
    const intencao = await this.deps.repositorio.buscarIntencaoAberta(uploadId, dono, agora);
    if (intencao === null || intencao.petId !== pet) throw problemas.naoEncontrado();

    const cabecalho = await this.deps.armazenamento.head('privado', intencao.objectKey);
    if (cabecalho === null || cabecalho.contentLength === 0) throw problemas.envioNaoChegou();

    return this.deps.repositorio.confirmarEnvio({
      fotoId: this.deps.ids.uuidv7(),
      trabalhoId: this.deps.ids.uuidv7(),
      intencaoId: intencao.id,
      petId: pet,
      objectKey: intencao.objectKey,
      definirComoPrincipal,
      agora,
    });
  }

  async listarFotos(pet: PetId, dono: UserId): Promise<readonly FotoDoPet[]> {
    if (!(await this.deps.repositorio.petEhDoTutor(pet, dono))) throw problemas.naoEncontrado();
    return this.deps.repositorio.listarDoPet(pet, dono);
  }

  /** Exclusão lógica da foto. */
  async excluirFoto(pet: PetId, dono: UserId, fotoId: string): Promise<void> {
    const foi = await this.deps.repositorio.excluirFoto(pet, fotoId, dono, this.deps.clock.now());
    if (!foi) throw problemas.naoEncontrado();
  }
}
