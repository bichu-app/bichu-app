// BICHUS-233 (e BICHUS-230, que e o mesmo achado nao refinado) — o icone de
// `Perto` e o alfinete de localizacao, e nenhuma secao repete campo semantico.
//
// Pedido do cliente em 22/09/2026, depois do primeiro teste em aparelho
// fisico: "o icone do menu perto, parece de uma loja, troque para algo que
// fale mais sobre localizacao, como um pin."
//
// **Ele tem razao por construcao, e nao por gosto.** `storefront` desenha uma
// fachada de loja e ficava a dois slots de `shopping_bag`, a sacola de `Loja`.
// A UX 27.3 registrou que o rotulo curto TRANSFERIU o significado para o
// icone; dois glifos do mesmo campo desfazem justamente a transferencia de que
// a barra de cinco depende.
//
// As tres afirmacoes deste arquivo sao de forca crescente:
//
// 1. o glifo de `Perto` e o decidido, e `storefront` nao volta;
// 2. os cinco glifos sao distintos entre si -- um portao que so olhasse
//    `Perto` nao pegaria a proxima colisao;
// 3. nenhum par de secoes declara o mesmo CAMPO SEMANTICO. Esta e a que pega
//    o defeito de hoje **e** o de quem acrescentar uma secao escolhendo o
//    icone pela estetica.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/casca_com_abas.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// A mesma afirmacao da isca 3, sobre a lista que o caso mandar.
///
/// Mora numa funcao para que a PROVA NEGATIVA possa exercita-la com uma lista
/// defeituosa. Um caso que refizesse a varredura a mao provaria que a copia
/// dele reprova, e nao que o portao reprova.
void exigirCamposSemanticosDistintos(List<DestinoDeNavegacao> destinos) {
  // O guarda que impede o verde por vazio: uma lista vazia nao tem par
  // repetido, e passaria sem nunca ter olhado para uma secao.
  expect(
    destinos.length,
    greaterThanOrEqualTo(2),
    reason: 'REPROVA: a lista de destinos tem ${destinos.length} item(ns). '
        'Com menos de dois nao existe par para comparar, e afirmar "nenhum '
        'par repetido" seria verde por nao ter o que conferir.',
  );

  final porCampo = <CampoSemantico, List<String>>{};
  for (final d in destinos) {
    porCampo.putIfAbsent(d.campoSemantico, () => <String>[]).add(d.rotulo);
  }
  final repetidos = porCampo.entries.where((e) => e.value.length > 1).toList();
  expect(
    repetidos,
    isEmpty,
    reason: 'REPROVA: duas secoes tiram a leitura do MESMO campo semantico:\n'
        '${repetidos.map((e) => '  ${e.key.name}: ${e.value.join(", ")}').join('\n')}\n'
        'O rotulo encurtou e o significado foi transferido para o icone '
        '(UX 27.3). Dois icones do mesmo campo desfazem a transferencia, e e '
        'exatamente o que o cliente leu na barra em 22/09.',
  );
}

void main() {
  group('ISCA 1 — `Perto` usa o alfinete, e `storefront` nao volta', () {
    test('o destino de `Rotas.perto` tem os dois estados do alfinete', () {
      final destinos = CascaComAbas.destinos;
      // O guarda: uma lista vazia satisfaz "nenhum destino usa storefront"
      // trivialmente, e o caso ficaria verde sem nunca ter olhado para nada.
      expect(
        destinos,
        isNotEmpty,
        reason: 'REPROVA: `CascaComAbas.destinos` esta vazia. Sem destino nao '
            'ha o que conferir, e um verde aqui nao significaria nada.',
      );

      final perto = destinos.singleWhere((d) => d.rota == Rotas.perto);
      expect(
        perto.icone,
        Icons.place_outlined,
        reason: 'REPROVA: `Perto` em repouso nao usa o alfinete de '
            'localizacao. Contorno em repouso e o M3, e o que os outros '
            'quatro ja fazem.',
      );
      expect(
        perto.iconeSelecionado,
        Icons.place,
        reason: 'REPROVA: `Perto` selecionada nao usa o alfinete preenchido.',
      );
    });

    test('NENHUM destino da barra usa um glifo de comercio de fachada', () {
      final destinos = CascaComAbas.destinos;
      expect(destinos, isNotEmpty);

      final comFachada = destinos
          .where((d) =>
              d.icone == Icons.storefront ||
              d.icone == Icons.storefront_outlined ||
              d.iconeSelecionado == Icons.storefront ||
              d.iconeSelecionado == Icons.storefront_outlined)
          .map((d) => d.rotulo)
          .toList();
      expect(
        comFachada,
        isEmpty,
        reason: 'REPROVA: ${comFachada.join(", ")} voltou a desenhar uma '
            'fachada de loja. Foi o achado do cliente em 22/09, e ele estava '
            'a dois slots da sacola de `Loja`.',
      );
    });

    test('o rotulo e o nome acessivel de `Perto` NAO mudaram', () {
      // A troca e puramente visual: o icone e decorativo e nao entra na
      // arvore (UX 27.7). Um caso que so olhasse o glifo nao acusaria alguem
      // que aproveitasse a passagem para mexer no texto.
      final perto =
          CascaComAbas.destinos.singleWhere((d) => d.rota == Rotas.perto);
      expect(perto.rotulo, 'Perto');
      expect(
        perto.semanticsLabel,
        'Perto, profissionais e estabelecimentos indicados',
        reason: 'REPROVA: o nome acessivel de `Perto` mudou. A troca do icone '
            'nao tem efeito de acessibilidade, e nao podia ter.',
      );
    });
  });

  group('ISCA 2 — os cinco glifos sao distintos entre si', () {
    test('nenhum par de secoes desenha o mesmo icone', () {
      final destinos = CascaComAbas.destinos;
      expect(
        destinos.length,
        greaterThanOrEqualTo(2),
        reason: 'REPROVA: com menos de dois destinos nao ha par para '
            'comparar, e a afirmacao seria vazia.',
      );

      final emRepouso = destinos.map((d) => d.icone).toSet();
      expect(
        emRepouso,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham o MESMO glifo em repouso. '
            'Glifos: ${destinos.map((d) => '${d.rotulo}=${d.icone}').join(', ')}',
      );

      final selecionados = destinos.map((d) => d.iconeSelecionado).toSet();
      expect(
        selecionados,
        hasLength(destinos.length),
        reason: 'REPROVA: duas secoes desenham o MESMO glifo selecionado.',
      );
    });
  });

  group('ISCA 3 — nenhum par de secoes compartilha campo semantico', () {
    test('a barra de hoje tem cinco vocabularios distintos', () {
      exigirCamposSemanticosDistintos(CascaComAbas.destinos);
    });

    test('os cinco campos sao os declarados, um por secao', () {
      // Sem isto, a isca 3 passaria com os cinco declarando valores
      // arbitrarios e distintos: distintos entre si e o criterio, mas o campo
      // precisa mesmo descrever o glifo que esta la.
      final porRotulo = <String, CampoSemantico>{
        for (final d in CascaComAbas.destinos) d.rotulo: d.campoSemantico,
      };
      expect(porRotulo, <String, CampoSemantico>{
        'Pets': CampoSemantico.animal,
        'Rede': CampoSemantico.comunidade,
        'Perto': CampoSemantico.lugar,
        'Loja': CampoSemantico.compra,
        'Perfil': CampoSemantico.conta,
      });
    });
  });

  group('PROVA NEGATIVA — o portao precisa REPROVAR com o defeito de volta',
      () {
    // A isca de B, escrita na propria BICHUS-230: "o estado de hoje, com
    // `storefront` e `shopping_bag` os dois em `compra`, o portao PRECISA
    // reprovar. Se ficar verde, a tabela esta mentindo e o portao nao esta
    // olhando."
    test('duas secoes em `compra` reprovam', () {
      final comoEraAntesDe2209 = <DestinoDeNavegacao>[
        const DestinoDeNavegacao(
          rotulo: 'Perto',
          reforcoAcessivel: 'profissionais e estabelecimentos indicados',
          reforcoDaPagina: 'irrelevante para este caso',
          // O glifo e o campo que a barra tinha ate 22/09.
          icone: Icons.storefront_outlined,
          iconeSelecionado: Icons.storefront,
          rota: Rotas.perto,
          estado: EstadoDaSecao.planejada,
          campoSemantico: CampoSemantico.compra,
        ),
        const DestinoDeNavegacao(
          rotulo: 'Loja',
          reforcoAcessivel: 'a loja do Bichu',
          reforcoDaPagina: 'irrelevante para este caso',
          icone: Icons.shopping_bag_outlined,
          iconeSelecionado: Icons.shopping_bag,
          rota: Rotas.loja,
          estado: EstadoDaSecao.planejada,
          campoSemantico: CampoSemantico.compra,
        ),
      ];

      expect(
        () => exigirCamposSemanticosDistintos(comoEraAntesDe2209),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao de campo semantico NAO acusou a barra do '
            'jeito que ela estava quando o cliente reclamou. Ele esta cego, e '
            'a distincao que ele afirma todo dia nao vale nada.',
      );
    });

    test('lista vazia reprova pelo guarda, e nao passa em silencio', () {
      expect(
        () => exigirCamposSemanticosDistintos(const <DestinoDeNavegacao>[]),
        throwsA(isA<TestFailure>()),
        reason: 'REPROVA: o portao ficou VERDE sobre uma lista vazia. Uma '
            'lista sem destinos nao tem par repetido, e e assim que um portao '
            'aprova todo dia sem nunca ter olhado para a barra.',
      );
    });
  });
}
