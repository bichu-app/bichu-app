/**
 * As regras da escrita administrativa da `Rede` (BICHUS-273 e BICHUS-292; ADR-0027
 * itens 12, 13 e 17, apendice A.4 a A.6), sem banco e sem servidor.
 */
import { redigirCanalMediado } from '../../../shared/redaction/redigir.js';
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import {
  errosDoEnderecoCompleto,
  hostDoEndereco,
} from '../../../shared/url/endereco-completo.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { components } from '../../../shared/types/generated/api.js';

/** O estado de publicacao como o painel o ve. */
export type PublicacaoAdministrativa = 'published' | 'cancelled' | 'removed';
/**
 * `admin` ou `community`, o `CHECK` `network_events_origem_conhecida`
 * (ADR-0025 emenda 3).
 *
 * **VEM DO CONTRATO, e nao de `shared/db/schema.ts`.** `api/openapi.yaml` e a
 * fonte unica que manda em back-end, aplicativo, backoffice e site, e este
 * enum ja esta la (`NetworkEventOrigin`): ancorado nele, `verify:types` cobra
 * a diferenca a cada execucao da esteira. Declarar a uniao aqui, com os
 * valores escritos a mao, seria uma quarta casa capaz de discordar do
 * contrato sem ninguem ver.
 *
 * **POR QUE NAO `import type` DE `shared/db/schema.ts`**, que e a casa
 * canonica dos 46 enums de coluna: este arquivo e compilado TAMBEM pelo
 * backoffice. Tres testes do painel o leem de proposito, para conferir o
 * validador do painel contra o do servidor caso a caso
 * (`admin/test/rede/observacoes-contra-o-servidor.test.ts`,
 * `links-contra-o-servidor.test.ts` e `dominio.test.ts`), e o job `backoffice`
 * roda `npm ci` so em `admin/`. A primeira linha de codigo de `schema.ts` e
 * `import type { ColumnType, Generated, Selectable } from 'kysely'`, e o
 * `tsc -b` do `npm run build` do painel segue a corrente: `admin: npm run
 * build` reprovava com `TS2307` apontando para `schema.ts(13,56)` -- sem nada
 * de errado no painel nem no dominio. Medido em 21/10/2026. O `vitest` nunca
 * reclamou porque o esbuild descarta importacao de tipo.
 *
 * Desde 21/10/2026 o job `backoffice` instala tambem a arvore da raiz, entao
 * esse modo de falha deixou de existir na esteira. A ancoragem no contrato
 * continua valendo pelo primeiro motivo, nao por este.
 *
 * **A GUARDA DESTA UNIAO E ASSIMETRICA, e a metade que falta custa caro.**
 * Medido em 21/10/2026, acrescentando um valor de um lado so:
 *
 *   - o esquema cresce e o contrato fica para tras: o `tsc` do back-end
 *     reprova (exit 2, `TS2322` em `kysely-rede-administrativa.ts(189,5)`),
 *     onde o adaptador le `origin` com o tipo de `schema.ts` e o atribui a
 *     `EncontroAdministrativo.origem`. Esta e a direcao que importa no dia a
 *     dia, porque e o `CHECK` do banco que cresce;
 *   - o contrato cresce e o esquema fica para tras: NENHUM PORTAO PEGA.
 *     `tsc --noEmit` sai 0, `eslint` sai 0 e a suite unitaria da raiz passa
 *     inteira (3940 casos em 286 arquivos, 0 reprovaram). Quem recusa e o
 *     `CHECK` `network_events_origem_conhecida`, no INSERT, em producao: o
 *     defeito aparece como 500, e nao como esteira vermelha.
 *
 * Portanto: **ao acrescentar um valor a `NetworkEventOrigin` no contrato,
 * abra a migracao no mesmo passo.** Nada neste repositorio vai lembrar.
 *
 * A mesma divida existe, maior, logo abaixo: `Visibilidade`, `UnidadeDoValor`
 * e `PublicacaoAdministrativa` SEGUEM sendo copias literais, escritas a mao,
 * de `VisibilidadeDoEncontro`, `UnidadeDoValor` e `PublicacaoDoEncontro` de
 * `schema.ts`. Esta uniao era a quarta da mesma forma; ancorar as outras tres
 * nao foi feito aqui, de proposito, para o conserto nao crescer sozinho.
 */
export type OrigemDoEncontro = components['schemas']['NetworkEventOrigin'];
export type Visibilidade = 'public' | 'private';
export type UnidadeDoValor = 'per_dog' | 'per_pet' | 'per_person' | 'per_pair' | 'per_two_people';
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
  /** O envio de que ela nasceu. */
  readonly uploadId: string | null;
  /** `catalog_images.id`, interno. */
  readonly imageId: string;
  readonly position: number;
  /**
   * **Anulavel desde 21/10/2026** (decisao do cliente, migracao `20261020000013`):
   * nulo quer dizer que o painel gravou a imagem sem descricao.
   */
  readonly altText: string | null;
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
  /** `admin` ou `community` (ADR-0025 emenda 3). */
  readonly origem: OrigemDoEncontro;
  readonly entrada: Entrada;
  readonly portes: readonly string[];
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly observacoes: string | null;
  /** Endereco por extenso (01/10/2026). */
  readonly endereco: string | null;
  /** Link de ingresso (ADR-0027 item 22). */
  readonly linkDeIngresso: string | null;
  /** O handle do Instagram, puro. */
  readonly instagram: string | null;
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

/** U+202A a U+202E e U+2066 a U+2069: invertem a ordem de exibicao do texto. */
const CONTROLE_BIDIRECIONAL = /[‪-‮⁦-⁩]/u;

/**
 * Tamanho de texto como o `CHECK` do banco o mede, depois de `btrim`, e o controle
 * bidirecional, recusado em todo texto administrativo (D59): ele faz o painel e o
 * app mostrarem uma coisa e gravarem outra.
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

/** O texto na forma em que a conferencia de D59 o le. */
export function normalizarParaConferencia(texto: string): { base: string; letras: string } {
  const base = texto
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200b-\u200f\u2060-\u2064\ufeff\u00ad]/gu, '')
    .toLowerCase();
  const IMITA_LETRA: Readonly<Record<string, string>> = { '1': 'i', '0': 'o', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's' };
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
 * Nome de dominio de primeiro nivel que um link encurtado ou uma pagina de perfil
 * usa.
 */
const TLD = 'com|net|org|br|me|io|ly|ee|app|link|gg|co|info|site|online|store|shop|xyz|tv|to|bio|page|sh|cc|gd|in|us|so|ai|dev|click|live|social|pay|money|bank|digital|vip|top|club|ws|biz|tk|ml|ga|cf|gq';

/**
 * Token com cara de dominio, com ou sem caminho: `algo.tld`, `algo.tld/abc`, `algo
 * .
 */
const DOMINIO = new RegExp(`(?:^|[^a-z0-9@])[a-z0-9][a-z0-9-]*\\s?\\.\\s?(?:${TLD})(?![a-z0-9])`);
/** Qualquer `algo.algo/caminho`, mesmo com TLD fora da lista. */
const DOMINIO_COM_CAMINHO = /[a-z0-9-]+\.[a-z]{2,}\/\S+/;
/** Perfil em rede social: `@usuario`. */
const ARROBA = /(?:^|[^a-z0-9])@[a-z0-9_.]{2,}/;

/** Pagamento pela palavra, na forma `letras`. */
const PAGAMENTO_POR_PALAVRA = /\b(?:pix(?!el|ot|ar)|picpay|pic\s?pay|mercado\s?pago|nubank|paypal|pagseguro|chave\s+aleatoria)\b/;

/**
 * Pagamento pelo numero, na forma `base`: CPF, CNPJ, chave aleatoria e dados
 * bancarios.
 */
const PAGAMENTO_POR_NUMERO: readonly RegExp[] = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/,
  /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/,
  /\b(?:ag|agencia|agenc)\s*[.:]?\s*\d{3,5}(?:-?\d)?\b/,
  /\b(?:cc|c\/c|conta(?:\s+corrente)?|conta\s+poupanca|cp)\s*[.:]?\s*\d{4,}(?:-?[\dx])?\b/,
  /\bbanco\s*[.:]?\s*\d{3}\b/,
];

/**
 * Data de calendario nos dois formatos que a equipe escreve: `dd.mm.aaaa` e
 * `dd/mm/aaaa`, dia 1 a 31 (com ou sem zero), mes 1 a 12, ano 19xx ou 20xx, sem
 * digito colado antes nem depois (nem separador seguido de digito).
 */
const DATA_DE_CALENDARIO = /(?<!\d)(?<!\d[./])(?:0?[1-9]|[12]\d|3[01])([./])(?:0?[1-9]|1[0-2])\1(?:19|20)\d{2}(?!\d)(?![./]\d)/g;

export function semDatas(texto: string): string {
  return texto.replace(DATA_DE_CALENDARIO, ' data ');
}

/**
 * As observacoes (D59): telefone, e-mail, link (inclusive encurtador e qualquer
 * token com cara de dominio), perfil `@usuario`, endereco, CEP, chave PIX, meio de
 * pagamento e dados bancarios sao recusados com `400`.
 */
export function errosDasObservacoes(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 500);
  if (tamanho.length > 0) return tamanho;
  if (!temContatoOuPagamento(valor)) return [];
  return [
    {
      field: campo,
      code: 'contact_or_payment_detected',
      message: 'As observações não podem ter telefone, e-mail, link, perfil, endereço, CEP, chave PIX nem dados de pagamento.',
    },
  ];
}

/** O DETECTOR de D59, sem tamanho e sem nome de campo. */
export function temContatoOuPagamento(valor: string): boolean {
  const limpo = semDatas(valor.normalize('NFKC'));
  const { base, letras } = normalizarParaConferencia(limpo);
  const contato =
    redigirCanalMediado(limpo).retirados.length > 0 ||
    DOMINIO.test(base) ||
    DOMINIO.test(letras) ||
    DOMINIO_COM_CAMINHO.test(base) ||
    ARROBA.test(base);
  const pagamento = PAGAMENTO_POR_PALAVRA.test(letras) || PAGAMENTO_POR_NUMERO.some((padrao) => padrao.test(base));
  return contato || pagamento;
}

/**
 * O MESMO D59, **menos o endereco**, para o campo que tem regra propria de
 * endereco: `place_name` (`errosDoNomeDoLugar`).
 */
export function temContatoOuPagamentoSemEndereco(valor: string): boolean {
  const limpo = semDatas(valor.normalize('NFKC'));
  const { base, letras } = normalizarParaConferencia(limpo);
  const contato =
    redigirCanalMediado(limpo).retirados.some((r) => r.kind !== 'address') ||
    TELEFONE_COM_DDD.test(base) ||
    EMAIL.test(base) ||
    DOMINIO.test(base) ||
    DOMINIO.test(letras) ||
    DOMINIO_COM_CAMINHO.test(base) ||
    ARROBA.test(base);
  const pagamento = PAGAMENTO_POR_PALAVRA.test(letras) || PAGAMENTO_POR_NUMERO.some((padrao) => padrao.test(base));
  return contato || pagamento;
}

/**
 * Telefone com DDD, nas formas em que se escreve: `(11) 91234-5678`, `+55 11 91234
 * 5678`, `11 3456-7890` e os 10 ou 11 digitos colados.
 */
const TELEFONE_COM_DDD =
  /(?<!\d)(?:(?:\+?55[\s.-]?)?\(\d{2}\)[\s.-]?9?\d{4}[\s.-]?\d{4}|\+?55[\s.-]?\d{2}[\s.-]?9?\d{4}[\s.-]?\d{4}|\d{2}[\s.-]?9?\d{4}[\s.-]\d{4}|\d{10,11})(?!\d)/;
/** E-mail, na forma `base`. */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/;
/** Link: esquema, `www.` ou dominio COLADO (`loja.com.br`). */
const LINK = new RegExp(`https?:\\/\\/|\\bwww\\.|(?:^|[^a-z0-9@])[a-z0-9][a-z0-9-]*\\.(?:${TLD})(?:\\.[a-z]{2})?(?![a-z0-9.])`);

/**
 * O endereco por extenso do encontro (decisao do cliente de 01/10/2026): 5 a 200
 * code points, aparado, sem controle bidirecional.
 */
export function errosDoEndereco(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 5, 200);
  if (tamanho.length > 0) return tamanho;
  const { base, letras } = normalizarParaConferencia(valor.normalize('NFKC'));
  const contato = LINK.test(base) || EMAIL.test(base) || ARROBA.test(base) || TELEFONE_COM_DDD.test(base);
  const pagamento = PAGAMENTO_POR_PALAVRA.test(letras) || PAGAMENTO_POR_NUMERO.some((padrao) => padrao.test(base));
  if (contato || pagamento) {
    return [
      {
        field: campo,
        code: 'contact_or_payment_detected',
        message: 'O endereço não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
      },
    ];
  }
  return [];
}

/**
 * Host que nao e endereco publico na internet: loopback, rede local, nome sem
 * ponto.
 */
const HOST_LOCAL = /(?:^|\.)(?:localhost|local|localdomain|internal|intranet|lan|home|home\.arpa|corp|test|invalid|example)$/;
/**
 * IPv4 literal, inclusive com zero a esquerda; o IPv6 literal chega entre
 * colchetes.
 */
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export const TETO_DO_LINK_DE_INGRESSO = 500;

/**
 * O link de ingresso: `https`, ate 500, sem usuario e senha, sem IP literal e sem
 * host local.
 */
export function errosDoLinkDeIngresso(campo: string, valor: string): ProblemFieldError[] {
  const recusa = (code: string, message: string): ProblemFieldError[] => [{ field: campo, code, message }];
  if (CONTROLE_BIDIRECIONAL.test(valor)) return recusa('bidi_control', 'O texto tem um caractere de controle de direção.');
  const texto = valor.trim();
  if (texto.length === 0 || texto.length > TETO_DO_LINK_DE_INGRESSO) {
    return recusa('length', `De 1 a ${String(TETO_DO_LINK_DE_INGRESSO)} caracteres.`);
  }
  if ([...texto].some((c) => /\s/u.test(c) || c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)) {
    return recusa('ticket_url_invalid', 'O link não pode ter espaço.');
  }
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return recusa('ticket_url_invalid', 'Isso não é um link.');
  }
  if (url.protocol !== 'https:' || !texto.startsWith('https://')) {
    return recusa('ticket_url_not_https', 'O link precisa começar com https://.');
  }
  if (url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*@/.test(texto)) {
    return recusa('ticket_url_has_credentials', 'O link não pode ter usuário e senha.');
  }
  const host = url.hostname.toLowerCase().replace(/\.+$/, '');
  if (host === '') return recusa('ticket_url_invalid', 'Isso não é um link.');
  if (host.startsWith('[') || IPV4.test(host) || /^\d+$/.test(host) || /^0x/i.test(host)) {
    return recusa('ticket_url_ip_literal', 'Use o endereço do site, e não um número de IP.');
  }
  if (!host.includes('.') || HOST_LOCAL.test(host)) {
    return recusa('ticket_url_local_host', 'O link precisa ser de um site público.');
  }
  return [];
}

/** O handle a GUARDAR, a partir da URL completa do perfil. */
export function handleDoInstagram(valor: string): string | null {
  let texto = valor.trim();
  const daUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(texto);
  if (daUrl !== null) texto = daUrl[1] ?? '';
  if (texto.startsWith('@')) texto = texto.slice(1);
  return /^[A-Za-z0-9._]{1,30}$/.test(texto) ? texto.toLowerCase() : null;
}

/** O teto do campo: a base do perfil mais os 30 do handle, com folga. */
export const TETO_DA_URL_DO_INSTAGRAM = 120;

/**
 * A URL do perfil do Instagram, **completa e com `https://`** (padrao do cliente
 * de 17/10/2026).
 */
export function errosDoInstagram(campo: string, valor: string): ProblemFieldError[] {
  const erros = errosDoEnderecoCompleto(campo, valor, {
    prefixo: 'instagram_url',
    teto: TETO_DA_URL_DO_INSTAGRAM,
  });
  if (erros.length > 0) return erros;

  const host = hostDoEndereco(valor);
  if (!/^(?:www\.|m\.)?instagram\.com$/.test(host)) {
    return [
      {
        field: campo,
        code: 'instagram_url_not_instagram',
        message: 'O endereço precisa ser de um perfil do instagram.com.',
      },
    ];
  }
  if (handleDoInstagram(valor.trim()) === null) {
    return [
      {
        field: campo,
        code: 'instagram_url_invalid',
        message: 'Falta o nome do perfil no fim do endereço.',
      },
    ];
  }
  return [];
}

export function urlDoInstagram(handle: string | null, base: string | null): string | null {
  if (handle === null || base === null) return null;
  return `${base.replace(/\/+$/, '')}/${handle}/`;
}

/** A zona existe no catalogo IANA do runtime. */
export function fusoExiste(nome: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: nome });
    return true;
  } catch {
    return false;
  }
}

/**
 * Fim depois do inicio, e o encontro nao pode ter terminado (`event_in_past`): o
 * fim, ou o inicio quando nao ha fim, precisa estar no futuro (ADR-0027 A.4.2).
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

/**
 * O mesmo rotulo temporal da leitura publica: sem fim, depois do inicio e
 * encerrado.
 */
export function tempoDoEncontro(e: Pick<EncontroAdministrativo, 'startsAt' | 'endsAt'>, agora: Instant): TempoDoEncontro {
  if (agora < e.startsAt.getTime()) return 'upcoming';
  if (e.endsAt === null) return 'ended';
  return agora <= e.endsAt.getTime() ? 'happening' : 'ended';
}

export interface EntradaDoCorpo {
  readonly kind: 'free' | 'paid';
  readonly price?: { readonly amount: number; readonly currency: 'BRL'; readonly unit: UnidadeDoValor } | null;
}

/** Pago exige o valor; gratuito o recusa. */
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

/**
 * O `slug` do encontro PRIVADO: 128 bits aleatorios em base 36, 25 caracteres,
 * sempre dentro do formato do `CHECK`.
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

export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

/** A decisao sobre um pedido (ADR-0027 item 17, emenda de 23/09): */
export function podeDecidir(
  pedido: Pick<PedidoNaFila, 'decisao' | 'withdrawnAt'>,
  decisao: 'approved' | 'declined',
): boolean {
  if (pedido.withdrawnAt !== null) return false;
  if (decisao === 'approved') return pedido.decisao === 'pending' || pedido.decisao === 'declined';
  return pedido.decisao === 'pending';
}

/** O encontro ainda recebe decisao sobre pedido? */
export function encontroAbertoParaDecisao(
  encontro: Pick<PedidoNaFila['encontro'], 'publicacao' | 'startsAt' | 'endsAt'>,
  agora: Instant,
): boolean {
  return encontro.publicacao === 'published' && tempoDoEncontro(encontro, agora) !== 'ended';
}

export interface ImagemProjetada {
  readonly upload_id: string | null;
  readonly position: number;
  /**
   * **Anulavel**, e o painel precisa do nulo CRU: se a leitura caisse no titulo do
   * encontro, o formulario reabriria com o campo preenchido e quem edita nao teria
   * como distinguir "descrevi com o titulo" de "nao descrevi".
   */
  readonly alt_text: string | null;
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
  readonly origin: OrigemDoEncontro;
  readonly visibility: Visibilidade;
  readonly admission: {
    readonly kind: 'free' | 'paid';
    readonly price: { readonly amount: number; readonly currency: 'BRL'; readonly unit: UnidadeDoValor } | null;
  };
  readonly bring_items: readonly string[];
  readonly notes: string | null;
  readonly street_address: string | null;
  readonly ticket_url: string | null;
  readonly instagram_handle: string | null;
  readonly instagram_url: string | null;
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

/** O encontro como o painel o ve (`AdminNetworkEvent`). */
export function projetarEncontroAdministrativo(
  e: EncontroAdministrativo,
  agora: Instant,
  urlDeMidia: (chave: string) => string,
  /** A base do perfil do Instagram, da configuracao. */
  baseDoInstagram: string | null = null,
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
    origin: e.origem,
    visibility: e.visibilidade,
    admission: projetarAdmissao(e.entrada),
    bring_items: [...e.paraLevar],
    notes: e.observacoes,
    street_address: e.endereco,
    ticket_url: e.linkDeIngresso,
    instagram_handle: e.instagram,
    instagram_url: urlDoInstagram(e.instagram, baseDoInstagram),
    pending_request_count: e.visibilidade === 'private' ? e.pedidosPendentes : 0,
    publication_status: e.publicacao,
    timing: tempoDoEncontro(e, agora),
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

/**
 * Ano e mes (`AAAA-MM`) no horario de Brasilia: a conta criada 31/03 as 22h em Sao
 * Paulo e de marco, e nao de abril.
 */
export function mesEmSaoPaulo(instante: Date): string {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(instante);
  const n = (tipo: string): string => partes.find((x) => x.type === tipo)?.value ?? '';
  return `${n('year')}-${n('month')}`;
}

/**
 * D53: do solicitante sai **so** o nome de exibicao (ou `null`, nunca o e-mail), o
 * mes de criacao da conta e o booleano do e-mail confirmado.
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

/** Os campos do encontro como a trilha os grava. */
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
    street_address: e.endereco,
    ticket_url: e.linkDeIngresso,
    instagram_handle: e.instagram,
    publication_status: e.publicacao,
    origin: e.origem,
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
