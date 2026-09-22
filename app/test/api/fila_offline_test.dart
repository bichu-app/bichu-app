/// A fila de ações sem conexão (BICHUS-31, critérios 1 e 13).
///
/// O caso central é o **critério 13**, e ele é o mais fácil de escrever errado:
/// o reenvio precisa usar a `Idempotency-Key` da PRIMEIRA tentativa. Gerar uma
/// chave nova no reenvio funciona perfeitamente em todo teste de "a ação sai" —
/// e produz o tutor recebendo o mesmo aviso quatro vezes, ou o mesmo pet
/// entrando duas vezes no cadastro, sem nenhum erro em lugar nenhum.
library;

import 'dart:convert';

import 'package:bichu/api/fila_offline.dart';
import 'package:flutter_test/flutter_test.dart';

/// Depósito em memória que imita o arquivo, inclusive entre "aberturas do app".
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

AcaoEnfileirada acao(String id, {String chave = 'k-1', int tentativas = 0}) =>
    AcaoEnfileirada(
      id: id,
      metodo: 'POST',
      caminho: '/pets',
      corpo: <String, dynamic>{'name': 'Mel'},
      idempotencyKey: chave,
      criadaEm: DateTime.utc(2026, 9, 18, 12),
      tentativas: tentativas,
    );

void main() {
  group('critério 13 — a mesma Idempotency-Key', () {
    test('o reenvio usa a chave da PRIMEIRA tentativa', () async {
      final deposito = DepositoFalso();
      final fila = FilaOffline(deposito: deposito);
      await fila.enfileirar(acao('a-1', chave: 'chave-original'));

      final chavesVistas = <String>[];
      await fila.reenviarTudo((a) async {
        chavesVistas.add(a.idempotencyKey);
        return ResultadoDoEnvio.semSinal;
      });
      await fila.reenviarTudo((a) async {
        chavesVistas.add(a.idempotencyKey);
        return ResultadoDoEnvio.entregue;
      });

      // Duas tentativas, UMA chave. Chave nova no reenvio faria o servidor
      // tratar cada tentativa como pedido novo.
      expect(chavesVistas, <String>['chave-original', 'chave-original']);
    });

    test('a chave sobrevive à serialização em disco', () async {
      final deposito = DepositoFalso();
      await FilaOffline(deposito: deposito).enfileirar(acao('a-1', chave: 'k-guardada'));

      // Outra instância, como se o app tivesse sido encerrado e reaberto.
      final depoisDeReabrir = await FilaOffline(deposito: deposito).pendentes();
      expect(depoisDeReabrir.single.idempotencyKey, 'k-guardada');
    });
  });

  group('critério 1 — sobrevive ao app ser encerrado', () {
    test('o que foi enfileirado é lido por uma instância nova', () async {
      final deposito = DepositoFalso();
      await FilaOffline(deposito: deposito).enfileirar(acao('a-1'));
      await FilaOffline(deposito: deposito).enfileirar(acao('a-2'));

      final pendentes = await FilaOffline(deposito: deposito).pendentes();
      expect(pendentes.map((a) => a.id), <String>['a-1', 'a-2']);
    });

    test('arquivo corrompido não derruba o app: fila começa vazia', () async {
      // Perder a fila é ruim; não abrir é pior — a pessoa perderia o acesso ao
      // cadastro inteiro por causa de um arquivo.
      final fila = FilaOffline(deposito: DepositoFalso('isto não é json'));
      expect(await fila.pendentes(), isEmpty);
    });

    test('o corpo da ação sobrevive inteiro', () async {
      final deposito = DepositoFalso();
      await FilaOffline(deposito: deposito).enfileirar(acao('a-1'));
      final lida = (await FilaOffline(deposito: deposito).pendentes()).single;
      expect(lida.corpo['name'], 'Mel');
      expect(lida.caminho, '/pets');
    });

    test('grava caminho RELATIVO, nunca a URL inteira', () async {
      // URL gravada carregaria o ambiente do dia em que a ação foi enfileirada,
      // que pode ser outro quando ela sair.
      final deposito = DepositoFalso();
      await FilaOffline(deposito: deposito).enfileirar(acao('a-1'));
      expect(deposito.conteudo, isNot(contains('http')));
    });
  });

  group('ordem e parada', () {
    test('envia NA ORDEM em que entrou', () async {
      // Criar o pet e depois marcar como perdido só funciona nessa sequência.
      final deposito = DepositoFalso();
      final fila = FilaOffline(deposito: deposito);
      for (final id in <String>['a-1', 'a-2', 'a-3']) {
        await fila.enfileirar(acao(id));
      }

      final ordem = <String>[];
      await fila.reenviarTudo((a) async {
        ordem.add(a.id);
        return ResultadoDoEnvio.entregue;
      });
      expect(ordem, <String>['a-1', 'a-2', 'a-3']);
    });

    test('PARA na primeira sem sinal, e as seguintes ficam', () async {
      final deposito = DepositoFalso();
      final fila = FilaOffline(deposito: deposito);
      for (final id in <String>['a-1', 'a-2', 'a-3']) {
        await fila.enfileirar(acao(id));
      }

      var vistas = 0;
      final entregues = await fila.reenviarTudo((a) async {
        vistas += 1;
        return a.id == 'a-2' ? ResultadoDoEnvio.semSinal : ResultadoDoEnvio.entregue;
      });

      expect(entregues, 1);
      expect(vistas, 2, reason: 'insistiu depois de perder o sinal');
      expect((await fila.pendentes()).map((a) => a.id), <String>['a-2', 'a-3']);
    });

    test('recusa definitiva SAI da fila, em vez de repetir para sempre', () async {
      final deposito = DepositoFalso();
      final fila = FilaOffline(deposito: deposito);
      await fila.enfileirar(acao('a-1'));

      final entregues = await fila.reenviarTudo((a) async => ResultadoDoEnvio.recusada);
      expect(entregues, 0, reason: 'recusada não conta como entregue');
      expect(await fila.pendentes(), isEmpty, reason: 'ficaria repetindo para sempre');
    });
  });

  group('teto da fila', () {
    test('o aparelho que passou a semana sem sinal não enche o armazenamento', () async {
      final deposito = DepositoFalso();
      final fila = FilaOffline(deposito: deposito);
      for (var i = 0; i < FilaOffline.teto + 5; i += 1) {
        await fila.enfileirar(acao('a-$i'));
      }

      final pendentes = await fila.pendentes();
      expect(pendentes.length, FilaOffline.teto);
      // A mais ANTIGA sai; a recém-disparada é a que a pessoa está esperando.
      expect(pendentes.first.id, 'a-5');
      expect(pendentes.last.id, 'a-${FilaOffline.teto + 4}');
    });
  });

  group('formato em disco', () {
    test('é JSON legível, para quem for depurar em campo', () async {
      final deposito = DepositoFalso();
      await FilaOffline(deposito: deposito).enfileirar(acao('a-1'));
      final lido = jsonDecode(deposito.conteudo!) as List<dynamic>;
      expect(lido.single, containsPair('idempotency_key', 'k-1'));
    });
  });
}
