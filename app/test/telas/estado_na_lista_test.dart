// O campo de estado: lista de 27, nome na tela, SIGLA no contrato.
//
// **ESTES CASOS NAO FORAM RODADOS.** A tarefa que os escreveu proibia rodar
// suite.
//
// O que eles travam, e por que cada um:
//
//   1. **sao 27, e nao 26.** O Distrito Federal nao e estado e e a omissao
//      classica de lista feita de cabeca. Uma contagem solta ficaria verde com
//      26 + um repetido, entao o caso mede o TOTAL e a presenca do DF;
//   2. **o que viaja continua sendo a sigla.** `Area.state` do contrato e
//      `minLength: 2, maxLength: 2`; mandar "São Paulo" quebraria o contrato e
//      brigaria com o que ja esta gravado. Esta e a isca que importa;
//   3. **ordem alfabetica por NOME**, que e como se procura.
//
// Medido em 17/10/2026: `api/openapi.yaml` declara `state` sem `enum` e sem
// `pattern`, e o servidor nao tem lista de siglas -- o unico uso e
// `upper(state) = upper(?)`, um filtro do diretorio. Nao ha segunda fonte com
// que divergir, e e por isso que a lista pode morar no app.

import 'package:bichu/api/estados_brasileiros.dart';
import 'package:bichu/api/modelos_localizacao.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ISCA -- a lista de estados', () {
    test('tem 27 itens, com o Distrito Federal entre eles', () {
      expect(
        estadosBrasileiros.length,
        27,
        reason: 'REPROVA: a lista tem ${estadosBrasileiros.length} itens. Sao '
            '27: os 26 estados mais o Distrito Federal, que nao e estado e e '
            'justamente o que some de lista escrita de cabeca.',
      );
      expect(
        estadosBrasileiros.any((ItemDeLista e) => e.codigo == 'DF'),
        isTrue,
        reason: 'REPROVA: o Distrito Federal nao esta na lista, e Brasilia '
            'nao teria estado para escolher.',
      );
      final siglas = estadosBrasileiros.map((ItemDeLista e) => e.codigo);
      expect(
        siglas.toSet().length,
        27,
        reason: 'REPROVA: ha sigla repetida. A contagem de 27 ficaria verde '
            'com 26 estados e uma duplicata.',
      );
    });

    test('toda sigla tem DOIS caracteres, que e o que o contrato aceita', () {
      // `Area.state: { minLength: 2, maxLength: 2 }`. Uma sigla de tres
      // caracteres seria recusada com 400 depois de a pessoa preencher tudo.
      for (final estado in estadosBrasileiros) {
        expect(
          estado.codigo.length,
          2,
          reason: 'REPROVA: "${estado.codigo}" (${estado.rotulo}) nao tem dois '
              'caracteres, e `Area.state` do contrato exige exatamente dois.',
        );
      }
    });

    test('esta em ordem alfabetica por NOME', () {
      // **A comparacao e SEM acento, porque o alfabeto portugues nao separa
      // `a` de `ã`.**
      //
      // `List<String>.sort()` ordena por unidade de UTF-16, e ali `ã` (U+00E3,
      // 227) vem depois de qualquer letra minuscula. Com esse criterio o
      // oraculo exigia `Santa Catarina, Sergipe, São Paulo` e
      // `Pará, Paraná, Paraíba` -- que nao e ordem alfabetica em portugues, e
      // nao e a ordem em que alguem procura um estado numa lista de 27. A
      // lista do app esta certa (`São Paulo` antes de `Sergipe`, `Paraíba`
      // antes de `Paraná`); o errado era a regua.
      //
      // E **sem diferenca de caixa**, pela mesma razao: em UTF-16 toda
      // maiuscula vem antes de toda minuscula, e por isso o criterio cru poria
      // `Rio Grande do Norte` antes de `Rio de Janeiro` (`G` 71 < `d` 100).
      // Em portugues `Rio de Janeiro` vem primeiro, porque `d` vem antes de
      // `g` -- a caixa nao participa da ordem.
      //
      // Tirar o acento e a caixa dos dois lados mantem a afirmacao inteira --
      // a ordem continua sendo cobrada, item por item -- e passa a cobra-la no
      // alfabeto certo.
      String semAcento(String texto) {
        const comAcento = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
        const semEla = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
        final b = StringBuffer();
        for (final unidade in texto.split('')) {
          final i = comAcento.indexOf(unidade);
          b.write(i < 0 ? unidade : semEla[i]);
        }
        return b.toString();
      }

      final nomes = estadosBrasileiros.map((ItemDeLista e) => e.rotulo).toList();
      final ordenados = <String>[...nomes]
        ..sort(
          (a, b) =>
              semAcento(a).toLowerCase().compareTo(semAcento(b).toLowerCase()),
        );
      expect(
        nomes,
        ordenados,
        reason: 'REPROVA: a lista nao esta em ordem de nome. Com 27 itens e '
            'sem busca dentro do seletor, a ordem E a navegacao -- e ordenar '
            'por sigla poria "Espírito Santo" antes de "Distrito Federal".',
      );
    });

    test('o nome e o rotulo, e a sigla e o valor que vai no corpo', () {
      // A isca que importa: o corpo da requisicao. Uma tela que mandasse o
      // ROTULO passaria em qualquer verificacao visual.
      final sp = estadosBrasileiros.firstWhere(
        (ItemDeLista e) => e.rotulo == 'São Paulo',
      );
      final area = AreaDigitada.montar(cidade: 'Santos', uf: sp.codigo);
      expect(
        area?.noContrato['state'],
        'SP',
        reason: 'REPROVA: o corpo levou "${area?.noContrato['state']}" em '
            '`state`. A pessoa escolhe o nome; o que viaja e a sigla, e trocar '
            'isso quebra o contrato e o dado ja gravado.',
      );
    });
  });
}
