/**
 * O achado avulso: o que ele precisa ter, e o que sai dele.
 *
 * Sem banco, sem rede, sem relógio de parede — o instante chega como parâmetro.
 *
 * ## O que este arquivo NÃO faz, e por quê
 *
 * **Não transforma coordenada em endereço nem endereço em coordenada** (ADR-0006).
 * As duas representações de lugar chegam separadas e ficam separadas: o ponto vai
 * para `found_point` e serve à consulta de distância; o texto vai para
 * `found_city`/`found_neighborhood` e serve ao rótulo. Nenhuma das duas é
 * derivada da outra, aqui nem em lugar nenhum.
 *
 * **Não monta o rótulo de área por conta própria.** Ele sai de `rotuloDaArea`,
 * a MESMA função que o caso de perdido usa — ela nasceu em
 * `lostfound/domain/abertura-do-caso.ts` e passou a morar em
 * `shared/lugar/rotulo-de-area.ts` quando o segundo módulo precisou dela
 * (BICHUS-35). Uma segunda definição aqui divergiria da primeira na primeira vez
 * que uma das duas mudasse, e as duas aparecem lado a lado na mesma tela de
 * "possíveis correspondências".
 */

import { rotuloDaArea as rotuloDeAreaCompartilhado } from '../../../shared/lugar/rotulo-de-area.js';
import type { Instant } from '../../../shared/types/brands.js';
import type { Especie, Porte, Sexo } from './cruzamento.js';

/**
 * 30 dias. ADR-0010 ("dados do achador: vida do caso mais 30 dias") e a história
 * "Achado sem correspondência guardado por 30 dias", que esta destrava.
 */
export const RETENCAO_EM_DIAS = 30;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

/** Um minuto de folga para relógio de aparelho adiantado, que é comum. */
const FOLGA_DE_RELOGIO_EM_MILISSEGUNDOS = 60_000;

export interface OndeFoiAchado {
  readonly lat?: number | undefined;
  readonly lon?: number | undefined;
  readonly city?: string | undefined;
  readonly neighborhood?: string | undefined;
  readonly state?: string | undefined;
}

export interface AchadoAvulso {
  readonly especie: Especie;
  readonly porte: Porte;
  readonly sexo?: Sexo;
  readonly racaCodigo?: string;
  readonly racaTextoLivre?: string;
  readonly versaoDosDadosDeReferencia?: string;
  readonly corPrimariaCodigo?: string;
  readonly achadoEm: Instant;
  readonly onde: OndeFoiAchado;
  readonly observacao?: string;
  readonly shareToken?: string;
}

export interface ProblemaDeCampo {
  readonly field: string;
  readonly code: string;
  readonly message: string;
}

export const FAIXA_DE_LATITUDE = { min: -34, max: 6 } as const;
export const FAIXA_DE_LONGITUDE = { min: -74, max: -32 } as const;

export function temCoordenada(onde: OndeFoiAchado): boolean {
  return typeof onde.lat === 'number' && typeof onde.lon === 'number';
}

/**
 * Tem o mínimo para registrar: coordenada **ou** cidade.
 *
 * É o `anyOf: [location, area]` do `StrayFoundReportInput` e o critério 6 da
 * história — "a localização negada, e o achado é registrado do mesmo jeito".
 */
export function temOndeSuficiente(onde: OndeFoiAchado): boolean {
  return temCoordenada(onde) || (onde.city !== undefined && onde.city.trim() !== '');
}

/**
 * Tudo que recusa o registro, numa lista só.
 *
 * Lista e não primeiro erro: a tela do achado tem sete campos, e devolver um por
 * requisição faria quem está na rua com um animal no colo descobrir os problemas
 * um a um, com uma ida ao servidor entre cada um.
 */
export function recusasDoRegistro(achado: AchadoAvulso, agora: Instant): readonly ProblemaDeCampo[] {
  const recusas: ProblemaDeCampo[] = [];

  if (!temOndeSuficiente(achado.onde)) {
    recusas.push({
      field: 'area',
      code: 'required',
      message: 'Diga onde você achou: marque no mapa ou escreva o bairro e a cidade.',
    });
  }

  const { lat, lon } = achado.onde;
  if ((lat === undefined) !== (lon === undefined)) {
    recusas.push({
      field: lat === undefined ? 'location.lat' : 'location.lon',
      code: 'required',
      message: 'Latitude e longitude vão juntas.',
    });
  }
  if (lat !== undefined && (lat < FAIXA_DE_LATITUDE.min || lat > FAIXA_DE_LATITUDE.max)) {
    recusas.push({
      field: 'location.lat',
      code: 'out_of_range',
      message: 'Essa posição não parece ser do Brasil.',
    });
  }
  if (lon !== undefined && (lon < FAIXA_DE_LONGITUDE.min || lon > FAIXA_DE_LONGITUDE.max)) {
    recusas.push({
      field: 'location.lon',
      code: 'out_of_range',
      message: 'Essa posição não parece ser do Brasil.',
    });
  }

  // "Achei amanhã" é erro de digitação ou de fuso. Gravado assim, ele fura o
  // filtro 2 do cruzamento (achado antes do desaparecimento) na direção errada e
  // ordena a lista do tutor por uma data que não aconteceu.
  if (Number(achado.achadoEm) > Number(agora) + FOLGA_DE_RELOGIO_EM_MILISSEGUNDOS) {
    recusas.push({
      field: 'found_at',
      code: 'in_future',
      message: 'Essa data ainda não chegou.',
    });
  }

  // Raça em texto livre sem código é o campo que descreve sem ter o que
  // descrever. Mesma regra de `PetInput`, e o banco também a impõe.
  if (
    achado.racaTextoLivre !== undefined &&
    achado.racaTextoLivre.trim() !== '' &&
    (achado.racaCodigo === undefined || achado.racaCodigo.trim() === '')
  ) {
    recusas.push({
      field: 'breed_free_text',
      code: 'requires_breed_code',
      message: 'Escolha a raça na lista para poder escrever a descrição.',
    });
  }

  return recusas;
}

/**
 * Quando esta linha para de existir, se ela não virar correspondência.
 *
 * A partir da CRIAÇÃO e não do achado: uma pessoa que registra hoje um animal
 * que viu há três semanas não deve ter o relato apagado em nove dias.
 */
export function retencaoAPartirDe(criadoEm: Instant): Instant {
  return (Number(criadoEm) + RETENCAO_EM_DIAS * MILISSEGUNDOS_POR_DIA) as Instant;
}

/**
 * O rótulo de área que sai na resposta. Um invólucro tipado sobre a definição
 * compartilhada, e não uma cópia: mudar o formato mexe no caso de perdido
 * também, e é bom que isso apareça num lugar só.
 *
 * O parâmetro é `OndeFoiAchado`, com `lat` e `lon` dentro, **de propósito**: é o
 * que deixa o teste passar um achado com coordenada e exigir que o rótulo saia
 * sem ela. Um parâmetro que não aceitasse coordenada tornaria essa afirmação
 * inexprimível, e a proibição do ADR-0006 voltaria a ser uma ausência que
 * ninguém consegue reprovar.
 */
export function rotuloDaArea(onde: OndeFoiAchado): string | null {
  return rotuloDeAreaCompartilhado(onde);
}

/**
 * O que sai numa resposta de achado — e a lista é fechada aqui, campo a campo,
 * pelo que o `FoundReport` do contrato declara.
 *
 * Três ausências que não são esquecimento:
 *
 * - **coordenada**, em nenhuma forma. Nem para quem registrou: a pessoa já sabe
 *   onde ela estava, e o campo só existiria para vazar depois — por um log de
 *   depuração, por uma captura de tela, por uma rota pública nova que
 *   reaproveitasse este montador. É o mesmo argumento de `comoRespostaDoCaso`.
 * - **`reporter_user_id`, `case_id` e `pet_id`**. O ADR-0010 item 7 proíbe
 *   agrupar; devolver o caso a que um achado se ligou contaria ao autor do achado
 *   qual pet de qual tutor está sendo procurado, antes de qualquer confirmação
 *   humana.
 * - **contagem de achados da conta.** O repositório a tem na mão ao paginar, e
 *   devolvê-la "porque já está ali" seria a propriedade a mais que o portão de
 *   contrato, que só procura o que sumiu, não veria.
 */
export interface AchadoGravado {
  readonly id: string;
  readonly origin: 'tag_scan' | 'stray_report';
  readonly status: 'open' | 'matched' | 'closed';
  readonly especie: Especie | null;
  readonly porte: Porte | null;
  readonly cidade: string | null;
  readonly bairro: string | null;
  readonly achadoEm: Date;
  readonly temFoto: boolean;
  readonly observacao: string | null;
  readonly criadoEm: Date;
}
