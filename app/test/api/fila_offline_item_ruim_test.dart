/// Um item malformado no meio da fila, e os demais têm que sobreviver
/// (BICHUS-201, defeito 1).
///
/// ## Por que este arquivo existe separado
///
/// A isca que decide este defeito **não é** "não estourou". Um teste que
/// conferisse ausência de exceção fica verde com o descarte em massa de pé, que
/// era o estado até esta correção: o `on FormatException` devolvia `[]` sem
/// levantar nada, e a fila inteira sumia calada.
///
/// O que tem de ser afirmado é a **sobrevivência dos outros itens**, e o item
/// ruim fica no **meio** de propósito: no fim, uma implementação que parasse na
/// primeira falha passaria; no começo, uma que abortasse a lista toda ainda
/// pareceria razoável. No meio, só passa quem descarta item a item.
///
/// ## O custo que isto representa
///
/// A pessoa está no elevador, sem sinal, e dispara o alerta de que o pet dela
/// sumiu. O alerta entra na fila. Se um item malformado leva todos junto, o
/// alerta some e nada fica registrado — e a fila existe exatamente para isso
/// não acontecer.
library;

import 'dart:convert';

import 'package:bichu/api/fila_offline.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

class DepositoFalso implements DepositoDaFila {
  DepositoFalso([this.conteudo]);

  String? conteudo;
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String novo) async {
    conteudo = novo;
    gravacoes += 1;
  }
}

Map<String, dynamic> itemBom(String id) => <String, dynamic>{
      'id': id,
      'metodo': 'POST',
      'caminho': '/pets',
      'corpo': <String, dynamic>{'name': 'Mel'},
      'idempotency_key': 'k-$id',
      'criada_em': '2026-09-18T12:00:00.000Z',
      'tentativas': 0,
    };

/// Captura o que sai pelo canal de erro do app, e devolve o canal no fim.
List<FlutterErrorDetails> capturarRelatos() {
  final capturados = <FlutterErrorDetails>[];
  final anterior = FlutterError.onError;
  FlutterError.onError = capturados.add;
  addTearDown(() => FlutterError.onError = anterior);
  return capturados;
}

void main() {
  group('BICHUS-201 defeito 1 — o item ruim não leva os outros junto', () {
    /// A ISCA. Com o `on FormatException` antigo de volta em `pendentes()`,
    /// este caso reprova em `hasLength(3)`, que vira 0 — a fila inteira.
    test('item malformado NO MEIO é descartado sozinho; os demais sobrevivem',
        () async {
      capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        itemBom('antes-1'),
        itemBom('antes-2'),
        // O item ruim: `criada_em` não é data. `DateTime.parse` levanta
        // `FormatException` bem no meio da lista.
        <String, dynamic>{...itemBom('ruim'), 'criada_em': 'nao-e-uma-data'},
        itemBom('depois-1'),
      ]));

      final pendentes = await FilaOffline(deposito: deposito).pendentes();

      expect(
        pendentes.map((a) => a.id).toList(),
        <String>['antes-1', 'antes-2', 'depois-1'],
        reason: 'os três itens íntegros precisam sobreviver, e na ordem em que entraram',
      );
    });

    test('o alerta de pet perdido enfileirado DEPOIS do item ruim continua lá',
        () async {
      // O caso da issue, escrito como a pessoa o vive. Sem isto, os IDs acima
      // seriam só strings e ninguém lembraria do que está em jogo.
      capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        <String, dynamic>{...itemBom('ruim'), 'criada_em': 'nao-e-uma-data'},
        <String, dynamic>{
          ...itemBom('alerta'),
          'caminho': '/pets/p-1/lost-cases',
        },
      ]));

      final pendentes = await FilaOffline(deposito: deposito).pendentes();

      expect(pendentes, hasLength(1));
      expect(pendentes.single.caminho, '/pets/p-1/lost-cases');
    });

    test('o item ruim some do disco na próxima mutação, sem regravar na leitura',
        () async {
      capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        <String, dynamic>{...itemBom('ruim'), 'criada_em': 'nao-e-uma-data'},
        itemBom('bom'),
      ]));
      final fila = FilaOffline(deposito: deposito);

      await fila.pendentes();
      expect(deposito.gravacoes, 0, reason: 'leitura não grava');

      await fila.enfileirar(AcaoEnfileirada(
        id: 'novo',
        metodo: 'POST',
        caminho: '/pets',
        corpo: const <String, dynamic>{},
        idempotencyKey: 'k-novo',
        criadaEm: DateTime.utc(2026, 9, 18, 13),
      ));

      final regravado = jsonDecode(deposito.conteudo!) as List<dynamic>;
      expect(
        regravado.map((e) => (e as Map)['id']).toList(),
        <String>['bom', 'novo'],
        reason: 'o item ilegível não volta para o disco',
      );
    });

    /// Achado junto da correção: `AcaoEnfileirada.deJson` converte com
    /// `as String` e `as Map`, que levantam `TypeError`. O `on FormatException`
    /// antigo não cobria essa classe — ela subia e derrubava quem chamasse.
    test('item com campo de TIPO errado também é descartado sozinho, e não sobe',
        () async {
      capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        <String, dynamic>{...itemBom('ruim'), 'metodo': 42},
        itemBom('bom'),
      ]));

      final pendentes = await FilaOffline(deposito: deposito).pendentes();

      expect(pendentes.map((a) => a.id).toList(), <String>['bom']);
    });
  });

  group('BICHUS-201 defeito 1 — a perda deixa de ser silenciosa', () {
    /// A ISCA do registro: apagar a chamada a `_relatar` faz este caso reprovar.
    test('o descarte de um item sai pelo canal de erro, com a contagem',
        () async {
      final relatos = capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        <String, dynamic>{...itemBom('ruim'), 'criada_em': 'nao-e-uma-data'},
        itemBom('bom'),
      ]));

      await FilaOffline(deposito: deposito).pendentes();

      expect(relatos, hasLength(1), reason: 'perda silenciosa é o defeito desta issue');
      expect(relatos.single.library, 'bichu/fila_offline');

      final texto = relatos.single.toString();
      expect(texto, contains('descartados: 1'));
      expect(texto, contains('mantidos: 1'));
    });

    test('a fila inteira ilegível é um EVENTO, e não um `return []` calado',
        () async {
      final relatos = capturarRelatos();
      final deposito = DepositoFalso('isto nao e json');

      final pendentes = await FilaOffline(deposito: deposito).pendentes();

      // O comportamento continua certo: começar vazia é melhor que não abrir.
      expect(pendentes, isEmpty);
      // O que mudou é que alguém fica sabendo.
      expect(relatos, hasLength(1));
      expect(relatos.single.library, 'bichu/fila_offline');
      expect(relatos.single.toString(), contains('ilegível'));
    });

    test('o relato NÃO carrega o que a pessoa digitou', () async {
      // O corpo de uma ação enfileirada tem nome do pet, endereço e telefone, e
      // o relato sai do aparelho. Contagem, sim; conteúdo, nunca.
      final relatos = capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[
        <String, dynamic>{
          ...itemBom('ruim'),
          'corpo': <String, dynamic>{'name': 'Bidu', 'phone': '+5511999998888'},
          'criada_em': 'nao-e-uma-data',
        },
        itemBom('bom'),
      ]));

      await FilaOffline(deposito: deposito).pendentes();

      final texto = relatos.single.toString();
      expect(texto, isNot(contains('Bidu')));
      expect(texto, isNot(contains('999998888')));
    });

    test('fila íntegra não relata nada — um canal que grita sempre é ignorado',
        () async {
      final relatos = capturarRelatos();
      final deposito = DepositoFalso(jsonEncode(<dynamic>[itemBom('a'), itemBom('b')]));

      final pendentes = await FilaOffline(deposito: deposito).pendentes();

      expect(pendentes, hasLength(2));
      expect(relatos, isEmpty);
    });
  });
}
