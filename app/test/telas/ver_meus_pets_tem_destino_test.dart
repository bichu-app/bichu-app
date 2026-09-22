// Criterio 12 da BICHUS-62 — ISCA.
//
// As duas acoes `Ver meus pets` de `lib/api/mensagens_de_erro.dart` existiam
// como **rotulo sem destino**: a `Rotas` nao tinha rota de lista, e a unica
// tela que renderizava uma delas ligava o toque a `_cadastrar`. O 409 de
// limite de pets dizia `Ver meus pets` e, ao toque, **reenviava o cadastro** e
// recebia o mesmo 409. Em laco.
//
// Este arquivo cobra tres coisas, nesta ordem de forca:
//
// 1. Que o catalogo inteiro nao produza `Ver meus pets` sem `rotaDaAcao` --
//    percorrido, e nao conferido nas duas que alguem lembra.
// 2. Que o destino seja uma rota **registrada** no roteador de verdade.
// 3. Que tocar nela navegue, na tela que de fato a renderiza.

import 'package:bichu/api/falhas.dart';
import 'package:bichu/api/mensagens_de_erro.dart';
import 'package:bichu/api/modelos_pet.dart';
import 'package:bichu/api/problem.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/meus_pets.dart';
import 'package:bichu/telas/pet/rascunho_de_pet.dart';
import 'package:bichu/telas/pet/textos_do_cadastro.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Os `type` do contrato cujo catalogo devolve uma saida de navegacao.
///
/// A lista e varrida inteira: e assim que uma **terceira** ocorrencia de
/// `Ver meus pets` sem destino reprova, em vez de passar por ninguem ter
/// lembrado dela.
const List<(String, int)> _todosOsProblemas = <(String, int)>[
  ('not-found', 404),
  ('pet-limit-reached', 409),
  ('unauthenticated', 401),
  ('token-expired', 401),
  ('invalid-credentials', 401),
  ('forbidden', 403),
  ('email-already-registered', 409),
  ('validation-failed', 400),
  ('rate-limited', 429),
  ('tag-code-malformed', 400),
  ('tag-code-not-found', 404),
  ('tag-revoked', 410),
  ('service-unavailable', 503),
];

MensagemDeErro _mensagemDe(String slug, int status) {
  return MensagensDeErro.de(
    FalhaDaApi(
      Problem.doJson(
        <String, dynamic>{'type': 'https://api.bichu.app/problems/$slug'},
        status: status,
      ),
    ),
  );
}

/// As rotas que o roteador de verdade registra.
///
/// Lidas do `GoRouter` montado, e nao de uma lista escrita a mao: uma lista a
/// mao seria a segunda fonte da verdade, e ela continuaria dizendo que a rota
/// existe no dia em que alguem a apagasse.
Set<String> _rotasRegistradas(WidgetTester tester) {
  final roteador = GoRouter.of(tester.element(find.byType(Scaffold).first));
  final achadas = <String>{};
  void visitar(List<RouteBase> rotas) {
    for (final rota in rotas) {
      if (rota is GoRoute) achadas.add(rota.path);
      visitar(rota.routes);
      if (rota is ShellRouteBase) {
        for (final ramo in rota.routes) {
          visitar(<RouteBase>[ramo]);
        }
      }
      if (rota is StatefulShellRoute) {
        for (final ramo in rota.branches) {
          visitar(ramo.routes);
        }
      }
    }
  }

  visitar(roteador.configuration.routes);
  return achadas;
}

Future<http.Response> _rede(http.Request req) async {
  if (req.url.path == '/v1/pets' && req.method == 'GET') {
    return json200(<String, dynamic>{'items': <dynamic>[]});
  }
  return problema('not-found', 404);
}

void main() {
  test('nenhuma mensagem do catalogo oferece `Ver meus pets` sem destino', () {
    final semDestino = <String>[];
    var encontradas = 0;

    for (final (slug, status) in _todosOsProblemas) {
      final m = _mensagemDe(slug, status);
      if (m.acao != MensagensDeErro.verMeusPets) continue;
      encontradas += 1;
      if (m.rotaDaAcao == null) semDestino.add(slug);
    }

    // **A guarda contra o portao que nao tem o que conferir.** Se o rotulo
    // mudar de texto, ou os `type` sairem do catalogo, este caso ficaria verde
    // por nao achar nenhuma ocorrencia -- que e confianca falsa, e pior que
    // nao ter o caso.
    expect(
      encontradas,
      2,
      reason: 'REPROVA: eu esperava as DUAS ocorrencias de '
          '"${MensagensDeErro.verMeusPets}" (mensagens_de_erro.dart, '
          '`not-found` e `pet-limit-reached`) e achei $encontradas. Ou o '
          'rotulo mudou, ou surgiu uma terceira. Atualize este caso de '
          'proposito, e nao por acidente.',
    );
    expect(
      semDestino,
      isEmpty,
      reason: 'REPROVA: ${semDestino.join(', ')} oferecem '
          '"${MensagensDeErro.verMeusPets}" sem `rotaDaAcao`. E o rotulo que '
          'aponta para o vazio, que e o defeito que a BICHUS-62 veio fechar.',
    );
  });

  testWidgets('o destino das duas e uma rota REGISTRADA no roteador',
      (tester) async {
    await abrirOApp(tester, rede: _rede, deposito: depositoLogado());
    final registradas = _rotasRegistradas(tester);

    // Guarda do portao: um conjunto vazio faria qualquer `contains` abaixo
    // passar por vacuidade.
    expect(
      registradas,
      isNotEmpty,
      reason: 'REPROVA: nao consegui ler nenhuma rota do GoRouter. O portao '
          'ficaria verde por nao ter o que conferir.',
    );

    for (final (slug, status) in _todosOsProblemas) {
      final m = _mensagemDe(slug, status);
      final rota = m.rotaDaAcao;
      if (rota == null) continue;
      expect(
        registradas,
        contains(rota),
        reason: 'REPROVA: a mensagem de `$slug` manda para "$rota" e essa '
            'rota nao esta registrada. Rotas conhecidas: '
            '${registradas.join(', ')}.',
      );
    }
  });

  testWidgets('tocar em `Ver meus pets` chega na lista', (tester) async {
    await abrirOApp(tester, rede: _rede, deposito: depositoLogado());

    // Vai ate o destino pelo endereco que as mensagens declaram, e conferindo
    // que ali esta a lista -- e nao so que a navegacao aconteceu.
    final rota =
        _mensagemDe('pet-limit-reached', 409).rotaDaAcao ?? Rotas.perfil;
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go(rota);
    await tester.pumpAndSettle();

    expect(
      find.byType(MeusPets),
      findsOneWidget,
      reason: 'REPROVA: "$rota" nao abriu `Meus pets`. O rotulo promete a '
          'lista; o endereco precisa entregar a lista.',
    );
    expect(find.text(MeusPets.titulo), findsOneWidget);
  });

  testWidgets(
      'na tela que renderiza a faixa, o toque NAVEGA em vez de reenviar',
      (tester) async {
    // O caminho real do 409: F1.5 envia o cadastro, o servidor recusa por
    // limite de pets, a faixa aparece com `Ver meus pets`. Antes desta
    // historia o toque chamava `_cadastrar` de novo.
    var tentativasDeCadastro = 0;
    await abrirOApp(
      tester,
      deposito: depositoLogado(),
      rede: (req) async {
        if (req.url.path == '/v1/pets' && req.method == 'POST') {
          tentativasDeCadastro += 1;
          return problema('pet-limit-reached', 409);
        }
        if (req.url.path == '/v1/pets' && req.method == 'GET') {
          return json200(<String, dynamic>{'items': <dynamic>[]});
        }
        if (req.url.path == '/v1/public/reference-data') {
          return json200(referenciaDeTeste());
        }
        return problema('not-found', 404);
      },
    );

    // Direto em F1.5 com o rascunho pronto, pelo roteador de verdade: o que
    // este caso verifica e o que a FAIXA faz, e nao o assistente inteiro, que
    // ja tem os proprios casos.
    await irPara(
      tester,
      Rotas.cadastrarPetSinais,
      extra: RascunhoDePet()
        ..nome = 'Nina'
        ..especie = Especie.cao
        ..porte = Porte.medio,
    );
    await tocar(
      tester,
      find.widgetWithText(FilledButton, TextosDoCadastro.cadastrar),
    );

    expect(
      tentativasDeCadastro,
      1,
      reason: 'REPROVA: o cadastro precisa ter sido tentado uma vez para a '
          'faixa do 409 existir. Sem isso este caso nao esta olhando para '
          'nada.',
    );
    // A faixa entra no fim de uma tela longa; a `ListView` so constroi o que
    // cabe, e `find` nao enxerga o que nao foi construido.
    await rolarAte(tester, find.text(MensagensDeErro.verMeusPets));
    expect(find.text(MensagensDeErro.verMeusPets), findsOneWidget);

    await tocar(tester, find.text(MensagensDeErro.verMeusPets));

    expect(
      tentativasDeCadastro,
      1,
      reason: 'REPROVA: tocar em "${MensagensDeErro.verMeusPets}" reenviou o '
          'cadastro. O rotulo diz uma coisa e o botao faz outra, e o 409 '
          'volta identico -- em laco.',
    );
    expect(
      find.byType(MeusPets),
      findsOneWidget,
      reason: 'REPROVA: o toque nao levou a lista. O mecanismo e '
          '`rotaDaAcao` lido por `_acaoDaFaixa()` em '
          '`tela_cadastrar_sinais.dart`.',
    );
  });
}
