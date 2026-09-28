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
const List<String> ordemDecidida = <String>[
  'Pets',
  'Rede',
  'Perto',
  'Loja',
  'Perfil',
];

/// A tabela de 27.2.1 da UX, em dp, no clamp de 1,3x que o componente aplica.
///
/// **Isto e o criterio 8 deixando de ser processo.** "Segue o que a ARIADNE
/// entregou" nao reprova nada; a medida dela, conferida contra o render,
/// reprova. Se o tema mudar de fonte, de tamanho ou de peso, os numeros saem
/// destas casas e o caso acusa qual rotulo mudou e em quanto -- em vez de a
/// divergencia aparecer meses depois num aparelho de 320 dp.
const Map<String, double> larguraMedidaPelaUx = <String, double>{
  'Pets': 39.20,
  'Rede': 45.08,
  'Perto': 47.95,
  'Loja': 37.15,
  'Perfil': 47.47,
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
    test('sao exatamente cinco, e a ordem e esta', () {
      expect(
        CascaComAbas.destinos.map((d) => d.rotulo).toList(),
        ordemDecidida,
        reason: 'REPROVA: a barra deixou de ser `${ordemDecidida.join(' · ')}`. '
            'A composicao foi decidida pelo cliente em 21/09 e medida pela UX '
            'em 27.2; mudar rotulo ou ordem aqui exige remedir contra o slot '
            'de 64,0 dp em 320 dp.',
      );
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

      for (final destino in CascaComAbas.destinos) {
        await tester.tap(
          find.widgetWithText(NavigationDestination, destino.rotulo),
        );
        await tester.pumpAndSettle();
        expect(
          find.widgetWithText(AppBar, destino.rotulo),
          findsOneWidget,
          reason: 'REPROVA: tocar em "${destino.rotulo}" nao abriu a secao '
              '"${destino.rotulo}". A ordem dos ramos de `StatefulShellRoute` '
              'precisa ser a ordem de `CascaComAbas.destinos`.',
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
        final rotulos =
            CascaComAbas.destinos.map((d) => d.rotulo).toList(growable: false);
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
          CascaComAbas.destinos.map((d) => d.rotulo).toList(growable: false);

      // A guarda: a tabela e o registro precisam falar dos MESMOS rotulos. Um
      // rotulo novo sem linha na tabela passaria sem ser medido, e uma linha
      // orfa manteria o caso verde medindo algo que nao esta mais na barra.
      expect(
        larguraMedidaPelaUx.keys.toSet(),
        rotulos.toSet(),
        reason: 'REPROVA: a tabela de 27.2.1 e o registro divergem. Rotulo '
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
      final gatilho = find.byTooltip('Abrir os atalhos das seções');
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
  group('o leitor de QR tem duas portas e um leitor so', () {
    testWidgets('a porta PRIMARIA, em Pets, chega ao leitor', (tester) async {
      await abrirOApp(tester, rede: _semServidor);

      expect(
        find.widgetWithText(NavigationDestination, 'Pets'),
        findsOneWidget,
      );

      // A porta e conferida ANTES do toque. Um `tap` direto tambem reprova
      // quando ela some, mas com "could not find any matching widgets", que
      // nao diz a quem ler o que quebrou nem por que importa.
      final porta = find.widgetWithText(OutlinedButton, 'Escanear uma tag');
      expect(
        porta,
        findsOneWidget,
        reason: 'REPROVA: a porta primaria do leitor sumiu de `Pets`. '
            '`Escanear` deixou de ser aba nesta historia, e se a porta nao '
            'existir o caminho mais critico do produto -- quem achou um '
            'cachorro na rua -- fica inalcancavel. Se apenas uma porta for '
            'construida, ela tem de ser esta (UX 27.5.6).',
      );
      await tester.tap(porta);
      await tester.pumpAndSettle();

      expect(
        find.byType(TelaLeitorDeQr),
        findsOneWidget,
        reason: 'REPROVA: a porta primaria de `Pets` existe mas nao abre o '
            'leitor. '
            '`Escanear` deixou de ser aba nesta historia, e se a porta nao '
            'existir o caminho mais critico do produto -- quem achou um '
            'cachorro na rua -- fica inalcancavel. Se apenas uma porta for '
            'construida, ela tem de ser esta (UX 27.5.6).',
      );
    });

    testWidgets('a porta de CONTA, em Perfil, chega ao mesmo leitor',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _semServidor,
        deposito: depositoLogado(),
      );
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      await rolarAte(tester, find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
      await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
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
        expect(
          destino.reforcoDaPagina,
          isNotEmpty,
          reason: 'REPROVA: "${destino.rotulo}" nao tem linha de reforco de '
              'pagina. Ela e a outra metade da decisao do cliente (UX 27.4.2).',
        );
      }
    });

    testWidgets('na arvore, cada aba anuncia nome, papel de guia e selecao',
        (tester) async {
      final handle = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);

      final guias = todosOsNos(tester)
          .where((n) => n.getSemanticsData().role == SemanticsRole.tab)
          .toList();
      expect(
        guias,
        hasLength(CascaComAbas.destinos.length),
        reason: 'REPROVA: achei ${guias.length} guias na arvore e o registro '
            'tem ${CascaComAbas.destinos.length}.',
      );

      for (var i = 0; i < CascaComAbas.destinos.length; i++) {
        final destino = CascaComAbas.destinos[i];
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
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

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
      expect(
        CascaComAbas.visiveisEm(ConfiguracaoDeBuild.referencia),
        hasLength(CascaComAbas.destinos.length),
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
        expect(
          find.text(destino.reforcoDaPagina),
          findsOneWidget,
          reason: 'REPROVA: a secao "${destino.rotulo}" nao traz a linha de '
              'reforco no CORPO. Ela nao cabe na barra de topo (medido em '
              '27.4.1: 240,0 dp disponiveis contra 406,72 pedidos), e sem ela '
              'o rotulo de quatro letras nao explica nada.',
        );
        // O reforco vai no corpo, e **nao** no titulo: quem o puser no topo
        // constroi uma tela que nao existe no aparelho.
        expect(
          find.widgetWithText(AppBar, destino.reforcoDaPagina),
          findsNothing,
          reason: 'REPROVA: a linha de reforco de "${destino.rotulo}" foi '
              'parar na barra de topo, onde ela e cortada com reticencia. Um '
              'significado que some com reticencia nao foi transferido para '
              'lugar nenhum (UX 27.4.1).',
        );
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
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
      await tester.pumpAndSettle();

      final sair = find.widgetWithText(OutlinedButton, 'Sair da conta');
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
    testWidgets('as portas de sub-destino de Pets e de Perto navegam',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor);

      // `Adoções` e sub-destino de `Pets`, com porta propria.
      await tester.tap(find.text('Adoções'));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppBar, 'Adoções'),
        findsOneWidget,
        reason: 'REPROVA: a porta de `Adoções` em `Pets` nao abriu destino '
            'nenhum. Era o defeito das duas acoes `Ver meus pets` sem '
            'destino, de novo.',
      );
      expect(
        find.text('A lista de adoções está em construção'),
        findsOneWidget,
        reason: 'REPROVA: `Adoções` abriu uma tela que nao diz o que vai '
            'existir ali.',
      );

      // Volta e vai pela porta das ONGs, em `Perto`. Ela leva ao MESMO
      // destino: pre-filtrado, sem duplicar listagem (criterio 6).
      // `tester.pageBack()` procura o botao pelo tooltip em ingles, e este
      // app declara `pt-BR`: o tooltip e `Voltar`. Usar `pageBack` aqui
      // reprovaria por um motivo que nao e o do caso.
      await tester.tap(find.byTooltip('Voltar'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(NavigationDestination, 'Perto'));
      await tester.pumpAndSettle();

      final portaDasOngs = find.text('Pets de ONGs para adoção');
      expect(
        portaDasOngs,
        findsOneWidget,
        reason: 'REPROVA: `Perto` nao tem a porta das ONGs. O criterio 6 pede '
            'que ela exista ali e leve a `Pets` pre-filtrado em adocao.',
      );
      await tester.tap(portaDasOngs);
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppBar, 'Adoções'),
        findsOneWidget,
        reason: 'REPROVA: a porta das ONGs nao leva a `Adoções`. Se ela '
            'abrisse uma listagem propria, seriam duas listas da mesma coisa.',
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
    for (final destino in CascaComAbas.destinos) {
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
  });
}
