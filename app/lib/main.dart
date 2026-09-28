import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/avisos_recebidos.dart';
import 'firebase_options.dart';
import 'theme/bichu_theme.dart';

/// Arranque do app.
///
/// A configuracao e lida **antes** de qualquer tela. Faltando `API_BASE_URL`,
/// o app nao sobe degradado em silencio: ele mostra o nome da variavel
/// ausente. Um app apontado para lugar nenhum passa na homologacao como se
/// fosse problema de rede, e o defeito so aparece no aparelho de quem esta
/// homologando (criterio de aceite de BICHUS-13, antiga BICHU-25).
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final AppConfig config;
  try {
    config = AppConfig.carregar();
  } on Object catch (erro) {
    runApp(TelaDeConfiguracaoAusente(mensagem: erro.toString()));
    return;
  }

  // **Uma inicializacao do Firebase, dois consumidores.** `_avisos()` e quem
  // tenta subir o Firebase; ela devolve a porta de PERMISSAO e diz, pelo tipo,
  // se conseguiu. A porta de MENSAGENS segue a mesma resposta: ligar o ouvinte
  // de push sobre um Firebase que nao subiu daria uma stream que nunca emite e
  // um `getInitialMessage()` que nunca resolve.
  final avisos = await _avisos();
  final embarcado = avisos is AvisosPorFirebase;
  runApp(
    BichuApp(
      config: config,
      avisos: avisos,
      mensagensDePush: embarcado
          ? const MensagensDePushPorFirebase()
          : const MensagensDePushNaoEmbarcadas(),
    ),
  );
}

/// Liga o transporte de push, ou diz por que nao ligou.
///
/// **Falhar aqui NAO derruba o app, e essa e a unica falha de arranque deste
/// binario que nao derruba.** A diferenca em relacao a `API_BASE_URL` e de
/// consequencia, e nao de rigor:
///
/// - Sem `API_BASE_URL` o app nao faz nada. Nenhuma tela funciona, e subir
///   assim so faz quem homologa perder tempo achando que e problema de rede.
/// - Sem push o app faz quase tudo. A cunha do produto -- cadastrar o pet,
///   emitir a tag, e o achador abrir `/t/{codigo}` no navegador dele -- nao
///   passa por aqui. E o aviso ao tutor continua coberto: UX 10.1 e o ADR-0008
///   obrigam o e-mail como rede de segurança justamente porque um canal que
///   depende de permissao do sistema operacional nao pode ser o unico.
///
/// Bloquear o cadastro de pet porque o Firebase nao subiu seria trocar a parte
/// que funciona pela parte que falhou.
///
/// O silencio e que nao esta aqui: a causa vai para o log de arranque, e a
/// antessala de C.3 **nunca aparece** neste estado -- o app nao promete um
/// aviso que nao vai chegar.
Future<Avisos> _avisos() async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
    return const AvisosPorFirebase();
  } on Object catch (erro) {
    debugPrint(
      'Push desligado neste arranque: o Firebase nao inicializou ($erro). '
      'O app sobe sem aviso no celular; o e-mail continua sendo a rede de '
      'seguranca do aviso ao tutor (UX 10.1, ADR-0008).',
    );
    return AvisosNaoEmbarcados(motivo: erro.toString());
  }
}

/// A tela que o build mal configurado mostra.
///
/// Ela existe para que a falha seja obvia para quem instalou o build, e nao
/// para quem tem o console aberto. Quem homologa nao olha log.
class TelaDeConfiguracaoAusente extends StatelessWidget {
  const TelaDeConfiguracaoAusente({required this.mensagem, super.key});

  final String mensagem;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bichu',
      debugShowCheckedModeBanner: false,
      theme: BichuTheme.claro,
      // A tela de build incompleto tambem e portugues. Ela e a unica tela que
      // aparece quando a configuracao falta, e quem homologa le ela.
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      supportedLocales: const <Locale>[Locale('pt', 'BR')],
      home: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'Este build está incompleto',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                Text(
                  mensagem,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
