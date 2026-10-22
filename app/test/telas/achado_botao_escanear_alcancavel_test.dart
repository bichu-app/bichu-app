// ISCA — O BOTAO `Escanear a plaquinha` E ALCANCAVEL, com a barra do sistema
// descontada. E os textos que o cliente mandou enxugar sairam.
//
// ===========================================================================
// 1. A QUEIXA DO BOTAO, palavra por palavra (cliente, 22/10/2026)
// ===========================================================================
//
// *"alem do botao escanear a plaquinha que fica quebrado atras do menu nativo
// do celular e nao da para clicar"*.
//
// O botao existe em DUAS telas, as duas intituladas `Achado registrado`:
//
//   - `/achado-registrado` (`tela_achado_registrado.dart`), o desfecho;
//   - `/achados/:id` (`tela_do_achado.dart`), onde `Ver o achado` leva.
//
// MEDIDO em 390 x 844 dp (um iPhone 14) com 48 dp de barra do sistema,
// `devicePixelRatio` 1, rolado ate `maxScrollExtent`:
//
//   tela                  viewport   botao em       chao visivel   sobra
//   /achado-registrado     591 dp    595..635 dp       796 dp      +161
//   /achados/:id           780 dp    784..824 dp       796 dp       -28
//
// So a segunda quebrava, e a diferenca entre as duas e UMA: o desfecho tem
// `bottomNavigationBar` e a tela do achado nao tem. O `Scaffold` encolhe o
// `body` pelo que a barra de baixo ocupa, e `BarraDeAcaoFixa` -- que mora
// nesse slot -- aplica a `SafeArea` inferior ela mesma, corretamente. Sem
// barra nenhuma no slot, o `bottom: false` copiado das telas que TEM barra
// jogava fora o unico recuo que havia, e o `ListView` ficava com viewport ate
// o chao fisico: 28 dos 40 dp de altura do botao caiam dentro da faixa
// 796..844, que pertence a barra de navegacao do sistema.
//
// **O CONSERTO FOI NA TELA, E NAO NO WIDGET COMPARTILHADO.**
// `BarraDeAcaoFixa` nao foi tocada: 20 telas trazem aquela familia, e a
// `SafeArea` dela ja estava certa -- ela e justamente o que faz o desfecho
// passar nesta mesma isca.
//
// ===========================================================================
// 2. POR QUE A ISCA MEDE RETANGULO, E NAO O TOQUE
// ===========================================================================
//
// **Porque o toque passa verde com o botao coberto.** O ajudante
// `tocarSemRolar` (`acao_primaria_fora_da_rolagem_test.dart`) usa
// `warnIfMissed: false`, e `tester.tap` com esse sinalizador nao reprova
// quando o alvo nao recebe o toque -- foi assim que um botao atras do teclado
// ficou verde neste repositorio. Pior: em teste de widget NAO existe barra do
// sistema roubando o evento, entao mesmo um `tap` estrito acertaria um botao
// desenhado em 784..824 dp. Um caso de toque nao consegue, por construcao,
// enxergar este defeito.
//
// Entao a afirmacao daqui e geometrica: **o retangulo do botao esta inteiro
// dentro da area visivel, descontada a area do sistema**. E ela e medida numa
// janela de celular de verdade (390 x 844) e nao numa tela alta artificial --
// os outros arquivos de achado montam 1080 x 4000 de proposito, para a arvore
// inteira caber, e numa tela de 4000 dp de altura NENHUM botao fica atras de
// barra nenhuma.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- medido, com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/telas/achado/tela_do_achado.dart`, volte a `SafeArea` do `body`
//     para `bottom: false`.
//     -> reprova `/achados/:id -- o retangulo do botao cabe acima da barra do
//        sistema`, com `Rect.fromLTRB(38.3, 784.0, 351.7, 824.0)` contra chao
//        em 796. O caso irmao do desfecho CONTINUA verde, e e isso que mostra
//        que a reprovacao e da tela e nao da medicao.
//  2. No mesmo arquivo, apague o `BotaoSecundario` de `escanearAPlaquinha`.
//     -> reprova o mesmo caso pela ANCORA, antes da geometria: a isca exige o
//        botao na arvore primeiro, para "fora da tela" nunca se confundir com
//        "nao existe".
//  3. Em `textos_do_achado.dart`, devolva `rotuloDaEspecie` e passe-o ao
//     `GrupoSegmentado<Especie>` com `rotuloVisivel: true`.
//     -> reprova `o rotulo da especie saiu, e as tres opcoes ficaram`.
//  4. No mesmo arquivo, devolva a frase `Só se você souber. Em branco
//     funciona.` como `ajuda` dos dois `SeletorDeLista`.
//     -> reprova `a ajuda da raca e da cor saiu`.
//  5. No mesmo arquivo, volte `rotuloDoPorte` para `Do tamanho de quê?`.
//     -> reprova `o porte pergunta Qual é o porte?`.
//  6. No mesmo arquivo, devolva a segunda frase de `registradoCorpo`.
//     -> reprova `a confirmacao humana e dita UMA vez por tela, e nao duas`
//        nos dois casos (desfecho e tela do achado).
//  7. No mesmo arquivo, devolva o fim de `fotoAindaNaoSubiu`.
//     -> reprova `a faixa da foto nao repete onde a foto aparece`.
//
// ---------------------------------------------------------------------------
// O CONTROLE POSITIVO, e por que ele nao e zelo
// ---------------------------------------------------------------------------
//
// `findsNothing` fica verde com a tela em branco, com a rota errada e com um
// `ListView` que nao construiu o trecho medido -- e o `ListView` **nao
// constroi o que nao cabe**, que e o defeito recorrente desta casa. Entao
// cada caso de ausencia deste arquivo chama `varredura`, que devolve TODO
// texto da arvore, e primeiro exige lá dentro uma frase que CONTINUA na tela.
// Se a varredura nao enxerga o que ficou, ela tambem nao enxergaria o que
// saiu, e o caso reprova dizendo isso.

import 'dart:convert';

import 'package:bichu/api/modelos_achado.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/resultado_do_achado.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

const String _id = '01a14d3f-d95f-70b1-b31e-16d141678d34';

// ---------------------------------------------------------------------------
// A JANELA DE CELULAR DE VERDADE
// ---------------------------------------------------------------------------

/// Um iPhone 14 em dp. **Nao e tela alta de teste**: o defeito desta isca so
/// existe quando o conteudo chega ao chao da tela.
const double _largura = 390;
const double _altura = 844;

/// A barra de navegacao do sistema, em dp.
///
/// 48 dp e a barra de 3 botoes do Android, que e o `menu nativo do celular` da
/// queixa. O numero exato nao e o assunto -- qualquer recuo inferior maior que
/// zero expoe o defeito --, mas um numero de aparelho real deixa a medicao
/// comparavel com a tabela do cabecalho.
const double _barraDoSistema = 48;

/// O chao que a pessoa consegue tocar: o resto pertence ao sistema.
const double _chaoVisivel = _altura - _barraDoSistema;

void _celularComBarraDoSistema(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(_largura, _altura);
  // `padding` e o que `MediaQuery` entrega a `SafeArea`; `viewPadding` e o que
  // sobrevive ao teclado. Os dois, porque e exatamente a diferenca entre eles
  // que ja enganou isca neste repositorio.
  tester.view.padding = const FakeViewPadding(bottom: _barraDoSistema);
  tester.view.viewPadding = const FakeViewPadding(bottom: _barraDoSistema);
  addTearDown(tester.view.reset);
}

/// A tela alta dos outros arquivos de achado, para os casos de TEXTO.
///
/// Nos casos de ausencia o que se precisa e a arvore inteira montada de uma
/// vez; a geometria nao e o assunto deles.
void _telaAlta(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(1080, 4000);
  addTearDown(tester.view.reset);
}

Future<http.Response> _rede(http.Request pedido) async {
  if (pedido.url.path.endsWith('/reference-data')) {
    return json200(referenciaDeTeste());
  }
  if (pedido.url.path == '/v1/pets' && pedido.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  if (pedido.url.path.contains('/found-reports/')) {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'id': _id,
        'origin': 'stray_report',
        'status': 'open',
        'created_at': '2026-10-18T04:23:12Z',
        'found_at': '2026-10-18T04:23:12Z',
        'area_label': 'Vila Gertrudes, São Paulo',
        'notes': 'coleira azul sem placa',
      }),
      200,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }
  return problema('not-found', 404);
}

/// A foto no aparelho. **O caminho nao existe em disco, de proposito**, pelo
/// mesmo motivo do arquivo irmao: `Image.file` sobre arquivo ausente cai no
/// `errorBuilder` de `PreviaDaFoto`, e o que se mede aqui e o TEXTO da faixa,
/// nao o decodificador do sistema.
const FotoLocal _fotoDoAparelho = FotoLocal(
  caminho: '/nao/existe/achado.jpg',
  tipoDeConteudo: 'image/jpeg',
  tamanhoEmBytes: 120000,
);

ResultadoDoAchado _resultado({FotoLocal? foto}) =>
    ResultadoDoAchado.registrado(
      foto: foto,
      achado: AchadoRegistrado(
        id: _id,
        origem: OrigemDoAchado.achadoAvulso,
        status: StatusDoAchado.aberto,
        criadoEm: DateTime.utc(2026, 10, 18),
        achadoEm: DateTime.utc(2026, 10, 18),
        rotuloDaArea: 'Vila Gertrudes, São Paulo',
        observacao: 'coleira azul sem placa',
      ),
    );

// ---------------------------------------------------------------------------
// A VARREDURA, que e o unico olho dos casos de ausencia
// ---------------------------------------------------------------------------

/// Todo texto que a arvore montada carrega, lido dos `Text`.
///
/// Uma lista e nao um conjunto, de proposito: um dos casos conta QUANTAS vezes
/// a mesma frase aparece, e conjunto apagaria justamente a repeticao que o
/// cliente mandou tirar.
///
/// **E SO `Text`, E NAO `Text` MAIS `RichText` -- a primeira versao desta
/// funcao varria os dois e CONTAVA CADA FRASE DUAS VEZES**, porque todo `Text`
/// constroi um `RichText` descendente. O caso da repeticao reprovou com
/// `Expected: <1> Actual: <2>` sobre uma tela que ja dizia a frase uma unica
/// vez: a isca estava medindo a arvore de render, e nao o que a tela escreve.
/// Fica registrado porque uma contagem errada neste sentido e a mais perigosa
/// de todas -- ela reprova o conserto certo.
///
/// `textSpan` entra para os poucos `Text.rich` do app; `data` e nulo neles.
List<String> varredura(WidgetTester tester) => <String>[
      for (final e in find.byType(Text).evaluate())
        (e.widget as Text).data ??
            (e.widget as Text).textSpan?.toPlainText() ??
            '',
    ];

/// Exige que a varredura enxergue o que CONTINUA na tela.
///
/// Sem isto, todo `expect(..., isFalse)` deste arquivo passaria com a arvore
/// vazia -- e arvore vazia e o estado normal de um `ListView` cujo trecho
/// medido nao foi construido.
void controlePositivo(List<String> textos, String queFicou) {
  expect(
    textos.any((t) => t.contains(queFicou)),
    isTrue,
    reason:
        'REPROVA O PROPRIO CONTROLE: a varredura nao achou "$queFicou", que '
        'CONTINUA nesta tela. Enquanto ela nao enxerga o que ficou, ela '
        'tambem nao enxerga o que saiu, e a ausencia medida abaixo nao vale '
        'nada. Os textos vistos foram: $textos',
  );
}

void main() {
  // =========================================================================
  // 1. O BOTAO ALCANCAVEL -- RETANGULO, e nao toque
  // =========================================================================

  group('ISCA — o botao de escanear cabe acima da barra do sistema', () {
    /// Rola ate o verdadeiro fim da lista.
    ///
    /// **Um `drag` grande nao basta, e isso foi medido**: `maxScrollExtent` de
    /// um `ListView` preguicoso e uma ESTIMATIVA que cresce a cada filho novo
    /// construido. Um unico arrasto de -4000 dp parou em 1074,6 de 1179 na
    /// primeira tentativa desta isca, e o botao -- que e o ultimo filho --
    /// ainda nao estava na arvore. Arrastar em passos ate a posicao nao andar
    /// mais e o que chega ao fim de verdade.
    Future<void> ateOFim(WidgetTester tester) async {
      final estado =
          tester.state<ScrollableState>(find.byType(Scrollable).first);
      for (var i = 0; i < 40; i++) {
        final antes = estado.position.pixels;
        await tester.drag(find.byType(ListView), const Offset(0, -400));
        await tester.pumpAndSettle();
        if (estado.position.pixels <= antes + 0.01) break;
      }
    }

    void exigirBotaoDentroDaAreaVisivel(WidgetTester tester, String tela) {
      final botao = find.text(TextosDoAchado.escanearAPlaquinha);

      // A ANCORA, antes da geometria: "fora da tela" e "nao existe" sao
      // defeitos diferentes, e um `getRect` sobre nada estoura com uma
      // mensagem que nao diz qual dos dois aconteceu.
      expect(
        botao,
        findsOneWidget,
        reason:
            'REPROVA (ancora, $tela): o botao '
            '"${TextosDoAchado.escanearAPlaquinha}" nao esta na arvore depois '
            'de rolar ate o fim. Isto nao e o defeito desta isca -- e a acao '
            'simplesmente desaparecida, que e pior.',
      );

      final r = tester.getRect(botao);
      expect(
        r.bottom <= _chaoVisivel,
        isTrue,
        reason:
            'REPROVA ($tela): o botao esta em $r e o chao que a pessoa '
            'consegue tocar e $_chaoVisivel dp -- a faixa '
            '$_chaoVisivel..$_altura pertence a barra de navegacao do '
            'sistema. Passa do chao em '
            '${(r.bottom - _chaoVisivel).toStringAsFixed(1)} dp, de '
            '${r.height.toStringAsFixed(1)} dp de altura do botao. E a '
            'queixa do cliente, palavra por palavra: "fica quebrado atras do '
            'menu nativo do celular e nao da para clicar". '
            'ATENCAO A QUEM VIER CONSERTAR: um caso de TOQUE nao enxerga '
            'isto -- em teste de widget nao existe barra do sistema para '
            'roubar o evento, e `tocarSemRolar` ainda usa '
            '`warnIfMissed: false`. A afirmacao tem de ser o retangulo.',
      );
      expect(
        r.top >= 0,
        isTrue,
        reason:
            'REPROVA ($tela): o botao esta em $r, acima do topo da janela. '
            'A lista rolou demais e a medicao nao vale.',
      );
    }

    testWidgets(
      '/achados/:id -- o retangulo do botao cabe acima da barra do sistema',
      (tester) async {
        _celularComBarraDoSistema(tester);
        await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
        await irPara(tester, Rotas.achadoDe(_id));
        await ateOFim(tester);
        exigirBotaoDentroDaAreaVisivel(tester, '/achados/:id');
      },
    );

    testWidgets(
      '/achado-registrado -- o retangulo do botao cabe acima da barra do '
      'sistema',
      (tester) async {
        // O CASO IRMAO, e ele e o CONTROLE da geometria: esta tela sempre
        // esteve certa, porque a `SafeArea` de `BarraDeAcaoFixa` encolhe o
        // `body` por ela. Se um dia os dois casos reprovarem juntos, o
        // problema esta na medicao ou no widget compartilhado -- e nao na
        // tela que esta isca consertou.
        _celularComBarraDoSistema(tester);
        await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
        await irPara(tester, Rotas.achadoRegistrado, extra: _resultado());
        await ateOFim(tester);
        exigirBotaoDentroDaAreaVisivel(tester, '/achado-registrado');
      },
    );
  });

  // =========================================================================
  // 2. OS TEXTOS QUE SAIRAM DO FORMULARIO
  // =========================================================================

  group('ISCA — os textos enxugados do formulario de achado', () {
    Future<void> abrirOPasso1(WidgetTester tester) async {
      _telaAlta(tester);
      await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
      await irPara(tester, Rotas.registrarAchado);
    }

    testWidgets('o rotulo da especie saiu, e as tres opcoes ficaram', (
      tester,
    ) async {
      await abrirOPasso1(tester);
      final textos = varredura(tester);

      // O CONTROLE POSITIVO e o rotulo do campo VIZINHO: ele esta no mesmo
      // trecho da mesma lista, e se a varredura o enxerga ela enxergaria o da
      // especie tambem, se ele estivesse lá.
      controlePositivo(textos, TextosDoAchado.rotuloDaRaca);

      expect(
        textos.any((t) => t.contains('O que é o bicho?')),
        isFalse,
        reason:
            'REPROVA: a tela ainda pergunta "O que é o bicho?". O cliente '
            'mandou retirar essa linha em 22/10/2026 -- *"porque o titulo já '
            'tras isso"* --, e o titulo do passo 1 '
            '("${TextosDoAchado.tituloDoPasso1}") de fato faz a mesma '
            'pergunta duas linhas acima. Textos vistos: $textos',
      );

      // **E AS OPCOES FICARAM**, que e a metade do pedido que um conserto
      // apressado apaga junto: neste widget o rotulo e as opcoes saem da
      // MESMA chamada, e remover o campo inteiro tambem faria o `isFalse`
      // acima passar.
      for (final especie in Especie.values) {
        expect(
          find.text(especie.rotulo),
          findsOneWidget,
          reason:
              'REPROVA: a opcao "${especie.rotulo}" desapareceu junto com o '
              'rotulo. O pedido foi explicito: *"mas mantenha cachorro, gato '
              'e outro"*. Sai o rotulo, ficam as opcoes -- e sem elas o '
              'formulario perdeu um campo que o contrato exige '
              '(`StrayFoundReportInput.species`).',
        );
      }
    });

    testWidgets('a ajuda da raca e da cor saiu', (tester) async {
      await abrirOPasso1(tester);
      final textos = varredura(tester);

      // Os dois campos de que a frase era ajuda CONTINUAM na tela: e por isso
      // que eles sao o controle positivo certo aqui.
      controlePositivo(textos, TextosDoAchado.rotuloDaRaca);
      controlePositivo(textos, TextosDoAchado.rotuloDaCor);
      controlePositivo(textos, TextosDoAchado.escolherNaLista);

      expect(
        textos.any((t) => t.contains('Só se você souber')),
        isFalse,
        reason:
            'REPROVA: a tela ainda diz "Só se você souber. Em branco '
            'funciona." -- retirada por pedido do cliente em 22/10/2026. Os '
            'dois campos continuam opcionais; o que saiu foi a frase, e nao a '
            'opcionalidade. Textos vistos: $textos',
      );
      expect(
        textos.any((t) => t.contains('Em branco funciona')),
        isFalse,
        reason:
            'REPROVA: a segunda metade da frase retirada ainda esta na tela. '
            'Textos vistos: $textos',
      );
    });

    testWidgets('o porte pergunta Qual é o porte?', (tester) async {
      await abrirOPasso1(tester);
      final textos = varredura(tester);

      // Aqui o controle positivo e a PROPRIA redacao nova: ela e o que ficou,
      // e exigi-la presente antes de cobrar a antiga ausente e o que impede o
      // caso de passar com a tela em branco.
      controlePositivo(textos, 'Qual é o porte?');
      expect(
        TextosDoAchado.rotuloDoPorte,
        'Qual é o porte?',
        reason:
            'REPROVA: a constante do porte nao e a frase que o cliente ditou '
            'em 22/10/2026. Esta afirmacao escreve a frase A MAO de proposito '
            '-- comparar a tela com a constante que a produz ficaria verde '
            'com qualquer coisa escrita nela.',
      );

      expect(
        textos.any((t) => t.contains('Do tamanho de quê?')),
        isFalse,
        reason:
            'REPROVA: a tela ainda pergunta "Do tamanho de quê?". O cliente '
            'mandou trocar por "Qual é o porte?" em 22/10/2026. '
            'Textos vistos: $textos',
      );
      // As quatro opcoes de porte continuam, pelo mesmo motivo das tres de
      // especie: trocar um rotulo nao e apagar um campo que o contrato exige
      // (`StrayFoundReportInput.size`).
      for (final porte in Porte.values) {
        expect(
          find.text(porte.rotulo),
          findsOneWidget,
          reason:
              'REPROVA: a opcao de porte "${porte.rotulo}" desapareceu junto '
              'com a troca do rotulo.',
        );
      }
    });
  });

  // =========================================================================
  // 3. O QUE FOI ENXUGADO DA PAGINA DO ACHADO REGISTRADO
  // =========================================================================

  group('ISCA — a pagina do achado registrado nao se repete', () {
    /// A frase que aparecia DUAS vezes na mesma tela.
    ///
    /// Escrita a mao, e nao lida de `oQueOTutorRecebe`: uma isca que comparasse
    /// a tela com a constante que a produz ficaria verde com qualquer redacao,
    /// e o que se mede aqui e a CONTAGEM de uma frase especifica.
    const String aConfirmacaoHumana =
        'Quem confirma se é o mesmo animal é o tutor, nunca o Bichu sozinho.';

    void exigirUmaSoVez(WidgetTester tester, String tela) {
      final textos = varredura(tester);

      // CONTROLE POSITIVO: a frase TEM de estar na tela, uma vez. Um caso que
      // so contasse "nao duas" passaria com a tela vazia -- e aqui o pedido
      // era enxugar, nao apagar.
      controlePositivo(textos, TextosDoAchado.ninguemFoiAvisado);
      controlePositivo(textos, aConfirmacaoHumana);

      final vezes = textos.where((t) => t.contains(aConfirmacaoHumana)).length;
      expect(
        vezes,
        1,
        reason:
            'REPROVA ($tela): a frase "$aConfirmacaoHumana" aparece $vezes '
            'vezes nesta tela. Ela era o fim de `registradoCorpo` E o fim de '
            '`oQueOTutorRecebe`, poucos centimetros abaixo -- a mesma '
            'sentenca duas vezes. O cliente pediu em 22/10/2026: *"tem muito '
            'texto, vamos resumir isso"*. Ficou a copia do bloco '
            '`Quem foi avisado`, que e onde a confirmacao humana pesa. '
            'Textos vistos: $textos',
      );
    }

    testWidgets(
      'a confirmacao humana e dita UMA vez por tela, e nao duas — desfecho',
      (tester) async {
        _telaAlta(tester);
        await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
        await irPara(tester, Rotas.achadoRegistrado, extra: _resultado());
        exigirUmaSoVez(tester, '/achado-registrado');
      },
    );

    testWidgets(
      'a confirmacao humana e dita UMA vez por tela, e nao duas — tela do '
      'achado',
      (tester) async {
        _telaAlta(tester);
        await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
        await irPara(tester, Rotas.achadoDe(_id));
        exigirUmaSoVez(tester, '/achados/:id');
      },
    );

    testWidgets('a faixa da foto nao repete onde a foto aparece', (
      tester,
    ) async {
      _telaAlta(tester);
      await abrirOApp(tester, deposito: depositoLogado(), rede: _rede);
      // **COM FOTO**, que e o unico estado em que esta faixa existe: sem
      // foto a tela escreve `semFoto`, e um caso sem foto mediria a faixa
      // errada -- foi o que ele fez na primeira execucao, e o controle
      // positivo o pegou.
      await irPara(
        tester,
        Rotas.achadoRegistrado,
        extra: _resultado(foto: _fotoDoAparelho),
      );
      final textos = varredura(tester);

      // CONTROLE POSITIVO: o que a faixa tem de PROPRIO continua dito. O
      // criterio 4 pede o estado da foto visivel, e *"achado sem foto vale
      // menos, mas vale"*.
      controlePositivo(textos, 'A foto ainda não foi enviada');
      controlePositivo(textos, 'O achado já vale sem ela');

      expect(
        textos.any((t) => t.contains('a foto entra na conversa quando o '
            'tutor aparecer')),
        isFalse,
        reason:
            'REPROVA: a faixa ainda diz que "a foto entra na conversa quando '
            'o tutor aparecer" -- e a tela escreve '
            '"${TextosDoAchado.fotoSoNaConversa}" debaixo do quadro da foto, '
            'no mesmo estado em que esta faixa aparece. "Na conversa", "ao '
            'tutor": e a mesma frase em outra ordem, e foi o que o cliente '
            'mandou enxugar em 22/10/2026. Textos vistos: $textos',
      );
    });
  });
}
