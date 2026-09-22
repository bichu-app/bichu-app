/// O refresh sai do app pelo canal do chaveiro, e nao por armazenamento comum
/// (BICHUS-15 criterio 3, reaberto por BICHUS-127).
///
/// Estes casos existem porque nenhum teste instanciava `DepositoNoChaveiro`: os
/// 11 pontos que tocam deposito de sessao usam `DepositoEmMemoria`, e trocar o
/// chaveiro por um `Map` deixava `flutter test` inteiro verde. Quem paga essa
/// conta e sempre a mesma pessoa -- a que teve o aparelho levado. Armazenamento
/// comum de app Android e legivel por qualquer processo com root e sobrevive ao
/// backup automatico para a nuvem; o refresh e a chave da conta pelo prazo de
/// inatividade inteiro. A diferenca e entre "quem pegou o aparelho precisa da
/// senha" e "quem pegou o aparelho ja esta dentro".
///
/// O QUE ESTES CASOS PROVAM, e so isto: a gravacao, a leitura e o apagamento
/// saem do app pelo canal de plataforma do `flutter_secure_storage`
/// (`plugins.it_nomads.com/flutter_secure_storage`), com a chave e o valor
/// certos. Trocar o deposito por um `Map`, por `SharedPreferences` ou por
/// arquivo silencia esse canal, e e por isso que estes casos reprovam a troca.
///
/// O QUE ELES NAO PROVAM: que o lado nativo guarde no Keychain ou no Keystore.
/// Do outro lado do canal, em `flutter test`, nao ha aparelho -- ha o dublê
/// deste arquivo. Que o plugin deposite no chaveiro de verdade so fecha em
/// teste de integracao no simulador, e ate la esta metade do criterio 3 esta
/// apoiada no plugin, nao na nossa suite.
///
/// As `options` que viajam no canal NAO sao afirmadas de proposito: o pacote
/// escolhe entre `aOptions`, `iOptions` e `mOptions` por `Platform.is...`, que
/// em `flutter test` e a maquina que roda a suite. Afirmar `encryptedShared
/// Preferences` aqui provaria o sistema operacional de quem rodou o teste, e
/// nao o app.
library;

import 'dart:convert';

import 'package:bichu/api/modelos.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// O canal do `flutter_secure_storage`. O nome e do pacote, e nao nosso: se uma
/// atualizacao do pacote o mudar, estes casos reprovam em vez de passarem a
/// afirmar nada -- que e o comportamento desejado.
const MethodChannel _canalDoChaveiro =
    MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

const String _chaveEsperada = 'bichu.sessao.v1';
const String _refresh = 'refresh-que-vale-pela-conta-inteira';

Sessao _sessao() => Sessao(
      accessToken: 'access-de-15-minutos',
      refreshToken: _refresh,
      expiraEm: DateTime.utc(2030, 1, 1),
      usuario: const Usuario(
        id: '0192f3a1-7c2b-7e3d-9a10-6b4c8d2e5f01',
        email: 'tutora@exemplo.invalid',
        emailVerificado: true,
        nome: 'Tutora',
        pendencias: [],
        podeAbrirCaso: true,
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late List<MethodCall> chamadas;
  String? doOutroLado;

  setUp(() {
    chamadas = <MethodCall>[];
    doOutroLado = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoChaveiro, (chamada) async {
      chamadas.add(chamada);
      final argumentos = chamada.arguments as Map<dynamic, dynamic>;
      switch (chamada.method) {
        case 'write':
          doOutroLado = argumentos['value'] as String?;
          return null;
        case 'read':
          return doOutroLado;
        case 'delete':
          doOutroLado = null;
          return null;
        default:
          return null;
      }
    });
  });

  tearDown(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_canalDoChaveiro, null);
  });

  Map<dynamic, dynamic> argumentosDe(MethodCall chamada) =>
      chamada.arguments as Map<dynamic, dynamic>;

  group('DepositoNoChaveiro grava pelo canal do chaveiro', () {
    test('a gravacao sai pelo canal seguro, com a chave e o refresh dentro',
        () async {
      await DepositoNoChaveiro().gravar(_sessao());

      // O caso e sobre o CAMINHO, e nao sobre o valor devolvido: `gravar` nao
      // devolve nada, e um teste que so verificasse "nao lancou" continuaria
      // verde com o chaveiro trocado por um `Map`.
      expect(chamadas.map((c) => c.method), <String>['write']);
      expect(argumentosDe(chamadas.single)['key'], _chaveEsperada);

      final gravado =
          jsonDecode(argumentosDe(chamadas.single)['value'] as String)
              as Map<String, dynamic>;
      expect(gravado['refresh_token'], _refresh);
    });

    test('a leitura tambem vem do canal, e nao de memoria do processo',
        () async {
      final deposito = DepositoNoChaveiro();
      await deposito.gravar(_sessao());
      chamadas.clear();

      final lida = await deposito.ler();

      // Sem este caso, um deposito que gravasse no chaveiro e mantivesse uma
      // copia em memoria passaria no caso de cima. O que precisa atravessar
      // aberturas do app e o que esta do outro lado do canal.
      expect(chamadas.map((c) => c.method), <String>['read']);
      expect(argumentosDe(chamadas.single)['key'], _chaveEsperada);
      expect(lida?.refreshToken, _refresh);
      expect(lida?.usuario.email, 'tutora@exemplo.invalid');
    });

    test('apagar pede a remocao ao chaveiro, e a sessao nao volta', () async {
      final deposito = DepositoNoChaveiro();
      await deposito.gravar(_sessao());
      chamadas.clear();

      await deposito.apagar();

      // No logout, deixar o refresh para tras e deixar valida a credencial que
      // a pessoa acabou de pedir para encerrar.
      expect(chamadas.map((c) => c.method), <String>['delete']);
      expect(argumentosDe(chamadas.single)['key'], _chaveEsperada);
      expect(await deposito.ler(), isNull);
    });

    test('formato de versao anterior: apaga pelo canal e pede login de novo',
        () async {
      doOutroLado = 'isto-nao-e-json-desta-versao';

      final lida = await DepositoNoChaveiro().ler();

      // Versao antiga do app nao desaparece do parque de aparelhos. A saida
      // certa e pedir login de novo; travar o arranque deixaria a pessoa com um
      // app que nao abre e sem nada a fazer a respeito.
      expect(lida, isNull);
      expect(chamadas.map((c) => c.method), <String>['read', 'delete']);
    });
  });
}
