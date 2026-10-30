/// A fronteira entre o app e o servico de notificacao do aparelho.
library;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

/// Onde a permissao de aviso esta, do ponto de vista de quem decide se
/// pergunta.
enum PermissaoDeAviso {
  /// O dialogo do sistema **ainda nao foi mostrado**.
  naoPedida,

  /// A pessoa autorizou. Ha token, e ele vai para o servidor.
  concedida,

  /// A pessoa recusou no dialogo do sistema.
  negada,

  /// Este build ou esta plataforma nao tem push.
  indisponivel,
}

/// As duas plataformas que o contrato conhece (`DeviceRegistration.platform`).
enum PlataformaDeAviso { android, ios }

/// O acesso ao servico de notificacao do aparelho.
abstract class Avisos {
  /// A plataforma, ou nulo quando nao e nenhuma das duas do contrato.
  PlataformaDeAviso? get plataforma;

  /// O estado atual, **sem** abrir dialogo.
  Future<PermissaoDeAviso> estado();

  /// Pede a permissao, abrindo o dialogo do sistema.
  Future<PermissaoDeAviso> pedir();

  /// O token de registro do aparelho, ou nulo quando nao ha.
  Future<String?> token();

  /// Abre os ajustes do sistema (BICHUS-24).
  Future<void> abrirAjustesDoSistema();
}

/// A implementacao de verdade: FCM pelo `firebase_messaging`.
class AvisosPorFirebase implements Avisos {
  const AvisosPorFirebase();

  @override
  PlataformaDeAviso? get plataforma {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return PlataformaDeAviso.android;
      case TargetPlatform.iOS:
        return PlataformaDeAviso.ios;
      case TargetPlatform.fuchsia:
      case TargetPlatform.linux:
      case TargetPlatform.macOS:
      case TargetPlatform.windows:
        return null;
    }
  }

  @override
  Future<PermissaoDeAviso> estado() async {
    if (plataforma == null) return PermissaoDeAviso.indisponivel;
    final ajustes = await FirebaseMessaging.instance.getNotificationSettings();
    return _traduzir(ajustes.authorizationStatus);
  }

  @override
  Future<PermissaoDeAviso> pedir() async {
    if (plataforma == null) return PermissaoDeAviso.indisponivel;
    final ajustes = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
      carPlay: false,
      criticalAlert: false,
      announcement: false,
    );
    return _traduzir(ajustes.authorizationStatus);
  }

  @override
  Future<String?> token() async {
    if (plataforma == null) return null;
    return FirebaseMessaging.instance.getToken();
  }

  @override
  Future<void> abrirAjustesDoSistema() async {
    if (plataforma == null) return;
    await openAppSettings();
  }

  static PermissaoDeAviso _traduzir(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
      case AuthorizationStatus.provisional:
        return PermissaoDeAviso.concedida;
      case AuthorizationStatus.denied:
      case AuthorizationStatus.deniedPermanently:
        return PermissaoDeAviso.negada;
      case AuthorizationStatus.notDetermined:
        return PermissaoDeAviso.naoPedida;
    }
  }
}

/// A implementacao para quando o push **nao existe neste processo**.
class AvisosNaoEmbarcados implements Avisos {
  const AvisosNaoEmbarcados({this.motivo = 'push nao embarcado neste processo'});

  final String motivo;

  @override
  PlataformaDeAviso? get plataforma => null;

  @override
  Future<PermissaoDeAviso> estado() async => PermissaoDeAviso.indisponivel;

  @override
  Future<PermissaoDeAviso> pedir() async => PermissaoDeAviso.indisponivel;

  @override
  Future<String?> token() async => null;

  /// **Nao abre nada, e isso e a resposta certa.** Sem push neste processo nao
  /// ha permissao de notificacao a conceder; mandar a pessoa aos ajustes a
  /// faria procurar uma chave que nao esta la.
  @override
  Future<void> abrirAjustesDoSistema() async {}
}
