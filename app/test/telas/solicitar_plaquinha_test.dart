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
// 5. **O ENDERECO E OBRIGATORIO, E A RECUSA DIZ QUAL CAMPO FALTA.** Esta e a
//    isca que o cliente comprou junto da decisao de 17/10: botao que recusa
//    sem explicar custou tempo a ele tres vezes num dia. O caso NAO afirma
//    "nao enviou": ele afirma que a mensagem de cada campo que falta aparece
//    na tela, uma por uma.
//
// 5b. **O CEP NAO PREENCHE NADA.** Nao ha consulta a servico de CEP
//    (ADR-0006). A isca digita um CEP e afirma que bairro e cidade seguem
//    VAZIOS -- uma consulta que alguem acrescente amanha reprova aqui.
//
// 5c. **NAO HA PAGAMENTO**, e isso segue afirmado: cobranca continua fora de
//    escopo por decisao do cliente.
//
// 5d. **A UF viaja como SIGLA, e a lista mostra o NOME.** A isca afirma os
//    dois lados, porque mandar "São Paulo" em `state` quebraria o contrato
//    (dois caracteres).
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

/// Um endereco valido, nos rotulos da tela.
const Map<String, String> _endereco = <String, String>{
  'Quem recebe': 'Mariana Destinataria',
  'CEP': '01311000',
  'Rua': 'Avenida Paulista Ficticia',
  'Número': '1578B',
  'Bairro': 'Bela Vista Inventada',
  'Cidade': 'Sao Paulo dos Testes',
};

/// Preenche os seis campos de texto do endereco e escolhe o estado.
Future<void> _preencherOEndereco(WidgetTester tester) async {
  for (final par in _endereco.entries) {
    final campo = find.ancestor(
      of: find.text(par.key),
      matching: find.byType(BichuField),
    );
    await tester.ensureVisible(campo);
    await tester.enterText(campo, par.value);
    await tester.pumpAndSettle();
  }
  await _escolherOEstado(tester, 'São Paulo');
}

/// Abre o seletor de estado e escolhe pelo NOME.
Future<void> _escolherOEstado(WidgetTester tester, String nome) async {
  final seletor = find.ancestor(
    of: find.text('Estado'),
    matching: find.byType(SeletorDeLista),
  );
  await tocar(tester, seletor);
  await tocar(tester, find.text(nome).last);
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
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, <String>['/v1/pets/$_idDoPet/tag-requests']);
      expect(find.text('Pedido enviado.'), findsOneWidget);
    });

    testWidgets('3b. sem pet escolhido NAO chama a rede, e cobra a escolha',
        (tester) async {
      final registro = _Registro();
      // Sem `extra`: link direto, nenhum pet pre-selecionado.
      await _abrirOFormulario(tester, registro: registro);
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, isEmpty);
      expect(find.text('Escolha o pet.'), findsOneWidget);
    });
  });

  group('ISCA — a observacao, e o corpo que NAO vai', () {
    testWidgets('4. observacao digitada viaja em `notes`', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);

      final observacao = find.ancestor(
        of: find.text('Observação'),
        matching: find.byType(BichuField),
      );
      await tester.ensureVisible(observacao);
      await tester.enterText(observacao, 'gravar BIDU');
      await tester.pumpAndSettle();
      await tocar(tester, find.text('Pedir a plaquinha'));

      final corpo = json.decode(registro.corpos.single) as Map<String, dynamic>;
      expect(corpo['notes'], 'gravar BIDU');
    });

    testWidgets('4b. sem observacao, `notes` nao viaja', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      // Ausente, e nao `""`: `notes` vazio bateria no `CHECK` de tamanho do
      // banco. O endereco, esse, viaja sempre.
      final corpo = json.decode(registro.corpos.single) as Map<String, dynamic>;
      expect(corpo.containsKey('notes'), isFalse);
      expect(corpo['delivery_address'], isA<Map<String, dynamic>>());
    });

    testWidgets('4c. o endereco viaja com os nomes do contrato', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      final corpo = json.decode(registro.corpos.single) as Map<String, dynamic>;
      final endereco = corpo['delivery_address'] as Map<String, dynamic>;
      expect(endereco['recipient_name'], 'Mariana Destinataria');
      // **Sem mascara**: o contrato declara `^[0-9]{8}$`.
      expect(endereco['postal_code'], '01311000');
      expect(endereco['street'], 'Avenida Paulista Ficticia');
      expect(endereco['street_number'], '1578B');
      expect(endereco['neighborhood'], 'Bela Vista Inventada');
      expect(endereco['city'], 'Sao Paulo dos Testes');
      // 5d: a lista mostra "São Paulo"; o que viaja e `SP`.
      expect(endereco['state'], 'SP');
      // `complement` ficou vazio e NAO viaja: e o unico opcional.
      expect(endereco.containsKey('complement'), isFalse);
    });
  });

  group('ISCA — o endereco e obrigatorio, e a recusa diz qual campo falta', () {
    testWidgets('5. cada campo que falta aparece dito na tela', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      // Formulario em branco, e o toque no botao.
      await tocar(tester, find.text('Pedir a plaquinha'));

      // **A assercao que carrega a isca.** Recusar sem enviar passaria so com
      // a linha de baixo; o que o cliente cobrou e a tela DIZER o que falta.
      for (final texto in <String>[
        'Diga quem recebe.',
        'O CEP tem 8 dígitos.',
        'Digite a rua.',
        'Digite o número.',
        'Digite o bairro.',
        'Digite a cidade.',
        'Escolha o estado.',
      ]) {
        await rolarAte(tester, find.text(texto));
        expect(find.text(texto), findsOneWidget, reason: 'falta dizer: $texto');
      }
      expect(registro.caminhos, isEmpty);
    });

    testWidgets('5a. `Complemento` e o UNICO opcional: sem ele o pedido vai',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, hasLength(1));
      expect(find.text('Pedido enviado.'), findsOneWidget);
    });

    testWidgets('5b. digitar o CEP NAO preenche bairro nem cidade',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      final cep = find.ancestor(
        of: find.text('CEP'),
        matching: find.byType(BichuField),
      );
      await tester.ensureVisible(cep);
      await tester.enterText(cep, '01311000');
      await tester.pumpAndSettle();

      // Nao ha consulta a servico de CEP (ADR-0006). Se alguem acrescentar
      // uma, estes dois campos deixam de estar vazios e a isca reprova.
      for (final rotulo in <String>['Bairro', 'Cidade']) {
        final campo = tester.widget<BichuField>(
          find.ancestor(
            of: find.text(rotulo),
            matching: find.byType(BichuField),
          ),
        );
        expect(campo.controlador.text, isEmpty, reason: '$rotulo foi preenchido sozinho');
      }
      expect(registro.caminhos, isEmpty);
    });

    testWidgets('5c. nao ha pagamento: nenhum valor e nenhuma cobranca',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      // Cobranca segue fora de escopo por decisao do cliente.
      expect(find.textContaining('R\$'), findsNothing);
      expect(find.textContaining('agament'), findsNothing);
      expect(find.textContaining('artão'), findsNothing);
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
