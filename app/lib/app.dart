import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'api/api_client.dart';
import 'api/auth_api.dart';
import 'config/app_config.dart';
import 'escopo.dart';
import 'roteamento/rotas.dart';
import 'sessao/controlador_de_sessao.dart';
import 'sessao/deposito_de_sessao.dart';
import 'theme/bichu_theme.dart';

/// A raiz do app.
class BichuApp extends StatefulWidget {
  const BichuApp({
    required this.config,
    super.key,
    this.deposito,
    this.clienteHttp,
  });

  final AppConfig config;

  /// Injetavel para teste. Em producao e o chaveiro do sistema.
  final DepositoDeSessao? deposito;

  /// Injetavel para teste. Em producao e o cliente HTTP do proprio pacote.
  ///
  /// Existe para que o teste de widget exercite o caminho inteiro: tela,
  /// `AuthApi`, `ApiClient` e a traducao de `Problem`. Um teste que so chama a
  /// funcao de mensagem nao pega o defeito de a tela **parar de usa-la**, e e
  /// esse defeito que volta calado numa refatoracao.
  final http.Client? clienteHttp;

  @override
  State<BichuApp> createState() => _BichuAppState();
}

class _BichuAppState extends State<BichuApp> {
  late final ApiClient _api;
  late final AuthApi _auth;
  late final ControladorDeSessao _sessao;
  late final GoRouter _roteador;

  @override
  void initState() {
    super.initState();
    // O cliente pergunta o token ao controlador a cada chamada, em vez de
    // receber uma copia: assim a renovacao chega a requisicao seguinte sem
    // ninguem precisar reconstruir o cliente.
    _api = ApiClient(
      config: widget.config,
      cliente: widget.clienteHttp,
      tokenDeAcesso: () => _sessao.tokenValido(),
    );
    _auth = AuthApi(_api);
    _sessao = ControladorDeSessao(
      auth: _auth,
      deposito: widget.deposito ?? DepositoNoChaveiro(),
    );
    _roteador = criarRoteador(_sessao);
    _sessao.iniciar();
  }

  @override
  void dispose() {
    _sessao.dispose();
    _api.fechar();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Escopo(
      api: _api,
      auth: _auth,
      sessao: _sessao,
      child: MaterialApp.router(
        title: 'Bichu',
        debugShowCheckedModeBanner: false,
        theme: BichuTheme.claro,
        darkTheme: BichuTheme.escuro,
        // A preferencia de tema e do sistema. A tela do achador e a pagina do
        // QR respeitam essa preferencia, com o ajuste de borda da secao 6.6.
        themeMode: ThemeMode.system,
        // O app e escrito em portugues do Brasil e nao oferece troca de
        // idioma. Sem estes dois campos o Flutter cai no ingles para o que ELE
        // desenha: o tooltip de voltar, o menu de colar do campo de texto e os
        // rotulos que o VoiceOver e o TalkBack leem em Scaffold e Dialog. A
        // tela ficava bilingue e so quem usa leitor de tela percebia.
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        supportedLocales: const <Locale>[Locale('pt', 'BR')],
        routerConfig: _roteador,
        builder: (context, filho) {
          // Escala de fonte do sistema respeitada ate 200% (SC 1.4.4). O teto
          // existe porque acima disso nenhum layout de celular sobrevive; ele
          // nao e uma trava de estilo, e o limite que a norma pede.
          final escala = MediaQuery.textScalerOf(context).clamp(
            minScaleFactor: 1,
            maxScaleFactor: 2,
          );
          return MediaQuery(
            data: MediaQuery.of(context).copyWith(textScaler: escala),
            child: filho ?? const SizedBox.shrink(),
          );
        },
      ),
    );
  }
}
