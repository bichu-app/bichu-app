// O PORTAO DOS NOVE SVG DA MARCA.
//
// O BURACO QUE ELE FECHA, e ele e o achado da BICHUS-196: ate 22/09/2026 os
// arquivos de `design/marca/vetor/` nao tinham portao nenhum e nao eram
// referenciados por nada. `grep` em `app/lib/` e `app/pubspec.yaml` devolvia
// ZERO. Quem corrompesse, repintasse ou apagasse qualquer um deles deixava a
// esteira inteira verde.
//
// O QUE ESTE ARQUIVO EXIGE DE CADA UM DOS NOVE:
//
// 1. **Existir, e nem um a mais.** A pasta e comparada com [_pasta] nos dois
//    sentidos. Arquivo novo reprova pedindo uma linha de destino, porque SVG
//    de marca sem destino escrito e como os sete comecaram.
// 2. **Ter destino escrito.** Cada um diz se entra no app e por que. A
//    resposta "e insumo de impressao" e legitima; a ausencia de resposta nao e.
// 3. **Nao ter fonte viva.** `<text>`, `<tspan>` ou `font-family` em arquivo de
//    marca e a letra do logotipo virando outra letra na maquina que nao tem a
//    fonte. O logotipo e curva convertida (paragrafo 8.4 do design system).
// 4. **So ter cor que e token.** Todo `fill` hexadecimal precisa ser um
//    primitivo de `design/tokens.json`. E assim que "trocaram a cor de um SVG
//    da marca" deixa de ser silencioso.
// 5. **So usar M, C e Z.** E o que os dois derivadores emitem, e e o que
//    `caminhoDaMarca` sabe ler. Comando novo quer dizer que o arquivo veio de
//    outro lugar.
// 6. **Bater com o Dart gerado**, nos tres que o app consome. Divergencia aqui
//    quer dizer que alguem mexeu no SVG e nao rodou `dart run tool/gen_marca.dart`.
//
// O QUE ELE NAO FAZ: olhar o desenho. Geometria e conferencia de quem desenha.
// A metade que da para medir esta em `variante_reduzida_test.dart`, que
// rasteriza.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/theme/marca_vetor.g.dart';
import 'package:flutter_test/flutter_test.dart';

/// Os nove arquivos de `design/marca/vetor/`, e o destino de cada um.
///
/// `campo` nao nulo quer dizer que o APP consome aquele arquivo, pelo campo de
/// mesmo nome em [MarcaVetor]. Nulo quer dizer insumo, e o motivo vem junto.
const Map<String, ({String? campo, String destino})> _pasta =
    <String, ({String? campo, String destino})>{
  'simbolo.svg': (
    campo: 'simbolo',
    destino: 'App, por MarcaSimbolo, de 48px para cima. Tambem e a fonte da '
        'variante reduzida.',
  ),
  'simbolo-reduzido.svg': (
    campo: 'simboloReduzido',
    destino: 'App, por MarcaSimbolo, de 24px a 48px. E o que serve o icone de '
        'notificacao de 24dp e o favicon de 32px.',
  ),
  'lockup-sem-descritor.svg': (
    campo: 'lockupSemDescritor',
    destino: 'App: tela de abertura e barra de topo da Inicio deslogada. O '
        'lockup COM descritor tem piso de 160px e nao cabe numa barra.',
  ),
  'selo-reduzido.svg': (
    campo: null,
    destino: 'Insumo de favicon de 16px e de icone nativo. Nao e widget: em '
        '16px quem carrega a marca e o quadrado preenchido, e quadrado '
        'preenchido dentro do app viola a regra de contencao do paragrafo '
        '6.1.6 (preenchimento de marca so como acao e como selo).',
  ),
  'logotipo-horizontal.svg': (
    campo: null,
    destino: 'Insumo de e-mail, cartaz e impressao. Piso de 160px de largura '
        '(paragrafo 3.10): nao existe superficie no app com esse espaco para a '
        'marca, e forcar uma seria por o descritor abaixo do piso.',
  ),
  'icone-pilar-comunidade.svg': (campo: null, destino: _pilares),
  'icone-pilar-bairro.svg': (campo: null, destino: _pilares),
  'icone-pilar-proximidade.svg': (campo: null, destino: _pilares),
  'icone-pilar-encontros.svg': (campo: null, destino: _pilares),
};

const String _pilares =
    'Insumo de campanha e da home de visitante da fatia C, que esta bloqueada '
    'por ADR. Nao ha tela no MVP que mostre a fileira de pilares; por o icone '
    'no app agora seria inventar a superficie para justificar o arquivo.';

/// Papeis de camada e o primitivo de `design/tokens.json` de cada um.
const Map<String, String> _camadas = <String, String>{
  'tinta': 'raspberry.700',
  'manteiga': 'butter.400',
  'verde': 'sage.300',
  // No selo o desenho e o vazio claro dentro do quadrado da marca, e nao
  // tinta sobre fundo. Camada com outro papel de cor precisa de outro nome,
  // senao o portao cobraria a tinta da marca de um buraco.
  'vazado': 'neutral.25',
};

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (File('${dir.path}/design/tokens.json').existsSync() &&
        Directory('${dir.path}/design/marca/vetor').existsSync()) {
      return dir;
    }
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei design/tokens.json + design/marca/vetor/ subindo a '
    'partir de "${Directory.current.path}". Portao sem o que verificar reprova.',
  );
}

Map<String, dynamic> _tokens(Directory raiz) =>
    jsonDecode(File('${raiz.path}/design/tokens.json').readAsStringSync())
        as Map<String, dynamic>;

String _primitivo(Map<String, dynamic> tokens, String caminho) {
  Object? no = tokens;
  for (final chave in caminho.split('.')) {
    if (no is! Map<String, dynamic> || !no.containsKey(chave)) {
      fail('REPROVA: o token $caminho nao existe em design/tokens.json.');
    }
    no = no[chave];
  }
  return ((no! as Map<String, dynamic>)[r'$value']! as String).toUpperCase();
}

/// Todos os hexadecimais primitivos declarados em `design/tokens.json`.
Set<String> _paletaPrimitiva(Map<String, dynamic> tokens) {
  final saida = <String>{};
  void andar(Object? no) {
    if (no is! Map<String, dynamic>) return;
    final valor = no[r'$value'];
    if (valor is String && RegExp(r'^#[0-9A-Fa-f]{6}$').hasMatch(valor)) {
      saida.add(valor.toUpperCase());
      return;
    }
    for (final e in no.entries) {
      if (!e.key.startsWith(r'$')) andar(e.value);
    }
  }

  andar(tokens);
  return saida;
}

void main() {
  final raiz = _raizDoRepositorio();
  final pasta = Directory('${raiz.path}/design/marca/vetor');
  final tokens = _tokens(raiz);

  test('a pasta tem exatamente os nove SVG declarados, e nada mais', () {
    final noDisco = pasta
        .listSync()
        .whereType<File>()
        .map((f) => f.uri.pathSegments.last)
        .where((n) => n.endsWith('.svg'))
        .toSet();

    expect(
      noDisco,
      _pasta.keys.toSet(),
      reason: 'REPROVA: a pasta design/marca/vetor/ divergiu do declarado.\n'
          'No disco:   ${(noDisco.toList()..sort()).join(', ')}\n'
          'Declarado:  ${(_pasta.keys.toList()..sort()).join(', ')}\n'
          'Arquivo que sumiu e marca que sumiu sem quebrar build nenhum, que e '
          'o defeito que a BICHUS-196 registrou. Arquivo novo precisa de uma '
          'linha em _pasta dizendo se entra no app e por que.',
    );
  });

  test('todo destino declarado tem motivo escrito', () {
    for (final e in _pasta.entries) {
      expect(
        e.value.destino.length,
        greaterThan(40),
        reason: 'REPROVA: ${e.key} tem destino curto demais para ser motivo. '
            'A BICHUS-196 pede que a decisao fique ESCRITA, com o porque.',
      );
    }
    expect(
      _pasta.values.where((v) => v.campo != null).length,
      3,
      reason: 'REPROVA: o numero de SVG consumidos pelo app mudou. Isso e '
          'decisao de desenho, nao efeito colateral de um commit.',
    );
  });

  group('cada SVG', () {
    final paleta = _paletaPrimitiva(tokens);

    for (final nome in _pasta.keys) {
      final arquivo = File('${pasta.path}/$nome');

      test('$nome existe, nao tem fonte viva e so tem cor de token', () {
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: ${arquivo.path} nao existe.',
        );
        final svg = arquivo.readAsStringSync();

        for (final proibido in <String>['<text', '<tspan', 'font-family']) {
          expect(
            svg.contains(proibido),
            isFalse,
            reason: 'REPROVA: $nome carrega "$proibido". Logotipo e curva '
                'convertida (paragrafo 8.4): texto vivo num SVG de marca vira '
                'outra letra na maquina que nao tem a fonte, e ninguem percebe.',
          );
        }

        final vb = RegExp(r'viewBox="([^"]*)"').firstMatch(svg);
        expect(vb, isNotNull, reason: 'REPROVA: $nome nao tem viewBox.');
        expect(
          RegExp(r'-?\d+(?:\.\d+)?').allMatches(vb!.group(1)!).length,
          4,
          reason: 'REPROVA: o viewBox de $nome nao tem quatro numeros.',
        );

        for (final f in RegExp(r'fill="(#[0-9A-Fa-f]{6})"').allMatches(svg)) {
          expect(
            paleta.contains(f.group(1)!.toUpperCase()),
            isTrue,
            reason: 'REPROVA: $nome pinta ${f.group(1)}, que nao e primitivo '
                'de design/tokens.json. Cor da marca sai do token; hexadecimal '
                'solto num SVG e como a Framboesa sobreviveria a troca de '
                'semente sem ninguem ver.',
          );
        }

        for (final g
            in RegExp(r'<g id="([^"]+)"[^>]*fill="([^"]+)"').allMatches(svg)) {
          final primitivo = _camadas[g.group(1)!];
          expect(
            primitivo,
            isNotNull,
            reason: 'REPROVA: $nome tem a camada "${g.group(1)}", que nao esta '
                'no mapa de papeis. Camada nova e decisao de quem desenha.',
          );
          expect(
            g.group(2)!.toUpperCase(),
            _primitivo(tokens, primitivo!),
            reason: 'REPROVA: a camada "${g.group(1)}" de $nome saiu de '
                '$primitivo.',
          );
        }

        for (final d in RegExp(r'\sd="([^"]*)"').allMatches(svg)) {
          final estranho =
              RegExp('[A-Za-z]').allMatches(d.group(1)!).map((m) => m.group(0)!)
                  .where((c) => !<String>['M', 'C', 'Z'].contains(c))
                  .toSet();
          expect(
            estranho,
            isEmpty,
            reason: 'REPROVA: $nome usa os comandos $estranho. Os derivadores '
                'so emitem M, C e Z, e e so isso que `caminhoDaMarca` sabe ler '
                '— um arquivo com outro comando nao saiu deles.',
          );
        }
      });
    }
  });

  group('o Dart gerado bate com o SVG', () {
    const consumidos = <String, VetorDaMarca>{
      'simbolo.svg': MarcaVetor.simbolo,
      'simbolo-reduzido.svg': MarcaVetor.simboloReduzido,
      'lockup-sem-descritor.svg': MarcaVetor.lockupSemDescritor,
    };

    test('os tres campos de MarcaVetor sao os tres SVG declarados', () {
      expect(
        consumidos.keys.toSet(),
        _pasta.entries
            .where((e) => e.value.campo != null)
            .map((e) => e.key)
            .toSet(),
      );
    });

    for (final e in consumidos.entries) {
      test('${e.key}: viewBox e curvas identicos ao gerado', () {
        final svg = File('${pasta.path}/${e.key}').readAsStringSync();
        final vb = RegExp(r'-?\d+(?:\.\d+)?')
            .allMatches(
              RegExp(r'viewBox="([^"]*)"').firstMatch(svg)!.group(1)!,
            )
            .map((m) => double.parse(m.group(0)!))
            .toList();

        expect(
          <double>[
            e.value.origemX,
            e.value.origemY,
            e.value.largura,
            e.value.altura,
          ],
          vb,
          reason: 'REPROVA: o viewBox de ${e.key} mudou e '
              'lib/theme/marca_vetor.g.dart nao. Rode, de dentro de app/:\n'
              '    dart run tool/gen_marca.dart',
        );

        final noSvg = RegExp(
          r'<g id="([^"]+)"[^>]*>(.*?)</g>',
          dotAll: true,
        )
            .allMatches(svg)
            .map((g) => RegExp(r'd="([^"]*)"').firstMatch(g.group(2)!)!.group(1)!)
            .toList();

        expect(
          e.value.camadas.map((c) => c.d).toList(),
          noSvg,
          reason: 'REPROVA: as curvas de ${e.key} divergem do que esta em '
              'lib/theme/marca_vetor.g.dart. Rode, de dentro de app/:\n'
              '    dart run tool/gen_marca.dart',
        );
      });
    }
  });

  test('AUTOTESTE: um SVG com fonte viva e com cor fora do token REPROVA', () {
    // A isca precisa acusar. Aqui o arquivo defeituoso e montado em memoria,
    // com os dois defeitos que o portao existe para pegar, e as duas regras
    // sao aplicadas sobre ele. Se este caso ficar verde sem o `expect` abaixo
    // reprovar de verdade, o portao acima e decorativo.
    const defeituoso = '<svg viewBox="0 0 10 10">'
        '<text x="0" y="0" font-family="Plus Jakarta Sans">Bichu</text>'
        '<g id="tinta" fill="#922C4A"><path d="M0 0L10 10Z"/></g></svg>';

    expect(defeituoso.contains('<text'), isTrue);
    expect(defeituoso.contains('font-family'), isTrue);
    expect(
      _paletaPrimitiva(tokens).contains('#922C4A'),
      isFalse,
      reason: 'A Framboesa saiu de design/tokens.json em 21/09/2026. Se ela '
          'voltou, o portao de cor deste arquivo deixou de distinguir a marca '
          'velha da nova.',
    );
    expect(
      RegExp('[A-Za-z]')
          .allMatches('M0 0L10 10Z')
          .map((m) => m.group(0)!)
          .where((c) => !<String>['M', 'C', 'Z'].contains(c))
          .toSet(),
      <String>{'L'},
    );
  });
}
