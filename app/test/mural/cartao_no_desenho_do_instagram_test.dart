// O CARTAO DO MURAL NO DESENHO DO INSTAGRAM — duas falas do cliente, no mesmo
// dia (29/10/2026).
//
//   1. *"vamos melhorar a interface dos posts no mural e deixar mais parecido
//      com o instagram (foto anexo), onde o texto digitado vai pra baixo dos
//      likes e comentarios, o nome do usuario e a foto dele, fica sobre a
//      imagem."*
//   2. depois de ver a primeira volta: *"mantenha essa barra com o nome e
//      perfil do usuario preta, porem com transparencia e diminua bastante
//      para que isso nao interfira na foto, igual acontece no instagram"*
//
// **A foto que ele citou nunca chegou na mensagem.** O que substitui a
// referencia visual e o protitipo HTML em
// `workspace/artefatos-app/mural-cartao-no-desenho-do-instagram-29-10.html`, e
// o que substitui a conferencia a olho sao os casos deste arquivo.
//
// ===========================================================================
// POR QUE A MEDICAO DE CONTRASTE AQUI NAO USA `razaoMedidaDoTexto`
// ===========================================================================
// E a parte mais importante deste arquivo, e ela mudou com a segunda fala do
// cliente.
//
// `razaoMedidaDoTexto` (o motor do job `contraste` da esteira) acha o fundo
// pelo ancestral com preenchimento SOLIDO -- `_fundoSolidoMaisProximo` exige
// `alpha >= 1.0`. Enquanto a barra era uma tarja OPACA, ela era esse
// ancestral e o verificador media exatamente o par que a pessoa ve.
//
// **Com a barra translucida ele deixa de conseguir.** O veu e pulado, o
// verificador sobe a arvore e encontra a `surface` do CARTAO -- que nao esta
// atras do nome. No tema claro isso daria tinta clara sobre superficie clara e
// o numero seria absurdo; no escuro seria outro numero igualmente irreal. Nos
// dois casos ele estaria medindo um par que nao existe na tela.
//
// Entao a medicao daqui COMPOE o veu a mao, como o aparelho compoe:
//
//   composto = veu * alfa + foto * (1 - alfa)
//
// sobre a foto BRANCA, que e o pior caso -- e so entao chama a `razaoWcag` do
// verificador, que continua sendo a conta da casa. Os dois extremos entram no
// caso: foto branca (pior) e foto preta (melhor), e a assercao e sobre a pior.
//
// **E a cor, o alfa e a tinta nao sao escritos a mao aqui**: saem do widget
// RENDERIZADO (o `ColoredBox` do veu e o `RenderParagraph` do nome). Se o
// token `scrim` mudar, o numero muda com ele e o caso acusa.
//
// A sub-arvore tambem leva a chave de isencao do paragrafo 18.2.1
// (`VeuDoAutorSobreMidia.chaveDeIsencao`), para que a cegueira do verificador
// fique MARCADA e publicada pelo job, e nao escondida.
//
// ===========================================================================
// DESLIGAR PARA VER REPROVAR — cada isca com o seu interruptor, com nome
// ===========================================================================
// Tudo abaixo foi MEDIDO, desfazendo um mecanismo de cada vez.
//
//  1. Em `_CartaoDaPublicacao._comImagem`, tire a linha do autor de dentro do
//     `Stack` e ponha-a de volta acima da `ImagemDaRede`, numa `Column` (o
//     layout ANTIGO).
//     -> reprova `ISCA (ordem) — o autor fica SOBRE a imagem, dentro dela`,
//        dizendo o retangulo do nome e o da foto.
//
//  2. Em `_comImagem`, troque a ordem das duas filhas do `Column` de baixo:
//     legenda antes de `_AcoesDaPublicacao`.
//     -> reprova `ISCA (ordem) — a legenda vem DEPOIS das acoes`, com as duas
//        coordenadas.
//
//  3. Em `VeuDoAutorSobreMidia.build`, troque `tema.cores.scrim` por um preto
//     mais transparente (ex.: `Colors.black.withValues(alpha: 0.40)`).
//     -> reprova `ISCA (contraste) — o nome sobre o veu passa o piso na FOTO
//        BRANCA` no tema claro, dizendo a razao medida. Medido: a 0,40 o
//        composto sobre branco e `#999999` e o nome mede 2,73:1.
//
//  4. Em `VeuDoAutorSobreMidia`, suba `alturaDaBarra` de 40 para 56.
//     -> reprova `ISCA (discricao) — a barra e a mais baixa que ainda cabe o
//        alvo de toque do menu`.
//
//  5. Em `_comImagem`, mova o `⋮` para DENTRO da `Row` do veu (tire o
//     `Positioned` e devolva `_menu(context)` a linha).
//     -> reprova `ISCA (discricao) — o alvo de toque do `⋮` continua com 48
//        dp`, porque a barra de 40 dp passa a comprimir o botao.
//
//  6. Em `_CartaoDaPublicacao.build`, mande a publicacao SEM imagem para
//     `_comImagem`.
//     -> reprova `ISCA (sem foto) — publicacao so de texto nao perde o texto
//        para baixo das acoes`.

import 'dart:math' as math;

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/veu_do_autor_sobre_midia.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../a11y/verificador.dart' show razaoWcag;
import '../telas/ajuda_de_tela.dart';

const String _urlBase = 'https://api.exemplo.test';

/// A derivada `card` de 1024 da foto da publicacao.
const String _urlDaFoto = 'https://img.exemplo/people/card/aaaa.jpeg';

const String _nome = 'Marina';
const String _texto = 'o Bidu no parque';

/// O PIOR CASO, e e ele que decide. Uma foto pode ser um ceu de meio-dia, e e
/// sobre branco que o veu preto clareia mais.
const Color _fotoBranca = Color(0xFFFFFFFF);

/// O melhor caso. Entra como CONTRAPESO: sem ele, um caso que medisse sempre o
/// mesmo numero nao provaria que a composicao depende da foto.
const Color _fotoPreta = Color(0xFF000000);

/// O piso do SC 1.4.3 para texto comum em tela nao critica.
const double _pisoDeTexto = 4.5;

/// A ALTURA ACORDADA DA BARRA, escrita A MAO de proposito.
///
/// Ler `VeuDoAutorSobreMidia.alturaDaBarra` aqui faria os dois lados do
/// `expect` andarem juntos e o caso mediria a si mesmo -- medido: com a
/// constante nos dois lados, subir a barra de 40 para 56 deixava o caso VERDE.
/// Numero repetido a mao e o preco de o caso saber o que esta cobrando.
const double _alturaTravadaDaBarra = 40;

Map<String, dynamic> _publicacao({bool comFoto = true}) {
  return <String, dynamic>{
    'ref': 'AaBbCcDdEeFfGgHhIiJjK1',
    'body': _texto,
    'created_at': '2026-10-29T12:00:00.000Z',
    'image': comFoto
        ? <String, dynamic>{'url': _urlDaFoto, 'alt_text': '[teste] a foto'}
        : null,
    'author': <String, dynamic>{
      'handle': 'marina-vet',
      'display_name': _nome,
      'photo_icon_url': null,
    },
    'mine': false,
  };
}

/// Monta o corpo do Mural com UMA publicacao, no tema pedido.
///
/// A porta e a de VERDADE (`MuralApi` sobre `ApiClient`), como no resto da
/// suite do Mural: um duble responderia igual para qualquer rota e os casos
/// nao teriam o que observar.
Future<void> _montar(
  WidgetTester tester, {
  bool comFoto = true,
  bool escuro = false,
}) async {
  AppConfig.limparParaTeste();
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
    cliente: MockClient((http.Request req) async {
      if (req.url.path == '/v1/timeline' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <Map<String, dynamic>>[_publicacao(comFoto: comFoto)],
          'next_cursor': null,
        });
      }
      if (req.url.path == '/v1/me/publications' && req.method == 'GET') {
        return json200(<String, dynamic>{
          'items': <Map<String, dynamic>>[],
          'next_cursor': null,
        });
      }
      return problema('not-found', 404);
    }),
    tokenDeAcesso: () async => 'token-de-medicao',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: escuro ? BichuTheme.escuro : BichuTheme.claro,
      home: Scaffold(
        body: SingleChildScrollView(
          child: CorpoDoMural(
            leitura: MuralApi(api),
            interacao: MuralApi(api),
            // **`aoDenunciar` TEM de vir**, e nao e enfeite do arranjo: sem
            // ele `_menu` devolve `SizedBox.shrink()` (menu sem opcao nao
            // nasce), e os casos do alvo de toque ficariam verdes por nao
            // haver botao nenhum para medir.
            aoDenunciar: (_) {},
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// A foto da PUBLICACAO, pela URL da derivada e nao pela ordem: o cartao
/// desenha ate duas `ImagemDaRede` (o icone do autor e a foto), e contar
/// posicao reprovaria no dia em que ele ganhasse mais uma.
Finder _aFoto() =>
    find.byWidgetPredicate((w) => w is ImagemDaRede && w.url == _urlDaFoto);

Finder _oMenu() => find.byTooltip('Opções da publicação');

/// A cor do veu COM o alfa, lida do widget renderizado.
Color _corDoVeu(WidgetTester tester) {
  return tester
      .widget<ColoredBox>(
        find
            .descendant(
              of: find.byType(VeuDoAutorSobreMidia),
              matching: find.byType(ColoredBox),
            )
            .first,
      )
      .color;
}

/// A cor que de fato foi para o nome, lida do `RenderParagraph`. E a mesma
/// leitura que `verificador.dart` faz.
Color _tintaDoNome(WidgetTester tester) {
  for (final elemento in tester.allElements) {
    final ro = elemento.renderObject;
    if (ro is! RenderParagraph) continue;
    if (ro.text.toPlainText().trim() != _nome) continue;
    final cor = ro.text.style?.color;
    if (cor == null) {
      fail('REPROVA: o nome "$_nome" foi pintado sem cor resolvida.');
    }
    return cor;
  }
  fail('REPROVA: nao achei o texto "$_nome" na arvore.');
}

/// A composicao que o aparelho faz: [frente] com o seu alfa sobre [fundo].
///
/// **E o unico lugar deste arquivo onde a conta e escrita a mao**, e ela e a
/// composicao `source-over` do proprio Flutter. O resto -- cor, alfa, tinta e
/// a razao -- sai do widget renderizado e da `razaoWcag` do verificador.
Color _compor(Color frente, Color fundo) {
  final a = frente.a;
  double canal(double f, double b) => f * a + b * (1 - a);
  return Color.from(
    alpha: 1,
    red: canal(frente.r, fundo.r),
    green: canal(frente.g, fundo.g),
    blue: canal(frente.b, fundo.b),
  );
}

String _hex(Color c) {
  String d(double v) =>
      (v * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${d(c.r)}${d(c.g)}${d(c.b)}'.toUpperCase();
}

void main() {
  // =========================================================================
  // (1) A ORDEM NOVA, COM FOTO
  // =========================================================================
  group('ISCA (ordem) — a publicacao COM foto segue o pedido de 29/10', () {
    testWidgets('ISCA (ordem) — o autor fica SOBRE a imagem, dentro dela', (
      tester,
    ) async {
      await _montar(tester);

      // ANCORA: o cartao chegou. Sem ela, "o nome esta sobre a foto" poderia
      // significar "a tela nao carregou nada e nao ha nada a comparar".
      expect(
        _aFoto(),
        findsOneWidget,
        reason:
            'REPROVA NA ANCORA: a foto da publicacao nao esta na arvore, e o '
            'caso nao esta medindo sobreposicao nenhuma.',
      );
      expect(find.text(_nome), findsOneWidget);

      final daFoto = tester.getRect(_aFoto());
      final doNome = tester.getRect(find.text(_nome));

      // SOBRE a imagem significa DENTRO dela, nos quatro lados. No layout
      // antigo o nome ficava ACIMA da foto: `doNome.bottom` era menor que
      // `daFoto.top`, e esta assercao reprova dizendo os dois retangulos.
      expect(
        daFoto.contains(doNome.topLeft) && daFoto.contains(doNome.bottomRight),
        isTrue,
        reason:
            'REPROVA: o nome do autor NAO esta dentro do retangulo da foto. '
            'foto=$daFoto nome=$doNome. O cliente pediu o nome e a foto do '
            'autor SOBRE a imagem; acima dela e o desenho de que ele pediu '
            'para sair.',
      );

      expect(
        find.byType(VeuDoAutorSobreMidia),
        findsOneWidget,
        reason:
            'REPROVA: o autor esta sobre a imagem sem o veu. Nome claro '
            'direto sobre foto arbitraria mede 1,02:1 contra uma foto branca.',
      );
    });

    testWidgets('ISCA (ordem) — a legenda vem DEPOIS das acoes', (
      tester,
    ) async {
      await _montar(tester);

      final oCoracao = tester.getRect(find.byTooltip('Curtir'));
      final aLegenda = tester.getRect(find.text(_texto));

      expect(
        aLegenda.top,
        greaterThan(oCoracao.bottom),
        reason:
            'REPROVA: a legenda esta ACIMA das acoes. legenda.top='
            '${aLegenda.top} coracao.bottom=${oCoracao.bottom}. O pedido do '
            'cliente de 29/10/2026 e explicito: *"o texto digitado vai pra '
            'baixo dos likes e comentarios"*.',
      );
    });
  });

  // =========================================================================
  // (2) A DISCRICAO DA BARRA — *"diminua bastante"*
  // =========================================================================
  group('ISCA (discricao) — a barra e a menor que passa', () {
    testWidgets(
      'ISCA (discricao) — a barra ENCOSTA no topo e vai de ponta a ponta',
      (tester) async {
        await _montar(tester);

        final daFoto = tester.getRect(_aFoto());
        final doVeu = tester.getRect(find.byType(VeuDoAutorSobreMidia));

        // Recuo nenhum: pastilha recuada ocupa a mesma altura E ainda deixa uma
        // faixa de foto morta acima dela.
        expect(
          doVeu.top,
          moreOrLessEquals(daFoto.top, epsilon: 0.5),
          reason: 'REPROVA: a barra nao encosta no topo da foto. '
              'foto=$daFoto veu=$doVeu',
        );
        expect(
          doVeu.width,
          moreOrLessEquals(daFoto.width, epsilon: 0.5),
          reason: 'REPROVA: a barra nao vai de ponta a ponta. veu=$doVeu',
        );
      },
    );

    testWidgets(
      'ISCA (discricao) — a barra e a mais baixa que ainda cabe o alvo de '
      'toque do menu',
      (tester) async {
        await _montar(tester);

        final doVeu = tester.getRect(find.byType(VeuDoAutorSobreMidia));

        // **O NUMERO E LITERAL AQUI, E NAO LIDO DA CONSTANTE.** Ler
        // `VeuDoAutorSobreMidia.alturaDaBarra` faria os dois lados do
        // `expect` andarem juntos: subir a constante para 56 deixaria o caso
        // VERDE, medindo a si mesmo. Medido -- foi exatamente o que aconteceu
        // na primeira forma deste caso.
        expect(
          doVeu.height,
          moreOrLessEquals(_alturaTravadaDaBarra, epsilon: 0.5),
          reason:
              'REPROVA: a barra mede ${doVeu.height} dp e nao '
              '$_alturaTravadaDaBarra. O cliente pediu *"diminua bastante '
              'para que isso nao interfira na foto"*, e este e o valor '
              'acordado.',
        );

        // E A BARRA E MAIS BAIXA QUE O ALVO DE TOQUE DO MENU. E esta a
        // assercao que diz que ela foi espremida de verdade: enquanto o `⋮`
        // morava dentro da `Row` do veu, a barra NAO PODIA ficar abaixo de 48
        // dp. So sai disso quem tira o botao da linha.
        expect(
          doVeu.height,
          lessThan(BichuAlvoDeToque.min),
          reason:
              'REPROVA: a barra mede ${doVeu.height} dp, que e o alvo de '
              'toque do menu (${BichuAlvoDeToque.min}) ou mais. Ela nao esta '
              'mais baixa do que o botao que flutua sobre ela -- sinal de que '
              'o `⋮` voltou para dentro da linha e passou a mandar na altura.',
        );

        // E A PROPORCAO QUE O CLIENTE SENTE: quanto da foto a barra cobre.
        final fracao = doVeu.height / tester.getRect(_aFoto()).height;
        expect(
          fracao,
          lessThan(0.15),
          reason:
              'REPROVA: a barra cobre ${(fracao * 100).toStringAsFixed(1)}% '
              'da altura da foto. O criterio dele e *"nao interfira na '
              'foto"*.',
        );
      },
    );

    testWidgets('ISCA (discricao) — o alvo de toque do `⋮` continua com 48 dp',
        (tester) async {
      await _montar(tester);

      final doMenu = tester.getRect(_oMenu());
      final doVeu = tester.getRect(find.byType(VeuDoAutorSobreMidia));

      // O PISO QUE NAO ENCOLHE COM A BARRA (WCAG 2.5.5, paragrafo 6.5). E ele
      // que tirou o `⋮` de dentro da `Row` do veu: la dentro, uma barra de 40
      // dp o comprimiria.
      expect(
        math.min(doMenu.width, doMenu.height),
        greaterThanOrEqualTo(BichuAlvoDeToque.min),
        reason:
            'REPROVA: o alvo de toque do menu mede '
            '${doMenu.width} x ${doMenu.height} dp, abaixo do piso de '
            '${BichuAlvoDeToque.min}. Encolher o alvo para a barra caber e '
            'afrouxar o portao, nao obedecer o cliente.',
      );

      // E O GLIFO continua SOBRE o veu, que e o que lhe da contraste: o alvo
      // pode transbordar, o simbolo nao.
      expect(
        doMenu.center.dy,
        lessThan(doVeu.bottom),
        reason:
            'REPROVA: o centro do `⋮` (${doMenu.center.dy}) caiu abaixo do veu '
            '(${doVeu.bottom}); o simbolo passou a pousar na foto crua.',
      );
    });
  });

  // =========================================================================
  // (3) O CONTRASTE DO NOME SOBRE O VEU, NO PIOR CASO
  // =========================================================================
  group('ISCA (contraste) — o nome sobre o veu passa o piso na FOTO BRANCA',
      () {
    for (final escuro in <bool>[false, true]) {
      final tema = escuro ? 'escuro' : 'claro';

      testWidgets(
        'ISCA (contraste) — o nome sobre o veu passa o piso na FOTO BRANCA, '
        'tema $tema',
        (tester) async {
          await _montar(tester, escuro: escuro);

          final veu = _corDoVeu(tester);
          final tinta = _tintaDoNome(tester);

          // CONTRAPESO: o veu e TRANSLUCIDO. Opaco, o pior caso desta medicao
          // deixaria de existir e o caso ficaria verde sem medir a foto --
          // alem de desobedecer o cliente, que pediu *"preta, porem com
          // transparencia"*.
          expect(
            veu.a,
            lessThan(1.0),
            reason:
                'REPROVA NO CONTRAPESO: o veu esta OPACO (alpha=${veu.a}). O '
                'cliente pediu preta COM transparencia, e sem transparencia '
                'esta medicao nao tem pior caso para medir.',
          );

          final sobreBranco = _compor(veu, _fotoBranca);
          final sobrePreto = _compor(veu, _fotoPreta);
          final pior = razaoWcag(tinta, sobreBranco);
          final melhor = razaoWcag(tinta, sobrePreto);

          // CONTRAPESO: a foto PARTICIPA da cor final. Se as duas razoes
          // fossem iguais, a composicao nao estaria acontecendo e o numero
          // de cima nao valeria nada.
          expect(
            melhor,
            greaterThan(pior),
            reason:
                'REPROVA NO CONTRAPESO: foto branca e foto preta deram a '
                'mesma razao ($pior). A composicao nao esta acontecendo.',
          );

          expect(
            pior,
            greaterThanOrEqualTo(_pisoDeTexto),
            reason:
                'REPROVA: o nome sobre o veu mede '
                '${pior.toStringAsFixed(2)}:1 no tema $tema com a FOTO '
                'BRANCA, abaixo do piso de $_pisoDeTexto.\n'
                '  veu=${_hex(veu)} alfa=${veu.a.toStringAsFixed(3)}\n'
                '  composto sobre branco=${_hex(sobreBranco)}\n'
                '  tinta=${_hex(tinta)}\n'
                '  (sobre foto preta daria ${melhor.toStringAsFixed(2)}:1, e '
                'por isso a foto media nao serve de medida)\n'
                'Deixar a barra mais transparente baixa este numero. O alfa '
                'MINIMO de `#1C1B19` para o nome alcancar 4,5:1 sobre branco '
                'e 0,612, e o token `scrim` vale 0,64 -- a folga e essa, e '
                'ela ja esta gasta.',
          );
        },
      );
    }
  });

  // =========================================================================
  // (4) A PUBLICACAO SEM FOTO — o buraco deste tipo de mudanca
  // =========================================================================
  testWidgets(
    'ISCA (sem foto) — publicacao so de texto nao perde o texto para baixo '
    'das acoes',
    (tester) async {
      await _montar(tester, comFoto: false);

      // ANCORA e CONTRAPESO ao mesmo tempo: a publicacao chegou E nao tem
      // foto. Sem ele o caso passaria numa tela que nao desenhou nada.
      expect(find.text(_texto), findsOneWidget);
      expect(
        _aFoto(),
        findsNothing,
        reason:
            'REPROVA NO CONTRAPESO: ha foto na arvore, e o caso precisa da '
            'publicacao SO DE TEXTO para medir o estado sem imagem.',
      );

      // Sem imagem nao ha onde sobrepor nada, e um veu preto sobre a `surface`
      // do cartao seria uma tarja escura no meio de um cartao claro.
      expect(
        find.byType(VeuDoAutorSobreMidia),
        findsNothing,
        reason:
            'REPROVA: ha um veu sobre midia num cartao que nao tem midia.',
      );

      final oNome = tester.getRect(find.text(_nome));
      final oTexto = tester.getRect(find.text(_texto));
      final oCoracao = tester.getRect(find.byTooltip('Curtir'));

      // A ordem aqui e autor -> texto -> acoes, e ela DIVERGE do pedido de
      // 29/10 de proposito. O porque esta na prosa de
      // `_CartaoDaPublicacao.build`: texto e obrigatorio ao publicar e foto e
      // opcional, entao publicacao so de texto existe; e nela o texto nao e
      // legenda de nada, e o conteudo inteiro. **Decisao a confirmar com o
      // cliente** -- se ele quiser a ordem nova tambem aqui, e este caso que
      // muda, e a mudanca fica visivel no diff.
      expect(
        oTexto.top,
        greaterThan(oNome.bottom),
        reason:
            'REPROVA: o texto nao esta abaixo do autor. texto.top='
            '${oTexto.top} nome.bottom=${oNome.bottom}',
      );
      expect(
        oCoracao.top,
        greaterThan(oTexto.bottom),
        reason:
            'REPROVA: as acoes nao estao abaixo do texto. Numa publicacao sem '
            'foto o texto NAO e legenda: ele e a publicacao inteira, e po-lo '
            'embaixo do coracao deixaria o cartao como `$_nome / ♥ 💬 / '
            'texto`, com o conteudo abaixo dos controles que agem sobre ele. '
            'coracao.top=${oCoracao.top} texto.bottom=${oTexto.bottom}',
      );
    },
  );
}
