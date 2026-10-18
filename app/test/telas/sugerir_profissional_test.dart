// **Indicar um profissional para o `Perto`** (`suggestDirectoryEntry`).
//
// O caso central deste arquivo, e a razao de ele existir separado do de criar
// encontro: **a indicação NÃO publica**. Criar encontro é a pessoa falando dela
// mesma e publica direto; indicar uma clínica é publicar sobre um TERCEIRO que
// não pediu, não sabe e pode discordar. A tela precisa dizer isso com estas
// palavras, antes e depois do envio — e é isso que o grupo
// `a tela não promete publicação` reprova.
//
// O que mais este arquivo cobra:
//
//   1. a porta existe no CORPO do `Perto` e leva ao formulário;
//   2. o corpo enviado tem **só os campos do contrato**, e nenhum deles é
//      documento nem dado de pessoa física;
//   3. o tipo de contato é DECLARADO e a ajuda do campo muda com ele;
//   4. o `400` nomeado em `public_contact.value` marca o campo.
//
// **Nenhum `expect` compara texto renderizado com a constante que o produz.**
//
// ESTES CASOS NÃO FORAM EXECUTADOS nesta entrega, por regra do cliente. O que
// rodou foi `flutter analyze`.

import 'dart:convert';

import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Uma página vazia do diretório, no formato do contrato.
Map<String, dynamic> diretorioVazio() => <String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'page': 1,
      'limit': 20,
      'total': 0,
      'distance_available': false,
      'applied_filters': <String, String>{'scope': 'all'},
    };

/// A rede que atende o diretório e registra o que foi enviado na indicação.
///
/// **404 no resto**: chamada não declarada aqui precisa falhar alto.
Future<http.Response> Function(http.Request) redeDaIndicacao({
  required List<Map<String, dynamic>> enviados,
  http.Response Function()? respostaDaIndicacao,
}) {
  return (req) async {
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (req.url.path == '/v1/directory/suggestions' && req.method == 'POST') {
      enviados.add(jsonDecode(req.body) as Map<String, dynamic>);
      final resposta = respostaDaIndicacao;
      if (resposta != null) return resposta();
      return json200(
        <String, dynamic>{
          'reference': 'Xk3Qm9TbPz7Lw2Rv5Nd8Hq',
          'state': 'pending',
          'created_at': '2026-10-17T12:00:00Z',
        },
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirPerto(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
  await tester.pumpAndSettle();
}

/// Preenche o mínimo que o contrato exige, sem enviar.
Future<void> preencherOMinimo(WidgetTester tester) async {
  await tester.enterText(
    find.widgetWithText(TextField, 'Nome do lugar'),
    'Clínica Veterinária Bichinho',
  );
  await tester.pumpAndSettle();

  await tocar(tester, find.text('O que eles fazem'));
  await tocar(tester, find.text('Clínica'));

  await tester.enterText(
    find.widgetWithText(TextField, 'Cidade'),
    'Rio de Janeiro',
  );
  await tester.enterText(find.widgetWithText(TextField, 'UF'), 'RJ');
  await tester.pumpAndSettle();

  await tocar(tester, find.text('Como entrar em contato'));
  await tocar(tester, find.text('Telefone'));

  await tester.enterText(
    find.widgetWithText(TextField, 'Telefone'),
    '+5521988887777',
  );
  await tester.pumpAndSettle();
}

void main() {
  group('a porta de indicar', () {
    testWidgets('está no corpo do Perto e abre o formulário', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );

      final porta = find.text('Indicar quem atende bem');
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: o Perto não oferece como indicar um profissional. O '
            'cliente pediu o botão, e sem ele o diretório continua sem '
            'nenhuma forma de a comunidade alimentá-lo.',
      );

      await tocar(tester, porta);
      expect(find.byType(TelaSugerirProfissional), findsOneWidget);
    });

    testWidgets(
      'ISCA — a porta NÃO está na AppBar. Para ver reprovar, mova o '
      '`BotaoSecundario` de `lista_do_diretorio.dart` para `actions:` da '
      'barra de topo.',
      (tester) async {
        await abrirPerto(
          tester,
          rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        );
        expect(
          find.descendant(
            of: find.byType(AppBar),
            matching: find.text('Indicar quem atende bem'),
          ),
          findsNothing,
          reason: 'REPROVA: a porta foi para a barra de topo, cujo slot único '
              'de ação é da seção. Busca, filtro e ordenação já moram no corpo '
              'pelo mesmo motivo.',
        );
      },
    );

    testWidgets('o rótulo diz INDICAR, e não cadastrar', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      expect(
        find.textContaining('Cadastrar'),
        findsNothing,
        reason: 'REPROVA: o rótulo promete cadastro. Quem usa esta porta não '
            'cria a entrada do diretório: a emenda 1 do ADR-0011 diz que a '
            'comunidade convida e avalia, nunca cria. "Cadastrar" prometeria '
            'publicação, e nada é publicado aqui.',
      );
    });
  });

  group('a tela não promete publicação', () {
    testWidgets('diz, ANTES dos campos, que alguém confere primeiro',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));

      expect(
        find.textContaining('confere antes de publicar'),
        findsOneWidget,
        reason: 'REPROVA: a tela não diz que a indicação passa por '
            'conferência. Quem escreve o nome de uma clínica real precisa '
            'saber que o estabelecimento vai ser avisado e decide se quer '
            'aparecer — isto é um terceiro, não a própria pessoa.',
      );
    });

    testWidgets(
      'ISCA — o recibo diz CONFERÊNCIA e não publicação. Para ver reprovar, '
      'troque `TelaSugerirProfissional.recebido` por "Pronto, publicado!".',
      (tester) async {
        await abrirPerto(
          tester,
          rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        );
        await tocar(tester, find.text('Indicar quem atende bem'));
        await preencherOMinimo(tester);
        await tocar(
          tester,
          find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
        );

        expect(
          find.textContaining('nada aparece no Perto até alguém olhar'),
          findsOneWidget,
          reason: 'REPROVA: o texto de sucesso não diz que nada foi '
              'publicado. Um "pronto, indicado!" faria a pessoa acreditar que '
              'o nome de uma clínica real está no ar sem ninguém ter olhado — '
              'e é justamente isso que a sugestão pendente existe para '
              'impedir.',
        );
        expect(
          find.textContaining('Publicado'),
          findsNothing,
          reason: 'REPROVA: a tela escreveu "publicado" sobre o que está '
              'pendente de revisão.',
        );
      },
    );

    testWidgets('não navega para a lista do Perto depois de enviar',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(
        find.byType(TelaSugerirProfissional),
        findsOneWidget,
        reason: 'REPROVA: a tela voltou para o Perto. A pessoa procuraria na '
            'lista o que não está lá, porque nada foi publicado.',
      );
    });
  });

  group('o corpo enviado', () {
    testWidgets(
      'ISCA — manda SÓ os campos de `DirectorySuggestionInput`. Para ver '
      'reprovar, acrescente `"cnpj"` em `DiretorioApi.corpoDaSugestao`.',
      (tester) async {
        final enviados = <Map<String, dynamic>>[];
        await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
        await tocar(tester, find.text('Indicar quem atende bem'));
        await preencherOMinimo(tester);
        await tocar(
          tester,
          find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
        );

        expect(enviados, hasLength(1), reason: 'REPROVA: nada foi enviado.');
        const permitidas = <String>{
          'display_name',
          'kind',
          'city',
          'state',
          'neighborhood',
          'public_contact',
          'note',
        };
        expect(
          enviados.single.keys.toSet().difference(permitidas),
          isEmpty,
          reason: 'REPROVA: o corpo carrega campo que a operação não aceita.',
        );
      },
    );

    testWidgets('não coleta documento nem dado de pessoa física',
        (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await tocar(tester, find.text('Indicar quem atende bem'));
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      for (final proibido in <String>[
        'cnpj',
        'cpf',
        'crmv_number',
        'crmv_uf',
        'document',
        'street_address',
        'point',
        'lat',
        'lon',
        'geo',
      ]) {
        expect(
          enviados.single.containsKey(proibido),
          isFalse,
          reason: 'REPROVA: o corpo carrega `$proibido`. Documento é prova de '
              'quem o APRESENTA e mora em `entity_verifications`: pedi-lo aqui '
              'seria coletar o documento de um terceiro pela mão de um '
              'estranho. Coordenada e endereço não existem neste caminho '
              '(ADR-0006): não há mapa nem geocodificação.',
        );
      }
    });

    testWidgets('não pergunta documento na tela', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));

      for (final proibido in <String>['CNPJ', 'CPF', 'CRMV', 'Endereço']) {
        expect(
          find.textContaining(proibido),
          findsNothing,
          reason: 'REPROVA: a tela pede `$proibido`. O mínimo que permite '
              'conferir é nome, atividade, cidade e um contato público.',
        );
      }
    });

    testWidgets('o contato vai com o tipo DECLARADO', (tester) async {
      final enviados = <Map<String, dynamic>>[];
      await abrirPerto(tester, rede: redeDaIndicacao(enviados: enviados));
      await tocar(tester, find.text('Indicar quem atende bem'));
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      final contato = enviados.single['public_contact'] as Map<String, dynamic>;
      expect(
        contato.keys.toSet(),
        <String>{'kind', 'value'},
        reason: 'REPROVA: o contato não é o par (tipo, valor).',
      );
      expect(
        contato['kind'],
        'phone',
        reason: 'REPROVA: o tipo escolhido na tela não chegou no corpo. '
            'Adivinhar o tipo por heurística aceitaria um telefone no campo '
            'de site, e a recusa chegaria sem dizer qual dos dois errou.',
      );
    });
  });

  group('a ajuda do campo de contato segue o tipo escolhido', () {
    testWidgets('site pede o endereço completo com https://', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));
      await tocar(tester, find.text('Como entrar em contato'));
      await tocar(tester, find.text('Site'));

      expect(
        find.textContaining('endereço completo, com https://'),
        findsOneWidget,
        reason: 'REPROVA: a ajuda não diz o formato que o servidor vai '
            'conferir. Dito antes é um campo preenchido certo; descoberto '
            'pelo 400 é um formulário refeito.',
      );
    });

    testWidgets('instagram pede o perfil com @', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));
      await tocar(tester, find.text('Como entrar em contato'));
      await tocar(tester, find.text('Instagram'));

      expect(find.textContaining('o perfil, com @'), findsOneWidget);
    });
  });

  group('as recusas', () {
    testWidgets('sem conta: diz o motivo e oferece entrar', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(enviados: <Map<String, dynamic>>[]),
        logado: false,
      );
      await tocar(tester, find.text('Indicar quem atende bem'));

      expect(
        find.textContaining('Entre para indicar'),
        findsOneWidget,
        reason: 'REPROVA: sem conta a tela não diz o que falta, e o botão '
            'fica morto.',
      );
      expect(find.text('Entrar'), findsWidgets);
    });

    testWidgets('o 400 nomeado marca o campo do contato', (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaIndicacao: () => problema(
            'validation-failed',
            400,
            extra: <String, dynamic>{
              'errors': <Map<String, dynamic>>[
                <String, dynamic>{
                  'field': 'public_contact.value',
                  'code': 'invalid_phone',
                  'message': 'Telefone com DDD, começando por +55.',
                },
              ],
            },
          ),
        ),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(
        find.text('Telefone com DDD, começando por +55.'),
        findsOneWidget,
        reason: 'REPROVA: a recusa saiu como faixa genérica e o campo ficou '
            'sem marca.',
      );
    });

    testWidgets('o 429 por conta não vira erro genérico de rede',
        (tester) async {
      await abrirPerto(
        tester,
        rede: redeDaIndicacao(
          enviados: <Map<String, dynamic>>[],
          respostaDaIndicacao: () => problema('rate-limited', 429),
        ),
      );
      await tocar(tester, find.text('Indicar quem atende bem'));
      await preencherOMinimo(tester);
      await tocar(
        tester,
        find.widgetWithText(BotaoPrimario, 'Enviar indicação'),
      );

      expect(
        find.textContaining('Espere um pouco'),
        findsOneWidget,
        reason: 'REPROVA: o 429 saiu como "servidor fora". Indicar cria '
            'trabalho humano de revisão, e o teto por conta é o orçamento '
            'dessa fila: a pessoa precisa saber que é para esperar.',
      );
    });
  });
}
