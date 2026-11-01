// Qual tela `/encontro/{slug}` mostra, e como a data do encontro vira texto no
// fuso DELE. Modulo puro: testado em milissegundos, sem navegador
// (tests/unidade/telas-do-encontro.test.ts).
//
// A pagina e a NONA rota publica do site (emenda 4 do ADR-0017, decisao do
// cliente de 21/10/2026). Ela e alcancavel por qualquer pessoa da internet, sem
// conta, entao ela obedece ao teto da projecao publica -- e nao ao que o app
// logado ve.
import type { components } from '../api/generated/api.ts';
import type { Resultado } from './resultado.ts';

export type EncontroDaRede = components['schemas']['NetworkEvent'];
export type EncontroPublico = components['schemas']['NetworkEventPublic'];

/**
 * UMA RESPOSTA PARA SEIS SITUACOES, e isso e a decisao desta tela.
 *
 * As seis em que a pagina **nao** mostra encontro:
 *
 *   1. `slug` que nunca existiu;
 *   2. encontro que espera revisao (`pending_review`);
 *   3. encontro retirado pela moderacao (`removed`);
 *   4. encontro PRIVADO (o contrato devolve `NetworkEventPrivateTeaser`);
 *   5. encontro CANCELADO;
 *   6. encontro que JA TERMINOU.
 *
 * As tres primeiras ja chegam aqui como um 404 unico: o contrato de
 * `getNetworkEvent` responde "404 nos tres casos, com o mesmo corpo", porque
 * "distinguir contaria a um estranho que aquele `slug` existiu". As tres
 * ultimas sao decisao DESTA pagina, e ela usa a mesma regua -- a do
 * `lost-case-closed`, que o contrato da API descreve assim: *"os cinco sao a
 * MESMA resposta de proposito -- distinguir contaria a um estranho o que
 * aconteceu com o animal de outra pessoa, ou se aquele token existiu"*.
 *
 * Aplicada aqui, a regua da tres consequencias concretas:
 *
 * - **o privado nao se delata.** Se o privado tivesse uma tela propria ("este
 *   encontro e fechado"), quem tem um `slug` privado na mao -- reenviado por
 *   alguem que foi aprovado -- confirmaria que ele EXISTE. Com uma resposta so,
 *   ele e indistinguivel de um endereco digitado errado;
 * - **a moderacao nao se delata.** `removed` e `pending_review` nao podem ser
 *   separaveis de "nunca existiu", ou a pagina publica passa a contar o que a
 *   moderacao fez;
 * - **ninguem e levado a um lugar vazio.** Cancelado e encerrado nao convidam:
 *   quem abre este link nao tem conta, nao tem a agenda e nao tem como
 *   descobrir sozinho que aquilo acabou.
 *
 * **410 e nao 404 nas seis**, inclusive no `slug` que nunca existiu, pelo mesmo
 * motivo que `lost-case-closed` e 410 cobrindo "token desconhecido": dois
 * status distinguiriam exatamente o que esta regra existe para nao distinguir.
 */
export type TelaDoEncontro =
  | { tela: 'encontro'; http: 200; encontro: EncontroPublico }
  | { tela: 'indisponivel'; http: 410 }
  | { tela: 'espere'; http: 429; esperaSegundos: number | null }
  | { tela: 'fora-do-ar'; http: 503 }
  | { tela: 'erro'; http: number; correlationId: string | null };

/** O encontro que esta pagina mostra: publico, de pe e ainda nao terminado. */
function mostravel(encontro: EncontroDaRede): EncontroPublico | null {
  // `visibility` e a discriminante do `oneOf` do contrato. O teaser do privado
  // nao tem lugar nem horario -- nao haveria pagina para desenhar com ele, e e
  // por isso que esta checagem vem antes de qualquer outra.
  if (encontro.visibility !== 'public') return null;
  // Anotacao, e nao `as`: aqui o `if` acima JA estreitou a uniao do contrato
  // (`NetworkEvent = NetworkEventPublic | NetworkEventPrivateTeaser`) para o
  // publico, entao a assercao que estava aqui nao mudava tipo nenhum. A
  // anotacao diz a mesma coisa e e CONFERIDA -- `as` nao confere nada.
  const publico: EncontroPublico = encontro;
  if (publico.status === 'cancelled' || publico.status === 'ended') return null;
  return publico;
}

/** GET /v1/network/events/{eventSlug} (getNetworkEvent), chamado sem conta. */
export function telaDoEncontro(r: Resultado<EncontroDaRede>): TelaDoEncontro {
  if (r.tipo === 'ok') {
    const publico = mostravel(r.dados);
    return publico === null
      ? { tela: 'indisponivel', http: 410 }
      : { tela: 'encontro', http: 200, encontro: publico };
  }
  if (r.tipo === 'falha') return { tela: 'fora-do-ar', http: 503 };
  switch (r.slug) {
    // As tres do contrato (inexistente, `pending_review`, `removed`) chegam
    // todas como `not-found`, e saem como a MESMA tela das tres desta pagina.
    case 'not-found':
      return { tela: 'indisponivel', http: 410 };
    case 'validation-failed':
      // `eventSlug` tem forma declarada (3 a 30), e parametro fora da forma
      // responde 400. Para quem abriu um link torto o desfecho e o mesmo de um
      // endereco que nao existe, e dizer "o endereco esta malformado" nao da a
      // essa pessoa nenhuma saida que ela possa tomar.
      return { tela: 'indisponivel', http: 410 };
    case 'rate-limited':
      return { tela: 'espere', http: 429, esperaSegundos: r.esperaSegundos };
    case 'internal':
      return { tela: 'fora-do-ar', http: 503 };
    default:
      if (r.slug === null && r.problema === null && r.status >= 500) {
        return { tela: 'fora-do-ar', http: 503 };
      }
      return {
        tela: 'erro',
        http: r.status >= 400 && r.status < 600 ? r.status : 502,
        correlationId: r.problema?.correlation_id ?? null,
      };
  }
}

// ---------------------------------------------------------------------------
// O lugar, e o que dele e publico
// ---------------------------------------------------------------------------

/**
 * A linha do lugar: **nome do lugar, bairro, cidade e UF**, e nada mais fino.
 *
 * Os quatro rotulos de `NetworkEventPlace`, que o contrato declara como "o
 * lugar, em rotulo e **nunca em coordenada**". **Nao existe logradouro nesta
 * pagina**: `street_address` sai so em `getNetworkEventLocation`, com
 * `bearerAuth`, e o ADR-0027 item 21.2 diz que ele nunca sai "na agenda, no
 * detalhe publico, no teaser nem nos detalhes do privado". Esta pagina e lida
 * por quem nao tem conta, entao por o endereco nela seria publicar o que o
 * contrato guarda atras de conta.
 *
 * E nao ha coordenada de onde tirar: `NetworkEventPlace` nao tem `lat`, `lon`
 * nem distancia em precisao nenhuma, e o portao de contrato publico reprova
 * quem os acrescentar.
 */
export function linhaDoLugar(place: EncontroPublico['place']): string {
  return `${place.place_name}, ${place.neighborhood}, ${place.city} - ${place.state}`;
}

/** Bairro, cidade e UF, sem o nome do lugar: o subtitulo da capa. */
export function regiaoDoLugar(place: EncontroPublico['place']): string {
  return `${place.neighborhood}, ${place.city} - ${place.state}`;
}

// ---------------------------------------------------------------------------
// Data e hora, no fuso DO ENCONTRO
// ---------------------------------------------------------------------------

/**
 * A data por extenso, no fuso do encontro.
 *
 * `time_zone` e do EVENTO e nao do leitor, de proposito: quem abre o link de um
 * encontro em Sao Paulo estando em Lisboa precisa da hora de Sao Paulo -- a
 * hora de parede e a que a pessoa vai ler no relogio quando chegar la. O
 * contrato diz isso com estas letras em `starts_at`: "o instante absoluto. A
 * hora de PAREDE sai de `time_zone`".
 */
export function dataLonga(iso: string, timeZone: string): string | null {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(instante);
  } catch {
    // `time_zone` que o Intl nao conhece nao pode apagar a pagina inteira: a
    // tela cai para o horario sem data, que e menos do que queriamos e muito
    // mais do que uma excecao na renderizacao.
    return null;
  }
}

/** `9h` ou `9h30`, no fuso do encontro. */
function hora(instante: Date, timeZone: string): string | null {
  try {
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instante);
    const [h, m] = partes.split(':');
    if (h === undefined || m === undefined) return null;
    const semZero = String(Number(h));
    return m === '00' ? `${semZero}h` : `${semZero}h${m}`;
  } catch {
    return null;
  }
}

/**
 * A faixa de horario: `Das 9h as 11h`, ou `A partir das 9h` sem `ends_at`.
 *
 * Sem `ends_at` a frase **nao inventa duracao**. O contrato deixa o campo
 * anulavel e o encontro sem fim previsto e comum; escrever "das 9h as 11h" com
 * um fim chutado faria a pagina afirmar o que ninguem cadastrou.
 */
export function faixaDeHorario(
  inicioIso: string,
  fimIso: string | null | undefined,
  timeZone: string,
): string | null {
  const inicio = new Date(inicioIso);
  if (Number.isNaN(inicio.getTime())) return null;
  const h1 = hora(inicio, timeZone);
  if (h1 === null) return null;
  if (!fimIso) return `A partir das ${h1}`;
  const fim = new Date(fimIso);
  if (Number.isNaN(fim.getTime())) return `A partir das ${h1}`;
  const h2 = hora(fim, timeZone);
  return h2 === null ? `A partir das ${h1}` : `Das ${h1} às ${h2}`;
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

const UNIDADE: Record<string, string> = {
  per_pet: 'por pet',
  per_person: 'por pessoa',
  per_pair: 'por dupla (1 pessoa + 1 pet)',
  per_two_people: 'por dupla (2 pessoas)',
  // Legado, ainda valido e exibido como "por pet" (ADR-0027 item 22.2).
  per_dog: 'por pet',
};

/**
 * `Gratuito`, ou `R$ 30,00 por pessoa`.
 *
 * Unidade desconhecida mostra **so o valor**, sem unidade, que e exatamente o
 * que o aplicativo faz (`UnidadeDoPreco.porCodigo` devolve nulo). Um valor novo
 * no enum nao pode apagar o preco da tela.
 */
export function textoDaEntrada(admission: EncontroPublico['admission']): string {
  if (admission.kind !== 'paid' || !admission.price) return 'Gratuito';
  const { amount, currency, unit } = admission.price;
  let valor: string;
  try {
    valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
  } catch {
    valor = `${currency} ${(amount / 100).toFixed(2)}`;
  }
  const rotulo = unit === undefined || unit === null ? undefined : UNIDADE[unit];
  return rotulo === undefined ? valor : `${valor} ${rotulo}`;
}
