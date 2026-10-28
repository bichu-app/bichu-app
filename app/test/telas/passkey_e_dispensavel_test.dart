import 'dart:convert';

import 'package:bichu/api/modelos_passkey.dart';
import 'package:bichu/app.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/credencial_do_aparelho.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ajuda_de_tela.dart';

/// BICHUS-301 — a passkey SOMA, e nunca atravessa o caminho de quem nao a usa.
///
/// ## O QUE ESTE ARQUIVO NAO PROVA, DITO PRIMEIRO
///
/// **Ele nao prova o fluxo de passkey ponta a ponta, e nenhuma isca deste
/// repositorio prova.** A folha que pede biometria e do sistema operacional:
/// ela nao sobe em `flutter test`, e o que ela devolve depende de o `RP ID`
/// casar com o host que serve o arquivo de associacao -- uma condicao que so
/// existe em aparelho, com deploy feito. Os dubles abaixo substituem a folha
/// nativa, e portanto **o que eles medem e o app, nao o WebAuthn**.
///
/// ## O QUE ELE PROVA, QUE E O QUE O CLIENTE PEDIU
///
/// Duas propriedades, e as duas sao de AUSENCIA -- o tipo que apodrece sem
/// isca, porque ninguem percebe quando para de valer:
///
/// 1. **O convite e dispensavel.** Quem recusa a biometria termina o cadastro.
///    Nos QUATRO jeitos de recusar: `Agora nao`, a folha nativa fechada, o
///    aparelho que nao faz passkey, e o servidor que recusa.
/// 2. **A entrada por senha nao e atrapalhada.** A tela de entrar tenta a
///    passkey sozinha ao abrir; quando nao ha credencial, abrir a tela tem de
///    ser indistinguivel de antes desta frente existir.
void main() {
  setUp(AppConfig.limparParaTeste);

  const String urlBase = 'http://localhost:3000';
  const String versao = '2026-09-17';

  // --------------------------------------------------------------------------
  // Os dubles da folha nativa.
  // --------------------------------------------------------------------------

  /// A folha que a pessoa FECHA. E o `Agora nao` feito na folha do sistema.
  ///
  /// `SemCredencialNoAparelho` e o mesmo desfecho que o aparelho sem passkey
  /// produz na entrada, e e de proposito que seja um tipo so: a tela nao tem
  /// nada de util a dizer a quem nunca cadastrou.
  final folhaFechada = _CredencialDeTeste(
    aoCadastrar: () => throw const SemCredencialNoAparelho('duble'),
    aoAssinar: () => throw const SemCredencialNoAparelho('duble'),
  );

  /// O aparelho em que o dominio NAO esta associado.
  ///
  /// Este e o desfecho que acusa `RP ID` divergente do host do arquivo de
  /// associacao -- o erro de fiacao mais caro deste fluxo. O app tem de
  /// registrar e seguir, nunca travar a pessoa.
  final dominioNaoAssociado = _CredencialDeTeste(
    aoCadastrar: () => throw const CredencialIndisponivel(
      MotivoDaIndisponibilidade.dominioNaoAssociado,
      'duble',
    ),
    aoAssinar: () => throw const CredencialIndisponivel(
      MotivoDaIndisponibilidade.dominioNaoAssociado,
      'duble',
    ),
  );

  /// O aparelho que CADASTRA e ASSINA. O caminho feliz.
  final aparelhoQueAceita = _CredencialDeTeste(
    aoCadastrar: () => const CredencialCadastrada(
      id: 'Y3JlZGVudGlhbC1pZA',
      rawId: 'Y3JlZGVudGlhbC1pZA',
      clientDataJson: 'Y2xpZW50LWRhdGE',
      attestationObject: 'YXR0ZXN0YXRpb24',
      transportes: <String>['internal'],
    ),
    aoAssinar: () => const CredencialAssinada(
      id: 'Y3JlZGVudGlhbC1pZA',
      rawId: 'Y3JlZGVudGlhbC1pZA',
      clientDataJson: 'Y2xpZW50LWRhdGE',
      authenticatorData: 'YXV0aC1kYXRh',
      signature: 'YXNzaW5hdHVyYQ',
      userHandle: 'dXNlci1oYW5kbGU',
    ),
  );

  // --------------------------------------------------------------------------
  // As respostas do servidor. EM camelCase, que e o que o servidor MANDA.
  // --------------------------------------------------------------------------

  /// `beginPasskeyRegistration`, na grafia MEDIDA do servidor.
  ///
  /// `camelCase`, e nao a `snake_case` que o contrato declara: ver o cabecalho
  /// de `api/modelos_passkey.dart`. Montar isto na grafia do contrato faria a
  /// isca provar um servidor que nao existe.
  Map<String, dynamic> opcoesDeCadastro() => <String, dynamic>{
        'challenge': 'ZGVzYWZpbw',
        'rp': <String, dynamic>{'id': 'hml.bichu.app', 'name': 'Bichu'},
        'user': <String, dynamic>{
          'id': 'dXNlci1pZA',
          'name': 'marina@exemplo.com.br',
          'displayName': 'Marina Prado',
        },
        'pubKeyCredParams': <dynamic>[
          <String, dynamic>{'type': 'public-key', 'alg': -7},
          <String, dynamic>{'type': 'public-key', 'alg': -257},
        ],
        'timeout': 300000,
        'attestation': 'none',
        'authenticatorSelection': <String, dynamic>{
          'authenticatorAttachment': 'platform',
          'residentKey': 'required',
          'requireResidentKey': true,
          'userVerification': 'required',
        },
        'excludeCredentials': <dynamic>[],
      };

  /// `beginPasskeyAuthentication`, na grafia MEDIDA em 28/10/2026 contra
  /// `https://hml.bichu.app`.
  Map<String, dynamic> opcoesDeEntrada() => <String, dynamic>{
        'rpId': 'hml.bichu.app',
        'challenge': 'ZGVzYWZpbw',
        'allowCredentials': <dynamic>[],
        'timeout': 300000,
        'userVerification': 'required',
      };

  Map<String, dynamic> corpoDaSessao() => <String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': false,
        },
      };

  http.Response json(Object corpo, int status) => http.Response(
        jsonEncode(corpo),
        status,
        headers: <String, String>{'content-type': 'application/json'},
      );

  /// Toda rota que cada caso viu, para as contagens.
  late List<String> rotas;

  /// Os corpos de `POST /auth/passkey/registration`.
  late List<Map<String, dynamic>> cadastrosDePasskey;

  MockClient redeDe({
    bool passkeyDoServidorFunciona = true,
    int statusDoRegistroDePasskey = 201,
  }) {
    return MockClient((req) async {
      rotas.add('${req.method} ${req.url.path}');
      final caminho = req.url.path;

      if (caminho.endsWith('/auth/register')) return json(corpoDaSessao(), 201);
      if (caminho.endsWith('/auth/login')) return json(corpoDaSessao(), 200);

      if (caminho.endsWith('/auth/passkey/registration/options')) {
        if (!passkeyDoServidorFunciona) {
          return json(<String, dynamic>{
            'type': 'https://api.bichu.app/problems/passkey-limit-reached',
            'title': 'Limite de credenciais atingido',
            'status': 409,
          }, 409);
        }
        return json(opcoesDeCadastro(), 200);
      }
      if (caminho.endsWith('/auth/passkey/registration')) {
        cadastrosDePasskey.add(jsonDecode(req.body) as Map<String, dynamic>);
        return json(<String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7a',
          'label': null,
          'created_at': '2026-10-28T12:00:00.000Z',
          'last_used_at': null,
        }, statusDoRegistroDePasskey);
      }
      if (caminho.endsWith('/auth/passkey/authentication/options')) {
        return json(opcoesDeEntrada(), 200);
      }
      if (caminho.endsWith('/auth/passkey/authentication')) {
        return json(corpoDaSessao(), 200);
      }

      // 404 no resto de proposito: chamada nao prevista por um caso precisa
      // falhar alto, e nao passar por acidente.
      return http.Response('{}', 404);
    });
  }

  int quantas(String fragmento) =>
      rotas.where((r) => r.endsWith(fragmento)).length;

  /// O dominio nao associado foi REGISTRADO, e nao engolido.
  ///
  /// **Este `expect` e o avesso dos outros deste arquivo, e os dois precisam
  /// valer juntos.** Para a PESSOA, `dominioNaoAssociado` tem de ser invisivel
  /// -- e os casos acima cobram isso. Para quem MANTEM o app, ele tem de
  /// gritar: ele e o sintoma de `RP ID` divergente do host que serve o arquivo
  /// de associacao, e significa que o passkey esta quebrado para TODO MUNDO --
  /// nao recusado por uma pessoa. Sem registro, a unica diferenca entre "o
  /// deploy do arquivo de associacao nao saiu" e "ninguem cadastrou passkey
  /// ainda" seria o silencio.
  ///
  /// `takeException` e tambem o que faz o caso passar: `registrarFalhaInesperada`
  /// chama `FlutterError.reportError`, e erro reportado e nao consumido
  /// **reprova** o teste de widget. Consumir aqui e afirmar que ele existe.
  void exigirQueFoiRegistrado(WidgetTester tester, String onde) {
    final registrada = tester.takeException();
    expect(
      registrada,
      isA<CredencialIndisponivel>(),
      reason: 'REPROVA: o dominio nao associado NAO foi registrado $onde. '
          'Ele e erro de fiacao nosso e passaria a ser indistinguivel de '
          '"esta pessoa nao tem passkey".',
    );
    expect(
      (registrada as CredencialIndisponivel).motivo,
      MotivoDaIndisponibilidade.dominioNaoAssociado,
    );
  }

  // --------------------------------------------------------------------------
  // O cadastro.
  // --------------------------------------------------------------------------

  final Finder caixaDeAceite = find.byType(Checkbox);
  final Finder botaoCriarConta =
      find.widgetWithText(FilledButton, 'Criar conta');

  Future<void> abrirCriarConta(
    WidgetTester tester, {
    required CredencialDoAparelho aparelho,
    bool passkeyDoServidorFunciona = true,
  }) async {
    rotas = <String>[];
    cadastrosDePasskey = <Map<String, dynamic>>[];
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
        // EM MEMORIA, E ISSO NAO E DETALHE DE ARRUMACAO. O padrao do app e
        // `DepositoDeIntencaoEmArquivo`, que chama
        // `getApplicationDocumentsDirectory()` -- canal de plataforma, que em
        // teste de widget devolve um `Future` que NUNCA resolve. Sem esta
        // linha, `executarDepoisDoLogin()` pendura, a tela fica girando e o
        // caso morre em `pumpAndSettle timed out` sem dizer por que. Medido.
        depositoDeIntencao: DepositoDeIntencaoEmMemoria(),
        credencialDoAparelho: aparelho,
        clienteHttp: redeDe(
          passkeyDoServidorFunciona: passkeyDoServidorFunciona,
        ),
      ),
    );
    await tester.pumpAndSettle();
    await irParaAConta(tester);
    await tester.tap(find.text('Criar conta'));
    await tester.pumpAndSettle();
  }

  Future<void> preencherECriar(WidgetTester tester) async {
    // A ordem dos campos: Nome(0), Apelido(1), Nascimento(2), E-mail(3),
    // Senha(4). Nome e nascimento sao obrigatorios e bloqueiam o botao.
    await tester.enterText(find.byType(TextField).at(0), 'Marina Prado');
    await tester.enterText(find.byType(TextField).at(2), '12/05/1990');
    await tester.enterText(
      find.byType(TextField).at(3),
      'marina@exemplo.com.br',
    );
    await tester.enterText(find.byType(TextField).at(4), 'uma frase longa');
    await tester.ensureVisible(caixaDeAceite);
    await tester.pumpAndSettle();
    await tester.tap(caixaDeAceite);
    await tester.pumpAndSettle();
    await tester.tap(botaoCriarConta);
    await tester.pumpAndSettle();
  }

  /// A conta foi criada E a pessoa chegou ao fim do fluxo.
  ///
  /// As duas coisas juntas, e nao uma: a conta criada sozinha nao prova que a
  /// pessoa saiu do formulario, e e exatamente ai que um convite nao
  /// dispensavel prenderia alguem -- conta no banco e pessoa parada na tela.
  void exigirCadastroCompleto(String porque) {
    expect(
      quantas('/auth/register'),
      1,
      reason: 'REPROVA: a conta nao foi criada. $porque',
    );
    expect(
      find.widgetWithText(AppBar, 'Verifique seu e-mail'),
      findsOne,
      reason: 'REPROVA: a conta foi criada e a pessoa NAO saiu do formulario. '
          'O convite da passkey prendeu quem recusou: $porque',
    );
  }

  group('ISCA — o convite da passkey e DISPENSAVEL', () {
    testWidgets('`Agora nao` termina o cadastro, e nao gasta ida a rede',
        (tester) async {
      await abrirCriarConta(tester, aparelho: aparelhoQueAceita);
      await preencherECriar(tester);

      // O convite esta na tela antes de a pessoa recusar. Sem esta linha o
      // caso ficaria verde no dia em que o convite parasse de aparecer --
      // provando que o cadastro termina, que e trivial sem convite nenhum.
      expect(
        find.text('Agora não'),
        findsOne,
        reason: 'REPROVA: o convite da passkey nao apareceu depois do '
            'cadastro. Foi o que o cliente pediu.',
      );

      await tester.tap(find.text('Agora não'));
      await tester.pumpAndSettle();

      exigirCadastroCompleto('a pessoa tocou em `Agora nao`.');
      expect(
        quantas('/auth/passkey/registration/options'),
        0,
        reason: 'REPROVA: `Agora nao` foi ao servidor pedir desafio. Recusar '
            'nao pode custar uma ida a rede nem gastar o teto de 10 por hora '
            'da conta.',
      );
      expect(cadastrosDePasskey, isEmpty);
    });

    testWidgets('a folha nativa FECHADA termina o cadastro', (tester) async {
      // A pessoa toca em `Ativar`, o sistema pede a biometria, e ela
      // desiste. O desafio ja foi gasto no servidor e nada foi cadastrado.
      await abrirCriarConta(tester, aparelho: folhaFechada);
      await preencherECriar(tester);
      await tester.tap(find.text('Ativar'));
      await tester.pumpAndSettle();

      exigirCadastroCompleto('a pessoa fechou a folha do sistema.');
      expect(
        cadastrosDePasskey,
        isEmpty,
        reason: 'REPROVA: nada foi assinado e o app concluiu um cadastro de '
            'credencial.',
      );
    });

    testWidgets('o dominio NAO associado termina o cadastro', (tester) async {
      // Este e o caso do `RP ID` que nao casa com o host do arquivo de
      // associacao -- erro de fiacao NOSSO. Ele vai para o registro, e para a
      // pessoa o desfecho e seguir.
      await abrirCriarConta(tester, aparelho: dominioNaoAssociado);
      await preencherECriar(tester);
      await tester.tap(find.text('Ativar'));
      await tester.pumpAndSettle();

      exigirCadastroCompleto('o dominio nao esta associado ao app.');
      exigirQueFoiRegistrado(
        tester,
        'no convite depois do cadastro',
      );
    });

    testWidgets('o servidor que RECUSA com 409 termina o cadastro',
        (tester) async {
      await abrirCriarConta(
        tester,
        aparelho: aparelhoQueAceita,
        passkeyDoServidorFunciona: false,
      );
      await preencherECriar(tester);
      await tester.tap(find.text('Ativar'));
      await tester.pumpAndSettle();

      exigirCadastroCompleto('o servidor respondeu 409 de teto.');
    });

    testWidgets('quem ACEITA cadastra, e o corpo vai na grafia do contrato',
        (tester) async {
      await abrirCriarConta(tester, aparelho: aparelhoQueAceita);
      await preencherECriar(tester);
      await tester.tap(find.text('Ativar'));
      await tester.pumpAndSettle();

      exigirCadastroCompleto('a pessoa ativou a passkey.');
      expect(cadastrosDePasskey, hasLength(1));

      // A IDA e `snake_case`, e isto nao e simetrico com a volta: as duas
      // operacoes de `finish` declaram `schema: { body: ... }` no servidor,
      // entao o corpo E conferido contra o contrato. Chave em `camelCase` aqui
      // levaria 400.
      final credencial =
          cadastrosDePasskey.single['credential'] as Map<String, dynamic>;
      final resposta = credencial['response'] as Map<String, dynamic>;
      expect(credencial.keys, containsAll(<String>['id', 'raw_id', 'type']));
      expect(credencial['type'], 'public-key');
      expect(
        resposta.keys,
        containsAll(<String>['client_data_json', 'attestation_object']),
        reason: 'REPROVA: o corpo saiu em camelCase. As rotas de `finish` '
            'conferem o corpo contra o contrato e responderiam 400.',
      );
    });
  });

  group('ISCA — a entrada por senha NAO e atrapalhada', () {
    Future<void> abrirEntrar(
      WidgetTester tester, {
      required CredencialDoAparelho aparelho,
    }) async {
      rotas = <String>[];
      cadastrosDePasskey = <Map<String, dynamic>>[];
      await tester.pumpWidget(
        BichuApp(
          config: AppConfig.carregar(apiBaseUrlDeTeste: urlBase),
          deposito: DepositoEmMemoria(),
          // Ver o comentario no harness do cadastro: sem o deposito em
          // memoria, `executarDepoisDoLogin()` pendura num canal de
          // plataforma e TODO caso de login bem-sucedido morre em
          // `pumpAndSettle timed out`. E por isso que
          // `entrar_decide_por_tipo_test.dart` nunca precisou disto: ele so
          // exercita login RECUSADO, que nao chega nessa linha.
          depositoDeIntencao: DepositoDeIntencaoEmMemoria(),
          credencialDoAparelho: aparelho,
          clienteHttp: redeDe(),
        ),
      );
      await tester.pumpAndSettle();
      await irParaAConta(tester);
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();
    }

    testWidgets('sem passkey no aparelho, a tela nao acusa nada', (tester) async {
      await abrirEntrar(tester, aparelho: folhaFechada);

      // A tentativa ACONTECEU -- sem esta linha o caso ficaria verde com a
      // porta desligada, provando que uma tela que nao tenta nada nao
      // atrapalha nada.
      expect(
        quantas('/auth/passkey/authentication/options'),
        1,
        reason: 'REPROVA: a tela de entrar nao tentou a passkey ao abrir. Sem '
            'a tentativa, nao existe entrada por passkey -- nao ha botao.',
      );

      // E NAO SOBROU NADA NA TELA. Os dois campos e o botao, do jeito que
      // sempre foram.
      expect(find.byType(TextField), findsNWidgets(2));
      expect(
        find.textContaining('não conferem'),
        findsNothing,
        reason: 'REPROVA: a tentativa de passkey virou faixa de erro na cara '
            'de quem so queria digitar a senha.',
      );
      expect(find.textContaining('passkey'), findsNothing);
      expect(find.textContaining('credencial digital'), findsNothing);
      expect(
        find.widgetWithText(AppBar, 'Entrar'),
        findsOne,
        reason: 'REPROVA: a tela de entrar navegou para outro lugar sem a '
            'pessoa ter entrado.',
      );
    });

    testWidgets('e a senha continua entrando depois da tentativa falha',
        (tester) async {
      await abrirEntrar(tester, aparelho: folhaFechada);

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      expect(
        quantas('/auth/login'),
        1,
        reason: 'REPROVA: o toque em `Entrar` nao chamou `/auth/login`. A '
            'tentativa de passkey deixou o botao inerte -- provavelmente '
            'mexendo em `_enviando`.',
      );
      expect(
        find.widgetWithText(AppBar, 'Entrar'),
        findsNothing,
        reason: 'REPROVA: a senha conferiu e a pessoa ficou na tela de entrar.',
      );
    });

    testWidgets('o dominio nao associado tambem nao atrapalha a senha',
        (tester) async {
      await abrirEntrar(tester, aparelho: dominioNaoAssociado);

      expect(find.byType(TextField), findsNWidgets(2));
      expect(find.textContaining('não conferem'), findsNothing);
      expect(find.widgetWithText(AppBar, 'Entrar'), findsOne);
      exigirQueFoiRegistrado(tester, 'na porta da tela de entrar');
    });

    testWidgets('com passkey no aparelho, a pessoa entra sem digitar',
        (tester) async {
      await abrirEntrar(tester, aparelho: aparelhoQueAceita);

      expect(quantas('/auth/passkey/authentication'), 1);
      expect(
        quantas('/auth/login'),
        0,
        reason: 'REPROVA: entrou por passkey E por senha. O `/auth/login` nao '
            'tem o que fazer aqui -- ninguem digitou nada.',
      );
      expect(
        find.widgetWithText(AppBar, 'Entrar'),
        findsNothing,
        reason: 'REPROVA: a passkey conferiu, o servidor abriu sessao, e a '
            'pessoa continuou olhando o formulario de senha.',
      );
    });
  });
}

/// A folha nativa, substituida por duas funcoes.
///
/// **Nao e `SemPasskeyNesteBuild`**, que recusa sempre: os casos precisam dos
/// dois lados, e precisam escolher QUAL recusa -- a pessoa que fecha a folha e
/// o dominio que nao esta associado levam a tratamentos diferentes no registro,
/// mesmo levando ao mesmo lugar na tela.
class _CredencialDeTeste implements CredencialDoAparelho {
  _CredencialDeTeste({required this.aoCadastrar, required this.aoAssinar});

  final CredencialCadastrada Function() aoCadastrar;
  final CredencialAssinada Function() aoAssinar;

  @override
  Future<CredencialCadastrada> cadastrar(OpcoesDeCadastroDePasskey opcoes) async {
    // AS OPCOES SAO LIDAS, e nao ignoradas. O duble que descartasse o
    // argumento deixaria passar o dia em que `comecarCadastro` devolvesse um
    // corpo que `doJson` nao sabe ler: o `TypeError` acontece ANTES desta
    // funcao, e a unica forma de a isca notar e o caminho inteiro ser
    // percorrido ate aqui. Estas tres linhas sao a prova de que ele foi.
    expect(opcoes.rpId, isNotEmpty);
    expect(opcoes.desafio, isNotEmpty);
    expect(opcoes.chaveResidente, 'required');
    return aoCadastrar();
  }

  @override
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes) async {
    // Mesmo motivo. `rpId` e o campo que o servidor manda como `rpId` e o
    // contrato declara como `rp_id`: se o leitor voltar a aceitar so uma das
    // duas grafias, ele chega vazio ou estoura, e este `expect` acusa.
    expect(
      opcoes.rpId,
      isNotEmpty,
      reason: 'REPROVA: o `rpId` chegou vazio. O leitor de '
          '`PasskeyAuthenticationOptions` parou de aceitar a grafia que o '
          'servidor realmente manda.',
    );
    expect(opcoes.desafio, isNotEmpty);
    expect(opcoes.allowCredentials, isEmpty);
    return aoAssinar();
  }
}
