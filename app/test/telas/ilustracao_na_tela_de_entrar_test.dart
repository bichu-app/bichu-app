// A ilustracao da identidade visual na TELA DE ENTRAR.
//
// O PEDIDO, nas palavras do cliente:
//   "nao entrou a imagem que eu pedi na tela de entrar, que e aquela imagem da
//    identidade visual das pessoas com o pet no parque"
//
// POR QUE ESTE ARQUIVO EXISTE, E NAO SO O DE 17/10. O pedido anterior dele
// ("coloque a imagem da identidade visual na pagina do perfil para entrar")
// virou marca na ABA `Perfil` deslogada -- `abas.dart`, `MarcaLockup` --, que
// e outra tela, e virou LOGOTIPO, que e outro desenho. As duas coisas erradas
// de uma vez, e nenhuma isca pegava, porque `marca_nas_duas_telas_test.dart`
// guarda exatamente o que foi feito. Este arquivo guarda o que foi PEDIDO: a
// ilustracao, em `C.2 — Entrar`.
//
// AS QUATRO COISAS QUE ESTAS ISCAS GUARDAM:
//
// 1. **A tela certa.** Os casos abrem `Rotas.entrar`, e nao a aba `Perfil`.
//    Quem mover a ilustracao de volta para a aba reprova aqui.
//
// 2. **O desenho certo.** O caso cobra o CAMINHO do asset, e nao "existe uma
//    imagem": trocar a ilustracao pelo logotipo em vetor e o jeito mais
//    provavel de este pedido se perder outra vez, e `MarcaLockup` nao e um
//    `Image` -- uma busca por `Image` ficaria verde depois da troca.
//
// 3. **O teclado manda nela.** Esta e a que um olho humano nao pega relendo o
//    diff. A tela tem dois campos; imagem grande que divide a altura util com
//    o teclado empurra a senha e a faixa de recusa para fora da dobra. A isca
//    abre o teclado do jeito que o Flutter deixa um teste abrir -- cravando
//    `viewInsets.bottom` -- e exige que a ilustracao saia e que os dois campos
//    fiquem.
//
// 4. **Ela e DECORATIVA.** O caso le a propriedade que tira a imagem da arvore
//    de semantica. Sem ela, quem usa TalkBack ouve um anuncio a mais antes do
//    primeiro campo de uma tela que so tem dois.
//
// O QUE ESTES CASOS NAO MEDEM, escrito para ninguem contar com o contrario:
// eles nao olham pixel e nao dizem que a tela ficou bonita. Que o arquivo
// pinta, e como ele pinta em aparelho, nenhum teste de widget responde.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

Future<http.Response> _semServidor(http.Request _) async =>
    http.Response('', 404);

/// O caminho exato do asset. Esta string e o contrato entre
/// `app/pubspec.yaml`, `telas/conta/tela_entrar.dart` e estes casos: renomear
/// o arquivo sem passar pelos tres reprova aqui, e nao no aparelho.
const String _caminhoDaIlustracao =
    'assets/ilustracoes/tres-pessoas-no-parque.webp';

/// A ilustracao, achada pelo que ela E e nao por onde ela esta.
Finder get _aIlustracao => find.byWidgetPredicate(
      (w) =>
          w is Image &&
          w.image is AssetImage &&
          (w.image as AssetImage).assetName == _caminhoDaIlustracao,
      description: 'a ilustracao `$_caminhoDaIlustracao`',
    );

Future<void> abrirAEntrada(WidgetTester tester) async {
  await abrirOApp(tester, rede: _semServidor);
  await irPara(tester, Rotas.entrar);
}

void main() {
  group('C.2 — Entrar: a ilustracao da identidade visual', () {
    testWidgets('esta na tela, e e a ILUSTRACAO e nao o logotipo',
        (tester) async {
      await abrirAEntrada(tester);

      expect(
        _aIlustracao,
        findsOne,
        reason:
            'REPROVA: a tela de entrar nao tem mais a ilustracao da identidade '
            'visual. Ela e o pedido literal do cliente -- "aquela imagem da '
            'identidade visual das pessoas com o pet no parque" -- e ele ja '
            'reclamou uma vez de ela nao ter entrado, porque a entrega '
            'anterior pos o LOGOTIPO na ABA `Perfil`. Se este caso ficou '
            'vermelho, confira as duas coisas antes de mexer: a tela e esta '
            '(`Rotas.entrar`), e o desenho e `$_caminhoDaIlustracao`, '
            'declarado em `app/pubspec.yaml`. `MarcaLockup` NAO satisfaz este '
            'caso, de proposito: ele e o logotipo, nao a ilustracao.',
      );
    });

    testWidgets('e DECORATIVA: fica fora da arvore de semantica',
        (tester) async {
      await abrirAEntrada(tester);

      final imagem = tester.widget<Image>(_aIlustracao);
      expect(
        imagem.excludeFromSemantics,
        isTrue,
        reason:
            'REPROVA: a ilustracao voltou para a arvore de semantica. Ela nao '
            'diz nada que o texto da tela nao diga -- a barra ja anuncia '
            '`Entrar` e os campos se chamam `E-mail` e `Senha` --, entao ela e '
            'decorativa pelo criterio do WCAG 1.1.1. Anuncia-la custa um '
            'paragrafo inteiro antes do primeiro campo de uma tela que so tem '
            'dois, e nao entrega nada que mude o que a pessoa faz aqui. Se '
            'algum dia ela passar a CARREGAR informacao, este caso deve virar '
            'o contrario (exigir descricao), e nao ser apagado.',
      );
    });

    testWidgets('com o teclado ABERTO ela sai, e os dois campos ficam',
        (tester) async {
      await abrirAEntrada(tester);
      expect(_aIlustracao, findsOne);

      // Teclado aberto e, para o Flutter, `viewInsets.bottom` maior que zero.
      // 336 dp e a altura tipica do teclado do Android num aparelho comum: o
      // valor exato nao importa, so que seja maior que zero, que e o que a
      // tela le.
      tester.view.viewInsets = const FakeViewPadding(bottom: 336 * 3);
      addTearDown(tester.view.resetViewInsets);
      await tester.pumpAndSettle();

      expect(
        _aIlustracao,
        findsNothing,
        reason:
            'REPROVA: a ilustracao continua na tela com o teclado aberto. Esta '
            'e uma tela em que a pessoa DIGITA duas vezes, e a conta de '
            'rolagem medida em 23/09/2026 (no comentario do '
            '`bottomNavigationBar` de `tela_entrar.dart`) ja era apertada SEM '
            'imagem nenhuma: em 320x568 faltavam 100 dp de rolagem para o '
            'botao, e 360 dp depois do 401. Somar 128 a 192 dp de decoracao a '
            'isso e trocar "mais bonita" por "inutilizavel". A imagem existe '
            'para quando se CHEGA na tela, nao para quando se digita nela. '
            'Cuidado com o lugar de onde o teclado e lido: dentro do '
            '`Scaffold` o `viewInsets.bottom` vem ZERADO e este caso fica '
            'vermelho sem ninguem ter mudado o desenho.',
      );
      expect(
        find.byType(BichuField),
        findsExactly(2),
        reason:
            'REPROVA: um dos campos sumiu com o teclado aberto. Sair junto com '
            'a decoracao e pior do que a decoracao ter ficado.',
      );
    });

    testWidgets('a altura respeita o piso e o teto, do menor ao maior aparelho',
        (tester) async {
      // Os dois extremos dos gabaritos do design system (secao 13). As duas
      // medidas saem do passo de espaco do tema (`BichuEspaco.e16` = 64), e
      // nao de numero inventado: piso 128 dp, teto 192 dp.
      for (final (nome, largura, altura, esperado) in <(
        String,
        double,
        double,
        double
      )>[
        ('o menor gabarito, 320x568', 320, 568, 128),
        ('o maior gabarito, 412x915', 412, 915, 183),
      ]) {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = Size(largura, altura);
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await abrirAEntrada(tester);

        expect(
          tester.getSize(_aIlustracao).height,
          moreOrLessEquals(esperado, epsilon: 1),
          reason:
              'REPROVA em $nome: a ilustracao esta com altura fora da faixa. '
              'Ela e 20% da altura da tela presa entre 128 e 192 dp. Abaixo do '
              'piso ela vira enfeite ilegivel; acima do teto ela come a tela '
              'de quem tem aparelho pequeno, que e justamente quem tem menos '
              'espaco para perder.',
        );
        expect(
          tester.getSize(_aIlustracao).width,
          lessThanOrEqualTo(largura),
          reason:
              'REPROVA em $nome: a ilustracao ficou mais larga que a tela. '
              'O `BoxFit.contain` existe para isso: em tela larga sobra '
              'transparente dos lados, e nunca se corta pessoa nem pet.',
        );
      }
    });
  });
}
