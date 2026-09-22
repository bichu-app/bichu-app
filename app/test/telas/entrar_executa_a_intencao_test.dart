/// C.2 e F1.2 terminam na ação guardada, e nunca na home (UX 8.3).
///
/// **Por que este arquivo existe.** O destino depois do login era
/// `context.go(Rotas.inicio)`, com um comentário dizendo que o envelope de 8.3
/// ainda não existia. Agora ele existe, e a troca que o resolve é de uma
/// linha — o tipo de linha que volta calada numa refatoração, porque ir para a
/// home *parece* certo: a pessoa entrou na conta, e o app abriu.
///
/// Os casos atravessam o caminho inteiro de propósito (tela, `AuthApi`,
/// `ApiClient`, guarda, `PetsApi`, roteador). Um teste que chamasse
/// `GuardaDeAcao.executarDepoisDoLogin` direto continuaria verde no dia em que
/// a tela parasse de chamá-la, que é exatamente o defeito a pegar.
library;

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/intencao/cadastro_de_pet_como_intencao.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/guarda_de_acao.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String urlBase = 'http://localhost:3000';

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) {
  return http.Response(
    jsonEncode(corpo),
    status,
    headers: <String, String>{'content-type': 'application/json; charset=utf-8'},
  );
}

http.Response _problema(String slug, int status) {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'type': 'https://api.bichu.app/problems/$slug',
      'title': 'Nao foi possivel concluir',
      'status': status,
    }),
    status,
    headers: <String, String>{
      'content-type': 'application/problem+json; charset=utf-8',
    },
  );
}

Map<String, dynamic> get _sessaoDoContrato => <String, dynamic>{
      'access_token': 'at-1',
      'refresh_token': 'rt-1',
      'expires_in': 900,
      'user': <String, dynamic>{
        'id': 'usr_1',
        'email': 'marina@exemplo.com.br',
        'email_verified': false,
        'pending_profile_fields': <String>[],
        'can_open_lost_case': false,
      },
    };

/// O envelope da Camila, na versão que este build sabe executar: o cadastro do
/// pet, com nome, espécie, porte e a **foto por caminho de arquivo**.
String envelopeDeCadastro({Duration idade = Duration.zero}) {
  final rascunho = RascunhoDePet()
    ..nome = 'Nina'
    ..especie = Especie.cao
    ..porte = Porte.medio
    ..sinaisParticulares = 'estava na praça'
    ..foto = const FotoLocal(
      caminho: '/tmp/bichu/nina.jpg',
      tipoDeConteudo: 'image/jpeg',
      tamanhoEmBytes: 2411233,
    );
  return jsonEncode(
    intencaoDeCadastrarPet(
      rascunho,
      criadaEm: DateTime.now().subtract(idade),
    ).paraJson(),
  );
}

/// Abre o app com o envelope já no disco e leva até C.2, como quem chegou por
/// uma ação guardada.
Future<void> abrirEntrarCom(
  WidgetTester tester, {
  required DepositoDaIntencao envelope,
  required Future<http.Response> Function(http.Request) rede,
}) async {
  AppConfig.limparParaTeste();
  await tester.pumpWidget(
    BichuApp(
      config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
      deposito: DepositoEmMemoria(),
      depositoDeIntencao: envelope,
      clienteHttp: MockClient(rede),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
  await tester.pumpAndSettle();
  await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
  await tester.pumpAndSettle();
}

Future<void> entrar(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField).at(0), 'marina@exemplo.com.br');
  await tester.enterText(find.byType(TextField).at(1), 'uma frase curta');
  await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
  await tester.pumpAndSettle();
}

void main() {
  group('regra 3 — depois do login, a ação é EXECUTADA', () {
    testWidgets('o pet é cadastrado e a pessoa chega na tela de resultado',
        (tester) async {
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(envelopeDeCadastro());

      final caminhos = <String>[];
      await abrirEntrarCom(
        tester,
        envelope: deposito,
        rede: (req) async {
          caminhos.add('${req.method} ${req.url.path}');
          if (req.url.path.endsWith('/auth/login')) {
            return _json(_sessaoDoContrato);
          }
          if (req.url.path.endsWith('/pets') && req.method == 'POST') {
            return _json(<String, dynamic>{
              'id': 'pet_01H',
              'name': 'Nina',
              'species': 'dog',
            }, status: 201);
          }
          return _problema('not-found', 404);
        },
      );

      await entrar(tester);

      expect(
        caminhos.any((c) => c == 'POST /v1/pets'),
        isTrue,
        reason: 'REPROVA: ninguém cadastrou o pet. A pessoa entrou na conta e '
            'teria de tocar em `Cadastrar` de novo — a meia-entrega que UX '
            '8.3, regra 3, nomeia.',
      );
      // A tela de resultado, F1.6.
      expect(find.text('Pet cadastrado'), findsOneWidget);
      // E a home não apareceu em momento nenhum (regra 4).
      expect(
        find.byType(NavigationBar),
        findsNothing,
        reason: 'REPROVA: a pessoa passou pela home. 8.3 regra 4: nunca a '
            'home, exceto quando a intenção expirou.',
      );
      // Regra 7: executou, o envelope morreu.
      expect(await deposito.ler(), isNull);
    });

    testWidgets('a foto do envelope volta por CAMINHO, e não por bytes',
        (tester) async {
      // O envelope gravado é o que a tela de entrar vai ler. Ele é conferido
      // aqui, no caminho de verdade, e não só no teste de unidade do formato:
      // é fácil alguém "melhorar" a captura enfiando a imagem no rascunho.
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(envelopeDeCadastro());
      final gravado = (await deposito.ler())!;

      expect(gravado, contains('/tmp/bichu/nina.jpg'));
      expect(
        gravado.length,
        lessThan(2048),
        reason: 'REPROVA: o envelope está carregando conteúdo de imagem. Ele '
            'é serializado no momento de menos memória do app (UX 8.3, '
            'regra 5).',
      );
    });
  });

  group('regra 2 — a intenção expirada não executa, e o login leva à home', () {
    testWidgets('o achado de ontem NÃO é publicado hoje', (tester) async {
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(
        envelopeDeCadastro(idade: const Duration(hours: 25)),
      );

      var cadastrou = false;
      await abrirEntrarCom(
        tester,
        envelope: deposito,
        rede: (req) async {
          if (req.url.path.endsWith('/auth/login')) {
            return _json(_sessaoDoContrato);
          }
          if (req.url.path.endsWith('/pets') && req.method == 'POST') {
            cadastrou = true;
            return _json(<String, dynamic>{'id': 'pet_01H'}, status: 201);
          }
          return _problema('not-found', 404);
        },
      );

      await entrar(tester);

      expect(
        cadastrou,
        isFalse,
        reason: 'REPROVA: o app executou sozinho um rascunho de ontem.',
      );
      // Este é o único caso em que a home é o destino certo.
      expect(find.byType(NavigationBar), findsOneWidget);
      expect(await deposito.ler(), isNull);
    });
  });

  group('regra 4 — a falha leva à tela de retorno, e nunca à home', () {
    testWidgets('o servidor fora devolve F1.5 com o rascunho e o erro',
        (tester) async {
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(envelopeDeCadastro());

      await abrirEntrarCom(
        tester,
        envelope: deposito,
        rede: (req) async {
          if (req.url.path.endsWith('/auth/login')) {
            return _json(_sessaoDoContrato);
          }
          if (req.url.path.endsWith('/pets') && req.method == 'POST') {
            return _problema('internal', 500);
          }
          return _problema('not-found', 404);
        },
      );

      await entrar(tester);

      expect(
        find.byType(NavigationBar),
        findsNothing,
        reason: 'REPROVA: a falha da execução jogou a pessoa na home, com o '
            'rascunho dela perdido (UX 8.3, regra 4).',
      );
      // O rascunho voltou carregado: o que a pessoa escreveu em F1.5 ainda
      // está no campo, e ela não digita nada duas vezes.
      expect(
        find.text('estava na praça'),
        findsOneWidget,
        reason: 'REPROVA: a tela de retorno abriu em branco. O rascunho '
            'precisa voltar carregado (UX 8.3, regra 4).',
      );
      // E o erro está explicado na tela de retorno. A faixa fica no fim de
      // F1.5, que é uma tela longa: `ListView` só constrói o que cabe, e por
      // isso o caso rola até ela como a pessoa faria.
      await tester.scrollUntilVisible(
        find.text(MensagensDeErro.servidorFora),
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      expect(
        find.text(MensagensDeErro.servidorFora),
        findsOneWidget,
        reason: 'REPROVA: a tela de retorno abriu calada. A pessoa entrou na '
            'conta, a ação dela não aconteceu, e ninguém disse por quê '
            '(UX 8.3, regra 4).',
      );
      // O envelope FICA: a tela de retorno guarda o rascunho só em memória.
      expect(await deposito.ler(), isNotNull);
    });
  });

  group('F1.2 — o exemplo de aceite de 8.3, o da Camila', () {
    testWidgets('quem acabou de criar a conta e toca em Continuar executa',
        (tester) async {
      // "Ela toca em `Criar conta`, cria a conta, verifica nada. O app
      // registra o achado." Enquanto F1.2 mandava para o Início, a intenção
      // guardada morria de velha sem nunca executar.
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(envelopeDeCadastro());

      var cadastrou = false;
      AppConfig.limparParaTeste();
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
          deposito: DepositoEmMemoria(),
          depositoDeIntencao: deposito,
          clienteHttp: MockClient((req) async {
            if (req.url.path.endsWith('/pets') && req.method == 'POST') {
              cadastrou = true;
              return _json(<String, dynamic>{
                'id': 'pet_01H',
                'name': 'Nina',
                'species': 'dog',
              }, status: 201);
            }
            return _problema('not-found', 404);
          }),
        ),
      );
      await tester.pumpAndSettle();

      final contexto = tester.element(find.byType(Scaffold).first);
      GoRouter.of(contexto).push(
        Rotas.verifiqueSeuEmail,
        extra: 'marina@exemplo.com.br',
      );
      await tester.pumpAndSettle();

      await tester.tap(find.widgetWithText(FilledButton, 'Continuar'));
      await tester.pumpAndSettle();

      expect(
        cadastrou,
        isTrue,
        reason: 'REPROVA: `Continuar` foi para a home e a intenção ficou '
            'esperando até expirar. É o caminho do exemplo de aceite de 8.3.',
      );
      expect(find.text('Pet cadastrado'), findsOneWidget);
    });
  });

  group('regra 7 — sair da conta apaga o envelope', () {
    test('o rascunho de quem saiu não espera a próxima pessoa', () async {
      // Sem isto, quem pega o aparelho depois — o filho, o outro tutor da
      // casa, quem comprou o celular usado — publica no primeiro login um
      // caso que não é dele.
      AppConfig.limparParaTeste();
      final envelope = DepositoDeIntencaoEmMemoria();
      await envelope.gravar(envelopeDeCadastro());

      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
        cliente: MockClient((_) async => http.Response('', 204)),
      );
      final guarda = GuardaDeAcao(
        deposito: envelope,
        rotaDaTela: Rotas.rotaDaTelaDeUx,
      );
      final sessao = ControladorDeSessao(
        auth: AuthApi(api),
        deposito: DepositoEmMemoria(),
        guardaDeAcao: guarda,
      );

      await sessao.sair();

      expect(
        await envelope.ler(),
        isNull,
        reason: 'REPROVA: o envelope de quem saiu ficou no disco (UX 8.3, '
            'regra 7).',
      );
    });
  });
}
