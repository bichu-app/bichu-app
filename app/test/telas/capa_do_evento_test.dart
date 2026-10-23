// **A CAPA DO EVENTO**, em `Rede` > criar evento.
//
// ===========================================================================
// O BURACO QUE ESTE ARQUIVO FECHA, MEDIDO ANTES DE UMA LINHA SER ESCRITA
// ===========================================================================
// O cliente pediu a foto do evento mais de uma vez, e em 19/10/2026 disse
// qual foto era, literal: *"a foto que eu estou falando para criar do evento e
// a da capa do evento"*.
//
// Medido no worktree antes da mudanca:
//
//     `criar_encontro.dart` pergunta a capa? ............. NAO
//     arquivos de `app/lib` que chamam
//       `createNetworkEventCoverUploadIntent` ........... 0
//     campo `cover_image` no corpo de `corpoDeCriacao` ... ausente
//
// O cabecalho do proprio `criar_encontro.dart` registrava a razao: a capa
// passaria pela porta `CameraEGaleria`, que outra frente estava mexendo. As
// pecas chegaram -- `EnvioParaConfirmarDepois`, `tiposDeFotoAceitosSemHeic` e
// `recusaDeTipoDaFoto` --, e o que faltava era de fato uma chamada de envio.
//
// ===========================================================================
// MEDIDO CONTRA A HOMOLOGACAO (`hml.bichu.app`, commit `458cd005`)
// ===========================================================================
// Conta descartavel em `@exemplo-de-teste.invalid`, e NUNCA a do cliente.
// A cadeia inteira, com status e corpo:
//
//   1. `POST /v1/auth/register` -> **201**, `email_verified: false`
//   2. `POST /v1/media/network-event-cover-intents`
//      `{"content_type":"image/heic","byte_size":244580}` -> **400**
//      `{"type":".../validation-failed", "errors":[{"field":"content_type",
//        "code":"enum","message":"must be equal to one of the allowed
//        values"}]}`
//   3. a mesma rota com `image/jpeg` -> **201**,
//      `fields.key = events/original/qdJO39PNSnUqeRFILHv8hA`,
//      `expires_at = 2026-10-20T02:08:05.419Z` (600 s a frente do pedido)
//   4. `POST` dos bytes ao armazenamento assinado -> **204**
//   5. `POST /v1/network/events` com `cover_image` **sem e-mail confirmado**
//      -> **409** `contact-channel-unverified`, `next_action: verify_email`
//      (o corpo PASSOU a validacao: 409 e nao 400)
//   6. `POST /v1/auth/email-verification` -> **202**; o token sai no log do
//      container (`MAIL_TRANSPORT=log` na VM de homologacao, e nao Postmark);
//      `POST /v1/auth/email-verification/confirm` -> **200**; `GET /v1/me`
//      -> **200** com `email_verified: true`
//   7. `POST /v1/network/events` com a capa -> **201**,
//      `slug: caminhada-de-medicao`, `cover_image_url: null`
//   8. `GET /v1/network/events/caminhada-de-medicao` -> **200** com
//      `cover_image_url = https://img-hml.bichu.app/events/card/pUA_G6ob...jpeg`
//      e `cover_banner_url = https://img-hml.bichu.app/events/banner/wFrk...jpeg`
//
// **O `purpose` desta cadeia e `network_event`**, e a medicao e o PREFIXO: a
// intencao nasce em `events/original/...` e as derivadas em `events/card/` e
// `events/banner/`. No servidor, `kysely-network-repository.ts` grava
// `purpose: 'network_event'` literal e filtra por ele na clausula `WHERE`.
// A rota da VITRINE, por contraste, nasce em `people/original/...` -- os dois
// prefixos sao a cara dos dois propositos, e e por isso que a troca de rota e
// visivel sem abrir o banco.
//
// ===========================================================================
// TODO CASO AQUI E ISCA
// ===========================================================================
// Vacuidade e o defeito recorrente deste repositorio: dez portoes cegos foram
// achados nesta rodada. Nenhum caso daqui mede a presenca de um literal:
// (a) conta requisicoes e le o CORPO da intencao, (b) e (c) leem o corpo do
// `POST` de criacao, (d) conta `BotaoPrimario` por SUBARVORE com contrapeso
// "um e nao zero", e (e) compara a frase da recusa de tipo com a lista de
// tipos que a produz.

import 'dart:async';
import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/telas/rede/criar_encontro.dart';
import 'package:bichu/widgets/bichu_field.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import '../rede/fixtures_da_rede.dart';
import 'ajuda_de_tela.dart';
import 'criar_encontro_test.dart'
    show
        abrirAPorta,
        abrirAgenda,
        campoDoRotulo,
        corpoDoFormulario,
        preencherOMinimo;

/// O host do armazenamento assinado. **Outro host de proposito**: e o que
/// prova que os bytes nao saem pela `ApiClient` -- ela anexaria o token da
/// sessao a um endereco que veio do corpo de uma resposta.
const String armazenamentoDaCapa = 'https://armazenamento.exemplo/capa';

/// O `upload_id` que a intencao da capa devolve.
const String uploadDaCapa = '018f7c1e-9999-7c3d-9e4f-0000000000ca';

/// O que a rede recebeu, guardado.
class CapturadoDaCapa {
  final List<http.Request> pedidos = <http.Request>[];

  Iterable<http.Request> doCaminho(String fim) =>
      pedidos.where((p) => p.url.path.endsWith(fim));

  Iterable<http.Request> aoArmazenamento() =>
      pedidos.where((p) => p.url.toString().startsWith(armazenamentoDaCapa));

  /// Os corpos dos `POST /v1/network/events`, ja decodificados.
  List<Map<String, dynamic>> criacoes() => pedidos
      .where((p) => p.url.path == '/v1/network/events' && p.method == 'POST')
      .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
      .toList();
}

/// A rede da agenda, da intencao da capa, do armazenamento e da criacao.
///
/// **404 em qualquer outra rota**, e nao 200 vazio: uma chamada nao declarada
/// aqui precisa falhar alto em vez de passar por acidente. E e isso que faz
/// (d) valer -- a rota da foto da pessoa e a da vitrine NAO estao aqui, entao
/// a tela que as chamasse levaria 404.
Future<http.Response> Function(http.Request) redeDaCapa({
  required CapturadoDaCapa capturado,
  Future<http.Response> Function()? respostaDoArmazenamento,
  int statusDaIntencao = 201,
}) {
  return (req) async {
    capturado.pedidos.add(req);
    if (req.url.toString().startsWith(armazenamentoDaCapa)) {
      return (respostaDoArmazenamento ?? () async => http.Response('', 204))();
    }
    if (req.url.path.endsWith('/media/network-event-cover-intents')) {
      if (statusDaIntencao != 201) {
        return problema('validation-failed', statusDaIntencao);
      }
      return json200(
        <String, dynamic>{
          'upload_id': uploadDaCapa,
          'method': 'POST',
          'url': armazenamentoDaCapa,
          'fields': <String, String>{'key': 'events/original/abc'},
          'max_bytes': 5 * 1024 * 1024,
        },
        status: 201,
      );
    }
    if (req.url.path == '/v1/network/events' && req.method == 'GET') {
      return json200(pagina(<Map<String, dynamic>>[]));
    }
    if (req.url.path == '/v1/network/events' && req.method == 'POST') {
      return json200(encontroPublico(), status: 201);
    }
    return problema('not-found', 404);
  };
}

/// Abre o formulario de criar evento pela porta real da `Rede`.
Future<void> abrirOFormulario(
  WidgetTester tester, {
  required Future<http.Response> Function(http.Request) rede,
  required CameraEGaleria camera,
}) async {
  await abrirAgenda(tester, rede: rede, camera: camera);
  await abrirAPorta(tester);
}

/// Digita num campo **rolando ate ele primeiro**.
///
/// `ListView` so constroi o que cabe na tela. O bloco da capa entrou ACIMA dos
/// campos (a ordem de leitura entrega a foto antes do texto), e com ele o
/// `Nome do evento` passou a nascer abaixo da dobra numa bancada de 800 x 600:
/// um `enterText` cru estoura `Bad state: No element`, e a falha aponta para o
/// lugar errado. Foi exatamente isso que tirou o chao de sete casos de
/// `criar_encontro_test.dart` quando a porta mudou de forma.
Future<void> digitar(WidgetTester tester, String rotulo, String texto) async {
  final campo = campoDoRotulo(rotulo);
  await rolarAte(tester, campo);
  await tester.enterText(campo, texto);
  await tester.pumpAndSettle();
}

/// Rola o corpo DO FORMULARIO ate [alvo] existir e aparecer.
///
/// **No scrollable do formulario, e nao em `find.byType(Scrollable).first`.**
/// A tela e empilhada sobre a casca de abas, e a arvore tem TRES `Scrollable`
/// montados: `.first` pode ser o da casca, e o `scrollUntilVisible` estoura
/// `Bad state: No element` arrastando a lista errada -- a falha aponta para o
/// lugar errado.
///
/// Positivo desce, negativo sobe. A faixa de recado mora ACIMA dos campos (o
/// motivo vem antes do controle), e o `ensureVisible` de um toque no bloco da
/// capa desce a lista o suficiente para o topo deixar de ser construido:
/// `ListView` so constroi o que cabe na tela, e um `find` sem este passo acha
/// zero por ROLAGEM e nao por ausencia -- que e a forma de portao cego que
/// este repositorio ja pagou dez vezes nesta rodada.
/// Leva o corpo do formulario de volta ao TOPO.
///
/// **Necessario, e nao conveniencia.** O bloco da capa e a faixa de recado
/// moram ACIMA dos campos -- a ordem de leitura entrega a foto e o motivo
/// antes dos controles --, e `ListView` so constroi o que cabe na tela. Depois
/// de preencher a data a lista esta no fim: um `find` ou um `ensureVisible`
/// sobre o botao da galeria acha ZERO por ROLAGEM e nao por ausencia, e
/// estoura `Bad state: No element` apontando para o lugar errado. Essa e
/// exatamente a forma de portao cego que este repositorio pagou dez vezes
/// nesta rodada.
Future<void> voltarAoTopoDoFormulario(WidgetTester tester) async {
  await tester.drag(corpoDoFormulario, const Offset(0, 2000));
  await tester.pumpAndSettle();
}

/// Rola o corpo DO FORMULARIO ate [alvo] aparecer, subindo.
///
/// **No scrollable do formulario, e nao em `find.byType(Scrollable).first`.**
/// A tela e empilhada sobre a casca de abas e a arvore tem TRES `Scrollable`
/// montados: `.first` pode ser o da casca, e o arrasto acerta a lista errada.
Future<void> rolarNoFormulario(WidgetTester tester, Finder alvo) async {
  await voltarAoTopoDoFormulario(tester);
  if (alvo.evaluate().isEmpty) {
    await tester.scrollUntilVisible(alvo, 120, scrollable: corpoDoFormulario);
  }
  await tester.ensureVisible(alvo);
  await tester.pumpAndSettle();
}

/// Escolhe a capa pela galeria, voltando ao topo primeiro.
Future<void> escolherACapa(WidgetTester tester, {bool assentar = true}) async {
  await voltarAoTopoDoFormulario(tester);
  await tester.ensureVisible(find.text('Escolher da galeria'));
  await tester.pumpAndSettle();
  await tester.tap(find.text('Escolher da galeria'));
  if (assentar) {
    await tester.pumpAndSettle();
  } else {
    // `pump` e nao `pumpAndSettle`: o envio esta no ar e nao vai assentar.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
  }
}

/// **`preencherOMinimo` vem de `criar_encontro_test.dart`, e nao e copiado.**
///
/// Ele ja resolve as duas armadilhas que este formulario tem, e as duas
/// custaram caro: os campos sao achados pelo `rotulo` do `BichuField` (o
/// rotulo e um `Text` IRMAO do campo, e `widgetWithText` acha ZERO) e o comeco
/// e escolhido AMANHA (tocar nos dois `OK` escolhe a hora de AGORA, que a tela
/// recusa com `dataNoPassado` -- e com o impedimento de pe `_marcar` sai na
/// primeira linha e nada e enviado). Uma segunda copia dele divergiria na
/// primeira mudanca de campo obrigatorio.

void main() {
  // -------------------------------------------------------------------------
  testWidgets(
      '(a) ISCA — escolher a capa ENVIA os bytes, sem a pessoa pedir',
      (tester) async {
    // ISCA: em `_escolheuACapa` (`app/lib/telas/rede/criar_encontro.dart`),
    // apagar da chamada `escopo.envioDeFoto.enviar(...)` para baixo e deixar
    // so o `setState` que guarda `_capaEscolhida`. Isso restaura o desenho de
    // "a foto fica no aparelho": compila, desenha a previa igual, e este caso
    // reprova pelo nome em `camera.vezesQueLeuOsBytes`.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: capturado),
      camera: camera,
    );

    await escolherACapa(tester);

    expect(
      camera.vezesQueLeuOsBytes,
      1,
      reason: 'REPROVA: a escolha nao leu os bytes do arquivo. Este contador e '
          'o unico que separa "a tela mostrou a previa" de "a tela subiu a '
          'capa", e era ele que marcava 0 antes desta entrega -- a tela nao '
          'perguntava a capa de jeito nenhum.',
    );

    final intencoes =
        capturado.doCaminho('/media/network-event-cover-intents').toList();
    expect(
      intencoes,
      hasLength(1),
      reason: 'REPROVA: a intencao de envio da capa nao saiu na escolha. '
          'Antes desta entrega NENHUM arquivo de `app/lib` chamava '
          '`createNetworkEventCoverUploadIntent`.',
    );
    final corpo = jsonDecode(intencoes.single.body) as Map<String, dynamic>;
    expect(corpo['content_type'], 'image/jpeg');
    expect(corpo['byte_size'], bytesDeFotoDeTeste.length);
    expect(
      corpo.containsKey('purpose'),
      isFalse,
      reason: 'REPROVA: o corpo levou `purpose`. '
          '`NetworkEventCoverIntentInput` e `additionalProperties: false` e '
          'NAO declara o campo: o proposito (`network_event`) e fixado pela '
          'ROTA, e o contrato escreve a razao -- deixar o cliente escolher '
          'seria deixa-lo pedir autorizacao de imagem de produto por uma rota '
          'do app.',
    );
    expect(
      capturado.aoArmazenamento(),
      hasLength(1),
      reason: 'REPROVA: os bytes nao foram ao armazenamento. O backend NAO os '
          'recebe (ADR-0007).',
    );
    // E o conteudo que subiu e o do ARQUIVO, e nao um corpo vazio.
    expect(
      capturado.aoArmazenamento().single.body,
      contains(utf8.decode(bytesDeFotoDeTeste)),
    );

    // **E A ROTA E A DA CAPA, nao a da vitrine nem a da propria pessoa.**
    // As tres funcoes de intencao tem assinatura IDENTICA e a troca compila:
    // foi assim que `network_event` foi gravado numa foto de pessoa nesta
    // mesma rodada. A rede deste arquivo responde 404 as outras duas, entao a
    // troca tambem quebraria o envio -- mas estes dois `expect` dizem qual foi
    // o erro em vez de deixar "o envio falhou".
    expect(
      capturado.doCaminho('/media/my-photo-intents'),
      isEmpty,
      reason: 'REPROVA: a capa do evento pediu autorizacao pela rota da foto '
          'da PROPRIA PESSOA (`user_photo`). Os bytes iriam para o prefixo '
          '`people/` e a capa nunca seria confirmavel pelo encontro.',
    );
    expect(
      capturado.doCaminho('/showcase/photo-intents'),
      isEmpty,
      reason: 'REPROVA: a capa do evento pediu autorizacao pela rota da '
          'VITRINE (`user_showcase`).',
    );

    // E NADA foi criado: escolher a foto nao publica evento.
    expect(capturado.criacoes(), isEmpty);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(a2) ISCA — a previa aparece ANTES de o servidor dizer qualquer coisa, '
      'e ela vem do ARQUIVO LOCAL', (tester) async {
    // ISCA: em `_BlocoDaCapa.build`, trocar `PreviaDaFoto` por `ImagemDaRede`
    // alimentada por uma URL do servidor. Compila -- e o quadro fica vazio,
    // porque a derivada NAO EXISTE neste momento: medido contra a
    // homologacao, `POST /v1/network/events` devolveu 201 com
    // `cover_image_url: null`, e a derivada apareceu depois.
    //
    // O armazenamento fica PENDURADO de proposito: enquanto este `Completer`
    // nao completa, nenhum byte chegou e o servidor nao disse nada. A previa
    // tem de estar na tela ali.
    final pendurado = Completer<http.Response>();
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(
        capturado: capturado,
        respostaDoArmazenamento: () => pendurado.future,
      ),
      camera: camera,
    );

    await escolherACapa(tester, assentar: false);

    expect(
      find.byType(PreviaDaFoto),
      findsOneWidget,
      reason: 'REPROVA: a previa da capa nao esta na tela enquanto os bytes '
          'sobem. "Apresentar como vai ficar" foi a palavra do cliente, e a '
          'derivada do servidor nao existe neste momento.',
    );
    final previa = tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto));
    expect(
      previa.foto?.caminho,
      fotoEscolhidaDeTeste.caminho,
      reason: 'REPROVA: a previa nao esta desenhando o arquivo que a pessoa '
          'acabou de escolher -- o caminho do aparelho, e nao uma URL.',
    );
    // E ela pede `cacheWidth` ao decodificador: `Image.file(..., cacheWidth: n)`
    // embrulha o provedor num `ResizeImage`. Sem isso o `ui.Image` custa a
    // area do ARQUIVO da camera, e nao a do quadro.
    final imagem = tester.widget<Image>(
      find.descendant(
        of: find.byType(PreviaDaFoto),
        matching: find.byType(Image),
      ),
    );
    expect(
      (imagem.image as ResizeImage).width,
      isNotNull,
      reason: 'REPROVA: a previa nao pediu `cacheWidth`. A tela monta um '
          'quadro de 180 dp e o arquivo da camera tem dezenas de megapixels.',
    );

    pendurado.complete(http.Response('', 204));
    await tester.pumpAndSettle();
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(b) ISCA — `Criar evento` CONFIRMA a capa, no MESMO `POST`',
      (tester) async {
    // ISCA: em `_marcar` (mesmo arquivo), trocar `capaUploadId: _uploadDaCapa`
    // por `capaUploadId: null`. Compila, o `POST` continua saindo, o evento
    // continua nascendo -- e a capa nunca entra nele: a intencao vence em
    // 600 s e o varredor a recolhe. Nenhuma verificacao de texto enxerga isso;
    // so a leitura do CORPO do `POST`.
    //
    // A SEGUNDA ISCA DO MESMO CASO: confirmar por uma segunda chamada (um
    // `PATCH` proprio da capa, por exemplo). O `hasLength(1)` do `POST` mais o
    // `isEmpty` dos `PATCH` reprovam, e e o argumento que fez `FotoDoUsuario`
    // ser removida -- dois caminhos de confirmacao da mesma foto divergem na
    // primeira edicao.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: capturado),
      camera: camera,
    );

    await escolherACapa(tester);
    expect(
      capturado.criacoes(),
      isEmpty,
      reason: 'REPROVA: escolher a foto ja criou o evento.',
    );

    // O `alt_text` e OBRIGATORIO quando a capa vai no corpo
    // (`CommunityNetworkEventCoverInput` declara `required: [upload_id,
    // alt_text]`, `minLength: 2`), e o campo so existe com foto escolhida.
    await digitar(
      tester,
      TelaCriarEncontro.rotuloDoTextoDaCapa,
      'Cachorros correndo na grama',
    );
    await preencherOMinimo(tester);

    // O botao mora na BARRA FIXA, que nao rola: `tap` direto.
    await tester.tap(find.text('Criar evento'));
    await tester.pumpAndSettle();

    final corpos = capturado.criacoes();
    expect(
      corpos,
      hasLength(1),
      reason: 'REPROVA: o `Criar evento` nao mandou exatamente um '
          '`POST /v1/network/events`.',
    );
    final capa = corpos.single['cover_image'];
    expect(
      capa,
      isA<Map<String, dynamic>>(),
      reason: 'REPROVA: o corpo da criacao saiu SEM `cover_image`, com uma '
          'capa enviada e confirmada na tela. Era este o estado de antes desta '
          'entrega, e o `upload_id` seria recolhido pelo varredor em 600 s.',
    );
    expect(
      (capa as Map<String, dynamic>)['upload_id'],
      uploadDaCapa,
      reason: 'REPROVA: o corpo nao levou o `upload_id` que a intencao '
          'devolveu.',
    );
    expect(
      capa['alt_text'],
      'Cachorros correndo na grama',
      reason: 'REPROVA: o corpo levou `cover_image` sem `alt_text`. O esquema '
          'declara os DOIS como obrigatorios, e o servidor responde 400 '
          'depois de a pessoa ter esperado o envio inteiro.',
    );

    // **UM caminho de confirmacao, e so um.** Nenhum `PATCH` e nenhuma
    // segunda chamada de confirmacao saiu.
    expect(
      capturado.pedidos.where((p) => p.method == 'PATCH'),
      isEmpty,
      reason: 'REPROVA: a tela confirmou a capa por um segundo caminho. Dois '
          'caminhos de confirmacao da mesma foto divergem na primeira edicao '
          '-- foi o argumento que fez `FotoDoUsuario` sair hoje.',
    );
    // E os bytes subiram UMA vez: nao houve reenvio no `Criar evento`.
    expect(capturado.aoArmazenamento(), hasLength(1));
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(b2) ISCA — sem capa o corpo NAO leva `cover_image`, e o evento nasce '
      'igual', (tester) async {
    // O CONTRAPESO de (b): um `cover_image` presente e vazio, ou com
    // `upload_id: null`, e `400 validation-failed` -- e a capa e OPCIONAL
    // (medido: `CommunityNetworkEventInput` exige
    // `[title, summary, place, starts_at]` e nada mais, e o encontro sem capa
    // sai com `cover_image_url: null`).
    //
    // ISCA: em `corpoDeCriacao` (`app/lib/api/rede_api.dart`), trocar o
    // `if (capaUploadId != null && ...)` por um `cover_image` sempre presente.
    // Compila, e todo evento sem foto passa a levar 400.
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: capturado),
      camera: CameraDeTeste(EstadoDaPermissao.concedida),
    );

    await preencherOMinimo(tester);
    // O botao mora na BARRA FIXA, que nao rola: `tap` direto.
    await tester.tap(find.text('Criar evento'));
    await tester.pumpAndSettle();

    final corpos = capturado.criacoes();
    expect(corpos, hasLength(1));
    expect(
      corpos.single.containsKey('cover_image'),
      isFalse,
      reason: 'REPROVA: o corpo levou `cover_image` sem capa escolhida. O '
          'esquema e `additionalProperties: false` e os dois campos internos '
          'sao obrigatorios: um `cover_image` vazio e 400 em todo evento sem '
          'foto.',
    );
    expect(
      capturado.doCaminho('/media/network-event-cover-intents'),
      isEmpty,
      reason: 'REPROVA: a tela pediu autorizacao de envio sem ninguem ter '
          'escolhido foto. Cada assinatura e uma autorizacao de escrita que '
          'nao se desfaz, e o teto da rota e 20 por hora.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(c) ISCA — abandonar o formulario NAO confirma a capa',
      (tester) async {
    // ISCA: em `_escolheuACapa`, confirmar ali mesmo -- por exemplo criando o
    // evento, ou chamando qualquer gravacao com `destino.uploadId`. Compila, a
    // capa "fica pronta mais rapido", e publica evento de quem so estava
    // olhando o formulario. Este caso reprova pelo nome no `isEmpty` das
    // criacoes.
    //
    // O QUE FICA NO ARMAZENAMENTO: um objeto, por dez minutos. Medido contra a
    // homologacao em 19/10/2026 -- a intencao da capa veio com
    // `expires_at: 2026-10-20T02:08:05.419Z` para um pedido de 01:58:05Z,
    // exatos 600 s --, e o contrato declara que "a intencao que ninguem
    // confirma vence em dez minutos e o varredor a recolhe". **Nao ha rota de
    // cancelamento de intencao no contrato**, e por isso a saida nao chama
    // nada: inventar uma seria inventar rota.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: capturado),
      camera: camera,
    );

    await escolherACapa(tester);

    // Os bytes subiram -- e e justamente por isso que o caso importa.
    expect(capturado.aoArmazenamento(), hasLength(1));

    // E A PESSOA SAI SEM CRIAR.
    GoRouter.of(tester.element(find.byType(TelaCriarEncontro))).pop();
    await tester.pumpAndSettle();

    expect(
      find.byType(TelaCriarEncontro),
      findsNothing,
      reason: 'REPROVA: o formulario nao fechou, e o caso mediria o abandono '
          'sem abandono nenhum.',
    );
    expect(
      capturado.criacoes(),
      isEmpty,
      reason: 'REPROVA: sair do formulario criou o evento. Confirmar a capa e '
          'publicar o evento, e quem nao tocou em `Criar evento` nao pediu '
          'para publicar nada.',
    );
    expect(
      capturado.pedidos.where((p) => p.method == 'DELETE'),
      isEmpty,
      reason: 'REPROVA: a saida tentou cancelar a intencao. NAO HA rota de '
          'cancelamento de intencao no contrato, e a chamada levaria 404; o '
          'varredor recolhe o objeto em 600 s.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(d) ISCA — ha UM botao primario nesta tela, e ele e o `Criar evento`',
      (tester) async {
    // ANCORADO NO WIDGET, e nao num `findsNothing` sobre o literal "Salvar a
    // foto": um botao de volta com outro rotulo -- "Enviar a foto", "Usar esta
    // foto" -- passaria num caso que procurasse a palavra, e seria o mesmo
    // defeito com outro nome.
    //
    // ISCA: devolver ao fim de `_BlocoDaCapa.build` um
    // `BotaoPrimario(rotulo: 'Enviar a foto', ...)`. Compila, e este caso
    // reprova pelo nome na contagem.
    //
    // O CONTRAPESO esta no mesmo caso: "um" e nao "zero". Apagar o `Criar
    // evento` deixaria a tela sem jeito de criar e passaria num caso que so
    // contasse ausencia.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: CapturadoDaCapa()),
      camera: camera,
    );

    // Com capa escolhida: o estado em que um segundo botao apareceria.
    await escolherACapa(tester);
    expect(find.byType(PreviaDaFoto), findsOneWidget);

    final primarios = find.descendant(
      of: find.byType(TelaCriarEncontro),
      matching: find.byType(BotaoPrimario),
    );
    expect(
      primarios,
      findsOneWidget,
      reason: 'REPROVA: a tela tem mais de um `BotaoPrimario` (ou nenhum) com '
          'uma capa escolhida. O segundo seria o `Salvar a foto` que o cliente '
          'mandou tirar do app em 19/10 -- era ele que fazia a pessoa tocar no '
          'botao da barra e ouvir "Nada mudou desde a ultima vez".',
    );
    expect(
      tester.widget<BotaoPrimario>(primarios).rotulo,
      'Criar evento',
      reason: 'REPROVA: o unico botao primario da tela nao e o de criar o '
          'evento.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(e) ISCA — a recusa por TIPO e dita ANTES do envio, e a frase sai da '
      'lista de tipos que a produz', (tester) async {
    // ISCA: em `_escolheuACapa`, trocar `tiposDeFotoAceitosSemHeic` por
    // `tiposDeFotoAceitos` -- a lista da foto de pet, que ACEITA HEIC. A troca
    // e de uma palavra, compila, e empurra a recusa para DEPOIS do envio: a
    // pessoa espera a subida inteira para o servidor responder
    // `400 validation-failed` com `field: content_type, code: enum` -- medido
    // contra a homologacao em 19/10/2026.
    //
    // **A FRASE NAO E COMPARADA COM UM LITERAL ESCRITO AQUI.** Ela e montada
    // de `tiposDeFotoAceitosSemHeic`, entao este caso cobra a AUSENCIA de
    // "HEIC" na frase e a PRESENCA dos tres aceitos. Um caso que comparasse
    // texto por extenso continuaria verde no dia em que o enum mudasse.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: const FotoLocal(
        caminho: '/tmp/do-iphone.heic',
        tipoDeConteudo: 'image/heic',
        tamanhoEmBytes: 27,
      ),
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(capturado: capturado),
      camera: camera,
    );

    await escolherACapa(tester);

    expect(
      camera.vezesQueLeuOsBytes,
      0,
      reason: 'REPROVA: a tela leu os bytes de um arquivo cujo tipo a rota '
          'recusa. Ler os bytes e o primeiro passo do envio, e o ponto da '
          'recusa por tipo e nao gastar a rede da pessoa.',
    );
    expect(
      capturado.doCaminho('/media/network-event-cover-intents'),
      isEmpty,
      reason: 'REPROVA: a intencao saiu com `image/heic`. O enum de '
          '`NetworkEventCoverIntentInput` e `[image/jpeg, image/png, '
          'image/webp]`, e a homologacao responde 400 com '
          '`field: content_type, code: enum`.',
    );
    expect(capturado.aoArmazenamento(), isEmpty);
    expect(
      find.byType(PreviaDaFoto),
      findsNothing,
      reason: 'REPROVA: a tela desenhou a previa de uma foto que ela mesma '
          'recusou -- promete uma capa que nao vai existir.',
    );

    // **ROLAR DE VOLTA PARA O TOPO antes de ler o texto.** O `ensureVisible`
    // do toque desceu a lista, e `ListView` nao constroi o que esta fora da
    // tela: a faixa de recusa mora ACIMA dos campos (o motivo vem antes do
    // controle), e um `find` sem este passo acha zero por rolagem e nao por
    // ausencia -- que e a forma de portao cego que este repositorio ja pagou.
    await rolarNoFormulario(tester, find.textContaining('Esse tipo de imagem'));

    // A FRASE: ela nomeia os tres tipos aceitos por esta rota, e NAO nomeia
    // HEIC. O esperado sai do proprio conjunto do contrato.
    final naTela = tester
        .widgetList<Text>(find.byType(Text))
        .map((t) => t.data ?? '')
        .join(' ');
    expect(
      naTela,
      contains('Esse tipo de imagem não é aceito aqui.'),
      reason: 'REPROVA: a tela recusou a foto em silencio. A pessoa escolheu '
          'um arquivo e nao aconteceu nada.',
    );
    expect(
      naTela,
      isNot(contains('HEIC')),
      reason: 'REPROVA: a frase da recusa oferece HEIC, que e exatamente o '
          'tipo que esta rota NAO aceita. Seria a tela mandando a pessoa '
          'escolher outra vez o mesmo tipo.',
    );
    for (final nome in <String>['JPEG', 'PNG', 'WebP']) {
      expect(
        naTela,
        contains(nome),
        reason: 'REPROVA: a frase da recusa nao nomeia `$nome`, que esta rota '
            'aceita. Recusa que nao diz o que serve manda a pessoa adivinhar.',
      );
    }
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(e2) ISCA — o envio que nao sai TIRA a previa, e o botao de criar nao '
      'promete a capa', (tester) async {
    // ISCA: em `_escolheuACapa`, no ramo `DesfechoDoEnvio.recusada`, manter
    // `_capaEscolhida` em vez de anula-la. Compila, a previa fica bonita na
    // tela -- e o `POST` sai sem `cover_image`, porque `_uploadDaCapa` e nulo.
    // A pessoa publica o evento vendo a foto na tela e o evento nasce sem ela.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(
        capturado: capturado,
        respostaDoArmazenamento: () async => http.Response('', 403),
      ),
      camera: camera,
    );

    // **O FORMULARIO E PREENCHIDO ANTES da escolha**, e a ordem e tecnica e nao
    // de produto: `preencherOMinimo` rola a lista ate o fim para abrir os
    // seletores de data, e dali o bloco da capa -- que mora ACIMA dos campos
    // -- deixa de estar construido. Preencher primeiro deixa o resto do caso
    // partir do topo.
    await preencherOMinimo(tester);
    await escolherACapa(tester);

    expect(
      find.byType(PreviaDaFoto),
      findsNothing,
      reason: 'REPROVA: a previa ficou na tela depois de um envio recusado. O '
          '`Criar evento` nao teria `upload_id` para mandar, e a tela estaria '
          'prometendo uma capa que nao existe.',
    );
    await rolarNoFormulario(tester, find.text(TelaCriarEncontro.capaRecusada));
    expect(
      find.text(TelaCriarEncontro.capaRecusada),
      findsOneWidget,
      reason: 'REPROVA: o envio recusado nao disse nada. A pessoa escolheu a '
          'foto, a previa desapareceu e nenhuma palavra explicou por que.',
    );

    // E o campo do `alt_text` sai junto: ele nao tem o que descrever.
    expect(
      find.byWidgetPredicate(
        (w) =>
            w is BichuField &&
            w.rotulo == TelaCriarEncontro.rotuloDoTextoDaCapa,
      ),
      findsNothing,
      reason: 'REPROVA: o campo da descricao da foto ficou na tela sem foto '
          'nenhuma. Ele e obrigatorio SO quando a capa vai no corpo.',
    );

    // O botao mora na BARRA FIXA, que nao rola: `tap` direto.
    await tester.tap(find.text('Criar evento'));
    await tester.pumpAndSettle();

    expect(
      capturado.criacoes().single.containsKey('cover_image'),
      isFalse,
      reason: 'REPROVA: o corpo levou `cover_image` de um envio que foi '
          'recusado. O `upload_id` de bytes que nao subiram volta '
          '`400 upload_not_usable` sem dizer por que.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(f) ISCA — o botao de criar fica APAGADO enquanto a capa sobe, e o '
      'motivo e dito', (tester) async {
    // ISCA: apagar o `if (_enviandoACapa) return _Impedimento.capaSubindo;` do
    // getter `_impedimento`. Compila, e abre a corrida que nenhum texto
    // enxerga: a pessoa toca em `Criar evento` enquanto os bytes sobem,
    // `_uploadDaCapa` ainda e nulo, e o evento nasce SEM a capa que ela
    // escolheu -- sem uma palavra sobre isso.
    final pendurado = Completer<http.Response>();
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = CapturadoDaCapa();
    await abrirOFormulario(
      tester,
      rede: redeDaCapa(
        capturado: capturado,
        respostaDoArmazenamento: () => pendurado.future,
      ),
      camera: camera,
    );

    await preencherOMinimo(tester);
    await escolherACapa(tester, assentar: false);

    expect(
      tester.widget<BotaoPrimario>(find.byType(BotaoPrimario)).aoTocar,
      isNull,
      reason: 'REPROVA: o `Criar evento` esta tocavel com a capa no ar. Tocar '
          'ali agora publica o evento sem a capa, porque o `upload_id` ainda '
          'nao existe.',
    );
    expect(
      find.text('Espere a foto terminar de subir.'),
      findsOneWidget,
      reason: 'REPROVA: o botao esta apagado e CALADO. Botao desabilitado sem '
          'motivo foi o que custou tempo ao cliente tres vezes num dia.',
    );

    pendurado.complete(http.Response('', 204));
    await tester.pumpAndSettle();

    // E depois do envio o bloqueio vira o do `alt_text`, nao o da subida.
    expect(find.text('Escreva uma descrição para a foto.'), findsOneWidget);
    expect(capturado.criacoes(), isEmpty);
  });
}
