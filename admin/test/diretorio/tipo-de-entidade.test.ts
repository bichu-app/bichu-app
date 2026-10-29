/**
 * O TIPO DE ENTIDADE no painel do diretorio (`20261018000012`).
 *
 * ## POR QUE ESTE ARQUIVO EXISTE, E NAO UM APENDICE EM `dominio.test.ts`
 *
 * `vite.config.ts` coleta `test/**\/*.test.{ts,tsx}` e **so isso**. Os casos
 * escritos ao lado do codigo, em `src/diretorio/dominio.test.ts`, nunca
 * executam -- foi exatamente o que aconteceu na primeira tentativa deste lote:
 * tres casos escritos, suite verde, e o placar do painel parado em 462, sem
 * subir. Teste que nao roda e pior que teste ausente, porque parece cobertura.
 *
 * Arquivo proprio, e nao acrescimo ao `dominio.test.ts` de `test/`, por um
 * segundo motivo: em `origin/development` aquele arquivo acabou de ser MOVIDO
 * de `src/diretorio/` para `test/diretorio/`, e apendar nele seria escrever no
 * meio de um arquivo que outro ramo esta mudando de lugar.
 *
 * ## As iscas, e como cada uma foi provada
 *
 * Desligadas no codigo de producao em 18/10/2026, conferidas no disco, suite
 * rodada e reprovada, arquivo restaurado.
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `TIPOS_DE_ENTIDADE` sem a entrada `organization` | 2 |
 * | `ORDEM_DOS_TIPOS_DE_ENTIDADE` com um valor so | 1 |
 * | `organization` acrescentado a `ATIVIDADES` (os dois eixos confundidos) | 1 |
 */
import { describe, expect, it } from 'vitest';

import {
  ATIVIDADES,
  ORDEM_DOS_TIPOS_DE_ENTIDADE,
  TIPOS_DE_ENTIDADE,
} from '../../src/diretorio/dominio.ts';

/**
 * O TIPO DE ENTIDADE no painel (`20261018000012`).
 *
 * Iscas desligadas em 18/10/2026, conferidas no disco, suite rodada e
 * reprovada, arquivo restaurado:
 *
 * | o que foi desligado | `fail` |
 * |---|---|
 * | `TIPOS_DE_ENTIDADE` sem a entrada `organization` | 2 (compilador + caso) |
 * | `ORDEM_DOS_TIPOS_DE_ENTIDADE` com um valor so | 1 |
 */
describe('o tipo de entidade e eixo proprio, separado da atividade', () => {
  it('ONG tem rotulo proprio, e nao e uma atividade', () => {
    expect(TIPOS_DE_ENTIDADE.organization).toBe('ONG');
    // O contrapeso que importa: ONG NAO virou linha de `ATIVIDADES`. Se
    // alguem a acrescentar la, este caso cai -- e e ele que guarda a fronteira
    // entre "o que a entrada e" e "o que ela faz".
    expect(Object.keys(ATIVIDADES)).not.toContain('organization');
    expect(Object.keys(ATIVIDADES)).not.toContain('ngo');
  });

  it('o seletor oferece os dois valores, com profissional primeiro', () => {
    expect(ORDEM_DOS_TIPOS_DE_ENTIDADE).toEqual(['professional', 'organization']);
    // Nenhum valor do contrato fica sem rotulo: o seletor nao pode ter opcao
    // muda.
    for (const tipo of ORDEM_DOS_TIPOS_DE_ENTIDADE) {
      expect(TIPOS_DE_ENTIDADE[tipo]).toBeTruthy();
    }
  });

  it('as atividades crescem sem virar o outro eixo', () => {
    // ERAM SEIS, E SAO OITO desde 28/10/2026 (`store` e `hospital`,
    // `20261028000001`). Este caso nao e mais "a lista nao cresce" -- ela
    // cresceu, por decisao do cliente e com o preco de contrato pago.
    //
    // O que ele guarda e a FRONTEIRA, que nao mudou: a lista pode ganhar
    // ATIVIDADE e nunca TIPO DE ENTIDADE. `organization` e `professional` nao
    // entram aqui por mais que a lista cresca, e e esse o contrapeso --
    // "profissional autonomo" chegou a ser pedido como atividade em 28/10 e o
    // proprio cliente o devolveu ao eixo do tipo.
    // **A LISTA EXATA SAIU DESTE CASO EM 29/10/2026**, e saiu porque ela estava
    // em dois lugares: aqui e em `rotulos-das-atividades.test.ts`. Duas listas
    // da mesma coisa dao duas manutencoes, e a entrada de `boarding` e
    // `daycare` fez esta reprovar por um motivo que nao e o assunto dela. Quem
    // guarda o conjunto exato agora e aquele arquivo, que tambem o compara com
    // o `enum` Dart; aqui fica so a FRONTEIRA.
    //
    // O tamanho continua afirmado, porque "a lista pode crescer" nao e o mesmo
    // que "a lista pode encolher sem ninguem ver".
    expect(Object.keys(ATIVIDADES).length).toBeGreaterThanOrEqual(10);
    for (const tipoDeEntidade of Object.keys(TIPOS_DE_ENTIDADE)) {
      expect(Object.keys(ATIVIDADES)).not.toContain(tipoDeEntidade);
    }
  });
});
