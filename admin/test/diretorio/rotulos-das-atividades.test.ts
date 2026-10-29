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
 * um teste de Vitest importar Dart.
 *
 * ## ELA DEIXOU DE SER FROUXA EM 29/10/2026, E A RAZAO E UM DEFEITO MEDIDO
 *
 * Ate 28/10 este arquivo comparava **tres** valores (`clinic`, `walker`,
 * `sitter`) e dizia por que: *"um caso que exigisse o conjunto inteiro igual
 * reprovaria no dia em que o contrato ganhasse um valor que o APK publicado
 * ainda nao conhece"*.
 *
 * **O argumento confundia duas coisas.** Valor que o app nao conhece nao
 * aparece no `enum` Dart e e tratado por `AtividadeDoDiretorio.porCodigo`, que
 * devolve nulo -- isso continua sendo desenho do app. Mas valor que o app
 * CONHECE e rotula DIFERENTE do painel e defeito, e era exatamente o que a
 * frouxura deixava passar: `hospital` e `store` entraram em 28/10 nos dois lados
 * **com o casamento feito a mao**, sem nenhum caso cobrando.
 *
 * Agora a comparacao e sobre **os valores que os DOIS lados declaram**: todo
 * codigo de `ATIVIDADES` que o `enum` Dart tambem declara tem de ter o MESMO
 * rotulo. Valor que o Dart ainda nao tem e PULADO e CONTADO, e o caso exige que
 * a contagem comparada seja a esperada -- sem isso, um regex que deixasse de
 * casar pularia tudo e o arquivo ficaria verde sem comparar nada.
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

import {
  ATIVIDADES,
  ORDEM_DAS_ATIVIDADES,
  ORDEM_DOS_TIPOS_DE_ENTIDADE,
  TIPOS_DE_ENTIDADE,
} from '../../src/diretorio/dominio.ts';

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

/**
 * O rotulo que o `enum` Dart da a um valor de fio **quando o nome do membro nao
 * e o valor**.
 *
 * `AtividadeDoDiretorio` declara `clinic('clinic', 'Clínica')` -- membro e valor
 * sao a mesma palavra, e `rotuloNoDart` acima casa os dois. `TipoDeEntidade`
 * declara `profissional('professional', 'Profissional ou estabelecimento')`: o
 * membro esta em portugues e o valor em ingles, entao aquele regex nao casa
 * nada. Um caso que reusasse `rotuloNoDart` para o tipo de entidade acharia
 * `undefined` nos dois valores, pularia os dois e **ficaria verde sem comparar
 * rotulo nenhum** -- que e exatamente o verde falso que o cabecalho deste
 * arquivo descreve. Por isso o segundo regex casa **so pelo valor de fio**.
 */
function rotuloNoDartPorValor(valor: string): string | undefined {
  const achado = new RegExp(`\\('${valor}',\\s*'([^']+)'\\)`).exec(DART);
  return achado?.[1];
}

describe('os rotulos das atividades (cliente, 28 e 29/10/2026)', () => {
  it('`clinic` e so "Clínica": o painel deixou de dizer "ou estabelecimento"', () => {
    expect(ATIVIDADES.clinic).toBe('Clínica');
  });

  it('`walker` e "Dog Walker" e `sitter` e "Pet Sitter"', () => {
    expect(ATIVIDADES.walker).toBe('Dog Walker');
    expect(ATIVIDADES.sitter).toBe('Pet Sitter');
  });

  it('`sitter` NAO voltou a ser "Hospedagem": quem diz hospedagem e `boarding`', () => {
    // O rotulo "Hospedagem" em `sitter` divergia do valor desde o primeiro
    // commit da listagem de `Perto`, e a troca de 28/10 corrigiu o rotulo. Em
    // 29/10 o cliente separou os dois servicos de verdade: *"Nao e um ou outro,
    // sao todos .. hospedagem, pet sitter, sao coisas diferentes"*.
    //
    // Este caso existe porque a reversao era tentadora e estava errada: ela
    // reintroduziria a divergencia de meses.
    expect(ATIVIDADES.sitter).not.toBe('Hospedagem');
    expect(ATIVIDADES.boarding).toBe('Hospedagem');
    expect(ATIVIDADES.daycare).toBe('Creche');
  });

  it('os tres valores de fio NAO mudaram com a renomeacao', () => {
    // Renomear rotulo nao mexe em `enum`: os tres codigos continuam existindo.
    // Se este caso cair, alguem trocou um VALOR pensando que trocava um nome.
    for (const codigo of ['clinic', 'walker', 'sitter'] as const) {
      expect(Object.keys(ATIVIDADES)).toContain(codigo);
    }
  });

  it('as DEZ atividades tem rotulo, e o seletor oferece exatamente elas', () => {
    // `store` e `hospital` entraram em 28/10/2026 (`20261028000001`), `boarding`
    // e `daycare` em 29/10 (`20261029000002`). O `satisfies Record<TipoDaEntrada,
    // string>` ja obriga o rotulo no compilador; este caso guarda a outra
    // metade, que o compilador nao ve: a ORDEM do seletor nao pode esquecer um
    // valor nem inventar um.
    expect(Object.keys(ATIVIDADES).sort()).toEqual(
      [
        'clinic',
        'hospital',
        'store',
        'boarding',
        'daycare',
        'vet',
        'groomer',
        'walker',
        'sitter',
        'trainer',
      ].sort(),
    );
    expect([...ORDEM_DAS_ATIVIDADES].sort()).toEqual(Object.keys(ATIVIDADES).sort());
    expect(ATIVIDADES.store).toBe('Loja');
    expect(ATIVIDADES.hospital).toBe('Hospital');
  });

  describe('os TIPOS DE ENTIDADE (cliente, 29/10/2026)', () => {
    // Pedido do cliente, verbatim: *"esta faltando o campo se e um
    // profissional, ong ou estabelecimento"*, no formulario de INDICAR do
    // aplicativo.
    //
    // **O painel ja mostrava os dois rotulos; o app nao tinha o campo.** O PR
    // #103 entregou `entity_kind` no servidor, no contrato, na migracao
    // `20261029000003` e no modelo Dart, e deixou o seletor da tela de fora --
    // quem indicava pelo APK publicado gravava `professional` em silencio. A
    // BICHUS-317b pos o campo na tela, e **com o campo na tela a divergencia de
    // rotulo passa a ser possivel**: antes dele nao havia dois lados para
    // divergir.
    //
    // Estes casos existem por isso, e pelo precedente medido logo acima:
    // `sitter` dizia 'Hospedagem' no Dart e outra coisa no painel por MESES,
    // com os dois lados verdes, porque o `openapi.yaml` lista o `enum` e nunca
    // descreveu rotulo. Nao existe portao de contrato que pegue rotulo.

    it('os DOIS rotulos sao os que o cliente definiu', () => {
      expect(TIPOS_DE_ENTIDADE.professional).toBe('Profissional ou estabelecimento');
      expect(TIPOS_DE_ENTIDADE.organization).toBe('ONG');
    });

    it('sao exatamente DOIS, e o seletor oferece exatamente eles', () => {
      // `EntityKind` tem dois valores. Um terceiro aqui quer dizer que alguem
      // respondeu ao pedido do cliente -- que nomeia TRES coisas -- alargando o
      // `enum` em vez de usar os dois eixos: estabelecimento e ATIVIDADE
      // (`store`, `hospital`, `clinic`), nao tipo de entidade.
      expect(Object.keys(TIPOS_DE_ENTIDADE).sort()).toEqual(
        ['professional', 'organization'].sort(),
      );
      expect([...ORDEM_DOS_TIPOS_DE_ENTIDADE].sort()).toEqual(
        Object.keys(TIPOS_DE_ENTIDADE).sort(),
      );
    });

    it('o painel e o aplicativo dizem a MESMA coisa nos DOIS valores', () => {
      const comparados: string[] = [];
      for (const codigo of Object.keys(TIPOS_DE_ENTIDADE) as (keyof typeof TIPOS_DE_ENTIDADE)[]) {
        const noDart = rotuloNoDartPorValor(codigo);
        expect(
          noDart,
          `${codigo} nao tem rotulo no enum Dart TipoDeEntidade -- ou o regex ` +
            `deixou de casar, e ai este caso nao esta medindo nada`,
        ).toBeDefined();
        expect(noDart, `${codigo} divergente entre painel e app`).toBe(
          TIPOS_DE_ENTIDADE[codigo],
        );
        comparados.push(codigo);
      }
      // O CONTROLE POSITIVO: sem esta linha, um regex que deixasse de casar
      // tornaria o laco vazio e o caso ficaria verde sem comparar nada. Os
      // `toBeDefined` acima pegam o caso de um valor; este pega o caso de
      // `Object.keys` vir vazio.
      expect(comparados.length, `comparados: ${comparados.join(', ')}`).toBe(2);
    });
  });

  it('o painel e o aplicativo dizem a MESMA coisa para TODOS os valores que os dois declaram', () => {
    // A cobertura passou de TRES para TODOS em 29/10/2026 -- ver o cabecalho.
    const comparados: string[] = [];
    const semDart: string[] = [];
    for (const codigo of Object.keys(ATIVIDADES) as (keyof typeof ATIVIDADES)[]) {
      const noDart = rotuloNoDart(codigo);
      if (noDart === undefined) {
        // Valor que o `enum` Dart ainda nao declara nao e divergencia: e o APK
        // que nao conhece o valor, e `AtividadeDoDiretorio.porCodigo` devolve
        // nulo para ele de proposito. Fica CONTADO, e a contagem e cobrada
        // abaixo.
        semDart.push(codigo);
        continue;
      }
      expect(noDart, `${codigo} divergente entre painel e app`).toBe(ATIVIDADES[codigo]);
      comparados.push(codigo);
    }
    // O CONTROLE POSITIVO, e ele e o que impede o verde falso: se o regex
    // deixasse de casar, todos cairiam em `semDart` e o laco nao compararia
    // rotulo nenhum. Hoje o Dart declara os dez, entao a contagem e dez e
    // `semDart` e vazio -- e o dia em que um valor novo entrar so no painel, a
    // lista o nomeia em vez de ele passar calado.
    expect(comparados.length, `comparados: ${comparados.join(', ')}`).toBe(10);
    expect(semDart, `sem rotulo no enum Dart: ${semDart.join(', ')}`).toEqual([]);
  });
});
