// A EXCLUSAO DA CONTA, LIGADA DE PONTA A PONTA (02/11/2026, LGPD art. 18).
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E POR QUE SOBRE O APP INTEIRO
// ===========================================================================
//
// A bancada monta o APP, com `MockClient` no lugar da rede, e nao um duble da
// folha. O que esta frente liga sao DOIS pedacos que ja existiam separados --
// a folha de senha (PR #157) e a folha de exclusao (PR #153) --, e a unica
// coisa que importa aqui e a JUNTA entre eles. Duble de `MeApi` nao teria o
// que observar: a pergunta `a recusa da senha chamou o DELETE?` so se responde
// olhando a requisicao que de fato saiu, e a pergunta `a sessao caiu antes ou
// depois do 202?` so se responde com a sessao de verdade na bancada.
//
// ===========================================================================
// AS QUATRO REDACOES DE DESFECHO, E O CRITERIO QUE MANDA NELAS
// ===========================================================================
//
// Nenhuma frase pode deixar quem leu em duvida sobre se a conta foi excluida
// ou nao -- e esse criterio e medido como TEXTO, aqui, porque frase e a unica
// parte deste fluxo que nao reprova sozinha quando esta errada. Os quatro
// caminhos tem caso proprio: o `202`, o teto de 3 por 24 h, o offline e o
// servidor fora. A senha errada tem caso proprio TAMBEM, e o que ele mede e a
// AUSENCIA de duplicata: ela e tratada na folha de senha, e repetir a recusa
// atras dela diria duas vezes a mesma coisa em dois lugares.
//
// ===========================================================================
// ISCA NOS DOIS SENTIDOS -- cada sabotagem foi RODADA, e reprovou
// ===========================================================================
//
// (a) Em `abas.dart`, apagar o `if (janela == null) { ... return; }` de
//     `_pedirAExclusao` (deixando o fluxo seguir com a janela nula) reprova
//     `a folha de senha recusada NAO exclui a conta`, pelo motivo certo: um
//     `DELETE /v1/me` sai com a bancada mandando `Agora não`.
//
// (b) Mover `widget.aoServidorConfirmar()` para ANTES do
//     `await escopo.me.excluirMinhaConta(...)` -- escrever o sinal do desfecho
//     antes de a resposta chegar -- reprova `o 500 nao desloga ninguem: a
//     ordem e servidor primeiro`, pelo motivo certo: a bancada cai em
//     `TelaEntrar` com a conta intacta.
//
//     **ESTA ISCA ACHOU UM FURO NO PROPRIO CASO, e ele e registrado aqui
//     porque a licao nao e sobre esta frente.** Na primeira versao, o caso do
//     500 media `findsNothing` para `TelaEntrar` com a FOLHA AINDA ABERTA --
//     e com a folha aberta o item esta parado no `await showModalBottomSheet`,
//     entao a limpeza nem chegou a ser alcancada. A isca PASSOU: EXIT=0 com a
//     ordem invertida. O caso so mede a ordem porque FECHA a folha (`Agora
//     não`) antes de medir. Caso que passa com e sem o conserto nao mede
//     nada, e este estava a uma linha de ser um deles.
//
// (c) Trocar `TextosDaExclusaoDaConta.pedidosDemais` pela frase do catalogo
//     (`MensagensDeErro.de`) no ramo de 429 reprova `o teto de 3 por 24 h diz
//     que a conta NAO foi excluida`: a frase generica de limite nao contem a
//     afirmacao, e o caso procura a afirmacao e nao a palavra `limite`.
//
// (d) Trocar `_concluida = true` por um `Navigator.pop()` seco depois do `202`
//     reprova `o 202 diz que funcionou, e diz o prazo de 30 dias`: ninguem le
//     o prazo.
//
// (e) Passar `escopoDeSenha: EscopoDeReautenticacao.exclusaoDaConta` ao
//     catalogo no ramo de `reautenticacao-required` reprova
//     `a confirmacao vencida nao oferece a saida que descarta o token`.
library;

import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/conta/tela_entrar.dart';
import 'package:bichu/widgets/folha_de_senha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// Uma senha obviamente FALSA. Nao e segredo de ninguem, e nunca sai em log.
const String _senhaDeMedicao = 'senha-de-medicao';

/// Um token de janela obviamente FALSO.
const String _tokenDeMedicao = 'token-de-medicao';

/// O que `POST /v1/auth/reauth` responde neste caso. Trocado por caso.
late http.Response Function() _respostaDaReauth;

/// O que `DELETE /v1/me` faz neste caso. Trocado por caso.
late Future<http.Response> Function(http.Request) _respostaDoDelete;

/// Toda requisicao que saiu, na ordem. E ela que responde `o DELETE saiu?`.
final List<http.Request> _requisicoes = <http.Request>[];

http.Response _janelaAberta() => json200(<String, dynamic>{
  'reauth_token': _tokenDeMedicao,
  'expires_in': 300,
  'scope': 'account_deletion',
});

Future<http.Response> _servidor(http.Request req) async {
  _requisicoes.add(req);

  if (req.url.path == '/v1/auth/reauth' && req.method == 'POST') {
    return _respostaDaReauth();
  }
  if (req.url.path == '/v1/me' && req.method == 'DELETE') {
    return _respostaDoDelete(req);
  }
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        petDoContrato(id: _idDoPet, nome: 'Nina'),
      ],
    });
  }
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 7,
      'pending_sent_count': 2,
      'requests_received_count': 3,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 4,
    });
  }
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return json200(const <String, dynamic>{});
  }
  return problema('not-found', 404);
}

/// 390 x 2600 dp logicos: o menu e a folha deitados, porque o que se mede e
/// TEXTO e PRESENCA, e nao dobra.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Abre o `Perfil` e a folha de exclusao, e para no aviso.
Future<void> _abrirAFolha(WidgetTester tester) async {
  _superficieAlta(tester);
  await abrirOApp(tester, rede: _servidor, deposito: depositoLogado());
  await irParaAConta(tester);

  await tester.scrollUntilVisible(
    find.text(TextosDaExclusaoDaConta.rotulo),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  await tester.tap(find.text(TextosDaExclusaoDaConta.rotulo).first);
  await tester.pumpAndSettle();

  expect(
    find.text(TextosDaExclusaoDaConta.titulo),
    findsOneWidget,
    reason: 'REPROVA: o item `${TextosDaExclusaoDaConta.rotulo}` nao abriu a '
        'folha de aviso. Sem ela nao ha o que medir daqui para baixo.',
  );
}

/// Toca o botao destrutivo da folha e espera a folha de senha aparecer.
Future<void> _pedirAExclusao(WidgetTester tester) async {
  await tester.tap(
    find.widgetWithText(FilledButton, TextosDaExclusaoDaConta.rotulo).last,
  );
  await tester.pumpAndSettle();
}

/// Digita a senha na folha de senha de verdade e confirma.
Future<void> _confirmarASenha(WidgetTester tester) async {
  expect(
    find.text(TextosDaFolhaDeSenha.titulo),
    findsOneWidget,
    reason: 'REPROVA: a folha de senha nao abriu. A exclusao exige `reauth` no '
        'escopo `account_deletion`, e sem esta folha o `DELETE` sairia sem o '
        'cabecalho `X-Reauth-Token` -- que e 401 no aparelho de quem usa.',
  );
  await tester.enterText(find.byType(TextField).last, _senhaDeMedicao);
  await tester.pump();
  await tester.tap(find.text(TextosDaFolhaDeSenha.confirmar));
  await tester.pumpAndSettle();
}

Iterable<http.Request> get _delecoes => _requisicoes.where(
  (http.Request r) => r.method == 'DELETE' && r.url.path == '/v1/me',
);

void main() {
  setUp(() {
    _requisicoes.clear();
    _respostaDaReauth = _janelaAberta;
    _respostaDoDelete = (http.Request req) async =>
        http.Response('', 202, headers: const <String, String>{});
  });

  group('a folha recusada NAO exclui nada', () {
    testWidgets(
      'a folha de senha recusada NAO exclui a conta',
      (tester) async {
        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);

        expect(
          find.text(TextosDaFolhaDeSenha.titulo),
          findsOneWidget,
          reason: 'REPROVA: a folha de senha nao abriu antes da exclusao.',
        );

        // `Agora não` da FOLHA DE SENHA, e o `.last` nao e descuido: as duas
        // folhas tem o MESMO rotulo de desistir, e a de senha esta por cima --
        // ela entrou na arvore depois. Um `find.text` seco acha as duas e
        // estoura por ambiguidade.
        await tester.tap(find.text(TextosDaFolhaDeSenha.agoraNao).last);
        await tester.pumpAndSettle();

        expect(
          _delecoes,
          isEmpty,
          reason: 'REPROVA: a folha de senha devolveu `null` -- a recusa -- e '
              'um `DELETE /v1/me` saiu de qualquer forma. Esta e A diferenca '
              'entre confirmar e nao confirmar, e ela e a unica coisa que '
              'separa este fluxo de apagar a conta de quem desistiu.',
        );
        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: ninguem excluiu nada e a sessao caiu. Limpar o '
              'cache e sair sao consequencia do `202`, e nao da folha fechar.',
        );
        expect(
          find.text(TextosDaExclusaoDaConta.titulo),
          findsOneWidget,
          reason: 'REPROVA: a folha de aviso sumiu junto com a de senha. A '
              'recusa da senha volta para o aviso, de onde da para tentar de '
              'novo ou desistir.',
        );
      },
    );

    testWidgets(
      'a senha errada e dita UMA vez, e pela folha de senha',
      (tester) async {
        _respostaDaReauth = () => problema('invalid-credentials', 401);

        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaFolhaDeSenha.senhaNaoConfere),
          findsOneWidget,
          reason: 'REPROVA: a recusa da senha nao chegou a tela. Ela e da '
              'folha de senha, que ja a trata no campo.',
        );
        expect(
          _delecoes,
          isEmpty,
          reason: 'REPROVA: a senha nao conferiu e o `DELETE /v1/me` saiu.',
        );
        // A AUSENCIA E O QUE ESTE CASO MEDE: a folha de exclusao NAO redige
        // uma segunda recusa para a mesma senha errada.
        expect(
          find.text(TextosDaExclusaoDaConta.contaIntacta),
          findsNothing,
          reason: 'REPROVA: a folha de exclusao escreveu a sua propria faixa '
              'por cima de uma recusa que a folha de senha ja explicou. Duas '
              'frases para o mesmo fato, em dois lugares da mesma tela.',
        );
      },
    );
  });

  group('o 202 leva ao desfecho desenhado', () {
    testWidgets(
      'o 202 diz que funcionou, e diz o prazo de 30 dias',
      (tester) async {
        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          _delecoes.length,
          1,
          reason: 'REPROVA: a exclusao confirmada nao mandou UM `DELETE '
              '/v1/me`, e mandou ${_delecoes.length}.',
        );
        expect(
          _delecoes.single.headers['X-Reauth-Token'],
          _tokenDeMedicao,
          reason: 'REPROVA: o `DELETE /v1/me` saiu sem o `X-Reauth-Token` da '
              'janela que a folha de senha acabou de abrir, ou com outro '
              'valor. Sem ele o servidor responde 401 em cima de uma acao '
              'destrutiva.',
        );

        // O DESFECHO ESTA NA TELA, e e ele que esta frente desenhou.
        expect(
          find.text(TextosDaExclusaoDaConta.tituloConcluido),
          findsOneWidget,
          reason: 'REPROVA: o `202` chegou e a tela nao disse que a conta foi '
              'excluida. Levar alguem para a tela de entrada sem uma palavra, '
              'depois de uma acao irreversivel, parece defeito e nao '
              'desfecho.',
        );
        expect(
          find.text(TextosDaExclusaoDaConta.concluido),
          findsOneWidget,
          reason: 'REPROVA: o prazo de 30 dias nao foi dito. Ele e a UNICA '
              'informacao deste fluxo que nao da para consultar depois -- '
              'depois nao ha mais conta de onde ler nada.',
        );
        expect(
          find.text(TextosDaExclusaoDaConta.desconexao),
          findsOneWidget,
          reason: 'REPROVA: a tela nao avisou que o aparelho vai ser '
              'desconectado, e vai desconectar.',
        );

        // A SESSAO AINDA ESTA VIVA AQUI, e isso e deliberado: a palavra vem
        // antes da porta. A limpeza acontece no toque em `Entendi`.
        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: a tela de entrada apareceu antes de a pessoa ler o '
              'desfecho. O texto do `202` e a unica chance de ela saber do '
              'prazo de 30 dias.',
        );

        await tester.tap(find.text(TextosDaExclusaoDaConta.entendi));
        await tester.pumpAndSettle();

        expect(
          find.byType(TelaEntrar),
          findsOneWidget,
          reason: 'REPROVA: depois do `Entendi` a sessao continuou de pe. A '
              'conta nao existe mais no servidor: o padrao do vizinho '
              '`_ItemDeSair` -- limpar o cache, `sessao.sair()` e ir para '
              '`entrar` -- e exatamente o que falta aqui.',
        );
      },
    );
  });

  group('cada recusa mostra a frase DELA', () {
    testWidgets(
      'o teto de 3 por 24 h diz que a conta NAO foi excluida',
      (tester) async {
        _respostaDoDelete = (http.Request req) async =>
            problema('rate-limited', 429);

        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaExclusaoDaConta.pedidosDemais),
          findsOneWidget,
          reason: 'REPROVA: o `deny_429` do contrato -- teto de 3 pedidos por '
              '24 h -- chegou e a tela nao disse a frase dele. Quem bate '
              'nesse teto pediu a exclusao tres vezes num dia, e a frase '
              'generica de limite do catalogo nao responde a unica pergunta '
              'que importa: a conta foi excluida ou nao.',
        );
        // A AFIRMACAO e procurada pelo NUCLEO dela, e nao por
        // `contaIntacta` inteira: dentro de `pedidosDemais` ela entra no meio
        // da frase, com `a` minusculo, e um `contains` da constante inteira
        // reprovaria por caixa alta -- medindo a pontuacao em vez do fato.
        expect(
          TextosDaExclusaoDaConta.pedidosDemais,
          contains('não foi excluída e continua no ar'),
          reason: 'REPROVA: a frase do teto nao afirma que a conta continua no '
              'ar. Resposta de erro do contrato NAO e `202`, entao essa '
              'afirmacao e certa -- e deixa-la de fora e deixar a duvida.',
        );
        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: a recusa deslogou alguem.',
        );
      },
    );

    testWidgets(
      'sem conexao a tela diz que o pedido nao saiu daqui',
      (tester) async {
        _respostaDoDelete = (http.Request req) async =>
            throw http.ClientException('sem sinal', req.url);

        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaExclusaoDaConta.semConexao),
          findsOneWidget,
          reason: 'REPROVA: a falha de conexao nao ganhou a frase dela. Numa '
              '`FalhaDeConexao` a requisicao NAO SAIU, e por isso a tela pode '
              'afirmar com certeza que nada foi excluido -- a frase generica '
              'de offline do catalogo nao afirma.',
        );
        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: a falha de conexao deslogou alguem.',
        );
      },
    );

    testWidgets(
      'o 500 nao desloga ninguem: a ordem e servidor primeiro',
      (tester) async {
        _respostaDoDelete = (http.Request req) async =>
            problema('internal-error', 500);

        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaExclusaoDaConta.servidorFora),
          findsOneWidget,
          reason: 'REPROVA: o servidor fora do ar nao ganhou a frase dele.',
        );
        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: **A ORDEM ESTA INVERTIDA.** A chamada falhou e a '
              'sessao caiu: a pessoa foi deslogada sem ter excluido nada, e '
              'cai na tela de entrada acreditando que excluiu. Limpar o cache '
              'e `sessao.sair()` acontecem DEPOIS de o servidor confirmar o '
              '`202`, nunca antes.',
        );
        expect(
          find.text(TextosDaExclusaoDaConta.tituloConcluido),
          findsNothing,
          reason: 'REPROVA: a falha mostrou o desfecho de sucesso.',
        );

        // **A FOLHA TEM DE SER FECHADA PARA QUE ESTE CASO MEDE ALGO.** Com a
        // folha aberta o item ainda esta no `await showModalBottomSheet`, e a
        // limpeza nem chegou a ser alcancada -- um `findsNothing` aqui ficaria
        // verde com a ordem INVERTIDA, e ficou: a isca de escrever o sinal do
        // desfecho antes da resposta do servidor passou, nesta mesma bancada,
        // antes deste trecho existir.
        await tester.tap(find.text(TextosDaExclusaoDaConta.agoraNao).last);
        await tester.pumpAndSettle();

        expect(
          find.byType(TelaEntrar),
          findsNothing,
          reason: 'REPROVA: **A ORDEM ESTA INVERTIDA.** A chamada falhou, a '
              'folha fechou e a sessao caiu: a pessoa foi deslogada sem ter '
              'excluido nada, e cai na tela de entrada acreditando que '
              'excluiu. O sinal do desfecho se escreve DEPOIS do `202`, nunca '
              'antes dele -- e a limpeza do estado local depende desse sinal.',
        );
        expect(
          find.byType(AbaPerfil),
          findsOneWidget,
          reason: 'REPROVA: a folha fechou e o `Perfil` nao esta mais atras '
              'dela. Uma recusa volta para onde a pessoa estava.',
        );
      },
    );

    testWidgets(
      'a confirmacao vencida nao oferece a saida que descarta o token',
      (tester) async {
        _respostaDoDelete = (http.Request req) async =>
            problema('reauthentication-required', 401);

        await _abrirAFolha(tester);
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaExclusaoDaConta.confirmacaoVencida),
          findsOneWidget,
          reason: 'REPROVA: o `reauthentication-required` vindo do proprio '
              '`DELETE` nao ganhou a frase dele.',
        );
        // A SAIDA DO CATALOGO SERIA UMA ARMADILHA, e e isso que este caso
        // guarda: `saidaDaMensagem` liga `Confirmar` na folha de senha e
        // DESCARTA a janela que ela devolve -- o comentario daquele arquivo
        // diz, com estas palavras, que a saida serve para REABRIR a janela
        // vencida e nao para refazer a operacao destrutiva. Quem tocasse ali
        // digitaria a senha, veria a folha fechar, e a conta continuaria no
        // ar sem uma palavra.
        expect(
          find.text('Confirmar'),
          findsNothing,
          reason: 'REPROVA: a faixa oferece `Confirmar`, que leva a folha de '
              'senha e JOGA A JANELA FORA. Quem tocar nele digita a senha, ve '
              'a folha fechar, e a conta continua no ar sem explicacao. A '
              'saida desta recusa e recomecar o fluxo DESTA folha.',
        );
        expect(
          find.text(TextosDaExclusaoDaConta.tentarDeNovo),
          findsOneWidget,
          reason: 'REPROVA: a recusa nao oferece saida nenhuma, e ela TEM uma: '
              'pedir a senha de novo e chamar o `DELETE` com a janela nova.',
        );

        // E a saida FUNCIONA: o segundo pedido e aceito.
        _respostaDoDelete = (http.Request req) async =>
            http.Response('', 202, headers: const <String, String>{});
        await tester.tap(find.text(TextosDaExclusaoDaConta.tentarDeNovo));
        await tester.pumpAndSettle();
        await _confirmarASenha(tester);

        expect(
          find.text(TextosDaExclusaoDaConta.tituloConcluido),
          findsOneWidget,
          reason: 'REPROVA: `${TextosDaExclusaoDaConta.tentarDeNovo}` nao '
              'recomecou o fluxo desta folha. Rotulo que nao conclui a acao e '
              'pior que rotulo nenhum.',
        );
        expect(
          _delecoes.length,
          2,
          reason: 'REPROVA: o segundo `DELETE` nao saiu, ou saiu mais de uma '
              'vez. Sairam ${_delecoes.length}.',
        );
      },
    );
  });

  group('o criterio das frases, medido no TEXTO', () {
    test(
      'toda recusa decidivel afirma que a conta continua no ar',
      () {
        // As quatro recusas em que a certeza vem do TIPO da falha: resposta de
        // erro do contrato nao e `202`, e requisicao que nao saiu nao excluiu.
        // Sem este caso, uma redacao futura poderia trocar a afirmacao por um
        // `tente mais tarde` e nada reprovaria.
        for (final (String nome, String frase) in <(String, String)>[
          ('pedidosDemais', TextosDaExclusaoDaConta.pedidosDemais),
          ('semConexao', TextosDaExclusaoDaConta.semConexao),
          ('servidorFora', TextosDaExclusaoDaConta.servidorFora),
          ('confirmacaoVencida', TextosDaExclusaoDaConta.confirmacaoVencida),
        ]) {
          expect(
            frase,
            contains('não foi excluída e continua no ar'),
            reason: 'REPROVA: `$nome` nao diz se a conta foi excluida. Quem '
                'ficou em duvida sobre a propria conta nao tem onde olhar: o '
                'lugar onde ela olharia e exatamente o que pode ter deixado '
                'de existir.',
          );
        }
      },
    );

    test(
      'o desfecho do 202 afirma a exclusao E o prazo de 30 dias',
      () {
        expect(
          TextosDaExclusaoDaConta.tituloConcluido,
          contains('foi excluída'),
          reason: 'REPROVA: o titulo do desfecho nao afirma a exclusao no '
              'passado. `Pronto!` ou `Recebemos o seu pedido` deixariam a '
              'pessoa sem saber se a conta saiu ou se entrou numa fila.',
        );
        expect(
          TextosDaExclusaoDaConta.concluido,
          contains('30 '),
          reason: 'REPROVA: o desfecho do `202` nao diz o prazo de 30 dias, '
              'que e o unico prazo que o contrato declara.',
        );
      },
    );

    test(
      'nenhuma frase promete desfazer, recuperar ou voltar atras',
      () {
        // O contrato NAO tem rota de arrependimento. Prometer uma na tinta e
        // a pior forma de mentir que este fluxo tem, e e a mais tentadora:
        // ela parece gentileza.
        const List<String> promessas = <String>[
          'recuperar',
          'restaurar',
          'reativar',
          'cancelar o pedido',
          'mudar de ideia',
          'voltar atrás',
        ];
        final Map<String, String> frases = <String, String>{
          'titulo': TextosDaExclusaoDaConta.titulo,
          'prazo': TextosDaExclusaoDaConta.prazo,
          'casos': TextosDaExclusaoDaConta.casos,
          'plaquinhas': TextosDaExclusaoDaConta.plaquinhas,
          'semVolta': TextosDaExclusaoDaConta.semVolta,
          'motivoDaSenha': TextosDaExclusaoDaConta.motivoDaSenha,
          'tituloConcluido': TextosDaExclusaoDaConta.tituloConcluido,
          'concluido': TextosDaExclusaoDaConta.concluido,
          'desconexao': TextosDaExclusaoDaConta.desconexao,
          'pedidosDemais': TextosDaExclusaoDaConta.pedidosDemais,
          'semConexao': TextosDaExclusaoDaConta.semConexao,
          'servidorFora': TextosDaExclusaoDaConta.servidorFora,
          'semResposta': TextosDaExclusaoDaConta.semResposta,
          'confirmacaoVencida':
              TextosDaExclusaoDaConta.confirmacaoVencida,
        };
        // CONTROLE POSITIVO DA VARREDURA: um conjunto vazio de frases passaria
        // no vazio, e este caso ficaria verde sem conferir nada.
        expect(
          frases.length,
          greaterThanOrEqualTo(14),
          reason: 'REPROVA: a varredura tem menos frases do que a folha. '
              'Frase nova que nao entre neste mapa nao e conferida por '
              'ninguem.',
        );
        for (final MapEntry<String, String> e in frases.entries) {
          expect(
            e.value,
            isNotEmpty,
            reason: 'REPROVA: `${e.key}` esta vazia, e uma frase vazia passa '
                'em qualquer varredura.',
          );
          for (final String promessa in promessas) {
            expect(
              e.value.toLowerCase(),
              isNot(contains(promessa)),
              reason: 'REPROVA: `${e.key}` promete `$promessa`. O contrato '
                  'declara exclusao logica imediata e expurgo em 30 dias, e '
                  'rota de arrependimento NENHUMA -- o que ele nao declara, a '
                  'folha nao promete.',
            );
          }
        }
      },
    );

    test(
      'o tempo esgotado NAO afirma, e ensina a medir',
      () {
        // O UNICO desfecho indecidivel: a requisicao saiu e a resposta nao
        // voltou. Afirmar seria chutar; dizer `nao sabemos` seria deixar a
        // duvida. A frase da o TESTE.
        expect(
          TextosDaExclusaoDaConta.semResposta,
          isNot(contains(TextosDaExclusaoDaConta.contaIntacta)),
          reason: 'REPROVA: a frase do tempo esgotado AFIRMA que a conta '
              'continua no ar, e isso nao se sabe: a requisicao saiu e a '
              'resposta nao voltou. Essa afirmacao e um chute para o lado '
              'confortavel.',
        );
        expect(
          TextosDaExclusaoDaConta.semResposta,
          contains('tela de entrada'),
          reason: 'REPROVA: a frase do tempo esgotado nao diz como a pessoa '
              'DESCOBRE. A sessao deste aparelho morre junto com a conta, '
              'entao reabrir o app responde a pergunta sozinho -- e sem isso '
              'ela fica sem saber e sem onde olhar.',
        );
      },
    );
  });

  group('CONTROLE POSITIVO DA BANCADA', () {
    testWidgets(
      'a bancada OBSERVA as requisicoes que saem',
      (tester) async {
        // Uma bancada que nao registrasse requisicao nenhuma deixaria todo
        // `isEmpty` acima verde no vazio, e os casos da recusa nao mediriam
        // nada. Este caso mede que a lista enche.
        await _abrirAFolha(tester);
        expect(
          _requisicoes,
          isNotEmpty,
          reason: 'REPROVA: nenhuma requisicao foi registrada ao abrir o app. '
              'Com a lista sempre vazia, `_delecoes isEmpty` passa sem medir '
              'nada, e os casos da recusa ficam verdes por nao conferir.',
        );
        await _pedirAExclusao(tester);
        await _confirmarASenha(tester);
        expect(
          _delecoes,
          isNotEmpty,
          reason: 'REPROVA: o caminho de sucesso nao produziu `DELETE /v1/me` '
              'nenhum, entao o filtro `_delecoes` nao casa com nada. Filtro '
              'que nao casa devolve zero de tudo, e zero parece verde.',
        );
      },
    );
  });
}
