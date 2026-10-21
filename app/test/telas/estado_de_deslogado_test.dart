// O ESTADO DE DESLOGADO DAS SECOES QUE EXIGEM CONTA.
//
// Pedido do cliente de 19/10/2026, depois de testar no iPhone: *"mas tem que
// ter uma pagina de deslogado, nao da para mostrar so uma mensagem de erro
// para atualizar"*.
//
// **O servidor nao estava fora**, e isso foi medido na homologacao no mesmo
// dia: `/v1/directory/entries` e `/v1/conversations` respondem
// `401 unauthenticated` com `next_action: sign_in` sem token e `200` com
// token, e `/v1/auth/refresh` devolve par novo. O defeito era do app.
//
// ---------------------------------------------------------------------------
// COMO ESTE ARQUIVO EVITA SER UM PORTAO CEGO
// ---------------------------------------------------------------------------
// Sete portoes cegos foram achados nesta rodada, e tres das formas deles
// atacariam exatamente este arquivo:
//
// 1. **`findsNothing` sobre texto que a tela nao diz mais.** Todo
//    `findsNothing` daqui tem um CONTRAPESO no mesmo grupo: um caso que prova
//    que a mesma busca ACHA algo quando deve. Sem o contrapeso, apagar a
//    faixa de erro do produto inteiro deixaria o grupo verde.
// 2. **`abrirOApp` chamado duas vezes medindo o estado logado.** Cada caso
//    daqui chama `abrirOApp` UMA vez, e todos declaram o estado de sessao com
//    `exigirEstadoDeSessao` ANTES de olhar a tela. `pumpWidget` do mesmo tipo
//    reaproveita o `State`, entao um segundo `abrirOApp` no mesmo caso mediria
//    a tela do primeiro.
// 3. **Ancorar em texto e nao no widget.** Os casos ancoram em
//    `find.byType(ConviteParaEntrar)` e `find.byType(FaixaDeAviso)`, e so
//    depois conferem a microcopy -- escrita por extenso, com acento, e nunca
//    comparada com a constante que a produz.

import 'dart:convert';

import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/convite_para_entrar.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A rede
// ---------------------------------------------------------------------------

/// O 401 que o servidor de verdade manda, **com `next_action`**.
///
/// Medido na homologacao em 19/10/2026:
/// `{"type":".../problems/unauthenticated","title":"Entre para continuar",`
/// `"status":401,...,"next_action":"sign_in"}`.
///
/// O `next_action` nao e enfeite: e por ele que o app decide, e um caso que o
/// omitisse estaria exercitando um 401 que o servidor nao manda.
http.Response semConta() => problema(
      'unauthenticated',
      401,
      extra: const <String, dynamic>{'next_action': 'sign_in'},
    );

/// Um 500 sem `next_action`: **servidor fora de verdade**.
///
/// E o contrapeso de todo `findsNothing` deste arquivo.
http.Response servidorFora() => http.Response(
      jsonEncode(const <String, dynamic>{
        'type': 'https://api.bichu.app/problems/internal',
        'title': 'Nao foi possivel concluir',
        'status': 500,
      }),
      500,
      headers: const <String, String>{
        'content-type': 'application/problem+json; charset=utf-8',
      },
    );

/// Um 200 com corpo que **nao e JSON**.
///
/// E o caminho de `on FormatException` das listagens: resposta de proxy, HTML
/// de portal cativo, corpo truncado. **Nao e 5xx**: o status diz que deu
/// certo, e o que falha e a leitura.
http.Response corpoForaDoContrato() => http.Response(
      '<html>nao e json</html>',
      200,
      headers: const <String, String>{
        'content-type': 'application/json; charset=utf-8',
      },
    );

/// Uma pagina vazia de conversas, no formato de `ConversationPage`.
Map<String, dynamic> paginaDeConversasVazia() => const <String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'unread_count': 0,
      'next_cursor': null,
    };

/// Uma pagina vazia do diretorio, no formato de `DirectoryEntryPage`.
Map<String, dynamic> paginaDoDiretorioVazia() => const <String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'page': 1,
      'limit': 20,
      'total': 0,
      'distance_available': false,
      'applied_filters': <String, String>{'scope': 'all'},
    };

/// A rede que responde [resposta] ao diretorio e as conversas, e 404 no resto.
///
/// 404 no resto, e nao 200 vazio: um caso que dependesse de uma chamada nao
/// declarada aqui precisa falhar alto.
Future<http.Response> Function(http.Request) redeDasDuasSecoes(
  http.Response Function(http.Request) resposta, {
  /// A resposta de `POST /v1/auth/refresh`. Nula significa "nenhum caso deste
  /// grupo renova", e a rota responde 404 -- alto, e nao em silencio.
  http.Response Function(http.Request)? aoRenovar,
}) {
  return (req) async {
    final chave = '${req.method} ${req.url.path}';
    if (chave == 'POST /v1/auth/refresh' && aoRenovar != null) {
      return aoRenovar(req);
    }
    // A area de mensagens marca a lista como vista depois de carregar; ela
    // nao e o assunto de nenhum caso e responde 204.
    if (chave == 'POST /v1/me/conversations-seen') {
      return http.Response('', 204);
    }
    if (chave == 'GET /v1/directory/entries' ||
        chave == 'GET /v1/conversations' ||
        req.url.path.startsWith('/v1/conversations/')) {
      return resposta(req);
    }
    return problema('not-found', 404);
  };
}

// ---------------------------------------------------------------------------
// As guardas que impedem o caso de medir a sessao errada
// ---------------------------------------------------------------------------

/// **Declara, e confere, em que estado de sessao o caso esta.**
///
/// Existe porque o defeito e invisivel: um caso que monte o app logado e diga
/// no nome que mede o deslogado passa, e passa pelo motivo errado. Aqui o
/// estado e lido do CONTROLADOR montado, e nao suposto pelo deposito que o
/// caso passou -- entre os dois ha o arranque, a leitura do chaveiro e a
/// renovacao.
void exigirEstadoDeSessao(
  WidgetTester tester, {
  required EstadoDaSessao estado,
  required MotivoSemConta motivo,
}) {
  final sessao = escopoDoApp(tester).sessao;
  expect(
    sessao.estado,
    estado,
    reason: 'REPROVA: o caso queria medir a tela de $estado e o app esta em '
        '${sessao.estado}. O resultado do caso nao diz nada sobre o que ele '
        'se propoe a medir.',
  );
  expect(
    sessao.motivoSemConta,
    motivo,
    reason: 'REPROVA: o motivo de nao haver conta e ${sessao.motivoSemConta} '
        'e o caso queria $motivo. "Nunca entrou" e "a sessao caiu" levam a '
        'textos diferentes, e medir um achando que mede o outro e o defeito '
        'que esta entrega existe para consertar.',
  );
}

/// Um deposito com uma sessao **ja vencida**, que forca a renovacao no
/// arranque.
///
/// `expiraEm` no passado faz `Sessao.quaseExpirado` ser verdadeiro, e
/// `ControladorDeSessao.iniciar` dispara `tokenValido()` -- o unico caminho do
/// app que chega a `POST /auth/refresh` sem alguem tocar em nada. E o estado
/// de quem deixou o app aberto no bolso por mais de quinze minutos.
DepositoEmMemoria depositoVencido() {
  final deposito = DepositoEmMemoria()
    ..gravar(
      Sessao(
        accessToken: 'token-vencido',
        refreshToken: 'refresh-vencido',
        expiraEm: DateTime.now().subtract(const Duration(minutes: 5)),
        usuario: const Usuario(
          id: 'u-caiu',
          email: 'marina@exemplo.com.br',
          emailVerificado: true,
          canalConfirmado: true,
          pendencias: <PendenciaDeCadastro>[],
          podeAbrirCaso: true,
        ),
      ),
    );
  return deposito;
}

/// O texto que o convite mostra, lido da ARVORE e nao da constante.
List<String> frasesDoConvite(WidgetTester tester) {
  final convite = find.byType(ConviteParaEntrar);
  expect(
    convite,
    findsOneWidget,
    reason: 'REPROVA: nao ha `ConviteParaEntrar` na tela.',
  );
  return tester
      .widgetList<Text>(find.descendant(of: convite, matching: find.byType(Text)))
      .map((Text t) => t.data ?? '')
      .where((String s) => s.isNotEmpty)
      .toList(growable: false);
}

void main() {
  // -------------------------------------------------------------------------
  group('ISCA (a): deslogado, `Perto` e as mensagens convidam a entrar, e NAO '
      'mostram erro nem botao de atualizar', () {
    // MECANISMO: o ramo `if (_faltaConta)` de
    // `lib/telas/perto/lista_do_diretorio.dart` e de
    // `lib/telas/mensagens/area_de_mensagens.dart`. Desligados, as duas telas
    // voltam a desenhar `FaixaDeAviso` -- no diretorio com texto VAZIO, porque
    // o catalogo devolve `''` para `unauthenticated` desde 18/10 -- com
    // `Atualizar` e `Tentar de novo` ao lado.

    testWidgets('`Perto` mostra o convite, e nenhuma faixa de erro',
        (tester) async {
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => semConta()),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a tela de quem nao tem conta esta desenhando uma '
            'faixa de aviso. Sem conta nao e erro.',
      );
      expect(
        find.text('Atualizar'),
        findsNothing,
        reason: 'REPROVA: ha um `Atualizar` na tela. Recarregar sai '
            'igualmente sem conta e volta o mesmo 401 -- e o botao que o '
            'cliente reclamou.',
      );
      expect(find.text('Tentar de novo'), findsNothing);

      // A microcopy, por extenso.
      expect(find.text('Quem atende bem, perto de você'), findsOneWidget);
      expect(
        frasesDoConvite(tester).join(' | '),
        contains('Entre para ver os profissionais'),
      );
      // AS DUAS PORTAS, e nao uma.
      expect(find.widgetWithText(BotaoPrimario, 'Entrar'), findsOneWidget);
      expect(find.text('Criar conta'), findsOneWidget);
    });

    testWidgets('as mensagens mostram o convite, e nenhuma faixa de erro',
        (tester) async {
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => semConta()),
      );
      await abrirAAba(tester, 'AuAu');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.byType(FaixaDeAviso), findsNothing);
      expect(
        find.text('Tentar de novo'),
        findsNothing,
        reason: 'REPROVA: a area de mensagens esta oferecendo `Tentar de '
            'novo` a quem nao tem conta.',
      );
      expect(
        find.textContaining('Não conseguimos carregar suas mensagens'),
        findsNothing,
        reason: 'REPROVA: o 401 esta caindo no texto de falha de carga.',
      );
      expect(find.text('Suas conversas ficam aqui'), findsOneWidget);
      expect(find.text('Criar conta'), findsOneWidget);
    });

    testWidgets(
        'CONTRAPESO: com 500 as duas telas VOLTAM a mostrar faixa e botao',
        (tester) async {
      // **Sem este caso os dois de cima sao vacuos.** Eles provariam apenas
      // que a palavra `Atualizar` nao existe mais em lugar nenhum do app, o
      // que ficaria verde se alguem apagasse a faixa de erro do produto
      // inteiro. Aqui a MESMA busca tem de achar.
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => servidorFora()),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: um 500 nao e falta de conta. Trocar a tela de quem '
            'esta logada por um convite para entrar porque o servidor caiu '
            'diria a ela que a conta dela nao existe.',
      );
      expect(find.byType(FaixaDeAviso), findsOneWidget);
      expect(find.text('Atualizar'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('ISCA (b): sessao expirada diz `entre de novo`, e NAO oferece criar '
      'conta', () {
    // MECANISMO: `MotivoSemConta.sessaoCaiu`, marcado em
    // `ControladorDeSessao._renovar` quando o refresh volta 401, e lido por
    // `ConviteParaEntrar`. Desligado (o campo nunca saindo de `nuncaEntrou`),
    // a tela convida quem JA TEM conta a criar uma segunda -- perdendo os
    // pets, as conversas e os achados da primeira.

    testWidgets('o refresh recusado leva ao convite de sessao expirada',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoVencido(),
        rede: redeDasDuasSecoes(
          (_) => semConta(),
          // O 401 que o servidor manda de verdade neste caminho. Medido:
          // `token-expired`, `title: "Entre de novo"`, `next_action: sign_in`.
          aoRenovar: (_) => problema(
            'token-expired',
            401,
            extra: const <String, dynamic>{'next_action': 'sign_in'},
          ),
        ),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.sessaoCaiu,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Sua sessão expirou'), findsOneWidget);
      expect(
        frasesDoConvite(tester).join(' | '),
        contains('Entre de novo para ver quem atende perto de você.'),
      );
      expect(
        find.text('Criar conta'),
        findsNothing,
        reason: 'REPROVA: esta pessoa TEM conta -- ela acabou de ser posta '
            'para fora de uma. Oferecer `Criar conta` a convida a abandonar '
            'os pets, as conversas e os achados que ela ja tem.',
      );
      // A saida que existe continua existindo.
      expect(find.widgetWithText(BotaoPrimario, 'Entrar'), findsOneWidget);
      expect(
        find.text('Quem atende bem, perto de você'),
        findsNothing,
        reason: 'REPROVA: a tela esta explicando a secao a quem ja estava '
            'dentro dela.',
      );
    });

    testWidgets(
        'CONTRAPESO: quem NUNCA entrou ve `Criar conta` na mesma tela',
        (tester) async {
      // Sem este caso, o `findsNothing` de `Criar conta` acima passaria com o
      // botao apagado do widget. E o mesmo instrumento, no outro motivo.
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => semConta()),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.text('Criar conta'), findsOneWidget);
      expect(find.text('Sua sessão expirou'), findsNothing);
    });
  });

  // -------------------------------------------------------------------------
  group('ISCA (c): logado, nenhuma das duas secoes mostra convite', () {
    // MECANISMO: a condicao `faltaConta`, que le `next_action` do corpo do
    // servidor. Desligada -- devolvendo `true` para qualquer `FalhaDaApi` --,
    // uma falha de servidor passa a trocar a tela de quem ESTA dentro por um
    // convite para entrar, dizendo a ela que a conta dela nao existe porque o
    // servidor caiu.
    //
    // **O caso falsificavel deste grupo e o do 500 com conta.** Os outros dois
    // dizem o que a regua e, e a nao-vacuidade deles vem de a MESMA busca
    // (`find.byType(ConviteParaEntrar)`) achar o convite na isca (a).

    testWidgets('ISCA: logada, um 500 mostra faixa e NAO mostra convite',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: redeDasDuasSecoes((_) => servidorFora()),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: ha um convite para entrar na tela de quem ESTA '
            'dentro. A decisao tem de sair de `next_action`, e nao de "a '
            'carga falhou".',
      );
      expect(find.byType(FaixaDeAviso), findsOneWidget);
      expect(find.text('Atualizar'), findsOneWidget);
    });

    testWidgets('REGUA: logada e carregando bem, a secao abre sem convite',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: redeDasDuasSecoes(
          (http.Request req) => req.url.path == '/v1/conversations'
              ? json200(paginaDeConversasVazia())
              : json200(paginaDoDiretorioVazia()),
        ),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsNothing);
      // A MESMA sessao, a outra secao: `abrirAAba` troca de aba sem remontar
      // o app, entao isto continua sendo UMA montagem e o estado conferido
      // acima continua valendo.
      await abrirAAba(tester, 'AuAu');
      expect(find.byType(ConviteParaEntrar), findsNothing);
      expect(
        find.text('Você ainda não tem mensagens.'),
        findsOneWidget,
        reason: 'REPROVA: a lista vazia de quem esta logada nao apareceu, '
            'entao este caso nao provou que chegou a secao.',
      );
    });

    testWidgets(
        'REGUA: logada com o e-mail PENDENTE tambem nao ve convite',
        (tester) async {
      // **`Sem conta` nao e `e-mail nao confirmado`.** A regua do convite e
      // SESSAO, e nao `podeCriarNaComunidade` (sessao **e** e-mail
      // confirmado). Medido na homologacao: uma conta nova traz
      // `pending_profile_fields: ["email_verification","phone",`
      // `"reference_area"]` e as rotas de LEITURA respondem 200 para ela.
      //
      // O 500 aqui, e nao um 200: assim este caso tambem reprova com
      // `faltaConta` desligada, em vez de passar por nao haver falha nenhuma.
      await abrirOApp(
        tester,
        deposito: depositoLogado(
          id: 'u-sem-email',
          emailVerificado: false,
          pendencias: const <PendenciaDeCadastro>[
            PendenciaDeCadastro.verificacaoDeEmail,
          ],
        ),
        rede: redeDasDuasSecoes((_) => servidorFora()),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: quem nao confirmou o e-mail tem conta, le a secao, '
            'e o caminho dela e o aviso de `Confirme seu e-mail` -- nao um '
            'convite para entrar numa conta em que ela ja esta.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('ISCA (a, por link profundo): a CONVERSA aberta por notificacao '
      'tambem convida, e nao oferece `Tentar de novo`', () {
    // MECANISMO: o ramo `if (_faltaConta)` de
    // `lib/telas/mensagens/tela_da_conversa.dart`.
    //
    // **Esta tela nao e alcancada pela area de mensagens**: ela e o destino do
    // TOQUE NA NOTIFICACAO, e quem foi deslogada chega nela direto. Sem o
    // ramo, a pessoa le `Nao conseguimos carregar suas mensagens. Toque em
    // Tentar de novo.` -- e o 401 e indiferente a quantas vezes ela tocar.
    //
    // Medido na homologacao: `/v1/conversations/{id}` sem token responde
    // `401 unauthenticated` com `next_action: sign_in`, e nao 404. O 404
    // daquela rota e para conversa que EXISTE e nao e sua (ADR-0021).

    const String idDaConversa = '01a00000-0000-7000-8000-000000000000';

    testWidgets('ISCA: o convite no lugar do erro, e sem caixa de texto',
        (tester) async {
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => semConta()),
      );
      await irPara(tester, '/mensagens/$idDaConversa');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.byType(FaixaDeAviso), findsNothing);
      expect(find.text('Tentar de novo'), findsNothing);
      expect(
        find.textContaining('Não conseguimos carregar suas mensagens'),
        findsNothing,
      );
      expect(
        find.widgetWithText(TextField, 'Escreva uma mensagem'),
        findsNothing,
        reason: 'REPROVA: ha uma caixa de texto na tela de quem nao tem '
            'conta. O envio responderia o mesmo 401 -- e um controle sem '
            'desfecho.',
      );
      expect(find.text('As conversas ficam na sua conta'), findsOneWidget);
    });

    testWidgets(
        'CONTRAPESO: com 500 a MESMA tela volta a mostrar faixa e botao',
        (tester) async {
      // Sem este caso os `findsNothing` acima provariam apenas que as
      // palavras sairam do app.
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((_) => servidorFora()),
      );
      await irPara(tester, '/mensagens/$idDaConversa');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(find.byType(ConviteParaEntrar), findsNothing);
      expect(find.byType(FaixaDeAviso), findsOneWidget);
      expect(find.text('Tentar de novo'), findsOneWidget);
    });
  });

  // -------------------------------------------------------------------------
  group('A bandeira de falta de conta nao fica presa entre cargas', () {
    // MECANISMO: `_faltaConta = false` no comeco de `_carregar`, em
    // `lista_do_diretorio.dart`.
    //
    // **A SEGUNDA CARGA E UM 200 COM CORPO FORA DO CONTRATO, e as duas
    // escolhas obvias foram medidas e descartadas:**
    //
    // - **200 valido** passava com a bandeira presa. O ramo do convite mora
    //   DENTRO do ramo de falha, entao com a lista carregada a tela nem
    //   consulta a bandeira. Portao cego.
    // - **500** tambem passava, e por um motivo diferente: o `catch` de
    //   `FalhaDeChamada` REATRIBUI a bandeira (`_faltaConta = faltaConta(...)`),
    //   entao ela se corrige sozinha sem precisar da limpeza do comeco.
    //
    // O unico caminho em que a limpeza do comeco e de fato o que segura a
    // tela e o `on FormatException`, que nao toca na bandeira. Ele nao e
    // hipotetico: e a resposta de proxy, o HTML de portal cativo, o corpo
    // truncado. Com a bandeira presa, a pessoa le "entre na sua conta" porque
    // o corpo veio quebrado.
    //
    // O caminho e o real: `ListaDoDiretorio` recarrega quando a aba volta a
    // aparecer (`didChangeDependencies` com `TickerMode`).

    testWidgets(
        'ISCA: 401 e depois um corpo fora do contrato mostra faixa, e nao o '
        'convite',
        (tester) async {
      var vezes = 0;
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes((http.Request req) {
          if (req.url.path != '/v1/directory/entries') {
            return json200(paginaDeConversasVazia());
          }
          vezes += 1;
          return vezes == 1 ? semConta() : corpoForaDoContrato();
        }),
      );
      await abrirAComunidade(tester);

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );
      expect(
        find.byType(ConviteParaEntrar),
        findsOneWidget,
        reason: 'REPROVA: a primeira carga nao mostrou o convite, entao a '
            'segunda metade deste caso nao prova que ele SAIU.',
      );

      // **SAIR DA SECAO E VOLTAR, e agora sair quer dizer OUTRA SECAO.**
      //
      // O caso trocava de `Perto` para `Rede` e voltava, e as duas eram
      // secoes. Em 19/10 `Perto` virou a ABA `Comunidade` da `Rede`: ir para
      // `Rede` deixou de sair de lugar nenhum, e a recarga por `TickerMode`
      // nao acontecia -- o caso ficava sem a segunda carga que ele existe
      // para medir. `Loja` e a secao vizinha que nao chama esta rota.
      await abrirAAba(tester, 'Loja');
      await abrirAComunidade(tester);

      expect(
        vezes,
        greaterThan(1),
        reason: 'REPROVA: a lista nao recarregou ao voltar para a aba, entao '
            'este caso nao mediu a carga seguinte.',
      );
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: o convite ficou na tela numa falha de LEITURA. A '
            'bandeira de falta de conta nao e limpada no comeco da carga, e a '
            'tela passa a dizer "entre na sua conta" porque o corpo veio '
            'fora do contrato.',
      );
      expect(find.byType(FaixaDeAviso), findsOneWidget);
      expect(find.text('Atualizar'), findsOneWidget);
    });
  });
}
