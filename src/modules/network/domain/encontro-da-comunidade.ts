/**
 * O encontro criado PELA COMUNIDADE (ADR-0025, emenda 3 de 17/10/2026).
 *
 * ## O que esta decidido aqui, e o que nao esta
 *
 * O encontro da comunidade nasce `pending_review` e **nao aparece em nenhuma
 * leitura publica antes de aprovado**: isso nao e um `if` deste arquivo, e sim
 * o predicado `publication_status IN ('published', 'cancelled')` que as
 * leituras da `Rede` ja carregam na clausula `WHERE` (ADR-0021), mais o
 * `CHECK network_events_revisao_so_da_comunidade` da `20260928000001`. Este
 * arquivo decide **quem pode criar**, **quantos**, e **o que o texto do lugar
 * nao pode conter**.
 *
 * ## A regua de quem pode criar e a MESMA de abrir caso de pet perdido
 *
 * Canal de contato verificado (`bloqueiosParaAbrirCaso`, em
 * `lostfound/domain/abertura-do-caso.ts`). Nao ha um segundo conceito de
 * "dados validados" neste produto, e inventar um criaria duas verdades sobre a
 * mesma pergunta. **Na pratica isso e e-mail confirmado**, porque nao existe
 * rota que verifique telefone: nada em `src/` grava `phone_verified_at`.
 *
 * ## Por que o teto e 3, o mesmo de caso aberto
 *
 * `TETO_DE_CASOS_ABERTOS_POR_CONTA` ja e 3 para a outra acao de peso do
 * produto, e o juizo e o mesmo: tres e mais do que uma pessoa organiza de
 * verdade ao mesmo tempo, e pouco o bastante para um teto de fila de moderacao
 * significar alguma coisa. Um numero novo aqui obrigaria a defender dois
 * numeros para a mesma pergunta.
 *
 * O teto conta o que esta **em revisao**, e nao o que foi criado: encontro
 * aprovado sai da conta na hora da aprovacao, e recusado tambem. Ele e o
 * segundo mecanismo, e nao o unico -- o primeiro e o teto de chamada por conta
 * declarado na rota (`x-rate-limit`, aplicado por `registrar-rota.ts`).
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  errosDeTexto,
  normalizarParaConferencia,
  type Entrada,
  type Lugar,
} from './escrita-do-encontro.js';

/**
 * Quantos encontros em revisao uma conta pode ter ao mesmo tempo. Ver o
 * cabecalho: e o mesmo 3 de `TETO_DE_CASOS_ABERTOS_POR_CONTA`.
 */
export const TETO_DE_ENCONTROS_EM_REVISAO = 3;

/** O bloqueio, no vocabulario que a tela sabe explicar. */
export type BloqueioParaCriarEncontro = 'contact_channel_unverified';

/**
 * O estado da conta para a criacao, lido numa consulta so, com a autorizacao
 * na clausula `WHERE` (ADR-0021).
 */
export interface EstadoParaCriarEncontro {
  /** E-mail OU telefone verificado. Preenchido e nao verificado nao conta. */
  readonly temCanalVerificado: boolean;
  /** Quantos encontros desta conta estao em `pending_review` agora. */
  readonly encontrosEmRevisao: number;
}

export function bloqueiosParaCriarEncontro(
  estado: EstadoParaCriarEncontro,
): BloqueioParaCriarEncontro[] {
  return estado.temCanalVerificado ? [] : ['contact_channel_unverified'];
}

export function atingiuTetoDeRevisao(estado: EstadoParaCriarEncontro): boolean {
  return estado.encontrosEmRevisao >= TETO_DE_ENCONTROS_EM_REVISAO;
}

// ---------------------------------------------------------------------------
// O nome do lugar, e o endereco que vazava dentro dele
// ---------------------------------------------------------------------------

/**
 * O CEP, nas duas formas em que se escreve. Ele nunca e parte do NOME de um
 * lugar, em nenhuma hipotese, e por isso e recusa isolada.
 */
const CEP = /(?<!\d)\d{5}-?\d{3}(?!\d)/;

/**
 * Palavra de logradouro. Lista aberta, com a abreviacao que as pessoas
 * escrevem. **Sozinha ela nao recusa nada**: "Avenida Paulista" e como se
 * chama o lugar, e recusa-la seria recusar o nome certo.
 */
const LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\b/;

/**
 * Logradouro seguido IMEDIATAMENTE do numero, que e quando o numero e parte do
 * NOME e nao a porta: "Rua 25 de Marco", "Avenida 9 de Julho", "Rua 3". Esta
 * forma e retirada do texto antes da conferencia do numero de porta -- sem
 * isso, o nome certo de uma rua com numero no nome seria recusado.
 */
const NUMERO_NO_NOME_DO_LOGRADOURO =
  /\b(?:rua|r|avenida|av|alameda|al|travessa|tv|estrada|est|rodovia|rod|via|viela|ladeira|servidao|marginal|anel|largo|rotula)\.?\s+\d{1,4}\b/g;

/**
 * O marcador de quilometro de rodovia. **Sempre recusa**, e nao entra na lista
 * de logradouro: "km 23" e endereco de rodovia inteiro, e o numero vem logo
 * depois do marcador -- a regra do numero-no-nome o deixaria passar.
 */
const QUILOMETRO = /\bkm\s*\.?\s*\d/;

/**
 * Numero de porta. E o que transforma um nome em endereco, e so aparece depois
 * de separador: virgula, hifen, `n`, `no`, `num`, `nro`, `numero` ou `#`.
 *
 * "Praca 14 de Janeiro", "Rua 25 de Marco" e "Quadra 302 Norte" NAO casam, e
 * isso e o ponto: nelas o numero e parte do nome e nao vem depois de
 * separador.
 */
const NUMERO_DE_PORTA = /(?:,\s*|\s-\s*|\bn\.?o?\.?\s*|\bnu?m?(?:ero)?\.?\s*|#\s*)\d{1,6}\b/;

/** Complemento de endereco residencial. Nunca e nome de lugar publico. */
const COMPLEMENTO = /\b(?:apto|apartamento|bloco|bl|casa|cs|fundos|sobrado|conjunto|cj|andar|sala)\b\s*\d|\bcond(?:ominio)?\b/;

/**
 * O nome do lugar: 2 a 80, sem controle bidirecional, **e sem endereco dentro**.
 *
 * ## O furo que esta funcao fecha, e ele foi medido
 *
 * `street_address` sai so em `getNetworkEventLocation`, com conta. Mas dois dos
 * encontros gravados pelo painel tem o endereco escrito DENTRO de
 * `place_name` ("Nome do lugar - Avenida tal, 200"), e `place_name` sai na
 * agenda publica, sem conta. A protecao do endereco era decorativa nesses dois.
 *
 * Na criacao pela comunidade ela deixa de ser. O que e recusado, com `400`:
 *
 * - **CEP**, sempre (`code: address_in_place_name`);
 * - **numero de porta depois de separador** (`, 200`, `- 200`, `nº 200`);
 * - **palavra de logradouro junto de numero que nao e parte do nome dela**
 *   ("Av. Brasil 1578", "Rua das Flores 12");
 * - **marcador de quilometro de rodovia** ("Rodovia Raposo Tavares km 23"),
 *   sempre, porque ali o numero vem logo depois do marcador;
 * - **complemento residencial** ("bloco 2", "apto 51", "condominio");
 * - telefone, e-mail, link, perfil `@usuario`, chave PIX e dados de pagamento,
 *   pela mesma regra de D59 que `errosDoEndereco` ja aplica.
 *
 * O que NAO e recusado, de proposito: palavra de logradouro sozinha, e numero
 * que e parte do nome. "Avenida Paulista", "Rua 25 de Marco", "Praca 14 de
 * Janeiro" e "Quadra 302 Norte" passam -- recusa-las obrigaria a pessoa a
 * mentir o nome do lugar, e e o nome que a agenda publica mostra.
 */
export function errosDoNomeDoLugar(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 80);
  if (tamanho.length > 0) return tamanho;
  const { base, letras } = normalizarParaConferencia(valor.normalize('NFKC'));
  // O numero que e parte do nome do logradouro sai do texto antes de a
  // conferencia do numero olhar: "Rua 25 de Marco" e um nome, e nao uma porta.
  const semNumeroDoNome = base.replace(NUMERO_NO_NOME_DO_LOGRADOURO, ' logradouro ');
  const comLogradouro = LOGRADOURO.test(base) || LOGRADOURO.test(letras);
  const endereco =
    CEP.test(base) ||
    QUILOMETRO.test(base) ||
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

// ---------------------------------------------------------------------------
// O que a comunidade manda, e o que ela nao pode mandar
// ---------------------------------------------------------------------------

/**
 * O lugar, como a comunidade o descreve: **tres rotulos e nada mais**.
 *
 * Nao ha `point` nem `street_address` aqui, e nenhum dos dois e esquecimento:
 * o ADR-0006 nao tem mapa nem busca de endereco nesta superficie, e o
 * endereco por extenso e campo do painel, que sai so em resposta autenticada.
 * Nao ha geocodificacao em nenhum ponto deste caminho.
 */
export interface LugarDaComunidade {
  readonly place_name: string;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
}

/**
 * O corpo de `createNetworkEvent`, como o contrato o declara.
 *
 * **O que a comunidade NAO manda, e por que**: `visibility` (encontro privado
 * tem fila de pedidos, que e trabalho de moderacao do painel), `admission` (o
 * Bichu nao cobra, e valor escrito por terceiro e pedido de moderacao de
 * dinheiro), `slug` (o servidor o deriva do titulo), `street_address` e
 * `point` (ADR-0006 e a privacidade do lugar), `ticket_url` e
 * `instagram_handle` (link em texto de terceiro e o vetor que D59 fecha) e
 * `images` (o envio de imagem hoje passa pela superficie administrativa; a
 * tela com foto e o despacho seguinte).
 */
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
}

/**
 * O que o repositorio grava. `origin` e `publication_status` nao sao opcao, e
 * **nao ha `slug`**: ele e derivado do titulo dentro da transacao, porque a
 * comunidade nao manda um e dois encontros com o mesmo titulo sao normais.
 */
export interface NovoEncontroDaComunidade {
  readonly id: string;
  readonly autor: string;
  readonly title: string;
  readonly summary: string;
  readonly lugar: Lugar;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly timeZone: string;
  readonly entrada: Entrada;
  readonly idadeDosCaes: string;
  readonly vacinacaoExigida: boolean;
  readonly areaCercada: boolean;
  readonly observacoes: string | null;
  readonly portes: readonly string[];
  readonly estrutura: readonly string[];
  readonly paraLevar: readonly string[];
  readonly agora: Instant;
}

/**
 * A resposta de `createNetworkEvent` (`NetworkEventSubmission`).
 *
 * **Sem UUID** (ADR-0010 item 6): a unica chave que sai e o `slug`. Sem
 * coordenada e sem endereco, porque nenhum dos dois entrou. O `slug` ja existe
 * na resposta porque e por ele que a tela vai perguntar pelo encontro depois
 * de a revisao aprovar -- antes disso a leitura publica responde 404, e e
 * assim que tem de ser.
 */
export interface EnvioProjetado {
  readonly slug: string;
  readonly title: string;
  readonly starts_at: string;
  readonly time_zone: string;
  readonly review_state: 'pending_review';
  readonly submitted_at: string;
}
