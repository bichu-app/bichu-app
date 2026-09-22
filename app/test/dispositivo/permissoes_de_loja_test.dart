// BICHUS-161, criterio 7 — as declaracoes de uso que a revisao da loja le.
//
// A ISCA deste arquivo: **o unico defeito desta historia que nenhum teste de
// codigo pega e que so aparece na submissao.** Declaracao de uso generica
// ("O app usa a camera") volta reprovada da App Store, e a rodada de revisao
// inteira se perde. Nao ha como rodar isso; da para cobrar o texto.
//
// E cobra tambem a regra de sequencia que o Scrum Master registrou: a
// BICHUS-54 (ler o QR) usa A MESMA permissao de camera. Se ela escrever uma
// segunda justificativa, sao duas razoes diferentes para a mesma permissao no
// mesmo binario, e isso e reprovacao de loja. Por isso o caso exige que a
// string cubra OS DOIS usos: a foto do pet e o QR.
//
// O terceiro caso e de distribuicao, e e o mais silencioso de todos:
// `<uses-feature android:name="android.hardware.camera">` e INFERIDA como
// obrigatoria quando o manifesto declara `CAMERA`, e a Play Store passa a
// esconder o app de todo aparelho sem camera. O Bichu funciona sem camera.
// Isso nao aparece rodando o app, so no relatorio de alcance da loja.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Um portao que nao encontra o que conferir fica
/// verde por vazio, e e assim que esta classe de defeito passa.
Directory _raizDoRepositorio() {
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

String _lerOuReprovar(String caminho) {
  final arquivo = File(caminho);
  if (!arquivo.existsSync()) {
    throw StateError('REPROVA: $caminho nao existe. Sem ele nao ha o que '
        'conferir, e ficar verde sem conferir e o defeito que este arquivo '
        'existe para impedir.');
  }
  return arquivo.readAsStringSync();
}

void main() {
  final raiz = _raizDoRepositorio().path;

  /// **Os comentarios saem antes de qualquer medicao, e isso nao e detalhe.**
  ///
  /// A primeira execucao deste arquivo reprovou acusando `READ_MEDIA_IMAGES`
  /// no manifesto. Ela esta la: dentro do comentario que EXPLICA por que ela
  /// nao foi pedida. Medir o arquivo cru confunde a prosa com a declaracao, e
  /// o erro cai para os dois lados -- acusa o que nao existe, e deixaria
  /// passar uma permissao comentada como se estivesse declarada.
  String semComentariosXml(String fonte) =>
      fonte.replaceAll(RegExp(r'<!--[\s\S]*?-->'), '');

  final manifesto = semComentariosXml(
    _lerOuReprovar('$raiz/app/android/app/src/main/AndroidManifest.xml'),
  );
  final plistCru = _lerOuReprovar('$raiz/app/ios/Runner/Info.plist');
  final plist = semComentariosXml(plistCru);

  /// O valor da `<string>` que segue a chave, como o sistema a mostra.
  String? valorDoPlist(String chave) {
    final m = RegExp(
      '<key>$chave</key>\\s*<string>([^<]*)</string>',
    ).firstMatch(plist);
    return m?.group(1);
  }

  group('Android', () {
    test('CAMERA esta declarada', () {
      expect(
        manifesto,
        contains('android.permission.CAMERA'),
        reason: 'REPROVA: `CAMERA` sumiu do manifesto. Sem ela a BICHUS-54 '
            '(visor ao vivo para ler o QR) nao funciona, e acrescenta-la '
            'depois muda em silencio o comportamento de `ACTION_IMAGE_CAPTURE` '
            'numa tela que ninguem tocou.',
      );
    });

    test('a camera NAO e exigida como recurso de hardware', () {
      final m = RegExp(
        r'<uses-feature[^>]*android:name="android\.hardware\.camera"[^>]*'
        r'android:required="(true|false)"',
        multiLine: true,
      ).firstMatch(manifesto.replaceAll('\n', ' '));

      expect(
        m,
        isNotNull,
        reason: 'REPROVA: nao ha `<uses-feature android:hardware.camera>` '
            'explicito. Declarar `CAMERA` faz a Play Store INFERIR o recurso '
            'como obrigatorio e esconder o app de todo aparelho sem camera. O '
            'Bichu funciona sem camera: a galeria continua (criterio 5 da '
            'BICHUS-161) e o cadastro avanca sem foto (BICHUS-157). Isso nao '
            'aparece rodando o app, so no relatorio de alcance da loja.',
      );
      expect(
        m!.group(1),
        'false',
        reason: 'REPROVA: a camera esta marcada como recurso OBRIGATORIO. A '
            'loja vai esconder o app de aparelhos em que ele funciona.',
      );
    });

    test('nenhuma permissao de biblioteca de fotos foi pedida', () {
      // Decisao declarada do criterio 6: o seletor do sistema roda fora do
      // processo e concede por selecao. Pedir `READ_MEDIA_IMAGES` seria pedir
      // a biblioteca inteira para ler uma foto, que e exatamente o excesso que
      // a revisao da loja cobra.
      for (final excesso in <String>[
        'READ_MEDIA_IMAGES',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
      ]) {
        expect(
          manifesto,
          isNot(contains(excesso)),
          reason: 'REPROVA: `$excesso` entrou no manifesto. O `image_picker` '
              'usa o Photo Picker do sistema, que nao precisa dela. Pedir '
              'acesso a biblioteca inteira para ler uma foto escolhida e mais '
              'permissao do que o produto usa.',
        );
      }
    });
  });


  // -------------------------------------------------------------------------
  // BICHUS-23 — a localizacao aproximada, e o defeito que so o plist enxerga
  // -------------------------------------------------------------------------
  //
  // A ISCA DESTE GRUPO: **no iOS, quem decide se o app pede `Ao usar o app` ou
  // `Sempre` NAO e o codigo Dart -- e este arquivo.**
  //
  // `geolocator_apple` escolhe a autorizacao olhando o `Info.plist`
  // (`Handlers/PermissionHandler.m`, versao 2.3.14):
  //
  //     if (NSLocationWhenInUseUsageDescription != nil)
  //         [locationManager requestWhenInUseAuthorization];
  //     else if (containsLocationAlwaysDescription)
  //         [locationManager requestAlwaysAuthorization];
  //
  // Ou seja: acrescentar `NSLocationAlwaysUsageDescription` e APAGAR a de
  // `WhenInUse` muda o app de pedir localizacao pontual para pedir
  // localizacao permanente -- sem uma unica linha de Dart mudar, sem nenhum
  // teste de widget reprovar, e com o diff mostrando so duas linhas de XML.
  //
  // O criterio 2 da BICHUS-23 diz "no iOS o escopo e `Ao usar o app`, nunca
  // `Sempre`". Esta e a unica trava do repositorio capaz de cobrar essa frase.
  group('iOS: localizacao', () {
    test('NSLocationWhenInUseUsageDescription existe e nao e generica', () {
      final texto = valorDoPlist('NSLocationWhenInUseUsageDescription');
      expect(
        texto,
        isNotNull,
        reason: 'REPROVA: `NSLocationWhenInUseUsageDescription` ausente. Sem '
            'ela o `geolocator` nem chega a pedir: ele devolve '
            '`PermissionDefinitionsNotFound` e a captura falha em aparelho '
            'enquanto a suite inteira continua verde. E a submissao e '
            'recusada antes disso.',
      );
      expect(
        texto!.length,
        greaterThan(40),
        reason: 'REPROVA: a justificativa tem ${texto.length} caracteres. '
            '"O app usa a sua localizacao" e a forma que volta reprovada: ela '
            'nao diz para que.',
      );
      expect(
        texto.toLowerCase(),
        contains('bairro'),
        reason: 'REPROVA: a justificativa nao diz que o que aparece para as '
            'outras pessoas e o BAIRRO. Essa e a promessa do criterio 3 e do '
            'criterio 7, e o dialogo do sistema e o unico lugar onde ela '
            'chega a quem ainda nao decidiu.',
      );
    });

    test('NENHUMA chave de localizacao `Sempre` existe', () {
      // O caso que sustenta o criterio 2. Ver o cabecalho deste grupo: e a
      // PRESENCA destas chaves que muda o dialogo, e nao o codigo.
      for (final proibida in <String>[
        'NSLocationAlwaysUsageDescription',
        'NSLocationAlwaysAndWhenInUseUsageDescription',
      ]) {
        expect(
          plist,
          isNot(contains(proibida)),
          reason: 'REPROVA: `$proibida` entrou no Info.plist.\n'
              'O criterio 2 da BICHUS-23 diz que o escopo e `Ao usar o app`, '
              'NUNCA `Sempre`. O `geolocator_apple` le este arquivo para '
              'decidir qual autorizacao pedir: com esta chave presente, o app '
              'passa a poder pedir localizacao permanente sem nenhuma linha '
              'de Dart mudar.\n'
              'O produto nao usa localizacao em segundo plano -- ela esta em '
              '*Fora desta historia* -- e a revisao da App Store cobra '
              'justificativa de uso para o escopo que o binario declara.',
        );
      }
    });

    test('a justificativa e lida pela PESSOA, entao esta em portugues', () {
      final texto = valorDoPlist('NSLocationWhenInUseUsageDescription')!;
      expect(
        RegExp('[áéíóúâêôãõç]', caseSensitive: false).hasMatch(texto),
        isTrue,
        reason: 'REPROVA: a justificativa de localizacao nao parece portugues. '
            'O texto aparece palavra por palavra no dialogo do sistema.',
      );
    });
  });

  group('iOS', () {
    test('NSCameraUsageDescription existe e nao e generica', () {
      final texto = valorDoPlist('NSCameraUsageDescription');
      expect(
        texto,
        isNotNull,
        reason: 'REPROVA: `NSCameraUsageDescription` ausente. O app trava ao '
            'abrir a camera no iOS, e a submissao e recusada antes disso.',
      );
      expect(
        texto!.length,
        greaterThan(40),
        reason: 'REPROVA: a justificativa tem ${texto.length} caracteres. '
            '"O app usa a camera" e a forma que volta reprovada: ela nao diz '
            'para que.',
      );
      expect(
        texto.toLowerCase(),
        contains('pet'),
        reason: 'REPROVA: a justificativa nao diz que a camera fotografa o '
            'pet. A revisao cobra o uso real, nao a categoria.',
      );
    });

    test('UMA justificativa serve a foto do pet E ao QR da BICHUS-54', () {
      final texto = valorDoPlist('NSCameraUsageDescription')!.toLowerCase();
      expect(
        texto,
        contains('qr'),
        reason: 'REPROVA: a justificativa de camera cobre so a foto do pet. A '
            'BICHUS-54 (ler o QR da plaquinha) usa A MESMA permissao, e quem '
            'a implementar vai precisar escrever uma segunda razao. Duas '
            'justificativas diferentes para a mesma permissao no mesmo binario '
            'e reprovacao de revisao, descoberta na submissao, quando custa '
            'uma rodada inteira. A string precisa nascer cobrindo os dois.',
      );
    });

    test('NSPhotoLibraryUsageDescription existe e esta em portugues', () {
      final texto = valorDoPlist('NSPhotoLibraryUsageDescription');
      expect(
        texto,
        isNotNull,
        reason: 'REPROVA: `NSPhotoLibraryUsageDescription` ausente. O '
            '`PHPickerViewController` dispensa a autorizacao em tempo de '
            'execucao, mas a revisao cobra a string, e o caminho antigo '
            '(`UIImagePickerController`) a exige em aparelho mais velho.',
      );
      expect(texto!.length, greaterThan(40));
    });

    test('as duas strings sao lidas pela PESSOA, entao estao em portugues', () {
      // Elas aparecem palavra por palavra no dialogo do sistema. Uma delas em
      // ingles e a unica frase em ingles que o app inteiro mostra.
      for (final chave in <String>[
        'NSCameraUsageDescription',
        'NSPhotoLibraryUsageDescription',
      ]) {
        final texto = valorDoPlist(chave)!;
        expect(
          RegExp('[áéíóúâêôãõç]', caseSensitive: false).hasMatch(texto),
          isTrue,
          reason: 'REPROVA: `$chave` nao parece portugues. O texto aparece '
              'palavra por palavra no dialogo do sistema, e o app fala '
              'portugues em todas as outras telas.',
        );
        expect(
          texto,
          isNot(contains(RegExp(r'\bthe\b|\bcamera to\b|\bphotos\b'))),
          reason: 'REPROVA: `$chave` ficou com o texto padrao em ingles.',
        );
      }
    });
  });
}
