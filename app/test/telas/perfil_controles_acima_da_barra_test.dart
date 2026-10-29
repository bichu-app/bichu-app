// ISCA — O ULTIMO CONTROLE TOCAVEL DESTAS TELAS CABE ACIMA DA BARRA DO SISTEMA.
//
// ===========================================================================
// 1. A CLASSE DE DEFEITO, E DE ONDE ELA VEIO
// ===========================================================================
//
// Em 22/10/2026 `achado/tela_do_achado.dart` foi consertada: ela usava
// `body: SafeArea(top: false, bottom: false, ...)` **sem** ter
// `Scaffold.bottomNavigationBar`. O `Scaffold` encolhe o `body` pelo que a
// barra de baixo ocupa, e e dentro de `BarraDeAcaoFixa` -- que mora nesse
// slot -- que a `SafeArea` inferior e aplicada. Sem barra nenhuma no slot, o
// `bottom: false` **copiado das telas que TEM barra** joga fora o unico recuo
// que existia, e o `ListView` passa a ter viewport ate o chao fisico da tela.
//
// O padrao (`bottom: false` e nenhum `bottomNavigationBar` no arquivo) foi
// varrido em `app/lib/telas` sobre `origin/development`. Ele casa em quatro
// arquivos, e **um padrao casado nao e um defeito**: ele so morde quando o
// conteudo chega ao chao da tela E ha um controle tocavel la embaixo. Tela
// curta, ou tela cujo ultimo elemento e texto, nao perde nada.
//
// Este arquivo e a medicao dos candidatos, e ele guarda os que PASSAM junto
// com o que reprovava -- porque e a passagem deles que prova que a medicao
// mede a tela, e nao o padrao.
//
// ===========================================================================
// 2. A TABELA, MEDIDA EM 390 x 844 dp COM 48 dp DE BARRA DO SISTEMA
// ===========================================================================
//
// `devicePixelRatio` 1, `padding` e `viewPadding` com
// `FakeViewPadding(bottom: 48)`, rolado ate `maxScrollExtent`. Chao visivel:
// 844 - 48 = 796 dp.
//
//   tela / estado                        ultimo controle    retangulo    sobra
//   ---------------------------------------------------------------------------
//   meus_achados, 20 itens + cursor      `Carregar mais`    780..828 dp   -32
//   meus_achados, falha ao carregar      `Tentar de novo`   780..828 dp   -32
//   meus_achados, fim da lista           cartao (InkWell)   614..794 dp    +2
//   meus_achados, deslogado              `Criar conta`      425..473 dp  +323
//   meus_eventos, 8 encontros            `Cancelar o ...`   729..777 dp   +19
//   meus_eventos, deslogado              `Criar conta`      405..453 dp  +343
//   antessala_de_aviso (folha)           `Agora não`        724..772 dp   +24
//   antessala_de_localizacao (folha)     `Prefiro digitar`  724..772 dp   +24
//   aviso_de_versao_nova (faixa)         `Agora nao`         44..92  dp  +704
//
// **So `meus_achados` reprovava**, e so nos dois estados em que a lista
// termina num botao: 32 dos 48 dp de altura do botao caiam na faixa 796..844,
// que pertence a barra de navegacao do sistema. O conserto foi tirar
// `bottom: false` da `SafeArea` do `body` DAQUELA TELA -- nada no widget
// compartilhado.
//
// Tres observacoes que a tabela esconde e que decidem o escopo:
//
//   - **o estado `fim da lista` escapava por 2 dp, e por acidente.** O que o
//     salvava era a altura da linha de `fimDaLista` logo abaixo do ultimo
//     cartao. Isso nao e margem, e sorte -- e e mais um motivo para o
//     conserto ser na `SafeArea` e nao em espacamento;
//   - **`meus_eventos` CONTINUA com `bottom: false`, de proposito.** Ela tem
//     o mesmo padrao e nao esconde controle nenhum: depois do ultimo
//     `Cancelar o encontro` vem o espacador, a linha de `fimDaLista` e o
//     recuo do `ListView`, e os 19 dp de sobra saem dai. Consertar tela que
//     passa seria mexer no que nao foi medido quebrado;
//   - **as duas antessalas nunca tiveram o padrao.** `bottom: false` aparece
//     nelas so DENTRO DE COMENTARIO -- a prosa que explica o que
//     `showModalBottomSheet(useSafeArea: true)` faz. O codigo das duas e
//     `SafeArea(top: false)`, com o inferior LIGADO, e ligado de proposito
//     desde 22/09/2026 pelo achado em aparelho que a propria prosa registra.
//     Uma varredura por texto casa o comentario; e por isso que as duas estao
//     medidas aqui, e nao descartadas por leitura.
//
// E `aviso_de_versao_nova.dart` casa o padrao e **nao e uma tela**: e a faixa
// de versao nova, montada por `PortaoDeVersao` como primeiro filho de uma
// `Column` com `Expanded(child: app)` embaixo. Ela mora no TOPO. `bottom:
// false` ali esta correto, e liga-lo poria 48 dp de recuo morto debaixo de
// uma faixa que nunca encosta no chao.
//
// ---------------------------------------------------------------------------
// 3. POR QUE A AFIRMACAO E O RETANGULO, E NAO O TOQUE
// ---------------------------------------------------------------------------
//
// **Porque o toque passa verde com o botao coberto.** O ajudante
// `tocarSemRolar` usa `warnIfMissed: false`, e `tester.tap` com esse
// sinalizador nao reprova quando o alvo nao recebe o toque. Pior: em teste de
// widget **nao existe barra do sistema roubando o evento**, entao mesmo um
// `tap` estrito acertaria um botao desenhado em 780..828 dp. Um caso de toque
// nao consegue, por construcao, enxergar este defeito.
//
// E a janela e de celular de verdade (390 x 844) e nao tela alta de teste: os
// outros arquivos montam 1080 x 4000 para a arvore inteira caber, e numa tela
// de 4000 dp de altura NENHUM botao fica atras de barra nenhuma.
//
// ---------------------------------------------------------------------------
// DESLIGAR PARA VER REPROVAR -- com o nome do caso
// ---------------------------------------------------------------------------
//
//  1. Em `lib/telas/perfil/meus_achados.dart`, volte a `SafeArea` do `body`
//     para `bottom: false`.
//     -> reprovam `meus_achados: o retangulo de "Carregar mais" cabe acima da
//        barra do sistema` e `meus_achados: o retangulo de "Tentar de novo"
//        cabe acima da barra do sistema`, os dois com
//        `Rect.fromLTRB(16.0, 780.0, 374.0, 828.0)` contra chao em 796.
//        **`meus_eventos` CONTINUA verde**, e e isso que mostra que a
//        reprovacao e da tela e nao da medicao nem do padrao.
//        **E `meus_achados: o cartao do fim da lista` tambem continua verde**,
//        medido: aquele estado escapa por 2 dp com o defeito LIGADO. Ele e
//        monitor de regressao e nao guarda deste conserto, e dizer isso aqui
//        e o que impede alguem de ler o verde dele como prova de que a tela
//        esta certa.
//  2. Em `lib/telas/perfil/meus_eventos.dart`, TROQUE `bottom: false` por
//     `bottom: true` (ou apague a linha).
//     -> reprova `meus_eventos: o botao de cancelar NAO precisou de conserto`,
//        que afirma o `bottom: false` que ficou. Ele existe para o dia em que
//        alguem passar consertando as duas por simetria: a segunda nao foi
//        medida quebrada, e um conserto nao medido e mudanca sem motivo.
//  3. Em `lib/telas/avisos/antessala_de_aviso.dart` ou em
//     `lib/telas/localizacao/antessala_de_localizacao.dart`, acrescente
//     `bottom: false` a `SafeArea`.
//     -> reprova a folha correspondente com o botao em 772..820 contra chao em
//        796: o achado de 22/09 volta a doer, e e o que `SafeArea(top: false)`
//        existe para impedir.
//  4. Em `lib/telas/atualizacao/aviso_de_versao_nova.dart`, tire
//     `bottom: false`.
//     -> reprova `a faixa de versao nova nao gasta recuo de barra nenhum`, que
//        mede o ALTO da faixa: com o recuo inferior ligado ela cresce 48 dp
//        sem motivo, porque nada nela encosta no chao.
//
// ---------------------------------------------------------------------------
// O CONTROLE POSITIVO DA ROLAGEM, e por que ele nao e zelo
// ---------------------------------------------------------------------------
//
// Um `getRect` sobre uma lista que NAO rolou mede a primeira dobra, onde nada
// fica atras de barra -- e passaria verde com o defeito vivo. `_ateOFim`
// arrasta EM PASSOS, e `_exigirQueChegouAoFim` cobra depois que
// `pixels == maxScrollExtent` e que `maxScrollExtent > 0`.
//
// **Um `drag` unico grande nao basta, e isso foi medido** no arquivo irmao de
// 22/10: `maxScrollExtent` de um `ListView` preguicoso e uma ESTIMATIVA que
// cresce a cada filho novo construido. Um unico arrasto de -4000 dp parou em
// 1074,6 de 1179, e o botao -- que e o ultimo filho -- ainda nao estava na
// arvore. Arrastar em passos ate a posicao nao andar mais e o que chega ao fim
// de verdade.

import 'dart:async';
import 'dart:io';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/versao_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/atualizacao/aviso_de_versao_nova.dart';
import 'package:bichu/telas/atualizacao/portao_de_versao.dart';
import 'package:bichu/telas/atualizacao/textos_da_atualizacao.dart';
import 'package:bichu/telas/avisos/antessala_de_aviso.dart';
import 'package:bichu/telas/localizacao/antessala_de_localizacao.dart';
import 'package:bichu/telas/localizacao/textos_da_localizacao.dart';
import 'package:bichu/telas/perfil/meus_achados.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/convite_para_entrar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';

// ---------------------------------------------------------------------------
// A JANELA DE CELULAR DE VERDADE
// ---------------------------------------------------------------------------

/// Um iPhone 14 em dp. **Nao e tela alta de teste**: o defeito desta isca so
/// existe quando o conteudo chega ao chao da tela.
const double _largura = 390;
const double _altura = 844;

/// A barra de navegacao do sistema, em dp.
///
/// 48 dp e a barra de tres botoes do Android. O numero exato nao e o assunto
/// -- qualquer recuo inferior maior que zero expoe o defeito --, mas um numero
/// de aparelho real deixa a medicao comparavel com a tabela do cabecalho.
const double _barraDoSistema = 48;

/// O chao que a pessoa consegue tocar: o resto pertence ao sistema.
const double _chaoVisivel = _altura - _barraDoSistema;

void _celularComBarraDoSistema(WidgetTester tester) {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = const Size(_largura, _altura);
  // `padding` e o que `MediaQuery` entrega a `SafeArea`; `viewPadding` e o que
  // sobrevive ao teclado. Os dois, porque e exatamente a diferenca entre eles
  // que ja enganou isca neste repositorio.
  tester.view.padding = const FakeViewPadding(bottom: _barraDoSistema);
  tester.view.viewPadding = const FakeViewPadding(bottom: _barraDoSistema);
  addTearDown(tester.view.reset);
}

// ---------------------------------------------------------------------------
// A ROLAGEM, com o controle positivo dela
// ---------------------------------------------------------------------------

/// Rola ate o verdadeiro fim da lista, em passos. Ver a prosa do cabecalho.
Future<void> _ateOFim(WidgetTester tester) async {
  final estado = tester.state<ScrollableState>(find.byType(Scrollable).first);
  for (var i = 0; i < 60; i++) {
    final antes = estado.position.pixels;
    // **ARRASTA PELO `Scrollable`, E NAO PELA `ListView`** (28/10/2026).
    //
    // Era `find.byType(ListView).first`, e isso estourou `Bad state: No
    // element` no dia em que `Meus achados` virou `CustomScrollView` -- a
    // tela ganhou um `SliverPersistentHeader(pinned: true)` com o botao de
    // registrar achado avulso, que e a unica forma em que a lista passa por
    // DEBAIXO do controle.
    //
    // O ajudante nao tem por que saber qual sliver a tela usa: ele mede
    // ROLAGEM, e `Scrollable` e o tipo que as duas formas tem em comum. E e
    // o MESMO `first` de onde `estado` sai, duas linhas acima -- antes eram
    // dois seletores diferentes para o mesmo objeto, e um deles podia deixar
    // de casar sem o outro acusar.
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -400));
    await tester.pumpAndSettle();
    if (estado.position.pixels <= antes + 0.01) break;
  }
}

/// **O CONTROLE POSITIVO DA MEDICAO.** Sem ele, uma lista que nao rolou
/// mediria a primeira dobra -- onde nada fica atras de barra -- e o caso
/// passaria verde com o defeito vivo.
void _exigirQueChegouAoFim(WidgetTester tester, String tela) {
  final p = tester.state<ScrollableState>(find.byType(Scrollable).first).position;
  expect(
    p.maxScrollExtent > 0,
    isTrue,
    reason:
        'REPROVA O PROPRIO CONTROLE ($tela): esta lista nao rola -- '
        '`maxScrollExtent` e ${p.maxScrollExtent}. O defeito desta isca so '
        'existe quando o conteudo CHEGA ao chao da tela, entao uma lista que '
        'cabe inteira na dobra nao mede nada, e a geometria abaixo nao vale. '
        'Ou a massa de teste encolheu, ou a tela nao carregou.',
  );
  expect(
    p.pixels,
    closeTo(p.maxScrollExtent, 0.5),
    reason:
        'REPROVA O PROPRIO CONTROLE ($tela): a rolagem parou em ${p.pixels} '
        'de ${p.maxScrollExtent}. `maxScrollExtent` de `ListView` preguicoso e '
        'estimativa que cresce a cada filho novo, e medir o retangulo no meio '
        'da lista nao mede o ultimo controle.',
  );
}

// ---------------------------------------------------------------------------
// A AFIRMACAO: retangulo, e nao toque
// ---------------------------------------------------------------------------

void _exigirControleDentroDaAreaVisivel(
  WidgetTester tester,
  Finder controle, {
  required String tela,
  required String oQue,
}) {
  // A ANCORA, antes da geometria: "fora da tela" e "nao existe" sao defeitos
  // diferentes, e um `getRect` sobre nada estoura com uma mensagem que nao
  // diz qual dos dois aconteceu.
  expect(
    controle,
    findsOneWidget,
    reason:
        'REPROVA (ancora, $tela): o controle $oQue nao esta na arvore depois '
        'de rolar ate o fim. Isto NAO e o defeito desta isca -- e a acao '
        'simplesmente desaparecida, que e pior.',
  );

  final r = tester.getRect(controle);
  expect(
    r.bottom <= _chaoVisivel,
    isTrue,
    reason:
        'REPROVA ($tela): o controle $oQue esta em $r e o chao que a pessoa '
        'consegue tocar e $_chaoVisivel dp -- a faixa '
        '$_chaoVisivel..$_altura pertence a barra de navegacao do sistema. '
        'Passa do chao em ${(r.bottom - _chaoVisivel).toStringAsFixed(1)} dp, '
        'de ${r.height.toStringAsFixed(1)} dp de altura do controle. E a '
        'mesma queixa do cliente de 22/10/2026 sobre outra tela: "fica '
        'quebrado atras do menu nativo do celular e nao da para clicar". '
        'A causa e `SafeArea(bottom: false)` num `Scaffold` SEM '
        '`bottomNavigationBar` -- `BarraDeAcaoFixa`, que e quem aplica o recuo '
        'inferior, nao esta no slot para aplica-lo. '
        'ATENCAO A QUEM VIER CONSERTAR: um caso de TOQUE nao enxerga isto -- '
        'em teste de widget nao existe barra do sistema para roubar o evento, '
        'e `tocarSemRolar` ainda usa `warnIfMissed: false`. A afirmacao tem de '
        'ser o retangulo.',
  );
  expect(
    r.top >= 0,
    isTrue,
    reason:
        'REPROVA ($tela): o controle $oQue esta em $r, acima do topo da '
        'janela. A lista rolou demais e a medicao nao vale.',
  );
}

/// O controle tocavel mais baixo DENTRO do `ListView` da tela.
///
/// Dentro do corpo rolante, e nao `find.byType(InkWell).last`: a barra de topo e
/// a de abas trazem `InkWell` proprios, e a ordem da arvore nao e a ordem
/// visual -- a primeira escrita deste arquivo mediu o `InkWell` da barra, que
/// fica em 0..64 dp e passa sempre.
Finder _controleMaisBaixoDaLista(WidgetTester tester) {
  Element? pior;
  var maisBaixo = double.negativeInfinity;
  // **DENTRO DO `Scrollable`, E NAO DO `ListView`** (28/10/2026).
  //
  // A razao de recortar pelo corpo rolante nao mudou uma letra -- a barra de
  // topo e a de abas trazem `InkWell` proprios, e medir o da barra passa
  // sempre. O que mudou e que `Meus achados` virou `CustomScrollView`, com o
  // botao fixo de registrar achado avulso num
  // `SliverPersistentHeader(pinned: true)`, e `find.byType(ListView)` passou a
  // achar ZERO -- o controle positivo logo abaixo acusou isso, que e
  // exatamente o trabalho dele.
  //
  // `Scrollable` e o tipo que as duas formas tem em comum, e e tambem o que
  // `_ateOFim` e `_exigirQueChegouAoFim` ja usavam: os tres ajudantes deste
  // arquivo passam a falar do MESMO objeto.
  //
  // **O cabecalho FIXO nao envenena a medicao**, e isso importa: ele e
  // descendente do `Scrollable`, entao o seu `InkWell` entra na varredura --
  // mas ele vive no TOPO do corpo (0..72 dp), e esta funcao procura o
  // `bottom` MAIOR. Um controle fixo no topo nunca e o mais baixo.
  final dentro = find.descendant(
    of: find.byType(Scrollable),
    matching: find.byType(InkWell),
  );
  for (final e in dentro.evaluate()) {
    final r = tester.getRect(find.byElementPredicate((x) => x == e));
    if (r.height <= 0 || r.width <= 0) continue;
    if (r.bottom > maisBaixo) {
      maisBaixo = r.bottom;
      pior = e;
    }
  }
  final alvo = pior;
  expect(
    alvo,
    isNotNull,
    reason:
        'REPROVA O PROPRIO CONTROLE: nenhum controle tocavel dentro do '
        'corpo rolante. Com a arvore vazia a geometria nao mede nada -- e '
        'arvore vazia e o estado normal de uma lista preguicosa cujo trecho '
        'medido nao foi construido.',
  );
  return find.byElementPredicate((x) => x == alvo);
}

// ---------------------------------------------------------------------------
// A MASSA
// ---------------------------------------------------------------------------

/// Vinte achados, que e o teto de `limit` do contrato.
///
/// **Vinte, e nao tres.** O defeito so existe com a lista chegando ao chao: com
/// tres cartoes nada rola, e o controle positivo da rolagem reprova dizendo
/// isso em vez de a geometria passar verde por engano.
Map<String, dynamic> _achado(int i) => <String, dynamic>{
      'id': '01a14d3f-d95f-70b1-b31e-1614167800${i.toString().padLeft(2, '0')}',
      'origin': 'stray_report',
      'status': 'open',
      'area_label': 'Vila Gertrudes $i, São Paulo',
      'found_at': '2026-10-16T10:00:00.000Z',
      'created_at': '2026-10-16T10:00:00.000Z',
      'photo_url': null,
      'notes': null,
      'conversation_id': null,
    };

Map<String, dynamic> _encontro(int i) {
  // Datas relativas ao relogio do caso, e nao fixas: encontro com data fixa
  // vira passado sozinho, e o `Cancelar` desapareceria da tela por causa do
  // calendario e nao por causa do codigo.
  final comeca = DateTime.now().toUtc().add(Duration(days: 3 + i));
  return <String, dynamic>{
    'slug': 'encontro-$i',
    'title': 'Encontro número $i na praça',
    'cover': <String, dynamic>{
      'status': 'ready',
      'url': null,
      'rejection_reason': null,
    },
    'starts_at': comeca.toIso8601String(),
    'ends_at': comeca.add(const Duration(hours: 2)).toIso8601String(),
    'time_zone': 'America/Sao_Paulo',
    'status': 'upcoming',
  };
}

/// A rede das duas telas. **404 em qualquer outra rota**, e nao 200 vazio: um
/// caso que dependa de chamada nao declarada aqui precisa falhar alto.
Future<http.Response> Function(http.Request) _rede({
  int achados = 0,
  String? cursor,
  int encontros = 0,
  bool segundaListagemFalha = false,
}) {
  var listagens = 0;
  return (req) async {
    final p = req.url.path;
    if (p == '/v1/pets') return json200(<String, dynamic>{'items': <dynamic>[]});
    if (p.endsWith('/reference-data')) return json200(referenciaDeTeste());
    if (p == '/v1/found-reports' && req.method == 'GET') {
      listagens++;
      // A SEGUNDA chamada e a do `Carregar mais`. Fazer ela estourar e o unico
      // jeito de a tela entrar em `_falhaAoCarregarMais`, que e o estado em
      // que o ultimo filho e o botao `Tentar de novo`.
      if (segundaListagemFalha && listagens > 1) {
        return problema('server-error', 500);
      }
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          for (var i = 1; i <= achados; i++) _achado(i),
        ],
        'next_cursor': cursor,
      });
    }
    if (p == '/v1/network/my-events' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'items': <Map<String, dynamic>>[
          for (var i = 1; i <= encontros; i++) _encontro(i),
        ],
        'page': 1,
        'limit': 20,
        'total': encontros,
      });
    }
    return problema('not-found', 404);
  };
}

/// O transporte que faz `PortaoDeVersao` montar a FAIXA, e nao o bloqueio.
class _Recomenda extends http.BaseClient {
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    const corpo = '{"verdict":"update_recommended","store_url":null}';
    return http.StreamedResponse(
      Stream<List<int>>.value(corpo.codeUnits),
      200,
      headers: <String, String>{'content-type': 'application/json'},
      contentLength: corpo.length,
    );
  }
}

void main() {
  // =========================================================================
  // 1. `Meus achados` -- A TELA QUE REPROVAVA
  // =========================================================================

  group('ISCA — `Meus achados`: o pe da lista cabe acima da barra', () {
    testWidgets(
      'meus_achados: o retangulo de "Carregar mais" cabe acima da barra do '
      'sistema',
      (tester) async {
        _celularComBarraDoSistema(tester);
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          // COM cursor: e o unico estado em que o ultimo filho da lista e um
          // BOTAO. Sem cursor o pe e a linha de `fimDaLista`, que e texto, e
          // texto atras da barra nao e o defeito desta isca.
          rede: _rede(achados: 20, cursor: 'cursor-opaco-2'),
        );
        await irPara(tester, Rotas.meusAchados);
        await _ateOFim(tester);
        _exigirQueChegouAoFim(tester, Rotas.meusAchados);
        _exigirControleDentroDaAreaVisivel(
          tester,
          find.widgetWithText(OutlinedButton, MeusAchados.rotuloDeCarregarMais),
          tela: Rotas.meusAchados,
          oQue: '"${MeusAchados.rotuloDeCarregarMais}"',
        );
      },
    );

    testWidgets(
      'meus_achados: o retangulo de "Tentar de novo" cabe acima da barra do '
      'sistema',
      (tester) async {
        // O SEGUNDO ESTADO DA MESMA TELA, e ele nao e zelo: `Carregar mais`
        // troca de rotulo quando a pagina seguinte estoura, e o botao fica no
        // mesmo lugar com um `Text` a mais ACIMA dele. Medido: 780..828 dp,
        // identico. Um conserto que so olhasse o rotulo feliz deixaria metade
        // do caminho quebrada -- e e justamente o estado de erro, em que a
        // pessoa mais precisa alcancar o botao.
        _celularComBarraDoSistema(tester);
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: _rede(
            achados: 20,
            cursor: 'cursor-opaco-2',
            segundaListagemFalha: true,
          ),
        );
        await irPara(tester, Rotas.meusAchados);
        await _ateOFim(tester);
        // `warnIfMissed: false` de proposito AQUI, e so aqui: este toque
        // existe para MUDAR O ESTADO da tela, e no estado anterior ao
        // conserto o botao estava coberto. Ele nao e a afirmacao do caso --
        // a afirmacao e o retangulo, medido depois.
        await tester.tap(
          find.text(MeusAchados.rotuloDeCarregarMais),
          warnIfMissed: false,
        );
        await tester.pumpAndSettle();
        await _ateOFim(tester);
        _exigirQueChegouAoFim(tester, '${Rotas.meusAchados} (falha)');
        _exigirControleDentroDaAreaVisivel(
          tester,
          find.widgetWithText(OutlinedButton, 'Tentar de novo'),
          tela: '${Rotas.meusAchados} (falha ao carregar mais)',
          oQue: '"Tentar de novo"',
        );
      },
    );

    testWidgets('meus_achados: o cartao do fim da lista cabe acima da barra', (
      tester,
    ) async {
      // O estado SEM cursor, que escapava por 2 dp -- e por acidente, pela
      // altura da linha de `fimDaLista`. Medido aqui para que a sorte deixe de
      // ser invisivel: se a linha de texto mudar de tamanho, este caso acusa.
      _celularComBarraDoSistema(tester);
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: _rede(achados: 20),
      );
      await irPara(tester, Rotas.meusAchados);
      await _ateOFim(tester);
      _exigirQueChegouAoFim(tester, '${Rotas.meusAchados} (fim da lista)');
      expect(
        find.text(MeusAchados.fimDaLista(20)),
        findsOneWidget,
        reason:
            'REPROVA O PROPRIO CONTROLE: a linha de `fimDaLista` nao esta na '
            'tela, entao este caso nao esta medindo o estado sem cursor.',
      );
      _exigirControleDentroDaAreaVisivel(
        tester,
        _controleMaisBaixoDaLista(tester),
        tela: '${Rotas.meusAchados} (fim da lista)',
        oQue: 'o ultimo cartao da lista',
      );
    });
  });

  // =========================================================================
  // 2. `Meus eventos` -- O CONTROLE DA MEDICAO
  // =========================================================================

  group('CONTROLE — `Meus eventos` tem o mesmo padrao e NAO esconde controle',
      () {
    testWidgets(
      'meus_eventos: o retangulo do ultimo "Cancelar o encontro" cabe acima '
      'da barra do sistema',
      (tester) async {
        // **ESTE E O CONTROLE DA GEOMETRIA**, e e por isso que ele nao foi
        // consertado: a tela tem `SafeArea(bottom: false)` e `Scaffold` sem
        // `bottomNavigationBar` -- o padrao inteiro -- e o ultimo controle
        // sobra 19 dp, porque depois dele vem o espacador, a linha de
        // `fimDaLista` e o recuo do `ListView`. Se um dia este caso reprovar
        // JUNTO com os de `Meus achados`, o problema esta na medicao ou no
        // widget compartilhado, e nao na tela que esta isca consertou.
        _celularComBarraDoSistema(tester);
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: _rede(encontros: 8),
        );
        await irPara(tester, Rotas.meusEventos);
        await _ateOFim(tester);
        _exigirQueChegouAoFim(tester, Rotas.meusEventos);
        _exigirControleDentroDaAreaVisivel(
          tester,
          find.widgetWithText(OutlinedButton, 'Cancelar o encontro').last,
          tela: Rotas.meusEventos,
          oQue: 'o ultimo "Cancelar o encontro"',
        );
      },
    );

    testWidgets('meus_eventos: o botao de cancelar NAO precisou de conserto', (
      tester,
    ) async {
      // A AFIRMACAO DO QUE FICOU, e ela e a metade do trabalho que um conserto
      // apressado desfaz: `Meus achados` e `Meus eventos` sao telas irmas, com
      // a mesma forma e o mesmo `bottom: false`, e a tentacao de "consertar as
      // duas por simetria" e grande. Esta tela foi MEDIDA e passa. Mudar o que
      // passa e mudanca sem motivo, e numa `SafeArea` ela custa 48 dp de recuo
      // morto no pe de toda lista de encontros.
      //
      // Afirmado sobre o ARQUIVO, e nao sobre a arvore montada: o recuo que
      // `SafeArea` aplica ou nao aplica nao tem widget proprio para encontrar,
      // e medir "a tela nao cresceu 48 dp" dependeria de fixar a altura de
      // cada filho.
      // Caminho relativo: `flutter test` roda com o diretorio de trabalho em
      // `app/`. O caso confere que ACHOU o arquivo antes de afirmar sobre o
      // conteudo -- um `contains` sobre string vazia reprovaria com a mensagem
      // errada, e um arquivo renomeado reprovaria como se o recuo tivesse
      // mudado.
      final arquivo = File('lib/telas/perfil/meus_eventos.dart');
      expect(
        arquivo.existsSync(),
        isTrue,
        reason:
            'REPROVA O PROPRIO CONTROLE: `${arquivo.path}` nao existe a partir '
            'de `${Directory.current.path}`. A tela mudou de lugar, e esta '
            'afirmacao perdeu o alvo -- ela nao esta medindo recuo nenhum.',
      );
      final fonte = arquivo.readAsStringSync();
      // A linha com o recuo DELA, com a indentacao do argumento, e nao a
      // frase `bottom: false` em qualquer lugar: as duas antessalas deste
      // mesmo grupo provam que a frase vive dentro de COMENTARIO sem o codigo
      // ter o padrao, e uma afirmacao satisfeita por prosa nao afirma nada.
      expect(
        fonte.contains('\n        bottom: false,\n'),
        isTrue,
        reason:
            'REPROVA: `lib/telas/perfil/meus_eventos.dart` perdeu o '
            '`bottom: false`. Esta tela foi MEDIDA em 390 x 844 dp com 48 dp '
            'de barra do sistema, rolada ate o fim, e o ultimo '
            '`Cancelar o encontro` fica em 729..777 dp contra chao em 796 -- '
            'ela SOBRA 19 dp e nunca esteve quebrada. Se o motivo foi '
            'simetria com `Meus achados`, o motivo nao e medicao: aquela tela '
            'termina num BOTAO e esta termina na linha de `fimDaLista`. Se '
            'houver medicao nova dizendo que esta tambem esconde algo, troque '
            'ESTA afirmacao junto, com o retangulo medido no diff.',
      );
    });
  });

  // =========================================================================
  // 3. AS FOLHAS -- O PADRAO QUE SO EXISTIA NO COMENTARIO
  // =========================================================================

  group('CONTROLE — as duas antessalas ja tinham o recuo inferior LIGADO', () {
    // As duas casaram a varredura por TEXTO e nao tem o padrao: `bottom:
    // false` aparece nelas dentro da prosa que explica o que
    // `showModalBottomSheet(useSafeArea: true)` monta. Elas estao medidas aqui
    // porque "o codigo diz outra coisa" e uma leitura, e o achado em aparelho
    // de 22/09 que as fez ficarem assim merece isca e nao frase.

    Future<void> abrirAFolha(
      WidgetTester tester,
      void Function(BuildContext) mostrar,
    ) async {
      _celularComBarraDoSistema(tester);
      await abrirOApp(tester, deposito: depositoLogado(), rede: _rede());
      // A folha NAO e aguardada de proposito: `mostrar` so resolve quando a
      // pessoa escolhe, e o que esta isca mede e a folha ABERTA.
      mostrar(tester.element(find.byType(Scaffold).first));
      await tester.pumpAndSettle();
    }

    testWidgets('antessala_de_aviso: "Agora não" cabe acima da barra', (
      tester,
    ) async {
      await abrirAFolha(
        tester,
        (ctx) => unawaited(AntessalaDeAviso.mostrar(ctx, nomeDoPet: 'Nina')),
      );
      _exigirControleDentroDaAreaVisivel(
        tester,
        find.widgetWithText(OutlinedButton, TextosDaAntessala.agoraNao),
        tela: 'antessala_de_aviso',
        oQue: '"${TextosDaAntessala.agoraNao}" (a RECUSA, que e o lado seguro)',
      );
    });

    testWidgets(
      'antessala_de_localizacao: "Prefiro digitar o bairro" cabe acima da '
      'barra',
      (tester) async {
        await abrirAFolha(
          tester,
          (ctx) => unawaited(
            AntessalaDeLocalizacao.mostrar(
              ctx,
              pontoDeUso: PontoDeUsoDaLocalizacao.registrarAchado,
            ),
          ),
        );
        _exigirControleDentroDaAreaVisivel(
          tester,
          find.widgetWithText(
            OutlinedButton,
            TextosDaLocalizacao.preferoDigitarOBairro,
          ),
          tela: 'antessala_de_localizacao',
          oQue: '"${TextosDaLocalizacao.preferoDigitarOBairro}" (o outro '
              'caminho, que e o que nao pode ficar fora de alcance)',
        );
      },
    );
  });

  // =========================================================================
  // 4. A FAIXA DE VERSAO NOVA -- O PADRAO NUMA PECA QUE NAO E TELA
  // =========================================================================

  group('CONTROLE — a faixa de versao nova mora no TOPO', () {
    /// Monta `PortaoDeVersao` com a faixa de pe e devolve a altura dela.
    ///
    /// O recuo inferior da janela entra por parametro porque a afirmacao
    /// abaixo e uma DIFERENCA, e nao um numero.
    Future<double> alturaDaFaixa(
      WidgetTester tester, {
      required double recuoInferior,
    }) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(_largura, _altura);
      tester.view.padding = FakeViewPadding(bottom: recuoInferior);
      tester.view.viewPadding = FakeViewPadding(bottom: recuoInferior);
      addTearDown(tester.view.reset);
      await tester.pumpWidget(
        MaterialApp(
          theme: BichuTheme.claro,
          home: PortaoDeVersao(
            versaoApi: VersaoApi(
              ApiClient(
                config: AppConfig.carregar(
                  apiBaseUrlDeTeste: 'http://localhost:3000',
                ),
                cliente: _Recomenda(),
                tempoLimite: const Duration(seconds: 20),
              ),
            ),
            versaoDoApp: '1.0.0',
            child: const Scaffold(body: Text('o app inteiro')),
          ),
        ),
      );
      await tester.pumpAndSettle();

      // CONTROLE POSITIVO: a faixa esta de pe. Uma medicao de faixa ausente
      // devolveria zero nas duas janelas, e a diferenca de zero passaria
      // verde com a faixa nem montada.
      expect(
        find.byType(AvisoDeVersaoNova),
        findsOneWidget,
        reason:
            'REPROVA O PROPRIO CONTROLE: a faixa nao foi montada com recuo '
            'inferior $recuoInferior, entao nada abaixo esta medindo a faixa. '
            'O portao respondeu `liberado` ou `bloqueado`.',
      );
      expect(
        find.text('o app inteiro'),
        findsOneWidget,
        reason:
            'REPROVA O PROPRIO CONTROLE: o aplicativo nao esta embaixo da '
            'faixa. O arranjo medido aqui e a `Column` com `Expanded(child: '
            'app)`, e sem ele isto nao e o aviso brando.',
      );
      return tester.getRect(find.byType(AvisoDeVersaoNova)).height;
    }

    testWidgets('a faixa de versao nova nao gasta recuo de barra nenhum', (
      tester,
    ) async {
      // `aviso_de_versao_nova.dart` casa o padrao inteiro -- `bottom: false` e
      // nenhum `bottomNavigationBar` -- e **nao e uma tela**: nao tem
      // `Scaffold` proprio e nao tem `ListView`. `PortaoDeVersao` a monta como
      // primeiro filho de uma `Column`, com `Expanded(child: app)` embaixo.
      // Ela mora no TOPO, e nada nela encosta no chao.
      //
      // **A AFIRMACAO E UMA DIFERENCA, e nao uma altura.** A primeira escrita
      // deste caso cobrava `altura <= 96 dp` e reprovou sobre a faixa
      // CORRETA: ela mede 136 dp em 390 dp de largura, porque o texto do
      // aviso quebra em linhas ao lado dos dois botoes. O numero era chute
      // meu, e um limite chutado reprova o codigo certo -- que e a pior forma
      // de isca que existe. O que `bottom: false` controla e exatamente
      // quanto a peca CRESCE quando a janela tem barra do sistema, entao e
      // isso que se mede: a mesma faixa, nas duas janelas.
      final semBarra = await alturaDaFaixa(tester, recuoInferior: 0);
      final comBarra = await alturaDaFaixa(
        tester,
        recuoInferior: _barraDoSistema,
      );

      expect(
        comBarra,
        semBarra,
        reason:
            'REPROVA: a faixa mede $semBarra dp numa janela sem barra do '
            'sistema e $comBarra dp numa janela com $_barraDoSistema dp de '
            'barra -- ela cresceu ${(comBarra - semBarra).toStringAsFixed(1)} '
            'dp. Ela e o PRIMEIRO filho da `Column` de `PortaoDeVersao`, com '
            'o aplicativo inteiro embaixo: o recuo inferior que ela reserva '
            'nao protege nada dela do chao, so empurra o aplicativo para '
            'baixo e deixa uma faixa morta entre os dois. E por isso que o '
            '`bottom: false` desta peca esta CERTO, e por isso que ela nao '
            'entrou no conserto de `Meus achados` apesar de casar o mesmo '
            'padrao de varredura.',
      );

      // E a faixa de fato comeca no topo, que e o que torna a diferenca acima
      // a medicao certa: numa peca de rodape o recuo inferior seria devido.
      expect(
        tester.getRect(find.byType(AvisoDeVersaoNova)).top,
        0,
        reason:
            'REPROVA: a faixa nao comeca no topo da janela. Ela e o primeiro '
            'filho da `Column` de `PortaoDeVersao`, e e por morar no topo que '
            'o `bottom: false` dela esta certo. Se ela virou rodape, esta '
            'medicao inteira mudou de assunto.',
      );

      // E o `Agora nao` dela, que e o unico controle que a faixa publica
      // sempre, esta longe do chao -- 44..92 dp contra 796.
      _exigirControleDentroDaAreaVisivel(
        tester,
        find.widgetWithText(TextButton, TextosDaAtualizacao.agoraNao),
        tela: 'aviso_de_versao_nova',
        oQue: '"${TextosDaAtualizacao.agoraNao}" da faixa',
      );
    });
  });

  // =========================================================================
  // 5. O DESLOGADO DAS DUAS TELAS
  // =========================================================================

  group('CONTROLE — o convite de quem nao tem conta nao chega ao chao', () {
    // `ConviteParaEntrar` termina num `BotaoSecundario`, e ele e o ULTIMO
    // filho do `ListView` no estado deslogado das duas telas -- exatamente a
    // forma do defeito. Medido: ele nem faz a lista rolar (`Criar conta` em
    // 425..473 e em 405..453 dp), e por isso este grupo nao chama `_ateOFim`.
    for (final caso in <List<String>>[
      <String>['meus_achados', Rotas.meusAchados],
      <String>['meus_eventos', Rotas.meusEventos],
    ]) {
      testWidgets('${caso[0]} deslogado: "Criar conta" cabe acima da barra', (
        tester,
      ) async {
        _celularComBarraDoSistema(tester);
        // SEM `deposito`, que e o deslogado.
        await abrirOApp(tester, rede: _rede());
        await irPara(tester, caso[1]);
        _exigirControleDentroDaAreaVisivel(
          tester,
          // `BotaoSecundario` -> `OutlinedButton`; `BotaoPrimario` ->
          // `FilledButton`. `Criar conta` e a SEGUNDA porta, e e ela que fica
          // por baixo.
          find.widgetWithText(
            OutlinedButton,
            ConviteParaEntrar.rotuloDeCriarConta,
          ),
          tela: '${caso[1]} (deslogado)',
          oQue: '"${ConviteParaEntrar.rotuloDeCriarConta}" do convite',
        );
      });
    }
  });
}
