/**
 * O `If-Match` das escritas versionadas, lido NUM PONTO SO (Loja e Rede).
 *
 * O `ETag` que o servidor emite e a versao entre aspas: `"3"`. Entre o
 * servidor e o painel mora a borda, e o `encode zstd gzip` do Caddy
 * ACRESCENTA o sufixo da codificacao ao `ETag` da resposta comprimida:
 * `"3-gzip"`, `"3-zstd"`, `"3-br"`. O painel devolve o que recebeu, e a
 * escrita caia em 412 sem ninguem ter alterado nada (provado em hml, log de
 * 05/10: `POST .../relocation` -> `precondition-failed`). O `W/` cobre a
 * borda que enfraquece o validador em vez de sufixa-lo.
 *
 * O que se tira e SO o que a borda poe: um `W/` na frente e um sufixo de
 * codificacao conhecido no fim. A versao de dentro continua conferida por
 * inteiro contra o banco: versao velha com sufixo continua 412.
 *
 * `ausente` vira 428; qualquer forma que nao seja uma versao (`*`, lixo,
 * sufixo desconhecido) vira 412: o contrato pede a versao que a pessoa leu, e
 * `*` e justamente "nao li nada".
 */
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

/**
 * O `If-None-Match` de uma leitura condicional casa com o `ETag` atual? A
 * comparacao e FRACA (RFC 9110 13.1.2), e por isso ignora o `W/` e o sufixo de
 * codificacao que a borda acrescenta: sem isso, o `"2026-09-17.2-gzip"` que o
 * cliente recebeu pela borda nunca casa com `"2026-09-17.2"` e a leitura
 * responde 200 inteira em vez de 304. Lista separada por virgula e `*` valem.
 */
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
