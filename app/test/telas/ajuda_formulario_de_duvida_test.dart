/// `Perfil` > `Ajuda` — o item abre a tela, a tela manda a duvida, e a tela
/// **nao afirma o que ela nao pode provar**.
///
/// Pedido do cliente de 29/10/2026, literal: *"no menu do usuario, adicione um
/// botao de ajuda, que abrira uma pagina com um formulario de duvida"*. A
/// decisao de destino, da mesma conversa: **grava no banco e vai para o
/// backoffice, SEM notificacao por e-mail**.
///
/// ## O QUE CADA CASO REPROVA
///
/// - Tire o `ItemDeMenu` de `abas.dart`: reprova `o item Ajuda esta no menu`.
/// - Troque `Rotas.ajuda` por outra rota: reprova `o item abre o formulario`.
/// - Troque o caminho em `ajuda_api.dart`: reprova `o envio chama
///   POST /v1/me/help-requests`.
/// - Troque `Recebemos` por `Enviamos` na tela: reprova `a confirmacao nao
///   afirma envio`.
/// - Volte a prometer resposta: reprova `a tela NAO promete resposta`.
/// - Engula a recusa do servidor: reprova `a recusa do servidor aparece`.
library;

import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/ajuda/tela_de_duvida.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Uma superficie alta o bastante para o menu inteiro ficar deitado.
///
/// 390 x 2600 dp logicos, como em `perfil_ordem_dos_itens_test.dart`. E
/// deliberado e nao conveniencia: `rolarAte` cai no `Scrollable` ERRADO numa
/// tela empilhada sobre a casca de abas (tres estao montados) e estoura
/// `Bad state: No element` apontando para o lugar errado. O que se mede aqui e
/// PRESENCA e ORDEM, nao dobra.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// O item, procurado DENTRO da aba `Perfil`: `ItemDeMenu` com o mesmo rotulo
/// pode existir noutra tela da pilha.
Finder _itemDeAjuda() => find.descendant(
      of: find.byType(AbaPerfil),
      matching: find.widgetWithText(ItemDeMenu, TelaDeDuvida.titulo),
    );

/// Todo texto visivel da arvore montada.
List<String> _textosDaTela(WidgetTester tester) {
  final achados = <String>[];
  for (final w in tester.widgetList<Text>(find.byType(Text))) {
    final t = w.data ?? w.textSpan?.toPlainText();
    if (t != null) achados.add(t);
  }
  return achados;
}

void main() {
  setUp(AppConfig.limparParaTeste);

  /// O que a rota da ajuda recebeu, se e que recebeu.
  late List<http.Request> pedidos;
  late List<String> corpos;

  /// O minimo que a aba `Perfil` pede ao abrir. Sem isto o menu nao monta e
  /// os casos abaixo mediriam uma tela vazia.
  Future<http.Response>? respostaDaConta(http.Request req) {
    if (req.url.path == '/v1/me' && req.method == 'GET') {
      return Future<http.Response>.value(json200(<String, dynamic>{
        'id': 'u-1',
        'email': 'marina@exemplo.com.br',
        'email_verified': true,
        'display_name': 'Marina',
        'pending_profile_fields': <String>[],
        'can_open_lost_case': true,
      }));
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return Future<http.Response>.value(
        json200(<String, dynamic>{'items': <Map<String, dynamic>>[]}),
      );
    }
    return null;
  }

  /// `202` na ajuda, a conta montada, `404` em tudo o mais.
  Future<http.Response> servidorQueAceita(http.Request req) async {
    final daConta = respostaDaConta(req);
    if (daConta != null) return daConta;
    if (req.url.path == '/v1/me/help-requests' && req.method == 'POST') {
      pedidos.add(req);
      corpos.add(req.body);
      return json200(<String, dynamic>{'status': 'accepted'}, status: 202);
    }
    return problema('not-found', 404);
  }

  /// O teto de chamada estourado: dez duvidas por dia por conta, `deny_429`.
  Future<http.Response> servidorQueRecusa(http.Request req) async {
    final daConta = respostaDaConta(req);
    if (daConta != null) return daConta;
    if (req.url.path == '/v1/me/help-requests' && req.method == 'POST') {
      pedidos.add(req);
      return problema('rate-limited', 429);
    }
    return problema('not-found', 404);
  }

  setUp(() {
    pedidos = <http.Request>[];
    corpos = <String>[];
  });

  Future<void> abrirOFormulario(WidgetTester tester) async {
    await irParaAConta(tester);
    await tocar(tester, _itemDeAjuda());
  }

  group('`Perfil` > `Ajuda`', () {
    testWidgets('o item Ajuda esta no menu, acima de Sair da conta', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await irParaAConta(tester);

      expect(
        _itemDeAjuda(),
        findsOneWidget,
        reason: 'REPROVA: nao ha um `ItemDeMenu` de "${TelaDeDuvida.titulo}" no '
            'menu do usuario. O cliente pediu o botao LA, e nao numa gaveta: '
            '"no menu do usuario, adicione um botao de ajuda".',
      );

      final sair = find.descendant(
        of: find.byType(AbaPerfil),
        matching: find.widgetWithText(ItemDeMenu, 'Sair da conta'),
      );
      expect(sair, findsOneWidget);
      expect(
        tester.getTopLeft(_itemDeAjuda()).dy < tester.getTopLeft(sair).dy,
        isTrue,
        reason: 'REPROVA: `${TelaDeDuvida.titulo}` ficou ABAIXO de "Sair da conta". '
            'O cliente foi literal: "o sair da conta deve ser sempre a ultima '
            'opcao do menu", e `exigirSairPorUltimo` reprova qualquer bloco com '
            '`dy` maior que o dela.',
      );
    });

    testWidgets('o item abre o formulario, com os dois campos e nenhum a mais', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);

      // ANCORA: sem ela, uma rota que deixasse de abrir faria a contagem de
      // campos abaixo olhar outra tela e passar sem ter conferido nada.
      expect(
        find.byType(TelaDeDuvida),
        findsOneWidget,
        reason: 'REPROVA: o toque no item nao abriu `TelaDeDuvida`. Ou `Rotas.ajuda` '
            'aponta para outro lugar, ou a `GoRoute` nao existe.',
      );

      expect(
        find.byType(BichuField),
        findsNWidgets(2),
        reason: 'REPROVA: o formulario nao tem exatamente DOIS campos. Nao se '
            'coleta nome, e-mail nem telefone aqui: esta tela so existe logado, '
            'o autor sai da sessao, e um campo de contato seria um dado que a '
            'pessoa digita, o servidor grava e ninguem confere.',
      );
      expect(find.widgetWithText(BichuField, 'Assunto'), findsOneWidget);
      expect(find.widgetWithText(BichuField, 'Sua dúvida'), findsOneWidget);
    });

    testWidgets('o envio chama POST /v1/me/help-requests com os dois campos', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);

      await tester.enterText(
        find.widgetWithText(BichuField, 'Assunto'),
        'Não salva o segundo pet',
      );
      await tester.enterText(
        find.widgetWithText(BichuField, 'Sua dúvida'),
        'A tela volta para o começo.',
      );
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));

      expect(
        pedidos.length,
        1,
        reason: 'REPROVA: o toque em `Enviar dúvida` nao chamou '
            '`POST /v1/me/help-requests`. Uma tela que mostra a confirmacao sem '
            'chamar a rota e o pior desfecho desta funcionalidade: o tutor espera '
            'resposta e a fila do painel esta vazia.',
      );
      expect(corpos.single, contains('"subject":"Não salva o segundo pet"'));
      expect(corpos.single, contains('"body":"A tela volta para o começo."'));
      expect(
        corpos.single.contains('email'),
        isFalse,
        reason: 'REPROVA: o corpo carrega um campo de contato. O corpo e fechado '
            'no servidor (`additionalProperties: false` mais '
            '`recusarCampoDesconhecido`), entao isto seria 400 -- e o autor ja '
            'sai do `Bearer`.',
      );
    });

    testWidgets('a confirmacao nao afirma envio que o app nao consegue provar', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);
      await tester.enterText(find.widgetWithText(BichuField, 'Assunto'), 'Pergunta minha');
      await tester.enterText(find.widgetWithText(BichuField, 'Sua dúvida'), 'Texto da pergunta.');
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));

      // ANCORA primeiro: sem ela a varredura abaixo passaria olhando a tela do
      // formulario, onde nenhuma das palavras aparece mesmo.
      expect(
        find.text('Recebemos sua dúvida'),
        findsOneWidget,
        reason: 'REPROVA: a tela de sucesso nao apareceu depois do 202.',
      );

      final afirmacoes = _textosDaTela(tester)
          .where((t) => RegExp('enviamos|mandamos|enviad', caseSensitive: false).hasMatch(t))
          .toList();
      expect(
        afirmacoes,
        isEmpty,
        reason: 'REPROVA: a tela afirma envio. O `202` prova que o servidor ACEITOU '
            'e gravou, e nao prova entrega a ninguem -- e, por decisao do cliente, '
            'NADA e enviado: a duvida espera numa fila que uma pessoa abre. '
            'Achado: $afirmacoes',
      );
    });

    testWidgets('a tela NAO promete resposta, em nenhum dos dois textos', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);

      // ANCORA: sem ela a varredura passaria olhando uma tela que nao abriu.
      expect(find.byType(TelaDeDuvida), findsOneWidget);

      // A PROMESSA que caiu em 30/10/2026. A tela dizia, nos DOIS textos, "a
      // gente responde pelo e-mail da sua conta" -- e o produto nao cumpre: a
      // fila do painel nao projeta nome nem e-mail do autor, e o cliente
      // decidiu que ela serve para ele LER, e nada mais.
      //
      // `respond` pega "responde", "responderemos" e "resposta"; `retorn` pega
      // "retornamos" e "retorno", que seria a mesma promessa com outra palavra.
      final promessa = RegExp('respond|respost|retorn', caseSensitive: false);

      final noFormulario = _textosDaTela(tester).where((t) => promessa.hasMatch(t)).toList();
      expect(
        noFormulario,
        isEmpty,
        reason: 'REPROVA: o formulario promete resposta. Achado: $noFormulario',
      );

      await tester.enterText(find.widgetWithText(BichuField, 'Assunto'), 'Assunto');
      await tester.enterText(find.widgetWithText(BichuField, 'Sua dúvida'), 'Dúvida.');
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));
      expect(find.text('Recebemos sua dúvida'), findsOneWidget);

      final noRecebido = _textosDaTela(tester).where((t) => promessa.hasMatch(t)).toList();
      expect(
        noRecebido,
        isEmpty,
        reason: 'REPROVA: a tela de recebido promete resposta. O produto nao cumpre: '
            'a fila do painel nao projeta nome nem e-mail do autor, e o cliente '
            'decidiu em 30/10/2026 que ela serve para ele LER. Achado: $noRecebido',
      );
    });

    testWidgets('a tela NAO promete prazo', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);
      await tester.enterText(find.widgetWithText(BichuField, 'Assunto'), 'Assunto');
      await tester.enterText(find.widgetWithText(BichuField, 'Sua dúvida'), 'Dúvida.');
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));
      expect(find.text('Recebemos sua dúvida'), findsOneWidget);

      // Prazo prometido por uma tela e prazo que ninguem do outro lado
      // assinou. "em ate 3 dias" seria a promessa de cima com um numero.
      final prazo = RegExp('em até|em ate|dias úteis|dias uteis|horas|prazo', caseSensitive: false);
      final achados = _textosDaTela(tester).where((t) => prazo.hasMatch(t)).toList();
      expect(achados, isEmpty, reason: 'REPROVA: a tela promete prazo. Achado: $achados');
    });

    testWidgets('a recusa do servidor aparece, e a tela nao vai para o sucesso', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueRecusa, deposito: depositoLogado());
      await abrirOFormulario(tester);
      await tester.enterText(find.widgetWithText(BichuField, 'Assunto'), 'Pergunta minha');
      await tester.enterText(find.widgetWithText(BichuField, 'Sua dúvida'), 'Texto da pergunta.');
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));

      expect(
        find.text('Recebemos sua dúvida'),
        findsNothing,
        reason: 'REPROVA: a tela mostrou a confirmacao depois de um 429. Engolir a '
            'recusa e exatamente o defeito que o cliente nao ve e o tutor paga: '
            'ele sai acreditando que perguntou.',
      );
      expect(
        find.byType(BichuField),
        findsNWidgets(2),
        reason: 'REPROVA: o formulario sumiu depois da recusa. O que foi escrito '
            'tem de continuar na tela -- se a rota falhou, nada foi perdido.',
      );
      expect(
        find.text('Pergunta minha'),
        findsOneWidget,
        reason: 'REPROVA: a recusa levou o texto do tutor junto.',
      );
    });

    testWidgets('campo vazio e recusado ANTES da viagem, nos dois campos de uma vez', (tester) async {
      _superficieAlta(tester);
      await abrirOApp(tester, rede: servidorQueAceita, deposito: depositoLogado());
      await abrirOFormulario(tester);
      // So espacos: tem comprimento, e aparado nao e nada. Uma conferencia de
      // `isEmpty` sobre o texto cru deixaria isto passar, e o servidor
      // responderia 400 depois de uma viagem.
      await tester.enterText(find.widgetWithText(BichuField, 'Assunto'), '   ');
      await tester.pumpAndSettle();
      await tocar(tester, find.widgetWithText(FilledButton, 'Enviar dúvida'));

      expect(
        pedidos,
        isEmpty,
        reason: 'REPROVA: a tela chamou a rota com os campos vazios.',
      );
      expect(find.text('Escreva um assunto.'), findsOneWidget);
      expect(
        find.text('Escreva a sua dúvida.'),
        findsOneWidget,
        reason: 'REPROVA: so um dos dois erros apareceu. Mostrar um de cada vez faz '
            'a pessoa corrigir, tocar em enviar e so entao descobrir o segundo.',
      );
    });
  });
}
