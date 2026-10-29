// OS MARCOS DA TRILHA DE CONVITES, DE VOLTA (29/10/2026).
//
// Decisao do cliente, verbatim: *"Sim, traga os marcos."*
//
// ===========================================================================
// DE ONDE ESTE ARQUIVO VEM, E POR QUE ELE NAO FOI ESCRITO DO ZERO
// ===========================================================================
//
// A tela `conexoes/convide_tutores.dart` morreu em `c8d80a07` (PR #96, o menu
// unificado). O cliente havia decidido que o **QR** e o **placar**
// (`invited_joined_count`) viajavam para `Meus dados`, e os dois viajaram. A
// tela tambem tinha a **`TrilhaDeConvites`** -- tres marcos, a classe
// `MarcoDeConvite` e cinco casos --, e **ninguem decidiu sobre ela**: saiu
// junto, por omissao. O proprio `6362efb2` registra isso com estas palavras:
// *"a `TrilhaDeConvites` (os tres marcos, `MarcoDeConvite`, e a prosa de como
// ela receberia premio sem redesenho) morreu, com cinco casos"*.
//
// **Os quatro casos do grupo abaixo sao os ORIGINAIS**, recuperados de
// `c8d80a07^:app/test/telas/convite_de_conexao_test.dart` (linhas 501-577).
// Nao foram reescritos: o desenho existia e foi aprovado, e ressuscitar e mais
// fiel que redesenhar. O que mudou foi o `import` -- a classe mudou de casa,
// porque `lib/telas/conexoes/convide_tutores.dart` **nao pode voltar ao
// disco**: `qr_do_convite_em_meus_dados_test.dart` tem uma isca que o proibe.
//
// ## O QUINTO CASO NAO VOLTOU VERBATIM, E ISSO ESTA REPORTADO
//
// Ele era `ISCA (e) -- zero do servidor e "Ninguem ainda", e nao trilha`, e
// media `_placarDoReconhecimento` da tela morta pelo texto `Ninguém ainda` --
// uma frase que **nao existe em `Meus dados`**, onde o placar e uma linha
// (`placarDeQuemEntrou`). Ressuscitar o texto seria trazer de volta um desenho
// que o protovipo aprovado substituiu. O que voltou e a **REGRA** dele, medida
// na casa nova: `zero NAO desenha trilha`, abaixo.
//
// ## ONDE OS MARCOS ENTRAM, E POR QUE ELES NAO DOMINAM A PAGINA
//
// Dentro do **mesmo bloco recolhido** do QR e do placar, depois da linha do
// placar. `Meus dados` e a pagina dos dados pessoais, e o bloco do convite
// **nasce fechado** (48 dp, uma linha, ultimo bloco da pagina): fechado, a
// trilha custa ZERO dp -- ela nao empurra nada. Nenhuma tipografia foi
// encolhida para caber, porque nao houve nada a encolher.
library;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/trilha_de_convites.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Quantas pessoas a conta trouxe, pela resposta do resumo.
int _trazidos = 2;

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'handle': 'marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 7,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': _trazidos,
    });
  }
  return problema('not-found', 404);
}

Future<void> _abrirOConvite(WidgetTester tester) async {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await abrirOApp(tester, rede: _servidor, deposito: depositoLogado());
  await irPara(tester, Rotas.dadosPessoais);
  await tester.pumpAndSettle();
  await tocar(tester, find.text(TelaDadosPessoais.tituloDoConvite));
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => _trazidos = 2);

  // =========================================================================
  // OS QUATRO CASOS ORIGINAIS, de `c8d80a07^`. Nao reescritos.
  // =========================================================================
  group('a trilha de progresso, desenhada para receber premio depois', () {
    testWidgets('marca o alcancado e diz o que falta para o proximo', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: TrilhaDeConvites(quantos: 2)),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(
          '2 tutores entraram no Bichu com o seu convite e já cadastraram um '
          'pet.',
        ),
        findsOneWidget,
        reason: 'REPROVA: a frase não diz a REGRA pela qual alguém conta. O '
            'contador que soma sem explicar é o que faz a pessoa achar que o '
            'produto errou.',
      );
      expect(find.text('Faltam 1 para “Três olhos a mais”'), findsNothing);
      expect(
        find.text('Falta 1 para “Três olhos a mais”.'),
        findsOneWidget,
        reason: 'REPROVA: a gramática do singular não está certa, ou o próximo '
            'marco está errado.',
      );
    });

    testWidgets('nenhum premio material e prometido', (tester) async {
      // A plaquinha da coleira **já é de graça** no produto: não há cobrança
      // por ela em lugar nenhum, então "convide 3 e ganhe a plaquinha" não
      // entregaria nada -- e uma recompensa que não é recompensa ensina a
      // pessoa a não acreditar na próxima.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(body: TrilhaDeConvites(quantos: 2)),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining('plaquinha'),
        findsNothing,
        reason: 'REPROVA: a trilha promete a plaquinha, que já é de graça.',
      );
      expect(find.textContaining('grátis'), findsNothing);
      expect(find.textContaining('de graça'), findsNothing);
    });

    test('a forma ja serve para premio: o marco e um par (numero, o que vem)',
        () {
      // Não há nada em `TrilhaDeConvites` que suponha que o marco é simbólico:
      // ela não sabe o que entrega, só em que número entrega. Trocar a palavra
      // de um marco por um prêmio é trocar o texto daquele par.
      const trilha = TrilhaDeConvites(
        quantos: 0,
        marcos: <MarcoDeConvite>[
          MarcoDeConvite(3, 'a plaquinha de graça'),
        ],
      );
      expect(trilha.proximo?.rotulo, 'a plaquinha de graça');
      expect(
        trilha.proximo?.quantoFalta(0),
        'Faltam 3 para “a plaquinha de graça”.',
      );
    });

    test('quem alcancou tudo nao fica a zero de nada', () {
      const trilha = TrilhaDeConvites(quantos: 99);
      expect(
        trilha.proximo,
        isNull,
        reason: 'REPROVA: quem chegou ao fim da trilha recebeu um próximo '
            'marco. Uma frase de progresso ali seria um progresso que não '
            'existe.',
      );
    });
  });

  // =========================================================================
  // A CASA NOVA: os marcos dentro do bloco do convite em `Meus dados`.
  // =========================================================================
  group('os marcos em `Meus dados` (29/10/2026)', () {
    testWidgets('os marcos estao no bloco do convite, com o placar', (
      tester,
    ) async {
      // PARA DESLIGAR E VER REPROVAR: em `_conteudo` de `_BlocoDoConvite`,
      // tire o `TrilhaDeConvites` do ramo de `quantos != null`.
      _trazidos = 2;
      await _abrirOConvite(tester);

      expect(
        find.byType(TrilhaDeConvites),
        findsOneWidget,
        reason: 'REPROVA: os marcos nao voltaram. O cliente pediu em '
            '29/10/2026 -- *"Sim, traga os marcos."* -- e eles morreram por '
            'OMISSAO em `c8d80a07`, nao por decisao.',
      );
      expect(
        find.text(TelaDadosPessoais.placarDeQuemEntrou(2)),
        findsOneWidget,
        reason: 'REPROVA: a trilha entrou no lugar do placar. O placar e UMA '
            'LINHA pelo protovipo aprovado, e a trilha SOMA a ela -- trazer '
            'os marcos nao foi autorizacao para desfazer o desenho do '
            'placar.',
      );
    });

    testWidgets('o placar NAO e dito duas vezes', (tester) async {
      // PARA DESLIGAR E VER REPROVAR: troque `comAFrase: false` por `true` na
      // chamada de `TrilhaDeConvites` em `_BlocoDoConvite`.
      //
      // A trilha nasceu numa tela DEDICADA, onde a frase dela era o cabecalho
      // da pagina. Aqui o placar ja diz o numero uma linha acima: deixar a
      // frase da trilha poria duas frases dizendo a mesma coisa, uma embaixo
      // da outra -- e `Meus dados` e a pagina dos dados pessoais, nao a do
      // convite.
      _trazidos = 2;
      await _abrirOConvite(tester);

      expect(
        find.textContaining('com o seu convite e já cadastraram'),
        findsNothing,
        reason: 'REPROVA: a frase-cabecalho da trilha voltou junto com os '
            'marcos, e agora o mesmo numero e afirmado duas vezes seguidas.',
      );
    });

    testWidgets(
      'ZERO nao desenha trilha -- a REGRA do quinto caso, na casa nova',
      (tester) async {
        // O quinto caso original media isto pelo texto `Ninguém ainda`, que
        // nao existe em `Meus dados`. A regra e a mesma: zero e uma AFIRMACAO
        // do servidor de que ninguem entrou, e desenhar tres marcos todos
        // apagados afirmaria um progresso que **nao comecou**.
        _trazidos = 0;
        await _abrirOConvite(tester);

        expect(
          find.byType(TrilhaDeConvites),
          findsNothing,
          reason: 'REPROVA: a trilha foi desenhada com zero. O vazio e o '
              'estado de quem ainda nao trouxe ninguem.',
        );
        expect(
          find.text(TelaDadosPessoais.criarOConvite),
          findsOneWidget,
          reason: 'REPROVA: com zero a secao perdeu a acao de criar. O QR e o '
              'que a pessoa veio buscar, e ele nao depende do numero.',
        );
      },
    );

    testWidgets('resumo que FALHA nao desenha trilha nenhuma', (tester) async {
      // Nulo e "nao consegui perguntar", e nao "ninguem ainda". Desenhar a
      // trilha sobre uma pergunta sem resposta seria afirmar progresso que o
      // servidor nao relatou -- e para quem trouxe dez pessoas e uma mentira
      // visivel. O bloco do QR continua inteiro: o placar e reconhecimento.
      _trazidos = -1; // marca o servidor falso para responder 404 ao resumo
      tester.view.physicalSize = const Size(1170, 7800);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await abrirOApp(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/connections/summary') {
            return problema('not-found', 404);
          }
          return _servidor(req);
        },
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.dadosPessoais);
      await tester.pumpAndSettle();
      await tocar(tester, find.text(TelaDadosPessoais.tituloDoConvite));
      await tester.pumpAndSettle();

      expect(
        find.byType(TrilhaDeConvites),
        findsNothing,
        reason: 'REPROVA: a falha de leitura do resumo virou trilha '
            'desenhada. Nulo nao e zero, e nenhum dos dois e progresso.',
      );
      expect(
        find.text(TelaDadosPessoais.criarOConvite),
        findsOneWidget,
        reason: 'REPROVA: a falha do placar levou embora o que a pessoa veio '
            'fazer aqui.',
      );
    });
  });
}
