/**
 * A massa fixa da secao `Rede`: onze encontros, seis tutores e uma galeria.
 *
 * ## Por que ela mora num arquivo proprio
 *
 * Mesma razao de `massa-do-diretorio.ts` e de `massa-da-vitrine.ts`: `seed.ts`
 * e o MECANISMO e isto e o CONTEUDO. Separar permite que as regras que a massa
 * precisa respeitar sejam afirmaveis por um teste sem subir banco, e
 * `massa-da-rede.test.ts` as afirma -- inclusive os tetos dos `CHECK`, que na
 * `Loja` so apareceram ao inserir num Postgres de verdade (o resumo do "caso
 * feio" tinha 183 caracteres contra um teto de 180).
 *
 * ## O que ela e: material para o cliente JULGAR O VISUAL
 *
 * O pedido foi literal: *"voce pode fazer um cadastro diretamente no banco de
 * dados para ver como ficou o visual dessa parte"*. Entao ela existe para ser
 * OLHADA, e nao para provar que a consulta funciona.
 *
 * Onze linhas iguais com sufixo numerico atenderiam a contagem e nao mostrariam
 * nada. Cada encontro abaixo cobre **um caso que muda o desenho**:
 *
 * - titulo curto ao lado de um que **quebra em duas linhas** e do que encosta
 *   no teto de 120;
 * - encontros **com e sem capa** -- o cartao precisa saber se desenhar sem ela,
 *   e a ausencia e estado normal e nao lacuna;
 * - galeria **cheia**, **com uma foto so** e **vazia**;
 * - **muitas presencas**, **uma** e **nenhuma**, porque `checkin_count` e o
 *   unico numero da secao e o zero e o caso que ninguem desenha;
 * - **hoje, semana que vem e ja passado**, e um **ACONTECENDO AGORA**, para o
 *   estado `happening` ter o que mostrar;
 * - acento e cedilha em toda parte (`Praca` vira `Praça`, `Sao Paulo` vira
 *   `São Paulo`), que e onde fonte e quebra de linha costumam falhar;
 * - **seis cidades e tres fusos**, para o filtro de cidade ter o que filtrar e
 *   para a hora de parede de `America/Manaus` e `America/Recife` divergir da de
 *   `America/Sao_Paulo` na tela;
 * - **o caso feio**, e ele e deliberado: `encontro-do-mindu-em-manaus` junta
 *   titulo no teto de 120, resumo no teto de 180, nome de lugar no teto de 80,
 *   bairro comprido, nenhuma capa, galeria vazia e nenhuma presenca. E o pior
 *   cartao que a `Rede` consegue produzir, e e para isso que serve olhar.
 *
 * ## O que NAO esta aqui, e a ausencia e a decisao
 *
 * **Nao ha pet em lugar nenhum desta massa.** `network_event_checkins` nao tem
 * `pet_id` (ADR-0025 decisao 1), entao nao ha o que semear: o check-in e da
 * PESSOA. A massa nao contorna isso guardando o pet noutro canto -- dado que
 * nao pode sair nao deve ser guardado.
 *
 * A coluna que guarda QUEM ENVIOU a foto tambem nao aparece nesta massa, e por
 * duas razoes independentes. De produto: a galeria desta fatia e curada, e foto
 * curada nao tem remetente. De portao: essa coluna leva a marca de saida na
 * migracao, e o portao de colunas varre `src/` atras do nome dela, inclusive em
 * comentario. A isca de integracao monta a propria foto COM remetente, em
 * `tests/`, que o portao nao varre -- e e la que o campo precisa estar
 * preenchido para a prova valer.
 *
 * ## AS DATAS SAO CALCULADAS, E NUNCA LITERAIS
 *
 * Mesmo motivo do `price_checked_at` da vitrine, e aqui ele e pior: com datas
 * literais a massa INTEIRA vira passado sozinha em poucas semanas, e a tela de
 * QA passa a mostrar so `Encerrado` nos onze cartoes, sem ninguem ter mexido em
 * nada. O que precisa ser preservado e a RELACAO -- um passado, um agora, um
 * hoje mais tarde e varios futuros --, e e a relacao que o deslocamento
 * preserva.
 *
 * Entao cada encontro guarda um DESLOCAMENTO, e o instante sai dele e de um
 * `hoje: Date` injetado, exatamente como `semearVitrine(db, hoje)` faz.
 *
 * ## O FUSO, E COMO O INSTANTE E MONTADO
 *
 * Um encontro marcado para "sabado as 9h em Sao Paulo" e **hora de parede**: o
 * cartaz da praca diz 9h, e quem le esta na praca. `starts_at` e `timestamptz`,
 * que e instante absoluto -- os dois precisam casar, e casar de um jeito que
 * nao dependa de o processo que semeia estar no fuso certo.
 *
 * **A conversao e feita pelo POSTGRES, com `::timestamp AT TIME ZONE <zona>`.**
 * A massa produz o texto da hora de parede (`'2026-09-27 09:00:00'`) e o nome
 * IANA, e o banco resolve o deslocamento. Duas razoes, e a segunda e a que
 * decide:
 *
 * 1. **O catalogo de zonas ja e a autoridade aqui.** O gatilho
 *    `network_events_fuso_existe` recusa a linha consultando
 *    `pg_timezone_names`. Montar o instante em JavaScript faria a massa
 *    responder a uma tabela de fusos e o banco a outra.
 * 2. **Fazer a conta em JavaScript seria reimplementar horario de verao.** O
 *    Brasil nao tem hoje, mas ja teve e a `America/Manaus` nunca teve --
 *    somar `-03:00` a mao e escrever uma regra que envelhece em silencio, que
 *    e o defeito que o proprio `time_zone` existe para impedir.
 *
 * ### As duas ancoras, e por que existem duas
 *
 * A maioria dos encontros e ancorada na PAREDE (`{ ancora: 'parede' }`): tantos
 * dias a frente, aquela hora, naquela zona. E como um cartaz e escrito.
 *
 * Dois sao ancorados no INSTANTE (`{ ancora: 'instante' }`), e a excecao tem
 * razao: o estado `happening` so existe entre `starts_at` e `ends_at`, e uma
 * hora de parede fixa **nao consegue prometer** que o relogio de quem abrir a
 * tela vai cair dentro da janela -- quem semeia as 20h nao veria nenhum
 * encontro "acontecendo agora" num cartaz marcado para as 9h. Para esses dois a
 * relacao que precisa ser preservada e com o relogio de quem OLHA, e nao com o
 * cartaz; entao o deslocamento e em minutos a partir de `hoje`, e a zona
 * continua guardada porque a tela ainda precisa escrever que horas sao la.
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
  readonly active: boolean;
}

export interface FotoSemeada {
  readonly slug: string;
  readonly eventSlug: string;
  readonly imageUrl: string;
  readonly caption: string | null;
  // A COLUNA DE QUEM ENVIOU NAO TEM CAMPO AQUI, e a ausencia e a decisao.
  //
  // Duas razoes, e as duas valem sozinhas. A primeira e de produto: a galeria
  // desta fatia e CURADA, e foto curada nao tem remetente -- preencher o campo
  // seria inventar um envio que nao aconteceu. A segunda e de portao: a coluna
  // leva a marca de saida no `COMMENT ON COLUMN` da migracao `20260923000001`,
  // e `src/tools/portao-colunas-que-nao-saem.ts` varre `src/` inteiro atras do
  // NOME dela -- inclusive em comentario, porque ele nao distingue mencao de
  // uso.
  //
  // Quem precisa de uma foto COM remetente e a isca
  // `tests/integration/rede-nao-liga-dois-pets.test.ts`, que prova que o campo
  // nao sai na resposta estando preenchido. Ela monta a propria fixture, em
  // `tests/`, que o portao nao varre. A massa nao precisa participar disso.
  readonly sortOrder: number;
}

export interface TutorSemeado {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
}

/**
 * As pessoas que confirmaram presenca.
 *
 * Note o que NAO esta aqui: pet. Nao ha coluna, nao ha tabela de ligacao, e a
 * ausencia e a decisao 1 do ADR-0025.
 */
export interface PresencaSemeada {
  readonly eventSlug: string;
  readonly tutorId: string;
}

/** Instante fixo das contas de massa, copiado de `massa-do-diretorio.ts`. */
export const MOMENTO_DA_REDE = '2026-09-23T12:00:00.000Z';

/** `.invalid` e reservado por RFC 2606: nenhum e-mail sai daqui para o mundo. */
const DOMINIO_DA_MASSA = 'exemplo.invalid';

/**
 * Os tutores de massa. Identificadores literais, como manda o determinismo do
 * `seed.ts`.
 *
 * Eles existem para a contagem de presenca ter de onde sair. Nenhum deles
 * aparece em resposta nenhuma da secao -- e esse e o ponto.
 */
export const TUTORES_DA_REDE: readonly TutorSemeado[] = [
  {
    id: '0a5d6f10-0001-4a00-8a00-000000000001',
    email: `rede-maria@${DOMINIO_DA_MASSA}`,
    displayName: 'Maria Aparecida Gonçalves',
  },
  {
    id: '0a5d6f10-0002-4a00-8a00-000000000002',
    email: `rede-joao@${DOMINIO_DA_MASSA}`,
    displayName: 'João Batista de Assunção',
  },
  {
    id: '0a5d6f10-0003-4a00-8a00-000000000003',
    email: `rede-beatriz@${DOMINIO_DA_MASSA}`,
    displayName: 'Beatriz Kühn',
  },
  {
    id: '0a5d6f10-0004-4a00-8a00-000000000004',
    email: `rede-caio@${DOMINIO_DA_MASSA}`,
    displayName: 'Caio Nogueira',
  },
  {
    id: '0a5d6f10-0005-4a00-8a00-000000000005',
    email: `rede-solange@${DOMINIO_DA_MASSA}`,
    displayName: 'Solange Assunção Paiva',
  },
  {
    id: '0a5d6f10-0006-4a00-8a00-000000000006',
    email: `rede-tiago@${DOMINIO_DA_MASSA}`,
    displayName: 'Tiago Furquim',
  },
];

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
  // 1. SEMANA QUE VEM, capa, GALERIA CHEIA e MUITAS PRESENCAS. O cartao mais
  //    completo que a secao produz, e e ele que da a medida dos outros.
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
    coverImageUrl: 'https://cdn.bichu.app/rede/benedito-calixto.jpg',
    active: true,
  },
  // 2. TITULO QUE QUEBRA EM DUAS LINHAS, capa, GALERIA COM UMA FOTO SO e UMA
  //    presenca. Uma foto so e o caso em que a galeria nao vira grade: se o
  //    desenho reserva tres colunas, e aqui que o buraco aparece.
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
    coverImageUrl: 'https://cdn.bichu.app/rede/ibirapuera-portao-7.jpg',
    active: true,
  },
  // 3. SEM CAPA, GALERIA VAZIA, ZERO PRESENCAS e SEM FIM DECLARADO. Quatro
  //    ausencias no mesmo cartao, e nenhuma delas e defeito: e o encontro que
  //    acabou de ser cadastrado e ninguem viu ainda. A tela precisa saber
  //    desenhar isto sem parecer quebrada.
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
    active: true,
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
    coverImageUrl: 'https://cdn.bichu.app/rede/praca-da-liberdade.jpg',
    active: true,
  },
  // 5. JA PASSOU: nove dias atras. `status` sai `ended` e a tela escreve
  //    `Encerrado` junto da data. Sem ele, o unico estado que a secao calcula
  //    no servidor nunca seria visto por olho humano -- e o motivo de calcular
  //    no servidor e justamente que o aparelho erraria este.
  //
  //    Galeria cheia, porque encontro que aconteceu e o que TEM foto.
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
    coverImageUrl: 'https://cdn.bichu.app/rede/roosevelt-adocao.jpg',
    active: true,
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
    active: true,
  },
  // 7. **O CASO FEIO, e ele e deliberado.**
  //
  //    Titulo ENCOSTADO no teto de 120, resumo ENCOSTADO no teto de 180, nome
  //    de lugar ENCOSTADO no teto de 80, bairro comprido, nenhuma capa, galeria
  //    vazia e nenhuma presenca. E o pior cartao que esta secao consegue
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
    active: true,
  },
  // 8. Titulo curto com capa e galeria de duas fotos, e uma legenda ENCOSTADA
  //    no teto de 140 -- que e a legenda que estica a galeria.
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
    coverImageUrl: 'https://cdn.bichu.app/rede/orla-de-santos.jpg',
    active: true,
  },
  // 9. SEM CAPA, GALERIA VAZIA, UMA presenca e SEM FIM DECLARADO, um mes a
  //    frente. O encontro distante e o que testa a ordenacao: com `when=upcoming`
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
    active: true,
  },
  // 10. A MAIOR CONTAGEM da massa: seis presencas, que e todo mundo. O numero
  //     de dois digitos nao cabe nesta massa, e nao deveria caber: seis e o que
  //     seis tutores conseguem produzir sem a massa mentir sobre o tamanho dela.
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
    coverImageUrl: 'https://cdn.bichu.app/rede/villa-lobos.jpg',
    active: true,
  },

  // ------------------------------------------------------------------
  // O que NUNCA aparece. Ele e o que da o que medir a isca do `active`.
  // ------------------------------------------------------------------
  //
  // Uma massa so com encontros visiveis faria o caso "encontro retirado nao
  // aparece" passar contra uma consulta que nunca filtrou nada -- foi assim que
  // a BICHUS-91 passou 1037 casos com `revogarDoDono` virado num `no-op`.
  //
  // Ele e FUTURO de proposito: se fosse passado, o filtro `when=upcoming`
  // sozinho o esconderia e o `active` continuaria sem ser exercido.
  {
    slug: 'encontro-cancelado-do-mes',
    title: 'Encontro cancelado por causa da chuva',
    summary: 'Saiu da agenda e continua na tabela, marcado inativo. Os check-ins dele seguem gravados.',
    placeName: 'Praça Vilaboim',
    neighborhood: 'Higienópolis',
    city: 'São Paulo',
    state: 'SP',
    quando: { ancora: 'parede', diasAPartirDeHoje: 8, horaLocal: '10:00', duracaoEmMinutos: 120 },
    timeZone: 'America/Sao_Paulo',
    coverImageUrl: null,
    active: false,
  },
];

/**
 * A galeria.
 *
 * Tres tamanhos de propósito: cheia (quatro e tres fotos), uma foto so, e
 * vazia. Os tres sao desenhos diferentes, e o de uma foto so e o que costuma
 * ficar feio numa grade pensada para tres colunas.
 */
export const FOTOS_DA_REDE: readonly FotoSemeada[] = [
  // `benedito-calixto-de-manha`: galeria cheia, tres fotos.
  {
    slug: 'benedito-calixto-foto-1',
    eventSlug: 'benedito-calixto-de-manha',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/benedito-1.jpg',
    caption: 'A roda embaixo da figueira, antes de a feira encher.',
    sortOrder: 1,
  },
  {
    slug: 'benedito-calixto-foto-2',
    eventSlug: 'benedito-calixto-de-manha',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/benedito-2.jpg',
    caption: null,
    sortOrder: 2,
  },
  {
    slug: 'benedito-calixto-foto-3',
    eventSlug: 'benedito-calixto-de-manha',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/benedito-3.jpg',
    caption: 'Bebedouro improvisado com a bacia que a barraca de queijo emprestou.',
    sortOrder: 3,
  },
  // `caminhada-no-ibirapuera`: UMA foto so.
  {
    slug: 'ibirapuera-foto-unica',
    eventSlug: 'caminhada-no-ibirapuera',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/ibirapuera-1.jpg',
    caption: 'Ponto de saída no portão 7.',
    sortOrder: 1,
  },
  // `agora-na-praca-da-liberdade`: duas fotos, uma sem legenda.
  {
    slug: 'liberdade-foto-1',
    eventSlug: 'agora-na-praca-da-liberdade',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/liberdade-1.jpg',
    caption: 'Coreto cheio às dez da manhã.',
    sortOrder: 1,
  },
  {
    slug: 'liberdade-foto-2',
    eventSlug: 'agora-na-praca-da-liberdade',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/liberdade-2.jpg',
    caption: null,
    sortOrder: 2,
  },
  // `feira-de-adocao-de-sabado`: a mais cheia, quatro fotos. Encontro que ja
  // aconteceu e o que TEM foto.
  {
    slug: 'roosevelt-foto-1',
    eventSlug: 'feira-de-adocao-de-sabado',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/roosevelt-1.jpg',
    caption: 'Fila do cadastro debaixo da marquise, porque começou a chover às dez e quinze.',
    sortOrder: 1,
  },
  {
    slug: 'roosevelt-foto-2',
    eventSlug: 'feira-de-adocao-de-sabado',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/roosevelt-2.jpg',
    // Legenda ENCOSTADA no teto de 140: e a legenda comprida que estica o
    // cartao da galeria, e sem uma delas ninguem ve onde o texto quebra.
    caption:
      'A caixa das fichas de adoção encharcou e o pessoal refez tudo à mão em folha de caderno, '
      + 'com a entrevista na barraca da esquina.',
    sortOrder: 2,
  },
  {
    slug: 'roosevelt-foto-3',
    eventSlug: 'feira-de-adocao-de-sabado',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/roosevelt-3.jpg',
    caption: null,
    sortOrder: 3,
  },
  {
    slug: 'roosevelt-foto-4',
    eventSlug: 'feira-de-adocao-de-sabado',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/roosevelt-4.jpg',
    caption: 'Dezoito animais, e catorze saíram com tutor no mesmo dia.',
    sortOrder: 4,
  },
  // `fim-de-tarde-na-orla-recife`: uma foto so, sem legenda -- o caso em que a
  // galeria e uma imagem nua.
  {
    slug: 'boa-viagem-foto-1',
    eventSlug: 'fim-de-tarde-na-orla-recife',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/boa-viagem-1.jpg',
    caption: null,
    sortOrder: 1,
  },
  // `encontro-de-gatos-em-santos`: duas fotos.
  {
    slug: 'santos-foto-1',
    eventSlug: 'encontro-de-gatos-em-santos',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/santos-1.jpg',
    caption: 'Mesa das telas de proteção, com amostra para pegar na mão.',
    sortOrder: 1,
  },
  {
    slug: 'santos-foto-2',
    eventSlug: 'encontro-de-gatos-em-santos',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/santos-2.jpg',
    caption: 'Ninguém trouxe gato, como combinado.',
    sortOrder: 2,
  },
  // `piquenique-na-villa-lobos`: uma foto so.
  {
    slug: 'villa-lobos-foto-1',
    eventSlug: 'piquenique-na-villa-lobos',
    imageUrl: 'https://cdn.bichu.app/rede/galeria/villa-lobos-1.jpg',
    caption: 'A sombra da quadra de areia, que é onde todo mundo acaba.',
    sortOrder: 1,
  },
];

/**
 * Quem confirmou presenca, e em qual encontro. **Nao ha pet nesta lista**, e o
 * esquema nao tem onde guardar um.
 *
 * A distribuicao e desenho e nao enchimento: seis presencas no piquenique, uma
 * so na caminhada, nenhuma em tres encontros. `checkin_count` e o unico numero
 * da secao, e o zero e o caso que ninguem desenha.
 *
 * Nenhum par `(evento, tutor)` se repete -- a chave primaria de
 * `network_event_checkins` e `(event_id, user_id)`, e o segundo check-in da
 * mesma pessoa no mesmo encontro e um estado que o banco recusa.
 *
 * O `eventSlug` daqui e o do CATALOGO: a massa descreve o que a tela mostra, e
 * o encontro se chama pelo endereco publico dele. O `id` interno nao e catalogo
 * e por isso nao mora aqui -- quem o gera e `seed.ts`, na hora de gravar.
 */
export const PRESENCAS_DA_REDE: readonly PresencaSemeada[] = [
  // Cinco: a segunda maior contagem.
  { eventSlug: 'benedito-calixto-de-manha', tutorId: '0a5d6f10-0001-4a00-8a00-000000000001' },
  { eventSlug: 'benedito-calixto-de-manha', tutorId: '0a5d6f10-0002-4a00-8a00-000000000002' },
  { eventSlug: 'benedito-calixto-de-manha', tutorId: '0a5d6f10-0003-4a00-8a00-000000000003' },
  { eventSlug: 'benedito-calixto-de-manha', tutorId: '0a5d6f10-0004-4a00-8a00-000000000004' },
  { eventSlug: 'benedito-calixto-de-manha', tutorId: '0a5d6f10-0005-4a00-8a00-000000000005' },
  // UMA so.
  { eventSlug: 'caminhada-no-ibirapuera', tutorId: '0a5d6f10-0001-4a00-8a00-000000000001' },
  // `tarde-no-jardim-botanico`: NENHUMA, de proposito.
  // Tres.
  { eventSlug: 'agora-na-praca-da-liberdade', tutorId: '0a5d6f10-0002-4a00-8a00-000000000002' },
  { eventSlug: 'agora-na-praca-da-liberdade', tutorId: '0a5d6f10-0003-4a00-8a00-000000000003' },
  { eventSlug: 'agora-na-praca-da-liberdade', tutorId: '0a5d6f10-0004-4a00-8a00-000000000004' },
  // Quatro, num encontro que ja passou: a contagem nao some quando o encontro
  // acaba, e a tela precisa mostrar "esteve" e nao "vai".
  { eventSlug: 'feira-de-adocao-de-sabado', tutorId: '0a5d6f10-0001-4a00-8a00-000000000001' },
  { eventSlug: 'feira-de-adocao-de-sabado', tutorId: '0a5d6f10-0002-4a00-8a00-000000000002' },
  { eventSlug: 'feira-de-adocao-de-sabado', tutorId: '0a5d6f10-0005-4a00-8a00-000000000005' },
  { eventSlug: 'feira-de-adocao-de-sabado', tutorId: '0a5d6f10-0006-4a00-8a00-000000000006' },
  // Duas.
  { eventSlug: 'fim-de-tarde-na-orla-recife', tutorId: '0a5d6f10-0003-4a00-8a00-000000000003' },
  { eventSlug: 'fim-de-tarde-na-orla-recife', tutorId: '0a5d6f10-0006-4a00-8a00-000000000006' },
  // `encontro-do-mindu-em-manaus`: NENHUMA. O caso feio e feio ate aqui.
  // Duas.
  { eventSlug: 'encontro-de-gatos-em-santos', tutorId: '0a5d6f10-0004-4a00-8a00-000000000004' },
  { eventSlug: 'encontro-de-gatos-em-santos', tutorId: '0a5d6f10-0005-4a00-8a00-000000000005' },
  // UMA.
  { eventSlug: 'passeio-noturno-redencao', tutorId: '0a5d6f10-0006-4a00-8a00-000000000006' },
  // SEIS: todo mundo. A maior contagem da massa.
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0001-4a00-8a00-000000000001' },
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0002-4a00-8a00-000000000002' },
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0003-4a00-8a00-000000000003' },
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0004-4a00-8a00-000000000004' },
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0005-4a00-8a00-000000000005' },
  { eventSlug: 'piquenique-na-villa-lobos', tutorId: '0a5d6f10-0006-4a00-8a00-000000000006' },
  // Duas num encontro INATIVO: os check-ins seguem gravados, e e por isso que
  // encontro retirado e desativado e nao apagado -- `ON DELETE CASCADE` levaria
  // a presenca junto.
  { eventSlug: 'encontro-cancelado-do-mes', tutorId: '0a5d6f10-0001-4a00-8a00-000000000001' },
  { eventSlug: 'encontro-cancelado-do-mes', tutorId: '0a5d6f10-0002-4a00-8a00-000000000002' },
];

/** Os encontros que a agenda de fato mostra: os ativos. */
export const ENCONTROS_VISIVEIS: readonly EncontroSemeado[] = MASSA_DA_REDE.filter(
  (encontro) => encontro.active,
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
