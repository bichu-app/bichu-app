import 'package:flutter/material.dart';

import 'app.dart';
import 'config/app_config.dart';
import 'theme/bichu_theme.dart';

/// Arranque do app.
///
/// A configuracao e lida **antes** de qualquer tela. Faltando `API_BASE_URL`,
/// o app nao sobe degradado em silencio: ele mostra o nome da variavel
/// ausente. Um app apontado para lugar nenhum passa na homologacao como se
/// fosse problema de rede, e o defeito so aparece no aparelho de quem esta
/// homologando (criterio de aceite de BICHUS-13, antiga BICHU-25).
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final AppConfig config;
  try {
    config = AppConfig.carregar();
  } on Object catch (erro) {
    runApp(TelaDeConfiguracaoAusente(mensagem: erro.toString()));
    return;
  }

  runApp(BichuApp(config: config));
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
