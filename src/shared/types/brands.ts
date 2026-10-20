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
 * Nenhum destes tipos tem custo em tempo de execução: a marca existe só para o
 * compilador, e depois dele sobra o tipo que está dentro de `Brand<...>` — que
 * é `string` em todos menos em `TokenHash`, onde é `Buffer`.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** UUIDv7 gerado pelo NOSSO banco. Única chave que o resto do sistema referencia (ADR-0002). */
export type UserId = Brand<string, 'UserId'>;
/**
 * `admin_accounts.id`: a conta do PAINEL (ADR-0027 item 20). Marca propria, e
 * nao `UserId`, porque as duas identidades vivem em tabelas separadas por
 * decisao: trocar uma pela outra nao compila (T18 de `04-seguranca.md` 22.11).
 */
export type AdminAccountId = Brand<string, 'AdminAccountId'>;
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

/**
 * SHA-256 de um token ao portador: **os 32 BYTES do resumo**, e não o texto
 * base64 deles.
 *
 * `Buffer` e não `string`, e isso é o conserto de um defeito medido. A marca
 * era `Brand<string, 'TokenHash'>` com base64 dentro, e as colunas são `bytea`:
 * o adaptador fechava a distância com `Buffer.from(hash)` — sem segundo
 * argumento, portanto **utf8** — e o que chegava ao banco eram os 44 bytes
 * ASCII do texto base64, não o resumo. Escrita e leitura erravam igual, então
 * nada acusava: medido em homologação em 19/10/2026 (commit `458cd005`), 14
 * linhas de `verification_tokens` com `octet_length = 44` onde SHA-256 tem 32.
 *
 * Com `Buffer` aqui não sobra conversão nenhuma para errar: `hashDeToken` já
 * devolve os 32 bytes, o Kysely os entrega ao `bytea`, e é o mesmo valor em
 * toda a travessia. É também a forma que o resto do repositório já usava —
 * `finderTokenHash`, `inviteTokenHash`, `csrfTokenHash` são todos bytes crus,
 * e as colunas deles têm `CHECK (octet_length(...) = 32)` desde o nascimento.
 * Era a identidade que divergia, não o produto.
 *
 * A marca continua, e não é decoração: ela é o que impede passar um `ipHmac` —
 * também 32 bytes de `Buffer` — onde se espera o resumo do token. Construir um
 * exige o `as TokenHash` de `comoTokenHash`, que é o único lugar do módulo onde
 * ele nasce.
 */
export type TokenHash = Brand<Buffer, 'TokenHash'>;

/**
 * Código da tag JÁ normalizado: 16 caracteres, Crockford Base32, maiúsculas —
 * 15 de aleatoriedade (75 bits) e 1 de verificação, este já conferido.
 */
export type TagCodeCanonical = Brand<string, 'TagCodeCanonical'>;

/** Endereço público do pet, sem o arroba. */
export type Slug = Brand<string, 'Slug'>;

/** Instante em milissegundos desde a época. Só sai de `Clock` (shared/time). */
export type Instant = Brand<number, 'Instant'>;
