// **Marcar um encontro da `Rede`** (`createNetworkEvent`, ADR-0025 emenda 3).
//
// O que este arquivo cobra, e por que cada caso existe:
//
//   1. a porta existe no CORPO da agenda e leva ao formulario -- nao na
//      `AppBar`, cujo slot unico e da secao;
//   2. **nenhum dos dois bloqueios vira botao morto**: sem e-mail confirmado e
//      sem conta, a tela diz o motivo E oferece a saida. Este e o caso que
//      custou tempo ao cliente tres vezes num dia, e e o que precisa reprovar
//      no dia em que alguem desabilitar o botao e calar;
//   3. o corpo enviado tem **so os campos que o contrato aceita** -- um campo
//      a mais nao e ignorado pelo servidor, e `additionalProperties: false`
//      com `removeAdditional` do Ajv o APAGA em silencio, entao a tela que o
//      mandasse acreditaria ter gravado algo;
//   4. o `409 community-event-limit-reached` diz o que DESTRAVA (cancelar ou
//      esperar terminar), sem o numero escrito no binario;
//   5. o `400 address_in_place_name` **marca o campo** `place.place_name`, e
//      nao sai como faixa generica.
//
// **NENHUM `expect` aqui compara texto renderizado com a constante que o
// produz.** Todo esperado esta por extenso, com acento: um `expect` que lesse
// `TelaCriarEncontro.semEmailConfirmado` acompanharia o erro de digitacao para
// sempre.
//
// ESTES CASOS NAO FORAM EXECUTADOS nesta entrega, por regra do cliente (nada
// de suite unitaria nem de integracao nesta rodada). O que rodou foi
// `flutter analyze`.

import 'dart:convert';

import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../rede/fixtures_da_rede.dart';
import 'ajuda_de_tela.dart';

/// A rede que atende a agenda e registra o que foi enviado na criacao.
///
/// **404 em qualquer outra rota**, e nao 200 vazio: uma chamada nao declarada
/// aqui precisa falhar alto em vez de passar por acidente.
Future<http.Response> Function(http.Request) redeDaCriacao({
  required List<Map<String, dynamic>> enviados,
  http.Response Function()? respostaDaCriacao,
}) {
  return (req) async {
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(pagina(<Map<String, dynamic>>[]));
    }
    if (req.url.path == '/v1/network/events' && req.method == 'POST') {
      enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
      final resposta = respostaDaCriacao;
      if (resposta != null) return resposta();
      return json200(encontroPublico(), status: 201);
    }
    if (req.url.path.startsWith('/v1/network/events/')) {
      return json200(encontroPublico());
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirAgenda(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool emailVerificado = true,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado(emailVerificado: emailVerificado) : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

void main() {
  group('a porta de marcar encontro', () {
    testWidgets('está no corpo da agenda e abre o formulário', (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
      );

      final porta = find.text('Marcar um encontro');
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: a agenda não oferece como marcar um encontro. O '
            'cliente pediu o botão na Rede, e sem ele a rota de criar existe '
            'sem ninguém poder alcançá-la.',
      );

      await tocar(tester, porta);

      expect(
        find.byType(TelaCriarEncontro),
        findsOneWidget,
        reason: 'REPROVA: o botão não levou ao formulário.',
      );
    });

    testWidgets(
      'ISCA — a porta NÃO está na AppBar. Para ver reprovar, mova o '
      '`BotaoSecundario` de `agenda_da_rede.dart` para `actions:` da '
      '`AppBar` de `TelaDeAba`.',
      (tester) async {
        await abrirAgenda(
          tester,
          rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        );

        final naBarra = find.descendant(
          of: find.byType(AppBar),
          matching: find.text('Marcar um encontro'),
        );
        expect(
          naBarra,
          findsNothing,
          reason: 'REPROVA: a porta foi para a barra de topo. O slot único de '
              'ação dela é da seção (11.23.1), e numa raiz de aba o slot da '
              'esquerda é a gaveta: três ações não cabem numa.',
        );
      },
    );
  });

  group('os dois casos de recusa nunca viram botão morto', () {
    testWidgets('sem e-mail confirmado: diz o motivo e oferece confirmar',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        emailVerificado: false,
      );
      await tocar(tester, find.text('Marcar um encontro'));

      expect(
        find.textContaining('Confirme seu e-mail antes de marcar'),
        findsOneWidget,
        reason: 'REPROVA: a tela não diz por que não dá para marcar. Botão '
            'desabilitado sem explicação é o defeito que custou tempo ao '
            'cliente três vezes num dia.',
      );
      expect(
        find.widgetWithText(FaixaDeAviso, 'Confirmar meu e-mail'),
        findsNothing,
        reason: 'o rótulo da ação não é o texto da faixa; o próximo expect '
            'é o que vale.',
      );
      expect(
        find.text('Confirmar meu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: o motivo foi dito sem SAÍDA. Rótulo de ação sem '
            'destino é o defeito da BICHUS-62; aqui o oposto — motivo sem '
            'ação — deixa a pessoa parada sabendo por quê.',
      );

      final botao = tester.widget<BotaoPrimario>(
        find.widgetWithText(BotaoPrimario, 'Marcar encontro'),
      );
      expect(
        botao.aoTocar,
        isNull,
        reason: 'REPROVA: o botão está habilitado sem e-mail confirmado. A '
            'chamada voltaria 409 e a pessoa teria preenchido o formulário '
            'inteiro para descobrir.',
      );
    });

    testWidgets('sem conta: diz o motivo e oferece entrar', (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        logado: false,
      );
      await tocar(tester, find.text('Marcar um encontro'));

      expect(
        find.textContaining('Entre para marcar um encontro'),
        findsOneWidget,
        reason: 'REPROVA: sem conta a tela não diz o que falta.',
      );
      expect(
        find.text('Entrar'),
        findsWidgets,
        reason: 'REPROVA: o motivo foi dito sem a saída que o resolve.',
      );
    });

    testWidgets('o motivo não é anunciado duas vezes', (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(enviados: <Map<String, dynamic>>[]),
        emailVerificado: false,
      );
      await tocar(tester, find.text('Marcar um encontro'));

      expect(
        find.textContaining('Confirme seu e-mail antes de marcar'),
        findsOneWidget,
        reason: 'REPROVA: a mesma frase aparece na faixa e na barra de ação. '
            'Duas cópias fazem o leitor de tela anunciar o bloqueio duas '
            'vezes, e a segunda não tem a saída.',
      );
    });
  });

  group('o corpo enviado', () {
    /// Preenche o mínimo que o contrato exige e toca em marcar.
    Future<void> preencherEMarcar(WidgetTester tester) async {
      await tester.enterText(
        find.widgetWithText(TextField, 'Nome do encontro'),
        'Caminhada no parque',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'O que vai acontecer'),
        'Volta tranquila de uma hora, com parada na sombra.',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Nome do lugar'),
        'Praça da Harmonia',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Bairro'),
        'Gamboa',
      );
      await tester.enterText(
        find.widgetWithText(TextField, 'Cidade'),
        'Rio de Janeiro',
      );
      await tester.enterText(find.widgetWithText(TextField, 'UF'), 'RJ');
      await tester.pumpAndSettle();

      // O dia e a hora, pelos dois seletores do Flutter.
      await tocar(tester, find.text('Começa'));
      await tocar(tester, find.text('OK'));
      await tocar(tester, find.text('OK'));

      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Marcar encontro'));
    }

    testWidgets(
      'ISCA — manda SÓ os campos que `CommunityNetworkEventInput` aceita. '
      'Para ver reprovar, acrescente `"visibility": "public"` em '
      '`RedeApi.corpoDeCriacao`.',
      (tester) async {
        final enviados = <Map<String, dynamic>>[];
        await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
        await tocar(tester, find.text('Marcar um encontro'));
        await preencherEMarcar(tester);

        expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
        final corpo = enviados.single;

        // O conjunto EXATO das chaves permitidas. Um campo a mais é apagado em
        // silêncio pelo `removeAdditional` do Ajv, e a tela acreditaria ter
        // gravado o que não gravou.
        const permitidas = <String>{
          'title',
          'summary',
          'place',
          'starts_at',
          'ends_at',
          'time_zone',
          'accepted_sizes',
          'dog_age',
          'vaccination_required',
          'fenced_off_leash_area',
          'amenities',
          'bring_items',
          'notes',
          'cover_image',
        };
        expect(
          corpo.keys.toSet().difference(permitidas),
          isEmpty,
          reason: 'REPROVA: o corpo carrega campo que a operação da comunidade '
              'não aceita. `visibility`, `admission`, `slug`, `point`, '
              '`street_address`, `ticket_url` e `instagram_url` não entram: o '
              'encontro da comunidade é sempre público e gratuito, e não há '
              'mapa nem endereço neste caminho (ADR-0006).',
        );

        const doLugar = <String>{
          'place_name',
          'neighborhood',
          'city',
          'state',
        };
        expect(
          (corpo['place'] as Map<String, dynamic>).keys.toSet(),
          doLugar,
          reason: 'REPROVA: o lugar não são os três rótulos mais a UF. '
              '`point` e `street_address` não existem aqui (ADR-0006), e um '
              'deles no corpo faria a pessoa acreditar ter dado o endereço.',
        );
      },
    );

    testWidgets('campo opcional vazio NÃO entra como `null`', (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherEMarcar(tester);

      final corpo = enviados.single;
      expect(
        corpo.containsKey('notes'),
        isFalse,
        reason: 'REPROVA: `notes` foi como `null`. O esquema não declara '
            '`null` na criação, e o 400 que isso produz nomeia um campo que a '
            'pessoa deixou em branco de propósito.',
      );
      expect(
        corpo.containsKey('ends_at'),
        isFalse,
        reason: 'REPROVA: `ends_at` foi como `null` em vez de ficar fora.',
      );
    });

    testWidgets('as datas vão em UTC, como `format: date-time` pede',
        (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirAgenda(tester, rede: redeDaCriacao(enviados: enviados));
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherEMarcar(tester);

      expect(
        (enviados.single['starts_at'] as String).endsWith('Z'),
        isTrue,
        reason: 'REPROVA: `starts_at` foi sem fuso. O servidor aplica '
            '`time_zone` sobre um instante, e um horário local sem marca é '
            'três horas de erro no Brasil.',
      );
    });
  });

  group('as recusas do servidor', () {
    testWidgets('o teto de encontros diz o que destrava, sem o número no app',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () =>
              problema('community-event-limit-reached', 409),
        ),
      );
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Marcar encontro'));

      expect(
        find.textContaining('encontros em aberto'),
        findsOneWidget,
        reason: 'REPROVA: o 409 do teto saiu como erro genérico. Esperar não '
            'resolve este: o balde cheio é o de encontros em aberto, e o que '
            'destrava é cancelar ou deixar um terminar.',
      );
      expect(
        find.textContaining('3 encontros'),
        findsNothing,
        reason: 'REPROVA: o número do teto está escrito no app. Uma versão '
            'antiga continua instalada semanas depois de o servidor mudar o '
            'valor, e repetiria o número errado com a mesma confiança. O '
            'número vem de `limit` na resposta.',
      );
    });

    testWidgets('o teto escreve o número QUANDO a resposta o manda',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'community-event-limit-reached',
            409,
            extra: <String, dynamic>{'limit': 3},
          ),
        ),
      );
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Marcar encontro'));

      expect(
        find.textContaining('3 encontros em aberto'),
        findsOneWidget,
        reason: 'REPROVA: a resposta mandou `limit` e a tela não o usou.',
      );
    });

    testWidgets(
        'o canal não verificado que chega como 409 reaproveita o mesmo texto',
        (tester) async {
      // A rede de segurança: quem confirmou o e-mail noutro aparelho com esta
      // tela em pé passa pela verificação local e leva o 409.
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'contact-channel-unverified',
            409,
            extra: <String, dynamic>{'next_action': 'verify_email'},
          ),
        ),
      );
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Marcar encontro'));

      expect(
        find.text('Confirmar meu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: o 409 de canal não verificado saiu sem a saída que '
            'o resolve.',
      );
    });

    testWidgets('o endereço dentro do nome do lugar MARCA o campo',
        (tester) async {
      await abrirAgenda(
        tester,
        rede: redeDaCriacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaCriacao: () => problema(
            'validation-failed',
            400,
            extra: <String, dynamic>{
              'errors': <Map<String, dynamic>>[
                <String, dynamic>{
                  'field': 'place.place_name',
                  'code': 'address_in_place_name',
                  'message': 'Escreva só o nome do lugar, sem endereço.',
                },
              ],
            },
          ),
        ),
      );
      await tocar(tester, find.text('Marcar um encontro'));
      await preencherOMinimo(tester);
      await tocar(tester, find.widgetWithText(BotaoPrimario, 'Marcar encontro'));

      expect(
        find.text('Escreva só o nome do lugar, sem endereço.'),
        findsOneWidget,
        reason: 'REPROVA: a recusa saiu como faixa genérica e o campo ficou '
            'sem marca. A pessoa precisa saber QUAL dos sete campos recusou, '
            'e a frase é a do servidor: a tela não reimplementa o detector '
            'de endereço, e duas redações dele divergiriam.',
      );
    });
  });
}

/// Preenche o mínimo exigido pelo contrato, sem tocar em marcar.
Future<void> preencherOMinimo(WidgetTester tester) async {
  await tester.enterText(
    find.widgetWithText(TextField, 'Nome do encontro'),
    'Caminhada no parque',
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'O que vai acontecer'),
    'Volta tranquila de uma hora.',
  );
  await tester.enterText(
    find.widgetWithText(TextField, 'Nome do lugar'),
    'Praça da Harmonia',
  );
  await tester.enterText(find.widgetWithText(TextField, 'Bairro'), 'Gamboa');
  await tester.enterText(
    find.widgetWithText(TextField, 'Cidade'),
    'Rio de Janeiro',
  );
  await tester.enterText(find.widgetWithText(TextField, 'UF'), 'RJ');
  await tester.pumpAndSettle();
  await tocar(tester, find.text('Começa'));
  await tocar(tester, find.text('OK'));
  await tocar(tester, find.text('OK'));
}
