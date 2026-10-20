// A cidade guardada no aparelho, e o que acontece quando o armazenamento falha.
//
// Este arquivo existe por causa de UMA linha do pedido do cliente: *"guarde a
// ultima cidade escolhida no aparelho ... e trate a leitura falhando: em
// aparelho com armazenamento bloqueado isso estoura, e a tela tem de abrir
// normalmente com o campo vazio"*.
//
// `getApplicationDocumentsDirectory()` e canal de plataforma. Em aparelho com
// armazenamento bloqueado, em perfil restrito, em teste de widget e no primeiro
// arranque de um build sem o plugin registrado, ele ESTOURA. A isca do
// desligamento esta nomeada em cada caso.

import 'package:bichu/sessao/cidade_escolhida.dart';
import 'package:flutter_test/flutter_test.dart';

/// Um deposito que estoura com `Error`, e nao com `Exception`.
///
/// Existe separado de `DepositoDaCidadeQueFalha` porque os dois modos de falhar
/// sao diferentes de verdade: canal de plataforma ausente produz
/// `MissingPluginException` em alguns caminhos e `Error` em outros, e um `catch`
/// que so pega `Exception` deixaria o segundo passar. Sem este duble, trocar
/// `on Object` por `on Exception` em `cidade_escolhida.dart` continuaria verde.
class DepositoQueEstouraComErro implements DepositoDaCidade {
  const DepositoQueEstouraComErro();

  @override
  Future<String?> ler() async => throw StateError('canal de plataforma ausente');

  @override
  Future<void> gravar(String conteudo) async =>
      throw StateError('canal de plataforma ausente');
}

void main() {
  group('a cidade vai e volta do aparelho', () {
    test('guardar e ler devolve a mesma cidade, aparada', () async {
      final deposito = DepositoDaCidadeEmMemoria();
      final guardada = CidadeEscolhida(deposito: deposito);

      await guardada.guardar('  Campinas  ');
      expect(deposito.conteudo, 'Campinas');
      expect(await guardada.ler(), 'Campinas');
    });

    test('nunca guardou: a leitura devolve nulo, e nao texto vazio', () async {
      final guardada = CidadeEscolhida(deposito: DepositoDaCidadeEmMemoria());
      expect(await guardada.ler(), isNull);
    });

    test('texto vazio no arquivo tambem e nulo: ausencia nao e `\'\'`', () async {
      // `''` numa query string e um recorte que o servidor recusa com 400, e a
      // pessoa leria uma falha de servidor onde falta um dado dela.
      final guardada = CidadeEscolhida(
        deposito: DepositoDaCidadeEmMemoria(conteudo: '   '),
      );
      expect(await guardada.ler(), isNull);
    });

    test('cidade vazia NAO e guardada', () async {
      final deposito = DepositoDaCidadeEmMemoria();
      await CidadeEscolhida(deposito: deposito).guardar('   ');
      expect(deposito.gravacoes, 0);
    });

    test('texto acima do teto do contrato nao e guardado nem lido', () async {
      // `maxLength: 80` em `city`. Texto maior que isso no arquivo e lixo de uma
      // versao que nao existe, e nao uma cidade.
      final longo = 'C' * 81;
      final deposito = DepositoDaCidadeEmMemoria(conteudo: longo);
      expect(await CidadeEscolhida(deposito: deposito).ler(), isNull);

      final outro = DepositoDaCidadeEmMemoria();
      await CidadeEscolhida(deposito: outro).guardar(longo);
      expect(outro.gravacoes, 0);
    });
  });

  group('ISCA: o armazenamento falhando nao derruba nada', () {
    // DESLIGANDO: apague o `try`/`on Object` de `CidadeEscolhida.ler` ou de
    // `.guardar`, em `lib/sessao/cidade_escolhida.dart`. Os quatro casos abaixo
    // reprovam com a excecao escapando.
    for (final (rotulo, deposito) in <(String, DepositoDaCidade)>[
      ('FileSystemException', DepositoDaCidadeQueFalha()),
      ('Error', DepositoQueEstouraComErro()),
    ]) {
      test('$rotulo na leitura: devolve nulo em vez de lancar', () async {
        final guardada = CidadeEscolhida(deposito: deposito);
        await expectLater(guardada.ler(), completion(isNull));
      });

      test('$rotulo na gravacao: nao lanca', () async {
        final guardada = CidadeEscolhida(deposito: deposito);
        await expectLater(guardada.guardar('Campinas'), completes);
      });
    }
  });
}
