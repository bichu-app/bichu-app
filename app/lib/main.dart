import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:path_provider/path_provider.dart';

import 'api/cache_de_imagens.dart';
import 'app.dart';
import 'config/app_config.dart';
import 'dispositivo/avisos.dart';
import 'dispositivo/avisos_recebidos.dart';
import 'firebase_options.dart';
import 'theme/bichu_theme.dart';

/// Arranque do app.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await arrancar(
    desenhar: runApp,
    inicializarPush: () => Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    ),
  );
}

/// O TETO DA ESPERA DO PUSH NO ARRANQUE.
const Duration tetoDoArranqueDoPush = Duration(seconds: 5);

/// A sequencia do arranque, **sem nenhuma espera sem teto antes do primeiro
/// quadro**.
@visibleForTesting
Future<void> arrancar({
  required void Function(Widget tela) desenhar,
  required Future<void> Function() inicializarPush,
  AppConfig Function() carregarConfig = AppConfig.carregar,
  Duration teto = tetoDoArranqueDoPush,
}) async {
  final AppConfig config;
  try {
    config = carregarConfig();
  } on Object catch (erro) {
    desenhar(TelaDeConfiguracaoAusente(mensagem: erro.toString()));
    return;
  }

  final avisos = await _avisos(inicializarPush, teto);
  final embarcado = avisos is AvisosPorFirebase;
  desenhar(
    BichuApp(
      config: config,
      avisos: avisos,
      mensagensDePush: embarcado
          ? const MensagensDePushPorFirebase()
          : const MensagensDePushNaoEmbarcadas(),
      cacheDeImagens: CacheDeImagensNoAparelho(
        pasta: getApplicationCacheDirectory,
      ),
    ),
  );
}

/// Liga o transporte de push, ou diz por que nao ligou.
Future<Avisos> _avisos(
  Future<void> Function() inicializar,
  Duration teto,
) async {
  try {
    await inicializar().timeout(teto);
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
class TelaDeConfiguracaoAusente extends StatelessWidget {
  const TelaDeConfiguracaoAusente({required this.mensagem, super.key});

  final String mensagem;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Bichu',
      debugShowCheckedModeBanner: false,
      theme: BichuTheme.claro,
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
