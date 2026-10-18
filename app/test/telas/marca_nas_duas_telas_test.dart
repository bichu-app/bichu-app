// A identidade visual nas duas telas que o cliente apontou (17/10/2026).
//
// O PEDIDO, nas palavras dele:
//   "Coloque a imagem da identidade visual na pagina do perfil para entrar e
//    deixar o aplicativo mais bonito."
//   "Na pagina de digitar o codigo do pet, coloque uma imagem para deixar a
//    pagina mais bonita e se conectar mais com o usuario."
//
// AS TRES COISAS QUE ESTAS ISCAS GUARDAM, e por que cada uma precisa de caso
// proprio:
//
// 1. **A imagem e a marca que o repositorio JA TEM, desenhada em vetor.** Os
//    casos procuram `MarcaLockup` e `MarcaSimbolo`, que saem de
//    `design/marca/vetor/` por `widgets/marca.dart`. Quem trocar um deles por
//    um `Image.asset` reprova aqui -- e e isso que esta isca existe para
//    pegar, porque asset e peso fixo no binario e porque arte nova neste
//    projeto passa por desenho antes do codigo.
//
// 2. **As duas sao DECORATIVAS, e o leitor de tela nao as anuncia.** O caso le
//    a arvore de SEMANTICA, e nao a arvore de widgets: `ExcludeSemantics` e
//    uma linha facil de apagar numa refatoracao, e sem ela quem usa TalkBack
//    passa a ouvir "Bichu" antes do unico conteudo que a tela tem.
//
// 3. **A plaquinha some com o teclado aberto.** Esta e a que mais importa das
//    tres, e a que um olho humano nao pega relendo o diff: a tela do codigo e
//    uma tela em que a pessoa DIGITA, e decoracao que empurra o campo para
//    debaixo do teclado troca "mais bonita" por "inutilizavel". O caso abre o
//    teclado do jeito que o Flutter deixa um teste abrir -- cravando
//    `viewInsets.bottom` -- e exige que a plaquinha saia da arvore.
//
// O QUE ESTES CASOS NAO MEDEM, escrito para ninguem contar com o contrario:
// eles nao olham pixel. Que o simbolo PINTOU com a tinta certa nos dois temas
// e trabalho de `test/marca/logotipo_em_vetor_test.dart`, que rasteriza e
// conta pixel; duplicar aquilo aqui seria uma segunda fonte da verdade para a
// mesma pergunta.

import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/marca.dart';
import 'package:bichu/widgets/moldura.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

Future<http.Response> _semServidor(http.Request _) async =>
    http.Response('', 404);

/// O que o leitor de tela anunciaria como "Bichu".
///
/// `bySemanticsLabel` olha a arvore de SEMANTICA e nao a de widgets, e e essa
/// a pergunta: nao se a palavra foi pintada, se ela e ANUNCIADA. Um
/// `Semantics(label: 'Bichu')` sem texto nenhum na tela e exatamente o caso
/// que uma varredura por `Text` deixaria passar -- e e a forma do rotulo
/// padrao dos dois widgets da marca.
final Finder _anunciaAMarca = find.bySemanticsLabel('Bichu');

void main() {
  group('Perfil deslogado: a marca abre a porta de entrada', () {
    testWidgets('o lockup da marca esta na tela, em vetor', (tester) async {
      final semantica = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await tester.tap(find.text('Perfil'));
      await tester.pumpAndSettle();

      expect(
        find.byType(MarcaLockup),
        findsOne,
        reason: 'REPROVA: o `Perfil` deslogado perdeu o logotipo. Ele e o que '
            'o cliente pediu em 17/10 e e o vetor de '
            '`design/marca/vetor/lockup-sem-descritor.svg`, que o app ja '
            'carrega: se ele sumiu, ou a tela voltou a ser tres botoes num '
            'fundo vazio, ou alguem o trocou por um asset -- e asset de marca '
            'nesta tela e peso fixo no binario para uma imagem que o app ja '
            'sabe desenhar.',
      );

      // A PROVA NEGATIVA do peso: nenhuma imagem de arquivo entrou junto.
      expect(
        find.byType(Image),
        findsNothing,
        reason: 'REPROVA: apareceu um `Image` no `Perfil` deslogado. A marca '
            'nesta tela e vetor desenhado (`MarcaLockup`), e nao PNG '
            'empacotado: o APK nao cresce e a tinta sai do tema, entao a mesma '
            'imagem serve o tema claro e o escuro sem um segundo arquivo.',
      );

      semantica.dispose();
    });

    testWidgets('a marca e DECORATIVA: o leitor de tela nao a anuncia',
        (tester) async {
      final semantica = tester.ensureSemantics();
      await abrirOApp(tester, rede: _semServidor);
      await tester.tap(find.text('Perfil'));
      await tester.pumpAndSettle();

      expect(
        _anunciaAMarca,
        findsNothing,
        reason: 'REPROVA: o leitor de tela anuncia "Bichu" no `Perfil` '
            'deslogado. A imagem ali nao carrega informacao -- a barra de topo '
            'ja disse `Perfil` e os tres controles dizem o que fazem --, entao '
            'ela e decorativa pelo criterio do WCAG 1.1.1 e precisa ficar '
            'dentro de `ExcludeSemantics`. Anuncia-la so adia o unico conteudo '
            'da tela para quem usa TalkBack.',
      );

      semantica.dispose();
    });

    testWidgets('a marca nao empurrou os tres controles para fora',
        (tester) async {
      await abrirOApp(tester, rede: _semServidor);
      await tester.tap(find.text('Perfil'));
      await tester.pumpAndSettle();

      // O caso positivo junto do decorativo: portao que so proibe some do CI
      // tao rapido quanto portao que so aprova.
      for (final rotulo in <String>[
        'Entrar',
        'Criar conta',
        'Escanear uma tag',
      ]) {
        expect(
          find.text(rotulo),
          findsOne,
          reason: 'REPROVA: `$rotulo` sumiu do `Perfil` deslogado depois que a '
              'marca entrou. A imagem e decoracao: ela nao pode custar um '
              'controle.',
        );
      }
    });
  });

  group('Digitar o codigo: a plaquinha, e o teclado manda nela', () {
    Future<void> abrirADigitacao(WidgetTester tester) async {
      await abrirOApp(tester, rede: _semServidor);
      await tester.tap(find.descendant(
        of: find.byType(AppBar),
        matching: find.byIcon(Icons.qr_code_2),
      ));
      await tester.pumpAndSettle();
      await tester.tap(
        find.widgetWithText(BotaoPrimario, TextosDoCadastro.digitarOCodigo),
      );
      await tester.pumpAndSettle();
    }

    testWidgets('com o teclado fechado, a plaquinha esta la', (tester) async {
      await abrirADigitacao(tester);

      expect(
        find.byType(Moldura),
        findsOne,
        reason: 'REPROVA: a tela de digitar o codigo perdeu a plaquinha. Ela e '
            'a forma que o §1 do design system chama de "o que amarra o '
            'sistema": o objeto que a pessoa esta segurando enquanto digita o '
            'que esta impresso nele.',
      );
      expect(
        find.byType(MarcaSimbolo),
        findsOne,
        reason: 'REPROVA: a plaquinha ficou vazia. O simbolo dentro dela e o '
            'vetor de `design/marca/vetor/simbolo.svg`, e e ele que faz a '
            'forma ser a plaquinha do Bichu e nao um retangulo arredondado '
            'qualquer.',
      );
      expect(
        find.byType(Image),
        findsNothing,
        reason: 'REPROVA: apareceu um `Image` na tela do codigo. A plaquinha '
            'aqui e desenhada (`Moldura` + `MarcaSimbolo`) e nao custa um byte '
            'de APK; um PNG custaria, e ainda precisaria de um segundo arquivo '
            'para o tema escuro.',
      );
    });

    testWidgets('com o teclado ABERTO, a plaquinha sai e o campo fica',
        (tester) async {
      await abrirADigitacao(tester);

      // Teclado aberto e, para o Flutter, `viewInsets.bottom` maior que zero.
      // 336 dp e a altura tipica do teclado do Android num aparelho comum --
      // o valor exato nao importa, so que seja maior que zero, que e o que a
      // tela le.
      tester.view.viewInsets = const FakeViewPadding(bottom: 336 * 3);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();

      expect(
        find.byType(Moldura),
        findsNothing,
        reason: 'REPROVA: a plaquinha continua na tela com o teclado aberto. '
            'Esta e uma tela em que a pessoa DIGITA dezesseis caracteres: '
            'decoracao que divide a altura util com o teclado empurra o campo '
            'para onde ele nao se ve. A imagem existe para quando se CHEGA na '
            'tela, nao para quando se digita nela.',
      );
      expect(
        find.byType(TextField),
        findsOne,
        reason: 'REPROVA: o campo do codigo sumiu com o teclado aberto. Sair '
            'junto com a decoracao e pior que a decoracao ter ficado.',
      );
    });

    testWidgets('a plaquinha e DECORATIVA: o leitor de tela nao a anuncia',
        (tester) async {
      final semantica = tester.ensureSemantics();
      await abrirADigitacao(tester);

      expect(
        _anunciaAMarca,
        findsNothing,
        reason: 'REPROVA: o leitor de tela anuncia "Bichu" na tela do codigo. '
            'A plaquinha ali nao diz nada que o rotulo do campo logo abaixo '
            'nao diga: ela e decorativa e `Moldura` precisa continuar dentro '
            'de `ExcludeSemantics`. Para quem nao ve, um anuncio a mais antes '
            'do campo e so atraso.',
      );

      semantica.dispose();
    });
  });
}
