/**
 * A localização de referência do tutor: quantização e validade.
 *
 * Duas regras de produto vivem aqui, e as duas são do critério 5 da BICHUS-92:
 * a coordenada é **quantizada numa grade de cerca de 100 m antes de ir para o
 * banco**, e ela **vale 30 dias**. Nada neste arquivo toca banco, rede ou
 * relógio de parede — é o que permite provar as duas sem subir nada.
 *
 * ## Por que a grade é em graus, e não em metros
 *
 * A leitura intuitiva seria "arredonde para o múltiplo de 100 m mais próximo",
 * e ela obriga a escolher uma projeção métrica e uma zona por região do Brasil
 * — o mesmo problema que fez `lost_cases.last_seen_point` ser `geography` e não
 * `geometry`. A grade em graus não escolhe zona nenhuma e é a mesma conta em
 * Manaus e em Porto Alegre.
 *
 * O preço é que a célula não tem exatamente 100 m em toda parte, e o número
 * está medido em vez de estimado:
 *
 * | latitude | lado norte-sul | lado leste-oeste |
 * |---|---|---|
 * | 5° N (Roraima)   | 111 m | 111 m |
 * | 23° S (São Paulo)| 111 m | 102 m |
 * | 34° S (Chuí)     | 111 m |  92 m |
 *
 * Entre 92 m e 111 m. O contrato diz "cerca de 100 m" e `precision_m` sai 100,
 * que é a ordem de grandeza honesta. Um raio de 5 km não distingue 92 de 111.
 *
 * ## Por que o arredondamento é feito em inteiros
 *
 * `Math.round(v / 0.001) * 0.001` parece a mesma coisa e não é: `0.001` não tem
 * representação binária exata, e a multiplicação de volta produz valores como
 * `-23.550000000000004`. O banco guardaria um ponto que não é vértice de grade
 * nenhuma, e o teste que conferisse igualdade exata falharia por um motivo que
 * não tem nada a ver com a regra. `Math.round(v * 1000) / 1000` mantém a conta
 * em inteiro no passo que importa.
 */
import type { Instant } from '../../../shared/types/brands.js';

/** O lado da célula como ele SAI na resposta (`UserLocation.precision_m`). */
export const PRECISAO_EM_METROS = 100;

/**
 * Passo da grade, em graus. `0.001` porque é o passo cuja célula fica entre
 * 92 m e 111 m em todo o Brasil — ver a tabela no topo do arquivo.
 */
export const PASSO_DA_GRADE_EM_GRAUS = 0.001;

/** Casas decimais que o passo implica. Derivado, para as duas não divergirem. */
const FATOR_DA_GRADE = Math.round(1 / PASSO_DA_GRADE_EM_GRAUS);

/** 30 dias (ADR-0010, tabela de retenção). */
export const VALIDADE_EM_DIAS = 30;

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export type OrigemDaLocalizacao = 'device_gps' | 'map_pin';

export interface Coordenada {
  readonly lat: number;
  readonly lon: number;
}

/**
 * Snap para o vértice de grade mais próximo.
 *
 * Deslocamento máximo: meio passo, ou cerca de 55 m. A função é idempotente —
 * quantizar o que já está quantizado devolve o mesmo ponto —, e isso não é
 * curiosidade: é o que garante que reenviar a mesma localização não produza uma
 * linha diferente da anterior.
 *
 * O `+ 0` no fim existe por causa do zero negativo. `Math.round(-0.4)` é `-0` em
 * JavaScript, `-0` sobrevive à divisão, e `JSON.stringify(-0)` escreve `0`
 * enquanto `Object.is(-0, 0)` é `false`. Uma coordenada na linha do Equador ou
 * no meridiano viraria um valor que compara diferente de si mesmo depois de ir
 * e voltar do fio.
 */
export function quantizar(coordenada: Coordenada): Coordenada {
  return {
    lat: Math.round(coordenada.lat * FATOR_DA_GRADE) / FATOR_DA_GRADE + 0,
    lon: Math.round(coordenada.lon * FATOR_DA_GRADE) / FATOR_DA_GRADE + 0,
  };
}

/** Quando a localização capturada neste instante deixa de valer. */
export function validadeDe(capturadaEm: Instant): Instant {
  return (capturadaEm + VALIDADE_EM_DIAS * MILISSEGUNDOS_POR_DIA) as Instant;
}

/**
 * A localização como ela existe depois de gravada.
 *
 * `lat` e `lon` aqui são **sempre** os quantizados: não há forma desta
 * estrutura que carregue o bruto, e é por isso que o bruto não chega ao banco
 * por engano. Quem tem o bruto é o corpo da requisição, e ele morre na borda.
 */
export interface LocalizacaoDeReferencia {
  readonly lat: number;
  readonly lon: number;
  readonly precisaoEmMetros: number;
  readonly origem: OrigemDaLocalizacao;
  readonly capturadaEm: Instant;
  readonly expiraEm: Instant;
}

/**
 * Monta a localização a gravar a partir do que chegou do cliente.
 *
 * Ela é o único caminho para uma `LocalizacaoDeReferencia`, e por isso a
 * quantização não é um passo que alguém precisa lembrar de chamar.
 */
export function localizacaoAGravar(
  bruta: Coordenada,
  origem: OrigemDaLocalizacao,
  agora: Instant,
): LocalizacaoDeReferencia {
  const { lat, lon } = quantizar(bruta);
  return {
    lat,
    lon,
    precisaoEmMetros: PRECISAO_EM_METROS,
    origem,
    capturadaEm: agora,
    expiraEm: validadeDe(agora),
  };
}

/**
 * Vencida, a conta sai da base de alerta.
 *
 * A comparação é `>` e não `>=` de propósito: no milissegundo exato do
 * vencimento a localização já não vale. Um `>=` faria a janela ser de 30 dias
 * mais um milissegundo, o que não muda nada na prática e faz o teste de borda
 * precisar saber qual das duas foi escolhida.
 */
export function estaValida(localizacao: LocalizacaoDeReferencia, agora: Instant): boolean {
  return localizacao.expiraEm > agora;
}
