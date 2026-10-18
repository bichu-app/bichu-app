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
  'next_cursor': proximoCursor,
};

Map<String, dynamic> paginaDeConversas(
  List<Map<String, dynamic>> itens, {
  String? proximoCursor,
}) => <String, dynamic>{'items': itens, 'next_cursor': proximoCursor};

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
    if (resposta == null) return problema('not-found', 404);
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
}) async {
  final api = apiDe(servidor);
  final roteador = GoRouter(
    initialLocation: rotaInicial,
    routes: <RouteBase>[
      GoRoute(
        path: RotasDeMensagens.area,
        builder: (context, estado) => AreaDeMensagens(conversas: api),
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
}
