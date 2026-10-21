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
import 'package:bichu/dispositivo/textos_do_app_de_mapas.dart';
import 'package:bichu/telas/perto/pagina_do_local.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../dispositivo/literais_de_abrir_mapa.dart';

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
          w.properties.label == '${TextosDoAppDeMapas.rotuloDoEndereco}: $lugar',
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
        contains('${TextosDoAppDeMapas.rotuloDoEndereco}: $lugarDoCaso'),
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

      expect(find.text(TextosDoAppDeMapas.falhaAoAbrir), findsOneWidget);
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

  // -------------------------------------------------------------------------
  // PORTAO — a fonte e UMA, e nenhuma tela escreve o texto a mao
  // -------------------------------------------------------------------------
  //
  // O QUE ELE SUBSTITUI. Ate a onda 4 este arquivo tinha um grupo chamado
  // *"ISCA — a redacao e a do encontro"*, com dois casos comparando
  // `PaginaDoLocal.rotuloDoMapa` com `LocalDoEncontro.rotuloDoMapa` e
  // `PaginaDoLocal.falhaAoAbrirMapa` com `LocalDoEncontro.falhaAoAbrir`. Aquele
  // grupo media COPIA, porque era copia o que havia: a prosa dele dizia, por
  // escrito, que fonte unica era trabalho de frente e que mescla nao era o
  // lugar. Agora as quatro constantes nao existem mais -- as tres superficies
  // leem `TextosDoAppDeMapas` --, e comparar a fonte com ela mesma seria um
  // caso que nao pode reprovar.
  //
  // O QUE ELE MEDE NO LUGAR. Duas metades que apontam para lados opostos:
  //
  //   1. NEGATIVA: nenhum `.dart` de `app/lib`, fora da fonte, escreve um
  //      literal de abrir mapa. Isto e o que a quarta redacao precisaria fazer
  //      para nascer, e e a varredura que a onda 4 nao tinha.
  //   2. POSITIVA: as tres superficies IMPORTAM a fonte e LEEM a constante.
  //      Sem esta metade, apagar os tres toques da tela deixaria a varredura
  //      verde -- o portao diria "ninguem escreve o texto a mao" sobre um app
  //      que nao abre mapa nenhum.
  //
  // A varredura mora em `test/dispositivo/literais_de_abrir_mapa.dart`, ao lado
  // do espelho da fonte, e nao aqui: a quarta superficie que aparecer a chama
  // sem copiar, que e a licao de 21/10 aplicada ao proprio portao. Mesma forma
  // de `test/widgets/palavras_proibidas_no_rotulo.dart`.
  group('PORTÃO — uma fonte para o texto do app de mapas', () {
    test('nenhum arquivo de `app/lib` escreve um literal de abrir mapa à mão',
        () {
      conferirQueNinguemEscreveAbrirMapaAMao();
    });

    test('CONTRAPESO — a FONTE contém os três textos, e a varredura os vê', () {
      // Sem este caso, a varredura poderia estar lendo arquivo vazio, ou as
      // agulhas poderiam nao casar com nada: as duas formas de ficar verde sem
      // conferir. Aqui ela e apontada para o unico arquivo que DEVE reprovar,
      // e exige reprova.
      final String fonte = lerDoPacoteDoApp(caminhoDaFonteDeAbrirMapa);
      final List<String> achados = literaisDeAbrirMapaEm(fonte);
      for (final String texto in textosDaFonteDeAbrirMapa) {
        expect(
          achados,
          contains(texto),
          reason: 'a varredura NAO viu "$texto" dentro da própria fonte '
              '($caminhoDaFonteDeAbrirMapa). A agulha está morta: ela nunca '
              'reprovaria nada, e o portão está verde por não conferir.',
        );
      }
      // `mencoesProibidasAoAppDeMapas` NAO entra nesta conferencia, e a
      // primeira versao deste caso a exigia aqui -- e reprovou com razao.
      // "aplicativo de mapas" so aparece na PROSA da fonte (o cabecalho conta
      // a historia das redacoes recusadas), e a varredura apaga prosa de
      // proposito. Exigir que a fonte contenha em CODIGO uma redacao que ela
      // existe para proibir era exigir o contrario do desenho. A liveness
      // daquelas agulhas e provada pela isca de literal plantado, abaixo, que
      // e onde ela pode ser provada sem contradicao.
      expect(
        achados,
        contains('app de mapas'),
        reason: 'nem a menção larga "app de mapas" casou com a fonte, que a '
            'contém duas vezes em código: a varredura está cega.',
      );
    });

    test('as TRÊS superfícies importam a fonte e leem a constante', () {
      // A conferencia e sobre a FONTE e nao sobre a arvore montada, e e de
      // proposito: a pagina do local tem dois toques (lugar e logradouro) em
      // ramos que nao aparecem na mesma montagem, e um caso de widget mediria
      // um deles.
      for (final (String caminho, List<String> esperados) in <
          (String, List<String>)>[
        (
          'lib/telas/rede/local_do_encontro.dart',
          <String>[
            'TextosDoAppDeMapas.rotuloDoEndereco',
            'TextosDoAppDeMapas.rotuloDoPonto',
            'TextosDoAppDeMapas.falhaAoAbrir',
          ],
        ),
        (
          'lib/telas/perto/pagina_do_local.dart',
          <String>[
            'TextosDoAppDeMapas.rotuloDoEndereco',
            'TextosDoAppDeMapas.falhaAoAbrir',
          ],
        ),
      ]) {
        final String codigo = semProsaDeDart(lerDoPacoteDoApp(caminho));
        expect(
          codigo.contains('dispositivo/textos_do_app_de_mapas.dart'),
          isTrue,
          reason: '$caminho deixou de IMPORTAR a fonte do texto do app de '
              'mapas. Se o toque que abre o mapa saiu da tela, este caso é o '
              'lugar de dizer por quê; se ele ficou e o texto virou literal, o '
              'caso acima reprova também.',
        );
        for (final String esperado in esperados) {
          expect(
            codigo.contains(esperado),
            isTrue,
            reason: '$caminho não lê mais `$esperado`. A varredura de literais '
                'fica VERDE numa tela que não abre mapa nenhum, e é esta '
                'metade que impede o portão de medir o vazio.',
          );
        }
      }
    });

    test('ISCA DA ISCA: a varredura ENXERGA cada redação recusada da onda 4',
        () {
      // Sem este caso, as agulhas das redacoes recusadas seriam promessa:
      // nenhuma delas casa com `app/lib` hoje (e bom que nao case), entao a
      // metade negativa do portao nunca as exercita. Aqui cada uma e plantada
      // em codigo de verdade e a varredura tem de ve-la.
      for (final (String rotulo, String amostra) in <(String, String)>[
        (
          'a frase que atribui causa',
          "const String f = 'Não encontramos um app de mapas neste aparelho.';",
        ),
        (
          '"aplicativo" no lugar de "app"',
          "const String f = 'Não conseguimos abrir o aplicativo de mapas.';",
        ),
        (
          'o rótulo interpolado com o nome do lugar',
          "final String r = 'Abrir \$lugar no mapa';",
        ),
        (
          'o rótulo interpolado com chaves',
          "final String r = 'Abrir \${widget.lugar} no mapa';",
        ),
        (
          'o rótulo do ponto, copiado',
          "const String r = 'Abrir no app de mapas';",
        ),
        ('o rótulo do endereço, copiado', "const String r = 'Abrir no mapa';"),
      ]) {
        expect(
          literaisDeAbrirMapaEm(amostra),
          isNotEmpty,
          reason: 'a varredura NÃO viu $rotulo em código: `$amostra`. '
              'Esta é exatamente a edição que o portão existe para reprovar.',
        );
      }
    });

    test('ISCA DA ISCA: `semProsaDeDart` apaga o comentário e PRESERVA o código',
        () {
      // Sem este caso, um apagador de prosa quebrado (que apagasse a linha
      // inteira, por exemplo) faria a metade negativa passar no vazio -- e um
      // que nao apagasse nada reprovaria o arquivo que DOCUMENTA a regra.
      const String amostra = '''
const String r = 'Abrir no mapa';
// este comentario fala de 'Abrir no app de mapas' e de aplicativo de mapas
/// [ Abrir no app de mapas  ↗ ]
final String url = 'http://exemplo/nao-e-comentario';
''';
      final String limpo = semProsaDeDart(amostra);
      // O CODIGO fica.
      expect(limpo, contains("const String r = 'Abrir no mapa';"));
      // As duas linhas de PROSA somem, com tudo que elas citavam.
      expect('\n$limpo'.contains('\n// este comentario'), isFalse);
      expect(limpo.contains('aplicativo de mapas'), isFalse);
      expect(limpo.contains('↗'), isFalse);
      // E `//` dentro de cadeia NAO e tratado como comentario.
      expect(limpo, contains("'http://exemplo/nao-e-comentario'"));
      // E a varredura, sobre o limpo, ve so o literal de CODIGO.
      expect(
        literaisDeAbrirMapaEm(amostra),
        <String>[TextosDoAppDeMapas.rotuloDoEndereco],
      );
    });
  });
}
