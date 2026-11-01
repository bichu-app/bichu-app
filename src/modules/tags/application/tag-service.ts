import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../shared/ports/index.js';
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken, hashDoCodigoDaTag } from '../../../shared/crypto/digest.js';
import { gerarCodigoDaTag, normalizarCodigoDaTag, sufixoDoCodigo } from '../domain/tag-code.js';
import { desenharQr, urlDaTag } from '../domain/qr-da-tag.js';
import {
  JANELA_DE_AGRUPAMENTO_EM_MS,
  type ContextoDoDono,
  type TagDoTutor,
  type TagRepository,
  type TagResolvida,
} from '../ports/tag-repository.js';
import type { RasterizadorDeQr } from '../ports/rasterizador-de-qr.js';
import { TRABALHO_DE_AVISO_AO_TUTOR } from '../ports/aviso-ao-tutor.js';
import type { JobQueue } from '../../../shared/ports/job-queue.js';
import type {
  AbsoluteUrl,
  FoundReportId,
  Instant,
  OpaqueToken,
  PetId,
  TagCodeCanonical,
  TagId,
  UserId,
} from '../../../shared/types/brands.js';

const HORA = 3600 * 1000;

const JANELA_DE_JA_AVISOU_EM_MS = 24 * HORA;

const VALIDADE_DO_TOKEN_DO_ACHADOR_EM_MS = 30 * 24 * HORA;

export type Viewer = 'owner' | 'authenticated_other' | 'anonymous';

/** Quem chamou, do ponto de vista de quem já resolveu o token (ou a falta dele). */
export interface Chamador {
  readonly userId: UserId | undefined;
  /** HMAC do endereço de origem. */
  readonly ipHmac: Uint8Array | null;
  readonly userAgentHash: Uint8Array | null;
  /** Identidade derivada do achador sem conta, para agrupamento e para tetos. */
  readonly identidadeDoAchador: Uint8Array | null;
  readonly ip: string | undefined;
  readonly correlationId: string;
}

export interface DependenciasDeTags {
  readonly repositorio: TagRepository;
  readonly cifra: SecretCipher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly trilha: AuditLog;
  /** Base pública do endereço impresso na plaquinha: `{base}/t/{código}`. */
  readonly baseDaTag: AbsoluteUrl;
  /** Base das páginas públicas, de onde sai `conversation_url`. */
  readonly baseDaWeb: AbsoluteUrl;
  /** Base pública dos objetos de mídia, de onde sai `pet.photo_url`. */
  readonly baseDeMidia: AbsoluteUrl;
  /**
   * Chave do índice cego: `code_hash` é HMAC-SHA-256 do código canônico com ela
   * (ADR-0004, Emenda 1, §3.1).
   */
  readonly chaveDoIndiceDoCodigo: Buffer;
  /** Quem embrulha o desenho do QR num arquivo PNG. */
  readonly rasterizador: RasterizadorDeQr;
  /** BICHUS-43. Quem abre a conversa mediada quando o aviso é registrado. */
  readonly conversaDoAviso: AberturaDeConversaPorAviso;
  /** BICHUS — O EMISSOR DO AVISO AO TUTOR, e ele e o buraco central que faltava. */
  readonly fila: Pick<JobQueue, 'enqueue'>;
}

/** A porta acima. O aviso já gravado, na forma que a abertura precisa. */
export interface AberturaDeConversaPorAviso {
  aoRegistrarAviso(aviso: {
    readonly foundReportId: FoundReportId;
    readonly petId: PetId;
    readonly nomeDoPet: string;
    readonly escaneadoEm: Instant;
    readonly rotuloDaArea: string | null;
    readonly recado: string | null;
    readonly achadorComConta: UserId | null;
    /** O aviso anterior do mesmo achador, quando este foi agrupado a ele. */
    readonly avisoAnteriorId: FoundReportId | null;
  }): Promise<void>;
}

/** A visão pública da tag, exatamente como `TagResolution` a declara. */
export interface ResolucaoDaTag {
  readonly viewer: Viewer;
  readonly pet: {
    readonly displayName: string;
    readonly species: string;
    readonly breedLabel: string | null;
    readonly size: string;
    readonly primaryColor: string | null;
    readonly distinctiveMarks: string | null;
    readonly careNotes: string | null;
    /** `TagResolution.pet.photo_url`. */
    readonly photoUrl: string | null;
  };
  readonly lost: { readonly isLost: boolean };
  readonly alreadyNotified: boolean;
}

export interface TagEmitida {
  readonly tag: TagDoTutor;
  readonly codigo: TagCodeCanonical;
  readonly url: AbsoluteUrl;
}

/** O arquivo do QR e o sufixo que nomeia o download. */
export interface ImagemDoQr {
  readonly png: Buffer;
  /** Os quatro últimos caracteres. */
  readonly codeSuffix: string;
}

export interface AvisoCriado {
  readonly finderToken: OpaqueToken;
  readonly conversationUrl: AbsoluteUrl;
  readonly ownerNotified: boolean;
  readonly petDisplayName: string;
}

function exigirCodigoNormalizado(bruto: string): TagCodeCanonical {
  const canonico = normalizarCodigoDaTag(bruto);
  if (canonico === undefined) throw problemas.tagCodeMalformado();
  return canonico;
}

function enderecoDaFoto(chave: string | null, baseDeMidia: AbsoluteUrl): string | null {
  return chave === null ? null : `${baseDeMidia.replace(/\/$/, '')}/${chave}`;
}

function recusarTagInativa(tag: TagResolvida): void {
  if (tag.status === 'revoked' || tag.petIndisponivel) throw problemas.tagRevogada();
}

export function criarTagService(deps: DependenciasDeTags) {
  function viewerDe(tag: TagResolvida, chamador: Chamador): Viewer {
    if (chamador.userId === undefined) return 'anonymous';
    return chamador.userId === tag.ownerUserId ? 'owner' : 'authenticated_other';
  }

  return {
    async resolver(codigoBruto: string, chamador: Chamador): Promise<ResolucaoDaTag> {
      const codigo = exigirCodigoNormalizado(codigoBruto);
      const tag = await deps.repositorio.resolverPorCodigo(hashDoCodigoDaTag(codigo, deps.chaveDoIndiceDoCodigo));
      if (tag === undefined) throw problemas.tagCodeNaoEncontrado();
      recusarTagInativa(tag);

      const agora = deps.clock.now();
      await deps.repositorio.registrarScan({
        id: deps.ids.uuidv7(),
        tagId: tag.tagId,
        ipHmac: chamador.ipHmac,
        userAgentHash: chamador.userAgentHash,
        resultouEmAviso: false,
      });

      const jaAvisou = await deps.repositorio.jaAvisouRecentemente(
        tag.tagId,
        chamador.identidadeDoAchador,
        (agora - JANELA_DE_JA_AVISOU_EM_MS) as Instant,
      );

      return {
        viewer: viewerDe(tag, chamador),
        pet: {
          displayName: tag.pet.displayName,
          species: tag.pet.species,
          breedLabel: tag.pet.breedLabel,
          size: tag.pet.size,
          primaryColor: tag.pet.primaryColor,
          distinctiveMarks: tag.pet.distinctiveMarks,
          careNotes: tag.pet.careNotes,
          photoUrl: enderecoDaFoto(tag.pet.photoKey, deps.baseDeMidia),
        },
        lost: { isLost: tag.pet.isLost },
        alreadyNotified: jaAvisou,
      };
    },

    async contextoDoDono(codigoBruto: string, dono: UserId): Promise<ContextoDoDono> {
      const codigo = exigirCodigoNormalizado(codigoBruto);
      const contexto = await deps.repositorio.buscarContextoDoDono(hashDoCodigoDaTag(codigo, deps.chaveDoIndiceDoCodigo), dono);
      if (contexto === undefined) throw problemas.naoEncontrado();
      return contexto;
    },

    async listar(petId: PetId, dono: UserId): Promise<readonly TagDoTutor[]> {
      const tags = await deps.repositorio.listarTagsDoPet(petId, dono);
      if (tags === undefined) throw problemas.naoEncontrado();
      return tags;
    },

    async emitir(
      petId: PetId,
      dono: UserId,
      label: string | null,
      chamador: Chamador,
    ): Promise<TagEmitida> {
      const codigo = gerarCodigoDaTag(deps.ids.random80());
      const resultado = await deps.repositorio.emitir(
        {
          id: deps.ids.uuidv7() as TagId,
          petId,
          codeHash: hashDoCodigoDaTag(codigo, deps.chaveDoIndiceDoCodigo),
          codeCiphertext: await deps.cifra.encrypt(codigo),
          codeSuffix: sufixoDoCodigo(codigo),
          label,
        },
        dono,
        deps.clock.now(),
      );

      if (resultado.tipo === 'pet_nao_e_deste_tutor') throw problemas.naoEncontrado();
      if (resultado.tipo === 'teto_de_ativas') {
        throw problemas.tetoDeTagsAtivas();
      }
      if (resultado.tipo === 'teto_diario') {
        throw problemas.limiteDeChamadas(resultado.retryAfterSeconds);
      }

      await deps.trilha.record({
        actorKind: 'user',
        actorUserId: dono,
        actorIp: chamador.ip,
        correlationId: chamador.correlationId,
        action: 'tag.issued',
        resourceKind: 'pet_tag',
        resourceId: resultado.tag.id,
        metadata: { pet_id: petId, code_suffix: resultado.tag.codeSuffix },
      });

      return {
        tag: resultado.tag,
        codigo,
        url: urlDaTag(deps.baseDaTag, codigo),
      };
    },

    async imagemDoQr(petId: PetId, tagId: TagId, dono: UserId): Promise<ImagemDoQr> {
      const tag = await deps.repositorio.buscarParaReimpressao(petId, tagId, dono);
      if (tag === undefined) throw problemas.naoEncontrado();
      if (tag.status === 'revoked' || tag.codeCiphertext === null) throw problemas.tagRevogada();

      const decifrado = await deps.cifra.decrypt(tag.codeCiphertext);
      const codigo = normalizarCodigoDaTag(decifrado);
      if (codigo === undefined || codigo !== decifrado) {
        throw new Error(
          'O código decifrado de uma tag ativa não normaliza para ele mesmo. A ' +
            'normalização da emissão e a da resolução deixaram de ser a mesma função, ' +
            'ou o cifrado é de um formato anterior. Gerar o QR assim produziria uma ' +
            'plaquinha impressa que esta plataforma não consegue resolver, e o ' +
            'formato impresso é irreversível (ADR-0004, critério 9 da BICHUS-63). ' +
            `Tag ${tagId}.`,
        );
      }

      const desenho = desenharQr(urlDaTag(deps.baseDaTag, codigo));
      return {
        png: await deps.rasterizador.paraPng(desenho),
        codeSuffix: sufixoDoCodigo(codigo),
      };
    },

    async avisar(
      codigoBruto: string,
      chamador: Chamador,
      entrada: { readonly foundAt?: string; readonly clientNote?: string },
    ): Promise<AvisoCriado> {
      const codigo = exigirCodigoNormalizado(codigoBruto);
      const tag = await deps.repositorio.resolverPorCodigo(hashDoCodigoDaTag(codigo, deps.chaveDoIndiceDoCodigo));
      if (tag === undefined) throw problemas.tagCodeNaoEncontrado();
      recusarTagInativa(tag);

      const agora = deps.clock.now();
      const recente = await deps.repositorio.avisoRecenteDoMesmoAchador(
        tag.tagId,
        chamador.identidadeDoAchador,
        (agora - JANELA_DE_AGRUPAMENTO_EM_MS) as Instant,
      );

      const finderToken = deps.ids.opaqueToken();
      const avisoId = deps.ids.uuidv7();
      await deps.repositorio.registrarAviso({
        id: avisoId,
        tagId: tag.tagId,
        petId: tag.petId,
        reporterUserId: chamador.userId ?? null,
        finderIdentityHash: chamador.identidadeDoAchador,
        finderTokenHash: hashDeToken(finderToken),
        finderTokenExpiresAt: (agora + VALIDADE_DO_TOKEN_DO_ACHADOR_EM_MS) as Instant,
        foundAt: instanteDeFoundAt(entrada.foundAt, agora),
        notes: entrada.clientNote ?? null,
      });

      await deps.repositorio.registrarScan({
        id: deps.ids.uuidv7(),
        tagId: tag.tagId,
        ipHmac: chamador.ipHmac,
        userAgentHash: chamador.userAgentHash,
        resultouEmAviso: true,
      });

      await deps.conversaDoAviso.aoRegistrarAviso({
        foundReportId: avisoId as FoundReportId,
        petId: tag.petId,
        nomeDoPet: tag.pet.displayName,
        escaneadoEm: agora,
        rotuloDaArea: null,
        recado: entrada.clientNote ?? null,
        achadorComConta: chamador.userId ?? null,
        avisoAnteriorId: recente === undefined ? null : (recente.id as FoundReportId),
      });

      if (recente === undefined) {
        await deps.fila.enqueue(TRABALHO_DE_AVISO_AO_TUTOR, { found_report_id: avisoId });
      }

      return {
        finderToken,
        conversationUrl: `${deps.baseDaWeb}/c/${finderToken}` as AbsoluteUrl,
        ownerNotified: recente === undefined,
        petDisplayName: tag.pet.displayName,
      };
    },
  };
}

function instanteDeFoundAt(bruto: string | undefined, agora: Instant): Instant {
  if (bruto === undefined) return agora;
  const informado = Date.parse(bruto);
  if (Number.isNaN(informado)) {
    throw problemas.validacao([
      { field: 'found_at', code: 'format', message: 'Envie uma data e hora no formato ISO 8601.' },
    ]);
  }
  if (informado > agora) {
    throw problemas.validacao([
      { field: 'found_at', code: 'future', message: 'A data em que você encontrou não pode estar no futuro.' },
    ]);
  }
  return informado as Instant;
}

export type TagService = ReturnType<typeof criarTagService>;
