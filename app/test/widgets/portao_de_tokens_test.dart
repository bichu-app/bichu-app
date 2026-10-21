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
  // A listagem de `Perto` e o componente de topo de listagem entram na mesma
  // lista: eles sao a primeira tela do app com filtro e ordenacao, e o
  // distintivo de filtros e o selo de verificacao sao exatamente o tipo de
  // peca em que um hex literal entra sem ninguem notar.
  'lib/widgets/barra_de_listagem.dart',
  'lib/telas/perto/lista_do_diretorio.dart',
  // A `Rede` (BICHUS-251/279): a capa e o banner da marca sao pecas em que um
  // hex ou um 12 solto entrariam sem ninguem notar. O banner usa
  // `BichuCores.claro` e nao hex.
  //
  // **OS DOIS CAMINHOS VOLTARAM em 20/10/2026**, com os arquivos. Eles sairam
  // em 19/10 porque os arquivos sairam do repositorio --
  // `rede/encontro_da_rede.dart` (a pagina do evento) e
  // `rede/local_do_encontro.dart` (o mapa estatico, que so aquela pagina
  // desenhava) --, e o cliente corrigiu o pedido no dia seguinte: *"eu nao
  // pedi pra voce remover, eu pedi para remover o clique"*.
  //
  // O portao LE os arquivos da lista, entao a lista TEM de acompanhar o
  // repositorio nos dois sentidos: caminho que nao existe o faz reprovar por
  // leitura e nao por token; caminho que existe e nao esta aqui deixa um mapa
  // estatico com hex solto passar calado -- e `local_do_encontro.dart` e o
  // unico lugar do app que desenha um, com tinta de marcador e moldura.
  'lib/telas/rede/agenda_da_rede.dart',
  'lib/telas/rede/cartao_do_encontro.dart',
  'lib/telas/rede/encontro_da_rede.dart',
  'lib/telas/rede/local_do_encontro.dart',
  'lib/telas/rede/pecas_da_rede.dart',
  // O `Perfil` so com menus e a tela de dados pessoais (18/10/2026): o item de
  // menu e um controle novo com borda, icone e dois niveis de texto, e o
  // formulario tem bloco de leitura com fundo proprio -- exatamente o tipo de
  // peca em que um hex ou um 12 solto entram sem ninguem notar.
  'lib/widgets/item_de_menu.dart',
  'lib/telas/perfil/tela_dados_pessoais.dart',
  // OS TRES CAMINHOS DE CONEXAO (21/10/2026). O cartao de resultado da busca e
  // a tela do convite sao pecas novas com circulo colorido, fundo proprio,
  // selo de marco alcancado e trilha de progresso -- exatamente onde um hex ou
  // um 12 solto entram sem ninguem notar.
  'lib/telas/rede/busca_de_pessoas.dart',
  'lib/telas/rede/cartao_de_pessoa_encontrada.dart',
  'lib/telas/conexoes/convide_tutores.dart',
  // **`qr_do_convite.dart` NAO entra nesta lista, e a ausencia e deliberada.**
  // Ele e o unico widget novo que escreve cor a mao, e as duas cores dele sao
  // LEGITIMAS: preto e branco puros, cor por funcao optica do paragrafo 19.5.1
  // -- quem le o quadrado e uma camera de outro aparelho. Por o arquivo aqui
  // faria este portao reprovar o que o outro portao
  // (`test/a11y/prosa_dos_tokens_test.dart`) declara e cobra pelo numero: a
  // prosa de `design/tokens.json` diz QUATRO pontos de Dart, e dois deles sao
  // os dele.
  //
  // O precedente e o mesmo: `lib/telas/pet/tela_pet_cadastrado.dart`, que tem
  // os outros dois pontos, tambem nao esta aqui.
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
