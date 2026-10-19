// AS ISCAS DA FOTO NA CONVERSA, E DO TOQUE QUE LEVA AO PERFIL.
//
// ===========================================================================
// A DECISAO, E O CONFLITO QUE ELA RESOLVEU
// ===========================================================================
//
// O cliente pediu em 18/10/2026: *"na conversa, traga a foto do usuario como
// icone das conversas, e faca a imagem ser clicada levando o usuario para o
// perfil do usuario"*. A frente de mensagens RECUSOU a foto, e estava certa --
// o contrato a proibia por extenso em dois pontos, o ADR-0025 decisao 2
// reforcava, e o desenho da frente de perfil recusava esta superficie por nome
// (*"o avatar nao entra na conversa mediada, e eu recomendo que nao entre
// nunca"*), pelo risco do golpe do falso achador.
//
// O conflito foi levado ao cliente com as tres citacoes. A decisao, de
// 19/10/2026:
//
//   > "a foto aparece SO quando as duas pessoas ja aceitaram conexao"
//
// **E emenda deliberada, e nao revogacao**: o motivo da regra continua
// protegido, porque e exatamente onde a foto nao entra. Quem avisa que achou um
// pet pode nao ter conta, e a conversa e o canal que atravessa o bloqueio.
//
// ===========================================================================
// O QUE ESTE ARQUIVO MEDE, E O QUE ELE NAO CONSEGUE MEDIR
// ===========================================================================
//
// Ele mede a TELA, e a tela nao decide quem pode ver: ela desenha o que veio.
// O recorte mora na clausula `WHERE` da consulta do servidor (ADR-0021), e as
// iscas DELE sao outras duas:
//
//   - `src/modules/messaging/adapters/persistence/conexao-aceita-na-clausula-where.test.ts`
//     le o SQL compilado e prova ONDE o predicado mora;
//   - `tests/integration/foto-na-conversa-entre-conexoes.test.ts` mede o CORPO
//     real da resposta nos cinco estados, contra Postgres de verdade.
//
// Entao o que fica aqui e o que so a tela pode errar: desenhar foto que nao
// veio, nao desenhar a que veio, desenhar com `Image.network` cru (sem
// `cacheWidth`), e levar o toque para o lugar errado.
//
// ===========================================================================
// POR QUE A BANCADA E A DO ARQUIVO VIZINHO, IMPORTADA
// ===========================================================================
//
// Duas copias dos fixtures do contrato divergem no dia em que um campo mudar, e
// a que nao foi atualizada continua verde sobre um corpo que o servidor nao
// manda mais. `participante`, `conversa` e `paginaDeConversas` ganharam
// `handle` e `photo_icon_url` em `area_de_mensagens_test.dart`, com NULO por
// padrao -- o estado normal.
//
// ===========================================================================
// A FIACAO DO DESTINO E A DE PRODUCAO, e nao uma inventada aqui
// ===========================================================================
//
// `PortaDoPerfilDoParticipante.destino` e um campo estatico, e a tentacao e
// liga-lo nos casos com um lambda de teste. Isso mediria o toque e **nao
// mediria a fiacao**: o produto ficaria com o destino nulo e todos os casos
// aqui verdes. Entao os casos chamam `ligarPortaDoPerfilDoParticipante()`, que
// e a funcao que `criarRoteador` chama -- e o destino medido e
// `Rotas.perfilDe`, o de verdade.

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/auth_api.dart';
import 'package:bichu/api/modelos_conversa.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/sessao/controlador_de_sessao.dart';
import 'package:bichu/sessao/deposito_de_sessao.dart';
import 'package:bichu/telas/mensagens/area_de_mensagens.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart' show urlBaseDeTeste;
import 'area_de_mensagens_test.dart'
    show
        ServidorDeConversas,
        abrirAMensagens,
        conversa,
        json200,
        paginaDeConversas,
        semanticaDaTela,
        textoDaTela;

/// A URL da derivada `thumb`, como o servidor a monta.
///
/// `-176` no nome de propósito: e por ele que o caso da derivada reprova
/// quando alguem trocar `thumb_key` pela `card` de 512 no servidor.
const String urlDaFoto = 'https://midia.bichu.test/thumb/marina-176.jpg';
const String apelidoDaMarina = 'marina-vet';

/// A tela de perfil DE VERDADE nao entra nesta bancada.
///
/// `Rotas.perfilDe` devolve `/pessoa/<apelido>`, e o destino existe de verdade
/// na arvore desde a mescla de 19/10. Montar `TelaDePerfilDePessoa` aqui
/// exigiria `Escopo`, `PessoasApi`, `SegurancaApi` e sessao -- isto e, uma
/// segunda bancada inteira, para medir uma coisa que nao e desta tela.
///
/// Esta rota tem o MESMO caminho (`Rotas.perfilDePessoa`) e desenha o apelido
/// recebido. Assim o caso prova as duas metades que importam: que o toque
/// chegou naquele endereco, e que o APELIDO que chegou e o da pessoa certa --
/// que e a parte que um destino constante nao mediria.
GoRoute rotaDoPerfilNaArvore() => GoRoute(
  path: Rotas.perfilDePessoa,
  builder: (context, estado) => Scaffold(
    body: Text(
      'perfil aberto: ${estado.pathParameters[Rotas.parametroDoApelido]}',
    ),
  ),
);

void main() {
  group('(1) a foto SO aparece quando a resposta a traz', () {
    tearDown(PortaDoPerfilDoParticipante.soltar);

    testWidgets(
      'ISCA (a): NAO-CONEXAO nao desenha imagem, e desenha a inicial',
      (tester) async {
        // O corpo e o da conversa de achado com um estranho: os dois campos
        // nulos. Medido no servidor em
        // `tests/integration/foto-na-conversa-entre-conexoes.test.ts`.
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
          find.byType(ImagemDaRede),
          findsNothing,
          reason:
              'REPROVA: a tela desenhou foto para quem NAO e conexao '
              'aceita. `photo_icon_url` veio nulo, e nulo e o estado do '
              'estranho que escaneou a plaquinha -- a foto nao entra ali, e e '
              'exatamente ali que o golpe do falso achador mora.',
        );
        expect(
          find.byType(Image),
          findsNothing,
          reason:
              'REPROVA: ha uma `Image` na tela sem foto nenhuma na '
              'resposta. Se ela nao e `ImagemDaRede`, e `Image.network` cru -- '
              'sem `cacheWidth` e sem `errorBuilder`.',
        );
        // CONTRAPESO DO PROPRIO CASO: a inicial continua desenhada. Sem ele, o
        // `findsNothing` acima passaria numa tela que nao desenha linha nenhuma
        // -- e `findsNothing` sobre uma tela vazia e o portao cego classico.
        expect(
          find.text('M'),
          findsOneWidget,
          reason:
              'REPROVA: sem foto, a marca neutra (a inicial) tambem nao '
              'apareceu. Entao a lista nao desenhou a linha, e o caso acima '
              'nao mediu nada.',
        );
      },
    );

    testWidgets('ISCA (c): CONEXAO ACEITA desenha a foto, por `ImagemDaRede`', (
      tester,
    ) async {
      // **O CONTRAPESO DE TODO O ARQUIVO.** Sem este caso, todos os
      // `findsNothing` acima passariam num mundo em que a foto nunca aparece
      // -- que e a forma mais facil de um portao de omissao ficar verde sem
      // ter medido nada.
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations': (_) => json200(
            paginaDeConversas(<Map<String, dynamic>>[
              conversa(
                nomeDoAchador: 'Marina',
                apelidoDoAchador: apelidoDaMarina,
                fotoDoAchador: urlDaFoto,
              ),
            ], total: 1),
          ),
        },
      );
      await abrirAMensagens(tester, servidor: servidor);

      final imagens = tester.widgetList<ImagemDaRede>(
        find.byType(ImagemDaRede),
      );
      expect(
        imagens.length,
        1,
        reason:
            'REPROVA: a conexao aceita trouxe `photo_icon_url` e a tela '
            'nao desenhou a foto, ou desenhou mais de uma -- o PROPRIO lado '
            'nao tem foto, e duas imagens aqui seriam a foto de quem chama '
            'servida de volta a ele.',
      );
      expect(imagens.first.url, urlDaFoto);
    });

    testWidgets(
      'ISCA: a foto passa por `ImagemDaRede` com a LARGURA PINTADA (40 dp)',
      (tester) async {
        // **A MEDICAO QUE DECIDE O CUSTO EM MEMORIA.** O `ui.Image` custa
        // `largura x altura x 4` bytes da imagem DECODIFICADA, e nao os bytes
        // do JPEG: sem `cacheWidth` uma derivada de 512 px custa 1 MiB por
        // linha, e dez linhas sao 10 MiB -- o defeito dos 9,8 MB da `Loja`.
        // `ImagemDaRede` existe por essa medicao (88 MiB contra 2,15 MiB numa
        // pagina), e este caso prova que ela e quem pinta.
        //
        // O numero medido aqui e a LARGURA, em dp, porque e ela que
        // `ImagemDaRede` multiplica pelo fator de pixel do aparelho. 40 dp a 3x
        // sao 120 px, e e por isso que a derivada servida e a `thumb` de 176 e
        // nao a `card` de 512 (4,27x) nem a de 320 da vitrine (2,67x).
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(
                  apelidoDoAchador: apelidoDaMarina,
                  fotoDoAchador: urlDaFoto,
                ),
              ], total: 1),
            ),
          },
        );
        await abrirAMensagens(tester, servidor: servidor);

        final imagem = tester.widget<ImagemDaRede>(find.byType(ImagemDaRede));
        expect(
          imagem.largura,
          40,
          reason:
              'REPROVA: a largura pintada deixou de ser 40 dp. Ou a celula '
              'mudou de tamanho -- e entao a DERIVADA do servidor precisa ser '
              'medida de novo --, ou a tela passou a desenhar sem dizer a '
              'largura, e `ImagemDaRede` cairia na largura do pai.',
        );
        expect(imagem.proporcao, 1, reason: 'o icone e quadrado (1:1)');
        expect(
          imagem.raio,
          20,
          reason:
              'o icone e um CIRCULO: metade do lado. Com outro raio ele '
              'deixa de casar com a marca neutra que ele substitui.',
        );
        expect(
          imagem.descricao,
          isNull,
          reason:
              'REPROVA: a imagem ganhou rotulo proprio. O nome acessivel do '
              'icone e do controle de fora, e um rotulo aqui faria o leitor de '
              'tela anunciar a mesma pessoa duas vezes na mesma parada de foco.',
        );
        expect(
          imagem.simboloDeFalha,
          Icons.person_outline,
          reason:
              'o retrato de uma pessoa falhando pede outro desenho que uma '
              'fachada falhando',
        );
      },
    );

    testWidgets(
      'ISCA (e): PAR BLOQUEADO chega sem foto e sem apelido: nada a desenhar',
      (tester) async {
        // O corpo medido do par bloqueado (integracao): os dois campos nulos,
        // com a conversa em 200 -- ela ATRAVESSA o bloqueio, de proposito.
        // Entao a tela recebe uma conversa viva e, nela, nada de pessoa.
        //
        // **A fiacao de producao esta LIGADA neste caso**, e isso e o ponto: nao
        // e "a tela nao tem destino porque ninguem ligou", e "a tela nao tem
        // destino porque o apelido veio nulo".
        ligarPortaDoPerfilDoParticipante();
        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(estado: 'blocked', nomeDoAchador: 'Carlos'),
              ], total: 1),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotasExtra: <RouteBase>[rotaDoPerfilNaArvore()],
        );

        expect(find.byType(ImagemDaRede), findsNothing);
        expect(
          semanticaDaTela(tester),
          isNot(contains('Abrir o perfil de')),
          reason:
              'REPROVA: o icone se anuncia como porta do perfil num par '
              'bloqueado. Com o apelido nulo nao ha para onde ir, e um botao '
              'que nao leva a lugar nenhum e o toque sem desfecho que o '
              'criterio 2 da BICHUS-62 proibe.',
        );
        // CONTRAPESO: a semantica NAO esta vazia. `isNot(contains(...))` sobre
        // uma arvore de semantica vazia passa sempre, e esse foi um dos cinco
        // portoes cegos achados nesta rodada.
        expect(
          semanticaDaTela(tester),
          contains('Marca de Carlos'),
          reason:
              'REPROVA: a semantica da tela nao tem nem a marca neutra. '
              'Entao ela esta vazia, e o `isNot(contains(...))` acima nao mede '
              'nada.',
        );
      },
    );
  });

  group('(2) o toque na foto leva ao perfil DAQUELA pessoa', () {
    tearDown(PortaDoPerfilDoParticipante.soltar);

    testWidgets(
      'ISCA (d): o toque abre `/pessoa/<apelido>` daquela pessoa, e nao a conversa',
      (tester) async {
        // A FIACAO DE PRODUCAO, e nao um lambda de teste: e
        // `ligarPortaDoPerfilDoParticipante` que `criarRoteador` chama. Com um
        // lambda aqui, este caso ficaria verde e o app ficaria com o destino
        // nulo -- que e exatamente o estado que a mescla existia para desfazer.
        ligarPortaDoPerfilDoParticipante();

        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[
                conversa(
                  nomeDoAchador: 'Marina',
                  apelidoDoAchador: apelidoDaMarina,
                  fotoDoAchador: urlDaFoto,
                ),
              ], total: 1),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotasExtra: <RouteBase>[rotaDoPerfilNaArvore()],
        );

        expect(
          semanticaDaTela(tester),
          contains('Abrir o perfil de Marina'),
          reason:
              'REPROVA: com apelido e foto na resposta, o icone continuou '
              'decorativo. O rotulo diz o que o toque ABRE, e sem ele o circulo '
              'e mudo para quem nao ve a tela.',
        );

        await tester.tap(find.byType(MarcaNeutraDoParticipante));
        await tester.pumpAndSettle();

        expect(
          textoDaTela(tester),
          contains('perfil aberto: $apelidoDaMarina'),
          reason:
              'REPROVA: o toque na foto nao abriu o perfil DAQUELA pessoa. '
              'O apelido no caminho e o que distingue "abriu um perfil" de '
              '"abriu O perfil certo" -- um destino constante passaria pelos '
              'dois.',
        );
        expect(
          find.byType(LinhaDaConversa),
          findsNothing,
          reason:
              'REPROVA: o toque no icone nao saiu da lista. Com o `InkWell` '
              'da linha capturando o gesto, o icone vira um pedaco da conversa '
              'e o perfil fica inalcancavel.',
        );
      },
    );

    testWidgets(
      'ISCA (d): o toque leva ao apelido do OUTRO, e nunca ao de quem chama',
      (tester) async {
        // O defeito que este caso pega: a tela le o apelido do item errado de
        // `participants`. Os dois lados vem com apelido aqui -- o que nao
        // acontece em producao, de proposito --, e so UM deles pode sair.
        //
        // Com o item errado, o tutor tocaria na foto da Marina e abriria o
        // perfil DELE mesmo, que e o defeito que `AvatarDaConta` ja tinha a
        // forma de produzir (a mesma rota, o destino errado).
        ligarPortaDoPerfilDoParticipante();
        final corpo = conversa(
          nomeDoAchador: 'Marina',
          apelidoDoAchador: apelidoDaMarina,
          fotoDoAchador: urlDaFoto,
        );
        final lados = corpo['participants'] as List<Map<String, dynamic>>;
        lados[0]['handle'] = 'leandro-tutor';
        lados[0]['photo_icon_url'] =
            'https://midia.bichu.test/thumb/eu-176.jpg';

        final servidor = ServidorDeConversas(
          <String, http.Response Function(http.Request)>{
            'GET /v1/conversations': (_) => json200(
              paginaDeConversas(<Map<String, dynamic>>[corpo], total: 1),
            ),
          },
        );
        await abrirAMensagens(
          tester,
          servidor: servidor,
          rotasExtra: <RouteBase>[rotaDoPerfilNaArvore()],
        );

        await tester.tap(find.byType(MarcaNeutraDoParticipante));
        await tester.pumpAndSettle();

        expect(
          textoDaTela(tester),
          contains('perfil aberto: $apelidoDaMarina'),
        );
        expect(
          textoDaTela(tester),
          isNot(contains('leandro-tutor')),
          reason:
              'REPROVA: o toque abriu o perfil de QUEM CHAMA. A linha da '
              'lista desenha o OUTRO lado, e o destino tem de ser o dele.',
        );
      },
    );

    testWidgets('ISCA: CONEXAO SEM APELIDO traz a foto e NAO oferece toque', (
      tester,
    ) async {
      // Estado real: nenhum fluxo obriga a escolher apelido (plano 4-C.8).
      // Entao `photo_icon_url` vem e `handle` nao -- e o icone tem de
      // desenhar a foto e continuar DECORATIVO. Um destino montado com nulo
      // abriria `/pessoa/null`.
      ligarPortaDoPerfilDoParticipante();
      final servidor = ServidorDeConversas(
        <String, http.Response Function(http.Request)>{
          'GET /v1/conversations': (_) => json200(
            paginaDeConversas(<Map<String, dynamic>>[
              conversa(nomeDoAchador: 'Marina', fotoDoAchador: urlDaFoto),
            ], total: 1),
          ),
        },
      );
      await abrirAMensagens(
        tester,
        servidor: servidor,
        rotasExtra: <RouteBase>[rotaDoPerfilNaArvore()],
      );

      expect(
        find.byType(ImagemDaRede),
        findsOneWidget,
        reason: 'a foto veio, e ela nao depende do apelido para ser desenhada',
      );
      expect(
        semanticaDaTela(tester),
        isNot(contains('Abrir o perfil de Marina')),
        reason:
            'REPROVA: o icone se anuncia como porta do perfil sem apelido. '
            'O destino seria `/pessoa/` ou `/pessoa/null`.',
      );
      expect(semanticaDaTela(tester), contains('Marca de Marina'));
    });
  });

  group('(3) a fiacao do destino, medida fora da tela', () {
    tearDown(PortaDoPerfilDoParticipante.soltar);

    test('ISCA: a porta nasce SEM destino, e e isso que a fiacao desfaz', () {
      // Sem este caso, o caso seguinte passaria por o destino ja estar ligado
      // por outro teste do mesmo processo -- `destino` e estado GLOBAL, e
      // estado global compartilhado entre casos e como uma isca de fiacao fica
      // verde sem a fiacao.
      PortaDoPerfilDoParticipante.soltar();
      expect(
        PortaDoPerfilDoParticipante.destino(
          const ParticipanteDaConversa(
            role: PapelNaConversa.achador,
            displayName: 'Marina',
            handle: apelidoDaMarina,
          ),
        ),
        isNull,
        reason:
            'REPROVA: a porta tem destino antes de alguem ligar. Entao a '
            'fiacao nao e o que produz o destino, e o caso seguinte nao mede '
            'nada.',
      );
    });

    test('ISCA: `ligarPortaDoPerfilDoParticipante` produz `Rotas.perfilDe`', () {
      ligarPortaDoPerfilDoParticipante();
      expect(
        PortaDoPerfilDoParticipante.destino(
          const ParticipanteDaConversa(
            role: PapelNaConversa.achador,
            displayName: 'Marina',
            handle: apelidoDaMarina,
          ),
        ),
        '/pessoa/$apelidoDaMarina',
        reason:
            'REPROVA: a fiacao nao produz o endereco do perfil de terceiro. '
            'O valor esperado sai de `Rotas.perfilDe`, que e o ponto unico da '
            'frente de perfil.',
      );
    });

    test('ISCA: apelido NULO e apelido VAZIO nao viram endereco', () {
      // `Rotas.perfilDe('')` devolve `/pessoa/`, que e a rota de outra coisa, e
      // `/pessoa/null` nao existe. Os dois tem de ser nulo aqui.
      ligarPortaDoPerfilDoParticipante();
      for (final apelido in <String?>[null, '']) {
        expect(
          PortaDoPerfilDoParticipante.destino(
            ParticipanteDaConversa(
              role: PapelNaConversa.achador,
              displayName: 'Marina',
              handle: apelido,
            ),
          ),
          isNull,
          reason:
              'REPROVA: o apelido ${apelido == null ? "nulo" : "vazio"} '
              'virou endereco.',
        );
      }
    });

    test('ISCA: `criarRoteador` liga a porta, e nao so a funcao avulsa', () {
      // **A funcao certa ligada por ninguem nao liga nada.** Este caso prova
      // que o caminho de PRODUCAO passa por ela: `criarRoteador` e o que
      // `app.dart` chama, e sem este caso a fiacao poderia existir, estar
      // correta, e nunca ser executada -- que e o estado em que o app subiria
      // com o icone decorativo e todos os outros casos deste arquivo verdes.
      //
      // A sessao e a bancada minima de `captura_de_localizacao_test.dart`: um
      // `AuthApi` sobre `MockClient` e o deposito em memoria. `criarRoteador`
      // nao a consulta -- ela e `refreshListenable` e entra no `redirect` --, e
      // por isso nao ha estado de sessao a preparar aqui.
      PortaDoPerfilDoParticipante.soltar();
      AppConfig.limparParaTeste();
      final api = ApiClient(
        config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
        cliente: MockClient((_) async => http.Response('{}', 200)),
      );
      addTearDown(api.fechar);
      final sessao = ControladorDeSessao(
        auth: AuthApi(api),
        deposito: DepositoEmMemoria(),
      );
      addTearDown(sessao.dispose);
      final roteador = criarRoteador(sessao);
      addTearDown(roteador.dispose);
      expect(
        PortaDoPerfilDoParticipante.destino(
          const ParticipanteDaConversa(
            role: PapelNaConversa.achador,
            displayName: 'Marina',
            handle: apelidoDaMarina,
          ),
        ),
        '/pessoa/$apelidoDaMarina',
        reason:
            'REPROVA: `criarRoteador` nao liga a porta. A funcao de fiacao '
            'existe e ninguem a chama, e o app sobe com o icone decorativo.',
      );
    });
  });

  group('(4) o modelo le os dois campos novos do contrato', () {
    test('ISCA: `handle` e `photo_icon_url` chegam do JSON', () {
      final p = ParticipanteDaConversa.doJson(<String, dynamic>{
        'role': 'finder',
        'display_name': 'Marina',
        'handle': apelidoDaMarina,
        'photo_icon_url': urlDaFoto,
      });
      expect(p?.handle, apelidoDaMarina);
      expect(p?.photoIconUrl, urlDaFoto);
    });

    test('ISCA: AUSENTES e VAZIOS caem no mesmo nulo', () {
      // Resposta de servidor antigo (campos ausentes) e resposta de
      // nao-conexao (campos nulos) querem a mesma tela. E `''` tambem: uma
      // string vazia chegando em `ImagemDaRede` faria `Image.network('')`
      // LANCAR dentro da lista de conversas.
      final ausentes = ParticipanteDaConversa.doJson(<String, dynamic>{
        'role': 'finder',
        'display_name': 'Marina',
      });
      expect(ausentes?.handle, isNull);
      expect(ausentes?.photoIconUrl, isNull);

      final vazios = ParticipanteDaConversa.doJson(<String, dynamic>{
        'role': 'finder',
        'display_name': 'Marina',
        'handle': '',
        'photo_icon_url': '',
      });
      expect(vazios?.handle, isNull);
      expect(vazios?.photoIconUrl, isNull);
    });
  });
}
