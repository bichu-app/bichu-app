// A LOGO na lista do `Perto` e a FOTO na pagina do local, **pintadas**.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual linha mexer e o que observar.
//
// ---------------------------------------------------------------------------
// POR QUE ESTES CASOS NAO OLHAM PIXEL
// ---------------------------------------------------------------------------
// Teste de widget nao baixa imagem: o `flutter_test` troca o cliente HTTP por
// um que responde 400 a tudo. Isso nao e limitacao aqui -- e **metade do
// valor**: toda `Image.network` desta arvore cai no `errorBuilder` durante o
// teste, entao um `errorBuilder` ausente apareceria como excecao e um
// `errorBuilder` presente aparece como o estado de falha desenhado. O caso (d)
// mede exatamente isso.
//
// O resto e medido na ARVORE DE WIDGETS, lendo o `ImageProvider` que a tela
// montou: e la que mora a URL pedida e o `cacheWidth` pedido, e as duas sao as
// coisas que uma captura de tela nao mostraria.
//
// **Nada aqui foi visto em aparelho.** Nenhum caso deste arquivo afirma que a
// imagem ficou bonita; eles afirmam qual URL foi pedida, com que largura de
// decodificacao, e que nenhuma ausencia derruba a tela.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A massa, no formato exato do contrato
// ---------------------------------------------------------------------------

/// A URL de uma DERIVADA, na forma que o servidor monta:
/// `{categoria}/{thumb|card|banner}/{nome}.{ext}`.
const String logoDerivada =
    'https://midia.bichu.app/directory-logo/thumb/a1b2c3d4e5f6.jpeg';

const String fotoDerivada =
    'https://midia.bichu.app/directory-photo/banner/f6e5d4c3b2a1.jpeg';

/// A chave de um ORIGINAL, que **nunca** pode ser pintada.
///
/// Ela existe na massa de proposito: o servidor promete nunca mandar original
/// em resposta de leitura, e o jeito de provar que o APP nao a pinta e colocar
/// uma ao lado da derivada e medir qual das duas chegou na tela. Sem este
/// campo na massa, um app que lesse a chave errada passaria por nao haver
/// chave errada para ler.
const String urlDoOriginal =
    'https://privado.bichu.app/directory-logo/original/foto-da-camera.heic';

Map<String, dynamic> _entrada({
  required String slug,
  required String nome,
  String? logoUrl,
  bool comCampoDeOriginal = false,
}) {
  return <String, dynamic>{
    'slug': slug,
    'kind': 'clinic',
    'display_name': nome,
    'city': 'São Paulo',
    'state': 'SP',
    'neighborhood': 'Pinheiros',
    'about': null,
    'phone_e164': null,
    'verification': <String, dynamic>{
      'level': 'document_verified',
      'evidence_kinds': <String>['cnpj'],
    },
    'distance_m': null,
    'logo_url': ?logoUrl,
    // Um campo que o contrato NAO declara, para medir que o app nao o le.
    if (comCampoDeOriginal) 'original_url': urlDoOriginal,
  };
}

Map<String, dynamic> _pagina(List<Map<String, dynamic>> itens) {
  return <String, dynamic>{
    'items': itens,
    'page': 1,
    'limit': 20,
    'total': itens.length,
    'distance_available': false,
    'applied_filters': <String, String>{'scope': 'all'},
  };
}

Map<String, dynamic> _detalhe({
  String slug = 'clinica-santa-barbara',
  String nome = 'Clínica Santa Bárbara',
  String? fotoUrl,
  String? logoUrl,
  bool comCampoDeOriginal = false,
}) {
  return <String, dynamic>{
    'slug': slug,
    'kind': 'clinic',
    'display_name': nome,
    'city': 'São Paulo',
    'state': 'SP',
    'neighborhood': 'Pinheiros',
    'about': 'Atende cão e gato.',
    'phone_e164': null,
    'verification': <String, dynamic>{
      'level': 'document_verified',
      'evidence_kinds': <String>['cnpj'],
    },
    // `rating` e OBRIGATORIO em `DirectoryEntryDetail`, e um nulo aqui
    // reprova na porta (`PontuacaoDoLocal.doJson`) antes de a tela existir --
    // que e o certo: resposta fora do contrato nao deve chegar a pintura.
    'rating': <String, dynamic>{
      'count': 0,
      'average': null,
      'histogram': <String, int>{'1': 0, '2': 0, '3': 0, '4': 0, '5': 0},
    },
    'can_review': false,
    'review_blocked_reason': null,
    'my_review_ref': null,
    'distance_m': null,
    'photo_url': ?fotoUrl,
    'logo_url': ?logoUrl,
    if (comCampoDeOriginal) 'original_url': urlDoOriginal,
  };
}

Map<String, dynamic> _semAvaliacoes() {
  return <String, dynamic>{
    'items': <Map<String, dynamic>>[],
    'page': 1,
    'limit': 10,
    'total': 0,
  };
}

/// A rede do diretorio: a listagem, o detalhe e as avaliacoes. **404 no
/// resto**, para um caso que dependa de rota nao declarada falhar alto.
Future<http.Response> Function(http.Request) _rede({
  Map<String, dynamic>? listagem,
  Map<String, dynamic>? detalhe,
}) {
  return (req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(listagem ?? _pagina(const <Map<String, dynamic>>[]));
    }
    if (caminho.endsWith('/reviews') && req.method == 'GET') {
      return json200(_semAvaliacoes());
    }
    if (caminho.startsWith('/v1/directory/entries/') && req.method == 'GET') {
      if (detalhe == null) return problema('not-found', 404);
      return json200(detalhe);
    }
    return problema('not-found', 404);
  };
}

Future<void> _abrirOPerto(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
}) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  // **O CAMINHO MUDOU EM 19/10/2026: `Rede` -> aba `Comunidade`.** A secao
  // `Perto` deixou de existir, e o diretorio virou a aba `Comunidade` da
  // `Rede`.
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
  await tester.tap(
    find.widgetWithText(Tab, AbaDaSecaoRede.comunidade.rotulo),
  );
  await tester.pumpAndSettle();
}

// ---------------------------------------------------------------------------
// A LEITURA DA ARVORE: qual URL foi pedida, e com que largura
// ---------------------------------------------------------------------------

/// A URL que uma [Image] de fato pediu, **desembrulhando o `ResizeImage`**.
///
/// `Image.network(..., cacheWidth: n)` nao guarda um `NetworkImage`: ele
/// guarda um `ResizeImage` POR CIMA de um. Um teste que olhasse `image is
/// NetworkImage` daria falso justamente nas imagens que respeitam o
/// `cacheWidth` -- isto e, exatamente nas corretas.
String urlPedidaPor(Image imagem) {
  final provedor = imagem.image;
  if (provedor is ResizeImage) {
    final interno = provedor.imageProvider;
    if (interno is NetworkImage) return interno.url;
    throw StateError(
      'REPROVA: o `ResizeImage` desta tela embrulha um '
      '${interno.runtimeType}, e nao um `NetworkImage`. Este arquivo mede a '
      'URL pedida; sem um `NetworkImage` nao ha URL para medir.',
    );
  }
  if (provedor is NetworkImage) {
    throw StateError(
      'REPROVA: a imagem foi pedida SEM `cacheWidth` -- o provedor e um '
      '`NetworkImage` cru, sem `ResizeImage` por cima. O custo em memoria '
      'passa a ser o do ARQUIVO (1280 x 720 x 4 = 3,52 MiB na faixa do local) '
      'e nao o do espaco pintado. O conserto e `ImagemDaRede`, em '
      '`app/lib/widgets/imagem_da_rede.dart`.',
    );
  }
  throw StateError(
    'REPROVA: provedor de imagem inesperado (${provedor.runtimeType}).',
  );
}

/// A largura de decodificacao que a tela pediu, em pixeis do aparelho.
int cacheWidthDe(Image imagem) {
  final provedor = imagem.image;
  if (provedor is! ResizeImage) {
    throw StateError(
      'REPROVA: sem `ResizeImage`, nao houve `cacheWidth`. Ver '
      '`urlPedidaPor`.',
    );
  }
  final largura = provedor.width;
  if (largura == null) {
    throw StateError(
      'REPROVA: o `ResizeImage` veio sem largura (so com altura). O que o '
      'decodificador precisa saber e a LARGURA pintada.',
    );
  }
  return largura;
}

/// Todas as [Image] de rede que [de] contem, na ordem da arvore.
List<Image> imagensDeRedeEm(Finder de) {
  return find
      .descendant(of: de, matching: find.byType(Image))
      .evaluate()
      .map((e) => e.widget as Image)
      .where((img) {
        final p = img.image;
        return p is NetworkImage ||
            (p is ResizeImage && p.imageProvider is NetworkImage);
      })
      .toList(growable: false);
}

void main() {
  // -------------------------------------------------------------------------
  group('a logo na lista do `Perto`', () {
    // -----------------------------------------------------------------------
    testWidgets('a entrada COM logo desenha a logo ao lado do nome',
        (tester) async {
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(slug: 'a', nome: 'Clínica A', logoUrl: logoDerivada),
          ]),
        ),
      );

      final cartao = find.byType(CartaoDoDiretorio);
      expect(cartao, findsOneWidget);

      final imagens = imagensDeRedeEm(cartao);
      expect(
        imagens,
        hasLength(1),
        reason: 'REPROVA: o cartao nao desenhou exatamente uma imagem de rede. '
            'A logo entrou no contrato em 18/10 (`DirectoryEntrySummary.'
            'logo_url`) e o cliente liberou a pintura; duas imagens aqui '
            'significariam a FAIXA do local tambem na lista, que e a conta de '
            '65 MiB em vinte cartoes.',
      );

      // O nome continua desenhado: a logo entrou AO LADO dele, e nao no lugar.
      expect(find.text('Clínica A'), findsOneWidget);
    });

    testWidgets(
        'ISCA — a URL pintada e a DERIVADA, e o original nao e alcancado',
        (tester) async {
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(
              slug: 'a',
              nome: 'Clínica A',
              logoUrl: logoDerivada,
              // O original esta na massa, ao lado da derivada.
              comCampoDeOriginal: true,
            ),
          ]),
        ),
      );

      final pintada = urlPedidaPor(imagensDeRedeEm(
        find.byType(CartaoDoDiretorio),
      ).single);

      // ISCA: trocar `logoUrl: urlDeImagem(json['logo_url'])` por
      // `json['original_url']` em `EntradaDoDiretorio.doJson`
      // (`app/lib/api/modelos_diretorio.dart`) compila e enche a tela com uma
      // imagem. Este par de `expect` reprova.
      expect(
        pintada,
        logoDerivada,
        reason: 'REPROVA: a URL pintada nao e a derivada que `logo_url` '
            'trouxe. O app NAO monta URL de imagem: ele pinta, byte a byte, o '
            'campo do contrato.',
      );
      expect(
        pintada,
        isNot(contains('original')),
        reason: 'REPROVA: a tela pediu uma chave de ORIGINAL. O original mora '
            'no armazenamento privado, nunca e servido a cliente nenhum, e '
            'nem o leitor de midia publica o abre. Se ele chegou a uma '
            '`Image.network`, alguem leu o campo errado da resposta.',
      );
    });

    testWidgets('o `cacheWidth` segue o espaco PINTADO, e nao o arquivo',
        (tester) async {
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(slug: 'a', nome: 'Clínica A', logoUrl: logoDerivada),
          ]),
        ),
      );

      final imagem =
          imagensDeRedeEm(find.byType(CartaoDoDiretorio)).single;
      final fator = tester.view.devicePixelRatio;
      final esperado = (BichuMoldura.larguraFotoSm * fator).round();

      expect(
        cacheWidthDe(imagem),
        esperado,
        reason: 'REPROVA: o `cacheWidth` da logo e '
            '${cacheWidthDe(imagem)} px, e o quadrado pintado tem '
            '${BichuMoldura.larguraFotoSm} dp a ${fator}x, ou $esperado px. O '
            'numero tem de sair do ESPACO, e nao da resolucao do arquivo: a '
            'derivada `thumb` da logo e 176 x 176, e decodificar 176 px para '
            'pintar 56 dp num aparelho 1x cobra o triplo do necessario em '
            'cada cartao da listagem.',
      );
    });

    testWidgets(
        'ISCA — entrada SEM logo nao quebra a lista, e a pagina MISTA '
        'projeta inteira e na ordem', (tester) async {
      // Seis entradas, alternando com e sem logo. **Mista, e nao duas listas
      // homogeneas**: uma lista toda sem logo passaria com a pintura
      // quebrada, e uma toda com logo passaria com a ausencia quebrada. O
      // defeito real desta classe aparece quando as duas convivem -- e
      // `Image.network('')` LANCA, entao uma string vazia numa das seis
      // derrubaria a listagem inteira, e nao um cartao.
      final massa = <Map<String, dynamic>>[
        _entrada(slug: 'e-1', nome: 'Entrada 1', logoUrl: logoDerivada),
        // Sem o campo: o APK publicado le respostas que nao o conhecem.
        _entrada(slug: 'e-2', nome: 'Entrada 2'),
        // Explicitamente nulo: o contrato declara `logo_url` anulavel.
        <Map<String, dynamic>>[
          _entrada(slug: 'e-3', nome: 'Entrada 3'),
        ].single
          ..['logo_url'] = null,
        // String VAZIA: o caso que lanca. `urlDeImagem` a trata como nulo.
        <Map<String, dynamic>>[
          _entrada(slug: 'e-4', nome: 'Entrada 4'),
        ].single
          ..['logo_url'] = '   ',
        // Tipo ERRADO: `as String?` cru estouraria aqui.
        <Map<String, dynamic>>[
          _entrada(slug: 'e-5', nome: 'Entrada 5'),
        ].single
          ..['logo_url'] = 42,
        _entrada(slug: 'e-6', nome: 'Entrada 6', logoUrl: logoDerivada),
      ];

      await _abrirOPerto(tester, rede: _rede(listagem: _pagina(massa)));

      // (1) A LISTA INTEIRA, e na ordem da resposta. Seis cartoes: nenhuma
      // das quatro ausencias apagou um cartao, e nenhuma delas derrubou a
      // tela.
      final nomes = find
          .byType(CartaoDoDiretorio)
          .evaluate()
          .map((e) => (e.widget as CartaoDoDiretorio).entrada.nome)
          .toList(growable: false);
      expect(
        nomes,
        <String>[
          'Entrada 1',
          'Entrada 2',
          'Entrada 3',
          'Entrada 4',
          'Entrada 5',
          'Entrada 6',
        ],
        reason: 'REPROVA: a pagina mista nao projetou as seis entradas na '
            'ordem da resposta. Quatro delas tem `logo_url` ausente, nulo, '
            'vazio ou de outro tipo -- e nenhum desses quatro e erro: sao os '
            'estados normais de uma entrada sem logo, de uma logo ainda em '
            'processamento e de uma logo recusada nos bytes.',
      );

      // (2) EXATAMENTE DUAS imagens de rede, as das duas entradas que tem
      // logo. Mais que duas significa que a tela inventou imagem para quem
      // nao tem -- que e o quadro vazio que o cartao sem logo NAO desenha.
      expect(
        imagensDeRedeEm(find.byType(ListaDoDiretorio)),
        hasLength(2),
        reason: 'REPROVA: a tela montou numero de imagens de rede diferente '
            'de dois numa pagina com duas logos. Cartao sem logo desenha o '
            'nome na largura inteira, e nao um quadro cinza.',
      );

      // (3) E as quatro entradas sem logo nao tem `ImagemDaRede` nenhuma.
      expect(
        find.byType(ImagemDaRede),
        findsNWidgets(2),
        reason: 'REPROVA: ha `ImagemDaRede` para entrada sem logo. A decisao '
            'de desenhar ou nao e do CARTAO (ele le o nulo), e nao da peca de '
            'imagem -- ela recebe `url` nao anulavel justamente para nao '
            'haver um segundo lugar que decida isso.',
      );
    });

    testWidgets('ISCA — a logo fica FORA da semantica do cartao',
        (tester) async {
      // A recomendacao e do autor do servidor e eu a endosso com medicao: a
      // logo esta AO LADO do nome, o nome ja e o rotulo da entrada, e uma
      // logo rotulada faria o leitor de tela anunciar o nome duas vezes na
      // mesma parada de foco.
      //
      // ISCA: trocar `descricao: null` por `descricao: entrada.nome` em
      // `lista_do_diretorio.dart` compila e parece melhorar a
      // acessibilidade. Este caso reprova.
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(slug: 'a', nome: 'Clínica A', logoUrl: logoDerivada),
          ]),
        ),
      );

      final logo = find.byType(ImagemDaRede);
      expect(logo, findsOneWidget);

      // (1) A DECISAO, declarada: `descricao` nula e o que `ImagemDaRede`
      // traduz em `ExcludeSemantics`.
      expect(
        tester.widget<ImagemDaRede>(logo).descricao,
        isNull,
        reason: 'REPROVA: a logo do cartao recebeu rotulo. Ela fica ao lado '
            'do nome, o nome e o rotulo da entrada, e `descricao: null` e o '
            'que a declara decorativa.',
      );

      // (2) E O EFEITO, medido: o nome e dito **uma** vez. Esta e a
      // asserção que carrega o caso -- a logo esta DENTRO do
      // `MergeSemantics` do cartao, entao um rotulo nela nao criaria uma
      // parada de foco nova: ele entraria no rotulo do cartao, e o leitor de
      // tela diria o nome duas vezes na mesma parada.
      //
      // O no e lido a partir do TEXTO do nome, e nao do tipo do cartao:
      // `CartaoDoDiretorio` e um `Container` e nao publica no proprio -- quem
      // publica e o `MergeSemantics` logo abaixo dele, e pedir o no do
      // Container devolve o da rota, com rotulo vazio.
      final semantica = tester.getSemantics(find.text('Clínica A'));
      final quantas = 'Clínica A'
          .allMatches(semantica.label)
          .length;
      expect(
        quantas,
        1,
        reason: 'REPROVA: o nome aparece $quantas vezes no rotulo da '
            'semantica do cartao ("${semantica.label}"). Uma vez e o certo: '
            'o cartao e UMA parada de foco e o nome e o rotulo dela.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('a foto na pagina do local', () {
    // -----------------------------------------------------------------------
    Future<void> abrirOLocal(
      WidgetTester tester, {
      required Map<String, dynamic> detalhe,
    }) async {
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(
              slug: detalhe['slug'] as String,
              nome: detalhe['display_name'] as String,
            ),
          ]),
          detalhe: detalhe,
        ),
      );
      await tester.tap(
        find
            .descendant(
              of: find.byType(CartaoDoDiretorio),
              matching: find.byType(InkWell),
            )
            .first,
      );
      await tester.pumpAndSettle();
      expect(
        find.byType(PaginaDoLocal),
        findsOneWidget,
        reason: 'REPROVA: a pagina do local nao abriu. Sem ela na arvore, os '
            'casos deste grupo passariam por nao ter o que medir.',
      );
    }

    testWidgets('a faixa 16:9 desenha a DERIVADA, e so ela', (tester) async {
      await abrirOLocal(
        tester,
        detalhe: _detalhe(fotoUrl: fotoDerivada, comCampoDeOriginal: true),
      );

      final imagens = imagensDeRedeEm(find.byType(PaginaDoLocal));
      expect(
        imagens,
        hasLength(1),
        reason: 'REPROVA: a pagina do local nao desenhou exatamente uma '
            'imagem de rede. A faixa e uma; o `logo_url` do DETALHE segue '
            'sem pintura nesta entrega, de proposito -- o pedido eram tres '
            'pinturas, e esta nao e uma delas.',
      );

      final pintada = urlPedidaPor(imagens.single);
      expect(pintada, fotoDerivada);
      expect(
        pintada,
        isNot(contains('original')),
        reason: 'REPROVA: a faixa pediu uma chave de ORIGINAL.',
      );

      // A proporcao e a da derivada `banner` (16:9). Recortar em outra
      // proporcao deixaria tarja.
      final caixa = tester.getSize(find.byType(ImagemDaRede));
      expect(
        caixa.width / caixa.height,
        closeTo(16 / 9, 0.01),
        reason: 'REPROVA: a faixa nao esta em 16:9 (${caixa.width} x '
            '${caixa.height}). A derivada `banner` do contrato e 1280 x 720, '
            'e desenhar em outra proporcao recorta o que o servidor cortou.',
      );

      // E o `cacheWidth` segue a largura pintada.
      final fator = tester.view.devicePixelRatio;
      expect(
        cacheWidthDe(imagens.single),
        (caixa.width * fator).round(),
        reason: 'REPROVA: o `cacheWidth` da faixa nao e a largura pintada em '
            'pixeis. Sem ele, a faixa custa os 1280 x 720 x 4 = 3,52 MiB do '
            'arquivo em QUALQUER aparelho.',
      );
    });

    testWidgets('ISCA — local SEM foto nao tem faixa vazia', (tester) async {
      await abrirOLocal(tester, detalhe: _detalhe());

      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason: 'REPROVA: a pagina desenhou o lugar da faixa num local SEM '
            'foto. `photo_url` e nulo em tres casos normais -- sem foto, '
            'ainda processando, recusada nos bytes -- e a pagina abre no '
            'nome, exatamente como antes de a foto existir. Um retangulo '
            'cinza de 16:9 no topo ensinaria que a foto vem.',
      );

      // E a pagina continua inteira: o nome, a secao de informacoes e o
      // `about` estao todos la.
      expect(find.text('Clínica Santa Bárbara'), findsWidgets);
      expect(find.text('Atende cão e gato.'), findsWidgets);
    });

    testWidgets('a faixa NAO entra na lista: a decisao e medida',
        (tester) async {
      // Vinte entradas, todas com foto do lugar na massa. A LISTAGEM nao
      // declara `photo_url` no contrato, e este caso prova que nem uma
      // resposta que o trouxesse faria a lista desenhar a faixa: `projetar
      // Entrada` nao conhece a foto, e `EntradaDoDiretorio` nao tem o campo.
      //
      // A conta que sustenta a decisao: 20 faixas a 412 dp e 3x custam
      // 20 x 3,28 MiB = 65,6 MiB de imagem decodificada (70,4 MiB sem
      // `cacheWidth`). A vitrine da `Loja` chegou a 9,8 MB de primeira
      // pintura por menos que isso.
      final massa = <Map<String, dynamic>>[
        for (var i = 1; i <= 20; i++)
          <Map<String, dynamic>>[
            _entrada(slug: 'e-$i', nome: 'Entrada $i'),
          ].single
            ..['photo_url'] = fotoDerivada,
      ];

      await _abrirOPerto(tester, rede: _rede(listagem: _pagina(massa)));

      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason: 'REPROVA: a listagem desenhou imagem com uma resposta que '
            'trouxe `photo_url`. A faixa mora SO na pagina do local, e a '
            'separacao e estrutural: `EntradaDoDiretorio` nao tem o campo.',
      );

      // E a lista inteira esta de pe.
      expect(find.byType(CartaoDoDiretorio), findsWidgets);
    });
  });

  // -------------------------------------------------------------------------
  group('imagem que falha', () {
    // -----------------------------------------------------------------------
    testWidgets(
        'ISCA — cai no `errorBuilder`, e a tela continua de pe',
        (tester) async {
      // No `flutter_test` TODA requisicao de imagem responde 400: a falha
      // deste caso e o comportamento padrao do ambiente, e nao um duble.
      //
      // ISCA: tirar o `errorBuilder` de `ImagemDaRede`
      // (`app/lib/widgets/imagem_da_rede.dart`) faz a excecao de carga subir
      // para o `FlutterError`, e o caso reprova com a excecao na saida. E o
      // que acontece hoje em `Image.network` sem `errorBuilder`.
      await _abrirOPerto(
        tester,
        rede: _rede(
          listagem: _pagina(<Map<String, dynamic>>[
            _entrada(slug: 'a', nome: 'Clínica A', logoUrl: logoDerivada),
            _entrada(slug: 'b', nome: 'Clínica B', logoUrl: logoDerivada),
          ]),
        ),
      );
      // Tempo para a carga falhar e o `errorBuilder` entrar.
      await tester.pumpAndSettle();

      // (1) NENHUMA excecao chegou ao `FlutterError`. E a afirmacao central:
      // sem `errorBuilder`, `Image` reporta a falha de carga e o teste
      // acusaria aqui.
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a falha de carga da imagem subiu como excecao. Com '
            '`errorBuilder` no lugar, `Image` NAO reporta: ela desenha o '
            'estado de falha. Sem ele, uma derivada que ainda nao existe ou '
            'um leitor de midia fora do ar viram tela vermelha.',
      );

      // (2) A TELA CONTINUA DE PE: os dois cartoes, com os dois nomes.
      expect(
        find.byType(CartaoDoDiretorio),
        findsNWidgets(2),
        reason: 'REPROVA: a lista perdeu cartao por causa de imagem que nao '
            'carregou. Imagem e enfeite do cartao; o cartao e o conteudo.',
      );
      expect(find.text('Clínica A'), findsOneWidget);
      expect(find.text('Clínica B'), findsOneWidget);

      // (3) E o lugar da imagem desenha o SIMBOLO de falha, e nao um buraco.
      expect(
        find.byIcon(Icons.storefront_outlined),
        findsNWidgets(2),
        reason: 'REPROVA: o estado de falha da logo nao desenhou simbolo '
            'nenhum. Buraco sem explicacao e pior que simbolo: quem olha nao '
            'sabe se falta imagem ou se a tela quebrou.',
      );
    });
  });

  // -------------------------------------------------------------------------
  group('`urlDeImagem`: a definicao unica de ausencia', () {
    // -----------------------------------------------------------------------
    // Ela e funcao pura e mora em `api/modelos_diretorio.dart`. Os casos de
    // tela acima cobrem o efeito; estes cobrem a REGRA, que e o que um
    // terceiro consumidor vai reusar.
    test('vazio, espaco, tipo errado e ausente sao todos nulo', () {
      expect(urlDeImagem(null), isNull);
      expect(urlDeImagem(''), isNull);
      expect(urlDeImagem('   '), isNull);
      expect(urlDeImagem(42), isNull);
      expect(urlDeImagem(<String>['https://x']), isNull);
      expect(urlDeImagem(true), isNull);
    });

    test('a URL inteira passa, e vem aparada', () {
      expect(urlDeImagem(logoDerivada), logoDerivada);
      expect(urlDeImagem('  $logoDerivada  '), logoDerivada);
    });
  });
}
