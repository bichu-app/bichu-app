/// SEC-019, a metade do APP: o aparelho volta ao cadastro de push a cada login.
///
/// ---------------------------------------------------------------------------
/// POR QUE ESTA METADE E OBRIGATORIA, E POR QUE SEM ELA O CONSERTO E PIOR
/// ---------------------------------------------------------------------------
///
/// O servidor passou a apagar a linha de `user_devices` em toda revogacao em
/// massa: sair de todos os aparelhos, troca de senha, redefinicao, "nao fui eu"
/// e exclusao de conta. Isso inclui o aparelho de QUEM PEDIU, e nao ha escolha:
/// `user_devices` nao tem coluna que ligue a linha a familia de refresh, entao o
/// servidor nao consegue saber qual das linhas da conta e o telefone que esta
/// fazendo o pedido. A unica forma seria o cliente informar qual poupar, e quem
/// esta com o telefone roubado informaria o dele.
///
/// O preco disso e do app, e ele nao estava pago. `VigiaDeAviso.reconciliar()`
/// so re-registra quando a permissao do SISTEMA muda:
///
/// ```dart
/// final antes = _ultimoConhecido;
/// if (antes == agora) return;
/// ```
///
/// Sair de todos nao muda permissao nenhuma. A do sistema operacional continua
/// `concedida`, `_ultimoConhecido` continua `concedida`, e `reconciliar` devolve
/// na primeira linha. A pessoa entra de novo, ve o app funcionando, e fica sem
/// alerta de pet perdido por tempo indeterminado, sem nenhum sinal -- o registro
/// so volta quando o processo do app e encerrado e reaberto, porque ai
/// `_ultimoConhecido` nasce nulo.
///
/// Trocar "o ladrao recebe alerta" por "a vitima nao recebe alerta" e o lado
/// pior para um produto cuja funcao e avisar.
///
/// ---------------------------------------------------------------------------
/// O QUE ESTES CASOS MEDEM
/// ---------------------------------------------------------------------------
///
/// **O corpo que chega a `POST /v1/me/devices` depois do login.** Nao "o vigia
/// foi chamado", nao "o metodo existe": o `push_permission` e o `push_token`,
/// que e o unico lugar onde este defeito e visivel do lado do servidor.
///
/// Sao tres casos com papeis diferentes:
///
/// 1. o caso do SEC-019 propriamente dito: o app JA sabia `concedida` quando o
///    login aconteceu. E o estado de quem acabou de sair de todos os aparelhos
///    e entrou de novo no mesmo processo, e e o unico que a comparacao
///    `antes == agora` bloqueava;
/// 2. a FIACAO, pelo app inteiro e pela tela de login de verdade. Um vigia que
///    funciona e que ninguem ligou ao controlador de sessao passa no caso 1 e
///    nao serve para nada no aparelho;
/// 3. o contrapeso: o login NAO pode cair porque o registro falhou.
///
/// ---------------------------------------------------------------------------
/// AS ISCAS, RODADAS E VISTAS REPROVAR EM 23/09/2026
/// ---------------------------------------------------------------------------
///
/// | o que foi desligado | reprovaram, aqui |
/// |---|---|
/// | `await _reporOQueOLoginRepoe();` removido de `ControladorDeSessao.abrir` | 3 casos |
/// | `_ultimoConhecido = null;` removido de `esquecerEReconciliar` | 1 caso |
///
/// A segunda isca e a que prova que zerar o estado conhecido e o ponto, e nao
/// decoracao: sem ela, `reconciliar()` devolve na comparacao e o registro nao
/// sai, exatamente como antes do conserto.
library;

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/devices_api.dart';
import 'package:bichu/api/modelos.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/avisos.dart';
import 'package:bichu/dispositivo/vigia_de_aviso.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

const String _urlBase = 'http://localhost:3000';

/// A reprovacao diz o RISCO, e nao o numero: quem ler a falha daqui a seis
/// meses precisa entender o que a pessoa perde, nao quantos corpos chegaram.
const String _semAlerta =
    'REPROVA: depois do login o aparelho NAO voltou ao cadastro de push. A '
    'pessoa entra, ve o app funcionando, e fica fora da base de alerta de pet '
    'perdido por tempo indeterminado -- sem erro na tela e sem nada falhando. '
    'Qualquer revogacao em massa no servidor apaga a linha de `user_devices` '
    'deste aparelho tambem (SEC-019), e o app e quem a repoe.';

Sessao _sessaoAberta() => Sessao(
      accessToken: 'access-da-tutora',
      refreshToken: 'refresh-da-tutora-com-mais-de-20-caracteres',
      expiraEm: DateTime.now().add(const Duration(hours: 1)),
      usuario: const Usuario(
        id: 'usuario-de-teste',
        email: 'marina@exemplo.com.br',
        emailVerificado: true,
        pendencias: <PendenciaDeCadastro>[],
        podeAbrirCaso: true,
      ),
    );

http.Response _json(Map<String, dynamic> corpo, {int status = 200}) =>
    http.Response(
      jsonEncode(corpo),
      status,
      headers: <String, String>{'content-type': 'application/json'},
    );

http.Response _sessaoDoServidor(int status) => _json(
      <String, dynamic>{
        'access_token': 'a',
        'refresh_token': 'r',
        'expires_in': 900,
        'user': <String, dynamic>{
          'id': '018f7c1e-7a2b-7c3d-9e4f-2b1a0c9d8e7f',
          'email': 'marina@exemplo.com.br',
          'email_verified': true,
        },
      },
      status: status,
    );

void main() {
  setUp(AppConfig.limparParaTeste);

  group('SEC-019 — o aparelho volta ao push depois do login', () {
    late List<Map<String, dynamic>> registros;
    late AvisosDeTeste avisos;
    late VigiaDeAviso vigia;
    late ControladorDeSessao sessao;
    late bool registroRecusado;

    setUp(() {
      registros = <Map<String, dynamic>>[];
      registroRecusado = false;
      avisos = AvisosDeTeste(PermissaoDeAviso.concedida);

      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: _urlBase),
        cliente: MockClient((requisicao) async {
          if (requisicao.url.path.endsWith('/me/devices')) {
            if (registroRecusado) return _json(<String, dynamic>{}, status: 500);
            registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
            return _json(<String, dynamic>{
              'id': '22222222-3333-4444-5555-666666666666',
              'platform': 'android',
              'push_permission': 'granted',
            });
          }
          return _json(<String, dynamic>{}, status: 404);
        }),
        tokenDeAcesso: () async => sessao.tokenValido(),
      );

      vigia = VigiaDeAviso(avisos: avisos, devices: DevicesApi(api));
      sessao = ControladorDeSessao(
        auth: AuthApi(api),
        deposito: DepositoEmMemoria(),
        aoEntrar: <AoEntrar>[vigia.esquecerEReconciliar],
      );
    });

    test(
      'O CASO DO SEC-019: o app JA sabia `concedida`, e o login registra assim mesmo',
      () async {
        // Este e o estado exato de quem acabou de usar "Sair de todos os
        // aparelhos" e entrou de novo sem matar o processo. A permissao do
        // sistema nunca mudou, entao `reconciliar()` sozinha devolve na
        // comparacao `antes == agora` e nao manda nada.
        vigia.anotar(PermissaoDeAviso.concedida);
        expect(
          registros,
          isEmpty,
          reason: 'REPROVA POR PARTIDA SUJA: algo ja tinha registrado o '
              'aparelho antes do login, e o caso mediria o registro errado.',
        );

        await sessao.abrir(_sessaoAberta());

        expect(registros, isNotEmpty, reason: _semAlerta);
        expect(
          registros.last['push_permission'],
          'granted',
          reason: 'o aparelho voltou ao cadastro dizendo outra coisa que nao '
              '`granted`: ele nao conta para o criterio 4 do ADR-0006 e a '
              'pessoa continua fora da base de alerta.',
        );
        expect(
          registros.last['push_token'],
          avisos.tokenDoAparelho,
          reason: 'o registro saiu SEM token. Permissao concedida e token '
              'ausente nao e endereco de entrega: nao ha para onde mandar.',
        );
      },
    );

    test('o registro sai tambem quando o app ainda nao sabia de nada', () async {
      // O login de quem abriu o app e foi direto entrar. `_ultimoConhecido`
      // nasce nulo, e `concedida` vale registro mesmo sem estado anterior.
      await sessao.abrir(_sessaoAberta());
      expect(registros, isNotEmpty, reason: _semAlerta);
    });

    test('o login NAO cai porque o registro do aparelho falhou', () async {
      // O contrapeso. Sem ele, a implementacao mais simples que passa nos casos
      // acima deixa a excecao subir, e quem esta sem rede -- ou com o servico
      // de aparelhos fora do ar -- nao consegue mais entrar na conta. Entrar e
      // mais importante que registrar, e a proxima retomada com permissao
      // diferente tenta de novo.
      registroRecusado = true;

      await sessao.abrir(_sessaoAberta());

      expect(sessao.logado, isTrue,
          reason: 'REPROVA: a falha ao registrar o aparelho derrubou o LOGIN. '
              'Entrar na conta nao pode depender de um registro de push.');
    });

  });

  group('SEC-019 — a FIACAO, pelo app inteiro e pela tela de login', () {
    testWidgets('entrar pela tela registra o aparelho no servidor',
        (tester) async {
      // Um vigia que funciona e que ninguem ligou ao `ControladorDeSessao`
      // passa em todos os casos do grupo acima e nao serve para nada no
      // aparelho. Este caso monta o `BichuApp` de verdade, DESLOGADO, e entra
      // pela tela de login.
      final registros = <Map<String, dynamic>>[];

      await abrirOApp(
        tester,
        avisos: AvisosDeTeste(PermissaoDeAviso.concedida),
        // Deslogado: e o unico estado a partir do qual a tela de login leva a
        // um login de verdade.
        deposito: DepositoEmMemoria(),
        rede: (requisicao) async {
          if (requisicao.url.path.endsWith('/me/devices')) {
            registros.add(jsonDecode(requisicao.body) as Map<String, dynamic>);
            return _json(<String, dynamic>{
              'id': '22222222-3333-4444-5555-666666666666',
              'platform': 'android',
              'push_permission': 'granted',
            });
          }
          if (requisicao.url.path.endsWith('/auth/login')) {
            return _sessaoDoServidor(200);
          }
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return _json(<String, dynamic>{'items': <dynamic>[]});
          }
          return _json(<String, dynamic>{}, status: 404);
        },
      );

      await irPara(tester, Rotas.entrar);
      await tester.pumpAndSettle();

      expect(
        registros,
        isEmpty,
        reason: 'REPROVA POR PARTIDA SUJA: o aparelho foi registrado ANTES do '
            'login, e o caso nao mediria o efeito do login.',
      );

      await tester.enterText(
        find.byType(TextField).at(0),
        'marina@exemplo.com.br',
      );
      await tester.enterText(find.byType(TextField).at(1), 'uma frase longa');
      await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
      await tester.pumpAndSettle();

      expect(registros, isNotEmpty, reason: _semAlerta);
      expect(registros.last['push_permission'], 'granted');
    });
  });
}
