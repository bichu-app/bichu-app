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

  /// **A IDADE DO PONTO GUARDADO, controlada pelo caso.** Nulo e "nao ha ponto
  /// guardado", que e o estado em que este arquivo nasceu e e o que mantem o
  /// caso antigo da desistencia verde.
  late Duration? idadeDaReserva;

  setUp(() {
    chamadas = <MethodCall>[];
    medicaoResponde = true;
    idadeDaReserva = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoGeolocator, (chamada) async {
      chamadas.add(chamada);
      switch (chamada.method) {
        case 'checkPermission':
          return LocationPermission.whileInUse.index;
        case 'isLocationServiceEnabled':
          return true;
        case 'getLastKnownPosition':
          final idade = idadeDaReserva;
          if (idade == null) return null;
          return <String, Object?>{
            'latitude': -22.9068,
            'longitude': -43.1729,
            'accuracy': 820.0,
            // `Position.fromMap` le milissegundos de epoca em UTC. Ponto no
            // passado e idade positiva; no futuro, negativa.
            'timestamp': DateTime.now()
                .toUtc()
                .subtract(idade)
                .millisecondsSinceEpoch,
          };
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

  /// ====================================================================
  /// A RESERVA PELO ULTIMO PONTO CONHECIDO -- 20/10/2026
  /// ====================================================================
  ///
  /// O RELATO: no Android o botao de localizacao falhava e no iOS funcionava, e
  /// a causa foi medida. `forcarGerenciadorDoSistema` **passou a funcionar de
  /// verdade** em 20/10/2026 (ver o cabecalho deste arquivo), e com ele o
  /// Android usa o `LocationManager` cru. Com `ACCESS_COARSE_LOCATION` sozinha
  /// e sem o provedor fundido, um aparelho DENTRO DE CASA frequentemente nao
  /// fixa no prazo. No iOS nao ha provedor a escolher e o `CLLocationManager`
  /// devolve um fix aproximado em cache na hora -- e e so por isso que o iOS
  /// nunca teve este defeito.
  ///
  /// **A DECISAO DE PRIVACIDADE NAO FOI REVERTIDA PARA CONSERTAR ISSO**, e este
  /// grupo e o que prova. `getLastKnownPosition` vem do sistema, e o padrao do
  /// PACOTE para ele e `forceLocationManager: false` -- que no lado nativo e
  /// `isGooglePlayServicesAvailable(context) ? new FusedLocationClient(...)`,
  /// ou seja o provedor do Google. A reserva so e inofensiva porque a porta
  /// repassa o campo EXPLICITAMENTE, e e esse valor que os casos abaixo medem
  /// no canal.
  group('a reserva do ultimo ponto nao passa pelo provedor do Google', () {
    /// Os argumentos da UNICA reserva pedida ao lado nativo.
    Map<dynamic, dynamic> reservaNoCanal() {
      final pedidos =
          chamadas.where((c) => c.method == 'getLastKnownPosition').toList();
      expect(
        pedidos,
        hasLength(1),
        reason: 'REPROVA: a porta pediu ${pedidos.length} reserva(s) ao lado '
            'nativo, e o esperado e uma. Zero significa que a reserva nao '
            'existe (o defeito do Android esta de volta) e deixaria qualquer '
            'afirmacao abaixo verde por vazio; duas significa que ela e pedida '
            'mais de uma vez por captura.',
      );
      return pedidos.single.arguments as Map<dynamic, dynamic>;
    }

    /// O CASO CENTRAL DA DECISAO DE PRIVACIDADE NESTE CAMINHO NOVO.
    ///
    /// DESLIGANDO: chame `Geolocator.getLastKnownPosition()` sem argumento, que
    /// e a forma que *parece* certa. O padrao do pacote e `false`, o lado nativo
    /// cai no `FusedLocationProvider`, e este caso reprova pelo nome.
    test('o pedido da reserva leva `$_chaveDoProvedor: true` para o lado nativo',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = const Duration(minutes: 2);

      final resultado = await LocalizacaoPorGeolocator()
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      // CONTROLE POSITIVO: a reserva tem de ter SERVIDO. Sem isto, um caminho
      // que nem chegasse a usar o ponto deixaria o resto do caso sem
      // significado.
      expect(
        resultado,
        isA<CapturaComPonto>(),
        reason: 'REPROVA: o aparelho nao fixou, havia ponto guardado de 2 min, '
            'e a captura nao devolveu ponto. A reserva nao esta sendo usada, e '
            'o aparelho dentro de casa volta a nao ter cidade.',
      );

      final pedido = reservaNoCanal();
      expect(
        pedido[_chaveDoProvedor],
        isTrue,
        reason: 'REPROVA: `$_chaveDoProvedor` chegou como '
            '`${pedido[_chaveDoProvedor]}` no pedido da RESERVA. Com `false` o '
            '`GeolocationManager.createLocationClient` do lado nativo devolve '
            '`FusedLocationClient` -- o provedor do Google, que e exatamente o '
            'terceiro que a decisao escrita manda tirar do caminho de um dado '
            'pessoal. A reserva existe para recuperar funcao SEM abrir mao '
            'dela. Mapa recebido: $pedido',
      );
    });

    /// O CASO QUE PROVA QUE O CAMPO E LIDO TAMBEM AQUI, e nao que alguem
    /// escreveu `true` na segunda chamada.
    ///
    /// DESLIGANDO: troque
    /// `forceAndroidLocationManager: forcarGerenciadorDoSistema` por
    /// `forceAndroidLocationManager: true`. Este caso reprova pelo nome.
    test('`forcarGerenciadorDoSistema: false` tambem atravessa na reserva',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = const Duration(minutes: 2);

      await LocalizacaoPorGeolocator(forcarGerenciadorDoSistema: false)
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        reservaNoCanal()[_chaveDoProvedor],
        isFalse,
        reason: 'REPROVA: o campo nao chegou ao canal da reserva. Um valor que '
            'nao muda com o campo significa que o campo nao e lido -- foi '
            'assim que ele nasceu morto na captura.',
      );
    });

    /// A ORDEM IMPORTA: a reserva e RESERVA, e nao o caminho normal.
    ///
    /// DESLIGANDO: peca a reserva antes de `getCurrentPosition`. Este caso
    /// reprova pelo nome, e o defeito que ele impede e caro: a cidade passaria
    /// a vir de um ponto velho mesmo no aparelho que fixa na hora.
    test('com o aparelho fixando, a reserva NAO e pedida', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      idadeDaReserva = const Duration(minutes: 2);

      final resultado =
          await LocalizacaoPorGeolocator().pontoAproximado(prazo: _prazo);

      expect(resultado, isA<CapturaComPonto>());
      expect(
        chamadas.where((c) => c.method == 'getLastKnownPosition'),
        isEmpty,
        reason: 'REPROVA: a medicao deu certo e a porta pediu a reserva do '
            'mesmo jeito. Ponto guardado e pior que ponto medido, e pedi-lo '
            'sempre o tornaria o caminho normal.',
      );
    });
  });

  /// ====================================================================
  /// O CRITERIO DE IDADE, e ele esta no codigo e nao na cabeca de ninguem
  /// ====================================================================
  ///
  /// Ver `LocalizacaoPorGeolocator.idadeMaximaDoPontoGuardado`: ponto velho e
  /// PONTO, e nao verdade nova. Aceitar qualquer idade poria quem acabou de
  /// descer do aviao na cidade de onde saiu, com o rotulo *da sua localizacao*
  /// colado.
  group('ponto guardado velho demais nao serve', () {
    const teto = LocalizacaoPorGeolocator.idadeMaximaDoPontoGuardado;

    /// O TETO EXISTE E NAO E INFINITO. Sem este caso, a reserva aceitaria o
    /// ponto de ontem.
    ///
    /// DESLIGANDO: apague a comparacao com
    /// `idadeMaximaDoPontoGuardado`. Este caso reprova pelo nome.
    test('acima do teto a captura desiste, e o detalhe diz a idade', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = teto + const Duration(minutes: 5);

      final resultado = await LocalizacaoPorGeolocator()
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        resultado,
        isA<CapturaSemPonto>()
            .having((r) => r.motivo, 'motivo', MotivoDeNaoTerPonto.semFixNoPrazo),
        reason: 'REPROVA: o ponto guardado tinha ${idadeDaReserva!.inMinutes} '
            'min, o teto e ${teto.inMinutes} min, e a captura o aceitou. Uma '
            'cidade nomeada por um ponto velho e a "cidade errada derivada em '
            'silencio" com uma fonte nova.',
      );
      expect(
        (resultado as CapturaSemPonto).detalhe,
        contains('reserva velha'),
        reason: 'REPROVA: o detalhe nao registra que houve ponto guardado e '
            'ele foi recusado por idade. Sem isso, "nao havia reserva" e '
            '"havia e era velha" chegam iguais no relato -- e o conserto das '
            'duas e diferente. Detalhe recebido: '
            '${resultado.detalhe}',
      );
    });

    /// DENTRO DO TETO ELE SERVE -- o contrapeso, e sem ele o caso acima seria
    /// satisfeito por uma reserva que nunca aceita nada.
    test('abaixo do teto a captura usa o ponto guardado', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = teto - const Duration(minutes: 1);

      final porta = LocalizacaoPorGeolocator();
      final resultado =
          await porta.pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        resultado,
        isA<CapturaComPonto>(),
        reason: 'REPROVA: o ponto guardado tinha ${idadeDaReserva!.inMinutes} '
            'min, dentro do teto de ${teto.inMinutes} min, e foi recusado. Um '
            'teto que recusa tudo e o defeito do Android de volta com um nome '
            'novo.',
      );
      expect(
        porta.reservasUsadas,
        1,
        reason: 'REPROVA: o contador da reserva nao andou. Ele e o unico jeito '
            'de saber, no aparelho do cliente, se a reserva serviu para algo.',
      );
    });

    /// IDADE NEGATIVA TAMBEM E RECUSA, e ela acontece: relogio do aparelho
    /// adiantado, ou trocado entre a medicao e agora.
    ///
    /// DESLIGANDO: troque `idade.isNegative || idade > teto` por
    /// `idade > teto`. Este caso reprova pelo nome, e o `timestamp` no futuro
    /// passaria calado como o ponto mais fresco possivel.
    test('ponto com relogio no futuro nao prova frescor, e e recusado',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = const Duration(minutes: -10);

      final resultado = await LocalizacaoPorGeolocator()
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        resultado,
        isA<CapturaSemPonto>(),
        reason: 'REPROVA: um `timestamp` no FUTURO foi aceito como ponto '
            'fresco. Ele nao prova frescor nenhum -- prova que o relogio do '
            'aparelho nao e confiavel, e nesse caso a idade nao mede nada.',
      );
    });

    /// SEM PONTO GUARDADO, a desistencia continua -- e o detalhe o diz.
    test('sem ponto guardado o detalhe diz que a reserva nao tinha nada',
        () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      medicaoResponde = false;
      idadeDaReserva = null;

      final resultado = await LocalizacaoPorGeolocator()
          .pontoAproximado(prazo: const Duration(milliseconds: 50));

      expect(
        (resultado as CapturaSemPonto).detalhe,
        contains('reserva sem ponto'),
        reason: 'REPROVA: a etapa da reserva nao aparece no detalhe. O detalhe '
            'e o unico instrumento que este projeto tem no aparelho do '
            'cliente. Detalhe recebido: ${(resultado).detalhe}',
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
