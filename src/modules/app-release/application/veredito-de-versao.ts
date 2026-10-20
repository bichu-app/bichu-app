/**
 * O VEREDITO: a unica funcao que decide se o aplicativo fecha.
 *
 * ====================================================================
 * A REGRA, E ELA E O CONTRARIO DO PADRAO
 * ====================================================================
 *
 * Todo o resto deste servico nega por omissao: credencial ausente e 401,
 * recurso que nao aparece no `WHERE` e 404, campo desconhecido no corpo e 400.
 * **Aqui e o oposto, e e deliberado:** falta de informacao LIBERA.
 *
 * O argumento e de assimetria de custo, e esta escrito para nao ser
 * "corrigido" por zelo mais tarde:
 *
 * - Deixar uma versao velha passar por um minuto custa um minuto de versao
 *   velha.
 * - Trancar a base inteira fora do produto por um erro de leitura custa o
 *   produto, para todos, ate alguem perceber e consertar -- e nao existe CD
 *   neste projeto, entao "consertar" e um roteiro manual.
 *
 * Entao `update_required` **nunca** sai de uma deducao. Ele sai de uma unica
 * conjuncao de fatos, todos positivos:
 *
 *   1. ha linha de politica para a plataforma que pediu, E
 *   2. `minimum_version` nao e nula, E
 *   3. `minimum_version` se entende como versao, E
 *   4. a versao que pediu se entende como versao, E
 *   5. a versao que pediu e ESTRITAMENTE MENOR que a minima.
 *
 * Falte qualquer uma das cinco, e o veredito e `supported`. Nao ha caminho em
 * que erro, ausencia ou valor ilegivel produzam bloqueio.
 *
 * ====================================================================
 * O AVISO BRANDO E OUTRO ESTADO, NAO UM GRAU DO MESMO
 * ====================================================================
 *
 * `update_recommended` sai pelas mesmas cinco condicoes aplicadas a
 * `recommended_version`, e **so e consultado quando o bloqueio nao se
 * aplica**. A ordem importa: uma versao abaixo das duas e bloqueio, nao
 * bilhete. Sem essa ordem, um `recommended_version` escrito mais alto que o
 * `minimum_version` transformaria bloqueio em aviso dispensavel em silencio --
 * que e a falha mais silenciosa que este mecanismo pode ter.
 */
import { compararVersoes } from '../domain/versao.js';
import type { PoliticaDeVersao } from '../ports/politica-de-versao.js';

/** Os tres vereditos do contrato (`AppVersionStatus.verdict`). */
export type VereditoDeVersao = 'supported' | 'update_recommended' | 'update_required';

export interface Veredito {
  readonly verdict: VereditoDeVersao;
  readonly storeUrl: string | null;
}

/** O veredito liberado, sem loja. O valor que toda ausencia produz. */
export const LIBERADO: Veredito = { verdict: 'supported', storeUrl: null };

/**
 * `true` somente quando [versao] e PROVADAMENTE menor que [piso].
 *
 * Qualquer outra coisa -- piso nulo, piso ilegivel, versao ilegivel, versao
 * igual, versao maior -- e `false`. O nome diz "provadamente" porque e isso
 * que a assinatura promete: nao "nao conseguiu provar que e maior".
 */
export function provadamenteAbaixo(
  versao: string | null | undefined,
  piso: string | null | undefined,
): boolean {
  if (piso === null || piso === undefined || piso === '') return false;
  const ordem = compararVersoes(versao, piso);
  if (ordem === undefined) return false;
  return ordem < 0;
}

/**
 * O veredito para [versaoDoApp] sob [politica].
 *
 * `politica` `undefined` e o caso de "nao ha linha" E o caso de "nao consegui
 * ler o banco" -- os dois chegam aqui iguais de proposito, porque os dois
 * significam a mesma coisa para a decisao: nada a dizer.
 */
export function vereditoPara(
  versaoDoApp: string | null | undefined,
  politica: PoliticaDeVersao | undefined,
): Veredito {
  if (politica === undefined) return LIBERADO;

  // `store_url` so acompanha veredito que peca acao. Mandar o endereco da loja
  // num `supported` seria dado de configuracao saindo para quem nao precisa
  // dele -- e esta rota e chamada sem conta nenhuma (ADR-0010).
  const loja = politica.storeUrl === '' ? null : politica.storeUrl;

  if (provadamenteAbaixo(versaoDoApp, politica.minimumVersion)) {
    return { verdict: 'update_required', storeUrl: loja };
  }
  if (provadamenteAbaixo(versaoDoApp, politica.recommendedVersion)) {
    return { verdict: 'update_recommended', storeUrl: loja };
  }
  return LIBERADO;
}
