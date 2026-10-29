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

/**
 * UMA imagem da galeria, na posicao que ela ocupa (cliente, 29/10/2026).
 *
 * Mesma forma de `ImagemNaPosicao` da `Rede`, e nao importada dela: um modulo
 * que importe a porta de outro modulo cria a dependencia que a secao 6 proibe.
 */
export interface ImagemDaGaleriaNaPosicao {
  /** `catalog_images.id`, ja confirmado nesta mesma transacao. */
  readonly imageId: string;
  readonly position: number;
  /**
   * **Anulavel**: nulo quer dizer que o painel nao escreveu descricao; quando
   * vem, de 2 a 150 caracteres aparados. A coluna aceita nulo desde que nasceu
   * (`20261029000001`), pela mesma decisao do cliente que afrouxou a `Loja` em
   * 17/10 e a `Rede` em 21/10.
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
  /** AS ATIVIDADES, de 1 a 6. Nunca vazia: o caso de uso ja recusou a vazia. */
  readonly kinds: readonly TipoDeProfissional[];
  /**
   * **Opcional, e ausente vale `professional`.** Opcional de proposito: o aceite
   * da indicacao da comunidade (`fila-de-indicacoes.ts`, de outro ramo) monta
   * uma `NovaEntrada` e nao escolhe tipo de entidade, e exigir o campo aqui
   * obrigaria aquele caminho a ter opiniao sobre algo que ele nao coleta. O
   * adaptador aplica o padrao, que e o mesmo `DEFAULT` da coluna.
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
  /**
   * `catalog_images.id` da logo e da foto, ja CONFIRMADAS nesta mesma
   * transacao. Nulas quando a entrada nasce sem imagem, que e o normal.
   */
  readonly logoImageId: string | null;
  readonly photoImageId: string | null;
  readonly status: StatusDaEntrada;
  /**
   * `true` quando a entrada JA NASCE no ar (cliente, 29/10/2026), e e ele que
   * grava `published_at` no proprio `INSERT`.
   *
   * **Opcional, e ausente vale `false`**: o aceite da indicacao
   * (`fila-de-indicacoes.ts`) monta uma `NovaEntrada` e nao tem opiniao sobre
   * este marco. Exigir o campo obrigaria aquele caminho a decidir algo que ele
   * nao coleta -- a mesma razao de `entityKind` ser opcional aqui.
   *
   * Ate 28/10/2026 nenhuma criacao gravava o marco, porque nenhuma publicava.
   */
  readonly gravaMarcoDePublicacao?: boolean | undefined;
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
  /** SUBSTITUI a lista inteira. Sem `| null`: a coluna e NOT NULL com minimo 1. */
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
  /**
   * `catalog_images.id` resolvido pelo caso de uso, ou `null` para TIRAR a
   * imagem. Ausente nao mexe -- a mesma distincao dos demais campos.
   *
   * Tirar a imagem **nao apaga objeto nenhum do balde**: o que sai e o
   * ponteiro da entrada. Apagar o objeto aqui seria apagamento automatico de
   * imagem por efeito colateral de uma edicao de cadastro, e a decisao do
   * cliente de 17/10 (`varrer-envios-vencidos.ts`) e que apagamento e ato
   * explicito de pessoa sobre o dado dela.
   */
  readonly logoImageId?: string | null;
  readonly photoImageId?: string | null;
  readonly status?: StatusDaEntrada;
  /** `true` so na transicao para `published`: e ele que grava `published_at`. */
  readonly gravaMarcoDePublicacao?: boolean;
}

export interface TransacaoDoDiretorio {
  /** A entrada com trava de linha. `null` quando nao existe. */
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
  /** O `id` interno da entrada, para a trilha. Nunca sai em resposta. */
  idPorSlug(slug: string): Promise<string | null>;
  /**
   * A entrada pelo `id` interno, SEM trava de linha, para ler o estado final
   * depois de a galeria ter sido substituida (cliente, 29/10/2026).
   *
   * Ela existe porque `inserirEntrada` e `atualizarEntrada` leem a entrada
   * ANTES de a galeria ser escrita -- a galeria vive em outra tabela e precisa
   * do `id`, que no `INSERT` so existe depois dele. Sem esta releitura a
   * resposta do `POST` sairia com `images: []` tendo gravado oito.
   *
   * Lanca quando o `id` nao existe: a chamada acontece dentro da transacao que
   * acabou de escrever a linha, e "sumiu" ali e defeito e nao estado.
   */
  recarregarEntrada(id: string): Promise<EntradaAdministrativa>;
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

  /**
   * O envio de catalogo, com trava de linha, para a logo e a foto da entrada
   * (18/10/2026). As duas MESMAS portas que a `Loja` e a `Rede` usam: nao ha
   * segunda esteira de imagem neste produto.
   */
  envioDeCatalogo(uploadId: string): Promise<EnvioDeCatalogo | null>;
  /**
   * Confirma o envio e cria a imagem em `processing`, com o trabalho
   * enfileirado, **na mesma transacao da escrita da entrada**.
   *
   * E ESTA CONFIRMACAO que protege a imagem da varredura de envios vencidos:
   * `catalog_upload_intents.confirmed_at` deixa de ser nulo, e a linha sai da
   * lista de `listarIntencoesVencidas`. Um proposito novo SEM confirmacao
   * reabriria o defeito da foto do achado (ver o cabecalho de
   * `varrer-envios-vencidos.ts`).
   */
  confirmarEnvioDeCatalogo(entrada: ConfirmacaoDeCatalogo): Promise<void>;
  /** A entrada que ja usa esta imagem, ou `null`. Impede a mesma logo em duas marcas. */
  entradaDaImagem(imagemId: string): Promise<string | null>;
  /**
   * SUBSTITUI a galeria inteira da entrada (cliente, 29/10/2026).
   *
   * Substitui, e nao acrescenta: a lista que vem e a lista que fica, e vazia
   * limpa a galeria. E o que faz reordenar ser "mandar a ordem nova" em vez de
   * uma operacao propria -- e e por isso que a unicidade de posicao no banco e
   * DIFERIDA, para o apaga-e-insere nao colidir no meio da transacao.
   */
  substituirImagens(entradaId: string, imagens: readonly ImagemDaGaleriaNaPosicao[]): Promise<void>;
  /**
   * A entrada que ja tem esta imagem NA GALERIA, ou `null`.
   *
   * Separada de `entradaDaImagem` porque pergunta de outra tabela
   * (`professional_images` contra as duas colunas de `professionals`), e porque
   * a resposta tem outro efeito: ali ela impede a mesma logo em duas marcas,
   * aqui ela impede que o `UNIQUE` global de `professional_images.image_id` vire
   * um `500` no lugar do `400 upload_not_usable`.
   */
  entradaDaImagemDaGaleria(imagemId: string): Promise<string | null>;
  /** O ULTIMO passo de toda escrita, na MESMA transacao (ADR-0027 item 8). */
  registrarNaTrilha(evento: AuditEvent): Promise<void>;
}

export interface DiretorioAdministrativoRepository {
  emTransacao<T>(trabalho: (tx: TransacaoDoDiretorio) => Promise<T>): Promise<T>;
  listarEntradas(recorte: RecorteDeEntradas): Promise<Pagina<EntradaAdministrativa>>;
  entradaPorSlug(slug: string): Promise<EntradaAdministrativa | null>;
}
