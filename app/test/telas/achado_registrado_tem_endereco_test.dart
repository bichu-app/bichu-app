// A ISCA do achado invisivel -- 18/10/2026.
//
// A QUEIXA, palavra por palavra: *"cadastrei que encontrei um pet e nao esta
// aparecendo na tela de pets"*.
//
// O QUE FOI MEDIDO, e por que o conserto nao foi onde a queixa aponta
// --------------------------------------------------------------------
// O registro **existia** no banco de homologacao, inteiro e sem nada que o
// filtrasse: `origin = 'stray_report'`, `status = 'open'`,
// `reporter_user_id` preenchido, `case_id` nulo, e a tabela nao tem
// `deleted_at`. `GET /v1/found-reports` (`listMyFoundReports`) esta montada
// (`src/modules/found/adapters/http/found-report-routes.ts:346`) e a consulta
// dela (`construtorDaLista`, `kysely-found-report-repository.ts:140`) filtra
// por UMA coisa so -- `reporter_user_id` -- e devolve a linha. O servidor
// estava certo de ponta a ponta.
//
// O app e que nao tinha leitor. Tres ausencias somadas:
//
//   1. `GET /v1/found-reports` **nao tem um chamador em `app/lib`**:
//      `AchadosApi` so sabe `POST /found-reports`,
//      `GET /found-reports/{id}` e a intencao de foto.
//   2. `Rotas.achadoDe` **nao era chamada de lugar nenhum**, o que deixava
//      `TelaDoAchado` construida, roteada em `rotas.dart` e inalcancavel.
//   3. A UNICA acao do desfecho (`TelaAchadoRegistrado`) mandava para
//      `Rotas.pets`, que pinta "A lista de pets perdidos esta em construcao".
//
// O conserto fechou a (2) e a (3) ligando o desfecho a tela que ja existia. A
// (1) -- a LISTA de achados -- **continua faltando**, e esta isca nao a
// inventa: ela cobra que o registro tenha ao menos UM endereco alcancavel.
//
// COMO ELA MEDE, pelas duas pontas
// --------------------------------
//  1. **Pela tela**: o desfecho registrado leva a `/achados/<id>` de verdade,
//     conferido na URL do roteador depois do toque -- e nao na presenca de um
//     botao, que um rotulo trocado satisfaria.
//  2. **Pelo `app/lib` no disco, sem abrir tela nenhuma**: existe pelo menos
//     um chamador de `Rotas.achadoDe` fora de `rotas.dart`. Esta metade e a que
//     sobrevive ao conserto de verdade: no dia em que a lista de achados
//     nascer e este desfecho mudar, a metade 1 pode ser reescrita, e a 2
//     continua cobrando que o registro NAO volte a ser orfao.
//
// As duas pontas sao independentes de proposito: a 1 exercita o widget, a 2 le
// texto de arquivo. Nenhuma das duas reusa a outra.
//
// DESLIGAR PARA VER REPROVAR -- os passos estao escritos e **NAO foram
// medidos** (a regra do cliente proibiu rodar suite nesta rodada). Nao ha
// numero de casos aqui porque numero que nao foi medido e invencao:
//
//   1. Em `lib/telas/achado/tela_achado_registrado.dart`, troque a lista de
//      `acoes` do estado registrado pela do estado de fila -- isto e, devolva
//      o desfecho ao beco de uma acao so apontando para `Rotas.pets`.
//      Esperado: reprova o caso `o desfecho registrado leva ao achado, e nao
//      a secao de pets` dizendo em que rota parou.
//   2. No mesmo arquivo, troque `Rotas.achadoDe(achado.id)` por
//      `Rotas.pets`, deixando o rotulo `Ver o achado` no lugar.
//      Esperado: reprova o mesmo caso -- e e por isso que a assercao e na URL
//      e nao no botao.
//   3. Apague a chamada de `Rotas.achadoDe` do arquivo.
//      Esperado: reprova TAMBEM `Rotas.achadoDe tem chamador`, que e a metade
//      que nao depende desta tela.

import 'dart:convert';
import 'dart:io';

import 'package:bichu/api/modelos_achado.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/achado/resultado_do_achado.dart';
import 'package:bichu/telas/achado/textos_do_achado.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

/// O id do achado do caso. **Um uuid de verdade e nao `a-1`**: a rota monta o
/// endereco com `Uri.encodeComponent`, e um id com caractere escapavel
/// esconderia um defeito de montagem atras de uma comparacao que passa.
const String idDoAchado = '01a14d3f-d95f-70b1-b31e-16d141678d34';

AchadoRegistrado achadoDoCaso() {
  return AchadoRegistrado(
    id: idDoAchado,
    origem: OrigemDoAchado.achadoAvulso,
    status: StatusDoAchado.aberto,
    criadoEm: DateTime.utc(2026, 10, 18, 4, 23, 12),
    achadoEm: DateTime.utc(2026, 10, 18, 4, 23, 12),
    rotuloDaArea: 'Vila Gertrudes, São Paulo',
  );
}

/// O corpo de `GET /found-reports/{id}`, que [TelaDoAchado] le ao abrir.
///
/// Ele responde o MESMO registro do desfecho. Se a tela de destino nao
/// conseguisse carregar, o caso ainda passaria -- a assercao e na rota, nao no
/// conteudo --, e isso e deliberado: esta isca cobra endereco alcancavel, e
/// quem cobra o conteudo de `TelaDoAchado` e um caso da propria tela.
Future<http.Response> redeDoCaso(http.Request pedido) async {
  return http.Response(
    jsonEncode(<String, dynamic>{
      'id': idDoAchado,
      'origin': 'stray_report',
      'status': 'open',
      'created_at': '2026-10-18T04:23:12Z',
      'found_at': '2026-10-18T04:23:12Z',
      'area_label': 'Vila Gertrudes, São Paulo',
    }),
    200,
    headers: <String, String>{'content-type': 'application/json'},
  );
}

void main() {
  testWidgets('o desfecho registrado leva ao achado, e nao a secao de pets',
      (tester) async {
    await abrirOApp(tester, rede: redeDoCaso);
    await irPara(
      tester,
      Rotas.achadoRegistrado,
      extra: ResultadoDoAchado.registrado(achado: achadoDoCaso()),
    );

    expect(
      find.widgetWithText(BotaoPrimario, TextosDoAchado.verOAchado),
      findsOne,
      reason: 'REPROVA: a acao principal do desfecho nao e mais ver o achado. '
          'Enquanto nao houver lista de achados no app, este botao e o UNICO '
          'caminho do aparelho para o registro que a pessoa acabou de criar; '
          'sem ele o desfecho volta a mandar para a secao de pets, que diz '
          'que a lista esta em construcao.',
    );

    await tester.tap(
      find.widgetWithText(BotaoPrimario, TextosDoAchado.verOAchado),
    );
    await tester.pumpAndSettle();

    final String onde = GoRouter.of(tester.element(find.byType(Scaffold).first))
        .routerDelegate
        .currentConfiguration
        .uri
        .path;

    expect(
      onde,
      Rotas.achadoDe(idDoAchado),
      reason: 'REPROVA: o desfecho do achado parou em "$onde". O registro foi '
          'para o banco com status "open" e com relator, e o app nao tem onde '
          'mostra-lo: `listMyFoundReports` nao tem chamador e esta era a '
          'unica porta de `TelaDoAchado`. Parar em ${Rotas.pets} e exatamente '
          'a queixa de 18/10 -- "cadastrei e nao esta aparecendo".',
    );
  });

  testWidgets('o desfecho da FILA nao oferece abrir o que nao tem id',
      (tester) async {
    await abrirOApp(tester, rede: redeDoCaso);
    await irPara(
      tester,
      Rotas.achadoRegistrado,
      extra: ResultadoDoAchado.naFila(),
    );

    expect(
      find.widgetWithText(BotaoPrimario, TextosDoAchado.verOAchado),
      findsNothing,
      reason: 'REPROVA: o estado de FILA oferece abrir o achado. '
          '`ResultadoDoAchado.naFila` nasce com `achado: null` -- nao ha id --, '
          'e `Rotas.achadoDe` ali montaria "/achados/null". O criterio 2 da '
          'BICHUS-31 ja proibe tela de sucesso para o que nao aconteceu; '
          'acao de leitura para o que nao existe e o mesmo erro.',
    );
  });

  test('Rotas.achadoDe tem chamador', () {
    // A metade que nao abre tela: ela le `app/lib` do disco. `TelaDoAchado`
    // ficou construida, roteada e orfa por semanas sem nada acusar, porque
    // tela orfa compila, analisa e passa em todo teste que nao a abre.
    final Directory raiz = Directory('lib');
    expect(
      raiz.existsSync(),
      isTrue,
      reason: 'REPROVA: o caso roda com o diretorio de trabalho errado. Ele '
          'tem de rodar da raiz de `app/`, que e de onde `flutter test` roda.',
    );

    final List<String> chamadores = <String>[];
    for (final FileSystemEntity f in raiz.listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      // `rotas.dart` e onde `achadoDe` e DEFINIDA. Contar o proprio arquivo
      // tornaria o caso tautologico: ele passaria para sempre com a funcao
      // definida e ninguem a chamando, que e precisamente o estado que ele
      // existe para reprovar.
      if (f.path.endsWith('roteamento/rotas.dart')) continue;
      if (f.readAsStringSync().contains('achadoDe(')) chamadores.add(f.path);
    }

    expect(
      chamadores,
      isNotEmpty,
      reason: 'REPROVA: `Rotas.achadoDe` voltou a nao ter chamador nenhum em '
          '`app/lib`, e com isso `TelaDoAchado` volta a ser inalcancavel. O '
          'app nao tem OUTRO leitor de achado: `GET /v1/found-reports` '
          '(`listMyFoundReports`) existe no servidor, responde, e nao tem um '
          'chamador em `app/lib` -- confira antes de apagar a ultima porta.',
    );
  });
}
