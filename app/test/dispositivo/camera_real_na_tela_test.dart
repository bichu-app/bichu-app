// BICHUS-161 — a implementacao REAL montada na tela de verdade.
//
// A ISCA deste arquivo: **a producao trocou de camera, e a tela nao pode ter
// percebido.** Os outros casos da 161 exercitam funcao pura, e os da 158
// exercitam a tela com dubles. Falta o encontro dos dois: `CameraDoAparelho`
// de verdade, com o `permission_handler` e o `image_picker` de verdade, dentro
// do app de verdade, na F1.4 de verdade. Nenhum duble nosso no caminho: o que
// e falso aqui e o **aparelho**, um degrau abaixo do plugin.
//
// O que ele pega, e nada mais pega: se a implementacao nova traduzir errado o
// que o aparelho responde, a F1.4 mostra o estado errado para todo mundo e os
// casos com duble continuam verdes, porque nenhum deles atravessa o plugin.
//
// O QUE A PRIMEIRA VERSAO DESTE ARQUIVO ERROU, e a descoberta vale mais que o
// caso: ele montava `CameraDoAparelho` sem canal nenhum, esperando
// `MissingPluginException` e a degradacao para `indisponivel`. Nao e isso que
// acontece. **Canal sem tratador em `flutter test` nao lanca: ele nunca
// responde.** O `await` fica pendente para sempre, a tela permanece no estado
// inicial, e o caso morre com `TimeoutException` depois de dez minutos --
// medido. `_semExplodir` nao pode salvar o que nunca volta, e nenhum `try`
// pega um futuro que nao completa. Por isso os casos abaixo instalam tratador
// no canal: sem ele nao se exercita integracao nenhuma, exercita-se espera.
//
// Consequencia pratica que fica registrada aqui porque e onde vao procurar:
// teste que caia na F1.4 **sem** injetar camera trava dez minutos, e nao
// reprova em um segundo. Por isso `abrirOApp` continua injetando
// `CameraNaoEmbarcada` por padrao (ver `test/telas/ajuda_de_tela.dart`).

import 'dart:io';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/escopo.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:permission_handler/permission_handler.dart';

import '../telas/ajuda_de_tela.dart';

/// O canal do `permission_handler`, com o nome que o proprio plugin usa.
///
/// Esta string e copia do `method_channel_permission_handler.dart` do
/// `permission_handler_platform_interface`. Se o plugin renomear o canal, o
/// tratador abaixo deixa de ser chamado e o caso **trava** em vez de reprovar
/// -- por isso o primeiro grupo confere o caminho inteiro antes de qualquer
/// caso de tela.
const MethodChannel _canalDePermissao = MethodChannel(
  'flutter.baseflow.com/permissions/methods',
);

const MethodChannel _canalDoSeletor = MethodChannel(
  'plugins.flutter.io/image_picker',
);

/// Um aparelho de mentira, um degrau ABAIXO do plugin.
///
/// Ele responde no protocolo do canal, nao na nossa interface: o
/// `permission_handler` e o `image_picker` de verdade rodam por cima dele, e e
/// por isso que este arquivo prova a integracao, e nao a nossa propria fiacao.
class _AparelhoDeMentira {
  _AparelhoDeMentira(this.tester);

  final WidgetTester tester;

  /// O que `checkPermissionStatus` devolve.
  PermissionStatus estado = PermissionStatus.granted;

  /// O que `requestPermissions` devolve. Nulo mantem [estado].
  PermissionStatus? aoPedir;

  /// Quando verdadeiro, **todo** metodo do canal de permissao explode com
  /// `PlatformException`. E o unico jeito honesto de exercitar
  /// `_semExplodir`: o plugin instalado responde, e o aparelho e que recusa.
  bool explodir = false;

  /// O caminho que o seletor devolve. Nulo significa "a pessoa cancelou".
  String? caminhoEscolhido;

  final List<String> chamadas = <String>[];

  void instalar() {
    final mensageiro = tester.binding.defaultBinaryMessenger;

    mensageiro.setMockMethodCallHandler(_canalDePermissao, (chamada) async {
      chamadas.add(chamada.method);
      if (explodir) {
        throw PlatformException(
          code: 'ERRO_DE_APARELHO',
          message: 'o aparelho recusou a consulta',
        );
      }
      switch (chamada.method) {
        case 'checkPermissionStatus':
          return _codigo(estado);
        case 'requestPermissions':
          final pedidas = (chamada.arguments as List<dynamic>).cast<int>();
          final resposta = aoPedir ?? estado;
          return <int, int>{
            for (final p in pedidas) p: _codigo(resposta),
          };
        case 'openAppSettings':
          return true;
        default:
          return null;
      }
    });

    mensageiro.setMockMethodCallHandler(_canalDoSeletor, (chamada) async {
      chamadas.add(chamada.method);
      return chamada.method == 'pickImage' ? caminhoEscolhido : null;
    });

    addTearDown(() {
      mensageiro.setMockMethodCallHandler(_canalDePermissao, null);
      mensageiro.setMockMethodCallHandler(_canalDoSeletor, null);
    });
  }

  /// O inteiro que o canal carrega para cada estado.
  ///
  /// **E a ordem de declaracao do enum**, e nao um numero escolhido aqui: o
  /// `decodePermissionStatus` do plugin indexa a lista pela mesma ordem. O
  /// primeiro grupo do arquivo existe para reprovar se essa suposicao morrer,
  /// porque ela morreria em silencio: todo estado viraria outro estado valido,
  /// e nada explodiria.
  static int _codigo(PermissionStatus status) => status.index;
}

/// Toca e deixa o **disco de verdade** responder antes de medir a tela.
///
/// `tocar` nao serve aqui, e o motivo e uma armadilha que custa uma hora: o
/// teste de widget roda num relogio falso, e `pumpAndSettle` adianta esse
/// relogio -- ele nao espera entrada e saida real. `CameraDoAparelho` le o
/// tamanho do arquivo escolhido com `File.length()`, que e I/O de verdade e so
/// completa no laco de eventos real. Sem `runAsync`, esse futuro nunca volta,
/// a tela nunca recebe a foto, e o caso reprova por um motivo que nao e o dele.
///
/// Escrito aqui, e nao em `ajuda_de_tela.dart`, porque este e o unico caminho
/// do app que toca o disco a partir de um toque.
Future<void> tocarEDeixarODiscoResponder(
  WidgetTester tester,
  Finder alvo,
) async {
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
  await tester.tap(alvo);
  await tester.pump();
  await tester.runAsync(
    () => Future<void>.delayed(const Duration(milliseconds: 50)),
  );
  await tester.pumpAndSettle();
}

void main() {
  Future<http.Response> semServidor(http.Request _) async =>
      http.Response('', 404);

  group('o caminho inteiro: canal -> plugin -> porta', () {
    // Sem este grupo, os casos de tela abaixo poderiam ficar verdes com uma
    // traducao errada que casa com uma expectativa igualmente errada.
    for (final status in PermissionStatus.values) {
      testWidgets(
          '$status atravessa o plugin e chega na porta como '
          '${estadoDaPermissaoDoPlugin(status)}', (tester) async {
        _AparelhoDeMentira(tester)
          ..estado = status
          ..instalar();

        expect(
          await const CameraDoAparelho().estadoDaCamera(),
          estadoDaPermissaoDoPlugin(status),
          reason: 'REPROVA: o aparelho respondeu $status e a porta entendeu '
              'outra coisa. Ou a traducao de `estadoDaPermissaoDoPlugin` '
              'mudou, ou o codigo que o canal carrega deixou de ser o indice '
              'de declaracao do enum do plugin. O segundo e o perigoso: todo '
              'estado vira outro estado valido, e nada explode.',
        );
      });
    }

    testWidgets('falha do aparelho vira `indisponivel`, e nao excecao solta',
        (tester) async {
      _AparelhoDeMentira(tester)
        ..explodir = true
        ..instalar();

      expect(
        await const CameraDoAparelho().estadoDaCamera(),
        EstadoDaPermissao.indisponivel,
        reason: 'REPROVA: `PlatformException` vazou da porta. Falha de canal '
            'nao pode derrubar a F1.4: ela degrada para ausencia de recurso, '
            'que e o que a tela da BICHUS-158 sabe dizer.',
      );
    });
  });

  testWidgets('a producao monta `CameraDoAparelho`, e nao o padrao antigo',
      (tester) async {
    // A ISCA da BICHUS-161 inteira, e ela vive numa linha so de `app.dart`.
    // Todos os outros casos INJETAM a camera; nenhum deles olha o que o app
    // escolhe quando ninguem injeta nada. Reverter aquela linha para
    // `CameraNaoEmbarcada` devolveria o produto ao estado anterior a esta
    // historia -- botao que nao faz nada -- e deixaria a suite inteira verde.
    //
    // Monta o app sem passar camera e le o que o `Escopo` publicou. Da para
    // fazer isso sem travar porque a rota inicial nao e a F1.4: a camera so e
    // consultada quando aquela tela abre.
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
        deposito: DepositoEmMemoria(),
        depositoDeIntencao: DepositoDeIntencaoEmMemoria(),
        clienteHttp: MockClient(semServidor),
        avisos: const AvisosNaoEmbarcados(),
      ),
    );
    await tester.pumpAndSettle();

    final escopo = tester.widget<Escopo>(find.byType(Escopo).first);
    expect(
      escopo.camera,
      isA<CameraDoAparelho>(),
      reason: 'REPROVA: sem injecao o app montou '
          '${escopo.camera.runtimeType}, e nao `CameraDoAparelho`. Se voltou a '
          'ser `CameraNaoEmbarcada`, o produto voltou ao estado anterior a '
          'BICHUS-161: os botoes de tirar foto e de escolher da galeria param '
          'de fazer qualquer coisa no aparelho, e nenhum outro caso desta '
          'suite percebe, porque todos injetam a camera que querem exercitar.',
    );
  });

  group('a tela reage ao aparelho, sem ter mudado uma linha', () {
    testWidgets(
        'permissao concedida: a F1.4 abre e a camera e a acao principal',
        (tester) async {
      _AparelhoDeMentira(tester)
        ..estado = PermissionStatus.granted
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

      expect(
        find.text('Passo 2 de 3'),
        findsOne,
        reason: 'REPROVA: a F1.4 nao abriu com a camera de producao montada. '
            'A troca de `CameraNaoEmbarcada` por `CameraDoAparelho` em '
            '`app.dart` derrubou a tela, e nenhum caso com duble pegaria isso.',
      );
      expect(
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.tirarFoto),
        findsOne,
        reason: 'REPROVA: com a permissao concedida a camera deixou de ser a '
            'acao principal. E o criterio 1 da BICHUS-161.',
      );
      expect(
        find.text(TextosDoCadastro.cameraNaoEmbarcada),
        findsNothing,
        reason: 'REPROVA: a tela ainda diz que nao ha camera embarcada num '
            'aparelho que concedeu a permissao. O texto da BICHUS-158 e do '
            'estado `indisponivel`, e so dele.',
      );
    });

    testWidgets(
        'negada permanentemente: a faixa aparece e os ajustes do sistema sao '
        'abertos DE VERDADE', (tester) async {
      // Criterio 4. A parte que so este caso pega: nao basta a faixa
      // aparecer, o toque precisa chegar ao canal. Faixa ligada a nada e o
      // botao mudo da BICHUS-158 com outra roupa.
      final aparelho = _AparelhoDeMentira(tester)
        ..estado = PermissionStatus.permanentlyDenied
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

      await rolarAte(tester, find.text(TextosDoCadastro.abrirOsAjustes));
      expect(
        find.text(TextosDoCadastro.cameraNegada),
        findsOne,
        reason: 'REPROVA: a recusa permanente nao mostrou a faixa com o '
            'caminho dos ajustes. Pedir de novo nao abre dialogo nenhum: sem '
            'a faixa, a tela vira um beco.',
      );

      await tocar(tester, find.text(TextosDoCadastro.abrirOsAjustes));
      expect(
        aparelho.chamadas,
        contains('openAppSettings'),
        reason: 'REPROVA: o toque em "${TextosDoCadastro.abrirOsAjustes}" nao '
            'chegou ao canal do sistema. As chamadas vistas foram '
            '${aparelho.chamadas}. O criterio 4 diz "abre os ajustes de '
            'verdade".',
      );
    });

    testWidgets('negada: tocar em tirar foto pede a permissao ao sistema',
        (tester) async {
      // Criterio 3: o dialogo do sistema abre, e a tela reage ao resultado.
      final aparelho = _AparelhoDeMentira(tester)
        ..estado = PermissionStatus.denied
        ..aoPedir = PermissionStatus.permanentlyDenied
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

      await tocar(tester, find.text(TextosDoCadastro.tirarFoto));

      expect(
        aparelho.chamadas,
        contains('requestPermissions'),
        reason: 'REPROVA: com a permissao negada o toque nao pediu nada ao '
            'sistema. Chamadas vistas: ${aparelho.chamadas}.',
      );
      await rolarAte(tester, find.text(TextosDoCadastro.abrirOsAjustes));
      expect(
        find.text(TextosDoCadastro.cameraNegada),
        findsOne,
        reason: 'REPROVA: a pessoa recusou de vez no dialogo e a tela nao '
            'reagiu ao resultado. Ela continua oferecendo uma acao que nao '
            'abre mais dialogo nenhum.',
      );
    });

    testWidgets('a foto escolhida vira FotoLocal com caminho, tipo e tamanho',
        (tester) async {
      // Criterios 1, 2 e 11 pelo caminho real: o `image_picker` devolve um
      // caminho, e o que a tela passa a mostrar depende de o arquivo ter
      // virado `FotoLocal` com os tres campos.
      final temporario = Directory.systemTemp.createTempSync('bichu-foto');
      addTearDown(() => temporario.deleteSync(recursive: true));
      final arquivo = File('${temporario.path}/nina.jpg')
        ..writeAsBytesSync(List<int>.filled(4096, 7));

      _AparelhoDeMentira(tester)
        ..estado = PermissionStatus.granted
        ..caminhoEscolhido = arquivo.path
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

      await tocarEDeixarODiscoResponder(
        tester,
        find.text(TextosDoCadastro.escolherDaGaleria),
      );

      expect(
        find.text(TextosDoCadastro.usarEstaFoto),
        findsOne,
        reason: 'REPROVA: a imagem escolhida na galeria nao chegou ao '
            'rascunho. Ou o seletor devolveu um caminho que '
            '`fotoLocalDoArquivo` recusou, ou a porta nao leu o tamanho do '
            'arquivo, e nos dois casos a tela fica oferecendo escolher de '
            'novo sem dizer por que.',
      );
      expect(
        find.text(TextosDoCadastro.nenhumaFotoAinda),
        findsNothing,
        reason: 'REPROVA: a area da foto continua no estado vazio com uma '
            'foto escolhida.',
      );
    });

    testWidgets('cancelar o seletor nao quebra nada e o rascunho fica intacto',
        (tester) async {
      // Criterios 8 e 9: cancelar e o caminho normal, e o silencio ali e
      // legitimo porque a pessoa agiu de proposito.
      _AparelhoDeMentira(tester)
        ..estado = PermissionStatus.granted
        ..caminhoEscolhido = null
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(
        tester,
        Rotas.cadastrarPetFoto,
        extra: rascunhoParaFoto(nome: 'Nina'),
      );

      await tocar(tester, find.text(TextosDoCadastro.escolherDaGaleria));

      expect(tester.takeException(), isNull);
      expect(
        find.text(TextosDoCadastro.nenhumaFotoAinda),
        findsOne,
        reason: 'REPROVA: cancelar o seletor mudou o estado da tela. Cancelar '
            'nao e erro nem escolha: nada deveria ter acontecido.',
      );
      expect(
        find.text(TextosDoCadastro.tituloDaFoto('Nina')),
        findsOne,
        reason: 'REPROVA: o rascunho nao sobreviveu ao cancelamento.',
      );
    });

    testWidgets('aparelho que recusa o canal: a tela DIZ, e nao fica muda',
        (tester) async {
      // O outro lado da BICHUS-158, agora pelo caminho real: o plugin esta
      // instalado e o aparelho e que falha. `_semExplodir` degrada para
      // `indisponivel`, e `indisponivel` nao constroi acao nenhuma.
      _AparelhoDeMentira(tester)
        ..explodir = true
        ..instalar();

      await abrirOApp(
        tester,
        rede: semServidor,
        camera: const CameraDoAparelho(),
      );
      await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

      await rolarAte(tester, find.text(TextosDoCadastro.cameraNaoEmbarcada));
      expect(
        find.text(TextosDoCadastro.cameraNaoEmbarcada),
        findsOne,
        reason: 'REPROVA: o canal falhou e a tela ficou sem dizer nada. Falha '
            'de aparelho E ausencia de recurso para quem esta olhando: a '
            'degradacao precisa ser a que a BICHUS-158 escreveu, visivel para '
            'quem usa o app, e nao excecao engolida.',
      );
      expect(
        find.byType(BotaoPrimario),
        findsNothing,
        reason: 'REPROVA: voltou a existir acao principal num estado em que '
            'nem a camera nem a galeria funcionam. E o botao mudo da '
            'BICHUS-158.',
      );
    });

    for (final aparelhoFalha in <bool>[false, true]) {
      testWidgets(
          'a acao de pular continua sendo a saida (aparelho '
          '${aparelhoFalha ? 'falhando' : 'concedendo'})', (tester) async {
        // O elo com a BICHUS-157: o beco sem saida nao pode voltar por causa
        // da troca de implementacao, e a foto do pet e OPCIONAL nos dois
        // extremos do estado do aparelho.
        _AparelhoDeMentira(tester)
          ..estado = PermissionStatus.granted
          ..explodir = aparelhoFalha
          ..instalar();

        await abrirOApp(
          tester,
          rede: semServidor,
          camera: const CameraDoAparelho(),
        );
        await irPara(tester, Rotas.cadastrarPetFoto, extra: rascunhoParaFoto());

        await tocar(tester, find.text(TextosDoCadastro.seguirSemFoto));
        expect(
          find.text('Passo 3 de 3'),
          findsOne,
          reason: 'REPROVA: com a camera de producao a F1.4 voltou a ser um '
              'beco sem saida. A foto do pet e OPCIONAL, e a BICHUS-161 nao '
              'pode enfraquecer o caminho de pular da BICHUS-157.',
        );
      });
    }
  });
}
