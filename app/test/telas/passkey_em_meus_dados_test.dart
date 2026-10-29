// ISCA DA BICHUS-301 (28/10/2026): A PORTA DO LOGIN POR DIGITAL EM
// `Meus dados`.
//
// Relato do cliente: *"quando eu fiz o login ele nao pediu pra eu logar com a
// digital"*. A causa medida: **`abas.dart` tinha ZERO mencoes a passkey**, e as
// unicas duas telas que falavam dela eram o convite depois do cadastro e a
// tentativa ao abrir a tela de entrar. **Quem ja tem conta nunca conseguia
// ativar.**
//
// ## SAO DUAS ENTRADAS PARA UM CAMINHO SO
//
// Esta tela e a porta de quem quer ligar **quando quiser**; o convite depois do
// login (`sessao/convite_de_passkey_depois_do_login_test.dart`) e para quem nao
// ligou e nao recusou. **O fluxo de ativacao e o MESMO nos dois** --
// `FiacaoDoPasskey.oferecerCadastro`, que ja existia e e o que o cadastro usa.
// Dois jeitos de registrar credencial seriam dois lugares onde a marca local
// pode deixar de ser gravada.
//
// ## A ROTA EXIGE SESSAO, E AQUI ISSO E A FAVOR
//
// `tela_criar_conta.dart` registra que `beginPasskeyRegistration` **exige
// sessao e tira a conta do `sub`**. Em `Meus dados` a pessoa esta logada por
// definicao, entao a ativacao e mais simples aqui do que no cadastro.
//
// ## MOSTRA O ESTADO, E NAO SO O BOTAO
//
// Quatro estados, e cada um tem caso: ativada neste aparelho; nao ativada;
// **existe na conta mas nao neste aparelho** (sincronizacao, troca de celular);
// e aparelho sem biometria, que e estado normal e nao erro.
library;

import 'dart:convert';

import 'package:bichu/api/modelos_passkey.dart';
import 'package:bichu/dispositivo/credencial_do_aparelho.dart';
import 'package:bichu/dispositivo/passkey_neste_aparelho.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Um aparelho que SUPORTA passkey, para o caminho que `SemPasskeyNesteBuild`
/// nao alcanca.
///
/// `abrirOApp` usa `SemPasskeyNesteBuild` por padrao, e e o padrao certo para a
/// suite -- mas ele responde "nao suporto", que e justamente o estado 4. Os
/// casos dos outros estados precisam de um aparelho que diga sim.
class _AparelhoQueSuporta implements CredencialDoAparelho {
  @override
  Future<bool> suportaCredencial() async => true;

  @override
  Future<CredencialCadastrada> cadastrar(
    OpcoesDeCadastroDePasskey opcoes,
  ) async =>
      const CredencialCadastrada(
        id: 'cred-1',
        rawId: 'cred-1',
        clientDataJson: 'cdj',
        attestationObject: 'ao',
        transportes: <String>['internal'],
      );

  @override
  Future<CredencialAssinada> assinar(OpcoesDeEntradaPorPasskey opcoes) =>
      throw const SemCredencialNoAparelho();
}

/// Quantas credenciais o servidor diz que a CONTA tem.
int _credenciaisNaConta = 0;

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'handle': 'marina',
      'phone_e164': '+5511987654321',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  if (req.url.path == '/v1/auth/passkeys' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        for (var i = 0; i < _credenciaisNaConta; i++)
          <String, dynamic>{
            'id': 'pk-$i',
            'label': 'Aparelho $i',
            'created_at': '2026-10-01T10:00:00Z',
            'last_used_at': null,
          },
      ],
    });
  }
  if (req.url.path == '/v1/connections/summary' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'connected_count': 0,
      'pending_sent_count': 0,
      'requests_received_count': 0,
      'remaining_requests_today': 5,
      'connection_limit': 150,
      'invited_joined_count': 0,
    });
  }
  return problema('not-found', 404);
}

Future<void> _abrirMeusDados(
  WidgetTester tester, {
  bool jaMarcadoNesteAparelho = false,
  bool aparelhoSuporta = true,
}) async {
  tester.view.physicalSize = const Size(1170, 7800);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await abrirOApp(
    tester,
    rede: _servidor,
    deposito: depositoLogado(),
    // O aparelho e a marca local sao os DOIS eixos do estado desta secao, e os
    // dois ja sao parametros de `abrirOApp` -- nenhum ajudante novo.
    credencialDoAparelho:
        aparelhoSuporta ? _AparelhoQueSuporta() : const SemPasskeyNesteBuild(),
    depositoDePasskeyNoAparelho: DepositoDePasskeyEmMemoria(
      conteudo: jaMarcadoNesteAparelho
          ? jsonEncode(<String, dynamic>{
              'ha_credencial': true,
              'marcado_em': '2026-10-27T10:00:00.000Z',
            })
          : null,
    ),
  );
  await irPara(tester, Rotas.dadosPessoais);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => _credenciaisNaConta = 0);

  testWidgets('a secao do login por digital esta em `Meus dados`',
      (tester) async {
    await _abrirMeusDados(tester);

    expect(
      find.text(TelaDadosPessoais.tituloDoPasskey),
      findsOneWidget,
      reason: 'REPROVA: `Meus dados` nao tem a secao do login por digital. '
          'MEDIDO: `abas.dart` tinha ZERO mencoes a passkey e as duas telas '
          'que falavam dela eram o cadastro e a entrada -- quem JA tem conta '
          'nunca conseguia ativar, e a funcionalidade equivalia a nao '
          'existir.',
    );
  });

  testWidgets('NAO ativada: a secao oferece ATIVAR', (tester) async {
    await _abrirMeusDados(tester);

    expect(
      find.text(TelaDadosPessoais.ativarOPasskey),
      findsOneWidget,
      reason: 'REPROVA: nao ha acao de ativar para quem nao tem credencial '
          'neste aparelho. Esta e a porta de quem quer ligar quando quiser.',
    );
    expect(
      find.text(TelaDadosPessoais.passkeyAtivado),
      findsNothing,
      reason: 'REPROVA: a secao afirma que o login por digital esta ativo num '
          'aparelho que nao tem credencial nenhuma.',
    );
  });

  testWidgets('ATIVADA neste aparelho: a secao diz o ESTADO, e nao oferece',
      (tester) async {
    await _abrirMeusDados(tester, jaMarcadoNesteAparelho: true);

    expect(
      find.text(TelaDadosPessoais.passkeyAtivado),
      findsOneWidget,
      reason: 'REPROVA: a secao nao diz que o login por digital esta ativo '
          'neste aparelho. O cliente pediu o ESTADO e nao so o botao: sem '
          'ele a pessoa nao tem como saber se ja ligou.',
    );
    expect(
      find.text(TelaDadosPessoais.ativarOPasskey),
      findsNothing,
      reason: 'REPROVA: ofereceu ATIVAR a quem ja tem credencial neste '
          'aparelho -- criaria uma segunda credencial por nada.',
    );
  });

  testWidgets(
    'EXISTE NA CONTA mas nao neste aparelho: o texto DIZ isso',
    (tester) async {
      // O caso de sincronizacao, troca de celular ou restauracao de backup.
      // Oferecer "ativar" aqui como se nao houvesse nada seria mentir sobre o
      // que a conta tem -- e o conserto certo e `reconciliarComAConta`, que
      // MARCA o aparelho em vez de criar credencial redundante.
      _credenciaisNaConta = 1;
      await _abrirMeusDados(tester);

      expect(
        find.text(TelaDadosPessoais.passkeyNaContaNaoNesteAparelho),
        findsOneWidget,
        reason: 'REPROVA: a secao trata "credencial na conta, nao neste '
            'aparelho" como "nao tem". Sao estados diferentes, e o cliente '
            'pediu que o texto dissesse isso em vez de oferecer ativar como '
            'se nao houvesse nada.',
      );
    },
  );

  testWidgets(
    'APARELHO SEM BIOMETRIA: estado normal, e nenhuma promessa',
    (tester) async {
      await _abrirMeusDados(tester, aparelhoSuporta: false);

      expect(
        find.text(TelaDadosPessoais.ativarOPasskey),
        findsNothing,
        reason: 'REPROVA: ofereceu ativar num aparelho que o sistema vai '
            'recusar. Indisponibilidade e estado NORMAL e nao erro -- a '
            'pessoa nao pode ver uma promessa que a folha do sistema vai '
            'negar.',
      );
      expect(
        find.text(TelaDadosPessoais.passkeyIndisponivel),
        findsOneWidget,
        reason: 'REPROVA: o aparelho sem biometria nao recebe explicacao '
            'nenhuma. Estado vazio sem texto e a pessoa sem saber por que a '
            'funcao nao esta ali.',
      );
    },
  );
}
