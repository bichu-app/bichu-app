// O GERADOR DA IMAGEM DO CARTAO DA COMUNIDADE.
//
// Ele existe porque mudanca VISUAL precisa ser olhada antes de virar APK, e
// porque em 26/10/2026 um desenho ja reprovado foi reapresentado ao cliente
// justamente por ninguem ter visto nada em tela.
//
// ---------------------------------------------------------------------------
// NAO HA MECANISMO DE IMAGEM DE REFERENCIA NESTA CASA
// ---------------------------------------------------------------------------
// Medido antes de escrever uma linha: `matchesGoldenFile` tem ZERO ocorrencias
// em `app/`, e nao existe `flutter_test_config.dart` nem pasta de goldens. Os
// unicos PNG do `app/test/` sao fixtures de `test/marca/`, LIDOS por
// `png_cru.dart` e nunca comparados contra render.
//
// Entao o que este arquivo usa e o primitivo que o proprio `matchesGoldenFile`
// usa por dentro: `RenderRepaintBoundary.toImage` seguido de
// `Image.toByteData(format: ImageByteFormat.png)`.
//
// **E ele NAO e um portao, de proposito.** O nome do arquivo nao termina em
// `_test.dart`: `flutter test` nao o descobre, a suite nao muda de contagem e
// nenhuma esteira passa a comparar pixel entre maquinas -- que e exatamente
// como uma imagem de referencia costuma apodrecer (a esteira roda Linux e esta
// maquina e macOS; a mesma fonte rasteriza diferente nos dois). Quem quiser a
// imagem roda o arquivo pelo caminho:
//
//   cd app && BICHU_IMAGEM_DO_CARTAO=/caminho/absoluto/arquivo.png \
//     flutter test test/telas/gerar_imagem_do_cartao.dart
//
// ---------------------------------------------------------------------------
// TRES COISAS QUE O AMBIENTE DE TESTE ESTRAGA, E COMO CADA UMA FOI RESOLVIDA
// ---------------------------------------------------------------------------
// 1. **A FONTE.** `flutter test` troca toda familia por uma fonte de teste que
//    desenha RETANGULO no lugar de cada letra. Uma imagem assim nao mostra
//    nada a ninguem. As fontes do produto sao carregadas de
//    `assets/fonts/` por `FontLoader`, e os glifos vem do
//    `MaterialIcons-Regular.otf` do SDK -- a MESMA familia que
//    `IconeDoInscrito` e o pin usam no aparelho.
//
// 2. **A LEITURA DE ARQUIVO.** `File.readAsBytes()` (assincrono) NUNCA
//    completa sob o relogio falso do `AutomatedTestWidgetsFlutterBinding`:
//    `FontLoader.load()` fica pendurado para sempre, sem erro e sem saida.
//    Medido nesta maquina hoje. Por isso os bytes entram por
//    `readAsBytesSync` embrulhado em `Future.value`.
//
// 3. **A LOGO.** `ImagemDaRede` desenha `Image.network`, e o `flutter_test`
//    responde a QUALQUER requisicao com um PNG transparente de 1x1 -- a caixa
//    fica do tamanho certo e VAZIA, que numa imagem para o cliente leria como
//    "o cartao nao mostra a logo". Aqui um `HttpOverrides` serve um PNG
//    desenhado neste arquivo, para que o estado "com logo" apareca com algo
//    dentro.
//
// ---------------------------------------------------------------------------
// O QUE A IMAGEM NAO E
// ---------------------------------------------------------------------------
// **Nao e o aparelho dele.** E o mesmo widget, o mesmo tema e as mesmas fontes
// do produto, rasterizados pelo motor do Flutter em macOS, numa largura fixa
// de 390 dp (iPhone 14 / Pixel 7 em dp). Tamanho de fonte do sistema, tema
// escuro, densidade de pixel e recorte de tela do aparelho dele NAO estao
// nesta imagem.

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/theme/bichu_colors.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// A largura util da tela, em dp. 390 e a de um iPhone 14 e de um Pixel 7.
const double _larguraDaTela = 390;

/// A URL que o estado "com logo" usa. O `HttpOverrides` abaixo responde a
/// qualquer URL, e esta existe so para `logoUrl` nao ser nulo.
const String _urlDaLogo =
    'https://midia.bichu.app/directory-logo/sm/exemplo.jpeg';

Future<ByteData> _bytesDe(String caminho) {
  final arquivo = File(caminho);
  if (!arquivo.existsSync()) {
    throw StateError(
      'REPROVA: nao achei a fonte "$caminho" a partir de '
      '"${Directory.current.path}". Sem ela a imagem sai com retangulos no '
      'lugar das letras, e uma imagem assim nao mostra nada a ninguem.',
    );
  }
  final bytes = arquivo.readAsBytesSync();
  // `readAsBytesSync`, e NAO `readAsBytes`: ver o item 2 da prosa do topo.
  return Future<ByteData>.value(
    ByteData.view(Uint8List.fromList(bytes).buffer),
  );
}

/// Carrega as fontes do produto e a familia de glifos do SDK.
Future<void> _carregarAsFontes() async {
  final raizDoSdk = Platform.environment['FLUTTER_ROOT'];
  if (raizDoSdk == null || raizDoSdk.isEmpty) {
    throw StateError(
      'REPROVA: `FLUTTER_ROOT` nao esta no ambiente. `flutter test` sempre a '
      'define; sem ela nao da para achar `MaterialIcons-Regular.otf`, e o pin '
      'do mapa sairia como um quadrado na imagem.',
    );
  }

  final deIcones = FontLoader('MaterialIcons')
    ..addFont(_bytesDe(
      '$raizDoSdk/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
    ));
  await deIcones.load();

  final inter = FontLoader('Inter');
  for (final peso in <String>['Regular', 'Medium', 'SemiBold', 'Bold']) {
    inter.addFont(_bytesDe('assets/fonts/Inter-$peso.ttf'));
  }
  await inter.load();

  final jakarta = FontLoader('Plus Jakarta Sans');
  for (final peso in <String>['Bold', 'ExtraBold']) {
    jakarta.addFont(_bytesDe('assets/fonts/PlusJakartaSans-$peso.ttf'));
  }
  await jakarta.load();
}

/// Um PNG desenhado aqui, para fazer as vezes da logo de um estabelecimento.
///
/// **Nao e a marca de ninguem**: e um quadrado com as iniciais, so para o
/// estado "com logo" nao aparecer vazio. Desenhado em vez de embarcado porque
/// um arquivo novo em `assets/` entraria no binario do app.
Future<Uint8List> _pngDaLogo() async {
  const double lado = 168; // 56 dp x 3
  final gravador = ui.PictureRecorder();
  final tela = Canvas(gravador);
  tela.drawRect(
    const Rect.fromLTWH(0, 0, lado, lado),
    Paint()..color = const Color(0xFF2E6E5B),
  );
  final texto = TextPainter(
    text: const TextSpan(
      text: 'SB',
      style: TextStyle(
        color: Color(0xFFFFFFFF),
        fontSize: 64,
        fontFamily: 'Inter',
        fontWeight: FontWeight.w700,
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();
  texto.paint(
    tela,
    Offset((lado - texto.width) / 2, (lado - texto.height) / 2),
  );
  final imagem = await gravador.endRecording().toImage(lado.toInt(), lado.toInt());
  final dados = await imagem.toByteData(format: ui.ImageByteFormat.png);
  return dados!.buffer.asUint8List();
}

class _RedeDaLogo extends HttpOverrides {
  _RedeDaLogo(this.bytes);
  final Uint8List bytes;
  @override
  HttpClient createHttpClient(SecurityContext? contexto) =>
      _ClienteDaLogo(bytes);
}

class _ClienteDaLogo extends Fake implements HttpClient {
  _ClienteDaLogo(this.bytes);
  final Uint8List bytes;
  @override
  bool autoUncompress = true;
  @override
  Duration? connectionTimeout;
  @override
  Duration idleTimeout = const Duration(seconds: 15);
  @override
  int? maxConnectionsPerHost;
  @override
  String? userAgent;
  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _PedidoDaLogo(bytes);
  @override
  Future<HttpClientRequest> openUrl(String metodo, Uri url) async =>
      _PedidoDaLogo(bytes);
  @override
  void close({bool force = false}) {}
}

class _PedidoDaLogo extends Fake implements HttpClientRequest {
  _PedidoDaLogo(this.bytes);
  final Uint8List bytes;
  @override
  final HttpHeaders headers = _CabecalhosMudos();
  @override
  Future<HttpClientResponse> close() async => _RespostaDaLogo(bytes);
}

class _CabecalhosMudos extends Fake implements HttpHeaders {
  @override
  void add(String nome, Object valor, {bool preserveHeaderCase = false}) {}
  @override
  void set(String nome, Object valor, {bool preserveHeaderCase = false}) {}
}

class _RespostaDaLogo extends Fake implements HttpClientResponse {
  _RespostaDaLogo(this.bytes);
  final Uint8List bytes;
  @override
  int get statusCode => 200;
  @override
  int get contentLength => bytes.length;
  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;
  @override
  HttpHeaders get headers => _CabecalhosMudos();
  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> evento)? aoDado, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) {
    return Stream<List<int>>.fromIterable(<List<int>>[bytes]).listen(
      aoDado,
      onError: onError,
      onDone: onDone,
      cancelOnError: cancelOnError,
    );
  }
}

EntradaDoDiretorio _entrada({
  required String slug,
  required String nome,
  AtividadeDoDiretorio? atividade = AtividadeDoDiretorio.clinic,
  String? bairro = 'Pinheiros',
  String? telefone = '+5511987654321',
  String? logo,
}) {
  return EntradaDoDiretorio(
    slug: slug,
    atividade: atividade,
    nome: nome,
    verificacao: const VerificacaoDaEntrada(
      nivel: NivelDeVerificacao.documento,
      provas: <TipoDeProva>[],
    ),
    cidade: 'São Paulo',
    estado: 'SP',
    bairro: bairro,
    telefoneE164: telefone,
    logoUrl: logo,
  );
}

/// Um estado do cartao, com a legenda que diz o que ele e.
class _Estado extends StatelessWidget {
  const _Estado({required this.legenda, required this.entrada});

  final String legenda;
  final EntradaDoDiretorio entrada;

  @override
  Widget build(BuildContext context) {
    final cores = BichuColors.of(context).cores;
    return Padding(
      padding: const EdgeInsets.only(bottom: BichuEspaco.e6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            legenda.toUpperCase(),
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.8,
              color: cores.textSecondary,
            ),
          ),
          const SizedBox(height: BichuEspaco.e2),
          // `aoTocar` VAZIO, e e o unico valor correto aqui: este arquivo
          // GERA IMAGEM do cartao e nao mede toque nenhum.
          //
          // NA UNIAO DE 27/10: o parametro virou `required` no #76 (com a lista
          // respondendo 200 sem conta, o destino do toque passou a depender de
          // haver conta, e quem decide e a tela). Este helper veio do #64, que
          // nao sabia disso. Nenhuma das duas branches reprova sozinha -- so a
          // uniao expoe, e o `flutter analyze` a pegou.
          CartaoDoDiretorio(entrada: entrada, aoTocar: () {}),
        ],
      ),
    );
  }
}

void main() {
  testWidgets('gera a imagem do cartao da listagem da Comunidade',
      (tester) async {
    final destino = Platform.environment['BICHU_IMAGEM_DO_CARTAO'];
    if (destino == null || destino.isEmpty) {
      throw StateError(
        'REPROVA: defina `BICHU_IMAGEM_DO_CARTAO` com o caminho ABSOLUTO do '
        'PNG a escrever. Este arquivo so existe para produzir a imagem; sem '
        'destino ele nao tem o que fazer, e ficar verde sem escrever nada '
        'seria exatamente a aparencia de sucesso que ele existe para evitar.',
      );
    }

    await _carregarAsFontes();

    late Uint8List pngDaLogo;
    await tester.runAsync(() async {
      pngDaLogo = await _pngDaLogo();
    });
    HttpOverrides.global = _RedeDaLogo(pngDaLogo);
    addTearDown(() => HttpOverrides.global = null);

    final chave = GlobalKey();
    // OS ESTADOS, ESCOLHIDOS PELO PIOR CASO E NAO PELO BONITO.
    //
    // O arranjo e o de DUAS LINHAS, escolhido pelo cliente em 26/10/2026
    // depois de ver os tres desenhados lado a lado. Aqui o bairro tem a coluna
    // INTEIRA (258 dp a 390 dp), entao a largura do segmento nao o limita e
    // nao existe "cabe / nao cabe" -- o que existe e "quebra em mais linhas",
    // e nunca corte.
    //
    // Os nomes de bairro sao brasileiros de verdade, e nao `aaaa...`: os
    // longos daqui se parecem no COMECO (`Jardim ...`, `Vila ...`, `Conjunto
    // Habitacional ...`), e foi isso que fez a variante do CORTE ser recusada.
    final estados = <_Estado>[
      _Estado(
        legenda: 'Com logo e com bairro — o caso comum',
        entrada: _entrada(
          slug: 'clinica-centro',
          nome: 'Clínica Santa Bárbara',
          bairro: 'Centro',
          logo: _urlDaLogo,
        ),
      ),
      _Estado(
        legenda: 'Sem logo — o glifo do tipo ocupa o lugar',
        entrada: _entrada(
          slug: 'sem-logo',
          nome: 'Veterinário do Bairro',
          atividade: AtividadeDoDiretorio.vet,
          bairro: 'Pinheiros',
        ),
      ),
      _Estado(
        legenda: 'Bairro de 22 caracteres — uma linha, inteiro',
        entrada: _entrada(
          slug: 'bairro-longo',
          nome: 'Hospedagem da Ana',
          atividade: AtividadeDoDiretorio.sitter,
          bairro: 'Jardim Chácara Inglesa',
          logo: _urlDaLogo,
        ),
      ),
      _Estado(
        legenda: 'Bairro de 37 caracteres — quebra em duas, sem cortar',
        entrada: _entrada(
          slug: 'extremo',
          nome: 'Veterinário do Bairro',
          atividade: AtividadeDoDiretorio.vet,
          bairro: 'Conjunto Habitacional Teotônio Vilela',
          logo: _urlDaLogo,
        ),
      ),
      _Estado(
        legenda: 'Sem bairro — não há linha, e não há pin órfão',
        entrada: _entrada(
          slug: 'sem-bairro',
          nome: 'Clínica Santa Bárbara',
          bairro: null,
          logo: _urlDaLogo,
        ),
      ),
      _Estado(
        legenda: 'Nome longo — quebra, e a logo continua centrada no bloco',
        entrada: _entrada(
          slug: 'nome-longo',
          nome: 'Clínica Veterinária e Hospital de Especialidades '
              'Santa Bárbara de Pinheiros',
          bairro: 'Vila Nova Conceição',
          logo: _urlDaLogo,
        ),
      ),
    ];

    // A SUPERFICIE PRECISA CABER A COLUNA INTEIRA. O padrao do `flutter test`
    // e 800x600, e com ele a coluna dos cinco estados ESTOURA por 490 px: a
    // imagem sai cortada e o arquivo e escrito assim mesmo. Medido nesta
    // maquina hoje, e e por isso que a altura esta aqui e nao num
    // `MediaQuery` -- `MediaQuery` muda o que a arvore LE, nao o tamanho da
    // janela em que ela e disposta.
    tester.view.physicalSize = const Size(_larguraDaTela * 3, 1600 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    final tema = BichuTheme.claro;
    await tester.pumpWidget(
      MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: tema,
        home: Builder(
          builder: (context) => Align(
          alignment: Alignment.topCenter,
          child: RepaintBoundary(
            key: chave,
            child: Material(
              color: tema.scaffoldBackgroundColor,
              child: SizedBox(
                width: _larguraDaTela,
                child: Padding(
                  // O mesmo recheio que a `ListaDoDiretorio` usa em volta dos
                  // cartoes.
                  padding: const EdgeInsets.all(BichuEspaco.e4),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      // O TITULO ESTA DENTRO DA IMAGEM, e nao so no nome do
                      // arquivo: duas imagens parecidas sem rotulo dentro
                      // delas viram duas imagens trocadas na conversa.
                      Text(
                        Platform.environment['BICHU_TITULO_DO_CARTAO'] ??
                            'Cartão da listagem da Comunidade',
                        style: TextStyle(
                          fontFamily: 'Plus Jakarta Sans',
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: BichuColors.of(context).cores.textPrimary,
                        ),
                      ),
                      const SizedBox(height: BichuEspaco.e5),
                      ...estados,
                    ],
                  ),
                ),
              ),
              ),
            ),
          ),
        ),
      ),
    );

    // A logo chega por E/S de verdade: ela so resolve dentro de `runAsync`.
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 400));
    });
    await tester.pumpAndSettle();

    // UM ESTOURO DE LAYOUT NAO PODE VIRAR ARQUIVO. Antes desta linha o
    // gerador escrevia o PNG CORTADO e so depois morria no estouro -- o
    // arquivo ficava no disco, com cara de entrega.
    final estouro = tester.takeException();
    if (estouro != null) {
      throw StateError(
        'REPROVA: a arvore estourou antes da captura ($estouro). A imagem '
        'sairia cortada, e imagem cortada e pior que imagem nenhuma: ela '
        'parece entrega.',
      );
    }

    Uint8List? png;
    await tester.runAsync(() async {
      final limite =
          chave.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      final imagem = await limite.toImage(pixelRatio: 3);
      final dados = await imagem.toByteData(format: ui.ImageByteFormat.png);
      png = dados!.buffer.asUint8List();
    });

    // O GUARDA CONTRA ESCREVER UM ARQUIVO VAZIO OU BRANCO. Um PNG de poucos
    // KB nesta area e tela em branco, e tela em branco e o jeito mais facil de
    // este arquivo mentir: ele escreveria o arquivo, sairia verde, e o cliente
    // olharia para nada.
    if (png == null || png!.length < 20000) {
      throw StateError(
        'REPROVA: o PNG saiu com ${png?.length ?? 0} bytes. Nesta area isso e '
        'tela em branco ou quase, e escrever o arquivo assim seria entregar '
        'uma imagem que nao mostra o cartao.',
      );
    }

    File(destino).writeAsBytesSync(png!);
    // ignore: avoid_print
    print('IMAGEM ESCRITA: $destino (${png!.length} bytes)');
  });
}
