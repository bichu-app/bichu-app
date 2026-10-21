// O ENDERECO DO LOCAL ABRE NO APLICATIVO DE MAPAS.
//
// Pedido do cliente de 20/10/2026, palavra por palavra: *"o endereco do
// profissional tambem deve ser clicavel e abrir as ferramentas de maps, como
// google maps ou waze, de acordo com a ferramenta de padrao do usuario"*.
//
// ## O QUE ESTE ARQUIVO MEDE, E O QUE ELE NAO PODE MEDIR
//
// Ele mede que o toque na linha do endereco chega a PORTA
// (`SaidaDoApp.abrirEnderecoNoAppDeMapas`) com o texto certo, e que ela nao e
// oferecida quando nao ha endereco. **Qual esquema a porta usa em cada
// sistema, e a escolha do seletor do Android contra `maps.apple.com` no iOS,
// mora em `test/dispositivo/acao_externa_no_ios_test.dart`** -- a fronteira e
// a mesma de `loja_abre_no_navegador_test.dart`: a tela nao nomeia esquema
// nenhum, e trocar esquema e mexer na porta, onde a mudanca aparece para a
// `Rede` e para o `Perto` no mesmo diff.
//
// ## O DADO QUE ALIMENTA ISTO AINDA NAO EXISTE POR INTEIRO
//
// `DirectoryEntryDetail` **nao tem logradouro**: o que a pagina do local
// escreve e `linhaDeLugar` -- bairro, cidade e UF. Ou seja, hoje o toque abre
// um BAIRRO no mapa, e nao uma porta.
//
// As colunas `street`, `street_number`, `postal_code` e `complement` existem
// em `professionals` desde a migracao `20261018000001`, e a prosa daquela
// migracao diz, por escrito, que **nenhuma saida ganhou campo novo** porque
// "exibir endereco completo e decisao do cliente, e ela nao foi tomada".
//
// **Isto esta medido de proposito, e nao assumido:** o terceiro grupo abaixo
// cobra que o que sai hoje seja a linha de lugar INTEIRA. No dia em que a
// decisao for tomada e o contrato ganhar o logradouro, este arquivo reprova --
// e e exatamente o que se quer, porque e o aviso de que o caso tem de passar
// a esperar a rua.
//
// O precedente do mecanismo e o ADR-0027 item 21, que pos
// `network_events.street_address` no produto como TEXTO, sem geocodificacao,
// aberto por intent no app de mapas. **E a mesma porta**: uma funcao, dois
// chamadores.

import 'package:bichu/dispositivo/saida_do_app.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'telefone_fora_da_tela_test.dart'
    show abrirOLocal, detalheComTudo, redeDoLocal, semanticaDaTela;

/// So a saida do endereco. **Nao herda de `SaidaDoAparelho`**: herdar faria um
/// metodo esquecido cair no aparelho de verdade dentro de um teste.
class SaidaQueAnota extends SaidaDoApp {
  final List<String> enderecos = <String>[];
  bool abre = true;

  @override
  Future<bool> abrirEnderecoNoAppDeMapas({required String endereco}) async {
    enderecos.add(endereco);
    return abre;
  }

  @override
  Future<bool> abrirNoAppDeMapas({
    required double lat,
    required double lon,
    required String nomeDoLugar,
  }) async =>
      false;

  @override
  Future<bool> abrirLink(Uri link) async => false;

  @override
  Future<bool> adicionarAoCalendario(EventoDeCalendario evento) async => false;

  @override
  Future<bool> compartilharTexto({
    required String texto,
    required String assunto,
  }) async =>
      false;
}

/// A linha do endereco dentro da secao `Informações`.
///
/// Procurada pelo NOME ACESSIVEL e nao pelo icone: `Icons.place_outlined`
/// aparece duas vezes na pagina -- no cabecalho tambem --, e um
/// `find.byIcon` pegaria o do cabecalho, que nao e tocavel de proposito.
///
/// Pelo `Semantics` do WIDGET, e nao por `find.bySemanticsLabel`: aquele le a
/// arvore semantica, que so existe com `ensureSemantics` ligado, e devolveria
/// `findsNothing` com a tela inteira montada -- um falso REPROVA que mandaria
/// o proximo caçar o defeito na tela certa pelo motivo errado.
Finder oSemanticoDoEndereco(String lugar) => find.byWidgetPredicate(
      (w) =>
          w is Semantics &&
          w.properties.label == PaginaDoLocal.rotuloDeAbrirNoMapa(lugar),
    );

Finder oToqueDoEndereco(String lugar) => find.descendant(
      of: oSemanticoDoEndereco(lugar),
      matching: find.byType(InkWell),
    );

void main() {
  late SaidaQueAnota saida;

  setUp(() {
    saida = SaidaQueAnota();
    SaidaDoApp.atual = saida;
  });
  tearDown(SaidaDoApp.restaurar);

  const String lugarDoCaso = 'Pinheiros · São Paulo · SP';

  group('ISCA — o endereço do local leva ao aplicativo de mapas', () {
    // DESLIGAR PARA VER REPROVAR: em `lib/telas/perto/pagina_do_local.dart`,
    // devolva a linha do endereco de `_Informacoes` a forma antiga --
    //     _LinhaComIcone(icone: Icons.place_outlined, texto: lugar),
    // -- sem `aoTocar` e sem `rotuloAcessivel`. Os dois primeiros casos
    // reprovam: nao ha alvo de toque, e nada chega a porta.
    testWidgets('ISCA — tocar no endereço manda o TEXTO dele para a porta',
        (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      final toque = oToqueDoEndereco(lugarDoCaso);
      expect(
        toque,
        findsOneWidget,
        reason: 'REPROVA: a linha do endereço não é tocável, ou é tocável em '
            'mais de um lugar da mesma rolagem. O cabeçalho escreve a mesma '
            'linha de propósito SEM toque -- dois alvos para a mesma ação é o '
            'que `local_do_encontro.dart` decidiu contra ("um botão, nunca '
            'dois").',
      );

      await tester.tap(toque);
      await tester.pumpAndSettle();

      expect(
        saida.enderecos,
        <String>[lugarDoCaso],
        reason: 'REPROVA: o que chegou à porta foi ${saida.enderecos}. '
            'A tela não geocodifica e não reescreve: o ADR-0006 proíbe '
            'endereço → coordenada, e quem resolve o texto em lugar é o '
            'aplicativo de mapas do aparelho.',
      );
    });

    testWidgets('o leitor de tela anuncia que a linha LEVA a algum lugar',
        (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      expect(
        semanticaDaTela(tester),
        contains(PaginaDoLocal.rotuloDeAbrirNoMapa(lugarDoCaso)),
        reason: 'REPROVA: a árvore semântica não diz que o endereço abre o '
            'mapa. Endereço pelado é anunciado como texto, e quem usa leitor '
            'de tela não descobre que ele é tocável -- o mesmo defeito que a '
            'BICHUS-205 consertou no botão primário.',
      );
    });

    testWidgets('a porta recusando mostra a frase, e a página fica onde estava',
        (tester) async {
      saida.abre = false;
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );

      await tester.tap(oToqueDoEndereco(lugarDoCaso));
      await tester.pumpAndSettle();

      expect(find.text(PaginaDoLocal.falhaAoAbrirOMapa), findsOneWidget);
      expect(find.byType(PaginaDoLocal), findsOneWidget);
    });
  });

  group('ISCA — sem endereço não há toque', () {
    // Os tres campos de lugar sao anulaveis no contrato, e local sem nenhum
    // deles e **publicavel**: `missing_to_publish` nao exige bairro.
    //
    // DESLIGAR PARA VER REPROVAR: em `_Informacoes`, troque o
    //     if (lugar != null) ...
    // por um `_LinhaComIcone` sempre desenhado, com `texto: lugar ?? ''`.
    // Este caso reprova: aparece um alvo de toque que abriria o mapa no nada.
    testWidgets('ISCA — local sem bairro, cidade e UF não oferece o toque',
        (tester) async {
      final semLugar = <String, dynamic>{
        ...detalheComTudo(),
        'city': null,
        'state': null,
        'neighborhood': null,
      };

      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: semLugar),
        alta: true,
      );

      // A ANCORA: a pagina esta montada. Sem ela o `findsNothing` abaixo
      // passaria por nao haver o que medir.
      expect(find.byType(PaginaDoLocal), findsOneWidget);
      expect(find.text('Atende cão e gato.'), findsOneWidget);

      expect(
        find.byWidgetPredicate(
          (w) => w is Semantics && (w.properties.label ?? '').startsWith('Abrir '),
        ),
        findsNothing,
        reason: 'REPROVA: há um toque de "Abrir ... no mapa" numa página sem '
            'endereço nenhum. Ele abriria o aplicativo de mapas com consulta '
            'vazia -- no Android, no `0,0`, que fica no Atlântico.',
      );
      expect(saida.enderecos, isEmpty);
    });
  });

  group('o que sai hoje é a linha de lugar, e ela ainda não tem rua', () {
    // ESTE CASO REPROVA NO DIA EM QUE A RUA ENTRAR, E ISSO E O VALOR DELE.
    //
    // Ele nao esta aqui para travar o produto: esta para que a decisao de
    // exibir endereco completo -- que a migracao `20261018000001` deixou
    // explicitamente em aberto -- chegue a este arquivo em vez de passar por
    // ele. Quando chegar, o esperado abaixo vira a rua e o numero, e o
    // mecanismo nao muda uma linha.
    testWidgets('o texto é bairro, cidade e UF, sem logradouro',
        (tester) async {
      await abrirOLocal(
        tester,
        rede: redeDoLocal(detalhe: detalheComTudo()),
        alta: true,
      );
      await tester.tap(oToqueDoEndereco(lugarDoCaso));
      await tester.pumpAndSettle();

      final saiu = saida.enderecos.single;
      expect(saiu, contains('Pinheiros'));
      expect(saiu, contains('São Paulo'));
      expect(
        saiu,
        isNot(contains(RegExp(r'\d'))),
        reason: 'O endereço ganhou dígitos -- provavelmente número de porta ou '
            'CEP. Se `DirectoryEntryDetail` passou a trazer logradouro, esta '
            'é a notícia: troque o esperado deste caso pela rua e pelo '
            'número, e cite a decisão do cliente na linha. O MECANISMO não '
            'muda, e é por isso que só este caso reprova.',
      );
    });
  });
}
