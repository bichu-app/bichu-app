// O FILTRO DE BAIRRO DA COMUNIDADE (BICHUS-315, 28/10/2026).
//
// Pedido do cliente, nas palavras dele: *"No filtro da pagina de comunidade,
// precisamos implementar o filtro de bairro, pois em Sao Paulo a cidade e
// muito grande."*
//
// **A razao dele e o requisito**, e ela decide o desenho: filtrar por cidade
// em Sao Paulo nao recorta nada. Um filtro de bairro que so alcance os
// bairros que a tela ja carregou nao resolve o problema que ele descreveu --
// e e exatamente nisso que a escolha entre as duas saidas se decide.
//
// ---------------------------------------------------------------------------
// CAMPO DE TEXTO, E NAO LISTA DE BAIRROS: A ESCOLHA E MEDIDA
// ---------------------------------------------------------------------------
// As duas saidas plausiveis eram um campo que a pessoa DIGITA e uma lista dos
// bairros PRESENTES no recorte atual. **A segunda foi descartada, e o motivo
// ja estava escrito neste repositorio** -- na prosa do proprio
// `CampoDeTextoDoFiltro`, que nasceu para a listagem publica de perdidos:
//
// > *"o aplicativo nao tem de onde tirar uma lista de cidades -- nao ha
// > operacao que as devolva, nao ha geocodificacao (ADR-0006) e montar a
// > lista a partir dos casos que voltaram ofereceria um recorte diferente a
// > cada pagina"*.
//
// O bairro tem a MESMA forma, e o contrato o diz com as proprias palavras:
// *"`city`, `state` e `neighborhood` sao rotulo de exibicao e filtro de
// texto, jamais fonte de coordenada"*. **Filtro de TEXTO, e nao chave de
// entidade**: nao existe lista canonica de bairros, nao ha operacao que a
// devolva, e um seletor com todos os bairros de Sao Paulo nao tem de onde
// sair.
//
// **E a lista derivada falha PIOR justamente no caso dele.** O teto do
// contrato e `limit: 20`: numa cidade com 87 entradas, a lista derivada
// ofereceria os bairros de 20 delas, e o bairro que a pessoa procura e
// provavelmente um dos outros 67. O filtro ofereceria opcoes que mudam a cada
// `Carregar mais` e esconderia justamente o recorte pedido. O caso
// `um bairro que NAO esta em nenhuma entrada carregada pode ser aplicado` e a
// forma mensuravel dessa escolha: ele REPROVA com a lista derivada e passa com
// o campo de texto.
//
// **O grupo `Cidade` desta mesma tela e lista derivada, e isso nao e
// contradicao**: a cidade tem uma fonte que o bairro nao tem -- o aparelho a
// resolve (`CaixaDeLocalizacao`, decisao do cliente de 20/10/2026), e e ela
// que a folha injeta marcada. Nenhuma peca deste app resolve o bairro de
// quem olha.
//
// ---------------------------------------------------------------------------
// O QUE NAO MUDOU, E NAO PODIA MUDAR
// ---------------------------------------------------------------------------
// **O contrato ja tinha o parametro**, nas DUAS operacoes que atendem esta
// lista: `neighborhood`, `minLength: 2`, `maxLength: 80`, em
// `listDirectoryEntries` e em `listPublicDirectoryEntries`. Nada em
// `api/openapi.yaml` nem em `src/` foi tocado, e o servidor ja normaliza
// acento no campo (ha teste dedicado la).
//
// Os dois numeros deste arquivo (2 e 80) sao do contrato, e nao escolhas da
// tela.

import 'package:bichu/api/modelos_diretorio.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'perto_com_dados_test.dart'
    show
        abrirPerto,
        entradaDoContrato,
        redeQuePaginaODiretorio,
        tocarEmCarregarMais;

/// Vinte e cinco entradas, **e o bairro de cada uma**.
///
/// Vinte e cinco, e nao cinco, pelo motivo de `vinteECincoEntradas`: o teto do
/// contrato e `limit: 20`, entao so acima de vinte existe uma entrada que a
/// pagina 1 nao alcanca -- e e justamente ela que este arquivo precisa para
/// medir a escolha do desenho.
///
/// As vinte primeiras ficam em `Pinheiros`; da 21a em diante o bairro e
/// `Vila Madalena`. **`Vila Madalena` nao aparece na pagina 1**, e e o bairro
/// que a lista derivada nao teria como oferecer.
List<Map<String, dynamic>> entradasComBairro() {
  return <Map<String, dynamic>>[
    for (var i = 1; i <= 25; i++)
      entradaDoContrato(
        slug: 'entrada-$i',
        displayName: 'Entrada $i',
        neighborhood: i <= 20 ? 'Pinheiros' : 'Vila Madalena',
      ),
  ];
}

/// Abre a folha de filtros pelo controle do corpo da tela.
Future<void> abrirAFolha(WidgetTester tester) async {
  await tester.ensureVisible(find.byIcon(Icons.tune));
  await tester.pumpAndSettle();
  await tester.tap(find.byIcon(Icons.tune));
  await tester.pumpAndSettle();
}

/// O campo de bairro **de dentro da folha**.
///
/// Recortado pelo `BichuField` do rotulo: a tela tem outro campo de texto (a
/// busca por nome, que continua montada atras da folha), e um
/// `find.byType(TextField)` cru pegaria os dois.
Finder campoDoBairro() {
  return find.descendant(
    of: find.ancestor(
      of: find.text(ListaDoDiretorio.rotuloDoBairro),
      matching: find.byType(BichuField),
    ),
    matching: find.byType(TextField),
  );
}

Future<void> digitarBairro(WidgetTester tester, String texto) async {
  final campo = campoDoBairro();
  expect(
    campo,
    findsOneWidget,
    reason: 'REPROVA: a folha de filtros nao tem campo '
        '"${ListaDoDiretorio.rotuloDoBairro}".',
  );
  await tester.enterText(campo, texto);
  await tester.pumpAndSettle();
}

Future<void> aplicar(WidgetTester tester) async {
  await tester.tap(find.text('Aplicar'));
  await tester.pumpAndSettle();
}

void main() {
  // =========================================================================
  // O PEDIDO: O BAIRRO VAI PARA A ROTA
  // =========================================================================
  group('ISCA — o bairro digitado vira `neighborhood` na rota', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/api/modelos_diretorio.dart`, apague
    // a linha `'neighborhood': ?bairroQueVai` de `RecorteDoDiretorio.query`.
    // O campo continua na folha, o `Aplicar` continua chamando a rota, e a
    // chamada sai SEM o recorte -- a lista volta inteira e o topo da tela diz
    // que ha filtro onde nao ha.
    testWidgets('`Aplicar` manda `neighborhood`, e volta a página 1', (
      tester,
    ) async {
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(entradasComBairro(), urls: urls),
      );

      await abrirAFolha(tester);

      // A FRONTEIRA DA MEDICAO: o que vier depois deste ponto e o que o
      // `Aplicar` produziu, e nada antes dele conta.
      final antes = urls.length;

      await digitarBairro(tester, 'Pinheiros');

      // NADA SE APLICA SOZINHO (regra da folha, decisao do cliente de
      // 17/10/2026): digitar nao chama a rota.
      expect(
        urls.length,
        antes,
        reason: 'REPROVA: digitar no campo chamou a rota. A folha aplica no '
            '`Aplicar`, e numa chamada so.',
      );

      await aplicar(tester);

      final depois = urls.sublist(antes);
      expect(
        depois,
        isNotEmpty,
        reason: 'REPROVA: `Aplicar` nao chamou a rota, e o caso perdeu o que '
            'ia medir.',
      );
      for (final (indice, url) in depois.indexed) {
        expect(
          url.queryParameters['neighborhood'],
          'Pinheiros',
          reason: 'REPROVA: a chamada ${indice + 1} de ${depois.length} saiu '
              'sem `neighborhood=Pinheiros`. As consultas foram: '
              '${depois.map((u) => u.query).toList()}',
        );
        expect(
          url.queryParameters['page'],
          '1',
          reason: 'REPROVA: o filtro novo nao voltou a lista para a página 1. '
              'Recorte novo sobre a página 2 mostra o meio de uma lista que '
              'acabou de mudar.',
        );
      }
    });

    testWidgets('e apagar o campo TIRA o parâmetro', (tester) async {
      // Apagar e um recorte valido, e nao "nao mexi": sem isto quem digitou um
      // bairro ficaria preso nele -- o defeito que `limparTermo` e
      // `limparCidade` desta mesma classe existem para evitar.
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(entradasComBairro(), urls: urls),
      );

      await abrirAFolha(tester);
      await digitarBairro(tester, 'Pinheiros');
      await aplicar(tester);
      expect(urls.last.queryParameters['neighborhood'], 'Pinheiros');

      await abrirAFolha(tester);
      // O CAMPO ABRE COM O QUE ESTA APLICADO, e nao vazio: campo vazio sobre
      // uma lista recortada diria que nao ha recorte.
      expect(
        tester.widget<TextField>(campoDoBairro()).controller?.text,
        'Pinheiros',
        reason: 'REPROVA: a folha reabriu com o campo de bairro vazio, mas a '
            'lista está recortada por bairro.',
      );
      await digitarBairro(tester, '');
      await aplicar(tester);

      expect(
        urls.last.queryParameters.containsKey('neighborhood'),
        isFalse,
        reason: 'REPROVA: apagar o bairro deixou `neighborhood` na rota. A '
            'consulta foi: ${urls.last.query}',
      );
    });
  });

  // =========================================================================
  // O PISO DE DOIS CARACTERES, QUE E DO CONTRATO
  // =========================================================================
  group('ISCA — uma letra só não vai para a rota', () {
    // DESLIGAR PARA VER REPROVAR: em `RecorteDoDiretorio.bairroQueVai`, troque
    // o piso de 2 por 1. A rota passa a receber `neighborhood=P`, responde
    // 400, e a pessoa lê o app quebrado.
    //
    // `minLength: 2` e do contrato, nas duas operacoes. Mesma regra, e mesma
    // razao, de `termoQueVai` (3, pelo indice de trigrama) e de
    // `cidadeQueVai` (2).
    testWidgets('o piso é 2, e é o do contrato', (tester) async {
      expect(
        const RecorteDoDiretorio(bairro: 'P').bairroQueVai,
        isNull,
        reason: 'REPROVA: uma letra só vira parâmetro, e o servidor responde '
            '400 -- que a pessoa lê como o app quebrado.',
      );
      expect(
        const RecorteDoDiretorio(bairro: 'Pi').bairroQueVai,
        'Pi',
        reason: 'REPROVA: duas letras não passam, e o contrato as aceita.',
      );
      expect(
        const RecorteDoDiretorio(bairro: '   ').bairroQueVai,
        isNull,
        reason: 'REPROVA: espaço em branco virou recorte.',
      );
      expect(
        const RecorteDoDiretorio(bairro: '  Pinheiros  ').bairroQueVai,
        'Pinheiros',
        reason: 'REPROVA: o espaço das pontas foi para a rota.',
      );
      expect(
        const RecorteDoDiretorio().query.containsKey('neighborhood'),
        isFalse,
        reason: 'REPROVA: recorte sem bairro manda `neighborhood`.',
      );

      // E a FOLHA barra antes de chamar: com uma letra o `Aplicar` nem
      // habilita, entao o 400 nao acontece.
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(entradasComBairro(), urls: urls),
      );
      await abrirAFolha(tester);
      final antes = urls.length;
      await digitarBairro(tester, 'P');
      await tester.tap(find.text('Aplicar'));
      await tester.pumpAndSettle();

      for (final url in urls.sublist(antes)) {
        expect(
          url.queryParameters['neighborhood'],
          isNot('P'),
          reason: 'REPROVA: a folha deixou sair `neighborhood=P`, que o '
              'contrato recusa com 400.',
        );
      }
    });
  });

  // =========================================================================
  // A ESCOLHA DO DESENHO, MEDIDA
  // =========================================================================
  group('ISCA — o campo é de TEXTO, e não uma lista do que já carregou', () {
    // **ESTE CASO E A ESCOLHA DO DESENHO EM FORMA MENSURAVEL.** Ele REPROVA se
    // alguem trocar o campo digitado por um grupo de opcoes montado a partir
    // das entradas carregadas -- a alternativa que foi considerada e
    // descartada.
    //
    // DESLIGAR PARA VER REPROVAR: troque o `CampoDeTextoDoFiltro` por um
    // `GrupoDeFiltro` com os bairros vistos. `Vila Madalena` nao esta na
    // pagina 1, entao nao haveria opcao para ela, e `digitarBairro` nao
    // acharia o campo.
    testWidgets(
      'um bairro que NÃO está em nenhuma entrada carregada pode ser aplicado',
      (tester) async {
        final urls = <Uri>[];
        await abrirPerto(
          tester,
          rede: redeQuePaginaODiretorio(entradasComBairro(), urls: urls),
        );

        // ANCORA: a pagina 1 tem VINTE entradas e TODAS em `Pinheiros`.
        // `Vila Madalena` existe na massa, da 21a em diante, e **nao esta na
        // tela**. Sem esta ancora o caso nao mediria nada: ele passaria
        // trivialmente se a massa inteira estivesse carregada.
        expect(find.byType(CartaoDoDiretorio), findsNWidgets(20));
        final bairrosNaTela = <String?>{
          for (final c in find.byType(CartaoDoDiretorio).evaluate())
            (c.widget as CartaoDoDiretorio).entrada.bairro,
        };
        expect(
          bairrosNaTela,
          <String>{'Pinheiros'},
          reason: 'a página 1 tem de ter só `Pinheiros` para este caso valer',
        );

        await abrirAFolha(tester);
        final antes = urls.length;
        await digitarBairro(tester, 'Vila Madalena');
        await aplicar(tester);

        final depois = urls.sublist(antes);
        expect(depois, isNotEmpty);
        expect(
          depois.last.queryParameters['neighborhood'],
          'Vila Madalena',
          reason: 'REPROVA: não foi possível pedir um bairro que a tela ainda '
              'não tinha carregado. É esse o defeito da lista derivada, e é '
              'exatamente o caso do cliente: em São Paulo o bairro que a '
              'pessoa procura quase nunca está entre as 20 primeiras '
              'entradas.',
        );
      },
    );

    testWidgets('e ele continua alcançável depois de `Carregar mais`', (
      tester,
    ) async {
      // A lista derivada mudaria de opcoes a cada pagina. O campo de texto
      // nao muda: e a outra metade do argumento do `CampoDeTextoDoFiltro`
      // (*"ofereceria um recorte diferente a cada pagina"*).
      final urls = <Uri>[];
      await abrirPerto(
        tester,
        rede: redeQuePaginaODiretorio(entradasComBairro(), urls: urls),
      );

      await tocarEmCarregarMais(tester);
      expect(find.byType(CartaoDoDiretorio), findsNWidgets(25));

      await abrirAFolha(tester);
      final antes = urls.length;
      await digitarBairro(tester, 'Pinheiros');
      await aplicar(tester);

      expect(
        urls.sublist(antes).last.queryParameters['neighborhood'],
        'Pinheiros',
      );
    });
  });

  // =========================================================================
  // O CONTROLE MORA NO CORPO, E O DISTINTIVO CONTA
  // =========================================================================
  group('o bairro é um filtro como os outros', () {
    // DESLIGAR PARA VER REPROVAR: tire o bairro de
    // `RecorteDoDiretorio.quantidadeDeFiltros`. O distintivo da barra passa a
    // dizer que nenhum filtro está ativo numa lista recortada por bairro.
    testWidgets('ele conta no distintivo da barra', (tester) async {
      expect(
        const RecorteDoDiretorio().quantidadeDeFiltros,
        0,
        reason: 'recorte vazio não tem filtro ativo',
      );
      expect(
        const RecorteDoDiretorio(bairro: 'Pinheiros').quantidadeDeFiltros,
        1,
        reason: 'REPROVA: o bairro aplicado não conta como filtro ativo, e o '
            'distintivo da barra diria `0` numa lista recortada.',
      );
      // Uma letra só NAO conta: ela não vai para a rota, e contar faria o
      // distintivo prometer um recorte que o servidor não aplicou.
      expect(
        const RecorteDoDiretorio(bairro: 'P').quantidadeDeFiltros,
        0,
        reason: 'REPROVA: um bairro que não vai para a rota conta como filtro '
            'ativo. O distintivo tem de contar o que o servidor APLICOU.',
      );
      expect(
        const RecorteDoDiretorio(
          bairro: 'Pinheiros',
          atividade: AtividadeDoDiretorio.clinic,
        ).quantidadeDeFiltros,
        2,
      );
    });

    testWidgets('`com(limparBairro: true)` apaga, e `com()` preserva', (
      tester,
    ) async {
      // `null` num parametro opcional e indistinguivel de "nao passei", e
      // confundir os dois foi o que deixou o botao de localizacao dos pets sem
      // efeito em 20/10/2026. Mesma razao de `limparTermo` e `limparCidade`.
      const base = RecorteDoDiretorio(bairro: 'Pinheiros');
      expect(base.com().bairro, 'Pinheiros');
      expect(base.com(limparBairro: true).bairro, isNull);
      expect(base.com(bairro: 'Vila Madalena').bairro, 'Vila Madalena');
    });

    testWidgets('e a rota PÚBLICA também o recebe', (tester) async {
      // `queryPublica` e derivada de `query` por subtracao, entao o filtro
      // novo chega la sozinho -- e isso e correto e nao acidente: as DUAS
      // operacoes declaram `neighborhood`, conferido em `api/openapi.yaml`.
      // Se so uma declarasse, a derivacao mandaria um parametro que a outra
      // recusa com 400.
      const recorte = RecorteDoDiretorio(bairro: 'Pinheiros');
      expect(recorte.queryPublica['neighborhood'], 'Pinheiros');
      expect(
        recorte.queryPublica.containsKey('sort'),
        isFalse,
        reason: 'a rota pública não declara `sort`, e isso não mudou',
      );
    });
  });
}
