// O CUPOM DA LOJA MAIS CHAMATIVO -- VARIACAO A (cliente, 29/10/2026).
//
// Ele pediu *"deixe o cupom de desconto bichu, na pagina da loja, mais
// chamativo"*, o desenho saiu em `design/prototipos/cupom-da-loja/` (protocolo
// HTML no lugar do Figma, por autorizacao dele de 23/09) e **ele escolheu a
// variacao A**: o bloco NAO muda de lugar e NAO ganha moldura; muda so o par
// rotulo+codigo -- o rotulo vira `overline` e o codigo vira `title` dentro de
// uma pilula de `primaryContainer` com o icone de cupom.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO MEDE ALTURA, E POR QUE EM DP DO WIDGET
// ---------------------------------------------------------------------------
// **A dobra da Loja pertence aos produtos**, e foi esse o argumento que elegeu
// a A sobre a B (+28 dp) e a B2 (+61 dp). Em 22/10 a primeira versao do bloco
// custava ~145 dp e `loja_carrossel_nao_sai_test` reprovou tocando num titulo
// que ja nao estava alcancavel: cada dp gasto aqui empurra produto para baixo
// da dobra, e o orcamento que ele aprovou e de **+16 dp**.
//
// **As alturas do prototipo sao px de NAVEGADOR tratados como dp**, e a propria
// frente que o desenhou escreveu que "as tres variacoes precisam ser remedidas
// no widget montado", porque a metrica do Inter no Chrome nao e a do Flutter.
// Entao o numero que vale e o medido AQUI, na arvore montada, e nao o 88 do
// prototipo. O teto deste arquivo ([_tetoDoBlocoEmDp]) e o orcamento, nao a
// medicao.
//
// ---------------------------------------------------------------------------
// A FONTE SINTETICA, E ELA JA MENTIU NESTA FRENTE
// ---------------------------------------------------------------------------
// **Sem carregar a `Inter` de verdade todo numero daqui sai errado, e para
// cima.** O ambiente de teste do Flutter usa uma fonte de largura uniforme, em
// que cada glifo mede o tamanho da fonte: a frase do convite quebra em QUATRO
// linhas em vez de duas, e a primeira passada desta medicao registrou **108 dp
// a 375 dp** para o bloco de HOJE -- 36 dp a mais que a verdade, e um numero
// que teria feito a variacao A parecer estourar o orcamento antes de uma linha
// de produto mudar. Com a `Inter` real o mesmo bloco mede 72 dp, que e o que o
// prototipo media no navegador.
//
// [_carregarAInter] e [_conferirQueAFonteEReal] existem por causa disso, e o
// segundo e obrigatorio: um `FontLoader` que falhasse calado devolveria a
// bancada a fonte sintetica, e os numeros voltariam a subir sozinhos. A forma
// e a de `telas/casca_de_cinco_secoes_test.dart`, que perdeu uma passada de UX
// inteira exatamente por medir a fonte sintetica (UX 27.1).
//
// **A medicao e a DISTANCIA do topo da frase ao topo do primeiro cartao**, e
// nao a altura de um `RenderBox` escolhido a dedo. O motivo e estrutural: no
// `build` da vitrine o convite e o `Padding` imediatamente anterior ao corpo,
// e o corpo comeca no primeiro `CartaoDaLoja` sem espacador antes dele (o
// `SizedBox` do `for` so entra em `i > 0`). Essa distancia e, por construcao,
// o custo INTEIRO do bloco -- frase, vao, par do cupom e o recuo de baixo --,
// que e exatamente o que a dobra paga.
//
// Os casos ISCA dizem, no corpo, o que apagar para eles reprovarem.

import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/telas/loja/vitrine_da_loja.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';

import 'ajuda_de_tela.dart';
import 'loja_com_dados_test.dart'
    show itemDoContrato, paginaDoContrato, redeDaVitrine;

/// O ORCAMENTO que ele aprovou, em dp, nas larguras de 375 e 412.
///
/// Hoje o bloco custa 72 dp de protipo (e o medido na arvore esta no artefato
/// desta frente); a variacao A cresce **+16 dp**. Este teto NAO e a medicao: e
/// a linha que a medicao nao pode passar. Se uma mudanca futura precisar de
/// mais, o lugar de discutir e com o cliente -- a dobra e dos produtos.
const double _tetoDoBlocoEmDp = 88.0;

/// A largura em que ele ve o aparelho dele, e as duas vizinhas do protipo.
const double _larguraGrande = 412.0;
const double _larguraMedia = 375.0;
const double _larguraEstreita = 320.0;

/// O NO DO CODIGO, e **`find.text` NAO serve para ele**.
///
/// `SelectableText` constroi um `EditableText` por dentro, e `find.text` casa
/// com esse filho: `tester.widget<SelectableText>(find.text(...))` estoura com
/// `type 'EditableText' is not a subtype of type 'SelectableText'`. Custou uma
/// passada inteira desta frente -- os oito casos reprovaram pelo `_TypeError`
/// e nao pelo que eles cobram, que e a forma de uma isca parecer provada sem
/// ter medido nada.
Finder get _oCodigo => find.byWidgetPredicate(
      (Widget w) => w is SelectableText && w.data == VitrineDaLoja.codigoDoCupom,
      description: 'o `SelectableText` do codigo do cupom',
    );

/// O NO DO ROTULO, casado SEM distincao de caixa.
///
/// Casar sem caixa e de proposito: assim o mesmo finder serve antes e depois da
/// variacao A, e o que decide a aprovacao e o `expect` da caixa alta -- e nao
/// um finder que simplesmente deixa de achar o no e faz o caso reprovar por
/// "nao esta na tela", escondendo o que mudou.
Finder get _oRotulo => find.byWidgetPredicate(
      (Widget w) =>
          w is Text &&
          (w.data ?? '').toUpperCase() ==
              VitrineDaLoja.rotuloDoCupom.toUpperCase(),
      description: 'o `Text` do rotulo do cupom, em qualquer caixa',
    );

/// Carrega a `Inter` de verdade, dos arquivos de `assets/fonts/`.
///
/// Sao os quatro pesos embarcados porque o bloco usa tres: 400 na frase, 700 no
/// rotulo `overline` e 600 no codigo `title`. Carregar so o regular deixaria o
/// rotulo e o codigo medindo a fonte sintetica, que e metade do defeito.
Future<void> _carregarAInter() async {
  const List<String> arquivos = <String>[
    'Inter-Regular.ttf',
    'Inter-Medium.ttf',
    'Inter-SemiBold.ttf',
    'Inter-Bold.ttf',
  ];
  final FontLoader carregador = FontLoader('Inter');
  for (final String nome in arquivos) {
    final File arquivo = File('assets/fonts/$nome');
    // Verificacao que nao consegue verificar REPROVA. Um `if (existe)` calado
    // aqui devolveria este arquivo inteiro a fonte sintetica, e ele registraria
    // numeros falsos com cara de medicao -- que e pior do que nao medir.
    if (!arquivo.existsSync()) {
      fail(
        'REPROVA: nao achei "assets/fonts/$nome" a partir de '
        '"${Directory.current.path}". Sem a `Inter` real a altura do bloco e '
        'medida contra a fonte sintetica de largura uniforme, que quebra a '
        'frase do convite em quatro linhas em vez de duas.',
      );
    }
    carregador.addFont(
      Future<ByteData>.value(
        ByteData.sublistView(Uint8List.fromList(arquivo.readAsBytesSync())),
      ),
    );
  }
  await carregador.load();
}

/// CONTROLE POSITIVO DA BANCADA: a fonte na arvore e a `Inter`, nao a sintetica.
///
/// A fonte sintetica do ambiente de teste desenha cada glifo com a largura do
/// TAMANHO da fonte, entao `bichu` (cinco glifos) mede ~5x o tamanho. A `Inter`
/// real mede bem menos que isso. Este `expect` e o que separa "o bloco cabe" de
/// "o `FontLoader` nao pegou e eu estou medindo quadrados".
void _conferirQueAFonteEReal(WidgetTester tester, {required double escala}) {
  final SelectableText codigo = tester.widget<SelectableText>(_oCodigo);
  // `TextStyle.fontSize` e o tamanho ANTES da escala do sistema. A `escala`
  // entra aqui de proposito: sem ela este controle reprovava a 200% com a
  // `Inter` real na arvore, porque comparava uma caixa de 200% contra um piso
  // de 100% -- medido nesta frente, e o tipo de controle que reprova o caso
  // certo pelo motivo errado.
  final double tamanho = codigo.style!.fontSize! * escala;
  final double larguraDoCodigo = tester.getRect(_oCodigo).width;
  final int glifos = VitrineDaLoja.codigoDoCupom.length;
  expect(
    larguraDoCodigo,
    lessThan(glifos * tamanho * 0.8),
    reason: 'REPROVA: `${VitrineDaLoja.codigoDoCupom}` mediu '
        '$larguraDoCodigo dp em fonte de $tamanho dp (ja com a escala '
        '$escala), que e largura de FONTE SINTETICA (cada glifo com a largura '
        'do tamanho, ${glifos * tamanho} dp no total). O `FontLoader` da '
        '`Inter` nao pegou, e TODA altura medida neste arquivo esta inflada '
        '-- a primeira passada desta frente registrou 108 dp onde a verdade '
        'era 72.',
  );
}

/// Monta a vitrine na largura e na escala de fonte pedidas.
///
/// A altura e generosa de proposito: este arquivo mede o CUSTO do bloco, e um
/// gabarito curto cortaria o primeiro cartao e a distancia medida passaria a
/// ser a da area visivel, nao a do bloco. Quem mede a dobra e
/// `loja_carrossel_nao_sai_test`, no gabarito padrao.
Future<void> _abrirAVitrine(
  WidgetTester tester, {
  required double largura,
  double? escala,
}) async {
  tester.view.physicalSize = Size(largura * 3, 2400 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await abrirOApp(
    tester,
    rede: redeDaVitrine(
      paginaDoContrato(<Map<String, dynamic>>[itemDoContrato()]),
    ),
    deposito: depositoLogado(),
    escala: escala,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Loja'));
  await tester.pumpAndSettle();
}

/// CONTROLE POSITIVO, e ele vem antes de toda medicao deste arquivo.
///
/// A vitrine tem estado de carregando, de vazio, de vazio filtrado e de falha,
/// e em tres deles nao ha cartao nenhum pintado. Sem estes tres `expect`, um
/// `getTopLeft` lancaria e o caso mediria "a tela nao abriu" em vez do bloco.
void _conferirQueAVitrineEstaMontada(
  WidgetTester tester, {
  double escala = 1.0,
}) {
  expect(
    find.byType(BarraDeListagem),
    findsOneWidget,
    reason: 'REPROVA: a vitrine nao esta montada (nao ha barra de listagem). '
        'Nada medido abaixo falaria do cupom.',
  );
  expect(
    find.text(VitrineDaLoja.conviteDaVitrine),
    findsOneWidget,
    reason: 'REPROVA: a frase do convite (redacao DELE, 22/10/2026) nao esta '
        'na vitrine. Ela e o topo do bloco que este arquivo mede.',
  );
  expect(
    find.byType(CartaoDaLoja),
    findsOneWidget,
    reason: 'REPROVA: nao ha cartao de produto na vitrine. O primeiro cartao e '
        'o fundo do bloco na medicao, e sem ele nao ha distancia para medir.',
  );
  _conferirQueAFonteEReal(tester, escala: escala);
}

/// O custo do bloco do convite, em dp, lido da arvore montada.
double _alturaDoBlocoEmDp(WidgetTester tester) {
  final double topoDaFrase =
      tester.getTopLeft(find.text(VitrineDaLoja.conviteDaVitrine)).dy;
  final double topoDoCartao =
      tester.getTopLeft(find.byType(CartaoDaLoja).first).dy;
  return topoDoCartao - topoDaFrase;
}

void main() {
  // A `Inter` entra UMA vez, antes de tudo. Ver o cabecalho: sem ela a medicao
  // deste arquivo mente, e mente para cima.
  setUpAll(_carregarAInter);

  // -------------------------------------------------------------------------
  // ISCA — a variacao A, e nao a de hoje nem a B
  // -------------------------------------------------------------------------
  group('ISCA — o par do cupom e o da variacao A', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/loja/vitrine_da_loja.dart`,
    // dentro de `_ConviteComCupom`, devolva o rotulo ao estilo de antes --
    // `textos.bodySmall?.copyWith(color: cores.textSecondary)`. Este caso
    // reprova nomeando o tamanho 13 contra o 12 do `overline`, e o controle
    // positivo acima continua passando.
    testWidgets('o rotulo e `overline`: 12/16, peso 700, caixa alta',
        (tester) async {
      await _abrirAVitrine(tester, largura: _larguraGrande);
      _conferirQueAVitrineEstaMontada(tester);

      expect(
        _oRotulo,
        findsOneWidget,
        reason: 'REPROVA: o rotulo do cupom saiu da vitrine.',
      );
      final Text rotulo = tester.widget<Text>(_oRotulo);
      final TextStyle? estilo = rotulo.style;

      expect(
        estilo,
        isNotNull,
        reason: 'REPROVA: o rotulo do cupom nao tem estilo proprio. A variacao '
            'A o quer em `overline`, e herdar o estilo do corpo seria a versao '
            'de antes do desenho.',
      );
      expect(
        estilo!.fontSize,
        BichuEscalaDeTipo.overline.tamanho,
        reason: 'REPROVA: o rotulo do cupom nao esta no tamanho do `overline` '
            '(${BichuEscalaDeTipo.overline.tamanho}). Encontrado: '
            '${estilo.fontSize}. A variacao A compra "mais chamativo" por '
            'TAMANHO, PESO e CHAO -- nunca por cor sozinha (SC 1.4.1).',
      );
      expect(
        estilo.fontWeight,
        FontWeight.w700,
        reason: 'REPROVA: o rotulo do cupom nao esta em peso 700. '
            'Encontrado: ${estilo.fontWeight}.',
      );
      expect(
        estilo.letterSpacing,
        closeTo(BichuEscalaDeTipo.overline.espacejamento, 0.0001),
        reason: 'REPROVA: o espacejamento do rotulo nao e o do `overline` '
            '(+8% de ${BichuEscalaDeTipo.overline.tamanho} dp = '
            '${BichuEscalaDeTipo.overline.espacejamento}). Caixa alta sem '
            'espacejamento fecha as letras e le pior que a minuscula.',
      );
      expect(
        estilo.height,
        closeTo(BichuEscalaDeTipo.overline.altura, 0.0001),
        reason: 'REPROVA: a entrelinha do rotulo nao e a do `overline` '
            '(16/12). Encontrado: ${estilo.height}.',
      );
      // A CAIXA ALTA VEM DE `data`, e **nao ha outro jeito no Flutter**: nao
      // existe `text-transform`, e o `overline` deste sistema de design e
      // definido como "o overline em CAIXA ALTA do selo de estado". A
      // constante NAO muda -- ela continua `'Cupom de desconto'`, e o no a
      // sobe. O rotulo e NOSSO (ver `VitrineDaLoja.rotuloDoCupom`: *"ele deu o
      // codigo, nao a frase que o apresenta"*), diferente da frase do convite,
      // que e dele palavra por palavra e NAO muda de caixa.
      expect(
        rotulo.data,
        VitrineDaLoja.rotuloDoCupom.toUpperCase(),
        reason: 'REPROVA: o no do rotulo nao escreve a constante em caixa '
            'alta. Encontrado: "${rotulo.data}". Esperado: a propria '
            '`VitrineDaLoja.rotuloDoCupom` subida de caixa -- e nunca um '
            'literal reescrito em caixa alta, que faria a constante e a tela '
            'divergirem calados.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: no mesmo bloco, devolva o codigo ao estilo
    // de antes -- `textos.labelLarge?.copyWith(color: cores.textPrimary)`.
    // Este caso reprova nomeando o 16 contra o 18 do `title`.
    testWidgets('o codigo e `title` (18/24, peso 600) e CONTINUA selecionavel',
        (tester) async {
      await _abrirAVitrine(tester, largura: _larguraGrande);
      _conferirQueAVitrineEstaMontada(tester);

      // **`SelectableText` e requisito de FUNCAO, nao de estilo**, e vem
      // primeiro: o codigo existe para ser digitado no site do parceiro, e um
      // cupom que a pessoa nao consegue copiar e um cupom que ela erra. Trocar
      // por `Text` para ganhar estilo seria regressao, e o botao de copiar foi
      // recusado em 22/10.
      expect(
        _oCodigo,
        findsOneWidget,
        reason: 'REPROVA: o codigo `${VitrineDaLoja.codigoDoCupom}` nao esta '
            'na tela como `SelectableText`.',
      );
      final SelectableText no = tester.widget<SelectableText>(_oCodigo);

      final TextStyle? estilo = no.style;
      expect(
        estilo,
        isNotNull,
        reason: 'REPROVA: o codigo do cupom nao tem estilo proprio.',
      );
      expect(
        estilo!.fontSize,
        BichuEscalaDeTipo.title.tamanho,
        reason: 'REPROVA: o codigo do cupom nao esta no tamanho do `title` '
            '(${BichuEscalaDeTipo.title.tamanho}). Encontrado: '
            '${estilo.fontSize}. O 16 e o `labelLg` de antes do desenho.',
      );
      expect(
        estilo.fontWeight,
        FontWeight.w600,
        reason: 'REPROVA: o codigo do cupom nao esta em peso 600. '
            'Encontrado: ${estilo.fontWeight}.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: no mesmo bloco, troque o `Container` da
    // pilula por um `Row` pelado (ou apague o `Icon`). Os dois `expect`
    // reprovam: o icone desaparece e o chao de `primaryContainer` sai.
    testWidgets('o codigo tem CHAO: pilula de `primaryContainer` com o icone',
        (tester) async {
      await _abrirAVitrine(tester, largura: _larguraGrande);
      _conferirQueAVitrineEstaMontada(tester);

      expect(
        find.byIcon(Icons.local_activity),
        findsOneWidget,
        reason: 'REPROVA: o icone de cupom nao esta na tela. Ele e metade do '
            '"chao" da variacao A -- a peca precisa dizer "cupom" pela FORMA, '
            'e nao so pela cor.',
      );

      // A pilula e o `Container` mais interno que embrulha o codigo. Ler a
      // decoracao, e nao um `byType(Container)` solto da tela, e o que faz
      // este `expect` falar da pilula e nao de qualquer caixa da vitrine.
      final Iterable<Container> embrulhos = tester.widgetList<Container>(
        find.ancestor(of: _oCodigo, matching: find.byType(Container)),
      );
      expect(
        embrulhos,
        isNotEmpty,
        reason: 'REPROVA: o codigo do cupom nao esta dentro de nenhum '
            '`Container`. A pilula e o UNICO elemento novo da variacao A, e '
            'sem ela o ganho e de cor sozinha.',
      );

      // A pilula e procurada pela DECORACAO, e nao por posicao na lista de
      // ancestrais: `find.ancestor` nao promete ordem, e `embrulhos.first`
      // mediria "o primeiro `Container` que apareceu" -- que fica verde ou
      // vermelho por motivo que nao e o do desenho.
      final List<BoxDecoration> comChaoDeCupom = <BoxDecoration>[
        for (final Container c in embrulhos)
          if (c.decoration case final BoxDecoration d)
            if (d.color == BichuCores.claro.primaryContainer) d,
      ];
      expect(
        comChaoDeCupom,
        hasLength(1),
        reason: 'REPROVA: o codigo do cupom nao esta sobre UM chao de '
            '`primaryContainer`. Achei ${comChaoDeCupom.length} entre '
            '${embrulhos.length} `Container` ancestrais. O par '
            'codigo/`primaryContainer` e o que foi medido no desenho: 14,98:1 '
            'no claro e 13,09:1 no escuro, e sem ele o ganho e de cor '
            'sozinha.',
      );

      final BoxDecoration pilula = comChaoDeCupom.single;
      expect(
        pilula.borderRadius,
        BorderRadius.circular(BichuRaio.full),
        reason: 'REPROVA: a pilula nao esta com o raio `full`. '
            'Encontrado: ${pilula.borderRadius}.',
      );
      expect(
        pilula.border,
        isNull,
        reason: 'REPROVA: a pilula ganhou BORDA. Borda tracejada e a '
            'variacao B, que ele NAO escolheu -- e ela custa +28 dp contra os '
            '+16 da A.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // O ORCAMENTO DA DOBRA
  // -------------------------------------------------------------------------
  group('o bloco do convite cabe no orcamento da dobra', () {
    // DESLIGAR PARA VER REPROVAR: em `_ConviteComCupom`, troque o
    // `BichuEspaco.e2` do vao e do `runSpacing` por `BichuEspaco.e6`, ou ponha
    // o codigo em `titleLg` com linha propria (que e a variacao B2, recusada).
    // O caso reprova nomeando os dp medidos contra o teto.
    for (final double largura in <double>[_larguraGrande, _larguraMedia]) {
      testWidgets(
        'a $largura dp o bloco nao passa de $_tetoDoBlocoEmDp dp',
        (tester) async {
          await _abrirAVitrine(tester, largura: largura);
          _conferirQueAVitrineEstaMontada(tester);

          final double altura = _alturaDoBlocoEmDp(tester);

          // CONTROLE POSITIVO DA PROPRIA MEDICAO: uma distancia nao-positiva
          // (ou absurdamente pequena) diria que a medicao pegou outro par de
          // nos, e um teto que aprovasse zero aprovaria qualquer coisa.
          expect(
            altura,
            greaterThan(40.0),
            reason: 'REPROVA: a medicao devolveu $altura dp, que e menos do '
                'que a frase sozinha ocupa. A distancia esta sendo tomada '
                'entre os nos errados, e o teto abaixo nao mediria o bloco.',
          );

          expect(
            altura,
            lessThanOrEqualTo(_tetoDoBlocoEmDp),
            reason: 'REPROVA: o bloco do convite custa $altura dp a $largura '
                'dp, e o orcamento que o cliente aprovou e de '
                '$_tetoDoBlocoEmDp dp (hoje mais os +16 da variacao A).\n'
                'Cada dp acima disto empurra produto para baixo da dobra, e a '
                'dobra da Loja pertence aos produtos -- foi esse o argumento '
                'que elegeu a A sobre a B e a B2. Em 22/10 um bloco de ~145 '
                'dp reprovou `loja_carrossel_nao_sai_test` tocando num titulo '
                'que ja nao estava alcancavel.\n'
                'Se a peca precisa de mais espaco, a conversa e com o '
                'cliente: o teto nao se sobe para o teste ficar verde.',
          );
        },
      );
    }
  });

  // -------------------------------------------------------------------------
  // A FONTE DO SISTEMA A 200%, que e onde cupom com letra maior dói
  // -------------------------------------------------------------------------
  // O protipo anotou que NAO mediu isso: *"as tres variacoes usam `flex-wrap`
  // [...] mas o estouro a 200% so se mede no widget montado"*. Aqui se mede.
  //
  // **O que se cobra a 200% nao e altura, e sim que a peca nao ESTOURE e que o
  // codigo continue inteiro e selecionavel.** A 200% o par nao cabe numa linha
  // em largura de telefone, e e por isso que ele e um `Wrap`: a pilula desce
  // para a linha de baixo em vez de a `Row` estourar ou o codigo ser cortado
  // por reticencias. Um cupom com reticencias e um cupom que a pessoa digita
  // errado.
  group('a fonte do sistema a 200% nao estoura a peca', () {
    // DESLIGAR PARA VER REPROVAR: em `_ConviteComCupom`, troque o `Wrap` por
    // um `Row` com os mesmos filhos. A 320 dp o caso reprova com o
    // `RenderFlex overflowed` que o `takeException` captura.
    for (final double largura in <double>[
      _larguraGrande,
      _larguraMedia,
      _larguraEstreita,
    ]) {
      testWidgets(
        'a $largura dp e 200% a peca nao estoura e o codigo fica inteiro',
        (tester) async {
          const double escala = 2.0;
          await _abrirAVitrine(tester, largura: largura, escala: escala);
          _conferirQueAVitrineEstaMontada(tester, escala: escala);

          expect(
            tester.takeException(),
            isNull,
            reason: 'REPROVA: montar a vitrine a 200% de escala em $largura dp '
                'levantou excecao. `RenderFlex overflowed` aqui e a peca do '
                'cupom nao caber na linha -- e o lugar do conserto e deixar a '
                'pilula QUEBRAR para a linha de baixo, nunca encolher o '
                'codigo.',
          );

          expect(
            _oCodigo,
            findsOneWidget,
            reason: 'REPROVA: a 200% o codigo do cupom saiu da tela, ou '
                'deixou de ser `SelectableText`.',
          );

          // **O QUE ESTE CASO EXISTE PARA COBRAR: o codigo numa linha so.**
          //
          // Nao basta "nao estourou". O `Row` com `Flexible` de antes NAO
          // estourava a 200% e era pior: medido a 320 dp, ele apertava o
          // codigo num vao de 35 dp e `bichu` saia em QUATRO linhas, uma letra
          // por linha, com 160 dp de caixa. Uma pessoa que le o cupom letra
          // por letra o digita errado no site do parceiro -- e um `expect` de
          // estouro aprovaria isso calado.
          final SelectableText no = tester.widget<SelectableText>(_oCodigo);
          final TextStyle estilo = no.style!;
          final double umaLinha = estilo.fontSize! * estilo.height! * escala;
          final Rect caixa = tester.getRect(_oCodigo);
          expect(
            caixa.height,
            lessThanOrEqualTo(umaLinha * 1.5),
            reason: 'REPROVA: a 200% em $largura dp o codigo do cupom ocupa '
                '${caixa.height} dp de altura, e uma linha mede $umaLinha dp. '
                'Ele quebrou em mais de uma linha: o conserto e deixar a '
                'PILULA INTEIRA descer para a linha de baixo (`Wrap`), e '
                'nunca apertar o codigo.',
          );

          // E a peca nao pode vazar pela direita: o codigo precisa estar
          // INTEIRO dentro da largura da tela para ser lido e copiado.
          expect(
            caixa.right,
            lessThanOrEqualTo(largura + 0.5),
            reason: 'REPROVA: a 200% o codigo do cupom vaza pela direita em '
                '$largura dp (direita = ${caixa.right}).',
          );
        },
      );
    }
  });
}
