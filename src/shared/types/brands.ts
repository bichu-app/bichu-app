declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** UUIDv7 gerado pelo NOSSO banco. */
export type UserId = Brand<string, 'UserId'>;
/** `admin_accounts.id`: a conta do PAINEL (ADR-0027 item 20). */
export type AdminAccountId = Brand<string, 'AdminAccountId'>;
export type PetId = Brand<string, 'PetId'>;
export type CaseId = Brand<string, 'CaseId'>;
export type TagId = Brand<string, 'TagId'>;
export type ConversationId = Brand<string, 'ConversationId'>;
export type FoundReportId = Brand<string, 'FoundReportId'>;

/** Chave de objeto no armazenamento. */
export type ObjectKey = Brand<string, 'ObjectKey'>;

/**
 * URL absoluta, montada na leitura a partir de PUBLIC_BASE_URL ou
 * MEDIA_PUBLIC_BASE_URL.
 */
export type AbsoluteUrl = Brand<string, 'AbsoluteUrl'>;

/** Token opaco ao portador. */
export type OpaqueToken = Brand<string, 'OpaqueToken'>;

/**
 * SHA-256 de um token ao portador: **os 32 BYTES do resumo**, e não o texto base64
 * deles.
 */
export type TokenHash = Brand<Buffer, 'TokenHash'>;

/**
 * Código da tag JÁ normalizado: 16 caracteres, Crockford Base32, maiúsculas — 15
 * de aleatoriedade (75 bits) e 1 de verificação, este já conferido.
 */
export type TagCodeCanonical = Brand<string, 'TagCodeCanonical'>;

/** Endereço público do pet, sem o arroba. */
export type Slug = Brand<string, 'Slug'>;

/** Instante em milissegundos desde a época. */
export type Instant = Brand<number, 'Instant'>;
