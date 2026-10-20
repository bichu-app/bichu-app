// **ISCA (a): publicar grava e aparece. ISCA (d): a foto segue o padrao.**
//
// ===========================================================================
// O PEDIDO, LITERAL, E O QUE ESTE ARQUIVO MEDE
// ===========================================================================
// Cliente, 20/10/2026: *"na secao do mural, nao tem a caixa de texto para o
// usuario escrever uma mensagem, subir uma foto e publicar o conteudo."*
//
// Tres coisas, e cada uma tem caso aqui: a caixa de texto existe e o que ela
// digita CHEGA no corpo da requisicao; a foto sobe na ESCOLHA; e o `Publicar`
// e a UNICA confirmacao.
//
// ===========================================================================
// O PADRAO DE FOTO E DECISAO DELE DE 19/10/2026, E ELE RELATOU O DEFEITO DUAS
// VEZES
// ===========================================================================
// *"quando o usuario fizer o upload de qualquer foto no app, voce deve fazer o
// upload e apresentar como vai ficar de preview, e ao salvar o voce salva a
// foto"*.
//
//   escolher -> **envia na hora** -> previa do arquivo LOCAL -> `Publicar`
//   confirma.
//
// **NAO HA BOTAO SEPARADO DE SALVAR FOTO.** O caso (d3) conta os
// `BotaoPrimario` por subarvore e reprova o terceiro, que e a forma que o
// defeito tomaria.
//
// ===========================================================================
// A BANCADA USA A PORTA DE VERDADE (`MuralApi` sobre `ApiClient`)
// ===========================================================================
// Um duble de `EscritaDoMural` responderia igual para qualquer rota, e o caso
// (d2) -- "a intencao saiu pela rota da PUBLICACAO, e nao pela da vitrine nem
// pela da capa de evento" -- nao teria o que observar: a troca que este
// repositorio ja pagou em 19/10 foi de FUNCAO, com assinatura IDENTICA, e so a
// requisicao que sai a denuncia.

import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/mural_api.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/mural/publicar_no_mural.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

/// O host do armazenamento assinado. **Outro host de proposito**: e o que prova
/// que os bytes nao saem pela `ApiClient`, que anexaria o token da sessao a um
/// endereco vindo do corpo de uma resposta.
const String armazenamentoDoMural = 'https://armazenamento.exemplo/mural';

const String uploadDoMural = '018f7c1e-cccc-7c3d-9e4f-0000000000cc';

/// A rede do Mural: a intencao, o armazenamento e a escrita.
///
/// **404 em qualquer outra rota.** A rota da vitrine
/// (`/me/showcase/photo-intents`) e a da capa do evento NAO estao declaradas
/// aqui, entao a tela que as chamasse levaria 404 -- e os `expect` por caminho
/// dizem qual foi a troca em vez de deixar "o envio falhou".
Future<http.Response> Function(http.Request) redeDoPublicar({
  required List<http.Request> capturado,
  Future<http.Response> Function()? respostaDoArmazenamento,
  http.Response Function()? respostaDoPost,
}) {
  return (req) async {
    capturado.add(req);
    if (req.url.toString().startsWith(armazenamentoDoMural)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path == '/v1/me/publications/photo-intents' &&
        req.method == 'POST') {
      return json200(
        <String, dynamic>{
          'upload_id': uploadDoMural,
          'method': 'POST',
          'url': armazenamentoDoMural,
          'fields': <String, String>{'key': 'people/original/abc'},
          'max_bytes': 5 * 1024 * 1024,
        },
        status: 201,
      );
    }
    if (req.url.path == '/v1/me/publications' && req.method == 'POST') {
      final resposta = respostaDoPost;
      if (resposta != null) return resposta();
      final pedido = jsonDecode(req.body) as Map<String, dynamic>;
      return json200(
        <String, dynamic>{
          'ref': 'AaBbCcDdEeFfGgHhIiJjKk',
          'body': pedido['body'],
          'created_at': '2026-10-20T12:00:00.000Z',
          'image': pedido['upload_id'] == null
              ? null
              : <String, dynamic>{
                  'upload_id': pedido['upload_id'],
                  'status': 'processing',
                  'url': null,
                  'rejection_reason': null,
                  'alt_text': pedido['alt_text'],
                },
        },
        status: 201,
      );
    }
    return problema('not-found', 404);
  };
}

/// Os `POST /v1/me/publications` que sairam, com o corpo decodificado.
List<Map<String, dynamic>> postsDePublicacao(List<http.Request> capturado) =>
    capturado
        .where((p) => p.url.path == '/v1/me/publications' && p.method == 'POST')
        .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
        .toList();

Iterable<http.Request> doCaminho(List<http.Request> capturado, String fim) =>
    capturado.where((p) => p.url.path.endsWith(fim));

Iterable<http.Request> aoArmazenamento(List<http.Request> capturado) =>
    capturado.where((p) => p.url.toString().startsWith(armazenamentoDoMural));

/// O campo pelo ROTULO, e nao pelo texto desenhado.
///
/// **`find.text` nao serve aqui**, e descobrir isso valeu o caso: `BichuField`
/// com `opcional: true` desenha `'<rotulo> (opcional)'`, entao
/// `find.text('Descricao da foto')` acha ZERO -- e o caso reprovaria dizendo
/// que o campo nao nasceu, quando ele nasceu com outro texto. E a forma que
/// `registrar_achado_dois_passos_test.dart` e `cep_nos_dois_formularios_test.dart`
/// ja usam nesta casa.
Finder campoChamado(String rotulo) =>
    find.byWidgetPredicate((w) => w is BichuField && w.rotulo == rotulo);

/// Quantas vezes a tela publicou de verdade, para a isca do `aoPublicar`.
int publicacoesAvisadas = 0;

Future<List<http.Request>> montarOPublicar(
  WidgetTester tester, {
  required CameraEGaleria camera,
  Future<http.Response> Function()? respostaDoArmazenamento,
  http.Response Function()? respostaDoPost,
}) async {
  AppConfig.limparParaTeste();
  publicacoesAvisadas = 0;

  // **UMA JANELA ALTA, e ela e condicao do que estes casos medem.**
  //
  // A tela e um `ListView`, e `ListView` **nao constroi o que esta fora da
  // viewport**. Na janela padrao do teste (800 dp de altura) o `Publicar` fica
  // abaixo da dobra depois que a foto entra, e `find.widgetWithText` nao acha
  // um widget que nao existe na arvore -- o caso reprovaria com "could not
  // find any matching widgets" e pareceria que o botao sumiu da tela.
  //
  // Medido: foi exatamente assim que cinco casos deste arquivo reprovaram na
  // primeira execucao. A janela alta constroi a tela inteira, e e isso que faz
  // a CONTAGEM de `BotaoPrimario` do caso "nao ha botao separado de salvar
  // foto" valer -- numa janela curta ela contaria so o que caiu na dobra.
  tester.view.physicalSize = const Size(420, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final capturado = <http.Request>[];
  final cliente = MockClient(
    redeDoPublicar(
      capturado: capturado,
      respostaDoArmazenamento: respostaDoArmazenamento,
      respostaDoPost: respostaDoPost,
    ),
  );
  // **Um token de verdada, por funcao.** Sem ele `ApiClient` nao anexa
  // `Authorization`, e as duas rotas exigem conta -- o caso mediria a tela
  // respondendo 401 em vez de a tela gravando.
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-medicao',
  );
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: PublicarNoMural(
        escrita: MuralApi(api),
        camera: camera,
        envio: EnvioDeFoto(camera: camera, cliente: cliente),
        aoPublicar: () => publicacoesAvisadas += 1,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return capturado;
}

void main() {
  // =========================================================================
  // (a) A CAIXA DE TEXTO EXISTE, E O QUE ELA DIGITA CHEGA NO CORPO
  // =========================================================================

  testWidgets(
      'ISCA (a) — o texto digitado CHEGA no corpo do `POST /me/publications`',
      (tester) async {
    // ISCA: em `PublicarNoMural._publicar`, trocar `_texto.text.trim()` por uma
    // constante, ou apagar o `BichuField` do corpo. Este caso reprova pelo nome
    // na leitura do corpo.
    //
    // **Ele le o CORPO da requisicao**, e nao a tela: nenhum portao deste
    // repositorio confere corpo de resposta nem de requisicao, e e no corpo que
    // o pedido do cliente se cumpre ou nao.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.enterText(
      find.byType(TextField),
      'o Bidu no parque hoje, finalmente sol',
    );
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    final posts = postsDePublicacao(capturado);
    expect(posts, hasLength(1));
    expect(posts.single['body'], 'o Bidu no parque hoje, finalmente sol');
    // **Texto puro nao manda `upload_id` nem `alt_text`**: o caso comum e
    // barato, e `alt_text` sem foto e `400` no servidor.
    expect(posts.single.containsKey('upload_id'), isFalse);
    expect(posts.single.containsKey('alt_text'), isFalse);
    // E o aviso de "publiquei" saiu, que e o que faz a linha do tempo
    // recarregar em `AbaMural`.
    expect(publicacoesAvisadas, 1);
  });

  testWidgets(
      'ISCA (a) — `Publicar` com o texto VAZIO nao chama o servidor, e diz por '
      'que', (tester) async {
    // Publicacao de foto sem texto nao daria ao leitor de tela nada para
    // anunciar na linha do tempo, e a caixa que o cliente pediu e "escrever uma
    // mensagem, subir uma foto" -- nessa ordem. O servidor cobra o mesmo
    // (`body` com `minLength: 1`), e o `CHECK` do banco cobra de novo.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(tester, camera: camera);

    // O botao nasce DESABILITADO sem texto: `aoTocar` nulo.
    final botao = tester.widget<BotaoPrimario>(
      find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
    );
    expect(
      botao.aoTocar,
      isNull,
      reason:
          'o `Publicar` nasceu habilitado com a caixa vazia: o toque levaria a '
          'um `400` que a tela sabia evitar',
    );

    expect(postsDePublicacao(capturado), isEmpty);
    expect(publicacoesAvisadas, 0);
  });

  testWidgets(
      'ISCA (a) — so ESPACOS nao publica: o `trim` e o que impede o cartao '
      'mudo', (tester) async {
    // Sem o `trim`, "   " passaria por um caractere e a linha do tempo teria um
    // cartao que o leitor de tela anuncia como nada.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.enterText(find.byType(TextField), '      ');
    await tester.pumpAndSettle();

    final botao = tester.widget<BotaoPrimario>(
      find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
    );
    expect(botao.aoTocar, isNull);
    expect(postsDePublicacao(capturado), isEmpty);
  });

  testWidgets(
      'ISCA (a) — 281 caracteres desabilita o `Publicar`, e 280 habilita',
      (tester) async {
    // 280 **nao e escolha da tela**: e o teto que
    // `publication_reports.publication_body` ja cobrava antes de a tabela de
    // publicacoes existir. Um numero diferente aqui faria a copia congelada da
    // denuncia truncar o texto julgado.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.enterText(find.byType(TextField), 'a' * 281);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<BotaoPrimario>(
            find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
          )
          .aoTocar,
      isNull,
    );
    expect(postsDePublicacao(capturado), isEmpty);

    await tester.enterText(find.byType(TextField), 'a' * 280);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<BotaoPrimario>(
            find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
          )
          .aoTocar,
      isNotNull,
      reason: 'o teto e 280 INCLUSIVE, como o `CHECK` do banco',
    );
  });

  testWidgets(
      'ISCA (a) — o campo NAO trunca no teclado: `maxLength` apagaria o que a '
      'pessoa escreveu', (tester) async {
    // `maxLength` do Material TRUNCA, e truncar em silencio apaga texto. O
    // contador diz quanto falta e o `Publicar` e quem recusa -- com o motivo
    // visivel.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    await montarOPublicar(tester, camera: camera);

    await tester.enterText(find.byType(TextField), 'b' * 300);
    await tester.pumpAndSettle();

    final campo = tester.widget<TextField>(find.byType(TextField));
    expect(
      campo.maxLength,
      isNull,
      reason: 'o campo truncaria no teclado e apagaria o que a pessoa escreveu',
    );
    expect(campo.controller?.text.length, 300);
  });

  testWidgets(
      'ISCA (a) — a tela DIZ quem ve, porque nao ha seletor de visibilidade',
      (tester) async {
    // Decisao do cliente: *"se elas forem amigas nao tem problema, o que nao
    // pode e ser publico, sem ter nenhum relacionamento"*. A visibilidade e UMA
    // -- conexao aceita -- e um seletor com uma opcao nao e uma escolha. Sem
    // seletor, a unica forma honesta de a pessoa saber o alcance e **dizer**.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    await montarOPublicar(tester, camera: camera);
    expect(find.text(PublicarNoMural.quemVe), findsOneWidget);
    // E nao ha controle de visibilidade nenhum.
    expect(find.byType(DropdownButton<String>), findsNothing);
    expect(find.byType(Switch), findsNothing);
  });

  testWidgets('ISCA (a) — falha do servidor NAO fecha a tela nem perde o texto',
      (tester) async {
    // Fechar a tela num erro faria a pessoa reescrever tudo -- e, com foto, a
    // faria subir a foto de novo por uma falha que nao foi dela.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(
      tester,
      camera: camera,
      respostaDoPost: () => problema('internal-error', 500),
    );

    await tester.enterText(find.byType(TextField), 'texto que nao pode sumir');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    expect(postsDePublicacao(capturado), hasLength(1));
    expect(publicacoesAvisadas, 0, reason: 'a tela avisou que publicou, e nao publicou');
    // A tela continua montada, com o texto no campo.
    expect(find.byType(PublicarNoMural), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'texto que nao pode sumir',
    );
  });

  // =========================================================================
  // (d) O PADRAO DE FOTO
  // =========================================================================

  testWidgets(
      'ISCA (d) — a foto SOBE NA ESCOLHA, e a intencao sai pela rota da '
      'PUBLICACAO', (tester) async {
    // ISCA 1 (sobe na escolha): em `_escolheu`, mover o
    // `widget.envio.enviar(...)` para `_publicar`. A previa continuaria
    // aparecendo e a tela pareceria certa -- e este caso reprova pelo nome na
    // contagem de requisicoes ao armazenamento ANTES de qualquer `Publicar`.
    //
    // ISCA 2 (o `purpose` pela ROTA): em `_escolheu`, trocar
    // `widget.escrita.intencaoDeFotoDaPublicacao` por
    // `VitrineApi(...).intencaoDeFotoDaVitrine`. As duas funcoes tem assinatura
    // IDENTICA e a troca COMPILA -- foi exatamente ela que gravou
    // `network_event` numa foto de pessoa em 19/10. Este caso reprova pelo nome
    // nos `expect` de caminho.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    // A INTENCAO saiu pela rota da PUBLICACAO...
    expect(
      doCaminho(capturado, '/me/publications/photo-intents'),
      hasLength(1),
      reason:
          'a intencao nao saiu pela rota da publicacao. Se ela saiu pela da '
          'vitrine ou pela da capa de evento, o `purpose` gravado seria outro e '
          'a escrita responderia 404 para esta `upload_id`',
    );
    // ...e NAO pelas outras duas.
    expect(doCaminho(capturado, '/me/showcase/photo-intents'), isEmpty);
    expect(doCaminho(capturado, '/media/network-event-cover-intents'), isEmpty);

    // OS BYTES SUBIRAM, e ANTES de qualquer `Publicar`.
    expect(aoArmazenamento(capturado), hasLength(1));
    expect(camera.vezesQueLeuOsBytes, 1);
    expect(
      postsDePublicacao(capturado),
      isEmpty,
      reason: 'a escolha da foto publicou sozinha: o `Publicar` e a UNICA confirmacao',
    );

    // E a PREVIA e do arquivo LOCAL, por `PreviaDaFoto`.
    expect(find.byType(PreviaDaFoto), findsOneWidget);
  });

  testWidgets(
      'ISCA (d) — o `Publicar` CONFIRMA a foto: o `upload_id` vai no corpo',
      (tester) async {
    // **Nao ha operacao de confirmacao separada no contrato**: o servidor
    // confirma a intencao na MESMA transacao da escrita, e e isso que impede o
    // varredor de recolher a foto dez minutos depois -- o que aconteceu com a
    // foto do achado.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'olha ele');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    final posts = postsDePublicacao(capturado);
    expect(posts, hasLength(1));
    expect(posts.single['body'], 'olha ele');
    expect(
      posts.single['upload_id'],
      uploadDoMural,
      reason:
          'o `upload_id` nao foi no corpo: a foto ficaria orfa no balde e o '
          'varredor a recolheria em dez minutos',
    );
  });

  testWidgets(
      'ISCA (d) — ABANDONAR a tela NAO confirma a foto: nenhuma escrita sai',
      (tester) async {
    // O objeto fica no balde, a intencao vence em 600 s (medido contra a
    // homologacao em 19/10/2026) e o varredor o recolhe. **Nao ha rota de
    // cancelamento de intencao no contrato**, e inventar uma seria inventar
    // rota -- entao o caso prova que nada sai, e nao que algo cancela.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();
    expect(aoArmazenamento(capturado), hasLength(1));

    // Abandona: a arvore e substituida sem passar pelo `Publicar`.
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SizedBox())));
    await tester.pumpAndSettle();

    expect(
      postsDePublicacao(capturado),
      isEmpty,
      reason: 'abandonar a tela publicou alguma coisa',
    );
    expect(publicacoesAvisadas, 0);
    // E nenhuma tentativa de cancelar a intencao: essa rota nao existe.
    expect(
      capturado.where((p) => p.method == 'DELETE'),
      isEmpty,
      reason: 'a tela tentou cancelar a intencao, e nao existe rota para isso',
    );
  });

  testWidgets(
      'ISCA (d) — NAO HA botao separado de salvar foto: o defeito relatado duas '
      'vezes', (tester) async {
    // Com a foto escolhida e enviada, a tela tem **UM** `BotaoPrimario`: o
    // `Publicar`. As portas da foto saem de cena quando ha foto (um
    // `OutlinedButton` de galeria e o `BotaoPrimario` de tirar foto), e no lugar
    // delas fica um `TextButton` de remover -- que nao e confirmacao de nada.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    expect(
      find.byType(BotaoPrimario),
      findsOneWidget,
      reason:
          'apareceu um segundo `BotaoPrimario` com a foto na tela. O padrao de '
          '19/10 e "escolher envia, Publicar confirma", e um botao de salvar '
          'foto e exatamente o defeito que o cliente relatou duas vezes',
    );
    expect(
      find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
      findsOneWidget,
    );
    for (final proibido in <String>['Salvar foto', 'Salvar a foto', 'Enviar foto']) {
      expect(find.text(proibido), findsNothing);
    }
  });

  testWidgets(
      'CONTRAPESO (d) — SEM foto a tela tem DOIS controles de foto e UM '
      '`Publicar`', (tester) async {
    // Sem este contrapeso, o caso de cima passaria num mundo em que a tela nao
    // tem controle de foto NENHUM -- e o cliente pediu "subir uma foto".
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    await montarOPublicar(tester, camera: camera);

    expect(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto), findsOneWidget);
    expect(find.text(PublicarNoMural.escolherDaGaleria), findsOneWidget);
    expect(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar), findsOneWidget);
  });

  testWidgets(
      'ISCA (d) — envio SEM SINAL tira a previa: a tela nao promete foto que '
      'nao existe', (tester) async {
    // Manter um retrato na tela depois de um envio que nao aconteceu e a tela
    // prometendo uma foto que o `Publicar` nao teria o que gravar.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(
      tester,
      camera: camera,
      respostaDoArmazenamento: () async => throw http.ClientException('sem rede'),
    );

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    expect(find.byType(PreviaDaFoto), findsNothing);
    expect(find.text(PublicarNoMural.fotoSemSinal), findsOneWidget);

    // E publicar depois disso manda SO o texto -- nunca um `upload_id` de um
    // envio que nao chegou.
    await tester.enterText(find.byType(TextField), 'so o texto entao');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    final posts = postsDePublicacao(capturado);
    expect(posts, hasLength(1));
    expect(posts.single.containsKey('upload_id'), isFalse);
  });

  testWidgets(
      'ISCA (d) — `alt_text` so vai COM foto, e o campo so nasce com foto',
      (tester) async {
    // O servidor responde `400` com `field: alt_text` para rotulo sem foto, e o
    // `CHECK user_publications_texto_alternativo_pede_imagem` cobra o mesmo.
    // Mandar o par invalido seria a tela produzindo um erro que ela sabia
    // evitar.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    // SEM foto, o campo de descricao NAO existe.
    expect(campoChamado(PublicarNoMural.rotuloDoAlternativo), findsNothing);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    // COM foto, ele existe e e OPCIONAL -- e o `(opcional)` no rotulo desenhado
    // e o que diz isso a quem le, sem a tela precisar de mais uma frase.
    expect(campoChamado(PublicarNoMural.rotuloDoAlternativo), findsOneWidget);
    expect(
      find.text('${PublicarNoMural.rotuloDoAlternativo} (opcional)'),
      findsOneWidget,
    );

    await tester.enterText(find.byType(TextField).first, 'olha ele');
    await tester.enterText(find.byType(TextField).last, 'o Bidu correndo na grama');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    expect(postsDePublicacao(capturado).single['alt_text'], 'o Bidu correndo na grama');
  });

  testWidgets(
      'ISCA (d) — `alt_text` VAZIO nao vai no corpo: `\'\'` bateria no piso de 2',
      (tester) async {
    // O rotulo e opcional, e `''` bateria no piso de 2 caracteres do `CHECK` --
    // um `400` que a tela produziria por nao filtrar o vazio.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'sem descricao');
    await tester.enterText(find.byType(TextField).last, '   ');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    final posts = postsDePublicacao(capturado);
    expect(posts.single.containsKey('alt_text'), isFalse);
    expect(posts.single['upload_id'], uploadDoMural);
  });

  testWidgets(
      'ISCA (d) — `Remover a foto` descarta o `upload_id` e NAO chama a rede',
      (tester) async {
    // Nao ha rota de cancelamento de intencao. Remover a foto e um ato LOCAL: o
    // `upload_id` nao vai no corpo, e a intencao abandonada vence em dez
    // minutos.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();
    final antes = capturado.length;

    await tester.tap(find.text('Remover a foto'));
    await tester.pumpAndSettle();

    expect(capturado.length, antes, reason: 'remover a foto chamou a rede');
    expect(find.byType(PreviaDaFoto), findsNothing);

    await tester.enterText(find.byType(TextField), 'mudei de ideia');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    expect(postsDePublicacao(capturado).single.containsKey('upload_id'), isFalse);
  });

  // =========================================================================
  // O TEXTO E LIVRE, E ESTA TELA NAO JULGA NENHUMA PALAVRA
  // =========================================================================

  testWidgets(
      'ISCA — a tela NAO FILTRA conteudo: o que a pessoa escreve vai como esta',
      (tester) async {
    // Decisao do cliente: *"deixe o texto livre na timeline"* e *"quem modera
    // vai ser o administrador, deve ir para a pagina de backoffice"*. Nao ha
    // lista de palavra, nao ha recusa por conteudo e nao ha aviso de tom.
    //
    // Este caso existe porque ele parece estranho ate a primeira vez em que
    // alguem "melhora" o produto acrescentando um filtro. Ele reprova essa
    // melhoria pelo nome.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    final capturado = await montarOPublicar(tester, camera: camera);

    const bruto = 'seu idiota <script>alert(1)</script> me liga 11 91234-5678';
    await tester.enterText(find.byType(TextField), bruto);
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    expect(
      postsDePublicacao(capturado).single['body'],
      bruto,
      reason:
          'a tela mexeu no texto. O cliente decidiu em 18/10 que a moderacao e '
          'a denuncia mais a fila do painel, e nao um filtro no app',
    );
  });
}
