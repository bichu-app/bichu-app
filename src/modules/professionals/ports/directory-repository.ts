/**
 * A porta de leitura do diretorio.
 *
 * **Era uma operacao so ate 18/10/2026**, e a prosa anterior dizia que nao
 * havia detalhe nem escrita "de proposito", porque porta que declara o que nao
 * existe vira metodo vazio em todo dobre de teste. O argumento continua valendo
 * e e por isso que cada metodo acrescentado aqui **tem implementacao e rota**:
 * nenhum deles e declaracao antecipada.
 *
 * O que entrou e o pedido do cliente de 18/10: "os locais indicados devem ser
 * clicados, para visualizar mais informacoes e para que os usuarios possam dar
 * pontuacao e fazer recomendacoes em texto, onde ficara disponivel para outros
 * usuarios, como acontece na playstore".
 */
import type { EntradaDoDiretorio, TipoDeProfissional } from '../domain/entrada-do-diretorio.js';
import type {
  AvaliacaoDoLocal,
  EntradaDaAvaliacao,
  MotivoDaDenuncia,
  OrdemDasAvaliacoes,
  PontuacaoDoLocal,
} from '../domain/avaliacao-do-local.js';
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
  /**
   * **Busca parcial pelo NOME da entrada**, tolerante a acento e a caixa.
   *
   * Nao e filtro de campo estruturado como os de baixo: os outros comparam por
   * igualdade e este casa substring. A normalizacao NAO acontece aqui e nao
   * acontece em TypeScript nenhum -- ela mora numa funcao do banco, porque a
   * mesma expressao precisa valer para o indice e para o predicado. Duas
   * definicoes divergem em silencio, ficando so lentas.
   */
  readonly q?: string | undefined;
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

/**
 * O local, ja com a pontuacao, para a pagina de detalhe.
 *
 * `undefined` significa "nao ha entrada PUBLICADA com este slug", e o
 * manipulador o traduz em `404` -- nunca `403`. Rascunho, oculto e removido
 * caem no mesmo `undefined`, porque distinguir confirmaria a existencia daquele
 * endereco a quem nao tem direito de saber (ADR-0021).
 */
export interface LocalDoDiretorio {
  readonly entrada: EntradaDoDiretorio;
  readonly pontuacao: PontuacaoDoLocal;
  /** O `ref` da avaliacao de quem chama, ou nulo se ele nao avaliou. */
  readonly refDaMinhaAvaliacao: string | null;
  /**
   * Se quem chama tem canal de contato verificado, e portanto pode avaliar.
   *
   * **A mesma regua de criar encontro** (`estadoParaCriarEncontro`): e-mail OU
   * telefone verificado. Vem na MESMA consulta do local porque as duas
   * respostas decidem a mesma tela e a pessoa esta esperando nela.
   */
  readonly podeAvaliar: boolean;
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
   * O total do local, **o mesmo numero de `PontuacaoDoLocal.quantidade`**: as
   * duas consultas usam o mesmo recorte (`status = 'published'` e
   * `conta_habilitada`). Dois numeros diferentes na mesma tela e o defeito que
   * a duplicacao de recorte produz.
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
  lerLocalPublicado(slug: string, chamador: UserId, agora: Instant): Promise<LocalDoDiretorio | undefined>;

  /** `undefined` quando o local nao existe ou nao esta publicado. */
  listarAvaliacoes(recorte: RecorteDasAvaliacoes): Promise<PaginaDeAvaliacoes | undefined>;

  /**
   * Grava a avaliacao de `chamador` para `slug`, criando ou ATUALIZANDO a que
   * ja existe -- nunca criando a segunda. A unicidade e do banco
   * (`professional_reviews_uma_por_autor`), e nao de um `if` aqui.
   *
   * `'local-ausente'` quando o slug nao e de entrada publicada;
   * `'sem-canal-verificado'` quando a conta nao tem e-mail nem telefone
   * confirmado. Os dois sao devolvidos e nao lancados porque a borda decide o
   * status (`404` e `409`), e o repositorio nao conhece HTTP.
   */
  gravarMinhaAvaliacao(
    slug: string,
    chamador: UserId,
    entrada: EntradaDaAvaliacao,
    agora: Instant,
  ): Promise<AvaliacaoGravada | 'local-ausente' | 'sem-canal-verificado'>;

  /**
   * Verdadeiro quando a conta tem e-mail (ou telefone) confirmado.
   *
   * **O MESMO predicado que `gravarMinhaAvaliacao` ja aplica por dentro**, e
   * nao uma segunda regra: aquele continua sendo a trava que vale, porque ele
   * e o unico que roda na mesma transacao da escrita. Este existe para a borda
   * poder ORDENAR as recusas -- a moderacao de palavras precisa vir DEPOIS do
   * `409`, como na indicacao, e o `409` da escrita so chega junto com a linha
   * ja gravada.
   *
   * **So e consultado no caminho da RECUSA** (ver `directory-routes.ts`):
   * texto limpo nao paga esta consulta, e o caminho comum continua com uma
   * ida ao banco.
   */
  temCanalVerificadoParaAvaliar(chamador: UserId): Promise<boolean>;

  /**
   * Apaga a avaliacao de `chamador` para `slug`.
   *
   * **Idempotente**: nao ter avaliacao e um resultado de sucesso (`true`), e
   * nao um erro -- o estado pedido e o estado final, e um erro faria a tela
   * tratar como falha um toque duplo. `false` so quando o LOCAL nao existe.
   */
  apagarMinhaAvaliacao(slug: string, chamador: UserId): Promise<boolean>;

  /**
   * Enfileira a denuncia de `ref` por `chamador`.
   *
   * **Nao esconde a avaliacao.** Denunciar de novo nao duplica a fila:
   * incrementa `repeat_count`. `'propria'` quando quem denuncia e quem
   * escreveu -- a saida dele e o `DELETE`, que e imediato.
   */
  denunciarAvaliacao(
    slug: string,
    ref: string,
    chamador: UserId,
    denuncia: { motivo: MotivoDaDenuncia; detalhe: string | null },
    agora: Instant,
  ): Promise<'enfileirada' | 'ausente' | 'propria'>;
}
