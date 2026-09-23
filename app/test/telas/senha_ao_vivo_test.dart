import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/widgets/requisitos_da_senha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// F1.1 — a validacao de senha **ao vivo**, no lugar do texto de ajuda fixo.
///
/// Pedido do cliente em 22/09/2026: _"Voce deve substituir o texto 'Pelo menos
/// 10 caracteres. Uma frase curta funciona melhor', e colocar aquelas
/// validacoes do campo dinamico conforme o usuario for preenchendo e ir
/// respeitando a politica de senha."_
///
/// **Os textos esperados estao escritos por extenso**, e nao lidos de
/// `RegraDeSenha`. Tres casos deste projeto ja compararam o texto renderizado
/// com a constante que o produz: eles ficam verdes com a tela mostrando
/// qualquer coisa, inclusive a frase errada.
///
/// O que estes casos guardam:
///
/// 1. o texto estatico saiu e as quatro regras estao na tela;
/// 2. a lista reage a cada tecla, sem toque em botao nenhum;
/// 3. ela reage tambem ao e-mail, que e a regra `similar_to_identity`;
/// 4. a tela recusa o que o servidor recusa, antes da ida a rede;
/// 5. a tela **nao** recusa o que o servidor aceita;
/// 6. o estado e anunciado para leitor de tela, por regiao viva;
/// 7. o anuncio nao se repete a cada caractere;
/// 8. recusa do servidor por motivo novo nao vira "pelo menos 10 caracteres".
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  // As quatro frases da lista, escritas a mao. Se uma mudar no produto, o caso
  // reprova e alguem decide -- que e o oposto de ler `RegraDeSenha.texto`.
  const String regraTamanho = 'Pelo menos 10 caracteres';
  const String regraTeto = 'No máximo 256 caracteres';
  const String regraEspacos = 'Não pode ser só espaços';
  const String regraIdentidade = 'Diferente do seu e-mail e do seu nome';

  late List<Map<String, dynamic>> cadastros;
  late http.Response Function() resposta;

  http.Response sessaoCriada() => http.Response(
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

  Future<void> abrirCriarConta(WidgetTester tester) async {
    cadastros = <Map<String, dynamic>>[];
    resposta = sessaoCriada;
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
            return resposta();
          }
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

  /// O icone da linha daquela regra, que e o que diz o estado a quem enxerga.
  IconData iconeDa(WidgetTester tester, String texto) {
    final linha =
        find.ancestor(of: find.text(texto), matching: find.byType(Row)).first;
    final icone = tester.widget<Icon>(
      find.descendant(of: linha, matching: find.byType(Icon)),
    );
    return icone.icon!;
  }

  /// O rotulo do no de semantica da lista: o que o TalkBack e o VoiceOver leem.
  String rotuloAnunciado(WidgetTester tester) =>
      tester.getSemantics(find.byType(RequisitosDaSenha)).label;

  /// A lista ficou mais longa com os requisitos, e o `ListView` constroi sob
  /// demanda: o botao pode nem existir na arvore ate a rolagem chegar nele.
  Future<void> tocarEmCriarConta(WidgetTester tester) async {
    final botao = find.widgetWithText(FilledButton, 'Criar conta');
    await tester.dragUntilVisible(
      botao,
      find.byType(ListView),
      const Offset(0, -80),
    );
    await tester.pumpAndSettle();
    await tester.tap(botao);
    await tester.pumpAndSettle();
  }

  testWidgets('ISCA — o texto estatico saiu e as QUATRO regras entraram',
      (tester) async {
    await abrirCriarConta(tester);

    expect(
      find.textContaining('Uma frase curta funciona melhor'),
      findsNothing,
      reason: 'REPROVA: o texto de ajuda fixo voltou. Ele dizia UM dos quatro '
          'requisitos e so virava erro depois do toque no botao; o cliente '
          'pediu a lista ao vivo no lugar dele em 22/09/2026.',
    );
    for (final regra in <String>[
      regraTamanho,
      regraTeto,
      regraEspacos,
      regraIdentidade,
    ]) {
      expect(
        find.text(regra),
        findsOneWidget,
        reason: 'REPROVA: a tela nao mostra "$regra", e o servidor recusa por '
            'isso. Regra aplicada e regra mostrada.',
      );
    }
    expect(
      find.textContaining('vazamento conhecido'),
      findsOneWidget,
      reason: 'REPROVA: a lista some com o aviso de que o servidor confere '
          'mais uma coisa. Sem ele, quatro de quatro em verde e lido como '
          'garantia de que o cadastro passa, e a recusa por vazamento chega '
          'como surpresa depois do envio.',
    );
  });

  testWidgets('ISCA — a lista reage A CADA TECLA, sem tocar em botao nenhum',
      (tester) async {
    await abrirCriarConta(tester);

    // Nada digitado: nenhuma acusacao.
    expect(iconeDa(tester, regraTamanho), Icons.circle_outlined);

    await tester.enterText(campoSenha, 'curta');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraTamanho),
      Icons.cancel_outlined,
      reason: 'REPROVA: cinco caracteres e a lista nao reagiu. A validacao ao '
          'vivo parou de acompanhar o que esta sendo digitado, que e o pedido '
          'inteiro desta entrega.',
    );
    expect(iconeDa(tester, regraEspacos), Icons.check_circle_outline);

    await tester.enterText(campoSenha, 'uma frase bem longa');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraTamanho),
      Icons.check_circle_outline,
      reason: 'REPROVA: o requisito foi satisfeito e a lista continua '
          'acusando falta. Mostrar o que JA esta satisfeito e metade do '
          'pedido.',
    );
  });

  testWidgets(
      'ISCA — a lista reage ao E-MAIL digitado depois da senha',
      (tester) async {
    // `similar_to_identity` depende de outro campo. Uma implementacao presa ao
    // `onChanged` do campo de senha passa nos casos acima e reprova aqui: a
    // pessoa escolhe a senha, depois digita o e-mail, e a lista fica parada
    // mostrando verde numa senha que o servidor vai recusar.
    await abrirCriarConta(tester);

    await tester.enterText(campoSenha, 'marina1998xyz');
    await tester.pumpAndSettle();
    expect(iconeDa(tester, regraIdentidade), Icons.check_circle_outline);

    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraIdentidade),
      Icons.cancel_outlined,
      reason: 'REPROVA: o e-mail mudou e a lista nao reavaliou a semelhanca. '
          'A tela mostra verde numa senha que o servidor recusa com '
          '`similar_to_identity`.',
    );

    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();
    expect(iconeDa(tester, regraIdentidade), Icons.check_circle_outline);
  });

  testWidgets(
      'ISCA — a tela recusa o que o servidor recusa, ANTES da ida a rede',
      (tester) async {
    await abrirCriarConta(tester);
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'marina1998xyz');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tocarEmCriarConta(tester);

    expect(
      cadastros,
      isEmpty,
      reason: 'REPROVA: a tela gastou uma ida a rede com uma senha que ela '
          'ja sabia que o servidor recusa.',
    );
    expect(
      find.text(
        'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.',
      ),
      findsOneWidget,
      reason: 'REPROVA: a tela recusou e disse outra coisa. Ate 22/09 ela '
          'respondia "A senha precisa de pelo menos 10 caracteres." a '
          'QUALQUER recusa de senha, e quem tinha 13 caracteres acrescentava '
          'mais um sem entender.',
    );
  });

  testWidgets('ISCA — a tela NAO exige o que o servidor nao exige',
      (tester) async {
    // Sem maiuscula, sem numero, sem simbolo. A politica do servidor aceita, e
    // a ADR-0003 prefere isto a `Senha@123`. Uma lista que cobrasse composicao
    // pararia aqui e a conta nao sairia.
    await abrirCriarConta(tester);
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();

    for (final regra in <String>[
      regraTamanho,
      regraTeto,
      regraEspacos,
      regraIdentidade,
    ]) {
      expect(
        iconeDa(tester, regra),
        Icons.check_circle_outline,
        reason: 'REPROVA: a lista acusa "$regra" numa senha que o servidor '
            'aceita. Tela mais exigente que o servidor frustra sem motivo.',
      );
    }

    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tocarEmCriarConta(tester);

    expect(
      cadastros,
      hasLength(1),
      reason: 'REPROVA: a tela barrou uma senha que o servidor aceita.',
    );
  });

  testWidgets('ISCA — o estado e ANUNCIADO para leitor de tela',
      (tester) async {
    await abrirCriarConta(tester);
    final handle = tester.ensureSemantics();
    try {
      final dados = tester
          .getSemantics(find.byType(RequisitosDaSenha))
          .getSemanticsData();
      expect(
        dados.flagsCollection.isLiveRegion,
        isTrue,
        reason: 'REPROVA: a lista nao e regiao viva. Quem nao enxerga digita, '
            'a lista muda na tela e o leitor de tela nao diz nada: a '
            'validacao ao vivo existe so para quem ve.',
      );

      await tester.enterText(campoEmail, 'marina@exemplo.com.br');
      await tester.enterText(campoSenha, 'marina1998xyz');
      await tester.pumpAndSettle();

      final rotulo = rotuloAnunciado(tester);
      expect(
        rotulo,
        contains('3 de 4'),
        reason: 'REPROVA: o anuncio nao diz quanto ja esta atendido. '
            'Escrito por extenso de proposito: tres das quatro regras estao '
            'satisfeitas com `marina1998xyz` neste e-mail.',
      );
      expect(
        rotulo.toLowerCase(),
        contains('diferente do seu e-mail e do seu nome'),
        reason: 'REPROVA: o anuncio nao nomeia o que falta. "Um requisito '
            'pendente" nao diz a ninguem o que corrigir.',
      );
      expect(
        rotulo,
        contains('vazamento conhecido'),
        reason: 'REPROVA: quem usa leitor de tela nao ouve que o servidor '
            'confere mais uma coisa, e so quem enxerga fica sabendo.',
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets('ISCA — o anuncio nao se repete a cada caractere',
      (tester) async {
    // Regiao viva que muda de texto a cada tecla faz o TalkBack limpar a fila
    // de fala a cada tecla, e o campo de senha vira inutilizavel para quem nao
    // enxerga. O rotulo e montado dos ESTADOS, entao ele so muda quando um
    // requisito vira.
    await abrirCriarConta(tester);
    final handle = tester.ensureSemantics();
    try {
      await tester.enterText(campoSenha, 'uma frase longa');
      await tester.pumpAndSettle();
      final antes = rotuloAnunciado(tester);

      await tester.enterText(campoSenha, 'uma frase longa!');
      await tester.pumpAndSettle();

      expect(
        rotuloAnunciado(tester),
        antes,
        reason: 'REPROVA: uma tecla que nao virou requisito nenhum mudou o '
            'texto anunciado. O leitor de tela vai interromper a propria fala '
            'a cada caractere da senha.',
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets(
      'ISCA — recusa do servidor por motivo NOVO nao vira "pelo menos 10"',
      (tester) async {
    // A lista de vazamento ainda e uma porta no servidor
    // (`PasswordBreachList`). Quando ela sair, esta versao do app ja estara
    // instalada em aparelho por semanas e vai receber um `code` que nao
    // conhece.
    await abrirCriarConta(tester);
    resposta = () => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://api.exemplo/problems/validation-failed',
            'title': 'Senha fraca',
            'status': 422,
            'errors': <Map<String, dynamic>>[
              <String, dynamic>{
                'field': 'password',
                'code': 'pwned',
                'message': 'Esta senha apareceu em vazamento.',
              },
            ],
          }),
          422,
          headers: <String, String>{'content-type': 'application/problem+json'},
        );

    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tocarEmCriarConta(tester);

    expect(cadastros, hasLength(1));
    expect(
      find.text('A senha precisa de pelo menos 10 caracteres.'),
      findsNothing,
      reason: 'REPROVA: o servidor recusou por vazamento e a tela mandou a '
          'pessoa aumentar uma senha de 23 caracteres. Ela vai acrescentar '
          'caracteres e ser recusada de novo, sem fim.',
    );
    expect(
      find.textContaining('Não conseguimos aceitar esta senha'),
      findsOneWidget,
      reason: 'REPROVA: a recusa ficou muda. Recusa sem texto e '
          'indistinguivel de um botao quebrado.',
    );
  });
}
