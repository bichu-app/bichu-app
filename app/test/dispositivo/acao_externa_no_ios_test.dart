// AS SAIDAS DO APP NO iOS — calendario e app de mapas.
//
// Dois defeitos que o cliente mediu NO APARELHO em 20/10/2026:
//
//   1. *"o botao de adicionar o evento ao calendario no ios nao esta
//      funcionando"*;
//   2. o endereco do encontro que nao abria no aplicativo de mapas, e o pedido
//      de que o endereco do profissional tambem abra -- *"no app padrao do
//      usuario, waze, maps, etc"*.
//
// ## O QUE OS DOIS TINHAM EM COMUM, E POR QUE ESTE ARQUIVO EXISTE
//
// **A suite inteira estava verde, e continuaria verde para sempre.** Os casos
// que havia mediam a PORTA pelo dobro (`SaidaDeTeste` em
// `rede/encontro_da_rede_test.dart`): eles provam que a tela chama
// `adicionarAoCalendario` e `abrirEnderecoNoAppDeMapas`, e isso era verdade.
// Ninguem media o que `SaidaDoAparelho` -- a implementacao de verdade -- faz
// com a chamada.
//
// E o que ela fazia era:
//
// - `adicionarAoCalendario`: falar num canal (`app.bichu/calendario`) que
//   **nao tinha handler no Runner do iOS**. `MissingPluginException`,
//   capturada, `false` devolvido, snackbar "Nao conseguimos abrir o
//   calendario". Correto e inutil.
// - `abrirEnderecoNoAppDeMapas`: montar `geo:0,0?q=<texto>`, que **nenhum
//   aplicativo do iOS responde**, e cair no OpenStreetMap no navegador. O
//   Android ia para o app de mapas, o iOS ia para uma pagina da web, e so
//   quem tinha os dois aparelhos enxergava.
//
// Nos dois, o modo de falha e SILENCIO: nenhuma excecao escapa, nenhum log
// sai, nenhum teste muda de cor.
//
// ## COMO ESTE ARQUIVO MEDE, E POR QUE ASSIM
//
// Ele NAO usa dobro da porta. Ele mede `SaidaDoAparelho` contra o canal do
// `url_launcher` e contra o canal do calendario, com
// `defaultTargetPlatform` trocado -- que e a unica razao de a porta ler
// `defaultTargetPlatform` em vez de `Platform.isIOS`: com `dart:io` a perna
// do iOS seria inalcancavel desta maquina, e o defeito voltaria a poder
// viver verde.
//
// O quarto grupo e de outra natureza: ele le o `AppDelegate.swift` como
// TEXTO, porque `flutter test` nao compila Swift. E o unico portao do
// repositorio capaz de acusar o defeito 1 pela raiz.

import 'dart:io';

import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// O canal do `url_launcher`, por extenso.
///
/// **Nao importado do pacote de proposito**: o nome e contrato entre o Dart e
/// o nativo, e um caso que o lesse do mesmo lugar que o codigo sob medicao
/// aprovaria o dia em que os dois mudassem juntos para o canal errado.
const MethodChannel _canalDoLauncher =
    MethodChannel('plugins.flutter.io/url_launcher');

const MethodChannel _canalDoCalendario = MethodChannel('app.bichu/calendario');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  /// Tudo o que foi pedido ao sistema para abrir, em ordem.
  final List<String> abertos = <String>[];

  /// O que o canal do `url_launcher` responde. `false` faz a porta tentar o
  /// proximo destino da lista, que e como o recurso final se mede.
  bool launcherResponde = true;

  /// As chamadas ao canal do calendario: metodo e argumentos.
  final List<({String metodo, Map<Object?, Object?> args})> aoCalendario =
      <({String metodo, Map<Object?, Object?> args})>[];
  bool calendarioRegistrado = true;

  setUp(() {
    abertos.clear();
    aoCalendario.clear();
    launcherResponde = true;
    calendarioRegistrado = true;

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoLauncher, (chamada) async {
      if (chamada.method != 'launch') return null;
      final args = chamada.arguments as Map<Object?, Object?>;
      abertos.add(args['url'] as String);
      return launcherResponde;
    });

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoCalendario, (chamada) async {
      // **O lado SEM handler, e ele e o estado do iOS de ontem.** Devolver
      // `null` aqui nao serve: o que o aparelho fazia era levantar
      // `MissingPluginException`, e e esse desfecho que a porta tem de
      // sobreviver.
      if (!calendarioRegistrado) {
        throw MissingPluginException(
          'No implementation found for method ${chamada.method} on channel '
          'app.bichu/calendario',
        );
      }
      aoCalendario.add((
        metodo: chamada.method,
        args: chamada.arguments as Map<Object?, Object?>,
      ));
      return true;
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      ..setMockMethodCallHandler(_canalDoLauncher, null)
      ..setMockMethodCallHandler(_canalDoCalendario, null);
    debugDefaultTargetPlatformOverride = null;
  });

  // -------------------------------------------------------------------------
  group('o endereco vai ao app de mapas, e o caminho e diferente nos dois '
      'sistemas', () {
    const String endereco = 'Rua Harmonia, 500 — Vila Madalena, São Paulo - SP';

    // DESLIGAR PARA VER REPROVAR: em `lib/dispositivo/saida_do_app.dart`,
    // apague a perna `if (_ehIOS)` de `abrirEnderecoNoAppDeMapas` e deixe so
    // o `geo:`. Este caso reprova dizendo que o iOS recebeu `geo:0,0?q=...`,
    // que e exatamente o que o aparelho do cliente recebia -- e nenhum
    // aplicativo do iOS responde a `geo:`.
    test('ISCA — no iOS o endereco vai por `maps.apple.com`, e nao por `geo:`',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;

      final abriu = await const SaidaDoAparelho()
          .abrirEnderecoNoAppDeMapas(endereco: endereco);

      expect(abriu, isTrue);
      expect(
        abertos,
        hasLength(1),
        reason: 'REPROVA: a porta tentou ${abertos.length} destinos. No iOS o '
            'primeiro tem de responder -- `maps.apple.com` e link universal '
            'do Mapas --, e tentar mais de um significa que o primeiro era o '
            'destino errado.',
      );
      final pedido = Uri.parse(abertos.single);
      expect(
        pedido.scheme,
        'https',
        reason: 'REPROVA: o iOS recebeu o esquema `${pedido.scheme}`. Se for '
            '`geo:`, este e o defeito de 20/10 de volta: nenhum aplicativo do '
            'iOS responde a `geo:`, `launchUrl` devolve false em silencio e a '
            'tela cai no navegador.\n'
            'Se for `comgooglemaps:` ou `waze:`, falta '
            '`LSApplicationQueriesSchemes` no Info.plist -- e nesse caso '
            '`canLaunchUrl` devolve false em silencio, que e o MESMO modo de '
            'falha. `https` nao precisa de declaracao nenhuma.',
      );
      expect(pedido.host, 'maps.apple.com');
      expect(
        pedido.queryParameters['q'],
        endereco,
        reason: 'REPROVA: o TEXTO do endereco nao chegou inteiro em `q`. '
            'Quem resolve texto em lugar e o aplicativo de mapas do aparelho: '
            'o ADR-0006 proibe que o Bichu geocodifique, e o acento e o '
            'travessao deste endereco sao o caso em que o escape erra.',
      );
      expect(
        pedido.queryParameters.containsKey('ll'),
        isFalse,
        reason: 'REPROVA: foi uma COORDENADA junto com o texto. Nao ha '
            'coordenada para mandar aqui, e produzi-la seria geocodificar -- '
            'proibido pelo ADR-0006.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: troque o `else` por `maps.apple.com`
    // tambem. Este caso reprova: o Android perderia o SELETOR DO SISTEMA, que
    // e o "app padrao do usuario" que o cliente pediu -- `geo:` oferece
    // Google Maps, Waze e o que mais estiver instalado, e `https` iria direto
    // ao navegador ou ao Apple Maps na web.
    test('ISCA — no Android o endereco vai por `geo:`, que abre o seletor',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      await const SaidaDoAparelho()
          .abrirEnderecoNoAppDeMapas(endereco: endereco);

      expect(abertos, hasLength(1));
      final pedido = abertos.single;
      expect(
        pedido.startsWith('geo:0,0?q='),
        isTrue,
        reason: 'REPROVA: o Android recebeu `$pedido`. `geo:` e o que dispara '
            'a escolha entre os aplicativos de mapas instalados; qualquer '
            'outro esquema decide pela pessoa.',
      );
      expect(
        Uri.decodeComponent(pedido.substring('geo:0,0?q='.length)),
        endereco,
      );
    });

    // DESLIGAR PARA VER REPROVAR: apague as duas linhas
    //     final limpo = endereco.trim();
    //     if (limpo.isEmpty) return false;
    // Este caso reprova: a porta abre o app de mapas com `q` vazio, que no
    // Android cai no `0,0` -- no Atlantico, ao sul de Gana -- e no iOS abre o
    // mapa na ultima posicao. Nos dois a pessoa VE o app de mapas responder,
    // e vai acreditar no que ele mostrou.
    //
    // Isto nao e zelo: `network_events.street_address` e ANULAVEL (ADR-0027
    // item 21) e quem o digita e o painel, entao endereco so com espacos e
    // conteudo de terceiro que existe.
    test('ISCA — endereco em branco nao chama o sistema, e devolve false',
        () async {
      for (final branco in <String>['', '   ', '\n', '\t  \n']) {
        debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
        expect(
          await const SaidaDoAparelho()
              .abrirEnderecoNoAppDeMapas(endereco: branco),
          isFalse,
          reason: 'REPROVA: a porta afirmou ter aberto o mapa para um '
              'endereco em branco (${branco.length} caracteres de espaco).',
        );
        debugDefaultTargetPlatformOverride = TargetPlatform.android;
        expect(
          await const SaidaDoAparelho()
              .abrirEnderecoNoAppDeMapas(endereco: branco),
          isFalse,
        );
      }
      expect(
        abertos,
        isEmpty,
        reason: 'REPROVA: ${abertos.length} chamadas ao sistema sairam para '
            'endereco em branco: $abertos. Devolver `false` nao basta -- o '
            'que o cliente VE e o aplicativo de mapas abrindo no lugar '
            'errado, e isso acontece na chamada, nao no valor de retorno.',
      );
    });

    test('o espaco em volta e aparado antes de sair', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      await const SaidaDoAparelho()
          .abrirEnderecoNoAppDeMapas(endereco: '  $endereco  ');
      expect(Uri.parse(abertos.single).queryParameters['q'], endereco);
    });

    test('sem app que responda, sobra o mapa no navegador', () async {
      // O `url_launcher` recusando tudo: aparelho sem app de mapas e sem
      // aplicativo que reivindique `maps.apple.com`.
      launcherResponde = false;
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      final abriu = await const SaidaDoAparelho()
          .abrirEnderecoNoAppDeMapas(endereco: endereco);

      expect(abriu, isFalse);
      expect(abertos, hasLength(2));
      expect(abertos.last, startsWith('https://www.openstreetmap.org/search'));
    });
  });

  // -------------------------------------------------------------------------
  group('o ponto do encontro vai ao app de mapas', () {
    test('ISCA — no iOS o ponto vai por `maps.apple.com`, com rotulo',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;

      await const SaidaDoAparelho().abrirNoAppDeMapas(
        lat: -23.561684,
        lon: -46.655981,
        nomeDoLugar: 'Parque Ibirapuera',
      );

      expect(abertos, hasLength(1));
      final pedido = Uri.parse(abertos.single);
      expect(pedido.scheme, 'https');
      expect(pedido.host, 'maps.apple.com');
      expect(
        pedido.queryParameters['ll'],
        '-23.561684,-46.655981',
        reason: 'REPROVA: o ponto nao chegou, ou chegou com outra precisao. '
            'Seis casas e a grade que a porta sempre usou.',
      );
      expect(pedido.queryParameters['q'], 'Parque Ibirapuera');
    });

    test('no Android o ponto continua por `geo:`', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      await const SaidaDoAparelho().abrirNoAppDeMapas(
        lat: -23.561684,
        lon: -46.655981,
        nomeDoLugar: 'Parque Ibirapuera',
      );

      expect(abertos.single, startsWith('geo:-23.561684,-46.655981?q='));
    });
  });

  // -------------------------------------------------------------------------
  group('o botao de calendario chama o canal, e o canal tem de existir', () {
    final DateTime inicio = DateTime.utc(2026, 10, 25, 13, 30);
    final DateTime fim = DateTime.utc(2026, 10, 25, 16);

    // DESLIGAR PARA VER REPROVAR: em `lib/dispositivo/saida_do_app.dart`,
    // troque o nome do canal (`app.bichu/calendario`), o nome do metodo
    // (`adicionar`) ou qualquer uma das cinco chaves do mapa. Este caso
    // reprova em cada uma.
    //
    // Por que vale medir isto e nao so o dobro: as cinco chaves sao lidas por
    // `MainActivity.kt` e por `AppDelegate.swift`, em duas linguagens que o
    // `flutter analyze` nao enxerga. Renomear `inicioEmMs` aqui compila, passa
    // na analise, e o evento chega ao calendario SEM HORA.
    test('ISCA — o encontro chega ao canal com as cinco chaves do nativo',
        () async {
      final abriu = await const SaidaDoAparelho().adicionarAoCalendario(
        EventoDeCalendario(
          titulo: 'Feira de adoção, no Ibirapuera',
          inicio: inicio,
          fim: fim,
          local: 'Parque Ibirapuera — portão 3',
          descricao: 'Leve a carteirinha de vacinação.',
        ),
      );

      expect(abriu, isTrue);
      expect(aoCalendario, hasLength(1));
      expect(aoCalendario.single.metodo, 'adicionar');
      expect(aoCalendario.single.args, <String, Object?>{
        'titulo': 'Feira de adoção, no Ibirapuera',
        'inicioEmMs': inicio.millisecondsSinceEpoch,
        'fimEmMs': fim.millisecondsSinceEpoch,
        'local': 'Parque Ibirapuera — portão 3',
        'descricao': 'Leve a carteirinha de vacinação.',
      });
    });

    test('encontro sem fim manda `fimEmMs` nulo, e nao inventa duracao',
        () async {
      await const SaidaDoAparelho().adicionarAoCalendario(
        EventoDeCalendario(
          titulo: 'Passeio da manhã',
          inicio: inicio,
          fim: null,
          local: 'Praça Benedito Calixto',
          descricao: '',
        ),
      );

      expect(aoCalendario.single.args['fimEmMs'], isNull);
    });

    // O estado do iOS ATE ESTE COMMIT, medido como estado e nao como prosa.
    test('sem handler no nativo a porta devolve false, sem estourar', () async {
      calendarioRegistrado = false;

      expect(
        await const SaidaDoAparelho().adicionarAoCalendario(
          EventoDeCalendario(
            titulo: 'Feira de adoção',
            inicio: inicio,
            fim: fim,
            local: 'Ibirapuera',
            descricao: '',
          ),
        ),
        isFalse,
      );
    });
  });

  // -------------------------------------------------------------------------
  // O PORTAO QUE ACUSA O DEFEITO 1 PELA RAIZ
  // -------------------------------------------------------------------------
  //
  // `flutter test` nao compila Swift nem Kotlin, e e exatamente por isso que
  // o defeito viveu: o canal do calendario nao existia no Runner do iOS, e
  // nenhuma linha de Dart estava errada. Este grupo le os dois arquivos
  // nativos como TEXTO e cobra que os tres lados nomeiem o MESMO canal.
  //
  // **Os comentarios saem antes de medir**, e a licao e emprestada de
  // `permissoes_de_loja_test.dart`: a primeira execucao daquele portao
  // reprovou acusando uma permissao que estava dentro do comentario que
  // explicava por que ela nao foi pedida. Aqui o risco e o inverso e pior --
  // os dois arquivos nativos CITAM `app.bichu/calendario` na prosa, e medir o
  // arquivo cru aprovaria um Runner que so fala do canal sem registra-lo.
  group('o canal do calendario existe nos DOIS nativos', () {
    /// Sobe de `Directory.current` ate achar a raiz do repositorio.
    ///
    /// **Reprova quando nao acha.** Portao que nao encontra o que conferir
    /// fica verde por vazio, e e assim que esta classe de defeito passa.
    Directory raizDoRepositorio() {
      var dir = Directory.current.absolute;
      while (true) {
        if (Directory('${dir.path}/app/android').existsSync() &&
            Directory('${dir.path}/app/ios').existsSync()) {
          return dir;
        }
        final pai = dir.parent;
        if (pai.path == dir.path) break;
        dir = pai;
      }
      throw StateError(
        'REPROVA: nao achei a raiz do repositorio subindo a partir de '
        '"${Directory.current.path}". Sem ela este portao nao confere nada.',
      );
    }

    String lerOuReprovar(String caminho) {
      final arquivo = File(caminho);
      if (!arquivo.existsSync()) {
        throw StateError(
          'REPROVA: $caminho nao existe. Sem ele nao ha o que conferir, e '
          'ficar verde sem conferir e o defeito que este grupo existe para '
          'impedir.',
        );
      }
      return arquivo.readAsStringSync();
    }

    /// Tira `//`, `///` e `/* ... */`. Serve a Swift e a Kotlin.
    String semComentarios(String fonte) => fonte
        .replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '')
        .replaceAll(RegExp(r'//.*'), '');

    final String raiz = raizDoRepositorio().path;

    test('autoteste do limpador de comentarios', () {
      // Prova negativa que vive numa frase evapora. Esta precisa acusar no
      // dia em que o limpador deixar de enxergar uma das tres formas.
      expect(semComentarios('// "app.bichu/calendario"'), isNot(contains('app.bichu')));
      expect(semComentarios('/// `app.bichu/calendario`'), isNot(contains('app.bichu')));
      expect(
        semComentarios('/* app.bichu/calendario */'),
        isNot(contains('app.bichu')),
      );
      expect(
        semComentarios('let c = "app.bichu/calendario" // o canal'),
        contains('"app.bichu/calendario"'),
      );
    });

    // DESLIGAR PARA VER REPROVAR: apague o bloco `FlutterMethodChannel(...)`
    // de `app/ios/Runner/AppDelegate.swift`. Este caso reprova -- e e o
    // estado em que o repositorio estava quando o cliente mediu o defeito.
    test('ISCA — o Runner do iOS REGISTRA `app.bichu/calendario`, e nao so '
        'fala dele', () {
      final swift = semComentarios(
        lerOuReprovar('$raiz/app/ios/Runner/AppDelegate.swift'),
      );

      expect(
        swift,
        contains('"app.bichu/calendario"'),
        reason: 'REPROVA: `AppDelegate.swift` nao declara o canal '
            '`app.bichu/calendario` fora de comentario.\n'
            'ESTE E O DEFEITO DE 20/10/2026, por inteiro: *"o botao de '
            'adicionar o evento ao calendario no ios nao esta funcionando"*. '
            'Sem handler, `invokeMethod` levanta `MissingPluginException`, '
            '`SaidaDoAparelho.adicionarAoCalendario` a captura e devolve '
            '`false`, e a tela mostra "Nao conseguimos abrir o calendario".\n'
            'Nenhum teste de Dart muda de cor, `flutter analyze` sai 0 e '
            '`flutter build ios` sai 0.',
      );
      expect(
        swift,
        contains('FlutterMethodChannel'),
        reason: 'REPROVA: o nome do canal aparece, mas nenhum '
            '`FlutterMethodChannel` e construido. Uma constante com o nome do '
            'canal nao registra handler nenhum.',
      );
      expect(
        swift,
        contains('setMethodCallHandler'),
        reason: 'REPROVA: o canal e construido e ninguem responde nele. '
            'Canal sem handler e o mesmo desfecho de canal nenhum.',
      );
      expect(
        swift,
        contains('"adicionar"'),
        reason: 'REPROVA: o handler nao trata o metodo `adicionar`, que e o '
            'unico que `saida_do_app.dart` chama.',
      );
    });

    test('o Runner do iOS NAO usa EventKit, e por isso nao pede permissao',
        () {
      final swift = semComentarios(
        lerOuReprovar('$raiz/app/ios/Runner/AppDelegate.swift'),
      );
      final plist = lerOuReprovar('$raiz/app/ios/Runner/Info.plist')
          .replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');

      // Os dois lados da mesma decisao, medidos juntos de proposito: quem
      // trocar o `.ics` por EventKit amanha vai precisar da chave, e este
      // caso e o que vai cobrar as duas coisas no mesmo diff.
      for (final deEventKit in <String>[
        'import EventKit',
        'EKEventStore',
        'EKEventEditViewController',
      ]) {
        expect(
          swift,
          isNot(contains(deEventKit)),
          reason: 'REPROVA: `$deEventKit` entrou no Runner.\n'
              'EventKit LE e GRAVA o calendario, e com ele o app passa a '
              'exigir `NSCalendarsUsageDescription` (e '
              '`NSCalendarsWriteOnlyAccessUsageDescription` no iOS 17+) e a '
              'MOSTRAR dialogo de permissao -- que o Android nao mostra, '
              'porque `ACTION_INSERT` so abre a tela de novo evento.\n'
              'A invariante de `saida_do_app.dart` e "cinco saidas, e nenhuma '
              'pede permissao". Se a troca for deliberada, a chave entra no '
              'Info.plist COM o comentario dizendo por que, e este caso vira '
              'o inverso -- no mesmo commit.',
        );
      }
      expect(
        plist,
        isNot(contains('NSCalendars')),
        reason: 'REPROVA: uma chave `NSCalendars...` entrou no Info.plist sem '
            'que o Runner use EventKit. E justificativa de permissao que o '
            'produto nao usa -- o mesmo excesso que o caso `nenhuma permissao '
            'de biblioteca de fotos` cobra do lado do Android, e que a '
            'revisao da App Store cobra na ficha.',
      );
    });

    test('`LSApplicationQueriesSchemes` nao existe, e nao precisa existir',
        () {
      final plist = lerOuReprovar('$raiz/app/ios/Runner/Info.plist')
          .replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');

      expect(
        plist,
        isNot(contains('LSApplicationQueriesSchemes')),
        reason: 'REPROVA: `LSApplicationQueriesSchemes` entrou no '
            'Info.plist.\n'
            'A porta abre mapas por `https://maps.apple.com`, que e LINK '
            'UNIVERSAL: `https` nao e esquema consultavel e a lista nao muda '
            'nada para ele.\n'
            'A lista so passa a ser necessaria com `comgooglemaps:` e '
            '`waze:` -- e esses dois exigem uma FOLHA DE ESCOLHA, porque o '
            'iOS nao tem conceito de aplicativo de mapas padrao. Folha de '
            'escolha e TELA, e o cliente aprova tela antes do codigo.',
      );
    });

    test('o Android continua registrando o mesmo canal', () {
      final kotlin = semComentarios(lerOuReprovar(
        '$raiz/app/android/app/src/main/kotlin/app/bichu/MainActivity.kt',
      ));
      expect(kotlin, contains('"app.bichu/calendario"'));
      expect(kotlin, contains('"adicionar"'));
      expect(
        kotlin,
        contains('ACTION_INSERT'),
        reason: 'REPROVA: o Android deixou de usar `ACTION_INSERT`. Ele e o '
            'que abre a tela de novo evento SEM ler nem gravar o calendario, '
            'e e por isso que o app nao pede `READ_CALENDAR` nem '
            '`WRITE_CALENDAR`. Trocar por acesso direto muda permissao de '
            'loja, e isso nao aparece rodando o app.',
      );
    });
  });
}
