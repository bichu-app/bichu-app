// O GLIFO DAS TRES ABAS DA `Rede` (cliente, 22/10/2026).
//
// Literal: *"na secao rede, nas abas eventos, comunidade e usuarios, vamos
// trazer um icone para deixar mais bonito"*.
//
// Este arquivo mede DUAS coisas, e a segunda e o custo da primeira:
//
//   1. que cada uma das TRES abas tem glifo, e que cada glifo e o que foi
//      escolhido para ela (a escolha esta justificada na prosa de
//      `AbaDaSecaoRede`);
//   2. **ONDE A TERCEIRA ABA COMECA em 320 dp**, que e o que o glifo empurra.
//      `Usuários` ja nascia parcialmente fora da tela antes do icone, e um
//      glifo deitado ao lado do rotulo piora esse numero. O caso TRAVA o
//      numero em vez de afirmar que esta tudo bem: quem crescer o glifo ou o
//      vao reprova aqui e ve em quanto.
//
// **A VERTICAL FOI MEDIDA E REPROVOU, e e por isso que o desenho e deitado.**
// Com `Tab(icon:, text:)` o M3 empilha e pede 72 dp; a 200% de escala a linha
// do rotulo cresce e a pilha estoura por 2,0 px, em cinco casos de 200% de
// quatro arquivos. Ver a prosa da `TabBar` em `secao_da_rede.dart`.
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import '../telas/ajuda_de_tela.dart';
import '../telas/gaveta_oculta_e_barra_nova_test.dart'
    show redeDasCincoListagens;

Future<void> _abrirARede(WidgetTester tester, {double escala = 1}) async {
  await abrirOApp(
    tester,
    rede: redeDasCincoListagens,
    deposito: depositoLogado(),
    escala: escala,
  );
  await tester.tap(find.widgetWithText(NavigationDestination, 'Rede'));
  await tester.pumpAndSettle();
}

void main() {
  group('o glifo das abas da `Rede`', () {
    // DESLIGAR PARA VER REPROVAR: em `rede/secao_da_rede.dart`, na `TabBar`,
    // troque o `Row` do `child:` por `Text(a.rotulo)` -- o desenho de antes de
    // 22/10. Os tres sub-casos reprovam, um por aba, dizendo qual glifo falta.
    testWidgets('as TRES abas tem glifo, e cada uma tem O SEU', (tester) async {
      await _abrirARede(tester);

      // CONTROLE POSITIVO, e ele vem ANTES: `findsNothing` num glifo e
      // indistinguivel de "a `TabBar` nao esta na tela". As tres abas sao o
      // que prova que ela esta.
      for (final aba in AbaDaSecaoRede.values) {
        expect(
          find.descendant(
            of: find.byType(TabBar),
            matching: find.text(aba.rotulo),
          ),
          findsOneWidget,
          reason:
              'REPROVA: a aba `${aba.rotulo}` nao esta pintada. Sem ela, o '
              '`findsOneWidget` do glifo abaixo nao mede o glifo -- ele mede '
              'se a tela existe.',
        );
      }

      for (final aba in AbaDaSecaoRede.values) {
        expect(
          find.descendant(
            of: find.byType(Tab),
            matching: find.byIcon(aba.glifo),
          ),
          findsOneWidget,
          reason:
              'REPROVA: a aba `${aba.rotulo}` nao desenha o glifo '
              '`${aba.glifo}`. O cliente pediu icone nas TRES em 22/10/2026, '
              'e uma aba sem glifo entre duas com glifo le como defeito.',
        );
      }
    });

    // CONTROLE NEGATIVO do caso acima: um glifo que NAO foi escolhido para
    // nenhuma aba nao pode estar na `TabBar`. Sem ele, `byIcon` casando com
    // qualquer coisa passaria -- e foi assim que um portao deste repositorio
    // ficou verde lendo o fonte em vez da arvore.
    testWidgets('a `TabBar` nao desenha glifo que nao e de aba nenhuma',
        (tester) async {
      await _abrirARede(tester);
      expect(
        find.descendant(
          of: find.byType(TabBar),
          matching: find.byIcon(Icons.shopping_bag_outlined),
        ),
        findsNothing,
        reason:
            'REPROVA: a `TabBar` da `Rede` desenhou o glifo da `Loja`. Se '
            'este `findsNothing` falha, o `findsOneWidget` do caso acima nao '
            'esta medindo QUAL glifo e cada aba.',
      );
    });

    // DESLIGAR PARA VER REPROVAR: no mesmo `Row`, troque `size: 20` por
    // `size: 24` (ou `BichuEspaco.e1` por `e2` no vao). A terceira aba comeca
    // mais a direita e este caso diz em quantos dp.
    testWidgets('o glifo das abas nao empurra `Usuários` para fora da tela',
        (tester) async {
      // 320 dp de largura, que e o piso que a prosa de `AbaDaSecaoRede` usa
      // para todas as contas desta barra.
      tester.view.physicalSize = const Size(960, 2400);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);

      await _abrirARede(tester);

      final barra = tester.getRect(find.byType(TabBar));
      final terceira = tester.getRect(
        find.descendant(
          of: find.byType(TabBar),
          matching: find.text(AbaDaSecaoRede.usuarios.rotulo),
        ),
      );
      final comecaEm = terceira.left - barra.left;

      // **O NUMERO E O CUSTO DO GLIFO, TRAVADO, e os DOIS lados foram
      // medidos nesta bancada** -- desligando o `Row` da `TabBar` e rodando
      // este mesmo caso:
      //
      //   sem glifo (so `Text(a.rotulo)`)   386,00 dp
      //   com glifo de 20 dp + vao de 4 dp  458,00 dp
      //
      // O custo e **+72,00 dp**, que e 24 dp por aba vezes tres.
      //
      // **E AQUI ESTA O QUE A MEDICAO CORRIGIU:** a prosa de `AbaDaSecaoRede`
      // diz que `Usuários` aparece em cerca de 40% numa tela de 320 dp,
      // comecando a 244,43 dp de um corpo de 288 dp uteis. Esse numero e da
      // bancada do prototipo e e do SLOT; o rotulo renderizado comeca a
      // **386,00 dp** nesta arvore, ou seja **a terceira aba ja estava
      // INTEIRA fora da area util antes do glifo**. O glifo nao criou o
      // problema -- ele piorou um numero que ja estava do outro lado da borda.
      // Quem for consertar a visibilidade da terceira aba nao consegue
      // faze-lo encolhendo o glifo.
      //
      // O caso existe para que a proxima pessoa que crescer o glifo ou o vao
      // VEJA o que esta gastando, em vez de descobrir no aparelho. A
      // tolerancia e de 1 dp: a medida vem da `Inter` real e de arredondamento
      // de pintura.
      expect(
        comecaEm,
        closeTo(458.0, 1.0),
        reason:
            'REPROVA: a aba `Usuários` comeca a '
            '${comecaEm.toStringAsFixed(2)} dp do inicio da `TabBar`, e o '
            'numero travado e 458,00 (sem glifo eram 386,00). Se ele '
            'CRESCEU, o glifo ou o vao cresceu e a terceira aba foi mais para '
            'fora de uma tela de 320 dp. Se ele DIMINUIU e isso foi de '
            'proposito, troque o numero nesta linha e diga por que.',
      );

      // E a aba continua inteira: rolar nao e cortar, e a barra e rolavel.
      final paragrafo = tester.renderObject<RenderParagraph>(
        find.descendant(
          of: find.byType(TabBar),
          matching: find.text(AbaDaSecaoRede.usuarios.rotulo),
        ),
      );
      expect(
        paragrafo.getMaxIntrinsicWidth(double.infinity),
        lessThanOrEqualTo(paragrafo.constraints.maxWidth + 0.01),
        reason:
            'REPROVA: `Usuários` nao cabe na largura que recebeu. O glifo '
            'passou a disputar espaco COM o rotulo em vez de ao lado dele.',
      );
    });
  });
}
