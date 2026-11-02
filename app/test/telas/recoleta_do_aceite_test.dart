import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/termos_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conta/portao_de_aceite_dos_termos.dart';
import 'package:bichu/telas/conta/tela_de_aceite_dos_termos.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// A RECOLETA DO ACEITE DOS TERMOS: quem e pedido, quem nao e, e o que e
/// gravado.
///
/// ## O defeito medido, e por que ele precisa de um mecanismo
///
/// Medido em 01/11/2026. O APK distribuido registrava aceite de `2026-09-17`, e
/// essa data **nao e de nenhum texto legal** -- e a dos primeiros ADRs. O texto
/// publicado e versao 0.3 de 23/09/2026. Havia consentimento gravado apontando
/// para um documento que nunca esteve no ar.
///
/// E, no banco local, 37 registros de aceite: **1** com a data antiga e **36
/// NULOS** -- consentimento sem versao nenhuma, que e pior que versao errada.
///
/// O PR #142 consertou o futuro (fonte unica + portao). O que falta, e o que
/// este arquivo cobra, e **pedir o aceite de novo a quem ja tem conta**.
///
/// ## A regra que os casos guardam
///
/// > O pedido aparece quando, e **somente** quando: o interruptor esta ligado,
/// > ha sessao, este binario sabe qual versao exige, o servidor respondeu, e a
/// > versao registrada nao e a exigida. E o aceite que sai daqui carrega
/// > **sempre** a versao.
///
/// Os dois lados importam. Sem o controle POSITIVO (conta em dia nao e
/// incomodada) um portao que pedisse a todo mundo passaria; sem o controle
/// NEGATIVO o portao poderia estar cego.
///
/// ## O que este arquivo NAO mede, de proposito
///
/// A linha que chega ao Postgres. Quem a mede e
/// `tests/integration/recoleta-do-aceite-dos-termos.test.ts`, por `SELECT` cru
/// na tabela -- porque um servidor que respondesse `204` sem gravar daria o
/// mesmo verde aqui.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String exigida = '2026-09-23';

  /// Os corpos de TODO `PUT /me/terms-acceptance` que sair.
  ///
  /// Uma lista e nao a ultima: a pergunta e "quantos sairam", e uma variavel
  /// que guarda so a ultima nao distingue nenhum de um.
  late List<Map<String, dynamic>> aceitesEnviados;

  /// Quantos `GET /me` o portao disparou. Zero prova que ele nem perguntou --
  /// que e o comportamento exigido com o interruptor desligado.
  late int consultas;

  /// Monta o portao com um servidor de mentira que devolve `registrada` em
  /// `accepted_terms_version`.
  ///
  /// `registradaPresente: false` e o caso dos 36 NULOS: o campo vem `null`.
  Future<void> montar(
    WidgetTester tester, {
    required bool ligado,
    String? registrada,
    bool temSessao = true,
    String? versaoExigida = exigida,
    bool servidorCai = false,
    bool putFalha = false,
    Uri? urlDosTermos,
    Uri? urlDaPrivacidade,
  }) async {
    aceitesEnviados = <Map<String, dynamic>>[];
    consultas = 0;
    AppConfig.limparParaTeste();
    final config = AppConfig.carregar(apiBaseUrlDeTeste: urlBase);

    final api = ApiClient(
      config: config,
      tokenDeAcesso: () async => temSessao ? 'token-de-teste' : null,
      cliente: MockClient((req) async {
        if (req.method == 'GET' && req.url.path.endsWith('/me')) {
          consultas += 1;
          if (servidorCai) return http.Response('{}', 500);
          return http.Response(
            jsonEncode(<String, dynamic>{
              'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
              'email': 'marina@exemplo.com.br',
              'email_verified': true,
              'contact_channel_verified': true,
              'pending_profile_fields': <String>[],
              'can_open_lost_case': true,
              'accepted_terms_version': registrada,
            }),
            200,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }
        if (req.method == 'PUT' && req.url.path.endsWith('/me/terms-acceptance')) {
          aceitesEnviados.add(jsonDecode(req.body) as Map<String, dynamic>);
          if (putFalha) return http.Response('{}', 500);
          return http.Response('', 204);
        }
        // 404 no resto de proposito: chamada nao prevista por um caso precisa
        // falhar alto, e nao passar por acidente.
        return http.Response('{}', 404);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: BichuTheme.claro,
        home: PortaoDeAceiteDosTermos(
          termosApi: TermosApi(api),
          tokenValido: () async => temSessao ? 'token-de-teste' : null,
          versaoExigida: versaoExigida,
          urlDosTermos: urlDosTermos,
          urlDaPrivacidade: urlDaPrivacidade,
          ligado: ligado,
          child: const Text('o aplicativo'),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  final Finder oAplicativo = find.text('o aplicativo');
  final Finder oPedido = find.byType(TelaDeAceiteDosTermos);
  final Finder botaoDeAceitar =
      find.widgetWithText(FilledButton, TextosDoAceiteDosTermos.aceitar);

  group('1. o gatilho, e o estado em que ele chega hoje', () {
    testWidgets(
      'DESLIGADO: nao pede, e nem pergunta ao servidor '
      '(o texto publicado ainda e rascunho)',
      (tester) async {
        // A ISCA MAIS IMPORTANTE DESTA ENTREGA. Com o interruptor desligado o
        // mecanismo esta de pe e CALADO -- e e assim que ele e entregue, porque
        // o texto em `web/src/conteudo/legal.ts` diz
        // "Rascunho -- pendente de revisao juridica". Colher aceite contra
        // rascunho repete o defeito com data nova.
        //
        // `registrada: null` e o pior caso (os 36 nulos): se o interruptor
        // vazasse, era aqui que o pedido apareceria.
        await montar(tester, ligado: false);

        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
        expect(
          consultas,
          0,
          reason: 'desligado o portao nao pergunta: trafego por recurso '
              'desligado e a pista de que a guarda esta no lugar errado',
        );
      },
    );

    testWidgets('LIGADO com o mesmo estado de hoje: pede', (tester) async {
      // O CONTROLE POSITIVO DO GATILHO. Sem este caso, o de cima passaria com
      // um portao que NUNCA pede -- e o "desligado" nao provaria nada.
      await montar(tester, ligado: true);
      expect(oPedido, findsOneWidget);
    });
  });

  group('2. quem e pedido, e quem nao e', () {
    testWidgets(
      'ISCA 1 (controle positivo): aceite DA VERSAO EXIGIDA nao pede nada',
      (tester) async {
        await montar(tester, ligado: true, registrada: exigida);
        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
      },
    );

    testWidgets('ISCA 2: aceite de versao DIFERENTE pede', (tester) async {
      await montar(tester, ligado: true, registrada: '2026-09-17');
      expect(oPedido, findsOneWidget);
    });

    testWidgets('ISCA 3: aceite NULO pede (os 36 registros medidos)', (tester) async {
      // `null` NAO e "em dia". Era o estado de 36 dos 37 registros, e um
      // predicado escrito como `registrada != null && registrada != exigida`
      // deixaria exatamente estes 36 de fora -- em silencio.
      await montar(tester, ligado: true, registrada: null);
      expect(oPedido, findsOneWidget);
    });

    testWidgets('sem sessao: nao pede (aceite e de uma CONTA)', (tester) async {
      await montar(tester, ligado: true, temSessao: false);
      expect(oPedido, findsNothing);
      expect(oAplicativo, findsOneWidget);
    });

    testWidgets(
      'build SEM `TERMS_VERSION`: nao pede -- pedir aqui gravaria aceite SEM '
      'versao, que e o defeito',
      (tester) async {
        await montar(tester, ligado: true, versaoExigida: null);
        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
      },
    );

    testWidgets(
      'servidor nao respondeu: nao pede -- `null` de rede nao e "nao aceitou"',
      (tester) async {
        await montar(tester, ligado: true, servidorCai: true);
        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
      },
    );
  });

  group('3. o que e GRAVADO: sempre com a versao', () {
    testWidgets(
      'ISCA 4 (metade do app): o corpo do aceite carrega a versao EXIGIDA',
      (tester) async {
        await montar(tester, ligado: true, registrada: '2026-09-17');
        await tester.tap(botaoDeAceitar);
        await tester.pumpAndSettle();

        expect(aceitesEnviados.length, 1);
        expect(aceitesEnviados.single['accepted_terms_version'], exigida);
        // E a pessoa volta ao aplicativo: o pedido nao insiste depois de aceito.
        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
      },
    );

    testWidgets(
      'ISCA 6 (replante): sem versao exigida NAO sai requisicao nenhuma',
      (tester) async {
        // O REPLANTE DO DEFEITO, do lado do app: o unico jeito de este portao
        // mandar aceite sem versao seria pedir com `versaoExigida` nula. Ele
        // nao pede -- e por isso nao ha botao para tocar e nao sai corpo algum.
        await montar(tester, ligado: true, versaoExigida: null);
        expect(botaoDeAceitar, findsNothing);
        expect(aceitesEnviados, isEmpty);
      },
    );

    testWidgets(
      'o envio que FALHA nao faz a tela sair: a pessoa fica sabendo',
      (tester) async {
        await montar(tester, ligado: true, registrada: null, putFalha: true);
        await tester.tap(botaoDeAceitar);
        await tester.pumpAndSettle();

        expect(aceitesEnviados.length, 1);
        expect(oPedido, findsOneWidget);
        expect(find.text(TextosDoAceiteDosTermos.naoDeuParaRegistrar), findsOneWidget);
      },
    );
  });

  group('4. nao e muro sem porta', () {
    testWidgets('ha os DOIS links de leitura quando o build os tem', (tester) async {
      await montar(
        tester,
        ligado: true,
        registrada: null,
        urlDosTermos: Uri.parse('https://bichu.app/termos'),
        urlDaPrivacidade: Uri.parse('https://bichu.app/privacidade'),
      );
      expect(find.text(TextosDoAceiteDosTermos.lerOsTermos), findsOneWidget);
      expect(find.text(TextosDoAceiteDosTermos.lerAPrivacidade), findsOneWidget);
      expect(find.text(TextosDoAceiteDosTermos.semOsLinks), findsNothing);
    });

    testWidgets(
      'build SEM as URLs: a frase SUBSTITUI os links, e nao ha botao morto',
      (tester) async {
        await montar(tester, ligado: true, registrada: null);
        expect(find.text(TextosDoAceiteDosTermos.semOsLinks), findsOneWidget);
        expect(find.text(TextosDoAceiteDosTermos.lerOsTermos), findsNothing);
      },
    );

    testWidgets(
      '"Agora nao" devolve o aplicativo, SEM gravar nada',
      (tester) async {
        // A SAIDA DA RECUSA, no desenho mais contido que existe: nada e
        // apagado, nada e travado, nada e gravado -- e o pedido volta no
        // proximo arranque. O que recusar deve significar de verdade e decisao
        // do cliente, e este caso guarda que nenhuma decisao foi consumada aqui.
        await montar(tester, ligado: true, registrada: null);
        await tester.tap(find.text(TextosDoAceiteDosTermos.agoraNao));
        await tester.pumpAndSettle();

        expect(oPedido, findsNothing);
        expect(oAplicativo, findsOneWidget);
        expect(aceitesEnviados, isEmpty);
      },
    );
  });
}
