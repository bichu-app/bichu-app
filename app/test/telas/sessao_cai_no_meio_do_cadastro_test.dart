/// A sessão que cai no meio do cadastro (BICHUS-15, critério 6).
///
/// É o retrato da tutora que não abre o app há quatro meses: o refresh dela
/// venceu, e ela descobre isso **agora**, com os três passos do cadastro
/// preenchidos. Sem a captura, ela veria "entre de novo", perderia tudo, e
/// refaria — ou desistiria, que é o desfecho mais provável de quem já estava
/// com pressa.
///
/// O caso central é **negativo**: o rascunho NÃO pode se perder. Um teste que
/// só verificasse "vai para o login" passaria com o defeito instalado.
library;

import 'dart:convert';

import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/intencao/deposito_de_intencao.dart';
import 'package:bichu/intencao/intencao_pendente.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';



/// Um problema RFC 9457 com o `type` pedido, como o servidor devolveria.
http.Response problema(String slug, int status) => http.Response(
      '{"type":"https://bichu.app/problems/$slug","title":"t","status":$status,'
      '"correlation_id":"c-1"}',
      status,
      headers: <String, String>{'content-type': 'application/problem+json'},
    );

void main() {
  /// Leva o assistente até F1.5 com os obrigatórios preenchidos, e toca em
  /// `Continuar` com a rede respondendo o que o caso pedir.
  /// Leva até F1.5, toca em `Cadastrar`, e devolve o depósito do envelope —
  /// o MESMO que o app usou, e não uma instância nova que não veria nada.
  Future<DepositoDeIntencaoEmMemoria> cadastrarComRespostaDe(
    WidgetTester tester,
    http.Response respostaDoCadastro,
  ) async {
    final envelope = await abrirOApp(
      tester,
      rede: (pedido) async {
        if (pedido.url.path.endsWith('/pets') && pedido.method == 'POST') {
          return respostaDoCadastro;
        }
        if (pedido.url.path.endsWith('/reference-data')) {
          return json200(referenciaDeTeste());
        }
        return http.Response('', 404);
      },
    );

    await irPara(
      tester,
      Rotas.cadastrarPetSinais,
      extra: RascunhoDePet()
        ..nome = 'Mel'
        ..especie = Especie.cao
        ..porte = Porte.medio,
    );
    // `Cadastrar`, e não `Continuar`: F1.5 é o último passo do assistente, e o
    // botão vive na barra fixa do rodapé, fora da lista rolável.
    final cadastrar = find.widgetWithText(BotaoPrimario, TextosDoCadastro.cadastrar);
    await tester.ensureVisible(cadastrar);
    await tester.pumpAndSettle();
    await tester.tap(cadastrar);
    await tester.pumpAndSettle();
    return envelope;
  }

  testWidgets(
      'CRITÉRIO 6: sessão vencida no envio guarda a intenção com o rascunho '
      'inteiro, e leva ao login', (tester) async {
    final envelope = await cadastrarComRespostaDe(tester, problema('token-expired', 401));
    final bruto = await envelope.ler();

    expect(
      bruto,
      isNotNull,
      reason: 'REPROVA: a sessão caiu e o cadastro inteiro se perdeu. É a '
          'tutora que preencheu três passos e vai ter que refazer tudo.',
    );
    final pendente = IntencaoPendente.deJson(
      jsonDecode(bruto!) as Map<String, dynamic>,
    );
    expect(pendente.acao, AcaoDeIntencao.cadastrarPet);
    // O rascunho INTEIRO, e não só a ação: é ele que faz a pessoa não digitar
    // de novo.
    expect(pendente.rascunho.campos['nome'], 'Mel');
    expect(pendente.telaDeRetorno, isNotEmpty);
  });

  testWidgets('a mesma coisa vale para `unauthenticated`', (tester) async {
    final envelope = await cadastrarComRespostaDe(tester, problema('unauthenticated', 401));
    expect(await envelope.ler(), isNotNull);
  });

  testWidgets(
      'NÃO captura em 401 que não é sessão perdida: `invalid-credentials`',
      (tester) async {
    // O contrato declara QUATRO tipos com status 401, e dois não são "a sessão
    // acabou". Decidir por status mandaria a pessoa para o login sem motivo,
    // com um rascunho guardado que ela não pediu — e, pior, substituindo uma
    // intenção anterior que ela pediu.
    final envelope = await cadastrarComRespostaDe(tester, problema('invalid-credentials', 401));
    expect(
      await envelope.ler(),
      isNull,
      reason: 'REPROVA: capturou por STATUS em vez de por `type`.',
    );
  });

  testWidgets('NÃO captura em erro de validação: o rascunho fica na tela',
      (tester) async {
    final envelope = await cadastrarComRespostaDe(
      tester,
      http.Response(
        '{"type":"https://bichu.app/problems/validation-failed","title":"t",'
        '"status":400,"correlation_id":"c-1","errors":[{"field":"name",'
        '"code":"required","message":"Diga o nome."}]}',
        400,
        headers: <String, String>{'content-type': 'application/problem+json'},
      ),
    );
    expect(await envelope.ler(), isNull);
    // E a pessoa continua na tela, com o erro do campo que o servidor nomeou.
    // A pessoa CONTINUA em F1.5 -- nao foi parar no login.
    expect(find.text('Passo 3 de 3'), findsOne);
    // E o erro do campo que o servidor nomeou esta na tela. Precisa de rolagem
    // porque a faixa fica no fim de uma lista preguicosa: fora da janela ela
    // nem chega a ser construida, e `find.text` sobre widget nao construido
    // acha zero sem que nada esteja errado.
    // `scrollable:` explicito: a tela tem mais de um `Scrollable` (os campos
    // de escolher na lista trazem os deles), e sem dizer qual o helper reclama
    // de ambiguidade em vez de rolar.
    await tester.scrollUntilVisible(
      find.text('Diga o nome.'),
      120,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Diga o nome.'), findsOne);
  });
}
