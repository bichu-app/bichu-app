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
  /**
   * O instante da verificacao do e-mail. **E ELE o selo de validado** que o
   * cliente pediu em 18/10/2026 ("um selo na foto dele, se ele estiver
   * validado"): o conceito ja existe e ja sai como `Me.email_verified`. Nao ha
   * nem pode haver uma segunda coluna dizendo a mesma coisa.
   */
  email_verified_at: Date | null;
  /**
   * A foto que a PROPRIA pessoa cadastrou (migracao `20261018000008`,
   * `catalog_images.purpose = 'user_photo'`).
   *
   * **Visivel so para o dono.** Ela sai em `GET /v1/me` e em nenhuma outra
   * resposta -- nao ha coluna de visibilidade para terceiros, porque mostrar a
   * outros contraria decisao registrada (ADR-0025 item 2 proibe avatar na
   * `Rede`; o contrato proibe foto de perfil em `Conversation.participants`) e
   * isso e decisao do cliente, nao de implementacao.
   *
   * O id **nunca sai em resposta**: o app recebe a URL da derivada.
   */
  photo_image_id: string | null;
  /**
   * O ENDERECO PUBLICO E OPACO DA PESSOA: 22 simbolos de base64url, 128 bits
   * sorteados por linha (migracao `20261018000031`).
   *
   * Existe porque bloquear e denunciar precisam APONTAR para alguem e `users`
   * nao tinha endereco nenhum: `id` e UUID interno e o ADR-0010 item 6 o
   * proibe em saida publica. Desenho do ADR-0024 -- `id` primaria, endereco
   * publico ao lado, nenhuma chave estrangeira sobre o endereco publico.
   *
   * **NAO e o apelido (`@`)**: aquele e alias escolhido e MUTAVEL, de outra
   * fatia, e endereco mutavel nao serve de endereco estavel. Este e imutavel:
   * nao ha caminho de escrita que o troque.
   */
  public_ref: string;
  display_name: string | null;
  /**
   * A data de nascimento declarada no cadastro, para a idade mínima de 16 anos
   * (cliente, 18/10/2026). `20261018000021`.
   *
   * **`ColumnType` com escrita em `string` e leitura em `Date`**: a coluna é
   * `date` e o driver devolve `Date`, mas o que a aplicação tem é `YYYY-MM-DD`
   * — a forma canônica que `verificarDataDeNascimento` produz. Converter para
   * `Date` antes de gravar reintroduziria fuso numa data que não tem hora, e é
   * assim que uma data de nascimento anda um dia.
   *
   * **`| null` na leitura porque a coluna é anulável**, e ela é anulável por
   * causa das 7 contas que já existiam em 18/10/2026. A obrigatoriedade mora
   * em `RegisterRequest.required` e em `NovaConta.birthDate`, não aqui.
   *
   * **Nenhuma consulta de leitura a seleciona** (ela não está em
   * `COLUNAS_DA_CONTA`), e `Conta` não a carrega: ela não sai em resposta
   * nenhuma.
   */
  birth_date: ColumnType<Date | null, string | undefined, string>;
  /**
   * O apelido (`@`) escolhido pela pessoa, já normalizado, apontando para
   * `handles.handle` (FK). `20261018000021`.
   *
   * Anulável porque **nenhum fluxo obriga a escolher** (plano 4-C.8): a tela
   * cai para o nome de exibição com apelido nulo, e as 7 contas de 18/10/2026
   * continuam no banco sem apelido.
   *
   * `citext` no banco, `string` aqui: a insensibilidade de caixa é do índice, e
   * a aplicação já grava minúsculo -- as duas metades, e nenhuma substitui a
   * outra.
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

/**
 * O espaço de nomes do `@`, **compartilhado** entre pessoa, pet e reservadas.
 * `20261018000021`.
 *
 * Tabela e não coluna com índice único porque o site publica o pet em
 * `/@{slug}` (ADR-0028) e o `@` é um símbolo só para quem lê: `@bidu` não pode
 * ser um pet para um leitor e uma pessoa para outro. Dois índices únicos em
 * duas tabelas não conversam.
 *
 * **Não há rota de disponibilidade** (plano 4-C.5): a decisão é no envio, por
 * `handles_pkey` e `handles_esqueleto_unico`.
 */
export interface HandlesTable {
  /** `citext`: `@Leandro` e `@leandro` não coexistem, e quem garante é a chave. */
  handle: string;
  /**
   * Derivado pelo gatilho `handles_esqueleto_derivado`, **nunca** pelo que a
   * aplicação manda: o esqueleto é o índice que separa os parecidos, e quem o
   * mandasse errado de propósito o contornaria.
   *
   * `Generated` é o que diz isso no tipo -- o valor enviado é descartado.
   */
  handle_esqueleto: Generated<string>;
  kind: 'pessoa' | 'pet' | 'reservado';
  /**
   * A conta dona, quando `kind = 'pessoa'`. **Preservado** quando o apelido
   * vira `reservado` numa troca: é ele que diz para quem a linha está guardada
   * nos 180 dias (plano 4-C.7).
   */
  user_id: string | null;
  /**
   * Quando o apelido passou a valer. A regra de troca de 60 dias é lida daqui.
   *
   * **A ESCRITA ACEITA `Date` E NADA MAIS**, e o estreitamento é a correção de
   * um defeito medido em 18/10/2026: o tipo aceitava `number`, `atualizarPerfil`
   * passava o `Instant` (milissegundos desde a época) e o Postgres recusava com
   * `22008 date/time field value out of range` -- `PATCH /v1/me` com `handle`
   * devolvia 500 em toda troca e toda escolha de apelido. `number` não servia
   * para nada aqui: ninguém grava epoch nesta coluna de propósito, e o único
   * efeito de aceitá-lo era deixar o erro compilar.
   */
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

/** O papel da conta do painel. Espelha `AdminRole` do contrato. */
export type PapelDaContaAdministrativa = 'admin';
export type EstadoDaContaAdministrativa = 'active' | 'disabled';
export type MotivoDoBloqueioAdministrativo = 'failed_logins' | 'disavowed';

/**
 * O cadastro do painel (ADR-0027 item 20.1). Sem FK para `users`, e nada do app
 * a referencia: uma porta nao acha a conta da outra.
 */
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

/**
 * Sessao do backoffice (ADR-0027 item 2, apendice A.1). O cookie guarda o valor;
 * aqui fica so o SHA-256 dele e o do token anti-CSRF.
 */
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

/**
 * O proposito da imagem de catalogo (ADR-0027 item 10). Gravado em
 * `catalog_upload_intents`, e a escrita que confirma o envio exige o mesmo.
 */
export type PropositoDaImagemDeCatalogo =
  | 'store_item'
  | 'network_event'
  // 18/10/2026: a logo e a foto do profissional recomendado (enviadas pelo
  // administrador) e a foto do proprio usuario (enviada pela pessoa). Mesma
  // esteira, propositos novos -- ver `migrations/20261018000008`.
  | 'directory_logo'
  | 'directory_photo'
  | 'user_photo'
  // A VITRINE de fotos do usuario -- ver `migrations/20261018000040`. Separado
  // de `user_photo`: aquele e a foto UNICA do perfil, este sao as ate nove da
  // vitrine, com geometria e tabela de ordem proprias.
  | 'user_showcase'
  // A FOTO DE UMA PUBLICACAO DO MURAL (20/10/2026) -- ver
  // `migrations/20261020000002`. Separado de `user_showcase` pelo mesmo
  // critério que separou aquele de `user_photo`: a vitrine e uma grade de ate
  // nove no perfil, com ordem e capa, e esta e UMA foto presa a UM texto, sem
  // ordem. Um proposito so para os dois obrigaria a derivada a adivinhar qual
  // tela vai desenhar a imagem -- e a desta tem UMA derivada (`card` 1024) e a
  // da vitrine tem duas.
  | 'user_publication';

export interface UploadIntentsTable {
  id: string;
  /**
   * Quem pediu. Nulo **só** em `finder_photo`: o achador sem conta não tem
   * `users.id` (BICHUS-41). O CHECK `upload_intents_dono_salvo_achador_sem_conta`
   * cobra isso no banco.
   */
  user_id: string | null;
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
  /**
   * Referência opaca devolvida ao achador sem conta (128 bits, base64url). O
   * `id` é UUIDv7 e não sai para ele (SEC-001). Nula nas outras espécies.
   */
  upload_ref: string | null;
  /**
   * O estado da HIGIENE da foto do achado (migração `20261001000006`).
   *
   * Lido só para `found_report_photo` e `finder_photo`: a foto de pet tem
   * `pet_photos.status`, e o índice parcial da varredura exclui `pet_photo` de
   * propósito. `ausente` é o objeto que nunca chegou, e é desfecho final.
   */
  sanitize_status: Generated<'pendente' | 'pronta' | 'recusada' | 'ausente'>;
  /**
   * Chave da derivada sem EXIF, no bucket **privado**. **Nunca** uma URL.
   *
   * Ela existe porque foto de celular carrega coordenada de GPS, e a foto do
   * achado não passava por worker nenhum. O original continua guardado,
   * inteiro: é dele que sai qualquer derivada futura.
   */
  sanitized_key: string | null;
  sanitize_rejection_reason: string | null;
  sanitized_at: Date | null;
}

/**
 * A intencao de envio de imagem de catalogo, do painel (ADR-0027 A.3, item
 * 20.2). Separada de `upload_intents`, que e do app e aponta para `users`.
 */
/**
 * A intencao de envio de imagem de catalogo (Loja e Rede).
 *
 * **Exatamente UM dos dois autores**, e o `CHECK
 * catalog_upload_intents_um_autor` impoe: `admin_account_id` quando o envio e
 * do painel (ADR-0027 A.3), `user_id` quando e da comunidade (a capa do
 * encontro, ADR-0025 emenda 3). Os dois nulos, ou os dois preenchidos, nao
 * entram no banco.
 */
export interface CatalogUploadIntentsTable {
  id: string;
  /** `admin_accounts.id`. Sem `ON DELETE`: conta do painel desativa, nao se apaga. */
  admin_account_id: string | null;
  /** `users.id`, quando o envio e da comunidade. `ON DELETE CASCADE`: a intencao e descartavel. */
  user_id: ColumnType<string | null, string | null | undefined, string | null>;
  purpose: PropositoDaImagemDeCatalogo;
  /** Chave no armazenamento privado. **Nunca** uma URL. */
  object_key: string;
  declared_type: string;
  max_bytes: number;
  expires_at: Date;
  confirmed_at: Date | null;
  created_at: Generated<Date>;
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
  /**
   * Quantas vezes o processo morreu segurando este trabalho (migração
   * 20260923000008). Não é `attempts`: esta acusa a carga, aquela o ambiente.
   */
  orphan_recoveries: Generated<number>;
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
/**
 * A CAIXA DE NOTIFICACOES (migracao `20261018000020`): uma linha por aviso e
 * por destinatario.
 *
 * **`src/` quase nao escreve nesta tabela.** Quem insere sao os GATILHOS nas
 * tabelas de origem, e quem le sao as funcoes SQL `caixa_de_notificacoes`,
 * `contagem_de_notificacoes` e `notificacao_marcar_lida`. O tipo existe aqui
 * para o Kysely conhecer a tabela (as iscas inserem direto) e para o nome das
 * colunas ter UM lugar.
 */
export interface NotificationItemsTable {
  id: Generated<string>;
  /** Identificador opaco, 22 caracteres base64url. **Nao e UUID** (ADR-0010). */
  ref: string;
  recipient_user_id: string;
  item_kind: TipoDeAvisoDaCaixa;
  /** Nome do pet, titulo do encontro, nome indicado. */
  subject_label: string | null;
  /**
   * Quem causou o aviso. Existe SO para agrupar por (tipo, autor, dia), e NAO
   * sai na resposta: a caixa nao tem autor nem avatar na tela, de proposito.
   */
  author_user_id: string | null;
  source_kind: string;
  source_id: string;
  /** Quando o FATO aconteceu, e nao quando a linha nasceu. */
  occurred_at: Date;
  /** O item foi ABERTO. Nulo e nao lido. Ver a LISTA nao mexe nisto. */
  read_at: Date | null;
  created_at: Generated<Date>;
}

/**
 * Os tipos de aviso da caixa. Espelha o `CHECK` de `notification_items.item_kind`
 * e o `enum` `NotificationKind` do contrato.
 */
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
  | 'broadcast';

/**
 * Quando esta conta viu a lista pela ultima vez (migracao `20261018000020`).
 *
 * Abrir a caixa empurra `zeroed_at` para agora, e o contador passa a ignorar
 * todo item anterior a isso SEM marcar nenhum como lido. Tabela propria e nao
 * coluna em `users` de proposito: `users` e a tabela mais disputada deste
 * repositorio, e este estado nao e identidade.
 */
export interface NotificationCounterStateTable {
  user_id: string;
  zeroed_at: Date;
}

/**
 * Os COMUNICADOS disparados pelo painel (migracao `20261018000020`).
 *
 * Nao ha coluna de exclusao e nao ha rota de apagar: comunicado disparado fica
 * registrado, por requisito.
 */
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
  /** Metade da PK, e FK para `users`. A outra metade é `session_family_id`. */
  user_id: string;
  /**
   * SEC-021: a família de refresh que informou esta localização — o mesmo valor
   * que vai no `sid` do token de acesso (ADR-0002, emenda 1).
   *
   * É a outra metade da chave primária, e é ela que torna a localização **do
   * aparelho** e não da pessoa (decisão do cliente em 23/09/2026). Histórico
   * continua inexprimível: o par é único, então cada sessão de aparelho tem uma
   * linha, sempre a última.
   *
   * Não é chave estrangeira porque não existe tabela de famílias: uma família é
   * o conjunto de linhas de `refresh_tokens` com o mesmo `family_id`.
   */
  session_family_id: string;
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
  /**
   * A REMOCAO LOGICA pela fila de moderacao do painel (`20261018000009`).
   *
   * Nao e `blocked_at` (acao de um dos dois lados, BICHUS-40), nao e
   * `closed_at` (encerramento) e nao e `held_for_review_at` (retencao
   * automatica). `conversation_messages` continua inteira: o que estas duas
   * colunas fazem e tirar a conversa das LEITURAS dos dois lados, nas quatro
   * consultas de `kysely-conversation-repository.ts`.
   */
  moderation_removed_at: Date | null;
  /** O motivo, obrigatorio quando ha remocao por `CHECK`. **Nunca sai para o aplicativo.** */
  moderation_reason: string | null;
}

/**
 * BICHUS-41. A fila de denúncia da conversa mediada.
 *
 * O alvo é o OUTRO papel da conversa, e não um usuário: o achador pode não ter
 * conta. Um item aberto por (conversa, lado); a denúncia repetida soma em
 * `repeat_count` (`accept_and_deduplicate` do contrato).
 */
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
  /**
   * O QUE o administrador decidiu (`20261018000009`). Nulo enquanto na fila.
   *
   * Sem esta coluna, denuncia descartada e denuncia cujo conteudo foi removido
   * ficariam indistinguiveis -- as duas com `resolved_at` preenchido.
   *
   * Resolver LIBERA o par (conversa, papel) para uma denuncia nova, pelo
   * indice unico PARCIAL desta tabela, e isso e legitimo aqui: a conversa
   * continua, e um abuso novo depois da decisao e item de fila novo.
   */
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
  /**
   * Especie da mensagem do Bichu, para a EXCECAO do contador (BICHUS-278).
   *
   * `scan_notice` e `found_notice` NAO saem do contador quando a pessoa abre a
   * lista -- sao a coisa mais importante que o produto tem para dizer. Nulo nas
   * linhas gravadas antes da coluna: nao da para classificar retroativamente, e
   * nulo cai na regra geral.
   */
  system_kind: EspecieDaMensagemDoSistema | null;
}

/**
 * BICHUS-278. As tres especies de mensagem do Bichu.
 *
 * As duas primeiras sao AVISO e por isso tem tratamento proprio no contador; a
 * terceira e explicacao de interface e sai do contador pela regra geral.
 */
export type EspecieDaMensagemDoSistema = 'scan_notice' | 'found_notice' | 'redaction_warning';

/**
 * BICHUS-278. Ate quando cada LADO leu a conversa.
 *
 * Chave por (conversa, PAPEL) e nao por usuario, pela mesma razao de
 * `conversations.blocked_by_role`: o achador pode nao ter conta, e a maioria nao
 * tem. Ausencia de linha significa **nunca abriu**, que e o estado em que toda
 * mensagem esta nao lida -- e e por isso que nao ha `DEFAULT now()`.
 *
 * Escrito ao ABRIR A CONVERSA, nunca ao abrir a lista: "lido" e o item aberto.
 */
export interface ConversationReadsTable {
  conversation_id: string;
  role: 'tutor' | 'finder';
  last_read_at: Date;
}

/**
 * BICHUS-278. Quando a CONTA abriu a area de mensagens.
 *
 * Zera o contador do sino e **nao** marca item nenhum como lido. Por conta e
 * nao por aparelho: o contador e o mesmo nos dois telefones da mesma pessoa.
 */
export interface ConversationListViewsTable {
  user_id: string;
  seen_at: Date;
}

/**
 * BICHUS-278 (20/10/2026) -- quando a conta VIU cada area com contador.
 *
 * Irma de {@link ConversationListViewsTable}, com a area como VALOR e nao como
 * coluna. Zera o selo da aba e **nao** marca item nenhum como lido. Por conta e
 * nao por aparelho, pelo mesmo motivo da irma.
 *
 * `network_events` e `network_directory` sao duas linhas de proposito: as duas
 * contagens caem na mesma aba `Rede`, que tem um selo so, mas entrar numa
 * sub-aba nao pode zerar a contagem da outra -- isso afirmaria que a pessoa viu
 * um profissional que nunca apareceu na tela dela.
 */
export type SecaoComContador = 'pets' | 'network_events' | 'network_directory';

export interface SectionListViewsTable {
  /** Metade da PK, e FK para `users`. A outra metade e `section`. */
  user_id: string;
  section: SecaoComContador;
  /** Sem `DEFAULT` no banco: a linha nao pode nascer dizendo que viu. */
  seen_at: Date;
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

/**
 * A avaliacao de um local do diretorio `Perto` (migracao `20261017000017`).
 *
 * Pedido do cliente de 18/10/2026: nota de 1 a 5 e recomendacao em texto,
 * visiveis para os outros usuarios, "como acontece na playstore". O esquema e o
 * do ADR-0011 secao 3, que o especificava desde 21/09 e cuja secao 5.4 o
 * declarava fora daquela migracao por falta de autorizacao.
 *
 * **`author_user_id` ESTA AQUI, e a diferenca em relacao a coluna de quem
 * convidou a entidade e o ponto.** Aquela carrega a marca `NUNCA sai do
 * servidor` e `src/tools/portao-colunas-que-nao-saem.ts` reprova o nome dela em
 * todo `.ts` de `src/` -- e por isso ela nao esta em `ProfessionalsTable`. Esta
 * nao carrega a marca porque `src/` PRECISA dela na clausula `WHERE`: toda
 * escrita de avaliacao e "a MINHA", resolvida por igualdade com quem chama
 * (ADR-0021). O que nao acontece e ela ser PROJETADA: nenhuma leitura a
 * seleciona para a resposta, e `DirectoryReview` nao tem campo de autor alem do
 * nome de exibicao.
 */
export interface ProfessionalReviewsTable {
  /** UUIDv7 gerado pela aplicacao, como em `pets` e em `professionals`. */
  id: string;
  /**
   * O identificador publico e opaco (128 bits base64url), que e o que sai em
   * resposta. Existe porque `id` e UUID interno e o ADR-0010 item 6 o proibe em
   * saida publica. Sorteado por linha e nunca derivado do autor.
   */
  ref: string;
  professional_id: string;
  author_user_id: string;
  /** Inteira de 1 a 5. O `CHECK` da migracao cobra a faixa no banco. */
  rating: number;
  /**
   * A recomendacao em texto. **Nulo e o caso comum** (o cliente decidiu que o
   * texto e opcional). Nunca string vazia: o `CHECK` recusa, para nao haver
   * duas representacoes de "sem texto".
   */
  body: string | null;
  /** Do ADR-0011. Nenhuma rota o preenche hoje e ele nao esta no contrato. */
  service_kind: string | null;
  created_at: Generated<Date>;
  /** Quando o AUTOR editou. A moderacao mexe em `status` e nao toca aqui. */
  edited_at: Date | null;
  /**
   * `published` e o DEFAULT, e o default E a decisao do cliente de 18/10: a
   * avaliacao aparece na hora e **nao ha valor `pending`** porque nao ha fila.
   *
   * Nao confundir com a INDICACAO de local novo (`directory_suggestions` e
   * `professionals.status`), que continua passando por revisao do
   * administrador. Sao regras diferentes e uma nao afrouxa a outra.
   */
  status: Generated<'published' | 'hidden' | 'removed'>;
  /** Escrito por quem moderou. **Nunca projetado em leitura publica.** */
  moderation_reason: string | null;
  moderated_at: Date | null;
}

/**
 * A denuncia de uma avaliacao (migracao `20261017000017`).
 *
 * Contrapeso de a avaliacao publicar na hora. **Ela NAO esconde a avaliacao**:
 * se escondesse, uma denuncia seria todo o custo de apagar a avaliacao de um
 * concorrente. Enfileira para a moderacao, que decide e escreve o motivo em
 * `professional_reviews.moderation_reason`.
 *
 * Tem coluna de usuario, ao contrario de `conversation_reports`, e a diferenca
 * e que ali o achador pode nao ter conta: aqui a rota EXIGE conta, e sem a
 * coluna nao haveria como deduplicar nem como recusar a denuncia da propria
 * avaliacao.
 */
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
  /** Escrito por quem modera. Nulo e "na fila". */
  resolved_at: Date | null;
  /** O QUE o administrador decidiu (`20261018000009`). Nulo enquanto na fila. */
  resolution: DecisaoDaModeracao | null;
  /** O motivo da decisao. Nao publicado, e nao chega a quem denunciou. */
  resolution_reason: string | null;
}

/**
 * **A DECISAO da fila de moderacao, nas duas tabelas de denuncia.**
 *
 * Dois valores e nao tres: a fila tem um estado de espera (`resolved_at IS
 * NULL`) e dois de saida. Um terceiro valor convidaria a primeira pessoa com
 * pressa a inventar um fluxo que ninguem desenhou.
 */
export type DecisaoDaModeracao = 'content_removed' | 'dismissed';

/**
 * A VISAO `fila_de_moderacao` (`20261018000009`): UMA LINHA POR DENUNCIA,
 * juntando as origens que existem.
 *
 * Hoje duas pernas: `review` (denuncia de avaliacao do `Perto`) e
 * `conversation` (denuncia de conversa mediada, que ate 18/10/2026 era gravada
 * e **nunca lida por ninguem**). Denuncia de PERFIL e de FOTO vem na frente de
 * comunidade e custa uma perna de `UNION ALL` na visao, um valor de `enum` no
 * contrato e um rotulo na tela -- **nenhuma linha daqui**, porque a consulta le
 * a visao e nao as tabelas. Desenho DECLARADO, nao construido.
 *
 * `reporter_active` e BOOLEANO de proposito: nenhuma coluna de autoria
 * atravessa a visao. Ele vem das funcoes
 * `denuncia_de_*_com_denunciante_ativo(uuid)`, que delegam a
 * `conta_habilitada(uuid)`.
 *
 * `target_body` e `target_rating` sao NULOS na perna da conversa, e a
 * assimetria e escolhida: a avaliacao e conteudo PUBLICADO, e quem modera
 * precisa ler o que todo mundo le; a conversa e privada entre duas pessoas, e
 * nada neste produto autoriza o administrador a le-la.
 */
export interface FilaDeModeracaoView {
  origin: string;
  /** `professional_reviews.ref` na perna da avaliacao; `conversations.id` na da conversa. */
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
  /** Falso tambem quando a denuncia nao existe: a rota responde 404 e nunca 403 (ADR-0021). */
  reporter_active: boolean;
  target_removed: boolean;
  target_rating: number | null;
  /** O conteudo denunciado. **Nulo na conversa**, e isso e desenho e nao falta. */
  target_body: string | null;
  /** O nome do local na perna da avaliacao; o nome do pet na da conversa. */
  target_subject: string;
  /**
   * Esta denuncia PESA na ordem da fila? (coluna acrescentada em 18/10/2026,
   * na uniao, pela `20261018000032`.)
   *
   * **Nao e filtro.** A denuncia que nao pesa entra na fila igual; quem filtra
   * e [reporter_active]. Sai de `denunciante_ordena_a_fila(reporter_user_id)`
   * em quatro pernas e e `false` fixo na da conversa, que nao tem coluna de
   * denunciante -- o achador pode nao ter conta.
   */
  reporter_weighs: boolean;
}

export interface ProfessionalsTable {
  /** UUIDv7 gerado pela aplicacao. Sem `DEFAULT` no banco, como em `pets`. */
  id: string;
  kind: TipoDeProfissional;
  /**
   * O QUE a entrada e, eixo SEPARADO de `kind` (que e a ATIVIDADE). ONG e
   * `organization`. `Generated` porque a `20261018000012` a criou com
   * `NOT NULL DEFAULT 'professional'`: a escrita pode omiti-la e o banco
   * preenche, que e o que faz a coluna ser aditiva.
   */
  entity_kind: Generated<TipoDeEntidade>;
  display_name: string;
  about: string | null;
  city: string | null;
  state: string | null;
  neighborhood: string | null;
  /**
   * O ENDERECO DE RUA, acrescentado pela migracao `20261018000001`.
   *
   * Os quatro existem porque a decisao 9.2 foi respondida pelo cliente em
   * 18/10/2026: o painel passa a poder cadastrar CEP, logradouro, numero e
   * complemento de uma entrada do diretorio.
   *
   * **Ele autorizou QUEM PREENCHE, e nao O QUE APARECE EM PUBLICO.** Estes
   * quatro campos sao lidos e escritos pela superficie administrativa e
   * **nenhuma consulta de leitura do diretorio do aplicativo os seleciona** --
   * `DirectoryEntrySummary` continua com bairro, cidade e UF. Estar no tipo
   * permite a ESCRITA; a ausencia na projecao publica e o que mantem a saida
   * como estava.
   *
   * `postal_code` tem oito digitos sem mascara, pelo `CHECK
   * professionals_cep_oito_digitos` -- mesmo formato de
   * `collar_tag_requests.postal_code`. `street_number` e TEXTO: `s/n`, `120A`
   * e `KM 32` sao numeros de porta.
   */
  postal_code: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  /**
   * A LOGO e a FOTO da entidade, acrescentadas pela migracao `20261018000008`
   * (pedido do cliente de 18/10/2026).
   *
   * Duas colunas porque sao DOIS PROPOSITOS: a logo e quadrada e pequena, e
   * aparece ao lado do nome na lista do `Perto`; a foto e da fachada ou do
   * ambiente, e e olhada grande no detalhe. As derivadas tem geometrias
   * diferentes (`derivadas.ts`), e um campo so obrigaria uma tela a esticar a
   * outra.
   *
   * **As duas sao ANULAVEIS, e nulo e o estado normal**: entrada sem logo e sem
   * foto existe e publica como antes desta migracao.
   *
   * O valor e `catalog_images.id`, e ele **NUNCA sai em resposta** (ADR-0010
   * item 6): quem le recebe a URL da derivada, montada na leitura.
   */
  logo_image_id: string | null;
  photo_image_id: string | null;
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
  /**
   * A versao para `If-Match`, acrescentada pela migracao `20261017000011`.
   * Mesma forma de `store_partners` e `network_events`: ela cresce na propria
   * clausula `WHERE` do `UPDATE`, e nao e lida para ser comparada em memoria.
   */
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

/** O `CHECK` `directory_suggestions_contato_conhecido` (`20261017000004`). */
export type TipoDeContatoSugerido = 'phone' | 'website' | 'instagram';

/** O `CHECK` `directory_suggestions_revisao_conhecida` (`20261017000004`). */
export type RevisaoDaSugestao = 'pending' | 'approved' | 'declined';

/**
 * A fila de revisao de `Perto`: o que a comunidade SUGERIU para o diretorio
 * (migracao `20261017000004`, operacao `suggestDirectoryEntry`).
 *
 * **Nao e `professionals`, e nao vira `professionals` por conta propria.** A
 * emenda 1 do ADR-0011 tirou `'community'` de `professionals.source`: a entrada
 * do diretorio nasce por convite e aceite, e o que esta tabela guarda e o
 * pedido de revisao. Nenhuma escrita deste caminho toca `professionals`.
 *
 * **ESTE TIPO TEM UMA COLUNA A MENOS QUE A TABELA**, e a diferenca e a regra --
 * a mesma de `ProfessionalsTable` e de `NetworkEventsTable`: a coluna que
 * guarda QUEM SUGERIU e vinculo entre duas pessoas, leva a marca
 * `NUNCA sai do servidor` no `COMMENT ON COLUMN` da migracao, e
 * `src/tools/portao-colunas-que-nao-saem.ts` varre **todo** `.ts` de `src/`
 * pelo nome literal dela: declara-la aqui **reprova o build**.
 *
 * Quem a escreve e a funcao `directory_suggestions_registrar` da propria
 * migracao, chamada por SQL cru -- aqui a autoria e `NOT NULL`, entao nao ha
 * linha intermediaria para carimbar depois e a funcao faz o `INSERT` inteiro.
 * O construtor tipado nao pode nem oferece a coluna, e o que nao esta no tipo
 * nao atravessa a borda por descuido.
 *
 * **Sem `geo`, sem `street_address` e sem documento** (ADR-0006, ADR-0011
 * secao 4): as ausencias estao escritas por extenso no cabecalho da migracao,
 * para que ninguem complete a tabela achando que faltou.
 */
export interface DirectorySuggestionsTable {
  /** UUIDv7 gerado pela aplicacao, como em `pets` e em `professionals`. */
  id: string;
  /** 128 bits em base64url. E ele que sai no recibo, e nunca o `id`. */
  ref: string;
  display_name: string;
  kind: TipoDeProfissional;
  city: string;
  /** A UF. E por esta coluna que o estado da revisao se chama `review_status`. */
  state: string;
  neighborhood: string | null;
  /**
   * O CEP do estabelecimento, oito digitos SEM hifen (`CHECK` da
   * `20261017000015`, mesma forma de `tag_requests.postal_code`).
   *
   * **Guardado para quem REVISA, nunca publicado**: rua e CEP nao saem em
   * superficie publica (ADR-0010 itens 4 e 5), nao ha operacao de leitura
   * desta tabela no contrato, e `postal_code` ja e nome proibido em resposta
   * sem conta em `tools/portao-contrato-publico.ts` e em
   * `shared/http/vazamento-publico.ts`.
   */
  postal_code: string | null;
  contact_kind: TipoDeContatoSugerido;
  contact_value: string;
  note: string | null;
  review_status: Generated<RevisaoDaSugestao>;
  created_at: Generated<Date>;
  /** Nulo enquanto pendente, por `CHECK`. */
  decided_at: Date | null;
  /**
   * O motivo da recusa, escrito pelo administrador para o PROXIMO revisor
   * (`20261017000016`). Nulo em tudo que nao foi recusado, por `CHECK`. Nao e
   * publicado e nao chega a quem indicou.
   */
  decline_reason: string | null;
  /**
   * A entrada do diretorio que a aprovacao produziu -- ou a que ja existia e a
   * que a indicacao foi ligada, que e o caso da duplicata
   * (`20261017000016`). Nulo em tudo que nao foi aprovado, por `CHECK`.
   *
   * **Este UUID nunca sai em resposta** (ADR-0010 item 6): a projecao devolve o
   * `slug` da entrada, lido por `JOIN`. Ele esta no tipo porque a escrita da
   * aprovacao precisa dele, e nao porque alguma leitura o projeta.
   */
  approved_entry_id: string | null;
}

/**
 * O codigo da categoria do produto. **Texto, e nao uniao de literais**, desde a
 * `20261017000003`: a lista fechada mora em `store_categories` e quem a fecha e
 * a chave estrangeira de `store_items.category`, nao mais um `CHECK`.
 */
export type CategoriaDaVitrine = string;

/**
 * O primeiro nivel da categoria do produto (migracao `20261017000003`).
 *
 * Forma copiada de `ref_species`/`ref_breeds`: codigo com formato, rotulo,
 * ordem e `active`. Categoria retirada fica INATIVA, nunca apagada -- apagar
 * arrastaria os itens pela chave estrangeira.
 */
export interface StoreCategoriesTable {
  code: string;
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

/**
 * O segundo nivel. A chave primaria e o PAR `(category_code, code)`, e e esse
 * par que `store_items (category, subcategory)` referencia: "a subcategoria
 * pertence a categoria escolhida" e invariante de banco.
 */
export interface StoreSubcategoriesTable {
  category_code: string;
  code: string;
  label: string;
  sort_order: number;
  active: Generated<boolean>;
}

/**
 * Para que especies cada subcategoria foi LEVANTADA. A arvore de 17/10 e a de
 * cachorro da petlove, entao toda linha e `dog`; gato, passaro, peixe e outros
 * ficaram de fora e entram aqui por semente, sem migracao de forma.
 */
export interface StoreSubcategorySpeciesTable {
  category_code: string;
  code: string;
  species_code: 'dog' | 'cat' | 'other';
}

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
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** O `ETag` do painel. Incrementada a cada escrita. */
  version: Generated<number>;
}

/** O item da vitrine. Mesmo desenho de `StorePartnersTable`. */
export interface StoreItemsTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** O endereco publico do item. Unico. */
  slug: string;
  /**
   * Aponta para `store_partners.id`, nunca para o `slug` dele. **Anulavel no
   * rascunho** desde a `20261017000002`: a publicacao o exige, e o
   * `CHECK store_items_publicado_esta_completo` e quem cobra.
   */
  partner_id: string | null;
  /** O minimo para o registro existir. Continua `NOT NULL`. */
  title: string;
  /** Anulavel no rascunho (`20261017000002`). Exigida na publicacao. */
  summary: string | null;
  /**
   * Anulavel no rascunho (`20261017000002`). Exigida na publicacao.
   *
   * Desde a `20261017000003` ela e CHAVE ESTRANGEIRA para
   * `store_categories (code)`, e nao mais um `CHECK` de seis literais. Com a
   * coluna nula a chave nao e cobrada (`MATCH SIMPLE`), e por isso o rascunho
   * sem categoria passa.
   */
  category: CategoriaDaVitrine | null;
  /**
   * O segundo nivel, OPCIONAL. Nulo e estado normal.
   *
   * A chave estrangeira e composta com `category` e `MATCH SIMPLE`: nula aqui,
   * a restricao nao e cobrada; preenchida, o par tem de existir em
   * `store_subcategories`.
   *
   * **Com `category` nula ela tem de ser nula**, e quem cobra isso e o `CHECK
   * store_items_subcategoria_exige_categoria` (`20261017000003`): e justamente
   * o par `(NULL, alguma_coisa)` que o `MATCH SIMPLE` deixaria passar.
   */
  subcategory: string | null;
  /** Caminho no site do parceiro, com a barra inicial. Nunca a URL inteira. */
  image_path: string | null;
  /**
   * Caminho no site do parceiro, com a barra inicial. Nunca a URL inteira.
   * Anulavel no rascunho (`20261017000002`). Exigido na publicacao.
   */
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

/** A que especies o item serve (ADR-0027 A.2.1). Valores de `ref_species`. */
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
/**
 * A VITRINE DE FOTOS DO USUARIO (migracao `20261018000040`), no molde de
 * `store_item_images` e `network_event_images`.
 *
 * **Visivel so ao dono.** Projetada em `GET /me/showcase` e em NENHUMA outra
 * resposta: o ADR-0025 item 2 proibe avatar de pessoa na superficie da `Rede`,
 * e `Conversation.participants` nunca traz foto. Nao ha coluna de
 * visibilidade porque nao ha o que configurar.
 */
export interface UserShowcaseImagesTable {
  user_id: string;
  /** `catalog_images.id`, com `purpose = 'user_showcase'`. Identidade interna: nunca projetada. */
  image_id: string;
  /** `0` e a capa. Ate `8`: o teto de NOVE e este intervalo mais a unicidade por conta. */
  position: number;
  /**
   * **Anulavel, e e a unica diferenca do molde.** Nao ha terceiro que leia esta
   * vitrine, e legenda esta fora de proposito; nulo faz o leitor de tela cair
   * no rotulo da grade. Quando vem, de 2 a 150 caracteres.
   */
  alt_text: string | null;
}

export interface StoreItemImagesTable {
  item_id: string;
  image_id: string;
  /** `0` e a capa. Ate `7`. */
  position: number;
  /**
   * **Opcional desde a `20261017000002`** (pedido do cliente de 17/10/2026).
   * Quando vem, de 2 a 150 caracteres; nulo quer dizer que o painel nao
   * escreveu, e quem desenha cai no titulo do item.
   *
   * Em `network_event_images` ele continua `NOT NULL`.
   */
  alt_text: string | null;
}

/** A imagem de catalogo (ADR-0027 A.3). Mesma forma de `pet_photos`. */
export interface CatalogImagesTable {
  /** Identidade interna. Nunca projetada em resposta. */
  id: string;
  /** Nulo depois que o varredor apagou a intencao de envio (`ON DELETE SET NULL`). */
  upload_intent_id: string | null;
  purpose: PropositoDaImagemDeCatalogo;
  status: Generated<StatusDaFoto>;
  /**
   * Chave da derivada de 1024 px. Nula ate `ready`.
   *
   * **E a derivada que SEMPRE existe**: o cartao da agenda e a vitrine usam
   * ela, e quem nao tem `thumb_key` ou `banner_key` cai nela.
   */
  public_key: string | null;
  /**
   * Derivada de 480 px (4:3) para a galeria do encontro, que desenha 144 dp.
   * Nula na imagem de produto: a vitrine da Loja nao foi medida, e cortar
   * imagem de produto numa proporcao suposta decepa o rotulo da embalagem.
   */
  thumb_key: string | null;
  /** Derivada de 1280 px (16:9) para a capa de borda a borda do detalhe. */
  banner_key: string | null;
  rejection_reason: string | null;
  created_at: Generated<Date>;
}

/**
 * O encontro da secao `Rede` (ADR-0025, emendado pela secao 12 do ADR-0027).
 *
 * **Identidade interna separada da publica** (ADR-0024): `id` e a chave
 * primaria e **nunca sai em resposta**; `slug` e o endereco publico e e a unica
 * chave do encontro que sai.
 *
 * **ESTE TIPO TEM UMA COLUNA A MENOS QUE A TABELA**, e a diferenca e a regra: a
 * coluna de quem criou o encontro leva a marca de saida no `COMMENT ON COLUMN`
 * da migracao `20260928000001`, e `src/tools/portao-colunas-que-nao-saem.ts`
 * varre `src/` atras do nome dela. E o mesmo tratamento da coluna homonima de
 * `ProfessionalsTable`. Quem precisa dela (a trilha do backoffice) a escreve
 * por SQL cru.
 *
 * Check-in e galeria sairam desta versao (ADR-0027 12.4), com as tabelas.
 */
export interface NetworkEventsTable {
  /** Identidade interna. Alvo das chaves estrangeiras, e nunca projetada. */
  id: string;
  /** O endereco publico. Unico, e a unica chave do encontro que sai em resposta. */
  slug: string;
  title: string;
  summary: string;
  /** O nome do lugar PUBLICO. Nao e logradouro, numero nem CEP. */
  place_name: string;
  neighborhood: string;
  city: string;
  state: string;
  /**
   * `geography(Point,4326)`. `never` nos tres sentidos, como `professionals.geo`
   * e `user_reference_locations.reference_point`: o tipo impede a coluna de ser
   * selecionada crua ou inserida pelo construtor tipado, e o unico caminho ate
   * ela e SQL onde `ST_MakePoint`/`ST_Y`/`ST_X` ficam a vista. O ponto so sai
   * em `getNetworkEventLocation`, com conta (ADR-0027 12.5).
   */
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
  /** Endereco por extenso (01/10/2026). Sai so em `getNetworkEventLocation`, com conta. */
  street_address: ColumnType<string | null, string | null | undefined, string | null>;
  /** Link de ingresso, https (ADR-0027 item 22). Publico. */
  ticket_url: ColumnType<string | null, string | null | undefined, string | null>;
  /** O @ do Instagram, sem @ e em minusculas. Publico. */
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

/** O `CHECK` `network_events_origem_do_ponto`. ADR-0006: so `map_pin`. */
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

/** A galeria do encontro (ADR-0027 A.4.2); `position = 0` e a capa. */
export interface NetworkEventImagesTable {
  event_id: string;
  image_id: string;
  position: number;
  alt_text: string;
}

export interface NetworkEventAmenitiesTable {
  event_id: string;
  amenity: EstruturaDoLocal;
}

/**
 * O pedido para participar de encontro privado. Da conta, nunca do pet.
 * `decided_by_admin_id` (conta do painel, ADR-0027 item 20.2) fica fora do
 * tipo: a decisao o escreve por SQL cru, e nenhuma leitura o projeta.
 */
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
 * ela. Nao diz onde a encomenda esta -- isso e [PassoDaEntregaDaPlaquinha].
 */
export type DecisaoDoPedidoDePlaquinha = 'pending' | 'fulfilled' | 'declined';

/**
 * O `CHECK` `collar_tag_requests_entrega_conhecida`: os tres passos da ENTREGA,
 * acrescentados pela `20261018000004` -- solicitado, em transporte, chegou.
 *
 * Eixo SEPARADO de [DecisaoDoPedidoDePlaquinha] porque acrescentar valor a uma
 * `enum` de resposta quebra o contrato (`oasdiff`,
 * `response-property-enum-value-added`). Os dois eixos nao sao independentes:
 * `collar_tag_requests_entrega_exige_atendimento` proibe sair de `requested`
 * sem o pedido estar `fulfilled`.
 */
export type PassoDaEntregaDaPlaquinha = 'requested' | 'in_transit' | 'arrived';

/**
 * O pedido do OBJETO FISICO da plaquinha da coleira.
 *
 * **Nao guarda codigo**: o codigo e de `pet_tags` e e irreversivel (ADR-0004).
 * Guarda o endereco de entrega desde a `20261017000012` (decisao do cliente de
 * 17/10) e a ENTREGA desde a `20261018000004`; o VALOR segue fora, e cobranca
 * continua fora de escopo por decisao dele.
 *
 * `decided_by_admin_id` fica fora do tipo pelo mesmo motivo do pedido de
 * encontro: a decisao o escreve por SQL cru e nenhuma leitura o projeta.
 */
export interface CollarTagRequestsTable {
  id: string;
  ref: string;
  pet_id: string;
  requested_by: string;
  notes: string | null;
  /**
   * O endereco de entrega. **Dado pessoal**: nao sai em superficie publica,
   * nao entra na trilha de auditoria e nao e geocodificado (ADR-0006) -- nao
   * ha `lat`, nao ha `lon` e nenhum servico externo resolve o CEP.
   */
  recipient_name: string;
  /** E.164 do Brasil (`+55` e 10 ou 11 digitos). Dado pessoal. */
  recipient_phone: string;
  /** Oito digitos, sem mascara. Normalizado pela aplicacao antes de gravar. */
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
   * O passo da ENTREGA. `Generated` porque a coluna e
   * `NOT NULL DEFAULT 'requested'`: o `INSERT` do pedido nao o escreve, e todo
   * pedido que existe -- inclusive os de antes da `20261018000004` -- tem um
   * passo. **Nunca nulo**, e e isso que faz a tela nao inferir passo de ausencia.
   */
  delivery_state: Generated<PassoDaEntregaDaPlaquinha>;
  /**
   * O codigo de rastreio, TEXTO que o administrador digita. Opcional: nem todo
   * envio tem rastreio. **Sem validacao de formato de transportadora** e **sem
   * integracao com transportadora nenhuma** -- so teto de tamanho (3 a 64).
   */
  tracking_code: string | null;
  /** Quando saiu. Nulo enquanto `delivery_state` e `requested`. */
  shipped_at: Date | null;
  /** Quando chegou. Nulo em tudo que nao chegou. */
  delivered_at: Date | null;
}

/** O `CHECK` `network_events_origem_conhecida`. */
export type OrigemDoEncontro = 'admin' | 'community';

/**
 * O `CHECK` `network_events_publicacao_conhecida`. Visivel e `published` ou
 * `cancelled`; `removed` e terminal.
 *
 * **`pending_review` saiu na `20261001000005`**: ele era o estado da fila de
 * revisao do encontro da comunidade, e a decisao do cliente de 17/10/2026
 * trocou a fila pela publicacao direta de quem tem canal de contato verificado
 * (ADR-0025 emenda 3).
 */
export type PublicacaoDoEncontro = 'published' | 'cancelled' | 'removed';

/**
 * FATIA F (18/10/2026). A conexao entre pessoas: SIMETRICA, com pedido e
 * aceite, **uma linha por par**.
 *
 * `pair_low`/`pair_high` NAO estao declarados aqui, e a ausencia e a regra: eles
 * sao derivados pelo gatilho `user_connections_par_derivado` e **o construtor
 * tipado nao pode nem oferece as duas colunas**. O que nao esta no tipo nao
 * atravessa a borda por descuido -- mesma forma da coluna de autoria de
 * `DirectorySuggestionsTable`, que tambem nao esta declarada ali.
 *
 * (E o nome dela NAO e citado aqui de proposito: ela carrega a marca "nunca sai
 * do servidor", e `portao-colunas-que-nao-saem` reprova o nome literal em todo
 * `.ts` de `src/` -- inclusive em comentario. Custou uma reprovacao para
 * lembrar.)
 *
 * `requester_user_id` e `addressee_user_id` **estao** aqui, e a diferenca
 * importa: `src/` PRECISA das duas na clausula `WHERE`, porque toda leitura e
 * toda escrita desta tabela e "a MINHA aresta", resolvida por igualdade com quem
 * chama (ADR-0021). O que nao acontece e elas serem PROJETADAS: nenhuma leitura
 * as seleciona para a resposta, e o que sai e `ref`, nome de exibicao e apelido.
 *
 * **Nao existe tabela nem coluna de "seguir"**, e nao existe leitura que devolva
 * a LISTA de conexoes de alguem -- nem do proprio dono (plano 4-B).
 */
export interface UserConnectionsTable {
  /** UUIDv7 gerado pela aplicacao. Nunca sai em resposta (ADR-0010 item 6). */
  id: string;
  /** 128 bits em base64url (22 caracteres). E ele que sai, e e DA ARESTA. */
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

/**
 * O `CHECK` `user_connections_estado_conhecido`.
 *
 * **`bloqueado` NAO e valor daqui**: ele e `user_blocks` (fatia E), e e
 * ferramenta pessoal, nao estado desta aresta. `nenhum` e a ausencia de linha.
 */
export type EstadoDaConexao = 'pending' | 'accepted' | 'declined';

/**
 * O `CHECK` `user_connections_origem_fechada`. Os tres caminhos que o desenho
 * reconhece como relacao, e **nao ha quarto**: a descoberta por link morreu na
 * decisao do cliente de 18/10/2026.
 */
export type OrigemDoPedidoDeConexao = 'anchored_case' | 'anchored_event' | 'presence_code';

/**
 * `user_blocks` -- o BLOQUEIO, ferramenta pessoal e nao moderacao
 * (`20261018000031`).
 *
 * **Nao entra na fila do painel**, de proposito: bloquear nao tem
 * administrador, nao tem revisao e tem efeito imediato na leitura.
 *
 * O predicado de leitura e `bloqueio_entre(uuid, uuid)`, SIMETRICO.
 *
 * **DESDE 19/10/2026 HA UMA SAIDA, e ela e ASSIMETRICA de proposito**
 * (`listMyBlocks`): a lista de quem EU bloqueei, lida por
 * `blocker_user_id = quem chama` na clausula `WHERE`. `blocker_user_id`
 * continua sem sair em resposta nenhuma -- ele e sempre quem chama --, e
 * `blocked_user_id` sai so resolvido no apelido, no nome e no `public_ref`
 * daquela pessoa, **e so para quem a bloqueou**.
 *
 * **O bloqueado continua sem saber**, e a razao e a assimetria: nao ha leitura,
 * nem contagem, nem existencia, de quem bloqueou quem chama. `bloqueio_entre` e
 * simetrica e NAO e chamada naquela consulta, justamente para que a segunda
 * metade do par nao apareca.
 */
export interface UserBlocksTable {
  id: string;
  /** Quem bloqueou. Entra no `WHERE`; nunca sai em resposta. */
  blocker_user_id: string;
  /** Quem foi bloqueado. `ON DELETE CASCADE`: a linha morre com o expurgo. */
  blocked_user_id: string;
  created_at: Generated<Date>;
}

/**
 * `user_publications` -- A PUBLICACAO DO MURAL (`20261020000002`).
 *
 * **ELA DEIXOU DE SER UM COMENTARIO.** Tres lugares desta base diziam que ela
 * nao existia, e um deles era o comentario de `publication_id` logo abaixo
 * neste arquivo. Agora existe, e a chave estrangeira que esperava entrou com
 * ela -- linha orfa em `publication_reports` nao e mais possivel.
 *
 * ## Identidade interna separada da publica (ADR-0024, ADR-0010 item 6)
 *
 * `id` e a chave primaria e **nunca sai em resposta**; `public_ref` e o
 * endereco, 22 simbolos de base64url -- a forma que
 * `publication_reports.publication_ref` ja cobrava antes de esta tabela
 * existir, e divergir dela faria a denuncia nao achar o alvo.
 *
 * ## `author_user_id` ESTA declarada, e a diferenca importa
 *
 * `src/` PRECISA dela na clausula `WHERE`: toda leitura e toda escrita desta
 * tabela e resolvida por igualdade com quem chama ou por conexao aceita com
 * quem chama (ADR-0021). O que NAO acontece e ela ser PROJETADA -- nenhuma
 * leitura a seleciona para a resposta, e o que sai do autor e `handle` e
 * `display_name`, resolvidos por juncao. Mesma forma de
 * `UserConnectionsTable.requester_user_id`.
 *
 * ## O QUE NAO EXISTE AQUI, e cada ausencia e uma regra
 *
 * - **nenhuma coluna de pet.** Ligar a publicacao a ficha de um pet agruparia
 *   os pets de um tutor, que o item 7 do ADR-0010 proibe e que a Emenda 2 abriu
 *   **so** para a contagem. Foto de pet e permitida (cliente, 19/10); marcar o
 *   pet, nao -- e a diferenca e nao haver onde guardar a marca;
 * - **nenhuma coluna de lugar** (ADR-0006: nao ha geocodificacao);
 * - **nenhuma coluna de visibilidade.** Ela e UMA -- conexao aceita --, por
 *   decisao do cliente (*"o que nao pode e ser publico, sem ter nenhum
 *   relacionamento"*), e uma coluna com um valor possivel e um `if` esperando
 *   nascer;
 * - **nenhuma coluna de curtida nem de contador.** Curtir e comentar sao
 *   decisao do cliente para a primeira versao e **nao foram construidos**: a
 *   prioridade 4 desta frente pede o proprio carimbo de migracao.
 */
export interface UserPublicationsTable {
  /** Identidade interna. Nunca projetada em resposta (ADR-0010 item 6). */
  id: string;
  /**
   * Quem publicou. Entra no `WHERE` de toda leitura e de toda escrita; **nunca
   * e projetada**. `ON DELETE CASCADE`: a publicacao morre com o expurgo da
   * conta, e a denuncia sobrevive porque guarda `publication_ref` e
   * `publication_body` em COPIA.
   */
  author_user_id: string;
  /** O endereco publico: 128 bits em base64url, 22 simbolos. E ele que sai. */
  public_ref: string;
  /**
   * O texto, **LIVRE**, 1 a 280. Nao ha filtro de palavra aqui nem em `src/`
   * (cliente: *"deixe o texto livre na timeline"*). 280 e o teto que
   * `publication_reports.publication_body` ja cobra.
   */
  body: string;
  /**
   * A foto, opcional e UNICA (`UNIQUE`). `purpose = 'user_publication'`,
   * conferido pelo caso de uso -- `CHECK` nao alcanca outra tabela.
   * `ON DELETE SET NULL`: imagem apagada deixa o TEXTO de pe.
   */
  image_id: string | null;
  /**
   * Rotulo do leitor de tela, **opcional**, 2 a 150, e so com `image_id`. A
   * faixa e a de `network_event_images.alt_text`, onde ele e obrigatorio; aqui
   * e opcional porque `body` e `NOT NULL` e o leitor sempre tem o que anunciar.
   */
  alt_text: string | null;
  created_at: Generated<Date>;
  /**
   * EXCLUSAO LOGICA, e a denuncia e o motivo: a chave estrangeira de
   * `publication_reports.publication_id` e `SET NULL`, e um apagamento fisico
   * deixaria a denuncia aberta sem alvo no meio da fila do painel. Toda leitura
   * carrega `deleted_at IS NULL` no `WHERE`.
   */
  deleted_at: Date | null;
}

/**
 * `publication_likes` -- A CURTIDA (`20261020000006`).
 *
 * Decisao do cliente de 19/10/2026: *"curtir e comentar"* na primeira versao.
 *
 * ## A unicidade e a CHAVE PRIMARIA, e e ela que faz "curtir duas vezes nao
 * conta duas"
 *
 * `PRIMARY KEY (publication_id, user_id)`. Nao e `CHECK`, nao e conferencia em
 * `src/` e nao e `UPDATE ... count + 1`: sob concorrencia, duas requisicoes
 * simultaneas da mesma pessoa produzem uma linha e um conflito -- absorvido por
 * `ON CONFLICT DO NOTHING` na escrita, que e o que torna curtir **idempotente**
 * sem laco de retentativa. Conferir antes de inserir teria a janela entre a
 * leitura e a escrita, que e exatamente a janela do toque duplo na tela.
 *
 * ## NENHUM `id` proprio, e a ausencia e a defesa
 *
 * A curtida nao tem endereco publico e nao sai em resposta individual -- o que
 * sai dela e a CONTAGEM e o booleano `liked_by_me`. Um `id` aqui seria
 * identificador sem leitor e, pior, o comeco de uma lista de quem curtiu, que o
 * item 7 da Emenda 5 do ADR-0010 registra como nao autorizada: *"a decisao de
 * 19/10 sobre curtir e CONTAGEM, e contagem nao diz quem"*.
 *
 * ## Nenhum predicado de visibilidade mora aqui
 *
 * Esta tabela e a ARESTA. O recorte -- autor ou conexao aceita, menos bloqueio,
 * menos ocultacao por denuncia -- e da LEITURA, resolvido na clausula `WHERE`
 * (ADR-0021). Repeti-lo aqui seria a segunda copia dele.
 */
export interface PublicationLikesTable {
  publication_id: string;
  /** Quem curtiu. Entra no `WHERE`; **nunca e projetada**. `CASCADE` no expurgo. */
  user_id: string;
  created_at: Generated<Date>;
}

/**
 * `publication_comments` -- O COMENTARIO (`20261020000006`).
 *
 * Molde de `UserPublicationsTable`, coluna por coluna, e a repeticao e o
 * mecanismo.
 *
 * **280 nao e escolha deste tipo**: e o teto do corpo da publicacao, que e o de
 * `publication_reports.publication_body` e o de `pets.care_notes`. Um quarto
 * numero para a mesma coisa e o que ninguem consegue explicar depois.
 *
 * **TEXTO LIVRE, sem filtro de palavra** -- a decisao do cliente de 18/10 vale
 * aqui inteira.
 *
 * ## O QUE NAO EXISTE, e cada ausencia tem dono
 *
 * - **nenhuma coluna de imagem**: comentario com foto seria uma segunda esteira
 *   de midia em superficie de terceiro, e nao foi pedido;
 * - **nenhum `parent_comment_id`**: fio de resposta e outro objeto, com outra
 *   leitura e outra paginacao;
 * - **nenhuma denuncia aponta para esta tabela, e ficar sem ela foi DECISAO DO
 *   CLIENTE EM 20/10/2026.** Os cinco motivos de `PublicationReportsTable`
 *   servem a um comentario sem mudanca; o que falta e o ALVO, e o custo foi
 *   levado a ele -- nao e esquecimento. A fatia que fecha isso e `comment_reports` + a sexta
 *   perna de `fila_de_moderacao` + `comment` em `ModerationOrigin` + uma
 *   operacao em `safety`. Enquanto ela nao chega: quem comenta apaga o proprio
 *   comentario, e **bloquear o autor some com os comentarios dele**.
 */
export interface PublicationCommentsTable {
  /** Identidade interna. Nunca projetada (ADR-0010 item 6). */
  id: string;
  /**
   * A publicacao. `ON DELETE CASCADE`: o expurgo da conta apaga a publicacao de
   * verdade e leva os comentarios. A exclusao LOGICA da publicacao **nao**
   * dispara o cascade (ela e um `UPDATE`): os comentarios ficam e param de ser
   * lidos, porque a leitura exige a publicacao viva.
   */
  publication_id: string;
  /** Quem comentou. Entra no `WHERE`; **nunca e projetada**. */
  author_user_id: string;
  /** O endereco publico: 22 simbolos, a MESMA forma de `user_publications`. */
  public_ref: string;
  /** O texto, **LIVRE**, 1 a 280. Sem filtro de palavra. */
  body: string;
  created_at: Generated<Date>;
  /**
   * EXCLUSAO LOGICA, pelo molde da publicacao. Fica logica mesmo sem denuncia
   * apontando para ela hoje, por duas razoes: a simetria, e o dia em que
   * `comment_reports` existir -- naquele dia a chave estrangeira dela encontra a
   * linha de pe, sem migracao de dado.
   */
  deleted_at: Date | null;
}

/**
 * As TRES tabelas de denuncia desta fatia usam a MESMA
 * `DecisaoDaModeracao` declarada acima (a da fila de `20261018000009`):
 * mesma forma e mesmos dois valores -- um estado de espera
 * (`resolved_at IS NULL`) e dois de saida, sem `escalated`. A uniao de
 * 18/10/2026 trouxe os dois ramos com a mesma declaracao; ela ficou UMA,
 * porque duas definicoes do mesmo tipo e onde elas comecam a divergir.
 */

/** As colunas que as tres tabelas de denuncia desta fatia compartilham. */
interface DenunciaDaComunidade {
  id: string;
  /**
   * Quem denunciou. SEM A MARCA do portao de saida, pela mesma decisao de
   * `professional_review_reports.reporter_user_id`: `src/` precisa dela no
   * `WHERE` para a ocultacao imediata, para os tetos e para recusar a denuncia
   * do proprio conteudo. Nenhuma resposta a projeta.
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
  /** O motivo da decisao, para quem auditar. Nao chega a nenhum dos dois lados. */
  resolution_reason: string | null;
}

/** Denuncia de PERFIL: cinco motivos, sobre quem a pessoa e. */
export interface ProfileReportsTable extends DenunciaDaComunidade {
  /** `SET NULL`: a denuncia SOBREVIVE ao expurgo da conta do denunciado. */
  subject_user_id: string | null;
  /** `users.public_ref` em COPIA. E ele o `target_ref` da fila. */
  subject_ref: string;
  reason: 'impersonation' | 'harassment' | 'pet_ransom_scam' | 'minor_suspected' | 'other';
}

/** Denuncia de FOTO: seis motivos, e o alvo e a esteira de imagem. */
export interface PhotoReportsTable extends DenunciaDaComunidade {
  image_id: string | null;
  /** `catalog_images.public_key` em COPIA. E o `target_ref` E o `target_body`. */
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
  /**
   * A publicacao denunciada. **A CHAVE ESTRANGEIRA ENTROU EM 20/10/2026**
   * (`20261020000002`), pela linha que a `20261018000032` deixou escrita e
   * comentada: `user_publications` passou a existir. **Linha orfa nao e mais
   * possivel.** `ON DELETE SET NULL`, e nao `CASCADE`: a denuncia e o unico
   * registro desta frente que sobrevive ao expurgo.
   */
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
   * A chave. Politica por plataforma e requisito: hoje so o Android e
   * publicado (decisao do cliente de 23/09) e o iOS esta dormente, instalado
   * por cabo com provisionamento gratuito. Uma politica unica bloquearia o
   * build de cabo junto, e naquele build "va para a loja" e instrucao
   * impossivel.
   */
  platform: 'android' | 'ios';
  /**
   * Abaixo desta versao o aplicativo FECHA. **Nula = ninguem bloqueado**, e e
   * assim que a migracao `20261019000007` a semeia.
   *
   * Sem `Generated`: o `DEFAULT` nao existe de proposito. Um padrao aqui seria
   * um numero que ninguem escolheu trancando aparelho de verdade.
   */
  minimum_version: string | null;
  /** A partir desta versao o app so AVISA, de forma dispensavel. Nula = sem aviso. */
  recommended_version: string | null;
  /** Destino do botao. Nula hoje: nao ha loja. Nula, o app nao desenha botao. */
  store_url: string | null;
  /** Quem trocou o numero. Texto livre: quem escreve esta no `psql`. */
  updated_by: string | null;
  updated_at: AtualizadoEm;
}

export interface Database {
  handles: HandlesTable;
  user_connections: UserConnectionsTable;
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
  professional_reviews: ProfessionalReviewsTable;
  professional_review_reports: ProfessionalReviewReportsTable;
  entity_verifications: EntityVerificationsTable;
  directory_suggestions: DirectorySuggestionsTable;
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
  /** VISAO, e nao tabela. Somente leitura: nada escreve aqui (`20261018000009`). */
  fila_de_moderacao: FilaDeModeracaoView;
  user_blocks: UserBlocksTable;
  profile_reports: ProfileReportsTable;
  photo_reports: PhotoReportsTable;
  publication_reports: PublicationReportsTable;
  app_version_policy: AppVersionPolicyTable;
  'audit.events': AuditEventsTable;
}

export type PetRow = Selectable<PetsTable>;
export type UserRow = Selectable<UsersTable>;
export type RefreshTokenRow = Selectable<RefreshTokensTable>;
