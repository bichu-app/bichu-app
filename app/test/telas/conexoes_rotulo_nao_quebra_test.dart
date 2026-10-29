// PEDIDO DO CLIENTE DE 29/10/2026, literal: *"na pagina de conexoes, os
// textos pendentes e bloqueados esta quebrando a linha, precisamos corrigir
// isso."*
//
// =========================================================================
// O QUE ESTAVA QUEBRADO, MEDIDO E NAO SUPOSTO
// =========================================================================
//
// A `TabBar` de `telas/conexoes/tela_de_conexoes.dart` tinha tres abas e
// **nao era rolavel**, entao cada uma recebia um terco exato da largura, menos
// os 32 dp de `kTabLabelPadding` (16 de cada lado). Medido nesta arvore com a
// **`Inter` de verdade carregada** (ver [_carregarInter] -- sem ela o teste
// mede a fonte quadrada do `flutter_test`, que mente por exagero: 180,00 dp
// para `Bloqueados` em vez de 103,03):
//
//   | rotulo | largura que o texto pede |
//   |---|---|
//   | `Conexões`  |  86,85 dp |
//   | `Pendentes` + a pastilha do contador | 120,73 dp |
//   | `Bloqueados` | 103,03 dp |
//
// A largura que cada aba RECEBIA e `largura/3 - 32`:
//
//   | tela | por aba | `Conexões` | `Pendentes` | `Bloqueados` |
//   |---|---|---|---|---|
//   | 320 dp |  74,67 | QUEBRA | transborda 46 px | QUEBRA |
//   | 360 dp |  88,00 | cabe    | transborda 33 px | QUEBRA |
//   | 390 dp |  98,00 | cabe    | transborda 23 px | QUEBRA |
//   | 412 dp | 105,33 | cabe    | transborda 15 px | cabe   |
//
// Daí os dois defeitos, que tem a MESMA causa e sintomas diferentes:
//
//   1. **`Bloqueados` quebrava em duas linhas abaixo de 405,1 dp** -- isto e,
//      em praticamente todo telefone -- e `Conexões` abaixo de 356,6 dp. E o
//      que o cliente viu e descreveu;
//   2. **`Pendentes` nao quebrava: TRANSBORDAVA.** O rotulo mora numa `Row`
//      com a pastilha do contador (`_RotuloComContador`), e `Row` da largura
//      infinita ao filho no eixo principal -- o texto nunca quebra, a `Row`
//      estoura para a direita e o Flutter acusa `RenderFlex overflowed`. So
//      desaparecia acima de 458,2 dp. A pastilha era o que saia da tela.
//
// O rotulo mais largo nao e por acaso o mais critico: a prosa de
// `tela_de_conexoes.dart` registra que **a aba `Bloqueados` e o unico lugar de
// onde o desbloqueio sai no aplicativo inteiro**.
//
// =========================================================================
// A SAIDA, E POR QUE ESTA E NAO OUTRA
// =========================================================================
//
// **Nenhuma palavra foi encurtada.** `Pendentes` e `Bloqueados` sao palavras
// do produto, e `Bloqueados` em particular e *"a palavra que a pessoa
// procura"* -- a propria prosa da tela explica por que nao e
// `Usuários bloqueados`.
//
// A saida e **`isScrollable: true` + `tabAlignment: TabAlignment.start`**, que
// e **o arranjo que esta casa ja decidiu e ja mediu** para este mesmo defeito
// em `telas/rede/secao_da_rede.dart`: lá, `Comunidade` cortava por 77,24 dp a
// 200% de escala numa barra nao rolavel, e a decisao registrada foi
// *"`isScrollable: true` e o que resolve sem abreviar"*. Cada aba passa a
// receber a largura do PROPRIO texto, em vez de as tres dividirem a tela em
// partes iguais.
//
// Ela resolve os DOIS defeitos de uma vez, e o segundo de graca: com a aba
// dimensionada pelo conteudo, a `Row` de `_RotuloComContador` deixa de receber
// um terco da tela e para de transbordar.
//
// **O custo, medido e nao escondido:** o conteudo natural da barra mede
// 406,61 dp (16 + 86,85 + 32 + 120,73 + 32 + 103,03 + 16), entao abaixo disso
// ela ROLA e a terceira aba aparece cortada -- medido a 320 dp, sobram
// **32,41 dos 103,03 dp** dela. Isso NAO esconde o
// desbloqueio, e por tres razoes que ja estao de pe na tela: `Rotas.
// pessoasBloqueadas` pousa JA na aba 3, o `TabBarView` anda por arrasto, e a
// aba cortada e exatamente o aviso de que ha mais barra. Uma palavra quebrada
// em duas linhas, ao contrario, nao avisa nada.
//
// DESLIGAR PARA VER REPROVAR: em `lib/telas/conexoes/tela_de_conexoes.dart`,
// apague as linhas `isScrollable: true` e `tabAlignment: TabAlignment.start`
// da `TabBar`. `o rotulo da aba nao quebra a linha` volta a acusar
// `Bloqueados` em duas linhas, e `a aba `Pendentes` com a pastilha nao
// transborda` volta a acusar o `RenderFlex`.
library;

import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conexoes_api.dart';
import 'package:bichu/api/seguranca_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/conexoes/tela_de_conexoes.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

const String _urlBase = 'https://api.exemplo.test';

/// As larguras medidas. 320 dp e o piso desta casa; 360 e 390 sao as duas
/// classes de telefone Android mais comuns, e as duas em que `Bloqueados`
/// quebrava.
const List<double> _larguras = <double>[320, 360, 390, 412];

/// **A `Inter` DE VERDADE, e isto nao e zelo.**
///
/// Sem `FontLoader` o `flutter_test` desenha com uma fonte de glifos
/// QUADRADOS (um em de avanco por caractere), e a medicao sai inflada: ela da
/// 180,00 dp para `Bloqueados`, contra 103,03 dp da `Inter` real. Um caso que
/// medisse a fonte falsa reprovaria por um defeito que o telefone nao tem --
/// e, pior, aprovaria um conserto dimensionado para o numero errado.
Future<void> _carregarInter() async {
  final carga = FontLoader('Inter');
  for (final arquivo in const <String>[
    'assets/fonts/Inter-Regular.ttf',
    'assets/fonts/Inter-Medium.ttf',
    'assets/fonts/Inter-SemiBold.ttf',
    'assets/fonts/Inter-Bold.ttf',
  ]) {
    carga.addFont(
      File(arquivo).readAsBytes().then(
            (b) => ByteData.view(Uint8List.fromList(b).buffer),
          ),
    );
  }
  await carga.load();
}

/// O contador que o servidor afirma. **Tem de ser > 0**: a pastilha so existe
/// com numero, e e com ela que `Pendentes` pede os 120,73 dp que transbordavam.
Future<http.Response> _servidor(http.Request req) async {
  final caminho = req.url.path;

  if (caminho == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 2,
      'pending_sent_count': 1,
      'requests_received_count': 3,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 4,
    });
  }
  if (caminho == '/v1/connections' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'total': 0,
      'page': 1,
      'limit': 20,
    });
  }
  if (caminho == '/v1/connections/requests' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'total': 0,
      'page': 1,
      'limit': 20,
    });
  }
  if (caminho == '/v1/me/blocks' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[],
      'total': 0,
      'page': 1,
    });
  }
  return problema('not-found', 404);
}

/// Fixa a janela em [largura] x 640 com `devicePixelRatio` 1, para `320`
/// querer dizer 320 **dp** e nao 320 pixels fisicos.
void _janela(WidgetTester tester, double largura) {
  tester.view.physicalSize = Size(largura, 640);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
}

Future<void> _abrirATela(WidgetTester tester, {double escalaDeTexto = 1.0}) async {
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: MockClient(_servidor),
    tokenDeAcesso: () async => 'token-de-teste',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      builder: (context, filho) => MediaQuery.withClampedTextScaling(
        minScaleFactor: escalaDeTexto,
        maxScaleFactor: escalaDeTexto,
        child: filho!,
      ),
      home: TelaDeConexoes(
        conexoes: ConexoesApi(api),
        seguranca: SegurancaApi(api),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Em quantas linhas o rotulo [rotulo] da barra de abas foi desenhado.
///
/// A altura de UMA linha e `getMinIntrinsicHeight(infinity)`: a altura que o
/// paragrafo tem quando a largura nao o aperta. Maior que isso, com folga de
/// meio pixel para arredondamento, e quebra de linha -- que e exatamente o que
/// o cliente relatou.
({double altura, double umaLinha, double pedida, double recebida}) _medir(
  WidgetTester tester,
  String rotulo,
) {
  final alvo = find.descendant(
    of: find.byType(TabBar),
    matching: find.text(rotulo),
  );
  expect(
    alvo,
    findsOneWidget,
    reason: 'REPROVA: o rotulo `$rotulo` nao esta na barra de abas de '
        '`TelaDeConexoes`. Se uma aba foi renomeada, este arquivo inteiro '
        'perdeu o objeto -- e renomear aba de produto nao e conserto de '
        'layout.',
  );
  final p = tester.renderObject<RenderParagraph>(alvo);
  return (
    altura: p.size.height,
    umaLinha: p.getMinIntrinsicHeight(double.infinity),
    pedida: p.getMaxIntrinsicWidth(double.infinity),
    recebida: p.size.width,
  );
}

void main() {
  setUpAll(_carregarInter);

  group('o rotulo da aba nao quebra a linha', () {
    for (final largura in _larguras) {
      testWidgets('nenhum dos tres rotulos quebra a ${largura.toInt()} dp',
          (tester) async {
        _janela(tester, largura);
        await _abrirATela(tester);

        for (final rotulo in const <String>[
          'Conexões',
          'Pendentes',
          'Bloqueados',
        ]) {
          final m = _medir(tester, rotulo);
          expect(
            m.altura,
            lessThanOrEqualTo(m.umaLinha + 0.5),
            reason: 'REPROVA: `$rotulo` foi desenhado em mais de uma linha a '
                '${largura.toInt()} dp -- altura ${m.altura} dp contra '
                '${m.umaLinha} dp de uma linha so. O texto pede '
                '${m.pedida} dp e recebeu ${m.recebida} dp. E o defeito que o '
                'cliente relatou em 29/10/2026. A barra de abas precisa dar a '
                'cada aba a largura do proprio texto (`isScrollable: true`), e '
                'nao um terco da tela; encurtar a palavra nao e saida, porque '
                'ela e palavra do produto.',
          );
        }
      });
    }

    testWidgets('nem a 200% de escala de texto, que e onde a Rede mediu',
        (tester) async {
      _janela(tester, 320);
      await _abrirATela(tester, escalaDeTexto: 2.0);

      for (final rotulo in const <String>[
        'Conexões',
        'Pendentes',
        'Bloqueados',
      ]) {
        final m = _medir(tester, rotulo);
        expect(
          m.altura,
          lessThanOrEqualTo(m.umaLinha + 0.5),
          reason: 'REPROVA: `$rotulo` quebrou a linha a 320 dp com escala de '
              'texto 200% -- altura ${m.altura} dp contra ${m.umaLinha} dp. '
              'Uma barra rolavel nao deve quebrar em escala nenhuma: ela rola. '
              'Quebra aqui quer dizer que a largura da aba voltou a ser '
              'imposta de fora.',
        );
      }
    });
  });

  group('a aba `Pendentes` com a pastilha nao transborda', () {
    for (final largura in _larguras) {
      testWidgets('sem `RenderFlex overflowed` a ${largura.toInt()} dp',
          (tester) async {
        _janela(tester, largura);
        await _abrirATela(tester);

        // **A ISCA E O `takeException`, E NAO O OLHO.** Transbordo de layout
        // chega como `FlutterError` na fase de pintura: um caso que so
        // procurasse o texto `Pendentes` ficaria VERDE com a faixa amarela de
        // transbordo desenhada em cima da barra de abas.
        expect(
          tester.takeException(),
          isNull,
          reason: 'REPROVA: a barra de abas de `TelaDeConexoes` transbordou a '
              '${largura.toInt()} dp. A `Row` de `_RotuloComContador` '
              '(`Pendentes` + a pastilha do contador) pede 120,73 dp e '
              'recebia largura de um terco da tela; a pastilha saia pela '
              'direita. Ver a conta na prosa do topo deste arquivo.',
        );
      });
    }
  });

  group('o custo da barra rolavel esta medido, e nao escondido', () {
    testWidgets('as tres abas continuam na arvore e `Bloqueados` e alcancavel',
        (tester) async {
      _janela(tester, 320);
      await _abrirATela(tester);

      // Rolar a barra NAO e o unico caminho para a aba 3 -- `Rotas.
      // pessoasBloqueadas` pousa nela direto, e o `TabBarView` anda por
      // arrasto. O que este caso cobra e que a aba exista inteira na arvore,
      // com a palavra inteira, e nao recortada com reticencia.
      expect(
        find.descendant(
          of: find.byType(TabBar),
          matching: find.text('Bloqueados'),
        ),
        findsOneWidget,
        reason: 'REPROVA: a aba `Bloqueados` saiu da barra. Ela e o unico '
            'lugar de onde o desbloqueio sai no aplicativo inteiro -- ver a '
            'prosa de `tela_de_conexoes.dart`.',
      );

      await tester.tap(
        find.descendant(
          of: find.byType(TabBar),
          matching: find.text('Bloqueados'),
        ),
        warnIfMissed: false,
      );
      await tester.pumpAndSettle();
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: tocar a aba `Bloqueados` na barra rolavel estourou.',
      );
    });
  });
}
