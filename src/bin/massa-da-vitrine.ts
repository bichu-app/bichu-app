/** A massa fixa da vitrine da `Loja`: dez itens publicados, tres parceiros. */
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
  /** O caminho da imagem no site do parceiro, com a barra inicial. */
  readonly imagePath: string | null;
  /** O caminho do destino no site do parceiro, com a barra inicial. */
  readonly targetPath: string;
  /** Centavos, inteiro. Nulo quando o item nao tem preco. */
  readonly priceAmount: number | null;
  /** Ha quantos dias o preco foi consultado. */
  readonly precoConsultadoHaDias: number | null;
  readonly active: boolean;
  readonly sortOrder: number;
}

/** A versao corrente da vitrine, literal como a de `ref_data_versions`. */
export const VERSAO_DA_VITRINE = '2026-09-22.1';

export const PARCEIROS_DA_VITRINE: readonly ParceiroSemeado[] = [
  {
    slug: 'patas-do-bairro',
    name: 'Patas do Bairro',
    host: 'patas-do-bairro.example',
    active: true,
    sortOrder: 1,
  },
  { slug: 'mundo-pet', name: 'Mundo Pet', host: 'mundo-pet.example', active: true, sortOrder: 2 },
  {
    slug: 'bicho-feliz-antiga',
    name: 'Bicho Feliz',
    host: 'bicho-feliz.example',
    active: false,
    sortOrder: 3,
  },
];

export const MASSA_DA_VITRINE: readonly ItemSemeado[] = [
  {
    slug: 'bola-pop',
    partnerSlug: 'patas-do-bairro',
    title: 'Bola Pop',
    summary: 'Bola de borracha atóxica que flutua, para brincar na água.',
    category: 'toy',
    imagePath: '/vitrine/bola-pop.jpg',
    targetPath: '/bola-pop-borracha',
    priceAmount: 990,
    precoConsultadoHaDias: 2,
    active: true,
    sortOrder: 1,
  },
  {
    slug: 'casinha-termica-grande',
    partnerSlug: 'mundo-pet',
    title: 'Casinha térmica grande para cães de porte gigante',
    summary: 'Isolamento térmico nas quatro paredes e no teto, com piso elevado.',
    category: 'bed',
    imagePath: '/vitrine/casinha-termica.jpg',
    targetPath: '/casinha-termica-gg',
    priceAmount: 124_990,
    precoConsultadoHaDias: 5,
    active: true,
    sortOrder: 2,
  },
  {
    slug: 'shampoo-neutro',
    partnerSlug: 'patas-do-bairro',
    title: 'Shampoo neutro 500 ml',
    summary: 'Para banho entre tosas, sem perfume.',
    category: 'hygiene',
    imagePath: null,
    targetPath: '/shampoo-neutro-500',
    priceAmount: 4990,
    precoConsultadoHaDias: 9,
    active: true,
    sortOrder: 3,
  },
  {
    slug: 'coleira-peitoral',
    partnerSlug: 'mundo-pet',
    title: 'Coleira peitoral acolchoada',
    summary: 'Regulagem em quatro pontos, com fita refletiva.',
    category: 'accessory',
    imagePath: '/vitrine/peitoral.jpg',
    targetPath: '/coleira-peitoral-acolchoada',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: true,
    sortOrder: 4,
  },
  {
    slug: 'arranhador-torre',
    partnerSlug: 'patas-do-bairro',
    title: 'Arranhador torre com três plataformas',
    summary: 'Sisal natural nas colunas e nicho fechado na base.',
    category: 'toy',
    imagePath: '/vitrine/arranhador-torre.jpg',
    targetPath: '/arranhador-torre-sisal',
    priceAmount: 18_990,
    precoConsultadoHaDias: 45,
    active: true,
    sortOrder: 5,
  },
  {
    slug: 'racao-umida-sache',
    partnerSlug: 'mundo-pet',
    title: 'Ração úmida sachê frango',
    summary: 'Caixa com doze unidades de 85 g.',
    category: 'food',
    imagePath: '/vitrine/sache-frango.jpg',
    targetPath: '/racao-umida-sache-frango',
    priceAmount: 7200,
    precoConsultadoHaDias: 30,
    active: true,
    sortOrder: 6,
  },
  {
    slug: 'vermifugo-caes',
    partnerSlug: 'patas-do-bairro',
    title: 'Vermífugo para cães — coração e intestino',
    summary: 'Dose única para cães de até 20 kg. Venda sob prescrição.',
    category: 'health',
    imagePath: '/vitrine/vermifugo.jpg',
    targetPath: '/vermifugo-caes-20kg',
    priceAmount: 10_000,
    precoConsultadoHaDias: 12,
    active: true,
    sortOrder: 7,
  },
  {
    slug: 'racao-premium-caes',
    partnerSlug: 'mundo-pet',
    title: 'Ração super premium para cães adultos de porte médio e grande sabor frango e arroz 15 kg',
    summary:
      'Fórmula com proteína de frango como primeiro ingrediente, prebióticos para a flora '
      + 'intestinal, ômega 3 e 6 para toda a pelagem e grãos no tamanho adequado para cães de porte médio.',
    category: 'food',
    imagePath: null,
    targetPath: '/racao-super-premium-caes-adultos-15kg',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: true,
    sortOrder: 8,
  },
  {
    slug: 'comedouro-inox',
    partnerSlug: 'patas-do-bairro',
    title: 'Comedouro inox antiderrapante',
    summary: 'Base de silicone, 400 ml.',
    category: 'accessory',
    imagePath: null,
    targetPath: '/comedouro-inox-400',
    priceAmount: 3550,
    precoConsultadoHaDias: 1,
    active: true,
    sortOrder: 9,
  },
  {
    slug: 'cama-ortopedica-media',
    partnerSlug: 'mundo-pet',
    title: 'Cama ortopédica de espuma viscoelástica',
    summary: 'Capa removível e lavável, indicada para cães idosos.',
    category: 'bed',
    imagePath: '/vitrine/cama-ortopedica.jpg',
    targetPath: '/cama-ortopedica-viscoelastica-m',
    priceAmount: 27_990,
    precoConsultadoHaDias: 18,
    active: true,
    sortOrder: 10,
  },

  {
    slug: 'bola-descontinuada',
    partnerSlug: 'patas-do-bairro',
    title: 'Bola descontinuada',
    summary: 'Saiu da vitrine e continua na tabela, marcada inativa.',
    category: 'toy',
    imagePath: null,
    targetPath: '/bola-descontinuada',
    priceAmount: null,
    precoConsultadoHaDias: null,
    active: false,
    sortOrder: 90,
  },
  {
    slug: 'agua-de-coco-pet',
    partnerSlug: 'bicho-feliz-antiga',
    title: 'Água de coco para pet',
    summary: 'Ativo, mas de um parceiro que saiu.',
    category: 'food',
    imagePath: null,
    targetPath: '/agua-de-coco-pet',
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
