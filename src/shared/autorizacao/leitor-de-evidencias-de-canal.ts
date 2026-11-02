import type { UserId } from '../types/brands.js';
import type { AsDuasEvidencias } from './matriz-de-capacidades.js';

/**
 * **A leitura das DUAS evidencias de canal de uma conta.**
 *
 * Existe porque a matriz passou a ter exigencia de CONJUNCAO
 * (`os_dois_canais`, cliente de 02/11/2026), e conjuncao nao se avalia sobre o
 * booleano da disjuncao: `canalDeContatoConfirmadoNoSql` devolve "tem algum
 * canal", e dele nao sai "tem os dois".
 *
 * **Porta em `shared/` e nao em cada modulo**, porque dois modulos a usam
 * (`tags` e `messaging`) e modulo nao conversa com modulo a nao ser por porta.
 * O precedente e `shared/db/canal-de-contato-confirmado.ts`, que mora em
 * `shared/` por ser lido por cinco modulos.
 *
 * **O que ela NAO e:** ela nao decide nada. Quem decide e
 * `recusaDaCapacidade` / `recusaPorExigenciaDeCanal`, sobre o que esta porta
 * devolve.
 */
export interface LeitorDeEvidenciasDeCanal {
  /**
   * As duas evidencias da conta, ou `undefined` quando ela nao existe ou foi
   * apagada.
   *
   * **`undefined` nao e "sem evidencia":** e "nao ha conta". Quem chama trata os
   * dois casos diferente -- conta que nao existe e `404`/`401`, e conta sem
   * evidencia e a recusa da matriz, que diz o que fazer.
   */
  evidenciasDaConta(conta: UserId): Promise<AsDuasEvidencias | undefined>;
}
