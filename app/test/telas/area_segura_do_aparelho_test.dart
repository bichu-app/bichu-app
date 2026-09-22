// O aparelho de verdade: recorte de sistema e folga entre elementos.
//
// POR QUE ESTE ARQUIVO EXISTE, e o que ele diz sobre a suite que ja havia.
//
// Em 22/09 o cliente instalou o APK num celular fisico -- o primeiro teste em
// aparelho do projeto -- e achou dois defeitos de posicionamento que a suite
// inteira nao via:
//
//   1. `Agora não`, na antessala de aviso, fica **fora da area de clique**;
//   2. o `Fechar` do leitor de QR **sobrepoe o rotulo** do campo de digitar o
//      codigo.
//
// Os dois passaram por 465 casos, por oito arquivos de acessibilidade e por
// uma trava de arvore. Passaram porque **nenhum caso da suite tinha vocabulario
// para eles**:
//
//   - Todo `MediaQueryData` construido em teste neste repositorio passa
//     `textScaler` e mais nada. O construtor cru zera `padding`,
//     `viewPadding`, `viewInsets` e `systemGestureInsets`. Nenhum notch,
//     nenhuma ilha dinamica e nenhuma barra de gestos existia em teste, e por
//     isso todo `SafeArea` do app era um widget sem efeito medido.
//   - `verificarAlvoDeToque` mede o **menor lado de um retangulo isolado**
//     contra um piso escalar. Cada no e avaliado sozinho: nunca contra outro
//     no, nunca contra a borda da tela, nunca contra uma barra do sistema. Um
//     botao de 64 x 64 desenhado inteiro debaixo da barra de gestos passa.
//   - `tester.tap(finder)` entrega o toque direto ao `RenderObject`. Ele nao
//     faz hit-test contra o sistema operacional e por construcao nao consegue
//     acusar que aquele ponto seria comido pelo gesto de home.
//
// Este arquivo fecha a lacuna com duas medidas que a suite nao fazia:
// **interseccao entre dois retangulos** e **distancia ate o recorte do
// sistema**. As duas sao geometria do render, e nenhuma delas sobrevive a uma
// tela montada num retangulo limpo de 800 x 600.

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/escanear/tela_leitor_de_qr.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/theme/bichu_tokens.g.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// O recorte de um aparelho com barra de gestos, em dp.
///
/// Os numeros NAO foram escolhidos aqui. `34` e a altura do indicador de home
/// do iPhone (Human Interface Guidelines, "Layout": a area segura inferior em
/// aparelho sem botao); `48` e a `navigation_bar_height` do Android com tres
/// botoes, que e o pior caso entre os dois modos de navegacao do sistema. O
/// topo de `59` e o da ilha dinamica; ele entra para que o caso tambem cubra a
/// barra superior, e nao so a inferior.
class Aparelho {
  const Aparelho(this.nome, this.topo, this.base);

  final String nome;
  final double topo;
  final double base;

  static const Aparelho semRecorte = Aparelho('retangulo limpo', 0, 0);
  static const Aparelho iphone = Aparelho('iPhone com ilha dinamica', 59, 34);
  static const Aparelho android = Aparelho('Android com barra de 3 botoes', 24, 48);
}

/// Aplica o recorte **na view do teste**, e nao num `MediaQuery` proprio.
///
/// Pela view, porque e por ela que o recorte chega no aparelho: o
/// `MaterialApp` monta `MediaQuery.fromView`, e e dali que todo `SafeArea` do
/// app le. Um `MediaQuery` embrulhado por cima no caso de teste mediria o
/// widget que o teste escreveu, e nao o caminho que o app percorre.
///
/// `FakeViewPadding` recebe **pixel fisico**, e por isso cada valor e
/// multiplicado pela densidade.
void aparelho(WidgetTester tester, Aparelho a) {
  final d = tester.view.devicePixelRatio;
  tester.view.padding = FakeViewPadding(top: a.topo * d, bottom: a.base * d);
  tester.view.viewPadding =
      FakeViewPadding(top: a.topo * d, bottom: a.base * d);
  tester.view.systemGestureInsets =
      FakeViewPadding(top: a.topo * d, bottom: a.base * d);
  addTearDown(tester.view.reset);
}

Future<http.Response> _semServidor(http.Request _) async =>
    http.Response('', 404);

void main() {
  // --------------------------------------------------------------------
  // ACHADO 5 — o `Fechar` sobre o titulo do campo de digitar o codigo.
  //
  // A REGRA MEDIDA, e ela e mais larga que o defeito: a saida do leitor fica
  // **sobreposta** a todos os estados, num `Stack`. Nenhum deles pode desenhar
  // texto embaixo dela. O caso percorre os estados alcancaveis e mede
  // interseccao de retangulo, que e a medida que a suite nao tinha.
  //
  // A BICHUS-220 tirou o visor falso e juntou os dois estados de abertura num
  // so (`semLeitura`): o que aqui se chamava `camera fora` e agora a unica
  // tela de abertura que existe, e a medida continua valendo palavra por
  // palavra.
  //
  // ISCA: devolva `SizedBox(height: BichuEspaco.e6)` a abertura de
  // `_Digitacao` e o caso reprova com os dois retangulos na mensagem.
  //
  // O caso roda nos TRES aparelhos de proposito, inclusive no retangulo
  // limpo, e a razao e o diagnostico: este defeito **nao e de area segura**.
  // A saida esta num `SafeArea` e o corpo tambem; os dois descem juntos
  // quando o recorte cresce, e a interseccao entre eles e a mesma em qualquer
  // aparelho. Ela e aritmetica de deslocamento fixo. Rodar no retangulo limpo
  // e o que impede a conclusao errada de que bastava um `SafeArea` a mais --
  // e e a prova de que a suite antiga podia ter pego este, e nao pegou por
  // outro motivo: ninguem cruzava dois retangulos.
  for (final a in <Aparelho>[
    Aparelho.semRecorte,
    Aparelho.iphone,
    Aparelho.android,
  ]) {
    for (final digitando in <bool>[false, true]) {
      final estado = digitando ? 'digitando' : 'sem leitura';
      testWidgets(
          'a saida sobreposta do leitor nao cobre texto nenhum '
          '($estado, ${a.nome})', (tester) async {
        aparelho(tester, a);

        await abrirOApp(
          tester,
          rede: _semServidor,
          camera: CameraDeTeste(EstadoDaPermissao.negada),
        );
        await tester
            .tap(find.widgetWithText(OutlinedButton, 'Escanear uma tag'));
        await tester.pumpAndSettle();
        if (digitando) {
          await tester.tap(
            find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
          );
          await tester.pumpAndSettle();
        }

        final saida = tester.getRect(find.byTooltip('Fechar'));
        final cobertos = <String>[];
        for (final texto in tester.widgetList<Text>(find.byType(Text))) {
          final conteudo = texto.data;
          if (conteudo == null || conteudo.isEmpty) continue;
          final onde = tester.getRect(find.text(conteudo).first);
          if (saida.overlaps(onde)) cobertos.add('"$conteudo" em $onde');
        }

        expect(
          cobertos,
          isEmpty,
          reason:
              'REPROVA: o alvo de `Fechar` ($saida) cobre texto no estado '
              '$estado: ${cobertos.join(" | ")}. A saida e sobreposta a todos os '
              'estados e ocupa os primeiros '
              '$alturaDaSaidaSobreposta dp a partir da area segura '
              '(${BichuEspaco.e2} dp de folga mais o alvo critico de '
              '${BichuAlvoDeToque.critico} dp, design system 6.5). Quem usa '
              'leitor de tela nao percebe: a arvore de semantica continua '
              'correta e so o desenho se atropela.',
        );
      });
    }
  }

  // --------------------------------------------------------------------
  // ACHADO 3 — `Agora não` embaixo da barra de gestos.
  //
  // ISCA: se alguem tirar o `SafeArea` da antessala, ou trocar a folga
  // inferior por um espacamento fixo, este caso reprova em iPhone e em
  // Android e continua passando no retangulo limpo -- que e exatamente o que
  // a suite media antes.
  //
  // Por que `showModalBottomSheet(useSafeArea: true)` NAO resolve isto, e por
  // que a leitura intuitiva do nome do parametro esta errada: o Flutter monta
  // `SafeArea(bottom: false, child: content)`
  // (`material/bottom_sheet.dart`, `_ModalBottomSheetRoute.buildPage`). O
  // parametro protege o **topo** e devolve a base ao conteudo da folha, de
  // proposito, porque so o conteudo sabe se ele rola ou nao. A folha de sair
  // da conta (`telas/abas.dart`) e o seletor de lista ja faziam a sua parte;
  // a antessala nao fazia, e era a unica das tres com um botao encostado na
  // borda inferior.
  for (final a in <Aparelho>[Aparelho.iphone, Aparelho.android]) {
    testWidgets('`Agora não` fica inteiro acima do recorte do sistema '
        '(${a.nome})', (tester) async {
      aparelho(tester, a);

      await abrirOApp(tester, rede: _semServidor);
      final contexto = tester.element(find.byType(Scaffold).first);
      // Sem `await`: a folha so fecha quando alguem responde, e o caso mede a
      // folha aberta.
      AntessalaDeAviso.mostrar(contexto, nomeDoPet: 'Rex');
      await tester.pumpAndSettle();

      final tela = tester.view.physicalSize.height / tester.view.devicePixelRatio;
      final botao = tester.getRect(
        find.widgetWithText(OutlinedButton, TextosDaAntessala.agoraNao),
      );
      final inicioDoRecorte = tela - a.base;

      expect(
        botao.bottom,
        lessThanOrEqualTo(inicioDoRecorte),
        reason:
            'REPROVA: `${TextosDaAntessala.agoraNao}` termina em '
            '${botao.bottom} dp e o recorte inferior de ${a.nome} comeca em '
            '$inicioDoRecorte dp. Os ultimos '
            '${(botao.bottom - inicioDoRecorte).toStringAsFixed(1)} dp do '
            'botao ficam embaixo da barra do sistema, que **come o toque** '
            'antes de ele chegar no app. O alvo continua com 48 dp e passa '
            'em qualquer verificacao de tamanho: o que falta nao e tamanho, '
            'e distancia ate a borda. A recusa e o lado seguro desta tela '
            '(UX 10) e e justamente ela que fica inalcancavel.',
      );
    });
  }
}
