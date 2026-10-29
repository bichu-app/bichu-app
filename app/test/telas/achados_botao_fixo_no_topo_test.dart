// ISCA DA BICHUS-278 (28/10/2026): ACHADOS VIRA UMA ENTRADA.
//
// `Registrar achado avulso` sai do menu do perfil e vira um botao **fixo no
// topo do corpo** da listagem dos achados da conta, desenhado e aprovado em
// `design/prototipos/menu-unificado/`.
//
// ## Por que FIXO, e nao so "no topo"
//
// Com 20 itens e `Carregar mais`, um botao que rola embora obriga a voltar ao
// inicio para registrar o proximo achado -- e quem registra um achado costuma
// estar **na rua, com um animal na mao**. Daqui sai o caso que rola a lista e
// cobra o botao ainda visivel: um botao que fosse so o primeiro filho da
// `ListView` passaria os outros casos deste arquivo e reprovaria esse.
//
// ## O botao e o MESMO no vazio
//
// Nao cresce, nao muda de tinta e nao vira *"Registrar o seu primeiro
// achado"*: botao que muda entre o vazio e a lista e um botao que a pessoa
// aprende duas vezes. O caso do vazio cobra o MESMO rotulo.
//
// ## E A TERCEIRA CASA DESTE ROTULO EM OITO DIAS
//
// Folha da acao flutuante de `Pets` (ate 20/10) -> item de menu (20/10 a
// 28/10) -> botao desta tela. A palavra **avulso** fica, pelo motivo que a
// prosa de `abas.dart` registrou: *"quem usava a acao acha pelo texto"*.
library;

import 'package:bichu/telas/perfil/meus_achados.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// Quantos achados o servidor devolve. Zero e o estado de lista vazia.
int _quantos = 4;

/// Um achado no formato do contrato, igual ao de
/// `perdidos_e_meus_achados_test.dart` -- a mesma forma nos dois arquivos, para
/// uma mudanca de contrato reprovar nos dois e nao num so.
Map<String, dynamic> _achado(int i) => <String, dynamic>{
      'id': 'achado-$i',
      'origin': 'standalone',
      'status': 'open',
      'area_label': 'Vila Mariana, São Paulo',
      'found_at': '2026-10-16T10:00:00.000Z',
      'photo_url': null,
      'notes': null,
      'conversation_id': null,
      'created_at': '2026-10-16T10:00:00.000Z',
    };

Future<http.Response> _servidor(http.Request req) async {
  if (req.url.path == '/v1/found-reports' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'items': <Map<String, dynamic>>[
        for (var i = 0; i < _quantos; i++) _achado(i),
      ],
      'next_cursor': null,
    });
  }
  if (req.url.path == '/v1/me' && req.method == 'GET') {
    return json200(<String, dynamic>{
      'id': 'u-1',
      'email': 'marina@exemplo.com.br',
      'email_verified': true,
      'display_name': 'Marina',
      'pending_profile_fields': <String>[],
      'can_open_lost_case': true,
    });
  }
  return problema('not-found', 404);
}

Future<void> _abrirOsAchados(WidgetTester tester) async {
  await abrirOApp(tester, rede: _servidor, deposito: depositoLogado());
  await irPara(tester, Rotas.meusAchados);
  await tester.pumpAndSettle();
}

void main() {
  setUp(() => _quantos = 4);

  testWidgets('o titulo da barra e `Achados`', (tester) async {
    await _abrirOsAchados(tester);

    expect(
      MeusAchados.titulo,
      'Achados',
      reason: 'REPROVA: `MeusAchados.titulo` nao virou `Achados`. Ele e a '
          'MESMA constante do rotulo do menu e do titulo da barra: com o menu '
          'dizendo `Achados` e a barra dizendo `Meus achados`, quem procura a '
          'funcao pelo nome do menu nao a reconhece na tela que abriu.',
    );
    expect(find.text('Achados'), findsWidgets);
  });

  testWidgets('o botao de registrar esta no CORPO, e nao na barra',
      (tester) async {
    await _abrirOsAchados(tester);

    expect(
      find.text(MeusAchados.rotuloDeRegistrar),
      findsOneWidget,
      reason: 'REPROVA: o botao de registrar um achado avulso nao esta na '
          'tela. O rotulo saiu do menu nesta frente: sem este botao a acao '
          'fica SEM PORTA NENHUMA no perfil, que e exatamente como '
          '`Pedidos de conexão` passou de 18/10 a 19/10 sem ninguem ver.',
    );
    expect(
      find.descendant(
        of: find.byType(AppBar),
        matching: find.text(MeusAchados.rotuloDeRegistrar),
      ),
      findsNothing,
      reason: 'REPROVA: o botao foi para a BARRA. O padrao de listagem deste '
          'projeto manda por controle no topo do CORPO da tela, nunca na '
          'barra -- e o cliente pediu fixo no topo do corpo.',
    );
  });

  testWidgets('o toque no botao abre o registro de achado', (tester) async {
    await _abrirOsAchados(tester);

    await tocar(tester, find.text(MeusAchados.rotuloDeRegistrar));
    await tester.pumpAndSettle();

    expect(
      find.text(MeusAchados.rotuloDeRegistrar),
      findsNothing,
      reason: 'REPROVA: o toque no botao nao saiu da listagem. Um botao que '
          'nao navega e um rotulo sem desfecho.',
    );
  });

  testWidgets('ROLANDO A LISTA, o botao FICA', (tester) async {
    _quantos = 20;
    await _abrirOsAchados(tester);

    final antes = tester.getRect(find.text(MeusAchados.rotuloDeRegistrar));

    // Arrasta a lista para cima o bastante para o primeiro cartao sair de
    // cena. Um botao que fosse apenas o primeiro filho da `ListView` iria
    // embora com ele.
    await tester.drag(find.byType(Scrollable).last, const Offset(0, -600));
    await tester.pump();

    expect(
      find.text(MeusAchados.rotuloDeRegistrar),
      findsOneWidget,
      reason: 'REPROVA: o botao rolou embora. Com 20 itens e `Carregar mais`, '
          'um botao que sai de cena obriga a voltar ao inicio para registrar '
          'o proximo achado -- e quem registra um achado costuma estar na '
          'rua, com um animal na mao. O cliente pediu FIXO.',
    );
    final depois = tester.getRect(find.text(MeusAchados.rotuloDeRegistrar));
    expect(
      depois.top,
      closeTo(antes.top, 1.0),
      reason: 'REPROVA: o botao existe mas MUDOU DE LUGAR com a rolagem '
          '(${antes.top} -> ${depois.top}). Fixo quer dizer fixo.',
    );
  });

  testWidgets('NO VAZIO, o botao continua visivel e com o MESMO rotulo',
      (tester) async {
    _quantos = 0;
    await _abrirOsAchados(tester);

    expect(
      find.text(MeusAchados.vazio),
      findsOneWidget,
      reason: 'REPROVA: o estado de lista vazia deixou de ser anunciado.',
    );
    expect(
      find.text(MeusAchados.rotuloDeRegistrar),
      findsOneWidget,
      reason: 'REPROVA: o botao desapareceu no vazio -- que e justamente o '
          'estado em que registrar o primeiro achado e a unica coisa a fazer '
          'nesta tela. O rotulo e o MESMO da lista cheia: botao que muda '
          'entre o vazio e a lista e um botao que a pessoa aprende duas '
          'vezes.',
    );
  });
}
