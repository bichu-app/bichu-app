import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/tela_acompanhar_plaquinha.dart';
import 'package:bichu/telas/pet/tela_detalhe_do_pet.dart';
import 'package:bichu/widgets/acompanhamento_do_pedido.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
import 'meus_pets_test.dart' show abrirOPerfil;

// ---------------------------------------------------------------------------
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE RECUSA MEDIR
// ---------------------------------------------------------------------------
//
// A tela de acompanhamento corre um risco especifico: **parecer que rastreia
// quando nao rastreia**. O servidor conhece tres situacoes do pedido
// (`pending`, `fulfilled`, `declined`) e nao conhece "em transporte" nem
// "chegou" -- nao ha coluna, nao ha escrita e nao ha codigo de rastreio
// gravado em lugar nenhum. As iscas daqui existem para que essa fronteira nao
// seja atravessada por engano:
//
// 1. **O IDENTIFICADOR E O DO SERVIDOR.** O caso 1 afirma que o `ref` da tela
//    e o que chegou na resposta; o caso 1b muda o valor na resposta e afirma
//    que a TELA MUDOU JUNTO. Sem o 1b, um `ref` fixo escrito no app -- ou um
//    gerado nele -- passaria no 1 sem ninguem perceber.
//
// 2. **O PASSO DESTACADO SEGUE O `status` DO SERVIDOR.** O caso 3 percorre os
//    tres valores e afirma um desfecho DIFERENTE em cada um. Um unico caso
//    sobre `pending` ficaria verde numa tela que desenhasse "Em preparação"
//    sempre, que e exatamente o defeito a evitar.
//
// 3. **O CODIGO DE RASTREIO SO APARECE QUANDO EXISTE** (caso 5), com o
//    contrapeso de ele aparecer quando o servidor o manda (5b). Hoje o
//    servidor sempre o manda nulo; quando a coluna existir, o 5b ja afirma o
//    comportamento certo.
//
// 4. **AUTORIZACAO**: pedido de outra conta responde 404 e a tela diz algo
//    (caso 6), com o contrapeso do 200 da propria conta (caso 2). O par e o
//    que prova que a autorizacao existe -- um servidor que respondesse 404
//    para tudo passaria no 6 sozinho.
// ---------------------------------------------------------------------------

const String _idDoPet = '018f3a2b-0000-7000-8000-0000000000c1';

/// O `ref` que o servidor devolve nas iscas. **Opaco de proposito**: nada na
/// tela pode depender da forma dele.
const String _refDoServidor = 'Kysr9QvB_0123456789abcd';

/// Um pedido como o contrato o devolve.
Map<String, dynamic> _pedidoDoContrato({
  String ref = _refDoServidor,
  String status = 'pending',
  String? rastreio,
}) {
  return <String, dynamic>{
    'ref': ref,
    'status': status,
    'requested_at': '2026-10-17T12:00:00.000Z',
    'decided_at': status == 'pending' ? null : '2026-10-18T09:00:00.000Z',
    'tracking_code': rastreio,
    'notes': null,
  };
}

/// Uma rede com um pet do tutor e a leitura dos pedidos da plaquinha.
///
/// `pedidos` nulo responde **404** na leitura, que e o que o servidor faz com
/// pet de outra conta (ADR-0021). Lista vazia responde 200 sem item nenhum,
/// que e o pet que e seu e nunca teve pedido -- os dois casos sao diferentes
/// e as iscas 6 e 4 medem cada um.
Future<http.Response> Function(http.Request) _rede({
  List<Map<String, dynamic>>? pedidos = const <Map<String, dynamic>>[],
}) {
  final pet = petDoContrato(id: _idDoPet);
  return (req) async {
    final caminho = req.url.path;

    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[pet],
      });
    }
    if (caminho == '/v1/pets/$_idDoPet' && req.method == 'GET') {
      return json200(pet);
    }
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets/$_idDoPet/tag-requests' && req.method == 'GET') {
      if (pedidos == null) return problema('not-found', 404);
      return json200(<String, dynamic>{'items': pedidos});
    }
    // As tags do pet: a pagina do detalhe as le para o QR. Vazia basta, e
    // deixa claro que o link do acompanhamento NAO depende de ter tag.
    if (caminho == '/v1/pets/$_idDoPet/tags' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[]});
    }
    return http.Response('', 404);
  };
}

Future<void> _abrirOAcompanhamento(
  WidgetTester tester, {
  List<Map<String, dynamic>>? pedidos = const <Map<String, dynamic>>[],
}) async {
  await abrirOPerfil(tester, rede: _rede(pedidos: pedidos));
  await irPara(tester, Rotas.acompanharPlaquinhaDe(_idDoPet));
}

Future<void> _abrirODetalhe(
  WidgetTester tester, {
  List<Map<String, dynamic>>? pedidos = const <Map<String, dynamic>>[],
}) async {
  await abrirOPerfil(tester, rede: _rede(pedidos: pedidos));
  await irPara(tester, Rotas.detalheDoPetDe(_idDoPet));
  // **ROLA ATE O FIM antes de afirmar qualquer coisa sobre o link.**
  //
  // Sem isto a isca 7 ficaria verde por motivo errado: o link mora abaixo do
  // QR, fora da primeira dobra, e um `ListView` so constroi o que cabe --
  // `findsNothing` passaria igual com o link presente e com ele ausente. O
  // caso 7b foi quem revelou isso, ao falhar com o link JA implementado.
  //
  // O alvo e `Excluir`, que e o ULTIMO item da pagina: chegar nele garante
  // que tudo que vem antes -- o link entre eles -- ja foi construido.
  await tester.scrollUntilVisible(
    find.text('Excluir'),
    300,
    scrollable: find
        .descendant(
          of: find.byType(TelaDetalheDoPet),
          matching: find.byType(Scrollable),
        )
        .first,
  );
  await tester.pumpAndSettle();
}

void main() {
  group('ISCA — o identificador e o do SERVIDOR, e nunca um gerado no app', () {
    testWidgets('1. o `ref` da resposta aparece na tela', (tester) async {
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato()],
      );

      expect(find.byType(TelaAcompanharPlaquinha), findsOneWidget);
      expect(find.text(_refDoServidor), findsOneWidget);
    });

    testWidgets('1b. CONTRAPESO: outro `ref` na resposta muda a tela',
        (tester) async {
      // Sem este caso, um identificador fixo escrito no app -- ou gerado nele
      // -- passaria na isca 1 sem ninguem perceber.
      const String outro = 'ZZZ-outro-ref-do-servidor';
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato(ref: outro)],
      );

      expect(find.text(outro), findsOneWidget);
      expect(find.text(_refDoServidor), findsNothing);
    });

    testWidgets('1c. o identificador e SELECIONAVEL, para a pessoa copiar',
        (tester) async {
      // Um numero que nao sai da tela nao serve para pedir ajuda sobre o
      // pedido. `SelectableText` e o que o torna copiavel.
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato()],
      );

      expect(
        find.descendant(
          of: find.byType(AcompanhamentoDoPedido),
          matching: find.widgetWithText(SelectableText, _refDoServidor),
        ),
        findsOneWidget,
      );
    });
  });

  group('ISCA — os passos seguem o estado que o SERVIDOR informou', () {
    testWidgets('3a. `pending`: o passo atual e `Em preparação`',
        (tester) async {
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato(status: 'pending')],
      );

      expect(find.text('Em preparação'), findsOneWidget);
      // A situacao esta ESCRITA, e nao so na cor do icone: e isso que deixa o
      // passo legivel por leitor de tela e por quem nao distingue as cores.
      expect(find.text('Agora'), findsOneWidget);
      expect(find.text('Ainda não'), findsOneWidget);
      // **Nada promete entrega.** Nao ha coluna, nao ha escrita e nao ha quem
      // mova o pedido para "chegou": um passo desses ficaria parado para
      // sempre e a tela estaria mentindo.
      expect(find.text('Chegou'), findsNothing);
    });

    testWidgets('3b. CONTRAPESO `fulfilled`: os tres passos ficam concluidos',
        (tester) async {
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato(status: 'fulfilled')],
      );

      expect(find.text('Plaquinha enviada'), findsOneWidget);
      expect(find.text('Concluído'), findsNWidgets(3));
      // O que separa este caso do 3a: nenhum passo esta "agora" nem "ainda
      // nao". Sem isto, uma tela que desenhasse sempre o mesmo passaria nos
      // dois.
      expect(find.text('Agora'), findsNothing);
      expect(find.text('Ainda não'), findsNothing);
    });

    testWidgets('3c. CONTRAPESO `declined`: a recusa nao vira passo de entrega',
        (tester) async {
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato(status: 'declined')],
      );

      expect(find.text('Pedido recusado'), findsWidgets);
      // Recusado NAO e "enviada": o pedido parou, e a tela nao pode oferecer
      // um trilho que sugira que a plaquinha ainda vem.
      expect(find.text('Enviada'), findsNothing);
    });
  });

  group('ISCA — o codigo de rastreio so aparece quando existe', () {
    testWidgets('5. sem codigo, nenhum campo de rastreio nasce', (tester) async {
      // E o estado de HOJE: o servidor sempre manda `tracking_code` nulo,
      // porque nao ha coluna nem rota que o escreva. Campo vazio faria a
      // pessoa procurar um numero que nao existe.
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato()],
      );

      expect(find.text('Código de rastreio'), findsNothing);
    });

    testWidgets('5b. CONTRAPESO: com codigo, ele aparece e e selecionavel',
        (tester) async {
      const String rastreio = 'AA123456789BR';
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[
          _pedidoDoContrato(status: 'fulfilled', rastreio: rastreio),
        ],
      );

      expect(find.text('Código de rastreio'), findsOneWidget);
      expect(
        find.widgetWithText(SelectableText, rastreio),
        findsOneWidget,
      );
    });

    testWidgets('5c. codigo em branco conta como ausente', (tester) async {
      // `''` nao e um codigo. Deixa-lo passar desenharia um campo vazio.
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato(rastreio: '   ')],
      );

      expect(find.text('Código de rastreio'), findsNothing);
    });
  });

  group('ISCA — a pagina e privada: so os pedidos da propria conta', () {
    testWidgets('2. o pedido do PROPRIO pet abre o acompanhamento',
        (tester) async {
      // O CONTRAPESO da isca 6: sem ele, um servidor que respondesse 404 para
      // tudo deixaria a 6 verde e a pagina nunca abriria para ninguem.
      await _abrirOAcompanhamento(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato()],
      );

      expect(find.byType(AcompanhamentoDoPedido), findsOneWidget);
    });

    testWidgets('6. pedido de OUTRA conta responde 404 e a tela nao fica muda',
        (tester) async {
      await _abrirOAcompanhamento(tester, pedidos: null);

      // Nenhum pedido e desenhado, e a tela DIZ alguma coisa: `_enviando`
      // desligado e nada na tela e o defeito de "toca, nada acontece".
      expect(find.byType(AcompanhamentoDoPedido), findsNothing);
      expect(find.text(_refDoServidor), findsNothing);
      expect(find.byType(TelaAcompanharPlaquinha), findsOneWidget);
      expect(find.text('Atualizar'), findsOneWidget);
    });

    testWidgets('4. pet SEU e sem pedido: diz que nao ha, e nao erra',
        (tester) async {
      await _abrirOAcompanhamento(
        tester,
        pedidos: const <Map<String, dynamic>>[],
      );

      expect(find.text('Nenhum pedido para este pet.'), findsOneWidget);
      expect(find.byType(AcompanhamentoDoPedido), findsNothing);
    });
  });

  group('ISCA — o link na pagina do pet nao aponta para o vazio', () {
    testWidgets('7. pet SEM pedido: o link NAO aparece', (tester) async {
      await _abrirODetalhe(tester, pedidos: const <Map<String, dynamic>>[]);

      expect(find.byType(TelaDetalheDoPet), findsOneWidget);
      expect(find.text('Acompanhar o pedido da plaquinha'), findsNothing);
    });

    testWidgets('7b. CONTRAPESO: pet COM pedido ve o link', (tester) async {
      // Sem este caso, um link que nunca aparecesse passaria na isca 7.
      await _abrirODetalhe(
        tester,
        pedidos: <Map<String, dynamic>>[_pedidoDoContrato()],
      );

      expect(find.text('Acompanhar o pedido da plaquinha'), findsOneWidget);
    });

    testWidgets('7c. a leitura dos pedidos falhando nao mostra o link',
        (tester) async {
      // Falha da leitura secundaria nao pode derrubar a pagina do pet nem
      // oferecer um link que levaria ao vazio.
      await _abrirODetalhe(tester, pedidos: null);

      expect(find.byType(TelaDetalheDoPet), findsOneWidget);
      expect(find.text('Acompanhar o pedido da plaquinha'), findsNothing);
    });
  });
}
