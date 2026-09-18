/**
 * As operações da foto (BICHUS-87).
 *
 * O desenho inteiro existe para que **o cadastro não espere pela foto**, e são
 * três chamadas em vez de uma por causa disso:
 *
 * 1. o cliente pede a autorização (`createPetPhotoUploadIntent`);
 * 2. envia os bytes **direto ao armazenamento**, sem passar por aqui;
 * 3. confirma (`confirmPetPhoto`), e a confirmação responde **202**, não 201:
 *    a foto existe e ainda não está pronta.
 *
 * Quatro regras atravessam o arquivo:
 *
 * - **O backend nunca recebe os bytes.** Nada neste arquivo lê imagem. Se um dia
 *   alguém precisar dos bytes na rota HTTP, é sinal de que o desenho mudou, e
 *   isso passa pelo ADR-0007, não por um `if` aqui.
 * - **O tipo declarado nunca é a verdade.** Ele é conferido na borda para
 *   recusar cedo o que é obviamente errado (415), e guardado só para
 *   diagnóstico. Quem decide é o worker, lendo os números mágicos dos bytes.
 * - **A foto nasce `processing` e não serve a rota pública.** Antes de o worker
 *   remover o EXIF, ela carrega a coordenada da casa do tutor.
 * - **A confirmação é a única coisa que enfileira trabalho.** Não há notificação
 *   de bucket, por decisão do ADR-0007: ela existe em todo provedor com nome,
 *   formato e garantia diferentes.
 */
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

/**
 * Dez minutos para enviar.
 *
 * Curto o bastante para que uma autorização vazada não valha nada amanhã, longo
 * o bastante para uma foto de 10 MB numa rede móvel ruim — que é a rede de quem
 * está na rua procurando o próprio animal.
 */
const VALIDADE_DA_AUTORIZACAO_EM_SEGUNDOS = 600;

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
    // 415 e não 400: o contrato declara este status para tipo não aceito, e a
    // tela tem texto próprio ("esse formato a gente não abre") em vez do texto
    // genérico de campo inválido.
    if (!ehTipoAceito(contentType)) throw problemas.tipoDeMidiaNaoAceito();
    if (byteSize <= 0 || byteSize > TETO_DE_BYTES) throw problemas.tipoDeMidiaNaoAceito();

    // A autorização só sai para pet do próprio chamador. Sem esta conferência,
    // qualquer conta pediria envio para qualquer pet, e a foto de um estranho
    // apareceria na ficha de outro animal.
    if (!(await this.deps.repositorio.petEhDoTutor(pet, dono))) throw problemas.naoEncontrado();

    const uploadId = this.deps.ids.uuidv7();
    const chave = chaveDoOriginal(pet, uploadId);

    const autorizacao = await this.deps.armazenamento.createUploadIntent({
      classe: 'privado',
      chave,
      contentType,
      // O teto vai para a POLÍTICA assinada, e não fica só aqui: o backend não
      // vê os bytes, então recusar depois seria recusar o que já foi gravado.
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

  /**
   * Confirma que os bytes chegaram e enfileira o processamento.
   *
   * O `head` no armazenamento não é zelo: sem ele, um cliente que perdeu a rede
   * no meio do envio confirmaria uma foto que não existe, e ela ficaria
   * `processing` para sempre — um cartão de pet com uma foto eternamente
   * carregando, que ninguém sabe explicar.
   */
  async confirmarFoto(
    pet: PetId,
    dono: UserId,
    uploadId: string,
    definirComoPrincipal: boolean,
  ): Promise<FotoDoPet> {
    const agora = this.deps.clock.now();
    const intencao = await this.deps.repositorio.buscarIntencaoAberta(uploadId, dono, agora);
    // Cobre não existe, não é sua, venceu e já confirmada — e as quatro são a
    // mesma resposta, para não contar a um estranho qual delas aconteceu.
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

  /**
   * Exclusão lógica da foto. Os objetos saem do armazenamento pelo expurgo, e
   * não aqui: apagar no caminho da requisição faria o tutor esperar duas
   * chamadas de rede a um serviço externo para ver um botão responder.
   */
  async excluirFoto(pet: PetId, dono: UserId, fotoId: string): Promise<void> {
    const foi = await this.deps.repositorio.excluirFoto(pet, fotoId, dono, this.deps.clock.now());
    if (!foi) throw problemas.naoEncontrado();
  }
}
