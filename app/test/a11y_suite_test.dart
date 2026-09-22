// Ponte que faz `flutter test` PURO enxergar a suite de acessibilidade.
//
// A suite mora em `test/a11y/` na RAIZ do repositorio, ao lado de
// `design/tokens.json`, porque a fonte dos tokens e unica e fica fora deste
// pacote (docs/06-design-system.md 18.2.2). `app/test/a11y` e um link
// simbolico para la, e `flutter test test/a11y` roda os 26 casos por esse
// caminho.
//
// O PROBLEMA que este arquivo resolve: a descoberta automatica do
// `flutter test` NAO atravessa link simbolico. Sem esta ponte, `flutter test`
// sem argumento via 56 testes e nenhum de acessibilidade -- um job verde que
// nunca olhou para o assunto, que e exatamente o tipo de portao que o
// paragrafo 18.2.1 existe para impedir.
//
// Acrescentou um arquivo em test/a11y/? Registre aqui. O ultimo teste deste
// arquivo REPROVA se voce esquecer.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'a11y/acao_de_controle_test.dart' as acao_de_controle;
import 'a11y/alvo_de_toque_test.dart' as alvo_de_toque;
import 'a11y/contraste_texto_test.dart' as contraste_texto;
import 'a11y/contraste_tokens_test.dart' as contraste_tokens;
import 'a11y/isca_test.dart' as isca;
import 'a11y/rotulo_acessivel_test.dart' as rotulo_acessivel;

/// Os arquivos ligados acima, pelo nome com que vivem em `test/a11y/`.
const List<String> _ligados = <String>[
  'acao_de_controle_test.dart',
  'alvo_de_toque_test.dart',
  'contraste_texto_test.dart',
  'contraste_tokens_test.dart',
  'isca_test.dart',
  'rotulo_acessivel_test.dart',
];

void main() {
  group('a11y/acao_de_controle', acao_de_controle.main);
  group('a11y/alvo_de_toque', alvo_de_toque.main);
  group('a11y/contraste_texto', contraste_texto.main);
  group('a11y/contraste_tokens', contraste_tokens.main);
  group('a11y/isca', isca.main);
  group('a11y/rotulo_acessivel', rotulo_acessivel.main);

  // A guarda da ponte. Sem ela, um arquivo novo em test/a11y/ fica invisivel
  // para `flutter test` e o buraco volta calado.
  test('todo *_test.dart de test/a11y esta ligado nesta ponte', () {
    final pasta = Directory('test/a11y');
    if (!pasta.existsSync()) {
      fail(
        'REPROVA: nao achei test/a11y a partir de "${Directory.current.path}". '
        'O link simbolico app/test/a11y sumiu, e com ele a suite inteira de '
        'acessibilidade deixou de rodar sem reprovar nada.',
      );
    }

    final noDisco = pasta
        .listSync()
        .whereType<File>()
        .map((f) => f.uri.pathSegments.last)
        .where((n) => n.endsWith('_test.dart'))
        .toList()
      ..sort();

    final naPonte = <String>[..._ligados]..sort();

    expect(
      noDisco,
      orderedEquals(naPonte),
      reason:
          'test/a11y/ e esta ponte divergiram.\n'
          '  no disco: $noDisco\n'
          '  na ponte: $naPonte\n'
          'Arquivo no disco e fora da ponte roda so com o caminho explicito e '
          'e invisivel para `flutter test` puro. Arquivo na ponte e fora do '
          'disco nem compila. Acrescente o import, o group e a entrada em '
          '_ligados.',
    );
  });
}
