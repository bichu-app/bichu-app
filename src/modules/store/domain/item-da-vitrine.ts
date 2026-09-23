/**
 * A projecao de um item da vitrine: o que a secao `Loja` mostra.
 *
 * ## O que NAO sai daqui, e por que cada ausencia e decisao
 *
 * - **Nenhum UUID, e nao por filtragem: nao ha um.** `store_items` e
 *   `store_partners` tem `slug` como chave primaria. O ADR-0010 item 6 proibe
 *   UUID interno em saida publica, e a `20260922000008` mostrou o custo de
 *   descobrir isso depois: `professionals` precisou ganhar `slug` por migracao
 *   porque tinha um `id` que nunca poderia ser projetado. Aqui a coluna nao
 *   existe, entao o engano nao tem como acontecer.
 * - **`active`.** So item ativo chega ate aqui. O filtro vive na clausula
 *   `WHERE` (ADR-0021), e nao num `if` desta funcao: projecao que filtra e
 *   projecao que um dia esquece.
 * - **Carrinho, pedido, pagamento, estoque.** Nao ha campo, porque nao ha
 *   coluna, porque nao ha o conceito (criterio 5 da BICHUS-185).
 * - **Preco riscado, "de/por", desconto, "menor preco".** Criterio 19. Nao ha
 *   campo para nenhum dos quatro, e o ultimo caso de `item-da-vitrine.test.ts`
 *   reprova se algum nascer. **Nao ha portao de esquema para isto**, e o
 *   criterio 19 pede um: esta registrado como o que ficou de fora.
 *
 * ## O preco vence, e quem o omite e ESTE arquivo
 *
 * Criterio 16 da BICHUS-185, e e o que costuma ser esquecido: passada a janela
 * desde `price_checked_at`, **o servidor nao envia o valor**. Nao e a tela que
 * esconde.
 *
 * A diferenca e a razao inteira da regra existir aqui. Se o vencimento morasse
 * no aplicativo, um aparelho com build antigo mostraria preco vencido para
 * sempre, e nao haveria como parar isso sem passar pela loja de aplicativos --
 * que leva dias e depende de aprovacao de terceiro. Com a regra no servidor, o
 * valor **nao chega** ao aparelho, e todo build, novo ou velho, para de mostrar
 * no mesmo dia.
 *
 * Vencido, o item **continua na vitrine**: some o valor, e a tela passa a dizer
 * que o preco nao esta confirmado. Nunca o valor acompanhado de aviso de que
 * esta velho -- "R$ 89,90 (desatualizado)" e o pior dos dois mundos, porque a
 * pessoa le o numero e ignora o adjetivo.
 */

import { comoData } from '../../../shared/time/clock.js';
import type { Instant } from '../../../shared/types/brands.js';

/**
 * As categorias que `store_items.category` admite, **espelhadas** do `CHECK` da
 * migracao `20260922000009`.
 *
 * Acrescentar valor aqui e sempre tres arquivos no mesmo commit (ADR-0023
 * secao 3): a migracao, a entrada por extenso em
 * `tests/integration/conjunto-exato-dos-checks.test.ts` e o `enum` do contrato.
 */
export type CategoriaDaVitrine = 'food' | 'toy' | 'hygiene' | 'accessory' | 'health' | 'bed';

export const CATEGORIAS_DA_VITRINE: readonly CategoriaDaVitrine[] = [
  'food',
  'toy',
  'hygiene',
  'accessory',
  'health',
  'bed',
];

/**
 * Quantos dias um preco de referencia vale.
 *
 * **30, e o numero e emprestado e nao escolhido.** E o mesmo prazo que o
 * produto ja usa para a validade da localizacao de referencia (ADR-0006). Um
 * numero diferente aqui seria mais um numero para alguem decorar, e o PM
 * recomendou justamente 30 na Emenda 1 da BICHUS-185.
 *
 * **O valor final e do cliente**, e a pergunta esta na pauta de refinamento.
 * Enquanto ela nao volta, este e o default declarado, e nao um palpite
 * escondido numa comparacao.
 */
export const DIAS_DE_VALIDADE_DO_PRECO = 30;

/** O item como o repositorio o entrega. Sem `active`, sem UUID -- nao ha um. */
export interface ItemDaVitrine {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly imageUrl: string | null;
  readonly targetUrl: string;
  readonly partnerSlug: string;
  readonly partnerName: string;
  readonly partnerHost: string;
  /** Centavos, inteiro. Nulo quando o item nao tem preco, que e estado normal. */
  readonly priceAmount: number | null;
  readonly priceCurrency: string | null;
  /** `AAAA-MM-DD`. Nunca nulo quando ha `priceAmount` -- o banco exige os tres juntos. */
  readonly priceCheckedAt: string | null;
}

/** O item como a resposta publica o declara. */
export interface ItemProjetado {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly image_url: string | null;
  readonly target_url: string;
  readonly partner: { readonly slug: string; readonly name: string; readonly host: string };
  /**
   * Centavos. **Ausente quando vencido**, e ausente quando nunca houve preco.
   * Os dois casos sao distinguidos por `price_status`, e nao pela tela
   * adivinhar a partir do nulo.
   */
  readonly price_amount: number | null;
  readonly price_currency: string | null;
  readonly price_checked_at: string | null;
  readonly price_status: EstadoDoPreco;
}

/**
 * Os tres estados de preco, e eles sao tres e nao dois.
 *
 * `sem_preco` e `vencido` produzem a mesma ausencia de numero e **pedem textos
 * diferentes na tela**: um item que nunca teve preco simplesmente nao mostra a
 * linha (criterio A.2.4: ausencia de preco e estado normal, nao lacuna), e um
 * item com preco vencido diz que o preco nao esta confirmado e aponta o
 * parceiro (criterio 17). Um booleano aqui faria a tela escolher uma das duas
 * frases para os dois casos.
 */
export type EstadoDoPreco = 'vigente' | 'vencido' | 'sem_preco';

/**
 * Quantos dias inteiros separam `desde` de `ate`, pelo calendario UTC.
 *
 * Conta em dias de calendario e nao em milissegundos divididos por 86 400 000:
 * `price_checked_at` e uma DATA, sem hora, e comparar uma data com um instante
 * faz o resultado depender da hora em que a consulta rodou. Um item semeado com
 * data de exatamente 30 dias atras vencia de manha e nao vencia de tarde.
 */
export function diasDeCalendario(desde: string, ate: Instant): number {
  const [ano, mes, dia] = desde.split('-').map(Number);
  if (ano === undefined || mes === undefined || dia === undefined) {
    throw new TypeError(`price_checked_at fora do formato AAAA-MM-DD: "${desde}"`);
  }
  const inicio = Date.UTC(ano, mes - 1, dia);
  // `comoData` e o unico caminho declarado de `Instant` para `Date` neste
  // repositorio. Construir a data aqui seria a supressao de lint que o
  // cabecalho de `shared/time/clock.ts` existe para evitar.
  const instante = comoData(ate);
  const fim = Date.UTC(instante.getUTCFullYear(), instante.getUTCMonth(), instante.getUTCDate());
  return Math.floor((fim - inicio) / 86_400_000);
}

/**
 * O estado do preco de um item, agora.
 *
 * **A fronteira e `> DIAS_DE_VALIDADE_DO_PRECO`, e nao `>=`.** Trinta dias de
 * validade significa que o trigesimo dia ainda vale; recusar no trigesimo faria
 * a validade ser de vinte e nove, e a divergencia entre o numero escrito e o
 * numero aplicado e a classe de defeito que ninguem procura.
 */
export function estadoDoPreco(item: ItemDaVitrine, agora: Instant): EstadoDoPreco {
  if (item.priceAmount === null || item.priceCheckedAt === null) return 'sem_preco';
  return diasDeCalendario(item.priceCheckedAt, agora) > DIAS_DE_VALIDADE_DO_PRECO
    ? 'vencido'
    : 'vigente';
}

/**
 * Projeta o item para a resposta publica, **omitindo o valor quando vencido**.
 *
 * `price_checked_at` tambem sai quando vencido, e isso e deliberado: manter a
 * data sem o valor entregaria ao aplicativo tudo de que ele precisa para
 * reconstruir "o preco era de tal dia", e o que nao chega nao pode ser
 * remontado por build nenhum.
 */
export function projetarItem(item: ItemDaVitrine, agora: Instant): ItemProjetado {
  const estado = estadoDoPreco(item, agora);
  const vigente = estado === 'vigente';
  return {
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    category: item.category,
    image_url: item.imageUrl,
    target_url: item.targetUrl,
    partner: { slug: item.partnerSlug, name: item.partnerName, host: item.partnerHost },
    price_amount: vigente ? item.priceAmount : null,
    price_currency: vigente ? item.priceCurrency : null,
    price_checked_at: vigente ? item.priceCheckedAt : null,
    price_status: estado,
  };
}
