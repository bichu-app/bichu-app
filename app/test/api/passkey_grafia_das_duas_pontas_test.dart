import 'package:bichu/api/modelos_passkey.dart';
import 'package:flutter_test/flutter_test.dart';

/// BICHUS-301 — o leitor de passkey aceita AS DUAS grafias, nas duas direcoes.
///
/// ## Por que este arquivo existe
///
/// O contrato declara `PasskeyAuthenticationOptions` com `rp_id`,
/// `user_verification` e `allow_credentials` -- os tres em `required`. O
/// servidor que esta no ar manda `rpId`, `userVerification` e
/// `allowCredentials`.
///
/// MEDIDO em 28/10/2026:
///
/// ```
/// POST https://hml.bichu.app/v1/auth/passkey/authentication/options  ->  200
/// {"rpId":"hml.bichu.app","challenge":"...","allowCredentials":[],
///  "timeout":300000,"userVerification":"required"}
/// ```
///
/// A causa e `reply.send(opcoes)` em `passkey-routes.ts` com o retorno cru do
/// `@simplewebauthn/server`, que produz o JSON do WebAuthn em `camelCase`. E
/// **nenhum portao pega isso**: as rotas conferem o corpo da REQUISICAO contra
/// o contrato e ninguem confere o da RESPOSTA.
///
/// ## A ISCA TEM DE MEDIR AS DUAS DIRECOES, E ESSE E O PONTO DELA
///
/// Uma isca que so montasse o JSON do servidor provaria que hoje funciona, e
/// ficaria **verde** no dia em que alguem apagasse o ramo da grafia do
/// contrato -- quebrando o app assim que o servidor fosse corrigido. Uma que
/// so montasse o do contrato esta verde agora enquanto o passkey nao funciona
/// no ar.
///
/// Por isso cada caso abaixo roda DUAS vezes sobre o mesmo corpo, uma por
/// grafia, e as duas tem de dar o mesmo resultado. E o grupo final percorre
/// `IscaDeGrafia` para cobrar que **todo par declarado** seja de fato aceito --
/// um par novo acrescentado la sem o leitor correspondente reprova aqui.
void main() {
  // --------------------------------------------------------------------------
  // Os dois corpos da ENTRADA, campo por campo iguais, grafia diferente.
  // --------------------------------------------------------------------------

  Map<String, dynamic> entradaComoOServidorManda() => <String, dynamic>{
        'rpId': 'hml.bichu.app',
        'challenge': 'ZGVzYWZpbw',
        'allowCredentials': <dynamic>[],
        'timeout': 300000,
        'userVerification': 'required',
      };

  Map<String, dynamic> entradaComoOContratoDeclara() => <String, dynamic>{
        'rp_id': 'hml.bichu.app',
        'challenge': 'ZGVzYWZpbw',
        'allow_credentials': <dynamic>[],
        'timeout': 300000,
        'user_verification': 'required',
      };

  Map<String, dynamic> cadastroComoOServidorManda() => <String, dynamic>{
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

  Map<String, dynamic> cadastroComoOContratoDeclara() => <String, dynamic>{
        'challenge': 'ZGVzYWZpbw',
        'rp': <String, dynamic>{'id': 'hml.bichu.app', 'name': 'Bichu'},
        'user': <String, dynamic>{
          'id': 'dXNlci1pZA',
          'name': 'marina@exemplo.com.br',
          'display_name': 'Marina Prado',
        },
        'pub_key_cred_params': <dynamic>[
          <String, dynamic>{'type': 'public-key', 'alg': -7},
          <String, dynamic>{'type': 'public-key', 'alg': -257},
        ],
        'timeout': 300000,
        'attestation': 'none',
        'authenticator_selection': <String, dynamic>{
          'authenticator_attachment': 'platform',
          'resident_key': 'required',
          'user_verification': 'required',
        },
        'exclude_credentials': <dynamic>[],
      };

  group('ISCA — a ENTRADA le as duas grafias, e com o mesmo resultado', () {
    final corpos = <String, Map<String, dynamic> Function()>{
      'como o servidor manda hoje (camelCase, MEDIDO)':
          entradaComoOServidorManda,
      'como o contrato declara (snake_case)': entradaComoOContratoDeclara,
    };

    for (final entrada in corpos.entries) {
      test(entrada.key, () {
        final opcoes = OpcoesDeEntradaPorPasskey.doJson(entrada.value());

        // `rpId` VAZIO E O DEFEITO SILENCIOSO. Se este campo chegar vazio, o
        // sistema operacional nao acha associacao nenhuma, a folha nativa nao
        // aparece, e o app trata isso como "esta pessoa nao tem passkey".
        // Nada erra, nada registra, e a entrada por passkey simplesmente
        // nunca funciona.
        expect(
          opcoes.rpId,
          'hml.bichu.app',
          reason: 'REPROVA: o `RP ID` nao foi lido nesta grafia. Com ele '
              'vazio, a folha nativa nao abre e a falha e INDISTINGUIVEL de '
              'aparelho sem passkey.',
        );
        expect(opcoes.desafio, 'ZGVzYWZpbw');
        expect(opcoes.prazoEmMilissegundos, 300000);
        expect(opcoes.verificacaoDoUsuario, 'required');
        // `maxItems: 0` no contrato. A lista vazia e o valor certo em toda
        // chamada: ela e a forma de a operacao nao responder "esta conta tem
        // passkey?" numa porta sem autenticacao.
        expect(opcoes.allowCredentials, isEmpty);
      });
    }
  });

  group('ISCA — o CADASTRO le as duas grafias, e com o mesmo resultado', () {
    final corpos = <String, Map<String, dynamic> Function()>{
      'como o servidor manda hoje (camelCase)': cadastroComoOServidorManda,
      'como o contrato declara (snake_case)': cadastroComoOContratoDeclara,
    };

    for (final entrada in corpos.entries) {
      test(entrada.key, () {
        final opcoes = OpcoesDeCadastroDePasskey.doJson(entrada.value());

        expect(opcoes.rpId, 'hml.bichu.app');
        expect(opcoes.rpNome, 'Bichu');
        expect(opcoes.usuarioId, 'dXNlci1pZA');
        expect(opcoes.usuarioEmail, 'marina@exemplo.com.br');
        expect(opcoes.usuarioNome, 'Marina Prado');
        expect(opcoes.prazoEmMilissegundos, 300000);
        expect(opcoes.atestacao, 'none');
        expect(opcoes.vinculoDoAutenticador, 'platform');

        // `required` E O QUE TORNA A CREDENCIAL *DISCOVERABLE*, e e ele que
        // permite `beginPasskeyAuthentication` nao receber e-mail. Se este
        // campo chegar errado, o cadastro FUNCIONA e a credencial nao aparece
        // na entrada -- a falha acontece num fluxo e aparece no outro.
        expect(
          opcoes.chaveResidente,
          'required',
          reason: 'REPROVA: `resident_key` nao foi lido nesta grafia. A '
              'credencial sairia NAO discoverable, cadastraria sem erro, e '
              'nao apareceria na entrada sem e-mail.',
        );
        expect(opcoes.verificacaoDoUsuario, 'required');
        expect(opcoes.algoritmos.map((a) => a.alg).toList(), <int>[-7, -257]);
        expect(opcoes.excluirCredenciais, isEmpty);
      });
    }
  });

  group('ISCA — todo par declarado em `IscaDeGrafia` e de fato aceito', () {
    // **Este grupo e o que impede a lista de virar enfeite.** Os dois grupos
    // acima leem corpos escritos a mao: acrescentar um par em `IscaDeGrafia`
    // sem ensinar o leitor a ler os dois nomes nao reprovaria neles. Aqui o
    // caso parte da propria lista.

    test('a entrada declara os tres pares que divergem, e so eles', () {
      expect(
        IscaDeGrafia.paresDaEntrada,
        <String, String>{
          'rp_id': 'rpId',
          'user_verification': 'userVerification',
          'allow_credentials': 'allowCredentials',
        },
        reason: 'REPROVA: a lista de pares da entrada mudou. Se um par entrou, '
            'o leitor em `OpcoesDeEntradaPorPasskey.doJson` precisa ler as '
            'duas grafias dele -- e este arquivo precisa de um caso para ele.',
      );
    });

    test('nenhum par mapeia um nome para ele mesmo', () {
      // Um par `{'x': 'x'}` nao e divergencia: ele seria ruido na lista, e
      // pior, daria a impressao de que aquele campo foi conferido.
      for (final pares in <Map<String, String>>[
        IscaDeGrafia.paresDaEntrada,
        IscaDeGrafia.paresDoCadastro,
      ]) {
        pares.forEach((contrato, servidor) {
          expect(
            contrato,
            isNot(servidor),
            reason: 'REPROVA: o par `$contrato` -> `$servidor` nao diverge. '
                'Pares iguais nao pertencem a esta lista.',
          );
        });
      }
    });

    test('o campo ausente NAS DUAS grafias estoura dizendo os dois nomes', () {
      // **O valor disto e a mensagem.** O `as String` de um campo ausente
      // estoura `TypeError: null is not a String`, que nao diz qual campo nem
      // qual grafia -- e no caminho do passkey essa excecao e engolida por
      // `FiacaoDoPasskey`, virando um `null` indistinguivel de "nao tem
      // passkey". Quando a falha chegar ao canal de observabilidade, ela tem
      // de dizer o que procurar.
      final semRpId = entradaComoOServidorManda()..remove('rpId');

      expect(
        () => OpcoesDeEntradaPorPasskey.doJson(semRpId),
        throwsA(
          isA<FormatException>()
              .having((e) => e.message, 'cita a grafia do contrato',
                  contains('rp_id'))
              .having((e) => e.message, 'cita a grafia do servidor',
                  contains('rpId')),
        ),
        reason: 'REPROVA: o campo ausente nao estourou com os DOIS nomes na '
            'mensagem. Sem eles, esta falha chega ao registro como '
            '`TypeError: null is not a String` e nao aponta para nada.',
      );
    });
  });

  group('ISCA — a IDA continua em `snake_case`, porque ELA e conferida', () {
    // **A divergencia e so na volta, e esta assimetria e real.** As duas
    // operacoes de `finish` declaram `schema: { body: ... }` no servidor,
    // entao o corpo que o app ENVIA e conferido contra o contrato e precisa
    // estar em `snake_case`. Trocar a grafia aqui para "ficar consistente" com
    // a leitura daria 400 nas duas operacoes.

    test('o cadastro manda `client_data_json` e `attestation_object`', () {
      const credencial = CredencialCadastrada(
        id: 'aWQ',
        rawId: 'aWQ',
        clientDataJson: 'Y2Q',
        attestationObject: 'YW8',
        transportes: <String>['internal'],
      );
      final corpo = credencial.paraOContrato(rotulo: 'Celular da Marina');
      final cred = corpo['credential'] as Map<String, dynamic>;
      final resposta = cred['response'] as Map<String, dynamic>;

      expect(cred['id'], 'aWQ');
      expect(cred['raw_id'], 'aWQ');
      expect(cred['type'], 'public-key');
      expect(resposta['client_data_json'], 'Y2Q');
      expect(resposta['attestation_object'], 'YW8');
      expect(resposta['transports'], <String>['internal']);
      expect(corpo['label'], 'Celular da Marina');
      // Nenhuma chave em camelCase pode vazar para o corpo.
      expect(cred.containsKey('rawId'), isFalse);
      expect(resposta.containsKey('clientDataJSON'), isFalse);
    });

    test('`label` nulo NAO vai no corpo, e nao vai como `null`', () {
      // `label` nao e `nullable` no contrato: ausente e "nao escolhi", e
      // `label: null` seria recusado pelo schema.
      const credencial = CredencialCadastrada(
        id: 'aWQ',
        rawId: 'aWQ',
        clientDataJson: 'Y2Q',
        attestationObject: 'YW8',
        transportes: <String>[],
      );
      final corpo = credencial.paraOContrato();
      expect(corpo.containsKey('label'), isFalse);
      // E a lista vazia de transportes tambem nao vira chave.
      final resposta =
          (corpo['credential'] as Map<String, dynamic>)['response']
              as Map<String, dynamic>;
      expect(resposta.containsKey('transports'), isFalse);
    });

    test('a entrada manda `user_handle` ATE quando e nulo', () {
      // AQUI E O CONTRARIO DO `label`, e a diferenca e o contrato:
      // `user_handle` E `nullable`, entao `null` e um valor valido e
      // distinguivel de "o aparelho nao me deu". Omitir apagaria essa
      // diferenca.
      const semHandle = CredencialAssinada(
        id: 'aWQ',
        rawId: 'aWQ',
        clientDataJson: 'Y2Q',
        authenticatorData: 'YWQ',
        signature: 'c2ln',
        userHandle: null,
      );
      final corpo = semHandle.paraOContrato(continuarConectado: true);
      final resposta =
          (corpo['credential'] as Map<String, dynamic>)['response']
              as Map<String, dynamic>;

      expect(
        resposta.containsKey('user_handle'),
        isTrue,
        reason: 'REPROVA: `user_handle` nulo foi OMITIDO. O contrato o declara '
            '`nullable`, e ausente nao e a mesma coisa que nulo.',
      );
      expect(resposta['user_handle'], isNull);
      expect(resposta['authenticator_data'], 'YWQ');
      expect(resposta['signature'], 'c2ln');
      expect(corpo['stay_signed_in'], isTrue);
    });
  });

  group('ISCA — o descritor sem `type` cai em `public-key`', () {
    test('porque `generateRegistrationOptions` monta `{ id }` so', () {
      // `passkey-service.ts` faz `excludeCredentials: aExcluir.map((id) => ({
      // id: base64url(id) }))` -- sem `type`. `public-key` e o unico valor que
      // o `enum` do contrato admite, entao o padrao nao escolhe nada: ele
      // escreve o unico valor possivel em vez de estourar.
      final descritor = DescritorDeCredencial.doJson(<String, dynamic>{
        'id': 'Y3JlZA',
      });
      expect(descritor.tipo, 'public-key');
      expect(descritor.id, 'Y3JlZA');
    });

    test('e um `type` explicito continua sendo respeitado', () {
      final descritor = DescritorDeCredencial.doJson(<String, dynamic>{
        'id': 'Y3JlZA',
        'type': 'public-key',
      });
      expect(descritor.tipo, 'public-key');
    });
  });
}
