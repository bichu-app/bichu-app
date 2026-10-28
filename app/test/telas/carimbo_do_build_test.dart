// A ISCA DO CARIMBO DE BUILD (26/10/2026).
//
// ---------------------------------------------------------------------------
// O QUE ELA PRENDE, e por que ela existe
// ---------------------------------------------------------------------------
// Ate 26/10/2026 nada no aplicativo dizia QUAL build estava no aparelho.
// Medido nesta arvore, na base `d590ce2a`: `GIT_SHA`, `GIT_COMMIT`,
// `BUILD_SHA` e `COMMIT_SHA` davam ZERO ocorrencias em `app/lib`, e
// `APP_VERSION` era `1.0.0` em todo build. O preco disso nao foi um defeito de
// codigo: foi o cliente dizer DUAS vezes que coisas prontas nao chegaram ao
// aparelho dele, sem ninguem conseguir provar nem o contrario nem o a favor.
//
// Um carimbo que pode sumir sem ninguem notar nao resolve isso -- ele so move
// a incerteza um passo para tras. Entao sao DOIS fatos presos aqui, em casos
// SEPARADOS, porque sao duas formas distintas de o carimbo falhar:
//
//   (A) ele DESAPARECEU da tela;
//   (B) ele esta na tela e veio VAZIO -- rodape em branco e indistinguivel
//       de rodape que sumiu, para quem olha o aparelho.
//
// ---------------------------------------------------------------------------
// POR QUE O CASO (A) ANCORA NO WIDGET, e nao no texto
// ---------------------------------------------------------------------------
// `find.text('Versão 1.0.0 ...')` reprovaria no dia em que o rotulo mudasse,
// e ficaria VERDE no dia em que o carimbo saisse e outra coisa escrevesse a
// mesma palavra. A ancora e `CarimboDoBuild.chave`, que e a identidade do
// rodape e nao o conteudo dele.
//
// ---------------------------------------------------------------------------
// POR QUE (B) E MEDIDO EM DOIS LUGARES
// ---------------------------------------------------------------------------
// Em teste de widget NAO HA `--dart-define`: `abrirOApp` chama
// `AppConfig.carregar(apiBaseUrlDeTeste: ...)` e tanto `APP_VERSION` quanto
// `BUILD_COMMIT` chegam nulos. Isso e sorte, nao limitacao: a tela montada
// pela suite E o caso do build que nao declarou nada, que e justamente o pior
// caso de (B). Ele e medido ali, na arvore de verdade. O caso COM valor e
// medido em [CarimboDoBuild.textoDe] e em `AppConfig.commitCurtoDoBuild`, que
// sao puros e aceitam o valor direto.
//
// ---------------------------------------------------------------------------
// A PROVA NEGATIVA
// ---------------------------------------------------------------------------
// O grupo final monta uma arvore SEM o carimbo e exercita a MESMA afirmacao do
// caso (A), exigindo que ela nao encontre nada. Sem isso, "o carimbo esta na
// tela" poderia estar passando por um finder que casa com qualquer coisa.

import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/abas.dart';
import 'package:bichu/widgets/carimbo_do_build.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// O commit de 40 digitos da base deste trabalho. Serve de valor de entrada
/// para as funcoes puras: um valor real, e nao `'abc'`, porque o recorte de
/// dez digitos so e exercitado por uma cadeia que de fato seja mais longa.
const String _commitDeQuarenta = 'd590ce2a7362b81e66a7d47154284df718f43ad9';

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        petDoContrato(id: _idDoPet, nome: 'Nina'),
      ],
    });
  }
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  return problema('not-found', 404);
}

/// A superficie ALTA, pelo mesmo motivo de `perfil_ordem_dos_itens_test.dart`:
/// o `ListView` so constroi o que cabe, e o carimbo e o ULTIMO filho da
/// pagina. Numa tela de telefone ele ficaria fora da arvore e o caso (A)
/// reprovaria por um motivo que nao e o dele.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Finder _naAba(Finder alvo) =>
    find.descendant(of: find.byType(AbaPerfil), matching: alvo);

/// A AFIRMACAO (A), numa funcao, para a prova negativa poder exercita-la.
///
/// Devolve o texto que o carimbo pintou, para o caso (B) medir sem repetir a
/// busca.
String exigirCarimboNaTela(
  WidgetTester tester, {
  required Finder Function(Finder) dentro,
}) {
  final carimbo = dentro(find.byKey(CarimboDoBuild.chave));
  expect(
    carimbo,
    findsOneWidget,
    reason: 'REPROVA: o carimbo de build NAO esta na tela inicial do '
        '`Perfil`. Sem ele o aplicativo volta a nao poder dizer qual build '
        'esta no aparelho -- que e o estado de 26/10/2026, em que o cliente '
        'relatou duas vezes que trabalho pronto "nao chegou" e nao havia como '
        'saber se o APK dele continha aquele trabalho. O lugar e o pe de '
        '`AbaPerfil`, em `app/lib/telas/abas.dart`.',
  );
  final textos = dentro(
    find.descendant(
      of: find.byKey(CarimboDoBuild.chave),
      matching: find.byType(Text),
    ),
  );
  expect(
    textos,
    findsOneWidget,
    reason: 'REPROVA: o carimbo esta na arvore mas nao pinta um `Text`. '
        'Rodape que nao escreve nada e rodape que nao existe para quem olha '
        'o aparelho.',
  );
  return (textos.evaluate().single.widget as Text).data ?? '';
}

void main() {
  group('(A) o carimbo esta na tela inicial do `Perfil`', () {
    testWidgets('a chave do rodape e encontravel dentro de `AbaPerfil`',
        (tester) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidor,
        deposito: depositoLogado(),
      );
      await irParaAConta(tester);

      final texto = exigirCarimboNaTela(tester, dentro: _naAba);

      // (B) NO MESMO MONTE: o texto pintado nao e vazio nem so espaco.
      expect(
        texto.trim(),
        isNotEmpty,
        reason: 'REPROVA: o carimbo esta na tela e veio VAZIO. Em teste de '
            'widget nao ha `--dart-define`, entao este monte E o caso do '
            'build que nao declarou nada -- e e exatamente nele que o carimbo '
            'tem de DIZER que nao sabe, em vez de ficar em branco. '
            '`CarimboDoBuild.semCommit` existe para isso.',
      );
    });
  });

  group('(B) o carimbo nunca vem vazio', () {
    testWidgets('sem define nenhum, ele escreve que o build nao declarou',
        (tester) async {
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: _servidor,
        deposito: depositoLogado(),
      );
      await irParaAConta(tester);

      final texto = exigirCarimboNaTela(tester, dentro: _naAba);
      expect(
        texto,
        contains(CarimboDoBuild.semCommit),
        reason: 'REPROVA: sem `--dart-define=BUILD_COMMIT` o carimbo nao diz '
            '"${CarimboDoBuild.semCommit}". Trocar a ausencia por branco, por '
            'um tracinho ou por `null` devolve a tela ao estado em que nao da '
            'para distinguir "este build nao se identificou" de "o carimbo '
            'sumiu".',
      );
    });

    test('`textoDe` com nulo e com vazio nao devolve cadeia vazia', () {
      for (final String? ausente in <String?>[null, '', '   ']) {
        final t = CarimboDoBuild.textoDe(versao: ausente, commit: ausente);
        expect(
          t.trim(),
          isNotEmpty,
          reason: 'REPROVA: `textoDe` devolveu vazio para '
              '${ausente == null ? 'null' : '"$ausente"'}.',
        );
        expect(t, contains(CarimboDoBuild.semCommit));
        expect(t, contains(CarimboDoBuild.semVersao));
      }
    });

    test('`textoDe` com valor mostra o valor', () {
      final t = CarimboDoBuild.textoDe(
        versao: '1.0.0',
        commit: 'd590ce2a73',
      );
      expect(
        t,
        contains('d590ce2a73'),
        reason: 'REPROVA: o commit nao aparece no texto do carimbo. E o unico '
            'dado que o cliente precisa conseguir ler e repetir.',
      );
      expect(t, contains('1.0.0'));
      expect(t, isNot(contains(CarimboDoBuild.semCommit)));
    });
  });

  group('o commit CURTO sai do valor longo', () {
    tearDown(AppConfig.limparParaTeste);

    test('quarenta digitos viram os dez primeiros', () {
      AppConfig.limparParaTeste();
      final config = AppConfig.carregar(
        apiBaseUrlDeTeste: 'https://hml.exemplo.test',
        commitDoBuildDeTeste: _commitDeQuarenta,
      );
      expect(config.commitDoBuild, _commitDeQuarenta);
      expect(config.commitCurtoDoBuild, 'd590ce2a73');
      expect(config.commitCurtoDoBuild, hasLength(10));
      expect(
        _commitDeQuarenta.startsWith(config.commitCurtoDoBuild!),
        isTrue,
        reason: 'REPROVA: o curto nao e PREFIXO do longo. Um carimbo que '
            'mostre pedaco do meio nao da para conferir contra `git log`.',
      );
    });

    test('valor mais curto que dez volta inteiro, e nao estoura', () {
      AppConfig.limparParaTeste();
      final config = AppConfig.carregar(
        apiBaseUrlDeTeste: 'https://hml.exemplo.test',
        commitDoBuildDeTeste: 'd590ce2a',
      );
      expect(config.commitCurtoDoBuild, 'd590ce2a');
    });

    test('ausente vira nulo, e nao cadeia vazia', () {
      AppConfig.limparParaTeste();
      final config = AppConfig.carregar(
        apiBaseUrlDeTeste: 'https://hml.exemplo.test',
        commitDoBuildDeTeste: '   ',
      );
      expect(config.commitDoBuild, isNull);
      expect(config.commitCurtoDoBuild, isNull);
    });
  });

  group('PROVA NEGATIVA: a afirmacao (A) reprova quando o carimbo nao esta',
      () {
    testWidgets('numa arvore sem o rodape, o finder nao encontra nada',
        (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(body: Text('uma tela qualquer, sem carimbo')),
        ),
      );

      expect(
        find.byKey(CarimboDoBuild.chave),
        findsNothing,
        reason: 'REPROVA: o finder do carimbo achou algo numa arvore que nao '
            'tem carimbo. Entao ele casa com qualquer coisa, e o caso (A) '
            'estaria verde sem conferir nada.',
      );
    });
  });
}
