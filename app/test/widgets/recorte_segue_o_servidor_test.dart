// A JANELA DE RECORTE SEGUE O SERVIDOR, e este arquivo LE o servidor.
//
// ===========================================================================
// O DEFEITO QUE ESTE PORTAO EXISTE PARA PEGAR
// ===========================================================================
// O recorte no aparelho (cliente, 29/10/2026) so cumpre o que promete -- *"o
// que esta dentro da moldura e o que vai ser enviado"* -- se a moldura tiver a
// proporcao com que o SERVIDOR corta a derivada.
//
// Em `src/modules/media/domain/derivadas.ts`, **`altura` presente significa
// `fit: 'cover'`**: o servidor CORTA a imagem naquela proporcao. O proprio
// arquivo cita o cliente pedindo isso (*"vamos cropar a imagem na
// proporcao"*). Entao uma janela de 1:1 para um destino que o servidor corta
// em 1024 x 1126 produziria este desfecho:
//
//   1. a pessoa enquadra o rosto do pet no quadrado e confirma;
//   2. o app envia o quadrado, exatamente como prometeu;
//   3. o servidor corta AQUELE quadrado em 1024 x 1126 e joga fora uma faixa;
//   4. a pessoa ve a foto cortada num lugar que ela nao escolheu.
//
// Ou seja: o relato de 28/10 -- *"voce esta cropando no lugar errado"* -- de
// volta, por um caminho novo, com o recurso novo instalado e todos os portoes
// verdes. Foi esta medicao, em 29/10/2026, que mudou a forma da janela da foto
// NA CONVERSA de livre para 1024 x 1126.
//
// ===========================================================================
// POR QUE ELE LE O ARQUIVO .TS, E NAO REPETE OS NUMEROS
// ===========================================================================
// O app e Dart e o servidor e TypeScript: nao ha como importar a constante. A
// alternativa honesta a um comentario e esta -- ler o arquivo do servidor do
// DISCO, extrair as dimensoes e comparar com cada constante de
// `FormatoDoRecorte`. Um numero que mude la reprova aqui, com o nome do
// proposito na mensagem.
//
// **A PROVA DE QUE O LEITOR ENXERGA** e o grupo `autoteste do leitor`: ele
// mede o extrator contra texto escrito no proprio caso. Sem ele, uma mudanca
// de formatacao em `derivadas.ts` faria o extrator achar ZERO dimensoes, a
// varredura ficaria vazia e este arquivo passaria VERDE medindo nada -- que e
// o defeito que esta casa ja viu em filtro de teste, em job de CI e em grep.

import 'dart:io';

import 'package:bichu/widgets/recorte_de_imagem.dart';
import 'package:flutter_test/flutter_test.dart';

/// Onde mora a geometria das derivadas.
///
/// **Relativo a `app/`, com o `../`**: `flutter test` roda com o diretorio
/// de trabalho no pacote, e nao na raiz do repositorio -- medido em
/// 29/10/2026, quando o `setUpAll` reprovou sem o `../`.
const String caminhoDasDerivadas = '../src/modules/media/domain/derivadas.ts';

/// Uma dimensao lida de `derivadas.ts`.
class DimensaoDaDerivada {
  const DimensaoDaDerivada({
    required this.variante,
    required this.largura,
    required this.altura,
  });

  final String variante;
  final int largura;

  /// Nulo e `fit: 'inside'`: o servidor **nao corta**, so limita a largura.
  final int? altura;

  double? get aspecto => altura == null ? null : largura / altura!;

  @override
  String toString() => '$variante ${largura}x${altura ?? 'livre'}';
}

/// Extrai, de um texto de `derivadas.ts`, as dimensoes de cada `export const`.
///
/// Devolve o nome do export para a lista de dimensoes que ele declara, na
/// ordem em que aparecem.
///
/// Reconhece as duas formas do arquivo: a lista
/// (`export const X: readonly EspecificacaoDaDerivada[] = [ { ... }, ... ];`)
/// e o objeto unico (`export const Y: EspecificacaoDaDerivada = { ... };`).
Map<String, List<DimensaoDaDerivada>> dimensoesDe(String fonte) {
  final resultado = <String, List<DimensaoDaDerivada>>{};
  // O nome do export, e depois tudo ate o `;` que o fecha.
  final deExport = RegExp(
    r'export\s+const\s+([A-Z0-9_]+)\s*:[^=]*=\s*(.*?);\s*$',
    multiLine: true,
    dotAll: true,
  );
  // Um registro de derivada. `altura` e opcional e pode vir antes ou depois,
  // entao os tres campos sao lidos de dentro do bloco e nao em sequencia fixa.
  final deBloco = RegExp(r'\{([^{}]*)\}');
  final deVariante = RegExp(r"variante\s*:\s*'([a-z]+)'");
  final deLargura = RegExp(r'largura\s*:\s*(\d+)');
  final deAltura = RegExp(r'altura\s*:\s*(\d+)');

  for (final export in deExport.allMatches(fonte)) {
    final nome = export.group(1)!;
    final corpo = export.group(2)!;
    final lidas = <DimensaoDaDerivada>[];
    for (final bloco in deBloco.allMatches(corpo)) {
      final dentro = bloco.group(1)!;
      final variante = deVariante.firstMatch(dentro)?.group(1);
      final largura = deLargura.firstMatch(dentro)?.group(1);
      if (variante == null || largura == null) continue;
      final altura = deAltura.firstMatch(dentro)?.group(1);
      lidas.add(
        DimensaoDaDerivada(
          variante: variante,
          largura: int.parse(largura),
          altura: altura == null ? null : int.parse(altura),
        ),
      );
    }
    // Um export sem bloco de derivada (ha varios: tetos, escadas, textos) nao
    // entra. Entrar com lista vazia faria a varredura crescer sem medir nada.
    if (lidas.isNotEmpty) resultado[nome] = lidas;
  }
  return resultado;
}

/// A dimensao de uma variante dentro de um export, ou estoura dizendo o que
/// faltou.
///
/// **Estoura e nao devolve nulo**, de proposito: nulo aqui viraria um
/// `expect` comparando nulo com nulo e o portao passaria verde sobre um
/// export que deixou de existir.
DimensaoDaDerivada aVariante(
  Map<String, List<DimensaoDaDerivada>> lidas,
  String export,
  String variante,
) {
  final doExport = lidas[export];
  if (doExport == null) {
    throw StateError(
      'REPROVA: `$export` nao existe mais em $caminhoDasDerivadas, ou o '
      'leitor deste portao deixou de enxerga-lo. Os exports lidos foram: '
      '${lidas.keys.toList()}',
    );
  }
  final achada = doExport.where((d) => d.variante == variante);
  if (achada.isEmpty) {
    throw StateError(
      'REPROVA: `$export` nao declara mais a variante `$variante`. '
      'Declara: $doExport',
    );
  }
  return achada.first;
}

void main() {
  late Map<String, List<DimensaoDaDerivada>> lidas;

  setUpAll(() {
    final arquivo = File(caminhoDasDerivadas);
    expect(
      arquivo.existsSync(),
      isTrue,
      reason:
          'REPROVA: $caminhoDasDerivadas nao foi encontrado. Este portao roda '
          'com o diretorio de trabalho em `app/`, e o caminho sobe para a raiz '
          'do repositorio pelo `test/` do pacote.',
    );
    lidas = dimensoesDe(arquivo.readAsStringSync());
  });

  group('autoteste do leitor: ele enxerga as duas formas do arquivo', () {
    test('a forma de LISTA, com e sem altura', () {
      const fonte = '''
export const DERIVADAS_DE_EXEMPLO: readonly EspecificacaoDaDerivada[] = [
  { variante: 'banner', largura: 1280, altura: 720, porte: 'grande' },
  { variante: 'card', largura: 1024, porte: 'enxuta' },
];
''';
      final lido = dimensoesDe(fonte);
      expect(lido.keys, <String>['DERIVADAS_DE_EXEMPLO']);
      expect(lido['DERIVADAS_DE_EXEMPLO']!.length, 2);
      expect(aVariante(lido, 'DERIVADAS_DE_EXEMPLO', 'banner').aspecto, 16 / 9);
      // Sem `altura` o servidor nao corta, e o aspecto tem de ser NULO e nao
      // um numero inventado.
      expect(aVariante(lido, 'DERIVADAS_DE_EXEMPLO', 'card').aspecto, isNull);
    });

    test('a forma de OBJETO UNICO', () {
      const fonte = '''
export const DERIVADA_DE_EXEMPLO: EspecificacaoDaDerivada = {
  variante: 'card',
  largura: 1024,
  altura: 1126,
  porte: 'grande',
};
''';
      final lido = dimensoesDe(fonte);
      expect(
        aVariante(lido, 'DERIVADA_DE_EXEMPLO', 'card').aspecto,
        1024 / 1126,
      );
    });

    test('a ordem dos campos dentro do bloco nao importa', () {
      const fonte = '''
export const DERIVADA_TORTA: EspecificacaoDaDerivada = {
  altura: 720, porte: 'grande', largura: 1280, variante: 'banner',
};
''';
      expect(
        aVariante(dimensoesDe(fonte), 'DERIVADA_TORTA', 'banner').aspecto,
        16 / 9,
      );
    });

    test('export SEM derivada nenhuma nao entra na varredura', () {
      const fonte = '''
export const TETO_DE_BYTES_DO_ENVIO = 5 * 1024 * 1024;
export const ESCADA_DA_FAIXA: readonly number[] = [92, 86, 82];
''';
      expect(dimensoesDe(fonte), isEmpty);
    });

    test('REPROVA quando o export procurado nao existe', () {
      expect(
        () => aVariante(<String, List<DimensaoDaDerivada>>{}, 'X', 'card'),
        throwsA(isA<StateError>()),
      );
    });
  });

  group('cada janela de recorte tem a proporcao com que o servidor CORTA', () {
    test('o leitor achou os exports que este portao cobra', () {
      // A contagem vai junto do veredito: um leitor que deixasse de enxergar o
      // arquivo devolveria mapa vazio, e todo `expect` abaixo compararia nulo
      // com nulo.
      expect(
        lidas.keys,
        containsAll(<String>[
          'DERIVADAS_DA_FOTO_DE_PET',
          'DERIVADAS_DO_ENCONTRO',
          'DERIVADAS_DA_LOGO',
          'DERIVADAS_DA_FOTO_DE_USUARIO',
          'DERIVADAS_DA_VITRINE_DO_USUARIO',
          'DERIVADAS_DA_PUBLICACAO',
          'DERIVADA_DA_FOTO_DO_ACHADO',
        ]),
        reason:
            'REPROVA: o leitor nao achou um dos exports. Ou ele foi renomeado '
            'em $caminhoDasDerivadas, ou a formatacao mudou e o extrator '
            'ficou cego. Lidos: ${lidas.keys.toList()}',
      );
    });

    // Cada caso NOMEIA o ponto de upload, para a reprovacao dizer qual tela
    // passou a enquadrar diferente do que o servidor corta.
    final casos = <String, (String, String, FormatoDoRecorte)>{
      'foto do pet (cadastro e edicao)': (
        'DERIVADAS_DA_FOTO_DE_PET',
        'card',
        FormatoDoRecorte.fotoDePet,
      ),
      'capa do encontro': (
        'DERIVADAS_DO_ENCONTRO',
        'banner',
        FormatoDoRecorte.capaDoEncontro,
      ),
      'logotipo da indicacao': (
        'DERIVADAS_DA_LOGO',
        'card',
        FormatoDoRecorte.logoDaIndicacao,
      ),
      'foto da propria pessoa (Meus dados)': (
        'DERIVADAS_DA_FOTO_DE_USUARIO',
        'card',
        FormatoDoRecorte.fotoDeUsuario,
      ),
      'vitrine de fotos': (
        'DERIVADAS_DA_VITRINE_DO_USUARIO',
        'card',
        FormatoDoRecorte.vitrineDoUsuario,
      ),
      'publicacao do Mural': (
        'DERIVADAS_DA_PUBLICACAO',
        'card',
        FormatoDoRecorte.publicacaoDoMural,
      ),
      'foto na conversa': (
        'DERIVADA_DA_FOTO_DO_ACHADO',
        'card',
        FormatoDoRecorte.fotoNaConversa,
      ),
    };

    for (final entrada in casos.entries) {
      final (export, variante, formato) = entrada.value;
      test('ISCA — ${entrada.key}: a janela e a derivada `$export`', () {
        // ISCA: troque a constante correspondente em
        // `app/lib/widgets/recorte_de_imagem.dart` por outra proporcao --
        // 1:1, por exemplo. Compila, a folha desenha, o recorte sai, o
        // `flutter analyze` fica calado e nenhum outro caso reprova. Este
        // reprova pelo nome do ponto de upload.
        final doServidor = aVariante(lidas, export, variante);
        expect(
          doServidor.aspecto,
          isNotNull,
          reason:
              'REPROVA: `$export` deixou de ter `altura`, ou seja o servidor '
              'passou a `fit: inside` e NAO corta mais. A janela deste ponto '
              'de upload tem de virar `FormatoDoRecorte.doProprioArquivo()`, '
              'senao o app recorta o que o servidor ja ia entregar inteiro.',
        );
        expect(
          formato.aspecto,
          isNotNull,
          reason:
              'REPROVA: a janela de "${entrada.key}" nao declara proporcao, '
              'mas o servidor CORTA em $doServidor. A pessoa enquadraria uma '
              'coisa e o servidor entregaria outra.',
        );
        expect(
          formato.aspecto,
          closeTo(doServidor.aspecto!, 1e-9),
          reason:
              'REPROVA: a janela de "${entrada.key}" enquadra em '
              '${formato.aspecto} e o servidor corta em $doServidor '
              '(${doServidor.aspecto}). O enquadramento da pessoa seria '
              'recortado DE NOVO no servidor, num lugar que ela nao escolheu '
              '-- que e o relato do cliente de 28/10/2026.',
        );
      });
    }

    test(
        'CONTROLE NEGATIVO — o unico proposito SEM corte e a Loja, e o app nao '
        'o envia', () {
      // Ele existe para que a lista acima nao pareca "todos os propositos".
      // `DERIVADAS_DO_PRODUTO` nao tem `altura` (`fit: inside`), e e por isso
      // que `FormatoDoRecorte.doProprioArquivo()` continua no codigo sem
      // nenhum ponto de upload do app usando: quem sobe produto e o painel.
      final produto = aVariante(lidas, 'DERIVADAS_DO_PRODUTO', 'card');
      expect(
        produto.altura,
        isNull,
        reason:
            'Se a Loja passar a ser cortada, o `doProprioArquivo` deixa de '
            'ser a resposta certa para ela -- e esta nota deixa de valer.',
      );
      expect(const FormatoDoRecorte.doProprioArquivo().aspecto, isNull);
    });
  });
}
