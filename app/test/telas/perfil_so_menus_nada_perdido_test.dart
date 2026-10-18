// A tela inicial do `Perfil` virou MENU, e NADA ficou inalcancavel (18/10/2026).
//
// Pedido do cliente, literal: *"Essa pagina inicial atual, deveria ter apenas
// os menus para realizar as acoes e nao todos os botoes nessa pagina"*.
//
// ---------------------------------------------------------------------------
// A ISCA, e por que ela nao e uma asserção trivial
// ---------------------------------------------------------------------------
// O risco desta mudanca tem nome: **trocar a forma do controle apaga a acao.**
// Um botao de contorno de largura total e visivel; um item de menu e uma linha
// entre outras linhas, e a diferenca entre "virou item" e "sumiu" e invisivel
// em `git diff` quando o diff mexe em cem linhas de uma vez. Pior: um teste que
// so conferisse `find.text('Escanear uma tag')` ficaria **verde com a linha
// morta** -- texto na tela nao e caminho. Foi o defeito da noite de 21/09,
// quatro widgets anunciados como botao sem `onTap`.
//
// Entao esta isca nao confere texto. Ela tem um INVENTARIO escrito a mao do que
// a tela oferecia ANTES e, para cada linha, **percorre o caminho** a partir da
// aba `Perfil` ate uma tela concreta. Desligar qualquer uma das portas --
// apagar o item, tirar o `aoTocar`, trocar a rota -- reprova pelo nome da
// acao, dizendo qual caminho morreu.
//
// O inventario tem tamanho escrito a mao de proposito: ele e a segunda fonte
// da verdade. Ninguem tira uma linha dele sem que alguem veja.
//
// ---------------------------------------------------------------------------
// O CASO QUE MAIS PROVAVELMENTE QUEBRA: a pagina do pet
// ---------------------------------------------------------------------------
// `Marcar como perdido` e o QR da plaquinha moram agora DENTRO da pagina do
// pet, e medido em 18/10 **os cartoes desta tela sao o unico caminho do app
// ate ela**: `Rotas.detalheDoPetDe` e empurrada de `perfil/meus_pets.dart` e de
// mais nenhum lugar de `app/lib`. Uma reorganizacao "so menus" que trocasse os
// cartoes por um item de menu deixaria a pagina do pet -- e com ela o QR e a
// acao de perdido, o caminho mais critico do produto -- **sem porta de
// entrada**, e nada mais neste repositorio acusaria isso.
//
// Por isso o caminho `Perfil` -> cartao -> `TelaDetalheDoPet` e uma linha do
// inventario como as outras, e nao uma observacao em comentario.
//
// ---------------------------------------------------------------------------
// O QUE ESTA ISCA NAO COBRA, e quem cobra
// ---------------------------------------------------------------------------
// **Que a acao `Marcar como perdido` exista na pagina do pet.** Ela nao esta
// nesta base: o ramo que a leva para la e outro, e editar `telas/pet/` daqui
// seria colisao garantida. O que esta isca cobra do lado de ca e exatamente o
// que e desta tela -- que a acao NAO ficou aqui, e que o caminho ate a pagina
// que a hospeda continua existindo. A outra metade e do ramo da pagina do pet,
// e esta anotada no relatorio da integracao.

import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/telas/pet/tela_cadastrar_identificacao.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import '../api/pets_api_listar_test.dart' show petDoContrato;

/// Uma linha do inventario: o que a tela oferecia antes, e como se chega agora.
typedef Porta = ({
  /// Como o cliente chama a acao. Entra na mensagem de falha.
  String acao,

  /// O que havia na tela antes de 18/10.
  String antes,

  /// O que ha agora.
  String depois,
});

/// O INVENTARIO, escrito a mao a partir da leitura da tela antes da mudanca.
///
/// Sao as SEIS portas que a tela inicial do `Perfil` logado oferecia, e cada
/// uma tem um caso que a percorre abaixo. A setima linha -- `Marcar como
/// perdido` -- esta na lista de AUSENCIAS, logo abaixo, porque ela mudou de
/// tela e nao de forma.
const List<Porta> inventario = <Porta>[
  (
    acao: 'Meus dados',
    antes: 'um `ListTile` MUDO com o e-mail e a situacao de confirmacao, '
        'sem `onTap` e sem destino nenhum',
    depois: 'item de menu `Meus dados`, que abre `TelaDadosPessoais`',
  ),
  (
    acao: 'Escanear uma tag',
    antes: 'um `BotaoSecundario` de largura total',
    depois: 'item de menu, com a MESMA rota (`Rotas.escanear`)',
  ),
  (
    acao: 'Sair da conta',
    antes: 'um `BotaoSecundario` de largura total',
    depois: 'item de menu, abrindo a MESMA folha de confirmacao',
  ),
  (
    acao: 'Cadastrar meu pet',
    antes: 'um `BotaoPrimario` dentro de `Meus pets`',
    depois: 'o MESMO `BotaoPrimario`: e a acao primaria da tela, e o portao '
        'de `cadastro_nao_mora_em_pets_test.dart` cobra `FilledButton`',
  ),
  (
    acao: 'A pagina de um pet',
    antes: 'o toque no cartao do pet',
    depois: 'o MESMO cartao -- e agora ele e tambem a porta do QR e da acao '
        'de perdido, que passaram a morar la',
  ),
  (
    acao: 'Confirmar o e-mail',
    antes: 'a faixa de cadastro incompleto, com `Reenviar`',
    depois: 'a MESMA faixa: faixa nao e botao, e o cliente reclamou dos '
        'botoes',
  ),
];

/// O que NAO pode mais estar na tela inicial do `Perfil`.
///
/// Uma linha so, e ela e deliberada: `Marcar como perdido` saiu daqui para a
/// pagina do pet. **Esta e a unica acao que a reorganizacao tirou**, e a
/// ausencia precisa ser medida -- um item que voltasse por engano criaria duas
/// portas para o mesmo fluxo, e a escolha de qual animal voltaria a ser uma
/// pergunta onde ela nao precisa ser feita.
const List<String> ausenciasDeliberadas = <String>[
  MeusPets.rotuloDeMarcarPerdido,
];

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// `GET /v1/pets` com um pet, `GET /v1/me` com um perfil, 404 em tudo o mais.
///
/// 404 no resto de proposito: uma chamada nao prevista precisa falhar alto, e
/// nao passar por acidente.
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

/// Exige que [rotulo] seja um CONTROLE DE VERDADE: anunciado como botao **e**
/// carregando a acao de toque.
///
/// Mora numa funcao, e nao copiada em cada caso, para que a prova negativa do
/// fim do arquivo possa exercitar a MESMA afirmacao: um caso que reescrevesse
/// a varredura a mao provaria que a copia dele reprova, e nao que o portao
/// reprova.
void exigirControleVivo(
  WidgetTester tester,
  String rotulo, {
  required String acao,
}) {
  final nos = _todosOsNos(tester)
      .where((n) => n.label == rotulo || n.label.startsWith('$rotulo.'))
      .toList();
  expect(
    nos,
    isNotEmpty,
    reason: 'REPROVA: nao ha no de semantica para "$acao" na tela inicial do '
        'Perfil. A reorganizacao em menus tinha de trocar a FORMA do '
        'controle, e apagou a acao: este e o caminho que o cliente usava e '
        'que deixou de existir.',
  );
  for (final no in nos) {
    final dados = no.getSemanticsData();
    expect(
      dados.flagsCollection.isButton,
      isTrue,
      reason: 'REPROVA: "$acao" nao se anuncia como botao. Item de menu que '
          'se anuncia como texto e, para quem usa leitor de tela, um caminho '
          'que nao existe (SC 4.1.2).',
    );
    expect(
      dados.hasAction(SemanticsAction.tap),
      isTrue,
      reason: 'REPROVA: "$acao" anuncia-se como botao e NAO carrega a acao de '
          'toque (btn=true tap=false). E o defeito da noite de 21/09: o '
          'TalkBack e o VoiceOver anunciam um botao que nao ativa.',
    );
  }
}

void main() {
  group('o inventario e a segunda fonte da verdade', () {
    test('tem as seis portas que a tela oferecia, e uma ausencia', () {
      // O numero esta escrito a mao, como `ordemDecidida` e contra
      // `CascaComAbas.destinos`: se alguem tirar uma linha do inventario para
      // fazer um caso passar, este caso acusa primeiro.
      expect(
        inventario.length,
        6,
        reason: 'REPROVA: o inventario saiu de 6 portas e foi para '
            '${inventario.length}. Ele e a lista do que a tela oferecia ANTES '
            'da reorganizacao: encolher significa que alguem deixou de cobrar '
            'um caminho, e e exatamente assim que uma acao desaparece calada.',
      );
      expect(
        ausenciasDeliberadas.length,
        1,
        reason: 'REPROVA: as ausencias deliberadas sairam de 1. A unica acao '
            'que esta reorganizacao TIROU da tela e '
            '"${MeusPets.rotuloDeMarcarPerdido}", que foi para a pagina do '
            'pet. Qualquer outra ausencia e funcao perdida.',
      );
      // Nenhuma linha pode estar nas duas listas: "continua aqui" e "saiu
      // daqui" sao afirmacoes opostas, e uma acao nas duas faria um dos dois
      // grupos de casos passar por vazio.
      for (final porta in inventario) {
        expect(
          ausenciasDeliberadas,
          isNot(contains(porta.acao)),
          reason: 'REPROVA: "${porta.acao}" esta no inventario de portas vivas '
              'E na lista de ausencias.',
        );
      }
    });
  });

  group('cada porta do inventario leva a uma tela de verdade', () {
    testWidgets('`Meus dados` abre a tela de dados pessoais', (tester) async {
      final handle = tester.ensureSemantics();
      await _abrirOPerfil(tester);

      exigirControleVivo(tester, 'Meus dados', acao: 'Meus dados');

      await tocar(tester, find.widgetWithText(ItemDeMenu, 'Meus dados'));
      expect(
        find.byType(TelaDadosPessoais),
        findsOneWidget,
        reason: 'REPROVA: o item `Meus dados` existe e nao abre a tela. Antes '
            'desta mudanca a linha do e-mail era um `ListTile` MUDO: se o item '
            'nao abrir nada, a tela nova ficou inalcancavel pelo caminho que '
            'o cliente pediu e a troca so mudou a aparencia do defeito.',
      );
      handle.dispose();
    });

    testWidgets('`Escanear uma tag` chega ao MESMO leitor', (tester) async {
      final handle = tester.ensureSemantics();
      await _abrirOPerfil(tester);

      exigirControleVivo(
        tester,
        'Escanear uma tag',
        acao: 'Escanear uma tag',
      );

      await tocar(tester, find.widgetWithText(ItemDeMenu, 'Escanear uma tag'));
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta de conta do leitor (UX 27.5.6) deixou de '
            'chegar ao leitor depois de virar item de menu. Ela e a segunda '
            'porta do caminho mais critico do produto.',
      );
      handle.dispose();
    });

    testWidgets('`Sair da conta` abre a MESMA folha de confirmacao',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _abrirOPerfil(tester);

      exigirControleVivo(tester, 'Sair da conta', acao: 'Sair da conta');

      await tocar(tester, find.widgetWithText(ItemDeMenu, 'Sair da conta'));
      expect(
        find.text('Sair da sua conta?'),
        findsOneWidget,
        reason: 'REPROVA: `Sair da conta` virou item de menu e deixou de abrir '
            'a folha que avisa o que muda. A folha e a decisao desta acao -- '
            'a pessoa precisa saber que para de receber os alertas de pet '
            'perdido por perto --, e sair sem ela e sair sem aviso.',
      );
      handle.dispose();
    });

    testWidgets('`Cadastrar meu pet` continua levando ao assistente',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _abrirOPerfil(tester);

      exigirControleVivo(
        tester,
        'Cadastrar meu pet',
        acao: 'Cadastrar meu pet',
      );

      // **Continua `FilledButton`, e isso e medido aqui tambem.** Com a acao
      // fora de `Pets`, este e o unico caminho do app para cadastrar o proximo
      // pet, e transforma-lo em item de menu reprovaria o portao da
      // BICHUS-232 por um caminho que esta isca nao enxergaria.
      expect(
        find.widgetWithText(FilledButton, 'Cadastrar meu pet'),
        findsOneWidget,
        reason: 'REPROVA: a acao primaria de `Perfil` deixou de ser botao '
            'preenchido. A reorganizacao em menus e das acoes de CONTA; a '
            'acao primaria da tela continua sendo botao.',
      );

      await tocar(tester, find.widgetWithText(FilledButton, 'Cadastrar meu pet'));
      expect(
        find.byType(TelaCadastrarIdentificacao),
        findsOneWidget,
        reason: 'REPROVA: `Cadastrar meu pet` nao abre o assistente.',
      );
      handle.dispose();
    });

    testWidgets('O CASO CRITICO: o cartao continua levando a pagina do pet',
        (tester) async {
      await _abrirOPerfil(tester);

      expect(
        find.text('Nina'),
        findsOneWidget,
        reason: 'REPROVA: a lista de pets nao carregou, entao este caso nao '
            'esta medindo o caminho que ele existe para medir.',
      );

      final cartao = find.byType(CartaoDePet);
      expect(
        cartao,
        findsOneWidget,
        reason: 'REPROVA: nao ha cartao de pet na tela inicial do Perfil. '
            'A reorganizacao em menus trocou a LISTA por um item, e com isso '
            'a pagina do pet perdeu a unica porta que tinha: '
            '`Rotas.detalheDoPetDe` e empurrada de `perfil/meus_pets.dart` e '
            'de mais nenhum lugar de `app/lib`. `Marcar como perdido` e o QR '
            'da plaquinha moram nessa pagina -- sem porta, as duas ficam '
            'inalcancaveis, e o caminho mais critico do produto morre em '
            'silencio.\n'
            'Se a lista virar item de menu, ele tem de levar a uma tela de '
            'lista que leve ao pet, e este caso tem de passar a percorrer os '
            'dois saltos.',
      );

      await tocar(tester, cartao);
      expect(
        find.byType(TelaDetalheDoPet),
        findsOneWidget,
        reason: 'REPROVA: o cartao existe e nao abre a pagina do pet. Ver o '
            'paragrafo acima: e nela que a acao de perdido e o QR passaram a '
            'morar.',
      );
    });

    testWidgets('a faixa de confirmar o e-mail continua com acao',
        (tester) async {
      final handle = tester.ensureSemantics();
      await _abrirOPerfil(tester, emailVerificado: false);

      // A faixa **nao** virou item de menu, e nao devia: ela e a posicao 2 do
      // aviso persistente (BICHUS-75, criterio 2), item destacado no topo da
      // lista. O que esta isca cobra e que a reorganizacao nao a levou embora
      // junto com os botoes.
      expect(
        find.textContaining('Confirme seu e-mail'),
        findsOneWidget,
        reason: 'REPROVA: a faixa de cadastro incompleto saiu da tela inicial '
            'do Perfil. Ela e a posicao 2 do criterio 2 da BICHUS-75, e a '
            'reorganizacao em menus era dos BOTOES.',
      );
      exigirControleVivo(tester, 'Reenviar', acao: 'Confirmar o e-mail');
      handle.dispose();
    });
  });

  group('a unica ausencia e deliberada, e o fluxo dela nao morreu', () {
    testWidgets('`Marcar como perdido` NAO esta mais na tela inicial',
        (tester) async {
      await _abrirOPerfil(tester);

      // O pet da rede e elegivel (`status: active`, `open_case_id: null`):
      // antes desta mudanca a acao apareceria aqui. Se este caso passasse com
      // um pet INELEGIVEL, ele nao estaria medindo nada.
      expect(
        find.text('Nina'),
        findsOneWidget,
        reason: 'REPROVA: a lista nao carregou, e com ela a condicao em que a '
            'acao aparecia. Este caso passaria por vazio.',
      );

      for (final ausente in ausenciasDeliberadas) {
        expect(
          find.text(ausente),
          findsNothing,
          reason: 'REPROVA: "$ausente" voltou a tela inicial do Perfil. Ela '
              'mora na pagina do pet desde 18/10, e duas portas para o mesmo '
              'fluxo fazem a escolha de qual animal voltar a ser uma pergunta '
              'justamente onde ela nao precisa ser feita -- quem abriu a '
              'pagina da Nina ja respondeu "a Nina".',
        );
      }
    });

    testWidgets('as rotas do fluxo de perdido continuam REGISTRADAS',
        (tester) async {
      // A acao saiu DESTA tela; o fluxo nao saiu do app. Se as rotas
      // desaparecerem do roteador, a porta da pagina do pet vai empurrar para
      // o vazio -- e este e o unico lugar desta integracao que olha para isso
      // sem editar `telas/pet/`.
      await _abrirOPerfil(tester);
      final rotas = rotasRegistradasDoApp(tester);
      for (final rota in <String>[
        Rotas.escolherPetPerdido,
        Rotas.marcarPerdido,
        Rotas.detalheDoPet,
      ]) {
        expect(
          rotas,
          contains(rota),
          reason: 'REPROVA: `$rota` nao esta registrada no roteador. Tirar a '
              'acao da tela inicial nao pode ter levado o fluxo embora: ele '
              'passou a ser chamado da pagina do pet.',
        );
      }
    });
  });

  group('PROVA NEGATIVA — a afirmacao precisa REPROVAR com o defeito de volta',
      () {
    // Sem este caso, `exigirControleVivo` vale por confianca no dia em que foi
    // escrita. Ele monta a arvore **do jeito errado** -- um item de menu com
    // o rotulo certo e sem acao de toque, que e exatamente o defeito da noite
    // de 21/09 -- e exige que a MESMA funcao reprove.
    testWidgets('um item com o rotulo certo e sem toque REPROVA',
        (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Semantics(
              container: true,
              label: 'Escanear uma tag',
              child: const Text('Escanear uma tag'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      Object? reprovou;
      try {
        exigirControleVivo(
          tester,
          'Escanear uma tag',
          acao: 'Escanear uma tag',
        );
      } on TestFailure catch (falha) {
        reprovou = falha;
      }
      expect(
        reprovou,
        isNotNull,
        reason: 'REPROVA: a afirmacao APROVOU um rotulo sem botao e sem acao '
            'de toque. Com ela cega, apagar o `aoTocar` de qualquer item deste '
            'menu passaria verde, e a isca inteira deixaria de valer.',
      );
      handle.dispose();
    });

    testWidgets('a varredura de ausencia ENXERGA a acao de volta',
        (tester) async {
      // A contraprova da outra metade: um texto com o rotulo proibido na
      // arvore precisa fazer a afirmacao de ausencia reprovar. Sem isto, ela
      // ficaria verde no dia em que o `find` parasse de enxergar.
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Text(MeusPets.rotuloDeMarcarPerdido),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text(MeusPets.rotuloDeMarcarPerdido),
        findsOneWidget,
        reason: 'REPROVA: o finder nao acha o rotulo nem quando ele esta '
            'pintado na arvore. A afirmacao de ausencia dos casos acima '
            'estaria passando por cegueira, e nao por ausencia.',
      );
    });
  });

  group('o corpo do PATCH nao viaja neste arquivo', () {
    test('o inventario nao conhece corpo de requisicao', () {
      // Guarda de escopo: o que vai no corpo de `PATCH /me` -- e o E.164 do
      // telefone em particular -- e medido em
      // `dados_pessoais_envia_e164_test.dart`. Duas iscas sobre a mesma coisa
      // divergem, e a que ninguem le fica verde.
      expect(
        jsonEncode(inventario.map((p) => p.acao).toList()),
        isNot(contains('phone_e164')),
      );
    });
  });
}
