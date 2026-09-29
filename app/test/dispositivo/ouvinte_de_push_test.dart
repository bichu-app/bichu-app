// LIGACAO 2 — o alerta chega e ALGO acontece. As ISCAS.
//
// O servidor dispara o alerta de verdade: consulta de raio de 5 km com PostGIS,
// teto de 500 destinatarios, FCM HTTP v1. O `firebase_messaging` estava no
// `pubspec.yaml`, o aparelho era registrado e o token subia -- e **nada no app
// escutava**. Zero ouvintes. A mensagem chegava no aparelho e morria ali.
//
// O QUE CADA GRUPO PRECISA REPROVAR, e o mecanismo que o produz:
//
//  1. `o alerta chega e nada acontece` — apague qualquer um dos tres ouvintes
//     de `OuvinteDeAvisos.ligar()` e o caso daquele estado reprova. **Os tres
//     sao medidos separadamente de proposito**: omitir um e o defeito classico,
//     e ele passa despercebido porque os outros dois cobrem tudo o que se testa
//     a mao com o app na tela.
//  2. `a faixa mostra o alerta com o app ABERTO` — apague a `AvisoQueChegou` da
//     casca e o caso reprova: em primeiro plano o sistema operacional nao
//     desenha nada, entao quem esta com o app na mao e a unica pessoa que nao
//     ve o alerta.
//  3. `o tipo que este build nao conhece nao e descartado` — troque o ramo
//     `desconhecido` por um `return` que engole o aviso e o caso reprova.
//
// **O que este arquivo NAO prova, e esta dito em voz alta:** que o push chega
// de verdade da VM de homologacao. A conta de servico daquela VM **nao tem o
// papel de envio de notificacao**, e o primeiro envio falha com 403. Os tres
// estados aqui sao exercitados pela porta `MensagensDePush`, que e o unico jeito
// que existe -- nao ha como pedir ao Flutter que mate o processo e o reabra por
// um toque em notificacao. A ultima perna (servidor manda, FCM entrega, aparelho
// acorda) depende daquele papel e nao esta provada por nada aqui.

import 'dart:async';

import 'package:bichu/dispositivo/avisos_recebidos.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

/// Uma porta de mensagens que o caso controla.
///
/// Os dois streams sao `broadcast` porque `OuvinteDeAvisos` assina cada um uma
/// vez e o caso empurra depois; e sao fechados no `encerrar` para o
/// `pumpAndSettle` nao esperar para sempre.
class MensagensDePushDeTeste implements MensagensDePush {
  MensagensDePushDeTeste({this.avisoQueAbriuOApp});

  final RemoteMessage? avisoQueAbriuOApp;

  final _aberto = StreamController<RemoteMessage>.broadcast();
  final _toque = StreamController<RemoteMessage>.broadcast();

  /// Quantas vezes `getInitialMessage` foi consultado. Uma, e so uma: o
  /// `firebase_messaging` entrega a mensagem de arranque uma vez.
  int consultasDoArranque = 0;

  @override
  Stream<RemoteMessage> get comOAppAberto => _aberto.stream;

  @override
  Stream<RemoteMessage> get aoTocarNoAviso => _toque.stream;

  @override
  Future<RemoteMessage?> oAvisoQueAbriuOApp() async {
    consultasDoArranque += 1;
    return avisoQueAbriuOApp;
  }

  void chegouComOAppAberto(RemoteMessage m) => _aberto.add(m);
  void tocaram(RemoteMessage m) => _toque.add(m);

  Future<void> encerrar() async {
    await _aberto.close();
    await _toque.close();
  }
}

/// Uma mensagem como o servidor a monta.
///
/// `notification` **junto** com `data`, que e o que `fcm-http-v1.ts` envia. Um
/// caso que mandasse `data-only` estaria exercitando um servidor que nao
/// existe -- e faria parecer que o isolate de segundo plano falta.
RemoteMessage mensagemDoServidor({
  required String tipo,
  String ref = 'st_abc123',
  String titulo = 'Alguém está com Thor',
  String corpo = 'Uma pessoa escaneou a tag agora. Toque para falar.',
}) {
  return RemoteMessage(
    notification: RemoteNotification(title: titulo, body: corpo),
    data: <String, dynamic>{'tipo': tipo, 'ref': ref},
  );
}

void main() {
  Future<http.Response> rede(http.Request req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (req.url.path.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    return http.Response('', 404);
  }

  // -----------------------------------------------------------------------
  // ISCA 1 — o alerta chega e nada acontece
  // -----------------------------------------------------------------------
  group('ISCA — o alerta chega e nada acontece', () {
    test('ESTADO 1, app ABERTO: onMessage chega ao ouvinte', () async {
      final porta = MensagensDePushDeTeste();
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      porta.chegouComOAppAberto(
        mensagemDoServidor(tipo: 'alertaDeVizinhanca', ref: 'st_vizinho'),
      );
      // O stream entrega no proximo giro do laco de eventos.
      await Future<void>.delayed(Duration.zero);

      expect(
        ouvinte.recebidosComOAppAberto,
        1,
        reason:
            'REPROVA: o app estava ABERTO, a mensagem chegou e o ouvinte nao a '
            'viu. `FirebaseMessaging.onMessage` nao esta assinado. Em primeiro '
            'plano o SDK nao desenha notificacao nenhuma no Android, entao sem '
            'este caminho quem esta com o app na mao e a UNICA pessoa que nao '
            've o alerta.',
      );
      expect(
        ouvinte.ultimoAviso?.tipo,
        TipoDeAvisoRecebido.alertaDeVizinhanca,
        reason: 'REPROVA: o aviso chegou e `data.tipo` nao foi lido.',
      );
      expect(
        ouvinte.ultimoAviso?.referencia,
        'st_vizinho',
        reason:
            'REPROVA: `data.ref` nao foi lido. Ele e o `share_token`, e e o '
            'UNICO identificador que o payload carrega -- o ADR-0010 proibe '
            '`pet_id` e `case_id` num push, e a porteira do servidor estoura '
            'se alguem tentar por.',
      );
    });

    test('ESTADO 2, app em SEGUNDO PLANO: o toque chega ao ouvinte', () async {
      final porta = MensagensDePushDeTeste();
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      porta.tocaram(mensagemDoServidor(tipo: 'tagEscaneada'));
      await Future<void>.delayed(Duration.zero);

      expect(
        ouvinte.recebidosPorToque,
        1,
        reason:
            'REPROVA: a pessoa TOCOU no aviso que o sistema desenhou e o app '
            'nao ficou sabendo. `FirebaseMessaging.onMessageOpenedApp` nao '
            'esta assinado: o app abre na tela em que estava e ela nao entende '
            'o que aconteceu.',
      );
    });

    test('ESTADO 3, app FECHADO: o aviso que abriu o processo chega, e e '
        'consultado UMA vez', () async {
      final porta = MensagensDePushDeTeste(
        avisoQueAbriuOApp: mensagemDoServidor(tipo: 'tagEscaneada'),
      );
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      expect(
        ouvinte.recebidosNoArranque,
        1,
        reason:
            'REPROVA: o toque na notificacao LANCOU o processo e o aviso nao '
            'chegou a ouvinte nenhum. `getInitialMessage()` nao e chamado. '
            'Este e o estado que se esquece, porque os dois streams cobrem '
            'tudo o que se testa a mao com o app na tela -- e e o estado mais '
            'comum de verdade: o telefone estava no bolso.',
      );
      expect(
        ouvinte.ultimoAviso?.titulo,
        'Alguém está com Thor',
        reason:
            'REPROVA: o texto que o servidor mandou nao chegou. Ele vem pronto '
            'no payload e tem uma fonte so (`conteudo-do-push.ts`); remontar a '
            'frase no app produziria duas redacoes do mesmo aviso.',
      );
      expect(
        porta.consultasDoArranque,
        1,
        reason:
            'REPROVA: `getInitialMessage()` foi consultado '
            '${porta.consultasDoArranque} vezes. A entrega e unica, e duas '
            'consultas entregariam o mesmo aviso duas vezes -- a pessoa veria '
            'a faixa reaparecer depois de fechar.',
      );
    });

    test('os tres estados estao ligados na MESMA chamada de `ligar`', () async {
      // O caso que pega a omissao de um estado quando os outros dois passam.
      // Medir os tres separadamente ja pega isso; este mede que UMA chamada
      // liga os tres, que e o que impede a regressao de "liguei dois aqui e o
      // terceiro em outro lugar que ninguem chama".
      final porta = MensagensDePushDeTeste(
        avisoQueAbriuOApp: mensagemDoServidor(tipo: 'lembreteDeDesfecho'),
      );
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      porta.chegouComOAppAberto(mensagemDoServidor(tipo: 'tagEscaneada'));
      porta.tocaram(mensagemDoServidor(tipo: 'possivelCorrespondencia'));
      await Future<void>.delayed(Duration.zero);

      expect(
        <int>[
          ouvinte.recebidosComOAppAberto,
          ouvinte.recebidosPorToque,
          ouvinte.recebidosNoArranque,
        ],
        <int>[1, 1, 1],
        reason:
            'REPROVA: uma unica chamada de `ligar()` nao cobriu os tres '
            'estados. Aberto, segundo plano e fechado sao TRES APIs diferentes '
            'do `firebase_messaging`, e o app que cobre dois funciona no teste '
            'de mesa e nao funciona no bolso de ninguem.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 2 — o tipo que este build nao conhece nao e descartado
  // -----------------------------------------------------------------------
  group('ISCA — versao antiga do app nao descarta o aviso', () {
    test('tipo desconhecido e ENTREGUE, com o texto do servidor', () async {
      final porta = MensagensDePushDeTeste();
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      // O quinto tipo, que este binario nao conhece. Depois de publicar, esta
      // versao continua instalada por semanas.
      porta.chegouComOAppAberto(
        mensagemDoServidor(
          tipo: 'adocaoAprovada',
          titulo: 'Novidade sobre Thor',
          corpo: 'Toque para ver.',
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(
        ouvinte.ultimoAviso,
        isNotNull,
        reason:
            'REPROVA: um tipo que este build nao conhece foi DESCARTADO em '
            'silencio. Versao antiga do app nao desaparece: depois de '
            'publicar, este binario continua chamando a API por semanas, e o '
            'servidor pode passar a mandar um tipo novo. O titulo e o corpo '
            'vem prontos do servidor e nao dependem de o app entender o tipo.',
      );
      expect(
        ouvinte.ultimoAviso?.tipo,
        TipoDeAvisoRecebido.desconhecido,
        reason:
            'REPROVA: o tipo desconhecido nao caiu em `desconhecido`. Se o '
            '`switch` estourasse, o ouvinte morreria e a pessoa pararia de '
            'receber TODOS os avisos, e nao so este.',
      );
      expect(
        ouvinte.ultimoAviso?.titulo,
        'Novidade sobre Thor',
        reason: 'REPROVA: o aviso desconhecido chegou sem o texto do servidor, '
            'e sem texto ele nao tem como ser mostrado.',
      );
    });

    test('mensagem sem `data` nao estoura', () async {
      final porta = MensagensDePushDeTeste();
      final ouvinte = OuvinteDeAvisos(mensagens: porta);
      addTearDown(ouvinte.dispose);
      addTearDown(porta.encerrar);
      await ouvinte.ligar();

      porta.chegouComOAppAberto(
        const RemoteMessage(
          notification: RemoteNotification(title: 'Oi', body: 'Corpo'),
        ),
      );
      await Future<void>.delayed(Duration.zero);

      expect(
        ouvinte.ultimoAviso?.tipo,
        TipoDeAvisoRecebido.desconhecido,
        reason:
            'REPROVA: mensagem sem `data` derrubou a leitura. `daMensagem` e '
            'chamada de dentro de um ouvinte de stream, onde uma excecao nao '
            'tem quem a pegue -- ela derruba o ouvinte e a pessoa para de '
            'receber tudo.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 3 — o destino de cada tipo, e a lacuna declarada
  // -----------------------------------------------------------------------
  group('ISCA — o destino de cada aviso', () {
    test('`alertaDeVizinhanca` com `ref` leva a registrar achado', () {
      expect(
        OuvinteDeAvisos.destinoDe(
          const AvisoRecebido(
            tipo: TipoDeAvisoRecebido.alertaDeVizinhanca,
            referencia: 'st_abc',
          ),
        ),
        DestinoDoAviso.registrarAchado,
        reason:
            'REPROVA: o vizinho que recebeu o alerta e viu o animal nao tem '
            'atalho para dizer "vi este pet". `RascunhoDoAchado.shareToken` '
            'foi escrito exatamente para este caminho, e sem ele o achado '
            'depende do cruzamento por atributos descobrir o caso.',
      );
    });

    test('`alertaDeVizinhanca` SEM `ref` nao leva a formulario em branco', () {
      expect(
        OuvinteDeAvisos.destinoDe(
          const AvisoRecebido(
            tipo: TipoDeAvisoRecebido.alertaDeVizinhanca,
            referencia: '',
          ),
        ),
        DestinoDoAviso.mostrarNoApp,
        reason:
            'REPROVA: sem `ref` nao ha caso a vincular, e a tela de achado sem '
            '`share_token` e um formulario em branco no lugar de um atalho.',
      );
    });

    test('os tres tipos sem tela neste build caem em `mostrarNoApp`, e nao '
        'num destino parecido', () {
      // A LACUNA, cobrada em vez de descrita. `tagEscaneada` e o aviso mais
      // urgente do produto e o destino dele e a conversa com o achador, que
      // nao existe neste app. Mandar o tutor para um lugar PARECIDO e pior que
      // nao mandar: ele chega numa tela que nao diz quem esta com o animal.
      for (final tipo in <TipoDeAvisoRecebido>[
        TipoDeAvisoRecebido.tagEscaneada,
        TipoDeAvisoRecebido.possivelCorrespondencia,
        TipoDeAvisoRecebido.lembreteDeDesfecho,
      ]) {
        expect(
          OuvinteDeAvisos.destinoDe(
            AvisoRecebido(tipo: tipo, referencia: 'st_abc'),
          ),
          DestinoDoAviso.mostrarNoApp,
          reason:
              'REPROVA: `${tipo.name}` ganhou um destino. Se a tela dele '
              'entrou, este caso muda junto -- e se nao entrou, alguem apontou '
              'o aviso para um destino PARECIDO, que e o defeito dos dois '
              '`Ver meus pets` da BICHUS-62.',
        );
      }
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 4 — a faixa mostra o alerta com o app ABERTO
  // -----------------------------------------------------------------------
  group('ISCA — com o app aberto, quem mostra o alerta e o app', () {
    testWidgets('o alerta chega e a faixa aparece na casca, com o texto do '
        'servidor', (tester) async {
      final porta = MensagensDePushDeTeste();
      await abrirOApp(tester, rede: rede, mensagensDePush: porta);
      addTearDown(porta.encerrar);

      expect(
        find.text('Alguém está com Thor'),
        findsNothing,
        reason: 'REPROVA: a faixa aparece antes de chegar aviso nenhum.',
      );

      porta.chegouComOAppAberto(mensagemDoServidor(tipo: 'tagEscaneada'));
      await tester.pumpAndSettle();

      expect(
        find.text('Alguém está com Thor'),
        findsOneWidget,
        reason:
            'REPROVA: o alerta chegou com o app ABERTO e a tela nao mostrou '
            'nada. Em primeiro plano o sistema operacional NAO desenha o '
            'aviso, mesmo com bloco `notification` na mensagem -- entao quem '
            'esta com o app na mao e a unica pessoa que nao ve. E o oposto do '
            'esperado, e e por isso que testar so com o app aberto engana nos '
            'dois sentidos.',
      );
      expect(
        find.text('Uma pessoa escaneou a tag agora. Toque para falar.'),
        findsOneWidget,
        reason:
            'REPROVA: o corpo do aviso nao subiu. O titulo sozinho diz que '
            'algo aconteceu e nao diz o que.',
      );
    });

    testWidgets('a faixa fecha pelo `X`, e nao volta sozinha', (tester) async {
      final porta = MensagensDePushDeTeste();
      await abrirOApp(tester, rede: rede, mensagensDePush: porta);
      addTearDown(porta.encerrar);

      porta.chegouComOAppAberto(mensagemDoServidor(tipo: 'tagEscaneada'));
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Fechar o aviso'));
      await tester.pumpAndSettle();

      expect(
        find.text('Alguém está com Thor'),
        findsNothing,
        reason:
            'REPROVA: a faixa nao fecha. Faixa que nao sai fica em cima do '
            'conteudo para sempre, e a pessoa perde a tela por causa de um '
            'aviso que ela ja leu.',
      );
    });

    testWidgets('o aviso que ABRIU o app aparece na primeira tela', (
      tester,
    ) async {
      // O estado `fechado`, pelo app montado: a mensagem esta la antes de a
      // primeira tela existir. E o caso que prova que `getInitialMessage` e
      // consumido no ARRANQUE, e nao depois de alguem tocar em algo.
      final porta = MensagensDePushDeTeste(
        avisoQueAbriuOApp: mensagemDoServidor(
          tipo: 'tagEscaneada',
          titulo: 'Alguém escaneou a tag de Thor',
          corpo: 'Isso aconteceu agora. Se Thor deveria estar com você, confira.',
        ),
      );
      await abrirOApp(tester, rede: rede, mensagensDePush: porta);
      addTearDown(porta.encerrar);

      expect(
        find.text('Alguém escaneou a tag de Thor'),
        findsOneWidget,
        reason:
            'REPROVA: o toque na notificacao abriu o app e a pessoa caiu numa '
            'tela que nao diz nada sobre o motivo pelo qual ela abriu o app. '
            'E o estado `fechado`, e ele nao aparece em teste de mesa nenhum.',
      );
    });
  });
}
