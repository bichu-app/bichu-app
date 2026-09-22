// BICHUS-23, criterios 1 e 2, e a promessa que sustenta os dois: a
// localizacao e pedida **no ponto de uso**, em dois lugares, com o app aberto,
// e nada dela fica no aparelho.
//
// A ISCA DESTE ARQUIVO sao tres frases que hoje so existem escritas:
//
//   1. "ela e pedida em exatamente dois pontos do app, e em nenhum outro"
//      (criterio 1). Uma tela nova que chame a porta e o jeito silencioso de
//      isso deixar de ser verdade, e nenhum teste de tela pegaria: a tela nova
//      teria os testes DELA, todos verdes.
//
//   2. "localizacao em segundo plano esta fora desta historia". Ela nao sai do
//      Dart: sai de uma linha de manifesto e de uma chave de plist, e as duas
//      podem entrar num commit que ninguem associa a localizacao.
//
//   3. "nada e guardado no aparelho". Localizacao e dado pessoal. O dia em que
//      alguem acrescentar um rascunho local -- e a BICHUS-35 vai precisar de
//      um, no criterio 5 dela -- esse rascunho tem de entrar em
//      `limpezasAoSair` com isca propria. Enquanto nao entra, gravar reprova.
//
// COMO ELE MEDE: pelo fonte de `app/lib`, lendo DIRETIVAS e codigo sem
// comentario, com o mesmo leitor de `porta_nao_contornada_test.dart`. A prosa
// deste projeto fala dos mecanismos o tempo todo, e um portao que casasse
// texto cru acusaria os proprios comentarios que explicam a decisao.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'diretivas_dart.dart';

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/app/lib').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada.',
  );
}

/// Os arquivos que PODEM falar com a porta `Localizacao`, e por que cada um.
///
/// Caminho relativo a `app/lib`. A lista e curta de proposito: e ela que torna
/// o criterio 1 verificavel. Acrescentar um nome aqui e um ato deliberado, com
/// a issue no diff -- do mesmo jeito que destravar o hash das telas.
///
/// **F3.1 e F3.5 nao estao aqui, e isso esta certo.** As duas telas embutem
/// `CapturaDeLocalizacao`, e quem fala com a porta e a peca, nao elas. Uma
/// tela que precise falar com a porta direto esta contornando a peca, e ai o
/// tratamento dos cinco motivos de falha passa a existir em dois lugares.
const Map<String, String> _quemPodeUsarAPorta = <String, String>{
  'dispositivo/localizacao.dart': 'e a propria porta',
  'escopo.dart': 'entrega a porta a arvore de widgets',
  'app.dart': 'escolhe a implementacao, num lugar so',
  'telas/localizacao/captura_de_localizacao.dart':
      'e a captura que os dois pontos de uso embutem',
  // Importa pelo TIPO, e nao para falar com o aparelho: `PontoCapturado` e
  // `OrigemDoPonto` sao dados, e o modelo do "onde" precisa nomea-los para
  // montar o corpo da requisicao. Ele nao chama metodo nenhum da porta, e e
  // por isso que a segunda trava deste grupo existe -- ela mede a CHAMADA, e
  // nao o import, e deixaria este arquivo passar sozinha.
  'api/modelos_localizacao.dart': 'usa os tipos de ponto, nao o aparelho',
};

/// Como se obtem a porta de verdade: pelo escopo, ou nomeando a implementacao.
///
/// Esta e a trava que de fato cobra o criterio 1. A de import e mais larga de
/// proposito (pega quem chega perto), e ela sozinha acusaria quem so precisa
/// do TIPO -- que e o caso legitimo de `modelos_localizacao.dart`. Esta aqui
/// e estreita: ela pega quem vai FALAR com o aparelho.
///
/// **Por REGEX, e nao por `contains`**, e custou um falso positivo para ficar
/// assim: `.localizacao` como texto solto casa com
/// `intencao/intencao_pendente.dart`, que tem um campo `localizacao` de outro
/// assunto inteiro -- a regra de 30 minutos do envelope de intencao (UX 8.3),
/// que nao encosta na porta do aparelho.
///
/// Falso positivo em portao estrutural nao e zelo: e o motivo pelo qual
/// portao acaba desligado por quem cansa. O que se procura aqui e o acesso
/// pelo escopo, que tem forma fixa.
final Map<RegExp, String> _formasDeObterAPorta = <RegExp, String>{
  RegExp(r'Escopo\s*\.\s*of\s*\([^)]*\)\s*\.\s*localizacao'):
      'pega a porta no escopo',
  RegExp(r'\bLocalizacaoPorGeolocator\b'):
      'nomeia a implementacao de producao',
  RegExp(r'\bLocalizacaoNaoEmbarcada\b'): 'nomeia a implementacao ausente',
};

void main() {
  final raiz = _raizDoRepositorio().path;
  final lib = Directory('$raiz/app/lib');

  late final List<File> fontes;

  setUpAll(() {
    fontes = lib
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'))
        .toList();
  });

  String relativo(File f) => f.path.substring('${lib.path}/'.length);

  group('criterio 1: a porta e usada em dois pontos, e em nenhum outro', () {
    test('ha fontes para conferir', () {
      expect(
        fontes.length,
        greaterThan(20),
        reason: 'REPROVA: achei ${fontes.length} arquivo(s) em app/lib. Um '
            'portao que varre a pasta errada passa por vazio.',
      );
    });

    test('so os arquivos declarados importam a porta', () {
      for (final fonte in fontes) {
        final caminho = relativo(fonte);
        if (_quemPodeUsarAPorta.containsKey(caminho)) continue;
        for (final d in lerDiretivas(fonte.readAsStringSync())) {
          expect(
            d.uri.endsWith('dispositivo/localizacao.dart'),
            isFalse,
            reason: 'REPROVA: `$caminho` importa a porta `Localizacao`, e nao '
                'esta na lista de quem pode.\n'
                'O criterio 1 da BICHUS-23 diz que a localizacao e pedida em '
                'EXATAMENTE dois pontos do app -- F3.1 (marcar perdido) e '
                'F3.5 (registrar achado avulso) -- e em nenhum outro. Os dois '
                'embutem `CapturaDeLocalizacao`, e e ela que fala com a porta.\n'
                'Se este arquivo e um TERCEIRO ponto de uso, ele nao pode '
                'existir sem a issue mudar: localizacao e dado pessoal e o '
                'produto declarou dois lugares, na loja e para a pessoa.\n'
                'Se ele so precisa do RESULTADO da captura, receba um `Onde` '
                'de quem capturou, em vez de capturar de novo.',
          );
        }
      }
    });

    test('so os arquivos declarados OBTEM a porta', () {
      // A trava estreita. A de import pega quem importa o arquivo por
      // qualquer razao; esta pega quem pega a porta para chamar metodo nela.
      //
      // Quem nomeia a implementacao concreta tambem cai aqui, e e o mesmo
      // argumento de `porta_nao_contornada_test.dart`: a tela conhece a
      // porta, nao quem a implementa. Escolher implementacao e de `app.dart`,
      // num lugar so.
      for (final fonte in fontes) {
        final caminho = relativo(fonte);
        if (_quemPodeUsarAPorta.containsKey(caminho)) continue;
        final codigo = semComentarios(fonte.readAsStringSync());
        for (final forma in _formasDeObterAPorta.entries) {
          expect(
            forma.key.hasMatch(codigo),
            isFalse,
            reason: 'REPROVA: `$caminho` ${forma.value} '
                '(casou `${forma.key.pattern}`), e '
                'nao esta na lista de quem pode.\n'
                'O criterio 1 da BICHUS-23 diz que a localizacao e pedida em '
                'EXATAMENTE dois pontos do app -- F3.1 e F3.5 -- e em nenhum '
                'outro. Os dois embutem `CapturaDeLocalizacao`, e e ela que '
                'fala com o aparelho.\n'
                'Se este arquivo so precisa do RESULTADO, receba um `Onde` de '
                'quem capturou, em vez de capturar de novo.',
          );
        }
      }
    });

    test('a lista de quem pode usar a porta aponta para arquivos que existem',
        () {
      // Sem isto, renomear `captura_de_localizacao.dart` deixaria a lista com
      // um nome morto e o portao com uma excecao que nao protege nada -- e o
      // arquivo novo passaria a reprovar pelo motivo errado, ou a lista seria
      // "corrigida" acrescentando o novo sem tirar o velho.
      for (final caminho in _quemPodeUsarAPorta.keys) {
        expect(
          File('${lib.path}/$caminho').existsSync(),
          isTrue,
          reason: 'REPROVA: `$caminho` esta na lista de quem pode usar a porta '
              'e nao existe mais. Uma excecao para um arquivo morto e uma '
              'excecao que alguem vai reaproveitar sem ler.',
        );
      }
    });
  });

  group('criterio 2: nada de segundo plano, nem no Dart nem no manifesto', () {
    test('nenhum fonte assina fluxo continuo de posicao', () {
      // `getPositionStream` e o caminho para rastrear, e ele nao e o pedido
      // pontual do ponto de uso. Ele tambem muda o que a loja cobra: fluxo
      // continuo e o que faz a revisao perguntar por background.
      for (final fonte in fontes) {
        final codigo = semComentarios(fonte.readAsStringSync());
        for (final continuo in <String>[
          'getPositionStream',
          'requestAlwaysAuthorization',
          'ACCESS_BACKGROUND_LOCATION',
        ]) {
          expect(
            codigo.contains(continuo),
            isFalse,
            reason: 'REPROVA: ${relativo(fonte)} usa `$continuo`. A BICHUS-23 '
                'lista "Localizacao em segundo plano" e "Geofencing" em Fora '
                'desta historia, e a captura acontece no ponto de uso, com o '
                'app aberto e a pessoa olhando.',
          );
        }
      }
    });

    test('o AndroidManifest pede COARSE e nao pede FINE nem BACKGROUND', () {
      final arquivo =
          File('$raiz/app/android/app/src/main/AndroidManifest.xml');
      expect(
        arquivo.existsSync(),
        isTrue,
        reason: 'REPROVA: ${arquivo.path} nao existe.',
      );
      // Os comentarios saem antes da medicao: o manifesto EXPLICA em prosa por
      // que `ACCESS_FINE_LOCATION` nao foi pedida, e medir o texto cru
      // acusaria a propria explicacao.
      final texto = arquivo
          .readAsStringSync()
          .replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');

      expect(
        texto,
        contains('android.permission.ACCESS_COARSE_LOCATION'),
        reason: 'REPROVA: `ACCESS_COARSE_LOCATION` sumiu do manifesto. Sem ela '
            'o Android nao entrega posicao nenhuma, e a captura falha em '
            'aparelho enquanto todo teste de widget continua verde.',
      );
      expect(
        texto,
        isNot(contains('android.permission.ACCESS_FINE_LOCATION')),
        reason: 'REPROVA: `ACCESS_FINE_LOCATION` entrou no manifesto.\n'
            'O criterio 2 pede precisao APROXIMADA (`coarse`), e quem de fato '
            'limita a precisao e esta declaracao, nao a `LocationAccuracy.low` '
            'do Dart: com FINE declarada o sistema entrega o ponto fino e o '
            'pedido em Dart vira preferencia.\n'
            'O produto nunca mostra mais que bairro (ADR-0010): o dado mais '
            'fino nao teria onde ser usado e teria onde vazar.',
      );
      expect(
        texto,
        isNot(contains('ACCESS_BACKGROUND_LOCATION')),
        reason: 'REPROVA: `ACCESS_BACKGROUND_LOCATION` entrou no manifesto. '
            'Essa permissao tem formulario de declaracao proprio na Play '
            'Store, com video do fluxo: pedi-la sem uso e uma rodada de '
            'revisao perdida por algo que o produto nao faz.',
      );
    });
  });

  group('nada de localizacao fica no aparelho', () {
    test('a peca de captura nao escreve em disco nem no chaveiro', () {
      // Localizacao e dado pessoal. A peca guarda o ponto no estado do widget,
      // e ele morre com a tela -- por isso ela NAO tem entrada em
      // `limpezasAoSair`, e uma entrada que limpa nada passaria a ideia de que
      // ha algo guardado.
      //
      // A BICHUS-35 vai precisar de rascunho local (criterio 5 dela). Quando
      // ele chegar, ele entra em `limpezasAoSair` com isca propria, no mesmo
      // commit -- e este caso muda junto, citando a issue.
      final peca = File(
        '$raiz/app/lib/telas/localizacao/captura_de_localizacao.dart',
      );
      expect(peca.existsSync(), isTrue, reason: 'REPROVA: ${peca.path}');
      final codigo = semComentarios(peca.readAsStringSync());

      const formasDeGravar = <String, String>{
        'SharedPreferences': 'preferencias do sistema',
        'FlutterSecureStorage': 'o chaveiro',
        'File(': 'um arquivo',
        'getApplicationDocumentsDirectory': 'o diretorio do app',
        'writeAsString': 'escrita em arquivo',
      };
      for (final forma in formasDeGravar.entries) {
        expect(
          codigo.contains(forma.key),
          isFalse,
          reason: 'REPROVA: a captura de localizacao grava em ${forma.value} '
              '(`${forma.key}`).\n'
              'Localizacao e dado pessoal: o que fica no aparelho sobrevive ao '
              'logout e precisa entrar em `limpezasAoSair` do '
              '`ControladorDeSessao`, com isca propria, NO MESMO COMMIT. '
              'Enquanto nao entrar, a peca nao guarda nada -- e hoje ela nao '
              'precisa: o ponto e usado no ato e morre com a tela.',
        );
      }
    });

    test('nenhum modelo de localizacao sabe se serializar para disco', () {
      // O outro jeito de o dado vazar para o armazenamento: um `toJson` no
      // modelo, que nao grava nada sozinho mas e o que alguem chama para
      // gravar. O `noContrato` existe e e outra coisa -- ele monta o corpo da
      // requisicao, que vai para a nossa API e nao para o disco.
      final modelos = File('$raiz/app/lib/api/modelos_localizacao.dart');
      final codigo = semComentarios(modelos.readAsStringSync());
      expect(
        codigo.contains('toJson') || codigo.contains('fromJson'),
        isFalse,
        reason: 'REPROVA: `modelos_localizacao.dart` ganhou `toJson`/`fromJson`. '
            'O caminho para a API e `noContrato`, e ele tem nome diferente de '
            'proposito: `toJson` e o que se chama para GRAVAR, e um modelo de '
            'localizacao que sabe virar JSON de ida e volta e um rascunho '
            'local esperando acontecer.',
      );
    });
  });
}
