import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  recusaDaCapacidade,
  TELEFONE_SEM_VALIDACAO_POSSIVEL,
} from '../../../shared/autorizacao/matriz-de-capacidades.js';
import {
  errosDeTexto,
  normalizarParaConferencia,
  temContatoOuPagamento,
  temContatoOuPagamentoSemEndereco,
  type Lugar,
} from './escrita-do-encontro.js';

/**
 * Quantos encontros ATIVOS (publicados e nao encerrados) uma conta pode ter ao
 * mesmo tempo.
 */
export const TETO_DE_ENCONTROS_ATIVOS = 3;


/**
 * O bloqueio, no vocabulario que a tela sabe explicar.
 *
 * `phone_unverified_deadline` e o bloqueio da REGRA DOS 15 DIAS (cliente,
 * 02/11/2026) e **hoje nao e alcancavel**: nenhuma conta tem como validar
 * telefone, e o interruptor de `matriz-de-capacidades.ts` esta desligado. Ele
 * esta declarado porque o tipo e o que faz o `switch` da tela parar de compilar
 * no dia em que a regra ligar -- bloqueio novo sem texto na tela seria um erro
 * sem explicacao.
 */
export type BloqueioParaCriarEncontro =
  | 'contact_channel_unverified'
  | 'phone_unverified_deadline';

/**
 * O estado da conta para a criacao, lido numa consulta so, com a autorizacao na
 * clausula `WHERE` (ADR-0021).
 */
export interface EstadoParaCriarEncontro {
  /** E-mail OU telefone verificado. */
  readonly temCanalVerificado: boolean;
  /** Quantos encontros desta conta estao publicados e ainda nao terminaram. */
  readonly encontrosAtivos: number;
}

/**
 * **A DECISAO SAI DA MATRIZ DE CAPACIDADES, e nao daqui.**
 *
 * Antes de 02/11/2026 esta funcao era a propria regra (`temCanalVerificado ? []
 * : [...]`), e o nivel exigido por *"cadastrar eventos"* estava escrito nela, num
 * modulo. O cliente pos a tabela de niveis em UM lugar, e a matriz e esse lugar:
 * `NIVEL_EXIGIDO.cadastrar_evento` e a fonte, e esta funcao traduz o motivo no
 * vocabulario que ESTA tela sabe explicar.
 *
 * **O prazo do telefone chega aqui de graca**, e e deliberado: `cadastrar_evento`
 * e uma das duas capacidades que o cliente pos na regra dos 15 dias, e e
 * `recusaDaCapacidade` que a aplica. Hoje ela nao bloqueia ninguem -- o
 * interruptor esta desligado e o estado do telefone e
 * `TELEFONE_SEM_VALIDACAO_POSSIVEL` --, e os dois motivos estao escritos em
 * `matriz-de-capacidades.ts`.
 *
 * `agora` e parametro OBRIGATORIO e nao um relogio lido aqui dentro: a regra de
 * prazo o compara, e funcao que le o relogio sozinha nao tem como ser medida em
 * prazo vencido. Obrigatorio e nao com padrao porque padrao de tempo e um valor
 * que um dia alguem aceita sem notar -- e, com padrao, o chamador que esquecesse
 * de passar o instante mediria o prazo contra a epoca.
 */
export function bloqueiosParaCriarEncontro(
  estado: EstadoParaCriarEncontro,
  agora: Instant,
): BloqueioParaCriarEncontro[] {
  const recusa = recusaDaCapacidade(
    'cadastrar_evento',
    {
      /**
       * **`SoADisjuncao`, e e a verdade sobre o que este ponto mediu:** o
       * repositorio derivou a regua em SQL com `canalDeContatoConfirmadoNoSql` e
       * trouxe o booleano, nao as duas datas. `cadastrar_evento` exige
       * `qualquer_canal`, que e exatamente essa disjuncao -- e se um dia ela
       * passar a exigir os dois canais, a matriz LANCA aqui em vez de decidir
       * sobre dado que ninguem mediu.
       */
      canais: { canalConfirmado: estado.temCanalVerificado },
      telefone: TELEFONE_SEM_VALIDACAO_POSSIVEL,
    },
    agora,
  );
  if (recusa === null) return [];
  return recusa === 'canal_de_contato_nao_verificado'
    ? ['contact_channel_unverified']
    : ['phone_unverified_deadline'];
}

export function atingiuTetoDeEncontros(estado: EstadoParaCriarEncontro): boolean {
  return estado.encontrosAtivos >= TETO_DE_ENCONTROS_ATIVOS;
}

const CEP = /(?<!\d)\d{5}-?\d{3}(?!\d)/;

const LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\b/;

const NUMERO_NO_NOME_DO_LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\.?\s+\d{1,4}\b/g;

const QUILOMETRO = /\bkm\s*\.?\s*\d/;

const NUMERO_DE_PORTA = /(?:,\s*|\s-\s*|\bn\.?o?\.?\s*|\bnu?m?(?:ero)?\.?\s*|#\s*)\d{1,6}\b/;

const SEM_NUMERO = /\bs\s*[/.]\s*n(?:o|\u00ba)?(?![a-z])|\bsem\s+numero\b/;

const NUMERO_LONGO = /(?<!\d)\d{4,}(?!\d)/;

const COMPLEMENTO = /\b(?:apto|apartamento|bloco|bl|casa|cs|fundos|sobrado|conjunto|cj|andar|sala)\b\s*\d|\bcond(?:ominio)?\b/;

/**
 * O nome do lugar: 2 a 80, sem controle bidirecional, **sem endereco dentro** e
 * sem contato nem pagamento.
 */
export function errosDoNomeDoLugar(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 80);
  if (tamanho.length > 0) return tamanho;
  if (temContatoOuPagamentoSemEndereco(valor)) return [erroDeContato(campo)];
  const { base, letras } = normalizarParaConferencia(valor.normalize('NFKC'));
  const semNumeroDoNome = base.replace(NUMERO_NO_NOME_DO_LOGRADOURO, ' logradouro ');
  const comLogradouro = LOGRADOURO.test(base) || LOGRADOURO.test(letras);
  const endereco =
    CEP.test(base) ||
    QUILOMETRO.test(base) ||
    SEM_NUMERO.test(base) ||
    NUMERO_LONGO.test(semNumeroDoNome) ||
    NUMERO_DE_PORTA.test(semNumeroDoNome) ||
    COMPLEMENTO.test(base) ||
    (comLogradouro && /\d/.test(semNumeroDoNome));
  if (endereco) {
    return [
      {
        field: campo,
        code: 'address_in_place_name',
        message:
          'Escreva só o nome do lugar, como as pessoas o chamam. Endereço, número e CEP não entram aqui.',
      },
    ];
  }
  return [];
}

function erroDeContato(campo: string): ProblemFieldError {
  return {
    field: campo,
    code: 'contact_or_payment_detected',
    message:
      'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
  };
}

/** Tamanho e **D59 juntos**, para todo texto que a comunidade escreve. */
export function errosDeTextoDeUsuario(
  campo: string,
  valor: string,
  minimo: number,
  maximo: number,
): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, minimo, maximo);
  if (tamanho.length > 0) return tamanho;
  if (!temContatoOuPagamento(valor)) return [];
  return [erroDeContato(campo)];
}

/** O lugar, como a comunidade o descreve: **tres rotulos e nada mais**. */
export interface LugarDaComunidade {
  readonly place_name: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

/** A capa, pelo `upload_id` de `createNetworkEventCoverUploadIntent`. */
export interface CapaDoCorpo {
  readonly upload_id: string;
  readonly alt_text?: string;
}

/** O corpo de `createNetworkEvent`, como o contrato o declara. */
export interface CorpoDoEncontroDaComunidade {
  readonly title: string;
  readonly summary: string;
  readonly place: LugarDaComunidade;
  readonly starts_at: string;
  readonly ends_at?: string;
  readonly time_zone?: string;
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly bring_items?: readonly string[];
  readonly notes?: string;
  readonly cover_image?: CapaDoCorpo;
  /**
   * Ate QUATRO imagens do encontro, **na ordem em que o autor as colocou**
   * (cliente, 29/10/2026: *"nas indicacoes de estabelecimento e eventos so esta
   * sendo possivel enviar uma imagem no app, devemos deixar enviar ate 4
   * imagens"*). A **primeira e a capa**, pela `position` e nao por um campo.
   *
   * **A rota de autorizacao e a QUE JA EXISTE**
   * (`createNetworkEventCoverUploadIntent`): o proposito e `network_event` nas
   * quatro, a minima e 600 x 338 nas quatro (a LARGURA decidida e 600, e a
   * altura sai da moldura 16:9 desde 03/11/2026) e a derivada e
   * `DERIVADAS_DO_ENCONTRO` nas quatro. Nao ha nada que distinga a segunda imagem da primeira no ENVIO.
   *
   * **SE EXCLUI com `cover_image`:** os dois no mesmo corpo sao `400`
   * (`code: cover_and_images_both_sent`). `cover_image` fica porque o APK
   * publicado so manda ele -- tira-lo seria `request-property-removed`.
   *
   * **Nao ha migracao nesta ponta:** `network_event_images.position` tem
   * `CHECK (position BETWEEN 0 AND 7)` desde a `20260928000004`, e o aplicativo
   * passa a ocupar quatro das oito posicoes que a tabela ja tinha.
   */
  readonly image_upload_ids?: readonly string[];
}

/** O corpo de `updateNetworkEvent` (`CommunityNetworkEventPatch`). */
export interface PatchDoEncontroDaComunidade {
  readonly title?: string;
  readonly summary?: string;
  readonly place?: LugarDaComunidade;
  readonly starts_at?: string;
  readonly ends_at?: string | null;
  readonly time_zone?: string;
  readonly accepted_sizes?: readonly string[];
  readonly dog_age?: string;
  readonly vaccination_required?: boolean;
  readonly fenced_off_leash_area?: boolean;
  readonly amenities?: readonly string[];
  readonly bring_items?: readonly string[];
  readonly notes?: string | null;
  readonly cover_image?: CapaDoCorpo | null;
}

export interface CorpoDoCancelamentoDaComunidade {
  readonly note: string;
}

/** O que o repositorio grava na criacao. */
export interface NovoEncontroDaComunidade {
  readonly id: string;
  readonly autor: string;
  readonly title: string;
  readonly summary: string;
  readonly lugar: Lugar;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timeZone: string;
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly observacoes: string | null;
  readonly portes: readonly string[];
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly capa: { readonly uploadId: string; readonly altText: string | null } | null;
  readonly agora: Instant;
}

/** O que a edicao grava. Campo ausente nao muda. */
export interface MudancaDoEncontroDaComunidade {
  readonly title?: string;
  readonly summary?: string;
  readonly lugar?: Lugar;
  readonly startsAt?: Date;
  readonly endsAt?: Date | null;
  readonly timeZone?: string;
  readonly idadeDosCaes?: string;
  readonly vacinacaoExigida?: boolean;
  readonly areaCercada?: boolean;
  readonly observacoes?: string | null;
}
