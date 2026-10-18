import 'package:bichu/api/api_client.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/api/modelos_seguranca.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/telas/seguranca/folha_de_denuncia.dart';
import 'package:bichu/telas/seguranca/menu_do_perfil.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// O "⋮" DA BARRA DO PERFIL: um toque para achar, e **no mesmo lugar em todos
/// os estados — inclusive no de bloqueado**.
///
/// ## O caso que mais importa
///
/// **O menu não desaparece quando a pessoa já foi bloqueada.** Um menu que
/// sumisse nesse estado deixaria sem saída justamente quem já agiu uma vez: não
/// haveria como desbloquear e não haveria como denunciar. Ele troca o rótulo,
/// e só.
///
/// ## O `404` é ambíguo de propósito, e a tela não tenta desfazer a ambiguidade
///
/// Pessoa inexistente, conta desabilitada e **a outra pessoa tendo bloqueado
/// quem está olhando** têm o mesmo corpo e o mesmo código. Descobrir que foi
/// bloqueado é o que gera retaliação, então a tela chama `aoPerderOAlvo` nos
/// três e diz a mesma coisa.
const String refDeTeste = 'MNwRiDONS3eWNrR8spLFAQ';

/// O cliente de teste. `respostas` diz o que cada caminho devolve.
SegurancaApi apiQue(
  Map<String, int> respostas, {
  List<String>? chamadas,
}) {
  final cliente = MockClient((http.Request pedido) async {
    chamadas?.add('${pedido.method} ${pedido.url.path}');
    final status = respostas[pedido.url.path] ?? 204;
    if (status == 404) {
      return http.Response(
        '{"type":"https://dominio-a-definir.com.br/problems/not-found",'
        '"title":"Nao encontrado","status":404}',
        404,
        headers: <String, String>{'content-type': 'application/problem+json'},
      );
    }
    if (status == 202) {
      return http.Response(
        '{"status":"accepted"}',
        202,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    return http.Response('', 204);
  });
  AppConfig.limparParaTeste();
  return SegurancaApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
      cliente: cliente,
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

Future<void> montar(
  WidgetTester tester, {
  required SegurancaApi api,
  bool bloqueada = false,
  bool jaDenunciada = false,
  ValueChanged<bool>? aoMudarOBloqueio,
  VoidCallback? aoPerderOAlvo,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        appBar: AppBar(
          title: const Text('Perfil'),
          actions: <Widget>[
            MenuDoPerfil(
              refDaPessoa: refDeTeste,
              api: api,
              bloqueada: bloqueada,
              jaDenunciada: jaDenunciada,
              aoMudarOBloqueio: aoMudarOBloqueio,
              aoPerderOAlvo: aoPerderOAlvo,
            ),
          ],
        ),
        body: const SizedBox.shrink(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  group('o "⋮" está em todos os estados', () {
    testWidgets('UM TOQUE para achar: o ícone está na barra', (tester) async {
      await montar(tester, api: apiQue(<String, int>{}));
      expect(find.byIcon(Icons.more_vert), findsOneWidget);
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      // Dois itens, e os dois no mesmo toque: denunciar e bloquear.
      expect(find.text('Denunciar este perfil'), findsOneWidget);
      expect(find.text('Bloquear'), findsOneWidget);
    });

    testWidgets('O CASO QUE IMPORTA: no estado BLOQUEADO o menu continua lá', (tester) async {
      await montar(tester, api: apiQue(<String, int>{}), bloqueada: true);
      expect(
        find.byIcon(Icons.more_vert),
        findsOneWidget,
        reason: 'o "⋮" sumiu no estado de bloqueado: quem já agiu uma vez ficou sem saída',
      );
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      // Troca o rótulo, e não o lugar.
      expect(find.text('Desbloquear'), findsOneWidget);
      expect(find.text('Bloquear'), findsNothing);
      // E denunciar continua oferecido: bloquear não substitui denunciar.
      expect(find.text('Denunciar este perfil'), findsOneWidget);
    });

    testWidgets('depois de denunciar: "Denúncia enviada", DESABILITADO', (tester) async {
      await montar(tester, api: apiQue(<String, int>{}), jaDenunciada: true);
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      expect(find.text(denunciaJaEnviada), findsOneWidget);
      expect(find.text('Denunciar este perfil'), findsNothing);

      // DESABILITADO, e a prova é de COMPORTAMENTO e não do campo `enabled`:
      // tocar nele não abre a folha. É isso que impede a mesma pessoa de
      // denunciar cinco vezes, e o campo é só o jeito de chegar lá.
      await tester.tap(find.text(denunciaJaEnviada));
      await tester.pumpAndSettle();
      expect(
        find.byType(FolhaDeDenuncia),
        findsNothing,
        reason: 'o item desabilitado abriu a folha: quem já denunciou pode denunciar de novo',
      );
      // E o menu não fechou: item desabilitado não responde ao toque.
      expect(find.text(denunciaJaEnviada), findsOneWidget);
    });
  });

  group('bloquear e desbloquear', () {
    testWidgets('bloquear chama a rota e avisa a tela', (tester) async {
      final chamadas = <String>[];
      final mudou = <bool>[];
      await montar(
        tester,
        api: apiQue(<String, int>{}, chamadas: chamadas),
        aoMudarOBloqueio: mudou.add,
      );
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bloquear'));
      await tester.pumpAndSettle();

      expect(chamadas, <String>['POST /v1/users/$refDeTeste/blocks']);
      expect(mudou, <bool>[true]);
    });

    testWidgets('desbloquear usa DELETE na mesma rota', (tester) async {
      final chamadas = <String>[];
      await montar(
        tester,
        api: apiQue(<String, int>{}, chamadas: chamadas),
        bloqueada: true,
      );
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Desbloquear'));
      await tester.pumpAndSettle();
      expect(chamadas, <String>['DELETE /v1/users/$refDeTeste/blocks']);
    });

    testWidgets('o 404 leva a tela a perder o alvo, sem dizer por quê', (tester) async {
      // A tela NÃO sabe se foi "não existe", "conta desabilitada" ou "a outra
      // pessoa me bloqueou", e não pode saber.
      var perdeu = 0;
      await montar(
        tester,
        api: apiQue(<String, int>{'/v1/users/$refDeTeste/blocks': 404}),
        aoPerderOAlvo: () => perdeu++,
      );
      await tester.tap(find.byIcon(Icons.more_vert));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bloquear'));
      await tester.pumpAndSettle();
      expect(perdeu, 1);
    });
  });
}
