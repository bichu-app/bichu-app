/**
 * A porta da politica de versao do aplicativo.
 *
 * Uma leitura e nada mais. Nao ha escrita por aqui de proposito: a politica e
 * trocada a mao, no banco, por quem opera o deploy (ver o cabecalho da
 * migracao `20261019000007`). Uma rota de escrita no backoffice seria outra
 * historia, e o cliente nao a pediu -- e, pior, ela faria o interruptor
 * depender do painel estar de pe no momento em que alguem precisa desligar o
 * bloqueio.
 */

/** As plataformas sobre as quais existe politica. */
export type PlataformaDoApp = 'android' | 'ios';

export const PLATAFORMAS_DO_APP: readonly PlataformaDoApp[] = ['android', 'ios'];

/**
 * A politica de uma plataforma, como ela esta no banco.
 *
 * Todos os campos sao anulaveis porque **nulo e o estado de hoje e e o estado
 * seguro**: nulo em `minimumVersion` nao bloqueia ninguem, nulo em
 * `recommendedVersion` nao avisa nada, e nulo em `storeUrl` faz a tela nao
 * desenhar botao.
 */
export interface PoliticaDeVersao {
  readonly minimumVersion: string | null;
  readonly recommendedVersion: string | null;
  readonly storeUrl: string | null;
}

export interface LeituraDaPoliticaDeVersao {
  /**
   * A politica da plataforma, ou `undefined` quando nao ha linha.
   *
   * **Nao lanca por ausencia** -- `undefined` e resposta legitima, e quem
   * chama a trata como "nada a dizer". Lanca so quando nao conseguiu
   * perguntar (banco fora), e quem chama trata isso tambem como "nada a
   * dizer".
   */
  politicaDe(plataforma: PlataformaDoApp): Promise<PoliticaDeVersao | undefined>;
}
