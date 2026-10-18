// AS ISCAS da area de mensagens (BICHUS-278, 18/10/2026).
//
// Cada grupo aqui e um PAR: a isca e o contrapeso. A isca prova que o defeito
// reprova; o contrapeso prova que o caso nao esta verde por vazio -- que a
// tela de fato desenha o caminho bom. Um arquivo com so a metade da isca
// passaria igual se a tela nao renderizasse nada.
//
// Os quatro pares, e o que cada um pega:
//
//   (a) conversa de OUTRA pessoa responde 404 e nao aparece na lista
//       contrapeso: a propria aparece, e abre
//   (b) 410 mostra conversa encerrada e ESCONDE a caixa de texto
//       contrapeso: conversa aberta mostra a caixa
//   (c) o lado desabilitado aparece DESPERSONALIZADO, e nenhum identificador
//       interno sai na tela
//       contrapeso: o lado com nome aparece com o nome
//   (d) falha de envio PRESERVA o texto digitado
//       contrapeso: envio que deu 201 limpa o campo
//
// A rede e sempre um `MockClient` explicito, e o caminho atravessado e o de
// verdade: tela -> `ConversasApi` -> `ApiClient` -> traducao de `Problem`.
// Nenhum caso usa um dublê de tela que responda "encerrada" por conta propria,
// que e a forma de "o dublê recusou" que este repositorio ja pagou tres vezes.
//
// Todo esperado esta escrito por extenso, com acento: nenhum `expect` compara
// o texto renderizado com a constante que o produz.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/telas/mensagens/tela_da_conversa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// ---------------------------------------------------------------------------
// OS IDS. Sao UUID de verdade, porque a isca (c) procura por eles na tela.
// ---------------------------------------------------------------------------

/// A conversa que E do chamador.
const String idDaMinha = '0192f3a1-7b2c-7def-8a01-000000000001';

/// A conversa de OUTRA pessoa. O servidor responde 404 (ADR-0021).
const String idDeTerceiro = '0192f3a1-7b2c-7def-8a01-000000000999';

const String idDaMensagem = '0192f3a1-7b2c-7def-8a01-00000000aaaa';

// ---------------------------------------------------------------------------
// FIXTURES, campo por campo do contrato
// ---------------------------------------------------------------------------

Map<String, dynamic> participante(String papel, String nome) =>
    <String, dynamic>{'role': papel, 'display_name': nome};

Map<String, dynamic> mensagem({
  String id = idDaMensagem,
  String papel = 'finder',
  String corpo = 'Achei ele na praça da Matriz, está bem',
  String criadaEm = '2026-10-18T13:52:00.000Z',
  List<Map<String, dynamic>> retirados = const <Map<String, dynamic>>[],
}) => <String, dynamic>{
  'id': id,
  'sender_role': papel,
  'body': corpo,
  'redactions': retirados,
  'photo_url': null,
  'created_at': criadaEm,
};

/// Uma `Conversation` do contrato.
///
/// [nomeDoAchador] com o rotulo neutro `Quem achou` e **exatamente o que o
/// servidor devolve quando a conta daquele lado esta desabilitada**: a
/// despersonalizacao e dele (`participantesVisiveis`), e nao da tela.
Map<String, dynamic> conversa({
  String id = idDaMinha,
  String estado = 'open',
  String nomeDoAchador = 'Marina',
  String nomeDoTutor = 'Leandro',
  String nomeDoPet = 'Tobias',
  List<Map<String, dynamic>>? mensagens,
  String? proximoCursor,
  bool naoLida = false,
  String? previa,
  String? ultimaEm,
}) => <String, dynamic>{
  'id': id,
  'case_id': null,
  'pet_display_name': nomeDoPet,
  'status': estado,
  'participants': <Map<String, dynamic>>[
    participante('tutor', nomeDoTutor),
    participante('finder', nomeDoAchador),
  ],
  // A LISTA manda `messages: []`, como o servidor faz. O detalhe manda cheio.
  'messages': mensagens ?? <Map<String, dynamic>>[],
  'unread': naoLida,
  'last_message_preview': previa,
  'last_message_at': ultimaEm,
  'next_cursor': proximoCursor,
};

Map<String, dynamic> paginaDeConversas(
  List<Map<String, dynamic>> itens, {
  String? proximoCursor,
  int naoLidas = 0,
}) => <String, dynamic>{
  'items': itens,
  'unread_count': naoLidas,
  'next_cursor': proximoCursor,
};

http.Response json200(Map<String, dynamic> corpo, {int status = 200}) =>
    http.Response(
      jsonEncode(corpo),
      status,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

/// Um `Problem` do contrato.
///
/// O `title` e **deliberadamente enganoso**: se alguma tela passar a decidir
/// pelo texto do servidor em vez do `type`, o caso reprova.
http.Response problema(String slug, int status) => http.Response(
  jsonEncode(<String, dynamic>{
    'type': 'https://api.bichu.app/problems/$slug',
    'title': 'Nao foi possivel concluir',
    'status': status,
  }),
  status,
  headers: const <String, String>{
    'content-type': 'application/problem+json; charset=utf-8',
  },
);

// ---------------------------------------------------------------------------
// A BANCADA
// ---------------------------------------------------------------------------

/// O servidor de teste: rotas por `METODO /caminho`, e o registro das chamadas.
class ServidorDeConversas {
  ServidorDeConversas(this.respostas);

  final Map<String, http.Response Function(http.Request)> respostas;

  final List<http.Request> chamadas = <http.Request>[];

  List<http.Request> chamadasA(String metodoECaminho) => chamadas
      .where((r) => '${r.method} ${r.url.path}' == metodoECaminho)
      .toList();

  Future<http.Response> call(http.Request req) async {
    chamadas.add(req);
    final chave = '${req.method} ${req.url.path}';
    final resposta = respostas[chave];
    // O PADRAO E 404, e nao 200 vazio: e o que o servidor responde para
    // recurso que nao e do chamador (ADR-0021). Um 200 vazio aqui deixaria a
    // isca (a) verde pelo motivo errado.
    if (resposta == null) {
      // `POST /v1/me/conversations-seen` responde 204 por padrao: ela e
      // chamada por TODA abertura da lista, e um 404 padrao aqui faria cada
      // caso ter de registra-la a mao.
      if (chave == 'POST /v1/me/conversations-seen') {
        return http.Response('', 204);
      }
      return problema('not-found', 404);
    }
    return resposta(req);
  }
}

ConversasApi apiDe(ServidorDeConversas servidor) {
  AppConfig.limparParaTeste();
  return ConversasApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
      cliente: MockClient(servidor.call),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

/// Monta a area de mensagens com um roteador de verdade.
///
/// O roteador existe porque a lista navega com `context.push`, e porque a rota
/// `/mensagens/:conversaId` **e o destino do toque na notificacao**: montar a
/// tela da conversa direto deixaria esse caminho sem nenhuma prova.
Future<void> abrirAMensagens(
  WidgetTester tester, {
  required ServidorDeConversas servidor,
  String rotaInicial = RotasDeMensagens.area,
  ValueChanged<int>? aoContar,
}) async {
  final api = apiDe(servidor);
  final roteador = GoRouter(
    initialLocation: rotaInicial,
    routes: <RouteBase>[
      GoRoute(
        path: RotasDeMensagens.area,
        builder: (context, estado) =>
            AreaDeMensagens(conversas: api, aoContarNaoLidas: aoContar),
        routes: <RouteBase>[
          GoRoute(
            path: 'conversas/:${RotasDeMensagens.parametroDaConversa}',
            redirect: (context, estado) => null,
          ),
        ],
      ),
      GoRoute(
        path: RotasDeMensagens.conversa,
        builder: (context, estado) => TelaDaConversa(
          conversaId:
              estado.pathParameters[RotasDeMensagens.parametroDaConversa] ?? '',
          conversas: api,
        ),
      ),
    ],
  );
  addTearDown(roteador.dispose);
  await tester.pumpWidget(
    MaterialApp.router(theme: BichuTheme.claro, routerConfig: roteador),
  );
  await tester.pumpAndSettle();
}

/// Todo o texto visivel da tela, numa string so, para as iscas procurarem o
/// que NAO pode estar la.
String textoDaTela(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Text).evaluate()) {
    final t = e.widget as Text;
    partes.add(t.data ?? t.textSpan?.toPlainText() ?? '');
  }
  for (final e in find.byType(RichText).evaluate()) {
    partes.add((e.widget as RichText).text.toPlainText());
  }
  return partes.join('\n');
}

/// Todo rotulo de semantica da tela: e saida tambem, e o ADR-0010 vale nela.
///
/// Le os `Semantics` da arvore de widgets, e nao a arvore de semantica
/// compilada: e nos `Semantics` que esta tela escreve os rotulos dela, e e por
/// um deles que um id escaparia. Junta `tooltip` tambem, que e o rotulo
/// acessivel do botao de enviar.
String semanticaDaTela(WidgetTester tester) {
  final partes = <String>[];
  for (final e in find.byType(Semantics).evaluate()) {
    final s = e.widget as Semantics;
    final p = s.properties;
    partes.addAll(<String>[
      p.label ?? '',
      p.value ?? '',
      p.hint ?? '',
      p.tooltip ?? '',
    ]);
  }
  for (final e in find.byType(Tooltip).evaluate()) {
    partes.add((e.widget as Tooltip).message ?? '');
  }
  return partes.join('\n');
}

void main() {
  // -------------------------------------------------------------------------
  group('(a) conversa de outra pessoa: 404, e fora da lista', () {
    testWidgets(
      'ISCA: abrir a conversa de terceiro responde 404 e a tela NAO afirma '
      'que ela existe',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
            // A conversa de terceiro NAO esta registrada: cai no 404 padrao,
            // que e o que o servidor responde de verdade (nunca 403).
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDeTerceiro),
        );

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Esta conversa não está disponível'),
          reason: 'REPROVA: o 404 de conversa de terceiro precisa levar a uma '
              'tela que diz que ela nao esta disponivel e manda voltar.',
        );
        // A tela NAO pode dizer "nao e sua": isso confirmaria pelo texto o que
        // o 404 existe para nao confirmar (ADR-0021).
        expect(texto, isNot(contains('não é sua')));
        expect(texto, isNot(contains('sem permissão')));
        expect(texto, isNot(contains('Acesso negado')));
        // E nao pode haver caixa de texto numa conversa que nao carregou.
        expect(find.byType(TextField), findsNothing);
      },
    );

    testWidgets(
      'ISCA: a conversa de terceiro nao aparece na lista -- a lista desenha '
      'SO o que o servidor devolveu',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(nomeDoAchador: 'Marina'),
              ]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.byType(LinhaDaConversa), findsOneWidget);
        // O id de terceiro nao esta em lugar nenhum da tela.
        expect(textoDaTela(tester), isNot(contains(idDeTerceiro)));
        expect(semanticaDaTela(tester), isNot(contains(idDeTerceiro)));
      },
    );

    testWidgets(
      'CONTRAPESO: a propria conversa aparece na lista E abre ao ser tocada',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
            'GET /v1/conversations/$idDaMinha': (_) => json200(
              conversa(mensagens: <Map<String, dynamic>>[mensagem()]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.text('Marina  ·  Tobias'), findsOneWidget);
        await tester.tap(find.byType(LinhaDaConversa));
        await tester.pumpAndSettle();

        // A mensagem do achador CHEGOU A TELA. E isto que desfaz a perda do
        // recado: antes desta historia, o texto era gravado e ninguem lia.
        expect(
          find.text('Achei ele na praça da Matriz, está bem'),
          findsOneWidget,
          reason: 'REPROVA: a conversa abriu e a mensagem de quem achou o pet '
              'nao foi desenhada. E o buraco central do produto.',
        );
        expect(
          servidor.chamadasA('GET /v1/conversations/$idDaMinha'),
          isNotEmpty,
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(b) 410: conversa encerrada, e SEM caixa de texto', () {
    testWidgets(
      'ISCA: status `closed` na abertura mostra encerrada e NAO desenha a '
      'caixa de texto',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) => json200(
              conversa(
                estado: 'closed',
                mensagens: <Map<String, dynamic>>[mensagem()],
              ),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        expect(textoDaTela(tester), contains('Esta conversa está encerrada.'));
        expect(
          find.byType(TextField),
          findsNothing,
          reason: 'REPROVA: a conversa encerrada desenhou caixa de texto. Um '
              'campo cujo envio o servidor recusa com 410 e pior que nenhum '
              'campo: a pessoa escreve duas vezes antes de entender.',
        );
      },
    );

    testWidgets(
      'ISCA: status `blocked` cai pela MESMA porta -- modo leitura, sem caixa',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) =>
                json200(conversa(estado: 'blocked')),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        expect(textoDaTela(tester), contains('Esta conversa está encerrada.'));
        expect(
          find.byType(TextField),
          findsNothing,
          reason: 'REPROVA: `blocked` tambem recusa o envio com 410. Uma '
              'condicao escrita so sobre `closed` deixa a conversa bloqueada '
              'com um campo que sempre falha.',
        );
      },
    );

    testWidgets(
      'ISCA: a conversa fecha ENTRE a abertura e o toque -- o 410 do envio '
      'esconde a caixa, e nao aparece como defeito',
      (tester) async {
        var pedidos = 0;
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
            'POST /v1/conversations/$idDaMinha/messages': (_) {
              pedidos++;
              // O MESMO 410 de conversa encerrada. E tambem o que chega quando
              // a conta do outro lado foi desabilitada: corpo fixo, de
              // proposito -- distinguir contaria a esta pessoa o que aconteceu
              // com a conta da outra.
              return problema('conversation-closed', 410);
            },
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        expect(find.byType(TextField), findsOneWidget);
        await tester.enterText(find.byType(TextField), 'Consigo buscar hoje');
        await tester.tap(find.byTooltip('Enviar a mensagem'));
        await tester.pumpAndSettle();

        expect(pedidos, 1);
        expect(textoDaTela(tester), contains('Esta conversa está encerrada.'));
        expect(
          find.byType(TextField),
          findsNothing,
          reason: 'REPROVA: o 410 do envio precisa levar a conversa para modo '
              'leitura e RETIRAR a caixa. Mantê-la convida a pessoa a tentar '
              'de novo num canal que nao aceita mais mensagem.',
        );
        // E NAO pode aparecer como defeito: nenhum texto de falha de envio.
        expect(
          textoDaTela(tester),
          isNot(contains('A mensagem não foi enviada')),
          reason: 'REPROVA: o 410 nao e falha de envio, e sim o estado da '
              'conversa. Mostra-lo como erro faria a pessoa achar que o app '
              'quebrou.',
        );
      },
    );

    testWidgets('CONTRAPESO: conversa `open` MOSTRA a caixa de texto', (
      tester,
    ) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
        },
      );
      await abrirAMensagens(
        tester,
        servidor: servidor,
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      expect(
        find.byType(TextField),
        findsOneWidget,
        reason: 'REPROVA: a conversa aberta precisa ter caixa de texto. Sem '
            'este contrapeso, uma tela que nunca desenha campo passaria nas '
            'tres iscas acima.',
      );
      expect(find.byTooltip('Enviar a mensagem'), findsOneWidget);
      expect(textoDaTela(tester), isNot(contains('está encerrada')));
    });
  });

  // -------------------------------------------------------------------------
  group('(c) lado desabilitado despersonalizado, e nenhum id na tela', () {
    testWidgets(
      'ISCA: o lado desabilitado aparece como `Quem achou`, e a tela nao '
      'afirma o que aconteceu com a conta dele',
      (tester) async {
        // E ASSIM que o servidor devolve a conta desabilitada: `display_name`
        // volta como o rotulo neutro, pelo mesmo caminho de quem nunca teve
        // nome (`participantesVisiveis`). A tela nao sabe -- e nao deve saber
        // -- qual dos dois casos e.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(nomeDoAchador: 'Quem achou', estado: 'closed'),
              ]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(
          texto,
          contains('Quem achou'),
          reason: 'REPROVA: o lado despersonalizado precisa aparecer com o '
              'rotulo neutro que o servidor mandou.',
        );
        // A TELA NAO CONTA O QUE HOUVE COM A CONTA ALHEIA.
        for (final proibido in <String>[
          'desabilitada',
          'desativada',
          'excluída',
          'excluida',
          'banida',
          'suspensa',
          'conta removida',
        ]) {
          expect(
            texto,
            isNot(contains(proibido)),
            reason: 'REPROVA: a tela escreveu "$proibido". O servidor funde '
                'conta desabilitada e conversa encerrada no MESMO 410 de '
                'proposito: distinguir conta a uma pessoa o que aconteceu com '
                'a conta de outra.',
          );
        }
      },
    );

    testWidgets(
      'ISCA: NENHUM identificador interno sai na tela -- nem em texto, nem em '
      'rotulo acessivel',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
            'GET /v1/conversations/$idDaMinha': (_) => json200(
              conversa(mensagens: <Map<String, dynamic>>[mensagem()]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        // Na LISTA.
        expect(textoDaTela(tester), isNot(contains(idDaMinha)));
        expect(semanticaDaTela(tester), isNot(contains(idDaMinha)));

        await tester.tap(find.byType(LinhaDaConversa));
        await tester.pumpAndSettle();

        // Na CONVERSA ABERTA, onde o id esta no caminho da rota e e o mais
        // facil de escapar para a barra de titulo.
        final texto = textoDaTela(tester);
        final semantica = semanticaDaTela(tester);
        for (final id in <String>[idDaMinha, idDaMensagem]) {
          expect(
            texto,
            isNot(contains(id)),
            reason: 'REPROVA: o UUID interno "$id" foi pintado. O ADR-0010 '
                'proibe UUID interno em saida publica, e dois UUIDv7 entregam '
                'a taxa de criacao de registros da plataforma.',
          );
          expect(
            semantica,
            isNot(contains(id)),
            reason: 'REPROVA: o UUID interno "$id" saiu num rotulo de '
                'semantica. Rotulo lido por leitor de tela e saida tambem.',
          );
        }
      },
    );

    testWidgets(
      'CONTRAPESO: o lado COM nome aparece com o nome, e a marca neutra e a '
      'inicial dele',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(nomeDoAchador: 'Marina'),
              ]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(textoDaTela(tester), contains('Marina'));
        // A MARCA E A INICIAL, E NAO UMA FOTO. O contrato declara em dois
        // lugares que `participants` nunca traz foto de perfil, e por isso nao
        // ha `Image` nenhuma na linha.
        expect(find.byType(MarcaNeutraDoParticipante), findsOneWidget);
        expect(find.text('M'), findsOneWidget);
        expect(
          find.descendant(
            of: find.byType(LinhaDaConversa),
            matching: find.byType(Image),
          ),
          findsNothing,
          reason: 'REPROVA: apareceu imagem na linha da conversa. O contrato '
              'declara, por extenso e em dois lugares, que `participants` '
              'NUNCA traz foto de perfil -- nao ha de onde a URL vir, e '
              'qualquer imagem aqui e invencao da tela.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('(d) falha de envio preserva o texto digitado', () {
    const String digitado = 'Consigo buscar hoje à tarde, por volta das 17h';

    testWidgets('ISCA: falha de rede NAO limpa o campo', (tester) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
          'POST /v1/conversations/$idDaMinha/messages': (_) =>
              throw http.ClientException('sem rede'),
        },
      );
      await abrirAMensagens(
        tester,
        servidor: servidor,
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      await tester.enterText(find.byType(TextField), digitado);
      await tester.tap(find.byTooltip('Enviar a mensagem'));
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        digitado,
        reason: 'REPROVA: o envio falhou e o texto da pessoa foi apagado. Ela '
            'escreveu de novo o que ja tinha escrito, no momento em que esta '
            'tentando recuperar um animal.',
      );
      expect(textoDaTela(tester), contains('A mensagem não foi enviada'));
      // E a saida precisa dizer o que fazer.
      expect(textoDaTela(tester), contains('Tentar de novo'));
    });

    testWidgets('ISCA: 429 tambem NAO limpa o campo', (tester) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
          'POST /v1/conversations/$idDaMinha/messages': (_) =>
              problema('rate-limited', 429),
        },
      );
      await abrirAMensagens(
        tester,
        servidor: servidor,
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      await tester.enterText(find.byType(TextField), digitado);
      await tester.tap(find.byTooltip('Enviar a mensagem'));
      await tester.pumpAndSettle();

      expect(
        tester.widget<TextField>(find.byType(TextField)).controller?.text,
        digitado,
        reason: 'REPROVA: o 429 apagou o texto. Ele e o caminho em que esperar '
            'e tentar de novo RESOLVE, e e justamente o pior para perder o '
            'que a pessoa escreveu.',
      );
    });

    testWidgets(
      'ISCA: `Tentar de novo` reenvia o MESMO texto, e so depois do 201 o '
      'campo e limpo',
      (tester) async {
        final corpos = <String>[];
        var tentativas = 0;
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
            'POST /v1/conversations/$idDaMinha/messages': (req) {
              corpos.add(req.body);
              tentativas++;
              if (tentativas == 1) throw http.ClientException('sem rede');
              return json200(
                mensagem(papel: 'tutor', corpo: digitado),
                status: 201,
              );
            },
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        await tester.enterText(find.byType(TextField), digitado);
        await tester.tap(find.byTooltip('Enviar a mensagem'));
        await tester.pumpAndSettle();

        await tester.tap(find.text('Tentar de novo'));
        await tester.pumpAndSettle();

        expect(tentativas, 2);
        expect(
          jsonDecode(corpos.last) as Map<String, dynamic>,
          <String, dynamic>{'body': digitado},
          reason: 'REPROVA: o reenvio mandou um corpo diferente do que a '
              'pessoa escreveu.',
        );
        expect(
          tester.widget<TextField>(find.byType(TextField)).controller?.text,
          isEmpty,
          reason: 'REPROVA: o 201 chegou e o campo nao foi limpo. A pessoa '
              'tocaria em Enviar de novo e mandaria a mesma mensagem duas '
              'vezes.',
        );
        expect(find.text(digitado), findsOneWidget);
      },
    );

    testWidgets(
      'CONTRAPESO: envio que deu 201 na primeira limpa o campo e desenha a '
      'mensagem',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) => json200(conversa()),
            'POST /v1/conversations/$idDaMinha/messages': (_) => json200(
              mensagem(papel: 'tutor', corpo: digitado),
              status: 201,
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        await tester.enterText(find.byType(TextField), digitado);
        await tester.tap(find.byTooltip('Enviar a mensagem'));
        await tester.pumpAndSettle();

        expect(
          tester.widget<TextField>(find.byType(TextField)).controller?.text,
          isEmpty,
          reason: 'REPROVA: sem este contrapeso, uma tela que NUNCA limpa o '
              'campo passaria nas tres iscas acima.',
        );
        expect(find.text(digitado), findsOneWidget);
        expect(textoDaTela(tester), isNot(contains('não foi enviada')));
      },
    );
  });

  // -------------------------------------------------------------------------
  group('a lista vazia, e o padrao de listagem', () {
    testWidgets(
      'a lista vazia e UMA LINHA, sem texto de apoio e sem botao',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[])),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.text('Você ainda não tem mensagens.'), findsOneWidget);
        expect(find.byType(LinhaDaConversa), findsNothing);
        // UMA LINHA: o texto da lista vazia e o unico `Text` do corpo, fora o
        // titulo da barra. O cliente mandou remover os textos de apoio.
        expect(
          find.descendant(
            of: find.byType(Padding),
            matching: find.byType(Text),
          ),
          findsWidgets,
        );
        expect(find.byType(ElevatedButton), findsNothing);
        expect(find.byType(OutlinedButton), findsNothing);
      },
    );

    testWidgets(
      'nada de busca, filtro nem ordenacao: nao ha o que recortar',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.byType(TextField), findsNothing);
        expect(find.byIcon(Icons.search), findsNothing);
        expect(find.byIcon(Icons.filter_list), findsNothing);
        expect(find.byIcon(Icons.swap_vert), findsNothing);
      },
    );

    testWidgets(
      'a paginacao e por CURSOR, e nunca por deslocamento',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  paginaDeConversas(<Map<String, dynamic>>[
                    conversa(nomeDoAchador: 'Marina'),
                  ], proximoCursor: 'cursor-da-pagina-2'),
                );
              }
              return json200(
                paginaDeConversas(<Map<String, dynamic>>[
                  conversa(
                    id: '0192f3a1-7b2c-7def-8a01-000000000002',
                    nomeDoAchador: 'Rafael',
                  ),
                ]),
              );
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        // A PRIMEIRA PAGINA NAO MANDA `cursor=`: mandar vazio reprovaria com
        // 400 na abertura da tela.
        final primeira = servidor.chamadasA('GET /v1/conversations').first;
        expect(primeira.url.queryParameters.containsKey('cursor'), isFalse);
        expect(primeira.url.queryParameters['limit'], '20');

        await tester.tap(find.text('Carregar mais conversas'));
        await tester.pumpAndSettle();

        final segunda = servidor.chamadasA('GET /v1/conversations').last;
        expect(segunda.url.queryParameters['cursor'], 'cursor-da-pagina-2');
        // NENHUM parametro de deslocamento, em nenhuma das duas.
        for (final chamada in servidor.chamadasA('GET /v1/conversations')) {
          for (final proibido in <String>['offset', 'page', 'skip']) {
            expect(
              chamada.url.queryParameters.containsKey(proibido),
              isFalse,
              reason: 'REPROVA: a lista mandou `$proibido`. O contrato so '
                  'declara `cursor` e `limit`, e paginar por deslocamento '
                  'reordena a lista embaixo de quem esta lendo cada vez que '
                  'uma mensagem nova chega.',
            );
          }
        }
        expect(find.text('Rafael  ·  Tobias'), findsOneWidget);
        expect(find.text('Marina  ·  Tobias'), findsOneWidget);
      },
    );

    testWidgets(
      'as mensagens ANTERIORES tambem vem por cursor, e entram no comeco',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (req) {
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  conversa(
                    mensagens: <Map<String, dynamic>>[
                      mensagem(corpo: 'a mais recente'),
                    ],
                    proximoCursor: 'cursor-das-anteriores',
                  ),
                );
              }
              return json200(
                conversa(
                  mensagens: <Map<String, dynamic>>[
                    mensagem(
                      id: '0192f3a1-7b2c-7def-8a01-00000000bbbb',
                      corpo: 'a mais antiga',
                    ),
                  ],
                ),
              );
            },
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        await tester.tap(find.text('Carregar mensagens anteriores'));
        await tester.pumpAndSettle();

        expect(
          servidor
              .chamadasA('GET /v1/conversations/$idDaMinha')
              .last
              .url
              .queryParameters['cursor'],
          'cursor-das-anteriores',
        );
        // A ORDEM: a antiga vem ANTES da recente na tela.
        final antiga = tester.getTopLeft(find.text('a mais antiga')).dy;
        final recente = tester.getTopLeft(find.text('a mais recente')).dy;
        expect(
          antiga,
          lessThan(recente),
          reason: 'REPROVA: as mensagens anteriores foram para o fim da lista. '
              'A conversa leria fora de ordem.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  group('o que o servidor retirou do texto, explicado', () {
    testWidgets(
      'mensagem com `redactions` ganha a explicacao; sem elas, nao ganha',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations/$idDaMinha': (_) => json200(
              conversa(
                mensagens: <Map<String, dynamic>>[
                  mensagem(
                    corpo: 'me liga no [retirado]',
                    retirados: <Map<String, dynamic>>[
                      <String, dynamic>{'kind': 'phone', 'hint': 'telefone'},
                    ],
                  ),
                ],
              ),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
        );

        expect(
          textoDaTela(tester),
          contains('Retiramos um dado de contato da mensagem'),
          reason: 'REPROVA: o contrato manda `redactions` exatamente para a '
              'interface explicar. Sem a explicacao, o remetente acha que foi '
              'censurado sem motivo -- ou pior, que a mensagem chegou inteira.',
        );
      },
    );

    testWidgets('CONTRAPESO: mensagem sem `redactions` nao ganha o aviso', (
      tester,
    ) async {
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations/$idDaMinha': (_) => json200(
            conversa(mensagens: <Map<String, dynamic>>[mensagem()]),
          ),
        },
      );
      await abrirAMensagens(
        tester,
        servidor: servidor,
        rotaInicial: RotasDeMensagens.conversaDe(idDaMinha),
      );

      expect(
        textoDaTela(tester),
        isNot(contains('Retiramos um dado de contato')),
      );
    });
  });

  // -------------------------------------------------------------------------
  // (e) O CONTADOR E A MARCA DE NAO LIDA (BICHUS-278)
  //
  // A regra, nas palavras do cliente via coordenacao: **"lido" e o ITEM
  // ABERTO, nao a lista vista.** Abrir a lista ZERA O NUMERO e os itens
  // CONTINUAM NAO LIDOS. Excecao nomeada: o aviso de plaquinha lida e o de
  // achado NAO saem do contador ao abrir a lista.
  //
  // A excecao e cumprida NO SERVIDOR (`contarParaOSino`, pelo `system_kind`), e
  // esta bancada prova o lado do app: que ele NAO recalcula o numero e NAO
  // apaga marca ao abrir a lista. Os dois lados juntos sao a regra; nenhum
  // sozinho e.
  // -------------------------------------------------------------------------
  group('(e) o contador vem do servidor, e abrir a lista nao marca itens', () {
    testWidgets(
      'ISCA: o contador e o do SERVIDOR, e nao a contagem dos itens da pagina',
      (tester) async {
        // 23 no sino, e UM item nao lido nesta pagina. Os numeros divergem de
        // proposito: e exatamente o que acontece com quem tem 57 conversas e
        // ve 20. Um app que contasse os itens mostraria 1.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(naoLida: true, previa: 'Achei ele na praça'),
                conversa(
                  id: '0192f3a1-7b2c-7def-8a01-000000000002',
                  nomeDoAchador: 'Rafael',
                ),
              ], naoLidas: 23),
            ),
          },
        );
        var contado = -1;
        await abrirAMensagens(
          tester,
          servidor: servidor,
          aoContar: (n) => contado = n,
        );

        expect(
          contado,
          23,
          reason: 'REPROVA: o app nao repassou o `unread_count` do servidor. '
              'Contar os itens da pagina mostraria 1 para quem tem 23, e o '
              'contador que mostra menos do que ha e pior que contador '
              'ausente.',
        );
        // E o SELO corta em `9+`, sem mexer no numero real.
        expect(seloDoContador(contado), '9+');
        // Mas quem OUVE a tela recebe o numero inteiro: o corte e de quem ve.
        expect(rotuloDoSino(contado), 'Mensagens, 23 não lidas');
      },
    );

    testWidgets(
      'ISCA: abrir a lista chama a rota de visto E NAO apaga a marca dos itens',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(naoLida: true, previa: 'Está comigo, pode vir'),
              ], naoLidas: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        // A rota de "visto" FOI chamada: e ela que zera o numero do sino.
        expect(
          servidor.chamadasA('POST /v1/me/conversations-seen'),
          hasLength(1),
          reason: 'REPROVA: abrir a area nao marcou a lista como vista, e o '
              'sino ficaria aceso para quem acabou de ler.',
        );
        // E A MARCA DO ITEM CONTINUA ACESA.
        final linha = tester.widget<LinhaDaConversa>(
          find.byType(LinhaDaConversa),
        );
        expect(
          linha.naoLida,
          isTrue,
          reason: 'REPROVA: abrir a lista apagou a marca do item. "Lido" e o '
              'item aberto: apagar aqui tira a unica pista de QUAL conversa '
              'guarda o recado -- que e o buraco que esta tela existe para '
              'fechar.',
        );
      },
    );

    testWidgets(
      'ISCA: a rota de visto NAO manda conversa nenhuma no corpo',
      (tester) async {
        // Se ela mandasse, alguem acabaria usando a lista para marcar as da
        // pagina como lidas -- o defeito exato que a regra proibe, entrando
        // pela porta do corpo da requisicao.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(naoLida: true),
              ], naoLidas: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final visto = servidor.chamadasA('POST /v1/me/conversations-seen').single;
        expect(
          visto.body,
          anyOf(isEmpty, '{}'),
          reason: 'REPROVA: a chamada de "visto" levou corpo. Ela zera o '
              'CONTADOR e nao marca item: um corpo com ids convidaria a '
              'marca-los.',
        );
        expect(visto.body, isNot(contains(idDaMinha)));
      },
    );

    testWidgets(
      'ISCA: o contador que chega ZERO nao desenha selo, e nao desenha "0"',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
          },
        );
        var contado = -1;
        await abrirAMensagens(
          tester,
          servidor: servidor,
          aoContar: (n) => contado = n,
        );
        expect(contado, 0);
        expect(
          seloDoContador(contado),
          isNull,
          reason: 'REPROVA: zero virou selo. Um `0` pintado chama o olho para '
              'dizer que nao ha motivo para olhar.',
        );
        expect(textoDaTela(tester), isNot(contains('0 não lidas')));
      },
    );

    testWidgets(
      'CONTRAPESO: sem marca no servidor, a linha NAO acende -- e o app nao '
      'inventa a marca a partir da previa',
      (tester) async {
        // `unread: false` com previa e horario presentes. Um app que acendesse
        // a marca "porque tem mensagem" passaria nas iscas acima e erraria
        // aqui, dizendo que ha recado novo para quem ja leu tudo.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(previa: 'Combinado, levo ela amanhã'),
              ]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.text('Combinado, levo ela amanhã'), findsOneWidget);
        expect(
          tester.widget<LinhaDaConversa>(find.byType(LinhaDaConversa)).naoLida,
          isFalse,
          reason: 'REPROVA: o app acendeu a marca sem o servidor ter dito que '
              'ha algo nao lido. Sem este contrapeso, uma tela que acende '
              'SEMPRE passaria nas iscas de cima.',
        );
      },
    );
  });

  // -------------------------------------------------------------------------
  // (f) A PREVIA NAO DESFAZ A REDACAO
  //
  // A garantia de verdade e ESTRUTURAL e esta no servidor: a previa sai de
  // `conversation_messages.body`, que ja esta redigido no banco, e o texto cru
  // nao existe em coluna nenhuma. O que esta bancada prova e o lado do app --
  // que ele pinta o que veio e **nao tem caminho proprio** para reconstruir o
  // dado nem para buscar o recado cru de outro campo.
  // -------------------------------------------------------------------------
  group('(f) a previa mostra o texto redigido, e nada alem', () {
    testWidgets(
      'ISCA: a previa redigida e pintada como veio, com o marcador do que saiu',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(
                  naoLida: true,
                  // E ASSIM que o servidor manda: o telefone JA saiu.
                  previa: 'me liga no [telefone removido] que eu levo',
                ),
              ], naoLidas: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final texto = textoDaTela(tester);
        expect(texto, contains('[telefone removido]'));
        // E NENHUM digito de telefone aparece em lugar nenhum da lista.
        expect(
          RegExp(r'\d{4,}').hasMatch(texto),
          isFalse,
          reason: 'REPROVA: sequencia de 4+ digitos na lista. A previa nao '
              'pode trazer de volta o que a redacao retirou -- e a lista e a '
              'superficie onde isso passaria sem ninguem abrir nada.',
        );
      },
    );

    testWidgets(
      'ISCA: o app NAO pede a conversa inteira para montar a previa da linha',
      (tester) async {
        // O caminho errado e curto e tentador: pedir `getConversation` por
        // linha so para ter o trecho. Sao 20 requisicoes antes de a lista
        // aparecer, na tela que o tutor abre com o telefone tocando -- e, pior,
        // o detalhe tem as MENSAGENS, de onde alguem montaria a previa a mao e
        // por outra regra.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(previa: 'Está comigo'),
                conversa(
                  id: '0192f3a1-7b2c-7def-8a01-000000000002',
                  previa: 'Levo amanhã',
                ),
              ]),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(
          servidor.chamadasA('GET /v1/conversations/$idDaMinha'),
          isEmpty,
          reason: 'REPROVA: a lista pediu a conversa inteira. A previa vem na '
              'propria pagina (`last_message_preview`), e pedir por linha e o '
              'N+1 que o servidor evitou de proposito.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO: sem previa na resposta, a linha nao pinta trecho nenhum -- '
      'e nao inventa um',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(<Map<String, dynamic>>[conversa()])),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(find.byType(LinhaDaConversa), findsOneWidget);
        expect(find.text('Marina  ·  Tobias'), findsOneWidget);
        // Nenhum texto de reserva, nenhum "sem mensagens", nenhum placeholder.
        expect(textoDaTela(tester), isNot(contains('Sem mensagens')));
        expect(textoDaTela(tester), isNot(contains('...')));
      },
    );
  });

  // -------------------------------------------------------------------------
  // (g) O DESTINO DO AVISO: a conversa nova em cima, com o pet nomeado
  // -------------------------------------------------------------------------
  group('(g) quem chega do aviso ve a conversa nova em cima', () {
    testWidgets(
      'a ordem da resposta e a ordem da tela, e o pet aparece nomeado',
      (tester) async {
        // O servidor ordena por `opened_at DESC`, e a conversa de uma plaquinha
        // recem-escaneada nasce AGORA -- entao ela vem primeiro na resposta. O
        // que esta tela precisa garantir e que ela NAO reordena: um `sort` aqui
        // por qualquer campo quebraria o destino do aviso em silencio.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(
                  nomeDoPet: 'Tobias',
                  nomeDoAchador: 'Marina',
                  naoLida: true,
                  previa: 'Alguém escaneou a plaquinha de Tobias',
                ),
                conversa(
                  id: '0192f3a1-7b2c-7def-8a01-000000000002',
                  nomeDoPet: 'Nina',
                  nomeDoAchador: 'Rafael',
                  previa: 'Combinado',
                ),
              ], naoLidas: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final primeira = tester.getTopLeft(find.text('Marina  ·  Tobias')).dy;
        final segunda = tester.getTopLeft(find.text('Rafael  ·  Nina')).dy;
        expect(
          primeira,
          lessThan(segunda),
          reason: 'REPROVA: a tela reordenou a resposta. Quem chega do aviso '
              'da plaquinha precisa achar a conversa nova EM CIMA -- se ela '
              'desce, a pessoa cata o recado na lista.',
        );
        // O PET NOMEADO na linha: e por ele que a pessoa reconhece o aviso.
        expect(find.textContaining('Tobias'), findsWidgets);
      },
    );
  });
}
