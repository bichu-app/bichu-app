/// A fronteira entre o app e o servico de notificacao do aparelho.
///
/// **Por que uma porta, e nao uma chamada direta ao plugin.** Pelo mesmo
/// motivo de `camera_e_galeria.dart`: permissao e dialogo, e nao configuracao.
/// A diferenca e que aqui o estado que mais importa e outro, e por isso esta
/// porta **nao reaproveita** o `EstadoDaPermissao` da camera:
///
/// - A camera precisa distinguir "negou desta vez" de "negou para sempre",
///   porque as duas levam a telas diferentes e o pedido acontece no toque.
/// - O aviso precisa distinguir **"ainda nao perguntamos"** de todo o resto,
///   porque o dialogo do sistema no iOS e pedido **uma unica vez** e a
///   antessala (UX 10) so existe para nao gastar essa chance sem contexto.
///   Depois que a pessoa respondeu, a antessala nao aparece mais, e o caminho
///   de volta e os ajustes do sistema -- nunca um segundo dialogo.
///
/// Dois enums com quatro valores cada seriam duplicacao; estes dois enums
/// descrevem maquinas de estado diferentes, e junta-las obrigaria cada tela a
/// tratar um valor que nao existe no caso dela.
///
/// A porta tambem e o que permite o teste de widget exercitar os quatro
/// estados sem aparelho. Notificacao nao se verifica em simulador; o que se
/// verifica aqui e que **a tela reage certo aos quatro**.
library;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// Onde a permissao de aviso esta, do ponto de vista de quem decide se pergunta.
enum PermissaoDeAviso {
  /// O dialogo do sistema **ainda nao foi mostrado**. E o unico estado em que
  /// a antessala de UX 10.1 faz sentido: a chance unica continua guardada.
  naoPedida,

  /// A pessoa autorizou. Ha token, e ele vai para o servidor.
  concedida,

  /// A pessoa recusou no dialogo do sistema.
  ///
  /// **Recusa temporaria e permanente caem as duas aqui, e isso e escolha.** O
  /// plugin distingue as duas (`denied` e `deniedPermanently`), entao a
  /// informacao existe e esta sendo deliberadamente descartada -- vale
  /// escrever, para nao parecer que ela nao existia.
  ///
  /// Hoje nenhuma tela decide nada com essa diferenca: em F1.6 as duas fazem a
  /// mesma coisa, que e nao mostrar a antessala. UX 10.1 fecha o assunto com
  /// "duas oportunidades, nunca uma terceira dentro do mesmo fluxo" e "nenhum
  /// dialogo repetido".
  ///
  /// **Quando a diferenca passa a importar:** na segunda oportunidade, F3.2.
  /// Ali o botao `Ligar o aviso` precisa abrir o dialogo do sistema para quem
  /// recusou uma vez, e os AJUSTES para quem recusou em definitivo -- porque
  /// para essa pessoa o dialogo nao abre mais, e o botao ficaria sem efeito
  /// nenhum. Quem escrever F3.2 desdobra este valor em dois; ate la, um estado
  /// que ninguem le e um estado que fica errado sem ninguem notar.
  negada,

  /// Este build ou esta plataforma nao tem push.
  ///
  /// Nao e recusa: e ausencia. Acontece quando o Firebase nao inicializou
  /// (build sem configuracao) e em qualquer plataforma que nao seja Android ou
  /// iOS. Tratar isto como recusa mandaria a pessoa para os ajustes procurar
  /// uma permissao que nao existe.
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
  ///
  /// So deve ser chamado depois da antessala, e so quando [estado] responde
  /// [PermissaoDeAviso.naoPedida]. Chamar com a permissao ja respondida nao
  /// abre dialogo nenhum e devolve o estado que ja existia.
  Future<PermissaoDeAviso> pedir();

  /// O token de registro do aparelho, ou nulo quando nao ha.
  ///
  /// Nulo e estado normal: sem permissao concedida nao ha token, e o aparelho
  /// e registrado no servidor assim mesmo (ADR-0008) -- e esse registro que
  /// permite contar quantos tutores sao de fato alcancaveis.
  Future<String?> token();
}

/// A implementacao de verdade: FCM pelo `firebase_messaging`.
///
/// **So transporte de mensagem.** Nada de Firebase Auth, Analytics, Firestore
/// ou Crashlytics: identidade e nossa (ADR-0002) e observabilidade e Sentry. A
/// fronteira esta escrita no ADR-0008 porque o SDK puxa os outros produtos com
/// facilidade, e ela some sem ninguem decidir.
///
/// Exige `Firebase.initializeApp` antes. Quem monta isto e o `main()`, e ele
/// cai em [AvisosNaoEmbarcados] se a inicializacao falhar.
class AvisosPorFirebase implements Avisos {
  const AvisosPorFirebase();

  @override
  PlataformaDeAviso? get plataforma {
    // `defaultTargetPlatform`, e nao `dart:io`: ele e sobrescrevivel em teste e
    // nao quebra em plataforma sem `Platform`.
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
      // Os quatro que o produto NAO usa ficam desligados de proposito.
      // `provisional` entregaria aviso silencioso sem perguntar, o que parece
      // generoso e e o contrario do que UX 10 desenhou: a antessala existe
      // justamente para a pessoa escolher com contexto. `carPlay`, `criticalAlert`
      // e `announcement` nao tem uso neste produto, e `criticalAlert` ainda
      // exige autorizacao especial da Apple.
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

  static PermissaoDeAviso _traduzir(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
      // `provisional` chega como concedida porque, do ponto de vista do envio,
      // ela e: ha token e a mensagem e entregue. Este app nao pede provisoria,
      // entao este ramo so acontece se o estado vier de fora.
      case AuthorizationStatus.provisional:
        return PermissaoDeAviso.concedida;
      case AuthorizationStatus.denied:
      // Ver o comentario de `PermissaoDeAviso.negada`: a distincao existe no
      // plugin e e descartada aqui de proposito, ate F3.2 ter um leitor.
      case AuthorizationStatus.deniedPermanently:
        return PermissaoDeAviso.negada;
      case AuthorizationStatus.notDetermined:
        return PermissaoDeAviso.naoPedida;
    }
  }
}

/// A implementacao para quando o push **nao existe neste processo**.
///
/// Ela nao finge. Todo metodo responde ausencia, a antessala nunca aparece e o
/// aparelho nao e registrado -- que e o certo: registrar um aparelho sem
/// plataforma sujaria a contagem de alcance, que e a metrica que decide se o
/// alerta toca em alguem.
///
/// Usada em teste de widget (nenhum canal de plataforma esta ligado ali) e no
/// app quando `Firebase.initializeApp` falha. [motivo] carrega a causa para o
/// log de arranque, e nao e mostrado a ninguem.
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
}
