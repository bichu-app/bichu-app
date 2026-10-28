// AS ISCAS DO RECADO DE ABERTURA SEM INTERNET (cliente, 26/10/2026).
//
// ===========================================================================
// O PEDIDO, NAS PALAVRAS DELE
// ===========================================================================
//
// *"vamos implementar uma mensagem de erro, quando o usuario tentar abrir o
// aplicativo e nao estiver conectado na internet, ao inves de deixar parado na
// pagina de splashscreen"*.
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E POR QUE ELE MONTA `BichuApp` DIRETO
// ===========================================================================
//
// Ele NAO usa `abrirOApp` de `test/telas/ajuda_de_tela.dart`, e isso e o
// ponto. Aquele ajudante responde `GET /health` por conta propria, para que os
// 21 arquivos cujo `rede` lanca para toda rota nao passem a abrir no recado --
// e um caso que medisse o recado atraves dele estaria medindo o ajudante.
//
// Montando `BichuApp` direto, o que se exercita e a FIACAO DE PRODUCAO: e
// `app.dart` quem constroi `SondaDeConexao(_api)` e a entrega ao portao. Sem
// aquela linha, estes casos reprovam -- que e a unica forma de a fiacao nao
// poder ser esquecida em silencio, como `APP_VERSION` foi em 19/10.
//
// ===========================================================================
// POR QUE "SEM APP_VERSION" TEM CASO PROPRIO
// ===========================================================================
//
// `AppConfig` sem `APP_VERSION` faz a pergunta de versao NAO SAIR (medido, e e
// o estado do build de iOS). Se o recado dependesse dela, o mecanismo nasceria
// desligado naquele build e nada acusaria. O caso `SEM APP_VERSION` e o que
// prova que a conectividade tem pergunta propria.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/dispositivo/localizacao.dart';
import 'package:bichu/dispositivo/oportunidades_de_aviso.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/sessao/registro_do_aviso_de_cadastro.dart';
import 'package:bichu/telas/abertura/recado_na_abertura.dart';
import 'package:bichu/telas/abertura/tela_sem_conexao.dart';
import 'package:bichu/telas/abertura/textos_da_abertura.dart';
import 'package:bichu/telas/atualizacao/tela_de_bloqueio_por_versao.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

/// O corpo que `GET /health` devolve quando o servidor esta de pe.
http.Response _saudavel() {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'status': 'ok',
      'version': '0.0.0-teste',
      'build': <String, String>{
        'artifact': '0000000000000000',
        'commit': '0000000',
      },
    }),
    200,
    headers: const <String, String>{'content-type': 'application/json'},
  );
}

void main() {
  setUp(AppConfig.limparParaTeste);
  tearDown(AppConfig.limparParaTeste);

  /// Monta o app INTEIRO, como producao o monta.
  ///
  /// [versaoDoApp] nula e o padrao porque e o estado do build sem
  /// `APP_VERSION`; os casos que querem a pergunta de versao no caminho
  /// passam uma.
  Future<void> abrir(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) rede,
    String? versaoDoApp,
  }) async {
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBaseDeTeste,
          versaoDoAppDeTeste: versaoDoApp,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient(rede),
        // Os depositos em memoria, pelo motivo escrito em `ajuda_de_tela.dart`:
        // o padrao do app chama `getApplicationDocumentsDirectory()`, que em
        // teste de widget nunca responde.
        depositoDeIntencao: DepositoDeIntencaoEmMemoria(),
        depositoDaCidade: DepositoDaCidadeEmMemoria(),
        depositoDaFila: DepositoDaFilaEmMemoria(),
        depositoDeFotos: DepositoDeFotosEmMemoria(),
        depositoDeOportunidades: DepositoDeOportunidadesEmMemoria(),
        depositoDoAvisoDeCadastro: DepositoDoAvisoEmMemoria(),
        camera: const CameraNaoEmbarcada(),
        localizacao: const LocalizacaoNaoEmbarcada(),
        avisos: const AvisosNaoEmbarcados(motivo: 'teste'),
      ),
    );
    // O suficiente para a sonda voltar e o portao repintar. Nao e
    // `pumpAndSettle`: a tela de abertura tem um indicador que gira para
    // sempre, e `pumpAndSettle` nela nunca assenta.
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(seconds: 1));
  }

  Future<http.Response> semRede(http.Request _) async =>
      throw const SocketException('sem rede (caso de teste)');

  group('ISCA: abrir sem internet mostra o recado, e nao uma tela parada', () {
    testWidgets(
      'ISCA: sem rede, o recado aparece NO LUGAR do app, com a frase do pedido',
      (tester) async {
        await abrir(tester, rede: semRede);

        expect(
          find.byType(TelaDeAberturaSemConexao),
          findsOneWidget,
          reason: 'sem internet a abertura precisa DIZER algo -- sem isto a '
              'pessoa entra no app e nada carrega, sem uma palavra sobre o '
              'motivo (pedido do cliente, 26/10/2026)',
        );
        expect(find.text(TextosDaAbertura.tituloSemConexao), findsOneWidget);
        expect(find.text(TextosDaAbertura.corpoSemConexao), findsOneWidget);
        // **E o app NAO esta embaixo**: o recado substitui a arvore, e nao a
        // cobre. Um recado sobreposto deixaria a barra de abas tocavel atras
        // dele.
        expect(find.byType(CascaComAbas), findsNothing);
        // E nao ha indicador girando: "parado carregando" e justamente o
        // estado que o pedido manda trocar por mensagem.
        expect(find.byType(CircularProgressIndicator), findsNothing);
      },
    );

    testWidgets(
      'ISCA: SEM APP_VERSION o recado continua aparecendo '
      '(a pergunta de versao nem sai, e a de conexao tem de sair)',
      (tester) async {
        // `versaoDoApp` nulo e o default de `abrir`, e e o estado do build de
        // iOS. Este caso existe para o recado nao poder depender de um
        // `--dart-define`.
        await abrir(tester, rede: semRede);
        expect(find.byType(TelaDeAberturaSemConexao), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: COM APP_VERSION o recado tambem aparece, e pela pergunta de '
      'versao (uma requisicao, nao duas)',
      (tester) async {
        final caminhos = <String>[];
        await abrir(
          tester,
          versaoDoApp: '1.2.3',
          rede: (http.Request req) async {
            caminhos.add(req.url.path);
            throw const SocketException('sem rede (caso de teste)');
          },
        );
        expect(find.byType(TelaDeAberturaSemConexao), findsOneWidget);
        expect(
          caminhos.where((c) => c.endsWith('/health')),
          isEmpty,
          reason: 'com `APP_VERSION` a pergunta de versao JA foi ao servidor e '
              'ja descobriu que nao ha rede -- sondar de novo gastaria uma '
              'chamada para medir o que acabou de ser medido',
        );
        expect(
          caminhos.where((c) => c.endsWith('/app/version-status')),
          isNotEmpty,
        );
      },
    );

    testWidgets(
      'SERVIDOR FORA tem a MESMA cara: 503 na sonda mostra o mesmo recado',
      (tester) async {
        // Os dois sintomas sao a mesma peca, de proposito: para quem abriu o
        // app, "sem internet" e "servidor fora" sao indistinguiveis.
        await abrir(
          tester,
          rede: (http.Request _) async => http.Response('', 503),
        );
        expect(find.byType(TelaDeAberturaSemConexao), findsOneWidget);
      },
    );

    testWidgets(
      'A RESPOSTA QUE NAO VEM tambem: o prazo do ApiClient estoura e o recado '
      'aparece, em vez de a abertura esperar sem fim',
      (tester) async {
        final nunca = Completer<http.Response>();
        addTearDown(() {
          if (!nunca.isCompleted) nunca.complete(_saudavel());
        });
        await abrir(tester, rede: (http.Request _) => nunca.future);

        // Antes do prazo nao ha recado, e isso e o desenho: o portao nao
        // espera resposta para pintar o app.
        expect(find.byType(TelaDeAberturaSemConexao), findsNothing);

        await tester.pump(const Duration(seconds: 21));
        expect(
          find.byType(TelaDeAberturaSemConexao),
          findsOneWidget,
          reason: 'servidor que aceita a conexao e nao responde -- TLS '
              'pendurado, DNS lento, portal de captura -- e o caso ruim de '
              'verdade, e ele precisa terminar em mensagem',
        );
      },
    );
  });

  group('REGUA: com servidor, nada muda', () {
    testWidgets(
      'REGUA: `/health` responde 200 e o app aparece inteiro, sem recado',
      (tester) async {
        await abrir(tester, rede: (http.Request _) async => _saudavel());
        expect(find.byType(TelaDeAberturaSemConexao), findsNothing);
        expect(find.byType(CascaComAbas), findsOneWidget);
      },
    );

    testWidgets(
      'REGUA: 404 na sonda NAO e "sem internet" -- servidor vivo e servidor',
      (tester) async {
        // Um 404 aqui significa rota que este destino nao publica. Trancar a
        // abertura nesse caso seria o app se recusando a abrir porque uma
        // sonda de operacao mudou de lugar.
        await abrir(
          tester,
          rede: (http.Request _) async => http.Response('', 404),
        );
        expect(find.byType(TelaDeAberturaSemConexao), findsNothing);
        expect(find.byType(CascaComAbas), findsOneWidget);
      },
    );

    testWidgets(
      'REGUA: 500 na pergunta de VERSAO nao anuncia falta de internet',
      (tester) async {
        // Erro do servidor na pergunta de versao continua liberando, e **sem**
        // dizer que faltou rede: mandar a pessoa conferir o Wi-Fi dela por um
        // defeito nosso seria a tela mentindo.
        await abrir(
          tester,
          versaoDoApp: '1.2.3',
          rede: (http.Request _) async => http.Response('', 500),
        );
        expect(find.byType(TelaDeAberturaSemConexao), findsNothing);
        expect(find.byType(CascaComAbas), findsOneWidget);
      },
    );
  });

  group('as duas saidas do recado', () {
    testWidgets('`Tentar de novo` com o servidor de volta abre o app',
        (tester) async {
      var caiu = true;
      await abrir(
        tester,
        rede: (http.Request _) async {
          if (caiu) throw const SocketException('sem rede (caso de teste)');
          return _saudavel();
        },
      );
      expect(find.byType(TelaDeAberturaSemConexao), findsOneWidget);

      caiu = false;
      await tester.tap(find.text(TextosDaAbertura.tentarDeNovo));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));

      expect(find.byType(TelaDeAberturaSemConexao), findsNothing);
      expect(find.byType(CascaComAbas), findsOneWidget);
    });

    testWidgets(
      '`Usar sem internet` entrega o app: ninguem fica preso offline',
      (tester) async {
        // A fila offline e as fotos pendentes deste app existem para o metro e
        // o elevador. Um recado sem saida trancaria justamente quem precisa
        // chegar nelas.
        await abrir(tester, rede: semRede);
        await tester.tap(find.text(TextosDaAbertura.seguirSemInternet));
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));

        expect(find.byType(TelaDeAberturaSemConexao), findsNothing);
        expect(find.byType(CascaComAbas), findsOneWidget);
      },
    );
  });

  group('o corpo compartilhado nao abriu saida no BLOQUEIO', () {
    testWidgets(
      'o bloqueio por versao continua sem acao secundaria e com `canPop: false`',
      (tester) async {
        // O corpo das duas telas passou a ser o mesmo widget em 26/10/2026.
        // Este caso e o que impede a generalizacao de ter aberto uma quarta
        // saida no bloqueio -- "bloqueio com saida nao e bloqueio".
        await tester.pumpWidget(
          MaterialApp(
            // `BichuTheme` e obrigatorio: `BichuColors.of` estoura sem ele, e
            // essa guarda e do proprio tema.
            theme: BichuTheme.claro,
            home: const TelaDeBloqueioPorVersao(),
          ),
        );
        expect(find.byType(RecadoNaAbertura), findsOneWidget);
        expect(find.text(TextosDaAbertura.seguirSemInternet), findsNothing);
        expect(find.byType(TextButton), findsNothing);
        // **O `PopScope` por predicado e nao por tipo**: `PopScope<T>` e
        // generico e `find.byType(PopScope<Object?>)` nao casa com a instancia
        // que o `build` cria. O que esta trava mede e ESTRUTURAL (o valor de
        // `canPop`); quem mede o COMPORTAMENTO -- a tela nao sair com um
        // `maybePop` -- e o grupo `a tela de bloqueio sozinha` de
        // `test/atualizacao/portao_de_versao_test.dart`, que continua de pe.
        expect(
          find.byWidgetPredicate(
            (Widget w) => w is PopScope && w.canPop == false,
          ),
          findsOneWidget,
          reason: 'a generalizacao de 26/10 nao pode ter aberto saida no '
              'bloqueio: bloqueio com saida nao e bloqueio',
        );
      },
    );
  });
}
