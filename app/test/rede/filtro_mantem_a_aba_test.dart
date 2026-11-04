// APLICAR UM FILTRO NAO PODE TROCAR A ABA DA SECAO `Rede`.
//
// Pedido do cliente, 03/11/2026, verbatim: *"o botao filtrar encerrado na
// pagina de eventos esta levando o usuario para a pagina de usuarios quando o
// filtro e aplicado e acaba nao listando nada por isso"*. E, em seguida, sobre
// a outra aba: *"nos filtros dos profissionais recomendados acontece o mesmo
// problema"*.
//
// ---------------------------------------------------------------------------
// ## A CAUSA QUE ESTES CASOS PRENDEM
//
// `SecaoDaRede` tem DUAS fontes da verdade para a aba: o estado `_aba` (que o
// toque na `TabBar` move) e o parametro de consulta `?aba=` do endereco (que
// `AbaRede.abaPedidaPor` le a CADA construcao). `didUpdateWidget` tratava o
// parametro como ORDEM VIVA: toda reconstrucao de `AbaRede` com `?aba=` no
// endereco reimpunha a aba do endereco por cima da que a pessoa escolheu.
//
// **Por que `Usuarios` e nao outra:** `?aba=usuarios` e o UNICO valor que
// alguem escreve no endereco -- `Rotas.redeNaBuscaDePessoas`, usada por
// `tela_do_mural.dart` e por `tela_minhas_conexoes.dart` com `context.go`. Uma
// vez nesse endereco, trocar de aba com o DEDO nao reescreve o endereco, e o
// `?aba=usuarios` fica pendurado esperando a proxima reconstrucao. O `Aplicar`
// da folha de filtros fecha uma rota sem pagina (`Navigator.pop` do
// `showModalBottomSheet`), o `GoRouter` notifica, `AbaRede` reconstroi -- e a
// pessoa cai em `Usuarios`, que abre sem lista nenhuma.
//
// **E O *"ACABA NAO LISTANDO NADA"* TEM UMA SEGUNDA CAUSA, MEDIDA AQUI.** Na
// base, `_FolhaDeFiltros._aplicar` fechava a folha ANTES de entregar a
// escolha. Com a aba desmontada pelo proprio `pop`, `aoAplicar` caia num
// `State` descartado: a reproducao imprimiu *"setState() called after
// dispose(): _AgendaDaRedeState"* com a pilha passando por `_trocarRecorte` e
// `_aplicarAFolha`, e o recorte NUNCA chegou ao servidor. Entao o *nada* era
// duplo -- aba errada E recorte no chao --, e por isso as assercoes de cada
// caso daqui sao DUAS: a aba e a consulta.
//
// ## POR QUE O TOQUE, E NAO O DESENHO
//
// Ja existe caso que mede que o botao de filtro e DESENHADO, e ele fica verde
// com este defeito de pe. O que discrimina e o TOQUE no `Aplicar` seguido da
// pergunta `em que aba eu estou`, medida pelo CORPO montado (`AgendaDaRede`
// contra `BuscaDePessoas`) e nao pelo realce da `TabBar` -- o corpo e o que a
// pessoa ve, e era ele que trocava.

import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perto/lista_do_diretorio.dart';
import 'package:bichu/telas/rede/agenda_da_rede.dart';
import 'package:bichu/telas/rede/busca_de_pessoas.dart';
import 'package:bichu/telas/rede/secao_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../telas/ajuda_de_tela.dart';
import '../telas/perto_com_dados_test.dart' as perto;
import 'fixtures_da_rede.dart';

/// Leva o app para `/rede?aba=usuarios`.
///
/// **E a MESMA chamada das duas portas de producao**, e nao um atalho de
/// teste: `tela_do_mural.dart` e `tela_minhas_conexoes.dart` fazem
/// `context.go(Rotas.redeNaBuscaDePessoas)`. Quem quiser conferir que as
/// portas existem tem `onde_se_adiciona_pessoa_test.dart`; aqui o assunto e o
/// que acontece DEPOIS de chegar por elas.
Future<void> irParaBuscaDePessoasPeloEndereco(WidgetTester tester) async {
  GoRouter.of(
    tester.element(find.byType(SecaoDaRede)),
  ).go(Rotas.redeNaBuscaDePessoas);
  await tester.pumpAndSettle();
  expect(
    find.byType(BuscaDePessoas),
    findsOneWidget,
    reason: 'REPROVA: `Rotas.redeNaBuscaDePessoas` nao abriu a aba '
        '`Usuários`. Sem este ponto de partida os casos deste arquivo nao '
        'exercitam nada -- eles medem o que o `?aba=usuarios` PENDURADO faz '
        'depois.',
  );
}

/// Toca numa aba da secao e espera a troca assentar.
Future<void> tocarNaAba(WidgetTester tester, AbaDaSecaoRede aba) async {
  await tester.tap(find.widgetWithText(Tab, aba.rotulo));
  await tester.pumpAndSettle();
}

/// Abre a folha, marca [opcoes] e toca `Aplicar`, **rolando a folha**.
///
/// `aplicarNaFolha` de `fixtures_da_rede.dart` toca sem rolar, e isso basta na
/// folha de `Eventos`. Na de `Comunidade` nao: ela tem tres grupos (`Cidade`,
/// `Atividade` e `Verificacao`) e `Contato verificado` nasce em `dy 706` numa
/// tela de teste de 600 -- o toque cai FORA da arvore e a folha continua
/// aberta, com o `Aplicar` desabilitado por nao haver mudanca. Medido: o caso
/// reprovou com *"Offset(265.4, 706.0) is outside the bounds of the root of
/// the render tree"* e `verification_level` nulo, e nao pelo defeito.
///
/// `ensureVisible` e o padrao da casa para isto, e nao cerimonia de teste: e
/// o que a pessoa faz com o dedo antes de tocar no que esta abaixo da dobra.
Future<void> aplicarRolandoAFolha(
  WidgetTester tester,
  List<String> opcoes,
) async {
  await tester.ensureVisible(find.byIcon(Icons.tune));
  await tester.tap(find.byIcon(Icons.tune));
  await tester.pumpAndSettle();
  for (final opcao in opcoes) {
    final alvo = find.text(opcao);
    await tester.ensureVisible(alvo);
    await tester.pumpAndSettle();
    await tester.tap(alvo);
    await tester.pumpAndSettle();
  }
  final aplicar = find.text('Aplicar');
  await tester.ensureVisible(aplicar);
  await tester.pumpAndSettle();
  await tester.tap(aplicar);
  await tester.pumpAndSettle();
}

void main() {
  group('aplicar um filtro MANTEM a aba da secao `Rede`', () {
    testWidgets(
        'Eventos: `Encerrados` nao joga a pessoa na aba `Usuários`',
        (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) => json200(
              pagina(<Map<String, dynamic>>[
                encontroPublico(
                  slug: 'encontro-um',
                  title: 'Encontro na praca',
                  startsAt: '2026-11-10T12:00:00Z',
                  endsAt: '2026-11-10T14:00:00Z',
                ),
              ]),
            ),
      });
      await abrirRede(tester, rede: rede);
      await irParaBuscaDePessoasPeloEndereco(tester);

      await tocarNaAba(tester, AbaDaSecaoRede.eventos);
      expect(
        find.byType(AgendaDaRede),
        findsOneWidget,
        reason: 'REPROVA: o toque na aba `Eventos` nao trouxe a agenda. O '
            'caso perdeu o ponto de partida.',
      );

      await aplicarNaFolha(tester, <String>['Encerrados']);

      expect(
        find.byType(BuscaDePessoas),
        findsNothing,
        reason: 'REPROVA: aplicar o filtro `Encerrados` em `Eventos` levou a '
            'pessoa para a aba `Usuários`. E o defeito que o cliente relatou '
            'em 03/11/2026: o `?aba=usuarios` pendurado no endereco foi '
            'reimposto quando a folha fechou.',
      );
      expect(
        find.byType(AgendaDaRede),
        findsOneWidget,
        reason: 'REPROVA: a agenda saiu da tela depois do `Aplicar`. A aba '
            'tem de ser a mesma em que a pessoa estava.',
      );
      expect(
        rede.chamadasA('GET /v1/network/events').last.url
            .queryParameters['when'],
        'past',
        reason: 'REPROVA: o recorte `Encerrados` nao chegou ao servidor. Sem '
            'esta metade o caso aprovaria uma tela que fica na aba certa e '
            'perde o filtro -- que e a outra metade do *"acaba nao listando '
            'nada"*.',
      );
    });

    testWidgets(
        'Comunidade: `Contato verificado` nao joga a pessoa na aba `Usuários`',
        (tester) async {
      final urls = <Uri>[];
      await perto.abrirPerto(
        tester,
        rede: perto.redeDoDiretorio(
          perto.paginaDoContrato(
            perto.vinteECincoEntradas(),
            distanciaDisponivel: false,
          ),
          urls: urls,
        ),
      );
      await irParaBuscaDePessoasPeloEndereco(tester);

      await tocarNaAba(tester, AbaDaSecaoRede.comunidade);
      expect(
        find.byType(ListaDoDiretorio),
        findsOneWidget,
        reason: 'REPROVA: o toque na aba `Comunidade` nao trouxe o '
            'diretorio. O caso perdeu o ponto de partida.',
      );

      await aplicarRolandoAFolha(tester, <String>['Contato verificado']);

      expect(
        find.byType(BuscaDePessoas),
        findsNothing,
        reason: 'REPROVA: aplicar o filtro nos profissionais recomendados '
            'levou a pessoa para a aba `Usuários` -- a segunda tela que o '
            'cliente relatou em 03/11/2026.',
      );
      expect(
        find.byType(ListaDoDiretorio),
        findsOneWidget,
        reason: 'REPROVA: o diretorio saiu da tela depois do `Aplicar`.',
      );
      expect(
        urls.last.queryParameters['verification_level'],
        'contact_verified',
        reason: 'REPROVA: o recorte de verificacao nao chegou ao servidor.',
      );
    });

    testWidgets(
        'CONTROLE DA NAO-REGRESSAO: a porta de `Usuários` continua levando '
        'para la depois de a pessoa trocar de aba com o dedo',
        (tester) async {
      // **Sem este caso o conserto poderia ser "ignorar o `?aba=`".** Isso
      // deixaria os dois casos acima verdes e QUEBRARIA as duas portas de
      // producao que mandam para a busca de pessoas
      // (`Rotas.redeNaBuscaDePessoas`, em `tela_do_mural.dart` e em
      // `tela_minhas_conexoes.dart`).
      //
      // O que o conserto faz e tratar o `?aba=` como PEDIDO e apaga-lo depois
      // de atende-lo. A consequencia que este caso mede: o pedido pode ser
      // feito DE NOVO e volta a funcionar -- porque o endereco voltou a
      // MUDAR quando a porta e tocada outra vez.
      //
      // **E ELE REPROVA NA BASE, por um defeito SEU, e isso foi medido:** com
      // o `?aba=usuarios` pendurado, o segundo `go` para o MESMO endereco nao
      // muda o endereco, o roteador nao notifica, `didUpdateWidget` nao e
      // chamado -- e a porta do Mural era de UM USO SO por visita a `Rede`. O
      // cliente nao relatou isso (ele nunca chegou a tentar duas vezes), mas e
      // a mesma causa, e o mesmo conserto cura.
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (_) =>
            json200(pagina(const <Map<String, dynamic>>[])),
      });
      await abrirRede(tester, rede: rede);

      await irParaBuscaDePessoasPeloEndereco(tester);
      await tocarNaAba(tester, AbaDaSecaoRede.eventos);
      expect(find.byType(AgendaDaRede), findsOneWidget);

      await irParaBuscaDePessoasPeloEndereco(tester);
      expect(
        find.byType(AgendaDaRede),
        findsNothing,
        reason: 'REPROVA: a porta de `Usuários` deixou de trocar de aba '
            'quando o endereco pedido era o mesmo de antes. O conserto nao '
            'pode ser "ignorar o `?aba=`": ele e o unico caminho do Mural e '
            'das conexoes para a busca de pessoas.',
      );
    });
  });

  group('o filtro que nao casa nada DIZ o motivo, e nao fica branco', () {
    // **A SEGUNDA METADE DO RELATO DELE.** Ele escreveu *"acaba nao listando
    // nada por isso"*, e a causa do *nada* era a troca de aba. Consertada
    // ela, sobra a pergunta legitima: e quando o recorte de fato nao casa com
    // nada? Esta casa ja reprovou vazio sem explicacao, e os dois lugares
    // tinham a resposta -- `EstadoVazio` POR MOTIVO. Estes dois casos TRAVAM
    // isso, para que o conserto de hoje nao entregue a aba certa com um
    // branco mudo dentro.

    testWidgets('Eventos sem nenhum encerrado explica QUAL recorte vazio',
        (tester) async {
      final rede = RedeDeTeste(<String, http.Response Function(http.Request)>{
        'GET /v1/network/events': (req) => json200(
              pagina(
                req.url.queryParameters['when'] == 'past'
                    ? const <Map<String, dynamic>>[]
                    : <Map<String, dynamic>>[
                        encontroPublico(
                          slug: 'encontro-um',
                          title: 'Encontro na praca',
                          startsAt: '2026-11-10T12:00:00Z',
                          endsAt: '2026-11-10T14:00:00Z',
                        ),
                      ],
              ),
            ),
      });
      await abrirRede(tester, rede: rede);
      await aplicarNaFolha(tester, <String>['Encerrados']);

      expect(
        find.text(AgendaDaRede.tituloDoVazioDeEncerrados),
        findsOneWidget,
        reason: 'REPROVA: `Eventos` com o recorte `Encerrados` e zero '
            'resultado nao disse o motivo. Vazio mudo nao passa nesta casa, e '
            'e exatamente o que a pessoa ve depois de filtrar.',
      );
      expect(
        find.widgetWithText(OutlinedButton, 'Limpar filtro'),
        findsOneWidget,
        reason: 'REPROVA: o vazio por filtro nao oferece saida. Quem filtrou '
            'sem casar nada precisa de um caminho de volta na propria tela.',
      );
    });

    testWidgets('Comunidade sem resultado filtrado explica o motivo',
        (tester) async {
      await perto.abrirPerto(
        tester,
        rede: (req) async {
          if (req.url.path == '/v1/directory/entries' &&
              req.method == 'GET') {
            final filtrado =
                req.url.queryParameters['verification_level'] != null;
            return json200(
              perto.paginaDoContrato(
                filtrado
                    ? const <Map<String, dynamic>>[]
                    : perto.vinteECincoEntradas(),
                distanciaDisponivel: false,
              ),
            );
          }
          return problema('not-found', 404);
        },
      );
      await aplicarRolandoAFolha(tester, <String>['Contato verificado']);

      expect(
        find.text(ListaDoDiretorio.tituloDoVazioFiltrado),
        findsOneWidget,
        reason: 'REPROVA: os profissionais recomendados com filtro e zero '
            'resultado ficaram sem explicacao.',
      );
    });
  });
}
