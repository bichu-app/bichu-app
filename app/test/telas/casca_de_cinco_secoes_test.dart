// BICHUS-164 — as ISCAS da barra de cinco secoes.
//
// Todo caso deste arquivo tem de REPROVAR quando o mecanismo que ele protege e
// desligado, e os que dependem de uma medida trazem a **fixture que reprova**
// junto, versionada, em vez de uma frase dizendo que alguem conferiu nos dois
// sentidos. Prova negativa que vive numa frase evapora.
//
// O que cada bloco guarda:
//
// 1. `o registro`     — cinco secoes, nesta ordem, e as abas que sairam nao
//                       voltam. Reprova com quatro, com seis e fora de ordem.
// 2. `o rotulo cabe`  — nenhum rotulo em duas linhas em 320 dp com a `Inter`
//                       REAL e a fonte do sistema em 200%. Tem autoteste com a
//                       composicao que comprovadamente transborda, e tem guarda
//                       de fonte: medir com a fonte sintetica da bancada da
//                       todo numero errado, e foi isso que aconteceu na
//                       primeira passada da UX.
// 3. `o leitor de QR` — as duas portas de 27.5.6 chegam ao MESMO leitor.
// 4. `a semantica`    — o nome acessivel de cada destino, e o
//                       `addSemanticIndexes: false` que a BICHUS-62 descobriu,
//                       por dois caminhos independentes.
//
// E dentro de `a anatomia desenhada no Figma`, a isca da GAVETA (BICHUS-234,
// 22/09): ela reprova quem TIRAR a gaveta da casca. Ate 21/09 a recomendacao
// medida era a oposta, e a decisao que vale agora e a do cliente, tomada
// depois de ler o argumento contra. Trocou o sentido do portao, nao a
// existencia dele: a forma da casca continua vigiada, so mudou qual forma e a
// certa.
// 5. `25.7.3`         — nenhuma secao `planejada` vaza para o build de entrega,
//                       e o portao reprova quando nao ha `planejada` nenhuma.
// 6. `criterio 2`     — varredura: nenhum toque termina sem resposta.

import 'dart:io';
import 'dart:ui' show Tristate;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/gaveta_de_secoes.dart';
import 'package:bichu/theme/bichu_colors.dart';
import 'package:bichu/widgets/item_de_menu.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../widgets/portao_de_tokens_test.dart' show conferir;
import 'ajuda_de_tela.dart';

/// As cinco larguras suportadas, em dp (UX 27.1).
const List<double> larguras = <double>[320, 360, 375, 390, 412];

/// A composicao decidida, escrita a mao **de proposito**.
///
/// E a segunda fonte da verdade, e ela existe para brigar com a primeira: o
/// caso `a ordem e esta` compara as duas. Um portao que so lesse
/// `CascaComAbas.destinos` aprovaria qualquer troca de rotulo, inclusive a
/// volta de `Perdidos`.
///
/// **A ORDEM MUDOU EM 18/10/2026**, literal do cliente: *"inverta a ordem no
/// app do item rede e perto"*. Era `Pets, Rede, Perto, Loja, Perfil`; medido
/// antes de inverter, `Rede` estava na posicao 2 e `Perto` na 3, entao
/// inverter e por `Perto` antes. O caso `a ordem e esta` nao foi apagado: ele
/// continua brigando com `CascaComAbas.destinos`, agora pela ordem nova.
///
/// **MUDOU EM 19/10, e o que ela provava antes esta escrito abaixo.**
///
/// Ela provava `Pets · Rede · Perto · Loja · Perfil`: cinco slots, com
/// `Perfil` no ultimo. O cliente reverteu a composicao com o argumento na
/// mesa: *"inclua um menu de mensagens, onde o usuario ira responder as
/// mensagens e retire o menu perfil, acrescente uma foto pequena do usuario na
/// barra superior de todas as paginas"*.
///
/// Ela prova agora `Pets · Rede · Perto · Loja · AuAu`: continuam cinco slots,
/// a secao de mensagens ocupa o que era do `Perfil`, e `Perfil` **nao esta na
/// barra** -- a porta dele e a foto da barra de topo.
///
/// O caso nao foi apagado nem afrouxado: ele continua comparando a barra
/// montada contra uma lista escrita a mao, que e o que faz um rotulo novo
/// precisar ser medido antes de entrar.
const List<String> ordemDecidida = <String>[
  'Pets',
  'Perto',
  'Rede',
  'Loja',
  'AuAu',
];

/// O REGISTRO inteiro, que e maior que a barra desde 19/10.
///
/// `Perfil` continua no registro -- com rota, com submenu na gaveta e com a
/// tela inteira -- e so deixou de ocupar slot. **As duas listas existem
/// separadas de proposito:** se houvesse uma so, tirar `Perfil` da barra e
/// tira-lo do produto seriam a mesma edicao, e a tela dele guarda os cartoes
/// de pet, que sao o unico caminho ate o QR e `Marcar como perdido`.
// A INVERSAO DE `Rede` E `Perto` CHEGOU AQUI NA UNIAO DE 18/10/2026.
//
// O que esta lista provava antes: o registro inteiro na ordem
// `Pets · Rede · Perto · Loja · AuAu · Perfil`. Ela nasceu no ramo da
// navegacao, cuja base (`e636f69c`) e ANTERIOR ao pedido literal do cliente
// *"inverta a ordem no app do item rede e perto"* -- entao ela carregava a
// ordem de antes da inversao, enquanto `ordemDecidida` (logo acima) ja
// carregava a de depois. As duas discordavam entre si, e era esta que estava
// errada: `CascaComAbas.destinos` tem `Perto` em segundo.
//
// Nenhum caso de teste foi apagado nem afrouxado: o caso
// `o REGISTRO tem as cinco da barra mais a conta, nesta ordem` continua
// comparando `destinos` contra uma lista escrita A MAO, e e so a lista que
// passou a dizer a ordem da uniao.
const List<String> registroCompleto = <String>[
  'Pets',
  'Perto',
  'Rede',
  'Loja',
  'AuAu',
  'Perfil',
];

/// A tabela de 27.2.1 da UX, em dp, no clamp de 1,3x que o componente aplica.
///
/// **Isto e o criterio 8 deixando de ser processo.** "Segue o que a ARIADNE
/// entregou" nao reprova nada; a medida dela, conferida contra o render,
/// reprova. Se o tema mudar de fonte, de tamanho ou de peso, os numeros saem
/// destas casas e o caso acusa qual rotulo mudou e em quanto -- em vez de a
/// divergencia aparecer meses depois num aparelho de 320 dp.
/// `Perfil` (47,47 dp) saiu da tabela porque saiu da BARRA, e `AuAu` entrou
/// medido: **49,33 dp num slot de 64,00**, com 14,67 dp de folga.
///
/// As tres palavras que o cliente ofereceu para esta secao foram medidas nesta
/// mesma bancada antes da escolha (*"coloque uma palavra que exemplique, como
/// mensagem, conversa, AuAu"*), na escala de 1,3x que o componente aplica:
///
///   `Mensagens` 86,66 dp -> excede 22,66    (2 linhas, 5,00 dp fora)
///   `Mensagem`  82,73 dp -> excede 18,73    (2 linhas, 5,00 dp fora)
///   `Conversa`  71,13 dp -> excede  7,13    (2 linhas, 5,00 dp fora)
///   `AuAu`      49,33 dp -> CABE
///
/// As tres primeiras reprovam nas CINCO larguras suportadas, e nao so em 320.
/// `AuAu` e a unica viavel das palavras dele. A palavra clara nao se perdeu:
/// ela e o `reforcoAcessivel`, e o leitor de tela anuncia `AuAu, mensagens`.
const Map<String, double> larguraMedidaPelaUx = <String, double>{
  'Pets': 39.20,
  'Rede': 45.08,
  'Perto': 47.95,
  'Loja': 37.15,
  'AuAu': 49.33,
};

/// As palavras que o cliente ofereceu e que **nao cabem**, com a medida.
///
/// Elas ficam versionadas por um motivo: `Mensagens` e a palavra que a pessoa
/// usa para falar da secao, e ela vai voltar a ser proposta. Quando voltar, a
/// resposta nao e uma opiniao -- e esta tabela, e o caso abaixo prova que
/// nenhuma delas entra num slot de 64,0 dp.
const Map<String, double> palavrasQueNaoCabem = <String, double>{
  'Mensagens': 86.66,
  'Mensagem': 82.73,
  'Conversa': 71.13,
};

/// Os rotulos que **nao podem voltar** a ser aba, e por que.
const Map<String, String> abasQueSairam = <String, String>{
  'Início': 'cada secao e a home do proprio conteudo; nao ha tela agregadora '
      '(UX 27.2)',
  'Perdidos': 'a casa dos perdidos e `Pets`, que reune perdidos, achados e '
      'adocoes (criterio 5)',
  'Escanear': 'pede 71,57 dp num slot de 64,0, e o leitor virou rota irma com '
      'duas portas (UX 27.5.6)',
  'Encontrar': 'pede 87,39 dp num slot de 64,0 (UX 27.2.1)',
  'Perto de mim': 'pede 117,76 dp num slot de 64,0 (UX 27.2.1)',
  'Eventos': 'pede 71,57 dp num slot de 64,0; virou `Rede` (UX 27.2.2)',
  'Adoções': 'pede 78,83 dp num slot de 64,0, e virou sub-destino de `Pets` '
      '(UX 27.2.4)',
};

Future<http.Response> _semServidor(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  // O logout responde 204, como o servidor de verdade responde.
  //
  // Nao e conveniencia: desde a BICHUS-81 (`a84a286`) uma RECUSA do servidor
  // no logout vai por `FlutterError.reportError`, e em teste de widget isso
  // reprova o caso. Devolver 404 aqui faria estes casos medirem a ausencia de
  // rota no dublê em vez de medirem o destino da navegacao, que e o assunto
  // deles. Quem mede o contrato do logout e `test/sessao/sair_da_conta_test.dart`.
  if (req.url.path == '/v1/auth/logout' && req.method == 'POST') {
    return http.Response('', 204);
  }
  return http.Response('', 404);
}

// ---------------------------------------------------------------------------
// A bancada de medida
// ---------------------------------------------------------------------------

/// Carrega a `Inter` de verdade, dos arquivos de `assets/fonts/`.
///
/// **Sem isto todo numero sai errado.** O ambiente de teste do Flutter usa uma
/// fonte sintetica de largura uniforme, em que `Perto` e `Perto de mim` medem
/// proporcionalmente a mesma coisa por caractere e nenhuma quebra nunca
/// acontece. A UX perdeu uma passada inteira exatamente assim (UX 27.1).
Future<void> carregarInter() async {
  const List<String> arquivos = <String>[
    'Inter-Regular.ttf',
    'Inter-Medium.ttf',
    'Inter-SemiBold.ttf',
    'Inter-Bold.ttf',
  ];
  final carregador = FontLoader('Inter');
  for (final nome in arquivos) {
    final arquivo = File('assets/fonts/$nome');
    // Verificacao que nao consegue verificar REPROVA. Um `if (existe)` calado
    // aqui deixaria a suite medindo a fonte sintetica e aprovando qualquer
    // rotulo, que e o defeito que este arquivo inteiro existe para pegar.
    if (!arquivo.existsSync()) {
      fail(
        'REPROVA: nao achei "assets/fonts/$nome" a partir de '
        '"${Directory.current.path}". Sem a Inter real a medida do rotulo e '
        'feita contra a fonte sintetica de largura uniforme, que NUNCA quebra '
        'linha -- o portao ficaria verde por estar medindo outra coisa.',
      );
    }
    final bytes = arquivo.readAsBytesSync();
    carregador.addFont(
      Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(bytes))),
    );
  }
  await carregador.load();
}

/// Monta **so a barra**, com o tema do app, na largura pedida e na escala
/// pedida.
///
/// E a mesma funcao que mede a composicao decidida e a fixture que transborda:
/// se nao fosse a mesma, o autoteste provaria outra coisa.
Future<void> montarBarra(
  WidgetTester tester, {
  required List<String> rotulos,
  required double largura,
  double escala = 2,
}) async {
  tester.view.physicalSize = Size(largura * 3, 2000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(escala)),
      child: MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          bottomNavigationBar: NavigationBar(
            selectedIndex: 0,
            destinations: <Widget>[
              for (final rotulo in rotulos)
                NavigationDestination(
                  icon: const Icon(Icons.circle_outlined),
                  label: rotulo,
                ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Um rotulo que nao coube: em quantas linhas ele saiu, e quanto foi pintado
/// fora da barra.
typedef Transbordo = ({String rotulo, double largura, int linhas, double fora});

/// Mede os rotulos ja montados. Devolve **so os que nao couberam**.
List<Transbordo> medir(WidgetTester tester, List<String> rotulos, double tela) {
  final barra = tester.getRect(find.byType(NavigationBar));
  final achados = <Transbordo>[];

  for (final rotulo in rotulos) {
    final alvo = find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text(rotulo),
    );
    expect(
      alvo,
      findsOneWidget,
      reason: 'REPROVA: nao achei o rotulo "$rotulo" pintado dentro da barra '
          'em $tela dp. Sem ele nao ha o que medir, e um portao sem o que '
          'medir reprova com o motivo, nunca aprova por ausencia.',
    );

    // O numero de linhas sai do RENDER, e nao de um `TextPainter` montado a
    // parte. Remedir com um painter proprio seria o atalho que parece
    // equivalente: ele nao sabe do `clamp` de 1,3x que o componente aplica
    // sozinho, nem da largura exata do slot que o leiaute distribuiu.
    final paragrafo = tester.renderObject<RenderParagraph>(alvo);
    final caixas = paragrafo.getBoxesForSelection(
      TextSelection(baseOffset: 0, extentOffset: rotulo.length),
    );
    expect(
      caixas,
      isNotEmpty,
      reason: 'REPROVA: o render de "$rotulo" nao devolveu caixa nenhuma. Sem '
          'caixa nao ha contagem de linha, e o medidor aprovaria por vazio.',
    );
    final linhas = caixas.map((c) => c.top.round()).toSet().length;
    final peDoTexto = tester.getRect(alvo).bottom;
    final fora = peDoTexto - barra.bottom;

    if (linhas > 1 || fora > 0.01) {
      achados.add(
        (rotulo: rotulo, largura: tela, linhas: linhas, fora: fora),
      );
    }
  }
  return achados;
}

/// Os destinos que a barra pinta hoje. **Cinco**, sem a conta.
///
/// Existe para os casos nao iterarem `CascaComAbas.destinos` quando o assunto
/// e a BARRA: desde 19/10 o registro tem uma entrada que nao e pintada nela, e
/// um caso que monte a barra com seis rotulos mede um slot que nao existe.
List<DestinoDeNavegacao> get destinosDaBarra =>
    CascaComAbas.visiveisEm(CascaComAbas.configuracao);

String relatorioDeTransbordo(List<Transbordo> t) {
  return t
      .map((a) => '  ${a.largura.toStringAsFixed(0)} dp — "${a.rotulo}": '
          '${a.linhas} linha(s), ${a.fora.toStringAsFixed(2)} dp fora da barra')
      .join('\n');
}

/// Percorre a arvore de semantica inteira.
List<SemanticsNode> todosOsNos(WidgetTester tester) {
  // A raiz vem do widget mais alto da arvore, e nao do `pipelineOwner` do
  // binding: o do binding esta depreciado, e o `rootPipelineOwner` nao e o
  // dono do `semanticsOwner` desta arvore -- ele devolve nulo e o caso
  // reprovaria por um motivo que nao e o dele.
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
  expect(
    todos.length,
    greaterThan(1),
    reason: 'REPROVA: a arvore de semantica tem $todos no(s). Sem '
        '`ensureSemantics` ela nasce vazia e o caso passaria por vacuidade.',
  );
  return todos;
}

// ---------------------------------------------------------------------------

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(carregarInter);

  // -------------------------------------------------------------------------
  group('o registro', () {
    test('a BARRA sao exatamente cinco, e a ordem e esta', () {
      expect(
        CascaComAbas.visiveisEm(CascaComAbas.configuracao)
            .map((d) => d.rotulo)
            .toList(),
        ordemDecidida,
        reason: 'REPROVA: a barra deixou de ser `${ordemDecidida.join(' · ')}`. '
            'A composicao foi decidida pelo cliente em 21/09, medida pela UX '
            'em 27.2 e REVISTA por ele em 19/10 (mensagens entra, `Perfil` '
            'sai); mudar rotulo ou ordem aqui exige remedir contra o slot de '
            '64,0 dp em 320 dp.',
      );
    });

    test('o REGISTRO tem as cinco da barra mais a conta, nesta ordem', () {
      expect(
        CascaComAbas.destinos.map((d) => d.rotulo).toList(),
        registroCompleto,
        reason: 'REPROVA: o registro deixou de ser '
            '`${registroCompleto.join(' · ')}`. O registro e maior que a '
            'barra desde 19/10: `Perfil` continua aqui, com rota e com tela, '
            'e so perdeu o slot.',
      );
    });

    test('exatamente um destino esta fora da barra, e e a conta', () {
      final foraDaBarra =
          CascaComAbas.destinos.where((d) => !d.naBarra).toList();
      expect(
        foraDaBarra.map((d) => d.rotulo).toList(),
        <String>['Perfil'],
        reason: 'REPROVA: os destinos fora da barra sao '
            '${foraDaBarra.map((d) => d.rotulo).toList()}. So a conta sai da '
            'barra, e ela sai porque a porta dela virou a foto da barra de '
            'topo. Um segundo destino escondido seria uma secao sem porta '
            'nenhuma.',
      );
      expect(
        CascaComAbas.daConta.rota,
        Rotas.perfil,
        reason: 'REPROVA: o destino da conta aponta para '
            '"${CascaComAbas.daConta.rota}". E ele que a foto da barra de topo '
            'abre, e e a tela que guarda os cartoes de pet.',
      );
    });

    test('ISCA: nenhuma das palavras medidas como grandes entrou na barra', () {
      // A guarda, para o caso nao passar por vacuidade se a tabela esvaziar.
      expect(palavrasQueNaoCabem, isNotEmpty);
      final naBarra = CascaComAbas.visiveisEm(CascaComAbas.configuracao)
          .map((d) => d.rotulo)
          .toSet();
      for (final entrada in palavrasQueNaoCabem.entries) {
        expect(
          naBarra,
          isNot(contains(entrada.key)),
          reason: 'REPROVA: "${entrada.key}" esta na barra, e ela mede '
              '${entrada.value.toStringAsFixed(2)} dp num slot de 64,0 dp. '
              'Ela quebra em duas linhas e pinta 5,00 dp fora da barra nas '
              'CINCO larguras suportadas. O rotulo que cabe e `AuAu`, com a '
              'palavra clara no nome acessivel.',
        );
      }
    });

    test('nenhuma aba aposentada voltou ao registro', () {
      final atuais = CascaComAbas.destinos.map((d) => d.rotulo).toSet();
      final voltaram = <String>[];
      for (final entrada in abasQueSairam.entries) {
        if (atuais.contains(entrada.key)) {
          voltaram.add('${entrada.key} (${entrada.value})');
        }
      }
      // A guarda do portao: uma lista vazia de aposentadas faria este caso
      // passar por vacuidade para sempre.
      expect(abasQueSairam, isNotEmpty);
      expect(
        voltaram,
        isEmpty,
        reason: 'REPROVA: voltaram como aba:\n  ${voltaram.join('\n  ')}',
      );
    });

    testWidgets('a barra pinta as cinco, na ordem, e NAO pinta as aposentadas',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor);

      final pintados = tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((d) => d.label)
          .toList();
      expect(
        pintados,
        ordemDecidida,
        reason: 'REPROVA: a barra montada pinta $pintados. O registro pode '
            'estar certo e a casca estar montando outra coisa.',
      );

      // **Asseverar a AUSENCIA, e nao so a presenca** (criterio 5). Um caso
      // que so conferisse `Pets` continuaria verde com uma sexta aba
      // `Perdidos` ao lado dela.
      for (final aposentada in abasQueSairam.keys) {
        expect(
          find.widgetWithText(NavigationDestination, aposentada),
          findsNothing,
          reason: 'REPROVA: "$aposentada" esta na barra. '
              '${abasQueSairam[aposentada]}',
        );
      }
    });

    testWidgets('a ordem dos RAMOS e a ordem do registro', (tester) async {
      // Se as duas sairem de ordem, a barra pinta `Perfil` e abre `Rede`, e
      // nenhum dos casos acima pega isso: os dois olham so para a barra.
      await abrirOApp(tester, rede: _semServidor);

      // **So os slots que SAO ramo**, e a distincao e de 19/10: o slot de
      // mensagens empurra uma rota em vez de trocar de ramo, porque a tela
      // dela e de outro agente e nao existe nesta arvore. Tocar nele nao abre
      // uma secao da casca, e cobra-lo aqui mediria outra coisa.
      for (final destino in destinosDaBarra.where((d) => d.ehRamo)) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(AppBar, destino.rotulo),
          findsOneWidget,
          reason: 'REPROVA: tocar em "${destino.rotulo}" nao abriu a secao '
              '"${destino.rotulo}". A ordem dos ramos de `StatefulShellRoute` '
              'precisa ser a ordem de `CascaComAbas.ramosDoRegistro`.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  group('o rotulo cabe em 64,0 dp', () {
    testWidgets('GUARDA: a fonte da bancada e a Inter REAL, e nao a sintetica',
        (tester) async {
      // A fonte sintetica do ambiente de teste tem largura uniforme: `iiii` e
      // `WWWW` medem igual. Se este caso passar a aprovar, todo numero do
      // grupo vira ficcao e o portao fica verde por estar medindo outra coisa.
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: const Scaffold(
            body: Row(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text('iiii', style: TextStyle(fontFamily: 'Inter')),
                Text('WWWW', style: TextStyle(fontFamily: 'Inter')),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();

      final estreito = tester.getSize(find.text('iiii')).width;
      final largo = tester.getSize(find.text('WWWW')).width;
      expect(
        largo,
        greaterThan(estreito * 1.5),
        reason: 'REPROVA: "WWWW" ($largo) nao e ao menos 1,5x mais largo que '
            '"iiii" ($estreito). Isso e assinatura de fonte de largura '
            'uniforme: a `Inter` de assets/fonts/ NAO carregou, e as medidas '
            'deste arquivo nao valem nada.',
      );
    });

    for (final largura in larguras) {
      testWidgets(
          'nenhum rotulo quebra em duas linhas em ${largura.toInt()} dp, '
          'com a fonte do sistema em 200%', (tester) async {
        // Os rotulos vem do REGISTRO, e nao da lista escrita a mao: trocar
        // `Perto` por `Perto de mim` tem de reprovar AQUI, na medida, e nao
        // so no caso que compara a ordem. Portao de medida que le uma copia
        // continua medindo o rotulo velho para sempre.
        // `destinosDaBarra`, e nao `CascaComAbas.destinos`: o registro tem
        // uma entrada que a barra nao pinta (a conta), e montar seis rotulos
        // mediria um slot de 53,3 dp que nao existe em tela nenhuma.
        final rotulos =
            destinosDaBarra.map((d) => d.rotulo).toList(growable: false);
        await montarBarra(tester, rotulos: rotulos, largura: largura);
        final transbordos = medir(tester, rotulos, largura);
        expect(
          transbordos,
          isEmpty,
          reason: 'REPROVA: rotulo quebrado ou pintado fora da barra.\n'
              '${relatorioDeTransbordo(transbordos)}\n'
              'Este e o defeito da BICHUS-172: a segunda linha e desenhada '
              'FORA do retangulo da barra, e o Flutter nao lanca excecao de '
              'leiaute por isso. Rotulo que nao cabe se resolve trocando a '
              'palavra em projeto, nunca com reticencia ou quebra de linha '
              '(design system 11.11).',
        );
      });
    }

    testWidgets('a largura de cada rotulo bate com a medida da UX 27.2.1',
        (tester) async {
      final rotulos =
          destinosDaBarra.map((d) => d.rotulo).toList(growable: false);

      // A guarda: a tabela e a BARRA precisam falar dos MESMOS rotulos. Um
      // rotulo novo sem linha na tabela passaria sem ser medido, e uma linha
      // orfa manteria o caso verde medindo algo que nao esta mais na barra.
      expect(
        larguraMedidaPelaUx.keys.toSet(),
        rotulos.toSet(),
        reason: 'REPROVA: a tabela de 27.2.1 e a barra divergem. Rotulo '
            'novo precisa ser MEDIDO antes de entrar, contra o slot de 64,0 '
            'dp em 320 dp.',
      );

      await montarBarra(tester, rotulos: rotulos, largura: 320);
      final barra = tester.getRect(find.byType(NavigationBar));
      final slot = barra.width / rotulos.length;

      expect(
        slot,
        closeTo(64, 0.01),
        reason: 'REPROVA: o slot em 320 dp deu $slot dp, e nao 64,0. Com '
            'cinco destinos essa e a regua que decide todo rotulo, e o '
            'indicador do M3 tem 64 dp fixos -- folga zero.',
      );
      expect(
        barra.height,
        closeTo(72, 0.01),
        reason: 'REPROVA: a barra mede ${barra.height} dp de altura. O tema '
            'a fixa em 72 (`bichu_theme.dart`), e o alvo de toque do pior '
            'caso (64,0 x 72,0) depende disso.',
      );

      final divergencias = <String>[];
      for (final rotulo in rotulos) {
        final alvo = find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(rotulo),
        );
        final medido = tester.renderObject<RenderParagraph>(alvo).size.width;
        final esperado = larguraMedidaPelaUx[rotulo]!;
        if ((medido - esperado).abs() > 0.5) {
          divergencias.add(
            '  "$rotulo": medi ${medido.toStringAsFixed(2)} dp, a UX mediu '
            '${esperado.toStringAsFixed(2)} dp',
          );
        }
        expect(
          medido,
          lessThan(slot),
          reason: 'REPROVA: "$rotulo" pede ${medido.toStringAsFixed(2)} dp '
              'num slot de ${slot.toStringAsFixed(2)} dp.',
        );
      }
      expect(
        divergencias,
        isEmpty,
        reason: 'REPROVA: a medida do render nao bate com a tabela da UX '
            '27.2.1:\n${divergencias.join('\n')}\n'
            'Ou o tema mudou de tipografia, ou a bancada esta medindo outra '
            'fonte. Nos dois casos a decisao de cinco secoes precisa ser '
            'remedida antes de continuar.',
      );
    });

    testWidgets(
        'AUTOTESTE: a composicao que comprovadamente transborda e REPROVADA',
        (tester) async {
      // **A fixture versionada.** Nao e "a barra de hoje", que muda; e a
      // composicao de cinco com os rotulos que a UX mediu e descartou por
      // nao caberem: `Perto de mim` (117,76 dp) e `Escanear` (71,57 dp)
      // contra um slot de 64,0.
      //
      // Sem este caso, no dia em que `computeLineMetrics` mudasse de
      // comportamento ou o finder parasse de achar o texto, os cinco casos
      // acima ficariam verdes por nao medir nada.
      const List<String> fixtureQueNaoCabe = <String>[
        'Pets',
        'Escanear',
        'Perto de mim',
        'Loja',
        'Perfil',
      ];

      await montarBarra(
        tester,
        rotulos: fixtureQueNaoCabe,
        largura: 320,
      );
      final transbordos = medir(tester, fixtureQueNaoCabe, 320);

      expect(
        transbordos,
        isNotEmpty,
        reason: 'REPROVA: o medidor APROVOU `Perto de mim` num slot de 64,0 dp '
            'em 320 dp. Ele mede 117,76 dp. Um medidor que aprova isso nao '
            'reprova nada, e os cinco casos de cima passam a valer por '
            'confianca.',
      );
      expect(
        transbordos.map((t) => t.rotulo),
        contains('Perto de mim'),
        reason: 'REPROVA: o medidor achou transbordo, mas nao no rotulo que '
            'sabidamente transborda. Ele esta medindo outra coisa.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a anatomia desenhada no Figma', () {
    testWidgets('a barra de topo da raiz de aba tem 64 dp, e nao os 56 do M3',
        (tester) async {
      // Design system 23.2. O tema nao fixa `toolbarHeight`, entao sem a
      // linha em `TelaDeAba` toda raiz de aba nasce com 56 e diverge do
      // quadro. Medido, e nao lido do widget: `preferredSize` mente quando o
      // leiaute aperta.
      await abrirOApp(tester, rede: _semServidor);
      expect(
        tester.getSize(find.byType(AppBar)).height,
        closeTo(64, 0.01),
        reason: 'REPROVA: a barra de topo da raiz de aba nao tem 64 dp. O '
            'quadro do Figma e o 23.2 do design system pedem 64, e '
            '`BarraDeConta` ja usa a mesma medida nas telas de conta.',
      );
    });

    testWidgets('a raiz de aba NAO tem saida: a variante e Saida=Nenhuma',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byTooltip('Voltar'),
        ),
        findsNothing,
        reason: 'REPROVA: a raiz de aba ganhou saida. Quem chega numa aba '
            'chegou pela barra de baixo, e uma seta ali competiria com ela '
            '(design system 23.4).',
      );
    });

    testWidgets('a casca TEM a gaveta lateral, e ela abre pelo botao',
        (tester) async {
      // ISCA INVERTIDA — BICHUS-234, decisao do cliente de 22/09.
      //
      // Em 21/09 a recomendacao medida era NAO ter gaveta, e o portao daquele
      // dia vigiava a ausencia dela. Em 22/09 o cliente pediu a gaveta duas
      // vezes, a segunda depois de ler o argumento contra, e a decisao dele
      // prevalece. Este caso e o mesmo portao virado: ele reprova quem TIRAR
      // a gaveta da casca.
      //
      // Ele existe porque a gaveta e facil de perder sem querer. Ela nao tem
      // controle proprio na arvore quando esta fechada, nenhuma tela quebra
      // sem ela, e o `drawer:` do `Scaffold` da casca e uma linha que
      // desaparece numa refatoracao sem deixar rastro na tela. Sem isca, a
      // decisao do cliente valeria ate o proximo diff grande.
      await abrirOApp(tester, rede: _semServidor);
      // **A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026** (pedido do cliente), e a
      // `Rede` nao tem sub-destino: sem sub-destino nao ha gaveta e nao ha
      // gatilho (a segunda metade de `comGaveta`, neste mesmo arquivo de
      // producao). O caso fala da gaveta da casca, entao vai a uma secao que
      // tem uma.
      await abrirAAba(tester, 'Pets');

      final comGaveta = tester
          .widgetList<Scaffold>(find.byType(Scaffold))
          .where((s) => s.drawer != null)
          .toList();
      expect(
        comGaveta,
        hasLength(1),
        reason: 'REPROVA: a casca esta sem gaveta, ou com mais de uma. O '
            'cliente pediu a gaveta em 22/09, depois de ler a recomendacao '
            'contra, e ela mora no MESMO `Scaffold` da barra de baixo -- e '
            'so nele. Montada na tela de dentro, a cortina modal deixa de '
            'bloquear a barra de baixo e os cinco destinos continuam '
            'tocaveis pelo leitor de tela com a gaveta aberta.',
      );
      expect(
        comGaveta.single.drawer,
        isA<GavetaDeSecoes>(),
        reason: 'REPROVA: a casca tem gaveta, e nao e a `GavetaDeSecoes`. '
            'Uma gaveta qualquer nao carrega a divisao entre os dois menus '
            'nem a regra de nao renderizar o que nao existe.',
      );

      // O PRECO que o cliente aceitou junto com a gaveta, parte 1: ela nao
      // abre por arrasto de borda. No iOS a borda esquerda ja e o voltar
      // deste app, e no Android o voltar por gesto sai das duas bordas.
      // Religar este padrao e a forma silenciosa de a gaveta voltar a brigar
      // com o gesto do sistema em toda tela de secao.
      expect(
        comGaveta.single.drawerEnableOpenDragGesture,
        isFalse,
        reason: 'REPROVA: a gaveta voltou a abrir por arrasto de borda. O '
            'padrao do Flutter e `true`, entao isto regride sozinho quando '
            'alguem reescreve o `Scaffold` da casca.',
      );

      // O PRECO, parte 2: com o arrasto desligado, o botao da barra de topo e
      // o UNICO jeito de abrir. Declarar o `drawer:` e nao desenhar o gatilho
      // deixaria os submenus inalcancaveis, e o caso acima, sozinho, passaria.
      //
      // O rotulo esta escrito a mao, com acento, e NAO lido de
      // `TextosDaGaveta`: comparar o texto renderizado com a constante que o
      // produz aprovaria qualquer troca de palavra.
      //
      // Ele era `Abrir os atalhos das seções` ate 22/09 e mudou em 23/09, com
      // a gaveta: ela deixou de ser o indice das cinco secoes e passou a ser o
      // submenu da secao atual, entao o nome acessivel do gatilho passou a
      // dizer isso. A troca reprovou AQUI antes de ser escrita, que e o
      // servico que este literal presta.
      final gatilho = find.byTooltip('Abrir o submenu desta seção');
      expect(
        gatilho,
        findsOneWidget,
        reason: 'REPROVA: a raiz de secao nao tem o gatilho da gaveta na '
            'barra de topo. Sem ele a gaveta existe na arvore e nao abre por '
            'caminho nenhum.',
      );

      await tester.tap(gatilho);
      await tester.pumpAndSettle();
      expect(
        find.byType(Drawer),
        findsOneWidget,
        reason: 'REPROVA: o gatilho existe e nao abriu a gaveta. A prova '
            'deste caso e o comportamento, e nao a declaracao: `drawer:` '
            'preenchido com o gatilho apontando para o `Scaffold` errado '
            'passa na leitura do widget e falha no aparelho.',
      );
    });

    testWidgets('a barra inferior tem 72 dp e o filete de 1px em `outline`',
        (tester) async {
      // O filete e **obrigatorio, nao decorativo** (design system 22.1): a
      // barra usa `surface`, que esta a 1,04:1 do corpo da pagina, e sem ele
      // ela nao existe visualmente. No Figma ele aparece como o `y = 0.5` dos
      // cinco destinos dentro do simbolo `185:59`.
      await abrirOApp(tester, rede: _semServidor);

      expect(
        tester.getSize(find.byType(NavigationBar)).height,
        closeTo(72, 0.01),
        reason: 'REPROVA: a barra inferior saiu de 72 dp. O alvo de toque do '
            'pior caso (64,0 x 72,0) depende dessa altura.',
      );

      final moldura = find.ancestor(
        of: find.byType(NavigationBar),
        matching: find.byType(DecoratedBox),
      );
      final comFilete = tester
          .widgetList<DecoratedBox>(moldura)
          .map((d) => d.decoration)
          .whereType<BoxDecoration>()
          .where((d) => d.border?.top.width == BichuBorda.hairline)
          .toList();
      expect(
        comFilete,
        isNotEmpty,
        reason: 'REPROVA: a barra inferior perdeu o filete de 1px no topo. '
            'Ele e obrigatorio pelo 22.1: a barra em `surface` esta a 1,04:1 '
            'do corpo, e sem o filete a separacao nao existe na tela.',
      );
      expect(
        comFilete.first.border!.top.color,
        BichuColors.claro.cores.outline,
        reason: 'REPROVA: o filete nao e `cor/outline`. Ele sai de token, '
            'nunca de hex literal.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('o leitor de QR tem UMA porta e um leitor so', () {
    // **O QUE ESTE GRUPO PROVAVA, E O QUE ELE PROVA AGORA.**
    //
    // Ele provava DUAS portas: a primaria, em `Pets`, e a de conta, em
    // `Perfil`. A regra da UX 27.5.6 dizia que, se apenas uma fosse
    // construida, teria de ser a de `Pets` -- porque quem acha um cachorro na
    // rua nao pensa a palavra `Perfil`.
    //
    // **O cliente reverteu isso em 19/10**, com estas palavras: *"leve o
    // icone de qr-code de escanear para a pagina do perfil que tem relacao
    // com as acoes do usuario."* Ficou UMA porta, e ela e a da tela da conta.
    //
    // O caso da porta de `Pets` **nao foi apagado**: ele virou o caso abaixo,
    // que assevera a AUSENCIA dela ali. Trocar "existe em Pets" por "nao
    // existe em Pets" e o que mantem a decisao provada nos dois sentidos --
    // sem isso, repor o icone em `Pets` passaria verde e o produto voltaria a
    // ter duas portas sem ninguem decidir isso.
    //
    // **O que NAO mudou, e e o que mais importa:** o leitor continua
    // alcancavel SEM CONTA. A autenticacao da rota dele e opcional, e quem
    // acha um animal na rua pode nao ter conta; o ramo deslogado da tela da
    // conta desenha `Escanear uma tag`, e a foto que abre essa tela aparece
    // deslogada. Ha caso para isso logo abaixo.
    testWidgets('a porta de QR NAO esta mais na barra de `Pets`',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026: a porta primaria do leitor
      // mora em `Pets` (UX 27.5.6), e o caso diz em voz alta que vai ate ela.
      await abrirAAba(tester, 'Pets');

      expect(
        find.widgetWithText(NavigationDestination, 'Pets'),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(AppBar),
          matching: find.byIcon(Icons.qr_code_2),
        ),
        findsNothing,
        reason: 'REPROVA: o icone de QR voltou a barra de topo de `Pets`. Ele '
            'foi movido para a pagina da conta em 19/10, por decisao do '
            'cliente, e a tela da conta JA tinha `Escanear uma tag` -- repor '
            'aqui devolve ao produto duas portas para o mesmo leitor.',
      );
    });

    testWidgets('a porta unica chega ao leitor, pela tela da conta',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      await irParaAConta(tester);

      final porta = find.widgetWithText(ItemDeMenu, 'Escanear uma tag');
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: a porta do leitor sumiu da tela da conta. Depois de '
            '19/10 ela e a UNICA, e sem ela o caminho de quem achou um '
            'cachorro na rua fica inalcancavel.',
      );
      await tester.tap(porta);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta unica existe e nao abre o leitor.',
      );
    });

    testWidgets('ISCA SEM CONTA: deslogado ainda chega ao leitor',
        (tester) async {
      // **O risco desta mudanca, provado e nao suposto.** Mover o leitor para
      // a tela da conta esconderia ele de quem nao tem conta se aquela tela
      // fosse so para quem esta logado. Ela nao e -- e esta isca falha no dia
      // em que alguem a tornar.
      await abrirOApp(tester, rede: _semServidor);
      await irParaAConta(tester);

      final porta = find.widgetWithText(ElevatedButton, 'Escanear uma tag');
      final qualquer = porta.evaluate().isNotEmpty
          ? porta
          : find.text('Escanear uma tag');
      expect(
        qualquer,
        findsWidgets,
        reason: 'REPROVA: deslogado nao ha porta para o leitor. A '
            'autenticacao da rota do leitor e OPCIONAL de proposito: quem '
            'acha um animal na rua e exatamente quem pode nao ter conta '
            'nenhuma, e esconder o leitor dessa pessoa e o oposto da cunha '
            'do produto.',
      );
      await tester.tap(qualquer.first);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta deslogada existe e nao abre o leitor.',
      );
    });

    testWidgets('a porta de CONTA, em Perfil, chega ao mesmo leitor',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      // A PORTA MUDOU DE LUGAR EM 19/10: era o slot `Perfil` da barra de
      // baixo, e virou a foto da barra de topo. O destino nao mudou, e e isso
      // que este caso continua provando.
      await irParaAConta(tester);

      // A porta de conta virou ITEM DE MENU em 18/10/2026 (pedido do
      // cliente: "apenas os menus para realizar as acoes e nao todos os
      // botoes nessa pagina"). **O que este caso cobra nao mudou**: a porta
      // existe em `Perfil` e chega ao MESMO leitor. Mudou a forma do
      // controle, e por isso o finder e `ItemDeMenu` e nao `OutlinedButton` --
      // a porta PRIMARIA, em `Pets`, continua botao e continua medida no caso
      // de cima.
      final portaDeConta =
          find.widgetWithText(ItemDeMenu, 'Escanear uma tag');
      await rolarAte(tester, portaDeConta);
      await tester.tap(portaDeConta);
      await tester.pumpAndSettle();

      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta de conta do leitor sumiu de `Perfil`. E a '
            'segunda porta de 27.5.6, onde o cliente pediu.',
      );
    });

    testWidgets('e um leitor so: a rota e a mesma nas duas portas',
        (tester) async {
      // Dois leitores e como dois codigos de resolucao nascem, e no dia em que
      // os tres cenarios de QR entrarem um deles fica para tras.
      await abrirOApp(tester, rede: _semServidor);
      final roteador = rotasRegistradasDoApp(tester);
      expect(
        roteador.where((r) => r == Rotas.escanear).length,
        1,
        reason: 'REPROVA: ha mais de uma rota de leitor registrada. O criterio '
            '4 diz "um leitor so".',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a semantica da barra e do corpo', () {
    test('cada destino declara um semanticsLabel que comeca pelo rotulo', () {
      // **A guarda que o criterio 7 exige por escrito:** reprovar quando a
      // lista estiver vazia, senao o laco fica verde por nao ter o que
      // conferir.
      expect(
        CascaComAbas.destinos,
        isNotEmpty,
        reason: 'REPROVA: `CascaComAbas.destinos` esta vazia. O portao '
            'percorreria zero destinos e aprovaria por vacuidade -- que e a '
            'armadilha que ja custou caro neste projeto.',
      );

      for (final destino in CascaComAbas.destinos) {
        expect(
          destino.semanticsLabel,
          startsWith(destino.rotulo),
          reason: 'REPROVA: o nome acessivel de "${destino.rotulo}" nao '
              'comeca pelo rotulo visivel, literal. E o SC 2.5.3 (rotulo no '
              'nome): quem usa comando de voz diz "tocar em ${destino.rotulo}" '
              'e o casamento acontece pelo texto visivel contido no nome.',
        );
        expect(
          destino.semanticsLabel.length,
          greaterThan(destino.rotulo.length),
          reason: 'REPROVA: o nome acessivel de "${destino.rotulo}" e so o '
              'rotulo. O rotulo encurtou de `Perdidos` para `Pets` e de '
              '`Eventos` para `Rede`, e o significado foi para o icone, que e '
              'decorativo e NAO e anunciado. Sem o reforco, quem usa leitor de '
              'tela recebe um sinal onde quem enxerga recebe tres.',
        );
        // **A DECISAO VIROU AO CONTRARIO EM 18/10/2026.**
        //
        // Ate esta data o caso cobrava `isNotEmpty` aqui, com a razao escrita
        // "ela e a outra metade da decisao do cliente (UX 27.4.2)" -- e estava
        // certo enquanto a decisao era aquela. Um agente parou nesta linha em
        // vez de apagar a frase, e fez bem.
        //
        // O cliente reverteu, literal: *"remova os textos 'os profissionais e
        // estabelecimentos indicados por quem já usou. os eventos de quem tem
        // pet aqui perto de você. Os pets perdidos e os que estão para adoção
        // aqui na sua região. Seus pets, sua plaquinha e os ajustes da sua
        // conta.'"*. O caso NAO foi apagado: ele passou a cobrar a regra de
        // hoje, no mesmo lugar e no mesmo laco. Quem escrever frase de apoio
        // numa secao reprova aqui.
        expect(
          destino.reforcoDaPagina,
          isEmpty,
          reason: 'REPROVA: "${destino.rotulo}" voltou a ter linha de apoio no '
              'corpo ("${destino.reforcoDaPagina}"). O cliente removeu as '
              'cinco em 18/10/2026, nominalmente. Rotulo curto explicado por '
              'frase no corpo foi decisao de 21/09 e ele a desfez.',
        );
        // **E a metade que NAO saiu, no mesmo laco de proposito.** As duas
        // frases moravam no mesmo objeto, e o risco da remocao era levar esta
        // junto: ela e invisivel na tela e e o unico sinal que quem usa leitor
        // de tela recebe alem do rotulo de quatro letras. Os dois `expect` de
        // `semanticsLabel` acima ja reprovariam; este nomeia o campo, para a
        // reprovacao dizer QUAL metade caiu.
        expect(
          destino.reforcoAcessivel,
          isNotEmpty,
          reason: 'REPROVA: "${destino.rotulo}" ficou sem `reforcoAcessivel`. '
              'ELE NAO E A FRASE QUE O CLIENTE REMOVEU: aquela aparecia no '
              'corpo da pagina, esta nao aparece em lugar nenhum da tela -- e '
              'a segunda metade do nome que o leitor de tela anuncia na barra. '
              'Sem ela, `Pets` e `Rede` viram rotulos sem assunto e a remocao '
              'de um texto visivel virou regressao de acessibilidade.',
        );
        expect(
          destino.semanticsLabel,
          contains(destino.reforcoAcessivel),
          reason: 'REPROVA: o nome acessivel de "${destino.rotulo}" deixou de '
              'carregar `reforcoAcessivel`. O campo pode estar cheio e nao '
              'chegar a ninguem -- e o defeito de `nomeDaImagem` antes de '
              '17/10, campo preenchido que a tela ignorava.',
        );
      }
    });

    testWidgets('na arvore, cada aba anuncia nome, papel de guia e selecao',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      // **A `Rede` TEM ABAS PROPRIAS NO CORPO** (`Proximos`/`Encerrados`), e
      // elas sao `SemanticsRole.tab` do mesmo jeito. Com a `Rede` virando a aba
      // de arranque em 18/10/2026, a varredura passou a achar SETE guias para
      // cinco destinos -- e a falha era exatamente esta, nao uma regressao de
      // semantica.
      //
      // O assunto deste caso e a BARRA DE BAIXO. Ir para `Pets`, a raiz sem
      // abas no corpo, devolve a varredura ao assunto dela e mantem o
      // `isSelected` do indice 0 medindo o que media. Quem mede a aba de
      // arranque e `test/widget_test.dart`.
      await abrirAAba(tester, 'Pets');

      final guias = todosOsNos(tester)
          .where((n) => n.getSemanticsData().role == SemanticsRole.tab)
          .toList();
      // As guias sao as da BARRA: a conta nao e guia desde 19/10 -- ela nao
      // tem slot, e a porta dela e a foto da barra de topo, que e um botao.
      final naBarra = destinosDaBarra;
      expect(
        guias,
        hasLength(naBarra.length),
        reason: 'REPROVA: achei ${guias.length} guias na arvore e a barra '
            'tem ${naBarra.length}.',
      );

      for (var i = 0; i < naBarra.length; i++) {
        final destino = naBarra[i];
        final no = guias[i];
        expect(
          no.label,
          startsWith(destino.semanticsLabel),
          reason: 'REPROVA: a guia ${i + 1} anuncia "${no.label}", e nao '
              'comeca por "${destino.semanticsLabel}".',
        );
        expect(
          no.label,
          contains(destino.rotulo),
          reason: 'REPROVA: o rotulo visivel "${destino.rotulo}" nao esta no '
              'nome acessivel (SC 2.5.3).',
        );
        // **Identificavel sem depender de cor:** o estado de selecao vem da
        // arvore, e nao da pilula.
        expect(
          no.getSemanticsData().flagsCollection.isSelected,
          i == 0 ? Tristate.isTrue : Tristate.isFalse,
          reason: 'REPROVA: a guia ${i + 1} ("${destino.rotulo}") nao declara '
              'o estado de selecao. Quem nao distingue a cor da pilula fica '
              'sem saber em que aba esta.',
        );
        expect(
          no.getSemanticsData().hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: a guia "${destino.rotulo}" nao expoe a acao de '
              'toque. O leitor de tela anuncia e nao consegue ativar.',
        );
      }
      handle.dispose();
    });

    testWidgets(
        'ISCA — o nome acessivel da aba NAO saiu junto com as descricoes',
        (tester) async {
      // **POR QUE ESTA ISCA EXISTE.** Em 18/10/2026 o cliente removeu as cinco
      // frases de apoio do corpo das paginas. Os dois textos moravam no MESMO
      // objeto (`DestinoDeNavegacao`): `reforcoDaPagina`, que era visivel, e
      // `reforcoAcessivel`, que nunca apareceu em tela nenhuma e e a segunda
      // metade do nome que o leitor de tela anuncia na barra.
      //
      // Levar os dois na mesma passada e a regressao obvia, e ela e CALADA:
      // na tela nada muda, a suite de layout fica verde, e quem navega sem ver
      // passa a ouvir cinco rotulos de quatro a seis letras -- `Pets`, `Rede`,
      // `Perto`, `Loja`, `Perfil` -- sem nenhum assunto, porque o icone e
      // decorativo e nao e anunciado.
      //
      // Esta isca mede as DUAS metades na mesma arvore: a frase visivel fora,
      // a frase acessivel dentro. E o que separa "remover texto visivel" de
      // "remover informacao".
      //
      // ISCA: em `telas/casca_com_abas.dart`, troque qualquer
      // `reforcoAcessivel` por `''` -- ou apague a metade de tras de
      // `semanticsLabel`. Este caso reprova nomeando a secao.
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      // Pelo mesmo motivo do caso acima: a `Rede` e a aba de arranque e tem
      // abas proprias no corpo, que entrariam na varredura de guias. O assunto
      // aqui e a barra de baixo.
      await abrirAAba(tester, 'Pets');

      final guias = todosOsNos(tester)
          .where((n) => n.getSemanticsData().role == SemanticsRole.tab)
          .toList();
      // AS GUIAS SAO AS DA BARRA, e nao o registro inteiro (uniao de
      // 18/10/2026): desde que `Perfil` perdeu o slot, `destinos` tem SEIS e a
      // barra desenha CINCO. Parear guia com `destinos` fazia o laco procurar
      // uma guia `Perfil` que nao existe. As propriedades de `Perfil`
      // continuam medidas no laco de baixo, que percorre o registro inteiro.
      final naBarra =
          CascaComAbas.visiveisEm(CascaComAbas.configuracao).toList();
      expect(guias, hasLength(naBarra.length));

      for (var i = 0; i < naBarra.length; i++) {
        final destino = naBarra[i];
        expect(
          destino.reforcoAcessivel.trim(),
          isNotEmpty,
          reason: 'REPROVA: "${destino.rotulo}" ficou sem `reforcoAcessivel`. '
              'ELE NAO E O TEXTO QUE O CLIENTE REMOVEU em 18/10/2026: aquele '
              'aparecia no CORPO da pagina; este nao aparece em tela nenhuma.',
        );
        expect(
          guias[i].label,
          contains(destino.reforcoAcessivel),
          reason: 'REPROVA: a guia "${destino.rotulo}" anuncia '
              '"${guias[i].label}", sem o reforco acessivel '
              '"${destino.reforcoAcessivel}". O rotulo visivel tem '
              '${destino.rotulo.length} caracteres e o icone nao e anunciado: '
              'sem o reforco, quem usa leitor de tela recebe um sinal onde '
              'quem enxerga recebe dois.',
        );
        // E a outra metade, na mesma volta do laco: a frase do corpo saiu.
        expect(
          destino.reforcoDaPagina,
          isEmpty,
          reason: 'REPROVA: "${destino.rotulo}" voltou a ter frase de apoio '
              'visivel no corpo.',
        );
      }
      handle.dispose();
    });

    testWidgets('as cinco frases removidas nao estao em nenhuma secao',
        (tester) async {
      // Prova por VARREDURA DE TELA, e nao por campo: as frases podiam ter
      // sido reescritas a mao dentro de uma tela, fora do registro, e o
      // `isEmpty` de `reforcoDaPagina` ficaria verde com o texto na tela.
      //
      // Escritas por extenso, exatamente como o cliente as nomeou.
      const List<String> removidas = <String>[
        'Os pets perdidos e os que estão para adoção aqui na sua região.',
        'Os eventos de quem tem pet aqui perto de você.',
        'Os profissionais e estabelecimentos indicados por quem já usou.',
        'Produtos escolhidos pelo Bichu, que abrem no site do parceiro.',
        'Seus pets, sua plaquinha e os ajustes da sua conta.',
      ];

      await abrirOApp(tester, rede: _semServidor);

      // AS SECOES DA BARRA SAO CINCO (uniao de 18/10/2026). `Perfil` saiu do
      // slot e a porta dele e a foto da barra de topo, entao ele nao e
      // alcancavel por `NavigationDestination` -- tocar por rotulo procurava
      // uma aba que nao existe. Ele NAO deixou de ser medido: a conta e
      // visitada pela porta de verdade, depois do laco, e as mesmas cinco
      // frases sao cobradas la.
      for (final destino in CascaComAbas.visiveisEm(CascaComAbas.configuracao)) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();
        for (final frase in removidas) {
          expect(
            find.text(frase),
            findsNothing,
            reason: 'REPROVA: a secao "${destino.rotulo}" mostra "$frase". As '
                'cinco frases sairam em 18/10/2026, nomeadas uma por uma pelo '
                'cliente.',
          );
        }
      }

      // A CONTA NAO E VISITADA AQUI, e nao e lacuna.
      //
      // Depois da fiacao de 18/10/2026 o ultimo slot do laco (`AuAu`) EMPURRA
      // `/mensagens`, uma rota que COBRE a casca: sem barra de topo nao ha
      // foto da conta, que e a unica porta dela, e voltar nao e assunto deste
      // caso. O que importa e que `Perfil` **continua medido**: o caso
      // `cada destino declara um semanticsLabel que comeca pelo rotulo`
      // percorre `CascaComAbas.destinos` INTEIRO -- as cinco da barra mais a
      // conta -- e cobra `reforcoDaPagina` VAZIO em cada um. As cinco frases
      // sairam de `DestinoDeNavegacao`, entao e la que a ausencia se prova,
      // para os seis destinos e nao para os cinco que a barra desenha.
    });

    test('ISCA DE FONTE: `addSemanticIndexes: false` continua em TelaDeAba',
        () {
      // A BICHUS-62 descobriu que o padrao do `ListView` embrulha cada filho
      // num `IndexedSemantics`, e com isso a secao inteira virava UM no
      // anunciado como botao, com o nome sendo a concatenacao de todo o texto
      // da tela. SC 4.1.2 falhando na acao primaria, nas quatro abas -- e
      // agora seriam cinco.
      //
      // Este caso le o FONTE, e nao a arvore: a arvore so acusa no cenario que
      // alguem lembrou de montar, e a remocao do argumento num ramo que
      // nenhum caso percorre passaria calada.
      const caminho = 'lib/telas/casca_com_abas.dart';
      final arquivo = File(caminho);
      expect(
        arquivo.existsSync(),
        isTrue,
        reason: 'REPROVA: nao achei "$caminho". O portao ficaria sem o que '
            'conferir, e portao sem o que conferir reprova com o motivo.',
      );

      // **O comentario NAO conta.** A primeira versao deste caso procurava a
      // string no arquivo inteiro, e o bloco de comentario logo acima do
      // argumento cita `addSemanticIndexes: false` entre crases. Resultado:
      // apagar o ARGUMENTO deixava o caso verde, porque o comentario sozinho
      // satisfazia a busca. Descoberto desligando o mecanismo -- que e a
      // unica forma de descobrir isso.
      final semComentarios = arquivo
          .readAsStringSync()
          .split('\n')
          .map((l) => l.replaceAll(RegExp('//.*'), ''))
          .join('\n');
      expect(
        semComentarios,
        contains('addSemanticIndexes: false'),
        reason: 'REPROVA: `addSemanticIndexes: false` saiu de "$caminho". '
            'Com o padrao do `ListView`, cada filho de `TelaDeAba` volta a ser '
            'embrulhado em `IndexedSemantics` e a secao inteira colapsa num '
            'no so, anunciado como botao, com o nome sendo todo o texto da '
            'tela. E o defeito de acessibilidade que a BICHUS-62 corrigiu.',
      );
    });

    testWidgets('ISCA DE ARVORE: a acao primaria de Meus pets nao colapsa com '
        'o titulo da secao', (tester) async {
      // O caminho exato da descoberta da BICHUS-62: `Perfil` logado, sem pet.
      // Com `addSemanticIndexes` no padrao, a secao virava um unico no de
      // nome "Meus pets Seu primeiro pet entra aqui. ... Cadastrar meu pet".
      final handle = tester.ensureSemantics();
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      // A PORTA MUDOU DE LUGAR EM 19/10: era o slot `Perfil` da barra de
      // baixo, e virou a foto da barra de topo. O destino nao mudou, e e isso
      // que este caso continua provando.
      await irParaAConta(tester);

      final nos = todosOsNos(tester);

      final colapsados = nos
          .where((n) =>
              n.label.contains(MeusPets.titulo) &&
              n.label.contains('Cadastrar meu pet'))
          .map((n) => n.label)
          .toList();
      expect(
        colapsados,
        isEmpty,
        reason: 'REPROVA: o titulo da secao e a acao primaria estao no MESMO '
            'no de semantica:\n  ${colapsados.join('\n  ')}\n'
            'Quem usa TalkBack ou VoiceOver nao tem como parar no botao: ele '
            'deixou de existir como controle separado (WCAG 2.1 SC 4.1.2). '
            'A causa e o `IndexedSemantics` que o `ListView` poe em cada '
            'filho quando `addSemanticIndexes` volta ao padrao.',
      );

      final acao = nos.where((n) => n.label == 'Cadastrar meu pet').toList();
      expect(
        acao,
        isNotEmpty,
        reason: 'REPROVA: nao ha nenhum no de semantica cujo nome seja '
            'exatamente "Cadastrar meu pet". Ou a acao sumiu, ou ela foi '
            'absorvida por um no maior -- e sem este caso a suite ficaria '
            'verde nos dois.',
      );
      handle.dispose();
    });
  });

  // -------------------------------------------------------------------------
  group('25.7.3 — casca nao vira entrega', () {
    test('nenhuma secao `planejada` produz destino visivel no build de entrega',
        () {
      // ESTE CASO MUDOU DE PROPOSITO EM 23/09/2026, e a versao anterior dele
      // previu exatamente isto por escrito: "ou todas ganharam conteudo real
      // -- e ai este caso precisa mudar de proposito".
      //
      // Foi o que aconteceu. A `Rede` era a ULTIMA secao `planejada` do
      // registro, e o ADR-0025 lhe deu tabela, rota e tela. Nao ha mais
      // nenhuma.
      //
      // A guarda antiga exigia que existisse ao menos uma secao `planejada`,
      // para o portao nao ficar verde por nao ter o que filtrar. Ela nao pode
      // continuar: hoje ela reprovaria o estado CORRETO do produto.
      //
      // O que entra no lugar NAO e apagar a guarda. E provar o filtro com uma
      // lista propria, contendo uma secao `planejada` de mentira. Assim o caso
      // continua exercendo `visiveisEm` de verdade -- a funcao de producao, e
      // nao uma copia do predicado -- mesmo com o registro real sem nenhuma.
      const planejadaDeMentira = DestinoDeNavegacao(
        rotulo: 'Isca',
        reforcoAcessivel: 'secao de mentira, so deste caso',
        reforcoDaPagina: 'Existe para provar que o filtro de entrega filtra.',
        icone: Icons.science_outlined,
        iconeSelecionado: Icons.science,
        rota: '/isca-que-nao-existe',
        estado: EstadoDaSecao.planejada,
        campoSemantico: CampoSemantico.comunidade,
      );
      final comUmaPlanejada = <DestinoDeNavegacao>[
        ...CascaComAbas.destinos,
        planejadaDeMentira,
      ];

      final filtrados = CascaComAbas.visiveisEm(
        ConfiguracaoDeBuild.entrega,
        entre: comUmaPlanejada,
      ).map((d) => d.rotulo).toList();
      expect(
        filtrados,
        isNot(contains('Isca')),
        reason: 'REPROVA: `visiveisEm` devolveu uma secao `planejada` no build '
            'de entrega. O filtro parou de filtrar, e com o registro real sem '
            'nenhuma secao planejada isso passaria despercebido ate o dia em '
            'que a proxima secao nascesse.',
      );
      expect(
        CascaComAbas.visiveisEm(
          ConfiguracaoDeBuild.referencia,
          entre: comUmaPlanejada,
        ).map((d) => d.rotulo).toList(),
        contains('Isca'),
        reason: 'REPROVA: o build de REFERENCIA precisa mostrar a secao '
            'planejada. Se ele tambem a esconde, o filtro deixou de distinguir '
            'as duas configuracoes e o caso acima passaria por motivo errado.',
      );

      // E o fato novo, afirmado por extenso para que perde-lo REPROVE: todas
      // as cinco secoes do registro tem conteudo.
      final aindaPlanejadas = CascaComAbas.destinos
          .where((d) => d.estado == EstadoDaSecao.planejada)
          .map((d) => d.rotulo)
          .toList();
      expect(
        aindaPlanejadas,
        isEmpty,
        reason: 'REPROVA: ${aindaPlanejadas.join(', ')} voltou(aram) a '
            '`planejada`. Se uma secao perdeu o conteudo, o caso de cima ja '
            'garante que ela nao vaza para a barra de entrega -- mas o '
            'registro precisa dizer isso em voz alta, e nao por omissao.',
      );

      final vazaram = CascaComAbas.visiveisEm(ConfiguracaoDeBuild.entrega)
          .where((d) => d.estado == EstadoDaSecao.planejada)
          .map((d) => d.rotulo)
          .toList();
      expect(
        vazaram,
        isEmpty,
        reason: 'REPROVA: ${vazaram.join(', ')} aparece(m) na barra do build '
            'de entrega mesmo em estado `planejada`. Num build de loja isso e '
            'a reclamacao de 19/09 ("esta tudo muito vazio") multiplicada '
            'pelo numero de secoes vazias.',
      );
    });

    test('o build de referencia mostra tudo, inclusive o que e `planejada`',
        () {
      // Portao que reprova tudo some do CI igual a portao que aprova tudo. O
      // cliente pediu para ver o escopo inteiro, e 25.7.3 permite isso
      // exatamente neste build.
      // Conta contra os destinos que estao NA BARRA, e nao contra o registro
      // inteiro: desde 19/10 a conta esta no registro e fora da barra, e
      // `visiveisEm` tira ela nas duas configuracoes de build -- porque sair
      // da barra foi decisao de produto, nao de compilacao.
      expect(
        CascaComAbas.visiveisEm(ConfiguracaoDeBuild.referencia),
        hasLength(CascaComAbas.destinos.where((d) => d.naBarra).length),
      );
    });

    testWidgets('toda secao sem conteudo NOMEIA o que vai existir e diz que '
        'ainda nao existe', (tester) async {
      // O criterio 3. E tambem a lição da BICHUS-62: estado vazio que MENTE
      // ("nenhum pet cadastrado ainda" numa tela que nao sabe listar pet) e
      // pior que estado vazio nenhum.
      await abrirOApp(tester, rede: _semServidor);

      for (final destino in CascaComAbas.destinos
          .where((d) => d.estado == EstadoDaSecao.planejada)) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        expect(
          find.text('${destino.rotulo} está em construção'),
          findsOneWidget,
          reason: 'REPROVA: a secao "${destino.rotulo}" nao diz que ainda nao '
              'existe. Destino visivel que leva a lugar nenhum sem dizer o '
              'que e aquilo e defeito (UX 25.7.3).',
        );
        // **A LINHA DE REFORCO SAIU DAQUI EM 18/10/2026.** Este caso cobrava
        // a presenca dela no corpo (`findsOneWidget`) e a ausencia dela na
        // barra de topo; o cliente removeu as cinco frases nominalmente, e o
        // que resta a cobrar e que nenhuma volte. O laco e o mesmo e o caso
        // nao foi apagado.
        expect(
          destino.reforcoDaPagina,
          isEmpty,
          reason: 'REPROVA: a secao planejada "${destino.rotulo}" voltou a '
              'declarar linha de apoio. As cinco sairam em 18/10/2026.',
        );
        // O que esta secao PRECISA dizer continua cobrado pelo `expect` de
        // "esta em construcao" acima: o estado vazio que nomeia o que vai
        // existir e a licao da BICHUS-62, e ele nao dependia da frase de apoio.
        expect(
          find.widgetWithText(AppBar, destino.rotulo),
          findsOneWidget,
          reason: 'REPROVA: o titulo da barra de topo de "${destino.rotulo}" '
              'nao e o nome curto da secao (UX 25.7.2).',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  group('sair da conta', () {
    testWidgets('ISCA: o destino de quem sai e a PAGINA DE LOGIN, e mais nada',
        (tester) async {
      // Decisao do cliente em 21/09, literal: "ele vai para a pagina de
      // login". Esta isca existe porque a linha ficou sem dono por um tempo --
      // esta historia apontava para a BICHUS-81 e a BICHUS-81 nao podia tocar
      // neste arquivo -- e durante esse tempo o destino era `Pets`, que
      // **passava** em qualquer teste que so conferisse "saiu da conta".
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      // A PORTA MUDOU DE LUGAR EM 19/10: era o slot `Perfil` da barra de
      // baixo, e virou a foto da barra de topo. O destino nao mudou, e e isso
      // que este caso continua provando.
      await irParaAConta(tester);

      // `Sair da conta` virou item de menu em 18/10/2026, pelo mesmo pedido do
      // cliente. A folha de confirmacao abaixo nao mudou uma linha, e e ela
      // que este caso mede.
      final sair = find.widgetWithText(ItemDeMenu, 'Sair da conta');
      await rolarAte(tester, sair);
      await tester.tap(sair);
      await tester.pumpAndSettle();

      // A folha avisa o que muda antes de confirmar.
      await tester.tap(find.widgetWithText(FilledButton, 'Sair'));
      await tester.pumpAndSettle();

      final onde = GoRouter.of(tester.element(find.byType(Scaffold).first))
          .routerDelegate
          .currentConfiguration
          .uri
          .path;
      expect(
        onde,
        Rotas.entrar,
        reason: 'REPROVA: sair da conta parou em "$onde". O cliente decidiu '
            'em 21/09 que o destino e a pagina de login (${Rotas.entrar}), e '
            'nao a secao de aterrissagem nem a antiga `Inicio`.',
      );
      expect(
        find.widgetWithText(AppBar, 'Entrar'),
        findsOneWidget,
        reason: 'REPROVA: a rota e a de login e a tela nao e. Endereco certo '
            'com tela errada passa numa asserção que so olha a URL.',
      );
      expect(
        find.byType(NavigationBar),
        findsNothing,
        reason: 'REPROVA: a casca de abas logada continua na tela por tras do '
            'login. `go` precisa substituir a pilha; com `push` a tela da '
            'conta anterior fica desempilhavel.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('portao de tokens sobre os arquivos desta historia', () {
    /// Os arquivos que a BICHUS-164 escreveu.
    ///
    /// Lista explicita: um portao que varresse `lib/` inteiro reprovaria por
    /// codigo que nao e desta historia (o leitor de QR pinta o preto e o
    /// branco do visor com hex literal, de proposito e desde antes) e seria
    /// desligado na primeira execucao.
    const List<String> meusArquivos = <String>[
      'lib/telas/casca_com_abas.dart',
      'lib/telas/abas.dart',
    ];

    test('nenhum hex literal, nenhum espacamento fora de BichuEspaco', () {
      // **O verificador e o mesmo** do portao da BICHUS-62, importado em vez
      // de copiado. Uma copia aqui teria os autotestes daquele arquivo
      // provando outra funcao que nao esta.
      final achados = <String>[];
      var lidos = 0;

      for (final caminho in meusArquivos) {
        final arquivo = File(caminho);
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: "$caminho" nao existe. O portao ficaria sem o que '
              'conferir, e portao que nao acha o que verificar reprova com o '
              'motivo, nunca aprova por ausencia.',
        );
        lidos += 1;
        for (final a in conferir(caminho, arquivo.readAsStringSync())) {
          achados.add('  ${a.onde}:${a.linha} — ${a.motivo}: ${a.trecho}');
        }
      }

      expect(lidos, meusArquivos.length);
      expect(
        achados,
        isEmpty,
        reason: 'REPROVA: cor, espacamento ou raio escrito a mao nos arquivos '
            'da BICHUS-164.\n${achados.join('\n')}\n'
            'A cor da marca e o Carmim #9E0B3A e ela entra SEMPRE por token, '
            'pelo tema. O filete de 1px do topo da barra tambem: ele e '
            '`cores.outline` com `BichuBorda.hairline`, nunca um hex.',
      );
    });

    test('AUTOTESTE: o verificador importado continua reprovando', () {
      // Sem este caso, o dia em que a importacao passasse a apontar para uma
      // funcao vazia deixaria o portao acima verde por nao achar nada.
      final achados = conferir('fixture', '''
        final barra = const Color(0xFF9E0B3A);
        const EdgeInsets.all(15);
      ''');
      final motivos = achados.map((a) => a.motivo).toSet();
      expect(motivos, contains('hex literal em Dart'));
      expect(motivos, contains('espacamento fora de BichuEspaco'));
    });
  });

  // -------------------------------------------------------------------------
  group('criterio 2 — nenhum toque termina sem resposta', () {
    testWidgets('AS DUAS PORTAS DE `Adoções` SAIRAM, e nenhuma delas voltou',
        (tester) async {
      // **O QUE ESTE CASO PROVAVA, E O QUE ELE PROVA AGORA.**
      //
      // Ele provava que as duas portas de `Adoções` NAVEGAVAM: a de `Pets` e
      // a das ONGs em `Perto`, as duas chegando a mesma tela, sem duplicar
      // listagem (criterio 6). O defeito que ele guardava era acao sem
      // destino -- as duas `Ver meus pets` que nao levavam a lugar nenhum.
      //
      // **As duas portas sairam em 19/10.** Nao existe rota de adocao no
      // contrato -- confirmado por duas leituras independentes --, e a tela do
      // outro lado dizia estar em construcao: a porta prometia o que o
      // produto nao tem, e o cliente mandou fechar esse defeito.
      //
      // O caso nao foi apagado: ele passou a assever a AUSENCIA das duas.
      // Sem essa afirmacao, repor qualquer uma devolveria ao produto um toque
      // que abre uma tela em construcao, e nenhum caso acusaria. O contrapeso
      // -- que a ROTA continua registrada, para link profundo nao quebrar --
      // vive em `portas_de_adocoes_test.dart`, junto do resto desta decisao.
      await abrirOApp(tester, rede: _semServidor);
      // A ABA DE ARRANQUE E `Rede` DESDE 18/10/2026, e as portas de sub-destino
      // deste caso saem de `Pets` e de `Perto`.
      await abrirAAba(tester, 'Pets');

      expect(
        find.text('Adoções'),
        findsNothing,
        reason: 'REPROVA: a porta de `Adoções` voltou a `Pets`. Ela abre uma '
            'tela que diz estar em construcao, e a rota dela nao existe no '
            'contrato.',
      );

      await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
      await tester.pumpAndSettle();
      expect(
        find.text('Pets de ONGs para adoção'),
        findsNothing,
        reason: 'REPROVA: a porta das ONGs voltou ao rodape do `Perto`. Ela '
            'levava a mesma tela em construcao que a de `Pets`.',
      );
    });

    testWidgets('`Adoções` NAO e aba, e continua sendo destino', (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      expect(
        find.widgetWithText(NavigationDestination, 'Adoções'),
        findsNothing,
        reason: 'REPROVA: `Adoções` virou aba. Ela pede 78,83 dp num slot de '
            '64,0, e o lugar dela e dentro de `Pets` (UX 27.2.4).',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a 200% de escala de fonte', () {
    // As secoes que tem RAMO: sao as que um toque na barra abre. O slot de
    // mensagens empurra uma rota que ainda nao existe, e a conta saiu da
    // barra -- as duas tem caso proprio abaixo.
    for (final destino in destinosDaBarra.where((d) => d.ehRamo)) {
      testWidgets('a secao ${destino.rotulo} abre a 200% sem estourar',
          (tester) async {
        tester.view.physicalSize = const Size(960, 2000);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);

        await abrirOApp(tester, rede: _semServidor, escala: 2);
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();

        expect(
          tester.takeException(),
          isNull,
          reason: 'REPROVA: a secao ${destino.rotulo} estourou o leiaute a '
              '200% em 320 dp. Nenhum container de texto pode ter altura '
              'fixa: a tela cresce e rola.',
        );
        expect(
          find.widgetWithText(AppBar, destino.rotulo),
          findsOneWidget,
        );
      });
    }

    // A TELA DA CONTA a 200%, alcancada pela porta de hoje.
    //
    // Ela tinha caso neste grupo quando era aba (`a secao Perfil abre a 200%`)
    // e o caso **nao foi apagado**: ele mudou de porta e passou a cobrar o
    // titulo que o cliente pediu em 19/10 -- o nome da pessoa, e nao a palavra
    // `Perfil`.
    testWidgets('a tela da conta abre a 200% sem estourar, pela foto',
        (tester) async {
      tester.view.physicalSize = const Size(960, 2000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
        escala: 2,
      );
      await irParaAConta(tester);

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a tela da conta estourou o leiaute a 200% em 320 '
            'dp. Nenhum container de texto pode ter altura fixa: a tela '
            'cresce e rola.',
      );
      expect(
        find.byType(MeusPets),
        findsOneWidget,
        reason: 'REPROVA: a tela da conta abriu a 200% sem o bloco '
            '`Meus pets`. Os cartoes dele sao o unico caminho ate a pagina '
            'do pet, onde moram o QR e `Marcar como perdido`.',
      );
    });
  });
}
