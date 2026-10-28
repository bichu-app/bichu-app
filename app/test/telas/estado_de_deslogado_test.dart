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

import 'package:bichu/roteamento/rotas.dart';

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

/// Uma pagina do diretorio **SEM CONTA**, no formato de
/// `PublicDirectoryEntryPage` (`listPublicDirectoryEntries`, 27/10/2026).
///
/// **`phone_e164`, `site_url`, `distance_m` e `about` NAO APARECEM**, e nao
/// aparecem nem como nulo: o schema publico nao os declara, porque
/// `portao-contrato-publico.ts` proibe os dois primeiros por nome exato em
/// operacao alcancavel sem conta. Um esboco que os mandasse estaria medindo
/// uma resposta que o servidor nao pode produzir.
Map<String, dynamic> paginaPublicaDoDiretorio() => const <String, dynamic>{
      'items': <Map<String, dynamic>>[
        <String, dynamic>{
          'slug': 'clinica-santa-barbara',
          'kind': 'clinic',
          'kinds': <String>['clinic'],
          'entity_kind': 'organization',
          'display_name': 'Clínica Santa Bárbara',
          'city': 'São Paulo',
          'state': 'SP',
          'neighborhood': 'Pinheiros',
          'verification': <String, dynamic>{
            'level': 'document_verified',
            'evidence_kinds': <String>['cnpj'],
          },
        },
      ],
      'page': 1,
      'limit': 20,
      'total': 1,
      // Sempre falso nesta operacao: sem conta nao ha ponto de onde medir.
      'distance_available': false,
      'applied_filters': <String, String>{'scope': 'all'},
    };

/// A rede que responde [resposta] as DUAS leituras do `Mural`, e 404 no resto.
///
/// **As duas, e nao so a linha do tempo.** `tela_do_mural.dart` chama
/// `linhaDoTempo()` e `minhasPublicacoes()` em sequencia dentro do MESMO
/// `try`: um caso que respondesse 404 a segunda estaria medindo o 404 dela, e
/// nao o 401 que ele se propoe a medir — e passaria, porque 404 tambem produz
/// faixa.
Future<http.Response> Function(http.Request) redeDoMural(
  http.Response Function(http.Request) resposta, {
  /// A resposta de `POST /v1/auth/refresh`. Nula significa "nenhum caso deste
  /// grupo renova", e a rota responde 404 -- alto, e nao em silencio.
  ///
  /// Entrou em 27/10/2026 com a mudanca da `Comunidade`: a isca de sessao
  /// expirada precisava de uma tela que AINDA ponha muro na lista inteira, e
  /// passou a ser o `Mural`. Ver o grupo `ISCA (b)`.
  http.Response Function(http.Request)? aoRenovar,
}) {
  return (req) async {
    final chave = '${req.method} ${req.url.path}';
    if (chave == 'POST /v1/auth/refresh' && aoRenovar != null) {
      return aoRenovar(req);
    }
    if (chave == 'GET /v1/timeline' || chave == 'GET /v1/me/publications') {
      return resposta(req);
    }
    return problema('not-found', 404);
  };
}

/// A rede que responde [resposta] ao diretorio e as conversas, e 404 no resto.
///
/// 404 no resto, e nao 200 vazio: um caso que dependesse de uma chamada nao
/// declarada aqui precisa falhar alto.
Future<http.Response> Function(http.Request) redeDasDuasSecoes(
  http.Response Function(http.Request) resposta, {
  /// A resposta de `POST /v1/auth/refresh`. Nula significa "nenhum caso deste
  /// grupo renova", e a rota responde 404 -- alto, e nao em silencio.
  http.Response Function(http.Request)? aoRenovar,

  /// A resposta de `GET /v1/public/directory-entries`. Nula devolve uma pagina
  /// publica com uma entrada.
  http.Response Function(http.Request)? diretorioPublico,
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
    // A LISTA PUBLICA DO DIRETORIO (27/10/2026): e ela que atende a
    // `Comunidade` deslogada, e por isso ela responde 200 por padrao em vez de
    // cair no 404 do fim.
    //
    // **Ela NAO passa por [resposta]**, e a separacao e o ponto: os casos
    // deste arquivo armam `resposta` com `semConta()` para medir a rota COM
    // conta. Se a tela voltar a chamar aquela rota deslogada, ela leva o 401 e
    // o caso reprova -- que e exatamente o sinal que se quer.
    if (chave == 'GET /v1/public/directory-entries') {
      return (diretorioPublico ?? (_) => json200(paginaPublicaDoDiretorio()))(req);
    }
    if (chave == 'GET /v1/directory/entries' ||
        chave == 'GET /v1/conversations' ||
        req.url.path.startsWith('/v1/conversations/')) {
      return resposta(req);
    }
    return problema('not-found', 404);
  };
}

/// A rede que responde [resposta] a `GET /v1/connections` e 404 no resto.
///
/// **A rota de conexoes PRECISA de um esboco proprio**, e nao da para reusar os
/// dois de cima: `redeDasDuasSecoes` responde 404 a ela, e 404 tambem produz
/// faixa de aviso -- entao um caso que a usasse ficaria verde medindo o 404
/// errado, que e exatamente a classe de defeito que o cabecalho de
/// `redeDoMural` descreve.
///
/// O resumo (`GET /v1/connections/summary`) responde o MESMO: a tela pede os
/// dois em paralelo, e sem a conta nenhum dos dois tem resposta a dar.
Future<http.Response> Function(http.Request) redeDasConexoes(
  http.Response Function(http.Request) resposta,
) {
  return (req) async {
    final chave = '${req.method} ${req.url.path}';
    if (chave == 'GET /v1/connections' || chave == 'GET /v1/connections/summary') {
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
  group('ISCA (a): deslogado, as mensagens convidam a entrar — e a '
      '`Comunidade` LISTA', () {
    // MECANISMO: o ramo `if (_faltaConta)` de
    // `lib/telas/mensagens/area_de_mensagens.dart`. Desligado, a tela volta a
    // desenhar `FaixaDeAviso` com `Tentar de novo` ao lado.
    //
    // **O TITULO DESTE GRUPO MUDOU EM 27/10/2026.** Ele dizia "`Perto` e as
    // mensagens convidam a entrar", e as duas telas eram medidas pelo mesmo
    // ramo. A `Comunidade` saiu desse conjunto: ela passou a listar sem conta
    // (`listPublicDirectoryEntries`, 200) por pedido do cliente de 26/10, e o
    // muro dela desceu da LISTA para o ITEM. O primeiro caso abaixo guarda o
    // novo veredito dela; o convite dela, que agora e no toque, e medido em
    // `aviso_de_login_ao_ver_detalhe_test.dart` (casos `d5` e `d5b`).

    testWidgets('a `Comunidade` LISTA, e nao mostra convite nem faixa',
        (tester) async {
      // **ESTE CASO MEDIA O CONTRARIO ATE 27/10/2026.** Ele se chamava
      // "`Perto` mostra o convite, e nenhuma faixa de erro", e estava certo: o
      // diretorio exigia conta na LISTAGEM inteira -- a resposta dela traz
      // `phone_e164` e `distance_m`, e `portao-contrato-publico.ts` proibe os
      // dois em operacao alcancavel sem conta. A tela recebia 401 `sign_in` e
      // trocava o corpo pelo convite de tela cheia.
      //
      // O veredito mudou porque o produto mudou: o cliente pediu, em 26/10,
      // que a `Comunidade` listasse deslogada. A lista ganhou operacao publica
      // propria, com projecao SEM aqueles dois campos, e o muro passou a ser o
      // do ITEM (`getDirectoryEntry` exige conta).
      //
      // **O convite nao desapareceu do app**, e e por isso que apagar este
      // caso seria pior que reescreve-lo: ele aparece no TOQUE do cartao, com
      // `rotaDeVolta`, e quem mede isso sao os casos `d5` e `d5b` de
      // `aviso_de_login_ao_ver_detalhe_test.dart`.
      //
      // **`semConta()` continua armado na rota COM conta**, de proposito: se a
      // tela voltar a chama-la deslogada, ela leva 401 e este caso reprova nas
      // duas pontas de uma vez -- a lista desaparece e o convite reaparece.
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

      // A ANCORA POSITIVA: a lista chegou. Sem ela, os tres `findsNothing`
      // abaixo ficariam verdes com a tela em branco.
      expect(
        find.text('Clínica Santa Bárbara'),
        findsOneWidget,
        reason: 'REPROVA: a lista publica do diretorio nao chegou a tela. '
            '`/v1/public/directory-entries` responde 200 sem conta.',
      );
      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: ha muro na LISTA da Comunidade deslogada. O muro '
            'desta aba e do item, e nao da lista.',
      );
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a lista deslogada desenhou faixa de erro. Nao houve '
            'nem 401 aqui -- a rota publica respondeu 200.',
      );
      expect(find.text('Atualizar'), findsNothing);
      expect(find.text('Tentar de novo'), findsNothing);
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
      //
      // **O 500 PRECISA SER NA ROTA PUBLICA, e isto entrou em 27/10/2026.**
      // Deslogado, a `Comunidade` chama `listPublicDirectoryEntries`: um 500
      // armado so na rota COM conta deixava este contrapeso medir a lista
      // publica respondendo 200 -- nenhuma faixa, e o caso reprovando por
      // nao achar o que ele existe para achar. Medido, e foi assim que
      // apareceu.
      //
      // Os dois continuam armados: a rota com conta por causa das mensagens,
      // que estao no mesmo grupo, e a publica por causa da lista.
      await abrirOApp(
        tester,
        rede: redeDasDuasSecoes(
          (_) => servidorFora(),
          diretorioPublico: (_) => servidorFora(),
        ),
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
  group('ISCA (d): o `Mural` deslogado DIZ ALGUMA COISA, e nenhuma faixa dele '
      'fica muda', () {
    // MECANISMO: o ramo `if (_faltaConta)` de `build` somado a
    // `_faltaConta = faltaConta(falha)` no `catch` de `_carregarAgora`, em
    // `lib/telas/mural/tela_do_mural.dart`.
    //
    // DESLIGADO (`_faltaConta` fixo em `false`, ou o `catch` voltando a
    // `_faixa = MensagensDeErro.de(falha)` para toda falha), o Mural deslogado
    // volta a desenhar uma `FaixaDeAviso` com **`texto: ''`** — o catalogo
    // devolve string vazia para `unauthenticated` desde 18/10/2026 — e o que
    // chega a pessoa e o icone de erro, o botao `Entrar` e NENHUMA FRASE.
    //
    // **O caso nao cobra o texto do 401**, e a distincao e o ponto: o que ele
    // cobra e que a faixa nao fique MUDA e que a tela diga alguma coisa. Um
    // caso que exigisse a frase *"entre na sua conta para continuar"* de volta
    // pressionaria a proxima pessoa a desfazer a decisao do cliente de 18/10
    // para ficar verde — e e exatamente por isso que
    // `toda_faixa_de_erro_tem_saida_test.dart` mede a saida e nunca a frase.

    testWidgets('o convite ocupa o lugar da faixa, e a faixa muda nao existe',
        (tester) async {
      await abrirOApp(tester, rede: redeDoMural((_) => semConta()));
      await abrirAAba(tester, 'Mural');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // A FAIXA MUDA, NOMEADA, **E ANTES DE TUDO**. A ordem nao e estetica:
      // com o mecanismo desligado a tela nao tem `ConviteParaEntrar` nenhum,
      // entao uma asercao de convite posta aqui aborta o caso primeiro e o
      // laco abaixo nunca roda -- e eu estaria relatando como isca provada um
      // laco que nenhuma isca derrubou. Medido: com a ordem invertida a
      // reprova vinha de *"Found 0 widgets with type ConviteParaEntrar"*, e
      // nao da faixa muda, que e o defeito relatado.
      //
      // Nao basta "nao ha faixa": o que o defeito produzia era uma faixa com
      // `texto` vazio, e e esse objeto que este laco procura. Ele sobrevive a
      // um futuro em que o Mural passe a ter faixa legitima para OUTRA falha.
      for (final f in tester.widgetList<FaixaDeAviso>(
        find.byType(FaixaDeAviso),
      )) {
        expect(
          f.texto,
          isNotEmpty,
          reason: 'REPROVA: faixa MUDA no Mural deslogado — `FaixaDeAviso` '
              'com `texto` vazio. E a *falha calada* de '
              '`faixa_de_aviso.dart`: a pessoa ve o icone e o botao e nenhuma '
              'frase. O conserto nao e devolver o texto do 401 (removido pelo '
              'cliente em 18/10/2026): e mandar o 401 para '
              '`ConviteParaEntrar`, como nas outras quinze superficies.',
        );
      }
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: sem conta nao e erro, e o Mural esta desenhando '
            'faixa de aviso para um 401.',
      );
      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(
        find.text('Tentar de novo'),
        findsNothing,
        reason: 'REPROVA: o Mural esta oferecendo `Tentar de novo` a quem nao '
            'tem conta. A tentativa seguinte sai igualmente sem '
            '`Authorization` e volta o mesmo 401.',
      );

      // A MICROCOPY, por extenso e com acento — e nao comparada com a
      // constante que a produz.
      expect(find.text('O Mural é das suas conexões'), findsOneWidget);
      expect(
        frasesDoConvite(tester).join(' | '),
        contains('Entre para ver o que as suas conexões publicam'),
      );
      // AS DUAS PORTAS: quem nunca entrou ve as duas.
      expect(find.widgetWithText(BotaoPrimario, 'Entrar'), findsOneWidget);
      expect(find.text('Criar conta'), findsOneWidget);
    });

    testWidgets(
        'CONTRAPESO: com 500 o Mural VOLTA a mostrar faixa, e ela tem frase',
        (tester) async {
      // **Sem este caso o de cima e vacuo nas duas direcoes.** Ele provaria
      // apenas que a palavra `Tentar de novo` nao existe mais no Mural (verde
      // se alguem apagasse a faixa da tela inteira) e que o laco da faixa
      // muda nao reprova (verde porque nao ha faixa nenhuma para iterar, que
      // e como um `for` sobre lista vazia passa sem medir nada).
      //
      // Aqui a MESMA busca tem de achar: ha faixa, ela tem frase, e o convite
      // NAO aparece.
      await abrirOApp(tester, rede: redeDoMural((_) => servidorFora()));
      await abrirAAba(tester, 'Mural');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: um 500 nao e falta de conta. `faltaConta` decide '
            'pelo `next_action` do corpo `problem+json`, e um 500 nao traz '
            'nenhum — trocar o Mural por um convite para entrar porque o '
            'servidor caiu diria a quem esta logada que a conta dela nao '
            'existe.',
      );

      final faixas = tester.widgetList<FaixaDeAviso>(
        find.byType(FaixaDeAviso),
      );
      expect(
        faixas,
        hasLength(1),
        reason: 'REPROVA NO CONTRAPESO: o 500 nao produziu faixa no Mural. O '
            'caso de cima passa a ser vacuo: ele itera uma lista vazia e '
            'aprova sem medir nada.',
      );
      expect(
        faixas.single.texto,
        isNotEmpty,
        reason: 'REPROVA NO CONTRAPESO: a faixa do 500 esta MUDA tambem. '
            'Entao o laco do caso de cima nunca teria como reprovar, e o '
            'portao nao mede o que diz medir.',
      );
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
    //
    // ## A TELA DESTE GRUPO ERA A `Comunidade`, e passou a ser o `Mural`
    //
    // Ate 27/10/2026 os dois casos abaixo abriam a `Comunidade`: ela punha
    // muro na LISTA inteira, entao bastava abrir a aba para o convite de tela
    // cheia aparecer e os textos do motivo serem legiveis.
    //
    // Ela deixou de servir, e por duas razoes somadas: a lista agora responde
    // 200 sem conta (`listPublicDirectoryEntries`) e **sessao expirada e
    // deslogado**, entao a `Comunidade` passou a LISTAR para esta pessoa em
    // vez de pedir conta. O convite dela ainda existe, mas so no TOQUE -- e la
    // ele vem com `rotaDeVolta`, que e outro desenho.
    //
    // O `Mural` serve pelo criterio que nao mudou: `getMyTimeline` exige
    // conta, nao ha versao publica da linha do tempo e o muro e da lista
    // inteira. **O que este grupo mede nao mudou nada**: continua sendo o
    // MOTIVO (`sessaoCaiu` contra `nuncaEntrou`), que e do controlador de
    // sessao e nao da tela.

    testWidgets('o refresh recusado leva ao convite de sessao expirada',
        (tester) async {
      await abrirOApp(
        tester,
        deposito: depositoVencido(),
        rede: redeDoMural(
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
      await abrirAAba(tester, 'Mural');

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.sessaoCaiu,
      );

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(find.text('Sua sessão expirou'), findsOneWidget);
      expect(
        frasesDoConvite(tester).join(' | '),
        contains('Entre de novo para ver o Mural.'),
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
        find.text('O Mural é das suas conexões'),
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
        rede: redeDoMural((_) => semConta()),
      );
      await abrirAAba(tester, 'Mural');

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
    //
    // ## O CASO PASSOU A SER LOGADO em 27/10/2026, e isso o fortaleceu
    //
    // Ele montava o app DESLOGADO e deixava a rota com conta devolver 401. Com
    // a `Comunidade` listando sem conta (`listPublicDirectoryEntries`), o
    // deslogado nao chama mais aquela rota: o caso parou de alcancar a
    // bandeira que ele existe para medir.
    //
    // Com conta, ele alcanca -- e passou a medir algo que antes ele NAO media:
    // que o ramo `if (_faltaConta)` **continua alcancavel** depois da mudanca.
    // Ele e o unico caminho que sobrou ate aquele ramo: credencial que a tela
    // julga valida e o servidor recusa (token revogado com a aba aberta).
    // Apagar o ramo deixaria este caso reprovar, e e isso que se quer dele.

    testWidgets(
        'ISCA: 401 e depois um corpo fora do contrato mostra faixa, e nao o '
        'convite',
        (tester) async {
      var vezes = 0;
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
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
        estado: EstadoDaSessao.logado,
        motivo: MotivoSemConta.nuncaEntrou,
      );
      expect(
        find.byType(ConviteParaEntrar),
        findsOneWidget,
        reason: 'REPROVA: a primeira carga nao mostrou o convite, entao a '
            'segunda metade deste caso nao prova que ele SAIU. Se o ramo '
            '`if (_faltaConta)` de `lista_do_diretorio.dart` foi apagado com a '
            'mudanca de 27/10, e aqui que isso aparece: ele continua sendo a '
            'resposta certa para credencial RECUSADA.',
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

  // -------------------------------------------------------------------------
  group('a tela `Conexões` deslogada convida a entrar, e nao mostra erro', () {
    // **ESTE GRUPO FECHA UM "NAO SEI" DECLARADO (22/10/2026).**
    //
    // `test/telas/minhas_conexoes_test.dart` prova a ESCOLHA DO RAMO -- o 401
    // leva ao convite e nao a faixa de erro --, e prova pela excecao que
    // `ConviteParaEntrar` levanta naquela bancada: ele exige o `Escopo` do
    // `main()`, e aquela bancada monta a tela sozinha, como a de `Pedidos de
    // conexao`. O que ela NAO alcanca e o TEXTO, que vem do catalogo
    // (`SecaoComConta.minhasConexoes`).
    //
    // Aqui o app inteiro esta montado, entao o `Escopo` existe e o texto
    // aparece. E a entrada do catalogo deixa de ser orfa medida so pela
    // varredura de `toda_faixa_de_erro_tem_saida_test.dart`, que conta
    // referencias em `lib/` -- contar referencia nao prova que alguem ve.
    //
    // MECANISMO: o ramo `if (_faltaConta)` de
    // `lib/telas/conexoes/tela_minhas_conexoes.dart`. Desligado, a tela volta a
    // desenhar `FaixaDeAviso` com a frase de falha de carga.
    testWidgets('`Conexões` mostra o convite, e nenhuma faixa de erro',
        (tester) async {
      // Tela alta: a rota e empilhada e o convite tem titulo, ganho e DOIS
      // botoes -- na bancada padrao o `Criar conta` fica fora da janela.
      tester.view.physicalSize = const Size(1125, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(tester, rede: redeDasConexoes((_) => semConta()));

      exigirEstadoDeSessao(
        tester,
        estado: EstadoDaSessao.deslogado,
        motivo: MotivoSemConta.nuncaEntrou,
      );

      // A rota e EMPILHADA (`push`), como a de `Pedidos de conexao`: ela nao e
      // aba, e nao se chega nela por `NavigationDestination`.
      await irPara(tester, Rotas.minhasConexoes);

      expect(find.byType(ConviteParaEntrar), findsOneWidget);
      expect(
        find.byType(FaixaDeAviso),
        findsNothing,
        reason: 'REPROVA: a tela de quem nao tem conta esta desenhando uma '
            'faixa de aviso. Sem conta nao e erro -- e aqui e mais que isso: '
            'sem conta nao existe "as proprias conexoes".',
      );
      expect(
        find.textContaining('Não conseguimos carregar as suas conexões'),
        findsNothing,
        reason: 'REPROVA: o 401 esta caindo no texto de falha de carga.',
      );
      expect(
        find.text('Você ainda não tem conexões'),
        findsNothing,
        reason: 'REPROVA: a tela afirmou que a lista esta vazia a quem nao tem '
            'conta. "Voce ainda nao tem conexoes" e "voce nao tem conta" sao '
            'afirmacoes diferentes, e a primeira seria mentira.',
      );

      // A MICROCOPY DO CATALOGO, por extenso -- e e isto que nenhuma outra
      // bancada alcanca.
      expect(find.text('As suas conexões ficam aqui'), findsOneWidget);
      expect(
        frasesDoConvite(tester).join(' | '),
        contains('Entre para ver quem já é sua conexão'),
      );
      // AS DUAS PORTAS, e nao uma.
      expect(find.widgetWithText(BotaoPrimario, 'Entrar'), findsOneWidget);
      expect(find.text('Criar conta'), findsOneWidget);
    });

    /// **O CONTRAPESO, e sem ele o caso de cima e vacuo.** Ele provaria apenas
    /// que a frase de falha nao existe mais em lugar nenhum do app.
    testWidgets('CONTRAPESO: com 500, `Conexões` VOLTA a mostrar faixa de erro',
        (tester) async {
      tester.view.physicalSize = const Size(1125, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(tester, rede: redeDasConexoes((_) => servidorFora()));
      await irPara(tester, Rotas.minhasConexoes);

      expect(
        find.byType(ConviteParaEntrar),
        findsNothing,
        reason: 'REPROVA: o convite apareceu numa falha de LEITURA. Um 500 nao '
            'e falta de conta, e dizer "entre na sua conta" a quem esta '
            'logado manda a pessoa resolver o problema errado.',
      );
      expect(find.byType(FaixaDeAviso), findsOneWidget);
      expect(
        find.textContaining('Não conseguimos carregar as suas conexões'),
        findsOneWidget,
      );
    });
  });
}
