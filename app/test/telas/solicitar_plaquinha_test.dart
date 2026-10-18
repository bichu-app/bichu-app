import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

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
// 5b. **O CEP PREENCHE, E A FALHA DA BUSCA NAO TRAVA O PEDIDO.** A isca
//    antiga afirmava o contrario -- que nada era preenchido -- e foi
//    REMOVIDA: ela nasceu quando a decisao era nao ter busca, e o cliente
//    decidiu em 17/10 que tem. No lugar dela entram tres casos, e o terceiro
//    e o que protege o pedido dele:
//      - o CEP preenche rua, bairro, cidade e estado (ViaCEP);
//      - o que vier preenchido continua EDITAVEL, e o que a pessoa ja
//        escreveu nao e sobrescrito;
//      - **servico fora do ar, lento ou CEP inexistente nao impede o envio.**
//        A isca derruba a rede de CEP e afirma que o pedido vai assim mesmo.
//
// 5c. **NAO HA PAGAMENTO**, e isso segue afirmado: cobranca continua fora de
//    escopo por decisao do cliente.
//
// 5e. **O TELEFONE e obrigatorio, mascarado na tela e E.164 no envio.**
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
  final List<String> chamadasDeCep = <String>[];
  final List<Map<String, String>> cabecalhosDeCep = <Map<String, String>>[];
}

/// Um endereco valido, nos rotulos da tela.
const Map<String, String> _endereco = <String, String>{
  'Quem recebe': 'Mariana Destinataria',
  'Telefone de quem recebe': '11987654321',
  'CEP': '01311000',
  'Rua': 'Avenida Paulista Ficticia',
  'Número': '1578B',
  'Bairro': 'Bela Vista Inventada',
  'Cidade': 'Sao Paulo dos Testes',
};

/// O campo do rotulo.
///
/// Pelo `rotulo` do proprio [BichuField], e nao por `find.text(rotulo)`: o
/// campo OPCIONAL escreve na tela `'<rotulo> (opcional)'`
/// (`lib/widgets/bichu_field.dart`, linha 131), e `find.text('Complemento')`
/// nao acha nada. Procurar pelo texto fazia as iscas 4 e 5b estourarem
/// `Bad state: No element` nos dois unicos campos opcionais da tela --
/// `Complemento` e `Observação`.
Finder _campoDoRotulo(String rotulo) {
  return find.byWidgetPredicate(
    (widget) => widget is BichuField && widget.rotulo == rotulo,
    description: 'BichuField de rotulo "$rotulo"',
  );
}

/// Escreve num campo pelo rotulo.
Future<void> _digitar(WidgetTester tester, String rotulo, String valor) async {
  final campo = _campoDoRotulo(rotulo);
  await tester.ensureVisible(campo);
  await tester.enterText(campo, valor);
  await tester.pumpAndSettle();
}

/// O que esta escrito num campo, pelo rotulo.
String _textoDoCampo(WidgetTester tester, String rotulo) {
  return tester
      .widget<BichuField>(_campoDoRotulo(rotulo))
      .controlador
      .text
      .trim();
}

/// Preenche os campos de texto do endereco e escolhe o estado.
Future<void> _preencherOEndereco(WidgetTester tester) async {
  for (final par in _endereco.entries) {
    await _digitar(tester, par.key, par.value);
  }
  await _escolherOEstado(tester, 'São Paulo');
}

/// Abre o seletor de estado e escolhe pelo NOME, **dentro da folha**.
///
/// Dois cuidados, e os dois foram medidos: o toque vai na CAIXA do seletor e
/// nao no bloco (o bloco inclui o rotulo, e o centro dele cai no texto -- o
/// mesmo cuidado que `escolherRaca`, em `cadastrar_identificacao_test.dart`,
/// escreve); e a folha de 27 itens **precisa rolar**, porque o `ListView` so
/// constroi o que cabe. Sem rolar, `find.text(nome)` acha o texto do PROPRIO
/// seletor, atras da folha, e o toque bate na folha.
Future<void> _escolherOEstado(WidgetTester tester, String nome) async {
  final seletor = find.ancestor(
    of: find.text('Estado'),
    matching: find.byType(SeletorDeLista),
  );
  await tocar(
    tester,
    find.descendant(of: seletor, matching: find.byType(InkWell)),
  );
  // A opcao e a da LISTA, e nao o texto do campo: procurar dentro do
  // `ListTile` e o que separa os dois.
  final opcao = find.descendant(
    of: find.byType(ListTile),
    matching: find.text(nome),
  );
  if (opcao.evaluate().isEmpty) {
    await tester.scrollUntilVisible(
      opcao,
      120,
      scrollable: find
          .descendant(
            of: find.byType(BottomSheet),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
  }
  await tocar(tester, opcao);
}

/// Uma rede com um pet do tutor, a rota do pedido e o ViaCEP.
///
/// `cepFora` derruba **so** a busca de CEP, e e assim que a isca separa "a
/// busca falhou" de "o pedido falhou": o `POST` continua de pe.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  int statusDoPedido = 200,
  String problemaDoPedido = '',
  bool cepFora = false,
  bool cepInexistente = false,
}) {
  final pet = petDoContrato(id: _idDoPet);
  return (req) async {
    final caminho = req.url.path;

    // Os dois servicos de CEP. **Nenhum deles e a nossa API**, e nenhum
    // recebe `Authorization` -- a isca 5f confere isso.
    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      registro.chamadasDeCep.add(req.url.toString());
      registro.cabecalhosDeCep.add(Map<String, String>.from(req.headers));
      if (cepFora) throw const SocketException('servico de CEP fora do ar');
      if (cepInexistente) return json200(<String, dynamic>{'erro': 'true'});
      return json200(<String, dynamic>{
        'cep': '01311-000',
        'logradouro': 'Avenida Paulista',
        'complemento': 'até 609 - lado ímpar',
        'bairro': 'Bela Vista',
        'localidade': 'São Paulo',
        'uf': 'SP',
      });
    }

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
  bool cepFora = false,
  bool cepInexistente = false,
  Object? extra,
}) async {
  await abrirOPerfil(
    tester,
    rede: _rede(
      registro,
      statusDoPedido: statusDoPedido,
      problemaDoPedido: problemaDoPedido,
      cepFora: cepFora,
      cepInexistente: cepInexistente,
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
      // **Os DOIS seletores do formulario**, nomeados: o do pet e o do
      // estado. A versao anterior desta linha pedia `findsOneWidget` sobre o
      // TIPO, e ela se contradizia com o resto deste arquivo -- a 5d afirma a
      // lista dos 27 estados, e `_escolherOEstado` acha o seletor de estado
      // por `find.ancestor(of: find.text('Estado'))`. Nomear os dois afirma
      // mais, e nao menos: contar tipos nao diz QUAL seletor abriu.
      expect(
        find.ancestor(of: find.text('Pet'), matching: find.byType(SeletorDeLista)),
        findsOneWidget,
      );
      expect(
        find.ancestor(
          of: find.text('Estado'),
          matching: find.byType(SeletorDeLista),
        ),
        findsOneWidget,
      );
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

      await _digitar(tester, 'Observação', 'gravar BIDU');
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

    testWidgets('5b. o CEP preenche rua, bairro, cidade e estado', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      await _digitar(tester, 'CEP', '01311000');
      await tester.pumpAndSettle();

      expect(registro.chamadasDeCep, hasLength(1));
      expect(registro.chamadasDeCep.single, contains('viacep.com.br'));
      expect(_textoDoCampo(tester, 'Rua'), 'Avenida Paulista');
      expect(_textoDoCampo(tester, 'Bairro'), 'Bela Vista');
      expect(_textoDoCampo(tester, 'Cidade'), 'São Paulo');
      // `complemento` do ViaCEP e "até 609 - lado ímpar", a FAIXA da rua, e
      // nao o apartamento de ninguem. Ele nao pode entrar no campo.
      expect(_textoDoCampo(tester, 'Complemento'), isEmpty);
    });

    testWidgets('5b2. o que veio continua EDITAVEL, e o digitado nao e trocado',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      // A pessoa escreveu a rua ANTES de digitar o CEP.
      await _digitar(tester, 'Rua', 'Rua que eu sei de cor');
      await _digitar(tester, 'CEP', '01311000');
      await tester.pumpAndSettle();

      // O que ela escreveu vence o que a base devolveu.
      expect(_textoDoCampo(tester, 'Rua'), 'Rua que eu sei de cor');

      // E o que a busca preencheu pode ser corrigido.
      await _digitar(tester, 'Bairro', 'Outro bairro');
      expect(_textoDoCampo(tester, 'Bairro'), 'Outro bairro');
    });

    testWidgets('5b3. ISCA — a busca de CEP fora do ar NAO impede o pedido',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(
        tester,
        registro: registro,
        extra: _idDoPet,
        cepFora: true,
      );

      await _preencherOEndereco(tester);
      await tocar(tester, find.text('Pedir a plaquinha'));

      // **A assercao que o cliente comprou.** O servico de terceiro caiu, e o
      // pedido foi assim mesmo.
      expect(registro.caminhos, hasLength(1));
      expect(find.text('Pedido enviado.'), findsOneWidget);
    });

    testWidgets('5b4. CEP inexistente tambem nao impede: diz e segue',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(
        tester,
        registro: registro,
        extra: _idDoPet,
        cepInexistente: true,
      );

      await _preencherOEndereco(tester);
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.caminhos, hasLength(1));
      expect(find.text('Pedido enviado.'), findsOneWidget);
    });

    testWidgets('5f. a busca manda SO o CEP, e sem o token da sessao',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Mariana Destinataria');
      await _digitar(tester, 'CEP', '01311000');
      await tester.pumpAndSettle();

      final url = registro.chamadasDeCep.single;
      expect(url, contains('01311000'));
      // Nem nome, nem conta, nem pet.
      expect(url, isNot(contains('Mariana')));
      expect(url, isNot(contains(_idDoPet)));
      for (final cabecalhos in registro.cabecalhosDeCep) {
        final chaves = cabecalhos.keys.map((k) => k.toLowerCase());
        expect(chaves, isNot(contains('authorization')));
      }
    });

    testWidgets('5e. o telefone e obrigatorio, e vai em E.164', (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);

      // Mascarado na tela...
      expect(_textoDoCampo(tester, 'Telefone de quem recebe'), '(11) 98765-4321');

      await tocar(tester, find.text('Pedir a plaquinha'));

      // ...e E.164 no envio.
      final corpo = json.decode(registro.corpos.single) as Map<String, dynamic>;
      final endereco = corpo['delivery_address'] as Map<String, dynamic>;
      expect(endereco['recipient_phone'], '+5511987654321');
    });

    testWidgets('5e2. telefone incompleto recusa, e DIZ o que falta',
        (tester) async {
      final registro = _Registro();
      await _abrirOFormulario(tester, registro: registro, extra: _idDoPet);
      await _preencherOEndereco(tester);
      await _digitar(tester, 'Telefone de quem recebe', '1198');

      await tocar(tester, find.text('Pedir a plaquinha'));

      await rolarAte(tester, find.text('Digite DDD e número.'));
      expect(find.text('Digite DDD e número.'), findsOneWidget);
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
      // O endereco PRECISA estar preenchido para a rede ser chamada: a isca 5,
      // neste mesmo arquivo, afirma que formulario em branco recusa e **nao
      // chama** (`expect(registro.caminhos, isEmpty)`). Sem esta linha a isca
      // 6 pedia um 404 de uma chamada que a isca 5 prova que nao sai.
      await _preencherOEndereco(tester);

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
      // Mesmo motivo da isca 6: sem endereco a chamada nao sai.
      await _preencherOEndereco(tester);

      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(
        find.text('Você já fez três pedidos hoje. Tente amanhã.'),
        findsOneWidget,
      );
    });
  });
}
