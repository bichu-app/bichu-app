// A VITRINE DE FOTOS DO USUARIO, na tela.
//
// ISCA (c), do lado do app: **a grade usa a derivada de 320 px, e nunca o
// original nem a de 1024 px.** O caso que importa nao e "a imagem aparece" --
// isso passa com qualquer URL. O que estes casos medem e QUAL URL a grade pede
// e com que `cacheWidth` ela decodifica, porque e ai que esta o peso:
//
// - a celula tem 104 dp, e a 3x isso da 312 px reais;
// - a derivada de 1024 px e dado demais, e a grade desenha ate NOVE de uma
//   vez -- foi assim que a vitrine da Loja chegou a 9,8 MB numa tela;
// - sem `cacheWidth` o `ui.Image` em memoria custa a area do ARQUIVO e nao a
//   do quadro, e nove deles engasgam um aparelho modesto mesmo com o download
//   pequeno.
//
// Nada aqui roda em aparelho: sao casos de widget, em `flutter_tester`.

import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/vitrine_api.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/perfil/vitrine_de_fotos.dart';
import 'package:bichu/widgets/visualizador_de_imagem.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';

const String urlDaGrade = 'https://img.bichu.app/people/thumb/aaaa.jpeg';
const String urlAberta = 'https://img.bichu.app/people/card/bbbb.jpeg';

Map<String, dynamic> fotoJson(int posicao) => {
      'upload_id': '018f7c1e-7a2b-7c3d-9e4f-00000000000$posicao',
      'position': posicao,
      'status': 'ready',
      'grid_url': urlDaGrade,
      'open_url': urlAberta,
      'rejection_reason': null,
      'alt_text': null,
    };

/// A leitura da vitrine, de mentira: devolve o corpo que o caso pediu.
///
/// Implementa a interface ESTREITA `LeituraDaVitrine`, e nao estende
/// `VitrineApi`: estender obrigaria a construir um `ApiClient` -- e um cliente
/// de verdade numa bancada de widget aponta para a rede, que e o que faz teste
/// piscar.
class _LeituraDeMentira implements LeituraDaVitrine {
  _LeituraDeMentira(this.corpo);

  final Map<String, dynamic> corpo;

  @override
  Future<Vitrine> minhaVitrine() async => Vitrine.doJson(corpo);
}

/// A ESCRITA, de mentira. Estes casos sao de LEITURA: nenhum deles toca o
/// controle de adicionar, e por isso os dois metodos daqui **estouram** em vez
/// de devolver vazio -- um caso de leitura que chegasse a escrever precisa
/// reprovar alto, e nao passar por acidente.
///
/// Ela entrou em 19/10/2026, quando a tela deixou de ser so de leitura.
class EscritaQueNinguemChama implements EscritaDaVitrine {
  const EscritaQueNinguemChama();

  @override
  Future<Map<String, dynamic>> intencaoDeFotoDaVitrine({
    required String tipoDeConteudo,
    required int tamanhoEmBytes,
  }) async {
    throw StateError('nenhum caso de leitura pede autorizacao de envio');
  }

  @override
  Future<Vitrine> substituir(List<FotoPedida> fotos) async {
    throw StateError('nenhum caso de leitura grava a vitrine');
  }
}

/// Um envio que **nunca alcanca a rede**: `MockClient` que reprova alto.
///
/// `EnvioDeFoto` sem cliente injetado constroi um `http.Client` de verdade, e
/// um cliente de verdade numa bancada de widget aponta para a rede -- que e o
/// que faz teste piscar.
EnvioDeFoto envioQueNaoSai() => EnvioDeFoto(
      camera: const CameraNaoEmbarcada(),
      cliente: MockClient(
        (_) async => throw StateError('nenhum caso de leitura sobe bytes'),
      ),
    );

Future<void> montar(WidgetTester tester, Map<String, dynamic> corpo) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: VitrineDeFotosDoUsuario(
        api: _LeituraDeMentira(corpo),
        escrita: const EscritaQueNinguemChama(),
        // `CameraNaoEmbarcada` responde `indisponivel` nos quatro metodos, e e
        // o duble certo aqui: estes casos nao falam de escolha de foto.
        camera: const CameraNaoEmbarcada(),
        envio: envioQueNaoSai(),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Map<String, dynamic> vitrineCom(int quantas) => {
      'photos': List.generate(quantas, fotoJson),
      'max_photos': 9,
    };

/// Todas as `Image` desenhadas na arvore.
List<Image> imagens(WidgetTester tester) =>
    tester.widgetList<Image>(find.byType(Image)).toList();

void main() {
  group('a grade da vitrine pede a derivada da GRADE, e nunca outra', () {
    testWidgets('ISCA -- a URL desenhada e `grid_url`, e NAO `open_url`', (tester) async {
      await montar(tester, vitrineCom(1));

      final pintadas = imagens(tester);
      expect(pintadas, hasLength(1));
      // O provedor e um `ResizeImage` POR CIMA do `NetworkImage`, e nao o
      // `NetworkImage` direto: e isso que `cacheWidth` faz, e e justamente o
      // que a isca seguinte exige. Desembrulhar aqui mede a URL sem afrouxar
      // aquela.
      final redimensionado = pintadas.single.image as ResizeImage;
      final provedor = redimensionado.imageProvider as NetworkImage;
      expect(
        provedor.url,
        urlDaGrade,
        reason: 'a grade pedindo `open_url` baixa 1024 px para pintar 312, e faz isso nove vezes',
      );
      expect(provedor.url, isNot(urlAberta));
    });

    testWidgets('ISCA -- `cacheWidth` e pedido, e e proximo do que a celula pinta', (tester) async {
      await montar(tester, vitrineCom(1));

      final pintada = imagens(tester).single;
      final provedor = pintada.image as ResizeImage;
      final pedido = provedor.width;
      expect(
        pedido,
        isNotNull,
        reason: 'sem `cacheWidth` o ui.Image custa a area do ARQUIVO, e nao a do quadro',
      );
      // A celula tem no maximo 104 dp, e o `flutter_tester` roda a 1x. O limite
      // de 512 e folgado de proposito: o que esta isca proibe e decodificar na
      // largura do arquivo (1024+), e nao um dp a mais ou a menos.
      expect(
        pedido!,
        lessThanOrEqualTo(512),
        reason: 'decodificar na largura do arquivo e o defeito; a celula pinta ~104 dp',
      );
      expect(pedido, greaterThan(0));
    });

    testWidgets('CONTRAPESO -- NOVE fotos desenham nove celulas, todas com `grid_url`', (tester) async {
      await montar(tester, vitrineCom(9));

      final pintadas = imagens(tester);
      expect(pintadas, hasLength(9), reason: 'o teto e nove, e a grade desenha todas');
      for (final imagem in pintadas) {
        final provedor = imagem.image as ResizeImage;
        expect((provedor.imageProvider as NetworkImage).url, urlDaGrade);
        expect(provedor.width, isNotNull, reason: 'o peso da tela e a SOMA das nove');
      }
    });

    testWidgets('toda foto tem `errorBuilder`: imagem que nao carrega nao vira retangulo cinza', (tester) async {
      await montar(tester, vitrineCom(3));
      for (final imagem in imagens(tester)) {
        expect(
          imagem.errorBuilder,
          isNotNull,
          reason: 'a rede deste produto e usada na rua, e a derivada pode ainda nao existir',
        );
      }
    });
  });

  group('o que a tela mostra e o que ela nao mostra', () {
    testWidgets('a ORIENTACAO DE 5 MB esta VISIVEL na tela (pedido expresso do cliente)', (tester) async {
      await montar(tester, vitrineCom(1));
      expect(
        find.text(orientacaoDeTamanhoDaImagem),
        findsOneWidget,
        reason: 'o cliente pediu a orientacao de tamanho na tela, antes do envio',
      );
    });

    testWidgets('a CAPA e marcada, e so ela: `position = 0`', (tester) async {
      await montar(tester, vitrineCom(4));
      expect(
        find.text(VitrineDeFotosDoUsuario.rotuloDaCapa),
        findsOneWidget,
        reason: 'reordenar troca a capa; dois rotulos significam um campo que divergiu da ordem',
      );
    });

    testWidgets('VAZIO pede UMA foto, e nunca as nove', (tester) async {
      await montar(tester, {'photos': <dynamic>[], 'max_photos': 9});
      expect(find.text(VitrineDeFotosDoUsuario.textoDoVazio), findsOneWidget);
      expect(imagens(tester), isEmpty);
      // E o vazio nao e erro: nao ha botao de tentar de novo.
      expect(find.text('Tentar de novo'), findsNothing);
    });

    testWidgets('a foto em `processing` nao promete imagem: nao ha `Image` para ela', (tester) async {
      await montar(tester, {
        'photos': [
          {...fotoJson(0), 'status': 'processing', 'grid_url': null, 'open_url': null},
        ],
        'max_photos': 9,
      });
      expect(
        imagens(tester),
        isEmpty,
        reason: 'antes de o worker reescrever a derivada a foto carrega o EXIF do celular',
      );
      expect(find.textContaining('Preparando'), findsOneWidget);
    });

    testWidgets('a foto RECUSADA diz o motivo: sem ele a pessoa nao tem o que consertar', (tester) async {
      await montar(tester, {
        'photos': [
          {
            ...fotoJson(0),
            'status': 'rejected',
            'grid_url': null,
            'open_url': null,
            'rejection_reason': 'Essa imagem é grande demais. Reduza e envie de novo.',
          },
        ],
        'max_photos': 9,
      });
      expect(find.textContaining('grande demais'), findsOneWidget);
    });

    testWidgets('FORA DE PROPOSITO -- nao ha legenda, curtida, contador nem marcar pessoa', (tester) async {
      await montar(tester, vitrineCom(9));
      for (final proibido in ['Curtir', 'curtidas', 'Comentar', 'Marcar', 'Legenda']) {
        expect(
          find.textContaining(proibido),
          findsNothing,
          reason: '`$proibido` esta fora desta frente; marcar pessoa e dado biometrico',
        );
      }
    });

    testWidgets('OS PETS NAO ENTRAM: a tela REFERENCIA a pagina deles', (tester) async {
      var abriu = false;
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: VitrineDeFotosDoUsuario(
            api: _LeituraDeMentira(vitrineCom(1)),
            escrita: const EscritaQueNinguemChama(),
            camera: const CameraNaoEmbarcada(),
            envio: envioQueNaoSai(),
            aoAbrirMeusPets: () => abriu = true,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.textContaining('página de cada um'), findsOneWidget);
      await tester.tap(find.textContaining('página de cada um'));
      expect(abriu, isTrue, reason: 'referencia, e nao copia: foto de pet mora em `pet_photos`');
    });
  });

  group('o modelo da vitrine', () {
    test('o TETO vem do SERVIDOR, e nao de uma constante da tela', () {
      expect(Vitrine.doJson({'photos': <dynamic>[], 'max_photos': 9}).teto, 9);
      // Um teto diferente chegando do servidor TEM de valer: a tela com uma
      // segunda copia do numero e a copia que ninguem lembra de atualizar.
      expect(Vitrine.doJson({'photos': <dynamic>[], 'max_photos': 4}).teto, 4);
    });

    test('as fotos saem EM ORDEM de posicao, venha o corpo como vier', () {
      final vitrine = Vitrine.doJson({
        'photos': [fotoJson(2), fotoJson(0), fotoJson(1)],
        'max_photos': 9,
      });
      expect(vitrine.fotos.map((f) => f.posicao).toList(), [0, 1, 2]);
      expect(vitrine.fotos.first.ehCapa, isTrue);
      expect(vitrine.fotos.last.ehCapa, isFalse);
    });

    test('`estaCheia` com nove, e nao com oito', () {
      expect(Vitrine.doJson(vitrineCom(8)).estaCheia, isFalse);
      expect(Vitrine.doJson(vitrineCom(9)).estaCheia, isTrue);
    });

    test('estado desconhecido cai em `processando`, que e o unico seguro', () {
      final foto = FotoDaVitrineLida.doJson({...fotoJson(0), 'status': 'inventado'});
      expect(foto.estado, EstadoDaFoto.processando);
    });

    test('`upload_id` nulo e estado previsto, e nao erro', () {
      final foto = FotoDaVitrineLida.doJson({...fotoJson(0), 'upload_id': null});
      expect(foto.uploadId, isNull);
    });

    test('a escrita e DECLARATIVA: `alt_text` ausente nao vai no corpo', () {
      expect(const FotoPedida(uploadId: 'x').paraJson(), {'upload_id': 'x'});
      expect(
        const FotoPedida(uploadId: 'x', textoAlternativo: 'meu cachorro').paraJson(),
        {'upload_id': 'x', 'alt_text': 'meu cachorro'},
      );
    });
  });

  // -------------------------------------------------------------------------
  // A FOTO ABRE AMPLIADA (20/10/2026)
  // -------------------------------------------------------------------------
  // O achado que criou estes casos: `DERIVADAS_DA_VITRINE_DO_USUARIO` declara
  // `card` 1024 x 1024 e a descreve como *"a foto ABERTA, que e a unica que a
  // pessoa olha grande"*; o contrato a entrega em `open_url`;
  // `FotoDaVitrineLida.urlAberta` a decodifica -- e **nenhuma celula tinha
  // `onTap`**. A derivada da foto aberta existia desde antes da tela que a
  // abriria.
  //
  // Repare que o grupo do topo deste arquivo cobra o CONTRARIO e continua
  // valendo: a GRADE desenha `grid_url` e nunca `open_url`. Os dois nao se
  // contradizem -- a grade pinta 320 px, e os 1024 so aparecem DEPOIS do
  // toque, noutra tela. Se um dia a grade passar a desenhar `open_url`, e a
  // isca de la que reprova.
  group('a foto da vitrine abre ampliada', () {
    testWidgets('a foto abre ampliada e fecha', (tester) async {
      await montar(tester, vitrineCom(1));

      // Antes do toque nao ha visualizador: sem isto o caso ficaria verde com
      // uma tela que sempre esteve aberta.
      expect(find.byType(VisualizadorDeImagem), findsNothing);

      await tester.tap(find.byType(InkWell).first);
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsOneWidget,
        reason: 'REPROVA: o toque na célula não abriu a foto ampliada.',
      );

      // **E a tela ampliada pede a derivada ABERTA, e nao a da grade.** Sem
      // esta asercao o caso passaria com a miniatura de 320 px esticada, que e
      // exactamente o defeito que a derivada de 1024 existe para nao ter.
      final ampliada = tester
          .widgetList<Image>(find.byType(Image))
          .map((i) => i.image)
          .whereType<NetworkImage>()
          .map((i) => i.url)
          .toList();
      expect(
        ampliada,
        contains(urlAberta),
        reason: 'REPROVA: a foto ampliada não pediu `open_url`.',
      );

      final fechar = find.byTooltip(VisualizadorDeImagem.rotuloDeFechar);
      expect(fechar, findsOneWidget);
      await tester.tap(fechar);
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsNothing,
        reason: 'REPROVA: o Fechar não devolveu a pessoa para a grade.',
      );
    });

    testWidgets('célula sem foto não oferece toque', (tester) async {
      // `processing` nao tem `open_url`, e a celula desenha o estado em texto.
      await montar(tester, {
        'photos': [
          {...fotoJson(0), 'status': 'processing', 'grid_url': null, 'open_url': null},
        ],
        'max_photos': 9,
      });

      // O estado APARECE -- e o que torna o caso interessante: ha o que tocar
      // na tela, e nada pode responder.
      expect(find.text('Preparando…'), findsOneWidget);

      // Nao ha `InkWell` de celula. O atalho dos pets tem o seu, e ele fica
      // de fora: o que se cobra aqui e a GRADE.
      final toques = find.descendant(
        of: find.byType(GridView),
        matching: find.byType(InkWell),
      );
      expect(
        toques,
        findsNothing,
        reason: 'REPROVA: a célula sem foto está envolvida por um alvo de toque.',
      );
    });
  });
}
