// A ORDEM DOS BLOCOS NA PAGINA DO PET (cliente, 22/10/2026).
//
// Literal: *"Na pagina do perfil do pet, inverta os sinais particulares com a
// qr da plaquinha."*
//
// Era `Sinais particulares` e depois o `QR da plaquinha`; agora o QR vem
// primeiro. **O caso mede POSICAO NA TELA, e nao presenca**: os dois blocos
// estavam na pagina antes e continuam depois, e uma isca de presenca ficaria
// verde com a inversao desfeita. Quem decide e a coordenada vertical.
//
// E ele mede os ACOMPANHANTES junto, porque foi isso que a inversao preservou:
// `Cuidados` continua logo abaixo de `Sinais particulares` (os dois sao o
// cadastro do animal) e as acoes destrutivas continuam por ultimo.
import 'dart:convert';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/pet/textos_do_detalhe.dart';
import 'package:bichu/widgets/qr_da_plaquinha.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../api/pets_api_listar_test.dart' show petDoContrato;
import 'ajuda_de_tela.dart';

/// Uma tela de celular (400 dp) bem **alta**: a pagina do pet inteira fica
/// montada, e o caso le a POSICAO das secoes sem depender da rolagem.
///
/// Sem ela o `ListView` nao constroi o que esta fora da janela, e um caso de
/// ORDEM reprovaria dizendo que o bloco nao existe -- pelo motivo errado.
void _telaAlta(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(400, 4000);
  addTearDown(tester.view.reset);
}

const String _petId = '3f1d7a9e-0000-7000-8000-000000000001';

http.Response _json(Object corpo) => http.Response(
  jsonEncode(corpo),
  200,
  headers: const <String, String>{'content-type': 'application/json'},
);

Future<void> _abrirAPaginaDoPet(WidgetTester tester) async {
  await abrirOApp(
    tester,
    deposito: depositoLogado(),
    rede: (http.Request pedido) async {
      final caminho = pedido.url.path;
      if (caminho.endsWith('/pets/$_petId')) {
        return _json(
          petDoContrato(
            id: _petId,
          )..addAll(<String, dynamic>{
            'distinguishing_marks': 'Mancha branca no peito.',
            'care_notes': 'Remedio para alergia toda manha.',
          }),
        );
      }
      if (caminho.endsWith('/pets')) {
        return _json(<String, dynamic>{'items': <dynamic>[]});
      }
      // Tags e pedidos de plaquinha: vazios. O bloco do QR continua sendo
      // desenhado -- ele tem titulo e estado proprios --, e e o titulo que
      // este caso localiza.
      return _json(<String, dynamic>{'items': <dynamic>[]});
    },
  );
  await irPara(tester, Rotas.detalheDoPetDe(_petId));
  await tester.pumpAndSettle();
}

void main() {
  // DESLIGAR PARA VER REPROVAR: em `lib/telas/pet/tela_detalhe_do_pet.dart`,
  // devolva os dois blocos a ordem antiga (o `_CartaoDeTexto` de
  // `rotuloDosSinais` acima do `Semantics` de `QrDaPlaquinha.titulo`). Este
  // caso reprova dizendo as duas coordenadas.
  testWidgets('o QR da plaquinha vem ANTES de Sinais particulares',
      (tester) async {
    _telaAlta(tester);
    await _abrirAPaginaDoPet(tester);

    final qr = find.text(QrDaPlaquinha.titulo);
    final sinais = find.text(TextosDoDetalhe.rotuloDosSinais);

    // CONTROLE POSITIVO, e ele vem PRIMEIRO: esta pagina tem estado de
    // carregando, de falha e de pet apagado, e em nenhum deles os dois titulos
    // existem. Sem os dois presentes, comparar coordenadas nao mede ordem --
    // mede se a tela abriu.
    expect(
      qr,
      findsOneWidget,
      reason: 'REPROVA: a pagina nao desenhou o titulo do QR da plaquinha. '
          'Sem ele nao ha o que ordenar, e a comparacao abaixo nao prova '
          'nada.',
    );
    expect(
      sinais,
      findsOneWidget,
      reason: 'REPROVA: a pagina nao desenhou `Sinais particulares`. Mesma '
          'razao do controle acima.',
    );

    final yDoQr = tester.getTopLeft(qr).dy;
    final yDosSinais = tester.getTopLeft(sinais).dy;

    expect(
      yDoQr,
      lessThan(yDosSinais),
      reason:
          'REPROVA: `Sinais particulares` (y=$yDosSinais) esta ACIMA do `QR '
          'da plaquinha` (y=$yDoQr), que e a ordem de antes de 22/10/2026. O '
          'cliente pediu a inversao: *"inverta os sinais particulares com a '
          'qr da plaquinha"*.',
    );
  });

  // DESLIGAR PARA VER REPROVAR: no mesmo arquivo, mova o `_CartaoDeTexto` de
  // `Cuidados` para longe do de `Sinais particulares` (por exemplo, para
  // antes do QR). Este caso reprova.
  testWidgets('`Cuidados` continua logo abaixo de `Sinais particulares`',
      (tester) async {
    _telaAlta(tester);
    await _abrirAPaginaDoPet(tester);

    final sinais = find.text(TextosDoDetalhe.rotuloDosSinais);
    final cuidados = find.text('Cuidados');
    expect(sinais, findsOneWidget);
    expect(
      cuidados,
      findsOneWidget,
      reason: 'REPROVA (controle positivo): o pet desta bancada tem '
          '`care_notes`, entao o bloco `Cuidados` tem de existir.',
    );

    expect(
      tester.getTopLeft(sinais).dy,
      lessThan(tester.getTopLeft(cuidados).dy),
      reason:
          'REPROVA: `Cuidados` subiu acima de `Sinais particulares`. A '
          'inversao de 22/10 trocou os dois blocos COM os seus acompanhantes: '
          'os dois cartoes de texto sao o cadastro do animal e sao o mesmo '
          'assunto.',
    );
  });

  // DESLIGAR PARA VER REPROVAR: mova `_AcaoEmTexto` de `excluir` para antes do
  // bloco do QR. Este caso reprova.
  testWidgets('as acoes destrutivas continuam por ULTIMO', (tester) async {
    _telaAlta(tester);
    await _abrirAPaginaDoPet(tester);

    final excluir = find.text(TextosDoDetalhe.excluir);
    final qr = find.text(QrDaPlaquinha.titulo);
    final sinais = find.text(TextosDoDetalhe.rotuloDosSinais);
    expect(excluir, findsOneWidget);
    expect(qr, findsOneWidget);
    expect(sinais, findsOneWidget);

    final yDoExcluir = tester.getTopLeft(excluir).dy;
    expect(
      yDoExcluir,
      greaterThan(tester.getTopLeft(qr).dy),
      reason: 'REPROVA: `Excluir` subiu acima do QR.',
    );
    expect(
      yDoExcluir,
      greaterThan(tester.getTopLeft(sinais).dy),
      reason:
          'REPROVA: `Excluir` subiu acima de `Sinais particulares`. A '
          'inversao de 22/10 mexeu em DOIS blocos e nao podia mexer nas '
          'acoes destrutivas: elas ficam no fim e separadas por mais de 16 dp '
          'de qualquer outro alvo (7.6.3).',
    );
  });
}
