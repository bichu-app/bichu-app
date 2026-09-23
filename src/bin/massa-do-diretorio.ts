/**
 * A massa fixa do diretorio de `Perto`: doze entradas, dez publicadas.
 *
 * ## Por que ela mora num arquivo proprio, e nao dentro de `seed.ts`
 *
 * `seed.ts` e o MECANISMO -- as tres travas (ambiente, esquema, determinismo) e
 * a gravacao. Isto e o CONTEUDO. Separar permite que o conteudo seja lido por
 * um teste sem subir banco: as regras que a massa precisa respeitar (nenhum
 * slug repetido, nenhuma entrada publicada sem lugar, variedade de niveis) sao
 * afirmaveis sobre este arquivo, e `massa-do-diretorio.test.ts` as afirma.
 *
 * ## O que ela e, e o que ela nao e
 *
 * Ela existe para o cliente **julgar o visual** da secao. Por isso a variedade
 * importa mais que o volume, e cada entrada abaixo cobre um caso de desenho que
 * uma lista homogenea esconderia:
 *
 * - um nome longo que quebra em duas linhas, e um nome curtissimo ao lado;
 * - uma entrada **sem telefone** -- a tela precisa saber desenhar o cartao sem
 *   botao de ligar;
 * - uma entrada **sem apresentacao**, e uma com apresentacao longa;
 * - uma entrada **sem coordenada**, que e o caso real de hoje: ninguem escreve
 *   `geo` porque nao ha painel. Ela aparece por ultimo, com distancia nula;
 * - os tres niveis de verificacao, `none` inclusive, porque `none` e estado
 *   legitimo e publicavel (passeador e tosa nao tem conselho);
 * - as seis atividades que `professionals.kind` admite;
 * - um `draft` e um `hidden`, que **nunca** podem aparecer. Eles nao sao enfeite:
 *   sao o que da o que medir a isca do filtro.
 *
 * ## O que ela NAO promete, porque o banco nao tem onde guardar
 *
 * Horario de funcionamento, rua e numero, foto ou logotipo, site, e-mail, redes
 * sociais, lista de servicos, faixa de preco e avaliacoes. Nenhum desses tem
 * coluna em `professionals`, e inventar o campo na massa faria a tela ser
 * desenhada em cima de dado que a rota nunca vai devolver. O que existe e o que
 * esta abaixo.
 *
 * ## Determinismo
 *
 * `make seed` recria "a massa fixa de qa, deterministica". Todo identificador e
 * literal, todo instante e literal. Nada de `Math.random()` nem de `now()`: uma
 * massa que muda faz o mesmo teste passar hoje e falhar amanha, e a investigacao
 * comeca pelo teste, que esta certo.
 *
 * Os UUIDs sao v7 com o mesmo carimbo de tempo e sufixo sequencial -- validos
 * pela forma e reconheciveis de olho quando aparecem num log.
 */
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
  readonly slug: string;
  readonly kind: TipoDeProfissional;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  /** `[lon, lat]`, na ORDEM DE `ST_MakePoint`. Nulo quando nao ha ponto. */
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
    slug: 'clinica-veterinaria-santa-barbara',
    kind: 'clinic',
    // NOME LONGO DE PROPOSITO: 61 caracteres, quebra em duas linhas no cartao.
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
    slug: 'vet-lu',
    kind: 'vet',
    // NOME CURTISSIMO, ao lado do longo: seis caracteres.
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
    slug: 'banho-do-bairro',
    kind: 'groomer',
    displayName: 'Banho do Bairro',
    about: 'Banho, tosa higiênica e hidratação. Sem gaiola de secagem.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Pinheiros',
    ponto: [-46.7012, -23.5669],
    // SEM TELEFONE: a tela precisa saber desenhar o cartao sem botao de ligar.
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
    slug: 'passeios-do-rodrigo',
    kind: 'walker',
    displayName: 'Passeios do Rodrigo',
    // SEM APRESENTACAO: o cartao precisa fechar sem o paragrafo.
    about: null,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Perdizes',
    ponto: [-46.6822, -23.5372],
    phoneE164: '+5511991234567',
    crmvNumber: null,
    crmvUf: null,
    cnpj: null,
    // NAO VERIFICADO, e publicado assim mesmo: passeador nao tem conselho e
    // `none` e estado legitimo. E o cartao sem selo, que a tela precisa ter.
    status: 'published',
    verificacoes: [],
  },
  {
    id: '0199c3a0-0000-7000-8000-0000000000d5',
    titularId: '0199c3a0-0000-7000-8000-0000000000a5',
    titularEmail: `casa.do.miau@${DOMINIO}`,
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
      // PENDENTE: nao conta, e e por isso que ela esta aqui. O nivel desta
      // entrada precisa sair `contact_verified` e nao `document_verified`.
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
    slug: 'pet-center-tatuape',
    kind: 'clinic',
    displayName: 'Pet Center Tatuapé',
    about: 'Consultas, vacinas e cirurgias eletivas. Estacionamento próprio.',
    city: 'São Paulo',
    state: 'SP',
    // BAIRRO DISTANTE dos demais: uns 11 km da Paulista, para a ordenacao por
    // distancia ter o que ordenar em vez de empatar tudo no mesmo quarteirao.
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
    slug: 'tosa-da-ana-santo-andre',
    kind: 'groomer',
    displayName: 'Tosa da Ana',
    about: 'Tosa na tesoura, atendimento com hora marcada, um pet por vez.',
    // OUTRA CIDADE: para o filtro por cidade ter o que deixar de fora.
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
    slug: 'sos-silvestres',
    kind: 'vet',
    displayName: 'SOS Silvestres',
    about: 'Atendimento de aves, répteis e pequenos mamíferos.',
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Lapa',
    // SEM COORDENADA, e este e o caso REAL de hoje: ninguem escreve `geo`
    // porque nao existe painel de cadastro. Ela precisa aparecer na lista, por
    // ultimo, com distancia nula -- e nao sumir.
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
  // ---------------------------------------------------------------------
  // As duas que NUNCA podem aparecer. Elas sao o que da o que medir a isca.
  // ---------------------------------------------------------------------
  {
    id: '0199c3a0-0000-7000-8000-0000000000db',
    titularId: '0199c3a0-0000-7000-8000-0000000000ab',
    titularEmail: `rascunho.nao.publicado@${DOMINIO}`,
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

/** As publicadas, que sao as que a secao `Perto` mostra. Dez. */
export const PUBLICADAS = MASSA_DO_DIRETORIO.filter((uma) => uma.status === 'published');
