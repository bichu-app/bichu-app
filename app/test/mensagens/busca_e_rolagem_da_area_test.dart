// AS ISCAS DO PEDIDO DE 18/10/2026 na area de mensagens.
//
// Quatro pedidos do cliente, nas palavras dele:
//
//   1. *"adicione um campo de busca/filtro na secao de mensagens, para o
//      usuario conseguir filtrar quando tiver muitos usuarios"*
//   2. *"ordene por ultima mensagem"*
//   3. *"faca o carregamento das conversas como rolagem infinita, trazendo as
//      10 ultimas conversas e incrementando por 10"*
//   4. *"na conversa, traga a foto do usuario como icone das conversas, e faca
//      a imagem ser clicada levando o usuario para o perfil do usuario"*
//
// **O item 2 nao tem isca aqui, e a ausencia e deliberada.** A ordem e do
// SERVIDOR (`coalesce(last_message_at, opened_at)` no `ORDER BY`), e as iscas
// dela leem o SQL compilado, em
// `src/modules/messaging/adapters/persistence/ordem-da-lista-e-a-ultima-mensagem.test.ts`
// e `src/modules/messaging/application/conversation-service.test.ts`. Uma isca
// de tela sobre ordem so poderia provar que a tela NAO reordena -- e esse caso
// ja existe no arquivo vizinho ("a ordem da resposta e a ordem da tela").
//
// **A ISCA QUE MAIS IMPORTA e `a SEGUNDA pagina e buscada pela ROLAGEM`.**
// Provar que a primeira pagina aparece nao prova rolagem infinita nenhuma: a
// tela anterior, com botao, tambem desenhava a primeira. O que distingue as
// duas e a chamada que a rolada dispara, e e ela que o caso mede -- a URL da
// segunda chamada, com o `cursor` que a primeira devolveu.
//
// A bancada (fixtures, servidor de teste e o `GoRouter` de verdade) vem do
// arquivo vizinho, **importada e nao copiada**: duas copias dos fixtures do
// contrato divergem no dia em que um campo mudar, e a que nao foi atualizada
// continua verde sobre um corpo que o servidor nao manda mais.

import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/widgets/barra_de_listagem.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'area_de_mensagens_test.dart'
    show
        ServidorDeConversas,
        abrirAMensagens,
        conversa,
        json200,
        paginaDeConversas,
        problema,
        rolarAteOFim,
        semanticaDaTela,
        textoDaTela;

/// `n` conversas distintas, com nome de pet e de achador proprios.
///
/// Ids de verdade (UUID), porque a isca de identificador do arquivo vizinho
/// varre a tela por eles -- e porque uma chave de lista repetida faria o
/// `ListView` desenhar menos linhas do que recebeu, em silencio.
List<Map<String, dynamic>> conversas(int n, {int de = 1}) =>
    <Map<String, dynamic>>[
      for (var i = de; i < de + n; i++)
        conversa(
          id: '0192f3a1-7b2c-7def-8a01-0000000${(1000 + i)}',
          nomeDoAchador: 'Achador $i',
          nomeDoPet: 'Pet $i',
          previa: 'o recado numero $i',
          ultimaEm: '2026-10-18T13:${(i % 60).toString().padLeft(2, '0')}:00.000Z',
        ),
    ];

/// O endereco de uma tela de perfil que **nao existe nesta arvore**.
///
/// Fora de `/mensagens` de proposito: dentro dela, `/mensagens/<qualquer>`
/// casaria `RotasDeMensagens.conversa` e o toque abriria a TELA DA CONVERSA --
/// a isca ficaria verde com o icone ligado ao lugar errado.
const String rotaDoPerfilDeTeste = '/perfil-de-outra-pessoa';

/// O texto que a tela de destino escreve. A isca procura por ele.
const String marcaDoPerfilDeTeste = 'A TELA DE PERFIL DE TERCEIRO';

GoRoute rotaDoPerfilDeTeste_() => GoRoute(
  path: rotaDoPerfilDeTeste,
  builder: (context, estado) =>
      const Scaffold(body: Center(child: Text(marcaDoPerfilDeTeste))),
);

void main() {
  group('(3) rolagem infinita, de DEZ em DEZ', () {
    testWidgets(
      'ISCA: a SEGUNDA pagina e buscada pela ROLAGEM, com o cursor da primeira',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  paginaDeConversas(
                    conversas(10),
                    proximoCursor: 'cursor-da-pagina-2',
                    total: 23,
                  ),
                );
              }
              if (cursor == 'cursor-da-pagina-2') {
                return json200(
                  paginaDeConversas(
                    conversas(10, de: 11),
                    proximoCursor: 'cursor-da-pagina-3',
                    total: 23,
                  ),
                );
              }
              return json200(paginaDeConversas(conversas(3, de: 21), total: 23));
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        // A PRIMEIRA PAGINA: uma chamada so, e a decima conversa JA ESTA na
        // lista -- mesmo sem estar pintada.
        //
        // **A contagem e por TEXTO e nao por `LinhaDaConversa`**, e a razao foi
        // medida: o `ListView` constroi so o que cabe na tela (sete linhas em
        // 600 x 800 dp), entao `findsNWidgets(10)` reprovaria com as dez na
        // lista. O que importa e QUAL conversa esta na lista, e nao quantos
        // widgets o Flutter resolveu montar.
        expect(servidor.chamadasA('GET /v1/conversations'), hasLength(1));
        expect(textoDaTela(tester), contains('Achador 1  ·  Pet 1'));
        expect(
          textoDaTela(tester),
          isNot(contains('Achador 11')),
          reason: 'a segunda pagina nao foi pedida ainda',
        );

        await rolarAteOFim(tester);

        // ---------------------------------------------------------------
        // ESTA E A ASSERCAO QUE PROVA A ROLAGEM INFINITA.
        //
        // Nao e "a lista cresceu": uma tela que recarregasse a primeira
        // pagina duas vezes tambem cresceria (com itens repetidos, e o
        // `ListView` nao reclama). O que ela mede e a URL da SEGUNDA
        // chamada, e o `cursor` nela.
        // ---------------------------------------------------------------
        final chamadas = servidor.chamadasA('GET /v1/conversations');
        expect(
          chamadas.length,
          greaterThanOrEqualTo(2),
          reason: 'REPROVA: a rolada nao pediu a pagina seguinte. A lista para '
              'de crescer em dez e ninguem recebe erro -- a pessoa so nao tem '
              'o resto. E o defeito que a rolagem infinita tem de nascenca '
              'quando o gatilho nao esta ligado ao controlador da rolagem.',
        );
        expect(
          chamadas[1].url.queryParameters['cursor'],
          'cursor-da-pagina-2',
          reason: 'REPROVA: a segunda chamada nao levou o `cursor` que a '
              'primeira devolveu. Sem ele o servidor responde a PRIMEIRA '
              'pagina de novo, e as mesmas dez conversas entram na lista duas '
              'vezes.',
        );
        expect(
          chamadas[1].url.queryParameters['limit'],
          '10',
          reason: 'REPROVA: o incremento nao e de dez. O numero e do cliente '
              '("incrementando por 10"), e nao escolha de engenharia.',
        );
        // E O CONTEUDO da segunda pagina entrou na lista, logo abaixo de onde
        // a pessoa parou. Procurado por texto e nao por contagem de widgets: o
        // `ListView` so monta o que cabe na tela.
        //
        // **Um PADRAO e nao um nome fixo**: a rolada ate o fim consome o
        // cursor mais de uma vez (a lista cresce, o fim se move, o gatilho
        // dispara de novo), e qual conversa fica na janela depois disso e
        // detalhe do gesto. O que a isca afirma e que ha na tela conversa de
        // ALEM da primeira pagina -- isto e, que a resposta da pagina seguinte
        // entrou na lista em vez de ser descartada.
        expect(
          textoDaTela(tester),
          matches(RegExp(r'Achador (1[1-9]|2[0-3])  ·  Pet')),
          reason: 'REPROVA: a pagina seguinte foi pedida e nao entrou na lista. '
              'A pessoa rola, a chamada sai, e a lista nao muda -- o pior '
              'desfecho possivel, porque nao ha erro para ela ver.',
        );
      },
    );

    testWidgets(
      'ISCA: a primeira pagina pede DEZ, e nao vinte',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(conversas(10), total: 10)),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final primeira = servidor.chamadasA('GET /v1/conversations').first;
        expect(primeira.url.queryParameters['limit'], '10');
        // E `cursor` NAO vai na primeira: `cursor=` reprova com 400.
        expect(primeira.url.queryParameters.containsKey('cursor'), isFalse);
      },
    );

    testWidgets(
      'ISCA: a lista que NAO ROLA tambem cresce -- cursor de pe e tela sobrando',
      (tester) async {
        // DUAS conversas numa tela alta: `maxScrollExtent` fica em zero e nao
        // ha rolada possivel. Sem `_completarATela`, o `cursor` fica guardado
        // para sempre e a lista para em duas com mais vinte no servidor.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  paginaDeConversas(
                    conversas(2),
                    proximoCursor: 'cursor-da-pagina-2',
                    total: 4,
                  ),
                );
              }
              return json200(paginaDeConversas(conversas(2, de: 3), total: 4));
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(
          servidor.chamadasA('GET /v1/conversations').length,
          greaterThanOrEqualTo(2),
          reason: 'REPROVA: a lista nao enche a tela, nao ha o que rolar, e o '
              '`cursor` ficou sem consumidor. A rolagem infinita precisa de um '
              'segundo gatilho para este caso -- o gesto que ela espera nao '
              'existe nesta tela.',
        );
        expect(textoDaTela(tester), contains('Achador 4  ·  Pet 4'));
      },
    );

    testWidgets(
      'a pagina seguinte que FALHA deixa a lista de pe, e oferece Tentar de novo',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  paginaDeConversas(
                    conversas(10),
                    proximoCursor: 'cursor-da-pagina-2',
                    total: 23,
                  ),
                );
              }
              return problema('rate-limited', 429);
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);
        await rolarAteOFim(tester);

        // As dez que ja estavam FICAM: o recorte nao mudou, e apagar tudo
        // porque a pagina seguinte nao chegou puniria quem rolou mais.
        expect(find.byType(LinhaDaConversa), findsWidgets);
        expect(
          textoDaTela(tester),
          contains('Não conseguimos carregar suas mensagens.'),
          reason: 'REPROVA: a rolagem falhou em SILENCIO. A lista simplesmente '
              'para de crescer, e nao ha nada na tela dizendo por que nem '
              'oferecendo outra tentativa.',
        );
      },
    );
  });

  group('(1) a busca da area de mensagens', () {
    testWidgets(
      'ISCA: o termo vai para o SERVIDOR em `q`, e nao filtra na memoria',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              final q = req.url.queryParameters['q'];
              if (q == null) {
                return json200(paginaDeConversas(conversas(10), total: 23));
              }
              return json200(
                paginaDeConversas(<Map<String, dynamic>>[
                  conversa(nomeDoAchador: 'Marina', nomeDoPet: 'Tobias'),
                ], total: 1),
              );
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        await tester.enterText(find.byType(TextField).first, 'marina');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();

        final comTermo = servidor
            .chamadasA('GET /v1/conversations')
            .where((r) => r.url.queryParameters.containsKey('q'))
            .toList();
        expect(
          comTermo, hasLength(1),
          reason: 'REPROVA: a busca nao chegou ao servidor. Filtrar na memoria '
              'aqui olharia so as dez primeiras conversas, que e exatamente o '
              'caso que o pedido ("quando tiver muitos usuarios") existe para '
              'resolver.',
        );
        expect(comTermo.first.url.queryParameters['q'], 'marina');
        expect(find.byType(LinhaDaConversa), findsOneWidget);
      },
    );

    testWidgets(
      'ISCA: o termo novo VOLTA PARA A PRIMEIRA pagina, e nao reusa o cursor',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              if (req.url.queryParameters.containsKey('q')) {
                return json200(
                  paginaDeConversas(conversas(1, de: 50), total: 1),
                );
              }
              final cursor = req.url.queryParameters['cursor'];
              if (cursor == null) {
                return json200(
                  paginaDeConversas(
                    conversas(10),
                    proximoCursor: 'cursor-da-pagina-2',
                    total: 23,
                  ),
                );
              }
              return json200(paginaDeConversas(conversas(10, de: 11), total: 23));
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);
        await rolarAteOFim(tester);

        await tester.enterText(find.byType(TextField).first, 'marina');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();

        final comTermo = servidor
            .chamadasA('GET /v1/conversations')
            .where((r) => r.url.queryParameters.containsKey('q'))
            .toList();
        expect(comTermo, hasLength(1));
        expect(
          comTermo.first.url.queryParameters.containsKey('cursor'),
          isFalse,
          reason: 'REPROVA: a busca nova foi com o `cursor` da lista antiga. '
              'Ele e um endereco DENTRO da ordem do recorte anterior, e a '
              'pagina do termo novo continuaria de um lugar da lista velha.',
        );
        // E a lista anterior nao fica embaixo do resultado novo.
        expect(find.byType(LinhaDaConversa), findsOneWidget);
      },
    );

    testWidgets(
      'uma letra NAO vai: `minLength` do contrato e estado da lupa, nao um 400',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(conversas(3), total: 3)),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        await tester.enterText(find.byType(TextField).first, 'm');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();

        expect(
          servidor
              .chamadasA('GET /v1/conversations')
              .where((r) => r.url.queryParameters.containsKey('q')),
          isEmpty,
          reason: 'REPROVA: uma letra foi para a rota. `ConversationSearch` '
              'declara `minLength: 2`, e a chamada voltaria 400 para a tela '
              'traduzir -- um erro sobre um controle que a pessoa acabou de '
              'usar certo.',
        );
      },
    );

    testWidgets(
      'buscou e nao sobrou nada: a barra FICA, e a frase nao mente',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (req) {
              if (req.url.queryParameters.containsKey('q')) {
                return json200(
                  paginaDeConversas(<Map<String, dynamic>>[], total: 0),
                );
              }
              return json200(paginaDeConversas(conversas(3), total: 3));
            },
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        await tester.enterText(find.byType(TextField).first, 'zzzz');
        await tester.testTextInput.receiveAction(TextInputAction.search);
        await tester.pumpAndSettle();

        expect(find.byType(LinhaDaConversa), findsNothing);
        // A BARRA FICA: tirar o campo aqui prenderia a pessoa num vazio que
        // ela mesma produziu, sem o controle de volta.
        expect(find.byType(BarraDeListagem), findsOneWidget);
        expect(
          textoDaTela(tester),
          contains('Nenhuma conversa com esse termo.'),
          reason: 'REPROVA: o vazio da busca foi escrito como o vazio da '
              'conta. A pessoa TEM mensagens, e dizer "você ainda não tem '
              'mensagens" afirma o contrario do que e verdade.',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('Você ainda não tem mensagens.')),
        );
      },
    );

    testWidgets(
      'ISCA: a linha de resumo le o `total` do servidor, e nao o tamanho da pagina',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(
                conversas(10),
                proximoCursor: 'cursor-da-pagina-2',
                total: 57,
              ),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(
          textoDaTela(tester),
          contains('57 conversas'),
          reason: 'REPROVA: a linha de resumo mostrou o tamanho da PAGINA. Ela '
              'diria 10 a quem tem 57, e a pessoa leria que a busca nao achou '
              'o resto.',
        );
      },
    );
  });

  group('(4) o icone da conversa: sem foto, e com um ponto unico de toque', () {
    tearDown(PortaDoPerfilDoParticipante.soltar);

    testWidgets(
      'ISCA: NENHUMA imagem quando a resposta nao traz foto (nao-conexao)',
      (tester) async {
        // **ESTE CASO MUDOU DE NOME E DE MOTIVO EM 19/10/2026, e nao de
        // comportamento.** Ele dizia "o contrato nao manda foto de terceiro", e
        // isso deixou de ser verdade: a emenda 3 do ADR-0010 abriu a foto entre
        // CONEXOES ACEITAS, por decisao do cliente. O que ele mede continua
        // valendo e importa MAIS que antes -- `conversas(3)` nao traz
        // `photo_icon_url`, que e o corpo da conversa de achado com um
        // estranho, e ali a tela nao pode desenhar imagem nenhuma.
        //
        // O contrapeso dele vive em `foto_na_conversa_test.dart`: sem aquele
        // arquivo, este passaria num mundo em que a foto nunca aparece.
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) =>
                json200(paginaDeConversas(conversas(3), total: 3)),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(
          find.byType(Image),
          findsNothing,
          reason: 'REPROVA: a lista desenhou imagem para quem NAO e conexao '
              'aceita. `photo_icon_url` veio nulo nas tres conversas, e nulo e '
              'o estado do estranho que escaneou a plaquinha -- a tela nao tem '
              'de onde tirar foto ali, e uma imagem desenhada so poderia ter '
              'sido inventada. E o golpe do falso achador que esta ausencia '
              'protege.',
        );
        expect(find.byType(CircleAvatar), findsNothing);
        expect(find.byType(FadeInImage), findsNothing);
      },
    );

    testWidgets(
      'SEM destino o icone NAO e um controle, e nao se anuncia como um',
      (tester) async {
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(nomeDoAchador: 'Marina'),
              ], total: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        expect(
          semanticaDaTela(tester),
          isNot(contains('Abrir o perfil de Marina')),
          reason: 'REPROVA: o icone se anuncia como porta do perfil sem haver '
              'perfil. Um toque que termina em nada e o que o criterio 2 da '
              'BICHUS-62 proibe, e um aviso de "em breve" e o mesmo beco com '
              'uma frase em cima.',
        );
        expect(semanticaDaTela(tester), contains('Marca de Marina'));
      },
    );

    testWidgets(
      'ISCA: COM destino, o toque no icone navega -- e o ponto unico decide',
      (tester) async {
        // ESTA E A LINHA DA MESCLA. `PortaDoPerfilDoParticipante.destino` e o
        // unico lugar que a frente do perfil precisa alcancar: com ela ligada,
        // o toque, o rotulo acessivel e o alvo de 48 dp ja estao de pe.
        PortaDoPerfilDoParticipante.destino = (outro) => rotaDoPerfilDeTeste;

        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(nomeDoAchador: 'Marina'),
              ], total: 1),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotasExtra: <RouteBase>[rotaDoPerfilDeTeste_()],
        );

        expect(
          semanticaDaTela(tester),
          contains('Abrir o perfil de Marina'),
          reason: 'REPROVA: com destino, o icone continuou decorativo. O rotulo '
              'diz o que o toque ABRE, e sem ele o circulo e mudo para quem nao '
              've a tela.',
        );

        // O TOQUE NO ICONE NAO ABRE A CONVERSA: sao dois destinos na mesma
        // linha, e o do icone e o de dentro.
        await tester.tap(find.byType(MarcaNeutraDoParticipante));
        await tester.pumpAndSettle();

        expect(
          find.byType(LinhaDaConversa),
          findsNothing,
          reason: 'REPROVA: o toque no icone nao saiu da lista. Com o `InkWell` '
              'da linha capturando o gesto, o icone vira um pedaco da conversa '
              'e o perfil fica inalcancavel.',
        );
        expect(
          textoDaTela(tester),
          contains(marcaDoPerfilDeTeste),
          reason: 'REPROVA: o toque no icone nao abriu o destino que o ponto '
              'unico declarou. O destino do icone e o perfil; o da linha e a '
              'conversa, e eles nao sao o mesmo lugar.',
        );
        expect(
          textoDaTela(tester),
          isNot(contains('Escreva uma mensagem')),
          reason: 'REPROVA: o toque no icone abriu A CONVERSA.',
        );
      },
    );

    testWidgets(
      'o alvo de toque do icone tem 48 dp, mesmo com a marca de 40',
      (tester) async {
        PortaDoPerfilDoParticipante.destino = (_) => rotaDoPerfilDeTeste;

        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[conversa()], total: 1),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotasExtra: <RouteBase>[rotaDoPerfilDeTeste_()],
        );

        final alvo = tester.getSize(
          find.descendant(
            of: find.byType(MarcaNeutraDoParticipante),
            matching: find.byType(InkWell),
          ),
        );
        expect(alvo.width, greaterThanOrEqualTo(48));
        expect(alvo.height, greaterThanOrEqualTo(48));
      },
    );
  });
}
