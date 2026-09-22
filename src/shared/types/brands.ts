/**
 * Tipos marcados (branded types).
 *
 * Existem para tornar erro de categoria um erro de COMPILAÇÃO, e não uma regra
 * que alguém precisa lembrar na revisão. Duas em especial vêm direto de regras
 * normativas da arquitetura:
 *
 * - `ObjectKey` contra `AbsoluteUrl`: nenhuma URL absoluta é persistida
 *   (docs/03-arquitetura.md, §11.1 proibição 9 e §11.5). O banco guarda chave e
 *   token; a URL é montada na leitura. Com estes tipos, gravar uma URL numa
 *   coluna de chave não passa do compilador.
 * - `TagCodeCanonical`: só existe depois da normalização descrita no contrato
 *   (ADR-0004). Um `string` cru vindo da requisição não é aceito onde o código
 *   canônico é esperado.
 *
 * Nenhum destes tipos tem custo em tempo de execução: são `string` depois da
 * compilação.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** UUIDv7 gerado pelo NOSSO banco. Única chave que o resto do sistema referencia (ADR-0002). */
export type UserId = Brand<string, 'UserId'>;
export type PetId = Brand<string, 'PetId'>;
export type CaseId = Brand<string, 'CaseId'>;
export type TagId = Brand<string, 'TagId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type FoundReportId = Brand<string, 'FoundReportId'>;

/** Chave de objeto no armazenamento. NUNCA uma URL. */
export type ObjectKey = Brand<string, 'ObjectKey'>;

/**
 * URL absoluta, montada na leitura a partir de PUBLIC_BASE_URL ou
 * MEDIA_PUBLIC_BASE_URL. **Não é persistível**: nenhuma porta de persistência
 * aceita este tipo.
 */
export type AbsoluteUrl = Brand<string, 'AbsoluteUrl'>;

/** Token opaco ao portador. O que se persiste é o HASH dele, nunca o valor. */
export type OpaqueToken = Brand<string, 'OpaqueToken'>;
export type TokenHash = Brand<string, 'TokenHash'>;

/**
 * Código da tag JÁ normalizado: 16 caracteres, Crockford Base32, maiúsculas —
 * 15 de aleatoriedade (75 bits) e 1 de verificação, este já conferido.
 */
export type TagCodeCanonical = Brand<string, 'TagCodeCanonical'>;

/** Endereço público do pet, sem o arroba. */
export type Slug = Brand<string, 'Slug'>;

/** Instante em milissegundos desde a época. Só sai de `Clock` (shared/time). */
export type Instant = Brand<number, 'Instant'>;
