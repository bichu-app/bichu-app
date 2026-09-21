/**
 * As operações do código da tag.
 *
 * Quatro regras atravessam este arquivo inteiro, e nenhuma delas é preferência:
 *
 * 1. **`resolveTagCode` não devolve UUID nenhum.** O corpo é idêntico nos três
 *    valores de `viewer`, e `viewer` é sinal de navegação, não chave que
 *    destranca campo (ADR-0010 item 6, ADR-0021, SEC-001). Quem precisa de
 *    `pet_id` e `tag_id` chama `getTagOwnerContext`, que exige conta.
 * 2. **A autorização de `getTagOwnerContext` mora na cláusula `WHERE`**, e é a
 *    porta do repositório que impõe isso: aqui não existe a informação que
 *    permitiria comparar dono depois de buscar. Ver `ports/tag-repository.ts`.
 * 3. **Tag revogada responde 410 com `next_action`, nunca 404** (ADR-0004).
 * 4. **O contato é mediado.** Telefone, e-mail e endereço não aparecem em
 *    resposta nenhuma daqui, para ninguém. A forma mais barata de sustentar isso
 *    é o dado não passar por este arquivo, e ele não passa.
 *
 * Sem framework, sem banco e sem relógio de parede: tudo entra por porta.
 */
import type { AuditLog } from '../../audit/ports/audit-log.js';
import type { Clock, IdGenerator, SecretCipher } from '../../../shared/ports/index.js';
import { problemas } from '../../../shared/http/errors.js';
import { hashDeToken, hashDoCodigoDaTag } from '../../../shared/crypto/digest.js';
import { gerarCodigoDaTag, normalizarCodigoDaTag, sufixoDoCodigo } from '../domain/tag-code.js';
import type {
  ContextoDoDono,
  TagDoTutor,
  TagRepository,
  TagResolvida,
} from '../ports/tag-repository.js';
import type {
  AbsoluteUrl,
  Instant,
  OpaqueToken,
  PetId,
  TagCodeCanonical,
  TagId,
  UserId,
} from '../../../shared/types/brands.js';

const HORA = 3600 * 1000;

/** Janela do agrupamento: dois avisos do mesmo achador em 6 h são uma conversa só. */
const JANELA_DE_AGRUPAMENTO_EM_MS = 6 * HORA;

/** "Você já avisou" muda o texto do botão; não impede avisar de novo. */
const JANELA_DE_JA_AVISOU_EM_MS = 24 * HORA;

/** O token do achador vale enquanto o caso estiver aberto, mais 30 dias. */
const VALIDADE_DO_TOKEN_DO_ACHADOR_EM_MS = 30 * 24 * HORA;

export type Viewer = 'owner' | 'authenticated_other' | 'anonymous';

/** Quem chamou, do ponto de vista de quem já resolveu o token (ou a falta dele). */
export interface Chamador {
  readonly userId: UserId | undefined;
  /** HMAC do endereço de origem. Nunca o endereço. */
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
  /**
   * Chave do índice cego: `code_hash` é HMAC-SHA-256 do código canônico com ela
   * (ADR-0004, Emenda 1, §3.1). Entra por dependência, e não por `import` de
   * configuração, pelo mesmo motivo do relógio: domínio e aplicação não leem
   * ambiente.
   */
  readonly chaveDoIndiceDoCodigo: Buffer;
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
  };
  readonly lost: { readonly isLost: boolean };
  readonly alreadyNotified: boolean;
}

export interface TagEmitida {
  readonly tag: TagDoTutor;
  readonly codigo: TagCodeCanonical;
  readonly url: AbsoluteUrl;
}

export interface AvisoCriado {
  readonly finderToken: OpaqueToken;
  readonly conversationUrl: AbsoluteUrl;
  readonly ownerNotified: boolean;
  readonly petDisplayName: string;
}

/**
 * Normaliza ou recusa. É a primeira coisa que toda operação de código faz, e o
 * `400` que ela produz é diferente do `404` de propósito: um diz "confira o que
 * você digitou", o outro diz "não encontramos este código".
 */
function exigirCodigoNormalizado(bruto: string): TagCodeCanonical {
  const canonico = normalizarCodigoDaTag(bruto);
  if (canonico === undefined) throw problemas.tagCodeMalformado();
  return canonico;
}

/**
 * A recusa da rota pública, para tag revogada **e** para pet indisponível.
 *
 * Os dois casos respondem o mesmo 410 com o mesmo texto. O motivo da revogação
 * não sai: `pet_deceased` numa resposta pública faria alguém descobrir a morte
 * de um animal por uma página web (ADR-0004).
 */
function recusarTagInativa(tag: TagResolvida): void {
  if (tag.status === 'revoked' || tag.petIndisponivel) throw problemas.tagRevogada();
}

export function criarTagService(deps: DependenciasDeTags) {
  function viewerDe(tag: TagResolvida, chamador: Chamador): Viewer {
    if (chamador.userId === undefined) return 'anonymous';
    return chamador.userId === tag.ownerUserId ? 'owner' : 'authenticated_other';
  }

  return {
    /**
     * `GET /v1/tags/{code}` — a operação mais pública do produto.
     *
     * Aceita chamador sem conta, e o corpo que ela devolve é o mesmo para os
     * três `viewer`. O único efeito é o registro do scan, que é o que faz esta
     * leitura ter `x-effects: [irreversible_write]` no contrato.
     */
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
        },
        lost: { isLost: tag.pet.isLost },
        alreadyNotified: jaAvisou,
      };
    },

    /**
     * `GET /v1/tags/{code}/owner-context` — os identificadores, só para o dono.
     *
     * **Um 404 para os três casos que não são do dono**: código inexistente,
     * revogado, ou de outro tutor. Distinguir confirmaria a existência de tag
     * alheia a qualquer pessoa com conta e faria desta rota um oráculo de
     * enumeração com um cadastro grátis na frente (ADR-0010 item 9, ADR-0021).
     *
     * Note que não há `if` de dono aqui. Não há porque não há o que comparar: a
     * consulta já volta vazia quando o chamador não é o tutor.
     */
    async contextoDoDono(codigoBruto: string, dono: UserId): Promise<ContextoDoDono> {
      const codigo = exigirCodigoNormalizado(codigoBruto);
      const contexto = await deps.repositorio.buscarContextoDoDono(hashDoCodigoDaTag(codigo, deps.chaveDoIndiceDoCodigo), dono);
      if (contexto === undefined) throw problemas.naoEncontrado();
      return contexto;
    },

    /** `GET /v1/pets/{petId}/tags`. Pet de outro tutor é 404, não 403. */
    async listar(petId: PetId, dono: UserId): Promise<readonly TagDoTutor[]> {
      const tags = await deps.repositorio.listarTagsDoPet(petId, dono);
      if (tags === undefined) throw problemas.naoEncontrado();
      return tags;
    },

    /**
     * `POST /v1/pets/{petId}/tags` — **a única resposta que traz o código em
     * claro.** Depois daqui ele não é recuperável por API: o banco guarda o
     * resumo e o cifrado, e o cifrado só serve para reimprimir o QR.
     */
    async emitir(
      petId: PetId,
      dono: UserId,
      label: string | null,
      chamador: Chamador,
    ): Promise<TagEmitida> {
      const codigo = gerarCodigoDaTag(deps.ids.random128());
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
        // Nunca o código, nem em pedaço grande o bastante para reduzir a busca.
        // O sufixo de quatro caracteres é o que o próprio tutor já vê na lista.
        metadata: { pet_id: petId, code_suffix: resultado.tag.codeSuffix },
      });

      return {
        tag: resultado.tag,
        codigo,
        url: `${deps.baseDaTag}/t/${codigo}` as AbsoluteUrl,
      };
    },

    /**
     * `POST /v1/tags/{code}/found-reports` — o aviso de quem achou.
     *
     * **Não exige conta, e funciona com corpo vazio:** um toque, zero campos. É
     * a operação mais crítica do produto e a exceção permanente da política de
     * autenticação.
     *
     * `owner_notified` é falso **apenas** quando o aviso foi agrupado a um
     * recente do mesmo achador. O aviso em si nunca é descartado, e a tela do
     * achador continua dizendo a verdade.
     */
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
      await deps.repositorio.registrarAviso({
        id: deps.ids.uuidv7(),
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

      return {
        finderToken,
        conversationUrl: `${deps.baseDaWeb}/c/${finderToken}` as AbsoluteUrl,
        ownerNotified: recente === undefined,
        petDisplayName: tag.pet.displayName,
      };
    },
  };
}

/**
 * `found_at` do corpo, quando veio, e o instante do servidor quando não veio.
 *
 * Data no futuro é recusada: ela viajaria para a linha do tempo do caso e
 * colocaria o achado antes do desaparecimento. Data anterior é aceita — o
 * achador pode estar avisando horas depois, sem sinal no momento em que
 * encontrou o animal, que é o caminho para o qual a fila offline existe.
 */
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
