import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// O ENDERECO DE ENTREGA GUARDADO NO PET (cliente, 27/10/2026)
// ---------------------------------------------------------------------------
//
// ## AS DUAS DECISOES DELE, COM AS DATAS E AS PALAVRAS -- e a de 21/10 cai
//
// **21/10/2026**, escolhendo entre tres opcoes apresentadas, e e esta frase que
// este arquivo media quando se chamava `endereco_guardado_na_conta_test.dart`:
//
//     "Endereco guardado de verdade -- um endereco de entrega salvo na CONTA,
//      reusado em todo pedido e editavel num lugar so."
//
// **27/10/2026**, pedido dele:
//
//     "o endereco de entrega da plaquinha tem que estar dentro do cadastro do
//      pet"
//
// e, com a frase de 21/10 posta na mesa, nomeada e datada:
//
//     "endereco um por pet"
//
// **A de 21/10 CAI e a de 27/10 vale**, e nao foi descuido dele: a decisao
// anterior estava em maos quando a nova foi tomada. Entao este arquivo trocou de
// NOME e de ALVO -- ele mede `/v1/pets/{petId}/delivery-address`, e **nenhum
// caso dele toca `/v1/me/delivery-address`**, que continua existindo (decisao
// dele de 26/10/2026, *"nao apague nada"*) e nao e lido por pedido nenhum.
//
// **O que NAO mudou e o que cada grupo mede**: os desfechos sao os mesmos, e a
// razao de cada grupo e a mesma. Trocou a fonte do endereco, nao o
// comportamento do formulario.
//
// O que cada grupo deste arquivo mede, e por que cada um precisa existir:
//
// A. **O FORMULARIO DO PEDIDO NASCE PREENCHIDO.** E o pedido dele, e sem este
//    grupo nada prova que a leitura chegou na tela.
//
// B. **EDITAR NO PEDIDO NAO MEXE NO GUARDADO.** O grupo mais importante do
//    arquivo. Palavras do briefing: *"mudar o guardado sem avisar e a classe
//    de defeito que o cliente mais sente: ele descobre meses depois, quando a
//    plaquinha chega no endereco errado."* A isca CONTA os `PUT`, e nao olha a
//    tela: uma afirmacao sobre a tela nao enxerga uma escrita de rede.
//
// C. **SEM ENDERECO GUARDADO, O FORMULARIO SE COMPORTA COMO HOJE.** `null` nao
//    e erro, e e o estado de TODO pet cadastrado depois da migracao
//    `20261027000001`.
//
// D. **A LEITURA FALHANDO NAO IMPEDE O PEDIDO.** O endereco guardado e
//    conveniencia; um 500 nele nao pode travar quem quer a plaquinha.
//
// E. **A BUSCA DE CEP CONTINUA FUNCIONANDO SOBRE O PRE-PREENCHIMENTO, e o que
//    a PESSOA digitou continua vencendo.** Este grupo e a prova da unica
//    decisao de engenharia desta frente: as duas decisoes do cliente (17/10
//    "so preenche campo vazio" e 21/10 "nasce preenchido") se cancelavam, e a
//    reconciliacao esta medida aqui nos dois sentidos.
//
// F. **A TELA DE EDITAR: le, grava, e manda os nomes do contrato.**
//
// G. **ALCANCE**: o `Guardar endereco` da tela nova e alcancavel num aparelho
//    pequeno com o teclado aberto. `tocarSemRolar` usa `warnIfMissed: false`,
//    entao um teste de toque passa com o botao atras do teclado -- aqui o que
//    se prova e que ele esta DENTRO da janela visivel, e nao que o toque nao
//    lancou.

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';
const String _refDoServidor = 'Kysr9QvB_0123456789abcd';

/// O SEGUNDO pet, do grupo H. Ele existe porque *"endereco um por pet"* so pode
/// ser medido com mais de um pet: com um unico pet, "um por pet" e "um por
/// conta" produzem exatamente a mesma tela.
const String _idDoSegundoPet = '3f1d7a9e-0000-7000-8000-000000000002';

/// O endereco do segundo pet, DIFERENTE do primeiro em todos os campos que os
/// casos do grupo H olham -- um valor igual nao distinguiria "trocou" de "nao
/// trocou".
const Map<String, dynamic> _guardadoDoSegundoPet = <String, dynamic>{
  'recipient_name': 'Joana Do Segundo',
  'recipient_phone': '+5521988887777',
  'postal_code': '20040020',
  'street': 'Rua Do Segundo Pet',
  'street_number': '222',
  'complement': 'casa 2',
  'neighborhood': 'Bairro Do Segundo',
  'city': 'Cidade Do Segundo',
  'state': 'RJ',
};

/// Um aparelho pequeno com o teclado aberto, para o grupo G.
const Size _aparelhoPequeno = Size(320, 568);
const double _tecladoDp = 270;

/// O endereco GUARDADO na conta, como o servidor o devolve.
///
/// Os valores sao distinguiveis um por um de proposito: um pre-preenchimento
/// que trocasse dois campos de lugar passaria por uma asercao que so contasse
/// campos preenchidos.
const Map<String, dynamic> _guardadoDoServidor = <String, dynamic>{
  'recipient_name': 'Mariana Guardada',
  'recipient_phone': '+5511912345678',
  'postal_code': '04538132',
  'street': 'Rua Guardada do Teste',
  'street_number': '900G',
  'complement': 'conjunto 91',
  'neighborhood': 'Bairro Guardado',
  'city': 'Cidade Guardada',
  'state': 'SP',
};

/// O que a rede recebeu, para as iscas CONTAREM em vez de inferirem.
class _Registro {
  final List<String> postsDoPedido = <String>[];
  final List<String> corposDoPedido = <String>[];

  /// **Os `PUT` do endereco guardado.** O grupo B existe para esta lista ficar
  /// vazia, e contar e a unica forma de ver uma escrita que a tela nao mostra.
  final List<String> putsDoEndereco = <String>[];
  final List<String> corposDoPut = <String>[];

  final List<String> getsDoEndereco = <String>[];
  final List<String> chamadasDeCep = <String>[];
}

/// A rede: um pet do tutor, o pedido da plaquinha, o endereco guardado e o CEP.
///
/// `guardado` nulo responde **corpo `null` cru** em
/// `GET /v1/pets/{petId}/delivery-address` -- e nao `{}` --, porque e isso que o
/// contrato declara (`PetDeliveryAddress` e `DeliveryAddress` ou `null`) e e a
/// forma que o `ApiClient` embrulha em `{'data': null}`. Um duble que
/// respondesse `{}` nao exercitaria a costura que `PetsApi.lerEnderecoDoPet`
/// existe para tratar.
Future<http.Response> Function(http.Request) _rede(
  _Registro registro, {
  Map<String, dynamic>? guardado,
  bool enderecoFora = false,
  bool cepFora = false,
  /// Recusa o POST do pedido, para a isca "pedido que falhou nao guarda nada".
  int statusDoPedido = 200,
  String problemaDoPedido = '',
}) {
  final pet = petDoContrato(id: _idDoPet);
  return (req) async {
    final caminho = req.url.path;

    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      registro.chamadasDeCep.add(req.url.toString());
      if (cepFora) throw const SocketException('servico de CEP fora do ar');
      return json200(<String, dynamic>{
        'cep': '01311-000',
        'logradouro': 'Avenida Da Base',
        'bairro': 'Bairro Da Base',
        'localidade': 'Cidade Da Base',
        'uf': 'RJ',
      });
    }

    // O ENDERECO E DO PET desde 27/10/2026. O duble nao conhece
    // `/v1/me/delivery-address`, e a ausencia e deliberada: qualquer caso que
    // volte a chamar aquela rota cai no 404 do fim desta funcao em vez de passar
    // em silencio sobre a rota que a decisao aposentou.
    if (caminho == '/v1/pets/$_idDoPet/delivery-address') {
      if (req.method == 'GET') {
        registro.getsDoEndereco.add(caminho);
        if (enderecoFora) return problema('server-error', 500);
        if (guardado == null) {
          // CORPO `null` CRU. Ver o cabecalho desta funcao.
          return http.Response(
            'null',
            200,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }
        return json200(guardado);
      }
      if (req.method == 'PUT') {
        registro.putsDoEndereco.add(caminho);
        registro.corposDoPut.add(req.body);
        // Devolve o corpo recebido, como o servidor faz: a resposta do `PUT` e
        // o endereco COMO FICOU GUARDADO.
        return json200(json.decode(req.body) as Map<String, dynamic>);
      }
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
      registro.postsDoPedido.add(caminho);
      registro.corposDoPedido.add(req.body);
      if (statusDoPedido != 200) {
        return problema(problemaDoPedido, statusDoPedido);
      }
      return json200(<String, dynamic>{
        'ref': _refDoServidor,
        'status': 'pending',
        'requested_at': '2026-10-21T12:00:00.000Z',
        'decided_at': null,
        'delivery_state': 'requested',
        'tracking_code': null,
        'shipped_at': null,
        'delivered_at': null,
        'notes': null,
      });
    }
    return http.Response('', 404);
  };
}

/// O campo pelo `rotulo` do proprio [BichuField].
///
/// E nao por `find.text(rotulo)`: o campo OPCIONAL escreve na tela
/// `'<rotulo> (opcional)'`, e `find.text('Complemento')` nao acha nada -- o
/// mesmo cuidado que `solicitar_plaquinha_test.dart` registra.
Finder _campoDoRotulo(String rotulo) {
  return find.byWidgetPredicate(
    (widget) => widget is BichuField && widget.rotulo == rotulo,
    description: 'BichuField de rotulo "$rotulo"',
  );
}

String _textoDoCampo(WidgetTester tester, String rotulo) {
  return tester.widget<BichuField>(_campoDoRotulo(rotulo)).controlador.text.trim();
}

Future<void> _digitar(WidgetTester tester, String rotulo, String valor) async {
  final campo = _campoDoRotulo(rotulo);
  await tester.ensureVisible(campo);
  await tester.enterText(campo, valor);
  await tester.pumpAndSettle();
}

/// O que o [SeletorDeLista] de `Estado` mostra como selecionado.
String? _ufSelecionada(WidgetTester tester) {
  final seletor = find.ancestor(
    of: find.text('Estado'),
    matching: find.byType(SeletorDeLista),
  );
  return tester.widget<SeletorDeLista>(seletor.first).selecionado;
}

void main() {
  // ========================================================================
  // A. O FORMULARIO DO PEDIDO NASCE PREENCHIDO
  // ========================================================================
  group('A. o formulario da plaquinha nasce preenchido com o endereco guardado', () {
    testWidgets('os nove campos chegam do endereco guardado', (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      // **`extra: _idDoPet` passou a ser OBRIGATORIO aqui em 27/10/2026**, e nao
      // e conveniencia de teste: o endereco e DO PET (*"endereco um por pet"*),
      // entao sem pet escolhido nao ha endereco a buscar. Este caso mede quem
      // chega de dentro do produto, com o pet em maos; quem chega por link
      // direto e medido no caso `o endereco so e lido quando o pet e escolhido`.
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      expect(
        registro.getsDoEndereco,
        hasLength(1),
        reason: 'a tela tem de LER o endereco DO PET ao abrir com o pet em maos',
      );
      expect(_textoDoCampo(tester, 'Quem recebe'), 'Mariana Guardada');
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste');
      expect(_textoDoCampo(tester, 'Número'), '900G');
      expect(_textoDoCampo(tester, 'Complemento'), 'conjunto 91');
      expect(_textoDoCampo(tester, 'Bairro'), 'Bairro Guardado');
      expect(_textoDoCampo(tester, 'Cidade'), 'Cidade Guardada');
      expect(_ufSelecionada(tester), 'SP');
      // O CEP aparece MASCARADO: quem le e uma pessoa, e `04538132` num campo
      // de CEP parece defeito.
      expect(_textoDoCampo(tester, 'CEP'), '04538-132');
      // O telefone aparece MASCARADO E SEM A DISCAGEM. **Este `expect` pegou um
      // defeito real**: a primeira versao da tela usava `mascaraDeTelefone`
      // sobre o E.164 e o campo abria `(55) 11912-3456`, tratando os digitos do
      // `+55` como DDD. O certo e `telefoneDoE164`, que tira a discagem antes.
      expect(_textoDoCampo(tester, 'Telefone de quem recebe'), '(11) 91234-5678');
    });

    testWidgets('abrir a tela NAO dispara busca de CEP sobre o endereco guardado',
        (tester) async {
      // Senao, abrir a tela mandaria o CEP da pessoa a um servico de terceiro
      // para confirmar um endereco que ela mesma guardou -- e a busca
      // sobrescreveria o que veio da conta.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
      expect(registro.chamadasDeCep, isEmpty);
    });
  });

  // ========================================================================
  // B. EDITAR NO PEDIDO NAO MEXE NO ENDERECO GUARDADO
  // ========================================================================
  group('B. editar o endereco no pedido NAO muda o guardado', () {
    testWidgets('ISCA — o pedido inteiro, com o endereco todo trocado, nao faz NENHUM `PUT`',
        (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      // Troca TODOS os campos de texto do endereco, que e o caso em que a
      // tentacao de "salvar junto" e maior.
      await _digitar(tester, 'Quem recebe', 'Outra Pessoa No Pedido');
      await _digitar(tester, 'CEP', '20040020');
      await _digitar(tester, 'Rua', 'Rua Do Pedido Apenas');
      await _digitar(tester, 'Número', '7');
      await _digitar(tester, 'Complemento', 'fundos');
      await _digitar(tester, 'Bairro', 'Bairro Do Pedido');
      await _digitar(tester, 'Cidade', 'Cidade Do Pedido');
      await _digitar(tester, 'Telefone de quem recebe', '21999887766');

      await tocar(tester, find.text('Pedir a plaquinha'));

      // O pedido FOI feito -- sem isto, zero `PUT` seria verdade por nada ter
      // acontecido, e a isca estaria medindo uma tela parada.
      expect(
        registro.postsDoPedido,
        hasLength(1),
        reason: 'CONTROLE POSITIVO: sem o pedido ter saido, "zero PUT" nao prova nada',
      );
      expect(
        registro.putsDoEndereco,
        isEmpty,
        reason: 'o formulario do pedido escreveu no endereco GUARDADO. Mudar o '
            'guardado em silencio e a classe de defeito que o cliente mais '
            'sente: ele descobre meses depois, quando a plaquinha chega no '
            'endereco de antes',
      );
      // E o que foi editado foi para o PEDIDO, com os nomes do contrato.
      final corpo = json.decode(registro.corposDoPedido.single) as Map<String, dynamic>;
      final endereco = corpo['delivery_address'] as Map<String, dynamic>;
      expect(endereco['street'], 'Rua Do Pedido Apenas');
      expect(endereco['postal_code'], '20040020');
    });

    testWidgets('ISCA — nem o pedido SEM edicao nenhuma faz `PUT`', (tester) async {
      // O caminho mais provavel de um "salvar junto" acidental: o endereco veio
      // da conta e vai igual, e seria "inofensivo" reescrever.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
      await tocar(tester, find.text('Pedir a plaquinha'));
      expect(registro.postsDoPedido, hasLength(1), reason: 'CONTROLE POSITIVO');
      expect(registro.putsDoEndereco, isEmpty);
    });
  });

  // ========================================================================
  // H. O PRIMEIRO PEDIDO GUARDA SOZINHO -- e so o primeiro
  // ========================================================================
  //
  // Decisao do cliente, 21/10/2026, nas palavras dele: *"Se nao ha nada
  // guardado, o endereco do primeiro pedido vira o da conta. Nao sobrescreve
  // nada, porque nao havia nada -- e dai em diante 'editar no pedido nao altera
  // o guardado' continua valendo integralmente. A pessoa ganha o beneficio sem
  // precisar saber que a tela existe. A tela continua sendo o unico lugar de
  // editar."*
  //
  // **AS QUATRO ISCAS DESTE GRUPO CONTAM `PUT`, e nao olham a tela.** Uma
  // afirmacao sobre a tela nao enxerga uma escrita de rede -- e e justamente a
  // escrita que esta decisao autoriza em UM caso e proibe em todos os outros.
  // Sem o par (escreve quando devia / nao escreve quando nao devia), o
  // mecanismo passaria com qualquer implementacao: "nunca escreve" satisfaz
  // metade, e "escreve sempre" satisfaz a outra.
  group('H. o primeiro pedido guarda sozinho, e so o primeiro', () {
    testWidgets('ISCA — PRIMEIRO pedido, sem nada guardado: ESCREVE o endereco na conta',
        (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Primeiro Pedido');
      await _digitar(tester, 'CEP', '01311000');
      await _digitar(tester, 'Número', '42');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.postsDoPedido, hasLength(1), reason: 'CONTROLE POSITIVO: o pedido saiu');
      expect(
        registro.putsDoEndereco,
        hasLength(1),
        reason: 'o primeiro pedido NAO guardou o endereco na conta. Sem isto, quem '
            'nunca abrir `Meus dados > Endereco de entrega` nunca ganha o beneficio '
            'que o cliente autorizou',
      );
      // E o que foi guardado e o endereco DO PEDIDO, com os nomes do contrato.
      final corpo = json.decode(registro.corposDoPut.single) as Map<String, dynamic>;
      expect(corpo['recipient_name'], 'Primeiro Pedido');
      expect(corpo['street'], 'Avenida Da Base', reason: 'a rua veio da busca de CEP');
      expect(corpo['postal_code'], '01311000', reason: 'sem mascara, como o contrato exige');
      expect(corpo['recipient_phone'], '+5511987654321', reason: 'E.164, nunca o da tela');
    });

    testWidgets('ISCA — SEGUNDO pedido, com endereco diferente, NAO escreve', (tester) async {
      // **A isca central da decisao.** Ha endereco guardado, a pessoa troca
      // tudo no formulario, e o guardado tem de ficar intacto -- "editar no
      // pedido nao altera o guardado" vale integralmente da segunda vez em
      // diante.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Endereco Diferente');
      await _digitar(tester, 'CEP', '20040020');
      await _digitar(tester, 'Rua', 'Rua Diferente Do Pedido');
      await _digitar(tester, 'Número', '7');
      await _digitar(tester, 'Bairro', 'Bairro Diferente');
      await _digitar(tester, 'Cidade', 'Cidade Diferente');
      await _digitar(tester, 'Telefone de quem recebe', '21999887766');
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.postsDoPedido, hasLength(1), reason: 'CONTROLE POSITIVO: o pedido saiu');
      expect(
        registro.putsDoEndereco,
        isEmpty,
        reason: 'o segundo pedido sobrescreveu o endereco guardado. E a classe de '
            'defeito que o cliente mais sente: ele descobre meses depois, quando a '
            'plaquinha chega no endereco errado',
      );
    });

    testWidgets('ISCA — PEDIDO QUE FALHOU nao guarda nada', (tester) async {
      // A terceira exigencia, e e onde esta classe falha na pratica: a conta
      // ganharia um endereco que a pessoa nunca confirmou, e ele passaria a
      // preencher todos os pedidos seguintes.
      final registro = _Registro();
      await abrirOApp(
        tester,
        rede: _rede(
          registro,
          guardado: null,
          statusDoPedido: 429,
          problemaDoPedido: 'rate-limited',
        ),
      );
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Pedido Recusado');
      await _digitar(tester, 'CEP', '01311000');
      await _digitar(tester, 'Número', '42');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(
        registro.postsDoPedido,
        hasLength(1),
        reason: 'CONTROLE POSITIVO: o pedido FOI tentado. Sem isto, "zero PUT" seria '
            'verdade por nada ter acontecido',
      );
      expect(
        registro.putsDoEndereco,
        isEmpty,
        reason: 'o pedido foi RECUSADO e o endereco entrou na conta. A pessoa nunca '
            'confirmou esse endereco, e ele passaria a preencher todo pedido seguinte',
      );
    });

    testWidgets('ISCA — LEITURA FORA DO AR nao guarda nada, porque nao se sabe se havia',
        (tester) async {
      // O terceiro estado, e o que me fez usar `bool?` em vez de `bool`. Um 500
      // na leitura NAO prova que a conta esta sem endereco: escrever aqui
      // sobrescreveria um endereco existente pela porta dos fundos.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, enderecoFora: true));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Leitura Fora');
      await _digitar(tester, 'CEP', '01311000');
      await _digitar(tester, 'Número', '42');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(registro.postsDoPedido, hasLength(1), reason: 'CONTROLE POSITIVO: o pedido saiu');
      expect(
        registro.putsDoEndereco,
        isEmpty,
        reason: 'a leitura do endereco guardado FALHOU e o pedido escreveu mesmo '
            'assim. Ninguem sabe se havia endereco: se havia, este `PUT` acabou de '
            'sobrescrever a casa da pessoa',
      );
    });

    testWidgets('NAO ha caixa nem pergunta no formulario do pedido', (tester) async {
      // Ele descartou essa saida explicitamente: a tela continua sendo o unico
      // lugar de EDITAR, e o pedido guarda sem perguntar porque so guarda
      // quando nao havia nada a sobrescrever.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
      expect(find.byType(Checkbox), findsNothing);
      expect(find.byType(Switch), findsNothing);
      expect(find.textContaining('Guardar'), findsNothing);
      expect(find.textContaining('Salvar'), findsNothing);
    });
  });

  // ========================================================================
  // C. SEM ENDERECO GUARDADO, O FORMULARIO SE COMPORTA COMO HOJE
  // ========================================================================
  group('C. sem endereco guardado o formulario abre vazio', () {
    testWidgets('corpo `null` nao vira nove campos preenchidos de nada', (tester) async {
      // O defeito que este caso persegue e concreto: ler `json['street']` de um
      // corpo `null` embrulhado daria cadeia vazia, e os campos abririam
      // "preenchidos" com nada -- pior que vazios, porque o `_preencherSeVazio`
      // da busca de CEP passaria a achar que a pessoa escreveu algo.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      expect(registro.getsDoEndereco, hasLength(1), reason: 'CONTROLE POSITIVO: a leitura ocorreu');
      for (final rotulo in <String>[
        'Quem recebe',
        'CEP',
        'Rua',
        'Número',
        'Complemento',
        'Bairro',
        'Cidade',
        'Telefone de quem recebe',
      ]) {
        expect(_textoDoCampo(tester, rotulo), isEmpty, reason: '$rotulo abriu preenchido');
      }
      expect(_ufSelecionada(tester), isNull);
    });

    testWidgets('e a busca de CEP volta a preencher, como antes desta frente', (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
      await _digitar(tester, 'CEP', '01311000');
      expect(registro.chamadasDeCep, isNotEmpty, reason: 'CONTROLE POSITIVO: a busca saiu');
      expect(_textoDoCampo(tester, 'Rua'), 'Avenida Da Base');
      expect(_textoDoCampo(tester, 'Bairro'), 'Bairro Da Base');
      expect(_ufSelecionada(tester), 'RJ');
    });
  });

  // ========================================================================
  // D. A LEITURA FALHANDO NAO IMPEDE O PEDIDO
  // ========================================================================
  group('D. um 500 na leitura do endereco guardado nao trava o pedido', () {
    testWidgets('ISCA — com a leitura fora do ar, o pedido ainda vai', (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, enderecoFora: true));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Alguem Que Digitou');
      await _digitar(tester, 'CEP', '01311000');
      await _digitar(tester, 'Número', '10');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Pedir a plaquinha'));

      expect(
        registro.postsDoPedido,
        hasLength(1),
        reason: 'a leitura do endereco guardado e CONVENIENCIA. Um 500 nela nao '
            'pode impedir ninguem de pedir a plaquinha',
      );
    });
  });

  // ========================================================================
  // E. A RECONCILIACAO: a base vence o que veio da CONTA, e perde para o que a
  //    PESSOA digitou
  // ========================================================================
  group('E. a busca de CEP sobre o formulario pre-preenchido', () {
    testWidgets('ISCA — CEP novo SUBSTITUI o que veio do pet', (tester) async {
      // SEM A RECONCILIACAO ESTE CASO REPROVA, e e o defeito que ela existe
      // para impedir: com tudo pre-preenchido nada esta vazio, a regra de
      // 17/10 lida como `isEmpty` desliga a busca, e quem mudou de casa digita
      // o CEP novo e fica com a rua antiga na tela -- sem nada ter dado erro,
      // e com a plaquinha indo para o endereco de antes.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste');

      await _digitar(tester, 'CEP', '01311000');

      expect(registro.chamadasDeCep, isNotEmpty, reason: 'CONTROLE POSITIVO: a busca saiu');
      expect(
        _textoDoCampo(tester, 'Rua'),
        'Avenida Da Base',
        reason: 'o valor que veio do PET tem de ceder a base: ele e '
            'conveniencia, e nao algo que a pessoa escreveu nesta sessao',
      );
      expect(_textoDoCampo(tester, 'Bairro'), 'Bairro Da Base');
      expect(_textoDoCampo(tester, 'Cidade'), 'Cidade Da Base');
      expect(_ufSelecionada(tester), 'RJ');
    });

    testWidgets('ISCA — mas o que a PESSOA digitou nao e substituido (17/10, intacta)',
        (tester) async {
      // A outra metade, e sem ela a correcao acima teria afrouxado a decisao de
      // 17/10: *"o que a pessoa ja escreveu vence o que a base devolve"*.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      // A pessoa escreve a rua A MAO, e so depois mexe no CEP.
      await _digitar(tester, 'Rua', 'A Rua Que Eu Escrevi');
      await _digitar(tester, 'CEP', '01311000');

      expect(registro.chamadasDeCep, isNotEmpty, reason: 'CONTROLE POSITIVO: a busca saiu');
      expect(
        _textoDoCampo(tester, 'Rua'),
        'A Rua Que Eu Escrevi',
        reason: 'a base sobrescreveu o que a PESSOA digitou. A decisao de 17/10 '
            'e que o que ela escreveu vence -- ela esta olhando o endereco dela, '
            'e a base erra',
      );
      // E o campo em que ela NAO mexeu cede, no mesmo passo: as duas regras
      // convivem campo a campo, e nao tela a tela.
      expect(_textoDoCampo(tester, 'Bairro'), 'Bairro Da Base');
    });
  });

  // ========================================================================
  // F. A TELA DE EDITAR: o "lugar so"
  // ========================================================================
  group('F. a tela de `Endereco de entrega`', () {
    testWidgets('abre com o endereco guardado', (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      expect(registro.getsDoEndereco, hasLength(1));
      expect(_textoDoCampo(tester, 'Quem recebe'), 'Mariana Guardada');
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste');
      expect(_textoDoCampo(tester, 'CEP'), '04538-132');
      expect(_ufSelecionada(tester), 'SP');
    });

    testWidgets('abre VAZIA quando nao ha endereco guardado, e sem faixa de erro',
        (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));
      expect(_textoDoCampo(tester, 'Rua'), isEmpty);
      // `null` NAO e erro: e o estado normal de quem nunca guardou endereco.
      expect(find.textContaining('servidor'), findsNothing);
    });

    testWidgets('`Guardar endereco` manda os nomes do contrato, e o CEP sem mascara',
        (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      await _digitar(tester, 'Quem recebe', 'Quem Recebe Aqui');
      await _digitar(tester, 'CEP', '01311000');
      await _digitar(tester, 'Número', '1578B');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Guardar endereço'));

      expect(registro.putsDoEndereco, hasLength(1));
      final corpo = json.decode(registro.corposDoPut.single) as Map<String, dynamic>;
      expect(corpo['recipient_name'], 'Quem Recebe Aqui');
      // SEM MASCARA: o contrato declara `^[0-9]{8}$`, e a mascara e do olho.
      expect(corpo['postal_code'], '01311000');
      expect(corpo['street_number'], '1578B');
      // E.164, nunca o que esta na tela.
      expect(corpo['recipient_phone'], '+5511987654321');
      // A rua veio da busca de CEP, e viaja como `street`.
      expect(corpo['street'], 'Avenida Da Base');
      expect(corpo['state'], 'RJ');
    });

    testWidgets('ISCA — campo faltando diz QUAL falta, e nao faz `PUT`', (tester) async {
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      // So o destinatario. Faltam CEP, rua, numero, bairro, cidade, UF e
      // telefone.
      await _digitar(tester, 'Quem recebe', 'So O Nome');
      await tocar(tester, find.text('Guardar endereço'));

      expect(
        registro.putsDoEndereco,
        isEmpty,
        reason: 'gravou endereco incompleto: o banco recusaria, e a pessoa veria '
            'um erro de servidor em vez de saber que campo falta',
      );
      expect(find.text('O CEP tem 8 dígitos.'), findsOneWidget);
      expect(find.text('Digite a rua.'), findsOneWidget);
      expect(find.text('Escolha o estado.'), findsOneWidget);
    });

    testWidgets('NAO ha botao de apagar o endereco', (tester) async {
      // A ausencia e deliberada, e nao falta de implementacao: a decisao do
      // cliente de 17/10 e *"voce so deve apagar as informacoes, caso o
      // usuario remova o pet ou delete a conta"*. Um botao aqui abriria uma
      // porta que a decisao nao abriu -- e quem trocar de casa usa o
      // formulario.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));
      expect(find.textContaining('Apagar'), findsNothing);
      expect(find.textContaining('Remover'), findsNothing);
      expect(find.textContaining('Excluir'), findsNothing);
    });

    testWidgets('a tela DIZ que mudar o endereco no pedido nao altera este', (tester) async {
      // Sem esta frase a pessoa nao tem como saber, e descobrir pela plaquinha
      // que chegou no lugar errado e exatamente o desfecho que a decisao do
      // cliente evita.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: null));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));
      expect(find.textContaining('sem alterar este'), findsOneWidget);
    });
  });

  // ========================================================================
  // G. ALCANCE
  // ========================================================================
  //
  // **A PRIMEIRA VERSAO DESTE GRUPO AFIRMAVA UMA COISA FALSA**, e a reprova
  // dela e o motivo de ele estar escrito assim. Ela exigia que o
  // `Guardar endereco` ficasse dentro da janela visivel COM O TECLADO ABERTO, e
  // reprovou: medido, centro em `Offset(160, 528)` numa janela que termina em
  // 298.
  //
  // Isso **nao e defeito desta tela**. `BarraDeAcaoFixa` vive em
  // `Scaffold.bottomNavigationBar`, e o `_ScaffoldLayout.performLayout` ancora
  // a `bottomNavigationBar` em `size.height` -- so o `body` recebe o recuo do
  // teclado. Com o teclado aberto a barra fica ATRAS dele, e o cabecalho do
  // componente diz isso por extenso, com a medicao de 23/09/2026 e o motivo de
  // ser aceitavel: como o `Scaffold` toma o MAIOR dos dois recuos, a barra
  // custa zero de area rolavel enquanto se digita.
  //
  // Vale para TODA tela de formulario deste app, inclusive a de solicitar a
  // plaquinha. Entao o que se mede aqui e o que de fato e desta frente:
  //
  //   1. com o teclado FECHADO, a acao esta alcancavel -- e a reivindicacao
  //      real de uma barra ancorada;
  //   2. o ULTIMO campo da regiao rolavel e alcancavel por rolagem com o
  //      teclado aberto -- esta e a obrigacao de alcance de quem acrescenta
  //      controle em regiao rolavel, e e o unico lugar onde esta frente
  //      acrescentou.
  //
  // **Sobre a barra atras do teclado, este grupo e GUARDA e nao isca provada**:
  // nenhuma isca minha o derruba, porque o comportamento e deliberado e
  // documentado no componente. Eu nao o mudei e nao o medi como defeito.
  group('G. alcance na tela de `Endereco de entrega`', () {
    testWidgets('com o teclado FECHADO, `Guardar endereco` esta dentro da janela',
        (tester) async {
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = _aparelhoPequeno;
      // Sem `viewInsets`: teclado fechado.
      addTearDown(tester.view.reset);

      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      final alvo = find.text('Guardar endereço');
      expect(alvo, findsOneWidget, reason: 'o botao nem foi construido');
      final centro = tester.getCenter(alvo);
      final janela = Rect.fromLTWH(
        0,
        0,
        _aparelhoPequeno.width,
        _aparelhoPequeno.height,
      );
      expect(
        janela.contains(centro),
        isTrue,
        reason: 'o `Guardar endereço` ($centro) esta fora da tela ($janela) com o '
            'teclado FECHADO. Ai seria defeito desta tela',
      );
    });

    testWidgets('o ULTIMO campo da regiao rolavel e alcancavel com o teclado aberto',
        (tester) async {
      // **ALCANCE, e nao "o toque nao lancou".** `tocarSemRolar` usa
      // `warnIfMissed: false`, entao um teste de toque passa com o campo atras
      // do teclado. O que se prova aqui e que a rolagem CHEGA nele e que, depois
      // de chegar, o centro dele esta na janela que sobra.
      tester.view.devicePixelRatio = 1.0;
      tester.view.physicalSize = _aparelhoPequeno;
      tester.view.viewInsets = const FakeViewPadding(bottom: _tecladoDp);
      addTearDown(tester.view.reset);

      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      final ultimo = _campoDoRotulo('Telefone de quem recebe');
      await tester.ensureVisible(ultimo);
      await tester.pumpAndSettle();

      final centro = tester.getCenter(ultimo);
      final janela = Rect.fromLTWH(
        0,
        0,
        _aparelhoPequeno.width,
        _aparelhoPequeno.height - _tecladoDp,
      );
      expect(
        janela.contains(centro),
        isTrue,
        reason: 'o ultimo campo do formulario ($centro) nao chega a janela '
            'visivel ($janela) nem depois de rolar. Quem digitar o telefone '
            'estaria digitando num campo que nao ve',
      );
    });
  });

  // ========================================================================
  // I. A RECONCILIACAO NA TELA DE EDITAR: o defeito que corrompia o guardado
  // ========================================================================
  //
  // Medido na revisao de 21/10/2026. A tela do PEDIDO ganhou a reconciliacao
  // (grupo E) e a tela de EDITAR nasceu sem ela -- e e a tela de editar que
  // ESCREVE na conta. Sendo o "lugar so", ela abre preenchida pela conta, e
  // entao nada esta vazio: `_preencherSeVazio` lido como `isEmpty` puro
  // desligava a busca de CEP por completo.
  //
  // O desfecho: quem mudava de casa digitava o CEP novo e GUARDAVA rua, bairro,
  // cidade e UF antigos, em silencio, com a tela dizendo `Endereco guardado.`
  // -- a plaquinha indo para o endereco ANTERIOR, sem a pessoa ter como saber.
  //
  // As iscas aqui CONTAM O CORPO DO `PUT`, e nao olham a tela: o que corrompe o
  // dado guardado e o que viaja na rede, e uma asercao sobre o campo na tela
  // nao enxerga o que foi escrito.
  group('I. a busca de CEP sobre a tela de editar o endereco guardado', () {
    testWidgets(
        'ISCA — CEP novo SUBSTITUI rua, bairro, cidade e UF que vieram da conta',
        (tester) async {
      // DESLIGUE A RECONCILIACAO E ESTE CASO REPROVA: o `PUT` sai com
      // `Rua Guardada do Teste` / `Bairro Guardado` / `Cidade Guardada` / `SP`
      // debaixo do CEP NOVO -- o endereco corrompido, guardado com 200.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      // A tela abriu com o endereco da conta: a linha de base da isca.
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste');
      expect(_ufSelecionada(tester), 'SP');

      // Mudou de casa: digita SO o CEP novo, que e o que a pessoa faz.
      await _digitar(tester, 'CEP', '01311000');
      expect(registro.chamadasDeCep, isNotEmpty, reason: 'CONTROLE POSITIVO: a busca saiu');

      await tocar(tester, find.text('Guardar endereço'));

      expect(registro.putsDoEndereco, hasLength(1), reason: 'CONTROLE POSITIVO: guardou');
      final corpo = json.decode(registro.corposDoPut.single) as Map<String, dynamic>;
      expect(corpo['postal_code'], '01311000');
      expect(
        corpo['street'],
        'Avenida Da Base',
        reason: 'GUARDOU A RUA ANTIGA debaixo do CEP NOVO. O valor que veio da '
            'CONTA tem de ceder a base: ele e conveniencia, e nao algo que a '
            'pessoa escreveu nesta sessao. A plaquinha iria para o endereco '
            'anterior, e a tela disse que salvou',
      );
      expect(corpo['neighborhood'], 'Bairro Da Base', reason: 'guardou o bairro antigo');
      expect(corpo['city'], 'Cidade Da Base', reason: 'guardou a cidade antiga');
      expect(
        corpo['state'],
        'RJ',
        reason: 'guardou a UF antiga. Pior desfecho possivel: `SP` com a rua, o '
            'bairro e a cidade do Rio -- um endereco misturado de duas cidades',
      );
    });

    testWidgets('ISCA — mas o que a PESSOA digitou nao e substituido (17/10, intacta)',
        (tester) async {
      // A outra metade, e sem ela a correcao acima teria afrouxado a decisao de
      // 17/10: *"o que a pessoa ja escreveu vence o que a base devolve"*. Uma
      // correcao que trocasse `isEmpty` por "sempre sobrescreve" passaria na
      // isca de cima e REPROVARIA aqui.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      // Escreve a rua A MAO, escolhe a UF A MAO, e so depois mexe no CEP.
      await _digitar(tester, 'Rua', 'A Rua Que Eu Escrevi');
      // `escolherEstadoNaLista` e nao um toque a mao: a folha dos 27 ROLA, e o
      // nome do estado tambem casa o campo `Cidade` atras dela. As tres
      // armadilhas estao escritas no proprio ajudante.
      await escolherEstadoNaLista(tester, 'MG');
      await _digitar(tester, 'CEP', '01311000');
      expect(registro.chamadasDeCep, isNotEmpty, reason: 'CONTROLE POSITIVO: a busca saiu');

      await tocar(tester, find.text('Guardar endereço'));

      expect(registro.putsDoEndereco, hasLength(1), reason: 'CONTROLE POSITIVO: guardou');
      final corpo = json.decode(registro.corposDoPut.single) as Map<String, dynamic>;
      expect(
        corpo['street'],
        'A Rua Que Eu Escrevi',
        reason: 'a base sobrescreveu o que a PESSOA digitou, e guardou. A '
            'decisao de 17/10 e que o que ela escreveu vence -- ela esta olhando '
            'o endereco dela, e a base erra',
      );
      expect(
        corpo['state'],
        'MG',
        reason: 'a base sobrescreveu a UF que a PESSOA escolheu a mao',
      );
      // E o campo em que ela NAO mexeu cede, no mesmo passo: as duas regras
      // convivem campo a campo, e nao tela a tela.
      expect(corpo['neighborhood'], 'Bairro Da Base');
      expect(corpo['city'], 'Cidade Da Base');
    });

    testWidgets(
        'CONTROLE POSITIVO — sem mexer no CEP, o caminho normal guarda o que a conta trouxe',
        (tester) async {
      // A reconciliacao nao pode ter virado "a base sobrescreve sempre": quem
      // abre a tela, corrige UM campo e guarda tem de guardar o resto como
      // estava. Sem busca de CEP nenhuma, nada se mexe.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));

      await _digitar(tester, 'Número', '1001');
      await tocar(tester, find.text('Guardar endereço'));

      expect(registro.chamadasDeCep, isEmpty, reason: 'ninguem mexeu no CEP');
      expect(registro.putsDoEndereco, hasLength(1));
      final corpo = json.decode(registro.corposDoPut.single) as Map<String, dynamic>;
      expect(corpo['street_number'], '1001');
      expect(corpo['street'], 'Rua Guardada do Teste');
      expect(corpo['neighborhood'], 'Bairro Guardado');
      expect(corpo['city'], 'Cidade Guardada');
      expect(corpo['state'], 'SP');
      expect(corpo['postal_code'], '04538132');
      expect(find.text('Endereço guardado.'), findsOneWidget);
    });
  });

  // ========================================================================
  // H. UM POR PET, E A TROCA DE PET NAO MISTURA DOIS ENDERECOS
  //    (cliente, 27/10/2026: *"endereco um por pet"*)
  // ========================================================================
  //
  // **ESTE GRUPO NAO EXISTIA, e nao podia existir:** no modelo da CONTA
  // (21/10/2026) o endereco era o mesmo para qualquer pet, entao trocar de pet
  // nao trocava a fonte e nao havia nada a medir. Ele e a prova da unica coisa
  // que a decisao de 27/10 acrescentou de comportamento novo.
  group('H. um endereco por pet, e trocar de pet troca a fonte', () {
    testWidgets('o endereco so e lido quando o pet e ESCOLHIDO (link direto)',
        (tester) async {
      // Quem chega por link direto nao tem pet em maos. Ler o endereco ali seria
      // ler o endereco de quem? Nao ha pet, e nao ha endereco a buscar.
      final registro = _Registro();
      await abrirOApp(tester, rede: _rede(registro, guardado: _guardadoDoServidor));
      await irPara(tester, Rotas.solicitarPlaquinha);

      expect(
        registro.getsDoEndereco,
        isEmpty,
        reason: 'sem pet escolhido nao ha endereco a ler, e uma leitura aqui '
            'seria a volta do modelo da conta por outro caminho',
      );
      expect(_textoDoCampo(tester, 'Rua'), isEmpty);

      // A pessoa escolhe o pet. **AGORA** ha o que ler.
      await tocar(tester, find.text('Nina'));
      await tester.pumpAndSettle();

      expect(
        registro.getsDoEndereco,
        hasLength(1),
        reason: 'escolher o pet tem de disparar a leitura do endereco DELE',
      );
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste');
    });

    testWidgets('ISCA — trocar de pet NAO deixa a rua do primeiro no formulario',
        (tester) async {
      // O DEFEITO QUE ESTA ISCA PERSEGUE, e ele e silencioso: `_preencherDoGuardado`
      // so preenche campo VAZIO, e depois da primeira carga nada esta vazio.
      // Sem `soltarOQueVeioDoGuardado`, o endereco do segundo pet nao entraria
      // em campo nenhum e o pedido sairia com a rua do PRIMEIRO -- sem nada ter
      // dado erro, e com a plaquinha do pet B indo para o endereco do pet A.
      final registro = _Registro();
      await abrirOApp(tester, rede: _redeDeDoisPets(registro));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      expect(_textoDoCampo(tester, 'Rua'), 'Rua Guardada do Teste',
          reason: 'CONTROLE POSITIVO: o endereco do primeiro pet chegou');

      await tocar(tester, find.text('Rex'));
      await tester.pumpAndSettle();

      expect(
        _textoDoCampo(tester, 'Rua'),
        'Rua Do Segundo Pet',
        reason: 'o formulario ficou com a rua do pet ANTERIOR. Trocar de pet '
            'troca a fonte do endereco -- e o endereco de um pet so e dele',
      );
      expect(_textoDoCampo(tester, 'Cidade'), 'Cidade Do Segundo');
      expect(_ufSelecionada(tester), 'RJ');
      expect(
        registro.getsDoEndereco,
        hasLength(2),
        reason: 'uma leitura por pet: a do pet inicial e a do pet escolhido',
      );
    });

    testWidgets('ISCA — o que a PESSOA digitou SOBREVIVE a troca de pet', (tester) async {
      // A outra metade, e sem ela o conserto acima seria um apagador: limpar
      // TUDO na troca de pet apagaria o que ela acabou de escrever. O toque dela
      // ja tira o campo do conjunto `daConta`, entao ele nao e solto.
      final registro = _Registro();
      await abrirOApp(tester, rede: _redeDeDoisPets(registro));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);

      await _digitar(tester, 'Quem recebe', 'Quem Eu Escrevi A Mao');
      await tocar(tester, find.text('Rex'));
      await tester.pumpAndSettle();

      expect(
        _textoDoCampo(tester, 'Quem recebe'),
        'Quem Eu Escrevi A Mao',
        reason: 'trocar de pet apagou o que a PESSOA digitou. So o que veio do '
            'endereco guardado sai; o que ela escreveu e dela',
      );
      // E o que veio do guardado cedeu, como no caso acima.
      expect(_textoDoCampo(tester, 'Rua'), 'Rua Do Segundo Pet');
    });

    testWidgets('o `PUT` do primeiro pedido vai para o CAMINHO daquele pet', (tester) async {
      // "Um por pet" nao e so leitura: a escrita do primeiro pedido tem de cair
      // no pet certo. Um `PUT` em `/v1/me/delivery-address` aqui seria a volta do
      // modelo da conta -- e o duble nem conhece aquela rota.
      final registro = _Registro();
      await abrirOApp(tester, rede: _redeDeDoisPets(registro));
      await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoSegundoPet);

      await _digitar(tester, 'Quem recebe', 'Alguem Do Segundo');
      await _digitar(tester, 'CEP', '20040020');
      await _digitar(tester, 'Rua', 'Rua Digitada');
      await _digitar(tester, 'Número', '12');
      await _digitar(tester, 'Bairro', 'Bairro Digitado');
      await _digitar(tester, 'Cidade', 'Cidade Digitada');
      await _digitar(tester, 'Telefone de quem recebe', '11987654321');
      await tocar(tester, find.text('Pedir a plaquinha'));
      await tester.pumpAndSettle();

      expect(registro.postsDoPedido, hasLength(1), reason: 'CONTROLE POSITIVO: o pedido saiu');
      expect(
        registro.putsDoEndereco,
        <String>['/v1/pets/$_idDoSegundoPet/delivery-address'],
        reason: 'o endereco do primeiro pedido tem de ser guardado NO PET do '
            'pedido, e em nenhum outro lugar',
      );
    });
  });
}

/// DOIS pets, com DOIS enderecos diferentes -- a rede do grupo H.
///
/// **Separada de [_rede], e nao um parametro a mais nela:** [_rede] serve um pet
/// e e usada por todos os outros grupos, e alargar a assinatura dela faria cada
/// um daqueles casos passar a declarar um segundo pet que nao usa. O que esta
/// rede acrescenta e exatamente o que o grupo H mede.
///
/// O **segundo** pet nao tem endereco guardado, e a ausencia e proposital: ela e
/// o que permite o caso do `PUT` provar que o primeiro pedido guarda NAQUELE pet.
Future<http.Response> Function(http.Request) _redeDeDoisPets(_Registro registro) {
  final primeiro = petDoContrato(id: _idDoPet);
  final segundo = petDoContrato(id: _idDoSegundoPet, nome: 'Rex');
  return (req) async {
    final caminho = req.url.path;

    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      registro.chamadasDeCep.add(req.url.toString());
      return json200(<String, dynamic>{
        'cep': '01311-000',
        'logradouro': 'Avenida Da Base',
        'bairro': 'Bairro Da Base',
        'localidade': 'Cidade Da Base',
        'uf': 'RJ',
      });
    }

    if (caminho == '/v1/pets/$_idDoPet/delivery-address' && req.method == 'GET') {
      registro.getsDoEndereco.add(caminho);
      return json200(_guardadoDoServidor);
    }
    if (caminho == '/v1/pets/$_idDoSegundoPet/delivery-address') {
      if (req.method == 'GET') {
        registro.getsDoEndereco.add(caminho);
        return json200(_guardadoDoSegundoPet);
      }
      if (req.method == 'PUT') {
        registro.putsDoEndereco.add(caminho);
        registro.corposDoPut.add(req.body);
        return json200(json.decode(req.body) as Map<String, dynamic>);
      }
    }

    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[primeiro, segundo],
      });
    }
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/pets/$_idDoSegundoPet/tag-requests' && req.method == 'POST') {
      registro.postsDoPedido.add(caminho);
      registro.corposDoPedido.add(req.body);
      return json200(<String, dynamic>{
        'ref': _refDoServidor,
        'status': 'pending',
        'requested_at': '2026-10-27T12:00:00.000Z',
        'decided_at': null,
        'delivery_state': 'requested',
        'tracking_code': null,
        'shipped_at': null,
        'delivered_at': null,
        'notes': null,
      });
    }
    return http.Response('', 404);
  };
}
