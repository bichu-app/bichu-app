// A LISTAGEM ENXUTA E A PAGINA INTERNA DO PROFISSIONAL.
//
// Seis pedidos do cliente de 22/10/2026, nas palavras dele:
//
// 1. *"a listagem dos profissionais deve ser apenas o logo, nome, segmento,
//    endereco e botao de ligar, remova as informacoes adicionais, deixe apenas
//    na pagina interna"*;
// 2. *"coloque link na imagem principal para aumentar e tornar um carrosel de
//    imagens, caso tenha mais do que uma foto cadastrada"*;
// 3. *"Alinhe o titulo do estabelecimento e a imagem na vertical"*;
// 4. o endereco *"deve ser um campo separado e abrir o maps padrao do usuario
//    quando ele clicar"*;
// 5. *"tem o bairro abaixo do titulo, o endereco la embaixo na descricao e o
//    bairro novamente. Deixe apenas o endereco embaixo do titulo e clicavel."*;
// 6. *"adicione um botao compartilhar igual tem na pagina de eventos"*.
//
// ---------------------------------------------------------------------------
// O QUE SAIU DA LISTAGEM, E A PROVA DE QUE ESTA NA PAGINA INTERNA
// ---------------------------------------------------------------------------
// *"deixe apenas na pagina interna"* pressupoe que la ja tem, e isso foi
// conferido ANTES de remover, campo por campo. Sairam quatro:
//
// | o que saiu do cartao      | onde ele ja estava na pagina interna          |
// |---------------------------|-----------------------------------------------|
// | media e contagem          | `_BlocoDaPontuacao`, secao `Avaliacoes`       |
// | distancia (`a 1,2 km`)    | `_Cabecalho`, linha de `schedule_outlined`    |
// | `about` (a apresentacao)  | `_Informacoes`, `_Corpo`                      |
// | selo do que foi verificado| `_Cabecalho`, `_Selo`                         |
//
// O grupo `O QUE SAIU DA LISTAGEM` mede as duas metades: a ausencia no cartao
// E a presenca na pagina. **Medir so a ausencia aprovaria apagar o dado do
// produto**, que e o oposto do pedido.
//
// E o CONTROLE POSITIVO mede os cinco que ficam -- logo, nome, segmento,
// endereco e `Ligar`. Sem ele, um cartao que tivesse deixado de desenhar
// qualquer coisa passaria em todos os `findsNothing` deste arquivo.
//
// ---------------------------------------------------------------------------
// O LUGAR APARECE UMA VEZ, E ANTES APARECIA TRES
// ---------------------------------------------------------------------------
// O item 5 e a continuacao da decisao de 21/10/2026 (`um botao, nunca dois`),
// e nao a revogacao dela: **com logradouro o controle e a linha dele; sem
// logradouro o controle e a linha de lugar; nunca os dois.** O que o item 5
// muda e a CONTAGEM de linhas de lugar na pagina -- eram tres (bairro no
// cabecalho, endereco em `Informacoes`, bairro de novo em `Informacoes`) e
// passou a ser uma, embaixo do titulo.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO NAO AFIRMA
// ---------------------------------------------------------------------------
// **Nada aqui foi visto em aparelho.** Nenhum caso afirma que a imagem
// ampliada ficou bonita nem que o alinhamento do item 3 agradou: eles afirmam
// que o `crossAxisAlignment` da linha do titulo e `center`, que o toque abre o
// visualizador, e que a folha do sistema recebeu o texto que recebeu.

import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/dispositivo/textos_do_app_de_mapas.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/telas/rede/encontro_da_rede.dart';
import 'package:bichu/widgets/icone_do_inscrito.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/visualizador_de_imagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'endereco_do_profissional_test.dart' show detalheComEndereco;
import 'perto_com_dados_test.dart'
    show abrirPerto, entradaDoContrato, paginaDoContrato;
import 'telefone_fora_da_tela_test.dart'
    show
        abrirOLocal,
        detalheComTudo,
        redeDoLocal,
        semanticaDaTela,
        telefoneDeTeste,
        textoVisivel;

/// A derivada da foto do lugar, na forma que o servidor monta.
const String fotoDoLugar =
    'https://midia.bichu.app/directory-photo/banner/f6e5d4c3b2a1.jpeg';
const String segundaFoto =
    'https://midia.bichu.app/directory-photo/banner/0a0b0c0d0e0f.jpeg';
const String logoDoLugar =
    'https://midia.bichu.app/directory-logo/thumb/a1b2c3d4e5f6.jpeg';

/// Uma entrada de LISTAGEM com **tudo** o que o cartao desenhava antes de
/// 22/10/2026: logo, nome, segmento, lugar, telefone, distancia, `about`,
/// selo e pontuacao.
///
/// **Ela tem de trazer os quatro que sairam**, senao a ausencia deles no
/// cartao passaria por o dado nao ter chegado -- que e o falso APROVA mais
/// facil deste arquivo.
Map<String, dynamic> entradaCompleta() => <String, dynamic>{
      ...entradaDoContrato(
        about: 'Atende cão e gato, com internação.',
        phoneE164: telefoneDeTeste,
        distanceM: 1200,
      ),
      'logo_url': logoDoLugar,
      'rating': <String, dynamic>{
        'count': 128,
        'average': 4.3,
        'histogram': <String, int>{'1': 2, '2': 3, '3': 10, '4': 40, '5': 73},
      },
    };

Future<http.Response> Function(http.Request) soAListagem() {
  return (req) async {
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(
        paginaDoContrato(
          <Map<String, dynamic>>[entradaCompleta()],
          distanciaDisponivel: true,
        ),
      );
    }
    return problema('not-found', 404);
  };
}

/// O dobre da saida do aparelho, **so com o que esta pagina usa**.
///
/// `abrirNoAppDeMapas` (a variante de COORDENADA), `abrirLink` e o calendario
/// ESTOURAM: a pagina do local nao tem coordenada, nao abre link e nao escreve
/// no calendario, e um caminho novo tem de reprovar alto em vez de aprovar
/// calado.
class SaidaQueAnotaTudo extends SaidaDoApp {
  final List<String> enderecos = <String>[];
  final List<String> textosCompartilhados = <String>[];
  final List<String> assuntos = <String>[];

  /// O que as duas saidas devolvem. `false` e o aparelho sem app que responda,
  /// e a tela tem de DIZER.
  bool abre = true;

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    enderecos.add(endereco);
    return abre;
  }

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async {
    textosCompartilhados.add(texto);
    assuntos.add(assunto);
    return abre;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async => throw StateError(
        'a pagina do local nao tem coordenada: o contrato nao devolve o ponto',
      );

  @override
  Future<bool> abrirLink(Uri link) async =>
      throw StateError('a pagina do local nao abre link');

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async =>
      throw StateError('a pagina do local nao escreve no calendario');
}

/// Todo o texto visivel **de dentro de [de]**, numa string so, contando cada
/// linha **uma** vez.
///
/// ## Por que nao serve `textoVisivel`, e isto foi medido na execucao
///
/// `textoVisivel` soma DUAS listas -- `find.byType(Text)` e
/// `find.byType(RichText)` -- e para um `contains` isso e inofensivo. **Para
/// CONTAGEM e um fator dois**: todo `Text` monta um `RichText` abaixo de si,
/// entao cada linha e contada duas vezes.
///
/// Isso nao e teoria: os dois casos de contagem deste arquivo deram `2` contra
/// `1` esperado na primeira execucao, **com a pagina correta na tela** -- o
/// endereco estava desenhado uma vez e o numero dizia duas. Uma isca que da o
/// numero errado por construcao nao mede nada: ela so ensina a proxima pessoa
/// a trocar o numero esperado, e a partir dai `2` passa a ser "normal" e a
/// linha duplicada de verdade entra sem reprovar.
///
/// As linhas que estes casos contam sao todas `Text` (`_LinhaComIcone`,
/// `_Corpo`, o titulo), e a ancora de cada caso prova que elas foram
/// encontradas antes de a contagem valer -- sem a ancora, `0` passaria por
/// "aparece uma vez a menos".
///
/// ## E por que o ESCOPO, ja que o fator dois era a causa
///
/// A rota de baixo **nao** polui a contagem: o `MaterialPageRoute` obscurecido
/// fica offstage e `find` o pula por padrao -- medido, porque `CASO 1` de
/// `endereco_do_profissional_test.dart` REPROVOU ao perder `Pinheiros`, e ele
/// teria passado pelo cartao de tras se a rota contasse. O escopo fica de
/// qualquer forma: ele e o que faz a contagem continuar valendo se um dia a
/// listagem e a pagina dividirem a tela (tablet), e custa uma linha.
String textoDe(WidgetTester tester, Finder de) {
  final partes = <String>[];
  for (final e
      in find.descendant(of: de, matching: find.byType(Text)).evaluate()) {
    final t = e.widget as Text;
    partes.add(t.data ?? t.textSpan?.toPlainText() ?? '');
  }
  return partes.join('\n');
}

/// O texto da PAGINA DO LOCAL, sem o da listagem que ficou atras dela.
String textoDaPagina(WidgetTester tester) =>
    textoDe(tester, find.byType(PaginaDoLocal));

/// Os nos semanticos que anunciam a acao de abrir o mapa, **pelo WIDGET e nao
/// pela arvore semantica**.
///
/// `find.bySemanticsLabel` exige `ensureSemantics` e devolveria zero com a tela
/// montada -- um falso APROVA, que aqui seria pior que um falso reprova.
Finder osControlesDeMapa() => find.byWidgetPredicate(
      (w) =>
          w is Semantics &&
          (w.properties.label ?? '')
              .startsWith(TextosDoAppDeMapas.rotuloDoEndereco),
    );

void main() {
  late SaidaQueAnotaTudo saida;

  setUp(() {
    saida = SaidaQueAnotaTudo();
    SaidaDoApp.atual = saida;
  });
  tearDown(SaidaDoApp.restaurar);

  // =========================================================================
  // ITEM 1 — a listagem enxuta
  // =========================================================================
  group('ITEM 1 — CONTROLE POSITIVO: a listagem ainda mostra os cinco que '
      'ficam', () {
    // Este caso nao tem isca: ele E a isca dos outros. Sem ele, um cartao
    // vazio passaria em todos os `findsNothing` do grupo seguinte.
    testWidgets('logo, nome, segmento, endereço e `Ligar`', (tester) async {
      await abrirPerto(tester, rede: soAListagem());

      final cartao = find.byType(CartaoDoDiretorio);
      expect(cartao, findsOneWidget);

      // (1) A LOGO. `ImagemDaRede` e o quadrado pintado; `IconeDoInscrito` e o
      // glifo do tipo, que e o desenho de quem nao tem logo. Com `logo_url` na
      // resposta quem aparece e a primeira.
      expect(
        find.descendant(of: cartao, matching: find.byType(ImagemDaRede)),
        findsOneWidget,
        reason: 'REPROVA: o cartão perdeu a logo. Ela é o primeiro dos cinco '
            'itens que o cliente mandou ficar.',
      );
      expect(
        find.descendant(of: cartao, matching: find.byType(IconeDoInscrito)),
        findsNothing,
        reason: 'REPROVA: o cartão desenhou o glifo do tipo tendo logo. O '
            'glifo é o desenho da AUSÊNCIA de logo.',
      );

      final texto = textoVisivel(tester);
      // (2) o nome; (3) o segmento; (4) o endereço que a listagem tem.
      expect(texto, contains('Clínica Santa Bárbara'));
      expect(
        texto,
        contains('Clínica'),
        reason: 'REPROVA: o cartão perdeu o segmento (`kind` do contrato).',
      );
      expect(
        texto,
        contains('Pinheiros · São Paulo · SP'),
        reason: 'REPROVA: o cartão perdeu a linha de lugar. **Ela é o '
            '`endereço` que a LISTAGEM tem**: `DirectoryEntrySummary` não '
            'declara `street` -- as quatro colunas de endereço comercial só '
            'saem em `DirectoryEntryDetail` (21/10/2026), e o app não inventa '
            'endereço que o servidor não manda.',
      );
      // (5) o botão de ligar.
      expect(
        find.text(CartaoDoDiretorio.rotuloDeLigar),
        findsOneWidget,
        reason: 'REPROVA: o cartão perdeu o botão `Ligar`.',
      );
    });
  });

  group('ITEM 1 — ISCA: as informações adicionais saíram do cartão', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // devolva ao `build` de `CartaoDoDiretorio` qualquer um dos quatro blocos
    // que sairam (pontuacao, distancia, `sobre`, selo).
    //
    // **MEDIDO**: com os tres (selo, distancia e `sobre`) de volta, este caso
    // reprova em `not contains '1,2 km'` -- a primeira assercao de conteudo
    // que encontra o dado devolvido. O `reason` de cada `expect` nomeia o dado,
    // entao a reprova diz QUAL voltou sem obrigar quem le a adivinhar.
    //
    // **E o CONTROLE POSITIVO do grupo acima tem isca propria, medida**:
    // apagar a linha de lugar do cartao (`if (false && lugar != null)`) faz o
    // caso `logo, nome, segmento, endereço e `Ligar`` reprovar em
    // `contains 'Pinheiros · São Paulo · SP'`. Sem essa medicao, "a listagem
    // nao mostra X" seria uma afirmacao que um cartao VAZIO satisfaria.
    testWidgets('nem média, nem distância, nem apresentação, nem selo', (
      tester,
    ) async {
      await abrirPerto(tester, rede: soAListagem());

      // ANCORA: a resposta TROUXE os quatro, e o cartao existe. Sem isto os
      // quatro `isNot(contains(...))` abaixo passariam sobre o vazio.
      expect(find.byType(CartaoDoDiretorio), findsOneWidget);
      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(entrada.pontuacao?.quantidade, 128);
      expect(entrada.distanciaEmMetros, 1200);
      expect(entrada.sobre, 'Atende cão e gato, com internação.');
      expect(entrada.verificacao.oQueFoiVerificado, 'Verificado: CNPJ, CRMV');

      final texto = textoVisivel(tester);

      expect(
        texto,
        isNot(contains('4,3')),
        reason: 'REPROVA: a média continua no cartão.',
      );
      expect(
        texto,
        isNot(contains('128')),
        reason: 'REPROVA: a contagem de avaliações continua no cartão.',
      );
      expect(
        texto,
        isNot(contains('1,2 km')),
        reason: 'REPROVA: a distância continua no cartão.',
      );
      expect(
        texto,
        isNot(contains('internação')),
        reason: 'REPROVA: a apresentação (`about`) continua no cartão. Ela é '
            'a informação mais longa do cartão e era a que empurrava o botão '
            '`Ligar` para fora da dobra.',
      );
      expect(
        texto,
        isNot(contains('Verificado')),
        reason: 'REPROVA: o selo do que foi verificado continua no cartão.',
      );
      // E nenhuma estrela: a media saiu com o glifo dela.
      expect(
        find.descendant(
          of: find.byType(CartaoDoDiretorio),
          matching: find.byIcon(Icons.star),
        ),
        findsNothing,
        reason: 'REPROVA: a estrela da média ficou no cartão sem a média.',
      );
    });

    testWidgets('e os quatro continuam na PÁGINA INTERNA', (tester) async {
      // A OUTRA METADE DO PEDIDO. *"deixe apenas na pagina interna"* pressupoe
      // que la ja tem: medir so a ausencia no cartao aprovaria apagar o dado
      // do produto.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      // ESCOPO NA PAGINA: `textoVisivel` varreria a listagem de tras tambem,
      // e e dela que os quatro acabaram de sair -- ver `textoDe`.
      final texto = textoDaPagina(tester);
      expect(
        texto,
        contains('4,5'),
        reason: 'REPROVA: a média não está na página interna. O cliente '
            'mandou MOVER, e não apagar.',
      );
      expect(texto, contains('a 1,2 km'), reason: 'REPROVA: sem distância.');
      expect(
        texto,
        contains('Atende cão e gato.'),
        reason: 'REPROVA: sem a apresentação.',
      );
      expect(
        texto,
        contains('Verificado: CNPJ'),
        reason: 'REPROVA: o selo do que foi verificado não está na página '
            'interna. Ele saiu do cartão em 22/10/2026 e a página é o lugar '
            'onde ele ficou -- a BICHUS-165 não passou por selo genérico.',
      );
    });
  });

  // =========================================================================
  // ITEM 2 — a imagem principal amplia, e com mais de uma vira carrossel
  // =========================================================================
  group('ITEM 2 — ISCA: a imagem principal abre o visualizador', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // em `_FaixaDoLocal.build`, devolva o `ImagemDaRede` cru -- sem o
    // `Semantics`/`InkWell` em volta. Os dois primeiros casos reprovam: o
    // visualizador nao entra na arvore e nao ha no de botao na faixa.
    testWidgets('tocar na faixa abre a foto ampliada', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: <String, dynamic>{
            ...detalheComTudo(),
            'photo_url': fotoDoLugar,
          },
        ),
      );

      // ANCORA: a faixa esta na tela, e o visualizador NAO esta.
      expect(find.byType(ImagemDaRede), findsOneWidget);
      expect(find.byType(VisualizadorDeImagem), findsNothing);

      await tester.tap(find.byType(ImagemDaRede));
      await tester.pumpAndSettle();

      expect(
        find.byType(VisualizadorDeImagem),
        findsOneWidget,
        reason: 'REPROVA: o toque na foto principal não abriu o visualizador. '
            'Ele é `widgets/visualizador_de_imagem.dart`, o MESMO da capa do '
            'evento e da vitrine de fotos -- um terceiro caminho de ampliar '
            'seria a duplicação que o cliente já cobrou.',
      );
      expect(
        find.byTooltip(VisualizadorDeImagem.rotuloDeFechar),
        findsOneWidget,
        reason: 'REPROVA: a pessoa ficou presa na imagem ampliada.',
      );
    });

    testWidgets('UMA foto não é carrossel: nenhuma seta e nenhum contador', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(
          detalhe: <String, dynamic>{
            ...detalheComTudo(),
            'photo_url': fotoDoLugar,
          },
        ),
      );
      await tester.tap(find.byType(ImagemDaRede));
      await tester.pumpAndSettle();

      final visualizador = tester.widget<VisualizadorDeImagem>(
        find.byType(VisualizadorDeImagem),
      );
      expect(
        visualizador.urls,
        <String>[fotoDoLugar],
        reason: 'REPROVA: a página mandou ao visualizador uma lista diferente '
            'da foto que o contrato trouxe. `DirectoryEntryDetail` tem UM '
            '`photo_url`, e a página não inventa a segunda.',
      );
      expect(
        find.byType(PageView),
        findsNothing,
        reason: 'REPROVA: uma foto virou carrossel. Carrossel de um elemento '
            'promete navegação e não tem para onde ir -- a pessoa arrasta, '
            'nada acontece, e conclui que a tela travou. A regra é de '
            '`widgets/carrossel_de_fotos.dart`.',
      );
      expect(find.byTooltip(VisualizadorDeImagem.rotuloDeProxima), findsNothing);
    });

    // A ISCA DE `DUAS FOTOS VIRAM CARROSSEL` **NAO MORA AQUI**, e isso e
    // deliberado.
    //
    // Ela esta em `test/widgets/visualizador_de_imagem_test.dart`, no grupo
    // `MAIS DE UMA foto: carrossel ampliavel, com setas e contador`, por duas
    // razoes:
    //
    // 1. **esta tela nao consegue produzir duas fotos.**
    //    `DirectoryEntryDetail` tem UM `photo_url`, entao um caso aqui teria
    //    de montar o visualizador a mao -- e um caso que nao usa a tela em que
    //    vive e um caso no arquivo errado;
    // 2. **o visualizador tem outro consumidor pedido**, a vitrine de fotos do
    //    perfil (*"as fotos tem que ser clicaveis para expandir/aumentar, e
    //    ter o botao para andar para um lado e para a outra foto"*). Uma isca
    //    de navegacao que vivesse na pagina do profissional nao protegeria a
    //    vitrine.
    //
    // O que FICA aqui e o que e desta tela: que o toque abre o visualizador, e
    // que a lista que ela manda tem o elemento que o contrato trouxe.

    testWidgets('ISCA — local SEM foto não tem alvo de toque nenhum', (
      tester,
    ) async {
      // `photo_url` e nulo em tres casos normais (sem foto, ainda processando,
      // recusada nos bytes) e os tres sao a MAIORIA das entradas. Faixa
      // ausente nao pode virar botao que abre uma tela preta.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );
      // ANCORA: a pagina esta cheia.
      expect(textoVisivel(tester), contains('Clínica Santa Bárbara'));
      expect(
        find.byType(ImagemDaRede),
        findsNothing,
        reason: 'REPROVA: a página desenhou faixa num local sem foto.',
      );
      expect(find.byType(VisualizadorDeImagem), findsNothing);
    });
  });

  // =========================================================================
  // ITEM 3 — o título e a imagem alinhados na vertical
  // =========================================================================
  group('ITEM 3 — o título e o quadrado da imagem alinham na vertical', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // no `_Cabecalho`, troque `CrossAxisAlignment.center` de volta por
    // `CrossAxisAlignment.start`. Este caso reprova.
    //
    // **O que este caso NAO afirma**: que ficou bonito. Ele afirma o eixo.
    // `alinhar na vertical` numa `Row` e centrar no eixo cruzado, e e essa a
    // leitura do pedido -- o quadrado tem 56 dp e a linha do titulo tem a
    // altura de `headlineSmall`, entao com `start` o nome encosta no topo de
    // um quadrado mais alto que ele.
    testWidgets('a linha do título centra no eixo cruzado', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      // O quadrado do tipo so existe SEM faixa, e e esse o caso aqui
      // (`detalheComTudo` tem `photo_url: null`).
      final glifo = find.byType(IconeDoInscrito);
      expect(
        glifo,
        findsOneWidget,
        reason: 'REPROVA POR VAZIO: sem o quadrado do tipo na árvore não há '
            'linha de título para medir alinhamento.',
      );

      final linha = tester.widget<Row>(
        find.ancestor(of: glifo, matching: find.byType(Row)).first,
      );
      expect(
        linha.crossAxisAlignment,
        CrossAxisAlignment.center,
        reason: 'REPROVA: a linha do título e da imagem está em '
            '${linha.crossAxisAlignment}. O cliente pediu em 22/10/2026 '
            '*"Alinhe o titulo do estabelecimento e a imagem na vertical"*, e '
            'numa `Row` isso é centrar no eixo cruzado.',
      );
    });
  });

  // =========================================================================
  // ITENS 4 e 5 — o endereço é campo separado, clicável, e aparece UMA vez
  // =========================================================================
  group('ITENS 4 e 5 — ISCA: o lugar aparece UMA vez na página interna', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // devolva ao `_Informacoes` o bloco `if (lugar != null)` que saiu em
    // 22/10/2026.
    //
    // **MEDIDO**: os dois primeiros casos deste grupo reprovam, e com numeros
    // DIFERENTES -- `com logradouro` da `1` onde espera `0` (a linha de lugar
    // reapareceu numa pagina que tem logradouro) e `sem logradouro` da `2`
    // onde espera `1` (a mesma linha desenhada duas vezes). Os dois numeros
    // importam: o primeiro pega a linha que nao devia existir, o segundo pega
    // a DUPLICATA, e uma isca que cobrisse so um dos dois deixaria metade do
    // item 5 sem medicao.
    //
    // ANTES DE 22/10 ERAM TRES: bairro no cabecalho, endereco em
    // `Informacoes`, bairro de novo em `Informacoes`. O cliente contou as tres
    // e mandou ficar uma.
    testWidgets('com logradouro: UMA linha de lugar, e é a do endereço', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
        alta: true,
      );

      final texto = textoDaPagina(tester);
      // ANCORA: o endereco esta na tela.
      const String linhaDoEndereco =
          'Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030';
      expect(
        texto,
        contains(linhaDoEndereco),
        reason: 'REPROVA POR VAZIO: a página não desenhou o endereço, então '
            'contar linhas de lugar não mede a regra.',
      );

      // (1) O BAIRRO SAIU. Ele aparecia duas vezes -- abaixo do titulo e em
      // `Informacoes` -- e com logradouro na tela nenhuma das duas fica.
      expect(
        'Pinheiros'.allMatches(texto).length,
        0,
        reason: 'REPROVA: a linha `Pinheiros · São Paulo · SP` continua '
            'desenhada ${'Pinheiros'.allMatches(texto).length} vez(es). Com '
            'logradouro na tela ela é a informação MENOS precisa do mesmo '
            'lugar, e o cliente pediu *"Deixe apenas o endereço embaixo do '
            'titulo"*.',
      );

      // (2) E O ENDERECO APARECE UMA VEZ, nao duas: mover sem remover era o
      // defeito facil aqui.
      expect(
        linhaDoEndereco.allMatches(texto).length,
        1,
        reason: 'REPROVA: o endereço está desenhado '
            '${linhaDoEndereco.allMatches(texto).length} vezes. Ele MUDOU de '
            'lugar (de `Informações` para debaixo do título); ele não foi '
            'copiado para lá.',
      );
    });

    testWidgets('sem logradouro: UMA linha de lugar, e é a do bairro', (
      tester,
    ) async {
      // E A MAIORIA DAS ENTRADAS: adestrador, passeador e veterinario que
      // atende em casa nao tem endereco comercial.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      final texto = textoDaPagina(tester);
      expect(
        'Pinheiros · São Paulo · SP'.allMatches(texto).length,
        1,
        reason: 'REPROVA: a linha de lugar aparece '
            '${'Pinheiros · São Paulo · SP'.allMatches(texto).length} vezes. '
            'Sem logradouro ela é o único lugar que esta entrada tem, e tem '
            'de aparecer UMA vez.',
      );
      expect(texto, isNot(contains('CEP')));
    });

    // ISCA — **UM BOTAO, NUNCA DOIS**, a regra de `local_do_encontro.dart` que
    // a decisao de 21/10/2026 trouxe para esta tela. **O item 5 e a
    // continuacao dela, e nao a revogacao**: o que mudou e a contagem de
    // linhas de lugar, nao qual delas e o controle.
    //
    // DESLIGAR PARA VER REPROVAR: em `_Cabecalho`, ligue o toque nas DUAS
    // linhas -- desenhe o bloco do endereco E o de lugar com `aoTocar`. Este
    // caso reprova com 2.
    testWidgets('ISCA — um controle de mapa, nunca dois', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
        alta: true,
      );

      // DEFESA DE VAZIO: a ancora e o endereco na tela.
      expect(
        textoDaPagina(tester),
        contains('Rua Teodoro Sampaio, 1020 - Sala 3'),
        reason: 'REPROVA POR VAZIO: sem o endereço na tela, contar controles '
            'de mapa não mede a regra.',
      );

      final controles = osControlesDeMapa();
      expect(
        controles,
        findsOneWidget,
        reason: 'REPROVA: há ${controles.evaluate().length} controles de mapa '
            'na mesma página. Com logradouro na tela o botão é o DELE: '
            '`Rua X, 1020` leva à porta e `Bairro · Cidade · UF` leva ao '
            'centro do bairro.',
      );
      expect(
        tester.widget<Semantics>(controles).properties.label ?? '',
        contains('Rua Teodoro Sampaio'),
        reason: 'REPROVA: há um controle só, mas é o da linha de lugar. A '
            'linha mais precisa está na tela e o toque foi para a menos '
            'precisa.',
      );
    });

    testWidgets('ITEM 4 — o campo é separado e abre o app de mapas pela MESMA '
        'porta do encontro', (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
        alta: true,
      );

      // **CAMPO SEPARADO**: ele saiu da secao `Informações` -- que e a
      // `descricao` das palavras do cliente -- e e irmao do titulo. Medido
      // pela POSICAO na tela: o endereco esta ACIMA do texto de apresentacao.
      final yDoEndereco = tester
          .getTopLeft(
            find.text('Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030'),
          )
          .dy;
      final yDaApresentacao =
          tester.getTopLeft(find.text('Atende cão e gato.')).dy;
      expect(
        yDoEndereco,
        lessThan(yDaApresentacao),
        reason: 'REPROVA: o endereço continua dentro (ou abaixo) da descrição. '
            'O cliente pediu *"deve ser um campo separado"*, e o separado '
            'dele é: fora de `Informações`, embaixo do título.',
      );

      await tester.tap(
        find.text('Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030'),
      );
      await tester.pumpAndSettle();

      expect(
        saida.enderecos,
        hasLength(1),
        reason: 'REPROVA: o toque não chamou `abrirEnderecoNoAppDeMapas`. Essa '
            'é a porta única do `geo:0,0?q=` -- *"o maps padrão do usuário"* é '
            'o seletor que o Android abre, e um caminho novo seria '
            'duplicação.',
      );
      // O COMPLEMENTO NAO SAI: nenhum mapa procura por `Sala 3`.
      expect(saida.enderecos.single, isNot(contains('Sala 3')));
      expect(
        saida.enderecos.single,
        'Rua Teodoro Sampaio, 1020 - Pinheiros - São Paulo - SP - 05422-030',
      );
    });

    testWidgets('o leitor de tela anuncia a AÇÃO antes do endereço', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco()),
        alta: true,
      );
      expect(
        semanticaDaTela(tester),
        contains(
          '${TextosDoAppDeMapas.rotuloDoEndereco}: '
          'Rua Teodoro Sampaio, 1020 - Sala 3 · CEP 05422-030',
        ),
      );
    });
  });

  // =========================================================================
  // ITEM 6 — o botão compartilhar
  // =========================================================================
  group('ITEM 6 — ISCA: o botão compartilhar abre a folha do sistema', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // apague o bloco `_Margem(child: BotaoSecundario(... rotuloDeCompartilhar
    // ...))` de `_corpo`. Todos os casos deste grupo reprovam no
    // `findsOneWidget` do botao.
    testWidgets('o botão existe, e tocar manda o texto para a folha', (
      tester,
    ) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      final botao = find.text(PaginaDoLocal.rotuloDeCompartilhar);
      expect(
        botao,
        findsOneWidget,
        reason: 'REPROVA: não há botão `Compartilhar` na página do local. O '
            'rótulo é a MESMA palavra da página de eventos e da ficha do pet '
            '-- três palavras para o mesmo gesto fariam o app parecer ter '
            'três recursos.',
      );

      await tester.tap(botao);
      await tester.pumpAndSettle();

      expect(
        saida.textosCompartilhados,
        hasLength(1),
        reason: 'REPROVA: o toque não chamou `SaidaDoApp.compartilharTexto`. '
            'Essa é a porta da folha do sistema (`ACTION_SEND`), a MESMA do '
            'encontro da Rede e da ficha do pet.',
      );

      final texto = saida.textosCompartilhados.single;
      expect(texto, contains('Clínica Santa Bárbara'));
      expect(
        texto,
        contains('Pinheiros · São Paulo · SP'),
        reason: 'REPROVA: o texto não diz onde o local fica. Bairro, cidade e '
            'UF são os rótulos públicos que a listagem já mostra.',
      );
      expect(saida.assuntos.single, contains('Clínica Santa Bárbara'));
    });

    testWidgets('ISCA — o texto NÃO carrega link, porque não existe link', (
      tester,
    ) async {
      // **MEDIDO, e nao suposto**: `DirectoryEntryDetail` nao tem `share_url`
      // (nem `public_url`). O encontro ganhou pagina publica em 21/10 e o
      // campo veio com ela; o profissional nao tem. **O app nao monta
      // endereco**: um literal `'/profissional/' + slug` aqui viraria link
      // morto num binario que nao se corrige, e botao que manda link morto
      // por WhatsApp e pior que botao nenhum.
      //
      // DESLIGAR PARA VER REPROVAR: acrescente
      // `'\nhttps://bichu.app/profissional/${detalhe.slug}'` a
      // `mensagemDeCompartilhar`. Este caso reprova.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );
      await tester.tap(find.text(PaginaDoLocal.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.textosCompartilhados.single;
      expect(
        texto,
        isNot(contains('http')),
        reason: 'REPROVA: o texto compartilhado carrega um endereço. O '
            'contrato não devolve `share_url` para entrada de diretório, '
            'então qualquer URL aqui foi MONTADA no aparelho -- e nenhuma '
            'página pública de profissional foi medida de pé.',
      );
      expect(texto, isNot(contains('bichu.app/profissional')));
    });

    testWidgets('ISCA — o texto não leva o telefone nem o complemento', (
      tester,
    ) async {
      // O texto sai do nosso dominio e e lido por quem nao tem conta.
      // `phone_e164` so existe porque a operacao exige conta (ADR-0011 seção
      // 4), e o complemento e a parte que localiza a PORTA de alguém.
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComEndereco(complemento: 'Sala 3')),
        alta: true,
      );
      await tester.tap(find.text(PaginaDoLocal.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      final texto = saida.textosCompartilhados.single;
      expect(
        texto,
        isNot(contains('11987654321')),
        reason: 'REPROVA: o telefone comercial saiu do aparelho dentro de uma '
            'mensagem que vai para estranhos. O produto nem o PINTA na tela '
            'desde 19/10/2026.',
      );
      expect(
        texto,
        isNot(contains('Sala 3')),
        reason: 'REPROVA: o complemento foi no texto compartilhado.',
      );
    });

    testWidgets('a folha recusando: a tela DIZ, e não fica calada', (
      tester,
    ) async {
      saida.abre = false;
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );
      await tester.tap(find.text(PaginaDoLocal.rotuloDeCompartilhar));
      await tester.pumpAndSettle();

      expect(
        find.text(PaginaDoLocal.falhaDoCompartilhar),
        findsOneWidget,
        reason: 'REPROVA: a folha não abriu e a tela ficou calada. Um toque '
            'que não faz nada é indistinguível de um toque que não chegou, e '
            'a pessoa toca de novo.',
      );
      expect(find.byType(PaginaDoLocal), findsOneWidget);
    });

    // PORTAO — **a QUARTA redacao nao pode nascer calada.**
    //
    // Nao e um caso de tela: e uma comparacao de constantes, e ele existe
    // porque este projeto ja pagou por esta classe de defeito tres vezes num
    // dia -- *tres* redacoes da frase de abrir mapa, *cinco* do rotulo do
    // selo, e a mesma funcao de ler corpo de resposta em 29 arquivos.
    //
    // A acao de compartilhar tem TRES superficies e as tres dizem a mesma
    // frase; esta e a terceira constante dela, escrita em 22/10/2026 em vez de
    // lida de uma fonte unica. **A fonte unica e o trabalho seguinte** -- o
    // precedente e `dispositivo/textos_do_app_de_mapas.dart`, que diz na
    // propria prosa que *"unificar e mudar redacao sao dois trabalhos"*, e
    // unificar toca duas telas que nao sao deste pedido.
    //
    // Enquanto isso, este portao e o que impede o custo: mexer em qualquer uma
    // das tres sem mexer nas outras reprova AQUI, com os nomes dos tres
    // arquivos na frente de quem mexeu.
    test('PORTÃO — as três superfícies de compartilhar dizem a MESMA frase', () {
      expect(
        PaginaDoLocal.falhaDoCompartilhar,
        TelaDoEncontro.falhaDoCompartilhar,
        reason: 'REPROVA: a frase de falha da página do local divergiu da do '
            'encontro da Rede. São a MESMA ação (a folha do sistema não '
            'abriu) e o produto não tem motivo para dizê-la de dois jeitos. '
            'Se a redação tinha de mudar, ela muda nas três -- e o lugar '
            'certo para isso é uma fonte única em `lib/dispositivo/`, como '
            '`textos_do_app_de_mapas.dart` fez para o mapa.',
      );
      expect(
        PaginaDoLocal.falhaDoCompartilhar,
        TextosDoDetalhe.folhaNaoAbriu,
        reason: 'REPROVA: a frase de falha da página do local divergiu da da '
            'ficha do pet perdido. Ver o `reason` acima.',
      );
      expect(
        PaginaDoLocal.rotuloDeCompartilhar,
        TelaDoEncontro.rotuloDeCompartilhar,
        reason: 'REPROVA: o rótulo do botão divergiu do do encontro. Duas '
            'palavras para o mesmo gesto fazem o app parecer ter dois '
            'recursos.',
      );
      expect(
        PaginaDoLocal.rotuloDeCompartilhar,
        TextosDoDetalhe.compartilhar,
        reason: 'REPROVA: o rótulo do botão divergiu do da ficha do pet.',
      );
      // DEFESA DE VAZIO: comparar duas strings vazias passaria.
      expect(PaginaDoLocal.rotuloDeCompartilhar, 'Compartilhar');
      expect(PaginaDoLocal.falhaDoCompartilhar, contains('compartilhamento'));
    });
  });
}
