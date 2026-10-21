// AS ISCAS DO TITULO DA CONVERSA (20/10/2026).
//
// ===========================================================================
// O DEFEITO, E ELE CORTAVA HOJE
// ===========================================================================
// O titulo era uma string so -- `'$nome · $pet'` -- no slot de titulo da
// `AppBar`, que pinta `headlineSmall`: Plus Jakarta Sans 700, 26 / 32.
//
// AS LARGURAS MEDIDAS POR ESTE ARQUIVO, com a fonte real, pela composicao
// ANTIGA de uma linha (`medidaDaComposicaoAntiga`), e o vao que a barra deixa:
//
//   largura da tela   vao do titulo   `Maria Fernanda · Serafina do Bonfim`
//   320 dp            232,00 dp       pede 442,16 -- CORTA por 210,16 dp
//   375 dp            287,00 dp       pede 442,16 -- CORTA por 155,16 dp
//   412 dp            324,00 dp       pede 442,16 -- CORTA por 118,16 dp
//
// A 200% de escala a composicao antiga pede 892,89 dp e corta nas tres por mais
// de 560 dp. **O vao e 88 dp menor que a tela, e nao 64**: 56 do `leading` mais
// 16 de `titleSpacing` de cada lado -- medido pelo caso
// `o VAO do slot de titulo e o que esta constante diz`. O caso
// `a composicao ANTIGA de UMA LINHA cortava, e os numeros ficam registrados`
// imprime os numeros exatos de cada combinacao -- ele e a medicao, e nao a
// descricao dela. A forma de registrar largura em dp no codigo e a de
// `telas/rede/secao_da_rede.dart`.
//
// ===========================================================================
// O QUE CEDE
// ===========================================================================
// O pet. Ele sai do titulo e vira a segunda linha, menor e secundaria, e e ele
// que recebe a elipse quando nem a segunda linha couber. O nome da pessoa nao
// e cortado em largura nenhuma e em escala nenhuma: ele envolve, e a barra
// cresce por `TituloDaConversa.alturaDaBarra`. O motivo esta no cabecalho de
// `telas/mensagens/titulo_da_conversa.dart`.
//
// ===========================================================================
// COMO CADA CASO REPROVA COM O MECANISMO DESLIGADO
// ===========================================================================
// Os casos montam a TELA DE VERDADE (`TelaDaConversa`) contra um `MockClient`,
// e nao o widget do titulo sozinho. E deliberado: com o widget isolado, voltar
// `tela_da_conversa.dart` para `Text('$nome · $pet')` deixaria este arquivo
// inteiro verde, medindo um componente que a tela nao usa mais.
//
// Medido com o mecanismo desligado (titulo de uma linha, `toolbarHeight` de
// padrao): reprovam `nome longo + pet longo NAO corta o nome`,
// `o nome sobrevive a 200% de escala nas tres larguras` e
// `o titulo e pintado DENTRO da barra, e nao por cima do corpo`.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/conversas_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mensagens/tela_da_conversa.dart';
import 'package:bichu/telas/mensagens/titulo_da_conversa.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart' show FontLoader;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const String idDaConversa = '0192f3a1-7b2c-7def-8a01-000000000001';

/// Carrega as fontes DE VERDADE, de `assets/fonts/`.
///
/// **Sem isto todo numero deste arquivo sai errado, e para cima.** O ambiente
/// de teste do Flutter usa uma fonte sintetica de largura uniforme: cada glifo
/// mede o tamanho da fonte, entao `Maria Fernanda · Serafina do Bonfim` mediria
/// 35 x 26 = 910 dp em vez dos ~346 reais, e a quebra de linha aconteceria em
/// lugares que a fonte real nao quebra. A forma e a de
/// `telas/casca_de_cinco_secoes_test.dart`, que perdeu uma passada de UX
/// inteira exatamente por medir a fonte sintetica.
///
/// Sao DUAS familias, e as duas importam aqui: `Plus Jakarta Sans` pinta o
/// titulo da barra (`headlineSmall`, 700/26) e `Inter` pinta a linha do pet
/// (`bodyMedium`, 400/14).
Future<void> carregarAsFontesDeVerdade() async {
  const Map<String, List<String>> familias = <String, List<String>>{
    'Plus Jakarta Sans': <String>[
      'PlusJakartaSans-Bold.ttf',
      'PlusJakartaSans-ExtraBold.ttf',
    ],
    'Inter': <String>[
      'Inter-Regular.ttf',
      'Inter-Medium.ttf',
      'Inter-SemiBold.ttf',
      'Inter-Bold.ttf',
    ],
  };
  for (final familia in familias.entries) {
    final carregador = FontLoader(familia.key);
    for (final nome in familia.value) {
      final arquivo = File('assets/fonts/$nome');
      // Verificacao que nao consegue verificar REPROVA. Um `if (existe)` calado
      // aqui deixaria este arquivo medindo a fonte sintetica e registrando
      // numeros falsos no cabecalho, que e pior do que nao medir.
      if (!arquivo.existsSync()) {
        fail(
          'REPROVA: nao achei "assets/fonts/$nome" a partir de '
          '"${Directory.current.path}". Sem a fonte real a medida e feita '
          'contra a fonte sintetica de largura uniforme.',
        );
      }
      carregador.addFont(
        Future<ByteData>.value(
          ByteData.sublistView(
            Uint8List.fromList(arquivo.readAsBytesSync()),
          ),
        ),
      );
    }
    await carregador.load();
  }
}

/// Um nome e um pet COMUNS, e nao patologicos: o corte acontecia com estes.
const String nomeComum = 'Maria Fernanda';
const String petComum = 'Serafina do Bonfim';

/// As tres larguras do produto, em dp.
const List<double> larguras = <double>[320, 375, 412];

Map<String, dynamic> _conversa(String nome, String pet) => <String, dynamic>{
  'id': idDaConversa,
  'case_id': null,
  'pet_display_name': pet,
  'status': 'open',
  'participants': <Map<String, dynamic>>[
    <String, dynamic>{
      'role': 'tutor',
      'display_name': 'Leandro',
      'handle': null,
      'photo_icon_url': null,
    },
    <String, dynamic>{
      'role': 'finder',
      'display_name': nome,
      'handle': null,
      'photo_icon_url': null,
    },
  ],
  'messages': <Map<String, dynamic>>[
    <String, dynamic>{
      'id': '0192f3a1-7b2c-7def-8a01-00000000aaaa',
      'sender_role': 'finder',
      'body': 'Achei ele na praça da Matriz, está bem',
      'redactions': <Map<String, dynamic>>[],
      'photo_url': null,
      'created_at': '2026-10-18T13:52:00.000Z',
    },
  ],
  'unread': false,
  'last_message_preview': null,
  'last_message_at': null,
  'next_cursor': null,
};

ConversasApi _apiCom(String nome, String pet) {
  AppConfig.limparParaTeste();
  return ConversasApi(
    ApiClient(
      config: AppConfig.carregar(apiBaseUrlDeTeste: 'https://api.teste.bichu'),
      cliente: MockClient((http.Request req) async {
        if (req.url.path == '/v1/conversations/$idDaConversa') {
          return http.Response(
            jsonEncode(_conversa(nome, pet)),
            200,
            headers: const <String, String>{
              'content-type': 'application/json; charset=utf-8',
            },
          );
        }
        if (req.url.path == '/v1/me/conversations-seen') {
          return http.Response('', 204);
        }
        return http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://api.bichu.app/problems/not-found',
            'title': 'Nao foi possivel concluir',
            'status': 404,
          }),
          404,
          headers: const <String, String>{
            'content-type': 'application/problem+json; charset=utf-8',
          },
        );
      }),
      tokenDeAcesso: () async => 'token-de-teste',
    ),
  );
}

/// Monta a TELA DE VERDADE na largura e na escala pedidas.
Future<void> abrirAConversa(
  WidgetTester tester, {
  required double largura,
  required double escala,
  String nome = nomeComum,
  String pet = petComum,
}) async {
  tester.view.physicalSize = Size(largura * 3, 2400);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  // A ESCALA ENTRA POR `builder`, SOBRE o `MediaQuery` do `MaterialApp`, e
  // nunca por um `MediaQueryData(textScaler: ...)` cru por cima dele: aquele
  // substitui os dados INTEIROS, e `size` volta a `Size.zero`. Medido -- com o
  // `MediaQuery` cru a tela calculava a altura da barra sobre 1 dp de largura e
  // devolvia 424 dp, e o caso reprovava por um motivo que nao era o do produto.
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(
          textScaler: TextScaler.linear(escala),
        ),
        child: child!,
      ),
      home: TelaDaConversa(
        conversaId: idDaConversa,
        conversas: _apiCom(nome, pet),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// O `RenderParagraph` da barra que CONTEM [texto].
///
/// **Procura por CONTEUDO, e nao por igualdade**, e a diferenca e o que faz
/// estes casos reprovarem pelo motivo certo quando o mecanismo esta desligado:
/// com o titulo antigo de uma linha so, `find.text('Maria Fernanda')` nao acha
/// nada -- o paragrafo pintado e `'Maria Fernanda · Serafina do Bonfim'` -- e o
/// caso morreria dizendo "nao achei" em vez de "o nome foi cortado". Medido com
/// o conserto revertido: com esta busca, a isca do nome reprova com a frase do
/// corte, que e a que explica o defeito a quem le o relatorio.
RenderParagraph paragrafoNaBarra(WidgetTester tester, String texto) {
  final candidatos = find.descendant(
    of: find.byType(AppBar),
    matching: find.byType(RichText),
  );
  for (final elemento in candidatos.evaluate()) {
    final render = elemento.renderObject;
    if (render is RenderParagraph &&
        render.text.toPlainText().contains(texto)) {
      return render;
    }
  }
  fail(
    'REPROVA: nenhum paragrafo da `AppBar` contem "$texto". Os paragrafos '
    'pintados sao '
    '${candidatos.evaluate().map((e) => '"${(e.renderObject! as RenderParagraph).text.toPlainText()}"').toList()}. '
    'Sem o texto nao ha o que medir, e um medidor sem o que medir reprova com '
    'o motivo, nunca aprova por ausencia.',
  );
}

/// Em quantas linhas um paragrafo saiu, lido do RENDER.
int linhasDe(RenderParagraph paragrafo, String texto) {
  final caixas = paragrafo.getBoxesForSelection(
    TextSelection(baseOffset: 0, extentOffset: texto.length),
  );
  expect(caixas, isNotEmpty, reason: 'REPROVA: o render de "$texto" nao devolveu caixa nenhuma.');
  return caixas.map((c) => c.top.round()).toSet().length;
}

/// A largura que a composicao ANTIGA de uma linha pedia, sem teto de largura.
double medidaDaComposicaoAntiga(
  WidgetTester tester, {
  required String nome,
  required String pet,
  required double escala,
}) {
  final estilo = BichuTheme.claro.appBarTheme.titleTextStyle!;
  final pintor = TextPainter(
    text: TextSpan(text: '$nome · $pet', style: estilo),
    textDirection: TextDirection.ltr,
    textScaler: TextScaler.linear(escala),
  )..layout();
  final largura = pintor.width;
  pintor.dispose();
  return largura;
}

void main() {
  setUpAll(carregarAsFontesDeVerdade);

  testWidgets(
    'a composicao ANTIGA de UMA LINHA cortava, e os numeros ficam registrados',
    (tester) async {
      // ESTE CASO E A MEDICAO, e nao a descricao dela. Ele nao depende do
      // conserto: ele mede a composicao antiga com a fonte real e reprova se
      // ela passar a caber -- que seria o unico mundo em que o conserto nao
      // precisava existir.
      final relatorio = StringBuffer();
      var cortouEmAlgumaCombinacao = false;
      for (final largura in larguras) {
        for (final escala in <double>[1.0, 2.0]) {
          final vao = largura - TituloDaConversa.vaoTiradoPelaBarra;
          final pedida = medidaDaComposicaoAntiga(
            tester,
            nome: nomeComum,
            pet: petComum,
            escala: escala,
          );
          final corta = pedida > vao;
          cortouEmAlgumaCombinacao = cortouEmAlgumaCombinacao || corta;
          relatorio.writeln(
            '  ${largura.toStringAsFixed(0)} dp a ${(escala * 100).toStringAsFixed(0)}%: '
            'vao ${vao.toStringAsFixed(2)} dp, '
            '"$nomeComum · $petComum" pede ${pedida.toStringAsFixed(2)} dp '
            '${corta ? '-- CORTA por ${(pedida - vao).toStringAsFixed(2)} dp' : '-- cabe'}',
          );
        }
      }
      // ignore: avoid_print
      print('[LARGURAS MEDIDAS] composicao ANTIGA de uma linha\n$relatorio');
      expect(
        cortouEmAlgumaCombinacao,
        isTrue,
        reason: 'REPROVA: a composicao antiga passou a caber em todas as '
            'combinacoes. Se isso for verdade, o conserto perdeu o motivo -- e '
            'nenhum numero deste arquivo pode ficar afirmando o contrario.',
      );
    },
  );

  testWidgets('ISCA -- nome longo + pet longo NAO corta o nome', (tester) async {
    // A ISCA PELO NOME DO CASO. Com o mecanismo desligado -- titulo de uma
    // linha, `toolbarHeight` de padrao --, `Maria Fernanda` sai cortado em
    // 375 dp, e este caso reprova.
    await abrirAConversa(tester, largura: 375, escala: 1.0);

    final paragrafo = paragrafoNaBarra(tester, nomeComum);
    expect(
      paragrafo.didExceedMaxLines,
      isFalse,
      reason: 'REPROVA: o NOME da pessoa foi cortado. Ele e o campo que decide '
          'se a mensagem e respondida, e num produto com golpe do falso achador '
          'um nome ambiguo e o defeito -- quem cede e o pet.',
    );
    // E O NOME SAI INTEIRO, caractere por caractere: `didExceedMaxLines` e
    // `false` tambem quando `maxLines` e nulo, entao ele sozinho nao provaria
    // nada. O texto pintado tem de CONTER o nome todo.
    expect(paragrafo.text.toPlainText(), contains(nomeComum));

    // E O PET CONTINUA NA TELA: o conserto nao foi apagar o contexto.
    final pet = paragrafoNaBarra(tester, petComum);
    expect(
      pet.text.toPlainText(),
      contains(petComum),
      reason: 'REPROVA: o pet saiu da barra. Ele CEDE a linha e o fim, mas a '
          'conversa e sobre aquele animal -- apaga-lo nao e conserto.',
    );
  });

  testWidgets('ISCA -- o nome sobrevive a 200% de escala nas tres larguras', (
    tester,
  ) async {
    // A escala de 200% e onde uma barra de altura fixa teria de escolher entre
    // cortar o nome e transbordar a pintura. As duas sao o defeito.
    for (final largura in larguras) {
      await abrirAConversa(tester, largura: largura, escala: 2.0);
      final paragrafo = paragrafoNaBarra(tester, nomeComum);
      expect(
        paragrafo.text.toPlainText(),
        contains(nomeComum),
        reason: 'REPROVA: em $largura dp a 200% o nome nao saiu inteiro.',
      );
      expect(
        paragrafo.didExceedMaxLines,
        isFalse,
        reason: 'REPROVA: em $largura dp a 200% o nome foi cortado.',
      );
      // ignore: avoid_print
      print(
        '[MEDIDO] $largura dp a 200%: o nome ocupou '
        '${paragrafo.size.width.toStringAsFixed(2)} x '
        '${paragrafo.size.height.toStringAsFixed(2)} dp em '
        '${linhasDe(paragrafo, nomeComum)} linha(s), barra de '
        '${tester.getRect(find.byType(AppBar)).height.toStringAsFixed(2)} dp',
      );
    }
  });

  testWidgets(
    'ISCA -- o titulo e pintado DENTRO da barra, e nao por cima do corpo',
    (tester) async {
      // Resolver o corte deixando o texto transbordar a barra seria trocar um
      // defeito por outro: o titulo pintaria sobre a primeira mensagem.
      for (final largura in larguras) {
        for (final escala in <double>[1.0, 2.0]) {
          await abrirAConversa(tester, largura: largura, escala: escala);
          final barra = tester.getRect(find.byType(AppBar));
          for (final texto in <String>[nomeComum, petComum]) {
            final caixa = tester.getRect(
              find.descendant(
                of: find.byType(AppBar),
                matching: find.text(texto),
              ),
            );
            final fora = caixa.bottom - barra.bottom;
            expect(
              fora,
              lessThanOrEqualTo(0.01),
              reason: 'REPROVA: em $largura dp a ${escala * 100}% o texto '
                  '"$texto" foi pintado ${fora.toStringAsFixed(2)} dp fora da '
                  'barra, por cima do corpo da conversa.',
            );
          }
          expect(
            barra.height,
            greaterThanOrEqualTo(BichuAlvoDeToque.critico - 0.01),
            reason: 'REPROVA: a barra encolheu abaixo do alvo de toque critico '
                'de 64 dp, e o `leading` dela e a saida da tela.',
          );
        }
      }
    },
  );

  testWidgets('CONTRAPESO -- quem cede o FIM e o pet, e so ele', (tester) async {
    // Um pet de nome absurdo, numa tela estreita: a elipse tem de aparecer NO
    // PET, e o nome continuar inteiro. Sem este caso, uma composicao que
    // simplesmente nunca cortasse nada (porque deixou o pet de fora) passaria
    // pelas iscas de cima.
    const petEnorme = 'Serafina do Bonfim Terceira de Aparecida do Norte';
    await abrirAConversa(
      tester,
      largura: 320,
      escala: 1.0,
      pet: petEnorme,
    );

    expect(
      paragrafoNaBarra(tester, nomeComum).text.toPlainText(),
      contains(nomeComum),
    );
    final pet = paragrafoNaBarra(tester, petEnorme);
    expect(
      pet.didExceedMaxLines,
      isTrue,
      reason: 'REPROVA: o pet enorme NAO foi cortado em 320 dp. Ou ele ganhou '
          'mais de uma linha -- e aí a barra cresce por causa do contexto, nao '
          'da pessoa --, ou o medidor parou de olhar o lugar certo.',
    );
  });

  testWidgets('CONTRAPESO -- sem pet a segunda linha NAO nasce', (tester) async {
    // `pet_display_name` vazio e estado real do contrato. Uma segunda linha
    // vazia roubaria altura da barra sem dizer nada.
    await abrirAConversa(tester, largura: 375, escala: 1.0, pet: '');

    expect(
      paragrafoNaBarra(tester, nomeComum).text.toPlainText(),
      contains(nomeComum),
    );
    final barra = tester.getRect(find.byType(AppBar));
    expect(
      barra.height,
      closeTo(BichuAlvoDeToque.critico, 0.01),
      reason: 'REPROVA: sem pet a barra cresceu alem do alvo critico de 64 dp, '
          'o que so acontece se uma segunda linha vazia estiver ocupando lugar.',
    );
  });

  testWidgets('o VAO do slot de titulo e o que esta constante diz', (
    tester,
  ) async {
    // **A CALIBRAGEM, e ela ja pegou um erro.** `vaoTiradoPelaBarra` nasceu 64
    // (56 do `leading` + 8 de respiro) por deducao, e o leiaute real tira 88
    // (56 + 16 de `titleSpacing` de cada lado). Supor vao maior do que existe
    // faz `alturaDaBarra` prever menos linhas do que o nome ocupa, e a barra sai
    // curta -- entao este caso mede o retangulo PINTADO e reprova a divergencia.
    //
    // O nome e deliberadamente absurdo: com um nome curto o `Column` encolhe ao
    // conteudo e o retangulo mediria a largura do TEXTO, nao a do slot.
    const nomeQuePreencheOSlot =
        'Maria Fernanda Albuquerque dos Santos Nogueira Prado Lins';
    for (final largura in larguras) {
      await abrirAConversa(
        tester,
        largura: largura,
        escala: 1.0,
        nome: nomeQuePreencheOSlot,
        pet: 'Serafina',
      );
      final slot = tester.getRect(find.byType(TituloDaConversa));
      expect(
        largura - slot.width,
        closeTo(TituloDaConversa.vaoTiradoPelaBarra, 0.01),
        reason: 'REPROVA: em $largura dp a barra tira '
            '${(largura - slot.width).toStringAsFixed(2)} dp do titulo, e '
            '`vaoTiradoPelaBarra` diz '
            '${TituloDaConversa.vaoTiradoPelaBarra.toStringAsFixed(2)}. Com a '
            'constante errada para cima, `alturaDaBarra` preve menos linhas do '
            'que o nome ocupa e a barra sai curta.',
      );
      // ignore: avoid_print
      print(
        '[VAO MEDIDO] tela ${largura.toStringAsFixed(0)} dp -> '
        '${slot.width.toStringAsFixed(2)} dp para o titulo',
      );
    }
  });

  testWidgets(
    'a barra nao SOBRA altura: a previsao casa com o que a barra pinta',
    (tester) async {
      // **ESTE CASO ANCORA `tetoDaEscalaDoTitulo`.** A `AppBar` do Material
      // embrulha o titulo num `withClampedTextScaling` de 1,34, e a constante do
      // framework e privada -- o valor esta copiado no widget. Se o framework
      // mudar o teto, a previsao de `alturaDaBarra` descasa do retangulo
      // pintado, e e aqui que isso aparece.
      //
      // Medido antes do teto entrar: a 375 dp a 200% a previsao pedia 176 dp
      // para um titulo que a barra pinta em 78 -- 98 dp de barra vazia roubados
      // do corpo da conversa. Errar para cima tambem e defeito.
      for (final largura in larguras) {
        for (final escala in <double>[1.0, 2.0]) {
          await abrirAConversa(tester, largura: largura, escala: escala);
          final barra = tester.getRect(find.byType(AppBar));
          final titulo = tester.getRect(find.byType(TituloDaConversa));
          // O piso de 64 dp pode legitimamente sobrar: ele e o alvo de toque da
          // saida da tela, e nao folga de titulo. Acima dele, nao sobra.
          if (barra.height > BichuAlvoDeToque.critico + 0.01) {
            expect(
              barra.height - titulo.height,
              lessThanOrEqualTo(BichuEspaco.e2 + 0.01),
              reason: 'REPROVA: em $largura dp a ${escala * 100}% a barra tem '
                  '${barra.height.toStringAsFixed(2)} dp para um titulo de '
                  '${titulo.height.toStringAsFixed(2)} dp -- '
                  '${(barra.height - titulo.height).toStringAsFixed(2)} dp de '
                  'barra vazia, contra os ${BichuEspaco.e2.toStringAsFixed(2)} '
                  'de respiro previstos. `tetoDaEscalaDoTitulo` descasou do que '
                  'a `AppBar` aplica.',
            );
          }
          expect(
            titulo.height,
            lessThanOrEqualTo(barra.height + 0.01),
            reason: 'REPROVA: em $largura dp a ${escala * 100}% o titulo e MAIOR '
                'que a barra: a previsao errou para baixo e o texto transborda.',
          );
        }
      }
    },
  );
}
