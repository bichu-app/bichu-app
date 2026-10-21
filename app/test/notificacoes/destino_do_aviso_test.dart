// O DESTINO DE UMA NOTIFICACAO, do lado do aplicativo (cliente, 20/10/2026:
// "tem que ter a pagina interna da notificacao ou o link que leva para a acao
// que foi notificada").
//
// Dois assuntos, e os dois sao par de isca e contrapeso:
//
//   (a) A COSTURA: `ligarPortaDoDestinoDoAviso` traduz cada destino do
//       contrato no endereco certo, e devolve NULO quando nao ha destino.
//       Mesma forma da isca de `ligarPortaDoPerfilDoParticipante` em
//       `test/mensagens/foto_na_conversa_test.dart`.
//       contrapeso: SEM a costura, a porta devolve nulo para TODO destino --
//       e por isso a bancada de widget nao navega sozinha.
//   (b) A PAGINA DO COMUNICADO: ela mostra o CORPO que a caixa nao carrega, e
//       o `404` mostra uma frase que NAO confirma que aquele `ref` existe.
//       contrapeso: no caminho bom o corpo aparece, entao o caso do 404 nao
//       esta verde por tela vazia.
//
// Os sete destinos do contrato estao todos aqui, um por caso nomeado: um
// destino novo que entre no contrato sem endereco reprova pelo nome dele.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/modelos_notificacao.dart';
import 'package:bichu/api/notificacoes_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/notificacoes/caixa_de_notificacoes.dart';
import 'package:bichu/telas/notificacoes/comunicado.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Uma linha da caixa com o destino que o caso quiser.
AvisoDaCaixa avisoCom({
  DestinoDoAviso? destino,
  String? destinoRef,
  TipoDeAviso tipo = TipoDeAviso.plaquinhaLida,
}) => AvisoDaCaixa(
  ref: 'avi_8Hk3Lm9Qr2Tv5Xz7Bd1Cf',
  tipo: tipo,
  assunto: 'Tobias',
  aconteceuEm: DateTime.utc(2026, 10, 20, 13, 52),
  lido: false,
  agrupados: 1,
  destino: destino,
  destinoRef: destinoRef,
);

void main() {
  // -------------------------------------------------------------------------
  group('(a) a costura: cada destino vira o endereco certo', () {
    setUp(ligarPortaDoDestinoDoAviso);
    tearDown(PortaDoDestinoDoAviso.soltar);

    String? enderecoDe(DestinoDoAviso destino, String ref) =>
        PortaDoDestinoDoAviso.destino(
          avisoCom(destino: destino, destinoRef: ref),
        );

    test('ISCA: `pet` vai para a ficha do pet', () {
      expect(
        enderecoDe(DestinoDoAviso.pet, '0192f3a1-7b2c-7def-8a01-000000000001'),
        '/pets/0192f3a1-7b2c-7def-8a01-000000000001',
        reason: 'REPROVA: a plaquinha lida precisa levar a FICHA DO PET. '
            'O que a pessoa quer saber e qual pet foi escaneado.',
      );
    });

    test('ISCA: `found_report` vai para o achado', () {
      expect(
        enderecoDe(
          DestinoDoAviso.achado,
          '0192f3a1-7b2c-7def-8a01-000000000002',
        ),
        '/achados/0192f3a1-7b2c-7def-8a01-000000000002',
        reason: 'REPROVA: o achado registrado precisa levar ao ACHADO.',
      );
    });

    test('ISCA: `public_case` vai para a pagina publica do caso', () {
      expect(
        enderecoDe(DestinoDoAviso.casoPublico, 'cas0Token123456789012'),
        '/p/cas0Token123456789012',
        reason: 'REPROVA: o alerta de vizinhanca precisa levar a pagina '
            'publica do caso, que e o mesmo `/p/<share_token>` que o link do '
            'grupo do bairro ja carrega.',
      );
    });

    test('ISCA: `network_event` vai para o encontro, pelo slug', () {
      expect(
        enderecoDe(DestinoDoAviso.encontro, 'encontro-no-parque'),
        '/rede/encontros/encontro-no-parque',
        reason: 'REPROVA: os tres avisos de encontro precisam levar ao '
            'ENCONTRO.',
      );
    });

    test('ISCA: `directory_suggestion` vai para a lista de indicacoes', () {
      expect(
        enderecoDe(DestinoDoAviso.indicacao, 'indica0Ref1234567890'),
        '/rede/indicacoes',
        reason: 'REPROVA: a resposta da indicacao precisa levar as MINHAS '
            'INDICACOES, que e onde a decisao e o motivo da recusa aparecem. '
            'Nao ha rota por item, e a lista e o lugar certo.',
      );
    });

    test('ISCA: `collar_tag_request` vai para o acompanhamento, pelo PET', () {
      expect(
        enderecoDe(
          DestinoDoAviso.pedidoDaPlaquinha,
          '0192f3a1-7b2c-7def-8a01-000000000003',
        ),
        '/pets/plaquinha/0192f3a1-7b2c-7def-8a01-000000000003',
        reason: 'REPROVA: a novidade do pedido da plaquinha precisa levar ao '
            'ACOMPANHAMENTO, que e enderecado por PET e nao por pedido.',
      );
    });

    test('ISCA: `broadcast` vai para a pagina do comunicado', () {
      expect(
        enderecoDe(DestinoDoAviso.comunicado, 'comunic0Ref123456789'),
        '/avisos/comunicados/comunic0Ref123456789',
        reason: 'REPROVA: o comunicado e o UNICO tipo com pagina interna, '
            'porque e o unico sem destino natural.',
      );
    });

    test(
      'ISCA: sem destino, sem endereco -- e e o caso de `match_suggested`',
      () {
        expect(
          PortaDoDestinoDoAviso.destino(avisoCom()),
          isNull,
          reason: 'REPROVA: uma linha sem destino produziu endereco. '
              '`match_suggested` nao tem tela neste app, e um endereco aqui '
              'seria um toque para uma tela que nao existe.',
        );
        expect(
          PortaDoDestinoDoAviso.destino(
            avisoCom(destino: DestinoDoAviso.pet, destinoRef: ''),
          ),
          isNull,
          reason: 'REPROVA: referencia VAZIA produziu endereco. '
              '`/pets/` e a rota de outra coisa -- a mesma licao de '
              '`ligarPortaDoPerfilDoParticipante` com apelido vazio.',
        );
        expect(
          PortaDoDestinoDoAviso.destino(
            avisoCom(destino: DestinoDoAviso.pet),
          ),
          isNull,
          reason: 'REPROVA: destino sem referencia produziu endereco. Os dois '
              'campos andam juntos, e esta guarda e o que impede '
              '`/pets/null`.',
        );
      },
    );

    test(
      'CONTRAPESO: sem a costura, a porta devolve nulo para TODO destino',
      () {
        PortaDoDestinoDoAviso.soltar();
        for (final destino in DestinoDoAviso.values) {
          expect(
            PortaDoDestinoDoAviso.destino(
              avisoCom(destino: destino, destinoRef: 'uma-referencia-valida'),
            ),
            isNull,
            reason: 'REPROVA: a porta devolveu endereco para '
                '`${destino.codigo}` SEM a costura. O nulo de fabrica e o que '
                'faz as bancadas de widget nao navegarem sozinhas, e e ele '
                'que as iscas acima religam -- sem isso, elas estariam '
                'medindo um estado global que algum outro arquivo deixou '
                'ligado.',
          );
        }
      },
    );

    test('o contrato tem SETE destinos, e todos tem endereco', () {
      // Um destino novo no contrato, sem endereco aqui, reprova neste caso --
      // e nao num `switch` que o compilador aceitaria com `default`.
      expect(
        DestinoDoAviso.values.length,
        7,
        reason: 'REPROVA: o numero de destinos mudou. Se um destino entrou no '
            'contrato, ele precisa de endereco em '
            '`ligarPortaDoDestinoDoAviso` e de uma isca nomeada aqui.',
      );
      for (final destino in DestinoDoAviso.values) {
        expect(
          enderecoDe(destino, 'uma-referencia-valida'),
          isNotNull,
          reason: 'REPROVA: o destino `${destino.codigo}` nao tem endereco. '
              'Um destino sem tela e um toque morto.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  group('(b) a pagina do comunicado mostra o CORPO que a caixa nao carrega',
      () {
    const String refDoComunicado = 'comunic0Ref123456789';

    String caminhoDo(String ref) => '/v1/me/broadcasts/$ref';

    NotificacoesApi apiQue(http.Response Function(http.Request) responde) {
      AppConfig.limparParaTeste();
      return NotificacoesApi(
        ApiClient(
          config: AppConfig.carregar(
            apiBaseUrlDeTeste: 'https://api.teste.bichu',
          ),
          cliente: MockClient((req) async => responde(req)),
          tokenDeAcesso: () async => 'token-de-teste',
        ),
      );
    }

    Future<void> abrir(
      WidgetTester tester, {
      required NotificacoesApi api,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: PaginaDoComunicado(ref: refDoComunicado, notificacoes: api),
        ),
      );
      await tester.pumpAndSettle();
    }

    testWidgets(
      'CONTRAPESO: o corpo e o titulo do comunicado aparecem na tela',
      (tester) async {
        final api = apiQue((req) {
          expect(
            req.url.path,
            caminhoDo(refDoComunicado),
            reason: 'REPROVA: a pagina pediu outro endereco. O `ref` do '
                'caminho e o do COMUNICADO, e nao o da notificacao.',
          );
          return http.Response(
            jsonEncode(<String, dynamic>{
              'ref': refDoComunicado,
              'title': 'Manutenção no sábado',
              'body': 'O app fica fora do ar das 2h às 4h.',
              'dispatched_at': '2026-10-20T12:00:00.000Z',
            }),
            200,
            headers: const <String, String>{
              'content-type': 'application/json; charset=utf-8',
            },
          );
        });
        await abrir(tester, api: api);

        expect(
          find.text('Manutenção no sábado'),
          findsOneWidget,
          reason: 'REPROVA: o titulo do comunicado nao apareceu.',
        );
        expect(
          find.text('O app fica fora do ar das 2h às 4h.'),
          findsOneWidget,
          reason: 'REPROVA: o CORPO nao apareceu. E ele a razao desta pagina '
              'existir -- a caixa carrega so o titulo.',
        );
      },
    );

    testWidgets(
      'ISCA: o 404 mostra uma frase que NAO confirma que o `ref` existe',
      (tester) async {
        final api = apiQue(
          (_) => http.Response(
            jsonEncode(<String, dynamic>{
              'type': 'https://api.bichu.app/problems/not-found',
              'title': 'Nao foi possivel concluir',
              'status': 404,
            }),
            404,
            headers: const <String, String>{
              'content-type': 'application/problem+json; charset=utf-8',
            },
          ),
        );
        await abrir(tester, api: api);

        expect(
          find.text('Este recado não está disponível.'),
          findsOneWidget,
          reason: 'REPROVA: o 404 precisa de uma frase propria desta tela. '
              'O comunicado que nao chegou a esta conta e o que nao existe '
              'respondem o MESMO 404, e a frase nao pode distinguir os dois '
              '-- distinguir confirmaria que aquele `ref` foi disparado '
              '(ADR-0021).',
        );

        final textos = find
            .byType(Text)
            .evaluate()
            .map((e) => (e.widget as Text).data ?? '')
            .join('\n');
        expect(
          textos,
          isNot(contains(refDoComunicado)),
          reason: 'REPROVA: a tela do 404 vazou o `ref` do comunicado. Ele e '
              'identificador opaco e nao e texto de tela (ADR-0010).',
        );
      },
    );
  });
}
