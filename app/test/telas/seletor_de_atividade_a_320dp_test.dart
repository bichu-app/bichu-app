// BICHUS-317d -- AS ATIVIDADES NOVAS NO SELETOR DA INDICACAO, E A LARGURA A
// 320 dp.
//
// =========================================================================
// PARTE 1: `Loja` E `Hospital` SAO OFERECIDOS, E ISSO E MEDIDO E NAO SUPOSTO
// =========================================================================
//
// Os dois entraram no `ProfessionalKind` em 28/10/2026 (migracao
// `20261028000001`) e ja tem rotulo em `AtividadeDoDiretorio`. A suspeita era
// que o formulario de indicacao os oferecesse "de graca", porque o seletor
// monta a lista a partir de `AtividadeDoDiretorio.values` em vez de repetir uma
// lista a mao.
//
// **A suspeita estava certa, e e por isso que o caso existe.** "De graca" e uma
// propriedade do CODIGO DE HOJE, nao uma lei: no dia em que alguem trocar
// `AtividadeDoDiretorio.values` por uma lista escrita no corpo da tela -- para
// reordenar, para esconder um valor, para agrupar --, os valores novos param de
// aparecer **em silencio**, e nenhum portao acusa. Este grupo abre a folha de
// verdade e le o que esta nela.
//
// =========================================================================
// PARTE 2: A LARGURA A 320 dp, E A PERGUNTA ESTAVA MAL POSTA
// =========================================================================
//
// A pergunta recebida foi: *"o seletor agora tem oito valores em vez de seis.
// Cabe na largura?"* -- e, na revisao de 29/10, *"vai ter DEZ valores. Meca com
// dez"*.
//
// **MEDIDO: a quantidade de valores nao afeta a largura, e nao por sorte.**
// `SeletorDeLista` (`lib/widgets/seletor_de_lista.dart`) nao e uma fila de
// chips: ele e um campo fechado que abre `showModalBottomSheet`. Dois fatos de
// estrutura decidem isso, e os dois estao medidos aqui:
//
//  1. **fechado**, o campo e uma `Row` com `Expanded(Text(...))` e o glifo. O
//     `Expanded` da ao texto toda a largura que sobra, e o `Text` **quebra
//     linha** -- nao ha `maxLines: 1` nem `overflow: ellipsis`. Rotulo longo
//     cresce para BAIXO dentro de um `Container` que so tem `minHeight`;
//  2. **aberto**, a folha e um `ListView.builder` dentro de um `Flexible`, sob
//     um `ConstrainedBox(maxHeight: 70% da altura)`. Cada valor e um `ListTile`
//     de largura inteira: dez valores **rolam**, nao se espremem.
//
// Entao o que poderia estourar a 320 dp nao e a CONTAGEM, e sim um ROTULO
// longo. O mais longo do caminho da indicacao nao e de atividade nenhuma: e
// `Profissional ou estabelecimento`, o rotulo de `EntityKind` que a BICHUS-317b
// pede (30 caracteres, contra 12 do maior rotulo de atividade, `Banho e tosa`).
// Ele e medido aqui tambem, no mesmo lugar e pelo mesmo motivo.
//
// **A isca e o `takeException`**, e nao o olho: transbordo de layout no Flutter
// chega como `FlutterError` na fase de pintura, e um caso que so verifica se o
// texto existe fica VERDE com a faixa amarela de overflow na tela.
//
// DESLIGAR PARA VER REPROVAR: em `lib/widgets/seletor_de_lista.dart`, troque o
// `Expanded` do estado fechado por um `SizedBox(width: 96)` -- que e a largura
// em que a sigla de UF cabia antes de o campo virar seletor. O caso do rotulo
// longo passa a acusar transbordo.
//
// **OS DEZ ROTULOS AQUI SAO UMA PREVISAO DECLARADA, e nao o enum de hoje.**
// `AtividadeDoDiretorio` tem OITO valores nesta arvore. Os dez medidos abaixo
// incluem a mudanca que outra frente esta construindo (`sitter` volta a ser
// `Hospedagem`, e `Pet Sitter` e `Creche` entram como valores novos) -- foi
// pedido medir com dez antes de eles existirem. O grupo da parte 1 mede o enum
// DE VERDADE, entao este arquivo nao afirma que os dez ja existem.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'sugerir_profissional_test.dart' show diretorioVazio;

/// Os DEZ rotulos previstos para o seletor de atividade -- ver o cabecalho.
///
/// A ordem e a de tela: os seis antigos, depois os estabelecimentos. `sitter`
/// aparece como `Hospedagem` (o rotulo que volta) e `Pet Sitter` e `Creche` sao
/// os valores novos.
const List<String> _dezRotulosPrevistos = <String>[
  'Veterinário',
  'Banho e tosa',
  'Dog Walker',
  'Hospedagem',
  'Pet Sitter',
  'Creche',
  'Adestrador',
  'Clínica',
  'Hospital',
  'Loja',
];

/// O rotulo mais longo do caminho da indicacao, que e de `EntityKind` e nao de
/// atividade: `TIPOS_DE_ENTIDADE` em `admin/src/diretorio/dominio.ts`.
const String _rotuloMaisLongo = 'Profissional ou estabelecimento';

/// A casca minima: o tema do app, porque `BichuColors` vive no `ThemeData` e o
/// componente estoura sem ele de proposito.
Widget _casca(Widget filho) => MaterialApp(
      theme: BichuTheme.claro,
      home: Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: filho,
        ),
      ),
    );

/// Fixa a janela em [largura] x 640 com `devicePixelRatio` 1, para `320` querer
/// dizer 320 **dp** e nao 320 pixels fisicos.
void _janela(WidgetTester tester, double largura) {
  tester.view.physicalSize = Size(largura, 640);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// A rede minima para a tela de indicacao abrir.
Future<http.Response> Function(http.Request) _rede() {
  return (req) async {
    final caminho = req.url.path;
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    return problema('not-found', 404);
  };
}

void main() {
  group('a TELA DE VERDADE oferece `Loja` e `Hospital`', () {
    testWidgets('a folha do seletor de atividade lista os dois valores novos',
        (tester) async {
      await abrirOApp(
        tester,
        rede: _rede(),
        deposito: depositoLogado(),
      );
      await irPara(tester, Rotas.sugerirProfissional);
      expect(find.byType(TelaSugerirProfissional), findsOneWidget);

      // Abre a folha pela porta real: o campo fechado do seletor de atividade.
      final seletor = find.ancestor(
        of: find.text('O que eles fazem'),
        matching: find.byType(SeletorDeLista),
      );
      await rolarAteDeCimaOuDeBaixo(
        tester,
        seletor,
        scrollable: find
            .descendant(
              of: find.byType(TelaSugerirProfissional),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.tap(
        find.descendant(of: seletor, matching: find.text('Escolher na lista')),
      );
      await tester.pumpAndSettle();

      for (final rotulo in <String>['Loja', 'Hospital']) {
        final alvo = find.text(rotulo);
        if (alvo.evaluate().isEmpty) {
          await tester.scrollUntilVisible(alvo, 120);
          await tester.pumpAndSettle();
        }
        expect(
          alvo,
          findsOneWidget,
          reason: 'REPROVA: o formulario de indicacao nao oferece "$rotulo". '
              'O valor entrou no `ProfessionalKind` e na `20261028000001` em '
              '28/10/2026 e tem rotulo em `AtividadeDoDiretorio` -- se ele nao '
              'esta na folha, a tela deixou de montar a lista a partir de '
              '`AtividadeDoDiretorio.values` e passou a repetir uma lista a '
              'mao. Quando isso acontece, todo valor novo some em SILENCIO.',
        );
      }
    });
  });

  group('o enum de hoje: `Loja` e `Hospital` existem com rotulo', () {
    test('`AtividadeDoDiretorio` carrega os dois, com a contagem travada',
        () {
      final rotulos = <String, String>{
        for (final a in AtividadeDoDiretorio.values) a.codigo: a.rotulo,
      };

      expect(
        rotulos['store'],
        'Loja',
        reason: 'REPROVA: `store` nao tem rotulo em `AtividadeDoDiretorio`. '
            'Ele entrou no contrato e na `20261028000001` em 28/10/2026, e um '
            'valor sem rotulo chega na tela como codigo cru.',
      );
      expect(
        rotulos['hospital'],
        'Hospital',
        reason: 'REPROVA: `hospital` nao tem rotulo em '
            '`AtividadeDoDiretorio`.',
      );
      // A CONTAGEM, para a chegada de um valor novo passar por aqui em vez de
      // passar calada. Dez quando a outra frente landar `Pet Sitter` e
      // `Creche`; oito hoje.
      expect(
        AtividadeDoDiretorio.values, hasLength(8),
        reason: 'REPROVA: a lista de atividades mudou de tamanho. Se foi de '
            'proposito, atualize este numero E releia a medicao de 320 dp '
            'deste arquivo -- a folha rola, mas o rotulo novo pode ser mais '
            'longo que todos os de hoje.',
      );
    });
  });

  group('320 dp: a folha ROLA e o rotulo QUEBRA, entao nada transborda', () {
    testWidgets('fechado, o rotulo mais longo do caminho nao transborda a '
        '320 dp', (tester) async {
      _janela(tester, 320);
      await tester.pumpWidget(
        _casca(
          SeletorDeLista(
            rotulo: 'Tipo',
            itens: const <ItemDeLista>[
              ItemDeLista(codigo: 'professional', rotulo: _rotuloMaisLongo),
              ItemDeLista(codigo: 'organization', rotulo: 'ONG'),
            ],
            selecionado: 'professional',
            aoSelecionar: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text(_rotuloMaisLongo), findsOneWidget);
      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: o estado fechado do seletor transbordou a 320 dp '
            'com "$_rotuloMaisLongo" escolhido.',
      );

      // =====================================================================
      // A AFIRMACAO QUE DE FATO MORDE: O TEXTO RECEBE A LARGURA QUE SOBRA
      // =====================================================================
      //
      // **`takeException` acima NAO basta, e isto foi medido e nao suposto.**
      // Com o `Expanded` trocado por `SizedBox(width: 96)` -- a largura em que
      // a sigla de UF cabia antes de o campo virar seletor -- o caso continuou
      // VERDE: `Text` sem `maxLines` sempre quebra linha, entao ele se acomoda
      // em 96 px crescendo para baixo e **transbordo nunca acontece**. Um caso
      // que so olha `takeException` aqui nao pode reprovar, e caso que nao
      // pode reprovar nao esta medindo nada.
      //
      // O que distingue o certo do errado e a LARGURA QUE O TEXTO RECEBEU. Com
      // `Expanded`, ele toma tudo o que sobra depois do glifo; com largura
      // fixa, nao.
      //
      // **MEDIDO nesta arvore, a 320 dp: 230,0 dp** -- descontadas as margens
      // da casca (16 x 2), o respiro interno do campo (`BichuEspaco.e4` x 2) e
      // o glifo. O piso de 150 fica entre o certo (230) e o quebrado (96), e
      // nao e numero redondo escolhido no ar: ele separa os dois casos
      // medidos. Travar 230 exato faria o caso reprovar com qualquer mudanca
      // de respiro do design system, que nao e o que ele quer vigiar.
      final larguraDoTexto =
          tester.getSize(find.text(_rotuloMaisLongo)).width;
      expect(
        larguraDoTexto,
        greaterThan(150),
        reason: 'REPROVA: o rotulo recebeu só ${larguraDoTexto.toInt()} dp de '
            'largura numa tela de 320. O estado fechado do seletor deixou de '
            'dar ao texto a largura que sobra (`Expanded`), e um rotulo de 30 '
            'caracteres como "$_rotuloMaisLongo" passa a empilhar em quatro ou '
            'cinco linhas dentro de uma caixa estreita -- que e pior que '
            'transbordar, porque nao acusa: nao ha faixa amarela, so um campo '
            'alto e feio que ninguem mede.',
      );
    });

    testWidgets('aberto com DEZ valores, a folha mostra todos e nao '
        'transborda a 320 dp', (tester) async {
      _janela(tester, 320);
      await tester.pumpWidget(
        _casca(
          SeletorDeLista(
            rotulo: 'O que eles fazem',
            itens: <ItemDeLista>[
              for (final r in _dezRotulosPrevistos)
                ItemDeLista(codigo: r, rotulo: r),
            ],
            selecionado: null,
            aoSelecionar: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();

      // Abre a folha pela PORTA REAL: o toque no campo fechado, que sem
      // escolha mostra o `estadoInicial` padrao de `SeletorDeLista`.
      await tester.tap(find.text('Escolher na lista'));
      await tester.pumpAndSettle();

      expect(
        tester.takeException(),
        isNull,
        reason: 'REPROVA: a folha de escolha transbordou a 320 dp com dez '
            'valores. Ela e um `ListView.builder` sob '
            '`ConstrainedBox(maxHeight: 70%)`: se isto reprovar, alguem trocou '
            'a lista rolavel por uma `Column`, e ai a contagem de valores '
            'passou a ser um limite de altura.',
      );

      // **Todos os dez, e nao "o primeiro e o ultimo"**: a folha rola, entao a
      // afirmacao e que cada rotulo existe na arvore depois de rolar ate ele.
      for (final rotulo in _dezRotulosPrevistos) {
        final alvo = find.text(rotulo);
        if (alvo.evaluate().isEmpty) {
          await tester.scrollUntilVisible(alvo, 120);
          await tester.pumpAndSettle();
        }
        expect(
          alvo,
          findsOneWidget,
          reason: 'REPROVA: "$rotulo" nao esta na folha de escolha a 320 dp, '
              'nem depois de rolar ate ele.',
        );
      }
    });
  });
}
