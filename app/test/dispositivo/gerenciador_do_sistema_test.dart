// A DECISAO DE PRIVACIDADE DA PORTA DE LOCALIZACAO, MEDIDA NO CANAL.
//
// `LocalizacaoPorGeolocator.forcarGerenciadorDoSistema` esta ligado por padrao
// e carrega quinze linhas de justificativa: no Android, o provedor fundido
// (`FusedLocationProviderClient`) combina GPS com a base de Wi-Fi e de celula
// do Google, e o `LocationManager` do proprio sistema nao envolve terceiro
// nenhum. O produto precisa de bairro, nao de calcada.
//
// A ISCA DESTE ARQUIVO: **este campo nasceu MORTO.** Da BICHUS-23 a
// 20/10/2026 ele foi declarado, documentado e nunca lido -- a captura montava
// um `LocationSettings` puro, e `forceLocationManager` so existe em
// `AndroidSettings`. O resultado nao foi um padrao conservador: com
// `LocationSettings` puro o `geolocator` usa o provedor fundido do Google, que
// e exatamente o terceiro que a decisao escrita manda tirar do caminho. A
// decisao estava inteira no comentario e nao valia no aparelho.
//
// Nenhum caso observava o campo, e e por isso que ele pode nascer assim. Um
// portao que checasse "o campo existe" nao teria pego nada: ele existia. Um
// que lesse o fonte procurando `AndroidSettings` reprovaria com o campo
// ignorado dentro da chamada. Por isso estes casos medem **o valor como ele
// sai no canal de metodo**, que e o unico lugar onde o lado nativo o le:
// `AndroidSettings.toJson()` escreve `forceLocationManager`, e e esse mapa que
// atravessa.
//
// O QUE ESTES CASOS NAO MEDEM. O canal daqui e
// `flutter.baseflow.com/geolocator`, do `MethodChannelGeolocator`, que e a
// implementacao em vigor quando nenhum plugin se registrou -- num teste de
// unidade, sempre. No aparelho Android quem responde e o `GeolocatorAndroid`,
// noutro canal (`..._android`), e ele manda `...?locationSettings?.toJson()`
// com um `requestId` a mais. O MAPA e o mesmo nos dois, e e o mapa que estes
// casos cobram; o nome do canal, nao.

library;

import 'dart:async';

import 'package:bichu/dispositivo/localizacao.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';

/// O canal do `geolocator`. O nome e do pacote, e nao nosso: se uma
/// atualizacao do pacote o mudar, estes casos reprovam por nao ver chamada
/// nenhuma, em vez de passarem a afirmar nada.
const MethodChannel _canalDoGeolocator =
    MethodChannel('flutter.baseflow.com/geolocator');

/// A chave que o lado nativo le para escolher o provedor.
const String _chaveDoProvedor = 'forceLocationManager';

/// O prazo dos casos que medem o MAPA, e nao a desistencia. Precisa ser
/// generoso: o mock responde na hora, e um prazo curto transformaria lentidao
/// da maquina de CI em reprovacao intermitente.
const Duration _prazo = Duration(seconds: 30);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<MethodCall> chamadas;
  late bool medicaoResponde;

  setUp(() {
    chamadas = <MethodCall>[];
    medicaoResponde = true;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoGeolocator, (chamada) async {
      chamadas.add(chamada);
      switch (chamada.method) {
        case 'checkPermission':
          return LocationPermission.whileInUse.index;
        case 'isLocationServiceEnabled':
          return true;
        case 'getCurrentPosition':
          if (!medicaoResponde) {
            // O aparelho que nao fixa: aceita o pedido e nao devolve nada.
            // Quem desiste e o `timeLimit`, do lado Dart.
            return Completer<Object?>().future;
          }
          return <String, Object?>{
            'latitude': -23.5505,
            'longitude': -46.6333,
            'accuracy': 480.0,
          };
        default:
          return null;
      }
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoGeolocator, null);
    debugDefaultTargetPlatformOverride = null;
  });

  /// Os argumentos da UNICA medicao pedida ao lado nativo.
  ///
  /// Exigir exatamente uma e deliberado: zero chamada deixaria qualquer
  /// afirmacao sobre o mapa verde por vazio, e duas significaria que a porta
  /// mede duas vezes por captura.
  Map<dynamic, dynamic> ajustesNoCanal() {
    final medicoes =
        chamadas.where((c) => c.method == 'getCurrentPosition').toList();
    expect(
      medicoes,
      hasLength(1),
      reason: 'REPROVA: a porta pediu ${medicoes.length} medicao(oes) ao lado '
          'nativo, e o esperado e uma. Sem exatamente uma, os casos abaixo '
          'nao estao medindo nada.',
    );
    return medicoes.single.arguments as Map<dynamic, dynamic>;
  }

  group('no Android, a captura usa o gerenciador do sistema', () {
    /// DESLIGANDO: troque o `AndroidSettings` de `_ajustesDaMedicao` por
    /// `LocationSettings(accuracy: ..., timeLimit: ...)` -- que e exatamente
    /// como a porta nasceu. Este caso reprova pelo nome.
    test('o pedido leva `$_chaveDoProvedor: true` para o lado nativo',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      final resultado =
          await LocalizacaoPorGeolocator().pontoAproximado(prazo: _prazo);

      // CONTROLE POSITIVO: a captura tem de ter dado certo. Sem isto, um
      // caminho que devolvesse `CapturaSemPonto` antes de medir deixaria o
      // resto do caso verde por nunca ter chegado ao canal.
      expect(
        resultado,
        isA<CapturaComPonto>(),
        reason: 'REPROVA: a captura nao devolveu ponto, e os casos deste '
            'arquivo medem o pedido que ela faz. Conferir o mock antes de '
            'olhar a porta.',
      );

      final ajustes = ajustesNoCanal();
      expect(
        ajustes.containsKey(_chaveDoProvedor),
        isTrue,
        reason: 'REPROVA: o mapa que atravessa para o lado nativo nao tem '
            '`$_chaveDoProvedor`. Isso significa `LocationSettings` puro, e '
            'no Android `LocationSettings` puro e o `FusedLocationProvider` '
            'do Google -- o terceiro que `forcarGerenciadorDoSistema` existe '
            'para tirar do caminho. Mapa recebido: $ajustes',
      );
      expect(
        ajustes[_chaveDoProvedor],
        isTrue,
        reason: 'REPROVA: `$_chaveDoProvedor` chegou como '
            '`${ajustes[_chaveDoProvedor]}`. Com `false` o lado nativo usa o '
            'provedor fundido do Google.',
      );
    });

    /// O CASO QUE PROVA QUE O CAMPO E LIDO, E NAO QUE ALGUEM ESCREVEU `true`.
    ///
    /// Sem ele, `forceLocationManager: true` cravado na chamada passaria --
    /// e o campo voltaria a ser prosa, que e a classe de defeito deste
    /// arquivo.
    ///
    /// DESLIGANDO: troque `forceLocationManager: forcarGerenciadorDoSistema`
    /// por `forceLocationManager: true`. Este caso reprova pelo nome.
    test('`forcarGerenciadorDoSistema: false` tambem atravessa', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      await LocalizacaoPorGeolocator(forcarGerenciadorDoSistema: false)
          .pontoAproximado(prazo: _prazo);

      expect(
        ajustesNoCanal()[_chaveDoProvedor],
        isFalse,
        reason: 'REPROVA: o campo nao chegou ao canal. Um valor que nao muda '
            'com o campo significa que o campo nao e lido -- foi assim que '
            'ele nasceu morto.',
      );
    });

    /// A precisao e decisao do criterio 2 da BICHUS-23, e ela viaja no MESMO
    /// mapa. Trocar `LocationSettings` por `AndroidSettings` e a ocasiao de
    /// perde-la em silencio: os dois aceitam `accuracy` e o compilador nao
    /// cobra nenhum.
    test('a precisao aproximada continua no mesmo mapa', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;

      await LocalizacaoPorGeolocator().pontoAproximado(prazo: _prazo);

      expect(
        ajustesNoCanal()['accuracy'],
        LocationAccuracy.low.index,
        reason: 'REPROVA: a precisao que atravessa nao e `low`. Pedir mais '
            'fino traria a rua e o numero de quem abriu o app em casa, e o '
            'produto nunca mostra mais que bairro (ADR-0010).',
      );
    });

    /// O prazo NAO viaja no mapa -- `LocationSettings.toJson()` nao o escreve,
    /// e quem desiste e o `.timeout()` do lado Dart. Por isso ele e medido
    /// pelo comportamento: sem este caso, uma troca de ajustes que esquecesse
    /// `timeLimit` deixaria a tela girando para sempre e nenhum mapa acusaria.
    test('o prazo continua desistindo quando o aparelho nao fixa', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;

      final resultado = await LocalizacaoPorGeolocator()
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        resultado,
        isA<CapturaSemPonto>()
            .having((r) => r.motivo, 'motivo',
                MotivoDeNaoTerPonto.semFixNoPrazo),
        reason: 'REPROVA: o aparelho nao respondeu e a captura nao desistiu. '
            'O `timeLimit` saiu dos ajustes, e o criterio 5 da BICHUS-23 '
            'proibe o fluxo travado.',
      );
    });
  });

  /// FORA DO ANDROID A CHAVE NAO EXISTE, E MANDA-LA NAO E INOFENSIVO.
  ///
  /// No iOS ha um `CLLocationManager` e nada mais: nao ha provedor a escolher.
  /// Uma chave que atravessa onde ninguem a le parece uma garantia que a
  /// plataforma nao da -- e quem for conferir a decisao pelo canal vai achar
  /// que ela vale nas duas.
  ///
  /// DESLIGANDO: devolva `AndroidSettings` sem olhar
  /// `defaultTargetPlatform`. Este caso reprova pelo nome.
  group('fora do Android, a chave do Android nao viaja', () {
    test('no iOS o mapa nao tem `$_chaveDoProvedor`', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;

      await LocalizacaoPorGeolocator().pontoAproximado(prazo: _prazo);

      final ajustes = ajustesNoCanal();
      expect(
        ajustes.containsKey(_chaveDoProvedor),
        isFalse,
        reason: 'REPROVA: `$_chaveDoProvedor` atravessou no iOS, onde nao ha '
            'provedor a escolher. Mapa recebido: $ajustes',
      );
      // CONTROLE POSITIVO do caso negativo: o mapa chegou, e esta vazio de
      // uma chave so. Sem isto, um mapa nulo ou uma chamada que nao aconteceu
      // tambem "nao teriam" a chave.
      expect(
        ajustes['accuracy'],
        LocationAccuracy.low.index,
        reason: 'REPROVA: o mapa do iOS nao traz nem a precisao. Nao ha o que '
            'concluir da ausencia da outra chave.',
      );
    });
  });
}
