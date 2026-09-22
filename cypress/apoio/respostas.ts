/**
 * As formas de resposta que os cenários leem, transcritas de `api/openapi.yaml`.
 *
 * Elas existem por dois motivos, e o segundo importa mais que o primeiro. O
 * primeiro é que `cy.request` sem parâmetro de tipo devolve `any`, e o projeto
 * roda `typescript-eslint` com regras de tipo ligadas: `any` vira erro de lint em
 * cada acesso a campo.
 *
 * O segundo é que um teste escrito contra `any` não reprova quando o campo muda
 * de nome no contrato — ele reprova quando a asserção reprova, que é tarde e num
 * lugar que não explica nada. Com a forma declarada, renomear `finder_token` no
 * contrato quebra a compilação do teste, que é onde o custo é menor.
 *
 * São propositalmente parciais: cada uma tem o que os cenários leem, e não o
 * esquema inteiro. Campo a mais na resposta é assunto da lista de permissão, que
 * trabalha sobre o corpo cru e não sobre o tipo.
 */

export interface Problema {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance?: string;
  readonly correlation_id?: string;
  readonly next_action?: string;
  readonly errors?: ReadonlyArray<{ readonly field: string; readonly code: string; readonly message?: string }>;
}

export interface Sessao {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly user: { readonly id: string; readonly email: string; readonly can_open_lost_case: boolean };
}

export interface Pet {
  readonly id: string;
  readonly name?: string;
  readonly status?: string;
}

export interface TagEmitidaResposta {
  readonly id: string;
  readonly code: string;
}

export interface ListaDeTags {
  readonly items: ReadonlyArray<{ readonly id: string; readonly status: string; readonly code_suffix: string }>;
}

export interface ResolucaoDeTag {
  readonly viewer: string;
  readonly pet: { readonly display_name: string; readonly species: string; readonly size: string };
  readonly lost?: { readonly is_lost: boolean; readonly since: string | null };
  readonly already_notified?: boolean;
}

export interface ContextoDeDonoDaTag {
  readonly pet_id: string;
  readonly tag_id: string;
}

export interface AvisoCriado {
  readonly finder_token: string;
  readonly conversation_url: string;
  readonly owner_notified: boolean;
  readonly pet_display_name?: string;
}

export interface PreviaDeAlcance {
  readonly reach_status: string;
  readonly reachable_tutors: number | null;
  readonly radius_m: number;
  readonly area_label: string | null;
  readonly blockers: readonly string[];
}

export interface Caso {
  readonly id: string;
  readonly pet_id: string;
  readonly status: string;
  readonly alert: { readonly reach_status: string; readonly recipients_total: number | null };
  readonly reopen_deadline: string | null;
  readonly resolution: { readonly outcome: string; readonly reunion_channel: string | null } | null;
}

export interface PaginaDeCandidatos {
  readonly items: ReadonlyArray<{ readonly id: string; readonly decision?: string }>;
}

export interface Candidato {
  readonly id: string;
  readonly decision: string;
}

export interface PaginaDeConversas {
  readonly items: ReadonlyArray<{ readonly id: string }>;
}

export interface PetPublico {
  readonly share_token: string;
  readonly pet_display_name: string;
  readonly species: string;
  readonly size: string;
  readonly area_label: string;
}

export interface PaginaPublicaDePerdidos {
  readonly items: readonly PetPublico[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly applied_filters?: Readonly<Record<string, string>>;
}

export interface Saude {
  readonly status: string;
  readonly version: string;
  readonly checks: Readonly<Record<string, string>>;
}

export interface Jwks {
  readonly keys: readonly unknown[];
}

export interface DescobertaOpenId {
  readonly issuer: string;
  readonly jwks_uri: string;
}

export interface DadosDeReferencia {
  readonly version: string;
  readonly species: ReadonlyArray<{ readonly code: string; readonly label: string }>;
  readonly breeds: ReadonlyArray<{ readonly code: string; readonly label: string }>;
  readonly colors: ReadonlyArray<{ readonly code: string; readonly label: string; readonly hex?: string }>;
  readonly sizes: ReadonlyArray<{ readonly code: string; readonly label: string }>;
}

/**
 * O corpo que uma chamada pode devolver: o esquema de sucesso **ou** um
 * `Problem`. O tipo é a interseção e não a união, de propósito: união obrigaria
 * um estreitamento em cada asserção, e o cenário já estreita pelo status, que é
 * a primeira linha de toda verificação aqui. A interseção deixa o teste ler
 * `r.body.type` no caminho triste e `r.body.id` no feliz sem ruído, e continua
 * quebrando a compilação quando um campo some do contrato, que é o que estes
 * tipos existem para fazer.
 */
export type OuProblema<T> = T & Partial<Problema>;
