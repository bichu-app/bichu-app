// BICHUS-161, criterio 10 — "nenhuma tela do assistente de cadastro muda de
// codigo por causa desta historia. Se alguma precisar mudar, a porta esta
// sendo contornada, e isso reprova".
//
// A ISCA deste arquivo: **o criterio 10 so existe como frase enquanto alguem
// o afirma.** "Conferi com `git diff` que nenhuma tela mudou" e verdade no dia
// em que foi digitada e nao acusa nada no dia seguinte. Quem ler o commit
// acredita; quem contornar a porta depois nao encontra ninguem reclamando.
//
// Sao dois portoes, e eles pegam coisas diferentes:
//
// 1. A TRAVA DE CONTEUDO cobra a letra do criterio: os arquivos do assistente
//    de cadastro sao byte a byte os de `7fe24a6`, a base desta branch. Um
//    espaco a mais reprova. E de proposito que ela seja burra: o criterio nao
//    fala de comportamento, fala de o codigo nao ter mudado.
//
// 2. O PORTAO ESTRUTURAL cobra o espirito, e sobrevive a esta historia: tela
//    nenhuma importa plugin de aparelho nem fala canal de plataforma. A trava
//    de conteudo morre no dia em que uma historia legitima mexer na tela; este
//    aqui continua valendo, e e ele que pega o contorno de verdade.
//
// COMO DESTRAVAR, quando uma historia FUTURA tiver motivo legitimo para mexer
// numa destas telas (a BICHUS-159, por exemplo): rode
// `shasum -a 256 app/lib/telas/pet/<arquivo>`, troque o digest na tabela
// abaixo e cite a chave da issue na linha. Trocar o digest e um ato
// deliberado, com nome e motivo no diff; era isso que "nao mudou" precisava
// custar para deixar de ser uma frase.
//
// O QUE ESTE PORTAO NAO COBRE: o criterio 12, verificacao em aparelho fisico.
// Camera nao se verifica em simulador nem em teste de widget, e nada aqui
// finge que verifica.

import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';

/// Sobe de `Directory.current` ate achar a raiz do repositorio.
///
/// **Reprova quando nao acha.** Portao que nao encontra o que conferir fica
/// verde por vazio, e e assim que esta classe de defeito passa despercebida.
Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/app/lib/telas').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei a raiz do repositorio subindo a partir de '
    '"${Directory.current.path}". Sem ela este portao nao confere nada, e '
    'ficar verde sem conferir e exatamente o que ele existe para impedir.',
  );
}

/// O assistente de cadastro, arquivo por arquivo, com o digest da base
/// `7fe24a6` (BICHUS-157 e 158, o commit em que esta branch nasceu).
///
/// A lista e fechada **e conferida contra o diretorio**: arquivo novo em
/// `telas/pet/` tambem reprova, porque acrescentar tela ao assistente e
/// muda-lo tanto quanto editar uma.
const Map<String, String> _digestDoAssistente = <String, String>{
  'rascunho_de_pet.dart':
      '0c83f78ad3541eaf61dd7d3762d02cd126a6f6b503a773042e3ccc00d56d8a19',
  'resultado_do_cadastro.dart':
      'f464d320e17cbdf1cfebfe91eaf06ac1663eb0182d4fd86707f87e1d03525abd',
  'tela_cadastrar_foto.dart':
      '025eb4f7dcf6530f46776031df4dec0125e3f79888340c45d28c0f2f3f877986',
  'tela_cadastrar_identificacao.dart':
      'aceceb61dad9487e89ada142bb6e73497b1bfe876931eab2571c6c821392c19a',
  'tela_cadastrar_sinais.dart':
      '892c3934005f3668108b949b2e08eeb8b5da75e8fa70d1d6c70f3db7ae86da99',
  'tela_pet_cadastrado.dart':
      'e262c8d1ec39464ac92441d684684a12fe153e9ebaccd6110949ca108308a26b',
  'textos_do_cadastro.dart':
      'eb1f9009a4fbd48045b819652a6416fabca39463e118d4de3e669df6075cbf47',
};

void main() {
  final raiz = _raizDoRepositorio().path;
  final pastaDoAssistente = Directory('$raiz/app/lib/telas/pet');
  final pastaDeTelas = Directory('$raiz/app/lib/telas');

  group('criterio 10: o assistente de cadastro nao mudou uma linha', () {
    test('a pasta do assistente existe e tem arquivo', () {
      // Sem isto, apagar a pasta deixaria os outros casos verdes por vazio.
      expect(
        pastaDoAssistente.existsSync(),
        isTrue,
        reason: 'REPROVA: ${pastaDoAssistente.path} nao existe. Este portao '
            'nao tem o que conferir, e ficar verde assim seria pior que nao '
            'existir.',
      );
    });

    test('o conjunto de arquivos e exatamente o da base', () {
      final noDisco = pastaDoAssistente
          .listSync()
          .whereType<File>()
          .map((f) => f.uri.pathSegments.last)
          .where((n) => n.endsWith('.dart'))
          .toSet();

      expect(
        noDisco,
        equals(_digestDoAssistente.keys.toSet()),
        reason: 'REPROVA: o assistente de cadastro ganhou ou perdeu arquivo. '
            'No disco: ${noDisco.toList()..sort()}. Na tabela desta isca: '
            '${_digestDoAssistente.keys.toList()..sort()}. Acrescentar tela ao '
            'assistente muda o assistente tanto quanto editar uma; se a '
            'mudanca e legitima e de outra historia, acrescente o arquivo e o '
            'digest dele na tabela, citando a chave da issue.',
      );
    });

    for (final entrada in _digestDoAssistente.entries) {
      test('${entrada.key} e byte a byte o da base 7fe24a6', () {
        final arquivo = File('${pastaDoAssistente.path}/${entrada.key}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: ${entrada.key} sumiu do assistente de cadastro.',
        );

        final agora = sha256.convert(arquivo.readAsBytesSync()).toString();
        expect(
          agora,
          entrada.value,
          reason: 'REPROVA: `app/lib/telas/pet/${entrada.key}` mudou.\n'
              '  esperado (base 7fe24a6): ${entrada.value}\n'
              '  encontrado:              $agora\n'
              'O criterio 10 da BICHUS-161 diz que nenhuma tela do assistente '
              'de cadastro muda de codigo por causa da camera embarcada: se '
              'uma precisou mudar, a porta `CameraEGaleria` esta sendo '
              'contornada, e o lugar do conserto e a porta, nao a tela.\n'
              'Se a mudanca e de OUTRA historia e legitima, rode '
              '`shasum -a 256 app/lib/telas/pet/${entrada.key}` e troque o '
              'digest na tabela de `porta_nao_contornada_test.dart`, citando a '
              'chave da issue na linha. Trocar o digest precisa ser um ato '
              'deliberado, com nome e motivo no diff.',
        );
      });
    }
  });

  group('o espirito do criterio 10: nenhuma tela fala com o aparelho', () {
    // Este grupo sobrevive ao dia em que a trava de conteudo for destravada.
    // Ele nao cobra "a tela nao mudou", cobra "a tela nao virou a porta".
    late final List<File> telas;

    setUpAll(() {
      telas = pastaDeTelas
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();
    });

    test('ha telas para conferir', () {
      expect(
        telas.length,
        greaterThan(5),
        reason: 'REPROVA: achei ${telas.length} arquivo(s) em '
            '${pastaDeTelas.path}. O projeto tem mais que isso; um portao que '
            'varre a pasta errada passa por vazio.',
      );
    });

    test('nenhuma tela importa plugin de aparelho', () {
      // A porta existe para que a integracao com o aparelho tenha UM lugar.
      // Uma tela que importe o plugin direto contorna a porta sem precisar
      // mudar nenhuma assinatura, e nada mais pega isso.
      const proibidos = <String, String>{
        'package:image_picker/': 'o seletor de imagem',
        'package:permission_handler/': 'o pedido de permissao',
        'dart:io': 'o sistema de arquivos',
      };

      for (final tela in telas) {
        final fonte = tela.readAsStringSync();
        for (final proibido in proibidos.entries) {
          expect(
            fonte.contains("import '${proibido.key}"),
            isFalse,
            reason: 'REPROVA: ${tela.path} importa `${proibido.key}` '
                '(${proibido.value}). Integracao com o aparelho mora em '
                '`lib/dispositivo/`, atras da porta `CameraEGaleria`. Tela que '
                'importa o plugin direto contorna a porta sem mudar assinatura '
                'nenhuma, deixa de ser testavel sem aparelho, e leva a regra de '
                'permissao para um lugar onde ela vai ser reescrita diferente '
                'na proxima tela.',
          );
        }
      }
    });

    test('nenhuma tela abre canal de plataforma', () {
      // `package:flutter/services.dart` continua permitido: `Clipboard` e
      // `HapticFeedback` sao dele e sao de tela. O que nao e de tela e abrir
      // canal.
      for (final tela in telas) {
        final fonte = tela.readAsStringSync();
        for (final canal in <String>['MethodChannel(', 'EventChannel(']) {
          expect(
            fonte.contains(canal),
            isFalse,
            reason: 'REPROVA: ${tela.path} abre um `$canal`. Canal de '
                'plataforma e da camada de dispositivo; numa tela ele nao tem '
                'como ser exercitado por teste de widget, e o estado de '
                'permissao passa a existir em dois lugares.',
          );
        }
      }
    });

    test('nenhuma tela nomeia a implementacao concreta da camera', () {
      // A tela conhece a porta, nao quem a implementa. Nomear
      // `CameraDoAparelho` faria a tela deixar de ser montavel sem aparelho, e
      // e o jeito mais discreto de contornar a injecao.
      for (final tela in telas) {
        final fonte = tela.readAsStringSync();
        for (final concreta in <String>[
          'CameraDoAparelho',
          'CameraNaoEmbarcada',
        ]) {
          expect(
            fonte.contains(concreta),
            isFalse,
            reason: 'REPROVA: ${tela.path} nomeia `$concreta`. A tela recebe '
                '`CameraEGaleria` pelo escopo e nao escolhe implementacao; '
                'quem escolhe e `app.dart`, em um lugar so.',
          );
        }
      }
    });
  });
}
