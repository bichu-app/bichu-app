/**
 * Modelo de persistência tipado (Kysely).
 *
 * Espelha as migrações em `migrations/`, e nada mais. Kysely e não ORM com
 * mapeamento mágico: `geography` do PostGIS não é tipo suportado pelos ORMs
 * candidatos, e a consulta de 5 km é o coração do produto — ela não pode ser o
 * caso excepcional da ferramenta (ADR-0001).
 *
 * Nome de coluna aqui é o nome no banco, em `snake_case`. A tradução para a
 * forma do domínio acontece no adaptador de persistência, não aqui: um modelo
 * de persistência que já fala a língua do domínio some, e com ele a fronteira.
 */
import type { ColumnType, Generated, Selectable } from 'kysely';

type CriadoEm = ColumnType<Date, Date | string | undefined, never>;
type AtualizadoEm = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  /** UUIDv7 gerado pela aplicação. Sem `DEFAULT` no banco, de propósito. */
  id: string;
  email: string;
  email_verified_at: Date | null;
  display_name: string | null;
  phone_e164: string | null;
  phone_verified_at: Date | null;
  reference_postal_code: string | null;
  reference_neighborhood: string | null;
  reference_city: string | null;
  reference_state: string | null;
  accepted_terms_version: string | null;
  accepted_terms_at: Date | null;
  status: Generated<'active' | 'suspended' | 'deletion_requested'>;
  deletion_requested_at: Date | null;
  /** SEC-006. Todo token com `iat` anterior a este instante é recusado. */
  sessions_invalid_before: ColumnType<Date, Date | string | undefined, Date | string>;
  pending_email: string | null;
  email_deliverable: Generated<boolean>;
  pet_limit: Generated<number>;
  account_kind: Generated<'person' | 'organization'>;
  created_at: CriadoEm;
  updated_at: AtualizadoEm;
  deleted_at: Date | null;
}

export interface UserIdentitiesTable {
  id: string;
  user_id: string;
  provider: 'local' | 'google' | 'apple' | 'keycloak';
  provider_subject: string;
  email_at_provider: string | null;
  email_verified_at_provider: Date | null;
  linked_at: Generated<Date>;
  last_login_at: Date | null;
}

export interface LocalCredentialsTable {
  identity_id: string;
  /** PHC completo: algoritmo e parâmetros junto do hash, nunca em config. */
  password_phc: string;
  password_updated_at: Generated<Date>;
  must_change: Generated<boolean>;
}

export interface UserRolesTable {
  user_id: string;
  role: 'tutor' | 'moderator' | 'admin';
}

export interface VerificationTokensTable {
  id: string;
  user_id: string;
  purpose: 'email_verify' | 'password_reset' | 'email_change';
  token_hash: Buffer;
  sent_to: string;
  expires_at: Date;
  consumed_at: Date | null;
  attempts: Generated<number>;
  created_ip_hmac: Buffer | null;
  created_at: CriadoEm;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: Buffer;
  issued_at: Generated<Date>;
  /** Janela de inatividade; a rotação a renova. */
  expires_at: Date;
  /** Teto absoluto desde a autenticação com senha. Constante na família. */
  absolute_expires_at: Date;
  /** Escolha feita na autenticação com senha, carregada pela família inteira. */
  stay_signed_in: Generated<boolean>;
  rotated_to_id: string | null;
  revoked_at: Date | null;
  revoked_reason:
    | 'rotation'
    | 'reuse_detected'
    | 'logout'
    | 'logout_all'
    | 'password_changed'
    | 'account_deleted'
    | null;
  device_id: string | null;
  user_agent: string | null;
  ip_hmac: Buffer | null;
}

export interface IdempotencyKeysTable {
  key: string;
  user_or_token_ref: string;
  endpoint: string;
  request_hash: Buffer;
  /**
   * `NULL` enquanto a chave está **reservada** e a execução em curso; o status
   * HTTP depois disso. A ausência de resposta é escrita como ausência de valor,
   * e não como um `0` que a coluna recusa (migração 20260917000008).
   */
  response_status: number | null;
  response_body: unknown;
  created_at: CriadoEm;
  expires_at: Date;
}

export interface RateLimitCountersTable {
  bucket_key: string;
  window_start: Date;
  count: Generated<number>;
}

export interface RefDataVersionsTable {
  version: string;
  published_at: Generated<Date>;
  is_current: Generated<boolean>;
}

export interface RefSpeciesTable {
  code: 'dog' | 'cat' | 'other';
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

export interface RefSizesTable {
  code: 'P' | 'M' | 'G' | 'GG';
  label: string;
  weight_hint: string;
  sort_order: number;
  active: Generated<boolean>;
}

export interface RefColorsTable {
  code: string;
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

export interface RefBreedsTable {
  code: string;
  label: string;
  species_code: 'dog' | 'cat' | 'other';
  sort_order: number;
  active: Generated<boolean>;
  /**
   * Únicos códigos com que `pets.breed_free_text` é aceito: `outro_dog`,
   * `outro_cat` e `outro_other`. A marca vive no dado, e não numa lista
   * repetida em cada lugar que valida.
   *
   * **Não vai para a resposta de `GET /v1/public/reference-data`:** o contrato
   * declara `code`, `label` e `species` nos itens de `breeds`, e campo a mais
   * não quebra cliente nenhum, que é por isso que ele passa despercebido.
   */
  accepts_free_text: Generated<boolean>;
}

/** Estado do pet. `lost` é mantido por `lostfound`, não pelo cadastro. */
export type StatusDoPet = 'active' | 'lost' | 'deceased' | 'archived';

/** O que a redação retirou de `care_notes` ao gravar. */
export interface TrechoRedigido {
  kind: 'phone' | 'email' | 'address' | 'external_link';
  hint: string;
}

export interface PetsTable {
  /** UUIDv7 gerado pela aplicação. Sem `DEFAULT` no banco, de propósito. */
  id: string;
  owner_user_id: string;
  name: string;
  species_code: 'dog' | 'cat' | 'other';
  /** A chave que o cruzamento de perdido e achado compara. */
  breed_code: string | null;
  /** A raça como a pessoa escreveu. Descreve; nunca cruza e nunca filtra. */
  breed_free_text: string | null;
  /** A versão da lista que o **cliente** usou, não a corrente do servidor. */
  ref_data_version: string | null;
  size_code: 'P' | 'M' | 'G' | 'GG';
  primary_color_code: string | null;
  secondary_color_code: string | null;
  sex: 'male' | 'female' | 'unknown' | null;
  neutered: boolean | null;
  birth_date_approx: Date | null;
  distinctive_marks: string | null;
  /** Público por definição. Já chega aqui redigido; nunca se redige na leitura. */
  care_notes: string | null;
  care_notes_redactions: ColumnType<TrechoRedigido[], string | undefined, string>;
  microchip_number: string | null;
  sinpatinhas_id: string | null;
  status: Generated<StatusDoPet>;
  slug: string | null;
  public_profile_enabled: Generated<boolean>;
  created_at: CriadoEm;
  updated_at: AtualizadoEm;
  deleted_at: Date | null;
}

/** Dois valores, e só dois (ADR-0004). Não há tag suspensa nem tag fabricada. */
export type StatusDaTag = 'active' | 'revoked';

export type MotivoDeRevogacaoDaTag =
  | 'lost_tag'
  | 'suspected_clone'
  | 'owner_request'
  | 'pet_transferred'
  | 'pet_deceased'
  | 'pet_deleted';

export interface PetTagsTable {
  /** UUIDv7 gerado pela aplicação. Sem `DEFAULT` no banco, como em `pets`. */
  id: string;
  pet_id: string;
  /** SHA-256 do código normalizado. O código em claro não existe em coluna nenhuma. */
  code_hash: Buffer;
  /** AES-256-GCM do código. Só serve para reimprimir, e é apagado na revogação. */
  code_ciphertext: Buffer | null;
  /** `char(4)`: volta do banco com preenchimento à direita. Sempre `trim` na leitura. */
  code_suffix: string;
  label: string | null;
  status: Generated<StatusDaTag>;
  revoked_at: Date | null;
  revocation_reason: MotivoDeRevogacaoDaTag | null;
  scan_count: Generated<number>;
  last_scanned_at: Date | null;
  created_at: CriadoEm;
}

/** Apenas inserção. Retenção de 90 dias. */
export interface TagScansTable {
  id: string;
  tag_id: string;
  scanned_at: Generated<Date>;
  /** HMAC com chave, nunca o endereço em claro e nunca hash puro (SEC-010). */
  ip_hmac: Buffer | null;
  user_agent_hash: Buffer | null;
  area_label: string | null;
  resulted_in_found_report: Generated<boolean>;
}

/**
 * O subconjunto de `found_reports` que o caminho da tag preenche. Caso, ponto,
 * foto e atributos de cruzamento entram com `lostfound`.
 */
export interface FoundReportsTable {
  id: string;
  origin: 'tag_scan' | 'stray_report';
  tag_id: string | null;
  pet_id: string | null;
  reporter_user_id: string | null;
  /** Identidade derivada do achador sem conta. Sustenta a dimensão `finder_identity`. */
  finder_identity_hash: Buffer | null;
  finder_display_name: string | null;
  finder_email: string | null;
  finder_token_hash: Buffer;
  finder_token_expires_at: Date;
  found_at: Date;
  notes: string | null;
  created_at: CriadoEm;
}

/** Esquema `audit`, separado e com papel próprio (BICHUS-56). */
export interface AuditEventsTable {
  id: string;
  occurred_at: Generated<Date>;
  actor_kind: 'user' | 'anonymous' | 'system';
  actor_user_id: string | null;
  actor_ip_hmac: Buffer | null;
  correlation_id: string | null;
  action: string;
  resource_kind: string;
  resource_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
}

/** O que o cliente vai enviar direto ao armazenamento (ADR-0007, BICHUS-87). */
export type TipoDeEnvio = 'pet_photo' | 'found_report_photo' | 'finder_photo';

export interface UploadIntentsTable {
  id: string;
  user_id: string;
  /** Nulo para o achador sem pet: o vínculo dele é com o aviso. */
  pet_id: string | null;
  kind: TipoDeEnvio;
  /** Chave no armazenamento privado. **Nunca** uma URL. */
  object_key: string;
  /** O que o cliente DECLAROU. Diagnóstico, nunca verdade. */
  declared_type: string;
  max_bytes: number;
  expires_at: Date;
  confirmed_at: Date | null;
  created_at: CriadoEm;
}

/** `processing` → `ready` ou `rejected`. Nunca volta. */
export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

export interface PetPhotosTable {
  id: string;
  pet_id: string;
  upload_intent_id: string;
  status: Generated<StatusDaFoto>;
  rejection_reason: string | null;
  /** Original, bucket privado. Só o dono, e só por URL assinada curta. */
  original_key: string;
  /** Derivadas no bucket público, chave com 128 bits aleatórios. Nulas até o worker. */
  thumb_key: string | null;
  card_key: string | null;
  is_primary: Generated<boolean>;
  created_at: CriadoEm;
  processed_at: Date | null;
  deleted_at: Date | null;
}

export type StatusDoTrabalho = 'pending' | 'running' | 'done' | 'failed';

/**
 * A fila, no próprio Postgres.
 *
 * `SELECT ... FOR UPDATE SKIP LOCKED` atende a ordem de grandeza deste produto
 * por muito tempo, e uma fila dedicada seria mais um serviço para operar,
 * monitorar e migrar de nuvem (ADR-0012).
 */
export interface JobsTable {
  id: string;
  kind: string;
  payload: ColumnType<Record<string, unknown>, string, string>;
  status: Generated<StatusDoTrabalho>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  last_error: string | null;
  run_after: Generated<Date>;
  locked_at: Date | null;
  created_at: CriadoEm;
  finished_at: Date | null;
}

/** `RecordType` do corpo do webhook. Espelha o `enum` de `api/openapi.yaml`. */
export type TipoDeEventoDeEntrega =
  | 'Delivery'
  | 'Bounce'
  | 'SpamComplaint'
  | 'Open'
  | 'SubscriptionChange';

/**
 * Eventos de entrega vindos do provedor de e-mail (migração 20260919000001).
 *
 * **Não há coluna com o endereço do destinatário**, e a ausência é a decisão:
 * o corpo do evento traz `Recipient` em claro, e gravá-lo aqui criaria uma
 * segunda cópia do e-mail de todo mundo fora de `users`, sem caminho de
 * exclusão quando a conta pedir remoção (ADR-0010 item 6). O endereço vive só
 * dentro da requisição, o tempo de achar a conta e marcar `email_deliverable`.
 */
export interface NotificationDeliveriesTable {
  id: string;
  /** `MessageID` do provedor. Texto: o formato é dele, não nosso. */
  message_id: string;
  record_type: TipoDeEventoDeEntrega;
  /** Subtipo da devolução (`HardBounce`, `Transient`, ...), quando vem. */
  event_type: string | null;
  description: string | null;
  /** `DeliveredAt` do corpo. Anulável: nem todo tipo de evento traz. */
  occurred_at: Date | null;
  /** Quando NÓS recebemos. Distância para `occurred_at` denuncia reentrega. */
  received_at: Generated<Date>;
}

export type StatusDoCaso = 'open' | 'closed_reunited' | 'closed_not_found' | 'closed_false_alarm';

export interface LostCasesTable {
  id: string;
  pet_id: string;
  /** Desnormalizado de `pets.owner_user_id`: sustenta o teto de 3 por conta sem junção. */
  owner_user_id: string;
  status: Generated<StatusDoCaso>;
  last_seen_at: Date;
  /** `geography(Point,4326)`. **Anulável**: área sozinha abre o caso. */
  last_seen_point: ColumnType<string | null, never, never>;
  last_seen_city: string | null;
  last_seen_neighborhood: string | null;
  last_seen_state: string | null;
  description: string | null;
  share_to_public_list: Generated<boolean>;
  /** A única chave do caso em superfície pública. `case_id` nunca sai de lá. */
  share_token: string;
  opened_at: Generated<Date>;
  closed_at: Date | null;
  closure_outcome: 'reunited' | 'not_found' | 'false_alarm' | null;
  closure_channel: 'tag_scan' | 'bichu_alert' | 'poster_or_link' | 'on_my_own' | 'other' | null;
  closure_note: string | null;
  reopen_deadline: Date | null;
}

export interface Database {
  users: UsersTable;
  user_identities: UserIdentitiesTable;
  local_credentials: LocalCredentialsTable;
  user_roles: UserRolesTable;
  verification_tokens: VerificationTokensTable;
  refresh_tokens: RefreshTokensTable;
  idempotency_keys: IdempotencyKeysTable;
  rate_limit_counters: RateLimitCountersTable;
  ref_data_versions: RefDataVersionsTable;
  ref_species: RefSpeciesTable;
  ref_sizes: RefSizesTable;
  ref_colors: RefColorsTable;
  ref_breeds: RefBreedsTable;
  pets: PetsTable;
  pet_tags: PetTagsTable;
  tag_scans: TagScansTable;
  found_reports: FoundReportsTable;
  upload_intents: UploadIntentsTable;
  pet_photos: PetPhotosTable;
  jobs: JobsTable;
  notification_deliveries: NotificationDeliveriesTable;
  lost_cases: LostCasesTable;
  'audit.events': AuditEventsTable;
}

export type PetRow = Selectable<PetsTable>;
export type UserRow = Selectable<UsersTable>;
export type RefreshTokenRow = Selectable<RefreshTokensTable>;
