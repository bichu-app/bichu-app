import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/tela_solicitar_plaquinha.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';
import 'meus_pets_test.dart' show abrirOPerfil;

// ---------------------------------------------------------------------------
// ESTE ARQUIVO FOI ESCRITO E **NAO FOI EXECUTADO**
// ---------------------------------------------------------------------------
//
// Por decisao de quem pediu a entrega (17/10/2026), nenhuma suite rodou nesta
// branch: rodaram `flutter analyze`, `tsc --noEmit`, `npm run build`, `eslint`,
// `verify:types` e os portoes offline. **Nenhuma afirmacao deste arquivo esta
// provada.** Quem rodar a suite pela primeira vez deve esperar ajuste de
// dubles, e a ausencia de prova esta dita aqui em vez de presumida verde.
//
// ---------------------------------------------------------------------------
// O QUE CADA ISCA MEDE
// ---------------------------------------------------------------------------
//
// 1. **A TELA EXISTE E E ALCANCAVEL PELO ROTEADOR.** O botao `Fazer a tag da
//    coleira` passou doze semanas com `aoTocar: null` porque o destino nao
//    existia. Uma isca que montasse `TelaSolicitarPlaquinha` direto ficaria
//    verde com a rota desregistrada, que e exatamente o estado anterior. Por
//    isso a tela e alcancada por `irPara(Rotas.solicitarPlaquinha)`, pelo
//    roteador de verdade.
//
// 2. **A ORDEM DE REGISTRO DA ROTA.** `go_router` casa na ordem, e
//    `/pets/:petId` engoliria `/pets/plaquinha` se viesse antes. O sintoma e o
//    detalhe de um pet chamado "plaquinha", e ele e silencioso: a isca afirma
//    que o endereco abre O FORMULARIO, e nao o detalhe.
//
// 3. **O PEDIDO SAI COM O PET ESCOLHIDO.** A assercao e sobre o CAMINHO que a
//    rede recebeu, e nao sobre a tela ter mudado: uma tela que dissesse
//    "pedido enviado" sem chamar nada passaria por uma assercao visual.
//
// 4. **A OBSERVACAO VIAJA NO CORPO, e corpo vazio NAO viaja.** O contrato
//    declara `requestBody.required: false`, e mandar `{"notes":""}` faria o
//    servidor recusar por `minLength` do `CHECK` -- um 400 numa acao que a
//    pessoa fez certo.
//
// 5. **NAO HA CAMPO DE ENDERECO E NAO HA PAGAMENTO**, e isso e afirmado e nao
//    presumido. As duas perguntas sao decisao de produto do cliente e estao em
//    aberto; um campo de endereco que apareca amanha sem decisao dele reprova
//    aqui. A isca conta os campos de texto da tela: UM, a observacao.
//
// 6. **404 NAO VIRA TELA MUDA.** Pet de outra pessoa responde 404 e nunca 403
//    (ADR-0021), e a tela precisa DIZER algo: `_enviando` desligado e nada na
//    tela e o defeito de "toca, nada acontece, toca de novo".
//
// 7. **O TETO DE 3 POR DIA tem texto proprio.** 429 generico diria "servidor
//    fora", que manda a pessoa tentar de novo contra um teto de 24 h.

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// O que a rede recebeu, para as iscas contarem em vez de inferirem.
class _Registro {
  final List<String> caminhos = <String>[];
  final List<String> corpos = <String>[];
}

/// Uma rede com um pet do tutor e a rota do pedido da plaquinha.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  int statusDoPedido = 200,
  String problemaDoPedido = '',
}) {
  final pet = petDoContrato(id: _idDoPet);
  return (req) async {
    final caminho = req.url.path;

    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[pet],
      });
    }
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets/$_idDoPet/tag-requests' && req.method == 'POST') {
      registro.caminhos.add(caminho);
      registro.corpos.add(req.body);
      if (statusDoPedido != 200) {
        return problema(problemaDoPedido, statusDoPedido);
      }
      return json200(<String, dynamic>{
        'status': 'pending',
        'requested_at': '2026-10-17T12:00:00.000Z',
        'notes': null,
      });
    }
    return http.Response('', 404);
  };
}

/// Abre o formulario pelo roteador de verdade, a partir de `Perfil`.
Future<void> _abrirOFormulario(
  WidgetTester tester, {
  required _Registro registro,
  int statusDoPedido = 200,
  String problemaDoPedido = '',
  Object? extra,
}) async {
  await abrirOPerfil(
    tester,
    rede: _rede(
      registro,
      statusDoPedido: statusDoPedido,
      problemaDoPedido: problemaDoPedido,
    ),
  );
  await irPara(tester, Rotas.solicitarPlaquinha, extra: extra);
}

void main() {
  group('ISCA — a tela existe e o roteador a alcanca', () {
    testWidgets('1 e 2. o endereco abre O FORMULARIO, e nao o detalhe de um pet',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro);

      expect(find.byType(TelaSolicitarPlaquinha), findsOneWidget);
      expect(find.byType(SeletorDeLista), findsOneWidget);
      // Nada foi pedido so por abrir a tela.
      expect(registro.caminhos, isEmpty);
    });
  });

  group('ISCA — o pedido sai com o pet escolhido', () {
    testWidgets('3. o `extra` pre-seleciona, e o POST vai no caminho do pet',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, <String>['/v1/pets/$_idDoPet/tag-requests']);
      expect(find.text('Pedido enviado.'), findsOneWidget);
    });

    testWidgets('3b. sem pet escolhido NAO chama a rede, e cobra a escolha',
        (tester) async {
      final registro = _Registro();
      // Sem `extra`: link direto, nenhum pet pre-selecionado.
      await _abrirOFormulario(tester, registro: registro);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, isEmpty);
      expect(find.text('Escolha o pet.'), findsOneWidget);
    });
  });

  group('ISCA — a observacao, e o corpo que NAO vai', () {
    testWidgets('4. observacao digitada viaja em `notes`', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      await tester.enterText(find.byType(BichuField), 'gravar BIDU');
      await tester.pumpAndSettle();
      await tocar(tester, find.text('Pedir a plaquinha'));

      final corpo = json.decode(registro.corpos.single) as Map<String, dynamic>;
      expect(corpo['notes'], 'gravar BIDU');
    });

    testWidgets('4b. sem observacao, o POST vai SEM corpo', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      await tocar(tester, find.text('Pedir a plaquinha'));

      // Corpo vazio, e nao `{"notes":""}`: o contrato declara o corpo
      // opcional, e `notes` vazio bateria no `CHECK` de tamanho do banco.
      expect(registro.corpos.single, anyOf('', '{}'));
    });
  });

  group('ISCA — nao ha endereco e nao ha pagamento', () {
    testWidgets('5. a tela tem UM campo de texto, e ele e a observacao',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      // As duas perguntas de produto (endereco de entrega e custo) estao em
      // aberto com o cliente. Enquanto estiverem, campo novo aqui reprova.
      expect(find.byType(BichuField), findsOneWidget);
      expect(find.text('Observação'), findsOneWidget);
      expect(find.textContaining('ndere', findRichText: true), findsNothing);
      expect(find.textContaining('CEP'), findsNothing);
      expect(find.textContaining('R\$'), findsNothing);
      expect(find.textContaining('agament'), findsNothing);
    });
  });

  group('ISCA — a falha nao deixa a tela muda', () {
    testWidgets('6. 404 diz que o pet nao e desta conta', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(
        tester,
        registro: registro,
        extra: _idDoPet,
        statusDoPedido: 404,
        problemaDoPedido: 'not-found',
      );

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(find.text('Este pet não está na sua conta.'), findsOneWidget);
      expect(find.text('Pedido enviado.'), findsNothing);
    });

    testWidgets('7. 429 fala do teto do dia, e nao "servidor fora"',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(
        tester,
        registro: registro,
        extra: _idDoPet,
        statusDoPedido: 429,
        problemaDoPedido: 'rate-limited',
      );

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(
        find.text('Você já fez três pedidos hoje. Tente amanhã.'),
        findsOneWidget,
      );
    });
  });
}
