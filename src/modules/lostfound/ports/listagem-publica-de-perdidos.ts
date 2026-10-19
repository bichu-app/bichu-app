/**
 * Porta da **listagem pública de perdidos** (`listPublicLostPets`).
 *
 * Irmã de `leitura-publica-do-caso.ts`, e pela mesma razão de existir: a
 * projeção pública não reaproveita `CasoGravado`, porque `CasoGravado` carrega
 * `id` e `petId`, e o jeito mais barato de um UUID interno não sair numa rota
 * pública é ele **não chegar até a rota**.
 *
 * A diferença entre as duas portas é só uma, e ela é de autorização: lá o
 * `share_token` É a credencial, e por isso não há predicado de publicação; aqui
 * não há credencial nenhuma, e é a listagem que precisa filtrar. Os quatro
 * predicados estão em [ListagemPublicaDePerdidos.listar] e são medidos por
 * teste próprio:
 *
 * 1. `lost_cases.status = 'open'`;
 * 2. `lost_cases.share_to_public_list` — o tutor decide se o caso dele aparece
 *    na LISTA. O link que ele compartilhou continua funcionando de qualquer
 *    forma, e é por isso que este predicado não existe na leitura por token;
 * 3. `conta_habilitada(lost_cases.owner_user_id)` — conta desabilitada sai da
 *    listagem pública, como sai da fila de plaquinhas e da de indicações
 *    (migração `20261017000013`);
 * 4. o pet não está excluído, falecido nem arquivado — os mesmos três estados
 *    que `CasoPublico.aberto` consolida na leitura por token.
 *
 * **Não há coordenada em nenhuma direção.** O recorte geográfico é `city` e
 * `neighborhood` DIGITADOS, texto contra texto, e não há geocodificação
 * (ADR-0006). O contrato explica o porquê com todas as letras: um ponto por
 * caso permitiria montar o mapa que a regra de privacidade existe para
 * impedir.
 */
import type { EspecieDoCaso, PorteDoCaso } from './leitura-publica-do-caso.js';

/**
 * A janela de `period`, como o contrato a declara.
 *
 * **Nao ha membro para "janela aberta", e a ausencia e a decisao.** Janela
 * aberta e a AUSENCIA de janela (`undefined` em [RecorteDePerdidos.janela]), e
 * nao um valor a mais: um `'all'` aqui seria um segundo jeito de dizer o que a
 * ausencia ja diz, e `HORAS_DA_JANELA` -- o `Record<JanelaDePerdidos, number>`
 * do adaptador -- nao tem numero de horas para ele. Um membro sem hora num
 * mapa de horas e a dobra onde o proximo leitor erra.
 */
export type JanelaDePerdidos = '24h' | '7d' | '30d';

/**
 * O recorte pedido. `cidade` é obrigatória no contrato, e a obrigatoriedade é
 * de privacidade e não de desempenho: sem ela a operação seria um inventário
 * nacional de animais perdidos, que é a listagem que o ADR-0010 não quer.
 */
export interface RecorteDePerdidos {
  readonly cidade: string;
  readonly bairro?: string | undefined;
  readonly especie?: EspecieDoCaso | undefined;
  readonly porte?: PorteDoCaso | undefined;
  /**
   * A janela PEDIDA, ou **indefinida quando ninguem pediu nenhuma**.
   *
   * Indefinida e **janela aberta**: o adaptador nao poe predicado de data
   * nenhum. Decisao do cliente de 18/10/2026 (*"a pagina de pets nao deve
   * trazer nenhum item do filtro por padrao, como esta atualmente por ultimos
   * 30 dias"*), e ela vale desde o contrato: `period` perdeu o `default: 30d`
   * em `api/openapi.yaml` no mesmo commit que este campo virou opcional.
   *
   * Nao ha padrao a repor nesta camada. Repor um aqui seria o servidor
   * escolhendo o recorte que a pessoa nao escolheu -- o mesmo defeito que o
   * `default` do contrato cometia um nivel acima, agora escondido em
   * TypeScript em vez de YAML.
   */
  readonly janela?: JanelaDePerdidos | undefined;
  /** Busca parcial por **nome do pet**, e nunca por código de tag. */
  readonly termo?: string | undefined;
  readonly pagina: number;
  readonly limite: number;
  /** O instante de referência da janela. Vem do relógio, nunca do `now()` do banco. */
  readonly agora: Date;
}

/**
 * Um perdido como a superfície pública pode vê-lo.
 *
 * **Compare com `CasoPublico` e note as ausências**: não há `descricao`, não há
 * `cuidados`, não há `marcas` e não há `doChamador`. A página do caso mostra
 * os três primeiros porque quem tem o link já está olhando UM caso; a listagem
 * não os mostra porque texto livre de vinte tutores numa página é vinte vezes
 * mais superfície de vazamento pelo mesmo benefício nenhum. `doChamador` não
 * existe aqui porque a listagem não tem botão que dependa dele.
 */
export interface PerdidoPublico {
  readonly shareToken: string;
  readonly petNome: string;
  readonly especie: EspecieDoCaso;
  readonly porte: PorteDoCaso;
  readonly racaRotulo: string | null;
  readonly corRotulo: string | null;
  /** `lost_cases.last_seen_at`: quando o animal foi visto, e não quando o caso abriu. */
  readonly vistoPorUltimoEm: Date;
  readonly cidade: string | null;
  readonly bairro: string | null;
  /**
   * Chave da derivada **`thumb`** (176 × 194 px) da foto principal pronta.
   *
   * `thumb` e não `card`, e a diferença é medida: o cartaz usa `card` porque
   * ele é impresso em meia folha A4; o cartão da lista desenha 56 × 61,6 dp, e
   * a `thumb` cobre esse tamanho a 3x com 121 KiB de imagem decodificada por
   * cartão. Apontar a lista para a `card` de 1024 px custaria 4 MiB por cartão
   * — 80 MiB numa página de vinte — e é exatamente o defeito que a vitrine da
   * `Loja` já cometeu.
   */
  readonly chaveDaFoto: string | null;
}

export interface PaginaDePerdidos {
  readonly itens: readonly PerdidoPublico[];
  /** Quantos o recorte tem no servidor. Alimenta "Mostrando 1 a 20 de 87". */
  readonly total: number;
}

export interface ListagemPublicaDePerdidos {
  listar(recorte: RecorteDePerdidos): Promise<PaginaDePerdidos>;
}
