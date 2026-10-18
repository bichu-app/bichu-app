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

  it('as seis atividades seguem intocadas', () => {
    // `kind` nao ganhou nem perdeu valor: era isso que o eixo proprio
    // protegia.
    expect(Object.keys(ATIVIDADES).sort()).toEqual(
      ['clinic', 'groomer', 'sitter', 'trainer', 'vet', 'walker'].sort(),
    );
  });
});
