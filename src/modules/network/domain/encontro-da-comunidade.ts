/**
 * O encontro criado PELA COMUNIDADE (ADR-0025, emenda 3 de 17/10/2026).
 *
 * ## O que a decisao do cliente tirou, e o que ela poe no lugar
 *
 * Nao ha fila de revisao. Palavras dele: *"porque teria evento recusado? o
 * usuario validado pode criar eventos sem aprovacao. A imagem de capa do evento
 * e publica"*. O encontro nasce `published`, aparece na agenda publica na hora,
 * e **quem criou administra aquele encontro** -- edita e cancela o proprio.
 *
 * Isso muda o peso deste arquivo: **nada olha o conteudo antes de publicar**.
 * As conferencias daqui deixaram de ser uma segunda rede atras da revisao
 * humana e passaram a ser a unica. Duas delas em particular:
 *
 * - `errosDoNomeDoLugar` e a UNICA protecao contra o vazamento medido do
 *   endereco pela agenda publica;
 * - `temContatoOuPagamento` (D59, reusado de `escrita-do-encontro.ts`) passa a
 *   valer em todo texto que a pessoa escreve, e nao so nas observacoes.
 *
 * **Nao ha moderacao automatica nem filtro de palavra**, e a ausencia e
 * deliberada: o cliente nao pediu.
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
 * verdade ao mesmo tempo, e pouco o bastante para o teto significar alguma
 * coisa. Um numero novo aqui obrigaria a defender dois numeros para a mesma
 * pergunta.
 *
 * O teto conta encontro **ativo** -- publicado e ainda nao encerrado. O que
 * terminou sai da conta sozinho, e o cancelado sai na hora do cancelamento. Ele
 * e o segundo mecanismo, e nao o unico: o primeiro e o teto de chamada por
 * conta declarado na rota. **Sem revisao, os dois sao a unica contencao de
 * volume**, e e por isso que os dois ficam.
 */
import type { ProblemFieldError } from '../../../shared/http/problem.js';
import type { Instant } from '../../../shared/types/brands.js';
import {
  errosDeTexto,
  normalizarParaConferencia,
  temContatoOuPagamento,
  temContatoOuPagamentoSemEndereco,
  type Lugar,
} from './escrita-do-encontro.js';

/**
 * Quantos encontros ATIVOS (publicados e nao encerrados) uma conta pode ter ao
 * mesmo tempo. Ver o cabecalho: e o mesmo 3 de
 * `TETO_DE_CASOS_ABERTOS_POR_CONTA`.
 */
export const TETO_DE_ENCONTROS_ATIVOS = 3;

/** O bloqueio, no vocabulario que a tela sabe explicar. */
export type BloqueioParaCriarEncontro = 'contact_channel_unverified';

/**
 * O estado da conta para a criacao, lido numa consulta so, com a autorizacao
 * na clausula `WHERE` (ADR-0021).
 */
export interface EstadoParaCriarEncontro {
  /** E-mail OU telefone verificado. Preenchido e nao verificado nao conta. */
  readonly temCanalVerificado: boolean;
  /** Quantos encontros desta conta estao publicados e ainda nao terminaram. */
  readonly encontrosAtivos: number;
}

export function bloqueiosParaCriarEncontro(
  estado: EstadoParaCriarEncontro,
): BloqueioParaCriarEncontro[] {
  return estado.temCanalVerificado ? [] : ['contact_channel_unverified'];
}

export function atingiuTetoDeEncontros(estado: EstadoParaCriarEncontro): boolean {
  return estado.encontrosAtivos >= TETO_DE_ENCONTROS_ATIVOS;
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

/**
 * "Sem numero", nas formas em que se escreve. E marcador de ENDERECO -- quem
 * escreve `s/n` esta preenchendo um campo de logradouro, nao nomeando um lugar.
 * Entrou no endurecimento de 17/10/2026, com a publicacao direta.
 *
 * O separador (`/` ou `.`) e OBRIGATORIO, e o `(?![a-z])` fecha a palavra: sem
 * os dois, "Praca S. Nicolau" seria recusada. O `o` opcional existe porque o
 * `º` de `s/nº` vira `o` na normalizacao NFKC, antes desta conferencia.
 */
const SEM_NUMERO = /\bs\s*[/.]\s*n(?:o|\u00ba)?(?![a-z])|\bsem\s+numero\b/;

/**
 * Quatro digitos seguidos ou mais. Numero de porta no Brasil e quase sempre de
 * quatro digitos, e nome de lugar com quatro digitos e raro ("Clube 2000" e o
 * contraexemplo honesto). Entrou no endurecimento de 17/10/2026 **com o
 * contraexemplo registrado**: a troca e recusar o raro para pegar o comum, e o
 * texto da recusa diz o que fazer ("escreva so o nome do lugar").
 */
const NUMERO_LONGO = /(?<!\d)\d{4,}(?!\d)/;

/** Complemento de endereco residencial. Nunca e nome de lugar publico. */
const COMPLEMENTO = /\b(?:apto|apartamento|bloco|bl|casa|cs|fundos|sobrado|conjunto|cj|andar|sala)\b\s*\d|\bcond(?:ominio)?\b/;

/**
 * O nome do lugar: 2 a 80, sem controle bidirecional, **sem endereco dentro** e
 * sem contato nem pagamento.
 *
 * ## O furo que esta funcao fecha, e ele foi medido
 *
 * `street_address` sai so em `getNetworkEventLocation`, com conta. Mas dois dos
 * encontros gravados pelo painel tem o endereco escrito DENTRO de
 * `place_name` ("Nome do lugar - Avenida tal, 200"), e `place_name` sai na
 * agenda publica, sem conta. A protecao do endereco era decorativa nesses dois.
 *
 * **Desde 17/10/2026 esta funcao e a UNICA protecao**, porque o encontro da
 * comunidade publica sem revisao humana. O que e recusado, com `400`
 * (`code: address_in_place_name`):
 *
 * - **CEP**, sempre;
 * - **numero de porta depois de separador** (`, 200`, `- 200`, `nº 200`);
 * - **`s/n`** e "sem numero";
 * - **quatro digitos seguidos ou mais**;
 * - **marcador de quilometro de rodovia** ("Rodovia Raposo Tavares km 23");
 * - **palavra de logradouro junto de numero que nao e parte do nome dela**
 *   ("Av. Brasil 1578", "Rua das Flores 12");
 * - **complemento residencial** ("bloco 2", "apto 51", "condominio").
 *
 * E, com `code: contact_or_payment_detected` e **antes** da conferencia do
 * endereco, o que D59 ja recusa em texto de usuario: telefone, e-mail, link,
 * encurtador, perfil `@usuario`, chave PIX e dados bancarios -- por
 * `temContatoOuPagamentoSemEndereco`, que e o detector das observacoes **menos
 * a parte de endereco dele**, porque o endereco aqui e julgado pelas regras
 * acima, que distinguem o nome da porta. Sem esse recorte o detector recusaria
 * "Avenida Paulista" por endereco; sem essa ordem, um telefone escrito no nome
 * do lugar sairia como `address_in_place_name`.
 *
 * O que NAO e recusado, de proposito: palavra de logradouro sozinha, e numero
 * que e parte do nome. "Avenida Paulista", "Rua 25 de Marco", "Praca 14 de
 * Janeiro" e "Quadra 302 Norte" passam -- recusa-las obrigaria a pessoa a
 * mentir o nome do lugar, e e o nome que a agenda publica mostra.
 */
export function errosDoNomeDoLugar(campo: string, valor: string): ProblemFieldError[] {
  const tamanho = errosDeTexto(campo, valor, 2, 80);
  if (tamanho.length > 0) return tamanho;
  // D59 vem ANTES do endereco, e com o detector SEM a parte de endereco. As
  // duas metades foram medidas, e cada uma conserta um erro de recusa:
  //
  // - **antes**: "Praca do Bairro (11) 98765-4321" tem telefone, e o telefone
  //   casa a regra do numero de quatro digitos. Com o endereco primeiro, a
  //   pessoa leria "escreva so o nome do lugar" para um texto cujo problema e
  //   o telefone -- a recusa certa pelo motivo errado, e a frase nao diz o que
  //   tirar;
  // - **sem endereco**: o detector inteiro recusa palavra de logradouro (ver
  //   `temContatoOuPagamentoSemEndereco`), e "Avenida Paulista" e como o lugar
  //   se chama. O endereco embutido continua recusado -- pela regra deste
  //   campo, logo abaixo, que distingue o nome da porta.
  if (temContatoOuPagamentoSemEndereco(valor)) return [erroDeContato(campo)];
  const { base, letras } = normalizarParaConferencia(valor.normalize('NFKC'));
  // O numero que e parte do nome do logradouro sai do texto antes de a
  // conferencia do numero olhar: "Rua 25 de Marco" e um nome, e nao uma porta.
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

/** A recusa de D59, na forma que `errosDeTextoDeUsuario` tambem devolve. */
function erroDeContato(campo: string): ProblemFieldError {
  return {
    field: campo,
    code: 'contact_or_payment_detected',
    message:
      'Este texto não pode ter telefone, e-mail, link, perfil, chave PIX nem dados de pagamento.',
  };
}

/**
 * Tamanho e **D59 juntos**, para todo texto que a comunidade escreve.
 *
 * Existe porque, sem revisao humana, a conferencia que era so das observacoes
 * passa a valer no titulo, na descricao e no texto alternativo da capa: um link
 * no titulo aparece na agenda publica exatamente como apareceria nas
 * observacoes. A funcao do detector e **a de `escrita-do-encontro.ts`**, nao uma
 * copia.
 */
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

/** A capa, pelo `upload_id` de `createNetworkEventCoverUploadIntent`. */
export interface CapaDoCorpo {
  readonly upload_id: string;
  readonly alt_text: string;
}

/**
 * O corpo de `createNetworkEvent`, como o contrato o declara.
 *
 * **O que a comunidade NAO manda, e por que**: `visibility` (encontro privado
 * tem fila de pedidos, que e trabalho de moderacao do painel), `admission` (o
 * Bichu nao cobra, e valor escrito por terceiro e pedido de moderacao de
 * dinheiro), `slug` (o servidor o deriva do titulo), `street_address` e
 * `point` (ADR-0006 e a privacidade do lugar) e `ticket_url` e
 * `instagram_handle` (link em texto de terceiro e o vetor que D59 fecha).
 *
 * **A capa entra** (`cover_image`), porque a imagem de capa e publica por
 * decisao do cliente de 17/10/2026.
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
  readonly cover_image?: CapaDoCorpo;
}

/**
 * O corpo de `updateNetworkEvent` (`CommunityNetworkEventPatch`). Campo ausente
 * nao muda; `null` em `ends_at`, `notes` e `cover_image` tira o valor.
 *
 * **Data, horario, fuso e lugar entram aqui** -- a unica diferenca em relacao
 * ao `PATCH` do painel, que os manda para `relocateAdminNetworkEvent`. Aquela
 * operacao existe pela cerimonia de T11 (motivo e aviso a todos os
 * administradores), que nao se aplica a quem corrige o proprio encontro; sem
 * eles, consertar a hora errada exigiria cancelar e criar de novo, gastando o
 * teto de 3.
 */
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

/** O que o repositorio grava na criacao. `origin` e o estado nao sao opcao. */
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
  readonly capa: { readonly uploadId: string; readonly altText: string } | null;
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
