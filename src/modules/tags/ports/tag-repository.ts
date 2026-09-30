/**
 * Porta de persistência das tags.
 *
 * **A forma desta porta é onde a autorização acontece, e isso é deliberado.**
 * O ADR-0021 deixou escrito o que faltava: `getTagOwnerContext` precisa da busca
 * vinculada — `WHERE tag.code_hash = :code AND pet.owner_user_id = :caller` — na
 * camada de repositório, e não com duas consultas e uma comparação no
 * manipulador. Por isso `buscarContextoDoDono` recebe o dono como argumento
 * **obrigatório** e não existe um `buscarTagPorCodigo` que devolva o `pet_id` a
 * quem quiser comparar depois: o arranjo perigoso não está disponível.
 *
 * É a mesma correção que o SEC-001 pediu para o par id-no-caminho mais token, e
 * o mesmo princípio de `route-definition.ts`: eliminar o arranjo em vez de
 * depender de a checagem estar correta.
 *
 * O que sai daqui é a forma do domínio, não a linha do banco. Nenhum método
 * devolve `code_hash` nem `code_ciphertext` para fora.
 */
import type { Instant, PetId, TagCodeCanonical, TagId, UserId } from '../../../shared/types/brands.js';

/**
 * Janela do agrupamento: dois avisos do mesmo achador para a mesma tag em 6 h
 * são uma conversa só.
 *
 * Mora na porta, e não no serviço, porque `messaging` precisa do MESMO número
 * para achar a conversa de um aviso agrupado a partir do token dele (BICHUS-41).
 * Duas cópias do 6 divergiriam em silêncio: o aviso seria agrupado por uma e o
 * token resolvido pela outra, e o achador perderia a própria conversa.
 */
export const JANELA_DE_AGRUPAMENTO_EM_MS = 6 * 3600 * 1000;

export type StatusDaTag = 'active' | 'revoked';

export type MotivoDeRevogacao =
  | 'lost_tag'
  | 'suspected_clone'
  | 'owner_request'
  | 'pet_transferred'
  | 'pet_deceased'
  | 'pet_deleted';

/** A tag como o tutor a vê. Nunca contém o código nem o resumo dele. */
export interface TagDoTutor {
  readonly id: TagId;
  readonly status: StatusDaTag;
  readonly codeSuffix: string;
  readonly label: string | null;
  readonly scanCount: number;
  readonly lastScannedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly revocationReason: MotivoDeRevogacao | null;
  readonly createdAt: Date;
}

/**
 * O que a resolução pública precisa saber, e nada além.
 *
 * `petId` está aqui porque a rota registra o scan e grava o aviso, que são
 * escritas internas. **Ele não sai na resposta** (ADR-0010 item 6): o corpo de
 * `TagResolution` é idêntico nos três valores de `viewer`, e quem precisa do
 * identificador o busca em `getTagOwnerContext`, que exige conta.
 */
export interface TagResolvida {
  readonly tagId: TagId;
  readonly petId: PetId;
  readonly ownerUserId: UserId;
  readonly status: StatusDaTag;
  /** Verdadeiro quando o pet foi excluído, morreu ou saiu de cena. Responde 410. */
  readonly petIndisponivel: boolean;
  readonly pet: PetPublico;
}

/** A visão pública mínima do pet. Sem tutor, sem id, sem localização, sem histórico. */
export interface PetPublico {
  readonly displayName: string;
  readonly species: string;
  readonly breedLabel: string | null;
  readonly size: string;
  readonly primaryColor: string | null;
  readonly distinctiveMarks: string | null;
  readonly careNotes: string | null;
  readonly isLost: boolean;
}

export interface ContextoDoDono {
  readonly petId: PetId;
  readonly tagId: TagId;
}

/**
 * O que a reimpressão do QR precisa, e **só** o que ela precisa.
 *
 * Esta é a única forma desta porta que devolve `code_ciphertext` para fora, e
 * ela existe porque o ADR-0004 dá ao cifrado exatamente um propósito: reimprimir
 * o QR. Nem o resumo nem o código em claro saem por aqui — quem decifra é a
 * aplicação, pela porta `SecretCipher`, e o claro morre no fim da requisição.
 *
 * `status` vem junto porque a recusa da tag revogada é **410 e não 404**
 * (ADR-0004): reimprimir uma plaquinha que já não resolve entregaria um arquivo
 * com aparência de bom para uma coleira que responde "tag desativada".
 */
export interface TagParaReimpressao {
  readonly status: StatusDaTag;
  /** Nulo quando a revogação já o apagou, que é o que ela faz por restrição do ADR. */
  readonly codeCiphertext: Uint8Array | null;
}

export interface NovaTag {
  readonly id: TagId;
  readonly petId: PetId;
  readonly codeHash: Uint8Array;
  readonly codeCiphertext: Uint8Array;
  readonly codeSuffix: string;
  readonly label: string | null;
}

export interface NovoScan {
  readonly id: string;
  readonly tagId: TagId;
  readonly ipHmac: Uint8Array | null;
  readonly userAgentHash: Uint8Array | null;
  readonly resultouEmAviso: boolean;
}

export interface NovoAviso {
  readonly id: string;
  readonly tagId: TagId;
  readonly petId: PetId;
  readonly reporterUserId: UserId | null;
  readonly finderIdentityHash: Uint8Array | null;
  readonly finderTokenHash: Uint8Array;
  readonly finderTokenExpiresAt: Instant;
  readonly foundAt: Instant;
  readonly notes: string | null;
}

/** O aviso anterior que faz o novo ser agrupado em vez de tocar o telefone de novo. */
export interface AvisoRecente {
  readonly id: string;
  readonly criadoEm: Date;
}

export interface TagRepository {
  /**
   * Resolve o código para a rota pública. Busca **só** por `code_hash`: quem
   * chega aqui é um estranho com a plaquinha na mão, e a posse do código é a
   * credencial inteira.
   */
  resolverPorCodigo(codeHash: Uint8Array): Promise<TagResolvida | undefined>;

  /**
   * **A busca vinculada.** Uma consulta, com o dono na cláusula `WHERE` junto do
   * código. Devolve `undefined` nos três casos que não são do dono — código
   * inexistente, revogado, ou de outro tutor — e quem chama não consegue
   * distingui-los nem se quiser, porque a informação não chega até lá.
   */
  buscarContextoDoDono(codeHash: Uint8Array, dono: UserId): Promise<ContextoDoDono | undefined>;

  /** Lista as tags de um pet **deste** tutor. Pet de outro tutor devolve `undefined`. */
  listarTagsDoPet(petId: PetId, dono: UserId): Promise<readonly TagDoTutor[] | undefined>;

  /**
   * **A segunda busca vinculada.** O cifrado da tag, para reimprimir o QR, com
   * `pets.owner_user_id` na mesma cláusula `WHERE` que `pet_tags.id` e
   * `pet_tags.pet_id`.
   *
   * Devolve `undefined` para os quatro casos que não são do dono — pet
   * inexistente, tag inexistente, tag de outro pet, pet de outro tutor — e quem
   * chama não consegue distingui-los **nem se quiser**, porque a informação não
   * chega até lá. É a forma do ADR-0021 aplicada à rota que revela credencial:
   * o `dono` é argumento obrigatório e não existe variante que devolva a linha
   * para alguém comparar o tutor depois.
   *
   * O par `(petId, tagId)` entra inteiro no `WHERE` de propósito. Buscar só por
   * `tagId` e confiar que o `petId` do caminho bate deixaria a autorização
   * correta e o endereçamento errado: a tag de um pet respondendo sob o id de
   * outro pet do mesmo tutor.
   */
  buscarParaReimpressao(
    petId: PetId,
    tagId: TagId,
    dono: UserId,
  ): Promise<TagParaReimpressao | undefined>;

  /**
   * Emite, contando os tetos na mesma transação em que insere. Contar antes e
   * inserir depois deixa duas emissões simultâneas passarem pelo teto de 5.
   */
  emitir(nova: NovaTag, dono: UserId, agora: Instant): Promise<ResultadoDaEmissao>;

  registrarScan(scan: NovoScan): Promise<void>;

  /** O aviso do achador, mais a marca no scan que o originou. */
  registrarAviso(aviso: NovoAviso): Promise<void>;

  /**
   * O aviso anterior do **mesmo achador** para a **mesma tag** dentro da janela.
   * É o que decide agrupar em vez de notificar de novo.
   */
  avisoRecenteDoMesmoAchador(
    tagId: TagId,
    finderIdentityHash: Uint8Array | null,
    desde: Instant,
  ): Promise<AvisoRecente | undefined>;

  /** Se este mesmo aparelho já avisou nas últimas 24 h. Muda o texto do botão. */
  jaAvisouRecentemente(
    tagId: TagId,
    finderIdentityHash: Uint8Array | null,
    desde: Instant,
  ): Promise<boolean>;
}

export type ResultadoDaEmissao =
  | { readonly tipo: 'emitida'; readonly tag: TagDoTutor }
  /** O pet não existe, foi excluído, ou é de outro tutor. Os três são 404. */
  | { readonly tipo: 'pet_nao_e_deste_tutor' }
  /** Teto de 5 tags ativas por pet. É 409: o tutor revoga uma e emite de novo. */
  | { readonly tipo: 'teto_de_ativas' }
  /** Teto de 10 emissões por pet em 24 h. É 429, e emissão em massa é o vetor. */
  | { readonly tipo: 'teto_diario'; readonly retryAfterSeconds: number };

/** Só para deixar o tipo do código canônico visível nesta porta. */
export type { TagCodeCanonical };
