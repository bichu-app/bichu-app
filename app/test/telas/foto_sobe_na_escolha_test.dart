// `Perfil` > `Meus dados`: a foto sobe NA ESCOLHA e e confirmada NO `Salvar`.
//
// ===========================================================================
// O DEFEITO QUE ESTE ARQUIVO FECHA, MEDIDO ANTES DE UMA LINHA SER ESCRITA
// ===========================================================================
// Relato do cliente em 19/10/2026, literal: *"o botao salvar perfil ainda nao
// esta funcionando e nao consigo fazer o upload da foto do usuario"*.
//
// O servidor estava integro -- medido contra `hml.bichu.app` no commit
// `458cd005`, com conta descartavel e pelo CODIGO DESTE APP (`ApiClient`,
// `MeApi`, `EnvioDeFoto`): `PATCH /v1/me` com os sete campos devolveu 200 com
// tudo gravado, a intencao devolveu 201, os bytes 204, a confirmacao 200, e
// `GET /v1/me` 3 s depois trouxe `status: ready` com a derivada.
//
// O defeito era da TELA, e era UM so. Medido no mesmo worktree, antes da
// mudanca, com a pessoa fazendo o que o relato descreve -- escolher a foto e
// tocar no `Salvar`:
//
//     bytes lidos do arquivo ............ 0
//     POST /media/my-photo-intents ...... 0
//     requisicoes ao armazenamento ...... 0
//     PATCH /v1/me ...................... 0
//     texto na tela ..................... "Nada mudou desde a ultima vez."
//
// O envio dependia de um SEGUNDO botao, `Salvar a foto`, no meio do
// formulario. Quem tocava no `Salvar` da barra -- o botao fixo, o unico que
// parece o botao da tela -- recebia "Nada mudou desde a ultima vez" com uma
// previa de foto desenhada logo acima. As duas metades da frase do cliente sao
// esse unico defeito: o salvar nao salvava a foto, e a foto nao subia.
//
// O conserto e o desenho que ele pediu na mesma mensagem: *"remova esse botao
// de salvar foto, quando o usuario fizer o upload de qualquer foto no app, voce
// deve fazer o upload e apresentar como vai ficar de preview, e ao salvar o
// voce salva a foto"*.
//
// ===========================================================================
// TODO CASO AQUI E ISCA, E CADA UM DIZ QUAL LINHA DESLIGAR
// ===========================================================================
// Vacuidade e o defeito recorrente deste repositorio, entao nenhum caso daqui
// mede a presenca de um literal: (a) conta requisicoes, (b) le o WIDGET da
// previa e a largura que ele pede ao decodificador, (c) e (d) leem o corpo do
// PATCH, (e) compara o texto do servidor com o generico da tela, e (f) conta
// `BotaoPrimario` por subarvore em vez de procurar a palavra "Salvar a foto".

import 'dart:async';
import 'dart:convert';

import 'package:bichu/dispositivo/camera_e_galeria.dart';
import 'package:bichu/roteamento/rotas.dart';
import 'package:bichu/telas/perfil/tela_dados_pessoais.dart';
import 'package:bichu/widgets/barra_de_acao_fixa.dart';
import 'package:bichu/widgets/botao_primario.dart';
import 'package:bichu/widgets/imagem_da_rede.dart';
import 'package:bichu/widgets/previa_da_foto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;

import 'ajuda_de_tela.dart';
import 'foto_do_usuario_e_selo_test.dart'
    show Capturado, abrirOsDados, fotoDerivada, me, servidor, uploadId;

/// Os `PATCH /v1/me` que sairam, com o corpo ja decodificado.
List<Map<String, dynamic>> patchesDoMe(Capturado capturado) => capturado.pedidos
    .where((p) => p.url.path == '/v1/me' && p.method == 'PATCH')
    .map((p) => jsonDecode(p.body) as Map<String, dynamic>)
    .toList();

/// A largura que a previa pediu ao DECODIFICADOR, lida do widget.
///
/// `Image.file(..., cacheWidth: n)` embrulha o provedor num `ResizeImage` com
/// `width: n`. Ler isso e o que separa "a tela desenhou a imagem" de "a tela
/// pediu ao decodificador a area do quadro e nao a da camera" -- a diferenca
/// medida e 48.771.072 bytes contra 2.904.768, 16,8x.
int? cacheWidthDaPrevia(WidgetTester tester) {
  final imagem = tester.widget<Image>(
    find.descendant(of: find.byType(PreviaDaFoto), matching: find.byType(Image)),
  );
  final provedor = imagem.image;
  return provedor is ResizeImage ? provedor.width : null;
}

void main() {
  // -------------------------------------------------------------------------
  testWidgets(
      '(a) ISCA — escolher a foto ENVIA os bytes, sem a pessoa pedir',
      (tester) async {
    // ISCA: em `_escolheu` (`app/lib/telas/perfil/tela_dados_pessoais.dart`),
    // apagar da chamada `escopo.envioDeFoto.enviar(...)` para baixo e deixar so
    // o `setState` que guarda `_fotoEscolhida`. Isso restaura o desenho de
    // antes de 19/10 -- compila, desenha a previa igual, e este caso reprova
    // pelo nome em `camera.vezesQueLeuOsBytes`.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(meInicial: me(), capturado: capturado),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();

    expect(
      camera.vezesQueLeuOsBytes,
      1,
      reason: 'REPROVA: a escolha nao leu os bytes do arquivo. Este contador e '
          'o unico que separa "a tela mostrou a previa" de "a tela subiu a '
          'foto", e e exatamente o que marcava 0 no defeito do cliente.',
    );
    expect(
      capturado.doCaminho('/media/my-photo-intents'),
      hasLength(1),
      reason: 'REPROVA: a intencao de envio nao saiu na escolha.',
    );
    final corpo = jsonDecode(
      capturado.doCaminho('/media/my-photo-intents').single.body,
    ) as Map<String, dynamic>;
    expect(corpo['content_type'], 'image/jpeg');
    expect(corpo['byte_size'], fotoEscolhidaDeTeste.tamanhoEmBytes);
    expect(
      corpo.containsKey('purpose'),
      isFalse,
      reason: 'REPROVA: o corpo levou `purpose`. `MyPhotoIntentInput` tem '
          '`additionalProperties: false` e NAO declara o campo: o proposito '
          '(`user_photo`) e fixado pela ROTA. Era uma troca de funcao de '
          'assinatura identica que gravou `network_event` numa foto de pessoa '
          'hoje.',
    );
    expect(
      capturado.aoArmazenamento(),
      hasLength(1),
      reason: 'REPROVA: os bytes nao foram ao armazenamento. O backend NAO os '
          'recebe (ADR-0007).',
    );

    // E A ROTA E A DA PROPRIA PESSOA, nao a da vitrine nem a da capa.
    expect(
      capturado.doCaminho('/showcase/photo-intents'),
      isEmpty,
      reason: 'REPROVA: a foto da propria pessoa pediu autorizacao pela rota '
          'da VITRINE. As duas funcoes tem assinatura identica e a troca '
          'compila -- foi assim que `network_event` foi gravado numa foto de '
          'pessoa nesta mesma rodada.',
    );
    expect(capturado.doCaminho('/media/network-event-cover-intents'), isEmpty);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(b) ISCA — a previa aparece ANTES de o servidor dizer `ready`, e ela '
      'vem do ARQUIVO LOCAL', (tester) async {
    // ISCA: em `_retrato` (mesmo arquivo), trocar o `if (local != null)` que
    // devolve `PreviaDaFoto` por um que espere `remota` -- ou seja, desenhar a
    // foto so quando a URL do servidor existir. Compila, e e o desenho que faz
    // a previa "demorar e parecer travada": `status` nasce `processing` com
    // `url: null`. Este caso reprova pelo nome no `findsOneWidget` da previa.
    //
    // O armazenamento fica PENDURADO de proposito: enquanto este `Completer`
    // nao completa, nenhum byte chegou, nenhuma confirmacao saiu e o servidor
    // nao disse `ready` sobre nada. A previa tem de estar na tela ali.
    final armazenamentoPendurado = Completer<http.Response>();
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(
        meInicial: me(),
        capturado: capturado,
        respostaDoArmazenamento: () => armazenamentoPendurado.future,
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    // `pump` e nao `pumpAndSettle`: o envio esta no ar e nao vai assentar.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(
      find.byType(PreviaDaFoto),
      findsOneWidget,
      reason: 'REPROVA: a previa nao esta na tela enquanto os bytes sobem. A '
          'derivada do servidor NAO existe ainda (`status: processing` nasce '
          'com `url: null`), entao esperar por ela deixa o quadro vazio e a '
          'tela parece travada.',
    );
    final previa = tester.widget<PreviaDaFoto>(find.byType(PreviaDaFoto));
    expect(
      previa.foto?.caminho,
      fotoEscolhidaDeTeste.caminho,
      reason: 'REPROVA: a previa nao esta desenhando o arquivo que a pessoa '
          'acabou de escolher. "Vem do arquivo local" e isto: o caminho do '
          'aparelho, e nao uma URL.',
    );
    expect(
      find.descendant(
        of: find.byType(PreviaDaFoto),
        matching: find.byType(ImagemDaRede),
      ),
      findsNothing,
      reason: 'REPROVA: a previa foi desenhada por `ImagemDaRede`. Ela e a irma '
          'de `PreviaDaFoto` e desenha o que vem do SERVIDOR; usa-la aqui '
          'seria esperar a derivada.',
    );
    expect(
      cacheWidthDaPrevia(tester),
      isNotNull,
      reason: 'REPROVA: a previa nao pediu `cacheWidth` ao decodificador. Sem '
          'ele o `ui.Image` custa a area do ARQUIVO da camera: 48.771.072 '
          'bytes medidos, contra 2.904.768 com `cacheWidth: 984` -- 16,8x.',
    );

    // E o servidor nao disse `ready` sobre nada: a previa nao depende dele.
    expect(patchesDoMe(capturado), isEmpty);

    armazenamentoPendurado.complete(http.Response('', 204));
    await tester.pumpAndSettle();
  });

  // -------------------------------------------------------------------------
  testWidgets('(c) ISCA — o `Salvar` do formulario CONFIRMA a foto',
      (tester) async {
    // ISCA: em `_salvar` (mesmo arquivo), trocar `fotoUpload: fotoParaGravar`
    // por `fotoUpload: null`. Compila, o PATCH continua saindo, a tela continua
    // dizendo "Dados salvos." -- e a foto nunca entra na conta: a intencao
    // vence em dez minutos e o varredor a recolhe. Nenhuma verificacao de texto
    // enxerga isso; so a leitura do CORPO do PATCH.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(
        meInicial: me(),
        meDepoisDoPatch: me(urlDaFoto: fotoDerivada),
        capturado: capturado,
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    expect(patchesDoMe(capturado), isEmpty);

    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    final corpos = patchesDoMe(capturado);
    expect(
      corpos,
      hasLength(1),
      reason: 'REPROVA: o `Salvar` nao mandou exatamente um `PATCH /v1/me`.',
    );
    expect(
      corpos.single['photo_upload_id'],
      uploadId,
      reason: 'REPROVA: o `Salvar` nao levou o `upload_id` que a intencao '
          'devolveu. Era este o defeito do cliente: a tela respondia "Nada '
          'mudou desde a ultima vez" com a foto escolhida na tela.',
    );
    expect(
      find.text('Nada mudou desde a última vez.'),
      findsNothing,
      reason: 'REPROVA: a tela disse que nada mudou com uma foto enviada e nao '
          'confirmada. Esta e a frase EXATA que o cliente viu.',
    );
    expect(find.text('Dados salvos.'), findsOneWidget);
    // E a previa sai: dali em diante quem manda e a derivada do servidor.
    expect(find.byType(PreviaDaFoto), findsNothing);
  });

  // -------------------------------------------------------------------------
  testWidgets('(d) ISCA — abandonar o formulario NAO confirma a foto',
      (tester) async {
    // ISCA: em `_escolheu`, confirmar ali mesmo -- por exemplo chamando
    // `escopo.me.atualizar(fotoUpload: destino.uploadId)` depois do envio.
    // Compila, a foto aparece na conta "mais rapido", e grava cadastro de quem
    // so estava olhando o formulario. Este caso reprova pelo nome no `isEmpty`
    // dos PATCH.
    //
    // O QUE FICA NO ARMAZENAMENTO: um objeto, por dez minutos. Medido contra a
    // homologacao em 19/10/2026 -- `expires_at` veio 599 s a frente do
    // instante do pedido, e o contrato declara "Credenciais de upload, validas
    // por 10 minutos" e "a intencao que ninguem confirma vence em dez minutos e
    // o varredor a recolhe". Nao e lixo permanente, e nao ha rota de
    // cancelamento de intencao no contrato para chamar na saida.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(meInicial: me(), capturado: capturado),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();

    // Os bytes subiram -- e e justamente por isso que o caso importa.
    expect(capturado.aoArmazenamento(), hasLength(1));

    // E A PESSOA SAI SEM SALVAR.
    GoRouter.of(tester.element(find.byType(TelaDadosPessoais))).pop();
    await tester.pumpAndSettle();

    expect(
      find.byType(TelaDadosPessoais),
      findsNothing,
      reason: 'REPROVA: a tela nao fechou, e o caso mediria o abandono sem '
          'abandono nenhum.',
    );
    expect(
      patchesDoMe(capturado),
      isEmpty,
      reason: 'REPROVA: sair do formulario confirmou a foto. Confirmar e '
          'gravar cadastro, e quem nao tocou em `Salvar` nao pediu para gravar '
          'cadastro nenhum.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(e) ISCA — `rejected` mostra o MOTIVO DO SERVIDOR, e nao um generico',
      (tester) async {
    // ISCA: em `_BlocoDaFoto.build`, apagar o `if (recusada && ...)` que
    // desenha `FaixaDeAviso(texto: motivoDaRecusa!)`. Isso restaura o
    // comportamento de antes de 19/10 -- `rejected` tratado IGUAL a sem foto --
    // e este caso reprova pelo nome. A tela continua inteira e sem erro: e o
    // estado que mais parece defeito do app estando o app correto.
    //
    // O TEXTO E O DO SERVIDOR, medido contra a homologacao com um JPEG
    // quebrado de 336 bytes: `rejection_reason` veio "Nao conseguimos ler essa
    // imagem. Ela pode ter chegado incompleta.". Este caso usa um motivo
    // DIFERENTE de qualquer texto do app de proposito: um generico nao passa.
    const motivo = 'Não conseguimos ler essa imagem. Ela pode ter chegado '
        'incompleta.';
    final corpo = me();
    corpo['photo'] = <String, dynamic>{
      'status': 'rejected',
      'url': null,
      'rejection_reason': motivo,
    };

    await abrirOsDados(tester, rede: servidor(meInicial: corpo));
    await tester.pumpAndSettle();

    expect(
      find.text(motivo),
      findsOneWidget,
      reason: 'REPROVA: o motivo que o servidor devolveu nao esta na tela. '
          '`Me.photo.rejection_reason` chega pronto e em portugues, e sem ele '
          'a pessoa ve a previa bonita, depois um quadrado vazio, e nenhuma '
          'palavra sobre o que aconteceu com o arquivo dela.',
    );
    // E NAO o generico do envio: ele e de outra coisa (o envio que nao saiu).
    expect(
      find.textContaining('Escolha outra foto'),
      findsNothing,
      reason: 'REPROVA: a tela trocou o motivo do servidor por um texto nosso. '
          'O generico nao diz que o arquivo chegou incompleto.',
    );
    // A tela continua inteira: recusa nao e falha de leitura.
    expect(find.text('Salvar'), findsOneWidget);
    expect(find.byType(ImagemDaRede), findsNothing);
  });

  // -------------------------------------------------------------------------
  testWidgets(
      '(f) ISCA — ha UM botao primario de salvar, e ele mora na BARRA',
      (tester) async {
    // ANCORADO NO WIDGET, e nao num `findsNothing` sobre o literal
    // "Salvar a foto": um botao de volta com outro rotulo -- "Enviar a foto",
    // "Guardar" -- passaria num caso que procurasse a palavra, e seria o mesmo
    // defeito com outro nome.
    //
    // ISCA: devolver ao fim de `_BlocoDaFoto.build` um
    // `BotaoPrimario(rotulo: 'Enviar a foto', ...)`. Compila, e este caso
    // reprova pelo nome na contagem.
    //
    // O CONTRAPESO esta no mesmo caso: "um" e nao "zero". Apagar o `Salvar` da
    // barra deixaria a tela sem jeito de salvar e passaria num caso que so
    // contasse ausencia.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    await abrirOsDados(
      tester,
      rede: servidor(meInicial: me()),
      camera: camera,
    );

    // Com foto escolhida: o estado em que o segundo botao existia.
    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    expect(find.byType(PreviaDaFoto), findsOneWidget);

    final primarios = find.descendant(
      of: find.byType(TelaDadosPessoais),
      matching: find.byType(BotaoPrimario),
    );
    expect(
      primarios,
      findsOneWidget,
      reason: 'REPROVA: a tela tem mais de um `BotaoPrimario` (ou nenhum) com '
          'uma foto escolhida. O segundo era `Salvar a foto`, e era o defeito: '
          'a pessoa tocava no botao fixo da barra e a tela respondia "Nada '
          'mudou desde a ultima vez".',
    );
    expect(
      find.descendant(
        of: find.byType(BarraDeAcaoFixa),
        matching: find.byType(BotaoPrimario),
      ),
      findsOneWidget,
      reason: 'REPROVA: o botao primario que sobrou nao e o da barra fixa. O '
          'unico salvar da tela e o que fica sempre visivel, fora da rolagem.',
    );
    expect(
      tester.widget<BotaoPrimario>(primarios).rotulo,
      'Salvar',
      reason: 'REPROVA: o rotulo do unico botao primario nao e `Salvar`.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets('trocar de foto antes de salvar grava a SEGUNDA, nao a primeira',
      (tester) async {
    // O segundo envio invalida o primeiro. A tela guarda UM `_uploadDaFoto`, e
    // `_escolheu` o zera antes de enviar de novo -- entao o `Salvar` grava o
    // identificador da ultima escolha. O objeto do primeiro envio cai no mesmo
    // expurgo de dez minutos.
    //
    // O duble do servidor devolve um `upload_id` por chamada, para os dois
    // envios serem distinguiveis: um caso com um id fixo passaria sem a tela
    // trocar de identificador nenhum.
    var chamadas = 0;
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: (req) async {
        capturado.pedidos.add(req);
        if (req.url.path.endsWith('/media/my-photo-intents')) {
          chamadas += 1;
          return http.Response(
            jsonEncode(<String, dynamic>{
              'upload_id': 'up-numero-$chamadas',
              'method': 'POST',
              'url': 'https://objetos.exemplo.test/bichu-privado',
              'fields': <String, String>{'key': 'people/original/abc'},
            }),
            201,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }
        if (req.url.toString()
            .startsWith('https://objetos.exemplo.test/bichu-privado')) {
          return http.Response('', 204);
        }
        if (req.url.path == '/v1/me') {
          return http.Response(
            jsonEncode(me()),
            200,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }
        return http.Response('{}', 404,
            headers: <String, String>{'content-type': 'application/json'});
      },
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();

    expect(chamadas, 2, reason: 'REPROVA: a segunda escolha nao pediu uma '
        'autorizacao nova.');
    expect(
      patchesDoMe(capturado).single['photo_upload_id'],
      'up-numero-2',
      reason: 'REPROVA: o `Salvar` gravou o `upload_id` da PRIMEIRA escolha. A '
          'pessoa ve a segunda foto na previa e a conta ficaria com a '
          'primeira.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets('o `Salvar` nao grava pela metade enquanto a foto sobe',
      (tester) async {
    // O `upload_id` so existe depois de os bytes chegarem. Um `Salvar` que
    // passasse por aqui gravaria o resto do cadastro e deixaria a foto de fora
    // sem ninguem saber -- e a pessoa tocaria em `Salvar` de novo achando que
    // a foto entrou.
    final pendurado = Completer<http.Response>();
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: fotoEscolhidaDeTeste,
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(
        meInicial: me(),
        capturado: capturado,
        respostaDoArmazenamento: () => pendurado.future,
      ),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pump();
    await tester.tap(find.text('Salvar'));
    await tester.pump();

    expect(
      patchesDoMe(capturado),
      isEmpty,
      reason: 'REPROVA: o `Salvar` mandou o PATCH com a foto ainda no ar. Sem '
          '`upload_id` ele gravaria o cadastro sem a foto, em silencio.',
    );
    expect(
      find.textContaining('A foto ainda está subindo'),
      findsOneWidget,
      reason: 'REPROVA: a tela nao disse por que o `Salvar` nao fez nada. Um '
          'botao que pisca e nao responde e o defeito que o cliente relatou.',
    );

    pendurado.complete(http.Response('', 204));
    await tester.pumpAndSettle();
  });

  // -------------------------------------------------------------------------
  // A RECUSA POR TIPO, DITA ANTES DO ENVIO
  // -------------------------------------------------------------------------
  // Pedido do coordenador em 19/10/2026: *"a recusa por tipo tem de ser dita
  // ANTES do envio ... se o tipo for recusado, a pessoa tem de ler o motivo
  // antes de esperar um envio que nao vai acontecer"*.
  //
  // ## O QUE FOI MEDIDO, E POR QUE O SELETOR NAO E O PROBLEMA
  //
  // O seletor **nunca entrega HEIC a este app**, nas duas plataformas, e isso
  // foi medido na fonte dos plugins instalados (19/10/2026):
  //
  //  - iOS (`image_picker_ios` 0.8.13+7): `FLTImagePickerMetaDataUtil
  //    .getImageMIMETypeFromImageData` reconhece JPEG (`0xFF`), PNG (`0x89`) e
  //    GIF pelo primeiro byte; HEIC cai em `MIMETypeOther`, e `convertImage`
  //    manda `MIMETypeOther` para `UIImageJPEGRepresentation` -- com o
  //    comentario "converts to JPEG by default" na propria linha. O sufixo cai
  //    em `.jpg`. E e esse o caminho do iPhone de hoje: `PHPicker` chama
  //    `saveImageWithOriginalImageData`.
  //  - Android (`image_picker_android` 0.8.13+23): `ImageResizer
  //    .resizeImageIfNeeded` recodifica sempre que `maxWidth`, `maxHeight` ou
  //    `imageQuality < 100` vem -- e `CameraDoAparelho` passa os tres -- com
  //    `Bitmap.CompressFormat.JPEG` (ou `PNG` quando o bitmap tem alfa).
  //  - E `XFile(path)` nasce SEM `mimeType` nas duas: `cross_file` documenta
  //    "[mimeType] is not inferred from [path]". Entao `fotoLocalDoArquivo`
  //    cai sempre no `image/jpeg` do seu ultimo ramo.
  //
  // Entao a recusa por tipo nao conserta o seletor. Ela existe pelo destino
  // cujo enum do contrato e **mais estreito** que o da foto de pet: a capa do
  // encontro (`NetworkEventCoverIntentInput`, `[image/jpeg, image/png,
  // image/webp]`), que recusa HEIC com `400 validation-failed` -- medido
  // contra `hml.bichu.app` em 19/10/2026. **Essa capa ainda nao sobe por tela
  // nenhuma deste app** (medido: `criar_encontro.dart` nao a pergunta), e e
  // para a frente que a construir que a peca fica pronta e medida.
  test('(g) ISCA — a recusa por tipo nomeia os tipos DO DESTINO', () {
    // ISCA: em `recusaDeTipoDaFoto`
    // (`app/lib/dispositivo/camera_e_galeria.dart`), trocar o corpo por
    // `return null;`. Compila, nenhuma tela muda de desenho, e este caso
    // reprova pelo nome.
    expect(
      recusaDeTipoDaFoto('image/heic', tiposDeFotoAceitosSemHeic),
      isNotNull,
      reason: 'REPROVA: HEIC passou pelo conjunto da CAPA DO ENCONTRO. O enum '
          'do contrato nao o aceita ali, e deixa-lo passar empurraria a falha '
          'para depois do envio -- quando a pessoa ja viu a previa e ja gastou '
          'a rede dela.',
    );
    expect(
      recusaDeTipoDaFoto('image/heic', tiposDeFotoAceitosSemHeic),
      allOf(contains('JPEG'), contains('PNG'), contains('WebP')),
      reason: 'REPROVA: a frase nao diz o que escolher. "Nao aceito" sem a '
          'lista manda a pessoa adivinhar.',
    );
    expect(
      recusaDeTipoDaFoto('image/heic', tiposDeFotoAceitosSemHeic),
      isNot(contains('HEIC')),
      reason: 'REPROVA: a frase ofereceu justamente o tipo que ela acabou de '
          'recusar. Os nomes vem do PROPRIO conjunto, e nao de uma lista '
          'escrita a mao.',
    );

    // CONTRAPESO, e ele e obrigatorio: um `return "nao aceito"` constante
    // passaria nas tres linhas acima e quebraria TODA escolha de foto do app.
    expect(
      recusaDeTipoDaFoto('image/heic', tiposDeFotoAceitos),
      isNull,
      reason: 'REPROVA: HEIC foi recusado no conjunto da FOTO DA PROPRIA '
          'PESSOA, que o aceita -- `MyPhotoIntentInput` tem `image/heic` no '
          'enum, e o cliente autorizou HEIC na entrada em 18/10/2026 '
          'justamente porque metade dos celulares e iPhone.',
    );
    for (final tipo in tiposDeFotoAceitosSemHeic) {
      expect(recusaDeTipoDaFoto(tipo, tiposDeFotoAceitosSemHeic), isNull);
      expect(recusaDeTipoDaFoto(tipo, tiposDeFotoAceitos), isNull);
    }
    // O enum e por IGUALDADE e nunca por prefixo `image/` (D50): `image/`
    // aceitaria `image/svg+xml`, que e documento com script.
    expect(recusaDeTipoDaFoto('image/svg+xml', tiposDeFotoAceitos), isNotNull);
  });

  testWidgets(
      '(h) ISCA — tipo recusado: a tela diz o motivo e NAO sobe nada',
      (tester) async {
    // ISCA: em `_escolheu`, apagar o bloco do `recusaDeTipoDaFoto`. Compila, e
    // a tela volta a gastar a leitura do arquivo e um pedido de rede para
    // receber a recusa depois.
    //
    // **ONDE ESTE ESTADO E ALCANCAVEL HOJE, DITO SEM MAQUIAGEM:** com o
    // seletor de hoje, nao e -- `fotoLocalDoArquivo` so produz os quatro tipos
    // do enum, e os quatro passam. O duble entrega um `FotoLocal` de tipo fora
    // do enum porque o TIPO da porta permite qualquer string, e e por essa
    // porta que a capa do encontro vai entrar quando ela for construida. O
    // caso mede o mecanismo, e nao finge que o seletor o dispara.
    final camera = CameraDeTeste(
      EstadoDaPermissao.concedida,
      foto: const FotoLocal(
        caminho: '/tmp/nina.gif',
        tipoDeConteudo: 'image/gif',
        tamanhoEmBytes: 27,
      ),
    );
    final capturado = Capturado();
    await abrirOsDados(
      tester,
      rede: servidor(meInicial: me(), capturado: capturado),
      camera: camera,
    );

    await tester.tap(find.text('Escolher da galeria'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('não é aceito aqui'),
      findsOneWidget,
      reason: 'REPROVA: a tela nao disse que o tipo nao serve. Sem a frase, a '
          'pessoa espera um envio que nao vai acontecer.',
    );
    expect(
      camera.vezesQueLeuOsBytes,
      0,
      reason: 'REPROVA: a tela leu os bytes de um arquivo cujo tipo o destino '
          'recusa. A recusa tem de ser ANTES do envio, nao depois.',
    );
    expect(capturado.doCaminho('/media/my-photo-intents'), isEmpty);
    expect(capturado.aoArmazenamento(), isEmpty);
    expect(
      find.byType(PreviaDaFoto),
      findsNothing,
      reason: 'REPROVA: a tela desenhou a previa de uma foto que nao vai ser '
          'enviada.',
    );
  });

  // -------------------------------------------------------------------------
  testWidgets('a rota desta tela continua sendo a de `Meus dados`',
      (tester) async {
    // Contrapeso de montagem: todo caso deste arquivo passa por `abrirOsDados`,
    // e se a rota deixasse de abrir a tela eles passariam por nao haver o que
    // medir -- que e exatamente a forma de vacuidade que esta rodada encontrou
    // dez vezes.
    await abrirOsDados(tester, rede: servidor(meInicial: me()));
    expect(find.byType(TelaDadosPessoais), findsOneWidget);
    expect(Rotas.dadosPessoais, isNotEmpty);
  });
}
