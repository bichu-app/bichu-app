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
    | 'not_me'
    | null;
  device_id: string | null;
  user_agent: string | null;
  ip_hmac: Buffer | null;
}

/**
 * A janela de 5 minutos aberta por `POST /v1/auth/reauth` (BICHUS-48).
 *
 * Sem `Generated` em `issued_at`: a coluna nao tem `DEFAULT now()` porque ela e
 * comparada com `users.sessions_invalid_before`, que a aplicacao grava. Os dois
 * lados da comparacao precisam sair do mesmo relogio.
 */
export interface ReauthTokensTable {
  id: string;
  user_id: string;
  /** `jti` do token de acesso que pediu a janela. E o vinculo com a sessao. */
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
 * O aviso do achador, pelos dois caminhos: o QR da plaquinha (`tag_scan`) e o
 * achado avulso (`stray_report`, BICHUS-35).
 *
 * Uma tabela e não duas: ver o cabeçalho da migração
 * `20260922000003_achado-avulso-e-correspondencia.sql`. O preço — colunas que só
 * um dos dois caminhos preenche — está pago em `CHECK` no banco, e não em
 * disciplina de aplicação.
 */
export interface FoundReportsTable {
  id: string;
  origin: 'tag_scan' | 'stray_report';
  tag_id: string | null;
  pet_id: string | null;
  /** Nulo no aviso anônimo; **obrigatório** no achado avulso (CHECK no banco). */
  reporter_user_id: string | null;
  /** Identidade derivada do achador sem conta. Sustenta a dimensão `finder_identity`. */
  finder_identity_hash: Buffer | null;
  finder_display_name: string | null;
  finder_email: string | null;
  /**
   * A autorização de quem NÃO tem conta. Anulável desde a BICHUS-35: no achado
   * avulso o contrato exige `bearerAuth` e quem autoriza é `reporter_user_id` —
   * cunhar um token ao portador para quem já tem conta seria fabricar uma
   * credencial que ninguém usa. O CHECK `found_reports_scan_tem_token` mantém a
   * obrigatoriedade exatamente onde ela significa alguma coisa.
   */
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
  /** Código de `reference-data`. É ELE que o cruzamento lê (critério 8). */
  breed_code: string | null;
  /** A raça como o achador escreveu. Descreve, não cruza. */
  breed_free_text: string | null;
  primary_color_code: string | null;
  ref_data_version: string | null;
  /**
   * `geography(Point,4326)`. `never` nos três sentidos, como
   * `user_reference_locations.reference_point`: é o tipo que impede a coluna de
   * ser selecionada crua ou inserida pelo construtor tipado. O único caminho
   * para ela é o SQL de `kysely-found-report-repository.ts`, onde `ST_MakePoint`
   * e `ST_Distance` ficam à vista de quem revisa.
   */
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

/**
 * BICHUS-35, critério 7. O cruzamento **sugere**; quem confirma é uma pessoa.
 *
 * `decided_by_user_id` e `decided_at` não são opcionais por conveniência: o
 * CHECK `match_candidates_decisao_tem_autor` exige os dois para qualquer status
 * fora de `suggested`, e o cruzamento não tem nem um nem outro para oferecer.
 */
export interface MatchCandidatesTable {
  id: string;
  case_id: string;
  found_report_id: string;
  /** `numeric(4,3)`, que o driver entrega como texto. Ver o adaptador. */
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
  /**
   * O aviso a que esta intenção pertence (BICHUS-35). Exatamente um de `pet_id`
   * e `found_report_id` é preenchido, e o banco cobra isso
   * (`upload_intents_um_contexto_so`).
   */
  found_report_id: string | null;
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

/**
 * BICHUS-92. Onde o tutor mora, aproximadamente, para a consulta de raio.
 *
 * Tabela própria e não colunas em `users`: `users` é lida em toda rota
 * autenticada, e onde a pessoa mora não precisa acompanhar a leitura de sessão.
 * O raciocínio inteiro está no cabeçalho da migração.
 */
export interface UserReferenceLocationsTable {
  /** PK **e** FK. É isto que torna histórico inexprimível (critério 5). */
  user_id: string;
  /**
   * `geography(Point,4326)`, já quantizado. `never` nos três sentidos de
   * propósito: é o tipo que impede a coluna de ser selecionada crua ou inserida
   * pelo construtor tipado. O único caminho para ela é o SQL de
   * `kysely-localizacao-de-referencia.ts`, onde `ST_MakePoint` e `ST_Y`/`ST_X`
   * ficam à vista de quem revisa.
   */
  reference_point: ColumnType<never, never, never>;
  /** Lado da célula da grade, em metros, como ele sai em `UserLocation`. */
  precision_m: number;
  source: 'device_gps' | 'map_pin';
  captured_at: Date;
  /** 30 dias após a captura. Vencida, a conta sai da base de alerta. */
  expires_at: Date;
}

/**
 * BICHUS-91. Os aparelhos de uma conta, e o token por onde o push chega.
 *
 * Tabela própria e não colunas em `users` pela mesma razão de
 * `user_reference_locations`, com um peso a mais: `push_token` é **credencial
 * de entrega**, e `users` é lida em toda rota autenticada. O raciocínio inteiro
 * está no cabeçalho da migração.
 */
export interface UserDevicesTable {
  /** UUIDv7 da aplicação. Sai em `Device.id`, e só para o dono. */
  id: string;
  user_id: string;
  platform: 'android' | 'ios';
  /**
   * Em claro porque precisa ser **replicada** ao FCM a cada envio — o refresh
   * mora como SHA-256 porque só precisa ser conferido, e este não. `null` é
   * estado legítimo: quem negou a permissão continua registrado (ADR-0008).
   */
  push_token: string | null;
  push_permission: 'granted' | 'denied' | 'not_asked';
  app_version: string | null;
  os_version: string | null;
  registered_at: Date;
  last_seen_at: Date;
}

/**
 * Os quatro estados de `AlertDispatch.reach_status`. Espelha o `enum` do
 * contrato, e os quatro são distintos: ver o cabeçalho da migração.
 */
export type EstadoDoDisparo = 'computed' | 'unavailable' | 'queued' | 'no_location';

/**
 * BICHUS-18. Um disparo do alerta de 5 km, por caso.
 *
 * Tabela própria e não colunas em `lost_cases` porque um caso pode disparar
 * mais de uma vez ao longo da vida (o reenvio do contrato existe, limitado a um
 * por 24 h), e porque o critério 7 do ADR-0006 pergunta pelo **último** disparo
 * — o que exige uma linha por disparo, e não o estado corrente sobrescrito.
 */
export interface AlertDispatchesTable {
  id: string;
  case_id: string;
  radius_m: number;
  reach_status: EstadoDoDisparo;
  /** `null` em tudo que não é `computed`. O CHECK do banco impede o par errado. */
  recipients_total: number | null;
  /** O teto de 500 cortou a lista. Muda a leitura da métrica (critério 9). */
  cap_reached: Generated<boolean>;
  requested_at: Date;
  /** `null` enquanto `queued`. O critério 7 do ADR-0006 conta a partir daqui. */
  dispatched_at: Date | null;
}

/**
 * BICHUS-18. Quem foi avisado em cada disparo.
 *
 * Existe para o teto de fadiga (critério 6 do ADR-0006), que é **por usuário e
 * não por caso**. Sem coluna de aparelho, de token, de distância e de texto do
 * aviso: o raciocínio inteiro está no cabeçalho da migração.
 */
export interface AlertRecipientsTable {
  dispatch_id: string;
  user_id: string;
  notified_at: Date;
}

/** Papel na conversa mediada. `system` é o Bichu falando, e não uma pessoa. */
export type PapelNaConversa = 'tutor' | 'finder' | 'system';

/** Por que a conversa fechou. Espelha o CHECK de `conversations`. */
export type MotivoDeEncerramentoDaConversa = 'case_closed' | 'pet_returned' | 'retention';

/** Por que a conversa foi retida para revisão humana (BICHUS-43, 10, 11 e 17). */
export type MotivoDeRetencao = 'message_volume' | 'serial_finder';

/**
 * BICHUS-43. A conversa mediada, que nasce de um aviso e de nada mais.
 *
 * **Não há coluna de `status`.** Os três valores que o contrato declara
 * (`open`, `blocked`, `closed`) saem de `blocked_at`, de `closed_at` e do
 * estado do caso ligado, na leitura. O raciocínio está no cabeçalho da migração.
 */
export interface ConversationsTable {
  /** UUIDv7 gerado pela aplicação. Sem `DEFAULT` no banco, como em `pets`. */
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
  /** Invisível aos dois lados de propósito. Ver a migração. */
  held_for_review_at: Date | null;
  held_reason: MotivoDeRetencao | null;
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
}

/**
 * BICHUS-66. Os cinco estados da troca de tutor.
 *
 * `accepted` e o unico que carrega prazo: dele para `effective` passam 24 h em
 * que NADA foi revogado e qualquer um dos tres caminhos de cancelamento ainda
 * desfaz. Ver o cabecalho de `migrations/20260922000005_transferencia-de-pet.sql`.
 */
export type StatusDaTransferencia =
  | 'pending_acceptance'
  | 'accepted'
  | 'effective'
  | 'cancelled'
  | 'expired';

/** Por que a transferencia foi desfeita. Lista fechada, imposta por CHECK. */
export type MotivoDoCancelamentoDaTransferencia =
  | 'current_owner'
  | 'cancel_token'
  | 'lost_case_opened'
  | 'recipient_gone';

export interface PetTransfersTable {
  /** UUIDv7 gerado pela aplicacao. Sem `DEFAULT` no banco, como em `pets`. */
  id: string;
  pet_id: string;
  /** O tutor no momento do convite. Depois de consumada, `pets.owner_user_id` ja e outro. */
  from_user_id: string;
  /** Normalizado (minusculas, sem espaco). Sai mascarado, nunca em claro. */
  recipient_email: string;
  /** Preenchida no aceite. Anulavel porque a FK e `ON DELETE SET NULL`. */
  to_user_id: string | null;
  /** SHA-256 de 256 bits de CSPRNG. O claro nunca existe em coluna nenhuma. */
  invite_token_hash: Buffer;
  /** Nulo ate o aceite; depois dele, a credencial de desfazer, de uso unico. */
  cancel_token_hash: Buffer | null;
  status: Generated<StatusDaTransferencia>;
  /** Fim do prazo para ACEITAR (72 h). E o `expires_at` do contrato. */
  invite_expires_at: Date;
  accepted_at: Date | null;
  /** 24 h apos o aceite. Enquanto o estado e `accepted`, esta no futuro. */
  effective_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: MotivoDoCancelamentoDaTransferencia | null;
  created_at: CriadoEm;
}

/**
 * O diretorio de `Perto`, mapeado um dia depois de a migracao existir.
 *
 * As tabelas nasceram em `migrations/20260921000002` e ficaram **fora deste
 * arquivo**: nenhuma linha de `src/` as conhecia. Elas entram aqui agora porque
 * a leitura publica do diretorio passou a existir -- e entram com a mesma regra
 * dos outros mapeamentos deste arquivo: nome de coluna e o nome do banco, e a
 * traducao para a forma do dominio mora no adaptador.
 */
/** Espelha `TipoDeProfissional` de `modules/professionals/domain/perfil-publico.ts`. */
export type TipoDeProfissional = 'vet' | 'groomer' | 'walker' | 'sitter' | 'trainer' | 'clinic';

/**
 * Sem `'community'`. A emenda 1 do ADR-0011 negou a criacao pela comunidade em
 * 21/09 e pos `'invited'` no lugar; reintroduzir o valor aqui seria desfazer a
 * decisao do cliente, e nao corrigir um esquecimento.
 */
export type OrigemDoPerfil = 'self' | 'invited' | 'import';

export type EstadoDaTitularidade = 'unclaimed' | 'claim_pending' | 'claimed' | 'disputed';

export type StatusDoPerfil = 'draft' | 'published' | 'hidden' | 'removed';

/**
 * O que foi verificado, e nao um selo generico (BICHUS-165). **Derivado** da
 * verificacao aprovada mais forte em `entity_verifications`, nunca escrito por
 * rota de escrita de perfil: perfil que declara o proprio nivel torna a
 * verificacao decorativa.
 */
export type NivelDeVerificacao = 'none' | 'contact_verified' | 'document_verified';

export interface ProfessionalsTable {
  /** UUIDv7 gerado pela aplicacao. Sem `DEFAULT` no banco, como em `pets`. */
  id: string;
  kind: TipoDeProfissional;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  /**
   * `geography(Point,4326)`. `never` nos tres sentidos, como
   * `user_reference_locations.reference_point` e `found_reports.found_point`: o
   * tipo impede a coluna de ser selecionada crua ou inserida pelo construtor
   * tipado, e o unico caminho ate ela e SQL onde `ST_MakePoint` fica a vista.
   *
   * **Hoje ninguem escreve nesta coluna.** Nao ha painel de cadastro, e a
   * ADR-0006 proibe geocodificacao: bairro digitado nao vira ponto. Enquanto
   * isso valer, `Perto` recorta por texto e nao ordena por distancia.
   */
  geo: ColumnType<never, never, never>;
  source: OrigemDoPerfil;
  /**
   * **UMA COLUNA DESTA TABELA NAO ESTA AQUI, E A AUSENCIA E A REGRA.**
   *
   * A que guarda quem CONVIDOU a entidade e vinculo entre duas pessoas, e a
   * BICHUS-174 proibe expo-lo inclusive como contagem e como existencia. Ela
   * carrega a marca `NUNCA sai do servidor` no `COMMENT ON COLUMN` da migracao
   * de 21/09, e `src/tools/portao-colunas-que-nao-saem.ts` varre **todo** `.ts`
   * de `src/` pelo nome literal dela: declara-la aqui **reprova o build**.
   *
   * Isso nao e limitacao do portao, e o desenho funcionando. A aplicacao nunca
   * le nem escreve essa coluna -- ela existe para a trilha --, e o construtor
   * tipado nao pode nem oferece-la. O que nao esta no tipo nao tem como
   * atravessar a borda por descuido.
   *
   * Acrescentar `schema.ts` a lista de dispensados do portao seria desliga-lo
   * para toda coluna marcada no futuro, e nao resolver esta.
   *
   * A coluna do TITULAR esta aqui abaixo porque a escrita dela e legitima: e o
   * aceite do convite que a preenche, e a massa de qa tambem. A protecao de
   * saida dela e estrutural -- nenhuma consulta de leitura do diretorio a
   * seleciona. Ver a migracao `20260922000008`.
   */
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
  /**
   * O endereco publico de uma entrada, no lugar do `id` (ADR-0010 item 6).
   * Acrescentada pela migracao `20260922000008`; formato e unicidade global
   * sobre nao-nulo, iguais aos de `pets.slug`.
   */
  slug: string | null;
  status: Generated<StatusDoPerfil>;
  /** Desde quando a entrada esta no ar. `created_at` responde outra pergunta. */
  published_at: Date | null;
  created_at: CriadoEm;
  updated_at: AtualizadoEm;
}

export type TipoDeEntidade = 'professional' | 'organization';

export type TipoDeEvidencia = 'crmv' | 'cnpj' | 'phone_callback' | 'document';

export type DecisaoDaVerificacao = 'pending' | 'approved' | 'rejected';

export interface EntityVerificationsTable {
  id: string;
  entity_kind: TipoDeEntidade;
  /**
   * **Sem chave estrangeira, e isso e decisao** (ADR-0011, revisao de 17/09): a
   * tabela e polimorfica e o Postgres nao expressa FK condicional ao valor de
   * outra coluna. A integridade fica na aplicacao, e o caso `entity_id nao tem
   * chave estrangeira` de `tests/integration/esquema.test.ts` a vigia.
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

/** Espelha `CategoriaDaVitrine` de `modules/store/domain/item-da-vitrine.ts`. */
export type CategoriaDaVitrine = 'food' | 'toy' | 'hygiene' | 'accessory' | 'health' | 'bed';

/**
 * A versao corrente da vitrine da `Loja`. Mesma forma de `ref_data_versions`.
 */
export interface StoreCatalogVersionsTable {
  version: string;
  published_at: Generated<Date>;
  is_current: Generated<boolean>;
}

/**
 * O parceiro da vitrine.
 *
 * **Identidade interna separada da publica** (ADR-0024), que e o desenho de
 * `pets` e de `professionals`: `id` e a chave primaria e nunca sai em resposta;
 * `slug` e o endereco publico e e a unica chave do parceiro que sai. O ADR-0010
 * item 6 proibe UUID na SAIDA publica, nao no esquema, e quem impede o engano e
 * o portao de `src/tools/portao-contrato-publico.ts`.
 */
export interface StorePartnersTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** O endereco publico do parceiro. Unico. */
  slug: string;
  name: string;
  /** Apenas o host, sem esquema nem caminho nem consulta. */
  host: string;
  active: Generated<boolean>;
  sort_order: Generated<number>;
}

/** O item da vitrine. Mesmo desenho de `StorePartnersTable`. */
export interface StoreItemsTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** O endereco publico do item. Unico. */
  slug: string;
  /** Aponta para `store_partners.id`, nunca para o `slug` dele. */
  partner_id: string;
  title: string;
  summary: string;
  category: CategoriaDaVitrine;
  image_url: string | null;
  target_url: string;
  /** Centavos, inteiro. Nunca ponto flutuante. */
  price_amount: number | null;
  price_currency: string | null;
  /** Data pura: a da consulta HUMANA ao preco, nunca derivada de carimbo. */
  price_checked_at: Date | null;
  active: Generated<boolean>;
  sort_order: Generated<number>;
}

/**
 * O encontro da secao `Rede`.
 *
 * **Sem `id`, pela mesma razao de `StorePartnersTable`:** `slug` e a chave
 * primaria, porque esta tabela so existe para sair em resposta publica.
 *
 * **Sem coordenada, e a ausencia e a decisao.** O ADR-0006 proibe
 * geocodificacao no MVP e so aceita coordenada de `device_gps` ou `map_pin`;
 * quem cadastra uma praca nao tem nenhuma das duas. O lugar sao tres rotulos de
 * texto, no teto de bairro que o ADR-0010 permite em superficie publica. Nao ha
 * campo de latitude, de longitude nem de distancia, em precisao nenhuma.
 */
export interface NetworkEventsTable {
  slug: string;
  title: string;
  summary: string;
  /** O nome do lugar PUBLICO. Nao e logradouro, numero nem CEP. */
  place_name: string;
  neighborhood: string;
  city: string;
  state: string;
  starts_at: Date;
  ends_at: Date | null;
  /**
   * O nome IANA da zona, e ele anda junto de `starts_at` por necessidade:
   * `timestamptz` sozinho diz o instante e nao diz a hora de parede. Um
   * aparelho em UTC renderizaria um encontro das 9h como 12h, sem nada acusar.
   */
  time_zone: Generated<string>;
  cover_image_url: string | null;
  active: Generated<boolean>;
  created_at: Generated<Date>;
}

/**
 * Quem confirmou presenca.
 *
 * **NAO HA `pet_id`, e a ausencia e o ADR-0025.** Check-in por pet publicaria
 * que dois animais sao do mesmo tutor, que e o item 7 do ADR-0010 -- e num
 * produto de pet perdido essa e a informacao que interessa a quem quer levar um
 * animal. Nao ha coluna, nao ha tabela de ligacao, entao nao ha `join` que
 * possa publicar o que nao foi gravado.
 *
 * `user_id` NUNCA e projetado: a unica leitura do contrato sobre esta tabela e
 * `count(*)`.
 */
export interface NetworkEventCheckinsTable {
  event_slug: string;
  user_id: string;
  checked_in_at: Generated<Date>;
}

/**
 * A galeria de um encontro. A foto pertence ao EVENTO.
 *
 * **ESTE TIPO TEM UMA COLUNA A MENOS QUE A TABELA**, e a diferenca e a decisao 3
 * do ADR-0025. A coluna que guarda quem enviou a foto esta no banco e **nao
 * aparece aqui**: ela leva a marca de saida no `COMMENT ON COLUMN` da migracao
 * `20260923000001`, e `src/tools/portao-colunas-que-nao-saem.ts` varre o
 * contrato e `src/` inteiro atras do nome dela. Declara-la neste arquivo seria a
 * primeira ocorrencia, e o portao reprovaria -- com razao, porque um campo no
 * tipo e um `select` a uma tecla de distancia.
 *
 * E o mesmo tratamento que a coluna de quem convidou, em `ProfessionalsTable`,
 * ja recebe desde a emenda 1 do ADR-0011, e pela mesma razao: e um vinculo entre
 * duas pessoas, e vinculo entre pessoas nao atravessa a borda.
 *
 * Quem precisa dela -- remocao, auditoria, resposta a abuso -- a le por SQL cru,
 * que e como a massa a escreve. Nenhuma consulta da aplicacao a projeta, e a
 * partir deste arquivo isso e erro de compilacao, e nao disciplina de quem
 * escreve a projecao.
 *
 * (Os nomes das duas colunas nao aparecem escritos aqui de proposito: o portao
 * busca por nome e nao distingue mencao de uso, entao cita-las neste arquivo o
 * faria reprovar o comentario que explica por que elas nao estao nele.)
 */
export interface NetworkEventPhotosTable {
  slug: string;
  event_slug: string;
  image_url: string;
  caption: string | null;
  published_at: Generated<Date>;
  sort_order: Generated<number>;
}

export interface Database {
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
  pet_photos: PetPhotosTable;
  jobs: JobsTable;
  notification_deliveries: NotificationDeliveriesTable;
  lost_cases: LostCasesTable;
  conversations: ConversationsTable;
  conversation_messages: ConversationMessagesTable;
  pet_transfers: PetTransfersTable;
  professionals: ProfessionalsTable;
  entity_verifications: EntityVerificationsTable;
  store_catalog_versions: StoreCatalogVersionsTable;
  store_partners: StorePartnersTable;
  store_items: StoreItemsTable;
  network_events: NetworkEventsTable;
  network_event_checkins: NetworkEventCheckinsTable;
  network_event_photos: NetworkEventPhotosTable;
  'audit.events': AuditEventsTable;
}

export type PetRow = Selectable<PetsTable>;
export type UserRow = Selectable<UsersTable>;
export type RefreshTokenRow = Selectable<RefreshTokensTable>;
