// `Perfil` > `Meus dados`: o nome NAO pode ser apagado.
//
// ---------------------------------------------------------------------------
// A decisao, nas palavras do cliente (18/10/2026)
// ---------------------------------------------------------------------------
// "atualizar o contrato para tornar o nome obrigatorio / nao permitir
// atualizar o cadastro, se nao tiver algum nome cadastrado".
//
// ---------------------------------------------------------------------------
// O que esta tela OFERECIA, e que e o ponto
// ---------------------------------------------------------------------------
// A frase de recusa daqui era, literalmente, *"Escreva o seu nome, ou deixe o
// campo vazio para tira-lo."* -- ou seja, apagar o nome nao era um descuido
// possivel, era um caminho ANUNCIADO. E `_conferir` so recusava o nome que
// fosse **so espaco**:
//
//     if (_nome.text.isNotEmpty && _nome.text.trim().isEmpty)
//
// O `isNotEmpty` na frente e exatamente a porta: campo vazio nao entrava na
// condicao, `display_name: ""` saia no corpo do PATCH e a coluna era zerada.
//
// ---------------------------------------------------------------------------
// Por que esta isca mede o CORPO, e nao a tela
// ---------------------------------------------------------------------------
// Um caso que conferisse "aparece mensagem de erro" ficaria verde com o PATCH
// saindo e o nome sendo apagado no banco. A regra guardada aqui e:
//
//   Nenhum PATCH que sai desta tela leva `display_name` sem nome dentro, e a
//   tela nao salva nada com o campo de nome vazio.
//
// A autoridade e o servidor (`perfil-exige-nome.test.ts`), porque `PATCH
// /v1/me` e alcancavel por qualquer pessoa logada. Esta tela e conveniencia --
// e estes casos existem para ela nao voltar a ser um convite.
import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// A frase que a tela precisa dizer. **Sem paragrafo de apoio**: o cliente
/// mandou remover textos de apoio do app em 18/10, entao a regra aparece como
/// a propria mensagem de validacao e nada mais.
const String _precisaDoNome = 'Digite o nome que você quer usar no Bichu.';

Map<String, dynamic> _me({String? nome = 'Marina'}) {
  return <String, dynamic>{
    'id': 'u-1',
    'email': 'marina@exemplo.com.br',
    'email_verified': true,
    'display_name': ?nome,
    'phone_verified': false,
    'pending_profile_fields': <String>[],
    'can_open_lost_case': true,
  };
}

class _Capturado {
  final List<Map<String, dynamic>> corposDoPatch = <Map<String, dynamic>>[];
}

/// `nomeInicial: null` e a CONTA SEM NOME -- o estado das 2 contas de
/// homologacao medidas em 18/10.
Future<http.Response> Function(http.Request) _servidor(
  _Capturado capturado, {
  String? nomeInicial = 'Marina',
}) {
  return (req) async {
    if (req.url.path == '/v1/me' && req.method == 'GET') {
      return json200(_me(nome: nomeInicial));
    }
    if (req.url.path == '/v1/me' && req.method == 'PATCH') {
      final corpo = jsonDecode(req.body) as Map<String, dynamic>;
      capturado.corposDoPatch.add(corpo);
      return json200(_me(nome: corpo['display_name'] as String? ?? nomeInicial));
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
    }
    return problema('not-found', 404);
  };
}

Future<void> _abrirOsDados(
  WidgetTester tester,
  Future<http.Response> Function(http.Request) rede,
) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await irPara(tester, Rotas.dadosPessoais);
  expect(find.byType(TelaDadosPessoais), findsOneWidget);
}

Future<void> _digitar(WidgetTester tester, String rotulo, String valor) async {
  final campo = find.descendant(
    of: find.widgetWithText(BichuField, rotulo),
    matching: find.byType(TextField),
  );
  await tester.ensureVisible(campo);
  await tester.pumpAndSettle();
  await tester.enterText(campo, valor);
  await tester.pumpAndSettle();
}

Future<void> _salvar(WidgetTester tester) async {
  final salvar = find.widgetWithText(FilledButton, 'Salvar');
  await tester.ensureVisible(salvar);
  await tester.pumpAndSettle();
  await tester.tap(salvar);
  await tester.pumpAndSettle();
}

void main() {
  group('o nome nao pode ser apagado em `Meus dados`', () {
    /// A frase velha **convidava** a apagar. Ela nao pode voltar.
    testWidgets('a tela nao oferece mais apagar o nome', (tester) async {
      await _abrirOsDados(tester, _servidor(_Capturado()));

      expect(
        find.textContaining('deixe o campo vazio'),
        findsNothing,
        reason: 'REPROVA: a tela voltou a OFERECER apagar o nome. Era um caminho '
            'anunciado em texto, e a decisao de 18/10/2026 o fechou',
      );
    });

    /// ISCA. Desligada: devolvendo o `_nome.text.isNotEmpty &&` na frente da
    /// condicao de `_conferir`, este caso reprova em `corposDoPatch` -- que e
    /// literalmente o nome sendo apagado. Conferido.
    testWidgets('apagar o nome e salvar nao produz requisicao nenhuma',
        (tester) async {
      final capturado = _Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Nome', '');
      await _salvar(tester);

      expect(
        capturado.corposDoPatch,
        isEmpty,
        reason: 'REPROVA: saiu `PATCH /me` com o nome vazio. Um caso que so olhasse '
            'a mensagem na tela ficaria verde com a coluna sendo zerada',
      );
      expect(
        find.text(_precisaDoNome),
        findsOneWidget,
        reason: 'a recusa diz O QUE FAZER, numa linha, e nao que algo esta "invalido"',
      );
    });

    /// O caso que escapa do schema: `minLength: 1` de `MeUpdate` nao alcanca
    /// `"   "`. Escrito com `' '.repeat(3)` porque espaco no fim de literal e
    /// a primeira coisa que um formatador apara -- aparado, este caso viraria
    /// uma copia do anterior sem ninguem notar.
    testWidgets('nome so com espaco tambem nao produz requisicao', (tester) async {
      final capturado = _Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Nome', ' ' * 3);
      await _salvar(tester);

      expect(capturado.corposDoPatch, isEmpty);
      expect(find.text(_precisaDoNome), findsOneWidget);
    });

    /// O CONTRAPESO. Uma tela que recusasse SEMPRE deixaria os casos acima
    /// verdes, e este e o primeiro que reprovaria.
    testWidgets('trocar o nome por outro continua salvando, e vai aparado',
        (tester) async {
      final capturado = _Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Nome', '  Marina Prado  ');
      await _salvar(tester);

      expect(capturado.corposDoPatch, hasLength(1));
      expect(
        capturado.corposDoPatch.single['display_name'],
        'Marina Prado',
        reason: 'o corpo leva o nome aparado',
      );
    });

    /// A ISCA DO BECO, do lado da tela.
    ///
    /// A conta que JA esta sem nome precisa conseguir sair do estado. Se a
    /// tela passasse a recusar por "a conta nao tem nome" em vez de por "o
    /// campo esta vazio", os casos acima continuariam verdes e **so este
    /// reprovaria** -- seria conta presa sem saida.
    testWidgets('conta SEM nome consegue preencher o nome e salvar', (tester) async {
      final capturado = _Capturado();
      await _abrirOsDados(tester, _servidor(capturado, nomeInicial: null));

      await _digitar(tester, 'Nome', 'Marina Prado');
      await _salvar(tester);

      expect(
        capturado.corposDoPatch,
        hasLength(1),
        reason: 'REPROVA: a conta sem nome nao conseguiu salvar o nome. Isto e um '
            'beco: a trava cobra o nome e ao mesmo tempo impede de preenche-lo',
      );
      expect(capturado.corposDoPatch.single['display_name'], 'Marina Prado');
    });
  });
}
