/**
 * O que impede abrir um caso de perdido, e o que **não** impede.
 *
 * Esta é a decisão mais delicada do produto inteiro, e ela se resume a uma
 * pergunta: **quem está do outro lado?** Uma tutora em pânico, com o celular em
 * 11%, que não abre o app há quatro meses. Cada bloqueio aqui é uma porta
 * fechada na cara dela no pior momento da vida dela.
 *
 * Por isso a lista é curta e cada item se justifica sozinho:
 *
 * - **Canal de contato não verificado.** O caso dispara alerta para vizinhos e
 *   publica o animal numa lista pública. Se ninguém alcança o tutor, quem acha
 *   o animal avisa e o aviso cai no vazio — movimento sem reencontro, e a
 *   atenção de dezenas de pessoas gasta à toa.
 * - **Pet sem foto pronta.** A foto é o que faz alguém reconhecer o animal na
 *   rua. Um alerta sem foto pede que o vizinho reconheça "um cachorro caramelo
 *   de porte médio", que é metade dos cachorros do Brasil.
 * - **Pet já perdido.** Um segundo caso aberto para o mesmo animal divide a
 *   atenção e duplica o aviso para quem já foi avisado.
 *
 * ## O que NÃO é bloqueio, e a ausência é deliberada
 *
 * **Falta de coordenada não impede nada** (critério 5 de `BICHUS-21`). Ela reduz
 * o alcance, não a existência: sem centro não há raio, então o alerta de 5 km
 * não dispara — mas o caso entra na lista pública da cidade e do bairro, e a
 * tag continua levando quem achar o animal direto ao tutor. Bloquear aqui
 * excluiria exatamente quem negou a permissão de localização, que é muita gente
 * e especialmente quem instalou o app na pressa.
 */

/** Os três que o contrato declara em `LostCaseReachPreview.blockers`. */
export type Bloqueio = 'contact_channel_unverified' | 'pet_photo_missing' | 'pet_already_lost';

export interface EstadoParaAbertura {
  /** E-mail **ou** telefone verificado. Preenchido e não verificado não conta. */
  readonly temCanalVerificado: boolean;
  /** Foto em `ready`. `processing` não vale: ela ainda não serve a rota pública. */
  readonly temFotoPronta: boolean;
  readonly petJaTemCasoAberto: boolean;
  readonly casosAbertosDaConta: number;
}

/**
 * Teto de casos abertos simultâneos por conta (critério 8).
 *
 * Três, e o número tem duas razões que apontam para o mesmo lado. A primeira é
 * produto: vinte pets com vinte casos abertos é poluição sem uso legítimo. A
 * segunda é privacidade, e é a menos óbvia — a lista pública mostra bairro e
 * data, e uma conta que pudesse abrir vinte casos entregaria a um observador
 * uma **série** de vinte pontos no tempo e no espaço da mesma pessoa. O teto
 * limita o tamanho dessa série.
 */
export const TETO_DE_CASOS_ABERTOS_POR_CONTA = 3;

/**
 * Os bloqueios, na ordem em que a tela deve resolvê-los.
 *
 * A ordem não é arbitrária: verificar o e-mail é o que mais gente já pode fazer
 * na hora (o link está na caixa de entrada), e a foto exige sair da tela e
 * voltar. Pedir a mais difícil primeiro faz desistir quem resolveria a fácil.
 */
export function bloqueiosParaAbrirCaso(estado: EstadoParaAbertura): Bloqueio[] {
  const bloqueios: Bloqueio[] = [];
  if (!estado.temCanalVerificado) bloqueios.push('contact_channel_unverified');
  if (!estado.temFotoPronta) bloqueios.push('pet_photo_missing');
  if (estado.petJaTemCasoAberto) bloqueios.push('pet_already_lost');
  return bloqueios;
}

export function atingiuTetoDaConta(estado: EstadoParaAbertura): boolean {
  return estado.casosAbertosDaConta >= TETO_DE_CASOS_ABERTOS_POR_CONTA;
}

/** Onde o pet foi visto. Uma das duas, nunca nenhuma. */
import { rotuloDaArea as rotuloDeAreaCompartilhado } from '../../../shared/lugar/rotulo-de-area.js';

export interface OndeFoiVisto {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
}

/**
 * Verdadeiro quando o caso tem **centro**, e portanto pode ter raio.
 *
 * É o `LostCase.has_location` do contrato, e a tela usa ele para explicar por
 * que não houve alerta — em vez de deixar a seção de alcance vazia, que parece
 * defeito.
 */
export function temCoordenada(onde: OndeFoiVisto): boolean {
  return typeof onde.lat === 'number' && typeof onde.lon === 'number';
}

/** Tem o mínimo para abrir: coordenada **ou** cidade (critério 5). */
export function temOndeSuficiente(onde: OndeFoiVisto): boolean {
  return temCoordenada(onde) || (onde.city !== undefined && onde.city.trim() !== '');
}

/**
 * O rótulo de área que sai em **superfície pública**: "Bairro, Cidade".
 *
 * A definição MUDOU DE LUGAR na BICHUS-35 e continua sendo esta: ela agora mora
 * em `shared/lugar/rotulo-de-area.ts`, porque o achado avulso passou a precisar
 * do mesmo rótulo e módulo não enxerga o domínio de outro módulo (§6). O
 * raciocínio inteiro, inclusive por que não é uma porta nem uma cópia, está lá.
 *
 * A reexportação fica aqui para que quem já importava `rotuloDaArea` deste
 * arquivo continue importando do mesmo lugar, e para que `grep rotuloDaArea`
 * mostre os dois lados. O invólucro tipado em `OndeFoiVisto` também mantém a
 * afirmação que o teste deste módulo faz: passar `lat` e `lon` junto continua
 * compilando, e continua saindo sem coordenada nenhuma.
 */
export function rotuloDaArea(onde: OndeFoiVisto): string | null {
  return rotuloDeAreaCompartilhado(onde);
}
