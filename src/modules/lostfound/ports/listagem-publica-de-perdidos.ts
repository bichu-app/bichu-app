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
 * QUAL CONJUNTO a pagina devolve (`case_state` do contrato), e sao TRES.
 *
 * - `padrao` -- o que a ausencia do parametro significa: os casos **abertos
 *   MAIS** os reencontrados pela comunidade dentro da janela de 30 dias. E a
 *   decisao do cliente de 20/10/2026, na segunda rodada do mesmo dia:
 *   perguntado se o reencontrado devia aparecer so no filtro ou tambem na lista
 *   de sempre, a resposta foi **"Tambem na lista padrao"**.
 * - `aberto` -- SOMENTE os casos abertos. E o recorte que esta operacao tinha
 *   antes de 20/10/2026, e quem o pede agora o pede de proposito.
 * - `reencontrado` -- SOMENTE os reencontrados na janela.
 *
 * **A ausencia nao e "sem recorte", e por isso ele nao e um campo opcional como
 * [RecorteDePerdidos.cidade]**: ausencia de cidade e "nao recorte por isto",
 * ausencia de `case_state` e o conjunto `padrao`.
 *
 * ## O que a uniao MANTEM, e foi medido
 *
 * **Nenhuma linha do conjunto aberto sai.** Medido em 20/10/2026 com 16 000
 * casos abertos publicos: `count(*)` dos abertos sozinhos e `count(*)` dos
 * abertos de dentro da uniao dao o MESMO 16 000. Reencontrado ACRESCENTA; ele
 * nao desloca nem esconde pet que ainda esta na rua -- o que ele disputa e
 * posicao na pagina, nao presenca na lista.
 *
 * ## E o que a uniao NAO resolve, dito aqui porque e visivel ao cliente
 *
 * A ordem da rota e `last_seen_at DESC`, e um pet reencontrado foi visto por
 * ultimo ANTES de voltar: o `last_seen_at` dele e necessariamente mais velho que
 * o de um caso aberto hoje. MEDIDO com massa realista (reencontrados encerrados
 * nos ultimos 30 dias, caso durando de 1 a 14 dias): a pagina 1 sai com **20 de
 * 20 abertos e ZERO reencontrados**, e o primeiro reencontrado cai na **posicao
 * 250, pagina 13**. O corte da pagina 1 estava em `last_seen_at` de ~2 h atras
 * e o reencontrado mais recente tinha 27 h.
 *
 * Trocar a ordem e decisao de produto, nao de implementacao: ela mexe na lista
 * pela qual a vizinhanca acha o animal que sumiu. Esta pergunta esta com o
 * cliente, com os numeros acima.
 */
export type ConjuntoDePerdidos = 'padrao' | 'aberto' | 'reencontrado';

/**
 * A JANELA DO SELO, em dias. Decisao do cliente de 20/10/2026, nas palavras
 * dele: *"por 30 dias e depois ele expira e sai"*.
 *
 * Numero aqui e nao no adaptador porque a isca de borda o importa: ela precisa
 * montar um caso de 29 dias e um de 31, e dois lugares com o numero dariam uma
 * isca que mede a copia dela mesma.
 */
export const DIAS_DO_SELO_DE_REENCONTRO = 30;

/**
 * O recorte pedido.
 *
 * **`cidade` DEIXOU DE SER OBRIGATÓRIA EM 19/10/2026**, por decisão do cliente:
 * *"o campo cidade do filtro da página pet não deve ser obrigatório, mas
 * devemos filtrar pelos 20 últimos pets cadastrados"*.
 *
 * O texto que estava aqui dizia que a obrigatoriedade era "de privacidade e não
 * de desempenho: sem ela a operação seria um inventário nacional de animais
 * perdidos, que é a listagem que o ADR-0010 não quer". **Essa frase não estava
 * no ADR-0010 e não está**, e isso foi medido antes de ela sair: o que o
 * ADR-0010 exige é PRECISÃO máxima de bairro e cidade no que SAI (itens 4 e 5 e
 * a linha "o nível máximo de precisão geográfica em superfície pública é bairro
 * e cidade"), e a projeção pública continua inteira — `area_label` é o mesmo
 * rótulo, não há coordenada, não há UUID. Nenhum item da lista do ADR-0010 fala
 * do ESCOPO da listagem, e a leitura que virava obrigatoriedade era deste
 * arquivo, não do documento.
 *
 * O que a ausência de cidade de fato amplia é **enumeração**, e isso fica dito
 * em voz alta em vez de escondido: a lista nacional é varrível por quem pagina.
 * A contenção não é nova e não foi afrouxada — são os três tetos por `ip` que o
 * contrato declara (120/h, 600/24 h e 30/h para `q`), a paginação de 20 e o
 * predicado `share_to_public_list`, que é o tutor dizendo que o caso DELE pode
 * aparecer em lista.
 */
export interface RecorteDePerdidos {
  /**
   * Qual conjunto. **Sem `?`, de propósito**: quem monta o recorte tem de
   * decidir, e `undefined` aqui faria a consulta escolher sozinha num `??`
   * espalhado por três arquivos. Quem traduz a ausência do parâmetro em
   * `padrao` é o serviço, num lugar só.
   */
  readonly conjunto: ConjuntoDePerdidos;
  /**
   * A cidade pedida, ou **indefinida quando ninguém pediu nenhuma**.
   *
   * Indefinida é geografia ABERTA: o adaptador não põe predicado de cidade
   * nenhum. É a mesma mecânica de [janela], e a simetria é deliberada — os dois
   * campos opcionais desta porta significam "não recorte por isto", e nenhum
   * dos dois tem valor-sentinela de "qualquer", porque sentinela voltaria em
   * `applied_filters` como filtro que ninguém aplicou.
   */
  readonly cidade?: string | undefined;
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
  /**
   * `found_by_community` do contrato: o SELO.
   *
   * **Lido do `status` da LINHA, e nunca do conjunto que o pedido escolheu.**
   * Com a união do conjunto `padrao` (decisão do cliente de 20/10/2026, *"Também
   * na lista padrão"*), a mesma resposta traz caso aberto e reencontrado lado a
   * lado — então um valor derivado do pedido marcaria os dois iguais, e o selo
   * passaria a dizer que o animal voltou na mesma lista em que a vizinhança está
   * procurando por ele.
   *
   * `status = 'closed_reunited'` basta e é honesto: nos conjuntos `padrao` e
   * `reencontrado`, uma linha encerrada só chega aqui tendo passado pela janela
   * de 30 dias E pelo `EXISTS` da conversa, que são predicados do `WHERE`. No
   * conjunto `aberto` nenhuma linha é encerrada, então ele sai falso sem custo.
   */
  readonly encontradoPelaComunidade: boolean;
}

export interface PaginaDePerdidos {
  readonly itens: readonly PerdidoPublico[];
  /** Quantos o recorte tem no servidor. Alimenta "Mostrando 1 a 20 de 87". */
  readonly total: number;
}

export interface ListagemPublicaDePerdidos {
  listar(recorte: RecorteDePerdidos): Promise<PaginaDePerdidos>;
}
