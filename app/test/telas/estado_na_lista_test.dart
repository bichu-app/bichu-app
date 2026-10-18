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
      final nomes = estadosBrasileiros.map((ItemDeLista e) => e.rotulo).toList();
      final ordenados = <String>[...nomes]..sort();
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
