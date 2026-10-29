/**
 * OS ROTULOS DAS ATIVIDADES, renomeados pelo cliente em 28/10/2026.
 *
 * Verbatim: *"alterar para clinica ao inves de clinica e estabelecimento,
 * alterar passeador para Dog Walker"*, e `sitter` passa a se chamar
 * *"Pet Sitter"*.
 *
 * **Nenhum dos tres toca o contrato.** Os valores de fio (`clinic`, `walker`,
 * `sitter`) nao mudaram: `sitter` JA EXISTIA, e "Pet Sitter" e o nome dele na
 * tela, nao um valor novo. Renomear rotulo nao e mudanca de `enum`, e por isso
 * este arquivo nao tem nada a dizer sobre `oasdiff`.
 *
 * ## POR QUE O ROTULO DO APP ENTRA NUM TESTE DO PAINEL
 *
 * O terceiro caso le `app/lib/api/modelos_diretorio.dart` do disco e compara
 * com o mapa do painel. Isso atravessa a fronteira de dois projetos de
 * proposito: os dois lados mostram a MESMA lista fechada para a mesma pessoa --
 * quem cadastra ve "Dog Walker" no painel e quem usa o aplicativo ve o rotulo
 * do `enum` Dart --, e **rotulo divergente entre painel e app e defeito**, nao
 * diferenca de superficie. Antes deste caso nada no repositorio reprovava a
 * divergencia: `clinic` chegou a 28/10 com `'Clínica'` no Dart e
 * `'Clínica ou estabelecimento'` no painel, e os dois lados passavam verdes.
 *
 * A comparacao e por LEITURA DE TEXTO e nao por importacao porque nao ha como
 * um teste de Vitest importar Dart. Ela e frouxa de proposito num ponto: le
 * so os tres valores que este lote renomeou. Um caso que exigisse o conjunto
 * inteiro igual reprovaria no dia em que o contrato ganhasse um valor que o
 * APK publicado ainda nao conhece -- e `AtividadeDoDiretorio.porCodigo`
 * devolver nulo para valor novo e desenho do app, nao falta.
 *
 * ## As iscas, e como cada uma foi provada
 *
 * Escritas ANTES da troca dos rotulos, com o codigo de producao intacto, e
 * conferidas reprovando (admin, 28/10/2026):
 *
 * | o que estava no codigo | `fail` |
 * |---|---|
 * | `clinic: 'Clínica ou estabelecimento'` | 1 |
 * | `walker: 'Passeador'` | 1 |
 * | `sitter: 'Hospedagem'` | 1 |
 * | Dart com `'Passeador'`/`'Hospedagem'` (a divergencia) | 1 |
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ATIVIDADES, ORDEM_DAS_ATIVIDADES } from '../../src/diretorio/dominio.ts';

/** O fonte do `enum` Dart que o aplicativo mostra. */
const DART = readFileSync(
  path.resolve(import.meta.dirname, '../../../app/lib/api/modelos_diretorio.dart'),
  'utf8',
);

/**
 * O rotulo que o `enum` Dart da a um valor de fio.
 *
 * Casa a linha `valor('valor', 'Rotulo'),` de `AtividadeDoDiretorio`.
 * **Devolve `undefined` quando nao casa**, e o caso cobra isso antes de
 * comparar: um regex que deixasse de casar devolveria "igual a nada" e o teste
 * passaria sem ter medido nada -- que e exatamente como um filtro que nao casa
 * vira verde falso.
 */
function rotuloNoDart(codigo: string): string | undefined {
  const achado = new RegExp(`\\b${codigo}\\('${codigo}',\\s*'([^']+)'\\)`).exec(DART);
  return achado?.[1];
}

describe('os rotulos das atividades (cliente, 28/10/2026)', () => {
  it('`clinic` e so "Clínica": o painel deixou de dizer "ou estabelecimento"', () => {
    expect(ATIVIDADES.clinic).toBe('Clínica');
  });

  it('`walker` e "Dog Walker" e `sitter` e "Pet Sitter"', () => {
    expect(ATIVIDADES.walker).toBe('Dog Walker');
    expect(ATIVIDADES.sitter).toBe('Pet Sitter');
  });

  it('os tres valores de fio NAO mudaram com a renomeacao', () => {
    // Renomear rotulo nao mexe em `enum`: os tres codigos continuam existindo.
    // Se este caso cair, alguem trocou um VALOR pensando que trocava um nome.
    for (const codigo of ['clinic', 'walker', 'sitter'] as const) {
      expect(Object.keys(ATIVIDADES)).toContain(codigo);
    }
  });

  it('as OITO atividades tem rotulo, e o seletor oferece exatamente elas', () => {
    // `store` e `hospital` entraram em 28/10/2026 (`20261028000001`). O
    // `satisfies Record<TipoDaEntrada, string>` ja obriga o rotulo no
    // compilador; este caso guarda a outra metade, que o compilador nao ve: a
    // ORDEM do seletor nao pode esquecer um valor nem inventar um.
    expect(Object.keys(ATIVIDADES).sort()).toEqual(
      ['clinic', 'hospital', 'store', 'vet', 'groomer', 'walker', 'sitter', 'trainer'].sort(),
    );
    expect([...ORDEM_DAS_ATIVIDADES].sort()).toEqual(Object.keys(ATIVIDADES).sort());
    expect(ATIVIDADES.store).toBe('Loja');
    expect(ATIVIDADES.hospital).toBe('Hospital');
  });

  it('o painel e o aplicativo dizem a MESMA coisa para os tres', () => {
    for (const codigo of ['clinic', 'walker', 'sitter'] as const) {
      const noDart = rotuloNoDart(codigo);
      // O controle positivo: o regex casou. Sem ele, `undefined === undefined`
      // passaria o caso inteiro sem comparar rotulo nenhum.
      expect(noDart, `o enum Dart nao declara ${codigo}`).toBeTypeOf('string');
      expect(noDart, `${codigo} divergente entre painel e app`).toBe(ATIVIDADES[codigo]);
    }
  });
});
