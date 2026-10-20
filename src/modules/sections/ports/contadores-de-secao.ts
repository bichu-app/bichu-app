/**
 * BICHUS-278 -- os tres numeros das abas `Pets` e `Rede`.
 *
 * **Inteiros e nao anulaveis**, e isso e deliberado: "ninguem contou ainda" e
 * estado do APLICATIVO -- chamada que nao aconteceu ou que falhou --, e nao
 * valor do servidor. Quem distingue nulo de zero e `ContadoresDeNaoLido` no
 * app, pela mesma regra que ja vale para `unread_count`.
 */
export interface ContadoresDeSecao {
  readonly perdidosNovos: number;
  readonly eventosNovos: number;
  readonly profissionaisNovos: number;
}
