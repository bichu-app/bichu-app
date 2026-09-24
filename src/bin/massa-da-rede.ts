/**
 * A massa fixa da secao `Rede`: onze encontros.
 *
 * ## Por que ela mora num arquivo proprio
 *
 * Mesma razao de `massa-do-diretorio.ts` e de `massa-da-vitrine.ts`: `seed.ts`
 * e o MECANISMO e isto e o CONTEUDO. Separar permite que as regras que a massa
 * precisa respeitar sejam afirmaveis por um teste sem subir banco, e
 * `massa-da-rede.test.ts` as afirma -- inclusive os tetos dos `CHECK`.
 *
 * ## O que ela e: material para o cliente JULGAR O VISUAL
 *
 * Cada encontro abaixo cobre **um caso que muda o desenho**:
 *
 * - titulo curto ao lado de um que **quebra em duas linhas** e do que encosta
 *   no teto de 120;
 * - encontros **com e sem capa**;
 * - encontros **com e sem ponto no mapa** (ADR-0027 12.8): a tela do encontro,
 *   com conta, desenha o mapa quando ha ponto e so os rotulos quando nao ha;
 * - **hoje, semana que vem e ja passado**, e um **ACONTECENDO AGORA**;
 * - acento e cedilha em toda parte;
 * - **seis cidades e tres fusos**;
 * - **o caso feio**: `encontro-do-mindu-em-manaus` junta titulo, resumo e nome
 *   de lugar nos tetos, bairro comprido, nenhuma capa e nenhum ponto.
 *
 * ## O que NAO esta aqui
 *
 * **Nenhuma pessoa e nenhum pet.** Check-in e galeria sairam desta versao
 * (ADR-0027 12.4), e com eles os tutores e as fotos que esta massa semeava. O
 * desenho anterior esta na branch `guarda/rede-checkin-galeria`.
 *
 * **Nenhum encontro cancelado.** O aplicativo emendado ainda nao escreve o
 * rotulo `cancelled`: um cancelado na massa apareceria na tela de QA como um
 * encontro normal, que e o engano que o rotulo existe para impedir. O estado e
 * coberto pelos testes de dominio, de rota e de integracao.
 *
 * ## O ponto e SEMPRE de lugar publico
 *
 * Os pontos abaixo sao de pracas, parques e orlas, e nunca de endereco de
 * alguem (ADR-0027 secao 13). Vale tambem para massa: um ponto de massa copiado
 * para um ambiente de demonstracao continua sendo um ponto no mapa.
 *
 * ## As capas apontam para `.example`, e de proposito
 *
 * `.example` e reservado pela RFC 2606 e nao resolve em lugar nenhum, como os
 * parceiros da massa da `Loja`. Um host real em `src/` e achado do portao de
 * portabilidade (`docs/07-devops.md` 3.6), e a capa desta fatia e so para o
 * cartao se desenhar com e sem imagem.
 *
 * ## AS DATAS SAO CALCULADAS, E NUNCA LITERAIS
 *
 * Com datas literais a massa INTEIRA vira passado sozinha em poucas semanas.
 * Cada encontro guarda um DESLOCAMENTO, e o instante sai dele e de um
 * `hoje: Date` injetado, exatamente como `semearVitrine(db, hoje)` faz.
 *
 * ## O FUSO, E COMO O INSTANTE E MONTADO
 *
 * **A conversao e feita pelo POSTGRES, com `::timestamp AT TIME ZONE <zona>`.**
 * A massa produz o texto da hora de parede e o nome IANA, e o banco resolve o
 * deslocamento: o catalogo de zonas ja e a autoridade (o gatilho
 * `network_events_fuso_existe` o consulta), e fazer a conta em JavaScript seria
 * reimplementar horario de verao.
 *
 * ### As duas ancoras, e por que existem duas
 *
 * A maioria dos encontros e ancorada na PAREDE: tantos dias a frente, aquela
 * hora, naquela zona. Dois sao ancorados no INSTANTE, porque o estado
 * `happening` so existe entre `starts_at` e `ends_at`, e uma hora de parede
 * fixa nao consegue prometer que o relogio de quem abrir a tela vai cair dentro
 * da janela.
 */

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

/** O deslocamento a partir do relogio de quem olha. Ver "as duas ancoras". */
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
  readonly coverImageUrl: string | null;
  /**
   * O ponto no mapa, ou nulo. Sempre de lugar publico (ADR-0027 secao 13), e a
   * origem e sempre `map_pin`: e o ponto que o administrador tocaria no mapa.
   */
  readonly ponto: PontoSemeado | null;
  /**
   * `published` ou `removed`. Nao ha `draft` (ADR-0027 12.9), e nao ha
   * cancelado na massa -- ver o cabecalho.
   */
  readonly publicationStatus: 'published' | 'removed';
}

/** Latitude e longitude em graus, na ordem em que as pessoas as escrevem. */
export interface PontoSemeado {
  readonly lat: number;
  readonly lon: number;
}

/** Instante fixo das contas de massa, copiado de `massa-do-diretorio.ts`. */
export const MOMENTO_DA_REDE = '2026-09-23T12:00:00.000Z';

/**
 * As tres zonas que a massa usa, e as tres EXISTEM no catalogo do Postgres --
 * o gatilho `network_events_fuso_existe` recusa a linha se nao existirem.
 *
 * Tres e de proposito: `America/Manaus` e `America/Recife` tem deslocamento
 * diferente do de `America/Sao_Paulo`, entao um cartao renderizado com o fuso
 * do aparelho em vez do fuso do encontro mostra a hora errada em pelo menos
 * dois cartoes desta massa. Com uma zona so, o defeito nao teria como aparecer.
 */
export const FUSOS_DA_REDE = ['America/Sao_Paulo', 'America/Manaus', 'America/Recife'] as const;

export const MASSA_DA_REDE: readonly EncontroSemeado[] = [
  // 1. SEMANA QUE VEM, capa e PONTO NO MAPA. O cartao mais completo que a
  //    secao produz, e e ele que da a medida dos outros.
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
    coverImageUrl: 'https://midia.bichu.example/rede/benedito-calixto.jpg',
    ponto: { lat: -23.5634, lon: -46.6821 },
    publicationStatus: 'published',
  },
  // 2. TITULO QUE QUEBRA EM DUAS LINHAS, capa e ponto.
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
    coverImageUrl: 'https://midia.bichu.example/rede/ibirapuera-portao-7.jpg',
    ponto: { lat: -23.5874, lon: -46.6576 },
    publicationStatus: 'published',
  },
  // 3. SEM CAPA, SEM PONTO e SEM FIM DECLARADO. Tres ausencias no mesmo
  //    cartao, e nenhuma delas e defeito. A tela do encontro, com conta,
  //    mostra os rotulos e nao mostra mapa.
  //
  //    Segunda cidade e segundo estado da massa: e daqui que o filtro de cidade
  //    tira o que filtrar.
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
    coverImageUrl: null,
    ponto: null,
    publicationStatus: 'published',
  },
  // 4. ACONTECENDO AGORA. Comecou ha 45 minutos e termina daqui a duas horas e
  //    quinze, entao `status` sai `happening` para quem abrir a tela em
  //    qualquer momento das proximas duas horas.
  //
  //    Ancorado no INSTANTE e nao na parede, e o cabecalho explica por que: com
  //    hora de parede fixa, quem semeasse as 20h nao veria nenhum encontro
  //    acontecendo, e o estado `happening` ficaria sem ninguem olhando.
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
    coverImageUrl: 'https://midia.bichu.example/rede/praca-da-liberdade.jpg',
    ponto: { lat: -19.932, lon: -43.938 },
    publicationStatus: 'published',
  },
  // 5. JA PASSOU: nove dias atras. `status` sai `ended` e a tela escreve
  //    `Encerrado` junto da data. Sem ele, o unico estado que a secao calcula
  //    no servidor nunca seria visto por olho humano -- e o motivo de calcular
  //    no servidor e justamente que o aparelho erraria este.
  //
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
    coverImageUrl: 'https://midia.bichu.example/rede/roosevelt-adocao.jpg',
    ponto: { lat: -23.5486, lon: -46.6461 },
    publicationStatus: 'published',
  },
  // 6. HOJE, MAIS TARDE. Tambem ancorado no instante, pela mesma razao do 4: um
  //    cartaz marcado para as 18h ja teria passado para quem semeia as 19h, e
  //    "hoje" e a linha que a agenda abre.
  //
  //    **Fuso diferente** (`America/Recife`, sem o deslocamento de Sao Paulo):
  //    o cartao precisa escrever a hora de LA. Terceira cidade, terceiro estado.
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
    coverImageUrl: null,
    ponto: { lat: -8.1197, lon: -34.8979 },
    publicationStatus: 'published',
  },
  // 7. **O CASO FEIO, e ele e deliberado.**
  //
  //    Titulo ENCOSTADO no teto de 120, resumo ENCOSTADO no teto de 180, nome
  //    de lugar ENCOSTADO no teto de 80, bairro comprido, nenhuma capa e
  //    nenhum ponto. E o pior cartao que esta secao consegue
  //    produzir: se o desenho aguenta este, aguenta os outros dez.
  //
  //    Os tetos sao cobrados por `massa-da-rede.test.ts` em segundos, e pelo
  //    banco na hora de inserir. A `Loja` descobriu o dela do jeito caro.
  //
  //    `America/Manaus` e a terceira zona: uma hora a menos que Sao Paulo o ano
  //    inteiro, e e esse o cartao em que a hora renderizada com o fuso do
  //    aparelho aparece errada.
  {
    slug: 'encontro-do-mindu-em-manaus',
    title:
      'Encontro mensal de tutores de cães e gatos do Parque Municipal do Mindu com roda de conversa e feira de adoção',
    // 179 de 180 e 80 de 80, MEDIDOS e nao estimados. A primeira versao deste
    // encontro dizia "encostado no teto" e tinha 195 e 81: os dois passariam
    // pelo TypeScript e morreriam no `INSERT`, que e exatamente como a `Loja`
    // descobriu o caso feio dela (183 contra um `CHECK` de 180).
    summary:
      'Roda de conversa sobre calor, carrapato e hidratação na Amazônia, feira de adoção com a ONG '
      + 'local, pesagem gratuita e orientação sobre vermífugo para quem levar a carteira do pet.',
    placeName: 'Parque Municipal do Mindu, entrada da Avenida Bispo Pedro Massa, portão de baixo',
    neighborhood: 'Parque Dez de Novembro',
    city: 'Manaus',
    state: 'AM',
    quando: { ancora: 'parede', diasAPartirDeHoje: 14, horaLocal: '08:00', duracaoEmMinutos: 240 },
    timeZone: 'America/Manaus',
    coverImageUrl: null,
    ponto: null,
    publicationStatus: 'published',
  },
  // 8. Titulo curto com capa e sem ponto.
  //
  //    Quarta cidade. Gato e de proposito: a `Rede` nao e so de cachorro, e um
  //    cartao inteiro de gato e a unica forma de isso aparecer na tela.
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
    coverImageUrl: 'https://midia.bichu.example/rede/orla-de-santos.jpg',
    ponto: null,
    publicationStatus: 'published',
  },
  // 9. SEM CAPA, SEM PONTO e SEM FIM DECLARADO, um mes a frente. O encontro distante e o que testa a ordenacao: com `when=upcoming`
  //    ele e o ultimo da lista, e com `sort=recentes` ele e o primeiro.
  //
  //    Quinta cidade, e a mais ao sul.
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
    coverImageUrl: null,
    ponto: null,
    publicationStatus: 'published',
  },
  // 10. Capa e ponto, no fim de semana que vem.
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
    coverImageUrl: 'https://midia.bichu.example/rede/villa-lobos.jpg',
    ponto: { lat: -23.5466, lon: -46.7236 },
    publicationStatus: 'published',
  },

  // ------------------------------------------------------------------
  // O que NUNCA aparece. Ele e o que da o que medir o filtro de visibilidade.
  // ------------------------------------------------------------------
  //
  // Uma massa so com encontros visiveis faria o caso "encontro retirado nao
  // aparece" passar contra uma consulta que nunca filtrou nada -- foi assim que
  // a BICHUS-91 passou 1037 casos com `revogarDoDono` virado num `no-op`.
  //
  // Ele e FUTURO de proposito: se fosse passado, o filtro `when=upcoming`
  // sozinho o esconderia e o de `publication_status` continuaria sem ser
  // exercido. E TEM PONTO de proposito: e o caso em que o `location` precisa
  // responder 404 e nao devolver o ponto de um encontro retirado.
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
    coverImageUrl: null,
    ponto: { lat: -23.5445, lon: -46.6579 },
    publicationStatus: 'removed',
  },
];

/** Os encontros que a agenda de fato mostra: os publicados. */
export const ENCONTROS_VISIVEIS: readonly EncontroSemeado[] = MASSA_DA_REDE.filter(
  (encontro) => encontro.publicationStatus === 'published',
);

/** Os encontros visiveis que tem ponto no mapa. */
export const ENCONTROS_COM_PONTO: readonly EncontroSemeado[] = ENCONTROS_VISIVEIS.filter(
  (encontro) => encontro.ponto !== null,
);

const MINUTO = 60_000;
const DIA_EM_MS = 86_400_000;

/**
 * A data civil do encontro, a partir do deslocamento em dias.
 *
 * Em UTC, e o motivo e o mesmo de `dataDaConsulta` no `seed.ts`: somar dias
 * sobre um `Date` no fuso local faz a data virar o dia anterior em fuso
 * negativo, e o deslocamento inteiro andaria um dia em silencio. Aqui ela e
 * **data civil e nao instante** -- o instante sai dela mais a hora de parede,
 * e quem resolve o deslocamento e o Postgres.
 */
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
 * Como o instante de um encontro e montado, em uma estrutura que o `seed.ts`
 * so precisa despejar no `INSERT`.
 *
 * Os dois casos devolvem a MESMA forma -- um texto e a zona em que ele deve ser
 * lido --, e e o `seed.ts` que faz `::timestamp AT TIME ZONE <zona>`. Com a
 * ancora de instante a zona e `UTC`, porque ali o texto ja e o instante
 * absoluto e nao a hora de parede: converter de novo o moveria.
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
    // Aritmetica sobre a hora de PAREDE, e nao sobre o instante: "das 9h as
    // 12h" e o que o cartaz diz, e e assim que quem esta na praca le. A
    // conversao para instante vem depois, no banco, uma vez so.
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
    // O texto acima JA e o instante absoluto. Le-lo na zona do encontro o
    // deslocaria de tres horas, e o encontro "acontecendo agora" deixaria de
    // acontecer agora.
    zonaDeLeitura: 'UTC',
  };
}
