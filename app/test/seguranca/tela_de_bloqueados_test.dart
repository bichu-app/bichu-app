import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/telas/seguranca/tela_de_bloqueados.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// **PESSOAS BLOQUEADAS** — as iscas da tela.
///
/// Decisão do cliente, 19/10/2026: *uma lista de quem você bloqueou, na gaveta
/// do Perfil, e o desbloqueio acontece ali*. Ela existe porque o bloqueio é
/// **simétrico** no servidor, e a simetria fechava com `404` o perfil da pessoa
/// bloqueada — onde o "Desbloquear" morava. **Bloquear era irreversível pelo
/// aplicativo.**
///
/// ## As três iscas deste arquivo
///
/// - **(a)** a tela pergunta `GET /v1/me/blocks`, que é a leitura
///   **assimétrica**: ela traz quem eu bloqueei e não traz quem me bloqueou.
///   O endereço é parte da isca — uma leitura por par (`/users/{ref}/blocks`)
///   responderia a pergunta do oráculo;
/// - **(b)** o botão da linha chama `DELETE /v1/users/{ref}/blocks` — a MESMA
///   operação que o `MenuDoPerfil` já chamava — e **recarrega**: a pessoa sai
///   da lista porque o servidor deixou de mandá-la, e não porque a tela a
///   apagou localmente;
/// - **(c)** a linha pinta o que foi decidido e **nada mais**: nenhuma foto
///   (emenda 3 do ADR-0010 liberou a foto só entre conexões aceitas, e
///   bloqueado é o oposto disso) e nenhuma contagem.
const String refDeBruno = 'MNwRiDONS3eWNrR8spLFAQ';
const String refDeAnonima = 'ZZwRiDONS3eWNrR8spLFAZ';

/// Uma pessoa como o contrato (`BlockedPerson`) a manda.
Map<String, dynamic> linha({
  required String publicRef,
  String? handle,
  String? displayName,
  String blockedAt = '2026-10-17T22:13:00.000Z',
}) {
  return <String, dynamic>{
    'public_ref': publicRef,
    'handle': handle,
    'display_name': displayName,
    'blocked_at': blockedAt,
  };
}

/// O servidor de teste. [paginas] é a sequência de respostas de `GET`, uma por
/// chamada: é ela que deixa o caso (b) ver a lista **depois** do desbloqueio.
SegurancaApi apiQue(
  List<List<Map<String, dynamic>>> paginas, {
  required List<String> chamadas,
  bool falhaNoDelete = false,
}) {
  var vez = 0;
  final cliente = MockClient((http.Request pedido) async {
    chamadas.add('${pedido.method} ${pedido.url.path}');
    if (pedido.method == 'GET') {
      final itens = paginas[vez < paginas.length ? vez : paginas.length - 1];
      vez += 1;
      return http.Response(
        jsonEncode(<String, dynamic>{
          'items': itens,
          'total': itens.length,
          'page': 1,
          'limit': 20,
        }),
        200,
        headers: <String, String>{'content-type': 'application/json'},
      );
    }
    if (falhaNoDelete) {
      return http.Response(
        '{"type":"https://dominio-a-definir.com.br/problems/not-found",'
        '"title":"Nao encontrado","status":404}',
        404,
        headers: <String, String>{'content-type': 'application/problem+json'},
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

Future<void> montar(WidgetTester tester, SegurancaApi api) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: TelaDeBloqueados(seguranca: api),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets(
    'ISCA (a): a tela pergunta `GET /me/blocks`, que e a leitura ASSIMETRICA',
    (tester) async {
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          <Map<String, dynamic>>[
            linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
          ],
        ], chamadas: chamadas),
      );

      // O ENDERECO E A ISCA. `/v1/me/blocks` tem UM sujeito possivel: quem
      // chama. Uma leitura por par -- `/v1/users/{ref}/blocks` em `GET` --
      // responderia "esta pessoa me bloqueou?", que e o oraculo que o resto
      // desta fatia gasta linhas para nao dizer.
      expect(
        chamadas,
        <String>['GET /v1/me/blocks'],
        reason:
            'REPROVA: a tela chamou $chamadas. A unica leitura de bloqueio do '
            'contrato e `GET /v1/me/blocks`, e ela e assimetrica de proposito: '
            'traz quem EU bloqueei e nao traz quem me bloqueou.',
      );
      expect(find.text('Bruno'), findsOneWidget);
      expect(find.text('@bruno-vizinho'), findsOneWidget);
    },
  );

  testWidgets(
    'ISCA (b): o botao da linha chama `DELETE /users/{ref}/blocks` e a pessoa '
    'SAI da lista',
    (tester) async {
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          // primeira leitura: Bruno esta bloqueado
          <Map<String, dynamic>>[
            linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
          ],
          // depois do desbloqueio: o servidor deixa de manda-lo
          <Map<String, dynamic>>[],
        ], chamadas: chamadas),
      );
      expect(find.text('Bruno'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, TelaDeBloqueados.desbloquear));
      await tester.pumpAndSettle();

      // A OPERACAO E A QUE JA EXISTIA, e o endereco e o `public_ref` da linha:
      // e a MESMA chamada que o `MenuDoPerfil` fazia do perfil que o bloqueio
      // fechou. Nada de rota nova para desbloquear.
      expect(
        chamadas,
        <String>[
          'GET /v1/me/blocks',
          'DELETE /v1/users/$refDeBruno/blocks',
          'GET /v1/me/blocks',
        ],
        reason:
            'REPROVA: a sequencia foi $chamadas. O botao desbloqueia pela '
            'operacao que ja existe e RECARREGA: tirar a linha localmente faria '
            'a tela afirmar o estado do servidor sem ter perguntado.',
      );
      expect(
        find.text('Bruno'),
        findsNothing,
        reason: 'REPROVA: Bruno ficou na lista depois de o servidor parar de manda-lo.',
      );
      expect(find.text(TelaDeBloqueados.vazio), findsOneWidget);
    },
  );

  testWidgets(
    'ISCA (b): `404` no desbloqueio NAO tira a linha, e a tela diz que falhou',
    (tester) async {
      // Linha que sai com a chamada falhando e a pessoa achando que
      // desbloqueou. O `404` aqui e ambiguo de proposito (pessoa inexistente,
      // conta desabilitada, bloqueio que ja nao existe) e a tela nao tenta
      // desfazer a ambiguidade.
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          <Map<String, dynamic>>[
            linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
          ],
        ], chamadas: chamadas, falhaNoDelete: true),
      );
      await tester.tap(find.widgetWithText(FilledButton, TelaDeBloqueados.desbloquear));
      await tester.pumpAndSettle();

      expect(find.text('Bruno'), findsOneWidget);
      expect(find.text(TelaDeBloqueados.falhaAoDesbloquear), findsOneWidget);
      expect(
        chamadas.where((c) => c.startsWith('GET')).length,
        1,
        reason: 'REPROVA: a tela recarregou depois de uma falha, e nada mudou para recarregar.',
      );
    },
  );

  testWidgets(
    'ISCA (c): a linha NAO pinta foto, e nao ha imagem de rede na tela',
    (tester) async {
      // A emenda 3 do ADR-0010 (19/10/2026) liberou a foto de perfil em UMA
      // superficie -- o participante da conversa mediada -- e **so entre
      // conexoes aceitas**. Bloqueado e o oposto de conexao aceita.
      //
      // A varredura e por TIPO DE WIDGET e nao por texto: `ImagemDaRede` e o
      // unico caminho de imagem desta casa, e `Image` pega quem contornar.
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          <Map<String, dynamic>>[
            linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
          ],
        ], chamadas: chamadas),
      );
      // CONTRAPESO: a linha EXISTE. Sem ele, as duas varreduras abaixo
      // passariam numa tela vazia.
      expect(find.text('Bruno'), findsOneWidget);
      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason:
            'REPROVA: a lista de bloqueados pinta a foto de uma pessoa '
            'bloqueada para quem a bloqueou. A emenda 3 do ADR-0010 liberou a '
            'foto SO entre conexoes aceitas.',
      );
      expect(find.byType(Image), findsNothing);
      expect(find.byType(CircleAvatar), findsNothing);
    },
  );

  testWidgets(
    'ISCA (c): a linha mostra QUATRO coisas, e nenhuma contagem',
    (tester) async {
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          <Map<String, dynamic>>[
            linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
          ],
        ], chamadas: chamadas),
      );

      // O que a linha DIZ: nome, apelido, data do MEU ato e o botao.
      expect(find.text('Bruno'), findsOneWidget);
      expect(find.text('@bruno-vizinho'), findsOneWidget);
      expect(find.text('Bloqueada em 17/10/2026'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, TelaDeBloqueados.desbloquear), findsOneWidget);

      // O `public_ref` NAO e pintado: ele e endereco de chamada, nao texto de
      // tela, e 22 simbolos opacos na tela nao dizem nada a ninguem.
      expect(find.textContaining(refDeBruno), findsNothing);

      // E NAO HA CAMINHO PARA O PERFIL: o perfil de uma pessoa bloqueada
      // responde 404 enquanto o bloqueio existir, e um toque que levasse a um
      // 404 seria um caminho que promete e nao entrega.
      // A UNICA area tocavel da linha e o botao. Medido: `FilledButton` leva
      // um `InkWell` por dentro, entao o numero certo nao e zero -- e um, E
      // DENTRO do botao. Um `InkWell` solto seria o nome virando porta.
      expect(find.byType(InkWell), findsOneWidget);
      expect(
        find.descendant(of: find.byType(FilledButton), matching: find.byType(InkWell)),
        findsOneWidget,
        reason:
            'REPROVA: a linha ganhou area tocavel FORA do botao. O nome nao e '
            'porta para nada: o perfil de quem esta bloqueado responde 404 '
            'enquanto o bloqueio existir, e um toque que levasse a um 404 '
            'seria um caminho que promete e nao entrega.',
      );

    },
  );

  testWidgets(
    'quem nao tem apelido NEM nome aparece, e a linha nao desaparece',
    (tester) async {
      // Omitir a linha de quem nao tem nome a deixaria bloqueada para sempre,
      // que e exatamente o defeito que esta tela conserta. O texto de queda e
      // de TELA e nao de servidor.
      final chamadas = <String>[];
      await montar(
        tester,
        apiQue(<List<Map<String, dynamic>>>[
          <Map<String, dynamic>>[linha(publicRef: refDeAnonima)],
        ], chamadas: chamadas),
      );
      expect(find.text('Pessoa sem nome'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, TelaDeBloqueados.desbloquear), findsOneWidget);
    },
  );

  testWidgets('com apelido e SEM nome, a primeira linha e `@apelido` e ela nao repete', (
    tester,
  ) async {
    final chamadas = <String>[];
    await montar(
      tester,
      apiQue(<List<Map<String, dynamic>>>[
        <Map<String, dynamic>>[linha(publicRef: refDeBruno, handle: 'bruno-vizinho')],
      ], chamadas: chamadas),
    );
    expect(find.text('@bruno-vizinho'), findsOneWidget);
  });

  testWidgets('a lista VAZIA diz que ninguem foi bloqueado, e explica o caminho', (
    tester,
  ) async {
    final chamadas = <String>[];
    await montar(
      tester,
      apiQue(<List<Map<String, dynamic>>>[<Map<String, dynamic>>[]], chamadas: chamadas),
    );
    expect(find.text(TelaDeBloqueados.vazio), findsOneWidget);
    expect(find.text(TelaDeBloqueados.explicacaoDoVazio), findsOneWidget);
    // E NAO diz o que o desbloqueio nao faz: nao ha o que desbloquear.
    expect(find.text(TelaDeBloqueados.oQueODesbloqueioNaoFaz), findsNothing);
  });

  testWidgets('a tela DIZ que desbloquear nao devolve a conexao', (tester) async {
    // O servidor e explicito: *"desbloquear nao devolve nada do que o bloqueio
    // desfez"*. Sem esta frase, quem desbloqueia espera a conexao de volta e le
    // a ausencia dela como defeito.
    final chamadas = <String>[];
    await montar(
      tester,
      apiQue(<List<Map<String, dynamic>>>[
        <Map<String, dynamic>>[
          linha(publicRef: refDeBruno, handle: 'bruno-vizinho', displayName: 'Bruno'),
        ],
      ], chamadas: chamadas),
    );
    expect(find.text(TelaDeBloqueados.oQueODesbloqueioNaoFaz), findsOneWidget);
  });
}
