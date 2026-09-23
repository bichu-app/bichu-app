// A tela de um encontro da `Rede`: a galeria e a confirmacao de presenca.
//
// **Nenhum `expect` deste arquivo compara texto renderizado com a constante
// que o produz.** Todo esperado esta escrito por extenso, com acento e
// pontuacao.

import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/encontro_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import 'agenda_da_rede_test.dart';

/// A resposta de `NetworkEvent`: o resumo mais a galeria e `viewer_checked_in`.
///
/// **A galeria nao tem autor.** Nao ha `submitted_by`, `author` nem
/// `uploaded_by` aqui porque nao ha nenhum deles no contrato: o banco guarda
/// quem enviou para remocao e auditoria, e esse campo nunca e projetado.
Map<String, dynamic> encontroCompletoDoContrato({
  int checkinCount = 0,
  bool viewerCheckedIn = false,
  List<Map<String, dynamic>> galeria = const <Map<String, dynamic>>[],
  String status = 'upcoming',
}) {
  return <String, dynamic>{
    ...encontroDoContrato(
      checkinCount: checkinCount,
      photoCount: galeria.length,
      status: status,
    ),
    'gallery': galeria,
    'viewer_checked_in': viewerCheckedIn,
  };
}

Map<String, dynamic> fotoDoContrato({
  String slug = 'foto-1',
  String imageUrl = 'https://midia.bichu.app/rede/foto-1.jpg',
  String? caption,
}) {
  return <String, dynamic>{
    'slug': slug,
    'image_url': imageUrl,
    'caption': caption,
  };
}

/// Abre a agenda e toca no cartao do encontro.
Future<void> abrirOEncontro(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  bool logado = true,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: logado ? depositoLogado() : null,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
  await tester.tap(find.byType(CartaoDoEncontro).first);
  await tester.pumpAndSettle();
}

/// A rede que atende a agenda, o encontro e o check-in.
Future<http.Response> Function(http.Request) redeDoEncontro({
  required Map<String, dynamic> encontro,
  Map<String, dynamic>? checkIn,
  List<http.Request>? chamadas,
}) {
  var corpoAtual = encontro;
  return (req) async {
    chamadas?.add(req);
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(
        paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
      );
    }
    if (req.url.path == '/v1/network/events/passeio-benedito-calixto' &&
        req.method == 'GET') {
      return json200(corpoAtual);
    }
    if (req.url.path ==
            '/v1/network/events/passeio-benedito-calixto/check-in' &&
        req.method == 'POST') {
      if (checkIn == null) return problema('not-found', 404);
      corpoAtual = <String, dynamic>{
        ...corpoAtual,
        'checkin_count': checkIn['checkin_count'],
        'viewer_checked_in': checkIn['viewer_checked_in'],
      };
      return json200(checkIn);
    }
    return problema('not-found', 404);
  };
}

void main() {
  // -------------------------------------------------------------------------
  // A GALERIA NAO TEM AUTOR
  // -------------------------------------------------------------------------

  testWidgets('a galeria mostra imagem e legenda, e mais nada', (tester) async {
    await abrirOEncontro(
      tester,
      rede: redeDoEncontro(
        encontro: encontroCompletoDoContrato(
          checkinCount: 7,
          galeria: <Map<String, dynamic>>[
            fotoDoContrato(caption: 'A turma na sombra da figueira.'),
            fotoDoContrato(slug: 'foto-2'),
          ],
        ),
      ),
    );

    expect(find.text('A turma na sombra da figueira.'), findsOneWidget);
    expect(find.text('Fotos do encontro'), findsOneWidget);

    // E nenhuma autoria, em forma nenhuma. Dez fotos assinadas seriam dez
    // nomes presentes, com imagem do lugar junto.
    final tudo = textosNaTela(tester).join(' ');
    for (final palavra in <String>[
      'enviada por',
      'Enviada por',
      'Foto de ',
      'por Marina',
      'Autor',
      'Enviar foto',
      'Adicionar foto',
    ]) {
      expect(
        tudo.contains(palavra),
        isFalse,
        reason: 'a galeria da Rede nao tem autor nem envio, e "$palavra" '
            'apareceu na tela',
      );
    }
  });

  testWidgets('encontro sem foto diz que nao tem, e nao oferece enviar', (tester) async {
    await abrirOEncontro(
      tester,
      rede: redeDoEncontro(encontro: encontroCompletoDoContrato()),
    );

    expect(
      find.text('Este encontro ainda não tem foto na galeria.'),
      findsOneWidget,
    );
  });

  // -------------------------------------------------------------------------
  // O CHECK-IN E DA PESSOA, E NAO DO PET
  // -------------------------------------------------------------------------

  group('a confirmacao de presenca', () {
    // ISCA -- em `app/lib/telas/rede/encontro_da_rede.dart`, em `_confirmar`,
    // troque a atribuicao de `presencas` por uma soma local:
    //     presencas: atual.encontro.presencas + 1,
    // Este caso reprova: a resposta traz 9 (outra pessoa confirmou no meio) e
    // a soma local mostraria 8. A contagem do servidor e a que vale.
    testWidgets('ISCA -- a contagem nova vem da RESPOSTA e nao de somar um', (tester) async {
      await abrirOEncontro(
        tester,
        rede: redeDoEncontro(
          encontro: encontroCompletoDoContrato(checkinCount: 7),
          checkIn: <String, dynamic>{
            // Sete viraram nove: alguem confirmou junto. Uma soma local diria
            // oito, e oito e um numero que nao existe em lugar nenhum.
            'checkin_count': 9,
            'viewer_checked_in': true,
          },
        ),
      );

      expect(find.text('7 pessoas confirmaram presença'), findsOneWidget);

      await tester.tap(find.text('Confirmar presença'));
      await tester.pumpAndSettle();

      expect(find.text('9 pessoas confirmaram presença'), findsOneWidget);
      expect(find.text('8 pessoas confirmaram presença'), findsNothing);
    });

    testWidgets('o botao nao pergunta pet nenhum', (tester) async {
      final chamadas = <http.Request>[];
      await abrirOEncontro(
        tester,
        rede: redeDoEncontro(
          encontro: encontroCompletoDoContrato(checkinCount: 2),
          checkIn: <String, dynamic>{
            'checkin_count': 3,
            'viewer_checked_in': true,
          },
          chamadas: chamadas,
        ),
      );

      await tester.tap(find.text('Confirmar presença'));
      await tester.pumpAndSettle();

      final checkIn = chamadas.lastWhere(
        (r) => r.method == 'POST' && r.url.path.endsWith('/check-in'),
      );
      // **A requisicao nao tem corpo**: nao ha o que escolher, porque o unico
      // dado da operacao e quem chama e qual evento. Um corpo aqui seria o
      // lugar por onde um `pet_id` entraria.
      expect(checkIn.body, isEmpty);
      // E nao ha folha, dialogo nem seletor entre o toque e a chamada.
      expect(find.text('Com qual pet?'), findsNothing);
      expect(find.byType(Dialog), findsNothing);
    });

    testWidgets('quem ja confirmou le uma afirmacao, e nao um botao morto', (tester) async {
      await abrirOEncontro(
        tester,
        rede: redeDoEncontro(
          encontro: encontroCompletoDoContrato(
            checkinCount: 4,
            viewerCheckedIn: true,
          ),
        ),
      );

      expect(
        find.text('Você confirmou presença neste encontro.'),
        findsOneWidget,
      );
      // Sem botao desabilitado: um controle que continua se anunciando e nao
      // tem desfecho e pior que controle ausente.
      expect(find.text('Confirmar presença'), findsNothing);
    });

    testWidgets('quem nao tem conta le o motivo, e nao um 401', (tester) async {
      await abrirOEncontro(
        tester,
        logado: false,
        rede: redeDoEncontro(encontro: encontroCompletoDoContrato()),
      );

      expect(
        find.text('Entre na sua conta para confirmar presença neste encontro.'),
        findsOneWidget,
      );
      expect(find.text('Confirmar presença'), findsNothing);
    });

    testWidgets('a falha do check-in nao apaga o encontro da tela', (tester) async {
      await abrirOEncontro(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/network/events' && req.method == 'GET') {
            return json200(
              paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
            );
          }
          if (req.url.path == '/v1/network/events/passeio-benedito-calixto' &&
              req.method == 'GET') {
            return json200(encontroCompletoDoContrato(checkinCount: 5));
          }
          if (req.method == 'POST') return problema('server-error', 500);
          return problema('not-found', 404);
        },
      );

      await tester.tap(find.text('Confirmar presença'));
      await tester.pumpAndSettle();

      // O encontro continua na tela, com a contagem que o servidor deu.
      expect(find.text('Passeio matinal na Benedito Calixto'), findsOneWidget);
      expect(find.text('5 pessoas confirmaram presença'), findsOneWidget);
      // E o toque teve desfecho: ha uma mensagem.
      expect(find.byType(FaixaDeAviso), findsWidgets);
    });
  });

  // -------------------------------------------------------------------------
  // O QUE A TELA DE DETALHE TAMBEM NAO TEM
  // -------------------------------------------------------------------------

  testWidgets('nao ha lista de presenca, mapa nem endereco no detalhe', (tester) async {
    await abrirOEncontro(
      tester,
      rede: redeDoEncontro(
        encontro: encontroCompletoDoContrato(
          checkinCount: 12,
          galeria: <Map<String, dynamic>>[fotoDoContrato()],
        ),
      ),
    );

    expect(find.text('12 pessoas confirmaram presença'), findsOneWidget);
    expect(
      find.text('Praça Benedito Calixto · Pinheiros · São Paulo, SP'),
      findsOneWidget,
    );

    final tudo = textosNaTela(tester).join(' ');
    for (final palavra in <String>[
      'Quem vai',
      'Quem foi',
      'Confirmados',
      'Participantes',
      'Presentes',
      'Ver no mapa',
      'Como chegar',
      'CEP',
      'Criar evento',
    ]) {
      expect(
        tudo.contains(palavra),
        isFalse,
        reason: 'o detalhe da Rede nao publica isso, e "$palavra" apareceu',
      );
    }
  });

  testWidgets('a hora do detalhe tambem e a do fuso do evento', (tester) async {
    await abrirOEncontro(
      tester,
      rede: redeDoEncontro(encontro: encontroCompletoDoContrato()),
    );

    expect(
      find.text('4 de outubro de 2026, 9h · horário de São Paulo'),
      findsOneWidget,
    );
  });

  testWidgets('o detalhe tem volta, e ela e anunciavel', (tester) async {
    await abrirOEncontro(
      tester,
      rede: redeDoEncontro(encontro: encontroCompletoDoContrato()),
    );

    expect(find.byType(TelaDoEncontro), findsOneWidget);
    expect(find.text('Encontro'), findsOneWidget);
    // O nome acessivel do controle, pela mesma forma que `SaidaDaTela` usa no
    // resto do app: o `tooltip` vira o nome que o leitor de tela anuncia. Sem
    // ele o VoiceOver e o TalkBack dizem "botão" e nada mais (SC 4.1.2).
    expect(find.byTooltip('Voltar'), findsOneWidget);

    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();

    // De volta a agenda, com a barra de listagem no topo do corpo.
    expect(find.byType(TelaDoEncontro), findsNothing);
    expect(find.byType(CartaoDoEncontro), findsOneWidget);
  });

  testWidgets('encontro que sumiu do servidor mostra falha, e nao tela vazia', (tester) async {
    await abrirOEncontro(
      tester,
      rede: (req) async {
        if (req.url.path == '/v1/network/events' && req.method == 'GET') {
          return json200(
            paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
          );
        }
        return problema('not-found', 404);
      },
    );

    expect(find.text('Atualizar'), findsOneWidget);
    expect(find.byType(FaixaDeAviso), findsWidgets);
  });
}
