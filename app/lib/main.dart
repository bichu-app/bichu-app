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
///
/// A configuracao e lida **antes** de qualquer tela. Faltando `API_BASE_URL`,
/// o app nao sobe degradado em silencio: ele mostra o nome da variavel
/// ausente. Um app apontado para lugar nenhum passa na homologacao como se
/// fosse problema de rede, e o defeito so aparece no aparelho de quem esta
/// homologando (criterio de aceite de BICHUS-13, antiga BICHU-25).
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
///
/// **Ele existe porque `try/catch` nao pega travamento.** O `catch` de
/// [_avisos] sempre cobriu a inicializacao que FALHA; ele nunca cobriu a que
/// nunca responde, porque um `Future` que nao completa tambem nao lanca. Sem
/// teto, esse caso parava o `runApp` -- e o que a pessoa via era o
/// `LaunchScreen.storyboard` do iOS (fundo bordo, o bichinho em creme, **sem
/// indicador nenhum**) para sempre. Medido em 20/10/2026 no iPhone do cliente:
/// "esta completamente parada".
///
/// **Por que 5 segundos.** `Firebase.initializeApp` foi cronometrada com
/// `Stopwatch` no emulador Android (API 37), mesmo commit: 271/241/660 ms com
/// rede, e 226/230 ms em modo aviao -- e em modo aviao ela **sucede**, porque
/// a falta de rede resolve na hora e localmente. O teto e ~8x o pior caso
/// observado: generoso para arranque frio, curto o bastante para nao parecer
/// app morto.
///
/// **O caso ruim nao e "sem rede".** E rede que aceita a conexao e nao
/// responde -- TLS pendurado, DNS lento, portal de captura. Numa instalacao
/// NOVA a inicializacao faz registro de primeira execucao (Firebase
/// Installations, obter o FID), que e ida a rede; numa instalacao que ja tem
/// FID em cache ela volta na hora. E por isso que o mesmo codigo abria num
/// build anterior e parou neste: nao houve mudanca no arranque entre
/// `fb3a0fba` e `1ff67840` (os tres arquivos deste caminho estao identicos) --
/// mudou o estado da instalacao.
const Duration tetoDoArranqueDoPush = Duration(seconds: 5);

/// A sequencia do arranque, **sem nenhuma espera sem teto antes do primeiro
/// quadro**.
///
/// Esta funcao existe separada de [main] por uma razao so: para o caso de
/// teste poder passar um push que **nunca** responde. Um duble que ATRASA nao
/// serve de isca -- ele passa mesmo com o `await` cru de volta, porque
/// eventualmente completa. O duble que prova o mecanismo e o que nunca
/// completa, e ele so e injetavel por aqui.
///
/// [desenhar] e `runApp` em producao. [carregarConfig] e [AppConfig.carregar];
/// ele entra por parametro porque `String.fromEnvironment` nao existe em
/// teste, e um arranque que caisse em [TelaDeConfiguracaoAusente] no teste
/// mediria outra coisa.
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

  // **Uma inicializacao do Firebase, dois consumidores.** `_avisos()` e quem
  // tenta subir o Firebase; ela devolve a porta de PERMISSAO e diz, pelo tipo,
  // se conseguiu. A porta de MENSAGENS segue a mesma resposta: ligar o ouvinte
  // de push sobre um Firebase que nao subiu daria uma stream que nunca emite e
  // um `getInitialMessage()` que nunca resolve.
  //
  // **A espera agora tem teto** (ver [tetoDoArranqueDoPush]). Ela continua
  // sendo a unica coisa que acontece antes de desenhar, e por isso o que ela
  // custa entra inteiro no tempo ate o primeiro quadro -- mas agora esse custo
  // e limitado, e estourar o limite tem desfecho declarado em vez de parar o
  // app.
  final avisos = await _avisos(inicializarPush, teto);
  final embarcado = avisos is AvisosPorFirebase;
  desenhar(
    BichuApp(
      config: config,
      avisos: avisos,
      mensagensDePush: embarcado
          ? const MensagensDePushPorFirebase()
          : const MensagensDePushNaoEmbarcadas(),
      // O CACHE DE IMAGEM EM DISCO (BICHUS-296, cliente 26/10/2026).
      //
      // **Construido AQUI e nao dentro do `BichuApp`**, e nao e organizacao: a
      // pasta sai de `getApplicationCacheDirectory()`, um canal de plataforma
      // que trava o `pumpAndSettle` para sempre, sem mensagem, em teste de
      // widget. Este arquivo e o unico que nunca roda sob `flutter_test`.
      //
      // `getApplicationCacheDirectory` e nao `getApplicationDocumentsDirectory`:
      // o que esta aqui e descartavel por definicao, e nos dois sistemas esta e
      // a pasta que o sistema operacional pode limpar sozinho sob pressao de
      // espaco -- `Library/Caches` no iOS, `getCacheDir()` no Android. Nenhum
      // dado do usuario vive neste caminho: o original de toda imagem continua
      // inteiro no armazenamento do servidor.
      //
      // A funcao e passada e nao o resultado: a resolucao acontece na primeira
      // imagem, e nao no arranque, para nao somar um canal de plataforma ao
      // caminho critico da abertura.
      cacheDeImagens: CacheDeImagensNoAparelho(
        pasta: getApplicationCacheDirectory,
      ),
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
/// **E NAO ESPERAR PARA SEMPRE E A MESMA REGRA.** Um `Future` que nunca
/// completa nao lanca, entao o `on Object catch` abaixo nunca o viu. O
/// `.timeout` e o que transforma "nao respondeu" em algo que o `catch` pega:
/// a partir dele, espera que ESTOURA e indistinguivel, para o resto do app, de
/// falha que LANCA -- as duas saem daqui como [AvisosNaoEmbarcados] com o
/// motivo escrito. Nenhum chamador precisa saber qual das duas foi.
///
/// O silencio e que nao esta aqui: a causa vai para o log de arranque, e a
/// antessala de C.3 **nunca aparece** neste estado -- o app nao promete um
/// aviso que nao vai chegar.
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
