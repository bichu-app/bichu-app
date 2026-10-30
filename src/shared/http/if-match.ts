/** O `If-Match` das escritas versionadas, lido NUM PONTO SO (Loja e Rede). */
export type VersaoLida =
  | { readonly tipo: 'ausente' }
  | { readonly tipo: 'numero'; readonly versao: number }
  | { readonly tipo: 'invalida' };

/** Os sufixos que o `encode` do Caddy acrescenta ao `ETag`, um por codificacao. */
export const SUFIXOS_DE_CODIFICACAO = ['gzip', 'zstd', 'br'] as const;

const FORMA = new RegExp(`^\\s*(?:W/)?"([1-9][0-9]{0,9})(?:-(?:${SUFIXOS_DE_CODIFICACAO.join('|')}))?"\\s*$`);

export function lerIfMatch(cabecalho: string | string[] | undefined): VersaoLida {
  if (cabecalho === undefined) return { tipo: 'ausente' };
  const valor = Array.isArray(cabecalho) ? cabecalho.join(',') : cabecalho;
  if (valor.trim() === '') return { tipo: 'ausente' };
  const casado = FORMA.exec(valor);
  if (casado === null) return { tipo: 'invalida' };
  const versao = Number(casado[1]);
  return Number.isSafeInteger(versao) && versao <= 2_147_483_647 ? { tipo: 'numero', versao } : { tipo: 'invalida' };
}

const MARCAS_DA_BORDA = new RegExp(`^(?:W/)?"(.*?)(?:-(?:${SUFIXOS_DE_CODIFICACAO.join('|')}))?"$`);

/** O `If-None-Match` de uma leitura condicional casa com o `ETag` atual? */
export function casaIfNoneMatch(cabecalho: string | string[] | undefined, etagAtual: string): boolean {
  if (cabecalho === undefined) return false;
  const valor = Array.isArray(cabecalho) ? cabecalho.join(',') : cabecalho;
  const atual = MARCAS_DA_BORDA.exec(etagAtual.trim())?.[1];
  if (atual === undefined) return false;
  return valor
    .split(',')
    .map((parte) => parte.trim())
    .some((parte) => parte === '*' || MARCAS_DA_BORDA.exec(parte)?.[1] === atual);
}
