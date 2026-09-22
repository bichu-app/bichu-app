// Toda tela de conta tem saida, e a saida devolve a pessoa de onde ela veio.
//
// A ISCA: sem a correcao, cada caso deste arquivo reprova por ausencia do
// controle de saida. O defeito que ele guarda foi achado por cliente usando o
// app: entrou em "Entrar" e ficou preso -- sem seta, sem fechar, e com a barra
// de abas sumida. So saiu fechando o app.
//
// A regra de produto que isso quebra esta na secao 5 e na matriz 8.6 de
// docs/01-visao-produto.md: **o app e navegavel deslogado e sao as acoes que
// exigem conta.** Entrar e um desvio, nao um destino, e desvio sem volta e
// muro. A secao 8.3 da pesquisa de UX fecha o argumento pelo outro lado: a
// regra 4 diz "nunca a home" -- voltar leva ao ponto de partida, e nao a
// abertura.
//
// Por que os casos olham por tooltip e por tamanho, e nao pelo widget: um
// teste preso ao tipo do widget passa a aprovar a refatoracao em vez do
// comportamento. Aqui a pergunta e a da pessoa: existe um controle anunciavel
// por leitor de tela, ele e grande o bastante para o polegar, e ele leva ao
// lugar certo.

import 'package:bichu/api/modelos.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:bichu/widgets/marca.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

/// Piso de alvo de toque das acoes criticas: 64 dp de altura **e** largura
/// (design system 6.5, pesquisa de UX 15.1). Botao de voltar e de fechar nao
/// sao excecao: quem precisa sair de uma tela em que caiu por engano esta com
/// pressa, e um alvo de 48 dp erra no polegar da mao que segura o animal.
const double _pisoCritico = 64;

void main() {
  setUp(AppConfig.limparParaTeste);

  Future<void> abrirOApp(
    WidgetTester tester, {
    DepositoDeSessao? deposito,
  }) async {
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
        deposito: deposito ?? DepositoEmMemoria(),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Uma sessao ja aberta, com o e-mail por confirmar: e o estado que faz o
  /// aviso persistente aparecer no Inicio, que e a segunda porta de entrada da
  /// tela de verificacao.
  Future<DepositoDeSessao> depositoLogado() async {
    final deposito = DepositoEmMemoria();
    await deposito.gravar(
      Sessao(
        accessToken: 'access-de-teste',
        refreshToken: 'refresh-de-teste',
        expiraEm: DateTime.now().add(const Duration(hours: 1)),
        usuario: const Usuario(
          id: 'usuario-de-teste',
          email: 'marina@exemplo.com.br',
          emailVerificado: false,
          pendencias: <PendenciaDeCadastro>[
            PendenciaDeCadastro.verificacaoDeEmail,
          ],
          podeAbrirCaso: false,
        ),
      ),
    );
    return deposito;
  }

  /// O contrato de saida, olhado como o leitor de tela e o polegar olham.
  Finder exigirSaida(WidgetTester tester, String rotulo, {required String na}) {
    final saida = find.byTooltip(rotulo);
    expect(
      saida,
      findsOne,
      reason:
          'A tela "$na" nao tem saida anunciavel. Um leitor de tela precisa '
          'ouvir o que o botao faz, e um icone sem tooltip nem rotulo '
          'semantico anuncia so "botao". Sem este controle a pessoa fica '
          'presa: a barra de abas nao aparece nesta tela e a seta automatica '
          'do Flutter so existe quando ha algo para desempilhar.',
    );

    final tamanho = tester.getSize(saida);
    expect(
      tamanho.width,
      greaterThanOrEqualTo(_pisoCritico),
      reason: 'A saida de "$na" tem ${tamanho.width} dp de largura, abaixo do '
          'piso critico de $_pisoCritico dp.',
    );
    expect(
      tamanho.height,
      greaterThanOrEqualTo(_pisoCritico),
      reason: 'A saida de "$na" tem ${tamanho.height} dp de altura, abaixo do '
          'piso critico de $_pisoCritico dp.',
    );
    return saida;
  }

  void exigirQueVoltouParaAba(
    WidgetTester tester,
    String aba, {
    bool porMarca = false,
  }) {
    expect(
      // Deslogada, a Inicio nao tem titulo escrito: ela carrega o logotipo em
      // vetor (paragrafo 8.4 do design system). Procurar o texto "Bichu" aqui
      // voltaria a exigir o que a regra da marca proibe.
      porMarca
          ? find.descendant(
              of: find.byType(AppBar),
              matching: find.byType(MarcaLockup),
            )
          : find.widgetWithText(AppBar, aba),
      findsOne,
      reason: 'A saida precisa devolver a aba "$aba", que e de onde a pessoa '
          'veio.',
    );
    expect(
      find.byType(NavigationBar),
      findsOne,
      reason: 'A barra de abas precisa voltar junto: e ela que prova que a '
          'pessoa saiu do desvio e voltou a navegar.',
    );
  }

  Future<void> irAoPerfil(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
  }

  testWidgets('Entrar tem saida, e ela devolve a aba de onde a pessoa veio',
      (tester) async {
    await abrirOApp(tester);
    await irAoPerfil(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Entrar'), findsOne);
    // O sintoma que o cliente descreveu, fixado aqui para nao voltar calado.
    expect(
      find.byType(NavigationBar),
      findsNothing,
      reason: 'A tela de conta cobre a casca de abas. E por isso que a saida '
          'explicita e obrigatoria e nao opcional.',
    );

    await tester.tap(exigirSaida(tester, 'Voltar', na: 'Entrar'));
    await tester.pumpAndSettle();

    exigirQueVoltouParaAba(tester, 'Perfil');
  });

  testWidgets('Criar conta tem saida, e ela devolve a aba de onde veio',
      (tester) async {
    await abrirOApp(tester);
    await irAoPerfil(tester);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Criar conta'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Criar conta'), findsOne);

    await tester.tap(exigirSaida(tester, 'Voltar', na: 'Criar conta'));
    await tester.pumpAndSettle();

    exigirQueVoltouParaAba(tester, 'Perfil');
  });

  testWidgets(
      'Esqueci minha senha tem saida, e ela devolve Entrar com o e-mail '
      'digitado', (tester) async {
    await abrirOApp(tester);
    await irAoPerfil(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'marina@exemplo.com');
    await tester.tap(find.text('Esqueci minha senha'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Esqueci minha senha'), findsOne);

    await tester.tap(exigirSaida(tester, 'Voltar', na: 'Esqueci minha senha'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Entrar'), findsOne);
    expect(
      find.text('marina@exemplo.com'),
      findsOne,
      reason: 'Voltar devolve o passo anterior intacto. Com `go` a tela de '
          'Entrar era destruida e a pessoa digitava o e-mail de novo.',
    );
  });

  testWidgets('Verifique seu e-mail tem saida de fechar, e ela devolve o '
      'Inicio', (tester) async {
    await abrirOApp(tester, deposito: await depositoLogado());

    await tester.tap(find.text('Confirmar meu e-mail'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Verifique seu e-mail'), findsOne);

    // Aqui a palavra e "Fechar" e nao "Voltar", e a diferenca e de verdade: a
    // conta ja existe, entao nao ha passo anterior para onde voltar. Ver o
    // comentario de decisao em tela_verifique_seu_email.dart.
    await tester.tap(
      exigirSaida(tester, 'Fechar', na: 'Verifique seu e-mail'),
    );
    await tester.pumpAndSettle();

    exigirQueVoltouParaAba(tester, 'Início');
  });

  testWidgets('trocar entre Entrar e Criar conta nao empilha: a volta leva a '
      'aba, e nao a tela anterior', (tester) async {
    await abrirOApp(tester);
    await irAoPerfil(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(TextButton, 'Criar conta'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Criar conta'), findsOne);

    await tester.tap(exigirSaida(tester, 'Voltar', na: 'Criar conta'));
    await tester.pumpAndSettle();

    // Entrar e Criar conta sao o mesmo passo do mesmo desvio, e nao dois
    // passos: quem alterna entre as duas e volta espera sair do desvio, nao
    // percorrer de tras para a frente cada troca que fez.
    expect(
      find.widgetWithText(AppBar, 'Entrar'),
      findsNothing,
      reason: 'A troca lateral empilhou. Voltar virou desfazer.',
    );
    exigirQueVoltouParaAba(tester, 'Perfil');
  });

  testWidgets('a saida sobrevive a escala de fonte do sistema em 200%',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(textScaler: TextScaler.linear(2)),
        child: BichuApp(
          config:
              AppConfig.carregar(apiBaseUrlDeTeste: 'http://localhost:3000'),
          deposito: DepositoEmMemoria(),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await irAoPerfil(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();

    // A barra de conta cresceu de 56 para 64 dp para caber o alvo. O que este
    // caso guarda e o efeito colateral: titulo maior nao pode nem estourar o
    // leiaute nem espremer a saida.
    exigirSaida(tester, 'Voltar', na: 'Entrar a 200%');
    expect(tester.takeException(), isNull);
  });

  testWidgets('Entrar aberta por link direto, sem pilha, ainda tem saida',
      (tester) async {
    await abrirOApp(tester);

    // O caso que a seta automatica do Flutter nao cobre, e que o F5 (App
    // Links e Universal Links) vai produzir de verdade: a rota chega de fora,
    // a pilha nasce com uma pagina so, e nao ha o que desempilhar. Uma saida
    // que depende do estado da pilha desaparece exatamente aqui.
    GoRouter.of(tester.element(find.byType(CascaComAbas))).go(Rotas.entrar);
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'Entrar'), findsOne);

    await tester.tap(exigirSaida(tester, 'Voltar', na: 'Entrar (link direto)'));
    await tester.pumpAndSettle();

    // Sem pilha, a saida cai no destino declarado pela tela. Deslogado, o
    // Inicio se chama "Bichu" -- e a barra o mostra em vetor, nao escrito.
    exigirQueVoltouParaAba(tester, 'Bichu', porMarca: true);
  });
}
