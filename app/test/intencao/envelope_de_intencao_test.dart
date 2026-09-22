/// O formato do envelope de intenção pendente (UX 8.3, BICHU-30).
///
/// **Por que este arquivo existe.** As regras 5 e 6 da seção 8.3 são as duas
/// que não quebram nada no simulador e quebram tudo no aparelho de quem usa o
/// produto:
///
/// - Guardar os **bytes** da foto em vez do caminho passa em qualquer teste de
///   "o envelope sobreviveu": o JSON é maior, e só. No aparelho antigo com a
///   memória no limite — que é exatamente o aparelho em que o sistema encerra
///   o app e o envelope precisa existir — a serialização estoura e a pessoa
///   perde tudo o que escreveu.
/// - Guardar a coordenada **sem o carimbo de tempo** também passa: a
///   localização está lá. E o caso de pet perdido é aberto no lugar onde a
///   pessoa estava há três horas, e a busca acontece em volta desse lugar.
///
/// Cada caso abaixo reprova se a regra for invertida.
library;

import 'dart:convert';

import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:flutter_test/flutter_test.dart';

IntencaoPendente envelope({
  AcaoDeIntencao acao = AcaoDeIntencao.registrarAchado,
  String telaDeRetorno = 'F1.5',
  DateTime? criadaEm,
  RascunhoDaIntencao? rascunho,
  String? alvo,
}) {
  return IntencaoPendente(
    acao: acao,
    alvo: alvo,
    telaDeRetorno: telaDeRetorno,
    criadaEm: criadaEm ?? DateTime.utc(2026, 9, 18, 12),
    rascunho: rascunho,
  );
}

void main() {
  group('regra 5 — a foto é referência de arquivo, nunca conteúdo', () {
    test('o que atravessa a serialização é o CAMINHO do arquivo', () {
      final intencao = envelope(
        rascunho: RascunhoDaIntencao(
          fotos: const <FotoDaIntencao>[
            FotoDaIntencao(
              caminho: '/tmp/bichu/achado-1.jpg',
              tipoDeConteudo: 'image/jpeg',
              tamanhoEmBytes: 3348211,
            ),
          ],
        ),
      );

      final gravado = jsonEncode(intencao.paraJson());

      expect(gravado, contains('/tmp/bichu/achado-1.jpg'));
      // O envelope inteiro de uma foto de 3,3 MB cabe em poucas centenas de
      // bytes. Se alguém trocar o caminho pelo conteúdo, este número explode
      // muito antes de qualquer outro caso reprovar.
      expect(
        gravado.length,
        lessThan(1024),
        reason: 'REPROVA: o envelope cresceu além do razoável para uma '
            'referência de arquivo. Alguém está guardando conteúdo de imagem '
            'dentro dele (UX 8.3, regra 5).',
      );

      final relido = IntencaoPendente.deJson(
        jsonDecode(gravado) as Map<String, dynamic>,
      );
      expect(relido.rascunho.fotos.single.caminho, '/tmp/bichu/achado-1.jpg');
      expect(relido.rascunho.fotos.single.tamanhoEmBytes, 3348211);
    });

    test('bytes no rascunho são RECUSADOS na captura, e não gravados', () {
      // O defeito que este caso pega é o atalho: "é só jogar a imagem no mapa
      // de campos, o JSON aceita". O mapa não aceita — e recusa na tela que
      // montou o rascunho, e não no aparelho de quem está sem memória.
      expect(
        () => RascunhoDaIntencao(
          campos: <String, Object?>{
            'foto': <int>[137, 80, 78, 71, 13, 10, 26, 10],
          },
        ),
        throwsArgumentError,
      );
    });

    test('o rascunho aceita o que a pessoa digitou ou escolheu', () {
      // O outro lado do caso acima: a recusa não pode ser tão larga que
      // impeça o rascunho de guardar um formulário.
      final rascunho = RascunhoDaIntencao(
        campos: <String, Object?>{
          'nome': 'Nina',
          'porte': 'M',
          'idade': 4,
          'castrado': true,
          'sem_resposta': null,
          'sinais': <String>['mancha no peito', 'orelha dobrada'],
        },
      );
      expect(rascunho.campos['nome'], 'Nina');
      expect(rascunho.campos['sinais'], hasLength(2));
    });
  });

  group('regra 6 — a localização carrega o carimbo de tempo', () {
    final coordenada = LocalizacaoDaIntencao(
      latitude: -23.5613,
      longitude: -46.6565,
      capturadaEm: _agoraFixo,
    );

    test('o carimbo sobrevive à gravação', () {
      final intencao = envelope(
        rascunho: RascunhoDaIntencao(localizacao: coordenada),
      );
      final relido = IntencaoPendente.deJson(
        jsonDecode(jsonEncode(intencao.paraJson())) as Map<String, dynamic>,
      );
      expect(relido.rascunho.localizacao!.capturadaEm, _agoraFixo);
      expect(relido.rascunho.localizacao!.latitude, closeTo(-23.5613, 0.00001));
    });

    test('acima de 30 minutos ela está desatualizada', () {
      expect(
        coordenada.desatualizadaEm(_agoraFixo.add(const Duration(minutes: 31))),
        isTrue,
        reason: 'REPROVA: coordenada de meia hora atrás passando por atual. O '
            'caso seria aberto onde a pessoa estava, e não onde ela está.',
      );
    });

    test('dentro dos 30 minutos ela ainda vale, e a tela não pergunta', () {
      // O caso negativo do caso acima: perguntar sempre treina a pessoa a
      // confirmar sem ler, e aí a pergunta deixa de proteger qualquer coisa.
      expect(
        coordenada.desatualizadaEm(_agoraFixo.add(const Duration(minutes: 29))),
        isFalse,
      );
      expect(
        coordenada.desatualizadaEm(_agoraFixo.add(const Duration(minutes: 30))),
        isFalse,
      );
    });
  });

  group('regra 2 — validade de 24 horas', () {
    final criadaEm = DateTime.utc(2026, 9, 18, 12);

    test('vinte e três horas e meia depois, ainda vale', () {
      final intencao = envelope(criadaEm: criadaEm);
      expect(
        intencao.expiradaEm(criadaEm.add(const Duration(hours: 23, minutes: 30))),
        isFalse,
      );
    });

    test('vinte e quatro horas depois, não vale mais', () {
      final intencao = envelope(criadaEm: criadaEm);
      expect(
        intencao.expiradaEm(criadaEm.add(const Duration(hours: 24))),
        isTrue,
        reason: 'REPROVA: rascunho de ontem executado sozinho hoje é pior que '
            'rascunho nenhum (UX 8.3, regra 2).',
      );
    });
  });

  group('o envelope gravado por outra versão do app não derruba nada', () {
    test('ação que este build não conhece é recusada na leitura', () {
      expect(
        () => IntencaoPendente.deJson(<String, dynamic>{
          'acao': 'agendar_banho',
          'tela_de_retorno': 'F9.9',
          'criada_em': '2026-09-18T12:00:00.000Z',
        }),
        throwsFormatException,
      );
    });

    test('envelope sem tela de retorno é recusado', () {
      // Sem tela de retorno não há para onde voltar quando a execução falhar,
      // e a regra 4 fica sem chão.
      expect(
        () => IntencaoPendente.deJson(<String, dynamic>{
          'acao': 'cadastrar_pet',
          'criada_em': '2026-09-18T12:00:00.000Z',
        }),
        throwsFormatException,
      );
    });
  });

  group('o envelope inteiro sobrevive ao disco', () {
    test('ação, alvo, tela de retorno, campos e posição voltam iguais', () {
      final intencao = envelope(
        acao: AcaoDeIntencao.marcarPerdido,
        alvo: 'pet_01H',
        telaDeRetorno: 'F1.4',
        rascunho: RascunhoDaIntencao(
          campos: <String, Object?>{'texto': 'estava na praça'},
          posicaoNaTela: const PosicaoNaTela(rolagem: 320.5, passo: 2),
        ),
      );

      final relido = IntencaoPendente.deJson(
        jsonDecode(jsonEncode(intencao.paraJson())) as Map<String, dynamic>,
      );

      expect(relido.acao, AcaoDeIntencao.marcarPerdido);
      expect(relido.alvo, 'pet_01H');
      expect(relido.telaDeRetorno, 'F1.4');
      expect(relido.rascunho.campos['texto'], 'estava na praça');
      // Rolagem e passo: voltar ao topo de um formulário de sete campos
      // depois do login faz a pessoa procurar de novo onde tinha parado.
      expect(relido.rascunho.posicaoNaTela!.rolagem, 320.5);
      expect(relido.rascunho.posicaoNaTela!.passo, 2);
    });
  });
}

final DateTime _agoraFixo = DateTime.utc(2026, 9, 18, 12);
