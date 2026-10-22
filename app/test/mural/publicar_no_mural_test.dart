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
import 'package:bichu/widgets/barra_do_teclado.dart';
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

/// A frase de alcance que SAIU da tela em 22/10/2026, literal.
///
/// Ela mora aqui, e nao em `PublicarNoMural`: a constante foi APAGADA da tela,
/// e um caso que lesse a constante da tela nao compilaria -- ou, pior, passaria
/// a verde no dia em que alguem reintroduzisse a frase com outro nome de
/// constante.
const String fraseDoAlcance =
    'Quem é sua conexão no Bichu vê esta publicação. Quem não é, não vê.';

/// A frase de "foto enviada" que SAIU da tela em 22/10/2026, literal.
const String fraseDaFotoEnviada = 'Foto enviada. Toque em Publicar para concluir.';

/// O rotulo do campo de descricao da foto que SAIU em 22/10/2026, literal.
const String rotuloDaDescricaoDaFoto = 'Descrição da foto';

/// AS TRES FRASES REMOVIDAS, para a varredura de uma vez.
///
/// **A forma `(opcional)` entra na lista por um motivo medido**: `BichuField`
/// com `opcional: true` desenhava `'<rotulo> (opcional)'`, entao procurar so
/// `'Descrição da foto'` acharia ZERO mesmo com o campo de volta na tela.
const List<String> tresFrasesRemovidas = <String>[
  rotuloDaDescricaoDaFoto,
  '$rotuloDaDescricaoDaFoto (opcional)',
  fraseDoAlcance,
  fraseDaFotoEnviada,
];

/// Quantas vezes a tela publicou de verdade, para a isca do `aoPublicar`.
int publicacoesAvisadas = 0;

/// O menor gabarito da casa (design system, secao 13) e o teclado da casa.
///
/// Os MESMOS numeros de `acao_primaria_fora_da_rolagem_test.dart`, e nao
/// numeros novos: a pergunta "a acao primaria e alcancavel" ja tem gabarito
/// nesta casa, e inventar outro mediria outra tela.
const Size aparelhoPequeno = Size(320, 568);
const double tecladoDp = 270;

Future<List<http.Request>> montarOPublicar(
  WidgetTester tester, {
  required CameraEGaleria camera,
  Future<http.Response> Function()? respostaDoArmazenamento,
  http.Response Function()? respostaDoPost,
  Size janela = const Size(420, 2400),
  double teclado = 0,
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
  tester.view.physicalSize = janela;
  tester.view.devicePixelRatio = 1;
  if (teclado > 0) tester.view.viewInsets = FakeViewPadding(bottom: teclado);
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
      'ISCA (22/10 item 5) — a tela NAO DIZ mais quem ve, e continua sem '
      'seletor de visibilidade', (tester) async {
    // Pedido do cliente de 22/10/2026: *"Retire essa descricao quem e sua
    // conexao no bichu ve esta publicacao"*.
    //
    // **O ALCANCE NAO MUDOU**, e e isso que separa este caso de uma regressao:
    // o recorte do servidor continua sendo a conexao aceita, e quem mede isso e
    // `mural/mural_nao_sai_para_quem_nao_tem_relacao_test.dart`. O que saiu foi
    // a tela DIZER o alcance -- e a tela tambem nao ganhou frase nenhuma no
    // lugar, porque compensar o pedido dele com outra redacao seria nao
    // atende-lo.
    //
    // ISCA: devolver a frase ao `build`. Este caso reprova pelo nome.
    final camera = CameraDeTeste(EstadoDaPermissao.concedida);
    await montarOPublicar(tester, camera: camera);

    expect(find.text(fraseDoAlcance), findsNothing);
    // E continua sem controle de visibilidade: a visibilidade e UMA, e um
    // seletor com uma opcao nao e uma escolha. Retirar a FRASE nao abriu porta
    // para um seletor entrar.
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
      'ISCA (22/10 item 1) — o campo de descricao da foto NAO EXISTE, e '
      '`alt_text` nao vai no corpo', (tester) async {
    // Pedido do cliente de 22/10/2026: *"remover a descricao da foto (opcional)
    // da pagina de publicacao do usuario"*.
    //
    // **COM FOTO era o unico estado em que o campo nascia**, entao e com foto
    // que a ausencia tem de ser medida -- um caso sem foto passaria a verde
    // mesmo com o campo de volta.
    //
    // ISCA 1: devolver o `BichuField` de `Descrição da foto` ao `build`. Este
    // caso reprova pelo nome na CONTAGEM de `BichuField`.
    // ISCA 2: voltar a passar `textoAlternativo:` em `_publicar`. Este caso
    // reprova pelo nome na leitura do CORPO -- e nenhuma contagem de widget
    // pegaria essa segunda, que e por isso que as duas medidas estao aqui.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO: a foto esta na tela. Sem ele, "nao achei o campo"
    // poderia ser "a foto nao entrou", e ai o estado medido seria outro.
    expect(
      find.byType(PreviaDaFoto),
      findsOneWidget,
      reason: 'CONTROLE POSITIVO: a foto nao entrou, entao este caso nao esta '
          'medindo o estado em que o campo de descricao nascia',
    );

    // UM campo de texto na tela, e ele e o da MENSAGEM.
    expect(
      find.byType(BichuField),
      findsOneWidget,
      reason: 'nasceu um segundo `BichuField` com a foto na tela: o campo de '
          'descricao da foto voltou',
    );
    expect(campoChamado(PublicarNoMural.rotuloDoCampo), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'olha ele');
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar));
    await tester.pumpAndSettle();

    final posts = postsDePublicacao(capturado);
    expect(posts, hasLength(1));
    // CONTRAPESO: a foto CONTINUA sendo confirmada pelo `Publicar`. Sem ele,
    // este caso passaria num mundo em que a foto deixou de ser enviada.
    expect(posts.single['upload_id'], uploadDoMural);
    expect(
      posts.single.containsKey('alt_text'),
      isFalse,
      reason: 'a tela mandou `alt_text` sem ter campo para a pessoa escrever um',
    );
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

  // =========================================================================
  // AS SEIS MUDANCAS QUE O CLIENTE PEDIU EM 22/10/2026
  // =========================================================================

  testWidgets(
      'ISCA (22/10 itens 1,5,6) — AS TRES FRASES REMOVIDAS nao aparecem, com '
      'CONTROLE POSITIVO da varredura', (tester) async {
    // As tres, nas palavras dele:
    //   1. *"remover a descricao da foto (opcional)"*;
    //   5. *"Retire essa descricao quem e sua conexao no bichu ve esta
    //      publicacao"*;
    //   6. *"Remova a mensagem foto enviada, toque em publicar"*.
    //
    // ISCA: devolver QUALQUER uma das tres ao `build`. Este caso reprova pelo
    // nome, dizendo qual frase voltou.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarOPublicar(tester, camera: camera);

    // ======================= CONTROLE POSITIVO ==============================
    // **Ele vem ANTES das ausencias, e nao depois.** Sem ele, "nao achei" pode
    // ser "nao varri": se a varredura estivesse olhando a arvore errada, as
    // quatro ausencias abaixo passariam a verde numa tela que ainda mostra as
    // tres frases.
    //
    // E o controle usa um texto COM ACENTO de proposito: as tres frases
    // removidas tem `ç` e `ã`, e um caminho de busca que tropeca em acento
    // precisa ser pego aqui -- e nao interpretado como ausencia.
    expect(
      find.text(PublicarNoMural.rotuloDoCampo),
      findsOneWidget,
      reason:
          'CONTROLE POSITIVO: a varredura nao enxerga o rotulo do campo de '
          'texto, que CONTINUA na tela e tem acento. Enquanto ela nao enxerga '
          'o que esta la, nenhuma das ausencias abaixo prova nada.',
    );
    // **Pelo BOTAO, e nao por `find.text`**: `tituloDaTela` e `publicar` sao a
    // mesma palavra, entao `find.text('Publicar')` acha DOIS -- o titulo da
    // `AppBar` e o rotulo do botao. Medido: foi assim que este caso reprovou na
    // primeira execucao.
    expect(
      find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar),
      findsOneWidget,
    );

    // ---- SEM FOTO ---------------------------------------------------------
    for (final frase in tresFrasesRemovidas) {
      expect(
        find.text(frase),
        findsNothing,
        reason: 'a frase removida voltou a tela (sem foto): "$frase"',
      );
    }

    // ---- COM FOTO, e e aqui que duas das tres nasciam ---------------------
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    // CONTROLE POSITIVO do segundo estado: a foto entrou de verdade.
    expect(
      find.byType(PreviaDaFoto),
      findsOneWidget,
      reason: 'CONTROLE POSITIVO: a foto nao entrou, entao este bloco nao esta '
          'medindo o estado em que as frases nasciam',
    );
    for (final frase in tresFrasesRemovidas) {
      expect(
        find.text(frase),
        findsNothing,
        reason: 'a frase removida voltou a tela (com foto): "$frase"',
      );
    }
  });

  testWidgets(
      'ISCA (22/10 item 3) — a ordem e IMAGEM -> TEXTO -> PUBLICAR, medida por '
      'posicao vertical', (tester) async {
    // Pedido dele: *"Ordene melhor essa pagina, primeiro a imagem, depois o
    // campo de texto e por fim o botao publicar"*.
    //
    // ISCA: trocar a ordem dos filhos do `ListView` em `build` -- por exemplo
    // devolver o campo de texto para antes da foto, que era a ordem de 20/10.
    // Este caso reprova pelo nome na comparacao de `dy`.
    //
    // **Mede POSICAO, e nao ordem na lista de filhos**: a ordem no codigo pode
    // ser a certa e o desenho sair trocado (um `Column` reverso, um
    // `verticalDirection`), e e o desenho que a pessoa ve.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarOPublicar(tester, camera: camera);

    Finder oPublicar() =>
        find.widgetWithText(BotaoPrimario, PublicarNoMural.publicar);
    Finder aPorta() =>
        find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto);

    // ---- SEM FOTO: as PORTAS da foto vem antes do campo -------------------
    // Elas estao no lugar da imagem, e por isso a regra vale para elas: e ali
    // que a foto vai aparecer.
    expect(
      tester.getTopLeft(aPorta()).dy,
      lessThan(tester.getTopLeft(find.byType(BichuField)).dy),
      reason: 'sem foto, os controles de foto nao estao ANTES do campo de texto',
    );
    expect(
      tester.getTopLeft(find.byType(BichuField)).dy,
      lessThan(tester.getTopLeft(oPublicar()).dy),
      reason: 'sem foto, o campo de texto nao esta ANTES do `Publicar`',
    );

    // ---- COM FOTO: a PREVIA vem antes do campo ---------------------------
    await tester.tap(aPorta());
    await tester.pumpAndSettle();

    final dyPrevia = tester.getTopLeft(find.byType(PreviaDaFoto)).dy;
    final dyCampo = tester.getTopLeft(find.byType(BichuField)).dy;
    final dyPublicar = tester.getTopLeft(oPublicar()).dy;

    expect(
      dyPrevia,
      lessThan(dyCampo),
      reason: 'a IMAGEM nao esta antes do campo de texto. O cliente pediu '
          '"primeiro a imagem, depois o campo de texto"',
    );
    expect(
      dyCampo,
      lessThan(dyPublicar),
      reason: 'o campo de texto nao esta antes do `Publicar`. O cliente pediu '
          '"por fim o botao publicar"',
    );
  });

  testWidgets(
      'ISCA (22/10 item 2) — a previa sai na PROPORCAO em que a publicacao e '
      'cortada (1:1), e o ponto focal nao muda', (tester) async {
    // Pedido dele: *"Implementar recurso para o usuario posicionar melhor a
    // foto e evitar que corte a imagem do usuario"*.
    //
    // **O QUE ESTE CASO MEDE, e o que ele NAO mede.** A publicacao sai 1:1
    // (`DERIVADAS_DA_PUBLICACAO` = `{largura: 1024, altura: 1024}`, e `altura`
    // presente vale `fit: cover`), e a linha do tempo desenha 1:1. A previa
    // desta tela era de largura cheia por 300 dp -- **um enquadramento que nao
    // e o publicado** -- e escondia da pessoa exatamente o que o quadrado ia
    // cortar. Agora ela e o mesmo quadrado.
    //
    // Ele NAO mede a pessoa ESCOLHENDO a regiao: essa parte nao existe no
    // produto, e o relatorio diz por que (o `recorte` do servidor nao tem
    // caminho de contrato nem de persistencia para a publicacao).
    //
    // ISCA: devolver a altura fixa de 300 a previa. Este caso reprova pelo nome
    // na comparacao largura/altura.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarOPublicar(tester, camera: camera);

    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    final quadro = tester.getSize(find.byType(PreviaDaFoto));
    expect(
      quadro.width,
      greaterThan(0),
      reason: 'CONTROLE POSITIVO: a previa tem largura zero, entao a razao '
          'abaixo nao mede enquadramento nenhum',
    );
    expect(
      quadro.height,
      closeTo(quadro.width / PublicarNoMural.proporcaoDaPublicacao, 0.5),
      reason:
          'a previa nao esta na proporcao em que a publicacao sai (1:1). A '
          'pessoa nao ve o que o servidor vai cortar, que e a reclamacao de '
          '20/10 ("a maioria esta cortando informacao relevante")',
    );

    // ---- O PONTO FOCAL NAO MUDOU, e isso e MEDIDO e nao suposto -----------
    // `Alignment(0, -1 / 3)` e das telas de PET (`tela_editar_pet.dart`,
    // `cartao_de_pet.dart`, e mais tres), e existe LA para a foto nao saltar no
    // instante em que a derivada chega -- o ponto focal tem de ser o mesmo nos
    // dois ramos que desenham imagem. Esta tela sempre desenhou no CENTRO, nos
    // dois ramos, e mudar a altura da previa nao e motivo para mexer nisso.
    expect(
      tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto)).pontoFocal,
      Alignment.center,
      reason:
          'o ponto focal desta tela mudou. Se ele passar a diferir entre a foto '
          'escolhida e a derivada, o salto que `PreviaDaFoto.pontoFocal` existe '
          'para evitar volta',
    );
  });

  testWidgets(
      'ISCA (22/10 item 3) — o `Publicar` e ALCANCAVEL com o TECLADO ABERTO, '
      'por RETANGULO dentro da janela', (tester) async {
    // **ALCANCE, e nao "o toque nao lancou".** `tocarSemRolar` usa
    // `warnIfMissed: false`, entao um toque num botao COBERTO "passa" sem
    // excecao nenhuma. Esta tela tem campo de texto corrido, entao o teclado
    // abre de verdade -- e a reordenacao de 22/10 poe o `Publicar` por ULTIMO,
    // que e o lugar mais exposto da tela. A prova e geometrica.
    //
    // =====================================================================
    // O QUE ESTA MEDICAO DESCOBRIU, e esta escrito aqui porque custou caro
    // =====================================================================
    // Com o teclado ABERTO, `BichuField` de texto corrido desenha
    // `BarraDoTeclado` encostada no topo do teclado (48 dp), e esta tela **nao
    // reserva espaco para ela** -- ela nao usa `BarraDeAcaoFixa`, que e a unica
    // peca que le `BarraDoTeclado.alturaEmUso`.
    //
    // MEDIDO neste gabarito, com a lista no fim da rolagem: `Publicar` ocupa
    // y 234..282 e a faixa ocupa y 250..298. **32 dos 48 dp do botao ficam sob
    // a faixa, e o CENTRO dele tambem** -- um `tap` no centro atinge o
    // `Concluir` da faixa, e so nao reprovou calado porque este caso cobra a
    // publicacao no fim. O cabecalho de `barra_do_teclado.dart` previu
    // exatamente isto: *"consertar o teclado cobrindo o `Salvar` produziria a
    // faixa cobrindo o `Salvar`, que e o mesmo defeito com outro nome"*.
    //
    // **Isso NAO e regressao desta mudanca**: o `Publicar` ja era o ultimo
    // filho da lista antes de 22/10, e a sobreposicao ja existia. Nao ha
    // conserto aqui porque reservar a faixa muda COMO a tela se desenha, e
    // isso nao esta entre as seis coisas pedidas.
    //
    // Entao o caminho medido e o que o produto oferece: a faixa existe para a
    // pessoa FECHAR o teclado, e e depois disso que ela publica.
    //
    // ISCA: trocar o `Publicar` de lugar para dentro de um rodape que nao rola
    // (ou tirar a rolagem da tela). O botao deixa de caber na janela, e este
    // caso reprova pelo nome no retangulo -- e nenhum outro caso deste arquivo
    // reprova, porque todos eles rodam numa janela de 2400 dp.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = await montarOPublicar(
      tester,
      camera: camera,
      janela: aparelhoPequeno,
      teclado: tecladoDp,
    );

    // Com foto na tela: o caso PIOR depois da reordenacao, porque a previa
    // quadrada ocupa quase toda a area visivel e empurra o `Publicar`.
    await tester.tap(find.widgetWithText(BotaoPrimario, PublicarNoMural.tirarFoto));
    await tester.pumpAndSettle();

    // **O CAMPO PRECISA SER ROLADO ATE A VISTA ANTES DE RECEBER TEXTO.**
    //
    // `ListView` nao constroi o que esta fora da viewport, e neste gabarito
    // sobram 298 dp -- a previa quadrada sozinha ocupa quase tudo. Medido: sem
    // esta rolagem o `enterText` estourou `Iterable.single` em
    // `WidgetTester.showKeyboard`, porque `find.byType(TextField)` achou ZERO.
    //
    // **`scrollable:` EXPLICITO**: um `TextField` com foco tem `Scrollable`
    // PROPRIO (o do `EditableText`), e `scrollUntilVisible` sem alvo chama
    // `widget` sobre `find.byType(Scrollable)` -- que acha DOIS e estoura
    // `Bad state: Too many elements`. O `.first` e o do `ListView`.
    final aRolagem = find.byType(Scrollable).first;
    await tester.scrollUntilVisible(
      find.byType(BichuField),
      120,
      scrollable: aRolagem,
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'o momento do dia');
    await tester.pumpAndSettle();

    // ---- CONTROLE POSITIVO: o teclado esta ABERTO de verdade --------------
    // A faixa do teclado so nasce com campo de texto corrido focado E teclado
    // na tela. Se ela nao estiver aqui, este caso nao esta medindo o estado que
    // ele diz medir, e o retangulo abaixo valeria para uma tela sem teclado.
    expect(
      find.text(BarraDoTeclado.rotuloConcluir),
      findsOneWidget,
      reason:
          'CONTROLE POSITIVO: `BarraDoTeclado` nao esta na tela, entao o '
          'teclado nao esta aberto e este caso nao mede alcance com teclado',
    );

    // ---- A PESSOA FECHA O TECLADO PELA FAIXA QUE EXISTE PARA ISSO ---------
    // Este e o caminho do produto, e nao um atalho de teste: `BarraDoTeclado`
    // foi feita porque em campo de texto corrido NAO HA tecla que feche o
    // teclado (e no iOS nao ha botao voltar).
    await tester.tap(find.text(BarraDoTeclado.rotuloConcluir));
    await tester.pumpAndSettle();
    // E o sistema desce o teclado: `viewInsets` e do SISTEMA, e nao da tela.
    tester.view.viewInsets = FakeViewPadding.zero;
    await tester.pumpAndSettle();

    // CONTROLE: a faixa saiu junto com o teclado.
    expect(
      find.text(BarraDoTeclado.rotuloConcluir),
      findsNothing,
      reason: 'a faixa do teclado ficou na tela com o teclado fechado, e ela '
          'continuaria cobrindo o `Publicar`',
    );

    final publicar = find.widgetWithText(FilledButton, PublicarNoMural.publicar);
    await tester.scrollUntilVisible(publicar, 120, scrollable: aRolagem);
    await tester.pumpAndSettle();

    // O que a janela MOSTRA agora: a janela inteira, sem teclado.
    final janela = Rect.fromLTRB(
      0,
      0,
      aparelhoPequeno.width,
      aparelhoPequeno.height,
    );
    final caixa = tester.getRect(publicar);

    expect(
      caixa.top,
      greaterThanOrEqualTo(janela.top),
      reason: 'o `Publicar` ficou ACIMA da area visivel: a pessoa nao o ve',
    );
    expect(
      caixa.bottom,
      lessThanOrEqualTo(janela.bottom),
      reason: 'o `Publicar` ficou ABAIXO da area visivel, fora da janela',
    );
    expect(caixa.left, greaterThanOrEqualTo(janela.left));
    expect(caixa.right, lessThanOrEqualTo(janela.right));

    // E o botao esta VIVO: um retangulo de botao desabilitado nao prova
    // alcance de nada.
    expect(
      tester.widget<FilledButton>(publicar).onPressed,
      isNotNull,
      reason: 'o `Publicar` esta DESABILITADO, entao o retangulo medido acima e '
          'de um botao morto',
    );

    // ---- E O TOQUE CHEGA, e e isso que fecha a prova ----------------------
    // **`warnIfMissed: false` NAO esta aqui para tolerar o toque perdido**: o
    // retangulo acima ja exigiu que o botao esteja na janela, e o `expect` de
    // baixo exige que a PUBLICACAO tenha saido. Toque coberto nao publica, e o
    // caso reprova.
    await tester.tap(publicar, warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(
      postsDePublicacao(capturado),
      hasLength(1),
      reason:
          'o botao estava na janela, habilitado, e o toque nao publicou nada: '
          'alguma coisa esta COBRINDO o `Publicar`',
    );
  });
}
