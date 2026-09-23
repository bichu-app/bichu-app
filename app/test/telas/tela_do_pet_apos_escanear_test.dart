// F2.2 e F2.3 — a tela que o codigo da tag abre. As ISCAS.
//
// O que cada grupo PRECISA reprovar, e o mecanismo que o produz:
//
//  1. `o retorno de resolver` — a chamada volta a ser `await ...resolver(x);`
//     sem atribuicao, e o nome do pet nao chega a tela nenhuma.
//  2. `os tres papeis` — a tela passa a ser a mesma para `owner`,
//     `authenticated_other` e `anonymous`.
//  3. `o pet perdido` — `lost.is_lost` deixa de mudar a tela.
//  4. `a foto que nao vem` — a tela passa a montar uma moldura ou uma imagem
//     para um `photo_url` nulo.
//  5. `nenhuma acao sem destino` — um controle da tela aponta para rota que o
//     roteador nao registra.
//
// **O esperado esta escrito por extenso aqui dentro, e nao lido da classe que
// o produz.** Tres testes deste projeto ja compararam o texto renderizado com
// a mesma constante que o desenha: eles ficavam verdes com qualquer frase,
// inclusive com a frase errada. O preco de repetir o texto e trocar em dois
// lugares no dia em que ele mudar; o preco de nao repetir e um portao que nao
// olha para nada.

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/escanear/tela_do_pet_da_tag.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../a11y/verificador.dart';
import 'ajuda_de_tela.dart';

void main() {
  /// O codigo impresso na plaquinha de teste, o mesmo dos outros casos do
  /// leitor.
  const String codigo = '7K2MQ1D4B8NV3XZ0';
  const String qrDaPlaquinha = 'https://bichu.app/t/$codigo';

  /// A SEGUNDA plaquinha, para as duas comparacoes.
  ///
  /// Elas precisam de duas respostas diferentes na MESMA montagem do app:
  /// `pumpWidget` com o mesmo tipo de widget reaproveita o `State`, entao o
  /// roteador nao volta para a aterrissagem e a segunda medicao nunca
  /// aconteceria -- ela reprovaria por nao achar o botao de escanear, que e um
  /// motivo que nao e o do caso. Dois codigos, um app, um `pop` no meio.
  const String outroCodigo = 'Q4B8NV3XZ07K2M1D';
  const String qrDaOutraPlaquinha = 'https://bichu.app/t/$outroCodigo';

  /// `GET /v1/tags/{code}` como o contrato o declara.
  ///
  /// `photo_url` vai **nulo por padrao**, que e como esta rota responde hoje:
  /// a foto nao e servida por aqui, de proposito. Um teste que mandasse uma
  /// URL de foto por conveniencia estaria exercitando um servidor que nao
  /// existe.
  Future<http.Response> Function(http.Request) redeComTag({
    required String viewer,
    bool perdido = false,
    String? desde,
    String? cuidados,
    String? fotoUrl,
    bool jaAvisou = false,
    String? outroViewer,
    bool outroPerdido = false,
    String? outroDesde,
  }) {
    Map<String, dynamic> corpo({
      required String quem,
      required bool estaPerdido,
      required String? desdeQuando,
    }) {
      return <String, dynamic>{
        'viewer': quem,
        'pet': <String, dynamic>{
          'display_name': 'Thor',
          'species': 'dog',
          'size': 'M',
          'breed_label': 'Vira-lata (SRD)',
          'primary_color': 'preto e branco',
          'distinctive_marks': 'Coleira vermelha.',
          'care_notes': cuidados,
          'photo_url': fotoUrl,
        },
        'lost': <String, dynamic>{'is_lost': estaPerdido, 'since': desdeQuando},
        'already_notified': jaAvisou,
      };
    }

    return (http.Request req) async {
      if (req.url.path == '/v1/tags/$codigo' && req.method == 'GET') {
        return json200(
          corpo(quem: viewer, estaPerdido: perdido, desdeQuando: desde),
        );
      }
      if (req.url.path == '/v1/tags/$outroCodigo' && req.method == 'GET') {
        return json200(
          corpo(
            quem: outroViewer ?? viewer,
            estaPerdido: outroPerdido,
            desdeQuando: outroDesde,
          ),
        );
      }
      if (req.url.path == '/v1/pets' && req.method == 'GET') {
        return json200(<String, dynamic>{'items': <dynamic>[]});
      }
      if (req.url.path.endsWith('/reference-data')) {
        return json200(referenciaDeTeste());
      }
      return http.Response('', 404);
    };
  }

  /// Escaneia a plaquinha pelo caminho de verdade: app montado, porta de
  /// `Pets`, leitor, e o simbolo entregue pela camera.
  ///
  /// Nao monta `TelaDoPetDaTag` solta de proposito. A tela solta continuaria
  /// verde no dia em que o leitor voltasse a descartar o retorno de
  /// `resolver`, que e exatamente a isca 1.
  Future<LeitorDeQrDeTeste> escanear(
    WidgetTester tester, {
    required Future<http.Response> Function(http.Request) rede,
    bool logado = false,
  }) async {
    final leitor = LeitorDeQrDeTeste();
    await abrirOApp(
      tester,
      rede: rede,
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
      leitorDeQr: leitor,
      deposito: logado ? depositoLogado() : null,
    );
    await tester.tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
    await tester.pumpAndSettle();
    leitor.ler(qrDaPlaquinha);
    await tester.pumpAndSettle();
    return leitor;
  }

  /// Os textos que `TelaDoPetDaTag` renderiza, agora.
  List<String> textosDaTela(WidgetTester tester) {
    return tester
        .widgetList<Text>(
          find.descendant(
            of: find.byType(TelaDoPetDaTag),
            matching: find.byType(Text),
          ),
        )
        .map((t) => t.data ?? '')
        .toList(growable: false);
  }

  /// Volta para o leitor e escaneia a SEGUNDA plaquinha, no mesmo app.
  Future<void> escanearAOutra(
    WidgetTester tester,
    LeitorDeQrDeTeste leitor,
  ) async {
    await tester.tap(find.byTooltip('Voltar'));
    await tester.pumpAndSettle();
    leitor.ler(qrDaOutraPlaquinha);
    await tester.pumpAndSettle();
  }

  // -----------------------------------------------------------------------
  // ISCA 1 — o retorno de `resolver` nao pode ser descartado
  // -----------------------------------------------------------------------
  group('ISCA — o retorno de resolver chega a tela', () {
    testWidgets('o nome do pet que o SERVIDOR mandou aparece na tela', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.byType(TelaDoPetDaTag),
        findsOneWidget,
        reason:
            'REPROVA: o codigo resolveu e a tela do pet nao abriu. Se a '
            'chamada voltou a ser `await ...resolver(codigo);` sem '
            'atribuicao, o app paga a ida ao servidor e joga a resposta '
            'fora.',
      );
      expect(
        find.text('Este é o Thor.'),
        findsOneWidget,
        reason:
            'REPROVA: "Thor" veio em `pet.display_name` e a tela nao o '
            'mostra. O nome nao se reconstroi no aparelho: ou ele vem da '
            'resposta, ou nao existe.',
      );
      expect(
        find.textContaining('Coleira vermelha.'),
        findsOneWidget,
        reason:
            'REPROVA: `distinctive_marks` veio na resposta e a linha de '
            'sinais nao o traz. E o que confirma ao achador que o animal no '
            'colo dele e este.',
      );
      expect(
        find.textContaining('Vira-lata (SRD)'),
        findsOneWidget,
        reason:
            'REPROVA: `breed_label` veio na resposta e sumiu. O modelo '
            'voltou a ler so quatro campos de dez.',
      );
    });

    testWidgets('a faixa de "a tela do pet chega na proxima entrega" morreu', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.textContaining('próxima entrega'),
        findsNothing,
        reason:
            'REPROVA: a tela ainda promete a tela do pet para depois. Ela '
            'chegou: prometer de novo e o app dizendo que nao fez o que '
            'acabou de fazer.',
      );
    });

    testWidgets('o cartao de manejo do contrato aparece, com a atribuicao', (
      tester,
    ) async {
      await escanear(
        tester,
        rede: redeComTag(
          viewer: 'anonymous',
          cuidados: 'É medroso, não corra atrás.',
        ),
      );

      expect(
        find.text('É medroso, não corra atrás.'),
        findsOneWidget,
        reason:
            'REPROVA: `care_notes` veio e a tela nao o mostra. E o campo '
            'que muda o que o achador faz nos proximos trinta segundos.',
      );
      expect(
        find.text('O tutor de Thor escreveu:'),
        findsOneWidget,
        reason:
            'REPROVA: o cartao de manejo perdeu a atribuicao. Sem ela, '
            '"e medroso, nao corra atras" e lido como recomendacao generica '
            'do Bichu e perde a autoridade de quem conhece o animal (F4.1, '
            'item 4).',
      );
    });

    testWidgets('sem `care_notes` nao ha cartao vazio', (tester) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.textContaining('Cuidados com'),
        findsNothing,
        reason:
            'REPROVA: o campo veio vazio e a tela desenhou o cartao mesmo '
            'assim. O item 4 da F4.1 diz "nunca um cartao vazio".',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 2 — os tres papeis de `viewer` nao podem ser tratados iguais
  // -----------------------------------------------------------------------
  group('ISCA — `viewer` decide a tela, e sao DUAS formas para tres valores', () {
    testWidgets('o DONO ve a faixa da propria tag, e nunca o titulo do '
        'achador', (tester) async {
      await escanear(tester, rede: redeComTag(viewer: 'owner'), logado: true);

      expect(
        find.text('Esta tag é de Thor.'),
        findsOneWidget,
        reason:
            'REPROVA: o tutor escaneou a plaquinha do proprio pet e a '
            'tela nao diz de quem ela e. E a informacao que muda tudo, e a '
            'acessibilidade da F2.3 manda que ela seja anunciada primeiro.',
      );
      expect(
        find.text('Este é o Thor.'),
        findsNothing,
        reason:
            'REPROVA: o modo dono virou a tela do achador. `viewer: '
            'owner` existe para que o tutor nao receba a peca feita para quem '
            'achou o animal dele.',
      );
    });

    testWidgets('o ESTRANHO ve a tela do achador, e nunca a faixa de dono', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.text('Este é o Thor.'),
        findsOneWidget,
        reason: 'REPROVA: quem nao e o dono nao recebeu a tela do achador.',
      );
      expect(
        find.textContaining('Esta tag é'),
        findsNothing,
        reason:
            'REPROVA: a tela diz a um estranho que a tag e dele. Os tres '
            'papeis viraram um so.',
      );
    });

    testWidgets('`authenticated_other` e `anonymous` veem EXATAMENTE a mesma '
        'coisa', (tester) async {
      // Criterio 7 da BICHUS-57, e ele e uma proibicao: a excecao permanente
      // nao distingue quem esta logado. Uma terceira forma de tela seria
      // distincao que o servidor NAO faz.
      // **Uma montagem so, e as duas respostas na mesma rede.** Um segundo
      // `pumpWidget` reaproveitaria o `State` do app e a medicao cairia por
      // um motivo que nao e o do caso.
      final leitor = await escanear(
        tester,
        rede: redeComTag(
          viewer: 'authenticated_other',
          cuidados: 'É medroso.',
          outroViewer: 'anonymous',
        ),
        logado: true,
      );
      final logada = textosDaTela(tester);
      await escanearAOutra(tester, leitor);
      final anonima = textosDaTela(tester);

      expect(
        logada,
        equals(anonima),
        reason:
            'REPROVA: a tela ficou diferente para quem esta logado e nao '
            'e o dono. O criterio 7 da BICHUS-57 proibe: a excecao permanente '
            'nao distingue quem esta logado, e uma terceira forma seria '
            'distincao que o servidor nao faz.\n'
            'logada:  $logada\n'
            'anonima: $anonima',
      );
      expect(
        anonima,
        isNotEmpty,
        reason:
            'REPROVA: a comparacao acima ficou verde por vazio. Duas '
            'listas vazias sao iguais, e uma tela sem texto nenhum passaria '
            'neste caso sem nunca ter sido olhada.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 3 — o pet perdido precisa se distinguir do pet normal
  // -----------------------------------------------------------------------
  group('ISCA — `lost.is_lost` muda a tela', () {
    testWidgets('perdido, e quem escaneou nao e o dono: a tela diz que o '
        'tutor esta procurando', (tester) async {
      await escanear(
        tester,
        rede: redeComTag(
          viewer: 'anonymous',
          perdido: true,
          desde: '2026-09-16T18:20:00Z',
        ),
      );

      expect(
        find.text('O tutor está procurando Thor desde 16/09.'),
        findsOneWidget,
        reason:
            'REPROVA: um pet marcado como perdido escaneado por um '
            'estranho e o momento mais importante do produto inteiro, e a '
            'tela nao disse nada. `lost.is_lost` veio `true` e nao mudou '
            'nada.',
      );
    });

    testWidgets('NAO perdido: a mesma faixa nao aparece', (tester) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.textContaining('está procurando'),
        findsNothing,
        reason:
            'REPROVA: a tela anuncia busca de um pet que nao esta '
            'perdido. Uma faixa que aparece sempre nao distingue nada, e o '
            'caso acima passaria a ficar verde sem o mecanismo.',
      );
    });

    testWidgets('o perdido e o normal nao renderizam o mesmo', (tester) async {
      // A prova da DIFERENCA, e nao de cada lado sozinho: dois casos que
      // olhassem so para a propria frase continuariam verdes se a tela
      // passasse a mostrar as duas sempre.
      final leitor = await escanear(
        tester,
        rede: redeComTag(
          viewer: 'anonymous',
          perdido: true,
          desde: '2026-09-16T18:20:00Z',
          outroPerdido: false,
        ),
      );
      final comCaso = textosDaTela(tester);
      await escanearAOutra(tester, leitor);
      final semCaso = textosDaTela(tester);

      expect(
        comCaso,
        isNot(equals(semCaso)),
        reason:
            'REPROVA: a tela do pet perdido e a do pet normal sao '
            'identicas. `lost.is_lost` deixou de mudar a tela.\n'
            'com caso: $comCaso\n'
            'sem caso: $semCaso',
      );
    });

    testWidgets('para o DONO, o caso aberto troca a faixa', (tester) async {
      await escanear(
        tester,
        rede: redeComTag(
          viewer: 'owner',
          perdido: true,
          desde: '2026-09-16T18:20:00Z',
        ),
        logado: true,
      );

      expect(
        find.text('Há um caso aberto para Thor desde 16/09.'),
        findsOneWidget,
        reason:
            'REPROVA: o tutor escaneou a tag de um pet com caso aberto e '
            'a tela mostrou a faixa de tag sem caso. A F2.3 tem tres '
            'configuracoes, e a diferenca entre elas e o estado do pet.',
      );
      expect(
        find.text('Esta tag é de Thor.'),
        findsNothing,
        reason:
            'REPROVA: as duas faixas do modo dono aparecem juntas, ou a '
            'do caso aberto nao substituiu a outra.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 4 — a tela nao pode prometer foto
  // -----------------------------------------------------------------------
  group('ISCA — a tela nao promete a foto que esta rota nao serve', () {
    testWidgets('com `photo_url` nulo nao ha moldura, imagem nem simbolo', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        find.descendant(
          of: find.byType(TelaDoPetDaTag),
          matching: find.byType(Moldura),
        ),
        findsNothing,
        reason:
            'REPROVA: a tela montou a moldura da foto para um '
            '`photo_url` nulo. O 5.4 do design system e explicito: sem foto '
            'NAO entra ilustracao e NAO entra o simbolo, porque um desenho '
            'generico faz o achador duvidar de que e o pet certo -- e essa '
            'duvida derruba o aviso. A moldura vazia com o simbolo vale onde '
            'nao ha um animal especifico em jogo, e aqui ha.',
      );
      expect(
        find.descendant(
          of: find.byType(TelaDoPetDaTag),
          matching: find.byType(Image),
        ),
        findsNothing,
        reason:
            'REPROVA: ha uma imagem na tela e o servidor nao mandou foto '
            'nenhuma. `photo_url` vem nulo nesta rota de proposito.',
      );
    });

    testWidgets('no lugar da foto sobem o nome em `display-lg` e os sinais', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      final contexto = tester.element(find.byType(TelaDoPetDaTag));
      final displayLg = Theme.of(contexto).textTheme.displayLarge;
      final titulo = tester.widget<Text>(find.text('Este é o Thor.'));

      expect(
        titulo.style?.fontSize,
        equals(displayLg?.fontSize),
        reason:
            'REPROVA: o nome do pet nao esta em `display-lg`. O 5.4 manda '
            'que ele SUBA no lugar da moldura quando nao ha foto: e ele que '
            'passa a carregar o reconhecimento, e num tamanho menor ele nao '
            'carrega.',
      );
      expect(
        find.textContaining('preto e branco'),
        findsOneWidget,
        reason:
            'REPROVA: o cartao de sinais nao subiu junto. Sem foto, o '
            'texto que descreve o animal e a unica coisa que confirma ao '
            'achador que e o mesmo bicho.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 5 — nenhuma acao sem destino
  // -----------------------------------------------------------------------
  group('ISCA — nenhuma acao desta tela aponta para o vazio', () {
    testWidgets('nao ha `Avisar o tutor` enquanto o aviso nao tiver destino', (
      tester,
    ) async {
      await escanear(
        tester,
        rede: redeComTag(viewer: 'anonymous', perdido: true),
      );

      // `POST /v1/tags/{code}/found-reports` nao tem cliente neste app. Um
      // botao que nao avisa ninguem e PIOR que nenhum botao: o achador vai
      // embora acreditando que avisou. Criterio 2 da BICHUS-62.
      expect(
        find.textContaining('Avisar'),
        findsNothing,
        reason:
            'REPROVA: a tela renderiza `Avisar o tutor` e o app nao tem '
            'como avisar ninguem -- nao ha metodo em `TagsApi`, nao ha fila e '
            'nao ha confirmacao. E o defeito dos dois `Ver meus pets` que o '
            'criterio 2 da BICHUS-62 existe para fechar, e ele nao pode '
            'entrar pela porta que veio fecha-lo. Quando '
            '`POST /tags/{code}/found-reports` tiver cliente, este caso muda '
            'junto com o botao.',
      );
    });

    testWidgets('nao ha acao de dono enquanto `owner-context` nao tiver '
        'cliente', (tester) async {
      await escanear(tester, rede: redeComTag(viewer: 'owner'), logado: true);

      for (final rotulo in <String>[
        'Ver o caso',
        'Marcar como perdida',
        'Ver o arquivo da tag',
        'Já coloquei na coleira',
      ]) {
        expect(
          find.text(rotulo),
          findsNothing,
          reason:
              'REPROVA: "$rotulo" esta na tela. As quatro acoes de dono '
              'precisam de `pet_id` e `tag_id`, e o contrato os poe em '
              '`GET /tags/{code}/owner-context`, que nao tem cliente neste '
              'app. Rotulo sem destino e o defeito do `Ver meus pets`.',
        );
      }
    });

    testWidgets('todo controle tocavel da tela tem acao, e a saida funciona', (
      tester,
    ) async {
      await escanear(tester, rede: redeComTag(viewer: 'anonymous'));

      expect(
        rotasRegistradasDoApp(tester),
        contains(Rotas.petDaTag),
        reason:
            'REPROVA: a tela abriu sem endereco registrado. Estado que '
            'merece link tem endereco, e o link da tag (BICHUS-38 e '
            'BICHUS-39) precisa de um lugar para chegar.',
      );

      final saida = find.byTooltip('Voltar');
      expect(
        saida,
        findsOneWidget,
        reason:
            'REPROVA: a tela do pet nao tem saida. Ela e alcancada por '
            'scan, muitas vezes por engano, e sem saida vira o beco da '
            'BICHUS-157.',
      );
      await tester.tap(saida);
      await tester.pumpAndSettle();
      expect(
        find.byType(TelaDoPetDaTag),
        findsNothing,
        reason: 'REPROVA: a saida e um rotulo: tocar nela nao saiu da tela.',
      );
    });
  });

  // -----------------------------------------------------------------------
  // ISCA 6 — a arvore de semantica do APP MONTADO
  // -----------------------------------------------------------------------
  group('ISCA — nenhum controle desta tela se anuncia como botao sem acao', () {
    // Quatro widgets deste app ja foram achados com `btn=true tap=false`:
    // `Semantics(button: true, excludeSemantics: true)` apaga a arvore do
    // filho e leva junto o `onTap` que o `InkWell` publicava. Quem usa
    // TalkBack ou VoiceOver ouve que existe um botao e nao consegue aciona-lo
    // (WCAG 2.1 SC 4.1.2).
    //
    // A fonte e a arvore **em execucao**, e nunca o texto do arquivo: uma
    // varredura de fonte casa com a mencao ao proprio mecanismo dentro de um
    // comentario, e foi assim que uma isca da BICHUS-164 nasceu furada.
    testWidgets('no achador, com o pet perdido e o cartao de manejo na tela', (
      tester,
    ) async {
      final handle = tester.ensureSemantics();
      await escanear(
        tester,
        rede: redeComTag(
          viewer: 'anonymous',
          perdido: true,
          desde: '2026-09-16T18:20:00Z',
          cuidados: 'É medroso, não corra atrás.',
        ),
      );
      final v = verificarAcaoDosControles(
        tester,
        tela: 'f2.2 achador',
        tema: 'claro',
        // Sem contagem exata: a tela e empilhada sobre a casca de abas, e o
        // que a casca deixa na arvore por baixo muda com outras telas. O piso
        // de "pelo menos um botao" continua valendo, e e ele que impede o
        // portao de ficar verde por nao estar olhando para nada.
      );
      expect(
        v,
        isEmpty,
        reason:
            'REPROVA: ha controle anunciado como botao e sem acao em '
            '"f2.2 achador".\n${relatorio(v)}',
      );
      handle.dispose();
    });

    testWidgets('no modo dono', (tester) async {
      final handle = tester.ensureSemantics();
      await escanear(tester, rede: redeComTag(viewer: 'owner'), logado: true);
      final v = verificarAcaoDosControles(
        tester,
        tela: 'f2.3 modo dono',
        tema: 'claro',
      );
      expect(
        v,
        isEmpty,
        reason:
            'REPROVA: ha controle anunciado como botao e sem acao em '
            '"f2.3 modo dono".\n${relatorio(v)}',
      );
      handle.dispose();
    });

    testWidgets('a faixa e anunciada como regiao viva, e vem antes do nome', (
      tester,
    ) async {
      // A acessibilidade da F2.3 exige isso por nome: a faixa carrega a
      // informacao que muda tudo, e ela precisa ser anunciada antes de
      // qualquer outra coisa da tela.
      final handle = tester.ensureSemantics();
      await escanear(
        tester,
        rede: redeComTag(
          viewer: 'anonymous',
          perdido: true,
          desde: '2026-09-16T18:20:00Z',
        ),
      );
      final textos = textosDaTela(tester);
      expect(
        textos.first,
        equals('O tutor está procurando Thor desde 16/09.'),
        reason:
            'REPROVA: a faixa do pet perdido nao e o primeiro texto da '
            'tela. Quem usa leitor de tela ouve o nome do animal antes de '
            'saber que ele esta sendo procurado, que e a informacao que muda '
            'o que a pessoa faz.\n$textos',
      );
      expect(
        find.bySemanticsLabel('O tutor está procurando Thor desde 16/09.'),
        findsAtLeastNWidgets(1),
        reason: 'REPROVA: a faixa nao tem nome acessivel.',
      );
      handle.dispose();
    });
  });

  // -----------------------------------------------------------------------
  // O corpo do contrato, campo a campo
  // -----------------------------------------------------------------------
  test('`TagResolvida` le os dez campos que `TagResolution` declara', () {
    // Le do JSON, e nao da tela: o desserializador foi onde os seis campos se
    // perderam, e um teste de tela so acusaria os que a tela por acaso mostra.
    final tag = TagResolvida.doJson(
      jsonDecode(
        '{"viewer":"owner",'
        '"pet":{"display_name":"Thor","species":"dog","size":"GG",'
        '"breed_label":"Vira-lata (SRD)","primary_color":"preto e branco",'
        '"distinctive_marks":"Coleira vermelha.","care_notes":"É medroso.",'
        '"photo_url":"https://exemplo/card.webp"},'
        '"lost":{"is_lost":true,"since":"2026-09-16T18:20:00Z"},'
        '"already_notified":true}',
      ) as Map<String, dynamic>,
    );

    expect(tag.nomeDoPet, 'Thor');
    expect(tag.especie.valor, 'dog');
    expect(tag.porte?.valor, 'GG');
    expect(tag.racaRotulo, 'Vira-lata (SRD)');
    expect(tag.corPrincipal, 'preto e branco');
    expect(tag.sinaisDistintivos, 'Coleira vermelha.');
    expect(tag.notasDeCuidado, 'É medroso.');
    expect(tag.fotoUrl, 'https://exemplo/card.webp');
    expect(tag.estaPerdido, isTrue);
    expect(tag.perdidoDesde, DateTime.utc(2026, 9, 16, 18, 20));
    expect(
      tag.jaAvisouDesteAparelho,
      isTrue,
      reason:
          'REPROVA: `already_notified` voltou a ser descartado. Ele muda '
          'o texto do botao de avisar, e o botao chega com a BICHUS-58: '
          'perde-lo agora e perde-lo de novo.',
    );
  });
}
