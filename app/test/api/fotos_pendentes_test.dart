// O registro das fotos que ainda nao subiram.
//
// O QUE ESTE ARQUIVO GUARDA, e por que cada caso existe:
//
// A `FilaOffline` teve, ate a BICHUS-201, um defeito que e o oposto exato do
// proposito dela: um item malformado descartava a lista **inteira**, em
// silencio, porque a decodificacao estava toda dentro de um `try` so. Esta
// classe nasceu depois disso e escreveu a regra certa desde o comeco -- e uma
// regra certa sem caso que a exercite e uma frase no cabecalho que a proxima
// refatoracao apaga sem nada ficar vermelho.
//
// O caso do logout NAO esta aqui, e isso e deliberado: ele mede EFEITO no app
// montado (depois de `sair()`, o arquivo esta vazio) e mora em
// `test/telas/a_foto_sobe_de_verdade_test.dart`, registrado em `iscasDaLista`
// de `test/sessao/limpezas_ao_sair_test.dart`. Um caso aqui que chamasse
// `limpar()` direto provaria que o metodo funciona, e nao que o logout o
// chama -- que e a unica coisa que interessa.

import 'dart:convert';

import 'package:bichu/api/fotos_pendentes.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

class _DepositoEmMemoria implements DepositoDeFotosPendentes {
  String? conteudo;
  int gravacoes = 0;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    gravacoes += 1;
    conteudo = texto;
  }
}

FotoPendente _pendente(String petId, {String caminho = '/tmp/a.jpg'}) {
  return FotoPendente(
    petId: petId,
    foto: FotoLocal(
      caminho: caminho,
      tipoDeConteudo: 'image/jpeg',
      tamanhoEmBytes: 100,
    ),
    criadaEm: DateTime.utc(2026, 9, 22, 18),
  );
}

Map<String, dynamic> _cru(String petId, {String caminho = '/tmp/a.jpg'}) {
  return <String, dynamic>{
    'pet_id': petId,
    'caminho': caminho,
    'tipo_de_conteudo': 'image/jpeg',
    'tamanho_em_bytes': 100,
    'criada_em': '2026-09-22T18:00:00.000Z',
  };
}

void main() {
  group('um item ruim nao leva os outros junto', () {
    test('o item malformado e descartado SOZINHO', () async {
      final deposito = _DepositoEmMemoria()
        ..conteudo = jsonEncode(<Object>[
          _cru('p-1'),
          // Sem `caminho`: `deJson` estoura `TypeError` no `as String`, e nao
          // `FormatException`. O `catch` tem de ser `on Object` -- um
          // `on FormatException` deixaria este caso derrubar quem chamasse.
          <String, dynamic>{'pet_id': 'p-2'},
          _cru('p-3'),
        ]);
      final registro = FotosPendentes(deposito: deposito);

      final pendentes = await _semRuido(registro.pendentes);

      expect(
        pendentes.map((f) => f.petId).toList(),
        <String>['p-1', 'p-3'],
        reason: 'REPROVA: o item ruim levou os bons junto. E o defeito que a '
            'BICHUS-201 achou na fila offline, escrito de novo por copia: a '
            'foto que a pessoa escolheu sem sinal sumiria por causa de um '
            'vizinho quebrado, sem nada acusar.',
      );
    });

    test('o documento que nao e lista comeca vazio, mas RELATA', () async {
      final deposito = _DepositoEmMemoria()..conteudo = '{"nao":"e lista"}';
      final registro = FotosPendentes(deposito: deposito);

      final erros = <FlutterErrorDetails>[];
      final anterior = FlutterError.onError;
      FlutterError.onError = erros.add;
      final pendentes = await registro.pendentes();
      FlutterError.onError = anterior;

      expect(pendentes, isEmpty);
      expect(
        erros,
        hasLength(1),
        reason: 'REPROVA: a perda saiu por um `return []` calado. Perda '
            'silenciosa e exatamente o que esta classe existe para nao '
            'repetir.',
      );
    });

    test('a leitura NAO grava: item ruim some so na proxima mutacao',
        () async {
      final deposito = _DepositoEmMemoria()
        ..conteudo = jsonEncode(<Object>[<String, dynamic>{'pet_id': 'p-2'}]);
      final registro = FotosPendentes(deposito: deposito);

      await _semRuido(registro.pendentes);

      expect(
        deposito.gravacoes,
        0,
        reason: 'REPROVA: `pendentes()` gravou. Leitura que grava surpreende '
            'quem chama e pode falhar na abertura do app, que e quando ela '
            'roda.',
      );
    });
  });

  group('uma foto por pet', () {
    test('a segunda escolha para o mesmo pet SUBSTITUI a primeira', () async {
      final deposito = _DepositoEmMemoria();
      final registro = FotosPendentes(deposito: deposito);

      await registro.guardar(_pendente('p-1', caminho: '/tmp/velha.jpg'));
      await registro.guardar(_pendente('p-1', caminho: '/tmp/nova.jpg'));

      final pendentes = await registro.pendentes();
      expect(
        pendentes,
        hasLength(1),
        reason: 'REPROVA: as duas ficaram, e a varredura do arranque subiria '
            'as duas. O pet ganharia uma foto que a pessoa trocou de '
            'proposito.',
      );
      expect(pendentes.single.foto.caminho, '/tmp/nova.jpg');
    });

    test('pets diferentes convivem', () async {
      final registro = FotosPendentes(deposito: _DepositoEmMemoria());
      await registro.guardar(_pendente('p-1'));
      await registro.guardar(_pendente('p-2'));
      expect((await registro.pendentes()).map((f) => f.petId), <String>[
        'p-1',
        'p-2',
      ]);
    });

    test('`remover` tira so o pet nomeado', () async {
      final registro = FotosPendentes(deposito: _DepositoEmMemoria());
      await registro.guardar(_pendente('p-1'));
      await registro.guardar(_pendente('p-2'));

      await registro.remover('p-1');

      expect((await registro.pendentes()).single.petId, 'p-2');
    });
  });

  group('o teto existe contra o aparelho que passa a semana sem sinal', () {
    test('acima do teto, a mais antiga sai', () async {
      final registro = FotosPendentes(deposito: _DepositoEmMemoria());
      for (var i = 0; i <= FotosPendentes.teto; i += 1) {
        await registro.guardar(_pendente('p-$i'));
      }

      final pendentes = await registro.pendentes();
      expect(pendentes, hasLength(FotosPendentes.teto));
      expect(
        pendentes.first.petId,
        'p-1',
        reason: 'REPROVA: o teto derrubou a mais NOVA. Quem acabou de '
            'escolher a foto e quem esta olhando para a tela.',
      );
    });
  });

  group('`limpar` zera a memoria ANTES de gravar', () {
    test('disco cheio no logout: a memoria fica limpa mesmo assim', () async {
      final deposito = _DepositoQueRecusaGravar();
      final registro = FotosPendentes(deposito: deposito);
      deposito.recusar = false;
      await registro.guardar(_pendente('p-1'));
      deposito.recusar = true;

      await expectLater(registro.limpar(), throwsA(isA<Exception>()));

      // Mesmo com a gravacao recusada, o que fica em pe e um app SEM o dado da
      // conta anterior em memoria. A ordem inversa deixaria o caminho da foto
      // da tutora anterior vivo na sessao seguinte.
      deposito.recusar = false;
      expect(await registro.pendentes(), isEmpty);
    });
  });
}

class _DepositoQueRecusaGravar implements DepositoDeFotosPendentes {
  String? conteudo;
  bool recusar = false;

  @override
  Future<String?> ler() async => conteudo;

  @override
  Future<void> gravar(String texto) async {
    if (recusar) throw const FormatException('disco cheio');
    conteudo = texto;
  }
}

/// Roda sem o observador padrao transformar o relato em falha do caso.
///
/// `_relatar` chama `FlutterError.reportError` de proposito -- perda de dado
/// tem de sair pelo canal de erro. Em teste, o observador padrao trata isso
/// como reprovacao, e o caso que exercita o descarte reprovaria pelo relato
/// que ele mesmo pediu.
Future<T> _semRuido<T>(Future<T> Function() acao) async {
  final anterior = FlutterError.onError;
  FlutterError.onError = (_) {};
  try {
    return await acao();
  } finally {
    FlutterError.onError = anterior;
  }
}
