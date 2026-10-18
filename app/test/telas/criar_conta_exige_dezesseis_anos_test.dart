import 'dart:convert';

import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/formato/data.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// F1.1 — a DATA DE NASCIMENTO e obrigatoria, e quem tem menos de 16 anos nao
/// cria conta.
///
/// ## A decisao, nas palavras do cliente (18/10/2026)
///
/// *"coloque maiores de 16 anos"*.
///
/// ## O campo NAO EXISTIA, e e isso que separa esta tarefa da do nome
///
/// No nome, o campo ja estava na tela e so nao era exigido. Aqui nao havia
/// nada: varrido contra `e636f69c`, a tela de criar conta tinha tres campos
/// (Nome, E-mail, Senha) e nenhum de data; `RegisterRequest` listava
/// `required: [email, password]`; `users` nao tinha coluna de nascimento. E a
/// politica de privacidade dizia por escrito, no item 10: *"Hoje o cadastro
/// nao confere a idade."*
///
/// ## O que estes casos afirmam, e por que e sobre o CORPO
///
/// Um caso que confirmasse "ha mensagem de erro na tela" ficaria verde com a
/// requisicao saindo sem data. A regra guardada aqui e:
///
/// > **Toda requisicao de cadastro que sai desta tela carrega `birth_date` em
/// > `YYYY-MM-DD`, de quem tem 16 anos ou mais. Fora disso, nao sai
/// > requisicao nenhuma.**
///
/// A trava que VALE e a do servidor
/// (`src/modules/identity/application/cadastro-exige-dezesseis-anos.test.ts`),
/// porque a rota e publica. Esta tela e conveniencia -- e os casos daqui
/// existem para ela nao deixar de ser.
///
/// ## AS DUAS BORDAS SAO MEDIDAS COM RELOGIO FIXO, E NAO PELA TELA
///
/// O grupo `a regra da idade, com relogio fixo` exercita `IdadeMinima` direto,
/// com um `agora` escolhido. E deliberado: um teste de widget depende de
/// `DateTime.now()`, e a borda de "15 anos e 364 dias" medida contra o relogio
/// real e um teste que muda de significado a cada dia. As duas bordas sao o
/// lugar onde o erro de calculo mora, e elas precisam ser deterministicas.
void main() {
  setUp(AppConfig.limparParaTeste);

  group('a mascara de data formata e NAO valida', () {
    test('ela e progressiva e aceita digitacao continua sem barra', () {
      expect(mascaraDeData('3'), '3');
      expect(mascaraDeData('31'), '31');
      expect(mascaraDeData('312'), '31/2');
      expect(mascaraDeData('3112'), '31/12');
      expect(mascaraDeData('31121990'), '31/12/1990');
    });

    test('ela descarta o que nao e digito, e colar com barra da no mesmo', () {
      expect(mascaraDeData('31/12/1990'), '31/12/1990');
      expect(mascaraDeData('31.12.1990'), '31/12/1990');
      expect(mascaraDeData('ab31cd12ef1990'), '31/12/1990');
    });

    test('digito alem do teto e descartado, e nao aceito para recusar depois', () {
      expect(mascaraDeData('311219901234'), '31/12/1990');
    });

    /// A mascara nao recusa NADA: data impossivel passa por ela, e quem a
    /// recusa e `dataParaOContrato`. Sem esta separacao o campo marcaria
    /// vermelho no primeiro digito, gritando com quem ainda nem terminou.
    test('ela formata ate o que nao existe no calendario', () {
      expect(mascaraDeData('31021990'), '31/02/1990');
    });
  });

  group('dataParaOContrato produz a forma do contrato, ou null', () {
    test('ela devolve YYYY-MM-DD, e nao o que esta na tela', () {
      expect(dataParaOContrato('31/12/1990'), '1990-12-31');
      expect(dataParaOContrato('01/02/2003'), '2003-02-01');
    });

    test('data incompleta devolve null em vez de adivinhar', () {
      expect(dataParaOContrato(''), isNull);
      expect(dataParaOContrato('31/12/199'), isNull);
    });

    /// `DateTime` normaliza `31/02` para 03/03 em silencio. Sem a volta de
    /// `dataParaOContrato` o banco guardaria uma data que ninguem declarou.
    test('data que nao existe devolve null, e NAO a data seguinte', () {
      expect(dataParaOContrato('31/02/1990'), isNull);
      expect(dataParaOContrato('30/02/2010'), isNull);
      expect(dataParaOContrato('00/01/2010'), isNull);
      expect(dataParaOContrato('01/13/2010'), isNull);
    });

    /// 29/02 em ano bissexto EXISTE, e recusa-lo seria recusar gente real.
    test('29 de fevereiro de ano bissexto passa', () {
      expect(dataParaOContrato('29/02/2000'), '2000-02-29');
      expect(dataParaOContrato('29/02/2001'), isNull);
    });
  });

  group('a regra da idade, com relogio fixo', () {
    /// 11/09/2026, 09:00 em Sao Paulo — o mesmo instante que
    /// `INSTANTE_FIXO` do backend, para as duas bordas serem as mesmas datas
    /// nos dois lados.
    final DateTime agora = DateTime.utc(2026, 9, 11, 12);

    /// ISCA (a1), a borda de BAIXO.
    ///
    /// Desligada: trocando `<` por `<=` em `IdadeMinima.recusa`, ou tirando o
    /// `-1` de `anosCompletos`, este caso reprova. Conferido antes de
    /// entregar.
    test('15 anos e 364 dias e recusado, com a frase que diz a regra', () {
      final String? recusa = IdadeMinima.recusa('12/09/2010', agora: agora);

      expect(recusa, IdadeMinima.aindaNaoTemIdade);
      expect(
        recusa,
        contains('16'),
        reason:
            'a frase precisa dizer a REGRA: "dado invalido" manda a pessoa '
            'conferir o que ela digitou certo',
      );
    });

    /// ISCA (a2), a borda de CIMA, e CONTRAPESO da (a1).
    ///
    /// Sem este caso, a (a1) ficaria verde com uma recusa de tudo. Este e o
    /// dia do aniversario — o caso que um calculo "para tras" recusaria, e a
    /// pessoa recusada no dia do proprio aniversario nao tem como entender nem
    /// contornar.
    test('16 anos exatos, no dia do aniversario, PASSA', () {
      expect(IdadeMinima.recusa('11/09/2010', agora: agora), isNull);
    });

    test('16 anos e um dia tambem passa', () {
      expect(IdadeMinima.recusa('10/09/2010', agora: agora), isNull);
    });

    /// ISCA (b). Desligada: apagando a guarda `nascimento.isAfter(hoje)`, este
    /// caso reprova — e a data futura passaria a cair na frase de idade, que
    /// manda a pessoa procurar o problema no lugar errado.
    test('data no futuro e recusada, e nao confundida com idade', () {
      final String? recusa = IdadeMinima.recusa('01/01/2030', agora: agora);

      expect(recusa, IdadeMinima.dataNoFuturo);
      expect(recusa, isNot(IdadeMinima.aindaNaoTemIdade));
    });

    test('campo vazio e incompleto cobram a data, sem falar de idade', () {
      expect(IdadeMinima.recusa('', agora: agora), IdadeMinima.precisaDaData);
      expect(IdadeMinima.recusa('31/12', agora: agora), IdadeMinima.precisaDaData);
      expect(IdadeMinima.recusa(null, agora: agora), IdadeMinima.precisaDaData);
    });

    test('data completa que nao existe tem frase propria', () {
      expect(
        IdadeMinima.recusa('31/02/1990', agora: agora),
        IdadeMinima.dataNaoExiste,
      );
    });

    /// O fuso decide o DIA, e um dia aqui e a diferenca entre aceitar e
    /// recusar no aniversario. 11/09/2026 02:00 UTC e 10/09/2026 23:00 em Sao
    /// Paulo: quem nasceu em 11/09/2010 completa 16 anos **amanha**.
    ///
    /// Desligada: trocando `_deslocamentoDeSaoPaulo` para `Duration.zero`,
    /// este caso reprova.
    test('o fuso do produto decide o dia: 23h de Sao Paulo nao antecipa', () {
      expect(
        IdadeMinima.recusa(
          '11/09/2010',
          agora: DateTime.utc(2026, 9, 11, 2),
        ),
        IdadeMinima.aindaNaoTemIdade,
      );
    });

    /// E o contrapeso: tres horas depois ja e dia 11 em Sao Paulo, e a MESMA
    /// data passa. Sem ele o caso acima ficaria verde com um calculo que
    /// recusasse sempre.
    test('o fuso do produto decide o dia: 00h01 de Sao Paulo ja e aniversario', () {
      expect(
        IdadeMinima.recusa(
          '11/09/2010',
          agora: DateTime.utc(2026, 9, 11, 3, 1),
        ),
        isNull,
      );
    });

    /// `completo` libera o botao com a data COMPLETA, ainda que ela seja de
    /// quem tem 15 anos — porque botao apagado nao diz por que.
    test('completo olha a forma, e nao a idade', () {
      expect(IdadeMinima.completo('12/09/2010'), isTrue);
      expect(IdadeMinima.completo('31/12'), isFalse);
      expect(IdadeMinima.completo('31/02/1990'), isFalse);
    });
  });

  group('a tela de criar conta cobra a data antes de mandar requisicao', () {
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
    /// Uma lista, e nao a ultima: a pergunta e "quantas sairam", e uma
    /// variavel que guarda a ultima nao distingue nenhuma de uma.
    late List<Map<String, dynamic>> cadastros;

    Future<void> abrirCriarConta(WidgetTester tester) async {
      cadastros = <Map<String, dynamic>>[];
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
              return sessaoCriada();
            }
            // 404 no resto de proposito: chamada nao prevista precisa falhar
            // alto, e nao passar por acidente.
            return http.Response('{}', 404);
          }),
        ),
      );
      await tester.pumpAndSettle();
      // A PORTA DA CONTA E A FOTO DA BARRA DE TOPO (uniao de 18/10/2026): o slot
      // `Perfil` saiu da barra de baixo. Este ajudante nasceu num ramo anterior
      // a essa decisao. `irParaAConta` e a mesma porta dos outros arquivos, e o
      // caso prova exatamente o mesmo.
      await irParaAConta(tester);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Criar conta'));
      await tester.pumpAndSettle();
    }

    // A ORDEM DOS CAMPOS MUDOU DUAS VEZES em 18/10/2026: a data entrou depois
    // do Nome, e o apelido entrou entre os dois. A ordem e Nome(0),
    // Apelido(1), Data de nascimento(2), E-mail(3), Senha(4).
    //
    // Indice e fragil por natureza, e o caso `a tela tem o campo de data`
    // abaixo e o que avisa se a ordem mudar de novo: ele conta os campos.
    final Finder campoNome = find.byType(TextField).at(0);
    final Finder campoNascimento = find.byType(TextField).at(2);
    final Finder campoEmail = find.byType(TextField).at(3);
    final Finder campoSenha = find.byType(TextField).at(4);
    final Finder botaoCriarConta =
        find.widgetWithText(FilledButton, 'Criar conta');

    Future<void> marcarOAceite(WidgetTester tester) async {
      await tester.ensureVisible(find.byType(Checkbox));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(Checkbox));
      await tester.pumpAndSettle();
    }

    /// A data de quem faz 16 anos HOJE, derivada do relogio real.
    ///
    /// Derivada e nao literal de proposito: uma data fixa aqui deixaria de ser
    /// a borda amanha, e o caso continuaria verde medindo outra coisa. As
    /// bordas DETERMINISTICAS estao no grupo de relogio fixo, acima; estes
    /// casos de widget usam `DateTime.now()` porque a tela usa.
    String dataDeQuemFaz16Hoje() {
      final DateTime hoje = IdadeMinima.hojeNoFusoDoProduto(DateTime.now());
      final DateTime nascimento =
          DateTime(hoje.year - idadeMinimaDoBichu, hoje.month, hoje.day);
      return mascaraDeData(
        '${nascimento.day.toString().padLeft(2, '0')}'
        '${nascimento.month.toString().padLeft(2, '0')}'
        '${nascimento.year}',
      );
    }

    /// Um dia de vida a menos: 15 anos e 364 dias hoje.
    String dataDeQuemFaz16Amanha() {
      final DateTime hoje = IdadeMinima.hojeNoFusoDoProduto(DateTime.now());
      final DateTime nascimento =
          DateTime(hoje.year - idadeMinimaDoBichu, hoje.month, hoje.day)
              .add(const Duration(days: 1));
      return mascaraDeData(
        '${nascimento.day.toString().padLeft(2, '0')}'
        '${nascimento.month.toString().padLeft(2, '0')}'
        '${nascimento.year}',
      );
    }

    Future<void> preencher(WidgetTester tester, String nascimento) async {
      await tester.enterText(campoNome, 'Marina');
      if (nascimento.isNotEmpty) {
        await tester.enterText(campoNascimento, nascimento);
      }
      await tester.enterText(campoEmail, 'marina@exemplo.com.br');
      await tester.enterText(campoSenha, 'coleira-azul-do-bidu-2026');
      await tester.pumpAndSettle();
      await marcarOAceite(tester);
    }

    /// `onPressed` nulo e o que **bloqueia** o botao; `FilledButton`
    /// desabilitado nao e um estado visual, e a ausencia da acao.
    bool botaoBloqueado(WidgetTester tester) =>
        tester.widget<FilledButton>(botaoCriarConta).onPressed == null;

    /// O campo nasceu em 18/10/2026, e o rotulo e a prova de que ele e
    /// obrigatorio: nunca diz "(opcional)".
    testWidgets('a tela tem o campo de data, com rotulo acessivel e sem paragrafo',
        (tester) async {
      await abrirCriarConta(tester);

      expect(find.text('Data de nascimento'), findsOneWidget);
      expect(
        find.text('Data de nascimento (opcional)'),
        findsNothing,
        reason: 'o contrato declara `birth_date` em `required`',
      );
      // O exemplo mora DENTRO do campo (`hintText`), e nao numa linha de
      // apoio acima: o cliente mandou remover textos de apoio em 18/10.
      expect(find.text('31/12/1990'), findsOneWidget);
      expect(
        find.byType(TextField),
        findsNWidgets(5),
        reason:
            'Nome, Apelido, Data de nascimento, E-mail e Senha. Se este numero '
            'mudar, os indices de `campoNascimento`, `campoEmail` e '
            '`campoSenha` deste arquivo mudaram junto e precisam ser revistos',
      );
    });

    /// ISCA (c), do lado da tela.
    ///
    /// Desligada: trocando `aoTocar` do `BotaoPrimario` de volta para
    /// `_criarConta` cru, este caso reprova em `botaoBloqueado`. Conferido.
    testWidgets('sem a data o botao fica bloqueado e nenhuma requisicao sai',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, '');

      expect(
        botaoBloqueado(tester),
        isTrue,
        reason: 'sem data o botao nao tem acao: `onPressed` e nulo',
      );

      await tester.tap(botaoCriarConta, warnIfMissed: false);
      await tester.pumpAndSettle();

      expect(
        cadastros,
        isEmpty,
        reason:
            'um caso que so olhasse a mensagem na tela ficaria verde com a '
            'requisicao saindo sem data',
      );
    });

    /// ISCA (a1), do lado da tela, E O CASO QUE O BOTAO **NAO** PEGA.
    ///
    /// A data esta COMPLETA, entao o botao esta liberado — e e a guarda de
    /// `_criarConta` que recusa, com a frase que explica a regra. Desligada:
    /// apagando a guarda `recusaDoNascimento`, este caso reprova em
    /// `cadastros`, que e a requisicao de um menor de 16 anos saindo.
    testWidgets('quem faz 16 anos AMANHA ve a frase e nenhuma requisicao sai',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, dataDeQuemFaz16Amanha());

      expect(
        botaoBloqueado(tester),
        isFalse,
        reason:
            'a data esta completa, entao o botao precisa estar vivo: botao '
            'apagado nao explica por que, e a pessoa precisa da frase',
      );

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty);
      expect(find.text(IdadeMinima.aindaNaoTemIdade), findsOneWidget);
    });

    /// ISCA (b), do lado da tela.
    testWidgets('data no futuro e recusada na tela, com a frase do futuro',
        (tester) async {
      await abrirCriarConta(tester);
      await preencher(tester, '01/01/2030');

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(cadastros, isEmpty);
      expect(find.text(IdadeMinima.dataNoFuturo), findsOneWidget);
    });

    /// ISCA (a2) + CONTRAPESO (d): o cadastro valido SAI, e leva a data na
    /// forma do contrato.
    ///
    /// **Sem este caso todos os de cima ficariam verdes com uma tela que nunca
    /// manda requisicao nenhuma.** Ele e a unica coisa neste arquivo que prova
    /// que a trava recusa o que deve e so isso — e e tambem o que pega a troca
    /// de `31/12/1990` por `1990-12-31`, que nao falha, acerta a data errada.
    testWidgets('quem faz 16 anos HOJE cria conta, e o corpo leva YYYY-MM-DD',
        (tester) async {
      await abrirCriarConta(tester);
      final String nascimento = dataDeQuemFaz16Hoje();
      await preencher(tester, nascimento);

      expect(botaoBloqueado(tester), isFalse);

      await tester.tap(botaoCriarConta);
      await tester.pumpAndSettle();

      expect(
        cadastros,
        hasLength(1),
        reason:
            'quem tem 16 anos exatos precisa conseguir criar conta: este e o '
            'contrapeso de todos os casos de recusa deste arquivo',
      );
      expect(
        cadastros.single['birth_date'],
        dataParaOContrato(nascimento),
        reason:
            'o corpo precisa levar `YYYY-MM-DD`, e nao o `31/12/1990` do '
            'controlador: as duas sao datas validas, e trocar uma pela outra '
            'nao falha -- acerta a data errada',
      );
      expect(
        cadastros.single['birth_date'],
        isNot(contains('/')),
        reason: 'barra no corpo e a mascara tendo escapado para a borda',
      );
    });
  });
}
