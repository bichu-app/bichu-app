import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/validacao/nome_de_exibicao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// F1.1 — o NOME e obrigatorio no cadastro.
///
/// ## A queixa, nas palavras do cliente (18/10/2026)
///
/// *"o campo de nome no cadastro do usuario e obrigatorio, hoje ele esta
/// cadastrando sem esse campo"*.
///
/// ## O campo EXISTIA, e e isso que torna a queixa a segunda coisa e nao a
/// primeira
///
/// `BichuField(rotulo: 'Nome')` ja estava nesta tela, e **sem** `opcional:
/// true` -- ou seja, o rotulo nunca disse "(opcional)" e o campo PARECIA
/// obrigatorio. O que faltava era alguem exigindo: a tela mandava
/// `nome: _nome.text.trim().isEmpty ? null : ...`, o contrato listava
/// `required: [email, password]` e `cadastrar` nao conferia nada. As tres
/// camadas concordavam em nao cobrar, e a tela mentia o tempo todo.
///
/// ## O que estes casos afirmam, e por que e sobre o CORPO
///
/// Um caso que confirmasse "ha mensagem de erro na tela" ficaria verde com a
/// requisicao saindo sem nome. A regra guardada aqui e:
///
/// > **Toda requisicao de cadastro que sai desta tela carrega `display_name`
/// > com nome dentro. Sem nome, nao sai requisicao nenhuma.**
///
/// A trava que VALE e a do servidor (`cadastro-exige-nome.test.ts`), porque a
/// rota e publica. Esta tela e conveniencia -- e os casos daqui existem para
/// ela nao deixar de ser, que e o estado em que ela estava.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  http.Response sessaoCriada() {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': false,
        },
      }),
      201,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }

  /// Os corpos de TODO `POST /auth/register` que a tela disparar.
  ///
  /// Uma lista, e nao a ultima: a pergunta e "quantas sairam", e uma variavel
  /// que guarda a ultima nao distingue nenhuma de uma.
  late List<Map<String, dynamic>> cadastros;

  Future<void> abrirCriarConta(WidgetTester tester) async {
    cadastros = <Map<String, dynamic>>[];
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versao,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            cadastros.add(jsonDecode(req.body) as Map<String, dynamic>);
            return sessaoCriada();
          }
          // 404 no resto de proposito: chamada nao prevista precisa falhar
          // alto, e nao passar por acidente.
          return http.Response('{}', 404);
        }),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criar conta'));
    await tester.pumpAndSettle();
  }

  final Finder campoNome = find.byType(TextField).at(0);
  final Finder campoEmail = find.byType(TextField).at(1);
  final Finder campoSenha = find.byType(TextField).at(2);
  final Finder botaoCriarConta = find.widgetWithText(FilledButton, 'Criar conta');

  Future<void> marcarOAceite(WidgetTester tester) async {
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
  }

  /// Preenche tudo menos o nome, que cada caso escolhe.
  Future<void> preencher(WidgetTester tester, String nome) async {
    if (nome.isNotEmpty) await tester.enterText(campoNome, nome);
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'coleira-azul-do-bidu-2026');
    await tester.pumpAndSettle();
    await marcarOAceite(tester);
  }

  /// `onPressed` nulo e o que **bloqueia** o botao; `FilledButton` desabilitado
  /// nao e um estado visual, e a ausencia da acao.
  bool botaoBloqueado(WidgetTester tester) =>
      tester.widget<FilledButton>(botaoCriarConta).onPressed == null;

  group('o campo de nome JA EXISTE, e agora e exigido', () {
    /// O campo nunca foi marcado como opcional, e o rotulo e a prova.
    ///
    /// Este caso existe para separar as duas queixas possiveis: "nao tem
    /// campo" e "o campo nao e obrigatorio". Era a segunda.
    testWidgets('o rotulo e `Nome`, e nunca `Nome (opcional)`', (tester) async {
      await abrirCriarConta(tester);

      expect(find.text('Nome'), findsOneWidget);
      expect(
        find.text('Nome (opcional)'),
        findsNothing,
        reason:
            'campo que PARECE obrigatorio e nao e e a pior das combinacoes: '
            'era exatamente o estado desta tela antes de 18/10/2026',
      );
    });

    /// ISCA (a), do lado da tela.
    ///
    /// Desligada: trocando `aoTocar` do `BotaoPrimario` de volta para
    /// `_criarConta` cru, este caso reprova em `botaoBloqueado`. Conferido.
    testWidgets('com o nome VAZIO o botao fica bloqueado e nenhuma requisicao sai',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, '');

      expect(
        botaoBloqueado(tester),
        isTrue,
        reason: 'sem nome o botao nao tem acao: `onPressed` e nulo',
      );

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(
        cadastros,
        isEmpty,
        reason:
            'a queixa de 18/10/2026 e exatamente esta requisicao saindo. Um caso '
            'que so olhasse a mensagem na tela ficaria verde com ela saindo',
      );
    });

    /// ISCA (b), do lado da tela, E O CASO QUE ESCAPAVA.
    ///
    /// Os tres espacos vem de `' '.repeat(3)` e nao de um literal: espaco no
    /// fim de string literal e a primeira coisa que um formatador apara, e
    /// aparado este caso viraria uma copia do anterior sem ninguem notar.
    ///
    /// Desligada: trocando `NomeDeExibicao.completo` por
    /// `_nome.text.isNotEmpty` no botao, este caso reprova e o anterior
    /// continua verde -- `"   "` nao e vazio para `isEmpty`.
    testWidgets('com o nome SO COM ESPACO o botao fica bloqueado e nenhuma requisicao sai',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, ' ' * 3);

      expect(
        botaoBloqueado(tester),
        isTrue,
        reason: '`"   "` nao e vazio para `isEmpty`, e nao tem nome nenhum dentro',
      );

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty);
    });

    /// A recusa pelo TECLADO, que o botao bloqueado nao alcanca.
    ///
    /// `aoEnviar` do campo de senha chama `_criarConta` direto: quem conclui o
    /// formulario pelo "done" do teclado nao passa pelo estado do botao. Sem a
    /// guarda dentro de `_criarConta` este caminho mandaria a requisicao com o
    /// nome em branco -- e e por isso que a guarda nao e redundante.
    testWidgets('o `done` do teclado tambem recusa, e diz O QUE FAZER',
        (tester) async {
      await abrirCriarConta(tester);
      await tester.enterText(campoEmail, 'marina@exemplo.com.br');
      await tester.enterText(campoSenha, 'coleira-azul-do-bidu-2026');
      await tester.pumpAndSettle();
      await marcarOAceite(tester);

      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty, reason: 'o caminho do teclado tambem e fechado');
      expect(
        find.text(NomeDeExibicao.precisaDoNome),
        findsOneWidget,
        reason:
            'a mensagem diz o que fazer ("Digite o nome...") e nao que algo esta '
            '"invalido": quem le precisa saber como sair do lugar',
      );
    });

    /// O CONTRAPESO, e sem ele este arquivo nao vale nada.
    ///
    /// Um botao bloqueado para SEMPRE deixaria os tres casos acima verdes. Este
    /// e o unico que reprovaria. Ele afirma o corpo, e nao o 201: o nome vai
    /// aparado, porque a tela manda `NomeDeExibicao.aparar`.
    testWidgets('com o nome preenchido o cadastro sai, e `display_name` vai aparado',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, '  Marina Prado  ');

      expect(
        botaoBloqueado(tester),
        isFalse,
        reason: 'com nome o botao volta a ter acao',
      );

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, hasLength(1));
      expect(
        cadastros.single['display_name'],
        'Marina Prado',
        reason:
            'o corpo leva o nome APARADO: mandar "  Marina Prado  " gravaria o '
            'espaco e ele apareceria em toda tela que mostra o nome',
      );
    });
  });
}
