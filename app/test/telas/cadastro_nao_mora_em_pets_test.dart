// BICHUS-232 — cadastro e as acoes de conta saem de `Pets`, e a acao de
// cadastrar passa a ser PERMANENTE em `Perfil` > `Meus pets`.
//
// As duas metades sao uma coisa so, e por isso as iscas moram no mesmo
// arquivo. Tirar o botao de `Pets` sem torna-lo permanente em `Perfil` apaga o
// unico caminho do app para cadastrar o segundo pet: com um pet na lista, a
// acao de `Perfil` vivia so no ramo do estado vazio e desaparecia. Um arquivo
// que provasse so a ausencia ficaria verde entregando exatamente esse buraco.
//
// Pedido do cliente em 22/09/2026, depois do primeiro teste em aparelho
// fisico. **Ele nao reabriu decisao nenhuma:** a UX 27.5.1 lista os dezesseis
// sub-destinos de `Pets` e cadastro nao esta entre eles, e a 27.5.5 lista
// `Cadastrar pet` em `Perfil`. O botao entrou na implementacao, e nao na
// especificacao.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

/// O que NAO pode aparecer na secao `Pets`, em nenhum estado de sessao.
///
/// Os tres sao de outro contexto, e dois deles eram **duplicata**: o e-mail
/// com o estado de confirmacao ja e um `ListTile` de `Perfil`, e o login ja e
/// `Entrar` e `Criar conta` em `Perfil` deslogado.
const List<String> _proibidosEmPets = <String>[
  'Cadastrar meu pet',
  'Já tenho conta',
  'Entrou como',
];

Future<http.Response> _semServidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
  }
  return problema('not-found', 404);
}

/// `GET /v1/pets` devolvendo a lista que o caso pedir.
///
/// 404 em tudo o mais de proposito: uma chamada nao prevista precisa falhar
/// alto, e nao passar por acidente.
Future<http.Response> Function(http.Request) redeDePets(
  List<Map<String, dynamic>> items,
) {
  return (req) async {
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': items});
    }
    return problema('not-found', 404);
  };
}

List<SemanticsNode> _todosOsNos(WidgetTester tester) {
  final raiz = tester.getSemantics(find.byType(MaterialApp));
  final todos = <SemanticsNode>[];
  void andar(SemanticsNode no) {
    todos.add(no);
    no.visitChildren((filho) {
      andar(filho);
      return true;
    });
  }

  andar(raiz);
  return todos;
}

/// A AFIRMACAO DE AUSENCIA, escrita uma vez e usada por tres estados de sessao
/// **e pela prova negativa**.
///
/// Ela mora numa funcao, e nao copiada em cada caso, exatamente para que a
/// prova negativa possa exercita-la: um caso que reescrevesse a varredura a
/// mao provaria que a copia dele reprova, e nao que o portao reprova.
///
/// **O guarda de `controlesEncontrados > 0` nao e zelo.** Sem ele, uma arvore
/// que nao montou -- `ensureSemantics` esquecido, rota que nao abriu, tela que
/// lancou -- tem zero nos, nenhum deles casa com o texto proibido, e o caso
/// fica **verde por nao ter o que conferir**. Afirmacao de ausencia e a forma
/// mais facil de escrever um portao cego, e foi essa classe de defeito que ja
/// custou caro neste projeto.
void exigirPetsSemCadastroNemConta(
  WidgetTester tester, {
  required String estado,
}) {
  final nos = _todosOsNos(tester);

  final controles = nos
      .where((n) =>
          n.getSemanticsData().hasAction(SemanticsAction.tap) ||
          n.getSemanticsData().flagsCollection.isButton)
      .toList();
  expect(
    controles.length,
    greaterThan(0),
    reason: 'REPROVA: a arvore de `Pets` ($estado) nao tem NENHUM controle '
        'tocavel. A tela nao montou, ou a arvore de semantica nao subiu. '
        'Afirmar ausencia sobre uma arvore vazia e ficar verde por nao estar '
        'olhando para nada, e e por isso que este guarda existe antes da '
        'afirmacao, e nao depois dela.',
  );

  for (final proibido in _proibidosEmPets) {
    final achados =
        nos.where((n) => n.label.contains(proibido)).map((n) => n.label);
    expect(
      achados,
      isEmpty,
      reason: 'REPROVA: a secao `Pets` ($estado) ainda anuncia "$proibido". '
          'Nos encontrados:\n  ${achados.join('\n  ')}\n'
          'Cadastrar o MEU pet e custodia, e custodia mora em `Perfil` '
          '(UX 27.5.5). Identidade de conta e login tambem: os dois ja '
          'existem em `Perfil` e aqui eram a segunda copia.',
    );
  }
}

DepositoEmMemoria _depositoComPendencia() {
  return DepositoEmMemoria()
    ..gravar(
      Sessao(
        accessToken: 'token-de-teste',
        refreshToken: 'refresh-de-teste',
        expiraEm: DateTime.now().add(const Duration(hours: 1)),
        usuario: Usuario(
          id: 'u-pendente',
          email: 'marina@exemplo.com.br',
          emailVerificado: false,
          pendencias: const <PendenciaDeCadastro>[
            PendenciaDeCadastro.verificacaoDeEmail,
          ],
          podeAbrirCaso: true,
        ),
      ),
    );
}

void main() {
  group('ISCA 1 — `Pets` nao tem cadastro nem acao de conta', () {
    testWidgets('deslogado', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      exigirPetsSemCadastroNemConta(tester, estado: 'deslogado');
      handle.dispose();
    });

    testWidgets('logado, cadastro completo', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      exigirPetsSemCadastroNemConta(tester, estado: 'logado completo');
      handle.dispose();
    });

    testWidgets('logado, cadastro incompleto', (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: _depositoComPendencia(),
      );

      // O estado precisa ser MESMO o do cadastro incompleto, senao este caso
      // seria o de cima com outro nome.
      expect(
        find.textContaining('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: a faixa de cadastro incompleto nao esta na tela, '
            'entao este caso nao esta exercitando o terceiro estado.',
      );
      exigirPetsSemCadastroNemConta(tester, estado: 'logado incompleto');
      handle.dispose();
    });

    testWidgets('o que FICA em `Pets` continua la', (tester) async {
      // Contraprova da isca 1: um portao que so afirma ausencia fica verde no
      // dia em que alguem apagar a secao inteira. O criterio 3 da issue diz
      // nome por nome o que nao se discute.
      await abrirOApp(tester, rede: _semServidor);

      expect(find.text('Escanear uma tag'), findsOneWidget,
          reason: 'REPROVA: a porta primaria do leitor (UX 27.5.6) saiu de '
              '`Pets`. Ela nao e desta mudanca.');
      expect(find.text('Adoções'), findsOneWidget,
          reason: 'REPROVA: a porta de `Adoções` saiu de `Pets` (UX 27.2.4).');
      expect(
        find.text('A lista de pets perdidos está em construção'),
        findsOneWidget,
        reason: 'REPROVA: o estado vazio dos perdidos mudou. O texto nao pode '
            'virar "nenhum pet perdido por aqui agora": o app nao chama rota '
            'de listagem, entao ele nao sabe se ha zero ou trezentos.',
      );
    });
  });

  group('ISCA 2 — a acao e PERMANENTE em `Perfil` > `Meus pets`', () {
    /// Exige a acao **com acao de toque**, e nao so anunciada como botao.
    ///
    /// A noite de 21/09 achou quatro widgets que se anunciavam como botao sem
    /// carregar `onTap`, e um deles era a acao primaria de quase toda tela.
    /// Um caso que conferisse so `find.text` passaria com o botao morto.
    void exigirAcaoDeCadastrarViva(WidgetTester tester, {required int pets}) {
      final nos = _todosOsNos(tester);
      final acao =
          nos.where((n) => n.label == 'Cadastrar meu pet').toList();
      expect(
        acao,
        isNotEmpty,
        reason: 'REPROVA: com $pets pet(s) na lista nao ha no de semantica '
            'chamado exatamente "Cadastrar meu pet". Com a acao fora de '
            '`Pets`, este e o UNICO caminho do app para cadastrar o proximo '
            'pet: sem ele o segundo pet e incadastravel.',
      );
      for (final no in acao) {
        final dados = no.getSemanticsData();
        expect(
          dados.flagsCollection.isButton,
          isTrue,
          reason: 'REPROVA: "Cadastrar meu pet" ($pets pet(s)) nao se anuncia '
              'como botao. Quem usa leitor de tela nao sabe que aquilo e um '
              'controle.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: "Cadastrar meu pet" ($pets pet(s)) anuncia-se como '
              'botao e NAO carrega a acao de toque (btn=true tap=false). O '
              'TalkBack e o VoiceOver anunciam um botao que nao ativa: o '
              'controle e inalcancavel pelo leitor de tela (SC 4.1.2).',
        );
      }
    }

    testWidgets('com a lista VAZIA, e continua sendo a acao unica do vazio',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: redeDePets(const <Map<String, dynamic>>[]),
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      exigirAcaoDeCadastrarViva(tester, pets: 0);

      // Criterio 6 da BICHUS-62, que nao muda: acao UNICA em destaque no
      // vazio. A acao permanente nao pode ter virado um segundo botao
      // competindo com ela dentro da mesma caixa.
      expect(
        find.widgetWithText(FilledButton, 'Cadastrar meu pet'),
        findsOneWidget,
        reason: 'REPROVA: ha mais de uma acao de cadastrar na tela vazia. As '
            'duas mudancas desta issue nao podem produzir dois botoes '
            'competindo (criterio 3 da BICHUS-221).',
      );
      handle.dispose();
    });

    testWidgets('com TRES pets na lista, que e onde ela sumia',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: redeDePets(<Map<String, dynamic>>[
          petDoContrato(id: 'p-1', nome: 'Nina'),
          petDoContrato(id: 'p-2', nome: 'Mel'),
          petDoContrato(id: 'p-3', nome: 'Bob'),
        ]),
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      // O estado precisa ser mesmo o da lista cheia: e ele que estava
      // quebrado, e um caso que medisse o vazio duas vezes nao acusaria nada.
      expect(
        find.text('Nina'),
        findsOneWidget,
        reason: 'REPROVA: a lista nao carregou, entao este caso nao esta no '
            'estado em que a acao desaparecia.',
      );
      exigirAcaoDeCadastrarViva(tester, pets: 3);
      handle.dispose();
    });
  });

  group('PROVA NEGATIVA — a isca 1 precisa REPROVAR com o defeito de volta',
      () {
    // Sem este caso, a isca 1 vale por confianca no dia em que foi escrita.
    // Ele monta a arvore **do jeito errado** -- `Pets` com o botao de cadastro
    // de volta -- e exige que a MESMA funcao de afirmacao reprove.
    //
    // Ela roda sobre `exigirPetsSemCadastroNemConta`, e nao sobre uma copia
    // da varredura: uma copia provaria que a copia reprova.
    testWidgets('`Pets` com `Cadastrar meu pet` de volta reprova',
        (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Column(
              children: <Widget>[
                // O controle exigido pelo guarda: sem ele o caso reprovaria
                // pelo motivo errado (arvore vazia), e nao pelo defeito.
                FilledButton(
                  onPressed: () {},
                  child: const Text('Escanear uma tag'),
                ),
                FilledButton(
                  onPressed: () {},
                  child: const Text('Cadastrar meu pet'),
                ),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        () => exigirPetsSemCadastroNemConta(tester, estado: 'defeito'),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: a isca 1 NAO acusou uma arvore que tem '
            '"Cadastrar meu pet" em `Pets`. Ela esta cega, e a ausencia que '
            'ela afirma todo dia nao vale nada.',
      );
      handle.dispose();
    });

    testWidgets('arvore vazia reprova pelo guarda, e nao passa em silencio',
        (tester) async {
      // A outra metade da prova negativa, e a mais importante das duas: uma
      // tela que nao montou satisfaz "nenhum no proibido" trivialmente.
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: SizedBox.shrink())),
      );
      await tester.pumpAndSettle();

      expect(
        () => exigirPetsSemCadastroNemConta(tester, estado: 'arvore vazia'),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: a isca 1 ficou VERDE sobre uma arvore sem nenhum '
            'controle. E o portao cego: ele aprovaria todo dia sem nunca ter '
            'olhado para a tela.',
      );
      handle.dispose();
    });
  });
}
