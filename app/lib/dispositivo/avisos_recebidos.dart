/// O que o app faz quando um push CHEGA.
library;

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// O assunto de um aviso, como o servidor o nomeia em `data.tipo`.
enum TipoDeAvisoRecebido {
  /// `tagEscaneada`. Alguem escaneou a plaquinha.
  tagEscaneada('tagEscaneada'),

  /// `possivelCorrespondencia`.
  possivelCorrespondencia('possivelCorrespondencia'),

  /// `alertaDeVizinhanca`. Um pet sumiu no raio de 5 km de quem recebe.
  alertaDeVizinhanca('alertaDeVizinhanca'),

  /// `lembreteDeDesfecho`. "O pet voltou para casa?"
  lembreteDeDesfecho('lembreteDeDesfecho'),

  /// O que este build nao conhece.
  desconhecido('');

  const TipoDeAvisoRecebido(this.valorDoServidor);

  /// A palavra exata que viaja em `data.tipo`.
  final String valorDoServidor;

  /// Traduz o que veio no fio.
  static TipoDeAvisoRecebido de(String? valor) {
    if (valor == null || valor.isEmpty) return TipoDeAvisoRecebido.desconhecido;
    for (final tipo in TipoDeAvisoRecebido.values) {
      if (tipo != TipoDeAvisoRecebido.desconhecido &&
          tipo.valorDoServidor == valor) {
        return tipo;
      }
    }
    return TipoDeAvisoRecebido.desconhecido;
  }
}

/// Um aviso que chegou, reduzido ao que o payload de fato carrega.
@immutable
class AvisoRecebido {
  const AvisoRecebido({
    required this.tipo,
    required this.referencia,
    this.titulo,
    this.corpo,
  });

  final TipoDeAvisoRecebido tipo;

  /// `data.ref`: o `share_token`.
  final String referencia;

  /// `notification.title`, quando a mensagem o trouxe.
  final String? titulo;

  /// `notification.body`, quando a mensagem o trouxe.
  final String? corpo;

  /// Le uma mensagem do FCM. **Nunca estoura**, e isso e requisito: ela e
  /// chamada de dentro de um ouvinte de stream, onde uma excecao nao tem quem a
  /// pegue e derruba o isolate.
  static AvisoRecebido daMensagem(RemoteMessage mensagem) {
    final dados = mensagem.data;
    return AvisoRecebido(
      tipo: TipoDeAvisoRecebido.de(dados['tipo'] as String?),
      referencia: (dados['ref'] as String?) ?? '',
      titulo: mensagem.notification?.title,
      corpo: mensagem.notification?.body,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is AvisoRecebido &&
      other.tipo == tipo &&
      other.referencia == referencia &&
      other.titulo == titulo &&
      other.corpo == corpo;

  @override
  int get hashCode => Object.hash(tipo, referencia, titulo, corpo);

  @override
  String toString() =>
      'AvisoRecebido(${tipo.name}, ref: ${referencia.isEmpty ? '-' : 'presente'})';
}

/// De onde as mensagens vem, nos tres estados.
abstract class MensagensDePush {
  /// Chega com o app **aberto**.
  Stream<RemoteMessage> get comOAppAberto;

  /// A pessoa **tocou** no aviso que o sistema desenhou, com o app em segundo
  /// plano.
  Stream<RemoteMessage> get aoTocarNoAviso;

  /// O aviso que **abriu o app** a partir de encerrado, se houve um.
  Future<RemoteMessage?> oAvisoQueAbriuOApp();
}

/// A implementacao de verdade.
class MensagensDePushPorFirebase implements MensagensDePush {
  const MensagensDePushPorFirebase();

  @override
  Stream<RemoteMessage> get comOAppAberto => FirebaseMessaging.onMessage;

  @override
  Stream<RemoteMessage> get aoTocarNoAviso =>
      FirebaseMessaging.onMessageOpenedApp;

  @override
  Future<RemoteMessage?> oAvisoQueAbriuOApp() =>
      FirebaseMessaging.instance.getInitialMessage();
}

/// O padrao onde nao ha canal de plataforma: teste de widget, e desktop.
class MensagensDePushNaoEmbarcadas implements MensagensDePush {
  const MensagensDePushNaoEmbarcadas();

  @override
  Stream<RemoteMessage> get comOAppAberto => const Stream<RemoteMessage>.empty();

  @override
  Stream<RemoteMessage> get aoTocarNoAviso =>
      const Stream<RemoteMessage>.empty();

  @override
  Future<RemoteMessage?> oAvisoQueAbriuOApp() async => null;
}

/// O que fazer com um aviso: mostrar dentro do app, ou levar a pessoa a algum
/// lugar.
enum DestinoDoAviso {
  /// Mostrar o aviso dentro do app, sem sair de onde a pessoa esta.
  mostrarNoApp,

  /// Levar a pessoa a tela de registrar um achado, com o caso ja vinculado.
  registrarAchado,

  /// Levar o TUTOR a **area de mensagens**, na LISTA e nao numa conversa.
  areaDeMensagens,
}

/// Liga os tres estados a um lugar so, e avisa quem escuta.
class OuvinteDeAvisos extends ChangeNotifier {
  OuvinteDeAvisos({required this.mensagens});

  final MensagensDePush mensagens;

  final List<StreamSubscription<RemoteMessage>> _inscricoes =
      <StreamSubscription<RemoteMessage>>[];

  AvisoRecebido? _ultimoAviso;

  /// O aviso que ainda nao foi reconhecido por quem mostra.
  AvisoRecebido? get ultimoAviso => _ultimoAviso;

  /// Quantos avisos passaram por aqui, **por estado**.
  int recebidosComOAppAberto = 0;
  int recebidosPorToque = 0;
  int recebidosNoArranque = 0;

  /// Liga os tres caminhos.
  Future<void> ligar() async {
    _inscricoes.add(
      mensagens.comOAppAberto.listen((mensagem) {
        recebidosComOAppAberto += 1;
        _entregar(AvisoRecebido.daMensagem(mensagem));
      }),
    );
    _inscricoes.add(
      mensagens.aoTocarNoAviso.listen((mensagem) {
        recebidosPorToque += 1;
        _entregar(AvisoRecebido.daMensagem(mensagem));
      }),
    );

    final RemoteMessage? queAbriu;
    try {
      queAbriu = await mensagens.oAvisoQueAbriuOApp();
    } on Object {
      return;
    }
    if (queAbriu == null) return;
    recebidosNoArranque += 1;
    _entregar(AvisoRecebido.daMensagem(queAbriu));
  }

  void _entregar(AvisoRecebido aviso) {
    _ultimoAviso = aviso;
    notifyListeners();
  }

  /// Quem mostrou o aviso chama isto.
  void reconhecer() {
    if (_ultimoAviso == null) return;
    _ultimoAviso = null;
    notifyListeners();
  }

  /// Para onde o toque leva, por tipo de aviso.
  static DestinoDoAviso destinoDe(AvisoRecebido aviso) {
    return switch (aviso.tipo) {
      TipoDeAvisoRecebido.alertaDeVizinhanca => aviso.referencia.isEmpty
          ? DestinoDoAviso.mostrarNoApp
          : DestinoDoAviso.registrarAchado,
      TipoDeAvisoRecebido.tagEscaneada => DestinoDoAviso.areaDeMensagens,
      TipoDeAvisoRecebido.possivelCorrespondencia ||
      TipoDeAvisoRecebido.lembreteDeDesfecho ||
      TipoDeAvisoRecebido.desconhecido => DestinoDoAviso.mostrarNoApp,
    };
  }

  @override
  void dispose() {
    for (final inscricao in _inscricoes) {
      inscricao.cancel();
    }
    _inscricoes.clear();
    super.dispose();
  }
}
