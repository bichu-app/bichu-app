// `Perfil` > `Meus dados`: o telefone sai em E.164, e o e-mail nao sai.
//
// ---------------------------------------------------------------------------
// A ISCA, e por que ela nao e uma asserção trivial
// ---------------------------------------------------------------------------
// O campo de telefone mostra `(11) 98765-4321` e o contrato exige
// `^\+55\d{10,11}$` (`MeUpdate.phone_e164`). **As duas formas sao strings da
// mesma variavel**, e a unica coisa entre elas e uma chamada a
// `telefoneEmE164`. Trocar
//
//     telefone: telefoneEmE164(_telefone.text)
//
// por
//
//     telefone: _telefone.text
//
// compila, passa no `flutter analyze`, enche a tela com o numero certo, e
// manda `(11) 98765-4321` para o servidor. O desfecho e um 400 que ninguem
// reproduz em teste de widget, porque o servidor nao esta em teste de widget:
// um caso que so conferisse "a tela nao estourou" ficaria **verde com o
// defeito em producao**.
//
// Entao esta isca nao olha a tela. Ela **captura o corpo da requisicao** e
// afirma sobre o que saiu do aparelho:
//
//  1. o valor enviado casa `formaDeE164DoBrasil`, que e a MESMA expressao do
//     contrato (o arquivo de formato a publica, e nao ha segunda redacao dela);
//  2. o valor enviado nao e o que estava no campo -- a prova de que a conversao
//     aconteceu, e nao de que o campo por acaso continha E.164;
//  3. telefone incompleto **nao produz requisicao nenhuma**: a tela recusa
//     antes, com texto que diz o que fazer. Um PATCH com telefone quebrado
//     chegando ao servidor e a mesma classe de defeito pelo outro lado.
//
// ---------------------------------------------------------------------------
// A SEGUNDA AFIRMACAO: `email` nao vai no corpo
// ---------------------------------------------------------------------------
// `MeUpdate` **nao aceita `email`**, e a razao esta escrita no contrato
// (SEC-003): aceitar faria a resposta revelar se um endereco ja tem conta. A
// troca e `POST /v1/me/email-change`, que exige reautenticacao com senha
// (`x-reauth-scope: email_change`) -- maquinaria que este app nao tem.
//
// A tela mostra o e-mail de LEITURA por causa disso, e o jeito mais facil de
// desfazer essa decisao e alguem "consertar" a tela acrescentando um campo de
// e-mail editavel. Compilaria. Esta isca reprova: se `email` aparecer no corpo
// do PATCH, ou se houver chamada a `/me/email-change` (rota que o app nao sabe
// autenticar), ela acusa pelo nome.

import 'dart:convert';

import 'package:bichu/formato/telefone.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// O que a pessoa digita, do jeito que a mascara mostra.
const String telefoneNaTela = '(11) 98765-4321';

/// O que o contrato exige que chegue ao servidor.
const String telefoneEmContrato = '+5511987654321';

/// Um corpo de `#/components/schemas/Me`, com o que o caso pedir.
Map<String, dynamic> _me({
  String? telefone,
  String nome = 'Marina',
  String? cep,
}) {
  return <String, dynamic>{
    'id': 'u-1',
    'email': 'marina@exemplo.com.br',
    'email_verified': true,
    'display_name': nome,
    'phone_e164': ?telefone,
    'phone_verified': false,
    if (cep != null)
      'reference_area': <String, dynamic>{'postal_code': cep},
    'pending_profile_fields': <String>[],
    'can_open_lost_case': true,
  };
}

/// O que saiu do aparelho. **A coisa que esta isca mede.**
class Capturado {
  final List<Map<String, dynamic>> corposDoPatch = <Map<String, dynamic>>[];
  final List<String> caminhos = <String>[];
}

/// Um servidor que GUARDA o que recebeu e devolve o perfil atualizado.
Future<http.Response> Function(http.Request) _servidor(
  Capturado capturado, {
  String? telefoneInicial,
  String? cepInicial,
}) {
  return (req) async {
    capturado.caminhos.add('${req.method} ${req.url.path}');
    if (req.url.path == '/v1/me' && req.method == 'GET') {
      return json200(_me(telefone: telefoneInicial, cep: cepInicial));
    }
    if (req.url.path == '/v1/me' && req.method == 'PATCH') {
      final corpo = jsonDecode(req.body) as Map<String, dynamic>;
      capturado.corposDoPatch.add(corpo);
      return json200(
        _me(
          telefone: corpo['phone_e164'] as String? ?? telefoneInicial,
          nome: corpo['display_name'] as String? ?? 'Marina',
          cep: cepInicial,
        ),
      );
    }
    if (req.url.path == '/v1/pets' && req.method == 'GET') {
      return json200(<String, dynamic>{'items': <Map<String, dynamic>>[]});
    }
    return problema('not-found', 404);
  };
}

/// Abre a tela de dados pessoais pelo roteador de verdade.
///
/// Pelo roteador porque a rota e parte do que esta entrega acrescenta: uma
/// tela montada solta passaria no dia em que `/perfil/dados` deixasse de
/// existir.
Future<void> _abrirOsDados(
  WidgetTester tester,
  Future<http.Response> Function(http.Request) rede,
) async {
  await abrirOApp(tester, rede: rede, deposito: depositoLogado());
  await irPara(tester, Rotas.dadosPessoais);
  expect(
    find.byType(TelaDadosPessoais),
    findsOneWidget,
    reason: 'REPROVA: `${Rotas.dadosPessoais}` nao abriu a tela de dados '
        'pessoais. Sem ela na arvore, todo caso deste arquivo passaria por '
        'nao ter o que medir.',
  );
}

Finder _campo(String rotulo) => find.widgetWithText(BichuField, rotulo);

Future<void> _digitar(
  WidgetTester tester,
  String rotulo,
  String valor,
) async {
  final campo = find.descendant(
    of: _campo(rotulo),
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
  group('o telefone sai em E.164, e nao do jeito que esta na tela', () {
    testWidgets('digitado com mascara, enviado como `$telefoneEmContrato`',
        (tester) async {
      final capturado = Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Telefone', telefoneNaTela);
      await _salvar(tester);

      expect(
        capturado.corposDoPatch,
        hasLength(1),
        reason: 'REPROVA: o PATCH nao saiu (ou saiu duas vezes). Sem '
            'exatamente um corpo capturado, as afirmacoes abaixo nao estao '
            'medindo o que a tela enviou.',
      );
      final corpo = capturado.corposDoPatch.single;

      expect(
        corpo['phone_e164'],
        telefoneEmContrato,
        reason: 'REPROVA: o telefone saiu como "${corpo['phone_e164']}". O '
            'contrato exige `^\\+55\\d{10,11}\$` em `MeUpdate.phone_e164`, e a '
            'mascara e do OLHO: quem produz valor de contrato e '
            '`telefoneEmE164`, de `formato/telefone.dart`. Trocar a chamada '
            'dela pelo texto do campo compila, enche a tela com o numero '
            'certo e manda a mascara para o servidor.',
      );

      // (1) A FORMA, contra a expressao do proprio contrato. `formato/
      // telefone.dart` publica `formaDeE164DoBrasil` justamente para nao
      // haver uma segunda redacao dela num teste.
      expect(
        formaDeE164DoBrasil.hasMatch(corpo['phone_e164'] as String),
        isTrue,
        reason: 'REPROVA: o que saiu nao casa `formaDeE164DoBrasil`, que e a '
            'MESMA expressao de `MeUpdate.phone_e164`. O servidor responderia '
            '400 com o campo nomeado.',
      );

      // (2) A CONVERSAO ACONTECEU. Sem esta linha, um campo que por acaso
      // contivesse E.164 faria o caso passar com a conversao apagada.
      expect(
        corpo['phone_e164'],
        isNot(telefoneNaTela),
        reason: 'REPROVA: o corpo carrega exatamente o que estava na tela. A '
            'conversao nao aconteceu -- o valor coincidiu.',
      );
      expect(
        (corpo['phone_e164'] as String).contains('('),
        isFalse,
        reason: 'REPROVA: ha pontuacao de mascara no valor enviado.',
      );
    });

    testWidgets('fixo de oito digitos tambem sai em E.164', (tester) async {
      // O outro tamanho que `formato/telefone.dart` aceita. Sem este caso, uma
      // conversao que so soubesse celular passaria -- e o produto aceita os
      // dois pela QUANTIDADE de digitos, nunca pelo primeiro deles.
      final capturado = Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Telefone', '(11) 3061-2200');
      await _salvar(tester);

      expect(capturado.corposDoPatch, hasLength(1));
      expect(
        capturado.corposDoPatch.single['phone_e164'],
        '+551130612200',
        reason: 'REPROVA: o fixo de oito digitos saiu errado. A distincao '
            'entre fixo e celular e pela quantidade, e nao pelo primeiro '
            'digito.',
      );
    });

    testWidgets('ISCA — telefone incompleto nao produz requisicao nenhuma',
        (tester) async {
      // A mesma classe de defeito pelo outro lado: deixar a tela mandar e o
      // servidor recusar. O erro tem de aparecer NO CAMPO, e tem de dizer o
      // que fazer -- "invalido" nao e instrucao (UX secao 13).
      final capturado = Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Telefone', '(11) 9876');
      await _salvar(tester);

      expect(
        capturado.corposDoPatch,
        isEmpty,
        reason: 'REPROVA: a tela mandou um PATCH com telefone incompleto. '
            '`telefoneEmE164` devolve nulo em vez de adivinhar, e quem chama '
            'decide o que dizer a pessoa: deixar o servidor recusar poe a '
            'mensagem a duas telas de distancia do campo.',
      );
      expect(
        find.textContaining('Faltam dígitos'),
        findsOneWidget,
        reason: 'REPROVA: a tela recusou CALADA, ou recusou sem dizer o que '
            'fazer. O erro de campo tem de instruir, e a palavra "inválido" '
            'nao instrui ninguem.',
      );
    });
  });

  group('o e-mail nao viaja no corpo, e a rota de troca nao e chamada', () {
    testWidgets('o PATCH nao carrega `email`', (tester) async {
      final capturado = Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Nome', 'Marina Souza');
      await _salvar(tester);

      expect(capturado.corposDoPatch, hasLength(1));
      final corpo = capturado.corposDoPatch.single;
      for (final chave in <String>['email', 'new_email']) {
        expect(
          corpo.containsKey(chave),
          isFalse,
          reason: 'REPROVA: `$chave` esta no corpo de `PATCH /me`. '
              '`MeUpdate` **nao aceita `email`** (SEC-003, escrito no proprio '
              'contrato): aceitar faria a resposta revelar se um endereco ja '
              'tem conta. O servidor recusa, e o campo que produziu isto e um '
              'campo que nao devia existir na tela.',
        );
      }
    });

    testWidgets('nenhuma chamada a `/me/email-change` sai desta tela',
        (tester) async {
      final capturado = Capturado();
      await _abrirOsDados(tester, _servidor(capturado));

      await _digitar(tester, 'Nome', 'Marina Souza');
      await _salvar(tester);

      expect(
        capturado.caminhos.where((c) => c.contains('email-change')),
        isEmpty,
        reason: 'REPROVA: a tela chamou `POST /me/email-change`. A rota existe '
            'no contrato e exige reautenticacao com senha '
            '(`x-reauth-scope: email_change`): **o app nao tem reautenticacao** '
            '-- nada em `app/lib/api` chama `POST /auth/reauth` e o cliente '
            'nao manda `X-Reauth-Token`. A chamada volta 401 '
            '`reauthentication-required` e o fluxo morre em silencio, que e '
            'acao sem destino (criterio 2 da BICHUS-62).',
      );
      expect(
        find.textContaining('A troca do e-mail ainda não acontece pelo app'),
        findsOneWidget,
        reason: 'REPROVA: a tela deixou de dizer que a troca do e-mail nao '
            'acontece por aqui. Sem a linha, o e-mail de leitura parece um '
            'campo quebrado, e a pessoa fica tocando nele.',
      );
    });
  });

  group('so o que mudou vai no corpo', () {
    testWidgets('salvar sem mexer em nada nao escreve', (tester) async {
      // `MeUpdate` nao tem campo obrigatorio: um corpo com os quatro campos
      // sempre sobrescreveria com vazio o que a pessoa nem abriu, e gastaria o
      // teto de 60/h da conta a cada toque.
      final capturado = Capturado();
      await _abrirOsDados(
        tester,
        _servidor(capturado, telefoneInicial: telefoneEmContrato),
      );

      await _salvar(tester);

      expect(
        capturado.corposDoPatch,
        isEmpty,
        reason: 'REPROVA: a tela escreveu sem ninguem ter mudado nada. Com o '
            'corpo montado sempre com os quatro campos, um `Salvar` '
            'acidental sobrescreve o cadastro com o que a tela conseguiu ler '
            '-- e e assim que um telefone correto vira vazio.',
      );
      expect(
        find.textContaining('Nada mudou'),
        findsOneWidget,
        reason: 'REPROVA: o `Salvar` nao fez nada e nao disse nada. Botao que '
            'parece nao funcionar e botao em que o dedo volta.',
      );
    });

    testWidgets('mexer so no nome manda so o nome', (tester) async {
      final capturado = Capturado();
      await _abrirOsDados(
        tester,
        _servidor(capturado, telefoneInicial: telefoneEmContrato),
      );

      await _digitar(tester, 'Nome', 'Marina Souza');
      await _salvar(tester);

      expect(capturado.corposDoPatch, hasLength(1));
      final corpo = capturado.corposDoPatch.single;
      expect(corpo.keys.toList(), <String>['display_name']);
      expect(corpo['display_name'], 'Marina Souza');
    });
  });
}
