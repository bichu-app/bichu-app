/**
 * Comparacao de versao de aplicativo.
 *
 * ## Por que ela esta no SERVIDOR, e nao no aplicativo
 *
 * Comparacao de versao e onde se erra. O erro classico e a dezena: comparado
 * como TEXTO, `'1.10.0' < '1.9.0'` e verdadeiro, porque `'1'` vem antes de
 * `'9'`. Um aplicativo publicado com essa conta invertida bloqueia justamente
 * quem acabou de atualizar, e o conserto exige OUTRO aplicativo publicado --
 * que e o conserto mais lento que este produto tem.
 *
 * Aqui ela se conserta com um deploy do backend, e e por isso que o contrato
 * devolve um VEREDITO e nao o numero minimo: dar o numero ao aplicativo seria
 * convidar a segunda comparacao, e duas comparacoes sao dois resultados que um
 * dia divergem.
 *
 * ## O formato e tres numeros, e nada mais
 *
 * `MAIOR.MENOR.CORRECAO`, sem sufixo de pre-lancamento e sem `v`. Nenhum build
 * deste produto usa sufixo, e ordenar `1.2.0-rc.1` contra `1.2.0` e a parte da
 * ordenacao semantica que mais se erra. O mesmo formato esta escrito em tres
 * lugares, de proposito e nao por descuido:
 *
 * - `AppVersion.pattern` do contrato, que recusa o que o aplicativo manda;
 * - o `CHECK` de `app_version_policy`, que recusa o que a mao humana escreve;
 * - [lerVersao] aqui, que recusa o que chegar por qualquer outro caminho.
 *
 * Os tres recusam a MESMA coisa em pontos diferentes do percurso, e nenhum
 * deles pode faltar: o contrato nao protege contra `UPDATE` torto, o `CHECK`
 * nao protege contra um campo que mude de forma no futuro, e esta funcao e a
 * unica que roda nos dois casos.
 *
 * ## Valor que nao se entende NAO vira bloqueio
 *
 * [lerVersao] devolve `undefined` em vez de lancar, e [compararVersoes]
 * devolve `undefined` quando qualquer um dos lados nao se entende. Quem chama
 * trata `undefined` como "nao sei", e "nao sei" libera o uso -- nunca bloqueia.
 * Essa direcao e a decisao central deste mecanismo inteiro, e ela comeca aqui:
 * se esta funcao lancasse, o caminho de erro mais provavel do bloqueio seria
 * uma excecao, e excecao tratada tarde vira tela de bloqueio por engano.
 */

/** Os tres numeros de uma versao, ja lidos. */
export interface Versao {
  readonly maior: number;
  readonly menor: number;
  readonly correcao: number;
}

/**
 * Teto por componente, e ele e o MESMO do `pattern` do contrato
 * (`[1-9][0-9]{0,3}`): quatro digitos.
 *
 * Existe para que `'99999.0.0'` seja recusado aqui e no contrato pela mesma
 * regra. Sem teto, esta funcao aceitaria o que o contrato recusa, e a
 * divergencia apareceria como 400 numa ponta e veredito na outra.
 */
const MAIOR_COMPONENTE = 9999;

/**
 * Le `MAIOR.MENOR.CORRECAO`. Devolve `undefined` para qualquer outra coisa.
 *
 * Recusa, e cada recusa e um caso do teste: vazio, espaco em volta, `v` na
 * frente, dois componentes, quatro componentes, componente vazio, zero a
 * esquerda (`01`), sinal, sufixo de pre-lancamento, componente acima do teto,
 * e qualquer caractere que nao seja digito.
 *
 * **Zero a esquerda e recusado de proposito**: `'1.01.0'` e `'1.1.0'`
 * compararia igual, e duas grafias para a mesma versao e a porta de entrada de
 * "mas eu escrevi certo".
 */
export function lerVersao(bruta: string | null | undefined): Versao | undefined {
  if (typeof bruta !== 'string') return undefined;
  // Sem `trim()`: aparar o espaco aceitaria `' 1.4.0'`, que e o engano de
  // quem colou o valor de outro lugar. O `CHECK` do banco tambem o recusa, e
  // as duas recusas precisam concordar.
  const partes = bruta.split('.');
  if (partes.length !== 3) return undefined;
  const numeros: number[] = [];
  for (const parte of partes) {
    // `^0$|^[1-9][0-9]{0,3}$` e o mesmo que o contrato usa por componente.
    if (!/^(?:0|[1-9][0-9]{0,3})$/.test(parte)) return undefined;
    const numero = Number(parte);
    if (!Number.isInteger(numero) || numero < 0 || numero > MAIOR_COMPONENTE) return undefined;
    numeros.push(numero);
  }
  return { maior: numeros[0] ?? 0, menor: numeros[1] ?? 0, correcao: numeros[2] ?? 0 };
}

/**
 * Compara duas versoes ja lidas. Negativo, zero ou positivo, como um
 * comparador. **Numerico por componente**, que e o ponto do arquivo.
 */
export function compararLidas(a: Versao, b: Versao): number {
  if (a.maior !== b.maior) return a.maior - b.maior;
  if (a.menor !== b.menor) return a.menor - b.menor;
  return a.correcao - b.correcao;
}

/**
 * Compara duas versoes em texto. `undefined` quando qualquer um dos dois lados
 * nao se entende -- e `undefined` NUNCA bloqueia ninguem.
 */
export function compararVersoes(
  a: string | null | undefined,
  b: string | null | undefined,
): number | undefined {
  const lidaA = lerVersao(a);
  const lidaB = lerVersao(b);
  if (lidaA === undefined || lidaB === undefined) return undefined;
  return compararLidas(lidaA, lidaB);
}
