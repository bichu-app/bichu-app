import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/widgets/requisitos_da_senha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// F1.1 — a validacao de senha **ao vivo**, no lugar do texto de ajuda fixo.
///
/// Pedido do cliente em 22/09/2026: _"Voce deve substituir o texto 'Pelo menos
/// 10 caracteres. Uma frase curta funciona melhor', e colocar aquelas
/// validacoes do campo dinamico conforme o usuario for preenchendo e ir
/// respeitando a politica de senha."_
///
/// **Os textos esperados estao escritos por extenso**, e nao lidos de
/// `RegraDeSenha`. Tres casos deste projeto ja compararam o texto renderizado
/// com a constante que o produz: eles ficam verdes com a tela mostrando
/// qualquer coisa, inclusive a frase errada.
///
/// O que estes casos guardam:
///
/// 1. o texto estatico saiu e as quatro regras estao na tela;
/// 2. a lista reage a cada tecla, sem toque em botao nenhum;
/// 3. ela reage tambem ao e-mail, que e a regra `similar_to_identity`;
/// 4. a tela recusa o que o servidor recusa, antes da ida a rede;
/// 5. a tela **nao** recusa o que o servidor aceita;
/// 6. o estado e anunciado para leitor de tela, por regiao viva;
/// 7. o anuncio nao se repete a cada caractere;
/// 8. recusa do servidor por motivo novo nao vira "pelo menos 10 caracteres".
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  // As quatro frases da lista, escritas a mao. Se uma mudar no produto, o caso
  // reprova e alguem decide -- que e o oposto de ler `RegraDeSenha.texto`.
  const String regraTamanho = 'Pelo menos 10 caracteres';
  const String regraTeto = 'No máximo 256 caracteres';
  const String regraEspacos = 'Não pode ser só espaços';
  const String regraIdentidade = 'Diferente do seu e-mail e do seu nome';

  late List<Map<String, dynamic>> cadastros;
  late http.Response Function() resposta;

  http.Response sessaoCriada() => http.Response(
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

  Future<void> abrirCriarConta(WidgetTester tester) async {
    cadastros = <Map<String, dynamic>>[];
    resposta = sessaoCriada;
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pumpAndSettle();
    AppConfig.limparParaTeste();
    await tester.pumpWidget(
      BichuApp(
        config: AppConfig.carregar(
          apiBaseUrlDeTeste: urlBase,
          versaoDosTermosDeTeste: versao,
        ),
        deposito: DepositoEmMemoria(),
        clienteHttp: MockClient((req) async {
          if (req.url.path.endsWith('/auth/register')) {
            cadastros.add(jsonDecode(req.body) as Map<String, dynamic>);
            return resposta();
          }
          return http.Response('{}', 404);
        }),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(NavigationDestination, 'Perfil'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Criar conta'));
    await tester.pumpAndSettle();

    // A DATA DE NASCIMENTO JA PREENCHIDA, PARA TODOS OS CASOS DESTE ARQUIVO.
    //
    // Ela entrou na F1.1 em 18/10/2026 (cliente: *"coloque maiores de 16
    // anos"*), e **bloqueia o botao enquanto estiver incompleta**. Tres casos
    // deste arquivo tocam em `Criar conta` e afirmam coisas sobre a SENHA: sem
    // a data eles passariam a medir o bloqueio do botao, e a isca que diz "a
    // tela nao exige o que o servidor nao exige" ficaria verde pelo motivo
    // errado -- a requisicao nao sairia por causa da data, nao da senha.
    //
    // Preenchida aqui, no abridor, e nao em cada caso: os casos que NAO enviam
    // nao se incomodam, e os que enviam deixam de depender de lembrar.
    //
    // Data fixa e longe do corte de 16 anos, para a suite nao comecar a falhar
    // sozinha com o passar do tempo.
    await tester.enterText(find.byType(TextField).at(2), '12/05/1990');
    await tester.pumpAndSettle();
  }

  // A F1.1 GANHOU DOIS CAMPOS EM 18/10/2026, e os indices andaram: a ordem e
  // Nome(0), Apelido(1), Data de nascimento(2), E-mail(3), Senha(4). O apelido
  // e OPCIONAL e fica vazio em todos os casos daqui -- e isso tambem prova,
  // de lado, que apelido nulo nao impede o cadastro.
  final Finder campoNome = find.byType(TextField).at(0);
  final Finder campoEmail = find.byType(TextField).at(3);
  final Finder campoSenha = find.byType(TextField).at(4);

  /// O icone da linha daquela regra, que e o que diz o estado a quem enxerga.
  IconData iconeDa(WidgetTester tester, String texto) {
    final linha =
        find.ancestor(of: find.text(texto), matching: find.byType(Row)).first;
    final icone = tester.widget<Icon>(
      find.descendant(of: linha, matching: find.byType(Icon)),
    );
    return icone.icon!;
  }

  /// O rotulo do no de semantica da lista: o que o TalkBack e o VoiceOver leem.
  String rotuloAnunciado(WidgetTester tester) =>
      tester.getSemantics(find.byType(RequisitosDaSenha)).label;

  /// O botao mora na barra fixa do rodape desde 23/09/2026, fora da rolagem.
  ///
  /// A rolagem que estava aqui existia porque ele ficava no fim do formulario
  /// e o `ListView` nao construia o que nao cabia na janela. Nao ha mais o que
  /// rolar para alcanca-lo, e manter a rolagem esconderia uma regressao: se
  /// ele voltar para dentro do conteudo, este caso precisa reprovar.
  Future<void> tocarEmCriarConta(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(FilledButton, 'Criar conta'));
    await tester.pumpAndSettle();
  }

  /// Marca a caixa do aceite, trazendo-a para a janela antes.
  ///
  /// A caixa continua DENTRO da rolagem, e num formulario que nao cabe na
  /// tela: uma pessoa rola ate ela para marca-la, e o caso faz o mesmo.
  Future<void> marcarOAceite(WidgetTester tester) async {
    await tester.ensureVisible(find.byType(Checkbox));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Checkbox));
    await tester.pumpAndSettle();
  }

  testWidgets('ISCA — o texto estatico saiu e as QUATRO regras entraram',
      (tester) async {
    await abrirCriarConta(tester);

    expect(
      find.textContaining('Uma frase curta funciona melhor'),
      findsNothing,
      reason: 'REPROVA: o texto de ajuda fixo voltou. Ele dizia UM dos quatro '
          'requisitos e so virava erro depois do toque no botao; o cliente '
          'pediu a lista ao vivo no lugar dele em 22/09/2026.',
    );
    for (final regra in <String>[
      regraTamanho,
      regraTeto,
      regraEspacos,
      regraIdentidade,
    ]) {
      expect(
        find.text(regra),
        findsOneWidget,
        reason: 'REPROVA: a tela nao mostra "$regra", e o servidor recusa por '
            'isso. Regra aplicada e regra mostrada.',
      );
    }
    // **O AVISO DO VAZAMENTO SAIU EM 18/10/2026.**
    //
    // Este `expect` cobrava a PRESENCA dele (`findsOneWidget`), com a razao de
    // que sem o aviso "quatro de quatro em verde e lido como garantia". O
    // cliente mandou remover a frase, nominalmente: *"remova os textos ... 'O
    // servidor também recusa senha que já apareceu em vazamento conhecido.
    // Isso não da para conferir aqui: se acontecer, avisamos depois de
    // enviar.'"*. O caso nao foi apagado: ele cobra o outro lado agora.
    //
    // O que o aviso protegia continua protegido, e por prova PROPRIA: a isca
    // "a recusa de senha vazada continua EXPLICADA", no fim deste arquivo,
    // reprova se a recusa do servidor deixar de dizer o que houve e o que
    // fazer. Era isso que o aviso prometia; agora quem garante e o desfecho.
    expect(
      find.textContaining('vazamento conhecido'),
      findsNothing,
      reason: 'REPROVA: o aviso do vazamento voltou ao pe da lista. O cliente '
          'o removeu nominalmente em 18/10/2026.',
    );
    expect(
      find.textContaining('avisamos depois de enviar'),
      findsNothing,
      reason: 'REPROVA: a segunda metade do aviso removido voltou a tela.',
    );
  });

  testWidgets('ISCA — a lista reage A CADA TECLA, sem tocar em botao nenhum',
      (tester) async {
    await abrirCriarConta(tester);

    // Nada digitado: nenhuma acusacao.
    expect(iconeDa(tester, regraTamanho), Icons.circle_outlined);

    await tester.enterText(campoSenha, 'curta');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraTamanho),
      Icons.cancel_outlined,
      reason: 'REPROVA: cinco caracteres e a lista nao reagiu. A validacao ao '
          'vivo parou de acompanhar o que esta sendo digitado, que e o pedido '
          'inteiro desta entrega.',
    );
    expect(iconeDa(tester, regraEspacos), Icons.check_circle_outline);

    await tester.enterText(campoSenha, 'uma frase bem longa');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraTamanho),
      Icons.check_circle_outline,
      reason: 'REPROVA: o requisito foi satisfeito e a lista continua '
          'acusando falta. Mostrar o que JA esta satisfeito e metade do '
          'pedido.',
    );
  });

  testWidgets(
      'ISCA — a lista reage ao E-MAIL digitado depois da senha',
      (tester) async {
    // `similar_to_identity` depende de outro campo. Uma implementacao presa ao
    // `onChanged` do campo de senha passa nos casos acima e reprova aqui: a
    // pessoa escolhe a senha, depois digita o e-mail, e a lista fica parada
    // mostrando verde numa senha que o servidor vai recusar.
    await abrirCriarConta(tester);

    await tester.enterText(campoSenha, 'marina1998xyz');
    await tester.pumpAndSettle();
    expect(iconeDa(tester, regraIdentidade), Icons.check_circle_outline);

    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.pumpAndSettle();
    expect(
      iconeDa(tester, regraIdentidade),
      Icons.cancel_outlined,
      reason: 'REPROVA: o e-mail mudou e a lista nao reavaliou a semelhanca. '
          'A tela mostra verde numa senha que o servidor recusa com '
          '`similar_to_identity`.',
    );

    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();
    expect(iconeDa(tester, regraIdentidade), Icons.check_circle_outline);
  });

  testWidgets(
      'ISCA — a tela recusa o que o servidor recusa, ANTES da ida a rede',
      (tester) async {
    await abrirCriarConta(tester);
    // O nome e OBRIGATORIO desde 18/10/2026, e o botao do rodape fica
    // bloqueado sem ele. Sem esta linha o caso nao chega a medir a senha.
    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'marina1998xyz');
    await tester.pumpAndSettle();
    await marcarOAceite(tester);
    await tocarEmCriarConta(tester);

    expect(
      cadastros,
      isEmpty,
      reason: 'REPROVA: a tela gastou uma ida a rede com uma senha que ela '
          'ja sabia que o servidor recusa.',
    );
    expect(
      find.text(
        'Esta senha se parece com o seu e-mail ou o seu nome. Escolha outra.',
      ),
      findsOneWidget,
      reason: 'REPROVA: a tela recusou e disse outra coisa. Ate 22/09 ela '
          'respondia "A senha precisa de pelo menos 10 caracteres." a '
          'QUALQUER recusa de senha, e quem tinha 13 caracteres acrescentava '
          'mais um sem entender.',
    );
  });

  testWidgets('ISCA — a tela NAO exige o que o servidor nao exige',
      (tester) async {
    // Sem maiuscula, sem numero, sem simbolo. A politica do servidor aceita, e
    // a ADR-0003 prefere isto a `Senha@123`. Uma lista que cobrasse composicao
    // pararia aqui e a conta nao sairia.
    await abrirCriarConta(tester);
    // O nome e OBRIGATORIO desde 18/10/2026, e o botao do rodape fica
    // bloqueado sem ele. Sem esta linha o caso nao chega a medir a senha.
    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();

    for (final regra in <String>[
      regraTamanho,
      regraTeto,
      regraEspacos,
      regraIdentidade,
    ]) {
      expect(
        iconeDa(tester, regra),
        Icons.check_circle_outline,
        reason: 'REPROVA: a lista acusa "$regra" numa senha que o servidor '
            'aceita. Tela mais exigente que o servidor frustra sem motivo.',
      );
    }

    await marcarOAceite(tester);
    await tocarEmCriarConta(tester);

    expect(
      cadastros,
      hasLength(1),
      reason: 'REPROVA: a tela barrou uma senha que o servidor aceita.',
    );
  });

  testWidgets('ISCA — o estado e ANUNCIADO para leitor de tela',
      (tester) async {
    await abrirCriarConta(tester);
    final handle = tester.ensureSemantics();
    try {
      final dados = tester
          .getSemantics(find.byType(RequisitosDaSenha))
          .getSemanticsData();
      expect(
        dados.flagsCollection.isLiveRegion,
        isTrue,
        reason: 'REPROVA: a lista nao e regiao viva. Quem nao enxerga digita, '
            'a lista muda na tela e o leitor de tela nao diz nada: a '
            'validacao ao vivo existe so para quem ve.',
      );

      await tester.enterText(campoEmail, 'marina@exemplo.com.br');
      await tester.enterText(campoSenha, 'marina1998xyz');
      await tester.pumpAndSettle();

      final rotulo = rotuloAnunciado(tester);
      expect(
        rotulo,
        contains('3 de 4'),
        reason: 'REPROVA: o anuncio nao diz quanto ja esta atendido. '
            'Escrito por extenso de proposito: tres das quatro regras estao '
            'satisfeitas com `marina1998xyz` neste e-mail.',
      );
      expect(
        rotulo.toLowerCase(),
        contains('diferente do seu e-mail e do seu nome'),
        reason: 'REPROVA: o anuncio nao nomeia o que falta. "Um requisito '
            'pendente" nao diz a ninguem o que corrigir.',
      );
      // **A MESMA REMOCAO, NA SEMANTICA.** O caso cobrava que o anuncio
      // repetisse o aviso, para quem nao ve nao ficar sem ele. Com a frase
      // fora da tela a cobranca inverte, e pelo mesmo princípio: este widget
      // roda com `excludeSemantics: true`, entao este rotulo e a UNICA leitura
      // da lista -- deixar a frase aqui faria o leitor anunciar um texto que
      // nao esta mais em tela nenhuma, que e a divergencia que o rotulo
      // composto existe para nao ter.
      expect(
        rotulo,
        isNot(contains('vazamento conhecido')),
        reason: 'REPROVA: o anuncio ainda carrega o aviso removido. Quem usa '
            'leitor de tela ouviria um texto que quem enxerga nao ve mais.',
      );
      // E o anuncio continua dizendo o que importa -- a contraprova que impede
      // este caso de ficar verde com um rotulo vazio.
      expect(
        rotulo,
        contains('Requisitos da senha'),
        reason: 'REPROVA: o anuncio da lista sumiu junto com o aviso. A '
            'remocao era de UMA frase, nao da leitura da lista.',
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets('ISCA — o anuncio nao se repete a cada caractere',
      (tester) async {
    // Regiao viva que muda de texto a cada tecla faz o TalkBack limpar a fila
    // de fala a cada tecla, e o campo de senha vira inutilizavel para quem nao
    // enxerga. O rotulo e montado dos ESTADOS, entao ele so muda quando um
    // requisito vira.
    await abrirCriarConta(tester);
    final handle = tester.ensureSemantics();
    try {
      await tester.enterText(campoSenha, 'uma frase longa');
      await tester.pumpAndSettle();
      final antes = rotuloAnunciado(tester);

      await tester.enterText(campoSenha, 'uma frase longa!');
      await tester.pumpAndSettle();

      expect(
        rotuloAnunciado(tester),
        antes,
        reason: 'REPROVA: uma tecla que nao virou requisito nenhum mudou o '
            'texto anunciado. O leitor de tela vai interromper a propria fala '
            'a cada caractere da senha.',
      );
    } finally {
      handle.dispose();
    }
  });

  testWidgets(
      'ISCA — recusa do servidor por motivo NOVO nao vira "pelo menos 10"',
      (tester) async {
    // A lista de vazamento ainda e uma porta no servidor
    // (`PasswordBreachList`). Quando ela sair, esta versao do app ja estara
    // instalada em aparelho por semanas e vai receber um `code` que nao
    // conhece.
    await abrirCriarConta(tester);
    resposta = () => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://api.exemplo/problems/validation-failed',
            'title': 'Senha fraca',
            'status': 422,
            'errors': <Map<String, dynamic>>[
              <String, dynamic>{
                'field': 'password',
                'code': 'pwned',
                'message': 'Esta senha apareceu em vazamento.',
              },
            ],
          }),
          422,
          headers: <String, String>{'content-type': 'application/problem+json'},
        );

    // O nome e OBRIGATORIO desde 18/10/2026, e o botao fica bloqueado sem ele:
    // sem esta linha nenhum cadastro sai e o caso nao chega a medir o `code`
    // desconhecido que ele existe para medir.
    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();
    await marcarOAceite(tester);
    await tocarEmCriarConta(tester);

    expect(cadastros, hasLength(1));
    expect(
      find.text('A senha precisa de pelo menos 10 caracteres.'),
      findsNothing,
      reason: 'REPROVA: o servidor recusou por vazamento e a tela mandou a '
          'pessoa aumentar uma senha de 23 caracteres. Ela vai acrescentar '
          'caracteres e ser recusada de novo, sem fim.',
    );
    expect(
      find.textContaining('Não conseguimos aceitar esta senha'),
      findsOneWidget,
      reason: 'REPROVA: a recusa ficou muda. Recusa sem texto e '
          'indistinguivel de um botao quebrado.',
    );
  });

  // -------------------------------------------------------------------------
  // A ISCA DA REMOCAO DE 18/10/2026
  // -------------------------------------------------------------------------

  testWidgets(
      'ISCA — a recusa de senha vazada continua EXPLICADA depois do envio',
      (tester) async {
    // **POR QUE ESTA ISCA EXISTE.** Em 18/10/2026 o cliente mandou remover o
    // aviso preventivo da lista de requisitos (*"O servidor também recusa
    // senha que já apareceu em vazamento conhecido. Isso não dá para
    // conferir aqui: se acontecer, avisamos depois de enviar."*). Aquele aviso
    // era a promessa; esta isca cobra o cumprimento dela.
    //
    // A pergunta que ela responde e uma so: **se a pessoa enviar uma senha
    // vazada, ela fica sabendo o que houve e o que fazer?** Enquanto a
    // resposta for sim, a remocao do aviso nao abriu beco. No dia em que
    // alguem tirar `senhaRecusadaPeloServidor` do caminho, ou trocar por um
    // texto que nao diz a saida, este caso reprova -- e a remocao do aviso
    // passa a ser um beco, que e exatamente a conta que o cliente nao fez.
    //
    // ISCA, as duas formas de quebrar:
    //   1. em `telas/conta/tela_criar_conta.dart`, apague o
    //      `?? senhaRecusadaPeloServidor` do ramo de `code` desconhecido: a
    //      recusa fica muda;
    //   2. em `validacao/politica_de_senha.dart`, troque
    //      `senhaRecusadaPeloServidor` por uma frase sem saida ("Senha
    //      recusada."): a pessoa sabe que houve recusa e nao sabe o que fazer.
    await abrirCriarConta(tester);
    resposta = () => http.Response(
          jsonEncode(<String, dynamic>{
            'type': 'https://api.exemplo/problems/validation-failed',
            'title': 'Senha fraca',
            'status': 422,
            'errors': <Map<String, dynamic>>[
              <String, dynamic>{
                'field': 'password',
                'code': 'pwned',
                'message': 'Esta senha apareceu em vazamento.',
              },
            ],
          }),
          422,
          headers: <String, String>{'content-type': 'application/problem+json'},
        );

    // COLISAO DA MESCLA DE 18/10/2026, e a linha do nome e a correcao dela.
    //
    // Este caso nasceu em `chore/remover-quatro-textos-18-10` e o nome de
    // exibicao virou OBRIGATORIO em `feat/nome-obrigatorio-cadastro`, no mesmo
    // dia e em paralelo. O ramo do nome acrescentou esta mesma linha a TODOS os
    // casos deste arquivo que ele viu (quatro); este caso ainda nao existia
    // quando ele passou, e o ramo dos textos nao sabia do nome obrigatorio.
    //
    // **Cada ramo passava sozinho; a UNIAO reprovava.** Sem o nome o botao do
    // rodape fica bloqueado, o cadastro nunca sai, a resposta 422 de `pwned`
    // nunca chega e o caso media uma tela que nao foi a lugar nenhum -- a
    // mensagem vinha vazia. Isto NAO e afrouxar a isca: ela continua cobrando
    // a frase inteira depois do envio; o que mudou foi o formulario ter um
    // campo obrigatorio a mais para que o envio aconteca.
    await tester.enterText(campoNome, 'Marina Prado');
    await tester.enterText(campoEmail, 'marina@exemplo.com.br');
    await tester.enterText(campoSenha, 'o gato subiu no telhado');
    await tester.pumpAndSettle();
    await marcarOAceite(tester);
    await tocarEmCriarConta(tester);

    // O aviso preventivo NAO esta na tela -- e a metade que o cliente removeu.
    expect(
      find.textContaining('vazamento conhecido'),
      findsNothing,
      reason: 'REPROVA: o aviso removido voltou.',
    );

    // **E a recusa diz as DUAS coisas**, escritas por extenso: o que houve e o
    // que fazer. Ler a constante aqui deixaria o caso verde com a tela
    // mostrando qualquer frase.
    final texto = tester
        .widgetList<Text>(find.textContaining('Não conseguimos aceitar'))
        .map((t) => t.data ?? '')
        .join(' ');
    expect(
      texto,
      contains('Não conseguimos aceitar esta senha'),
      reason: 'REPROVA: a recusa nao diz O QUE HOUVE. Sem o aviso preventivo, '
          'este e o unico momento em que a pessoa descobre que a senha foi '
          'recusada -- se ele ficar mudo, a remocao de 18/10 virou beco.',
    );
    expect(
      texto,
      contains('Escolha outra'),
      reason: 'REPROVA: a recusa nao diz O QUE FAZER. "Recusada" sem saida '
          'manda a pessoa adivinhar, e adivinhar em campo de senha e '
          'acrescentar caracteres a uma senha que nao tem nada de curta.',
    );
  });
}
