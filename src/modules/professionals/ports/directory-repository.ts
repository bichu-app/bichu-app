/**
 * A porta de leitura do diretorio.
 *
 * Uma operacao so, e de proposito: a secao `Perto` le uma pagina e nada mais.
 * Nao ha detalhe, nao ha escrita e nao ha contagem por categoria -- porta que
 * declara o que ainda nao existe vira metodo vazio em todo dobre de teste, e
 * dobre com metodo vazio e o arranjo que ja aprovou 1037 casos com o mecanismo
 * desligado.
 */
import type { EntradaDoDiretorio, TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type { NivelDeVerificacao } from '../domain/nivel-de-verificacao.js';
import type { Instant, UserId } from '../../../shared/types/brands.js';

export type OrdemDoDiretorio = 'distance' | 'name';

export interface RecorteDoDiretorio {
  /**
   * **Quem chama.** Nao e filtro: e de quem sai a localizacao de referencia que
   * mede a distancia. A coordenada NAO vem da requisicao (ADR-0010): endereco
   * em URL vai para log de acesso, historico do aparelho e cabecalho `Referer`.
   */
  readonly chamador: UserId;
  readonly agora: Instant;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly kind?: TipoDeProfissional | undefined;
  /** **Piso**, nao igualdade: pedir `contact_verified` traz `document_verified` junto. */
  readonly verificationLevel?: NivelDeVerificacao | undefined;
  readonly sort: OrdemDoDiretorio;
  /** 1-based, como o contrato a declara. */
  readonly page: number;
  readonly limit: number;
}

export interface PaginaDoDiretorio {
  readonly itens: readonly EntradaDoDiretorio[];
  /**
   * O total do RECORTE, nao o da tabela. E ele que alimenta "1 a 20 de 87", e
   * devolver o total da tabela faria a tela prometer paginas que o filtro nao
   * tem.
   */
  readonly total: number;
  /**
   * `false` quando quem chama nao tem localizacao de referencia valida, ou
   * quando pediu `sort=name`. Com `false`, toda distancia vem nula e a ordem
   * foi por nome -- e a tela diz isso. Zero silencioso e a forma mais barata de
   * mentir sobre proximidade.
   */
  readonly distanciaDisponivel: boolean;
}

export interface DirectoryRepository {
  listarPublicados(recorte: RecorteDoDiretorio): Promise<PaginaDoDiretorio>;
}
