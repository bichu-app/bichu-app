// **A VITRINE GANHA FOTO**, em `Perfil` > `Minhas fotos`.
//
// ===========================================================================
// O BURACO QUE ESTE ARQUIVO FECHA, MEDIDO ANTES DE UMA LINHA SER ESCRITA
// ===========================================================================
// O cliente pediu a vitrine em 18/10/2026: *"perfil do usuario com vitrine de
// fotos, parecido com instagram"*. Ela foi construida ate a LEITURA, e parou
// ali. Medido no worktree antes da mudanca:
//
//     `vitrine_de_fotos.dart` e .................... so de leitura
//     chamadores de `VitrineApi.substituir` em
//       `app/lib` e `app/test` .................... 0
//     construcoes de `FotoDaVitrine` em `app/lib` .. 0
//     o estado vazio diz ........................... "Adicione uma foto para
//                                                     começar a sua vitrine."
//     caminho para adicionar ....................... NENHUM
//
// A tela pedia uma foto e nao tinha como receber uma. Isso nao e tela
// incompleta: e tela que promete.
//
// ===========================================================================
// MEDIDO CONTRA A HOMOLOGACAO (`hml.bichu.app`, commit `458cd005`)
// ===========================================================================
// Conta descartavel em `@exemplo-de-teste.invalid`, e NUNCA a do cliente.
//
//   1. `GET /v1/me/showcase` -> **200** `{"photos":[],"max_photos":9}`
//      — **O TETO E 9, e ele vem do servidor.** O contrato o declara duas
//      vezes (`MyShowcase.max_photos` com `enum: [9]` e `photos` com
//      `maxItems: 9`), e o `CHECK` do banco o cobra.
//   2. `POST /v1/me/showcase/photo-intents`
//      `{"content_type":"image/jpeg","byte_size":244580,"width":700,
//        "height":700}` -> **201**
//      `{"upload_id":"01a15704-7802-70bb-a7e2-8a89874df7d1","method":"POST",
//        "url":"https://storage.googleapis.com/bichu-hml-media-private",
//        "fields":{"key":"people/original/jhA9w3MKgA3cK5NpPp72ag",...},
//        "expires_at":"2026-10-20T02:04:33.090Z","max_bytes":5242880}`
//   3. `POST` dos bytes ao armazenamento assinado -> **204**
//   4. `PUT /v1/me/showcase`
//      `{"photos":[{"upload_id":"01a15704-...","alt_text":"Medicao da
//        vitrine"}]}` -> **200**
//      `{"photos":[{"upload_id":"01a15704-...","position":0,
//        "status":"processing","grid_url":null,"open_url":null,
//        "rejection_reason":null,"alt_text":"Medicao da vitrine"}],
//        "max_photos":9}`
//   5. `GET /v1/me/showcase` depois do worker -> **200** com
//      `status: "ready"`,
//      `grid_url: https://img-hml.bichu.app/people/thumb/VGg2vqeP...jpeg`,
//      `open_url: https://img-hml.bichu.app/people/card/pOFgDPi2...jpeg`
//   6. uma segunda foto de 100 x 100 px, pela mesma cadeia -> **200** com
//      `status: "rejected"` e
//      `rejection_reason: "A imagem precisa ter pelo menos 600 x 600 pixels."`
//      — **esta frase e do SERVIDOR**, e e ela que a celula desenha.
//
// **O `purpose` desta cadeia e `user_showcase`**, e a medicao e o PREFIXO: a
// intencao nasce em `people/original/...` e as derivadas em `people/thumb/` e
// `people/card/`. No servidor, `kysely-vitrine.ts` declara
// `PROPOSITO_DA_VITRINE = 'user_showcase' as const` e o cobra na leitura e na
// escrita. A rota da CAPA DO EVENTO, por contraste, nasce em
// `events/original/...` com `purpose: 'network_event'` literal.
//
// **E ESSA E A TROCA QUE O REPOSITORIO JA PAGOU**, em 19/10/2026: a vitrine
// chamava o registrador de capa de encontro e gravava `network_event` numa
// foto de pessoa. As duas funcoes tem assinatura IDENTICA e a troca
// **compilou**. O caso (a) deste arquivo e o que a pega do lado do app.
//
// ===========================================================================
// TODO CASO AQUI E ISCA
// ===========================================================================
// Nenhum caso mede a presenca de um literal: (a) conta requisicoes e le o
// CAMINHO pedido, (b) le o corpo do `PUT`, (c) conta `BotaoPrimario` por
// SUBARVORE com contrapeso "um e nao zero", (d) compara o texto do servidor
// com o generico da tela, e (e) le o widget da previa e o `cacheWidth` dela.

import 'dart:async';
import 'dart:convert';

import 'package:bichu/api/api_client.dart';
import 'package:bichu/config/app_config.dart';
import 'package:bichu/api/envio_de_foto.dart';
import 'package:bichu/api/vitrine_api.dart';
import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/perfil/vitrine_de_fotos.dart';
import 'package:bichu/theme/bichu_theme.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import '../telas/ajuda_de_tela.dart';

/// O host do armazenamento assinado. **Outro host de proposito**: e o que
/// prova que os bytes nao saem pela `ApiClient`, que anexaria o token da
/// sessao a um endereco vindo do corpo de uma resposta.
const String armazenamentoDaVitrine = 'https://armazenamento.exemplo/vitrine';

const String uploadDaVitrine = '018f7c1e-aaaa-7c3d-9e4f-0000000000aa';

/// Um `upload_id` de foto que JA esta na vitrine.
const String uploadQueJaEstava = '018f7c1e-bbbb-7c3d-9e4f-0000000000bb';

const String urlDaGradeDeTeste = 'https://img.exemplo/people/thumb/aaaa.jpeg';

Map<String, dynamic> fotoPronta(String upload, int posicao) =>
    <String, dynamic>{
      'upload_id': upload,
      'position': posicao,
      'status': 'ready',
      'grid_url': urlDaGradeDeTeste,
      'open_url': 'https://img.exemplo/people/card/bbbb.jpeg',
      'rejection_reason': null,
      'alt_text': 'Eu e a Nina',
    };

/// A rede da vitrine: a leitura, a intencao, o armazenamento e o `PUT`.
///
/// **404 em qualquer outra rota.** E e isso que faz o caso (a) valer: a rota
/// da capa do evento e a da foto da propria pessoa NAO estao declaradas aqui,
/// entao a tela que as chamasse levaria 404 -- e os `expect` por caminho dizem
/// qual foi a troca em vez de deixar "o envio falhou".
Future<http.Response> Function(http.Request) redeDaVitrine({
  required List<http.Request> capturado,
  List<Map<String, dynamic>> fotosIniciais = const <Map<String, dynamic>>[],
  int teto = 9,
  Future<http.Response> Function()? respostaDoArmazenamento,
  http.Response Function()? respostaDoPut,
}) {
  return (req) async {
    capturado.add(req);
    if (req.url.toString().startsWith(armazenamentoDaVitrine)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path.endsWith('/me/showcase/photo-intents')) {
      return json200(
        <String, dynamic>{
          'upload_id': uploadDaVitrine,
          'method': 'POST',
          'url': armazenamentoDaVitrine,
          'fields': <String, String>{'key': 'people/original/abc'},
          'max_bytes': 5 * 1024 * 1024,
        },
        status: 201,
      );
    }
    if (req.url.path == '/v1/me/showcase' && req.method == 'GET') {
      return json200(<String, dynamic>{
        'photos': fotosIniciais,
        'max_photos': teto,
      });
    }
    if (req.url.path == '/v1/me/showcase' && req.method == 'PUT') {
      final resposta = respostaDoPut;
      if (resposta != null) return resposta();
      final pedido = jsonDecode(req.body) as Map<String, dynamic>;
      final pedidas = (pedido['photos'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .toList();
      return json200(<String, dynamic>{
        'photos': <Map<String, dynamic>>[
          for (var i = 0; i < pedidas.length; i++)
            fotoPronta(pedidas[i]['upload_id'] as String, i),
        ],
        'max_photos': teto,
      });
    }
    return problema('not-found', 404);
  };
}

/// Os `PUT /v1/me/showcase` que sairam, com o corpo decodificado.
List<Map<String, dynamic>> putsDaVitrine(List<http.Request> capturado) =>
    capturado
        .where((p) => p.url.path == '/v1/me/showcase' && p.method == 'PUT')
        .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
        .toList();

Iterable<http.Request> doCaminho(List<http.Request> capturado, String fim) =>
    capturado.where((p) => p.url.path.endsWith(fim));

Iterable<http.Request> aoArmazenamento(List<http.Request> capturado) =>
    capturado.where(
      (p) => p.url.toString().startsWith(armazenamentoDaVitrine),
    );

/// Monta a tela com a porta de VERDADE (`VitrineApi` sobre `ApiClient`), e nao
/// com um duble de interface.
///
/// **E isso que faz estes casos medirem o CAMINHO pedido.** Um duble de
/// `EscritaDaVitrine` responderia igual para qualquer rota, e o caso (a) --
/// "a vitrine nao chamou o registrador de capa de encontro" -- nao teria o que
/// observar: a troca que o repositorio pagou foi de FUNCAO, com assinatura
/// identica, e so a requisicao que sai a denuncia.
Future<void> montarAVitrine(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  required CameraEGaleria camera,
}) async {
  AppConfig.limparParaTeste();
  final cliente = MockClient(rede);
  // **Um token de verdade, por funcao.** Sem ele `ApiClient` nao anexa
  // `Authorization`, e as tres rotas da vitrine exigem conta -- o caso mediria
  // a tela respondendo 401 em vez de a tela gravando.
  final api = ApiClient(
    config: AppConfig.carregar(apiBaseUrlDeTeste: urlBaseDeTeste),
    cliente: cliente,
    tokenDeAcesso: () async => 'token-de-medicao',
  );
  final porta = VitrineApi(api);
  await tester.pumpWidget(
    MaterialApp(
      theme: BichuTheme.claro,
      home: VitrineDeFotosDoUsuario(
        api: porta,
        escrita: porta,
        camera: camera,
        envio: EnvioDeFoto(camera: camera, cliente: cliente),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  // -------------------------------------------------------------------------
  testWidgets(
      '(a) ISCA — a vitrine ganha foto pelo controle novo, e o `purpose` e '
      '`user_showcase` pela ROTA — nunca a da capa de evento', (tester) async {
    // ISCA 1 (a do buraco): em `_bloco`
    // (`app/lib/telas/perfil/vitrine_de_fotos.dart`), apagar o `OutlinedButton`
    // de `Escolher da galeria` e o `BotaoSecundario` de `Tirar foto`. Isso
    // restaura a tela de antes de 19/10 -- so de leitura, pedindo uma foto que
    // nao tem como receber --, e este caso reprova pelo nome no `tap`.
    //
    // ISCA 2 (a do `purpose`): em `_escolheu`, trocar
    // `widget.escrita.intencaoDeFotoDaVitrine` por
    // `RedeApi(...).intencaoDeCapaDoEncontro`. As duas funcoes tem assinatura
    // IDENTICA e a troca COMPILA -- foi exatamente ela que gravou
    // `network_event` numa foto de pessoa em 19/10. Este caso reprova pelo
    // nome nos dois `expect` de caminho.
    final capturado = <http.Request>[];
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(capturado: capturado),
      camera: camera,
    );

    // O estado vazio pede UMA foto -- e agora ha como dar uma.
    expect(
      find.textContaining('Adicione uma foto'),
      findsOneWidget,
      reason: 'REPROVA: o estado vazio mudou de frase. Este caso existe porque '
          'ele PEDIA uma foto sem haver como adicionar.',
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();

    expect(
      camera.vezesQueLeuOsBytes,
      1,
      reason: 'REPROVA: a escolha nao leu os bytes do arquivo. Este contador e '
          'o unico que separa "a tela mostrou a previa" de "a tela subiu a '
          'foto".',
    );

    // **O CAMINHO, que e o `purpose`.** `ShowcasePhotoIntentInput` nao tem
    // campo `purpose` de proposito: quem o fixa (`user_showcase`) e a rota.
    //
    // **A AUSENCIA DAS OUTRAS DUAS ROTAS VEM PRIMEIRO**, e a ordem e
    // deliberada: a troca de funcao faz a intencao da vitrine nao sair E a da
    // capa sair, e os dois `expect` reprovam. O que nomeia o defeito e este,
    // entao ele e lido antes.
    expect(
      doCaminho(capturado, '/media/network-event-cover-intents'),
      isEmpty,
      reason: 'REPROVA: A VITRINE CHAMOU O REGISTRADOR DE CAPA DE EVENTO. Era '
          'ESTE o defeito consertado em 19/10 -- `purpose = network_event` '
          'gravado numa foto de PESSOA, com os bytes no prefixo `events/` em '
          'vez de `people/`, e nenhuma foto de vitrine podia ser salva. As '
          'duas funcoes tem assinatura identica e a troca COMPILA.',
    );
    expect(
      doCaminho(capturado, '/media/my-photo-intents'),
      isEmpty,
      reason: 'REPROVA: a vitrine pediu autorizacao pela rota da foto UNICA do '
          'perfil (`user_photo`). Sao duas fotos diferentes, com dois '
          'propositos e dois prefixos.',
    );
    final intencoes = doCaminho(capturado, '/me/showcase/photo-intents');
    expect(
      intencoes,
      hasLength(1),
      reason: 'REPROVA: a intencao de envio da vitrine nao saiu na escolha. '
          'Antes desta entrega `VitrineApi.intencaoDeFotoDaVitrine` nao era '
          'chamada em lugar nenhum de `app/lib`.',
    );

    final corpo = jsonDecode(intencoes.single.body) as Map<String, dynamic>;
    expect(corpo['content_type'], 'image/jpeg');
    expect(corpo['byte_size'], bytesDeFotoDeTeste.length);
    expect(
      corpo.containsKey('purpose'),
      isFalse,
      reason: 'REPROVA: o corpo levou `purpose`. O esquema e '
          '`additionalProperties: false` e NAO declara o campo -- o contrato '
          'escreve a razao: deixar o cliente escolher seria deixa-lo pedir '
          'autorizacao de imagem de produto por uma rota de perfil.',
    );
    expect(
      aoArmazenamento(capturado),
      hasLength(1),
      reason: 'REPROVA: os bytes nao foram ao armazenamento. O backend NAO os '
          'recebe (ADR-0007).',
    );

    // **E NADA foi gravado ainda**: o envio sai na escolha, a gravacao sai no
    // `Salvar`.
    expect(putsDaVitrine(capturado), isEmpty);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(b) ISCA — o `Salvar` grava a foto E MANTEM as que ja estavam',
      (tester) async {
    // ISCA 1: em `_salvar`, trocar a lista por
    // `[FotoPedida(uploadId: pendente)]` -- so a foto nova. Compila, a
    // resposta traz a foto nova, a grade a desenha -- e as outras foram
    // APAGADAS: `PUT /me/showcase` e declarativo e manda a vitrine inteira.
    // Um caso que medisse "a foto nova esta na grade" ficaria verde nisso.
    //
    // ISCA 2: inverter a ordem (`[nova, ...jaEstao]`). Compila, e acrescentar
    // uma foto passa a TROCAR A CAPA: a posicao 0 e a capa, e a pessoa pediu
    // para acrescentar, nao para trocar.
    final capturado = <http.Request>[];
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(
        capturado: capturado,
        fotosIniciais: <Map<String, dynamic>>[
          fotoPronta(uploadQueJaEstava, 0),
        ],
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    expect(putsDaVitrine(capturado), isEmpty);

    // `tocar` e nao `tap`: ele chama `ensureVisible` primeiro. O `Salvar` nasce
    // ABAIXO da dobra numa bancada de 800 x 600, e um `tap` cru acerta fora da
    // arvore -- a falha aponta para o lugar errado.
    await tocar(tester, find.text('Salvar'));

    final corpos = putsDaVitrine(capturado);
    expect(
      corpos,
      hasLength(1),
      reason: 'REPROVA: o `Salvar` nao mandou exatamente um '
          '`PUT /v1/me/showcase`.',
    );
    final pedidas = (corpos.single['photos'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .map((f) => f['upload_id'])
        .toList();
    expect(
      pedidas,
      <String>[uploadQueJaEstava, uploadDaVitrine],
      reason: 'REPROVA: o corpo do `PUT` nao e "as que ja estavam, na ordem, e '
          'a nova no fim". `PUT /me/showcase` e DECLARATIVO: ele manda a '
          'vitrine inteira, e `photos: []` tira todas. Mandar so a foto nova '
          'APAGA as outras, e inverter a ordem TROCA A CAPA (posicao 0).',
    );
    expect(
      find.text('Foto salva na sua vitrine.'),
      findsOneWidget,
      reason: 'REPROVA: a gravacao nao disse nada.',
    );
    // A previa local SAI: dali em diante quem manda e a derivada do servidor.
    expect(find.byType(PreviaDaFoto), findsNothing);
    // E a grade cresceu de uma para duas celulas remotas.
    expect(find.byType(ImagemDaRede), findsNWidgets(2));
    // E os bytes subiram UMA vez: o `Salvar` nao reenviou nada.
    expect(aoArmazenamento(capturado), hasLength(1));
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(b2) ISCA — a foto SEM `upload_id` nao entra no corpo do `PUT`',
      (tester) async {
    // `ShowcasePhoto.upload_id` e NULAVEL: ele fica nulo depois que o varredor
    // apagou a intencao -- "a foto fica e deixa de poder ser reordenada por
    // ela", diz o contrato. E `ShowcasePhotoInput.upload_id` e OBRIGATORIO.
    //
    // ISCA: em `_salvar`, apagar o `.where((f) => f.uploadId != null)`.
    // Compila -- e grava `{"upload_id": null}` no corpo, que e
    // `400 validation-failed` sobre a vitrine INTEIRA. A pessoa perde a
    // gravacao por causa de uma foto antiga que ela nem tocou.
    final capturado = <http.Request>[];
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(
        capturado: capturado,
        fotosIniciais: <Map<String, dynamic>>[
          fotoPronta(uploadQueJaEstava, 0),
          // A foto cuja intencao o varredor ja apagou.
          <String, dynamic>{
            'upload_id': null,
            'position': 1,
            'status': 'ready',
            'grid_url': urlDaGradeDeTeste,
            'open_url': null,
            'rejection_reason': null,
            'alt_text': null,
          },
        ],
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    // `tocar` e nao `tap`: ele chama `ensureVisible` primeiro. O `Salvar` nasce
    // ABAIXO da dobra numa bancada de 800 x 600, e um `tap` cru acerta fora da
    // arvore -- a falha aponta para o lugar errado.
    await tocar(tester, find.text('Salvar'));

    final pedidas = (putsDaVitrine(capturado).single['photos'] as List<dynamic>)
        .cast<Map<String, dynamic>>();
    expect(
      pedidas.map((f) => f['upload_id']).toList(),
      <String>[uploadQueJaEstava, uploadDaVitrine],
      reason: 'REPROVA: o corpo do `PUT` levou uma foto sem `upload_id`. '
          '`ShowcasePhotoInput.upload_id` e obrigatorio, e o corpo inteiro '
          'levaria 400 -- a pessoa perderia a gravacao por uma foto antiga.',
    );
    for (final f in pedidas) {
      expect(f.containsKey('upload_id'), isTrue);
      expect(f['upload_id'], isNotNull);
    }
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(c) ISCA — ha UM botao primario na vitrine, e ele so existe quando ha '
      'foto para gravar', (tester) async {
    // ANCORADO NO WIDGET, e nao num `findsNothing` sobre o literal "Salvar a
    // foto": um botao de volta com outro rotulo -- "Enviar a foto", "Guardar"
    // -- passaria num caso que procurasse a palavra.
    //
    // ISDA 1: devolver em `_bloco` um `BotaoPrimario(rotulo: 'Enviar a foto')`
    // ao lado do `Salvar`. Compila, e a contagem reprova.
    //
    // O CONTRAPESO esta no mesmo caso: ZERO antes da foto e UM depois. Um
    // `Salvar` sempre na tela seria um botao que nao faz nada na maior parte
    // do tempo, e apagar o `Salvar` deixaria a foto subida sem jeito de entrar
    // na vitrine -- e passaria num caso que so contasse ausencia.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(capturado: <http.Request>[]),
      camera: camera,
    );

    final primarios = find.descendant(
      of: find.byType(VitrineDeFotosDoUsuario),
      matching: find.byType(BotaoPrimario),
    );
    expect(
      primarios,
      findsNothing,
      reason: 'REPROVA: a vitrine desenha um botao primario sem haver foto '
          'para gravar. Botao que nao faz nada e o defeito que a BICHUS-62 '
          'nomeou.',
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();

    expect(
      primarios,
      findsOneWidget,
      reason: 'REPROVA: com a foto enviada a vitrine tem mais de um '
          '`BotaoPrimario` (ou nenhum). Mais de um seria o `Salvar a foto` que '
          'o cliente mandou tirar do app em 19/10; nenhum deixaria os bytes '
          'no armazenamento sem jeito de entrar na vitrine, e o varredor os '
          'recolheria em dez minutos.',
    );
    expect(tester.widget<BotaoPrimario>(primarios).rotulo, 'Salvar');

    // E a previa esta na tela: "apresentar como vai ficar" foi a palavra dele.
    expect(find.byType(PreviaDaFoto), findsOneWidget);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(d) ISCA — `rejected` mostra o MOTIVO DO SERVIDOR na celula, e nao um '
      'generico', (tester) async {
    // ISCA: em `_imagemDaCelula`, trocar
    // `foto.motivoDaRecusa ?? recadoDeFotoQueNaoAbriu` por so
    // `recadoDeFotoQueNaoAbriu`. Compila, a celula continua dizendo algo -- e
    // a pessoa le "Nao deu para mostrar esta foto" sobre um arquivo que ela
    // pode consertar em dez segundos sabendo o motivo.
    //
    // **O TEXTO E O DO SERVIDOR, e foi MEDIDO**: um JPEG de 100 x 100 subido
    // pela cadeia inteira contra a homologacao em 19/10/2026 voltou
    // `status: "rejected"` com `rejection_reason: "A imagem precisa ter pelo
    // menos 600 x 600 pixels."`. Este caso usa a frase medida, e nenhum texto
    // do app a produz.
    const motivo = 'A imagem precisa ter pelo menos 600 x 600 pixels.';
    final capturado = <http.Request>[];
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(
        capturado: capturado,
        fotosIniciais: <Map<String, dynamic>>[
          <String, dynamic>{
            'upload_id': uploadQueJaEstava,
            'position': 0,
            'status': 'rejected',
            'grid_url': null,
            'open_url': null,
            'rejection_reason': motivo,
            'alt_text': null,
          },
        ],
      ),
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
    );

    expect(
      find.text(motivo),
      findsOneWidget,
      reason: 'REPROVA: o motivo que o servidor devolveu nao esta na tela. '
          '`ShowcasePhoto.rejection_reason` chega pronto e em portugues -- sem '
          'ele a pessoa ve um quadrado vazio e nenhuma palavra sobre o que '
          'aconteceu com o arquivo dela.',
    );
    expect(
      find.text(VitrineDeFotosDoUsuario.recadoDeFotoQueNaoAbriu),
      findsNothing,
      reason: 'REPROVA: a tela trocou o motivo do servidor pelo generico dela. '
          'O generico e de outra coisa -- a imagem que nao CARREGOU --, e nao '
          'diz que o arquivo era pequeno demais.',
    );
    // A tela continua inteira: recusa nao e falha de leitura.
    expect(find.text('Escolher da galeria'), findsOneWidget);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(e) ISCA — a previa vem do ARQUIVO LOCAL e pede `cacheWidth`, e a '
      'grade continua pedindo a derivada de 320', (tester) async {
    // ISCA 1: em `_bloco`, trocar `PreviaDaFoto` por `ImagemDaRede`. Compila,
    // e o quadro fica vazio: a foto nasce `processing` com `grid_url: null` --
    // medido, o `PUT` respondeu 200 com as duas URLs nulas e so o `GET`
    // seguinte trouxe `ready`.
    //
    // ISCA 2: trocar `PreviaDaFoto` por um `Image.file` cru. Compila, desenha
    // igual -- e perde o `cacheWidth`: o `ui.Image` passa a custar a area do
    // ARQUIVO da camera.
    final pendurado = Completer<http.Response>();
    final capturado = <http.Request>[];
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(
        capturado: capturado,
        fotosIniciais: <Map<String, dynamic>>[
          fotoPronta(uploadQueJaEstava, 0),
        ],
        respostaDoArmazenamento: () => pendurado.future,
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    // `pump` e nao `pumpAndSettle`: o envio esta no ar e nao vai assentar.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    final previa = find.byType(PreviaDaFoto);
    expect(
      previa,
      findsOneWidget,
      reason: 'REPROVA: a previa nao esta na tela enquanto os bytes sobem. A '
          'derivada do servidor NAO existe ainda.',
    );
    expect(
      tester.widget<PreviaDaFoto>(previa).foto?.caminho,
      fotoEscolhidaDeTeste.caminho,
      reason: 'REPROVA: a previa nao desenha o arquivo que a pessoa escolheu.',
    );
    final daPrevia = tester.widget<Image>(
      find.descendant(of: previa, matching: find.byType(Image)),
    );
    expect(
      (daPrevia.image as ResizeImage).width,
      isNotNull,
      reason: 'REPROVA: a previa nao pediu `cacheWidth` ao decodificador. Sem '
          'ele o `ui.Image` custa a area do ARQUIVO da camera.',
    );

    // E A GRADE continua pedindo `grid_url`, a derivada de 320 px: 9 fotos
    // custam 135,0 KB com ela contra 3,85 MB com a `card`.
    final remota = tester.widget<Image>(
      find.descendant(
        of: find.byType(ImagemDaRede),
        matching: find.byType(Image),
      ),
    );
    final provedor = (remota.image as ResizeImage).imageProvider as NetworkImage;
    expect(
      provedor.url,
      urlDaGradeDeTeste,
      reason: 'REPROVA: a grade deixou de pedir `grid_url`. A celula tem '
          '104 dp (312 px a 3x), e a derivada de 1024 px e dado demais '
          'multiplicado por nove.',
    );

    pendurado.complete(http.Response('', 204));
    await tester.pumpAndSettle();
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(f) ISCA — com a vitrine CHEIA nao ha controle de adicionar, e o TETO '
      'vem do servidor', (tester) async {
    // ISCA: apagar o ramo `if (cheia)` de `_bloco`. Compila, e o botao leva a
    // `400`: com nove fotos `createShowcasePhotoUploadIntent` responde 400 em
    // vez de assinar, com a razao escrita no contrato -- "assinar a decima
    // seria entregar autorizacao de escrita que a vitrine nunca vai aceitar, e
    // o objeto ficaria no balde ate o varredor passar".
    //
    // **O TETO VEM DA RESPOSTA**, e este caso o prova usando um teto de 3 que
    // nenhuma constante do app conhece -- `MyShowcase.max_photos` e `enum: [9]`
    // hoje, e um numero escrito na tela seria a copia que ninguem atualiza.
    // Medido contra a homologacao: `{"photos":[],"max_photos":9}`.
    final capturado = <http.Request>[];
    await montarAVitrine(
      tester,
      rede: redeDaVitrine(
        capturado: capturado,
        teto: 3,
        fotosIniciais: <Map<String, dynamic>>[
          fotoPronta('018f7c1e-cccc-7c3d-9e4f-00000000000a', 0),
          fotoPronta('018f7c1e-cccc-7c3d-9e4f-00000000000b', 1),
          fotoPronta('018f7c1e-cccc-7c3d-9e4f-00000000000c', 2),
        ],
      ),
      camera: CameraDeTeste(
        EstadoDaPermissao.concedida,
        foto: fotoEscolhidaDeTeste,
      ),
    );

    expect(
      find.text('Escolher da galeria'),
      findsNothing,
      reason: 'REPROVA: a vitrine cheia continua oferecendo como adicionar. O '
          'toque levaria 400 da rota de intencao, e a pessoa nao tem como '
          'saber por que.',
    );
    expect(
      find.text('Tirar foto'),
      findsNothing,
      reason: 'REPROVA: o outro caminho de adicionar ficou na tela com a '
          'vitrine cheia.',
    );
    expect(
      find.textContaining('cheia, com 3 fotos'),
      findsOneWidget,
      reason: 'REPROVA: o teto nao saiu da RESPOSTA. Este caso usa 3, e '
          'nenhuma constante do app conhece esse numero -- o contrato declara '
          '`enum: [9]`. Uma tela com o numero escrito nela e a copia que '
          'ninguem lembra de atualizar.',
    );
    expect(
      doCaminho(capturado, '/me/showcase/photo-intents'),
      isEmpty,
      reason: 'REPROVA: a tela pediu autorizacao de envio com a vitrine cheia.',
    );
  });
}
