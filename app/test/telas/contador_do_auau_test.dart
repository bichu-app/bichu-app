// O CONTADOR DE NAO LIDO DA ABA `AuAu` -- as SEIS iscas (20/10/2026).
//
// Pedido do cliente, literal: *"quando o usuário receber uma nova mensagem, o
// icone do auau vai ficar de outra cor com o +1, +2 dependendo a quantidade de
// mensagens não lida e o icone do aplicativo, quando ficar fechado, tambem vai
// ficar com +1, igual o instagram e linkedin fazem"*.
//
// Todo caso deste arquivo tem de REPROVAR quando o mecanismo que ele protege e
// desligado, e o cabecalho de cada grupo diz COMO desligar. Prova negativa que
// vive numa frase evapora.
//
// As seis:
//
//   (a) mensagem nova faz o numero aparecer no `AuAu`;
//   (b) abrir e ler ZERA;
//   (c) o rotulo acessivel diz o que o numero SIGNIFICA;
//   (d) o numero nao faz rotulo cortar em NENHUMA das cinco larguras, com 1, 2
//       e 3 digitos;
//   (e) sem fonte de dados a aba NAO mostra zero nem erro -- mostra NADA;
//   (f) o caminho do icone do aplicativo existe, e exercido e esta INERTE, sem
//       afirmar aviso em tela nenhuma.
//
// ## A ASSIMETRIA DAS CINCO ABAS E O ASSUNTO DO CASO (e)
//
// O cliente pediu contador em cinco abas. Medido em 20/10/2026 nesta arvore e
// em homologacao, so `AuAu` tem de onde contar. As outras quatro nao tem
// fonte, e o caso (e) existe para que a ausencia apareça como AUSENCIA -- e
// nao como um zero, que seria o app afirmando o que nao sabe.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/contadores_api.dart';
import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/dispositivo/distintivo_do_aplicativo.dart';
import 'package:bichu/sessao/contadores_de_nao_lido.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// O nome do grupo da isca do LOGOUT, escrito uma vez so.
///
/// Citado pelo registro de `limpezasAoSair`, em
/// `test/sessao/limpezas_ao_sair_test.dart`: um registro que aponte para um
/// grupo que nao existe reprova. Constante, e nao literal repetido, para que
/// renomear o grupo nao deixe o registro apontando para o nada.
const String grupoDaIscaDoContadorNoLogout =
    'ISCA — o contador de nao lido nao sobrevive ao logout';

/// As cinco larguras suportadas. **A mesma lista do portao dos rotulos**, e
/// repetida de proposito: importar a de la amarraria os dois arquivos, e se um
/// dia aquela mudar eu quero que ESTE caso reprove, nao que ele mude de
/// assunto em silencio.
const List<double> larguras = <double>[320, 360, 375, 390, 412];

/// A tabela de 27.2.1, como ela esta medida no portao dos rotulos.
///
/// Serve de GUARDA: se a barra deixar de pintar um destes rotulos, ou pintar
/// um que nao esta aqui, o caso (d) reprova em vez de medir outra coisa.
const Map<String, double> larguraMedidaPelaUx = <String, double>{
  'Pets': 39.20,
  'Rede': 45.08,
  'Mural': 50.90,
  'Loja': 37.15,
  'AuAu': 49.33,
};

// ---------------------------------------------------------------------------
// A bancada
// ---------------------------------------------------------------------------

/// Carrega a `Inter` de verdade, de `assets/fonts/`.
///
/// **Sem isto o caso (d) nao vale nada.** O ambiente de teste do Flutter usa
/// uma fonte sintetica de largura uniforme, em que nenhum rotulo quebra nunca:
/// o portao ficaria verde por estar medindo outra coisa. A UX perdeu uma
/// passada inteira exatamente assim, e e por isso que a guarda de fonte e um
/// caso proprio aqui embaixo.
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
    // Verificacao que nao consegue verificar REPROVA.
    if (!arquivo.existsSync()) {
      fail(
        'REPROVA: nao achei "assets/fonts/$nome" a partir de '
        '"${Directory.current.path}". Sem a Inter real a medida do rotulo e '
        'feita contra a fonte sintetica de largura uniforme, que NUNCA quebra '
        'linha.',
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

/// A resposta de `GET /v1/conversations` com o contador que o caso quer.
///
/// **`unread_count` e da CONTA inteira**, e nao da pagina: no servidor ele sai
/// de `contarParaOSino`, com a autorizacao no `WHERE`. A lista vai VAZIA de
/// proposito nos casos de contador: um `items` com conversas faria o caso
/// medir tambem a lista, e um contador de 3 com lista vazia e justamente o
/// estado que prova que o numero nao e contado no aparelho.
String corpoDeConversas(int naoLidas) => jsonEncode(<String, dynamic>{
  'items': <dynamic>[],
  'total': 0,
  'unread_count': naoLidas,
  'next_cursor': null,
});

/// Quantas vezes o app pediu cada caminho, e com que resposta ele saiu.
class RedeDeTeste {
  RedeDeTeste({this.naoLidas = 0});

  int naoLidas;

  /// Quando verdadeiro, `GET /v1/conversations` **estoura**. E o aparelho no
  /// elevador, e o caso que prova que falha nao vira zero.
  bool derrubar = false;

  /// Quantas vezes `GET /v1/conversations` foi pedido. **E a medida do custo
  /// em requisicoes**: o caso (b) a usa para provar que visitar `AuAu` nao
  /// gasta uma chamada a mais do que a propria lista.
  int pedidosDeConversas = 0;

  /// Quantas vezes `POST /v1/me/conversations-seen` foi pedido.
  int marcacoesDeVista = 0;

  Future<http.Response> responder(http.Request pedido) async {
    final caminho = pedido.url.path;
    if (caminho.endsWith('/v1/conversations')) {
      pedidosDeConversas += 1;
      if (derrubar) throw const SocketException('sem rede, de proposito');
      return http.Response(
        corpoDeConversas(naoLidas),
        200,
        headers: const <String, String>{'content-type': 'application/json'},
      );
    }
    if (caminho.endsWith('/v1/me/conversations-seen')) {
      marcacoesDeVista += 1;
      // 204, como o contrato declara -- e como a rota passou a responder em
      // 20/10/2026, quando o handler que faltava foi registrado. Antes disso
      // homologacao devolvia 404 aqui, e o contador nao zerava por nenhum
      // caminho. Ver `lista-vista-esta-registrada.test.ts`.
      naoLidas = 0;
      return http.Response('', 204);
    }
    // Toda outra rota sai 200 com objeto vazio: nenhum caso deste arquivo
    // depende de outra tela, e um 500 generico faria faixas de erro
    // aparecerem por cima do que esta sendo medido.
    return http.Response(
      '{}',
      200,
      headers: const <String, String>{'content-type': 'application/json'},
    );
  }
}

/// Um `ApiClient` ligado a [rede], para os casos que medem o CONTADOR e nao a
/// tela.
///
/// Eles existem separados dos de widget de proposito: as regras de nulo, de
/// falha e de logout nao passam por pixel nenhum, e um caso de widget para
/// cada uma delas mediria a barra em vez da regra.
ApiClient clienteDeTesteDoContador(RedeDeTeste rede) {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: MockClient(rede.responder),
  );
  addTearDown(api.fechar);
  return api;
}

/// O distintivo do icone do aplicativo, espionado. **Devolve INERTE sempre.**
///
/// Ele nao finge acender: se devolvesse [ResultadoDoDistintivo.aplicado], o
/// caso (f) estaria provando o contrario do que ele existe para provar.
class DistintivoEspiao implements DistintivoDoAplicativo {
  final List<int> recebidos = <int>[];

  @override
  ResultadoDoDistintivo definir(int naoLidas) {
    recebidos.add(naoLidas);
    return ResultadoDoDistintivo.naoAplicado;
  }
}

/// O distintivo pintado na aba [rotulo], ou nulo quando nao ha nenhum.
///
/// Procura o `Text` DENTRO do destino, e nao em qualquer lugar da tela: um
/// `find.text('3')` solto acharia um `3` do corpo da pagina e o caso ficaria
/// verde por achar outra coisa.
String? seloPintadoNaAba(WidgetTester tester, String rotulo) {
  final destino = find.ancestor(
    of: find.text(rotulo),
    matching: find.byType(NavigationDestination),
  );
  expect(
    destino,
    findsOneWidget,
    reason: 'REPROVA: nao achei o destino "$rotulo" na barra. Sem ele nao ha '
        'o que medir, e um portao sem o que medir reprova com o motivo.',
  );
  final selo = find.descendant(
    of: destino,
    matching: find.descendant(
      of: find.byType(DistintivoDaAba),
      matching: find.byType(Text),
    ),
  );
  if (selo.evaluate().isEmpty) return null;
  // `first`: o destino tem `icon` e `selectedIcon`, e os dois carregam o
  // distintivo. Os dois pintam o MESMO texto, e o caso (a) cobra isso.
  return tester.widgetList<Text>(selo).first.data;
}

/// O nome acessivel que o leitor de tela anuncia na aba [rotulo].
///
/// Lido do `Semantics` montado, e nao de `nomeAcessivelCom` chamado a mao: um
/// caso que chamasse a funcao continuaria verde no dia em que a barra parasse
/// de usa-la, que e o defeito que volta calado numa refatoracao.
String rotuloAnunciadoDaAba(WidgetTester tester, String rotulo) {
  final destino = find.ancestor(
    of: find.text(rotulo),
    matching: find.byType(NavigationDestination),
  );
  final semantica = find.ancestor(
    of: destino,
    matching: find.byType(Semantics),
  );
  final rotulos = tester
      .widgetList<Semantics>(semantica)
      .map((s) => s.properties.label)
      .whereType<String>()
      .where((l) => l.startsWith(rotulo))
      .toList(growable: false);
  expect(
    rotulos,
    isNotEmpty,
    reason: 'REPROVA: nenhum `Semantics` acima do destino "$rotulo" declara um '
        'nome que comece pelo rotulo visivel. E o SC 2.5.3, e sem ele quem usa '
        'comando de voz nao consegue dizer "tocar em $rotulo".',
  );
  return rotulos.first;
}

/// Monta **so a barra**, com o tema do app, na largura e na escala pedidas, e
/// com o distintivo de [naoLidas] na aba `AuAu`.
///
/// **Os rotulos saem do REGISTRO**, e nao de uma lista escrita a mao: trocar
/// `Mural` por uma palavra maior tem de reprovar AQUI, na medida.
/// Monta a barra do REGISTRO com selo, para medir rotulo.
///
/// **[naoLidasDe] existe desde 20/10/2026**, quando `Pets` e `Rede` ganharam
/// contagem: com ele a bancada pode pintar os TRES selos ao mesmo tempo, que e
/// o pior caso de largura e o unico que prova que nenhum rotulo corta com a
/// barra inteira acesa. O padrao -- selo so na aba de conversa -- preserva o
/// que os casos de `AuAu` mediam antes, letra por letra.
Future<void> montarBarraComSelo(
  WidgetTester tester, {
  required double largura,
  required int? naoLidas,
  int? Function(DestinoDeNavegacao)? naoLidasDe,
  double escala = 2,
}) async {
  tester.view.physicalSize = Size(largura * 3, 2000);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);

  final destinos = CascaComAbas.visiveisEm(CascaComAbas.configuracao);
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(textScaler: TextScaler.linear(escala)),
      child: MaterialApp(
        theme: BichuTheme.claro,
        home: Scaffold(
          bottomNavigationBar: NavigationBar(
            selectedIndex: 0,
            destinations: <Widget>[
              for (final destino in destinos)
                NavigationDestination(
                  icon: DistintivoDaAba(
                    // DE VOLTA A `Icon(destino.icone)` em 26/10/2026: o
                    // cliente reprovou o desenho, os cinco slots voltaram ao
                    // Material e `desenho` e nulo outra vez -- o `!` daqui
                    // estourava. O distintivo e medido POR CIMA do glifo, e
                    // o que importa para esta medida e que o glifo tenha os
                    // 24 dp de sempre, qualquer que seja a fonte dele.
                    glifo: Icon(destino.icone),
                    naoLidas: naoLidasDe != null
                        ? naoLidasDe(destino)
                        : (destino.campoSemantico == CampoSemantico.conversa
                            ? naoLidas
                            : null),
                  ),
                  label: destino.rotulo,
                ),
            ],
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Um rotulo que nao coube: em quantas linhas saiu e quanto foi pintado fora.
typedef Transbordo = ({String rotulo, double largura, int linhas, double fora});

/// Mede os rotulos ja montados. Devolve **so os que nao couberam**.
///
/// O numero de linhas sai do RENDER, e nao de um `TextPainter` montado a
/// parte: um painter proprio nao sabe do `clamp` que o componente aplica nem
/// da largura exata que o leiaute distribuiu ao slot.
List<Transbordo> medirRotulos(WidgetTester tester, double tela) {
  final barra = tester.getRect(find.byType(NavigationBar));
  final achados = <Transbordo>[];
  for (final rotulo in larguraMedidaPelaUx.keys) {
    final alvo = find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text(rotulo),
    );
    expect(
      alvo,
      findsOneWidget,
      reason: 'REPROVA: nao achei o rotulo "$rotulo" dentro da barra em '
          '$tela dp. Sem ele nao ha o que medir.',
    );
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
    final fora = tester.getRect(alvo).bottom - barra.bottom;
    if (linhas > 1 || fora > 0.01) {
      achados.add((rotulo: rotulo, largura: tela, linhas: linhas, fora: fora));
    }
  }
  return achados;
}

void main() {
  // -------------------------------------------------------------------------
  // (a) MENSAGEM NOVA FAZ O NUMERO APARECER NO `AuAu`
  //
  // COMO DESLIGAR E VER REPROVAR: em `casca_com_abas.dart`, troque
  // `naoLidas: naoLidasDe(destino)` por `naoLidas: null` nos dois icones do
  // destino. Ou, em `app.dart`, apague a chamada de `_contarNaoLidas()` do
  // `_arrancar()`.
  // -------------------------------------------------------------------------
  group('(a) o numero aparece na aba `AuAu`', () {
    testWidgets('ISCA: tres mensagens novas pintam `3` na aba `AuAu`',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 3);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        '3',
        reason: 'REPROVA: a aba `AuAu` nao pinta `3` com `unread_count: 3` na '
            'resposta de `GET /v1/conversations`. O pedido do cliente e '
            'literal -- "+1, +2 dependendo a quantidade de mensagens nao '
            'lida" --, e o numero e o sinal PRIMARIO: sem ele a cor estaria '
            'sozinha, que e o SC 1.4.1 (a mesma razao pela qual o cinza da '
            'foto de evento cancelado saiu em 19/10).',
      );
      expect(
        rede.pedidosDeConversas,
        greaterThanOrEqualTo(1),
        reason: 'REPROVA: o app nao pediu `GET /v1/conversations` nenhuma vez. '
            'Um numero que aparece sem ninguem perguntar e numero contado no '
            'aparelho, que e adivinhacao e divergiria entre dois aparelhos da '
            'mesma pessoa.',
      );
    });

    testWidgets('ISCA: o selo da aba e o MESMO nos dois glifos, aceso e apagado',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 2);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      final destino = find.ancestor(
        of: find.text('AuAu'),
        matching: find.byType(NavigationDestination),
      );
      final selos = tester
          .widgetList<Text>(
            find.descendant(
              of: destino,
              matching: find.descendant(
                of: find.byType(DistintivoDaAba),
                matching: find.byType(Text),
              ),
            ),
          )
          .map((t) => t.data)
          .toSet();
      expect(
        selos,
        <String>{'2'},
        reason: 'REPROVA: `icon` e `selectedIcon` pintam selos diferentes '
            '($selos). A aba selecionada e a nao selecionada mostrariam '
            'numeros distintos para o mesmo estado, e o defeito so apareceria '
            'para quem esta JUSTAMENTE na aba de mensagens.',
      );
    });

    testWidgets('ISCA: o selo recorta em `9+` acima de nove', (tester) async {
      final rede = RedeDeTeste(naoLidas: 150);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        '9+',
        reason: 'REPROVA: o selo nao recortou. O teto e `9+` por UNIDADE DE '
            'LINGUAGEM e nao por falta de espaco -- tres digitos cabem, e o '
            'caso (d) prova --, porque `seloDoContador` e '
            '`SinoDeNotificacoes.distintivoDe` ja cortam em `9+`. Dois '
            'recortes para a mesma ideia fariam a barra de baixo e a de cima '
            'discordarem sobre o que "muitos" quer dizer, no mesmo numero e na '
            'mesma tela.',
      );
    });

    test('ISCA: os TRES recortes de `9+` do app continuam concordando', () {
      for (final n in <int>[1, 9, 10, 99, 100, 1000]) {
        expect(
          DistintivoDaAba.textoDe(n),
          seloDoContador(n),
          reason: 'REPROVA: a aba e `seloDoContador` discordam em $n. Enquanto '
              'os dois existirem separados, eles tem de dizer a mesma coisa.',
        );
        expect(
          DistintivoDaAba.textoDe(n),
          SinoDeNotificacoes.distintivoDe(n),
          reason: 'REPROVA: a aba e o sino da barra de topo discordam em $n.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // (b) ABRIR E LER ZERA
  //
  // COMO DESLIGAR E VER REPROVAR: em `rotas.dart`, apague
  // `aoVerAArea: contadores.marcarMensagensVistas`. Ou, em
  // `area_de_mensagens.dart`, apague a chamada de `widget.aoVerAArea?.call()`.
  // -------------------------------------------------------------------------
  group('(b) abrir a area de mensagens ZERA o numero', () {
    testWidgets('ISCA: tocar em `AuAu` apaga o selo da aba', (tester) async {
      final rede = RedeDeTeste(naoLidas: 4);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );
      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        '4',
        reason: 'REPROVA: o selo nao apareceu antes do toque, e sem ele o caso '
            'nao tem o que ver desaparecer -- ele aprovaria por vacuidade, que '
            'e a armadilha que mais custou neste projeto.',
      );

      await abrirAAba(tester, 'AuAu');

      expect(
        rede.marcacoesDeVista,
        greaterThanOrEqualTo(1),
        reason: 'REPROVA: a area abriu e `POST /v1/me/conversations-seen` nao '
            'foi chamada. Sem ela o servidor nao sabe que a pessoa viu, e o '
            'numero volta a subir na proxima pergunta -- que e exatamente o '
            'que acontecia em homologacao, onde a rota respondia 404 por nao '
            'estar registrada.',
      );

      // **A VOLTA E PARTE DO CASO, e nao um detalhe de navegacao.** `AuAu` tem
      // `ehRamo: false`: ela EMPURRA a rota no navegador raiz e a tela cobre a
      // casca, barra de baixo inclusive. Quer dizer que a aba so e vista de
      // novo ao voltar, e e ali que o numero tem de estar apagado -- sem
      // pergunta nova NA SAIDA, porque a recontagem de `aoVerAArea` ja
      // aconteceu DENTRO da visita, com a barra fora da tela.
      final pedidosAntesDaVolta = rede.pedidosDeConversas;
      // Volta pelo ROTEADOR, e nao por `pageBack()`: a tela sai por
      // `SaidaDaTela` e nao desenha o botao de voltar do Material, entao
      // `pageBack()` reprova por nao achar o botao -- e falharia por um motivo
      // que nao e o deste caso.
      GoRouter.of(tester.element(find.byType(Scaffold).first)).pop();
      await tester.pumpAndSettle();

      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        isNull,
        reason: 'REPROVA: o selo continua pintado depois de a pessoa abrir e '
            'ver a area. Contador que nao zera e pior que contador nenhum: ele '
            'ensina a pessoa a ignorar a aba.',
      );
      expect(
        rede.pedidosDeConversas,
        pedidosAntesDaVolta,
        reason: 'REPROVA: a VOLTA gastou pedido novo. A recontagem acontece '
            'DENTRO da visita e nao na saida -- e e por isso que a pessoa nao '
            've atraso: `AuAu` empurra a rota e a tela COBRE a barra, entao a '
            'resposta volta enquanto a barra nem esta na tela. Recontar na '
            'saida deixaria o numero velho aceso por uma ida a rede, na frente '
            'de quem acabou de ler.',
      );
    });

    testWidgets(
        'ISCA: visitar `AuAu` custa 2 pedidos -- a lista, e a RECONTAGEM',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 4);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );
      final antes = rede.pedidosDeConversas;

      await abrirAAba(tester, 'AuAu');

      // **DOIS, e o segundo e o preco de nao mentir.** O primeiro e a lista,
      // que a tela pediria de qualquer jeito. O segundo e a recontagem depois
      // de `conversations-seen`, e ela existe porque ver a lista NAO tira tudo
      // do contador: o aviso de plaquinha lida e o de achado continuam
      // contando (`contarParaOSino`, o `OR msg.system_kind IN (...)`) e o app
      // nao tem como saber quais sao. Um zero local apagaria da barra
      // exatamente o aviso de que alguem esta com o animal na mao agora.
      expect(
        rede.pedidosDeConversas - antes,
        2,
        reason: 'REPROVA: abrir `AuAu` gastou '
            '${rede.pedidosDeConversas - antes} pedidos de '
            '`GET /v1/conversations`, e a politica desenhada sao 2: a lista da '
            'tela, e a recontagem depois de `conversations-seen`. Mais que '
            'isso e a mesma resposta comprada duas vezes. MENOS que isso '
            'significa que a recontagem saiu -- e sem ela volta o zero local, '
            'que mente sobre o aviso de plaquinha lida.',
      );
    });

    testWidgets('ISCA: abrir a area nao marca CONVERSA nenhuma como lida',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 4);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );
      await abrirAAba(tester, 'AuAu');

      // `markMyConversationsSeen` zera o CONTADOR e nao marca item nenhum --
      // as duas coisas sao fatos diferentes, e uma chamada que fizesse as duas
      // apagaria a unica pista de QUAL conversa guarda o recado. Entao
      // nenhuma rota de leitura por conversa pode ter saido daqui.
      expect(
        rede.marcacoesDeVista,
        1,
        reason: 'REPROVA: `conversations-seen` saiu '
            '${rede.marcacoesDeVista} vezes numa abertura. Ela e idempotente, '
            'e o teto de 240/h por conta e alto de proposito, mas repetir por '
            'quadro gastaria o teto de quem troca de aba e volta.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (c) O ROTULO ACESSIVEL DIZ O QUE O NUMERO SIGNIFICA
  //
  // COMO DESLIGAR E VER REPROVAR: em `casca_com_abas.dart`, troque
  // `label: destino.nomeAcessivelCom(naoLidasDe(destino))` por
  // `label: destino.semanticsLabel`.
  // -------------------------------------------------------------------------
  group('(c) o rotulo acessivel diz o SIGNIFICADO, e nao o numero solto', () {
    testWidgets('ISCA: o leitor de tela ouve `AuAu, 3 mensagens novas`',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 3);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      expect(
        rotuloAnunciadoDaAba(tester, 'AuAu'),
        'AuAu, 3 mensagens novas',
        reason: 'REPROVA: o nome acessivel da aba nao diz o que o numero '
            'significa. `3` sozinho nao e informacao para quem nao ve o '
            'contexto, e o icone e DECORATIVO -- ele nao entra na arvore de '
            'semantica, entao nao ha de onde tirar o assunto.',
      );
    });

    testWidgets('ISCA: o selo pintado NAO e anunciado por cima do rotulo',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 3);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      final destino = find.ancestor(
        of: find.text('AuAu'),
        matching: find.byType(NavigationDestination),
      );
      final textoDoSelo = tester
          .widgetList<Text>(
            find.descendant(
              of: destino,
              matching: find.descendant(
                of: find.byType(DistintivoDaAba),
                matching: find.byType(Text),
              ),
            ),
          )
          .first;
      expect(
        textoDoSelo.semanticsLabel,
        '',
        reason: 'REPROVA: o `Text` do selo entra na arvore de semantica. O '
            'leitor de tela leria "AuAu, 3 mensagens novas" e depois "3" -- '
            'dois anuncios do mesmo estado no mesmo controle. Com recorte seria '
            'pior: o anunciado diria `150` e o pintado `9+`.',
      );
    });

    test('ISCA: o rotulo acessivel leva o numero INTEIRO, e o pintado recorta',
        () {
      final auau = CascaComAbas.destinos
          .firstWhere((d) => d.campoSemantico == CampoSemantico.conversa);

      expect(
        auau.nomeAcessivelCom(1),
        'AuAu, 1 mensagem nova',
        reason: 'REPROVA: o singular. "1 mensagens novas" e o defeito de '
            'plural que a pessoa ouve, nao le.',
      );
      expect(
        auau.nomeAcessivelCom(100),
        'AuAu, 100 mensagens novas',
        reason: 'REPROVA: o rotulo acessivel recortou em 100. O teto de `9+` '
            'existe porque o circulo nao cresce, e essa restricao e de quem VE '
            '-- aplica-la a quem OUVE seria contar "nove mais" a quem tem 100.',
      );
      expect(
        auau.nomeAcessivelCom(1000),
        'AuAu, 1000 mensagens novas',
        reason: 'REPROVA: o rotulo acessivel recortou em 1000.',
      );
      expect(
        DistintivoDaAba.textoDe(100),
        '9+',
        reason: 'REPROVA: o pintado NAO recortou em 100.',
      );
      expect(
        DistintivoDaAba.textoDe(1000),
        '9+',
        reason: 'REPROVA: o pintado NAO recortou em 1000.',
      );

      // A regra que o portao dos cinco destinos ja cobra, reconferida COM
      // contagem: o rotulo visivel vem primeiro e literal (SC 2.5.3).
      for (final n in <int>[0, 1, 9, 10, 100, 1000]) {
        expect(
          auau.nomeAcessivelCom(n),
          startsWith(auau.rotulo),
          reason: 'REPROVA: com $n o nome acessivel nao comeca pelo rotulo '
              'visivel. Quem usa comando de voz diz "tocar em AuAu", e o '
              'casamento acontece pelo texto visivel contido no nome.',
        );
      }
    });

    test('ISCA: sem contagem o nome acessivel volta a ser o de sempre', () {
      for (final destino in CascaComAbas.destinos) {
        expect(
          destino.nomeAcessivelCom(null),
          destino.semanticsLabel,
          reason: 'REPROVA: "${destino.rotulo}" muda de nome acessivel sem '
              'haver contagem. Nulo e "ninguem contou ainda", e o reforco de '
              'significado (`${destino.reforcoAcessivel}`) nao pode sair por '
              'causa de um contador que nao existe.',
        );
        expect(
          destino.nomeAcessivelCom(0),
          destino.semanticsLabel,
          reason: 'REPROVA: "${destino.rotulo}" muda de nome acessivel com '
              'ZERO. Zero nao pinta selo, e anunciar "0 mensagens novas" '
              'gastaria a atencao de quem ouve para dizer que nao ha nada.',
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // (d) O NUMERO NAO FAZ ROTULO CORTAR, EM NENHUMA DAS CINCO LARGURAS
  //
  // COMO DESLIGAR E VER REPROVAR: em `DistintivoDaAba.build`, troque o `Stack`
  // + `Positioned` por uma `Row` com o glifo e o selo lado a lado. O selo
  // passa a disputar a largura do slot e os rotulos quebram.
  // -------------------------------------------------------------------------
  group('(d) o selo nao faz rotulo cortar', () {
    setUpAll(carregarInter);

    testWidgets('GUARDA: a fonte da bancada e a Inter REAL, e nao a sintetica',
        (tester) async {
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
            '"iiii" ($estreito). Assinatura de fonte de largura uniforme: a '
            '`Inter` NAO carregou, e as medidas deste grupo nao valem nada.',
      );
    });

    testWidgets('GUARDA: a barra medida e a do REGISTRO, com os cinco rotulos',
        (tester) async {
      await montarBarraComSelo(tester, largura: 320, naoLidas: 3);
      final pintados = tester
          .widgetList<NavigationDestination>(find.byType(NavigationDestination))
          .map((d) => d.label)
          .toSet();
      expect(
        pintados,
        larguraMedidaPelaUx.keys.toSet(),
        reason: 'REPROVA: a barra montada pinta $pintados e a tabela de '
            '27.2.1 fala de ${larguraMedidaPelaUx.keys.toSet()}. Rotulo novo '
            'sem linha na tabela passaria sem ser medido, e linha orfa '
            'manteria este grupo verde medindo algo que saiu da barra.',
      );
    });

    // UM, DOIS e TRES digitos. O teto de hoje e `9+` -- dois caracteres --, e
    // 3 digitos sao medidos de proposito: assim fica provado que a escolha de
    // `9+` e por UNIDADE DE LINGUAGEM e nao por falta de espaco. Se um dia o
    // teto subir para `99+`, estas medidas ja existem.
    for (final naoLidas in <int>[3, 42, 999]) {
      final selo = naoLidas <= 9 ? '$naoLidas' : '9+';
      for (final largura in larguras) {
        testWidgets(
            'ISCA: com $naoLidas nao lidas (selo `$selo`), nenhum rotulo corta '
            'em ${largura.toInt()} dp a 200%', (tester) async {
          await montarBarraComSelo(
            tester,
            largura: largura,
            naoLidas: naoLidas,
          );

          // A guarda do proprio caso: o selo tem de estar PINTADO, senao a
          // medida e de uma barra sem selo e o grupo aprova por vacuidade --
          // que foi exatamente como um portao desta rodada ficou verde.
          expect(
            seloPintadoNaAba(tester, 'AuAu'),
            selo,
            reason: 'REPROVA: o selo esperado (`$selo`) nao esta na barra em '
                '${largura.toInt()} dp. Sem selo, este caso mede a barra '
                'ANTIGA e aprova sem ter testado nada.',
          );

          final transbordos = medirRotulos(tester, largura);
          expect(
            transbordos,
            isEmpty,
            reason: 'REPROVA: o selo fez rotulo quebrar ou sair da barra em '
                '${largura.toInt()} dp.\n'
                '${transbordos.map((t) => '  "${t.rotulo}": ${t.linhas} '
                    'linha(s), ${t.fora.toStringAsFixed(2)} dp fora').join('\n')}\n'
                'O slot em 320 dp e de 64,00 e `Mural` ja gasta 50,90 -- '
                '13,10 dp de folga. O selo mora SOBRE o glifo justamente para '
                'nao entrar nessa disputa: `Positioned` sai do fluxo e o '
                '`Stack` toma o tamanho do icone. Um selo AO LADO do rotulo '
                'quebra `Mural` primeiro.',
          );
        });
      }
    }

    testWidgets('ISCA: o selo nao alarga o slot do `AuAu` em 320 dp',
        (tester) async {
      await montarBarraComSelo(tester, largura: 320, naoLidas: null);
      final semSelo = tester.getSize(
        find.ancestor(
          of: find.text('AuAu'),
          matching: find.byType(NavigationDestination),
        ),
      );

      await montarBarraComSelo(tester, largura: 320, naoLidas: 999);
      final comSelo = tester.getSize(
        find.ancestor(
          of: find.text('AuAu'),
          matching: find.byType(NavigationDestination),
        ),
      );

      expect(
        comSelo.width,
        semSelo.width,
        reason: 'REPROVA: o slot do `AuAu` mudou de ${semSelo.width} para '
            '${comSelo.width} dp por causa do selo. Com cinco slots num '
            '`NavigationBar`, um que cresce ENCOLHE os outros quatro -- e '
            '`Mural`, com 13,10 dp de folga, e o primeiro a quebrar. E por '
            'isso que o selo e `Positioned` e nao entra no fluxo.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (e) SEM FONTE, A ABA NAO MOSTRA ZERO NEM ERRO -- MOSTRA NADA
  //
  // COMO DESLIGAR E VER REPROVAR: em `casca_com_abas.dart`, no
  // `_naoLidasDaAba`, troque o `return null` das abas sem fonte por
  // `return contadores.mensagens ?? 0`. Ou troque o `if (naoLidas == null ||
  // naoLidas <= 0) return null` de `DistintivoDaAba.textoDe` por
  // `return '${naoLidas ?? 0}'`.
  // -------------------------------------------------------------------------
  group('(e) aba sem fonte nao mostra zero nem erro', () {
    testWidgets(
        'ISCA: com 3 mensagens, as outras QUATRO abas nao pintam selo nenhum',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 3);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );

      // A guarda: se `AuAu` nao pintasse, este caso aprovaria por nada estar
      // pintado em lugar nenhum.
      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        '3',
        reason: 'REPROVA: `AuAu` nao pintou, e sem ele este caso aprova por '
            'vacuidade -- nenhuma aba teria selo e a ausencia nas outras '
            'quatro nao provaria nada.',
      );

      for (final rotulo in <String>['Pets', 'Rede', 'Mural', 'Loja']) {
        expect(
          seloPintadoNaAba(tester, rotulo),
          isNull,
          reason: 'REPROVA: a aba "$rotulo" pintou selo. Ela NAO TEM FONTE de '
              'contagem hoje, e isto foi medido: a tabela `pets` nao tem '
              'coluna de cidade nenhuma; `network_events` e `professionals` '
              'tem `created_at` e `city` e nao tem marcador por usuario de "ja '
              'vi", nem recorte por instante na listagem; e nao existe tabela '
              'de publicacao, nem de seguir, nem rota de linha do tempo. Um '
              'selo aqui seria numero inventado.',
        );
      }
    });

    testWidgets('ISCA: sem conta, nenhuma aba pinta selo', (tester) async {
      final rede = RedeDeTeste(naoLidas: 7);
      await abrirOApp(tester, rede: rede.responder);

      for (final rotulo in larguraMedidaPelaUx.keys) {
        expect(
          seloPintadoNaAba(tester, rotulo),
          isNull,
          reason: 'REPROVA: a aba "$rotulo" pintou selo sem sessao. A barra '
              'aparece deslogada de proposito (deslogado e estado de '
              'navegacao, nao muro), e o contador fica NULO: nao ha conta de '
              'quem contar.',
        );
      }
      expect(
        rede.pedidosDeConversas,
        0,
        reason: 'REPROVA: o app pediu `GET /v1/conversations` sem sessao. A '
            'rota e `bearerAuth` e responderia 401: uma requisicao gasta para '
            'receber erro, no arranque de quem nem conta tem.',
      );
    });

    test('ISCA: ZERO nao pinta selo, e nulo tambem nao', () {
      expect(
        DistintivoDaAba.textoDe(null),
        isNull,
        reason: 'REPROVA: nulo pintou algo. Nulo e "ninguem contou ainda", e a '
            'aba sem fonte nao mostra zero nem erro -- mostra NADA.',
      );
      expect(
        DistintivoDaAba.textoDe(0),
        isNull,
        reason: 'REPROVA: zero pintou `0`. Um `0` pintado e pior que nada: ele '
            'chama o olho para dizer que nao ha motivo para olhar.',
      );
      expect(
        DistintivoDaAba.textoDe(-1),
        isNull,
        reason: 'REPROVA: numero negativo pintou algo. Nao e caso teorico: o '
            'app le `unread_count` de uma resposta, e um campo estranho nao '
            'pode virar `-1` na barra.',
      );
    });

    test('ISCA: falha de rede NAO zera o contador -- ela deixa como estava',
        () async {
      final rede = RedeDeTeste(naoLidas: 5);
      final cliente = clienteDeTesteDoContador(rede);
      final contadores = ContadoresDeNaoLido(
        ConversasApi(cliente),
        // AS PORTAS DAS TRES CONTAGENS NOVAS. Este grupo mede o contador de
        // MENSAGENS, e a rede de teste nao responde `/me/section-counters` --
        // `ContadoresApi` engole a falha e devolve nulo, entao as tres ficam em
        // nulo e nao interferem no que estes casos medem.
        secoes: ContadoresApi(cliente),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
      );
      contadores.definir(5);
      expect(contadores.mensagens, 5);

      rede.derrubar = true;
      await contadores.atualizar();

      expect(
        contadores.mensagens,
        5,
        reason: 'REPROVA: a falha virou zero. Um numero velho e mais '
            'verdadeiro que um zero inventado: zero afirmaria, para quem tem '
            'cinco recados, que nao ha nenhum.',
      );
    });

    test('ISCA: `esquecer()` devolve o contador a NULO, e nao a zero', () {
      final clienteParaEsquecer = clienteDeTesteDoContador(RedeDeTeste());
      final contadores = ContadoresDeNaoLido(
        ConversasApi(clienteParaEsquecer),
        secoes: ContadoresApi(clienteParaEsquecer),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
      );
      contadores.definir(9);
      contadores.esquecer();
      expect(
        contadores.mensagens,
        isNull,
        reason: 'REPROVA: `esquecer()` deixou zero. Zero afirmaria que a conta '
            'que acabou de sair nao tinha recado nenhum, e a aba pintaria essa '
            'afirmacao para quem nem conta tem. **Isto mede a FUNCAO**; o '
            'grupo `$grupoDaIscaDoContadorNoLogout` mede o EFEITO depois de '
            '`sair()`, que e o que a lista `limpezasAoSair` promete.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // A ISCA DO LOGOUT, cobrada pelo registro de `limpezasAoSair`
  //
  // Ela olha o EFEITO -- o que sobrou na barra -- e nao a chamada: um caso que
  // conferisse "o logout chamou `esquecer()`" ficaria verde com o furo de pe,
  // porque a chamada pode existir sobre o objeto errado. E ela sai pelo
  // CONTROLADOR e nao pelo botao: os quatro desfechos de `sair()` passam por
  // ali, inclusive o que nao tem botao nenhum (a sessao derrubada por refresh
  // recusado).
  //
  // DESLIGAR PARA VER REPROVAR: em `lib/app.dart`, tire
  // `() async => _contadores.esquecer()` da lista `limpezasAoSair`.
  // -------------------------------------------------------------------------
  group(grupoDaIscaDoContadorNoLogout, () {
    testWidgets('MEDICAO: com sessao, o contador guarda o numero da conta',
        (tester) async {
      // A medicao que justifica o grupo. Se ela falhar, a premissa mudou -- o
      // contador deixou de guardar -- e a limpeza do logout precisa ser
      // reavaliada, nao apagada: sem ela, o caso abaixo mediria a limpeza de
      // um contador que ja estava vazio, e passaria sempre.
      final rede = RedeDeTeste(naoLidas: 6);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );
      final escopo = escopoDoApp(tester);
      expect(
        escopo.contadores.mensagens,
        6,
        reason: 'A sessao abriu e o contador nao guardou o numero. Sem isso, a '
            'isca do logout nao tem o que ver desaparecer.',
      );
      expect(seloPintadoNaAba(tester, 'AuAu'), '6');
    });

    testWidgets(
        'depois de `sair()`, o numero da conta anterior nao esta em lugar '
        'nenhum -- e nao virou zero', (tester) async {
      final rede = RedeDeTeste(naoLidas: 6);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
      );
      final escopo = escopoDoApp(tester);
      expect(escopo.contadores.mensagens, 6);

      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        escopo.contadores.mensagens,
        isNull,
        reason: 'REPROVA: o contador da conta que acabou de sair sobreviveu ao '
            'logout. O numero vive enquanto o processo viver, e a proxima '
            'pessoa a usar este aparelho -- o celular da recepcao do pet shop, '
            'o do casal, o usado que acabou de ser vendido -- veria na aba '
            '`AuAu` quantos recados a anterior tinha. E NULO, nao zero: zero '
            'afirmaria que a conta nao tinha recado nenhum, e a barra pintaria '
            'essa afirmacao para quem nem conta tem.',
      );
      expect(
        seloPintadoNaAba(tester, 'AuAu'),
        isNull,
        reason: 'REPROVA: a barra continua pintando o numero da conta '
            'anterior. A barra aparece deslogada de proposito (deslogado e '
            'estado de navegacao, nao muro), e e justamente por isso que o '
            'numero nao pode ficar: ele fica VISIVEL para a proxima pessoa.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // (f) O CAMINHO DO ICONE DO APLICATIVO EXISTE, E EXERCIDO E ESTA INERTE
  //
  // COMO DESLIGAR E VER REPROVAR: em `ContadoresDeNaoLido`, apague a chamada
  // de `_anunciarAoAplicativo(valor)` dentro de `definir`.
  // -------------------------------------------------------------------------
  group('(f) o icone do aplicativo: caminho existe, e INERTE', () {
    test('ISCA: o caminho recebe o numero -- e devolve NAO APLICADO', () {
      final espiao = DistintivoEspiao();
      final clienteDoEspiao = clienteDeTesteDoContador(RedeDeTeste());
      final contadores = ContadoresDeNaoLido(
        ConversasApi(clienteDoEspiao),
        secoes: ContadoresApi(clienteDoEspiao),
        cidade: CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria()),
        distintivo: espiao,
      );

      contadores.definir(3);

      expect(
        espiao.recebidos,
        <int>[3],
        reason: 'REPROVA: o caminho do icone do aplicativo nao foi chamado com '
            'o numero. Ele existe para que o dia em que o push sair seja uma '
            'TROCA DE CLASSE e nao uma fiacao nova -- e um caminho que ninguem '
            'exerce e um caminho que ja esta quebrado.',
      );
      expect(
        contadores.ultimoDistintivoDoApp,
        ResultadoDoDistintivo.naoAplicado,
        reason: 'REPROVA: o caminho afirmou que PINTOU. Nada pinta numero no '
            'icone hoje, e as quatro razoes estao medidas em '
            '`distintivo_do_aplicativo.dart`.',
      );
    });

    test('ISCA: o padrao de producao e o INERTE, e ele nao lanca', () {
      const inerte = DistintivoInerte();
      for (final n in <int>[0, 1, 9, 10, 1000]) {
        expect(
          inerte.definir(n),
          ResultadoDoDistintivo.naoAplicado,
          reason: 'REPROVA: o inerte devolveu outra coisa em $n. Ele e a '
              'resposta HONESTA de hoje, nao um esboco -- e nao lanca de '
              'proposito: uma excecao aqui derrubaria a tela por causa de um '
              'recurso que nunca foi prometido.',
        );
      }
    });

    testWidgets('ISCA: nenhuma tela AFIRMA que a pessoa sera avisada',
        (tester) async {
      final rede = RedeDeTeste(naoLidas: 3);
      await abrirOApp(
        tester,
        rede: rede.responder,
        deposito: depositoLogado(),
        distintivoDoApp: DistintivoEspiao(),
      );

      // As frases que o defeito do `owner_notified: true` produziu, e as
      // variacoes obvias. **Nao e varredura de arquivo**: e a tela montada, e
      // e nela que a afirmacao apareceria.
      const List<String> promessas = <String>[
        'Você será avisado',
        'Voce sera avisado',
        'Você será avisada',
        'Você será notificado',
        'Avisaremos',
        'Você receberá uma notificação',
        'Te avisamos',
      ];
      for (final frase in promessas) {
        expect(
          find.textContaining(frase, findRichText: true),
          findsNothing,
          reason: 'REPROVA: a tela afirma "$frase". O envio NAO SAI: o '
              'transporte de homologacao e o que escreve em log e nao envia, a '
              'carga do push nao leva contagem nenhuma, e no iPhone do cliente '
              'o provisionamento gratuito nao tem a capacidade declarada. '
              'Houve um defeito exato desta forma neste produto -- servidor, '
              'tela e app afirmando juntos um aviso que nao saiu -- e esta '
              'isca existe para que ele nao volte por aqui.',
        );
      }
    });
  });
}
