// A ORDEM DA TELA INICIAL DO `Perfil`, e o layout dela (18/10/2026).
//
// Pedido do cliente, literal: *"O layout do menu do perfil ficou estranho,
// fora do padrao do app. Coloque a secao meus pets como o primeiro item dessa
// pagina e depois traga os dados de conta. O sair da conta deve ser sempre a
// ultima opcao do menu"*.
//
// ---------------------------------------------------------------------------
// POR QUE ESTA ISCA MEDE POSICAO, e nao presenca
// ---------------------------------------------------------------------------
// `perfil_so_menus_nada_perdido_test.dart` ja cobra que cada porta EXISTE e
// LEVA a uma tela. Ele ficaria verde com a tela na ordem errada -- foi
// exatamente o que aconteceu: `Sair da conta` estava no meio da pagina, com o
// bloco inteiro de `Meus pets` depois dele, e nenhum portao deste repositorio
// acusou. Presenca nao e ordem.
//
// Entao aqui nada se afirma por `findsOneWidget`. Cada linha e localizada,
// a coordenada `dy` do canto superior esquerdo dela e lida com
// `tester.getTopLeft`, e a afirmacao e sobre os NUMEROS: estritamente
// crescentes, de cima para baixo, na ordem que o cliente determinou.
//
// A tela e montada numa superficie ALTA de proposito (390 x 2600 dp logicos).
// Nao e para esconder nada: `ListView` so constroi o que cabe, e uma lista
// cortada pela dobra daria `dy` de widget inexistente -- o caso reprovaria por
// um motivo que nao e o dele. Com a pagina inteira deitada, as cinco
// coordenadas sao comparaveis entre si, que e a unica forma de medir ordem.
//
// ---------------------------------------------------------------------------
// AS DUAS AFIRMACOES, e por que as duas sao necessarias
// ---------------------------------------------------------------------------
// 1. [exigirOrdemPorPosicao] -- a sequencia. Ela pega troca de lugar entre
//    duas linhas quaisquer.
// 2. [exigirSairPorUltimo] -- a cauda. A sequencia sozinha nao pega o defeito
//    real que havia: um bloco NOVO acrescentado depois de `Sair da conta`
//    satisfaz "Meus pets antes de Conta antes de Sair" e ainda assim deixa
//    algo embaixo do fim do menu. Esta afirmacao varre tudo o que e tocavel ou
//    titulo dentro da aba e exige que NADA tenha `dy` maior que o item de
//    sair.
//
// ---------------------------------------------------------------------------
// O ESCOPO E `AbaPerfil`, e isso importa
// ---------------------------------------------------------------------------
// O `StatefulShellRoute.indexedStack` mantem a aba `Pets` montada atras da
// `Perfil`, e `Pets` tambem tem a palavra `Escanear uma tag` na arvore. Um
// `find.text` solto acharia duas e o caso reprovaria sem defeito nenhum. Todo
// finder desta isca desce de `find.byType(AbaPerfil)`.
//
// ---------------------------------------------------------------------------
// NAO RODADO nesta entrega
// ---------------------------------------------------------------------------
// Regra do cliente para esta tarefa: `flutter analyze` e os portoes offline,
// sem suite unitaria nem de integracao. Este arquivo foi escrito e **nao foi
// executado**. Esta nota sai quando alguem rodar a suite.

import 'package:bichu/telas/abas.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

/// A ordem que o cliente determinou, de cima para baixo.
///
/// Escrita a mao, e com o tamanho conferido por um caso: ela e a segunda fonte
/// da verdade. Tirar uma linha daqui para fazer um caso passar reprova antes.
///
/// `Meus pets` e o rotulo da secao (`MeusPets.titulo`); `Conta` e o cabecalho
/// do grupo de menu; as tres ultimas sao os itens, na ordem.
const List<String> ordemDecididaDoPerfil = <String>[
  MeusPets.titulo,
  'Conta',
  'Meus dados',
  'Escanear uma tag',
  'Sair da conta',
];

/// Uma superficie alta o bastante para a pagina inteira ficar deitada.
///
/// 390 x 2600 dp logicos. A largura e a do aparelho que o produto mira; a
/// altura e folga deliberada, porque o que se mede aqui e ORDEM e nao dobra.
void _superficieAlta(WidgetTester tester) {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// `GET /v1/pets` com um pet, `GET /v1/me` com um perfil, 404 em tudo o mais.
///
/// Um pet, e nao zero: com a lista vazia o bloco de `Meus pets` nao tem cartao
/// e o caso critico -- o caminho ate a pagina do pet -- nao teria o que medir.
Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        petDoContrato(id: _idDoPet, nome: 'Nina'),
      ],
    });
  }
  if (req.url.path == '/v1/pets/$_idDoPet' && req.method == 'GET') {
    return json200(petDoContrato(id: _idDoPet, nome: 'Nina'));
  }
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  return problema('not-found', 404);
}

Future<void> _abrirOPerfil(
  WidgetTester tester, {
  bool emailVerificado = true,
}) async {
  await abrirOApp(
    tester,
    rede: _servidor,
    deposito: depositoLogado(emailVerificado: emailVerificado),
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
  await tester.pumpAndSettle();
}

/// Tudo desce de `AbaPerfil`: ver a nota de escopo no cabecalho.
Finder _naAba(Finder alvo) =>
    find.descendant(of: find.byType(AbaPerfil), matching: alvo);

/// Sem escopo nenhum. Existe para a PROVA NEGATIVA montar uma arvore minima e
/// exercitar as MESMAS afirmacoes.
Finder _semEscopo(Finder alvo) => alvo;

/// AFIRMACAO 1 -- a sequencia, medida em `dy`.
///
/// Mora numa funcao, e nao copiada em cada caso, exatamente para que a prova
/// negativa do fim do arquivo possa exercita-la: um caso que reescrevesse a
/// comparacao a mao provaria que a copia dele reprova, e nao que o portao
/// reprova.
void exigirOrdemPorPosicao(
  WidgetTester tester,
  List<String> rotulos, {
  required Finder Function(Finder) dentro,
}) {
  final alturas = <String, double>{};
  for (final rotulo in rotulos) {
    final alvo = dentro(find.text(rotulo));
    expect(
      alvo,
      findsOneWidget,
      reason: 'REPROVA: nao ha exatamente um "$rotulo" na tela inicial do '
          'Perfil, entao nao ha coordenada para medir. Ordem nao se afirma '
          'sobre o que nao esta na arvore.',
    );
    alturas[rotulo] = tester.getTopLeft(alvo).dy;
  }

  for (var i = 1; i < rotulos.length; i++) {
    final anterior = rotulos[i - 1];
    final atual = rotulos[i];
    expect(
      alturas[atual]!,
      greaterThan(alturas[anterior]!),
      reason: 'REPROVA: "$atual" (dy ${alturas[atual]}) nao esta ABAIXO de '
          '"$anterior" (dy ${alturas[anterior]}). A ordem que o cliente '
          'determinou em 18/10/2026 e, de cima para baixo:\n'
          '  ${rotulos.join('\n  ')}\n'
          'Medido na tela, em coordenada -- e nao por presenca: o portao '
          'anterior desta tela ficava verde com `Sair da conta` no meio da '
          'pagina.',
    );
  }
}

/// AFIRMACAO 2 -- a cauda: NADA depois de `Sair da conta`.
///
/// Varre os blocos que compoem esta pagina -- item de menu, cabecalho de
/// grupo, cartao de pet e botao preenchido -- e exige que nenhum deles esteja
/// mais baixo que o item de sair. O proprio item de sair aparece na varredura
/// com `dy` igual ao de referencia, e por isso a comparacao e estrita.
void exigirSairPorUltimo(
  WidgetTester tester, {
  required Finder Function(Finder) dentro,
}) {
  final sair = dentro(find.widgetWithText(ItemDeMenu, 'Sair da conta'));
  expect(
    sair,
    findsOneWidget,
    reason: 'REPROVA: nao ha um `ItemDeMenu` de "Sair da conta" na tela. '
        'Ou ele saiu, ou voltou a ser botao: o cliente pediu menu, e pediu '
        'esta linha por ultimo.',
  );
  final dySair = tester.getTopLeft(sair).dy;

  final blocos = dentro(
    find.byWidgetPredicate(
      (w) =>
          w is ItemDeMenu ||
          w is TituloDeGrupoDeMenu ||
          w is CartaoDePet ||
          w is FilledButton,
    ),
  );

  final abaixo = <String>[];
  for (final elemento in blocos.evaluate()) {
    final dy = tester.getTopLeft(find.byElementPredicate((e) => e == elemento)).dy;
    if (dy > dySair) abaixo.add('${elemento.widget.runtimeType} em dy $dy');
  }

  expect(
    abaixo,
    isEmpty,
    reason: 'REPROVA: ha bloco DEPOIS de "Sair da conta" (dy $dySair):\n'
        '  ${abaixo.join('\n  ')}\n'
        'O cliente foi literal: "o sair da conta deve ser sempre a ultima '
        'opcao do menu". Este e o defeito que ele viu no aparelho -- o bloco '
        'inteiro de `Meus pets`, com cartoes e botao, vinha depois da linha '
        'que encerra a sessao.',
  );
}

void main() {
  group('a ordem decidida e a segunda fonte da verdade', () {
    test('tem as cinco linhas, e `Sair da conta` e a ultima', () {
      expect(
        ordemDecididaDoPerfil.length,
        5,
        reason: 'REPROVA: a ordem decidida saiu de 5 linhas e foi para '
            '${ordemDecididaDoPerfil.length}. Encolher a lista e a forma mais '
            'facil de fazer um caso de ordem passar sem arrumar a tela.',
      );
      expect(
        ordemDecididaDoPerfil.first,
        MeusPets.titulo,
        reason: 'REPROVA: a primeira linha da ordem decidida nao e '
            '"${MeusPets.titulo}". O cliente pediu a secao de pets como o '
            'primeiro item da pagina.',
      );
      expect(
        ordemDecididaDoPerfil.last,
        'Sair da conta',
        reason: 'REPROVA: a ultima linha da ordem decidida nao e "Sair da '
            'conta". "Sempre a ultima opcao do menu" foi literal.',
      );
      expect(
        ordemDecididaDoPerfil.indexOf('Meus dados'),
        greaterThan(ordemDecididaDoPerfil.indexOf(MeusPets.titulo)),
        reason: 'REPROVA: "Meus dados" -- os dados da conta -- nao vem DEPOIS '
            'de "${MeusPets.titulo}". O pedido foi "meus pets primeiro e '
            'depois traga os dados de conta".',
      );
    });
  });

  group('ISCA A — a ordem na tela, medida em coordenada', () {
    testWidgets('as cinco linhas descem na ordem decidida', (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);

      // O estado precisa ser o da lista carregada: com a lista vazia o bloco
      // de `Meus pets` muda de forma, e este caso mediria outra tela.
      expect(
        _naAba(find.text('Nina')),
        findsOneWidget,
        reason: 'REPROVA: a lista de pets nao carregou, entao este caso nao '
            'esta medindo a tela que ele existe para medir.',
      );

      exigirOrdemPorPosicao(tester, ordemDecididaDoPerfil, dentro: _naAba);
      exigirSairPorUltimo(tester, dentro: _naAba);
    });

    testWidgets('com a lista VAZIA a ordem e a mesma', (tester) async {
      // O bloco de `Meus pets` tem quatro formas (carregando, lista, vazio,
      // falha). A ordem nao pode depender de qual delas esta na tela: o vazio
      // e mais curto, e um caso medido so no estado cheio nao veria uma troca
      // que acontecesse so no outro ramo.
      _superficieAlta(tester);
      await abrirOApp(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
          }
          return problema('not-found', 404);
        },
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      expect(
        _naAba(find.text(MeusPets.tituloDoVazio)),
        findsOneWidget,
        reason: 'REPROVA: o estado vazio nao esta na tela, entao este caso e o '
            'de cima com outro nome.',
      );

      exigirOrdemPorPosicao(tester, ordemDecididaDoPerfil, dentro: _naAba);
      exigirSairPorUltimo(tester, dentro: _naAba);
    });

    testWidgets('a faixa de cadastro incompleto continua ACIMA de tudo',
        (tester) async {
      // O cliente pediu `Meus pets` como primeiro item. A faixa nao e item:
      // e condicional, e e o caminho de quem ainda nao validou os dados. Ela
      // fica acima, e isso e decisao registrada em `abas.dart` -- este caso
      // existe para que a decisao nao se desfaca por acidente na proxima
      // reordenacao.
      _superficieAlta(tester);
      await _abrirOPerfil(tester, emailVerificado: false);

      final faixa = _naAba(find.textContaining('Confirme seu e-mail'));
      expect(
        faixa,
        findsOneWidget,
        reason: 'REPROVA: a faixa de cadastro incompleto saiu da tela inicial '
            'do Perfil (BICHUS-75, criterio 2).',
      );
      expect(
        tester.getTopLeft(faixa).dy,
        lessThan(tester.getTopLeft(_naAba(find.text(MeusPets.titulo))).dy),
        reason: 'REPROVA: a faixa de cadastro incompleto foi para BAIXO do '
            'bloco de `Meus pets`. Com ate 20 cartoes acima dela, ela cai '
            'abaixo da dobra -- e, com as acoes de criar escondidas de quem '
            'nao validou, ela e o que sobra para a pessoa descobrir o que '
            'fazer.',
      );
      exigirSairPorUltimo(tester, dentro: _naAba);
    });
  });

  group('ISCA B — a reordenacao nao fechou caminho nenhum', () {
    // O antes -> depois esta no relatorio da entrega; o que esta aqui e a
    // prova de que cada destino continua alcancavel DEPOIS de a ordem mudar.
    // `perfil_so_menus_nada_perdido_test.dart` percorre as mesmas portas na
    // ordem antiga: os dois juntos cobrem forma e ordem.

    testWidgets('O CASO CRITICO: o cartao, agora no topo, abre a pagina do pet',
        (tester) async {
      // `Rotas.detalheDoPetDe` e empurrada de `perfil/meus_pets.dart` e de
      // mais nenhum lugar de `app/lib`: o cartao e a UNICA porta da pagina do
      // pet, onde moram o QR da plaquinha e `Marcar como perdido`. Subir o
      // bloco para o topo nao pode ter trocado o cartao por um titulo.
      _superficieAlta(tester);
      await _abrirOPerfil(tester);

      final cartao = _naAba(find.byType(CartaoDePet));
      expect(
        cartao,
        findsOneWidget,
        reason: 'REPROVA: nao ha cartao de pet na tela inicial do Perfil. A '
            'reordenacao trocou a lista por um item de menu, e com isso a '
            'pagina do pet -- o QR e a acao de perdido -- ficou sem porta de '
            'entrada.',
      );
      await tocar(tester, cartao);
      expect(
        find.byType(TelaDetalheDoPet),
        findsOneWidget,
        reason: 'REPROVA: o cartao existe no topo e nao abre a pagina do pet.',
      );
    });

    testWidgets('`Meus dados`, agora depois dos pets, continua abrindo a tela',
        (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);
      await tocar(
        tester,
        _naAba(find.widgetWithText(ItemDeMenu, 'Meus dados')),
      );
      expect(
        find.byType(TelaDadosPessoais),
        findsOneWidget,
        reason: 'REPROVA: `Meus dados` mudou de lugar e deixou de abrir '
            '`/perfil/dados`. A tela ja existia; esta mudanca era de ordem.',
      );
    });

    testWidgets('`Cadastrar meu pet` continua `FilledButton` no topo',
        (tester) async {
      // O portao de `cadastro_nao_mora_em_pets_test.dart` cobra `FilledButton`
      // com este rotulo nos dois estados da lista. A reordenacao nao encostou
      // na forma da acao primaria, e este caso e a conferencia local disso --
      // com a secao no TOPO, onde ela nao estava quando aquele portao nasceu.
      _superficieAlta(tester);
      await _abrirOPerfil(tester);
      expect(
        _naAba(find.widgetWithText(FilledButton, 'Cadastrar meu pet')),
        findsOneWidget,
        reason: 'REPROVA: a acao primaria do Perfil deixou de ser botao '
            'preenchido, ou virou dois. A reordenacao e de ORDEM.',
      );
    });

    testWidgets('`Sair da conta`, por ultimo, abre a MESMA folha',
        (tester) async {
      _superficieAlta(tester);
      await _abrirOPerfil(tester);
      exigirSairPorUltimo(tester, dentro: _naAba);
      await tocar(
        tester,
        _naAba(find.widgetWithText(ItemDeMenu, 'Sair da conta')),
      );
      expect(
        find.text('Sair da sua conta?'),
        findsOneWidget,
        reason: 'REPROVA: `Sair da conta` foi para o fim do menu e deixou de '
            'abrir a folha que avisa o que muda. A folha e a decisao desta '
            'acao, e mudar a posicao da linha nao pode ter levado a '
            'confirmacao embora.',
      );
    });
  });

  group('PROVA NEGATIVA — as duas afirmacoes precisam REPROVAR com o defeito '
      'de volta', () {
    // Sem estes casos, as duas afirmacoes valem por confianca no dia em que
    // foram escritas. Eles montam a arvore **do jeito errado** -- a ordem de
    // ANTES de 18/10, com o menu em cima e `Meus pets` depois de `Sair da
    // conta` -- e exigem que as MESMAS funcoes reprovem.
    //
    // A arvore e minima de proposito: ela nao precisa do app, precisa da
    // ordem errada.
    Widget telaNaOrdemAntiga() {
      return MaterialApp(
        home: Scaffold(
          body: ListView(
            children: <Widget>[
              const TituloDeGrupoDeMenu('Conta'),
              ItemDeMenu(rotulo: 'Meus dados', aoTocar: () {}),
              ItemDeMenu(rotulo: 'Escanear uma tag', aoTocar: () {}),
              ItemDeMenu(rotulo: 'Sair da conta', aoTocar: () {}),
              const TituloDeGrupoDeMenu(MeusPets.titulo),
              FilledButton(
                onPressed: () {},
                child: const Text('Cadastrar meu pet'),
              ),
            ],
          ),
        ),
      );
    }

    testWidgets('a ordem antiga REPROVA na afirmacao de sequencia',
        (tester) async {
      _superficieAlta(tester);
      await tester.pumpWidget(telaNaOrdemAntiga());
      await tester.pumpAndSettle();

      Object? reprovou;
      try {
        exigirOrdemPorPosicao(
          tester,
          ordemDecididaDoPerfil,
          dentro: _semEscopo,
        );
      } on TestFailure catch (falha) {
        reprovou = falha;
      }
      expect(
        reprovou,
        isNotNull,
        reason: 'REPROVA: a afirmacao de sequencia APROVOU a tela na ordem '
            'ANTIGA, com `Meus pets` depois de `Sair da conta`. Com ela cega, '
            'a ordem que o cliente pediu nao esta medida por nada.',
      );
    });

    testWidgets('a ordem antiga REPROVA na afirmacao da cauda', (tester) async {
      _superficieAlta(tester);
      await tester.pumpWidget(telaNaOrdemAntiga());
      await tester.pumpAndSettle();

      Object? reprovou;
      try {
        exigirSairPorUltimo(tester, dentro: _semEscopo);
      } on TestFailure catch (falha) {
        reprovou = falha;
      }
      expect(
        reprovou,
        isNotNull,
        reason: 'REPROVA: a afirmacao da cauda APROVOU uma arvore com titulo '
            'de grupo e botao DEPOIS de `Sair da conta`. E o defeito exato '
            'que o cliente viu, e ela passaria por cima dele.',
      );
    });

    testWidgets('arvore sem a tela REPROVA, e nao passa em silencio',
        (tester) async {
      // A metade mais importante: uma tela que nao montou nao tem nenhuma das
      // cinco linhas, e uma afirmacao de ordem mal escrita ficaria verde por
      // nao ter o que comparar.
      await tester.pumpWidget(
        const MaterialApp(home: Scaffold(body: SizedBox.shrink())),
      );
      await tester.pumpAndSettle();

      Object? reprovou;
      try {
        exigirOrdemPorPosicao(
          tester,
          ordemDecididaDoPerfil,
          dentro: _semEscopo,
        );
      } on TestFailure catch (falha) {
        reprovou = falha;
      }
      expect(
        reprovou,
        isNotNull,
        reason: 'REPROVA: a afirmacao de ordem ficou VERDE sobre uma arvore '
            'vazia. E o portao cego: ele aprovaria todo dia sem nunca ter '
            'olhado para a tela.',
      );
    });
  });
}
