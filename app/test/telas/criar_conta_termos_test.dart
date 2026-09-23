import 'dart:convert';
// `CheckedState` vive em dart:ui e nao e reexportado por semantics.dart.
import 'dart:ui' show CheckedState;

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// F1.1 — o aceite dos termos: a caixa que o cliente pediu, e o REGISTRO dela.
///
/// **O que este arquivo cobra, e por que nao e o widget.** O cliente pediu a
/// caixa duas vezes (a segunda em 22/09/2026, depois do teste em aparelho).
/// Um caso que confirmasse "existe um `Checkbox` na tela" ficaria verde com o
/// aceite NAO sendo gravado, que e o defeito que importa aqui: sem
/// `--dart-define=TERMS_VERSION` a chave `accepted_terms_version` nao ia no
/// corpo, e o backend so grava `accepted_terms_at` quando ela chega
/// (`src/modules/identity/adapters/persistence/kysely-identity-repository.ts`,
/// `accepted_terms_at: nova.acceptedTermsVersion === undefined ? null : agora`).
///
/// A combinacao que a caixa sozinha produziria e a pior das duas: a pessoa
/// marca que aceitou, a tela afirma o aceite, e no banco fica conta criada com
/// as duas colunas nulas. Onus da prova, nao detalhe de tela
/// (`docs/04-seguranca.md` 6.6, BICHUS-29 criterio 7).
///
/// Por isso a regra que os casos abaixo guardam e escrita sobre o CORPO
/// enviado, e nao sobre a arvore de widgets:
///
/// > **Toda requisicao de cadastro que sai desta tela carrega
/// > `accepted_terms_version`. Quando nao ha o que registrar, nao sai
/// > requisicao nenhuma.**
///
/// Os dois lados importam. O segundo e o que impede o conserto preguicoso de
/// mandar a chave com um valor inventado: a secao 6.6 exige o identificador do
/// arquivo versionado no repositorio, e esse arquivo ainda nao existe.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  http.Response sessaoCriada() {
    return http.Response(
      jsonEncode(<String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': false,
        },
      }),
      201,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }

  /// Os corpos de TODO `POST /auth/register` que a tela disparar.
  ///
  /// Uma lista, e nao a ultima requisicao: a pergunta dos casos e "quantas
  /// sairam", e uma variavel que so guarda a ultima nao distingue nenhuma de
  /// uma.
  late List<Map<String, dynamic>> cadastros;

  Future<void> abrirCriarConta(
    WidgetTester tester, {
    String? versaoDosTermos,
    String? urlDosTermos,
    String? urlDaPrivacidade,
  }) async {
    cadastros = <Map<String, dynamic>>[];
    // Desmonta o que estiver montado ANTES de recarregar a configuracao.
    // Sem isto, um caso que abre a tela mais de uma vez remonta sobre a
    // arvore anterior -- que ja navegou para outra rota -- e o `tap` seguinte
    // reprova por nao achar o botao de entrada, e nao pelo que o caso
    // verifica.
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versaoDosTermos,
          urlDosTermosDeTeste: urlDosTermos,
          urlDaPrivacidadeDeTeste: urlDaPrivacidade,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            cadastros.add(jsonDecode(req.body) as Map<String, dynamic>);
            return sessaoCriada();
          }
          // 404 no resto de proposito: uma chamada nao prevista por um caso
          // precisa falhar alto, e nao passar por acidente.
          return http.Response('{}', 404);
        }),
      ),
    );
    await tester.pumpAndSettle();
    // A porta de `Criar conta` deslogada mora em `Perfil` (BICHUS-232). Ate
    // 22/09 este caso entrava pelo `Cadastrar meu pet` da secao de
    // aterrissagem, que saiu de la por misturar cadastro com a vizinhanca.
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criar conta'));
    await tester.pumpAndSettle();
  }

  final Finder caixaDeAceite = find.byType(Checkbox);
  final Finder botaoCriarConta = find.widgetWithText(FilledButton, 'Criar conta');

  /// Traz o alvo para a janela do teste, como uma pessoa faria.
  ///
  /// Passou a ser necessario em 22/09/2026, quando a lista de requisitos da
  /// senha (`RequisitosDaSenha`) entrou sob o campo: o formulario ficou mais
  /// alto que a janela do teste. Em 23/09 o alvo da rolagem deixou de ser
  /// `ListView` -- o formulario virou `SingleChildScrollView` para que nenhum
  /// controle obrigatorio deixe de existir por estar fora da janela -- e
  /// `ensureVisible` nao depende do tipo do container.
  ///
  /// **So a caixa precisa disto.** O botao mora na barra fixa do rodape desde
  /// 23/09 e nao rola: pedir rolagem para ele esconderia a regressao de ele
  /// voltar para dentro do conteudo.
  Future<void> rolarAte(WidgetTester tester, Finder alvo) async {
    await tester.ensureVisible(alvo);
    await tester.pumpAndSettle();
  }

  Future<void> preencherETocar(
    WidgetTester tester, {
    required bool aceitar,
  }) async {
    await tester.enterText(
      find.byType(TextField).at(1),
      'marina@exemplo.com.br',
    );
    await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
    if (aceitar) {
      await rolarAte(tester, caixaDeAceite);
      await tester.tap(caixaDeAceite);
      await tester.pumpAndSettle();
    }
    await tester.tap(botaoCriarConta);
    await tester.pumpAndSettle();
  }

  group('ISCA — nenhuma conta e criada sem o aceite registrado', () {
    testWidgets(
        'com versao e caixa marcada: a conta e criada e o corpo carrega a versao',
        (tester) async {
      await abrirCriarConta(tester, versaoDosTermos: versao);
      await preencherETocar(tester, aceitar: true);

      expect(cadastros, hasLength(1));
      expect(
        cadastros.single['accepted_terms_version'],
        versao,
        reason: 'REPROVA: a conta foi criada e a versao dos termos nao foi '
            'junto. O backend so grava `accepted_terms_at` quando esta chave '
            'chega: sem ela fica conta criada e NENHUM registro de qual '
            'versao a pessoa aceitou (BICHUS-29, criterio 7).',
      );
    });

    testWidgets('com versao e caixa DESMARCADA: nenhuma requisicao sai',
        (tester) async {
      await abrirCriarConta(tester, versaoDosTermos: versao);
      await preencherETocar(tester, aceitar: false);

      expect(
        cadastros,
        isEmpty,
        reason: 'REPROVA: a conta foi criada sem a pessoa ter aceitado. A '
            'caixa que o cliente pediu precisa GOVERNAR o cadastro, e nao '
            'so aparecer na tela.',
      );
      expect(
        find.textContaining('aceite os termos de uso'),
        findsOneWidget,
        reason: 'A tela recusou em silencio: a pessoa toca em Criar conta e '
            'nada acontece, sem dizer o que falta.',
      );
    });

    testWidgets(
        'SEM versao declarada: nao sai requisicao, nem com a caixa marcada',
        (tester) async {
      // ESTE e o caso que um teste de widget nao pega. A caixa existe, a
      // pessoa marca, os campos estao validos -- e nao ha o que gravar,
      // porque o build nao recebeu `--dart-define=TERMS_VERSION` e o
      // documento versionado dos termos ainda nao existe no repositorio.
      //
      // Criar a conta aqui produziria a afirmacao de um aceite que o banco
      // nao tem. A tela recusa alto em vez disso.
      await abrirCriarConta(tester);
      await preencherETocar(tester, aceitar: true);

      expect(
        cadastros,
        isEmpty,
        reason: 'REPROVA: a conta foi criada com a caixa marcada e sem versao '
            'dos termos para registrar. E a pior das duas combinacoes: a tela '
            'afirma um aceite e o banco guarda as duas colunas nulas.',
      );
      expect(
        find.textContaining('Não conseguimos registrar o aceite'),
        findsOneWidget,
        reason: 'A recusa precisa ser visivel. Recusa muda e indistinguivel '
            'de um botao quebrado.',
      );
    });

    testWidgets(
        'SEM versao declarada: a recusa esta na tela ANTES de qualquer toque',
        (tester) async {
      // ACHADO DO APARELHO, 22/09/2026: o cliente relatou que nao consegue
      // criar conta, com a API de homologacao no ar. O comando de build de
      // homologacao do `README.md` da raiz passa so `API_BASE_URL`, e sem
      // `TERMS_VERSION` a tela recusa -- corretamente.
      //
      // O que estava errado era a HORA: a frase so aparecia depois de
      // preencher tudo e tocar no botao, e a faixa nascia abaixo da dobra.
      // Recusa que chega depois do esforco inteiro e indistinguivel de botao
      // quebrado, que foi exatamente como ela chegou ate nos.
      await abrirCriarConta(tester);

      expect(
        find.textContaining('Não conseguimos registrar o aceite'),
        findsOneWidget,
        reason: 'REPROVA: a tela abre sem dizer que este build nao consegue '
            'criar conta. A pessoa preenche nome, e-mail e senha, aceita os '
            'termos, toca no botao e so entao descobre que nao havia caminho '
            'nenhum.',
      );

      // Depois do toque a frase continua UMA. A guarda de `_criarConta` nao
      // reimprime: ela leva a pessoa ate a faixa que ja estava la.
      await preencherETocar(tester, aceitar: true);
      expect(
        find.textContaining('Não conseguimos registrar o aceite'),
        findsOneWidget,
        reason: 'REPROVA: ou a frase sumiu, ou ela aparece duas vezes.',
      );
      expect(cadastros, isEmpty);

      // E ela esta DENTRO da janela. Quem toca no botao esta no fim da lista;
      // uma recusa que acontece no topo, fora da area visivel, e a definicao
      // de "o botao nao faz nada" -- que foi como o cliente relatou.
      final faixa =
          tester.getRect(find.textContaining('Não conseguimos registrar'));
      final altura =
          tester.view.physicalSize.height / tester.view.devicePixelRatio;
      expect(
        faixa.top,
        greaterThanOrEqualTo(0),
        reason: 'REPROVA: a recusa ficou acima da area visivel depois do '
            'toque. A tela recusou num lugar que a pessoa nao esta olhando.',
      );
      expect(faixa.bottom, lessThanOrEqualTo(altura));
    });

    testWidgets(
        'COM versao declarada, a faixa de recusa nao aparece', (tester) async {
      // O outro lado: um build configurado nao pode abrir a tela com um aviso
      // que nao vale para ele.
      await abrirCriarConta(tester, versaoDosTermos: versao);
      expect(
        find.textContaining('Não conseguimos registrar o aceite'),
        findsNothing,
        reason: 'REPROVA: o build tem a versao dos termos e a tela avisa que '
            'nao consegue registrar o aceite. Aviso que nao vale e ruido que '
            'se aprende a ignorar, inclusive quando passar a valer.',
      );
    });

    testWidgets('varredura: TODO cadastro que sai carrega a versao',
        (tester) async {
      // A regra dita de uma vez so, sobre os tres caminhos juntos. Ela
      // continua valendo se alguem acrescentar um quarto caminho a esta tela,
      // e e por isso que ela existe alem dos casos acima.
      final corpos = <Map<String, dynamic>>[];

      await abrirCriarConta(tester, versaoDosTermos: versao);
      await preencherETocar(tester, aceitar: true);
      corpos.addAll(cadastros);

      await abrirCriarConta(tester, versaoDosTermos: versao);
      await preencherETocar(tester, aceitar: false);
      corpos.addAll(cadastros);

      await abrirCriarConta(tester);
      await preencherETocar(tester, aceitar: true);
      corpos.addAll(cadastros);

      // Ancora: se nenhum caminho disparar requisicao, o laco abaixo e
      // vacuamente verdadeiro e este caso nao prova nada.
      expect(
        corpos,
        isNotEmpty,
        reason: 'Nenhum cadastro saiu em nenhum dos tres caminhos: a '
            'varredura estaria aprovando o vazio.',
      );
      for (final corpo in corpos) {
        expect(
          corpo['accepted_terms_version'],
          isA<String>().having((v) => v.isNotEmpty, 'preenchida', isTrue),
          reason: 'REPROVA: saiu um cadastro sem `accepted_terms_version`. '
              'Esta e a linha que separa um aceite de uma afirmacao de que '
              'houve aceite.',
        );
      }
    });
  });

  group('a caixa de aceite, como controle', () {
    testWidgets('nasce desmarcada', (tester) async {
      await abrirCriarConta(tester, versaoDosTermos: versao);
      expect(tester.widget<Checkbox>(caixaDeAceite).value, isFalse);
    });

    testWidgets('tem nome acessivel e acao de toque no MESMO no de semantica',
        (tester) async {
      // Caixa sem nome e anunciada como "caixa de selecao, nao marcada" e
      // nada mais: quem usa leitor de tela nao sabe o que esta aceitando
      // (WCAG 2.1 SC 4.1.2).
      //
      // **Medido no no da arvore de semantica do app montado**, e nao com
      // `find.bySemanticsLabel`. O finder procura um WIDGET `Semantics` com
      // aquele rotulo; o que o VoiceOver e o TalkBack leem e o NO, que pode
      // ter outro rotulo e outras acoes. Foi essa diferenca que produziu, no
      // formulario de cadastrar pet, quatro controles com `btn=true` e
      // `tap=false` -- widgets que se anunciavam tocaveis sem carregar a acao.
      await abrirCriarConta(tester, versaoDosTermos: versao);
      final handle = tester.ensureSemantics();
      try {
        final no = tester.getSemantics(caixaDeAceite);
        expect(
          no.label.trim(),
          'Aceitar os termos',
          reason: 'REPROVA: ou a caixa do aceite perdeu o nome e e anunciada '
              'so como "caixa de selecao", ou ela voltou a fundir a frase '
              'inteira no proprio no -- e ai a declaracao e lida DUAS vezes '
              'por quem usa leitor de tela, uma pelo rotulo e outra pela '
              'frase ao lado.',
        );
        final dados = no.getSemanticsData();
        expect(
          dados.flagsCollection.isChecked,
          isNot(CheckedState.none),
          reason: 'REPROVA: o no nao se anuncia como caixa de selecao, entao '
              'nao ha estado marcado/desmarcado para o leitor de tela ler.',
        );
        expect(
          dados.hasAction(SemanticsAction.tap),
          isTrue,
          reason: 'REPROVA: o no se anuncia mas nao carrega a acao de toque. '
              'E o `btn=true tap=false` de novo, agora no gesto que registra '
              'um aceite juridico.',
        );
      } finally {
        handle.dispose();
      }
    });

    testWidgets('o alvo de toque tem pelo menos 48 dp', (tester) async {
      await abrirCriarConta(tester, versaoDosTermos: versao);
      await rolarAte(tester, caixaDeAceite);
      final tamanho = tester.getSize(caixaDeAceite);
      expect(tamanho.width, greaterThanOrEqualTo(48));
      expect(tamanho.height, greaterThanOrEqualTo(48));
    });

    testWidgets(
        'sem o aceite o botao nao cria conta, diz o que falta e MOSTRA a caixa',
        (tester) async {
      // A regra continua a mesma: uma declaracao que se aceita ao apertar um
      // botao precisa estar legivel antes de o aceite valer.
      //
      // **O que mudou em 23/09/2026 foi o mecanismo, e o caso mudou junto.**
      // Enquanto o botao ficava no fim do formulario, quem chegasse nele tinha
      // passado pela caixa, e comparar `dy` bastava. Medido em 360 x 640 dp
      // com o teclado aberto, "chegar nele" custava 500 dp de rolagem e o
      // `ListView` nem o construia; o botao foi ancorado na barra fixa do
      // rodape (design system 11.8) e passou a estar ao alcance de qualquer
      // ponto do formulario, inclusive de um ponto acima da caixa.
      //
      // Com isso o `dy` deixou de dizer alguma coisa, e o caso cobra o
      // COMPORTAMENTO, que e mais forte: comparar alturas continuaria verde
      // numa tela que criasse a conta sem o aceite, desde que a caixa
      // estivesse desenhada acima do botao.
      await abrirCriarConta(tester, versaoDosTermos: versao);
      await tester.enterText(
        find.byType(TextField).at(1),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(2), 'uma frase longa');
      await tester.pumpAndSettle();

      // A caixa comeca FORA da janela: sem isto o caso nao estaria medindo a
      // rolagem que ele diz medir.
      expect(
        tester.getTopLeft(caixaDeAceite).dy,
        greaterThan(tester.getBottomLeft(find.byType(SingleChildScrollView)).dy),
        reason: 'O caso nao chegou a por a caixa fora da janela: ele esta '
            'medindo outra coisa.',
      );

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(
        cadastros,
        isEmpty,
        reason: 'REPROVA: a conta foi criada sem o aceite dos termos.',
      );
      expect(
        find.text(
          'Para criar a conta, aceite os termos de uso e a política de '
          'privacidade.',
        ),
        findsOneWidget,
        reason: 'REPROVA: o botao recusou EM SILENCIO. Com ele ancorado no '
            'rodape, a pessoa pode toca-lo sem nunca ter visto a caixa: se a '
            'tela nao diz o que falta, o botao e indistinguivel de quebrado.',
      );
      expect(
        tester.getTopLeft(caixaDeAceite).dy,
        lessThan(tester.getBottomLeft(find.byType(SingleChildScrollView)).dy),
        reason: 'REPROVA: a tela recusou apontando para uma caixa que continua '
            'fora da janela. Marcar o erro num controle que a pessoa nao ve e '
            'escrever a resposta onde ninguem olha.',
      );
    });

    testWidgets('com notch, a caixa e o botao ficam dentro da area segura',
        (tester) async {
      // O cliente achou no aparelho um `x` sobrepondo titulo e um botao fora
      // da area de clique, e a hipotese e area segura nao respeitada. Este
      // caso existe para nao repetir a classe ao acrescentar widget nesta
      // tela: a suite monta num retangulo sem notch por padrao, e e por isso
      // que a medida aqui e feita com `viewPadding` explicito.
      const double notch = 47;
      const double barraDeGesto = 34;
      const double dpr = 3;
      tester.view.devicePixelRatio = dpr;
      tester.view.viewPadding = const FakeViewPadding(
        top: notch * dpr,
        bottom: barraDeGesto * dpr,
      );
      tester.view.padding = const FakeViewPadding(
        top: notch * dpr,
        bottom: barraDeGesto * dpr,
      );
      addTearDown(tester.view.reset);

      await abrirCriarConta(tester, versaoDosTermos: versao);

      final altura = tester.view.physicalSize.height / dpr;
      for (final alvo in <Finder>[caixaDeAceite, botaoCriarConta]) {
        await rolarAte(tester, alvo);
        final caixa = tester.getRect(alvo);
        expect(
          caixa.top,
          greaterThanOrEqualTo(notch),
          reason: 'REPROVA: o controle sobe por baixo do notch. Area segura '
              'nao e margem: ela muda em tempo de execucao.',
        );
        expect(
          caixa.bottom,
          lessThanOrEqualTo(altura - barraDeGesto),
          reason: 'REPROVA: o controle fica sob a barra de gestos, que e '
              'justamente "o botao fora da area de clique" medido no '
              'aparelho em 22/09.',
        );
      }
    });
  });

  group('a frase do aceite', () {
    /// Os spans da frase que sao links de verdade.
    List<TextSpan> linksDaFrase(WidgetTester tester) {
      final rich = tester.widgetList<RichText>(find.byType(RichText)).where(
        (r) {
          final span = r.text;
          return span is TextSpan &&
              (span.toPlainText()).contains('Li e aceito');
        },
      ).single;

      final encontrados = <TextSpan>[];
      (rich.text as TextSpan).visitChildren((span) {
        if (span is TextSpan && span.recognizer is TapGestureRecognizer) {
          encontrados.add(span);
        }
        return true;
      });
      return encontrados;
    }

    testWidgets('as duas expressoes sao links, com nome acessivel proprio',
        (tester) async {
      await abrirCriarConta(
        tester,
        versaoDosTermos: versao,
        urlDosTermos: 'https://bichu.app/termos',
        urlDaPrivacidade: 'https://bichu.app/privacidade',
      );

      final links = linksDaFrase(tester);
      expect(
        links.map((s) => s.text).toList(),
        <String>['termos de uso', 'política de privacidade'],
        reason: 'A pessoa aceita dois documentos que nao consegue abrir.',
      );

      for (final link in links) {
        // Nome acessivel proprio: quem navega por lista de links ouve so o
        // nome, fora da frase. "aqui" e "leia mais" nao servem.
        expect(link.semanticsLabel, link.text);
        // Cor nao pode ser o unico indicador de link (WCAG SC 1.4.1).
        expect(link.style?.decoration, TextDecoration.underline);
      }
    });

    testWidgets('sem URL configurada a expressao nao vira link morto',
        (tester) async {
      // Link que nao abre nada e pior que texto: parece que funcionou.
      await abrirCriarConta(tester, versaoDosTermos: versao);
      expect(linksDaFrase(tester), isEmpty);
    });
  });
}
