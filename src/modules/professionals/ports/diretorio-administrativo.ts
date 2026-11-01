import type { AuditEvent } from '../../audit/ports/audit-log.js';
import type { ConfirmacaoDeCatalogo, EnvioDeCatalogo } from '../../media/ports/imagem-de-catalogo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { TipoDeEntidade, TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
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

/** UMA imagem da galeria, na posicao que ela ocupa (cliente, 29/10/2026). */
export interface ImagemDaGaleriaNaPosicao {
  /** `catalog_images.id`, ja confirmado nesta mesma transacao. */
  readonly imageId: string;
  readonly position: number;
  /**
   * **Anulavel**: nulo quer dizer que o painel nao escreveu descricao; quando vem,
   * de 2 a 150 caracteres aparados.
   */
  readonly altText: string | null;
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
  readonly entityKind?: TipoDeEntidade | undefined;
  readonly status?: StatusDaEntrada | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly sort: OrdemDoDiretorioAdministrativo;
  readonly page: number;
  readonly limit: number;
}

/** A entrada como nasce. */
export interface NovaEntrada {
  readonly id: string;
  readonly slug: string;
  /** AS ATIVIDADES, de 1 a 6. */
  readonly kinds: readonly TipoDeProfissional[];
  /**
   * **Opcional, e ausente vale `professional`.** Opcional de proposito: o aceite da
   * indicacao da comunidade (`fila-de-indicacoes.ts`, de outro ramo) monta uma
   * `NovaEntrada` e nao escolhe tipo de entidade, e exigir o campo aqui obrigaria
   * aquele caminho a ter opiniao sobre algo que ele nao coleta.
   */
  readonly entityKind?: TipoDeEntidade | undefined;
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
  readonly siteUrl: string | null;
  /** `catalog_images.id` da logo e da foto, ja CONFIRMADAS nesta mesma transacao. */
  readonly logoImageId: string | null;
  readonly photoImageId: string | null;
  readonly status: StatusDaEntrada;
  /**
   * `true` quando a entrada JA NASCE no ar (cliente, 29/10/2026), e e ele que grava
   * `published_at` no proprio `INSERT`.
   */
  readonly gravaMarcoDePublicacao?: boolean | undefined;
  readonly source: OrigemDaEntrada;
  readonly claimStatus: TitularidadeDaEntrada;
  readonly agora: Instant;
}

/** A mudanca. */
export interface MudancaDaEntrada {
  readonly slug?: string;
  /** SUBSTITUI a lista inteira. */
  readonly kinds?: readonly TipoDeProfissional[];
  /** Nao aceita `null`, como `slug`, `kinds` e `displayName`: a coluna e NOT NULL. */
  readonly entityKind?: TipoDeEntidade;
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
  readonly siteUrl?: string | null;
  /** `catalog_images.id` resolvido pelo caso de uso, ou `null` para TIRAR a imagem. */
  readonly logoImageId?: string | null;
  readonly photoImageId?: string | null;
  readonly status?: StatusDaEntrada;
  /** `true` so na transicao para `published`: e ele que grava `published_at`. */
  readonly gravaMarcoDePublicacao?: boolean;
}

export interface TransacaoDoDiretorio {
  /** A entrada com trava de linha. */
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
  /** O `id` interno da entrada, para a trilha. */
  idPorSlug(slug: string): Promise<string | null>;
  /**
   * A entrada pelo `id` interno, SEM trava de linha, para ler o estado final depois
   * de a galeria ter sido substituida (cliente, 29/10/2026).
   */
  recarregarEntrada(id: string): Promise<EntradaAdministrativa>;
  /** Lanca `SlugOcupado`. */
  inserirEntrada(nova: NovaEntrada): Promise<EntradaAdministrativa>;
  /** `null` quando `versaoLida` nao e mais a atual. */
  atualizarEntrada(
    id: string,
    versaoLida: number,
    mudanca: MudancaDaEntrada,
    agora: Instant,
  ): Promise<EntradaAdministrativa | null>;
  /** Tira uma avaliacao do ar, por `ref` publico, com o motivo. */
  removerAvaliacao(
    ref: string,
    motivo: string,
    agora: Instant,
  ): Promise<{ id: string; notaAntes: number } | null>;

  /**
   * O envio de catalogo, com trava de linha, para a logo e a foto da entrada
   * (18/10/2026).
   */
  envioDeCatalogo(uploadId: string): Promise<EnvioDeCatalogo | null>;
  /**
   * Confirma o envio e cria a imagem em `processing`, com o trabalho enfileirado,
   * **na mesma transacao da escrita da entrada**.
   */
  confirmarEnvioDeCatalogo(entrada: ConfirmacaoDeCatalogo): Promise<void>;
  /** A entrada que ja usa esta imagem, ou `null`. */
  entradaDaImagem(imagemId: string): Promise<string | null>;
  /** SUBSTITUI a galeria inteira da entrada (cliente, 29/10/2026). */
  substituirImagens(entradaId: string, imagens: readonly ImagemDaGaleriaNaPosicao[]): Promise<void>;
  /** A entrada que ja tem esta imagem NA GALERIA, ou `null`. */
  entradaDaImagemDaGaleria(imagemId: string): Promise<string | null>;
  /** O ULTIMO passo de toda escrita, na MESMA transacao (ADR-0027 item 8). */
  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface DiretorioAdministrativoRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDoDiretorio) => Promise<T>): Promise<T>;
  listarEntradas(recorte: RecorteDeEntradas): Promise<Pagina<EntradaAdministrativa>>;
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
}
