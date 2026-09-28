/**
 * As regras da escrita administrativa da `Rede` (BICHUS-273 e BICHUS-292;
 * ADR-0027 itens 12, 13 e 17, apendice A.4 a A.6), sem banco e sem servidor.
 *
 * ## O que mora aqui
 *
 * - a conferencia de texto como o `CHECK` mede (depois de `btrim`), o
 *   controle bidirecional recusado em todo texto administrativo e o detector
 *   de contato e pagamento das observacoes (D59);
 * - as regras de tempo do encontro (fim depois do inicio, encontro que ja
 *   terminou) e a existencia do fuso;
 * - a condicao de acesso (gratuito ou pago, so o valor, informativo);
 * - o `slug` gerado do encontro privado, aleatorio, e o derivado do publico;
 * - as transicoes de publicacao e de decisao do pedido;
 * - as projecoes do painel, sem `id` interno e sem autor.
 *
 * ## O que NAO mora aqui
 *
 * Papel e reautenticacao: sao da guarda do prefixo e da declaracao da rota
 * (ADR-0027 item 7). O que chega aos casos de uso ja e um administrador, e a
 * janela de reautenticacao ja foi consumida.
 */
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Instant } from '../../../shared/types/brands.js';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type PublicacaoAdministrativa = 'published' | 'cancelled' | 'removed';
export type Visibilidade = 'public' | 'private';
export type UnidadeDoValor = 'per_dog' | 'per_person' | 'per_pair';
export type TempoDoEncontro = 'upcoming' | 'happening' | 'ended';
export type DecisaoDoPedido = 'pending' | 'approved' | 'declined';
export type EstadoDaImagem = 'processing' | 'ready' | 'rejected';

export type Entrada =
  | { readonly tipo: 'free' }
  | { readonly tipo: 'paid'; readonly centavos: number; readonly unidade: UnidadeDoValor };

export interface Ponto {
  readonly lat: number;
  readonly lon: number;
}

export interface Lugar {
  readonly placeName: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly ponto: Ponto | null;
}

/** Uma imagem da galeria do encontro, como a escrita a enxerga. */
export interface ImagemDoEncontroAdministrativa {
  /** O envio de que ela nasceu. Nulo depois que a conta que enviou foi apagada. */
  readonly uploadId: string | null;
  /** `catalog_images.id`, interno. So a trilha e a escrita o veem. */
  readonly imageId: string;
  readonly position: number;
  readonly altText: string;
  readonly status: EstadoDaImagem;
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/** O encontro como o repositorio o entrega ao caso de uso. */
export interface EncontroAdministrativo {
  /** Identidade interna. Nunca projetada. */
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly lugar: Lugar;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timeZone: string;
  readonly visibilidade: Visibilidade;
  readonly entrada: Entrada;
  readonly portes: readonly string[];
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly observacoes: string | null;
  readonly publicacao: PublicacaoAdministrativa;
  readonly publishedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancellationNote: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly pedidosPendentes: number;
  readonly imagens: readonly ImagemDoEncontroAdministrativa[];
}

/** O pedido como a fila o ve (D53): so o que o painel mostra, mais o `id` interno. */
export interface PedidoNaFila {
  /** Identidade interna. Nunca projetada; vai para a trilha. */
  readonly id: string;
  readonly ref: string;
  readonly decisao: DecisaoDoPedido;
  readonly requestedAt: Date;
  readonly decidedAt: Date | null;
  readonly withdrawnAt: Date | null;
  readonly encontro: {
    readonly slug: string;
    readonly title: string;
    readonly startsAt: Date;
    readonly endsAt: Date | null;
    readonly timeZone: string;
    readonly publicacao: PublicacaoAdministrativa;
  };
  readonly solicitante: {
    readonly displayName: string | null;
    readonly contaCriadaEm: Date;
    readonly emailConfirmado: boolean;
  };
}

// ---------------------------------------------------------------------------
// Constantes do contrato e do banco
// ---------------------------------------------------------------------------

export const PORTES = ['P', 'M', 'G', 'GG'] as const;
export const FUSO_PADRAO = 'America/Sao_Paulo';
export const TETO_DE_IMAGENS = 8;
/** D56: 300 linhas devolvidas por hora por conta, paginas de ate 50. */
export const TETO_DE_LINHAS_DA_FILA_POR_HORA = 300;
export const JANELA_DO_TETO_DA_FILA_EM_MS = 60 * 60 * 1000;
export const TAMANHO_MAXIMO_DA_PAGINA_DA_FILA = 50;
/** D54: aprovado e recusado saem 30 dias depois do fim do encontro. */
export const DIAS_DE_RETENCAO_DO_PEDIDO = 30;

const FORMATO_DE_SLUG = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/** U+202A a U+202E e U+2066 a U+2069: invertem a ordem de exibicao do texto. */
const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

/**
 * Tamanho de texto como o `CHECK` do banco o mede, depois de `btrim`, e o
 * controle bidirecional, recusado em todo texto administrativo (D59): ele faz o
 * painel e o app mostrarem uma coisa e gravarem outra.
 */
export function errosDeTexto(campo: string, valor: string, minimo: number, maximo: number): ProblemFieldError[] {
  if (CONTROLE_BIDIRECIONAL.test(valor)) {
    return [{ field: campo, code: 'bidi_control', message: 'O texto tem um caractere de controle de direção.' }];
  }
  const tamanho = [...valor.trim()].length;
  if (tamanho < minimo || tamanho > maximo) {
    return [
      {
        field: campo,
        code: 'length',
        message: `De ${String(minimo)} a ${String(maximo)} caracteres, sem contar espaços nas pontas.`,
      },
    ];
  }
  return [];
}

/**
 * O texto na forma em que a conferencia de D59 o le.
 *
 * - `base`: NFKC, sem acento, minusculo, sem caractere de largura zero. E a
 *   forma em que numero continua numero (CPF, conta, agencia).
 * - `letras`: a `base` com o digito que imita letra trocado por ela dentro de
 *   palavra (`P1X` vira `pix`) e com os separadores entre letras soltas
 *   tirados (`p i x`, `p-i-x`, `p.i.x` viram `pix`). E a forma em que palavra
 *   continua palavra, por mais que alguem a quebre.
 */
export function normalizarParaConferencia(texto: string): { base: string; letras: string } {
  const base = texto
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/gu, '')
    .toLowerCase();
  const IMITA_LETRA: Readonly<Record<string, string>> = { '1': 'i', '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's' };
  // Tres ou mais caracteres soltos com o MESMO separador entre eles (espaco,
  // ponto, hifen, sublinhado, barra, asterisco) viram uma palavra so. O mesmo
  // separador em toda a sequencia evita colar a palavra seguinte.
  const juntado = base.replace(
    /(?<![a-z0-9$])([a-z0-9$])([\s.\-_*/|]+)(?:[a-z0-9$]\2){1,}[a-z0-9$](?![a-z0-9$])/g,
    (m) => m.replace(/[^a-z0-9$]/g, ''),
  );
  const letras = juntado.replace(/[a-z0-9$]+/g, (palavra) =>
    /[a-z]/.test(palavra) ? palavra.replace(/[103457$]/g, (c) => IMITA_LETRA[c] ?? c) : palavra,
  );
  return { base, letras };
}

/**
 * Nome de dominio de primeiro nivel que um link encurtado ou uma pagina de
 * perfil usa. Lista aberta de proposito, com os genericos e os de pais que
 * encurtador usa (`bit.ly`, `linktr.ee`, `wa.me`, `t.co`, `is.gd`).
 */
const TLD = 'com|net|org|br|me|io|ly|ee|app|link|gg|co|info|site|online|store|shop|xyz|tv|to|bio|page|sh|cc|gd|in|us|so|ai|dev|click|live|social|pay|money|bank|digital|vip|top|club|ws|biz|tk|ml|ga|cf|gq';

/** Token com cara de dominio, com ou sem caminho: `algo.tld`, `algo.tld/abc`, `algo . tld`. */
const DOMINIO = new RegExp(`(?:^|[^a-z0-9@])[a-z0-9][a-z0-9-]*\\s?\\.\\s?(?:${TLD})(?![a-z0-9])`);
/** Qualquer `algo.algo/caminho`, mesmo com TLD fora da lista. */
const DOMINIO_COM_CAMINHO = /[a-z0-9-]+\.[a-z]{2,}\/\S+/;
/** Perfil em rede social: `@usuario`. */
const ARROBA = /(?:^|[^a-z0-9])@[a-z0-9_.]{2,}/;

/** Pagamento pela palavra, na forma `letras`. */
const PAGAMENTO_POR_PALAVRA = /\b(?:pix(?!el|ot|ar)|picpay|pic\s?pay|mercado\s?pago|nubank|paypal|pagseguro|chave\s+aleatoria)\b/;

/** Pagamento pelo numero, na forma `base`: CPF, CNPJ, chave aleatoria e dados bancarios. */
const PAGAMENTO_POR_NUMERO: readonly RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/,
  // "ag 1234", "agencia: 1234-5", "ag. 0001"
  /\b(?:ag|agencia|agenc)\s*[.:]?\s*\d{3,5}(?:-?\d)?\b/,
  // "cc 56789-0", "c/c 1234", "conta 12345-6", "conta corrente: 123456"
  /\b(?:cc|c\/c|conta(?:\s+corrente)?|conta\s+poupanca|cp)\s*[.:]?\s*\d{4,}(?:-?[\dx])?\b/,
  /\bbanco\s*[.:]?\s*\d{3}\b/,
];

/**
 * Data de calendario nos dois formatos que a equipe escreve: `dd.mm.aaaa` e
 * `dd/mm/aaaa`, dia 1 a 31 (com ou sem zero), mes 1 a 12, ano 19xx ou 20xx,
 * sem digito colado antes nem depois (nem separador seguido de digito). O detector de telefone do canal mediado le "10.10.2026"
 * como numero de oito digitos; nas observacoes do encontro a data e trocada
 * por um marcador antes de conferir. `redigir.ts` (a conversa mediada) nao
 * muda.
 */
const DATA_DE_CALENDARIO = /(?<!\d)(?<!\d[./])(?:0?[1-9]|[12]\d|3[01])([./])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}(?!\d)(?![./]\d)/g;

export function semDatas(texto: string): string {
  return texto.replace(DATA_DE_CALENDARIO, ' data ');
}

/**
 * As observacoes (D59): telefone, e-mail, link (inclusive encurtador e
 * qualquer token com cara de dominio), perfil `@usuario`, endereco, CEP,
 * chave PIX, meio de pagamento e dados bancarios sao recusados com `400`.
 *
 * Duas camadas. O detector do canal mediado (`redigirCanalMediado`) ja
 * normaliza largura zero, homoglifo e numero por extenso, e aqui e usado para
 * RECUSAR, e nao para redigir: texto publicado pela equipe nao chega ao app com
 * buraco no meio. Por cima, `normalizarParaConferencia` desfaz as quebras que
 * ele nao cobre (`p i x`, `P1X`, `Pïx`, `bit . ly`).
 */
export function errosDasObservacoes(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 500);
  if (tamanho.length > 0) return tamanho;
  const { base, letras } = normalizarParaConferencia(semDatas(valor.normalize('NFKC')));
  const contato =
    redigirCanalMediado(semDatas(valor.normalize('NFKC'))).retirados.length > 0 ||
    DOMINIO.test(base) ||
    DOMINIO.test(letras) ||
    DOMINIO_COM_CAMINHO.test(base) ||
    ARROBA.test(base);
  const pagamento = PAGAMENTO_POR_PALAVRA.test(letras) || PAGAMENTO_POR_NUMERO.some((padrao) => padrao.test(base));
  if (contato || pagamento) {
    return [
      {
        field: campo,
        code: 'contact_or_payment_detected',
        message: 'As observações não podem ter telefone, e-mail, link, perfil, endereço, CEP, chave PIX nem dados de pagamento.',
      },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Tempo e fuso
// ---------------------------------------------------------------------------

/** A zona existe no catalogo IANA do runtime. O banco confere de novo no gatilho. */
export function fusoExiste(nome: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: nome });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fim depois do inicio, e o encontro nao pode ter terminado (`event_in_past`):
 * o fim, ou o inicio quando nao ha fim, precisa estar no futuro (ADR-0027 A.4.2).
 */
export function errosDoHorario(
  startsAt: Date,
  endsAt: Date | null,
  timeZone: string,
  agora: Instant,
): ProblemFieldError[] {
  const erros: ProblemFieldError[] = [];
  if (!fusoExiste(timeZone)) {
    erros.push({ field: 'time_zone', code: 'unknown_time_zone', message: 'Fuso horário que não existe.' });
  }
  if (endsAt !== null && endsAt.getTime() <= startsAt.getTime()) {
    erros.push({ field: 'ends_at', code: 'ends_before_start', message: 'O fim precisa ser depois do início.' });
  } else if ((endsAt ?? startsAt).getTime() <= agora) {
    erros.push({
      field: endsAt === null ? 'starts_at' : 'ends_at',
      code: 'event_in_past',
      message: 'Este encontro já teria terminado.',
    });
  }
  return erros;
}

/** O mesmo rotulo temporal da leitura publica: sem fim, depois do inicio e encerrado. */
export function tempoDoEncontro(e: Pick<EncontroAdministrativo, 'startsAt' | 'endsAt'>, agora: Instant): TempoDoEncontro {
  if (agora < e.startsAt.getTime()) return 'upcoming';
  if (e.endsAt === null) return 'ended';
  return agora <= e.endsAt.getTime() ? 'happening' : 'ended';
}

// ---------------------------------------------------------------------------
// Condicao de acesso
// ---------------------------------------------------------------------------

export interface EntradaDoCorpo {
  readonly kind: 'free' | 'paid';
  readonly price?: { readonly amount: number; readonly currency: 'BRL'; readonly unit: UnidadeDoValor } | null;
}

/** Pago exige o valor; gratuito o recusa. O Bichu nao cobra: e so o valor informado. */
export function entradaDoCorpo(corpo: EntradaDoCorpo | undefined): { entrada: Entrada } | { erros: ProblemFieldError[] } {
  if (corpo === undefined) return { entrada: { tipo: 'free' } };
  const preco = corpo.price ?? null;
  if (corpo.kind === 'paid') {
    if (preco === null) {
      return {
        erros: [{ field: 'admission.price', code: 'admission_incomplete', message: 'Encontro pago precisa do valor e da unidade.' }],
      };
    }
    return { entrada: { tipo: 'paid', centavos: preco.amount, unidade: preco.unit } };
  }
  if (preco !== null) {
    return {
      erros: [{ field: 'admission.price', code: 'price_on_free_event', message: 'Encontro gratuito não tem valor.' }],
    };
  }
  return { entrada: { tipo: 'free' } };
}

export function mesmaEntrada(a: Entrada, b: Entrada): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

/**
 * O `slug` do encontro PRIVADO: 128 bits aleatorios em base 36, 25 caracteres,
 * sempre dentro do formato do `CHECK`. Ele sai no teaser para todo mundo, entao
 * nao pode carregar nada que o administrador digitou (ADR-0027 12.10).
 */
export function slugDoPrivado(aleatorio: Uint8Array): string {
  let n = 0n;
  for (const byte of aleatorio.slice(0, 16)) n = (n << 8n) | BigInt(byte);
  return n.toString(36).padStart(25, '0').slice(-25);
}

/** O `slug` derivado do titulo do encontro publico, com sufixo quando precisa. */
export function slugDoTitulo(titulo: string, sufixo?: string): string | undefined {
  const base = titulo
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const espaco = sufixo === undefined ? 0 : sufixo.length + 1;
  const cortado = base.slice(0, 30 - espaco).replace(/-+$/, '');
  const candidato = sufixo === undefined ? cortado : cortado === '' ? `encontro-${sufixo}` : `${cortado}-${sufixo}`;
  return FORMATO_DE_SLUG.test(candidato) ? candidato : undefined;
}

/** Quatro caracteres base36 (cerca de 20 bits) tirados do CSPRNG. */
export function sufixoCurto(aleatorio: Uint8Array): string {
  const n = ((aleatorio[0] ?? 0) << 16) | ((aleatorio[1] ?? 0) << 8) | (aleatorio[2] ?? 0);
  return (n % 1_679_616).toString(36).padStart(4, '0');
}

// ---------------------------------------------------------------------------
// Versao (If-Match)
// ---------------------------------------------------------------------------

export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

export type VersaoLida =
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'numero'; readonly versao: number }
  | { readonly tipo: 'invalida' };

/** `ausente` vira 428; qualquer forma que nao seja `"<n>"` vira 412. */
export function lerIfMatch(cabecalho: string | string[] | undefined): VersaoLida {
  if (cabecalho === undefined) return { tipo: 'ausente' };
  const valor = Array.isArray(cabecalho) ? cabecalho.join(',') : cabecalho;
  if (valor.trim() === '') return { tipo: 'ausente' };
  const casado = /^\s*"([1-9][0-9]{0,9})"\s*$/.exec(valor);
  if (casado === null) return { tipo: 'invalida' };
  const versao = Number(casado[1]);
  return Number.isSafeInteger(versao) && versao <= 2_147_483_647 ? { tipo: 'numero', versao } : { tipo: 'invalida' };
}

// ---------------------------------------------------------------------------
// Transicoes
// ---------------------------------------------------------------------------

/**
 * A decisao sobre um pedido (ADR-0027 item 17, emenda de 23/09):
 *
 * - aprovar vem de `pending` ou de `declined` (o painel reverte a recusa; o
 *   tutor nunca soube dela), sempre sem desistencia;
 * - recusar vem SO de `pending` sem desistencia;
 * - aprovado nao volta: o tutor ja viu o lugar.
 */
export function podeDecidir(
  pedido: Pick<PedidoNaFila, 'decisao' | 'withdrawnAt'>,
  decisao: 'approved' | 'declined',
): boolean {
  if (pedido.withdrawnAt !== null) return false;
  if (decisao === 'approved') return pedido.decisao === 'pending' || pedido.decisao === 'declined';
  return pedido.decisao === 'pending';
}

/**
 * O encontro ainda recebe decisao sobre pedido? So o publicado que nao terminou
 * (a mesma regra de `expired` que o app aplica ao pedido). Cancelado, removido
 * ou encerrado responde 409 `event-not-open`: aprovar ali mandaria push sobre um
 * encontro que nao vai acontecer.
 */
export function encontroAbertoParaDecisao(
  encontro: Pick<PedidoNaFila['encontro'], 'publicacao' | 'startsAt' | 'endsAt'>,
  agora: Instant,
): boolean {
  return encontro.publicacao === 'published' && tempoDoEncontro(encontro, agora) !== 'ended';
}

// ---------------------------------------------------------------------------
// Projecoes
// ---------------------------------------------------------------------------

export interface ImagemProjetada {
  readonly upload_id: string | null;
  readonly position: number;
  readonly alt_text: string;
  readonly source: 'uploaded';
  readonly status: EstadoDaImagem;
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

export interface EncontroAdministrativoProjetado {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly place: {
    readonly place_name: string;
    readonly neighborhood: string;
    readonly city: string;
    readonly state: string;
    readonly point: Ponto | null;
  };
  readonly starts_at: string;
  readonly ends_at: string | null;
  readonly time_zone: string;
  readonly images: readonly ImagemProjetada[];
  readonly accepted_sizes: readonly string[];
  readonly dog_age: string;
  readonly vaccination_required: boolean;
  readonly fenced_off_leash_area: boolean;
  readonly amenities: readonly string[];
  readonly origin: 'admin';
  readonly visibility: Visibilidade;
  readonly admission: {
    readonly kind: 'free' | 'paid';
    readonly price: { readonly amount: number; readonly currency: 'BRL'; readonly unit: UnidadeDoValor } | null;
  };
  readonly bring_items: readonly string[];
  readonly notes: string | null;
  readonly pending_request_count: number;
  readonly publication_status: PublicacaoAdministrativa;
  readonly timing: TempoDoEncontro;
  readonly published_at: string;
  readonly cancelled_at: string | null;
  readonly cancellation_note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

export function projetarAdmissao(entrada: Entrada): EncontroAdministrativoProjetado['admission'] {
  return entrada.tipo === 'free'
    ? { kind: 'free', price: null }
    : { kind: 'paid', price: { amount: entrada.centavos, currency: 'BRL', unit: entrada.unidade } };
}

/**
 * O encontro como o painel o ve (`AdminNetworkEvent`). **Sem autor e sem `id`**.
 * O ponto sai aqui porque o painel e autenticado e e quem o marcou; a trilha,
 * ao contrario, nunca o recebe cru.
 */
export function projetarEncontroAdministrativo(
  e: EncontroAdministrativo,
  agora: Instant,
  urlDeMidia: (chave: string) => string,
): EncontroAdministrativoProjetado {
  return {
    slug: e.slug,
    title: e.title,
    summary: e.summary,
    place: {
      place_name: e.lugar.placeName,
      neighborhood: e.lugar.neighborhood,
      city: e.lugar.city,
      state: e.lugar.state,
      point: e.lugar.ponto === null ? null : { lat: e.lugar.ponto.lat, lon: e.lugar.ponto.lon },
    },
    starts_at: e.startsAt.toISOString(),
    ends_at: e.endsAt === null ? null : e.endsAt.toISOString(),
    time_zone: e.timeZone,
    images: e.imagens.map((i) => ({
      upload_id: i.uploadId,
      position: i.position,
      alt_text: i.altText,
      source: 'uploaded',
      status: i.status,
      url: i.status === 'ready' && i.publicKey !== null ? urlDeMidia(i.publicKey) : null,
      rejection_reason: i.status === 'rejected' ? i.rejectionReason : null,
    })),
    accepted_sizes: [...e.portes],
    dog_age: e.idadeDosCaes,
    vaccination_required: e.vacinacaoExigida,
    fenced_off_leash_area: e.areaCercada,
    amenities: [...e.estrutura],
    origin: 'admin',
    visibility: e.visibilidade,
    admission: projetarAdmissao(e.entrada),
    bring_items: [...e.paraLevar],
    notes: e.observacoes,
    pending_request_count: e.visibilidade === 'private' ? e.pedidosPendentes : 0,
    publication_status: e.publicacao,
    timing: tempoDoEncontro(e, agora),
    // Todo encontro de administrador nasce publicado (12.9), entao a data
    // existe; o `createdAt` so cobre uma linha que nao cumpra isso.
    published_at: (e.publishedAt ?? e.createdAt).toISOString(),
    cancelled_at: e.cancelledAt === null ? null : e.cancelledAt.toISOString(),
    cancellation_note: e.cancellationNote,
    created_at: e.createdAt.toISOString(),
    updated_at: e.updatedAt.toISOString(),
    version: e.version,
  };
}

export interface PedidoProjetado {
  readonly ref: string;
  readonly event: { readonly slug: string; readonly title: string; readonly starts_at: string; readonly time_zone: string };
  readonly requester: {
    readonly display_name: string | null;
    readonly member_since: string;
    readonly email_verified: boolean;
  };
  readonly status: DecisaoDoPedido;
  readonly requested_at: string;
  readonly decided_at: string | null;
  readonly withdrawn_at: string | null;
}

/** Ano e mes (`AAAA-MM`) no horario de Brasilia: a conta criada 31/03 as 22h em Sao Paulo e de marco, e nao de abril. */
export function mesEmSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(instante);
  const n = (tipo: string): string => partes.find((x) => x.type === tipo)?.value ?? '';
  return `${n('year')}-${n('month')}`;
}

/**
 * D53: do solicitante sai **so** o nome de exibicao (ou `null`, nunca o
 * e-mail), o mes de criacao da conta e o booleano do e-mail confirmado.
 */
export function projetarPedido(p: PedidoNaFila): PedidoProjetado {
  return {
    ref: p.ref,
    event: {
      slug: p.encontro.slug,
      title: p.encontro.title,
      starts_at: p.encontro.startsAt.toISOString(),
      time_zone: p.encontro.timeZone,
    },
    requester: {
      display_name: p.solicitante.displayName,
      member_since: mesEmSaoPaulo(p.solicitante.contaCriadaEm),
      email_verified: p.solicitante.emailConfirmado,
    },
    status: p.decisao,
    requested_at: p.requestedAt.toISOString(),
    decided_at: p.decidedAt === null ? null : p.decidedAt.toISOString(),
    withdrawn_at: p.withdrawnAt === null ? null : p.withdrawnAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Retrato para a trilha
// ---------------------------------------------------------------------------

/**
 * Os campos do encontro como a trilha os grava. Catalogo e evento nao sao dado
 * pessoal, entao o valor vai inteiro, **exceto a coordenada**: a porta proibe
 * coordenada bruta na trilha, e ali vai so se ha ponto (ADR-0027 item 8). A
 * diferenca entre dois retratos vira `point_changed`.
 */
export function retratoDoEncontro(e: EncontroAdministrativo): Record<string, unknown> {
  return {
    slug: e.slug,
    title: e.title,
    summary: e.summary,
    place_name: e.lugar.placeName,
    neighborhood: e.lugar.neighborhood,
    city: e.lugar.city,
    state: e.lugar.state,
    has_point: e.lugar.ponto !== null,
    starts_at: e.startsAt.toISOString(),
    ends_at: e.endsAt === null ? null : e.endsAt.toISOString(),
    time_zone: e.timeZone,
    visibility: e.visibilidade,
    admission: projetarAdmissao(e.entrada),
    accepted_sizes: [...e.portes],
    dog_age: e.idadeDosCaes,
    vaccination_required: e.vacinacaoExigida,
    fenced_off_leash_area: e.areaCercada,
    amenities: [...e.estrutura],
    bring_items: [...e.paraLevar],
    notes: e.observacoes,
    publication_status: e.publicacao,
    cancellation_note: e.cancellationNote,
    images: e.imagens.map((i) => ({ upload_id: i.uploadId, alt_text: i.altText })),
  };
}

/** O ponto mudou? Compara o valor, que nunca vai para a trilha. */
export function pontoMudou(antes: Ponto | null, depois: Ponto | null): boolean {
  if (antes === null || depois === null) return antes !== depois;
  return antes.lat !== depois.lat || antes.lon !== depois.lon;
}

/** So os campos que mudaram, nos dois lados. */
export function diferenca(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const chave of Object.keys(depois)) {
    if (JSON.stringify(antes[chave]) !== JSON.stringify(depois[chave])) {
      before[chave] = antes[chave] ?? null;
      after[chave] = depois[chave];
    }
  }
  return { before, after };
}
