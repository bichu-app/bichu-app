// A tela de um encontro da `Rede`.
//
// **Check-in e galeria sairam desta versao** (BICHUS-251, decisao do cliente
// de 23/09/2026). Os casos que exercitavam as duas estao na branch
// `guarda/rede-checkin-galeria`; aqui fica a ISCA que reprova se qualquer uma
// voltar para a tela.
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

/// A resposta de `NetworkEvent` **como o servidor desta branch a manda**:
/// com `gallery`, `viewer_checked_in`, `checkin_count` e `photo_count`.
///
/// O app nao le nenhum dos quatro, e e por isso que eles estao aqui: a ISCA
/// abaixo precisa de uma resposta que TENHA galeria e contagem, senao ela
/// passaria por falta de dado e nao por falta de tela.
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

/// A rede que atende a agenda e o encontro.
///
/// **Responde 200 ao check-in**, de proposito: se o app voltar a chamar
/// `POST .../check-in`, a chamada tem sucesso e fica registrada em
/// [chamadas], e a ISCA reprova pelo registro -- e nao por um 404 que a tela
/// poderia engolir.
Future<http.Response> Function(http.Request) redeDoEncontro({
  required Map<String, dynamic> encontro,
  List<http.Request>? chamadas,
}) {
  return (req) async {
    chamadas?.add(req);
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(
        paginaDoContrato(<Map<String, dynamic>>[encontroDoContrato()]),
      );
    }
    if (req.url.path == '/v1/network/events/passeio-benedito-calixto' &&
        req.method == 'GET') {
      return json200(encontro);
    }
    if (req.url.path ==
            '/v1/network/events/passeio-benedito-calixto/check-in' &&
        req.method == 'POST') {
      return json200(<String, dynamic>{
        'checkin_count': 8,
        'viewer_checked_in': true,
      });
    }
    return problema('not-found', 404);
  };
}

void main() {
  // -------------------------------------------------------------------------
  // CHECK-IN E GALERIA SAIRAM DESTA VERSAO (BICHUS-251, 23/09/2026)
  // -------------------------------------------------------------------------

  group('check-in e galeria nao estao no detalhe', () {
    // ISCA -- em `app/lib/telas/rede/encontro_da_rede.dart`, no fim da lista
    // devolvida por `_corpo()`, acrescente:
    //     FilledButton(onPressed: () {}, child: const Text('Confirmar presença')),
    // Este caso reprova no primeiro `expect`. O mesmo vale para a galeria: um
    // `Image.network` de foto ou o titulo `Fotos do encontro` reprovam nos
    // `expect` de baixo, e uma chamada a `POST .../check-in` reprova no
    // ultimo, pelo registro de [chamadas].
    for (final logado in <bool>[true, false]) {
      testWidgets(
        'ISCA -- o detalhe nao tem check-in nem galeria '
        '(${logado ? 'com' : 'sem'} conta)',
        (tester) async {
          final chamadas = <http.Request>[];
          await abrirOEncontro(
            tester,
            logado: logado,
            rede: redeDoEncontro(
              chamadas: chamadas,
              // A resposta TEM o que a tela nao pode mostrar: sete presencas,
              // quem chama ainda nao confirmou, e duas fotos com legenda.
              encontro: encontroCompletoDoContrato(
                checkinCount: 7,
                galeria: <Map<String, dynamic>>[
                  fotoDoContrato(caption: 'A turma na sombra da figueira.'),
                  fotoDoContrato(
                    slug: 'foto-2',
                    imageUrl: 'https://midia.bichu.app/rede/foto-2.jpg',
                  ),
                ],
              ),
            ),
          );

          // A tela abriu de verdade: sem isto, o caso passaria numa tela de
          // falha, que tambem nao tem botao nenhum.
          expect(find.byType(TelaDoEncontro), findsOneWidget);
          expect(
            find.text('Passeio matinal na Benedito Calixto'),
            findsOneWidget,
          );

          // Nenhum controle de check-in, em estado nenhum.
          expect(find.text('Confirmar presença'), findsNothing);
          expect(find.byType(FilledButton), findsNothing);

          // Nenhuma galeria: nem titulo, nem legenda, nem imagem. O encontro
          // desta massa nao tem capa, entao QUALQUER `Image` na tela e foto.
          expect(find.text('Fotos do encontro'), findsNothing);
          expect(find.text('A turma na sombra da figueira.'), findsNothing);
          expect(find.byType(Image), findsNothing);

          // Nenhuma frase das duas funcoes, em forma nenhuma.
          final tudo = textosNaTela(tester).join(' ');
          for (final palavra in <String>[
            'presença',
            'Presença',
            'confirmou',
            'confirmaram',
            'Entre na sua conta',
            'galeria',
            'Galeria',
            'foto',
          ]) {
            expect(
              tudo.contains(palavra),
              isFalse,
              reason: 'check-in e galeria sairam desta versao (BICHUS-251), '
                  'e "$palavra" apareceu no detalhe',
            );
          }

          // E o app nao fala com a rota de check-in.
          expect(
            chamadas.where((r) => r.url.path.endsWith('/check-in')),
            isEmpty,
          );
        },
      );
    }

    testWidgets('o detalhe e lido sem token, mesmo com conta', (tester) async {
      final chamadas = <http.Request>[];
      await abrirOEncontro(
        tester,
        rede: redeDoEncontro(
          chamadas: chamadas,
          encontro: encontroCompletoDoContrato(),
        ),
      );

      final detalhe = chamadas.lastWhere(
        (r) =>
            r.method == 'GET' &&
            r.url.path == '/v1/network/events/passeio-benedito-calixto',
      );
      // O `Bearer` so ia por causa de `viewer_checked_in`, que nao e mais
      // lido. Anexa-lo agora exporia a sessao a uma rota que nao precisa dela.
      expect(detalhe.headers.containsKey('Authorization'), isFalse);
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
      'Enviar foto',
      'Adicionar foto',
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
