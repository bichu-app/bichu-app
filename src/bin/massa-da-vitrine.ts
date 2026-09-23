/**
 * A massa fixa da vitrine da `Loja`: dez itens publicados, tres parceiros.
 *
 * ## Por que ela mora num arquivo proprio
 *
 * Mesma razao de `massa-do-diretorio.ts`: `seed.ts` e o MECANISMO e isto e o
 * CONTEUDO. Separar permite que as regras que a massa precisa respeitar sejam
 * afirmaveis por um teste sem subir banco, e `massa-da-vitrine.test.ts` as
 * afirma.
 *
 * ## O que ela e: material para o cliente JULGAR O VISUAL
 *
 * Ela nao existe para provar que a consulta funciona -- existe para alguem
 * olhar a tela e decidir se ela esta boa. Dez linhas iguais com sufixo
 * numerico atenderiam a contagem e nao mostrariam nada: toda decisao de
 * desenho que a lista toma some numa lista homogenea.
 *
 * Entao cada item abaixo cobre **um caso que muda o desenho**:
 *
 * - um titulo curtissimo (`Bola Pop`) ao lado de um que **quebra em duas
 *   linhas** e de um que quebra em tres;
 * - itens **com e sem imagem** -- o cartao precisa saber se desenhar sem ela,
 *   e ausencia de imagem e estado normal, nao lacuna;
 * - itens **com e sem preco**, porque `price_amount` e opcional;
 * - um preco **vencido**, que o servidor omite (criterio 16). Sem ele, o
 *   caminho de vencimento nunca seria visto por olho humano;
 * - um preco **no limite exato** da validade, que ainda precisa aparecer;
 * - preco de um digito de real (`R$ 9,90`) e preco de milhar
 *   (`R$ 1.249,90`), que sao as duas pontas da formatacao brasileira: a
 *   virgula decimal e o ponto de milhar. Um so deles deixaria metade do
 *   formato sem ninguem olhando;
 * - titulos com **acento e com `c` cedilhado**, que e onde fonte e quebra de
 *   linha costumam falhar;
 * - **o caso feio**, e ele e deliberado: `racao-premium-caes-adultos` junta
 *   titulo longo, resumo no limite dos 180 caracteres, nenhuma imagem e
 *   nenhum preco. E o pior cartao que a vitrine consegue produzir, e e para
 *   isso que serve olhar.
 *
 * ## Os dois itens que NUNCA podem aparecer
 *
 * `bola-descontinuada` esta inativo, e `agua-de-coco-pet` pertence a um
 * parceiro inativo. Eles nao sao enfeite: sao o que da o que medir a isca do
 * predicado de vitrine. Uma massa so com itens visiveis faria o teste de
 * "item retirado nao aparece" passar contra uma consulta que nunca filtrou
 * nada.
 *
 * ## Determinismo, e a excecao declarada da data
 *
 * Todo identificador e literal. **`price_checked_at` e a unica coisa
 * calculada**, e ela e calculada como um DESLOCAMENTO EM DIAS a partir do dia
 * da semeadura, por um motivo que a alternativa nao resolve: com datas
 * literais, a massa inteira vence sozinha em trinta dias e a vitrine de QA
 * passa a mostrar "preco nao confirmado" em todos os dez itens, sem ninguem
 * ter mexido em nada. O que a massa precisa preservar e a RELACAO -- um item
 * vencido, um no limite, os outros vigentes --, e e a relacao que o
 * deslocamento preserva.
 *
 * **Isto nao e a derivacao automatica que o criterio 14 proibe.** Aquele
 * criterio fala do CATALOGO, onde a data e o registro de um ato humano e
 * deriva-la de `now()` faz o numero envelhecer com a data sempre nova. Aqui os
 * dez deslocamentos sao **distintos entre si e nenhum e zero**, entao a
 * verificacao que procura o sintoma (todas as datas iguais a data de
 * aplicacao) continua enxergando -- e `massa-da-vitrine.test.ts` a exerce.
 */
import type { CategoriaDaVitrine } from '../modules/store/domain/item-da-vitrine.js';

export interface ParceiroSemeado {
  readonly slug: string;
  readonly name: string;
  readonly host: string;
  readonly active: boolean;
  readonly sortOrder: number;
}

export interface ItemSemeado {
  readonly slug: string;
  readonly partnerSlug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: CategoriaDaVitrine;
  readonly imageUrl: string | null;
  readonly targetUrl: string;
  /** Centavos, inteiro. Nulo quando o item nao tem preco. */
  readonly priceAmount: number | null;
  /**
   * Ha quantos dias o preco foi consultado. Nulo quando nao ha preco.
   *
   * Nenhum e zero e nenhum se repete: os dois fatos sao afirmados por teste,
   * e sao o que impede a massa de parecer derivada de um carimbo automatico.
   */
  readonly precoConsultadoHaDias: number | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

/** A versao corrente da vitrine, literal como a de `ref_data_versions`. */
export const VERSAO_DA_VITRINE = '2026-09-22.1';

export const PARCEIROS_DA_VITRINE: readonly ParceiroSemeado[] = [
  { slug: 'cobasi', name: 'Cobasi', host: 'cobasi.com.br', active: true, sortOrder: 1 },
  { slug: 'petz', name: 'Petz', host: 'petz.com.br', active: true, sortOrder: 2 },
  // Inativo. Existe para o item dele ter de onde nao aparecer.
  {
    slug: 'petlove-antiga',
    name: 'Petlove',
    host: 'petlove.com.br',
    active: false,
    sortOrder: 3,
  },
];

export const MASSA_DA_VITRINE: readonly ItemSemeado[] = [
  // 1. Titulo curtissimo, com imagem, preco de um digito de real.
  //    `R$ 9,90` e a ponta de baixo da formatacao: dois digitos de centavo
  //    depois da virgula, e nenhum ponto de milhar.
  {
    slug: 'bola-pop',
    partnerSlug: 'cobasi',
    title: 'Bola Pop',
    summary: 'Bola de borracha atóxica que flutua, para brincar na água.',
    category: 'toy',
    imageUrl: 'https://cdn.cobasi.com.br/vitrine/bola-pop.jpg',
    targetUrl: 'https://cobasi.com.br/bola-pop-borracha',
    priceAmount: 990,
    precoConsultadoHaDias: 2,
    active: true,
    sortOrder: 1,
  },
  // 2. Titulo que quebra em duas linhas, com imagem, preco de milhar.
  //    `R$ 1.249,90` e a ponta de cima: o ponto de milhar e o que distingue o
  //    formato brasileiro do americano, e ele so aparece acima de mil.
  {
    slug: 'casinha-termica-grande',
    partnerSlug: 'petz',
    title: 'Casinha térmica grande para cães de porte gigante',
    summary: 'Isolamento térmico nas quatro paredes e no teto, com piso elevado.',
    category: 'bed',
    imageUrl: 'https://cdn.petz.com.br/vitrine/casinha-termica.jpg',
    targetUrl: 'https://petz.com.br/casinha-termica-gg',
    priceAmount: 124_990,
    precoConsultadoHaDias: 5,
    active: true,
    sortOrder: 2,
  },
  // 3. SEM imagem, com preco. O cartao precisa fechar sem a moldura da foto.
  {
    slug: 'shampoo-neutro',
    partnerSlug: 'cobasi',
    title: 'Shampoo neutro 500 ml',
    summary: 'Para banho entre tosas, sem perfume.',
    category: 'hygiene',
    imageUrl: null,
    targetUrl: 'https://cobasi.com.br/shampoo-neutro-500',
    priceAmount: 4990,
    precoConsultadoHaDias: 9,
    active: true,
    sortOrder: 3,
  },
  // 4. Com imagem e SEM preco nenhum. `price_status` vem `sem_preco` e a
  //    linha de preco simplesmente nao existe -- nao ha "sob consulta" e nao
  //    ha espaco reservado vazio (criterio A.2.4).
  {
    slug: 'coleira-peitoral',
    partnerSlug: 'petz',
    title: 'Coleira peitoral acolchoada',
    summary: 'Regulagem em quatro pontos, com fita refletiva.',
    category: 'accessory',
    imageUrl: 'https://cdn.petz.com.br/vitrine/peitoral.jpg',
    targetUrl: 'https://petz.com.br/coleira-peitoral-acolchoada',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: true,
    sortOrder: 4,
  },
  // 5. PRECO VENCIDO: 45 dias, bem alem dos 30. O servidor omite o valor e a
  //    tela passa a dizer que o preco nao esta confirmado. Sem este item, o
  //    unico caminho que a Emenda 1 existe para produzir nunca seria visto.
  {
    slug: 'arranhador-torre',
    partnerSlug: 'cobasi',
    title: 'Arranhador torre com três plataformas',
    summary: 'Sisal natural nas colunas e nicho fechado na base.',
    category: 'toy',
    imageUrl: 'https://cdn.cobasi.com.br/vitrine/arranhador-torre.jpg',
    targetUrl: 'https://cobasi.com.br/arranhador-torre-sisal',
    priceAmount: 18_990,
    precoConsultadoHaDias: 45,
    active: true,
    sortOrder: 5,
  },
  // 6. NO LIMITE EXATO: 30 dias. Trinta dias de validade significa que o
  //    trigesimo ainda vale, e este item e quem cobra isso. Um `>=` no lugar
  //    do `>` o apagaria da tela, e a divergencia entre o numero escrito e o
  //    aplicado e a classe de defeito que ninguem procura.
  {
    slug: 'racao-umida-sache',
    partnerSlug: 'petz',
    title: 'Ração úmida sachê frango',
    summary: 'Caixa com doze unidades de 85 g.',
    category: 'food',
    imageUrl: 'https://cdn.petz.com.br/vitrine/sache-frango.jpg',
    targetUrl: 'https://petz.com.br/racao-umida-sache-frango',
    priceAmount: 7200,
    precoConsultadoHaDias: 30,
    active: true,
    sortOrder: 6,
  },
  // 7. Acento e CEDILHA no titulo, e valor redondo (`R$ 100,00`), que e onde
  //    uma formatacao que corta zero a direita aparece como `R$ 100,0`.
  {
    slug: 'vermifugo-caes',
    partnerSlug: 'cobasi',
    title: 'Vermífugo para cães — coração e intestino',
    summary: 'Dose única para cães de até 20 kg. Venda sob prescrição.',
    category: 'health',
    imageUrl: 'https://cdn.cobasi.com.br/vitrine/vermifugo.jpg',
    targetUrl: 'https://cobasi.com.br/vermifugo-caes-20kg',
    priceAmount: 10_000,
    precoConsultadoHaDias: 12,
    active: true,
    sortOrder: 7,
  },
  // 8. O CASO FEIO, e ele e deliberado. Titulo de tres linhas, resumo
  //    encostado no teto de 180 caracteres, nenhuma imagem e nenhum preco: o
  //    pior cartao que esta vitrine consegue produzir. Se o desenho aguenta
  //    este, aguenta os outros nove.
  {
    slug: 'racao-premium-caes',
    partnerSlug: 'petz',
    title: 'Ração super premium para cães adultos de porte médio e grande sabor frango e arroz 15 kg',
    // **Exatamente 180 caracteres**, que e o teto do `CHECK`. O resumo mais
    // longo que a coluna aceita e o que mais estica o cartao, e e ele que
    // precisa estar na tela quando alguem for julgar o desenho.
    summary:
      'Fórmula com proteína de frango como primeiro ingrediente, prebióticos para a flora '
      + 'intestinal, ômega 3 e 6 para toda a pelagem e grãos no tamanho adequado para cães de porte médio.',
    category: 'food',
    imageUrl: null,
    targetUrl: 'https://petz.com.br/racao-super-premium-caes-adultos-15kg',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: true,
    sortOrder: 8,
  },
  // 9. Titulo curto com acento, sem imagem, preco vigente recente.
  {
    slug: 'comedouro-inox',
    partnerSlug: 'cobasi',
    title: 'Comedouro inox antiderrapante',
    summary: 'Base de silicone, 400 ml.',
    category: 'accessory',
    imageUrl: null,
    targetUrl: 'https://cobasi.com.br/comedouro-inox-400',
    priceAmount: 3550,
    precoConsultadoHaDias: 1,
    active: true,
    sortOrder: 9,
  },
  // 10. Titulo longo com imagem e preco vigente, para a lista nao terminar
  //     num caso extremo.
  {
    slug: 'cama-ortopedica-media',
    partnerSlug: 'petz',
    title: 'Cama ortopédica de espuma viscoelástica',
    summary: 'Capa removível e lavável, indicada para cães idosos.',
    category: 'bed',
    imageUrl: 'https://cdn.petz.com.br/vitrine/cama-ortopedica.jpg',
    targetUrl: 'https://petz.com.br/cama-ortopedica-viscoelastica-m',
    priceAmount: 27_990,
    precoConsultadoHaDias: 18,
    active: true,
    sortOrder: 10,
  },

  // ------------------------------------------------------------------
  // Os dois que NUNCA aparecem. Eles sao o que da o que medir a isca.
  // ------------------------------------------------------------------
  {
    slug: 'bola-descontinuada',
    partnerSlug: 'cobasi',
    title: 'Bola descontinuada',
    summary: 'Saiu da vitrine e continua na tabela, marcada inativa.',
    category: 'toy',
    imageUrl: null,
    targetUrl: 'https://cobasi.com.br/bola-descontinuada',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: false,
    sortOrder: 90,
  },
  {
    slug: 'agua-de-coco-pet',
    partnerSlug: 'petlove-antiga',
    // Item ATIVO de um parceiro INATIVO. Desativar o parceiro retira a vitrine
    // dele inteira, e um item orfao na tela levaria a um site que decidimos
    // nao mais apontar.
    title: 'Água de coco para pet',
    summary: 'Ativo, mas de um parceiro que saiu.',
    category: 'food',
    imageUrl: null,
    targetUrl: 'https://petlove.com.br/agua-de-coco-pet',
    priceAmount: 1490,
    precoConsultadoHaDias: 3,
    active: true,
    sortOrder: 91,
  },
];

/** Os itens que a vitrine de fato mostra: ativos, de parceiro ativo. */
export const ITENS_VISIVEIS: readonly ItemSemeado[] = MASSA_DA_VITRINE.filter(
  (item) =>
    item.active &&
    (PARCEIROS_DA_VITRINE.find((p) => p.slug === item.partnerSlug)?.active ?? false),
);
