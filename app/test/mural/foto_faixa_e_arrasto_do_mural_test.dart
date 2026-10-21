// OS QUATRO ITENS DO MURAL RELATADOS PELO CLIENTE EM 20/10/2026.
//
// Os quatro chegaram no mesmo dia, na mesma tela, e **dois deles sao a mesma
// doenca**: estado que a tela CONHECE e nao desenha.
//
//   1. *"os posts no mural, nao esta publicando a foto, apenas o texto"*
//      -> a foto chega `processing` e a tela nunca relê. Nao e a escrita, nao
//         e o servico da imagem e nao e o Android: e o INSTANTE da leitura.
//         Medido em homologacao -- `GET /timeline` devolve `image: null` ate
//         ~1,5 s depois do `POST`, e `GET /me/publications` diz `processing`
//         no mesmo instante. O `status` chegava e era jogado fora.
//   2. a faixa do `401` abre com o icone e **mais nada** -- sem frase (decisao
//      do cliente de 18/10) e sem o botao `Entrar` (que aquela decisao
//      MANTEVE). `faixa_de_aviso.dart` chama esse estado de *falha calada*, e
//      ele foi reproduzido em emulador com o APK release.
//   3. *"a pagina do mural nao esta funcionando a funcionalidade de atualizar
//      a pagina puxando pra baixo"* -> o Mural era a unica tela de listagem do
//      app sem o gesto, com `_carregar` pronto e a escuta nunca ligada.
//   4. *"toda vez que eu clicar no icone, ele deve fazer uma nova requisicao
//      ... por mais que esse recurso deva acontecer, caso o usuario queira"*
//      -> o toque na barra recarrega, e o arrasto do item 3 CONTINUA.
//
// (1) e (2) sao a mesma doenca: imagem sem estado a desenhar e faixa de erro
// sem saida a oferecer, as duas em silencio, na mesma tela, no mesmo dia.
//
// ===========================================================================
// DESLIGAR PARA VER REPROVAR -- cada isca tem o seu interruptor, com nome
// ===========================================================================
// Tudo abaixo foi MEDIDO, desligando um mecanismo de cada vez em
// `lib/telas/mural/tela_do_mural.dart` e rodando este arquivo.
//
//  1. Apague a chamada a `_agendarReleituraSeAFotoAindaProcessa(minhas.itens)`
//     no fim de `_carregarAgora` (ou o metodo inteiro).
//     -> reprova `ISCA (foto) — a foto que chega `processing` APARECE sozinha,
//        sem a pessoa fazer nada`.
//     O CONTRAPESO do mesmo grupo continua VERDE nas duas formas: e ele que
//     prova que o caso de cima mede a RELEITURA, e nao a primeira resposta.
//
//  2. Troque `FaixaDeAviso(texto: faixa.texto, rotuloDaAcao: faixa.acao,
//     aoTocarNaAcao: saidaDaMensagem(context, faixa))` por
//     `FaixaDeAviso(texto: faixa.texto)`.
//     -> reprova `ISCA (401) — a faixa do Mural deslogado tem SAIDA
//        ALCANCAVEL`. Ela mede que existe um controle TOCAVEL dentro da faixa
//        e que o toque leva a `Rotas.entrar`; **nao** mede texto nenhum, de
//        proposito: o texto do `401` foi removido pelo cliente em 18/10 e
//        reintroduzi-lo seria desfazer a decisao dele.
//
//  3. Apague `with PublicaAAtualizacao` e o `aoArrastarParaAtualizar`.
//     -> reprovam os DOIS casos de `ISCA (arrasto)`, o da lista cheia e o da
//        lista VAZIA, **e** o portao de fonte `as treze superficies de
//        conteudo de rede TEM o gesto` em
//        `test/widgets/arrastar_para_atualizar_test.dart`.
//
//  4. Em `_aoNavegar`, apague `_recargaPedidaPelaCasca(aoTopo: true)`.
//     -> reprovam `ISCA (toque) — o toque no icone do Mural ESTANDO NELE refaz
//        a busca`, `ISCA (toque) — o Mural VAZIO tambem recarrega no toque do
//        icone` e `ISCA (toque) — o toque no icone leva a lista ao TOPO`.
//
//  5. Em `_recargaPedidaPelaCasca`, apague `if (_emSilencio) return;`.
//     -> reprova `ISCA (toque) — o toque DENTRO do intervalo minimo NAO refaz
//        a busca`, e **so ele**.
//
//  6. Em `_carregar`, apague `if (emVoo != null) return emVoo;`.
//     -> reprova `ISCA (em voo)`, e **so ele**.
//
//  7. Em `_recargaPedidaPelaCasca`, apague o bloco `if (aoTopo) { ... }`.
//     -> reprova `ISCA (toque) — o toque no icone leva a lista ao TOPO, mesmo
//        quando pula a requisicao`.
//
//  8. Em `didChangeDependencies`, troque `_recargaPedidaPelaCasca(aoTopo:
//     false)` por `aoTopo: true`.
//     -> reprova `ISCA (volta) — VOLTAR para o Mural de outra tela NAO pula
//        para o topo`.
//
// ===========================================================================
// POR QUE OS CASOS CONTAM REQUISICAO, E NAO PROCURAM WIDGET
// ===========================================================================
// `find.byType(RefreshIndicator)` e `find.byType(TextButton)` sao portoes
// cegos: ficam verdes com `onRefresh: () async {}` e com um botao
// desabilitado. Entao o arrasto e o toque sao medidos por CHAMADA A MAIS na
// mesma rota, a saida do `401` pelo DESTINO a que o toque leva, e a foto pela
// `ImagemDaRede` com a URL da derivada -- que so existe depois de a releitura
// acontecer.
//
// E duas formas da isca de concorrencia foram DESCARTADAS por medicao, com o
// motivo escrito dentro do proprio caso: elas nao distinguiam o mecanismo
// ligado do desligado.

import 'dart:async';

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/mural/tela_do_mural.dart';
import 'package:bichu/widgets/faixa_de_aviso.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';

/// A derivada `card` de 1024 da foto da publicacao. O caminho e o MEDIDO em
/// homologacao em 20/10/2026 (`people/card/...`), e nao um inventado: e o
/// prefixo em que `CATEGORIA_DO_PROPOSITO['user_publication']` grava.
const String _urlDaFoto = 'https://img.exemplo/people/card/aaaa.jpeg';

Map<String, dynamic> _naLinha({
  required String ref,
  required String texto,
  String? url,
}) {
  return <String, dynamic>{
    'ref': ref,
    'body': texto,
    'created_at': '2026-10-20T12:00:00.000Z',
    // O servidor **omite `image` inteiro** enquanto a foto esta `processing`:
    // o predicado `status = ready` esta no `JOIN` da consulta (ADR-0021), e a
    // coluna chega nula. Medido contra homologacao:
    //   t=+320 ms, +721 ms, +1018 ms -> `image: null`; t=+1521 ms -> com url.
    'image': url == null
        ? null
        : <String, dynamic>{'url': url, 'alt_text': '[teste] a foto'},
    'author': <String, dynamic>{
      'handle': 'marina-vet',
      'display_name': 'Marina',
      'photo_icon_url': null,
    },
    'mine': true,
  };
}

Map<String, dynamic> _minha({
  required String ref,
  required String estadoDaFoto,
  String? url,
}) {
  return <String, dynamic>{
    'ref': ref,
    'body': 'o Bidu no parque',
    'created_at': '2026-10-20T12:00:00.000Z',
    'image': <String, dynamic>{
      'upload_id': '01a15c10-9fe5-70a5-a87a-2e8a8b30bdab',
      // O campo que a linha do tempo NAO tem e que esta resposta TEM. E dele
      // que a tela descobre que vale reler.
      'status': estadoDaFoto,
      'url': url,
      'rejection_reason': null,
      'alt_text': '[teste] a foto',
    },
  };
}

/// A foto da publicacao na arvore, distinguida pela URL da derivada.
///
/// Pela URL e nao pela ordem: o cartao desenha ate DUAS `ImagemDaRede` (o
/// icone do autor e a foto), e contar posicao reprovaria no dia em que o
/// cartao ganhasse mais uma.
Finder _aFotoDaPublicacao() => find.byWidgetPredicate(
  (w) => w is ImagemDaRede && w.url == _urlDaFoto,
);

void main() {
  // =========================================================================
  // (1) A FOTO QUE CHEGA `processing`
  // =========================================================================
  group('ISCA (foto) — a publicacao com foto nao fica so com o texto', () {
    testWidgets(
      'ISCA (foto) — a foto que chega `processing` APARECE sozinha, sem a '
      'pessoa fazer nada',
      (tester) async {
        // A CORRIDA, como ela acontece no aparelho: `AbaMural` troca a `Key`
        // assim que a tela de publicar fecha, o corpo remonta, e a leitura sai
        // ANTES de o worker gravar a derivada. A primeira rodada devolve a
        // publicacao SEM imagem e `status: processing`; da segunda em diante,
        // com a URL.
        var rodada = 0;
        final pedidos = <String>[];
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: (http.Request req) async {
            final caminho = req.url.path;
            if (caminho == '/v1/timeline' && req.method == 'GET') {
              pedidos.add(caminho);
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _naLinha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    texto: 'o Bidu no parque',
                    url: rodada == 0 ? null : _urlDaFoto,
                  ),
                ],
                'next_cursor': null,
              });
            }
            if (caminho == '/v1/me/publications' && req.method == 'GET') {
              final primeira = rodada == 0;
              rodada += 1;
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _minha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    estadoDaFoto: primeira ? 'processing' : 'ready',
                    url: primeira ? null : _urlDaFoto,
                  ),
                ],
                'next_cursor': null,
              });
            }
            return problema('not-found', 404);
          },
        );
        await abrirAAba(tester, 'Mural');

        // ANCORA: a publicacao chegou. Sem ela, "a foto nao esta na tela"
        // poderia significar "a tela nao carregou nada", que e como esta
        // classe de caso fica verde sem medir.
        expect(
          find.text('o Bidu no parque'),
          findsOneWidget,
          reason:
              'REPROVA NA ANCORA: a publicacao nao chegou a tela, e o caso '
              'nao esta medindo foto nenhuma.',
        );

        // CONTRAPESO DENTRO DO CASO: a primeira pintura NAO tem a foto. E ele
        // que faz o `expect` de baixo medir a RELEITURA e nao a primeira
        // resposta -- com ele, uma rede que ja devolvesse a URL na rodada 0
        // reprovaria aqui em vez de dar um verde vazio adiante.
        expect(
          _aFotoDaPublicacao(),
          findsNothing,
          reason:
              'REPROVA NO CONTRAPESO: a foto apareceu na PRIMEIRA leitura. '
              'O caso precisa da janela de `processing` para medir a '
              'releitura; sem ela ele aprovaria a tela sem o conserto.',
        );
        final lidasAntes = pedidos.length;

        // O relogio anda sozinho: ninguem toca, ninguem arrasta, ninguem
        // reabre o aplicativo. E isso que o cliente nao tinha de fazer.
        await tester.pump(const Duration(seconds: 3));
        await tester.pumpAndSettle();

        expect(
          pedidos.length,
          greaterThan(lidasAntes),
          reason:
              'REPROVA: a tela NAO releu a linha do tempo. `GET /v1/timeline` '
              'saiu $lidasAntes vez(es) antes da espera e ${pedidos.length} '
              'depois. Sem a releitura, a foto so aparece quando a pessoa '
              'mata o aplicativo e volta -- que foi exatamente o relato.',
        );
        expect(
          _aFotoDaPublicacao(),
          findsOneWidget,
          reason:
              'REPROVA: a publicacao continua so com o texto. A foto FOI '
              'gravada (`image_id` na linha), FOI servida (`people/card/...` '
              'responde 200 pela borda) e o Android release SABE pinta-la '
              '(medido no emulador) -- o que falta e a tela reler depois de a '
              'derivada ficar pronta.',
        );
      },
    );

    testWidgets(
      'CONTRAPESO (foto) — sem nenhuma foto em `processing` a tela NAO fica '
      'relendo para sempre',
      (tester) async {
        // Sem este caso, "reler" poderia virar um laco por quadro: a tela
        // ficaria verde no caso de cima e torraria bateria e cota de rota em
        // toda sessao do Mural.
        final pedidos = <String>[];
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: (http.Request req) async {
            final caminho = req.url.path;
            if (caminho == '/v1/timeline' && req.method == 'GET') {
              pedidos.add(caminho);
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _naLinha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    texto: 'o Bidu no parque',
                    url: _urlDaFoto,
                  ),
                ],
                'next_cursor': null,
              });
            }
            if (caminho == '/v1/me/publications' && req.method == 'GET') {
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _minha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    estadoDaFoto: 'ready',
                    url: _urlDaFoto,
                  ),
                ],
                'next_cursor': null,
              });
            }
            return problema('not-found', 404);
          },
        );
        await abrirAAba(tester, 'Mural');
        expect(_aFotoDaPublicacao(), findsOneWidget);
        final depoisDaCarga = pedidos.length;

        await tester.pump(const Duration(seconds: 10));
        await tester.pumpAndSettle();

        expect(
          pedidos.length,
          depoisDaCarga,
          reason:
              'REPROVA: a tela releu a linha do tempo com TODA foto `ready`. '
              'A releitura existe para a janela de `processing` e para mais '
              'nada; releitura incondicional e um laco de rede ligado em toda '
              'sessao do Mural.',
        );
      },
    );
  });

  // =========================================================================
  // (2) A FAIXA DO 401
  // =========================================================================
  group('ISCA (401) — a faixa muda do Mural deslogado', () {
    testWidgets(
      'ISCA (401) — a faixa do Mural deslogado tem SAIDA ALCANCAVEL, e ela '
      'leva a `Entrar`',
      (tester) async {
        // O ESTADO EXATO que o cliente viu, e que eu reproduzi no emulador com
        // o APK release: deslogado, o Mural abre com uma faixa vermelha com o
        // icone e MAIS NADA. `faixa_de_aviso.dart` chama isso, com estas
        // palavras, de *falha calada*.
        //
        // **O caso NAO mede texto nenhum.** O texto do `401 unauthenticated`
        // foi removido por decisao do cliente em 18/10/2026 e a saida dele --
        // o botao `Entrar` -- FICOU. Medir a frase aqui seria pressionar a
        // proxima pessoa a desfazer aquela decisao para ficar verde.
        await abrirOApp(
          tester,
          rede: (http.Request req) async {
            if (req.url.path == '/v1/timeline') {
              return problema('unauthenticated', 401);
            }
            return problema('unauthenticated', 401);
          },
        );
        await abrirAAba(tester, 'Mural');

        final aFaixa = find.byType(FaixaDeAviso);
        expect(
          aFaixa,
          findsOneWidget,
          reason:
              'REPROVA NA ANCORA: o Mural deslogado nao desenhou faixa '
              'nenhuma, e o caso nao esta medindo a saida de faixa alguma.',
        );

        // A SAIDA, medida como a pessoa a encontra: um controle DENTRO da
        // faixa, habilitado. `onPressed: null` (botao morto) reprova aqui, e e
        // de proposito -- rotulo que nao leva a lugar nenhum e o defeito que a
        // BICHUS-62 veio fechar.
        final aSaida = find.descendant(
          of: aFaixa,
          matching: find.byWidgetPredicate(
            (w) => w is ButtonStyleButton && w.onPressed != null,
          ),
        );
        expect(
          aSaida,
          findsOneWidget,
          reason:
              'REPROVA: a faixa do `401` no Mural nao tem saida. Ela desenha '
              'o icone, nenhuma frase (decisao do cliente de 18/10, que esta '
              'certa) e NENHUM botao -- a pessoa fica numa tela em branco com '
              'uma tarja vermelha e sem nada para tocar. A decisao de 18/10 '
              'removeu o TEXTO e manteve a SAIDA; quem nao passa '
              '`rotuloDaAcao` e `aoTocarNaAcao` desfaz a metade errada dela.',
        );

        await tester.tap(aSaida);
        await tester.pumpAndSettle();

        final rota = GoRouter.of(
          tester.element(find.byType(Scaffold).first),
        ).state.uri.toString();
        expect(
          rota,
          Rotas.entrar,
          reason:
              'REPROVA: o toque na saida da faixa parou em `$rota`, e nao em '
              '`${Rotas.entrar}`. Um rotulo que nao leva a lugar nenhum e pior '
              'que a ausencia dele: promete porta e entrega parede.',
        );
      },
    );
  });

  // =========================================================================
  // (3) O ARRASTO
  // =========================================================================
  group('ISCA (arrasto) — puxar para baixo refaz a busca no Mural', () {
    /// Monta o app no Mural com [itens] publicacoes e devolve a lista de
    /// caminhos pedidos, que e o que os casos contam.
    Future<List<String>> abrirOMural(
      WidgetTester tester, {
      required int itens,
    }) async {
      final pedidos = <String>[];
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: (http.Request req) async {
          final caminho = req.url.path;
          if (caminho == '/v1/timeline' && req.method == 'GET') {
            pedidos.add(caminho);
            return json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[
                for (var i = 1; i <= itens; i++)
                  _naLinha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK$i',
                    texto: 'publicacao $i',
                  ),
              ],
              'next_cursor': null,
            });
          }
          if (caminho == '/v1/me/publications' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': const <Map<String, dynamic>>[],
              'next_cursor': null,
            });
          }
          return problema('not-found', 404);
        },
      );
      await abrirAAba(tester, 'Mural');
      return pedidos;
    }

    /// O arrasto, como o dedo o faz. `fling` e nao `drag`: o `RefreshIndicator`
    /// so dispara quando o excesso passa do limite **e** o gesto termina.
    Future<void> arrastarParaBaixo(WidgetTester tester) async {
      await tester.fling(
        find.byType(Scrollable).first,
        const Offset(0, 320),
        1200,
      );
      await tester.pumpAndSettle();
    }

    testWidgets('ISCA (arrasto) — o Mural CHEIO refaz a busca no arrasto', (
      tester,
    ) async {
      final pedidos = await abrirOMural(tester, itens: 6);
      expect(
        find.text('publicacao 1'),
        findsOneWidget,
        reason: 'REPROVA NA ANCORA: a linha do tempo nao carregou.',
      );
      final antes = pedidos.length;
      expect(antes, greaterThan(0));

      await arrastarParaBaixo(tester);

      expect(
        pedidos.length,
        greaterThan(antes),
        reason:
            'REPROVA: o arrasto no Mural NAO refez a busca. `GET /v1/timeline` '
            'saiu $antes vez(es) antes do gesto e ${pedidos.length} depois. '
            'O Mural e o corpo de uma raiz de secao: a rolagem e da casca '
            '(`TelaDeAba`) e a busca e publicada por `SlotDeAtualizacao` -- '
            'sem `with PublicaAAtualizacao` o embrulho existe, a roda gira e '
            'nada e pedido ao servidor.',
      );
    });

    testWidgets(
      'ISCA (arrasto) — o Mural VAZIO tambem refaz a busca, e e nele que a '
      'pessoa puxa',
      (tester) async {
        // **O caso que nao pode faltar.** O Mural nasce vazio para todo mundo
        // -- ainda nao ha como encontrar pessoas --, e uma lista sem itens
        // frequentemente nao aceita o arrasto: sem a fisica com pai que
        // `ArrastarParaAtualizar` impoe, a extensao de rolagem e zero, nao ha
        // excesso a notificar e o indicador nao dispara. E justamente no Mural
        // vazio que a pessoa puxa para ver se chegou algo.
        final pedidos = await abrirOMural(tester, itens: 0);
        expect(
          find.text(CorpoDoMural.tituloSemConexao),
          findsOneWidget,
          reason:
              'REPROVA NA ANCORA: o Mural vazio nao desenhou o estado vazio, '
              'e o caso nao esta medindo lista vazia nenhuma.',
        );
        final antes = pedidos.length;
        expect(antes, greaterThan(0));

        await arrastarParaBaixo(tester);

        expect(
          pedidos.length,
          greaterThan(antes),
          reason:
              'REPROVA: o Mural VAZIO nao aceita o arrasto. Pedidos a '
              '`GET /v1/timeline`: $antes antes e ${pedidos.length} depois. '
              'O gesto nao pode depender de haver itens: a lista vazia e '
              'onde ele mais serve.',
        );
      },
    );
  });
  // =========================================================================
  // (4) O TOQUE NO ICONE DA BARRA
  // =========================================================================
  //
  // Cliente, 20/10/2026: *"no mural, toda vez que eu clicar no icone, ele deve
  // fazer uma nova requisicao para garantir que o conteudo esta atualizado e o
  // usuario nao precisar forcar a atualizacao, por mais que esse recurso deva
  // acontecer, caso o usuario queira"*. A segunda metade e explicita: o
  // arrastar-para-atualizar continua, e os casos de (3) continuam valendo.
  //
  // As tres iscas deste grupo medem TRES mecanismos diferentes, e cada uma
  // isola o seu -- e por isso que a do "em voo" gasta dois `pump` de 31 s: sem
  // eles a janela de silencio bloquearia o toque e o caso ficaria verde sem
  // ter exercitado o guarda de concorrencia nenhuma vez.
  group('ISCA (toque no icone) — tocar o Mural na barra recarrega', () {
    Future<List<String>> abrirOMuralNaBarra(
      WidgetTester tester, {
      required List<String> pedidos,
      required List<Completer<http.Response>> presos,
      required bool Function() segurando,
      int itens = 3,
    }) async {
      await abrirOApp(
        tester,
        deposito: depositoLogado(),
        rede: (http.Request req) async {
          final caminho = req.url.path;
          if (caminho == '/v1/timeline' && req.method == 'GET') {
            pedidos.add(caminho);
            final resposta = json200(<String, dynamic>{
              'items': <Map<String, dynamic>>[
                for (var i = 1; i <= itens; i++)
                  _naLinha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK$i',
                    texto: 'publicacao $i',
                  ),
              ],
              'next_cursor': null,
            });
            if (segurando()) {
              final preso = Completer<http.Response>();
              presos.add(preso);
              return preso.future;
            }
            return resposta;
          }
          if (caminho == '/v1/me/publications' && req.method == 'GET') {
            return json200(<String, dynamic>{
              'items': const <Map<String, dynamic>>[],
              'next_cursor': null,
            });
          }
          return problema('not-found', 404);
        },
      );
      await abrirAAba(tester, 'Mural');
      return pedidos;
    }

    /// O toque no slot do Mural, inclusive quando ele ja e o slot aceso.
    Future<void> tocarNoIconeDoMural(WidgetTester tester) async {
      await tester.tap(find.widgetWithText(NavigationDestination, 'Mural'));
      await tester.pumpAndSettle();
    }

    testWidgets(
      'ISCA (toque) — o toque no icone do Mural ESTANDO NELE refaz a busca',
      (tester) async {
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        await abrirOMuralNaBarra(
          tester,
          pedidos: pedidos,
          presos: presos,
          segurando: () => false,
        );
        expect(
          find.text('publicacao 1'),
          findsOneWidget,
          reason: 'REPROVA NA ANCORA: a linha do tempo nao carregou.',
        );
        final antes = pedidos.length;
        expect(antes, greaterThan(0));

        // A janela de silencio da carga de entrada expira. Ela e medida pelo
        // caso irmao; aqui ela so nao pode mascarar o mecanismo do toque.
        await tester.pump(
          CorpoDoMural.intervaloMinimoEntreRecargas +
              const Duration(seconds: 1),
        );
        await tocarNoIconeDoMural(tester);

        expect(
          pedidos.length,
          greaterThan(antes),
          reason:
              'REPROVA: o toque no icone do Mural NAO refez a busca. '
              '`GET /v1/timeline` saiu $antes vez(es) antes do toque e '
              '${pedidos.length} depois. O sinal existe sem canal novo na '
              'barra: `goBranch(ramo, initialLocation: true)` cai em '
              '`GoRouter.go` para o MESMO endereco, e o provedor de rota '
              'notifica mesmo com a URL identica, porque `_setValue` compara '
              'tambem o `state` e `RouteInformationState` nao define `==`.',
        );
      },
    );

    testWidgets(
      'ISCA (toque) — o toque DENTRO do intervalo minimo NAO refaz a busca',
      (tester) async {
        // O OUTRO LADO da isca de cima, e o que impede o martelo: sem o
        // intervalo, um dedo rapido no icone vira uma rajada de
        // `GET /v1/timeline` -- e a rota nao tem teto de chamadas no contrato
        // (`effects: []`, sem `rateLimit`), entao nao ha nada do lado do
        // servidor para segurar a rajada.
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        await abrirOMuralNaBarra(
          tester,
          pedidos: pedidos,
          presos: presos,
          segurando: () => false,
        );
        final antes = pedidos.length;
        expect(antes, greaterThan(0));

        // SEM `pump` da janela: o toque acontece logo depois da carga.
        await tocarNoIconeDoMural(tester);
        await tocarNoIconeDoMural(tester);
        await tocarNoIconeDoMural(tester);

        expect(
          pedidos.length,
          antes,
          reason:
              'REPROVA: TRES toques dentro do intervalo minimo de '
              '${CorpoDoMural.intervaloMinimoEntreRecargas.inSeconds} s '
              'geraram requisicao. Pedidos: $antes antes e '
              '${pedidos.length} depois.',
        );
      },
    );

    testWidgets(
      'ISCA (em voo) — com uma requisicao ABERTA, o segundo pedido ESPERA a '
      'que esta no ar em vez de abrir outra',
      (tester) async {
        // ===================================================================
        // ISOLAMENTO DO MECANISMO, e ele custou DUAS medicoes para ficar certo
        // ===================================================================
        //
        // Forma 1, descartada: dois toques no icone com 31 s de `pump` entre
        // eles, para a janela de silencio estar expirada nos dois. Reprovava
        // com o conserto ligado, e o motivo e real -- `ApiClient.tempoLimite`
        // e de **20 s** (`api_client.dart:27`), entao o `pump` de 31 s MATA a
        // requisicao presa por prazo e nao sobra nada em voo para recusar.
        //
        // Forma 2, descartada: dois arrastos seguidos. Ficava VERDE com o
        // guarda DESLIGADO -- e isso e um portao cego, nao um conserto: quem
        // recusava o segundo arrasto era o proprio `RefreshIndicator`, que
        // ignora gesto novo enquanto o `Future` do anterior nao completa. O
        // caso media o Material, e nao esta tela.
        //
        // Forma 3, esta: a requisicao em voo entra pela RELEITURA DA FOTO
        // (`processing`, 2 s), que e silenciosa e nao poe o indicador em modo
        // de recarga; o segundo pedido entra pelo ARRASTO, que nao passa pelo
        // intervalo minimo. Nenhum outro guarda pode recusa-lo -- so o de
        // concorrencia. E e um encontro REAL: a foto reles a cada 2 s logo
        // depois de publicar, que e exatamente quando a pessoa puxa a lista
        // para ver se a foto chegou.
        //
        // Duas requisicoes concorrentes nao sao desperdicio: a resposta da
        // primeira pode chegar DEPOIS da segunda e pintar conteudo velho em
        // cima do novo.
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        var segurando = false;
        await abrirOApp(
          tester,
          deposito: depositoLogado(),
          rede: (http.Request req) async {
            final caminho = req.url.path;
            if (caminho == '/v1/timeline' && req.method == 'GET') {
              pedidos.add(caminho);
              if (segurando) {
                final preso = Completer<http.Response>();
                presos.add(preso);
                return preso.future;
              }
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _naLinha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    texto: 'o Bidu no parque',
                  ),
                ],
                'next_cursor': null,
              });
            }
            if (caminho == '/v1/me/publications' && req.method == 'GET') {
              // SEMPRE `processing`: e isso que mantem a releitura armada e
              // da ao caso uma carga silenciosa para segurar.
              return json200(<String, dynamic>{
                'items': <Map<String, dynamic>>[
                  _minha(
                    ref: 'AaBbCcDdEeFfGgHhIiJjK1',
                    estadoDaFoto: 'processing',
                  ),
                ],
                'next_cursor': null,
              });
            }
            return problema('not-found', 404);
          },
        );
        await abrirAAba(tester, 'Mural');
        expect(pedidos.length, greaterThan(0));

        // A releitura da foto abre a requisicao que vai FICAR em voo.
        segurando = true;
        await tester.pump(const Duration(seconds: 3));
        final comUmaEmVoo = pedidos.length;
        expect(
          presos,
          hasLength(1),
          reason:
              'REPROVA NA ANCORA: nenhuma requisicao ficou em voo. Sem ela o '
              'caso nao esta medindo concorrencia nenhuma.',
        );

        // O SEGUNDO pedido, com o primeiro ainda aberto. `pump` com limite e
        // nao `pumpAndSettle`: a roda gira enquanto o `Future` nao completa,
        // e `pumpAndSettle` esperaria para sempre.
        await tester.fling(
          find.byType(Scrollable).first,
          const Offset(0, 320),
          1200,
        );
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));

        expect(
          pedidos.length,
          comUmaEmVoo,
          reason:
              'REPROVA: o segundo pedido abriu uma requisicao NOVA com a '
              'primeira ainda em voo. Pedidos a `GET /v1/timeline`: '
              '$comUmaEmVoo com uma aberta e ${pedidos.length} depois do '
              'arrasto. Duas respostas fora de ordem pintam conteudo velho '
              'em cima do novo. O toque no icone cai no MESMO funil '
              '(`_carregar`), entao o que vale aqui vale para ele.',
        );

        // Solta a presa, para o caso nao terminar com requisicao pendurada.
        segurando = false;
        presos.single.complete(
          json200(<String, dynamic>{
            'items': const <Map<String, dynamic>>[],
            'next_cursor': null,
          }),
        );
        await tester.pump();
        await tester.pump(const Duration(seconds: 1));
      },
    );

    testWidgets(
      'ISCA (toque) — o Mural VAZIO tambem recarrega no toque do icone',
      (tester) async {
        // O Mural nasce vazio para todo mundo enquanto nao ha como encontrar
        // pessoas. E justamente ali que a pessoa toca o icone para ver se
        // chegou algo, e um gesto que so funciona com lista cheia nao serve.
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        await abrirOMuralNaBarra(
          tester,
          pedidos: pedidos,
          presos: presos,
          segurando: () => false,
          itens: 0,
        );
        expect(
          find.text(CorpoDoMural.tituloSemConexao),
          findsOneWidget,
          reason: 'REPROVA NA ANCORA: o estado vazio nao apareceu.',
        );
        final antes = pedidos.length;

        await tester.pump(
          CorpoDoMural.intervaloMinimoEntreRecargas +
              const Duration(seconds: 1),
        );
        await tocarNoIconeDoMural(tester);

        expect(
          pedidos.length,
          greaterThan(antes),
          reason:
              'REPROVA: o Mural VAZIO nao recarregou no toque do icone. '
              'Pedidos: $antes antes e ${pedidos.length} depois.',
        );
      },
    );

    testWidgets(
      'ISCA (toque) — o toque no icone leva a lista ao TOPO, mesmo quando '
      'pula a requisicao',
      (tester) async {
        // A DECISAO, e o motivo dela. Tocar o icone da aba em que voce JA esta
        // significa, em todo aplicativo que a pessoa usa, "me leva ao topo".
        // Hoje a recarga sozinha NAO mexia na rolagem: quem rola a secao e o
        // `ListView` da casca, e trocar a lista do corpo nao move o deslize.
        //
        // E ela vem ANTES do intervalo minimo de proposito: e o que faz o
        // toque ter efeito visivel mesmo no segundo em que a requisicao e
        // pulada -- sem isso, um toque dentro da janela pareceria inerte, e
        // "o botao nao faz nada" e como um estrangulamento vira defeito.
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        await abrirOMuralNaBarra(
          tester,
          pedidos: pedidos,
          presos: presos,
          segurando: () => false,
          itens: 12,
        );
        final rolagem = tester.state<ScrollableState>(
          find.byType(Scrollable).first,
        );
        rolagem.position.jumpTo(300);
        await tester.pump();
        expect(
          rolagem.position.pixels,
          greaterThan(0),
          reason:
              'REPROVA NA ANCORA: a lista nao rolou, e o caso nao esta '
              'medindo volta ao topo nenhuma.',
        );

        // SEM esperar a janela: o toque pula a requisicao e ainda assim tem
        // de ter efeito.
        await tocarNoIconeDoMural(tester);

        expect(
          rolagem.position.pixels,
          0,
          reason:
              'REPROVA: o toque no icone nao levou a lista ao topo. Ela '
              'parou em ${rolagem.position.pixels}. Dentro do intervalo '
              'minimo esta e a UNICA resposta visivel ao toque.',
        );
      },
    );

    testWidgets(
      'ISCA (volta) — VOLTAR para o Mural de outra tela NAO pula para o topo',
      (tester) async {
        // O OUTRO LADO do sinal do toque, e ele e necessario porque o provedor
        // de rota notifica em TODA navegacao: voltar da tela de publicar
        // (`/mural/publicar` -> `/mural`) chega ao ouvinte identico a um toque
        // no icone. O que os separa e o endereco ANTERIOR -- no toque ele ja
        // era o do Mural; na volta ele era o da outra tela.
        //
        // MEDIDO, e dito aqui porque a primeira versao deste caso afirmava
        // mais do que o mecanismo garante: a volta **recarrega**, e nao e o
        // ouvinte de rota que a dispara. Uma rota empilhada por cima tira o
        // ramo do `TickerMode`, e voltar o devolve -- para esta tela isso e
        // *entrar na aba*, exatamente como chegar de `Pets`. E o comportamento
        // certo (o cliente quer conteudo fresco) e ele esta preso pela mesma
        // janela de silencio.
        //
        // O que a volta **nao** pode fazer e mover a lista: quem cancelou uma
        // publicacao estava no meio dela e nao pediu para perder o lugar. E e
        // isso -- e so isso -- que este caso mede.
        final pedidos = <String>[];
        final presos = <Completer<http.Response>>[];
        await abrirOMuralNaBarra(
          tester,
          pedidos: pedidos,
          presos: presos,
          segurando: () => false,
          itens: 12,
        );
        final rolagem = tester.state<ScrollableState>(
          find.byType(Scrollable).first,
        );
        rolagem.position.jumpTo(300);
        await tester.pump();

        final contexto = tester.element(find.byType(CorpoDoMural));
        GoRouter.of(contexto).push(Rotas.entrar);
        await tester.pumpAndSettle();
        // A janela expira enquanto a pessoa esta fora: assim a volta cai no
        // caminho que de fato recarrega, que e o caso dificil para a rolagem.
        await tester.pump(
          CorpoDoMural.intervaloMinimoEntreRecargas +
              const Duration(seconds: 1),
        );

        GoRouter.of(contexto).pop();
        await tester.pumpAndSettle();

        expect(
          rolagem.position.pixels,
          300,
          reason:
              'REPROVA: voltar de outra tela jogou a lista para o topo, como '
              'se fosse toque no icone. Ela parou em '
              '${rolagem.position.pixels}. A volta e *entrar na aba*, e '
              'entrar devolve a pessoa onde ela estava -- so o toque no icone '
              'da aba em que ela JA esta significa "me leva ao topo".',
        );
      },
    );
  });
}
