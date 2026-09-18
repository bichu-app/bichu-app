/**
 * O código da tag não entra no log de acesso em claro.
 *
 * Regra do ADR-0004, seção "Higiene da rota pública": o código viaja na URL
 * porque é isso que um QR codifica, e daí em diante ele é uma credencial ao
 * portador passeando por todo lugar que registra caminho de requisição. O log de
 * acesso é o pior desses lugares: ele é agregado, enviado para fora, guardado
 * por mais tempo que qualquer outra coisa e lido por gente que não precisa
 * daquele valor.
 *
 * **Registra-se o hash.** O que o log perde é a capacidade de abrir a página do
 * pet a partir de uma linha de log; o que ele mantém é a de correlacionar
 * leituras do mesmo código, que é para o que o log serve aqui.
 *
 * Isto não substitui a trilha de scans, que é o registro de produto. É higiene
 * do registro de infraestrutura, e as duas coisas existem por motivos
 * diferentes.
 */
import { createHash } from 'node:crypto';

/**
 * Prefixo do resumo. Doze caracteres hexadecimais são 48 bits: colidem com
 * probabilidade desprezível na escala de um log e não permitem recuperar nada.
 */
const CARACTERES_DO_RESUMO = 12;

/**
 * Casa os dois caminhos que carregam o código: `/v1/tags/<código>` e tudo o que
 * pende dele (`/owner-context`, `/found-reports`), com ou sem prefixo de versão.
 *
 * O segmento é capturado por tamanho e alfabeto, e não por "qualquer coisa": um
 * caminho que não é código não deve virar hash, porque aí o log deixa de dizer
 * o que aconteceu sem nenhum ganho.
 */
const CAMINHO_DA_TAG = /(\/tags\/)([0-9A-Za-z][0-9A-Za-z-]{25,39})(?=$|[/?])/;

export function ocultarCodigoDaTagNaUrl(url: string): string {
  return url.replace(CAMINHO_DA_TAG, (_inteiro, prefixo: string, codigo: string) => {
    const resumo = createHash('sha256').update(codigo, 'utf8').digest('hex');
    return `${prefixo}sha256:${resumo.slice(0, CARACTERES_DO_RESUMO)}`;
  });
}
