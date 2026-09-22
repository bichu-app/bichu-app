// Criterio 13 da BICHUS-62 — ISCA.
//
// "Portao que reprova hex literal e espacamento fora de `BichuEspaco`."
//
// Ele le o **codigo-fonte** dos arquivos que esta historia entrega, e nao a
// arvore renderizada. E de proposito: a cor errada so aparece na arvore no
// caso que alguem lembrou de montar, e o hex escrito num ramo que nenhum
// teste percorre passaria em silencio. A varredura de fonte pega os dois.
//
// O portao tem **autoteste**: os dois ultimos casos alimentam o mesmo
// verificador com codigo que ele PRECISA reprovar. Sem eles, no dia em que a
// expressao regular parasse de casar, o portao ficaria verde por nao achar
// nada -- que e a confianca falsa que este projeto persegue.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter_test/flutter_test.dart';

/// Os arquivos que esta historia escreveu. A lista e explicita: um portao que
/// varresse `lib/` inteiro reprovaria por codigo que nao e meu e seria
/// desligado na primeira execucao.
const List<String> arquivosDaHistoria = <String>[
  'lib/widgets/cartao_de_pet.dart',
  'lib/widgets/moldura.dart',
  'lib/telas/perfil/meus_pets.dart',
];

/// Um achado do portao: o arquivo, a linha e o motivo.
typedef Achado = ({String onde, int linha, String motivo, String trecho});

/// Os valores que `BichuEspaco` publica. Qualquer outro numero num lugar de
/// espacamento e uma medida escolhida a mao.
final Set<double> _espacosValidos = <double>{
  BichuEspaco.e0,
  BichuEspaco.e1,
  BichuEspaco.e2,
  BichuEspaco.e3,
  BichuEspaco.e4,
  BichuEspaco.e5,
  BichuEspaco.e6,
  BichuEspaco.e8,
  BichuEspaco.e10,
  BichuEspaco.e12,
  BichuEspaco.e16,
};

final Set<double> _raiosValidos = <double>{
  BichuRaio.none,
  BichuRaio.sm,
  BichuRaio.md,
  BichuRaio.lg,
  BichuRaio.xl,
  BichuRaio.full,
};

final RegExp _hexDart = RegExp(r'Color\(\s*0x[0-9a-fA-F]{6,8}');
final RegExp _hexCss = RegExp(r'#[0-9a-fA-F]{6}\b');
final RegExp _paletaDoMaterial = RegExp(r'\bColors\.[a-zA-Z]');
final RegExp _espacamento = RegExp(
  r'(EdgeInsets\.(?:all|symmetric|only|fromLTRB)|SizedBox|BorderRadius\.circular)'
  r'\(([^()]*)\)',
);
final RegExp _numeroSolto = RegExp(r'(?<![\w.])(\d+(?:\.\d+)?)(?![\w.])');

/// Roda o portao sobre um pedaco de codigo. E a mesma funcao que o autoteste
/// alimenta -- se ela nao for a mesma, o autoteste prova outra coisa.
List<Achado> conferir(String onde, String codigo) {
  final achados = <Achado>[];
  final linhas = const LineSplitter().convert(codigo);

  for (var i = 0; i < linhas.length; i++) {
    final linha = linhas[i];
    // Comentario nao pinta nada. O documento cita hex e medida o tempo todo, e
    // reprovar a prosa faria o portao ser desligado na primeira execucao.
    final semComentario = linha.replaceAll(RegExp(r'//.*$'), '');
    if (semComentario.trim().isEmpty) continue;

    void acusar(String motivo, String trecho) {
      achados.add((onde: onde, linha: i + 1, motivo: motivo, trecho: trecho));
    }

    for (final m in _hexDart.allMatches(semComentario)) {
      acusar('hex literal em Dart', m.group(0)!);
    }
    for (final m in _hexCss.allMatches(semComentario)) {
      acusar('hex literal', m.group(0)!);
    }
    for (final m in _paletaDoMaterial.allMatches(semComentario)) {
      acusar('paleta do Material em vez de papel do sistema', m.group(0)!);
    }

    for (final m in _espacamento.allMatches(semComentario)) {
      final construtor = m.group(1)!;
      final argumentos = m.group(2)!;
      final validos =
          construtor.startsWith('BorderRadius') ? _raiosValidos : _espacosValidos;
      for (final n in _numeroSolto.allMatches(argumentos)) {
        final valor = double.parse(n.group(1)!);
        if (validos.contains(valor)) continue;
        acusar(
          construtor.startsWith('BorderRadius')
              ? 'raio fora de BichuRaio'
              : 'espacamento fora de BichuEspaco',
          '$construtor(...$valor...)',
        );
      }
    }
  }
  return achados;
}

String _relatorio(List<Achado> achados) {
  return achados
      .map((a) => '  ${a.onde}:${a.linha} — ${a.motivo}: ${a.trecho}')
      .join('\n');
}

void main() {
  group('portao de tokens', () {
    test('os arquivos da BICHUS-62 nao tem hex nem medida a mao', () {
      final achados = <Achado>[];
      var lidos = 0;

      for (final caminho in arquivosDaHistoria) {
        final arquivo = File(caminho);
        // Verificacao que nao consegue verificar REPROVA. Um `if (existe)`
        // silencioso aqui deixaria o portao verde depois de um arquivo ser
        // renomeado, que e quando ele mais precisa falar.
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: "$caminho" nao existe. O portao de tokens ficaria '
              'sem o que conferir, e um portao que nao acha o que verificar '
              'reprova com o motivo, nunca aprova por ausencia.',
        );
        lidos += 1;
        achados.addAll(conferir(caminho, arquivo.readAsStringSync()));
      }

      expect(lidos, arquivosDaHistoria.length);
      expect(
        achados,
        isEmpty,
        reason: 'REPROVA: cor, espacamento ou raio escrito a mao.\n'
            '${_relatorio(achados)}\n'
            'A semente da marca virou Carmim em 21/09 (commit f0dccfe): todo '
            'valor sai de design/tokens.json, pelo tema.',
      );
    });

    test('AUTOTESTE: o portao reprova um hex literal', () {
      final achados = conferir('fixture', '''
        final cor = const Color(0xFF9E0B3A);
      ''');
      expect(
        achados.map((a) => a.motivo),
        contains('hex literal em Dart'),
        reason: 'REPROVA: o portao deixou passar um hex. Ele so vale enquanto '
            'consegue reprovar; sem este caso, uma expressao regular quebrada '
            'faria o portao aprovar tudo em silencio.',
      );
    });

    test('AUTOTESTE: o portao reprova espacamento fora de BichuEspaco', () {
      final achados = conferir('fixture', '''
        const EdgeInsets.all(15);
        const SizedBox(height: 7);
        BorderRadius.circular(9);
      ''');
      final motivos = achados.map((a) => a.motivo).toSet();
      expect(motivos, contains('espacamento fora de BichuEspaco'));
      expect(motivos, contains('raio fora de BichuRaio'));
      expect(achados, hasLength(3));
    });

    test('AUTOTESTE: o portao reprova a paleta do Material', () {
      final achados = conferir('fixture', 'color: Colors.red,');
      expect(
        achados.single.motivo,
        'paleta do Material em vez de papel do sistema',
      );
    });

    test('AUTOTESTE: o portao APROVA o que vem de token', () {
      // Portao que reprova tudo e tao inutil quanto portao que aprova tudo, e
      // some do CI do mesmo jeito.
      final achados = conferir('fixture', '''
        const EdgeInsets.all(BichuEspaco.e4);
        const SizedBox(height: BichuEspaco.e3);
        BorderRadius.circular(BichuRaio.lg);
        color: cores.primary,
      ''');
      expect(achados, isEmpty);
    });

    test('AUTOTESTE: comentario com hex nao e reprovado', () {
      final achados = conferir('fixture', '  // o Carmim e #9E0B3A hoje');
      expect(achados, isEmpty);
    });
  });

  group('a geometria da moldura vem de design/tokens.json', () {
    /// Sobe a arvore ate achar `design/tokens.json`, como a suite de
    /// acessibilidade faz. Levanta quando nao acha: sem o arquivo nao ha nada
    /// a conferir.
    Map<String, dynamic> tokens() {
      var dir = Directory.current.absolute;
      while (true) {
        final arquivo = File('${dir.path}/design/tokens.json');
        if (arquivo.existsSync()) {
          return jsonDecode(arquivo.readAsStringSync()) as Map<String, dynamic>;
        }
        final pai = dir.parent;
        if (pai.path == dir.path) break;
        dir = pai;
      }
      fail(
        'REPROVA: nao achei design/tokens.json subindo a partir de '
        '"${Directory.current.path}". Sem os tokens este caso nao tem o que '
        'comparar, e aprovar por ausencia e o defeito que ele existe para '
        'impedir.',
      );
    }

    double valor(Map<String, dynamic> t, String nome) {
      final grupo = t['moldura'] as Map<String, dynamic>?;
      expect(
        grupo,
        isNotNull,
        reason: 'REPROVA: design/tokens.json nao tem o grupo `moldura`.',
      );
      final item = grupo![nome] as Map<String, dynamic>?;
      expect(item, isNotNull, reason: 'REPROVA: falta `moldura.$nome`.');
      return (item![r'$value'] as num).toDouble();
    }

    test('proporcao e os dois raios batem com o JSON', () {
      // `tool/gen_tokens.dart` nao emite o grupo `moldura` (ele so atravessa
      // grupos de `$type: dimension`), entao a copia vive em `BichuMoldura`.
      // Copia sem portao e como o design system e o codigo se afastam sem
      // ninguem ver; este caso e o portao.
      final t = tokens();
      expect(BichuMoldura.proporcao, valor(t, 'proporcao'));
      expect(BichuMoldura.fatorDoRaioSuperior, valor(t, 'raio-superior'));
      expect(BichuMoldura.fatorDoRaioInferior, valor(t, 'raio-inferior'));
    });

    test('`foto/sm` do paragrafo 5.4 mede 56 x 62', () {
      expect(BichuMoldura.larguraFotoSm, 56);
      expect(
        BichuMoldura.alturaFotoSm.round(),
        62,
        reason: 'REPROVA: a altura de `foto/sm` deixou de bater com a tabela '
            'do paragrafo 5.4. Quem manda e `moldura.proporcao`; a tabela '
            'publica o mesmo valor arredondado.',
      );
    });
  });
}
