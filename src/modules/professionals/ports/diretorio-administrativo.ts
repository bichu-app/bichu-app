/**
 * A porta da escrita administrativa do diretorio de `Perto`.
 *
 * Mesma forma das portas da `Loja` e da `Rede`, e por um motivo que nao e
 * estetico: **a versao lida mora na clausula `WHERE`**. `atualizarEntrada`
 * recebe `versaoLida` e devolve `null` quando nenhuma linha casou, e e o caso
 * de uso que traduz isso em 412. Uma porta que devolvesse a entrada para ser
 * comparada em memoria deixaria dois operadores passarem juntos pela
 * comparacao.
 *
 * ## O que esta porta NAO oferece, e cada ausencia e deliberada
 *
 * - **Nao ha `apagarEntrada`.** Retirar e `status: removed`: a linha continua
 *   no banco para a trilha, e `entity_verifications` referencia a entidade sem
 *   chave estrangeira (tabela polimorfica), entao apagar a linha deixaria
 *   verificacao orfa apontando para um UUID que nao existe mais.
 * - **Nao ha escrita de `geo`.** `professionals.geo` e
 *   `ColumnType<never, never, never>` no esquema tipado de proposito: o unico
 *   caminho ate ela e SQL onde `ST_MakePoint` fica a vista, e nao ha
 *   geocodificacao neste produto (ADR-0006). Decisao 9.4 pendente.
 * - **Nao ha escrita de `verification_level`, `cnpj`, `crmv_number` nem
 *   `crmv_uf`.** As quatro colunas existem; nenhuma e escrita por aqui. O nivel
 *   e derivado, e os documentos pertencem ao fluxo de verificacao.
 * - **Nao ha nada sobre quem convidou nem sobre quem reivindicou a entrada.**
 *   As duas colunas ligam a entrada a uma conta de pessoa (BICHUS-174). A
 *   entrada do painel nasce sem titular -- ver `ORIGEM_DO_PAINEL`.
 */
import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type {
  EntradaAdministrativa,
  OrigemDaEntrada,
  StatusDaEntrada,
  TitularidadeDaEntrada,
} from '../domain/escrita-do-diretorio.js';

/** Traduzida para o 409 do contrato pelo caso de uso. */
export class SlugOcupado extends Error {
  constructor() {
    super('slug ocupado em directory_entry');
    this.name = 'SlugOcupado';
  }
}

export interface Pagina<T> {
  readonly itens: readonly T[];
  readonly total: number;
}

/** `name` e a ordem alfabetica; `updated` poe a ultima alteracao em cima. */
export type OrdemDoDiretorioAdministrativo = 'name' | 'updated';

export interface RecorteDeEntradas {
  readonly q?: string | undefined;
  readonly kind?: TipoDeProfissional | undefined;
  readonly status?: StatusDaEntrada | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly sort: OrdemDoDiretorioAdministrativo;
  readonly page: number;
  readonly limit: number;
}

/**
 * A entrada como nasce.
 *
 * `source` e `claimStatus` estao aqui como valores, e nao fixados no
 * adaptador, porque sao decisao de dominio (`ORIGEM_DO_PAINEL`): o adaptador
 * nao deve ter opiniao sobre qual aceite houve.
 */
export interface NovaEntrada {
  readonly id: string;
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly postalCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly complement: string | null;
  readonly phoneE164: string | null;
  readonly status: StatusDaEntrada;
  readonly source: OrigemDaEntrada;
  readonly claimStatus: TitularidadeDaEntrada;
  readonly agora: Instant;
}

/**
 * A mudanca.
 *
 * `null` apaga e ausente nao mexe -- a mesma distincao do corpo do contrato,
 * carregada ate o `UPDATE`. `slug`, `kind` e `displayName` nao aceitam `null`:
 * a entrada nao existe sem eles.
 */
export interface MudancaDaEntrada {
  readonly slug?: string;
  readonly kind?: TipoDeProfissional;
  readonly displayName?: string;
  readonly about?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly neighborhood?: string | null;
  readonly postalCode?: string | null;
  readonly street?: string | null;
  readonly streetNumber?: string | null;
  readonly complement?: string | null;
  readonly phoneE164?: string | null;
  readonly status?: StatusDaEntrada;
  /** `true` so na transicao para `published`: e ele que grava `published_at`. */
  readonly gravaMarcoDePublicacao?: boolean;
}

export interface TransacaoDoDiretorio {
  /** A entrada com trava de linha. `null` quando nao existe. */
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
  /** O `id` interno da entrada, para a trilha. Nunca sai em resposta. */
  idPorSlug(slug: string): Promise<string | null>;
  /** Lanca `SlugOcupado`. */
  inserirEntrada(nova: NovaEntrada): Promise<EntradaAdministrativa>;
  /** `null` quando `versaoLida` nao e mais a atual. Lanca `SlugOcupado`. */
  atualizarEntrada(
    id: string,
    versaoLida: number,
    mudanca: MudancaDaEntrada,
    agora: Instant,
  ): Promise<EntradaAdministrativa | null>;
  /**
   * Tira uma avaliacao do ar, por `ref` publico, com o motivo.
   *
   * **EXCLUSAO LOGICA**: `status` vai para `'removed'` e `moderation_reason`
   * guarda o motivo. A linha FICA, porque o ADR-0011 manda a remocao ser
   * "registrada na trilha com o motivo", e trilha que aponta para uma linha
   * apagada nao e trilha.
   *
   * Devolve o `id` interno (para a trilha) e a nota, ou `null` quando o `ref`
   * nao e de avaliacao que esteja no ar. O `id` **nunca sai em resposta**.
   */
  removerAvaliacao(
    ref: string,
    motivo: string,
    agora: Instant,
  ): Promise<{ id: string; notaAntes: number } | null>;

  /** O ULTIMO passo de toda escrita, na MESMA transacao (ADR-0027 item 8). */
  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface DiretorioAdministrativoRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDoDiretorio) => Promise<T>): Promise<T>;
  listarEntradas(recorte: RecorteDeEntradas): Promise<Pagina<EntradaAdministrativa>>;
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
}
