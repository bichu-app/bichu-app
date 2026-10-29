// O TOPO FIXO DA SECAO `Rede`: as abas e a busca param, so o conteudo rola.
//
// Pedido do cliente, 29/10/2026, verbatim: *"na pagina de rede vamos manter as
// abas eventos, comunidade, usuarios e o campo de busca fixo na pagina e deixar
// apenas o conteudo com a rolagem"*.
//
// ---------------------------------------------------------------------------
// ## O QUE CADA CASO MEDE, E POR QUE SAO TRES E NAO UM
//
// A isca central e **a posicao depois de rolar**, e nao a presenca: com o
// leiaute antigo as abas e o campo CONTINUAM montados depois do arrasto -- eles
// so sairam da area visivel. Um caso que medisse `findsOneWidget` passaria
// verde no desenho que o cliente reprovou. O que separa os dois desenhos e o
// `dy`: no antigo ele sobe com a lista, no novo ele nao se mexe.
//
// **UM CASO POR ABA, e isso nao e zelo.** "Fixo numa aba e rolando em outra" e
// o defeito que este trabalho mais convida, porque as tres abas tinham a busca
// em lugares DIFERENTES antes de 29/10: `Eventos` desenhava a linha abaixo das
// abas, `Comunidade` a desenhava dentro da `BarraDeListagem` (depois da caixa
// de localizacao) e `Usuarios` era a unica que a tinha como primeiro filho. Um
// caso so provaria uma das tres.
//
// ---------------------------------------------------------------------------
// ## COMO ESTE ARQUIVO MEDE A ROLAGEM, e o engano que ele evita
//
// `tester.drag` sobre um cartao ROLA o rolavel que o contem. Depois dele, a
// pergunta e sobre DOIS objetos: o topo (que nao pode ter andado) e o conteudo
// (que TEM de ter andado). Medir so o primeiro aprovaria uma tela em que nada
// rola -- e tela que nao rola tambem tem aba parada. Por isso todo caso daqui
// afirma o par: [_naoAndou] no topo e [_andou] no conteudo.

import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/rede/cartao_do_encontro.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import '../telas/perto_com_dados_test.dart' as perto;
import 'fixtures_da_rede.dart';

/// O `y` global do canto de cima de um widget.
double _topoDe(WidgetTester tester, Finder alvo) {
  expect(
    alvo,
    findsWidgets,
    reason: 'REPROVA: o alvo da medicao nao esta na arvore, e o caso nao tem '
        'o que medir.',
  );
  return tester.getTopLeft(alvo.first).dy;
}

/// O campo de busca, onde quer que ele esteja.
final Finder _campoDeBusca = find.descendant(
  of: find.byType(CampoDeBuscaDaListagem),
  matching: find.byType(TextField),
);

final Finder _abaDeEventos = find.widgetWithText(Tab, 'Eventos');

/// O `ListView` da CASCA: o unico com controlador (o da preservacao da
/// BICHUS-316). Os finders pulam o que esta `Offstage`, entao os ramos do
/// `IndexedStack` que nao estao na frente nao entram aqui.
final Finder _rolavelDaCasca = find.byWidgetPredicate(
  (w) => w is ListView && w.controller != null,
  description: 'o ListView da casca (com controlador)',
);

/// O topo esta FORA da area de rolagem -- a afirmacao estrutural, que vale
/// mesmo numa aba sem conteudo bastante para rolar.
///
/// **E ela que faz a aba `Usuarios` discriminar.** Essa aba abre sem lista
/// nenhuma: um caso que so medisse posicao depois de um arrasto ficaria verde
/// no leiaute antigo, porque sem conteudo nao ha arrasto que mova nada.
void _foraDaRolagem(String aba) {
  expect(
    find.descendant(of: _rolavelDaCasca, matching: find.byType(Tab)),
    findsNothing,
    reason: 'REPROVA: na aba `$aba` as abas estao DENTRO do rolavel da casca. '
        'Elas tem de morar no `cabecalhoFixo`, e la elas nao rolam por '
        'construcao -- e nao por acaso de a lista ser curta.',
  );
  expect(
    find.descendant(
      of: _rolavelDaCasca,
      matching: find.byType(CampoDeBuscaDaListagem),
    ),
    findsNothing,
    reason: 'REPROVA: na aba `$aba` o campo de busca esta DENTRO do rolavel '
        'da casca, e vai sair da tela assim que a lista crescer.',
  );
}

/// Vinte eventos: o bastante para a lista ser mais alta que a tela de teste.
List<Map<String, dynamic>> _vinteEventos() {
  return <Map<String, dynamic>>[
    for (var i = 0; i < 20; i++)
      encontroPublico(
        slug: 'encontro-$i',
        title: 'Encontro numero $i na praca',
        // **O DIA VAI COM DOIS DIGITOS**: `2026-11-1` nao e ISO-8601, o
        // modelo recusa e a agenda vira faixa de falha -- sem cartao nenhum
        // para o caso rolar.
        startsAt: '2026-11-${((i % 27) + 1).toString().padLeft(2, '0')}'
            'T12:00:00Z',
        endsAt: '2026-11-${((i % 27) + 1).toString().padLeft(2, '0')}'
            'T14:00:00Z',
      ),
  ];
}

/// Rola o conteudo para cima e devolve quanto o conteudo de fato andou.
///
/// **Ela afirma que ANDOU.** Sem isto, uma tela que deixou de rolar passaria
/// em todos os casos deste arquivo: topo parado e conteudo parado tambem
/// satisfaz "o topo nao se mexeu".
Future<void> _rolarEConferirQueAndou(
  WidgetTester tester,
  Finder conteudo,
) async {
  final antes = _topoDe(tester, conteudo);
  await tester.drag(conteudo.first, const Offset(0, -400));
  await tester.pumpAndSettle();
  final depois = _topoDe(tester, conteudo);
  expect(
    depois,
    lessThan(antes - 100),
    reason: 'REPROVA: o CONTEUDO nao rolou. O pedido do cliente tem duas '
        'metades -- o topo para e o conteudo rola --, e sem a segunda este '
        'caso aprovaria uma tela travada.',
  );
}

void main() {
  group('o topo da secao nao rola com o conteudo', () {
    testWidgets(
        'ISCA Eventos: a aba e a busca ficam NA MESMA POSICAO depois de rolar',
        (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) => json200(pagina(_vinteEventos())),
      });
      await abrirRede(tester, rede: rede, logado: false);

      final abaAntes = _topoDe(tester, _abaDeEventos);
      final buscaAntes = _topoDe(tester, _campoDeBusca);

      await _rolarEConferirQueAndou(tester, find.byType(CartaoDoEncontro));

      expect(
        _abaDeEventos,
        findsOneWidget,
        reason: 'REPROVA: a aba `Eventos` saiu da arvore ao rolar.',
      );
      expect(
        _topoDe(tester, _abaDeEventos),
        abaAntes,
        reason: 'REPROVA: as abas ANDARAM com a lista. Era exatamente isto '
            'que o cliente pediu para acabar em 29/10/2026 -- elas voltaram '
            'para dentro da area de rolagem da casca.',
      );
      expect(
        _topoDe(tester, _campoDeBusca),
        buscaAntes,
        reason: 'REPROVA: o campo de busca ANDOU com a lista. Ele tem de '
            'estar no `cabecalhoFixo` da secao, e nao entre os `filhos`.',
      );
      _foraDaRolagem('Eventos');
    });

    testWidgets(
        'ISCA Comunidade: a aba e a busca ficam NA MESMA POSICAO depois de rolar',
        (tester) async {
      await perto.abrirPerto(
        tester,
        rede: perto.redeDoDiretorio(
          perto.paginaDoContrato(
            perto.vinteECincoEntradas(),
            distanciaDisponivel: false,
          ),
        ),
      );

      final abaAntes = _topoDe(tester, _abaDeEventos);
      final buscaAntes = _topoDe(tester, _campoDeBusca);

      await _rolarEConferirQueAndou(tester, find.byType(CartaoDoDiretorio));

      expect(
        _topoDe(tester, _abaDeEventos),
        abaAntes,
        reason: 'REPROVA: na aba `Comunidade` as abas andaram com a lista. '
            '"Fixo numa aba e rolando em outra" e o defeito que estes tres '
            'casos existem para pegar.',
      );
      expect(
        _topoDe(tester, _campoDeBusca),
        buscaAntes,
        reason: 'REPROVA: na aba `Comunidade` o campo de busca andou. Ele '
            'desenhava dentro da `BarraDeListagem`, que rola -- quem tirar o '
            '`buscaAcima: true` de `lista_do_diretorio.dart` traz o defeito '
            'de volta.',
      );
      _foraDaRolagem('Comunidade');
    });

    testWidgets(
        'ISCA Usuários: a aba e a busca ficam NA MESMA POSICAO depois de rolar',
        (tester) async {
      await perto.abrirPerto(
        tester,
        rede: perto.redeDoDiretorio(
          perto.paginaDoContrato(
            perto.vinteECincoEntradas(),
            distanciaDisponivel: false,
          ),
        ),
      );
      await tester.tap(
        find.widgetWithText(Tab, AbaDaSecaoRede.usuarios.rotulo),
      );
      await tester.pumpAndSettle();

      // **A ABA ABRE SEM LISTA, E E ESSE O PONTO.** `Usuarios` nao lista
      // ninguem antes de alguem buscar, entao aqui nao ha conteudo a rolar --
      // e o que este caso mede e o outro lado da mesma moeda: o campo esta
      // montado, no topo, ANTES de existir qualquer resultado.
      expect(
        _campoDeBusca,
        findsOneWidget,
        reason: 'REPROVA: a aba `Usuários` abriu sem campo de busca. Ela e a '
            'unica aba em que o campo E o conteudo.',
      );
      expect(
        _topoDe(tester, _campoDeBusca),
        greaterThan(_topoDe(tester, _abaDeEventos)),
        reason: 'REPROVA: o campo de busca de `Usuários` nao esta abaixo das '
            'abas. A ordem do topo fixo e abas e depois busca, nas tres.',
      );
      _foraDaRolagem('Usuários');
    });

    testWidgets('a busca monta nas TRES abas, inclusive com a lista vazia',
        (tester) async {
      // O defeito que este caso pega e o da ALTURA: antes de 29/10 o campo so
      // nascia com dado (`BarraDeListagem.desenha` em `Eventos`, `pagina !=
      // null` em `Comunidade`). Num topo que nao rola isso faz o topo crescer
      // quando o dado chega e empurrar a lista no meio da leitura.
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) =>
            json200(pagina(const <Map<String, dynamic>>[])),
      });
      await abrirRede(tester, rede: rede, logado: false);

      expect(
        _campoDeBusca,
        findsOneWidget,
        reason: 'REPROVA: `Eventos` sem evento nenhum abriu sem campo de '
            'busca. Ver `BuscaNoTopoFixo`: ele monta SEMPRE desde 29/10/2026, '
            'e a inversao da regra antiga e decisao do cliente.',
      );
      expect(
        find.widgetWithText(Tab, 'Eventos'),
        findsOneWidget,
        reason: 'REPROVA: as abas sumiram com a lista vazia.',
      );
      expect(
        find.widgetWithText(Tab, AbaDaSecaoRede.comunidade.rotulo),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(Tab, AbaDaSecaoRede.usuarios.rotulo),
        findsOneWidget,
      );
    });
  });

  group('as outras QUATRO secoes nao tem topo fixo', () {
    // **ESTE GRUPO E A PROVA DA CONDICAO DE NAO-REGRESSAO.** `cabecalhoFixo`
    // nulo tem de produzir a arvore de antes, widget por widget: sem `Column`,
    // sem `Expanded`, sem `SizedBox` entre a area segura da casca e o rolavel
    // dela. `Mural`, `Pets`, `Loja` e `Perfil` tem outra frente trabalhando
    // nelas, e uma troca de container aqui apareceria como defeito DELAS.
    //
    // **Medido pela ARVORE, e num TRECHO DELIMITADO.** A primeira versao deste
    // caso procurou `Expanded` em TODOS os ancestrais do rolavel e reprovou no
    // `Mural` -- que ja tinha um `Expanded` proprio, bem acima, que nada tem a
    // ver com esta edicao. O que importa e so o trecho entre o `SafeArea` da
    // casca e o `ListView` dela, que e exatamente onde `_comCabecalho` entra.

    /// Os tipos de widget ENTRE [de] e o primeiro ancestral do tipo [ate].
    List<Type> entre(Finder de, Type ate) {
      final tipos = <Type>[];
      de.evaluate().first.visitAncestorElements((e) {
        if (e.widget.runtimeType == ate) return false;
        tipos.add(e.widget.runtimeType);
        return true;
      });
      return tipos;
    }

    Future<void> irPara(WidgetTester tester, String secao) async {
      await tester.tap(find.widgetWithText(NavigationDestination, secao));
      await tester.pumpAndSettle();
    }

    testWidgets('Mural, Pets e Loja: nada entre a area segura e o rolavel',
        (tester) async {
      await perto.abrirPerto(
        tester,
        rede: perto.redeDoDiretorio(
          perto.paginaDoContrato(
            perto.vinteECincoEntradas(),
            distanciaDisponivel: false,
          ),
        ),
      );

      for (final secao in <String>['Mural', 'Pets', 'Loja']) {
        await irPara(tester, secao);
        expect(
          _rolavelDaCasca,
          findsWidgets,
          reason: 'REPROVA: a secao `$secao` ficou sem o `ListView` com '
              'controlador. A casca parou de entregar o controlador de '
              'rolagem, e a preservacao da BICHUS-316 morre com ele.',
        );
        expect(
          entre(_rolavelDaCasca, SafeArea),
          isNot(contains(Expanded)),
          reason: 'REPROVA: a secao `$secao` ganhou um `Expanded` entre a '
              'area segura e o rolavel, e ela nao passa `cabecalhoFixo`. O '
              'ramo nulo de `_comCabecalho` parou de devolver o rolavel '
              'intacto, e as quatro secoes sem topo fixo mudaram de leiaute '
              'por tabela.',
        );
      }
    });

    testWidgets('a `Rede`, que TEM topo fixo, e o contraste do caso acima',
        (tester) async {
      // Sem este caso o de cima ficaria verde com o topo fixo arrancado: "nao
      // ha `Expanded` em lugar nenhum" e o estado de antes do trabalho.
      await perto.abrirPerto(
        tester,
        rede: perto.redeDoDiretorio(
          perto.paginaDoContrato(
            perto.vinteECincoEntradas(),
            distanciaDisponivel: false,
          ),
        ),
      );
      expect(
        entre(_rolavelDaCasca, SafeArea),
        contains(Expanded),
        reason: 'REPROVA: a `Rede` deixou de ter topo fixo -- o rolavel dela '
            'voltou a ser filho direto da area segura, e as abas e a busca '
            'voltaram a rolar com a lista.',
      );
    });
  });
}
