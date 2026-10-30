// A SIGLA DO ESTADO, NAS SEIS TELAS QUE TEM CEP (30/10/2026).
//
// ===========================================================================
// O DEFEITO QUE A DUPLICACAO ESCONDIA
// ===========================================================================
// O bloco de CEP estava escrito SEIS vezes, e TRES copias nao conferiam a
// sigla que a base de CEP devolvia: `tela_dados_pessoais`,
// `tela_endereco_de_entrega` e `tela_solicitar_plaquinha` punham no formulario
// qualquer par de letras. As outras tres chamavam `siglaDeEstadoValida`, de
// `api/estados_brasileiros.dart`, que existe desde sempre.
//
// O que isso custava a quem usa: uma base de CEP que devolvesse `XX` deixava o
// campo `Estado` escolhido com um estado que nao existe. O endereco de entrega
// e o pedido da plaquinha VIAJAM no corpo (`state`, `pattern: ^[A-Z]{2}$` --
// `XX` passa no padrao do contrato), e a plaquinha ia para um estado
// inexistente nos Correios; em `Meus dados` a sigla ruim ficava na regiao de
// referencia do tutor, que e o que decide o raio de alerta.
//
// Depois desta entrega o bloco e UM (`lib/formulario/bloco_de_cep.dart`) e a
// conferencia vale nas seis.
//
// ===========================================================================
// UM CASO POR TELA, E POR QUE NAO BASTA MEDIR A PECA
// ===========================================================================
// `bloco_de_cep_unico_test.dart` mede a peca por dentro e a isca estrutural.
// Isto aqui monta o FORMULARIO DE VERDADE de cada uma das seis e digita o CEP:
// e o unico jeito de pegar uma tela ligada errado a peca -- um
// `aoEscolherEstado` que escrevesse na variavel de outro campo passaria no
// caso de `XX` pelo motivo errado, porque `XX` nao entrar e tambem o que
// acontece quando a peca nao esta ligada em nada.
//
// **POR ISSO CADA CASO FAZ AS DUAS BUSCAS, na mesma tela:**
//
//   1. `22041001`, cuja base devolve `uf: XX`  -> o seletor fica VAZIO;
//   2. `01311000`, cuja base devolve `uf: RJ`  -> o seletor fica `RJ`.
//
// A segunda e o CONTROLE POSITIVO da primeira. Sem ela, uma tela em que o
// seletor nunca se preenche -- defeito pior que o consertado -- passaria
// verde. Cada caso tambem confere que a rede FOI chamada e que bairro e cidade
// se preencheram: `null` no seletor com zero chamadas de CEP nao e conserto, e
// sim formulario que nao fez nada.
//
// DESLIGAR PARA VER REPROVAR: em `lib/formulario/bloco_de_cep.dart`, em
// `_escolherOEstado`, troque `siglaDeEstadoValida(ufDaBusca)` por `ufDaBusca`.
// Os SEIS casos reprovam na primeira assercao -- e era esse o codigo de tres
// deles ate 30/10/2026.

import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/tela_registrar_achado.dart';
import 'package:bichu/telas/localizacao/captura_de_localizacao.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/telas/perfil/tela_endereco_de_entrega.dart';
import 'package:bichu/telas/perto/sugerir_profissional.dart';
import 'package:bichu/telas/pet/tela_solicitar_plaquinha.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/seletor_de_lista.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import '../rede/fixtures_da_rede.dart' show pagina;
import 'ajuda_de_tela.dart';
import 'registrar_achado_test.dart'
    show avancarParaOPasso2, localizacaoConcedida;
import 'sugerir_profissional_test.dart' show diretorioVazio;

const String _idDoPet = '3f1d7a9e-0000-7000-8000-000000000001';

/// O CEP cuja base devolve uma sigla que NAO EXISTE.
const String _cepComSiglaRuim = '22041001';

/// O CEP cuja base devolve uma sigla de verdade. **E o controle positivo.**
const String _cepComSiglaBoa = '01311000';

/// O que a rede viu, para o caso CONTAR em vez de inferir.
class _Registro {
  final List<String> chamadasDeCep = <String>[];
}

/// A rede das seis telas, com a base de CEP que responde **pelo CEP pedido**.
///
/// Uma funcao so para as seis de proposito: seis dubles divergiriam, e o que
/// este arquivo mede e a MESMA peca nas seis.
Future<http.Response> Function(http.Request) _rede(_Registro registro) {
  final Map<String, dynamic> pet = petDoContrato(id: _idDoPet);
  return (req) async {
    if (req.url.host == 'viacep.com.br' || req.url.host == 'brasilapi.com.br') {
      final String pedido = req.url.pathSegments
          .firstWhere((s) => RegExp(r'^\d{8}$').hasMatch(s), orElse: () => '');
      registro.chamadasDeCep.add(pedido);
      // **A sigla vem do CEP pedido**, e e isso que deixa um caso so medir os
      // dois sentidos sem remontar a tela.
      final String uf = pedido == _cepComSiglaBoa ? 'RJ' : 'XX';
      return json200(<String, dynamic>{
        'cep': pedido,
        'logradouro': 'Avenida Da Base',
        'bairro': 'Bairro Da Base',
        'localidade': 'Cidade Da Base',
        'uf': uf,
      });
    }

    final String caminho = req.url.path;
    if (caminho.endsWith('/reference-data')) {
      return json200(referenciaDeTeste());
    }
    if (caminho == '/v1/me' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'id': 'u-1',
        'email': 'marina@exemplo.com.br',
        'email_verified': true,
        'display_name': 'Marina',
        'phone_verified': false,
        'pending_profile_fields': <String>[],
        'can_open_lost_case': true,
      });
    }
    if (caminho == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <dynamic>[pet]});
    }
    // **Sem endereco guardado de proposito**: os campos tem de abrir VAZIOS,
    // senao a regra "so campo vazio recebe" engoliria a busca e o caso ficaria
    // verde sem medir a sigla.
    if (caminho == '/v1/pets/$_idDoPet/delivery-address') {
      return http.Response(
        'null',
        200,
        headers: const <String, String>{'content-type': 'application/json'},
      );
    }
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(diretorioVazio());
    }
    if (caminho == '/v1/network/events' && req.method == 'GET') {
      return json200(pagina(<Map<String, dynamic>>[]));
    }
    if (caminho == '/v1/found-reports' && req.method == 'POST') {
      return json200(
        jsonDecode(req.body) as Map<String, dynamic>,
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

/// O campo pelo rotulo DECLARADO no [BichuField].
///
/// E nao por `find.text`: o campo opcional desenha `'<rotulo> (opcional)'`, e
/// `find.text('CEP')` acha zero em quatro das seis telas.
Finder _campo(String rotulo) => find.byWidgetPredicate(
      (w) => w is BichuField && w.rotulo == rotulo,
      description: 'BichuField de rotulo "$rotulo"',
    );

String _textoDoCampo(WidgetTester tester, String rotulo) =>
    tester.widget<BichuField>(_campo(rotulo).first).controlador.text.trim();

/// O texto do campo, **rolando ate ele primeiro**.
///
/// O rolar nao e cerimonia: a `ListView` so constroi o que cabe na tela, e em
/// quatro das seis telas o bairro e a cidade ficam abaixo da dobra. Sem isto o
/// `Finder` acha ZERO e o caso estoura em `Iterable.first` -- falha por motivo
/// que nao e o da afirmacao.
Future<String> _textoDepoisDeRolar(
  WidgetTester tester,
  String rotulo,
  Finder rolagem,
) async {
  await rolarAteDeCimaOuDeBaixo(tester, _campo(rotulo), scrollable: rolagem);
  return _textoDoCampo(tester, rotulo);
}

/// A rolagem DA TELA, e nao `find.byType(Scrollable).first`.
///
/// As telas sao empilhadas sobre a aba que as abriu, e a primeira `Scrollable`
/// da arvore e a da tela de BAIXO: rolar nela nao move o formulario e o campo
/// nunca aparece.
Finder _rolagemDe(Type tela) => find
    .descendant(of: find.byType(tela), matching: find.byType(Scrollable))
    .first;

/// A sigla escolhida no seletor de `Estado`, ou `null` quando nao ha escolha.
///
/// **Le o `selecionado` do widget**, e nao o texto desenhado: o texto de "nada
/// escolhido" e `Escolher na lista`, e comparar texto confundiria "vazio" com
/// "rotulo mudou".
///
/// O `expect` antes da leitura e o CONTROLE POSITIVO de alcance: um seletor
/// fora da arvore devolveria `null` igual a um seletor sem escolha, e os dois
/// dizem coisas opostas.
String? _siglaDoEstado(WidgetTester tester) {
  final Finder seletor = find.ancestor(
    of: find.text('Estado'),
    matching: find.byType(SeletorDeLista),
  );
  expect(
    seletor,
    findsAtLeastNWidgets(1),
    reason: 'REPROVA: o seletor de `Estado` nao esta na arvore. Sem ele, a '
        'leitura da sigla devolveria `null` por ausencia -- e `null` por '
        'ausencia parece conserto.',
  );
  return tester.widget<SeletorDeLista>(seletor.first).selecionado;
}

/// Digita [valor] no campo [rotulo], rolando ate ele primeiro.
Future<void> _digitar(
  WidgetTester tester,
  String rotulo,
  String valor, {
  Finder? rolagem,
}) async {
  await rolarAteDeCimaOuDeBaixo(tester, _campo(rotulo), scrollable: rolagem);
  await tester.enterText(_campo(rotulo).first, valor);
  await tester.pumpAndSettle();
}

/// O CORPO DE CADA CASO, igual nas seis telas.
///
/// Recebe a tela ja aberta, digita os dois CEPs e faz as afirmacoes. O que
/// muda de tela para tela e so a PORTA, e e so isso que cada caso escreve.
Future<void> _medirAsDuasSiglas(
  WidgetTester tester,
  _Registro registro,
  Finder rolagem, {
  required String nomeDaTela,
}) async {
  // ---- 1. a sigla que NAO existe
  await _digitar(tester, 'CEP', _cepComSiglaRuim, rolagem: rolagem);

  expect(
    registro.chamadasDeCep,
    <String>[_cepComSiglaRuim],
    reason: 'REPROVA: $nomeDaTela nao buscou o CEP. Sem a busca, nada abaixo '
        'mede a sigla -- mede um formulario parado.',
  );
  await rolarAteDeCimaOuDeBaixo(
    tester,
    find.text('Estado'),
    scrollable: rolagem,
  );
  expect(
    _siglaDoEstado(tester),
    isNull,
    reason: 'REPROVA: $nomeDaTela aceitou `XX` como sigla de estado. `XX` nao '
        'e um dos 27, e `siglaDeEstadoValida` existe em '
        '`api/estados_brasileiros.dart` para dizer isso. Era o defeito de '
        'tres das seis telas em 30/10/2026, e o conserto esta em '
        '`lib/formulario/bloco_de_cep.dart`.',
  );
  // O resto do endereco preenche: a sigla ruim nao derruba a busca inteira.
  expect(
    await _textoDepoisDeRolar(tester, 'Bairro', rolagem),
    'Bairro Da Base',
    reason: 'REPROVA: $nomeDaTela nao preencheu o bairro. O conserto da sigla '
        'nao pode custar o recurso que o cliente pediu em 17/10/2026.',
  );
  expect(await _textoDepoisDeRolar(tester, 'Cidade', rolagem), 'Cidade Da Base');

  // ---- 2. CONTROLE POSITIVO: a sigla que existe
  await _digitar(tester, 'CEP', _cepComSiglaBoa, rolagem: rolagem);

  expect(
    registro.chamadasDeCep,
    <String>[_cepComSiglaRuim, _cepComSiglaBoa],
    reason: 'REPROVA: $nomeDaTela nao buscou o segundo CEP.',
  );
  await rolarAteDeCimaOuDeBaixo(
    tester,
    find.text('Estado'),
    scrollable: rolagem,
  );
  expect(
    _siglaDoEstado(tester),
    'RJ',
    reason: 'REPROVA: $nomeDaTela nao escolheu `RJ`, que E um dos 27.\n'
        'ESTE E O CONTROLE POSITIVO do caso acima: sem ele, uma tela ligada '
        'errado a peca -- onde o seletor NUNCA se preenche -- passaria verde '
        'na afirmacao de que `XX` nao entra, por nao ter o que entrar.',
  );
}

void main() {
  late _Registro registro;

  setUp(() => registro = _Registro());

  testWidgets('1. achado (captura de localizacao): `XX` nao, `RJ` sim',
      (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
      localizacao: localizacaoConcedida(),
    );
    await irPara(tester, Rotas.registrarAchado);
    await rolarAte(tester, find.text('Cachorro'));
    await tocar(tester, find.text('Cachorro'));
    await rolarAte(tester, find.text('Médio'));
    await tocar(tester, find.text('Médio'));
    await avancarParaOPasso2(tester);

    // A ROLAGEM E A DO PASSO 2, e nao `find.byType(Scrollable).first`.
    //
    // O formulario e um `IndexedStack` com os dois passos montados: a lista do
    // passo 1 continua na arvore, so que OFFSTAGE. `find.descendant` pula o
    // que esta offstage por padrao, entao a primeira `Scrollable` aqui e a do
    // passo 2 -- e e essa que move o `Onde?`.
    final Finder rolagem = _rolagemDe(TelaRegistrarAchado);
    // A peca so se confere DEPOIS de rolar: o `Onde?` nasce abaixo da dobra e
    // a `ListView` nao constroi o que nao cabe. Um `expect` antes do rolamento
    // reprovaria por nao ter sido construido, que nao e o que este caso mede.
    await rolarAteDeCimaOuDeBaixo(tester, _campo('CEP'), scrollable: rolagem);
    expect(
      find.byType(CapturaDeLocalizacao),
      findsOneWidget,
      reason: 'REPROVA: a peca de captura de localizacao nao esta montada no '
          'passo 2 do achado. Sem ela, o caso mediria outra tela.',
    );

    await _medirAsDuasSiglas(
      tester,
      registro,
      rolagem,
      nomeDaTela: 'a captura de localizacao do achado',
    );
  });

  testWidgets('2. `Meus dados`: `XX` nao, `RJ` sim', (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
    );
    await irPara(tester, Rotas.dadosPessoais);
    expect(find.byType(TelaDadosPessoais), findsOneWidget);

    await _medirAsDuasSiglas(
      tester,
      registro,
      _rolagemDe(TelaDadosPessoais),
      nomeDaTela: '`Meus dados`',
    );
  });

  testWidgets('3. endereco de entrega do pet: `XX` nao, `RJ` sim',
      (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
    );
    await irPara(tester, Rotas.enderecoDeEntregaDoPet(_idDoPet));
    expect(find.byType(TelaEnderecoDeEntrega), findsOneWidget);

    await _medirAsDuasSiglas(
      tester,
      registro,
      _rolagemDe(TelaEnderecoDeEntrega),
      nomeDaTela: 'o endereco de entrega do pet',
    );
  });

  testWidgets('4. indicar profissional: `XX` nao, `RJ` sim', (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
    );
    await irPara(tester, Rotas.sugerirProfissional);
    expect(find.byType(TelaSugerirProfissional), findsOneWidget);

    await _medirAsDuasSiglas(
      tester,
      registro,
      _rolagemDe(TelaSugerirProfissional),
      nomeDaTela: 'a indicacao de profissional',
    );
  });

  testWidgets('5. pedido da plaquinha: `XX` nao, `RJ` sim', (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
    );
    await irPara(tester, Rotas.solicitarPlaquinha, extra: _idDoPet);
    expect(find.byType(TelaSolicitarPlaquinha), findsOneWidget);

    await _medirAsDuasSiglas(
      tester,
      registro,
      _rolagemDe(TelaSolicitarPlaquinha),
      nomeDaTela: 'o pedido da plaquinha',
    );
  });

  testWidgets('6. criar encontro: `XX` nao, `RJ` sim', (tester) async {
    await abrirOApp(
      tester,
      rede: _rede(registro),
      deposito: depositoLogado(),
    );
    await irPara(tester, Rotas.criarEncontroDaRede);
    expect(find.byType(TelaCriarEncontro), findsOneWidget);

    await _medirAsDuasSiglas(
      tester,
      registro,
      _rolagemDe(TelaCriarEncontro),
      nomeDaTela: 'a criacao de encontro',
    );
  });
}
