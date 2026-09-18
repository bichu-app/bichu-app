/// A guarda de ação: uma por vez, 24 horas, executar, nunca a home (UX 8.3).
///
/// **Por que este arquivo existe.** As regras 1 a 4 e a 7 da seção 8.3 são
/// regras de comportamento, e todas elas passam por engano quando invertidas:
///
/// - Uma pilha de intenções em vez de uma só continua "guardando a intenção".
/// - Uma intenção expirada que executa continua "executando a intenção".
/// - Navegar para o formulário preenchido em vez de executar continua
///   "levando a pessoa de volta" — é a meia-entrega que a própria seção nomeia
///   como a forma mais comum de implementar isto errado.
/// - E ir para a home depois de uma falha continua "entrando na conta".
///
/// Cada caso abaixo é escrito para **reprovar** quando a regra vira do avesso,
/// e não para confirmar que o caminho feliz funciona.
library;

import 'dart:convert';

import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/guarda_de_acao.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:flutter_test/flutter_test.dart';

/// O relógio do caso. Sem ele, "intenção de ontem" exigiria esperar um dia.
final DateTime agora = DateTime.utc(2026, 9, 18, 12);

/// As telas que este build conhece, no formato do roteador de verdade.
String? rotaDaTela(String telaDeUx) => switch (telaDeUx) {
      'F1.5' => '/pets/novo/sinais',
      'F3.5' => '/achados/novo',
      _ => null,
    };

IntencaoPendente envelope({
  AcaoDeIntencao acao = AcaoDeIntencao.registrarAchado,
  String telaDeRetorno = 'F3.5',
  DateTime? criadaEm,
  String? alvo,
}) {
  return IntencaoPendente(
    acao: acao,
    alvo: alvo,
    telaDeRetorno: telaDeRetorno,
    criadaEm: criadaEm ?? agora,
    rascunho: RascunhoDaIntencao(
      campos: <String, Object?>{'texto': 'estava na praça'},
    ),
  );
}

/// Um executor que conta quantas vezes foi chamado e responde o que o caso
/// pedir. Contar é o que separa "executou" de "não executou" — e é o que a
/// regra 2 exige poder afirmar.
class ExecutorDeTeste {
  ExecutorDeTeste({this.falha});

  final FalhaDeChamada? falha;
  int chamadas = 0;
  final List<Object?> retomadas = <Object?>[];

  AcaoExecutavel get executavel => AcaoExecutavel(
        executar: (intencao) async {
          chamadas += 1;
          final erro = falha;
          if (erro != null) throw erro;
          return const ResultadoDaExecucao(
            rota: '/achados/registrado',
            extra: 'o achado',
          );
        },
        retomar: (intencao, erro) {
          retomadas.add(erro);
          return 'rascunho de ${intencao.rascunho.campos['texto']}';
        },
      );
}

GuardaDeAcao guardaCom(
  DepositoDaIntencao deposito, {
  Map<AcaoDeIntencao, AcaoExecutavel> acoes =
      const <AcaoDeIntencao, AcaoExecutavel>{},
  DateTime? relogio,
}) {
  return GuardaDeAcao(
    deposito: deposito,
    rotaDaTela: rotaDaTela,
    acoes: acoes,
    agora: () => relogio ?? agora,
  );
}

void main() {
  group('regra 1 — uma intenção pendente por vez', () {
    test('a nova SUBSTITUI a anterior', () async {
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(deposito);

      await guarda.guardar(envelope(acao: AcaoDeIntencao.gerarTag));
      await guarda.guardar(envelope(acao: AcaoDeIntencao.marcarPerdido));

      final pendente = await guarda.pendente();
      expect(pendente!.acao, AcaoDeIntencao.marcarPerdido);

      // E o disco também tem uma só: uma pilha de intenções produziria um
      // encadeamento que ninguém entende ao voltar — a pessoa entra na conta
      // para marcar o pet como perdido e o app executa antes disso um "gerar
      // tag" que ela começou de manhã e desistiu.
      final gravado = jsonDecode((await deposito.ler())!);
      expect(
        gravado,
        isA<Map<String, dynamic>>(),
        reason: 'REPROVA: o envelope virou lista. 8.3 regra 1 é uma intenção '
            'por vez, e não uma pilha.',
      );
    });

    test('a intenção sobrevive ao app ser encerrado', () async {
      // O depósito é o mesmo; a guarda é outra, como numa abertura nova do
      // app depois de o sistema tê-lo encerrado. Nada em memória atravessa.
      final deposito = DepositoDeIntencaoEmMemoria();
      await guardaCom(deposito).guardar(envelope(alvo: 'pet_01H'));

      final depoisDeReabrir = await guardaCom(deposito).pendente();
      expect(depoisDeReabrir!.alvo, 'pet_01H');
      expect(depoisDeReabrir.rascunho.campos['texto'], 'estava na praça');
    });
  });

  group('regra 2 — expirada é descartada em silêncio e o login leva à home',
      () {
    test('a intenção de 25 horas atrás NÃO executa', () async {
      final deposito = DepositoDeIntencaoEmMemoria();
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(
        envelope(criadaEm: agora.subtract(const Duration(hours: 25))),
      );

      final destino = await guarda.executarDepoisDoLogin();

      expect(
        executor.chamadas,
        0,
        reason: 'REPROVA: o app publicou sozinho, hoje, um achado que a pessoa '
            'preencheu ontem (UX 8.3, regra 2).',
      );
      expect(destino, isA<DestinoDeInicio>());
      expect((destino as DestinoDeInicio).porqueExpirou, isTrue);
      // Descartada: ela não pode ressuscitar no login seguinte.
      expect(await deposito.ler(), isNull);
    });

    test('a intenção de 23 horas atrás executa', () async {
      // O outro lado: uma validade curta demais jogaria fora o rascunho de
      // quem criou a conta à noite e só confirmou o e-mail de manhã.
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(
        envelope(criadaEm: agora.subtract(const Duration(hours: 23))),
      );

      expect(await guarda.executarDepoisDoLogin(), isA<DestinoDeResultado>());
      expect(executor.chamadas, 1);
    });

    test('sem intenção nenhuma, o destino é a home — e só aí', () async {
      final destino =
          await guardaCom(DepositoDeIntencaoEmMemoria()).executarDepoisDoLogin();
      expect(destino, isA<DestinoDeInicio>());
      expect((destino as DestinoDeInicio).porqueExpirou, isFalse);
    });
  });

  group('regra 3 — executar, não apenas navegar', () {
    test('a ação ACONTECE e o destino é a tela de resultado', () async {
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(envelope());

      final destino = await guarda.executarDepoisDoLogin();

      expect(
        executor.chamadas,
        1,
        reason: 'REPROVA: ninguém executou nada. A pessoa voltaria ao '
            'formulário preenchido para tocar no botão de novo, que é a '
            'meia-entrega que 8.3 nomeia.',
      );
      expect(destino, isA<DestinoDeResultado>());
      final resultado = destino as DestinoDeResultado;
      expect(resultado.rota, '/achados/registrado');
      expect(
        resultado.rota,
        isNot('/achados/novo'),
        reason: 'REPROVA: o destino é o formulário de onde a pessoa veio, e '
            'não a tela de resultado.',
      );
    });

    test('a execução acontece UMA vez, e o envelope morre com ela', () async {
      // Regra 7: apagado ao executar. Mantê-lo faria a ação acontecer de novo
      // no login seguinte dentro das 24 horas — dois casos do mesmo pet, e o
      // segundo ninguém pediu.
      final deposito = DepositoDeIntencaoEmMemoria();
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(envelope());

      await guarda.executarDepoisDoLogin();
      expect(await deposito.ler(), isNull);

      final segundoLogin = await guarda.executarDepoisDoLogin();
      expect(executor.chamadas, 1, reason: 'REPROVA: executou duas vezes.');
      expect(segundoLogin, isA<DestinoDeInicio>());
    });

    test('a localização velha chega marcada na tela de resultado', () async {
      // Regra 6: acima de 30 minutos, a tela de resultado pergunta se ainda
      // vale. A guarda não faz a pergunta; ela diz que a pergunta é devida.
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(
        IntencaoPendente(
          acao: AcaoDeIntencao.registrarAchado,
          telaDeRetorno: 'F3.5',
          criadaEm: agora.subtract(const Duration(hours: 2)),
          rascunho: RascunhoDaIntencao(
            localizacao: LocalizacaoDaIntencao(
              latitude: -23.5613,
              longitude: -46.6565,
              capturadaEm: agora.subtract(const Duration(hours: 2)),
            ),
          ),
        ),
      );

      final destino = await guarda.executarDepoisDoLogin();
      expect(
        (destino as DestinoDeResultado).localizacaoDesatualizada,
        isTrue,
        reason: 'REPROVA: o achado seria gravado onde a pessoa estava há duas '
            'horas, sem ninguém perguntar nada (UX 8.3, regra 6).',
      );
    });

    test('a localização recente NÃO marca nada', () async {
      final executor = ExecutorDeTeste();
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(
        IntencaoPendente(
          acao: AcaoDeIntencao.registrarAchado,
          telaDeRetorno: 'F3.5',
          criadaEm: agora,
          rascunho: RascunhoDaIntencao(
            localizacao: LocalizacaoDaIntencao(
              latitude: -23.5613,
              longitude: -46.6565,
              capturadaEm: agora.subtract(const Duration(minutes: 5)),
            ),
          ),
        ),
      );

      final destino = await guarda.executarDepoisDoLogin();
      expect((destino as DestinoDeResultado).localizacaoDesatualizada, isFalse);
    });
  });

  group('regra 4 — nunca a home', () {
    test('execução recusada pelo servidor volta à tela de retorno', () async {
      final executor = ExecutorDeTeste(
        falha: FalhaDaApi(Problem.semCorpo(500)),
      );
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: executor.executavel,
        },
      );
      await guarda.guardar(envelope());

      final destino = await guarda.executarDepoisDoLogin();

      expect(
        destino,
        isA<DestinoDeRetorno>(),
        reason: 'REPROVA: a falha jogou a pessoa na home. A home só acontece '
            'quando a intenção expirou (UX 8.3, regra 4).',
      );
      final retorno = destino as DestinoDeRetorno;
      expect(retorno.rota, '/achados/novo');
      // O rascunho volta junto, e o erro é explicado: uma tela de retorno em
      // branco perde o rascunho pelo outro caminho.
      expect(retorno.extra, 'rascunho de estava na praça');
      expect(retorno.erro, isNotNull);
    });

    test('sem conexão também não vai para a home', () async {
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado:
              ExecutorDeTeste(falha: const FalhaDeConexao()).executavel,
        },
      );
      await guarda.guardar(envelope());
      expect(await guarda.executarDepoisDoLogin(), isA<DestinoDeRetorno>());
    });

    test('a falha NÃO apaga o envelope', () async {
      // O rascunho passaria a existir só na memória da tela de retorno, e o
      // sistema encerrando o app nessa tela levaria embora tudo o que a pessoa
      // digitou — que é o defeito que o envelope existe para evitar.
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(
        deposito,
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado:
              ExecutorDeTeste(falha: const FalhaDeConexao()).executavel,
        },
      );
      await guarda.guardar(envelope());

      await guarda.executarDepoisDoLogin();
      expect(await deposito.ler(), isNotNull);
    });

    test('executor que estoura por defeito nosso não deixa ninguém parado',
        () async {
      // Sem este ramo, a exceção sobe pela tela de entrar e a pessoa fica
      // numa tela de login depois de ter entrado: sem mensagem, sem destino e
      // sem o rascunho dela.
      final guarda = guardaCom(
        DepositoDeIntencaoEmMemoria(),
        acoes: <AcaoDeIntencao, AcaoExecutavel>{
          AcaoDeIntencao.registrarAchado: AcaoExecutavel(
            executar: (_) async => throw StateError('envelope incompleto'),
            retomar: (intencao, erro) => 'rascunho preservado',
          ),
        },
      );
      await guarda.guardar(envelope());

      final destino = await guarda.executarDepoisDoLogin();
      expect(destino, isA<DestinoDeRetorno>());
      expect((destino as DestinoDeRetorno).extra, 'rascunho preservado');
    });

    test('ação sem executor registrado volta à tela de retorno, e não à home',
        () async {
      // As outras cinco ações de 8.3 ainda não têm fluxo neste build. Enquanto
      // não tiverem, uma intenção guardada para elas não pode sumir na home.
      final guarda = guardaCom(DepositoDeIntencaoEmMemoria());
      await guarda.guardar(envelope(acao: AcaoDeIntencao.encerrarCaso));

      final destino = await guarda.executarDepoisDoLogin();
      expect(destino, isA<DestinoDeRetorno>());
      expect((destino as DestinoDeRetorno).telaDeRetorno, 'F3.5');
    });
  });

  group('o envelope ilegível não impede ninguém de entrar', () {
    test('arquivo corrompido é descartado, e o destino é a home', () async {
      final deposito = DepositoDeIntencaoEmMemoria();
      await deposito.gravar('isto não é json');
      final guarda = guardaCom(deposito);

      expect(await guarda.executarDepoisDoLogin(), isA<DestinoDeInicio>());
      expect(await deposito.ler(), isNull);
    });

    test('tela de retorno que este build não tem é descartada', () async {
      // Envelope gravado antes de uma atualização do app, apontando para uma
      // tela que sumiu. Não há para onde voltar, e inventar um destino seria
      // pior que perder o rascunho.
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(deposito);
      await guarda.guardar(envelope(telaDeRetorno: 'F9.9'));

      expect(await guarda.pendente(), isNull);
      expect(await deposito.ler(), isNull);
    });
  });

  group('regra 7 — o envelope é apagado', () {
    test('descartar apaga', () async {
      final deposito = DepositoDeIntencaoEmMemoria();
      final guarda = guardaCom(deposito);
      await guarda.guardar(envelope());
      await guarda.descartar();
      expect(await deposito.ler(), isNull);
    });
  });
}
