/// Os dois `catch` da guarda deixam de ser silêncio (BICHUS-201, defeitos 2 e 3).
///
/// ## O que muda, e o que NÃO muda
///
/// Nenhum dos dois comportamentos está errado, e nenhum deles muda aqui:
///
/// - O envelope ilegível continua sendo descartado, e a pessoa continua indo
///   para o Início sem ver mensagem. Não dá para executar um envelope que não
///   se consegue ler.
/// - O estouro do executor continua levando a pessoa para a tela de retorno com
///   o rascunho carregado e sem microcopy inventada.
///
/// O que muda é que **alguém fica sabendo**. O ramo do defeito 2 tinha, desde
/// que foi escrito, o comentário "Defeito nosso: o executor estourou" — um
/// defeito que o autor sabia existir e que em produção não deixava rastro
/// nenhum.
///
/// ## A forma da isca
///
/// Cada caso reprova quando o `_relatar` correspondente é removido. Por isso
/// eles afirmam o relato **e** o desfecho de navegação juntos: um caso que só
/// olhasse a rota ficaria verde com o silêncio de volta, que é o estado que
/// esta issue existe para acabar.
library;

import 'dart:convert';

import 'package:bichu/api/falhas.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/guarda_de_acao.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

final DateTime agora = DateTime.utc(2026, 9, 18, 12);

String? rotaDaTela(String telaDeUx) => switch (telaDeUx) {
      'F1.5' => '/pets/novo/sinais',
      'F3.5' => '/achados/novo',
      _ => null,
    };

IntencaoPendente envelope({
  AcaoDeIntencao acao = AcaoDeIntencao.registrarAchado,
  String telaDeRetorno = 'F3.5',
}) {
  return IntencaoPendente(
    acao: acao,
    alvo: null,
    telaDeRetorno: telaDeRetorno,
    criadaEm: agora,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{'texto': 'estava na praça'},
    ),
  );
}

GuardaDeAcao guardaCom(
  DepositoDaIntencao deposito, {
  Map<AcaoDeIntencao, AcaoExecutavel> acoes =
      const <AcaoDeIntencao, AcaoExecutavel>{},
}) {
  return GuardaDeAcao(
    deposito: deposito,
    rotaDaTela: rotaDaTela,
    acoes: acoes,
    agora: () => agora,
  );
}

List<FlutterErrorDetails> capturarRelatos() {
  final capturados = <FlutterErrorDetails>[];
  final anterior = FlutterError.onError;
  FlutterError.onError = capturados.add;
  addTearDown(() => FlutterError.onError = anterior);
  return capturados;
}

void main() {
  group('defeito 2 — o estouro do executor chega a alguém', () {
    /// A ISCA. Apagar a chamada a `_relatar` do ramo `on Object` de
    /// `executarDepoisDoLogin` faz este caso reprovar em `hasLength(1)`.
    test('o executor que estoura fora de FalhaDeChamada sai pelo canal de erro',
        () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: AcaoExecutavel(
            // Um campo que mudou de tipo entre versões do app: exatamente o
            // que o comentário do ramo descreve.
            executar: (_) async => throw StateError('campo mudou de tipo'),
            retomar: (intencao, erro) => 'rascunho',
          ),
        },
      );
      await guarda.guardar(envelope());

      final destino = await guarda.executarDepoisDoLogin();

      expect(relatos, hasLength(1), reason: 'defeito nosso sem rastro é o defeito da issue');
      expect(relatos.single.library, 'bichu/intencao');
      expect(relatos.single.exception, isA<StateError>());

      // E o contexto tem de dizer QUAL intenção quebrou: um relato que só diz
      // "algo estourou" não permite achar o executor culpado.
      expect(relatos.single.toString(), contains('registrarAchado'));

      // O desfecho para a pessoa não mudou: tela de retorno, rascunho, sem
      // microcopy inventada.
      expect(destino, isA<DestinoDeRetorno>());
      expect((destino as DestinoDeRetorno).erro, isNull);
      expect(destino.telaDeRetorno, 'F3.5');
    });

    /// O contraste que impede a correção de virar ruído: a falha de chamada é
    /// um desfecho previsto, tem texto de tela, e **não** é defeito nosso.
    test('FalhaDeChamada NÃO vai para o canal de erro — ela já tem tela',
        () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: AcaoExecutavel(
            executar: (_) async => throw const FalhaDeConexao(),
            retomar: (intencao, erro) => 'rascunho',
          ),
        },
      );
      await guarda.guardar(envelope());

      final destino = await guarda.executarDepoisDoLogin();

      expect(relatos, isEmpty, reason: 'um canal que grita sempre é um canal ignorado');
      expect((destino as DestinoDeRetorno).erro, isNotNull);
    });

    test('execução bem-sucedida não relata nada', () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: AcaoExecutavel(
            executar: (_) async =>
                const ResultadoDaExecucao(rota: '/achados/registrado'),
            retomar: (intencao, erro) => null,
          ),
        },
      );
      await guarda.guardar(envelope());

      await guarda.executarDepoisDoLogin();

      expect(relatos, isEmpty);
    });
  });

  group('defeito 3 — o envelope corrompido deixa rastro', () {
    /// A ISCA. Apagar o `_relatar` do `on Object` de `_ler` reprova aqui.
    test('envelope ilegível é descartado E registrado', () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar('{isto nao e json valido');

      final guarda = guardaCom(deposito);
      final pendente = await guarda.pendente();

      // O comportamento continua o mesmo, e continua certo.
      expect(pendente, isNull);
      expect(await deposito.ler(), isNull, reason: 'o envelope ruim é apagado');

      // O que mudou: corrupção recorrente passa a ser contável em vez de
      // virar "às vezes a intenção some".
      expect(relatos, hasLength(1));
      expect(relatos.single.library, 'bichu/intencao');
    });

    test('envelope com campo de tipo errado também é registrado', () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar(jsonEncode(<String, dynamic>{
        'acao': 'registrar_achado',
        'tela_de_retorno': 42,
        'criada_em': agora.toIso8601String(),
      }));

      final guarda = guardaCom(deposito);

      expect(await guarda.pendente(), isNull);
      expect(relatos, hasLength(1));
    });

    /// A expiração e a tela desconhecida são descartes **previstos**, com
    /// motivo próprio, e não podem entrar no canal de defeito.
    test('envelope ausente não relata nada', () async {
      final relatos = capturarRelatos();
      final guarda = guardaCom(DepositoDeIntencaoEmMemoria());

      expect(await guarda.pendente(), isNull);
      expect(relatos, isEmpty);
    });

    test('envelope íntegro não relata nada', () async {
      final relatos = capturarRelatos();
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(deposito);
      await guarda.guardar(envelope());

      expect(await guarda.pendente(), isNotNull);
      expect(relatos, isEmpty);
    });
  });
}
