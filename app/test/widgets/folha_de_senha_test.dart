// A FOLHA DE SENHA DAS SEIS OPERACOES DESTRUTIVAS.
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E POR QUE SOBRE A PORTA DE VERDADE
// ===========================================================================
//
// A bancada monta `AuthApi` sobre `ApiClient` com `MockClient`, e nao um duble
// de `AuthApi`. Um duble responderia igual para qualquer corpo, e os dois
// casos que mais importam aqui -- *o `scope` que sai e o do enum* e *a senha
// sai no campo `password`* -- nao teriam o que observar: so a requisicao que
// de fato sai denuncia um codigo de fio escrito a mao.
//
// ===========================================================================
// AS DUAS RECUSAS DE 429 SAO INDISTINGUIVEIS NO FIO, E E ISSO QUE O CASO
// `o 429 DEPOIS de senha errada fala da senha` GUARDA
// ===========================================================================
//
// O contrato declara DOIS tetos em `/auth/reauth` -- 10 pedidos por hora e 5
// tentativas invalidas por hora --, e os dois respondem o MESMO corpo: o
// catalogo de tipos tem um slug de 429 (`rate-limited`) e nao dois. Entao as
// duas respostas de 429 deste arquivo sao LITERALMENTE o mesmo JSON, e a unica
// coisa que as separa e o que aconteceu na folha antes delas. Se alguem
// simplificar a folha para dar uma frase so aos dois casos, o PAR de casos
// reprova -- e eles sao dois porque cada um precisa de uma bancada limpa.
//
// ===========================================================================
// ISCA NOS DOIS SENTIDOS -- cada sabotagem foi RODADA, e reprovou
// ===========================================================================
//
// (a) Em `folha_de_senha.dart`, trocar `'scope': escopo.valor` por
//     `'scope': escopo.name` (ou pelo literal `'account_deletion'` escrito a
//     mao) em `auth_api.dart`.
//       -> reprova `o scope que sai e o codigo de fio do enum, nos seis` e
//          `a confirmacao manda senha e scope para POST /v1/auth/reauth`.
//
// (b) Em `_mostrarRecusa`, trocar o ramo de `limiteDeTentativas` por
//     `_erroDaFaixa = TextosDaFolhaDeSenha.pedidosDemais` sem olhar
//     `_senhasRecusadas`.
//       -> reprova `o 429 DEPOIS de senha errada fala da senha`.
//
// (c) Em `_mostrarRecusa`, fazer o ramo de `credencialInvalida` fechar a folha
//     (`Navigator.pop`) em vez de ficar.
//       -> reprova `senha errada mantem a folha aberta e nao devolve janela`
//          E TAMBEM `o 429 DEPOIS de senha errada fala da senha`, porque a
//          folha fechada nao chega ao segundo toque. Os dois nomes estao aqui
//          porque uma isca que reprovasse so o caso esperado esconderia que
//          ela derruba o par inteiro.
//
// (d) Em `_confirmar`, apagar a guarda de campo vazio.
//       -> reprova `campo vazio nao chama o servidor`.
//
// (e) Em `_mostrarRecusa`, mandar `reautenticacaoNecessaria` para o catalogo
//     (o ramo generico) em vez de ter frase propria.
//       -> reprova `escopo errado tem frase propria, e ela nao convida a
//          tentar de novo`.
//
// (f) Em `mensagens_de_erro.dart`, voltar o caso de
//     `reautenticacaoNecessaria` a `acao: 'Confirmar'` fixo, sem
//     `escopoDeSenha`.
//       -> reprova `o rotulo Confirmar nao sai sem escopo` e
//          `com escopo, a recusa carrega a finalidade da folha`. Era ESTE o
//          estado da base: o rotulo existia e nao levava a lugar nenhum.
//
// NENHUM VALOR DE SENHA DE VERDADE APARECE AQUI. `senha-de-medicao` e
// obviamente falso, e e o unico que este arquivo escreve.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/api/reautenticacao.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/folha_de_senha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String _urlBase = 'http://localhost:3000';

/// Um valor de senha obviamente falso. Nao e segredo de ninguem.
const String _senhaDeMedicao = 'senha-de-medicao';

/// A janela aberta, 200.
http.Response _janelaAberta() => http.Response(
  jsonEncode(<String, dynamic>{
    'reauth_token': 'token-de-medicao',
    'expires_in': 300,
    'scope': 'account_deletion',
  }),
  200,
  headers: const <String, String>{
    'content-type': 'application/json; charset=utf-8',
  },
);

/// Um `Problem` do contrato.
///
/// O `title` e **deliberadamente enganoso**: se a folha passar a decidir pelo
/// texto do servidor em vez do `type`, os casos reprovam.
http.Response _problema(String slug, int status) => http.Response(
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

/// A bancada: abre a folha e guarda o que ela devolveu e o que saiu no fio.
class _Bancada {
  _Bancada(this.requisicoes, this.corpos);

  final List<http.Request> requisicoes;
  final List<Map<String, dynamic>> corpos;

  JanelaDeReautenticacao? devolvida;
  bool fechou = false;
}

Future<_Bancada> _abrirAFolha(
  WidgetTester tester, {
  required List<http.Response> respostas,
  EscopoDeReautenticacao escopo = EscopoDeReautenticacao.exclusaoDaConta,
  String motivo = TextosDaFolhaDeSenha.motivoPadrao,
}) async {
  final requisicoes = <http.Request>[];
  final corpos = <Map<String, dynamic>>[];
  var proxima = 0;

  final cliente = MockClient((http.Request pedido) async {
    requisicoes.add(pedido);
    if (pedido.body.isNotEmpty) {
      corpos.add(jsonDecode(pedido.body) as Map<String, dynamic>);
    }
    final resposta = respostas[proxima < respostas.length ? proxima : respostas.length - 1];
    proxima += 1;
    return resposta;
  });

  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-acesso-de-medicao',
  );
  final bancada = _Bancada(requisicoes, corpos);

  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: Builder(
        builder: (contexto) => Scaffold(
          body: Center(
            child: ElevatedButton(
              onPressed: () async {
                final janela = await mostrarFolhaDeSenha(
                  contexto,
                  auth: AuthApi(api),
                  escopo: escopo,
                  motivo: motivo,
                );
                bancada.devolvida = janela;
                bancada.fechou = true;
              },
              child: const Text('abrir'),
            ),
          ),
        ),
      ),
    ),
  );

  await tester.tap(find.text('abrir'));
  await tester.pumpAndSettle();
  return bancada;
}

Future<void> _digitarEConfirmar(WidgetTester tester) async {
  await tester.enterText(find.byType(TextField), _senhaDeMedicao);
  await tester.tap(find.text(TextosDaFolhaDeSenha.confirmar));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('a folha pede a senha, com o motivo de quem a chamou', (
    tester,
  ) async {
    await _abrirAFolha(
      tester,
      respostas: <http.Response>[_janelaAberta()],
      motivo: 'Excluir a conta não pode ser desfeito.',
    );

    expect(find.text(TextosDaFolhaDeSenha.titulo), findsOneWidget);
    expect(find.text('Excluir a conta não pode ser desfeito.'), findsOneWidget);
    expect(find.text(TextosDaFolhaDeSenha.rotuloDoCampo), findsOneWidget);
    expect(find.text(TextosDaFolhaDeSenha.confirmar), findsOneWidget);
    expect(find.text(TextosDaFolhaDeSenha.agoraNao), findsOneWidget);
  });

  testWidgets(
    'a confirmacao manda senha e scope para POST /v1/auth/reauth, e devolve a janela',
    (tester) async {
      final bancada = await _abrirAFolha(
        tester,
        respostas: <http.Response>[_janelaAberta()],
      );
      await _digitarEConfirmar(tester);

      expect(bancada.requisicoes, hasLength(1));
      expect(bancada.requisicoes.single.method, 'POST');
      expect(
        bancada.requisicoes.single.url.path,
        '/v1/auth/reauth',
        reason: 'REPROVA: a rota do contrato e `POST /v1/auth/reauth`.',
      );
      expect(bancada.corpos.single['password'], _senhaDeMedicao);
      expect(bancada.corpos.single['scope'], 'account_deletion');

      expect(
        bancada.fechou,
        isTrue,
        reason: 'REPROVA: a folha nao fechou depois de a janela abrir.',
      );
      expect(bancada.devolvida, isNotNull);
      expect(bancada.devolvida!.token, 'token-de-medicao');
      expect(bancada.devolvida!.duracao, const Duration(seconds: 300));
      expect(bancada.devolvida!.escopoConfirmado, 'account_deletion');
    },
  );

  testWidgets('o scope que sai e o codigo de fio do enum, nos seis', (
    tester,
  ) async {
    // O CONTROLE POSITIVO DO CASO: a lista nao e escrita a mao aqui, ela e
    // `EscopoDeReautenticacao.values`. Um enum que perdesse uma constante
    // mediria menos sem avisar, e por isso o tamanho e conferido.
    expect(EscopoDeReautenticacao.values, hasLength(6));

    for (final escopo in EscopoDeReautenticacao.values) {
      final bancada = await _abrirAFolha(
        tester,
        respostas: <http.Response>[_janelaAberta()],
        escopo: escopo,
      );
      await _digitarEConfirmar(tester);

      expect(
        bancada.corpos.single['scope'],
        escopo.valor,
        reason:
            'REPROVA: a folha mandou `${bancada.corpos.single['scope']}` para '
            'o escopo `${escopo.name}`, e o codigo de fio dele e '
            '`${escopo.valor}`. O valor tem de ser LIDO do enum, nunca '
            'reescrito -- `name` daria `${escopo.name}`.',
      );
    }
  });

  testWidgets('campo vazio nao chama o servidor', (tester) async {
    final bancada = await _abrirAFolha(
      tester,
      respostas: <http.Response>[_janelaAberta()],
    );

    await tester.tap(find.text(TextosDaFolhaDeSenha.confirmar));
    await tester.pumpAndSettle();

    expect(
      bancada.requisicoes,
      isEmpty,
      reason: 'REPROVA: a folha mandou corpo com a senha vazia. O requisito se '
          'diz antes da tentativa, e o teto de 5 tentativas invalidas por '
          'hora nao se gasta com campo em branco.',
    );
    expect(find.text(TextosDaFolhaDeSenha.campoVazio), findsOneWidget);
    expect(bancada.fechou, isFalse);
  });

  testWidgets('senha errada mantem a folha aberta e nao devolve janela', (
    tester,
  ) async {
    final bancada = await _abrirAFolha(
      tester,
      respostas: <http.Response>[_problema('invalid-credentials', 401)],
    );
    await _digitarEConfirmar(tester);

    expect(find.text(TextosDaFolhaDeSenha.senhaNaoConfere), findsOneWidget);
    expect(
      find.text(TextosDaFolhaDeSenha.titulo),
      findsOneWidget,
      reason: 'REPROVA: a folha fechou numa senha errada. Quem errou a senha '
          'quer digitar de novo, e nao perder o contexto da operacao.',
    );
    expect(bancada.fechou, isFalse);
    expect(bancada.devolvida, isNull);
    expect(
      find.text('Nao foi possivel concluir'),
      findsNothing,
      reason: 'REPROVA: a folha mostrou o `title` do servidor. A decisao e '
          'pelo `type`, e a frase e do app.',
    );
  });

  // AS DUAS RECUSAS DE 429 SAO DOIS CASOS, e nao um, porque cada uma precisa
  // de uma bancada limpa: a folha que ja viu uma senha recusada nao volta ao
  // estado de quem nunca errou, e e justamente essa memoria que as separa.
  testWidgets('o 429 SEM senha errada antes manda esperar', (tester) async {
    final bancada = await _abrirAFolha(
      tester,
      respostas: <http.Response>[_problema('rate-limited', 429)],
    );
    await _digitarEConfirmar(tester);

    expect(
      find.text(TextosDaFolhaDeSenha.pedidosDemais),
      findsOneWidget,
      reason: 'REPROVA: sem senha recusada nesta folha, o 429 que chegou e o '
          'teto de 10 pedidos por hora, e a saida e esperar.',
    );
    expect(find.text(TextosDaFolhaDeSenha.senhaErradaDemais), findsNothing);
    expect(bancada.devolvida, isNull);
  });

  testWidgets('o 429 DEPOIS de senha errada fala da senha', (tester) async {
    final bancada = await _abrirAFolha(
      tester,
      respostas: <http.Response>[
        _problema('invalid-credentials', 401),
        _problema('rate-limited', 429),
      ],
    );

    await _digitarEConfirmar(tester);
    expect(find.text(TextosDaFolhaDeSenha.senhaNaoConfere), findsOneWidget);

    await _digitarEConfirmar(tester);

    expect(
      find.text(TextosDaFolhaDeSenha.senhaErradaDemais),
      findsOneWidget,
      reason: 'REPROVA: depois de a senha ser recusada, o 429 e o teto de 5 '
          'tentativas invalidas, e a frase tem de dizer isso. `rate-limited` '
          'nao distingue os dois tetos no corpo -- o JSON das duas respostas '
          'deste arquivo e o MESMO --, e o que distingue e o que aconteceu '
          'nesta folha.',
    );
    expect(find.text(TextosDaFolhaDeSenha.pedidosDemais), findsNothing);
    expect(bancada.devolvida, isNull);

    // O PAR DE CASOS SO VALE SE AS DUAS FRASES FOREM DIFERENTES.
    expect(
      TextosDaFolhaDeSenha.senhaErradaDemais,
      isNot(TextosDaFolhaDeSenha.pedidosDemais),
      reason: 'REPROVA: *tente mais tarde* e *a senha errou vezes demais* nao '
          'sao a mesma coisa para quem esta na tela.',
    );
  });

  testWidgets(
    'o 429 de senha errada diz que a sessao continua de pe',
    (tester) async {
      // O teto fecha a JANELA DESTRUTIVA e nao derruba a sessao. Quem nao le
      // isso acha que foi deslogado e vai procurar o `Entrar`.
      expect(
        TextosDaFolhaDeSenha.senhaErradaDemais,
        contains('A sua conta continua aberta'),
      );
      expect(TextosDaFolhaDeSenha.senhaErradaDemais, contains('uma hora'));
    },
  );

  testWidgets(
    'escopo errado tem frase propria, e ela nao convida a tentar de novo',
    (tester) async {
      final bancada = await _abrirAFolha(
        tester,
        respostas: <http.Response>[
          _problema('reauthentication-required', 401),
        ],
      );
      await _digitarEConfirmar(tester);

      expect(
        find.text(TextosDaFolhaDeSenha.confirmacaoNaoVale),
        findsOneWidget,
        reason: 'REPROVA: `reauthentication-required` na PROPRIA confirmacao '
            'quer dizer que a janela nao vale para esta finalidade, e pedir a '
            'senha outra vez nao resolve. Mandar ao catalogo generico daria '
            '*Confirme sua senha* a quem acabou de confirmar a senha.',
      );
      expect(bancada.devolvida, isNull);
      expect(
        TextosDaFolhaDeSenha.confirmacaoNaoVale,
        isNot(contains('Tente de novo')),
      );
    },
  );

  testWidgets('`Agora não` devolve nulo e nao chama o servidor', (
    tester,
  ) async {
    final bancada = await _abrirAFolha(
      tester,
      respostas: <http.Response>[_janelaAberta()],
    );

    await tester.tap(find.text(TextosDaFolhaDeSenha.agoraNao));
    await tester.pumpAndSettle();

    expect(bancada.fechou, isTrue);
    expect(bancada.devolvida, isNull);
    expect(bancada.requisicoes, isEmpty);
  });

  // =========================================================================
  // O CATALOGO DE ERRO: a acao `Confirmar` deixou de apontar para o vazio
  // =========================================================================
  //
  // Na base, `reauthentication-required` trazia `acao: 'Confirmar'` com
  // `rotaDaAcao` e `proximaAcao` nulos, e `saidaDaMensagem` devolvia `null`:
  // um rotulo desenhado que nao fazia nada ao toque. Quem liga a saida agora e
  // o `escopoDeSenha`, e ele vem de quem chamou.

  test('o rotulo Confirmar nao sai sem escopo', () {
    final mensagem = MensagensDeErro.de(
      const FalhaDaApi(
        Problem(
          tipo: ProblemTipo.reautenticacaoNecessaria,
          tipoUri:
              'https://api.bichu.app/problems/reauthentication-required',
          status: 401,
          titulo: 'Nao foi possivel concluir',
        ),
      ),
    );

    expect(
      mensagem.acao,
      isNull,
      reason: 'REPROVA: a faixa ofereceu `Confirmar` sem saber a finalidade. '
          '`/auth/reauth` exige o `scope` no corpo, e uma folha que o '
          'adivinhasse emitiria token para a operacao errada -- que a '
          'operacao seguinte recusa com 401.',
    );
    expect(mensagem.escopoDeSenha, isNull);
    expect(mensagem.texto, contains('Confirme sua senha'));
  });

  test('com escopo, a recusa carrega a finalidade da folha', () {
    final mensagem = MensagensDeErro.de(
      const FalhaDaApi(
        Problem(
          tipo: ProblemTipo.reautenticacaoNecessaria,
          tipoUri:
              'https://api.bichu.app/problems/reauthentication-required',
          status: 401,
          titulo: 'Nao foi possivel concluir',
        ),
      ),
      escopoDeSenha: EscopoDeReautenticacao.exclusaoDaConta,
    );

    expect(mensagem.acao, 'Confirmar');
    expect(
      mensagem.escopoDeSenha,
      EscopoDeReautenticacao.exclusaoDaConta,
      reason: 'REPROVA: o escopo nao chegou a mensagem, e `saidaDaMensagem` '
          'nao tem como abrir a folha sem ele.',
    );
  });

  testWidgets('a senha nunca aparece na tela depois de uma recusa', (
    tester,
  ) async {
    await _abrirAFolha(
      tester,
      respostas: <http.Response>[_problema('invalid-credentials', 401)],
    );
    await _digitarEConfirmar(tester);

    expect(
      find.text(_senhaDeMedicao),
      findsNothing,
      reason: 'REPROVA: o valor digitado sobreviveu a recusa em algum texto da '
          'folha. Senha nao vai para faixa de erro, para rotulo nem para '
          'diagnostico.',
    );
  });
}
