// BICHUS-75 — o registro de dispensas do aviso persistente: o que ele guarda,
// e o que PRECISA apaga-lo.
//
// ---------------------------------------------------------------------------
// A ISCA PRINCIPAL DESTE ARQUIVO E O LOGOUT, E ELA APONTA PARA O LADO OPOSTO
// DA ISCA DE `oportunidades_de_aviso_test.dart`
// ---------------------------------------------------------------------------
//
// As duas decisoes sao contrarias, e por isso as duas iscas existem: uma
// reprova se a entrada aparecer em `limpezasAoSair`, e esta reprova se ela
// sumir. Quem ler so uma das duas vai "uniformizar" a outra.
//
// O registro das oportunidades e do APARELHO: o dialogo de notificacao do iOS
// e gasto uma vez por instalacao. Este aqui e da CONTA. Ele guarda que a
// Marina pediu silencio sobre o e-mail DELA, e o proprio contador de dispensas
// decide, a partir da terceira, que o app passa a perguntar se o endereco esta
// certo.
//
// Sobrevivendo ao logout, o tutor seguinte neste celular herda os dois: o
// silencio de sete dias que ele nunca pediu, e a suspeita sobre um endereco
// que e dele e esta certo. O sintoma nao aparece no aparelho de quem escreveu
// o codigo -- ele aparece no segundo tutor do mesmo celular, que ninguem testa
// a mao.

import 'dart:convert';

import 'package:bichu/escopo.dart';
import 'package:bichu/sessao/registro_do_aviso_de_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../telas/ajuda_de_tela.dart';

/// Um deposito que recusa tudo, para o caminho do disco ruim.
class DepositoDoAvisoQueFalha implements DepositoDoAvisoDeCadastro {
  @override
  Future<String?> ler() async => throw const _FalhaDeDisco();

  @override
  Future<void> gravar(String conteudo) async => throw const _FalhaDeDisco();

  @override
  Future<void> apagar() async => throw const _FalhaDeDisco();
}

class _FalhaDeDisco implements Exception {
  const _FalhaDeDisco();
}

void main() {
  group('o registro em si', () {
    test('nasce vazio: nunca dispensou, e o silencio nao vale', () async {
      final r = AvisoDeCadastro(deposito: DepositoDoAvisoEmMemoria());
      final estado = await r.estado('u-1');
      expect(estado.dispensas, 0);
      expect(estado.dispensadoEm, isNull);
      expect(r.silencioVale(estado), isFalse);
    });

    test('dispensar conta, e o silencio passa a valer', () async {
      final r = AvisoDeCadastro(deposito: DepositoDoAvisoEmMemoria());
      await r.dispensar('u-1');
      final estado = await r.estado('u-1');
      expect(estado.dispensas, 1);
      expect(r.silencioVale(estado), isTrue);
    });

    test('o silencio vale por 7 dias, e no oitavo dia acabou', () async {
      // O criterio 4 inteiro esta neste caso, e ele so existe porque o relogio
      // entra pela porta. Sem injecao, provar isto custaria treze dias de
      // espera -- foi a ressalva escrita no refinamento de 17/09.
      var agora = DateTime.utc(2026, 9, 22, 10);
      final r = AvisoDeCadastro(
        deposito: DepositoDoAvisoEmMemoria(),
        agora: () => agora,
      );
      await r.dispensar('u-1');

      agora = DateTime.utc(2026, 9, 29, 9, 59);
      expect(
        r.silencioVale(await r.estado('u-1')),
        isTrue,
        reason: 'REPROVA: faltando um minuto para os 7 dias o aviso ja voltou '
            'cheio. A pessoa pediu uma semana e recebeu menos.',
      );

      agora = DateTime.utc(2026, 9, 29, 10, 1);
      expect(
        r.silencioVale(await r.estado('u-1')),
        isFalse,
        reason: 'REPROVA: passados os 7 dias o silencio continua valendo. O '
            'criterio 4 manda o ciclo RECOMECAR indefinidamente; um silencio '
            'que nao acaba e o botao de dispensar para sempre que o criterio '
            '5 proibe, so que sem botao.',
      );
    });

    test('o ciclo recomeca: dispensar de novo compra outros 7 dias', () async {
      var agora = DateTime.utc(2026, 9, 22);
      final r = AvisoDeCadastro(
        deposito: DepositoDoAvisoEmMemoria(),
        agora: () => agora,
      );
      await r.dispensar('u-1');
      agora = DateTime.utc(2026, 10, 1);
      await r.dispensar('u-1');
      final estado = await r.estado('u-1');
      expect(estado.dispensas, 2, reason: 'a contagem e cumulativa');
      expect(r.silencioVale(estado), isTrue);
    });

    test('o registro sobrevive a um objeto novo sobre o mesmo disco', () async {
      // O app de amanha de manha: outro processo, o mesmo arquivo. Se isto
      // reprovar, "7 dias" virou "7 dias ou ate fechar o app".
      final deposito = DepositoDoAvisoEmMemoria();
      var agora = DateTime.utc(2026, 9, 22);
      await AvisoDeCadastro(deposito: deposito, agora: () => agora)
          .dispensar('u-1');

      agora = DateTime.utc(2026, 9, 23);
      final amanha = AvisoDeCadastro(deposito: deposito, agora: () => agora);
      expect(
        amanha.silencioVale(await amanha.estado('u-1')),
        isTrue,
        reason: 'REPROVA: o registro nao sobreviveu ao processo. Quem dispensa '
            'a noite ve a faixa cheia de manha, e a dispensa nao vale nada.',
      );
    });

    test('ISCA — registro de OUTRA conta e lido como registro nenhum',
        () async {
      // A segunda defesa, alem de `limpezasAoSair`. Ela cobre o arquivo que
      // sobreviveu a um logout que falhou ao gravar, a uma restauracao de
      // backup do aparelho, ou a uma versao anterior do app.
      final r = AvisoDeCadastro(
        deposito: DepositoDoAvisoEmMemoria(
          conteudoInicial: jsonEncode(<String, dynamic>{
            'conta': 'u-marina',
            'dispensado_em': '2026-09-22T10:00:00.000Z',
            'dispensas': 3,
          }),
        ),
        agora: () => DateTime.utc(2026, 9, 22, 11),
      );
      final estado = await r.estado('u-joao');
      expect(
        estado.dispensas,
        0,
        reason: 'REPROVA: o app leu como do Joao um registro gravado pela '
            'Marina. Com tres dispensas herdadas ele ve de cara "O e-mail '
            '<o dele> esta certo?" sobre um endereco que esta certo, e o '
            'silencio de sete dias dela cala o aviso que ele precisaria ler.',
      );
      expect(r.silencioVale(estado), isFalse);
    });

    test('arquivo corrompido e lido como "nunca dispensou"', () async {
      final r = AvisoDeCadastro(
        deposito: DepositoDoAvisoEmMemoria(conteudoInicial: '{"con'),
      );
      expect((await r.estado('u-1')).dispensas, 0);
    });

    test('ISCA — disco que nao responde MOSTRA o aviso, e nao o esconde',
        () async {
      // O lado seguro aqui e o oposto do das oportunidades de aviso. La,
      // insistir gastava um dialogo do sistema que nao volta, entao falha de
      // leitura fecha as duas. Aqui, calar esconde de quem tem e-mail nao
      // confirmado a unica razao pela qual alguem conseguiria devolver o pet
      // dele. O custo de errar para o lado de mostrar e uma faixa a mais.
      final r = AvisoDeCadastro(deposito: DepositoDoAvisoQueFalha());
      final estado = await r.estado('u-1');
      expect(
        r.silencioVale(estado),
        isFalse,
        reason: 'REPROVA: a leitura falhou e o app concluiu que a pessoa havia '
            'pedido silencio. Erro de disco virou motivo para calar o unico '
            'aviso que explica por que ninguem consegue avisar sobre o pet.',
      );
    });

    test('gravacao que falha nao propaga: a tela nao cai', () async {
      final r = AvisoDeCadastro(deposito: DepositoDoAvisoQueFalha());
      await expectLater(r.dispensar('u-1'), completes);
    });

    test('a janela e de 7 dias, e o gatilho de texto e a terceira dispensa',
        () {
      // Os dois numeros do criterio 4 e do criterio 6, escritos onde o codigo
      // os le. Um `const Duration(days: 7)` enterrado numa expressao vira 6 num
      // refactor sem nada acusar.
      expect(janelaDeSilencio, const Duration(days: 7));
      expect(dispensasQueTrocamOTexto, 3);
    });
  });

  group('ISCA — o registro SOME no logout', () {
    testWidgets('sair da conta apaga o registro do tutor anterior',
        (tester) async {
      final deposito = DepositoDoAvisoEmMemoria();
      await abrirOApp(
        tester,
        depositoDoAviso: deposito,
        deposito: depositoLogado(emailVerificado: false),
        rede: (requisicao) async {
          if (requisicao.method == 'GET' &&
              requisicao.url.path.endsWith('/pets')) {
            return json200(<String, dynamic>{'items': <dynamic>[]});
          }
          return json200(<String, dynamic>{});
        },
      );

      final contexto = tester.element(find.byType(Scaffold).first);
      final escopo = Escopo.of(contexto);
      await escopo.avisoDeCadastro.dispensar('u-1');
      expect(
        deposito.conteudo,
        isNotNull,
        reason: 'precondicao: a dispensa foi gravada antes do logout',
      );

      // O LOGOUT pelo controlador, que e quem roda `limpezasAoSair` nos quatro
      // desfechos de `sair()` -- inclusive o que nao passa por botao nenhum
      // (sessao derrubada por refresh recusado).
      await escopo.sessao.sair();
      await tester.pumpAndSettle();

      expect(
        deposito.apagamentos,
        greaterThan(0),
        reason: 'REPROVA: o registro de dispensas NAO foi apagado no logout, '
            'quase certamente por ter saido de `limpezasAoSair` em '
            '`app.dart`. Ele E da conta: guarda que a tutora anterior pediu '
            'silencio sobre o e-mail DELA, e a contagem dela decide o texto '
            'que o app mostra. O proximo tutor neste celular herda o silencio '
            'de sete dias que nunca pediu e, com tres dispensas herdadas, le '
            '"O e-mail <o dele> esta certo?" sobre um endereco correto.\n'
            'CUIDADO ao "uniformizar" com '
            '`test/dispositivo/oportunidades_de_aviso_test.dart`: aquela isca '
            'reprova pelo motivo OPOSTO, porque o registro de oportunidades e '
            'do APARELHO e este e da CONTA.',
      );
      expect(deposito.conteudo, isNull);
    });
  });
}
