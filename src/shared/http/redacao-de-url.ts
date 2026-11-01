import { createHash } from 'node:crypto';

const CARACTERES_DO_RESUMO = 12;

const CAMINHO_DA_TAG = /(\/tags\/)([0-9A-Za-z][0-9A-Za-z-]{15,23})(?=$|[/?])/;

export function ocultarCodigoDaTagNaUrl(url: string): string {
  return url.replace(CAMINHO_DA_TAG, (_inteiro, prefixo: string, codigo: string) => {
    const resumo = createHash('sha256').update(codigo, 'utf8').digest('hex');
    return `${prefixo}sha256:${resumo.slice(0, CARACTERES_DO_RESUMO)}`;
  });
}
