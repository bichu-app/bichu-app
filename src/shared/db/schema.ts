/** Modelo de persistência tipado (Kysely). */
import type { ColumnType, Generated, Selectable } from 'kysely';

type CriadoEm = ColumnType<Date, Date | string | undefined, never>;
type AtualizadoEm = ColumnType<Date, Date | string | undefined, Date | string>;

export interface UsersTable {
  /** UUIDv7 gerado pela aplicação. */
  id: string;
  email: string;
  /** O instante da verificacao do e-mail. */
  email_verified_at: Date | null;
  /**
   * A foto que a PROPRIA pessoa cadastrou (migracao `20261018000008`,
   * `catalog_images.purpose = 'user_photo'`).
   */
  photo_image_id: string | null;
  /**
   * O ENDERECO PUBLICO E OPACO DA PESSOA: 22 simbolos de base64url, 128 bits
   * sorteados por linha (migracao `20261018000031`).
   */
  public_ref: string;
  display_name: string | null;
  /**
   * A data de nascimento declarada no cadastro, para a idade mínima de 16 anos
   * (cliente, 18/10/2026).
   */
  birth_date: ColumnType<Date | null, string | undefined, string>;
  /**
   * O apelido (`@`) escolhido pela pessoa, já normalizado, apontando para
   * `handles.handle` (FK).
   */
  handle: ColumnType<string | null, string | undefined, string>;
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

/** O espaço de nomes do `@`, **compartilhado** entre pessoa, pet e reservadas. */
export interface HandlesTable {
  /** `citext`: `@Leandro` e `@leandro` não coexistem, e quem garante é a chave. */
  handle: string;
  /**
   * Derivado pelo gatilho `handles_esqueleto_derivado`, **nunca** pelo que a
   * aplicação manda: o esqueleto é o índice que separa os parecidos, e quem o
   * mandasse errado de propósito o contornaria.
   */
  handle_esqueleto: Generated<string>;
  kind: 'pessoa' | 'pet' | 'reservado';
  /** A conta dona, quando `kind = 'pessoa'`. */
  user_id: string | null;
  /** Quando o apelido passou a valer. */
  claimed_at: ColumnType<Date, Date | undefined, Date>;
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
  /** So `tutor` desde 28/09: o painel tem cadastro proprio (ADR-0027 item 20.2). */
  role: 'tutor';
}

/** O papel da conta do painel. */
export type PapelDaContaAdministrativa = 'admin';
export type EstadoDaContaAdministrativa = 'active' | 'disabled';
export type MotivoDoBloqueioAdministrativo = 'failed_logins' | 'disavowed';

/** O cadastro do painel (ADR-0027 item 20.1). */
export interface AdminAccountsTable {
  id: string;
  email: string;
  display_name: string;
  role: Generated<PapelDaContaAdministrativa>;
  password_phc: string;
  password_updated_at: Date;
  status: Generated<EstadoDaContaAdministrativa>;
  disabled_at: Date | null;
  blocked_reason: MotivoDoBloqueioAdministrativo | null;
  blocked_at: Date | null;
  sessions_invalid_before: Generated<Date>;
  last_login_at: Date | null;
  created_at: CriadoEm;
}

/** Sessao do backoffice (ADR-0027 item 2, apendice A.1). */
export interface AdminSessionsTable {
  id: string;
  admin_account_id: string;
  token_hash: Buffer;
  csrf_token_hash: Buffer;
  /** O instante da senha, herdado na rotacao. */
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  revoked_reason:
    | 'logout'
    | 'rotated'
    | 'account_disabled'
    | 'account_invalidated'
    | 'disavowed'
    | 'password_reset'
    | null;
  user_agent: string | null;
  ip_hmac: Buffer | null;
}

/** Janela de reautenticacao administrativa (D40), presa a sessao. */
export interface AdminReauthTokensTable {
  id: string;
  session_id: string;
  admin_account_id: string;
  scope:
    | 'store_item_retirement'
    | 'network_event_relocation'
    | 'network_event_cancellation'
    | 'network_event_removal'
    | 'network_event_access_change';
  token_hash: Buffer;
  issued_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
}

/** O "nao fui eu" do aviso de sessao administrativa aberta (D62). */
export interface AdminSessionAlertsTable {
  id: string;
  admin_account_id: string;
  session_id: string | null;
  token_hash: Buffer;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: CriadoEm;
}

export interface VerificationTokensTable {
  id: string;
  user_id: string;
  purpose: 'email_verify' | 'password_reset' | 'email_change' | 'session_disavow';
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
  /** Teto absoluto desde a autenticação com senha. */
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
    | 'not_me'
    | null;
  device_id: string | null;
  user_agent: string | null;
  ip_hmac: Buffer | null;
}

/** A janela de 5 minutos aberta por `POST /v1/auth/reauth` (BICHUS-48). */
export interface ReauthTokensTable {
  id: string;
  user_id: string;
  /** `jti` do token de acesso que pediu a janela. */
  access_jti: string;
  scope:
    | 'account_deletion'
    | 'email_change'
    | 'data_export'
    | 'pet_transfer'
    | 'tag_revocation'
    | 'session_revocation';
  token_hash: Buffer;
  issued_at: Date;
  expires_at: Date;
  /** Uso unico: preenchido pela operacao que apresentou a janela. */
  consumed_at: Date | null;
  created_ip_hmac: Buffer | null;
}

export type RazaoDaRevogacaoDePasskey = 'user' | 'counter_regression' | 'account_deleted';

/** Credencial WebAuthn de uma conta (BICHUS-301). */
export interface PasskeyCredentialsTable {
  id: Generated<string>;
  user_id: string;
  /** O `credential_id` cru, como o autenticador o emitiu. */
  credential_id: Buffer;
  /** Chave pública em COSE, em bytes: quem a usa é a biblioteca de verificação. */
  public_key: Buffer;
  /** Contador antirrepetição. */
  sign_count: Generated<string>;
  label: string | null;
  transports: string[] | null;
  created_at: Generated<Date>;
  last_used_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: RazaoDaRevogacaoDePasskey | null;
}

/** Desafio WebAuthn: prazo e USO ÚNICO. */
export interface PasskeyChallengesTable {
  id: Generated<string>;
  user_id: string | null;
  purpose: 'registration' | 'authentication';
  /** SHA-256 do desafio em base64url. */
  challenge_hash: Buffer;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Generated<Date>;
}

export interface IdempotencyKeysTable {
  key: string;
  user_or_token_ref: string;
  endpoint: string;
  request_hash: Buffer;
  /**
   * `NULL` enquanto a chave está **reservada** e a execução em curso; o status HTTP
   * depois disso.
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
   * Únicos códigos com que `pets.breed_free_text` é aceito: `outro_dog`, `outro_cat`
   * e `outro_other`.
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
  /** UUIDv7 gerado pela aplicação. */
  id: string;
  owner_user_id: string;
  name: string;
  species_code: 'dog' | 'cat' | 'other';
  /** A chave que o cruzamento de perdido e achado compara. */
  breed_code: string | null;
  /** A raça como a pessoa escreveu. */
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

/** Dois valores, e só dois (ADR-0004). */
export type StatusDaTag = 'active' | 'revoked';

export type MotivoDeRevogacaoDaTag =
  | 'lost_tag'
  | 'suspected_clone'
  | 'owner_request'
  | 'pet_transferred'
  | 'pet_deceased'
  | 'pet_deleted';

export interface PetTagsTable {
  /** UUIDv7 gerado pela aplicação. */
  id: string;
  pet_id: string;
  /** SHA-256 do código normalizado. */
  code_hash: Buffer;
  /** AES-256-GCM do código. Só serve para reimprimir, e é apagado na revogação. */
  code_ciphertext: Buffer | null;
  /** `char(4)`: volta do banco com preenchimento à direita. */
  code_suffix: string;
  label: string | null;
  status: Generated<StatusDaTag>;
  revoked_at: Date | null;
  revocation_reason: MotivoDeRevogacaoDaTag | null;
  scan_count: Generated<number>;
  last_scanned_at: Date | null;
  created_at: CriadoEm;
}

/**
 * Apenas inserção, e **sem retenção por prazo** (ADR-0010, emenda 6 de 26/10/2026:
 * *"não apague nada"*).
 */
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
 * O aviso do achador, pelos dois caminhos: o QR da plaquinha (`tag_scan`) e o
 * achado avulso (`stray_report`, BICHUS-35).
 */
export interface FoundReportsTable {
  id: string;
  origin: 'tag_scan' | 'stray_report';
  tag_id: string | null;
  pet_id: string | null;
  /** Nulo no aviso anônimo; **obrigatório** no achado avulso (CHECK no banco). */
  reporter_user_id: string | null;
  /** Identidade derivada do achador sem conta. */
  finder_identity_hash: Buffer | null;
  finder_display_name: string | null;
  finder_email: string | null;
  /** A autorização de quem NÃO tem conta. */
  finder_token_hash: Buffer | null;
  finder_token_expires_at: Date | null;
  found_at: Date;
  notes: string | null;
  created_at: CriadoEm;

  /** Vínculo direto do critério 10, vindo do `share_token`. */
  case_id: string | null;
  species: 'dog' | 'cat' | 'other' | null;
  size: 'P' | 'M' | 'G' | 'GG' | null;
  sex: 'male' | 'female' | 'unknown' | null;
  /** Código de `reference-data`. */
  breed_code: string | null;
  /** A raça como o achador escreveu. */
  breed_free_text: string | null;
  primary_color_code: string | null;
  ref_data_version: string | null;
  /** `geography(Point,4326)`. */
  found_point: ColumnType<never, never, never>;
  found_city: string | null;
  found_neighborhood: string | null;
  found_state: string | null;
  /** A foto do achador, no bucket privado (critério 9). */
  photo_upload_id: string | null;
  status: Generated<'open' | 'matched' | 'closed'>;
  /** 30 dias. O expurgo lê esta coluna. */
  retention_until: Date | null;
}

/** BICHUS-35, critério 7. O cruzamento **sugere**; quem confirma é uma pessoa. */
export interface MatchCandidatesTable {
  id: string;
  case_id: string;
  found_report_id: string;
  /** `numeric(4,3)`, que o driver entrega como texto. */
  score: ColumnType<string, number | string, number | string>;
  matched_attributes: ColumnType<Record<string, number>, string, string>;
  distance_m: number | null;
  link_origin: 'attribute_match' | 'share_token';
  strategy_version: string;
  status: Generated<'suggested' | 'confirmed' | 'rejected'>;
  decided_by_user_id: string | null;
  decided_at: Date | null;
  created_at: CriadoEm;
}

/** Esquema `audit`, separado e com papel próprio (BICHUS-56). */
export interface AuditEventsTable {
  id: string;
  occurred_at: Generated<Date>;
  actor_kind: 'user' | 'anonymous' | 'system' | 'admin';
  actor_user_id: string | null;
  /** `admin_accounts.id` de quem agiu no painel; nulo em todo ator que nao e `admin`. */
  actor_admin_id: string | null;
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

/** O proposito da imagem de catalogo (ADR-0027 item 10). */
export type PropositoDaImagemDeCatalogo =
  | 'store_item'
  | 'network_event'
  | 'directory_logo'
  | 'directory_photo'
  | 'directory_gallery'
  /** O logotipo que QUEM INDICOU enviou (`20261029000004`). */
  | 'directory_suggestion_logo'
  /** As fotos do ESTABELECIMENTO que quem indicou enviou (`20261030000002`). */
  | 'directory_suggestion_photo'
  | 'user_photo'
  | 'user_showcase'
  | 'user_publication';

export interface UploadIntentsTable {
  id: string;
  /**
   * Quem pediu. Nulo **só** em `finder_photo`: o achador sem conta não tem
   * `users.id` (BICHUS-41).
   */
  user_id: string | null;
  /** Nulo para o achador sem pet: o vínculo dele é com o aviso. */
  pet_id: string | null;
  /** O aviso a que esta intenção pertence (BICHUS-35). */
  found_report_id: string | null;
  kind: TipoDeEnvio;
  /** Chave no armazenamento privado. */
  object_key: string;
  /** O que o cliente DECLAROU. */
  declared_type: string;
  max_bytes: number;
  expires_at: Date;
  confirmed_at: Date | null;
  created_at: CriadoEm;
  /** Referência opaca devolvida ao achador sem conta (128 bits, base64url). */
  upload_ref: string | null;
  /** O estado da HIGIENE da foto do achado (migração `20261001000006`). */
  sanitize_status: Generated<'pendente' | 'pronta' | 'recusada' | 'ausente'>;
  /** Chave da derivada sem EXIF, no bucket **privado**. */
  sanitized_key: string | null;
  sanitize_rejection_reason: string | null;
  sanitized_at: Date | null;
}

/** A intencao de envio de imagem de catalogo, do painel (ADR-0027 A.3, item 20.2). */
export interface CatalogUploadIntentsTable {
  id: string;
  /** `admin_accounts.id`. Sem `ON DELETE`: conta do painel desativa, nao se apaga. */
  admin_account_id: string | null;
  /** `users.id`, quando o envio e da comunidade. */
  user_id: ColumnType<string | null, string | null | undefined, string | null>;
  purpose: PropositoDaImagemDeCatalogo;
  /** Chave no armazenamento privado. */
  object_key: string;
  declared_type: string;
  max_bytes: number;
  expires_at: Date;
  confirmed_at: Date | null;
  created_at: Generated<Date>;
}

/** `processing` → `ready` ou `rejected`. */
export type StatusDaFoto = 'processing' | 'ready' | 'rejected';

export interface PetPhotosTable {
  id: string;
  pet_id: string;
  upload_intent_id: string;
  status: Generated<StatusDaFoto>;
  rejection_reason: string | null;
  /** Original, bucket privado. */
  original_key: string;
  /** Derivadas no bucket público, chave com 128 bits aleatórios. */
  thumb_key: string | null;
  card_key: string | null;
  is_primary: Generated<boolean>;
  created_at: CriadoEm;
  processed_at: Date | null;
  deleted_at: Date | null;
}

export type StatusDoTrabalho = 'pending' | 'running' | 'done' | 'failed';

/** A fila, no próprio Postgres. */
export interface JobsTable {
  id: string;
  kind: string;
  payload: ColumnType<Record<string, unknown>, string, string>;
  status: Generated<StatusDoTrabalho>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  /**
   * Quantas vezes o processo morreu segurando este trabalho (migração
   * 20260923000008).
   */
  orphan_recoveries: Generated<number>;
  last_error: string | null;
  run_after: Generated<Date>;
  locked_at: Date | null;
  created_at: CriadoEm;
  finished_at: Date | null;
}

/** `RecordType` do corpo do webhook. */
export type TipoDeEventoDeEntrega =
  | 'Delivery'
  | 'Bounce'
  | 'SpamComplaint'
  | 'Open'
  | 'SubscriptionChange';

/** Eventos de entrega vindos do provedor de e-mail (migração 20260919000001). */
export interface NotificationItemsTable {
  id: Generated<string>;
  /** Identificador opaco, 22 caracteres base64url. */
  ref: string;
  recipient_user_id: string;
  item_kind: TipoDeAvisoDaCaixa;
  /** Nome do pet, titulo do encontro, nome indicado. */
  subject_label: string | null;
  /**
   * Quem causou o aviso. Existe SO para agrupar por (tipo, autor, dia), e NAO sai na
   * resposta: a caixa nao tem autor nem avatar na tela, de proposito.
   */
  author_user_id: string | null;
  source_kind: string;
  source_id: string;
  /** Quando o FATO aconteceu, e nao quando a linha nasceu. */
  occurred_at: Date;
  /** O item foi ABERTO. Nulo e nao lido. */
  read_at: Date | null;
  /** A pessoa DISPENSOU este aviso -- o "x" da linha (migracao `20261020000011`). */
  dismissed_at: Date | null;
  created_at: Generated<Date>;
}

/** Os tipos de aviso da caixa. */
export type TipoDeAvisoDaCaixa =
  | 'tag_scanned'
  | 'found_reported'
  | 'match_suggested'
  | 'neighborhood_alert'
  | 'event_join_requested'
  | 'event_join_decided'
  | 'event_cancelled'
  | 'suggestion_decided'
  | 'tag_request_updated'
  | 'broadcast'
  /** Alguem pediu conexao (`20261020000018`). */
  | 'connection_requested';

/** Quando esta conta viu a lista pela ultima vez (migracao `20261018000020`). */
export interface NotificationCounterStateTable {
  user_id: string;
  zeroed_at: Date;
}

/** Os COMUNICADOS disparados pelo painel (migracao `20261018000020`). */
export interface NotificationBroadcastsTable {
  id: Generated<string>;
  /** Identificador opaco. Nao e UUID (ADR-0010). */
  ref: string;
  title: string;
  body: string;
  /** Conta do PAINEL (`admin_accounts`), nunca `users`. */
  dispatched_by_admin: string;
  dispatched_at: Generated<Date>;
  /** Quantas caixas ele alcancou NO INSTANTE do disparo. */
  recipients_total: number;
}

export interface NotificationDeliveriesTable {
  id: string;
  /** `MessageID` do provedor. */
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
  /**
   * Desnormalizado de `pets.owner_user_id`: sustenta o teto de 3 por conta sem
   * junção.
   */
  owner_user_id: string;
  status: Generated<StatusDoCaso>;
  last_seen_at: Date;
  /** `geography(Point,4326)`. */
  last_seen_point: ColumnType<string | null, never, never>;
  last_seen_city: string | null;
  last_seen_neighborhood: string | null;
  last_seen_state: string | null;
  description: string | null;
  share_to_public_list: Generated<boolean>;
  /** A única chave do caso em superfície pública. */
  share_token: string;
  opened_at: Generated<Date>;
  closed_at: Date | null;
  closure_outcome: 'reunited' | 'not_found' | 'false_alarm' | null;
  closure_channel: 'tag_scan' | 'bichu_alert' | 'poster_or_link' | 'on_my_own' | 'other' | null;
  closure_note: string | null;
  reopen_deadline: Date | null;
}

/** BICHUS-92. Onde o tutor mora, aproximadamente, para a consulta de raio. */
export interface UserReferenceLocationsTable {
  /** Metade da PK, e FK para `users`. */
  user_id: string;
  /**
   * SEC-021: a família de refresh que informou esta localização — o mesmo valor que
   * vai no `sid` do token de acesso (ADR-0002, emenda 1).
   */
  session_family_id: string;
  /** `geography(Point,4326)`, já quantizado. */
  reference_point: ColumnType<never, never, never>;
  /** Lado da célula da grade, em metros, como ele sai em `UserLocation`. */
  precision_m: number;
  source: 'device_gps' | 'map_pin';
  captured_at: Date;
  /** 30 dias após a captura. Vencida, a conta sai da base de alerta. */
  expires_at: Date;
}

/** BICHUS-91. Os aparelhos de uma conta, e o token por onde o push chega. */
export interface UserDevicesTable {
  /** UUIDv7 da aplicação. Sai em `Device.id`, e só para o dono. */
  id: string;
  user_id: string;
  platform: 'android' | 'ios';
  /**
   * Em claro porque precisa ser **replicada** ao FCM a cada envio — o refresh mora
   * como SHA-256 porque só precisa ser conferido, e este não.
   */
  push_token: string | null;
  push_permission: 'granted' | 'denied' | 'not_asked';
  app_version: string | null;
  os_version: string | null;
  registered_at: Date;
  last_seen_at: Date;
}

/** Os quatro estados de `AlertDispatch.reach_status`. */
export type EstadoDoDisparo = 'computed' | 'unavailable' | 'queued' | 'no_location';

/** BICHUS-18. Um disparo do alerta de 5 km, por caso. */
export interface AlertDispatchesTable {
  id: string;
  case_id: string;
  radius_m: number;
  reach_status: EstadoDoDisparo;
  /** `null` em tudo que não é `computed`. */
  recipients_total: number | null;
  /** O teto de 500 cortou a lista. */
  cap_reached: Generated<boolean>;
  requested_at: Date;
  /** `null` enquanto `queued`. */
  dispatched_at: Date | null;
}

/** BICHUS-18. Quem foi avisado em cada disparo. */
export interface AlertRecipientsTable {
  dispatch_id: string;
  user_id: string;
  notified_at: Date;
}

/** Papel na conversa mediada. */
export type PapelNaConversa = 'tutor' | 'finder' | 'system';

/** Por que a conversa fechou. */
export type MotivoDeEncerramentoDaConversa = 'case_closed' | 'pet_returned' | 'retention';

/** Por que a conversa foi retida para revisão humana (BICHUS-43, 10, 11 e 17). */
export type MotivoDeRetencao = 'message_volume' | 'serial_finder';

/** BICHUS-43. A conversa mediada, que nasce de um aviso e de nada mais. */
export interface ConversationsTable {
  /** UUIDv7 gerado pela aplicação. */
  id: string;
  /** A origem, e a única. `UNIQUE`: um aviso, uma conversa. */
  found_report_id: string;
  pet_id: string;
  /** Nulo quando a plaquinha foi escaneada sem caso aberto. */
  case_id: string | null;
  /** Desnormalizado de `pets.owner_user_id`: é o predicado do ADR-0021. */
  tutor_user_id: string;
  /** Nulo quando o achador não tem conta, que é o caminho principal. */
  finder_user_id: string | null;
  opened_at: Generated<Date>;
  closed_at: Date | null;
  closure_reason: MotivoDeEncerramentoDaConversa | null;
  blocked_at: Date | null;
  /** Papel e não id: o achador pode não ter conta (BICHUS-40). */
  blocked_by_role: 'tutor' | 'finder' | null;
  /** Invisível aos dois lados de propósito. */
  held_for_review_at: Date | null;
  held_reason: MotivoDeRetencao | null;
  /** A REMOCAO LOGICA pela fila de moderacao do painel (`20261018000009`). */
  moderation_removed_at: Date | null;
  /** O motivo, obrigatorio quando ha remocao por `CHECK`. */
  moderation_reason: string | null;
}

/** BICHUS-41. A fila de denúncia da conversa mediada. */
export interface ConversationReportsTable {
  id: string;
  conversation_id: string;
  reporter_role: 'tutor' | 'finder';
  reason: 'extortion' | 'harassment' | 'spam' | 'impersonation' | 'other';
  detail: string | null;
  repeat_count: Generated<number>;
  created_at: Generated<Date>;
  last_reported_at: Generated<Date>;
  resolved_at: Date | null;
  /** O QUE o administrador decidiu (`20261018000009`). */
  resolution: DecisaoDaModeracao | null;
  /** O motivo da decisao. Nao publicado, e nao chega a nenhum dos dois lados. */
  resolution_reason: string | null;
}

/** BICHUS-43. A mensagem, com o texto **já redigido**. */
export interface ConversationMessagesTable {
  id: string;
  conversation_id: string;
  sender_role: PapelNaConversa;
  /** Nulo na mensagem do sistema e na do achador sem conta. */
  sender_user_id: string | null;
  /** Já redigido. O que a pessoa digitou não existe em coluna nenhuma. */
  body: string;
  redactions: ColumnType<TrechoRedigido[], string | undefined, string>;
  /** Chave de objeto, nunca URL. */
  photo_object_key: string | null;
  created_at: Generated<Date>;
  /** Especie da mensagem do Bichu, para a EXCECAO do contador (BICHUS-278). */
  system_kind: EspecieDaMensagemDoSistema | null;
}

/** BICHUS-278. As tres especies de mensagem do Bichu. */
export type EspecieDaMensagemDoSistema = 'scan_notice' | 'found_notice' | 'redaction_warning';

/** BICHUS-278. Ate quando cada LADO leu a conversa. */
export interface ConversationReadsTable {
  conversation_id: string;
  role: 'tutor' | 'finder';
  last_read_at: Date;
}

/** BICHUS-278. Quando a CONTA abriu a area de mensagens. */
export interface ConversationListViewsTable {
  user_id: string;
  seen_at: Date;
}

/** BICHUS-278 (20/10/2026) -- quando a conta VIU cada area com contador. */
export type SecaoComContador = 'pets' | 'network_events' | 'network_directory';

export interface SectionListViewsTable {
  /** Metade da PK, e FK para `users`. */
  user_id: string;
  section: SecaoComContador;
  /** Sem `DEFAULT` no banco: a linha nao pode nascer dizendo que viu. */
  seen_at: Date;
}

/** BICHUS-66. Os cinco estados da troca de tutor. */
export type StatusDaTransferencia =
  | 'pending_acceptance'
  | 'accepted'
  | 'effective'
  | 'cancelled'
  | 'expired';

/** Por que a transferencia foi desfeita. */
export type MotivoDoCancelamentoDaTransferencia =
  | 'current_owner'
  | 'cancel_token'
  | 'lost_case_opened'
  | 'recipient_gone';

export interface PetTransfersTable {
  /** UUIDv7 gerado pela aplicacao. */
  id: string;
  pet_id: string;
  /** O tutor no momento do convite. */
  from_user_id: string;
  /** Normalizado (minusculas, sem espaco). */
  recipient_email: string;
  /** Preenchida no aceite. Anulavel porque a FK e `ON DELETE SET NULL`. */
  to_user_id: string | null;
  /** SHA-256 de 256 bits de CSPRNG. */
  invite_token_hash: Buffer;
  /** Nulo ate o aceite; depois dele, a credencial de desfazer, de uso unico. */
  cancel_token_hash: Buffer | null;
  status: Generated<StatusDaTransferencia>;
  /** Fim do prazo para ACEITAR (72 h). */
  invite_expires_at: Date;
  accepted_at: Date | null;
  /** 24 h apos o aceite. Enquanto o estado e `accepted`, esta no futuro. */
  effective_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: MotivoDoCancelamentoDaTransferencia | null;
  created_at: CriadoEm;
}

/** O diretorio de `Perto`, mapeado um dia depois de a migracao existir. */
export type TipoDeProfissional =
  | 'vet'
  | 'groomer'
  | 'walker'
  | 'sitter'
  | 'trainer'
  | 'clinic'
  | 'store'
  | 'hospital'
  | 'boarding'
  | 'daycare';

/**
 * Sem `'community'`. A emenda 1 do ADR-0011 negou a criacao pela comunidade em
 * 21/09 e pos `'invited'` no lugar; reintroduzir o valor aqui seria desfazer a
 * decisao do cliente, e nao corrigir um esquecimento.
 */
export type OrigemDoPerfil = 'self' | 'invited' | 'import';

export type EstadoDaTitularidade = 'unclaimed' | 'claim_pending' | 'claimed' | 'disputed';

export type StatusDoPerfil = 'draft' | 'published' | 'hidden' | 'removed';

/** O que foi verificado, e nao um selo generico (BICHUS-165). */
export type NivelDeVerificacao = 'none' | 'contact_verified' | 'document_verified';

/** A avaliacao de um local do diretorio `Perto` (migracao `20261017000017`). */
export interface ProfessionalReviewsTable {
  /** UUIDv7 gerado pela aplicacao, como em `pets` e em `professionals`. */
  id: string;
  /**
   * O identificador publico e opaco (128 bits base64url), que e o que sai em
   * resposta.
   */
  ref: string;
  professional_id: string;
  author_user_id: string;
  /** Inteira de 1 a 5. O `CHECK` da migracao cobra a faixa no banco. */
  rating: number;
  /** A recomendacao em texto. */
  body: string | null;
  /** Do ADR-0011. Nenhuma rota o preenche hoje e ele nao esta no contrato. */
  service_kind: string | null;
  created_at: Generated<Date>;
  /** Quando o AUTOR editou. A moderacao mexe em `status` e nao toca aqui. */
  edited_at: Date | null;
  /**
   * `published` e o DEFAULT, e o default E a decisao do cliente de 18/10: a
   * avaliacao aparece na hora e **nao ha valor `pending`** porque nao ha fila.
   */
  status: Generated<'published' | 'hidden' | 'removed'>;
  /** Escrito por quem moderou. */
  moderation_reason: string | null;
  moderated_at: Date | null;
}

/** A denuncia de uma avaliacao (migracao `20261017000017`). */
export interface ProfessionalReviewReportsTable {
  id: string;
  review_id: string;
  reporter_user_id: string;
  reason: 'spam' | 'offensive' | 'false_information' | 'not_about_this_place' | 'other';
  detail: string | null;
  /** A insistencia da MESMA pessoa, sem criar linha nova. */
  repeat_count: Generated<number>;
  created_at: Generated<Date>;
  last_reported_at: Generated<Date>;
  /** Escrito por quem modera. */
  resolved_at: Date | null;
  /** O QUE o administrador decidiu (`20261018000009`). */
  resolution: DecisaoDaModeracao | null;
  /** O motivo da decisao. Nao publicado, e nao chega a quem denunciou. */
  resolution_reason: string | null;
}

/** **A DECISAO da fila de moderacao, nas duas tabelas de denuncia.** */
export type DecisaoDaModeracao = 'content_removed' | 'dismissed';

/**
 * A VISAO `fila_de_moderacao` (`20261018000009`): UMA LINHA POR DENUNCIA, juntando
 * as origens que existem.
 */
export interface FilaDeModeracaoView {
  origin: string;
  /**
   * `professional_reviews.ref` na perna da avaliacao; `conversations.id` na da
   * conversa.
   */
  target_ref: string;
  report_id: string;
  reason: string;
  /** O texto que o denunciante escreveu PARA QUEM MODERA. */
  detail: string | null;
  repeat_count: number;
  created_at: Date;
  last_reported_at: Date;
  resolved_at: Date | null;
  resolution: DecisaoDaModeracao | null;
  resolution_reason: string | null;
  /**
   * Falso tambem quando a denuncia nao existe: a rota responde 404 e nunca 403
   * (ADR-0021).
   */
  reporter_active: boolean;
  target_removed: boolean;
  target_rating: number | null;
  /** O conteudo denunciado. **Nulo na conversa**, e isso e desenho e nao falta. */
  target_body: string | null;
  /** O nome do local na perna da avaliacao; o nome do pet na da conversa. */
  target_subject: string;
  /** Esta denuncia PESA na ordem da fila? */
  reporter_weighs: boolean;
}

export interface ProfessionalsTable {
  /** UUIDv7 gerado pela aplicacao. */
  id: string;
  /** AS ATIVIDADES, de 1 a 6 (`20261020000015`, decisao do cliente de 21/10/2026). */
  kinds: TipoDeProfissional[];
  /** O QUE a entrada e, eixo SEPARADO de `kind` (que e a ATIVIDADE). */
  entity_kind: Generated<TipoDeEntidade>;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  /**
   * O SITE do estabelecimento, acrescentado pela migracao `20261020000014` (decisao
   * do cliente de 21/10/2026).
   */
  site_url: string | null;
  /** O ENDERECO DE RUA, acrescentado pela migracao `20261018000001`. */
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  /**
   * A LOGO e a FOTO da entidade, acrescentadas pela migracao `20261018000008`
   * (pedido do cliente de 18/10/2026).
   */
  logo_image_id: string | null;
  photo_image_id: string | null;
  /** `geography(Point,4326)`. */
  geo: ColumnType<never, never, never>;
  source: OrigemDoPerfil;
  /** **UMA COLUNA DESTA TABELA NAO ESTA AQUI, E A AUSENCIA E A REGRA.** */
  claim_status: Generated<EstadoDaTitularidade>;
  claimed_by_user_id: string | null;
  claimed_at: Date | null;
  claim_snapshot_at: Date | null;
  verification_level: Generated<NivelDeVerificacao>;
  crmv_number: string | null;
  crmv_uf: string | null;
  cnpj: string | null;
  /** Telefone COMERCIAL, publicado de proposito por quem aceitou aparecer. */
  phone_e164: string | null;
  /** O endereco publico de uma entrada, no lugar do `id` (ADR-0010 item 6). */
  slug: string | null;
  status: Generated<StatusDoPerfil>;
  /** Desde quando a entrada esta no ar. */
  published_at: Date | null;
  created_at: CriadoEm;
  updated_at: AtualizadoEm;
  /** A versao para `If-Match`, acrescentada pela migracao `20261017000011`. */
  version: Generated<number>;
}

export type TipoDeEntidade = 'professional' | 'organization';

export type TipoDeEvidencia = 'crmv' | 'cnpj' | 'phone_callback' | 'document';

export type DecisaoDaVerificacao = 'pending' | 'approved' | 'rejected';

export interface EntityVerificationsTable {
  id: string;
  entity_kind: TipoDeEntidade;
  /**
   * **Sem chave estrangeira, e isso e decisao** (ADR-0011, revisao de 17/09): a
   * tabela e polimorfica e o Postgres nao expressa FK condicional ao valor de outra
   * coluna.
   */
  entity_id: string;
  claimant_user_id: string;
  evidence_kind: TipoDeEvidencia;
  /** Referencia ao documento, NUNCA o documento (ADR-0007). */
  evidence_ref: string | null;
  submitted_at: Generated<Date>;
  decision: Generated<DecisaoDaVerificacao>;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: CriadoEm;
}

/** O `CHECK` `directory_suggestions_contato_conhecido` (`20261017000004`). */
export type TipoDeContatoSugerido = 'phone' | 'website' | 'instagram';

/** O `CHECK` `directory_suggestions_revisao_conhecida` (`20261017000004`). */
export type RevisaoDaSugestao = 'pending' | 'approved' | 'declined';

/**
 * A fila de revisao de `Perto`: o que a comunidade SUGERIU para o diretorio
 * (migracao `20261017000004`, operacao `suggestDirectoryEntry`).
 */
export interface DirectorySuggestionsTable {
  /** UUIDv7 gerado pela aplicacao, como em `pets` e em `professionals`. */
  id: string;
  /** 128 bits em base64url. E ele que sai no recibo, e nunca o `id`. */
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  /**
   * O QUE a entidade indicada E -- eixo SEPARADO de `kind`, que e o que ela FAZ
   * (`20261029000003`, pedido do cliente: *"esta faltando o campo se e um
   * profissional, ong ou estabelecimento"*).
   */
  entity_kind: Generated<TipoDeEntidade>;
  city: string;
  /** A UF. E por esta coluna que o estado da revisao se chama `review_status`. */
  state: string;
  neighborhood: string | null;
  /**
   * O CEP do estabelecimento, oito digitos SEM hifen (`CHECK` da `20261017000015`,
   * mesma forma de `tag_requests.postal_code`).
   */
  postal_code: string | null;
  contact_kind: TipoDeContatoSugerido;
  contact_value: string;
  note: string | null;
  /**
   * O logotipo que QUEM INDICOU enviou (`20261029000004`, pedido do cliente de
   * 29/10/2026: *"nao tem o campo do logotipo para o usuario subir e indicar o
   * estabelecimento"*).
   */
  logo_image_id: string | null;
  review_status: Generated<RevisaoDaSugestao>;
  created_at: Generated<Date>;
  /** Nulo enquanto pendente, por `CHECK`. */
  decided_at: Date | null;
  /**
   * O motivo da recusa, escrito pelo administrador para o PROXIMO revisor
   * (`20261017000016`).
   */
  decline_reason: string | null;
  /**
   * A entrada do diretorio que a aprovacao produziu -- ou a que ja existia e a que a
   * indicacao foi ligada, que e o caso da duplicata (`20261017000016`).
   */
  approved_entry_id: string | null;
}

/** O codigo da categoria do produto. */
export type CategoriaDaVitrine = string;

/** O primeiro nivel da categoria do produto (migracao `20261017000003`). */
export interface StoreCategoriesTable {
  code: string;
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

/**
 * O segundo nivel. A chave primaria e o PAR `(category_code, code)`, e e esse par
 * que `store_items (category, subcategory)` referencia: "a subcategoria pertence a
 * categoria escolhida" e invariante de banco.
 */
export interface StoreSubcategoriesTable {
  category_code: string;
  code: string;
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

/** Para que especies cada subcategoria foi LEVANTADA. */
export interface StoreSubcategorySpeciesTable {
  category_code: string;
  code: string;
  species_code: 'dog' | 'cat' | 'other';
}

/** A versao corrente da vitrine da `Loja`. */
export interface StoreCatalogVersionsTable {
  version: string;
  published_at: Generated<Date>;
  is_current: Generated<boolean>;
}

/** O parceiro da vitrine. */
export interface StorePartnersTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** O endereco publico do parceiro. */
  slug: string;
  name: string;
  /** Apenas o host, sem esquema nem caminho nem consulta. */
  host: string;
  active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** O `ETag` do painel. Incrementada a cada escrita. */
  version: Generated<number>;
}

/** O item da vitrine. Mesmo desenho de `StorePartnersTable`. */
export interface StoreItemsTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** O endereco publico do item. */
  slug: string;
  /** Aponta para `store_partners.id`, nunca para o `slug` dele. */
  partner_id: string | null;
  /** O minimo para o registro existir. */
  title: string;
  /** Anulavel no rascunho (`20261017000002`). */
  summary: string | null;
  /** Anulavel no rascunho (`20261017000002`). */
  category: CategoriaDaVitrine | null;
  /** O segundo nivel, OPCIONAL. */
  subcategory: string | null;
  /** Caminho no site do parceiro, com a barra inicial. */
  image_path: string | null;
  /** Caminho no site do parceiro, com a barra inicial. */
  target_path: string | null;
  target_host: string | null;
  /** Centavos, inteiro. Nunca ponto flutuante. */
  price_amount: number | null;
  price_currency: string | null;
  /** Data pura: a da consulta HUMANA ao preco, nunca derivada de carimbo. */
  price_checked_at: Date | null;
  active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** O `ETag` do painel. Incrementada a cada escrita. */
  version: Generated<number>;
  /** A PRIMEIRA publicacao. Nunca reescrita. */
  published_at: Date | null;
}

/** A que especies o item serve (ADR-0027 A.2.1). */
export interface StoreItemSpeciesTable {
  item_id: string;
  species: 'dog' | 'cat' | 'other';
}

/** O vocabulario curado de tags da Loja (ADR-0027 A.2.1). */
export interface StoreTagsTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  slug: string;
  label: string;
  active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

export interface StoreItemTagsTable {
  item_id: string;
  tag_id: string;
}

/** Ate 8 imagens por item; `position = 0` e a principal (ADR-0027 A.2.1). */
export interface UserShowcaseImagesTable {
  user_id: string;
  /** `catalog_images.id`, com `purpose = 'user_showcase'`. */
  image_id: string;
  /**
   * `0` e a capa. Ate `8`: o teto de NOVE e este intervalo mais a unicidade por
   * conta.
   */
  position: number;
  /**
   * **Anulavel, e e a unica diferenca do molde.** Nao ha terceiro que leia esta
   * vitrine, e legenda esta fora de proposito; nulo faz o leitor de tela cair no
   * rotulo da grade.
   */
  alt_text: string | null;
}

export interface StoreItemImagesTable {
  item_id: string;
  image_id: string;
  /** `0` e a capa. Ate `7`. */
  position: number;
  /** **Opcional desde a `20261017000002`** (pedido do cliente de 17/10/2026). */
  alt_text: string | null;
}

/** A imagem de catalogo (ADR-0027 A.3). */
export interface CatalogImagesTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** Nulo depois que o varredor apagou a intencao de envio (`ON DELETE SET NULL`). */
  upload_intent_id: string | null;
  purpose: PropositoDaImagemDeCatalogo;
  status: Generated<StatusDaFoto>;
  /** Chave da derivada de 1024 px. */
  public_key: string | null;
  /** Derivada de 480 px (4:3) para a galeria do encontro, que desenha 144 dp. */
  thumb_key: string | null;
  /** Derivada de 1280 px (16:9) para a capa de borda a borda do detalhe. */
  banner_key: string | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
}

/** O encontro da secao `Rede` (ADR-0025, emendado pela secao 12 do ADR-0027). */
export interface NetworkEventsTable {
  /** Identidade interna. Alvo das chaves estrangeiras, e nunca projetada. */
  id: string;
  /** O endereco publico. Unico, e a unica chave do encontro que sai em resposta. */
  slug: string;
  title: string;
  summary: string;
  /** O nome do lugar PUBLICO. */
  place_name: string;
  neighborhood: string;
  city: string;
  state: string;
  /** `geography(Point,4326)`. */
  geo: ColumnType<never, never, never>;
  /** `map_pin` ou nulo, e anda junto de `geo` por `CHECK`. */
  geo_source: OrigemDoPontoDoEncontro | null;
  starts_at: Date;
  ends_at: Date | null;
  /**
   * O nome IANA da zona, e ele anda junto de `starts_at` por necessidade:
   * `timestamptz` sozinho diz o instante e nao diz a hora de parede.
   */
  time_zone: Generated<string>;
  visibility: Generated<VisibilidadeDoEncontro>;
  admission_kind: Generated<EntradaDoEncontro>;
  /** Centavos. Nulo quando gratuito; anda junto de moeda e unidade por `CHECK`. */
  admission_amount: number | null;
  admission_currency: 'BRL' | null;
  admission_unit: UnidadeDoValor | null;
  dog_age: Generated<IdadeDosCaes>;
  vaccination_required: Generated<boolean>;
  fenced_off_leash_area: Generated<boolean>;
  /** Endereco por extenso (01/10/2026). */
  street_address: ColumnType<string | null, string | null | undefined, string | null>;
  /** Link de ingresso, https (ADR-0027 item 22). */
  ticket_url: ColumnType<string | null, string | null | undefined, string | null>;
  /** O @ do Instagram, sem @ e em minusculas. */
  instagram_handle: ColumnType<string | null, string | null | undefined, string | null>;
  notes: string | null;
  origin: Generated<OrigemDoEncontro>;
  publication_status: PublicacaoDoEncontro;
  published_at: Date | null;
  cancelled_at: Date | null;
  cancellation_note: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  version: Generated<number>;
}

/** O `CHECK` `network_events_origem_do_ponto`. */
export type OrigemDoPontoDoEncontro = 'map_pin';

export type VisibilidadeDoEncontro = 'public' | 'private';
export type EntradaDoEncontro = 'free' | 'paid';
export type UnidadeDoValor = 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people';
export type IdadeDosCaes = 'any' | 'from_4_months' | 'from_1_year' | 'up_to_1_year';
export type ItemParaLevar =
  | 'water'
  | 'water_bowl'
  | 'leash'
  | 'poop_bags'
  | 'treats'
  | 'towel'
  | 'vaccination_card'
  | 'toy';
export type EstruturaDoLocal =
  | 'level_ground_or_ramp'
  | 'accessible_restroom'
  | 'public_restroom_nearby'
  | 'shade'
  | 'benches'
  | 'dog_water_fountain'
  | 'parking_nearby';
/** A DECISAO guardada. O app nunca ve `declined` (ADR-0027 12.11). */
export type DecisaoDoPedido = 'pending' | 'approved' | 'declined';

export interface NetworkEventBringItemsTable {
  event_id: string;
  item: ItemParaLevar;
}

export interface NetworkEventSizesTable {
  event_id: string;
  size: string;
}

/**
 * A GALERIA de uma entrada do diretorio de `Perto` (`20261029000001`, decisao do
 * cliente de 29/10/2026: *"implemente a tabela de galeria entao"*).
 */
export interface ProfessionalImagesTable {
  /** `professionals.id`, a identidade interna. */
  professional_id: string;
  /** `catalog_images.id`, com `purpose = 'directory_gallery'`. */
  image_id: string;
  /** 0 e a capa da galeria; o `CHECK` do banco vai a 7. */
  position: number;
  /**
   * **Anulavel desde o nascimento da tabela**, e nao afrouxado depois: a `Loja`
   * perdeu a obrigacao em 17/10/2026 e a `Rede` em 21/10, as duas por pedido do
   * cliente, e nascer `NOT NULL` aqui criaria em 29/10 a obrigacao que as duas
   * galerias irmas nao tem -- com UM componente de galeria no painel para as tres.
   */
  alt_text: string | null;
}

/**
 * As FOTOS DO ESTABELECIMENTO que quem indicou enviou (`20261030000002`,
 * pedido do cliente de 29 e 30/10/2026: *"devemos deixar enviar ate 4
 * imagens"* e *"so tem o campo para subir a foto do logotipo da empresa, mas
 * nao as fotos do estabelecimento que fica no topo da pagina"*).
 *
 * **Nao substitui `directory_suggestions.logo_image_id`:** a logo e UMA porque
 * e a marca, e **nao conta entre as quatro**; estas sao a faixa 16:9 do topo.
 *
 * **SEM `alt_text`**, e e a primeira galeria do projeto a nascer assim: o
 * cliente mandou remover a descricao de foto do APLICATIVO em 26/10/2026, e
 * estas imagens so entram pelo aplicativo -- nao ha painel que as escreva.
 */
export interface DirectorySuggestionImagesTable {
  /** `directory_suggestions.id`. `ON DELETE CASCADE`: a linha nao tem vida propria. */
  suggestion_id: string;
  /** `catalog_images.id`, com `purpose = 'directory_suggestion_photo'`. */
  image_id: string;
  /** 0 e a CAPA; o `CHECK` do banco vai a 3 -- quatro imagens, e nao oito. */
  position: number;
}

/** A galeria do encontro (ADR-0027 A.4.2); `position = 0` e a capa. */
export interface NetworkEventImagesTable {
  event_id: string;
  image_id: string;
  position: number;
  /**
   * **Opcional desde a `20261020000013`** (decisao do cliente de 21/10/2026, dita
   * duas vezes: "pode remover a descricao da imagem").
   */
  alt_text: string | null;
}

export interface NetworkEventAmenitiesTable {
  event_id: string;
  amenity: EstruturaDoLocal;
}

/** O pedido para participar de encontro privado. */
export interface NetworkEventJoinRequestsTable {
  id: string;
  ref: string;
  event_id: string;
  user_id: string;
  status: Generated<DecisaoDoPedido>;
  requested_at: Generated<Date>;
  decided_at: Date | null;
  withdrawn_at: Date | null;
}

/**
 * O `CHECK` `collar_tag_requests_decisao_conhecida`: a DECISAO do painel, e so
 * ela.
 */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/**
 * O `CHECK` `collar_tag_requests_entrega_conhecida`: os tres passos da ENTREGA,
 * acrescentados pela `20261018000004` -- solicitado, em transporte, chegou.
 */
export type PassoDaEntregaDaPlaquinha = 'requested' | 'in_transit' | 'arrived';

/** O pedido do OBJETO FISICO da plaquinha da coleira. */
export interface CollarTagRequestsTable {
  id: string;
  ref: string;
  pet_id: string;
  requested_by: string;
  notes: string | null;
  /**
   * O endereco de entrega. **Dado pessoal**: nao sai em superficie publica, nao
   * entra na trilha de auditoria e nao e geocodificado (ADR-0006) -- nao ha `lat`,
   * nao ha `lon` e nenhum servico externo resolve o CEP.
   */
  recipient_name: string;
  /** E.164 do Brasil (`+55` e 10 ou 11 digitos). */
  recipient_phone: string;
  /** Oito digitos, sem mascara. */
  postal_code: string;
  street: string;
  /** Texto, e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. */
  street_number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  /** UF em dois caracteres. O conjunto das 27 siglas vive no app. */
  state: string;
  status: Generated<DecisaoDoPedidoDePlaquinha>;
  requested_at: Generated<Date>;
  decided_at: Date | null;
  /**
   * O passo da ENTREGA. `Generated` porque a coluna e `NOT NULL DEFAULT
   * 'requested'`: o `INSERT` do pedido nao o escreve, e todo pedido que existe --
   * inclusive os de antes da `20261018000004` -- tem um passo.
   */
  delivery_state: Generated<PassoDaEntregaDaPlaquinha>;
  /** O codigo de rastreio, TEXTO que o administrador digita. */
  tracking_code: string | null;
  /** Quando saiu. Nulo enquanto `delivery_state` e `requested`. */
  shipped_at: Date | null;
  /** Quando chegou. Nulo em tudo que nao chegou. */
  delivered_at: Date | null;
}

/** O ENDERECO DE ENTREGA GUARDADO NA CONTA (`20261020000016`). */
export interface UserDeliveryAddressesTable {
  /** O dono, e a chave primaria: "um endereco por conta" e a forma da tabela. */
  user_id: string;
  /** Quem recebe, como vai na etiqueta. */
  recipient_name: string;
  /** E.164 do Brasil. Nao e `users.phone_e164`: e o telefone de quem RECEBE. */
  recipient_phone: string;
  /** Oito digitos, sem mascara. */
  postal_code: string;
  street: string;
  /** Texto, e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. */
  street_number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  /** UF em dois caracteres. O conjunto das 27 siglas vive no app. */
  state: string;
  /** Quando a pessoa salvou pela ultima vez. */
  updated_at: Generated<Date>;
}

/** O ENDERECO DE ENTREGA DO PET (`20261027000001`). */
export interface PetDeliveryAddressesTable {
  /** O pet, e a chave primaria: "um endereco por pet" e a forma da tabela. */
  pet_id: string;
  /** Quem recebe, como vai na etiqueta. */
  recipient_name: string;
  /** E.164 do Brasil. Nao e `users.phone_e164`: e o telefone de quem RECEBE. */
  recipient_phone: string;
  /** Oito digitos, sem mascara. */
  postal_code: string;
  street: string;
  /** Texto, e nao inteiro: `s/n`, `120A` e `KM 32` sao numeros de porta. */
  street_number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  /** UF em dois caracteres. O conjunto das 27 siglas vive no app. */
  state: string;
  /** Quando o tutor salvou pela ultima vez. */
  updated_at: Generated<Date>;
}

/** O `CHECK` `network_events_origem_conhecida`. */
export type OrigemDoEncontro = 'admin' | 'community';

/** O `CHECK` `network_events_publicacao_conhecida`. */
export type PublicacaoDoEncontro = 'published' | 'cancelled' | 'removed';

/**
 * FATIA F (18/10/2026). A conexao entre pessoas: SIMETRICA, com pedido e aceite,
 * **uma linha por par**.
 */
export interface UserConnectionsTable {
  /** UUIDv7 gerado pela aplicacao. */
  id: string;
  /** 128 bits em base64url (22 caracteres). */
  ref: string;
  requester_user_id: string;
  addressee_user_id: string;
  state: Generated<EstadoDaConexao>;
  origin: OrigemDoPedidoDeConexao;
  requested_at: Generated<Date>;
  expires_at: Date;
  responded_at: Date | null;
  rest_until: Date | null;
}

/** O `CHECK` `user_connections_estado_conhecido`. */
export type EstadoDaConexao = 'pending' | 'accepted' | 'declined';

/** O `CHECK` `user_connections_origem_fechada`. */
export type OrigemDoPedidoDeConexao =
  | 'anchored_case'
  | 'anchored_event'
  | 'presence_code'
  | 'invite_link'
  | 'people_search';

/**
 * `connection_invites` -- O CONVITE QUE ALIMENTA O LINK E O QR (`20261020000012`,
 * decisao do cliente de 20/10/2026).
 */
export interface ConnectionInvitesTable {
  /** UUIDv7 da aplicacao. Nunca sai em resposta (ADR-0010 item 6). */
  id: string;
  /** Quem emitiu, e para quem o convite resolve. */
  owner_user_id: string;
  /**
   * Os **32 bytes** do SHA-256 do token, nunca o token cru e nunca o texto base64 do
   * resumo.
   */
  token_hash: Buffer;
  created_at: Generated<Date>;
  /** 30 dias. A expiracao e PREGUICOSA: toda leitura compara com o agora. */
  expires_at: Date;
  /** Nulo e o convite ATIVO. E o nulo que o indice parcial unico conta. */
  revoked_at: Date | null;
}

/**
 * `user_blocks` -- o BLOQUEIO, ferramenta pessoal e nao moderacao
 * (`20261018000031`).
 */
export interface UserBlocksTable {
  id: string;
  /** Quem bloqueou. Entra no `WHERE`; nunca sai em resposta. */
  blocker_user_id: string;
  /** Quem foi bloqueado. `ON DELETE CASCADE`: a linha morre com o expurgo. */
  blocked_user_id: string;
  created_at: Generated<Date>;
}

/** `user_publications` -- A PUBLICACAO DO MURAL (`20261020000002`). */
export interface UserPublicationsTable {
  /** Identidade interna. Nunca projetada em resposta (ADR-0010 item 6). */
  id: string;
  /**
   * Quem publicou. Entra no `WHERE` de toda leitura e de toda escrita; **nunca e
   * projetada**.
   */
  author_user_id: string;
  /** O endereco publico: 128 bits em base64url, 22 simbolos. */
  public_ref: string;
  /** O texto, **LIVRE**, 1 a 280. */
  body: string;
  /** A foto, opcional e UNICA (`UNIQUE`). */
  image_id: string | null;
  /** Rotulo do leitor de tela, **opcional**, 2 a 150, e so com `image_id`. */
  alt_text: string | null;
  created_at: Generated<Date>;
  /**
   * EXCLUSAO LOGICA, e a denuncia e o motivo: a chave estrangeira de
   * `publication_reports.publication_id` e `SET NULL`, e um apagamento fisico
   * deixaria a denuncia aberta sem alvo no meio da fila do painel.
   */
  deleted_at: Date | null;
}

/** `publication_likes` -- A CURTIDA (`20261020000006`). */
export interface PublicationLikesTable {
  publication_id: string;
  /** Quem curtiu. Entra no `WHERE`; **nunca e projetada**. */
  user_id: string;
  created_at: Generated<Date>;
}

/** `publication_comments` -- O COMENTARIO (`20261020000006`). */
export interface PublicationCommentsTable {
  /** Identidade interna. Nunca projetada (ADR-0010 item 6). */
  id: string;
  /**
   * A publicacao. `ON DELETE CASCADE`: o expurgo da conta apaga a publicacao de
   * verdade e leva os comentarios.
   */
  publication_id: string;
  /** Quem comentou. Entra no `WHERE`; **nunca e projetada**. */
  author_user_id: string;
  /** O endereco publico: 22 simbolos, a MESMA forma de `user_publications`. */
  public_ref: string;
  /** O texto, **LIVRE**, 1 a 280. */
  body: string;
  created_at: Generated<Date>;
  /** EXCLUSAO LOGICA, pelo molde da publicacao. */
  deleted_at: Date | null;
}

/** As colunas que as tres tabelas de denuncia desta fatia compartilham. */
interface DenunciaDaComunidade {
  id: string;
  /**
   * Quem denunciou. SEM A MARCA do portao de saida, pela mesma decisao de
   * `professional_review_reports.reporter_user_id`: `src/` precisa dela no `WHERE`
   * para a ocultacao imediata, para os tetos e para recusar a denuncia do proprio
   * conteudo.
   */
  reporter_user_id: string;
  /** Relato opcional. Nao e o motivo: e contexto sobre o motivo escolhido. */
  detail: string | null;
  /** Quantas vezes a MESMA pessoa denunciou o MESMO alvo nesta linha aberta. */
  repeat_count: Generated<number>;
  created_at: Generated<Date>;
  last_reported_at: Generated<Date>;
  /** Nulo e "na fila". Escrito por quem modera. */
  resolved_at: Date | null;
  resolution: DecisaoDaModeracao | null;
  /** O motivo da decisao, para quem auditar. */
  resolution_reason: string | null;
}

/** Denuncia de PERFIL: cinco motivos, sobre quem a pessoa e. */
export interface ProfileReportsTable extends DenunciaDaComunidade {
  /** `SET NULL`: a denuncia SOBREVIVE ao expurgo da conta do denunciado. */
  subject_user_id: string | null;
  /** `users.public_ref` em COPIA. */
  subject_ref: string;
  reason: 'impersonation' | 'harassment' | 'pet_ransom_scam' | 'minor_suspected' | 'other';
}

/** Denuncia de FOTO: seis motivos, e o alvo e a esteira de imagem. */
export interface PhotoReportsTable extends DenunciaDaComunidade {
  image_id: string | null;
  /** `catalog_images.public_key` em COPIA. */
  image_public_key: string;
  owner_user_id: string | null;
  reason:
    | 'nudity_or_sexual'
    | 'child_at_risk'
    | 'animal_violence'
    | 'i_am_in_it'
    | 'impersonation'
    | 'other';
}

/** Denuncia de PUBLICACAO: cinco motivos, e a terceira lista e so deste produto. */
export interface PublicationReportsTable extends DenunciaDaComunidade {
  /** A publicacao denunciada. */
  publication_id: string | null;
  publication_ref: string;
  /** O texto denunciado, CONGELADO: editar depois nao muda o que foi julgado. */
  publication_body: string | null;
  reason:
    | 'offensive_or_discriminatory'
    | 'scam_or_animal_sale'
    | 'false_lost_pet_info'
    | 'spam_or_repetition'
    | 'other';
}

export interface AppVersionPolicyTable {
  /**
   * A chave. Politica por plataforma e requisito: hoje so o Android e publicado
   * (decisao do cliente de 23/09) e o iOS esta dormente, instalado por cabo com
   * provisionamento gratuito.
   */
  platform: 'android' | 'ios';
  /** Abaixo desta versao o aplicativo FECHA. */
  minimum_version: string | null;
  /** A partir desta versao o app so AVISA, de forma dispensavel. */
  recommended_version: string | null;
  /** Destino do botao. Nula hoje: nao ha loja. */
  store_url: string | null;
  /** Quem trocou o numero. Texto livre: quem escreve esta no `psql`. */
  updated_by: string | null;
  updated_at: AtualizadoEm;
}

/** Quais paginas publicas do site existem de verdade (`20261020000010`). */
export interface SitePageAvailabilityTable {
  /** A pagina, dominio fechado pelo `CHECK`: a mao humana escreve aqui. */
  page: 'lost_case' | 'poster' | 'network_event';
  /** A pagina serve 200 com as marcas de Open Graph? */
  is_published: Generated<boolean>;
  /** Quem publicou. Texto livre: quem escreve esta no `psql`. */
  updated_by: string | null;
  updated_at: AtualizadoEm;
}

/**
 * `help_requests` -- a duvida que o tutor manda pelo botao `Ajuda` do menu do
 * usuario (migracao `20261029000010`, 29/10/2026).
 */
export interface HelpRequestsTable {
  /** UUIDv7 da aplicacao. Sem `Generated`: a coluna nao tem `DEFAULT`. */
  id: string;
  /** O endereco OPACO da duvida, 22 simbolos base64url. */
  ref: string;
  /** FK para `users`, `ON DELETE CASCADE`. */
  author_user_id: string;
  /** 2 a 120 por `CHECK`. O mesmo teto esta em `HelpRequestInput`. */
  subject: string;
  /** 2 a 4000 por `CHECK`. Texto livre, sem filtro de palavra. */
  body: string;
  created_at: CriadoEm;
  /** Quando alguem do painel marcou como atendida. */
  attended_at: Date | null;
  /** Quem marcou, em `admin_accounts` e NUNCA em `users`. */
  attended_by_admin_id: string | null;
}

export interface Database {
  handles: HandlesTable;
  user_connections: UserConnectionsTable;
  connection_invites: ConnectionInvitesTable;
  users: UsersTable;
  user_reference_locations: UserReferenceLocationsTable;
  user_devices: UserDevicesTable;
  alert_dispatches: AlertDispatchesTable;
  alert_recipients: AlertRecipientsTable;
  user_identities: UserIdentitiesTable;
  local_credentials: LocalCredentialsTable;
  user_roles: UserRolesTable;
  verification_tokens: VerificationTokensTable;
  refresh_tokens: RefreshTokensTable;
  reauth_tokens: ReauthTokensTable;
  passkey_credentials: PasskeyCredentialsTable;
  passkey_challenges: PasskeyChallengesTable;
  admin_accounts: AdminAccountsTable;
  admin_sessions: AdminSessionsTable;
  admin_reauth_tokens: AdminReauthTokensTable;
  admin_session_alerts: AdminSessionAlertsTable;
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
  match_candidates: MatchCandidatesTable;
  upload_intents: UploadIntentsTable;
  catalog_upload_intents: CatalogUploadIntentsTable;
  pet_photos: PetPhotosTable;
  jobs: JobsTable;
  notification_deliveries: NotificationDeliveriesTable;
  notification_items: NotificationItemsTable;
  notification_counter_state: NotificationCounterStateTable;
  notification_broadcasts: NotificationBroadcastsTable;
  lost_cases: LostCasesTable;
  conversations: ConversationsTable;
  conversation_messages: ConversationMessagesTable;
  conversation_reads: ConversationReadsTable;
  conversation_list_views: ConversationListViewsTable;
  section_list_views: SectionListViewsTable;
  conversation_reports: ConversationReportsTable;
  pet_transfers: PetTransfersTable;
  professionals: ProfessionalsTable;
  professional_images: ProfessionalImagesTable;
  professional_reviews: ProfessionalReviewsTable;
  professional_review_reports: ProfessionalReviewReportsTable;
  entity_verifications: EntityVerificationsTable;
  directory_suggestions: DirectorySuggestionsTable;
  directory_suggestion_images: DirectorySuggestionImagesTable;
  store_catalog_versions: StoreCatalogVersionsTable;
  store_partners: StorePartnersTable;
  store_categories: StoreCategoriesTable;
  store_subcategories: StoreSubcategoriesTable;
  store_subcategory_species: StoreSubcategorySpeciesTable;
  store_items: StoreItemsTable;
  catalog_images: CatalogImagesTable;
  store_item_species: StoreItemSpeciesTable;
  store_tags: StoreTagsTable;
  store_item_tags: StoreItemTagsTable;
  store_item_images: StoreItemImagesTable;
  user_showcase_images: UserShowcaseImagesTable;
  user_publications: UserPublicationsTable;
  publication_likes: PublicationLikesTable;
  publication_comments: PublicationCommentsTable;
  network_events: NetworkEventsTable;
  network_event_bring_items: NetworkEventBringItemsTable;
  network_event_sizes: NetworkEventSizesTable;
  network_event_amenities: NetworkEventAmenitiesTable;
  network_event_images: NetworkEventImagesTable;
  network_event_join_requests: NetworkEventJoinRequestsTable;
  collar_tag_requests: CollarTagRequestsTable;
  /** O endereco de entrega guardado na conta (`20261020000016`). */
  user_delivery_addresses: UserDeliveryAddressesTable;
  pet_delivery_addresses: PetDeliveryAddressesTable;
  /** VISAO, e nao tabela. Somente leitura: nada escreve aqui (`20261018000009`). */
  fila_de_moderacao: FilaDeModeracaoView;
  user_blocks: UserBlocksTable;
  profile_reports: ProfileReportsTable;
  photo_reports: PhotoReportsTable;
  publication_reports: PublicationReportsTable;
  app_version_policy: AppVersionPolicyTable;
  site_page_availability: SitePageAvailabilityTable;
  help_requests: HelpRequestsTable;
  'audit.events': AuditEventsTable;
}

export type PetRow = Selectable<PetsTable>;
export type UserRow = Selectable<UsersTable>;
export type RefreshTokenRow = Selectable<RefreshTokensTable>;
