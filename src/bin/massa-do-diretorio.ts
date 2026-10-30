/** A massa fixa do diretorio de `Perto`: doze entradas, dez publicadas. */
import type { TipoDeProfissional } from '../modules/professionals/domain/entrada-do-diretorio.js';
import type { TipoDeEvidencia } from '../modules/professionals/domain/nivel-de-verificacao.js';

export type StatusDaEntrada = 'draft' | 'published' | 'hidden' | 'removed';

export interface VerificacaoSemeada {
  readonly id: string;
  readonly evidenceKind: TipoDeEvidencia;
  /** Toda verificacao da massa e `approved` ou `pending`; recusa nao entra. */
  readonly aprovada: boolean;
}

export interface EntradaSemeada {
  readonly id: string;
  /** O titular. Uma conta por entrada, como no mundo real. */
  readonly titularId: string;
  readonly titularEmail: string;
  /**
   * O ENDERECO PUBLICO do titular (`users.public_ref`), LITERAL como todo o resto
   * desta massa.
   */
  readonly titularPublicRef: string;
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  /** `[lon, lat]`, na ORDEM DE `ST_MakePoint`. */
  readonly ponto: readonly [number, number] | null;
  readonly phoneE164: string | null;
  readonly crmvNumber: string | null;
  readonly crmvUf: string | null;
  readonly cnpj: string | null;
  readonly status: StatusDaEntrada;
  readonly verificacoes: readonly VerificacaoSemeada[];
}

/** 2026-09-01T12:00:00Z. Literal, como tudo nesta massa. */
export const MOMENTO_DA_MASSA = '2026-09-01T12:00:00Z';

/** `.invalid` e reservado por RFC 2606: nenhum e-mail daqui sai para o mundo. */
const DOMINIO = 'exemplo.invalid';

export const MASSA_DO_DIRETORIO: readonly EntradaSemeada[] = [
  {
    id: '0199c3a0-0000-7000-8000-0000000000d1',
    titularId: '0199c3a0-0000-7000-8000-0000000000a1',
    titularEmail: `clinica.santa-barbara@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a1',
    slug: 'clinica-santa-barbara',
    kind: 'clinic',
    displayName: 'Clínica Veterinária Santa Bárbara 24 Horas — Pinheiros',
    about:
      'Pronto atendimento 24 horas, internação, exames de imagem e laboratório ' +
      'no mesmo endereço. Atendimento de cães, gatos e animais silvestres.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    ponto: [-46.6997, -23.5646],
    phoneE164: '+551130612200',
    crmvNumber: '12345',
    crmvUf: 'SP',
    cnpj: '19283746500012',
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e1',
        evidenceKind: 'cnpj',
        aprovada: true,
      },
      {
        id: '0199c3a0-0000-7000-8000-0000000000e2',
        evidenceKind: 'crmv',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d2',
    titularId: '0199c3a0-0000-7000-8000-0000000000a2',
    titularEmail: `vet.lu@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a2',
    slug: 'vet-lu',
    kind: 'vet',
    displayName: 'Vet Lu',
    about: 'Atendimento domiciliar para gatos.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Vila Madalena',
    ponto: [-46.6906, -23.5545],
    phoneE164: '+5511987654321',
    crmvNumber: '28844',
    crmvUf: 'SP',
    cnpj: null,
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e3',
        evidenceKind: 'crmv',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d3',
    titularId: '0199c3a0-0000-7000-8000-0000000000a3',
    titularEmail: `banho.do.bairro@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a3',
    slug: 'banho-do-bairro',
    kind: 'groomer',
    displayName: 'Banho do Bairro',
    about: 'Banho, tosa higiênica e hidratação. Sem gaiola de secagem.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    ponto: [-46.7012, -23.5669],
    phoneE164: null,
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e4',
        evidenceKind: 'phone_callback',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d4',
    titularId: '0199c3a0-0000-7000-8000-0000000000a4',
    titularEmail: `passeios.do.rodrigo@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a4',
    slug: 'passeios-do-rodrigo',
    kind: 'walker',
    displayName: 'Passeios do Rodrigo',
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Perdizes',
    ponto: [-46.6822, -23.5372],
    phoneE164: '+5511991234567',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'published',
    verificacoes: [],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d5',
    titularId: '0199c3a0-0000-7000-8000-0000000000a5',
    titularEmail: `casa.do.miau@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a5',
    slug: 'casa-do-miau-hospedagem',
    kind: 'sitter',
    displayName: 'Casa do Miau Hospedagem Felina',
    about: 'Hospedagem só para gatos, em ambiente residencial, sem cães.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Sumaré',
    ponto: [-46.6752, -23.5453],
    phoneE164: '+5511994445566',
    crmvNumber: null,
    crmvUf: null,
    cnpj: '30294857000133',
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e5',
        evidenceKind: 'cnpj',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d6',
    titularId: '0199c3a0-0000-7000-8000-0000000000a6',
    titularEmail: `adestra.junto@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a6',
    slug: 'adestra-junto',
    kind: 'trainer',
    displayName: 'Adestra Junto',
    about: 'Adestramento em reforço positivo, com acompanhamento da família.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Butantã',
    ponto: [-46.7207, -23.5714],
    phoneE164: '+5511996667788',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e6',
        evidenceKind: 'phone_callback',
        aprovada: true,
      },
      {
        id: '0199c3a0-0000-7000-8000-0000000000e7',
        evidenceKind: 'document',
        aprovada: false,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d7',
    titularId: '0199c3a0-0000-7000-8000-0000000000a7',
    titularEmail: `pet.center.tatuape@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a7',
    slug: 'pet-center-tatuape',
    kind: 'clinic',
    displayName: 'Pet Center Tatuapé',
    about: 'Consultas, vacinas e cirurgias eletivas. Estacionamento próprio.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Tatuapé',
    ponto: [-46.5766, -23.5404],
    phoneE164: '+551129415500',
    crmvNumber: '40912',
    crmvUf: 'SP',
    cnpj: '41029384000155',
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000e8',
        evidenceKind: 'crmv',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d8',
    titularId: '0199c3a0-0000-7000-8000-0000000000a8',
    titularEmail: `tosa.da.ana@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a8',
    slug: 'tosa-da-ana-santo-andre',
    kind: 'groomer',
    displayName: 'Tosa da Ana',
    about: 'Tosa na tesoura, atendimento com hora marcada, um pet por vez.',
    city: 'Santo André',
    state: 'SP',
    neighborhood: 'Vila Assunção',
    ponto: [-46.5324, -23.6702],
    phoneE164: '+5511993332211',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'published',
    verificacoes: [],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d9',
    titularId: '0199c3a0-0000-7000-8000-0000000000a9',
    titularEmail: `sos.silvestres@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000a9',
    slug: 'sos-silvestres',
    kind: 'vet',
    displayName: 'SOS Silvestres',
    about: 'Atendimento de aves, répteis e pequenos mamíferos.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Lapa',
    ponto: null,
    phoneE164: '+551136778899',
    crmvNumber: '55130',
    crmvUf: 'SP',
    cnpj: null,
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000ea',
        evidenceKind: 'document',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000da',
    titularId: '0199c3a0-0000-7000-8000-0000000000aa',
    titularEmail: `hotel.quatro.patas@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000aa',
    slug: 'hotel-quatro-patas',
    kind: 'sitter',
    displayName: 'Hotel Quatro Patas',
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Moema',
    ponto: [-46.6664, -23.6021],
    phoneE164: '+551150553344',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'published',
    verificacoes: [
      {
        id: '0199c3a0-0000-7000-8000-0000000000eb',
        evidenceKind: 'phone_callback',
        aprovada: true,
      },
    ],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000db',
    titularId: '0199c3a0-0000-7000-8000-0000000000ab',
    titularEmail: `rascunho.nao.publicado@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000ab',
    slug: 'clinica-em-cadastro',
    kind: 'clinic',
    displayName: 'Clínica Em Cadastro (RASCUNHO — não pode aparecer)',
    about: 'Cadastro que ninguém terminou.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    ponto: [-46.6999, -23.5648],
    phoneE164: '+551130000000',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'draft',
    verificacoes: [],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000dc',
    titularId: '0199c3a0-0000-7000-8000-0000000000ac',
    titularEmail: `saiu.da.vitrine@${DOMINIO}`,
    titularPublicRef: 'QAmassaDiretorio0000ac',
    slug: 'banho-fechado-para-reforma',
    kind: 'groomer',
    displayName: 'Banho Fechado Para Reforma (OCULTO — não pode aparecer)',
    about: 'Pediu para sair da vitrine.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Vila Madalena',
    ponto: [-46.6901, -23.5548],
    phoneE164: '+5511900000000',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    status: 'hidden',
    verificacoes: [],
  },
];

/** As publicadas, que sao as que a secao `Perto` mostra. */
export const PUBLICADAS = MASSA_DO_DIRETORIO.filter((uma) => uma.status === 'published');
