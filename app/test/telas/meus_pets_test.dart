// BICHUS-62 — `Perfil` › `Meus pets`.
//
// O destino e o da secao 27.6 de docs/05-ux-research.md: os cartoes do
// paragrafo 11.3 moram no Perfil, e o que mudou em relacao ao texto original
// da historia foi o gatilho dos criterios, que deixou de ser "quando o Inicio
// abre".
//
// Os casos marcados ISCA sao os que a historia exige que REPROVEM com o
// mecanismo desligado. Cada um diz, no proprio corpo, qual mecanismo e esse.

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/widgets/cartao_de_pet.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart'
    show petDoContrato, fotoDoContrato;
import 'ajuda_de_tela.dart';

/// O texto que a Inicio renderizava incondicionalmente ate esta historia.
///
/// Fica escrito aqui **de proposito**: e o que o cliente leu depois de
/// cadastrar o pet dele, e o criterio 11 exige que ele nao volte.
const String textoVelhoDoVazio = 'Nenhum pet cadastrado ainda';

/// A rede que responde `GET /v1/pets` com [items] e 404 em qualquer outra
/// rota.
///
/// **404 no resto, e nao 200 vazio**: um caso que dependesse de uma chamada
/// nao declarada aqui precisa falhar ruidosamente, e nao passar por acidente.
Future<http.Response> Function(http.Request) redeComPets(
  List<Map<String, dynamic>> items, {
  List<String>? chamadas,
}) {
  return (req) async {
    chamadas?.add('${req.method} ${req.url.path}');
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': items});
    }
    return problema('not-found', 404);
  };
}

Future<void> abrirOPerfil(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  CacheDeMeusPets? cache,
}) async {
  await abrirOApp(
    tester,
    rede: rede,
    deposito: depositoLogado(),
    cacheDeMeusPets: cache,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
  await tester.pumpAndSettle();
}

/// O no de semantica do cartao, e quantos nos ele guarda dentro de si.
///
/// Conta **nos**, e nao widgets `Semantics`: o no e onde o VoiceOver e o
/// TalkBack param a cada deslize, e e ele que o criterio 5 limita a um.
///
/// `tester.getSemantics` sobe ate o no mais proximo do widget. Com o
/// `MergeSemantics` do cartao esse no e o do proprio cartao e ele nao tem
/// filho nenhum; sem o merge, o nome, os atributos e o selo viram nos
/// separados e [SemanticsNode.childrenCount] deixa de ser zero -- que e
/// exatamente o que este caso reprova.
({SemanticsNode no, int filhos}) semanticaDoCartao(
  WidgetTester tester,
  Finder cartao,
) {
  final no = tester.getSemantics(cartao);
  var filhos = 0;
  void contar(SemanticsNode pai) {
    pai.visitChildren((filho) {
      filhos += 1;
      contar(filho);
      return true;
    });
  }

  contar(no);
  return (no: no, filhos: filhos);
}

void main() {
  group('criterio 1 — um cartao por pet, na variante `lista` do 11.3', () {
    testWidgets('os pets da conta viram cartoes, com nome e atributos',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[
          petDoContrato(
            fotos: <Map<String, dynamic>>[fotoDoContrato()],
          ),
          petDoContrato(
            id: 'p-2',
            nome: 'Tobias',
            especie: 'cat',
            porte: 'P',
            raca: null,
          ),
        ]),
      );

      expect(find.byType(CartaoDePet), findsNWidgets(2));
      expect(find.text('Nina'), findsOneWidget);
      expect(find.text('Cão · Vira-lata (SRD) · Médio'), findsOneWidget);
      expect(find.text('Tobias'), findsOneWidget);
      // Raca ausente **some da linha**, e nao vira travessao.
      expect(find.text('Gato · Pequeno'), findsOneWidget);
    });

    testWidgets('a tela tem o titulo `Meus pets`', (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[petDoContrato()]),
      );
      expect(find.text(MeusPets.titulo), findsOneWidget);
    });
  });

  group('criterio 2 — ISCA: nenhuma acao sem destino nesta tela', () {
    testWidgets(
        'todo elemento tocavel tem callback e aponta para rota registrada',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[
          petDoContrato(),
          petDoContrato(id: 'p-2', nome: 'Tobias', status: 'lost'),
        ]),
      );

      // O mecanismo que este caso liga: **nao ha acao de perdido nesta tela**,
      // porque a tela que ela abre (BICHUS-21) nao existe. Desligar o
      // mecanismo e acrescentar o botao; o caso reprova nomeando-o.
      for (final proibido in <String>[
        'Marcar como perdido',
        'Marcar como perdida',
        'Perdi meu pet',
      ]) {
        expect(
          find.text(proibido),
          findsNothing,
          reason: 'REPROVA: "$proibido" esta na tela e a BICHUS-21 nao '
              'existe. E o mesmo defeito do `Ver meus pets` sem destino que '
              'esta historia veio fechar, entrando pela porta que veio '
              'fecha-lo (criterio 2).',
        );
      }

      // E nenhum controle desabilitado tampouco: "nem habilitado nem
      // desabilitado", diz o criterio.
      final botoes = tester.widgetList<ButtonStyleButton>(
        find.descendant(
          of: find.byType(MeusPets),
          matching: find.byType(ButtonStyleButton),
        ),
      );
      for (final botao in botoes) {
        expect(
          botao.onPressed,
          isNotNull,
          reason: 'REPROVA: ha um botao sem `onPressed` dentro de Meus pets. '
              'Controle desligado e promessa sem destino.',
        );
      }
    });

    testWidgets('o cartao de pet nao e um alvo de toque hoje', (tester) async {
      // O 11.3 descreve o cartao como destino de navegacao, e a tela de
      // detalhe do pet esta fora desta historia. Enquanto ela nao existir, um
      // cartao clicavel seria uma acao sem destino.
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[petDoContrato()]),
      );
      expect(
        find.descendant(
          of: find.byType(CartaoDePet),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );
      expect(
        find.descendant(
          of: find.byType(CartaoDePet),
          matching: find.byType(GestureDetector),
        ),
        findsNothing,
      );
    });
  });

  group('criterio 4 — o convite de plaquinha aparece no cartao do pet sem tag',
      () {
    testWidgets('sem tag mostra o convite; com tag, nao', (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[
          petDoContrato(nome: 'Nina', tagsAtivas: 0),
          petDoContrato(id: 'p-2', nome: 'Tobias', tagsAtivas: 1),
        ]),
      );
      expect(find.text(CartaoDePet.convitePlaquinha), findsOneWidget);
    });
  });

  group('criterio 5 — ISCA: o cartao e UMA parada de leitor de tela', () {
    testWidgets('um cartao produz exatamente um no de semantica',
        (tester) async {
      final handle = tester.ensureSemantics();
      try {
        await abrirOPerfil(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[
            // O pet mais cheio que a tela produz: perdido (selo + borda),
            // sem plaquinha (convite) e com foto. Se alguma versao criasse um
            // no a mais, e aqui.
            petDoContrato(nome: 'Nina', status: 'lost', tagsAtivas: 0),
          ]),
        );

        final semantica = semanticaDoCartao(tester, find.byType(CartaoDePet));

        expect(
          semantica.filhos,
          0,
          reason: 'REPROVA: o cartao guarda ${semantica.filhos} nos de '
              'semantica alem do proprio, e o criterio 5 admite uma parada '
              'so.',
        );

        // **O rotulo tem que ser EXATAMENTE o composto, e nao apenas conte-lo.**
        //
        // O mecanismo que segura os dois lados do criterio 5 e um so, e e o
        // `excludeSemantics: true` de `CartaoDePet` -- medido: trocar
        // `container` para `false` nao muda nada nesta arvore, e desligar o
        // `excludeSemantics` muda o rotulo mas **nao** a contagem de filhos.
        //
        // Esta linha e a que prende o `excludeSemantics: true`, e ela comecou
        // como um `contains`. Com `contains`, desligar o mecanismo nao
        // reprovava nada: o `container: true` sozinho ja mantem o cartao em
        // um no so, entao a contagem de filhos continuava zero, e o rotulo
        // continuava *contendo* o composto -- so que seguido de `PERDIDO`,
        // `Nina`, os atributos e o convite outra vez, porque os textos de
        // dentro voltavam a entrar na arvore.
        //
        // O defeito que o mecanismo evita nao e uma parada a mais: e a pessoa
        // ouvir o cartao inteiro duas vezes, uma na frase composta e outra
        // pedaco por pedaco. Igualdade e o que enxerga isso; `contains` nao.
        expect(
          semantica.no.label,
          CartaoDePet.rotuloAcessivelDe(
            Pet.doJson(petDoContrato(
              nome: 'Nina',
              status: 'lost',
              tagsAtivas: 0,
            )),
          ),
          reason: 'REPROVA: o rotulo do cartao nao e a frase composta e nada '
              'mais. Se ele a contem seguida dos textos de dentro, o '
              '`excludeSemantics` caiu e o leitor de tela anuncia o cartao '
              'duas vezes.',
        );

        // E a frase precisa mesmo carregar o que a tela mostra, senao "uma
        // parada" seria verdade por a parada nao dizer nada.
        expect(semantica.no.label, contains('Nina'));
        expect(
          semantica.no.label,
          contains('Perdido'),
          reason: 'REPROVA: o selo PERDIDO e um dos dois sinais que o 11.3 '
              'exige, e quem usa leitor de tela nao recebe a borda de '
              'urgencia. Sem o texto, o estado chega so por cor (SC 1.4.1).',
        );
        expect(
          semantica.no.label,
          contains(CartaoDePet.convitePlaquinha),
        );

        // Nenhum no interativo: controle dentro de controle e o que o
        // criterio proibe por nome, e um cartao clicavel sem destino seria a
        // acao sem destino do criterio 2.
        expect(
          semantica.no.getSemanticsData().hasAction(SemanticsAction.tap),
          isFalse,
        );
      } finally {
        handle.dispose();
      }
    });
  });

  group('criterio 6 e 11 — conta sem pet', () {
    testWidgets('oferece `Cadastrar meu pet` como acao unica em destaque',
        (tester) async {
      await abrirOPerfil(tester, rede: redeComPets(const []));

      expect(find.byType(CartaoDePet), findsNothing);
      expect(find.text(MeusPets.tituloDoVazio), findsOneWidget);

      final destaques = find.descendant(
        of: find.byType(EstadoVazio),
        matching: find.byType(FilledButton),
      );
      expect(destaques, findsOneWidget);
      expect(
        find.descendant(of: destaques, matching: find.text('Cadastrar meu pet')),
        findsOneWidget,
      );
    });

    testWidgets('o titulo e o novo, e NAO o texto velho', (tester) async {
      await abrirOPerfil(tester, rede: redeComPets(const []));
      expect(
        find.text(textoVelhoDoVazio),
        findsNothing,
        reason: 'REPROVA: "$textoVelhoDoVazio" e o texto que ficou meses numa '
            'tela que nao sabia listar pet. O criterio 11 troca por '
            '"${MeusPets.tituloDoVazio}".',
      );
    });
  });

  group('criterio 7 — falha ao carregar nunca vira tela em branco', () {
    testWidgets('com cache, mostra o que ha com a faixa e `Atualizar`',
        (tester) async {
      // O cenario real: a lista ja foi carregada uma vez nesta sessao (o
      // cache esta quente) e a atualizacao seguinte nao consegue falar com o
      // servidor. O tutor precisa ver os pets dele, e saber que o que ele ve
      // pode estar velho.
      final cache = CacheDeMeusPets()
        ..guardar('u-1', <Pet>[
          Pet.doJson(petDoContrato(nome: 'Nina')),
        ]);

      await abrirOPerfil(
        tester,
        cache: cache,
        rede: (req) async => problema('service-unavailable', 503),
      );

      expect(
        find.text('Nina'),
        findsOneWidget,
        reason: 'REPROVA: o cache de leitura nao segurou a lista. O criterio 7 '
            'manda mostrar o que existe salvo, nunca uma tela em branco.',
      );
      expect(find.byType(CartaoDePet), findsOneWidget);
      expect(find.text(MeusPets.faixaDeCache), findsOneWidget);
      expect(find.text(MeusPets.rotuloDeAtualizar), findsAtLeastNWidgets(1));
      // E o estado vazio nao entra junto: cache quente e conta vazia sao
      // coisas diferentes.
      expect(find.byType(EstadoVazio), findsNothing);
    });

    testWidgets('a faixa some quando a atualizacao volta a funcionar',
        (tester) async {
      var caiu = true;
      final cache = CacheDeMeusPets()
        ..guardar('u-1', <Pet>[Pet.doJson(petDoContrato(nome: 'Nina'))]);

      await abrirOPerfil(
        tester,
        cache: cache,
        rede: (req) async {
          if (caiu) return problema('service-unavailable', 503);
          return json200(<String, dynamic>{
            'items': <Map<String, dynamic>>[
              petDoContrato(nome: 'Nina'),
              petDoContrato(id: 'p-2', nome: 'Tobias'),
            ],
          });
        },
      );
      expect(find.text(MeusPets.faixaDeCache), findsOneWidget);

      caiu = false;
      await tocar(tester, find.text(MeusPets.rotuloDeAtualizar));

      expect(find.text(MeusPets.faixaDeCache), findsNothing);
      expect(find.byType(CartaoDePet), findsNWidgets(2));
    });

    testWidgets('sem cache, a falha aparece e NAO vira estado vazio',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: (req) async => problema('service-unavailable', 503),
      );

      expect(
        find.text(MeusPets.tituloDoVazio),
        findsNothing,
        reason: 'REPROVA: a tela disse "voce nao tem pet" quando na verdade '
            'nao conseguiu perguntar. E o estado vazio que parece sucesso.',
      );
      expect(find.byType(FaixaDeAviso), findsAtLeastNWidgets(1));
      expect(find.text(MeusPets.rotuloDeAtualizar), findsAtLeastNWidgets(1));
    });

    testWidgets('`Atualizar` tenta de novo e a lista aparece', (tester) async {
      var falhas = 0;
      await abrirOPerfil(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/pets' && req.method == 'GET') {
            if (falhas == 0) {
              falhas += 1;
              return problema('service-unavailable', 503);
            }
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[petDoContrato(nome: 'Nina')],
            });
          }
          return problema('not-found', 404);
        },
      );
      expect(find.byType(CartaoDePet), findsNothing);
      await tocar(tester, find.text(MeusPets.rotuloDeAtualizar));
      expect(find.text('Nina'), findsOneWidget);
    });
  });

  group('criterio 8 — e uma lista de pets, e mais nada', () {
    testWidgets('sem feed, estatistica, novidade nem painel', (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[petDoContrato()]),
      );
      for (final proibido in <String>[
        'Novidades',
        'Destaques',
        'Feed',
        'Resumo',
        'Estatísticas',
      ]) {
        expect(find.textContaining(proibido), findsNothing);
      }
    });
  });

  group('criterio 10 — ISCA: com pet, o estado vazio NAO aparece', () {
    testWidgets('a conta tem um pet e nenhum texto de vazio esta na arvore',
        (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[petDoContrato(nome: 'Nina')]),
      );

      // O cartao aparecer NAO basta: com o defeito de pe os dois apareciam
      // juntos, porque o `EstadoVazio` era renderizado sem condicional
      // nenhuma. E por isso que este caso cobra a AUSENCIA.
      expect(find.text('Nina'), findsOneWidget);
      expect(
        find.byType(EstadoVazio),
        findsNothing,
        reason: 'REPROVA: ha um pet na conta e o estado vazio esta na tela. '
            'O mecanismo e a condicional `_Fase.lista when _pets.isEmpty` de '
            '`MeusPets`; renderize o `EstadoVazio` sem ela e este caso '
            'reprova, que e exatamente o defeito que a BICHUS-62 veio '
            'fechar.',
      );
      expect(find.text(MeusPets.tituloDoVazio), findsNothing);
      expect(find.text(textoVelhoDoVazio), findsNothing);
    });

    testWidgets('o texto velho tambem sumiu da Inicio logada', (tester) async {
      // A Inicio era onde o cliente lia a frase. Ela nao lista pet e por isso
      // nao pode afirmar nada sobre pet nenhum.
      await abrirOApp(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[petDoContrato()]),
        deposito: depositoLogado(),
      );
      expect(find.text(textoVelhoDoVazio), findsNothing);
    });
  });

  group('criterio 14 — os 20 do teto aparecem, e a tela rola', () {
    testWidgets('vinte cartoes na arvore, sem paginacao', (tester) async {
      await abrirOPerfil(
        tester,
        rede: redeComPets(<Map<String, dynamic>>[
          for (var i = 0; i < 20; i++)
            petDoContrato(id: 'p-$i', nome: 'Pet $i'),
        ]),
      );

      expect(find.byType(CartaoDePet), findsNWidgets(20));
      // Sem controle de paginacao em lugar nenhum.
      for (final proibido in <String>['Ver mais', 'Carregar mais', 'Próxima']) {
        expect(find.text(proibido), findsNothing);
      }
      // E o ultimo e alcancavel rolando.
      await rolarAte(tester, find.text('Pet 19'));
      expect(find.text('Pet 19'), findsOneWidget);
    });
  });

  group('criterio 15 — fonte do sistema em 200%', () {
    testWidgets('nada transborda com um pet na tela', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);

      final erros = <FlutterErrorDetails>[];
      final anterior = FlutterError.onError;
      FlutterError.onError = erros.add;
      try {
        await abrirOPerfil(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[
            petDoContrato(
              nome: 'Bartolomeu Aparecido do Nascimento',
              raca: 'Pastor-alemão de pelo longo',
              tagsAtivas: 0,
            ),
          ]),
        );
      } finally {
        FlutterError.onError = anterior;
      }

      expect(
        erros.where((e) => '${e.exception}'.contains('overflowed')),
        isEmpty,
        reason: 'REPROVA: com a fonte do sistema em 200% algo transbordou. '
            'Escala de fonte e ajuste do usuario, e a tela nao pode quebrar '
            'quando ele a aumenta (SC 1.4.4).',
      );
      expect(find.byType(CartaoDePet), findsOneWidget);
    });
  });

  group('acessibilidade da tela', () {
    testWidgets('os controles da secao tem alvo de 48 dp e nome anunciavel',
        (tester) async {
      // 320 dp e a largura que reprova: a 390 quase tudo cabe, e um veredito
      // tirado so dela esconde o defeito (UX 27.2.1).
      tester.view.physicalSize = const Size(960, 2000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await abrirOPerfil(tester, rede: redeComPets(const []));

      final acao = find.descendant(
        of: find.byType(MeusPets),
        matching: find.widgetWithText(FilledButton, 'Cadastrar meu pet'),
      );
      expect(acao, findsOneWidget);
      final tamanho = tamanhoDoAlvo(tester, acao);
      // `pisoMinimo`, e **nao** `pisoCritico`. O 6.5 aplica os 64 dp
      // seletivamente e enumera as quatro superficies que os recebem: a tela
      // do achador (F2), a pagina publica do QR (F4), o selo de perdido e o
      // cartaz impresso (F3). `Perfil` > `Meus pets` nao e nenhuma delas, e o
      // criterio 5 desta historia estaciona os 64 dp na barra de acao fixa da
      // BICHUS-21. Cobrar o piso critico aqui seria aplicar tratamento que a
      // especificacao nao pede, que e o que o criterio 13 proibe por nome.
      expect(
        tamanho.height,
        greaterThanOrEqualTo(pisoMinimo),
        reason: 'REPROVA: a acao unica do estado vazio mede '
            '${tamanho.height} dp de altura. O piso do produto fora das '
            'superficies criticas e $pisoMinimo dp (SC 2.5.5, design '
            'system 6.5).',
      );
      exigirRotuloAnunciavel(
        tester,
        'Cadastrar meu pet',
        na: 'Perfil > Meus pets',
      );
    });

    testWidgets('o nome acessivel do cartao carrega tudo o que a tela mostra',
        (tester) async {
      final handle = tester.ensureSemantics();
      try {
        await abrirOPerfil(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[
            petDoContrato(nome: 'Nina', tagsAtivas: 0),
          ]),
        );
        exigirRotuloAnunciavel(
          tester,
          CartaoDePet.rotuloAcessivelDe(Pet.doJson(
            petDoContrato(nome: 'Nina', tagsAtivas: 0),
          )),
          na: 'o cartao de pet',
        );
      } finally {
        handle.dispose();
      }
    });

    testWidgets('a lista inteira cabe em 320 dp sem transbordar',
        (tester) async {
      tester.view.physicalSize = const Size(960, 2000);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      final erros = <FlutterErrorDetails>[];
      final anterior = FlutterError.onError;
      FlutterError.onError = erros.add;
      try {
        await abrirOPerfil(
          tester,
          rede: redeComPets(<Map<String, dynamic>>[
            petDoContrato(
              nome: 'Bartolomeu Aparecido do Nascimento',
              raca: 'Pastor-alemão de pelo longo',
              status: 'lost',
              tagsAtivas: 0,
            ),
          ]),
        );
      } finally {
        FlutterError.onError = anterior;
      }

      expect(
        erros.where((e) => '${e.exception}'.contains('overflowed')),
        isEmpty,
        reason: 'REPROVA: algo transbordou em 320 dp. E a unica largura que '
            'reprova, e um veredito tirado so da de 390 a esconde.',
      );
    });
  });

  group('seguranca — o cache nao atravessa contas', () {
    test('ler com outro dono devolve nulo e apaga o que estava la', () {
      final cache = CacheDeMeusPets();
      expect(cache.pets('u-1'), isNull);
      cache.guardar('u-1', const []);
      expect(cache.pets('u-1'), isNotNull);
      expect(
        cache.pets('u-2'),
        isNull,
        reason: 'REPROVA: a conta u-2 leu o cache da conta u-1. Trocar de '
            'conta nao pode expor os pets da anterior.',
      );
      expect(
        cache.pets('u-1'),
        isNull,
        reason: 'REPROVA: a leitura de outro dono precisa APAGAR, e nao so '
            'recusar. Deixar o conteudo la mantem o dado de u-1 vivo na '
            'memoria depois de u-2 ter entrado.',
      );
    });

    test('sem dono, nao ha cache', () {
      final cache = CacheDeMeusPets()..guardar(null, const []);
      expect(cache.pets(null), isNull);
    });
  });

}
