/** A hora de parede: tantos dias a frente, aquela hora, na zona do encontro. */
export interface AncoraDeParede {
  readonly ancora: 'parede';
  /** Negativo e passado. Zero e hoje. */
  readonly diasAPartirDeHoje: number;
  /** `HH:MM`, a hora que o cartaz da praca diz. */
  readonly horaLocal: string;
  /** Nulo quando o encontro nao declara fim -- e ha encontro assim. */
  readonly duracaoEmMinutos: number | null;
}

/** O deslocamento a partir do relogio de quem olha. */
export interface AncoraDeInstante {
  readonly ancora: 'instante';
  /** Negativo comeca no passado recente, que e o que faz `happening` existir. */
  readonly comecaEmMinutos: number;
  readonly duracaoEmMinutos: number | null;
}

export type QuandoAcontece = AncoraDeParede | AncoraDeInstante;

export interface EncontroSemeado {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly placeName: string;
  readonly neighborhood: string;
  readonly city: string;
  /** Exatamente duas maiusculas -- o `CHECK` nao aceita outra coisa. */
  readonly state: string;
  readonly quando: QuandoAcontece;
  /** Nome IANA. Precisa EXISTIR no catalogo do Postgres, e nao so parecer um. */
  readonly timeZone: string;
  /** O ponto no mapa, ou nulo. */
  readonly ponto: PontoSemeado | null;
  /** `published` ou `removed`. */
  readonly publicationStatus: 'published' | 'removed';
  /** Os campos do item 17. Ausente vale o padrao da migracao. */
  readonly campos?: CamposSemeados;
}

/** Os campos do encontro (ADR-0027 item 17). */
export interface CamposSemeados {
  readonly visibility?: 'public' | 'private';
  readonly admission?: { readonly centavos: number; readonly unidade: 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people' } | null;
  readonly portes?: readonly ('P' | 'M' | 'G' | 'GG')[];
  readonly idade?: 'any' | 'from_4_months' | 'from_1_year' | 'up_to_1_year';
  readonly vacinacao?: boolean;
  readonly areaCercada?: boolean;
  readonly estrutura?: readonly string[];
  readonly paraLevar?: readonly string[];
  readonly observacoes?: string | null;
}

export interface CamposResolvidos {
  readonly visibility: 'public' | 'private';
  readonly admission: { readonly centavos: number; readonly unidade: 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people' } | null;
  readonly portes: readonly string[];
  readonly idade: string;
  readonly vacinacao: boolean;
  readonly areaCercada: boolean;
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly observacoes: string | null;
}

/** Os padroes da migracao (A.4.1), num lugar so. */
export function camposDe(encontro: EncontroSemeado): CamposResolvidos {
  const c = encontro.campos ?? {};
  return {
    visibility: c.visibility ?? 'public',
    admission: c.admission ?? null,
    portes: c.portes ?? ['P', 'M', 'G', 'GG'],
    idade: c.idade ?? 'any',
    vacinacao: c.vacinacao ?? true,
    areaCercada: c.areaCercada ?? false,
    estrutura: c.estrutura ?? [],
    paraLevar: c.paraLevar ?? [],
    observacoes: c.observacoes ?? null,
  };
}

/** Latitude e longitude em graus, na ordem em que as pessoas as escrevem. */
export interface PontoSemeado {
  readonly lat: number;
  readonly lon: number;
}

/** Instante fixo das contas de massa, copiado de `massa-do-diretorio.ts`. */
export const MOMENTO_DA_REDE = '2026-09-23T12:00:00.000Z';

/**
 * As tres zonas que a massa usa, e as tres EXISTEM no catalogo do Postgres -- o
 * gatilho `network_events_fuso_existe` recusa a linha se nao existirem.
 */
export const FUSOS_DA_REDE = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife'] as const;

export const MASSA_DA_REDE: readonly EncontroSemeado[] = [
  {
    slug: 'benedito-calixto-de-manha',
    title: 'Encontro de cães na Praça Benedito Calixto',
    summary: 'Sábado de manhã na feira, com água e sombra embaixo das árvores do lado da igreja.',
    placeName: 'Praça Benedito Calixto',
    neighborhood: 'Pinheiros',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 4, horaLocal: '09:00', duracaoEmMinutos: 180 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5634, lon: -46.6821 },
    publicationStatus: 'published',
    campos: {
      admission: { centavos: 1500, unidade: 'per_dog' },
      estrutura: ['shade', 'benches', 'public_restroom_nearby'],
      paraLevar: ['water', 'water_bowl', 'leash', 'poop_bags'],
    },
  },
  {
    slug: 'caminhada-no-ibirapuera',
    title: 'Caminhada coletiva com cães de porte grande no Parque Ibirapuera, com veterinária',
    summary: 'Saída pelo portão 7, ritmo lento, três paradas para água. Coleira curta obrigatória.',
    placeName: 'Parque Ibirapuera — Portão 7',
    neighborhood: 'Moema',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 10, horaLocal: '15:30', duracaoEmMinutos: 120 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5874, lon: -46.6576 },
    publicationStatus: 'published',
    campos: {
      portes: ['G', 'GG'],
      idade: 'from_1_year',
      paraLevar: ['water', 'leash', 'vaccination_card'],
    },
  },
  {
    slug: 'tarde-no-jardim-botanico',
    title: 'Tarde no Jardim Botânico',
    summary: 'Encontro aberto, sem hora para acabar. Leve saquinho.',
    placeName: 'Jardim Botânico de Curitiba',
    neighborhood: 'Jardim Botânico',
    city: 'Curitiba',
    state: 'PR',
    quando: { ancora: 'parede', diasAPartirDeHoje: 11, horaLocal: '14:00', duracaoEmMinutos: null },
    timeZone: 'America/Sao_Paulo',
    ponto: null,
    publicationStatus: 'published',
  },
  {
    slug: 'agora-na-praca-da-liberdade',
    title: 'Cãominhada na Praça da Liberdade',
    summary: 'Roda de conversa sobre adoção responsável no coreto, com a ONG Patas de BH.',
    placeName: 'Praça da Liberdade',
    neighborhood: 'Funcionários',
    city: 'Belo Horizonte',
    state: 'MG',
    quando: { ancora: 'instante', comecaEmMinutos: -45, duracaoEmMinutos: 180 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -19.932, lon: -43.938 },
    publicationStatus: 'published',
  },
  {
    slug: 'feira-de-adocao-de-sabado',
    title: 'Feira de adoção na Praça Roosevelt',
    summary: 'Dezoito animais em adoção, com cadastro e entrevista no local. Choveu e foi assim mesmo.',
    placeName: 'Praça Roosevelt',
    neighborhood: 'Consolação',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: -9, horaLocal: '10:00', duracaoEmMinutos: 300 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5486, lon: -46.6461 },
    publicationStatus: 'published',
  },
  {
    slug: 'fim-de-tarde-na-orla-recife',
    title: 'Fim de tarde na orla de Boa Viagem',
    summary: 'Ponto de encontro no quiosque do segundo jardim. Maré baixa, areia firme para correr.',
    placeName: 'Orla de Boa Viagem — segundo jardim',
    neighborhood: 'Boa Viagem',
    city: 'Recife',
    state: 'PE',
    quando: { ancora: 'instante', comecaEmMinutos: 300, duracaoEmMinutos: 150 },
    timeZone: 'America/Recife',
    ponto: { lat: -8.1197, lon: -34.8979 },
    publicationStatus: 'published',
  },
  {
    slug: 'encontro-do-mindu-em-manaus',
    title:
      'Encontro mensal de tutores de cães e gatos do Parque Municipal do Mindu com roda de conversa e feira de adoção',
    summary:
      'Roda de conversa sobre calor, carrapato e hidratação na Amazônia, feira de adoção com a ONG '
      + 'local, pesagem gratuita e orientação sobre vermífugo para quem levar a carteira do pet.',
    placeName: 'Parque Municipal do Mindu, entrada da Avenida Bispo Pedro Massa, portão de baixo',
    neighborhood: 'Parque Dez de Novembro',
    city: 'Manaus',
    state: 'AM',
    quando: { ancora: 'parede', diasAPartirDeHoje: 14, horaLocal: '08:00', duracaoEmMinutos: 240 },
    timeZone: 'America/Manaus',
    ponto: null,
    publicationStatus: 'published',
  },
  {
    slug: 'encontro-de-gatos-em-santos',
    title: 'Encontro de tutores de gatos',
    summary: 'Sem os gatos, que odeiam isso. Conversa sobre telagem de janela e castração.',
    placeName: 'Jardim da Orla — canteiro 12',
    neighborhood: 'Gonzaga',
    city: 'Santos',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 18, horaLocal: '17:00', duracaoEmMinutos: 90 },
    timeZone: 'America/Sao_Paulo',
    ponto: null,
    publicationStatus: 'published',
    campos: { vacinacao: false },
  },
  {
    slug: 'passeio-noturno-redencao',
    title: 'Passeio noturno no Parque da Redenção',
    summary: 'Saída às 19h pelo monumento. Leve coleira com refletivo — o parque é escuro depois da ponte.',
    placeName: 'Parque Farroupilha (Redenção)',
    neighborhood: 'Bom Fim',
    city: 'Porto Alegre',
    state: 'RS',
    quando: { ancora: 'parede', diasAPartirDeHoje: 25, horaLocal: '19:00', duracaoEmMinutos: null },
    timeZone: 'America/Sao_Paulo',
    ponto: null,
    publicationStatus: 'published',
  },
  {
    slug: 'piquenique-na-villa-lobos',
    title: 'Piquenique no Villa-Lobos',
    summary: 'Cada um leva o seu. Sombra na quadra de areia, do lado do bicicletário.',
    placeName: 'Parque Villa-Lobos',
    neighborhood: 'Alto de Pinheiros',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 6, horaLocal: '11:00', duracaoEmMinutos: 210 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5466, lon: -46.7236 },
    publicationStatus: 'published',
    campos: {
      areaCercada: true,
      estrutura: ['level_ground_or_ramp', 'accessible_restroom', 'shade', 'dog_water_fountain', 'parking_nearby'],
      paraLevar: ['treats', 'towel', 'toy'],
      observacoes: 'Chegue pelo portao principal; a area cercada fica logo depois do bicicletario.',
    },
  },

  {
    slug: 'p-7k2m9x4qd3',
    title: 'Encontro fechado de cães reativos',
    summary: 'Grupo pequeno com adestradora, distância entre os cães e entrada escalonada.',
    placeName: 'Praça Buenos Aires',
    neighborhood: 'Higienópolis',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 5, horaLocal: '08:00', duracaoEmMinutos: 90 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5462, lon: -46.6581 },
    publicationStatus: 'published',
    campos: {
      visibility: 'private',
      admission: { centavos: 3000, unidade: 'per_pair' },
      portes: ['M', 'G'],
      estrutura: ['shade'],
      paraLevar: ['leash', 'treats'],
      observacoes: 'Chegue no horario marcado para a sua dupla; a adestradora organiza a entrada.',
    },
  },
  {
    slug: 'p-q8w3n5z1ty',
    title: 'Aniversário do Pipoca',
    summary: 'Festa de aniversário de um vira-lata do bairro, com bolo para cães.',
    placeName: 'Parque da Aclimação',
    neighborhood: 'Aclimação',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 12, horaLocal: '16:00', duracaoEmMinutos: 120 },
    timeZone: 'America/Sao_Paulo',
    ponto: null,
    publicationStatus: 'published',
    campos: { visibility: 'private', paraLevar: ['toy'] },
  },

  {
    slug: 'encontro-retirado-do-mes',
    title: 'Encontro retirado da agenda',
    summary: 'Saiu da agenda e continua na tabela, marcado como retirado. Nenhuma leitura o mostra.',
    placeName: 'Praça Vilaboim',
    neighborhood: 'Higienópolis',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 8, horaLocal: '10:00', duracaoEmMinutos: 120 },
    timeZone: 'America/Sao_Paulo',
    ponto: { lat: -23.5445, lon: -46.6579 },
    publicationStatus: 'removed',
  },
];

/** Os encontros que a agenda de fato mostra: os publicados. */
export const ENCONTROS_VISIVEIS: readonly EncontroSemeado[] = MASSA_DA_REDE.filter(
  (encontro) => encontro.publicationStatus === 'published',
);

/** Os encontros privados visiveis. */
export const ENCONTROS_PRIVADOS: readonly EncontroSemeado[] = ENCONTROS_VISIVEIS.filter(
  (encontro) => camposDe(encontro).visibility === 'private',
);

/** Os encontros visiveis que tem ponto no mapa. */
export const ENCONTROS_COM_PONTO: readonly EncontroSemeado[] = ENCONTROS_VISIVEIS.filter(
  (encontro) => encontro.ponto !== null,
);

const MINUTO = 60_000;
const DIA_EM_MS = 86_400_000;

/** A data civil do encontro, a partir do deslocamento em dias. */
export function dataCivilDoEncontro(diasAPartirDeHoje: number, hoje: Date): string {
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const alvo = new Date(base + diasAPartirDeHoje * DIA_EM_MS);
  const ano = String(alvo.getUTCFullYear()).padStart(4, '0');
  const mes = String(alvo.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(alvo.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** O texto `YYYY-MM-DD HH:MM:SS` de um instante, em UTC. */
function comoTimestampUtc(quando: Date): string {
  return `${quando.toISOString().slice(0, 19).replace('T', ' ')}`;
}

/**
 * Como o instante de um encontro e montado, em uma estrutura que o `seed.ts` so
 * precisa despejar no `INSERT`.
 */
export interface MomentoDoEncontro {
  readonly inicioLocal: string;
  readonly fimLocal: string | null;
  /** A zona em que os dois textos acima devem ser lidos pelo Postgres. */
  readonly zonaDeLeitura: string;
}

export function momentoDoEncontro(encontro: EncontroSemeado, hoje: Date): MomentoDoEncontro {
  if (encontro.quando.ancora === 'parede') {
    const data = dataCivilDoEncontro(encontro.quando.diasAPartirDeHoje, hoje);
    const inicioLocal = `${data} ${encontro.quando.horaLocal}:00`;
    if (encontro.quando.duracaoEmMinutos === null) {
      return { inicioLocal, fimLocal: null, zonaDeLeitura: encontro.timeZone };
    }
    const ingenuo = new Date(`${inicioLocal}Z`);
    const fim = new Date(ingenuo.getTime() + encontro.quando.duracaoEmMinutos * MINUTO);
    return {
      inicioLocal,
      fimLocal: comoTimestampUtc(fim),
      zonaDeLeitura: encontro.timeZone,
    };
  }

  const inicio = new Date(hoje.getTime() + encontro.quando.comecaEmMinutos * MINUTO);
  const fim =
    encontro.quando.duracaoEmMinutos === null
      ? null
      : new Date(inicio.getTime() + encontro.quando.duracaoEmMinutos * MINUTO);
  return {
    inicioLocal: comoTimestampUtc(inicio),
    fimLocal: fim === null ? null : comoTimestampUtc(fim),
    zonaDeLeitura: 'UTC',
  };
}
