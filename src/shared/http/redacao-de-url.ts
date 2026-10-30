/** O código da tag não entra no log de acesso em claro. */
import { createHash } from 'node:crypto';

/**
 * Prefixo do resumo. Doze caracteres hexadecimais são 48 bits: colidem com
 * probabilidade desprezível na escala de um log e não permitem recuperar nada.
 */
const CARACTERES_DO_RESUMO = 12;

/**
 * Casa os dois caminhos que carregam o código: `/v1/tags/<código>` e tudo o que
 * pende dele (`/owner-context`, `/found-reports`), com ou sem prefixo de versão.
 */
const CAMINHO_DA_TAG = /(\/tags\/)([0-9A-Za-z][0-9A-Za-z-]{15,23})(?=$|[/?])/;

export function ocultarCodigoDaTagNaUrl(url: string): string {
  return url.replace(CAMINHO_DA_TAG, (_inteiro, prefixo: string, codigo: string) => {
    const resumo = createHash('sha256').update(codigo, 'utf8').digest('hex');
    return `${prefixo}sha256:${resumo.slice(0, CARACTERES_DO_RESUMO)}`;
  });
}
