import type {
  EnderecoComercial,
  EntradaDoDiretorio,
  TipoDeProfissional,
} from '../domain/entrada-do-diretorio.js';
import type {
  AvaliacaoDoLocal,
  EntradaDaAvaliacao,
  MotivoDaDenuncia,
  OrdemDasAvaliacoes,
  PontuacaoDoLocal,
} from '../domain/avaliacao-do-local.js';
import type { NivelDeVerificacao } from '../domain/nivel-de-verificacao.js';
import type { FamiliaDeSessao } from '../../identity/ports/localizacao-de-referencia-repository.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

export type OrdemDoDiretorio = 'distance' | 'name';

export interface RecorteDoDiretorio {
  /**
   * **Quem chama.** Nao e filtro: e de quem sai a localizacao de referencia que mede
   * a distancia.
   */
  readonly chamador: UserId | undefined;
  /** **De qual APARELHO de quem chama** sai esse ponto. */
  readonly familia: FamiliaDeSessao | undefined;
  readonly agora: Instant;
  /** **Busca parcial pelo NOME da entrada**, tolerante a acento e a caixa. */
  readonly q?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly kind?: TipoDeProfissional | undefined;
  /** Piso**, nao igualdade: pedir `contact_verified` traz `document_verified` junto. */
  readonly verificationLevel?: NivelDeVerificacao | undefined;
  readonly sort: OrdemDoDiretorio;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDoDiretorio {
  readonly itens: readonly EntradaDoDiretorio[];
  /** O total do RECORTE, nao o da tabela. */
  readonly total: number;
  /**
   * `false` quando ESTE APARELHO de quem chama nao tem localizacao de referencia
   * valida, ou quando pediu `sort=name`.
   */
  readonly distanciaDisponivel: boolean;
}

/** O local, ja com a pontuacao, para a pagina de detalhe. */
export interface LocalDoDiretorio {
  readonly entrada: EntradaDoDiretorio;
  readonly pontuacao: PontuacaoDoLocal;
  /** O `ref` da avaliacao de quem chama, ou nulo se ele nao avaliou. */
  readonly refDaMinhaAvaliacao: string | null;
  /** Se quem chama tem canal de contato verificado, e portanto pode avaliar. */
  readonly podeAvaliar: boolean;
  /**
   * A chave da derivada da FOTO do lugar (fachada ou ambiente), liberada para o
   * aplicativo pelo cliente em 18/10/2026.
   */
  readonly fotoPublicKey: string | null;
  /** O ENDERECO COMERCIAL da entrada (cliente, 21/10/2026). */
  readonly enderecoComercial: EnderecoComercial;
}

export interface RecorteDasAvaliacoes {
  readonly slug: string;
  /** Quem chama, para marcar `minha` na avaliacao dele. */
  readonly chamador: UserId;
  readonly sort: OrdemDasAvaliacoes;
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDeAvaliacoes {
  readonly itens: readonly AvaliacaoDoLocal[];
  /**
   * O total do local, **o mesmo numero de `PontuacaoDoLocal.quantidade`**: as duas
   * consultas usam o mesmo recorte (`status = 'published'` e `conta_habilitada`).
   */
  readonly total: number;
}

/** O resultado da escrita: a avaliacao, se ela nasceu agora, e a nova pontuacao. */
export interface AvaliacaoGravada {
  readonly avaliacao: AvaliacaoDoLocal;
  readonly criada: boolean;
  readonly pontuacao: PontuacaoDoLocal;
}

export interface DirectoryRepository {
  listarPublicados(recorte: RecorteDoDiretorio): Promise<PaginaDoDiretorio>;

  /** `undefined` quando nao ha entrada publicada com este slug. */
  lerLocalPublicado(
    slug: string,
    chamador: UserId,
    familia: FamiliaDeSessao | undefined,
    agora: Instant,
  ): Promise<LocalDoDiretorio | undefined>;

  /** `undefined` quando o local nao existe ou nao esta publicado. */
  listarAvaliacoes(recorte: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined>;

  /**
   * Grava a avaliacao de `chamador` para `slug`, criando ou ATUALIZANDO a que ja
   * existe -- nunca criando a segunda.
   */
  gravarMinhaAvaliacao(
    slug: string,
    chamador: UserId,
    entrada: EntradaDaAvaliacao,
    agora: Instant,
  ): Promise<AvaliacaoGravada | 'local-ausente' | 'sem-canal-verificado'>;

  /** Verdadeiro quando a conta tem e-mail (ou telefone) confirmado. */
  temCanalVerificadoParaAvaliar(chamador: UserId): Promise<boolean>;

  /** Apaga a avaliacao de `chamador` para `slug`. */
  apagarMinhaAvaliacao(slug: string, chamador: UserId): Promise<boolean>;

  /** Enfileira a denuncia de `ref` por `chamador`. */
  denunciarAvaliacao(
    slug: string,
    ref: string,
    chamador: UserId,
    denuncia: { motivo: MotivoDaDenuncia; detalhe: string | null },
    agora: Instant,
  ): Promise<'enfileirada' | 'ausente' | 'propria'>;
}
