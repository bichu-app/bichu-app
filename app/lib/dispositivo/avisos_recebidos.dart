/// O que o app faz quando um push CHEGA.
///
/// ## O buraco que este arquivo existe para tapar
///
/// O servidor dispara o alerta de verdade: consulta de raio de 5 km com
/// PostGIS, teto de 500 destinatarios, FCM HTTP v1 com credencial de conta de
/// servico. E **nada no app escutava**. `firebase_messaging` estava no
/// `pubspec.yaml`, o aparelho era registrado (`DevicesApi.registrar`), o token
/// subia, o servidor mandava -- e a mensagem chegava no aparelho e morria ali.
/// Zero ouvintes.
///
/// O sintoma disso e o pior que existe: nada falha. Nenhuma tela quebra, nenhum
/// log acusa, o servidor registra `aceito` e o painel diz que o alerta saiu. A
/// unica evidencia e uma pessoa que nunca recebe nada.
///
/// ## OS TRES ESTADOS, e por que sao tres caminhos diferentes
///
/// Esta e a parte que se erra por omissao, e omitir um estado e o defeito
/// classico: o app funciona no teste de mesa (aberto) e nao funciona no bolso
/// de ninguem. Cada estado e uma API diferente do `firebase_messaging`, e a
/// divisao nao e arbitraria -- ela segue quem DESENHA a notificacao:
///
/// | estado do app | quem desenha o aviso | o que o app precisa fazer |
/// |---|---|---|
/// | **aberto** (primeiro plano) | **ninguem** | mostrar ele mesmo |
/// | **em segundo plano** | o sistema operacional | atender o TOQUE |
/// | **fechado** (encerrado) | o sistema operacional | atender o toque que ABRIU o processo |
///
/// 1. **App aberto: `FirebaseMessaging.onMessage`.** Com o app em primeiro
///    plano o SDK **nao desenha nada** no Android, mesmo com bloco
///    `notification` na mensagem. Sem este ouvinte o alerta chega e a pessoa
///    que esta com o app na mao e a unica que nao ve -- o oposto do esperado, e
///    e por isso que testar so com o app aberto engana nos dois sentidos.
/// 2. **App em segundo plano: `FirebaseMessaging.onMessageOpenedApp`.** O
///    sistema desenhou o aviso na bandeja; o que falta e o toque levar a algum
///    lugar. Sem este ouvinte a pessoa toca no aviso, o app abre na tela em que
///    estava, e ela nao entende o que aconteceu.
/// 3. **App fechado: `FirebaseMessaging.instance.getInitialMessage()`.** O
///    toque **lancou o processo**, e nesse caso nao ha stream: a mensagem esta
///    guardada e e entregue uma vez, por `Future`, no arranque. Este e o estado
///    mais facil de esquecer, porque os dois streams acima cobrem tudo o que se
///    testa a mao com o app na tela.
///
/// ## O QUARTO ouvinte que NAO entra, e a omissao e declarada
///
/// `FirebaseMessaging.onBackgroundMessage` (o isolate de segundo plano) **nao
/// e registrado**, e a ausencia e decisao medida, nao esquecimento.
///
/// Ele serve para o app **processar** uma mensagem sem a pessoa tocar em nada,
/// e e obrigatorio quando a mensagem e `data-only` -- porque ai o sistema nao
/// desenha aviso nenhum e, sem o isolate, um app encerrado nao mostra nada.
/// Este servidor **nao** manda `data-only`: `fcm-http-v1.ts` monta
/// `notification: { title, body }` **junto** com `data`, e o comentario de la
/// diz por que com essas palavras ("so com `data`, um app encerrado nao mostra
/// nada"). Com o bloco `notification` presente, quem desenha e o sistema
/// operacional, sem o app rodar.
///
/// Registrar o isolate aqui custaria uma funcao de topo com `@pragma('vm:entry-point')`,
/// um segundo `Firebase.initializeApp` num processo sem tela, e trabalho de rede
/// com orcamento restrito pelo sistema -- para fazer o que o sistema ja faz. E
/// o que precisa terminar com o app fechado e trabalho do servidor, nao do
/// aparelho.
///
/// **O dia em que isso muda:** se o servidor passar a mandar mensagem sem bloco
/// `notification`. Ai o isolate deixa de ser custo e passa a ser o unico
/// caminho.
///
/// ## O LIMITE DE AMBIENTE, medido: push NAO funciona em homologacao
///
/// A conta de servico da VM de homologacao **nao tem o papel de envio de
/// notificacao**, e o primeiro envio falha com 403. Isso nao impede escrever
/// nem exercitar este ouvinte -- os tres estados sao testados com a porta
/// dublada, sem canal de plataforma --, mas **nao prova o caminho ponta a
/// ponta**. O que depende daquele papel e a ultima perna: servidor manda, FCM
/// entrega, aparelho acorda.
library;

import 'dart:async';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// O assunto de um aviso, como o servidor o nomeia em `data.tipo`.
///
/// `/// Local:` **este enum nao vem de `api/openapi.yaml`, e nao deve vir.** O
/// payload de push nao e resposta de rota: ele e montado por
/// `src/modules/notifications/domain/conteudo-do-push.ts`, cujo
/// `TipoDeAvisoPush` e a fonte dos quatro valores abaixo. Procurar um ponteiro
/// de contrato para ele acharia nada, porque nao ha schema correspondente --
/// nenhuma operacao do contrato devolve este vocabulario.
///
/// Os quatro estao aqui, e nenhum e omitido: valor que este build nao
/// conhecesse cairia em [desconhecido], e aviso que cai ali **nao e
/// descartado** -- ver o cabecalho daquele valor.
enum TipoDeAvisoRecebido {
  /// `tagEscaneada`. Alguem escaneou a plaquinha. **O aviso mais urgente do
  /// produto**, e mais ainda quando o pet nao estava marcado como perdido: o
  /// tutor ainda nao sabe de nada.
  tagEscaneada('tagEscaneada'),

  /// `possivelCorrespondencia`. Um achado avulso pode ser o pet desta pessoa.
  possivelCorrespondencia('possivelCorrespondencia'),

  /// `alertaDeVizinhanca`. Um pet sumiu no raio de 5 km de quem recebe.
  alertaDeVizinhanca('alertaDeVizinhanca'),

  /// `lembreteDeDesfecho`. "O pet voltou para casa?"
  lembreteDeDesfecho('lembreteDeDesfecho'),

  /// O que este build nao conhece.
  ///
  /// **Existe porque versao antiga nao desaparece.** Depois de publicar, este
  /// binario continua instalado por semanas, e o servidor pode passar a mandar
  /// um quinto tipo. Sem este valor o `switch` estouraria, ou -- pior -- o
  /// aviso seria descartado em silencio e a pessoa nao receberia nada.
  ///
  /// Aviso desconhecido **e mostrado**, com o texto que o servidor mandou: o
  /// titulo e o corpo vem prontos no payload e nao dependem de o app entender
  /// o tipo. O que ele nao faz e navegar, porque nao ha para onde.
  desconhecido('');

  const TipoDeAvisoRecebido(this.valorDoServidor);

  /// A palavra exata que viaja em `data.tipo`.
  final String valorDoServidor;

  /// Traduz o que veio no fio. **Nunca estoura.**
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
///
/// **Sao dois campos de dados, e e tudo o que existe.** O servidor manda
/// `data: { tipo, ref }` e nada mais, por decisao do ADR-0010: notificacao e
/// superficie publica (acende na tela de bloqueio, passa por um terceiro, e
/// fica no historico do sistema), entao nada que identifique pessoa ou linha de
/// banco entra no payload. Nao ha `pet_id`, nao ha `case_id`, e a porteira do
/// servidor **estoura** se alguem tentar por -- procurar esses campos aqui e
/// procurar o que foi proibido de sair.
///
/// [referencia] e o `share_token`, a mesma chave opaca que o link de
/// compartilhamento carrega. E o unico identificador que sai.
@immutable
class AvisoRecebido {
  const AvisoRecebido({
    required this.tipo,
    required this.referencia,
    this.titulo,
    this.corpo,
  });

  final TipoDeAvisoRecebido tipo;

  /// `data.ref`: o `share_token`. Vazio quando o aviso nao trata de nada
  /// enderecavel.
  final String referencia;

  /// `notification.title`, quando a mensagem o trouxe.
  ///
  /// Vem do servidor e **nao e remontado aqui**: o texto e decisao de produto e
  /// tem uma fonte so (`conteudo-do-push.ts`). Um app que reescrevesse a frase
  /// passaria a mostrar duas redacoes diferentes do mesmo aviso, uma na bandeja
  /// do sistema e outra dentro do app.
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
///
/// Porta, e nao chamada direta ao `FirebaseMessaging`, pela mesma razao de
/// `Avisos`, `Localizacao` e `CameraEGaleria`: os tres estados do ciclo de vida
/// **nao se reproduzem em teste de widget**. Nao ha como pedir ao Flutter que
/// mate o processo e o reabra por um toque em notificacao, e nao ha canal de
/// plataforma ligado. Sem a porta, o unico jeito de exercitar o estado
/// `fechado` seria num aparelho, a mao, uma vez -- e depois nunca mais.
abstract class MensagensDePush {
  /// Chega com o app **aberto**. O sistema nao desenha nada; quem mostra e o
  /// app.
  Stream<RemoteMessage> get comOAppAberto;

  /// A pessoa **tocou** no aviso que o sistema desenhou, com o app em segundo
  /// plano.
  Stream<RemoteMessage> get aoTocarNoAviso;

  /// O aviso que **abriu o app** a partir de encerrado, se houve um.
  ///
  /// `Future`, e nao stream: a entrega e unica. Chamar duas vezes devolve a
  /// mesma mensagem no `firebase_messaging`, e por isso [OuvinteDeAvisos]
  /// consome uma vez so.
  Future<RemoteMessage?> oAvisoQueAbriuOApp();
}

/// A implementacao de verdade.
///
/// **So transporte**, igual a `AvisosPorFirebase`: nenhum outro produto do
/// Firebase entra por aqui (ADR-0008). Exige `Firebase.initializeApp` antes, e
/// quem monta isto e o `main()` -- que cai em [MensagensDePushNaoEmbarcadas]
/// quando a inicializacao falha.
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
///
/// **Streams vazias, e nao streams que nunca fecham.** `Stream.empty()` fecha
/// na hora; um `StreamController` sem `close` deixaria o `pumpAndSettle`
/// esperando para sempre, que e o modo de falha que nao aponta para a causa.
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
}

/// Liga os tres estados a um lugar so, e avisa quem escuta.
///
/// ## Por que [ChangeNotifier], e nao navegacao daqui de dentro
///
/// O ouvinte e construido no `initState` do app, **antes** de existir arvore de
/// widget e antes de o roteador ter contexto. Navegar daqui exigiria guardar um
/// `BuildContext` ou uma chave global de navegador e usa-la de dentro de um
/// ouvinte de stream -- que e como se produz `Looking up a deactivated widget's
/// ancestor`. Quem tem contexto e a casca; ela escuta e decide.
///
/// ## O aviso mais recente fica em pe, e nao vira e volta
///
/// [ultimoAviso] **nao e limpo automaticamente**. Quem consome chama
/// [reconhecer] quando ja mostrou. Um campo que se limpasse sozinho por
/// temporizador perderia o aviso da pessoa que estava com o telefone no bolso
/// no instante exato -- e este e o aviso que o produto existe para entregar.
class OuvinteDeAvisos extends ChangeNotifier {
  OuvinteDeAvisos({required this.mensagens});

  final MensagensDePush mensagens;

  final List<StreamSubscription<RemoteMessage>> _inscricoes =
      <StreamSubscription<RemoteMessage>>[];

  AvisoRecebido? _ultimoAviso;

  /// O aviso que ainda nao foi reconhecido por quem mostra.
  AvisoRecebido? get ultimoAviso => _ultimoAviso;

  /// Quantos avisos passaram por aqui, **por estado**.
  ///
  /// Publico porque e o unico jeito de um caso provar que os TRES caminhos
  /// estao ligados, e nao so o que e facil de exercitar a mao. Um ouvinte que
  /// cobrisse dois estados e nao o terceiro produziria um contador parado, e
  /// contador parado e evidencia; ausencia de defeito na tela nao e.
  int recebidosComOAppAberto = 0;
  int recebidosPorToque = 0;
  int recebidosNoArranque = 0;

  /// Liga os tres caminhos.
  ///
  /// **`await` no terceiro, e nao `unawaited`**: `getInitialMessage()` e a
  /// pergunta "o toque numa notificacao abriu este processo?", e ela tem de ser
  /// respondida antes de a primeira tela decidir o que mostrar. Dispara-la sem
  /// esperar faria o app abrir na home e pular para o destino do aviso um
  /// instante depois, que e um salto que a pessoa le como defeito.
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

    // O ESTADO `fechado`. Sem esta chamada, o toque que lanca o processo nao
    // chega a ouvinte nenhum: os dois streams acima so entregam o que acontece
    // DEPOIS de o app estar de pe.
    final RemoteMessage? queAbriu;
    try {
      queAbriu = await mensagens.oAvisoQueAbriuOApp();
    } on Object {
      // Sem canal de plataforma, ou plugin que nao responde. Nao ha o que
      // concluir, e derrubar o arranque do app por causa disso trocaria um
      // aviso perdido por um app que nao abre.
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

  /// Quem mostrou o aviso chama isto. Sem argumento de aviso de proposito: o
  /// que se reconhece e o que esta em pe.
  void reconhecer() {
    if (_ultimoAviso == null) return;
    _ultimoAviso = null;
    notifyListeners();
  }

  /// Para onde o toque leva, por tipo de aviso.
  ///
  /// ## A LACUNA, dita por extenso em vez de descoberta depois
  ///
  /// **So um dos quatro tipos tem tela neste build**, e a razao nao e
  /// preguica: as outras tres nao existem no app ainda.
  ///
  /// - `alertaDeVizinhanca` → [DestinoDoAviso.registrarAchado]. Esta e a tela
  ///   que existe (`F3.5`), e `RascunhoDoAchado.shareToken` foi escrito
  ///   exatamente para este caminho: o comentario dele diz "so existe para quem
  ///   chegou pelo push de um caso especifico". O vizinho que recebeu o alerta
  ///   e viu o animal diz "vi este pet", e o achado e vinculado **direto**
  ///   aquele caso, sem depender do cruzamento por atributos.
  /// - `tagEscaneada` → [DestinoDoAviso.mostrarNoApp]. O destino dele e a
  ///   **conversa com o achador**, que nao existe neste app. Mandar o tutor
  ///   para um lugar parecido seria pior que nao mandar: ele chegaria numa tela
  ///   que nao diz quem esta com o animal dele.
  /// - `possivelCorrespondencia` → [DestinoDoAviso.mostrarNoApp]. Precisa da
  ///   tela de confirmar candidato, que nao existe.
  /// - `lembreteDeDesfecho` → [DestinoDoAviso.mostrarNoApp]. Precisa da acao de
  ///   encerrar o caso a partir do aviso, que nao existe.
  ///
  /// `mostrarNoApp` **nao e um buraco silencioso**: a pessoa ve o aviso, com o
  /// texto que o servidor mandou, dentro do app. O que ela nao tem e um atalho
  /// para a tela certa. Quando cada tela entrar, ela entra aqui junto -- e este
  /// e o lugar onde se olha para saber quais faltam.
  static DestinoDoAviso destinoDe(AvisoRecebido aviso) {
    return switch (aviso.tipo) {
      // Sem `ref` nao ha caso a vincular, e a tela de achado sem `share_token`
      // seria um formulario em branco no lugar de um atalho.
      TipoDeAvisoRecebido.alertaDeVizinhanca => aviso.referencia.isEmpty
          ? DestinoDoAviso.mostrarNoApp
          : DestinoDoAviso.registrarAchado,
      TipoDeAvisoRecebido.tagEscaneada ||
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
