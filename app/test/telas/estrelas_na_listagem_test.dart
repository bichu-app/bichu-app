// A NOTA NO CARTAO DA LISTAGEM DA COMUNIDADE (BICHUS-313, 28/10/2026).
//
// Pedido do cliente, nas palavras dele: *"a listagem da comunidade, vamos
// incluir umas estrelinhas com a avaliacao de cada estabelecimento"*. A tela e
// `lib/telas/perto/lista_do_diretorio.dart`, a aba `Perto` dentro da secao
// `Comunidade`.
//
// O desenho escolhido por ele e a **VARIACAO A**: UMA estrela cheia e o
// numero -- `★ 4,8 · 128 avaliacoes`. A variacao B (cinco estrelas
// preenchidas por fracao) foi construida, medida e RECUSADA. O protótipo e a
// especificacao, e vive em `design/prototipos/estrelas-na-listagem/`.
//
// ---------------------------------------------------------------------------
// ESTE ARQUIVO MEDE QUATRO ESTADOS, E NAO DOIS
// ---------------------------------------------------------------------------
// O contrato (`DirectoryEntrySummary.rating` -> `DirectoryRating`) produz
// quatro desfechos de tela, e **colapsar dois deles faz o cartao afirmar
// coisa falsa**:
//
// | estado                     | o cartao escreve           | estrela? |
// |----------------------------|----------------------------|----------|
// | `count` > 1                | `4,8 · 128 avaliacoes`     | uma      |
// | `count` == 1               | `5,0 · 1 avaliacao`        | uma      |
// | `count` == 0, `average` nulo | `Ainda sem avaliacoes`   | NENHUMA  |
// | `rating` AUSENTE           | LINHA NENHUMA              | NENHUMA  |
//
// **O 3 e o 4 sao estados DIFERENTES, e o par de casos aqui existe para que
// continuem sendo.** Ausente e *"esta resposta nao trouxe a agregacao"* -- o
// APK publicado le esta listagem e nao conhece o campo. Zero e *"ninguem
// avaliou ainda"*, e as avaliacoes nasceram em 18/10/2026, entao ele e o
// estado FREQUENTE e nao o excepcional. Um cartao que escrevesse
// `Ainda sem avaliacoes` por causa de um APK velho estaria mentindo sobre o
// local.
//
// E o 3 nunca escreve `0,0`: o contrato manda `average` NULO com `count`
// zero, com a razao escrita nele -- *"zero e uma nota possivel de se ler como
// 'pessimo', e um local sem avaliacao nao e pessimo"*.
//
// ---------------------------------------------------------------------------
// A ESTRELA E CARMIM, E ISSO E MEDIDO E NAO ESCOLHIDO
// ---------------------------------------------------------------------------
// `cores.primary` (`raspberry.700`, 7,84:1 sobre `surface`), e **nao** o
// dourado do sistema (`actionFillRawDoNotUseAsText` = `butter.400`, 1,76:1).
// Dois motivos, e o primeiro e o que manda:
//
// 1. **A pagina do local ja desenha estrela em `cores.primary`** (`_Estrelas`
//    de `pagina_do_local.dart`), sobre a MESMA media. Duas tintas para o
//    mesmo dado seriam duas informacoes.
// 2. Estrela que carrega informacao e objeto grafico e precisa de 3:1 (WCAG
//    2.1 SC 1.4.11). O dourado nao chega la, e o proprio nome do token diz
//    que ele nao pinta nada que precise ser lido.
//
// O caso `a estrela e carmim` trava as duas pontas: e `primary` E nao e o
// dourado. Travar so a primeira deixaria passar o dia em que `primary` virar
// amarelo.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO NAO AFIRMA
// ---------------------------------------------------------------------------
// **Nada aqui foi visto em aparelho.** Nenhum caso afirma que a linha ficou
// bonita. O caso da escala de fonte a 200% afirma que o cartao nao ESTOURA e
// que os tres pedacos continuam na tela -- nao que a quebra ficou elegante.
//
// A foto do lugar continua FORA do cartao, e isto nao e omissao: vinte faixas
// 16:9 numa pagina de listagem custariam 65,6 MiB de imagem decodificada. O
// caso `a nota entrou e a foto NAO` mede as duas metades.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perto_com_dados_test.dart'
    show abrirPerto, entradaDoContrato, paginaDoContrato;

/// Uma entrada de listagem **com** a agregacao de notas.
///
/// `media` nula com `quantidade` zero e o caso NORMAL do contrato, e nao um
/// descuido desta massa.
Map<String, dynamic> entradaComNota({
  required int quantidade,
  double? media,
  String slug = 'clinica-santa-barbara',
  String displayName = 'Clínica Santa Bárbara',
}) {
  return <String, dynamic>{
    ...entradaDoContrato(slug: slug, displayName: displayName),
    'rating': <String, dynamic>{
      'count': quantidade,
      'average': media,
      // O histograma existe no contrato e e da PAGINA DO LOCAL. Ele vem na
      // massa de proposito: o cartao tem de ignora-lo, e uma massa sem ele
      // nao mediria isso.
      'histogram': <String, int>{'1': 0, '2': 0, '3': 0, '4': 0, '5': 0},
    },
  };
}

/// Uma entrada **sem o campo `rating`**: o que o servidor manda quando nao
/// agregou, e o que o APK publicado sempre leu.
///
/// `entradaDoContrato` nao emite `rating`, e e por isso que ela serve crua
/// aqui -- acrescentar `'rating': null` seria OUTRO estado (campo presente e
/// nulo) e nao o que este caso mede.
Map<String, dynamic> entradaSemCampoDeNota() =>
    entradaDoContrato(slug: 'sem-nota', displayName: 'Sem Nota');

Future<http.Response> Function(http.Request) listagemCom(
  List<Map<String, dynamic>> entradas,
) {
  return (req) async {
    if (req.url.path == '/v1/directory/entries' && req.method == 'GET') {
      return json200(
        paginaDoContrato(entradas, distanciaDisponivel: false),
      );
    }
    return problema('not-found', 404);
  };
}

/// O texto visivel **de dentro de um cartao**, e nao da tela.
///
/// Recortar pelo cartao nao e cerimonia: a aba `Comunidade` e a barra tem
/// texto proprio, e um `isNot(contains(...))` sobre a tela inteira mediria o
/// cromo junto. Pior no sentido contrario -- um `contains` da tela inteira
/// aprovaria a palavra achada em QUALQUER lugar.
String textoDoCartao(WidgetTester tester, {String? nome}) {
  final cartoes = find.byType(CartaoDoDiretorio);
  final alvo = nome == null
      ? cartoes.first
      : find.ancestor(
          of: find.text(nome),
          matching: cartoes,
        );
  final partes = <String>[];
  for (final e
      in find.descendant(of: alvo, matching: find.byType(Text)).evaluate()) {
    final t = e.widget as Text;
    partes.add(t.data ?? t.textSpan?.toPlainText() ?? '');
  }
  for (final e in find
      .descendant(of: alvo, matching: find.byType(RichText))
      .evaluate()) {
    partes.add((e.widget as RichText).text.toPlainText());
  }
  return partes.join('\n');
}

/// A entrada do MODELO, para os casos que montam o cartao sem rede.
///
/// Passa pelo `doJson` de verdade, e nao por um construtor: e o `doJson` que
/// decide que `rating` ausente vira nulo e que `average` nulo atravessa nulo,
/// e um construtor direto pularia justamente a regra que estes casos medem.
EntradaDoDiretorio entradaDoModelo({required int quantidade, double? media}) {
  return EntradaDoDiretorio.doJson(<String, dynamic>{
    'slug': 'clinica-santa-barbara',
    'kind': 'clinic',
    'display_name': 'Clínica Santa Bárbara',
    'neighborhood': 'Pinheiros',
    'city': 'São Paulo',
    'state': 'SP',
    'verification': <String, dynamic>{
      'level': 'document_verified',
      'evidence_kinds': <String>['cnpj'],
    },
    'rating': <String, dynamic>{
      'count': quantidade,
      'average': media,
      'histogram': <String, int>{'5': quantidade},
    },
  });
}

/// Monta **so o cartao**, na largura e na escala de fonte pedidas.
///
/// `tester.view.physicalSize` com `devicePixelRatio` 3, que e o precedente de
/// `titulo_da_conversa_test.dart`: a viewport padrao do teste de widget tem
/// 800 dp de largura, e um telefone tem 320 a 412. **Medir a quebra a 800 dp
/// mediria uma largura que nenhum aparelho tem** -- e foi assim que a primeira
/// versao deste grupo passou sem medir nada.
///
/// A escala entra por `builder`, sobre o `MediaQuery` do `MaterialApp`, e
/// **nunca por um `MediaQueryData` cru**: aquele substitui os dados INTEIROS e
/// `size` volta a `Size.zero`, defeito que `titulo_da_conversa_test.dart` ja
/// pagou e documentou.
Future<void> montarCartao(
  WidgetTester tester, {
  required double largura,
  required double escala,
  required EntradaDoDiretorio entrada,
}) async {
  tester.view.physicalSize = Size(largura * 3, 2400 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      builder: (ctx, filho) => MediaQuery(
        data: MediaQuery.of(ctx).copyWith(
          textScaler: TextScaler.linear(escala),
        ),
        child: filho!,
      ),
      home: Scaffold(
        body: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(BichuEspaco.e4),
            child: CartaoDoDiretorio(entrada: entrada, aoTocar: () {}),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// As estrelas **dentro do cartao**.
///
/// Recortado pelo cartao por obrigacao: `Icons.star` aparece em outros lugares
/// do app, e um `find.byIcon` na tela inteira acharia o de outra tela e
/// passaria por engano -- defeito que o pin do bairro deste mesmo cartao ja
/// pagou uma vez.
Finder estrelasDoCartao({String? nome}) {
  final cartoes = find.byType(CartaoDoDiretorio);
  final alvo = nome == null
      ? cartoes.first
      : find.ancestor(of: find.text(nome), matching: cartoes);
  return find.descendant(of: alvo, matching: find.byIcon(Icons.star));
}

void main() {
  // =========================================================================
  // ESTADO 1 — `count` > 1
  // =========================================================================
  group('ESTADO 1 — ISCA: `count` acima de 1 escreve a média e o plural', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/lista_do_diretorio.dart`,
    // apague o bloco `if (pontuacao != null)` do `build` de
    // `CartaoDoDiretorio`. Este caso reprova em `contains '4,8'`.
    testWidgets('uma estrela, `4,8` e `128 avaliações`', (tester) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          entradaComNota(quantidade: 128, media: 4.8),
        ]),
      );

      // ANCORA: a resposta TROUXE a agregacao, e o cartao existe. Sem isto as
      // assercoes abaixo poderiam estar medindo um cartao que nao nasceu.
      expect(find.byType(CartaoDoDiretorio), findsOneWidget);
      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(entrada.pontuacao?.quantidade, 128);
      expect(entrada.pontuacao?.media, 4.8);

      final texto = textoDoCartao(tester);
      expect(
        texto,
        contains('4,8'),
        reason: 'REPROVA: a média não está no cartão. O cliente pediu as '
            'estrelinhas COM a avaliação, e o número é a avaliação.',
      );
      expect(
        texto,
        contains('128 avaliações'),
        reason: 'REPROVA: a contagem não está no cartão. Ela é o que diz se '
            '`4,8` vale muito ou pouco.',
      );
      expect(
        texto,
        isNot(contains('4.8')),
        reason: 'REPROVA: a média está com PONTO decimal. A tela escreve com '
            'vírgula (`mediaEmTexto`), e o ponto é o que sai do JSON cru.',
      );

      // UMA estrela, e nao cinco: a variacao B foi RECUSADA pelo cliente.
      expect(
        estrelasDoCartao(),
        findsOneWidget,
        reason: 'REPROVA: o cartão não tem UMA estrela. Cinco estrelas são a '
            'variação B, que foi construída, medida e recusada em 28/10/2026 '
            '-- em vinte linhas elas viram a textura mais forte da tela e '
            'competem com o nome do estabelecimento.',
      );
    });

    testWidgets('a estrela é CARMIM, e não o dourado do sistema', (
      tester,
    ) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          entradaComNota(quantidade: 128, media: 4.8),
        ]),
      );

      final estrela = tester.widget<Icon>(estrelasDoCartao());
      expect(
        estrela.color,
        BichuCores.claro.primary,
        reason: 'REPROVA: a estrela não está em `cores.primary` (carmim, '
            '7,84:1 sobre `surface`). A página do local desenha a MESMA média '
            'em `primary`, e duas tintas para o mesmo dado seriam duas '
            'informações.',
      );
      expect(
        estrela.color,
        isNot(BichuCores.claro.actionFillRawDoNotUseAsText),
        reason: 'REPROVA: a estrela está no dourado do sistema '
            '(`butter.400`). Ele dá 1,76:1 sobre `surface`, abaixo dos 3:1 '
            'que objeto gráfico com informação exige (WCAG 2.1 SC 1.4.11), e '
            'o próprio nome do token diz que ele não pinta nada que precise '
            'ser lido.',
      );
      expect(
        estrela.size,
        BichuEspaco.e4,
        reason: 'REPROVA: a estrela não tem 16 dp. É a medida do protótipo '
            'aprovado e a mesma de `_Estrelas` da página do local.',
      );
    });
  });

  // =========================================================================
  // ESTADO 2 — `count` == 1, no SINGULAR
  // =========================================================================
  group('ESTADO 2 — ISCA: `count` igual a 1 escreve no singular', () {
    // DESLIGAR PARA VER REPROVAR: no cartao, troque `quantidadeEmTexto` por
    // `'${pontuacao.quantidade} avaliações'`. Este caso reprova em
    // `not contains '1 avaliações'`.
    //
    // **O singular nao e detalhe de lingua, e e o estado mais provavel do
    // local novo**: as avaliacoes nasceram em 18/10/2026, e o primeiro
    // avaliador de cada local passa por aqui.
    testWidgets('`1 avaliação`, e nunca `1 avaliações`', (tester) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          entradaComNota(quantidade: 1, media: 5.0),
        ]),
      );

      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(entrada.pontuacao?.quantidade, 1);

      final texto = textoDoCartao(tester);
      expect(
        texto,
        contains('1 avaliação'),
        reason: 'REPROVA: o cartão não escreve `1 avaliação` no singular.',
      );
      expect(
        texto,
        isNot(contains('1 avaliações')),
        reason: 'REPROVA: o cartão escreve `1 avaliações`. O plural cru é o '
            'defeito que `quantidadeEmTexto` existe para não deixar '
            'acontecer, e o cartão tem de CHAMAR o modelo em vez de montar a '
            'frase por conta própria.',
      );
      expect(
        texto,
        contains('5,0'),
        reason: 'REPROVA: uma nota só já desenha média. `count` igual a 1 não '
            'é o estado zero.',
      );
      expect(
        estrelasDoCartao(),
        findsOneWidget,
        reason: 'REPROVA: uma nota só já desenha estrela.',
      );
    });
  });

  // =========================================================================
  // ESTADO 3 — `count` == 0, `average` NULO
  // =========================================================================
  group('ESTADO 3 — ISCA: sem avaliação nenhuma, a frase e ZERO estrelas', () {
    // DESLIGAR PARA VER REPROVAR: no cartao, troque a guarda
    // `!pontuacao.temAvaliacoes` por `false`. O cartao passa a desenhar
    // estrela com media vazia, e este caso reprova em `findsNothing`.
    testWidgets('escreve `Ainda sem avaliações`, sem estrela e sem `0,0`', (
      tester,
    ) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          // `average` NULO com `count` zero: o contrato manda assim.
          entradaComNota(quantidade: 0),
        ]),
      );

      // ANCORA: o campo CHEGOU, e chegou zerado. Sem isto este caso seria
      // indistinguivel do estado 4, que e exatamente a confusao que o par
      // existe para impedir.
      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(
        entrada.pontuacao,
        isNotNull,
        reason: 'a massa deste caso tem de TRAZER `rating`, zerado',
      );
      expect(entrada.pontuacao?.quantidade, 0);
      expect(
        entrada.pontuacao?.media,
        isNull,
        reason: 'o contrato manda `average` NULO com `count` zero',
      );

      final texto = textoDoCartao(tester);
      expect(
        texto,
        contains(PaginaDoLocal.tituloSemAvaliacoes),
        reason: 'REPROVA: o cartão não escreve '
            '"${PaginaDoLocal.tituloSemAvaliacoes}". Local sem avaliação é '
            'estado FREQUENTE e não erro: as avaliações nasceram em '
            '18/10/2026.',
      );
      expect(
        texto,
        isNot(contains('0,0')),
        reason: 'REPROVA: o cartão escreve `0,0`. O contrato manda `average` '
            'nulo justamente porque zero se lê como "péssimo", e um local sem '
            'avaliação não é péssimo.',
      );
      expect(
        texto,
        isNot(contains('0 avaliações')),
        reason: 'REPROVA: o cartão escreve `0 avaliações`. A frase do estado '
            'zero é uma só, e não a contagem com zero na frente.',
      );
      expect(
        estrelasDoCartao(),
        findsNothing,
        reason: 'REPROVA: há estrela no cartão de um local sem avaliação. Uma '
            'estrela carmim ao lado de "Ainda sem avaliações" afirma uma nota '
            'que não existe.',
      );
    });
  });

  // =========================================================================
  // ESTADO 4 — `rating` AUSENTE da resposta
  // =========================================================================
  group('ESTADO 4 — ISCA: `rating` ausente não desenha LINHA nenhuma', () {
    // DESLIGAR PARA VER REPROVAR: no cartao, troque
    // `if (pontuacao != null)` por
    // `if (true)` com um `?? PontuacaoDoLocal(media: null, quantidade: 0, ...)`
    // -- o atalho que colapsa o ausente no zero. Este caso reprova em
    // `not contains 'Ainda sem avaliações'`.
    //
    // **AUSENTE NAO E ZERO**, e esta e a assercao mais importante do arquivo:
    // o campo e opcional no contrato porque o APK publicado le esta listagem
    // e nao o conhece, e porque uma resposta que nao conseguiu agregar e
    // melhor sem o campo do que com media zero.
    testWidgets('nem frase, nem estrela, nem contagem', (tester) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[entradaSemCampoDeNota()]),
      );

      // ANCORA: o cartao EXISTE e nasceu sem pontuacao. Sem isto os tres
      // `isNot` abaixo passariam sobre uma tela vazia -- o falso APROVA mais
      // facil deste arquivo.
      expect(find.byType(CartaoDoDiretorio), findsOneWidget);
      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(
        entrada.pontuacao,
        isNull,
        reason: 'a massa deste caso NAO pode trazer `rating`',
      );
      expect(
        textoDoCartao(tester),
        contains('Sem Nota'),
        reason: 'o cartao tem de estar desenhado para a ausencia valer algo',
      );

      final texto = textoDoCartao(tester);
      expect(
        texto,
        isNot(contains(PaginaDoLocal.tituloSemAvaliacoes)),
        reason: 'REPROVA: o cartão escreve '
            '"${PaginaDoLocal.tituloSemAvaliacoes}" para uma resposta que não '
            'trouxe a agregação. Ausente não é zero: ausente é "esta resposta '
            'não trouxe a agregação", e afirmar que o local não tem avaliação '
            'por causa de um APK velho é dizer do local uma coisa que não se '
            'sabe.',
      );
      expect(
        texto,
        isNot(contains('avaliação')),
        reason: 'REPROVA: há linha de avaliação num cartão sem `rating`.',
      );
      expect(
        texto,
        isNot(contains('avaliações')),
        reason: 'REPROVA: há contagem de avaliações num cartão sem `rating`.',
      );
      expect(
        estrelasDoCartao(),
        findsNothing,
        reason: 'REPROVA: há estrela num cartão sem `rating`. É a mesma regra '
            'do bairro nulo e da distância nula, que este cartão já aplica: '
            'dado que não veio não desenha linha.',
      );
    });

    testWidgets('e os QUATRO estados convivem na MESMA lista', (tester) async {
      // O caso que mede a diferenca entre o 3 e o 4 LADO A LADO, na mesma
      // pintura. Os quatro casos acima medem um estado cada um e passariam
      // todos com um cartao que lesse o estado do VIZINHO.
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          entradaComNota(
            quantidade: 128,
            media: 4.8,
            slug: 'muitas',
            displayName: 'Local Com Muitas',
          ),
          entradaComNota(
            quantidade: 1,
            media: 5.0,
            slug: 'uma',
            displayName: 'Local Com Uma',
          ),
          entradaComNota(quantidade: 0, slug: 'zero', displayName: 'Local Zero'),
          entradaSemCampoDeNota(),
        ]),
      );

      expect(find.byType(CartaoDoDiretorio), findsNWidgets(4));

      expect(textoDoCartao(tester, nome: 'Local Com Muitas'),
          contains('128 avaliações'));
      expect(estrelasDoCartao(nome: 'Local Com Muitas'), findsOneWidget);

      expect(
        textoDoCartao(tester, nome: 'Local Com Uma'),
        contains('1 avaliação'),
      );
      expect(estrelasDoCartao(nome: 'Local Com Uma'), findsOneWidget);

      final zero = textoDoCartao(tester, nome: 'Local Zero');
      expect(zero, contains(PaginaDoLocal.tituloSemAvaliacoes));
      expect(estrelasDoCartao(nome: 'Local Zero'), findsNothing);

      final ausente = textoDoCartao(tester, nome: 'Sem Nota');
      expect(
        ausente,
        isNot(contains(PaginaDoLocal.tituloSemAvaliacoes)),
        reason: 'REPROVA: o cartão sem `rating` escreve a frase do cartão '
            'zerado. Os dois estão na MESMA lista, e é aqui que colapsá-los '
            'fica visível.',
      );
      expect(ausente, isNot(contains('avaliaç')));
      expect(estrelasDoCartao(nome: 'Sem Nota'), findsNothing);
    });
  });

  // =========================================================================
  // O ROTULO QUE O LEITOR DE TELA DIZ
  // =========================================================================
  group('a nota entra na MESMA parada de foco do nome', () {
    // DESLIGAR PARA VER REPROVAR: troque o `Semantics`/`ExcludeSemantics` da
    // linha por um `Text` cru. O leitor passa a dizer `4,8 · 128 avaliações`,
    // e este caso reprova em `contains 'de 5 estrelas'`.
    testWidgets('o rótulo diz `Média 4,8 de 5 estrelas, 128 avaliações`', (
      tester,
    ) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          entradaComNota(quantidade: 128, media: 4.8),
        ]),
      );

      final no = tester.getSemantics(find.byType(CartaoDoDiretorio));
      final partes = <String>[];
      void visitar(SemanticsNode n) {
        partes.add(n.label);
        n.visitChildren((f) {
          visitar(f);
          return true;
        });
      }

      visitar(no);
      final falado = partes.where((p) => p.isNotEmpty).join('\n');
      expect(falado, isNotEmpty, reason: 'a árvore semântica veio vazia');

      expect(
        falado,
        contains('Média 4,8 de 5 estrelas, 128 avaliações'),
        reason: 'REPROVA: o leitor de tela não diz a nota com o denominador. '
            '`4,8 · 128 avaliações` lido em voz alta não tem "de 5" em lugar '
            'nenhum, e sem o denominador a nota não se interpreta.',
      );
      expect(
        falado,
        contains('Clínica Santa Bárbara'),
        reason: 'REPROVA: o nome saiu da parada de foco. A nota entra DENTRO '
            'do `MergeSemantics` que o cartão já tem, e não como uma parada '
            'nova -- quem navega por leitor ouve a entrada inteira num '
            'deslize.',
      );
    });
  });

  // =========================================================================
  // A ESCALA DE FONTE DO SISTEMA A 200%
  // =========================================================================
  group('a fonte do sistema a 200%, nas TRES larguras de telefone', () {
    // O RISCO CONHECIDO DA VARIACAO A, e o unico item que o `DESENHO.md`
    // deixou por medir: *"a 200% a linha da avaliacao pode quebrar e empurrar
    // o cartao; o protótipo e HTML e nao reproduz o `textScaler` do Flutter.
    // Mede-se no app, nao aqui"*.
    //
    // ## POR QUE ESTE GRUPO MONTA O CARTAO DIRETO, E NAO PASSA POR `abrirPerto`
    //
    // **Medido, e nao preferencia**: a 320 dp -- e a 375 dp com escala 1,5 ou
    // 2 -- a aba `Comunidade` da `TabBar` sai da largura da viewport, e o
    // `tap` de `abrirPerto` erra o alvo (`Offset(532.0, 104.0) is outside the
    // bounds of the root of the render tree, Size(375.0, 2400.0)`). O caso
    // morreria em `Bad state: No element` na NAVEGACAO, antes de olhar o
    // cartao, e a reprova nao falaria da nota. Isso e uma limitacao do helper
    // de sete arquivos e da barra de abas, **nao e defeito desta entrega** e
    // nao foi consertado aqui.
    //
    // Montar `CartaoDoDiretorio` direto mede exatamente o que esta entrega
    // mudou, na largura que o aparelho tem.
    //
    // ## O QUE ESTE GRUPO AFIRMA, E O QUE ELE **NAO** AFIRMA
    //
    // **Afirma**: em 320, 375 e 412 dp, a 100%, 150% e 200%, o cartao NAO
    // estoura, a estrela continua desenhada e nenhum dos dois pedacos de
    // texto desaparece.
    //
    // **NAO afirma em QUANTAS linhas a nota cabe no aparelho.** A fonte do
    // teste de widget tem metrica QUADRADA -- medido aqui: `i` e `W` dao os
    // mesmos 14,0 dp em `bodyMedium`, e `4,8 · 128 avaliações` dá 280,0 dp,
    // 14,0 por caractere. A Inter de verdade escreve essa linha em pouco mais
    // da metade disso. Entao a quebra que este grupo ve e PESSIMISTA, e
    // contar linhas aqui descreveria a fonte do teste e nao o produto. Quem
    // mediu a quebra com largura de texto real foi o protótipo, no navegador:
    // a linha nao quebra em 320, 375 nem 412 dp.
    //
    // O valor deste grupo e justamente ser pessimista: ele prova que **mesmo
    // com o texto ocupando o dobro da largura real** o cartao cresce em vez
    // de transbordar.
    for (final largura in <double>[320, 375, 412]) {
      for (final escala in <double>[1, 1.5, 2]) {
        testWidgets(
          'a ${largura.toInt()} dp e ${(escala * 100).toInt()}%: quebra, '
          'não estoura',
          (tester) async {
            await montarCartao(
              tester,
              largura: largura,
              escala: escala,
              entrada: entradaDoModelo(quantidade: 128, media: 4.8),
            );

            // (1) NENHUM ESTOURO. `takeException` devolve o `FlutterError`
            // que o `RenderFlex` publica ao transbordar, e e assim que "a
            // linha estourou" se mede -- nao olhando a imagem.
            expect(
              tester.takeException(),
              isNull,
              reason: 'REPROVA: o cartão estourou a ${largura.toInt()} dp com '
                  'a fonte a ${(escala * 100).toInt()}%. A linha da avaliação '
                  'tem de QUEBRAR, não transbordar: é para isso que o `Text` '
                  'está dentro de um `Expanded`, como o do bairro.',
            );

            // (2) OS TRES PEDACOS CONTINUAM LA. Um cartao que resolvesse o
            // estouro cortando a contagem passaria em (1) e estaria errado.
            final texto = textoDoCartao(tester);
            expect(
              texto,
              contains('4,8'),
              reason: 'REPROVA: a média sumiu.',
            );
            expect(
              texto,
              contains('128 avaliações'),
              reason: 'REPROVA: a contagem sumiu. Cortar a contagem para '
                  'caber perde a informação que diz se `4,8` vale muito ou '
                  'pouco.',
            );
            expect(
              estrelasDoCartao(),
              findsOneWidget,
              reason: 'REPROVA: a estrela sumiu.',
            );
          },
        );
      }
    }

    testWidgets('e o estado ZERO também não estoura a 320 dp e 200%', (
      tester,
    ) async {
      // A frase do estado zero e mais longa que a linha da nota, entao ela e
      // o pior caso de largura -- e e o estado FREQUENTE.
      await montarCartao(
        tester,
        largura: 320,
        escala: 2,
        entrada: entradaDoModelo(quantidade: 0),
      );

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: o cartão do estado zero estourou a 320 dp e 200%.',
      );
      expect(
        textoDoCartao(tester),
        contains(PaginaDoLocal.tituloSemAvaliacoes),
      );
      expect(
        estrelasDoCartao(),
        findsNothing,
        reason: 'REPROVA: apareceu estrela no estado zero a 200%. A escala de '
            'fonte não muda QUAIS estados desenham estrela.',
      );
    });
  });

  // =========================================================================
  // O QUE A NOTA **NAO** TROUXE DE VOLTA
  // =========================================================================
  group('voltou UMA das quatro, e só uma', () {
    // O cliente removeu QUATRO coisas do cartao em 22/10/2026 (*"remova as
    // informacoes adicionais, deixe apenas na pagina interna"*) e o pedido de
    // 28/10 devolve UMA delas -- a nota. **As outras tres continuam fora**, e
    // este caso e o que impede a nota de abrir a porta para elas.
    testWidgets('a nota entrou; distância, apresentação e selo NÃO', (
      tester,
    ) async {
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          <String, dynamic>{
            ...entradaDoContrato(
              about: 'Atende cão e gato, com internação.',
              distanceM: 1200,
            ),
            'rating': <String, dynamic>{
              'count': 128,
              'average': 4.8,
              'histogram': <String, int>{'5': 128},
            },
          },
        ]),
      );

      // ANCORA: a resposta TROUXE os quatro. Sem isto a ausencia dos tres
      // passaria por o dado nao ter chegado.
      final entrada = tester
          .widget<CartaoDoDiretorio>(find.byType(CartaoDoDiretorio))
          .entrada;
      expect(entrada.pontuacao?.quantidade, 128);
      expect(entrada.distanciaEmMetros, 1200);
      expect(entrada.sobre, 'Atende cão e gato, com internação.');
      expect(entrada.verificacao.oQueFoiVerificado, 'Verificado: CNPJ, CRMV');

      final texto = textoDoCartao(tester);
      expect(
        texto,
        contains('128 avaliações'),
        reason: 'REPROVA: a nota, que é a que VOLTOU, não está no cartão.',
      );
      expect(
        texto,
        isNot(contains('1,2 km')),
        reason: 'REPROVA: a distância voltou ao cartão. Ela saiu em '
            '22/10/2026 e o pedido de 28/10 não a menciona.',
      );
      expect(
        texto,
        isNot(contains('internação')),
        reason: 'REPROVA: a apresentação (`about`) voltou ao cartão.',
      );
      expect(
        texto,
        isNot(contains('Verificado')),
        reason: 'REPROVA: o selo do que foi verificado voltou ao cartão.',
      );
    });

    testWidgets('a nota entrou e a foto do lugar NÃO', (tester) async {
      // A foto e faixa 16:9 e mora SO na pagina do local: vinte faixas numa
      // pagina de listagem custariam 65,6 MiB de imagem decodificada. A
      // estrela e barata; a foto nao.
      await abrirPerto(
        tester,
        rede: listagemCom(<Map<String, dynamic>>[
          <String, dynamic>{
            ...entradaComNota(quantidade: 128, media: 4.8),
            'photo_url':
                'https://midia.bichu.app/directory-photo/banner/f6e5d4c3.jpeg',
          },
        ]),
      );

      expect(
        textoDoCartao(tester),
        contains('128 avaliações'),
        reason: 'a nota tem de estar la para a ausencia da foto valer algo',
      );

      final imagens = find.descendant(
        of: find.byType(CartaoDoDiretorio),
        matching: find.byType(Image),
      );
      for (final e in imagens.evaluate()) {
        final provedor = (e.widget as Image).image;
        expect(
          provedor.toString(),
          isNot(contains('directory-photo')),
          reason: 'REPROVA: a FOTO do lugar entrou no cartão da listagem. Ela '
              'é faixa 16:9 e mora só na página do local -- vinte faixas '
              'custariam 65,6 MiB de imagem decodificada.',
        );
      }
    });
  });

  // =========================================================================
  // O MODELO JA LIA O CAMPO, E CONTINUA SENDO ELE QUEM LE
  // =========================================================================
  group('o cartão CHAMA o modelo, e não reimplementa a regra', () {
    test('`PontuacaoDoLocal` é quem decide o singular e a vírgula', () {
      // Este caso nao passa por tela. Ele existe porque a tentacao concreta
      // era montar a frase no cartao com `'${p.quantidade} avaliações'` e
      // `p.media!.toStringAsFixed(1)`: funcionaria, e teria DUAS definicoes da
      // mesma regra -- uma delas sem o singular.
      final uma = PontuacaoDoLocal(
        media: 5,
        quantidade: 1,
        histograma: const <int, int>{},
      );
      expect(uma.quantidadeEmTexto, '1 avaliação');
      expect(uma.mediaEmTexto, '5,0');

      final muitas = PontuacaoDoLocal(
        media: 4.8,
        quantidade: 128,
        histograma: const <int, int>{},
      );
      expect(muitas.quantidadeEmTexto, '128 avaliações');
      expect(muitas.mediaEmTexto, '4,8');

      final zero = PontuacaoDoLocal(
        media: null,
        quantidade: 0,
        histograma: const <int, int>{},
      );
      expect(zero.temAvaliacoes, isFalse);
      expect(
        zero.mediaEmTexto,
        isNull,
        reason: 'media nula escreve NADA, e nunca `0,0`',
      );

      // E a linha do cartao e montada dos dois, nunca a mao.
      expect(CartaoDoDiretorio.textoDaAvaliacao(muitas), '4,8 · 128 avaliações');
      expect(CartaoDoDiretorio.textoDaAvaliacao(uma), '5,0 · 1 avaliação');
      expect(
        CartaoDoDiretorio.textoDaAvaliacao(zero),
        PaginaDoLocal.tituloSemAvaliacoes,
        reason: 'o estado zero tem frase propria, e nao media vazia',
      );
    });
  });
}
