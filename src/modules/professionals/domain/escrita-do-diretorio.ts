import type { ProblemFieldError } from '../../../shared/http/problem.js';
import { errosDoEnderecoCompleto } from '../../../shared/url/endereco-completo.js';
import { atividadePrincipal } from './entrada-do-diretorio.js';
import type { TipoDeEntidade, TipoDeProfissional } from './entrada-do-diretorio.js';
import {
  evidenciasAprovadas,
  nivelDerivado,
  type TipoDeEvidencia,
  type NivelDeVerificacao,
  type VerificacaoDaEntidade,
} from './nivel-de-verificacao.js';

/** `professionals.status`, **espelhado** em `src/shared/db/schema.ts`. */
export type StatusDaEntrada = 'draft' | 'published' | 'hidden' | 'removed';

/**
 * `professionals.source`. O painel grava sempre `import` -- ver
 * `ORIGEM_DO_PAINEL`.
 */
export type OrigemDaEntrada = 'self' | 'invited' | 'import';

/** `professionals.claim_status`. */
export type TitularidadeDaEntrada = 'unclaimed' | 'claim_pending' | 'claimed' | 'disputed';

/** COMO A ENTRADA DO PAINEL NASCE, e os dois valores andam juntos. */
export const ORIGEM_DO_PAINEL: OrigemDaEntrada = 'import';
export const TITULARIDADE_DO_PAINEL: TitularidadeDaEntrada = 'unclaimed';

/** O estado da entrada INCOMPLETA. */
export const STATUS_INICIAL: StatusDaEntrada = 'draft';

/** COM QUE SITUACAO O CADASTRO DO PAINEL NASCE (cliente, 29/10/2026). */
export const STATUS_PADRAO_DO_CADASTRO: StatusDaEntrada = 'published';

export const MINIMO_DO_NOME = 2;
export const MAXIMO_DO_NOME = 120;
export const MINIMO_DO_SOBRE = 2;
export const MAXIMO_DO_SOBRE = 2000;
export const MINIMO_DA_CIDADE = 2;
export const MAXIMO_DA_CIDADE = 80;
export const MAXIMO_DO_BAIRRO = 80;

export const MAXIMO_DO_LOGRADOURO = 120;
export const MINIMO_DO_NUMERO = 1;
export const MAXIMO_DO_NUMERO = 20;
export const MINIMO_DO_COMPLEMENTO = 1;
export const MAXIMO_DO_COMPLEMENTO = 80;

/** Oito digitos, sem mascara e sem hifen. */
export const FORMA_DO_CEP = /^[0-9]{8}$/;

/** A LOGO ou a FOTO da entrada, como o repositorio a entrega e como o painel a ve. */
export interface ImagemDaEntrada {
  readonly status: 'processing' | 'ready' | 'rejected';
  /** A CHAVE da derivada publica, nunca a URL. */
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/** O TETO DA GALERIA: oito imagens. */
export const TETO_DE_IMAGENS_DA_GALERIA = 8;

/**
 * UMA IMAGEM DA GALERIA da entrada, como o repositorio a entrega (cliente,
 * 29/10/2026: *"implemente a tabela de galeria entao"*).
 */
export interface ImagemDaGaleriaDaEntrada {
  /** O envio de que ela nasceu. */
  readonly uploadId: string | null;
  /** `catalog_images.id`, interno. */
  readonly imageId: string;
  readonly position: number;
  /**
   * **Anulavel desde o nascimento da tabela** (`20261029000001`): nulo quer dizer
   * que o painel gravou a imagem sem descricao, e e o estado em que as duas galerias
   * irmas ja estao.
   */
  readonly altText: string | null;
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly publicKey: string | null;
  readonly rejectionReason: string | null;
}

/** A entrada como o repositorio administrativo a entrega. */
export interface EntradaAdministrativa {
  readonly slug: string;
  /** AS ATIVIDADES, de 1 a 6 (cliente, 21/10/2026). */
  readonly kinds: readonly TipoDeProfissional[];
  /** O QUE a entrada e. Eixo separado de `kind`, que e a ATIVIDADE. */
  readonly entityKind: TipoDeEntidade;
  readonly displayName: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  /**
   * O endereco de rua. Lido e escrito **so pela superficie administrativa**:
   * `projetarEntrada` (a projecao do aplicativo, em `entrada-do-diretorio.ts`) nao
   * os conhece, e por isso nao ha caminho em que eles saiam em `Perto`.
   */
  readonly postalCode: string | null;
  readonly street: string | null;
  readonly streetNumber: string | null;
  readonly complement: string | null;
  readonly phoneE164: string | null;
  /** O SITE (cliente, 21/10/2026). */
  readonly siteUrl: string | null;
  /** A LOGO e a FOTO (cliente, 18/10/2026). */
  readonly logo: ImagemDaEntrada | null;
  readonly photo: ImagemDaEntrada | null;
  /** A GALERIA (cliente, 29/10/2026), em ordem de `position`. */
  readonly imagens: readonly ImagemDaGaleriaDaEntrada[];
  readonly status: StatusDaEntrada;
  readonly source: OrigemDaEntrada;
  readonly claimStatus: TitularidadeDaEntrada;
  readonly verificacoes: readonly VerificacaoDaEntidade[];
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

/** O corpo da criacao, com a forma ja conferida pelo schema do contrato. */
export interface ImagemDeGaleriaDoCorpo {
  readonly upload_id: string;
  readonly alt_text?: string;
}

export interface CriacaoDaEntrada {
  readonly slug: string;
  /** AS ATIVIDADES (cliente, 21/10/2026). */
  readonly kinds?: readonly TipoDeProfissional[];
  /** Equivale a `kinds: [kind]`. */
  readonly kind?: TipoDeProfissional;
  /**
   * **Opcional, e ausente vale `professional`.** Obriga-lo quebraria o contrato de
   * REQUISICAO (`request-property-became-required`) e derrubaria o painel ja
   * carregado no navegador de quem esta cadastrando agora.
   */
  readonly entity_kind?: TipoDeEntidade;
  readonly display_name: string;
  readonly about?: string;
  readonly city?: string;
  readonly state?: string;
  readonly neighborhood?: string;
  readonly postal_code?: string;
  readonly street?: string;
  readonly street_number?: string;
  readonly complement?: string;
  readonly phone_e164?: string;
  /** O site do estabelecimento, com `https://`. */
  readonly site_url?: string;
  /** O `upload_id` de um envio `directory_logo` desta sessao do painel. */
  readonly logo_upload_id?: string;
  /** O `upload_id` de um envio `directory_photo`. */
  readonly photo_upload_id?: string;
  /** A GALERIA, na ordem em que a pagina do local a mostra. */
  readonly images?: readonly ImagemDeGaleriaDoCorpo[];
  /** A situacao em que a entrada nasce (cliente, 29/10/2026). */
  readonly status?: 'published' | 'draft';
}

/** O corpo da edicao. */
export interface EdicaoDaEntrada {
  readonly slug?: string;
  /** SUBSTITUI a lista inteira. */
  readonly kinds?: readonly TipoDeProfissional[];
  /** Equivale a `kinds: [kind]`, e portanto SUBSTITUI a lista. */
  readonly kind?: TipoDeProfissional;
  /** Sem `| null`: a coluna e NOT NULL, como `slug`, `kind` e `display_name`. */
  readonly entity_kind?: TipoDeEntidade;
  readonly display_name?: string;
  readonly about?: string | null;
  readonly city?: string | null;
  readonly state?: string | null;
  readonly neighborhood?: string | null;
  readonly postal_code?: string | null;
  readonly street?: string | null;
  readonly street_number?: string | null;
  readonly complement?: string | null;
  readonly phone_e164?: string | null;
  /** `null` APAGA o site, ausente nao mexe. */
  readonly site_url?: string | null;
  /** `null` TIRA a imagem, ausente nao mexe, `upload_id` novo TROCA. */
  readonly logo_upload_id?: string | null;
  readonly photo_upload_id?: string | null;
  /**
   * A GALERIA. **SUBSTITUI a lista inteira** -- o mesmo idioma de `images` da `Rede`
   * e da `Loja`: a lista que vem e a lista que fica, reordenar e mandar a ordem
   * nova, e `[]` tira todas.
   */
  readonly images?: readonly ImagemDeGaleriaDoCorpo[];
  readonly status?: StatusDaEntrada;
}

/** Os campos sem os quais uma entrada nao pode estar no ar. */
export type FaltaParaPublicar = 'slug' | 'city' | 'state' | 'phone_e164';

/** A ordem em que as faltas sao listadas, escrita por EXTENSO. */
export const ORDEM_DA_FALTA: readonly FaltaParaPublicar[] = ['slug', 'city', 'state', 'phone_e164'];

export const MENSAGEM_DA_FALTA: Record<FaltaParaPublicar, string> = {
  slug:
    'Uma entrada no ar precisa de endereço público: a listagem do aplicativo devolve o ' +
    'endereço como chave obrigatória de cada item, e nunca o identificador interno.',
  city: 'Sem cidade a entrada não aparece em nenhuma busca de Perto.',
  state: 'Informe a UF, com duas letras.',
  phone_e164:
    'Uma entrada no ar precisa de ao menos um canal de contato, e hoje o telefone ' +
    'comercial é o único que o cadastro tem.',
};

export function errosDaFalta(faltas: readonly FaltaParaPublicar[]): ProblemFieldError[] {
  return ORDEM_DA_FALTA.filter((falta) => faltas.includes(falta)).map((falta) => ({
    field: falta,
    code: 'required',
    message: MENSAGEM_DA_FALTA[falta],
  }));
}

function valorResultante(doCorpo: string | null | undefined, gravado: string | null): string | null {
  return doCorpo === undefined ? gravado : doCorpo;
}

/** O que falta para esta entrada poder ir ao ar. */
export function faltasParaPublicar(
  atual: Pick<EntradaAdministrativa, 'slug' | 'city' | 'state' | 'phoneE164'>,
  edicao: EdicaoDaEntrada = {},
): FaltaParaPublicar[] {
  const faltas: FaltaParaPublicar[] = [];
  if (valorResultante(edicao.slug, atual.slug) === null) faltas.push('slug');
  if (valorResultante(edicao.city, atual.city) === null) faltas.push('city');
  if (valorResultante(edicao.state, atual.state) === null) faltas.push('state');
  if (valorResultante(edicao.phone_e164, atual.phoneE164) === null) faltas.push('phone_e164');
  return ORDEM_DA_FALTA.filter((falta) => faltas.includes(falta));
}

export interface PlanoDaCriacao {
  /** O estado em que a entrada vai nascer. */
  readonly status: StatusDaEntrada;
  /** Verdadeiro quando a entrada nasce no ar. */
  readonly gravaMarcoDePublicacao: boolean;
}

export type ResultadoDaCriacao =
  | { readonly ok: true; readonly plano: PlanoDaCriacao }
  | { readonly ok: false; readonly erros: readonly ProblemFieldError[] };

/** DECIDE A CRIACAO (cliente, 29/10/2026: *"cobrar os dados no cadastro"*). */
export function planejarCriacao(corpo: CriacaoDaEntrada): ResultadoDaCriacao {
  const status: StatusDaEntrada = corpo.status ?? STATUS_PADRAO_DO_CADASTRO;
  if (status !== 'published') {
    return { ok: true, plano: { status, gravaMarcoDePublicacao: false } };
  }
  const faltas = faltasParaPublicar({
    slug: corpo.slug,
    city: corpo.city?.trim() ?? null,
    state: corpo.state?.trim() ?? null,
    phoneE164: corpo.phone_e164?.trim() ?? null,
  });
  if (faltas.length > 0) return { ok: false, erros: errosDaFalta(faltas) };
  return { ok: true, plano: { status, gravaMarcoDePublicacao: true } };
}

export interface PlanoDaEdicao {
  readonly edicao: EdicaoDaEntrada;
  /** O estado em que a entrada vai ficar. */
  readonly statusResultante: StatusDaEntrada;
  /** Verdadeiro **so** na transicao para `published`. */
  readonly gravaMarcoDePublicacao: boolean;
}

export type ResultadoDaEdicao =
  | { readonly ok: true; readonly plano: PlanoDaEdicao }
  | { readonly ok: false; readonly erros: readonly ProblemFieldError[] };

/** Decide a edicao. */
export function planejarEdicao(
  atual: EntradaAdministrativa,
  edicao: EdicaoDaEntrada,
): ResultadoDaEdicao {
  const statusResultante = edicao.status ?? atual.status;

  if (statusResultante === 'published') {
    const faltas = faltasParaPublicar(atual, edicao);
    if (faltas.length > 0) return { ok: false, erros: errosDaFalta(faltas) };
  }

  return {
    ok: true,
    plano: {
      edicao,
      statusResultante,
      gravaMarcoDePublicacao: statusResultante === 'published' && atual.status !== 'published',
    },
  };
}

/** O tamanho e medido sobre o texto APARADO, que e o que vai ser gravado. */
export function errosDeTexto(
  campo: string,
  valor: string,
  minimo: number,
  maximo: number,
): ProblemFieldError[] {
  const tamanho = valor.trim().length;
  if (tamanho < minimo || tamanho > maximo) {
    return [
      {
        field: campo,
        code: 'length',
        message: `Entre ${String(minimo)} e ${String(maximo)} caracteres.`,
      },
    ];
  }
  return [];
}

/**
 * A UF, duas letras. O `CHECK` do banco mede so o tamanho; a tela precisa da
 * recusa antes.
 */
export function errosDoCep(campo: string, valor: string): ProblemFieldError[] {
  return FORMA_DO_CEP.test(valor.trim())
    ? []
    : [{ field: campo, code: 'postal_code_invalid', message: 'O CEP tem oito dígitos.' }];
}

export function errosDaUf(campo: string, valor: string): ProblemFieldError[] {
  return /^[A-Za-z]{2}$/.test(valor.trim())
    ? []
    : [{ field: campo, code: 'uf_invalid', message: 'Use a sigla do estado, com duas letras.' }];
}

/** O telefone comercial, em E.164. */
export const FORMA_DO_TELEFONE = /^\+[1-9][0-9]{7,14}$/;

/**
 * O TETO DO SITE: `length('https://') + 253`, o mesmo numero que o contrato
 * declara em `DirectoryEntrySiteUrl.maxLength` e que `LIMITE_DO_SITE` espelha no
 * painel (`admin/src/endereco/enderecos.ts`).
 */
export const TETO_DO_SITE = 'https://'.length + 253;

/** O teto de atividades: o TAMANHO da lista fechada, e nao um numero redondo. */
export const TETO_DE_ATIVIDADES = 10;

/** As atividades que o corpo pediu, a partir de `kinds` OU de `kind`. */
export function atividadesDoCorpo(
  campo: string,
  corpo: { readonly kinds?: readonly TipoDeProfissional[]; readonly kind?: TipoDeProfissional },
):
  | { readonly ok: readonly TipoDeProfissional[] | undefined }
  | { readonly erros: ProblemFieldError[] } {
  if (corpo.kinds !== undefined && corpo.kind !== undefined) {
    return {
      erros: [
        {
          field: campo,
          code: 'kind_conflict',
          message: 'Mande as atividades em `kinds`, e não os dois campos juntos.',
        },
      ],
    };
  }
  if (corpo.kinds === undefined) {
    return { ok: corpo.kind === undefined ? undefined : [corpo.kind] };
  }
  const lista = corpo.kinds;
  if (lista.length === 0) {
    return {
      erros: [{ field: campo, code: 'kinds_empty', message: 'Escolha ao menos uma atividade.' }],
    };
  }
  if (lista.length > TETO_DE_ATIVIDADES) {
    return {
      erros: [
        {
          field: campo,
          code: 'too_many_kinds',
          message: `Até ${String(TETO_DE_ATIVIDADES)} atividades.`,
        },
      ],
    };
  }
  if (new Set(lista).size !== lista.length) {
    return {
      erros: [
        {
          field: campo,
          code: 'duplicate_kind',
          message: 'A mesma atividade apareceu duas vezes.',
        },
      ],
    };
  }
  return { ok: lista };
}

/** O SITE do estabelecimento (cliente, 21/10/2026). */
export function errosDoSiteDaEntrada(campo: string, valor: string): ProblemFieldError[] {
  return errosDoEnderecoCompleto(campo, valor, { prefixo: 'site_url', teto: TETO_DO_SITE });
}

export function errosDoTelefone(campo: string, valor: string): ProblemFieldError[] {
  return FORMA_DO_TELEFONE.test(valor.trim())
    ? []
    : [
        {
          field: campo,
          code: 'phone_invalid',
          message: 'Informe o telefone com DDD. Por exemplo: (11) 3061-2200.',
        },
      ];
}

/** O `ETag` e a `version` do banco, entre aspas (`components/headers/ETag`). */
export function comoEtag(version: number): string {
  return `"${String(version)}"`;
}

export { lerIfMatch, type VersaoLida } from '../../../shared/http/if-match.js';

export interface VerificacaoProjetada {
  readonly level: NivelDeVerificacao;
  readonly evidence_kinds: readonly TipoDeEvidencia[];
}

/** `AdminCatalogImage` do contrato, como a entrada do diretorio o preenche. */
export interface ImagemProjetada {
  readonly source: 'uploaded';
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

/**
 * `AdminCatalogGalleryImage` do contrato -- o MESMO schema de item que a `Loja` e
 * a `Rede` devolvem, e por isso o painel usa UM componente de galeria para as tres
 * secoes.
 */
export interface ImagemDeGaleriaProjetada {
  readonly upload_id: string | null;
  readonly position: number;
  /**
   * **Anulavel, e o painel precisa do nulo CRU**: se a leitura caisse no
   * `display_name` da entrada, o formulario reabriria com o campo preenchido e quem
   * edita nao teria como distinguir "descrevi com o nome" de "nao descrevi".
   */
  readonly alt_text: string | null;
  readonly source: 'uploaded';
  readonly status: 'processing' | 'ready' | 'rejected';
  readonly url: string | null;
  readonly rejection_reason: string | null;
}

function projetarImagem(
  imagem: ImagemDaEntrada | null,
  urlDeMidia: (chave: string) => string,
): ImagemProjetada | null {
  if (imagem === null) return null;
  return {
    source: 'uploaded',
    status: imagem.status,
    url: imagem.status === 'ready' && imagem.publicKey !== null ? urlDeMidia(imagem.publicKey) : null,
    rejection_reason: imagem.status === 'rejected' ? imagem.rejectionReason : null,
  };
}

/** `AdminDirectoryEntry` do contrato. */
export interface EntradaProjetada {
  readonly slug: string;
  /** A PRIMEIRA de `kinds`, para compatibilidade. */
  readonly kind: TipoDeProfissional;
  readonly kinds: readonly TipoDeProfissional[];
  readonly entity_kind: TipoDeEntidade;
  readonly display_name: string;
  readonly about: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly neighborhood: string | null;
  readonly postal_code: string | null;
  readonly street: string | null;
  readonly street_number: string | null;
  readonly complement: string | null;
  readonly phone_e164: string | null;
  readonly site_url: string | null;
  readonly logo: ImagemProjetada | null;
  readonly photo: ImagemProjetada | null;
  /** A GALERIA (29/10/2026). SEMPRE presente; `[]` e o estado normal. */
  readonly images: readonly ImagemDeGaleriaProjetada[];
  readonly status: StatusDaEntrada;
  readonly verification: VerificacaoProjetada;
  readonly source: OrigemDaEntrada;
  readonly claim_status: TitularidadeDaEntrada;
  readonly missing_to_publish: readonly FaltaParaPublicar[];
  readonly published_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly version: number;
}

/** A entrada como o painel a ve. */
export function projetarEntradaAdministrativa(
  entrada: EntradaAdministrativa,
  urlDeMidia: (chave: string) => string,
): EntradaProjetada {
  return {
    slug: entrada.slug,
    kind: atividadePrincipal(entrada.kinds),
    kinds: [...entrada.kinds],
    entity_kind: entrada.entityKind,
    display_name: entrada.displayName,
    about: entrada.about,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    postal_code: entrada.postalCode,
    street: entrada.street,
    street_number: entrada.streetNumber,
    complement: entrada.complement,
    phone_e164: entrada.phoneE164,
    site_url: entrada.siteUrl,
    logo: projetarImagem(entrada.logo, urlDeMidia),
    photo: projetarImagem(entrada.photo, urlDeMidia),
    images: entrada.imagens.map((imagem) => ({
      upload_id: imagem.uploadId,
      position: imagem.position,
      alt_text: imagem.altText,
      source: 'uploaded' as const,
      status: imagem.status,
      url:
        imagem.status === 'ready' && imagem.publicKey !== null
          ? urlDeMidia(imagem.publicKey)
          : null,
      rejection_reason: imagem.status === 'rejected' ? imagem.rejectionReason : null,
    })),
    status: entrada.status,
    verification: {
      level: nivelDerivado(entrada.verificacoes),
      evidence_kinds: evidenciasAprovadas(entrada.verificacoes),
    },
    source: entrada.source,
    claim_status: entrada.claimStatus,
    missing_to_publish: faltasParaPublicar(entrada),
    published_at: entrada.publishedAt === null ? null : entrada.publishedAt.toISOString(),
    created_at: entrada.createdAt.toISOString(),
    updated_at: entrada.updatedAt.toISOString(),
    version: entrada.version,
  };
}

/**
 * O retrato que vai para a trilha: os campos de negocio, sem marca de tempo e sem
 * versao.
 */
export function retratoDaEntrada(entrada: EntradaAdministrativa): Record<string, unknown> {
  return {
    slug: entrada.slug,
    kinds: [...entrada.kinds],
    display_name: entrada.displayName,
    about: entrada.about,
    city: entrada.city,
    state: entrada.state,
    neighborhood: entrada.neighborhood,
    phone_e164: entrada.phoneE164,
    logo: entrada.logo !== null,
    photo: entrada.photo !== null,
    images: entrada.imagens.length,
    status: entrada.status,
  };
}
