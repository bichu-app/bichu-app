// O GLIFO DO TIPO no lugar da imagem de um inscrito do diretorio.
//
// Pedido do cliente em 18/10/2026: *"tem que colocar o icone de clinica,
// estabelecimento, profissional, caso a foto/logo da empresa nao tenha sido
// cadastrada"*.
//
// Os casos marcados ISCA sao os que precisam REPROVAR com o mecanismo
// desligado. Cada um diz, no proprio corpo, qual linha mexer e o que observar.
//
// ---------------------------------------------------------------------------
// POR QUE O PRIMEIRO GRUPO LE O `openapi.yaml`
// ---------------------------------------------------------------------------
// A cobertura "todos os tipos" nao pode ser uma lista escrita a mao neste
// arquivo: uma lista a mao fica verde para sempre no dia em que o contrato
// ganhar um valor, e e exatamente ai que a tela ficaria sem icone. O portao do
// grupo 1 compara os dois `enum` do CONTRATO com os dois `enum` do app e com a
// tabela de glifos, e reprova nomeando o valor que ninguem desenhou.
//
// A reserva (`glifoDeReservaDoInscrito`) nao dispensa esse portao, e os dois
// medem coisas diferentes: a reserva garante que um APK ja publicado nao fique
// sem icone quando o servidor emitir um valor novo; o portao garante que a
// PROXIMA versao do app nao saia com um valor conhecido caindo na reserva.

import 'dart:io';

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:bichu/widgets/icone_do_inscrito.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perto_com_dados_test.dart'
    show abrirPerto, entradaDoContrato, paginaDoContrato, raizDoRepositorio;

// ---------------------------------------------------------------------------
// A TABELA, escrita por extenso
// ---------------------------------------------------------------------------

/// O glifo esperado de cada valor de `ProfessionalKind`, **pelo codigo do
/// contrato** e nao pelo nome do `enum` do Dart.
///
/// Escrita aqui a mao, e nao lida de `glifoDoInscrito`: um teste que chamasse a
/// propria funcao que mede compararia a implementacao consigo mesma e passaria
/// com qualquer glifo. A justificativa de cada escolha, e a colisao de sentido
/// que ela evita, esta na prosa de `lib/widgets/icone_do_inscrito.dart`.
const Map<String, IconData> glifoEsperadoPorAtividade = <String, IconData>{
  'clinic': Icons.local_hospital_outlined,
  'vet': Icons.medical_services_outlined,
  'groomer': Icons.shower_outlined,
  'walker': Icons.directions_walk_outlined,
  'sitter': Icons.hotel_outlined,
  'trainer': Icons.school_outlined,
};

/// O glifo esperado de cada valor de `EntityKind`.
///
/// `professional` **nao tem glifo proprio**: ele e o eixo "o que a entrada e",
/// e um profissional cai no glifo da ATIVIDADE dele. Quem tem glifo proprio e
/// `organization`, porque ONG e a unica coisa que o texto da tela nao diz em
/// lugar nenhum.
const Map<String, IconData?> glifoEsperadoPorEntidade = <String, IconData?>{
  'professional': null,
  'organization': Icons.volunteer_activism_outlined,
};

// ---------------------------------------------------------------------------
// A LEITURA DO CONTRATO
// ---------------------------------------------------------------------------

/// Os valores do `enum` do schema [nome] em `api/openapi.yaml`.
///
/// Le o arquivo, e nao uma copia: o contrato e a fonte, e o app e o espelho.
List<String> valoresDoEnumDoContrato(String nome) {
  final contrato =
      File('${raizDoRepositorio().path}/api/openapi.yaml').readAsStringSync();
  final partes = contrato.split(RegExp('^    $nome:\$', multiLine: true));
  expect(
    partes.length,
    2,
    reason: 'REPROVA: nao achei o schema `$nome` em `api/openapi.yaml`, ou '
        'achei mais de um. Este portao confere os glifos da tela contra o '
        'contrato; sem o schema nao ha o que conferir, e passar sem conferir '
        'e o que ele existe para impedir.',
  );
  // O corpo do schema vai ate o proximo schema declarado na mesma indentacao.
  final corpo = partes[1].split(RegExp(r'^    [A-Za-z]', multiLine: true)).first;
  final lista = RegExp(r'enum:\s*\[([^\]]*)\]').firstMatch(corpo);
  expect(
    lista,
    isNotNull,
    reason: 'REPROVA: o schema `$nome` do contrato nao declara `enum: [...]` '
        'em linha. Se ele passou a declarar a lista em itens de bloco, este '
        'leitor precisa aprender a forma nova -- e nao devolver vazio, que '
        'deixaria o portao verde sem valor nenhum para conferir.',
  );
  return lista!
      .group(1)!
      .split(',')
      .map((v) => v.trim())
      .where((v) => v.isNotEmpty)
      .toList(growable: false);
}

// ---------------------------------------------------------------------------
// A MASSA E A ABERTURA
// ---------------------------------------------------------------------------

/// O detalhe de `DirectoryEntryDetail`, com `rating` (que e OBRIGATORIO la).
Map<String, dynamic> detalheDoContrato({
  String slug = 'clinica-santa-barbara',
  String kind = 'clinic',
  String displayName = 'Clínica Santa Bárbara',
  Object? entityKind,
  String? photoUrl,
}) {
  return <String, dynamic>{
    'slug': slug,
    'kind': kind,
    'entity_kind': ?entityKind,
    'display_name': displayName,
    'city': 'São Paulo',
    'state': 'SP',
    'neighborhood': 'Pinheiros',
    'about': 'Atende cão e gato.',
    'phone_e164': null,
    'verification': <String, dynamic>{
      'level': 'document_verified',
      'evidence_kinds': <String>['cnpj'],
    },
    'rating': <String, dynamic>{
      'count': 0,
      'average': null,
      'histogram': <String, int>{'1': 0, '2': 0, '3': 0, '4': 0, '5': 0},
    },
    'can_review': false,
    'review_blocked_reason': null,
    'my_review_ref': null,
    'distance_m': null,
    'photo_url': ?photoUrl,
  };
}

/// A rede do diretorio: listagem, detalhe e avaliacoes. **404 no resto.**
Future<http.Response> Function(http.Request) redeComDetalhe({
  required Map<String, dynamic> listagem,
  Map<String, dynamic>? detalhe,
}) {
  return (req) async {
    final caminho = req.url.path;
    if (caminho == '/v1/directory/entries' && req.method == 'GET') {
      return json200(listagem);
    }
    if (caminho.endsWith('/reviews') && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <dynamic>[],
        'page': 1,
        'limit': 10,
        'total': 0,
      });
    }
    if (caminho.startsWith('/v1/directory/entries/') && req.method == 'GET') {
      if (detalhe == null) return problema('not-found', 404);
      return json200(detalhe);
    }
    return problema('not-found', 404);
  };
}

/// Abre a lista do `Perto` com UMA entrada, sem logo, do tipo pedido.
Future<void> abrirUmaEntradaSemLogo(
  WidgetTester tester, {
  required String kind,
  Object? entityKind,
  String? logoUrl,
}) async {
  await abrirPerto(
    tester,
    rede: redeComDetalhe(
      listagem: paginaDoContrato(
        <Map<String, dynamic>>[
          <String, dynamic>{
            ...entradaDoContrato(kind: kind, entityKind: entityKind),
            'logo_url': ?logoUrl,
          },
        ],
        distanciaDisponivel: true,
      ),
    ),
  );
}

/// Quantas vezes [glifo] aparece DENTRO do cartao do diretorio.
///
/// Dentro do cartao, e nao na tela: a `AppBar` do `Perto` tem glifos proprios,
/// e contar a tela inteira mediria a barra junto.
int glifosNoCartao(IconData glifo) {
  return find
      .descendant(
        of: find.byType(CartaoDoDiretorio),
        matching: find.byIcon(glifo),
      )
      .evaluate()
      .length;
}

void main() {
  // -------------------------------------------------------------------------
  // 1. ISCA — todo valor do CONTRATO tem glifo, e nenhum sobra
  // -------------------------------------------------------------------------
  group('ISCA — o contrato manda, e a tabela de glifos o cobre inteiro', () {
    // DESLIGAR PARA VER REPROVAR: apague uma linha de
    // `glifoEsperadoPorAtividade` (por exemplo `'sitter'`). Os dois primeiros
    // casos reprovam nomeando `sitter`. Apagar o `case` correspondente de
    // `glifoDoInscrito` em `lib/widgets/icone_do_inscrito.dart` reprova o
    // terceiro grupo, pelo valor.
    test('`ProfessionalKind`: contrato, `enum` do app e tabela coincidem', () {
      final doContrato = valoresDoEnumDoContrato('ProfessionalKind');

      // O guarda contra o verde por vazio: um leitor de contrato cego devolve
      // lista vazia, e lista vazia nao tem valor sem glifo.
      expect(
        doContrato.length,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA: li ${doContrato.length} valor(es) de '
            '`ProfessionalKind` no contrato. Com menos de dois nao ha o que '
            'cobrir, e este portao passaria sem nunca ter olhado para um tipo.',
      );

      expect(
        AtividadeDoDiretorio.values.map((a) => a.codigo).toSet(),
        doContrato.toSet(),
        reason: 'REPROVA: `AtividadeDoDiretorio` e `ProfessionalKind` do '
            'contrato divergem. O `enum` do contrato e aditivo por '
            'construcao, e um valor novo la precisa de um valor aqui -- e de '
            'um glifo escolhido e JUSTIFICADO em '
            '`lib/widgets/icone_do_inscrito.dart`.',
      );
      expect(
        glifoEsperadoPorAtividade.keys.toSet(),
        doContrato.toSet(),
        reason: 'REPROVA: a tabela de glifos deste arquivo nao cobre '
            'exatamente os valores de `ProfessionalKind`. Falta ou sobra '
            '${glifoEsperadoPorAtividade.keys.toSet().difference(doContrato.toSet()).union(doContrato.toSet().difference(glifoEsperadoPorAtividade.keys.toSet()))}.',
      );
    });

    test('`EntityKind`: contrato, `enum` do app e tabela coincidem', () {
      final doContrato = valoresDoEnumDoContrato('EntityKind');

      expect(
        doContrato.length,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA: li ${doContrato.length} valor(es) de `EntityKind` '
            'no contrato.',
      );
      expect(
        TipoDeEntidade.values.map((t) => t.codigo).toSet(),
        doContrato.toSet(),
        reason: 'REPROVA: `TipoDeEntidade` e `EntityKind` do contrato '
            'divergem. ONG e eixo PROPRIO desde 18/10/2026, e um valor novo '
            'neste eixo e um glifo novo a escolher.',
      );
      expect(
        glifoEsperadoPorEntidade.keys.toSet(),
        doContrato.toSet(),
        reason: 'REPROVA: a tabela de glifos de entidade deste arquivo nao '
            'cobre exatamente os valores de `EntityKind`.',
      );
    });

    test('nenhum par de tipos divide o mesmo glifo', () {
      // Um portao que so olhasse "cada tipo tem glifo" aprovaria uma tabela
      // em que os sete tipos fossem o mesmo desenho -- o que, na tela, e o
      // mesmo que nao ter icone por tipo. E a mesma afirmacao 2 do
      // `icone_de_perto_test.dart`, pela mesma razao.
      final todos = <IconData>[
        ...glifoEsperadoPorAtividade.values,
        ...glifoEsperadoPorEntidade.values.whereType<IconData>(),
        glifoDeReservaDoInscrito,
      ];
      expect(
        todos.toSet().length,
        todos.length,
        reason: 'REPROVA: ha glifo repetido entre tipos. Os '
            '${todos.length} desenhos (seis atividades, ONG e a reserva) '
            'precisam ser distintos entre si, ou o icone deixa de dizer o '
            'tipo.',
      );
    });

    test('a reserva nao e nenhum dos glifos de tipo, nem o de falha', () {
      // `storefront_outlined` e o `simboloDeFalha` da logo no mesmo cartao:
      // ele e o estado "a logo existe e NAO carregou". Se a reserva fosse ele,
      // quem olha nao separaria "nao ha logo" de "a logo quebrou".
      expect(
        glifoDeReservaDoInscrito,
        isNot(Icons.storefront_outlined),
        reason: 'REPROVA: a reserva e o mesmo glifo do estado de falha da '
            'imagem. Dois estados diferentes, dois simbolos diferentes.',
      );
      expect(
        glifoEsperadoPorAtividade.values,
        isNot(contains(glifoDeReservaDoInscrito)),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. A FUNCAO, direto: total, e com o eixo de entidade vencendo
  // -------------------------------------------------------------------------
  group('`glifoDoInscrito`: a regra, sem tela', () {
    test('cada atividade do contrato devolve o glifo da tabela', () {
      for (final codigo in glifoEsperadoPorAtividade.keys) {
        final atividade = AtividadeDoDiretorio.porCodigo(codigo);
        expect(
          atividade,
          isNotNull,
          reason: 'REPROVA: `$codigo` esta no contrato e '
              '`AtividadeDoDiretorio.porCodigo` nao o reconhece.',
        );
        expect(
          glifoDoInscrito(atividade: atividade),
          glifoEsperadoPorAtividade[codigo],
          reason: 'REPROVA: o glifo de `$codigo` nao e o da tabela.',
        );
      }
    });

    test('`organization` VENCE a atividade', () {
      // A atividade ja esta escrita em palavras no cartao
      // (`AtividadeDoDiretorio.rotulo`); o tipo de entidade nao esta escrito
      // em lugar nenhum, e o glifo e o unico lugar onde ele aparece.
      expect(
        glifoDoInscrito(
          atividade: AtividadeDoDiretorio.clinic,
          tipoDeEntidade: TipoDeEntidade.organizacao,
        ),
        Icons.volunteer_activism_outlined,
        reason: 'REPROVA: uma ONG que atende como clinica desenhou a cruz da '
            'clinica. O contrato diz que os dois eixos convivem, e a palavra '
            '"Clinica" ja esta no cartao -- o glifo e a unica coisa que pode '
            'dizer ONG.',
      );
    });

    test('`professional` NAO rouba o glifo da atividade', () {
      expect(
        glifoDoInscrito(
          atividade: AtividadeDoDiretorio.groomer,
          tipoDeEntidade: TipoDeEntidade.profissional,
        ),
        Icons.shower_outlined,
      );
    });

    test('ISCA — a funcao e TOTAL: nulo em qualquer eixo ainda tem glifo', () {
      // DESLIGAR PARA VER REPROVAR: troque o `null =>
      // glifoDeReservaDoInscrito` de `glifoDoInscrito` por um `throw`, ou faca
      // a funcao devolver `IconData?` e `null`. Este caso reprova; e e o caso
      // do APK ja publicado lendo um valor que o servidor passou a emitir.
      expect(glifoDoInscrito(), glifoDeReservaDoInscrito);
      expect(
        glifoDoInscrito(atividade: AtividadeDoDiretorio.porCodigo('ufologo')),
        glifoDeReservaDoInscrito,
        reason: 'REPROVA: atividade desconhecida nao caiu na reserva.',
      );
      expect(
        glifoDoInscrito(tipoDeEntidade: TipoDeEntidade.porCodigo('governo')),
        glifoDeReservaDoInscrito,
        reason: 'REPROVA: tipo de entidade desconhecido nao caiu na reserva. '
            '`TipoDeEntidade.porCodigo` devolve nulo para valor que esta '
            'versao nao conhece, de proposito.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 3. ISCA — a tela PINTA o glifo do tipo, um valor do contrato por vez
  // -------------------------------------------------------------------------
  group('ISCA — o cartao sem logo desenha o glifo do tipo', () {
    // DESLIGAR PARA VER REPROVAR: em
    // `lib/telas/perto/lista_do_diretorio.dart`, troque o `else
    // IconeDoInscrito(...)` do cartao por um `else SizedBox.shrink()` -- que e
    // o que a tela fazia ate 18/10/2026, quando o cartao sem logo desenhava o
    // nome na largura inteira. Todos os casos deste grupo reprovam, cada um
    // nomeando o seu tipo.
    for (final entrada in glifoEsperadoPorAtividade.entries) {
      testWidgets('`kind: ${entrada.key}` desenha o glifo dele',
          (tester) async {
        await abrirUmaEntradaSemLogo(tester, kind: entrada.key);

        expect(
          glifosNoCartao(entrada.value),
          1,
          reason: 'REPROVA: o cartao de `kind: ${entrada.key}` sem logo nao '
              'desenhou o glifo do tipo. `logo_url` e nulo na maioria das '
              'entradas hoje -- sem logo e sem glifo, o cartao nao diz em '
              'desenho nenhum o que aquele lugar e.',
        );
        // E nenhum dos OUTROS glifos entrou no mesmo cartao.
        for (final outro in glifoEsperadoPorAtividade.entries) {
          if (outro.key == entrada.key) continue;
          expect(
            glifosNoCartao(outro.value),
            0,
            reason: 'REPROVA: o cartao de `${entrada.key}` desenhou tambem o '
                'glifo de `${outro.key}`.',
          );
        }
        expect(
          glifosNoCartao(Icons.volunteer_activism_outlined),
          0,
          reason: 'REPROVA: uma entrada sem `entity_kind` desenhou o glifo de '
              'ONG.',
        );
      });
    }

    testWidgets('`entity_kind: organization` desenha o glifo de ONG',
        (tester) async {
      await abrirUmaEntradaSemLogo(
        tester,
        // Atividade `clinic` **de proposito**: e o caso em que os dois eixos
        // convivem, e e o unico em que a precedencia aparece.
        kind: 'clinic',
        entityKind: 'organization',
      );

      expect(
        glifosNoCartao(Icons.volunteer_activism_outlined),
        1,
        reason: 'REPROVA: a ONG do diretorio nao desenhou o glifo de ONG. ONG '
            'e eixo proprio (`entity_kind`) desde 18/10/2026.',
      );
      expect(
        glifosNoCartao(Icons.local_hospital_outlined),
        0,
        reason: 'REPROVA: a ONG desenhou a cruz da clinica. A palavra '
            '"Clinica" ja esta escrita no cartao; o glifo e o unico lugar que '
            'pode dizer ONG.',
      );
    });

    testWidgets(
        'ISCA — tipo DESCONHECIDO nos dois eixos ainda tem glifo, e a lista '
        'fica de pe', (tester) async {
      // O caso do APK publicado: o servidor passou a emitir valores que esta
      // versao do app nao conhece. Nenhum deles pode deixar o cartao sem
      // icone, e nenhum deles pode derrubar a listagem.
      //
      // DESLIGAR PARA VER REPROVAR: faca `glifoDoInscrito` devolver
      // `IconData?` com `null` no caminho de reserva, e o `IconeDoInscrito`
      // desenhar `SizedBox.shrink()` nesse caso. Este caso reprova.
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(
                slug: 'tipo-novo',
                kind: 'dog_whisperer',
                displayName: 'Sussurrador de Cães',
                entityKind: 'government',
              ),
              // E um valor de outro TIPO no campo, que um `as String?` cru
              // estouraria ao ler. A atividade tambem e desconhecida, para
              // que esta entrada caia na reserva pelos DOIS eixos.
              entradaDoContrato(
                slug: 'tipo-errado',
                kind: 'exorcista_de_pets',
                displayName: 'Tipo Errado',
                entityKind: 42,
              ),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      expect(
        find.byType(CartaoDoDiretorio),
        findsNWidgets(2),
        reason: 'REPROVA: a listagem perdeu cartao por causa de um valor de '
            'tipo que o app nao conhece. Os dois `enum` do contrato sao '
            'aditivos por construcao.',
      );
      expect(
        find.descendant(
          of: find.byType(CartaoDoDiretorio),
          matching: find.byIcon(glifoDeReservaDoInscrito),
        ),
        findsNWidgets(2),
        reason: 'REPROVA: cartao de tipo desconhecido ficou sem glifo. A '
            'reserva existe exatamente para este dia.',
      );
      expect(find.text('Sussurrador de Cães'), findsOneWidget);
      expect(find.text('Tipo Errado'), findsOneWidget);
    });

    testWidgets('ISCA — COM logo, o glifo do tipo NAO entra', (tester) async {
      // O glifo e o lugar da imagem AUSENTE. Com logo, a logo e o desenho --
      // e o `cacheWidth` dela continua sendo o que mantem a listagem em 2,15
      // MiB em vez de 88 MiB.
      //
      // DESLIGAR PARA VER REPROVAR: troque o `if (logo != null) ... else
      // IconeDoInscrito(...)` do cartao por desenhar os dois sempre. Este caso
      // reprova.
      await abrirUmaEntradaSemLogo(
        tester,
        kind: 'clinic',
        logoUrl:
            'https://midia.bichu.app/directory-logo/thumb/a1b2c3d4e5f6.jpeg',
      );

      expect(
        find.byType(ImagemDaRede),
        findsOneWidget,
        reason: 'REPROVA: a entrada com logo nao desenhou a imagem de rede.',
      );
      expect(
        find.byType(IconeDoInscrito),
        findsNothing,
        reason: 'REPROVA: o cartao desenhou a logo E o glifo do tipo. O glifo '
            'e o lugar da imagem AUSENTE.',
      );
      expect(
        glifosNoCartao(Icons.local_hospital_outlined),
        0,
        reason: 'REPROVA: o glifo do tipo entrou num cartao que tem logo.',
      );
    });

    testWidgets('ISCA — o glifo e DECORATIVO: o nome e dito uma vez',
        (tester) async {
      // Mesma razao de `descricao: null` na logo: o glifo fica ao lado do
      // nome, dentro do `MergeSemantics` do cartao, e o tipo ja esta escrito
      // em texto na linha da atividade. Um rotulo aqui nao criaria parada de
      // foco nova -- ele entraria no rotulo do cartao e faria o leitor de tela
      // dizer o tipo duas vezes na mesma parada.
      //
      // DESLIGAR PARA VER REPROVAR: troque o `ExcludeSemantics` de
      // `IconeDoInscrito` por `Semantics(label: 'Clínica')`. O rotulo do
      // cartao passa a ter "Clínica" duas vezes e este caso reprova.
      // **O nome da massa NAO contem a palavra do tipo**, e isso e o caso e
      // nao um detalhe: com `Clínica Santa Bárbara` a palavra "Clínica" sai
      // duas vezes do rotulo de forma legitima -- uma no nome, outra na linha
      // da atividade -- e a contagem mediria a microcopy em vez do glifo.
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(slug: 'pata-firme', displayName: 'Pata Firme'),
            ],
            distanciaDisponivel: true,
          ),
        ),
      );

      final semantica = tester.getSemantics(find.text('Pata Firme'));
      // O guarda contra o verde por vazio: rotulo vazio nao contem nada, e
      // toda contagem nele daria zero.
      expect(
        semantica.label,
        isNotEmpty,
        reason: 'REPROVA: o cartao publicou rotulo VAZIO. Rotulo vazio faz '
            'contagem de ocorrencia dar zero e passa por "nao repete".',
      );
      expect(
        'Clínica'.allMatches(semantica.label).length,
        1,
        reason: 'REPROVA: "Clínica" aparece '
            '${'Clínica'.allMatches(semantica.label).length} vezes no rotulo '
            'do cartao ("${semantica.label}"). O cartao e UMA parada de foco; '
            'o glifo e desenho, e nao um segundo anuncio do tipo.',
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. ISCA — a pagina do local, sem foto
  // -------------------------------------------------------------------------
  group('ISCA — a pagina do local sem foto desenha o glifo do tipo', () {
    Future<void> abrirOLocal(
      WidgetTester tester, {
      required Map<String, dynamic> detalhe,
    }) async {
      await abrirPerto(
        tester,
        rede: redeComDetalhe(
          listagem: paginaDoContrato(
            <Map<String, dynamic>>[
              entradaDoContrato(
                slug: detalhe['slug'] as String,
                displayName: detalhe['display_name'] as String,
              ),
            ],
            distanciaDisponivel: true,
          ),
          detalhe: detalhe,
        ),
      );
      await tester.tap(
        find
            .descendant(
              of: find.byType(CartaoDoDiretorio),
              matching: find.byType(InkWell),
            )
            .first,
      );
      await tester.pumpAndSettle();
      expect(
        find.byType(PaginaDoLocal),
        findsOneWidget,
        reason: 'REPROVA: a pagina do local nao abriu. Sem ela na arvore, os '
            'casos deste grupo passariam por nao ter o que medir.',
      );
    }

    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // troque o `if (detalhe.fotoUrl == null) Row(...)` do `_Cabecalho` pelo
    // `Semantics(header: true, ...)` sozinho -- que e o que a pagina fazia ate
    // 18/10/2026. Os dois primeiros casos reprovam.
    testWidgets('sem `photo_url`, o glifo fica ao lado do nome',
        (tester) async {
      await abrirOLocal(tester, detalhe: detalheDoContrato(kind: 'vet'));

      expect(
        find.descendant(
          of: find.byType(PaginaDoLocal),
          matching: find.byIcon(Icons.medical_services_outlined),
        ),
        findsOneWidget,
        reason: 'REPROVA: a pagina de um `vet` sem foto nao desenhou o glifo '
            'do tipo.',
      );

      // E A PAGINA CONTINUA ABRINDO NO NOME, com `Informações` dentro da
      // arvore. Esta e a asserção que guarda a decisao de NAO desenhar uma
      // faixa 16:9 vazia: a primeira tentativa desta entrega pos o glifo numa
      // faixa de borda a borda e empurrou `Atende cão e gato.` para fora da
      // arvore do `ListView`.
      expect(find.text('Clínica Santa Bárbara'), findsWidgets);
      expect(
        find.text('Atende cão e gato.'),
        findsWidgets,
        reason: 'REPROVA: `Informações` saiu da arvore. O glifo do tipo mora '
            'num quadrado de 56 dp ao lado do nome, e NAO numa faixa 16:9 de '
            'borda a borda: a faixa vazia empurra o conteudo para baixo da '
            'dobra em toda entrada sem foto, que e a maioria delas.',
      );
    });

    testWidgets('`entity_kind: organization` tambem vale na pagina',
        (tester) async {
      await abrirOLocal(
        tester,
        detalhe: detalheDoContrato(kind: 'clinic', entityKind: 'organization'),
      );

      expect(
        find.descendant(
          of: find.byType(PaginaDoLocal),
          matching: find.byIcon(Icons.volunteer_activism_outlined),
        ),
        findsOneWidget,
        reason: 'REPROVA: a pagina de uma ONG nao desenhou o glifo de ONG. O '
            'eixo de entidade vence o de atividade nos DOIS lugares, ou o '
            'cartao e a pagina do mesmo local mostram coisas diferentes.',
      );
      expect(
        find.descendant(
          of: find.byType(PaginaDoLocal),
          matching: find.byIcon(Icons.local_hospital_outlined),
        ),
        findsNothing,
      );
    });

    testWidgets('ISCA — COM `photo_url`, o glifo do tipo NAO entra',
        (tester) async {
      // Com foto, a faixa 16:9 e o desenho, e o tipo esta escrito em palavras
      // na linha da atividade: um terceiro lugar dizendo a mesma coisa e
      // ruido.
      //
      // DESLIGAR PARA VER REPROVAR: tire o `if (detalhe.fotoUrl == null)` do
      // `_Cabecalho` e desenhe o `Row` sempre. Este caso reprova.
      await abrirOLocal(
        tester,
        detalhe: detalheDoContrato(
          kind: 'clinic',
          photoUrl:
              'https://midia.bichu.app/directory-photo/banner/f6e5d4c3.jpeg',
        ),
      );

      expect(
        find.byType(ImagemDaRede),
        findsOneWidget,
        reason: 'REPROVA: a pagina com foto nao desenhou a faixa.',
      );
      expect(
        find.byType(IconeDoInscrito),
        findsNothing,
        reason: 'REPROVA: a pagina desenhou a faixa E o glifo do tipo.',
      );
    });
  });
}
