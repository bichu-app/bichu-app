// O PORTAO DOS DEZ ICONES DA BARRA -- BICHUS-278, 23/10/2026.
//
// ---------------------------------------------------------------------------
// O BURACO QUE ELE FECHA, e ele nao era divergencia: era ausencia
// ---------------------------------------------------------------------------
//
// O cliente pediu os icones DELE na barra de baixo. Os desenhos existiam --
// dez SVG, cinco pares de contorno e preenchido -- e **o app nao os lia**: a
// barra pintava `Icons.pets`, `Icons.groups`, `Icons.dynamic_feed`,
// `Icons.shopping_bag` e `Icons.chat`, cinco glifos do Material Symbols.
//
// **Nao havia nada a mesclar.** O unico gerador de vetor do app
// (`tool/gen_marca.dart`) le `design/marca/vetor/` e emite tres campos; ele
// nao poderia consumir estes dez nem se eles estivessem naquela pasta, e os
// tres motivos estao medidos no cabecalho de `tool/gen_icones_da_barra.dart`.
// A fiacao foi CONSTRUIDA: pasta de fonte, gerador, pintor e os cinco slots.
//
// ---------------------------------------------------------------------------
// AS QUATRO AFIRMACOES, em ordem de forca
// ---------------------------------------------------------------------------
//
// 1. **O Dart gerado bate com os dez SVG.** Divergencia aqui quer dizer que
//    alguem mexeu num SVG e nao rodou `make gerar-icones-da-barra`.
// 2. **Cada desenho esta no destino certo**, pelo `aria-label` da propria arte.
// 3. **Nenhum slot da barra declara glifo do Material.** E a afirmacao que
//    carrega o pedido do cliente, e a que mais corre risco de ser desfeita por
//    quem "consertar" a barra sem ler isto.
// 4. **O estado selecionado troca o desenho**, e troca de contorno para
//    preenchido -- nao e so outro arquivo, e o M3.
//
// Cada uma mora numa FUNCAO, e nao solta num `test`. E isso que deixa a prova
// negativa exercitar a regra de producao com uma entrada defeituosa, em vez de
// refazer a varredura a mao e provar que a copia dela reprova.
//
// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO **NAO** FAZ
// ---------------------------------------------------------------------------
//
// Ele nao olha o desenho. Se a patinha esta bonita, se o balao le como balao,
// se os bigodes do `pets` aparecem em 24 dp num aparelho de verdade -- nada
// disso e medido aqui, e nada disso foi medido por ninguem nesta rodada: o app
// nao foi executado. O que esta coberto e a FIACAO: o arquivo certo chega ao
// slot certo, com a geometria do arquivo, e troca no estado selecionado.

import 'dart:io';
import 'dart:ui' as ui;

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:bichu/theme/icones_da_barra.g.dart';
import 'package:bichu/widgets/icone_da_barra.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// A pasta das fontes, relativa a raiz do repositorio.
const String _pasta = 'design/icones-da-barra';

/// A ORDEM DOS CINCO SLOTS, e ela e **decisao do cliente** (19/10/2026).
///
/// `Pets, Rede, Mural, Loja, AuAu`. Nao e ordem alfabetica, nao e ordem de
/// construcao e nao e preferencia de quem escreve codigo: foi ele que a
/// escolheu, e ela ja mudou duas vezes por decisao dele (era
/// `Pets, Perto, Rede, Loja, AuAu`, e antes disso
/// `Pets, Rede, Perto, Loja, Perfil`).
///
/// **Esta constante existe para que mexer na ordem CUSTE uma linha de diff com
/// nome e motivo**, e nao para documentar. A ordem dos RAMOS de
/// `roteamento/rotas.dart` anda junto com a do registro -- ha portao proprio
/// para a divergencia (`a ordem dos ramos e a ordem do registro`) --, entao
/// reordenar o registro sem reordenar os ramos faz tocar em `Mural` abrir a
/// `Rede`, calado. Esse e o defeito que a isca 3 impede.
const List<String> ordemDosSlots = <String>[
  'Pets',
  'Rede',
  'Mural',
  'Loja',
  'AuAu',
];

/// O arquivo de arte de cada slot, em repouso e selecionado.
const Map<String, (String, String)> _artePorSlot = <String, (String, String)>{
  'Pets': ('pets.svg', 'pets-selecionado.svg'),
  'Rede': ('rede.svg', 'rede-selecionado.svg'),
  'Mural': ('mural.svg', 'mural-selecionado.svg'),
  'Loja': ('loja.svg', 'loja-selecionado.svg'),
  'AuAu': ('auau.svg', 'auau-selecionado.svg'),
};

// ===========================================================================
// AS REGRAS, isoladas para a prova negativa poder exercita-las
// ===========================================================================

/// Nenhum destino da barra declara glifo do Material.
///
/// O destino FORA da barra (`Perfil`) continua podendo: nao ha SVG dele, e
/// nenhum slot o pinta. A regra e sobre o SLOT, e nao sobre o registro.
void exigirSoDesenhoDoCliente(List<DestinoDeNavegacao> destinos) {
  // O guarda contra o verde por vazio: uma lista sem slot satisfaz "nenhum
  // slot usa Material" trivialmente, e aprovaria sem olhar para nada.
  final daBarra = destinos.where((d) => d.naBarra).toList();
  expect(
    daBarra.length,
    greaterThanOrEqualTo(1),
    reason: 'REPROVA: a lista nao tem nenhum destino `naBarra`. Sem slot nao '
        'ha o que conferir, e afirmar "nenhum slot usa glifo do Material" '
        'seria verde por nao ter o que olhar.',
  );

  final comMaterial = <String>[];
  final semDesenho = <String>[];
  for (final d in daBarra) {
    if (d.icone != null || d.iconeSelecionado != null) {
      comMaterial.add('${d.rotulo} (${d.icone}, ${d.iconeSelecionado})');
    }
    if (d.desenho == null || d.desenhoSelecionado == null) {
      semDesenho.add(d.rotulo);
    }
  }

  expect(
    comMaterial,
    isEmpty,
    reason: 'REPROVA: ${comMaterial.join('; ')} declara glifo do Material num '
        'slot da barra.\n'
        'O cliente pediu os icones DELE, e eles existem em $_pasta/ -- dez '
        'arquivos, cinco pares. Um glifo generico no meio dos cinco e '
        'exatamente o estado que esta fiacao veio fechar: os desenhos estavam '
        'prontos e a barra pintava o Material porque nada os lia.\n'
        'Se falta desenho para um slot novo, o conserto NAO e pegar um '
        '`Icons.*` parecido: e pedir o desenho. Desenho passa pelo Figma '
        'antes do codigo.',
  );

  expect(
    semDesenho,
    isEmpty,
    reason: 'REPROVA: ${semDesenho.join(', ')} esta na barra sem desenho nos '
        'dois estados. Slot sem arte pinta nada, e `IconeDaBarra` estoura no '
        '`!` em vez de desenhar um buraco -- o que e melhor, mas acontece no '
        'aparelho e nao aqui.',
  );
}

/// A ordem dos cinco slots e a que o cliente escolheu.
void exigirOrdemDosSlots(List<DestinoDeNavegacao> destinos) {
  final naBarra = destinos.where((d) => d.naBarra).map((d) => d.rotulo).toList();
  expect(
    naBarra,
    ordemDosSlots,
    reason: 'REPROVA: a ordem dos slots da barra mudou.\n'
        '  decidida por ELE: ${ordemDosSlots.join(' · ')}\n'
        '  encontrada:       ${naBarra.join(' · ')}\n'
        'Esta ordem e decisao do cliente (19/10/2026) e ja mudou duas vezes '
        'por decisao dele. Ela NAO e detalhe de implementacao, nao e '
        'alfabetica e nao e preferencia de quem escreve o codigo.\n'
        'E ela nao anda sozinha: a ordem dos RAMOS de `roteamento/rotas.dart` '
        'espelha esta lista, e trocar so uma das duas faz tocar em `Mural` '
        'abrir a `Rede`, em silencio.',
  );
}

/// O estado selecionado troca o desenho, e troca contorno por preenchido.
///
/// Duas afirmacoes, e a segunda e a que vale: nao basta ser outro arquivo. O
/// M3 pede contorno em repouso e preenchido no selecionado, e e isso que diz
/// a quem olha qual aba esta aceso -- sem depender de cor, que e o criterio 7.
void exigirParSelecionadoDistinto(List<DestinoDeNavegacao> destinos) {
  final comDesenho = destinos
      .where((d) => d.desenho != null && d.desenhoSelecionado != null)
      .toList();
  expect(
    comDesenho.length,
    greaterThanOrEqualTo(1),
    reason: 'REPROVA: nenhum destino da lista tem par de desenho. Sem par nao '
        'ha troca para medir, e o verde seria por vazio.',
  );

  final iguais = <String>[];
  final semPreenchimento = <String>[];
  final preenchidoEmRepouso = <String>[];
  for (final d in comDesenho) {
    final repouso = d.desenho!;
    final aceso = d.desenhoSelecionado!;
    if (repouso.arquivo == aceso.arquivo) {
      iguais.add('${d.rotulo} (os dois em ${repouso.arquivo})');
    }
    if (!aceso.grupos.any((g) => g.preenchido)) {
      semPreenchimento.add('${d.rotulo} (${aceso.arquivo})');
    }
    if (repouso.grupos.any((g) => g.preenchido)) {
      preenchidoEmRepouso.add('${d.rotulo} (${repouso.arquivo})');
    }
  }

  expect(
    iguais,
    isEmpty,
    reason: 'REPROVA: ${iguais.join('; ')} desenha a MESMA arte nos dois '
        'estados. A aba nao muda ao ser tocada, e o unico sinal de qual secao '
        'esta aberta passa a ser a pilula do indicador -- sinal so por cor, '
        'que o criterio 7 recusa.',
  );
  expect(
    semPreenchimento,
    isEmpty,
    reason: 'REPROVA: ${semPreenchimento.join('; ')} tem arte de selecionado '
        'SEM nenhum grupo preenchido. Trocar de arquivo nao basta: contorno em '
        'repouso e PREENCHIDO no selecionado e o M3, e e o preenchimento que '
        'diz qual aba esta aceso para quem nao distingue a cor.',
  );
  expect(
    preenchidoEmRepouso,
    isEmpty,
    reason: 'REPROVA: ${preenchidoEmRepouso.join('; ')} ja esta preenchido em '
        'REPOUSO. Com as duas artes preenchidas a troca deixa de ser '
        'perceptivel, e a aba parece aceso o tempo todo.',
  );
}

// ===========================================================================

Directory _raizDoRepositorio() {
  var dir = Directory.current.absolute;
  while (true) {
    if (Directory('${dir.path}/$_pasta').existsSync()) return dir;
    final pai = dir.parent;
    if (pai.path == dir.path) break;
    dir = pai;
  }
  throw StateError(
    'REPROVA: nao achei $_pasta/ subindo a partir de '
    '"${Directory.current.path}". Portao sem o que verificar reprova.',
  );
}

Future<http.Response> Function(http.Request) _redeVazia() {
  return (http.Request pedido) async => http.Response('{}', 404);
}

void main() {
  final raiz = _raizDoRepositorio();
  final pasta = Directory('${raiz.path}/$_pasta');

  group('ISCA 1 — o Dart gerado bate com os dez SVG', () {
    test('a pasta tem exatamente os dez declarados, e nada mais', () {
      final noDisco = pasta
          .listSync()
          .whereType<File>()
          .map((f) => f.uri.pathSegments.last)
          .where((n) => n.endsWith('.svg'))
          .toSet();

      expect(
        noDisco,
        IconesDaBarra.porArquivo.keys.toSet(),
        reason: 'REPROVA: $_pasta divergiu de `IconesDaBarra.porArquivo`.\n'
            'No disco:   ${(noDisco.toList()..sort()).join(', ')}\n'
            'Declarado:  ${(IconesDaBarra.porArquivo.keys.toList()..sort()).join(', ')}\n'
            'Arquivo que some e desenho que some sem quebrar build nenhum — o '
            'defeito que a BICHUS-196 registrou na pasta da marca. Arquivo '
            'novo precisa de uma linha em `_consumidos` do gerador e de um '
            'slot que o use.',
      );
      expect(
        noDisco,
        hasLength(10),
        reason: 'REPROVA: a pasta tem ${noDisco.length} SVG e nao dez. Os dez '
            'sao CINCO PARES; um numero impar quer dizer par incompleto.',
      );
    });

    for (final entrada in IconesDaBarra.porArquivo.entries) {
      test('${entrada.key}: moldura, rotulo e curvas identicos ao gerado', () {
        final arquivo = File('${pasta.path}/${entrada.key}');
        expect(
          arquivo.existsSync(),
          isTrue,
          reason: 'REPROVA: ${arquivo.path} nao existe.',
        );
        final svg = arquivo.readAsStringSync();
        final gerado = entrada.value;

        final vb = RegExp(r'-?\d+(?:\.\d+)?')
            .allMatches(RegExp(r'viewBox="([^"]*)"').firstMatch(svg)!.group(1)!)
            .map((m) => double.parse(m.group(0)!))
            .toList();
        expect(
          <double>[0, 0, gerado.lado, gerado.lado],
          vb,
          reason: 'REPROVA: o viewBox de ${entrada.key} mudou e '
              'lib/theme/icones_da_barra.g.dart nao. Rode:\n'
              '    make gerar-icones-da-barra',
        );

        expect(
          RegExp(r'aria-label="([^"]*)"').firstMatch(svg)?.group(1),
          gerado.rotuloDaArte,
          reason: 'REPROVA: o `aria-label` de ${entrada.key} divergiu do '
              'gerado. E ele que amarra o ARQUIVO ao destino.',
        );

        // As formas do SVG, na ordem do documento — que e a ordem em que o
        // pintor as empilha.
        final grupos = RegExp(r'<g\b([^>]*)>(.*?)</g>', dotAll: true)
            .allMatches(svg)
            .toList();
        expect(
          grupos.map((g) {
            final fill =
                RegExp(r'fill="([^"]*)"').firstMatch(g.group(1)!)?.group(1);
            return fill == 'currentColor';
          }).toList(),
          gerado.grupos.map((g) => g.preenchido).toList(),
          reason: 'REPROVA: os preenchimentos de ${entrada.key} divergem do '
              'gerado. `fill="currentColor"` e preenchido e `fill="none"` e '
              'contorno, e e esse par que separa selecionado de repouso.',
        );

        for (var i = 0; i < grupos.length; i++) {
          final formas = <String>[];
          for (final f in RegExp(
            r'<path\b([^>]*)/>|<circle\b([^>]*)/>',
            dotAll: true,
          ).allMatches(grupos[i].group(2)!)) {
            if (f.group(1) != null) {
              formas.add(
                'curva:${RegExp(r'\sd="([^"]*)"').firstMatch(f.group(1)!)!.group(1)}',
              );
            } else {
              final a = f.group(2)!;
              double n(String k) => double.parse(
                    RegExp('$k="([^"]*)"').firstMatch(a)!.group(1)!,
                  );
              formas.add('circulo:${n('cx')},${n('cy')},${n('r')}');
            }
          }
          expect(
            gerado.grupos[i].formas
                .map((f) => f.ehCurva
                    ? 'curva:${f.d}'
                    : 'circulo:${f.cx},${f.cy},${f.r}')
                .toList(),
            formas,
            reason: 'REPROVA: as formas do grupo $i de ${entrada.key} divergem '
                'do que esta em lib/theme/icones_da_barra.g.dart — na ORDEM '
                'inclusive, que e a ordem de pintura. Rode:\n'
                '    make gerar-icones-da-barra',
          );
        }
      });
    }

    test('NENHUM dos dez escreve cor, e a ausencia e a regra', () {
      // A regra de token cumprida na direcao certa: um icone de navegacao nao
      // tem cor propria. A tinta e o ESTADO da aba, e quem a resolve e o
      // `iconTheme` de `BichuTheme`. Hexadecimal num destes arquivos
      // sobreviveria ao modo escuro e ao estado selecionado, os dois calado.
      final comCor = <String>[];
      for (final nome in IconesDaBarra.porArquivo.keys) {
        final svg = File('${pasta.path}/$nome').readAsStringSync();
        final hex =
            RegExp(r'(?:fill|stroke)="(#[0-9A-Fa-f]{3,8})"').firstMatch(svg);
        if (hex != null) comCor.add('$nome pinta ${hex.group(1)}');
      }
      expect(
        comCor,
        isEmpty,
        reason: 'REPROVA: ${comCor.join('; ')}. Icone da barra pinta '
            '`currentColor` e mais nada. A cor vem do papel do tema '
            '(`text-secondary` em repouso, `on-primary-container` '
            'selecionado), e valor de cor escrito aqui e o caminho inverso: '
            'ele vira constante solta que sobrevive a troca de tema.',
      );
    });
  });

  group('ISCA 2 — cada desenho esta no destino certo', () {
    test('os cinco slots usam a arte com o nome deles', () {
      final visiveis = CascaComAbas.visiveisEm(ConfiguracaoDeBuild.referencia);
      expect(
        visiveis,
        hasLength(5),
        reason: 'REPROVA: a barra tem ${visiveis.length} slots e nao cinco.',
      );

      final porSlot = <String, (String, String)>{
        for (final d in visiveis)
          d.rotulo: (d.desenho!.arquivo, d.desenhoSelecionado!.arquivo),
      };
      expect(
        porSlot,
        _artePorSlot,
        reason: 'REPROVA: um desenho foi para o slot errado.\n'
            'Encontrado: $porSlot\n'
            'Esperado:   $_artePorSlot\n'
            'Arte trocada de aba e o defeito que nenhuma suite de widget pega '
            'sozinha: as duas abas continuam desenhando algo, e so quem '
            'conhece os desenhos ve que a sacola esta no `Mural`.',
      );
    });

    test('o `aria-label` da arte concorda com o rotulo do slot', () {
      // Uma segunda amarra, e por outro caminho: o nome do ARQUIVO poderia
      // bater e o conteudo dele ser outro desenho. O `aria-label` vive dentro
      // do SVG e e a unica coisa no arquivo que diz o que ele e.
      for (final d in CascaComAbas.visiveisEm(ConfiguracaoDeBuild.referencia)) {
        expect(
          d.desenho!.rotuloDaArte,
          d.rotulo,
          reason: 'REPROVA: o slot `${d.rotulo}` desenha uma arte que se '
              'declara `${d.desenho!.rotuloDaArte}`.',
        );
        expect(
          d.desenhoSelecionado!.rotuloDaArte,
          '${d.rotulo}, selecionado',
          reason: 'REPROVA: a arte selecionada do slot `${d.rotulo}` se '
              'declara `${d.desenhoSelecionado!.rotuloDaArte}`.',
        );
      }
    });
  });

  group('ISCA 3 — a barra nao volta ao glifo do Material, e a ordem e dele',
      () {
    test('nenhum destino da barra declara glifo do Material', () {
      exigirSoDesenhoDoCliente(CascaComAbas.destinos);
    });

    test('`Perfil` e o UNICO com glifo, e ele esta fora da barra', () {
      // A contraparte do caso acima: sem ela, apagar `icone` de `Perfil`
      // tambem deixaria o portao verde, e o registro perderia a entrada que
      // faz `Perfil` participar do portao de artes distintas.
      final comGlifo =
          CascaComAbas.destinos.where((d) => d.icone != null).toList();
      expect(
        comGlifo.map((d) => d.rotulo).toList(),
        <String>['Perfil'],
        reason: 'REPROVA: o conjunto de destinos com glifo do Material mudou. '
            'Hoje e so `Perfil`, e ele esta fora da barra desde 19/10 — nao '
            'ha SVG dele na pasta do cliente, e nenhum slot o pinta.',
      );
      expect(
        comGlifo.single.naBarra,
        isFalse,
        reason: 'REPROVA: `Perfil` voltou para a barra trazendo o glifo do '
            'Material. Se ele volta a ter slot, ele precisa de desenho — e '
            'desenho passa pelo Figma antes do codigo.',
      );
    });

    test('a ordem dos cinco destinos e a do cliente', () {
      exigirOrdemDosSlots(CascaComAbas.destinos);
    });
  });

  group('ISCA 4 — o estado selecionado troca o desenho', () {
    test('os cinco trocam de arte, e de contorno para preenchido', () {
      exigirParSelecionadoDistinto(CascaComAbas.destinos);
    });
  });

  group('ISCA 5 — a barra MONTADA desenha os dele, e nenhum `Icon`', () {
    // As quatro acima leem o REGISTRO. Esta monta o app e olha a arvore: o
    // registro poderia estar perfeito e `BarraDeBaixo` continuar pintando
    // `Icon(...)`, que foi literalmente o estado anterior a esta mudanca —
    // os desenhos existiam e a barra nao os lia.
    testWidgets('a barra tem cinco `IconeDaBarra` e nenhum `Icon` em slot',
        (tester) async {
      await abrirOApp(tester, rede: _redeVazia());

      final barra = find.byType(NavigationBar);
      expect(
        barra,
        findsOneWidget,
        reason: 'REPROVA: nao achei a barra de baixo na arvore. Sem ela este '
            'caso nao confere nada.',
      );

      expect(
        find.descendant(of: barra, matching: find.byType(IconeDaBarra)),
        findsNWidgets(5),
        reason: 'REPROVA: a barra montada nao tem os cinco desenhos do '
            'cliente. E ESTE o caso que mede o defeito original: ate '
            '23/10/2026 o registro e a arte existiam e a barra pintava '
            '`Icon(destino.icone)` — cinco glifos do Material.',
      );

      expect(
        find.descendant(of: barra, matching: find.byType(Icon)),
        findsNothing,
        reason: 'REPROVA: a barra montada ainda pinta um `Icon` do Material. '
            'O cliente pediu os desenhos dele nos cinco slots.',
      );
    });

    testWidgets('a aba aberta desenha a arte PREENCHIDA, e as outras nao',
        (tester) async {
      // A troca de estado medida na arvore, e nao no registro: o
      // `NavigationDestination` tem `icon` e `selectedIcon`, e quem escolhe
      // entre os dois e o componente. Trocar os dois de lugar passaria em
      // todos os casos acima e desenharia a barra ao contrario.
      await abrirOApp(tester, rede: _redeVazia());

      final pintados = tester
          .widgetList<IconeDaBarra>(
            find.descendant(
              of: find.byType(NavigationBar),
              matching: find.byType(IconeDaBarra),
            ),
          )
          .map((w) => w.desenho.arquivo)
          .toList();

      // A aba de ARRANQUE e a `Rede` (`Rotas.destinoDoArranque`), e nao a
      // primeira da barra: as duas decisoes sao independentes.
      final arranque = CascaComAbas.destinos
          .singleWhere((d) => d.rota == Rotas.rede)
          .rotulo;
      final esperado = <String>[
        for (final slot in ordemDosSlots)
          slot == arranque
              ? _artePorSlot[slot]!.$2
              : _artePorSlot[slot]!.$1,
      ];

      expect(
        pintados,
        esperado,
        reason: 'REPROVA: a barra montada nao desenha o preenchido SO na aba '
            'aberta.\n'
            '  pintado:  $pintados\n'
            '  esperado: $esperado\n'
            'A aba de arranque e `$arranque`. Se a lista veio toda em '
            'contorno, `selectedIcon` nao esta recebendo '
            '`desenhoSelecionado`; se veio toda preenchida, os dois campos '
            'estao trocados.',
      );
    });
  });

  group('ISCA 6 — o pintor emite TINTA, e o preenchido emite mais', () {
    // ===================================================================
    // O QUE ESTA SECAO ACRESCENTA, e por que ela nao e luxo
    // ===================================================================
    //
    // As cinco iscas acima provam que o ARQUIVO certo chega ao SLOT certo com
    // a geometria certa. Nenhuma delas prova que algo aparece na tela: um
    // pintor que escalasse por zero, que pintasse transparente ou que
    // ignorasse todas as formas passaria em todas elas, porque todas leem
    // dados e nao pixels.
    //
    // **E o app NAO foi executado nesta rodada.** Isto e o mais perto que dá
    // para chegar sem aparelho: o widget de PRODUCAO e montado, rasterizado
    // pelo mesmo `Canvas` do app por um `RepaintBoundary`, e a tinta e
    // CONTADA. O arranjo e o de `test/marca/variante_reduzida_test.dart`, que
    // ja rasteriza a marca por este motivo.
    //
    // O QUE ELA AINDA NAO DIZ: se o desenho esta BONITO, se a patinha le como
    // patinha, se os bigodes do `pets` sobrevivem a 24 dp num aparelho de
    // verdade. Isso e olho humano, e nao houve.

    /// Quantos pixels de tinta o widget de producao emite, em `lado` px.
    Future<int> tinta(WidgetTester tester, DesenhoDoIcone desenho,
        {double lado = 96}) async {
      await tester.pumpWidget(
        Center(
          child: RepaintBoundary(
            child: IconTheme(
              // Preto opaco e tamanho fixo: a conta e de COBERTURA, e a cor
              // de verdade vem do `iconTheme` do tema em producao.
              data: IconThemeData(color: const Color(0xFF000000), size: lado),
              child: IconeDaBarra(desenho),
            ),
          ),
        ),
      );
      await tester.pump();

      final limite = tester.renderObject<RenderRepaintBoundary>(
        find.byType(RepaintBoundary).first,
      );

      // `runAsync` NAO E ENFEITE, e custou uma execucao pendurada.
      //
      // `toImage()` entrega o trabalho ao rasterizador do motor, que vive FORA
      // da zona de tempo falso de `testWidgets`. Chamado direto, o `await`
      // espera um `Future` que a zona falsa nunca completa: a suite pendura
      // SEM MENSAGEM, e eu tive de matar a execucao para descobrir. Dentro de
      // `runAsync` o tempo e o de verdade e o `Future` resolve.
      //
      // E por isso que `test/marca/variante_reduzida_test.dart` nao precisa
      // disto: ele usa `Picture.toImage` num `test()` comum, sem zona falsa.
      // Aqui o widget de PRODUCAO tem de ser montado, entao a zona existe.
      final pintados = await tester.runAsync(() async {
        final imagem = await limite.toImage();
        final dados =
            await imagem.toByteData(format: ui.ImageByteFormat.rawRgba);
        if (dados == null) return null;
        var n = 0;
        for (var i = 3; i < dados.lengthInBytes; i += 4) {
          if (dados.getUint8(i) > 8) n++;
        }
        return n;
      });
      if (pintados == null) {
        fail('REPROVA: a rasterizacao devolveu nulo. Sem pixels nao ha o que '
            'contar, e um zero aqui seria indistinguivel de um icone vazio.');
      }
      return pintados;
    }

    testWidgets('os dez emitem tinta, e nenhum sai em branco', (tester) async {
      final vazios = <String>[];
      for (final e in IconesDaBarra.porArquivo.entries) {
        final n = await tinta(tester, e.value);
        if (n < 50) vazios.add('${e.key} ($n px)');
      }
      expect(
        vazios,
        isEmpty,
        reason: 'REPROVA: ${vazios.join('; ')} sai praticamente em BRANCO. O '
            'registro pode estar perfeito e o pintor nao desenhar nada — '
            'escala zero, tinta transparente ou forma ignorada. Nenhuma das '
            'iscas que leem dados pegaria isso.',
      );
    });

    testWidgets('o preenchido emite MAIS tinta que o contorno, nos cinco pares',
        (tester) async {
      final errados = <String>[];
      for (final slot in ordemDosSlots) {
        final par = _artePorSlot[slot]!;
        final contorno = await tinta(
          tester,
          IconesDaBarra.porArquivo[par.$1]!,
        );
        final preenchido = await tinta(
          tester,
          IconesDaBarra.porArquivo[par.$2]!,
        );
        if (preenchido <= contorno) {
          errados.add('$slot (contorno $contorno px, preenchido $preenchido px)');
        }
      }
      expect(
        errados,
        isEmpty,
        reason: 'REPROVA: ${errados.join('; ')} — a arte de selecionado NAO '
            'cobre mais area que a de repouso. E o `fill` nao chegando ao '
            'canvas: `GrupoDoIcone.preenchido` diz `true` e o pintor so '
            'contorna. A isca 4 nao pega isso, porque ela le o dado e nao o '
            'pixel.',
      );
    });

    testWidgets('CONTROLE POSITIVO: desenho sem forma conta ZERO tinta',
        (tester) async {
      // Sem ele, um contador que devolvesse um numero alto para QUALQUER
      // coisa passaria nos dois casos acima. A isca precisa provar que a
      // conta DISTINGUE tinta de ausencia de tinta.
      const vazio = DesenhoDoIcone(
        arquivo: 'vazio-de-mentira.svg',
        rotuloDaArte: 'nada',
        lado: 24,
        espessura: 2,
        grupos: <GrupoDoIcone>[],
      );
      expect(
        await tinta(tester, vazio),
        0,
        reason: 'REPROVA: a conta de tinta devolveu pixel para um desenho SEM '
            'forma nenhuma. Ela nao esta medindo o desenho.',
      );
    });
  });

  group('PROVA NEGATIVA — cada regra precisa REPROVAR com o defeito de volta',
      () {
    /// Um slot de mentira, para as listas defeituosas.
    DestinoDeNavegacao slot(
      String rotulo, {
      DesenhoDoIcone? desenho,
      DesenhoDoIcone? desenhoSelecionado,
      IconData? icone,
      IconData? iconeSelecionado,
      bool naBarra = true,
    }) {
      return DestinoDeNavegacao(
        rotulo: rotulo,
        reforcoAcessivel: 'slot de mentira, so da prova negativa',
        reforcoDaPagina: '',
        rota: Rotas.pets,
        estado: EstadoDaSecao.existe,
        campoSemantico: CampoSemantico.animal,
        desenho: desenho,
        desenhoSelecionado: desenhoSelecionado,
        icone: icone,
        iconeSelecionado: iconeSelecionado,
        naBarra: naBarra,
      );
    }

    // =====================================================================
    // QUEM GUARDA O GLIFO DO MATERIAL: o `assert`, e nao a funcao
    // =====================================================================
    //
    // **ISTO FOI DESCOBERTO ARMANDO A ISCA, e nao decidido antes.** A primeira
    // versao destes dois casos chamava `exigirSoDesenhoDoCliente` com um slot
    // defeituoso e esperava `TestFailure`. Os dois REPROVARAM, e por um motivo
    // que corrige o desenho: o `assert` de `DestinoDeNavegacao` estourou
    // ANTES, no construtor, e o portao nunca chegou a ser chamado.
    //
    // A conclusao honesta: **um slot da barra com glifo do Material nao e
    // construivel**, e `CascaComAbas.destinos` e `const` -- ou seja, repor
    // `Icons.pets` num slot NAO COMPILA. Essa e a garantia mais forte que
    // existe aqui, e ela e do `assert`.
    //
    // Entao os casos abaixo medem o `assert`, que e o mecanismo que de fato
    // dispara. E `exigirSoDesenhoDoCliente` fica declarada pelo que ela e:
    // **GUARDA, e nao isca** -- segundo cinto para um destino montado em tempo
    // de execucao, com mensagem legivel, mas sem defeito construivel que a
    // derrube. A isca provada da MESMA propriedade e a 5, que monta a barra e
    // conta os `Icon` na arvore.
    test('o construtor RECUSA glifo do Material num slot da barra', () {
      expect(
        () => slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
          icone: Icons.pets_outlined,
          iconeSelecionado: Icons.pets,
        ),
        throwsA(isA<AssertionError>()),
        reason: 'REPROVA: deu para construir um slot da barra declarando '
            '`Icons.pets` AO LADO do desenho. E a segunda fonte da verdade do '
            'que a aba mostra.',
      );
    });

    test('o construtor RECUSA slot da barra SEM desenho', () {
      expect(
        () => slot(
          'Pets',
          icone: Icons.pets_outlined,
          iconeSelecionado: Icons.pets,
        ),
        throwsA(isA<AssertionError>()),
        reason: 'REPROVA: deu para construir um slot da barra com SO o glifo '
            'do Material. E o estado exato de 22/10/2026, e ele precisa nao '
            'compilar.',
      );
    });

    test('o construtor ACEITA o slot certo - controle positivo', () {
      // Sem ele, um `assert` que recusasse TUDO passaria nos dois casos acima
      // e o registro de producao nao compilaria. Isca sem controle positivo
      // nao prova que a regra DISTINGUE; prova so que ela reclama.
      expect(
        () => slot(
          'Pets',
          desenho: IconesDaBarra.pets,
          desenhoSelecionado: IconesDaBarra.petsSelecionado,
        ),
        returnsNormally,
        reason: 'REPROVA: o `assert` recusou o arranjo CERTO -- desenho nos '
            'dois estados e nenhum glifo.',
      );
    });

    test('lista sem slot REPROVA pelo guarda, e nao passa em silencio', () {
      // Este continua sendo isca de verdade sobre a funcao: lista vazia E
      // construivel, e sem o guarda ela aprovaria sem olhar para nada.
      expect(
        () => exigirSoDesenhoDoCliente(const <DestinoDeNavegacao>[]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista sem slot. '
            'Lista vazia nao tem slot com Material, e e assim que um portao '
            'aprova todo dia sem nunca ter olhado para a barra.',
      );
    });

    test('a ordem trocada REPROVA, e a mensagem nomeia as duas', () {
      // `Mural` e `Loja` trocados de lugar. E a troca mais plausivel: os dois
      // slots sao vizinhos, e `Mural` entrou no slot 3 em 19/10 justamente
      // empurrando a `Loja` para o 4.
      final trocada = <DestinoDeNavegacao>[
        for (final nome in <String>['Pets', 'Rede', 'Loja', 'Mural', 'AuAu'])
          CascaComAbas.destinos.singleWhere((d) => d.rotulo == nome),
      ];
      expect(
        () => exigirOrdemDosSlots(trocada),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao NAO acusou `Mural` e `Loja` trocados de '
            'slot. A ordem e decisao do cliente, e um portao cego aqui deixa '
            'a proxima reordenacao passar como refatoracao.',
      );
    });

    test('a ordem completa mas com um slot FORA REPROVA', () {
      // Sem este caso, a isca de ordem poderia estar comparando conjuntos em
      // vez de sequencias — e `AuAu` somindo do fim passaria.
      final curta = <DestinoDeNavegacao>[
        for (final nome in <String>['Pets', 'Rede', 'Mural', 'Loja'])
          CascaComAbas.destinos.singleWhere((d) => d.rotulo == nome),
      ];
      expect(
        () => exigirOrdemDosSlots(curta),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou uma barra de QUATRO slots. Ele '
            'esta comparando conteudo e nao sequencia.',
      );
    });

    test('o selecionado igual ao de repouso REPROVA', () {
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.pets,
            desenhoSelecionado: IconesDaBarra.pets,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao NAO acusou uma aba que desenha a mesma arte '
            'nos dois estados. A aba nao mudaria ao ser tocada, e o portao '
            'diria que esta tudo bem.',
      );
    });

    test('o selecionado SEM preenchimento REPROVA', () {
      // O caso sutil, e o que distingue este portao de um que so compara
      // nomes de arquivo: `rede.svg` e um arquivo DIFERENTE de `pets.svg`, e
      // os dois sao de contorno. Um portao que so cobrasse "arte diferente"
      // aprovaria uma aba cujo estado selecionado nao preenche nada.
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.pets,
            desenhoSelecionado: IconesDaBarra.rede,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou um par cujo estado selecionado e '
            'outro CONTORNO. Trocar de arquivo nao basta: e o preenchimento '
            'que diz qual aba esta aceso sem depender de cor.',
      );
    });

    test('o preenchido em REPOUSO REPROVA', () {
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Pets',
            desenho: IconesDaBarra.petsSelecionado,
            desenhoSelecionado: IconesDaBarra.pets,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao aprovou o par INVERTIDO — preenchido em '
            'repouso e contorno no selecionado. A barra pareceria toda acesa.',
      );
    });

    test('lista sem par de desenho REPROVA pelo guarda', () {
      // `naBarra: false` NAO e enfeite: destino sem desenho so e construivel
      // FORA da barra (e o caso do `Perfil`), e e justamente essa lista que
      // faria o portao nao ter par nenhum para medir.
      expect(
        () => exigirParSelecionadoDistinto(<DestinoDeNavegacao>[
          slot(
            'Perfil',
            naBarra: false,
            icone: Icons.account_circle_outlined,
            iconeSelecionado: Icons.account_circle,
          ),
        ]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista sem nenhum par '
            'de desenho. Sem par nao ha troca para medir.',
      );
    });

    test('o leitor de `d` RECUSA comando que ele nao sabe pintar', () {
      // O segundo cinto do pintor. Um leitor que IGNORASSE o comando
      // desconhecido sumiria com um trecho do desenho e o icone sairia
      // incompleto — defeito que ninguem rastreia, porque o icone continua
      // aparecendo.
      expect(
        () => caminhoDoIcone('M 0 0 A 5 5 0 0 1 10 10'),
        throwsA(isA<FormatException>()),
        reason: 'REPROVA: `caminhoDoIcone` aceitou um arco (`A`). Ele sabe '
            'pintar M, C, L e Z; qualquer outro comando sairia do desenho em '
            'silencio.',
      );
      // O controle positivo: os quatro que ele sabe NAO lancam. Sem ele, um
      // leitor que lancasse em tudo passaria no caso acima.
      expect(
        () => caminhoDoIcone('M 0 0 L 5 0 C 7 0 8 1 8 3 Z'),
        returnsNormally,
        reason: 'REPROVA: `caminhoDoIcone` recusou M, C, L e Z, que sao '
            'exatamente os quatro comandos que os dez arquivos usam.',
      );
    });
  });
}
